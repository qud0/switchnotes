import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// База данных хранится в корне проекта: data/db.json (рядом со start.bat)
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LEGACY_DB_FILE = path.join(__dirname, 'data', 'db.json');

// Хеширование паролей пользователей (PBKDF2-SHA512)
export function hashPassword(password, salt) {
  const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, generatedSalt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: generatedSalt };
}

export function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const check = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return check === hash;
}

const adminPass = hashPassword('admin123', 'switchbook_salt_admin_2026');
const engPass = hashPassword('engineer123', 'switchbook_salt_eng_2026');
const viewerPass = hashPassword('viewer123', 'switchbook_salt_viewer_2026');

export const DEFAULT_USERS = [
  {
    id: 'usr-admin',
    username: 'admin',
    passwordHash: adminPass.hash,
    salt: adminPass.salt,
    role: 'admin',
    name: 'Главный администратор',
    email: 'admin@company.local',
    active: true,
    createdAt: '2026-10-12T00:00:00.000Z',
    lastLogin: null
  },
  {
    id: 'usr-engineer',
    username: 'engineer',
    passwordHash: engPass.hash,
    salt: engPass.salt,
    role: 'engineer',
    name: 'Дежурный сетевой инженер',
    email: 'engineer@company.local',
    active: true,
    createdAt: '2026-10-12T00:00:00.000Z',
    lastLogin: null
  },
  {
    id: 'usr-viewer',
    username: 'viewer',
    passwordHash: viewerPass.hash,
    salt: viewerPass.salt,
    role: 'viewer',
    name: 'Оператор мониторинга (Только чтение)',
    email: 'viewer@company.local',
    active: true,
    createdAt: '2026-10-12T00:00:00.000Z',
    lastLogin: null
  }
];

const DEFAULT_VLANS = [
  { id: 1, name: 'Default', color: '#64748b', description: 'Нетегированный стандартный VLAN', subnet: '192.168.1.0/24', gateway: '192.168.1.1', dhcpRange: '192.168.1.100 - 192.168.1.200', dns: '192.168.1.1' },
  { id: 10, name: 'Management', color: '#8b5cf6', description: 'Управление оборудованием', subnet: '192.168.10.0/24', gateway: '192.168.10.1', dhcpRange: '', dns: '192.168.10.1' },
  { id: 20, name: 'Office LAN', color: '#3b82f6', description: 'Рабочие места сотрудников', subnet: '192.168.20.0/24', gateway: '192.168.20.1', dhcpRange: '192.168.20.100 - 192.168.20.250', dns: '192.168.10.1, 77.88.8.8' },
  { id: 30, name: 'Wi-Fi APs', color: '#f59e0b', description: 'Точки доступа Ubiquiti', subnet: '192.168.30.0/24', gateway: '192.168.30.1', dhcpRange: '192.168.30.50 - 192.168.30.250', dns: '192.168.10.1' },
  { id: 40, name: 'IP Telephony', color: '#10b981', description: 'VoIP телефоны', subnet: '192.168.40.0/24', gateway: '192.168.40.1', dhcpRange: '192.168.40.50 - 192.168.40.250', dns: '192.168.10.1' },
  { id: 50, name: 'CCTV / Охрана', color: '#f43f5e', description: 'Камеры видеонаблюдения', subnet: '192.168.50.0/24', gateway: '192.168.50.1', dhcpRange: '192.168.50.100 - 192.168.50.250', dns: '192.168.10.1' },
  { id: 100, name: 'Servers', color: '#6366f1', description: 'Серверный сегмент', subnet: '192.168.100.0/24', gateway: '192.168.100.1', dhcpRange: '', dns: '192.168.100.10, 192.168.10.1' },
  { id: 200, name: 'DMZ / Uplink', color: '#ea580c', description: 'Внешний сегмент и интернет', subnet: '192.168.200.0/29', gateway: '192.168.200.1', dhcpRange: '', dns: '8.8.8.8, 1.1.1.1' }
];

