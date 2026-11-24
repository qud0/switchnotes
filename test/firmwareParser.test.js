import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSnrFlashSpace,
  parseSnrVersion,
  parseMikrotikResource,
  parseHealthCheckOutput
} from '../server/firmwareParser.js';

test('parseSnrFlashSpace extracts free and total flash memory bytes', () => {
  const sample = `
Directory of flash:

1   -rw-   11874240  Jan 01 2024 00:15:20  nos.img
2   -rw-       4096  Jan 01 2024 00:16:10  startup-config

16777216 bytes total (4898880 bytes free)
`;

  const res = parseSnrFlashSpace(sample);
  assert.equal(res.totalBytes, 16777216);
  assert.equal(res.freeBytes, 4898880);
});

test('parseSnrVersion extracts software version and device model', () => {
  const sample = `
SNR-S2985G-24T Device, Compiled on Nov 15 2023 14:22:10
SoftWare Version 7.0.3.5(R0241.0315)
BootRom Version 7.1.3
HardWare Version R01
`;

  const res = parseSnrVersion(sample);
  assert.equal(res.model, 'SNR-S2985G-24T');
  assert.equal(res.version, '7.0.3.5(R0241.0315)');
});

test('parseMikrotikResource extracts version, free disk space and architecture', () => {
  const sample = `
                   uptime: 4w2d18h12m5s
                  version: 7.12.1 (stable)
               build-time: Nov/20/2023 10:45:12
              free-memory: 1892.4MiB
             total-memory: 2048.0MiB
                      cpu: ARM64
                cpu-count: 4
            free-hdd-space: 48.5MiB
           total-hdd-space: 128.0MiB
           architecture-name: arm64
                   board-name: CCR2004-16G-2S+
`;

  const res = parseMikrotikResource(sample);
  assert.equal(res.version, '7.12.1');
  assert.equal(res.architecture, 'arm64');
  assert.equal(res.model, 'CCR2004-16G-2S+');
  assert.ok(res.freeHddBytes > 45 * 1024 * 1024);
  assert.ok(res.totalHddBytes > 120 * 1024 * 1024);
});

test('parseHealthCheckOutput validates successful and failed ICMP pings', () => {
  // SNR success
  const snrSuccess = `
Sending 3, 56-byte ICMP Echos to 192.168.10.1, timeout is 2 seconds:
!!!
Success rate is 100 percent (3/3), round-trip min/avg/max = 1/1/2 ms
`;
  const snrRes = parseHealthCheckOutput(snrSuccess, 'SNR');
  assert.equal(snrRes.isHealthy, true);
  assert.equal(snrRes.issues.length, 0);

  // MikroTik success
  const mtSuccess = `
  SEQ HOST                                     SIZE TTL TIME  STATUS
    0 192.168.10.1                               56  64 1ms
    1 192.168.10.1                               56  64 1ms
    2 192.168.10.1                               56  64 1ms
    sent=3 received=3 packet-loss=0% min-rtt=1ms avg-rtt=1ms max-rtt=1ms
`;
  const mtRes = parseHealthCheckOutput(mtSuccess, 'MikroTik');
  assert.equal(mtRes.isHealthy, true);

  // Failure
  const failSample = `
  sent=3 received=0 packet-loss=100%
`;
  const failRes = parseHealthCheckOutput(failSample, 'MikroTik');
  assert.equal(failRes.isHealthy, false);
  assert.ok(failRes.issues.length > 0);
});
