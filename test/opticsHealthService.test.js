import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordDdmSnapshot,
  generateSyntheticOpticsHistory,
  getPortAnalysis,
  getFleetOpticsSummary
} from '../server/opticsHealthService.js';

test('recordDdmSnapshot stores snapshots and enforces 50-point cap', () => {
  const mockStorage = {
    data: {
      switches: [],
      opticsHistory: {}
    }
  };

  // Record 1 snapshot
  recordDdmSnapshot(mockStorage, {
    switchId: 'sw-1',
    portId: 'p25',
    ddmReport: {
      telemetry: {
        rxPowerDbm: -6.5,
        txPowerDbm: -2.1,
        biasCurrentMa: 26.0,
        temperatureC: 38.0,
        voltageV: 3.32
      }
    }
  });

  const history = mockStorage.data.opticsHistory['sw-1:p25'];
  assert.ok(Array.isArray(history));
  assert.equal(history.length, 1);
  assert.equal(history[0].rxDbm, -6.5);
  assert.equal(history[0].txDbm, -2.1);
  assert.equal(history[0].biasCurrentMa, 26.0);

  // Push 60 more snapshots to test buffer capping at 50
  for (let i = 0; i < 60; i++) {
    recordDdmSnapshot(mockStorage, {
      switchId: 'sw-1',
      portId: 'p25',
      ddmReport: {
        telemetry: {
          rxPowerDbm: -6.5 - i * 0.1,
          txPowerDbm: -2.1,
          biasCurrentMa: 26.0,
          temperatureC: 38.0,
          voltageV: 3.32
        }
      }
    });
  }

  assert.equal(mockStorage.data.opticsHistory['sw-1:p25'].length, 50);
});

test('generateSyntheticOpticsHistory produces realistic simulation scenarios', () => {
  const port = { id: 'p25', name: 'TenGigabitEthernet 1/0/25', number: 25 };

  const stable = generateSyntheticOpticsHistory(port, 'STABLE');
  assert.ok(stable.length >= 14);
  assert.ok(stable[stable.length - 1].rxDbm >= -10.0);

  const degrading = generateSyntheticOpticsHistory(port, 'DEGRADING');
  assert.ok(degrading.length >= 14);
  assert.ok(degrading[0].rxDbm > degrading[degrading.length - 1].rxDbm);
  assert.ok(degrading[0].rxDbm - degrading[degrading.length - 1].rxDbm >= 4.0);

  const aging = generateSyntheticOpticsHistory(port, 'AGING');
  assert.ok(aging.length >= 14);
  assert.ok(aging[aging.length - 1].biasCurrentMa >= 45.0);

  const dirt = generateSyntheticOpticsHistory(port, 'DIRT');
  assert.ok(dirt.length >= 14);
  const maxDrop = Math.max(...dirt.slice(1).map((pt, idx) => dirt[idx].rxDbm - pt.rxDbm));
  assert.ok(maxDrop >= 4.0);
});

test('getPortAnalysis computes comprehensive health telemetry, trend, and TTF', () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw-core',
          name: 'Core-SW01',
          vendor: 'SNR',
          ip: '10.10.0.1',
          ports: [
            {
              id: 'p25',
              number: 25,
              name: 'TenGigabitEthernet 1/0/25',
              type: 'sfp+',
              linkedSwitchId: 'sw-acc',
              linkedPortId: 'p25'
            }
          ]
        },
        {
          id: 'sw-acc',
          name: 'Access-SW01',
          vendor: 'SNR',
          ip: '10.10.0.2',
          ports: [
            {
              id: 'p25',
              number: 25,
              name: 'TenGigabitEthernet 1/0/25',
              type: 'sfp+',
              linkedSwitchId: 'sw-core',
              linkedPortId: 'p25'
            }
          ]
        }
      ],
      opticsHistory: {}
    },
    getSwitchById(id) {
      return this.data.switches.find(s => s.id === id);
    }
  };

  // Seed degrading history for sw-core p25
  mockStorage.data.opticsHistory['sw-core:p25'] = generateSyntheticOpticsHistory(
    { id: 'p25', name: 'TenGigabitEthernet 1/0/25', number: 25 },
    'DEGRADING'
  );

  const analysis = getPortAnalysis(mockStorage, { switchId: 'sw-core', portId: 'p25' });

  assert.equal(analysis.switchId, 'sw-core');
  assert.equal(analysis.portId, 'p25');
  assert.ok(analysis.trend.rxSlopeDbPerDay < -0.15);
  assert.ok(analysis.ttf.ttfDays !== null);
  assert.ok(['CRITICAL', 'WARNING'].includes(analysis.ttf.urgency));
  assert.ok(analysis.rootCause.classification.length > 0);
  assert.ok(analysis.span !== null);
});

test('getFleetOpticsSummary aggregates fleet telemetry, critical counts and spans', () => {
  const mockStorage = {
    data: {
      switches: [
        {
          id: 'sw-1',
          name: 'SW-01',
          vendor: 'SNR',
          ip: '10.0.0.1',
          ports: [
            { id: 'p1', number: 1, name: 'GigabitEthernet 1/0/1', type: 'rj45' },
            { id: 'p25', number: 25, name: 'TenGigabitEthernet 1/0/25', type: 'sfp+', linkedSwitchId: 'sw-2', linkedPortId: 'p25' }
          ]
        },
        {
          id: 'sw-2',
          name: 'SW-02',
          vendor: 'MikroTik',
          ip: '10.0.0.2',
          ports: [
            { id: 'p1', number: 1, name: 'ether1', type: 'rj45' },
            { id: 'p25', number: 25, name: 'sfp-sfpplus1', type: 'sfp+', linkedSwitchId: 'sw-1', linkedPortId: 'p25' }
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

  assert.equal(summary.totalMonitoredPorts, 2);
  assert.ok(summary.spans.length >= 1);
  assert.equal(typeof summary.criticalCount, 'number');
  assert.equal(typeof summary.warningCount, 'number');
  assert.equal(typeof summary.optimalCount, 'number');
  assert.equal(typeof summary.asymmetricSpansCount, 'number');
  assert.ok(Array.isArray(summary.degradingPorts));
});
