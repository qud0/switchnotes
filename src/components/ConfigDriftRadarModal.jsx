import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Zap,
  Server,
  Filter
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export function ConfigDriftRadarModal({
  isOpen,
  onClose,
  switches = [],
  onSelectSwitch,
  onReloadData,
  theme = 'dark'
}) {
  const toast = useToast();
  const isLight = theme === 'light';

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [schedule, setSchedule] = useState({
    enabled: true,
    intervalHours: 6,
    lastScanTime: null,
    nextScanTime: null
  });
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [isRollingBackAll, setIsRollingBackAll] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSwitchIds, setExpandedSwitchIds] = useState(new Set());
  const [activeTabBySwitch, setActiveTabBySwitch] = useState({}); // switchId -> 'diff' | 'rollback'
  const [copiedId, setCopiedId] = useState(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reportData, scheduleData] = await Promise.all([
        api.getDriftReport().catch(() => null),
        api.getDriftSchedule().catch(() => null)
      ]);
      if (reportData) {
        setReport(reportData);
        // Expand first drifted device by default for immediate visibility
        if (reportData.driftedSwitches?.length > 0) {
          setExpandedSwitchIds(new Set([reportData.driftedSwitches[0].switchId]));
        }
      }
      if (scheduleData) setSchedule(scheduleData);
    } catch (err) {
      console.error('Ошибка загрузки данных Config Drift Radar:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const toggleExpand = (swId) => {
    setExpandedSwitchIds(prev => {
      const next = new Set(prev);
      if (next.has(swId)) next.delete(swId);
      else next.add(swId);
      return next;
    });
  };

  const handleScanAll = async () => {
    setIsScanningAll(true);
    try {
      const res = await api.scanAllDrift();
      toast?.success(`Сканирование завершено: проверено ${res.scannedCount} свитчей (Дрифт: ${res.driftedCount}, В норме: ${res.inSyncCount})`);
      await loadData();
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast?.error(`Ошибка сканирования сети: ${err.message}`);
    } finally {
      setIsScanningAll(false);
    }
  };

  const handleUpdateSchedule = async (updates) => {
    try {
      const updated = await api.updateDriftSchedule({ ...schedule, ...updates });
      setSchedule(updated);
      toast?.success('Расписание фонового сканирования обновлено');
    } catch (err) {
      toast?.error(`Ошибка сохранения расписания: ${err.message}`);
    }
  };

  const handleAcceptSingle = async (swId) => {
    setActionInProgressId(swId);
    try {
      await api.reconcileAccept(swId);
      toast?.success('Текущая конфигурация утверждена как новый Golden Baseline');
      await loadData();
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast?.error(`Ошибка принятия эталона: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRollbackSingle = async (item) => {
    if (!item.isRollbackSafe) {
      if (!window.confirm(`ВНИМАНИЕ! Guardrails обнаружили риск: ${item.guardrailReason}\n\nВы действительно хотите форсировать откат?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Вы уверены, что хотите выполнить безопасный откат (${item.rollbackCommandsCount} команд) на ${item.switchName}? IP управления (${item.ip}) защищен Guardrails.`)) {
        return;
      }
    }

    setActionInProgressId(item.switchId);
    try {
      const res = await api.reconcileRollback(item.switchId, {
        commands: item.rollbackCommands,
        force: !item.isRollbackSafe
      });
      toast?.success(`Откат успешно выполнен: ${res.message || 'Конфигурация возвращена к эталону'}`);
      await loadData();
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast?.error(`Сбой отката: ${err.message}`);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleBatchRollback = async () => {
    const safeTargets = (report?.driftedSwitches || []).filter(s => s.isRollbackSafe);
    if (safeTargets.length === 0) {
      toast?.info('Нет доступных безопасных коммутаторов для автоматического отката');
      return;
    }

    if (!window.confirm(`Запустить безопасный откат сразу на ${safeTargets.length} коммутаторах?\n\nВсе команды проверены Guardrails и не затронут адреса управления.`)) {
      return;
    }

    setIsRollingBackAll(true);
    try {
      const res = await api.batchRollbackDrift(safeTargets.map(s => s.switchId));
      toast?.success(`Пакетный откат завершен: успешно ${res.rolledBackCount} из ${res.totalRequested}`);
      await loadData();
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast?.error(`Ошибка пакетного отката: ${err.message}`);
    } finally {
      setIsRollingBackAll(false);
    }
  };

  const handleCopyScript = (script, id) => {
    navigator.clipboard.writeText(script);
    setCopiedId(id);
    toast?.success('CLI скрипт отката скопирован в буфер обмена');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredSwitches = useMemo(() => {
    const list = report?.driftedSwitches || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s =>
      s.switchName?.toLowerCase().includes(q) ||
      s.ip?.includes(q) ||
      s.vendor?.toLowerCase().includes(q) ||
      s.model?.toLowerCase().includes(q)
    );
  }, [report, searchQuery]);

  const safeRollbackCount = useMemo(() => {
    return (report?.driftedSwitches || []).filter(s => s.isRollbackSafe).length;
  }, [report]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-none">
      <div
        className={`w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20 shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  Config Drift Radar & Auto-Rollback Engine
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Golden Baseline 2-Way Sync
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Автоматическое выявление несанкционированных изменений конфигураций по расписанию и безопасный откат
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
              title="Обновить отчет"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
              title="Закрыть (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Fleet KPI Banner */}
        <div className={`p-4 border-b grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          {/* Card 1: Total Switches */}
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <span className="text-[11px] text-slate-400 font-sans flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-blue-400" />
              Всего свитчей
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-slate-900 dark:text-white">
              {report?.totalSwitches ?? switches.length}
            </div>
          </div>

          {/* Card 2: In-Sync */}
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'
          }`}>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-sans flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              В норме (In Sync)
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
              {report?.inSyncCount ?? 0}
            </div>
          </div>

          {/* Card 3: Drifted */}
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            (report?.driftedCount || 0) > 0
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
              : (isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800 text-slate-400')
          }`}>
            <span className="text-[11px] font-sans flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              Обнаружен дрифт
            </span>
            <div className="text-xl font-bold font-mono mt-1 text-rose-500">
              {report?.driftedCount ?? 0}
            </div>
          </div>

          {/* Card 4: Automated Schedule Controls */}
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-sans flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Автоопрос сети
              </span>
              <button
                type="button"
                onClick={() => handleUpdateSchedule({ enabled: !schedule.enabled })}
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono cursor-pointer transition-colors ${
                  schedule.enabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {schedule.enabled ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-1 mt-1">
              <select
                value={schedule.intervalHours}
                onChange={(e) => handleUpdateSchedule({ intervalHours: Number(e.target.value) })}
                disabled={!schedule.enabled}
                className={`text-[11px] font-mono rounded border px-1.5 py-0.5 outline-none cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-700 text-amber-400'
                }`}
              >
                <option value={1}>Каждый 1 час</option>
                <option value={4}>Каждые 4 часа</option>
                <option value={6}>Каждые 6 часов</option>
                <option value={12}>Каждые 12 часов</option>
                <option value={24}>Каждые 24 часа</option>
              </select>
              <span className="text-[10px] text-slate-400 font-mono truncate">
                {schedule.lastScanTime ? `Был: ${new Date(schedule.lastScanTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Ожидает'}
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar: Actions & Search Filter */}
        <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
            <div className={`relative flex-1 flex items-center rounded-xl border px-2.5 py-1.5 ${
              isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Поиск по имени, IP или модели..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-500 font-mono"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Scan All Button */}
            <button
              onClick={handleScanAll}
              disabled={isScanningAll}
              className="h-8 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer transition-all text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningAll ? 'animate-spin' : ''}`} />
              <span>{isScanningAll ? 'Сканирование сети...' : 'Сканировать всю сеть'}</span>
            </button>

            {/* Batch Rollback Button */}
            {safeRollbackCount > 0 && (
              <button
                onClick={handleBatchRollback}
                disabled={isRollingBackAll}
                className="h-8 px-3 rounded-xl bg-linear-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-rose-500/20 cursor-pointer transition-all text-xs"
                title="Откатить все свитчи с безопасными Guardrails командами в 1 клик"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isRollingBackAll ? 'animate-spin' : ''}`} />
                <span>{isRollingBackAll ? 'Откат...' : `Откатить безопасные (${safeRollbackCount})`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && !report ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <span>Опрос и аудит конфигурационного дрифта сети...</span>
            </div>
          ) : filteredSwitches.length === 0 ? (
            <div className={`p-12 text-center rounded-2xl border flex flex-col items-center gap-3 ${
              isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-950/15 border-emerald-500/30'
            }`}>
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Конфигурационный дрифт не обнаружен!
              </h4>
              <p className="text-xs text-slate-400 max-w-md">
                Все коммутаторы сети соответствуют эталонам Golden Baseline. Несанкционированных изменений в running-config не зафиксировано.
              </p>
            </div>
          ) : (
            filteredSwitches.map((item) => {
              const isExpanded = expandedSwitchIds.has(item.switchId);
              const activeTab = activeTabBySwitch[item.switchId] || 'diff';
              const isBusy = actionInProgressId === item.switchId;

              return (
                <div
                  key={item.switchId}
                  className={`rounded-2xl border transition-all ${
                    isExpanded
                      ? 'shadow-xl'
                      : ''
                  } ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  {/* Card Header Bar */}
                  <div
                    onClick={() => toggleExpand(item.switchId)}
                    className={`p-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer rounded-2xl select-none ${
                      isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-mono font-bold text-sm text-slate-900 dark:text-white truncate">
                            {item.switchName}
                          </h4>
                          <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-semibold">
                            {item.ip}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.vendor} {item.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono">
                          <span>Расхождения:</span>
                          <span className="text-emerald-400 font-bold">+{item.diffStats.addedCount}</span>
                          <span>/</span>
                          <span className="text-rose-400 font-bold">-{item.diffStats.removedCount} строк</span>
                          <span>•</span>
                          <span>Проверено: {item.lastCheck ? new Date(item.lastCheck).toLocaleTimeString('ru-RU') : 'Только что'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Guardrails Safety Badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 border ${
                        item.isRollbackSafe
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                      }`} title={item.guardrailReason || 'Команды отката проверены Guardrails'}>
                        <Lock className="w-2.5 h-2.5" />
                        <span>{item.isRollbackSafe ? 'Guardrails: Безопасно' : 'Guardrail Alert'}</span>
                      </span>

                      {/* 1-Click Accept Baseline */}
                      <button
                        onClick={() => handleAcceptSingle(item.switchId)}
                        disabled={isBusy}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1 text-[11px] cursor-pointer transition-colors"
                        title="Утвердить текущие изменения как новый Golden Baseline"
                      >
                        <Check className="w-3 h-3" />
                        <span>Принять эталон</span>
                      </button>

                      {/* 1-Click Rollback */}
                      <button
                        onClick={() => handleRollbackSingle(item)}
                        disabled={isBusy || item.rollbackCommandsCount === 0}
                        className="h-7 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1 text-[11px] cursor-pointer shadow-sm transition-colors"
                        title="Откатить несанкционированные изменения к эталону"
                      >
                        <RotateCcw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>Откатить ({item.rollbackCommandsCount})</span>
                      </button>

                      <div
                        onClick={() => toggleExpand(item.switchId)}
                        className="p-1 text-slate-400 hover:text-white cursor-pointer ml-1"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Body: Diff & Rollback Script */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 p-3 bg-slate-950/90 space-y-3">
                      {/* Inner Tabs Switcher */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setActiveTabBySwitch(prev => ({ ...prev, [item.switchId]: 'diff' }))}
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              activeTab === 'diff'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>Построчный Diff ({item.diffStats.addedCount + item.diffStats.removedCount})</span>
                          </button>
                          <button
                            onClick={() => setActiveTabBySwitch(prev => ({ ...prev, [item.switchId]: 'rollback' }))}
                            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                              activeTab === 'rollback'
                                ? 'bg-amber-600 text-white'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Скрипт отката CLI ({item.rollbackCommandsCount})</span>
                          </button>
                        </div>

                        {activeTab === 'rollback' && item.rollbackScript && (
                          <button
                            onClick={() => handleCopyScript(item.rollbackScript, item.switchId)}
                            className="text-xs text-amber-400 hover:text-amber-300 font-mono flex items-center gap-1 cursor-pointer"
                          >
                            {copiedId === item.switchId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedId === item.switchId ? 'Скопировано!' : 'Копировать CLI'}</span>
                          </button>
                        )}
                      </div>

                      {/* Tab 1: Diff View */}
                      {activeTab === 'diff' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 px-1">
                            <span className="text-amber-400 font-bold">⭐ Golden Baseline (Эталон)</span>
                            <span className="text-rose-400 font-bold">⚡ Running-Config на свитче (Дрифт)</span>
                          </div>
                          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/90 p-2 font-mono text-[11px] leading-relaxed select-text space-y-0.5">
                            {(item.diffRows || []).filter(r => r.type !== 'unchanged').slice(0, 100).map((row, idx) => (
                              <div
                                key={idx}
                                className={`px-2 py-0.5 rounded flex items-start gap-2 ${
                                  row.type === 'added'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-rose-500/15 text-rose-300'
                                }`}
                              >
                                <span className="font-bold w-4 text-center shrink-0">
                                  {row.type === 'added' ? '+' : '-'}
                                </span>
                                <span className="break-all">{row.text || row.textB || row.textA}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tab 2: Rollback Script Preview */}
                      {activeTab === 'rollback' && (
                        <div className="space-y-2">
                          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-emerald-400">
                              <ShieldCheck className="w-4 h-4" />
                              <span>Guardrails гарантируют: IP ({item.ip}) и default-gateway не будут затронуты.</span>
                            </span>
                            <span className="text-slate-400">Вендор: {item.vendor}</span>
                          </div>
                          <pre className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/90 p-3 font-mono text-[11px] text-amber-300 select-text whitespace-pre-wrap leading-relaxed">
                            {item.rollbackScript || '# Нет команд отката'}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex items-center justify-between text-xs shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <span className="text-slate-400 font-mono text-[11px]">
            SwitchBook Config Drift Radar • Concurrency: 2 • Guardrails Fail-Safe Active
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
