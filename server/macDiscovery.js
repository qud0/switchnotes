import { exec } from 'child_process';
import { lookupVendor } from './tools.js';

/**
 * Standardize MAC address to format XX:XX:XX:XX:XX:XX
 */
export function normalizeMac(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (clean.length !== 12) return raw.toUpperCase();
  return clean.match(/.{1,2}/g).join(':');
}

/**
 * Parse MikroTik RouterOS Bridge Host output
 * Supported formats:
 * - detail: "mac-address=B8:69:F4:01:22:33 interface=ether1 on-interface=ether1 vlan-id=20 dynamic=yes age=12s"
 * - table: "0  D  B8:69:F4:01:22:33  20  ether1  bridge1  12s"
 */
export function parseMikrotikMacTable(rawOutput) {
  const records = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('FLAGS')) continue;

    // Check key=value format
    if (trimmed.includes('mac-address=')) {
      const macMatch = trimmed.match(/mac-address=([0-9a-fA-F:-]+)/i);
      const ifaceMatch = trimmed.match(/(?:on-interface|interface)=([a-zA-Z0-9_-]+)/i);
      const vlanMatch = trimmed.match(/vlan-id=(\d+)/i);
      const ageMatch = trimmed.match(/age=([0-9a-zA-Z]+)/i);

      if (macMatch && ifaceMatch) {
        records.push({
          mac: normalizeMac(macMatch[1]),
          interface: ifaceMatch[1],
          vlan: vlanMatch ? parseInt(vlanMatch[1]) : 1,
          type: trimmed.includes('dynamic=yes') ? 'dynamic' : 'static',
          age: ageMatch ? ageMatch[1] : '10s'
        });
      }
      continue;
    }

    // Check tabular format: "0 D B8:69:F4:01:22:33 20 ether1 bridge 10s"
    const tableMatch = trimmed.match(/(?:[0-9]+\s+[A-Z]*\s+)?([0-9a-fA-F:-]{17})\s+(\d+)?\s*([a-zA-Z0-9_-]+)/i);
    if (tableMatch) {
      records.push({
        mac: normalizeMac(tableMatch[1]),
        vlan: tableMatch[2] ? parseInt(tableMatch[2]) : 1,
        interface: tableMatch[3],
        type: 'dynamic',
        age: '15s'
      });
    }
  }

  return records;
}

/**
 * Parse SNR Comware / Cisco-style "show mac-address-table"
 * Example:
 * Vlan Mac Address      Type    Creator  Ports
 * 20   f8f0.8211.4455   DYNAMIC COMMON   Ethernet1/0/1
 */
export function parseSnrMacTable(rawOutput) {
  const records = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('vlan') || trimmed.startsWith('-')) continue;

    // Match: "20   f8f0.8211.4455   DYNAMIC   COMMON   Ethernet1/0/1" or "Gi1/0/1"
    const match = trimmed.match(/^(\d+)\s+([0-9a-fA-F.]{14}|[0-9a-fA-F:-]{17})\s+([A-Za-z]+)\s+(?:[A-Za-z0-9_-]+\s+)?([a-zA-Z0-9/_-]+)/);
    if (match) {
      records.push({
        vlan: parseInt(match[1]),
        mac: normalizeMac(match[2]),
        type: match[3].toLowerCase(),
        interface: match[4],
        age: '30s'
      });
    }
  }

  return records;
}

/**
 * Parse Ubiquiti UniFi "show mac-addr-table"
 * Example:
 * 20  74:83:c2:55:66:77  0/1  1  Learned
 */
export function parseUbntMacTable(rawOutput) {
  const records = [];
  const lines = rawOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith('vlan') || trimmed.startsWith('-')) continue;

    const match = trimmed.match(/^(\d+)\s+([0-9a-fA-F:-]{17})\s+([0-9/]+|[a-zA-Z0-9/_-]+)/);
    if (match) {
      records.push({
        vlan: parseInt(match[1]),
        mac: normalizeMac(match[2]),
        interface: match[3],
        type: 'dynamic',
        age: '45s'
      });
    }
  }

  return records;
}

