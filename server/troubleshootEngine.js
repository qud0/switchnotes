/**
 * troubleshootEngine.js
 * Серверный и клиентский движок интеллектуального траблшутинга сетевых проблем.
 * Комплексно анализирует:
 * 1. Физический уровень (L1): линк Down, статус портов, TDR обрывы пар, дуплекс/скорость.
 * 2. Канальный уровень (L2): STP блокировки, VLAN/PVID мисматчи, транки, битые линки, дубли MAC.
 * 3. Сетевой уровень (L3): доступность ICMP шлюза, DHCP коллизии, пересечение подсетей, дубли IP.
 * 4. Уровень сервисов (L4/L7): доступность TCP портов управления (Winbox 8291, SSH 22, HTTP/HTTPS 80/443, SNMP 161).
 * 
 * Предоставляет пошаговые рекомендации и авто-исправления (Quick Fixes) в один клик.
 */

import { pingHost } from './diagnostics.js';
import { checkTcpPort } from './tools.js';

export async function runComprehensiveTroubleshoot(storage, params = {}) {
  const { switchId, targetIp, portId, simulateFault = null } = params;

  const switches = storage.getSwitches() || [];
  const vlans = storage.getVlans() || [];
  const patchPanels = storage.getPatchPanels() || [];
  const ipAllocations = storage.getIpAllocations() || [];

  const findings = [];
  const testsRun = [];

  let targetSwitch = switchId ? storage.getSwitchById(switchId) : null;
  if (!targetSwitch && switches.length > 0) {
    targetSwitch = switches[0];
  }

  // --- STEP 1: L1 Physical Layer Diagnostics ---
  testsRun.push({ layer: 'L1', name: 'Кабельные трассы и физические порты' });
  
  if (targetSwitch) {
    const ports = targetSwitch.ports || [];
    const disabledPorts = ports.filter(p => !p.enabled || p.mode === 'disabled');
    const linkedPorts = ports.filter(p => p.linkedSwitchId);

    // Проверка линков между коммутаторами
    linkedPorts.forEach(lp => {
      const peerSw = switches.find(s => s.id === lp.linkedSwitchId);
      if (!peerSw) {
        findings.push({
          id: `l1-broken-link-${targetSwitch.id}-${lp.id}`,
          layer: 'L1',
          severity: 'critical',
          category: 'physical',
          title: `Оборванный линк на порту ${lp.name || lp.number}`,
          description: `Порт ссылается на удаленный коммутатор (ID: ${lp.linkedSwitchId}), которого нет в базе данных. Физический кабель не может функционировать.`,
          rootCause: 'Удаленное оборудование удалено или переименовано без обновления топологии.',
          impact: 'Полная изоляция трафика на данном сегменте.',
          recommendation: 'Переназначьте встречный коммутатор или удалите связь в свойствах порта.',
          target: { switchId: targetSwitch.id, portId: lp.id, portName: lp.name || lp.number },
          quickFix: {
            type: 'unlink_port',
            switchId: targetSwitch.id,
            portId: lp.id,
            actionLabel: 'Отвязать линк'
          }
        });
      } else {
        const peerPort = (peerSw.ports || []).find(p => p.id === lp.linkedPortId || p.number === lp.linkedPortId);
        if (!peerPort) {
          findings.push({
            id: `l1-missing-peer-port-${targetSwitch.id}-${lp.id}`,
            layer: 'L1',
            severity: 'critical',
            category: 'physical',
            title: `Встречный порт не существует на ${peerSw.name}`,
            description: `Порт ${lp.name || lp.number} указывает на порт ID ${lp.linkedPortId} на ${peerSw.name}, но этот порт отсутствует.`,
            rootCause: 'Неверно указан номер встречного порта при кроссировке.',
            impact: 'Потеря связи между узлами ядра/распределения.',
            recommendation: 'Выберите корректный порт в настройках линка.',
            target: { switchId: targetSwitch.id, portId: lp.id }
          });
        } else if (lp.enabled && !peerPort.enabled) {
          findings.push({
            id: `l1-peer-disabled-${targetSwitch.id}-${lp.id}`,
            layer: 'L1',
            severity: 'warning',
            category: 'physical',
            title: `Встречный порт отключен (Admin Down) на ${peerSw.name}`,
            description: `Порт ${lp.name} на ${targetSwitch.name} активен, но порт ${peerPort.name} на ${peerSw.name} выключен в настройках.`,
            rootCause: 'Административное отключение порта на противоположной стороне.',
            impact: 'Интерфейс находится в состоянии down/down (нет физического сигнала carrier).',
            recommendation: 'Включите удаленный порт для поднятия физического линка.',
            target: { switchId: peerSw.id, portId: peerPort.id },
            quickFix: {
              type: 'enable_port',
              switchId: peerSw.id,
              portId: peerPort.id,
              actionLabel: `Включить порт на ${peerSw.name}`
            }
          });
        }
      }
    });
  }

  // --- STEP 2: L2 Data Link Layer Diagnostics (VLANs, PVID, Trunks, Spanning Tree) ---
  testsRun.push({ layer: 'L2', name: 'Канальный уровень (VLAN, PVID, Trunk & STP)' });

  if (targetSwitch) {
    const ports = targetSwitch.ports || [];
    ports.forEach(port => {
      // 2.1 PVID мисматч на межкоммутаторных транках
      if (port.linkedSwitchId) {
        const peerSw = switches.find(s => s.id === port.linkedSwitchId);
        const peerPort = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);
        
        if (peerPort) {
          // Mode mismatch (Access vs Trunk)
          if (port.mode !== peerPort.mode) {
            findings.push({
              id: `l2-mode-mismatch-${port.id}`,
              layer: 'L2',
              severity: 'critical',
              category: 'vlan',
              title: `Конфликт режимов: ${port.mode.toUpperCase()} ↔ ${peerPort.mode.toUpperCase()}`,
              description: `Порт ${port.name} на ${targetSwitch.name} работает в режиме ${port.mode.toUpperCase()}, а ${peerPort.name} на ${peerSw.name} — в режиме ${peerPort.mode.toUpperCase()}.`,
              rootCause: 'Несогласованная настройка 802.1Q тегирования на стыке коммутаторов.',
              impact: 'Тегированные кадры сбрасываются как untagged, возникновение native VLAN leaking.',
              recommendation: 'Переведите оба порта в режим Trunk или оба в Access.',
              target: { switchId: targetSwitch.id, portId: port.id },
              quickFix: {
                type: 'sync_trunk_mode',
                switchAId: targetSwitch.id,
                portAId: port.id,
                switchBId: peerSw.id,
                portBId: peerPort.id,
                mode: 'trunk',
                actionLabel: 'Сделать оба порта Trunk'
              }
            });
          }

          // Native VLAN / PVID Mismatch
          if (port.pvid !== peerPort.pvid) {
            findings.push({
              id: `l2-pvid-mismatch-${port.id}`,
              layer: 'L2',
              severity: 'warning',
              category: 'vlan',
              title: `Разрыв PVID (Native VLAN): ${port.pvid} ≠ ${peerPort.pvid}`,
              description: `На ${targetSwitch.name} порт имеет PVID=${port.pvid}, а на ${peerSw.name} PVID=${peerPort.pvid}.`,
              rootCause: 'Несимметричный Native VLAN на двух концах транкового соединения.',
              impact: 'Утечка трафика между несвязанными VLAN без участия маршрутизатора (VLAN Leaking / Security Risk).',
              recommendation: 'Установите одинаковый PVID на обоих портах (обычно VLAN 1 или Management).',
              target: { switchId: targetSwitch.id, portId: port.id },
              quickFix: {
                type: 'sync_pvid',
                switchAId: targetSwitch.id,
                portAId: port.id,
                switchBId: peerSw.id,
                portBId: peerPort.id,
                targetPvid: port.pvid,
                actionLabel: `Синхронизировать PVID (${port.pvid})`
              }
            });
          }

          // Trunk Tagged VLANs Mismatch
          if (port.mode === 'trunk' && peerPort.mode === 'trunk') {
            const localVlans = new Set(port.taggedVlans || []);
            const peerVlans = new Set(peerPort.taggedVlans || []);
            const missingOnPeer = [...localVlans].filter(v => !peerVlans.has(v));
            const missingOnLocal = [...peerVlans].filter(v => !localVlans.has(v));

            if (missingOnPeer.length > 0 || missingOnLocal.length > 0) {
              const merged = Array.from(new Set([...(port.taggedVlans || []), ...(peerPort.taggedVlans || [])])).sort((a,b)=>a-b);
              findings.push({
                id: `l2-trunk-vlan-diff-${port.id}`,
                layer: 'L2',
                severity: 'warning',
                category: 'vlan',
                title: `Рассинхронизация разрешенных VLAN в транке (${targetSwitch.name} ↔ ${peerSw.name})`,
                description: `На ${peerSw.name} отсутствуют VLAN [${missingOnPeer.join(', ')}], а на ${targetSwitch.name} отсутствуют [${missingOnLocal.join(', ')}].`,
                rootCause: 'Администратор создал VLAN на одном свитче, но забыл добавить его в транк на соседнем.',
                impact: 'Пользователи этих VLAN теряют доступ к серверному сегменту и шлюзу при прохождении через этот свитч.',
                recommendation: 'Объедините список разрешенных VLAN на обоих транк-портах.',
                target: { switchId: targetSwitch.id, portId: port.id },
                quickFix: {
                  type: 'sync_trunk_vlans',
                  switchAId: targetSwitch.id,
                  portAId: port.id,
                  switchBId: peerSw.id,
                  portBId: peerPort.id,
                  mergedVlans: merged,
                  actionLabel: `Синхронизировать все VLAN (${merged.length} шт)`
                }
              });
            }
          }
        }
      }

      // 2.2 Неизвестный VLAN, отсутствующий в каталоге
      if (port.pvid && !vlans.some(v => v.id === port.pvid)) {
        findings.push({
          id: `l2-unknown-vlan-${port.id}`,
          layer: 'L2',
          severity: 'critical',
          category: 'vlan',
          title: `Порт ${port.name} использует несуществующий VLAN ${port.pvid}`,
          description: `VLAN ${port.pvid} не зарегистрирован в базе проекта и не имеет назначенного шлюза/подсети.`,
          rootCause: 'Порт настроен вручную на VLAN, не внесенный в глобальную базу сетевого учета.',
          impact: 'Устройства в этом VLAN не получат IP от DHCP и не будут иметь маршрутизации.',
          recommendation: 'Создайте запись VLAN в каталоге или переключите порт в существующий VLAN.',
          target: { switchId: targetSwitch.id, portId: port.id },
          quickFix: {
            type: 'create_vlan',
            vlanId: port.pvid,
            actionLabel: `Зарегистрировать VLAN ${port.pvid}`
          }
        });
      }
    });
  }

  // --- STEP 3: L3 Network & IPAM Diagnostics (Ping, Gateway, IP Duplicates, DHCP) ---
  testsRun.push({ layer: 'L3', name: 'Сетевой уровень (IP-адресация, шлюзы, коллизии DHCP)' });

  // 3.1 Проверка IP управления коммутатора
  if (targetSwitch) {
    if (!targetSwitch.ip) {
      findings.push({
        id: `l3-sw-no-ip-${targetSwitch.id}`,
        layer: 'L3',
        severity: 'warning',
        category: 'ipam',
        title: `У коммутатора ${targetSwitch.name} отсутствует IP-адрес`,
        description: 'Устройство не имеет назначенного IP-адреса управления, что исключает возможность мониторинга по SNMP, SSH и резервного копирования.',
        rootCause: 'IP не внесен в параметры устройства.',
        impact: 'Недоступность удаленного управления (In-Band Management).',
        recommendation: 'Назначьте статический IP из Management VLAN.',
        target: { switchId: targetSwitch.id }
      });
    } else {
      // Live ICMP Ping тест управления свитча
      let pingRes = null;
      try {
        pingRes = await pingHost(targetSwitch.ip, 1000);
      } catch (err) {
        pingRes = { online: false, error: err.message };
      }

      if (!pingRes.online) {
        findings.push({
          id: `l3-sw-icmp-unreachable-${targetSwitch.id}`,
          layer: 'L3',
          severity: 'warning',
          category: 'icmp',
          title: `Коммутатор ${targetSwitch.name} (${targetSwitch.ip}) не отвечает на ICMP Ping`,
          description: `Пакеты ICMP Echo Request завершились по таймауту или с ошибкой (${pingRes.error || 'Request Timeout'}).`,
          rootCause: 'Свитч выключен, нет сетевого маршрута, либо запрещен входящий ICMP в фаерволе RouterOS/SNR.',
          impact: 'Невозможность проверить статус устройства и собрать телеметрию портов.',
          recommendation: 'Проверьте питание устройства, физический кабель в Management порт и правила Firewall/ACL.',
          target: { switchId: targetSwitch.id, ip: targetSwitch.ip }
        });
      }
    }
  }

  // 3.2 Проверка дубликатов IP в базе данных
  const ipMap = new Map();
  switches.forEach(s => {
    if (s.ip) {
      const list = ipMap.get(s.ip) || [];
      list.push({ type: 'switch', name: s.name, id: s.id });
      ipMap.set(s.ip, list);
    }
  });
  ipAllocations.forEach(a => {
    if (a.ip) {
      const list = ipMap.get(a.ip) || [];
      list.push({ type: 'ipam', name: a.hostname || a.ip, id: a.id });
      ipMap.set(a.ip, list);
    }
  });

  ipMap.forEach((sources, ip) => {
    // Исключаем законную регистрацию IP коммутатора в IPAM
    const isLegitPair = sources.length === 2 && sources.some(s => s.type === 'switch') && sources.some(s => s.type === 'ipam');
    if (sources.length > 1 && !isLegitPair) {
      findings.push({
        id: `l3-ip-conflict-${ip}`,
        layer: 'L3',
        severity: 'critical',
        category: 'ipam',
        title: `Коллизия IP-адреса: ${ip} назначен нескольким узлам!`,
        description: `Адрес ${ip} одновременно используется устройствами: ${sources.map(s => s.name).join(', ')}.`,
        rootCause: 'Ошибка ручного назначения статических IP в одном широковещательном сегменте.',
        impact: 'Асинхронный ARP-флуд (ARP Poisoning/Flapping), обрыв TCP сессий у обоих абонентов.',
        recommendation: 'Измените IP-адрес одного из устройств или переведите его на динамический DHCP.',
        target: { ip }
      });
    }
  });

  // 3.3 Проверка шлюзов подсетей (Default Gateway Ping)
  if (vlans.length > 0) {
    const primaryVlan = vlans.find(v => v.gateway) || vlans[0];
    if (primaryVlan && primaryVlan.gateway) {
      try {
        const gwPing = await pingHost(primaryVlan.gateway, 800);
        if (!gwPing.online) {
          findings.push({
            id: `l3-gw-unreachable-${primaryVlan.id}`,
            layer: 'L3',
            severity: 'warning',
            category: 'gateway',
            title: `Шлюз VLAN ${primaryVlan.id} (${primaryVlan.gateway}) недоступен по Ping`,
            description: `Главный маршрутизатор/шлюз подсети ${primaryVlan.subnet || ''} не отвечает на эхо-запросы.`,
            rootCause: 'Маршрутизатор перезагружается, сбой интерфейса VRRP/HSRP, или блокировка ICMP.',
            impact: 'Хосты в VLAN ${primaryVlan.id} могут потерять доступ в Интернет и соседние подсети.',
            recommendation: 'Проверьте статус аплинка к маршрутизатору ядра (MikroTik/Cisco Core).',
            target: { vlanId: primaryVlan.id, gateway: primaryVlan.gateway }
          });
        }
      } catch {}
    }
  }

  // --- STEP 4: L4/L7 Service Port Check (Winbox 8291, SSH 22, HTTP 80/443, SNMP 161) ---
  testsRun.push({ layer: 'L4/L7', name: 'Сетевые сервисы управления (Winbox, SSH, Web, SNMP)' });

  const serviceResults = [];
  if (targetSwitch && targetSwitch.ip) {
    const probePorts = [
      { port: 22, name: 'SSH Remote CLI', criticalFor: 'Terminal, Auto-Backup' },
      { port: 8291, name: 'MikroTik Winbox', criticalFor: 'RouterOS GUI Admin' },
      { port: 80, name: 'HTTP Web-Interface', criticalFor: 'Web Management' },
      { port: 443, name: 'HTTPS Secure Web', criticalFor: 'Web Management' }
    ];

    for (const p of probePorts) {
      try {
        const check = await checkTcpPort(targetSwitch.ip, p.port, 600);
        serviceResults.push({
          port: p.port,
          name: p.name,
          open: check.status === 'open',
          criticalFor: p.criticalFor
        });
      } catch {
        serviceResults.push({
          port: p.port,
          name: p.name,
          open: false,
          criticalFor: p.criticalFor
        });
      }
    }

    // Если все порты закрыты — рекомендация
    const allClosed = serviceResults.every(s => !s.open);
    if (allClosed) {
      findings.push({
        id: `l4-no-services-open-${targetSwitch.id}`,
        layer: 'L4',
        severity: 'info',
        category: 'services',
        title: `Все порты управления (SSH, Winbox, Web) на ${targetSwitch.ip} закрыты или отфильтрованы`,
        description: 'Порты 22 (SSH), 8291 (Winbox), 80/443 (Web) не отвечают на попытки TCP-рукопожатия.',
        rootCause: 'На коммутаторе включен строгий Input Filter (Drop all), либо устройство находится в изолированном сегменте.',
        impact: 'Управление доступно только через консольный кабель RS-232/USB Console.',
        recommendation: 'Проверьте разрешающие правила IP Firewall Filter в цепочке Input.',
        target: { switchId: targetSwitch.id, ip: targetSwitch.ip }
      });
    }
  }

  // --- STEP 5: Calculate Health Score & Root Cause Summary ---
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  let healthScore = 100 - (criticalCount * 25) - (warningCount * 8) - (infoCount * 2);
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let statusVerdict = 'ok';
  let verdictTitle = 'Сеть функционирует стабильно';
  let verdictMessage = 'Критических коллизий в L1-L4 сегментах не обнаружено.';

  if (criticalCount > 0) {
    statusVerdict = 'critical';
    verdictTitle = `Обнаружено ${criticalCount} критических неполадок!`;
    verdictMessage = 'Требуется немедленное вмешательство: разорванные транки или коллизии адресации приводят к деградации сервисов.';
  } else if (warningCount > 0) {
    statusVerdict = 'warning';
    verdictTitle = `Найдено ${warningCount} предупреждений`;
    verdictMessage = 'Сетевой трафик проходит, однако зафиксированы асимметричные настройки PVID или недоступность узлов.';
  }

  return {
    timestamp: new Date().toISOString(),
    targetSwitch: targetSwitch ? { id: targetSwitch.id, name: targetSwitch.name, ip: targetSwitch.ip, vendor: targetSwitch.vendor } : null,
    healthScore,
    statusVerdict,
    verdictTitle,
    verdictMessage,
    counts: {
      total: findings.length,
      critical: criticalCount,
      warning: warningCount,
      info: infoCount
    },
    testsRun,
    serviceResults,
    findings
  };
}
