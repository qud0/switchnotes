import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitCommit,
  RefreshCw,
  Server,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  ExternalLink,
  ChevronRight,
  FileCode,
  Layers,
  Sparkles,
  ArrowRight,
  Calendar,
  Eye,
  Sliders,
  ShieldCheck,
  Check,
  Send
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export function FleetGitBackupModal({ isOpen, onClose, theme = 'dark' }) {
  if (!isOpen) return null;

  const isLight = theme === 'light';
  const toast = useToast();

  // Active Tab: 'fleet' | 'commits' | 'diff' | 'sync'
  const [activeTab, setActiveTab] = useState('fleet');

  // Fleet & Git State
  const [fleetStatus, setFleetStatus] = useState(null);
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [collectingAll, setCollectingAll] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'SYNCED' | 'MODIFIED' | 'MISSING'

  // Diff State
  const [selectedCommitHash, setSelectedCommitHash] = useState(null);
  const [commitDiff, setCommitDiff] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Remote & Push State
  const [remoteUrl, setRemoteUrl] = useState('');
  const [savingRemote, setSavingRemote] = useState(false);
  const [pushingRemote, setPushingRemote] = useState(false);

  // Load status on mount
  useEffect(() => {
    loadFleetData();
  }, [isOpen]);

  const loadFleetData = async () => {
    setLoading(true);
    try {
      const statusRes = await api.getFleetGitStatus();
      setFleetStatus(statusRes);
      setRemoteUrl(statusRes?.remoteUrl || '');

      const commitsRes = await api.getFleetGitCommits(50);
      setCommits(commitsRes?.commits || []);
    } catch (err) {
      console.error('[FleetGitBackup] Ошибка загрузки данных:', err);
      toast?.error?.('Ошибка загрузки статуса Git-версионирования: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Inspect commit diff
  const handleInspectDiff = async (hash) => {
    setSelectedCommitHash(hash);
    setActiveTab('diff');
    setLoadingDiff(true);
    try {
      const diffData = await api.getGitCommitDiff(hash);
      setCommitDiff(diffData);
    } catch (err) {
      toast?.error?.('Ошибка загрузки diff: ' + err.message);
    } finally {
      setLoadingDiff(false);
    }
  };

  // Sync entire fleet to Git
  const handleSyncAllToGit = async () => {
    setSyncingAll(true);
    try {
      const res = await api.syncAllToGit('Fleet Sync Manager');
      toast?.success?.('Конфигурации флота успешно зафиксированы в Git!');
      await loadFleetData();
    } catch (err) {
      toast?.error?.('Ошибка синхронизации: ' + err.message);
    } finally {
      setSyncingAll(false);
    }
  };

  // Trigger SSH backup collection from all devices
  const handleCollectAllBackups = async () => {
    setCollectingAll(true);
    try {
      toast?.info?.('Запущен опрос всех коммутаторов по SSH...');
      const res = await api.triggerAllBackups();
      toast?.success?.(`Сбор завершен! Успешно: ${res.successfulCount}, ошибок: ${res.failedCount}`);
      await loadFleetData();
    } catch (err) {
      toast?.error?.('Ошибка сбора конфигураций: ' + err.message);
    } finally {
      setCollectingAll(false);
    }
  };

  // Commit single switch
  const handleCommitSingleSwitch = async (sw) => {
    try {
      const res = await api.commitSwitchToGit(sw.id, {
        author: 'Manual Admin Commit',
        message: `backup(${sw.name}): manual git snapshot of ${sw.vendor} configuration`
      });
      if (res.committed) {
        toast?.success?.(`Коммит создан для ${sw.name} (#${res.shortHash})`);
      } else {
        toast?.info?.(`Конфигурация ${sw.name} уже идентична последнему коммиту`);
      }
      await loadFleetData();
    } catch (err) {
      toast?.error?.(`Ошибка коммита ${sw.name}: ` + err.message);
    }
  };

  // Save remote URL
  const handleSaveRemote = async () => {
    setSavingRemote(true);
    try {
      await api.setGitRemote(remoteUrl);
      toast?.success?.('URL удаленного репозитория сохранен');
      await loadFleetData();
    } catch (err) {
      toast?.error?.('Ошибка сохранения Remote: ' + err.message);
    } finally {
      setSavingRemote(false);
    }
  };

  // Push to remote
  const handlePushRemote = async () => {
    setPushingRemote(true);
    try {
      const res = await api.pushGitRemote();
      toast?.success?.('Конфигурации успешно отправлены в удаленный Git репозиторий!');
    } catch (err) {
      toast?.error?.('Ошибка Git Push: ' + err.message);
    } finally {
      setPushingRemote(false);
    }
  };

  // Download ZIP
  const handleDownloadZip = () => {
    const url = api.downloadFleetArchiveUrl();
    window.location.href = url;
    toast?.success?.('Загрузка полного ZIP-архива конфигураций начата');
  };

  // Filtered devices
  const filteredFleet = (fleetStatus?.fleet || []).filter(item => {
    const q = searchQuery.toLowerCase();
    const matchSearch = item.name.toLowerCase().includes(q) ||
                        item.ip.toLowerCase().includes(q) ||
                        item.vendor.toLowerCase().includes(q) ||
                        item.model.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (statusFilter === 'SYNCED') return item.isCommitted && item.hasBackup;
    if (statusFilter === 'MODIFIED') return !item.isCommitted && item.hasBackup;
    if (statusFilter === 'MISSING') return !item.hasBackup;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-5xl rounded-2xl shadow-2xl border flex flex-col overflow-hidden max-h-[92vh] ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  Центр Git-версионирования и бэкапов флота
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Fleet Auto-Versioning
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Автоматический сбор `running-config`, аудит коммитов, построчный Diff и экспорт архива
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFleetData}
              disabled={loading}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Обновить статус"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top KPI Metrics Banner */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b text-xs ${
          isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">Флот оборудования</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-slate-900 dark:text-white">
              {fleetStatus?.totalSwitches || 0} <span className="text-xs font-normal text-slate-500">свитчей</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">Собрано бэкапов</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-emerald-600 dark:text-emerald-400">
              {fleetStatus?.backedUpCount || 0} <span className="text-xs font-normal text-slate-500">устройств</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
            <div className="text-[10px] font-mono uppercase text-slate-400">Git-коммитов в репо</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-blue-600 dark:text-blue-400">
              {fleetStatus?.commitsCount || commits.length || 0} <span className="text-xs font-normal text-slate-500">ревизий</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 truncate">
            <div className="text-[10px] font-mono uppercase text-slate-400">Удаленный репозиторий</div>
            <div className="text-xs font-mono font-semibold mt-1.5 truncate text-slate-700 dark:text-slate-300">
              {fleetStatus?.remoteUrl ? (
                <span className="text-purple-400 truncate block" title={fleetStatus.remoteUrl}>
                  {fleetStatus.remoteUrl.replace(/^https?:\/\//, '')}
                </span>
              ) : (
                <span className="text-slate-500">Локальный (не настроен)</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'fleet'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Флот оборудования</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
              {fleetStatus?.totalSwitches || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('commits')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'commits'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Лента Git-коммитов</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
              {commits.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('diff')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'diff'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Инспектор Diff</span>
            {selectedCommitHash && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 font-mono">
                #{selectedCommitHash.substring(0, 7)}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sync'
                ? 'border-blue-500 text-blue-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Синхронизация и Экспорт</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: FLEET SWITCHES */}
          {activeTab === 'fleet' && (
            <div className="space-y-4">
              {/* Toolbar & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Поиск по имени, IP, модели..."
                      className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-mono transition-colors focus:outline-none focus:border-blue-500 ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-800/80 border-slate-700 text-slate-100'
                      }`}
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-mono cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-800/80 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value="ALL">Все статусы</option>
                    <option value="SYNCED">В Git (Синхронизирован)</option>
                    <option value="MODIFIED">Есть изменения</option>
                    <option value="MISSING">Без бэкапа</option>
                  </select>
                </div>

                {/* Batch Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCollectAllBackups}
                    disabled={collectingAll}
                    className="px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${collectingAll ? 'animate-bounce' : ''}`} />
                    <span>Собрать со всего флота</span>
                  </button>

                  <button
                    onClick={handleSyncAllToGit}
                    disabled={syncingAll}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <GitCommit className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
                    <span>Закоммитить весь флот в Git</span>
                  </button>
                </div>
              </div>

              {/* Devices Table */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className={`border-b font-mono font-semibold uppercase text-[10px] ${
                    isLight ? 'bg-slate-100/80 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}>
                    <tr>
                      <th className="py-2.5 px-3">Устройство</th>
                      <th className="py-2.5 px-3">Вендор / Модель</th>
                      <th className="py-2.5 px-3">Файл в Git</th>
                      <th className="py-2.5 px-3 text-center">Статус Git</th>
                      <th className="py-2.5 px-3">Последний коммит</th>
                      <th className="py-2.5 px-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono">
                    {filteredFleet.length > 0 ? (
                      filteredFleet.map(sw => (
                        <tr key={sw.id} className="hover:bg-slate-500/5 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{sw.name}</div>
                            <div className="text-[10px] text-slate-400">{sw.ip}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            <div>{sw.vendor}</div>
                            <div className="text-[10px] text-slate-400">{sw.model}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 truncate max-w-[160px]">
                            {sw.gitFile}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {sw.isCommitted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Check className="w-3 h-3" />
                                <span>Синхронизирован</span>
                              </span>
                            ) : sw.hasBackup ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Не закоммичен</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                <span>Нет бэкапа</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {sw.lastCommitHash ? (
                              <div>
                                <span className="font-bold text-blue-400">#{sw.lastCommitHash}</span>
                                <div className="text-[10px]">{sw.lastCommitDate?.slice(0, 10) || '—'}</div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {sw.hasBackup && (
                              <button
                                onClick={() => handleCommitSingleSwitch(sw)}
                                className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-white text-[11px] transition-colors cursor-pointer"
                              >
                                Закоммитить
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center py-8 text-slate-500">
                          Устройства не найдены
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: COMMITS AUDIT FEED */}
          {activeTab === 'commits' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Хронология коммитов в репозитории (последние 50 ревизий):</span>
                <span>Всего: {commits.length} коммитов</span>
              </div>

              <div className="space-y-2.5">
                {commits.length > 0 ? (
                  commits.map((c) => (
                    <div
                      key={c.hash}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        selectedCommitHash === c.hash
                          ? 'border-blue-500 bg-blue-500/5'
                          : isLight
                          ? 'border-slate-200 bg-slate-50/50 hover:bg-slate-100'
                          : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                          <GitCommit className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-blue-400">
                              #{c.shortHash}
                            </span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white">
                              {c.message}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                            <span>Автор: <strong className="text-slate-800 dark:text-slate-300">{c.author}</strong></span>
                            <span>•</span>
                            <span>{c.date?.slice(0, 19).replace('T', ' ') || '—'}</span>
                          </div>

                          {/* Affected Files */}
                          {c.files && c.files.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {c.files.map((f, fIdx) => (
                                <span
                                  key={fIdx}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-300"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleInspectDiff(c.hash)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-500/10 text-blue-500 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Смотреть Diff</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-500 text-xs font-mono">
                    В Git-репозитории пока нет зафиксированных ревизий конфигураций.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIFF VIEWER */}
          {activeTab === 'diff' && (
            <div className="space-y-3">
              {commitDiff ? (
                <div>
                  {/* Diff Meta Header */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/40 mb-3 text-xs font-mono flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-500 dark:text-blue-400">Коммит #{commitDiff.shortHash}</span>
                        <span className="text-slate-900 dark:text-slate-200 font-bold">{commitDiff.message}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Автор: <span className="text-slate-800 dark:text-slate-300 font-semibold">{commitDiff.author}</span> • Дата: {commitDiff.date}
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('commits')}
                      className="text-xs text-blue-400 hover:underline cursor-pointer"
                    >
                      ← Назад к списку коммитов
                    </button>
                  </div>

                  {/* Diff Lines View */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto bg-[#0a0f1d] p-4 text-[11px] font-mono leading-relaxed text-slate-200">
                    <pre className="whitespace-pre">
                      {commitDiff.diff.split('\n').map((line, idx) => {
                        let lineClass = 'text-slate-400';
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          lineClass = 'bg-emerald-950/60 text-emerald-300 font-bold px-1 rounded-xs block';
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          lineClass = 'bg-red-950/60 text-red-300 font-bold px-1 rounded-xs block';
                        } else if (line.startsWith('@@')) {
                          lineClass = 'text-purple-400 font-bold my-1 block';
                        }

                        return (
                          <div key={idx} className={lineClass}>
                            {line || ' '}
                          </div>
                        );
                      })}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs font-mono">
                  Выберите коммит в <button onClick={() => setActiveTab('commits')} className="text-blue-400 underline">Ленте коммитов</button> для просмотра построчного diff.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYNC & EXPORT */}
          {activeTab === 'sync' && (
            <div className="space-y-6 max-w-3xl">
              {/* Remote Repository Configuration */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold font-mono">
                  <ExternalLink className="w-4 h-4 text-purple-400" />
                  <span>Удаленный репозиторий Git Remote (GitLab / GitHub / Gitea)</span>
                </div>
                <p className="text-xs text-slate-400">
                  Укажите адрес удаленного Git-репозитория для автоматической репликации и резервного хранения конфигураций в облаке или локальном GitLab.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={e => setRemoteUrl(e.target.value)}
                    placeholder="https://gitlab.company.com/network-team/switches.git"
                    className={`flex-1 px-3 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-none focus:border-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800/80 border-slate-700 text-slate-100'
                    }`}
                  />
                  <button
                    onClick={handleSaveRemote}
                    disabled={savingRemote}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-500/20 cursor-pointer disabled:opacity-50"
                  >
                    Сохранить Remote
                  </button>
                </div>

                {fleetStatus?.remoteUrl && (
                  <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-xs">
                    <span className="text-slate-400">Текущий remote: <code className="text-purple-300">{fleetStatus.remoteUrl}</code></span>
                    <button
                      onClick={handlePushRemote}
                      disabled={pushingRemote}
                      className="px-3.5 py-1.5 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className={`w-3.5 h-3.5 ${pushingRemote ? 'animate-bounce' : ''}`} />
                      <span>Отправить в GitLab (git push)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Full ZIP Archive Download Card */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold font-mono">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Экспорт полного архива конфигураций флота (.ZIP)</span>
                </div>
                <p className="text-xs text-slate-400">
                  Скачать упакованный ZIP-архив с актуальными файлами конфигураций всех коммутаторов сети, структурированными по папкам вендоров (SNR, MikroTik, Cisco) с датой и хэшем ревизии.
                </p>

                <div className="pt-1">
                  <button
                    onClick={handleDownloadZip}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать полный ZIP-архив сети</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 font-mono">
            Репозиторий: <code className="text-slate-300">data/git-backups</code>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
