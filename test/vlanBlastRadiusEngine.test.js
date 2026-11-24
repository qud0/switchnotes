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
