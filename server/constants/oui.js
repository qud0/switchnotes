/**
 * oui.js - Единая база OUI (MAC-префиксов) для идентификации производителей оборудования
 */

export const OUI_DATABASE = [
  // MikroTik RouterOS / SwOS
  { prefix: 'B8:69:F4', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: '48:8F:5A', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: 'CC:2D:E0', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: 'DC:2C:6E', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: 'D4:01:C3', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: '08:55:31', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: 'E4:8D:8C', vendor: 'MikroTik', type: 'Router / Switch' },
  { prefix: '6C:3B:6B', vendor: 'MikroTik', type: 'Router / Switch' },

  // SNR (NAG)
  { prefix: 'F8:F0:82', vendor: 'SNR (NAG)', type: 'Managed Switch' },
  { prefix: '00:04:96', vendor: 'SNR / Extreme', type: 'Managed Switch' },
  { prefix: 'C8:D3:FF', vendor: 'SNR (NAG)', type: 'Managed Switch' },
  { prefix: 'EC:22:80', vendor: 'SNR (NAG)', type: 'Managed Switch' },
  { prefix: '00:1E:E7', vendor: 'SNR / BDCOM', type: 'Managed Switch' },

  // Ubiquiti Networks (UniFi / EdgeSwitch / AirMAX)
  { prefix: '74:83:C2', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: 'B4:FB:E4', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: 'F0:9F:C2', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: '00:15:6D', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: '24:A4:3C', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: '68:D7:9A', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: '78:45:58', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: 'DC:9F:DB', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },
  { prefix: 'AC:8B:A9', vendor: 'Ubiquiti Networks', type: 'UniFi / EdgeSwitch' },

  // Enterprise Switches & Servers
  { prefix: 'D8:9E:F3', vendor: 'Cisco Systems', type: 'Catalyst Switch' },
  { prefix: '00:1A:A0', vendor: 'Dell Enterprise', type: 'Server / Switch' },
  { prefix: '00:25:B3', vendor: 'HP Inc.', type: 'Enterprise Server / PC' },
  { prefix: '3C:D9:2B', vendor: 'HP / Aruba', type: 'Network Switch' },
  { prefix: '00:1E:67', vendor: 'Intel', type: 'NIC / Server' },
  { prefix: 'F8:75:A4', vendor: 'Intel', type: 'NIC / Server' },

  // Virtualization
  { prefix: '00:50:56', vendor: 'VMware ESXi', type: 'Virtual Machine' },
  { prefix: '00:0C:29', vendor: 'VMware Workstation', type: 'Virtual Machine' },
  { prefix: '52:54:00', vendor: 'QEMU / KVM', type: 'Virtual Machine' },

  // VoIP & Peripherals
  { prefix: '00:1A:E8', vendor: 'Grandstream VoIP', type: 'VoIP Phone' },
  { prefix: '00:15:65', vendor: 'Yealink VoIP', type: 'VoIP Phone' },
  { prefix: '00:17:C4', vendor: 'Kyocera Printer', type: 'Network Printer' }
];

export const OUI_MAP = OUI_DATABASE;
export const EXPANDED_OUI = OUI_DATABASE;

/**
 * Определение расширенной информации о вендоре и типе устройства по MAC
 */
export function getDetailedVendor(mac) {
  if (!mac || typeof mac !== 'string') return null;
  const clean = mac.replace(/[:-]/g, '').toUpperCase();
  for (const item of OUI_DATABASE) {
    const itemPrefix = item.prefix.replace(/[:-]/g, '').toUpperCase();
    if (clean.startsWith(itemPrefix)) {
      return item;
    }
  }
  return null;
}

/**
 * Простое получение имени вендора по MAC
 */
export function lookupVendor(mac) {
  const detailed = getDetailedVendor(mac);
  return detailed ? detailed.vendor : null;
}
