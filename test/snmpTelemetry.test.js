import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 
  parseCounter64, 
  calculateCounterDelta, 
  calculateUtilizationPct, 
  generateFallbackTelemetry,
  clearPollCache
} from '../server/snmpPoller.js';

test('parseCounter64 correctly decodes Buffer and BigInt values without NaN', () => {
  // 8-byte BigEndian Buffer: high word 1, low word 5 = 2^32 + 5 = 4294967301n
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(1, 0);
  buf.writeUInt32BE(5, 4);

  const decodedBuf = parseCounter64(buf);
  assert.equal(typeof decodedBuf, 'bigint');
  assert.equal(decodedBuf, 4294967301n);

  // Normal number
  assert.equal(parseCounter64(12345), 12345n);
  assert.equal(parseCounter64('9876543210'), 9876543210n);
  assert.equal(parseCounter64(null), 0n);
  assert.equal(parseCounter64(undefined), 0n);
});

test('calculateCounterDelta handles 32-bit rollover accurately', () => {
  const prev32 = 4294967000n; // near 2^32 - 1 (4294967295)
  const curr32 = 1000n;

  // Wrapped around 2^32
  const delta = calculateCounterDelta(curr32, prev32, 32);
  // (4294967296 - 4294967000) + 1000 = 296 + 1000 = 1296n
  assert.equal(delta, 1296n);

  // Normal non-wrapped delta
  const normalDelta = calculateCounterDelta(5000n, 2000n, 32);
  assert.equal(normalDelta, 3000n);
});

test('calculateCounterDelta treats 64-bit counter drop as device reset (0 delta)', () => {
  const prev64 = 50000000000n;
  const curr64 = 1000000n; // device rebooted

  const delta = calculateCounterDelta(curr64, prev64, 64);
  assert.equal(delta, 0n, '64-bit drop must be treated as reboot/counter reset, returning 0 delta');
});

test('calculateUtilizationPct prevents NaN and Infinity when speed is 0', () => {
  assert.equal(calculateUtilizationPct(10.5, 5.2, 0), 0);
  assert.equal(calculateUtilizationPct(10.5, 5.2, null), 0);
  assert.equal(calculateUtilizationPct(0, 0, 1000), 0);

  // Normal 1 Gbps port with 250 Mbps peak
  const util = calculateUtilizationPct(250, 120, 1000);
  assert.equal(util, 25); // 250 / 1000 * 100 = 25%

  // Clamped at 100%
  const clamped = calculateUtilizationPct(1500, 200, 1000);
  assert.equal(clamped, 100);
});

test('generateFallbackTelemetry produces monotonically non-decreasing counters across polls', () => {
  const sw = {
    id: 'test-sw-monotonic',
    name: 'TEST-SW',
    ports: [
      { id: 'p1', number: 1, name: 'GigabitEthernet1/0/1', speed: '1G' },
      { id: 'p2', number: 2, name: 'GigabitEthernet1/0/2', speed: '1G' }
    ]
  };

  clearPollCache(sw.id);

  const t1 = generateFallbackTelemetry(sw, true);
  assert.ok(t1.success);
  assert.equal(t1.ports.length, 2);

  const port1_t1 = t1.ports[0];
  assert.ok(typeof port1_t1.inOctets === 'number');
  assert.ok(typeof port1_t1.outOctets === 'number');

  // Second poll
  const t2 = generateFallbackTelemetry(sw, true);
  const port1_t2 = t2.ports[0];

  assert.ok(port1_t2.inOctets >= port1_t1.inOctets, 'inOctets must be monotonic');
  assert.ok(port1_t2.outOctets >= port1_t1.outOctets, 'outOctets must be monotonic');
  assert.ok(port1_t2.inErrors >= port1_t1.inErrors, 'inErrors must be monotonic');
});
