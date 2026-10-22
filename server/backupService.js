/**
 * backupService.js
 * Сервис SSH подключения, сбора конфигураций и версионирования для MikroTik, SNR и Ubiquiti
 */

import { Client } from 'ssh2';
import crypto from 'crypto';
import { storage } from './storage.js';

/**
 * Очистка текста конфигурации от управляющих ANSI-последовательностей и \r
 */
function cleanConfigOutput(rawText) {
  if (!rawText) return '';
  return rawText
    // Remove ANSI escape codes
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Replace Windows CRLF with \n
    .replace(/\r\n/g, '\n')
    // Remove standalone \r
    .replace(/\r/g, '')
    .trim();
}

/**
 * Определение SSH команды в зависимости от платформы
 */
function getExportCommand(vendor = 'MikroTik') {
  const v = (vendor || '').toLowerCase();
  if (v.includes('mikrotik')) {
    // RouterOS compact export without default sensitive secrets
    return '/export compact';
  }
  if (v.includes('snr')) {
    // SNR / NAG Cisco-like CLI
    return 'terminal length 0\nshow running-config\n';
  }
  if (v.includes('ubiquiti') || v.includes('unifi')) {
    // EdgeSwitch or UniFi CLI
    return 'terminal length 0\nshow running-config\n';
  }
  if (v.includes('cisco') || v.includes('eltex')) {
    return 'terminal length 0\nshow running-config\n';
  }
  // Generic fallback
  return 'show running-config\n';
}

/**
 * Сбор конфигурации с коммутатора по протоколу SSH
 */
