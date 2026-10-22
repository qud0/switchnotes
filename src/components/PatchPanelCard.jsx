import React from 'react';
import { Layers, MapPin, Cable, CheckCircle2 } from 'lucide-react';

export function PatchPanelCard({ panelItem, isSelected, onSelect, theme = 'dark' }) {
  const ports = panelItem.ports || [];
  const connectedCount = ports.filter(p => p.connectedSwitchId).length;
  const freeCount = ports.filter(p => !p.connectedSwitchId && p.status !== 'damaged').length;
  const damagedCount = ports.filter(p => p.status === 'damaged').length;

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? (isLight
              ? 'bg-amber-50/80 border-amber-500 shadow-md ring-1 ring-amber-500/50'
              : 'bg-slate-900 border-amber-500/80 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/60')
          : (isLight
              ? 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700')
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-2 rounded-lg shrink-0 transition-colors ${
              isSelected
                ? (isLight ? 'bg-amber-100 text-amber-600' : 'bg-amber-500/20 text-amber-400')
                : (isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400')
            }`}
          >
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className={`font-mono font-bold text-sm truncate ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {panelItem.name}
            </h3>
            <div className="text-xs text-slate-500 truncate">
              {panelItem.model || '19" 24xRJ45 Cat.6 1U'}
            </div>
          </div>
        </div>

        <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">
          {connectedCount}/{ports.length}
        </span>
      </div>

      {/* Location */}
      {panelItem.location && (
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-500 truncate">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{panelItem.location}</span>
        </div>
      )}

      {/* Ports summary */}
      <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] ${
        isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800/80 text-slate-400'
      }`}>
        <span>{ports.length} портов</span>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-emerald-600 dark:text-emerald-400">{connectedCount} комм.</span>
          <span className="text-slate-400">{freeCount} своб.</span>
          {damagedCount > 0 && (
            <span className="text-rose-500">{damagedCount} обрыв</span>
          )}
        </div>
      </div>
    </button>
  );
}
