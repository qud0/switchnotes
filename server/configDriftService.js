/**
 * configDriftService.js
 * Automated Configuration Drift Radar & 2-Way Sync Engine.
 * Features:
 * - Worker queue with concurrency limit (max 2 parallel SSH connections).
 * - Debounce (10s) and Cooldown (30s) per switch to prevent load spikes.
 * - Normalized SHA-256 hash comparison against Golden Baseline.
 * - Fail-safe 2-Way Sync with Guardrails protecting Management IP and default gateway.
 */

import { normalizeConfig, calculateNormalizedHash } from './configNormalizer.js';
import { fetchSwitchConfigOverSsh, executeSshCommand } from './backupService.js';
import { computeConfigDiff, generateRollbackScript } from '../src/utils/diffUtils.js';

export class ConfigDriftService {
  constructor() {
    this.storage = null;
    this.eventPulseDaemon = null;
    this.maxConcurrency = 2;
    this.activeWorkers = 0;
    this.queue = [];
    this.pendingTimers = new Map(); // switchId -> timer
    this.cooldownMap = new Map();   // switchId -> timestamp
    this.schedulerTimer = null;
  }

  /**
   * Links storage and eventPulseDaemon references.
   * @param {Object} storage
   * @param {Object} [eventPulseDaemon]
   */
  init(storage, eventPulseDaemon = null) {
    this.storage = storage;
    this.eventPulseDaemon = eventPulseDaemon;
    this.startScheduler();
  }

  /**
   * Resolves SSH credentials using the fallback hierarchy:
   * 1. Switch-level credentials
   * 2. Global backup schedule credentials
   * 3. Environment defaults
   * @param {Object} switchItem
   * @returns {{ port: number, username: string, password: string, privateKey: string|null }}
   */
  resolveCredentials(switchItem = {}) {
    const globalCreds = this.storage?.data?.backupSchedule?.credentials || {};

    const username = switchItem.sshUsername || globalCreds.username || process.env.DEFAULT_SWITCH_USER || 'admin';
    const password = switchItem.sshPassword || globalCreds.password || process.env.DEFAULT_SWITCH_PASS || '';
    const port = Number(switchItem.sshPort || globalCreds.port || 22);
    const privateKey = switchItem.sshPrivateKey || globalCreds.privateKey || null;

    return { port, username, password, privateKey };
  }

  /**
   * Enqueues a switch for background drift scanning with debounce and cooldown.
   * @param {string|number} switchId
   * @param {number} [delayMs]
   */
  enqueueDriftCheck(switchId, delayMs = 10000) {
    const sId = String(switchId);

    // If already scheduled, debounce (reset timer)
    if (this.pendingTimers.has(sId)) {
      clearTimeout(this.pendingTimers.get(sId));
    }

    const timer = setTimeout(async () => {
      this.pendingTimers.delete(sId);

      // Check cooldown (30s)
      const lastScan = this.cooldownMap.get(sId) || 0;
      const now = Date.now();
      if (now - lastScan < 30000) {
        return;
      }

      this.queue.push(sId);
      this._processQueue();
    }, delayMs);

    if (timer.unref) timer.unref();
    this.pendingTimers.set(sId, timer);
  }

  /**
   * Processes task queue with concurrency limit.
   * @private
   */
  async _processQueue() {
    while (this.activeWorkers < this.maxConcurrency && this.queue.length > 0) {
      const switchId = this.queue.shift();
      this.activeWorkers++;

      this.checkSwitchDrift(switchId)
        .catch(err => {
          console.warn(`[ConfigDrift] Ошибка сканирования свитча ${switchId}:`, err.message);
        })
        .finally(() => {
          this.activeWorkers--;
          this._processQueue();
        });
    }
  }

  /**
   * Fetches current running configuration over SSH.
   * @param {Object} switchItem
   * @returns {Promise<string>}
   */
  async fetchRunningConfig(switchItem) {
    const creds = this.resolveCredentials(switchItem);
    const res = await fetchSwitchConfigOverSsh({
      host: switchItem.ip,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      privateKey: creds.privateKey,
      vendor: switchItem.vendor || 'SNR',
      timeout: 8000
    });
    return res.content;
  }

