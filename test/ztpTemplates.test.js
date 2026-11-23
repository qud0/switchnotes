import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cidrToNetmask,
  netmaskToCidr,
  generateZtpConfig,
  VENDOR_PRESETS
} from '../src/utils/ztpTemplates.js';

test('cidrToNetmask converts prefix length to dotted decimal', () => {
  assert.equal(cidrToNetmask(24), '255.255.255.0');
  assert.equal(cidrToNetmask('16'), '255.255.0.0');
  assert.equal(cidrToNetmask(30), '255.255.255.252');
  assert.equal(cidrToNetmask(8), '255.0.0.0');
});

test('netmaskToCidr converts dotted decimal to prefix length', () => {
  assert.equal(netmaskToCidr('255.255.255.0'), 24);
  assert.equal(netmaskToCidr('255.255.0.0'), 16);
  assert.equal(netmaskToCidr('255.255.255.252'), 30);
  assert.equal(netmaskToCidr('255.0.0.0'), 8);
});

test('generateZtpConfig produces valid SNR-OS configuration', () => {
  const config = generateZtpConfig({
    vendor: 'snr',
    hostname: 'SW-CORE-01',
    ip: '192.168.1.10',
    mask: '255.255.255.0',
    gateway: '192.168.1.1',
    adminUser: 'admin',
    adminPassword: 'SecretPassword123',
    vlanId: 1
  });

  assert.match(config, /hostname SW-CORE-01/);
  assert.match(config, /interface Vlan1/);
  assert.match(config, /ip address 192\.168\.1\.10 255\.255\.255\.0/);
  assert.match(config, /ip default-gateway 192\.168\.1\.1/);
  assert.match(config, /username admin privilege 15 password 0 SecretPassword123/);
  assert.match(config, /ssh server enable/);
});

test('generateZtpConfig produces valid MikroTik RouterOS configuration', () => {
  const config = generateZtpConfig({
    vendor: 'mikrotik',
    hostname: 'MT-CORE-01',
    ip: '192.168.88.2',
    mask: '255.255.255.0',
    gateway: '192.168.88.1',
    adminUser: 'admin',
    adminPassword: 'SecretPassword123'
  });

  assert.match(config, /\/system identity set name="MT-CORE-01"/);
  assert.match(config, /\/ip address add address=192\.168\.88\.2\/24/);
  assert.match(config, /\/ip route add (?:dst-address=0\.0\.0\.0\/0 )?gateway=192\.168\.88\.1/);
  assert.match(config, /\/ip service enable numbers=ssh/);
});

test('VENDOR_PRESETS includes correct baud rates for SNR and MikroTik', () => {
  assert.equal(VENDOR_PRESETS.snr.defaultBaudRate, 9600);
  assert.equal(VENDOR_PRESETS.mikrotik.defaultBaudRate, 115200);
});
