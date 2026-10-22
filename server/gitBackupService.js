/**
 * gitBackupService.js
 * Автоматический экспорт и версионирование конфигураций сетевых устройств в Git репозиторий.
 * Поддерживает локальный репозиторий (data/git-backups) и синхронизацию с удаленными remotes (GitLab, GitHub, Gitea).
 */

import fs from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { storage } from './storage.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Репозиторий бэкапов размещается в data/git-backups
const GIT_BACKUP_DIR = path.resolve(__dirname, '../data/git-backups');

class GitBackupService {
  constructor() {
    this.repoPath = GIT_BACKUP_DIR;
    this.initialized = false;
  }

  /**
   * Инициализация локального Git-репозитория
   */
  async initRepo() {
    try {
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true });
      }

      const gitDir = path.join(this.repoPath, '.git');
      if (!fs.existsSync(gitDir)) {
        console.log(`[GitBackup] Создание нового Git-репозитория в ${this.repoPath}`);
        await execAsync('git init', { cwd: this.repoPath });
        await execAsync('git config user.name "SwitchBook Backup Engine"', { cwd: this.repoPath });
        await execAsync('git config user.email "backup@switchbook.local"', { cwd: this.repoPath });
        
        // Создаем начальный README
        const readmeContent = `# SwitchBook Network Configuration Repository
Этот репозиторий автоматически обновляется системой SwitchBook.
Здесь хранятся актуальные конфигурации оборудования (MikroTik, SNR, Ubiquiti) с историей коммитов.
`;
        fs.writeFileSync(path.join(this.repoPath, 'README.md'), readmeContent, 'utf-8');
        await execAsync('git add README.md', { cwd: this.repoPath });
        await execAsync('git commit -m "chore: initial repository structure for network backups"', { cwd: this.repoPath });
      }

      this.initialized = true;
      return { success: true, path: this.repoPath };
    } catch (err) {
      console.error('[GitBackup] Ошибка инициализации репозитория:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Получение статуса и настроек Git-репозитория
   */
  async getStatus() {
    await this.initRepo();
    try {
      const { stdout: logOut } = await execAsync('git log -n 15 --pretty=format:"%H|%an|%ad|%s" --date=iso', {
        cwd: this.repoPath
      }).catch(() => ({ stdout: '' }));

      const commits = logOut
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [hash, author, date, message] = line.split('|');
          return { hash, shortHash: hash?.substring(0, 7), author, date, message };
        });

      let remoteUrl = '';
      try {
        const { stdout: remoteOut } = await execAsync('git remote get-url origin', { cwd: this.repoPath });
        remoteUrl = remoteOut.trim();
      } catch (_) {
        // remote not configured yet
      }

      // Список файлов в репозитории
      const files = [];
      const readDirRecursive = (dir, prefix = '') => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git') continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(prefix, entry.name).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            readDirRecursive(fullPath, relPath);
          } else {
            const stat = fs.statSync(fullPath);
            files.push({
              path: relPath,
              sizeBytes: stat.size,
              updatedAt: stat.mtime.toISOString()
            });
          }
        }
      };
      readDirRecursive(this.repoPath);

      return {
        success: true,
        repoPath: this.repoPath,
        commitsCount: commits.length,
        commits,
        remoteUrl,
        filesCount: files.length,
        files
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        repoPath: this.repoPath
      };
    }
  }

  /**
   * Сохранение конфигурации коммутатора в Git репозиторий и создание коммита
   */
  async commitSwitchConfig(switchItem, configContent, author = 'SwitchBook Admin', commitMessage = null) {
    if (!configContent || !configContent.trim()) {
      throw new Error('Пустая конфигурация для сохранения в Git');
    }

    await this.initRepo();

    const vendor = (switchItem.vendor || 'Generic').replace(/[^a-zA-Z0-9_-]/g, '_');
    const switchName = (switchItem.name || switchItem.id || 'switch').replace(/[^a-zA-Z0-9_-]/g, '_');

    // Определение расширения файла
    const vLower = (switchItem.vendor || '').toLowerCase();
    let ext = 'cfg';
    if (vLower.includes('mikrotik')) ext = 'rsc';
    else if (vLower.includes('snr')) ext = 'cfg';
    else if (vLower.includes('ubiquiti')) ext = 'cfg';

    // Структурированная папка: /vendors/<Vendor>/<switchName>.<ext>
    const vendorDir = path.join(this.repoPath, vendor);
    if (!fs.existsSync(vendorDir)) {
      fs.mkdirSync(vendorDir, { recursive: true });
    }

    const filePath = path.join(vendorDir, `${switchName}.${ext}`);
    const relFilePath = `${vendor}/${switchName}.${ext}`;

    // Записываем файл
    fs.writeFileSync(filePath, configContent, 'utf-8');

    // Проверяем diff через git status
    const { stdout: statusOut } = await execAsync(`git status --porcelain "${relFilePath}"`, {
      cwd: this.repoPath
    });

    if (!statusOut.trim()) {
      return {
        committed: false,
        identical: true,
        message: 'Конфигурация в репозитории идентична текущей, коммит не требуется',
        filePath: relFilePath
      };
    }

    // Индексируем и коммитим
    await execFileAsync('git', ['add', relFilePath], { cwd: this.repoPath });
    const msg = commitMessage || `backup(${switchName}): update ${switchItem.vendor} configuration [IP: ${switchItem.ip || 'N/A'}]`;
    const authorStr = `${author || 'SwitchBook'} <backup@switchbook.local>`;

    await execFileAsync('git', ['commit', `--author=${authorStr}`, '-m', msg], {
      cwd: this.repoPath
    });

    const { stdout: hashOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: this.repoPath });
    const commitHash = hashOut.trim();

    console.log(`[GitBackup] Создан коммит ${commitHash.substring(0, 7)} для ${switchName}`);

    return {
      committed: true,
      commitHash,
      shortHash: commitHash.substring(0, 7),
      filePath: relFilePath,
      message: msg
    };
  }

  /**
   * Синхронизация всех текущих коммутаторов в Git-репозиторий одной кнопкой
   */
  async syncAllToGit(author = 'Batch Sync Runner') {
    await this.initRepo();
    const switches = storage.getSwitches() || [];
    const results = [];

    for (const sw of switches) {
      const backups = storage.getBackups(sw.id);
      const latest = backups[0];
      if (!latest || !latest.content) continue;

      try {
        const res = await this.commitSwitchConfig(sw, latest.content, author);
        results.push({
          switchId: sw.id,
          switchName: sw.name,
          vendor: sw.vendor,
          ...res
        });
      } catch (err) {
        results.push({
          switchId: sw.id,
          switchName: sw.name,
          error: err.message
        });
      }
    }

    return {
      success: true,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Настройка удаленного Remote (GitLab / GitHub / Gitea)
   */
  async setRemoteUrl(remoteUrl) {
    await this.initRepo();
    try {
      // Удаляем старый origin, если есть
      try {
        await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: this.repoPath });
      } catch (_) {}

      if (remoteUrl && remoteUrl.trim()) {
        const cleanUrl = remoteUrl.trim();
        // Строгая валидация формата Git Remote URL для предотвращения инъекции аргументов
        if (!/^(https?|git|ssh):\/\/[a-zA-Z0-9_.~:/?#\[\]@!$&'()*+,;=-]+$|^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+:[a-zA-Z0-9_./~-]+$/.test(cleanUrl)) {
          throw new Error('Некорректный формат Git Remote URL');
        }
        await execFileAsync('git', ['remote', 'add', 'origin', cleanUrl], { cwd: this.repoPath });
      }

      return { success: true, remoteUrl: remoteUrl.trim() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Git Push в удаленный репозиторий
   */
  async pushRemote() {
    await this.initRepo();
    try {
      const { stdout } = await execFileAsync('git', ['push', '-u', 'origin', 'main'], { cwd: this.repoPath }).catch(async () => {
        // Пробуем master, если main не существует
        return await execFileAsync('git', ['push', '-u', 'origin', 'master'], { cwd: this.repoPath });
      });
      return { success: true, output: stdout };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export const gitBackupService = new GitBackupService();
