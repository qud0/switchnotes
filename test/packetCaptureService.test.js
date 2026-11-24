import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGlobalPcapHeader,
  buildPacketRecord,
  buildFullPcapBuffer,
  generateSyntheticPacket,
  PacketCaptureManager
} from '../server/packetCaptureService.js';

test('buildGlobalPcapHeader produces standard 24-byte Libpcap 2.4 header', () => {
  const header = buildGlobalPcapHeader();
  assert.equal(header.length, 24, 'Global PCAP header must be exactly 24 bytes');
  // Check magic number 0xa1b2c3d4 (little endian: d4 c3 b2 a1)
  assert.equal(header.readUInt32LE(0), 0xa1b2c3d4, 'Magic number must be 0xa1b2c3d4');
  assert.equal(header.readUInt16LE(4), 2, 'Major version must be 2');
  assert.equal(header.readUInt16LE(6), 4, 'Minor version must be 4');
  assert.equal(header.readUInt32LE(16), 65535, 'Snaplen must be 65535');
  assert.equal(header.readUInt32LE(20), 1, 'Linktype must be 1 (Ethernet)');
});

test('buildPacketRecord wraps raw ethernet frame with 16-byte record header', () => {
  const fakePayload = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
  const packet = {
    timestamp: 1700000000123, // ms
    rawBytes: fakePayload
  };
  const record = buildPacketRecord(packet);
  assert.equal(record.length, 16 + fakePayload.length);
  assert.equal(record.readUInt32LE(0), 1700000000, 'Timestamp seconds');
  assert.equal(record.readUInt32LE(4), 123000, 'Timestamp microseconds');
  assert.equal(record.readUInt32LE(8), fakePayload.length, 'Included length');
  assert.equal(record.readUInt32LE(12), fakePayload.length, 'Original length');
});

test('buildFullPcapBuffer concatenates global header and packet records', () => {
  const fakePackets = [
    { timestamp: Date.now(), rawBytes: Buffer.from([0xaa, 0xbb, 0xcc]) },
    { timestamp: Date.now() + 10, rawBytes: Buffer.from([0x11, 0x22, 0x33, 0x44]) }
  ];
  const pcapBuffer = buildFullPcapBuffer(fakePackets);
  assert.equal(pcapBuffer.length, 24 + (16 + 3) + (16 + 4));
  assert.equal(pcapBuffer.readUInt32LE(0), 0xa1b2c3d4);
});

test('generateSyntheticPacket generates authentic network frames', () => {
  const portInfo = {
    portNum: 1,
    portName: 'ether1',
    vlanId: 20,
    connectedDevice: 'Workstation-01',
    deviceIp: '192.168.20.50',
    deviceMac: 'b4:96:91:22:33:44'
  };

  const pkt1 = generateSyntheticPacket(portInfo, 1);
  assert.ok(pkt1.id, 'Packet has ID');
  assert.ok(pkt1.protocol, 'Packet has protocol');
  assert.ok(pkt1.src, 'Packet has source');
  assert.ok(pkt1.dst, 'Packet has destination');
  assert.ok(pkt1.info, 'Packet has human-readable info string');
  assert.ok(pkt1.rawBytes instanceof Buffer, 'Raw bytes is Buffer');
  assert.ok(pkt1.rawBytes.length >= 42, 'Ethernet frame is at least 42 bytes');
  assert.ok(Array.isArray(pkt1.layers), 'Layers array is provided for dissection tree');
});

test('PacketCaptureManager manages lifecycle, ring buffer and export', () => {
  const manager = new PacketCaptureManager();
  const session = manager.startSession('sw-core', 'port-1', {
    portInfo: { portNum: 1, vlanId: 10, deviceIp: '192.168.10.15' }
  });

  assert.ok(session.id, 'Session created with ID');
  assert.equal(session.switchId, 'sw-core');
  assert.equal(session.portId, 'port-1');
  assert.equal(session.status, 'capturing');

  // Add 10 synthetic packets
  for (let i = 0; i < 10; i++) {
    manager.injectSyntheticPacket(session.id);
  }

  const status = manager.getSession(session.id);
  assert.equal(status.packetCount, 10);
  assert.equal(status.packets.length, 10);

  // Test PCAP export buffer
  const pcapDownload = manager.getPcapDownloadBuffer(session.id);
  assert.ok(pcapDownload instanceof Buffer);
  assert.equal(pcapDownload.readUInt32LE(0), 0xa1b2c3d4, 'Exported PCAP must have valid magic number');

  // Stop session
  const stopped = manager.stopSession(session.id);
  assert.equal(stopped, true);
  assert.equal(manager.getSession(session.id).status, 'stopped');
});
