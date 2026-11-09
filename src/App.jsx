import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { api } from './api';
import { Header } from './components/Header';
import { SwitchCard } from './components/SwitchCard';
import { SwitchFaceplate } from './components/SwitchFaceplate';
import { SwitchModal } from './components/SwitchModal';
import { SwitchTemplatesModal } from './components/SwitchTemplatesModal';
import { VlanModal } from './components/VlanModal';
import { PortDrawer } from './components/PortDrawer';
import { ConfigModal } from './components/ConfigModal';
import { ConfigBackupModal } from './components/ConfigBackupModal';
import { ImportConfigModal } from './components/ImportConfigModal';
import { PatchPanelCard } from './components/PatchPanelCard';
import { PatchPanelFaceplate } from './components/PatchPanelFaceplate';
import { PatchPanelModal } from './components/PatchPanelModal';
import { PatchPanelPortDrawer } from './components/PatchPanelPortDrawer';
import { IpamModal } from './components/IpamModal';
import { IpamSubnetModal } from './components/IpamSubnetModal';
import { AlertsModal } from './components/AlertsModal';
import { runNetworkAudit } from './utils/networkAudit';
import { downloadCsv } from './utils/exportUtils';
import { Server, Plus, HardDrive, RefreshCw, Layers, Cable, Globe, MapPin, Activity, Wrench, BookOpen, Factory, BookMarked, AlertTriangle, Download, Search } from 'lucide-react';
import { EmptyState } from './components/EmptyState';

// Code-splitting for heavy tab views:
const RackView = lazy(() => import('./components/RackView').then(m => ({ default: m.RackView })));
const TopologyView = lazy(() => import('./components/TopologyView').then(m => ({ default: m.TopologyView })));
const IpamView = lazy(() => import('./components/IpamView').then(m => ({ default: m.IpamView })));
const ServersView = lazy(() => import('./components/ServersView').then(m => ({ default: m.ServersView })));
const CableJournalView = lazy(() => import('./components/CableJournalView').then(m => ({ default: m.CableJournalView })));
const FloorPlanView = lazy(() => import('./components/FloorPlanView'));
const NetworkToolsView = lazy(() => import('./components/NetworkToolsView'));
const NotesView = lazy(() => import('./components/NotesView'));
const DashboardView = lazy(() => import('./components/DashboardView'));
const AuditHistoryView = lazy(() => import('./components/AuditHistoryView'));
const CampusMapView = lazy(() => import('./components/CampusMapView'));
const CheatSheetView = lazy(() => import('./components/CheatSheetView'));

