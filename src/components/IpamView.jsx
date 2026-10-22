import React, { useState, useMemo } from 'react';
import {
  Globe,
  Plus,
  Search,
  Filter,
  Download,
  Edit2,
  Trash2,
  Server,
  Cpu,
  RefreshCw,
  Layers,
  MapPin,
  Sparkles,
  Settings2,
  CheckCircle2,
  Shield,
  Zap,
  Tag
} from 'lucide-react';
import { parseSubnet, isIpInDhcpRange, longToIp, ipToLong } from '../utils/ipamUtils';
import { downloadCsv } from '../utils/exportUtils';
import { api } from '../api';

const TYPE_COLORS = {
  gateway: { bg: 'bg-purple-600', text: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400' },
  switch: { bg: 'bg-blue-600', text: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400' },
  server: { bg: 'bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  vm: { bg: 'bg-indigo-600', text: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400' },
  workstation: { bg: 'bg-cyan-600', text: 'text-cyan-600 dark:text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400' },
  printer: { bg: 'bg-indigo-600', text: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400' },
  cctv: { bg: 'bg-rose-600', text: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400' },
  ap: { bg: 'bg-amber-600', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400' },
  phone: { bg: 'bg-teal-600', text: 'text-teal-600 dark:text-teal-400', badge: 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400' },
  dhcp: { bg: 'bg-slate-400', text: 'text-slate-500', badge: 'bg-slate-500/10 border-slate-500/20 text-slate-500' },
  other: { bg: 'bg-slate-600', text: 'text-slate-600 dark:text-slate-400', badge: 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400' }
};

export function IpamView({
  vlans = [],
  ipAllocations = [],
  servers = [],
  onOpenCreateIpModal,
  onOpenEditIpModal,
  onDeleteIp,
  onOpenEditSubnetModal,
  onAddIp,
  onEditIp,
  onConfigureSubnet,
  onReloadIpam,
  onSelectServer,
  theme = 'dark'
}) {
  const openCreateModal = onOpenCreateIpModal || onAddIp;
  const openEditModal = onOpenEditIpModal || onEditIp;
  const openSubnetModal = onOpenEditSubnetModal || onConfigureSubnet;

  const [selectedVlanId, setSelectedVlanId] = useState(vlans[0]?.id || 1);
  const [activeTab, setActiveTab] = useState('grid'); // 'grid' or 'table'
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const handleSyncServers = async () => {
    try {
      setIsSyncing(true);
      const res = await api.syncServersToIpam();
      if (res && res.success) {
        if (onReloadIpam) {
          await onReloadIpam();
        }
      }
    } catch (err) {
      console.error('Failed to sync servers to IPAM:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const selectedVlan = vlans.find(v => v.id === selectedVlanId) || vlans[0];
  const subnetInfo = useMemo(() => {
    return selectedVlan?.subnet ? parseSubnet(selectedVlan.subnet) : null;
  }, [selectedVlan]);

  // Filter allocations for active VLAN
  const vlanAllocations = useMemo(() => {
    return ipAllocations.filter(i => i.vlanId === selectedVlan?.id);
  }, [ipAllocations, selectedVlan]);

  // Allocation mapping by IP string
  const ipMap = useMemo(() => {
    const map = {};
    vlanAllocations.forEach(a => {
      map[a.ip] = a;
    });
    return map;
  }, [vlanAllocations]);

  // Generate grid cells for subnet
  const gridCells = useMemo(() => {
    if (!subnetInfo || subnetInfo.totalUsable > 256) return [];
    const cells = [];
    const firstL = ipToLong(subnetInfo.firstUsable);
    const lastL = ipToLong(subnetInfo.lastUsable);

    for (let l = firstL; l <= lastL; l++) {
      const ip = longToIp(l);
      const lastOctet = ip.split('.').pop();
      const alloc = ipMap[ip];
      const isGateway = ip === selectedVlan?.gateway;
      const inDhcp = selectedVlan?.dhcpRange ? isIpInDhcpRange(ip, selectedVlan.dhcpRange) : false;

      cells.push({
        ip,
        lastOctet,
        alloc,
        isGateway,
        inDhcp
      });
    }
    return cells;
  }, [subnetInfo, ipMap, selectedVlan]);

  // Table search and filter
  const filteredTableList = useMemo(() => {
    return vlanAllocations.filter(item => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.ip.toLowerCase().includes(q) ||
        item.hostname?.toLowerCase().includes(q) ||
        item.mac?.toLowerCase().includes(q) ||
        item.location?.toLowerCase().includes(q) ||
        item.connectedTo?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    });
  }, [vlanAllocations, typeFilter, searchQuery]);

  // Stats
  const usedCount = vlanAllocations.length;
  const totalUsable = subnetInfo?.totalUsable || 254;
  const freeCount = Math.max(0, totalUsable - usedCount);
  const utilizationPct = Math.round((usedCount / totalUsable) * 100);

  // Export CSV for current VLAN
  const handleExportCSV = () => {
    const headers = ['IP-адрес', 'VLAN ID', 'Имя VLAN', 'Имя хоста', 'MAC-адрес', 'Тип устройства', 'Статус', 'Локация', 'Подключение', 'Описание'];
    const rows = vlanAllocations.map(a => [
      a.ip || '',
      a.vlanId || selectedVlan?.id || '',
      selectedVlan?.name || '',
      a.hostname || '',
      a.mac || '',
      a.type || '',
      a.status || '',
      a.location || '',
      a.connectedTo || '',
      a.description || ''
    ]);
    downloadCsv(`IPAM_VLAN_${selectedVlan?.id || 'all'}`, headers, rows);
  };

  // Export CSV for all IPAM records across all subnets
  const handleExportAllIpamCSV = () => {
    const headers = ['IP-адрес', 'VLAN ID', 'Имя VLAN', 'Подсеть', 'Шлюз', 'Имя хоста', 'MAC-адрес', 'Тип устройства', 'Статус', 'Локация', 'Подключение', 'Описание'];
    const rows = (ipAllocations || []).map(a => {
      const vlan = vlans.find(v => v.id === a.vlanId);
      return [
        a.ip || '',
        a.vlanId || '',
        vlan ? vlan.name : '',
        vlan ? vlan.subnet || '' : '',
        vlan ? vlan.gateway || '' : '',
        a.hostname || '',
        a.mac || '',
        a.type || '',
        a.status || '',
        a.location || '',
        a.connectedTo || '',
        a.description || ''
      ];
    });
    downloadCsv('IPAM_Полный_реестр_сети', headers, rows);
  };

  const isLight = theme === 'light';

  return (
    <div className="space-y-6">
      {/* Top IPAM Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`p-4 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Всего подсетей</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
            {vlans.filter(v => v.subnet).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Привязаны к VLAN</div>
        </div>

        <div className={`p-4 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Занято IP-адресов</div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            {ipAllocations.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">В активной базе</div>
        </div>

        <div className={`p-4 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">В текущей подсети</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {usedCount} <span className="text-xs font-normal text-slate-400">/ {totalUsable}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Свободно: {freeCount} IP</div>
        </div>

        <div className={`p-4 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Утилизация пула</div>
          <div className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400 mt-1">
            {utilizationPct}%
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                utilizationPct > 85 ? 'bg-rose-500' : utilizationPct > 60 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main IPAM View: Left Subnets List, Right Subnet Details & Matrix */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Subnets List */}
        <aside className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Подсети / VLAN ({vlans.length})
            </span>
            <button
              onClick={handleExportAllIpamCSV}
              className="text-xs text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium flex items-center gap-1 cursor-pointer transition-colors"
              title="Экспорт всей базы IPAM всех VLAN в Excel (CSV)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>Все (Excel)</span>
            </button>
          </div>

          <div className="space-y-2">
            {vlans.map(v => {
              const isSelected = selectedVlan?.id === v.id;
              const vlanIpsCount = ipAllocations.filter(i => i.vlanId === v.id).length;
              const parsed = v.subnet ? parseSubnet(v.subnet) : null;
              const usable = parsed?.totalUsable || 254;
              const pct = Math.round((vlanIpsCount / usable) * 100);

              return (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setSelectedVlanId(v.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? (isLight
                          ? 'bg-blue-50/80 border-blue-500 shadow-md ring-1 ring-blue-500'
                          : 'bg-slate-900 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500')
                      : (isLight
                          ? 'bg-white border-slate-200 hover:bg-slate-50'
                          : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900')
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: v.color || '#3b82f6' }}
                      />
                      <span className="font-bold text-xs truncate text-slate-900 dark:text-white">
                        VLAN {v.id}: {v.name}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {vlanIpsCount} IP
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 mt-1.5 truncate">
                    {v.subnet || 'Подсеть не задана'}
                  </div>

                  {/* Subnet mini bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Active Subnet Dashboard */}
        <section className="flex-1 min-w-0 space-y-4">
          {selectedVlan ? (
            <div className={`border rounded-2xl p-5 shadow-xl transition-colors space-y-6 ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
            }`}>
              {/* Subnet Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                    style={{ backgroundColor: selectedVlan.color || '#3b82f6' }}
                  >
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                        {selectedVlan.subnet || 'Подсеть не настроена'}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        VLAN {selectedVlan.id}: {selectedVlan.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span>Шлюз: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedVlan.gateway || '—'}</strong></span>
                      <span>•</span>
                      <span>DHCP-пул: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedVlan.dhcpRange || 'Отключен'}</strong></span>
                      <span>•</span>
                      <span>DNS: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedVlan.dns || '—'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                  <button
                    onClick={handleSyncServers}
                    disabled={isSyncing}
                    className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                        : 'bg-indigo-950/40 hover:bg-indigo-900/60 border-indigo-850 text-indigo-300'
                    }`}
                    title="Синхронизировать гипервизоры и виртуальные машины с IPAM"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-500' : 'text-indigo-400'}`} />
                    <span>{isSyncing ? 'Синхронизация...' : 'Синхронизация ВМ'}</span>
                  </button>

                  <button
                    onClick={() => openSubnetModal?.(selectedVlan)}
                    className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                    title="Настроить параметры подсети"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Подсеть</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                    title="Экспорт в Excel CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="hidden sm:inline">Excel</span>
                  </button>

                  <button
                    onClick={() => openCreateModal?.(selectedVlan.id)}
                    className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Выделить IP</span>
                  </button>
                </div>
              </div>

              {/* View Switcher: Matrix Grid vs Table */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 rounded-xl border max-w-fit border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('grid')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      activeTab === 'grid'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Интерактивная карта IP
                  </button>
                  <button
                    onClick={() => setActiveTab('table')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      activeTab === 'table'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Таблица адресов ({vlanAllocations.length})
                  </button>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-purple-600 inline-block" /> Шлюз
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" /> Свитч
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" /> Сервер
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block" /> ВМ
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-cyan-600 inline-block" /> ПК
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" /> CCTV
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-600 inline-block" /> AP
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-800 border border-slate-400 inline-block" /> Свободен
                  </span>
                </div>
              </div>

              {/* TAB 1: INTERACTIVE IP MATRIX GRID */}
              {activeTab === 'grid' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-x-auto">
                    {/* Grid of 254 IP addresses */}
                    <div className="min-w-[700px] grid grid-cols-16 gap-1.5">
                      {gridCells.map((cell) => {
                        const isAllocated = Boolean(cell.alloc);
                        const devType = cell.isGateway ? 'gateway' : (cell.alloc?.type || 'other');
                        const colors = TYPE_COLORS[devType] || TYPE_COLORS.other;

                        return (
                          <div
                            key={cell.ip}
                            onClick={() => {
                              if (cell.alloc) {
                                openEditModal?.(cell.alloc);
                              } else {
                                openCreateModal?.(selectedVlan.id, cell.ip);
                              }
                            }}
                            title={
                              cell.alloc
                                ? `${cell.ip} — ${cell.alloc.hostname || 'Без имени'}\nТип: ${cell.alloc.type}\nMAC: ${cell.alloc.mac || '—'}\nМесто: ${cell.alloc.location || '—'}\nКликните для редактирования`
                                : `${cell.ip} — Свободный IP-адрес\nКликните для быстрого выделения`
                            }
                            className={`h-9 rounded-md border flex flex-col items-center justify-center cursor-pointer transition-all relative select-none ${
                              isAllocated
                                ? `${colors.bg} text-white border-transparent shadow-xs hover:scale-115 hover:z-20`
                                : cell.inDhcp
                                ? (isLight
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 hover:scale-110'
                                    : 'bg-amber-950/20 border-amber-800/60 text-amber-400 hover:bg-amber-900/30 hover:scale-110')
                                : (isLight
                                    ? 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:scale-110'
                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-blue-500 hover:text-blue-400 hover:scale-110')
                            }`}
                          >
                            <span className="font-mono text-[10px] font-bold leading-tight">
                              .{cell.lastOctet}
                            </span>
                            {isAllocated && (
                              <span className="text-[7px] font-mono leading-none truncate max-w-[36px] px-0.5 opacity-90">
                                {cell.alloc.hostname ? cell.alloc.hostname.slice(0, 5) : 'USE'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: IP TABLE VIEW */
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск по IP, имени, MAC, розетке..."
                        className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className={`text-xs px-2.5 py-1.5 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <option value="all">Все типы устройств</option>
                        <option value="vm">Виртуальные машины (ВМ)</option>
                        <option value="server">Серверы и гипервизоры</option>
                        <option value="workstation">Рабочие станции (ПК)</option>
                        <option value="switch">Коммутаторы</option>
                        <option value="gateway">Шлюзы</option>
                        <option value="printer">Принтеры</option>
                        <option value="cctv">Камеры CCTV</option>
                        <option value="ap">Точки доступа AP</option>
                        <option value="phone">IP-Телефоны</option>
                      </select>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className={`border-b font-mono text-[11px] text-slate-500 uppercase ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <th className="py-2.5 px-3">IP-адрес</th>
                          <th className="py-2.5 px-3">Имя хоста</th>
                          <th className="py-2.5 px-3">MAC-адрес</th>
                          <th className="py-2.5 px-3">Тип</th>
                          <th className="py-2.5 px-3">Локация / Розетка</th>
                          <th className="py-2.5 px-3">Подключение</th>
                          <th className="py-2.5 px-3">Описание</th>
                          <th className="py-2.5 px-3 text-right">Действия</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredTableList.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400">
                              {searchQuery ? 'Ничего не найдено по вашему запросу' : 'В этой подсети пока нет выделенных IP'}
                            </td>
                          </tr>
                        ) : (
                          filteredTableList.map((item) => {
                            const colors = TYPE_COLORS[item.type] || TYPE_COLORS.other;

                            return (
                              <tr
                                key={item.id}
                                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {item.ip}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                                  {item.hostname || '—'}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                  {item.mac || '—'}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${colors.badge}`}>
                                    {item.type === 'vm' ? <Cpu className="w-3 h-3 text-indigo-400" /> : null}
                                    {item.type === 'server' ? <Server className="w-3 h-3 text-emerald-400" /> : null}
                                    <span>{item.type === 'vm' ? 'ВМ' : item.type}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                  {item.location || '—'}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px]">
                                  {item.serverId && onSelectServer ? (
                                    <button
                                      type="button"
                                      onClick={() => onSelectServer(item.serverId)}
                                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-sans text-xs"
                                      title="Перейти к серверу в разделе серверов"
                                    >
                                      <Server className="w-3 h-3" />
                                      <span>{item.connectedTo || 'Сервер'}</span>
                                    </button>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400">{item.connectedTo || '—'}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                                  {item.description || '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => openEditModal?.(item)}
                                      className="p-1 text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                                      title="Редактировать"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => onDeleteIp(item.id)}
                                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                      title="Освободить IP"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">
              Выберите подсеть из списка слева
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
