import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitBackupService } from '../server/gitBackupService.js';
import { storage } from '../server/storage.js';

test('gitBackupService.initRepo creates or verifies git repository', async () => {
  const res = await gitBackupService.initRepo();
  assert.equal(res.success, true);
  assert.ok(res.path);
});

test('gitBackupService commits switch configuration and tracks commit hash', async () => {
  const mockSwitch = {
    id: 'test-sw-git-01',
    name: 'TEST-CORE-SW',
    vendor: 'SNR',
    model: 'S2995G-24FX',
    ip: '10.250.0.1'
  };

  const sampleConfig = `! Current configuration of TEST-CORE-SW
hostname TEST-CORE-SW
vlan 10
 name MANAGEMENT
!
interface GigabitEthernet1/0/1
 switchport mode access
 switchport access vlan 10
!
`;

  const commitRes = await gitBackupService.commitSwitchConfig(
    mockSwitch,
    sampleConfig,
    'QA Test Runner',
    'test: commit initial core configuration'
  );

  assert.ok(commitRes.committed || commitRes.identical);
  if (commitRes.committed) {
    assert.ok(commitRes.commitHash);
    assert.ok(commitRes.shortHash);
    assert.equal(commitRes.filePath, 'SNR/TEST-CORE-SW.cfg');
  }
});

test('gitBackupService.getStatus reports commits and files in repository', async () => {
  const status = await gitBackupService.getStatus();
  assert.equal(status.success, true);
  assert.ok(Array.isArray(status.commits));
  assert.ok(status.commitsCount >= 1);
  assert.ok(Array.isArray(status.files));
});

test('gitBackupService.getFleetStatus aggregates devices and backup status', async () => {
  const fleetStatus = await gitBackupService.getFleetStatus();
  assert.equal(fleetStatus.success, true);
  assert.ok(Array.isArray(fleetStatus.fleet));
  assert.ok(fleetStatus.totalSwitches >= 0);
  assert.ok(typeof fleetStatus.backedUpCount === 'number');
  assert.ok(typeof fleetStatus.committedCount === 'number');
});

test('gitBackupService.getFleetCommitLog returns chronological commits with file details', async () => {
  const logRes = await gitBackupService.getFleetCommitLog(10);
  assert.equal(logRes.success, true);
  assert.ok(Array.isArray(logRes.commits));
  if (logRes.commits.length > 0) {
    const first = logRes.commits[0];
    assert.ok(first.hash);
    assert.ok(first.shortHash);
    assert.ok(first.message);
  }
});

test('gitBackupService.getCommitDiff returns unified diff for valid commit hash', async () => {
  const logRes = await gitBackupService.getFleetCommitLog(5);
  if (logRes.commits.length > 0) {
    const targetCommit = logRes.commits[0];
    const diffRes = await gitBackupService.getCommitDiff(targetCommit.hash);
    assert.equal(diffRes.success, true);
    assert.ok(diffRes.diff);
    assert.ok(diffRes.diff.includes('diff --git') || diffRes.diff.includes('commit '));
  }
});

test('gitBackupService.getCommitDiff rejects invalid commit hash to prevent command injection', async () => {
  await assert.rejects(
    async () => {
      await gitBackupService.getCommitDiff('invalid; rm -rf /');
    },
    /Некорректный хэш коммита/
  );
});

test('gitBackupService.createFleetZipArchive generates valid ZIP archive buffer', async () => {
  const zipBuffer = await gitBackupService.createFleetZipArchive();
  assert.ok(Buffer.isBuffer(zipBuffer));
  assert.ok(zipBuffer.length > 0);
  // Standard ZIP file magic header bytes: 0x50, 0x4B (PK)
  assert.equal(zipBuffer[0], 0x50);
  assert.equal(zipBuffer[1], 0x4B);
});
