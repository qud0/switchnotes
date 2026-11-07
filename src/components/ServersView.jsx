import React, { useState, useMemo } from 'react';
import {
  Cpu,
  Server,
  HardDrive,
  Activity,
  Layers,
  Network,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Shield,
  Copy,
  Check,
  Cable,
  Hash,
  Terminal,
  Settings2,
  RefreshCw,
  Info,
  Download
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { EmptyState } from './EmptyState';

const VENDOR_OPTIONS = [
  'Dell',
  'HPE',
  'Supermicro',
  'Lenovo',
  'Aquarius',
  'Kraftway',
  'Yadro',
  'Кастомный'
];

const SERVER_TYPES = [
  { id: 'hypervisor', label: 'Гипервизор', desc: 'Хост виртуализации (Proxmox, ESXi, Hyper-V)' },
  { id: 'storage_nas', label: 'СХД / NAS', desc: 'Хранилище данных (TrueNAS, Ceph, SAN)' },
  { id: 'physical', label: 'Физический сервер', desc: 'Bare-metal сервер без виртуализации' }
];

export function ServersView({
  servers = [],
  switches = [],
  vlans = [],
  onReloadServers,
  onSelectSwitch,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'hypervisor', 'storage_nas', 'physical'
  const [expandedServerIds, setExpandedServerIds] = useState(() => {
    // Expand all by default
    return new Set(servers.map(s => s.id));
  });

  // Modal states
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);

  const [isVmModalOpen, setIsVmModalOpen] = useState(false);
  const [vmServerTarget, setVmServerTarget] = useState(null);
  const [editingVm, setEditingVm] = useState(null);

  const [copiedText, setCopiedText] = useState(null);

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const toggleExpand = (id) => {
    setExpandedServerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedServerIds(new Set(servers.map(s => s.id)));
  const collapseAll = () => setExpandedServerIds(new Set());

  // Live Ping / Heartbeat state
  const [isPinging, setIsPinging] = useState(false);
  const [pingResults, setPingResults] = useState(null);

  const handlePingAllServers = async () => {
    try {
      setIsPinging(true);
      const res = await api.pingAllServers();
      if (res && res.servers) {
        const srvMap = {};
        res.servers.forEach(s => {
          const vmMap = {};
          (s.vms || []).forEach(v => {
            if (v.id) vmMap[v.id] = v;
            if (v.vmid) vmMap[v.vmid] = v;
          });
          srvMap[s.id] = {
            ...s,
            vmMap
          };
        });
        setPingResults({
          ...res,
          srvMap
        });
      }
    } catch (err) {
      console.error('Ошибка ping-опроса серверов:', err);
    } finally {
      setIsPinging(false);
    }
  };

  // Sync Servers and VMs to IPAM
  const [isSyncingIpam, setIsSyncingIpam] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const handleSyncIpam = async () => {
    try {
      setIsSyncingIpam(true);
      const res = await api.syncServersToIpam();
      toast.success(`Синхронизировано: ${res.createdCount} новых, ${res.updatedCount} обновлено (всего ${res.total} в IPAM)`);
      onReloadServers();
    } catch (err) {
      toast.error(`Ошибка синхронизации с IPAM: ${err.message}`);
    } finally {
      setIsSyncingIpam(false);
    }
  };

  // Export Servers & VMs to CSV
  const handleExportCSV = () => {
    const headers = [
      'Узел (Хост)',
      'Тип устройства',
      'Вендор',
      'Модель',
      'IP управления',
      'MAC-адрес',
      'CPU',
      'RAM',
      'Хранилище',
      'VMID',
      'Имя ВМ',
      'IP ВМ',
      'VLAN ВМ',
      'vCPU',
      'RAM ВМ',
      'Диск ВМ',
      'Статус ВМ'
    ];

    const rows = [];
    servers.forEach(srv => {
      if (!srv.vms || srv.vms.length === 0) {
        rows.push([
          `"${srv.name || ''}"`,
          srv.type || '',
          srv.vendor || '',
          `"${srv.model || ''}"`,
          srv.ip || '',
          srv.mac || '',
          `"${srv.cpu || ''}"`,
          `"${srv.ram || ''}"`,
          `"${srv.storage || ''}"`,
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—',
          '—'
        ]);
      } else {
        srv.vms.forEach(vm => {
          rows.push([
            `"${srv.name || ''}"`,
            srv.type || '',
            srv.vendor || '',
            `"${srv.model || ''}"`,
            srv.ip || '',
            srv.mac || '',
            `"${srv.cpu || ''}"`,
            `"${srv.ram || ''}"`,
            `"${srv.storage || ''}"`,
            vm.vmid || '',
            `"${vm.name || ''}"`,
            vm.ip || '',
            vm.vlan || '',
            vm.cores || '',
            `"${vm.ram || ''}"`,
            `"${vm.disk || ''}"`,
            vm.status || ''
          ]);
        });
      }
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Servers_and_VMs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const totalServers = servers.length;
    const onlineServers = servers.filter(s => s.status === 'online').length;

    let totalVms = 0;
    let runningVms = 0;
    let totalNics = 0;
    let totalCores = 0;

    servers.forEach(s => {
      totalNics += (s.nics || []).length;
      (s.vms || []).forEach(v => {
        totalVms++;
        if (v.status === 'running') runningVms++;
        totalCores += Number(v.cores) || 0;
      });
    });

    return { totalServers, onlineServers, totalVms, runningVms, totalNics, totalCores };
  }, [servers]);

  // Filtered servers list
  const filteredServers = useMemo(() => {
    return servers.filter(srv => {
      if (typeFilter !== 'all' && srv.type !== typeFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const inServer =
        (srv.name || '').toLowerCase().includes(q) ||
        (srv.hostname || '').toLowerCase().includes(q) ||
        (srv.ip || '').toLowerCase().includes(q) ||
        (srv.mac || '').toLowerCase().includes(q) ||
        (srv.os || '').toLowerCase().includes(q) ||
        (srv.model || '').toLowerCase().includes(q) ||
        (srv.location || '').toLowerCase().includes(q);

      const inVms = (srv.vms || []).some(v =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.ip || '').toLowerCase().includes(q) ||
        (v.role || '').toLowerCase().includes(q) ||
        (v.os || '').toLowerCase().includes(q) ||
        String(v.vmid).includes(q) ||
        String(v.vlan).includes(q)
      );

      const inNics = (srv.nics || []).some(n =>
        (n.name || '').toLowerCase().includes(q) ||
        (n.ip || '').toLowerCase().includes(q) ||
        (n.role || '').toLowerCase().includes(q)
      );

      return inServer || inVms || inNics;
    });
  }, [servers, typeFilter, searchQuery]);

  // Server CRUD
  const handleOpenNewServer = () => {
    setEditingServer(null);
    setIsServerModalOpen(true);
  };

  const handleOpenEditServer = (srv) => {
    setEditingServer(srv);
    setIsServerModalOpen(true);
  };

  const handleDeleteServer = async (srv) => {
    if (!window.confirm(`Удалить сервер "${srv.name}" (${srv.hostname || srv.ip})? Это также удалит связанные виртуальные машины.`)) {
      return;
    }
    try {
      await api.deleteServer(srv.id);
      toast.success(`Сервер «${srv.name}» удален`);
      onReloadServers();
    } catch (err) {
      toast.error(`Ошибка удаления: ${err.message}`);
    }
  };

  // VM CRUD
  const handleOpenAddVm = (srv) => {
    setVmServerTarget(srv);
    setEditingVm(null);
    setIsVmModalOpen(true);
  };

  const handleOpenEditVm = (srv, vm) => {
    setVmServerTarget(srv);
    setEditingVm(vm);
    setIsVmModalOpen(true);
  };

  const handleDeleteVm = async (srv, vm) => {
    if (!window.confirm(`Удалить виртуальную машину [${vm.vmid}] "${vm.name}" с узла "${srv.name}"?`)) {
      return;
    }
    try {
      await api.deleteVm(srv.id, vm.vmid);
      toast.success(`ВМ «${vm.name}» удалена`);
      onReloadServers();
    } catch (err) {
      toast.error(`Ошибка удаления ВМ: ${err.message}`);
    }
  };

  // Helper: Find VLAN info by ID
  const getVlanInfo = (vlanId) => {
    return vlans.find(v => Number(v.id) === Number(vlanId));
  };

  // Helper: Find Switch info by ID
  const getSwitchInfo = (switchId) => {
    return switches.find(s => s.id === switchId);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Серверы & СХД</div>
            <div className="text-2xl font-bold font-mono mt-1 text-slate-900 dark:text-white">
              {metrics.onlineServers} <span className="text-sm font-normal text-slate-500">/ {metrics.totalServers}</span>
            </div>
            <div className="text-[11px] text-emerald-500 flex items-center gap-1 mt-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Все ноды в сети
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Виртуальные машины</div>
            <div className="text-2xl font-bold font-mono mt-1 text-indigo-600 dark:text-indigo-400">
              {metrics.runningVms} <span className="text-sm font-normal text-slate-500">/ {metrics.totalVms}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">
              {metrics.totalCores} выделенных vCPU
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Server className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Сетевые интерфейсы</div>
            <div className="text-2xl font-bold font-mono mt-1 text-cyan-600 dark:text-cyan-400">
              {metrics.totalNics} <span className="text-xs font-normal text-slate-500">NICs</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">
              10G SFP+ & LACP транки
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Network className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Виртуальные коммутаторы</div>
            <div className="text-2xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              802.1Q
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-medium">
              vmbr0 / vSwitch0 / Trunk
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. Controls Toolbar: Search, Type Filter, Action Buttons */}
      <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск ноды, ВМ, IP, VLAN..."
              className={`w-full h-9 border rounded-xl pl-8 pr-7 text-xs outline-none transition-all placeholder-slate-400 focus:border-blue-500 ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-900 focus:bg-white'
                  : 'bg-slate-950 border-slate-800 text-white focus:bg-slate-900'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type Filter Pill Buttons */}
          <div className={`flex items-center rounded-xl border p-0.5 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => setTypeFilter('all')}
              className={`h-7.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Все ({servers.length})
            </button>
            <button
              onClick={() => setTypeFilter('hypervisor')}
              className={`h-7.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === 'hypervisor'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Гипервизоры
            </button>
            <button
              onClick={() => setTypeFilter('storage_nas')}
              className={`h-7.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === 'storage_nas'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              СХД / NAS
            </button>
            <button
              onClick={() => setTypeFilter('physical')}
              className={`h-7.5 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                typeFilter === 'physical'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Физические
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={expandedServerIds.size === servers.length ? collapseAll : expandAll}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
          >
            {expandedServerIds.size === servers.length ? 'Свернуть все' : 'Развернуть все'}
          </button>

          <button
            onClick={handlePingAllServers}
            disabled={isPinging}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLight
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-800 text-emerald-300'
            }`}
            title="Опросить доступность (Ping/ICMP) серверов и виртуальных машин"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-emerald-500' : 'text-emerald-400'}`} />
            <span>
              {isPinging
                ? 'Ping опрос...'
                : pingResults
                ? `Ping (${pingResults.onlineServers}/${pingResults.totalServers})`
                : 'Live Ping'}
            </span>
          </button>

          <button
            onClick={handleExportCSV}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Экспорт спецификаций серверов и ВМ в CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            onClick={handleSyncIpam}
            disabled={isSyncingIpam}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              isLight
                ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'
                : 'bg-indigo-950/40 hover:bg-indigo-900/60 border-indigo-800 text-indigo-300'
            }`}
            title="Синхронизировать IP-адреса серверов и ВМ с базой IPAM"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingIpam ? 'animate-spin text-indigo-500' : 'text-indigo-400'}`} />
            <span>{isSyncingIpam ? 'Синхронизация...' : 'В IPAM'}</span>
          </button>

          <button
            onClick={handleOpenNewServer}
            className="h-9 px-3.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить сервер</span>
          </button>
        </div>
      </div>

      {/* Sync Notification Banner */}
      {syncMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center justify-between animate-fade-in font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{syncMessage}</span>
          </div>
          <button onClick={() => setSyncMessage(null)} className="text-emerald-400/70 hover:text-emerald-300">✕</button>
        </div>
      )}

      {/* 3. Server List */}
      {filteredServers.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={Cpu}
          title={searchQuery ? 'Ничего не найдено' : 'Серверы не добавлены'}
          description={
            searchQuery
              ? 'Попробуйте изменить параметры поиска или фильтр по типу устройства.'
              : 'Добавьте первый хост виртуализации (Proxmox VE, VMware ESXi, Hyper-V) или СХД для учета сетевых интерфейсов и виртуальных машин.'
          }
          action={{
            label: 'Добавить сервер',
            icon: Plus,
            onClick: handleOpenNewServer
          }}
        />
      ) : (
        <div className="space-y-4">
          {filteredServers.map(srv => {
            const isExpanded = expandedServerIds.has(srv.id);
            const vmsList = srv.vms || [];
            const nicsList = srv.nics || [];
            const bridgesList = srv.bridges || [];

            return (
              <div
                key={srv.id}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isLight
                    ? 'bg-white border-slate-200 shadow-xs'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Server Card Header */}
                <div
                  onClick={() => toggleExpand(srv.id)}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                    isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white shrink-0 mt-0.5 sm:mt-0"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className="w-11 h-11 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                      <Cpu className="w-6 h-6" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white font-mono truncate">
                          {srv.name}
                        </h3>
                        {srv.hostname && (
                          <span className="text-xs text-slate-400 font-mono">
                            ({srv.hostname})
                          </span>
                        )}
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          srv.status === 'online'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : srv.status === 'maintenance'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            srv.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-current'
                          }`}></span>
                          {srv.status === 'online' ? 'Online' : srv.status === 'maintenance' ? 'Обслуживание' : 'Offline'}
                        </span>

                        {pingResults?.srvMap?.[srv.id] && (
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                            pingResults.srvMap[srv.id].online
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              pingResults.srvMap[srv.id].online ? 'bg-emerald-500' : 'bg-rose-500'
                            }`} />
                            <span>
                              {pingResults.srvMap[srv.id].online
                                ? `${pingResults.srvMap[srv.id].rtt} ms`
                                : 'Ping Down'}
                            </span>
                          </span>
                        )}

                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {srv.vendor} {srv.model}
                        </span>

                        {srv.unit && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                            Unit {srv.unit}{srv.unitHeight > 1 ? `-${srv.unit + srv.unitHeight - 1}` : ''} ({srv.unitHeight}U)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <Terminal className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          {srv.os || 'Linux'}
                        </span>
                        {srv.ip && (
                          <span className="flex items-center gap-1 font-mono">
                            IP: <span className="text-blue-600 dark:text-blue-400 font-bold">{srv.ip}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopy(srv.ip); }}
                              className="text-slate-400 hover:text-blue-500"
                              title="Скопировать IP"
                            >
                              {copiedText === srv.ip ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </span>
                        )}
                        {srv.location && (
                          <span>• {srv.location}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Header right: Hardware Summary & Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end md:self-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="hidden xl:flex items-center gap-3 text-xs font-mono pr-2 border-r border-slate-700/40">
                      {srv.cpu && (
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-slate-400 font-sans">CPU</div>
                          <div className="text-slate-300 truncate max-w-[140px]" title={srv.cpu}>{srv.cpu}</div>
                        </div>
                      )}
                      {srv.ram && (
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-slate-400 font-sans">RAM</div>
                          <div className="text-slate-300 font-bold">{srv.ram}</div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenAddVm(srv)}
                        className="h-9 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title="Добавить виртуальную машину"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>ВМ</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditServer(srv)}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                        title="Редактировать сервер"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteServer(srv)}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-rose-100 border-slate-200 text-rose-600'
                            : 'bg-slate-800 hover:bg-rose-950/60 border-slate-700 text-rose-400'
                        }`}
                        title="Удалить сервер"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className={`p-5 border-t space-y-6 ${
                    isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                  }`}>
                    {/* Hardware Specs & Storage Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className={`p-3 rounded-xl border ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <Cpu className="w-3.5 h-3.5 text-blue-500" />
                          Процессор & Вычисления
                        </div>
                        <div className="text-xs font-mono text-slate-800 dark:text-slate-200 font-medium">
                          {srv.cpu || 'Не указано'}
                        </div>
                      </div>

                      <div className={`p-3 rounded-xl border ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-500" />
                          Оперативная память
                        </div>
                        <div className="text-xs font-mono text-slate-800 dark:text-slate-200 font-medium">
                          {srv.ram || 'Не указано'}
                        </div>
                      </div>

                      <div className={`p-3 rounded-xl border ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                          Дисковая подсистема (Storage)
                        </div>
                        <div className="text-xs font-mono text-slate-800 dark:text-slate-200 font-medium">
                          {srv.storage || 'Не указано'}
                        </div>
                      </div>
                    </div>

                    {/* Network Interfaces (NICs) & Bridges Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <Network className="w-4 h-4 text-cyan-500" />
                          Физические сетевые интерфейсы ({nicsList.length}) & Мосты ({bridgesList.length})
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {nicsList.length === 0 ? (
                          <div className="text-xs text-slate-500 italic col-span-4">Интерфейсы не описаны</div>
                        ) : (
                          nicsList.map(nic => {
                            const sw = getSwitchInfo(nic.connectedSwitchId);
                            const is10G = nic.speed?.includes('10G') || nic.type === 'sfp';

                            return (
                              <div
                                key={nic.id || nic.name}
                                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-mono font-bold text-xs text-slate-900 dark:text-white">
                                    <Cable className={`w-3.5 h-3.5 ${is10G ? 'text-amber-400' : 'text-blue-400'}`} />
                                    <span>{nic.name}</span>
                                  </div>
                                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm font-semibold ${
                                    is10G
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                  }`}>
                                    {nic.speed || (is10G ? '10G' : '1G')}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-400 space-y-1">
                                  {nic.mac && (
                                    <div className="font-mono text-[10px] text-slate-500 truncate" title={nic.mac}>
                                      MAC: {nic.mac}
                                    </div>
                                  )}
                                  {nic.role && (
                                    <div className="text-indigo-400 font-medium">
                                      Роль: {nic.role}
                                    </div>
                                  )}
                                  {nic.connectedSwitchId ? (
                                    <div className="text-slate-300 flex items-center gap-1">
                                      <span>➔</span>
                                      {sw ? (
                                        <button
                                          onClick={() => onSelectSwitch && onSelectSwitch(sw.id)}
                                          className="text-blue-400 hover:underline font-mono truncate cursor-pointer text-left"
                                        >
                                          {sw.name}:{nic.connectedPortId || 'port'}
                                        </button>
                                      ) : (
                                        <span className="font-mono">{nic.connectedSwitchId}:{nic.connectedPortId}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-slate-500 italic">Не подключен</div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Bridges summary */}
                      {bridgesList.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {bridgesList.map(br => (
                            <div
                              key={br.id || br.name}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                                isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                              }`}
                            >
                              <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="font-bold text-indigo-400">{br.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {br.type}
                              </span>
                              {br.description && (
                                <span className="text-[11px] text-slate-400 font-sans truncate max-w-xs">
                                  — {br.description}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Virtual Machines Table */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <Server className="w-4 h-4 text-indigo-500" />
                          Виртуальные машины ({vmsList.length})
                        </h4>
                        <button
                          onClick={() => handleOpenAddVm(srv)}
                          className="text-xs text-indigo-500 hover:text-indigo-400 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Добавить ВМ
                        </button>
                      </div>

                      {vmsList.length === 0 ? (
                        <div className={`p-6 text-center border border-dashed rounded-xl ${
                          isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900/30'
                        }`}>
                          <p className="text-xs text-slate-400">На этом узле пока нет зарегистрированных виртуальных машин.</p>
                          <button
                            onClick={() => handleOpenAddVm(srv)}
                            className="mt-2 text-xs font-medium text-indigo-500 hover:underline cursor-pointer"
                          >
                            + Добавить первую ВМ
                          </button>
                        </div>
                      ) : (
                        <div className={`rounded-xl border overflow-x-auto ${
                          isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                        }`}>
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className={`border-b text-[11px] font-semibold uppercase tracking-wider ${
                                isLight ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950/60 text-slate-400 border-slate-800'
                              }`}>
                                <th className="py-2.5 px-3">VMID</th>
                                <th className="py-2.5 px-3">Название / Hostname</th>
                                <th className="py-2.5 px-3">Назначение / Роль</th>
                                <th className="py-2.5 px-3">IP-адрес</th>
                                <th className="py-2.5 px-3">VLAN</th>
                                <th className="py-2.5 px-3">Bridge</th>
                                <th className="py-2.5 px-3">Ресурсы</th>
                                <th className="py-2.5 px-3">Статус</th>
                                <th className="py-2.5 px-3 text-right">Действия</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {vmsList.map(vm => {
                                const vlanInfo = getVlanInfo(vm.vlan);

                                return (
                                  <tr
                                    key={vm.vmid}
                                    className={`transition-colors ${
                                      isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                                    }`}
                                  >
                                    {/* VMID */}
                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                                      #{vm.vmid}
                                    </td>

                                    {/* Name & OS */}
                                    <td className="py-2.5 px-3">
                                      <div className="font-semibold text-slate-900 dark:text-white font-mono">
                                        {vm.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {vm.os || 'Linux'}
                                      </div>
                                    </td>

                                    {/* Role */}
                                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                                      {vm.role || '—'}
                                    </td>

                                    {/* IP & MAC */}
                                    <td className="py-2.5 px-3 font-mono">
                                      {vm.ip ? (
                                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                                          <span>{vm.ip}</span>
                                          <button
                                            onClick={() => handleCopy(vm.ip)}
                                            className="text-slate-400 hover:text-blue-500"
                                            title="Скопировать IP"
                                          >
                                            {copiedText === vm.ip ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-slate-500">DHCP / —</span>
                                      )}
                                      {vm.mac && (
                                        <div className="text-[10px] text-slate-500">
                                          {vm.mac}
                                        </div>
                                      )}
                                    </td>

                                    {/* VLAN */}
                                    <td className="py-2.5 px-3">
                                      {vlanInfo ? (
                                        <span
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold"
                                          style={{
                                            backgroundColor: `${vlanInfo.color}18`,
                                            color: vlanInfo.color,
                                            border: `1px solid ${vlanInfo.color}40`
                                          }}
                                        >
                                          <span>VLAN {vlanInfo.id}</span>
                                          <span className="text-[10px] font-sans opacity-90 truncate max-w-[80px]">
                                            ({vlanInfo.name})
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20">
                                          VLAN {vm.vlan || 1}
                                        </span>
                                      )}
                                    </td>

                                    {/* Bridge */}
                                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                                      {vm.bridge || 'vmbr0'}
                                    </td>

                                    {/* Resources */}
                                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                                      <span>{vm.cores || 2} vCPU</span> • <span>{vm.ram || '4 GB'}</span>
                                      {vm.disk && <div className="text-[10px] text-slate-500">Диск: {vm.disk}</div>}
                                    </td>

                                    {/* Status */}
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                          vm.status === 'running'
                                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                        }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${vm.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                          {vm.status === 'running' ? 'Запущена' : 'Остановлена'}
                                        </span>

                                        {(() => {
                                          const vmPing = pingResults?.srvMap?.[srv.id]?.vmMap?.[vm.vmid || vm.id];
                                          if (!vmPing) return null;
                                          return (
                                            <span
                                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                                                vmPing.online
                                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                              }`}
                                              title={`RTT: ${vmPing.online ? `${vmPing.rtt} мс` : 'Хост недоступен'}`}
                                            >
                                              {vmPing.online ? `${vmPing.rtt}ms` : 'Down'}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="py-2.5 px-3 text-right">
                                      <div className="inline-flex items-center gap-1">
                                        <button
                                          onClick={() => handleOpenEditVm(srv, vm)}
                                          className="p-1 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                                          title="Редактировать ВМ"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteVm(srv, vm)}
                                          className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                          title="Удалить ВМ"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Server Add/Edit Modal */}
      {isServerModalOpen && (
        <ServerEditModal
          server={editingServer}
          switches={switches}
          onClose={() => setIsServerModalOpen(false)}
          onSaved={() => {
            setIsServerModalOpen(false);
            onReloadServers();
          }}
          theme={theme}
        />
      )}

      {/* 5. VM Add/Edit Modal */}
      {isVmModalOpen && vmServerTarget && (
        <VmEditModal
          server={vmServerTarget}
          vm={editingVm}
          vlans={vlans}
          onClose={() => setIsVmModalOpen(false)}
          onSaved={() => {
            setIsVmModalOpen(false);
            onReloadServers();
          }}
          theme={theme}
        />
      )}
    </div>
  );
}

// --- SERVER EDIT MODAL ---
function ServerEditModal({ server, switches = [], onClose, onSaved, theme = 'dark' }) {
  const isLight = theme === 'light';
  const toast = useToast();
  const isEditing = Boolean(server?.id);

  const [activeTab, setActiveTab] = useState('general'); // 'general', 'nics', 'bridges'

  const [formData, setFormData] = useState({
    name: server?.name || '',
    hostname: server?.hostname || '',
    vendor: server?.vendor || 'Dell',
    model: server?.model || 'PowerEdge R740',
    type: server?.type || 'hypervisor',
    os: server?.os || 'Proxmox VE 8.2',
    ip: server?.ip || '',
    mac: server?.mac || '',
    location: server?.location || 'Серверная 1, Стойка 1',
    unit: server?.unit !== undefined ? server.unit : 20,
    unitHeight: server?.unitHeight !== undefined ? server.unitHeight : 2,
    status: server?.status || 'online',
    cpu: server?.cpu || '2x Intel Xeon Silver (24c/48t)',
    ram: server?.ram || '128 GB ECC DDR4',
    storage: server?.storage || '8x 1.92TB NVMe RAID10',
    notes: server?.notes || '',
    nics: Array.isArray(server?.nics) ? JSON.parse(JSON.stringify(server.nics)) : [],
    bridges: Array.isArray(server?.bridges) ? JSON.parse(JSON.stringify(server.bridges)) : []
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // NIC Handlers
  const handleAddNic = () => {
    const nextIdx = formData.nics.length + 1;
    const isSfp = nextIdx > 2;
    const newNic = {
      id: `nic-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: isSfp ? `ens1f${nextIdx - 3}` : `eno${nextIdx}`,
      type: isSfp ? 'sfp' : 'copper',
      speed: isSfp ? '10G' : '1G',
      role: nextIdx === 1 ? 'management' : isSfp ? 'bond0_slave' : 'vm_traffic',
      mac: '',
      ip: '',
      connectedSwitchId: switches[0]?.id || '',
      connectedPortId: ''
    };
    setFormData(prev => ({ ...prev, nics: [...prev.nics, newNic] }));
  };

  const handleUpdateNic = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.nics];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'connectedSwitchId') {
        updated[index].connectedPortId = '';
      }
      return { ...prev, nics: updated };
    });
  };

  const handleDeleteNic = (index) => {
    setFormData(prev => ({
      ...prev,
      nics: prev.nics.filter((_, idx) => idx !== index)
    }));
  };

  const handleApplyPresetNics = (presetType) => {
    if (presetType === 'proxmox') {
      const preset = [
        { id: `nic-p1-${Date.now()}`, name: 'eno1', type: 'copper', speed: '1G', role: 'management', mac: '', ip: formData.ip, connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-p2-${Date.now()}`, name: 'eno2', type: 'copper', speed: '1G', role: 'corosync', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-p3-${Date.now()}`, name: 'ens1f0', type: 'sfp', speed: '10G', role: 'bond0_slave', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-p4-${Date.now()}`, name: 'ens1f1', type: 'sfp', speed: '10G', role: 'bond0_slave', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' }
      ];
      setFormData(prev => ({ ...prev, nics: preset }));
    } else if (presetType === 'esxi') {
      const preset = [
        { id: `nic-e1-${Date.now()}`, name: 'vmnic0', type: 'copper', speed: '1G', role: 'management', mac: '', ip: formData.ip, connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-e2-${Date.now()}`, name: 'vmnic1', type: 'copper', speed: '1G', role: 'vmotion', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-e3-${Date.now()}`, name: 'vmnic2', type: 'sfp', speed: '10G', role: 'vSwitch0_uplink', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' },
        { id: `nic-e4-${Date.now()}`, name: 'vmnic3', type: 'sfp', speed: '10G', role: 'vSwitch0_uplink', mac: '', ip: '', connectedSwitchId: switches[0]?.id || '', connectedPortId: '' }
      ];
      setFormData(prev => ({ ...prev, nics: preset }));
    }
  };

  // Bridge Handlers
  const handleAddBridge = () => {
    const newBr = {
      id: `br-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `vmbr${formData.bridges.length}`,
      type: 'Linux Bridge (VLAN-aware)',
      slaves: [],
      description: 'Виртуальный свитч для трафика ВМ с поддержкой 802.1Q'
    };
    setFormData(prev => ({ ...prev, bridges: [...prev.bridges, newBr] }));
  };

  const handleUpdateBridge = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.bridges];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, bridges: updated };
    });
  };

  const handleToggleBridgeSlave = (bridgeIndex, nicName) => {
    setFormData(prev => {
      const updated = [...prev.bridges];
      const currentSlaves = updated[bridgeIndex].slaves || [];
      const has = currentSlaves.includes(nicName);
      updated[bridgeIndex] = {
        ...updated[bridgeIndex],
        slaves: has ? currentSlaves.filter(s => s !== nicName) : [...currentSlaves, nicName]
      };
      return { ...prev, bridges: updated };
    });
  };

  const handleDeleteBridge = (index) => {
    setFormData(prev => ({
      ...prev,
      bridges: prev.bridges.filter((_, idx) => idx !== index)
    }));
  };

  const handleApplyPresetBridges = (presetType) => {
    if (presetType === 'proxmox') {
      const preset = [
        { id: `br-b1-${Date.now()}`, name: 'bond0', type: 'LACP (802.3ad)', slaves: ['ens1f0', 'ens1f1'], description: 'Агрегированный транк 20G LACP к портам коммутатора ядра' },
        { id: `br-v1-${Date.now()}`, name: 'vmbr0', type: 'Linux Bridge (VLAN-aware)', slaves: ['bond0'], description: 'Виртуальный свитч для ВМ с поддержкой VLAN 1..4094' }
      ];
      setFormData(prev => ({ ...prev, bridges: preset }));
    } else if (presetType === 'esxi') {
      const preset = [
        { id: `br-esx-${Date.now()}`, name: 'vSwitch0', type: 'VMware Standard vSwitch', slaves: ['vmnic2', 'vmnic3'], description: 'Стандартный vSwitch с аплинками 10G и Port Groups' }
      ];
      setFormData(prev => ({ ...prev, bridges: preset }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('Укажите имя сервера');
      return;
    }

    try {
      setIsSubmitting(true);
      if (isEditing) {
        await api.updateServer(server.id, formData);
        toast.success(`Сервер «${formData.name}» обновлен`);
      } else {
        await api.createServer(formData);
        toast.success(`Сервер «${formData.name}» создан`);
      }
      onSaved();
    } catch (err) {
      toast.error(`Ошибка сохранения: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `Редактирование: ${server.name}` : 'Добавление сервера / гипервизора'}
              </h2>
              <p className="text-xs text-slate-400">
                Параметры хоста, размещение в стойке, сетевые карты и виртуальные мосты
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={`px-5 pt-3 border-b flex items-center gap-2 overflow-x-auto ${
          isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 border-b-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Параметры & Стойка</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('nics')}
            className={`pb-2.5 px-3 border-b-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'nics'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cable className="w-4 h-4" />
            <span>Сетевые порты ({formData.nics.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bridges')}
            className={`pb-2.5 px-3 border-b-2 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'bridges'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Виртуальные свитчи & Бонды ({formData.bridges.length})</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: GENERAL & RACK SPECS */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Имя сервера (Short Name) *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="pve-node-01"
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">FQDN / Hostname</label>
                  <input
                    type="text"
                    value={formData.hostname}
                    onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                    placeholder="pve01.corp.local"
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Производитель</label>
                  <select
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  >
                    {VENDOR_OPTIONS.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Модель сервера</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="PowerEdge R740 / ProLiant DL380"
                    className={`w-full h-9 px-3 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Тип узла</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  >
                    {SERVER_TYPES.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">ОС / Платформа</label>
                  <input
                    type="text"
                    value={formData.os}
                    onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                    placeholder="Proxmox VE 8.2 / ESXi 8.0"
                    className={`w-full h-9 px-3 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">IP управления (Management)</label>
                  <input
                    type="text"
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    placeholder="192.168.10.50"
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">MAC управления / IPMI</label>
                  <input
                    type="text"
                    value={formData.mac}
                    onChange={(e) => setFormData({ ...formData, mac: e.target.value })}
                    placeholder="14:18:77:22:99:B0"
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Rack Unit Placement */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-800/40">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Стойка / Шкаф</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Серверная 1, Стойка 1"
                    className={`w-full h-9 px-3 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Unit в стойке (1-42)</label>
                  <input
                    type="number"
                    min="1"
                    max="42"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Высота в юнитах</label>
                  <select
                    value={formData.unitHeight}
                    onChange={(e) => setFormData({ ...formData, unitHeight: e.target.value })}
                    className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  >
                    <option value="1">1U (Тонкий сервер)</option>
                    <option value="2">2U (Стандартный 2-сокетный)</option>
                    <option value="3">3U (Плотная СХД)</option>
                    <option value="4">4U (СХД / 4-сокетный)</option>
                  </select>
                </div>
              </div>

              {/* Hardware Specs */}
              <div className="space-y-3 pt-2 border-t border-slate-800/40">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Процессоры (CPU)</label>
                  <input
                    type="text"
                    value={formData.cpu}
                    onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
                    placeholder="2x Intel Xeon Gold 6248R (48c/96t)"
                    className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Оперативная память (RAM)</label>
                    <input
                      type="text"
                      value={formData.ram}
                      onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                      placeholder="256 GB ECC DDR4"
                      className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                        isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Дисковое пространство</label>
                    <input
                      type="text"
                      value={formData.storage}
                      onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                      placeholder="8x 1.92TB NVMe RAID10"
                      className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                        isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Инженерные заметки</label>
                  <textarea
                    rows="2"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="LACP bond0 к ядру CRS326, репликация Proxmox ZFS..."
                    className={`w-full p-2.5 rounded-xl border outline-none resize-none ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NETWORK INTERFACES (NICs) */}
          {activeTab === 'nics' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/40">
                <div className="text-xs text-slate-400">
                  Учет физических сетевых интерфейсов и прямое подключение к портам коммутатора:
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPresetNics('proxmox')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    + Шаблон Proxmox (2×1G + 2×10G)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetNics('esxi')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    + Шаблон ESXi (vmnic0..3)
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNic}
                    className="h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить порт</span>
                  </button>
                </div>
              </div>

              {formData.nics.length === 0 ? (
                <div className={`p-8 text-center border border-dashed rounded-xl ${
                  isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900/30'
                }`}>
                  <Cable className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">На сервере пока не зарегистрировано сетевых интерфейсов.</p>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetNics('proxmox')}
                    className="mt-2 text-xs text-blue-500 hover:underline font-medium cursor-pointer"
                  >
                    Создать типовой набор интерфейсов (eno1, eno2, ens1f0, ens1f1)
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.nics.map((nic, idx) => {
                    const selectedSwitch = switches.find(s => s.id === nic.connectedSwitchId);

                    return (
                      <div
                        key={nic.id || idx}
                        className={`p-3 rounded-xl border transition-colors ${
                          isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-950/80 border-slate-800'
                        }`}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-center">
                          {/* NIC Name */}
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Имя порта</label>
                            <input
                              type="text"
                              required
                              value={nic.name}
                              onChange={(e) => handleUpdateNic(idx, 'name', e.target.value)}
                              placeholder="eno1 / vmnic0"
                              className={`w-full h-8 px-2 rounded-lg border outline-none font-mono text-xs ${
                                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            />
                          </div>

                          {/* Type */}
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Тип</label>
                            <select
                              value={nic.type || 'copper'}
                              onChange={(e) => handleUpdateNic(idx, 'type', e.target.value)}
                              className={`w-full h-8 px-2 rounded-lg border outline-none text-xs cursor-pointer ${
                                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            >
                              <option value="copper">RJ-45 (Медь)</option>
                              <option value="sfp">SFP+ (Оптика / DAC)</option>
                            </select>
                          </div>

                          {/* Speed */}
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Скорость</label>
                            <select
                              value={nic.speed || '1G'}
                              onChange={(e) => handleUpdateNic(idx, 'speed', e.target.value)}
                              className={`w-full h-8 px-2 rounded-lg border outline-none text-xs cursor-pointer font-mono ${
                                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            >
                              <option value="1G">1 Gbps</option>
                              <option value="2.5G">2.5 Gbps</option>
                              <option value="10G">10 Gbps</option>
                              <option value="25G">25 Gbps</option>
                              <option value="40G">40 Gbps</option>
                            </select>
                          </div>

                          {/* Role */}
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Роль</label>
                            <input
                              type="text"
                              value={nic.role || ''}
                              onChange={(e) => handleUpdateNic(idx, 'role', e.target.value)}
                              placeholder="management / bond0_slave"
                              className={`w-full h-8 px-2 rounded-lg border outline-none text-xs ${
                                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            />
                          </div>

                          {/* Connected Switch */}
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Коммутатор</label>
                            <select
                              value={nic.connectedSwitchId || ''}
                              onChange={(e) => handleUpdateNic(idx, 'connectedSwitchId', e.target.value)}
                              className={`w-full h-8 px-2 rounded-lg border outline-none text-xs cursor-pointer ${
                                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                              }`}
                            >
                              <option value="">(Не подключен)</option>
                              {switches.map(sw => (
                                <option key={sw.id} value={sw.id}>
                                  {sw.name} ({sw.ip || sw.model})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Connected Port & Delete button */}
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1">
                              <label className="block text-[10px] text-slate-400 mb-0.5">Порт коммутатора</label>
                              <select
                                value={nic.connectedPortId || ''}
                                onChange={(e) => handleUpdateNic(idx, 'connectedPortId', e.target.value)}
                                disabled={!nic.connectedSwitchId}
                                className={`w-full h-8 px-2 rounded-lg border outline-none text-xs cursor-pointer font-mono disabled:opacity-40 ${
                                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                                }`}
                              >
                                <option value="">(Выберите порт)</option>
                                {selectedSwitch?.ports?.map(p => (
                                  <option key={p.id} value={p.id || p.number}>
                                    {p.name || `Порт ${p.number}`} {p.connectedTo ? `[${p.connectedTo}]` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteNic(idx)}
                              className="mt-4 p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                              title="Удалить интерфейс"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BRIDGES & BONDS */}
          {activeTab === 'bridges' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/40">
                <div className="text-xs text-slate-400">
                  Виртуальные коммутаторы hypervisor (Linux Bridge, vSwitch) и агрегация каналов (LACP Bond):
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPresetBridges('proxmox')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    + Шаблон Proxmox (bond0 + vmbr0)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetBridges('esxi')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    + Шаблон ESXi (vSwitch0)
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBridge}
                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить мост / свитч</span>
                  </button>
                </div>
              </div>

              {formData.bridges.length === 0 ? (
                <div className={`p-8 text-center border border-dashed rounded-xl ${
                  isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900/30'
                }`}>
                  <Layers className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Виртуальные коммутаторы и транки не настроены.</p>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetBridges('proxmox')}
                    className="mt-2 text-xs text-indigo-500 hover:underline font-medium cursor-pointer"
                  >
                    Создать типовой vmbr0 (Linux Bridge VLAN-aware) с агрегацией bond0
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.bridges.map((br, idx) => (
                    <div
                      key={br.id || idx}
                      className={`p-3.5 rounded-xl border transition-colors ${
                        isLight ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-indigo-500">#{idx + 1}</span>
                          <input
                            type="text"
                            required
                            value={br.name}
                            onChange={(e) => handleUpdateBridge(idx, 'name', e.target.value)}
                            placeholder="vmbr0 / bond0"
                            className={`h-8 px-2 rounded-lg border outline-none font-mono text-xs font-bold ${
                              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                            }`}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteBridge(idx)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                          title="Удалить мост"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Тип виртуального интерфейса</label>
                          <select
                            value={br.type}
                            onChange={(e) => handleUpdateBridge(idx, 'type', e.target.value)}
                            className={`w-full h-8 px-2 rounded-lg border outline-none text-xs cursor-pointer ${
                              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                            }`}
                          >
                            <option value="Linux Bridge (VLAN-aware)">Linux Bridge (VLAN-aware 802.1Q)</option>
                            <option value="LACP (802.3ad)">LACP Bond (802.3ad Динамическая агрегация)</option>
                            <option value="Active-Backup (mode 1)">Active-Backup Bond (mode 1 Отказоустойчивость)</option>
                            <option value="VMware Standard vSwitch">VMware Standard vSwitch</option>
                            <option value="VMware Distributed Switch (vDS)">VMware Distributed Switch (vDS)</option>
                            <option value="Hyper-V Virtual Switch">Hyper-V Virtual Switch</option>
                            <option value="Open vSwitch (OVS)">Open vSwitch (OVS Bridge)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Назначение / Описание</label>
                          <input
                            type="text"
                            value={br.description || ''}
                            onChange={(e) => handleUpdateBridge(idx, 'description', e.target.value)}
                            placeholder="Транк для виртуальных машин VLAN 10, 20, 100"
                            className={`w-full h-8 px-2 rounded-lg border outline-none text-xs ${
                              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Slave Ports Selection Chips */}
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Физические порты (Slaves / Uplinks) для этого моста:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {formData.nics.length === 0 ? (
                            <span className="text-[11px] text-slate-500 italic">Сначала добавьте сетевые порты на вкладке «Сетевые порты»</span>
                          ) : (
                            formData.nics.map(n => {
                              const isChecked = (br.slaves || []).includes(n.name);
                              return (
                                <button
                                  type="button"
                                  key={n.name}
                                  onClick={() => handleToggleBridgeSlave(idx, n.name)}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                                    isChecked
                                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-xs font-bold'
                                      : isLight
                                      ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                                  }`}
                                >
                                  {isChecked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-50" />}
                                  <span>{n.name}</span>
                                  <span className="text-[9px] opacity-75">({n.speed || '1G'})</span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className={`pt-4 border-t flex items-center justify-between gap-2.5 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <div className="text-[11px] text-slate-500">
              * IP и ВМ хоста автоматически синхронизируются с базой IPAM
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`h-9 px-4 rounded-xl border text-xs font-medium cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                {isSubmitting ? 'Сохранение...' : (isEditing ? 'Обновить сервер' : 'Создать сервер')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- VM EDIT MODAL ---
function VmEditModal({ server, vm, vlans = [], onClose, onSaved, theme = 'dark' }) {
  const isLight = theme === 'light';
  const toast = useToast();
  const isEditing = Boolean(vm);

  const [formData, setFormData] = useState({
    vmid: vm?.vmid || Math.floor(100 + Math.random() * 900),
    name: vm?.name || '',
    os: vm?.os || 'Ubuntu 24.04 LTS',
    ip: vm?.ip || '',
    mac: vm?.mac || '',
    vlan: vm?.vlan || (vlans[0]?.id || 1),
    bridge: vm?.bridge || (server.bridges?.[0]?.name || 'vmbr0'),
    cores: vm?.cores || 4,
    ram: vm?.ram || '8 GB',
    disk: vm?.disk || '100 GB',
    status: vm?.status || 'running',
    role: vm?.role || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGenerateMac = () => {
    const isVmware = (server?.os || '').toLowerCase().includes('esxi') || (server?.os || '').toLowerCase().includes('vmware');
    const prefix = isVmware ? '00:50:56' : 'BC:24:11';
    const randByte = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const mac = `${prefix}:${randByte()}:${randByte()}:${randByte()}`;
    setFormData(prev => ({ ...prev, mac }));
  };

  const selectedVlanInfo = vlans.find(v => Number(v.id) === Number(formData.vlan));

  // Server bridges list
  const availableBridges = (server.bridges || []).map(b => b.name);
  if (!availableBridges.includes('vmbr0') && !availableBridges.includes('vSwitch0')) {
    availableBridges.unshift('vmbr0');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.warning('Укажите имя виртуальной машины');
      return;
    }

    try {
      setIsSubmitting(true);
      if (isEditing) {
        await api.updateVm(server.id, vm.vmid, formData);
        toast.success(`ВМ «${formData.name}» обновлена`);
      } else {
        await api.addVm(server.id, formData);
        toast.success(`ВМ «${formData.name}» создана`);
      }
      onSaved();
    } catch (err) {
      toast.error(`Ошибка сохранения ВМ: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `ВМ #${vm.vmid}: ${vm.name}` : `Новая ВМ на "${server.name}"`}
              </h2>
              <p className="text-xs text-slate-400">
                Привязка к VLAN, виртуальному мосту ({server.os || 'Hypervisor'}) и IPAM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-3.5 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">VMID *</label>
              <input
                type="number"
                required
                value={formData.vmid}
                onChange={(e) => setFormData({ ...formData, vmid: e.target.value })}
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-400 font-medium mb-1">Имя ВМ / Hostname *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="dc01.corp.local"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Назначение / Роль</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Active Directory Domain Controller / 1C / АТС Asterisk"
              className={`w-full h-9 px-3 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Операционная система</label>
              <input
                type="text"
                value={formData.os}
                onChange={(e) => setFormData({ ...formData, os: e.target.value })}
                placeholder="Ubuntu 24.04 / Windows Server"
                className={`w-full h-9 px-3 rounded-xl border outline-none ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">VLAN (Сегмент сети)</label>
              <select
                value={formData.vlan}
                onChange={(e) => setFormData({ ...formData, vlan: Number(e.target.value) })}
                className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.id}>
                    VLAN {v.id} — {v.name} ({v.subnet || 'нет подсети'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected VLAN info card */}
          {selectedVlanInfo && (
            <div
              className="p-2.5 rounded-xl border flex items-center justify-between text-[11px]"
              style={{
                backgroundColor: `${selectedVlanInfo.color}12`,
                borderColor: `${selectedVlanInfo.color}35`
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedVlanInfo.color }} />
                <span className="font-semibold" style={{ color: selectedVlanInfo.color }}>
                  VLAN {selectedVlanInfo.id}: {selectedVlanInfo.name}
                </span>
              </div>
              <div className="font-mono text-slate-400">
                Подсеть: {selectedVlanInfo.subnet || '—'} {selectedVlanInfo.gateway ? `• Шлюз: ${selectedVlanInfo.gateway}` : ''}
              </div>
            </div>
          )}

          {/* IP and MAC */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">IP-адрес ВМ (синхронизируется в IPAM)</label>
              <input
                type="text"
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                placeholder="192.168.100.10"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400 font-medium">MAC-адрес</label>
                <button
                  type="button"
                  onClick={handleGenerateMac}
                  className="text-[10px] text-indigo-400 hover:underline cursor-pointer"
                  title="Сгенерировать валидный MAC для виртуальной машины"
                >
                  ⚡ Сгенерировать MAC
                </button>
              </div>
              <input
                type="text"
                value={formData.mac}
                onChange={(e) => setFormData({ ...formData, mac: e.target.value })}
                placeholder="00:50:56:B2:10:01"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          {/* Bridge with chips */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Виртуальный мост / Bridge (vSwitch)
            </label>
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="text"
                value={formData.bridge}
                onChange={(e) => setFormData({ ...formData, bridge: e.target.value })}
                placeholder="vmbr0 / vSwitch0"
                className={`flex-1 h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
            {availableBridges.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500">Мосты хоста:</span>
                {availableBridges.map(bName => (
                  <button
                    type="button"
                    key={bName}
                    onClick={() => setFormData({ ...formData, bridge: bName })}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono border cursor-pointer ${
                      formData.bridge === bName
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                        : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {bName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compute Resources */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">vCPU Cores</label>
              <input
                type="number"
                min="1"
                value={formData.cores}
                onChange={(e) => setFormData({ ...formData, cores: e.target.value })}
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">RAM</label>
              <input
                type="text"
                value={formData.ram}
                onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                placeholder="16 GB"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Диск</label>
              <input
                type="text"
                value={formData.disk}
                onChange={(e) => setFormData({ ...formData, disk: e.target.value })}
                placeholder="120 GB"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Статус ВМ</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <option value="running">Запущена (Running)</option>
              <option value="stopped">Остановлена (Stopped)</option>
            </select>
          </div>

          <div className={`pt-4 border-t flex items-center justify-between gap-2.5 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <div className="text-[10px] text-slate-500">
              * IP-адрес ВМ будет автоматически привязан к подсети IPAM
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`h-9 px-4 rounded-xl border text-xs font-medium cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                {isSubmitting ? 'Сохранение...' : (isEditing ? 'Обновить ВМ' : 'Создать ВМ')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
