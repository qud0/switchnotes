import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConfig,
  calculateNormalizedHash
} from '../server/configNormalizer.js';

test('normalizeConfig eliminates MikroTik export timestamps and volatile headers', () => {
  const config1 = `# nov/24/2026 14:00:00 by RouterOS 7.15.2\n# software id = 48R2-M1K9\n/interface bridge add name=bridge1\n/ip address add address=192.168.1.1/24 interface=bridge1`;
  const config2 = `# nov/24/2026 14:45:12 by RouterOS 7.15.2\n# software id = 48R2-M1K9\n/interface bridge add name=bridge1\n/ip address add address=192.168.1.1/24 interface=bridge1`;

  const norm1 = normalizeConfig(config1, 'mikrotik');
  const norm2 = normalizeConfig(config2, 'mikrotik');

  assert.equal(norm1, norm2);
  assert.equal(
    calculateNormalizedHash(config1, 'mikrotik'),
    calculateNormalizedHash(config2, 'mikrotik')
  );
});

test('normalizeConfig eliminates SNR-OS change timestamps and NTP clock-period', () => {
  const config1 = `! Current configuration : 1520 bytes\n! Last configuration change at 12:00:00 UTC Mon Nov 24 2026 by admin\nhostname SW-1\nntp clock-period 1234567\ninterface Vlan1\n ip address 10.0.0.1 255.255.255.0`;
  const config2 = `! Current configuration : 1580 bytes\n! Last configuration change at 15:30:22 UTC Mon Nov 24 2026 by admin\nhostname SW-1\nntp clock-period 9876543\ninterface Vlan1\n ip address 10.0.0.1 255.255.255.0`;

  const norm1 = normalizeConfig(config1, 'snr');
  const norm2 = normalizeConfig(config2, 'snr');

  assert.equal(norm1, norm2);
  assert.equal(
    calculateNormalizedHash(config1, 'snr'),
    calculateNormalizedHash(config2, 'snr')
  );
});

test('normalizeConfig detects genuine changes like new VLAN or port change', () => {
  const config1 = `hostname SW-1\nvlan 10\n name Users`;
  const config2 = `hostname SW-1\nvlan 10\n name Users\nvlan 20\n name Servers`;

  assert.notEqual(
    calculateNormalizedHash(config1, 'snr'),
    calculateNormalizedHash(config2, 'snr')
  );
});
