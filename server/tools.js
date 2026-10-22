import net from 'net';
import { exec } from 'child_process';
import url from 'url';
import { pingHost } from './diagnostics.js';
import { OUI_MAP, lookupVendor } from './constants/oui.js';

export { OUI_MAP, lookupVendor };

/**
 * Read system ARP table to resolve IP -> MAC addresses
 */
export function getSystemArpTable() {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'arp -a' : 'arp -n';
    exec(cmd, { timeout: 3000 }, (err, stdout) => {
      const arpMap = new Map();
      if (err || !stdout) return resolve(arpMap);

      const lines = stdout.split('\n');
      for (const line of lines) {
        // Windows format: 192.168.10.1    b8-69-f4-01-22-33     dynamic
        const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17}|[0-9a-fA-F:]{17})/);
        if (match) {
          const ip = match[1];
          const mac = match[2].replace(/-/g, ':').toUpperCase();
          arpMap.set(ip, mac);
        }
      }
      resolve(arpMap);
    });
  });
}

/**
 * Scan an entire IP range or subnet
 */
export async function scanSubnet({ subnet, startIp, endIp, timeoutMs = 800 }, storage) {
  let ipList = [];

  if (startIp && endIp) {
    const startParts = startIp.split('.').map(Number);
    const endParts = endIp.split('.').map(Number);
    const prefix = `${startParts[0]}.${startParts[1]}.${startParts[2]}`;
    const startNum = Math.min(startParts[3], endParts[3]);
    const endNum = Math.max(startParts[3], endParts[3]);

    for (let i = startNum; i <= Math.min(endNum, startNum + 254); i++) {
      ipList.push(`${prefix}.${i}`);
    }
  } else if (subnet) {
    // E.g. "192.168.10.0/24"
    const match = subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/(\d+)$/);
    if (match) {
      const basePrefix = match[1];
      const cidr = parseInt(match[2]);
      const hostCount = Math.min(254, Math.pow(2, 32 - cidr) - 2);
      for (let i = 1; i <= hostCount; i++) {
        ipList.push(`${basePrefix}.${i}`);
      }
    } else {
      // Default fallback
      const prefix = subnet.split('.').slice(0, 3).join('.');
      for (let i = 1; i <= 254; i++) {
        ipList.push(`${prefix}.${i}`);
      }
    }
  } else {
    throw new Error('Укажите подсеть (CIDR) или диапазон IP-адресов');
  }

  // Concurrency limit = 16
  const chunkSize = 16;
  const pingResults = [];

  for (let i = 0; i < ipList.length; i += chunkSize) {
    const chunk = ipList.slice(i, i + chunkSize);
    const chunkRes = await Promise.all(chunk.map(ip => pingHost(ip, timeoutMs)));
    pingResults.push(...chunkRes);
  }

  // Get ARP table
  const arpMap = await getSystemArpTable();

  // Cross-reference with IPAM database
  const ipamList = storage?.data?.ipam || [];
  const switches = storage?.data?.switches || [];

  const finalHosts = pingResults.map(p => {
    const ip = p.host;
    let mac = arpMap.get(ip) || null;

    // Search in IPAM
    const ipamEntry = ipamList.find(a => a.ip === ip);
    // Search in Switches
    const switchEntry = switches.find(s => s.ip === ip);

    if (!mac && ipamEntry?.mac) mac = ipamEntry.mac;
    if (!mac && switchEntry?.mac) mac = switchEntry.mac;

    const vendor = lookupVendor(mac);

    const isOnline = p.online;
    const inIpam = Boolean(ipamEntry);
    const shadowDevice = isOnline && !inIpam;
    const macMismatch = isOnline && inIpam && ipamEntry.mac && mac && (ipamEntry.mac.replace(/[:-]/g, '').toUpperCase() !== mac.replace(/[:-]/g, '').toUpperCase());

    return {
      ip,
      online: isOnline,
      rtt: p.rtt,
      mac,
      vendor,
      inIpam,
      ipamEntry: ipamEntry || (switchEntry ? { hostname: switchEntry.name, type: 'switch', location: switchEntry.location } : null),
      shadowDevice,
      macMismatch,
      timestamp: p.timestamp
    };
  });

  return {
    totalScanned: ipList.length,
    onlineCount: finalHosts.filter(h => h.online).length,
    shadowCount: finalHosts.filter(h => h.shadowDevice).length,
    mismatchCount: finalHosts.filter(h => h.macMismatch).length,
    hosts: finalHosts
  };
}

