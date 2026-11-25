import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ArrowDown, 
  ArrowUp, 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  Server, 
  Zap, 
  ShieldAlert, 
  BarChart3,
  Layers
} from 'lucide-react';
import { api } from '../api';

export function FleetTelemetryModal({ isOpen, onClose, theme = 'dark' }) {
  const [activeTab, setActiveTab] = useState('top-talkers'); // 'top-talkers' | 'errors' | 'prometheus'
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const isLight = theme === 'light';

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFleetTopTalkers();
      setReport(data);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки телеметрии сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTelemetry();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  if (!isOpen) return null;

  const summary = report?.summary || {
    totalIngressMbps: 0,
    totalEgressMbps: 0,
    totalBandwidthGbps: 0,
    totalActivePorts: 0,
    totalPortsCount: 0,
    errorPortsCount: 0
  };

  const topTalkers = report?.topTalkers || [];
  const topErrors = report?.topErrors || [];

  const prometheusSnippet = `# prometheus.yml
scrape_configs:
  - job_name: 'switchbook_telemetry'
    scrape_interval: 10s
    scrape_timeout: 5s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['localhost:3050']
        labels:
          environment: 'production'
          datacenter: 'hq-core'`;

  const handleCopyPrometheusConfig = () => {
    navigator.clipboard.writeText(prometheusSnippet);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className={`w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col border overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800 bg-slate-900/80'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono">Живая телеметрия сети и Top Talkers</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  LIVE STREAM
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Загрузка каналов, счетчики CRC/Discards и Prometheus Exporter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                autoRefresh
                  ? (isLight ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-emerald-950/40 border-emerald-600/40 text-emerald-300')
                  : (isLight ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-800 border-slate-700 text-slate-400')
              }`}
              title="Автообновление каждые 5 секунд"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh && loading ? 'animate-spin' : ''}`} />
              <span>{autoRefresh ? 'Авто 5с: Вкл' : 'Авто: Выкл'}</span>
            </button>

            <button
              onClick={fetchTelemetry}
              disabled={loading}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Обновить сейчас"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Fleet KPI Banner */}
        <div className={`p-5 border-b grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0 ${
          isLight ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-900/50 border-slate-800/80'
        }`}>
          {/* Total Bandwidth */}
          <div className={`p-3 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/40 border-slate-700/60'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
              <span>Суммарная нагрузка</span>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-emerald-500 dark:text-emerald-400">
              {summary.totalBandwidthGbps} <span className="text-xs text-slate-400 font-normal">Гбит/с</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
              <span className="flex items-center gap-0.5 text-emerald-400">
                <ArrowDown className="w-3 h-3" /> {summary.totalIngressMbps}M
              </span>
              <span className="flex items-center gap-0.5 text-blue-400">
                <ArrowUp className="w-3 h-3" /> {summary.totalEgressMbps}M
              </span>
            </div>
          </div>

          {/* Active Ports */}
          <div className={`p-3 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/40 border-slate-700/60'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
              <span>Активные порты (UP)</span>
              <Layers className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono mt-1 text-slate-900 dark:text-white">
              {summary.totalActivePorts} <span className="text-xs text-slate-400 font-normal">из {summary.totalPortsCount}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              {summary.totalPortsCount > 0 ? Math.round((summary.totalActivePorts / summary.totalPortsCount) * 100) : 0}% физических портов
            </div>
          </div>

          {/* CRC & Errors */}
          <div className={`p-3 rounded-2xl border ${
            summary.errorPortsCount > 0
              ? (isLight ? 'bg-rose-50 border-rose-200 shadow-sm' : 'bg-rose-950/20 border-rose-500/30')
              : (isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/40 border-slate-700/60')
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
              <span>Порты с ошибками</span>
              <ShieldAlert className={`w-3.5 h-3.5 ${summary.errorPortsCount > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
            </div>
            <div className={`text-xl font-bold font-mono mt-1 ${summary.errorPortsCount > 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
              {summary.errorPortsCount} <span className="text-xs text-slate-400 font-normal">портов</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              {summary.errorPortsCount > 0 ? 'Обнаружены CRC / Discards' : 'Ошибок в сети нет (0)'}
            </div>
          </div>

          {/* Prometheus Exporter */}
          <div className={`p-3 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/40 border-slate-700/60'
          }`}>
            <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono">
              <span>Prometheus /metrics</span>
              <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-sm font-bold font-mono mt-1 text-slate-900 dark:text-white flex items-center gap-1">
              <span>0.0.4 Text Format</span>
            </div>
            <a
              href="/metrics"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-blue-500 hover:underline mt-1 font-mono flex items-center gap-1 inline-flex"
            >
              <span>Открыть эндпоинт</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`px-6 pt-3 border-b flex items-center gap-4 text-xs font-mono font-bold shrink-0 ${
          isLight ? 'border-slate-200 bg-slate-50/50' : 'border-slate-800 bg-slate-900/40'
        }`}>
          <button
            onClick={() => setActiveTab('top-talkers')}
            className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'top-talkers'
                ? 'border-emerald-500 text-emerald-500 dark:text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Топ-5 по трафику (Top Talkers)</span>
          </button>

          <button
            onClick={() => setActiveTab('errors')}
            className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'errors'
                ? 'border-rose-500 text-rose-500 dark:text-rose-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Аномалии и CRC-ошибки ({topErrors.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('prometheus')}
            className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'prometheus'
                ? 'border-amber-500 text-amber-500 dark:text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Интеграция с Prometheus / Grafana</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 text-xs font-mono">
          {/* TAB 1: Top Talkers */}
          {activeTab === 'top-talkers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  Самые загруженные интерфейсы предприятия (по пиковой нагрузке Rx/Tx):
                </span>
                <span className="text-[11px] text-slate-500">
                  Обновление в реальном времени
                </span>
              </div>

              {topTalkers.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  Нет активного сетевого трафика.
                </div>
              ) : (
                topTalkers.map((item, idx) => (
                  <div
                    key={`${item.switchId}-${item.portNumber}`}
                    className={`p-4 rounded-2xl border transition-all ${
                      isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-800/40 border-slate-700/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.switchName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/40 text-slate-300">
                          {item.portName} (№{item.portNumber})
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          VLAN {item.vlanId}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-1">
                          <ArrowDown className="w-3.5 h-3.5" /> {item.rxMbps} Mbps
                        </span>
                        <span className="text-blue-500 dark:text-blue-400 flex items-center gap-1">
                          <ArrowUp className="w-3.5 h-3.5" /> {item.txMbps} Mbps
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          item.utilizationPct > 80
                            ? 'bg-rose-500/20 text-rose-400'
                            : item.utilizationPct > 50
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {item.utilizationPct}% утилизация
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-700/40 overflow-hidden mb-1.5">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          item.utilizationPct > 80
                            ? 'bg-rose-500'
                            : item.utilizationPct > 50
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.max(2, Math.min(100, item.utilizationPct))}%` }}
                      />
                    </div>

                    {item.connectedTo && (
                      <div className="text-[11px] text-slate-400">
                        Подключено: <span className="text-slate-300 font-semibold">{item.connectedTo}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: Error Radar */}
          {activeTab === 'errors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">
                  Интерфейсы с зафиксированными аппаратными ошибками кадров (CRC/FCS) и отброшенными пакетами (Discards):
                </span>
              </div>

              {topErrors.length === 0 ? (
                <div className={`p-8 rounded-2xl border text-center ${
                  isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                }`}>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <div className="font-bold text-sm">Сетевых аномалий не обнаружено</div>
                  <p className="text-xs text-slate-400 mt-1">
                    Все интерфейсы коммутаторов работают без потерь пакетов и коллизий.
                  </p>
                </div>
              ) : (
                topErrors.map((item, idx) => (
                  <div
                    key={`${item.switchId}-${item.portNumber}`}
                    className={`p-4 rounded-2xl border ${
                      isLight ? 'bg-rose-50/60 border-rose-200' : 'bg-rose-950/20 border-rose-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {item.switchName} • {item.portName} (№{item.portNumber})
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          VLAN {item.vlanId}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/30">
                          {item.totalErrors} ошибок суммарно
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono my-2">
                      <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400">Входные CRC (inErrors)</div>
                        <div className="font-bold text-rose-400 mt-0.5">{item.inErrors}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400">Выходные ошибки (outErrors)</div>
                        <div className="font-bold text-rose-400 mt-0.5">{item.outErrors}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400">Входные сбросы (inDiscards)</div>
                        <div className="font-bold text-amber-400 mt-0.5">{item.inDiscards}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/60">
                        <div className="text-[10px] text-slate-400">Выходные сбросы (outDiscards)</div>
                        <div className="font-bold text-amber-400 mt-0.5">{item.outDiscards}</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-2">
                      Рекомендация: <span className="text-slate-300">
                        {item.inErrors > 0 ? 'Проверьте затухание в оптическом патч-корде (DDM) или замените витую пару.' : 'Возможно переполнение буферов порта при всплеске трафика.'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Prometheus Exporter */}
          {activeTab === 'prometheus' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-sm mb-1">Экспорт сетевых метрик в Prometheus / VictoriaMetrics</h4>
                <p className="text-slate-400 text-xs">
                  SwitchBook предоставляет стандартный эндпоинт метрик в формате OpenMetrics / Prometheus 0.0.4.
                  Метрики содержат скорость интерфейсов, статус линков, счетчики байт/пакетов и ошибки.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/40 border border-slate-700/60">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Эндпоинт метрик</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    http://&lt;IP_СЕРВЕРА&gt;:3050/metrics
                  </div>
                </div>

                <a
                  href="/metrics"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>Проверить /metrics</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-300">
                    Конфигурация для prometheus.yml:
                  </span>
                  <button
                    onClick={handleCopyPrometheusConfig}
                    className="px-3 py-1 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedConfig ? 'Скопировано!' : 'Скопировать'}</span>
                  </button>
                </div>

                <pre className={`p-4 rounded-2xl border text-xs font-mono overflow-x-auto ${
                  isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-emerald-400'
                }`}>
                  {prometheusSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
