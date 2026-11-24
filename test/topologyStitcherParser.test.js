import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSnrLldp,
  parseSnrLacp,
  parseSnrStp,
  parseMikrotikNeighbors,
  parseMikrotikBonding,
  parseMikrotikStp
} from '../server/topologyStitcherParser.js';

test('parseSnrLldp parses SNR-OS LLDP remote-device output', () => {
  const sample = `
LLDP remote-device information:
Local Port: Ethernet1/0/25
  Chassis ID: 00-11-22-33-44-55
  Port ID: sfp-sfpplus1
  Port Description: 10G Uplink to Core
  System Name: MT-CCR2004-CORE
  System Description: MikroTik RouterOS 7.12
  Management Address: 192.168.10.1

Local Port: Ethernet1/0/26
  Chassis ID: 00-11-22-33-44-66
  Port ID: TenGigabitEthernet1/0/1
  Port Description: Standby Uplink
  System Name: SNR-DIST-02
  Management Address: 192.168.10.3
`;

  const neighbors = parseSnrLldp(sample);
  assert.equal(neighbors.length, 2);
  assert.equal(neighbors[0].localPort, 'Ethernet1/0/25');
  assert.equal(neighbors[0].remotePort, 'sfp-sfpplus1');
  assert.equal(neighbors[0].remoteSysName, 'MT-CCR2004-CORE');
  assert.equal(neighbors[0].remoteMgmtIp, '192.168.10.1');
  assert.equal(neighbors[0].remoteChassis, '00-11-22-33-44-55');

  assert.equal(neighbors[1].localPort, 'Ethernet1/0/26');
  assert.equal(neighbors[1].remoteSysName, 'SNR-DIST-02');
});

test('parseSnrLacp extracts Port-Channel aggregations and members', () => {
  const sample = `
Port-Channel 1:
  Aggregator Mode: 802.3ad
  Member Ports: Ethernet1/0/23, Ethernet1/0/24
  Status: Up

Port-Channel 2:
  Aggregator Mode: Manual
  Member Ports: Ethernet1/0/1, Ethernet1/0/2
  Status: Up
`;

  const lacpMap = parseSnrLacp(sample);
  assert.ok(lacpMap.has('Port-Channel 1'));
  const lag1 = lacpMap.get('Port-Channel 1');
  assert.deepEqual(lag1.members, ['Ethernet1/0/23', 'Ethernet1/0/24']);
  assert.equal(lag1.mode, '802.3ad');

  assert.ok(lacpMap.has('Port-Channel 2'));
});

test('parseSnrStp extracts Spanning Tree root bridge and port roles/states', () => {
  const sample = `
Root Bridge ID: 32768 / 00-01-02-03-04-05
Bridge ID: 32768 / 00-11-22-33-44-55
Port Ethernet1/0/25: Role: Root, State: Forwarding
Port Ethernet1/0/26: Role: Alternate, State: Discarding
Port Ethernet1/0/1: Role: Designated, State: Forwarding
`;

  const stp = parseSnrStp(sample);
  assert.equal(stp.isRootBridge, false);
  assert.equal(stp.rootBridgeId, '00-01-02-03-04-05');
  assert.equal(stp.ports.get('Ethernet1/0/25').role, 'Root');
  assert.equal(stp.ports.get('Ethernet1/0/25').state, 'Forwarding');
  assert.equal(stp.ports.get('Ethernet1/0/25').isBlocked, false);

  assert.equal(stp.ports.get('Ethernet1/0/26').role, 'Alternate');
  assert.equal(stp.ports.get('Ethernet1/0/26').state, 'Discarding');
  assert.equal(stp.ports.get('Ethernet1/0/26').isBlocked, true);
});

test('parseMikrotikNeighbors extracts neighbors from /ip neighbor detail', () => {
  const sample = `
 0 interface=sfp-sfpplus1 mac-address=00:22:33:44:55:66 identity="SNR-S2985G-DIST"
   platform="SNR" version="SNR-OS 7.0.3"
   address=192.168.10.2 port-identifier="Ethernet1/0/25"

 1 interface=ether5 mac-address=AA:BB:CC:DD:EE:FF identity="ACC-SW-01"
   platform="RouterOS" version="7.10"
   address=192.168.10.15 port-identifier="ether1"
`;

  const neighbors = parseMikrotikNeighbors(sample);
  assert.equal(neighbors.length, 2);
  assert.equal(neighbors[0].localPort, 'sfp-sfpplus1');
  assert.equal(neighbors[0].remoteSysName, 'SNR-S2985G-DIST');
  assert.equal(neighbors[0].remotePort, 'Ethernet1/0/25');
  assert.equal(neighbors[0].remoteMgmtIp, '192.168.10.2');
  assert.equal(neighbors[0].remoteChassis, '00:22:33:44:55:66');

  assert.equal(neighbors[1].localPort, 'ether5');
  assert.equal(neighbors[1].remoteSysName, 'ACC-SW-01');
});

test('parseMikrotikBonding extracts bonding interfaces and slave ports', () => {
  const sample = `
Flags: X - disabled, R - running
 0 R name="bonding1" mtu=1500 mac-address=48:A9:8A:11:22:33 arp=enabled
     slaves=sfp-sfpplus1,sfp-sfpplus2 mode=802.3ad primary=none link-monitoring=mii

 1 R name="bonding-servers" mtu=1500 mac-address=48:A9:8A:11:22:44
     slaves=ether7,ether8 mode=802.3ad
`;

  const bondMap = parseMikrotikBonding(sample);
  assert.ok(bondMap.has('bonding1'));
  const b1 = bondMap.get('bonding1');
  assert.deepEqual(b1.slaves, ['sfp-sfpplus1', 'sfp-sfpplus2']);
  assert.equal(b1.mode, '802.3ad');

  assert.ok(bondMap.has('bonding-servers'));
  assert.deepEqual(bondMap.get('bonding-servers').slaves, ['ether7', 'ether8']);
});

test('parseMikrotikStp extracts root bridge status and port roles/states', () => {
  const bridgeSample = `
Flags: X - disabled, R - running
 0 R name="bridge" root-bridge=yes priority=0x8000 protocol-mode=rstp
`;

  const portSample = `
Flags: I - inactive, D - designated, B - backup, A - alternate, R - root
 0 R bridge=bridge interface=sfp-sfpplus1 role=root edge=no status=forwarding
 1 D bridge=bridge interface=ether1 role=designated edge=yes status=forwarding
 2 A bridge=bridge interface=sfp-sfpplus2 role=alternate edge=no status=discarding
`;

  const stp = parseMikrotikStp(bridgeSample, portSample);
  assert.equal(stp.isRootBridge, true);
  assert.equal(stp.ports.get('sfp-sfpplus1').role, 'root');
  assert.equal(stp.ports.get('sfp-sfpplus1').state, 'forwarding');
  assert.equal(stp.ports.get('sfp-sfpplus1').isBlocked, false);

  assert.equal(stp.ports.get('sfp-sfpplus2').role, 'alternate');
  assert.equal(stp.ports.get('sfp-sfpplus2').state, 'discarding');
  assert.equal(stp.ports.get('sfp-sfpplus2').isBlocked, true);
});
