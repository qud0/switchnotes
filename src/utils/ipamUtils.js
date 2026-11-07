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

export function calculateWildcardMask(netmask) {
  if (!netmask) return '0.0.0.0';
  return netmask.split('.').map(octet => 255 - parseInt(octet, 10)).join('.');
}

/**
 * Разделение подсети на 2 равные дочерние подсети (prefix + 1)
 */
export function splitSubnet(cidr) {
  const parsed = parseSubnet(cidr);
  if (!parsed || parsed.prefix >= 30) return null;

  const newPrefix = parsed.prefix + 1;
  const netL = ipToLong(parsed.network);
  const halfSize = Math.pow(2, 32 - newPrefix);

  const sub1 = `${longToIp(netL)}/${newPrefix}`;
  const sub2 = `${longToIp(netL + halfSize)}/${newPrefix}`;

  return [sub1, sub2];
}

/**
 * Проверка возможности объединения двух смежных подсетей
 */
export function canJoinSubnets(cidr1, cidr2) {
  const p1 = parseSubnet(cidr1);
  const p2 = parseSubnet(cidr2);
  if (!p1 || !p2 || p1.prefix !== p2.prefix || p1.prefix <= 8) return false;

  const parentPrefix = p1.prefix - 1;
  const parentMask = (~0 << (32 - parentPrefix)) >>> 0;
  const l1 = ipToLong(p1.network);
  const l2 = ipToLong(p2.network);

  return ((l1 & parentMask) >>> 0) === ((l2 & parentMask) >>> 0);
}

/**
 * Объединение двух смежных подсетей в родительскую (prefix - 1)
 */
export function joinSubnets(cidr1, cidr2) {
  if (!canJoinSubnets(cidr1, cidr2)) return null;
  const p1 = parseSubnet(cidr1);
  const parentPrefix = p1.prefix - 1;
  const parentMask = (~0 << (32 - parentPrefix)) >>> 0;
  const parentNetL = (ipToLong(p1.network) & parentMask) >>> 0;

  return `${longToIp(parentNetL)}/${parentPrefix}`;
}
