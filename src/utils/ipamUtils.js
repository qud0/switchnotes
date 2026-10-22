// IPv4 Subnet and IPAM utility functions

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

export function parseSubnet(cidr) {
  if (!cidr || !cidr.includes('/')) {
    return null;
  }

  const [ipPart, prefixStr] = cidr.trim().split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const maskLong = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const ipLong = ipToLong(ipPart);
  const networkLong = (ipLong & maskLong) >>> 0;
  const broadcastLong = (networkLong | (~maskLong >>> 0)) >>> 0;

  const totalIps = Math.pow(2, 32 - prefix);
  const totalUsable = prefix >= 31 ? totalIps : Math.max(0, totalIps - 2);

  const firstUsableLong = prefix >= 31 ? networkLong : networkLong + 1;
  const lastUsableLong = prefix >= 31 ? broadcastLong : broadcastLong - 1;

  return {
    cidr,
    prefix,
    network: longToIp(networkLong),
    netmask: longToIp(maskLong),
    broadcast: longToIp(broadcastLong),
    firstUsable: longToIp(firstUsableLong),
    lastUsable: longToIp(lastUsableLong),
    totalIps,
    totalUsable
  };
}

export function isIpInDhcpRange(ip, dhcpRangeStr) {
  if (!dhcpRangeStr || !dhcpRangeStr.includes('-')) return false;
  const [startStr, endStr] = dhcpRangeStr.split('-').map(s => s.trim());
  try {
    const ipL = ipToLong(ip);
    const startL = ipToLong(startStr);
    const endL = ipToLong(endStr);
    return ipL >= startL && ipL <= endL;
  } catch {
    return false;
  }
}

export function findNextFreeIp(cidr, allocatedIps = [], dhcpRangeStr = '') {
  const subnet = parseSubnet(cidr);
  if (!subnet) return '';

  const allocatedMap = new Set(allocatedIps.map(a => a.ip));
  const firstL = ipToLong(subnet.firstUsable);
  const lastL = ipToLong(subnet.lastUsable);

  for (let l = firstL; l <= lastL; l++) {
    const candidate = longToIp(l);
    if (!allocatedMap.has(candidate) && !isIpInDhcpRange(candidate, dhcpRangeStr)) {
      return candidate;
    }
  }

  // Fallback to any free IP
  for (let l = firstL; l <= lastL; l++) {
    const candidate = longToIp(l);
    if (!allocatedMap.has(candidate)) {
      return candidate;
    }
  }

  return '';
}
