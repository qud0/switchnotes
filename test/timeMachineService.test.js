import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTimeMachineTimeline,
  getSwitchStateAtCheckpoint,
  calculatePortDiffs
} from '../server/timeMachineService.js';

test('getTimeMachineTimeline returns chronological checkpoints with current live state', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-1',
        name: 'sw-core',
        ports: [
          { id: 'p1', number: 1, pvid: 20, enabled: true, connectedTo: 'Host-1' },
          { id: 'p2', number: 2, pvid: 10, enabled: true, connectedTo: 'Host-2' }
        ]
      };
    },
    getAuditLog() {
      return [
        {
          id: 'log-1',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          title: 'Смена VLAN на порту 1',
          author: 'admin',
          details: 'pvid: 10 -> 20'
        }
      ];
    },
    getSnapshots() { return []; },
    getBackups() { return []; }
  };

  const timeline = getTimeMachineTimeline(mockStorage, 'sw-1');
  assert.ok(timeline.length >= 2, 'Must have at least live and 1 historical checkpoint');
  assert.equal(timeline[0].id, 'live', 'First checkpoint must be live');
  assert.equal(timeline[0].isLive, true);
});

test('calculatePortDiffs identifies modified fields between two switch states', () => {
  const currentPorts = [
    { id: 'p1', number: 1, pvid: 20, enabled: true, connectedTo: 'Workstation 1' },
    { id: 'p2', number: 2, pvid: 10, enabled: false, connectedTo: 'Printer' }
  ];

  const historicalPorts = [
    { id: 'p1', number: 1, pvid: 10, enabled: true, connectedTo: 'Workstation 1' }, // PVID changed
    { id: 'p2', number: 2, pvid: 10, enabled: true, connectedTo: 'Printer' }       // Enabled changed
  ];

  const diffs = calculatePortDiffs(currentPorts, historicalPorts);
  assert.equal(diffs.length, 2, 'Both ports should have differences');

  const p1Diff = diffs.find(d => d.portId === 'p1');
  assert.ok(p1Diff);
  assert.equal(p1Diff.changes[0].field, 'pvid');
  assert.equal(p1Diff.changes[0].current, 20);
  assert.equal(p1Diff.changes[0].historical, 10);

  const p2Diff = diffs.find(d => d.portId === 'p2');
  assert.ok(p2Diff);
  assert.equal(p2Diff.changes[0].field, 'enabled');
  assert.equal(p2Diff.changes[0].current, false);
  assert.equal(p2Diff.changes[0].historical, true);
});

test('getSwitchStateAtCheckpoint reconstructs past switch state and diff', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-1',
        name: 'sw-core',
        ports: [
          { id: 'p1', number: 1, pvid: 20, enabled: true }
        ]
      };
    },
    getAuditLog() { return []; },
    getSnapshots() { return []; },
    getBackups() { return []; }
  };

  const res = getSwitchStateAtCheckpoint(mockStorage, 'sw-1', 'live');
  assert.equal(res.checkpoint.id, 'live');
  assert.equal(res.diffs.length, 0, 'Live state has 0 diffs with itself');
});