/**
 * Common TCP port definitions
 */
export const PORT_DEFINITIONS = {
  21: { service: 'FTP', category: 'management' },
  22: { service: 'SSH (Secure Shell)', category: 'management' },
  23: { service: 'Telnet', category: 'management' },
  25: { service: 'SMTP', category: 'infra' },
  53: { service: 'DNS', category: 'infra' },
  80: { service: 'HTTP (Web UI)', category: 'web' },
  110: { service: 'POP3', category: 'infra' },
  123: { service: 'NTP (Network Time)', category: 'infra' },
  161: { service: 'SNMP (Simple Network Management)', category: 'management' },
  443: { service: 'HTTPS (Web SSL)', category: 'web' },
  445: { service: 'SMB (File Sharing)', category: 'infra' },
  554: { service: 'RTSP (IP Camera Video)', category: 'media' },
  873: { service: 'RSYNC Backup', category: 'infra' },
  3389: { service: 'RDP (Remote Desktop)', category: 'management' },
  5060: { service: 'SIP (VoIP Telephony)', category: 'telephony' },
  8080: { service: 'HTTP-Proxy / Alt Web', category: 'web' },
  8291: { service: 'MikroTik WinBox', category: 'management' },
  8443: { service: 'HTTPS Admin / UniFi Controller', category: 'web' }
};

/**
 * TCP Port Scanner
 */
export function checkTcpPort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const rtt = Date.now() - startTime;
      socket.destroy();
      resolve({
        port,
        service: PORT_DEFINITIONS[port]?.service || `Custom Port ${port}`,
        status: 'open',
        rtt: Math.max(1, rtt)
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        port,
        service: PORT_DEFINITIONS[port]?.service || `Custom Port ${port}`,
        status: 'filtered',
        rtt: null
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        port,
        service: PORT_DEFINITIONS[port]?.service || `Custom Port ${port}`,
        status: 'closed',
        rtt: null
      });
    });

    socket.connect(port, host);
  });
}

export async function scanPorts({ host, ports = [22, 23, 80, 443, 8291, 161, 3389], timeoutMs = 1200 }) {
  if (!host) throw new Error('Укажите целевой хост или IP-адрес');
  const results = await Promise.all(ports.map(port => checkTcpPort(host, port, timeoutMs)));
  return {
    host,
    openCount: results.filter(r => r.status === 'open').length,
    results
  };
}

/**
 * Visual Traceroute
 */
export function runTraceroute({ host, maxHops = 15, timeoutMs = 1500 }) {
  return new Promise((resolve, reject) => {
    let cleanHost = String(host || '').trim();
    try {
      cleanHost = url.domainToASCII(cleanHost);
    } catch {}
    cleanHost = cleanHost.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!cleanHost) return reject(new Error('Неверный целевой узел'));

    const safeHops = Math.min(30, Math.max(1, parseInt(maxHops, 10) || 15));
    const safeTimeout = Math.min(10000, Math.max(500, parseInt(timeoutMs, 10) || 1500));

    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? `tracert -d -h ${safeHops} -w ${safeTimeout} ${cleanHost}`
      : `traceroute -n -m ${safeHops} -w ${Math.ceil(safeTimeout / 1000)} ${cleanHost}`;

    exec(cmd, { timeout: (safeHops + 1) * safeTimeout + 3000 }, (err, stdout) => {
      if (err && !stdout) {
        return resolve({
          target: cleanHost,
          success: false,
          hops: []
        });
      }

      const hops = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        // Line format Windows: 1    <1 ms    <1 ms    <1 ms  192.168.10.1
        const hopMatch = line.match(/^\s*(\d+)\s+(.+?)\s+(\d+\.\d+\.\d+\.\d+)/);
        if (hopMatch) {
          const hopNum = parseInt(hopMatch[1]);
          const rawLatencies = hopMatch[2];
          const ip = hopMatch[3];

          // Parse RTT times
          const rttMatches = rawLatencies.match(/(\d+)\s*(?:ms|мс)/g);
          const rtts = rttMatches ? rttMatches.map(m => parseInt(m)) : [];
          const avgRtt = rtts.length > 0 ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : 1;

          hops.push({
            hop: hopNum,
            ip,
            rtt: avgRtt,
            loss: rawLatencies.includes('*')
          });
        }
      }

      resolve({
        target: cleanHost,
        success: hops.length > 0,
        hops
      });
    });
  });
}
