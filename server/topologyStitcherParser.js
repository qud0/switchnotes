/**
 * SNR NAG (SNR-OS) and MikroTik RouterOS Parser Engine for:
 * - LLDP / CDP / MNDP neighbor tables
 * - LACP / Port-Channel / Bonding groups
 * - Spanning Tree (STP / RSTP / MSTP) root bridge and port roles/states
 */

/**
 * Parses SNR-OS 'show lldp info remote-device' output
 * @param {string} raw
 * @returns {Array<{ localPort: string, remoteChassis: string, remotePort: string, remoteSysName: string, remoteMgmtIp: string }>}
 */
export function parseSnrLldp(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const results = [];
  const sections = raw.split(/Local Port:\s*/i);

  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    const lines = sec.split(/\r?\n/);
    const localPort = (lines[0] || '').trim();
    if (!localPort) continue;

    let remoteChassis = '';
    let remotePort = '';
    let remoteSysName = '';
    let remoteMgmtIp = '';

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      const chassisMatch = trimmed.match(/^Chassis ID:\s*(.+)$/i);
      if (chassisMatch) remoteChassis = chassisMatch[1].trim();

      const portMatch = trimmed.match(/^Port ID:\s*(.+)$/i);
      if (portMatch) remotePort = portMatch[1].trim();

      const sysMatch = trimmed.match(/^System Name:\s*(.+)$/i);
      if (sysMatch) remoteSysName = sysMatch[1].trim();

      const ipMatch = trimmed.match(/^Management Address:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/i);
      if (ipMatch) remoteMgmtIp = ipMatch[1].trim();
    }

    if (remotePort || remoteSysName || remoteChassis) {
      results.push({
        localPort,
        remoteChassis,
        remotePort,
        remoteSysName,
        remoteMgmtIp
      });
    }
  }

  return results;
}

/**
 * Parses SNR-OS 'show lacp 1 internal' / 'show link-aggregation' output
 * @param {string} raw
 * @returns {Map<string, { channelId: string, members: string[], mode: string }>}
 */
export function parseSnrLacp(raw) {
  const lacpMap = new Map();
  if (!raw || typeof raw !== 'string') return lacpMap;

  // Split by Port-Channel header
  const sections = raw.split(/(?:Port-Channel\s+(\d+)|Aggregator:\s*(\S+))/i);

  // Alternative line-by-line parsing for various SNR-OS versions
  const lines = raw.split(/\r?\n/);
  let currentChannel = null;
  let currentMembers = [];
  let currentMode = '802.3ad';

  for (const line of lines) {
    const chMatch = line.match(/Port-Channel\s+(\d+|[^\s:]+)/i);
    if (chMatch) {
      if (currentChannel) {
        lacpMap.set(currentChannel, {
          channelId: currentChannel,
          members: currentMembers,
          mode: currentMode
        });
      }
      currentChannel = `Port-Channel ${chMatch[1]}`;
      currentMembers = [];
      currentMode = '802.3ad';
      continue;
    }

    const modeMatch = line.match(/Aggregator Mode:\s*([^\r\n]+)/i);
    if (modeMatch) {
      currentMode = modeMatch[1].trim();
    }

    const membersMatch = line.match(/Member Ports:\s*([^\r\n]+)/i);
    if (membersMatch) {
      const portList = membersMatch[1].split(/,\s*/).map(p => p.trim()).filter(Boolean);
      currentMembers.push(...portList);
    }
  }

  if (currentChannel) {
    lacpMap.set(currentChannel, {
      channelId: currentChannel,
      members: currentMembers,
      mode: currentMode
    });
  }

  return lacpMap;
}

/**
 * Parses SNR-OS Spanning Tree state ('show spanning-tree')
 * @param {string} raw
 * @returns {{ isRootBridge: boolean, rootBridgeId: string, ports: Map<string, { role: string, state: string, isBlocked: boolean }> }}
 */
export function parseSnrStp(raw) {
  const ports = new Map();
  let rootBridgeId = '';
  let localBridgeId = '';

  if (!raw || typeof raw !== 'string') {
    return { isRootBridge: false, rootBridgeId: '', ports };
  }

  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const rootMatch = line.match(/Root Bridge ID:\s*(?:[0-9]+\s*\/\s*)?([0-9a-fA-F:\-_.]+)/i);
    if (rootMatch) rootBridgeId = rootMatch[1].trim();

    const bridgeMatch = line.match(/^Bridge ID:\s*(?:[0-9]+\s*\/\s*)?([0-9a-fA-F:\-_.]+)/i);
    if (bridgeMatch) localBridgeId = bridgeMatch[1].trim();

    // Port line: "Port Ethernet1/0/25: Role: Root, State: Forwarding" or tabular
    const portMatch = line.match(/Port\s+([^\s:]+):\s*Role:\s*([a-zA-Z]+),\s*State:\s*([a-zA-Z]+)/i);
    if (portMatch) {
      const portName = portMatch[1].trim();
      const role = portMatch[2].trim();
      const state = portMatch[3].trim();
      const isBlocked = /discarding|blocking|alternate/i.test(state) || /alternate|backup/i.test(role);
      ports.set(portName, { role, state, isBlocked });
    }
  }

  const isRootBridge = Boolean(
    rootBridgeId && localBridgeId &&
    rootBridgeId.replace(/[^a-fA-F0-9]/g, '').toLowerCase() === localBridgeId.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
  );

  return { isRootBridge, rootBridgeId, ports };
}

