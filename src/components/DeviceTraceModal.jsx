import React, { useState, useEffect } from 'react';
import { 
  Search, X, Activity, Server, Shield, Layers, CornerDownRight, 
  ExternalLink, CheckCircle2, XCircle, ArrowRight, Zap, RefreshCw,
  MapPin, Hash, Laptop, Wifi, Printer, Video, Phone, Cable, Wrench
} from 'lucide-react';
import { api } from '../api';
import { VirtualTdrTester } from './VirtualTdrTester';

export default function DeviceTraceModal({ isOpen, onClose, onSelectSwitch, onSelectFloorPlan }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  // Live ping state
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResult(null);
      setError(null);
      setPingResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (searchQuery) => {
    const q = searchQuery !== undefined ? searchQuery : query;
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setPingResult(null);

    try {
      const data = await api.traceDevice(q.trim());
      setResult(data);
      if (!data.found) {
        setError(data.message || 'Устройство не найдено');
      } else if (data.target?.ip) {
        // Auto-ping if target has an IP
        triggerPing(data.target.ip);
      }
    } catch (err) {
      setError(err.message || 'Ошибка выполнения трассировки');
    } finally {
      setLoading(false);
    }
  };

  const triggerPing = async (ip) => {
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
      case 'server': return <Server className="w-5 h-5 text-indigo-400" />;
      case 'printer': return <Printer className="w-5 h-5 text-emerald-400" />;
      case 'camera': return <Video className="w-5 h-5 text-rose-400" />;
      case 'wifi':
      case 'access_point': return <Wifi className="w-5 h-5 text-amber-400" />;
      case 'voip': return <Phone className="w-5 h-5 text-cyan-400" />;
      case 'switch': return <Layers className="w-5 h-5 text-blue-400" />;
      default: return <Laptop className="w-5 h-5 text-sky-400" />;
    }
  };

  const suggestions = [
    { label: 'Р-1.1 (Главбух)', q: 'Р-1.1' },
    { label: 'Каб. 201 (Бухгалтерия)', q: '201' },
    { label: 'МФУ Kyocera', q: 'Kyocera' },
    { label: 'IP-Камера Вход', q: 'Р-CCTV-1' },
    { label: '192.168.10.10 (SNR)', q: '192.168.10.10' },
    { label: 'Точка UniFi AP', q: 'Р-AP-01' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
                Live-диагностика и сквозной поиск
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  5-Point Trace
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Мгновенный поиск розетки, порта коммутатора и live ping по IP, MAC или номеру розетки
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quick Badges */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/40">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            className="flex items-center gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Введите IP (192.168.10.x), MAC, розетку (Р-1.1), кабинет (201) или имя устройства..."
                className="w-full pl-11 pr-4 h-11 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all shrink-0"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Найти цепочку</span>
            </button>
          </form>

          {/* Quick Suggestions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Быстрый поиск:</span>
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => { setQuery(item.q); handleSearch(item.q); }}
                className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-3">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{error}</p>
                <p className="text-xs text-rose-300/80 mt-1">
                  Проверьте правильность написания IP-адреса, MAC-адреса или номера розетки (например, Р-1.1, К-201-1).
                </p>
              </div>
            </div>
          )}

          {result && result.found && (
            <div className="space-y-6">
              {/* Live Ping Banner */}
              {result.target?.ip && (
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                      <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Live Ping:</span>
                        <span className="text-sm font-mono font-medium text-white">{result.target.ip}</span>
                        {pingLoading ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Опрос ICMP...
                          </span>
                        ) : pingResult ? (
                          pingResult.online ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              В сети (Online) • RTT: {pingResult.rtt} мс
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <XCircle className="w-3.5 h-3.5" />
                              Не отвечает (Offline)
                            </span>
                          )
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-400">
                        {pingResult?.timestamp ? `Проверено в ${new Date(pingResult.timestamp).toLocaleTimeString()}` : 'Прямой ICMP-опрос сетевого адаптера'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => triggerPing(result.target.ip)}
                    disabled={pingLoading}
                    className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 transition-colors border border-slate-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pingLoading ? 'animate-spin' : ''}`} />
                    <span>Повторить пинг</span>
                  </button>
                </div>
              )}

              {/* Visual 5-Point Circuit Chain */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Полная трассировка физической линии коммутации
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
                  {/* Tier 1: Target Device */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">1. Устройство</span>
                        {getDeviceIcon(result.target?.type)}
                      </div>
                      <div className="text-sm font-semibold text-white truncate" title={result.target?.hostname || 'Не указано'}>
                        {result.target?.hostname || 'Хост'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>IP:</span>
                          <span className="font-mono text-slate-200">{result.target?.ip || 'DHCP'}</span>
                        </div>
                        {result.target?.mac && (
                          <div className="flex justify-between text-slate-400">
                            <span>MAC:</span>
                            <span className="font-mono text-slate-300 text-[11px]">{result.target.mac}</span>
                          </div>
                        )}
                        {result.target?.vlanId && (
                          <div className="flex justify-between text-slate-400">
                            <span>VLAN:</span>
                            <span className="text-blue-400 font-medium">#{result.target.vlanId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tier 2: Wall Outlet */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">2. Розетка</span>
                        <MapPin className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {result.wallOutlet?.socket || 'Розетка б/н'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-slate-400 truncate" title={result.wallOutlet?.room}>
                          {result.wallOutlet?.room || 'Помещение'}
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Кабель:</span>
                          <span className="text-slate-200">{result.wallOutlet?.cableType || 'UTP'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Длина:</span>
                          <span className="font-mono text-amber-400">{result.wallOutlet?.cableLength || '25м'}</span>
                        </div>
                      </div>
                    </div>
                    {onSelectFloorPlan && (
                      <button
                        onClick={() => onSelectFloorPlan('floor-2')}
                        className="mt-3 w-full h-8 text-[11px] rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <MapPin className="w-3 h-3" />
                        <span>На плане этажа</span>
                      </button>
                    )}
                  </div>

                  {/* Tier 3: Patch Panel */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">3. Патч-панель</span>
                        <Hash className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="text-sm font-semibold text-white truncate" title={result.patchPanel?.name}>
                        {result.patchPanel?.name || 'Патч-панель'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Порт:</span>
                          <span className="font-mono text-blue-400 font-bold">П{result.patchPanel?.portNumber || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Патчкорд:</span>
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                              style={{ backgroundColor: result.patchPanel?.patchCordColor || '#3b82f6' }}
                            />
                            <span className="text-slate-200">{result.patchPanel?.patchCordLength || '1м'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tier 4: Access Switch */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">4. Коммутатор</span>
                        <Layers className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div className="text-sm font-semibold text-white truncate" title={result.switch?.name}>
                        {result.switch?.name || 'Коммутатор'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Порт:</span>
                          <span className="font-mono text-emerald-400 font-semibold">{result.switch?.portName || 'Port'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Режим:</span>
                          <span className="text-slate-200 uppercase font-mono">{result.switch?.mode || 'access'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>VLAN (PVID):</span>
                          <span className="text-indigo-400 font-medium">#{result.switch?.pvid || 1}</span>
                        </div>
                        {result.switch?.poe && (
                          <div className="flex justify-between text-slate-400">
                            <span>PoE:</span>
                            <span className="text-amber-400 font-medium">Активен</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {result.switch?.id && onSelectSwitch && (
                      <button
                        onClick={() => { onSelectSwitch(result.switch.id); onClose(); }}
                        className="mt-3 w-full h-8 text-[11px] rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Панель портов</span>
                      </button>
                    )}
                  </div>

                  {/* Tier 5: Uplink to Core */}
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">5. Core Uplink</span>
                        <Server className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-sm font-semibold text-white truncate">
                        {result.uplink?.peerSwitchName || 'Ядро сети'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        {result.uplink?.lagName ? (
                          <div className="flex justify-between text-slate-400">
                            <span>Агрегация:</span>
                            <span className="font-mono text-purple-400 font-semibold">{result.uplink.lagName}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-slate-400">
                            <span>Линк:</span>
                            <span className="font-mono text-slate-300">10G Fiber</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-400">
                          <span>Магистраль:</span>
                          <span className="text-slate-300 font-mono text-[11px] truncate">{result.uplink?.localPortName || 'SFP+ 1'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Тегирование:</span>
                          <span className="text-emerald-400 font-medium">802.1Q Trunk</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cable Length & Total Trace Summary Card */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <Cable className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-300">
                      Суммарная длина физической кабельной трассы:
                    </span>
                    <span className="text-sm font-bold text-amber-400">
                      ~{(parseInt(result.wallOutlet?.cableLength) || 25) + (parseInt(result.patchPanel?.patchCordLength) || 1) + 2} метров
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Трасса: {result.wallOutlet?.cableLength || '25м'} (СКС) + {result.patchPanel?.patchCordLength || '1м'} (Патчкорд) + ~2м (Drop-кабель рабочего места)
                  </div>
                </div>

                {/* Embedded Virtual TDR Diagnostics for this traced link */}
                <div className="pt-1">
                  <VirtualTdrTester
                    portNumber={result.switch?.portNumber || 1}
                    portName={result.switch?.portName || 'Port 1'}
                    connectedSocket={result.wallOutlet?.socket || 'Р-1'}
                    cableLength={result.wallOutlet?.cableLength || '25м'}
                    speed={result.switch?.speed || '1G'}
                    theme="dark"
                  />
                </div>
              </div>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="py-12 text-center text-slate-500">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-400" />
              <p className="text-sm font-medium text-slate-300">
                Введите идентификатор устройства или выберите из быстрых подсказок выше
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Система мгновенно сопоставит базу коммутаторов, патч-панелей, кабельных трасс и IPAM для построения сквозного маршрута.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Горячая клавиша: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">Ctrl+F</kbd>
          </span>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
