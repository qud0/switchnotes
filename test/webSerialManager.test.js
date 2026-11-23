import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWebSerialSupported,
  isSecureContextCheck,
  WebSerialSession
} from '../src/utils/webSerialManager.js';

test('isWebSerialSupported detects absence of navigator.serial in Node.js', () => {
  assert.equal(isWebSerialSupported(), false);
});

test('isSecureContextCheck handles environment without window', () => {
  // In Node environment, fallback is false or safe check
  assert.equal(typeof isSecureContextCheck(), 'boolean');
});

test('WebSerialSession manages session log correctly', () => {
  const session = new WebSerialSession();
  assert.equal(session.getSessionLog(), '');

  session.appendToLog('Switch>');
  session.appendToLog(' enable\r\n');
  assert.equal(session.getSessionLog(), 'Switch> enable\r\n');

  session.clearSessionLog();
  assert.equal(session.getSessionLog(), '');
});

test('WebSerialSession streamConfig throttles lines and reports progress', async () => {
  const session = new WebSerialSession();
  const sentData = [];
  
  // Mock direct write
  session.write = async (chunk) => {
    sentData.push(chunk);
  };

  const commands = 'hostname SW-1\r\nvlan 10\r\nexit';
  const progressReports = [];

  const result = await session.streamConfig({
    commands,
    lineDelayMs: 10,
    onProgress: (current, total, line) => {
      progressReports.push({ current, total, line });
    }
  });

  assert.equal(result.total, 3);
  assert.equal(result.sent, 3);
  assert.equal(result.aborted, false);
  assert.equal(sentData.length, 3);
  assert.equal(sentData[0], 'hostname SW-1\r\n');
  assert.equal(sentData[1], 'vlan 10\r\n');
  assert.equal(sentData[2], 'exit\r\n');
  assert.equal(progressReports.length, 3);
  assert.equal(progressReports[0].current, 1);
  assert.equal(progressReports[2].current, 3);
});

test('WebSerialSession streamConfig supports AbortController cancellation', async () => {
  const session = new WebSerialSession();
  const sentData = [];
  session.write = async (chunk) => {
    sentData.push(chunk);
  };

  const controller = new AbortController();
  const commands = 'line 1\nline 2\nline 3\nline 4\nline 5';

  const streamPromise = session.streamConfig({
    commands,
    lineDelayMs: 50,
    signal: controller.signal,
    onProgress: (current) => {
      if (current === 2) {
        controller.abort();
      }
    }
  });

  const result = await streamPromise;
  assert.equal(result.aborted, true);
  assert.ok(result.sent < 5);
  assert.ok(sentData.length < 5);
});
