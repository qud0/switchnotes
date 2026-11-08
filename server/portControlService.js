/**
 * portControlService.js
 * Сервис управления состоянием и питанием портов коммутаторов (SNR NAG, MikroTik, Cisco, Eltex).
 * Поддерживает:
 * - Включение / Отключение портов (Admin Up / Admin Down, no shutdown / shutdown).
 * - Перезапуск питания PoE (PoE Power Cycle: обесточивание порта на 4 сек и включение).
 * - Отправку команд на физическое оборудование через SNMP v2c SET (ifAdminStatus) и SSH CLI.
 * - Мгновенную синхронизацию со схемой коммутатора в базе данных и аудит действий инженера.
 */

import snmp from 'net-snmp';
import { executeSshCommand } from './backupService.js';

// Standard IF-MIB Admin Status OID
const OID_IF_ADMIN_STATUS_BASE = '1.3.6.1.2.1.2.2.1.7.'; // + ifIndex (1=up, 2=down)

/**
 * Определение имени интерфейса для CLI команд в зависимости от вендора и номера порта
 */
function resolveInterfaceName(vendor = '', port) {
  const v = (vendor || '').toLowerCase();
  const pName = (port.name || '').trim();
  const num = port.number || 1;

  if (v.includes('snr')) {
    // Если имя уже вида GigabitEthernet 1/0/X или Ethernet1/0/X
    if (/^(Ethernet|GigabitEthernet|TenGigabitEthernet)\s*\d+\/\d+\/\d+/i.test(pName)) {
      return pName;
    }
    // Если порт SFP+ (10G)
    if (port.type === 'sfp' && (port.speed === '10G' || num > 24)) {
      return `TenGigabitEthernet 1/0/${num}`;
    }
    return `GigabitEthernet 1/0/${num}`;
  }

  if (v.includes('cisco') || v.includes('eltex')) {
    if (pName.toLowerCase().startsWith('gi') || pName.toLowerCase().startsWith('te') || pName.toLowerCase().startsWith('fa')) {
      return pName;
    }
    return `GigabitEthernet 1/0/${num}`;
  }

  if (v.includes('mikrotik')) {
    return pName || `ether${num}`;
  }

  if (v.includes('ubiquiti') || v.includes('unifi')) {
    return `0/${num}`;
  }

  return pName || `Ethernet1/0/${num}`;
}

/**
 * Выполнение SNMP v2c SET для изменения ifAdminStatus (1=Up, 2=Down)
 */
async function setPortAdminStatusSnmp(switchData, ifIndex, isUp) {
  return new Promise((resolve, reject) => {
    const ip = switchData.ip;
    const community = switchData.snmpWriteCommunity || switchData.snmpCommunity || 'private';
    const port = switchData.snmpPort || 161;

    if (!ip) {
      return reject(new Error('У коммутатора не указан IP-адрес'));
    }

    const session = snmp.createSession(ip, community, {
      port: Number(port),
      retries: 1,
      timeout: 2000,
      version: snmp.Version2c
    });

    const targetOid = OID_IF_ADMIN_STATUS_BASE + ifIndex;
    const varbinds = [
      {
        oid: targetOid,
        type: snmp.ObjectType.Integer,
        value: isUp ? 1 : 2
      }
    ];

    session.set(varbinds, (error, varbinds) => {
      session.close();
      if (error) {
        return reject(error);
      }
      resolve({
        success: true,
        protocol: 'SNMP v2c SET',
        oid: targetOid,
        value: isUp ? 1 : 2
      });
    });
  });
}

/**
 * Главный метод управления портом
 */
