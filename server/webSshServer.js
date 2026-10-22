/**
 * webSshServer.js
 * Интерактивный Web-SSH сервер на WebSocket для MikroTik, SNR NAG и Ubiquiti UniFi/EdgeSwitch.
 * Поддерживает:
 * - Реальный интерактивный PTY shell по SSH через библиотеку ssh2.
 * - Умный интерактивный CLI эмулятор для оффлайн/лабораторного режима с аутентичными баннерами и командами вендоров.
 */

import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import url from 'url';

/**
 * Инициализация WebSocket сервера для терминала SSH
 */
export function initWebSshServer(httpServer, storage) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    if (pathname === '/ws/ssh') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const query = parsedUrl.query || {};

    // Проверка прав доступа RBAC: доступ к Web-SSH разрешен только инженерам и администраторам
    const token = query.token;
    const user = token ? storage.getSession(token) : null;
    if (!user) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'status', 
          status: 'error', 
          message: 'Ошибка авторизации: для подключения к Web-SSH терминалу требуется валидная сессия инженера или администратора.' 
        }));
        ws.close(4001, 'Unauthorized');
      }
      return;
    }

    if (user.role === 'viewer') {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'status', 
          status: 'error', 
          message: 'Доступ к интерактивному терминалу Web-SSH запрещен: роль «Наблюдатель» имеет доступ только для чтения.' 
        }));
        ws.close(4003, 'Forbidden');
      }
      return;
    }

    let switchId = query.switchId;
    let targetSwitch = storage.getSwitchById(switchId);

    let sshClient = null;
    let sshStream = null;
    let isConnected = false;
    let isSimulated = false;

    // Вспомогательная отправка в сокет
    const sendData = (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    };

    const sendStatus = (status, message) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'status', status, message }));
      }
    };

    // Очистка при закрытии
    const cleanup = () => {
      if (sshStream) {
        try { sshStream.end(); } catch {}
        sshStream = null;
      }
      if (sshClient) {
        try { sshClient.end(); } catch {}
        sshClient = null;
      }
      isConnected = false;
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);

    // Интерактивный эмулятор CLI под вендора коммутатора
    const startSimulatedCli = (sw, initialCols = 80, initialRows = 24) => {
      isSimulated = true;
      isConnected = true;
      sendStatus('connected', `[Демо/Лаб]: Запущен CLI терминал ${sw.vendor} ${sw.model || ''}`);

      const vendor = (sw.vendor || 'MikroTik').toLowerCase();
      let prompt = '';
      let banner = '';

      if (vendor.includes('mikrotik')) {
        prompt = `\r\n\x1b[1;36m[admin@${sw.name}]\x1b[0m \x1b[1;32m>\x1b[0m `;
        banner = `\x1b[1;36m
  MMM      MMM       KKK                          TTTTTTTTTTT      KKK
  MMMM    MMMM       KKK                              TTT          KKK
  MMM MMMM MMM  III  KKK  KKK  RRRRR   OOOOO   TTTTT  TTT   III    KKK  KKK
  MMM  MM  MMM  III  KKKKK     RR  RR OO   OO TTT     TTT   III    KKKKK
  MMM      MMM  III  KKK KKK   RRRRR  OO   OO  TTTT   TTT   III    KKK KKK
  MMM      MMM  III  KKK  KKK  RR  RR  OOOOO      TTT TTT   III    KKK  KKK
\x1b[0m
  \x1b[1mRouterOS 7.14.2 (c) 1999-2026\x1b[0m       \x1b[4mhttps://www.mikrotik.com/\x1b[0m
  Подключено к \x1b[1;33m${sw.name}\x1b[0m (IP: ${sw.ip || '192.168.10.1'}, Модель: ${sw.model || 'CRS326-24G-2S+RM'})
  Для справки введите \x1b[1;32mhelp\x1b[0m или команду (например: \x1b[1;32m/interface print\x1b[0m)\r\n`;
      } else if (vendor.includes('snr')) {
        prompt = `\r\n\x1b[1;32m${sw.name}#\x1b[0m `;
        banner = `\r\n\x1b[1mSNR-S2985G-24T Enterprise Switch, Release 7.2.1\x1b[0m
Copyright (c) 2004-2026 NAG LLC. All rights reserved.
Подключено к \x1b[1;33m${sw.name}\x1b[0m [IP: ${sw.ip || '192.168.10.10'}]
Введите \x1b[1;32mshow version\x1b[0m, \x1b[1;32mshow running-config\x1b[0m или \x1b[1;32mshow mac-address-table\x1b[0m\r\n`;
      } else if (vendor.includes('ubiquiti') || vendor.includes('unifi')) {
        prompt = `\r\n\x1b[1;34m(${sw.name}) #\x1b[0m `;
        banner = `\r\n\x1b[1mUbiquiti UniFi Pro 24 PoE / EdgeSwitch CLI, Linux 3.6.5\x1b[0m
(c) Ubiquiti Networks, Inc.
Подключено к \x1b[1;33m${sw.name}\x1b[0m [IP: ${sw.ip || '192.168.10.20'}]
Введите \x1b[1;32mshow version\x1b[0m или \x1b[1;32mshow vlan\x1b[0m\r\n`;
      } else {
        prompt = `\r\n\x1b[1;32m${sw.name}#\x1b[0m `;
        banner = `\r\nCisco-Compatible CLI Terminal for ${sw.name}\r\n`;
      }

      sendData(banner + prompt);

      let currentLine = '';

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'data') {
            const input = msg.data;
            // Обработка клавиш Enter, Backspace и спецсимволов
            if (input === '\r' || input === '\n') {
              const cmd = currentLine.trim();
              sendData('\r\n');
              handleSimulatedCommand(cmd, sw, vendor);
              currentLine = '';
              sendData(prompt);
            } else if (input === '\x7f' || input === '\b') {
              if (currentLine.length > 0) {
                currentLine = currentLine.slice(0, -1);
                sendData('\b \b');
              }
            } else if (input === '\x03') { // Ctrl+C
              currentLine = '';
              sendData('^C' + prompt);
            } else if (input === '\x0c') { // Ctrl+L (Clear screen)
              sendData('\x1b[2J\x1b[H' + prompt + currentLine);
            } else {
              // Обычный ввод символов
              currentLine += input;
              sendData(input);
            }
          }
        } catch {
          // ignore non-json
        }
      });
    };

    // Обработка команд в эмуляторе
    const handleSimulatedCommand = (cmd, sw, vendor) => {
      const lower = cmd.toLowerCase();
      if (!cmd) return;

      if (lower === 'help' || lower === '?') {
        if (vendor.includes('mikrotik')) {
          sendData(`Доступные команды MikroTik RouterOS:
  /interface print                  - просмотр сетевых интерфейсов
  /interface bridge vlan print       - таблица VLAN на мосту
  /ip address print                 - IP адреса коммутатора
  /system resource print            - загрузка CPU, память, аптайм
  /export compact                   - экспорт активной конфигурации
  ping <ip>                         - проверка доступности хоста
  clear                             - очистить экран
  quit                              - завершить сессию\r\n`);
        } else {
          sendData(`Доступные команды CLI:
  show version                      - версия прошивки и модель
  show running-config               - текущая конфигурация
  show mac-address-table            - таблица коммутации MAC
  show ip interface brief           - статус IP интерфейсов
  show vlan                         - база данных VLAN
  ping <ip>                         - проверка доступности
  clear                             - очистить экран
  exit                              - завершить сессию\r\n`);
        }
        return;
      }

      if (lower === 'clear' || lower === 'cls') {
        sendData('\x1b[2J\x1b[H');
        return;
      }

      if (lower === 'quit' || lower === 'exit') {
        sendData('\x1b[33mСессия завершена пользователем.\x1b[0m\r\n');
        return;
      }

      if (lower.startsWith('ping')) {
        const parts = cmd.split(' ');
        const target = parts[1] || '192.168.10.1';
        sendData(`PING ${target} (56 data bytes):\r\n`);
        sendData(`64 bytes from ${target}: icmp_seq=1 ttl=64 time=0.98 ms\r\n`);
        sendData(`64 bytes from ${target}: icmp_seq=2 ttl=64 time=1.12 ms\r\n`);
        sendData(`64 bytes from ${target}: icmp_seq=3 ttl=64 time=0.89 ms\r\n`);
        sendData(`--- ${target} ping statistics --- 3 packets transmitted, 3 packets received, 0% packet loss\r\n`);
        return;
      }

      // MikroTik RouterOS команды
      if (vendor.includes('mikrotik')) {
        if (lower.includes('interface print') || lower === '/interface print' || lower === 'ip link') {
          sendData(`Flags: D - DYNAMIC; X - DISABLED; R - RUNNING; S - SLAVE\r\nColumns: NAME, TYPE, ACTUAL-MTU, MAC-ADDRESS\r\n#    NAME          TYPE     ACTUAL-MTU  MAC-ADDRESS\r\n`);
          (sw.ports || []).slice(0, 16).forEach((p, idx) => {
            const isRun = p.enabled !== false;
            sendData(`${idx < 10 ? ' ' : ''}${idx} RS ${(p.name || 'ether' + p.number).padEnd(14)} ether         1500  B8:69:F4:01:22:${(idx+1).toString(16).padStart(2,'0').toUpperCase()}\r\n`);
          });
          return;
        }

        if (lower.includes('resource print') || lower.includes('/system resource print')) {
          sendData(`                   uptime: 14d 6h 32m 10s\r\n                  version: 7.14.2 (stable)\r\n               build-time: 2026-02-18 10:25:00\r\n         factory-software: 7.1\r\n              free-memory: 428.4MiB\r\n             total-memory: 512.0MiB\r\n                      cpu: ARMv7\r\n                cpu-count: 2\r\n            cpu-frequency: 800MHz\r\n                 cpu-load: 12%\r\n           free-hdd-space: 8.2MiB\r\n          total-hdd-space: 16.0MiB\r\n  write-sect-since-reboot: 4219\r\n         write-sect-total: 104289\r\n               bad-blocks: 0%\r\n        architecture-name: arm\r\n               board-name: ${sw.model || 'CRS326-24G-2S+RM'}\r\n                 platform: MikroTik\r\n`);
          return;
        }

        if (lower.includes('ip address print') || lower.includes('/ip address print')) {
          sendData(`Flags: D - DYNAMIC\r\nColumns: ADDRESS, NETWORK, INTERFACE\r\n#   ADDRESS          NETWORK        INTERFACE\r\n0   ${sw.ip || '192.168.10.1'}/24   192.168.10.0   bridge1\r\n`);
          return;
        }

        if (lower.includes('bridge vlan print') || lower.includes('/interface bridge vlan print')) {
          sendData(`Flags: X - DISABLED; D - DYNAMIC\r\nColumns: BRIDGE, VLAN-IDS, CURRENT-TAGGED, CURRENT-UNTAGGED\r\n#   BRIDGE   VLAN-IDS  CURRENT-TAGGED           CURRENT-UNTAGGED\r\n0   bridge1  10        sfp-sfpplus1             ether1,ether2\r\n1   bridge1  20        bridge1,sfp-sfpplus1     ether3,ether4,ether5\r\n2   bridge1  30        sfp-sfpplus1             ether6,ether7\r\n`);
          return;
        }

        if (lower.includes('export') || lower.includes('/export')) {
          sendData(`# 2026-10-06 23:00:00 by RouterOS 7.14.2\r\n# software id = 4Y2A-7PQ8\r\n#\r\n# model = ${sw.model || 'CRS326-24G-2S+RM'}\r\n/interface bridge\r\nadd name=bridge1 vlan-filtering=yes\r\n/interface bridge port\r\nadd bridge=bridge1 interface=ether1 pvid=10\r\nadd bridge=bridge1 interface=ether2 pvid=20\r\n/ip address\r\nadd address=${sw.ip || '192.168.10.1'}/24 interface=bridge1\r\n`);
          return;
        }
      }

      // SNR (NAG) команды
      if (vendor.includes('snr')) {
        if (lower.includes('show version') || lower.includes('show ver')) {
          sendData(`SNR-S2985G-24T Device, Compiled Oct 2024\r\nSoftWare Version 7.2.1(R0018.0125)\r\nBootRom Version 7.1.3\r\nHardWare Version 1.0.1\r\nHost Name: ${sw.name}\r\nUptime is 14 days, 6 hours, 32 minutes\r\nCPU Utilization: 8% (5 seconds), 9% (1 minute), 8% (5 minutes)\r\nMemory Total: 262144KB, Free: 184512KB\r\n`);
          return;
        }

        if (lower.includes('show running-config') || lower.includes('show run')) {
          sendData(`!Current configuration:\r\n!\r\nhostname ${sw.name}\r\nvlan 10,20,30,40,50,100\r\n!\r\ninterface Ethernet1/0/1\r\n switchport mode access\r\n switchport access vlan 20\r\n!\r\ninterface Ethernet1/0/28\r\n switchport mode trunk\r\n switchport trunk allowed vlan 10,20,30,40,50,100\r\n!\r\ninterface Vlan10\r\n ip address ${sw.ip || '192.168.10.10'} 255.255.255.0\r\n!\r\n`);
          return;
        }

        if (lower.includes('show mac') || lower.includes('show mac-address-table')) {
          sendData(`Vlan  Mac Address       Type       Creator   Ports\r\n----  ----------------  ---------  -------   ----------------\r\n10    f8f0.8211.4455    DYNAMIC    COMMON    Ethernet1/0/28\r\n20    b869.f401.2233    DYNAMIC    COMMON    Ethernet1/0/1\r\n20    7483.c255.6677    DYNAMIC    COMMON    Ethernet1/0/2\r\n30    cc2d.e099.8877    DYNAMIC    COMMON    Ethernet1/0/5\r\nTotal Mac Addresses: 4\r\n`);
          return;
        }

        if (lower.includes('show vlan')) {
          sendData(`VLAN  Name                             Status    Ports\r\n----  -------------------------------- --------- ----------------------------------------\r\n1     default                          Active    Eth1/0/1-24\r\n10    MGMT                             Active    Eth1/0/28\r\n20    USERS                            Active    Eth1/0/1-12, Eth1/0/28\r\n30    CCTV                             Active    Eth1/0/13-20, Eth1/0/28\r\n`);
          return;
        }
      }

      // Ubiquiti команды
      if (vendor.includes('ubiquiti') || vendor.includes('unifi')) {
        if (lower.includes('show version')) {
          sendData(`EdgeSwitch 24 250W, 1.9.3, Linux 3.6.5\r\nMachine Model: ${sw.model || 'UniFi Switch Pro 24 PoE'}\r\nSystem Uptime: 14 days, 6 hours, 32 minutes\r\nTemperature: 44 C\r\nPoE Total Power: 250W, Consumed: 142W\r\n`);
          return;
        }
        if (lower.includes('show vlan')) {
          sendData(`VLAN ID  VLAN Name                        VLAN Type\r\n-------  -------------------------------- ---------\r\n1        default                          Default\r\n10       MGMT                             Static\r\n20       USERS                            Static\r\n30       VOIP                             Static\r\n`);
          return;
        }
      }

      // Fallback ответ
      sendData(`\x1b[33m% Команда "${cmd}" принята (CLI OK)\x1b[0m\r\n`);
    };

    // Обработчик первого инициализационного сообщения с фронтенда
    ws.on('message', function initialHandler(raw) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'init') {
          ws.removeListener('message', initialHandler);

          const {
            switchId: initSwitchId,
            host = targetSwitch?.ip || '192.168.10.1',
            port = 22,
            username = 'admin',
            password = '',
            cols = 80,
            rows = 24,
            forceSimulation = false
          } = msg;

          if (initSwitchId) {
            targetSwitch = storage.getSwitchById(initSwitchId) || targetSwitch;
          }

          if (!targetSwitch) {
            targetSwitch = {
              id: 'sw-generic',
              name: host || 'switch',
              vendor: 'MikroTik',
              ip: host
            };
          }

          // Если явно запрошен демо-режим или хост не отвечает
          if (forceSimulation || targetSwitch.snmpMode === 'simulation') {
            startSimulatedCli(targetSwitch, cols, rows);
            return;
          }

          // Попытка подключения к реальному коммутатору по SSH
          sendStatus('connecting', `Подключение к ${host}:${port} (пользователь: ${username})...`);

          const conn = new Client();
          sshClient = conn;

          const timeoutTimer = setTimeout(() => {
            if (!isConnected) {
              cleanup();
              sendStatus('fallback', `Таймаут подключения к ${host}:${port}. Переключение в демо-режим.`);
              startSimulatedCli(targetSwitch, cols, rows);
            }
          }, 4000);

          conn.on('ready', () => {
            clearTimeout(timeoutTimer);
            isConnected = true;
            sendStatus('connected', `SSH соединение установлено с ${targetSwitch.name} [${host}:${port}]`);

            conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
              if (err) {
                cleanup();
                startSimulatedCli(targetSwitch, cols, rows);
                return;
              }

              sshStream = stream;

              stream.on('data', (chunk) => {
                sendData(chunk.toString('utf-8'));
              });

              stream.on('close', () => {
                sendStatus('disconnected', 'SSH сессия завершена удаленным хостом.');
                cleanup();
              });

              stream.stderr.on('data', (chunk) => {
                sendData(chunk.toString('utf-8'));
              });

              // Прием ввода от веб-терминала
              ws.on('message', (clientRaw) => {
                try {
                  const clientMsg = JSON.parse(clientRaw);
                  if (clientMsg.type === 'data') {
                    stream.write(clientMsg.data);
                  } else if (clientMsg.type === 'resize') {
                    const { cols: c, rows: r } = clientMsg;
                    stream.setWindow(r, c, 0, 0);
                  }
                } catch {
                  // ignore
                }
              });
            });
          });

          conn.on('error', (err) => {
            clearTimeout(timeoutTimer);
            cleanup();
            sendStatus('fallback', `SSH [${host}]: ${err.message}. Запуск эмулятора CLI.`);
            startSimulatedCli(targetSwitch, cols, rows);
          });

          try {
            conn.connect({
              host,
              port: parseInt(port) || 22,
              username,
              password,
              readyTimeout: 3500,
              keepaliveInterval: 5000
            });
          } catch (err) {
            clearTimeout(timeoutTimer);
            cleanup();
            startSimulatedCli(targetSwitch, cols, rows);
          }
        }
      } catch (e) {
        // ignore
      }
    });
  });

  console.log('[WebSSH] Сервер Web-SSH инициализирован на пути ws://<host>:<port>/ws/ssh');
}
