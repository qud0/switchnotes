import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Zap,
  ArrowRight,
  ShieldAlert,
  Server,
  Layers,
  Activity,
  Globe,
  Radio,
  Sliders,
  Check,
  X,
  Copy,
  Download,
  Info,
  ChevronRight,
  Sparkles,
  Cpu,
  CornerDownRight,
  ExternalLink
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function TroubleshooterModal({
  isOpen,
  onClose,
  initialSwitchId = null,
  switches = [],
  vlans = [],
  onNavigateToSwitch,
  onReloadData,
  theme = 'dark'
}) {
  const toast = useToast();
  if (!isOpen) return null;

  const isLight = theme === 'light';

  const [selectedSwitchId, setSelectedSwitchId] = useState(initialSwitchId || switches[0]?.id || '');
  const [isRunning, setIsRunning] = useState(false);
  const [troubleshootData, setTroubleshootData] = useState(null);
  const [error, setError] = useState(null);
  
  // Filters
  const [layerFilter, setLayerFilter] = useState('all'); // 'all', 'L1', 'L2', 'L3', 'L4'
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all', 'critical', 'warning', 'info'
  const [searchQuery, setSearchQuery] = useState('');

  // Quick fix state
  const [fixingId, setFixingId] = useState(null);
  const [fixedIds, setFixedIds] = useState(new Set());
  const [fixSuccessMessage, setFixSuccessMessage] = useState(null);

  // Run troubleshooting
  const runDiagnostics = async (switchIdToRun) => {
    const swId = switchIdToRun || selectedSwitchId;
    setIsRunning(true);
    setError(null);
    setFixSuccessMessage(null);
    try {
      const data = await api.troubleshootNetwork({ switchId: swId });
      setTroubleshootData(data);
    } catch (err) {
      setError(err.message || 'Ошибка выполнения траблшутинга');
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const swId = initialSwitchId || switches[0]?.id || '';
      setSelectedSwitchId(swId);
      runDiagnostics(swId);
    }
  }, [isOpen, initialSwitchId]);

  // Handle Quick Fix
  const handleApplyFix = async (finding) => {
    if (!finding.quickFix) return;
    setFixingId(finding.id);
    try {
      await api.applyTroubleshootFix(finding.quickFix);
      setFixedIds(prev => new Set([...prev, finding.id]));
      setFixSuccessMessage(`Исправление для «${finding.title}» успешно применено!`);
      if (onReloadData) await onReloadData();
      
      // Auto re-run diagnostics after a brief delay
      setTimeout(() => {
        runDiagnostics(selectedSwitchId);
      }, 700);
    } catch (err) {
      toast.error(`Ошибка применения исправления: ${err.message}`);
    } finally {
      setFixingId(null);
    }
  };

  // Filtered findings
  const filteredFindings = useMemo(() => {
    if (!troubleshootData?.findings) return [];
    return troubleshootData.findings.filter(f => {
      if (fixedIds.has(f.id)) return false;
      if (layerFilter !== 'all' && f.layer !== layerFilter) return false;
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match = 
          (f.title || '').toLowerCase().includes(q) ||
          (f.description || '').toLowerCase().includes(q) ||
          (f.rootCause || '').toLowerCase().includes(q) ||
          (f.recommendation || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [troubleshootData, layerFilter, severityFilter, searchQuery, fixedIds]);

  // Export report to txt
  const handleExportReport = () => {
    if (!troubleshootData) return;
    const lines = [
      '====================================================================',
      '     ОТЧЕТ ИНТЕЛЛЕКТУАЛЬНОГО ТРАБЛШУТЕРА СЕТИ (SWITCHBOOK AI)      ',
      '====================================================================',
      `Дата и время: ${new Date(troubleshootData.timestamp).toLocaleString('ru-RU')}`,
      `Коммутатор:   ${troubleshootData.targetSwitch?.name || 'Все'} (${troubleshootData.targetSwitch?.ip || '—'})`,
      `Вендор:       ${troubleshootData.targetSwitch?.vendor || 'Generic'}`,
      `Индекс сети:  ${troubleshootData.healthScore} / 100`,
      `Вердикт:      ${troubleshootData.verdictTitle}`,
      `              ${troubleshootData.verdictMessage}`,
      '--------------------------------------------------------------------',
      `Критических неполадок: ${troubleshootData.counts.critical}`,
      `Предупреждений:        ${troubleshootData.counts.warning}`,
      `Рекомендаций:          ${troubleshootData.counts.info}`,
      '====================================================================',
      '',
      'ПОШАГОВАЯ ДЕТАЛИЗАЦИЯ И РЕКОМЕНДАЦИИ:',
      ''
    ];

    troubleshootData.findings.forEach((f, idx) => {
      lines.push(`[#${idx + 1}] [${f.layer}] [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`Описание:        ${f.description}`);
      lines.push(`Первопричина:    ${f.rootCause}`);
      lines.push(`Влияние:         ${f.impact}`);
      lines.push(`Решение:         ${f.recommendation}`);
      if (f.quickFix) {
        lines.push(`Быстрый фикс:    Доступно автоматическое исправление (${f.quickFix.actionLabel})`);
      }
      lines.push('--------------------------------------------------------------------');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `troubleshoot-${troubleshootData.targetSwitch?.name || 'network'}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentSw = switches.find(s => s.id === selectedSwitchId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className={`w-full max-w-5xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Wrench className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold tracking-tight">
                  Интеллектуальный «Траблшутер» неполадок
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  L1 - L4 Diagnostic Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Автоматическое выявление первопричин сбоев, разорванных транков, коллизий PVID и портов
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportReport}
              disabled={!troubleshootData}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title="Экспорт подробного отчета траблшутинга"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Экспорт отчета</span>
            </button>
            <button
              onClick={onClose}
              className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                isLight ? 'border-slate-200 hover:bg-slate-200 text-slate-500' : 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Target Switch Selector & Actions Strip */}
        <div className={`p-4 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">Целевой коммутатор:</span>
            <select
              value={selectedSwitchId}
              onChange={(e) => {
                setSelectedSwitchId(e.target.value);
                runDiagnostics(e.target.value);
              }}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold outline-none transition-colors cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-900 border-slate-700 text-white focus:border-amber-500'
              }`}
            >
              {switches.map(sw => (
                <option key={sw.id} value={sw.id}>
                  {sw.name} ({sw.ip || 'No IP'}) — {sw.vendor} {sw.model}
                </option>
              ))}
            </select>

            {currentSw && (
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                IP: {currentSw.ip || 'Не задан'}
              </span>
            )}
          </div>

          <button
            onClick={() => runDiagnostics(selectedSwitchId)}
            disabled={isRunning}
            className="h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-amber-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Диагностика...' : 'Запустить повторно'}</span>
          </button>
        </div>

        {/* Health Verdict Strip */}
        {troubleshootData && (
          <div className={`px-6 py-4 border-b shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            troubleshootData.statusVerdict === 'critical'
              ? (isLight ? 'bg-rose-50/70 border-rose-200' : 'bg-rose-950/20 border-rose-900/30')
              : troubleshootData.statusVerdict === 'warning'
              ? (isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-900/30')
              : (isLight ? 'bg-emerald-50/70 border-emerald-200' : 'bg-emerald-950/20 border-emerald-900/30')
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl border flex flex-col items-center justify-center shrink-0 font-mono font-black ${
                troubleshootData.healthScore >= 90
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : troubleshootData.healthScore >= 70
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}>
                <span className="text-xl leading-none">{troubleshootData.healthScore}</span>
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Score</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${
                    troubleshootData.statusVerdict === 'critical' ? 'text-rose-500' : troubleshootData.statusVerdict === 'warning' ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {troubleshootData.verdictTitle}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                  {troubleshootData.verdictMessage}
                </p>
              </div>
            </div>

            {/* Quick counters */}
            <div className="flex items-center gap-2 self-start md:self-center shrink-0">
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {troubleshootData.counts.critical} Критично
              </span>
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {troubleshootData.counts.warning} Предупреждений
              </span>
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                {troubleshootData.counts.info} Инфо
              </span>
            </div>
          </div>
        )}

        {/* L4 Service Check Pills Strip */}
        {troubleshootData?.serviceResults && troubleshootData.serviceResults.length > 0 && (
          <div className={`px-6 py-2.5 border-b shrink-0 flex items-center gap-3 overflow-x-auto text-xs ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}>
            <span className="text-slate-400 font-semibold shrink-0">Порты управления коммутатора:</span>
            {troubleshootData.serviceResults.map(srv => (
              <div
                key={srv.port}
                className={`px-2.5 py-0.5 rounded-lg border font-mono text-[11px] font-bold flex items-center gap-1.5 shrink-0 ${
                  srv.open
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
                title={`${srv.name} (порт ${srv.port}) — ${srv.criticalFor}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${srv.open ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span>{srv.name} :{srv.port}</span>
                <span className="text-[10px] uppercase font-normal">{srv.open ? 'OPEN' : 'CLOSED'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Success toast if fixed */}
        {fixSuccessMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{fixSuccessMessage}</span>
            </div>
            <button onClick={() => setFixSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Layer Filters & Search Bar */}
        <div className={`px-6 py-3 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          {/* Layer tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all', label: 'Все уровни OSI' },
              { id: 'L1', label: 'L1 Физический (Кабель/Порт)' },
              { id: 'L2', label: 'L2 Канальный (VLAN/Trunk)' },
              { id: 'L3', label: 'L3 Сетевой (IP/ICMP)' },
              { id: 'L4', label: 'L4 Сервисы (SSH/Winbox)' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setLayerFilter(tab.id)}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  layerFilter === tab.id
                    ? 'bg-amber-600 text-white shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по описанию..."
              className={`w-full h-8 pl-8 pr-3 text-xs rounded-lg border outline-none transition-colors ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-950/80 border-slate-800 text-white focus:border-amber-500'
              }`}
            />
          </div>
        </div>

        {/* Findings List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isRunning ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
              <span className="text-sm font-semibold">Комплексный опрос L1 - L4 уровней...</span>
              <span className="text-xs text-slate-500">Проверка ICMP Echo, TCP сервисов, анализ связей и VLAN коллизий</span>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className={`p-16 text-center rounded-2xl border border-dashed ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/20 border-slate-800'
            }`}>
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold">
                {searchQuery || layerFilter !== 'all'
                  ? 'В данной выборке неполадок не обнаружено'
                  : 'Замечательно! Проблем на выбранном оборудовании нет'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Все порты, транковые соединения, Native VLAN и сетевые сервисы функционируют штатно.
              </p>
            </div>
          ) : (
            filteredFindings.map((finding) => {
              const isCrit = finding.severity === 'critical';
              const isWarn = finding.severity === 'warning';
              const isFixing = fixingId === finding.id;

              return (
                <div
                  key={finding.id}
                  className={`p-5 rounded-xl border transition-all ${
                    isCrit
                      ? (isLight ? 'bg-rose-50/60 border-rose-300 shadow-sm' : 'bg-rose-950/15 border-rose-900/40')
                      : isWarn
                      ? (isLight ? 'bg-amber-50/60 border-amber-300 shadow-sm' : 'bg-amber-950/15 border-amber-900/40')
                      : (isLight ? 'bg-blue-50/60 border-blue-200 shadow-sm' : 'bg-blue-950/15 border-blue-900/40')
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Main finding info */}
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                          isCrit ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : isWarn ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}>
                          {finding.layer} • {finding.severity.toUpperCase()}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {finding.title}
                        </h4>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {finding.description}
                      </p>

                      {/* Root cause and impact cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                        }`}>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Первопричина (Root Cause):
                          </span>
                          <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                            {finding.rootCause}
                          </p>
                        </div>

                        <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                        }`}>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Влияние на сеть (Impact):
                          </span>
                          <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                            {finding.impact}
                          </p>
                        </div>
                      </div>

                      {/* Step-by-step recommendation */}
                      <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                        isLight ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
                      }`}>
                        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block text-[11px]">Пошаговое решение инженера:</span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 block">{finding.recommendation}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions buttons column */}
                    <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 shrink-0">
                      {finding.quickFix && (
                        <button
                          onClick={() => handleApplyFix(finding)}
                          disabled={isFixing}
                          className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          title="Автоматически исправить конфигурацию в один клик"
                        >
                          {isFixing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-300" />}
                          <span>{finding.quickFix.actionLabel || 'Авто-исправление'}</span>
                        </button>
                      )}

                      {finding.target?.switchId && onNavigateToSwitch && (
                        <button
                          onClick={() => {
                            onClose();
                            onNavigateToSwitch(finding.target.switchId, finding.target.portId);
                          }}
                          className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                            isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          }`}
                        >
                          <span>К оборудованию</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t shrink-0 flex items-center justify-between text-xs text-slate-500 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <span>
            Показано {filteredFindings.length} инцидентов для {currentSw?.name || 'коммутатора'}
          </span>
          <button
            onClick={onClose}
            className="h-8 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
