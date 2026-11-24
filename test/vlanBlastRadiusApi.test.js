import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VlanBlastRadiusEngine } from '../server/vlanBlastRadiusEngine.js';

test('engine.apply blocks CRITICAL changes if force is not set', async () => {
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

  const switches = [coreSw, accSw];
  engine.storage = {
    getSwitches: () => switches,
    getSwitchById: (id) => switches.find(s => s.id === id),
    updateSwitch: (id, updates) => Object.assign(switches.find(s => s.id === id), updates),
    getVlans: () => [{ id: 10, subnet: '192.168.10.0/24', gateway: '192.168.10.1' }],
    getServers: () => [],
    getIpamRecords: () => [],
    getPatchPanels: () => []
  };

  // Sever Management VLAN 10 from core trunk without force
  const proposal = {
    switchId: 'sw-core',
    portId: 'p-core-1',
    action: 'remove_trunk_vlan',
    targetVlanId: 10,
    force: false
  };

  await assert.rejects(
    async () => {
      await engine.apply(proposal);
    },
    /Guardrails/
  );
});

test('engine.apply successfully applies SAFE change to storage', async () => {
  const engine = new VlanBlastRadiusEngine();

  const sw = {
    id: 'sw-1',
    name: 'SW-1',
    role: 'access',
    ip: '192.168.10.5',
    vendor: 'SNR',
    ports: [
      { id: 'p-1', number: 5, mode: 'access', vlan: 10 }
    ]
  };

  const switches = [sw];
  let updateCalled = false;

  engine.storage = {
    getSwitches: () => switches,
    getSwitchById: (id) => switches.find(s => s.id === id),
    updateSwitch: (id, updates) => {
      updateCalled = true;
      return Object.assign(switches.find(s => s.id === id), updates);
    },
    getVlans: () => [{ id: 10, subnet: '192.168.10.0/24' }],
    getServers: () => [],
    getIpamRecords: () => [],
    getPatchPanels: () => []
  };

  const proposal = {
    switchId: 'sw-1',
    portId: 'p-1',
    action: 'change_access_vlan',
    targetVlanId: 50,
    applyToHardware: false
  };

  const res = await engine.apply(proposal);
  assert.ok(res.success);
  assert.equal(updateCalled, true);
  assert.equal(sw.ports[0].vlan, 50);
});
