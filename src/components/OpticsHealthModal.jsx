import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
  ArrowLeftRight,
  ShieldAlert,
  Thermometer,
  Gauge,
  Sparkles,
  Search,
  ExternalLink
} from 'lucide-react';
import { api } from '../api';

export function OpticsHealthModal({ isOpen, onClose, theme = 'dark' }) {
  const isLight = theme === 'light';

  // State
  const [activeTab, setActiveTab] = useState('radar'); // 'radar' | 'spans' | 'diagnostics'
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [summary, setSummary] = useState(null);
  const [spans, setSpans] = useState([]);
  const [selectedPortKey, setSelectedPortKey] = useState(null);
  const [portAnalysis, setPortAnalysis] = useState(null);
  const [portAnalysisLoading, setPortAnalysisLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('ALL'); // 'ALL' | 'DEGRADING' | 'CRITICAL' | 'STABLE'

  // Load summary and spans on open
  useEffect(() => {
    if (!isOpen) return;
    loadFleetData();
  }, [isOpen]);

  const loadFleetData = async () => {
    setLoading(true);
    try {
      const summaryRes = await api.getOpticsFleetSummary();
      const spansRes = await api.getOpticsSpans();
      setSummary(summaryRes?.summary || null);
      setSpans(spansRes?.spans || []);

      // Auto-select first degrading port if available
      if (summaryRes?.summary?.degradingPorts?.length > 0) {
        const first = summaryRes.summary.degradingPorts[0];
        loadPortDetails(first.switchId, first.portId);
      }
    } catch (err) {
      console.error('[OpticsHealth] Ошибка загрузки сводки оптики:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePollFleet = async () => {
    setPolling(true);
    try {
      await api.pollOpticsFleet();
      await loadFleetData();
    } catch (err) {
      console.error('[OpticsHealth] Ошибка опроса оптики:', err);
    } finally {
      setPolling(false);
    }
  };

  const loadPortDetails = async (switchId, portId) => {
    const key = `${switchId}:${portId}`;
    setSelectedPortKey(key);
    setPortAnalysisLoading(true);
    try {
      const res = await api.getPortOpticsAnalysis(switchId, portId);
      setPortAnalysis(res?.analysis || null);
    } catch (err) {
      console.error('[OpticsHealth] Ошибка анализа порта:', err);
      setPortAnalysis(null);
    } finally {
      setPortAnalysisLoading(false);
    }
  };

  if (!isOpen) return null;

  // Filter ports
  const degradingList = summary?.degradingPorts || [];
  const filteredPorts = degradingList.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      p.switchName?.toLowerCase().includes(q) ||
      p.portName?.toLowerCase().includes(q) ||
      p.rootCause?.diagnosis?.toLowerCase().includes(q);

    if (filterUrgency === 'CRITICAL') {
      return matchQuery && (p.ttf?.urgency === 'CRITICAL' || p.ttf?.urgency === 'IMMINENT');
    }
    if (filterUrgency === 'WARNING') {
      return matchQuery && p.ttf?.urgency === 'WARNING';
    }
    return matchQuery;
  });

  // Urgency badge styling
  const renderUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'IMMINENT':
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-400" />
            КРИТИЧНО
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            ДЕГРАДАЦИЯ
          </span>
        );
      case 'STABLE':
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            СТАБИЛЬНО
          </span>
        );
    }
  };

  // Root cause badge styling
  const renderClassificationBadge = (classification) => {
    switch (classification) {
      case 'CONNECTOR_DIRT_OR_BEND':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            ГРЯЗЬ / МИКРОИЗГИБ
          </span>
        );
      case 'LASER_AGING':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            СТАРЕНИЕ ЛАЗЕРА
          </span>
        );
      case 'ASYMMETRIC_FIBER_FAULT':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
            АСИММЕТРИЯ ВОЛОКНА
          </span>
        );
      case 'THERMAL_STRESS':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            ТЕРМОСТРЕСС
          </span>
        );
      case 'OPTIMAL':
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            ЭТАЛОН
          </span>
        );
    }
  };

  // Sparkline Generator for SVG
  const renderSparkline = (history = []) => {
    if (!history || history.length < 2) {
      return (
        <div className="h-32 flex items-center justify-center text-xs text-slate-500">
          Недостаточно данных для графика
        </div>
      );
    }

    const width = 460;
    const height = 120;
    const padding = 20;

    const rxVals = history.map(h => h.rxDbm);
    const minVal = Math.min(-22.0, Math.min(...rxVals) - 1.0);
    const maxVal = Math.max(-2.0, Math.max(...rxVals) + 1.0);

    const getX = (i) => padding + (i / (history.length - 1)) * (width - 2 * padding);
    const getY = (val) => height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);

    const points = history.map((h, i) => `${getX(i)},${getY(h.rxDbm)}`).join(' ');

    // Sensitivity floor line at -20.0 dBm
    const floorY = getY(-20.0);

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32 overflow-visible">
          {/* Threshold critical line */}
          <line
            x1={padding}
            y1={floorY}
            x2={width - padding}
            y2={floorY}
            stroke="#f43f5e"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text
            x={width - padding - 4}
            y={floorY - 4}
            fill="#f43f5e"
            fontSize="9"
            textAnchor="end"
            fontFamily="monospace"
          >
            Порог чувствительности (-20.0 dBm)
          </text>

          {/* Area fill */}
          <polyline
            fill="rgba(56, 189, 248, 0.12)"
            stroke="none"
            points={`${points} ${getX(history.length - 1)},${height - padding} ${getX(0)},${height - padding}`}
          />

          {/* Sparkline curve */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Points */}
          {history.map((h, i) => (
            <circle
              key={i}
              cx={getX(i)}
              cy={getY(h.rxDbm)}
              r={i === history.length - 1 ? 4 : 2}
              fill={i === history.length - 1 ? '#38bdf8' : '#0284c7'}
              stroke={i === history.length - 1 ? '#ffffff' : 'none'}
              strokeWidth="1.5"
            />
          ))}
        </svg>

        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1">
          <span>{new Date(history[0].timestamp).toLocaleDateString()}</span>
          <span className="text-sky-400 font-semibold">
            Текущий: {history[history.length - 1].rxDbm} dBm
          </span>
          <span>{new Date(history[history.length - 1].timestamp).toLocaleDateString()}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Optics Health & Early Degradation AI</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  DEEP TECH
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Раннее обнаружение деградации SFP/SFP+ оптических трактов, расчет TTF и анализ асимметрии пролетов
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePollFleet}
              disabled={polling}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                polling ? 'opacity-60 cursor-not-allowed' : ''
              } ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Выполнить моментальный опрос DDM оптических трансиверов по парку"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${polling ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{polling ? 'Опрос...' : 'Опросить парк'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top KPI Metrics Banner */}
        <div
          className={`grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 border-b shrink-0 ${
            isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}
        >
          <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
            <span className="text-[11px] text-slate-400 block mb-0.5">Всего портов SFP</span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {summary ? summary.totalMonitoredPorts : '-'}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
            <span className="text-[11px] text-slate-400 block mb-0.5">Эталонные (Optimal)</span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {summary ? summary.optimalCount : '-'}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
            <span className="text-[11px] text-slate-400 block mb-0.5">Деградация (Warning)</span>
            <span className="text-xl font-bold font-mono text-amber-400">
              {summary ? summary.warningCount : '-'}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
            <span className="text-[11px] text-slate-400 block mb-0.5">Критичные (TTF &lt; 7д)</span>
            <span className="text-xl font-bold font-mono text-rose-400">
              {summary ? summary.criticalCount : '-'}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
            <span className="text-[11px] text-slate-400 block mb-0.5">Асимметрия жил</span>
            <span className="text-xl font-bold font-mono text-purple-400">
              {summary ? summary.asymmetricSpansCount : '-'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b px-6 shrink-0 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <button
            onClick={() => setActiveTab('radar')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'radar'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Радар деградации</span>
            {degradingList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-400 font-mono">
                {degradingList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('spans')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'spans'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Межкоммутаторные пролеты</span>
            {spans.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700 text-slate-300 font-mono">
                {spans.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Загрузка телеметрии оптики и расчет деградации...</p>
            </div>
          )}

          {!loading && activeTab === 'radar' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Degrading Ports Table */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Поиск по коммутатору или порту..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
                        isLight
                          ? 'bg-slate-50 border-slate-300 focus:border-cyan-500'
                          : 'bg-slate-800/80 border-slate-700 focus:border-cyan-500 text-slate-200'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFilterUrgency('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        filterUrgency === 'ALL'
                          ? 'bg-cyan-500 text-white'
                          : isLight
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Все
                    </button>
                    <button
                      onClick={() => setFilterUrgency('CRITICAL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        filterUrgency === 'CRITICAL'
                          ? 'bg-rose-500 text-white'
                          : isLight
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Критичные
                    </button>
                  </div>
                </div>

                <div className={`rounded-xl border overflow-hidden ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                  {filteredPorts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      Деградирующих портов не обнаружено. Все оптические тракты находятся в стабильном состоянии.
                    </div>
                  ) : (
                    <table className="w-full text-xs text-left">
                      <thead
                        className={`text-[11px] font-semibold border-b ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                        }`}
                      >
                        <tr>
                          <th className="py-2.5 px-3">Устройство & Порт</th>
                          <th className="py-2.5 px-3">Rx Power</th>
                          <th className="py-2.5 px-3">Тренд (dB/д)</th>
                          <th className="py-2.5 px-3">Прогноз TTF</th>
                          <th className="py-2.5 px-3">Статус</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {filteredPorts.map((p) => {
                          const key = `${p.switchId}:${p.portId}`;
                          const isSelected = selectedPortKey === key;
                          return (
                            <tr
                              key={key}
                              onClick={() => loadPortDetails(p.switchId, p.portId)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? isLight
                                    ? 'bg-cyan-50'
                                    : 'bg-cyan-950/30'
                                  : isLight
                                  ? 'hover:bg-slate-50'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-200">{p.switchName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{p.portName}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-sky-400">
                                {p.currentRx} dBm
                              </td>
                              <td className="py-2.5 px-3 font-mono text-rose-400">
                                {p.trend?.rxSlopeDbPerDay} dB/д
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                {p.ttf?.ttfDays !== null ? (
                                  <span className="font-bold text-amber-400">{p.ttf.ttfDays} дн.</span>
                                ) : (
                                  <span className="text-slate-500">&gt; 180 дн.</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {renderUrgencyBadge(p.ttf?.urgency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Right Column: Detailed Port Sparkline & AI Root Cause */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {portAnalysisLoading && (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
                    <span className="text-xs text-slate-400">Расчет линейной регрессии...</span>
                  </div>
                )}

                {!portAnalysisLoading && portAnalysis && (
                  <>
                    {/* Sparkline Card */}
                    <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-xs font-bold text-slate-200">
                            {portAnalysis.switchName} — {portAnalysis.portName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Скорость: {portAnalysis.speed} | Порог: -20.0 dBm
                          </div>
                        </div>
                        {renderUrgencyBadge(portAnalysis.ttf?.urgency)}
                      </div>

                      {renderSparkline(portAnalysis.history)}

                      {/* Small telemetry metrics */}
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-700/50 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Tx Power</span>
                          <span className="font-mono font-bold text-slate-200">
                            {portAnalysis.current.txDbm} dBm
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Laser Bias</span>
                          <span
                            className={`font-mono font-bold ${
                              portAnalysis.current.biasCurrentMa >= 45 ? 'text-rose-400' : 'text-slate-200'
                            }`}
                          >
                            {portAnalysis.current.biasCurrentMa} mA
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Температура</span>
                          <span className="font-mono font-bold text-slate-200">
                            {portAnalysis.current.temperatureC} °C
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* AI Root Cause Card */}
                    <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                          <Sparkles className="w-4 h-4" />
                          <span>AI-Диагноз причины</span>
                        </div>
                        {renderClassificationBadge(portAnalysis.rootCause?.classification)}
                      </div>

                      <div className="text-xs font-semibold text-slate-200 mb-1">
                        {portAnalysis.rootCause?.diagnosis}
                      </div>

                      <div className="text-xs text-slate-400 mb-3 leading-relaxed">
                        {portAnalysis.rootCause?.recommendation}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-700/50">
                        <span>Точность классификации:</span>
                        <span className="text-cyan-400 font-bold">
                          {Math.round((portAnalysis.rootCause?.confidence || 0.9) * 100)}%
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {!portAnalysisLoading && !portAnalysis && (
                  <div className="p-8 text-center text-xs text-slate-500 border rounded-xl border-dashed border-slate-800">
                    Выберите оптический порт из списка слева для просмотра графика затухания и рекомендаций AI.
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'spans' && (
            <div className="flex flex-col gap-4">
              <div className="text-xs text-slate-400 mb-1">
                Корреляция оптических пролетов между коммутаторами (Forward Loss $Tx_A - Rx_B$ vs Reverse Loss $Tx_B - Rx_A$):
              </div>

              {spans.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 border rounded-xl border-slate-800">
                  Оптических межкоммутаторных соединений не обнаружено.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {spans.map((span, idx) => {
                    const isAsym = span.asymmetry?.isAsymmetric || span.isAsymmetric;
                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                          isAsym
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : isLight
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-slate-800/40 border-slate-700/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-200">
                            {span.switchA?.name} ↔ {span.switchB?.name}
                          </div>
                          {isAsym ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              АСИММЕТРИЯ {span.asymmetryDb} dB
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              СИММЕТРИЧЕН
                            </span>
                          )}
                        </div>

                        {/* Bidirectional visualizer */}
                        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono flex flex-col gap-2">
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">{span.portA?.name} (A) → {span.portB?.name} (B):</span>
                            <span className="font-bold text-sky-400">{span.forwardLossDb} dB затухание</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="text-slate-400">{span.portB?.name} (B) → {span.portA?.name} (A):</span>
                            <span className="font-bold text-sky-400">{span.reverseLossDb} dB затухание</span>
                          </div>
                        </div>

                        {isAsym && (
                          <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                            {span.asymmetry?.recommendation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-between text-xs text-slate-400 shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Стандарт SFF-8472 / SNR-OS & MikroTik RouterOS</span>
          </div>

          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl border font-semibold transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
export default OpticsHealthModal;
