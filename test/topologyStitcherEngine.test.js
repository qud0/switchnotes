import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePortName,
  matchSwitch,
  matchPort,
  correlateTopologyLinks,
  aggregateLacpTrunks,
  computeTopologyDiff
} from '../server/topologyStitcherEngine.js';

test('normalizePortName normalizes various vendor port naming styles', () => {
  assert.equal(normalizePortName('Ethernet 1/0/25'), 'ethernet1/0/25');
  assert.equal(normalizePortName('Eth1/0/25'), 'ethernet1/0/25');
  assert.equal(normalizePortName('TenGigabitEthernet 1/0/1'), 'tengigabitethernet1/0/1');
  assert.equal(normalizePortName('sfp-sfpplus1'), 'sfp-sfpplus1');
  assert.equal(normalizePortName('Port 24'), '24');
});

test('matchSwitch matches neighbor by IP, MAC and System Name', () => {
  const switches = [
    { id: 'sw-1', name: 'CORE-CCR2004', ip: '192.168.10.1', mac: '48:A9:8A:11:22:33' },
    { id: 'sw-2', name: 'DIST-SNR-S2985G', ip: '192.168.10.2', mac: '00-11-22-33-44-55' },
    { id: 'sw-3', name: 'ACC-01', ip: '192.168.10.10', mac: 'AA-BB-CC-DD-EE-FF' }
  ];

  // Match by IP
  const matchByIp = matchSwitch(switches, { remoteMgmtIp: '192.168.10.2', remoteSysName: 'Unknown' });
  assert.equal(matchByIp?.id, 'sw-2');

  // Match by MAC
  const matchByMac = matchSwitch(switches, { remoteChassis: '48-a9-8a-11-22-33' });
  assert.equal(matchByMac?.id, 'sw-1');

  // Match by Name
  const matchByName = matchSwitch(switches, { remoteSysName: 'CORE-CCR2004' });
  assert.equal(matchByName?.id, 'sw-1');
});

test('matchPort matches port by ID, number, and normalized name', () => {
  const switchObj = {
    id: 'sw-1',
    ports: [
      { id: 'p1', number: 1, name: 'ether1' },
      { id: 'p25', number: 25, name: 'TenGigabitEthernet 1/0/1' }
    ]
  };

  assert.equal(matchPort(switchObj, 'p1')?.id, 'p1');
  assert.equal(matchPort(switchObj, '1')?.id, 'p1');
  assert.equal(matchPort(switchObj, 'ether1')?.id, 'p1');
  assert.equal(matchPort(switchObj, 'TenGigabitEthernet1/0/1')?.id, 'p25');
  assert.equal(matchPort(switchObj, '25')?.id, 'p25');
});

test('correlateTopologyLinks links switches and correlates STP and LACP data', () => {
  const switches = [
    {
      id: 'sw-core',
      name: 'CORE-MT',
      ip: '192.168.10.1',
      ports: [
        { id: 'p25', number: 25, name: 'sfp-sfpplus1', speed: '10G' },
        { id: 'p26', number: 26, name: 'sfp-sfpplus2', speed: '10G' }
      ]
    },
    {
      id: 'sw-dist',
      name: 'DIST-SNR',
      ip: '192.168.10.2',
      ports: [
        { id: 'p25', number: 25, name: 'Ethernet1/0/25', speed: '10G' },
        { id: 'p26', number: 26, name: 'Ethernet1/0/26', speed: '10G' }
      ]
    }
  ];

  const polledDevices = [
    {
      switchId: 'sw-core',
      neighbors: [
        { localPort: 'sfp-sfpplus1', remoteSysName: 'DIST-SNR', remotePort: 'Ethernet1/0/25', remoteMgmtIp: '192.168.10.2' },
        { localPort: 'sfp-sfpplus2', remoteSysName: 'DIST-SNR', remotePort: 'Ethernet1/0/26', remoteMgmtIp: '192.168.10.2' }
      ],
      lacp: new Map([
        ['bonding1', { name: 'bonding1', slaves: ['sfp-sfpplus1', 'sfp-sfpplus2'], mode: '802.3ad' }]
      ]),
      stp: {
        isRootBridge: true,
        ports: new Map([
          ['sfp-sfpplus1', { role: 'designated', state: 'forwarding', isBlocked: false }],
          ['sfp-sfpplus2', { role: 'designated', state: 'forwarding', isBlocked: false }]
        ])
      }
    },
    {
      switchId: 'sw-dist',
      neighbors: [
        { localPort: 'Ethernet1/0/25', remoteSysName: 'CORE-MT', remotePort: 'sfp-sfpplus1', remoteMgmtIp: '192.168.10.1' },
        { localPort: 'Ethernet1/0/26', remoteSysName: 'CORE-MT', remotePort: 'sfp-sfpplus2', remoteMgmtIp: '192.168.10.1' }
      ],
      lacp: new Map([
        ['Port-Channel 1', { channelId: 'Port-Channel 1', members: ['Ethernet1/0/25', 'Ethernet1/0/26'], mode: '802.3ad' }]
      ]),
      stp: {
        isRootBridge: false,
        ports: new Map([
          ['Ethernet1/0/25', { role: 'root', state: 'forwarding', isBlocked: false }],
          ['Ethernet1/0/26', { role: 'alternate', state: 'discarding', isBlocked: true }]
        ])
      }
    }
  ];

  const { links, rootBridgeId } = correlateTopologyLinks({ switches, polledDevices });
  assert.equal(rootBridgeId, 'sw-core');
  assert.equal(links.length, 2);

  // Link 1: Active forwarding
  const l1 = links.find(l => l.sourcePort.id === 'p25' || l.remotePort.id === 'p25');
  assert.ok(l1);
  assert.equal(l1.isLag, true);
  assert.equal(l1.stp.isBlocked, false);

  // Link 2: Blocked by STP on sw-dist side
  const l2 = links.find(l => l.sourcePort.id === 'p26' || l.remotePort.id === 'p26');
  assert.ok(l2);
  assert.equal(l2.isLag, true);
  assert.equal(l2.stp.isBlocked, true);
  assert.equal(l2.stp.blockingSwitchId, 'sw-dist');
});