/**
 * Parses MikroTik RouterOS '/ip neighbor print detail without-paging'
 * @param {string} raw
 * @returns {Array<{ localPort: string, remoteChassis: string, remotePort: string, remoteSysName: string, remoteMgmtIp: string }>}
 */
export function parseMikrotikNeighbors(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const results = [];
  const entries = raw.split(/(?:^|\n)\s*\d+\s+/m);

  for (const entry of entries) {
    if (!entry.trim()) continue;

    const ifaceMatch = entry.match(/interface=([^\s]+)/i);
    const macMatch = entry.match(/mac-address=([^\s]+)/i);
    const idMatch = entry.match(/identity="?([^"\r\n]+)"?/i);
    const ipMatch = entry.match(/address=([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/i);
    const portMatch = entry.match(/port-identifier="?([^"\r\n]+)"?/i);

    const localPort = ifaceMatch ? ifaceMatch[1].trim() : '';
    const remoteChassis = macMatch ? macMatch[1].trim() : '';
    const remoteSysName = idMatch ? idMatch[1].trim() : '';
    const remoteMgmtIp = ipMatch ? ipMatch[1].trim() : '';
    const remotePort = portMatch ? portMatch[1].trim() : '';

    if (localPort && (remoteSysName || remotePort || remoteChassis || remoteMgmtIp)) {
      results.push({
        localPort,
        remoteChassis,
        remotePort,
        remoteSysName,
        remoteMgmtIp
      });
    }
  }

  return results;
}

/**
 * Parses MikroTik RouterOS '/interface bonding print detail'
 * @param {string} raw
 * @returns {Map<string, { name: string, slaves: string[], mode: string }>}
 */
export function parseMikrotikBonding(raw) {
  const bondMap = new Map();
  if (!raw || typeof raw !== 'string') return bondMap;

  const entries = raw.split(/(?:^|\n)\s*\d+\s+[A-Z\s]*\s*name="/m);

  // Line/attribute parser
  const lines = raw.split(/\r?\n/);
  let currentBond = null;

  for (const line of lines) {
    const nameMatch = line.match(/name="?([^"\s]+)"?/i);
    if (nameMatch) {
      currentBond = {
        name: nameMatch[1].trim(),
        slaves: [],
        mode: '802.3ad'
      };
      bondMap.set(currentBond.name, currentBond);
    }

    if (currentBond) {
      const slavesMatch = line.match(/slaves=([^\s]+)/i);
      if (slavesMatch) {
        currentBond.slaves = slavesMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      }
      const modeMatch = line.match(/mode=([^\s]+)/i);
      if (modeMatch) {
        currentBond.mode = modeMatch[1].trim();
      }
    }
  }

  return bondMap;
}

/**
 * Parses MikroTik RouterOS Spanning Tree:
 * bridge output ('/interface bridge print detail') and port output ('/interface bridge port print detail without-paging')
 * @param {string} bridgeRaw
 * @param {string} portRaw
 * @returns {{ isRootBridge: boolean, ports: Map<string, { role: string, state: string, isBlocked: boolean }> }}
 */
export function parseMikrotikStp(bridgeRaw, portRaw) {
  const ports = new Map();
  let isRootBridge = false;

  if (bridgeRaw && typeof bridgeRaw === 'string') {
    isRootBridge = /root-bridge=yes/i.test(bridgeRaw);
  }

  if (portRaw && typeof portRaw === 'string') {
    const lines = portRaw.split(/\r?\n/);
    for (const line of lines) {
      const ifaceMatch = line.match(/interface=([^\s]+)/i);
      if (!ifaceMatch) continue;

      const portName = ifaceMatch[1].trim();
      const roleMatch = line.match(/role=([^\s]+)/i);
      const statusMatch = line.match(/status=([^\s]+)/i);

      const role = roleMatch ? roleMatch[1].trim().toLowerCase() : 'designated';
      const state = statusMatch ? statusMatch[1].trim().toLowerCase() : 'forwarding';
      const isBlocked = /discarding|disabled|inactive/i.test(state) || /alternate|backup/i.test(role);

      ports.set(portName, {
        role,
        state,
        isBlocked
      });
    }
  }

  return { isRootBridge, ports };
}
