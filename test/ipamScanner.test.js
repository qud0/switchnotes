import test from 'node:test';
import assert from 'node:assert/strict';
import { getDetailedVendor } from '../server/constants/oui.js';
import { Storage } from '../server/storage.js';

test('OUI Database identifies expanded hardware vendors', () => {
  // MikroTik
  const mikrotik = getDetailedVendor('B8:69:F4:11:22:33');
  assert.equal(mikrotik?.vendor, 'MikroTik');

  // Realtek
  const realtek = getDetailedVendor('00:E0:4C:AA:BB:CC');
  assert.equal(realtek?.vendor, 'Realtek Semiconductor');

  // Apple
  const apple = getDetailedVendor('AC:DE:48:12:34:56');
  assert.equal(apple?.vendor, 'Apple Inc.');

  // Supermicro
  const supermicro = getDetailedVendor('00:25:90:55:66:77');
  assert.equal(supermicro?.vendor, 'Supermicro');

  // Proxmox / QEMU
  const proxmox = getDetailedVendor('BC:24:11:01:02:03');
  assert.equal(proxmox?.vendor, 'Proxmox / QEMU');
});

test('storage.batchImportIpAllocations imports new hosts with unique UUIDs and normalizes MACs', () => {
  const mockStorage = new Storage();
  // Clear or isolate ipam data for test
  mockStorage.data.ipam = [
    { id: 'existing-1', ip: '192.168.10.1', vlanId: 10, hostname: 'router-gw', mac: '00:11:22:33:44:55', status: 'active' }
  ];

  const itemsToImport = [
    { ip: '192.168.10.50', vlanId: 10, hostname: 'srv-db-01', mac: 'b8-69-f4-aa-bb-cc', type: 'server', status: 'active' },
    { ip: '192.168.10.51', vlanId: 10, hostname: 'srv-app-01', mac: 'ac:de:48:dd:ee:ff', type: 'server', status: 'active' },
    // Duplicate ip in same vlan: should update existing if updateExisting: true
    { ip: '192.168.10.1', vlanId: 10, hostname: 'router-gw-updated', mac: '00:11:22:33:44:55', type: 'gateway', status: 'active' }
  ];

  const result = mockStorage.batchImportIpAllocations(itemsToImport, { updateExisting: true });

  assert.equal(result.created, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.errors.length, 0);

  const imported1 = mockStorage.data.ipam.find(i => i.ip === '192.168.10.50');
  assert.ok(imported1);
  assert.equal(imported1.mac, 'B8:69:F4:AA:BB:CC'); // Normalized
  assert.ok(imported1.id.length >= 32); // UUID

  const updatedGw = mockStorage.data.ipam.find(i => i.ip === '192.168.10.1');
  assert.equal(updatedGw.hostname, 'router-gw-updated');
  assert.equal(updatedGw.type, 'gateway');
});

test('storage.batchReleaseIpAllocations deletes inactive zombie records from IPAM', () => {
  const mockStorage = new Storage();
  mockStorage.data.ipam = [
    { id: 'ip-zombie-1', ip: '192.168.10.99', vlanId: 10, hostname: 'old-decommissioned-vm' },
    { id: 'ip-active-1', ip: '192.168.10.100', vlanId: 10, hostname: 'live-prod-db' }
  ];

  const result = mockStorage.batchReleaseIpAllocations(['ip-zombie-1', 'non-existent-id']);

  assert.equal(result.released, 1);
  assert.equal(mockStorage.data.ipam.length, 1);
  assert.equal(mockStorage.data.ipam[0].id, 'ip-active-1');
});

test('IpamScannerService.parseSubnetRange calculates correct boundaries and rejects out-of-spec CIDRs', async () => {
  const { IpamScannerService } = await import('../server/ipamScannerService.js');
  const service = new IpamScannerService(new Storage());

  // /24 standard
  const r24 = service.parseSubnetRange('192.168.10.0/24');
  assert.equal(r24.network, '192.168.10.0');
  assert.equal(r24.firstUsable, '192.168.10.1');
  assert.equal(r24.lastUsable, '192.168.10.254');
  assert.equal(r24.totalUsable, 254);
  assert.equal(r24.ipList.length, 254);

  // /25 with non-zero host bits (e.g. .128/25)
  const r25 = service.parseSubnetRange('192.168.10.130/25');
  assert.equal(r25.network, '192.168.10.128');
  assert.equal(r25.firstUsable, '192.168.10.129');
  assert.equal(r25.lastUsable, '192.168.10.254');
  assert.equal(r25.totalUsable, 126);

  // /23 max allowed (510 hosts)
  const r23 = service.parseSubnetRange('10.20.0.0/23');
  assert.equal(r23.totalUsable, 510);

  // Reject /16 (too large) and invalid CIDR
  assert.throws(() => service.parseSubnetRange('10.0.0.0/16'), /Диапазон слишком велик/);
  assert.throws(() => service.parseSubnetRange('invalid-cidr'), /Некорректный CIDR/);
});