const DEFAULT_IP_ALLOCATIONS = [
  // VLAN 10: Management (192.168.10.0/24)
  { id: 'ip-1', ip: '192.168.10.1', vlanId: 10, hostname: 'sw-core-mikrotik', mac: 'B8:69:F4:01:22:33', type: 'switch', status: 'active', location: 'Серверная 1, Стойка 1, Unit 24', connectedTo: 'Core Router / Bridge', description: 'Основной шлюз сети и коммутатор ядра CRS326' },
  { id: 'ip-2', ip: '192.168.10.10', vlanId: 10, hostname: 'sw-dist-snr', mac: 'F8:F0:82:11:44:55', type: 'switch', status: 'active', location: '2 этаж, Кроссовая 201, Unit 12', connectedTo: 'sw-core-mikrotik (sfp-sfpplus1)', description: 'Коммутатор распределения SNR-S2985G-24T PoE' },
  { id: 'ip-3', ip: '192.168.10.20', vlanId: 10, hostname: 'sw-access-unifi', mac: '74:83:C2:55:66:77', type: 'switch', status: 'active', location: '3 этаж, Шкаф офиса продаж, Unit 04', connectedTo: 'sw-dist-snr (Port-Channel 1)', description: 'Коммутатор доступа UniFi Switch Pro 24 PoE' },
  { id: 'ip-4', ip: '192.168.10.254', vlanId: 10, hostname: 'idrac-srv-core', mac: '14:18:77:22:99:AA', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 22', connectedTo: 'sw-core-mikrotik (ether2)', description: 'Модуль управления Dell iDRAC9 Enterprise' },

  // VLAN 20: Office LAN (192.168.20.0/24)
  { id: 'ip-5', ip: '192.168.20.1', vlanId: 20, hostname: 'gw-office-vlan20', mac: 'B8:69:F4:01:22:34', type: 'gateway', status: 'active', location: 'Серверная 1, Unit 24', connectedTo: 'MikroTik VLAN20 Interface', description: 'Шлюз подсети 192.168.20.1' },
  { id: 'ip-6', ip: '192.168.20.11', vlanId: 20, hostname: 'pc-accountant-01', mac: '00:1A:2B:3C:4D:5E', type: 'workstation', status: 'active', location: 'Каб. 201 (Бухгалтерия)', connectedTo: 'PP-01:П1 → Каб. 201 (Р-1.1)', description: 'Рабочее место Главный бухгалтер (ПК)' },
  { id: 'ip-7', ip: '192.168.20.12', vlanId: 20, hostname: 'pc-accountant-02', mac: '00:1A:2B:3C:4D:5F', type: 'workstation', status: 'active', location: 'Каб. 201 (Бухгалтерия)', connectedTo: 'PP-01:П2 → Каб. 201 (Р-1.2)', description: 'Бухгалтер по зарплате (ПК)' },
  { id: 'ip-8', ip: '192.168.20.21', vlanId: 20, hostname: 'pc-hr-lead', mac: '50:EB:71:01:02:03', type: 'workstation', status: 'active', location: 'Каб. 202 (Отдел кадров)', connectedTo: 'PP-01:П3 → Каб. 202 (Р-2.1)', description: 'Начальник отдела кадров (ПК)' },
  { id: 'ip-9', ip: '192.168.20.22', vlanId: 20, hostname: 'prn-kyocera-hr', mac: '00:25:07:33:44:55', type: 'printer', status: 'active', location: 'Каб. 202 (Отдел кадров)', connectedTo: 'PP-01:П4 → Каб. 202 (Р-2.2)', description: 'Сетевое МФУ Kyocera ECOSYS M2040dn' },
  { id: 'ip-10', ip: '192.168.20.31', vlanId: 20, hostname: 'pc-director', mac: '3C:06:30:11:22:33', type: 'workstation', status: 'active', location: 'Каб. 203 (Дирекция)', connectedTo: 'PP-01:П5 → Каб. 203 (Р-3.1)', description: 'Рабочее место Генеральный директор' },
  { id: 'ip-11', ip: '192.168.20.41', vlanId: 20, hostname: 'pc-admin-sys', mac: '04:D4:C4:AA:BB:CC', type: 'workstation', status: 'active', location: 'Каб. 204 (IT отдел)', connectedTo: 'PP-01:П9 → Каб. 204 (Р-4.1)', description: 'ПК Системного администратора' },

  // VLAN 30: Wi-Fi APs (192.168.30.0/24)
  { id: 'ip-12', ip: '192.168.30.1', vlanId: 30, hostname: 'gw-wifi-vlan30', mac: 'B8:69:F4:01:22:35', type: 'gateway', status: 'active', location: 'Серверная 1, Unit 24', connectedTo: 'MikroTik VLAN30 Interface', description: 'Шлюз подсети Wi-Fi точек доступа' },
  { id: 'ip-13', ip: '192.168.30.11', vlanId: 30, hostname: 'u6-pro-floor2-corridor', mac: '68:D7:9A:12:34:56', type: 'ap', status: 'active', location: '2 этаж, Коридор', connectedTo: 'sw-dist-snr:p17', description: 'Точка доступа UniFi U6-Pro Холл' },
  { id: 'ip-14', ip: '192.168.30.21', vlanId: 30, hostname: 'u6-pro-floor3-sales', mac: '68:D7:9A:78:90:AB', type: 'ap', status: 'active', location: '3 этаж, Офис продаж', connectedTo: 'PP-02:П3 → Потолок 3 эт. (Р-AP-01)', description: 'Точка доступа UniFi U6-Pro Зал продаж' },
  { id: 'ip-15', ip: '192.168.30.22', vlanId: 30, hostname: 'u6-pro-floor3-meet', mac: '68:D7:9A:CD:EF:01', type: 'ap', status: 'active', location: '3 этаж, Переговорная', connectedTo: 'PP-02:П4 → Потолок 3 эт. (Р-AP-02)', description: 'Точка доступа UniFi U6-Pro Переговорная' },

  // VLAN 40: IP Telephony (192.168.40.0/24)
  { id: 'ip-16', ip: '192.168.40.1', vlanId: 40, hostname: 'gw-voip-vlan40', mac: 'B8:69:F4:01:22:36', type: 'gateway', status: 'active', location: 'Серверная 1, Unit 24', connectedTo: 'MikroTik VLAN40 Interface', description: 'Шлюз подсети IP-телефонии' },
  { id: 'ip-17', ip: '192.168.40.10', vlanId: 40, hostname: 'pbx-asterisk-srv', mac: '00:0C:29:4F:8E:12', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 20', connectedTo: 'sw-core-mikrotik:p10', description: 'Сервер IP-АТС FreePBX / Asterisk' },
  { id: 'ip-18', ip: '192.168.40.101', vlanId: 40, hostname: 'sip-grandstream-201', mac: '00:0B:82:11:22:33', type: 'phone', status: 'active', location: 'Каб. 201 (Бухгалтерия)', connectedTo: 'PP-01:П11 → Каб. 201 (Р-1.3)', description: 'SIP-телефон Grandstream GXP1625 (Доб. 101)' },
  { id: 'ip-19', ip: '192.168.40.102', vlanId: 40, hostname: 'sip-yealink-202', mac: '80:5E:C0:44:55:66', type: 'phone', status: 'active', location: 'Каб. 202 (Отдел кадров)', connectedTo: 'PP-01:П12 → Каб. 202 (Р-2.3)', description: 'SIP-телефон Yealink SIP-T31P (Доб. 102)' },

  // VLAN 50: CCTV (192.168.50.0/24)
  { id: 'ip-20', ip: '192.168.50.1', vlanId: 50, hostname: 'gw-cctv-vlan50', mac: 'B8:69:F4:01:22:37', type: 'gateway', status: 'active', location: 'Серверная 1, Unit 24', connectedTo: 'MikroTik VLAN50 Interface', description: 'Шлюз подсети видеонаблюдения' },
  { id: 'ip-21', ip: '192.168.50.10', vlanId: 50, hostname: 'nvr-hikvision-32ch', mac: '58:03:FB:AA:BB:CC', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 18', connectedTo: 'sw-core-mikrotik:p12', description: 'Видеорегистратор NVR 32 канала' },
  { id: 'ip-22', ip: '192.168.50.101', vlanId: 50, hostname: 'cam-cctv-entrance', mac: 'F8:F0:82:99:88:77', type: 'cctv', status: 'active', location: 'Коридор 2 эт. (Вход)', connectedTo: 'PP-01:П7 → Коридор (Р-CCTV-1)', description: 'Уличная IP-камера входной группы SNR-CI-DB2.0I' },
  { id: 'ip-23', ip: '192.168.50.102', vlanId: 50, hostname: 'cam-cctv-turnstile', mac: 'F8:F0:82:99:88:88', type: 'cctv', status: 'active', location: 'Коридор 2 эт. (Турникет)', connectedTo: 'PP-01:П8 → Коридор (Р-CCTV-2)', description: 'Купольная IP-камера турникета СКУД SNR' },

  // VLAN 100: Servers (192.168.100.0/24)
  { id: 'ip-24', ip: '192.168.100.1', vlanId: 100, hostname: 'gw-servers-vlan100', mac: 'B8:69:F4:01:22:38', type: 'gateway', status: 'active', location: 'Серверная 1, Unit 24', connectedTo: 'MikroTik VLAN100 Interface', description: 'Основной шлюз серверного сегмента' },
  { id: 'ip-25', ip: '192.168.100.10', vlanId: 100, hostname: 'dc01.corp.local', mac: '00:50:56:B2:10:01', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 22', connectedTo: 'sw-core-mikrotik:ether3', description: 'Active Directory Primary Domain Controller + DNS' },
  { id: 'ip-26', ip: '192.168.100.20', vlanId: 100, hostname: 'srv-1c-postgresql', mac: '00:50:56:B2:10:02', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 22', connectedTo: 'sw-core-mikrotik:ether4', description: 'Сервер баз данных 1С:Предприятие 8.3 + PostgreSQL 16' },
  { id: 'ip-27', ip: '192.168.100.30', vlanId: 100, hostname: 'nas-synology-backup', mac: '00:11:32:88:99:00', type: 'server', status: 'active', location: 'Серверная 1, Стойка 1, Unit 19', connectedTo: 'sw-core-mikrotik:ether5', description: 'Сетевое хранилище Synology RackStation RS2423+' }
];

export function generatePortName(vendor, type, index, copperCount = 24) {
  const v = (vendor || '').toLowerCase();
  const sfpIndex = index - copperCount;

  if (v.includes('eltex')) {
    if (type === 'sfp') {
      return `tengigabitethernet1/0/${sfpIndex}`;
    }
    return `gigabitethernet1/0/${index}`;
  }

  if (v.includes('cisco')) {
    if (type === 'sfp') {
      return `TenGigabitEthernet1/0/${sfpIndex}`;
    }
    return `GigabitEthernet1/0/${index}`;
  }

  if (v.includes('huawei')) {
    if (type === 'sfp') {
      return `XGE0/0/${sfpIndex}`;
    }
    return `GE0/0/${index}`;
  }

  if (v.includes('d-link') || v.includes('dlink')) {
    return `port ${index}`;
  }

  if (v.includes('zyxel')) {
    if (type === 'sfp') {
      return `sfp ${sfpIndex}`;
    }
    return `port ${index}`;
  }

  if (v.includes('mikrotik')) {
    if (type === 'sfp') {
      return `sfp-sfpplus${sfpIndex}`;
    }
    return `ether${index}`;
  }

  if (v.includes('snr')) {
    if (type === 'sfp') {
      return `TenGigabitEthernet 1/0/${sfpIndex}`;
    }
    return `GigabitEthernet 1/0/${index}`;
  }

  if (v.includes('ubiquiti') || v.includes('unifi')) {
    if (type === 'sfp') {
      return `SFP+ ${sfpIndex}`;
    }
    return `Port ${index}`;
  }

  // Generic fallback
  return type === 'sfp' ? `SFP ${sfpIndex}` : `Port ${index}`;
}

export function generatePortsForSwitch(vendor = 'MikroTik', copperCount = 24, sfpCount = 4) {
  const ports = [];
  
  for (let i = 1; i <= copperCount; i++) {
    let mode = 'access';
    let pvid = 1;
    let tagged = [];
    let desc = '';
    let connectedTo = '';

    if (i <= 8) {
      pvid = 20;
      desc = `Рабочее место ${i}`;
      connectedTo = `ПК-Кабинет 10${i}`;
    } else if (i <= 12) {
      pvid = 40;
      desc = `IP-Телефон ${i - 8}`;
      connectedTo = `SIP-Телефон`;
    } else if (i <= 16) {
      pvid = 50;
      desc = `Камера наблюдения ${i - 12}`;
      connectedTo = `IP-камера SNR`;
    } else if (i <= 20) {
      pvid = 30;
      desc = `Точка доступа UniFi ${i - 16}`;
      connectedTo = `UniFi U6-Pro`;
    } else if (i >= 23) {
      mode = 'trunk';
      pvid = 10;
      tagged = [10, 20, 30, 40, 50, 100];
      desc = `Trunk link #${i - 22}`;
      connectedTo = `Аплинк`;
    }

    ports.push({
      id: `p${i}`,
      number: i,
      name: generatePortName(vendor, 'rj45', i, copperCount),
      type: 'rj45',
      mode: mode,
      pvid: pvid,
      taggedVlans: tagged,
      description: desc,
      connectedTo: connectedTo,
      linkedSwitchId: null,
      linkedPortId: null,
      lagId: null,
      lagName: '',
      speed: '1G',
      poe: i <= 16,
      enabled: true
    });
  }

  for (let j = 1; j <= sfpCount; j++) {
    const portNum = copperCount + j;
    const isUplink = j <= 2;
    ports.push({
      id: `p${portNum}`,
      number: portNum,
      name: generatePortName(vendor, 'sfp', portNum, copperCount),
      type: 'sfp',
      mode: isUplink ? 'trunk' : 'access',
      pvid: 10,
      taggedVlans: isUplink ? [10, 20, 30, 40, 50, 100, 200] : [],
      description: isUplink ? `Core Uplink ${j}` : `Свободная SFP-корзина`,
      connectedTo: isUplink ? `Магистраль` : '',
      linkedSwitchId: null,
      linkedPortId: null,
      lagId: null,
      lagName: '',
      speed: '10G',
      poe: false,
      enabled: isUplink
    });
  }

  return ports;
}

// 1. MikroTik CRS326 Core Switch
const mtPorts = generatePortsForSwitch('MikroTik', 24, 2);

// 2. SNR-S2985G-24T Distribution Switch
const snrPorts = generatePortsForSwitch('SNR', 24, 4);

// 3. Ubiquiti UniFi Pro 24 PoE Access Switch
const ubntPorts = generatePortsForSwitch('Ubiquiti', 24, 2);

// Link MikroTik SFP+ 1 <-> SNR SFP+ 1 (10G Fiber Uplink)
mtPorts[24].linkedSwitchId = 'sw-snr-s2985g';
mtPorts[24].linkedPortId = 'p25';
mtPorts[24].connectedTo = 'sw-dist-snr (TenGigabitEthernet 1/0/1)';

snrPorts[24].linkedSwitchId = 'sw-mt-crs326';
snrPorts[24].linkedPortId = 'p25';
snrPorts[24].connectedTo = 'sw-core-mikrotik (sfp-sfpplus1)';

// Configure 2x 1G LACP LAG between SNR and Ubiquiti on ports 23 & 24!
snrPorts[22].lagId = 1;
snrPorts[22].lagName = 'Port-Channel 1';
snrPorts[22].mode = 'trunk';
snrPorts[22].pvid = 10;
snrPorts[22].taggedVlans = [10, 20, 30, 40, 50, 100];
snrPorts[22].description = 'LACP Uplink #1 to Ubiquiti';
snrPorts[22].linkedSwitchId = 'sw-ubnt-pro24';
snrPorts[22].linkedPortId = 'p23';
snrPorts[22].connectedTo = 'sw-access-unifi (Port 23) [LAG 1]';

snrPorts[23].lagId = 1;
snrPorts[23].lagName = 'Port-Channel 1';
snrPorts[23].mode = 'trunk';
snrPorts[23].pvid = 10;
snrPorts[23].taggedVlans = [10, 20, 30, 40, 50, 100];
snrPorts[23].description = 'LACP Uplink #2 to Ubiquiti';
snrPorts[23].linkedSwitchId = 'sw-ubnt-pro24';
snrPorts[23].linkedPortId = 'p24';
snrPorts[23].connectedTo = 'sw-access-unifi (Port 24) [LAG 1]';

ubntPorts[22].lagId = 1;
ubntPorts[22].lagName = 'LAG 1';
ubntPorts[22].mode = 'trunk';
ubntPorts[22].pvid = 10;
ubntPorts[22].taggedVlans = [10, 20, 30, 40, 50, 100];
ubntPorts[22].description = 'LACP Downlink #1 to SNR';
ubntPorts[22].linkedSwitchId = 'sw-snr-s2985g';
ubntPorts[22].linkedPortId = 'p23';
ubntPorts[22].connectedTo = 'sw-dist-snr (GigabitEthernet 1/0/23) [Port-Channel 1]';

ubntPorts[23].lagId = 1;
ubntPorts[23].lagName = 'LAG 1';
ubntPorts[23].mode = 'trunk';
ubntPorts[23].pvid = 10;
ubntPorts[23].taggedVlans = [10, 20, 30, 40, 50, 100];
ubntPorts[23].description = 'LACP Downlink #2 to SNR';
ubntPorts[23].linkedSwitchId = 'sw-snr-s2985g';
ubntPorts[23].linkedPortId = 'p24';
ubntPorts[23].connectedTo = 'sw-dist-snr (GigabitEthernet 1/0/24) [Port-Channel 1]';

export function generatePatchPanelPorts(count = 24) {
  const ports = [];
  for (let i = 1; i <= count; i++) {
    ports.push({
      id: `pp-p${i}`,
      number: i,
      room: '',
      socket: `Р-${i}`,
      cableType: 'UTP Cat.6',
      cableLength: '25м',
      cableMark: `К-${i}`,
      status: 'free',
      description: '',
      connectedSwitchId: null,
      connectedSwitchPortId: null,
      patchCordColor: '#3b82f6',
      patchCordLength: '1м'
    });
  }
  return ports;
}

// Default Patch Panel 1 (Floor 2 Cross)
const ppFloor2Ports = generatePatchPanelPorts(24);
const ppFloor2Init = [
  { n: 1, room: 'Каб. 201 (Бухгалтерия)', socket: 'Р-1.1', len: '22м', mark: 'К-201-1', desc: 'Рабочее место Главбух (ПК)', swId: 'sw-snr-s2985g', swPort: 'p1', color: '#3b82f6' },
  { n: 2, room: 'Каб. 201 (Бухгалтерия)', socket: 'Р-1.2', len: '23м', mark: 'К-201-2', desc: 'Бухгалтер по зарплате (ПК)', swId: 'sw-snr-s2985g', swPort: 'p2', color: '#3b82f6' },
  { n: 3, room: 'Каб. 202 (Отдел кадров)', socket: 'Р-2.1', len: '28м', mark: 'К-202-1', desc: 'Рабочее место Кадры (ПК)', swId: 'sw-snr-s2985g', swPort: 'p3', color: '#3b82f6' },
  { n: 4, room: 'Каб. 202 (Отдел кадров)', socket: 'Р-2.2', len: '29м', mark: 'К-202-2', desc: 'МФУ Kyocera сетевой принтер', swId: 'sw-snr-s2985g', swPort: 'p4', color: '#10b981' },
  { n: 5, room: 'Каб. 203 (Дирекция)', socket: 'Р-3.1', len: '38м', mark: 'К-203-1', desc: 'Рабочее место Генеральный директор', swId: 'sw-snr-s2985g', swPort: 'p5', color: '#3b82f6' },
  { n: 6, room: 'Каб. 203 (Дирекция)', socket: 'Р-3.2', len: '39м', mark: 'К-203-2', desc: 'Smart TV в переговорной директора', swId: 'sw-snr-s2985g', swPort: 'p6', color: '#8b5cf6' },
  { n: 7, room: 'Коридор 2 эт. (Вход)', socket: 'Р-CCTV-1', len: '17м', mark: 'К-СВН-01', desc: 'IP-камера входной группы SNR', swId: 'sw-snr-s2985g', swPort: 'p7', color: '#f43f5e' },
  { n: 8, room: 'Коридор 2 эт. (Турникет)', socket: 'Р-CCTV-2', len: '24м', mark: 'К-СВН-02', desc: 'IP-камера турникет СКУД', swId: 'sw-snr-s2985g', swPort: 'p8', color: '#f43f5e' },
  { n: 9, room: 'Каб. 204 (IT отдел)', socket: 'Р-4.1', len: '12м', mark: 'К-204-1', desc: 'Системный администратор (ПК 1)', swId: 'sw-snr-s2985g', swPort: 'p9', color: '#f59e0b' },
  { n: 10, room: 'Каб. 204 (IT отдел)', socket: 'Р-4.2', len: '13м', mark: 'К-204-2', desc: 'Инженер техподдержки (ПК 2)', swId: 'sw-snr-s2985g', swPort: 'p10', color: '#f59e0b' },
  { n: 11, room: 'Каб. 201 (Бухгалтерия)', socket: 'Р-1.3', len: '23м', mark: 'К-201-3', desc: 'VoIP телефон Grandstream', swId: 'sw-snr-s2985g', swPort: 'p11', color: '#06b6d4' },
  { n: 12, room: 'Каб. 202 (Отдел кадров)', socket: 'Р-2.3', len: '29м', mark: 'К-202-3', desc: 'VoIP телефон Yealink', swId: 'sw-snr-s2985g', swPort: 'p12', color: '#06b6d4' }
];

ppFloor2Init.forEach(item => {
  const p = ppFloor2Ports[item.n - 1];
  p.room = item.room;
  p.socket = item.socket;
  p.cableLength = item.len;
  p.cableMark = item.mark;
  p.description = item.desc;
  p.status = 'connected';
  p.connectedSwitchId = item.swId;
  p.connectedSwitchPortId = item.swPort;
  p.patchCordColor = item.color;

  // Link to SNR switch
  const snrP = snrPorts[item.n - 1];
  if (snrP) {
    snrP.patchPanelId = 'pp-floor2-01';
    snrP.patchPanelPortId = p.id;
    snrP.connectedTo = `PP-01:П${item.n} → ${item.room} (${item.socket})`;
  }
});

// Default Patch Panel 2 (Floor 3 Sales Office)
const ppFloor3Ports = generatePatchPanelPorts(24);
const ppFloor3Init = [
  { n: 1, room: 'Офис продаж (Зал)', socket: 'Р-301.1', len: '16м', mark: 'К-301-1', desc: 'Менеджер по продажам 1 (ПК)', swId: 'sw-ubnt-pro24', swPort: 'p1', color: '#3b82f6' },
  { n: 2, room: 'Офис продаж (Зал)', socket: 'Р-301.2', len: '18м', mark: 'К-301-2', desc: 'Менеджер по продажам 2 (ПК)', swId: 'sw-ubnt-pro24', swPort: 'p2', color: '#3b82f6' },
  { n: 3, room: 'Потолок 3 эт. (Зал)', socket: 'Р-AP-01', len: '21м', mark: 'К-AP-01', desc: 'Точка доступа UniFi U6-Pro', swId: 'sw-ubnt-pro24', swPort: 'p3', color: '#10b981' },
  { n: 4, room: 'Потолок 3 эт. (Переговорная)', socket: 'Р-AP-02', len: '28м', mark: 'К-AP-02', desc: 'Точка доступа UniFi U6-Pro', swId: 'sw-ubnt-pro24', swPort: 'p4', color: '#10b981' }
];

ppFloor3Init.forEach(item => {
  const p = ppFloor3Ports[item.n - 1];
  p.room = item.room;
  p.socket = item.socket;
  p.cableLength = item.len;
  p.cableMark = item.mark;
  p.description = item.desc;
  p.status = 'connected';
  p.connectedSwitchId = item.swId;
  p.connectedSwitchPortId = item.swPort;
  p.patchCordColor = item.color;

  // Link to Ubiquiti switch
  const ubntP = ubntPorts[item.n - 1];
  if (ubntP) {
    ubntP.patchPanelId = 'pp-floor3-01';
    ubntP.patchPanelPortId = p.id;
    ubntP.connectedTo = `PP-02:П${item.n} → ${item.room} (${item.socket})`;
  }
});

const DEFAULT_PATCH_PANELS = [
  {
    id: 'pp-floor2-01',
    name: 'PP-01 (Этаж 2, Кроссовая 201)',
    model: '19" 24xRJ45 Cat.6 UTP 1U',
    location: '2 этаж, Кроссовая 201, Шкаф ШТВ-1, Unit 13',
    notes: 'Основной кросс 2-го этажа. Кабели витой пары UTP 4x2 Cat.6 до розеток в кабинетах 201-205.',
    portCount: 24,
    ports: ppFloor2Ports,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'pp-floor3-01',
    name: 'PP-02 (Этаж 3, Офис продаж)',
    model: '19" 24xRJ45 Cat.6 UTP 1U',
    location: '3 этаж, Шкаф офиса продаж, Unit 05',
    notes: 'Патч-панель открытого офиса продаж и потолочных точек доступа UniFi.',
    portCount: 24,
    ports: ppFloor3Ports,
    updatedAt: new Date().toISOString()
  }
];

const DEFAULT_SWITCHES = [
  {
    id: 'sw-mt-crs326',
    name: 'sw-core-mikrotik',
    vendor: 'MikroTik',
    model: 'CRS326-24G-2S+RM',
    ip: '192.168.10.1',
    mac: 'B8:69:F4:01:22:33',
    location: 'Серверная 1, Стойка 1, Unit 24',
    notes: 'Ядро сети. RouterOS v7.14, Bridge VLAN Filtering включен.',
    copperPorts: 24,
    sfpPorts: 2,
    ports: mtPorts,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sw-snr-s2985g',
    name: 'sw-dist-snr',
    vendor: 'SNR',
    model: 'SNR-S2985G-24T (PoE)',
    ip: '192.168.10.10',
    mac: 'F8:F0:82:11:44:55',
    location: '2 этаж, Кроссовая 201, Шкаф ШТВ-1, Unit 12',
    notes: 'Коммутатор распределения. Питает рабочие места и камеры.',
    copperPorts: 24,
    sfpPorts: 4,
    ports: snrPorts,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'sw-ubnt-pro24',
    name: 'sw-access-unifi',
    vendor: 'Ubiquiti',
    model: 'UniFi Switch Pro 24 PoE',
    ip: '192.168.10.20',
    mac: '74:83:C2:55:66:77',
    location: '3 этаж, Шкаф офиса продаж, Unit 04',
    notes: 'Подключение точек доступа UniFi U6-Pro и IP-телефонов.',
    copperPorts: 24,
    sfpPorts: 2,
    ports: ubntPorts,
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_FLOOR_PLANS = [
  {
    id: 'floor-2',
    name: 'Этаж 2 (Офис, Бухгалтерия, Кадры)',
    level: 2,
    crossCabinet: 'Шкаф ШТВ-1 (Кроссовая 201)',
    patchPanelId: 'pp-floor2-01',
    serverRoomPos: { x: 510, y: 495 },
    rooms: [
      { id: 'r-201', name: 'Каб. 201 (Бухгалтерия)', x: 60, y: 60, w: 260, h: 200, type: 'office' },
      { id: 'r-202', name: 'Каб. 202 (Отдел кадров)', x: 340, y: 60, w: 260, h: 200, type: 'office' },
      { id: 'r-203', name: 'Каб. 203 (Дирекция)', x: 620, y: 60, w: 280, h: 200, type: 'director' },
      { id: 'r-corridor', name: 'Центральный коридор 2 эт.', x: 60, y: 280, w: 840, h: 90, type: 'corridor' },
      { id: 'r-204', name: 'Каб. 204 (IT отдел)', x: 60, y: 390, w: 320, h: 210, type: 'it' },
      { id: 'r-cross201', name: 'Кроссовая 201 (ШТВ-1)', x: 400, y: 390, w: 220, h: 210, type: 'server_room' },
      { id: 'r-meeting2', name: 'Переговорная 2 эт.', x: 640, y: 390, w: 260, h: 210, type: 'meeting' }
    ],
    outlets: [
      { id: 'out-1', socket: 'Р-1.1', room: 'Каб. 201 (Бухгалтерия)', x: 100, y: 110, ppId: 'pp-floor2-01', portNum: 1, type: 'pc', label: 'Главбух (ПК)' },
      { id: 'out-2', socket: 'Р-1.2', room: 'Каб. 201 (Бухгалтерия)', x: 180, y: 110, ppId: 'pp-floor2-01', portNum: 2, type: 'pc', label: 'Зарплата (ПК)' },
      { id: 'out-11', socket: 'Р-1.3', room: 'Каб. 201 (Бухгалтерия)', x: 250, y: 170, ppId: 'pp-floor2-01', portNum: 11, type: 'voip', label: 'VoIP Телефон' },
      { id: 'out-3', socket: 'Р-2.1', room: 'Каб. 202 (Отдел кадров)', x: 390, y: 110, ppId: 'pp-floor2-01', portNum: 3, type: 'pc', label: 'Кадры (ПК)' },
      { id: 'out-4', socket: 'Р-2.2', room: 'Каб. 202 (Отдел кадров)', x: 470, y: 110, ppId: 'pp-floor2-01', portNum: 4, type: 'printer', label: 'МФУ Kyocera' },
      { id: 'out-12', socket: 'Р-2.3', room: 'Каб. 202 (Отдел кадров)', x: 530, y: 170, ppId: 'pp-floor2-01', portNum: 12, type: 'voip', label: 'VoIP Yealink' },
      { id: 'out-5', socket: 'Р-3.1', room: 'Каб. 203 (Дирекция)', x: 680, y: 110, ppId: 'pp-floor2-01', portNum: 5, type: 'pc', label: 'Ген. Директор' },
      { id: 'out-6', socket: 'Р-3.2', room: 'Каб. 203 (Дирекция)', x: 790, y: 170, ppId: 'pp-floor2-01', portNum: 6, type: 'tv', label: 'Smart TV' },
      { id: 'out-7', socket: 'Р-CCTV-1', room: 'Коридор 2 эт. (Вход)', x: 160, y: 325, ppId: 'pp-floor2-01', portNum: 7, type: 'camera', label: 'Камера Вход' },
      { id: 'out-8', socket: 'Р-CCTV-2', room: 'Коридор 2 эт. (Турникет)', x: 780, y: 325, ppId: 'pp-floor2-01', portNum: 8, type: 'camera', label: 'Камера СКУД' },
      { id: 'out-9', socket: 'Р-4.1', room: 'Каб. 204 (IT отдел)', x: 120, y: 460, ppId: 'pp-floor2-01', portNum: 9, type: 'pc', label: 'Сисадмин' },
      { id: 'out-10', socket: 'Р-4.2', room: 'Каб. 204 (IT отдел)', x: 220, y: 460, ppId: 'pp-floor2-01', portNum: 10, type: 'pc', label: 'Техподдержка' }
    ]
  },
  {
    id: 'floor-3',
    name: 'Этаж 3 (Офис продаж и Серверная)',
    level: 3,
    crossCabinet: 'Шкаф офиса продаж (Unit 05)',
    patchPanelId: 'pp-floor3-01',
    serverRoomPos: { x: 270, y: 530 },
    rooms: [
      { id: 'r-301', name: 'Офис продаж (Open Space)', x: 60, y: 60, w: 520, h: 260, type: 'office' },
      { id: 'r-302', name: 'Конференц-зал / Переговорная', x: 600, y: 60, w: 300, h: 260, type: 'meeting' },
      { id: 'r-corridor3', name: 'Коридор 3 эт.', x: 60, y: 340, w: 840, h: 80, type: 'corridor' },
      { id: 'r-server1', name: 'Серверная 1 (Стойка 42U)', x: 60, y: 440, w: 420, h: 180, type: 'server_room' },
      { id: 'r-dev', name: 'Отдел разработки ПО', x: 500, y: 440, w: 400, h: 180, type: 'it' }
    ],
    outlets: [
      { id: 'out-301', socket: 'Р-301.1', room: 'Офис продаж (Зал)', x: 160, y: 140, ppId: 'pp-floor3-01', portNum: 1, type: 'pc', label: 'Менеджер 1' },
      { id: 'out-302', socket: 'Р-301.2', room: 'Офис продаж (Зал)', x: 280, y: 140, ppId: 'pp-floor3-01', portNum: 2, type: 'pc', label: 'Менеджер 2' },
      { id: 'out-ap1', socket: 'Р-AP-01', room: 'Потолок 3 эт. (Зал)', x: 380, y: 180, ppId: 'pp-floor3-01', portNum: 3, type: 'wifi', label: 'Wi-Fi AP Зал' },
      { id: 'out-ap2', socket: 'Р-AP-02', room: 'Потолок 3 эт. (Переговорная)', x: 740, y: 180, ppId: 'pp-floor3-01', portNum: 4, type: 'wifi', label: 'Wi-Fi AP Переговорная' }
    ]
  }
];

export const DEFAULT_NOTES = [
  {
    id: 'note-1',
    title: 'Цветовая кодировка патч-кордов (Стандарт СКС)',
    category: 'СКС',
    color: '#3b82f6',
    pinned: true,
    content: `Регламент цветовой маркировки коммутационных шнуров в шкафах:

* **Синий (#3b82f6):** Стандартные рабочие места пользователей (ПК, ноутбуки)
* **Зеленый (#10b981):** Сетевые принтеры, МФУ и офисная оргтехника
* **Красный (#f43f5e):** Системы безопасности (IP-камеры CCTV, СКУД турникеты)
* **Желтый/Оранжевый (#f59e0b):** Серверы, СХД, гипервизоры и СУБД
* **Голубой (#06b6d4):** IP-телефония (VoIP телефоны Grandstream / Yealink)
* **Фиолетовый (#8b5cf6):** Wi-Fi точки доступа UniFi и мультимедиа (Smart TV)
* **Серый:** Uplink и кросс-соединения между коммутаторами`,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note-2',
    title: 'Памятка: Bridge VLAN Filtering на MikroTik RouterOS v7',
    category: 'MikroTik',
    color: '#8b5cf6',
    pinned: true,
    content: `Порядок настройки 802.1Q на MikroTik без разрыва связи:

1. Создаем общий бридж с отключенным фильтром:
   \`/interface bridge add name=bridge1 vlan-filtering=no\`
2. Добавляем порты в бридж, указывая PVID (для access портов):
   \`/interface bridge port add bridge=bridge1 interface=ether2 pvid=20\`
3. Прописываем тегированные и нетегированные VLAN:
   \`/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=bridge1,sfp-sfpplus1 untagged=ether2\`
4. Создаем VLAN-интерфейс ядра для маршрутизации:
   \`/interface vlan add name=vlan20-office vlan-id=20 interface=bridge1\`
5. **Включаем фильтрацию (Hardware Offloading сохраняется):**
   \`/interface bridge set bridge1 vlan-filtering=yes\``,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note-3',
    title: 'Полезные CLI команды для коммутаторов SNR S2985G',
    category: 'SNR',
    color: '#10b981',
    pinned: false,
    content: `Часто используемые команды диагностики в консоли SNR:

* Просмотр MAC-адресов на конкретном порту:
  \`show mac-address-table interface ethernet 1/0/1\`
* Проверка оптических уровней SFP (DDM):
  \`show transceiver detail interface te1/0/1\`
* Проверка PoE питания по портам:
  \`show power inline\`
* Диагностика кабеля (Virtual Cable Tester / VCT):
  \`virtual-cable-test ethernet 1/0/5\`
* Просмотр счетчиков ошибок (CRC, collision):
  \`show interface ethernet 1/0/1 counters\``,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note-4',
    title: 'Схема обжима кабеля RJ-45 (Стандарт T568B)',
    category: 'СКС',
    color: '#06b6d4',
    pinned: false,
    content: `Порядок проводников витой пары слева направо (замок разъема внизу):

1. Бело-оранжевый (Tx+)
2. Оранжевый (Tx-)
3. Бело-зеленый (Rx+)
4. Синий
5. Бело-синий
6. Зеленый (Rx-)
7. Бело-коричневый
8. Коричневый

> Для Cat.6 Gigabit Ethernet (1000BASE-T) используются все 4 пары! Максимальная длина линии от розетки до патч-панели — 90 метров (Permanent Link) + 10м патчкорды (Channel).`,
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_AUDIT_LOG = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    entity: 'switches',
    action: 'link',
    title: 'Настройка агрегации LACP (LAG 1)',
    details: 'Объединены порты 23 и 24 между SNR-S2985G и Ubiquiti Pro 24 в LACP Port-Channel 1.',
    author: 'admin'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    entity: 'ports',
    action: 'vlan_change',
    title: 'Назначение PVID на порту p5',
    details: 'Коммутатор sw-dist-snr: порт GigabitEthernet 1/0/5 назначен в VLAN 20 (Office LAN).',
    author: 'admin'
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
    entity: 'patchPanels',
    action: 'link',
    title: 'Кроссировка розеток Каб. 201',
    details: 'Патч-панель PP-01 (порты 1-2) скроссирована в порты p1-p2 коммутатора sw-dist-snr.',
    author: 'admin'
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    entity: 'vlans',
    action: 'create',
    title: 'Создан VLAN 40 (Security / СКУД)',
    details: 'Добавлена подсеть 192.168.40.0/24 для камер видеонаблюдения и турникетов.',
    author: 'admin'
  }
];

export const DEFAULT_SERVERS = [
  {
    id: 'srv-pve-01',
    name: 'pve-node-01',
    hostname: 'pve01.corp.local',
    vendor: 'Dell',
    model: 'PowerEdge R740',
    type: 'hypervisor',
    os: 'Proxmox VE 8.2 (Linux 6.8)',
    ip: '192.168.10.51',
    mac: '14:18:77:22:99:B0',
    location: 'Серверная 1, Стойка 1, Unit 20-21',
    unit: 20,
    unitHeight: 2,
    status: 'online',
    cpu: '2x Intel Xeon Gold 6248R (48c/96t)',
    ram: '256 GB ECC DDR4',
    storage: '8x 1.92TB NVMe (ZFS RAID10, 7.6 TB)',
    notes: 'Основной кластерный узел виртуализации Proxmox VE. Агрегация bond0 (LACP) к ядру.',
    nics: [
      { id: 'nic-1', name: 'eno1', type: 'copper', speed: '1G', mac: '14:18:77:22:99:B0', connectedSwitchId: 'sw-snr-s2985g', connectedPortId: 'p20', pvid: 10, role: 'management', ip: '192.168.10.51' },
      { id: 'nic-2', name: 'eno2', type: 'copper', speed: '1G', mac: '14:18:77:22:99:B1', connectedSwitchId: 'sw-snr-s2985g', connectedPortId: 'p21', pvid: 10, role: 'corosync', ip: '10.10.10.1' },
      { id: 'nic-3', name: 'ens1f0', type: 'sfp', speed: '10G', mac: '14:18:77:22:99:B2', connectedSwitchId: 'sw-core-mikrotik', connectedPortId: 'sfp-sfpplus1', role: 'bond0_slave' },
      { id: 'nic-4', name: 'ens1f1', type: 'sfp', speed: '10G', mac: '14:18:77:22:99:B3', connectedSwitchId: 'sw-core-mikrotik', connectedPortId: 'sfp-sfpplus2', role: 'bond0_slave' }
    ],
    bridges: [
      { id: 'br-1', name: 'bond0', type: 'LACP (802.3ad)', slaves: ['ens1f0', 'ens1f1'], description: 'Агрегированный транк 20G к ядру CRS326' },
      { id: 'br-2', name: 'vmbr0', type: 'Linux Bridge (VLAN-aware)', ports: ['bond0'], description: 'Виртуальный свитч для ВМ с поддержкой 802.1Q' }
    ],
    vms: [
      { vmid: 101, name: 'dc01.corp.local', os: 'Windows Server 2022', ip: '192.168.100.10', mac: '00:50:56:B2:10:01', vlan: 100, bridge: 'vmbr0', cores: 4, ram: '16 GB', disk: '120 GB', status: 'running', role: 'Active Directory Domain Controller + DNS' },
      { vmid: 102, name: 'srv-1c-postgresql', os: 'Ubuntu 24.04 LTS', ip: '192.168.100.20', mac: '00:50:56:B2:10:02', vlan: 100, bridge: 'vmbr0', cores: 16, ram: '64 GB', disk: '600 GB NVMe', status: 'running', role: '1C:Предприятие 8.3 + PostgreSQL 16' },
      { vmid: 103, name: 'pbx-asterisk', os: 'Debian 12 / Asterisk', ip: '192.168.40.10', mac: '00:0C:29:4F:8E:12', vlan: 40, bridge: 'vmbr0', cores: 4, ram: '8 GB', disk: '80 GB', status: 'running', role: 'Корпоративная IP-АТС FreePBX' },
      { vmid: 104, name: 'zabbix-mon', os: 'AlmaLinux 9', ip: '192.168.10.15', mac: '00:50:56:B2:10:04', vlan: 10, bridge: 'vmbr0', cores: 4, ram: '8 GB', disk: '100 GB', status: 'running', role: 'Мониторинг сети Zabbix 7.0 + Grafana' }
    ],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'srv-esxi-02',
    name: 'esxi-node-02',
    hostname: 'esxi02.corp.local',
    vendor: 'HPE',
    model: 'ProLiant DL380 Gen10',
    type: 'hypervisor',
    os: 'VMware ESXi 8.0 Update 2',
    ip: '192.168.10.52',
    mac: '2C:54:91:88:AA:10',
    location: 'Серверная 1, Стойка 1, Unit 16-17',
    unit: 16,
    unitHeight: 2,
    status: 'online',
    cpu: '2x Intel Xeon Silver 4214R (24c/48t)',
    ram: '128 GB ECC DDR4',
    storage: '8x 960GB SAS SSD (Hardware RAID6, 4.8 TB)',
    notes: 'Второй узел виртуализации VMware ESXi под тестовые стенды и репликацию.',
    nics: [
      { id: 'nic-e1', name: 'vmnic0', type: 'copper', speed: '1G', mac: '2C:54:91:88:AA:10', connectedSwitchId: 'sw-dist-snr', connectedPortId: 'p22', pvid: 10, role: 'management', ip: '192.168.10.52' },
      { id: 'nic-e2', name: 'vmnic1', type: 'copper', speed: '1G', mac: '2C:54:91:88:AA:11', connectedSwitchId: 'sw-dist-snr', connectedPortId: 'p23', pvid: 10, role: 'vmotion', ip: '10.20.10.2' },
      { id: 'nic-e3', name: 'vmnic2', type: 'sfp', speed: '10G', mac: '2C:54:91:88:AA:12', connectedSwitchId: 'sw-core-mikrotik', connectedPortId: 'sfp-sfpplus3', role: 'vSwitch0_uplink' }
    ],
    bridges: [
      { id: 'br-esx1', name: 'vSwitch0', type: 'VMware Standard vSwitch', ports: ['vmnic2'], description: 'Виртуальный коммутатор с Port Groups VLAN 10, 20, 100' }
    ],
    vms: [
      { vmid: 201, name: 'gitlab-ce-runner', os: 'Ubuntu 22.04 LTS', ip: '192.168.100.40', mac: '00:50:56:A1:20:01', vlan: 100, bridge: 'vSwitch0', cores: 8, ram: '16 GB', disk: '200 GB', status: 'running', role: 'GitLab CE Server + CI/CD Runner' },
      { vmid: 202, name: 'test-k8s-master', os: 'Debian 12 / Kubernetes', ip: '192.168.100.50', mac: '00:50:56:A1:20:02', vlan: 100, bridge: 'vSwitch0', cores: 4, ram: '8 GB', disk: '50 GB', status: 'running', role: 'Тестовый кластер K8s' }
    ],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'srv-truenas-01',
    name: 'nas-storage-01',
    hostname: 'nas01.corp.local',
    vendor: 'Supermicro',
    model: 'SuperStorage 2U 12-Bay',
    type: 'storage_nas',
    os: 'TrueNAS SCALE (Dragonfish)',
    ip: '192.168.100.30',
    mac: '00:25:90:77:88:99',
    location: 'Серверная 1, Стойка 1, Unit 14-15',
    unit: 14,
    unitHeight: 2,
    status: 'online',
    cpu: '1x AMD EPYC 7302P (16 core)',
    ram: '128 GB ECC DDR4',
    storage: '12x 16TB Seagate Exos Enterprise (ZFS RAIDZ2, ~120 TB)',
    notes: 'Центральное сетевое хранилище резервных копий (Veeam Backup & Replication, NFS и SMB).',
    nics: [
      { id: 'nic-t1', name: 'ipmi', type: 'copper', speed: '1G', mac: '00:25:90:77:88:00', connectedSwitchId: 'sw-snr-s2985g', connectedPortId: 'p24', pvid: 10, role: 'ipmi_mgmt', ip: '192.168.10.60' },
      { id: 'nic-t2', name: 'cxgbe0', type: 'sfp', speed: '10G', mac: '00:25:90:77:88:99', connectedSwitchId: 'sw-core-mikrotik', connectedPortId: 'sfp-sfpplus4', pvid: 100, role: 'storage_nfs_smb', ip: '192.168.100.30' }
    ],
    bridges: [],
    vms: [],
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_SNAPSHOTS = [
  {
    id: 'snap-initial',
    name: 'Базовая топология узла связи (v1.0)',
    description: 'Первоначальная конфигурация ядра MikroTik CRS326, распределения SNR и доступа UniFi.',
    timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
    author: 'admin',
    stats: {
      switchesCount: 3,
      portsCount: 80,
      vlansCount: 8,
      patchPanelsCount: 2
    }
  }
];

export const DEFAULT_BUILDINGS = [
  {
    id: 'bld-adm',
    name: 'Административный корпус (АБК)',
    code: 'АБК-1',
    type: 'office',
    description: 'Главное управление завода, бухгалтерия, отдел кадров, IT отдел и серверная.',
    floorsCount: 3,
    x: 160,
    y: 120,
    width: 220,
    height: 150,
    color: '#3b82f6',
    address: 'ул. Заводская, 1, лит. А',
    networkRole: 'Ядро и серверная площадка (Core Node)',
    uplinkTo: null,
    cableType: 'Оптика SMF 10G',
    switches: ['sw-mt-crs326'],
    patchPanels: ['pp-floor2-01'],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'bld-prod-1',
    name: 'Цех №1 (Механическая обработка)',
    code: 'ЦЕХ-1',
    type: 'production',
    description: 'Производственные линии ЧПУ, промышленные контроллеры, видеонаблюдение цеха.',
    floorsCount: 1,
    x: 480,
    y: 100,
    width: 280,
    height: 180,
    color: '#f59e0b',
    address: 'Корпус 2, Цех металлообработки',
    networkRole: 'Промышленный сегмент (Industrial Ethernet)',
    uplinkTo: 'bld-adm',
    cableType: 'Оптика ВОЛС 10G (В броне)',
    switches: ['sw-snr-s2985g'],
    patchPanels: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'bld-prod-2',
    name: 'Цех №2 (Сборка и покраска)',
    code: 'ЦЕХ-2',
    type: 'production',
    description: 'Сборочный участок, автоматизированный склад запчастей, терминалы сбора данных (ТСД).',
    floorsCount: 1,
    x: 480,
    y: 350,
    width: 280,
    height: 170,
    color: '#ea580c',
    address: 'Корпус 3, Сборочный цех',
    networkRole: 'Агрегация цеха №2',
    uplinkTo: 'bld-prod-1',
    cableType: 'Оптика ВОЛС 1G',
    switches: ['sw-ubnt-pro24'],
    patchPanels: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'bld-sklad',
    name: 'Логистический склад готовой продукции',
    code: 'СКЛАД-ГП',
    type: 'warehouse',
    description: 'Высотный склад, Wi-Fi роуминг для погрузчиков и ТСД, IP-камеры периметра.',
    floorsCount: 1,
    x: 160,
    y: 360,
    width: 220,
    height: 160,
    color: '#10b981',
    address: 'Складской терминал А',
    networkRole: 'Wi-Fi зона склада и CCTV',
    uplinkTo: 'bld-adm',
    cableType: 'Оптика SMF 1G',
    switches: [],
    patchPanels: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'bld-kpp',
    name: 'Центральная проходная (КПП №1 и СКУД)',
    code: 'КПП-1',
    type: 'security',
    description: 'Турникеты СКУД, распознавание номеров автотранспорта, пост охраны.',
    floorsCount: 1,
    x: 160,
    y: 590,
    width: 180,
    height: 100,
    color: '#f43f5e',
    address: 'Главный въезд на завод',
    networkRole: 'СКУД и охранное телевидение',
    uplinkTo: 'bld-adm',
    cableType: 'Витая пара Уличная FTP Cat.5e / Оптика',
    switches: [],
    patchPanels: [],
    updatedAt: new Date().toISOString()
  },
  {
    id: 'bld-boiler',
    name: 'Котельная и энергоблок (АСУ ТП)',
    code: 'ТЭЦ / Энерго',
    type: 'utility',
    description: 'Телеметрия котлов, учет электроэнергии, Modbus/TCP шлюзы.',
    floorsCount: 1,
    x: 480,
    y: 580,
    width: 200,
    height: 110,
    color: '#8b5cf6',
    address: 'Энергохозяйство, подстанция ТП-2',
    networkRole: 'АСУ ТП и телеметрия',
    uplinkTo: 'bld-adm',
    cableType: 'Оптика ВОЛС (Диэлектрик)',
    switches: [],
    patchPanels: [],
    updatedAt: new Date().toISOString()
  }
];

export const DEFAULT_CAMPUS_INFRASTRUCTURE = {
  // Кабельные колодцы, эстакады, столбы и оптические муфты
  points: [
    { id: 'pt-manhole-1', type: 'manhole', name: 'КК-1 (Колодец АБК)', x: 400, y: 195, depthM: 2.2, capacityLines: 8, notes: 'Кабельный колодец у административного корпуса. Ввод ВОЛС.' },
    { id: 'pt-tray-1', type: 'tray', name: 'ЭСТ-1 (Эстакада Цех-1)', x: 440, y: 195, depthM: 0, capacityLines: 12, notes: 'Трубная и кабельная эстакада между корпусами' },
    { id: 'pt-fosc-1', type: 'fosc', name: 'Муфта FOSC-A1', x: 440, y: 310, splicesCount: 24, opticalBudgetLossDb: 0.15, notes: 'Оптическая муфта 24 волокна. Ответвление на Склад и Цех-2.' },
    { id: 'pt-pole-1', type: 'pole', name: 'Опора №4 (Периметр)', x: 270, y: 550, heightM: 7.5, notes: 'Столб освещения и подвеса ВОЛС к проходной' }
  ],
  // Трассы с расчётом волокон и затухания
  routes: [
    {
      id: 'route-adm-prod1',
      name: 'Магистраль АБК → Цех №1',
      fromId: 'bld-adm',
      toId: 'bld-prod-1',
      waypoints: ['pt-manhole-1', 'pt-tray-1'],
      fiberType: 'SMF G.652D (1310/1550nm)',
      fibersCount: 16,
      attenuationPerKmDb: 0.35,
      spliceCount: 2,
      connectorCount: 4,
      measuredLossDb: 1.2,
      extraReserveM: 30, // запас на петли и разделку
      notes: 'Основной 10G линк ядра к распределению цеха №1'
    },
    {
      id: 'route-prod1-prod2',
      name: 'Линк Цех №1 → Цех №2',
      fromId: 'bld-prod-1',
      toId: 'bld-prod-2',
      waypoints: ['pt-fosc-1'],
      fiberType: 'SMF G.652D (1310/1550nm)',
      fibersCount: 8,
      attenuationPerKmDb: 0.35,
      spliceCount: 4,
      connectorCount: 4,
      measuredLossDb: 1.8,
      extraReserveM: 25,
      notes: 'Магистраль через муфту FOSC-A1'
    }
  ],
  // Точки Wi-Fi доступа на открытой территории и в цехах
  wifiAps: [
    {
      id: 'ap-campus-gate',
      name: 'AP-Outdoor-Проходная',
      model: 'UniFi AC Mesh Pro',
      freq: 'dual', // 2.4 / 5 GHz
      channel: '1 / 36',
      ip: '192.168.30.25',
      mac: '74:83:C2:AA:11:01',
      x: 270,
      y: 560,
      radiusM: 75,
      status: 'active',
      ssid: 'Zavod-Guest / Zavod-Tech',
      clientsCount: 8
    },
    {
      id: 'ap-campus-courtyard',
      name: 'AP-Outdoor-Двор (Цех 1-2)',
      model: 'UniFi Swiss Army Knife Ultra',
      freq: '5GHz',
      channel: '44',
      ip: '192.168.30.26',
      mac: '74:83:C2:AA:11:02',
      x: 440,
      y: 270,
      radiusM: 60,
      status: 'active',
      ssid: 'Zavod-Tech-5G',
      clientsCount: 14
    }
  ]
};

export class Storage {
  constructor() {
    this.ensureDataDir();
    this.telemetryMemory = {};
    this.saveTimer = null;
    this.data = this.load();
    this.cleanupExpiredSessions();

    const flushOnExit = () => {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.saveData(this.data);
      }
    };
    process.on('beforeExit', flushOnExit);
    process.on('SIGINT', () => { flushOnExit(); process.exit(0); });
    process.on('SIGTERM', () => { flushOnExit(); process.exit(0); });
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  load() {
    try {
      // Если файл в data/db.json еще не создан, но существует старый server/data/db.json — мигрируем
      if (!fs.existsSync(DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) {
        console.log(`[Storage] Перенос базы данных из ${LEGACY_DB_FILE} в ${DB_FILE}`);
        fs.copyFileSync(LEGACY_DB_FILE, DB_FILE);
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.switches && parsed.vlans) {
          if (!parsed.patchPanels || !Array.isArray(parsed.patchPanels)) {
            parsed.patchPanels = DEFAULT_PATCH_PANELS;
          }
          if (!parsed.ipam || !Array.isArray(parsed.ipam)) {
            parsed.ipam = DEFAULT_IP_ALLOCATIONS;
          }
          if (!parsed.floorPlans || !Array.isArray(parsed.floorPlans)) {
            parsed.floorPlans = DEFAULT_FLOOR_PLANS;
          }
          if (!parsed.notes || !Array.isArray(parsed.notes)) {
            parsed.notes = DEFAULT_NOTES;
          }
          if (!parsed.auditLog || !Array.isArray(parsed.auditLog)) {
            parsed.auditLog = DEFAULT_AUDIT_LOG;
          }
          if (!parsed.snapshots || !Array.isArray(parsed.snapshots)) {
            parsed.snapshots = DEFAULT_SNAPSHOTS;
          }
          if (!parsed.servers || !Array.isArray(parsed.servers)) {
            parsed.servers = DEFAULT_SERVERS;
          }
          if (!parsed.buildings || !Array.isArray(parsed.buildings)) {
            parsed.buildings = DEFAULT_BUILDINGS;
          }
          if (!parsed.campusInfrastructure || typeof parsed.campusInfrastructure !== 'object') {
            parsed.campusInfrastructure = DEFAULT_CAMPUS_INFRASTRUCTURE;
          }
          if (!parsed.configBackups || !Array.isArray(parsed.configBackups)) {
            parsed.configBackups = [];
          }
          if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
            parsed.users = DEFAULT_USERS;
          }
          if (!parsed.sessions || typeof parsed.sessions !== 'object') {
            parsed.sessions = {};
          }
          parsed.vlans.forEach(v => {
            const defaultV = DEFAULT_VLANS.find(dv => dv.id === v.id);
            if (defaultV) {
              if (!v.subnet && defaultV.subnet) v.subnet = defaultV.subnet;
              if (!v.gateway && defaultV.gateway) v.gateway = defaultV.gateway;
              if (!v.dhcpRange && defaultV.dhcpRange) v.dhcpRange = defaultV.dhcpRange;
              if (!v.dns && defaultV.dns) v.dns = defaultV.dns;
            }
          });
          return parsed;
        }
      }
    } catch (err) {
      console.error('Ошибка чтения db.json:', err.message);
    }

    const initial = {
      vlans: DEFAULT_VLANS,
      switches: DEFAULT_SWITCHES,
      patchPanels: DEFAULT_PATCH_PANELS,
      ipam: DEFAULT_IP_ALLOCATIONS,
      floorPlans: DEFAULT_FLOOR_PLANS,
      buildings: DEFAULT_BUILDINGS,
      campusInfrastructure: DEFAULT_CAMPUS_INFRASTRUCTURE,
      notes: DEFAULT_NOTES,
      auditLog: DEFAULT_AUDIT_LOG,
      snapshots: DEFAULT_SNAPSHOTS,
      servers: DEFAULT_SERVERS,
      users: DEFAULT_USERS,
      sessions: {}
    };
    this.saveData(initial);
    return initial;
  }

  saveData(data) {
    this.ensureDataDir();
    // Исключаем временную кольцевую телеметрию из постоянного JSON-файла базы данных
    const { telemetryHistory, ...cleanData } = data;
    const jsonStr = JSON.stringify(cleanData, null, 2);
    const tempFile = `${DB_FILE}.tmp`;

    fs.writeFileSync(tempFile, jsonStr, 'utf-8');

    // Безопасное атомарное переименование с защитой от EBUSY/EPERM на Windows
    let renamed = false;
    try {
      fs.renameSync(tempFile, DB_FILE);
      renamed = true;
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        try {
          fs.copyFileSync(tempFile, DB_FILE);
          try { fs.unlinkSync(tempFile); } catch {}
          renamed = true;
        } catch {}
      }
    }

    // Если renameSync так и не удался из-за блокировки сторонним процессом, fallback на прямую запись
    if (!renamed) {
      try {
        fs.writeFileSync(DB_FILE, jsonStr, 'utf-8');
        try { fs.unlinkSync(tempFile); } catch {}
      } catch (writeErr) {
        console.error('[Storage] Ошибка прямой записи базы данных:', writeErr.message);
      }
    }
  }

  save(immediate = false) {
    if (immediate) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.saveData(this.data);
      return;
    }

    if (this.saveTimer) return;

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveData(this.data);
    }, 150);
  }

  saveSync() {
    this.save(true);
  }

  getSwitches() {
    return this.data.switches;
  }

  getSwitchById(id) {
    return this.data.switches.find(s => s.id === id);
  }

  createSwitch(switchData) {
    const cleanIp = String(switchData.ip || '').trim();
    if (cleanIp) {
      const duplicate = this.data.switches.find(s => s.ip && s.ip.trim().toLowerCase() === cleanIp.toLowerCase());
      if (duplicate) {
        throw new Error(`Коммутатор с IP-адресом ${cleanIp} уже существует: ${duplicate.name}`);
      }
    }

    const copper = parseInt(switchData.copperPorts) || 24;
    const sfp = parseInt(switchData.sfpPorts) || 0;
    const vendor = switchData.vendor || 'MikroTik';
    
    const ports = switchData.ports && switchData.ports.length > 0 
      ? switchData.ports 
      : generatePortsForSwitch(vendor, copper, sfp);

    if (switchData.poe) {
      ports.forEach(p => {
        if (p.type === 'rj45') {
          p.poe = true;
        }
      });
    }

    const newSwitch = {
      id: switchData.id || `sw-${Date.now()}`,
      name: switchData.name || 'Новый коммутатор',
      vendor: vendor,
      model: switchData.model || `${copper}P Switch`,
      badge: switchData.badge || '', // Пользовательский шильдик (напр. "CORE-01", "SW-PROD-24", "СВЯЗЬ")
      color: switchData.color || '#3b82f6', // Цвет акцента шильдика
      portLayout: switchData.portLayout || '2-rows', // '2-rows' (стандарт 2 ряда шахматка) | '1-row' (1 ряд) | 'blocks-4' (блоки по 4) | 'blocks-8' (блоки по 8)
      portsPerGroup: parseInt(switchData.portsPerGroup) || 8, // Размер блока портов
      sfpPosition: switchData.sfpPosition || 'right', // 'right' | 'bottom' | 'separate'
      ip: switchData.ip || '',
      mac: switchData.mac || '',
      location: switchData.location || '',
      notes: switchData.notes || '',
      poe: switchData.poe !== undefined ? Boolean(switchData.poe) : false,
      poeBudget: switchData.poeBudget !== undefined ? Number(switchData.poeBudget) : 0,
      snmpEnabled: switchData.snmpEnabled !== undefined ? Boolean(switchData.snmpEnabled) : true,
      snmpMode: switchData.snmpMode || 'auto',
      snmpCommunity: switchData.snmpCommunity || 'public',
      snmpPort: parseInt(switchData.snmpPort) || 161,
      snmpVersion: switchData.snmpVersion || '2c',
      copperPorts: copper,
      sfpPorts: sfp,
      ports: ports,
      updatedAt: new Date().toISOString()
    };

    this.data.switches.push(newSwitch);
    this.save();
    return newSwitch;
  }

  updateSwitch(id, updateData) {
    const idx = this.data.switches.findIndex(s => s.id === id);
    if (idx === -1) return null;

    if (updateData.ip) {
      const cleanIp = String(updateData.ip).trim();
      const duplicate = this.data.switches.find(s => s.id !== id && s.ip && s.ip.trim().toLowerCase() === cleanIp.toLowerCase());
      if (duplicate) {
        throw new Error(`Коммутатор с IP-адресом ${cleanIp} уже существует: ${duplicate.name}`);
      }
    }

    this.data.switches[idx] = {
      ...this.data.switches[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return this.data.switches[idx];
  }

  deleteSwitch(id) {
    const idx = this.data.switches.findIndex(s => s.id === id);
    if (idx === -1) return false;

    this.data.switches.forEach(sw => {
      sw.ports.forEach(p => {
        if (p.linkedSwitchId === id) {
          p.linkedSwitchId = null;
          p.linkedPortId = null;
        }
      });
    });

    // Also clear references in patch panels
    if (this.data.patchPanels) {
      this.data.patchPanels.forEach(pp => {
        pp.ports.forEach(p => {
          if (p.connectedSwitchId === id) {
            p.connectedSwitchId = null;
            p.connectedSwitchPortId = null;
            p.status = 'free';
          }
        });
      });
    }

    this.data.switches.splice(idx, 1);
    this.save();
    return true;
  }

  updatePort(switchId, portId, portUpdate) {
    const sw = this.getSwitchById(switchId);
    if (!sw) return null;

    const pIdx = sw.ports.findIndex(p => p.id === portId || p.number === portId);
    if (pIdx === -1) return null;

    const currentPort = sw.ports[pIdx];
    const oldLinkedSwitchId = currentPort.linkedSwitchId;
    const oldLinkedPortId = currentPort.linkedPortId;
    const oldPatchPanelId = currentPort.patchPanelId;
    const oldPatchPanelPortId = currentPort.patchPanelPortId;

    sw.ports[pIdx] = {
      ...currentPort,
      ...portUpdate
    };

    // Patch panel bi-directional syncing
    const newPatchPanelId = portUpdate.patchPanelId !== undefined ? portUpdate.patchPanelId : oldPatchPanelId;
    const newPatchPanelPortId = portUpdate.patchPanelPortId !== undefined ? portUpdate.patchPanelPortId : oldPatchPanelPortId;

    if (oldPatchPanelId && (oldPatchPanelId !== newPatchPanelId || oldPatchPanelPortId !== newPatchPanelPortId)) {
      const oldPP = this.getPatchPanelById(oldPatchPanelId);
      if (oldPP) {
        const oldP = oldPP.ports.find(p => p.id === oldPatchPanelPortId || p.number === oldPatchPanelPortId);
        if (oldP && oldP.connectedSwitchId === switchId) {
          oldP.connectedSwitchId = null;
          oldP.connectedSwitchPortId = null;
          oldP.status = 'free';
        }
      }
    }

    if (newPatchPanelId && newPatchPanelPortId) {
      const newPP = this.getPatchPanelById(newPatchPanelId);
      if (newPP) {
        const newP = newPP.ports.find(p => p.id === newPatchPanelPortId || p.number === newPatchPanelPortId);
        if (newP) {
          newP.connectedSwitchId = switchId;
          newP.connectedSwitchPortId = currentPort.id;
          newP.status = 'connected';
        }
      }
    }

    const newLinkedSwitchId = portUpdate.linkedSwitchId;
    const newLinkedPortId = portUpdate.linkedPortId;

    if (oldLinkedSwitchId && (oldLinkedSwitchId !== newLinkedSwitchId || oldLinkedPortId !== newLinkedPortId)) {
      const oldPeerSw = this.getSwitchById(oldLinkedSwitchId);
      if (oldPeerSw) {
        const oldPeerPort = oldPeerSw.ports.find(p => p.id === oldLinkedPortId || p.number === oldLinkedPortId);
        if (oldPeerPort && oldPeerPort.linkedSwitchId === switchId) {
          oldPeerPort.linkedSwitchId = null;
          oldPeerPort.linkedPortId = null;
        }
      }
    }

    if (newLinkedSwitchId && newLinkedPortId) {
      const newPeerSw = this.getSwitchById(newLinkedSwitchId);
      if (newPeerSw) {
        const newPeerPort = newPeerSw.ports.find(p => p.id === newLinkedPortId || p.number === newLinkedPortId);
        if (newPeerPort) {
          newPeerPort.linkedSwitchId = switchId;
          newPeerPort.linkedPortId = currentPort.id;
          newPeerPort.connectedTo = `${sw.name} (${currentPort.name || 'p' + currentPort.number})`;
        }
      }
    }

    sw.updatedAt = new Date().toISOString();
    this.save();
    return sw.ports[pIdx];
  }

  batchUpdatePorts(switchId, portIds, portUpdate) {
    const sw = this.getSwitchById(switchId);
    if (!sw) return null;

    sw.ports = sw.ports.map(p => {
      if (portIds.includes(p.id) || portIds.includes(p.number)) {
        return {
          ...p,
          ...portUpdate
        };
      }
      return p;
    });

    sw.updatedAt = new Date().toISOString();
    this.save();
    return sw;
  }

  getVlans() {
    return this.data.vlans;
  }

  createVlan(vlan) {
    const id = parseInt(vlan.id, 10);
    if (isNaN(id) || id < 1 || id > 4094) {
      throw new Error('Номер VLAN должен быть целым числом в диапазоне от 1 до 4094');
    }
    const existing = this.data.vlans.find(v => v.id === id);
    if (existing) {
      throw new Error(`VLAN ${id} уже существует`);
    }

    const newVlan = {
      id: id,
      name: vlan.name || `VLAN ${id}`,
      color: vlan.color || '#3b82f6',
      description: vlan.description || ''
    };

    this.data.vlans.push(newVlan);
    this.data.vlans.sort((a, b) => a.id - b.id);
    this.save();
    return newVlan;
  }

  updateVlan(id, updateData) {
    const targetId = parseInt(id, 10);
    const idx = this.data.vlans.findIndex(v => v.id === targetId);
    if (idx === -1) return null;

    this.data.vlans[idx] = {
      ...this.data.vlans[idx],
      ...updateData,
      id: targetId
    };
    this.save();
    return this.data.vlans[idx];
  }

  deleteVlan(id) {
    const targetId = parseInt(id, 10);
    if (targetId === 1) {
      throw new Error('Нельзя удалить системный VLAN 1 по умолчанию');
    }
    const idx = this.data.vlans.findIndex(v => v.id === targetId);
    if (idx === -1) return false;

    // Каскадная очистка: сбрасываем удаленный VLAN на портах всех коммутаторов
    if (Array.isArray(this.data.switches)) {
      this.data.switches.forEach(sw => {
        (sw.ports || []).forEach(p => {
          if (p.pvid === targetId) {
            p.pvid = 1;
          }
          if (Array.isArray(p.taggedVlans) && p.taggedVlans.includes(targetId)) {
            p.taggedVlans = p.taggedVlans.filter(v => v !== targetId);
          }
        });
      });
    }

    // Каскадная очистка: обновляем записи IPAM
    if (Array.isArray(this.data.ipam)) {
      this.data.ipam.forEach(entry => {
        if (entry.vlanId === targetId) {
          entry.vlanId = 1;
        }
      });
    }

    this.data.vlans.splice(idx, 1);
    this.save();
    return true;
  }

  // --- PATCH PANELS ---

  getPatchPanels() {
    if (!this.data.patchPanels) {
      this.data.patchPanels = DEFAULT_PATCH_PANELS;
      this.save();
    }
    return this.data.patchPanels;
  }

  getPatchPanelById(id) {
    return this.getPatchPanels().find(p => p.id === id);
  }

  createPatchPanel(panelData) {
    const count = parseInt(panelData.portCount) || 24;
    const ports = panelData.ports && panelData.ports.length > 0
      ? panelData.ports
      : generatePatchPanelPorts(count);

    const newPanel = {
      id: panelData.id || `pp-${Date.now()}`,
      name: panelData.name || 'Новая патч-панель',
      model: panelData.model || `19" ${count}xRJ45 Cat.6 UTP 1U`,
      location: panelData.location || '',
      notes: panelData.notes || '',
      portCount: count,
      ports: ports,
      updatedAt: new Date().toISOString()
    };

    if (!this.data.patchPanels) this.data.patchPanels = [];
    this.data.patchPanels.push(newPanel);
    this.save();
    return newPanel;
  }

  updatePatchPanel(id, updateData) {
    const panels = this.getPatchPanels();
    const idx = panels.findIndex(p => p.id === id);
    if (idx === -1) return null;

    panels[idx] = {
      ...panels[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return panels[idx];
  }

  deletePatchPanel(id) {
    const panels = this.getPatchPanels();
    const idx = panels.findIndex(p => p.id === id);
    if (idx === -1) return false;

    // Clear switch port patchPanelId references
    this.data.switches.forEach(sw => {
      sw.ports.forEach(p => {
        if (p.patchPanelId === id) {
          p.patchPanelId = null;
          p.patchPanelPortId = null;
        }
      });
    });

    panels.splice(idx, 1);
    this.save();
    return true;
  }

  updatePatchPanelPort(panelId, portId, portUpdate) {
    const panel = this.getPatchPanelById(panelId);
    if (!panel) return null;

    const pIdx = panel.ports.findIndex(p => p.id === portId || p.number === portId);
    if (pIdx === -1) return null;

    const currentPort = panel.ports[pIdx];
    const oldSwId = currentPort.connectedSwitchId;
    const oldSwPortId = currentPort.connectedSwitchPortId;

    panel.ports[pIdx] = {
      ...currentPort,
      ...portUpdate
    };

    const newSwId = portUpdate.connectedSwitchId !== undefined ? portUpdate.connectedSwitchId : oldSwId;
    const newSwPortId = portUpdate.connectedSwitchPortId !== undefined ? portUpdate.connectedSwitchPortId : oldSwPortId;

    // If switch link changed, unbind old switch port
    if (oldSwId && (oldSwId !== newSwId || oldSwPortId !== newSwPortId)) {
      const oldSw = this.getSwitchById(oldSwId);
      if (oldSw) {
        const oldP = oldSw.ports.find(p => p.id === oldSwPortId || p.number === oldSwPortId);
        if (oldP && oldP.patchPanelId === panelId) {
          oldP.patchPanelId = null;
          oldP.patchPanelPortId = null;
        }
      }
    }

    // Bind new switch port
    if (newSwId && newSwPortId) {
      const newSw = this.getSwitchById(newSwId);
      if (newSw) {
        const newP = newSw.ports.find(p => p.id === newSwPortId || p.number === newSwPortId);
        if (newP) {
          newP.patchPanelId = panelId;
          newP.patchPanelPortId = currentPort.id;
          const roomLabel = portUpdate.room || currentPort.room || '';
          const socketLabel = portUpdate.socket || currentPort.socket || '';
          newP.connectedTo = `${panel.name}:П${currentPort.number}${roomLabel ? ` → ${roomLabel} (${socketLabel})` : ''}`;
        }
      }
      panel.ports[pIdx].status = 'connected';
    } else if (newSwId === null) {
      panel.ports[pIdx].status = panel.ports[pIdx].status === 'connected' ? 'free' : panel.ports[pIdx].status;
    }

    panel.updatedAt = new Date().toISOString();
    this.save();
    return panel.ports[pIdx];
  }

  // --- IPAM (IP Address Management) ---

  getIpAllocations() {
    if (!this.data.ipam) {
      this.data.ipam = DEFAULT_IP_ALLOCATIONS;
      this.save();
    }
    return this.data.ipam;
  }

  getIpAllocationById(id) {
    return this.getIpAllocations().find(i => i.id === id);
  }

  createIpAllocation(ipData) {
    const ip = (ipData.ip || '').trim();
    if (!ip) throw new Error('IP-адрес обязателен для заполнения');

    const vlanId = parseInt(ipData.vlanId) || 1;
    const existing = this.getIpAllocations().find(i => i.ip === ip && i.vlanId === vlanId);
    if (existing) {
      throw new Error(`IP ${ip} уже занят в VLAN ${vlanId} (${existing.hostname || 'Без имени'})`);
    }

    const newAllocation = {
      ...ipData,
      id: ipData.id || `ip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ip: ip,
      vlanId: vlanId,
      hostname: (ipData.hostname || '').trim(),
      mac: (ipData.mac || '').trim().toUpperCase(),
      type: ipData.type || 'workstation',
      status: ipData.status || 'active',
      location: (ipData.location || '').trim(),
      connectedTo: (ipData.connectedTo || '').trim(),
      description: (ipData.description || '').trim(),
      updatedAt: new Date().toISOString()
    };

    if (!this.data.ipam) this.data.ipam = [];
    this.data.ipam.push(newAllocation);

    // Sort IP allocations logically by last octet
    this.data.ipam.sort((a, b) => {
      const aParts = a.ip.split('.').map(Number);
      const bParts = b.ip.split('.').map(Number);
      for (let i = 0; i < 4; i++) {
        if ((aParts[i] || 0) !== (bParts[i] || 0)) {
          return (aParts[i] || 0) - (bParts[i] || 0);
        }
      }
      return 0;
    });

    this.save();
    return newAllocation;
  }

  updateIpAllocation(id, updateData) {
    const allocations = this.getIpAllocations();
    const idx = allocations.findIndex(i => i.id === id);
    if (idx === -1) return null;

    allocations[idx] = {
      ...allocations[idx],
      ...updateData,
      mac: updateData.mac ? updateData.mac.trim().toUpperCase() : allocations[idx].mac,
      updatedAt: new Date().toISOString()
    };

    this.save();
    return allocations[idx];
  }

  deleteIpAllocation(id) {
    const allocations = this.getIpAllocations();
    const idx = allocations.findIndex(i => i.id === id);
    if (idx === -1) return false;

    allocations.splice(idx, 1);
    this.save();
    return true;
  }

  syncServersToIpam() {
    const servers = this.getServers();
    const allocations = this.getIpAllocations();
    let createdCount = 0;
    let updatedCount = 0;

    servers.forEach(srv => {
      // Sync Server Host IP
      if (srv.ip) {
        const existing = allocations.find(a => a.ip === srv.ip);
        if (existing) {
          existing.hostname = srv.name || srv.hostname || existing.hostname;
          if (srv.mac) existing.mac = srv.mac.toUpperCase();
          existing.type = 'server';
          existing.location = srv.location || existing.location;
          existing.description = `${srv.vendor} ${srv.model} (${srv.os})`;
          existing.serverId = srv.id;
          updatedCount++;
        } else {
          allocations.push({
            id: `ip-srv-${srv.id}`,
            ip: srv.ip,
            vlanId: 10,
            hostname: srv.name || srv.hostname,
            mac: (srv.mac || '').toUpperCase(),
            type: 'server',
            status: srv.status === 'online' ? 'active' : 'reserved',
            location: srv.location || 'Серверная',
            connectedTo: srv.location || '',
            description: `${srv.vendor} ${srv.model} (${srv.os})`,
            serverId: srv.id,
            updatedAt: new Date().toISOString()
          });
          createdCount++;
        }
      }

      // Sync Virtual Machines IPs
      (srv.vms || []).forEach(vm => {
        if (vm.ip) {
          const existing = allocations.find(a => a.ip === vm.ip);
          if (existing) {
            existing.hostname = vm.name || existing.hostname;
            if (vm.mac) existing.mac = vm.mac.toUpperCase();
            existing.vlanId = Number(vm.vlan) || existing.vlanId;
            existing.type = 'vm';
            existing.status = vm.status === 'running' ? 'active' : 'reserved';
            existing.location = srv.name;
            existing.connectedTo = `${srv.name}:${vm.bridge || 'vmbr0'}`;
            existing.description = `ВМ [${vm.vmid}] ${vm.role || ''} (${vm.os})`;
            existing.serverId = srv.id;
            existing.vmid = vm.vmid;
            updatedCount++;
          } else {
            allocations.push({
              id: `ip-vm-${srv.id}-${vm.vmid}`,
              ip: vm.ip,
              vlanId: Number(vm.vlan) || 100,
              hostname: vm.name,
              mac: (vm.mac || '').toUpperCase(),
              type: 'vm',
              status: vm.status === 'running' ? 'active' : 'reserved',
              location: srv.name,
              connectedTo: `${srv.name}:${vm.bridge || 'vmbr0'}`,
              description: `ВМ [${vm.vmid}] ${vm.role || ''} (${vm.os})`,
              serverId: srv.id,
              vmid: vm.vmid,
              updatedAt: new Date().toISOString()
            });
            createdCount++;
          }
        }
      });
    });

    // Sort IP allocations logically
    allocations.sort((a, b) => {
      const aParts = (a.ip || '').split('.').map(Number);
      const bParts = (b.ip || '').split('.').map(Number);
      for (let i = 0; i < 4; i++) {
        if ((aParts[i] || 0) !== (bParts[i] || 0)) {
          return (aParts[i] || 0) - (bParts[i] || 0);
        }
      }
      return 0;
    });

    this.logAction({
      entity: 'ipam',
      action: 'sync_servers',
      title: 'Синхронизация серверов и ВМ с IPAM',
      details: `Создано: ${createdCount}, обновлено: ${updatedCount} записей`
    });

    this.save();
    return { createdCount, updatedCount, total: allocations.length };
  }

  // --- FLOOR PLANS ---

  getFloorPlans() {
    if (!this.data.floorPlans) {
      this.data.floorPlans = DEFAULT_FLOOR_PLANS;
      this.save();
    }
    return this.data.floorPlans;
  }

  getFloorPlanById(id) {
    return this.getFloorPlans().find(f => f.id === id);
  }

  createFloorPlan(planData) {
    const plans = this.getFloorPlans();
    const newPlan = {
      id: planData.id || `floor-${Date.now()}`,
      name: (planData.name || 'Новый этаж').trim(),
      level: planData.level || plans.length + 1,
      crossCabinet: (planData.crossCabinet || 'Шкаф ШТВ-1').trim(),
      patchPanelId: planData.patchPanelId || null,
      serverRoomPos: planData.serverRoomPos || { x: 500, y: 500, label: 'Серверная' },
      backgroundImage: planData.backgroundImage || null,
      width: planData.width || 960,
      height: planData.height || 640,
      scaleMeters: planData.scaleMeters || 30, // 30 meters wide
      rooms: planData.rooms || [],
      outlets: planData.outlets || [],
      updatedAt: new Date().toISOString()
    };
    plans.push(newPlan);
    this.save();
    return newPlan;
  }

  updateFloorPlan(id, updateData) {
    const plans = this.getFloorPlans();
    const idx = plans.findIndex(f => f.id === id);
    if (idx === -1) return null;

    plans[idx] = {
      ...plans[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return plans[idx];
  }

  deleteFloorPlan(id) {
    const plans = this.getFloorPlans();
    const idx = plans.findIndex(f => f.id === id);
    if (idx === -1) return false;
    plans.splice(idx, 1);
    this.save();
    return true;
  }

  // --- FACTORY BUILDINGS & CAMPUS MAP ---

  getBuildings() {
    if (!this.data.buildings) {
      this.data.buildings = DEFAULT_BUILDINGS;
      this.save();
    }
    return this.data.buildings;
  }

  getBuildingById(id) {
    return this.getBuildings().find(b => b.id === id);
  }

  createBuilding(buildingData) {
    const buildings = this.getBuildings();
    const newBuilding = {
      id: buildingData.id || `bld-${Date.now()}`,
      name: (buildingData.name || 'Новое здание').trim(),
      code: (buildingData.code || '').trim(),
      type: buildingData.type || 'production',
      description: (buildingData.description || '').trim(),
      floorsCount: parseInt(buildingData.floorsCount, 10) || 1,
      x: buildingData.x !== undefined ? buildingData.x : 200 + (buildings.length % 3) * 260,
      y: buildingData.y !== undefined ? buildingData.y : 150 + Math.floor(buildings.length / 3) * 220,
      width: buildingData.width || 240,
      height: buildingData.height || 160,
      color: buildingData.color || '#3b82f6',
      address: (buildingData.address || '').trim(),
      networkRole: (buildingData.networkRole || '').trim(),
      uplinkTo: buildingData.uplinkTo || null,
      cableType: buildingData.cableType || 'Оптика ВОЛС 10G',
      switches: Array.isArray(buildingData.switches) ? buildingData.switches : [],
      patchPanels: Array.isArray(buildingData.patchPanels) ? buildingData.patchPanels : [],
      updatedAt: new Date().toISOString()
    };
    buildings.push(newBuilding);
    this.save();
    return newBuilding;
  }

  updateBuilding(id, updateData) {
    const buildings = this.getBuildings();
    const idx = buildings.findIndex(b => b.id === id);
    if (idx === -1) return null;

    buildings[idx] = {
      ...buildings[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return buildings[idx];
  }

  deleteBuilding(id) {
    const buildings = this.getBuildings();
    const idx = buildings.findIndex(b => b.id === id);
    if (idx === -1) return false;
    buildings.splice(idx, 1);
    this.save();
    return true;
  }

  // --- CAMPUS INFRASTRUCTURE (КОЛОДЦЫ, ЭСТАКАДЫ, МУФТЫ, ТРАССЫ ВОЛС, WI-FI) ---

  getCampusInfrastructure() {
    if (!this.data.campusInfrastructure) {
      this.data.campusInfrastructure = DEFAULT_CAMPUS_INFRASTRUCTURE;
      this.save();
    }
    return this.data.campusInfrastructure;
  }

  updateCampusInfrastructure(updateData) {
    const current = this.getCampusInfrastructure();
    this.data.campusInfrastructure = {
      ...current,
      ...updateData
    };
    this.save();
    return this.data.campusInfrastructure;
  }

  // --- NOTES (ИНЖЕНЕРНЫЙ БЛОКНОТ) ---

  getNotes() {
    if (!this.data.notes) {
      this.data.notes = DEFAULT_NOTES;
      this.save();
    }
    return this.data.notes;
  }

  getNoteById(id) {
    return this.getNotes().find(n => n.id === id);
  }

  createNote(noteData) {
    const newNote = {
      id: noteData.id || `note-${Date.now()}`,
      title: (noteData.title || 'Новая заметка').trim(),
      category: noteData.category || 'Общее',
      color: noteData.color || '#3b82f6',
      pinned: Boolean(noteData.pinned),
      content: noteData.content || '',
      updatedAt: new Date().toISOString()
    };

    if (!this.data.notes) this.data.notes = [];
    this.data.notes.unshift(newNote);
    this.save();
    return newNote;
  }

  updateNote(id, updateData) {
    const notes = this.getNotes();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return null;

    notes[idx] = {
      ...notes[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.save();
    return notes[idx];
  }

  deleteNote(id) {
    const notes = this.getNotes();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return false;

    notes.splice(idx, 1);
    this.save();
    return true;
  }

  // --- AUDIT LOG (ЖУРНАЛ ИЗМЕНЕНИЙ) ---

  getAuditLog() {
    if (!this.data.auditLog) {
      this.data.auditLog = DEFAULT_AUDIT_LOG;
      this.save();
    }
    return this.data.auditLog;
  }

  logAction(entry) {
    if (!this.data.auditLog) this.data.auditLog = [];
    const newLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      entity: entry.entity || 'general',
      action: entry.action || 'update',
      title: entry.title || 'Изменение конфигурации',
      details: entry.details || '',
      author: entry.author || 'admin'
    };
    this.data.auditLog.unshift(newLog);
    // Keep last 500 records
    if (this.data.auditLog.length > 500) {
      this.data.auditLog = this.data.auditLog.slice(0, 500);
    }
    this.save();
    return newLog;
  }

  clearAuditLog() {
    this.data.auditLog = [];
    this.save();
    return true;
  }

  // --- REAL-TIME TELEMETRY HISTORY & NETWORK ALERTS ---

  getTelemetryHistory(switchId, portNumber) {
    if (!this.telemetryMemory) this.telemetryMemory = {};
    const swHistory = this.telemetryMemory[switchId] || {};
    if (portNumber !== undefined && portNumber !== null) {
      return swHistory[portNumber] || [];
    }
    return swHistory;
  }

  recordTelemetrySample(switchId, portNumber, sample) {
    if (!this.telemetryMemory) this.telemetryMemory = {};
    if (!this.telemetryMemory[switchId]) this.telemetryMemory[switchId] = {};
    if (!this.telemetryMemory[switchId][portNumber]) {
      this.telemetryMemory[switchId][portNumber] = [];
    }
    const series = this.telemetryMemory[switchId][portNumber];
    series.push({
      time: sample.time || new Date().toISOString(),
      rxMbps: Number(sample.rxMbps || 0),
      txMbps: Number(sample.txMbps || 0),
      inErrors: Number(sample.inErrors || 0),
      status: sample.status || 'up'
    });
    // Храним в оперативной памяти последние 60 точек для плавных графиков нагрузки
    if (series.length > 60) {
      this.telemetryMemory[switchId][portNumber] = series.slice(series.length - 60);
    }
  }

  cleanupExpiredSessions(maxAgeMs = 7 * 24 * 3600 * 1000) {
    if (!this.data || !this.data.sessions || typeof this.data.sessions !== 'object') return;
    const now = Date.now();
    let changed = false;
    for (const [token, sess] of Object.entries(this.data.sessions)) {
      const lastUsed = new Date(sess.lastUsed || sess.createdAt || 0).getTime();
      if (now - lastUsed > maxAgeMs) {
        delete this.data.sessions[token];
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  getAlerts(limit = 100) {
    if (!this.data.networkAlerts) this.data.networkAlerts = [];
    return this.data.networkAlerts.slice(0, limit);
  }

  addAlert(alertData) {
    if (!this.data.networkAlerts) this.data.networkAlerts = [];
    const newAlert = {
      id: alertData.id || `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: alertData.timestamp || new Date().toISOString(),
      level: alertData.level || 'warning', // 'info' | 'warning' | 'critical'
      type: alertData.type || 'link_down', // 'link_down' | 'link_up' | 'high_crc' | 'poe_overload' | 'high_traffic'
      switchId: alertData.switchId || null,
      switchName: alertData.switchName || 'Коммутатор',
      portId: alertData.portId || null,
      portNumber: alertData.portNumber || null,
      portName: alertData.portName || '',
      title: alertData.title || 'Сетевое событие',
      message: alertData.message || '',
      acknowledged: false
    };
    this.data.networkAlerts.unshift(newAlert);
    if (this.data.networkAlerts.length > 250) {
      this.data.networkAlerts = this.data.networkAlerts.slice(0, 250);
    }
    this.save();
    return newAlert;
  }

  acknowledgeAlert(alertId) {
    if (!this.data.networkAlerts) return false;
    const item = this.data.networkAlerts.find(a => a.id === alertId);
    if (item) {
      item.acknowledged = true;
      this.save();
      return true;
    }
    return false;
  }

  clearAlerts() {
    this.data.networkAlerts = [];
    this.save();
    return true;
  }

  getNotificationSettings() {
    return this.data.notificationSettings || {
      telegramEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      webhookEnabled: false,
      webhookUrl: '',
      syslogEnabled: false,
      syslogHost: '',
      syslogPort: 514,
      alertOnSwitchDown: true,
      alertOnLinkDown: true,
      alertOnHighCrc: true,
      alertOnHighTraffic: true,
      trafficThresholdMbps: 850
    };
  }

  updateNotificationSettings(settings) {
    this.data.notificationSettings = {
      ...this.getNotificationSettings(),
      ...settings
    };
    this.save();
    return this.data.notificationSettings;
  }

  // --- ACTIVE DIRECTORY INTEGRATION (СИНХРОНИЗАЦИЯ AD / LDAP) ---

  getAdSettings() {
    return this.data.adSettings || {
      enabled: false,
      server: '',
      port: 389,
      useTls: false,
      baseDn: '',
      searchBase: '',
      bindDn: '',
      password: '',
      dnsServer: '',
      autoSyncEnabled: false,
      syncIntervalHours: 6,
      filterInactiveDays: 90,
      targetVlanId: null,
      lastSync: null,
      lastStatus: null,
      lastCount: 0,
      lastCreated: 0,
      lastUpdated: 0,
      lastError: null
    };
  }

  updateAdSettings(settings) {
    this.data.adSettings = {
      ...this.getAdSettings(),
      ...settings
    };
    this.save();
    return this.data.adSettings;
  }

  // --- SERVERS & HYPERVISORS (СЕРВЕРЫ И ВИРТУАЛИЗАЦИЯ) ---

  getServers() {
    if (!this.data.servers) {
      this.data.servers = DEFAULT_SERVERS;
      this.save();
    }
    return this.data.servers;
  }

  getServerById(id) {
    return this.getServers().find(s => s.id === id);
  }

  syncServerSwitchPorts(server, previousServer = null) {
    if (!this.data.switches) return;

    // 1. Unbind removed or modified NIC ports from previousServer
    if (previousServer && Array.isArray(previousServer.nics)) {
      previousServer.nics.forEach(oldNic => {
        if (!oldNic.connectedSwitchId || !oldNic.connectedPortId) return;
        const currentNic = (server?.nics || []).find(n => n.id === oldNic.id);
        const isChanged = !currentNic ||
          currentNic.connectedSwitchId !== oldNic.connectedSwitchId ||
          currentNic.connectedPortId !== oldNic.connectedPortId;

        if (isChanged) {
          const sw = this.getSwitchById(oldNic.connectedSwitchId);
          if (sw && sw.ports) {
            const p = sw.ports.find(prt => prt.id === oldNic.connectedPortId || prt.number === oldNic.connectedPortId || prt.name === oldNic.connectedPortId);
            if (p && (p.serverId === previousServer.id || p.connectedTo?.includes(previousServer.name))) {
              p.connectedTo = '';
              p.serverId = null;
              p.serverNicId = null;
            }
          }
        }
      });
    }

    // 2. Bind current server NIC ports
    if (server && Array.isArray(server.nics)) {
      server.nics.forEach(nic => {
        if (!nic.connectedSwitchId || !nic.connectedPortId) return;
        const sw = this.getSwitchById(nic.connectedSwitchId);
        if (sw && sw.ports) {
          const p = sw.ports.find(prt => prt.id === nic.connectedPortId || prt.number === nic.connectedPortId || prt.name === nic.connectedPortId);
          if (p) {
            p.serverId = server.id;
            p.serverNicId = nic.id;
            p.connectedTo = `${server.name}:${nic.name}${nic.role ? ` (${nic.role})` : ''}`;
            p.status = 'connected';
          }
        }
      });
    }
  }

  createServer(serverData) {
    const servers = this.getServers();
    const newServer = {
      id: serverData.id || `srv-${Date.now()}`,
      name: (serverData.name || 'Новый сервер').trim(),
      hostname: (serverData.hostname || '').trim(),
      vendor: (serverData.vendor || 'Dell').trim(),
      model: (serverData.model || '').trim(),
      type: serverData.type || 'hypervisor',
      os: (serverData.os || 'Linux').trim(),
      ip: (serverData.ip || '').trim(),
      mac: (serverData.mac || '').trim(),
      location: (serverData.location || 'Серверная 1, Стойка 1').trim(),
      unit: Number(serverData.unit) || 1,
      unitHeight: Number(serverData.unitHeight) || 2,
      status: serverData.status || 'online',
      cpu: (serverData.cpu || '').trim(),
      ram: (serverData.ram || '').trim(),
      storage: (serverData.storage || '').trim(),
      notes: (serverData.notes || '').trim(),
      nics: Array.isArray(serverData.nics) ? serverData.nics : [],
      bridges: Array.isArray(serverData.bridges) ? serverData.bridges : [],
      vms: Array.isArray(serverData.vms) ? serverData.vms : [],
      updatedAt: new Date().toISOString()
    };
    servers.push(newServer);
    this.syncServerSwitchPorts(newServer);
    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'create',
      title: `Добавлен сервер: "${newServer.name}" (${newServer.model || newServer.os})`,
      details: `IP: ${newServer.ip || '—'}, Unit: ${newServer.unit}U (${newServer.unitHeight}U)`
    });
    this.save();
    return newServer;
  }

  updateServer(id, updateData) {
    const servers = this.getServers();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return null;

    const previousServer = JSON.parse(JSON.stringify(servers[idx]));
    servers[idx] = {
      ...servers[idx],
      ...updateData,
      unit: updateData.unit !== undefined ? Number(updateData.unit) : servers[idx].unit,
      unitHeight: updateData.unitHeight !== undefined ? Number(updateData.unitHeight) : servers[idx].unitHeight,
      updatedAt: new Date().toISOString()
    };
    this.syncServerSwitchPorts(servers[idx], previousServer);
    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'update',
      title: `Обновлен сервер: "${servers[idx].name}"`,
      details: `Изменены параметры сервера ${servers[idx].hostname || id}`
    });
    this.save();
    return servers[idx];
  }

  deleteServer(id) {
    const servers = this.getServers();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return false;
    const deleted = servers.splice(idx, 1)[0];

    // Clear switch port connections
    if (this.data.switches) {
      this.data.switches.forEach(sw => {
        (sw.ports || []).forEach(p => {
          if (p.serverId === id) {
            p.connectedTo = '';
            p.serverId = null;
            p.serverNicId = null;
          }
        });
      });
    }

    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'delete',
      title: `Удален сервер: "${deleted.name}"`,
      details: `Узел ${deleted.hostname || id} удален из учета`
    });
    this.save();
    return true;
  }

  addVm(serverId, vmData) {
    const server = this.getServerById(serverId);
    if (!server) return null;
    if (!server.vms) server.vms = [];

    const newVm = {
      vmid: Number(vmData.vmid) || Math.floor(100 + Math.random() * 900),
      name: (vmData.name || 'Новая ВМ').trim(),
      os: (vmData.os || 'Linux').trim(),
      ip: (vmData.ip || '').trim(),
      mac: (vmData.mac || '').trim(),
      vlan: Number(vmData.vlan) || 1,
      bridge: (vmData.bridge || 'vmbr0').trim(),
      cores: Number(vmData.cores) || 2,
      ram: (vmData.ram || '4 GB').trim(),
      disk: (vmData.disk || '40 GB').trim(),
      status: vmData.status || 'running',
      role: (vmData.role || '').trim()
    };

    server.vms.push(newVm);
    server.updatedAt = new Date().toISOString();
    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'create_vm',
      title: `Создана ВМ [${newVm.vmid}] "${newVm.name}" на узле "${server.name}"`,
      details: `VLAN: ${newVm.vlan}, IP: ${newVm.ip || '—'}, Bridge: ${newVm.bridge}`
    });
    this.save();
    return newVm;
  }

  updateVm(serverId, vmid, updateData) {
    const server = this.getServerById(serverId);
    if (!server || !server.vms) return null;
    const idx = server.vms.findIndex(v => String(v.vmid) === String(vmid));
    if (idx === -1) return null;

    server.vms[idx] = {
      ...server.vms[idx],
      ...updateData,
      vmid: Number(updateData.vmid || server.vms[idx].vmid)
    };
    server.updatedAt = new Date().toISOString();
    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'update_vm',
      title: `Обновлена ВМ [${server.vms[idx].vmid}] "${server.vms[idx].name}"`,
      details: `Узел: "${server.name}", VLAN: ${server.vms[idx].vlan}`
    });
    this.save();
    return server.vms[idx];
  }

  deleteVm(serverId, vmid) {
    const server = this.getServerById(serverId);
    if (!server || !server.vms) return false;
    const idx = server.vms.findIndex(v => String(v.vmid) === String(vmid));
    if (idx === -1) return false;
    const deleted = server.vms.splice(idx, 1)[0];
    server.updatedAt = new Date().toISOString();
    this.syncServersToIpam();
    this.logAction({
      entity: 'servers',
      action: 'delete_vm',
      title: `Удалена ВМ [${deleted.vmid}] "${deleted.name}" с узла "${server.name}"`
    });
    this.save();
    return true;
  }

  // --- CONFIG SNAPSHOTS (СНИМКИ КОНФИГУРАЦИИ И ВЕРСИОНИРОВАНИЕ) ---

  getSnapshots() {
    if (!this.data.snapshots) {
      this.data.snapshots = DEFAULT_SNAPSHOTS;
      this.save();
    }
    return this.data.snapshots;
  }

  createSnapshot(meta = {}) {
    if (!this.data.snapshots) this.data.snapshots = [];

    const switches = this.data.switches || [];
    const vlans = this.data.vlans || [];
    const patchPanels = this.data.patchPanels || [];
    const ipam = this.data.ipam || [];

    const totalPorts = switches.reduce((acc, s) => acc + (s.ports || []).length, 0);

    const snapshot = {
      id: `snap-${Date.now()}`,
      name: (meta.name || `Снимок конфигурации ${new Date().toLocaleDateString()}`).trim(),
      description: (meta.description || 'Ручное сохранение контрольной точки конфигурации').trim(),
      timestamp: new Date().toISOString(),
      author: meta.author || 'admin',
      stats: {
        switchesCount: switches.length,
        portsCount: totalPorts,
        vlansCount: vlans.length,
        patchPanelsCount: patchPanels.length,
        ipamCount: ipam.length,
        serversCount: (this.data.servers || []).length
      },
      data: {
        switches: JSON.parse(JSON.stringify(switches)),
        vlans: JSON.parse(JSON.stringify(vlans)),
        patchPanels: JSON.parse(JSON.stringify(patchPanels)),
        ipam: JSON.parse(JSON.stringify(ipam)),
        servers: JSON.parse(JSON.stringify(this.data.servers || []))
      }
    };

    this.data.snapshots.unshift(snapshot);
    this.logAction({
      entity: 'snapshots',
      action: 'create',
      title: `Создан снимок конфигурации: "${snapshot.name}"`,
      details: `Сохранено ${switches.length} коммутаторов, ${totalPorts} портов, ${vlans.length} VLAN, ${(this.data.servers || []).length} серверов.`
    });

    this.save();
    return snapshot;
  }

  deleteSnapshot(id) {
    const snaps = this.getSnapshots();
    const idx = snaps.findIndex(s => s.id === id);
    if (idx === -1) return false;
    const deleted = snaps.splice(idx, 1)[0];
    this.logAction({
      entity: 'snapshots',
      action: 'delete',
      title: `Удален снимок конфигурации: "${deleted.name}"`
    });
    this.save();
    return true;
  }

  restoreSnapshot(id) {
    const snap = this.getSnapshots().find(s => s.id === id);
    if (!snap || !snap.data) throw new Error('Снимок конфигурации не найден или поврежден');

    this.data.switches = JSON.parse(JSON.stringify(snap.data.switches || []));
    this.data.vlans = JSON.parse(JSON.stringify(snap.data.vlans || []));
    this.data.patchPanels = JSON.parse(JSON.stringify(snap.data.patchPanels || []));
    if (snap.data.ipam) this.data.ipam = JSON.parse(JSON.stringify(snap.data.ipam));
    if (snap.data.servers) this.data.servers = JSON.parse(JSON.stringify(snap.data.servers));

    this.logAction({
      entity: 'snapshots',
      action: 'restore',
      title: `Откат к снимку: "${snap.name}"`,
      details: `Восстановлено состояние от ${new Date(snap.timestamp).toLocaleString()}`
    });

    this.save();
    return { success: true, snapshot: snap };
  }

  compareSnapshot(id) {
    const snap = this.getSnapshots().find(s => s.id === id);
    if (!snap) throw new Error('Снимок не найден');

    const snapSwitches = snap.data?.switches || [];
    const currentSwitches = this.data.switches || [];
    const snapVlans = snap.data?.vlans || [];
    const currentVlans = this.data.vlans || [];

    const diff = {
      switches: [],
      vlans: [],
      totalChanges: 0
    };

    // Compare switches and ports
    currentSwitches.forEach(currSw => {
      const snapSw = snapSwitches.find(s => s.id === currSw.id);
      if (!snapSw) {
        diff.switches.push({ type: 'added', switchName: currSw.name, switchId: currSw.id });
        diff.totalChanges++;
      } else {
        const changedPorts = [];
        (currSw.ports || []).forEach(currP => {
          const snapP = (snapSw.ports || []).find(p => p.id === currP.id || p.number === currP.number);
          if (snapP) {
            const isVlanChanged = currP.pvid !== snapP.pvid;
            const isModeChanged = currP.mode !== snapP.mode;
            const isConnChanged = currP.connectedTo !== snapP.connectedTo;
            if (isVlanChanged || isModeChanged || isConnChanged) {
              changedPorts.push({
                portName: currP.name || `Port ${currP.number}`,
                before: { pvid: snapP.pvid, mode: snapP.mode, connectedTo: snapP.connectedTo },
                after: { pvid: currP.pvid, mode: currP.mode, connectedTo: currP.connectedTo }
              });
              diff.totalChanges++;
            }
          }
        });
        if (changedPorts.length > 0) {
          diff.switches.push({ type: 'modified', switchName: currSw.name, switchId: currSw.id, changedPorts });
        }
      }
    });

    // Compare VLANs
    currentVlans.forEach(currV => {
      const snapV = snapVlans.find(v => v.id === currV.id);
      if (!snapV) {
        diff.vlans.push({ type: 'added', vlanId: currV.id, name: currV.name });
        diff.totalChanges++;
      }
    });

    snapVlans.forEach(snapV => {
      const currV = currentVlans.find(v => v.id === snapV.id);
      if (!currV) {
        diff.vlans.push({ type: 'removed', vlanId: snapV.id, name: snapV.name });
        diff.totalChanges++;
      }
    });

    return {
      snapshot: { id: snap.id, name: snap.name, timestamp: snap.timestamp, author: snap.author },
      diff
    };
  }

  // --- CONFIG BACKUPS ---
  getBackups(switchId) {
    if (!this.data.configBackups) {
      this.data.configBackups = [];
    }
    if (switchId) {
      return this.data.configBackups
        .filter(b => b.switchId === switchId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    return [...this.data.configBackups].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getBackupById(id) {
    if (!this.data.configBackups) return null;
    return this.data.configBackups.find(b => b.id === id) || null;
  }

  addBackup(backup) {
    if (!this.data.configBackups) {
      this.data.configBackups = [];
    }
    const newBackup = {
      id: backup.id || `backup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      switchId: backup.switchId,
      timestamp: backup.timestamp || new Date().toISOString(),
      author: backup.author || 'SSH Auto-Backup',
      trigger: backup.trigger || 'manual', // 'manual' | 'ssh' | 'upload'
      linesCount: backup.linesCount || (backup.content ? backup.content.split('\n').length : 0),
      sizeBytes: backup.sizeBytes || (backup.content ? Buffer.byteLength(backup.content, 'utf8') : 0),
      hash: backup.hash || (backup.content ? crypto.createHash('sha256').update(backup.content).digest('hex') : ''),
      comment: backup.comment || '',
      content: backup.content || ''
    };
    this.data.configBackups.push(newBackup);
    this.save();
    return newBackup;
  }

  deleteBackup(id) {
    if (!this.data.configBackups) return false;
    const initial = this.data.configBackups.length;
    this.data.configBackups = this.data.configBackups.filter(b => b.id !== id);
    if (this.data.configBackups.length !== initial) {
      this.save();
      return true;
    }
    return false;
  }

  getAll() {
    return this.data;
  }

  importAll(newData) {
    if (!newData || !Array.isArray(newData.switches) || !Array.isArray(newData.vlans)) {
      throw new Error('Некорректный формат файла резервной копии');
    }
    if (!newData.patchPanels || !Array.isArray(newData.patchPanels)) {
      newData.patchPanels = DEFAULT_PATCH_PANELS;
    }
    if (!newData.ipam || !Array.isArray(newData.ipam)) {
      newData.ipam = DEFAULT_IP_ALLOCATIONS;
    }
    if (!newData.floorPlans || !Array.isArray(newData.floorPlans)) {
      newData.floorPlans = DEFAULT_FLOOR_PLANS;
    }
    if (!newData.notes || !Array.isArray(newData.notes)) {
      newData.notes = DEFAULT_NOTES;
    }
    if (!newData.auditLog || !Array.isArray(newData.auditLog)) {
      newData.auditLog = DEFAULT_AUDIT_LOG;
    }
    if (!newData.snapshots || !Array.isArray(newData.snapshots)) {
      newData.snapshots = DEFAULT_SNAPSHOTS;
    }
    if (!newData.servers || !Array.isArray(newData.servers)) {
      newData.servers = DEFAULT_SERVERS;
    }
    if (!newData.configBackups || !Array.isArray(newData.configBackups)) {
      newData.configBackups = [];
    }
    if (!newData.users || !Array.isArray(newData.users) || newData.users.length === 0) {
      newData.users = this.data.users || DEFAULT_USERS;
    }
    if (!newData.sessions || typeof newData.sessions !== 'object') {
      newData.sessions = this.data.sessions || {};
    }
    this.data = newData;
    this.save();
    return this.data;
  }

  // ==================== User & Session Management (RBAC) ====================

  getUsers(includeSecrets = false) {
    if (!Array.isArray(this.data.users)) {
      this.data.users = DEFAULT_USERS;
      this.save();
    }
    return this.data.users.map(u => {
      if (includeSecrets) return { ...u };
      const { passwordHash, salt, ...safeUser } = u;
      return safeUser;
    });
  }

  getUserById(id, includeSecrets = false) {
    const user = (this.data.users || []).find(u => u.id === id);
    if (!user) return null;
    if (includeSecrets) return { ...user };
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  getUserByUsername(username, includeSecrets = false) {
    if (!username) return null;
    const lower = username.trim().toLowerCase();
    const user = (this.data.users || []).find(u => u.username && u.username.toLowerCase() === lower);
    if (!user) return null;
    if (includeSecrets) return { ...user };
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  authenticateUser(username, password) {
    if (!username || !password) return null;
    const user = this.getUserByUsername(username, true);
    if (!user || user.active === false) return null;

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) return null;

    user.lastLogin = new Date().toISOString();
    this.save();

    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  createUser({ username, password, role = 'viewer', name = '', email = '' }) {
    if (!username || !password) {
      throw new Error('Имя пользователя и пароль обязательны');
    }
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      throw new Error('Имя пользователя должно содержать не менее 3 символов');
    }
    if (password.length < 4) {
      throw new Error('Пароль должен содержать не менее 4 символов');
    }
    if (this.getUserByUsername(cleanUsername)) {
      throw new Error(`Пользователь с логином "${cleanUsername}" уже существует`);
    }

    const validRoles = ['admin', 'engineer', 'viewer'];
    const assignedRole = validRoles.includes(role) ? role : 'viewer';

    const { hash, salt } = hashPassword(password);
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      username: cleanUsername,
      passwordHash: hash,
      salt: salt,
      role: assignedRole,
      name: name.trim() || cleanUsername,
      email: email.trim(),
      active: true,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    if (!Array.isArray(this.data.users)) this.data.users = [];
    this.data.users.push(newUser);
    this.save();

    const { passwordHash: _, salt: __, ...safeUser } = newUser;
    return safeUser;
  }

  updateUser(id, updates = {}) {
    const user = (this.data.users || []).find(u => u.id === id);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    // Защита от потери последнего активного администратора
    if (user.role === 'admin' && (updates.role && updates.role !== 'admin' || updates.active === false)) {
      const activeAdmins = (this.data.users || []).filter(u => u.id !== id && u.role === 'admin' && u.active !== false);
      if (activeAdmins.length === 0) {
        throw new Error('Нельзя деактивировать или изменить роль последнего активного администратора');
      }
    }

    if (updates.name !== undefined) user.name = updates.name.trim();
    if (updates.email !== undefined) user.email = updates.email.trim();
    if (updates.role !== undefined) {
      const validRoles = ['admin', 'engineer', 'viewer'];
      if (validRoles.includes(updates.role)) {
        user.role = updates.role;
      }
    }
    if (updates.active !== undefined) {
      user.active = Boolean(updates.active);
    }
    if (updates.password && typeof updates.password === 'string' && updates.password.length >= 4) {
      const { hash, salt } = hashPassword(updates.password);
      user.passwordHash = hash;
      user.salt = salt;
    }

    this.save();
    const { passwordHash: _, salt: __, ...safeUser } = user;
    return safeUser;
  }

  deleteUser(id) {
    const user = (this.data.users || []).find(u => u.id === id);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (user.role === 'admin') {
      const activeAdmins = (this.data.users || []).filter(u => u.id !== id && u.role === 'admin' && u.active !== false);
      if (activeAdmins.length === 0) {
        throw new Error('Нельзя удалить единственного активного администратора');
      }
    }

    // Удаляем все активные сессии пользователя
    if (this.data.sessions) {
      for (const [token, sess] of Object.entries(this.data.sessions)) {
        if (sess.userId === id) {
          delete this.data.sessions[token];
        }
      }
    }

    this.data.users = this.data.users.filter(u => u.id !== id);
    this.save();
    return true;
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    if (!this.data.sessions || typeof this.data.sessions !== 'object') {
      this.data.sessions = {};
    }
    this.data.sessions[token] = {
      userId,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    this.save();
    return token;
  }

  getSession(token) {
    if (!token || !this.data.sessions || !this.data.sessions[token]) {
      return null;
    }
    const sess = this.data.sessions[token];
    const user = this.getUserById(sess.userId);
    if (!user || user.active === false) {
      delete this.data.sessions[token];
      this.save();
      return null;
    }
    sess.lastUsed = new Date().toISOString();
    return user;
  }

  deleteSession(token) {
    if (this.data.sessions && this.data.sessions[token]) {
      delete this.data.sessions[token];
      this.save();
      return true;
    }
    return false;
  }

  cleanupExpiredSessions(maxAgeMs = 7 * 24 * 3600 * 1000) {
    if (!this.data || !this.data.sessions || typeof this.data.sessions !== 'object') return;
    const now = Date.now();
    let changed = false;
    for (const [token, sess] of Object.entries(this.data.sessions)) {
      const lastUsed = sess.lastUsed ? new Date(sess.lastUsed).getTime() : 0;
      if (!lastUsed || now - lastUsed > maxAgeMs) {
        delete this.data.sessions[token];
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }
}

export const storage = new Storage();