// Code-splitting for heavy on-demand modals:
const ReportModal = lazy(() => import('./components/ReportModal').then(m => ({ default: m.ReportModal })));
const NetworkAuditModal = lazy(() => import('./components/NetworkAuditModal').then(m => ({ default: m.NetworkAuditModal })));
const DeviceTraceModal = lazy(() => import('./components/DeviceTraceModal'));
const MacDiscoveryModal = lazy(() => import('./components/MacDiscoveryModal'));
const WebSshModal = lazy(() => import('./components/WebSshModal'));
const TroubleshooterModal = lazy(() => import('./components/TroubleshooterModal'));
const ActiveDirectoryModal = lazy(() => import('./components/ActiveDirectoryModal').then(m => ({ default: m.ActiveDirectoryModal })));
const PoeBudgetModal = lazy(() => import('./components/PoeBudgetModal').then(m => ({ default: m.PoeBudgetModal })));
const NetworkDiscoveryModal = lazy(() => import('./components/NetworkDiscoveryModal').then(m => ({ default: m.NetworkDiscoveryModal })));
const ConfigTemplateModal = lazy(() => import('./components/ConfigTemplateModal').then(m => ({ default: m.ConfigTemplateModal })));
import LoginModal from './components/LoginModal';
import UsersModal from './components/UsersModal';
import { useToast } from './context/ToastContext';
import { CommandPalette } from './components/CommandPalette';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { canEdit, isAdmin, role } = useAuth();
  const toast = useToast();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [switches, setSwitches] = useState([]);
  const [vlans, setVlans] = useState([]);
  const [patchPanels, setPatchPanels] = useState([]);
  const [ipAllocations, setIpAllocations] = useState([]);
  const [floorPlans, setFloorPlans] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [servers, setServers] = useState([]);

  const [selectedSwitchId, setSelectedSwitchId] = useState(() => {
    try {
      return localStorage.getItem('switchbook_selected_switch_id') || null;
    } catch {
      return null;
    }
  });

  const [selectedPatchPanelId, setSelectedPatchPanelId] = useState(() => {
    try {
      return localStorage.getItem('switchbook_selected_pp_id') || null;
    } catch {
      return null;
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [currentView, setCurrentView] = useState(() => {
    try {
      const saved = localStorage.getItem('switchbook_active_view');
      const validViews = [
        'switches', 'patchPanels', 'ipam', 'rack', 'topology',
        'floorPlans', 'campus', 'servers', 'cableJournal',
        'tools', 'notes', 'dashboard', 'audit', 'cheatsheet'
      ];
      if (saved && validViews.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load active view from localStorage', e);
    }
    return 'switches';
  });

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_active_view', currentView);
    } catch (e) {
      console.warn('Failed to save active view to localStorage', e);
    }
  }, [currentView]);

  useEffect(() => {
    try {
      if (selectedSwitchId) {
        localStorage.setItem('switchbook_selected_switch_id', selectedSwitchId);
      } else {
        localStorage.removeItem('switchbook_selected_switch_id');
      }
    } catch (e) {
      console.warn('Failed to save selectedSwitchId to localStorage', e);
    }
  }, [selectedSwitchId]);

  useEffect(() => {
    try {
      if (selectedPatchPanelId) {
        localStorage.setItem('switchbook_selected_pp_id', selectedPatchPanelId);
      } else {
        localStorage.removeItem('switchbook_selected_pp_id');
      }
    } catch (e) {
      console.warn('Failed to save selectedPatchPanelId to localStorage', e);
    }
  }, [selectedPatchPanelId]);

  // Device Trace & Live Ping Modal state
  const [isDeviceTraceOpen, setIsDeviceTraceOpen] = useState(false);

  // Live MAC Discovery Modal state
  const [isMacDiscoveryOpen, setIsMacDiscoveryOpen] = useState(false);
  const [macDiscoverySwitch, setMacDiscoverySwitch] = useState(null);

  // Live Web-SSH Modal state
  const [isWebSshOpen, setIsWebSshOpen] = useState(false);
  const [webSshSwitch, setWebSshSwitch] = useState(null);

  // Intelligent Troubleshooter Modal state
  const [isTroubleshootOpen, setIsTroubleshootOpen] = useState(false);
  const [troubleshootSwitchId, setTroubleshootSwitchId] = useState(null);

  // IPAM modals state
  const [isIpamModalOpen, setIsIpamModalOpen] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [editingIpAllocation, setEditingIpAllocation] = useState(null);
  const [targetVlanForIp, setTargetVlanForIp] = useState(null);
  const [isSubnetModalOpen, setIsSubnetModalOpen] = useState(false);
  const [editingSubnetVlan, setEditingSubnetVlan] = useState(null);

  // New features modals state: PoE, Network Discovery, Config Templates
  const [isPoeModalOpen, setIsPoeModalOpen] = useState(false);
  const [poeModalSwitchId, setPoeModalSwitchId] = useState(null);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
  const [isConfigTemplatesModalOpen, setIsConfigTemplatesModalOpen] = useState(false);

  // Zoom scale state: 70% to 150%
  const [zoomLevel, setZoomLevel] = useState(() => {
    return parseInt(localStorage.getItem('switchbook_zoom')) || 100;
  });

  const handleZoomChange = (newZoom) => {
    const clamped = Math.max(70, Math.min(150, newZoom));
    setZoomLevel(clamped);
    localStorage.setItem('switchbook_zoom', clamped);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomChange(zoomLevel + 10);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomChange(zoomLevel - 10);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomChange(100);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault();
        setIsDeviceTraceOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomLevel]);

  // Theme state: dark / light (with prefers-color-scheme detection)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('switchbook_theme');
    if (saved) return saved;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('switchbook_theme', next);
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Dynamic document.title reflecting active view
  useEffect(() => {
    const VIEW_TITLES = {
      dashboard: 'Дашборд сети',
      switches: 'Коммутаторы',
      servers: 'Серверы & ВМ',
      patchPanels: 'Патч-панели',
      cables: 'Кабели & Маркировка',
      ipam: 'IPAM подсети',
      rack: 'Стойка 42U',
      topology: 'Топология сети',
      campus: 'Карта завода',
      floorPlans: 'Планы этажей',
      cheatSheet: 'Шпаргалка CLI',
      tools: 'Сетевые утилиты',
      notes: 'Заметки инженера',
      history: 'История изменений'
    };
    const title = VIEW_TITLES[currentView] || 'Управление сетью';
    document.title = `SwitchBook — ${title}`;
  }, [currentView]);

  // Modals state
  const [loadError, setLoadError] = useState(null);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [editingSwitch, setEditingSwitch] = useState(null);
  const [isVlanModalOpen, setIsVlanModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configSwitch, setConfigSwitch] = useState(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [backupSwitch, setBackupSwitch] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [networkAlerts, setNetworkAlerts] = useState(() => {
    return [
      {
        id: 'al-1',
        severity: 'critical',
        type: 'error',
        title: 'CRC-ошибки на магистрали (Port Flapping)',
        source: 'sw-dist-snr:p24 ➔ sw-access-unifi:p24',
        desc: 'Обнаружен всплеск входящих ошибок передачи (CRC InErrors: 14). Возможно повреждение патч-корда Cat.6.',
        time: '5 мин назад',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        switchId: 'sw-dist-snr',
        acknowledged: false
      },
      {
        id: 'al-2',
        severity: 'warning',
        type: 'warning',
        title: 'Утилизация полосы пропускания > 82%',
        source: 'sw-core-mikrotik:sfp-sfpplus1',
        desc: 'Текущий суммарный трафик превысил 820 Мбит/с на канале ядра сети.',
        time: '18 мин назад',
        timestamp: new Date(Date.now() - 1080000).toISOString(),
        switchId: 'sw-core-mikrotik',
        acknowledged: false
      },
      {
        id: 'al-3',
        severity: 'warning',
        type: 'warning',
        title: 'Высокое потребление PoE на этаже',
        source: 'sw-dist-snr (Кроссовая 201)',
        desc: 'Потребление PoE портами камер и точек доступа достигло 85% от расчетного лимита.',
        time: '45 мин назад',
        timestamp: new Date(Date.now() - 2700000).toISOString(),
        switchId: 'sw-dist-snr',
        acknowledged: true
      },
      {
        id: 'al-4',
        severity: 'info',
        type: 'info',
        title: 'Восстановление линка STP / RSTP',
        source: 'sw-access-unifi',
        desc: 'Топология Spanning Tree стабилизирована, альтернативный путь заблокирован.',
        time: '2 часа назад',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        switchId: 'sw-access-unifi',
        acknowledged: true
      }
    ];
  });
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(() => {
    return localStorage.getItem('switchbook_alert_sound') !== 'false';
  });

  const toggleAlertSound = () => {
    setAlertSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('switchbook_alert_sound', next ? 'true' : 'false');
      return next;
    });
  };

  const playAlertBuzzer = () => {
    if (!alertSoundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  };

  // Fetch real-time alerts from SNMP daemon
  const fetchNetworkAlerts = async () => {
    try {
      const serverAlerts = await api.getNetworkAlerts(150);
      if (Array.isArray(serverAlerts) && serverAlerts.length > 0) {
        setNetworkAlerts(prev => {
          const prevIds = new Set(prev.map(a => a.id));
          const hasNewCritical = serverAlerts.some(
            a => !prevIds.has(a.id) && !a.acknowledged && (a.level === 'critical' || a.severity === 'critical')
          );
          if (hasNewCritical) {
            playAlertBuzzer();
          }
          return serverAlerts;
        });
      }
    } catch (err) {
      // Silence network errors on polling
    }
  };

  useEffect(() => {
    fetchNetworkAlerts();
    const alertInterval = setInterval(fetchNetworkAlerts, 9000);
    return () => clearInterval(alertInterval);
  }, []);

  const handleAcknowledgeAlert = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
    } catch (err) {
      console.error('Ошибка квитирования:', err);
    }
    setNetworkAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  };

  const handleClearAllAlerts = async () => {
    try {
      await api.clearAlerts();
    } catch (err) {
      console.error('Ошибка очистки алертов:', err);
    }
    setNetworkAlerts([]);
  };

  const unreadAlertsCount = useMemo(() => {
    return networkAlerts.filter(a => !a.acknowledged).length;
  }, [networkAlerts]);

  // Network audit summary
  const auditSummary = useMemo(() => {
    return runNetworkAudit({ switches, vlans, patchPanels, ipAllocations });
  }, [switches, vlans, patchPanels, ipAllocations]);

  // Patch Panel modals state
  const [isPatchPanelModalOpen, setIsPatchPanelModalOpen] = useState(false);
  const [editingPatchPanel, setEditingPatchPanel] = useState(null);
  const [isPatchPortDrawerOpen, setIsPatchPortDrawerOpen] = useState(false);
  const [targetPatchPort, setTargetPatchPort] = useState(null);

  // Switch Port drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetPorts, setTargetPorts] = useState([]);

  // Load initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [swList, vlList, ppList, ipList, fpList, ntList, srvList, bldList] = await Promise.all([
        api.getSwitches(),
        api.getVlans(),
        api.getPatchPanels(),
        api.getIpAllocations(),
        api.getFloorPlans(),
        api.getNotes(),
        api.getServers(),
        api.getBuildings()
      ]);
      setSwitches(swList);
      setVlans(vlList);
      setPatchPanels(ppList);
      setIpAllocations(ipList || []);
      setFloorPlans(fpList || []);
      setNotes(ntList || []);
      setServers(srvList || []);
      setBuildings(bldList || []);

      if (swList.length > 0) {
        setSelectedSwitchId(prev => {
          if (prev && swList.some(s => s.id === prev)) return prev;
          const saved = localStorage.getItem('switchbook_selected_switch_id');
          if (saved && swList.some(s => s.id === saved)) return saved;
          return swList[0].id;
        });
      }
      if (ppList.length > 0) {
        setSelectedPatchPanelId(prev => {
          if (prev && ppList.some(p => p.id === prev)) return prev;
          const saved = localStorage.getItem('switchbook_selected_pp_id');
          if (saved && ppList.some(p => p.id === saved)) return saved;
          return ppList[0].id;
        });
      }
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setLoadError(err.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const reloadNotes = async () => {
    try {
      const data = await api.getNotes();
      setNotes(data || []);
    } catch (err) {
      console.error('Ошибка загрузки заметок:', err);
    }
  };

  const reloadServers = async () => {
    try {
      const data = await api.getServers();
      setServers(data || []);
    } catch (err) {
      console.error('Ошибка загрузки серверов:', err);
    }
  };

  const handleAddIpFromScanner = (hostInfo) => {
    setEditingIpAllocation({
      ip: hostInfo.ip,
      mac: hostInfo.mac || '',
      hostname: hostInfo.hostname || '',
      type: 'workstation',
      status: 'active'
    });
    setTargetVlanForIp(vlans[0]?.id || 1);
    setIsIpamModalOpen(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter switches by search query
  const filteredSwitches = useMemo(() => {
    if (!searchQuery.trim()) return switches;
    const q = searchQuery.toLowerCase().trim();

    return switches.filter(sw => {
      const matchesBasic =
        sw.name?.toLowerCase().includes(q) ||
        sw.ip?.toLowerCase().includes(q) ||
        sw.model?.toLowerCase().includes(q) ||
        sw.vendor?.toLowerCase().includes(q) ||
        sw.location?.toLowerCase().includes(q) ||
        sw.mac?.toLowerCase().includes(q) ||
        sw.notes?.toLowerCase().includes(q);

      if (matchesBasic) return true;

      const vlanNum = parseInt(q);
      const matchesPort = (sw.ports || []).some(p => {
        if (!isNaN(vlanNum) && (p.pvid === vlanNum || (p.taggedVlans && p.taggedVlans.includes(vlanNum)))) {
          return true;
        }
        return (
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.connectedTo?.toLowerCase().includes(q)
        );
      });

      return matchesPort;
    });
  }, [switches, searchQuery]);

  // Filter patch panels by search query
  const filteredPatchPanels = useMemo(() => {
    if (!searchQuery.trim()) return patchPanels;
    const q = searchQuery.toLowerCase().trim();

    return patchPanels.filter(pp => {
      const matchesBasic =
        pp.name?.toLowerCase().includes(q) ||
        pp.model?.toLowerCase().includes(q) ||
        pp.location?.toLowerCase().includes(q) ||
        pp.notes?.toLowerCase().includes(q);

      if (matchesBasic) return true;

      return (pp.ports || []).some(p => {
        return (
          p.room?.toLowerCase().includes(q) ||
          p.socket?.toLowerCase().includes(q) ||
          p.cableMark?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      });
    });
  }, [patchPanels, searchQuery]);

  const activeSwitch = switches.find(s => s.id === selectedSwitchId) || (filteredSwitches.length > 0 ? filteredSwitches[0] : null);
  const activePatchPanel = patchPanels.find(p => p.id === selectedPatchPanelId) || (filteredPatchPanels.length > 0 ? filteredPatchPanels[0] : null);

  // Switch handlers
  const handleSelectTemplateFromCatalog = (template) => {
    setEditingSwitch({
      name: `sw-${template.vendor.toLowerCase()}-${(template.model.split(' ')[0] || '').toLowerCase()}`,
      vendor: template.vendor,
      model: template.model,
      badge: template.badge || '',
      color: template.color || '#3b82f6',
      copperPorts: template.copperPorts,
      sfpPorts: template.sfpPorts,
      portLayout: template.portLayout,
      portsPerGroup: template.portsPerGroup,
      sfpPosition: template.sfpPosition,
      ip: template.defaultIp || '192.168.1.1',
      mac: '',
      location: 'Серверная 1, Стойка 1',
      notes: template.description || '',
      poe: template.poe,
      poeBudget: template.poeBudget
    });
    setIsTemplatesModalOpen(false);
    setIsSwitchModalOpen(true);
  };

  const handleOpenNewSwitch = () => {
    setEditingSwitch(null);
    setIsSwitchModalOpen(true);
  };

  const handleExportSwitchesListCsv = () => {
    const headers = [
      'Имя коммутатора',
      'Вендор',
      'Модель',
      'Серийный номер',
      'IP-адрес',
      'MAC-адрес',
      'Расположение',
      'Всего портов',
      'Занято портов',
      'Свободно портов',
      'Загрузка (%)',
      'SNMP статус',
      'SNMP Community',
      'SNMP Порт'
    ];
    const rows = (switches || []).map(sw => {
      const ports = sw.ports || [];
      const total = ports.length;
      const occupied = ports.filter(p => p.connectedTo || p.linkedSwitchId || p.patchPanelId).length;
      const free = total - occupied;
      const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
      return [
        sw.name || '',
        sw.vendor || '',
        sw.model || '',
        sw.serialNumber || '',
        sw.ip || '',
        sw.mac || '',
        sw.location || '',
        total,
        occupied,
        free,
        `${pct}%`,
        sw.snmpEnabled !== false ? 'Включен' : 'Отключен',
        sw.snmpCommunity || 'public',
        sw.snmpPort || 161
      ];
    });
    downloadCsv('Реестр_коммутаторов', headers, rows);
  };

  const handleEditSwitch = (sw) => {
    setEditingSwitch(sw);
    setIsSwitchModalOpen(true);
  };

  const handleSaveSwitch = async (data) => {
    try {
      if (editingSwitch && editingSwitch.id) {
        const updated = await api.updateSwitch(editingSwitch.id, data);
        setSwitches(prev => prev.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await api.createSwitch(data);
        setSwitches(prev => [...prev, created]);
        setSelectedSwitchId(created.id);
      }
      setIsSwitchModalOpen(false);
      setEditingSwitch(null);
    } catch (err) {
      toast.error(`Ошибка: ${err.message}`);
      throw err;
    }
  };

  const handleDeleteSwitch = async (id) => {
    const sw = switches.find(s => s.id === id);
    if (!window.confirm(`Вы действительно хотите удалить коммутатор "${sw?.name || id}"?`)) return;

    try {
      await api.deleteSwitch(id);
      const rest = switches.filter(s => s.id !== id);
      setSwitches(rest);
      if (selectedSwitchId === id) {
        setSelectedSwitchId(rest.length > 0 ? rest[0].id : null);
      }
      // Refresh patch panels to reflect unpatched ports
      const pps = await api.getPatchPanels();
      setPatchPanels(pps);
    } catch (err) {
      toast.error(`Ошибка удаления: ${err.message}`);
    }
  };

  // Jump to peer switch & port
  const handleJumpToPeer = (peerSwitchId, peerPortId) => {
    setSelectedSwitchId(peerSwitchId);
    setTimeout(() => {
      const targetSw = switches.find(s => s.id === peerSwitchId);
      if (targetSw && peerPortId) {
        const targetP = targetSw.ports?.find(p => p.id === peerPortId || p.number === peerPortId);
        if (targetP) {
          setTargetPorts([targetP]);
          setDrawerOpen(true);
        }
      }
    }, 100);
  };

  // Switch Port editing handlers
  const handleOpenPortDrawer = (portsToEdit) => {
    setTargetPorts(portsToEdit);
    setDrawerOpen(true);
  };

  const handleSavePorts = async (updateData) => {
    if (!activeSwitch || targetPorts.length === 0) return;

    try {
      if (targetPorts.length === 1) {
        const portId = targetPorts[0].id;
        await api.updatePort(activeSwitch.id, portId, updateData);
        await fetchData();
      } else {
        const portIds = targetPorts.map(p => p.id);
        const updatedSwitch = await api.batchUpdatePorts(activeSwitch.id, portIds, updateData);
        setSwitches(prev => prev.map(sw => sw.id === updatedSwitch.id ? updatedSwitch : sw));
      }
      setDrawerOpen(false);
    } catch (err) {
      toast.error(`Ошибка сохранения портов: ${err.message}`);
    }
  };

  // Patch Panel handlers
  const handleOpenNewPatchPanel = () => {
    setEditingPatchPanel(null);
    setIsPatchPanelModalOpen(true);
  };

  const handleEditPatchPanel = (pp) => {
    setEditingPatchPanel(pp);
    setIsPatchPanelModalOpen(true);
  };

  const handleSavePatchPanel = async (data) => {
    try {
      if (editingPatchPanel) {
        const updated = await api.updatePatchPanel(editingPatchPanel.id, data);
        setPatchPanels(prev => prev.map(p => p.id === updated.id ? updated : p));
      } else {
        const created = await api.createPatchPanel(data);
        setPatchPanels(prev => [...prev, created]);
        setSelectedPatchPanelId(created.id);
      }
      setIsPatchPanelModalOpen(false);
    } catch (err) {
      toast.error(`Ошибка сохранения патч-панели: ${err.message}`);
    }
  };

  const handleDeletePatchPanel = async (id) => {
    const pp = patchPanels.find(p => p.id === id);
    if (!window.confirm(`Удалить патч-панель "${pp?.name || id}"?`)) return;

    try {
      await api.deletePatchPanel(id);
      const rest = patchPanels.filter(p => p.id !== id);
      setPatchPanels(rest);
      if (selectedPatchPanelId === id) {
        setSelectedPatchPanelId(rest.length > 0 ? rest[0].id : null);
      }
      // Refresh switches to clear patchPanel references
      const swList = await api.getSwitches();
      setSwitches(swList);
    } catch (err) {
      toast.error(`Ошибка удаления: ${err.message}`);
    }
  };

  const handleOpenPatchPortDrawer = (port) => {
    setTargetPatchPort(port);
    setIsPatchPortDrawerOpen(true);
  };

  const handleSavePatchPort = async (portId, portUpdate) => {
    if (!activePatchPanel) return;

    try {
      await api.updatePatchPanelPort(activePatchPanel.id, portId, portUpdate);
      await fetchData();
      setIsPatchPortDrawerOpen(false);
    } catch (err) {
      toast.error(`Ошибка обновления порта патч-панели: ${err.message}`);
    }
  };

  const handleJumpToSwitch = (swId, swPortId) => {
    setSelectedSwitchId(swId);
    setCurrentView('switches');
    if (swPortId) {
      setTimeout(() => {
        const sw = switches.find(s => s.id === swId);
        const p = sw?.ports?.find(prt => prt.id === swPortId || prt.number === swPortId);
        if (p) {
          setTargetPorts([p]);
          setDrawerOpen(true);
        }
      }, 100);
    }
  };

  // IPAM handlers
  const handleOpenAddIp = (vlanId = null) => {
    setEditingIpAllocation(null);
    setTargetVlanForIp(vlanId);
    setIsIpamModalOpen(true);
  };

  const handleEditIp = (ipItem) => {
    setEditingIpAllocation(ipItem);
    setTargetVlanForIp(ipItem.vlanId);
    setIsIpamModalOpen(true);
  };

  const handleSaveIpAllocation = async (data) => {
    try {
      if (editingIpAllocation) {
        const updated = await api.updateIpAllocation(editingIpAllocation.id, data);
        setIpAllocations(prev => prev.map(item => item.id === updated.id ? updated : item));
      } else {
        const created = await api.createIpAllocation(data);
        setIpAllocations(prev => [...prev, created]);
      }
      setIsIpamModalOpen(false);
    } catch (err) {
      toast.error(`Ошибка сохранения IP: ${err.message}`);
    }
  };

  const handleDeleteIpAllocation = async (id) => {
    try {
      await api.deleteIpAllocation(id);
      setIpAllocations(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      toast.error(`Ошибка удаления IP: ${err.message}`);
    }
  };

  const handleConfigureSubnet = (vlan) => {
    setEditingSubnetVlan(vlan);
    setIsSubnetModalOpen(true);
  };

  const handleSaveSubnet = async (subnetData) => {
    if (!editingSubnetVlan) return;
    try {
      const updatedVlan = {
        ...editingSubnetVlan,
        ...subnetData
      };
      await api.updateVlan(editingSubnetVlan.id, updatedVlan);
      await fetchData();
      setIsSubnetModalOpen(false);
    } catch (err) {
      toast.error(`Ошибка сохранения подсети: ${err.message}`);
    }
  };

  // Quick fix handler for Network Audit
  const handleQuickFix = async (fix) => {
    if (fix.type === 'sync_trunk_vlans') {
      await Promise.all([
        api.updatePort(fix.switchAId, fix.portAId, { taggedVlans: fix.mergedVlans }),
        api.updatePort(fix.switchBId, fix.portBId, { taggedVlans: fix.mergedVlans })
      ]);
      await fetchData();
    } else if (fix.type === 'create_vlan') {
      await api.createVlan({ id: fix.vlanId, name: `VLAN ${fix.vlanId}`, color: '#3b82f6' });
      await fetchData();
    } else if (fix.type === 'disable_unused_port') {
      await api.updatePort(fix.switchId, fix.portId, { enabled: false, mode: 'disabled' });
      await fetchData();
    } else if (fix.type === 'set_port_pvid') {
      await api.updatePort(fix.switchId, fix.portId, { pvid: fix.pvid });
      await fetchData();
    } else if (fix.type === 'set_snmp_community') {
      const sw = switches.find(s => s.id === fix.switchId);
      if (sw) {
        await api.updateSwitch(fix.switchId, { ...sw, snmpCommunity: fix.community });
        await fetchData();
      }
    }
  };

  const isLight = theme === 'light';

  return (
    <div
      style={{ zoom: `${zoomLevel}%` }}
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isLight ? 'bg-slate-100 text-slate-800' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Top Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenNewSwitch={handleOpenNewSwitch}
        onOpenTemplatesModal={() => setIsTemplatesModalOpen(true)}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenVlanModal={() => setIsVlanModalOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        onOpenDeviceTrace={() => setIsDeviceTraceOpen(true)}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        onOpenTroubleshoot={(swId) => {
          setTroubleshootSwitchId(swId || selectedSwitchId || switches[0]?.id);
          setIsTroubleshootOpen(true);
        }}
        onOpenPoeModal={(swId) => {
          setPoeModalSwitchId(swId || selectedSwitchId || switches[0]?.id);
          setIsPoeModalOpen(true);
        }}
        onOpenDiscoveryModal={() => setIsDiscoveryModalOpen(true)}
        onOpenConfigTemplatesModal={() => setIsConfigTemplatesModalOpen(true)}
        unreadAlertsCount={unreadAlertsCount}
        auditIssuesCount={auditSummary.counts.total}
        auditHealthScore={auditSummary.healthScore}
        vlansCount={vlans.length}
        switchesCount={switches.length}
        patchPanelsCount={patchPanels.length}
        onDatabaseRestored={fetchData}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentView={currentView}
        onViewChange={setCurrentView}
        zoomLevel={zoomLevel}
        onZoomIn={() => handleZoomChange(zoomLevel + 10)}
        onZoomOut={() => handleZoomChange(zoomLevel - 10)}
        onZoomReset={() => handleZoomChange(100)}
        onOpenUsersModal={() => setIsUsersModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        onOpenAdModal={() => setIsAdModalOpen(true)}
      />

      {/* Main Layout */}
      <main className="flex-1 w-full mx-auto px-3 sm:px-5 lg:px-6 py-4">
        {loadError && (
          <div className="mb-4 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Не удалось загрузить данные с сервера: {loadError}. Проверьте подключение к сети.</span>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer transition-colors shrink-0"
            >
              Повторить
            </button>
          </div>
        )}
        <Suspense fallback={
          <div className="space-y-4 animate-pulse py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-28 rounded-2xl border ${isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-900/60 border-slate-800'}`} />
              ))}
            </div>
            <div className={`h-96 rounded-2xl border ${isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-900/60 border-slate-800'}`} />
          </div>
        }>
          {currentView === 'dashboard' ? (
          <DashboardView
            switches={switches}
            vlans={vlans}
            patchPanels={patchPanels}
            ipAllocations={ipAllocations}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onOpenAuditModal={() => setIsAuditModalOpen(true)}
            onOpenMacDiscovery={(sw) => {
              setMacDiscoverySwitch(sw);
              setIsMacDiscoveryOpen(true);
            }}
            onOpenPoeModal={(swId) => {
              setPoeModalSwitchId(swId || switches[0]?.id);
              setIsPoeModalOpen(true);
            }}
            theme={theme}
          />
        ) : currentView === 'servers' ? (
          <ServersView
            servers={servers}
            switches={switches}
            vlans={vlans}
            onReloadServers={reloadServers}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            theme={theme}
          />
        ) : currentView === 'rack' ? (
          <RackView
            switches={switches}
            patchPanels={patchPanels}
            servers={servers}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onSelectPatchPanel={(id) => {
              setSelectedPatchPanelId(id);
              setCurrentView('patchPanels');
            }}
            onSelectServer={(id) => {
              setCurrentView('servers');
            }}
            onReloadData={fetchData}
            onOpenAdModal={() => setIsAdModalOpen(true)}
            theme={theme}
          />
        ) : currentView === 'topology' ? (
          <TopologyView
            switches={switches}
            vlans={vlans}
            patchPanels={patchPanels}
            ipAllocations={ipAllocations}
            servers={servers}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onSelectPatchPanel={(id) => {
              setSelectedPatchPanelId(id);
              setCurrentView('patchPanels');
            }}
            onSelectServer={(id) => {
              setCurrentView('servers');
            }}
            onOpenPortDrawer={(ports, swId) => {
              if (swId) setSelectedSwitchId(swId);
              handleOpenPortDrawer(ports);
            }}
            onOpenPatchPortDrawer={handleOpenPatchPortDrawer}
            onReloadData={fetchData}
            onNavigateToIpam={() => setCurrentView('ipam')}
            theme={theme}
          />
        ) : currentView === 'ipam' ? (
          <IpamView
            vlans={vlans}
            ipAllocations={ipAllocations}
            servers={servers}
            switches={switches}
            patchPanels={patchPanels}
            onOpenCreateIpModal={handleOpenAddIp}
            onOpenEditIpModal={handleEditIp}
            onDeleteIp={handleDeleteIpAllocation}
            onOpenEditSubnetModal={handleConfigureSubnet}
            onReloadIpam={fetchData}
            onSelectServer={(id) => {
              setCurrentView('servers');
            }}
            onOpenAdModal={() => setIsAdModalOpen(true)}
            theme={theme}
          />
        ) : currentView === 'campus' ? (
          <CampusMapView
            buildings={buildings}
            switches={switches}
            patchPanels={patchPanels}
            floorPlans={floorPlans}
            onReloadBuildings={fetchData}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onNavigateToFloorPlan={() => setCurrentView('floorPlans')}
            theme={theme}
          />
        ) : currentView === 'floorPlans' ? (
          <FloorPlanView
            floorPlans={floorPlans}
            patchPanels={patchPanels}
            switches={switches}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onOpenDeviceTrace={() => {
              setIsDeviceTraceOpen(true);
            }}
            onReloadFloorPlans={fetchData}
            theme={theme}
          />
        ) : currentView === 'cheatSheet' ? (
          <CheatSheetView
            theme={theme}
          />
        ) : currentView === 'tools' ? (
          <NetworkToolsView
            vlans={vlans}
            switches={switches}
            ipAllocations={ipAllocations}
            onAddIpToIpam={handleAddIpFromScanner}
            onReloadSwitches={fetchData}
            onNavigateToTopology={() => setCurrentView('topology')}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onOpenTroubleshoot={(swId) => {
              setTroubleshootSwitchId(swId || selectedSwitchId || switches[0]?.id);
              setIsTroubleshootOpen(true);
            }}
            onOpenAudit={() => setIsAuditModalOpen(true)}
            theme={theme}
          />
        ) : currentView === 'notes' ? (
          <NotesView
            notes={notes}
            onReloadNotes={reloadNotes}
            theme={theme}
          />
        ) : currentView === 'history' ? (
          <AuditHistoryView
            switches={switches}
            vlans={vlans}
            onRestoreCompleted={fetchData}
            theme={theme}
          />
        ) : currentView === 'cables' ? (
          <CableJournalView
            patchPanels={patchPanels}
            switches={switches}
            vlans={vlans}
            servers={servers}
            onReloadData={fetchData}
            onSelectSwitch={(id) => {
              setSelectedSwitchId(id);
              setCurrentView('switches');
            }}
            onSelectPatchPanel={(id) => {
              setSelectedPatchPanelId(id);
              setCurrentView('patchPanels');
            }}
            theme={theme}
          />
        ) : currentView === 'patchPanels' ? (
          /* Patch Panels View */
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Sidebar: Patch Panels list */}
            <aside className="w-full lg:w-80 shrink-0 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Патч-панели ({filteredPatchPanels.length})
                </span>
                <button
                  onClick={handleOpenNewPatchPanel}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить
                </button>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-xs">Загрузка данных...</span>
                </div>
              ) : filteredPatchPanels.length === 0 ? (
                <EmptyState
                  compact
                  theme={theme}
                  icon={searchQuery ? Search : Layers}
                  title={searchQuery ? 'Ничего не найдено' : 'Нет патч-панелей'}
                  description={searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первую панель'}
                />
              ) : (
                <div className="space-y-2.5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
                  {filteredPatchPanels.map(pp => (
                    <PatchPanelCard
                      key={pp.id}
                      panelItem={pp}
                      isSelected={activePatchPanel?.id === pp.id}
                      onSelect={() => setSelectedPatchPanelId(pp.id)}
                      theme={theme}
                    />
                  ))}
                </div>
              )}
            </aside>

            {/* Right Content: Active Patch Panel Faceplate / Table */}
            <section className="flex-1 min-w-0">
              {activePatchPanel ? (
                <PatchPanelFaceplate
                  key={activePatchPanel.id}
                  panelData={activePatchPanel}
                  allSwitches={switches}
                  onOpenPortDrawer={handleOpenPatchPortDrawer}
                  onEditPanel={handleEditPatchPanel}
                  onDeletePanel={handleDeletePatchPanel}
                  onJumpToSwitch={handleJumpToSwitch}
                  onBackToList={() => setSelectedPatchPanelId(null)}
                  theme={theme}
                />
              ) : (
                <EmptyState
                  theme={theme}
                  icon={Cable}
                  title="Патч-панель не выбрана"
                  description="Выберите панель из списка слева или добавьте новую для визуализации СКС и кабельного журнала розеток."
                  action={canEdit ? {
                    label: 'Добавить патч-панель',
                    icon: Plus,
                    onClick: handleOpenNewPatchPanel
                  } : null}
                />
              )}
            </section>
          </div>
        ) : (
          /* Switches View */
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Sidebar: Switch list */}
            <aside className="w-full lg:w-80 shrink-0 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Коммутаторы ({filteredSwitches.length})
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleExportSwitchesListCsv}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="Экспорт реестра коммутаторов в Excel (CSV)"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={handleOpenNewSwitch}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Добавить
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-xs">Загрузка данных...</span>
                </div>
              ) : filteredSwitches.length === 0 ? (
                <EmptyState
                  compact
                  theme={theme}
                  icon={searchQuery ? Search : Server}
                  title={searchQuery ? 'Ничего не найдено' : 'Нет коммутаторов'}
                  description={searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первое устройство'}
                />
              ) : (
                <div className="space-y-2.5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
                  {filteredSwitches.map(sw => (
                    <SwitchCard
                      key={sw.id}
                      switchItem={sw}
                      allSwitches={switches}
                      isSelected={activeSwitch?.id === sw.id}
                      onSelect={() => setSelectedSwitchId(sw.id)}
                      onOpenWebSsh={(sw) => {
                        setWebSshSwitch(sw);
                        setIsWebSshOpen(true);
                      }}
                      onOpenTroubleshoot={(swId) => {
                        setTroubleshootSwitchId(swId);
                        setIsTroubleshootOpen(true);
                      }}
                      onOpenPoeModal={(swId) => {
                        setPoeModalSwitchId(swId);
                        setIsPoeModalOpen(true);
                      }}
                      theme={theme}
                    />
                  ))}
                </div>
              )}
            </aside>

            {/* Right Content: Active Switch Faceplate / Table */}
            <section className="flex-1 min-w-0">
              {activeSwitch ? (
                <SwitchFaceplate
                  key={activeSwitch.id}
                  switchData={activeSwitch}
                  allSwitches={switches}
                  vlans={vlans}
                  ipAllocations={ipAllocations}
                  servers={servers}
                  onOpenPortDrawer={handleOpenPortDrawer}
                  onEditSwitch={handleEditSwitch}
                  onDeleteSwitch={handleDeleteSwitch}
                  onJumpToPeer={handleJumpToPeer}
                  onOpenConfigModal={(sw) => {
                    setConfigSwitch(sw);
                    setIsConfigModalOpen(true);
                  }}
                  onOpenBackupModal={(sw) => {
                    setBackupSwitch(sw);
                    setIsBackupModalOpen(true);
                  }}
                  onOpenMacDiscovery={(sw) => {
                    setMacDiscoverySwitch(sw);
                    setIsMacDiscoveryOpen(true);
                  }}
                  onOpenWebSsh={(sw) => {
                    setWebSshSwitch(sw);
                    setIsWebSshOpen(true);
                  }}
                  onOpenTroubleshoot={(swId) => {
                    setTroubleshootSwitchId(swId || activeSwitch.id);
                    setIsTroubleshootOpen(true);
                  }}
                  onBackToList={() => setSelectedSwitchId(null)}
                  onReloadData={fetchData}
                  theme={theme}
                />
              ) : (
                <EmptyState
                  theme={theme}
                  icon={HardDrive}
                  title="Коммутатор не выбран"
                  description="Выберите коммутатор из списка слева или добавьте новый, чтобы просмотреть его лицевую панель и настроить порты."
                  action={canEdit ? {
                    label: 'Добавить коммутатор',
                    icon: Plus,
                    onClick: handleOpenNewSwitch
                  } : null}
                />
              )}
            </section>
          </div>
        )}
        </Suspense>
      </main>

      {/* Switch Modals & Drawers */}
      <SwitchModal
        isOpen={isSwitchModalOpen}
        onClose={() => {
          setIsSwitchModalOpen(false);
          setEditingSwitch(null);
        }}
        switchData={editingSwitch}
        onSave={handleSaveSwitch}
        theme={theme}
      />

      <SwitchTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={handleSelectTemplateFromCatalog}
        theme={theme}
      />

      <VlanModal
        isOpen={isVlanModalOpen}
        onClose={() => setIsVlanModalOpen(false)}
        vlans={vlans}
        onVlansUpdated={fetchData}
        theme={theme}
      />

      <PortDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        targetPorts={targetPorts}
        vlans={vlans}
        allSwitches={switches}
        patchPanels={patchPanels}
        ipAllocations={ipAllocations}
        servers={servers}
        currentSwitchId={activeSwitch?.id}
        onSave={handleSavePorts}
        theme={theme}
      />

      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        switchData={configSwitch}
        vlans={vlans}
        onOpenBackupModal={(sw) => {
          setBackupSwitch(sw);
          setIsBackupModalOpen(true);
        }}
        theme={theme}
      />

      <ConfigBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        switchData={backupSwitch || activeSwitch}
        theme={theme}
      />

      <ImportConfigModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={async (importedData) => {
          try {
            const created = await api.createSwitch(importedData);
            setSwitches(prev => [...prev, created]);
            setSelectedSwitchId(created.id);
            setCurrentView('switches');
            toast.success(`Конфигурация «${created.name}» успешно импортирована`);
          } catch (err) {
            toast.error(`Ошибка импорта: ${err.message}`);
          }
        }}
        theme={theme}
      />

      {/* Patch Panel Modals & Drawers */}
      <PatchPanelModal
        isOpen={isPatchPanelModalOpen}
        onClose={() => setIsPatchPanelModalOpen(false)}
        panelData={editingPatchPanel}
        onSave={handleSavePatchPanel}
        theme={theme}
      />

      <PatchPanelPortDrawer
        isOpen={isPatchPortDrawerOpen}
        onClose={() => setIsPatchPortDrawerOpen(false)}
        targetPort={targetPatchPort}
        patchPanel={activePatchPanel}
        allSwitches={switches}
        onSave={handleSavePatchPort}
        theme={theme}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        switches={switches}
        patchPanels={patchPanels}
        vlans={vlans}
        ipAllocations={ipAllocations}
        servers={servers}
        activeSwitch={activeSwitch}
        theme={theme}
      />

      {/* IPAM Modals */}
      <IpamModal
        isOpen={isIpamModalOpen}
        onClose={() => setIsIpamModalOpen(false)}
        ipItem={editingIpAllocation}
        vlans={vlans}
        allAllocations={ipAllocations}
        switches={switches}
        patchPanels={patchPanels}
        initialVlanId={targetVlanForIp}
        onSave={handleSaveIpAllocation}
        theme={theme}
      />

      <IpamSubnetModal
        isOpen={isSubnetModalOpen}
        onClose={() => setIsSubnetModalOpen(false)}
        vlan={editingSubnetVlan}
        onSave={handleSaveSubnet}
        theme={theme}
      />

      {/* Network Audit Modal */}
      <NetworkAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        switches={switches}
        vlans={vlans}
        patchPanels={patchPanels}
        ipAllocations={ipAllocations}
        onNavigateToSwitch={(swId, portId) => {
          setSelectedSwitchId(swId);
          setCurrentView('switches');
          if (portId) {
            setTimeout(() => {
              const targetSw = switches.find(s => s.id === swId);
              const targetP = targetSw?.ports?.find(p => p.id === portId || p.number === portId);
              if (targetP) {
                setTargetPorts([targetP]);
                setDrawerOpen(true);
              }
            }, 120);
          }
        }}
        onNavigateToPatchPanel={(ppId, portId) => {
          setSelectedPatchPanelId(ppId);
          setCurrentView('patchPanels');
          if (portId) {
            setTimeout(() => {
              const targetPP = patchPanels.find(p => p.id === ppId);
              const targetP = targetPP?.ports?.find(p => p.id === portId || p.number === portId);
              if (targetP) {
                setTargetPatchPort(targetP);
                setIsPatchPortDrawerOpen(true);
              }
            }, 120);
          }
        }}
        onNavigateToIpam={(target) => {
          setCurrentView('ipam');
          if (typeof target === 'string') {
            setSearchQuery(target);
          }
        }}
        onNavigateToVlan={() => {
          setIsVlanModalOpen(true);
        }}
        onQuickFix={handleQuickFix}
        theme={theme}
      />

      {/* Live Device Trace & Diagnostics Modal */}
      <DeviceTraceModal
        isOpen={isDeviceTraceOpen}
        onClose={() => setIsDeviceTraceOpen(false)}
        onSelectSwitch={(swId) => {
          setSelectedSwitchId(swId);
          setCurrentView('switches');
        }}
        onSelectFloorPlan={(floorId) => {
          setCurrentView('floorPlans');
        }}
      />

      {/* Live Switch MAC Discovery Modal */}
      <MacDiscoveryModal
        isOpen={isMacDiscoveryOpen}
        onClose={() => setIsMacDiscoveryOpen(false)}
        switchItem={macDiscoverySwitch}
        onOpenDeviceTrace={(mac) => {
          setIsDeviceTraceOpen(true);
        }}
        onReloadSwitch={fetchData}
      />

      {/* Real-time Alerts & Syslog Event Modal */}
      <AlertsModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        events={networkAlerts}
        onAcknowledge={handleAcknowledgeAlert}
        onClearAll={handleClearAllAlerts}
        onSelectSwitch={(swId) => {
          setSelectedSwitchId(swId);
          setCurrentView('switches');
        }}
        soundEnabled={alertSoundEnabled}
        onToggleSound={toggleAlertSound}
        theme={theme}
      />

      {/* Interactive Web-SSH Terminal Modal */}
      <WebSshModal
        isOpen={isWebSshOpen}
        onClose={() => setIsWebSshOpen(false)}
        switchData={webSshSwitch}
        theme={theme}
      />

      {/* Intelligent Network Troubleshooter Modal */}
      <TroubleshooterModal
        isOpen={isTroubleshootOpen}
        onClose={() => setIsTroubleshootOpen(false)}
        initialSwitchId={troubleshootSwitchId}
        switches={switches}
        vlans={vlans}
        onNavigateToSwitch={(swId) => {
          setSelectedSwitchId(swId);
          setCurrentView('switches');
        }}
        onReloadData={fetchData}
        theme={theme}
      />

      {/* RBAC Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* RBAC Users Management Modal */}
      <UsersModal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
      />

      {/* Active Directory Integration Modal */}
      <Suspense fallback={null}>
        <ActiveDirectoryModal
          isOpen={isAdModalOpen}
          onClose={() => setIsAdModalOpen(false)}
          vlans={vlans}
          onSyncComplete={fetchData}
          theme={theme}
        />

        {/* PoE Power Budget Manager Modal */}
        <PoeBudgetModal
          isOpen={isPoeModalOpen}
          onClose={() => setIsPoeModalOpen(false)}
          switches={switches}
          selectedSwitchId={poeModalSwitchId}
          onUpdateSwitch={async (swId, updatedData) => {
            await api.updateSwitch(swId, updatedData);
            await fetchData();
          }}
          theme={theme}
        />

        {/* Network Auto-Discovery Scanner Modal */}
        <NetworkDiscoveryModal
          isOpen={isDiscoveryModalOpen}
          onClose={() => setIsDiscoveryModalOpen(false)}
          vlans={vlans}
          switches={switches}
          onReloadSwitches={fetchData}
          onAddIpToIpam={handleAddIpFromScanner}
          theme={theme}
        />

        {/* CLI Configuration Template Engine Modal */}
        <ConfigTemplateModal
          isOpen={isConfigTemplatesModalOpen}
          onClose={() => setIsConfigTemplatesModalOpen(false)}
          switches={switches}
          vlans={vlans}
          theme={theme}
        />
      </Suspense>

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        switches={switches}
        patchPanels={patchPanels}
        servers={servers}
        vlans={vlans}
        onNavigateView={setCurrentView}
        onSelectSwitch={(id) => {
          setSelectedSwitchId(id);
          setCurrentView('switches');
        }}
        onSelectPatchPanel={(id) => {
          setSelectedPatchPanelId(id);
          setCurrentView('patchPanels');
        }}
        onOpenNewSwitch={handleOpenNewSwitch}
        onOpenVlanModal={() => setIsVlanModalOpen(true)}
        onOpenAuditModal={() => setIsAuditModalOpen(true)}
        onOpenDiscoveryModal={() => setIsDiscoveryModalOpen(true)}
        onOpenPoeModal={(swId) => {
          setPoeModalSwitchId(swId || selectedSwitchId || switches[0]?.id);
          setIsPoeModalOpen(true);
        }}
        onOpenTroubleshoot={(swId) => {
          setTroubleshootSwitchId(swId || selectedSwitchId || switches[0]?.id);
          setIsTroubleshootOpen(true);
        }}
        onToggleTheme={toggleTheme}
        theme={theme}
      />
    </div>
  );
}
