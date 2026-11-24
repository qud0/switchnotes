import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packetCaptureManager } from '../server/packetCaptureService.js';

test('PCAP session lifecycle via packetCaptureManager', () => {
  const session = packetCaptureManager.startSession('sw-core', 'p-1', {
    portInfo: { portNum: 1, vlanId: 20, deviceIp: '192.168.20.10' }
  });

  assert.ok(session.id);
  assert.equal(session.status, 'capturing');

  // Inject a synthetic frame
  const pkt = packetCaptureManager.injectSyntheticPacket(session.id);
  assert.ok(pkt);
  assert.equal(pkt.vlanId, 20);

  // Verify status
  const current = packetCaptureManager.getSession(session.id);
  assert.equal(current.packetCount, 1);

  // Stop session
  const ok = packetCaptureManager.stopSession(session.id);
  assert.equal(ok, true);
  assert.equal(packetCaptureManager.getSession(session.id).status, 'stopped');

  // Binary PCAP buffer download verification
  const binaryPcap = packetCaptureManager.getPcapDownloadBuffer(session.id);
  assert.ok(binaryPcap instanceof Buffer);
  assert.equal(binaryPcap.readUInt32LE(0), 0xa1b2c3d4, 'Must have Libpcap magic header');
});
