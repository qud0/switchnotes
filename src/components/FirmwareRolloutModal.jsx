import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  HardDrive,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Play,
  RotateCcw,
  Server,
  Layers,
  ArrowRight,
  Terminal,
  Clock,
  Radio,
  FileCheck,
  ChevronRight
} from 'lucide-react';
import { api } from '../api';

export function FirmwareRolloutModal({ isOpen, onClose, switches = [], theme = 'dark' }) {
  const isLight = theme === 'light';

  // Wizard state: 1 (Catalog) -> 2 (Preflight) -> 3 (Strategy) -> 4 (Execution)
  const [step, setStep] = useState(1);

  // Data & Selection state
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedFirmwareId, setSelectedFirmwareId] = useState('');
  const [selectedSwitchIds, setSelectedSwitchIds] = useState(new Set());
  const [canarySwitchId, setCanarySwitchId] = useState('');
  const [batchSize, setBatchSize] = useState(2);
  const [autoRollback, setAutoRollback] = useState(true);
  const [isSimulation, setIsSimulation] = useState(true);

  // Pre-flight state
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightReport, setPreflightReport] = useState(null);
  const [preflightError, setPreflightError] = useState(null);

  // Rollout Execution state
  const [rolloutId, setRolloutId] = useState(null);
  const [rolloutState, setRolloutState] = useState(null);
  const [isStartingRollout, setIsStartingRollout] = useState(false);
  const [abortLoading, setAbortLoading] = useState(false);

  const logsEndRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Load catalog on open
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setPreflightReport(null);
    setRolloutId(null);
    setRolloutState(null);

    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const data = await api.getFirmwareCatalog();
        const list = data?.catalog || [];
        setCatalog(list);
        if (list.length > 0 && !selectedFirmwareId) {
          setSelectedFirmwareId(list[0].id);
        }
      } catch (err) {
        console.error('Ошибка загрузки каталога прошивок:', err);
      } finally {
        setCatalogLoading(false);
      }
    };

    loadCatalog();
  }, [isOpen]);

  // Auto-select compatible switches when firmware changes
  useEffect(() => {
    if (!selectedFirmwareId || catalog.length === 0) return;
    const fw = catalog.find(f => f.id === selectedFirmwareId);
    if (!fw) return;

    const compatible = switches.filter(s => {
      const swV = (s.vendor || '').toLowerCase();
      const fwV = (fw.vendor || '').toLowerCase();
      return swV.includes(fwV) || fwV.includes(swV);
    });

    const newSet = new Set(compatible.map(s => s.id));
    setSelectedSwitchIds(newSet);

    // Pick first non-core switch as default canary
    const nonCore = compatible.find(s => {
      const role = (s.role || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      return role !== 'core' && role !== 'distribution' && !name.includes('core');
    });
    setCanarySwitchId(nonCore?.id || compatible[0]?.id || '');
  }, [selectedFirmwareId, catalog, switches]);

  // Polling for rollout status in step 4
  useEffect(() => {
    if (step !== 4 || !rolloutId) return;

    const poll = async () => {
      try {
        const status = await api.getFirmwareRolloutStatus(rolloutId);
        setRolloutState(status);
        if (status?.status === 'COMPLETED' || status?.status === 'ABORTED' || status?.status === 'FAILED') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      } catch (e) {
        // ignore
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [step, rolloutId]);

  // Scroll to bottom of log terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [rolloutState?.logs]);

  if (!isOpen) return null;

  const currentFirmware = catalog.find(f => f.id === selectedFirmwareId);

  // Handlers
  const handleRunPreflight = async () => {
    if (selectedSwitchIds.size === 0) return;
    setPreflightLoading(true);
    setPreflightError(null);
    try {
      const report = await api.runFirmwarePreflight({
        switchIds: Array.from(selectedSwitchIds),
        canaryIds: canarySwitchId ? [canarySwitchId] : [],
        firmwareId: selectedFirmwareId,
        isSimulation
      });
      setPreflightReport(report);
      setStep(2);
    } catch (err) {
      setPreflightError(err.message || 'Ошибка выполнения Pre-Flight аудита');
    } finally {
      setPreflightLoading(false);
    }
  };

  const handleStartRollout = async () => {
    setIsStartingRollout(true);
    try {
      const res = await api.startFirmwareRollout({
        switchIds: Array.from(selectedSwitchIds),
        canaryIds: canarySwitchId ? [canarySwitchId] : [],
        firmwareId: selectedFirmwareId,
        batchSize: parseInt(batchSize, 10),
        autoRollback,
        isSimulation
      });
      setRolloutId(res.rolloutId);
      setStep(4);
    } catch (err) {
      alert(`Ошибка запуска конвейера: ${err.message}`);
    } finally {
      setIsStartingRollout(false);
    }
  };

  const handleAbort = async () => {
    if (!rolloutId) return;
    setAbortLoading(true);
    try {
      await api.abortFirmwareRollout(rolloutId);
      const updated = await api.getFirmwareRolloutStatus(rolloutId);
      setRolloutState(updated);
    } catch (err) {
      alert(`Ошибка остановки: ${err.message}`);
    } finally {
      setAbortLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Firmware Multi-Stage Canary Rollout
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
                  Safe Dual-Boot
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Поэтапное обновление прошивок SNR NAG и MikroTik RouterOS с Canary-пилотом и авто-откатом
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Simulation toggle */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSimulation}
                onChange={(e) => setIsSimulation(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-[11px] font-mono">Демо-симуляция</span>
            </label>

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between text-xs">
          {[
            { num: 1, label: '1. Образ и устройства' },
            { num: 2, label: '2. Pre-Flight Аудит' },
            { num: 3, label: '3. Canary Стратегия' },
            { num: 4, label: '4. Конвейер раскатки' }
          ].map(s => (
            <div
              key={s.num}
              className={`flex items-center gap-2 font-medium transition-all ${
                step === s.num
                  ? 'text-purple-600 dark:text-purple-400 font-bold'
                  : step > s.num
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 opacity-60'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                step === s.num
                  ? 'bg-purple-600 text-white'
                  : step > s.num
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}>
                {step > s.num ? '✓' : s.num}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* STEP 1: Select Firmware and Switches */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Выберите образ прошивки из проверенного репозитория:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catalog.map(fw => {
                    const isSelected = selectedFirmwareId === fw.id;
                    return (
                      <div
                        key={fw.id}
                        onClick={() => setSelectedFirmwareId(fw.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-300 shadow-sm'
                            : (isLight ? 'bg-slate-50 border-slate-200 hover:border-slate-300' : 'bg-slate-800/40 border-slate-800 hover:border-slate-700')
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs">{fw.model}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                            {fw.vendor}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white">
                          v{fw.version}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                          {fw.description}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>{(fw.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                          <span className="truncate max-w-[120px]" title={fw.sha256}>SHA: {fw.sha256?.slice(0, 10)}...</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Switches Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Целевые коммутаторы ({selectedSwitchIds.size} выбрано):
                  </label>
                  <button
                    onClick={() => {
                      if (selectedSwitchIds.size === switches.length) setSelectedSwitchIds(new Set());
                      else setSelectedSwitchIds(new Set(switches.map(s => s.id)));
                    }}
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    {selectedSwitchIds.size === switches.length ? 'Снять выделение' : 'Выбрать все'}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {switches.map(sw => {
                    const isSelected = selectedSwitchIds.has(sw.id);
                    const swVendor = (sw.vendor || '').toLowerCase();
                    const fwVendor = (currentFirmware?.vendor || '').toLowerCase();
                    const isCompatible = swVendor.includes(fwVendor) || fwVendor.includes(swVendor);

                    return (
                      <div
                        key={sw.id}
                        onClick={() => {
                          setSelectedSwitchIds(prev => {
                            const next = new Set(prev);
                            if (next.has(sw.id)) next.delete(sw.id);
                            else next.add(sw.id);
                            return next;
                          });
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-500/10 border-purple-500/40'
                            : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/30 border-slate-800')
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <Server className="w-4 h-4 text-slate-400" />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white font-mono">{sw.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              {sw.ip || 'Без IP'} • {sw.model || sw.vendor}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            isCompatible
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          }`}>
                            {isCompatible ? 'Совместим' : 'Несовместим'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase font-mono">
                            {sw.role || 'access'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Pre-Flight Audit Results */}
          {step === 2 && preflightReport && (
            <div className="space-y-4">
              {/* Overall status banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                preflightReport.overallStatus === 'READY'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : preflightReport.overallStatus === 'WARNING'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}>
                <div className="flex items-center gap-2.5">
                  {preflightReport.overallStatus === 'READY' ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : preflightReport.overallStatus === 'WARNING' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {preflightReport.overallStatus === 'READY'
                        ? 'Pre-Flight Аудит успешно пройден: Все устройства готовы к обновлению'
                        : preflightReport.overallStatus === 'WARNING'
                        ? 'Pre-Flight Аудит завершен с предупреждениями'
                        : 'Pre-Flight Блокировка: Обнаружены нарушения Guardrails'}
                    </div>
                    <div className="text-[11px] opacity-90">
                      Готово: {preflightReport.readyCount} из {preflightReport.totalTargets}. Заблокировано: {preflightReport.blockedCount}.
                    </div>
                  </div>
                </div>
              </div>

              {/* Targets detail table */}
              <div className="space-y-2">
                {preflightReport.targets.map(t => {
                  const freeMb = (t.freeSpaceBytes / (1024 * 1024)).toFixed(1);
                  const reqMb = (t.requiredSpaceBytes / (1024 * 1024)).toFixed(1);

                  return (
                    <div
                      key={t.switchId}
                      className={`p-3 rounded-xl border text-xs ${
                        !t.canUpgrade
                          ? 'bg-rose-500/5 border-rose-500/30'
                          : t.warnings.length > 0
                          ? 'bg-amber-500/5 border-amber-500/30'
                          : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/30 border-slate-800')
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-slate-900 dark:text-white">{t.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({t.ip})</span>
                          {t.isCanary && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold uppercase">
                              Canary Pilot
                            </span>
                          )}
                        </div>

                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          t.canUpgrade
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          {t.canUpgrade ? '✓ READY' : '✕ BLOCKED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <div>
                          Flash память: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{freeMb} MB</span> (требуется {reqMb} MB)
                        </div>
                        <div>
                          Текущая версия: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{t.currentVersion}</span>
                        </div>
                        <div>
                          Целевая версия: <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">v{t.targetVersion}</span>
                        </div>
                      </div>

                      {t.violations.length > 0 && (
                        <div className="mt-2 text-rose-500 text-[11px] font-medium flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{t.violations.join('; ')}</span>
                        </div>
                      )}

                      {t.warnings.length > 0 && (
                        <div className="mt-1 text-amber-500 text-[11px] font-medium flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{t.warnings.join('; ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Canary & Batch Strategy */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border bg-purple-500/5 border-purple-500/20 text-xs">
                <div className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                  Принцип работы Canary-пилота:
                </div>
                <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                  Canary-коммутатор обновляется и перезагружается первым. Если он успешно выходит на связь и проходит пинг шлюза — обновление продолжается на остальную сеть. При сбое конвейер мгновенно останавливается с авто-откатом!
                </div>
              </div>

              {/* Select Canary Switch */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                  Выберите коммутатор уровня доступа для Canary-пилота:
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {switches.filter(s => selectedSwitchIds.has(s.id)).map(sw => {
                    const isSelected = canarySwitchId === sw.id;
                    const swRole = (sw.role || '').toLowerCase();
                    const swName = (sw.name || '').toLowerCase();
                    const isCore = swRole === 'core' || swRole === 'distribution' || swName.includes('core');

                    return (
                      <div
                        key={sw.id}
                        onClick={() => {
                          if (!isCore) setCanarySwitchId(sw.id);
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                          isCore
                            ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800'
                            : isSelected
                            ? 'bg-purple-500/10 border-purple-500 cursor-pointer shadow-xs'
                            : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="canarySwitch"
                            checked={isSelected}
                            disabled={isCore}
                            onChange={() => setCanarySwitchId(sw.id)}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold font-mono text-slate-900 dark:text-white">{sw.name}</span>
                            <span className="text-[11px] text-slate-500 ml-2 font-mono">({sw.ip})</span>
                          </div>
                        </div>

                        <div>
                          {isCore ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 font-mono">
                              Core (Заблокирован Guardrail)
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono font-bold">
                              Access Candidate
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Batch Concurrency & Safeguards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 text-xs">
                  <label className="font-semibold block mb-1">Размер пакета массовой раскатки:</label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  >
                    <option value={1}>По 1 коммутатору (Максимальная безопасность)</option>
                    <option value={2}>По 2 коммутатора (Рекомендуется)</option>
                    <option value={4}>По 4 коммутатора (Быстрая раскатка)</option>
                  </select>
                </div>

                <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 text-xs flex flex-col justify-center">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoRollback}
                      onChange={(e) => setAutoRollback(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold">Авто-откат (Auto-Rollback)</div>
                      <div className="text-[10px] text-slate-500">
                        Активировать вторичный boot-образ при сбое Canary
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Live Execution Pipeline */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Rollout Status Header Banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                rolloutState?.status === 'COMPLETED'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : rolloutState?.status === 'ABORTED' || rolloutState?.status === 'FAILED'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300'
              }`}>
                <div className="flex items-center gap-2.5">
                  <Activity className={`w-5 h-5 ${rolloutState?.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                  <div>
                    <div className="font-bold text-sm flex items-center gap-2">
                      Статус: {rolloutState?.status || 'Инициализация...'}
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-white/20">
                        Стадия: {rolloutState?.stage || 'INIT'}
                      </span>
                    </div>
                    <div className="text-[11px] opacity-90 font-mono">
                      Прошивка: {currentFirmware?.filename} (v{currentFirmware?.version})
                    </div>
                  </div>
                </div>

                {rolloutState?.status === 'RUNNING' && (
                  <button
                    onClick={handleAbort}
                    disabled={abortLoading}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Аварийная остановка</span>
                  </button>
                )}
              </div>

              {/* Switches Progress Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedSwitchIds && Array.from(selectedSwitchIds).map(id => {
                  const sState = rolloutState?.switchStates?.[id];
                  const sw = switches.find(s => s.id === id);
                  const isCanary = rolloutState?.canaryIds?.includes(id);

                  return (
                    <div
                      key={id}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        sState?.status === 'SUCCESS'
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : sState?.status === 'FAILED'
                          ? 'bg-rose-500/10 border-rose-500/40'
                          : sState?.status === 'SKIPPED'
                          ? 'opacity-50 border-slate-200 dark:border-slate-800'
                          : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800')
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold font-mono text-slate-900 dark:text-white">{sw?.name || id}</span>
                          {isCanary && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold uppercase">
                              Canary
                            </span>
                          )}
                        </div>

                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          sState?.status === 'SUCCESS'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : sState?.status === 'FAILED'
                            ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                            : 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                        }`}>
                          {sState?.status || 'PENDING'}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full transition-all duration-300 ${
                            sState?.status === 'FAILED' ? 'bg-rose-500' : 'bg-purple-600'
                          }`}
                          style={{ width: `${sState?.progress || 0}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Этап: {sState?.stage || 'Ожидание'}</span>
                        <span>{sState?.progress || 0}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Console Logs Terminal */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto space-y-1 shadow-inner">
                <div className="text-[10px] text-slate-500 border-b border-slate-800 pb-1 mb-1.5 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span>Журнал конвейера обновления прошивки в реальном времени:</span>
                </div>
                {rolloutState?.logs?.map((l, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed">
                    <span className="text-slate-500 text-[10px] shrink-0">
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={
                      l.level === 'error'
                        ? 'text-rose-400 font-bold'
                        : l.level === 'warn'
                        ? 'text-amber-400 font-semibold'
                        : 'text-slate-300'
                    }>
                      {l.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                ← Назад к выбору
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => setStep(2)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                ← Назад к аудиту
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
            >
              {step === 4 ? 'Свернуть' : 'Отмена'}
            </button>

            {step === 1 && (
              <button
                onClick={handleRunPreflight}
                disabled={preflightLoading || selectedSwitchIds.size === 0}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
              >
                {preflightLoading ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>Запустить Pre-Flight Аудит ({selectedSwitchIds.size})</span>
              </button>
            )}

            {step === 2 && (
              <button
                onClick={() => setStep(3)}
                disabled={preflightReport?.overallStatus === 'BLOCKED'}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
              >
                <span>Настроить Canary-раскатку</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 3 && (
              <button
                onClick={handleStartRollout}
                disabled={isStartingRollout || !canarySwitchId}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer"
              >
                {isStartingRollout ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                <span>Запустить конвейер обновления</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
