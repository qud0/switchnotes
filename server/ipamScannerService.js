import { execFile } from 'child_process';
import fs from 'fs';
import dns from 'dns';
import os from 'os';
import { getDetailedVendor } from './constants/oui.js';

export function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function longToIp(long) {
  return [
    (long >>> 24) & 255,
    (long >>> 16) & 255,
    (long >>> 8) & 255,
    long & 255
  ].join('.');
}

export function normalizeMac(mac) {
  if (!mac || typeof mac !== 'string') return '';
  const clean = mac.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g).join(':');
  }
  return mac.trim().toUpperCase();
}

export class IpamScannerService {
  constructor(storage) {
    this.storage = storage;
  }

  parseSubnetRange(cidr) {
    if (!cidr || typeof cidr !== 'string' || !cidr.includes('/')) {
      throw new Error('Некорректный CIDR адрес подсети (ожидается формат X.X.X.X/YY)');
    }

    const [ipPart, prefixStr] = cidr.trim().split('/');
    const prefix = parseInt(prefixStr, 10);

    const octets = ipPart.split('.').map(o => parseInt(o, 10));
    if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
      throw new Error(`Некорректный IP-адрес подсети: ${ipPart}`);
    }

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      throw new Error(`Некорректная маска подсети: /${prefixStr}`);
    }

    if (prefix < 23) {
      throw new Error(`Диапазон слишком велик. Максимальный поддерживаемый размер подсети: /23 (до 510 хостов), передано: /${prefix}`);
    }

    if (prefix > 30) {
      throw new Error(`Подсеть /${prefix} слишком мала для сканирования (минимум /30)`);
    }

    const maskLong = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const ipLong = ipToLong(ipPart);
    const networkLong = (ipLong & maskLong) >>> 0;
    const broadcastLong = (networkLong | (~maskLong >>> 0)) >>> 0;

    const firstUsableLong = networkLong + 1;
    const lastUsableLong = broadcastLong - 1;
    const totalUsable = Math.max(0, lastUsableLong - firstUsableLong + 1);

    const ipList = [];
    for (let l = firstUsableLong; l <= lastUsableLong; l++) {
      ipList.push(longToIp(l));
    }

    return {
      cidr,
      prefix,
      network: longToIp(networkLong),
      broadcast: longToIp(broadcastLong),
      firstUsable: longToIp(firstUsableLong),
      lastUsable: longToIp(lastUsableLong),
      totalUsable,
      ipList
    };
  }

  parsePingOutput(stdout, code) {
    if (!stdout || typeof stdout !== 'string') {
      return { alive: false, rtt: null };
    }

    const lower = stdout.toLowerCase();
    const hasTtl = lower.includes('ttl=') || lower.includes('ttl ');
    const isSuccess = code === 0 && (hasTtl || lower.includes('bytes from') || lower.includes('число байт='));

    if (!isSuccess) {
      return { alive: false, rtt: null };
    }

    // Windows Russian or English sub-millisecond: время<1мс / time<1ms
    if (lower.includes('время<1') || lower.includes('time<1')) {
      return { alive: true, rtt: 1 };
    }

    // Windows Russian: время=Xмс
    const ruMatch = stdout.match(/время\s*=\s*(\d+(?:\.\d+)?)\s*мс/i);
    if (ruMatch) {
      return { alive: true, rtt: parseFloat(ruMatch[1]) };
    }

    // Linux / Windows English: time=X ms or time=Xms
    const enMatch = stdout.match(/time\s*=\s*(\d+(?:\.\d+)?)\s*ms/i);
    if (enMatch) {
      return { alive: true, rtt: parseFloat(enMatch[1]) };
    }

    return { alive: true, rtt: 1 };
  }

  pingHost(ip, timeoutMs = 800, signal = null) {
    return new Promise(resolve => {
      if (signal?.aborted) {
        return resolve({ ip, alive: false, rtt: null, aborted: true });
      }

      const isWin = process.platform === 'win32';
      const args = isWin
        ? ['-n', '1', '-w', String(timeoutMs), ip]
        : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip];

      const hardTimeout = Math.max(timeoutMs + 1000, 2500);

      try {
        execFile('ping', args, { timeout: hardTimeout, signal }, (err, stdout) => {
          const result = this.parsePingOutput(stdout || '', err ? 1 : 0);
          resolve({ ip, ...result });
        });
      } catch (e) {
        resolve({ ip, alive: false, rtt: null, error: e.message });
      }
    });
  }

  parseArpOutput(arpText) {
    const arpMap = new Map();
    if (!arpText || typeof arpText !== 'string') return arpMap;

    const lines = arpText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Extract IPv4 and MAC-like string
      const match = trimmed.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?:.*?\s+)?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/i);
      if (match) {
        const ip = match[1];
        const rawMac = match[2];
        const norm = normalizeMac(rawMac);

        // Filter invalid MACs
        if (norm && norm !== '00:00:00:00:00:00' && norm !== 'FF:FF:FF:FF:FF:FF') {
          arpMap.set(ip, norm);
        }
      }
    }
    return arpMap;
  }

  async getArpTable() {
    // On Linux try /proc/net/arp first (fast, zero subprocess)
    if (process.platform === 'linux') {
      try {
        const procArp = await fs.promises.readFile('/proc/net/arp', 'utf-8');
        return this.parseArpOutput(procArp);
      } catch {
        // Fallback to exec
      }
    }

    return new Promise(resolve => {
      const isWin = process.platform === 'win32';
      const cmd = 'arp';
      const args = isWin ? ['-a'] : ['-n'];

      execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve(new Map());
        } else {
          resolve(this.parseArpOutput(stdout));
        }
      });
    });
  }

  async resolveReverseDns(ip, timeoutMs = 600, signal = null) {
    if (signal?.aborted) return null;

    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, timeoutMs);

      dns.promises.reverse(ip)
        .then(hostnames => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(hostnames?.[0] || null);
          }
        })
        .catch(() => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
    });
  }

  async scanSubnet(options = {}, signal = null) {
    const startTime = Date.now();
    const {
      subnet,
      vlanId,
      simulate = false,
      concurrency = 25,
      timeoutMs = 800
    } = options;

    const range = this.parseSubnetRange(subnet);
    const existingAllocations = this.storage.getIpAllocations() || [];
    const vlanAllocations = vlanId
      ? existingAllocations.filter(i => parseInt(i.vlanId, 10) === parseInt(vlanId, 10))
      : existingAllocations;

    // Simulation / Demo Mode
    if (simulate) {
      return this._generateSimulatedScan(range, vlanId, vlanAllocations, startTime);
    }

    // Real Network Probe
    const poolSize = Math.max(1, Math.min(50, parseInt(concurrency, 10) || 25));
    const pingResults = new Map();

    // Sliding Worker Pool
    const queue = [...range.ipList];
    const workers = [];

    const runWorker = async () => {
      while (queue.length > 0 && !signal?.aborted) {
        const ip = queue.shift();
        if (!ip) break;
        const res = await this.pingHost(ip, timeoutMs, signal);
        pingResults.set(ip, res);
      }
    };

    for (let i = 0; i < poolSize; i++) {
      workers.push(runWorker());
    }

    await Promise.all(workers);

    if (signal?.aborted) {
      throw new Error('Сканирование подсети было прервано пользователем');
    }

    // Fetch local ARP table to map alive IPs -> MACs
    const arpTable = await this.getArpTable();

    // Enrich alive hosts with MAC, OUI Vendor, and Reverse DNS
    const hostResults = [];
    const aliveHosts = [];

    for (const ip of range.ipList) {
      const pingRes = pingResults.get(ip) || { alive: false, rtt: null };
      const mac = arpTable.get(ip) || null;
      const vendorInfo = mac ? getDetailedVendor(mac) : null;

      const hostItem = {
        ip,
        alive: pingRes.alive,
        rtt: pingRes.rtt,
        mac,
        vendor: vendorInfo?.vendor || null,
        vendorType: vendorInfo?.type || null,
        hostname: null
      };

      if (pingRes.alive) {
        aliveHosts.push(hostItem);
      }
      hostResults.push(hostItem);
    }

    // Parallel reverse DNS for alive hosts only
    await Promise.all(
      aliveHosts.map(async h => {
        h.hostname = await this.resolveReverseDns(h.ip, 600, signal);
      })
    );

    // Classify drift
    return this._classifyScanDrift(range, vlanId, hostResults, vlanAllocations, startTime);
  }

  _classifyScanDrift(range, vlanId, scannedHosts, allocations, startTime) {
    const ipamMap = new Map();
    allocations.forEach(a => ipamMap.set(a.ip, a));

    const switches = this.storage.getSwitches ? this.storage.getSwitches() : [];
    const servers = this.storage.getServers ? this.storage.getServers() : [];

    const finalHosts = [];
    let aliveCount = 0;
    let matchedCount = 0;
    let newRogueCount = 0;
    let zombieCount = 0;
    let conflictCount = 0;

    for (const host of scannedHosts) {
      const ipamEntry = ipamMap.get(host.ip);

      if (host.alive) {
        aliveCount++;

        if (ipamEntry) {
          const normIpamMac = normalizeMac(ipamEntry.mac);
          const normLiveMac = normalizeMac(host.mac);

          if (normLiveMac && normIpamMac && normLiveMac !== normIpamMac) {
            // Both MACs present and different -> CONFLICT
            conflictCount++;
            finalHosts.push({
              ...host,
              driftStatus: 'CONFLICT',
              conflictType: 'mac_mismatch',
              ipamEntry,
              suggestedAction: 'verify_conflict'
            });
          } else {
            // MATCHED
            matchedCount++;
            finalHosts.push({
              ...host,
              driftStatus: 'MATCHED',
              canEnrichMac: !!normLiveMac && !normIpamMac,
              ipamEntry,
              suggestedAction: 'none'
            });
          }
        } else {
          // Alive but not in IPAM -> NEW_ROGUE
          newRogueCount++;
          const matchSwitch = switches.find(s => s.ip === host.ip);
          const matchServer = servers.find(s => s.ip === host.ip);

          finalHosts.push({
            ...host,
            driftStatus: 'NEW_ROGUE',
            catalogMatch: matchSwitch ? 'switch' : (matchServer ? 'server' : null),
            catalogName: matchSwitch?.name || matchServer?.name || null,
            suggestedAction: 'import_to_ipam'
          });
        }
      } else {
        // Host is offline
        if (ipamEntry) {
          // Offline but allocated in IPAM -> ZOMBIE
          zombieCount++;
          finalHosts.push({
            ...host,
            driftStatus: 'ZOMBIE',
            ipamEntry,
            suggestedAction: 'release_ip'
          });
        }
        // If offline and not in IPAM -> empty free IP, not listed or listed as FREE
      }
    }

    return {
      subnet: range.cidr,
      vlanId,
      totalScanned: range.totalUsable,
      aliveCount,
      matchedCount,
      newRogueCount,
      zombieCount,
      conflictCount,
      durationMs: Date.now() - startTime,
      hosts: finalHosts
    };
  }

  _generateSimulatedScan(range, vlanId, allocations, startTime) {
    const netBase = range.network.split('.').slice(0, 3).join('.');
    const hosts = [];

    // 1. Gateway (.1) - MATCHED
    hosts.push({
      ip: `${netBase}.1`,
      alive: true,
      rtt: 1,
      mac: 'B8:69:F4:11:22:33',
      vendor: 'MikroTik',
      vendorType: 'Router / Switch',
      hostname: 'core-gw.corp.local',
      driftStatus: 'MATCHED',
      suggestedAction: 'none',
      ipamEntry: allocations.find(a => a.ip === `${netBase}.1`) || { hostname: 'core-gw', mac: 'B8:69:F4:11:22:33' }
    });

    // 2. Switch Management (.10) - MATCHED
    hosts.push({
      ip: `${netBase}.10`,
      alive: true,
      rtt: 2,
      mac: 'F8:F0:82:AA:BB:CC',
      vendor: 'SNR (NAG)',
      vendorType: 'Managed Switch',
      hostname: 'sw-access-01.corp.local',
      driftStatus: 'MATCHED',
      suggestedAction: 'none',
      ipamEntry: allocations.find(a => a.ip === `${netBase}.10`) || { hostname: 'sw-access-01', mac: 'F8:F0:82:AA:BB:CC' }
    });

    // 3. Rogue Workstation (.55) - NEW_ROGUE
    hosts.push({
      ip: `${netBase}.55`,
      alive: true,
      rtt: 12,
      mac: '00:E0:4C:55:66:77',
      vendor: 'Realtek Semiconductor',
      vendorType: 'Network Adapter',
      hostname: 'dev-pc-55.corp.local',
      driftStatus: 'NEW_ROGUE',
      suggestedAction: 'import_to_ipam'
    });

    // 4. Rogue Server (.70) - NEW_ROGUE
    hosts.push({
      ip: `${netBase}.70`,
      alive: true,
      rtt: 4,
      mac: 'BC:24:11:88:99:00',
      vendor: 'Proxmox / QEMU',
      vendorType: 'Virtual Machine',
      hostname: 'pve-node-02.corp.local',
      driftStatus: 'NEW_ROGUE',
      suggestedAction: 'import_to_ipam'
    });

    // 5. Conflicted Host (.100) - CONFLICT
    hosts.push({
      ip: `${netBase}.100`,
      alive: true,
      rtt: 5,
      mac: 'AC:DE:48:99:88:77', // Live MAC is Apple
      vendor: 'Apple Inc.',
      vendorType: 'Workstation / Mobile',
      hostname: 'vip-macbook.corp.local',
      driftStatus: 'CONFLICT',
      conflictType: 'mac_mismatch',
      suggestedAction: 'verify_conflict',
      ipamEntry: { hostname: 'srv-crm', mac: '00:11:22:33:44:55', type: 'server' }
    });

    // 6. Zombie Host (.150) - ZOMBIE
    hosts.push({
      ip: `${netBase}.150`,
      alive: false,
      rtt: null,
      mac: null,
      vendor: null,
      vendorType: null,
      hostname: null,
      driftStatus: 'ZOMBIE',
      suggestedAction: 'release_ip',
      ipamEntry: { id: 'zombie-sim-1', hostname: 'decom-printer-old', mac: '00:22:33:44:55:66', status: 'active' }
    });

    const aliveCount = hosts.filter(h => h.alive).length;
    const matchedCount = hosts.filter(h => h.driftStatus === 'MATCHED').length;
    const newRogueCount = hosts.filter(h => h.driftStatus === 'NEW_ROGUE').length;
    const zombieCount = hosts.filter(h => h.driftStatus === 'ZOMBIE').length;
    const conflictCount = hosts.filter(h => h.driftStatus === 'CONFLICT').length;

    return {
      subnet: range.cidr,
      vlanId,
      totalScanned: range.totalUsable,
      aliveCount,
      matchedCount,
      newRogueCount,
      zombieCount,
      conflictCount,
      durationMs: Date.now() - startTime,
      hosts
    };
  }
}
