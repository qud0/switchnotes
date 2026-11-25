import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Radar,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Plus,
  Trash2,
  Download,
  Server,
  Layers,
  Cpu,
  Search,
  CheckSquare,
  Square as SquareOutline
} from 'lucide-react';
import { api } from '../api';
import { downloadCsv } from '../utils/exportUtils';

export function IpamScannerModal({
  isOpen,
  onClose,
  initialSubnet = '192.168.10.0/24',
  initialVlanId = 1,
  vlans = [],
  onRefreshIpam,
  theme = 'dark'
}) {
  const isLight = theme === 'light';

  const [subnet, setSubnet] = useState(initialSubnet);
  const [vlanId, setVlanId] = useState(initialVlanId);
  const [simulate, setSimulate] = useState(false);
  const [concurrency, setConcurrency] = useState(25);
  const [timeoutMs, setTimeoutMs] = useState(800);

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);

  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIps, setSelectedIps] = useState(new Set());
  const [batchType, setBatchType] = useState('workstation');
  const [importing, setImporting] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (initialSubnet) setSubnet(initialSubnet);
    if (initialVlanId) setVlanId(initialVlanId);
  }, [initialSubnet, initialVlanId]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleStartScan = async () => {
    setError(null);
    setScanning(true);
    setSelectedIps(new Set());

    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      const data = await api.scanIpamSubnet(
        {
          subnet: subnet.trim(),
          vlanId: parseInt(vlanId, 10) || 1,
          simulate,
          concurrency: parseInt(concurrency, 10) || 25,
          timeoutMs: parseInt(timeoutMs, 10) || 800
        },
        ac.signal
      );
      setScanResult(data);
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('прервано')) {
        setError('Сканирование было остановлено');
      } else {
        setError(err.message || 'Ошибка запуска сканирования');
      }
    } finally {
      setScanning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setScanning(false);
  };

  // Filtered hosts
  const filteredHosts = useMemo(() => {
    if (!scanResult?.hosts) return [];

    return scanResult.hosts.filter(h => {
      // Filter by category
      if (activeFilter === 'NEW_ROGUE' && h.driftStatus !== 'NEW_ROGUE') return false;
      if (activeFilter === 'ZOMBIE' && h.driftStatus !== 'ZOMBIE') return false;
      if (activeFilter === 'CONFLICT' && h.driftStatus !== 'CONFLICT') return false;
      if (activeFilter === 'MATCHED' && h.driftStatus !== 'MATCHED') return false;

      // Filter by search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ipMatch = h.ip?.toLowerCase().includes(q);
        const macMatch = h.mac?.toLowerCase().includes(q);
        const hostMatch = h.hostname?.toLowerCase().includes(q);
        const vendorMatch = h.vendor?.toLowerCase().includes(q);
        const ipamMatch = h.ipamEntry?.hostname?.toLowerCase().includes(q);
        if (!ipMatch && !macMatch && !hostMatch && !vendorMatch && !ipamMatch) return false;
      }

      return true;
    });
  }, [scanResult, activeFilter, searchQuery]);

  const toggleSelectAll = () => {
    if (selectedIps.size === filteredHosts.length && filteredHosts.length > 0) {
      setSelectedIps(new Set());
    } else {
      setSelectedIps(new Set(filteredHosts.map(h => h.ip)));
    }
  };

  const toggleSelectIp = (ip) => {
    const next = new Set(selectedIps);
    if (next.has(ip)) {
      next.delete(ip);
    } else {
      next.add(ip);
    }
    setSelectedIps(next);
  };

  const handleBatchImport = async () => {
    if (!scanResult?.hosts || selectedIps.size === 0) return;

    const itemsToImport = scanResult.hosts
      .filter(h => selectedIps.has(h.ip) && (h.driftStatus === 'NEW_ROGUE' || h.driftStatus === 'CONFLICT' || h.canEnrichMac))
      .map(h => ({
        ip: h.ip,
        vlanId: parseInt(vlanId, 10) || 1,
        hostname: h.hostname || h.ipamEntry?.hostname || `host-${h.ip.split('.').pop()}`,
        mac: h.mac || '',
        type: h.catalogMatch || batchType || 'workstation',
        status: 'active',
        description: `Импортировано сетевым сканером (${new Date().toLocaleDateString()})`
      }));

    if (itemsToImport.length === 0) {
      alert('Среди выбранных хостов нет записей, готовых для импорта в IPAM');
      return;
    }

    setImporting(true);
    try {
      const res = await api.batchImportDiscoveredHosts(itemsToImport, { updateExisting: true });
      alert(`Успешно импортировано: ${res.created} новых, обновлено: ${res.updated}`);
      if (onRefreshIpam) onRefreshIpam();
      // Remove imported from selection
      setSelectedIps(new Set());
    } catch (err) {
      alert(`Ошибка импорта: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleBatchRelease = async () => {
    if (!scanResult?.hosts || selectedIps.size === 0) return;

    const zombieIds = scanResult.hosts
      .filter(h => selectedIps.has(h.ip) && h.driftStatus === 'ZOMBIE' && h.ipamEntry?.id)
      .map(h => h.ipamEntry.id);

    if (zombieIds.length === 0) {
      alert('Среди выбранных записей нет зомби-записей из IPAM для освобождения');
      return;
    }

    if (!confirm(`Вы действительно хотите удалить ${zombieIds.length} зомби-записей и освободить эти IP в IPAM?`)) {
      return;
    }

    setReleasing(true);
    try {
      const res = await api.batchReleaseZombieIps(zombieIds);
      alert(`Освобождено IP-адресов: ${res.released}`);
      if (onRefreshIpam) onRefreshIpam();
      setSelectedIps(new Set());
    } catch (err) {
      alert(`Ошибка освобождения IP: ${err.message}`);
    } finally {
      setReleasing(false);
    }
  };

  const handleExportCsv = () => {
    if (!filteredHosts || filteredHosts.length === 0) return;

    const data = filteredHosts.map(h => ({
      IP: h.ip,
      Статус: h.driftStatus,
      'В сети': h.alive ? 'Да' : 'Нет',
      'RTT (мс)': h.rtt || '',
      MAC: h.mac || '',
      Вендор: h.vendor || '',
      'Тип вендора': h.vendorType || '',
      'DNS Hostname': h.hostname || '',
      'Запись IPAM': h.ipamEntry?.hostname || '',
      'IPAM MAC': h.ipamEntry?.mac || ''
    }));

    downloadCsv(data, `ipam-scan-${subnet.replace(/[/.]/g, '_')}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">
              <Radar className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Сетевой сканер подсетей IPAM
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">
                  ICMP & ARP Live Probe
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Параллельное сканирование подсети, определение MAC/OUI вендоров, Reverse DNS и аудит расхождений с IPAM
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Controls */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Subnet Input */}
            <div className="flex-1 min-w-[180px] max-w-xs">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Подсеть (CIDR)
              </label>
              <input
                type="text"
                value={subnet}
                onChange={e => setSubnet(e.target.value)}
                disabled={scanning}
                placeholder="192.168.10.0/24"
                className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-colors focus:outline-none focus:border-blue-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                }`}
              />
            </div>

            {/* VLAN Selector */}
            <div className="w-36">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Привязка к VLAN
              </label>
              <select
                value={vlanId}
                onChange={e => setVlanId(e.target.value)}
                disabled={scanning}
                className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono cursor-pointer ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                }`}
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.id}>
                    VLAN {v.id} ({v.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Simulation Mode Toggle */}
            <div className="flex items-center gap-2 pt-5">
              <label className="relative flex items-center gap-2 cursor-pointer text-xs font-semibold select-none">
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={e => setSimulate(e.target.checked)}
                  disabled={scanning}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="text-slate-700 dark:text-slate-300">Режим симуляции (Демо)</span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="ml-auto pt-4 flex items-center gap-2">
              {scanning ? (
                <button
                  onClick={handleStopScan}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-rose-500/20 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Остановить</span>
                </button>
              ) : (
                <button
                  onClick={handleStartScan}
                  disabled={!subnet.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Сканировать подсеть</span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* KPI Summary Cards */}
        {scanResult && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Всего адресов</div>
              <div className="text-lg font-bold font-mono mt-1 text-slate-900 dark:text-white">
                {scanResult.totalScanned}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">В подсети {scanResult.subnet}</div>
            </div>

            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-[10px] font-mono text-emerald-500 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Онлайн</span>
              </div>
              <div className="text-lg font-bold font-mono mt-1 text-emerald-500 dark:text-emerald-400">
                {scanResult.aliveCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Ответили на пинг</div>
            </div>

            <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <div className="text-[10px] font-mono text-blue-500 uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3 h-3" />
                <span>Новые в сети</span>
              </div>
              <div className="text-lg font-bold font-mono mt-1 text-blue-500 dark:text-blue-400">
                {scanResult.newRogueCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Нет в базе IPAM</div>
            </div>

            <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="text-[10px] font-mono text-amber-500 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Зомби в IPAM</span>
              </div>
              <div className="text-lg font-bold font-mono mt-1 text-amber-500 dark:text-amber-400">
                {scanResult.zombieCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Оффлайн в сети</div>
            </div>

            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5">
              <div className="text-[10px] font-mono text-rose-500 uppercase tracking-wider flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" />
                <span>Конфликты</span>
              </div>
              <div className="text-lg font-bold font-mono mt-1 text-rose-500 dark:text-rose-400">
                {scanResult.conflictCount}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Несовпадение MAC</div>
            </div>
          </div>
        )}

        {/* Filter Tabs & Search */}
        {scanResult && (
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'ALL', label: 'Все хосты', count: scanResult.hosts?.length || 0 },
                { id: 'NEW_ROGUE', label: 'Новые хосты', count: scanResult.newRogueCount },
                { id: 'ZOMBIE', label: 'Зомби IPAM', count: scanResult.zombieCount },
                { id: 'CONFLICT', label: 'Конфликты', count: scanResult.conflictCount },
                { id: 'MATCHED', label: 'Синхронизированы', count: scanResult.matchedCount }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                    activeFilter === tab.id ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск по IP, MAC, имени..."
                  className={`pl-8 pr-3 py-1 rounded-xl border text-xs font-mono transition-colors focus:outline-none focus:border-blue-500 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              <button
                onClick={handleExportCsv}
                className="px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        )}

        {/* Results Table Body */}
        <div className="flex-1 overflow-y-auto">
          {scanning ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Выполняется параллельное сканирование подсети {subnet}...
              </div>
              <div className="text-xs text-slate-400 font-mono mt-1">
                Опрос ICMP, сопоставление ARP кэша и обратный резолвинг DNS (воркеров: {concurrency})
              </div>
            </div>
          ) : scanResult ? (
            filteredHosts.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 uppercase tracking-wider select-none z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-8">
                      <button
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {selectedIps.size === filteredHosts.length && filteredHosts.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <SquareOutline className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-3">Статус дрифта</th>
                    <th className="py-2.5 px-3">IP-адрес</th>
                    <th className="py-2.5 px-3">Пинг / RTT</th>
                    <th className="py-2.5 px-3">MAC-адрес</th>
                    <th className="py-2.5 px-3">Вендор OUI</th>
                    <th className="py-2.5 px-3">DNS Hostname</th>
                    <th className="py-2.5 px-3">Запись в IPAM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {filteredHosts.map(h => {
                    const isSelected = selectedIps.has(h.ip);

                    return (
                      <tr
                        key={h.ip}
                        onClick={() => toggleSelectIp(h.ip)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-500/10'
                            : isLight
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-400 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {h.driftStatus === 'MATCHED' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Синхронизирован</span>
                              {h.canEnrichMac && (
                                <span className="ml-1 text-[9px] text-blue-400 font-mono">+MAC</span>
                              )}
                            </span>
                          )}

                          {h.driftStatus === 'NEW_ROGUE' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              <Plus className="w-3 h-3" />
                              <span>Новый хост</span>
                              {h.catalogMatch && (
                                <span className="ml-1 text-[9px] uppercase px-1 rounded bg-blue-500/20">
                                  {h.catalogMatch}
                                </span>
                              )}
                            </span>
                          )}

                          {h.driftStatus === 'ZOMBIE' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Зомби (Оффлайн)</span>
                            </span>
                          )}

                          {h.driftStatus === 'CONFLICT' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                              <AlertOctagon className="w-3 h-3" />
                              <span>Конфликт MAC</span>
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                          {h.ip}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {h.alive ? (
                            <span className="text-emerald-500 dark:text-emerald-400 font-bold">
                              {h.rtt} мс
                            </span>
                          ) : (
                            <span className="text-slate-400">Оффлайн</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {h.mac || <span className="text-slate-400">—</span>}
                        </td>

                        <td className="py-2.5 px-3">
                          {h.vendor ? (
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {h.vendor}
                              </div>
                              {h.vendorType && (
                                <div className="text-[10px] text-slate-400">
                                  {h.vendorType}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {h.hostname || <span className="text-slate-400">—</span>}
                        </td>

                        <td className="py-2.5 px-3">
                          {h.ipamEntry ? (
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {h.ipamEntry.hostname || 'Без имени'}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {h.ipamEntry.mac || 'Без MAC'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Не задокументирован</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs font-mono">
                Хосты с выбранным фильтром не найдены.
              </div>
            )
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center p-4">
              <div className="p-4 rounded-2xl bg-blue-500/10 text-blue-500 dark:text-blue-400 mb-3 border border-blue-500/20">
                <Radar className="w-10 h-10" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Подсеть готова к сканированию
              </h4>
              <p className="text-xs text-slate-400 max-w-md mt-1">
                Нажмите «Сканировать подсеть», чтобы отправить быстрый параллельный ICMP-опрос, сверить активные устройства с базой IPAM и локальной таблицей ARP.
              </p>
            </div>
          )}
        </div>

        {/* Batch Action Bar Footer */}
        {scanResult && selectedIps.size > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-blue-500/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="font-bold text-blue-500 dark:text-blue-400">
                Выбрано хостов: {selectedIps.size}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Type dropdown for import */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">Тип устройства:</span>
                <select
                  value={batchType}
                  onChange={e => setBatchType(e.target.value)}
                  className={`px-2 py-1 rounded-lg border text-xs cursor-pointer ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <option value="workstation">Рабочая станция</option>
                  <option value="server">Сервер</option>
                  <option value="switch">Коммутатор</option>
                  <option value="printer">Принтер</option>
                  <option value="cctv">Камера CCTV</option>
                  <option value="ap">Точка доступа AP</option>
                  <option value="other">Другое</option>
                </select>
              </div>

              <button
                onClick={handleBatchImport}
                disabled={importing}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Импортировать в IPAM</span>
              </button>

              <button
                onClick={handleBatchRelease}
                disabled={releasing}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Освободить зомби</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default IpamScannerModal;