export async function fetchSwitchConfigOverSsh({
  host,
  port = 22,
  username = 'admin',
  password = '',
  privateKey = null,
  vendor = 'MikroTik',
  timeout = 10000
}) {
  return new Promise((resolve, reject) => {
    if (!host) {
      return reject(new Error('Не указан IP-адрес или хост коммутатора'));
    }

    const conn = new Client();
    let output = '';
    let errorOutput = '';
    let isFinished = false;

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        conn.end();
        reject(new Error(`Таймаут подключения по SSH к ${host}:${port} (${timeout / 1000} сек.)`));
      }
    }, timeout);

    conn.on('ready', () => {
      const cmd = getExportCommand(vendor);
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          isFinished = true;
          conn.end();
          return reject(err);
        }

        stream.on('close', (code, signal) => {
          clearTimeout(timer);
          if (!isFinished) {
            isFinished = true;
            conn.end();
            const cleaned = cleanConfigOutput(output);
            if (!cleaned && errorOutput) {
              return reject(new Error(`Ошибка выполнения команды на ${host}: ${errorOutput}`));
            }
            resolve({
              success: true,
              content: cleaned,
              linesCount: cleaned.split('\n').length,
              sizeBytes: Buffer.byteLength(cleaned, 'utf8')
            });
          }
        });

        stream.on('data', (data) => {
          output += data.toString('utf8');
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString('utf8');
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      if (!isFinished) {
        isFinished = true;
        reject(new Error(`SSH ошибка [${host}]: ${err.message}`));
      }
    });

    try {
      const connectOptions = {
        host,
        port: parseInt(port) || 22,
        username,
        readyTimeout: timeout,
        keepaliveInterval: 5000
      };

      if (privateKey) {
        connectOptions.privateKey = privateKey;
      } else if (password) {
        connectOptions.password = password;
      }

      conn.connect(connectOptions);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Выполнение произвольной команды или скрипта на коммутаторе по SSH
 */
export async function executeSshCommand({
  host,
  port = 22,
  username = 'admin',
  password = '',
  privateKey = null,
  vendor = 'MikroTik',
  command = '',
  timeout = 4000
}) {
  return new Promise((resolve, reject) => {
    if (!host) {
      return reject(new Error('Не указан IP-адрес хоста'));
    }
    if (!command || !command.trim()) {
      return reject(new Error('Команда для выполнения не указана'));
    }

    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let isFinished = false;

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        conn.end();
        reject(new Error(`Таймаут выполнения команды на ${host}:${port} (${timeout / 1000} сек.)`));
      }
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          isFinished = true;
          conn.end();
          return reject(err);
        }

        stream.on('close', (code, signal) => {
          clearTimeout(timer);
          if (!isFinished) {
            isFinished = true;
            conn.end();
            const cleanStdout = cleanConfigOutput(stdout);
            const cleanStderr = cleanConfigOutput(stderr);
            resolve({
              success: code === 0 || (!cleanStderr && cleanStdout.length > 0),
              exitCode: code,
              stdout: cleanStdout,
              stderr: cleanStderr,
              output: cleanStdout || cleanStderr || '(Команда выполнена успешно, вывод пуст)'
            });
          }
        });

        stream.on('data', (data) => {
          stdout += data.toString('utf8');
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString('utf8');
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      if (!isFinished) {
        isFinished = true;
        reject(new Error(`SSH ошибка [${host}]: ${err.message}`));
      }
    });

    try {
      const connectOptions = {
        host,
        port: parseInt(port) || 22,
        username,
        readyTimeout: timeout,
        keepaliveInterval: 5000
      };

      if (privateKey) {
        connectOptions.privateKey = privateKey;
      } else if (password) {
        connectOptions.password = password;
      }

      conn.connect(connectOptions);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Вычисление хеша SHA-256 для проверки изменений
 */
export function calculateConfigHash(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

/**
 * Генерация реалистичного начального бэкапа для демонстрации и оффлайн-работы
 */
export function generateSampleBaselineConfig(switchItem) {
  const v = (switchItem.vendor || '').toLowerCase();
  const name = switchItem.name || 'switch';
  const ip = switchItem.ip || '192.168.1.1';

  if (v.includes('mikrotik')) {
    return `# jan/02/1970 00:15:32 by RouterOS 7.15.2
# software id = 48R2-M1K9
#
# model = ${switchItem.model || 'CRS326-24G-2S+RM'}
# serial number = H4G0891KTR2
/interface bridge
add admin-mac=B8:69:F4:01:22:33 auto-mac=no comment="Core Bridge" name=bridge-lan vlan-filtering=yes
/interface ethernet
set [ find default-name=ether1 ] comment="Uplink to Gate" name=ether1
set [ find default-name=ether2 ] comment="Core Server 01" name=ether2
set [ find default-name=ether3 ] comment="Domain Controller" name=ether3
/interface vlan
add interface=bridge-lan name=vlan10-mgmt vlan-id=10
add interface=bridge-lan name=vlan20-office vlan-id=20
add interface=bridge-lan name=vlan30-wifi vlan-id=30
/interface bridge port
add bridge=bridge-lan frame-types=admit-only-vlan-tagged interface=sfp-sfpplus1
add bridge=bridge-lan frame-types=admit-only-untagged-and-priority-tagged interface=ether1 pvid=10
add bridge=bridge-lan frame-types=admit-only-untagged-and-priority-tagged interface=ether2 pvid=20
/interface bridge vlan
add bridge=bridge-lan tagged=bridge-lan,sfp-sfpplus1 untagged=ether1 vlan-ids=10
add bridge=bridge-lan tagged=bridge-lan,sfp-sfpplus1 untagged=ether2 vlan-ids=20
add bridge=bridge-lan tagged=bridge-lan,sfp-sfpplus1 vlan-ids=30
/ip address
add address=${ip}/24 comment="Management IP" interface=vlan10-mgmt network=192.168.10.0
/ip dns
set servers=192.168.10.1,77.88.8.8
/ip route
add disabled=no distance=1 dst-address=0.0.0.0/0 gateway=192.168.10.1
/system clock
set time-zone-name=Europe/Moscow
/system identity
set name=${name}
/system ntp client
set enabled=yes
/system ntp client servers
add address=pool.ntp.org`;
  }

  if (v.includes('snr')) {
    return `!
! Configuration file for ${switchItem.model || 'SNR-S2985G-24T'}
! Software Version: 7.0.3.5(R0241.0189)
!
hostname ${name}
!
vlan 1
!
vlan 10
 name Management
!
vlan 20
 name Office_LAN
!
vlan 30
 name Wi-Fi_APs
!
Interface GigabitEthernet1/0/1
 switchport access vlan 20
 description "PC Accounting 01"
!
Interface GigabitEthernet1/0/2
 switchport access vlan 20
 description "PC Accounting 02"
!
Interface GigabitEthernet1/0/24
 switchport mode trunk
 switchport trunk allowed vlan 10;20;30;40;50
 description "Trunk Uplink to Core"
!
Interface Vlan10
 ip address ${ip} 255.255.255.0
!
ip default-gateway 192.168.10.1
!
sflow agent-address ${ip}
!
snmp-server community public ro
!
end`;
  }

  // Ubiquiti UniFi / EdgeSwitch
  return `!System Description "${switchItem.model || 'EdgeSwitch 24 Lite'}, 1.9.3, Linux 3.6.5"
!System Software Version "1.9.3.5324"
!
hostname "${name}"
network protocol none
vlan database
vlan 10,20,30,40,50
vlan name 10 "Management"
vlan name 20 "Office"
vlan name 30 "Wi-Fi"
exit
!
configure
interface 0/1
description 'Workstation 1'
vlan pvid 20
vlan participation include 20
exit
!
interface 0/24
description 'Uplink Trunk'
vlan participation include 10,20,30,40,50
vlan tagging 10,20,30,40,50
exit
!
interface vlan 10
ip address ${ip} 255.255.255.0
exit
!
ip default-gateway 192.168.10.1
exit`;
}