/**
 * Generate realistic simulated live MAC table for a switch
 * based on its configured ports, patch panels cross-links, and IPAM database.
 */
export function generateSimulatedMacTable(sw, storage) {
  const records = [];
  const ipamList = storage?.data?.ipam || [];
  const patchPanels = storage?.data?.patchPanels || [];

  (sw.ports || []).forEach((p, idx) => {
    // Only generate MAC for active or connected ports
    if (!p.enabled) return;

    const portName = p.name || `Port ${p.number}`;

    // 1. Check if linked to patch panel
    if (p.patchPanelId) {
      const pp = patchPanels.find(x => x.id === p.patchPanelId);
      const ppPort = pp?.ports?.find(prt => prt.id === p.patchPanelPortId || prt.number === p.patchPanelPortId);
      
      // Look up IPAM matching socket, room or connected switch
      const matchedIpam = ipamList.find(a => 
        (ppPort?.socket && a.location?.includes(ppPort.socket)) ||
        (ppPort?.room && a.location?.includes(ppPort.room)) ||
        (a.connectedTo && a.connectedTo.includes(p.name))
      );

      if (matchedIpam?.mac) {
        records.push({
          mac: normalizeMac(matchedIpam.mac),
          interface: portName,
          vlan: p.pvid || matchedIpam.vlanId || 10,
          type: 'dynamic',
          age: `${Math.floor(Math.random() * 90) + 10}s`
        });
        return;
      }

      // Generate a realistic MAC for connected office workstation/printer
      if (ppPort && ppPort.status === 'connected') {
        const dummyPrefix = p.number === 4 ? '00:17:C4' : (p.number === 11 || p.number === 12 ? '00:1A:E8' : 'F8:75:A4');
        const dummyMac = `${dummyPrefix}:22:${(idx * 7 + 10).toString(16).padStart(2, '0').toUpperCase()}:${(p.number * 3 + 12).toString(16).padStart(2, '0').toUpperCase()}`;
        records.push({
          mac: dummyMac,
          interface: portName,
          vlan: p.pvid || 20,
          type: 'dynamic',
          age: `${Math.floor(Math.random() * 60) + 5}s`
        });
        return;
      }
    }

    // 2. Trunk port simulation (multiple MACs learned on uplink!)
    if (p.mode === 'trunk' && p.linkedSwitchId) {
      const peerSw = storage?.data?.switches?.find(s => s.id === p.linkedSwitchId);
      if (peerSw?.mac) {
        records.push({
          mac: normalizeMac(peerSw.mac),
          interface: portName,
          vlan: p.pvid || 10,
          type: 'dynamic',
          age: '5s'
        });
      }
      // Add a couple downstream MACs traversing the trunk
      records.push({
        mac: '74:83:C2:55:66:77',
        interface: portName,
        vlan: 20,
        type: 'dynamic',
        age: '12s'
      });
      records.push({
        mac: '00:15:65:AA:BB:CC',
        interface: portName,
        vlan: 30,
        type: 'dynamic',
        age: '40s'
      });
      return;
    }

    // 3. One port with multiple MACs for test (mini hub / switch detection!)
    if (p.number === 9 && sw.vendor === 'SNR') {
      records.push({
        mac: '00:1E:67:88:99:AA',
        interface: portName,
        vlan: p.pvid || 20,
        type: 'dynamic',
        age: '25s'
      });
      records.push({
        mac: '00:1E:67:88:99:BB',
        interface: portName,
        vlan: p.pvid || 20,
        type: 'dynamic',
        age: '42s'
      });
      return;
    }

    // 4. Standalone active access port
    if (p.number <= 6 && p.mode === 'access') {
      const mac = `F8:75:A4:11:${(idx * 3 + 20).toString(16).padStart(2, '0').toUpperCase()}:${(p.number * 4 + 10).toString(16).padStart(2, '0').toUpperCase()}`;
      records.push({
        mac: mac,
        interface: portName,
        vlan: p.pvid || 10,
        type: 'dynamic',
        age: `${Math.floor(Math.random() * 80) + 15}s`
      });
    }
  });

  return records;
}