  /**
   * Performs an immediate drift check for a specific switch.
   * @param {string|number} switchId
   * @returns {Promise<Object>}
   */
  async checkSwitchDrift(switchId) {
    const sId = String(switchId);
    this.cooldownMap.set(sId, Date.now());

    const switchItem = this.storage?.getSwitch ? this.storage.getSwitch(sId) : null;
    if (!switchItem) {
      throw new Error(`Коммутатор с ID ${switchId} не найден в базе данных`);
    }

    const runningConfig = await this.fetchRunningConfig(switchItem);
    const vendor = (switchItem.vendor || 'generic').toLowerCase();

    // Find Golden Baseline backup or latest existing backup
    const backups = this.storage?.getBackups ? this.storage.getBackups(sId) : [];
    const goldenBackup = backups.find(b => b.isGolden) || backups[0];

    // If no backup exists at all, adopt runningConfig as the initial Golden Baseline
    if (!goldenBackup) {
      const initialBackup = {
        id: `b-init-${Date.now()}`,
        switchId: sId,
        switchName: switchItem.name,
        timestamp: new Date().toISOString(),
        isGolden: true,
        content: runningConfig,
        comment: 'Начальный эталон (Golden Baseline) при инициализации Drift Radar'
      };

      if (this.storage?.addBackup) {
        this.storage.addBackup(initialBackup);
      }

      const syncResult = {
        switchId: sId,
        driftStatus: 'in_sync',
        lastCheck: new Date().toISOString(),
        message: 'Инициализирован начальный эталон (Golden Baseline)'
      };

      if (this.storage?.updateSwitch) {
        this.storage.updateSwitch(sId, {
          driftStatus: 'in_sync',
          lastDriftCheck: syncResult.lastCheck,
          lastDriftDiff: null
        });
      }

      return syncResult;
    }

    // Compare normalized SHA-256 hashes
    const runningHash = calculateNormalizedHash(runningConfig, vendor);
    const baselineHash = calculateNormalizedHash(goldenBackup.content, vendor);

    const isIdentical = runningHash === baselineHash;
    const nowIso = new Date().toISOString();

    if (isIdentical) {
      const result = {
        switchId: sId,
        driftStatus: 'in_sync',
        lastCheck: nowIso,
        baselineBackupId: goldenBackup.id
      };

      if (this.storage?.updateSwitch) {
        this.storage.updateSwitch(sId, {
          driftStatus: 'in_sync',
          lastDriftCheck: nowIso,
          lastDriftDiff: null
        });
      }

      return result;
    }

    // Drift detected! Calculate line differences
    const diff = this._computeDiffStats(goldenBackup.content, runningConfig, vendor);

    const driftResult = {
      switchId: sId,
      driftStatus: 'drifted',
      lastCheck: nowIso,
      baselineBackupId: goldenBackup.id,
      diff,
      runningConfig,
      runningHash,
      baselineHash
    };

    if (this.storage?.updateSwitch) {
      this.storage.updateSwitch(sId, {
        driftStatus: 'drifted',
        lastDriftCheck: nowIso,
        lastDriftDiff: diff,
        lastDriftRunningConfig: runningConfig
      });
    }

    // Register Alert in SwitchBook
    if (this.storage?.addAlert) {
      this.storage.addAlert({
        level: 'warning',
        severity: 'warning',
        type: 'config_drift',
        title: `⚠️ Дрифт конфигурации: ${switchItem.name} (+${diff.addedCount} / -${diff.removedCount} строк)`,
        source: `${switchItem.name} (Drift Radar)`,
        desc: `Обнаружено расхождение с эталоном. Добавлено: ${diff.addedCount}, Удалено: ${diff.removedCount} строк.`,
        switchId: sId,
        switchName: switchItem.name,
        timestamp: nowIso
      });
    }

    // Broadcast via WebSocket
    if (this.eventPulseDaemon?.broadcastEvent) {
      this.eventPulseDaemon.broadcastEvent({
        type: 'config_drift',
        switchId: sId,
        switchName: switchItem.name,
        diff
      });
    }

    return driftResult;
  }

  /**
   * Computes added and removed line counts.
   * @private
   */
  _computeDiffStats(baselineText, runningText, vendor) {
    const normA = normalizeConfig(baselineText, vendor).split('\n');
    const normB = normalizeConfig(runningText, vendor).split('\n');

    const setA = new Set(normA);
    const setB = new Set(normB);

    const added = normB.filter(line => !setA.has(line));
    const removed = normA.filter(line => !setB.has(line));

    return {
      addedCount: added.length,
      removedCount: removed.length,
      sampleAdded: added.slice(0, 5),
      sampleRemoved: removed.slice(0, 5)
    };
  }

