/**
 * snmpMonitorDaemon.js
 * Фоновый сервис циклического мониторинга коммутаторов по SNMP v2c/v3
 * - Отслеживание Link Down / Link Up на активных портах
 * - Обнаружение всплесков CRC/входных ошибок (inErrors)
 * - Хранение истории нагрузки портов (Rx/Tx Mbps)
 * - Отправка уведомлений в Telegram / Вебхук
 */

import http from 'http';
import https from 'https';
import dgram from 'dgram';
import { pollSwitchTelemetry } from './snmpPoller.js';

class SnmpMonitorDaemon {
  constructor() {
    this.timer = null;
    this.intervalMs = 8000; // опрос каждые 8 секунд
    this.isRunning = false;
    this.storage = null;
    // switchId -> { [portNumber]: { operStatus, inErrors, rxMbps } }
    this.previousPortState = new Map();
    // switchId -> boolean (online status)
    this.previousSwitchOnline = new Map();
  }

  init(storage) {
    this.storage = storage;
    this.start();
    console.log('[SnmpMonitorDaemon] Сервис фонового мониторинга портов запущен (интервал: 8с)');
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.cycle();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
  }

  async cycle() {
    if (!this.isRunning) return;
    try {
      await this.pollAll();
    } catch (err) {
      console.warn('[SnmpMonitorDaemon] Ошибка цикла опроса:', err.message);
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(() => this.cycle(), this.intervalMs);
      }
    }
  }

  async pollAll() {
    if (!this.storage) return;
    const switches = this.storage.getSwitches() || [];
    const notifSettings = this.storage.getNotificationSettings();

    for (const sw of switches) {
      try {
        const telemetry = await pollSwitchTelemetry(sw);
        const isOnline = Boolean(telemetry && telemetry.online !== false);
        const prevOnline = this.previousSwitchOnline.get(sw.id);

        if (prevOnline !== undefined) {
          if (prevOnline === true && !isOnline && notifSettings.alertOnSwitchDown !== false) {
            const alert = this.storage.addAlert({
              level: 'critical',
              type: 'switch_down',
              switchId: sw.id,
              title: `АВАРИЯ: Коммутатор ${sw.name} недоступен`,
              message: `Коммутатор ${sw.name} (${sw.ip || 'DHCP'}) перестал отвечать на сетевой опрос и ICMP Ping!`,
              timestamp: new Date().toISOString()
            });
            this.sendNotification(alert, notifSettings);
          } else if (prevOnline === false && isOnline && notifSettings.alertOnSwitchDown !== false) {
            const alert = this.storage.addAlert({
              level: 'info',
              type: 'switch_up',
              switchId: sw.id,
              title: `ВОССТАНОВЛЕНИЕ: Коммутатор ${sw.name} в сети`,
              message: `Связь с коммутатором ${sw.name} (${sw.ip || 'DHCP'}) успешно восстановлена.`,
              timestamp: new Date().toISOString()
            });
            this.sendNotification(alert, notifSettings);
          }
        }
        this.previousSwitchOnline.set(sw.id, isOnline);

        if (!isOnline || !telemetry || !telemetry.ports) continue;

        const prevSwState = this.previousPortState.get(sw.id) || {};
        const newSwState = {};

        for (const port of telemetry.ports) {
          const portNum = port.number;
          const currentOper = port.operStatus;
          const prevOper = prevSwState[portNum]?.operStatus;
          const currentErrors = port.inErrors || 0;
          const prevErrors = prevSwState[portNum]?.inErrors || 0;

          // 1. Сохранение точки телеметрии в кольцевую историю
          this.storage.recordTelemetrySample(sw.id, portNum, {
            time: telemetry.timestamp,
            rxMbps: port.rxMbps || 0,
            txMbps: port.txMbps || 0,
            inErrors: port.inErrors || 0,
            status: currentOper
          });

          // 2. Детекция Link Down (если порт был UP и стал DOWN)
          if (prevOper === 'up' && currentOper === 'down' && notifSettings.alertOnLinkDown) {
            const alert = this.storage.addAlert({
              level: 'critical',
              type: 'link_down',
              switchId: sw.id,
              switchName: sw.name,
              portId: port.portId,
              portNumber: portNum,
              portName: port.name,
              title: `Срыв линка: ${sw.name} [порт ${port.name || portNum}]`,
              message: `Порт перешел в состояние DOWN. Проверьте физический кабель или подключенное устройство.`
            });
            this.sendNotification(alert, notifSettings);
          }

          // 3. Детекция Link Up (восстановление связи)
          if (prevOper === 'down' && currentOper === 'up') {
            const alert = this.storage.addAlert({
              level: 'info',
              type: 'link_up',
              switchId: sw.id,
              switchName: sw.name,
              portId: port.portId,
              portNumber: portNum,
              portName: port.name,
              title: `Линк восстановлен: ${sw.name} [порт ${port.name || portNum}]`,
              message: `Порт перешел в состояние UP на скорости ${port.speedMbps} Mbps.`
            });
            this.sendNotification(alert, notifSettings);
          }

          // 4. Детекция резкого роста ошибок CRC/FCS
          if (currentErrors > prevErrors && notifSettings.alertOnHighCrc) {
            const delta = currentErrors - prevErrors;
            const alert = this.storage.addAlert({
              level: 'warning',
              type: 'high_crc',
              switchId: sw.id,
              switchName: sw.name,
              portId: port.portId,
              portNumber: portNum,
              portName: port.name,
              title: `Ошибки пакетов (CRC): ${sw.name} [порт ${port.name || portNum}]`,
              message: `Зафиксировано +${delta} ошибок на порту. Возможен дефект патч-корда или затухание в оптике.`
            });
            this.sendNotification(alert, notifSettings);
          }

          newSwState[portNum] = {
            operStatus: currentOper,
            inErrors: currentErrors,
            rxMbps: port.rxMbps || 0
          };
        }

        this.previousPortState.set(sw.id, newSwState);
      } catch (e) {
        // Ошибка опроса конкретного свитча не должна прерывать цикл
      }
    }
  }

  /**
   * Отправка сетевого алерта в Telegram Bot API или Webhook
   */
  sendNotification(alert, settings) {
    // 1. Telegram
    if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
      const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '⚠️' : '✅';
      const text = `${icon} *[SwitchBook Alert]*\n*${alert.title}*\n${alert.message}\n_Время: ${new Date(alert.timestamp).toLocaleTimeString()}_`;
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
      const payload = JSON.stringify({
        chat_id: settings.telegramChatId,
        text,
        parse_mode: 'Markdown'
      });

      try {
        const parsedUrl = new URL(url);
        const req = https.request({
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 4000
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
      } catch (err) {}
    }

    // 2. Generic HTTP Webhook
    if (settings.webhookEnabled && settings.webhookUrl) {
      try {
        const payload = JSON.stringify(alert);
        const parsedUrl = new URL(settings.webhookUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 4000
        });
        req.on('error', () => {});
        req.write(payload);
        req.end();
      } catch (err) {}
    }

    // 3. Enterprise Syslog (UDP 514 / RFC 3164)
    if (settings.syslogEnabled && settings.syslogHost) {
      try {
        const client = dgram.createSocket('udp4');
        const facility = 16; // local0
        const severity = alert.level === 'critical' ? 2 : alert.level === 'warning' ? 4 : 6;
        const pri = (facility * 8) + severity;
        const timestamp = new Date().toISOString();
        const hostname = 'switchbook';
        const tag = 'network-monitor';
        const msg = `<${pri}>${timestamp} ${hostname} ${tag}: [${alert.type?.toUpperCase()}] ${alert.title} - ${alert.message}`;
        const buffer = Buffer.from(msg, 'utf-8');
        const port = Number(settings.syslogPort) || 514;

        client.send(buffer, 0, buffer.length, port, settings.syslogHost, () => {
          try { client.close(); } catch {}
        });
      } catch (err) {}
    }
  }

  /**
   * Отправка тестового уведомления с ожиданием результата
   */
  async sendTestNotification(settings) {
    const testAlert = {
      level: 'warning',
      title: 'Тестовое уведомление SwitchBook',
      message: 'Канал связи и оповещения (Telegram / Webhook / Syslog) успешно настроен и работает.',
      timestamp: new Date().toISOString()
    };

    const results = [];

    if (settings.telegramEnabled && settings.telegramBotToken && settings.telegramChatId) {
      const p = new Promise((resolve, reject) => {
        const text = `🔔 *[SwitchBook Test]*\n*${testAlert.title}*\n${testAlert.message}\n_Время: ${new Date().toLocaleTimeString()}_`;
        const payload = JSON.stringify({
          chat_id: settings.telegramChatId,
          text,
          parse_mode: 'Markdown'
        });
        const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
        try {
          const parsed = new URL(url);
          const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ channel: 'telegram', success: true });
              } else {
                reject(new Error(`Telegram API HTTP ${res.statusCode}: ${data}`));
              }
            });
          });
          req.on('error', (e) => reject(new Error(`Telegram network error: ${e.message}`)));
          req.on('timeout', () => { req.destroy(); reject(new Error('Telegram timeout')); });
          req.write(payload);
          req.end();
        } catch (e) {
          reject(e);
        }
      });
      results.push(p);
    }

    if (settings.webhookEnabled && settings.webhookUrl) {
      const p = new Promise((resolve, reject) => {
        const payload = JSON.stringify(testAlert);
        try {
          const parsed = new URL(settings.webhookUrl);
          const client = parsed.protocol === 'https:' ? https : http;
          const req = client.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000
          }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
              resolve({ channel: 'webhook', success: true });
            } else {
              reject(new Error(`Webhook HTTP ${res.statusCode}`));
            }
          });
          req.on('error', (e) => reject(new Error(`Webhook error: ${e.message}`)));
          req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
          req.write(payload);
          req.end();
        } catch (e) {
          reject(e);
        }
      });
      results.push(p);
    }

    if (settings.syslogEnabled && settings.syslogHost) {
      const p = new Promise((resolve, reject) => {
        try {
          const client = dgram.createSocket('udp4');
          const facility = 16;
          const pri = (facility * 8) + 4; // warning
          const timestamp = new Date().toISOString();
          const msg = `<${pri}>${timestamp} switchbook network-monitor: [TEST] ${testAlert.title} - ${testAlert.message}`;
          const buffer = Buffer.from(msg, 'utf-8');
          const port = Number(settings.syslogPort) || 514;

          client.send(buffer, 0, buffer.length, port, settings.syslogHost, (err) => {
            try { client.close(); } catch {}
            if (err) reject(new Error(`Syslog error: ${err.message}`));
            else resolve({ channel: 'syslog', success: true });
          });
        } catch (e) {
          reject(e);
        }
      });
      results.push(p);
    }

    if (results.length === 0) {
      throw new Error('Ни один канал оповещений не включен или не заполнены реквизиты (Bot Token / Chat ID / Webhook URL / Syslog Host)');
    }

    return Promise.all(results);
  }
}

export const snmpMonitorDaemon = new SnmpMonitorDaemon();
