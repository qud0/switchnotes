import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VlanBlastRadiusEngine } from '../server/vlanBlastRadiusEngine.js';

test('resolveSwitchManagementVlan matches switch IP against VLAN CIDR subnets', () => {
  const engine = new VlanBlastRadiusEngine();
  const vlans = [
    { id: 10, name: 'Management', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
    { id: 20, name: 'Users', subnet: '10.0.0.0/24', gateway: '10.0.0.1' }
  ];

  const sw1 = { id: 'sw-1', ip: '192.168.10.15' };
  const sw2 = { id: 'sw-2', ip: '10.0.0.50' };
  const sw3 = { id: 'sw-3', ip: '172.16.0.1' }; // No matching subnet

  assert.equal(engine.resolveSwitchManagementVlan(sw1, vlans), 10);
  assert.equal(engine.resolveSwitchManagementVlan(sw2, vlans), 20);
  assert.equal(engine.resolveSwitchManagementVlan(sw3, vlans), null);
});

test('verifyManagementReachability flags CRITICAL when uplink trunk pruning cuts off management path', () => {
  const engine = new VlanBlastRadiusEngine();
  const coreSw = {
    id: 'sw-core',
    name: 'CORE-01',
    role: 'core',
    ip: '192.168.10.1',
    ports: [
      { id: 'p-core-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-acc', linkedPortId: 'p-acc-1' }
    ]
  };

  const accSw = {
    id: 'sw-acc',
    name: 'ACC-01',
    role: 'access',
    ip: '192.168.10.10',
    ports: [
      { id: 'p-acc-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-core', linkedPortId: 'p-core-1' }
    ]
  };

  engine.storage = {
    getSwitches: () => [coreSw, accSw],
    getVlans: () => [{ id: 10, subnet: '192.168.10.0/24', gateway: '192.168.10.1' }]
  };

  // Sever VLAN 10 on uplink trunk
  const clonedSwitches = JSON.parse(JSON.stringify([coreSw, accSw]));
  clonedSwitches[0].ports[0].taggedVlans = [20]; // VLAN 10 removed

  const res = engine.verifyManagementReachability(clonedSwitches, [10]);
  assert.equal(res.safe, false);
  assert.ok(res.isolatedSwitchIds.includes('sw-acc'));
  assert.match(res.violations[0], /ACC-01.*потеряет доступ/);
});

test('verifyManagementReachability approves changes that do not affect management path', () => {
  const engine = new VlanBlastRadiusEngine();
  const coreSw = {
    id: 'sw-core',
    name: 'CORE-01',
    role: 'core',
    ip: '192.168.10.1',
    ports: [
      { id: 'p-core-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-acc', linkedPortId: 'p-acc-1' }
    ]
  };

  const accSw = {
    id: 'sw-acc',
    name: 'ACC-01',
    role: 'access',
    ip: '192.168.10.10',
    ports: [
      { id: 'p-acc-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-core', linkedPortId: 'p-core-1' },
      { id: 'p-acc-2', number: 2, mode: 'access', vlan: 20 }
    ]
  };

  engine.storage = {
    getSwitches: () => [coreSw, accSw],
    getVlans: () => [{ id: 10, subnet: '192.168.10.0/24', gateway: '192.168.10.1' }]
  };

  // Changing access port vlan 20 -> 30 does not touch management VLAN 10
  const clonedSwitches = JSON.parse(JSON.stringify([coreSw, accSw]));
  clonedSwitches[1].ports[1].vlan = 30;

  const res = engine.verifyManagementReachability(clonedSwitches, [20, 30]);
  assert.equal(res.safe, true);
  assert.equal(res.isolatedSwitchIds.length, 0);
  assert.equal(res.violations.length, 0);
});

test('detectTransitPartitions detects downstream access ports isolated when VLAN pruned from trunk', () => {
  const engine = new VlanBlastRadiusEngine();
  const coreSw = {
    id: 'sw-core',
    name: 'CORE-01',
    role: 'core',
    ip: '192.168.10.1',
    ports: [
      { id: 'p-core-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-dist', linkedPortId: 'p-dist-1' }
    ]
  };

  const distSw = {
    id: 'sw-dist',
    name: 'DIST-01',
    role: 'distribution',
    ip: '192.168.10.2',
    ports: [
      { id: 'p-dist-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-core', linkedPortId: 'p-core-1' },
      { id: 'p-dist-2', number: 2, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-edge', linkedPortId: 'p-edge-1' }
    ]
  };

  const edgeSw = {
    id: 'sw-edge',
    name: 'EDGE-01',
    role: 'access',
    ip: '192.168.10.3',
    ports: [
      { id: 'p-edge-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-dist', linkedPortId: 'p-dist-2' },
      { id: 'p-edge-2', number: 2, mode: 'access', vlan: 20 },
      { id: 'p-edge-3', number: 3, mode: 'access', vlan: 20 }
    ]
  };

  const switches = [coreSw, distSw, edgeSw];
  engine.storage = {
    getSwitches: () => switches,
    getVlans: () => [
      { id: 10, subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
      { id: 20, subnet: '10.20.0.0/24', gateway: '10.20.0.1' }
    ]
  };

  // Hypothethical change: Prune VLAN 20 on trunk p-dist-2 -> sw-edge
  const cloned = JSON.parse(JSON.stringify(switches));
  cloned[1].ports[1].taggedVlans = [10]; // 20 removed

  const partitions = engine.detectTransitPartitions(cloned, [20]);
  assert.equal(partitions.length, 1);
  assert.equal(partitions[0].switchId, 'sw-edge');
  assert.equal(partitions[0].disconnectedPorts.length, 2);
});

test('calculateBlastRadiusAssets accurately enumerates isolated servers and IPAM records', () => {
  const engine = new VlanBlastRadiusEngine();
  const servers = [
    { id: 'srv-1', name: 'DB-PROD', ip: '10.20.0.15', switchId: 'sw-edge', port: 2, vlan: 20 },
    { id: 'srv-2', name: 'WEB-PROD', ip: '10.10.0.5', switchId: 'sw-core', port: 5, vlan: 10 }
  ];

  const ipamRecords = [
    { id: 'ip-1', ip: '10.20.0.101', hostname: 'user-pc-1', switchId: 'sw-edge', switchPort: 3, vlan: 20 },
    { id: 'ip-2', ip: '10.20.0.102', hostname: 'user-pc-2', switchId: 'sw-dist', switchPort: 5, vlan: 20 }
  ];

  const vlans = [
    { id: 10, name: 'Management', subnet: '192.168.10.0/24' },
    { id: 20, name: 'Users LAN', subnet: '10.20.0.0/24' }
  ];

  engine.storage = {
    getServers: () => servers,
    getIpamRecords: () => ipamRecords,
    getVlans: () => vlans,
    getPatchPanels: () => []
  };

  const assets = engine.calculateBlastRadiusAssets({
    clonedSwitches: [],
    isolatedSwitchIds: [],
    disconnectedPortItems: [
      { switchId: 'sw-edge', portId: 'p-edge-2', number: 2, vlan: 20 },
      { switchId: 'sw-edge', portId: 'p-edge-3', number: 3, vlan: 20 }
    ],
    affectedVlanIds: [20]
  });

  assert.equal(assets.affectedServers.length, 1);
  assert.equal(assets.affectedServers[0].name, 'DB-PROD');
  assert.equal(assets.affectedIpamHosts.length, 1);
  assert.equal(assets.affectedIpamHosts[0].hostname, 'user-pc-1');
  assert.equal(assets.affectedSubnets.length, 1);
  assert.equal(assets.affectedSubnets[0].name, 'Users LAN');
  assert.equal(assets.affectedPortsCount, 2);
});

test('generateVendorScripts produces valid SNR-OS and MikroTik CLI and rollback commands', () => {
  const engine = new VlanBlastRadiusEngine();

  // 1. SNR Switch
  const swSnr = { id: 'sw-snr', name: 'SNR-CORE', vendor: 'SNR' };
  const portSnr = { id: 'p-1', number: 5, mode: 'access', vlan: 10 };
  const proposalSnr = {
    action: 'change_access_vlan',
    targetVlanId: 50
  };

  const scriptsSnr = engine.generateVendorScripts(swSnr, portSnr, proposalSnr);
  assert.equal(scriptsSnr.vendor, 'SNR');
  assert.ok(scriptsSnr.commands.some(c => c.includes('switchport access vlan 50')));
  assert.ok(scriptsSnr.rollback.some(c => c.includes('switchport access vlan 10')));

  // 2. MikroTik RouterOS
  const swMt = { id: 'sw-mt', name: 'MT-ACC', vendor: 'MikroTik' };
  const portMt = { id: 'p-2', number: 3, name: 'ether3', mode: 'access', vlan: 20 };
  const proposalMt = {
    action: 'change_access_vlan',
    targetVlanId: 60
  };

  const scriptsMt = engine.generateVendorScripts(swMt, portMt, proposalMt);
  assert.equal(scriptsMt.vendor, 'MikroTik');
  assert.ok(scriptsMt.commands.some(c => c.includes('pvid=60')));
  assert.ok(scriptsMt.rollback.some(c => c.includes('pvid=20')));
});

test('simulate end-to-end executes simulation pipeline and returns BlastRadiusResult', () => {
  const engine = new VlanBlastRadiusEngine();
  const coreSw = {
    id: 'sw-core',
    name: 'CORE-01',
    role: 'core',
    ip: '192.168.10.1',
    vendor: 'SNR',
    ports: [
      { id: 'p-core-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-acc', linkedPortId: 'p-acc-1' }
    ]
  };

  const accSw = {
    id: 'sw-acc',
    name: 'ACC-01',
    role: 'access',
    ip: '192.168.10.10',
    vendor: 'SNR',
    ports: [
      { id: 'p-acc-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-core', linkedPortId: 'p-core-1' },
      { id: 'p-acc-2', number: 2, mode: 'access', vlan: 20 }
    ]
  };

  engine.storage = {
    getSwitches: () => [coreSw, accSw],
    getVlans: () => [
      { id: 10, name: 'Mgmt', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
      { id: 20, name: 'Users', subnet: '10.20.0.0/24', gateway: '10.20.0.1' }
    ],
    getServers: () => [],
    getIpamRecords: () => [],
    getPatchPanels: () => []
  };

  // Safe proposal: change access port 2 on accSw from VLAN 20 to VLAN 30
  const safeProposal = {
    switchId: 'sw-acc',
    portId: 'p-acc-2',
    action: 'change_access_vlan',
    targetVlanId: 30
  };

  const safeResult = engine.simulate(safeProposal);
  assert.ok(safeResult);
  assert.equal(safeResult.riskLevel, 'SAFE');
  assert.ok(safeResult.cliScript.commands.length > 0);

  // Unsafe proposal: remove Management VLAN 10 from trunk p-core-1
  const unsafeProposal = {
    switchId: 'sw-core',
    portId: 'p-core-1',
    action: 'remove_trunk_vlan',
    targetVlanId: 10
  };

  const unsafeResult = engine.simulate(unsafeProposal);
  assert.ok(unsafeResult);
  assert.equal(unsafeResult.riskLevel, 'CRITICAL');
  assert.ok(unsafeResult.guardrailViolations.length > 0);
  assert.ok(unsafeResult.isolatedSwitches.length > 0);
});


