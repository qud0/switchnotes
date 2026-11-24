import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePreflight,
  generatePreUpgradeBackupCommand,
  generateBootImageCommands
} from '../server/firmwareGuardrails.js';

test('validatePreflight blocks upgrades with insufficient flash space', () => {
  const switchObj = {
    id: 'sw-1',
    name: 'ACC-SNR-01',
    vendor: 'SNR',
    model: 'SNR-S2985G-24T',
    role: 'access'
  };

  const firmwareInfo = {
    id: 'fw-snr-703',
    vendor: 'SNR',
    version: '7.0.3.5',
    sizeBytes: 12 * 1024 * 1024 // 12 MB
  };

  const flashStatus = {
    freeBytes: 8 * 1024 * 1024, // Only 8 MB free! Needs 15 MB (12 * 1.25)
    totalBytes: 16 * 1024 * 1024
  };

  const res = validatePreflight({ switchObj, firmwareInfo, flashStatus });
  assert.equal(res.canUpgrade, false);
  assert.ok(res.violations.some(v => v.includes('Недостаточно свободной памяти')));
});

test('validatePreflight prevents Core switch from being chosen as Canary pilot', () => {
  const coreSwitch = {
    id: 'sw-core',
    name: 'CORE-CCR2004',
    vendor: 'MikroTik',
    model: 'CCR2004-16G-2S+',
    role: 'core'
  };

  const firmwareInfo = {
    id: 'fw-mt-714',
    vendor: 'MikroTik',
    version: '7.14.1',
    sizeBytes: 16 * 1024 * 1024
  };

  const flashStatus = {
    freeBytes: 64 * 1024 * 1024,
    totalBytes: 128 * 1024 * 1024
  };

  const res = validatePreflight({ switchObj: coreSwitch, firmwareInfo, flashStatus, isCanary: true });
  assert.equal(res.canUpgrade, false);
  assert.ok(res.violations.some(v => v.includes('Canary')));
});

test('validatePreflight blocks incompatible vendor firmware', () => {
  const snrSwitch = {
    id: 'sw-snr',
    name: 'DIST-SNR',
    vendor: 'SNR',
    model: 'SNR-S2985G',
    role: 'distribution'
  };

  const mtFirmware = {
    id: 'fw-mt-714',
    vendor: 'MikroTik',
    version: '7.14.1',
    sizeBytes: 16 * 1024 * 1024
  };

  const flashStatus = { freeBytes: 32 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 };

  const res = validatePreflight({ switchObj: snrSwitch, firmwareInfo: mtFirmware, flashStatus });
  assert.equal(res.canUpgrade, false);
  assert.ok(res.violations.some(v => v.includes('Несовместимый вендор')));
});

test('generatePreUpgradeBackupCommand produces vendor-correct backup commands', () => {
  const snrCmd = generatePreUpgradeBackupCommand('SNR');
  assert.ok(snrCmd.includes('copy running-config startup-config'));

  const mtCmd = generatePreUpgradeBackupCommand('MikroTik');
  assert.ok(mtCmd.includes('/system backup save'));
});

test('generateBootImageCommands configures primary and secondary boot fallback for SNR-OS', () => {
  const snrCmds = generateBootImageCommands('SNR', 'nos-7.0.3.img', 'nos-backup.img');
  assert.ok(snrCmds.some(c => c.includes('boot system flash:nos-7.0.3.img')));
  assert.ok(snrCmds.some(c => c.includes('boot backup flash:nos-backup.img')));

  const mtCmds = generateBootImageCommands('MikroTik', 'routeros-7.14.npk');
  assert.ok(mtCmds.some(c => c.includes('routerboard')));
});
