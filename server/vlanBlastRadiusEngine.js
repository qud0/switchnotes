/**
 * vlanBlastRadiusEngine.js
 * Advanced Graph-Analysis Engine and Blast Radius Simulator for VLAN reconfigurations.
 * Simulates hypothetical changes on access ports and trunks, verifies Guardrails,
 * calculates impacted assets (Switches, IPAM subnets, Servers, Ports),
 * and generates safe vendor CLI scripts for SNR NAG and MikroTik RouterOS.
 */

/**
 * Converts IPv4 dotted string to 32-bit unsigned integer.
 * @param {string} ip
 * @returns {number}
 */
export function ipToLong(ip) {
  if (!ip) return 0;
  return ip.trim().split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

/**
 * Checks if an IP address belongs to a CIDR subnet block.
 * @param {string} ip
 * @param {string} cidr
 * @returns {boolean}
 */
export function isIpInSubnet(ip, cidr) {
  if (!ip || !cidr || !cidr.includes('/')) return false;
  const [subIp, prefixStr] = cidr.split('/');
  const prefix = Number.parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const targetLong = ipToLong(ip);
  const subLong = ipToLong(subIp);
  return (targetLong & mask) === (subLong & mask);
}

export class VlanBlastRadiusEngine {
  constructor(storage = null) {
    this.storage = storage;
  }

  /**
   * Resolves the management VLAN for a switch using CIDR matching or switch property.
   * @param {Object} switchItem
   * @param {Array} vlans
   * @returns {number|null}
   */
  resolveSwitchManagementVlan(switchItem = {}, vlans = []) {
    if (switchItem.managementVlan) {
      return Number(switchItem.managementVlan);
    }

    const swIp = switchItem.ip ? switchItem.ip.trim() : '';
    if (!swIp) return null;

    for (const v of vlans) {
      if (v.subnet && isIpInSubnet(swIp, v.subnet)) {
        return Number(v.id);
      }
    }

    return null;
  }

  /**
   * Builds an L2 topology adjacency map for a specific VLAN.
   * An edge exists only if both linked ports carry/allow that VLAN.
   * @param {Array} switches
   * @param {number} vlanId
   * @returns {Map<string, Array<{ neighborId: string, port: Object, neighborPort: Object }>>}
   */
  buildTopologyAdjacency(switches = [], vlanId = 1) {
    const adj = new Map();
    switches.forEach(s => adj.set(String(s.id), []));

    // Lookup table for ports
    const portMap = new Map();
    switches.forEach(s => {
      (s.ports || []).forEach(p => {
        portMap.set(`${s.id}:${p.id}`, p);
        if (p.number !== undefined) {
          portMap.set(`${s.id}:${p.number}`, p);
        }
      });
    });

    const isVlanAllowedOnPort = (p) => {
      if (!p) return false;
      const vid = Number(vlanId);
      const isTrunk = p.mode === 'trunk' || (!p.mode && Array.isArray(p.taggedVlans) && p.taggedVlans.length > 0);
      if (isTrunk) {
        const tagged = (p.taggedVlans || []).map(Number);
        const untagged = p.untaggedVlan ? Number(p.untaggedVlan) : (p.pvid ? Number(p.pvid) : null);
        return tagged.includes(vid) || untagged === vid;
      }
      return Number(p.vlan) === vid;
    };

    switches.forEach(sw => {
      const swId = String(sw.id);
      (sw.ports || []).forEach(port => {
        if (!port.linkedSwitchId || !port.linkedPortId) return;
        const neighborId = String(port.linkedSwitchId);
        const neighborPort = portMap.get(`${neighborId}:${port.linkedPortId}`);

        if (!neighborPort) return;

        // Both ends must allow this VLAN
        if (isVlanAllowedOnPort(port) && isVlanAllowedOnPort(neighborPort)) {
          adj.get(swId)?.push({
            neighborId,
            port,
            neighborPort
          });
        }
      });
    });

    return adj;
  }

  /**
   * Verifies whether switch management IPs remain reachable from the anchor gateway/core.
   * @param {Array} clonedSwitches
   * @param {number[]} affectedVlanIds
   * @returns {{ safe: boolean, isolatedSwitchIds: string[], violations: string[] }}
   */
  verifyManagementReachability(clonedSwitches = [], affectedVlanIds = []) {
    const vlans = this.storage?.getVlans ? this.storage.getVlans() : [];
    const isolatedSwitchIds = [];
    const violations = [];

    if (!clonedSwitches || clonedSwitches.length <= 1) {
      return { safe: true, isolatedSwitchIds: [], violations: [] };
    }

    // Anchor: core switch or switch with gateway or first switch
    const anchorSw = clonedSwitches.find(s => s.role === 'core') ||
                     clonedSwitches.find(s => s.ip && vlans.some(v => v.gateway === s.ip)) ||
                     clonedSwitches[0];

    const anchorId = String(anchorSw.id);

    // Group switches by their management VLAN
    const switchesByMgVlan = new Map();
    clonedSwitches.forEach(s => {
      const mgVlan = this.resolveSwitchManagementVlan(s, vlans);
      if (mgVlan) {
        if (!switchesByMgVlan.has(mgVlan)) {
          switchesByMgVlan.set(mgVlan, []);
        }
        switchesByMgVlan.get(mgVlan).push(s);
      }
    });

    const affectedSet = new Set((affectedVlanIds || []).map(Number));

    // Test reachability for each management VLAN that was touched
    for (const [mgVlan, swGroup] of switchesByMgVlan.entries()) {
      if (affectedSet.size > 0 && !affectedSet.has(mgVlan)) {
        continue; // This management VLAN was not touched by the change
      }

      const adj = this.buildTopologyAdjacency(clonedSwitches, mgVlan);

      // BFS from anchor
      const visited = new Set();
      const queue = [anchorId];
      visited.add(anchorId);

      while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = adj.get(curr) || [];
        for (const edge of neighbors) {
          if (!visited.has(edge.neighborId)) {
            visited.add(edge.neighborId);
            queue.push(edge.neighborId);
          }
        }
      }

      // Check if any switch in this management VLAN was disconnected from anchor
      for (const sw of swGroup) {
        const swId = String(sw.id);
        if (swId !== anchorId && !visited.has(swId)) {
          isolatedSwitchIds.push(sw.id);
          violations.push(
            `Коммутатор ${sw.name} (${sw.ip || 'no-ip'}) потеряет доступ к шлюзу по умолчанию в Management VLAN ${mgVlan}. Устройство станет неуправляемым!`
          );
        }
      }
    }

    return {
      safe: isolatedSwitchIds.length === 0,
      isolatedSwitchIds,
      violations
    };
  }

  /**
   * Detects if downstream switches lose transit connectivity for any affected VLAN.
   * @param {Array} clonedSwitches
   * @param {number[]} affectedVlanIds
   * @returns {Array<{ switchId: string, switchName: string, vlanId: number, disconnectedPorts: Array }>}
   */
  detectTransitPartitions(clonedSwitches = [], affectedVlanIds = []) {
    const vlans = this.storage?.getVlans ? this.storage.getVlans() : [];
    const partitions = [];

    if (!clonedSwitches || clonedSwitches.length === 0) return partitions;

    for (const vId of affectedVlanIds) {
      const vid = Number(vId);
      const vlanObj = vlans.find(v => Number(v.id) === vid);

      // Root anchor for this VLAN: Core switch or switch with gateway or first switch
      const anchorSw = clonedSwitches.find(s => s.role === 'core') ||
                       (vlanObj?.gateway ? clonedSwitches.find(s => s.ip === vlanObj.gateway) : null) ||
                       clonedSwitches[0];

      if (!anchorSw) continue;

      const adj = this.buildTopologyAdjacency(clonedSwitches, vid);
      const visited = new Set();
      const queue = [String(anchorSw.id)];
      visited.add(String(anchorSw.id));

      while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = adj.get(curr) || [];
        for (const edge of neighbors) {
          if (!visited.has(edge.neighborId)) {
            visited.add(edge.neighborId);
            queue.push(edge.neighborId);
          }
        }
      }

      // Check switches not reached from anchor
      clonedSwitches.forEach(sw => {
        const swId = String(sw.id);
        if (!visited.has(swId)) {
          // Find access ports on this switch configured for this VLAN
          const disconnectedPorts = (sw.ports || []).filter(p => {
            const isTrunk = p.mode === 'trunk' || (!p.mode && Array.isArray(p.taggedVlans) && p.taggedVlans.length > 0);
            return !isTrunk && Number(p.vlan) === vid;
          });

          if (disconnectedPorts.length > 0) {
            partitions.push({
              switchId: sw.id,
              switchName: sw.name,
              vlanId: vid,
              disconnectedPorts
            });
          }
        }
      });
    }

    return partitions;
  }

  /**
   * Calculates impacted assets: servers, IPAM hosts, and subnets.
   * @param {Object} params
   * @param {Array} params.clonedSwitches
   * @param {string[]} params.isolatedSwitchIds
   * @param {Array} params.disconnectedPortItems - Array of { switchId, portId, number, vlan }
   * @param {number[]} params.affectedVlanIds
   * @returns {{ affectedServers: Array, affectedIpamHosts: Array, affectedSubnets: Array, affectedPortsCount: number }}
   */
  calculateBlastRadiusAssets({
    clonedSwitches = [],
    isolatedSwitchIds = [],
    disconnectedPortItems = [],
    affectedVlanIds = []
  } = {}) {
    const servers = this.storage?.getServers ? this.storage.getServers() : [];
    const ipamRecords = this.storage?.getIpamRecords ? this.storage.getIpamRecords() : (this.storage?.data?.ipam || []);
    const vlans = this.storage?.getVlans ? this.storage.getVlans() : [];
    const patchPanels = this.storage?.getPatchPanels ? this.storage.getPatchPanels() : (this.storage?.data?.patchPanels || []);

    const isolatedSet = new Set((isolatedSwitchIds || []).map(String));
    const affectedVlanSet = new Set((affectedVlanIds || []).map(Number));

    // Fast lookup for disconnected ports: 'swId:portId' or 'swId:portNumber'
    const discPortKeys = new Set();
    disconnectedPortItems.forEach(item => {
      discPortKeys.add(`${item.switchId}:${item.portId}`);
      if (item.number !== undefined) discPortKeys.add(`${item.switchId}:${item.number}`);
    });

    // Also include ports on completely isolated switches
    clonedSwitches.forEach(sw => {
      if (isolatedSet.has(String(sw.id))) {
        (sw.ports || []).forEach(p => {
          discPortKeys.add(`${sw.id}:${p.id}`);
          if (p.number !== undefined) discPortKeys.add(`${sw.id}:${p.number}`);
        });
      }
    });

    // Resolve patch panel ports linked to disconnected switch ports
    const discPpKeys = new Set();
    patchPanels.forEach(pp => {
      (pp.ports || []).forEach(p => {
        if (p.connectedSwitchId && (p.connectedPortId || p.connectedPortNumber !== undefined)) {
          const swKey = `${p.connectedSwitchId}:${p.connectedPortId || p.connectedPortNumber}`;
          if (discPortKeys.has(swKey)) {
            discPpKeys.add(`${pp.id}:${p.id}`);
            discPpKeys.add(`${pp.id}:${p.number}`);
          }
        }
      });
    });

    // Filter affected servers
    const affectedServers = servers.filter(srv => {
      if (srv.switchId && isolatedSet.has(String(srv.switchId))) return true;
      if (srv.switchId && srv.port && discPortKeys.has(`${srv.switchId}:${srv.port}`)) return true;
      if (srv.patchPanelId && srv.patchPanelPort && discPpKeys.has(`${srv.patchPanelId}:${srv.patchPanelPort}`)) return true;
      return false;
    });

    // Filter affected IPAM hosts
    const affectedIpamHosts = ipamRecords.filter(host => {
      if (host.switchId && isolatedSet.has(String(host.switchId))) return true;
      if (host.switchId && host.switchPort && discPortKeys.has(`${host.switchId}:${host.switchPort}`)) return true;
      if (host.patchPanelId && host.patchPanelPort && discPpKeys.has(`${host.patchPanelId}:${host.patchPanelPort}`)) return true;
      return false;
    });

    // Subnets containing affected assets or partitioned VLANs
    const activeImpactVlanIds = new Set();
    disconnectedPortItems.forEach(p => {
      if (p.vlan) activeImpactVlanIds.add(Number(p.vlan));
    });
    affectedServers.forEach(s => {
      if (s.vlan) activeImpactVlanIds.add(Number(s.vlan));
    });
    affectedIpamHosts.forEach(h => {
      if (h.vlan) activeImpactVlanIds.add(Number(h.vlan));
    });

    const affectedSubnets = vlans.filter(v => {
      const vid = Number(v.id);
      return activeImpactVlanIds.has(vid) || (affectedVlanSet.has(vid) && discPortKeys.size > 0);
    });

    const affectedPortsCount = disconnectedPortItems.length;

    return {
      affectedServers,
      affectedIpamHosts,
      affectedSubnets,
      affectedPortsCount
    };
  }

  /**
   * Generates vendor CLI and rollback scripts for SNR and MikroTik.
   * @param {Object} switchItem
   * @param {Object} portItem
   * @param {Object} proposal
   * @param {Object} [peerSwitchItem]
   * @param {Object} [peerPortItem]
   * @returns {{ vendor: string, commands: string[], rollback: string[], peerCommands?: string[], peerRollback?: string[] }}
   */
  generateVendorScripts(switchItem, portItem, proposal, peerSwitchItem = null, peerPortItem = null) {
    const vendor = (switchItem?.vendor || 'SNR').toLowerCase().includes('mikrotik') ? 'MikroTik' : 'SNR';
    const isMikroTik = vendor === 'MikroTik';

    const portName = portItem.name || (isMikroTik ? `ether${portItem.number || 1}` : `GigabitEthernet1/0/${portItem.number || 1}`);
    const commands = [];
    const rollback = [];

    const action = proposal.action;
    const targetVlan = Number(proposal.targetVlanId) || 1;
    const prevVlan = Number(portItem.vlan) || 1;
    const prevTagged = (portItem.taggedVlans || []).map(Number);
    const targetTagged = (proposal.targetVlans || []).map(Number);

    if (isMikroTik) {
      if (action === 'change_access_vlan') {
        commands.push(`/interface bridge port set [find interface="${portName}"] pvid=${targetVlan}`);
        commands.push(`/interface bridge vlan add bridge=bridge-lan vlan-ids=${targetVlan} untagged="${portName}" comment="Set by BlastRadiusSimulator"`);
        rollback.push(`/interface bridge port set [find interface="${portName}"] pvid=${prevVlan}`);
      } else if (action === 'remove_trunk_vlan') {
        commands.push(`/interface bridge vlan set [find vlan-ids=${targetVlan}] tagged=[/interface bridge vlan get [find vlan-ids=${targetVlan}] tagged] comment="Remove ${portName} from vlan ${targetVlan}"`);
        rollback.push(`/interface bridge vlan add bridge=bridge-lan vlan-ids=${targetVlan} tagged="${portName}"`);
      } else if (action === 'add_trunk_vlan') {
        commands.push(`/interface bridge vlan add bridge=bridge-lan vlan-ids=${targetVlan} tagged="${portName}"`);
        rollback.push(`/interface bridge vlan remove [find vlan-ids=${targetVlan}]`);
      } else if (action === 'set_trunk_vlans') {
        commands.push(`/interface bridge port set [find interface="${portName}"] frame-types=admit-only-vlan-tagged ingress-filtering=yes`);
        targetTagged.forEach(vid => {
          commands.push(`/interface bridge vlan add bridge=bridge-lan vlan-ids=${vid} tagged="${portName}"`);
        });
        prevTagged.forEach(vid => {
          rollback.push(`/interface bridge vlan add bridge=bridge-lan vlan-ids=${vid} tagged="${portName}"`);
        });
      }
    } else {
      // SNR NAG (SNR-OS)
      commands.push('configure terminal');
      commands.push(`interface ${portName}`);

      rollback.push('configure terminal');
      rollback.push(`interface ${portName}`);

      if (action === 'change_access_vlan') {
        commands.push(`switchport access vlan ${targetVlan}`);
        rollback.push(`switchport access vlan ${prevVlan}`);
      } else if (action === 'remove_trunk_vlan') {
        commands.push(`switchport trunk allowed vlan remove ${targetVlan}`);
        rollback.push(`switchport trunk allowed vlan add ${targetVlan}`);
      } else if (action === 'add_trunk_vlan') {
        commands.push(`switchport trunk allowed vlan add ${targetVlan}`);
        rollback.push(`switchport trunk allowed vlan remove ${targetVlan}`);
      } else if (action === 'set_trunk_vlans') {
        commands.push(`switchport trunk allowed vlan ${targetTagged.join(',')}`);
        rollback.push(`switchport trunk allowed vlan ${prevTagged.join(',') || 'none'}`);
      }

      commands.push('exit');
      commands.push('write');

      rollback.push('exit');
      rollback.push('write');
    }

    const result = { vendor, commands, rollback };

    // Dual-ended sync on peer port if requested
    if (proposal.syncPeerPort && peerSwitchItem && peerPortItem) {
      const peerRes = this.generateVendorScripts(peerSwitchItem, peerPortItem, { ...proposal, syncPeerPort: false });
      result.peerVendor = peerRes.vendor;
      result.peerCommands = peerRes.commands;
      result.peerRollback = peerRes.rollback;
      result.peerSwitchName = peerSwitchItem.name;
    }

    return result;
  }

  /**
   * Simulates a hypothetical VLAN change on the network topology.
   * @param {Object} proposal
   * @param {string} proposal.switchId
   * @param {string|number} proposal.portId
   * @param {string} proposal.action - 'change_access_vlan' | 'remove_trunk_vlan' | 'add_trunk_vlan' | 'set_trunk_vlans'
   * @param {number} [proposal.targetVlanId]
   * @param {number[]} [proposal.targetVlans]
   * @param {boolean} [proposal.syncPeerPort]
   * @returns {Object} BlastRadiusResult
   */
  simulate(proposal) {
    const rawSwitches = this.storage?.getSwitches ? this.storage.getSwitches() : [];
    const clonedSwitches = JSON.parse(JSON.stringify(rawSwitches));

    const targetSw = clonedSwitches.find(s => String(s.id) === String(proposal.switchId));
    if (!targetSw) {
      throw new Error(`Коммутатор с ID ${proposal.switchId} не найден`);
    }

    const targetPort = (targetSw.ports || []).find(p => String(p.id) === String(proposal.portId) || String(p.number) === String(proposal.portId));
    if (!targetPort) {
      throw new Error(`Порт ${proposal.portId} на коммутаторе ${targetSw.name} не найден`);
    }

    // Find peer port if inter-switch link
    let peerSw = null;
    let peerPort = null;
    if (targetPort.linkedSwitchId && targetPort.linkedPortId) {
      peerSw = clonedSwitches.find(s => String(s.id) === String(targetPort.linkedSwitchId));
      if (peerSw) {
        peerPort = (peerSw.ports || []).find(p => String(p.id) === String(targetPort.linkedPortId) || String(p.number) === String(targetPort.linkedPortId));
      }
    }

    const affectedVlanIds = [];
    const targetVid = Number(proposal.targetVlanId);

    // Apply hypothetical change to cloned port
    if (proposal.action === 'change_access_vlan') {
      if (targetPort.vlan) affectedVlanIds.push(Number(targetPort.vlan));
      if (targetVid) affectedVlanIds.push(targetVid);
      targetPort.vlan = targetVid;
    } else if (proposal.action === 'remove_trunk_vlan') {
      if (targetVid) affectedVlanIds.push(targetVid);
      targetPort.taggedVlans = (targetPort.taggedVlans || []).map(Number).filter(v => v !== targetVid);
      if (proposal.syncPeerPort && peerPort) {
        peerPort.taggedVlans = (peerPort.taggedVlans || []).map(Number).filter(v => v !== targetVid);
      }
    } else if (proposal.action === 'add_trunk_vlan') {
      if (targetVid) affectedVlanIds.push(targetVid);
      const cur = new Set((targetPort.taggedVlans || []).map(Number));
      cur.add(targetVid);
      targetPort.taggedVlans = Array.from(cur);
      if (proposal.syncPeerPort && peerPort) {
        const peerCur = new Set((peerPort.taggedVlans || []).map(Number));
        peerCur.add(targetVid);
        peerPort.taggedVlans = Array.from(peerCur);
      }
    } else if (proposal.action === 'set_trunk_vlans') {
      (targetPort.taggedVlans || []).forEach(v => affectedVlanIds.push(Number(v)));
      (proposal.targetVlans || []).forEach(v => affectedVlanIds.push(Number(v)));
      targetPort.taggedVlans = (proposal.targetVlans || []).map(Number);
      if (proposal.syncPeerPort && peerPort) {
        peerPort.taggedVlans = (proposal.targetVlans || []).map(Number);
      }
    }

    const uniqueAffectedVlans = Array.from(new Set(affectedVlanIds.filter(Boolean)));

    // 1. Management Reachability Guardrails
    const mgmtCheck = this.verifyManagementReachability(clonedSwitches, uniqueAffectedVlans);

    // 2. Transit Partitions (only applicable when modifying trunk ports)
    const isModifyingTrunk = targetPort.mode === 'trunk' || proposal.action.includes('trunk');
    const partitions = isModifyingTrunk ? this.detectTransitPartitions(clonedSwitches, uniqueAffectedVlans) : [];

    // Collect disconnected port items
    const disconnectedPortItems = [];
    partitions.forEach(part => {
      (part.disconnectedPorts || []).forEach(p => {
        disconnectedPortItems.push({
          switchId: part.switchId,
          portId: p.id,
          number: p.number,
          vlan: p.vlan || part.vlanId
        });
      });
    });

    // 3. Asset Blast Radius
    const assets = this.calculateBlastRadiusAssets({
      clonedSwitches,
      isolatedSwitchIds: mgmtCheck.isolatedSwitchIds,
      disconnectedPortItems,
      affectedVlanIds: uniqueAffectedVlans
    });

    // 4. Broken Links list
    const brokenLinks = [];
    if (partitions.length > 0 || !mgmtCheck.safe) {
      if (targetPort.linkedSwitchId) {
        brokenLinks.push({
          fromSwitch: targetSw.name,
          fromPort: targetPort.name || `Port ${targetPort.number}`,
          toSwitch: peerSw ? peerSw.name : targetPort.linkedSwitchId,
          toPort: peerPort ? (peerPort.name || `Port ${peerPort.number}`) : targetPort.linkedPortId,
          vlanId: targetVid || uniqueAffectedVlans[0] || null
        });
      }
    }

    // 5. Risk Assessment
    let riskLevel = 'SAFE';
    let riskScore = 10;
    if (!mgmtCheck.safe) {
      riskLevel = 'CRITICAL';
      riskScore = 95;
    } else if (partitions.length > 0) {
      riskLevel = 'CRITICAL';
      riskScore = 80;
    } else if (assets.affectedServers.length > 0 || assets.affectedPortsCount > 0) {
      riskLevel = 'WARNING';
      riskScore = 45;
    }

    // Summary Text
    let summary = '';
    if (riskLevel === 'CRITICAL') {
      summary = `⚠️ КРИТИЧЕСКИЙ РИСК: изменение изолирует ${mgmtCheck.isolatedSwitchIds.length || partitions.length} коммутатор(ов) и отключит ${assets.affectedPortsCount} портов.`;
    } else if (riskLevel === 'WARNING') {
      summary = `Предупреждение: изменение затронет ${assets.affectedPortsCount} портов доступа и ${assets.affectedServers.length} серверов.`;
    } else {
      summary = `Безопасно: изменение локализовано, несанкционированных разрывов сети не обнаружено.`;
    }

    // 6. Vendor CLI and Rollback
    const cliScript = this.generateVendorScripts(targetSw, targetPort, proposal, peerSw, peerPort);

    // Isolated switch objects
    const isolatedSwitches = clonedSwitches
      .filter(s => mgmtCheck.isolatedSwitchIds.includes(s.id))
      .map(s => ({ id: s.id, name: s.name, ip: s.ip }));

    return {
      riskLevel,
      riskScore,
      summary,
      guardrailViolations: mgmtCheck.violations,
      brokenLinks,
      isolatedSwitches,
      transitPartitions: partitions,
      affectedServers: assets.affectedServers,
      affectedIpamHosts: assets.affectedIpamHosts,
      affectedSubnets: assets.affectedSubnets,
      affectedPortsCount: assets.affectedPortsCount,
      cliScript,
      proposal
    };
  }
}

export const vlanBlastRadiusEngine = new VlanBlastRadiusEngine();
