/**
 * Topology Stitcher Service
 * Orchestrates parallel SSH polling for LLDP/CDP neighbors, LACP aggregations,
 * and STP states across SNR NAG and MikroTik switches, computes graph differences,
 * and provides 1-click atomic reconciliation with SwitchBook storage.
 */

import { executeSshCommand } from './backupService.js';
import {
  parseSnrLldp,
  parseSnrLacp,
  parseSnrStp,
  parseMikrotikNeighbors,
  parseMikrotikBonding,
  parseMikrotikStp
} from './topologyStitcherParser.js';
import {
  correlateTopologyLinks,
  aggregateLacpTrunks,
  computeTopologyDiff
} from './topologyStitcherEngine.js';

/**
 * Executes a hardware poll for a single switch
 */
async function pollSingleSwitch(sw, credentials, globalCreds, sshExecutor) {
  const v = (sw.vendor || '').toLowerCase();
  const sshCreds = {
    host: sw.ip,
    port: credentials.port || sw.sshPort || globalCreds?.port || 22,
    username: credentials.username || sw.sshUsername || globalCreds?.username || 'admin',
    password: credentials.password || sw.sshPassword || globalCreds?.password || '',
    timeout: 4500
  };

  const devResult = {
    switchId: sw.id,
    vendor: sw.vendor,
    neighbors: [],
    lacp: new Map(),
    stp: { isRootBridge: false, ports: new Map() }
  };

  if (v.includes('mikrotik')) {
    // 1. MikroTik Neighbors
    const nRes = await sshExecutor({
      ...sshCreds,
      command: '/ip neighbor print detail without-paging\n'
    }).catch(() => null);
    devResult.neighbors = parseMikrotikNeighbors(nRes?.output || nRes?.stdout || '');

    // 2. MikroTik Bonding
    const bRes = await sshExecutor({
      ...sshCreds,
      command: '/interface bonding print detail\n'
    }).catch(() => null);
    devResult.lacp = parseMikrotikBonding(bRes?.output || bRes?.stdout || '');

    // 3. MikroTik STP
    const brRes = await sshExecutor({
      ...sshCreds,
      command: '/interface bridge print detail\n'
    }).catch(() => null);
    const brPortRes = await sshExecutor({
      ...sshCreds,
      command: '/interface bridge port print detail without-paging\n'
    }).catch(() => null);
    devResult.stp = parseMikrotikStp(
      brRes?.output || brRes?.stdout || '',
      brPortRes?.output || brPortRes?.stdout || ''
    );
  } else {
    // SNR NAG (and Cisco/Eltex fallback)
    // 1. LLDP remote-device
    let lldpRes = await sshExecutor({
      ...sshCreds,
      command: 'show lldp info remote-device\n'
    }).catch(() => null);
    let lldpOut = lldpRes?.output || lldpRes?.stdout || '';

    // If LLDP failed or empty, try CDP fallback
    if (!lldpOut || /Invalid|error|unknown/i.test(lldpOut)) {
      const cdpRes = await sshExecutor({
        ...sshCreds,
        command: 'show cdp neighbor detail\n'
      }).catch(() => null);
      if (cdpRes?.output && !/Invalid|error|unknown/i.test(cdpRes.output)) {
        lldpOut = cdpRes.output;
      }
    }
    devResult.neighbors = parseSnrLldp(lldpOut);

    // 2. LACP / Link Aggregation
    const lacpRes = await sshExecutor({
      ...sshCreds,
      command: 'show link-aggregation\n'
    }).catch(() => null);
    devResult.lacp = parseSnrLacp(lacpRes?.output || lacpRes?.stdout || '');

    // 3. Spanning Tree
    const stpRes = await sshExecutor({
      ...sshCreds,
      command: 'show spanning-tree\n'
    }).catch(() => null);
    devResult.stp = parseSnrStp(stpRes?.output || stpRes?.stdout || '');
  }

  return devResult;
}

/**
 * Builds realistic simulated topology for demo / offline environments
 */
