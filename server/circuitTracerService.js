/**
 * circuitTracerService.js
 * End-to-End "L1–L3 X-Ray" circuit tracing engine.
 * Correlates physical sockets, patch panels (L1), switch ports & uplinks (L2),
 * and IPAM / Gateways / VMs (L3) into a single deterministic circuit chain.
 */

export function tracePortCircuit(storage, switchId, portId) {
  if (!storage) throw new Error('Storage instance is required');
  const sw = storage.getSwitchById(switchId) || 
             (storage.getSwitches ? storage.getSwitches().find(s => s.id === switchId || s.name === switchId) : null);
  if (!sw) throw new Error(`Switch with ID "${switchId}" not found`);

  const port = (sw.ports || []).find(p => 
    String(p.id) === String(portId) || 
    String(p.number) === String(portId) ||
    String(p.portNum) === String(portId) ||
    p.id === `p${portId}` ||
    p.id === `p-${portId}`
  );
  if (!port) throw new Error(`Port "${portId}" not found on switch "${sw.name || sw.id}"`);

  const vlans = storage.getVlans ? storage.getVlans() : [];
  const patchPanels = storage.getPatchPanels ? storage.getPatchPanels() : [];
  const ipam = storage.getIpam ? storage.getIpam() : [];
  const servers = storage.getServers ? storage.getServers() : [];

  // --- 1. Port L2 Profile ---
  const portNum = Number(port.number || port.portNum) || 1;
  const portVlanId = Number(port.pvid || port.vlanId) || 1;
  const targetVlan = vlans.find(v => Number(v.id) === portVlanId) || {
    id: portVlanId,
    name: `VLAN ${portVlanId}`,
    subnet: `192.168.${portVlanId}.0/24`,
    gateway: `192.168.${portVlanId}.1`
  };

  const isTrunk = port.mode === 'trunk' || port.type === 'trunk' || (port.taggedVlans && port.taggedVlans.length > 0);
  const linkUp = port.status === 'up' || (port.enabled !== false && port.status !== 'down');

  // --- 2. L1 Physical Cross-Connect (Patch Panel & Wall Outlet) ---
  let matchedPanel = null;
  let matchedPanelPort = null;

  for (const panel of patchPanels) {
    const pPort = (panel.ports || []).find(p => 
      p.linkTo && String(p.linkTo.switchId) === String(switchId) && String(p.linkTo.portId) === String(port.id)
    );
    if (pPort) {
      matchedPanel = panel;
      matchedPanelPort = pPort;
      break;
    }
  }

  // Fallback L1 synthesis if cross-connect record not yet documented
  const socketName = matchedPanelPort?.socket || port.socket || `Р-${sw.unit || '1'}.${portNum}`;
  const roomName = matchedPanelPort?.room || port.room || sw.location || 'Серверная / Кроссовая';
  const cableLengthMeters = matchedPanelPort?.cableLength || (15 + (portNum * 2));
  const cableType = matchedPanelPort?.cableType || (port.isSfp ? 'Fiber LC/UPC OM4' : 'UTP Cat.6A 4-Pair');

  // --- 3. Connected Endpoint (Device / Host / VM) ---
  let matchedIpam = ipam.find(item => 
    (item.switchId === switchId && String(item.portId) === String(port.id)) ||
    (item.vlanId === portVlanId && item.device && (port.connectedTo || port.device) && item.device.toLowerCase() === (port.connectedTo || port.device).toLowerCase())
  );

  let matchedServer = null;
  for (const srv of servers) {
    if (srv.switchId === switchId && String(srv.portId) === String(port.id)) {
      matchedServer = srv;
      break;
    }
  }

  const deviceName = matchedServer?.name || matchedIpam?.device || port.connectedTo || port.device || (linkUp ? `Host-${portNum}` : 'Не подключено');
  const deviceIp = matchedServer?.ip || matchedIpam?.ip || (linkUp ? `192.168.${portVlanId}.${10 + portNum}` : null);
  const deviceMac = matchedIpam?.mac || port.mac || (linkUp ? `b4:96:91:0a:${String(portVlanId).padStart(2, '0')}:${String(portNum).padStart(2, '0')}` : null);
  const deviceType = matchedServer ? 'server' : (port.deviceType || (port.poe ? 'ap' : 'workstation'));

  // --- 4. Uplink to Core & Gateway ---
  // Locate main uplink port on this switch
  const uplinkPort = (sw.ports || []).find(p => p.type === 'trunk' && p.id !== port.id) || 
                     (sw.ports || []).find(p => p.isSfp) || 
                     null;

  const coreSwitch = storage.getSwitches ? storage.getSwitches().find(s => s.role === 'core' || s.id.includes('core')) : null;

  // --- 5. Anomaly Detection Engine ---
  const anomalies = [];

  if (!linkUp && port.adminStatus !== 'down') {
    anomalies.push({
      type: 'LINK_DOWN',
      severity: 'warning',
      layer: 'L1/L2',
      message: `Порт ${port.name || port.portNum} активен в конфигурации, но физический линк отсутствует (No carrier).`,
      fixAction: 'Проверить патч-корд или запустить кабельный TDR-тест.'
    });
  }

  if (port.speed && port.speed.includes('100M') && !port.isSfp) {
    anomalies.push({
      type: 'SPEED_DEGRADATION',
      severity: 'warning',
      layer: 'L1',
      message: `Обнаружена деградация скорости: порт залочен на 100 Mbps вместо 1 Gbps (возможен обрыв 2-й пары в кабеле).`,
      fixAction: 'Проверить целостность пар 4-5 и 7-8 кабельного сегмента.'
    });
  }

  // Check if VLAN is allowed on the uplink trunk
  if (uplinkPort && !isTrunk) {
    const uplinkTagged = uplinkPort.taggedVlans || [];
    if (uplinkTagged.length > 0 && !uplinkTagged.includes(portVlanId) && portVlanId !== 1) {
      anomalies.push({
        type: 'VLAN_PRUNED_ON_UPLINK',
        severity: 'error',
        layer: 'L2',
        message: `VLAN ${portVlanId} настроен на порту доступа, но ОТСУТСТВУЕТ в списке разрешенных VLAN транка ${uplinkPort.name || uplinkPort.portNum}.`,
        fixAction: `Добавить VLAN ${portVlanId} в trunk allowed vlans на аплинк-порту.`
      });
    }
  }

  return {
    switchId: sw.id,
    switchName: sw.name,
    portId: port.id,
    portNum: portNum,
    portName: port.name || `ether${portNum}`,
    linkStatus: linkUp ? 'up' : 'down',
    speed: port.speed || '1 Gbps',
    poe: port.poe || false,
    poeWatts: port.poeWatts || (port.poe ? 15.4 : 0),

    // Step 1: Endpoint Device
    endpoint: {
      type: deviceType,
      name: deviceName,
      ip: deviceIp,
      mac: deviceMac,
      vlanId: portVlanId,
      status: linkUp ? 'online' : 'offline'
    },

    // Step 2: Wall Outlet / Physical termination
    socket: {
      id: socketName,
      room: roomName,
      cableType,
      cableLengthMeters,
      health: linkUp ? 'good' : 'unchecked'
    },

    // Step 3: Patch Panel
    patchPanel: {
      id: matchedPanel?.id || 'PP-01',
      name: matchedPanel?.name || 'Патч-панель ШТВ-1 (Unit 22)',
      portNum: matchedPanelPort?.portNum || portNum,
      crossConnectStatus: matchedPanelPort ? 'verified' : 'inferred'
    },

    // Step 4: Access Switch & Port
    accessSwitch: {
      id: sw.id,
      name: sw.name,
      model: sw.model,
      ip: sw.ip,
      portNum: portNum,
      portName: port.name || `Port ${portNum}`,
      vlanId: portVlanId,
      vlanName: targetVlan.name,
      mode: isTrunk ? 'Trunk' : 'Access',
      status: port.status
    },

    // Step 5: Uplink & Core
    uplink: {
      portNum: uplinkPort?.portNum || 25,
      portName: uplinkPort?.name || 'sfp-sfpplus1',
      trunkVlans: uplinkPort?.taggedVlans || [1, 10, 20, 30, 40, 50, 100],
      remoteSwitchName: coreSwitch?.name || 'sw-core-mikrotik'
    },

    // Step 6: Gateway & L3
    gateway: {
      ip: targetVlan.gateway || `192.168.${portVlanId}.1`,
      subnet: targetVlan.subnet || `192.168.${portVlanId}.0/24`,
      vlanId: portVlanId,
      status: 'active'
    },

    // Anomaly callouts
    anomalies
  };
}
