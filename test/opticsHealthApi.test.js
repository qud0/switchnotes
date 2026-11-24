import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pollFleetOptics,
  getFleetOpticsSummary,
  getPortAnalysis
} from '../server/opticsHealthService.js';

test('pollFleetOptics scans all optical ports and stores fresh telemetry', async () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw-core',
          name: 'Core-01',
          vendor: 'SNR',
          ports: [
            { id: 'p25', number: 25, name: 'TenGigabitEthernet 1/0/25', type: 'sfp+' },
            { id: 'p26', number: 26, name: 'TenGigabitEthernet 1/0/26', type: 'sfp+' }
          ]
        },
        {
          id: 'sw-acc',
          name: 'Access-01',
          vendor: 'MikroTik',
          ports: [
            { id: 'p1', number: 1, name: 'ether1', type: 'rj45' },
            { id: 'p2', number: 2, name: 'sfp-sfpplus1', type: 'sfp+' }
          ]
        }
      ],
      opticsHistory: {}
    },
    getSwitchById(id) {
      return this.data.switches.find(s => s.id === id);
    }
  };

  const result = await pollFleetOptics(mockStorage);
  assert.equal(result.polledCount, 3);
  assert.ok(result.summary);
  assert.equal(result.summary.totalMonitoredPorts, 3);
  assert.ok(mockStorage.data.opticsHistory['sw-core:p25'].length >= 1);
  assert.ok(mockStorage.data.opticsHistory['sw-acc:p2'].length >= 1);
});

test('optics fleet-summary and port analysis contracts return expected structure', () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw-1',
          name: 'SW-01',
          vendor: 'SNR',
          ports: [
            { id: 'p25', number: 25, name: 'TenGigabitEthernet 1/0/25', type: 'sfp+' }
          ]
        }
      ],
      opticsHistory: {}
    },
    getSwitchById(id) {
      return this.data.switches.find(s => s.id === id);
    }
  };

  const summary = getFleetOpticsSummary(mockStorage);
  assert.ok(summary.timestamp);
  assert.equal(typeof summary.totalMonitoredPorts, 'number');
  assert.equal(typeof summary.criticalCount, 'number');
  assert.equal(typeof summary.warningCount, 'number');
  assert.equal(typeof summary.optimalCount, 'number');
  assert.ok(Array.isArray(summary.spans));

  const portAnalysis = getPortAnalysis(mockStorage, { switchId: 'sw-1', portId: 'p25' });
  assert.equal(portAnalysis.switchId, 'sw-1');
  assert.equal(portAnalysis.portId, 'p25');
  assert.ok(portAnalysis.current);
  assert.ok(portAnalysis.trend);
  assert.ok(portAnalysis.ttf);
  assert.ok(portAnalysis.rootCause);
});
