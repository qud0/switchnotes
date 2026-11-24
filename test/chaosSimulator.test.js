import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateChaosNetwork } from '../src/utils/chaosSimulator.js';

test('simulateChaosNetwork returns nominal status when no failures exist', () => {
  const switches = [
    { id: 'sw-core', name: 'Core Switch', role: 'core', ports: [{ number: 1, pvid: 10 }] },
    { id: 'sw-access-1', name: 'Access Switch 1', role: 'access', ports: [{ number: 1, pvid: 10 }] }
  ];
  const links = [
    {
      id: 'lnk-1',
      sourceSwitch: switches[0],
      targetSwitch: switches[1],
      switchAId: 'sw-core',
      switchBId: 'sw-access-1',
      speed: '1G'
    }
  ];

  const result = simulateChaosNetwork({ switches, links });
  assert.equal(result.incidentStatus, 'nominal');
  assert.equal(result.isolatedSwitches.length, 0);
  assert.equal(result.failedLinksCount, 0);
});

test('simulateChaosNetwork detects isolated switch, servers and VLANs upon single uplink cut', () => {
  const switches = [
    { id: 'sw-core', name: 'Core Switch', role: 'core', ports: [] },
    { id: 'sw-access-1', name: 'Access Switch 1', role: 'access', ports: [{ pvid: 20 }, { pvid: 30 }] }
  ];
  const links = [
    {
      id: 'lnk-1',
      sourceSwitch: switches[0],
      targetSwitch: switches[1],
      switchAId: 'sw-core',
      switchBId: 'sw-access-1',
      speed: '1G'
    }
  ];
  const servers = [
    { id: 'srv-1', name: 'ERP Database', switchId: 'sw-access-1', vlanId: 20 }
  ];
  const ipAllocations = [
    { id: 'ip-1', hostname: 'PC-Accounting', switchId: 'sw-access-1', vlanId: 30 }
  ];

  const result = simulateChaosNetwork({
    switches,
    links,
    servers,
    ipAllocations,
    failedLinkIds: ['lnk-1']
  });

  assert.equal(result.incidentStatus, 'partitioned');
  assert.equal(result.isolatedSwitches.length, 1);
  assert.equal(result.isolatedSwitches[0].id, 'sw-access-1');
  assert.equal(result.isolatedServers.length, 1);
  assert.equal(result.isolatedServers[0].name, 'ERP Database');
  assert.equal(result.isolatedEndpoints.length, 1);
  assert.deepEqual(result.affectedVlanIds, [20, 30]);
});

test('simulateChaosNetwork detects RSTP failover and healed status when ring redundant link exists', () => {
  // Triangle Topology: sw-core, sw-dist, sw-access
  const switches = [
    { id: 'sw-core', name: 'Core Switch', role: 'core', stpPriority: 4096, ports: [] },
    { id: 'sw-dist', name: 'Dist Switch', role: 'distribution', stpPriority: 8192, ports: [] },
    { id: 'sw-access', name: 'Access Switch', role: 'access', stpPriority: 32768, ports: [] }
  ];
  const links = [
    { id: 'lnk-core-dist', switchAId: 'sw-core', switchBId: 'sw-dist', speed: '10G', sourceSwitch: switches[0], targetSwitch: switches[1] },
    { id: 'lnk-core-acc', switchAId: 'sw-core', switchBId: 'sw-access', speed: '1G', sourceSwitch: switches[0], targetSwitch: switches[2] },
    { id: 'lnk-dist-acc', switchAId: 'sw-dist', switchBId: 'sw-access', speed: '1G', sourceSwitch: switches[1], targetSwitch: switches[2] }
  ];

  // In baseline, one of the links to sw-access is blocked by STP.
  // When the primary link is severed, the alternate link unblocks!
  const result = simulateChaosNetwork({
    switches,
    links,
    failedLinkIds: ['lnk-core-acc'],
    protocol: 'rstp'
  });

  // Because redundant link lnk-dist-acc exists, sw-access is NOT isolated!
  assert.equal(result.isolatedSwitches.length, 0);
  assert.equal(result.incidentStatus, 'healed');
  assert.equal(result.hasRstpProtection, true);
  assert.equal(result.reroutedLinks.length, 1);
  assert.equal(result.convergenceTime, '0.8–1.2 сек');
});
