/**
 * eventPulseDaemon.js
 * High-performance background service receiving UDP Syslog (514) and SNMP Traps (162).
 * Integrates message parsing, link flapping detection, rate limiting, and real-time WebSocket broadcast.
 */

import dgram from 'dgram';
import snmp from 'net-snmp';
import {
  parseSyslogMessage,
  LinkFlapDetector,
  EventRateLimiter
} from './eventPulseParser.js';

export class EventPulseDaemon {
  constructor() {
    this.storage = null;
    this.syslogSocket = null;
    this.trapReceiver = null;

    this.syslogPort = Number(process.env.SYSLOG_PORT) || 514;
    this.syslogFallbackPort = 1514;
    this.isSyslogFallback = false;

    this.trapPort = Number(process.env.SNMP_TRAP_PORT) || 162;
    this.trapFallbackPort = 1162;
    this.isTrapFallback = false;

    this.isRunning = false;
    this.packetsReceived = 0;
    this.alertsCreated = 0;
    this.wsClients = new Set();

    this.flapDetector = new LinkFlapDetector(60000, 3);
    this.rateLimiter = new EventRateLimiter();

    // Periodic cleanup of expired flap records
    this.cleanupTimer = setInterval(() => {
      this.flapDetector.clearExpired(60000);
    }, 30000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Initializes UDP listeners and links storage.
   * @param {Object} httpServer
   * @param {Object} storage
   * @param {Object} [options]
   */
  async init(httpServer, storage, options = {}) {
    this.storage = storage;
    if (options.syslogPort) this.syslogPort = options.syslogPort;
    if (options.trapPort) this.trapPort = options.trapPort;

    this._startSyslogListener(this.syslogPort);
    this._startTrapListener(this.trapPort);
    this.isRunning = true;
  }

  /**
   * Binds UDP Syslog listener with graceful fallback on EACCES / EADDRINUSE.
   * @private
   */
  _startSyslogListener(port) {
    try {
      const socket = dgram.createSocket('udp4');

      socket.on('error', (err) => {
        console.warn(`[EventPulse] Ошибка биндинга Syslog UDP :${port} (${err.code})`);
        socket.close();

        if (!this.isSyslogFallback && port !== this.syslogFallbackPort) {
          console.warn(`[EventPulse] Переключение Syslog на резервный порт :${this.syslogFallbackPort}...`);
          this.isSyslogFallback = true;
          this.syslogPort = this.syslogFallbackPort;
          this._startSyslogListener(this.syslogFallbackPort);
        }
      });

      socket.on('message', (msg, rinfo) => {
        try {
          this.processMessage(msg, rinfo.address);
        } catch (err) {
          console.error('[EventPulse] Ошибка обработки Syslog сообщения:', err);
        }
      });

      socket.on('listening', () => {
        const addr = socket.address();
        console.log(`[EventPulse] ✓ Syslog UDP сервер запущен на 0.0.0.0:${addr.port}`);
        try {
          // Increase receive buffer to 1MB to handle bursts
          socket.setRecvBufferSize(1024 * 1024);
        } catch {}
      });

      socket.bind(port);
      this.syslogSocket = socket;
    } catch (err) {
      console.warn('[EventPulse] Исключение при запуске Syslog сокета:', err.message);
    }
  }

  /**
   * Binds SNMP Trap listener with fallback.
   * @private
   */
  _startTrapListener(port) {
    try {
      const receiverOptions = {
        port,
        disableAuthorization: true
      };

      const receiverCallback = (error, trap) => {
        if (error) {
          console.warn(`[EventPulse] Ошибка SNMP Trap на :${port}:`, error.message);
          if (!this.isTrapFallback && port !== this.trapFallbackPort) {
            console.warn(`[EventPulse] Переключение SNMP Trap на резервный порт :${this.trapFallbackPort}...`);
            this.isTrapFallback = true;
            this.trapPort = this.trapFallbackPort;
            this._startTrapListener(this.trapFallbackPort);
          }
          return;
        }

        if (trap) {
          this.processTrap(trap);
        }
      };

      this.trapReceiver = snmp.createReceiver(receiverOptions, receiverCallback);
      console.log(`[EventPulse] ✓ SNMP Trap ресивер запущен на 0.0.0.0:${port}`);
    } catch (err) {
      console.warn('[EventPulse] Исключение при запуске SNMP Trap ресивера:', err.message);
    }
  }

  /**
   * Matches remote IP address or hostname to a registered switch in database.
   * @param {string} remoteIp
   * @param {Array} switches
   * @returns {Object|null}
   */
  matchSwitch(remoteIp, switches = []) {
    if (!remoteIp) return null;
    const cleanIp = remoteIp.replace(/^::ffff:/, '').trim();

    return switches.find((sw) => {
      const swIp = (sw.ip || '').trim();
      return swIp === cleanIp || sw.name?.toLowerCase() === cleanIp.toLowerCase();
    }) || null;
  }

  /**
   * Processes raw Syslog message string or Buffer.
   * @param {string|Buffer} rawMsg
   * @param {string} remoteIp
   * @returns {Object|null}
   */
  processMessage(rawMsg, remoteIp) {
    this.packetsReceived++;
    const cleanIp = remoteIp.replace(/^::ffff:/, '').trim();

    // Rate limiting to prevent flood crashes
    const limitCheck = this.rateLimiter.checkLimit(cleanIp, 20);
    if (!limitCheck.allowed) {
      if (limitCheck.suppressedCount === 1) {
        console.warn(`[EventPulse] Шторм логов от ${cleanIp}: подавление избыточных сообщений.`);
      }
      return null;
    }

    const parsed = parseSyslogMessage(rawMsg, cleanIp);
    if (!parsed) return null;

    const switches = this.storage?.getSwitches() || [];
    const matchedSwitch = this.matchSwitch(cleanIp, switches);

    const switchId = matchedSwitch ? matchedSwitch.id : null;
    const switchName = matchedSwitch ? matchedSwitch.name : cleanIp;

    // Check link flap detection
    let isFlapping = false;
    let flapCount = 0;
    if (switchId && parsed.portNum && (parsed.type === 'link_down' || parsed.type === 'link_up')) {
      const flapRes = this.flapDetector.recordTransition(switchId, parsed.portNum, parsed.state);
      isFlapping = flapRes.isFlapping;
      flapCount = flapRes.count;
    }

    const level = isFlapping ? 'critical' : parsed.severity;
    const title = isFlapping
      ? `ШТОРМ ЛИНКА (Flapping): ${switchName} [Порт ${parsed.portNum}]`
      : `${parsed.title} (${switchName})`;

    const alertPayload = {
      level,
      severity: level,
      type: isFlapping ? 'link_flapping' : parsed.type,
      title,
      source: `${switchName}${parsed.portName ? ` : ${parsed.portName}` : ''}`,
      desc: isFlapping
        ? `Порт ${parsed.portName || parsed.portNum} переключился ${flapCount} раз за 60 секунд! Возможно повреждение кабеля или коллизия.`
        : (parsed.desc || parsed.raw || parsed.message),
      switchId,
      switchName,
      portNum: parsed.portNum,
      portName: parsed.portName,
      remoteIp: cleanIp,
      vendor: parsed.vendor,
      isFlapping,
      timestamp: new Date().toISOString()
    };

    let savedAlert = alertPayload;
    if (this.storage && typeof this.storage.addAlert === 'function') {
      savedAlert = this.storage.addAlert(alertPayload) || alertPayload;
      this.alertsCreated++;
    }

    this.broadcastEvent(savedAlert);
    return savedAlert;
  }

  /**
   * Processes parsed SNMP Trap object.
   * @param {Object} trap
   */
  processTrap(trap) {
    this.packetsReceived++;
    const remoteIp = trap.rinfo?.address || '0.0.0.0';
    const cleanIp = remoteIp.replace(/^::ffff:/, '').trim();

    const switches = this.storage?.getSwitches() || [];
    const matchedSwitch = this.matchSwitch(cleanIp, switches);
    const switchId = matchedSwitch ? matchedSwitch.id : null;
    const switchName = matchedSwitch ? matchedSwitch.name : cleanIp;

    // Standard trap OIDs
    const trapOid = trap.pdu?.trapType || trap.pdu?.varbinds?.[1]?.value || '';
    const isDown = String(trapOid).includes('.1.5.3') || String(trapOid).includes('linkDown');
    const isUp = String(trapOid).includes('.1.5.4') || String(trapOid).includes('linkUp');

    const alertPayload = {
      level: isDown ? 'critical' : (isUp ? 'info' : 'warning'),
      severity: isDown ? 'critical' : (isUp ? 'info' : 'warning'),
      type: isDown ? 'link_down' : (isUp ? 'link_up' : 'snmp_trap'),
      title: `SNMP Trap: ${isDown ? 'Линк DOWN' : (isUp ? 'Линк UP' : 'Событие')} (${switchName})`,
      source: `${switchName} (SNMP Trap)`,
      desc: `Получен SNMP Trap пакет от ${cleanIp}. OID: ${trapOid}`,
      switchId,
      switchName,
      remoteIp: cleanIp,
      timestamp: new Date().toISOString()
    };

    let savedAlert = alertPayload;
    if (this.storage && typeof this.storage.addAlert === 'function') {
      savedAlert = this.storage.addAlert(alertPayload) || alertPayload;
      this.alertsCreated++;
    }

    this.broadcastEvent(savedAlert);
    return savedAlert;
  }

  /**
   * Generates a synthetic event for end-to-end testing and diagnostics.
   * @param {Object} params
   * @returns {Object}
   */
  simulateEvent({ switchId, portNum = 1, type = 'link_down', message = '' }) {
    const switches = this.storage?.getSwitches() || [];
    const targetSwitch = switches.find(s => String(s.id) === String(switchId)) || switches[0] || {
      id: switchId || 'sw-sim',
      name: 'Simulated-Switch',
      ip: '127.0.0.1',
      vendor: 'SNR'
    };

    const isDown = type === 'link_down';
    const alertPayload = {
      level: isDown ? 'critical' : 'info',
      severity: isDown ? 'critical' : 'info',
      type,
      title: `[ТЕСТ] Линк ${isDown ? 'DOWN' : 'UP'}: Порт ${portNum} (${targetSwitch.name})`,
      source: `${targetSwitch.name}:port${portNum}`,
      desc: message || `Диагностическая симуляция события через Live Event Pulse. Статус: ${type}`,
      switchId: targetSwitch.id,
      switchName: targetSwitch.name,
      portNum: Number(portNum) || 1,
      portName: `Port ${portNum}`,
      remoteIp: targetSwitch.ip || '127.0.0.1',
      vendor: targetSwitch.vendor || 'generic',
      simulated: true,
      timestamp: new Date().toISOString()
    };

    let saved = alertPayload;
    if (this.storage && typeof this.storage.addAlert === 'function') {
      saved = this.storage.addAlert(alertPayload) || alertPayload;
      this.alertsCreated++;
    }

    this.broadcastEvent(saved);
    return saved;
  }

  /**
   * Broadcasts an event to all connected WebSocket clients.
   * @param {Object} event
   */
  broadcastEvent(event) {
    if (!event || this.wsClients.size === 0) return;
    const payload = JSON.stringify({ type: 'event', data: event });

    for (const ws of this.wsClients) {
      try {
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(payload);
        }
      } catch (err) {
        console.warn('[EventPulse] Ошибка отправки WebSocket события:', err.message);
      }
    }
  }

  /**
   * Returns current operational metrics and socket status.
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syslogPort: this.syslogPort,
      isSyslogFallback: this.isSyslogFallback,
      trapPort: this.trapPort,
      isTrapFallback: this.isTrapFallback,
      packetsReceived: this.packetsReceived,
      alertsCreated: this.alertsCreated,
      wsClientsCount: this.wsClients.size
    };
  }

  /**
   * Shuts down sockets and timers.
   */
  async stop() {
    this.isRunning = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    if (this.syslogSocket) {
      try { this.syslogSocket.close(); } catch {}
      this.syslogSocket = null;
    }

    if (this.trapReceiver) {
      try { this.trapReceiver.close(); } catch {}
      this.trapReceiver = null;
    }
  }
}

// Singleton export
export const eventPulseDaemon = new EventPulseDaemon();
