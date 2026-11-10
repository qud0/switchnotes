import React, { useState, useMemo, useEffect } from 'react';
import { 
  Radio, Wrench, Search, RefreshCw, Zap, CheckCircle2, XCircle, 
  AlertTriangle, ShieldAlert, Plus, Server, Layers, Globe, 
  ArrowRight, Activity, Calculator, Network, Check, ExternalLink,
  Cpu, HardDrive, Wifi, Video, Phone, Laptop, Terminal, Copy, Download, FileCode,
  Sliders, Link2, ShieldCheck, Play, Send, ChevronRight, Hash, Eye, Info
} from 'lucide-react';
import { api } from '../api';
import { generateSwitchConfig } from '../utils/configGenerator';
import { useToast } from '../context/ToastContext';
import VlanWizardModal from './VlanWizardModal';

export default function NetworkToolsView({
  vlans = [],
  switches = [],
  ipAllocations = [],
  onAddIpToIpam,
  onSelectSwitch,
  onReloadSwitches,
  onNavigateToTopology,
  onOpenTroubleshoot,
  onOpenAudit,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner', 'lldp', 'provision', 'ports', 'cidr', 'traceroute', 'poe'
  const [isVlanWizardOpen, setIsVlanWizardOpen] = useState(false);

  // =========================================================================
  // 1. NETWORK AUTO-DISCOVERY & VENDOR DETECTION STATE
  // =========================================================================
  const [scanSubnetInput, setScanSubnetInput] = useState(vlans[0]?.subnet || '192.168.10.0/24');
  const [scanMode, setScanMode] = useState('simulation'); // 'simulation' | 'live'
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanFilter, setScanFilter] = useState('all'); // 'all', 'switches', 'new', 'online'
  const [scanError, setScanError] = useState(null);
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [selectedScanPorts, setSelectedScanPorts] = useState([8291, 22, 23, 80, 443, 8080, 8443]);

  // Quick switch add modal state
  const [addSwitchModal, setAddSwitchModal] = useState(null);
  const [addingSwitch, setAddingSwitch] = useState(false);
  const [addSwitchSuccess, setAddSwitchSuccess] = useState(null);

  const handleStartScan = async () => {
    if (!scanSubnetInput.trim()) return;
    setIsScanning(true);
    setScanError(null);
    setAddSwitchSuccess(null);
    try {
      const res = await api.discoverNetwork({
        subnet: scanSubnetInput.trim(),
        ports: selectedScanPorts,
        snmpCommunity,
        mode: scanMode,
        timeoutMs: 900
      });
      setScanResults(res);
    } catch (err) {
      setScanError(err.message || 'Ошибка выполнения сканирования');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredHosts = useMemo(() => {
    if (!scanResults?.devices) return [];
    if (scanFilter === 'switches') {
      return scanResults.devices.filter(d => ['MikroTik', 'SNR', 'Ubiquiti', 'Cisco'].includes(d.vendor) || d.category === 'switch');
    }
    if (scanFilter === 'new') {
      return scanResults.devices.filter(d => !d.alreadyInSwitches);
    }
    if (scanFilter === 'online') {
      return scanResults.devices.filter(d => d.online);
    }
    return scanResults.devices;
  }, [scanResults, scanFilter]);

  const handleOpenAddSwitchModal = (device) => {
    setAddSwitchModal({
      name: device.existingSwitchName || `sw-${device.vendor.toLowerCase()}-${device.ip.split('.').pop()}`,
      ip: device.ip,
      mac: device.mac !== '—' ? device.mac : '',
      vendor: device.vendor || 'MikroTik',
      model: device.model || 'CRS326-24G-2S+RM',
      location: 'Стойка 42U (Серверная)',
      copperPorts: device.suggestedPorts?.copper || 24,
      sfpPorts: device.suggestedPorts?.sfp || 2,
      notes: `Обнаружен автодискавери (${device.openPorts?.map(p => `:${p}`).join(' ')})`
    });
  };

  const handleConfirmAddSwitch = async () => {
    if (!addSwitchModal) return;
    setAddingSwitch(true);
    try {
      const res = await api.addDiscoveredSwitch(addSwitchModal);
      setAddSwitchSuccess(`Коммутатор "${addSwitchModal.name}" успешно добавлен в базу!`);
      setAddSwitchModal(null);
      if (onReloadSwitches) await onReloadSwitches();
      toast.success(`Коммутатор «${addSwitchModal.name}» успешно добавлен`);
      // Update scanResults to reflect added state
      if (scanResults) {
        setScanResults(prev => ({
          ...prev,
          devices: prev.devices.map(d => d.ip === addSwitchModal.ip ? { ...d, alreadyInSwitches: true, existingSwitchName: addSwitchModal.name } : d)
        }));
      }
    } catch (err) {
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setAddingSwitch(false);
    }
  };

  // =========================================================================
  // 2. LLDP / CDP TOPOLOGY AUTO-DISCOVERY STATE
  // =========================================================================
  const [lldpLoading, setLldpLoading] = useState(false);
  const [lldpResults, setLldpResults] = useState(null);
  const [lldpError, setLldpError] = useState(null);
  const [applyingLink, setApplyingLink] = useState(null);
  const [appliedLinksSuccess, setAppliedLinksSuccess] = useState({});

  const handleLoadLldpTopology = async () => {
    setLldpLoading(true);
    setLldpError(null);
    try {
      const res = await api.getLldpTopology({ mode: 'auto' });
      setLldpResults(res);
    } catch (err) {
      setLldpError(err.message || 'Ошибка опроса LLDP топологии');
    } finally {
      setLldpLoading(false);
    }
  };

  // Auto load LLDP when tab clicked first time
  useEffect(() => {
    if (activeTab === 'lldp' && !lldpResults && !lldpLoading) {
      handleLoadLldpTopology();
    }
  }, [activeTab]);

  const handleApplyLldpLink = async (link) => {
    setApplyingLink(link.id);
    try {
      await api.applyLldpLink(link);
      setAppliedLinksSuccess(prev => ({ ...prev, [link.id]: true }));
      toast.success('LLDP линк успешно применен к коммутаторам');
      if (onReloadSwitches) await onReloadSwitches();
      // Re-fetch LLDP to refresh state
      await handleLoadLldpTopology();
    } catch (err) {
      toast.error(`Ошибка применения линка: ${err.message}`);
    } finally {
      setApplyingLink(null);
    }
  };

  // =========================================================================
  // 3. BATCH PORT & VLAN PROVISIONING STATE
  // =========================================================================
  const [provisionSwitchId, setProvisionSwitchId] = useState(switches[0]?.id || '');
  const selectedProvisionSwitch = useMemo(() => {
    return switches.find(s => s.id === provisionSwitchId) || switches[0] || null;
  }, [switches, provisionSwitchId]);

  const [selectedPortNumbers, setSelectedPortNumbers] = useState([1, 2, 3, 4, 5, 6, 7, 8]);
  const [provisionMode, setProvisionMode] = useState('access'); // 'access' | 'trunk'
  const [provisionPvid, setProvisionPvid] = useState(20);
  const [provisionTaggedVlans, setProvisionTaggedVlans] = useState([10, 20, 30, 40]);
  const [provisionDesc, setProvisionDesc] = useState('USERS_WORKSTATIONS');
  const [provisionEnableStp, setProvisionEnableStp] = useState(true);
  const [provisionEnablePoe, setProvisionEnablePoe] = useState(true);
  const [provisionScriptText, setProvisionScriptText] = useState('');
  const [provisionLoadingScript, setProvisionLoadingScript] = useState(false);
  const [provisionCopied, setProvisionCopied] = useState(false);

  // SSH Execution state
  const [sshCredentials, setSshCredentials] = useState({
    username: 'admin',
    password: '',
    port: 22
  });
  const [sshExecuting, setSshExecuting] = useState(false);
  const [sshResult, setSshResult] = useState(null);
  const [dbApplySuccess, setDbApplySuccess] = useState(false);

  // Sync script when options change
  const refreshProvisionScript = async () => {
    if (!selectedProvisionSwitch) return;
    setProvisionLoadingScript(true);
    try {
      const res = await api.generateBatchPortScript(selectedProvisionSwitch.id, {
        vendor: selectedProvisionSwitch.vendor,
        portNumbers: selectedPortNumbers,
        mode: provisionMode,
        pvid: parseInt(provisionPvid) || 1,
        taggedVlans: provisionTaggedVlans,
        description: provisionDesc,
        stpEdge: provisionEnableStp,
        poe: provisionEnablePoe
      });
      setProvisionScriptText(res.script || '');
    } catch (err) {
      console.error(err);
    } finally {
      setProvisionLoadingScript(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'provision') {
      refreshProvisionScript();
    }
  }, [
    activeTab, provisionSwitchId, selectedPortNumbers, 
    provisionMode, provisionPvid, provisionTaggedVlans, 
    provisionDesc, provisionEnableStp, provisionEnablePoe
  ]);

  const togglePortNumber = (pNum) => {
    setSelectedPortNumbers(prev => 
      prev.includes(pNum) ? prev.filter(n => n !== pNum) : [...prev, pNum].sort((a, b) => a - b)
    );
  };

  const handleSelectAllCopper = () => {
    const copperCount = selectedProvisionSwitch?.copperPorts || 24;
    setSelectedPortNumbers(Array.from({ length: copperCount }, (_, i) => i + 1));
  };

  const handleSelectHalf = (half) => {
    const copperCount = selectedProvisionSwitch?.copperPorts || 24;
    const mid = Math.floor(copperCount / 2);
    if (half === 1) {
      setSelectedPortNumbers(Array.from({ length: mid }, (_, i) => i + 1));
    } else {
      setSelectedPortNumbers(Array.from({ length: copperCount - mid }, (_, i) => mid + 1 + i));
    }
  };

  const handleSelectSfp = () => {
    const copperCount = selectedProvisionSwitch?.copperPorts || 24;
    const sfpCount = selectedProvisionSwitch?.sfpPorts || 2;
    setSelectedPortNumbers(Array.from({ length: sfpCount }, (_, i) => copperCount + 1 + i));
  };

  const handleCopyProvision = () => {
    navigator.clipboard.writeText(provisionScriptText);
    setProvisionCopied(true);
    setTimeout(() => setProvisionCopied(false), 2000);
  };

  const handleDownloadProvision = () => {
    if (!selectedProvisionSwitch) return;
    let ext = 'cfg';
    const v = (selectedProvisionSwitch.vendor || '').toLowerCase();
    if (v.includes('mikrotik')) ext = 'rsc';
    else if (v.includes('snr')) ext = 'cfg';
    else if (v.includes('ubiquiti')) ext = 'cfg';

    const blob = new Blob([provisionScriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedProvisionSwitch.name}-batch-ports.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyOverSsh = async () => {
    if (!selectedProvisionSwitch) return;
    setSshExecuting(true);
    setSshResult(null);
    setDbApplySuccess(false);

    try {
      const portIds = selectedPortNumbers.map(n => `p${n}`);
      const portUpdate = {
        mode: provisionMode,
        pvid: parseInt(provisionPvid) || 1,
        taggedVlans: provisionMode === 'trunk' ? provisionTaggedVlans : [],
        description: provisionDesc,
        poe: provisionEnablePoe
      };

      const res = await api.applyBatchProvisioning(selectedProvisionSwitch.id, {
        portIds,
        script: provisionScriptText,
        applyToSwitch: true,
        applyToDb: true,
        portUpdate,
        credentials: sshCredentials
      });

      setSshResult(res.sshResult || { success: true, message: 'Команды успешно отправлены по SSH' });
      setDbApplySuccess(true);
      if (onReloadSwitches) await onReloadSwitches();
    } catch (err) {
      setSshResult({ success: false, error: err.message });
    } finally {
      setSshExecuting(false);
    }
  };

  const handleApplyOnlyDb = async () => {
    if (!selectedProvisionSwitch) return;
    setDbApplySuccess(false);
    try {
      const portIds = selectedPortNumbers.map(n => `p${n}`);
      const portUpdate = {
        mode: provisionMode,
        pvid: parseInt(provisionPvid) || 1,
        taggedVlans: provisionMode === 'trunk' ? provisionTaggedVlans : [],
        description: provisionDesc,
        poe: provisionEnablePoe
      };

      await api.applyBatchProvisioning(selectedProvisionSwitch.id, {
        portIds,
        applyToSwitch: false,
        applyToDb: true,
        portUpdate
      });

      setDbApplySuccess(true);
      toast.success('Параметры портов успешно обновлены в базе');
      if (onReloadSwitches) await onReloadSwitches();
    } catch (err) {
      toast.error(`Ошибка обновления базы: ${err.message}`);
    }
  };

  // =========================================================================
  // 4. PORT SCANNER STATE
  // =========================================================================
  const [portHost, setPortHost] = useState('192.168.10.1');
  const [selectedProfile, setSelectedProfile] = useState('mgmt');
  const [customPortsInput, setCustomPortsInput] = useState('80, 443, 22, 8291, 161');
  const [isPortScanning, setIsPortScanning] = useState(false);
  const [portResults, setPortResults] = useState(null);
  const [portError, setPortError] = useState(null);

  const portPresets = {
    mgmt: [22, 23, 80, 443, 8291, 3389],
    infra: [53, 123, 161, 445, 873],
    media: [554, 5060, 8080, 8443]
  };

  const handleStartPortScan = async () => {
    if (!portHost.trim()) return;
    setIsPortScanning(true);
    setPortError(null);

    let portsToScan = portPresets[selectedProfile] || [];
    if (selectedProfile === 'custom') {
      portsToScan = customPortsInput
        .split(',')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p > 0 && p <= 65535);
    }

    try {
      const res = await api.scanPorts({ host: portHost.trim(), ports: portsToScan });
      setPortResults(res);
    } catch (err) {
      setPortError(err.message || 'Ошибка проверки портов');
    } finally {
      setIsPortScanning(false);
    }
  };

  // =========================================================================
  // 5. CIDR CALCULATOR STATE
  // =========================================================================
  const [cidrIp, setCidrIp] = useState('192.168.10.0');
  const [cidrPrefix, setCidrPrefix] = useState(24);

  const cidrData = useMemo(() => {
    const cleanIp = cidrIp.trim();
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return null;
    }

    const prefix = Math.max(1, Math.min(30, parseInt(cidrPrefix) || 24));
    const ipNum = ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3];
    const maskNum = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const netNum = (ipNum & maskNum) >>> 0;
    const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;

    const numToIp = (num) => [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255
    ].join('.');

    const totalHosts = Math.pow(2, 32 - prefix);
    const usableHosts = Math.max(0, totalHosts - 2);

    return {
      network: numToIp(netNum),
      netmask: numToIp(maskNum),
      broadcast: numToIp(bcastNum),
      firstHost: numToIp(netNum + 1),
      lastHost: numToIp(bcastNum - 1),
      totalHosts,
      usableHosts,
      prefix
    };
  }, [cidrIp, cidrPrefix]);

  // =========================================================================
  // 6. TRACEROUTE STATE
  // =========================================================================
  const [traceTarget, setTraceTarget] = useState('192.168.10.1');
  const [isTracing, setIsTracing] = useState(false);
  const [traceResult, setTraceResult] = useState(null);

  const handleRunTraceroute = async () => {
    if (!traceTarget.trim()) return;
    setIsTracing(true);
    setTraceResult(null);
    try {
      const res = await api.runTraceroute({ host: traceTarget.trim(), maxHops: 12 });
      setTraceResult(res);
    } catch (err) {
      toast.error(`Ошибка трассировки: ${err.message}`);
    } finally {
      setIsTracing(false);
    }
  };

  // =========================================================================
  // 7. POE BUDGET STATE
  // =========================================================================
  const [poePsuWatts, setPoePsuWatts] = useState(370);
  const [poeLoads, setPoeLoads] = useState({
    apWifi6: 4,
    cctvCamera: 8,
    ptzDome: 1,
    voipPhone: 6,
    intercom: 1
  });

  const poeSummary = useMemo(() => {
    const totalWatts = 
      (poeLoads.apWifi6 * 15) +
      (poeLoads.cctvCamera * 7) +
      (poeLoads.ptzDome * 25) +
      (poeLoads.voipPhone * 4) +
      (poeLoads.intercom * 12);

    const totalPorts = Object.values(poeLoads).reduce((a, b) => a + b, 0);
    const percent = Math.min(100, Math.round((totalWatts / poePsuWatts) * 100));
    const remainingWatts = Math.max(0, poePsuWatts - totalWatts);
    const isOverload = totalWatts > poePsuWatts;

    return { totalWatts, totalPorts, percent, remainingWatts, isOverload };
  }, [poePsuWatts, poeLoads]);

  return (
    <div className="space-y-6">
      {/* Top Header & Tool Tabs */}
      <div className={`p-4 rounded-2xl border shadow-xl backdrop-blur-md ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide flex items-center gap-2">
                Сетевой инженерный комплекс
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  MikroTik • SNR • Ubiquiti
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Автодискавери оборудования, авто-топология по LLDP/CDP, массовый конфигуратор портов и диагностика
              </p>
            </div>
          </div>

          {/* Tool Navigation Buttons (Strict h-9 height) */}
          <div className={`flex items-center gap-1.5 p-1 rounded-xl border flex-wrap ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/70 border-slate-800'
          }`}>
            {[
              { id: 'troubleshoot', label: '🛠 Траблшутер (L1-L4)', icon: <Wrench className="w-3.5 h-3.5 text-amber-400" /> },
              { id: 'scanner', label: '🌐 Автодискавери (IP/Vendor)', icon: <Radio className="w-3.5 h-3.5" /> },
              { id: 'lldp', label: '🔗 LLDP Авто-топология', icon: <Link2 className="w-3.5 h-3.5" /> },
              { id: 'vlan_wizard', label: '⚡ Сквозной VLAN (Wizard)', icon: <Layers className="w-3.5 h-3.5 text-blue-400" /> },
              { id: 'provision', label: '⚡ Конфигуратор VLAN и портов', icon: <Sliders className="w-3.5 h-3.5" /> },
              { id: 'ports', label: 'Сканер TCP портов', icon: <Zap className="w-3.5 h-3.5" /> },
              { id: 'cidr', label: 'CIDR Калькулятор', icon: <Calculator className="w-3.5 h-3.5" /> },
              { id: 'traceroute', label: 'Traceroute', icon: <Activity className="w-3.5 h-3.5" /> },
              { id: 'poe', label: 'Бюджет PoE', icon: <Cpu className="w-3.5 h-3.5" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: INTELLIGENT NETWORK TROUBLESHOOTER                                */}
      {/* ========================================================================= */}
      {activeTab === 'troubleshoot' && (
        <div className="space-y-4">
          <div className={`p-6 rounded-2xl border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Интеллектуальный «Траблшутер» сетевых неполадок (L1-L4)
                </h2>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Сквозная диагностика: физические линки (L1), транки, Native VLAN и петли STP (L2), коллизии IP/шлюзов (L3), порты сервисов SSH, Winbox и Web (L4). Автоматическое определение первопричины и исправление в 1 клик.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                onClick={() => onOpenTroubleshoot && onOpenTroubleshoot(switches[0]?.id)}
                className="h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                <span>Запустить Траблшутер</span>
              </button>
              {onOpenAudit && (
                <button
                  onClick={() => onOpenAudit()}
                  className={`h-10 px-4 rounded-xl border font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                  }`}
                  title="Открыть полный аудит безопасности и лучших практик (Network Hardening)"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Аудит Hardening</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                layer: 'L1',
                title: 'Физический уровень',
                desc: 'Контроль состояния портов (Admin Down), целостности кроссировок СКС и обрывов витых пар кабеля (Virtual TDR).'
              },
              {
                layer: 'L2',
                title: 'Канальный уровень',
                desc: 'Анализ рассинхронизации 802.1Q транков, несовпадения Native VLAN (PVID), утечек нетегированного трафика и блокировок STP.'
              },
              {
                layer: 'L3',
                title: 'Сетевой уровень',
                desc: 'Выявление дубликатов IP, коллизий со статическими резервациями DHCP-пулов и доступности шлюзов подсетей по ICMP Ping.'
              },
              {
                layer: 'L4/L7',
                title: 'Уровень сервисов',
                desc: 'Проверка открытых портов удаленного управления: MikroTik Winbox (8291), SSH (22), HTTP/HTTPS (80/443), SNMP (161).'
              }
            ].map(card => (
              <div
                key={card.layer}
                className={`p-4 rounded-xl border space-y-2 ${
                  isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    {card.layer}
                  </span>
                  <Activity className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">{card.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: NETWORK AUTO-DISCOVERY & VENDOR DETECTION                          */}
      {/* ========================================================================= */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className={`p-5 rounded-2xl border shadow-xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="flex flex-col lg:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Диапазон или CIDR подсеть сканирования:
                  </label>
                  {/* Mode switcher: Live vs Simulation */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setScanMode('simulation')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                        scanMode === 'simulation'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Симуляция (Демо)
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanMode('live')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                        scanMode === 'live'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Реальное время (Live)
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scanSubnetInput}
                    onChange={(e) => setScanSubnetInput(e.target.value)}
                    placeholder="Например: 192.168.10.0/24 или 192.168.10.1 - 192.168.10.50"
                    className="w-full h-11 pl-10 pr-4 bg-slate-950/80 border border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Quick VLAN shortcuts */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 block font-medium">Быстрый выбор VLAN:</span>
                <div className="flex flex-wrap gap-1.5">
                  {vlans.filter(v => v.subnet).map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setScanSubnetInput(v.subnet)}
                      className="h-11 px-3 text-xs font-mono rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color || '#3b82f6' }} />
                      <span>{v.name} ({v.subnet})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Scan Button */}
              <button
                onClick={handleStartScan}
                disabled={isScanning || !scanSubnetInput.trim()}
                className="h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all shrink-0 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Сканирование сети...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>Начать автодискавери</span>
                  </>
                )}
              </button>
            </div>

            {/* Scan options row: ports and SNMP community */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400 font-semibold flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Порты оборудования:</span>
                </span>
                {[
                  { port: 8291, label: 'MikroTik WinBox (8291)' },
                  { port: 22, label: 'SSH (22)' },
                  { port: 23, label: 'Telnet (23)' },
                  { port: 80, label: 'HTTP (80)' },
                  { port: 8080, label: 'UniFi Web (8080)' },
                  { port: 8443, label: 'UniFi SSL (8443)' }
                ].map(p => (
                  <label key={p.port} className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={selectedScanPorts.includes(p.port)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedScanPorts(prev => [...prev, p.port]);
                        else setSelectedScanPorts(prev => prev.filter(x => x !== p.port));
                      }}
                      className="rounded accent-blue-600"
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">SNMP v2c Community:</span>
                <input
                  type="text"
                  value={snmpCommunity}
                  onChange={(e) => setSnmpCommunity(e.target.value)}
                  className="h-7 w-24 px-2 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {scanError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {addSwitchSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{addSwitchSuccess}</span>
              </div>
            )}
          </div>

          {/* Results Summary Bar & Filter Tabs */}
          {scanResults && (
            <div className={`p-4 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-4 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 mr-1 font-semibold">Фильтр результатов:</span>
                {[
                  { id: 'all', label: `Все устройства (${scanResults.devices?.length || 0})` },
                  { id: 'switches', label: `Коммутаторы и роутеры (${scanResults.switchesFound || 0})` },
                  { id: 'new', label: `Новые для добавления (${scanResults.newDiscoveredSwitches || 0})`, highlight: true },
                  { id: 'online', label: `Все онлайн (${scanResults.onlineCount || 0})` }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setScanFilter(f.id)}
                    className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      scanFilter === f.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : f.highlight && scanResults.newDiscoveredSwitches > 0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                          : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Режим: {scanResults.mode === 'live' ? 'Реальное время (Физическая сеть)' : 'Симуляция / Демо'}</span>
                </span>
              </div>
            </div>
          )}

          {/* Results Table */}
          {scanResults && (
            <div className={`rounded-2xl border overflow-hidden shadow-xl ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`border-b uppercase tracking-wider font-semibold ${
                    isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950/60 text-slate-400 border-slate-800'
                  }`}>
                    <tr>
                      <th className="px-4 py-3">Статус / RTT</th>
                      <th className="px-4 py-3">IP-адрес</th>
                      <th className="px-4 py-3">MAC / OUI</th>
                      <th className="px-4 py-3">Вендор и Модель</th>
                      <th className="px-4 py-3">Открытые порты</th>
                      <th className="px-4 py-3">Статус в SwitchBook</th>
                      <th className="px-4 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredHosts.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-12 text-center text-slate-500 font-sans">
                          Нет устройств, удовлетворяющих выбранному фильтру
                        </td>
                      </tr>
                    ) : (
                      filteredHosts.map(dev => {
                        const isMt = dev.vendor === 'MikroTik';
                        const isSnr = dev.vendor === 'SNR';
                        const isUbnt = dev.vendor === 'Ubiquiti';

                        return (
                          <tr key={dev.ip} className="hover:bg-slate-800/30 transition-colors">
                            {/* 1. Status & RTT */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="font-bold text-white">{dev.rtt} мс</span>
                              </div>
                            </td>

                            {/* 2. IP */}
                            <td className="px-4 py-3">
                              <span className="font-bold text-white text-sm">{dev.ip}</span>
                            </td>

                            {/* 3. MAC */}
                            <td className="px-4 py-3 text-slate-300">
                              <span>{dev.mac}</span>
                            </td>

                            {/* 4. Vendor & Model */}
                            <td className="px-4 py-3 font-sans">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  isMt ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' :
                                  isSnr ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                  isUbnt ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                                  'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}>
                                  {dev.vendor}
                                </span>
                                <span className="font-medium text-slate-200">{dev.model}</span>
                              </div>
                              {dev.snmp?.sysName && (
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  SNMP sysName: {dev.snmp.sysName}
                                </div>
                              )}
                            </td>

                            {/* 5. Open Ports */}
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {dev.openPorts?.map(p => (
                                  <span
                                    key={p}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                      p === 8291 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' :
                                      p === 22 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                      p === 8080 || p === 8443 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                                      'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {p === 8291 ? '8291 Winbox' : p === 22 ? '22 SSH' : p === 23 ? '23 Telnet' : p}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* 6. SwitchBook DB Status */}
                            <td className="px-4 py-3 font-sans">
                              {dev.alreadyInSwitches ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>В базе: {dev.existingSwitchName}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Новое устройство</span>
                                </span>
                              )}
                            </td>

                            {/* 7. Action Button */}
                            <td className="px-4 py-3 text-right font-sans">
                              {!dev.alreadyInSwitches ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAddSwitchModal(dev)}
                                  className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>+ В свитчи</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onSelectSwitch && onSelectSwitch(dev.existingSwitchId)}
                                  className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>Открыть</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
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

          {/* Add Switch Modal */}
          {addSwitchModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-500" />
                    <span>Добавление коммутатора в один клик</span>
                  </h3>
                  <button
                    onClick={() => setAddSwitchModal(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                  <div className="col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Имя коммутатора:</label>
                    <input
                      type="text"
                      value={addSwitchModal.name}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">IP-адрес:</label>
                    <input
                      type="text"
                      value={addSwitchModal.ip}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, ip: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">MAC-адрес:</label>
                    <input
                      type="text"
                      value={addSwitchModal.mac}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, mac: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Вендор:</label>
                    <select
                      value={addSwitchModal.vendor}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, vendor: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white outline-none"
                    >
                      <option value="MikroTik">MikroTik RouterOS</option>
                      <option value="SNR">SNR (NAG)</option>
                      <option value="Ubiquiti">Ubiquiti UniFi/Edge</option>
                      <option value="Cisco">Cisco Systems</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Модель:</label>
                    <input
                      type="text"
                      value={addSwitchModal.model}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, model: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Медные порты (RJ-45):</label>
                    <input
                      type="number"
                      value={addSwitchModal.copperPorts}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, copperPorts: parseInt(e.target.value) || 24 }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Оптические порты (SFP/SFP+):</label>
                    <input
                      type="number"
                      value={addSwitchModal.sfpPorts}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, sfpPorts: parseInt(e.target.value) || 2 }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-slate-400 font-semibold mb-1">Расположение / Стойка:</label>
                    <input
                      type="text"
                      value={addSwitchModal.location}
                      onChange={(e) => setAddSwitchModal(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAddSwitchModal(null)}
                    className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddSwitch}
                    disabled={addingSwitch}
                    className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    {addingSwitch ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Добавить коммутатор</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LLDP / CDP TOPOLOGY AUTO-DISCOVERY                                 */}
      {/* ========================================================================= */}
      {activeTab === 'lldp' && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <Link2 className="w-5 h-5 text-indigo-400" />
                <span>Авто-топология по LLDP / CDP (IEEE 802.1AB)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Автоматическое обнаружение соседей через опрос LLDP-MIB / MNDP и соединение портов коммутаторов в интерактивной топологии
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadLldpTopology}
                disabled={lldpLoading}
                className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-xs"
              >
                {lldpLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>Опросить соседей по LLDP</span>
              </button>

              {onNavigateToTopology && (
                <button
                  type="button"
                  onClick={onNavigateToTopology}
                  className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all border border-slate-700"
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>Открыть карту сети</span>
                </button>
              )}
            </div>
          </div>

          {lldpError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{lldpError}</span>
            </div>
          )}

          {/* List of Discovered Inter-Switch Links */}
          {lldpResults && (
            <div className="space-y-3">
              {lldpResults.isHardware && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Аппаратный опрос (Live SSH): связи получены по LLDP/CDP с реальных MikroTik и SNR</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Обнаружено связей: <strong className="text-white">{lldpResults.totalDiscovered}</strong></span>
                <span>Уже соединены в топологии: <strong className="text-emerald-400">{lldpResults.alreadyConnectedCount}</strong></span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {lldpResults.links?.map(link => {
                  const isConnected = link.status === 'connected' || appliedLinksSuccess[link.id];

                  return (
                    <div
                      key={link.id}
                      className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                        isConnected
                          ? isLight ? 'bg-white border-emerald-500/30' : 'bg-slate-900/60 border-emerald-500/20'
                          : isLight ? 'bg-amber-500/5 border-amber-500/30' : 'bg-slate-900/90 border-amber-500/30 shadow-lg'
                      }`}
                    >
                      {/* Left Switch & Port */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                          {link.sourceSwitch.vendor === 'MikroTik' ? 'MT' : link.sourceSwitch.vendor === 'SNR' ? 'SNR' : 'UBNT'}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">{link.sourceSwitch.name}</div>
                          <div className="text-[11px] text-blue-400 font-mono mt-0.5">
                            Порт: {link.sourcePort.name} ({link.sourcePort.type})
                          </div>
                        </div>
                      </div>

                      {/* Middle Link Badge */}
                      <div className="flex flex-col items-center justify-center px-4">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold mb-1 flex items-center gap-1">
                          <span>{link.protocol} • {link.speed}</span>
                          {link.bidirectional && (
                            <span className="text-[9px] text-emerald-400 font-bold ml-1">✓✓ Mesh</span>
                          )}
                        </span>
                        <div className="flex items-center gap-2 text-slate-500">
                          <span className="w-6 h-0.5 bg-slate-700" />
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="w-6 h-0.5 bg-slate-700" />
                        </div>
                      </div>

                      {/* Right Switch & Port */}
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-bold text-white text-xs text-left md:text-right">{link.remoteSwitch.name}</div>
                          <div className="text-[11px] text-indigo-400 font-mono mt-0.5 text-left md:text-right">
                            Порт: {link.remotePort.name} ({link.remotePort.type})
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                          {link.remoteSwitch.vendor === 'MikroTik' ? 'MT' : link.remoteSwitch.vendor === 'SNR' ? 'SNR' : 'UBNT'}
                        </div>
                      </div>

                      {/* Action & Status */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isConnected ? (
                          <span className="h-8 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            <span>Соединен в топологии</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApplyLldpLink(link)}
                            disabled={applyingLink === link.id}
                            className="h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                          >
                            {applyingLink === link.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                            <span>Применить связь в топологию</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2.5: END-TO-END VLAN WIZARD LAUNCHER                                 */}
      {/* ========================================================================= */}
      {activeTab === 'vlan_wizard' && (
        <div className="space-y-4">
          <div className={`p-6 rounded-2xl border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Сквозной проброс VLAN по цепочке коммутаторов (End-to-End Wizard)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                    v2.0
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Интеллектуальный мастер автоматически находит путь между ядром сети и портом доступа, 
                рассчитывает необходимые тегированные (Tagged / Trunk) порты на всех промежуточных коммутаторах 
                и генерирует готовые команды для MikroTik RouterOS, SNR NAG, Cisco и Ubiquiti.
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/60">✓ Автопоиск пути (BFS)</span>
                <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/60">✓ Bridge VLAN Filtering</span>
                <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/60">✓ SNR-OS switchport trunk</span>
                <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700/60">✓ Применение в 1 клик</span>
              </div>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsVlanWizardOpen(true)}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/25 transition-all"
              >
                <Zap className="w-4 h-4 text-white" />
                <span>Запустить мастер проброса</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BATCH PORT & VLAN PROVISIONING (MIKROTIK, SNR, UBIQUITI)          */}
      {/* ========================================================================= */}
      {activeTab === 'provision' && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border shadow-xl space-y-5 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-500" />
                  <span>Массовый конфигуратор портов и VLAN (Batch Port Provisioning)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Групповая настройка портов Access/Trunk, PVID и STP со строгой автогенерацией команд под MikroTik, SNR и Ubiquiti и отправкой по SSH
                </p>
              </div>

              {/* Target switch selector */}
              <div className="min-w-64">
                <label className="text-xs font-semibold text-slate-400 block mb-1">Целевой коммутатор:</label>
                <select
                  value={provisionSwitchId}
                  onChange={(e) => setProvisionSwitchId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs outline-none focus:border-blue-500"
                >
                  {switches.map(sw => (
                    <option key={sw.id} value={sw.id}>
                      {sw.name} ({sw.vendor} {sw.model}) - IP: {sw.ip}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interactive Port Grid Selector */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-blue-400" />
                  <span>Выберите группу портов для настройки (Выбрано: {selectedPortNumbers.length}):</span>
                </span>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllCopper}
                    className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
                  >
                    Все RJ-45 (1-24)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectHalf(1)}
                    className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
                  >
                    Порты 1-12
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectHalf(2)}
                    className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
                  >
                    Порты 13-24
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectSfp}
                    className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer"
                  >
                    SFP Аплинки
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortNumbers([])}
                    className="h-7 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-medium cursor-pointer"
                  >
                    Сбросить
                  </button>
                </div>
              </div>

              {/* Ports Buttons Grid */}
              <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-24 gap-1.5 pt-1">
                {Array.from({ length: (selectedProvisionSwitch?.copperPorts || 24) + (selectedProvisionSwitch?.sfpPorts || 2) }, (_, i) => {
                  const portNum = i + 1;
                  const isSfp = portNum > (selectedProvisionSwitch?.copperPorts || 24);
                  const isSelected = selectedPortNumbers.includes(portNum);

                  return (
                    <button
                      key={portNum}
                      type="button"
                      onClick={() => togglePortNumber(portNum)}
                      className={`h-8 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400'
                          : isSfp
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>{isSfp ? `S${portNum - 24}` : portNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VLAN & Parameter Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Режим порта (Switchport Mode):</label>
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setProvisionMode('access')}
                    className={`flex-1 h-7 rounded-lg font-semibold transition-all cursor-pointer ${
                      provisionMode === 'access' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Access (Untagged)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvisionMode('trunk')}
                    className={`flex-1 h-7 rounded-lg font-semibold transition-all cursor-pointer ${
                      provisionMode === 'trunk' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Trunk (Tagged)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  {provisionMode === 'access' ? 'Access VLAN (PVID):' : 'Native VLAN (PVID):'}
                </label>
                <select
                  value={provisionPvid}
                  onChange={(e) => setProvisionPvid(parseInt(e.target.value) || 1)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none"
                >
                  {vlans.map(v => (
                    <option key={v.id} value={v.id}>
                      VLAN {v.id} - {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Описание (Interface Description):</label>
                <input
                  type="text"
                  value={provisionDesc}
                  onChange={(e) => setProvisionDesc(e.target.value)}
                  placeholder="USERS_LAN"
                  className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={provisionEnableStp}
                    onChange={(e) => setProvisionEnableStp(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  <span>STP PortFast/Edge</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={provisionEnablePoe}
                    onChange={(e) => setProvisionEnablePoe(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  <span>PoE Питание</span>
                </label>
              </div>
            </div>

            {/* Tagged VLAN selection for Trunk */}
            {provisionMode === 'trunk' && (
              <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
                <span className="text-slate-400 font-semibold block">Разрешенные тегированные VLAN (Allowed VLANs):</span>
                <div className="flex flex-wrap gap-2">
                  {vlans.map(v => {
                    const isChecked = provisionTaggedVlans.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setProvisionTaggedVlans(prev => 
                            prev.includes(v.id) ? prev.filter(x => x !== v.id) : [...prev, v.id].sort((a, b) => a - b)
                          );
                        }}
                        className={`h-7 px-3 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isChecked
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color || '#3b82f6' }} />
                        <span>VLAN {v.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Generated CLI Script & SSH Execution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 cols: Script Viewer */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
              <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Сгенерированный CLI скрипт ({selectedProvisionSwitch?.vendor})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyProvision}
                    className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    {provisionCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{provisionCopied ? 'Скопировано!' : 'Копировать'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadProvision}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать файл</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-950/90 text-emerald-300 font-mono text-xs leading-relaxed max-h-96 overflow-y-auto flex-1 select-all">
                <pre className="whitespace-pre">
                  <code>{provisionScriptText}</code>
                </pre>
              </div>
            </div>

            {/* Right 1 col: Direct SSH Provisioning Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Отправка на коммутатор по SSH</span>
                </div>

                <div className="space-y-3 text-xs font-sans">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">IP коммутатора:</label>
                    <input
                      type="text"
                      disabled
                      value={selectedProvisionSwitch?.ip || ''}
                      className="w-full h-8 px-3 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">SSH Логин:</label>
                    <input
                      type="text"
                      value={sshCredentials.username}
                      onChange={(e) => setSshCredentials(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">SSH Пароль:</label>
                    <input
                      type="password"
                      value={sshCredentials.password}
                      onChange={(e) => setSshCredentials(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* SSH Result status */}
                {sshResult && (
                  <div className={`p-3 rounded-xl border text-xs font-sans ${
                    sshResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    <div className="font-bold mb-1 flex items-center gap-1.5">
                      {sshResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      <span>{sshResult.success ? 'Успешно выполнено!' : 'Ошибка выполнения:'}</span>
                    </div>
                    {sshResult.error && <div>{sshResult.error}</div>}
                    {sshResult.stdout && <pre className="font-mono text-[10px] mt-1 text-slate-400 max-h-24 overflow-y-auto">{sshResult.stdout}</pre>}
                  </div>
                )}

                {dbApplySuccess && !sshResult && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Свойства портов успешно обновлены в базе SwitchBook!</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleApplyOverSsh}
                  disabled={sshExecuting || selectedPortNumbers.length === 0}
                  className="w-full h-10 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-purple-500/20 transition-all"
                >
                  {sshExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Применить по SSH на коммутатор</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyOnlyDb}
                  disabled={selectedPortNumbers.length === 0}
                  className="w-full h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Обновить только в базе SwitchBook</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TCP PORT SCANNER                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'ports' && (
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 shadow-xl space-y-4 transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Хост или IP-адрес:</label>
                <input
                  type="text"
                  value={portHost}
                  onChange={(e) => setPortHost(e.target.value)}
                  placeholder="192.168.10.1"
                  className={`w-full h-9 px-3 border rounded-xl font-mono text-xs outline-none focus:border-blue-500 ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950/80 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Профиль портов:</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white text-xs outline-none focus:border-blue-500"
                >
                  <option value="mgmt">Управление (SSH, Telnet, HTTP, HTTPS, Winbox 8291, RDP)</option>
                  <option value="infra">Инфраструктура (DNS, NTP, SNMP, SMB, Rsync)</option>
                  <option value="media">Медиа & Телефония (RTSP, SIP, UniFi 8080/8443)</option>
                  <option value="custom">Пользовательский список портов</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleStartPortScan}
                  disabled={isPortScanning || !portHost.trim()}
                  className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                >
                  {isPortScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>Проверить доступность портов</span>
                </button>
              </div>
            </div>

            {selectedProfile === 'custom' && (
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Порты через запятую:</label>
                <input
                  type="text"
                  value={customPortsInput}
                  onChange={(e) => setCustomPortsInput(e.target.value)}
                  className="w-full h-9 px-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs outline-none"
                />
              </div>
            )}

            {portError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                <span>{portError}</span>
              </div>
            )}
          </div>

          {portResults && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
                <span>Результаты проверки хоста: <strong className="text-white font-mono">{portResults.host}</strong></span>
                <span className="text-slate-400">Открытых портов: <strong className="text-emerald-400">{portResults.openCount}</strong></span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4">
                {portResults.results?.map(p => (
                  <div
                    key={p.port}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      p.status === 'open'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-bold text-sm text-white">Порт {p.port}</div>
                      <div className="text-[11px] text-slate-400">{p.service}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      p.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {p.status === 'open' ? `Открыт (${p.rtt}мс)` : 'Закрыт'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: CIDR CALCULATOR                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'cidr' && (
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 shadow-xl space-y-4 transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Базовый IP адрес:</label>
                <input
                  type="text"
                  value={cidrIp}
                  onChange={(e) => setCidrIp(e.target.value)}
                  className={`w-full h-9 px-3 border rounded-xl font-mono text-xs outline-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Префикс маски (/{cidrPrefix}):</label>
                <input
                  type="range"
                  min="8"
                  max="30"
                  value={cidrPrefix}
                  onChange={(e) => setCidrPrefix(parseInt(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {cidrData && (
              <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t text-xs ${
                isLight ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <div className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 block mb-1">Адрес сети:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{cidrData.network}/{cidrData.prefix}</span>
                </div>
                <div className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 block mb-1">Маска сети:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">{cidrData.netmask}</span>
                </div>
                <div className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 block mb-1">Диапазон хостов:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">{cidrData.firstHost} — {cidrData.lastHost}</span>
                </div>
                <div className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 block mb-1">Доступных хостов:</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">{cidrData.usableHosts}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: TRACEROUTE                                                        */}
      {/* ========================================================================= */}
      {activeTab === 'traceroute' && (
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 shadow-xl flex items-center gap-4 transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <input
              type="text"
              value={traceTarget}
              onChange={(e) => setTraceTarget(e.target.value)}
              placeholder="192.168.10.1"
              className={`flex-1 h-9 px-3 border rounded-xl font-mono text-xs outline-none focus:border-blue-500 ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
            <button
              type="button"
              onClick={handleRunTraceroute}
              disabled={isTracing || !traceTarget.trim()}
              className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
            >
              {isTracing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              <span>Запустить Traceroute</span>
            </button>
          </div>

          {traceResult && (
            <div className={`border rounded-2xl p-4 shadow-xl font-mono text-xs space-y-2 transition-colors ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="text-slate-500 dark:text-slate-400 mb-2 font-sans font-semibold">Трассировка до {traceResult.host}:</div>
              {traceResult.hops?.map(h => (
                <div key={h.hop} className={`flex items-center gap-4 p-2 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-400 w-8">#{h.hop}</span>
                  <span className="text-slate-900 dark:text-white font-bold">{h.ip}</span>
                  <span className="text-emerald-500 font-semibold">{h.rtt} мс</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: POE BUDGET                                                        */}
      {/* ========================================================================= */}
      {activeTab === 'poe' && (
        <div className="space-y-4">
          <div className={`border rounded-2xl p-5 shadow-xl space-y-4 transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <span className="text-xs font-bold text-slate-900 dark:text-white">Бюджет блока питания PoE:</span>
              <div className="flex items-center gap-2">
                {[250, 370, 500, 740].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPoePsuWatts(w)}
                    className={`h-7 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      poePsuWatts === w
                        ? 'bg-blue-600 text-white'
                        : isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {[
                { key: 'apWifi6', label: 'Wi-Fi 6 Точки (15W)', watts: 15 },
                { key: 'cctvCamera', label: 'IP Камеры (7W)', watts: 7 },
                { key: 'ptzDome', label: 'PTZ Купольные (25W)', watts: 25 },
                { key: 'voipPhone', label: 'VoIP Телефоны (4W)', watts: 4 },
                { key: 'intercom', label: 'Домофоны (12W)', watts: 12 }
              ].map(item => (
                <div key={item.key} className={`p-3 rounded-xl border space-y-2 transition-colors ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-500 dark:text-slate-400 block">{item.label}</span>
                  <input
                    type="number"
                    min="0"
                    max="48"
                    value={poeLoads[item.key]}
                    onChange={(e) => setPoeLoads(prev => ({ ...prev, [item.key]: parseInt(e.target.value) || 0 }))}
                    className={`w-full h-8 px-2 rounded-lg border font-mono font-bold ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
              ))}
            </div>

            <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Нагрузка:</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                  {poeSummary.totalWatts}W из {poePsuWatts}W ({poeSummary.percent}%)
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                poeSummary.isOverload ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
              }`}>
                {poeSummary.isOverload ? 'ПЕРЕГРУЗКА БЛОКА ПИТАНИЯ' : `Свободно: ${poeSummary.remainingWatts}W`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End-to-End VLAN Wizard Modal */}
      <VlanWizardModal
        isOpen={isVlanWizardOpen}
        onClose={() => setIsVlanWizardOpen(false)}
        switches={switches}
        vlans={vlans}
        theme={theme}
        onReloadData={onReloadSwitches}
      />
    </div>
  );
}
