/**
 * portProfiles.js
 * Библиотека типовых профилей портов для коммутаторов (SNR, MikroTik, Cisco, Ubiquiti).
 * Позволяет в 1 клик применять стандартные настройки (VLAN, PoE, режим, описание) к пачке портов.
 */

export const PORT_PROFILES = [
  {
    id: 'cctv',
    name: 'IP-Камера CCTV / СКУД',
    badge: 'CCTV',
    description: 'Видеонаблюдение, турникеты и контроллеры доступа (Access VLAN + PoE питание)',
    color: '#f59e0b', // Amber
    mode: 'access',
    vlanKeywords: ['cctv', 'cam', 'видео', 'камер', 'скуд', 'sec'],
    fallbackPvid: 50,
    poe: true,
    speed: '100M',
    descriptionTemplate: 'IP-Камера CCTV',
    connectedToTemplate: 'Камера',
    features: ['Access режим', 'PoE 802.3af/at (Вкл)', '100M/1G Auto', 'Spanning-Tree Edge']
  },
  {
    id: 'workplace',
    name: 'Рабочее место (ПК / Офис)',
    badge: 'USER',
    description: 'Офисные компьютеры сотрудников с поддержкой Voice VLAN для телефонов',
    color: '#3b82f6', // Blue
    mode: 'access',
    vlanKeywords: ['user', 'work', 'офис', 'комп', 'lan', 'corp', 'сотруд'],
    fallbackPvid: 20,
    poe: false,
    speed: '1G',
    descriptionTemplate: 'Рабочее место',
    connectedToTemplate: 'ПК сотрудника',
    features: ['Access режим', '1G Full Duplex', 'PoE выключено', 'Port Security']
  },
  {
    id: 'wifi_ap',
    name: 'Wi-Fi Точка доступа (AP)',
    badge: 'WIFI',
    description: 'Магистральный порт для точек доступа (Native Management VLAN + тегированные SSID)',
    color: '#8b5cf6', // Purple
    mode: 'trunk',
    vlanKeywords: ['wifi', 'ap', 'wlan', 'беспровод', 'точки', 'mgmt'],
    fallbackPvid: 10,
    fallbackTaggedVlans: [20, 30, 40],
    poe: true,
    speed: '1G',
    descriptionTemplate: 'Точка доступа Wi-Fi',
    connectedToTemplate: 'AP Wi-Fi',
    features: ['Trunk режим', 'Native VLAN (Mgmt)', 'Tagged VLANs (Users, Guest, IoT)', 'PoE+ (30W)']
  },
  {
    id: 'server',
    name: 'Сервер / СХД / PVE',
    badge: 'SRV',
    description: 'Серверная стойка, NAS-хранилища, ноды виртуализации Proxmox/ESXi',
    color: '#10b981', // Emerald
    mode: 'access',
    vlanKeywords: ['server', 'сервер', 'srv', 'dc', 'nas', 'pve', 'хранилищ'],
    fallbackPvid: 100,
    poe: false,
    speed: '1G',
    descriptionTemplate: 'Сервер',
    connectedToTemplate: 'Сервер',
    features: ['Access режим', 'Высокий приоритет', 'PoE выключено', '1G/10G Full Duplex']
  },
  {
    id: 'uplink',
    name: 'Магистраль (Trunk Uplink)',
    badge: 'TRUNK',
    description: 'Магистральный аплинк к ядру сети или между этажными коммутаторами',
    color: '#06b6d4', // Cyan
    mode: 'trunk',
    vlanKeywords: ['trunk', 'uplink', 'магистр', 'ядро', 'core'],
    fallbackPvid: 1,
    fallbackTaggedVlans: [], // Все существующие VLAN
    poe: false,
    speed: '10G',
    descriptionTemplate: 'Магистральный Uplink',
    connectedToTemplate: 'Аплинк',
    features: ['Trunk режим', 'Пропуск всех VLAN', 'LACP / STP UplinkFast', 'PoE выключено']
  },
  {
    id: 'shutdown',
    name: 'Резерв / Отключен (Security)',
    badge: 'OFF',
    description: 'Безопасная блокировка неиспользуемого порта (Blackhole VLAN + Shutdown)',
    color: '#ef4444', // Red
    mode: 'disabled',
    vlanKeywords: ['blackhole', 'park', 'резерв', 'lock'],
    fallbackPvid: 999,
    poe: false,
    enabled: false,
    speed: '1G',
    descriptionTemplate: 'Резерв (Shutdown)',
    connectedToTemplate: '',
    features: ['Административно выключен (shutdown)', 'Питание PoE снято', 'Blackhole VLAN 999']
  }
];

/**
 * Интеллектуальный поиск наиболее подходящего VLAN для профиля из существующих VLAN проекта
 */
export function matchVlanForProfile(profile, vlans = []) {
  if (!vlans || vlans.length === 0) return profile.fallbackPvid;

  // 1. Поиск по ключевым словам в имени VLAN
  if (profile.vlanKeywords && profile.vlanKeywords.length > 0) {
    for (const kw of profile.vlanKeywords) {
      const found = vlans.find(v => (v.name || '').toLowerCase().includes(kw));
      if (found) return found.id;
    }
  }

  // 2. Поиск по точному совпадению fallbackPvid
  const exact = vlans.find(v => v.id === profile.fallbackPvid);
  if (exact) return exact.id;

  // 3. Возвращаем первый не дефолтный или дефолтный VLAN
  const nonDefault = vlans.find(v => v.id !== 1);
  return nonDefault ? nonDefault.id : vlans[0].id;
}
