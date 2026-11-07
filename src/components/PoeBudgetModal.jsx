import React, { useState, useMemo } from 'react';
import {
  X,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Server,
  Wifi,
  Video,
  Phone,
  Shield,
  Download,
  Plus,
  RefreshCw,
  Cpu,
  Layers,
  BatteryCharging,
  Info
} from 'lucide-react';

export const POE_PRESETS = [
  { name: 'Wi-Fi 6/7 Точка доступа', watts: 15.5, standard: '802.3at (PoE+)', priority: 'High', icon: Wifi },
  { name: 'Купольная IP-камера (CCTV)', watts: 7.5, standard: '802.3af (PoE)', priority: 'High', icon: Video },
  { name: 'Уличная поворотная PTZ-камера', watts: 28.0, standard: '802.3at (PoE+)', priority: 'Critical', icon: Video },
  { name: 'VoIP Телефон с дисплеем', watts: 4.5, standard: '802.3af (PoE)', priority: 'Low', icon: Phone },
  { name: 'СКУД Контроллер / Домофон', watts: 12.0, standard: '802.3af (PoE)', priority: 'Critical', icon: Shield },
  { name: 'Мощный терминал / IoT экран', watts: 55.0, standard: '802.3bt (PoE++)', priority: 'Low', icon: Cpu }
];

