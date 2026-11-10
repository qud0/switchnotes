/**
 * vlanWizardService.js
 * Сервис сквозного проброса VLAN (End-to-End VLAN Wizard) по цепочке коммутаторов
 * Автоматический поиск пути по графу топологии, генерация мультивендорных CLI-скриптов
 * (MikroTik RouterOS, SNR NAG, Cisco, Ubiquiti) и применение в 1 клик (в БД и по SSH).
 */

import { executeSshCommand } from './backupService.js';

/**
 * Поиск кратчайшего пути коммутаторов и портов по графу топологии (BFS)
 */
export function findSwitchPath(switchesList, startId, endId) {
  if (!startId || !endId || !Array.isArray(switchesList) || switchesList.length === 0) {
    return null;
  }

  const startSw = switchesList.find(s => s.id === startId);
  const endSw = switchesList.find(s => s.id === endId);
  if (!startSw || !endSw) return null;

  if (startId === endId) {
    return [{
      switch: { id: startSw.id, name: startSw.name, vendor: startSw.vendor, model: startSw.model, ip: startSw.ip },
      inPort: null,
      outPort: null,
      isSource: true,
      isDestination: true,
      isTransit: false
    }];
  }

  // Построение списка смежности
  const adj = new Map();
  switchesList.forEach(s => adj.set(s.id, []));

  switchesList.forEach(sw => {
    (sw.ports || []).forEach(p => {
      if (p.linkedSwitchId && p.linkedPortId) {
        adj.get(sw.id)?.push({
          neighborId: p.linkedSwitchId,
          outPort: p,
          neighborPortId: p.linkedPortId
        });
      }
    });
  });

  const queue = [[startId, []]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const [currId, pathEdges] = queue.shift();
    if (currId === endId) {
      // Восстанавливаем цепочку узлов и портов
      const fullPath = [];
      for (let i = 0; i <= pathEdges.length; i++) {
        if (i === 0) {
          const sw = switchesList.find(s => s.id === startId);
          fullPath.push({
            switch: { id: sw.id, name: sw.name, vendor: sw.vendor, model: sw.model, ip: sw.ip },
            inPort: null,
            outPort: pathEdges[0]?.outPort,
            isSource: true,
            isDestination: false,
            isTransit: false
          });
        } else if (i === pathEdges.length) {
          const sw = switchesList.find(s => s.id === endId);
          const prevEdge = pathEdges[i - 1];
          const inPort = sw.ports.find(p => p.id === prevEdge.neighborPortId);
          fullPath.push({
            switch: { id: sw.id, name: sw.name, vendor: sw.vendor, model: sw.model, ip: sw.ip },
            inPort,
            outPort: null,
            isSource: false,
            isDestination: true,
            isTransit: false
          });
        } else {
          const edgeBefore = pathEdges[i - 1];
          const edgeAfter = pathEdges[i];
          const sw = switchesList.find(s => s.id === edgeBefore.neighborId);
          const inPort = sw.ports.find(p => p.id === edgeBefore.neighborPortId);
          fullPath.push({
            switch: { id: sw.id, name: sw.name, vendor: sw.vendor, model: sw.model, ip: sw.ip },
            inPort,
            outPort: edgeAfter.outPort,
            isSource: false,
            isDestination: false,
            isTransit: true
          });
        }
      }
      return fullPath;
    }

    for (const edge of (adj.get(currId) || [])) {
      if (!visited.has(edge.neighborId)) {
        visited.add(edge.neighborId);
        queue.push([edge.neighborId, [...pathEdges, edge]]);
      }
    }
  }

  return null;
}

/**
 * Генерация вендорного CLI скрипта для коммутатора
 */
