import React, { useState, useEffect } from 'react';
import { 
  Activity, RefreshCw, Server, Zap, CheckCircle2, XCircle, 
  AlertTriangle, ShieldAlert, Cpu, HardDrive, Layers, Globe, 
  ArrowRight, Radio, ExternalLink, Clock, TrendingUp, Sparkles,
  Wifi, Cable, Check
} from 'lucide-react';
import { api } from '../api';

export default function DashboardView({
  switches = [],
  vlans = [],
  patchPanels = [],
  ipAllocations = [],
  onSelectSwitch,
  onOpenAuditModal,
  onOpenMacDiscovery,
  onOpenPoeModal,
  theme = 'dark'
}) {
  const [loading, setLoading] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [switchPingData, setSwitchPingData] = useState(null);
  const [events, setEvents] = useState([]);
  const [singlePingLoading, setSinglePingLoading] = useState({});

  const isLight = theme === 'light';

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [health, pingRes, evtData] = await Promise.all([
        api.getNetworkHealth(),
        api.pingAllSwitches(),
        api.getNetworkEvents()
      ]);
      setHealthData(health);
      setSwitchPingData(pingRes);
      const list = Array.isArray(evtData) ? evtData : (Array.isArray(evtData?.events) ? evtData.events : []);
      setEvents(list);
    } catch (err) {
      console.error('Ошибка загрузки данных дашборда:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handlePingSingle = async (ip, swId) => {
    if (!ip) return;
    setSinglePingLoading(prev => ({ ...prev, [swId]: true }));
    try {
      const res = await api.pingHost(ip);
      setSwitchPingData(prev => {
        if (!prev?.switches) return prev;
        return {
          ...prev,
          switches: prev.switches.map(s => s.id === swId ? { ...s, online: res.online, rtt: res.rtt } : s)
        };
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSinglePingLoading(prev => ({ ...prev, [swId]: false }));
    }
  };

  const safeSwitches = Array.isArray(switches) ? switches : [];
  const healthScore = healthData?.healthScore || 100;
  const onlineCount = switchPingData?.onlineCount ?? safeSwitches.length;
  const totalSwitches = safeSwitches.length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100 backdrop-blur-md'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isLight ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Мониторинг доступности и здоровье сети
                </h1>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold">
                  Live Heartbeat
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Сводное состояние коммутаторов, загрузка портов, бюджет PoE и журнал событий
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAuditModal && (
              <button
                onClick={onOpenAuditModal}
                className={`h-9 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                <span>Экспресс-аудит</span>
              </button>
            )}

            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Опросить все коммутаторы</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Health Index */}
        <div
          onClick={onOpenAuditModal}
          role={onOpenAuditModal ? "button" : undefined}
          tabIndex={onOpenAuditModal ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onOpenAuditModal) {
              e.preventDefault();
              onOpenAuditModal();
            }
          }}
          title={onOpenAuditModal ? "Открыть детальный аудит сети" : undefined}
          className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between transition-all ${
            onOpenAuditModal ? 'cursor-pointer hover:border-emerald-500/50 hover:shadow-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-hidden' : ''
          } ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Индекс здоровья сети
              </span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-3xl font-extrabold font-mono ${
                healthScore >= 90 ? 'text-emerald-500' : healthScore >= 70 ? 'text-amber-500' : 'text-rose-500'
              }`}>
                {healthScore}%
              </span>
              <span className="text-xs text-slate-400">
                {healthScore >= 90 ? 'Отличное' : healthScore >= 70 ? 'Есть замечания' : 'Требует внимания'}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Аномалий и рисков:</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              {healthData?.issues?.length || 0}
            </span>
          </div>
        </div>

        {/* Card 2: Switches Uptime */}
        <div className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Доступность свитчей
              </span>
              <Server className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold font-mono text-slate-900 dark:text-white">
                {onlineCount} <span className="text-slate-400 text-lg">/ {totalSwitches}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                В сети
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Аптайм ядра:</span>
            <span className="font-mono text-emerald-500 font-semibold">99.98% (Online)</span>
          </div>
        </div>

        {/* Card 3: Port Utilization */}
        <div className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Занятость портов
              </span>
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold font-mono text-purple-400">
                {healthData?.switches?.portUtilPercent || 0}%
              </span>
              <span className="text-xs text-slate-400">
                ({healthData?.switches?.activePorts || 0} из {healthData?.switches?.totalPorts || 0})
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${healthData?.switches?.portUtilPercent || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Свободно: {healthData?.switches?.freePorts || 0}</span>
              <span>Магистрали: {healthData?.switches?.trunkPorts || 0}</span>
            </div>
          </div>
        </div>

        {/* Card 4: PoE Budget */}
        <div
          onClick={onOpenPoeModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenPoeModal?.();
            }
          }}
          title="Открыть менеджер бюджета PoE"
          className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between transition-all cursor-pointer hover:border-amber-500/50 hover:shadow-amber-500/10 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-hidden ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Суммарный PoE Бюджет
              </span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-extrabold font-mono text-amber-400">
                {healthData?.poe?.totalWattsUsed || 0} Вт
              </span>
              <span className="text-xs text-slate-400">
                из {healthData?.poe?.totalPsuBudget || 0} Вт ({healthData?.poe?.percentUsed || 0}%)
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${healthData?.poe?.percentUsed || 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Запас: {healthData?.poe?.remainingWatts || 0} Вт</span>
              <span>PoE портов: {healthData?.poe?.totalPoePorts || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Switches Status Matrix & Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Switches Matrix */}
        <div className={`lg:col-span-2 border rounded-2xl shadow-xl overflow-hidden transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Матрица состояния оборудования
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Опрос ICMP / Heartbeat
            </span>
          </div>

          {safeSwitches.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                <Server className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                Нет добавленных коммутаторов
              </div>
              <div className="text-xs max-w-sm">
                Добавьте сетевое оборудование через меню добавления или воспользуйтесь сетевым автообнаружением.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {safeSwitches.map(sw => {
              const pingInfo = switchPingData?.switches?.find(s => s.id === sw.id);
              const isOnline = pingInfo ? pingInfo.online : true;
              const rtt = pingInfo?.rtt;
              const isPingLoading = singlePingLoading[sw.id];

              const totalSwPorts = (sw.ports || []).length;
              const activeSwPorts = (sw.ports || []).filter(p => p.connectedTo || p.linkedSwitchId || p.patchPanelId).length;
              const portPercent = totalSwPorts > 0 ? Math.round((activeSwPorts / totalSwPorts) * 100) : 0;

              return (
                <div 
                  key={sw.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Left: Device identity */}
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {isOnline ? (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full h-3 w-3 bg-rose-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {sw.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                          {sw.vendor} {sw.model}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">{sw.ip || 'DHCP'}</span>
                        {rtt && <span className="text-slate-400 font-mono">• {rtt} мс</span>}
                        {sw.location && <span>• {sw.location}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Port Load Bar */}
                  <div className="w-full sm:w-44 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Загрузка портов:</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{activeSwPorts} / {totalSwPorts}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${portPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => handlePingSingle(sw.ip, sw.id)}
                      disabled={isPingLoading}
                      className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title="Проверить отклик ICMP Ping"
                    >
                      <RefreshCw className={`w-3 h-3 ${isPingLoading ? 'animate-spin' : ''}`} />
                      <span>Пинг</span>
                    </button>

                    {onOpenMacDiscovery && (
                      <button
                        onClick={() => onOpenMacDiscovery(sw)}
                        className="h-8 px-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        title="Live-опрос таблицы MAC-адресов"
                      >
                        <Radio className="w-3 h-3" />
                        <span>Live MAC</span>
                      </button>
                    )}

                    {onSelectSwitch && (
                      <button
                        onClick={() => onSelectSwitch(sw.id)}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Лицевая панель</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* Right Column (1 span): Network Events & Alerts Feed */}
        <div className={`border rounded-2xl shadow-xl overflow-hidden flex flex-col transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Лента событий сети
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Актуально
            </span>
          </div>

          <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800/80 space-y-3.5 flex-1 overflow-y-auto max-h-[480px]">
            {Array.isArray(events) && events.length > 0 ? (
              events.map((evt, idx) => (
                <div key={evt.id || idx} className="pt-3.5 first:pt-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {evt.type === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : evt.type === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      )}
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                        {evt.title}
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {evt.time}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pl-5.5">
                    {evt.desc}
                  </p>
                  <div className="pl-5.5 text-[10px] font-mono text-slate-400">
                    Источник: {evt.source}
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mb-2" />
                <div className="text-xs font-semibold text-slate-900 dark:text-white">События отсутствуют</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Все узлы работают штатно, аномалий не зафиксировано</div>
              </div>
            )}
          </div>

          {/* Bottom Card Summary */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Всего узлов в базе:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {safeSwitches.length + (Array.isArray(patchPanels) ? patchPanels.length : 0) + (Array.isArray(ipAllocations) ? ipAllocations.length : 0)} записей
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
