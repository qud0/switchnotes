/**
 * Topology Correlation, LACP Bundling & Diff Engine
 * Processes discovered LLDP/CDP neighbor tables, matches devices against SwitchBook storage,
 * aggregates LACP bundles and identifies STP blocked standby links and configuration discrepancies.
 */

/**
 * Normalizes vendor port name to canonical representation for matching
 * @param {string|number} name
 * @returns {string}
 */
export function normalizePortName(name) {
  if (name === null || name === undefined) return '';
  let str = String(name).trim().toLowerCase();
  // Strip 'port ' or 'порты '
  str = str.replace(/^(?:port|порт)\s+/i, '');
  // Normalize ethernet prefixes
  str = str.replace(/\s+/g, '');
  str = str.replace(/^eth(\d)/, 'ethernet$1');
  str = str.replace(/^gi(?:gabitethernet)?(\d)/, 'ethernet$1');
  str = str.replace(/^te(?:ngigabitethernet)?(\d)/, 'tengigabitethernet$1');
  return str;
}

/**
 * Normalizes MAC address string for matching
 * @param {string} mac
 * @returns {string}
 */
function normalizeMac(mac) {
  if (!mac || typeof mac !== 'string') return '';
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

/**
 * Matches discovered neighbor against SwitchBook switches list
 * @param {Array<object>} switches
 * @param {{ remoteMgmtIp?: string, remoteChassis?: string, remoteSysName?: string }} neighbor
 * @returns {object|null}
 */
export function matchSwitch(switches, neighbor) {
  if (!Array.isArray(switches) || !neighbor) return null;

  const targetIp = (neighbor.remoteMgmtIp || '').trim();
  const targetMac = normalizeMac(neighbor.remoteChassis);
  const targetSysName = (neighbor.remoteSysName || '').trim().toLowerCase();

  // 1. Exact match by Management IP
  if (targetIp) {
    const swByIp = switches.find(s => s.ip && s.ip.trim() === targetIp);
    if (swByIp) return swByIp;
  }

  // 2. Exact match by MAC address
  if (targetMac) {
    const swByMac = switches.find(s => {
      const swMac = normalizeMac(s.mac);
      return swMac && swMac === targetMac;
    });
    if (swByMac) return swByMac;
  }

  // 3. Match by System Name / Hostname
  if (targetSysName) {
    const swByName = switches.find(s => {
      const name = (s.name || '').trim().toLowerCase();
      const hostname = (s.hostname || '').trim().toLowerCase();
      return name === targetSysName || hostname === targetSysName ||
             (name && targetSysName.includes(name)) ||
             (targetSysName && name.includes(targetSysName));
    });
    if (swByName) return swByName;
  }

  return null;
}

/**
 * Matches port within a switch by ID, number, or normalized name
 * @param {object} switchObj
 * @param {string|number} portIdentifier
 * @returns {object|null}
 */
export function matchPort(switchObj, portIdentifier) {
  if (!switchObj || !switchObj.ports || !Array.isArray(switchObj.ports)) return null;
  const target = String(portIdentifier || '').trim();
  if (!target) return null;

  const targetNorm = normalizePortName(target);

  // 1. Direct ID match
  const byId = switchObj.ports.find(p => String(p.id) === target);
  if (byId) return byId;

  // 2. Numeric match (by port number)
  const num = parseInt(target.replace(/\D/g, ''), 10);
  if (!isNaN(num)) {
    const byNum = switchObj.ports.find(p => p.number === num);
    if (byNum && (String(p => p.number) === target || target.toLowerCase().includes('port') || /^\d+$/.test(target))) {
      return byNum;
    }
  }

  // 3. Normalized name match
  const byName = switchObj.ports.find(p => {
    const pNorm = normalizePortName(p.name);
    return pNorm === targetNorm || (p.number && String(p.number) === target);
  });
  if (byName) return byName;

  // 4. Fallback: match by number if exact number exists
  if (!isNaN(num)) {
    const byNumFallback = switchObj.ports.find(p => p.number === num);
    if (byNumFallback) return byNumFallback;
  }

  return null;
}

/**
 * Correlates discovered LLDP/CDP neighbors across all polled switches,
 * injecting LACP trunk and STP states.
 * @param {{ switches: Array<object>, polledDevices: Array<object> }} param0
 * @returns {{ links: Array<object>, rootBridgeId: string|null }}
 */
export function correlateTopologyLinks({ switches = [], polledDevices = [] }) {
  const switchMap = new Map();
  switches.forEach(sw => switchMap.set(sw.id, sw));

  const linkMap = new Map();
  let rootBridgeId = null;

  // 1. Find root bridge among polled devices
  for (const dev of polledDevices) {
    if (dev.stp?.isRootBridge) {
      rootBridgeId = dev.switchId;
      break;
    }
  }

  // 2. Process neighbor entries
  for (const dev of polledDevices) {
    const swA = switchMap.get(dev.switchId);
    if (!swA) continue;

    const neighbors = dev.neighbors || [];
    const lacpMap = dev.lacp || new Map();
    const stpState = dev.stp?.ports || new Map();

    for (const n of neighbors) {
      const portA = matchPort(swA, n.localPort);
      if (!portA) continue;

      const swB = matchSwitch(switches, n);
      const portB = swB ? matchPort(swB, n.remotePort) : null;

      // Check LACP on swA side
      let lagInfo = null;
      let isLag = false;
      for (const [lagId, lag] of lacpMap.entries()) {
        const members = lag.members || lag.slaves || [];
        if (members.some(m => normalizePortName(m) === normalizePortName(portA.name) || normalizePortName(m) === normalizePortName(n.localPort))) {
          isLag = true;
          lagInfo = {
            lagId,
            members,
            mode: lag.mode || '802.3ad'
          };
          break;
        }
      }

      // Check STP on swA side
      let stpA = { role: 'designated', state: 'forwarding', isBlocked: false };
      for (const [pName, pStp] of stpState.entries()) {
        if (normalizePortName(pName) === normalizePortName(portA.name) || normalizePortName(pName) === normalizePortName(n.localPort)) {
          stpA = pStp;
          break;
        }
      }

      // Determine speed / capacity
      const speedStr = (portA.speed || portA.type || '').toLowerCase();
      let capacityMbps = 1000;
      if (/40g/i.test(speedStr)) capacityMbps = 40000;
      else if (/10g|sfpplus|sfp\+/i.test(speedStr)) capacityMbps = 10000;
      else if (/100m|fe|fast/i.test(speedStr)) capacityMbps = 100;

      // Unique canonical pair key
      const isKnownTarget = Boolean(swB && portB);
      const pairKey = isKnownTarget
        ? [ `${swA.id}:${portA.id}`, `${swB.id}:${portB.id}` ].sort().join('<->')
        : `${swA.id}:${portA.id}->${n.remoteSysName || n.remoteMgmtIp}:${n.remotePort}`;

      if (linkMap.has(pairKey)) {
        // Link seen from the other side: enrich with reverse STP data
        const existing = linkMap.get(pairKey);
        existing.bidirectional = true;

        if (stpA.isBlocked) {
          existing.stp.isBlocked = true;
          existing.stp.blockingSwitchId = swA.id;
          existing.stp.blockingPortName = portA.name;
        }
        if (isLag) {
          existing.isLag = true;
          if (!existing.lagInfo) existing.lagInfo = lagInfo;
        }
        continue;
      }

      const linkObj = {
        id: `stitch-${swA.id}-${portA.id}-${swB ? swB.id : 'ext'}-${portB ? portB.id : 'unknown'}`,
        protocol: n.protocol || 'LLDP',
        sourceSwitch: {
          id: swA.id,
          name: swA.name,
          vendor: swA.vendor || 'Unknown',
          ip: swA.ip
        },
        sourcePort: {
          id: portA.id,
          name: portA.name || `Port ${portA.number}`,
          number: portA.number,
          speed: portA.speed || '1G',
          pvid: portA.pvid,
          taggedVlans: portA.taggedVlans || []
        },
        remoteSwitch: swB ? {
          id: swB.id,
          name: swB.name,
          vendor: swB.vendor || 'Unknown',
          ip: swB.ip,
          isExternal: false
        } : {
          id: null,
          name: n.remoteSysName || n.remoteMgmtIp || 'Внешнее устройство',
          vendor: 'Unknown',
          ip: n.remoteMgmtIp || '',
          isExternal: true
        },
        remotePort: portB ? {
          id: portB.id,
          name: portB.name || `Port ${portB.number}`,
          number: portB.number,
          speed: portB.speed || '1G',
          pvid: portB.pvid,
          taggedVlans: portB.taggedVlans || []
        } : {
          id: null,
          name: n.remotePort || 'Unknown',
          number: null,
          speed: '1G'
        },
        isLag,
        lagInfo,
        capacityMbps,
        stp: {
          isBlocked: Boolean(stpA.isBlocked),
          blockingSwitchId: stpA.isBlocked ? swA.id : null,
          blockingPortName: stpA.isBlocked ? portA.name : null,
          sourceRole: stpA.role,
          sourceState: stpA.state
        },
        bidirectional: false
      };

      linkMap.set(pairKey, linkObj);
    }
  }

  return {
    links: Array.from(linkMap.values()),
    rootBridgeId
  };
}

/**
 * Aggregates individual physical links belonging to the same LACP/LAG trunk
 * @param {Array<object>} links
 * @returns {Array<object>}
 */
export function aggregateLacpTrunks(links) {
  if (!Array.isArray(links)) return [];
  const result = [];
  const lagGroups = new Map();

  for (const link of links) {
    if (link.isLag && link.sourceSwitch?.id && link.remoteSwitch?.id) {
      const swPair = [link.sourceSwitch.id, link.remoteSwitch.id].sort().join('::');
      const lagKey = `${swPair}::${link.lagInfo?.lagId || 'lag'}`;

      if (!lagGroups.has(lagKey)) {
        lagGroups.set(lagKey, {
          ...link,
          memberLinks: [link],
          memberCount: 1,
          capacityMbps: link.capacityMbps || 1000
        });
        result.push(lagGroups.get(lagKey));
      } else {
        const group = lagGroups.get(lagKey);
        group.memberLinks.push(link);
        group.memberCount++;
        group.capacityMbps += (link.capacityMbps || 1000);
        if (link.stp?.isBlocked) {
          group.stp.isBlocked = true;
          group.stp.blockingSwitchId = link.stp.blockingSwitchId;
        }
      }
    } else {
      result.push(link);
    }
  }

  return result;
}

/**
 * Computes topology diff between SwitchBook DB and live discovered links
 * @param {{ switches: Array<object>, discoveredLinks: Array<object> }} param0
 * @returns {{ matched: Array<object>, newLinks: Array<object>, missingLinks: Array<object>, mismatches: Array<object> }}
 */
export function computeTopologyDiff({ switches = [], discoveredLinks = [] }) {
  const matched = [];
  const newLinks = [];
  const missingLinks = [];
  const mismatches = [];

  // Build map of existing links in SwitchBook
  const existingDbLinks = new Map();
  switches.forEach(swA => {
    (swA.ports || []).forEach(portA => {
      if (portA.linkedSwitchId && portA.linkedPortId) {
        const swB = switches.find(s => s.id === portA.linkedSwitchId);
        const portB = swB?.ports?.find(p => p.id === portA.linkedPortId);

        const pairKey = [ `${swA.id}:${portA.id}`, `${portA.linkedSwitchId}:${portA.linkedPortId}` ].sort().join('<->');

        if (!existingDbLinks.has(pairKey)) {
          existingDbLinks.set(pairKey, {
            id: `db-${pairKey}`,
            sourceSwitch: { id: swA.id, name: swA.name },
            sourcePort: { id: portA.id, number: portA.number, name: portA.name, pvid: portA.pvid, taggedVlans: portA.taggedVlans },
            remoteSwitch: swB ? { id: swB.id, name: swB.name } : { id: portA.linkedSwitchId, name: 'Unknown' },
            remotePort: portB ? { id: portB.id, number: portB.number, name: portB.name, pvid: portB.pvid, taggedVlans: portB.taggedVlans } : { id: portA.linkedPortId, name: 'Unknown' },
            status: 'MISSING_LINK'
          });
        }
      }
    });
  });

  // Compare discovered links against DB
  const seenDbKeys = new Set();

  for (const dLink of discoveredLinks) {
    if (!dLink.sourceSwitch?.id || !dLink.remoteSwitch?.id || !dLink.sourcePort?.id || !dLink.remotePort?.id) {
      continue;
    }

    const pairKey = [
      `${dLink.sourceSwitch.id}:${dLink.sourcePort.id}`,
      `${dLink.remoteSwitch.id}:${dLink.remotePort.id}`
    ].sort().join('<->');

    if (existingDbLinks.has(pairKey)) {
      seenDbKeys.add(pairKey);
      matched.push({
        ...dLink,
        status: 'MATCHED'
      });
    } else {
      // Check if port was linked to something else (mismatch)
      const swA = switches.find(s => s.id === dLink.sourceSwitch.id);
      const portA = swA?.ports?.find(p => p.id === dLink.sourcePort.id);

      if (portA?.linkedSwitchId && portA.linkedSwitchId !== dLink.remoteSwitch.id) {
        mismatches.push({
          ...dLink,
          status: 'MISMATCH_LINK',
          previousLink: {
            linkedSwitchId: portA.linkedSwitchId,
            linkedPortId: portA.linkedPortId
          }
        });
      } else {
        newLinks.push({
          ...dLink,
          status: 'NEW_LINK'
        });
      }
    }
  }

  // Remaining keys in existingDbLinks are missing from hardware
  for (const [key, link] of existingDbLinks.entries()) {
    if (!seenDbKeys.has(key)) {
      missingLinks.push(link);
    }
  }

  return {
    matched,
    newLinks,
    missingLinks,
    mismatches
  };
}
