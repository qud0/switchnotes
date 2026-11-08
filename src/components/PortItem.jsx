import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Link as LinkIcon, AlertTriangle, ArrowUpRight, Activity, LineChart } from 'lucide-react';
import { checkVlanMismatch } from '../utils/vlanMismatch';
import { getTrafficPulse, formatTrafficSpeed } from '../utils/portColors';

export function PortItem({
  port,
  vlanMap,
  isSelected,
  onSelect,
  onOpenDetails,
  highlightVlanId,
  selectionMode = false,
  peerSwitch = null,
  peerPort = null,
  onJumpToPeer = null,
  showCableTags = false,
  heatmapMode = 'none', // 'none' | 'poe' | 'speed'
  liveTelemetry = null, // live SNMP metrics { operStatus, rxMbps, txMbps, hasErrors, recentErrors, inErrors }
  showSparklines = false,
  trafficHistory = [],
  onOpenChart = null,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);
  const portButtonRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (portButtonRef.current) {
      setTooltipPos(portButtonRef.current.getBoundingClientRect());
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 150);
  };

  const handleTooltipMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    setShowTooltip(false);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Close tooltip if user scrolls or resizes to prevent detached floating tooltips
  useEffect(() => {
    if (!showTooltip) return;
    const handleScrollOrResize = () => {
      setShowTooltip(false);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [showTooltip]);

  // Check if port carries the highlighted VLAN
  const isVlanHighlighted = highlightVlanId !== null && (
    port.pvid === highlightVlanId ||
    (port.taggedVlans && port.taggedVlans.includes(highlightVlanId))
  );

  const isDimmed = highlightVlanId !== null && !isVlanHighlighted;

  // VLAN mismatch analysis
  const mismatchResult = peerPort ? checkVlanMismatch(port, peerPort) : null;
  const hasMismatch = mismatchResult?.hasMismatch;

  // VLAN information
  const nativeVlan = vlanMap[port.pvid] || { id: port.pvid, name: `VLAN ${port.pvid}`, color: '#64748b' };
  const taggedVlanObjects = (port.taggedVlans || []).map(id => vlanMap[id] || { id, name: `VLAN ${id}`, color: '#64748b' });

  // Port colors & styling
  const isTrunk = port.mode === 'trunk';
  const isDisabled = !port.enabled || port.mode === 'disabled';
  const isSfp = port.type === 'sfp';
  const isLinked = Boolean(port.linkedSwitchId && peerSwitch);

  // Simulated link speed: 10G for SFP+, 1G for copper, or from port.speed
  const speed = port.speed || (isSfp ? '10G' : '1G');
  const isLinkUp = liveTelemetry
    ? liveTelemetry.operStatus === 'up'
    : (!isDisabled && (isLinked || Boolean(port.connectedTo)));

  // Live traffic activity check & total throughput
  const rxMbps = liveTelemetry?.rxMbps || 0;
  const txMbps = liveTelemetry?.txMbps || 0;
  const totalTrafficMbps = rxMbps + txMbps;
  const isTrafficActive = liveTelemetry && isLinkUp && (totalTrafficMbps > 0.05);

  // Formatted traffic label for port badge using shared utility
  const formattedTraffic = formatTrafficSpeed(totalTrafficMbps);

  // Traffic pulse levels using shared utility
  const pulse = isLinkUp ? getTrafficPulse(totalTrafficMbps, isLight) : {
    level: 0,
    ledColor: isLight ? '#94a3b8' : '#334155',
    ledGlow: '',
    heatmapColor: isLight ? '#94a3b8' : '#334155'
  };
  const trafficLevel = pulse.level;
  const trafficLedColor = pulse.ledColor;
  const trafficLedGlow = pulse.ledGlow;
  const trafficHeatmapColor = pulse.heatmapColor;

  // PoE Power Watts estimation / value
  const poeWatts = port.poeWatts || (port.poe ? 15.4 : 0);

  // Heatmap Overrides
  let heatmapAccent = null;
  if (heatmapMode === 'traffic') {
    heatmapAccent = trafficHeatmapColor;
  } else if (heatmapMode === 'poe') {
    if (!port.poe || poeWatts === 0) {
      heatmapAccent = isLight ? '#94a3b8' : '#334155'; // Grey for no PoE
    } else if (poeWatts > 15.4) {
      heatmapAccent = '#ef4444'; // Red high PoE (802.3at/bt >15.4W)
    } else if (poeWatts > 7) {
      heatmapAccent = '#f59e0b'; // Amber mid PoE (802.3af 7-15.4W)
    } else {
      heatmapAccent = '#0ea5e9'; // Blue/Sky active PoE (<7W)
    }
  } else if (heatmapMode === 'speed') {
    if (isDisabled || !isLinkUp) {
      heatmapAccent = isLight ? '#94a3b8' : '#334155'; // Grey for down
    } else if (speed === '10G' || isSfp) {
      heatmapAccent = '#a855f7'; // Purple 10G
    } else if (speed === '100M') {
      heatmapAccent = '#f59e0b'; // Amber 100M
    } else {
      heatmapAccent = '#10b981'; // Green 1G
    }
  }

  // Primary accent color
  const accentColor = heatmapAccent || (isDisabled
    ? (isLight ? '#94a3b8' : '#475569')
    : isTrunk
      ? '#8b5cf6'
      : (nativeVlan ? nativeVlan.color : '#3b82f6'));

  const handleClick = (e) => {
    if (selectionMode || e.shiftKey || e.ctrlKey) {
      e.stopPropagation();
      onSelect(port.id);
    } else {
      onOpenDetails(port);
    }
  };

  const handleJump = (e) => {
    e.stopPropagation();
    if (onJumpToPeer && port.linkedSwitchId) {
      onJumpToPeer(port.linkedSwitchId, port.linkedPortId);
    }
  };

  return (
    <div className="relative group inline-block">
      {/* On-Faceplate Live Traffic Sparkline Mini-Bar (Rx/Tx) */}
      {showSparklines && (
        <div className="mb-1 w-full flex flex-col items-center">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onOpenChart?.(port);
            }}
            className={`w-full h-3.5 px-0.5 rounded-xs border flex items-end justify-between gap-px cursor-pointer transition-all ${
              isLight
                ? 'bg-slate-200/90 border-slate-300 hover:border-blue-400'
                : 'bg-slate-950/90 border-slate-800 hover:border-emerald-500/50'
            }`}
            title={`График порта ${port.number}: ↓ ${liveTelemetry?.rxMbps || 0} / ↑ ${liveTelemetry?.txMbps || 0} Мбит/с. Нажмите для подробного графика`}
          >
            {/* 6 mini bar sparklines representing recent history */}
            {(() => {
              const historySlice = (trafficHistory && trafficHistory.length > 0)
                ? trafficHistory.slice(-6)
                : [
                    { rxMbps: liveTelemetry?.rxMbps ? liveTelemetry.rxMbps * 0.4 : 0 },
                    { rxMbps: liveTelemetry?.rxMbps ? liveTelemetry.rxMbps * 0.6 : 0 },
                    { rxMbps: liveTelemetry?.rxMbps ? liveTelemetry.rxMbps * 0.8 : 0 },
                    { rxMbps: liveTelemetry?.rxMbps || 0 }
                  ];

              const maxSample = Math.max(10, ...historySlice.map(h => (h.rxMbps || 0) + (h.txMbps || 0)));

              return historySlice.map((pt, idx) => {
                const total = (pt.rxMbps || 0) + (pt.txMbps || 0);
                const heightPct = Math.min(100, Math.max(15, Math.round((total / maxSample) * 100)));
                const barColor = total > 500 ? '#f43f5e' : total > 50 ? '#38bdf8' : total > 0.1 ? '#34d399' : (isLight ? '#cbd5e1' : '#334155');

                return (
                  <span
                    key={idx}
                    className="flex-1 rounded-xs transition-all duration-300"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: barColor
                    }}
                  />
                );
              });
            })()}
          </div>
        </div>
      )}

      <button
        ref={portButtonRef}
        type="button"
        onClick={(e) => {
          setShowTooltip(false);
          handleClick(e);
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative flex flex-col items-center justify-between transition-all duration-150 cursor-pointer select-none rounded-md
          ${isSfp ? 'w-13 h-20 p-1.5' : 'w-11 h-18 p-1'}
          ${isLight
            ? (isDisabled ? 'bg-slate-200 border-slate-300 opacity-60' : 'bg-slate-100/90 border')
            : (isDisabled ? 'bg-slate-900/90 border border-slate-800 opacity-60' : 'bg-slate-800/95 border')
          }
          ${isSelected
            ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950 scale-105 z-20 shadow-lg'
            : 'hover:scale-102 hover:z-10'
          }
          ${isVlanHighlighted ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900 shadow-amber-500/30 shadow-lg animate-pulse' : ''}
          ${isDimmed ? 'opacity-20 grayscale' : 'opacity-100'}
        `}
        style={{
          borderColor: isSelected
            ? '#3b82f6'
            : isVlanHighlighted
              ? '#fbbf24'
              : hasMismatch
                ? '#ef4444'
                : `${accentColor}88`,
          boxShadow: isSelected ? `0 0 12px ${accentColor}66` : undefined
        }}
      >
        {/* Top: Port Number & Dual Real-World LEDs (Link/Speed + PoE/Activity) */}
        <div className="w-full flex items-center justify-between text-[10px] font-mono leading-none">
          <span className={`font-bold ${isLight ? (isSelected ? 'text-blue-600' : 'text-slate-700') : (isSelected ? 'text-blue-400' : 'text-slate-300')}`}>
            {port.number}
          </span>

          {/* Dual LED Cluster with realistic glow */}
          <div className="flex items-center gap-1">
            {/* LED 1: Link & Activity LED with Traffic Pulse (Green <10M, Yellow 10-100M, Orange 100-500M, Red >500M) */}
            {hasMismatch || liveTelemetry?.hasErrors ? (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444] animate-ping" title={hasMismatch ? "Ошибка согласования VLAN!" : "Ошибки на порту (CRC/Drop errors)"} />
            ) : isLinkUp ? (
              <span
                className={`w-1.5 h-1.5 rounded-full ${trafficLedGlow || (speed === '10G' ? 'shadow-[0_0_7px_#fbbf24]' : 'shadow-[0_0_6px_#34d399]')}`}
                style={{ backgroundColor: trafficLedColor }}
                title={`Линк ${speed} UP: ${totalTrafficMbps > 0 ? `Трафик ↓${rxMbps} / ↑${txMbps} Мбит/с` : 'Нет активного трафика'}`}
              />
            ) : (
              <span
                className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`}
                title="Link Down (Нет несущей)"
              />
            )}

            {/* LED 2: PoE Blue Power Indicator (Синий огонек питания 48V) or LAG indicator */}
            {port.poe ? (
              <span
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  poeWatts > 0 || isLinkUp
                    ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse'
                    : 'bg-sky-950 border border-sky-800'
                }`}
                title={`⚡ PoE Питание: ${poeWatts.toFixed(1)}W (802.3${poeWatts > 15.4 ? 'at' : 'af'})`}
              />
            ) : isLinked ? (
              <span
                className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_#22d3ee]"
                title={`Линк на свитч: ${peerSwitch?.name}`}
              />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-300/60' : 'bg-slate-800'}`} />
            )}
          </div>
        </div>

        {/* Center: Realistic Physical Jack (RJ-45 Metallic Cage or SFP Transceiver Cage) */}
        {isSfp ? (
          /* SFP / SFP+ Optical Cage with LC Duplex Transceiver latch */
          <div className={`w-full h-8.5 rounded-xs border flex flex-col items-center justify-between p-0.5 relative overflow-hidden shadow-inner ${
            isLight
              ? 'bg-linear-to-b from-slate-200 to-slate-300 border-slate-400'
              : 'bg-linear-to-b from-slate-800 to-slate-900 border-slate-600/80'
          }`}>
            {/* Metallic cage top bracket */}
            <div className={`w-full h-1 border-b rounded-t-xs flex justify-around px-0.5 ${
              isLight ? 'bg-slate-400/80 border-slate-500' : 'bg-slate-700/80 border-slate-600'
            }`}>
              <div className="w-1.5 h-0.5 bg-slate-500" />
              <div className="w-1.5 h-0.5 bg-slate-500" />
            </div>

            {/* Inner SFP optical duplex port receiver (Blue/Aqua latch) */}
            <div className={`w-full h-5 rounded-xs flex items-center justify-center gap-1 border shadow-inner ${
              isLinkUp
                ? (speed === '10G' ? 'bg-cyan-950/70 border-cyan-500/50' : 'bg-blue-950/70 border-blue-500/50')
                : (isLight ? 'bg-slate-300/80 border-slate-400' : 'bg-slate-950 border-slate-700/60')
            }`}>
              {/* Dual LC Fiber Optics Ferrules */}
              <div className={`w-1.5 h-2.5 rounded-xs border flex flex-col justify-center items-center ${
                isLinkUp ? 'bg-cyan-400/80 border-cyan-300' : (isLight ? 'bg-slate-400 border-slate-500' : 'bg-slate-800 border-slate-700')
              }`}>
                <div className={`w-0.5 h-0.5 rounded-full ${isLinkUp ? 'bg-white' : 'bg-slate-600'}`} />
              </div>
              <div className={`w-1.5 h-2.5 rounded-xs border flex flex-col justify-center items-center ${
                isLinkUp ? 'bg-cyan-400/80 border-cyan-300' : (isLight ? 'bg-slate-400 border-slate-500' : 'bg-slate-800 border-slate-700')
              }`}>
                <div className={`w-0.5 h-0.5 rounded-full ${isLinkUp ? 'bg-white' : 'bg-slate-600'}`} />
              </div>
            </div>

            {/* SFP Bail Latch Lever (Защелка оптического трансивера) */}
            <div className={`w-8 h-1 rounded-xs border-t ${
              isLinkUp ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_4px_#06b6d4]' : (isLight ? 'bg-slate-400 border-slate-500' : 'bg-slate-600 border-slate-500')
            }`} />

            {/* SFP Disabled (Shutdown) Overlay */}
            {isDisabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 rounded-xs z-10">
                <span className="text-[8px] font-mono font-black text-rose-500 uppercase tracking-tight">
                  OFF
                </span>
              </div>
            )}
          </div>
        ) : (
          /* RJ-45 Metallic Shielded Jack with 8 Golden Pins & Notch */
          <div
            className={`w-9 h-8 rounded-xs border flex flex-col items-center justify-between p-0.5 relative transition-colors shadow-inner ${
              isTrunk ? (isLight ? 'trunk-stripes-light' : 'trunk-stripes') : ''
            }`}
            style={{
              backgroundColor: isDisabled
                ? (isLight ? '#e2e8f0' : '#0f172a')
                : `${accentColor}${isLight ? '33' : '22'}`,
              borderColor: isDisabled
                ? (isLight ? '#cbd5e1' : '#334155')
                : `${accentColor}88`
            }}
          >
            {/* Metallic Shielded Shell Top with 8 Gold Contact Pins */}
            <div className="w-full flex justify-between px-0.5 pt-0.5">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 h-2 rounded-xs shadow-xs"
                  style={{
                    backgroundColor: isDisabled ? '#94a3b8' : '#eab308',
                    boxShadow: !isDisabled && isLinkUp ? '0 0 2px #facc15' : 'none'
                  }}
                />
              ))}
            </div>

            {/* RJ-45 Center Guide Slot */}
            <div className={`w-5 h-1 rounded-xs ${
              isLight ? 'bg-slate-300/80' : 'bg-slate-900/90'
            }`} />

            {/* RJ-45 Clip Lock Notch (Защелка коннектора 8P8C) */}
            <div className={`w-3.5 h-1.5 rounded-t-xs border-t border-x ${
              isLight
                ? 'bg-slate-200 border-slate-300'
                : 'bg-slate-950 border-slate-700'
            }`} />

            {/* RJ-45 Disabled (Shutdown) Overlay */}
            {isDisabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 rounded-xs z-10">
                <span className="text-[8px] font-mono font-black text-rose-500 uppercase tracking-tight">
                  OFF
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom: VLAN ID / Trunk Mode and LAG badge */}
        <div className="w-full flex items-center justify-center gap-0.5 leading-none mt-0.5">
          {port.lagId && (
            <span
              className="text-[8px] font-mono font-bold px-0.5 py-0.2 rounded-xs bg-indigo-500/20 text-indigo-500 border border-indigo-500/30"
              title={`Входит в группу агрегации LAG ${port.lagId}`}
            >
              L{port.lagId}
            </span>
          )}
          {isDisabled ? (
            <span className="text-[9px] font-mono text-slate-400">OFF</span>
          ) : heatmapMode === 'traffic' ? (
            <span
              className="inline-block text-[8px] font-mono font-bold px-1 py-0.5 rounded-xs border transition-all"
              style={{
                backgroundColor: `${accentColor}25`,
                borderColor: `${accentColor}66`,
                color: accentColor
              }}
              title={`Текущий суммарный трафик: ↓ ${rxMbps} / ↑ ${txMbps} Мбит/с`}
            >
              {formattedTraffic}
            </span>
          ) : isDisabled ? (
            <span className="inline-block text-[8px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded-xs border border-rose-500/30">
              OFF
            </span>
          ) : heatmapMode === 'poe' ? (
            <span
              className="inline-block text-[8px] font-mono font-bold px-1 py-0.5 rounded-xs border"
              style={{
                backgroundColor: `${accentColor}25`,
                borderColor: `${accentColor}55`,
                color: accentColor
              }}
            >
              {port.poe ? `${poeWatts.toFixed(0)}W` : '0W'}
            </span>
          ) : heatmapMode === 'speed' ? (
            <span
              className="inline-block text-[8px] font-mono font-bold px-1 py-0.5 rounded-xs border"
              style={{
                backgroundColor: `${accentColor}25`,
                borderColor: `${accentColor}55`,
                color: accentColor
              }}
            >
              {speed}
            </span>
          ) : isTrunk ? (
            <span className="inline-block text-[9px] font-mono font-bold text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-1 py-0.5 rounded-xs border border-purple-300 dark:border-purple-500/40">
              TRK
            </span>
          ) : (
            <span
              className="inline-block text-[9px] font-mono font-bold px-1 py-0.5 rounded-xs border"
              style={{
                backgroundColor: `${nativeVlan.color}25`,
                borderColor: `${nativeVlan.color}55`,
                color: nativeVlan.color
              }}
            >
              V{port.pvid}
            </span>
          )}
        </div>
      </button>

      {/* On-Faceplate Miniature Cable Tag (Бирка маркировки кабеля) */}
      {showCableTags && (
        <div className="mt-1 w-full text-center">
          <div
            className={`text-[8px] font-mono truncate px-1 py-0.5 rounded-xs border shadow-xs max-w-11 ${
              port.connectedTo
                ? (isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-950/80 text-blue-300 border-blue-800')
                : (isLight ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-slate-900 text-slate-500 border-slate-800')
            }`}
            title={port.connectedTo || 'Свободный порт'}
          >
            {port.connectedTo ? port.connectedTo.replace(/^(Каб\.\s*|sw-)/i, '') : '—'}
          </div>
        </div>
      )}

      {/* Rich Inspector Tooltip on Hover (Rendered via Portal to avoid overflow clipping) */}
      {(() => {
        if (!showTooltip || !tooltipPos || typeof document === 'undefined') return null;

        const tooltipWidth = 288; // 18rem = 288px
        const margin = 8;
        const spaceAbove = tooltipPos.top;
        // Estimated tooltip height: ~240px. If space above is less than 280px, show below!
        const showBelow = spaceAbove < 280;

        let left = tooltipPos.left + tooltipPos.width / 2;
        const halfWidth = tooltipWidth / 2;
        if (left - halfWidth < 12) {
          left = halfWidth + 12;
        } else if (left + halfWidth > window.innerWidth - 12) {
          left = window.innerWidth - halfWidth - 12;
        }

        const tooltipStyle = {
          position: 'fixed',
          left: `${left}px`,
          top: showBelow ? `${tooltipPos.bottom + margin}px` : `${tooltipPos.top - margin}px`,
          transform: showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          zIndex: 99999,
          width: `${tooltipWidth}px`
        };

        return createPortal(
          <div
            style={tooltipStyle}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
            className={`p-3 text-left text-xs pointer-events-auto rounded-xl shadow-2xl border transition-opacity duration-150 ${
              isLight
                ? 'bg-white text-slate-800 border-slate-300 shadow-slate-400/30'
                : 'bg-slate-900 text-slate-100 border-slate-700 shadow-black/70'
            }`}
          >
            {/* Subtle pointer tip */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border pointer-events-none ${
                showBelow
                  ? `-top-1.5 border-b-0 border-r-0 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`
                  : `-bottom-1.5 border-t-0 border-l-0 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`
              }`}
            />
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  Порт {port.number}
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  ({port.name})
                </span>
                {isSfp && (
                  <span className="text-[9px] px-1 py-0.2 rounded-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-mono">
                    SFP+
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm font-semibold ${
                  isDisabled
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    : isLinkUp
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {isDisabled ? 'ОТКЛЮЧЕН (SHUTDOWN)' : isLinkUp ? `LINK UP (${speed})` : 'DOWN'}
                </span>
                {port.poe && (
                  <span className="text-[10px] text-amber-500 flex items-center font-mono">
                    <Zap className="w-3 h-3 fill-amber-500" /> PoE
                  </span>
                )}
              </div>
            </div>

            {/* Live SNMP Traffic Throughput Banner */}
            {liveTelemetry && (
              <div className={`mt-2 p-2 rounded-lg border text-[11px] font-mono space-y-1 ${
                isLight ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1 text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-3 h-3 animate-pulse" /> Live Трафик (SNMP)
                  </span>
                  <span className="text-[10px] text-slate-400">Rx/Tx</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Входящий (Rx):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">↓ {liveTelemetry.rxMbps} Мбит/с</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Исходящий (Tx):</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">↑ {liveTelemetry.txMbps} Мбит/с</span>
                </div>
                {liveTelemetry.inErrors > 0 && (
                  <div className="flex items-center justify-between text-rose-500 font-bold text-[10px] pt-0.5 border-t border-rose-500/20">
                    <span>Ошибки пакетов (CRC):</span>
                    <span>{liveTelemetry.inErrors} шт.</span>
                  </div>
                )}
              </div>
            )}

            {/* PoE Power Delivery Card (Синий индикатор питания 48V с ваттами) */}
            {port.poe && (
              <div className={`mt-2 p-2 rounded-lg border text-[11px] font-mono space-y-1.5 ${
                isLight ? 'bg-sky-50/80 border-sky-200 text-sky-950' : 'bg-sky-950/40 border-sky-500/40 text-sky-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5 text-sky-500 dark:text-sky-400">
                    <Zap className="w-3.5 h-3.5 fill-sky-500 dark:fill-sky-400 animate-pulse" />
                    <span>Питание PoE 48V (Active)</span>
                  </span>
                  <span className="font-bold text-sky-600 dark:text-sky-300">
                    {poeWatts.toFixed(1)} Вт
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Стандарт:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {poeWatts > 30 ? '802.3bt (PoE++ 60W)' : poeWatts > 15.4 ? '802.3at (PoE+ 30W)' : '802.3af (PoE 15.4W)'}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-300 shadow-[0_0_6px_#38bdf8]"
                    style={{ width: `${Math.min(100, Math.max(8, (poeWatts / (poeWatts > 30 ? 60 : 30)) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Mode & PVID */}
            <div className="py-2 space-y-1.5 border-b border-slate-200 dark:border-slate-800 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Режим порта:</span>
                <span className="font-mono font-bold uppercase text-slate-700 dark:text-slate-300">
                  {port.mode} {port.lagId ? `(LAG ${port.lagId})` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Нативный VLAN (PVID):</span>
                <span
                  className="font-mono font-bold px-1.5 py-0.2 rounded-xs text-white"
                  style={{ backgroundColor: nativeVlan.color }}
                >
                  {port.pvid} - {nativeVlan.name}
                </span>
              </div>

              {isTrunk && taggedVlanObjects.length > 0 && (
                <div>
                  <span className="text-slate-500 block mb-1">Тегированные VLAN:</span>
                  <div className="flex flex-wrap gap-1">
                    {taggedVlanObjects.map(v => (
                      <span
                        key={v.id}
                        className="font-mono text-[10px] font-bold px-1 py-0.2 rounded-xs text-white"
                        style={{ backgroundColor: v.color }}
                      >
                        {v.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Connected Device / Peer Switch Link */}
            <div className="py-2 space-y-1 text-[11px]">
              {isLinked ? (
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                  <div className="flex items-center justify-between font-bold mb-0.5">
                    <span className="flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> Магистральный линк:
                    </span>
                    {onJumpToPeer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          setShowTooltip(false);
                          handleJump(e);
                        }}
                        className="text-blue-500 hover:underline flex items-center gap-0.5 text-[10px] cursor-pointer"
                      >
                        Перейти <ArrowUpRight className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {peerSwitch.name} &rarr; Порт {peerPort?.number} ({peerPort?.name})
                  </div>
                </div>
              ) : port.connectedTo ? (
                <div>
                  <span className="text-slate-500">Подключение:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 block truncate">
                    {port.connectedTo}
                  </span>
                </div>
              ) : (
                <div className="text-slate-400 italic">
                  Нет подключенного кабеля / свободно
                </div>
              )}

              {port.description && (
                <div className="text-slate-500 text-[10px] italic pt-1 truncate">
                  «{port.description}»
                </div>
              )}
            </div>

            {/* Mismatch Warning */}
            {hasMismatch && (
              <div className="mt-1 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[10px]">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Несоответствие VLAN с пиром!
                </div>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                  {mismatchResult.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px]">
              <span className="text-slate-400">Клик для свойств</span>
              {onOpenChart && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTooltip(false);
                    onOpenChart(port);
                  }}
                  className="text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <LineChart className="w-3 h-3" />
                  <span>Открыть график</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