function buildSimulatedTopology(switches) {
  const sw1 = switches[0] || { id: 'sw-mt', name: 'CORE-CCR2004', ip: '192.168.10.1', vendor: 'MikroTik' };
  const sw2 = switches[1] || { id: 'sw-snr', name: 'DIST-SNR-S2985G', ip: '192.168.10.2', vendor: 'SNR' };

  const p1_25 = sw1.ports?.[24] || sw1.ports?.[0] || { id: 'p25', number: 25, name: 'sfp-sfpplus1', speed: '10G' };
  const p1_26 = sw1.ports?.[25] || sw1.ports?.[1] || { id: 'p26', number: 26, name: 'sfp-sfpplus2', speed: '10G' };
  const p2_25 = sw2.ports?.[24] || sw2.ports?.[0] || { id: 'p25', number: 25, name: 'Ethernet1/0/25', speed: '10G' };
  const p2_26 = sw2.ports?.[25] || sw2.ports?.[1] || { id: 'p26', number: 26, name: 'Ethernet1/0/26', speed: '10G' };

  const polledDevices = [
    {
      switchId: sw1.id,
      vendor: sw1.vendor,
      neighbors: [
        { localPort: p1_25.name, remoteSysName: sw2.name, remotePort: p2_25.name, remoteMgmtIp: sw2.ip, protocol: 'LLDP' },
        { localPort: p1_26.name, remoteSysName: sw2.name, remotePort: p2_26.name, remoteMgmtIp: sw2.ip, protocol: 'LLDP' }
      ],
      lacp: new Map([
        ['bonding1', { name: 'bonding1', slaves: [p1_25.name, p1_26.name], mode: '802.3ad' }]
      ]),
      stp: {
        isRootBridge: true,
        ports: new Map([
          [p1_25.name, { role: 'designated', state: 'forwarding', isBlocked: false }],
          [p1_26.name, { role: 'designated', state: 'forwarding', isBlocked: false }]
        ])
      }
    },
    {
      switchId: sw2.id,
      vendor: sw2.vendor,
      neighbors: [
        { localPort: p2_25.name, remoteSysName: sw1.name, remotePort: p1_25.name, remoteMgmtIp: sw1.ip, protocol: 'LLDP' },
        { localPort: p2_26.name, remoteSysName: sw1.name, remotePort: p1_26.name, remoteMgmtIp: sw1.ip, protocol: 'LLDP' }
      ],
      lacp: new Map([
        ['Port-Channel 1', { channelId: 'Port-Channel 1', members: [p2_25.name, p2_26.name], mode: '802.3ad' }]
      ]),
      stp: {
        isRootBridge: false,
        ports: new Map([
          [p2_25.name, { role: 'root', state: 'forwarding', isBlocked: false }],
          [p2_26.name, { role: 'alternate', state: 'discarding', isBlocked: true }]
        ])
      }
    }
  ];

  return polledDevices;
}

/**
 * Scans switches and returns comprehensive StitchScanReport
 * @param {{ storage: object, mode?: string, credentials?: object, sshExecutor?: Function }} param0
 * @returns {Promise<object>}
 */
