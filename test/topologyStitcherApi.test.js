import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanTopology, applyStitchedTopology } from '../server/topologyStitcherService.js';

test('topology stitch scan returns valid report structure with simulation fallback', async () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw-mt-1',
          name: 'MT-CORE',
          vendor: 'MikroTik',
          ip: '192.168.10.1',
          ports: [
            { id: 'p1', number: 1, name: 'sfp-sfpplus1', speed: '10G' },
            { id: 'p2', number: 2, name: 'sfp-sfpplus2', speed: '10G' }
          ]
        },
        {
          id: 'sw-snr-1',
          name: 'SNR-DIST',
          vendor: 'SNR',
          ip: '192.168.10.2',
          ports: [
            { id: 'p1', number: 1, name: 'Ethernet1/0/25', speed: '10G' },
            { id: 'p2', number: 2, name: 'Ethernet1/0/26', speed: '10G' }
          ]
        }
      ]
    }
  };

  const report = await scanTopology({ storage: mockStorage, mode: 'simulation' });
  assert.ok(report.timestamp);
  assert.ok(Array.isArray(report.links));
  assert.ok(report.diff);
  assert.equal(typeof report.totalLinks, 'number');
  assert.equal(typeof report.matchedCount, 'number');
  assert.equal(typeof report.newDiscoveredCount, 'number');
});

test('topology stitch apply properly validates storage and records applied changes', () => {
  const switches = [
    {
      id: 'sw1',
      name: 'SW1',
      ports: [
        { id: 'p1', number: 1, linkedSwitchId: null, linkedPortId: null }
      ]
    },
    {
      id: 'sw2',
      name: 'SW2',
      ports: [
        { id: 'p1', number: 1, linkedSwitchId: null, linkedPortId: null }
      ]
    }
  ];

  const mockStorage = {
    data: { switches },
    updatePort(swId, portId, patch) {
      const sw = switches.find(s => s.id === swId);
      const port = sw?.ports.find(p => p.id === portId);
      if (port) Object.assign(port, patch);
    }
  };

  const scanReport = {
    diff: {
      newLinks: [
        {
          id: 'link-1',
          sourceSwitch: { id: 'sw1', name: 'SW1' },
          sourcePort: { id: 'p1', name: 'Port 1', number: 1 },
          remoteSwitch: { id: 'sw2', name: 'SW2' },
          remotePort: { id: 'p1', name: 'Port 1', number: 1 }
        }
      ]
    }
  };

  const res = applyStitchedTopology(mockStorage, {
    linkIds: ['link-1'],
    scanReport
  });

  assert.equal(res.success, true);
  assert.equal(res.appliedCount, 1);
  assert.equal(switches[0].ports[0].linkedSwitchId, 'sw2');
  assert.equal(switches[1].ports[0].linkedSwitchId, 'sw1');
});