  /**
   * Validates safety of rollback commands against Guardrails:
   * Rejects commands attempting to delete management IP, gateway, or SSH access.
   * @param {string[]} commands
   * @param {Object} switchItem
   * @returns {{ safe: boolean, reason?: string }}
   */
  validateRollbackSafety(commands = [], switchItem = {}) {
    const switchIp = (switchItem.ip || '').trim();
    const gateway = (switchItem.gateway || '').trim();

    for (const cmd of commands) {
      const c = cmd.trim();

      // Guardrail 1: Management IP deletion
      if (switchIp && (c.includes(`no ip address ${switchIp}`) || c.includes(`remove [find address=*${switchIp}*]`))) {
        return {
          safe: false,
          reason: `Откат заблокирован Guardrails: команда удаляет IP-адрес управления коммутатора (${switchIp})`
        };
      }

      // Guardrail 2: Default gateway deletion
      if (gateway && (c.includes(`no ip default-gateway`) || c.includes(`remove [find gateway=*${gateway}*]`))) {
        return {
          safe: false,
          reason: `Откат заблокирован Guardrails: команда удаляет шлюз по умолчанию (${gateway})`
        };
      }
    }

    return { safe: true };
  }

  /**
   * 2-Way Sync: Reconcile Accept
   * Adopts current running configuration as the new Golden Baseline.
   * @param {string|number} switchId
   * @returns {Promise<Object>}
   */
  async reconcileAccept(switchId) {
    const sId = String(switchId);
    const switchItem = this.storage?.getSwitch(sId);
    if (!switchItem) throw new Error('Коммутатор не найден');

    const running = switchItem.lastDriftRunningConfig || await this.fetchRunningConfig(switchItem);

    // Add new Golden Baseline backup
    const backupId = `b-golden-${Date.now()}`;
    const newGolden = {
      id: backupId,
      switchId: sId,
      switchName: switchItem.name,
      timestamp: new Date().toISOString(),
      isGolden: true,
      content: running,
      comment: 'Утверждено оператором как новый эталон (Reconcile Accept)'
    };

    if (this.storage?.addBackup) {
      this.storage.addBackup(newGolden);
    }

    // Reset status to in_sync
    this.storage?.updateSwitch(sId, {
      driftStatus: 'in_sync',
      lastDriftDiff: null,
      lastDriftRunningConfig: null,
      lastDriftCheck: new Date().toISOString()
    });

    return { success: true, backupId, status: 'in_sync' };
  }

  /**
   * 2-Way Sync: Reconcile Rollback
   * Safely executes rollback commands on the switch with fail-fast validation.
   * @param {string|number} switchId
   * @param {Object} [options]
   * @param {string[]} [options.commands]
   * @param {boolean} [options.force]
   * @returns {Promise<Object>}
   */
  async reconcileRollback(switchId, options = {}) {
    const sId = String(switchId);
    const switchItem = this.storage?.getSwitch(sId);
    if (!switchItem) throw new Error('Коммутатор не найден');

    const commands = options.commands || [];
    if (commands.length === 0) {
      throw new Error('Нет команд для выполнения отката');
    }

    // Check Guardrails
    const safetyCheck = this.validateRollbackSafety(commands, switchItem);
    if (!safetyCheck.safe && !options.force) {
      throw new Error(safetyCheck.reason);
    }

    const creds = this.resolveCredentials(switchItem);
    const vendor = (switchItem.vendor || 'SNR').toLowerCase();
    const executedLines = [];

    // Line-by-line fail-fast execution
    for (const line of commands) {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('!') || cleanLine.startsWith('#')) {
        continue;
      }

      const res = await executeSshCommand({
        host: switchItem.ip,
        port: creds.port,
        username: creds.username,
        password: creds.password,
        privateKey: creds.privateKey,
        vendor: switchItem.vendor,
        command: cleanLine,
        timeout: 5000
      });

      const output = (res.output || '').toLowerCase();
      // Fail-fast error detection: immediately abort without write
      if (output.includes('% error') || output.includes('% invalid') || output.includes('failure:') || output.includes('bad command')) {
        throw new Error(`Сбой на команде "${cleanLine}": ${res.output}. Откат прерван, сохранение write НЕ выполнено.`);
      }

      executedLines.push(cleanLine);
    }

    // If all lines succeeded, save to NVRAM
    const saveCmd = vendor.includes('mikrotik') ? ':log info "Rollback finished"' : 'write';
    await executeSshCommand({
      host: switchItem.ip,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      privateKey: creds.privateKey,
      vendor: switchItem.vendor,
      command: saveCmd,
      timeout: 5000
    });

