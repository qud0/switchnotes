import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigDriftService } from '../server/configDriftService.js';

test('validateRollbackSafety prevents removing switch Management IP and default gateway', () => {
  const service = new ConfigDriftService();
  const switchItem = {
    id: 'sw-1',
    name: 'SW-CORE-01',
    ip: '192.168.1.10',
    gateway: '192.168.1.1'
  };

  // Unsafe: attempts to remove management IP
  const unsafe1 = ['interface Vlan1', 'no ip address 192.168.1.10 255.255.255.0'];
  const res1 = service.validateRollbackSafety(unsafe1, switchItem);
  assert.equal(res1.safe, false);
  assert.match(res1.reason, /IP-адрес управления/);

  // Unsafe: attempts to remove default gateway
  const unsafe2 = ['no ip default-gateway 192.168.1.1'];
  const res2 = service.validateRollbackSafety(unsafe2, switchItem);
  assert.equal(res2.safe, false);
  assert.match(res2.reason, /шлюз по умолчанию/);

  // Safe commands: removing user VLAN or port change
  const safe = ['interface GigabitEthernet1/0/5', 'no switchport trunk allowed vlan 50', 'exit'];
  const resSafe = service.validateRollbackSafety(safe, switchItem);
  assert.equal(resSafe.safe, true);
});

test('resolveCredentials prioritizes switch-specific over global credentials', () => {
  const service = new ConfigDriftService();
  const mockStorage = {
    data: {
      backupSchedule: {
        credentials: {
          username: 'global_admin',
          password: 'global_password',
          port: 2222
        }
      }
    }
  };
  service.storage = mockStorage;

  // Case 1: Switch has own credentials
  const swWithCreds = {
    id: 'sw-1',
    ip: '10.0.0.1',
    sshUsername: 'local_user',
    sshPassword: 'local_password',
    sshPort: 22
  };
  const creds1 = service.resolveCredentials(swWithCreds);
  assert.equal(creds1.username, 'local_user');
  assert.equal(creds1.password, 'local_password');
  assert.equal(creds1.port, 22);

  // Case 2: Switch has no credentials -> fall back to global
  const swNoCreds = {
    id: 'sw-2',
    ip: '10.0.0.2'
  };
  const creds2 = service.resolveCredentials(swNoCreds);
  assert.equal(creds2.username, 'global_admin');
  assert.equal(creds2.password, 'global_password');
  assert.equal(creds2.port, 2222);
});

test('ConfigDriftService computes drift status accurately using Golden Baseline', async () => {
  const service = new ConfigDriftService();

  const goldenConfig = `! Golden Baseline\nhostname SW-1\nvlan 10\n name Users\ninterface Vlan1\n ip address 192.168.1.10 255.255.255.0`;
  const currentRunning = `! Current Running\nhostname SW-1\nvlan 10\n name Users\nvlan 20\n name Guests\ninterface Vlan1\n ip address 192.168.1.10 255.255.255.0`;

  const switchItem = {
    id: 'sw-test',
    name: 'SW-1',
    ip: '192.168.1.10',
    vendor: 'SNR'
  };

  const backups = [
    {
      id: 'b-golden',
      switchId: 'sw-test',
      isGolden: true,
      content: goldenConfig,
      timestamp: new Date().toISOString()
    }
  ];

  const mockStorage = {
    getSwitch: () => switchItem,
    getBackups: () => backups,
    updateSwitch: (id, updates) => Object.assign(switchItem, updates),
    addAlert: () => {}
  };
  service.storage = mockStorage;

  // Mock fetchRunningConfig
  service.fetchRunningConfig = async () => currentRunning;

  const result = await service.checkSwitchDrift('sw-test');
  assert.ok(result);
  assert.equal(result.driftStatus, 'drifted');
  assert.ok(result.diff.addedCount > 0);
  assert.equal(switchItem.driftStatus, 'drifted');
});

test('getScheduleSettings and updateScheduleSettings manage automated drift schedule', () => {
  const service = new ConfigDriftService();
  const mockStorage = {
    data: {}
  };
  service.storage = mockStorage;

  const initial = service.getScheduleSettings();
  assert.equal(initial.enabled, true);
  assert.equal(initial.intervalHours, 6);

  const updated = service.updateScheduleSettings({ intervalHours: 12, enabled: false });
  assert.equal(updated.intervalHours, 12);
  assert.equal(updated.enabled, false);
  assert.equal(service.schedulerTimer, null); // Stopped because enabled is false

  service.stopScheduler();
});

test('scanAllSwitchesDrift scans fleet and records timestamps', async () => {
  const service = new ConfigDriftService();
  const switches = [
    { id: 'sw-1', name: 'SW-1', ip: '10.0.0.1', vendor: 'SNR' },
    { id: 'sw-2', name: 'SW-2', ip: '10.0.0.2', vendor: 'SNR' }
  ];

  const mockStorage = {
    data: { driftSchedule: { enabled: true, intervalHours: 4 } },
    getSwitches: () => switches,
    getSwitch: (id) => switches.find(s => s.id === id),
    getBackups: () => [],
    addBackup: () => {},
    updateSwitch: (id, updates) => {
      const sw = switches.find(s => s.id === id);
      if (sw) Object.assign(sw, updates);
    },
    save: () => {}
  };
  service.storage = mockStorage;
  service.fetchRunningConfig = async () => 'hostname SW\n!';

  const scanResult = await service.scanAllSwitchesDrift();
  assert.equal(scanResult.totalSwitches, 2);
  assert.equal(scanResult.scannedCount, 2);
  assert.ok(mockStorage.data.driftSchedule.lastScanTime);
  assert.ok(mockStorage.data.driftSchedule.nextScanTime);

  service.stopScheduler();
});

test('getFleetDriftReport generates rollback scripts and checks Guardrails for drifted devices', async () => {
  const service = new ConfigDriftService();
  const sw = {
    id: 'sw-drifted',
    name: 'SW-CORE-DIST',
    ip: '192.168.1.1',
    vendor: 'SNR',
    driftStatus: 'drifted',
    lastDriftRunningConfig: 'hostname SW-CORE-DIST\nvlan 999\n name Unauthorized\ninterface Vlan1\n ip address 192.168.1.1 255.255.255.0'
  };

  const backups = [
    {
      id: 'b-golden',
      switchId: 'sw-drifted',
      isGolden: true,
      content: 'hostname SW-CORE-DIST\ninterface Vlan1\n ip address 192.168.1.1 255.255.255.0',
      timestamp: new Date().toISOString()
    }
  ];

  const mockStorage = {
    getSwitches: () => [sw],
    getBackups: () => backups,
    data: { driftSchedule: { enabled: true } }
  };
  service.storage = mockStorage;

  const report = await service.getFleetDriftReport();
  assert.equal(report.driftedCount, 1);
  const driftedItem = report.driftedSwitches[0];
  assert.equal(driftedItem.switchId, 'sw-drifted');
  assert.ok(driftedItem.rollbackScript);
  assert.equal(driftedItem.isRollbackSafe, true); // Safe because it reverts vlan 999 without touching 192.168.1.1
  assert.equal(driftedItem.guardrailReason, null);

  service.stopScheduler();
});
