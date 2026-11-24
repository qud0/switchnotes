import React, { useState, useEffect } from 'react';
import { 
  History, RotateCcw, Play, ChevronLeft, ChevronRight, 
  Check, AlertTriangle, Clock, User, ArrowRight, X, Sparkles
} from 'lucide-react';
import { api } from '../api';

export default function TimeMachineSlider({
  switchId,
  isOpen,
  onClose,
  onStateChange,
  onRollbackComplete,
  theme = 'dark'
}) {
  const [timeline, setTimeline] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0); // 0 is live
  const [loading, setLoading] = useState(true);
  const [activeCheckpointData, setActiveCheckpointData] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [error, setError] = useState(null);

  const isLight = theme === 'light';

  // Load timeline on mount or switchId change
  useEffect(() => {
    let active = true;

    async function loadTimeline() {
      if (!switchId || !isOpen) return;
      setLoading(true);
      setError(null);

      try {
        const res = await api.getTimeMachineTimeline(switchId);
        if (!active) return;
        setTimeline(res.timeline || []);
        setSelectedIndex(0);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Ошибка загрузки шкалы времени');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTimeline();

    return () => {
      active = false;
    };
  }, [switchId, isOpen]);

  // Load checkpoint details when selectedIndex changes
  useEffect(() => {
    let active = true;

    async function loadCheckpoint() {
      if (!switchId || timeline.length === 0) return;
      const chk = timeline[selectedIndex];
      if (!chk) return;

      try {
        const data = await api.getTimeMachineCheckpoint(switchId, chk.id);
        if (!active) return;
        setActiveCheckpointData(data);
        if (onStateChange) {
          onStateChange(data);
        }
      } catch (err) {
        if (!active) return;
        console.error('Time machine checkpoint load error:', err);
      }
    }

    loadCheckpoint();

    return () => {
      active = false;
    };
  }, [switchId, selectedIndex, timeline]);

  const handleRollback = async () => {
    if (!switchId || !activeCheckpointData) return;
    const chk = activeCheckpointData.checkpoint;
    if (chk.isLive) return;

    if (!window.confirm(`Вы уверены, что хотите откатить конфигурацию коммутатора к точке «${chk.label}»?`)) {
      return;
    }

    setRollbackLoading(true);
    try {
      const res = await api.rollbackTimeMachineCheckpoint(switchId, chk.id);
      if (onRollbackComplete) {
        onRollbackComplete(res);
      }
      setSelectedIndex(0);
    } catch (err) {
      alert(`Ошибка отката: ${err.message}`);
    } finally {
      setRollbackLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentChk = timeline[selectedIndex] || { label: 'Live' };
  const isLive = selectedIndex === 0;

  return (
    <div className={`p-4 rounded-2xl border shadow-xl space-y-4 font-sans animate-fadeIn select-none ${
      isLight 
        ? 'bg-amber-50/70 border-amber-300 text-slate-800' 
        : 'bg-slate-900/95 border-amber-500/40 text-slate-100'
    }`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <History className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Машина времени (Time-Machine Config Playback)
              </h3>
              {!isLive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                  ПРОСМОТР ИСТОРИИ
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Перемещайте ползунок назад во времени для визуального сравнения состояния портов и VLAN
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLive && (
            <button
              onClick={() => setSelectedIndex(0)}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Вернуться в Live</span>
            </button>
          )}

          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
              isLight ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
            }`}
            title="Выйти из режима машины времени"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline Slider Rail */}
      <div className="space-y-3 pt-1">
        <div className="relative flex items-center">
          {/* Track line */}
          <div className={`absolute left-0 right-0 h-1.5 rounded-full ${
            isLight ? 'bg-slate-200' : 'bg-slate-800'
          }`} />

          {/* Milestone points */}
          <div className="relative w-full flex items-center justify-between">
            {timeline.map((chk, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <button
                  key={chk.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`group flex flex-col items-center cursor-pointer transition-transform ${
                    isSelected ? 'scale-110' : 'hover:scale-105'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                    isSelected
                      ? 'bg-amber-400 border-amber-300 shadow-md shadow-amber-500/50'
                      : (isLight ? 'bg-white border-slate-400 group-hover:border-amber-500' : 'bg-slate-900 border-slate-600 group-hover:border-amber-400')
                  }`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-slate-950" />}
                  </div>
                  <span className={`mt-1.5 text-[10px] font-mono font-semibold transition-colors ${
                    isSelected 
                      ? 'text-amber-400 font-bold' 
                      : (isLight ? 'text-slate-600' : 'text-slate-400')
                  }`}>
                    {chk.timeAgo}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Checkpoint Details Card */}
      {activeCheckpointData && (
        <div className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-3 ${
          isLight ? 'bg-white border-amber-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentChk.label}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-black/20 text-slate-300'}`}>
                  {new Date(currentChk.timestamp).toLocaleString()}
                </span>
                <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 flex items-center gap-1 font-semibold">
                  <User className="w-3 h-3" />
                  {currentChk.author}
                </span>
              </div>
              <p className="text-xs text-slate-400">{currentChk.summary}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeCheckpointData.diffs.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-amber-400 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  {activeCheckpointData.diffs.length} изм. портов
                </span>

                <button
                  onClick={handleRollback}
                  disabled={rollbackLoading}
                  className="h-8 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${rollbackLoading ? 'animate-spin' : ''}`} />
                  <span>{rollbackLoading ? 'Откат...' : 'Откатить к этой точке'}</span>
                </button>
              </div>
            ) : (
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Идентично текущему состоянию</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Diff Preview Drawer (if differences exist) */}
      {activeCheckpointData && activeCheckpointData.diffs.length > 0 && (
        <div className={`p-2.5 rounded-xl border space-y-1 text-xs font-mono ${
          isLight ? 'bg-amber-100/50 border-amber-200' : 'bg-slate-950/40 border-amber-500/20'
        }`}>
          <div className="text-[10px] uppercase font-bold text-amber-400 mb-1 font-sans">
            Обнаруженные отличия на портах (Live ➔ Выбранная точка):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {activeCheckpointData.diffs.map((diff) => (
              <div key={diff.portId} className={`p-2 rounded-lg border ${
                isLight ? 'bg-white border-amber-200 shadow-xs' : 'bg-black/20 border-slate-800'
              }`}>
                <div className={`font-bold flex items-center justify-between ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <span>Порт {diff.portName}</span>
                  <span className="text-[10px] text-amber-500 font-mono">#{diff.portNum}</span>
                </div>
                {diff.changes.map((c, i) => (
                  <div key={i} className={`text-[11px] mt-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                    <span className="text-slate-400">{c.label}: </span>
                    <span className="line-through text-rose-500 dark:text-rose-400 font-semibold">{String(c.current)}</span>
                    <ArrowRight className="w-3 h-3 inline mx-1 text-slate-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{String(c.historical)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
