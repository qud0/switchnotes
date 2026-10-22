/**
 * Единые токены и функции расчета цветов для портов, скоростей и трафика
 */

export function getTrafficPulse(totalTrafficMbps, isLight = false) {
  if (totalTrafficMbps > 500) {
    return {
      level: 4,
      ledColor: '#ef4444',
      ledGlow: 'shadow-[0_0_10px_#ef4444] animate-pulse',
      heatmapColor: '#ef4444'
    };
  }
  if (totalTrafficMbps > 100) {
    return {
      level: 3,
      ledColor: '#f97316',
      ledGlow: 'shadow-[0_0_8px_#f97316] animate-pulse',
      heatmapColor: '#f97316'
    };
  }
  if (totalTrafficMbps > 10) {
    return {
      level: 2,
      ledColor: '#eab308',
      ledGlow: 'shadow-[0_0_6px_#eab308]',
      heatmapColor: '#eab308'
    };
  }
  if (totalTrafficMbps > 0.05) {
    return {
      level: 1,
      ledColor: '#22c55e',
      ledGlow: 'shadow-[0_0_5px_#22c55e]',
      heatmapColor: '#22c55e'
    };
  }
  return {
    level: 0,
    ledColor: isLight ? '#94a3b8' : '#334155',
    ledGlow: '',
    heatmapColor: isLight ? '#94a3b8' : '#334155'
  };
}

export function formatTrafficSpeed(mbps) {
  if (!mbps || mbps <= 0) return '0M';
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)}G`;
  if (mbps >= 100) return `${Math.round(mbps)}M`;
  if (mbps >= 1) return `${mbps.toFixed(1)}M`;
  return `${mbps.toFixed(2)}M`;
}

export function getPortSpeedColor(speed) {
  switch (speed) {
    case '10G': return '#a855f7';
    case '2.5G': return '#3b82f6';
    case '1G': return '#10b981';
    case '100M': return '#f59e0b';
    case '10M': return '#64748b';
    default: return '#10b981';
  }
}