export function generateSwitchVlanScript({
  vendor = 'MikroTik',
  switchName = '',
  vlanId = 100,
  vlanName = 'LAN',
  taggedPorts = [],
  untaggedPorts = [],
  portDescription = ''
}) {
  const v = (vendor || '').toLowerCase();
  const vName = vlanName || `VLAN_${vlanId}`;
  const lines = [];

  if (v.includes('mikrotik')) {
    lines.push(`# === MikroTik RouterOS: ${switchName} ===`);
    lines.push(`# Проброс VLAN ${vlanId} (${vName}) через Bridge VLAN Filtering`);
    
    // Tagged транковые интерфейсы
    const taggedNames = taggedPorts.map(p => p.name || p.portName || `ether${p.number}`).filter(Boolean);
    const untaggedNames = untaggedPorts.map(p => p.name || p.portName || `ether${p.number}`).filter(Boolean);

    // 1. Настройка PVID на untagged портах
    untaggedPorts.forEach(p => {
      const pName = p.name || p.portName || `ether${p.number}`;
      lines.push(`/interface bridge port set [find interface="${pName}"] pvid=${vlanId} frame-types=admit-only-untagged-and-priority-tagged`);
      if (portDescription) {
        lines.push(`/interface set [find name="${pName}"] comment="${portDescription} (VLAN ${vlanId})"`);
      }
    });

    // 2. Настройка транк-портов
    taggedPorts.forEach(p => {
      const pName = p.name || p.portName || `ether${p.number}`;
      lines.push(`/interface bridge port set [find interface="${pName}"] frame-types=admit-only-vlan-tagged ingress-filtering=yes`);
    });

    // 3. Добавление записи в /interface bridge vlan
    let vlanCmd = `/interface bridge vlan add bridge=bridge-lan vlan-ids=${vlanId} comment="${vName}"`;
    if (taggedNames.length > 0) {
      vlanCmd += ` tagged=bridge-lan,${taggedNames.join(',')}`;
    }
    if (untaggedNames.length > 0) {
      vlanCmd += ` untagged=${untaggedNames.join(',')}`;
    }
    lines.push(vlanCmd);

  } else if (v.includes('snr')) {
    lines.push(`! === SNR NAG (SNR-OS): ${switchName} ===`);
    lines.push(`! Создание и сквозной проброс VLAN ${vlanId} (${vName})`);
    lines.push(`vlan ${vlanId}`);
    lines.push(` name ${vName.replace(/\s+/g, '_')}`);
    lines.push(` exit`);

    // Транковые порты
    taggedPorts.forEach(p => {
      const ifName = p.name || p.portName || `Ethernet1/0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` switchport mode trunk`);
      lines.push(` switchport trunk allowed vlan add ${vlanId}`);
      lines.push(` exit`);
    });

    // Access порты
    untaggedPorts.forEach(p => {
      const ifName = p.name || p.portName || `Ethernet1/0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` switchport mode access`);
      lines.push(` switchport access vlan ${vlanId}`);
      if (portDescription) {
        lines.push(` description "${portDescription}"`);
      }
      lines.push(` exit`);
    });

  } else if (v.includes('cisco') || v.includes('eltex')) {
    lines.push(`! === Cisco IOS / Eltex: ${switchName} ===`);
    lines.push(`vlan ${vlanId}`);
    lines.push(` name ${vName.replace(/\s+/g, '_')}`);
    lines.push(` exit`);

    taggedPorts.forEach(p => {
      const ifName = p.name || p.portName || `GigabitEthernet1/0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` switchport trunk encapsulation dot1q`);
      lines.push(` switchport mode trunk`);
      lines.push(` switchport trunk allowed vlan add ${vlanId}`);
      lines.push(` exit`);
    });

    untaggedPorts.forEach(p => {
      const ifName = p.name || p.portName || `GigabitEthernet1/0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` switchport mode access`);
      lines.push(` switchport access vlan ${vlanId}`);
      if (portDescription) {
        lines.push(` description "${portDescription}"`);
      }
      lines.push(` exit`);
    });

  } else {
    // Ubiquiti / Generic
    lines.push(`# === Ubiquiti / Generic CLI: ${switchName} ===`);
    lines.push(`vlan database`);
    lines.push(` vlan ${vlanId}`);
    lines.push(` vlan name ${vlanId} "${vName}"`);
    lines.push(` exit`);

    taggedPorts.forEach(p => {
      const pName = p.name || p.portName || `0/${p.number}`;
      const ifName = pName.startsWith('0/') ? pName : `0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` vlan participation include ${vlanId}`);
      lines.push(` vlan tagging ${vlanId}`);
      lines.push(` exit`);
    });

    untaggedPorts.forEach(p => {
      const pName = p.name || p.portName || `0/${p.number}`;
      const ifName = pName.startsWith('0/') ? pName : `0/${p.number}`;
      lines.push(`interface ${ifName}`);
      lines.push(` vlan pvid ${vlanId}`);
      lines.push(` vlan participation include ${vlanId}`);
      lines.push(` vlan untagged ${vlanId}`);
      if (portDescription) {
        lines.push(` description "${portDescription}"`);
      }
      lines.push(` exit`);
    });
  }

  return lines.join('\n');
}

/**
 * Комплексный анализ проброса VLAN:
 * Поиск пути, проверка каждого порта на наличие тега, выявление разрывов
 * и формирование вендорных скриптов.
 */
export function analyzeVlanProvisioning(storage, {
  vlanId,
  vlanName = '',
  sourceSwitchId,
  destinationSwitchId,
  destinationPortIds = [],
  destinationMode = 'access', // 'access' | 'trunk' | 'hybrid'
  portDescription = ''
}) {
  const switches = storage?.data?.switches || [];
  const vlans = storage?.data?.vlans || [];
  const vId = parseInt(vlanId, 10);

  if (!vId || isNaN(vId) || vId < 1 || vId > 4094) {
    throw new Error('Укажите корректный VLAN ID (от 1 до 4094)');
  }

  const existingVlan = vlans.find(v => v.id === vId);
  const vName = vlanName || existingVlan?.name || `VLAN_${vId}`;

  // Поиск пути по топологии
  const path = findSwitchPath(switches, sourceSwitchId, destinationSwitchId);
  if (!path) {
    return {
      success: false,
      error: 'Маршрут между выбранными коммутаторами не найден. Проверьте связность портов в топологии.',
      path: null
    };
  }

  let totalChangesNeeded = 0;
  const analyzedHops = [];
  const vendorScripts = {};

  // Анализ каждого шага цепочки
  path.forEach((hop, idx) => {
    const sw = switches.find(s => s.id === hop.switch.id);
    const hopAnalysis = {
      hopIndex: idx + 1,
      switchId: sw.id,
      switchName: sw.name,
      vendor: sw.vendor,
      model: sw.model,
      ip: sw.ip,
      isSource: hop.isSource,
      isDestination: hop.isDestination,
      isTransit: hop.isTransit,
      portsToTag: [],
      portsToUntag: [],
      alreadyConfiguredPorts: []
    };

    // 1. Входящий порт (для транзитных и целевого коммутаторов)
    if (hop.inPort) {
      const realInPort = sw.ports?.find(p => p.id === hop.inPort.id) || hop.inPort;
      const carriesTag = (realInPort.taggedVlans || []).includes(vId);
      if (carriesTag) {
        hopAnalysis.alreadyConfiguredPorts.push({
          portId: realInPort.id,
          portName: realInPort.name || `Порт ${realInPort.number}`,
          role: 'inbound_uplink',
          state: 'already_tagged'
        });
      } else {
        totalChangesNeeded++;
        hopAnalysis.portsToTag.push({
          portId: realInPort.id,
          name: realInPort.name,
          portName: realInPort.name || `Порт ${realInPort.number}`,
          number: realInPort.number,
          role: 'inbound_uplink',
          currentMode: realInPort.mode || 'access'
        });
      }
    }

    // 2. Исходящий порт (для исходного и транзитных коммутаторов)
    if (hop.outPort) {
      const realOutPort = sw.ports?.find(p => p.id === hop.outPort.id) || hop.outPort;
      const carriesTag = (realOutPort.taggedVlans || []).includes(vId);
      if (carriesTag) {
        hopAnalysis.alreadyConfiguredPorts.push({
          portId: realOutPort.id,
          name: realOutPort.name,
          portName: realOutPort.name || `Порт ${realOutPort.number}`,
          role: 'outbound_downlink',
          state: 'already_tagged'
        });
      } else {
        totalChangesNeeded++;
        hopAnalysis.portsToTag.push({
          portId: realOutPort.id,
          name: realOutPort.name,
          portName: realOutPort.name || `Порт ${realOutPort.number}`,
          number: realOutPort.number,
          role: 'outbound_downlink',
          currentMode: realOutPort.mode || 'access'
        });
      }
    }

    // 3. Целевой порт(ы) на конечном коммутаторе
    if (hop.isDestination && destinationPortIds.length > 0) {
      destinationPortIds.forEach(pId => {
        const destPort = sw.ports?.find(p => p.id === pId || p.number === pId);
        if (destPort) {
          const isAccessConfigured = destPort.mode === 'access' && destPort.pvid === vId;
          const isTrunkConfigured = destPort.mode === 'trunk' && (destPort.taggedVlans || []).includes(vId);

          if ((destinationMode === 'access' && isAccessConfigured) || (destinationMode === 'trunk' && isTrunkConfigured)) {
            hopAnalysis.alreadyConfiguredPorts.push({
              portId: destPort.id,
              name: destPort.name,
              portName: destPort.name || `Порт ${destPort.number}`,
              role: 'destination_client',
              state: 'already_configured'
            });
          } else {
            totalChangesNeeded++;
            if (destinationMode === 'access') {
              hopAnalysis.portsToUntag.push({
                portId: destPort.id,
                name: destPort.name,
                portName: destPort.name || `Порт ${destPort.number}`,
                number: destPort.number,
                role: 'destination_access',
                currentPvid: destPort.pvid
              });
            } else {
              hopAnalysis.portsToTag.push({
                portId: destPort.id,
                name: destPort.name,
                portName: destPort.name || `Порт ${destPort.number}`,
                number: destPort.number,
                role: 'destination_trunk',
                currentMode: destPort.mode
              });
            }
          }
        }
      });
    }

    // Генерация скрипта для этого узла
    const script = generateSwitchVlanScript({
      vendor: sw.vendor,
      switchName: sw.name,
      vlanId: vId,
      vlanName: vName,
      taggedPorts: hopAnalysis.portsToTag,
      untaggedPorts: hopAnalysis.portsToUntag,
      portDescription
    });

    vendorScripts[sw.id] = script;
    analyzedHops.push(hopAnalysis);
  });

  return {
    success: true,
    vlanId: vId,
    vlanName: vName,
    vlanExists: !!existingVlan,
    sourceSwitch: path[0]?.switch,
    destinationSwitch: path[path.length - 1]?.switch,
    hopsCount: path.length,
    totalChangesNeeded,
    analyzedHops,
    vendorScripts
  };
}

/**
 * 1-Click Применение сквозного проброса VLAN в базу данных SwitchBook
 */
export function applyVlanProvisioning(storage, {
  vlanId,
  vlanName = '',
  vlanDescription = '',
  vlanColor = '#8b5cf6',
  sourceSwitchId,
  destinationSwitchId,
  destinationPortIds = [],
  destinationMode = 'access',
  portDescription = ''
}) {
  const switches = storage?.data?.switches || [];
  const vlans = storage?.data?.vlans || [];
  const vId = parseInt(vlanId, 10);

  if (!vId || isNaN(vId)) {
    throw new Error('Некорректный VLAN ID');
  }

  // 1. Создание VLAN в глобальной таблице, если еще не существует
  let existingVlan = vlans.find(v => v.id === vId);
  if (!existingVlan) {
    existingVlan = {
      id: vId,
      name: vlanName || `VLAN_${vId}`,
      description: vlanDescription || 'Создан мастером сквозного проброса VLAN',
      color: vlanColor || '#8b5cf6',
      createdAt: new Date().toISOString()
    };
    storage.data.vlans.push(existingVlan);
  }

  // 2. Поиск пути по топологии
  const path = findSwitchPath(switches, sourceSwitchId, destinationSwitchId);
  if (!path) {
    throw new Error('Маршрут между выбранными коммутаторами не найден');
  }

  let updatedPortsCount = 0;
  const updatedSwitchesSet = new Set();

  path.forEach(hop => {
    const sw = storage.getSwitchById(hop.switch.id);
    if (!sw) return;

    // Входящий транковый порт
    if (hop.inPort) {
      const port = sw.ports.find(p => p.id === hop.inPort.id);
      if (port) {
        const tagged = new Set(port.taggedVlans || []);
        if (!tagged.has(vId)) {
          tagged.add(vId);
          storage.updatePort(sw.id, port.id, {
            taggedVlans: Array.from(tagged),
            mode: port.mode === 'access' ? 'trunk' : port.mode
          });
          updatedPortsCount++;
          updatedSwitchesSet.add(sw.id);
        }
      }
    }

    // Исходящий транковый порт
    if (hop.outPort) {
      const port = sw.ports.find(p => p.id === hop.outPort.id);
      if (port) {
        const tagged = new Set(port.taggedVlans || []);
        if (!tagged.has(vId)) {
          tagged.add(vId);
          storage.updatePort(sw.id, port.id, {
            taggedVlans: Array.from(tagged),
            mode: port.mode === 'access' ? 'trunk' : port.mode
          });
          updatedPortsCount++;
          updatedSwitchesSet.add(sw.id);
        }
      }
    }

    // Целевой порт на конечном коммутаторе
    if (hop.isDestination && Array.isArray(destinationPortIds)) {
      destinationPortIds.forEach(pId => {
        const destPort = sw.ports.find(p => p.id === pId || p.number === pId);
        if (destPort) {
          if (destinationMode === 'access') {
            storage.updatePort(sw.id, destPort.id, {
              mode: 'access',
              pvid: vId,
              connectedTo: portDescription || destPort.connectedTo || `VLAN ${vId} (${existingVlan.name})`
            });
          } else if (destinationMode === 'trunk') {
            const tagged = new Set(destPort.taggedVlans || []);
            tagged.add(vId);
            storage.updatePort(sw.id, destPort.id, {
              mode: 'trunk',
              taggedVlans: Array.from(tagged),
              connectedTo: portDescription || destPort.connectedTo
            });
          } else if (destinationMode === 'hybrid') {
            storage.updatePort(sw.id, destPort.id, {
              mode: 'hybrid',
              pvid: vId,
              connectedTo: portDescription || destPort.connectedTo
            });
          }
          updatedPortsCount++;
          updatedSwitchesSet.add(sw.id);
        }
      });
    }
  });

  storage.save();

  return {
    success: true,
    vlanId: vId,
    vlanName: existingVlan.name,
    updatedSwitchesCount: updatedSwitchesSet.size,
    updatedPortsCount,
    hopsCount: path.length
  };
}

/**
 * Аппаратное выполнение скриптов проброса VLAN по SSH
 */
export async function executeVlanProvisioningSsh(storage, {
  vendorScripts = {},
  credentials = {}
}) {
  const switches = storage?.data?.switches || [];
  const results = [];

  for (const [switchId, script] of Object.entries(vendorScripts)) {
    const sw = switches.find(s => s.id === switchId);
    if (!sw) {
      results.push({ switchId, success: false, error: 'Коммутатор не найден в базе' });
      continue;
    }

    if (!sw.ip) {
      results.push({ switchId, switchName: sw.name, success: false, error: 'У коммутатора не настроен IP-адрес' });
      continue;
    }

    if (!script || !script.trim()) {
      results.push({ switchId, switchName: sw.name, success: true, message: 'Скрипт пуст (изменений не требуется)' });
      continue;
    }

    try {
      const sshRes = await executeSshCommand({
        host: sw.ip,
        port: credentials.port || sw.sshPort || storage.data?.backupSchedule?.credentials?.port || 22,
        username: credentials.username || sw.sshUsername || storage.data?.backupSchedule?.credentials?.username || 'admin',
        password: credentials.password || sw.sshPassword || storage.data?.backupSchedule?.credentials?.password || '',
        command: script + '\n',
        timeout: 6000
      });

      results.push({
        switchId: sw.id,
        switchName: sw.name,
        ip: sw.ip,
        success: sshRes.success,
        output: sshRes.output || sshRes.stdout || '(Выполнено успешно)'
      });
    } catch (err) {
      results.push({
        switchId: sw.id,
        switchName: sw.name,
        ip: sw.ip,
        success: false,
        error: err.message
      });
    }
  }

  return {
    success: results.some(r => r.success),
    totalSwitches: Object.keys(vendorScripts).length,
    successfulCount: results.filter(r => r.success).length,
    results
  };
}
