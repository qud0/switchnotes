/**
 * ZTP (Zero-Touch Provisioning) Configuration Templates & Utilities
 * Focuses exclusively on SNR NAG (SNR-OS) and MikroTik RouterOS (v6/v7).
 */

export const VENDOR_PRESETS = {
  snr: {
    id: 'snr',
    name: 'SNR NAG (SNR-OS)',
    defaultBaudRate: 9600,
    defaultDataBits: 8,
    defaultStopBits: 1,
    defaultParity: 'none',
    defaultFlowControl: 'none',
    description: 'Коммутаторы SNR (S2965, S2985, S2995, S300G и др.)'
  },
  mikrotik: {
    id: 'mikrotik',
    name: 'MikroTik RouterOS',
    defaultBaudRate: 115200,
    defaultDataBits: 8,
    defaultStopBits: 1,
    defaultParity: 'none',
    defaultFlowControl: 'none',
    description: 'Маршрутизаторы и коммутаторы MikroTik (RouterOS v6 / v7, RouterBOOT)'
  }
};

/**
 * Converts CIDR prefix length (e.g. 24 or "24") to dotted-decimal netmask.
 * @param {number|string} cidr 
 * @returns {string}
 */
export function cidrToNetmask(cidr) {
  const prefix = Number.parseInt(cidr, 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    return '255.255.255.0';
  }
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return [
    (mask >>> 24) & 255,
    (mask >>> 16) & 255,
    (mask >>> 8) & 255,
    mask & 255
  ].join('.');
}

/**
 * Converts dotted-decimal netmask to CIDR prefix length.
 * @param {string} netmask 
 * @returns {number}
 */
export function netmaskToCidr(netmask) {
  if (!netmask || typeof netmask !== 'string') return 24;
  const parts = netmask.trim().split('.').map(p => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    return 24;
  }
  let binary = '';
  for (const byte of parts) {
    binary += byte.toString(2).padStart(8, '0');
  }
  const match = binary.match(/^1*/);
  return match ? match[0].length : 24;
}

/**
 * Generates initial ZTP provisioning script for SNR or MikroTik.
 * @param {Object} options
 * @param {string} options.vendor - 'snr' | 'mikrotik'
 * @param {string} options.hostname - Device name
 * @param {string} options.ip - Management IP
 * @param {string} [options.mask] - Dotted decimal netmask or prefix
 * @param {number|string} [options.cidr] - CIDR prefix (optional alternative)
 * @param {string} [options.gateway] - Default gateway
 * @param {string} [options.adminUser] - Admin username (default: 'admin')
 * @param {string} [options.adminPassword] - Admin password
 * @param {number|string} [options.vlanId] - Management VLAN ID (default: 1)
 * @returns {string} Multiline configuration string
 */
export function generateZtpConfig({
  vendor = 'snr',
  hostname = 'SWITCH',
  ip = '192.168.1.10',
  mask = '255.255.255.0',
  cidr,
  gateway = '192.168.1.1',
  adminUser = 'admin',
  adminPassword = '',
  vlanId = 1
}) {
  const cleanHost = (hostname || 'SWITCH').trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const cleanIp = (ip || '192.168.1.10').trim();
  const cleanGateway = (gateway || '').trim();
  const cleanUser = (adminUser || 'admin').trim();
  const cleanPass = adminPassword ? adminPassword.trim() : '';
  const numVlan = Number.parseInt(vlanId, 10) || 1;

  let dottedMask = mask ? mask.trim() : '255.255.255.0';
  let prefix = 24;
  if (cidr !== undefined && cidr !== null && cidr !== '') {
    prefix = Number.parseInt(cidr, 10) || 24;
    dottedMask = cidrToNetmask(prefix);
  } else if (dottedMask.includes('.')) {
    prefix = netmaskToCidr(dottedMask);
  } else {
    prefix = Number.parseInt(dottedMask, 10) || 24;
    dottedMask = cidrToNetmask(prefix);
  }

  if (vendor === 'mikrotik') {
    const lines = [
      '# === MikroTik RouterOS Initial Setup ===',
      `/system identity set name="${cleanHost}"`,
      `/ip address add address=${cleanIp}/${prefix} interface=ether1 comment="Management"`,
    ];

    if (cleanGateway) {
      lines.push(`/ip route add dst-address=0.0.0.0/0 gateway=${cleanGateway} comment="Default Route"`);
    }

    if (cleanPass) {
      lines.push(`/user add name=${cleanUser} password="${cleanPass}" group=full comment="SwitchBook Admin"`);
    }

    lines.push('/ip service enable numbers=ssh');
    lines.push('/ip service enable numbers=winbox');
    lines.push('# === End of MikroTik Config ===');
    return lines.join('\r\n');
  }

  // Default: SNR NAG (SNR-OS)
  const lines = [
    '! === SNR-OS Initial Setup ===',
    'enable',
    'config',
    `hostname ${cleanHost}`,
  ];

  if (numVlan !== 1) {
    lines.push(`vlan ${numVlan}`);
    lines.push(` name Management`);
    lines.push('exit');
  }

  lines.push(`interface Vlan${numVlan}`);
  lines.push(` ip address ${cleanIp} ${dottedMask}`);
  lines.push(' no shutdown');
  lines.push('exit');

  if (cleanGateway) {
    lines.push(`ip default-gateway ${cleanGateway}`);
  }

  if (cleanPass) {
    lines.push(`username ${cleanUser} privilege 15 password 0 ${cleanPass}`);
  }

  lines.push('ssh server enable');
  lines.push('exit');
  lines.push('write');
  lines.push('! === End of SNR Config ===');
  return lines.join('\r\n');
}
