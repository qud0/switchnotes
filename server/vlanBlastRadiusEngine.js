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
}

export const vlanBlastRadiusEngine = new VlanBlastRadiusEngine();
