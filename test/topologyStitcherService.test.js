import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanTopology,
  applyStitchedTopology
} from '../server/topologyStitcherService.js';

test('scanTopology in simulation mode returns structured report with LACP and STP', async () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'mt-core',
          name: 'CORE-CCR2004',
          vendor: 'MikroTik',
          ip: '192.168.10.1',
          ports: [
            { id: 'p25', number: 25, name: 'sfp-sfpplus1', speed: '10G' },
            { id: 'p26', number: 26, name: 'sfp-sfpplus2', speed: '10G' }
          ]
        },
        {
          id: 'snr-dist',
          name: 'DIST-SNR-S2985G',
          vendor: 'SNR',
          ip: '192.168.10.2',
          ports: [
            { id: 'p25', number: 25, name: 'Ethernet1/0/25', speed: '10G' },
            { id: 'p26', number: 26, name: 'Ethernet1/0/26', speed: '10G' }
          ]
        }
      ]
    }
  };

  const report = await scanTopology({ storage: mockStorage, mode: 'simulation' });
  assert.ok(report.timestamp);
  assert.equal(report.simulation, true);
  assert.ok(report.links.length > 0);
  assert.ok(report.diff.newLinks.length > 0);
  assert.ok(report.lagCount >= 1);
});

test('scanTopology with mock SSH executor polls SNR and MikroTik hardware', async () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'mt-1',
          name: 'CORE-MT',
          vendor: 'MikroTik',
          ip: '192.168.10.1',
          ports: [
            { id: 'p1', number: 1, name: 'sfp-sfpplus1', speed: '10G' }
          ]
        },
        {
          id: 'snr-1',
          name: 'DIST-SNR',
          vendor: 'SNR',
          ip: '192.168.10.2',
          ports: [
            { id: 'p1', number: 1, name: 'Ethernet1/0/1', speed: '10G' }
          ]
        }
      ]
    }
  };

  const mockSsh = async ({ host, command }) => {
    if (host === '192.168.10.1') {
      if (command.includes('/ip neighbor')) {
        return {
          output: `0 interface=sfp-sfpplus1 mac-address=00:11:22:33:44:55 identity="DIST-SNR" address=192.168.10.2 port-identifier="Ethernet1/0/1"`
        };
      }
      if (command.includes('/interface bonding')) {
        return { output: '' };
      }
      if (command.includes('/interface bridge print')) {
        return { output: '0 R name="bridge" root-bridge=yes' };
      }
      if (command.includes('/interface bridge port')) {
        return { output: '0 R bridge=bridge interface=sfp-sfpplus1 role=designated status=forwarding' };
      }
    } else if (host === '192.168.10.2') {
      if (command.includes('show lldp info')) {
        return {
          output: `Local Port: Ethernet1/0/1\n  Chassis ID: 48-a9-8a-11-22-33\n  Port ID: sfp-sfpplus1\n  System Name: CORE-MT\n  Management Address: 192.168.10.1`
        };
      }
      if (command.includes('show link-aggregation')) {
        return { output: '' };
      }
      if (command.includes('show spanning-tree')) {
        return {
          output: `Root Bridge ID: 48-a9-8a-11-22-33\nBridge ID: 00-11-22-33-44-55\nPort Ethernet1/0/1: Role: Root, State: Forwarding`
        };
      }
    }
    return { output: '' };
  };

  const report = await scanTopology({
    storage: mockStorage,
    mode: 'hardware',
    sshExecutor: mockSsh
  });

  assert.equal(report.simulation, false);
  assert.equal(report.successfulPolls, 2);
  assert.equal(report.rootBridgeId, 'mt-1');
  assert.equal(report.links.length, 1);
  assert.equal(report.links[0].sourceSwitch.id, 'mt-1');
  assert.equal(report.links[0].remoteSwitch.id, 'snr-1');
  assert.equal(report.diff.newLinks.length, 1);
});

test('applyStitchedTopology applies new links and optionally prunes missing links', () => {
  const updatedPorts = [];
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw1',
          name: 'SW1',
          ports: [
            { id: 'p1', number: 1, linkedSwitchId: null, linkedPortId: null },
            { id: 'p2', number: 2, linkedSwitchId: 'sw2', linkedPortId: 'p2' } // missing
          ]
        },
        {
          id: 'sw2',
          name: 'SW2',
          ports: [
            { id: 'p1', number: 1, linkedSwitchId: null, linkedPortId: null },
            { id: 'p2', number: 2, linkedSwitchId: 'sw1', linkedPortId: 'p2' }
          ]
        }
      ]
    },
    updatePort(switchId, portId, patch) {
      updatedPorts.push({ switchId, portId, patch });
      const sw = this.data.switches.find(s => s.id === switchId);
      const port = sw?.ports.find(p => p.id === portId);
      if (port) Object.assign(port, patch);
    }
  };

  const mockScanReport = {
    diff: {
      newLinks: [
        {
          id: 'link-new-1',
          sourceSwitch: { id: 'sw1', name: 'SW1' },
          sourcePort: { id: 'p1', name: 'Port 1', number: 1 },
          remoteSwitch: { id: 'sw2', name: 'SW2' },
          remotePort: { id: 'p1', name: 'Port 1', number: 1 }
        }
      ],
      missingLinks: [
        {
          id: 'link-missing-2',
          sourceSwitch: { id: 'sw1', name: 'SW1' },
          sourcePort: { id: 'p2', name: 'Port 2', number: 2 },
          remoteSwitch: { id: 'sw2', name: 'SW2' },
          remotePort: { id: 'p2', name: 'Port 2', number: 2 }
        }
      ]
    }
  };

  const result = applyStitchedTopology(mockStorage, {
    linkIds: ['link-new-1'],
    pruneMissing: true,
    scanReport: mockScanReport
  });

  assert.equal(result.success, true);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.prunedCount, 1);

  // Check that p1 was connected
  const sw1P1 = mockStorage.data.switches[0].ports.find(p => p.id === 'p1');
  assert.equal(sw1P1.linkedSwitchId, 'sw2');
  assert.equal(sw1P1.linkedPortId, 'p1');

  // Check that missing p2 was pruned
  const sw1P2 = mockStorage.data.switches[0].ports.find(p => p.id === 'p2');
  assert.equal(sw1P2.linkedSwitchId, null);
  assert.equal(sw1P2.linkedPortId, null);
});
