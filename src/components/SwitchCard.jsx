import React from 'react';
import { Server, MapPin, Globe, Zap, Link as LinkIcon, AlertTriangle, Terminal, Wrench } from 'lucide-react';
import { checkVlanMismatch } from '../utils/vlanMismatch';

export function SwitchCard({ switchItem, allSwitches = [], isSelected, onSelect, onOpenWebSsh, onOpenTroubleshoot, onOpenPoeModal, theme = 'dark' }) {
  const ports = switchItem.ports || [];
  const accessCount = ports.filter(p => p.mode === 'access').length;
  const trunkCount = ports.filter(p => p.mode === 'trunk').length;
  const poeCount = ports.filter(p => p.poe).length;
  const linkedCount = ports.filter(p => p.linkedSwitchId).length;

  const usedPoeWatts = ports.reduce((acc, p) => acc + (p.poe ? (p.poeWatts !== undefined ? Number(p.poeWatts) : 12) : 0), 0);
  const poeBudget = switchItem.poeBudget || (switchItem.poe ? 370 : 0);
  const poePct = poeBudget > 0 ? Math.min(100, Math.round((usedPoeWatts / poeBudget) * 100)) : 0;

  // Check if any port on this switch has a mismatch with its peer
  const hasAnyMismatch = ports.some(p => {
    if (!p.linkedSwitchId) return false;
    const peerSw = allSwitches.find(s => s.id === p.linkedSwitchId);
    const peerPort = peerSw?.ports?.find(prt => prt.id === p.linkedPortId || prt.number === p.linkedPortId);
    if (!peerPort) return false;
    return checkVlanMismatch(p, peerPort)?.hasMismatch;
  });

  const isLight = theme === 'light';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? (isLight
              ? 'bg-blue-50/80 border-blue-500 shadow-md ring-1 ring-blue-500/50'
              : 'bg-slate-900 border-blue-500/80 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/60')
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
                ? (isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-500/20 text-blue-400')
                : (isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400')
            }`}
          >
            <Server className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className={`font-mono font-bold text-sm truncate ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {switchItem.name}
              </h3>
              {hasAnyMismatch && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" title="Есть расхождения VLAN" />
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 truncate">
                {switchItem.vendor} {switchItem.model}
              </span>
              {switchItem.badge && (
                <span
                  className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md text-white shadow-xs shrink-0"
                  style={{ backgroundColor: switchItem.color || '#3b82f6' }}
                >
                  {switchItem.badge}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenTroubleshoot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTroubleshoot(switchItem.id);
              }}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800'
                  : 'bg-slate-800/90 hover:bg-amber-600/30 border-slate-750 text-amber-400 hover:text-amber-300'
              }`}
              title="Интеллектуальный траблшутер неполадок коммутатора"
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenWebSsh && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenWebSsh(switchItem);
              }}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isLight
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800'
                  : 'bg-slate-800/90 hover:bg-blue-600/30 border-slate-750 text-blue-400 hover:text-blue-300'
              }`}
              title="Открыть интерактивный Web-SSH терминал"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
          )}
          {switchItem.ip && (
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {switchItem.ip}
            </span>
          )}
        </div>
      </div>

      {/* Location */}
      {switchItem.location && (
        <div className="flex items-center gap-1.5 mt-2.5 text-xs text-slate-500 truncate">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{switchItem.location}</span>
        </div>
      )}

      {/* Port distribution preview */}
      <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] ${
        isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800/80 text-slate-400'
      }`}>
        <span>{ports.length} портов</span>
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-mono">{accessCount} Acc</span>
          <span className="text-purple-600 dark:text-purple-400 font-mono">{trunkCount} Trk</span>
          {linkedCount > 0 && (
            <span className="text-cyan-600 dark:text-cyan-400 font-mono flex items-center gap-0.5">
              <LinkIcon className="w-2.5 h-2.5" />
              {linkedCount}
            </span>
          )}
          {poeCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                if (onOpenPoeModal) {
                  e.stopPropagation();
                  onOpenPoeModal(switchItem.id);
                }
              }}
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-bold transition-all ${
                poePct > 90
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
                  : poePct > 75
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                  : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20'
              }`}
              title="Открыть менеджер бюджета питания PoE"
            >
              <Zap className="w-2.5 h-2.5 fill-current" />
              <span>{Math.round(usedPoeWatts)}W ({poeCount})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
