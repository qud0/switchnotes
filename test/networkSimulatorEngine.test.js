import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToLong,
  isSameSubnet,
  createLabNode,
  createLabLink,
  simulatePing,
  verifyLabSolution,
  PRESET_LABS
} from '../src/utils/networkSimulatorEngine.js';

test('isSameSubnet accurately checks IPv4 subnet boundaries', () => {
  assert.equal(isSameSubnet('192.168.1.10', '192.168.1.50', '255.255.255.0'), true);
  assert.equal(isSameSubnet('192.168.1.10', '192.168.2.10', '255.255.255.0'), false);
  assert.equal(isSameSubnet('10.0.0.5', '10.0.0.250', '24'), true);
  assert.equal(isSameSubnet('10.0.0.5', '10.0.1.5', '/24'), false);
  assert.equal(isSameSubnet('172.16.0.1', '172.16.255.254', '255.255.0.0'), true);
});

test('createLabNode creates consistent node objects for PC, Switch and Router', () => {
  const pc = createLabNode({ type: 'pc', name: 'Workstation-1', ip: '10.10.10.5' });
  assert.equal(pc.type, 'pc');
  assert.equal(pc.name, 'Workstation-1');
  assert.equal(pc.ip, '10.10.10.5');
  assert.ok(pc.id);

  const sw = createLabNode({ type: 'switch', name: 'Core-SW' });
  assert.equal(sw.type, 'switch');
  assert.equal(sw.ports.length, 8);
  assert.equal(sw.ports[0].mode, 'access');

  const router = createLabNode({ type: 'router', name: 'Border-Router' });
  assert.equal(router.type, 'router');
  assert.ok(router.interfaces.length >= 2);
});

