/**
 * eventPulseParser.js
 * Specialized message parser for Syslog and SNMP Traps from SNR NAG and MikroTik RouterOS.
 * Includes Link Flap Detector and Event Rate Limiter.
 */

/**
 * Parses raw Syslog text or Buffer into a structured event.
 * @param {string|Buffer} raw
 * @param {string} remoteIp
 * @returns {Object|null}
 */
export function parseSyslogMessage(raw, remoteIp = '0.0.0.0') {
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : raw.toString('utf8');
  const cleanStr = str.trim();

  // Extract <PRI> if present (RFC 3164 / 5424)
  let body = cleanStr;
  let pri = null;
  const priMatch = cleanStr.match(/^<(\d{1,3})>(.*)$/s);
  if (priMatch) {
    pri = Number.parseInt(priMatch[1], 10);
    body = priMatch[2].trim();
  }

  // Strip optional ISO timestamp / host prefix in body if present:
  // e.g. "2026-11-24T02:00:00: %LINK..." or "Nov 24 02:00:00 myhost %LINK..."
  const prefixMatch = body.match(/^(?:\d{4}-\d{2}-\d{2}T[\d:\.\+\-]+:?|[A-Za-z]{3}\s+\d+\s+[\d:]+)\s+(?:[\w\.\-]+\s+)?(.*)$/s);
  if (prefixMatch) {
    body = prefixMatch[1].trim();
  }

  // =========================================================================
  // 1. SNR NAG (SNR-OS) Patterns
  // =========================================================================

  // %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to down
  const snrLinkMatch = body.match(/%LINK-[0-7]-UPDOWN:\s+Interface\s+([A-Za-z]+(?:\d+\/\d+\/(\d+)|\d+\/(\d+)|(\d+))),?\s+changed\s+state\s+to\s+(down|up)/i);
  if (snrLinkMatch) {
    const fullPortName = snrLinkMatch[1];
    const portNum = Number.parseInt(snrLinkMatch[2] || snrLinkMatch[3] || snrLinkMatch[4], 10) || null;
    const state = snrLinkMatch[5].toLowerCase();
    const isDown = state === 'down';

    return {
      vendor: 'snr',
      type: isDown ? 'link_down' : 'link_up',
      severity: isDown ? 'critical' : 'info',
      title: isDown ? `Линк DOWN: ${fullPortName}` : `Линк UP: ${fullPortName}`,
      portName: fullPortName,
      portNum,
      state,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // %PORT-5-LOOP_DETECT: Loop detected on port GigabitEthernet1/0/12
  const snrLoopMatch = body.match(/%PORT-[0-7]-LOOP_DETECT:\s+Loop\s+detected\s+on\s+port\s+([A-Za-z]+(?:\d+\/\d+\/(\d+)|\d+\/(\d+)|(\d+)))/i);
  if (snrLoopMatch) {
    const fullPortName = snrLoopMatch[1];
    const portNum = Number.parseInt(snrLoopMatch[2] || snrLoopMatch[3] || snrLoopMatch[4], 10) || null;

    return {
      vendor: 'snr',
      type: 'loop_detect',
      severity: 'critical',
      title: `ПЕТЛЯ (Loop Detect): ${fullPortName}`,
      portName: fullPortName,
      portNum,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // %SYS-5-CONFIG_I: Configured from console by admin
  const snrConfigMatch = body.match(/%SYS-[0-7]-CONFIG_I:\s+Configured\s+from\s+(.*?)\s+by\s+(.*)/i);
  if (snrConfigMatch) {
    return {
      vendor: 'snr',
      type: 'config_change',
      severity: 'warning',
      title: `Изменение конфигурации (SNR)`,
      desc: `Настройки изменены через ${snrConfigMatch[1]} пользователем ${snrConfigMatch[2]}`,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // =========================================================================
  // 2. MikroTik RouterOS Patterns
  // =========================================================================

  // interface,info ether3 link down / link up (speed 1G...)
  const mtLinkMatch = body.match(/interface,(?:info|warning)\s+(?:ether|sfp-sfpplus|sfp)?(\d+)[:\s]+link\s+(down|up)/i);
  if (mtLinkMatch) {
    const portNum = Number.parseInt(mtLinkMatch[1], 10);
    const state = mtLinkMatch[2].toLowerCase();
    const isDown = state === 'down';
    const portName = `ether${portNum}`;

    return {
      vendor: 'mikrotik',
      type: isDown ? 'link_down' : 'link_up',
      severity: isDown ? 'critical' : 'info',
      title: isDown ? `Линк DOWN: ${portName}` : `Линк UP: ${portName}`,
      portName,
      portNum,
      state,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // stp,info ether1 topology change
  const mtStpMatch = body.match(/stp,(?:info|warning)\s+(?:ether|sfp-sfpplus|sfp)?(\d+)[:\s]+topology\s+change/i);
  if (mtStpMatch) {
    const portNum = Number.parseInt(mtStpMatch[1], 10);
    const portName = `ether${portNum}`;

    return {
      vendor: 'mikrotik',
      type: 'stp_change',
      severity: 'warning',
      title: `STP Topology Change: ${portName}`,
      portName,
      portNum,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // system,error,critical login failure for user admin
  const mtLoginMatch = body.match(/system,error(?:,critical)?\s+login\s+failure\s+for\s+user\s+(\w+)/i);
  if (mtLoginMatch) {
    return {
      vendor: 'mikrotik',
      type: 'login_failure',
      severity: 'warning',
      title: `Ошибка входа: пользователь ${mtLoginMatch[1]}`,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // system,info device configuration changed by admin via winbox / ssh
  const mtConfigMatch = body.match(/system,info(?:,account)?.*?(?:configuration changed|logged in and changed)/i);
  if (mtConfigMatch) {
    return {
      vendor: 'mikrotik',
      type: 'config_change',
      severity: 'warning',
      title: `Изменение конфигурации (MikroTik)`,
      desc: body,
      remoteIp,
      raw: cleanStr,
      timestamp: new Date().toISOString()
    };
  }

  // Generic fallback event
  return {
    vendor: 'generic',
    type: 'syslog',
    severity: pri !== null && pri <= 163 ? 'warning' : 'info',
    title: `Событие Syslog от ${remoteIp}`,
    message: body,
    remoteIp,
    raw: cleanStr,
    timestamp: new Date().toISOString()
  };
}

/**
 * Tracks port transitions over a rolling window (default 60s) to detect link flapping.
 */
export class LinkFlapDetector {
  constructor(windowMs = 60000, threshold = 3) {
    this.windowMs = windowMs;
    this.threshold = threshold;
    // Map: `${switchId}:${portNum}` -> Array<number> (timestamps)
    this.transitions = new Map();
  }

  /**
   * Records a link state transition.
   * @param {string|number} switchId
   * @param {number} portNum
   * @param {'up'|'down'} state
   * @returns {{ isFlapping: boolean, count: number }}
   */
  recordTransition(switchId, portNum, state) {
    const key = `${switchId}:${portNum}`;
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let history = this.transitions.get(key) || [];
    history = history.filter(t => t > cutoff);
    history.push(now);
    this.transitions.set(key, history);

    const count = history.length;
    const isFlapping = count >= this.threshold;

    return { isFlapping, count };
  }

  /**
   * Cleans up expired transition records to prevent memory leaks.
   */
  clearExpired(maxAgeMs = 60000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, history] of this.transitions.entries()) {
      const active = history.filter(t => t > cutoff);
      if (active.length === 0) {
        this.transitions.delete(key);
      } else {
        this.transitions.set(key, active);
      }
    }
  }
}

/**
 * Per-source rate limiter to prevent flooding from syslog/trap storms.
 */
export class EventRateLimiter {
  constructor() {
    this.records = new Map();
  }

  /**
   * Checks if an event from a key is allowed within the current second.
   * @param {string} key
   * @param {number} limitPerSec
   * @returns {{ allowed: boolean, suppressedCount: number }}
   */
  checkLimit(key, limitPerSec = 20) {
    const now = Date.now();
    let rec = this.records.get(key);

    if (!rec || now - rec.windowStart >= 1000) {
      rec = { windowStart: now, count: 1, suppressed: 0 };
      this.records.set(key, rec);
      return { allowed: true, suppressedCount: 0 };
    }

    if (rec.count < limitPerSec) {
      rec.count++;
      return { allowed: true, suppressedCount: 0 };
    }

    rec.suppressed++;
    return { allowed: false, suppressedCount: rec.suppressed };
  }
}