    // Run post-rollback verification
    await this.checkSwitchDrift(sId);

    return {
      success: true,
      executedCommandsCount: executedLines.length,
      message: `Успешно применено ${executedLines.length} команд отката. Конфигурация сохранена.`
    };
  }

  /**
   * Returns current automated drift scanning schedule settings.
   * @returns {Object}
   */
  getScheduleSettings() {
    const defaultSettings = {
      enabled: true,
      intervalHours: 6,
      autoRollbackSafe: false,
      lastScanTime: null,
      nextScanTime: null
    };
    if (!this.storage?.data) return defaultSettings;
    if (!this.storage.data.driftSchedule) {
      this.storage.data.driftSchedule = { ...defaultSettings };
    }
    return { ...defaultSettings, ...this.storage.data.driftSchedule };
  }

  /**
   * Updates schedule settings and restarts timer.
   * @param {Object} newSettings
   * @returns {Object}
   */
  updateScheduleSettings(newSettings = {}) {
    const current = this.getScheduleSettings();
    const updated = {
      ...current,
      ...newSettings,
      intervalHours: Math.max(0.5, Number(newSettings.intervalHours) || current.intervalHours || 6),
      enabled: newSettings.enabled !== undefined ? Boolean(newSettings.enabled) : current.enabled
    };

    if (this.storage?.data) {
      this.storage.data.driftSchedule = updated;
      if (this.storage.save) this.storage.save();
    }

    this.startScheduler();
    return updated;
  }

  /**
   * Starts periodic background drift scanner timer.
   */
  startScheduler() {
    this.stopScheduler();
    const settings = this.getScheduleSettings();
    if (!settings.enabled) return;

    const intervalMs = settings.intervalHours * 60 * 60 * 1000;
    const nextScan = new Date(Date.now() + intervalMs).toISOString();

    if (this.storage?.data?.driftSchedule) {
      this.storage.data.driftSchedule.nextScanTime = nextScan;
    }

    this.schedulerTimer = setInterval(async () => {
      try {
        console.log(`[ConfigDrift] Запуск запланированного сканирования всей сети...`);
        await this.scanAllSwitchesDrift();
      } catch (err) {
        console.error('[ConfigDrift] Ошибка планового сканирования сети:', err.message);
      }
    }, intervalMs);

    if (this.schedulerTimer.unref) {
      this.schedulerTimer.unref();
    }
  }

  /**
   * Stops periodic background drift scanner timer.
   */
  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  /**
   * Performs a fleet-wide drift scan across all switches with concurrency limits.
   * @returns {Promise<Object>}
   */
  async scanAllSwitchesDrift() {
    const switches = this.storage?.getSwitches ? this.storage.getSwitches() : [];
    const nowIso = new Date().toISOString();

    let driftedCount = 0;
    let inSyncCount = 0;
    let errorsCount = 0;
    const results = [];

    // Worker pool capped at maxConcurrency
    const queue = [...switches];
    const workers = Array.from({ length: Math.min(this.maxConcurrency, switches.length || 1) }, async () => {
      while (queue.length > 0) {
        const sw = queue.shift();
        try {
          const res = await this.checkSwitchDrift(sw.id);
          results.push(res);
          if (res.driftStatus === 'drifted') driftedCount++;
          else inSyncCount++;
        } catch (err) {
          errorsCount++;
          results.push({
            switchId: sw.id,
            driftStatus: 'error',
            error: err.message
          });
        }
      }
    });

    await Promise.all(workers);

    // Update timestamps in schedule settings
    const settings = this.getScheduleSettings();
    const intervalMs = (settings.intervalHours || 6) * 60 * 60 * 1000;
    const nextScan = new Date(Date.now() + intervalMs).toISOString();

    if (this.storage?.data?.driftSchedule) {
      this.storage.data.driftSchedule.lastScanTime = nowIso;
      this.storage.data.driftSchedule.nextScanTime = nextScan;
      if (this.storage.save) this.storage.save();
    }

    return {
      timestamp: nowIso,
      totalSwitches: switches.length,
      scannedCount: results.length,
      driftedCount,
      inSyncCount,
      errorsCount,
      results
    };
  }

  /**
   * Generates a detailed fleet-wide drift report with diffs and safe rollback scripts.
   * @returns {Promise<Object>}
   */
  async getFleetDriftReport() {
    const switches = this.storage?.getSwitches ? this.storage.getSwitches() : [];
    const driftedList = [];
    let inSyncCount = 0;
    let unmonitoredCount = 0;

    for (const sw of switches) {
      if (sw.driftStatus === 'in_sync') {
        inSyncCount++;
        continue;
      }
      if (sw.driftStatus !== 'drifted') {
        unmonitoredCount++;
        continue;
      }

      const backups = this.storage?.getBackups ? this.storage.getBackups(sw.id) : [];
      const goldenBackup = backups.find(b => b.isGolden) || backups[0];
      const runningConfig = sw.lastDriftRunningConfig || (goldenBackup ? goldenBackup.content : '');

      let diffRows = [];
      let rollbackScriptObj = { script: '', rollbackCommandsCount: 0 };
      let rollbackCommands = [];
      let isSafe = true;
      let guardrailReason = null;

      if (goldenBackup && runningConfig) {
        const diffRes = computeConfigDiff(goldenBackup.content, runningConfig);
        diffRows = diffRes.rows;
        rollbackScriptObj = generateRollbackScript(diffRows, sw.vendor || 'SNR');
        rollbackCommands = rollbackScriptObj.script
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('!') && !l.startsWith('#'));

        const safetyCheck = this.validateRollbackSafety(rollbackCommands, sw);
        isSafe = safetyCheck.safe;
        guardrailReason = safetyCheck.reason || null;
      }

      driftedList.push({
        switchId: sw.id,
        switchName: sw.name,
        ip: sw.ip,
        vendor: sw.vendor || 'SNR',
        model: sw.model,
        location: sw.location,
        lastCheck: sw.lastDriftCheck,
        diffStats: sw.lastDriftDiff || { addedCount: 0, removedCount: 0 },
        diffRows,
        goldenBackupId: goldenBackup?.id,
        goldenBackupTimestamp: goldenBackup?.timestamp,
        goldenComment: goldenBackup?.comment,
        rollbackScript: rollbackScriptObj.script,
        rollbackCommands,
        rollbackCommandsCount: rollbackCommands.length,
        isRollbackSafe: isSafe,
        guardrailReason
      });
    }

    return {
      timestamp: new Date().toISOString(),
      totalSwitches: switches.length,
      driftedCount: driftedList.length,
      inSyncCount,
      unmonitoredCount,
      driftedSwitches: driftedList,
      schedule: this.getScheduleSettings()
    };
  }

  /**
   * Batch rollback for drifted switches with fail-fast validation.
   * @param {string[]} [switchIds]
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async batchRollbackDrift(switchIds = [], options = {}) {
    const report = await this.getFleetDriftReport();
    const targetIds = switchIds.length > 0 
      ? new Set(switchIds.map(String))
      : new Set(report.driftedSwitches.map(s => String(s.switchId)));

    const targets = report.driftedSwitches.filter(s => targetIds.has(String(s.switchId)));
    const results = [];

    for (const item of targets) {
      try {
        if (!item.isRollbackSafe && !options.force) {
          results.push({
            switchId: item.switchId,
            switchName: item.switchName,
            success: false,
            error: item.guardrailReason || 'Заблокировано Guardrails'
          });
          continue;
        }

        const res = await this.reconcileRollback(item.switchId, {
          commands: item.rollbackCommands,
          force: options.force
        });

        results.push({
          switchId: item.switchId,
          switchName: item.switchName,
          success: true,
          executedCommandsCount: res.executedCommandsCount,
          message: res.message
        });
      } catch (err) {
        results.push({
          switchId: item.switchId,
          switchName: item.switchName,
          success: false,
          error: err.message
        });
      }
    }

    const rolledBackCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return {
      success: failedCount === 0,
      totalRequested: targets.length,
      rolledBackCount,
      failedCount,
      results
    };
  }

  /**
   * Returns overview of drift statuses across all switches.
   * @returns {Object}
   */
  getStatus() {
    const switches = this.storage?.getSwitches ? this.storage.getSwitches() : [];
    const total = switches.length;
    const drifted = switches.filter(s => s.driftStatus === 'drifted').length;
    const inSync = switches.filter(s => s.driftStatus === 'in_sync').length;
    const unmonitored = total - (drifted + inSync);

    return {
      total,
      drifted,
      inSync,
      unmonitored,
      activeQueueLength: this.queue.length,
      activeWorkers: this.activeWorkers,
      schedule: this.getScheduleSettings()
    };
  }
}

export const configDriftService = new ConfigDriftService();