export async function controlSwitchPort({
  storage,
  switchId,
  portId,
  action, // 'enable' | 'disable' | 'toggle' | 'poe_cycle'
  credentials = {},
  user = null
}) {
  const sw = storage.getSwitchById(switchId);
  if (!sw) {
    throw new Error('Коммутатор не найден');
  }

  const pIdx = sw.ports.findIndex(p => p.id === portId || p.number === portId);
  if (pIdx === -1) {
    throw new Error(`Порт ${portId} не найден на коммутаторе ${sw.name}`);
  }

  const port = sw.ports[pIdx];
  const vendor = sw.vendor || 'SNR';
  const ifName = resolveInterfaceName(vendor, port);

  let targetEnabled = port.enabled !== false;
  if (action === 'toggle') {
    targetEnabled = !targetEnabled;
  } else if (action === 'enable') {
    targetEnabled = true;
  } else if (action === 'disable') {
    targetEnabled = false;
  }

  const executionLog = [];
  let hardwareApplied = false;
  let hardwareError = null;

  // 1. Выполнение действия на оборудовании
  if (action === 'poe_cycle') {
    // --- ПЕРЕЗАГРУЗКА ПИТАНИЯ POE ---
    if (!port.poe && !sw.poe) {
      throw new Error(`Порт ${ifName} не поддерживает технологию PoE питания.`);
    }

    if (sw.ip) {
      try {
        const v = vendor.toLowerCase();
        let cmdDisable = '';
        let cmdEnable = '';

        if (v.includes('snr')) {
          cmdDisable = `configure terminal\ninterface ${ifName}\npoe disable\nexit\n`;
          cmdEnable = `configure terminal\ninterface ${ifName}\npoe enable\nexit\nwrite\n`;
        } else if (v.includes('cisco')) {
          cmdDisable = `configure terminal\ninterface ${ifName}\npower inline never\nexit\n`;
          cmdEnable = `configure terminal\ninterface ${ifName}\npower inline auto\nexit\nwrite\n`;
        } else if (v.includes('mikrotik')) {
          cmdDisable = `/interface ethernet poe set [find name=${ifName}] poe-out=off\n`;
          cmdEnable = `/interface ethernet poe set [find name=${ifName}] poe-out=auto-on\n`;
        }

        if (cmdDisable && cmdEnable) {
          // Отключаем PoE
          await executeSshCommand({
            host: sw.ip,
            port: credentials.port || sw.sshPort || 22,
            username: credentials.username || sw.sshUsername || 'admin',
            password: credentials.password || sw.sshPassword || '',
            command: cmdDisable,
            timeout: 5000
          });
          executionLog.push(`[1/3] Питание PoE на порту ${ifName} отключено`);

          // Пауза 3.5 секунды для полного разряда емкостей подключенного устройства
          await new Promise(r => setTimeout(r, 3500));
          executionLog.push(`[2/3] Выдержана технологическая пауза (3.5 сек.)`);

          // Включаем PoE обратно
          await executeSshCommand({
            host: sw.ip,
            port: credentials.port || sw.sshPort || 22,
            username: credentials.username || sw.sshUsername || 'admin',
            password: credentials.password || sw.sshPassword || '',
            command: cmdEnable,
            timeout: 5000
          });
          executionLog.push(`[3/3] Питание PoE на порту ${ifName} подано повторно, устройство перезагружается`);
          hardwareApplied = true;
        }
      } catch (err) {
        hardwareError = `Ошибка SSH при сбросе PoE: ${err.message}`;
        executionLog.push(hardwareError);
      }
    } else {
      executionLog.push('Коммутатор не имеет IP-адреса, действие выполнено в симуляторе.');
      hardwareApplied = true;
    }

  } else {
    // --- ВКЛЮЧЕНИЕ / ОТКЛЮЧЕНИЕ ПОРТА (SHUTDOWN / NO SHUTDOWN) ---
    if (sw.ip) {
      // Сначала пробуем быстрый SNMP SET (ifAdminStatus), если SNMP включен
      if (sw.snmpEnabled !== false && (sw.snmpWriteCommunity || sw.snmpCommunity)) {
        try {
          const ifIndex = port.number || 1;
          const snmpRes = await setPortAdminStatusSnmp(sw, ifIndex, targetEnabled);
          executionLog.push(`SNMP v2c SET ifAdminStatus=${snmpRes.value} успешно отправлен`);
          hardwareApplied = true;
        } catch (snmpErr) {
          executionLog.push(`SNMP SET не удался (${snmpErr.message}), пробуем SSH CLI...`);
        }
      }

      // Если SNMP не сработал или не настроен — выполняем по SSH
      if (!hardwareApplied) {
        try {
          const v = vendor.toLowerCase();
          let sshCmd = '';

          if (v.includes('snr')) {
            sshCmd = `configure terminal\ninterface ${ifName}\n${targetEnabled ? 'no shutdown' : 'shutdown'}\nexit\nwrite\n`;
          } else if (v.includes('mikrotik')) {
            sshCmd = `/interface set [find name=${ifName}] disabled=${targetEnabled ? 'no' : 'yes'}\n`;
          } else if (v.includes('cisco') || v.includes('eltex')) {
            sshCmd = `configure terminal\ninterface ${ifName}\n${targetEnabled ? 'no shutdown' : 'shutdown'}\nexit\nwrite\n`;
          } else if (v.includes('ubiquiti') || v.includes('unifi')) {
            sshCmd = `enable\nconfigure\ninterface ${ifName}\n${targetEnabled ? 'no shutdown' : 'shutdown'}\nexit\nwrite memory\n`;
          }

          if (sshCmd) {
            await executeSshCommand({
              host: sw.ip,
              port: credentials.port || sw.sshPort || 22,
              username: credentials.username || sw.sshUsername || 'admin',
              password: credentials.password || sw.sshPassword || '',
              command: sshCmd,
              timeout: 6000
            });
            executionLog.push(`SSH команда «${targetEnabled ? 'no shutdown' : 'shutdown'}» успешно выполнена на ${sw.ip}`);
            hardwareApplied = true;
          }
        } catch (sshErr) {
          hardwareError = `Ошибка SSH: ${sshErr.message}`;
          executionLog.push(hardwareError);
        }
      }
    } else {
      executionLog.push('Коммутатор работает в автономном режиме (без IP), статус сохранен в базе SwitchBook.');
      hardwareApplied = true;
    }
  }

  // 2. Обновление состояния порта в локальной базе данных SwitchBook
  const updatedPortData = {
    enabled: targetEnabled
  };

  // Если отключили — режим визуально disabled
  if (!targetEnabled) {
    updatedPortData.previousMode = port.mode;
    updatedPortData.mode = 'disabled';
  } else if (port.mode === 'disabled') {
    updatedPortData.mode = port.previousMode || 'access';
  }

  const updatedPort = storage.updatePort(switchId, portId, updatedPortData);

  // 3. Добавление записи в журнал аудита
  const actionText = action === 'poe_cycle'
    ? `Сброс питания PoE на порту ${ifName}`
    : targetEnabled ? `Включение порта ${ifName} (no shutdown)` : `Отключение порта ${ifName} (shutdown)`;

  storage.logAction({
    entity: 'switches',
    action: action === 'poe_cycle' ? 'poe_cycle' : targetEnabled ? 'port_enable' : 'port_disable',
    description: `${actionText} на коммутаторе ${sw.name} (${sw.model || sw.vendor})`,
    user: user?.username || 'инженер'
  });

  return {
    success: true,
    action,
    enabled: targetEnabled,
    port: updatedPort,
    hardwareApplied,
    hardwareError,
    interfaceName: ifName,
    log: executionLog,
    message: action === 'poe_cycle'
      ? `Питание PoE на порту ${ifName} успешно перезагружено.`
      : `Порт ${ifName} успешно ${targetEnabled ? 'включен' : 'отключен'}.`
  };
}
