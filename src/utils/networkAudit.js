import { parseSubnet, ipToLong, isIpInDhcpRange } from './ipamUtils.js';

/**
 * Comprehensive Network Audit Engine
 * Evaluates switches, ports, VLANs, patch panels, and IPAM records for conflicts,
 * configuration drift, asymmetric links, and best practices.
 */

export function runNetworkAudit({ switches = [], vlans = [], patchPanels = [], ipAllocations = [] }) {
  const issues = [];
  const vlanMap = new Map(vlans.map(v => [v.id, v]));
  const switchMap = new Map(switches.map(s => [s.id, s]));
  const patchPanelMap = new Map(patchPanels.map(p => [p.id, p]));

  // --- 1. IP & MAC ADDRESSING CHECKS ---
  const ipOccurrences = new Map(); // ip -> array of sources
  const macOccurrences = new Map(); // mac -> array of sources

  // Collect switch IPs & MACs
  switches.forEach(sw => {
    if (sw.ip) {
      const list = ipOccurrences.get(sw.ip) || [];
      list.push({ type: 'switch', id: sw.id, name: sw.name, switchId: sw.id });
      ipOccurrences.set(sw.ip, list);
    }
    if (sw.mac) {
      const cleanMac = sw.mac.toUpperCase().trim();
      const list = macOccurrences.get(cleanMac) || [];
      list.push({ type: 'switch', id: sw.id, name: sw.name, switchId: sw.id });
      macOccurrences.set(cleanMac, list);
    }
  });

  // Collect VLAN gateways
  vlans.forEach(v => {
    if (v.gateway) {
      const list = ipOccurrences.get(v.gateway) || [];
      list.push({ type: 'gateway', id: v.id, name: `Шлюз VLAN ${v.id} (${v.name})`, vlanId: v.id });
      ipOccurrences.set(v.gateway, list);
    }
  });

  // Collect IPAM allocations
  ipAllocations.forEach(alloc => {
    if (alloc.ip) {
      const list = ipOccurrences.get(alloc.ip) || [];
      list.push({
        type: 'ipam',
        id: alloc.id,
        name: alloc.hostname || alloc.ip,
        vlanId: alloc.vlanId,
        allocType: alloc.type,
        alloc
      });
      ipOccurrences.set(alloc.ip, list);
    }
    if (alloc.mac) {
      const cleanMac = alloc.mac.toUpperCase().trim();
      const list = macOccurrences.get(cleanMac) || [];
      list.push({
        type: 'ipam',
        id: alloc.id,
        name: alloc.hostname || alloc.ip,
        vlanId: alloc.vlanId,
        alloc
      });
      macOccurrences.set(cleanMac, list);
    }
  });

  // Check IP duplicates
  ipOccurrences.forEach((sources, ip) => {
    // Check if duplicate is a legitimate cross-reference:
    // 1) Switch management IP documented in IPAM
    const isSwitchInIpam = sources.length === 2 &&
      sources.some(s => s.type === 'switch') &&
      sources.some(s => s.type === 'ipam');

    // 2) VLAN gateway documented in IPAM (as gateway, switch or router)
    const isGatewayInIpam = sources.length === 2 &&
      sources.some(s => s.type === 'gateway') &&
      sources.some(s => s.type === 'ipam' && (s.allocType === 'gateway' || s.allocType === 'switch' || s.allocType === 'router'));

    // 3) Switch acts as the default gateway for VLANs
    const isSwitchAndGateway = sources.length === 2 &&
      sources.some(s => s.type === 'switch') &&
      sources.some(s => s.type === 'gateway');

    // 4) Gateway + Switch + IPAM entry for that core switch
    const isCoreGatewayTrio = sources.length === 3 &&
      sources.some(s => s.type === 'gateway') &&
      sources.some(s => s.type === 'switch') &&
      sources.some(s => s.type === 'ipam');

    const isLegitimate = isSwitchInIpam || isGatewayInIpam || isSwitchAndGateway || isCoreGatewayTrio;

    if (sources.length > 1 && !isLegitimate) {
      issues.push({
        id: `ip-dup-${ip}`,
        category: 'ipam',
        severity: 'error',
        title: `Дубликат IP-адреса: ${ip}`,
        message: `IP-адрес ${ip} одновременно назначен нескольким устройствам: ${sources.map(s => s.name).join(', ')}. Это приведет к сетевому конфликту (ARP collision).`,
        target: { type: 'ipam', ip },
        actionText: 'Перейти в IPAM'
      });
    }
  });

  // Check MAC duplicates
  macOccurrences.forEach((sources, mac) => {
    const isSelfMatch = sources.length === 2 &&
      sources.some(s => s.type === 'switch') &&
      sources.some(s => s.type === 'ipam');

    if (sources.length > 1 && !isSelfMatch) {
      issues.push({
        id: `mac-dup-${mac}`,
        category: 'ipam',
        severity: 'warning',
        title: `Дубликат MAC-адреса: ${mac}`,
        message: `MAC-адрес ${mac} используется более чем одним объектом: ${sources.map(s => s.name).join(', ')}.`,
        target: { type: 'ipam', mac },
        actionText: 'Проверить MAC в IPAM'
      });
    }
  });

  // Check IPAM entries against VLAN subnet & DHCP range
  ipAllocations.forEach(alloc => {
    const vlan = vlanMap.get(alloc.vlanId);
    if (!vlan) {
      issues.push({
        id: `ipam-orphan-vlan-${alloc.id}`,
        category: 'ipam',
        severity: 'error',
        title: `Хост ${alloc.ip} привязан к несуществующему VLAN ${alloc.vlanId}`,
        message: `В записи хоста "${alloc.hostname || alloc.ip}" указан VLAN ID ${alloc.vlanId}, которого нет в каталоге VLAN.`,
        target: { type: 'ipam', id: alloc.id },
        actionText: 'Исправить в IPAM'
      });
      return;
    }

    if (vlan.subnet) {
      const parsedSub = parseSubnet(vlan.subnet);
      if (parsedSub) {
        const ipVal = ipToLong(alloc.ip);
        if (ipVal === 0 || ipVal < parsedSub.firstIpLong || ipVal > parsedSub.lastIpLong) {
          issues.push({
            id: `ipam-out-of-subnet-${alloc.id}`,
            category: 'ipam',
            severity: 'error',
            title: `IP ${alloc.ip} вне диапазона подсети VLAN ${vlan.id}`,
            message: `Адрес ${alloc.ip} (${alloc.hostname || 'Хост'}) не входит в настроенную подсеть ${vlan.subnet} (диапазон ${parsedSub.firstIp} - ${parsedSub.lastIp}).`,
            target: { type: 'ipam', id: alloc.id },
            actionText: 'Изменить подсеть/IP'
          });
        }
      }
    }

    // Check collision with DHCP pool
    if (vlan.dhcpRange && alloc.type !== 'dhcp_pool') {
      if (isIpInDhcpRange(alloc.ip, vlan.dhcpRange)) {
        issues.push({
          id: `ipam-dhcp-collision-${alloc.id}`,
          category: 'ipam',
          severity: 'warning',
          title: `Статический IP ${alloc.ip} внутри DHCP пула`,
          message: `Хост "${alloc.hostname || alloc.ip}" имеет статический адрес в диапазоне динамической выдачи DHCP (${vlan.dhcpRange}) VLAN ${vlan.id}. Рекомендуется вынести его за пределы пула или сделать резервацию на DHCP-сервере.`,
          target: { type: 'ipam', id: alloc.id },
          actionText: 'Проверить в IPAM'
        });
      }
    }
  });

  // --- 2. SWITCH & LINK CHECKS ---
  const checkedLinks = new Set();

  switches.forEach(sw => {
    // Check switch management IP
    if (!sw.ip) {
      issues.push({
        id: `sw-no-ip-${sw.id}`,
        category: 'switches',
        severity: 'warning',
        title: `У коммутатора "${sw.name}" не задан IP управления`,
        message: 'Коммутатор не имеет IP-адреса для управления (In-Band / Out-of-Band).',
        target: { type: 'switch', id: sw.id },
        actionText: 'Настроить коммутатор'
      });
    }

    (sw.ports || []).forEach(port => {
      // 2.1 Check if port uses VLANs missing from global catalog
      if (port.pvid && !vlanMap.has(port.pvid)) {
        issues.push({
          id: `missing-pvid-${sw.id}-${port.id}`,
          category: 'vlans',
          severity: 'error',
          title: `Порт ${port.name || port.number} на "${sw.name}" использует неизвестный PVID ${port.pvid}`,
          message: `VLAN ${port.pvid} не зарегистрирован в базе данных VLAN проекта.`,
          target: { type: 'switch', id: sw.id, portId: port.id },
          quickFix: { type: 'create_vlan', vlanId: port.pvid },
          actionText: `Создать VLAN ${port.pvid}`
        });
      }

      if (port.taggedVlans && port.taggedVlans.length > 0) {
        port.taggedVlans.forEach(tvId => {
          if (!vlanMap.has(tvId)) {
            issues.push({
              id: `missing-tagged-${sw.id}-${port.id}-${tvId}`,
              category: 'vlans',
              severity: 'error',
              title: `Транк-порт ${port.name || port.number} на "${sw.name}" пропускает незарегистрированный VLAN ${tvId}`,
              message: `VLAN ${tvId} отсутствует в справочнике VLAN.`,
              target: { type: 'switch', id: sw.id, portId: port.id },
              quickFix: { type: 'create_vlan', vlanId: tvId },
              actionText: `Создать VLAN ${tvId}`
            });
          }
        });
      }

      // 2.2 Check Port Links
      if (port.linkedSwitchId) {
        const peerSw = switchMap.get(port.linkedSwitchId);
        if (!peerSw) {
          issues.push({
            id: `broken-link-sw-${sw.id}-${port.id}`,
            category: 'links',
            severity: 'error',
            title: `Битая связь на порту ${port.name || port.number} (${sw.name})`,
            message: `Порт ссылается на удаленный коммутатор ID "${port.linkedSwitchId}", который был удален или не существует.`,
            target: { type: 'switch', id: sw.id, portId: port.id },
            actionText: 'Исправить порт'
          });
          return;
        }

        const peerPort = (peerSw.ports || []).find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);
        if (!peerPort) {
          issues.push({
            id: `broken-link-port-${sw.id}-${port.id}`,
            category: 'links',
            severity: 'error',
            title: `Битая связь на порту ${port.name || port.number} (${sw.name})`,
            message: `На удаленном коммутаторе "${peerSw.name}" не найден порт "${port.linkedPortId}".`,
            target: { type: 'switch', id: sw.id, portId: port.id },
            actionText: 'Исправить порт'
          });
          return;
        }

        // Avoid duplicate pair reporting
        const linkKey = [sw.id, port.id, peerSw.id, peerPort.id].sort().join('<->');
        if (!checkedLinks.has(linkKey)) {
          checkedLinks.add(linkKey);

          // Check asymmetric link: does peer port point back to this switch/port?
          if (peerPort.linkedSwitchId !== sw.id || (peerPort.linkedPortId !== port.id && peerPort.linkedPortId !== port.number)) {
            issues.push({
              id: `asymmetric-link-${sw.id}-${port.id}`,
              category: 'links',
              severity: 'warning',
              title: `Асимметричная связь между "${sw.name}" и "${peerSw.name}"`,
              message: `Порт ${port.name} указывает на ${peerSw.name} (${peerPort.name}), но удаленный порт не указывает обратно на этот коммутатор.`,
              target: { type: 'switch', id: sw.id, portId: port.id },
              actionText: 'Синхронизировать связь'
            });
          }

          // Check Port Modes
          if (port.mode !== peerPort.mode) {
            issues.push({
              id: `mode-mismatch-${sw.id}-${port.id}`,
              category: 'links',
              severity: 'error',
              title: `Несовпадение режима линка: ${sw.name} (${port.name}) ↔ ${peerSw.name} (${peerPort.name})`,
              message: `Один порт настроен как ${port.mode.toUpperCase()}, а встречный порт настроен как ${peerPort.mode.toUpperCase()}. Линк не сможет корректно передавать трафик.`,
              target: { type: 'switch', id: sw.id, portId: port.id },
              actionText: 'Согласовать режимы'
            });
          }

          // Check Native VLAN / PVID
          if (port.pvid !== peerPort.pvid) {
            issues.push({
              id: `pvid-mismatch-${sw.id}-${port.id}`,
              category: 'links',
              severity: 'warning',
              title: `Несовпадение Native VLAN (PVID): ${port.pvid} ≠ ${peerPort.pvid}`,
              message: `На "${sw.name}" (${port.name}) PVID=${port.pvid}, а на "${peerSw.name}" (${peerPort.name}) PVID=${peerPort.pvid}. Это приведет к утечке нетегированного трафика между разными VLAN!`,
              target: { type: 'switch', id: sw.id, portId: port.id },
              actionText: 'Согласовать PVID'
            });
          }

          // Check Tagged VLANs on trunk
          if (port.mode === 'trunk' && peerPort.mode === 'trunk') {
            const localTagged = new Set(port.taggedVlans || []);
            const peerTagged = new Set(peerPort.taggedVlans || []);

            const missingOnPeer = [...localTagged].filter(v => !peerTagged.has(v));
            const missingOnLocal = [...peerTagged].filter(v => !localTagged.has(v));

            if (missingOnPeer.length > 0 || missingOnLocal.length > 0) {
              const diffText = [
                missingOnPeer.length > 0 ? `на ${peerSw.name} (${peerPort.name}) не хватает: ${missingOnPeer.join(', ')}` : null,
                missingOnLocal.length > 0 ? `на ${sw.name} (${port.name}) не хватает: ${missingOnLocal.join(', ')}` : null
              ].filter(Boolean).join('; ');

              issues.push({
                id: `trunk-diff-${sw.id}-${port.id}`,
                category: 'links',
                severity: 'warning',
                title: `Рассинхронизация транка: ${sw.name} (${port.name}) ↔ ${peerSw.name} (${peerPort.name})`,
                message: `Набор разрешенных VLAN не совпадает (${diffText}). Трафик этих VLAN будет отброшен на транковом стыке.`,
                target: { type: 'switch', id: sw.id, portId: port.id },
                quickFix: {
                  type: 'sync_trunk_vlans',
                  switchAId: sw.id,
                  portAId: port.id,
                  switchBId: peerSw.id,
                  portBId: peerPort.id,
                  mergedVlans: Array.from(new Set([...(port.taggedVlans || []), ...(peerPort.taggedVlans || [])]))
                },
                actionText: 'Синхронизировать VLAN'
              });
            }
          }

          // Check Port Status (One enabled, one disabled)
          if (port.enabled && !peerPort.enabled) {
            issues.push({
              id: `disabled-peer-${sw.id}-${port.id}`,
              category: 'links',
              severity: 'warning',
              title: `Удаленный порт выключен: ${peerSw.name} (${peerPort.name})`,
              message: `Порт на ${sw.name} активен, но удаленный порт отключен (Disabled). Физический линк не поднимется.`,
              target: { type: 'switch', id: peerSw.id, portId: peerPort.id },
              actionText: 'Включить порт'
            });
          }
        }
      }

      // 2.3 Check Patch Panel Link from Switch Port
      if (port.patchPanelId) {
        const pp = patchPanelMap.get(port.patchPanelId);
        if (!pp) {
          issues.push({
            id: `broken-pp-link-${sw.id}-${port.id}`,
            category: 'patchPanels',
            severity: 'error',
            title: `Порт ${port.name} ссылается на несуществующую патч-панель`,
            message: `Патч-панель ID "${port.patchPanelId}" не найдена в базе проекта.`,
            target: { type: 'switch', id: sw.id, portId: port.id },
            actionText: 'Проверить коммутацию'
          });
        } else {
          const ppPort = (pp.ports || []).find(p => p.id === port.patchPanelPortId || p.number === port.patchPanelPortId);
          if (!ppPort) {
            issues.push({
              id: `broken-pp-port-${sw.id}-${port.id}`,
              category: 'patchPanels',
              severity: 'error',
              title: `Порт ${port.name} ссылается на несуществующий порт патч-панели "${pp.name}"`,
              message: `Порт "${port.patchPanelPortId}" не найден на патч-панели "${pp.name}".`,
              target: { type: 'switch', id: sw.id, portId: port.id },
              actionText: 'Проверить коммутацию'
            });
          } else if (ppPort.connectedSwitchId !== sw.id || (ppPort.connectedSwitchPortId !== port.id && ppPort.connectedSwitchPortId !== port.number)) {
            issues.push({
              id: `asymm-pp-link-${sw.id}-${port.id}`,
              category: 'patchPanels',
              severity: 'warning',
              title: `Несогласованная кроссировка: ${sw.name} (${port.name}) → ${pp.name} (${ppPort.number})`,
              message: `Порт коммутатора скоммутирован на порт патч-панели, но порт панели не указывает на этот коммутатор.`,
              target: { type: 'patchPanel', id: pp.id, portId: ppPort.id },
              actionText: 'Синхронизировать патч'
            });
          }
        }
      }

      // 2.4 Security & Hardening / Best Practices
      // A) Access port in Default VLAN 1
      if (port.mode === 'access' && port.pvid === 1 && port.enabled) {
        issues.push({
          id: `security-vlan1-${sw.id}-${port.id}`,
          category: 'security',
          severity: 'info',
          title: `Порт ${port.name} (${sw.name}) оставлен в дефолтном VLAN 1`,
          message: 'Рекомендуется не использовать Default VLAN 1 для абонентских портов во избежание атак VLAN Hopping, STP Hijacking и переполнения CAM-таблицы.',
          target: { type: 'switch', id: sw.id, portId: port.id },
          actionText: 'Сменить VLAN'
        });
      }

      // B) Trunk Native VLAN 1 (Security Hardening: Native VLAN should be non-default/dummy)
      if (port.mode === 'trunk' && port.pvid === 1 && port.enabled) {
        issues.push({
          id: `security-trunk-native1-${sw.id}-${port.id}`,
          category: 'security',
          severity: 'warning',
          title: `Транк ${port.name} (${sw.name}) использует Native VLAN 1`,
          message: 'Транковый стык использует дефолтный VLAN 1 в качестве нетегированного (Native VLAN). Рекомендуется назначить изолированный Native VLAN (например, 999) для защиты от атак Double Tagging 802.1Q.',
          target: { type: 'switch', id: sw.id, portId: port.id },
          quickFix: {
            type: 'set_port_pvid',
            switchId: sw.id,
            portId: port.id,
            pvid: 999
          },
          actionText: 'Изолировать Native VLAN'
        });
      }

      // C) Unused open port (Enabled without connected device, without cable description)
      const isUnusedOpen = port.enabled && port.mode !== 'disabled' && !port.connectedTo && !port.linkedSwitchId && !port.patchPanelId && (!port.description || port.description.trim() === '');
      if (isUnusedOpen) {
        issues.push({
          id: `security-open-unused-${sw.id}-${port.id}`,
          category: 'security',
          severity: 'info',
          title: `Неиспользуемый порт ${port.name} (${sw.name}) включен без назначения`,
          message: 'Порт не скоммутирован и не имеет описания, но находится в состоянии Enable. Согласно CIS Benchmark, свободные порты рекомендуется отключать (Admin Down) для предотвращения несанкционированного подключения злоумышленников (Rogue Device).',
          target: { type: 'switch', id: sw.id, portId: port.id },
          quickFix: {
            type: 'disable_unused_port',
            switchId: sw.id,
            portId: port.id
          },
          actionText: 'Отключить порт'
        });
      }

      // D) Missing Port Description / Documentation Hygiene
      if (port.enabled && (port.connectedTo || port.linkedSwitchId) && (!port.description || port.description.trim() === '')) {
        issues.push({
          id: `security-no-desc-${sw.id}-${port.id}`,
          category: 'security',
          severity: 'info',
          title: `Отсутствует маркировка/описание на активном порту ${port.name} (${sw.name})`,
          message: 'Порт подключен к оборудованию, но в конфигурации отсутствует Description. Четкая документация портов критически важна для быстрого реагирования при сетевых инцидентах.',
          target: { type: 'switch', id: sw.id, portId: port.id },
          actionText: 'Добавить описание'
        });
      }
    });

    // --- Switch-level Hardening Checks ---
    // E) Management IP in Default / User VLAN
    if (sw.ip) {
      const swSubnetVlan = vlans.find(v => {
        if (!v.subnet) return false;
        try {
          const parsed = parseSubnet(v.subnet);
          const ipVal = ipToLong(sw.ip);
          return ipVal >= parsed.firstLong && ipVal <= parsed.lastLong;
        } catch { return false; }
      });

      if (swSubnetVlan && (swSubnetVlan.id === 1 || (swSubnetVlan.name && swSubnetVlan.name.toLowerCase().includes('user')))) {
        issues.push({
          id: `security-mgmt-in-user-vlan-${sw.id}`,
          category: 'security',
          severity: 'warning',
          title: `IP управления ${sw.name} (${sw.ip}) находится в пользовательском сегменте (VLAN ${swSubnetVlan.id})`,
          message: `Коммутатор управляется из общей подсети ${swSubnetVlan.name}. Лучшая практика (Out-of-Band / Dedicated MGMT): вынести интерфейсы управления сетевого оборудования в изолированный Management VLAN с ограниченным доступом по SSH/Winbox.`,
          target: { type: 'switch', id: sw.id },
          actionText: 'Настроить MGMT VLAN'
        });
      }
    }

    // F) Insecure Management Protocol detection in notes or models (Telnet / HTTP)
    if (sw.notes && (sw.notes.toLowerCase().includes('telnet') || sw.notes.toLowerCase().includes('http://'))) {
      issues.push({
        id: `security-insecure-proto-${sw.id}`,
        category: 'security',
        severity: 'warning',
        title: `Использование незащищенного протокола управления (Telnet/HTTP) на "${sw.name}"`,
        message: 'В параметрах коммутатора зафиксировано использование незашифрованных протоколов Telnet или HTTP. Пароли передаются открытым текстом. Рекомендуется использовать исключительно SSHv2 и HTTPS с отключением Telnet (RouterOS: /ip service disable telnet).',
        target: { type: 'switch', id: sw.id },
        actionText: 'Перейти на SSH'
      });
    }

    // G) Default / Weak SNMP Community ("public" / "private")
    if (sw.snmpCommunity && (sw.snmpCommunity.toLowerCase() === 'public' || sw.snmpCommunity.toLowerCase() === 'private')) {
      issues.push({
        id: `security-weak-snmp-${sw.id}`,
        category: 'security',
        severity: 'error',
        title: `Стандартная SNMP комьюнити-строка "${sw.snmpCommunity}" на "${sw.name}"`,
        message: 'Коммутатор настроен с дефолтным community string ("public" / "private"). Любой узел в локальной сети может выгрузить полную таблицу интерфейсов, ARP и MAC через SNMPwalk. Смените строку на уникальную или перейдите на SNMPv3 с шифрованием SHA/AES.',
        target: { type: 'switch', id: sw.id },
        quickFix: {
          type: 'set_snmp_community',
          switchId: sw.id,
          community: 'SecCorpSNMP_2026'
        },
        actionText: 'Сменить Community'
      });
    }
  });

  // --- 3. GLOBAL VLAN CONSISTENCY CHECKS ---
  const usedVlanIds = new Set();
  switches.forEach(sw => {
    (sw.ports || []).forEach(p => {
      if (p.pvid) usedVlanIds.add(p.pvid);
      if (p.taggedVlans) p.taggedVlans.forEach(v => usedVlanIds.add(v));
    });
  });
  ipAllocations.forEach(a => {
    if (a.vlanId) usedVlanIds.add(a.vlanId);
  });

  vlans.forEach(v => {
    // Check unused VLAN
    if (!usedVlanIds.has(v.id)) {
      issues.push({
        id: `unused-vlan-${v.id}`,
        category: 'vlans',
        severity: 'info',
        title: `Неиспользуемый VLAN ${v.id} (${v.name})`,
        message: `VLAN ${v.id} создан в базе данных, но не назначен ни на один порт коммутатора и не имеет хостов в IPAM.`,
        target: { type: 'vlan', id: v.id },
        actionText: 'Проверить VLAN'
      });
    }

    // Check VLAN missing subnet
    if (!v.subnet) {
      issues.push({
        id: `vlan-no-subnet-${v.id}`,
        category: 'vlans',
        severity: 'info',
        title: `У VLAN ${v.id} (${v.name}) не настроена IP-подсеть`,
        message: 'Для полноценного использования в IPAM и контроля коллизий укажите CIDR подсети (например, 192.168.10.0/24).',
        target: { type: 'vlan', id: v.id },
        actionText: 'Настроить подсеть'
      });
    }
  });

  // --- 4. PATCH PANELS CHECKS ---
  patchPanels.forEach(pp => {
    (pp.ports || []).forEach(port => {
      if (port.connectedSwitchId) {
        const sw = switchMap.get(port.connectedSwitchId);
        if (!sw) {
          issues.push({
            id: `pp-broken-sw-${pp.id}-${port.id}`,
            category: 'patchPanels',
            severity: 'error',
            title: `Порт патч-панели ${port.number} (${pp.name}) указывает на удаленный коммутатор`,
            message: `Коммутатор с ID "${port.connectedSwitchId}" не существует в проекте.`,
            target: { type: 'patchPanel', id: pp.id, portId: port.id },
            actionText: 'Исправить порт'
          });
        }
      }

      // Check pulled cable with assigned room but status is 'free' (unpatched wall outlet)
      if (port.room && port.room.trim() !== '' && port.status === 'free' && !port.connectedSwitchId) {
        issues.push({
          id: `pp-unpatched-${pp.id}-${port.id}`,
          category: 'patchPanels',
          severity: 'info',
          title: `Розетка ${port.socket || 'б/н'} (${port.room}) не скоммутирована`,
          message: `Кабельная линия расшита на порт ${port.number} панели "${pp.name}", но патч-корд к коммутатору отсутствует.`,
          target: { type: 'patchPanel', id: pp.id, portId: port.id },
          actionText: 'Скоммутировать'
        });
      }
    });
  });

  // Calculate Health Score
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const rawScore = 100 - (errorCount * 15) - (warningCount * 3) - Math.min(10, infoCount * 0.5);
  const healthScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    healthScore,
    issues,
    counts: {
      total: issues.length,
      errors: errorCount,
      warnings: warningCount,
      infos: infoCount
    },
    byCategory: {
      links: issues.filter(i => i.category === 'links'),
      ipam: issues.filter(i => i.category === 'ipam'),
      vlans: issues.filter(i => i.category === 'vlans'),
      patchPanels: issues.filter(i => i.category === 'patchPanels'),
      security: issues.filter(i => i.category === 'security')
    }
  };
}
