import React, { useState, useEffect } from 'react';
import {
  History,
  Camera,
  RotateCcw,
  GitCompare,
  Trash2,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Shield,
  Layers,
  FileText,
  Plus,
  RefreshCw,
  Server,
  Cable,
  ArrowRight,
  Eye,
  Info
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function AuditHistoryView({
  switches = [],
  vlans = [],
  onRestoreCompleted,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('snapshots'); // 'snapshots' | 'audit'

  // Snapshots State
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSnapName, setNewSnapName] = useState('');
  const [newSnapAuthor, setNewSnapAuthor] = useState('admin');
  const [newSnapDesc, setNewSnapDesc] = useState('');
  const [creatingSnap, setCreatingSnap] = useState(false);

  // Diff Modal State
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);

  // Restore State
  const [restoringId, setRestoringId] = useState(null);

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFilterEntity, setAuditFilterEntity] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Initial Load
  useEffect(() => {
    loadSnapshots();
    loadAuditLogs();
  }, []);

  const loadSnapshots = async () => {
    try {
      setLoadingSnapshots(true);
      const data = await api.getSnapshots();
      setSnapshots(data || []);
    } catch (err) {
      console.error('Ошибка загрузки снимков:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const data = await api.getAuditLog(300);
      setAuditLogs(data || []);
    } catch (err) {
      console.error('Ошибка загрузки журнала аудита:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!newSnapName.trim()) return;
    try {
      setCreatingSnap(true);
      await api.createSnapshot({
        name: newSnapName.trim(),
        author: newSnapAuthor.trim() || 'admin',
        description: newSnapDesc.trim()
      });
      setNewSnapName('');
      setNewSnapDesc('');
      setIsCreateModalOpen(false);
      toast.success(`Контрольная точка «${newSnapName.trim()}» успешно создана`);
      await loadSnapshots();
      await loadAuditLogs();
    } catch (err) {
      toast.error(`Ошибка создания снимка: ${err.message}`);
    } finally {
      setCreatingSnap(false);
    }
  };

  const handleDeleteSnapshot = async (id, name) => {
    if (!window.confirm(`Удалить снимок конфигурации «${name}»?`)) return;
    try {
      await api.deleteSnapshot(id);
      toast.success(`Снимок «${name}» удален`);
      await loadSnapshots();
      await loadAuditLogs();
    } catch (err) {
      toast.error(`Ошибка удаления: ${err.message}`);
    }
  };

  const handleRestore = async (id, name) => {
    if (!window.confirm(`ВНИМАНИЕ! Вы собираетесь откатить всю конфигурацию сети к контрольной точке «${name}». Текущие несохраненные параметры будут перезаписаны. Продолжить?`)) {
      return;
    }
    try {
      setRestoringId(id);
      await api.restoreSnapshot(id);
      toast.success(`Конфигурация успешно восстановлена из снимка «${name}»!`);
      if (onRestoreCompleted) onRestoreCompleted();
      await loadSnapshots();
      await loadAuditLogs();
    } catch (err) {
      toast.error(`Ошибка восстановления: ${err.message}`);
    } finally {
      setRestoringId(null);
    }
  };

  const handleOpenDiff = async (id) => {
    try {
      setLoadingDiff(true);
      const diffData = await api.compareSnapshot(id);
      setSelectedDiff(diffData);
      setDiffModalOpen(true);
    } catch (err) {
      toast.error(`Ошибка получения различий: ${err.message}`);
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleClearAudit = async () => {
    if (!window.confirm('Очистить весь журнал действий аудита? Это действие необратимо.')) return;
    try {
      await api.clearAuditLog();
      toast.success('Журнал аудита успешно очищен');
      await loadAuditLogs();
    } catch (err) {
      toast.error(`Ошибка очистки журнала: ${err.message}`);
    }
  };

  const exportAuditCsv = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Дата и время', 'Действие', 'Сущность', 'ID', 'Пользователь', 'Детали'];
    const rows = filteredAuditLogs.map(item => [
      new Date(item.timestamp).toLocaleString('ru-RU'),
      item.action,
      item.entity,
      item.entityId,
      item.user || 'admin',
      `"${(item.details || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `switchbook-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditFilterEntity !== 'all' && log.entity !== auditFilterEntity) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      const matchText = (log.details || '').toLowerCase();
      const matchUser = (log.user || '').toLowerCase();
      const matchAction = (log.action || '').toLowerCase();
      const matchEntity = (log.entity || '').toLowerCase();
      return matchText.includes(q) || matchUser.includes(q) || matchAction.includes(q) || matchEntity.includes(q);
    }
    return true;
  });

  const getActionBadge = (action) => {
    switch (action) {
      case 'create':
      case 'create_snapshot':
        return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Создание</span>;
      case 'update':
      case 'edit':
        return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">Изменение</span>;
      case 'delete':
      case 'delete_snapshot':
        return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Удаление</span>;
      case 'restore_snapshot':
      case 'rollback':
        return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Откат</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">{action}</span>;
    }
  };

  const getEntityIcon = (entity) => {
    switch (entity) {
      case 'switch':
      case 'port':
        return <Server className="w-3.5 h-3.5 text-blue-500" />;
      case 'vlan':
        return <Layers className="w-3.5 h-3.5 text-indigo-500" />;
      case 'patchPanel':
        return <Cable className="w-3.5 h-3.5 text-purple-500" />;
      case 'snapshot':
        return <Camera className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto pb-12">
      {/* Top Banner & Tab Controls */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-linear-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Журнал изменений и версионирование
                </h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Config History & Audit
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Контрольные точки сетевой инфраструктуры, визуальный Diff коммутаторов и детальный аудит действий администраторов
              </p>
            </div>
          </div>

          {/* Action Buttons & Tabs */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className={`flex items-center p-1 rounded-xl border ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/80 border-slate-700/80'
            }`}>
              <button
                onClick={() => setActiveTab('snapshots')}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'snapshots'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Снимки конфигурации ({snapshots.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Журнал действий ({auditLogs.length})</span>
              </button>
            </div>

            {activeTab === 'snapshots' ? (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="h-9 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать снимок</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={exportAuditCsv}
                  className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                  title="Экспорт в CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Экспорт CSV</span>
                </button>
                <button
                  onClick={handleClearAudit}
                  className="h-9 px-3 rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Очистить журнал"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Очистить</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: SNAPSHOTS & VERSIONING */}
      {activeTab === 'snapshots' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Сохраненные контрольные точки ({snapshots.length})
            </span>
            <button
              onClick={loadSnapshots}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshots ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>

          {snapshots.length === 0 ? (
            <div className={`p-12 text-center rounded-2xl border border-dashed ${
              isLight ? 'border-slate-300 bg-slate-50/50' : 'border-slate-800 bg-slate-900/40'
            }`}>
              <Camera className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Контрольных точек пока нет
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto mb-4">
                Создайте снимок текущей конфигурации для возможности безопасного отката или сравнения портов в будущем.
              </p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Создать первый снимок
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    isLight
                      ? 'bg-white border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md'
                      : 'bg-slate-900 border-slate-800 hover:border-purple-500/50'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                            {snap.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(snap.timestamp).toLocaleString('ru-RU')}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                        {snap.author || 'admin'}
                      </span>
                    </div>

                    {snap.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                        {snap.description}
                      </p>
                    )}

                    {/* Stats */}
                    {snap.stats && (
                      <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-slate-800/80 text-center">
                        <div>
                          <div className="text-[10px] text-slate-400">Коммутаторы</div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-200">{snap.stats.switchesCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Порты</div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-200">{snap.stats.portsCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">VLANs</div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-200">{snap.stats.vlansCount}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-4 flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleOpenDiff(snap.id)}
                      disabled={loadingDiff}
                      className={`flex-1 h-9 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isLight
                          ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                          : 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
                      }`}
                      title="Сравнить текущее состояние со снимком"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>Различия (Diff)</span>
                    </button>

                    <button
                      onClick={() => handleRestore(snap.id, snap.name)}
                      disabled={restoringId === snap.id}
                      className="h-9 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="Откатить текущую сеть к этому снимку"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${restoringId === snap.id ? 'animate-spin' : ''}`} />
                      <span>Откат</span>
                    </button>

                    <button
                      onClick={() => handleDeleteSnapshot(snap.id, snap.name)}
                      className="h-9 w-9 rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-all cursor-pointer shrink-0"
                      title="Удалить снимок"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOG FEED */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5" /> Фильтр:
              </span>
              {[
                { id: 'all', label: 'Все' },
                { id: 'switch', label: 'Коммутаторы' },
                { id: 'vlan', label: 'VLANs' },
                { id: 'patchPanel', label: 'Патч-панели' },
                { id: 'snapshot', label: 'Снимки' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setAuditFilterEntity(f.id)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    auditFilterEntity === f.id
                      ? 'bg-purple-600 text-white'
                      : isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64 h-9">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Поиск по журналу..."
                className={`w-full h-9 border rounded-xl pl-9 pr-3 text-xs outline-none transition-all placeholder-slate-400 focus:border-purple-500 ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
              />
            </div>
          </div>

          {/* Feed List */}
          <div className={`rounded-2xl border divide-y overflow-hidden ${
            isLight ? 'bg-white border-slate-200 divide-slate-100' : 'bg-slate-900 border-slate-800 divide-slate-800/60'
          }`}>
            {filteredAuditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Событий аудита по заданному фильтру не найдено
              </div>
            ) : (
              filteredAuditLogs.map((item) => (
                <div key={item.id} className="p-3.5 sm:px-5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      {getEntityIcon(item.entity)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionBadge(item.action)}
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {item.details}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          {item.user || 'admin'}
                        </span>
                        <span>•</span>
                        <span>{new Date(item.timestamp).toLocaleString('ru-RU')}</span>
                        {item.entityId && (
                          <>
                            <span>•</span>
                            <span className="text-[10px] text-slate-500">ID: {item.entityId}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE SNAPSHOT */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-xl ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-purple-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Создать снимок конфигурации
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Название снимка *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Перед перенастройкой ядра VLAN 20"
                  value={newSnapName}
                  onChange={(e) => setNewSnapName(e.target.value)}
                  className={`w-full h-9 px-3 rounded-xl border text-xs outline-none transition-all ${
                    isLight ? 'bg-slate-50 border-slate-300 focus:bg-white' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Автор / Администратор
                </label>
                <input
                  type="text"
                  value={newSnapAuthor}
                  onChange={(e) => setNewSnapAuthor(e.target.value)}
                  className={`w-full h-9 px-3 rounded-xl border text-xs outline-none transition-all ${
                    isLight ? 'bg-slate-50 border-slate-300 focus:bg-white' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Описание или комментарий
                </label>
                <textarea
                  rows={3}
                  placeholder="Причина фиксации состояния, планируемые работы..."
                  value={newSnapDesc}
                  onChange={(e) => setNewSnapDesc(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs outline-none transition-all resize-none ${
                    isLight ? 'bg-slate-50 border-slate-300 focus:bg-white' : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className={`h-9 px-4 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={creatingSnap}
                  className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {creatingSnap ? 'Сохранение...' : 'Создать снимок'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DIFF COMPARISON VIEWER */}
      {diffModalOpen && selectedDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border flex flex-col shadow-2xl overflow-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            {/* Diff Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Сравнение со снимком: «{selectedDiff.snapshot?.name}»
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Снимок от {new Date(selectedDiff.snapshot?.timestamp).toLocaleString('ru-RU')} • Автор: {selectedDiff.snapshot?.author}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDiffModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Diff Content Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                selectedDiff.diff.totalChanges > 0
                  ? isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  : isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}>
                <div className="flex items-center gap-2">
                  {selectedDiff.diff.totalChanges > 0 ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  )}
                  <span>
                    {selectedDiff.diff.totalChanges > 0
                      ? `Обнаружено расхождений: ${selectedDiff.diff.totalChanges}`
                      : 'Конфигурация полностью совпадает со снимком! Изменений нет.'}
                  </span>
                </div>
              </div>

              {/* Changed Switches & Ports */}
              {selectedDiff.diff.switches.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Изменения в коммутаторах ({selectedDiff.diff.switches.length})
                  </h4>
                  {selectedDiff.diff.switches.map((swDiff, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border overflow-hidden ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/80'
                      }`}
                    >
                      <div className="px-4 py-2.5 font-bold text-xs bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-slate-900 dark:text-white">
                          <Server className="w-3.5 h-3.5 text-blue-500" />
                          {swDiff.switchName}
                        </span>
                        <span className="text-[11px] font-normal text-slate-400">
                          Измененных портов: {swDiff.changedPorts?.length || 0}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {swDiff.changedPorts?.map((portDiff, pIdx) => (
                          <div key={pIdx} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 font-mono flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                              {portDiff.portName}
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[11px]">
                              {/* Before in Snapshot */}
                              <div className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <span className="text-[9px] uppercase block text-rose-500 font-sans">В снимке:</span>
                                PVID: {portDiff.snapshotPort.pvid} | Режим: {portDiff.snapshotPort.mode} {portDiff.snapshotPort.connection ? `(${portDiff.snapshotPort.connection})` : ''}
                              </div>
                              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                              {/* Current */}
                              <div className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <span className="text-[9px] uppercase block text-emerald-500 font-sans">Сейчас:</span>
                                PVID: {portDiff.currentPort.pvid} | Режим: {portDiff.currentPort.mode} {portDiff.currentPort.connection ? `(${portDiff.currentPort.connection})` : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Changed VLANs */}
              {selectedDiff.diff.vlans.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Изменения в пуле VLAN ({selectedDiff.diff.vlans.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedDiff.diff.vlans.map((vDiff, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                          vDiff.type === 'added'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <span className="font-semibold flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5" />
                          VLAN {vDiff.vlanId} ({vDiff.name})
                        </span>
                        <span className="font-mono text-[10px] uppercase font-bold">
                          {vDiff.type === 'added' ? '+ Добавлен в текущую конфигурацию' : '- Отсутствует (был в снимке)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Diff Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setDiffModalOpen(false)}
                className={`h-9 px-4 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Закрыть
              </button>

              <button
                onClick={() => {
                  setDiffModalOpen(false);
                  handleRestore(selectedDiff.snapshot.id, selectedDiff.snapshot.name);
                }}
                className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Откатить к этой версии
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