test('simulatePing succeeds between two hosts in the same VLAN on one switch', () => {
  const pc1 = createLabNode({ id: 'pc-1', type: 'pc', ip: '192.168.1.10', mask: '255.255.255.0' });
  const pc2 = createLabNode({ id: 'pc-2', type: 'pc', ip: '192.168.1.20', mask: '255.255.255.0' });
  const sw = createLabNode({
    id: 'sw-1',
    type: 'switch',
    ports: [
      { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
      { id: 'p2', number: 2, mode: 'access', pvid: 10, allowedVlans: [10] }
    ]
  });

  const links = [
    createLabLink({ sourceNodeId: 'pc-1', sourcePortId: 'eth0', targetNodeId: 'sw-1', targetPortId: 'p1' }),
    createLabLink({ sourceNodeId: 'pc-2', sourcePortId: 'eth0', targetNodeId: 'sw-1', targetPortId: 'p2' })
  ];

  const result = simulatePing({
    sourceNodeId: 'pc-1',
    targetNodeId: 'pc-2',
    nodes: [pc1, pc2, sw],
    links
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'SUCCESS');
  assert.ok(result.hops.length >= 2);
  assert.ok(result.summary.includes('192.168.1.10'));
});

test('simulatePing drops packet when target host is in a different isolated VLAN on access port', () => {
  const pc1 = createLabNode({ id: 'pc-1', type: 'pc', ip: '192.168.1.10', mask: '255.255.255.0' });
  const pc2 = createLabNode({ id: 'pc-2', type: 'pc', ip: '192.168.1.20', mask: '255.255.255.0' });
  const sw = createLabNode({
    id: 'sw-1',
    type: 'switch',
    ports: [
      { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
      { id: 'p2', number: 2, mode: 'access', pvid: 20, allowedVlans: [20] } // Different VLAN!
    ]
  });

  const links = [
    createLabLink({ sourceNodeId: 'pc-1', targetNodeId: 'sw-1', targetPortId: 'p1' }),
    createLabLink({ sourceNodeId: 'pc-2', targetNodeId: 'sw-1', targetPortId: 'p2' })
  ];

  const result = simulatePing({
    sourceNodeId: 'pc-1',
    targetNodeId: 'pc-2',
    nodes: [pc1, pc2, sw],
    links
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'ERR_PACKET_DROPPED');
  assert.ok(result.summary.includes('VLAN'));
});

test('simulatePing drops packet on inter-switch trunk when VLAN is not in Allowed VLANs', () => {
  const pc1 = createLabNode({ id: 'pc-1', type: 'pc', ip: '10.0.10.5', mask: '255.255.255.0' });
  const pc2 = createLabNode({ id: 'pc-2', type: 'pc', ip: '10.0.10.6', mask: '255.255.255.0' });

  const sw1 = createLabNode({
    id: 'sw-1',
    type: 'switch',
    ports: [
      { id: 'p1', number: 1, mode: 'access', pvid: 10 },
      { id: 'p8', number: 8, mode: 'trunk', allowedVlans: [1, 20] } // VLAN 10 is missing!
    ]
  });

  const sw2 = createLabNode({
    id: 'sw-2',
    type: 'switch',
    ports: [
      { id: 'p1', number: 1, mode: 'access', pvid: 10 },
      { id: 'p8', number: 8, mode: 'trunk', allowedVlans: [1, 10, 20] }
    ]
  });

  const links = [
    createLabLink({ sourceNodeId: 'pc-1', targetNodeId: 'sw-1', targetPortId: 'p1' }),
    createLabLink({ sourceNodeId: 'sw-1', sourcePortId: 'p8', targetNodeId: 'sw-2', targetPortId: 'p8' }),
    createLabLink({ sourceNodeId: 'sw-2', sourcePortId: 'p1', targetNodeId: 'pc-2', targetPortId: 'eth0' })
  ];

  const result = simulatePing({
    sourceNodeId: 'pc-1',
    targetNodeId: 'pc-2',
    nodes: [pc1, pc2, sw1, sw2],
    links
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'ERR_PACKET_DROPPED');
  assert.ok(result.summary.includes('Allowed VLANs') || result.summary.includes('VLAN 10'));
});

test('simulatePing fails with ERR_NO_GATEWAY when target is in different subnet and gateway missing', () => {
  const pc1 = createLabNode({ id: 'pc-1', type: 'pc', ip: '192.168.10.15', mask: '255.255.255.0', gateway: '' });
  const pc2 = createLabNode({ id: 'pc-2', type: 'pc', ip: '192.168.20.15', mask: '255.255.255.0' });

  const result = simulatePing({
    sourceNodeId: 'pc-1',
    targetNodeId: 'pc-2',
    nodes: [pc1, pc2],
    links: []
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'ERR_NO_GATEWAY');
  assert.ok(result.summary.includes('шлюз'));
});

test('simulatePing routes Inter-VLAN traffic through L3 router with default gateways', () => {
  const pc = createLabNode({ id: 'pc-1', type: 'pc', ip: '192.168.10.5', mask: '255.255.255.0', gateway: '192.168.10.1' });
  const srv = createLabNode({ id: 'srv-1', type: 'server', ip: '192.168.20.100', mask: '255.255.255.0', gateway: '192.168.20.1' });

  const sw = createLabNode({
    id: 'sw-1',
    type: 'switch',
    ports: [
      { id: 'p1', number: 1, mode: 'access', pvid: 10 },
      { id: 'p2', number: 2, mode: 'access', pvid: 20 },
      { id: 'p8', number: 8, mode: 'trunk', allowedVlans: [10, 20] }
    ]
  });

  const router = createLabNode({
    id: 'r-1',
    type: 'router',
    interfaces: [
      { id: 'if-1', vlanId: 10, ip: '192.168.10.1', mask: '255.255.255.0' },
      { id: 'if-2', vlanId: 20, ip: '192.168.20.1', mask: '255.255.255.0' }
    ]
  });

  const links = [
    createLabLink({ sourceNodeId: 'pc-1', targetNodeId: 'sw-1', targetPortId: 'p1' }),
    createLabLink({ sourceNodeId: 'sw-1', sourcePortId: 'p8', targetNodeId: 'r-1', targetPortId: 'eth0' }),
    createLabLink({ sourceNodeId: 'sw-1', sourcePortId: 'p2', targetNodeId: 'srv-1', targetPortId: 'eth0' })
  ];

  const result = simulatePing({
    sourceNodeId: 'pc-1',
    targetNodeId: 'srv-1',
    nodes: [pc, srv, sw, router],
    links
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'SUCCESS');
});

test('PRESET_LABS has 4 valid labs with initial nodes and links', () => {
  assert.equal(PRESET_LABS.length, 4);
  PRESET_LABS.forEach(lab => {
    assert.ok(lab.id);
    assert.ok(lab.title);
    assert.ok(lab.initialNodes.length > 0);
    assert.ok(lab.initialLinks.length > 0);
  });
});

test('verifyLabSolution identifies unfinished and finished states for Lab 1', () => {
  const lab = PRESET_LABS[0];
  // Initially pc-2 has empty IP
  const unfinRes = verifyLabSolution(lab.id, { nodes: lab.initialNodes, links: lab.initialLinks });
  assert.equal(unfinRes.solved, false);

  // Now trainee sets IP on PC-2
  const fixedNodes = lab.initialNodes.map(n => {
    if (n.id === 'pc-2') {
      return { ...n, ip: '192.168.1.20' };
    }
    return n;
  });

  const finRes = verifyLabSolution(lab.id, { nodes: fixedNodes, links: lab.initialLinks });
  assert.equal(finRes.solved, true);
  assert.ok(finRes.feedback.includes('Отлично'));
});
