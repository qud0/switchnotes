/**
 * configNormalizer.js
 * Sanitizes running configuration texts by stripping volatile dynamic metadata
 * (export timestamps, NTP phase adjustments, certificate expirations) before
 * hashing and diff calculation to prevent false positives.
 */

import crypto from 'crypto';

/**
 * Normalizes configuration text by stripping vendor-specific dynamic lines.
 * @param {string} content - Raw configuration text
 * @param {string} [vendor] - 'mikrotik' | 'snr' | 'cisco' | generic
 * @returns {string} Normalized configuration text
 */
export function normalizeConfig(content, vendor = 'generic') {
  if (!content || typeof content !== 'string') return '';
  const v = (vendor || '').toLowerCase();

  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '');

  if (v.includes('mikrotik')) {
    // 1. Strip export date/time header: "# nov/24/2026 14:00:00 by RouterOS ..."
    text = text.replace(/^#\s+[a-z]{3}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+by\s+RouterOS.*$/gmi, '');
    // 2. Strip hardware and software identifiers
    text = text.replace(/^#\s+(?:software id|serial number|model)\s*=.*$/gmi, '');
    // 3. Strip certificate dynamic validity attributes
    text = text.replace(/\s+expires-after=\S+/gi, '');
    text = text.replace(/\s+invalid-(?:after|before)="[^"]*"/gi, '');
    // 4. Strip empty comment lines
    text = text.replace(/^#\s*$/gm, '');
  } else if (v.includes('snr') || v.includes('cisco') || v.includes('eltex')) {
    // 1. Strip current config byte size, last change timestamp, NVRAM and time comments
    text = text.replace(/^!\s*(?:Current configuration|Last configuration change|NVRAM config last updated|Time:).*$/gmi, '');
    // 2. Strip NTP phase drift clock-period
    text = text.replace(/^ntp clock-period\s+\d+.*$/gmi, '');
    // 3. Strip standalone exclamation comments
    text = text.replace(/^!\s*$/gm, '');
  }

  // Common cleanups:
  // Split into lines, trim end of each line, remove empty lines
  const lines = text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0);

  return lines.join('\n');
}

/**
 * Computes SHA-256 hash of normalized configuration.
 * @param {string} content
 * @param {string} [vendor]
 * @returns {string} Hex SHA-256 hash
 */
export function calculateNormalizedHash(content, vendor = 'generic') {
  const normalized = normalizeConfig(content, vendor);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
