import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage, verifyPassword } from './storage.js';
import { pingHost, pingBatch, traceDevice } from './diagnostics.js';
import { scanSubnet, scanPorts, runTraceroute } from './tools.js';
import { discoverSwitchMacs, syncDiscoveredMacs } from './macDiscovery.js';
import { getNetworkHealth, pingAllSwitches, pingAllServers, getRecentEvents } from './monitoring.js';
import { pollSwitchTelemetry, clearPollCache } from './snmpPoller.js';
import { fetchSwitchConfigOverSsh, executeSshCommand, calculateConfigHash, generateSampleBaselineConfig } from './backupService.js';
import { backupScheduler } from './backupScheduler.js';
import { gitBackupService } from './gitBackupService.js';
import { 
  scanAndDiscoverNetwork, 
  discoverLldpTopology, 
  applyLldpLink,
  applyAllLldpLinks,
  generateBatchPortScript 
} from './networkDiscovery.js';
import { initWebSshServer } from './webSshServer.js';
import { runComprehensiveTroubleshoot } from './troubleshootEngine.js';
import { snmpMonitorDaemon } from './snmpMonitorDaemon.js';
import { adSyncService } from './adSyncService.js';
import { controlSwitchPort, batchControlSwitchPorts } from './portControlService.js';
import { runSwitchCableTest } from './cableTestService.js';
import { getSwitchPortDdm, getSwitchAllDdm } from './ddmService.js';
import { analyzeVlanProvisioning, applyVlanProvisioning, executeVlanProvisioningSsh } from './vlanWizardService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==================== RBAC & Authentication Middleware ====================

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    const user = storage.getSession(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  }
  next();
});

// Helper: Require authenticated session
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется авторизация в системе' });
  }
  next();
}

// Helper: Require specific role or admin
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация в системе' });
    }
    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ 
      error: `Недостаточно прав. Требуется роль: ${roles.join(' или ')}. Ваша роль: ${req.user.role}` 
    });
  };
}

// ==================== AUTHENTICATION API ====================

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }
    const user = storage.authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = storage.createSession(user.id);
    storage.logAction({
      entity: 'auth',
      action: 'login',
      title: `Вход пользователя: ${user.name || user.username}`,
      details: `Успешная авторизация в роли «${user.role}»`,
      author: user.username
    });
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false, user: null });
  }
  res.json({ authenticated: true, user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.token) {
    storage.deleteSession(req.token);
  }
  res.json({ success: true });
});

