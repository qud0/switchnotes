import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Activity,
  Zap,
  Thermometer,
  Gauge,
  Layers,
  ArrowRight,
  Terminal,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Info
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

/**
 * Преобразование оптической мощности из dBm в микроватты (µW)
 * P(µW) = 10^(dBm / 10) * 1000
 */
function dbmToMicrowatts(dbm) {
  if (dbm <= -40) return 0;
  const mw = Math.pow(10, dbm / 10);
  const uw = mw * 1000;
  if (uw < 1) return uw.toFixed(2);
  if (uw < 10) return uw.toFixed(1);
  return Math.round(uw);
}

/**
 * SfpDdmCard.jsx
 * Интерактивная панель мониторинга оптического трансивера SFP / SFP+ (DDM / DOM).
 */
export function SfpDdmCard({
  switchData,
  port,
  theme = 'dark',
  showFaultSimulator = true,
  autoRefreshInterval = 0 // 0 = disabled, >0 in ms
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [testMode, setTestMode] = useState(switchData?.ip ? 'auto' : 'simulated');
  const [faultSimulation, setFaultSimulation] = useState('none');
  const [showRawCli, setShowRawCli] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchDdm = async (isSilent = false) => {
    if (!switchData?.id || !port?.id) return;
    if (!isSilent) setLoading(true);
    setError(null);

    try {
      const res = await api.getPortDdm(switchData.id, port.id, {
        mode: testMode,
        faultSimulation
      });
      setData(res);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err.message || 'Ошибка считывания DDM телеметрии');
      if (!isSilent) toast?.error?.(err.message || 'Ошибка DDM');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDdm();
  }, [switchData?.id, port?.id, testMode, faultSimulation]);

  // Auto-refresh interval (useful during optical alignment)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchDdm(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, switchData?.id, port?.id, testMode, faultSimulation]);

  const rx = data?.rxPowerDbm ?? -7.4;
  const tx = data?.txPowerDbm ?? -2.8;
  const statusObj = data?.opticalStatus || { status: 'optimal', badge: 'В норме', color: 'emerald' };

  // Calculate percentage on typical SFP dynamic range (-30 dBm to 0 dBm)
  const calcGaugePercent = (val) => {
    if (val <= -30) return 0;
    if (val >= 0) return 100;
    return Math.round(((val + 30) / 30) * 100);
  };

  const rxPercent = calcGaugePercent(rx);
  const txPercent = calcGaugePercent(tx);

  return (
    <div className={`p-4 rounded-xl border space-y-4 transition-colors ${
      isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
    }`}>
      {/* Header with Title & Live Polling Status */}
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>Оптический мониторинг SFP / SFP+ (DDM)</span>
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                {port.speed || '10G'} SFP+
              </span>
              {data?.isHardware ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Hardware SSH ({switchData.ip})
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  {data?.source === 'simulated_fallback' ? 'Оффлайн эмуляция' : 'Лабораторный стенд'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Телеметрия SFF-8472: оптическая мощность лазера Tx/Rx, затухание в волокне, температура и ток смещения.
            </p>
          </div>
        </div>

        {/* Action Controls: Refresh & Live Polling Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-xs'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Автообновление показаний каждые 5 сек (удобно при юстировке и чистке патч-корда)"
          >
            <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Живой опрос (5с)</span>
          </button>

          <button
            type="button"
            onClick={() => fetchDdm(false)}
            disabled={loading}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Mode & Fault Simulator Toggle */}
      {showFaultSimulator && (
        <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 flex-wrap ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono text-[11px]">Режим:</span>
            <div className="flex items-center gap-1 bg-slate-800/60 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setTestMode('auto')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  testMode === 'auto'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Авто (SSH / Live)
              </button>
              <button
                type="button"
                onClick={() => setTestMode('simulated')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  testMode === 'simulated'
                    ? 'bg-purple-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Эмуляция
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Сценарий оптического тракта:
            </span>
            <select
              value={faultSimulation}
              onChange={(e) => setFaultSimulation(e.target.value)}
              className={`px-2 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
              }`}
            >
              <option value="none">Штатный оптический линк (Excellent)</option>
              <option value="dirty_fiber">Загрязнение коннектора / Изгиб (-18.4 dBm)</option>
              <option value="broken_fiber">Обрыв оптического волокна (No light)</option>
              <option value="hot_laser">Перегрев лазера (+74.5°C)</option>
            </select>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main DDM Gauges & Optical Power */}
      {data && (
        <div className="space-y-4">
          {/* Top Status Alert Banner */}
          <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
            statusObj.status === 'optimal'
              ? (isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200')
              : statusObj.status === 'warning'
              ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950/20 border-amber-500/40 text-amber-200')
              : (isLight ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-rose-950/20 border-rose-500/40 text-rose-200')
          }`}>
            <div className={`p-1.5 rounded-lg shrink-0 ${
              statusObj.status === 'optimal'
                ? 'bg-emerald-500/20 text-emerald-400'
                : statusObj.status === 'warning'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-rose-500/20 text-rose-400'
            }`}>
              {statusObj.status === 'optimal' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : statusObj.status === 'warning' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-xs uppercase tracking-wider">
                  {statusObj.badge}
                </span>
                {lastRefreshed && (
                  <span className="text-[10px] font-mono opacity-70">
                    Обновлено: {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <p className="text-xs mt-0.5 leading-relaxed font-sans">
                {data.diagnosis}
              </p>
              {data.recommendation && (
                <p className="text-[11px] opacity-80 mt-1 font-sans">
                  <strong>Совет:</strong> {data.recommendation}
                </p>
              )}
            </div>
          </div>

          {/* Rx / Tx Power Meters & Link Attenuation Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Rx Power (Прием) */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span>Rx Power (Прием)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {dbmToMicrowatts(rx)} µW
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold font-mono ${
                    rx <= -30
                      ? 'text-slate-500'
                      : rx < -20
                      ? 'text-rose-400'
                      : rx < -14.5
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {rx > -35 ? `${rx.toFixed(2)}` : '< -35'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">dBm</span>
                </div>

                {/* Level Gauge Bar with Threshold Markers */}
                <div className="mt-2 space-y-1">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden relative border border-slate-700/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        rx <= -30
                          ? 'bg-slate-600'
                          : rx < -20
                          ? 'bg-rose-500'
                          : rx < -14.5
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${rxPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span>-30 dBm</span>
                    <span className="text-amber-500">-15</span>
                    <span className="text-emerald-500">-7</span>
                    <span>0 dBm</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-between">
                <span>Порог чувствительности:</span>
                <span className="text-slate-300">-21.0 dBm</span>
              </div>
            </div>

            {/* Optical Attenuation & Budget (Затухание трассы) */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Затухание в линии</span>
                </div>
                <span className="text-[10px] text-purple-400 font-mono font-bold">
                  Loss: {data.attenuationDb} dB
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold font-mono ${
                    data.attenuationDb > 15
                      ? 'text-rose-400'
                      : data.attenuationDb > 10
                      ? 'text-amber-400'
                      : 'text-purple-300'
                  }`}>
                    {data.attenuationDb}
                  </span>
                  <span className="text-xs font-mono text-slate-400">dB</span>
                </div>

                <div className="text-[11px] font-sans text-slate-400 mt-2 leading-tight">
                  {data.opticalMarginDb > 0 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      Запас бюджета: +{data.opticalMarginDb} dB
                    </span>
                  ) : (
                    <span className="text-rose-400">
                      Лимит оптического бюджета исчерпан
                    </span>
                  )}
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-between">
                <span>Трасса:</span>
                <span className="text-slate-300">
                  {data.distance} • {data.wavelength}
                </span>
              </div>
            </div>

            {/* Tx Power (Передача) */}
            <div className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Tx Power (Передача)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {dbmToMicrowatts(tx)} µW
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {tx > -35 ? `${tx.toFixed(2)}` : 'Off'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">dBm</span>
                </div>

                {/* Level Gauge Bar */}
                <div className="mt-2 space-y-1">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden relative border border-slate-700/60">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${txPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                    <span>-30 dBm</span>
                    <span>-10</span>
                    <span>0 dBm</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-between">
                <span>Статус лазера:</span>
                <span className="text-emerald-400 font-bold">
                  {tx > -35 ? 'Активен (On)' : 'Выключен (Off)'}
                </span>
              </div>
            </div>
          </div>

          {/* SFP Physics & Laser Health Metrics (Temp, Vcc, Bias) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                <span>Температура</span>
              </div>
              <div className={`text-base font-bold font-mono ${
                data.temperatureC > 70 ? 'text-rose-400' : 'text-slate-100'
              }`}>
                +{data.temperatureC} °C
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Норма: 0..70°C</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <span>Напряжение (Vcc)</span>
              </div>
              <div className="text-base font-bold font-mono text-slate-100">
                {data.voltageV} V
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Норма: 3.3V ±5%</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ток лазера (Bias)</span>
              </div>
              <div className={`text-base font-bold font-mono ${
                data.biasCurrentMa > 50 ? 'text-amber-400' : 'text-slate-100'
              }`}>
                {data.biasCurrentMa} mA
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Норма: 10..40 mA</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <span>Волна (Wavelength)</span>
              </div>
              <div className="text-base font-bold font-mono text-slate-100">
                {data.wavelength}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{data.connector}</span>
            </div>
          </div>

          {/* Transceiver Passport Card */}
          <div className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              Паспорт оптического модуля (EEPROM Data)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Вендор:</span>
                <span className="font-bold text-slate-200">{data.vendor}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Модель / Part No:</span>
                <span className="font-bold text-slate-200">{data.model}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Серийный номер:</span>
                <span className="text-slate-300">{data.serial}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Макс. дальность:</span>
                <span className="text-slate-300">{data.distance}</span>
              </div>
            </div>
          </div>

          {/* Raw CLI Terminal Output Drawer */}
          {data.rawOutput && (
            <div className="pt-1 border-t border-slate-800/60 space-y-1.5">
              <button
                type="button"
                onClick={() => setShowRawCli(!showRawCli)}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1.5 font-mono cursor-pointer transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>{showRawCli ? 'Скрыть вывод CLI' : 'Показать консольный вывод команды коммутатора'}</span>
                {showRawCli ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showRawCli && (
                <div className="p-3 rounded-lg bg-black/90 border border-slate-800 text-emerald-400 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                  {data.rawOutput}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
