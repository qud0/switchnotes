import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFirmwareCatalog,
  runPreflightAudit,
  startRollout,
  getRolloutStatus,
  abortRollout
} from '../server/firmwareRolloutService.js';

test('firmware catalog endpoint returns valid list of images', () => {
  const catalog = getFirmwareCatalog();
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length >= 2);
  assert.ok(catalog[0].id);
  assert.ok(catalog[0].version);
  assert.ok(catalog[0].sizeBytes);
});

test('firmware preflight audit endpoint accurately evaluates readiness', async () => {
  const mockStorage = {
    data: {
      switches: [
        { id: 'sw-1', name: 'ACC-01', vendor: 'SNR', model: 'SNR-S2985G-24T', ip: '192.168.10.50', role: 'access' }
      ]
    }
  };

  const catalog = getFirmwareCatalog();
  const res = await runPreflightAudit({
    storage: mockStorage,
    switchIds: ['sw-1'],
    canaryIds: ['sw-1'],
    firmwareId: catalog[0].id,
    isSimulation: true
  });

  assert.equal(res.overallStatus, 'READY');
  assert.equal(res.readyCount, 1);
  assert.equal(res.blockedCount, 0);
  assert.equal(res.targets[0].canUpgrade, true);
});

test('firmware rollout life-cycle: start, track status, and abort', async () => {
  const mockStorage = {
    data: {
      switches: [
        { id: 'sw-1', name: 'ACC-01', vendor: 'SNR', ip: '192.168.10.51', role: 'access' }
      ]
    },
    logAction: () => {}
  };

  const catalog = getFirmwareCatalog();
  const { rolloutId } = await startRollout({
    storage: mockStorage,
    switchIds: ['sw-1'],
    canaryIds: ['sw-1'],
    firmwareId: catalog[0].id,
    isSimulation: true
  });

  assert.ok(rolloutId.startsWith('rollout-'));

  const status = getRolloutStatus(rolloutId);
  assert.ok(status);
  assert.equal(status.rolloutId, rolloutId);

  const abortRes = abortRollout(rolloutId);
  assert.equal(abortRes.success, true);
});
