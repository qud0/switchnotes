import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventPulseDaemon } from '../server/eventPulseDaemon.js';

test('EventPulseDaemon matches switch by IP and hostname', () => {
  const daemon = new EventPulseDaemon();
  const switches = [
    { id: 'sw-1', name: 'SNR-CORE-01', ip: '192.168.1.10', vendor: 'SNR' },
    { id: 'sw-2', name: 'MT-ACCESS-02', ip: '192.168.88.2', vendor: 'MikroTik' }
  ];

  const matched1 = daemon.matchSwitch('192.168.1.10', switches);
  assert.ok(matched1);
  assert.equal(matched1.id, 'sw-1');

  const matched2 = daemon.matchSwitch('192.168.88.2', switches);
  assert.ok(matched2);
  assert.equal(matched2.id, 'sw-2');

  const unmatched = daemon.matchSwitch('10.0.0.99', switches);
  assert.equal(unmatched, null);
});

test('EventPulseDaemon processEvent records alert and triggers broadcast', () => {
  const alertsAdded = [];
  const broadcasted = [];

  const mockStorage = {
    getSwitches: () => [
      { id: 'sw-1', name: 'SNR-SWITCH-01', ip: '192.168.1.10', vendor: 'SNR' }
    ],
    addAlert: (alert) => {
      alertsAdded.push(alert);
      return { id: 'alert-123', ...alert };
    }
  };

  const daemon = new EventPulseDaemon();
  daemon.storage = mockStorage;
  daemon.broadcastEvent = (event) => {
    broadcasted.push(event);
  };

  const rawMsg = '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/7, changed state to down';
  const alert = daemon.processMessage(rawMsg, '192.168.1.10');

  assert.ok(alert);
  assert.equal(alert.switchId, 'sw-1');
  assert.equal(alert.portNum, 7);
  assert.equal(alert.level, 'critical');
  assert.equal(alertsAdded.length, 1);
  assert.equal(broadcasted.length, 1);
  assert.equal(broadcasted[0].type, 'link_down');
});

test('EventPulseDaemon simulateEvent generates and processes synthetic event', () => {
  const alertsAdded = [];
  const mockStorage = {
    getSwitches: () => [
      { id: 'sw-mt', name: 'MikroTik-Test', ip: '192.168.88.1', vendor: 'MikroTik' }
    ],
    addAlert: (alert) => {
      alertsAdded.push(alert);
      return { id: 'alert-sim', ...alert };
    }
  };

  const daemon = new EventPulseDaemon();
  daemon.storage = mockStorage;

  const result = daemon.simulateEvent({
    switchId: 'sw-mt',
    portNum: 2,
    type: 'link_down',
    message: 'Manual diagnostic trigger'
  });

  assert.ok(result);
  assert.equal(result.switchId, 'sw-mt');
  assert.equal(result.portNum, 2);
  assert.equal(result.level, 'critical');
  assert.equal(alertsAdded.length, 1);
});

test('EventPulseDaemon getStatus reports listening status and counters', () => {
  const daemon = new EventPulseDaemon();
  const status = daemon.getStatus();

  assert.ok(status);
  assert.equal(typeof status.syslogPort, 'number');
  assert.equal(typeof status.trapPort, 'number');
  assert.equal(typeof status.packetsReceived, 'number');
});
