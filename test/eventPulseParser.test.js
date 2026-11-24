import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSyslogMessage,
  LinkFlapDetector,
  EventRateLimiter
} from '../server/eventPulseParser.js';

test('parseSyslogMessage parses SNR-OS link down event', () => {
  const msg = '<187>2026-11-24T02:00:00: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to down';
  const result = parseSyslogMessage(msg, '192.168.1.10');

  assert.ok(result);
  assert.equal(result.vendor, 'snr');
  assert.equal(result.type, 'link_down');
  assert.equal(result.portNum, 5);
  assert.equal(result.portName, 'GigabitEthernet1/0/5');
  assert.equal(result.severity, 'critical');
});

test('parseSyslogMessage parses SNR-OS link up event', () => {
  const msg = '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/24, changed state to up';
  const result = parseSyslogMessage(msg, '192.168.1.10');

  assert.ok(result);
  assert.equal(result.vendor, 'snr');
  assert.equal(result.type, 'link_up');
  assert.equal(result.portNum, 24);
  assert.equal(result.severity, 'info');
});

test('parseSyslogMessage parses MikroTik raw link down event', () => {
  const msg = 'interface,info ether3 link down';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'link_down');
  assert.equal(result.portNum, 3);
  assert.equal(result.severity, 'critical');
});

test('parseSyslogMessage parses MikroTik STP topology change', () => {
  const msg = 'stp,info ether1 topology change';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'stp_change');
  assert.equal(result.portNum, 1);
  assert.equal(result.severity, 'warning');
});

test('parseSyslogMessage parses MikroTik configuration change event', () => {
  const msg = 'system,info device configuration changed by admin via winbox';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'config_change');
  assert.equal(result.severity, 'warning');
});

test('LinkFlapDetector detects flapping on 3+ transitions in 60s', () => {
  const detector = new LinkFlapDetector();
  const swId = 'sw-1';
  const port = 5;

  assert.equal(detector.recordTransition(swId, port, 'down').isFlapping, false);
  assert.equal(detector.recordTransition(swId, port, 'up').isFlapping, false);
  const third = detector.recordTransition(swId, port, 'down');
  assert.equal(third.isFlapping, true);
  assert.equal(third.count, 3);
});

test('EventRateLimiter suppresses excess events over limit', () => {
  const limiter = new EventRateLimiter();
  const key = '192.168.1.10';

  for (let i = 0; i < 20; i++) {
    assert.equal(limiter.checkLimit(key, 20).allowed, true);
  }
  const excess = limiter.checkLimit(key, 20);
  assert.equal(excess.allowed, false);
  assert.ok(excess.suppressedCount >= 1);
});
