import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Server,
  Network,
  Camera,
  Wifi,
  ShieldAlert,
  ArrowRight,
  X,
  PowerOff,
  Check,
  ChevronRight
} from 'lucide-react';

export function BlastRadiusModal({
  isOpen,
  onClose,
  onConfirm,
  switchData,
  port = null,
  ports = [],
  blastRadius,
  action = 'disable', // 'disable' | 'vlan_change'
  theme = 'dark'
}) {
  if (!isOpen || !blastRadius) return null;

  const isLight = theme === 'light';
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const {
    riskLevel = 'medium',
    hasDownstreamSwitches = false,
    downstreamSwitches = [],
    connectedDevices = [],
    impactedVlans = [],
    totalCctv = 0,
    totalAp = 0,
    totalServers = 0,
    totalAffectedCount = 0,
    summaryMessage = ''
  } = blastRadius;

  const isCritical = riskLevel === 'critical';
  const isHigh = riskLevel === 'high';
  const requiresCheckbox = isCritical || isHigh;

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsExecuting(false);
    }
  };

  const portTitle = port
    ? `Порт ${port.number || port.id} (${port.name || `Port ${port.number}`})`
    : `Группа портов (${ports.length} шт.)`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className={`w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isCritical
          ? 'border-rose-500/50 shadow-rose-950/50'
          : isHigh
            ? 'border-amber-500/50 shadow-amber-950/50'
            : 'border-slate-700 shadow-black/60'
      } ${
        isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-100'
      }`}>
        {/* Header Alert Banner */}
        <div className={`p-4 sm:p-5 border-b flex items-start gap-3.5 shrink-0 ${
          isCritical
            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            : isHigh
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isCritical
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              : isHigh
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400'
          }`}>
            {isCritical ? (
              <AlertOctagon className="w-5 h-5 animate-pulse" />
            ) : isHigh ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">
                Предупреждение о последствиях (Blast Radius)
              </h2>
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border uppercase ${
                isCritical
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : isHigh
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
              }`}>
                {isCritical ? 'Критический риск' : isHigh ? 'Высокий риск' : 'Внимание'}
              </span>
            </div>

            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {summaryMessage}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Switch & Port Reference */}
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Коммутатор:</span>
              <span className="font-bold text-white">{switchData.name}</span>
              <span className="text-slate-500">({switchData.model || switchData.vendor})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Действие:</span>
              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                Отключение ({portTitle})
              </span>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Network className="w-3.5 h-3.5 text-blue-400" />
                <span>Свитчи цепи</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {downstreamSwitches.length}
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span>Серверы / СХД</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {totalServers + connectedDevices.filter(d => d.type === 'server').length}
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Camera className="w-3.5 h-3.5 text-amber-400" />
                <span>Камеры CCTV</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {totalCctv + connectedDevices.filter(d => d.type === 'cctv').length}
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <Wifi className="w-3.5 h-3.5 text-purple-400" />
                <span>Точки Wi-Fi</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {totalAp + connectedDevices.filter(d => d.type === 'ap').length}
              </div>
            </div>
          </div>

          {/* Downstream Topology Cascade Flow */}
          {hasDownstreamSwitches && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Каскадная цепочка отключения оборудования
              </label>
              <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                {/* Source Port */}
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-bold text-rose-400">{switchData.name}</span>
                  <span className="text-slate-400">[{portTitle}]</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-rose-400 font-semibold">РАЗРЫВ МАГИСТРАЛИ</span>
                </div>

                {/* Downstream switches cards */}
                <div className="pl-4 border-l-2 border-rose-500/40 space-y-2 ml-1">
                  {downstreamSwitches.map((ds, idx) => (
                    <div
                      key={ds.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{ds.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal font-mono">
                              ({ds.ip || ds.model})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {ds.location} • {ds.activePortsCount} активных портов
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {ds.cctvCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            📹 {ds.cctvCount}
                          </span>
                        )}
                        {ds.apCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            📶 {ds.apCount}
                          </span>
                        )}
                        {ds.serverCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            🖥️ {ds.serverCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Connected Devices (IPAM & Servers) */}
          {connectedDevices.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Прямо подключенные серверы и узлы сети ({connectedDevices.length})
              </label>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                {connectedDevices.map((dev, i) => (
                  <div key={i} className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-slate-900/60 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${dev.isCritical ? 'bg-rose-500' : 'bg-blue-400'}`} />
                      <div>
                        <span className="font-bold text-white block">{dev.name}</span>
                        {dev.description && (
                          <span className="text-[11px] text-slate-400">{dev.description}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      {dev.ip && <span className="text-slate-300">{dev.ip}</span>}
                      {dev.isCritical && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-sans font-semibold">
                          Critical
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impacted VLANs */}
          {impactedVlans.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Затронутые сегменты сети (VLAN: {impactedVlans.length} шт.)
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {impactedVlans.slice(0, 10).map(v => (
                  <span
                    key={v.id}
                    className="text-xs px-2 py-0.5 rounded-md font-mono border flex items-center gap-1"
                    style={{ borderColor: `${v.color || '#3b82f6'}40`, backgroundColor: `${v.color || '#3b82f6'}15`, color: v.color || '#93c5fd' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: v.color || '#3b82f6' }} />
                    <span>VLAN {v.id} ({v.name})</span>
                  </span>
                ))}
                {impactedVlans.length > 10 && (
                  <span className="text-xs text-slate-500 font-mono">
                    +{impactedVlans.length - 10} ещё...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Confirmation Checkbox for High/Critical Risks */}
          {requiresCheckbox && (
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
              isConfirmed
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-300'
            }`}>
              <input
                type="checkbox"
                id="blastRadiusConfirmCheck"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-rose-600 rounded cursor-pointer shrink-0"
              />
              <label htmlFor="blastRadiusConfirmCheck" className="text-xs leading-relaxed cursor-pointer select-none">
                <span className="font-bold text-white block mb-0.5">
                  Я подтверждаю отключение и осознаю последствия
                </span>
                Я понимаю, что отключение данного порта разорвёт связь с указанными выше коммутаторами, сервисами и пользователями.
              </label>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="text-xs text-slate-400">
            {requiresCheckbox && !isConfirmed && (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Требуется подтверждение для разблокировки
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
            >
              Отмена (Безопасно)
            </button>

            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting || (requiresCheckbox && !isConfirmed)}
              className={`px-5 py-2 rounded-xl text-white font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isCritical
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/30'
              }`}
            >
              {isExecuting ? (
                <span>Отключение...</span>
              ) : (
                <>
                  <PowerOff className="w-4 h-4" />
                  <span>Всё равно отключить</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
