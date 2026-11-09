import React, { useState, useMemo } from 'react';
import { PortItem } from './PortItem';
import { VlanBadge } from './VlanBadge';
import { PortTable } from './PortTable';
import { BatchPortActionBar } from './BatchPortActionBar';
import { PortProfileModal } from './PortProfileModal';
import { checkVlanMismatch } from '../utils/vlanMismatch';
import {
  Server,
  Zap,
  CheckSquare,
  Edit,
  Trash2,
  MapPin,
  Globe,
  Sliders,
  Sparkles,
  Link as LinkIcon,
  AlertTriangle,
  Terminal,
  LayoutGrid,
  Table as TableIcon,
  Radio,
  Tag,
  Flame,
  Activity,
  RefreshCw,
  Play,
  Pause,
  Thermometer,
  Cpu,
  LineChart,
  TrendingUp,
  X,
  GitCompare,
  Wrench
} from 'lucide-react';
import { api } from '../api';

export function SwitchFaceplate({
  switchData,
  allSwitches = [],
  vlans = [],
  ipAllocations = [],
  servers = [],
  onOpenPortDrawer,
  onEditSwitch,
  onDeleteSwitch,
  onJumpToPeer,
  onOpenConfigModal,
  onOpenBackupModal,
  onOpenMacDiscovery,
  onOpenWebSsh,
  onOpenTroubleshoot,
  onBackToList,
  onReloadData,
  theme = 'dark'
}) {
  const [activeTab, setActiveTab] = useState('faceplate'); // 'faceplate' or 'table'
  const [highlightVlanId, setHighlightVlanId] = useState(null);
  const [selectedPortIds, setSelectedPortIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [lastSelectedPortId, setLastSelectedPortId] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [showCableTags, setShowCableTags] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState('none'); // 'none' | 'poe' | 'speed'

  // Live SNMP Telemetry & Monitoring state
  const [telemetry, setTelemetry] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isAutoPoll, setIsAutoPoll] = useState(false);
  const [pollError, setPollError] = useState(null);
  const [showSparklines, setShowSparklines] = useState(false);
  const [trafficHistory, setTrafficHistory] = useState({}); // portNumber -> [{ time, rxMbps, txMbps }]
  const [selectedChartPort, setSelectedChartPort] = useState(null); // port object for deep inspection modal

  // Manual & Auto SNMP Polling
  const handlePollTelemetry = async () => {
    setIsPolling(true);
    setPollError(null);
    try {
      const data = await api.pollSwitchTelemetry(switchData.id);
      setTelemetry(data);

      // Record traffic history points for sparklines & detailed charts (keep last 12 samples)
      if (data?.ports) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setTrafficHistory(prev => {
          const next = { ...prev };
          data.ports.forEach(p => {
            const history = next[p.number] ? [...next[p.number]] : [];
            history.push({
              time: timeStr,
              rxMbps: p.rxMbps || 0,
              txMbps: p.txMbps || 0,
              inErrors: p.inErrors || 0
            });
            if (history.length > 15) history.shift();
            next[p.number] = history;
          });
          return next;
        });
      }
    } catch (err) {
      setPollError(err.message);
    } finally {
      setIsPolling(false);
    }
  };

  // Auto-polling interval
  React.useEffect(() => {
    let timer = null;
    if (isAutoPoll) {
      handlePollTelemetry();
      timer = setInterval(() => {
        handlePollTelemetry();
      }, 5000); // Poll every 5 seconds for live LED blinking and traffic flow
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAutoPoll, switchData?.id]);

  // Lookup map: portNumber -> live telemetry record
  const portTelemetryMap = useMemo(() => {
    const map = {};
    if (telemetry?.ports) {
      telemetry.ports.forEach(p => {
        map[p.number] = p;
      });
    }
    return map;
  }, [telemetry]);

  // Map VLAN by ID
  const vlanMap = useMemo(() => {
    const map = {};
    vlans.forEach(v => {
      map[v.id] = v;
    });
    return map;
  }, [vlans]);

  // Map switches by ID for peer lookups
  const switchesMap = useMemo(() => {
    const map = {};
    allSwitches.forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [allSwitches]);

  const ports = switchData?.ports || [];
  const copperPorts = ports.filter(p => p.type !== 'sfp');
  const sfpPorts = ports.filter(p => p.type === 'sfp');

  // Support 1-row or standard 2-row layout
  const isOneRow = switchData?.portLayout === '1-row';
  const topRowPorts = isOneRow ? copperPorts : copperPorts.filter((_, idx) => idx % 2 === 0);
  const bottomRowPorts = isOneRow ? [] : copperPorts.filter((_, idx) => idx % 2 === 1);

  // SFP rows
  const sfpTopRow = isOneRow ? sfpPorts : sfpPorts.filter((_, idx) => idx % 2 === 0);
  const sfpBottomRow = isOneRow ? [] : sfpPorts.filter((_, idx) => idx % 2 === 1);

  // Stats & Mismatch calculation
  const stats = useMemo(() => {
    let access = 0;
    let trunk = 0;
    let disabled = 0;
    let poe = 0;
    let poeUsedWatts = 0;
    let linked = 0;
    let mismatches = 0;

    ports.forEach(p => {
      if (p.mode === 'access') access++;
      else if (p.mode === 'trunk') trunk++;
      else if (p.mode === 'disabled' || !p.enabled) disabled++;
      if (p.poe) {
        poe++;
        poeUsedWatts += p.poeWatts || 15.4;
      }

      if (p.linkedSwitchId) {
        linked++;
        const peerSw = switchesMap[p.linkedSwitchId];
        const peerP = peerSw?.ports?.find(prt => prt.id === p.linkedPortId || prt.number === p.linkedPortId);
        if (peerP) {
          const res = checkVlanMismatch(p, peerP);
          if (res?.hasMismatch) mismatches++;
        }
      }
    });

    const maxPoeBudget = switchData.poeBudget || (copperPorts.length >= 48 ? 740 : copperPorts.length >= 24 ? 370 : 150);

    return { access, trunk, disabled, poe, poeUsedWatts: Math.round(poeUsedWatts), maxPoeBudget, linked, mismatches, total: ports.length };
  }, [ports, switchesMap, switchData, copperPorts]);

  // Selection handlers
  const handleToggleSelect = (portId, options = {}) => {
    if (options.shiftKey && lastSelectedPortId && lastSelectedPortId !== portId) {
      const pIdx1 = ports.findIndex(p => p.id === lastSelectedPortId);
      const pIdx2 = ports.findIndex(p => p.id === portId);
      if (pIdx1 !== -1 && pIdx2 !== -1) {
        const start = Math.min(pIdx1, pIdx2);
        const end = Math.max(pIdx1, pIdx2);
        const rangeIds = ports.slice(start, end + 1).map(p => p.id);
        setSelectedPortIds(prev => Array.from(new Set([...prev, ...rangeIds])));
        setLastSelectedPortId(portId);
        return;
      }
    }

    setLastSelectedPortId(portId);
    setSelectedPortIds(prev =>
      prev.includes(portId) ? prev.filter(id => id !== portId) : [...prev, portId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPortIds(ports.map(p => p.id));
  };

  const handleSelectRange = (startNum, endNum) => {
    const rangeIds = ports
      .filter(p => p.number >= startNum && p.number <= endNum)
      .map(p => p.id);
    setSelectedPortIds(rangeIds);
  };

  const handleSelectSfp = () => {
    const sfpIds = ports.filter(p => p.type === 'sfp').map(p => p.id);
    setSelectedPortIds(sfpIds);
  };

  const handleSelectPoe = () => {
    const poeIds = ports.filter(p => p.poe).map(p => p.id);
    setSelectedPortIds(poeIds);
  };

  const handleSelectDisabled = () => {
    const offIds = ports.filter(p => p.enabled === false || p.mode === 'disabled').map(p => p.id);
    setSelectedPortIds(offIds);
  };

  const handleClearSelection = () => {
    setSelectedPortIds([]);
    setLastSelectedPortId(null);
    setSelectionMode(false);
  };

  const handleBatchEdit = () => {
    const selectedPorts = ports.filter(p => selectedPortIds.includes(p.id));
    onOpenPortDrawer(selectedPorts);
  };

  // Group copper ports according to custom portLayout & portsPerGroup
  const layoutMode = switchData?.portLayout || '2-rows';
  const configuredGroupSize = parseInt(switchData?.portsPerGroup) || (copperPorts.length >= 48 ? 12 : 8);
  const groupSize = layoutMode === 'blocks-4' ? 4 : (layoutMode === 'blocks-8' ? 8 : configuredGroupSize);
  const numGroups = layoutMode === '1-row' 
    ? 1 
    : Math.ceil(topRowPorts.length / Math.max(1, Math.floor(groupSize / 2)));

  const isLight = theme === 'light';

  if (!switchData) return null;

  return (
    <div className="space-y-6">
      {/* Switch Header Card */}
      <div className={`border rounded-2xl p-5 shadow-xl transition-colors ${
        isLight
          ? 'bg-white border-slate-200 text-slate-800'
          : 'bg-slate-900/90 border-slate-800 text-slate-100 backdrop-blur-md'
      }`}>
        {/* Breadcrumbs Navigation */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3 select-none flex-wrap">
          <button
            onClick={() => onBackToList?.()}
            className="hover:text-blue-500 font-medium flex items-center gap-1 cursor-pointer transition-colors"
            title="Вернуться к списку коммутаторов"
          >
            <span>Коммутаторы</span>
          </button>
          <span>/</span>
          {switchData.location && (
            <>
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                {switchData.location}
              </span>
              <span>/</span>
            </>
          )}
          <span className="font-bold text-slate-900 dark:text-white font-mono">
            {switchData.name}
          </span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Switch Info */}
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl border shrink-0 ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-linear-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30 text-blue-400'
            }`}>
              <Server className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                  {switchData.name}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {switchData.vendor} {switchData.model}
                </span>
                {switchData.badge && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-white shadow-xs"
                    style={{ backgroundColor: switchData.color || '#3b82f6' }}
                  >
                    {switchData.badge}
                  </span>
                )}
                {switchData.ip && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {switchData.ip}
                  </span>
                )}
                {switchData.snmpEnabled !== false ? (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1"
                    title={
                      switchData.snmpVersion === '3'
                        ? `SNMP v3 (USM: ${switchData.snmpV3User || 'admin'}, ${switchData.snmpV3SecurityLevel || 'authPriv'}, порт ${switchData.snmpPort || 161})`
                        : `SNMP v${switchData.snmpVersion || '2c'} (${switchData.snmpCommunity || 'public'}:${switchData.snmpPort || 161})`
                    }
                  >
                    <Activity className="w-3 h-3 text-blue-500" />
                    <span>
                      {switchData.snmpVersion === '3'
                        ? `SNMP v3: ${switchData.snmpV3User || 'admin'}`
                        : `SNMP: ${switchData.snmpCommunity || 'public'}`}
                    </span>
                  </span>
                ) : (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 flex items-center gap-1"
                    title="SNMP мониторинг отключен в параметрах коммутатора"
                  >
                    <Activity className="w-3 h-3 opacity-40" />
                    SNMP: Выкл
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                {switchData.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{switchData.location}</span>
                  </div>
                )}
                {switchData.mac && (
                  <div className="font-mono">
                    MAC: {switchData.mac}
                  </div>
                )}
                {switchData.notes && (
                  <div className="italic">
                    «{switchData.notes}»
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 self-stretch lg:self-center overflow-x-auto max-w-full pb-1 lg:pb-0 scrollbar-thin flex-nowrap sm:flex-wrap">
            {/* Live SNMP Polling Button */}
            <button
              onClick={() => {
                if (switchData.snmpEnabled === false) {
                  onEditSwitch?.(switchData);
                  return;
                }
                handlePollTelemetry();
              }}
              disabled={isPolling}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                switchData.snmpEnabled === false
                  ? 'bg-slate-500/10 text-slate-400 border-dashed border-slate-400/30 hover:border-slate-400'
                  : isPolling
                  ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse'
                  : telemetry?.online
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={
                switchData.snmpEnabled === false
                  ? 'SNMP отключен в настройках. Нажмите, чтобы открыть параметры коммутатора.'
                  : 'Выполнить мгновенный опрос коммутатора по SNMP (IF-MIB, статус портов, трафик)'
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`} />
              <span>{switchData.snmpEnabled === false ? 'SNMP выкл' : isPolling ? 'Опрос...' : 'Опрос SNMP'}</span>
            </button>

            {/* Auto-Poll Toggle */}
            <button
              onClick={() => {
                if (switchData.snmpEnabled === false) {
                  onEditSwitch?.(switchData);
                  return;
                }
                setIsAutoPoll(!isAutoPoll);
              }}
              disabled={switchData.snmpEnabled === false}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                switchData.snmpEnabled === false
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-slate-300 dark:border-slate-800'
                  : isAutoPoll
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title={switchData.snmpEnabled === false ? 'Включите SNMP в свойствах коммутатора' : 'Периодический авто-опрос каждые 5 секунд'}
            >
              {isAutoPoll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isAutoPoll ? 'Авто: Вкл' : 'Авто 5с'}</span>
            </button>

            {onOpenMacDiscovery && (
              <button
                onClick={() => onOpenMacDiscovery(switchData)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  isLight
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                    : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
                }`}
                title="Live-опрос таблицы MAC-адресов (FDB Table) коммутатора"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live MAC</span>
              </button>
            )}
            {/* Live Web-SSH Terminal Button */}
            <button
              onClick={() => onOpenWebSsh && onOpenWebSsh(switchData)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isLight
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/30 shadow-xs'
              }`}
              title="Открыть интерактивный Web-SSH терминал (RouterOS / SNR / UniFi CLI)"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Web-SSH</span>
            </button>

            {/* Intelligent Network Troubleshooter Button */}
            <button
              onClick={() => onOpenTroubleshoot && onOpenTroubleshoot(switchData.id)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/30 shadow-xs'
              }`}
              title="Интеллектуальный траблшутер сетевых неполадок (L1-L4)"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>Траблшутер</span>
            </button>

            <button
              onClick={() => onOpenConfigModal(switchData)}
              className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isLight
                  ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
              }`}
              title="Сгенерировать команды настройки (MikroTik / SNR / Ubiquiti)"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>CLI Конфиг</span>
            </button>
            <button
              onClick={() => onOpenBackupModal && onOpenBackupModal(switchData)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isLight
                  ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                  : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
              }`}
              title="История версий, авто-бэкап по SSH и сравнение конфигураций (Diff)"
            >
              <GitCompare className="w-3.5 h-3.5 text-purple-400" />
              <span>Бэкапы & Diff</span>
            </button>
            <button
              onClick={() => onEditSwitch(switchData)}
              className={`h-9 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Параметры</span>
            </button>
            <button
              onClick={() => onDeleteSwitch(switchData.id)}
              className="h-9 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить</span>
            </button>
          </div>
        </div>

        {/* Live SNMP Telemetry Status Banner */}
        {telemetry && (
          <div className={`mt-4 p-3 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
            telemetry.online
              ? (isLight ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200')
              : (isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-500/30 text-amber-200')
          }`}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${telemetry.online ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'} ${isAutoPoll ? 'animate-pulse' : ''}`} />
                <span className="font-bold font-mono">
                  {telemetry.source === 'snmp-live' ? 'SNMP Физический (Live)' : 'SNMP (Симуляция / Демо)'}:
                </span>
                <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                  telemetry.source === 'snmp-live'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {telemetry.source === 'snmp-live' ? 'RFC 2863 IF-MIB' : 'ДЕМО-СИМУЛЯЦИЯ'}
                </span>
                {telemetry.rtt !== undefined && (
                  <span className="font-mono text-[11px] opacity-90">RTT: {telemetry.rtt}мс</span>
                )}
                {telemetry.uptime && (
                  <span className="font-mono text-[11px] opacity-90">• Uptime: {telemetry.uptime}</span>
                )}
              </div>

              {telemetry.metrics && (
                <div className="flex items-center gap-3 font-mono text-[11px] pl-2 border-l border-emerald-500/30">
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-blue-500" />
                    <span>CPU: <strong>{telemetry.metrics.cpuUsagePercent}%</strong></span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                    <span>Температура: <strong>{telemetry.metrics.temperatureC}°C</strong></span>
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Activity className="w-3.5 h-3.5" />
                    <span>Трафик: <strong>↓ {telemetry.metrics.totalInMbps} / ↑ {telemetry.metrics.totalOutMbps} Мбит/с</strong></span>
                  </span>
                  {telemetry.metrics.totalErrors > 0 && (
                    <span className="text-rose-500 font-bold">
                      Ошибки (CRC): {telemetry.metrics.totalErrors}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
              {new Date(telemetry.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}

        {/* SNMP Error Banner */}
        {pollError && (
          <div className="mt-4 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span><strong>Ошибка SNMP опроса:</strong> {pollError}</span>
            </div>
            <button
              onClick={() => onEditSwitch?.(switchData)}
              className="text-xs underline hover:text-white cursor-pointer ml-3 shrink-0"
            >
              Изменить настройки
            </button>
          </div>
        )}

        {/* Mismatch Alert Banner if any errors found */}
        {stats.mismatches > 0 && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between text-red-600 dark:text-red-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Внимание!</strong> Обнаружено расхождение VLAN на {stats.mismatches} {stats.mismatches === 1 ? 'связанном порту' : 'связанных портах'}. Наведите курсор на порт с мигающим значком ⚠️ для подробностей.
              </span>
            </div>
          </div>
        )}

        {/* Toolbar: Stats & Filters */}
        <div className={`mt-5 pt-4 border-t flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          {/* Stats Badges */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="text-slate-500 dark:text-slate-400">
              Портов: <strong className="font-mono text-slate-900 dark:text-white">{stats.total}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-blue-600 dark:text-blue-400">
              Access: <strong className="font-mono">{stats.access}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-purple-600 dark:text-purple-400">
              Trunk: <strong className="font-mono">{stats.trunk}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
              <LinkIcon className="w-3 h-3" />
              Линки: <strong className="font-mono">{stats.linked}</strong>
            </span>
            {stats.poe > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-amber-500 flex items-center gap-1.5 font-mono" title={`Использовано ${stats.poeUsedWatts} Вт из ${stats.maxPoeBudget} Вт PoE бюджета`}>
                  <Zap className="w-3 h-3 fill-amber-500" />
                  <span>PoE: <strong>{stats.poe}</strong>п ({stats.poeUsedWatts}/{stats.maxPoeBudget}W)</span>
                  <span className="inline-block w-12 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-amber-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.round((stats.poeUsedWatts / stats.maxPoeBudget) * 100))}%` }}
                    />
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Controls: VLAN Highlight & Batch select */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Highlight VLAN feature */}
            <div className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1 text-xs ${
              isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-500 dark:text-slate-400">Подсветить VLAN:</span>
              <select
                value={highlightVlanId === null ? '' : highlightVlanId}
                onChange={(e) => setHighlightVlanId(e.target.value === '' ? null : Number(e.target.value))}
                className="bg-transparent text-slate-800 dark:text-white font-mono text-xs focus:outline-hidden cursor-pointer"
              >
                <option value="" className={isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-300'}>-- Все порты --</option>
                {vlans.map((v) => (
                  <option key={v.id} value={v.id} className={isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-white'}>
                    VLAN {v.id} ({v.name})
                  </option>
                ))}
              </select>
              {highlightVlanId !== null && (
                <button
                  onClick={() => setHighlightVlanId(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-[11px] ml-1"
                  title="Сбросить подсветку"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Heatmap Overlay Selector */}
            <div className={`h-8 p-0.5 rounded-lg border flex items-center shrink-0 ${
              isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                type="button"
                onClick={() => setHeatmapMode('none')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  heatmapMode === 'none'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Стандартный режим (подсветка VLAN)"
              >
                VLAN
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeatmapMode('traffic');
                  if (!telemetry) handlePollTelemetry();
                }}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  heatmapMode === 'traffic'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Тепловая карта трафика портов (пульсация светодиодов: зеленый <10M, желтый 10-100M, оранжевый/красный >500M)"
              >
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                <span>Трафик (Pulse)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setHeatmapMode('poe');
                  if (!telemetry) handlePollTelemetry();
                }}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  heatmapMode === 'poe'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Тепловая карта PoE (нагрузка в Ваттах)"
              >
                <Zap className="w-3 h-3" />
                <span>PoE</span>
              </button>
              <button
                type="button"
                onClick={() => setHeatmapMode('speed')}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  heatmapMode === 'speed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Тепловая карта скорости портов (10G/1G/Down)"
              >
                <Activity className="w-3 h-3" />
                <span>Скорость</span>
              </button>
            </div>

            {/* Live Traffic Sparklines Toggle */}
            <button
              onClick={() => setShowSparklines(!showSparklines)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showSparklines
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : (isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300')
              }`}
              title="Показать мини-графики (Sparklines) загрузки трафика прямо над каждым портом фейсплейта"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{showSparklines ? 'Спарклайны: Вкл' : 'Спарклайны'}</span>
            </button>

            {/* Cable Tags Faceplate Toggle */}
            <button
              onClick={() => setShowCableTags(!showCableTags)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                showCableTags
                  ? 'bg-amber-600 text-white shadow-xs'
                  : (isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300')
              }`}
              title="Показать кабельные бирки с номерами розеток и линков прямо на портах"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{showCableTags ? 'Скрыть бирки' : 'Бирки кабелей'}</span>
            </button>

            {/* Batch Selection Toggle */}
            <button
              onClick={() => {
                const nextMode = !selectionMode;
                setSelectionMode(nextMode);
                if (!nextMode) setSelectedPortIds([]);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectionMode
                  ? 'bg-blue-600 text-white shadow-xs'
                  : (isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300')
              }`}
              title="Включить режим множественного выбора портов для пакетной настройки"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{selectionMode ? 'Выбор активен' : 'Мульти-выбор'}</span>
            </button>

            {selectionMode && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={handleSelectAll}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  Все ({ports.length})
                </button>
                {copperPorts.length >= 24 && (
                  <>
                    <button
                      onClick={() => handleSelectRange(1, 12)}
                      className={`px-2 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                        isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      1–12
                    </button>
                    <button
                      onClick={() => handleSelectRange(13, 24)}
                      className={`px-2 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                        isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      13–24
                    </button>
                  </>
                )}
                {copperPorts.length >= 48 && (
                  <button
                    onClick={() => handleSelectRange(25, 48)}
                    className={`px-2 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    25–48
                  </button>
                )}
                {sfpPorts.length > 0 && (
                  <button
                    onClick={handleSelectSfp}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    SFP ({sfpPorts.length})
                  </button>
                )}
                {switchData.poe && (
                  <button
                    onClick={handleSelectPoe}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer text-amber-400 ${
                      isLight ? 'bg-amber-100 hover:bg-amber-200' : 'bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40'
                    }`}
                  >
                    PoE
                  </button>
                )}
                <button
                  onClick={handleClearSelection}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  }`}
                >
                  Снять
                </button>

                {selectedPortIds.length > 0 && (
                  <>
                    <button
                      onClick={() => setIsProfileModalOpen(true)}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium shadow-xs cursor-pointer ml-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Профиль ({selectedPortIds.length})</span>
                    </button>
                    <button
                      onClick={handleBatchEdit}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-medium shadow-xs cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Детально</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Switcher: Faceplate vs Port Table */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab('faceplate')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'faceplate'
              ? 'bg-blue-600 text-white shadow-xs'
              : (isLight ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850')
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Лицевая панель (Faceplate)</span>
        </button>
        <button
          onClick={() => setActiveTab('table')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'table'
              ? 'bg-blue-600 text-white shadow-xs'
              : (isLight ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850')
          }`}
        >
          <TableIcon className="w-3.5 h-3.5" />
          <span>Кабельный журнал (Таблица портов)</span>
        </button>
      </div>

      {activeTab === 'table' ? (
        <PortTable
          switchData={switchData}
          allSwitches={allSwitches}
          vlans={vlans}
          ipAllocations={ipAllocations}
          servers={servers}
          selectedPortIds={selectedPortIds}
          onToggleSelectPort={handleToggleSelect}
          onSelectAllPorts={(ids) => setSelectedPortIds(ids)}
          onClearSelection={handleClearSelection}
          onOpenPortDrawer={onOpenPortDrawer}
          onJumpToPeer={onJumpToPeer}
          onReloadData={onReloadData}
          theme={theme}
        />
      ) : (
        <>
          {/* Mobile scroll hint */}
          <div className="lg:hidden flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-2 px-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Шасси 19" (960px)
            </span>
            <span className="text-[10px]">↔ Прокрутите для просмотра всех портов</span>
          </div>

          {/* Switch Physical 19" Rackmount Front Panel Chassis */}
          <div className="relative overflow-x-auto pb-4">
            <div className={`min-w-[960px] border-2 rounded-xl shadow-2xl p-4 flex items-center relative select-none transition-colors ${
              isLight
                ? 'bg-linear-to-b from-slate-200 via-slate-100 to-slate-200 border-slate-400'
                : 'bg-linear-to-b from-slate-900 via-slate-925 to-slate-950 border-slate-700/80'
            }`}>
          {/* Left Rack Ear (19" Mounting Wing) */}
          <div className={`w-10 h-36 border-r-2 rounded-l-lg flex flex-col justify-between items-center py-4 -ml-4 mr-4 shrink-0 shadow-inner ${
            isLight
              ? 'bg-linear-to-r from-slate-300 to-slate-200 border-slate-400'
              : 'bg-linear-to-r from-slate-800 to-slate-900 border-slate-700/70'
          }`}>
            <div className={`w-4 h-4 rounded-full border-2 shadow-inner flex items-center justify-center ${
              isLight ? 'border-slate-400 bg-slate-100' : 'border-slate-600 bg-slate-950'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-400' : 'bg-slate-700'}`} />
            </div>
            <div className={`w-4 h-4 rounded-full border-2 shadow-inner flex items-center justify-center ${
              isLight ? 'border-slate-400 bg-slate-100' : 'border-slate-600 bg-slate-950'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-400' : 'bg-slate-700'}`} />
            </div>
          </div>

          {/* Left Panel: Brand, Model, Chassis LEDs */}
          <div className={`w-44 pr-4 border-r shrink-0 flex flex-col justify-between h-32 ${
            isLight ? 'border-slate-300' : 'border-slate-800'
          }`}>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[13px] font-black uppercase tracking-wider font-mono ${
                  isLight ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  {switchData.vendor}
                </span>
                {switchData.badge && (
                  <span
                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm text-white shadow-xs"
                    style={{ backgroundColor: switchData.color || '#3b82f6' }}
                  >
                    {switchData.badge}
                  </span>
                )}
              </div>
              <div className={`text-[11px] font-semibold font-mono truncate ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>
                {switchData.model}
              </div>
            </div>

            {/* LED Status Indicators */}
            <div className={`grid grid-cols-2 gap-x-2 gap-y-1.5 p-2 rounded-md border ${
              isLight ? 'bg-white/80 border-slate-300' : 'bg-slate-950/80 border-slate-800/80'
            }`}>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>PWR</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>SYS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>SPEED</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${stats.poe > 0 ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : (isLight ? 'bg-slate-300' : 'bg-slate-700')}`} />
                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>PoE</span>
              </div>
            </div>

            {/* Management IP on faceplate */}
            <div className="text-[10px] font-mono text-slate-500 truncate">
              IP: {switchData.ip || 'DHCP'}
            </div>
          </div>

          {/* Central Section: Copper RJ-45 Port Grid */}
          <div className="flex-1 px-4 flex items-center gap-3">
            {Array.from({ length: numGroups }).map((_, groupIdx) => {
              const startIdx = groupIdx * (groupSize / 2);
              const endIdx = startIdx + (groupSize / 2);
              const groupTop = topRowPorts.slice(startIdx, endIdx);
              const groupBottom = bottomRowPorts.slice(startIdx, endIdx);

              return (
                <div
                  key={groupIdx}
                  className={`p-2 border rounded-lg flex flex-col gap-2 shrink-0 shadow-inner ${
                    isLight ? 'bg-white/80 border-slate-300' : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  {/* Top Row (Odd Ports) */}
                  <div className="flex items-center gap-1.5">
                    {groupTop.map(port => {
                      const peerSw = port.linkedSwitchId ? switchesMap[port.linkedSwitchId] : null;
                      const peerP = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);

                      return (
                        <PortItem
                          key={port.id}
                          port={port}
                          vlanMap={vlanMap}
                          isSelected={selectedPortIds.includes(port.id)}
                          onSelect={handleToggleSelect}
                          onOpenDetails={(p) => onOpenPortDrawer([p])}
                          highlightVlanId={highlightVlanId}
                          selectionMode={selectionMode}
                          showCableTags={showCableTags}
                          heatmapMode={heatmapMode}
                          liveTelemetry={portTelemetryMap[port.number]}
                          showSparklines={showSparklines}
                          trafficHistory={trafficHistory[port.number] || []}
                          onOpenChart={(p) => setSelectedChartPort(p)}
                          peerSwitch={peerSw}
                          peerPort={peerP}
                          onJumpToPeer={onJumpToPeer}
                          theme={theme}
                        />
                      );
                    })}
                  </div>

                  {/* Bottom Row (Even Ports) */}
                  {groupBottom.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {groupBottom.map(port => {
                        const peerSw = port.linkedSwitchId ? switchesMap[port.linkedSwitchId] : null;
                        const peerP = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);

                        return (
                          <PortItem
                            key={port.id}
                            port={port}
                            vlanMap={vlanMap}
                            isSelected={selectedPortIds.includes(port.id)}
                            onSelect={handleToggleSelect}
                            onOpenDetails={(p) => onOpenPortDrawer([p])}
                            highlightVlanId={highlightVlanId}
                            selectionMode={selectionMode}
                            showCableTags={showCableTags}
                            heatmapMode={heatmapMode}
                            liveTelemetry={portTelemetryMap[port.number]}
                            showSparklines={showSparklines}
                            trafficHistory={trafficHistory[port.number] || []}
                            onOpenChart={(p) => setSelectedChartPort(p)}
                            peerSwitch={peerSw}
                            peerPort={peerP}
                            onJumpToPeer={onJumpToPeer}
                            theme={theme}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Section: SFP / SFP+ Uplinks */}
          {sfpPorts.length > 0 && (
            <div className={`pl-4 border-l shrink-0 ${isLight ? 'border-slate-300' : 'border-slate-800'}`}>
              <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center mb-1">
                SFP / Uplinks
              </div>
              <div className={`p-2 border rounded-lg flex flex-col gap-2 shadow-inner ${
                isLight ? 'bg-white/80 border-slate-300' : 'bg-slate-950/70 border-slate-800'
              }`}>
                {/* SFP Top Row */}
                <div className="flex items-center gap-2">
                  {sfpTopRow.map(port => {
                    const peerSw = port.linkedSwitchId ? switchesMap[port.linkedSwitchId] : null;
                    const peerP = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);

                    return (
                      <PortItem
                        key={port.id}
                        port={port}
                        vlanMap={vlanMap}
                        isSelected={selectedPortIds.includes(port.id)}
                        onSelect={handleToggleSelect}
                        onOpenDetails={(p) => onOpenPortDrawer([p])}
                        highlightVlanId={highlightVlanId}
                        selectionMode={selectionMode}
                        showCableTags={showCableTags}
                        heatmapMode={heatmapMode}
                        liveTelemetry={portTelemetryMap[port.number]}
                        showSparklines={showSparklines}
                        trafficHistory={trafficHistory[port.number] || []}
                        onOpenChart={(p) => setSelectedChartPort(p)}
                        peerSwitch={peerSw}
                        peerPort={peerP}
                        onJumpToPeer={onJumpToPeer}
                        theme={theme}
                      />
                    );
                  })}
                </div>

                {/* SFP Bottom Row */}
                {sfpBottomRow.length > 0 && (
                  <div className="flex items-center gap-2">
                    {sfpBottomRow.map(port => {
                      const peerSw = port.linkedSwitchId ? switchesMap[port.linkedSwitchId] : null;
                      const peerP = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);

                      return (
                        <PortItem
                          key={port.id}
                          port={port}
                          vlanMap={vlanMap}
                          isSelected={selectedPortIds.includes(port.id)}
                          onSelect={handleToggleSelect}
                          onOpenDetails={(p) => onOpenPortDrawer([p])}
                          highlightVlanId={highlightVlanId}
                          selectionMode={selectionMode}
                          showCableTags={showCableTags}
                          heatmapMode={heatmapMode}
                          liveTelemetry={portTelemetryMap[port.number]}
                          showSparklines={showSparklines}
                          trafficHistory={trafficHistory[port.number] || []}
                          onOpenChart={(p) => setSelectedChartPort(p)}
                          peerSwitch={peerSw}
                          peerPort={peerP}
                          onJumpToPeer={onJumpToPeer}
                          theme={theme}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Rack Ear */}
          <div className={`w-10 h-36 border-l-2 rounded-r-lg flex flex-col justify-between items-center py-4 -mr-4 ml-4 shrink-0 shadow-inner ${
            isLight
              ? 'bg-linear-to-l from-slate-300 to-slate-200 border-slate-400'
              : 'bg-linear-to-l from-slate-800 to-slate-900 border-slate-700/70'
          }`}>
            <div className={`w-4 h-4 rounded-full border-2 shadow-inner flex items-center justify-center ${
              isLight ? 'border-slate-400 bg-slate-100' : 'border-slate-600 bg-slate-950'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-400' : 'bg-slate-700'}`} />
            </div>
            <div className={`w-4 h-4 rounded-full border-2 shadow-inner flex items-center justify-center ${
              isLight ? 'border-slate-400 bg-slate-100' : 'border-slate-600 bg-slate-950'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-slate-400' : 'bg-slate-700'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* HEATMAP & TRAFFIC PULSE LEGEND BANNER */}
      {heatmapMode === 'traffic' && (
        <div className={`p-4 rounded-xl border space-y-3 animate-in fade-in duration-200 ${
          isLight ? 'bg-rose-500/5 border-rose-300' : 'bg-slate-900/90 border-rose-500/30 shadow-xl'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Тепловая карта и пульсация трафика портов (Port Heatmap & Traffic Pulse)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAutoPoll(!isAutoPoll)}
                className={`h-7 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                  isAutoPoll
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isLight
                      ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {isAutoPoll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 text-emerald-400" />}
                <span>{isAutoPoll ? 'Авто-пульс активен (5с)' : 'Запустить живой авто-пульс'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 font-mono text-[11px]">
            {/* Level 0: Idle/Down */}
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <div>
                <div className="font-bold text-slate-400">0 Мбит/с</div>
                <div className="text-[10px] text-slate-500 font-sans">Линк выключен / Idle</div>
              </div>
            </div>

            {/* Level 1: Low Traffic */}
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
              <div>
                <div className="font-bold text-emerald-400">&lt; 10 Мбит/с</div>
                <div className="text-[10px] text-emerald-600/80 dark:text-emerald-300/70 font-sans">Низкая нагрузка (Зеленый)</div>
              </div>
            </div>

            {/* Level 2: Moderate Traffic */}
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_7px_#facc15] animate-ping" />
              <div>
                <div className="font-bold text-amber-400">10 – 100 Мбит/с</div>
                <div className="text-[10px] text-amber-600/80 dark:text-amber-300/70 font-sans">Средний трафик (Желтый)</div>
              </div>
            </div>

            {/* Level 3: High Traffic */}
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316] animate-ping" />
              <div>
                <div className="font-bold text-orange-400">100 – 500 Мбит/с</div>
                <div className="text-[10px] text-orange-600/80 dark:text-orange-300/70 font-sans">Высокая нагрузка (Оранжевый)</div>
              </div>
            </div>

            {/* Level 4: Peak Gigabit */}
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
              <div>
                <div className="font-bold text-rose-400">&gt; 500 Мбит/с (1G+)</div>
                <div className="text-[10px] text-rose-600/80 dark:text-rose-300/70 font-sans">Пиковая загрузка (Красный)</div>
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 font-sans border-t border-slate-800/60">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8] animate-pulse" />
                <span><strong>Синий LED (Правый):</strong> Активное PoE-питание (48V) с подачей ватт</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                <span><strong>Бирюзовый LED:</strong> Магистральный Uplink на другой свитч</span>
              </span>
            </div>
            <span className="text-slate-500">Наведите курсор на любой порт для детального счетчика Rx/Tx</span>
          </div>
        </div>
      )}

      {/* HEATMAP POE LEGEND BANNER */}
      {heatmapMode === 'poe' && (
        <div className={`p-4 rounded-xl border space-y-3 animate-in fade-in duration-200 ${
          isLight ? 'bg-amber-500/5 border-amber-300' : 'bg-slate-900/90 border-amber-500/30 shadow-xl'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Тепловая карта мощности PoE (Power over Ethernet)
              </span>
            </div>
            <span className="font-mono text-xs text-amber-400 font-bold">
              Суммарно: {stats.poeUsedWatts} Вт из {stats.maxPoeBudget} Вт ({Math.min(100, Math.round((stats.poeUsedWatts / stats.maxPoeBudget) * 100))}%)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <div>
                <div className="font-bold text-slate-400">0 Вт</div>
                <div className="text-[10px] text-slate-500 font-sans">PoE отключено / нет нагрузки</div>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
              <div>
                <div className="font-bold text-sky-400">&lt; 7 Вт</div>
                <div className="text-[10px] text-sky-600/80 dark:text-sky-300/70 font-sans">VoIP телефоны / датчики</div>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
              <div>
                <div className="font-bold text-amber-400">7 – 15.4 Вт</div>
                <div className="text-[10px] text-amber-600/80 dark:text-amber-300/70 font-sans">Стандарт 802.3af (IP-камеры)</div>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#ef4444]" />
              <div>
                <div className="font-bold text-rose-400">&gt; 15.4 Вт (до 30W+)</div>
                <div className="text-[10px] text-rose-600/80 dark:text-rose-300/70 font-sans">Стандарт 802.3at PoE+ (PTZ / Wi-Fi 6)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active VLANs Legend */}
      <div className={`border rounded-xl p-4 transition-colors ${
        isLight
          ? 'bg-white border-slate-200'
          : 'bg-slate-900/60 border-slate-800/80'
      }`}>
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
          <span>Используемые VLAN на этом коммутаторе</span>
          <span className="text-[11px] font-normal text-slate-500">
            Нажмите на VLAN для быстрой подсветки портов
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {vlans.map(vlan => {
            const isUsed = ports.some(p => p.pvid === vlan.id || (p.taggedVlans && p.taggedVlans.includes(vlan.id)));
            if (!isUsed) return null;

            const isSelected = highlightVlanId === vlan.id;

            return (
              <button
                key={vlan.id}
                type="button"
                onClick={() => setHighlightVlanId(isSelected ? null : vlan.id)}
                className={`transition-all rounded-lg cursor-pointer ${
                  isSelected ? 'ring-2 ring-amber-400 scale-105' : 'hover:scale-102 opacity-90 hover:opacity-100'
                }`}
              >
                <VlanBadge vlan={vlan} size="sm" />
              </button>
            );
          })}
        </div>
      </div>
      </>
      )}

      {/* Detailed Live Port Traffic Graph Modal */}
      {selectedChartPort && (
        <PortTrafficChartModal
          port={selectedChartPort}
          switchData={switchData}
          vlanMap={vlanMap}
          history={trafficHistory[selectedChartPort.number] || []}
          liveTelemetry={portTelemetryMap[selectedChartPort.number]}
          onClose={() => setSelectedChartPort(null)}
          theme={theme}
        />
      )}
      {/* Floating Bottom Action Bar for Multi-Select Ports */}
      <BatchPortActionBar
        switchData={switchData}
        allSwitches={allSwitches}
        selectedPortIds={selectedPortIds}
        ports={ports}
        vlans={vlans}
        ipAllocations={ipAllocations}
        servers={servers}
        onClearSelection={handleClearSelection}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        onOpenBatchDrawer={handleBatchEdit}
        onReloadData={onReloadData}
        theme={theme}
      />

      {/* Port Profile Preset Modal */}
      <PortProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        switchData={switchData}
        selectedPorts={ports.filter(p => selectedPortIds.includes(p.id))}
        vlans={vlans}
        onSuccess={async () => {
          if (onReloadData) await onReloadData();
          setSelectedPortIds([]);
        }}
        theme={theme}
      />
    </div>
  );
}

// Subcomponent: Detailed Live Port Traffic Graph & Telemetry Modal
function PortTrafficChartModal({
  port,
  switchData,
  vlanMap = {},
  history = [],
  liveTelemetry = null,
  onClose,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const nativeVlan = vlanMap[port.pvid] || { id: port.pvid, name: `VLAN ${port.pvid}` };

  const [remoteHistory, setRemoteHistory] = useState(history || []);

  useEffect(() => {
    let isSubscribed = true;
    const fetchRemote = async () => {
      if (!switchData?.id || port?.number === undefined) return;
      try {
        const data = await api.getPortTelemetryHistory(switchData.id, port.number);
        if (isSubscribed && Array.isArray(data) && data.length > 0) {
          setRemoteHistory(data);
        }
      } catch (e) {}
    };
    fetchRemote();
    const interval = setInterval(fetchRemote, 5000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [switchData?.id, port?.number]);

  const activeHistory = remoteHistory.length > 0 ? remoteHistory : history;

  // Calculate stats from history
  const samples = activeHistory.length > 0 ? activeHistory : [
    { time: '12:00:00', rxMbps: (liveTelemetry?.rxMbps || 12.4) * 0.4, txMbps: (liveTelemetry?.txMbps || 8.1) * 0.3 },
    { time: '12:00:05', rxMbps: (liveTelemetry?.rxMbps || 12.4) * 0.7, txMbps: (liveTelemetry?.txMbps || 8.1) * 0.6 },
    { time: '12:00:10', rxMbps: (liveTelemetry?.rxMbps || 12.4) * 0.5, txMbps: (liveTelemetry?.txMbps || 8.1) * 0.8 },
    { time: '12:00:15', rxMbps: (liveTelemetry?.rxMbps || 12.4) * 0.9, txMbps: (liveTelemetry?.txMbps || 8.1) * 0.7 },
    { time: '12:00:20', rxMbps: liveTelemetry?.rxMbps || 12.4, txMbps: liveTelemetry?.txMbps || 8.1 }
  ];

  const maxTraffic = Math.max(10, ...samples.map(s => Math.max(s.rxMbps || 0, s.txMbps || 0)));
  const latestSample = samples[samples.length - 1] || { rxMbps: 0, txMbps: 0 };
  const avgRx = (samples.reduce((acc, s) => acc + (s.rxMbps || 0), 0) / samples.length).toFixed(1);
  const avgTx = (samples.reduce((acc, s) => acc + (s.txMbps || 0), 0) / samples.length).toFixed(1);
  const peakRx = Math.max(...samples.map(s => s.rxMbps || 0)).toFixed(1);
  const peakTx = Math.max(...samples.map(s => s.txMbps || 0)).toFixed(1);

  // SVG Chart Dimensions
  const chartW = 560;
  const chartH = 180;
  const paddingX = 40;
  const paddingY = 25;
  const usableW = chartW - paddingX * 2;
  const usableH = chartH - paddingY * 2;

  // Build SVG Path strings for Rx (Green) and Tx (Blue)
  const getCoordinates = (index, value) => {
    const x = paddingX + (index / Math.max(1, samples.length - 1)) * usableW;
    const y = chartH - paddingY - ((value / maxTraffic) * usableH);
    return { x, y };
  };

  const rxPoints = samples.map((s, i) => getCoordinates(i, s.rxMbps || 0));
  const txPoints = samples.map((s, i) => getCoordinates(i, s.txMbps || 0));

  const rxPathD = rxPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');
  const txPathD = txPoints.reduce((acc, pt, i) => i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`, '');

  const rxAreaD = `${rxPathD} L ${rxPoints[rxPoints.length - 1].x} ${chartH - paddingY} L ${rxPoints[0].x} ${chartH - paddingY} Z`;
  const txAreaD = `${txPathD} L ${txPoints[txPoints.length - 1].x} ${chartH - paddingY} L ${txPoints[0].x} ${chartH - paddingY} Z`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <LineChart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  График нагрузки: {port.name || `Порт ${port.number}`}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold">
                  {switchData.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold">
                  VLAN {port.pvid} ({nativeVlan.name})
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Живая телеметрия SNMP IF-MIB (входящая и исходящая пропускная способность Mbps)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">
          {/* Metrics Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-950/20 border-emerald-500/30'
            }`}>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 block mb-0.5">
                ↓ Входящий (Rx) Текущий
              </span>
              <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {latestSample.rxMbps} <span className="text-xs font-normal">Мбит/с</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">Пик: {peakRx} Мбит/с</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-blue-50/60 border-blue-200' : 'bg-blue-950/20 border-blue-500/30'
            }`}>
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 block mb-0.5">
                ↑ Исходящий (Tx) Текущий
              </span>
              <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                {latestSample.txMbps} <span className="text-xs font-normal">Мбит/с</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">Пик: {peakTx} Мбит/с</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <span className="text-[11px] font-medium text-slate-500 block mb-0.5">
                Средняя скорость (Avg)
              </span>
              <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                {avgRx} / {avgTx}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">↓ Rx / ↑ Tx (Мбит/с)</span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <span className="text-[11px] font-medium text-slate-500 block mb-0.5">
                Статус и ошибки
              </span>
              <div className="flex items-center gap-1.5 mt-1 font-mono font-bold text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500 uppercase">{port.speed || '1G'} UP</span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                Ошибок (CRC): {liveTelemetry?.inErrors || 0}
              </span>
            </div>
          </div>

          {/* Interactive SVG Area Chart */}
          <div className={`p-4 rounded-xl border relative ${
            isLight ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Временной ряд трафика (Live Mbps)
              </span>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-emerald-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  ↓ Входящий Rx
                </span>
                <span className="flex items-center gap-1.5 text-blue-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  ↑ Исходящий Tx
                </span>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-48 select-none">
                <defs>
                  <linearGradient id="rx-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="tx-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const y = chartH - paddingY - (pct * usableH);
                  const val = (pct * maxTraffic).toFixed(0);
                  return (
                    <g key={i}>
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={chartW - paddingX}
                        y2={y}
                        stroke={isLight ? '#e2e8f0' : '#1e293b'}
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={paddingX - 6}
                        y={y + 3}
                        fill={isLight ? '#94a3b8' : '#64748b'}
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {val}M
                      </text>
                    </g>
                  );
                })}

                {/* Area fills */}
                <path d={rxAreaD} fill="url(#rx-grad)" />
                <path d={txAreaD} fill="url(#tx-grad)" />

                {/* Main Lines */}
                <path
                  d={rxPathD}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={txPathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points */}
                {rxPoints.map((pt, i) => (
                  <circle
                    key={`rx-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill="#10b981"
                    stroke={isLight ? '#ffffff' : '#0f172a'}
                    strokeWidth="1.5"
                  />
                ))}
                {txPoints.map((pt, i) => (
                  <circle
                    key={`tx-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill="#3b82f6"
                    stroke={isLight ? '#ffffff' : '#0f172a'}
                    strokeWidth="1.5"
                  />
                ))}

                {/* Time Axis Labels */}
                {samples.map((s, i) => {
                  const x = paddingX + (i / Math.max(1, samples.length - 1)) * usableW;
                  return (
                    <text
                      key={`time-${i}`}
                      x={x}
                      y={chartH - 8}
                      fill={isLight ? '#94a3b8' : '#64748b'}
                      fontSize="9"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {s.time}
                    </text>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="text-xs text-slate-500 font-mono">
            {port.connectedTo ? `Подключение: «${port.connectedTo}»` : 'Свободный порт'}
          </div>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