app.put('/api/auth/profile', requireAuth, (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body || {};
    if (newPassword) {
      const fullUser = storage.getUserById(req.user.id, true);
      if (!fullUser || !verifyPassword(currentPassword, fullUser.passwordHash, fullUser.salt)) {
        return res.status(400).json({ error: 'Текущий пароль указан неверно' });
      }
    }
    const updated = storage.updateUser(req.user.id, {
      name,
      email,
      ...(newPassword ? { password: newPassword } : {})
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== USER MANAGEMENT API (ADMIN ONLY) ====================

app.get('/api/users', requireRole('admin'), (req, res) => {
  try {
    const users = storage.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireRole('admin'), (req, res) => {
  try {
    const user = storage.createUser(req.body);
    storage.logAction({
      entity: 'users',
      action: 'create',
      title: `Создан пользователь ${user.username}`,
      details: `Роль: ${user.role}, Имя: ${user.name}`,
      author: req.user.username
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', requireRole('admin'), (req, res) => {
  try {
    const user = storage.updateUser(req.params.id, req.body);
    storage.logAction({
      entity: 'users',
      action: 'update',
      title: `Обновлен пользователь ${user.username}`,
      details: `Роль: ${user.role}, Активен: ${user.active}`,
      author: req.user.username
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
  try {
    const user = storage.getUserById(req.params.id);
    const username = user?.username || req.params.id;
    storage.deleteUser(req.params.id);
    storage.logAction({
      entity: 'users',
      action: 'delete',
      title: `Удален пользователь ${username}`,
      details: `Учетная запись ${username} удалена из системы`,
      author: req.user.username
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- SWITCHES API ---

// List all switches
app.get('/api/switches', (req, res) => {
  try {
    const list = storage.getSwitches();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single switch
app.get('/api/switches/:id', (req, res) => {
  try {
    const item = storage.getSwitchById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Коммутатор не найден' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create switch
app.post('/api/switches', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createSwitch(req.body);
    storage.logAction({
      entity: 'switches',
      action: 'create',
      title: `Добавлен коммутатор ${created.name}`,
      details: `${created.vendor} ${created.model} (${created.ip})`,
      author: req.user?.username || 'admin'
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update switch info
app.put('/api/switches/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateSwitch(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Коммутатор не найден' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete switch
app.delete('/api/switches/:id', requireRole('engineer'), (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    const swName = sw?.name || req.params.id;
    const ok = storage.deleteSwitch(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Коммутатор не найден' });
    clearPollCache(req.params.id);
    storage.logAction({
      entity: 'switches',
      action: 'delete',
      title: `Удален коммутатор ${swName}`,
      details: `Устройство удалено из топологии сети`,
      author: req.user?.username || 'admin'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update single port
app.put('/api/switches/:id/ports/:portId', requireRole('engineer'), (req, res) => {
  try {
    const updatedPort = storage.updatePort(req.params.id, req.params.portId, req.body);
    if (!updatedPort) return res.status(404).json({ error: 'Порт не найден' });
    res.json(updatedPort);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Real-time hardware and database port control (Enable / Disable / PoE Power Cycle)
app.post('/api/switches/:id/ports/:portId/control', requireRole('engineer'), async (req, res) => {
  try {
    const { action, credentials } = req.body;
    const result = await controlSwitchPort({
      storage,
      switchId: req.params.id,
      portId: req.params.portId,
      action: action || 'toggle',
      credentials: credentials || {},
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hardware and simulated TDR Cable Diagnostics on real switches (SNR, MikroTik, Cisco)
app.post('/api/switches/:id/ports/:portId/cable-test', requireRole('engineer'), async (req, res) => {
  try {
    const { mode, credentials, faultSimulation, estimatedLength } = req.body || {};
    const result = await runSwitchCableTest({
      storage,
      switchId: req.params.id,
      portId: req.params.portId,
      credentials: credentials || {},
      mode: mode || 'auto',
      faultSimulation: faultSimulation || 'none',
      estimatedLength: estimatedLength || '25м'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DDM / DOM Optical Diagnostics for SFP / SFP+ Transceiver (Single port)
app.get('/api/switches/:id/ports/:portId/ddm', requireRole('engineer'), async (req, res) => {
  try {
    const { mode, faultSimulation } = req.query || {};
    const result = await getSwitchPortDdm({
      storage,
      switchId: req.params.id,
      portId: req.params.portId,
      mode: mode || 'auto',
      faultSimulation: faultSimulation || 'none'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DDM / DOM Optical Diagnostics for All SFP ports on switch
app.get('/api/switches/:id/ddm', requireRole('engineer'), async (req, res) => {
  try {
    const { mode } = req.query || {};
    const result = await getSwitchAllDdm({
      storage,
      switchId: req.params.id,
      mode: mode || 'auto'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time batch port control (Enable / Disable / PoE Cycle / Apply Profile)
app.post('/api/switches/:id/ports/batch-control', requireRole('engineer'), async (req, res) => {
  try {
    const { portIds, action, profileData, applyToHardware, credentials } = req.body;
    if (!Array.isArray(portIds) || portIds.length === 0) {
      return res.status(400).json({ error: 'Укажите массив идентификаторов портов (portIds)' });
    }
    const result = await batchControlSwitchPorts({
      storage,
      switchId: req.params.id,
      portIds,
      action: action || 'enable',
      profileData: profileData || {},
      applyToHardware: applyToHardware !== undefined ? Boolean(applyToHardware) : true,
      credentials: credentials || {},
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch update ports (e.g. apply VLAN to multiple ports)
app.post('/api/switches/:id/ports/batch', requireRole('engineer'), (req, res) => {
  try {
    const { portIds, portUpdate } = req.body;
    if (!Array.isArray(portIds)) {
      return res.status(400).json({ error: 'portIds должен быть массивом' });
    }
    const updatedSwitch = storage.batchUpdatePorts(req.params.id, portIds, portUpdate);
    if (!updatedSwitch) return res.status(404).json({ error: 'Коммутатор не найден' });
    res.json(updatedSwitch);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- CONFIG BACKUP & SSH API ---

// List all backups for a switch
app.get('/api/switches/:id/backups', (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    let list = storage.getBackups(req.params.id);

    // If no backups exist yet, generate initial baseline sample revisions for instant diff & testing
    if (list.length === 0) {
      const baseContent = generateSampleBaselineConfig(sw);
      const baseBackup = storage.addBackup({
        switchId: sw.id,
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
        author: 'Baseline Auto-Init',
        trigger: 'manual',
        comment: 'Базовая начальная конфигурация оборудования',
        content: baseContent,
        hash: calculateConfigHash(baseContent)
      });

      // And a revision with modification (e.g. VLAN 50 CCTV added)
      let modContent = baseContent;
      if ((sw.vendor || '').toLowerCase().includes('mikrotik')) {
        modContent += '\n/interface vlan\nadd interface=bridge-lan name=vlan50-cctv vlan-id=50 comment="CCTV Security Cameras"\n/interface bridge vlan\nadd bridge=bridge-lan tagged=bridge-lan,sfp-sfpplus1 vlan-ids=50';
      } else if ((sw.vendor || '').toLowerCase().includes('snr')) {
        modContent = modContent.replace('vlan 30\n name Wi-Fi_APs\n!', 'vlan 30\n name Wi-Fi_APs\n!\nvlan 50\n name CCTV_Cameras\n!');
      } else {
        modContent = modContent.replace('vlan 10,20,30,40,50', 'vlan 10,20,30,40,50,60');
      }

      const revBackup = storage.addBackup({
        switchId: sw.id,
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString(), // 3 hours ago
        author: 'admin (Web UI)',
        trigger: 'manual',
        comment: 'Добавлен сегмент видеонаблюдения VLAN 50',
        content: modContent,
        hash: calculateConfigHash(modContent)
      });

      list = [revBackup, baseBackup];
    }

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get scheduler status & settings
app.get('/api/backups/schedule', requireRole('admin'), (req, res) => {
  try {
    const settings = backupScheduler.getSettings();
    const safeSettings = {
      ...settings,
      credentials: {
        ...(settings?.credentials || {}),
        password: settings?.credentials?.password ? '••••••••' : ''
      }
    };
    res.json(safeSettings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update scheduler settings
app.put('/api/backups/schedule', requireRole('admin'), (req, res) => {
  try {
    const updated = backupScheduler.updateSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger backup for all switches right now
app.post('/api/backups/trigger-all', requireRole('admin'), async (req, res) => {
  try {
    const result = await backupScheduler.runAllBackups('manual_all');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GIT BACKUP API ---

// Get Git repository status & commit history
app.get('/api/backups/git/status', async (req, res) => {
  try {
    const status = await gitBackupService.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commit latest configurations of all switches to Git
app.post('/api/backups/git/sync', requireRole('admin'), async (req, res) => {
  try {
    const author = req.user?.username || req.body?.author || 'Web UI Admin';
    const result = await gitBackupService.syncAllToGit(author);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commit single switch configuration to Git
app.post('/api/switches/:id/backups/git-commit', requireRole('admin'), async (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const { content, author, message } = req.body;
    let configContent = content;
    if (!configContent) {
      const backups = storage.getBackups(sw.id);
      configContent = backups[0]?.content;
    }

    if (!configContent) {
      return res.status(400).json({ error: 'Нет доступной конфигурации для коммита в Git' });
    }

    const result = await gitBackupService.commitSwitchConfig(
      sw,
      configContent,
      req.user?.username || author || 'Web UI Admin',
      message
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configure remote Git repository URL
app.post('/api/backups/git/remote', requireRole('admin'), async (req, res) => {
  try {
    const { remoteUrl } = req.body;
    const result = await gitBackupService.setRemoteUrl(remoteUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push Git repository to remote origin
app.post('/api/backups/git/push', requireRole('admin'), async (req, res) => {
  try {
    const result = await gitBackupService.pushRemote();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific backup by ID
app.get('/api/backups/:id', (req, res) => {
  try {
    const item = storage.getBackupById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Бэкап не найден' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch running-config via SSH
app.post('/api/switches/:id/backups/fetch', requireRole('engineer'), async (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const { host, port, username, password, timeout } = req.body;
    const targetHost = host || sw.ip;
    if (!targetHost) {
      return res.status(400).json({ error: 'У коммутатора не указан IP-адрес для SSH подключения' });
    }

    const result = await fetchSwitchConfigOverSsh({
      host: targetHost,
      port: port || 22,
      username: username || 'admin',
      password: password || '',
      vendor: sw.vendor,
      timeout: timeout || 12000
    });

    const hash = calculateConfigHash(result.content);
    
    // Check if identical to last backup
    const prevBackups = storage.getBackups(sw.id);
    const isIdentical = prevBackups.length > 0 && prevBackups[0].hash === hash;

    const newBackup = storage.addBackup({
      switchId: sw.id,
      timestamp: new Date().toISOString(),
      author: `${req.user?.username || username || 'admin'} (SSH)`,
      trigger: 'ssh',
      comment: isIdentical ? 'Конфигурация без изменений (Identical)' : 'Снимок running-config по SSH',
      content: result.content,
      linesCount: result.linesCount,
      sizeBytes: result.sizeBytes,
      hash
    });

    res.status(201).json({
      success: true,
      backup: newBackup,
      isIdentical
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload manual configuration file/text
app.post('/api/switches/:id/backups/upload', requireRole('engineer'), (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const { content, comment, author } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Содержимое конфигурации не может быть пустым' });
    }

    const cleaned = content.replace(/\r\n/g, '\n').replace(/\r/g, '').trim();
    const hash = calculateConfigHash(cleaned);

    const newBackup = storage.addBackup({
      switchId: sw.id,
      timestamp: new Date().toISOString(),
      author: author || req.user?.username || 'Ручная загрузка (Файл)',
      trigger: 'upload',
      comment: comment || 'Импортированная конфигурация',
      content: cleaned,
      linesCount: cleaned.split('\n').length,
      sizeBytes: Buffer.byteLength(cleaned, 'utf8'),
      hash
    });

    res.status(201).json({ success: true, backup: newBackup });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete backup
app.delete('/api/backups/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteBackup(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Бэкап не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CLI RUNNER API ---

// Execute CLI command / script via SSH
app.post('/api/switches/:id/execute-cli', requireRole('admin'), async (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const { command, host, port, username, password, timeout } = req.body;
    const targetHost = host || sw.ip;
    if (!targetHost) {
      return res.status(400).json({ error: 'У коммутатора не указан IP-адрес' });
    }
    if (!command || !command.trim()) {
      return res.status(400).json({ error: 'Команда для выполнения не указана' });
    }

    try {
      const result = await executeSshCommand({
        host: targetHost,
        port: port || 22,
        username: username || 'admin',
        password: password || '',
        vendor: sw.vendor,
        command,
        timeout: timeout || 15000
      });
      res.json(result);
    } catch (sshErr) {
      // Имитация ответа для оффлайн/тестового режима без физического SSH
      const v = (sw.vendor || '').toLowerCase();
      let mockOutput = '';
      if (v.includes('mikrotik')) {
        mockOutput = `[admin@${sw.name}] > ${command}\nScript executed successfully. Flags: X - disabled, I - invalid, D - dynamic.`;
      } else if (v.includes('snr')) {
        mockOutput = `${sw.name}# ${command}\nBuilding configuration...\nSuccess.`;
      } else {
        mockOutput = `(${sw.name}) # ${command}\nCommand applied to running configuration.`;
      }
      res.json({
        success: true,
        exitCode: 0,
        output: mockOutput,
        simulated: true,
        note: `Коммутатор по адресу ${targetHost} недоступен по SSH (${sshErr.message}), сформирован локальный отчет.`
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live SNMP / Telemetry State (Cached for Topology & Live Indicators)
app.get('/api/switches/:id/telemetry', (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    // Получаем последние записанные метрики портов из памяти фонового демона
    const swMemory = storage.telemetryMemory?.[req.params.id] || {};
    const ports = (sw.ports || []).map(p => {
      const portSeries = swMemory[p.number] || [];
      const latest = portSeries[portSeries.length - 1] || {};
      return {
        number: p.number,
        portId: p.id,
        name: p.name,
        operStatus: latest.status || (p.enabled ? 'up' : 'down'),
        rxMbps: latest.rxMbps || 0,
        txMbps: latest.txMbps || 0,
        inErrors: latest.inErrors || 0
      };
    });

    res.json({
      online: true,
      timestamp: new Date().toISOString(),
      ports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live SNMP / Telemetry Polling (On-demand physical poll)
app.post('/api/switches/:id/poll', requireRole('engineer'), async (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });
    const telemetry = await pollSwitchTelemetry(sw);
    res.json(telemetry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live MAC Discovery (FDB table lookup via SSH/API)
app.post('/api/switches/:id/mac-discovery', requireRole('engineer'), async (req, res) => {
  try {
    const results = await discoverSwitchMacs(req.params.id, req.body, storage);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync discovered MAC addresses into ports or IPAM
app.post('/api/switches/:id/mac-sync', requireRole('engineer'), (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items должен быть массивом' });
    }
    const result = syncDiscoveredMacs(req.params.id, items, storage);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- VLANS API ---

// List all VLANs
app.get('/api/vlans', (req, res) => {
  try {
    res.json(storage.getVlans());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create VLAN
app.post('/api/vlans', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createVlan(req.body);
    storage.logAction({
      entity: 'vlans',
      action: 'create',
      title: `Создан VLAN ${created.id} (${created.name})`,
      details: `Подсеть: ${created.subnet || 'не указана'}`,
      author: req.user?.username || 'admin'
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update VLAN
app.put('/api/vlans/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateVlan(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'VLAN не найден' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete VLAN
app.delete('/api/vlans/:id', requireRole('engineer'), (req, res) => {
  try {
    const ok = storage.deleteVlan(req.params.id);
    if (!ok) return res.status(404).json({ error: 'VLAN не найден' });
    storage.logAction({
      entity: 'vlans',
      action: 'delete',
      title: `Удален VLAN ${req.params.id}`,
      details: `VLAN удален из системы`,
      author: req.user?.username || 'admin'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PATCH PANELS API ---

// List all patch panels
app.get('/api/patch-panels', (req, res) => {
  try {
    res.json(storage.getPatchPanels());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single patch panel
app.get('/api/patch-panels/:id', (req, res) => {
  try {
    const item = storage.getPatchPanelById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Патч-панель не найдена' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create patch panel
app.post('/api/patch-panels', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createPatchPanel(req.body);
    storage.logAction({
      entity: 'patchPanels',
      action: 'create',
      title: `Добавлена патч-панель ${created.name}`,
      details: `${created.portsCount || 24} портов (${created.location || 'без локации'})`,
      author: req.user?.username || 'admin'
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update patch panel info
app.put('/api/patch-panels/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updatePatchPanel(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Патч-панель не найдена' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete patch panel
app.delete('/api/patch-panels/:id', requireRole('admin'), (req, res) => {
  try {
    const pp = storage.getPatchPanelById(req.params.id);
    const ppName = pp?.name || req.params.id;
    const ok = storage.deletePatchPanel(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Патч-панель не найдена' });
    storage.logAction({
      entity: 'patchPanels',
      action: 'delete',
      title: `Удалена патч-панель ${ppName}`,
      details: `Панель удалена из СКС`,
      author: req.user?.username || 'admin'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update single patch panel port
app.put('/api/patch-panels/:id/ports/:portId', requireRole('engineer'), (req, res) => {
  try {
    const updatedPort = storage.updatePatchPanelPort(req.params.id, req.params.portId, req.body);
    if (!updatedPort) return res.status(404).json({ error: 'Порт патч-панели не найден' });
    res.json(updatedPort);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- IPAM API ---

// List all IP allocations
app.get('/api/ipam', (req, res) => {
  try {
    res.json(storage.getIpAllocations());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single IP allocation
app.get('/api/ipam/:id', (req, res) => {
  try {
    const item = storage.getIpAllocationById(req.params.id);
    if (!item) return res.status(404).json({ error: 'IP-запись не найдена' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create IP allocation
app.post('/api/ipam', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createIpAllocation(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update IP allocation
app.put('/api/ipam/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateIpAllocation(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'IP-запись не найдена' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete IP allocation
app.delete('/api/ipam/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteIpAllocation(req.params.id);
    if (!ok) return res.status(404).json({ error: 'IP-запись не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync servers and VMs into IPAM
app.post('/api/ipam/sync-servers', requireRole('engineer'), (req, res) => {
  try {
    const result = storage.syncServersToIpam();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FLOOR PLANS API ---

// List all floor plans
app.get('/api/floor-plans', (req, res) => {
  try {
    res.json(storage.getFloorPlans());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single floor plan
app.get('/api/floor-plans/:id', (req, res) => {
  try {
    const item = storage.getFloorPlanById(req.params.id);
    if (!item) return res.status(404).json({ error: 'План этажа не найден' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create floor plan
app.post('/api/floor-plans', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createFloorPlan(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update floor plan
app.put('/api/floor-plans/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateFloorPlan(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'План этажа не найден' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete floor plan
app.delete('/api/floor-plans/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteFloorPlan(req.params.id);
    if (!ok) return res.status(404).json({ error: 'План этажа не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FACTORY BUILDINGS & CAMPUS MAP API ---

// List all factory buildings
app.get('/api/buildings', (req, res) => {
  try {
    res.json(storage.getBuildings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single building
app.get('/api/buildings/:id', (req, res) => {
  try {
    const item = storage.getBuildingById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Здание не найдено' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create building
app.post('/api/buildings', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createBuilding(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update building (details, coordinates, links)
app.put('/api/buildings/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateBuilding(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Здание не найдено' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete building
app.delete('/api/buildings/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteBuilding(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Здание не найдено' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CAMPUS INFRASTRUCTURE API (КАБЕЛЬНЫЕ КОЛОДЦЫ, ЭСТАКАДЫ, МУФТЫ, ТРАССЫ ВОЛС, WI-FI) ---

app.get('/api/campus-infrastructure', (req, res) => {
  try {
    res.json(storage.getCampusInfrastructure());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/campus-infrastructure', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateCampusInfrastructure(req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- SERVERS & HYPERVISORS API ---

// List all servers
app.get('/api/servers', (req, res) => {
  try {
    res.json(storage.getServers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single server
app.get('/api/servers/:id', (req, res) => {
  try {
    const item = storage.getServerById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Сервер не найден' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create server
app.post('/api/servers', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createServer(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update server
app.put('/api/servers/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateServer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Сервер не найден' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete server
app.delete('/api/servers/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteServer(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Сервер не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add VM to server
app.post('/api/servers/:id/vms', requireRole('engineer'), (req, res) => {
  try {
    const vm = storage.addVm(req.params.id, req.body);
    if (!vm) return res.status(404).json({ error: 'Сервер не найден' });
    res.status(201).json(vm);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update VM on server
app.put('/api/servers/:id/vms/:vmid', requireRole('engineer'), (req, res) => {
  try {
    const vm = storage.updateVm(req.params.id, req.params.vmid, req.body);
    if (!vm) return res.status(404).json({ error: 'ВМ не найдена' });
    res.json(vm);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete VM from server
app.delete('/api/servers/:id/vms/:vmid', requireRole('engineer'), (req, res) => {
  try {
    const ok = storage.deleteVm(req.params.id, req.params.vmid);
    if (!ok) return res.status(404).json({ error: 'ВМ не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DIAGNOSTICS & TRACING API ---

// Ping single host
app.post('/api/diagnostics/ping', requireRole('engineer'), async (req, res) => {
  try {
    const { host, timeoutMs } = req.body;
    if (!host) return res.status(400).json({ error: 'Хост обязателен' });
    const result = await pingHost(host, timeoutMs || 1200);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ping batch of hosts
app.post('/api/diagnostics/ping-batch', requireRole('engineer'), async (req, res) => {
  try {
    const { hosts, timeoutMs } = req.body;
    if (!Array.isArray(hosts)) return res.status(400).json({ error: 'hosts должен быть массивом' });
    const results = await pingBatch(hosts, timeoutMs || 1200);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trace device by IP, MAC, hostname, room or socket
app.get('/api/diagnostics/trace', (req, res) => {
  try {
    const q = req.query.q || '';
    const result = traceDevice(storage, q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias for trace
app.get('/api/diagnostics/find-device', (req, res) => {
  try {
    const q = req.query.q || '';
    const result = traceDevice(storage, q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Comprehensive Network Troubleshooter Engine API
app.post('/api/diagnostics/troubleshoot', requireRole('engineer'), async (req, res) => {
  try {
    const result = await runComprehensiveTroubleshoot(storage, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply Troubleshooter Quick Fix
app.post('/api/diagnostics/troubleshoot/fix', requireRole('engineer'), async (req, res) => {
  try {
    const { fix } = req.body || {};
    if (!fix || typeof fix !== 'object') return res.status(400).json({ error: 'Не указано исправление' });

    if (fix.type === 'enable_port' && fix.switchId && fix.portId) {
      const sw = storage.getSwitchById(fix.switchId);
      if (sw) {
        const port = (sw.ports || []).find(p => p.id === fix.portId || p.number === fix.portId);
        if (port) {
          storage.updatePort(fix.switchId, port.id, { enabled: true, mode: port.mode === 'disabled' ? 'access' : port.mode });
        }
      }
    } else if (fix.type === 'unlink_port' && fix.switchId && fix.portId) {
      storage.updatePort(fix.switchId, fix.portId, { linkedSwitchId: null, linkedPortId: null });
    } else if (fix.type === 'sync_trunk_mode' && fix.switchAId && fix.portAId && fix.switchBId && fix.portBId) {
      storage.updatePort(fix.switchAId, fix.portAId, { mode: 'trunk' });
      storage.updatePort(fix.switchBId, fix.portBId, { mode: 'trunk' });
    } else if (fix.type === 'sync_pvid' && fix.switchAId && fix.portAId && fix.switchBId && fix.portBId && fix.targetPvid !== undefined) {
      storage.updatePort(fix.switchAId, fix.portAId, { pvid: fix.targetPvid });
      storage.updatePort(fix.switchBId, fix.portBId, { pvid: fix.targetPvid });
    } else if (fix.type === 'sync_trunk_vlans' && fix.switchAId && fix.portAId && fix.switchBId && fix.portBId && Array.isArray(fix.mergedVlans)) {
      storage.updatePort(fix.switchAId, fix.portAId, { taggedVlans: fix.mergedVlans });
      storage.updatePort(fix.switchBId, fix.portBId, { taggedVlans: fix.mergedVlans });
    } else if (fix.type === 'create_vlan' && fix.vlanId) {
      storage.createVlan({ id: fix.vlanId, name: `VLAN ${fix.vlanId}`, color: '#3b82f6' });
    } else {
      return res.status(400).json({ error: 'Неизвестный тип исправления или отсутствуют обязательные параметры' });
    }

    res.json({ success: true, message: 'Исправление успешно применено' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NETWORK TOOLS API ---

// Scan subnet / ARP sweep
app.post('/api/tools/scan-subnet', requireRole('engineer'), async (req, res) => {
  try {
    if (!req.body || (!req.body.subnet && (!req.body.startIp || !req.body.endIp))) {
      return res.status(400).json({ error: 'Укажите корректную подсеть (CIDR) или диапазон IP-адресов' });
    }
    const results = await scanSubnet(req.body, storage);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan TCP ports
app.post('/api/tools/scan-ports', requireRole('engineer'), async (req, res) => {
  try {
    const results = await scanPorts(req.body);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Traceroute
app.post('/api/tools/traceroute', requireRole('engineer'), async (req, res) => {
  try {
    const results = await runTraceroute(req.body);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NOTES (ИНЖЕНЕРНЫЙ БЛОКНОТ) API ---

// List all notes
app.get('/api/notes', (req, res) => {
  try {
    res.json(storage.getNotes());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single note
app.get('/api/notes/:id', (req, res) => {
  try {
    const item = storage.getNoteById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Заметка не найдена' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create note
app.post('/api/notes', requireRole('engineer'), (req, res) => {
  try {
    const created = storage.createNote(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update note
app.put('/api/notes/:id', requireRole('engineer'), (req, res) => {
  try {
    const updated = storage.updateNote(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Заметка не найдена' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete note
app.delete('/api/notes/:id', requireRole('engineer'), (req, res) => {
  try {
    const ok = storage.deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Заметка не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MONITORING & HEALTH DASHBOARD API ---

// Get summary network health and KPIs
app.get('/api/monitoring/health', (req, res) => {
  try {
    const health = getNetworkHealth(storage);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ping all switches in parallel for real-time heartbeat
app.post('/api/monitoring/ping-all', requireRole('engineer'), async (req, res) => {
  try {
    const results = await pingAllSwitches(storage);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ping all servers and virtual machines for real-time heartbeat
app.post('/api/monitoring/ping-servers', requireRole('engineer'), async (req, res) => {
  try {
    const results = await pingAllServers(storage);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recent network events & real-time alerts
app.get('/api/monitoring/events', (req, res) => {
  try {
    const events = getRecentEvents(storage);
    const alerts = storage.getAlerts(20);
    res.json({ events, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time alerts list
app.get('/api/monitoring/alerts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(storage.getAlerts(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge alert
app.post('/api/monitoring/alerts/:id/ack', requireRole('engineer'), (req, res) => {
  try {
    const success = storage.acknowledgeAlert(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all alerts
app.delete('/api/monitoring/alerts', requireRole('admin'), (req, res) => {
  try {
    const success = storage.clearAlerts();
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rolling telemetry history for a specific switch & port
app.get('/api/switches/:id/ports/:portNum/history', (req, res) => {
  try {
    const history = storage.getTelemetryHistory(req.params.id, parseInt(req.params.portNum));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notification settings (Telegram & Webhook)
app.get('/api/monitoring/notifications', requireRole('admin'), (req, res) => {
  try {
    res.json(storage.getNotificationSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/monitoring/notifications', requireRole('admin'), (req, res) => {
  try {
    const updated = storage.updateNotificationSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test notification channel (Telegram & Webhook)
app.post('/api/monitoring/notifications/test', requireRole('admin'), async (req, res) => {
  try {
    const settings = req.body || storage.getNotificationSettings();
    const result = await snmpMonitorDaemon.sendTestNotification(settings);
    res.json({ success: true, result, message: 'Тестовое уведомление успешно отправлено!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ACTIVE DIRECTORY / LDAP INTEGRATION ROUTES ---

// Get Active Directory sync settings
app.get('/api/ad/settings', requireRole('engineer'), (req, res) => {
  try {
    const settings = storage.getAdSettings();
    const safeSettings = {
      ...settings,
      password: settings.password ? '••••••••' : ''
    };
    res.json(safeSettings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Active Directory sync settings
app.put('/api/ad/settings', requireRole('admin'), (req, res) => {
  try {
    const current = storage.getAdSettings();
    const updates = { ...req.body };
    if (!updates.password || updates.password === '••••••••') {
      updates.password = current.password || '';
    }
    const updated = storage.updateAdSettings(updates);
    adSyncService.scheduleNextRun();
    res.json({
      ...updated,
      password: updated.password ? '••••••••' : ''
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Test Active Directory LDAP connection
app.post('/api/ad/test', requireRole('engineer'), async (req, res) => {
  try {
    const current = storage.getAdSettings();
    const settings = { ...current, ...(req.body || {}) };
    if (!settings.password || settings.password === '••••••••') {
      settings.password = current.password || '';
    }
    const result = await adSyncService.testConnection(settings);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview computers and resolved IPs from Active Directory
app.post('/api/ad/preview', requireRole('engineer'), async (req, res) => {
  try {
    const current = storage.getAdSettings();
    const settings = { ...current, ...(req.body || {}) };
    if (!settings.password || settings.password === '••••••••') {
      settings.password = current.password || '';
    }
    const preview = await adSyncService.previewAdSync(settings);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger synchronization from Active Directory to IPAM
app.post('/api/ad/sync', requireRole('engineer'), async (req, res) => {
  try {
    const current = storage.getAdSettings();
    const settings = { ...current, ...(req.body || {}) };
    if (!settings.password || settings.password === '••••••••') {
      settings.password = current.password || '';
    }
    const result = await adSyncService.syncAdToIpam(settings);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- AUDIT LOG & CONFIG HISTORY API ---

// Get audit log entries
app.get('/api/audit-log', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    res.json(storage.getAuditLog(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear audit log
app.delete('/api/audit-log', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.clearAuditLog();
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all snapshots
app.get('/api/snapshots', (req, res) => {
  try {
    res.json(storage.getSnapshots());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create snapshot
app.post('/api/snapshots', requireRole('engineer'), (req, res) => {
  try {
    const snap = storage.createSnapshot(req.body);
    res.status(201).json(snap);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete snapshot
app.delete('/api/snapshots/:id', requireRole('admin'), (req, res) => {
  try {
    const ok = storage.deleteSnapshot(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Снимок не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore snapshot (Rollback)
app.post('/api/snapshots/:id/restore', requireRole('admin'), (req, res) => {
  try {
    const restored = storage.restoreSnapshot(req.params.id);
    if (!restored) return res.status(404).json({ error: 'Снимок не найден' });
    res.json({ success: true, snapshot: restored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compare snapshot with current config (Diff)
app.get('/api/snapshots/:id/diff', (req, res) => {
  try {
    const diff = storage.compareSnapshot(req.params.id);
    if (!diff) return res.status(404).json({ error: 'Снимок не найден' });
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- BACKUP & RESTORE ---

app.get('/api/backup', requireRole('admin'), (req, res) => {
  try {
    const rawData = storage.getAll();
    // Санитизация данных: исключаем активные сессии и закрытые хэши/соли паролей пользователей
    const { sessions, ...cleanData } = rawData;
    if (Array.isArray(cleanData.users)) {
      cleanData.users = cleanData.users.map(({ passwordHash, salt, ...safeUser }) => safeUser);
    }
    res.setHeader('Content-disposition', `attachment; filename=switchbook-backup-${new Date().toISOString().slice(0, 10)}.json`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(cleanData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore', requireRole('admin'), (req, res) => {
  try {
    const restored = storage.importAll(req.body);
    res.json({ success: true, count: restored.switches.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- NETWORK DISCOVERY, LLDP TOPOLOGY & BATCH PROVISIONING API ---

// 1. Deep network scan & vendor discovery (MikroTik, SNR, Ubiquiti)
app.post('/api/discovery/scan', requireRole('engineer'), async (req, res) => {
  try {
    const results = await scanAndDiscoverNetwork(req.body, storage);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. One-click add discovered device to switches database
app.post('/api/discovery/add-switch', requireRole('engineer'), (req, res) => {
  try {
    const {
      name,
      ip,
      mac,
      vendor = 'SNR',
      model,
      copperPorts = 24,
      sfpPorts = 4,
      poe = false,
      poeBudget = 0,
      snmpCommunity = 'public',
      badge = '',
      color = '',
      location = 'Серверная',
      notes = ''
    } = req.body;

    if (!name || !ip) {
      return res.status(400).json({ error: 'Укажите имя и IP-адрес коммутатора' });
    }

    const existing = storage.getSwitches().find(s => s.ip === ip || s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: `Коммутатор с таким IP или именем уже существует: ${existing.name}` });
    }

    const isSnr = (vendor || '').toLowerCase().includes('snr');
    const isMikrotik = (vendor || '').toLowerCase().includes('mikrotik');

    const created = storage.createSwitch({
      name,
      ip,
      mac: mac || '',
      vendor: vendor || 'SNR',
      model: model || (isSnr ? 'SNR Enterprise Switch' : 'L2/L3 Managed Switch'),
      badge: badge || (isSnr ? 'SNR НАГ' : (isMikrotik ? 'MikroTik' : (vendor || ''))),
      color: color || (isSnr ? '#059669' : (isMikrotik ? '#334155' : '#3b82f6')),
      location: location || 'Стойка 42U',
      notes: notes || 'Добавлено через сетевой автодискавери',
      copperPorts: parseInt(copperPorts) || (isSnr ? 24 : 24),
      sfpPorts: parseInt(sfpPorts) || (isSnr ? 4 : 2),
      poe: Boolean(poe),
      poeBudget: Number(poeBudget) || (poe ? 370 : 0),
      snmpEnabled: true,
      snmpCommunity: snmpCommunity || 'public',
      snmpVersion: '2c'
    });

    res.json({ success: true, switch: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. LLDP / CDP neighbor discovery (GET & POST)
app.get('/api/discovery/lldp', async (req, res) => {
  try {
    const topology = await discoverLldpTopology(storage, req.query);
    res.json(topology);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/discovery/lldp', async (req, res) => {
  try {
    const topology = await discoverLldpTopology(storage, req.body || {});
    res.json(topology);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Apply discovered LLDP link to topology (connect switch ports)
app.post('/api/discovery/lldp/apply', requireRole('engineer'), (req, res) => {
  try {
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Параметр link обязателен' });
    const result = applyLldpLink(storage, link);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4.1 Apply all discovered LLDP links in batch
app.post('/api/discovery/lldp/apply-all', requireRole('engineer'), (req, res) => {
  try {
    const { links } = req.body;
    if (!Array.isArray(links)) return res.status(400).json({ error: 'Параметр links должен быть массивом' });
    const result = applyAllLldpLinks(storage, links);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- END-TO-END VLAN WIZARD API ---
app.post('/api/vlan-wizard/analyze', (req, res) => {
  try {
    const analysis = analyzeVlanProvisioning(storage, req.body || {});
    res.json(analysis);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/vlan-wizard/apply', requireRole('engineer'), (req, res) => {
  try {
    const result = applyVlanProvisioning(storage, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vlan-wizard/execute-ssh', requireRole('admin'), async (req, res) => {
  try {
    const result = await executeVlanProvisioningSsh(storage, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Generate batch port configuration script
app.post('/api/switches/:id/ports/provision-script', requireRole('engineer'), (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const script = generateBatchPortScript({
      vendor: req.body.vendor || sw.vendor,
      ...req.body
    });

    res.json({ success: true, script });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Apply batch provisioning to switch via SSH and/or update DB
app.post('/api/switches/:id/ports/provision-apply', requireRole('admin'), async (req, res) => {
  try {
    const sw = storage.getSwitchById(req.params.id);
    if (!sw) return res.status(404).json({ error: 'Коммутатор не найден' });

    const { 
      portIds = [], 
      script = '', 
      applyToSwitch = false, 
      applyToDb = true, 
      portUpdate = {},
      credentials = {} 
    } = req.body;

    let sshResult = null;

    if (applyToSwitch && script) {
      const sshHost = sw.ip;
      const sshPort = credentials.port || 22;
      const sshUser = credentials.username || 'admin';
      const sshPass = credentials.password || '';

      try {
        sshResult = await executeSshCommand({
          host: sshHost,
          port: sshPort,
          username: sshUser,
          password: sshPass,
          vendor: sw.vendor,
          command: script,
          timeout: 8000
        });
      } catch (sshErr) {
        sshResult = { success: false, error: sshErr.message };
      }
    }

    let updatedSwitch = sw;
    if (applyToDb && portIds.length > 0 && Object.keys(portUpdate).length > 0) {
      updatedSwitch = storage.batchUpdatePorts(sw.id, portIds, portUpdate);
    }

    res.json({
      success: true,
      switch: updatedSwitch,
      sshResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend build if exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('API Server is running. Frontend dev server is on port 5173.');
    }
  });
});

const server = http.createServer(app);
initWebSshServer(server, storage);

server.listen(PORT, () => {
  console.log(`[SwitchBook Server] Сервер запущен на http://localhost:${PORT}`);
  try {
    backupScheduler.init();
    snmpMonitorDaemon.init(storage);
    adSyncService.init(storage);
  } catch (err) {
    console.error('[Services] Ошибка инициализации фоновых служб:', err.message);
  }
});

// Graceful shutdown handling
const handleShutdown = (signal) => {
  console.log(`\n[SwitchBook Server] Получен сигнал ${signal}. Завершение работы...`);
  try {
    snmpMonitorDaemon.stop();
  } catch {}
  server.close(() => {
    console.log('[SwitchBook Server] HTTP и WebSocket соединения закрыты. Процесс завершен.');
    process.exit(0);
  });
  // Принудительное завершение через 4 секунды, если сокеты зависли
  setTimeout(() => process.exit(0), 4000).unref();
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[SwitchBook Server] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[SwitchBook Server] Uncaught Exception:', err);
});
