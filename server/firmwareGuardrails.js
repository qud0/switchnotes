/**
 * Firmware Rollout Guardrails & CLI Command Generator
 * Enforces flash memory safety margins, Canary role separation,
 * and generates vendor-specific CLI pre-flight backups and boot configuration.
 */

/**
 * Validates pre-flight conditions before allowing firmware upload or reload
 * @param {{
 *   switchObj: object,
 *   firmwareInfo: object,
 *   flashStatus: { freeBytes: number, totalBytes: number },
 *   isCanary?: boolean
 * }} param0
 * @returns {{ canUpgrade: boolean, violations: string[], warnings: string[], requiredSpaceBytes: number }}
 */
export function validatePreflight({
  switchObj,
  firmwareInfo,
  flashStatus,
  isCanary = false
}) {
  const violations = [];
  const warnings = [];

  if (!switchObj) {
    violations.push('Коммутатор не найден в базе SwitchBook');
    return { canUpgrade: false, violations, warnings, requiredSpaceBytes: 0 };
  }

  if (!firmwareInfo) {
    violations.push('Информация о прошивке не указана');
    return { canUpgrade: false, violations, warnings, requiredSpaceBytes: 0 };
  }

  // 1. Vendor & Model Compatibility Check
  const swVendor = (switchObj.vendor || '').trim().toLowerCase();
  const fwVendor = (firmwareInfo.vendor || '').trim().toLowerCase();

  if (swVendor && fwVendor && !swVendor.includes(fwVendor) && !fwVendor.includes(swVendor)) {
    violations.push(`Несовместимый вендор: прошивка ${firmwareInfo.vendor} не подходит для ${switchObj.vendor}`);
  }

  // 2. Flash Space Check (Required = firmware size * 1.25 safety margin)
  const sizeBytes = firmwareInfo.sizeBytes || 0;
  const requiredSpaceBytes = Math.round(sizeBytes * 1.25);
  const freeBytes = flashStatus?.freeBytes || 0;

  if (freeBytes < requiredSpaceBytes) {
    const freeMb = (freeBytes / (1024 * 1024)).toFixed(1);
    const reqMb = (requiredSpaceBytes / (1024 * 1024)).toFixed(1);
    violations.push(
      `Недостаточно свободной памяти на flash: свободно ${freeMb} MB, требуется ${reqMb} MB (с учетом 25% буфера безопасности)`
    );
  }

  // 3. Canary Role Protection (Core/Distribution switches cannot be Canary pilots)
  const swRole = (switchObj.role || '').toLowerCase();
  const swName = (switchObj.name || '').toLowerCase();
  const isCore = swRole === 'core' || swRole === 'distribution' || swName.includes('core') || swName.includes('dist');

  if (isCanary && isCore) {
    violations.push(
      `Коммутатор ядра/распределения "${switchObj.name}" не может использоваться в качестве Canary-пилота! Выберите коммутатор уровня доступа (Access).`
    );
  }

  // 4. Same Version Warning
  if (switchObj.firmwareVersion && firmwareInfo.version && switchObj.firmwareVersion === firmwareInfo.version) {
    warnings.push(`На коммутаторе уже установлена версия ${firmwareInfo.version}`);
  }

  return {
    canUpgrade: violations.length === 0,
    violations,
    warnings,
    requiredSpaceBytes
  };
}

/**
 * Generates vendor-specific pre-upgrade backup command
 * @param {string} vendor
 * @returns {string}
 */
export function generatePreUpgradeBackupCommand(vendor = 'SNR') {
  const v = (vendor || '').toLowerCase();
  if (v.includes('mikrotik')) {
    return '/system backup save name=pre-upgrade-backup\n/export file=pre-upgrade-export\n';
  }
  // SNR NAG / Cisco
  return 'copy running-config startup-config\n';
}

/**
 * Generates vendor-specific boot system configuration commands
 * @param {string} vendor
 * @param {string} filename
 * @param {string} [backupFilename]
 * @returns {string[]}
 */
export function generateBootImageCommands(vendor = 'SNR', filename, backupFilename = '') {
  const v = (vendor || '').toLowerCase();
  const commands = [];

  if (v.includes('mikrotik')) {
    // RouterOS boots packages automatically upon reboot, but routerboard firmware is upgraded:
    commands.push('/system routerboard upgrade\n');
  } else {
    // SNR NAG (SNR-OS)
    commands.push(`boot system flash:${filename}\n`);
    if (backupFilename) {
      commands.push(`boot backup flash:${backupFilename}\n`);
    }
  }

  return commands;
}
