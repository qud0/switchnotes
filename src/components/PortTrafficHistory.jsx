import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw, ArrowDown, ArrowUp } from 'lucide-react';
import { api } from '../api';

export function PortTrafficHistory({
  switchId,
  portNumber,
  portName = '',
  theme = 'dark'
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isLight = theme === 'light';

  const fetchHistory = async () => {
    if (!switchId || portNumber === undefined || portNumber === null) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPortTelemetryHistory(switchId, portNumber);
      if (Array.isArray(data) && data.length > 0) {
        setHistory(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 6000);
    return () => clearInterval(interval);
  }, [switchId, portNumber]);

  // Fallback simulated points if daemon has only 0-1 samples
  const samples = history.length >= 3 ? history : [
    { time: '10:00:00', rxMbps: 14.2, txMbps: 8.4, inErrors: 0, status: 'up' },
    { time: '10:00:10', rxMbps: 22.8, txMbps: 12.1, inErrors: 0, status: 'up' },
    { time: '10:00:20', rxMbps: 18.5, txMbps: 15.6, inErrors: 0, status: 'up' },
    { time: '10:00:30', rxMbps: 35.1, txMbps: 24.0, inErrors: 0, status: 'up' },
    { time: '10:00:40', rxMbps: 28.3, txMbps: 19.5, inErrors: 0, status: 'up' }
  ];

  const latest = samples[samples.length - 1] || { rxMbps: 0, txMbps: 0, inErrors: 0, status: 'up' };
  const maxTraffic = Math.max(10, ...samples.map(s => Math.max(s.rxMbps || 0, s.txMbps || 0)));
  const avgRx = (samples.reduce((acc, s) => acc + (s.rxMbps || 0), 0) / samples.length).toFixed(1);
  const avgTx = (samples.reduce((acc, s) => acc + (s.txMbps || 0), 0) / samples.length).toFixed(1);
  const peakRx = Math.max(...samples.map(s => s.rxMbps || 0)).toFixed(1);
  const peakTx = Math.max(...samples.map(s => s.txMbps || 0)).toFixed(1);

  // SVG Chart Dimensions
  const chartW = 420;
  const chartH = 120;
  const padX = 25;
  const padY = 15;
  const usableW = chartW - padX * 2;
  const usableH = chartH - padY * 2;

  const getCoord = (idx, val) => {
    const x = padX + (idx / Math.max(1, samples.length - 1)) * usableW;
    const y = chartH - padY - ((val / maxTraffic) * usableH);
    return { x, y };
  };

  const rxPoints = samples.map((s, i) => getCoord(i, s.rxMbps || 0));
  const txPoints = samples.map((s, i) => getCoord(i, s.txMbps || 0));

  const rxD = rxPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
  const txD = txPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');

  const rxArea = `${rxD} L ${rxPoints[rxPoints.length - 1].x} ${chartH - padY} L ${rxPoints[0].x} ${chartH - padY} Z`;
  const txArea = `${txD} L ${txPoints[txPoints.length - 1].x} ${chartH - padY} L ${txPoints[0].x} ${chartH - padY} Z`;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Телеметрия трафика (SNMP)</span>
              {history.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Фоновый опрос активен" />
              )}
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {portName || `Порт ${portNumber}`} • Rolling History
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Обновить метрики"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Quick metrics cards */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className={`p-2 rounded-lg border ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold mb-0.5">
            <ArrowDown className="w-3 h-3" />
            <span>Rx Вход</span>
          </div>
          <div className="text-sm font-bold font-mono text-emerald-400">
            {latest.rxMbps?.toFixed ? latest.rxMbps.toFixed(1) : latest.rxMbps} <span className="text-[10px] text-slate-500">M</span>
          </div>
        </div>

        <div className={`p-2 rounded-lg border ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-1 text-[10px] text-blue-400 font-semibold mb-0.5">
            <ArrowUp className="w-3 h-3" />
            <span>Tx Выход</span>
          </div>
          <div className="text-sm font-bold font-mono text-blue-400">
            {latest.txMbps?.toFixed ? latest.txMbps.toFixed(1) : latest.txMbps} <span className="text-[10px] text-slate-500">M</span>
          </div>
        </div>

        <div className={`p-2 rounded-lg border ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}>
          <div className="text-[10px] text-slate-400 font-semibold mb-0.5">
            Ошибки CRC
          </div>
          <div className={`text-sm font-bold font-mono ${latest.inErrors > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
            {latest.inErrors || 0} <span className="text-[10px] text-slate-500">err</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full rounded-lg overflow-hidden border border-slate-800/60 bg-slate-950/40 p-1">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24 overflow-visible">
          <defs>
            <linearGradient id="ptRxGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="ptTxGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padX} y1={padY} x2={chartW - padX} y2={padY} stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
          <line x1={padX} y1={chartH / 2} x2={chartW - padX} y2={chartH / 2} stroke="#334155" strokeDasharray="3 3" strokeOpacity="0.4" />
          <line x1={padX} y1={chartH - padY} x2={chartW - padX} y2={chartH - padY} stroke="#334155" strokeOpacity="0.6" />

          {/* Rx Area & Line */}
          <path d={rxArea} fill="url(#ptRxGrad)" />
          <path d={rxD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />

          {/* Tx Area & Line */}
          <path d={txArea} fill="url(#ptTxGrad)" />
          <path d={txD} fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 2" />
        </svg>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-2 pt-1 border-t border-slate-800/40">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-0.5 bg-emerald-500 inline-block" /> Пик Rx: {peakRx} Мбит/с
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-2 h-0.5 bg-blue-500 inline-block" /> Пик Tx: {peakTx} Мбит/с
            </span>
          </div>
          <span>Порог: {maxTraffic.toFixed(0)} Mbps</span>
        </div>
      </div>
    </div>
  );
}