/**
 * Execute Live MAC Discovery against a switch
 */
export async function discoverSwitchMacs(switchId, options = {}, storage) {
  const sw = storage.getSwitchById(switchId);
  if (!sw) throw new Error('Коммутатор не найден');

  const { host = sw.ip, username, password, simulate = false } = options;

  let rawTable = [];
  let isSimulated = simulate || !username || !host;

  if (!isSimulated) {
    try {
      // Determine CLI command based on vendor
      let cliCmd = '';
      if (sw.vendor === 'MikroTik') {
        cliCmd = '/interface bridge host print detail';
      } else if (sw.vendor === 'SNR') {
        cliCmd = 'show mac-address-table';
      } else {
        cliCmd = 'show mac-addr-table';
      }

      // Sanitize username and host to prevent shell argument injection
      const safeHost = String(host || '').trim();
      const safeUser = String(username || '').trim();
      const hostRegex = /^[a-zA-Z0-9.-]+$/;
      const userRegex = /^[a-zA-Z0-9._-]+$/;

      if (!hostRegex.test(safeHost) || !userRegex.test(safeUser)) {
        throw new Error('Некорректный хост или логин SSH (содержит недопустимые символы)');
      }

      // Execute via OpenSSH
      const sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 -p 22 ${safeUser}@${safeHost} "${cliCmd}"`;
      const stdout = await new Promise((resolve, reject) => {
        exec(sshCmd, { timeout: 6000 }, (err, out) => {
          if (err || !out) return reject(err || new Error('Нет ответа от коммутатора'));
          resolve(out);
        });
      });

      if (sw.vendor === 'MikroTik') {
        rawTable = parseMikrotikMacTable(stdout);
      } else if (sw.vendor === 'SNR') {
        rawTable = parseSnrMacTable(stdout);
      } else {
        rawTable = parseUbntMacTable(stdout);
      }
    } catch (err) {
      console.warn(`[Live MAC] SSH подключение к ${host} не удалось (${err.message}). Включаем режим симуляции FDB.`);
      isSimulated = true;
      rawTable = generateSimulatedMacTable(sw, storage);
    }
  } else {
    rawTable = generateSimulatedMacTable(sw, storage);
  }

  // Cross-reference and analyze results
  const ipamList = storage?.data?.ipam || [];
  const patchPanels = storage?.data?.patchPanels || [];

  // Group learned MACs by port
  const portMap = new Map();
  (sw.ports || []).forEach(p => {
    portMap.set(p.name, p);
    portMap.set(`p${p.number}`, p);
    portMap.set(String(p.number), p);
  });

  // Calculate MAC count per port for Hub/Multiple MAC detection
  const macCountByPort = new Map();
  rawTable.forEach(r => {
    const pName = r.interface;
    macCountByPort.set(pName, (macCountByPort.get(pName) || 0) + 1);
  });

  const analyzedRecords = rawTable.map(r => {
    const cleanMac = normalizeMac(r.mac);
    const vendor = lookupVendor(cleanMac);
    
    // Find matching switch port
    const port = portMap.get(r.interface) || 
      (sw.ports || []).find(p => p.name?.toLowerCase() === r.interface?.toLowerCase()) ||
      null;

    // Cross reference IPAM
    const matchedIpam = ipamList.find(a => 
      a.mac && normalizeMac(a.mac) === cleanMac
    ) || null;

    // Cross reference Patch Panel & Socket
    let matchedOutlet = null;
    if (port?.patchPanelId) {
      const pp = patchPanels.find(x => x.id === port.patchPanelId);
      const ppPort = pp?.ports?.find(prt => prt.id === port.patchPanelPortId || prt.number === port.patchPanelPortId);
      if (ppPort) {
        matchedOutlet = {
          socket: ppPort.socket,
          room: ppPort.room,
          cableMark: ppPort.cableMark
        };
      }
    }

    const portMacCount = macCountByPort.get(r.interface) || 1;
    const isTrunk = port?.mode === 'trunk';

    // Status diagnostics
    let status = 'normal';
    let statusLabel = 'Совпадает';

    if (!isTrunk && portMacCount > 1) {
      status = 'multiple';
      statusLabel = `Хаб / Мини-свитч (${portMacCount} MAC)`;
    } else if (port && port.mode === 'access' && r.vlan !== port.pvid) {
      status = 'vlan_mismatch';
      statusLabel = `VLAN расхождение (Порт: ${port.pvid}, MAC: ${r.vlan})`;
    } else if (!matchedIpam && !port?.connectedTo) {
      status = 'new_device';
      statusLabel = 'Новое устройство';
    } else if (matchedIpam) {
      status = 'matched';
      statusLabel = 'В базе IPAM';
    }

    return {
      mac: cleanMac,
      interface: r.interface,
      portNumber: port?.number || null,
      portId: port?.id || null,
      portMode: port?.mode || 'access',
      portPvid: port?.pvid || 1,
      vlan: r.vlan,
      vendor: vendor || 'Неизвестен',
      type: r.type || 'dynamic',
      age: r.age || '—',
      status,
      statusLabel,
      matchedIpam: matchedIpam ? {
        ip: matchedIpam.ip,
        hostname: matchedIpam.hostname,
        type: matchedIpam.type,
        location: matchedIpam.location
      } : null,
      matchedOutlet,
      connectedTo: port?.connectedTo || null
    };
  });

  return {
    switchId: sw.id,
    switchName: sw.name,
    switchModel: sw.model,
    switchIp: host,
    vendor: sw.vendor,
    isSimulated,
    totalLearned: analyzedRecords.length,
    matchedCount: analyzedRecords.filter(r => r.status === 'matched').length,
    newDeviceCount: analyzedRecords.filter(r => r.status === 'new_device').length,
    multipleMacCount: analyzedRecords.filter(r => r.status === 'multiple').length,
    vlanMismatchCount: analyzedRecords.filter(r => r.status === 'vlan_mismatch').length,
    timestamp: new Date().toISOString(),
    records: analyzedRecords
  };
}

/**
 * Apply discovered MAC addresses to ports or IPAM
 */
export function syncDiscoveredMacs(switchId, syncItems = [], storage) {
  const sw = storage.getSwitchById(switchId);
  if (!sw) throw new Error('Коммутатор не найден');

  let updatedPorts = 0;
  let updatedIpam = 0;

  for (const item of syncItems) {
    const { portNumber, mac, hostname, ip, vlan } = item;

    // 1. Update switch port description if port exists
    if (portNumber) {
      const p = sw.ports.find(x => x.number === portNumber);
      if (p) {
        if (!p.connectedTo || p.connectedTo === 'Рабочее место' || p.connectedTo.includes('б/н')) {
          p.connectedTo = hostname ? `${hostname} (${mac})` : `MAC: ${mac}`;
          updatedPorts++;
        }
      }
    }

    // 2. Add or update in IPAM if IP provided or matched
    if (mac) {
      const existing = (storage.data.ipam || []).find(a => normalizeMac(a.mac) === normalizeMac(mac));
      if (!existing && ip) {
        storage.createIpAllocation({
          ip,
          mac: normalizeMac(mac),
          hostname: hostname || `Host-${mac.slice(-5)}`,
          vlanId: vlan || 10,
          type: 'workstation',
          connectedTo: `${sw.name}:p${portNumber}`
        });
        updatedIpam++;
      } else if (existing && !existing.connectedTo) {
        existing.connectedTo = `${sw.name}:p${portNumber}`;
        updatedIpam++;
      }
    }
  }

  storage.save();
  return { success: true, updatedPorts, updatedIpam };
}
