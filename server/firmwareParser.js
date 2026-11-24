/**
 * Firmware & Health Parser Engine for SNR NAG (SNR-OS) and MikroTik RouterOS
 */

/**
 * Converts size string (e.g. "48.5MiB", "128.0MiB", "1.2GiB", "1024KiB") to bytes
 * @param {string} str
 * @returns {number}
 */
export function sizeStringToBytes(str) {
  if (!str) return 0;
  const match = str.trim().match(/^([0-9.]+)\s*([a-zA-Z]*)$/);
  if (!match) return 0;

  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('g')) return Math.round(val * 1024 * 1024 * 1024);
  if (unit.startsWith('m')) return Math.round(val * 1024 * 1024);
  if (unit.startsWith('k')) return Math.round(val * 1024);
  return Math.round(val);
}

/**
 * Parses SNR-OS 'dir' flash directory output
 * @param {string} raw
 * @returns {{ freeBytes: number, totalBytes: number }}
 */
export function parseSnrFlashSpace(raw) {
  if (!raw || typeof raw !== 'string') {
    return { freeBytes: 0, totalBytes: 0 };
  }

  // e.g. "16777216 bytes total (4898880 bytes free)"
  const totalFreeMatch = raw.match(/(\d+)\s+bytes\s+total\s*\((\d+)\s+bytes\s+free\)/i);
  if (totalFreeMatch) {
    return {
      totalBytes: parseInt(totalFreeMatch[1], 10),
      freeBytes: parseInt(totalFreeMatch[2], 10)
    };
  }

  // Alternative SNR formats
  const freeMatch = raw.match(/(\d+)\s+bytes\s+free/i);
  const totalMatch = raw.match(/(\d+)\s+bytes\s+total/i);

  return {
    totalBytes: totalMatch ? parseInt(totalMatch[1], 10) : 0,
    freeBytes: freeMatch ? parseInt(freeMatch[1], 10) : 0
  };
}

/**
 * Parses SNR-OS 'show version' output
 * @param {string} raw
 * @returns {{ version: string, model: string }}
 */
export function parseSnrVersion(raw) {
  if (!raw || typeof raw !== 'string') {
    return { version: 'Unknown', model: 'Unknown' };
  }

  let model = 'Unknown';
  let version = 'Unknown';

  const modelMatch = raw.match(/^([^\s,\r\n]+)\s+(?:Device|Switch)/im);
  if (modelMatch) {
    model = modelMatch[1].trim();
  }

  const verMatch = raw.match(/SoftWare\s+Version\s+([^\r\n]+)/i);
  if (verMatch) {
    version = verMatch[1].trim();
  }

  return { version, model };
}

/**
 * Parses MikroTik RouterOS '/system resource print'
 * @param {string} raw
 * @returns {{ version: string, freeHddBytes: number, totalHddBytes: number, architecture: string, model: string }}
 */
export function parseMikrotikResource(raw) {
  if (!raw || typeof raw !== 'string') {
    return {
      version: 'Unknown',
      freeHddBytes: 0,
      totalHddBytes: 0,
      architecture: 'Unknown',
      model: 'Unknown'
    };
  }

  let version = 'Unknown';
  let freeHddBytes = 0;
  let totalHddBytes = 0;
  let architecture = 'Unknown';
  let model = 'Unknown';

  const verMatch = raw.match(/version:\s*([^\s(\r\n]+)/i);
  if (verMatch) version = verMatch[1].trim();

  const freeHddMatch = raw.match(/free-hdd-space:\s*([^\r\n]+)/i);
  if (freeHddMatch) freeHddBytes = sizeStringToBytes(freeHddMatch[1]);

  const totalHddMatch = raw.match(/total-hdd-space:\s*([^\r\n]+)/i);
  if (totalHddMatch) totalHddBytes = sizeStringToBytes(totalHddMatch[1]);

  const archMatch = raw.match(/architecture-name:\s*([^\s\r\n]+)/i);
  if (archMatch) architecture = archMatch[1].trim();

  const boardMatch = raw.match(/board-name:\s*([^\r\n]+)/i);
  if (boardMatch) model = boardMatch[1].trim();

  return {
    version,
    freeHddBytes,
    totalHddBytes,
    architecture,
    model
  };
}

/**
 * Parses gateway/internet ICMP ping reachability output
 * @param {string} raw
 * @param {string} vendor
 * @returns {{ isHealthy: boolean, issues: string[] }}
 */
export function parseHealthCheckOutput(raw, vendor = 'SNR') {
  const issues = [];
  if (!raw || typeof raw !== 'string') {
    return { isHealthy: false, issues: ['Нет ответа от коммутатора при проверке доступности шлюза'] };
  }

  const v = (vendor || '').toLowerCase();

  if (v.includes('mikrotik')) {
    const lossMatch = raw.match(/packet-loss=([0-9.]+)%/i);
    if (lossMatch) {
      const loss = parseFloat(lossMatch[1]);
      if (loss > 50) {
        issues.push(`Потеря пакетов до шлюза: ${loss}%`);
      }
    } else if (/timeout|failure|error/i.test(raw)) {
      issues.push('Таймаут пинга шлюза RouterOS');
    }
  } else {
    // SNR / Cisco format: "Success rate is X percent"
    const rateMatch = raw.match(/Success\s+rate\s+is\s+([0-9.]+)\s+percent/i);
    if (rateMatch) {
      const rate = parseFloat(rateMatch[1]);
      if (rate < 50) {
        issues.push(`Низкий процент успешных эхо-ответов: ${rate}%`);
      }
    } else if (raw.includes('.....') || raw.includes('timed out')) {
      issues.push('Таймаут эхо-запросов ICMP на SNR-OS');
    }
  }

  return {
    isHealthy: issues.length === 0,
    issues
  };
}