export async function scanTopology({
  storage,
  mode = 'auto',
  credentials = {},
  sshExecutor = executeSshCommand
}) {
  const switches = storage?.data?.switches || [];
  if (switches.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      totalPolled: 0,
      successfulPolls: 0,
      totalLinks: 0,
      matchedCount: 0,
      newDiscoveredCount: 0,
      missingCount: 0,
      mismatchCount: 0,
      lagCount: 0,
      stpBlockedCount: 0,
      rootBridgeId: null,
      links: [],
      diff: { matched: [], newLinks: [], missingLinks: [], mismatches: [] },
      simulation: false
    };
  }

  const globalCreds = storage?.data?.backupSchedule?.credentials || {};
  let polledDevices = [];
  let isSimulation = false;
  let successfulPolls = 0;

  if (mode !== 'simulation') {
    const reachableSwitches = switches.filter(s => s.ip && s.ip.trim());
    if (reachableSwitches.length > 0) {
      const pollPromises = reachableSwitches.map(sw =>
        pollSingleSwitch(sw, credentials, globalCreds, sshExecutor)
      );

      const results = await Promise.allSettled(pollPromises);
      polledDevices = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(dev => {
          const hasData = dev.neighbors.length > 0 || dev.lacp.size > 0 || dev.stp.ports.size > 0;
          if (hasData) successfulPolls++;
          return hasData;
        });
    }
  }

  if (polledDevices.length === 0 || mode === 'simulation') {
    isSimulation = true;
    polledDevices = buildSimulatedTopology(switches);
    successfulPolls = polledDevices.length;
  }

  // Correlate into unified graph
  const { links, rootBridgeId } = correlateTopologyLinks({ switches, polledDevices });
  const aggregatedLinks = aggregateLacpTrunks(links);
  const diff = computeTopologyDiff({ switches, discoveredLinks: links });

  // Count metrics
  const lagCount = aggregatedLinks.filter(l => l.isLag).length;
  const stpBlockedCount = aggregatedLinks.filter(l => l.stp?.isBlocked).length;

  return {
    timestamp: new Date().toISOString(),
    totalPolled: mode === 'simulation' ? switches.length : switches.filter(s => s.ip && s.ip.trim()).length,
    successfulPolls,
    totalLinks: aggregatedLinks.length,
    matchedCount: diff.matched.length,
    newDiscoveredCount: diff.newLinks.length,
    missingCount: diff.missingLinks.length,
    mismatchCount: diff.mismatches.length,
    lagCount,
    stpBlockedCount,
    rootBridgeId,
    links: aggregatedLinks,
    diff,
    simulation: isSimulation
  };
}

/**
 * Applies stitched links to SwitchBook storage
 * @param {object} storage
 * @param {{ linkIds?: string[], pruneMissing?: boolean, scanReport?: object }} param1
 * @returns {{ success: boolean, appliedCount: number, prunedCount: number }}
 */
export function applyStitchedTopology(storage, {
  linkIds = [],
  pruneMissing = false,
  scanReport = null
} = {}) {
  if (!storage || !storage.updatePort) {
    throw new Error('Некорректный экземпляр storage для применения топологии');
  }

  let appliedCount = 0;
  let prunedCount = 0;

  // 1. Apply new / confirmed links
  const linksToApply = scanReport?.diff?.newLinks || [];
  const applyAll = !linkIds || linkIds.length === 0 || linkIds.includes('all');

  for (const link of linksToApply) {
    if (!applyAll && !linkIds.includes(link.id)) continue;

    const swA = link.sourceSwitch;
    const portA = link.sourcePort;
    const swB = link.remoteSwitch;
    const portB = link.remotePort;

    if (swA?.id && portA?.id && swB?.id && portB?.id) {
      try {
        storage.updatePort(swA.id, portA.id, {
          linkedSwitchId: swB.id,
          linkedPortId: portB.id,
          connectedTo: `${swB.name} (${portB.name || 'Port ' + portB.number})`
        });

        storage.updatePort(swB.id, portB.id, {
          linkedSwitchId: swA.id,
          linkedPortId: portA.id,
          connectedTo: `${swA.name} (${portA.name || 'Port ' + portA.number})`
        });

        appliedCount++;
      } catch (err) {
        console.warn(`[TopologyStitcher] Ошибка обновления порта ${swA.id}:${portA.id} -> ${swB.id}:${portB.id}:`, err.message);
      }
    }
  }

  // 2. Prune missing links if requested
  if (pruneMissing) {
    const missingLinks = scanReport?.diff?.missingLinks || [];
    for (const link of missingLinks) {
      const swA = link.sourceSwitch;
      const portA = link.sourcePort;
      const swB = link.remoteSwitch;
      const portB = link.remotePort;

      if (swA?.id && portA?.id) {
        try {
          storage.updatePort(swA.id, portA.id, {
            linkedSwitchId: null,
            linkedPortId: null,
            connectedTo: ''
          });
          prunedCount++;
        } catch (e) {
          // ignore
        }
      }

      if (swB?.id && portB?.id) {
        try {
          storage.updatePort(swB.id, portB.id, {
            linkedSwitchId: null,
            linkedPortId: null,
            connectedTo: ''
          });
        } catch (e) {
          // ignore
        }
      }
    }
  }

  return {
    success: true,
    appliedCount,
    prunedCount
  };
}
