import React, { useState, useEffect } from 'react';
import { 
  Server, Laptop, Wifi, Printer, Video, Phone, Activity, 
  MapPin, Layers, ArrowRight, ShieldAlert, CheckCircle2, 
  XCircle, RefreshCw, Zap, Wrench, Cable, Network
} from 'lucide-react';
import { api } from '../api';

export default function CircuitXRayTab({ switchId, port, theme = 'dark' }) {
  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState(null);
  const [error, setError] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  const isLight = theme === 'light';

  useEffect(() => {
    let active = true;

    async function loadTrace() {
      if (!switchId || !port) return;
      setLoading(true);
      setError(null);
      setPingResult(null);

      try {
        const res = await api.getCircuitTrace(switchId, port.id);
        if (!active) return;
        setTrace(res.trace);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Ошибка загрузки сквозного тракта');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTrace();

    return () => {
      active = false;
    };
  }, [switchId, port?.id]);

  const handlePing = async (ip) => {
    if (!ip) return;
    setPingLoading(true);
    try {
      const res = await api.pingHost(ip);
      setPingResult(res);
    } catch (err) {
      setPingResult({ host: ip, online: false, error: err.message });
    } finally {
      setPingLoading(false);
    }
  };

  const getDeviceIcon = (type) => {
    switch (type) {
      case 'server': return <Server className="w-4 h-4 text-indigo-400" />;
      case 'printer': return <Printer className="w-4 h-4 text-emerald-400" />;
      case 'camera': return <Video className="w-4 h-4 text-rose-400" />;
      case 'ap':
      case 'wifi': return <Wifi className="w-4 h-4 text-amber-400" />;
      case 'voip': return <Phone className="w-4 h-4 text-cyan-400" />;
      default: return <Laptop className="w-4 h-4 text-sky-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-400 gap-3 font-sans">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="text-xs">Сквозной опрос L1–L3 тракта для порта {port?.name || port?.portNum}...</span>
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="p-6 text-center text-rose-400 font-sans text-xs">
        <XCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <p className="font-semibold">{error || 'Данные сквозного тракта недоступны'}</p>
      </div>
    );
  }

  return (
    <div className={`p-4 h-full overflow-y-auto space-y-4 font-sans ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'}`}>
      {/* Circuit Header Bar */}
      <div className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Сквозной тракт порта: {trace.portName} (Коммутатор {trace.switchName})
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                trace.linkStatus === 'up' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {trace.linkStatus === 'up' ? 'Физический линк UP' : 'Линк DOWN'}
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Скорость: {trace.speed} • PoE: {trace.poe ? `${trace.poeWatts}W (Active)` : 'Выкл'} • Режим: {trace.accessSwitch.mode}
            </p>
          </div>
        </div>

        {trace.endpoint.ip && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePing(trace.endpoint.ip)}
              disabled={pingLoading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all ${
                isLight 
                  ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 text-amber-300 ${pingLoading ? 'animate-spin' : ''}`} />
              <span>{pingLoading ? 'Пинг...' : `Ping ${trace.endpoint.ip}`}</span>
            </button>
            {pingResult && (
              <span className={`text-[11px] font-mono px-2 py-1 rounded font-semibold ${
                pingResult.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {pingResult.online ? `RTT: ${pingResult.rtt}мс` : 'Offline'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Anomaly Alerts (if any) */}
      {trace.anomalies.length > 0 && (
        <div className="space-y-2">
          {trace.anomalies.map((anom, idx) => (
            <div 
              key={idx}
              className={`p-3 rounded-xl border flex items-start gap-3 ${
                anom.severity === 'error' 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-semibold flex items-center gap-2">
                  <span>Обнаружена аномалия: {anom.type}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/20">
                    Уровень {anom.layer}
                  </span>
                </div>
                <p className="mt-1 text-slate-300">{anom.message}</p>
                {anom.fixAction && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Рекомендация: {anom.fixAction}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6-Node Circuit Chain (Visual Flow) */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 relative">
        {/* Step 1: Endpoint Device */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">1. Устройство</span>
              {getDeviceIcon(trace.endpoint.type)}
            </div>
            <div className="text-xs font-bold text-white truncate" title={trace.endpoint.name}>
              {trace.endpoint.name}
            </div>
            <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-400">
              <div>IP: <span className="text-slate-200">{trace.endpoint.ip || 'DHCP'}</span></div>
              <div className="truncate" title={trace.endpoint.mac}>MAC: <span className="text-slate-400">{trace.endpoint.mac || '—'}</span></div>
              <div>VLAN: <span className="text-blue-400 font-semibold">#{trace.endpoint.vlanId}</span></div>
            </div>
          </div>
        </div>

        {/* Step 2: Wall Socket (L1) */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">2. Розетка</span>
              <MapPin className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xs font-bold text-white">
              {trace.socket.id}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div className="truncate" title={trace.socket.room}>{trace.socket.room}</div>
              <div className="text-[10px] text-slate-400 truncate">{trace.socket.cableType}</div>
              <div className="font-mono text-amber-400 font-semibold">{trace.socket.cableLengthMeters} м</div>
            </div>
          </div>
        </div>

        {/* Step 3: Patch Panel (L1) */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">3. Патч-панель</span>
              <Cable className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xs font-bold text-white truncate" title={trace.patchPanel.name}>
              {trace.patchPanel.name}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div>Порт: <b className="text-white">#{trace.patchPanel.portNum}</b></div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Кроссировка ОК</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Access Switch (L2) */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">4. Свитч доступа</span>
              <Layers className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xs font-bold text-white truncate" title={trace.accessSwitch.name}>
              {trace.accessSwitch.name}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div>Порт: <b className="text-white">{trace.accessSwitch.portName}</b></div>
              <div>VLAN: <span className="text-blue-400 font-semibold">{trace.accessSwitch.vlanName}</span></div>
              <div className="text-[10px] text-slate-400">{trace.accessSwitch.ip}</div>
            </div>
          </div>
        </div>

        {/* Step 5: Uplink Trunk (L2) */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">5. Транк-аплинк</span>
              <Network className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xs font-bold text-white">
              {trace.uplink.portName}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div>В ядро: <span className="text-slate-200">{trace.uplink.remoteSwitchName}</span></div>
              <div className="text-[10px] font-mono text-purple-300 truncate" title={`VLANs: ${trace.uplink.trunkVlans.join(', ')}`}>
                Tagged: {trace.uplink.trunkVlans.join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Gateway & Subnet (L3) */}
        <div className={`p-3 rounded-xl border flex flex-col justify-between ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">6. Шлюз (L3)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xs font-bold font-mono text-white">
              {trace.gateway.ip}
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div>Сеть: <span className="font-mono text-slate-200">{trace.gateway.subnet}</span></div>
              <div className="text-[10px] text-emerald-400 font-semibold">Шлюз активен</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
