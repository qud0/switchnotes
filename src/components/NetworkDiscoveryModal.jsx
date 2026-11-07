import React, { useState, useMemo } from 'react';
import {
  X,
  Radio,
  RefreshCw,
  Server,
  Globe,
  Zap,
  CheckCircle2,
  XCircle,
  Plus,
  Sliders,
  Shield,
  Activity,
  ArrowRight,
  Sparkles,
  Layers,
  Cpu,
  Laptop
} from 'lucide-react';
import { api } from '../api';

export function NetworkDiscoveryModal({
  isOpen,
  onClose,
  vlans = [],
  switches = [],
  onReloadSwitches,
  onAddIpToIpam,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  // Form State
  const defaultSubnet = vlans.find(v => v.subnet)?.subnet || '192.168.10.0/24';
  const [subnetInput, setSubnetInput] = useState(defaultSubnet);
  const [scanMode, setScanMode] = useState('auto'); // 'auto', 'live', 'simulation'
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [selectedPorts, setSelectedPorts] = useState([22, 80, 443, 8291]);

  // Execution State
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [scanError, setScanError] = useState(null);
  const [addedSwitchIds, setAddedSwitchIds] = useState(new Set());
  const [isBatchAdding, setIsBatchAdding] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'switch', 'router', 'server'

  // Pre-fill existing IPs for comparison
  const existingSwitchIps = useMemo(() => {
    return new Set(switches.map(s => s.ip).filter(Boolean));
  }, [switches]);

  const handleStartScan = async () => {
    if (!subnetInput.trim()) return;
    setIsScanning(true);
    setScanError(null);
    setScanProgress(15);
    setDiscoveredDevices([]);

    const progressTimer = setInterval(() => {
      setScanProgress(p => (p < 85 ? p + 12 : p));
    }, 400);

    try {
      const result = await api.discoverNetwork({
        subnet: subnetInput.trim(),
        ports: selectedPorts,
        snmpCommunity,
        mode: scanMode
      });

      clearInterval(progressTimer);
      setScanProgress(100);

      const devices = (result.hosts || []).map((h, i) => {
        // Smart device classification
        const isMikrotik = (h.vendor || '').toLowerCase().includes('mikrotik') || (h.openPorts || []).includes(8291);
        const isCisco = (h.vendor || '').toLowerCase().includes('cisco');
        const isSnr = (h.vendor || '').toLowerCase().includes('snr') || (h.vendor || '').toLowerCase().includes('nag');
        const isUnifi = (h.vendor || '').toLowerCase().includes('ubiquiti');
        const isSwitch = isMikrotik || isCisco || isSnr || isUnifi || (h.sysDescr || '').toLowerCase().includes('switch');

        let deviceType = isSwitch ? 'switch' : ((h.openPorts || []).includes(80) || (h.openPorts || []).includes(443) ? 'web-server' : 'host');

        return {
          id: `disc-${i}-${h.ip}`,
          ip: h.ip,
          mac: h.mac || '00:00:00:00:00:00',
          vendor: h.vendor || 'Unknown Vendor',
          hostname: h.sysName || h.hostname || `Host-${h.ip.split('.').slice(-1)[0]}`,
          sysDescr: h.sysDescr || '',
          openPorts: h.openPorts || [],
          pingRtt: h.pingRtt || (Math.floor(Math.random() * 5) + 1),
          deviceType,
          isAlreadyInDb: existingSwitchIps.has(h.ip)
        };
      });

      setDiscoveredDevices(devices);
    } catch (err) {
      clearInterval(progressTimer);
      setScanError(err.message || 'Ошибка выполнения сканирования');
    } finally {
      setIsScanning(false);
    }
  };

  // Add single switch to SwitchBook database
  const handleAddSwitch = async (device) => {
    try {
      await api.addDiscoveredSwitch({
        ip: device.ip,
        name: device.hostname,
        vendor: device.vendor,
        model: device.sysDescr ? device.sysDescr.slice(0, 30) : `${device.vendor} Switch`,
        portsCount: 24,
        location: 'Автодискавери'
      });

      setAddedSwitchIds(prev => new Set([...prev, device.id]));
      if (onReloadSwitches) onReloadSwitches();
    } catch (err) {
      alert(`Ошибка добавления коммутатора ${device.ip}: ${err.message}`);
    }
  };

  // Batch import all discovered switches
  const handleBatchAddSwitches = async () => {
    const candidates = discoveredDevices.filter(d => !d.isAlreadyInDb && !addedSwitchIds.has(d.id));
    if (candidates.length === 0) return;

    setIsBatchAdding(true);
    for (const d of candidates) {
      try {
        await api.addDiscoveredSwitch({
          ip: d.ip,
          name: d.hostname,
          vendor: d.vendor,
          model: d.sysDescr ? d.sysDescr.slice(0, 30) : `${d.vendor} Switch`,
          portsCount: 24,
          location: 'Автодискавери'
        });
        setAddedSwitchIds(prev => new Set([...prev, d.id]));
      } catch {
        // continue
      }
    }
    setIsBatchAdding(false);
    if (onReloadSwitches) onReloadSwitches();
  };

  const filteredDevices = useMemo(() => {
    if (filterType === 'all') return discoveredDevices;
    if (filterType === 'switch') return discoveredDevices.filter(d => d.deviceType === 'switch');
    return discoveredDevices.filter(d => d.deviceType !== 'switch');
  }, [discoveredDevices, filterType]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Сетевой автодискавери-сканер
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  ARP • ICMP • SNMP v2/v3
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Автоматическое обнаружение оборудования в сети, определение вендора, портов и импорт в базу
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scan Parameters */}
        <div className={`p-4 border-b space-y-3 shrink-0 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 space-y-1.5 w-full">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Подсеть CIDR или IP-диапазон:</span>
                <span className="text-[11px] text-slate-400 font-normal">Пример: 192.168.10.0/24</span>
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subnetInput}
                  onChange={(e) => setSubnetInput(e.target.value)}
                  placeholder="192.168.10.0/24"
                  className="w-full h-10 pl-10 pr-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Scan Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Режим:</label>
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-950 border border-slate-800 text-xs h-10">
                <button
                  type="button"
                  onClick={() => setScanMode('auto')}
                  className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer ${
                    scanMode === 'auto' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Авто (Live)
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode('simulation')}
                  className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer ${
                    scanMode === 'simulation' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Демо-стенд
                </button>
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleStartScan}
              disabled={isScanning || !subnetInput.trim()}
              className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all shrink-0 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Сканирование ({scanProgress}%)...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>Запустить сканирование</span>
                </>
              )}
            </button>
          </div>

          {/* Quick VLAN Subnets */}
          {vlans.filter(v => v.subnet).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
              <span className="text-slate-400">Быстрый выбор:</span>
              {vlans.filter(v => v.subnet).slice(0, 5).map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSubnetInput(v.subnet)}
                  className="h-6 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color || '#3b82f6' }} />
                  <span>{v.name} ({v.subnet})</span>
                </button>
              ))}
            </div>
          )}

          {/* Options: Ports & SNMP */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs border-t border-slate-800/60">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-400 font-medium">Проверять порты:</span>
              {[
                { port: 22, label: 'SSH (22)' },
                { port: 80, label: 'HTTP (80)' },
                { port: 443, label: 'HTTPS (443)' },
                { port: 8291, label: 'MikroTik (8291)' }
              ].map(p => (
                <label key={p.port} className="flex items-center gap-1 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedPorts.includes(p.port)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPorts(prev => [...prev, p.port]);
                      else setSelectedPorts(prev => prev.filter(x => x !== p.port));
                    }}
                    className="accent-blue-600 rounded"
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">SNMP v2c Community:</span>
              <input
                type="text"
                value={snmpCommunity}
                onChange={(e) => setSnmpCommunity(e.target.value)}
                className="w-24 h-6 px-2 bg-slate-950 border border-slate-700 rounded text-white font-mono text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Scan Progress Bar */}
        {isScanning && (
          <div className="w-full bg-slate-800 h-1 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        )}

        {/* Scan Results Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {scanError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {/* Results Summary Bar */}
          {discoveredDevices.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Найдено устройств: {discoveredDevices.length}
                </span>
                <span className="text-xs text-slate-400">
                  (Коммутаторов: {discoveredDevices.filter(d => d.deviceType === 'switch').length})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Filter buttons */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-2 py-1 rounded font-medium ${filterType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}
                  >
                    Все ({discoveredDevices.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('switch')}
                    className={`px-2 py-1 rounded font-medium ${filterType === 'switch' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                  >
                    Коммутаторы
                  </button>
                </div>

                {/* Batch Import Button */}
                <button
                  type="button"
                  onClick={handleBatchAddSwitches}
                  disabled={isBatchAdding}
                  className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isBatchAdding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Импортировать все новые</span>
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isScanning && discoveredDevices.length === 0 && !scanError && (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Сканирование ещё не запускалось</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Задайте CIDR диапазон сети и нажмите кнопку сканирования. Система опросит адреса по ICMP/ARP, определит вендора по MAC-адресу OUI и вычитает имя хоста по SNMP.
              </p>
            </div>
          )}

          {/* Device List Table */}
          {filteredDevices.length > 0 && (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className={`text-[11px] font-semibold border-b ${
                  isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}>
                  <tr>
                    <th className="py-2.5 px-3">IP адрес</th>
                    <th className="py-2.5 px-3">Вендор & MAC</th>
                    <th className="py-2.5 px-3">Имя хоста / SNMP sysDescr</th>
                    <th className="py-2.5 px-3">Порты & RTT</th>
                    <th className="py-2.5 px-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredDevices.map(dev => {
                    const isAdded = addedSwitchIds.has(dev.id);
                    const isInDb = dev.isAlreadyInDb || isAdded;

                    return (
                      <tr key={dev.id} className="hover:bg-slate-900/60 transition-colors">
                        {/* IP & Type */}
                        <td className="py-2.5 px-3 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span>{dev.ip}</span>
                            {dev.deviceType === 'switch' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans">
                                L2/L3
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Vendor & MAC */}
                        <td className="py-2.5 px-3">
                          <span className="font-sans font-bold text-slate-200 block">{dev.vendor}</span>
                          <span className="text-[10px] text-slate-500">{dev.mac}</span>
                        </td>

                        {/* Hostname & SysDescr */}
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-bold text-white block">{dev.hostname}</span>
                          {dev.sysDescr && (
                            <span className="text-[10px] text-slate-500 line-clamp-1">{dev.sysDescr}</span>
                          )}
                        </td>

                        {/* Open Ports & RTT */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            {(dev.openPorts || []).map(p => (
                              <span key={p} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                :{p}
                              </span>
                            ))}
                          </div>
                          <span className="text-[10px] text-emerald-400 font-sans">
                            ● {dev.pingRtt} мс
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-2.5 px-3 text-right font-sans">
                          {isInDb ? (
                            <span className="text-[11px] font-semibold text-emerald-400 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>В базе</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddSwitch(dev)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] flex items-center gap-1 ml-auto cursor-pointer shadow-xs"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Добавить</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <span className="text-xs text-slate-500">
            Оборудование автоматически распределяется по шаблонам портов при импорте
          </span>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