test('aggregateLacpTrunks bundles member links into single logical LAG trunk', () => {
  const rawLinks = [
    {
      id: 'l1',
      sourceSwitch: { id: 'sw1' },
      remoteSwitch: { id: 'sw2' },
      sourcePort: { id: 'p1', name: 'eth1', speed: '10G' },
      remotePort: { id: 'p1', name: 'eth1', speed: '10G' },
      isLag: true,
      lagInfo: { lagId: 'LAG-1' },
      capacityMbps: 10000,
      stp: { isBlocked: false }
    },
    {
      id: 'l2',
      sourceSwitch: { id: 'sw1' },
      remoteSwitch: { id: 'sw2' },
      sourcePort: { id: 'p2', name: 'eth2', speed: '10G' },
      remotePort: { id: 'p2', name: 'eth2', speed: '10G' },
      isLag: true,
      lagInfo: { lagId: 'LAG-1' },
      capacityMbps: 10000,
      stp: { isBlocked: false }
    }
  ];

  const aggregated = aggregateLacpTrunks(rawLinks);
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0].isLag, true);
  assert.equal(aggregated[0].memberCount, 2);
  assert.equal(aggregated[0].capacityMbps, 20000);
});

test('computeTopologyDiff detects NEW_LINK, MISSING_LINK, and MATCHED links', () => {
  const switches = [
    {
      id: 'sw1',
      name: 'SW1',
      ports: [
        { id: 'p1', number: 1, linkedSwitchId: 'sw2', linkedPortId: 'p1', pvid: 10, taggedVlans: [20] },
        { id: 'p2', number: 2, linkedSwitchId: 'sw2', linkedPortId: 'p2' }, // Missing in hardware!
        { id: 'p3', number: 3, linkedSwitchId: null, linkedPortId: null }    // Discovered in hardware!
      ]
    },
    {
      id: 'sw2',
      name: 'SW2',
      ports: [
        { id: 'p1', number: 1, linkedSwitchId: 'sw1', linkedPortId: 'p1', pvid: 10, taggedVlans: [20] },
        { id: 'p2', number: 2, linkedSwitchId: 'sw1', linkedPortId: 'p2' },
        { id: 'p3', number: 3, linkedSwitchId: null, linkedPortId: null }
      ]
    }
  ];

  const discoveredLinks = [
    {
      id: 'stitch-sw1-p1-sw2-p1',
      sourceSwitch: { id: 'sw1', name: 'SW1' },
      sourcePort: { id: 'p1', number: 1 },
      remoteSwitch: { id: 'sw2', name: 'SW2' },
      remotePort: { id: 'p1', number: 1 }
    },
    {
      id: 'stitch-sw1-p3-sw2-p3',
      sourceSwitch: { id: 'sw1', name: 'SW1' },
      sourcePort: { id: 'p3', number: 3 },
      remoteSwitch: { id: 'sw2', name: 'SW2' },
      remotePort: { id: 'p3', number: 3 }
    }
  ];

  const diff = computeTopologyDiff({ switches, discoveredLinks });
  assert.equal(diff.matched.length, 1);
  assert.equal(diff.matched[0].id, 'stitch-sw1-p1-sw2-p1');

  assert.equal(diff.newLinks.length, 1);
  assert.equal(diff.newLinks[0].id, 'stitch-sw1-p3-sw2-p3');

  assert.equal(diff.missingLinks.length, 1);
  assert.equal(diff.missingLinks[0].sourcePort.id, 'p2');
});
