import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFirmwareCatalog,
  runPreflightAudit,
  startRollout,
  getRolloutStatus,
  abortRollout
} from '../server/firmwareRolloutService.js';

test('getFirmwareCatalog returns default verified images for SNR and MikroTik', () => {
  const catalog = getFirmwareCatalog();
  assert.ok(catalog.length >= 2);
  assert.ok(catalog.some(f => f.vendor === 'SNR'));
  assert.ok(catalog.some(f => f.vendor === 'MikroTik'));
});

test('runPreflightAudit audits disk space and safeguards across multiple switches', async () => {
  const mockStorage = {
    data: {
      switches: [
        { id: 'sw-acc-1', name: 'ACC-01', vendor: 'SNR', model: 'SNR-S2985G-24T', ip: '192.168.10.10', role: 'access' },
        { id: 'sw-core-1', name: 'CORE-01', vendor: 'SNR', model: 'SNR-S2985G-24T', ip: '192.168.10.1', role: 'core' }
      ]
    }
  };

  const catalog = getFirmwareCatalog();
  const snrFw = catalog.find(f => f.vendor === 'SNR');

  const audit = await runPreflightAudit({
    storage: mockStorage,
    switchIds: ['sw-acc-1', 'sw-core-1'],
    canaryIds: ['sw-acc-1'],
    firmwareId: snrFw.id,
    isSimulation: true
  });

  assert.equal(audit.targets.length, 2);
  const accTarget = audit.targets.find(t => t.switchId === 'sw-acc-1');
  assert.equal(accTarget.canUpgrade, true);
  assert.equal(accTarget.isCanary, true);
});

test('startRollout executes Canary phase and halts on simulated Canary health failure', async () => {
  const mockStorage = {
    data: {
      switches: [
        { id: 'sw-canary', name: 'ACC-CANARY', vendor: 'SNR', ip: '192.168.10.11', role: 'access' },
        { id: 'sw-bulk', name: 'ACC-BULK-01', vendor: 'SNR', ip: '192.168.10.12', role: 'access' }
      ]
    },
    logAction: () => {}
  };

  const catalog = getFirmwareCatalog();
  const snrFw = catalog.find(f => f.vendor === 'SNR');

  const { rolloutId } = await startRollout({
    storage: mockStorage,
    switchIds: ['sw-canary', 'sw-bulk'],
    canaryIds: ['sw-canary'],
    firmwareId: snrFw.id,
    isSimulation: true,
    simulateCanaryFailure: true // Force failure to verify safety abort
  });

  const state = getRolloutStatus(rolloutId);
  assert.ok(state);
  assert.equal(state.status, 'ABORTED');
  assert.ok(state.logs.some(l => l.message.includes('Canary')));
  // Verify sw-bulk was NOT touched because canary failed!
  assert.equal(state.switchStates['sw-bulk'].status, 'SKIPPED');
});

test('startRollout executes successful multi-stage rollout and completes all batches', async () => {
  const mockStorage = {
    data: {
      switches: [
        { id: 'sw-1', name: 'ACC-01', vendor: 'SNR', ip: '192.168.10.21', role: 'access' },
        { id: 'sw-2', name: 'ACC-02', vendor: 'SNR', ip: '192.168.10.22', role: 'access' },
        { id: 'sw-3', name: 'ACC-03', vendor: 'SNR', ip: '192.168.10.23', role: 'access' }
      ]
    },
    logAction: () => {}
  };

  const catalog = getFirmwareCatalog();
  const snrFw = catalog.find(f => f.vendor === 'SNR');

  const { rolloutId } = await startRollout({
    storage: mockStorage,
    switchIds: ['sw-1', 'sw-2', 'sw-3'],
    canaryIds: ['sw-1'],
    firmwareId: snrFw.id,
    batchSize: 2,
    isSimulation: true,
    simulateCanaryFailure: false
  });

  const state = getRolloutStatus(rolloutId);
  assert.equal(state.status, 'COMPLETED');
  assert.equal(state.switchStates['sw-1'].status, 'SUCCESS');
  assert.equal(state.switchStates['sw-2'].status, 'SUCCESS');
  assert.equal(state.switchStates['sw-3'].status, 'SUCCESS');
});

test('abortRollout cleanly stops active pipeline', async () => {
  const mockStorage = {
    data: { switches: [] },
    logAction: () => {}
  };

  const { rolloutId } = await startRollout({
    storage: mockStorage,
    switchIds: [],
    canaryIds: [],
    firmwareId: 'mock',
    isSimulation: true
  });

  const abortRes = abortRollout(rolloutId);
  assert.equal(abortRes.success, true);
  const state = getRolloutStatus(rolloutId);
  assert.equal(state.status, 'ABORTED');
});