export function PoeBudgetModal({
  isOpen,
  onClose,
  switches = [],
  selectedSwitchId = null,
  onUpdateSwitch,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  // Find all PoE-capable switches
  const poeSwitches = useMemo(() => {
    return switches.filter(s => s.poe || (s.poeBudget && s.poeBudget > 0) || (s.ports || []).some(p => p.poe));
  }, [switches]);

  const [activeSwitchId, setActiveSwitchId] = useState(() => {
    if (selectedSwitchId && poeSwitches.some(s => String(s.id) === String(selectedSwitchId))) {
      return String(selectedSwitchId);
    }
    return poeSwitches[0] ? String(poeSwitches[0].id) : (switches[0] ? String(switches[0].id) : null);
  });

  const [activeTab, setActiveTab] = useState('ports'); // 'ports', 'planner', 'ups-shedding', 'enterprise'

  const activeSwitch = useMemo(() => {
    return switches.find(s => String(s.id) === String(activeSwitchId)) || poeSwitches[0] || switches[0];
  }, [switches, activeSwitchId, poeSwitches]);

  // Local editable ports and budget state
  const [psuBudget, setPsuBudget] = useState(() => {
    return activeSwitch?.poeBudget || 370;
  });

  const [portsState, setPortsState] = useState(() => {
    return (activeSwitch?.ports || []).map(p => ({
      number: p.number,
      name: p.name || `Port ${p.number}`,
      poeEnabled: Boolean(p.poe),
      poeWatts: p.poeWatts !== undefined ? Number(p.poeWatts) : (p.poe ? 12 : 0),
      poeStandard: p.poeStandard || (p.poe ? '802.3at' : 'off'),
      deviceDesc: p.description || p.connectedDevice || '',
      priority: p.poePriority || 'High'
    }));
  });

  // Re-sync when active switch changes
  const handleSwitchChange = (newId) => {
    setActiveSwitchId(newId);
    const targetSw = switches.find(s => String(s.id) === String(newId));
    if (targetSw) {
      setPsuBudget(targetSw.poeBudget || 370);
      setPortsState((targetSw.ports || []).map(p => ({
        number: p.number,
        name: p.name || `Port ${p.number}`,
        poeEnabled: Boolean(p.poe),
        poeWatts: p.poeWatts !== undefined ? Number(p.poeWatts) : (p.poe ? 12 : 0),
        poeStandard: p.poeStandard || (p.poe ? '802.3at' : 'off'),
        deviceDesc: p.description || p.connectedDevice || '',
        priority: p.poePriority || 'High'
      })));
    }
  };

  // What-if planner additions
  const [plannerLoads, setPlannerLoads] = useState({
    ap: 0,
    cctv: 0,
    ptz: 0,
    voip: 0
  });

  // Current calculations
  const summary = useMemo(() => {
    let totalWatts = 0;
    let activePoePorts = 0;
    let criticalWatts = 0;
    let highWatts = 0;
    let lowWatts = 0;

    portsState.forEach(p => {
      if (p.poeEnabled) {
        totalWatts += p.poeWatts;
        activePoePorts++;
        if (p.priority === 'Critical') criticalWatts += p.poeWatts;
        else if (p.priority === 'High') highWatts += p.poeWatts;
        else lowWatts += p.poeWatts;
      }
    });

    const percent = Math.min(100, psuBudget > 0 ? Math.round((totalWatts / psuBudget) * 100) : 0);
    const remainingWatts = Math.max(0, psuBudget - totalWatts);
    const isOverload = totalWatts > psuBudget;
    const isWarning = percent >= 80 && !isOverload;

    // Projected calculation with planner
    const plannerAddedWatts =
      (plannerLoads.ap * 15.5) +
      (plannerLoads.cctv * 7.5) +
      (plannerLoads.ptz * 28.0) +
      (plannerLoads.voip * 4.5);

    const projectedTotalWatts = totalWatts + plannerAddedWatts;
    const projectedPercent = Math.min(100, psuBudget > 0 ? Math.round((projectedTotalWatts / psuBudget) * 100) : 0);
    const projectedOverload = projectedTotalWatts > psuBudget;

    // UPS shedding calculation: savings if Low priority ports disabled
    const upsSheddingWatts = criticalWatts + highWatts;
    const upsSavedWatts = lowWatts;

    return {
      totalWatts: Math.round(totalWatts * 10) / 10,
      activePoePorts,
      totalPorts: portsState.length,
      percent,
      remainingWatts: Math.round(remainingWatts * 10) / 10,
      isOverload,
      isWarning,
      criticalWatts: Math.round(criticalWatts * 10) / 10,
      highWatts: Math.round(highWatts * 10) / 10,
      lowWatts: Math.round(lowWatts * 10) / 10,
      plannerAddedWatts: Math.round(plannerAddedWatts * 10) / 10,
      projectedTotalWatts: Math.round(projectedTotalWatts * 10) / 10,
      projectedPercent,
      projectedOverload,
      upsSheddingWatts: Math.round(upsSheddingWatts * 10) / 10,
      upsSavedWatts: Math.round(upsSavedWatts * 10) / 10
    };
  }, [portsState, psuBudget, plannerLoads]);

  // Aggregate stats across all switches in company
  const enterpriseSummary = useMemo(() => {
    let grandBudget = 0;
    let grandUsed = 0;
    let grandPoePorts = 0;

    switches.forEach(sw => {
      const budget = sw.poeBudget || (sw.poe ? 370 : 0);
      grandBudget += budget;

      (sw.ports || []).forEach(p => {
        if (p.poe) {
          grandPoePorts++;
          grandUsed += (p.poeWatts ? Number(p.poeWatts) : 12);
        }
      });
    });

    const percent = grandBudget > 0 ? Math.round((grandUsed / grandBudget) * 100) : 0;
    return {
      grandBudget,
      grandUsed: Math.round(grandUsed),
      grandPoePorts,
      percent,
      remaining: Math.max(0, grandBudget - Math.round(grandUsed))
    };
  }, [switches]);

  // Port row change handlers
  const handleTogglePoe = (idx) => {
    setPortsState(prev => {
      const next = [...prev];
      const cur = next[idx];
      const willEnable = !cur.poeEnabled;
      next[idx] = {
        ...cur,
        poeEnabled: willEnable,
        poeWatts: willEnable ? (cur.poeWatts > 0 ? cur.poeWatts : 15.4) : 0,
        poeStandard: willEnable ? '802.3at' : 'off'
      };
      return next;
    });
  };

  const handleApplyPreset = (idx, preset) => {
    setPortsState(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        poeEnabled: true,
        poeWatts: preset.watts,
        poeStandard: preset.standard,
        priority: preset.priority,
        deviceDesc: next[idx].deviceDesc || preset.name
      };
      return next;
    });
  };

  const handleUpdateWatts = (idx, val) => {
    const num = Math.max(0, Math.min(90, parseFloat(val) || 0));
    setPortsState(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        poeWatts: num,
        poeEnabled: num > 0
      };
      return next;
    });
  };

  const handleUpdatePriority = (idx, priority) => {
    setPortsState(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], priority };
      return next;
    });
  };

  // Save changes back to switch
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveToDatabase = async () => {
    if (!activeSwitch || !onUpdateSwitch) return;
    setIsSaving(true);
    try {
      const updatedPorts = (activeSwitch.ports || []).map(orig => {
        const found = portsState.find(p => p.number === orig.number);
        if (!found) return orig;
        return {
          ...orig,
          poe: found.poeEnabled,
          poeWatts: found.poeWatts,
          poeStandard: found.poeStandard,
          poePriority: found.priority,
          description: found.deviceDesc || orig.description
        };
      });

      await onUpdateSwitch(activeSwitch.id, {
        ...activeSwitch,
        poeBudget: Number(psuBudget),
        poe: portsState.some(p => p.poeEnabled) || psuBudget > 0,
        ports: updatedPorts
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert(`Ошибка сохранения: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className={`w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Менеджер бюджета питания PoE (Power over Ethernet)
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  IEEE 802.3af / at / bt
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Мониторинг энергопотребления портов, расчёт мощности БП коммутаторов и защита от перегрузок
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Switch Selection */}
        <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Коммутатор:
            </span>
            <select
              value={activeSwitchId || ''}
              onChange={(e) => handleSwitchChange(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs outline-none focus:border-amber-500 cursor-pointer"
            >
              {switches.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.model || 'Switch'}) — Бюджет: {s.poeBudget || 370}W
                </option>
              ))}
            </select>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            {[
              { id: 'ports', label: 'Порты коммутатора', icon: Sliders },
              { id: 'planner', label: 'Планировщик нагрузки (+)', icon: Plus },
              { id: 'ups-shedding', label: 'ИБП / Сброс нагрузок', icon: BatteryCharging },
              { id: 'enterprise', label: 'Сводка по парку', icon: Layers }
            ].map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-7 px-2.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Metric Bar */}
        <div className={`p-4 border-b shrink-0 grid grid-cols-2 md:grid-cols-4 gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/20 border-slate-800'
        }`}>
          {/* Card 1: Power Used */}
          <div className={`p-3 rounded-xl border ${
            summary.isOverload
              ? 'bg-rose-500/10 border-rose-500/30'
              : summary.isWarning
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-slate-900/60 border-slate-800'
          }`}>
            <span className="text-[11px] text-slate-500 block mb-0.5">Потребление PoE</span>
            <div className="text-xl font-bold font-mono text-white flex items-baseline gap-1.5">
              <span>{summary.totalWatts} Вт</span>
              <span className="text-xs text-slate-400 font-normal">/ {psuBudget} Вт</span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  summary.isOverload ? 'bg-rose-500' : summary.isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${summary.percent}%` }}
              />
            </div>
          </div>

          {/* Card 2: Headroom */}
          <div className="p-3 rounded-xl border bg-slate-900/60 border-slate-800">
            <span className="text-[11px] text-slate-500 block mb-0.5">Свободный запас БП</span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {summary.remainingWatts} Вт
            </div>
            <span className="text-[10px] text-slate-400">
              Загрузка блока: <strong className="text-white">{summary.percent}%</strong>
            </span>
          </div>

          {/* Card 3: Active PoE Ports */}
          <div className="p-3 rounded-xl border bg-slate-900/60 border-slate-800">
            <span className="text-[11px] text-slate-500 block mb-0.5">Активные PoE порты</span>
            <div className="text-xl font-bold font-mono text-amber-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4 fill-amber-400/30" />
              <span>{summary.activePoePorts}</span>
              <span className="text-xs text-slate-500 font-normal">из {summary.totalPorts} портов</span>
            </div>
            <span className="text-[10px] text-slate-400">
              Ср. мощность: {summary.activePoePorts > 0 ? (summary.totalWatts / summary.activePoePorts).toFixed(1) : 0} Вт/порт
            </span>
          </div>

          {/* Card 4: PSU Status */}
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            summary.isOverload
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : summary.isWarning
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          }`}>
            <span className="text-[11px] block font-semibold">Статус питания БП</span>
            <div className="text-xs font-bold flex items-center gap-1.5">
              {summary.isOverload ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>ПЕРЕГРУЗКА БЛОКА!</span>
                </>
              ) : summary.isWarning ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Предупреждение (&gt;80%)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Бюджет в норме</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span>Лимит БП:</span>
              <input
                type="number"
                min="50"
                max="2000"
                step="10"
                value={psuBudget}
                onChange={(e) => setPsuBudget(Math.max(10, parseInt(e.target.value) || 0))}
                className="w-16 h-5 px-1 bg-slate-950 border border-slate-700 rounded font-mono text-center font-bold text-white text-[10px]"
              />
              <span>Вт</span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: PORTS MATRIX */}
          {activeTab === 'ports' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">
                  Попортовая раскладка питания ({portsState.length} портов):
                </span>
                <span className="text-[11px] text-slate-500">
                  Быстрый клик по значку питает устройство по стандарту
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className={`text-[11px] font-semibold border-b ${
                    isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}>
                    <tr>
                      <th className="py-2.5 px-3 w-16">Порт</th>
                      <th className="py-2.5 px-3 w-28">Статус PoE</th>
                      <th className="py-2.5 px-3">Устройство / Описание</th>
                      <th className="py-2.5 px-3 w-36">Стандарт</th>
                      <th className="py-2.5 px-3 w-28">Мощность (Вт)</th>
                      <th className="py-2.5 px-3 w-28">Приоритет</th>
                      <th className="py-2.5 px-3 w-40 text-right">Быстрый шаблон</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {portsState.map((port, idx) => (
                      <tr
                        key={port.number}
                        className={`transition-colors ${
                          port.poeEnabled 
                            ? (isLight ? 'bg-amber-50/40 hover:bg-amber-50/80' : 'bg-amber-500/5 hover:bg-amber-500/10')
                            : (isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900/60')
                        }`}
                      >
                        {/* Port Number */}
                        <td className="py-2 px-3 font-bold text-white">
                          #{port.number}
                        </td>

                        {/* Toggle Button */}
                        <td className="py-2 px-3 font-sans">
                          <button
                            type="button"
                            onClick={() => handleTogglePoe(idx)}
                            className={`h-6 px-2 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                              port.poeEnabled
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Zap className={`w-3 h-3 ${port.poeEnabled ? 'fill-amber-400 text-amber-400' : ''}`} />
                            <span>{port.poeEnabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
                          </button>
                        </td>

                        {/* Device Description */}
                        <td className="py-2 px-3 font-sans">
                          <input
                            type="text"
                            value={port.deviceDesc}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPortsState(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], deviceDesc: val };
                                return next;
                              });
                            }}
                            placeholder="Например: AP Wi-Fi 6, IP-камера..."
                            className="w-full h-7 px-2 rounded bg-slate-950/70 border border-slate-800 text-slate-200 text-xs focus:border-amber-500 outline-none"
                          />
                        </td>

                        {/* Standard */}
                        <td className="py-2 px-3 text-[11px] font-sans">
                          <select
                            value={port.poeStandard}
                            onChange={(e) => {
                              const std = e.target.value;
                              setPortsState(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], poeStandard: std, poeEnabled: std !== 'off' };
                                return next;
                              });
                            }}
                            className="h-7 px-2 rounded bg-slate-950 border border-slate-800 text-slate-300 text-xs outline-none"
                          >
                            <option value="off">Off (0W)</option>
                            <option value="802.3af">802.3af (15.4W)</option>
                            <option value="802.3at">802.3at PoE+ (30W)</option>
                            <option value="802.3bt">802.3bt PoE++ (60W)</option>
                            <option value="passive24">Passive 24V</option>
                          </select>
                        </td>

                        {/* Watts */}
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              step="0.5"
                              value={port.poeWatts}
                              onChange={(e) => handleUpdateWatts(idx, e.target.value)}
                              disabled={!port.poeEnabled}
                              className="w-16 h-7 px-2 rounded bg-slate-950 border border-slate-800 text-right font-bold text-amber-400 text-xs disabled:opacity-40 outline-none"
                            />
                            <span className="text-[10px] text-slate-500 font-sans">W</span>
                          </div>
                        </td>

                        {/* Priority */}
                        <td className="py-2 px-3 font-sans">
                          <select
                            value={port.priority}
                            onChange={(e) => handleUpdatePriority(idx, e.target.value)}
                            disabled={!port.poeEnabled}
                            className={`h-7 px-1.5 rounded text-[11px] font-semibold border outline-none disabled:opacity-40 ${
                              port.priority === 'Critical'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : port.priority === 'High'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            <option value="Critical">Critical (1)</option>
                            <option value="High">High (2)</option>
                            <option value="Low">Low (3)</option>
                          </select>
                        </td>

                        {/* Quick Presets */}
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {POE_PRESETS.slice(0, 4).map(preset => {
                              const PresetIcon = preset.icon;
                              return (
                                <button
                                  key={preset.name}
                                  type="button"
                                  onClick={() => handleApplyPreset(idx, preset)}
                                  title={`${preset.name} (${preset.watts}W)`}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <PresetIcon className="w-3 h-3" />
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CAPACITY PLANNER */}
          {activeTab === 'planner' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border space-y-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">
                    Калькулятор расширения парка оборудования («Что если?»)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Смоделируйте подключение дополнительных устройств к этому коммутатору перед закупкой или монтажом, чтобы убедиться, что штатный блок питания выдержит пусковые и рабочие токи.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {[
                    { key: 'ap', label: 'Wi-Fi 6 Точки (+15.5 Вт)', icon: Wifi },
                    { key: 'cctv', label: 'IP Камеры (+7.5 Вт)', icon: Video },
                    { key: 'ptz', label: 'PTZ Поворотные (+28 Вт)', icon: Video },
                    { key: 'voip', label: 'VoIP Телефоны (+4.5 Вт)', icon: Phone }
                  ].map(item => {
                    const ItemIcon = item.icon;
                    return (
                      <div key={item.key} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300 font-semibold">
                          <ItemIcon className="w-3.5 h-3.5 text-amber-400" />
                          <span>{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPlannerLoads(prev => ({ ...prev, [item.key]: Math.max(0, prev[item.key] - 1) }))}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="48"
                            value={plannerLoads[item.key]}
                            onChange={(e) => setPlannerLoads(prev => ({ ...prev, [item.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                            className="w-16 h-7 text-center font-bold font-mono text-white bg-slate-900 border border-slate-700 rounded text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setPlannerLoads(prev => ({ ...prev, [item.key]: prev[item.key] + 1 }))}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Projection Box */}
                <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  summary.projectedOverload
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium">Прогноз суммарной нагрузки:</span>
                    <div className="text-lg font-bold font-mono text-white">
                      {summary.projectedTotalWatts} Вт ({summary.projectedPercent}% от БП {psuBudget} Вт)
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Добавлено в симуляторе: +{summary.plannerAddedWatts} Вт
                    </span>
                  </div>

                  <div className="shrink-0">
                    {summary.projectedOverload ? (
                      <div className="px-3.5 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span>ТРЕБУЕТСЯ ЗАМЕНА БП НА БОЛЕЕ МОЩНЫЙ</span>
                      </div>
                    ) : (
                      <div className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>ЗАПАСА МОЩНОСТИ ДОСТАТОЧНО (Свободно: {Math.max(0, psuBudget - summary.projectedTotalWatts).toFixed(1)} Вт)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: UPS & LOAD SHEDDING */}
          {activeTab === 'ups-shedding' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Интеллектуальный сброс нагрузки при аварии питания (UPS Load-Shedding)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  При переходе серверной на питание от аккумуляторов ИБП порты с низким приоритетом (Low, офисные телефоны) автоматически отключаются, сохраняя драгоценную энергию для критических сервисов (СКУД, Wi-Fi и камеры).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-rose-400 block mb-1 font-bold">1. Critical (СКУД, Серверы)</span>
                    <span className="text-lg font-bold text-white">{summary.criticalWatts} Вт</span>
                    <p className="text-[10px] text-slate-400 font-sans mt-1">Никогда не отключаются</p>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-amber-400 block mb-1 font-bold">2. High (CCTV, Wi-Fi)</span>
                    <span className="text-lg font-bold text-white">{summary.highWatts} Вт</span>
                    <p className="text-[10px] text-slate-400 font-sans mt-1">Работают до разряда 20%</p>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <span className="text-blue-400 block mb-1 font-bold">3. Low (IP-телефоны)</span>
                    <span className="text-lg font-bold text-white">{summary.lowWatts} Вт</span>
                    <p className="text-[10px] text-slate-400 font-sans mt-1">Отключаются сразу при аварии</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                  <span>Экономия мощности ИБП при сбросе Low-портов:</span>
                  <span className="font-mono font-bold text-sm">+{summary.upsSavedWatts} Вт (~+35% времени автономии)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ENTERPRISE OVERVIEW */}
          {activeTab === 'enterprise' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900">
                  <span className="text-xs text-slate-400 block mb-1">Суммарный PoE бюджет предприятия</span>
                  <div className="text-2xl font-bold font-mono text-white">{enterpriseSummary.grandBudget} Вт</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900">
                  <span className="text-xs text-slate-400 block mb-1">Фактическое потребление сети</span>
                  <div className="text-2xl font-bold font-mono text-amber-400">{enterpriseSummary.grandUsed} Вт ({enterpriseSummary.percent}%)</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900">
                  <span className="text-xs text-slate-400 block mb-1">Всего активных PoE устройств</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400">{enterpriseSummary.grandPoePorts} шт.</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left font-sans">
                  <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Коммутатор</th>
                      <th className="py-2.5 px-3">Локация / Стойка</th>
                      <th className="py-2.5 px-3">Бюджет БП</th>
                      <th className="py-2.5 px-3">Потребление</th>
                      <th className="py-2.5 px-3">Загрузка</th>
                      <th className="py-2.5 px-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {switches.map(sw => {
                      const budget = sw.poeBudget || (sw.poe ? 370 : 0);
                      const used = (sw.ports || []).reduce((acc, p) => acc + (p.poe ? (p.poeWatts ? Number(p.poeWatts) : 12) : 0), 0);
                      const pct = budget > 0 ? Math.round((used / budget) * 100) : 0;
                      return (
                        <tr key={sw.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2 px-3 font-bold text-white font-sans">{sw.name}</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">{sw.location || 'Стойка'}</td>
                          <td className="py-2 px-3">{budget} W</td>
                          <td className="py-2 px-3 text-amber-400">{used.toFixed(1)} W</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pct > 90 ? 'bg-rose-500/20 text-rose-300' : pct > 75 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {pct}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchChange(sw.id);
                                setActiveTab('ports');
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-300 text-[11px] transition-colors cursor-pointer"
                            >
                              Настроить
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-xs">
            {saveSuccess ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Настройки PoE успешно сохранены в базу данных!
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Изменения сохраняются в конфигурацию коммутатора
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={handleSaveToDatabase}
              disabled={isSaving}
              className="h-9 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>Сохранить в базу</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