test('IpamScannerService.parsePingOutput correctly parses English and Russian ping output', async () => {
  const { IpamScannerService } = await import('../server/ipamScannerService.js');
  const service = new IpamScannerService(new Storage());

  // Windows Russian <1ms
  const ru1 = service.parsePingOutput('Ответ от 192.168.10.1: число байт=32 время<1мс TTL=64', 0);
  assert.equal(ru1.alive, true);
  assert.equal(ru1.rtt, 1);

  // Windows Russian normal
  const ru2 = service.parsePingOutput('Ответ от 192.168.10.50: число байт=32 время=14мс TTL=128', 0);
  assert.equal(ru2.alive, true);
  assert.equal(ru2.rtt, 14);

  // Linux
  const linux1 = service.parsePingOutput('64 bytes from 192.168.10.1: icmp_seq=1 ttl=64 time=2.45 ms', 0);
  assert.equal(linux1.alive, true);
  assert.equal(linux1.rtt, 2.45);

  // Timeout / Unreachable
  const fail1 = service.parsePingOutput('Превышен интервал ожидания для запроса.', 1);
  assert.equal(fail1.alive, false);
  assert.equal(fail1.rtt, null);
});

test('IpamScannerService.parseArpOutput extracts and normalizes MACs', async () => {
  const { IpamScannerService } = await import('../server/ipamScannerService.js');
  const service = new IpamScannerService(new Storage());

  // Windows format
  const winArp = `
  Интерфейс: 192.168.10.25 --- 0x11
    Адрес Интернета      Физический адрес      Тип
    192.168.10.1          b8-69-f4-11-22-33     динамический
    192.168.10.50         00-e0-4c-aa-bb-cc     динамический
    192.168.10.255        ff-ff-ff-ff-ff-ff     статический
  `;
  const winMap = service.parseArpOutput(winArp);
  assert.equal(winMap.get('192.168.10.1'), 'B8:69:F4:11:22:33');
  assert.equal(winMap.get('192.168.10.50'), '00:E0:4C:AA:BB:CC');
  assert.equal(winMap.has('192.168.10.255'), false); // Broadcast ignored

  // Linux /proc/net/arp format
  const linuxArp = `
IP address       HW type     Flags       HW address            Mask     Device
192.168.10.1     0x1         0x2         b8:69:f4:11:22:33     *        eth0
192.168.10.60    0x1         0x2         ac:de:48:00:11:22     *        eth0
192.168.10.99    0x1         0x0         00:00:00:00:00:00     *        eth0
  `;
  const linuxMap = service.parseArpOutput(linuxArp);
  assert.equal(linuxMap.get('192.168.10.1'), 'B8:69:F4:11:22:33');
  assert.equal(linuxMap.get('192.168.10.60'), 'AC:DE:48:00:11:22');
  assert.equal(linuxMap.has('192.168.10.99'), false); // Zero MAC ignored
});

test('IpamScannerService.scanSubnet in simulation mode accurately classifies 4-way drift', async () => {
  const { IpamScannerService } = await import('../server/ipamScannerService.js');
  const mockStorage = new Storage();
  mockStorage.data.ipam = [
    { id: 'gw', ip: '192.168.10.1', vlanId: 10, hostname: 'core-gw', mac: 'B8:69:F4:11:22:33', status: 'active' },
    { id: 'conflicted', ip: '192.168.10.100', vlanId: 10, hostname: 'srv-crm', mac: '00:11:22:33:44:55', status: 'active' },
    { id: 'zombie', ip: '192.168.10.150', vlanId: 10, hostname: 'decom-printer', mac: '00:22:33:44:55:66', status: 'active' }
  ];

  const service = new IpamScannerService(mockStorage);
  const result = await service.scanSubnet({ subnet: '192.168.10.0/24', vlanId: 10, simulate: true });

  assert.equal(result.subnet, '192.168.10.0/24');
  assert.ok(result.totalScanned > 0);
  assert.ok(result.aliveCount > 0);
  assert.ok(result.matchedCount >= 1);
  assert.ok(result.newRogueCount >= 1);
  assert.ok(result.zombieCount >= 1);
  assert.ok(result.conflictCount >= 1);

  // Check specific hosts
  const gwHost = result.hosts.find(h => h.ip === '192.168.10.1');
  assert.equal(gwHost?.driftStatus, 'MATCHED');

  const conflictHost = result.hosts.find(h => h.ip === '192.168.10.100');
  assert.equal(conflictHost?.driftStatus, 'CONFLICT');

  const zombieHost = result.hosts.find(h => h.ip === '192.168.10.150');
  assert.equal(zombieHost?.driftStatus, 'ZOMBIE');

  const rogueHost = result.hosts.find(h => h.driftStatus === 'NEW_ROGUE');
  assert.ok(rogueHost);
  assert.ok(rogueHost.mac);
});

test('IpamScannerService handles user abort signal cleanly', async () => {
  const { IpamScannerService } = await import('../server/ipamScannerService.js');
  const service = new IpamScannerService(new Storage());
  const ac = new AbortController();
  ac.abort();

  await assert.rejects(
    async () => service.scanSubnet({ subnet: '192.168.10.0/24', vlanId: 10 }, ac.signal),
    /прервано/
  );
});
