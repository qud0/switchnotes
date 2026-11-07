import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Terminal,
  Download,
  Upload,
  RefreshCw,
  Clock,
  FileCode,
  FileText,
  GitCompare,
  Copy,
  Check,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Server,
  Zap,
  Info,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronRight,
  ArrowRight,
  Split,
  Maximize2,
  Calendar,
  Play,
  Settings,
  Send,
  Sliders,
  GitBranch,
  GitCommit,
  ExternalLink,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import { api } from '../api';
import { computeConfigDiff, formatConfigLine, generateRollbackScript } from '../utils/diffUtils';
import { useToast } from '../context/ToastContext';

export function ConfigBackupModal({
  isOpen,
  onClose,
  switchData,
  theme = 'dark'
}) {
  if (!isOpen || !switchData) return null;

  const isLight = theme === 'light';
  const toast = useToast();
  const fileInputRef = useRef(null);

  // Active Tab: 'revisions' | 'diff' | 'cli' | 'schedule' | 'git'
  const [activeTab, setActiveTab] = useState('revisions');

  // Backups state
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackupId, setSelectedBackupId] = useState(null);

  // SSH Form State
  const [sshHost, setSshHost] = useState(switchData.ip || '');
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState('admin');
  const [sshPassword, setSshPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fetchingSsh, setFetchingSsh] = useState(false);
  const [sshError, setSshError] = useState(null);
  const [sshSuccessMsg, setSshSuccessMsg] = useState(null);

  // Git State
  const [gitStatus, setGitStatus] = useState(null);
  const [loadingGit, setLoadingGit] = useState(false);
  const [syncingGit, setSyncingGit] = useState(false);
  const [committingGit, setCommittingGit] = useState(false);
  const [remoteGitUrl, setRemoteGitUrl] = useState('');
  const [savingGitRemote, setSavingGitRemote] = useState(false);
  const [pushingGit, setPushingGit] = useState(false);
  const [gitMsg, setGitMsg] = useState(null);

  // Diff Selection State (Compare A vs B)
  const [diffVersionA, setDiffVersionA] = useState('');
  const [diffVersionB, setDiffVersionB] = useState('');
  const [diffViewMode, setDiffViewMode] = useState('side-by-side'); // 'side-by-side' | 'unified'

  // CLI Runner State
  const [cliCommand, setCliCommand] = useState('');
  const [cliRunning, setCliRunning] = useState(false);
  const [cliHistory, setCliHistory] = useState([]);
  const [cliOutput, setCliOutput] = useState('');
  const [cliOutputSuccess, setCliOutputSuccess] = useState(true);

  // Scheduler State
  const [scheduleSettings, setScheduleSettings] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [triggeringAll, setTriggeringAll] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);

  // Search inside config
  const [configSearch, setConfigSearch] = useState('');
  const [copied, setCopied] = useState(false);

  // Load backups on mount or switch change
  const loadBackups = async () => {
    setLoadingBackups(true);
    setSshError(null);
    try {
      const data = await api.getSwitchBackups(switchData.id);
      setBackups(data);
      if (data.length > 0) {
        setSelectedBackupId(data[0].id);
        setDiffVersionB(data[0].id);
        if (data.length > 1) {
          setDiffVersionA(data[1].id);
        } else {
          setDiffVersionA(data[0].id);
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки бэкапов:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackups();
    setSshHost(switchData.ip || '');
  }, [switchData.id]);

  // Selected Backup object
  const activeBackup = useMemo(() => {
    return backups.find(b => b.id === selectedBackupId) || backups[0] || null;
  }, [backups, selectedBackupId]);

  // Backup A and B for Diff
  const backupObjA = useMemo(() => backups.find(b => b.id === diffVersionA) || null, [backups, diffVersionA]);
  const backupObjB = useMemo(() => backups.find(b => b.id === diffVersionB) || null, [backups, diffVersionB]);

  // Compute Diff
  const diffResult = useMemo(() => {
    const textA = backupObjA?.content || '';
    const textB = backupObjB?.content || '';
    return computeConfigDiff(textA, textB);
  }, [backupObjA, backupObjB]);

  // Config Drift: Detect if latest backup differs from previous
  const configDrift = useMemo(() => {
    if (backups.length < 2) return null;
    const latest = backups[0];
    const previous = backups[1];
    const diff = computeConfigDiff(previous.content, latest.content);
    if (diff.isIdentical) return null;
    return {
      hasDrift: true,
      added: diff.stats.added,
      removed: diff.stats.removed,
      latestDate: new Date(latest.timestamp).toLocaleDateString('ru-RU'),
      previousDate: new Date(previous.timestamp).toLocaleDateString('ru-RU')
    };
  }, [backups]);

  // Rollback state
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackCopied, setRollbackCopied] = useState(false);
  const [isApplyingRollback, setIsApplyingRollback] = useState(false);
  const [rollbackSuccessMsg, setRollbackSuccessMsg] = useState(null);
  const [rollbackError, setRollbackError] = useState(null);

  // Rollback Script Generation (reverting B to A)
  const rollbackResult = useMemo(() => {
    if (!backupObjA || !backupObjB || diffResult.isIdentical) return null;
    return generateRollbackScript(diffResult.rows, switchData.vendor || 'MikroTik');
  }, [backupObjA, backupObjB, diffResult, switchData.vendor]);

  const handleApplyRollback = async () => {
    if (!rollbackResult || !rollbackResult.script) return;
    if (!window.confirm(`Вы уверены, что хотите применить откат конфигурации (${rollbackResult.rollbackCommandsCount} команд) на ${switchData.name} по SSH?`)) {
      return;
    }
    setIsApplyingRollback(true);
    setRollbackSuccessMsg(null);
    setRollbackError(null);
    try {
      const res = await api.executeSwitchCli(switchData.id, {
        host: sshHost,
        port: sshPort,
        username: sshUser,
        password: sshPassword,
        command: rollbackResult.script
      });
      setRollbackSuccessMsg(`Откат успешно применен на коммутатор! Ответ устройства:\n${res.stdout || res.output || 'Команды успешно выполнены'}`);
      loadBackups();
    } catch (err) {
      setRollbackError(`Ошибка применения отката: ${err.message}`);
    } finally {
      setIsApplyingRollback(false);
    }
  };

  const handleDownloadRollback = () => {
    if (!rollbackResult) return;
    const isMikroTik = (switchData.vendor || '').toLowerCase().includes('mikrotik');
    const ext = isMikroTik ? 'rsc' : 'cfg';
    const blob = new Blob([rollbackResult.script], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rollback_${switchData.name || 'switch'}_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Trigger SSH Backup
  const handleFetchSsh = async (e) => {
    e.preventDefault();
    setFetchingSsh(true);
    setSshError(null);
    setSshSuccessMsg(null);

    try {
      const res = await api.fetchBackupOverSsh(switchData.id, {
        host: sshHost,
        port: parseInt(sshPort) || 22,
        username: sshUser,
        password: sshPassword
      });

      setSshSuccessMsg(res.isIdentical ? 'Конфигурация получена (изменений нет)' : 'Новая ревизия конфигурации сохранена!');
      setSshPassword('');
      await loadBackups();
    } catch (err) {
      setSshError(err.message || 'Ошибка SSH подключения');
    } finally {
      setFetchingSsh(false);
    }
  };

  // Upload Config File
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result;
        if (typeof content === 'string') {
          await api.uploadBackup(switchData.id, {
            content,
            comment: `Импорт из файла: ${file.name}`,
            author: 'admin (Файл)'
          });
          toast.success(`Бэкап из «${file.name}» успешно загружен`);
          await loadBackups();
        }
      } catch (err) {
        toast.error(`Ошибка загрузки: ${err.message}`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Delete Backup
  const handleDeleteBackup = async (bId) => {
    if (!window.confirm('Удалить эту ревизию конфигурации?')) return;
    try {
      await api.deleteBackup(bId);
      toast.success('Ревизия конфигурации удалена');
      await loadBackups();
    } catch (err) {
      toast.error(`Ошибка удаления: ${err.message}`);
    }
  };

  // Download Backup
  const handleDownloadBackup = (backup) => {
    if (!backup || !backup.content) return;
    const v = (switchData.vendor || '').toLowerCase();
    let ext = 'cfg';
    if (v.includes('mikrotik')) ext = 'rsc';
    else if (v.includes('snr')) ext = 'cfg';
    else if (v.includes('ubiquiti')) ext = 'cfg';

    const blob = new Blob([backup.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${switchData.name}_${new Date(backup.timestamp).toISOString().slice(0, 10)}_${backup.id.slice(-5)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy active config to clipboard
  const handleCopyConfig = () => {
    if (!activeBackup?.content) return;
    navigator.clipboard.writeText(activeBackup.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Load scheduler settings
  const loadScheduleSettings = async () => {
    setLoadingSchedule(true);
    try {
      const data = await api.getBackupSchedule();
      setScheduleSettings(data);
    } catch (err) {
      console.error('Ошибка загрузки настроек расписания:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'schedule') {
      loadScheduleSettings();
    }
  }, [activeTab]);

  // Save scheduler settings
  const handleSaveSchedule = async (updated) => {
    setSavingSchedule(true);
    try {
      const res = await api.updateBackupSchedule(updated);
      setScheduleSettings(res);
      toast.success('Настройки расписания авто-бэкапа сохранены!');
    } catch (err) {
      toast.error(`Ошибка сохранения: ${err.message}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  // Trigger all switches backup
  const handleTriggerAll = async () => {
    setTriggeringAll(true);
    setTriggerResult(null);
    try {
      const res = await api.triggerAllBackups();
      setTriggerResult(res);
      toast.success('Запущен внеплановый бэкап всех коммутаторов');
      await loadBackups();
      await loadScheduleSettings();
    } catch (err) {
      toast.error(`Ошибка запуска: ${err.message}`);
    } finally {
      setTriggeringAll(false);
    }
  };

  // Execute CLI Command
  const handleExecuteCli = async (e) => {
    e?.preventDefault();
    if (!cliCommand.trim() || cliRunning) return;

    setCliRunning(true);
    setCliOutput('');
    const cmdToRun = cliCommand.trim();

    try {
      const res = await api.executeSwitchCli(switchData.id, {
        command: cmdToRun,
        host: sshHost,
        port: parseInt(sshPort) || 22,
        username: sshUser,
        password: sshPassword
      });

      setCliOutput(res.output || res.stdout || 'Команда выполнена успешно.');
      setCliOutputSuccess(res.success);
      setCliHistory(prev => [
        {
          id: Date.now(),
          cmd: cmdToRun,
          output: res.output || res.stdout || '',
          success: res.success,
          time: new Date().toLocaleTimeString(),
          simulated: res.simulated
        },
        ...prev
      ]);
      setCliCommand('');
    } catch (err) {
      setCliOutput(`Ошибка: ${err.message}`);
      setCliOutputSuccess(false);
      setCliHistory(prev => [
        {
          id: Date.now(),
          cmd: cmdToRun,
          output: `Ошибка: ${err.message}`,
          success: false,
          time: new Date().toLocaleTimeString()
        },
        ...prev
      ]);
    } finally {
      setCliRunning(false);
    }
  };

  // Load Git status
  const loadGitStatus = async () => {
    setLoadingGit(true);
    try {
      const data = await api.getGitStatus();
      setGitStatus(data);
      if (data?.remoteUrl) {
        setRemoteGitUrl(data.remoteUrl);
      }
    } catch (err) {
      console.error('Ошибка загрузки Git статуса:', err);
    } finally {
      setLoadingGit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'git') {
      loadGitStatus();
    }
  }, [activeTab]);

  // Commit current switch config to Git
  const handleCommitCurrentSwitch = async () => {
    if (!activeBackup?.content) {
      toast.warning('Нет активной конфигурации для коммита');
      return;
    }
    setCommittingGit(true);
    setGitMsg(null);
    try {
      const res = await api.commitSwitchToGit(switchData.id, {
        content: activeBackup.content,
        author: 'Admin (Web UI)',
        message: `manual(${switchData.name}): manual backup commit from revision viewer`
      });
      setGitMsg({
        type: 'success',
        text: res.identical ? 'Конфигурация в Git идентична (без изменений)' : `Создан коммит: ${res.shortHash} (${res.filePath})`
      });
      await loadGitStatus();
    } catch (err) {
      setGitMsg({ type: 'error', text: err.message });
    } finally {
      setCommittingGit(false);
    }
  };

  // Sync all switches to Git
  const handleSyncAllGit = async () => {
    setSyncingGit(true);
    setGitMsg(null);
    try {
      const res = await api.syncAllToGit('Admin (One-Click Sync)');
      const committedCount = res.results?.filter(r => r.committed)?.length || 0;
      setGitMsg({
        type: 'success',
        text: `Синхронизация завершена. Создано новых коммитов: ${committedCount}`
      });
      await loadGitStatus();
    } catch (err) {
      setGitMsg({ type: 'error', text: err.message });
    } finally {
      setSyncingGit(false);
    }
  };

  // Save Git remote URL
  const handleSaveGitRemote = async (e) => {
    e?.preventDefault();
    setSavingGitRemote(true);
    try {
      await api.setGitRemote(remoteGitUrl);
      toast.success('URL удаленного Git-репозитория сохранен');
      await loadGitStatus();
    } catch (err) {
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setSavingGitRemote(false);
    }
  };

  // Push to remote Git
  const handlePushGit = async () => {
    setPushingGit(true);
    try {
      const res = await api.pushGitRemote();
      if (res.success) {
        toast.success('Успешно отправлено в удаленный Git-репозиторий!');
      } else {
        toast.error(`Ошибка push: ${res.error}`);
      }
    } catch (err) {
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setPushingGit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col h-[94vh] overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Modal Top Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono truncate">
                  {switchData.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-slate-700">
                  {switchData.vendor} {switchData.model}
                </span>
                {switchData.ip && (
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {switchData.ip}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Автоматический бэкап по SSH, версионирование и визуальное сравнение (Diff)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className={`flex items-center p-0.5 rounded-xl border text-xs font-semibold ${
              isLight ? 'bg-slate-200/80 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                onClick={() => setActiveTab('revisions')}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'revisions'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Ревизии ({backups.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('diff')}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'diff'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Сравнение (Diff)</span>
                {configDrift && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold animate-pulse" title={`Обнаружен дрифт: +${configDrift.added} / -${configDrift.removed} строк`}>
                    Дрифт
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('cli')}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'cli'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>CLI Runner</span>
              </button>

              <button
                onClick={() => setActiveTab('schedule')}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'schedule'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Расписание</span>
              </button>

              <button
                onClick={() => setActiveTab('git')}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'git'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Git-Репозиторий</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* TAB 1: REVISIONS & SSH FETCH */}
          {activeTab === 'revisions' && (
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Left Panel: SSH Form & Revisions List */}
              <div className={`w-full lg:w-96 border-b lg:border-b-0 lg:border-r flex flex-col shrink-0 overflow-hidden ${
                isLight ? 'border-slate-200 bg-slate-50/50' : 'border-slate-800 bg-slate-950/40'
              }`}>
                {/* SSH Quick Fetch Form */}
                <div className={`p-4 border-b space-y-3 shrink-0 ${
                  isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-blue-500" />
                      Сбор по SSH
                    </span>

                    {/* Manual Upload Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-semibold cursor-pointer"
                      title="Загрузить готовый файл конфигурации (.rsc / .cfg / .txt)"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Импорт файла</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".rsc,.cfg,.txt,.conf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  <form onSubmit={handleFetchSsh} className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Хост / IP</label>
                        <input
                          type="text"
                          value={sshHost}
                          onChange={(e) => setSshHost(e.target.value)}
                          placeholder="192.168.1.1"
                          required
                          className={`w-full h-8 px-2.5 rounded-lg text-xs font-mono border outline-none focus:border-blue-500 ${
                            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Порт</label>
                        <input
                          type="number"
                          value={sshPort}
                          onChange={(e) => setSshPort(e.target.value)}
                          className={`w-full h-8 px-2 text-xs font-mono border rounded-lg outline-none focus:border-blue-500 text-center ${
                            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Логин</label>
                        <input
                          type="text"
                          value={sshUser}
                          onChange={(e) => setSshUser(e.target.value)}
                          placeholder="admin"
                          required
                          className={`w-full h-8 px-2.5 rounded-lg text-xs font-mono border outline-none focus:border-blue-500 ${
                            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Пароль</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={sshPassword}
                            onChange={(e) => setSshPassword(e.target.value)}
                            placeholder="••••••"
                            className={`w-full h-8 pl-2.5 pr-7 rounded-lg text-xs font-mono border outline-none focus:border-blue-500 ${
                              isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700 text-white'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SSH Status Messages */}
                    {sshError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[11px] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="line-clamp-2">{sshError}</span>
                      </div>
                    )}

                    {sshSuccessMsg && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{sshSuccessMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={fetchingSsh}
                      className="w-full h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                    >
                      {fetchingSsh ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Подключение и сбор...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Сделать бэкап сейчас (SSH)</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Revisions History List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      История ревизий ({backups.length})
                    </span>
                    <button
                      onClick={loadBackups}
                      className="text-slate-400 hover:text-blue-500 text-xs p-1 rounded-sm cursor-pointer"
                      title="Обновить список"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingBackups ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {backups.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Ревизии не найдены. Выполните сбор по SSH или загрузите файл.
                    </div>
                  ) : (
                    backups.map((b, idx) => {
                      const isSelected = selectedBackupId === b.id;
                      const dateStr = new Date(b.timestamp).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBackupId(b.id)}
                          className={`p-3 rounded-xl border text-xs transition-all cursor-pointer relative ${
                            isSelected
                              ? isLight
                                ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-500/40'
                                : 'bg-slate-900 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/50'
                              : isLight
                              ? 'bg-white border-slate-200 hover:border-slate-300'
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              <span className="font-bold font-mono text-slate-900 dark:text-white">
                                {idx === 0 ? 'Текущая версия' : `Ревизия #${backups.length - idx}`}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {dateStr}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                            {b.comment || b.author}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-200/60 dark:border-slate-800/60 pt-1.5">
                            <span className="font-mono">
                              {b.linesCount || 0} строк • ~{Math.round((b.sizeBytes || 0) / 1024 * 10) / 10} КБ
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadBackup(b);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-500 rounded-sm cursor-pointer"
                                title="Скачать файл конфигурации"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBackup(b.id);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded-sm cursor-pointer"
                                title="Удалить ревизию"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Panel: Active Configuration Viewer */}
              <div className="flex-1 overflow-hidden flex flex-col bg-slate-950 text-slate-100">
                {activeBackup ? (
                  <>
                    {/* Viewer Header */}
                    <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs shrink-0">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-blue-400" />
                        <span className="font-mono font-bold text-white">
                          Конфигурация от {new Date(activeBackup.timestamp).toLocaleString('ru-RU')}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400">
                          {activeBackup.author}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Search input inside text */}
                        <div className="relative">
                          <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={configSearch}
                            onChange={(e) => setConfigSearch(e.target.value)}
                            placeholder="Поиск по конфигу..."
                            className="h-7 w-36 sm:w-48 pl-6 pr-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* Copy Button */}
                        <button
                          onClick={handleCopyConfig}
                          className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
                        </button>

                        {/* Compare with previous */}
                        {backups.length > 1 && (
                          <button
                            onClick={() => {
                              const currIdx = backups.findIndex(b => b.id === activeBackup.id);
                              const prevIdx = currIdx < backups.length - 1 ? currIdx + 1 : currIdx - 1;
                              setDiffVersionA(backups[prevIdx].id);
                              setDiffVersionB(activeBackup.id);
                              setActiveTab('diff');
                            }}
                            className="h-7 px-2.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <GitCompare className="w-3.5 h-3.5" />
                            <span>Сравнить (Diff)</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Viewer Lines */}
                    <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed select-text">
                      <pre className="space-y-0.5">
                        {activeBackup.content.split('\n').map((line, idx) => {
                          const isMatch = configSearch && line.toLowerCase().includes(configSearch.toLowerCase());
                          const formatted = formatConfigLine(line);

                          return (
                            <div
                              key={idx}
                              className={`flex items-start hover:bg-slate-850 px-1 rounded-xs ${
                                isMatch ? 'bg-amber-500/20 border-l-2 border-amber-400' : ''
                              }`}
                            >
                              <span className="w-10 shrink-0 text-slate-600 select-none text-right pr-3 text-[11px]">
                                {idx + 1}
                              </span>
                              <span className={`flex-1 break-all ${
                                formatted.isComment ? 'text-slate-500 italic' :
                                formatted.isSection ? 'text-cyan-400 font-bold' :
                                formatted.isCommand ? 'text-blue-300' : 'text-slate-200'
                              }`}>
                                {line}
                              </span>
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                    Выберите ревизию для просмотра
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL DIFF VIEWER */}
          {activeTab === 'diff' && (
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-950 text-slate-100">
              {/* Diff Controls Header */}
              <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
                isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}>
                {/* Selectors for Base A and Target B */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Version A (Base / Old) */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-slate-500 font-medium">Базовая (A):</span>
                    <select
                      value={diffVersionA}
                      onChange={(e) => setDiffVersionA(e.target.value)}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    >
                      {backups.map((b, i) => (
                        <option key={b.id} value={b.id}>
                          {new Date(b.timestamp).toLocaleDateString('ru-RU')} ({b.author}) — #{backups.length - i}
                        </option>
                      ))}
                    </select>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-400" />

                  {/* Version B (Compared / New) */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-slate-500 font-medium">Новая (B):</span>
                    <select
                      value={diffVersionB}
                      onChange={(e) => setDiffVersionB(e.target.value)}
                      className={`h-8 px-2.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    >
                      {backups.map((b, i) => (
                        <option key={b.id} value={b.id}>
                          {new Date(b.timestamp).toLocaleDateString('ru-RU')} ({b.author}) — #{backups.length - i}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Diff Stats Badges */}
                <div className="flex items-center gap-2">
                  {diffResult.isIdentical ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Конфигурации идентичны
                    </span>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                        +{diffResult.stats.added} строк
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-mono font-bold border border-rose-500/30">
                        -{diffResult.stats.removed} строк
                      </span>
                    </>
                  )}

                  {/* View Mode Toggle: Side-by-Side vs Unified */}
                  <div className="flex items-center p-0.5 rounded-lg border border-slate-700 bg-slate-950 ml-2">
                    <button
                      onClick={() => setDiffViewMode('side-by-side')}
                      className={`h-6 px-2 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                        diffViewMode === 'side-by-side' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Side-by-Side
                    </button>
                    <button
                      onClick={() => setDiffViewMode('unified')}
                      className={`h-6 px-2 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                        diffViewMode === 'unified' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Unified
                    </button>
                  </div>

                  {/* Rollback Generator Button */}
                  {rollbackResult && !diffResult.isIdentical && (
                    <button
                      onClick={() => setShowRollbackModal(true)}
                      className="h-7 px-2.5 rounded-lg bg-linear-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer ml-1 transition-all shrink-0"
                      title="Сгенерировать команды отката к версии A"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Откат (Rollback CLI)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Config Drift Banner */}
              {configDrift && (
                <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      <strong className="text-white">Дрифт конфигурации:</strong> Последняя ревизия содержит 
                      <span className="text-emerald-400 font-mono font-bold"> +{configDrift.added}</span> и 
                      <span className="text-rose-400 font-mono font-bold"> -{configDrift.removed}</span> строк по сравнению с предыдущей.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (backups.length >= 2) {
                        setDiffVersionA(backups[1].id);
                        setDiffVersionB(backups[0].id);
                      }
                    }}
                    className="text-[11px] text-rose-300 underline hover:text-white cursor-pointer"
                  >
                    Сравнить последнюю с базовой
                  </button>
                </div>
              )}

              {/* Diff Code Area */}
              <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed select-text">
                {diffViewMode === 'side-by-side' ? (
                  /* Side-by-Side View */
                  <div className="grid grid-cols-2 gap-2 min-w-[700px]">
                    {/* Left Pane (Base A) */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80">
                      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-bold flex items-center justify-between">
                        <span>Базовая версия (A)</span>
                        <span>{diffResult.stats.totalA} строк</span>
                      </div>
                      <div className="p-2 space-y-0.5">
                        {diffResult.rows.map((row, idx) => {
                          const isRemoved = row.type === 'removed';
                          const isAdded = row.type === 'added';
                          return (
                            <div
                              key={idx}
                              className={`flex items-start px-1 rounded-xs ${
                                isRemoved ? 'bg-rose-950/50 text-rose-300 font-medium' :
                                isAdded ? 'opacity-20 select-none' : 'text-slate-300 hover:bg-slate-900'
                              }`}
                            >
                              <span className="w-8 shrink-0 text-slate-600 select-none text-right pr-2 text-[10px]">
                                {row.lineA || '·'}
                              </span>
                              <span className="flex-1 break-all">
                                {isRemoved ? `- ${row.textA}` : (row.textA || ' ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Pane (New B) */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80">
                      <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-bold flex items-center justify-between">
                        <span>Новая версия (B)</span>
                        <span>{diffResult.stats.totalB} строк</span>
                      </div>
                      <div className="p-2 space-y-0.5">
                        {diffResult.rows.map((row, idx) => {
                          const isAdded = row.type === 'added';
                          const isRemoved = row.type === 'removed';
                          return (
                            <div
                              key={idx}
                              className={`flex items-start px-1 rounded-xs ${
                                isAdded ? 'bg-emerald-950/50 text-emerald-300 font-medium' :
                                isRemoved ? 'opacity-20 select-none' : 'text-slate-300 hover:bg-slate-900'
                              }`}
                            >
                              <span className="w-8 shrink-0 text-slate-600 select-none text-right pr-2 text-[10px]">
                                {row.lineB || '·'}
                              </span>
                              <span className="flex-1 break-all">
                                {isAdded ? `+ ${row.textB}` : (row.textB || ' ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unified View (Git Diff style) */
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80 p-2 space-y-0.5">
                    {diffResult.rows.map((row, idx) => {
                      const isAdded = row.type === 'added';
                      const isRemoved = row.type === 'removed';

                      return (
                        <div
                          key={idx}
                          className={`flex items-start px-2 py-0.5 rounded-xs ${
                            isAdded ? 'bg-emerald-950/40 text-emerald-300' :
                            isRemoved ? 'bg-rose-950/40 text-rose-300' : 'text-slate-300 hover:bg-slate-900'
                          }`}
                        >
                          <span className="w-6 shrink-0 text-slate-600 select-none text-right pr-2 text-[10px]">
                            {row.lineA || ' '}
                          </span>
                          <span className="w-6 shrink-0 text-slate-600 select-none text-right pr-2 text-[10px]">
                            {row.lineB || ' '}
                          </span>
                          <span className="w-4 shrink-0 font-bold select-none text-center">
                            {isAdded ? '+' : isRemoved ? '-' : ' '}
                          </span>
                          <span className="flex-1 break-all">
                            {row.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLI RUNNER / SCRIPT EXECUTION */}
          {activeTab === 'cli' && (
            <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    <span>Удаленное выполнение команд и скриптов (CLI Runner)</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Отправка команд конфигурации или диагностики напрямую на {switchData.name} ({switchData.ip}) по SSH.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Платформа:</span>
                  <span className="font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200">
                    {switchData.vendor} ({switchData.vendor === 'MikroTik' ? 'RouterOS CLI' : 'Cisco-like CLI'})
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">Шаблоны команд:</span>
                {switchData.vendor === 'MikroTik' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCliCommand('/interface print brief')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      /interface print
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('/interface ethernet print detail')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      /interface ethernet detail
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('/ip route print')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      /ip route print
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('/system resource print')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      /system resource print
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setCliCommand('show ip interface brief')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      show ip int brief
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('show vlan')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      show vlan
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('show mac-address-table')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      show mac-address-table
                    </button>
                    <button
                      type="button"
                      onClick={() => setCliCommand('show version')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-mono"
                    >
                      show version
                    </button>
                  </>
                )}
              </div>

              {/* Command Input Form */}
              <form onSubmit={handleExecuteCli} className="flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 font-mono text-slate-500 font-bold text-xs select-none">
                    $
                  </span>
                  <input
                    type="text"
                    value={cliCommand}
                    onChange={(e) => setCliCommand(e.target.value)}
                    placeholder={
                      switchData.vendor === 'MikroTik'
                        ? 'Введите команду (например: /interface vlan print или /system reboot)'
                        : 'Введите команду (например: show running-config interface gigabitethernet 1/0/1)'
                    }
                    className={`w-full h-10 pl-7 pr-3 rounded-xl border font-mono text-xs outline-none transition-all ${
                      isLight ? 'bg-white border-slate-300 text-slate-800 focus:border-blue-500' : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500'
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={cliRunning || !cliCommand.trim()}
                  className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shrink-0"
                >
                  {cliRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{cliRunning ? 'Выполняется...' : 'Отправить'}</span>
                </button>
              </form>

              {/* CLI Output Console & History */}
              <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
                {/* Main Console Output */}
                <div className="lg:col-span-2 flex flex-col border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono font-medium flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cliOutputSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      SSH Console Output
                    </span>
                    {cliOutput && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(cliOutput);
                          toast.info('Вывод скопирован в буфер обмена');
                        }}
                        className="hover:text-white transition-colors"
                      >
                        Копировать вывод
                      </button>
                    )}
                  </div>
                  <div className="flex-1 p-3 overflow-auto font-mono text-xs text-slate-200 whitespace-pre-wrap select-text bg-slate-950/90 leading-relaxed">
                    {cliOutput ? cliOutput : (
                      <span className="text-slate-600 italic">
                        Введите команду выше и нажмите "Отправить" для выполнения на коммутаторе.
                      </span>
                    )}
                  </div>
                </div>

                {/* History Sidebar */}
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex flex-col">
                  <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-300">
                    История выполненных команд ({cliHistory.length})
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {cliHistory.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        История пуста
                      </div>
                    ) : (
                      cliHistory.map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setCliCommand(item.cmd);
                            setCliOutput(item.output);
                            setCliOutputSuccess(item.success);
                          }}
                          className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800/60 text-xs cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                            <span className={item.success ? 'text-emerald-400' : 'text-rose-400'}>
                              {item.success ? '✓ Успех' : '✕ Ошибка'}
                            </span>
                            <span>{item.time}</span>
                          </div>
                          <div className="font-mono font-medium text-slate-300 truncate">
                            {item.cmd}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUTOMATIC BACKUP SCHEDULER */}
          {activeTab === 'schedule' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-3xl mx-auto space-y-6">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-500" />
                    <span>Планировщик фонового авто-бэкапа (Nightly / Hourly)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Автоматический периодический сбор конфигураций со всех коммутаторов в сети по SSH, расчет SHA-256 хеша и генерация алертов при обнаружении изменений.
                  </p>
                </div>

                {loadingSchedule ? (
                  <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="text-xs">Загрузка параметров планировщика...</span>
                  </div>
                ) : (
                  <>
                    {/* Status Card */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          scheduleSettings?.enabled
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold flex items-center gap-2">
                            <span>Статус планировщика:</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              scheduleSettings?.enabled
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {scheduleSettings?.enabled ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Интервал: каждые {scheduleSettings?.intervalHours || 24} ч.
                            {scheduleSettings?.lastRun && ` • Посл. запуск: ${new Date(scheduleSettings.lastRun).toLocaleString()}`}
                            {scheduleSettings?.nextRun && ` • След. запуск: ${new Date(scheduleSettings.nextRun).toLocaleString()}`}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleTriggerAll}
                        disabled={triggeringAll}
                        className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-xs"
                      >
                        {triggeringAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{triggeringAll ? 'Сбор запущен...' : 'Собрать со всех сейчас'}</span>
                      </button>
                    </div>

                    {/* Results of manual trigger */}
                    {triggerResult && (
                      <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-2">
                        <div className="text-xs font-bold text-purple-400 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Результаты группового сбора конфигураций:</span>
                        </div>
                        <div className="space-y-1">
                          {triggerResult.results?.map(res => (
                            <div key={res.switchId} className="text-xs flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                              <span className="font-mono font-medium">{res.switchName}</span>
                              <div className="flex items-center gap-2">
                                {res.success ? (
                                  <>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                      res.changed ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                      {res.changed ? 'Конфиг изменен' : 'Без изменений'}
                                    </span>
                                    <span className="text-slate-400">{res.linesCount} строк</span>
                                  </>
                                ) : (
                                  <span className="text-rose-400">{res.error}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Settings Form */}
                    <div className={`p-5 rounded-xl border space-y-4 ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                    }`}>
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-blue-500" />
                        <span>Параметры расписания</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 font-semibold mb-1">
                            Фоновый сбор:
                          </label>
                          <select
                            value={scheduleSettings?.enabled ? 'true' : 'false'}
                            onChange={(e) => setScheduleSettings(prev => ({ ...prev, enabled: e.target.value === 'true' }))}
                            className={`w-full h-9 px-3 rounded-lg border text-xs outline-none ${
                              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                            }`}
                          >
                            <option value="true">Включен (по расписанию)</option>
                            <option value="false">Отключен</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 font-semibold mb-1">
                            Периодичность:
                          </label>
                          <select
                            value={scheduleSettings?.intervalHours || 24}
                            onChange={(e) => setScheduleSettings(prev => ({ ...prev, intervalHours: parseInt(e.target.value) || 24 }))}
                            className={`w-full h-9 px-3 rounded-lg border text-xs outline-none ${
                              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                            }`}
                          >
                            <option value="1">Каждый 1 час</option>
                            <option value="6">Каждые 6 часов</option>
                            <option value="12">Каждые 12 часов</option>
                            <option value="24">Раз в сутки (Ночной бэкап, 24 ч)</option>
                            <option value="168">Раз в неделю (168 ч)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 font-semibold mb-1">
                            SSH Логин по умолчанию:
                          </label>
                          <input
                            type="text"
                            value={scheduleSettings?.credentials?.username || ''}
                            onChange={(e) => setScheduleSettings(prev => ({
                              ...prev,
                              credentials: { ...(prev.credentials || {}), username: e.target.value }
                            }))}
                            placeholder="admin"
                            className={`w-full h-9 px-3 rounded-lg border text-xs font-mono outline-none ${
                              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 font-semibold mb-1">
                            SSH Порт по умолчанию:
                          </label>
                          <input
                            type="number"
                            value={scheduleSettings?.credentials?.port || 22}
                            onChange={(e) => setScheduleSettings(prev => ({
                              ...prev,
                              credentials: { ...(prev.credentials || {}), port: parseInt(e.target.value) || 22 }
                            }))}
                            placeholder="22"
                            className={`w-full h-9 px-3 rounded-lg border text-xs font-mono outline-none ${
                              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveSchedule(scheduleSettings)}
                          disabled={savingSchedule}
                          className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all"
                        >
                          {savingSchedule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Сохранить настройки</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: GIT-BACKED REPOSITORY & COMMITS */}
          {activeTab === 'git' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <GitBranch className="w-5 h-5 text-indigo-500" />
                      <span>Git-Репозиторий конфигураций оборудования</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Каждая ревизия running-config сохраняется в версионируемый репозиторий Git (<code className="font-mono">data/git-backups</code>) с привязкой к автору и меткам времени.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCommitCurrentSwitch}
                      disabled={committingGit}
                      className="h-9 px-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      {committingGit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5" />}
                      <span>Закоммитить {switchData.name}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncAllGit}
                      disabled={syncingGit}
                      className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-xs"
                    >
                      {syncingGit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      <span>Синхронизировать все в Git</span>
                    </button>
                  </div>
                </div>

                {gitMsg && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    gitMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {gitMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{gitMsg.text}</span>
                  </div>
                )}

                {loadingGit ? (
                  <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="text-xs">Загрузка данных Git-репозитория...</span>
                  </div>
                ) : (
                  <>
                    {/* Repository KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className={`p-3.5 rounded-xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}>
                        <span className="text-[11px] text-slate-400 block font-medium">Каталог репозитория:</span>
                        <span className="font-mono text-xs font-bold text-slate-200 truncate block mt-0.5">
                          {gitStatus?.repoPath || 'data/git-backups'}
                        </span>
                      </div>

                      <div className={`p-3.5 rounded-xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}>
                        <span className="text-[11px] text-slate-400 block font-medium">Всего коммитов:</span>
                        <span className="font-mono text-base font-bold text-indigo-400 block mt-0.5">
                          {gitStatus?.commitsCount || 0}
                        </span>
                      </div>

                      <div className={`p-3.5 rounded-xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}>
                        <span className="text-[11px] text-slate-400 block font-medium">Файлов конфигураций:</span>
                        <span className="font-mono text-base font-bold text-emerald-400 block mt-0.5">
                          {gitStatus?.filesCount || 0}
                        </span>
                      </div>
                    </div>

                    {/* Remote Git Sync (GitLab / GitHub / Gitea) */}
                    <div className={`p-4 rounded-xl border space-y-3 ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ExternalLink className="w-4 h-4 text-purple-400" />
                          <h4 className="text-xs font-bold text-slate-200">
                            Удаленный Git-репозиторий (Remote Origin)
                          </h4>
                        </div>
                        {gitStatus?.remoteUrl && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Remote подключен
                          </span>
                        )}
                      </div>

                      <form onSubmit={handleSaveGitRemote} className="flex gap-2">
                        <input
                          type="text"
                          value={remoteGitUrl}
                          onChange={(e) => setRemoteGitUrl(e.target.value)}
                          placeholder="git@gitlab.corp.local:network/switch-configs.git или https://github.com/org/repo.git"
                          className={`flex-1 h-9 px-3 rounded-lg border text-xs font-mono outline-none ${
                            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                          }`}
                        />
                        <button
                          type="submit"
                          disabled={savingGitRemote}
                          className="h-9 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer transition-colors shrink-0"
                        >
                          {savingGitRemote ? 'Сохранение...' : 'Задать Remote'}
                        </button>
                        {gitStatus?.remoteUrl && (
                          <button
                            type="button"
                            onClick={handlePushGit}
                            disabled={pushingGit}
                            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                          >
                            {pushingGit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            <span>Git Push</span>
                          </button>
                        )}
                      </form>
                    </div>

                    {/* Commit History Log */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex flex-col">
                      <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                          <GitCommit className="w-4 h-4 text-indigo-400" />
                          <span>История коммитов (Git Log)</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ветка: main/master
                        </span>
                      </div>

                      <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
                        {!gitStatus?.commits || gitStatus.commits.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">
                            В репозитории пока нет коммитов. Нажмите «Синхронизировать все в Git».
                          </div>
                        ) : (
                          gitStatus.commits.map(c => (
                            <div key={c.hash} className="p-3 hover:bg-slate-900/50 transition-colors flex items-start justify-between gap-3 text-xs">
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded-xs border border-indigo-500/20 text-[10px]">
                                    {c.shortHash}
                                  </span>
                                  <span className="font-mono font-medium text-slate-200 truncate">
                                    {c.message}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                  <span>{c.author}</span>
                                  <span>•</span>
                                  <span>{new Date(c.date).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Files inside repo */}
                    {gitStatus?.files && gitStatus.files.length > 0 && (
                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                        <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 text-xs font-bold text-slate-300">
                          Файлы в Git-репозитории ({gitStatus.files.length})
                        </div>
                        <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                          {gitStatus.files.map(f => (
                            <div key={f.path} className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/60 flex items-center justify-between text-slate-300">
                              <span className="truncate text-blue-400">{f.path}</span>
                              <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                                {Math.round(f.sizeBytes / 1024 * 10) / 10} КБ
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ROLLBACK MODAL DRAWER */}
        {showRollbackModal && rollbackResult && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className={`w-full max-w-4xl max-h-[90vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}>
              {/* Header */}
              <div className={`p-4 border-b flex items-center justify-between ${
                isLight ? 'bg-amber-50/80 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Скрипт отката конфигурации</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {switchData.vendor || 'RouterOS'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Откат нежелательных изменений ревизии B к базовой ревизии A на устройстве <strong>{switchData.name}</strong>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowRollbackModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stats Bar */}
              <div className={`px-4 py-2 border-b flex items-center justify-between text-xs font-mono ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">
                    Всего команд отката: <strong className="text-amber-500">{rollbackResult.rollbackCommandsCount}</strong>
                  </span>
                  <span className="text-rose-400">
                    Отмена добавленных: <strong>{rollbackResult.addedCount}</strong>
                  </span>
                  <span className="text-emerald-400">
                    Восстановление: <strong>{rollbackResult.removedCount}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rollbackResult.script);
                      setRollbackCopied(true);
                      setTimeout(() => setRollbackCopied(false), 2000);
                    }}
                    className="h-7 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {rollbackCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{rollbackCopied ? 'Скопировано!' : 'Копировать'}</span>
                  </button>
                  <button
                    onClick={handleDownloadRollback}
                    className="h-7 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать скрипт</span>
                  </button>
                </div>
              </div>

              {/* Status alerts */}
              {rollbackSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <pre className="whitespace-pre-wrap font-mono">{rollbackSuccessMsg}</pre>
                </div>
              )}
              {rollbackError && (
                <div className="p-3 bg-rose-500/10 border-b border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{rollbackError}</span>
                </div>
              )}

              {/* Script code preview */}
              <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-200 leading-relaxed max-h-80 select-text">
                <pre className="space-y-0.5">
                  {rollbackResult.script.split('\n').map((line, idx) => (
                    <div key={idx} className="flex hover:bg-slate-900 px-1 rounded-xs">
                      <span className="w-8 shrink-0 text-slate-600 select-none text-right pr-3 text-[11px]">
                        {idx + 1}
                      </span>
                      <span className={line.startsWith('#') || line.startsWith('!') ? 'text-slate-500 italic' : line.startsWith('/') || line.startsWith('configure') ? 'text-cyan-400 font-bold' : line.includes('remove') || line.includes('no ') ? 'text-rose-400' : 'text-emerald-400'}>
                        {line}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>

              {/* SSH Credentials & Execution Footer */}
              <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-medium">SSH доступ:</span>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="Хост IP"
                    className="h-8 w-28 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white outline-none"
                  />
                  <input
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="Логин"
                    className="h-8 w-20 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white outline-none"
                  />
                  <input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="Пароль"
                    className="h-8 w-24 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowRollbackModal(false)}
                    className="h-9 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
                  >
                    Закрыть
                  </button>
                  <button
                    onClick={handleApplyRollback}
                    disabled={isApplyingRollback || !rollbackResult.rollbackCommandsCount}
                    className="h-9 px-4 rounded-xl bg-linear-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer transition-all disabled:opacity-50"
                  >
                    {isApplyingRollback ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Применение отката...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        <span>Применить откат на коммутатор (SSH)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
