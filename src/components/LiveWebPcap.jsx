import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, Trash2, Download, Filter, Search, ChevronRight, 
  ChevronDown, Binary, RefreshCw, Radio, CheckCircle2, AlertCircle, FileCode
} from 'lucide-react';
import { api } from '../api';

export default function LiveWebPcap({ switchId, port, theme = 'dark' }) {
  const [sessionId, setSessionId] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [packets, setPackets] = useState([]);
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLayers, setExpandedLayers] = useState({ 0: true, 1: true });
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const packetListEndRef = useRef(null);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const isLight = theme === 'light';

  // Start capture session when port changes
  useEffect(() => {
    let active = true;

    async function initSession() {
      if (!switchId || !port) return;
      setError(null);
      setPackets([]);
      setSelectedPacket(null);

      try {
        const res = await api.startPortPcap(switchId, port.id);
        if (!active) return;
        setSessionId(res.sessionId);
        setIsCapturing(true);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Ошибка запуска захвата пакетов');
      }
    }

    initSession();

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [switchId, port?.id]);

  // Connect WebSocket when sessionId is ready
  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/pcap?sessionId=${sessionId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'initial_history') {
          if (!isPausedRef.current) {
            setPackets(data.packets || []);
          }
        } else if (data.type === 'packet' && data.packet) {
          if (!isPausedRef.current) {
            setPackets((prev) => {
              const next = [...prev, data.packet];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
          }
        }
      } catch (e) {
        console.error('PCAP WS parse error:', e);
      }
    };

    ws.onerror = () => {
      setError('Ошибка соединения со стримом пакетов WebSocket');
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  // Auto-scroll to bottom of packet list
  useEffect(() => {
    if (autoScroll && !isPaused && packetListEndRef.current) {
      packetListEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [packets, autoScroll, isPaused]);

  // Stop / Resume capture
  const toggleCapture = async () => {
    if (isCapturing) {
      if (sessionId) {
        try {
          await api.stopPcapSession(sessionId);
        } catch {}
      }
      setIsCapturing(false);
      setIsPaused(true);
    } else {
      if (switchId && port) {
        try {
          const res = await api.startPortPcap(switchId, port.id);
          setSessionId(res.sessionId);
          setIsCapturing(true);
          setIsPaused(false);
        } catch (err) {
          setError(err.message);
        }
      }
    }
  };

  const handleClear = () => {
    setPackets([]);
    setSelectedPacket(null);
  };

  // Filter packets
  const filteredPackets = useMemo(() => {
    if (!filterQuery.trim()) return packets;
    const q = filterQuery.toLowerCase().trim();

    return packets.filter((p) => {
      if (p.protocol.toLowerCase().includes(q)) return true;
      if (p.src.toLowerCase().includes(q) || p.dst.toLowerCase().includes(q)) return true;
      if (p.info.toLowerCase().includes(q)) return true;
      if (q.startsWith('vlan') && p.vlanId && String(p.vlanId) === q.replace(/\D/g, '')) return true;
      if (p.srcPort && String(p.srcPort) === q) return true;
      if (p.dstPort && String(p.dstPort) === q) return true;
      return false;
    });
  }, [packets, filterQuery]);

  // Wireshark standard row background coloring
  const getProtocolRowStyle = (colorClass, isSelected) => {
    if (isSelected) {
      return isLight ? 'bg-blue-100 text-blue-900 border-l-4 border-blue-600' : 'bg-blue-950/80 text-blue-200 border-l-4 border-blue-500';
    }

    if (isLight) {
      switch (colorClass) {
        case 'arp': return 'bg-amber-50 hover:bg-amber-100 text-amber-950';
        case 'dhcp': return 'bg-yellow-50 hover:bg-yellow-100 text-yellow-950';
        case 'dns': return 'bg-sky-50 hover:bg-sky-100 text-sky-950';
        case 'tcp': return 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950';
        case 'icmp': return 'bg-rose-50 hover:bg-rose-100 text-rose-950';
        case 'lldp':
        case 'stp': return 'bg-purple-50 hover:bg-purple-100 text-purple-950';
        default: return 'hover:bg-slate-100 text-slate-800';
      }
    } else {
      switch (colorClass) {
        case 'arp': return 'bg-amber-950/30 hover:bg-amber-900/40 text-amber-200';
        case 'dhcp': return 'bg-yellow-950/30 hover:bg-yellow-900/40 text-yellow-200';
        case 'dns': return 'bg-sky-950/30 hover:bg-sky-900/40 text-sky-200';
        case 'tcp': return 'bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200';
        case 'icmp': return 'bg-rose-950/30 hover:bg-rose-900/40 text-rose-200';
        case 'lldp':
        case 'stp': return 'bg-purple-950/30 hover:bg-purple-900/40 text-purple-200';
        default: return 'hover:bg-slate-800/60 text-slate-200';
      }
    }
  };

  const quickFilters = ['all', 'arp', 'dhcp', 'dns', 'tcp', 'icmp', 'lldp'];

  return (
    <div className={`flex flex-col h-full font-mono text-xs ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'}`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b gap-2 flex-wrap ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCapture}
            className={`px-3 py-1.5 rounded-lg font-sans font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
              isCapturing 
                ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isCapturing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isCapturing ? 'Остановить' : 'Запустить захват'}</span>
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-sans flex items-center gap-1 border transition-colors ${
              isPaused 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700')
            }`}
            title="Пауза прокрутки без остановки сессии"
          >
            <Radio className={`w-3.5 h-3.5 ${isCapturing && !isPaused ? 'animate-pulse text-emerald-400' : ''}`} />
            <span>{isPaused ? 'Пауза UI' : 'Live'}</span>
          </button>

          <button
            onClick={handleClear}
            className={`p-1.5 rounded-lg border transition-colors ${isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'}`}
            title="Очистить буфер пакетов"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {sessionId && (
            <a
              href={api.getPcapDownloadUrl(sessionId)}
              download
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium flex items-center gap-1.5 border transition-all ${
                isLight 
                  ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' 
                  : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}
              title="Скачать бинарный Libpcap 2.4 файл для настольного Wireshark"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать .PCAP</span>
            </a>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Фильтр: arp, dhcp, dns, tcp, vlan 20, 192.168.10.x..."
              className={`w-full pl-8 pr-2 py-1 text-xs rounded-lg border focus:outline-none transition-colors ${
                isLight 
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500' 
                  : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500'
              }`}
            />
          </div>

          <label className="flex items-center gap-1 text-[11px] font-sans cursor-pointer select-none text-slate-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span>Авто-скролл</span>
          </label>
        </div>

        {/* Packet counter badge */}
        <div className="text-[11px] font-sans font-medium text-slate-400 flex items-center gap-2">
          <span>Всего: <b className="text-white">{packets.length}</b></span>
          {filterQuery && (
            <span>(отфильтровано: <b className="text-amber-400">{filteredPackets.length}</b>)</span>
          )}
        </div>
      </div>

      {/* Quick filter chips */}
      <div className={`px-3 py-1 flex items-center gap-1.5 border-b overflow-x-auto text-[11px] font-sans ${isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'}`}>
        <span className="text-slate-400">Фильтры:</span>
        {quickFilters.map((qf) => (
          <button
            key={qf}
            onClick={() => setFilterQuery(qf === 'all' ? '' : qf)}
            className={`px-2 py-0.5 rounded uppercase text-[10px] font-semibold transition-colors ${
              (qf === 'all' && !filterQuery) || filterQuery.toLowerCase() === qf
                ? 'bg-blue-600 text-white'
                : (isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-400')
            }`}
          >
            {qf}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 px-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main 2-Pane Wireshark Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left/Upper: Virtual Packet Table */}
        <div className={`flex-1 overflow-y-auto ${isLight ? 'border-r border-slate-200' : 'border-r border-slate-800'}`}>
          <table className="w-full text-left border-collapse select-none">
            <thead className={`sticky top-0 z-10 text-[11px] uppercase tracking-wider font-semibold border-b ${isLight ? 'bg-slate-200/90 text-slate-700 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
              <tr>
                <th className="py-1 px-2 w-12 text-center">№</th>
                <th className="py-1 px-2 w-24">Время</th>
                <th className="py-1 px-2 w-36">Источник</th>
                <th className="py-1 px-2 w-36">Назначение</th>
                <th className="py-1 px-2 w-16 text-center">Протокол</th>
                <th className="py-1 px-2 w-14 text-right">Длина</th>
                <th className="py-1 px-3">Сводка инфо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/20 text-[11px]">
              {filteredPackets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500 font-sans">
                    {isCapturing ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                        <span>Ожидание сетевых пакетов на интерфейсе {port?.name || port?.portNum}...</span>
                      </div>
                    ) : (
                      <span>Захват остановлен. Нажмите «Запустить захват», чтобы перехватывать трафик.</span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPackets.map((pkt) => {
                  const isSelected = selectedPacket?.id === pkt.id;
                  return (
                    <tr
                      key={pkt.id}
                      onClick={() => setSelectedPacket(pkt)}
                      className={`cursor-pointer transition-colors ${getProtocolRowStyle(pkt.colorClass, isSelected)}`}
                    >
                      <td className="py-1 px-2 text-center text-slate-400 font-mono">{pkt.seq}</td>
                      <td className="py-1 px-2 font-mono whitespace-nowrap">{pkt.timeFormatted}</td>
                      <td className="py-1 px-2 font-mono truncate max-w-[140px]" title={pkt.src}>{pkt.src}</td>
                      <td className="py-1 px-2 font-mono truncate max-w-[140px]" title={pkt.dst}>{pkt.dst}</td>
                      <td className="py-1 px-2 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/20">
                          {pkt.protocol}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-slate-400">{pkt.length}</td>
                      <td className="py-1 px-3 truncate max-w-[360px]" title={pkt.info}>{pkt.info}</td>
                    </tr>
                  );
                })
              )}
              <tr ref={packetListEndRef} />
            </tbody>
          </table>
        </div>

        {/* Right/Bottom: Packet Details Tree & Hex Viewer */}
        <div className={`w-full md:w-[420px] flex flex-col overflow-y-auto ${isLight ? 'bg-white' : 'bg-slate-900/90'}`}>
          {selectedPacket ? (
            <div className="p-3 space-y-3">
              {/* Packet Details Header */}
              <div className="flex items-center justify-between border-b pb-2 border-slate-700/50">
                <span className="font-sans font-bold text-xs flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-blue-400" />
                  Пакет №{selectedPacket.seq} ({selectedPacket.protocol})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {selectedPacket.length} bytes
                </span>
              </div>

              {/* Dissected Protocol Layers (Tree) */}
              <div className="space-y-1">
                {(selectedPacket.layers || []).map((layer, idx) => {
                  const isExpanded = expandedLayers[idx] !== false;
                  return (
                    <div key={idx} className={`rounded-lg border text-[11px] overflow-hidden ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'}`}>
                      <button
                        onClick={() => setExpandedLayers(prev => ({ ...prev, [idx]: !isExpanded }))}
                        className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left font-medium ${isLight ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-slate-800/60 text-slate-200'}`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <span className="truncate">{layer.name}</span>
                        </span>
                      </button>
                      {isExpanded && layer.details && (
                        <div className={`px-4 py-1.5 border-t text-[11px] font-mono whitespace-pre-wrap ${isLight ? 'border-slate-200 bg-white text-slate-600' : 'border-slate-850 bg-slate-900/50 text-slate-400'}`}>
                          {layer.details}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Hex / ASCII Byte Dump */}
              <div className="pt-2 border-t border-slate-700/50 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-sans font-semibold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Binary className="w-3.5 h-3.5 text-emerald-400" />
                    Дамп фрейма (Hex Dump):
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Offset: 0x0000</span>
                </div>
                <div className={`p-2 rounded-lg font-mono text-[10px] leading-relaxed overflow-x-auto select-all max-h-36 ${isLight ? 'bg-slate-100 text-slate-800 border border-slate-300' : 'bg-black/80 text-emerald-400 border border-emerald-950'}`}>
                  {selectedPacket.rawHex || 'Нет сырых байт'}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 font-sans flex flex-col items-center justify-center h-full gap-2">
              <Binary className="w-8 h-8 text-slate-600" />
              <span>Выберите пакет из таблицы выше для просмотра слоев протокола и hex-дампа</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
