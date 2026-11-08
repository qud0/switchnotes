import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Cable,
  Tag,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Edit2,
  Plus,
  Trash2,
  Layers,
  Server,
  Globe,
  RefreshCw,
  Sliders,
  FileSpreadsheet,
  Hash,
  Bookmark,
  Check,
  Eye,
  Copy,
  ExternalLink,
  ChevronDown,
  Zap,
  QrCode,
  Sparkles
} from 'lucide-react';
import { api } from '../api';
import { SvgQrCode } from './SvgQrCode';
import { PinoutGuideModal } from './PinoutGuideModal';
import { BatchRenumberModal } from './BatchRenumberModal';
import { useToast } from '../context/ToastContext';
import { TableColumnSelector } from './TableColumnSelector';

const CJ_TABLE_COLUMNS = [
  { key: 'mark', label: 'Маркировка', required: true },
  { key: 'room', label: 'Помещение / Рабочее место' },
  { key: 'socket', label: 'Розетка' },
  { key: 'panel', label: 'Патч-панель' },
  { key: 'cable', label: 'Трасса СКС' },
  { key: 'patchcord', label: 'Патч-корд' },
  { key: 'switch', label: 'Коммутатор & Порт' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'status', label: 'Статус' },
  { key: 'actions', label: 'Действия' }
];

const DEFAULT_CJ_COLUMNS = CJ_TABLE_COLUMNS.map(c => c.key);

const CJ_TABLE_PRESETS = [
  { id: 'all', label: 'Все колонки', columns: DEFAULT_CJ_COLUMNS },
  { id: 'cabling', label: 'Монтажник СКС', columns: ['mark', 'room', 'socket', 'panel', 'cable', 'patchcord', 'status', 'actions'] },
  { id: 'network', label: 'Сетевик / VLAN', columns: ['mark', 'room', 'socket', 'switch', 'vlan', 'status', 'actions'] },
  { id: 'summary', label: 'Компактный', columns: ['mark', 'room', 'socket', 'panel', 'switch', 'status', 'actions'] }
];

const CABLE_CATEGORIES = [
  'Cat.5e UTP (1 Gbps)',
  'Cat.6 UTP (1-10 Gbps)',
  'Cat.6A STP (10 Gbps экранированный)',
  'Cat.7 S/FTP (10 Gbps)',
  'Оптика OM3 (50/125 Multimode)',
  'Оптика OM4 (Multimode 10/40G)',
  'Оптика OS2 (9/125 Singlemode)'
];

const PATCH_CORD_COLORS = [
  { name: 'Синий (Рабочие места)', hex: '#3b82f6' },
  { name: 'Зеленый (Принтеры / Оргтехника)', hex: '#10b981' },
  { name: 'Желтый (Серверы / СХД)', hex: '#f59e0b' },
  { name: 'Красный (СКУД / CCTV Камеры)', hex: '#f43f5e' },
  { name: 'Голубой (VoIP Телефония)', hex: '#06b6d4' },
  { name: 'Фиолетовый (Wi-Fi Точки доступа)', hex: '#8b5cf6' },
  { name: 'Серый (Стандартный СКС)', hex: '#64748b' },
  { name: 'Белый / Черный', hex: '#0f172a' }
];

export function CableJournalView({
  patchPanels = [],
  switches = [],
  vlans = [],
  servers = [],
  onReloadData,
  onSelectSwitch,
  onSelectPatchPanel,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  // Active view tab: 'journal' or 'label_maker'
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem('switchbook_cj_active_tab') || 'journal';
    } catch {
      return 'journal';
    }
  });

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  const [statusFilter, setStatusFilter] = useState(() => {
    try {
      return localStorage.getItem('switchbook_cj_status_filter') || 'all';
    } catch {
      return 'all';
    }
  });

  const [panelFilter, setPanelFilter] = useState(() => {
    try {
      return localStorage.getItem('switchbook_cj_panel_filter') || 'all';
    } catch {
      return 'all';
    }
  });

  const [categoryFilter, setCategoryFilter] = useState(() => {
    try {
      return localStorage.getItem('switchbook_cj_cat_filter') || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_cj_active_tab', activeTab);
    } catch (e) {
      console.warn('Failed to save cj activeTab', e);
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_cj_status_filter', statusFilter);
    } catch (e) {
      console.warn('Failed to save statusFilter', e);
    }
  }, [statusFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_cj_panel_filter', panelFilter);
    } catch (e) {
      console.warn('Failed to save panelFilter', e);
    }
  }, [panelFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_cj_cat_filter', categoryFilter);
    } catch (e) {
      console.warn('Failed to save categoryFilter', e);
    }
  }, [categoryFilter]);

  // Column Selector state
  const [cjVisibleColumns, setCjVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('switchbook_cj_table_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to read cj visible columns from localStorage', e);
    }
    return DEFAULT_CJ_COLUMNS;
  });

  const [cjActivePreset, setCjActivePreset] = useState(() => {
    try {
      return localStorage.getItem('switchbook_cj_table_preset') || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_cj_table_columns', JSON.stringify(cjVisibleColumns));
      localStorage.setItem('switchbook_cj_table_preset', cjActivePreset);
    } catch (e) {
      console.warn('Failed to save cj columns state to localStorage', e);
    }
  }, [cjVisibleColumns, cjActivePreset]);

  const handleToggleCjColumn = (colKey) => {
    setCjVisibleColumns(prev => {
      const next = prev.includes(colKey)
        ? prev.filter(k => k !== colKey)
        : [...prev, colKey];

      const matched = CJ_TABLE_PRESETS.find(p =>
        p.columns.length === next.length && p.columns.every(c => next.includes(c))
      );
      setCjActivePreset(matched ? matched.id : 'custom');
      return next;
    });
  };

  const handleSelectCjPreset = (presetId, cols) => {
    setCjActivePreset(presetId);
    setCjVisibleColumns(cols);
  };

  const handleResetCjColumns = () => {
    setCjActivePreset('all');
    setCjVisibleColumns(DEFAULT_CJ_COLUMNS);
  };

  // Label Maker configuration state
  const [labelType, setLabelType] = useState('flags'); // 'flags' | 'wrap' | 'sockets' | 'strip'
  const [labelFormat, setLabelFormat] = useState('a4_24'); // 'a4_24' | 'a4_40' | 'thermal_58' | 'p_touch'
  const [selectedLineIds, setSelectedLineIds] = useState(new Set());
  const [showQrCode, setShowQrCode] = useState(true);
  const [includeVlanOnLabel, setIncludeVlanOnLabel] = useState(true);

  // Edit Line Modal state
  const [editingLine, setEditingLine] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Pinout Guide & Batch Renumber modals
  const [isPinoutModalOpen, setIsPinoutModalOpen] = useState(false);
  const [isBatchRenumberModalOpen, setIsBatchRenumberModalOpen] = useState(false);

  // Clipboard feedback
  const [copiedText, setCopiedText] = useState(null);
  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  };

  // Helper maps
  const switchMap = useMemo(() => {
    const map = {};
    switches.forEach(sw => { map[sw.id] = sw; });
    return map;
  }, [switches]);

  const vlanMap = useMemo(() => {
    const map = {};
    vlans.forEach(v => { map[v.id] = v; });
    return map;
  }, [vlans]);

  // Aggregate all cable lines across all patch panels
  const allLines = useMemo(() => {
    const lines = [];

    patchPanels.forEach(pp => {
      (pp.ports || []).forEach(port => {
        const lineId = `${pp.id}-${port.id || port.number}`;
        const targetSw = port.connectedSwitchId ? switchMap[port.connectedSwitchId] : null;
        const targetSwPort = targetSw?.ports?.find(p => p.id === port.connectedSwitchPortId || p.number === port.connectedSwitchPortId);
        const vlanId = targetSwPort?.pvid || null;
        const vlanInfo = vlanId ? vlanMap[vlanId] : null;

        lines.push({
          id: lineId,
          panelId: pp.id,
          panelName: pp.name,
          panelPortId: port.id || `p${port.number}`,
          portNumber: port.number,
          cableMark: port.cableMark || `К-${port.number}`,
          room: port.room || '—',
          socket: port.socket || `Р-${port.number}`,
          cableLength: port.cableLength || '20м',
          cableCategory: port.cableCategory || 'Cat.6 UTP',
          patchCordColor: port.patchCordColor || '#3b82f6',
          patchCordLength: port.patchCordLength || '1м',
          description: port.description || '',
          status: port.status || (port.connectedSwitchId ? 'connected' : 'free'),
          flukeTested: Boolean(port.flukeTested),
          switchId: port.connectedSwitchId || null,
          switchName: targetSw?.name || null,
          switchPortNumber: targetSwPort?.number || port.connectedSwitchPortId || null,
          switchPortName: targetSwPort?.name || `Порт ${port.connectedSwitchPortId || ''}`,
          switchPortMode: targetSwPort?.mode || 'access',
          vlanId: vlanId,
          vlanName: vlanInfo?.name || '',
          vlanColor: vlanInfo?.color || '#64748b',
          poe: Boolean(targetSwPort?.poe)
        });
      });
    });

    // Also include Server NIC links to switches in the cable schedule
    servers.forEach(srv => {
      (srv.nics || []).forEach(nic => {
        if (nic.connectedSwitchId) {
          const lineId = `srv-${srv.id}-${nic.id || nic.name}`;
          const targetSw = switchMap[nic.connectedSwitchId];
          const targetSwPort = targetSw?.ports?.find(p => p.id === nic.connectedPortId || p.number === nic.connectedPortId || p.name === nic.connectedPortId);
          const vlanId = targetSwPort?.pvid || null;
          const vlanInfo = vlanId ? vlanMap[vlanId] : null;
          const is10G = nic.speed?.includes('10G') || nic.type === 'sfp';

          lines.push({
            id: lineId,
            isServerLink: true,
            serverId: srv.id,
            serverName: srv.name,
            serverNicName: nic.name,
            panelId: 'server-rack',
            panelName: `Сервер ${srv.name}`,
            panelPortId: nic.name,
            portNumber: nic.name,
            cableMark: `SRV-${srv.name}-${nic.name}`,
            room: srv.location || 'Серверная',
            socket: `NIC: ${nic.name}`,
            cableLength: '2м (Rack Cable)',
            cableCategory: is10G ? 'SFP+ 10G DAC / Оптика' : 'Cat.6 UTP Patch',
            patchCordColor: is10G ? '#f59e0b' : '#06b6d4',
            patchCordLength: '2м',
            description: `${srv.model || srv.os} (${nic.role || 'Host Link'})`,
            status: 'connected',
            flukeTested: true,
            switchId: nic.connectedSwitchId,
            switchName: targetSw?.name || 'Коммутатор',
            switchPortNumber: targetSwPort?.number || nic.connectedPortId,
            switchPortName: targetSwPort?.name || `Порт ${nic.connectedPortId}`,
            switchPortMode: targetSwPort?.mode || 'access',
            vlanId: vlanId,
            vlanName: vlanInfo?.name || '',
            vlanColor: vlanInfo?.color || '#64748b',
            poe: false
          });
        }
      });
    });

    return lines;
  }, [patchPanels, servers, switchMap, vlanMap]);

  // Select all lines for label printing by default
  const handleSelectAllLines = () => {
    setSelectedLineIds(new Set(filteredLines.map(l => l.id)));
  };

  const handleClearSelectedLines = () => {
    setSelectedLineIds(new Set());
  };

  const toggleSelectLine = (id) => {
    setSelectedLineIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered lines
  const filteredLines = useMemo(() => {
    return allLines.filter(line => {
      // Status filter
      if (statusFilter !== 'all' && line.status !== statusFilter) return false;

      // Panel filter
      if (panelFilter !== 'all' && line.panelId !== panelFilter) return false;

      // Category filter
      if (categoryFilter !== 'all' && !line.cableCategory.includes(categoryFilter)) return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      return (
        line.cableMark.toLowerCase().includes(q) ||
        line.room.toLowerCase().includes(q) ||
        line.socket.toLowerCase().includes(q) ||
        line.description.toLowerCase().includes(q) ||
        line.panelName.toLowerCase().includes(q) ||
        (line.switchName || '').toLowerCase().includes(q) ||
        (line.switchPortName || '').toLowerCase().includes(q) ||
        String(line.vlanId || '').includes(q)
      );
    });
  }, [allLines, statusFilter, panelFilter, categoryFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let total = allLines.length;
    let connected = 0;
    let free = 0;
    let damaged = 0;
    let totalLengthMeters = 0;

    allLines.forEach(l => {
      if (l.status === 'connected') connected++;
      else if (l.status === 'free') free++;
      else if (l.status === 'damaged') damaged++;

      const lenNum = parseInt(l.cableLength) || 0;
      totalLengthMeters += lenNum;
    });

    return { total, connected, free, damaged, totalLengthMeters };
  }, [allLines]);

  // Export Journal to CSV / Excel
  const handleExportCSV = () => {
    const headers = [
      'Маркировка кабеля',
      'Помещение / Кабинет',
      'Розетка (Socket)',
      'Патч-панель',
      'Порт ПП',
      'Категория кабеля',
      'Длина трассы',
      'Патч-корд (Цвет)',
      'Патч-корд (Длина)',
      'Коммутатор',
      'Порт коммутатора',
      'Режим порта',
      'VLAN (PVID)',
      'Имя VLAN',
      'Питание PoE',
      'Тестирование Fluke',
      'Статус линии',
      'Назначение / Описание'
    ];

    const rows = filteredLines.map(l => [
      l.cableMark,
      l.room,
      l.socket,
      l.panelName,
      l.portNumber,
      l.cableCategory,
      l.cableLength,
      l.patchCordColor,
      l.patchCordLength || '1м',
      l.switchName || '—',
      l.switchPortName || '—',
      l.switchPortMode || 'access',
      l.vlanId ? `VLAN ${l.vlanId}` : '—',
      l.vlanName || '—',
      l.poe ? 'PoE+' : 'Нет',
      l.flukeTested ? 'Fluke PASS' : 'Не тестирован',
      l.status === 'connected' ? 'В работе' : l.status === 'damaged' ? 'Поврежден' : 'Свободен',
      l.description
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cable_Journal_SKS_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open line editor
  const handleOpenEditLine = (line) => {
    setEditingLine(line);
    setIsEditModalOpen(true);
  };

  // Save line edit
  const handleSaveLine = async (updateData) => {
    if (!editingLine) return;

    try {
      if (editingLine.isServerLink) {
        // If server link, we update server nic role/notes
        toast.info('Параметры серверного линка редактируются в карточке сервера во вкладке «Сетевые порты».');
      } else {
        await api.updatePatchPanelPort(editingLine.panelId, editingLine.panelPortId, updateData);
        toast.success('Кабельная линия успешно обновлена');
        if (onReloadData) onReloadData();
      }
      setIsEditModalOpen(false);
    } catch (err) {
      toast.error(`Ошибка сохранения линии: ${err.message}`);
    }
  };

  // Direct Browser Print
  const handlePrintLabels = () => {
    window.print();
  };

  // Lines to be printed
  const printableLines = useMemo(() => {
    if (selectedLineIds.size === 0) return filteredLines;
    return filteredLines.filter(l => selectedLineIds.has(l.id));
  }, [filteredLines, selectedLineIds]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Всего кабельных линий</div>
            <div className="text-2xl font-bold font-mono mt-1 text-slate-900 dark:text-white">
              {stats.total} <span className="text-sm font-normal text-slate-500">линий</span>
            </div>
            <div className="text-[11px] text-blue-500 mt-1 font-medium">
              Суммарно ~{stats.totalLengthMeters} м витой пары
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Cable className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Скоммутировано (В работе)</div>
            <div className="text-2xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
              {stats.connected} <span className="text-sm font-normal text-slate-500">/ {stats.total}</span>
            </div>
            <div className="text-[11px] text-emerald-500 flex items-center gap-1 mt-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {stats.total > 0 ? Math.round((stats.connected / stats.total) * 100) : 0}% утилизация портов
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Свободные линии (Резерв)</div>
            <div className="text-2xl font-bold font-mono mt-1 text-slate-700 dark:text-slate-300">
              {stats.free} <span className="text-xs font-normal text-slate-500">портов</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-medium">
              Доступно для кроссировки
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-500/10 text-slate-500 flex items-center justify-center shrink-0">
            <Bookmark className="w-6 h-6" />
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Маркировка TIA-606-C</div>
            <div className="text-2xl font-bold font-mono mt-1 text-purple-600 dark:text-purple-400">
              100% <span className="text-xs font-normal text-slate-500">стандарт</span>
            </div>
            <div className="text-[11px] text-purple-500 mt-1 font-medium">
              Готово к печати этикеток
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Tag className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. Main Tab Switcher & Toolbar */}
      <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 transition-colors print:hidden ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Tabs */}
          <div className={`flex items-center rounded-xl border p-0.5 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => setActiveTab('journal')}
              className={`h-7.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'journal'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Кабельный журнал ({filteredLines.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('label_maker')}
              className={`h-7.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'label_maker'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Печать маркировки & Этикетки</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Розетка, кабинет, кабель, VLAN..."
              className={`w-full h-8.5 border rounded-xl pl-8 pr-7 text-xs outline-none transition-all placeholder-slate-400 focus:border-blue-500 ${
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
        </div>

        {/* Action Controls Right */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {activeTab === 'journal' ? (
            <>
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs outline-none cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value="all">Все статусы</option>
                <option value="connected">В работе (Connected)</option>
                <option value="free">Свободные (Unpatched)</option>
                <option value="damaged">Поврежденные / Тест</option>
              </select>

              {/* Panel Filter */}
              <select
                value={panelFilter}
                onChange={(e) => setPanelFilter(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs outline-none cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value="all">Все панели & Серверы</option>
                {patchPanels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <button
                onClick={() => setIsPinoutModalOpen(true)}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400'
                }`}
                title="Шпаргалка монтажника: Распиновка RJ-45 (T-568A / T-568B) и PoE"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Распиновка RJ-45</span>
              </button>

              <button
                onClick={() => setIsBatchRenumberModalOpen(true)}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-400'
                }`}
                title="Пакетная маркировка по шаблону TIA-606-C / ГОСТ"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Пакетная маркировка</span>
              </button>

              <TableColumnSelector
                columns={CJ_TABLE_COLUMNS}
                visibleColumns={cjVisibleColumns}
                onToggleColumn={handleToggleCjColumn}
                presets={CJ_TABLE_PRESETS}
                activePreset={cjActivePreset}
                onSelectPreset={handleSelectCjPreset}
                onReset={handleResetCjColumns}
                theme={theme}
                buttonClassName="h-9 px-3 rounded-xl font-semibold"
              />

              <button
                onClick={handleExportCSV}
                className={`h-9 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                title="Экспорт кабельного журнала в CSV/Excel со всеми параметрами трассы"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Экспорт CSV</span>
              </button>
            </>
          ) : (
            <>
              {/* Label Maker Options */}
              <select
                value={labelType}
                onChange={(e) => setLabelType(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium outline-none cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value="flags">🏷️ Кабельные флажки (Патч-корды)</option>
                <option value="wrap">🔄 Круговая самоламинация (Wrap-around)</option>
                <option value="sockets">🔌 Розетки настенные (Faceplate)</option>
                <option value="strip">📋 Полоса 19" патч-панели (Keystones)</option>
              </select>

              <select
                value={labelFormat}
                onChange={(e) => setLabelFormat(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium outline-none cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value="a4_24">Лист A4 (24 шт / 70x37 мм)</option>
                <option value="a4_40">Лист A4 (40 шт / 48x25 мм)</option>
                <option value="thermal_58">Термоэтикетка (58x40 мм / Рулон)</option>
                <option value="p_touch">Лента Brother P-Touch (18/24 мм)</option>
              </select>

              <button
                onClick={() => setIsPinoutModalOpen(true)}
                className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer ${
                  isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
                title="Шпаргалка распиновки RJ-45"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden xl:inline">T-568A/B</span>
              </button>

              <button
                onClick={handlePrintLabels}
                className="h-9 px-4 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-purple-500/20 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать ({printableLines.length})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. TAB CONTENT */}
      {activeTab === 'journal' ? (
        /* --- VIEW 1: CABLE JOURNAL TABLE --- */
        <div className={`rounded-2xl border overflow-hidden shadow-xs transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 shadow-xs">
                <tr className={`border-b text-[11px] font-semibold uppercase tracking-wider ${
                  isLight ? 'bg-slate-50/95 text-slate-700 border-slate-200 backdrop-blur-md' : 'bg-slate-950/95 text-slate-300 border-slate-800 backdrop-blur-md'
                }`}>
                  {cjVisibleColumns.includes('mark') && <th className="py-3 px-3.5">Маркировка</th>}
                  {cjVisibleColumns.includes('room') && <th className="py-3 px-3.5">Помещение / Рабочее место</th>}
                  {cjVisibleColumns.includes('socket') && <th className="py-3 px-3.5">Розетка</th>}
                  {cjVisibleColumns.includes('panel') && <th className="py-3 px-3.5">Патч-панель</th>}
                  {cjVisibleColumns.includes('cable') && <th className="py-3 px-3.5">Трасса СКС</th>}
                  {cjVisibleColumns.includes('patchcord') && <th className="py-3 px-3.5">Патч-корд</th>}
                  {cjVisibleColumns.includes('switch') && <th className="py-3 px-3.5">Коммутатор & Порт</th>}
                  {cjVisibleColumns.includes('vlan') && <th className="py-3 px-3.5">VLAN</th>}
                  {cjVisibleColumns.includes('status') && <th className="py-3 px-3.5">Статус</th>}
                  {cjVisibleColumns.includes('actions') && <th className="py-3 px-3.5 text-right">Действия</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800/40'}`}>
                {filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={cjVisibleColumns.length} className="py-12 text-center text-slate-500">
                      Линии не найдены. Измените параметры фильтра или добавьте порты в патч-панели.
                    </td>
                  </tr>
                ) : (
                  filteredLines.map(line => {
                    const isConnected = line.status === 'connected';

                    return (
                      <tr
                        key={line.id}
                        className={`transition-colors ${
                          isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Cable Mark */}
                        {cjVisibleColumns.includes('mark') && (
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span>{line.cableMark}</span>
                            </div>
                            {line.description && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal truncate max-w-[180px]">
                                {line.description}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Room */}
                        {cjVisibleColumns.includes('room') && (
                          <td className="py-3 px-3.5 font-medium text-slate-800 dark:text-slate-200">
                            {line.room}
                          </td>
                        )}

                        {/* Socket */}
                        {cjVisibleColumns.includes('socket') && (
                          <td className="py-3 px-3.5">
                            <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px]">
                              {line.socket}
                            </span>
                          </td>
                        )}

                        {/* Patch Panel & Port */}
                        {cjVisibleColumns.includes('panel') && (
                          <td className="py-3 px-3.5 font-mono">
                            <div className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[150px]">
                              {line.panelName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Порт #{line.portNumber}
                            </div>
                          </td>
                        )}

                        {/* Cable Specs & Length */}
                        {cjVisibleColumns.includes('cable') && (
                          <td className="py-3 px-3.5">
                            <div className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                              {line.cableLength}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={line.cableCategory}>
                              {line.cableCategory}
                            </div>
                          </td>
                        )}

                        {/* Patch Cord */}
                        {cjVisibleColumns.includes('patchcord') && (
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span
                                className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                                style={{ backgroundColor: line.patchCordColor }}
                              />
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {line.patchCordLength}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Switch & Port */}
                        {cjVisibleColumns.includes('switch') && (
                          <td className="py-3 px-3.5">
                            {line.switchName ? (
                              <div>
                                <button
                                  onClick={() => onSelectSwitch && onSelectSwitch(line.switchId)}
                                  className="font-mono font-bold text-blue-500 hover:underline flex items-center gap-1 text-left cursor-pointer"
                                >
                                  <span>{line.switchName}</span>
                                </button>
                                <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                                  <span>{line.switchPortName}</span>
                                  {line.poe && (
                                    <span className="text-[9px] px-1 py-0.2 rounded-xs bg-amber-500/15 text-amber-500 font-bold">
                                      PoE
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">Не скоммутирован</span>
                            )}
                          </td>
                        )}

                        {/* VLAN */}
                        {cjVisibleColumns.includes('vlan') && (
                          <td className="py-3 px-3.5">
                            {line.vlanId ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold"
                                style={{
                                  backgroundColor: `${line.vlanColor}18`,
                                  color: line.vlanColor,
                                  border: `1px solid ${line.vlanColor}40`
                                }}
                              >
                                <span>VLAN {line.vlanId}</span>
                                {line.vlanName && <span className="font-sans opacity-85">({line.vlanName})</span>}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Default</span>
                            )}
                          </td>
                        )}

                        {/* Status */}
                        {cjVisibleColumns.includes('status') && (
                          <td className="py-3 px-3.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              isConnected
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : line.status === 'damaged'
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : line.status === 'damaged' ? 'bg-rose-500' : 'bg-slate-400'}`} />
                              {isConnected ? 'В работе' : line.status === 'damaged' ? 'Поврежден' : 'Свободен'}
                            </span>
                          </td>
                        )}

                        {/* Actions */}
                        {cjVisibleColumns.includes('actions') && (
                          <td className="py-3 px-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditLine(line)}
                                className="p-1 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                                title="Редактировать параметры кабельной линии"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedLineIds(new Set([line.id]));
                                  setActiveTab('label_maker');
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-purple-500 hover:bg-purple-500/10 transition-colors cursor-pointer"
                                title="Создать этикетку для этой линии"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* --- VIEW 2: LABEL MAKER & PRINT PREVIEW --- */
        <div className="space-y-6">
          {/* Label Maker Settings Bar */}
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-purple-400" />
                Параметры печати:
              </span>

              <button
                onClick={handleSelectAllLines}
                className="text-xs text-blue-500 hover:underline font-semibold cursor-pointer"
              >
                Выбрать все ({filteredLines.length})
              </button>

              <button
                onClick={handleClearSelectedLines}
                className="text-xs text-slate-400 hover:underline cursor-pointer"
              >
                Снять выбор
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeVlanOnLabel}
                  onChange={(e) => setIncludeVlanOnLabel(e.target.checked)}
                  className="rounded border-slate-700 cursor-pointer"
                />
                <span>Указывать VLAN</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showQrCode}
                  onChange={(e) => setShowQrCode(e.target.checked)}
                  className="rounded border-slate-700 cursor-pointer"
                />
                <span>QR-код инвентаря</span>
              </label>

              <button
                onClick={handlePrintLabels}
                className="h-8.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm shadow-purple-500/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Распечатать лист</span>
              </button>
            </div>
          </div>

          {/* Printable Sheet (Stylized for screen and print) */}
          <div className={`p-6 sm:p-8 rounded-2xl border transition-all ${
            isLight ? 'bg-white border-slate-200 shadow-lg' : 'bg-slate-950 border-slate-800'
          }`}>
            <div className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-500" />
                  <span>Макет маркировочных этикеток (Стандарт TIA-606-C)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Формат: {labelFormat === 'a4_grid' ? 'Сетка А4 (Самоклеящиеся этикетки)' : 'Ленточный принтер (Brother/Dymo)'} • Выбрано {printableLines.length} наклеек
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                100% ВЕКТОРНАЯ ПЕЧАТЬ
              </span>
            </div>

            {/* Labels Grid */}
            {labelFormat === 'thermal_58' ? (
              /* 0. Thermal Printer Layout (58x40 mm Sticker Format) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print:grid-cols-2 print:gap-2">
                {printableLines.map(line => (
                  <div
                    key={line.id}
                    onClick={() => toggleSelectLine(line.id)}
                    className={`p-3 rounded-lg border-2 border-black flex items-center justify-between gap-2.5 transition-all cursor-pointer bg-white text-black shadow-xs ${
                      selectedLineIds.has(line.id)
                        ? 'ring-2 ring-purple-500'
                        : ''
                    }`}
                    style={{ minHeight: '120px' }}
                  >
                    <div className="flex-1 min-w-0 font-mono">
                      <div className="flex items-center justify-between border-b border-black pb-1 mb-1">
                        <span className="text-[10px] font-bold text-slate-800 uppercase">СКС TIA-606</span>
                        {includeVlanOnLabel && line.vlanId && (
                          <span className="text-[9px] font-bold px-1 bg-black text-white rounded-xs">
                            VLAN {line.vlanId}
                          </span>
                        )}
                      </div>
                      <div className="text-base font-black tracking-tight truncate">
                        {line.cableMark}
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                        Розетка: {line.socket}
                      </div>
                      <div className="text-[10px] text-slate-700 truncate">
                        ПП: {line.panelName}:П{line.portNumber}
                      </div>
                      <div className="text-[10px] font-bold text-slate-800 truncate mt-0.5">
                        SW: {line.switchName ? `${line.switchName}:${line.switchPortName}` : 'Н/Д'}
                      </div>
                      <div className="text-[9px] text-slate-600 truncate mt-0.5">
                        {line.room}
                      </div>
                    </div>

                    {showQrCode && (
                      <div className="p-1 border border-black rounded-xs bg-white shrink-0">
                        <SvgQrCode
                          text={`ID:${line.cableMark}|SK:${line.socket}|SW:${line.switchName || ''}:${line.switchPortName || ''}`}
                          size={54}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : labelType === 'flags' ? (
              /* 1. Flag Labels for Patch Cords (Double-sided fold with QR) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print:grid-cols-2 print:gap-3">
                {printableLines.map(line => (
                  <div
                    key={line.id}
                    onClick={() => toggleSelectLine(line.id)}
                    className={`p-3.5 rounded-xl border-2 flex flex-col justify-between gap-3 transition-all cursor-pointer relative ${
                      selectedLineIds.has(line.id)
                        ? 'border-purple-500 shadow-md ring-2 ring-purple-500/20'
                        : isLight
                        ? 'bg-slate-50 border-slate-300 hover:border-slate-400'
                        : 'bg-slate-900/90 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {/* Fold marker indicator */}
                    <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-400/50 pointer-events-none" />

                    {/* Side A: Patch Panel / Socket end */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">СТОРОНА A (ПП)</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: line.patchCordColor }}
                            title="Цвет патч-корда"
                          />
                        </div>
                        <div className="font-mono font-bold text-sm text-slate-900 dark:text-white truncate">
                          {line.cableMark}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">
                          {line.panelName}:П{line.portNumber} ➔ {line.socket}
                        </div>
                      </div>

                      {showQrCode && (
                        <div className="p-0.5 rounded-xs bg-white border border-slate-300 shrink-0">
                          <SvgQrCode
                            text={`ID:${line.cableMark}|SK:${line.socket}|SW:${line.switchName || ''}:${line.switchPortName || ''}`}
                            size={38}
                          />
                        </div>
                      )}
                    </div>

                    {/* Side B: Switch Port end */}
                    <div className="space-y-1 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">СТОРОНА B (КОММУТАТОР)</span>
                        {includeVlanOnLabel && line.vlanId && (
                          <span className="text-[9px] font-mono font-bold text-purple-400">
                            VLAN {line.vlanId}
                          </span>
                        )}
                      </div>
                      <div className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 truncate">
                        {line.switchName ? `${line.switchName}:${line.switchPortName}` : 'UNPATCHED'}
                      </div>
                      <div className="text-[9px] text-slate-400 truncate">
                        {line.room} • {line.cableLength}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : labelType === 'wrap' ? (
              /* 2. Wrap-Around Self-Laminating Markers (Круговая обертка с прозрачным хвостом) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print:grid-cols-2">
                {printableLines.map(line => (
                  <div
                    key={line.id}
                    onClick={() => toggleSelectLine(line.id)}
                    className={`rounded-xl border-2 overflow-hidden flex flex-col transition-all cursor-pointer ${
                      selectedLineIds.has(line.id)
                        ? 'border-purple-500 shadow-md ring-2 ring-purple-500/20'
                        : isLight
                        ? 'bg-slate-50 border-slate-300'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    {/* Printable Print Area (Белая зона печати) */}
                    <div className="p-3 bg-white text-slate-900 font-mono border-b-2 border-slate-300 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          WRAP-AROUND • {line.socket}
                        </div>
                        <div className="text-sm font-bold tracking-tight text-slate-950 truncate">
                          {line.cableMark}
                        </div>
                        <div className="text-[10px] text-blue-700 font-semibold truncate">
                          {line.switchName ? `${line.switchName}:${line.switchPortName}` : 'UNPATCHED'}
                        </div>
                      </div>

                      {showQrCode && (
                        <div className="p-0.5 rounded-xs border border-slate-300 bg-white shrink-0">
                          <SvgQrCode
                            text={`ID:${line.cableMark}|SK:${line.socket}|SW:${line.switchName || ''}:${line.switchPortName || ''}`}
                            size={36}
                          />
                        </div>
                      )}
                    </div>

                    {/* Self-Laminating Clear Tail (Прозрачная защитная зона) */}
                    <div className="p-2.5 bg-slate-100/60 dark:bg-slate-950/60 border-t border-dashed border-slate-400/40 text-[9px] font-mono text-slate-500 flex items-center justify-between">
                      <span className="italic">Зона самоламинации кабеля (хвост 25мм)</span>
                      <span className="font-bold text-slate-400">Ø 4-7 мм</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : labelType === 'sockets' ? (
              /* 3. Faceplate Wall Socket Labels */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 print:grid-cols-4">
                {printableLines.map(line => (
                  <div
                    key={line.id}
                    onClick={() => toggleSelectLine(line.id)}
                    className={`p-3 rounded-lg border-2 flex flex-col justify-between items-center text-center gap-1.5 transition-all cursor-pointer ${
                      selectedLineIds.has(line.id)
                        ? 'border-purple-500 shadow-md ring-2 ring-purple-500/20'
                        : isLight
                        ? 'bg-slate-50 border-slate-300'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    <div className="text-[9px] uppercase font-bold text-slate-400 truncate max-w-full">
                      {line.room}
                    </div>
                    <div className="font-mono font-bold text-base text-slate-900 dark:text-white">
                      {line.socket}
                    </div>
                    <div className="text-[10px] font-mono text-purple-500 font-semibold truncate max-w-full">
                      {line.cableMark}
                    </div>

                    {showQrCode && (
                      <div className="p-0.5 rounded-xs bg-white border border-slate-300 my-0.5">
                        <SvgQrCode
                          text={`ID:${line.cableMark}|SK:${line.socket}|SW:${line.switchName || ''}:${line.switchPortName || ''}`}
                          size={32}
                        />
                      </div>
                    )}

                    {includeVlanOnLabel && line.vlanId && (
                      <div className="text-[9px] px-1.5 py-0.2 rounded-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        VLAN {line.vlanId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* 4. Patch Panel Port Inserts Strip (19" Keystone Strip) */
              <div className="space-y-4">
                {patchPanels.map(pp => (
                  <div key={pp.id} className="p-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <div className="text-xs font-bold font-mono mb-2 text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>МАРКИРОВОЧНАЯ ПОЛОСА: {pp.name}</span>
                      <span className="text-[10px] text-slate-500">19" Rack Width Strip</span>
                    </div>

                    <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 overflow-x-auto">
                      {(pp.ports || []).map(p => (
                        <div
                          key={p.number}
                          className="p-1 border rounded-sm text-center bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-[9px] font-mono"
                        >
                          <div className="font-bold text-blue-500">#{p.number}</div>
                          <div className="font-bold text-slate-900 dark:text-white truncate" title={p.socket}>
                            {p.socket || `P${p.number}`}
                          </div>
                          <div className="text-[8px] text-slate-400 truncate" title={p.room}>
                            {p.room?.split(' ')[0] || ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Line Edit Modal */}
      {isEditModalOpen && editingLine && (
        <LineEditModal
          line={editingLine}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveLine}
          theme={theme}
        />
      )}

      {/* 5. T-568A / T-568B Pinout & PoE Guide Modal */}
      <PinoutGuideModal
        isOpen={isPinoutModalOpen}
        onClose={() => setIsPinoutModalOpen(false)}
        theme={theme}
      />

      {/* 6. Batch Renumbering Modal (TIA-606-C / ГОСТ) */}
      <BatchRenumberModal
        isOpen={isBatchRenumberModalOpen}
        onClose={() => setIsBatchRenumberModalOpen(false)}
        patchPanels={patchPanels}
        onSuccess={onReloadData}
        theme={theme}
      />
    </div>
  );
}

// --- LINE EDIT MODAL ---
function LineEditModal({ line, onClose, onSave, theme = 'dark' }) {
  const isLight = theme === 'light';

  const [formData, setFormData] = useState({
    cableMark: line.cableMark || '',
    room: line.room || '',
    socket: line.socket || '',
    cableLength: line.cableLength || '20м',
    cableCategory: line.cableCategory || 'Cat.6 UTP',
    patchCordColor: line.patchCordColor || '#3b82f6',
    patchCordLength: line.patchCordLength || '1м',
    description: line.description || '',
    status: line.status || 'connected'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onSave(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Cable className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Кабельная линия: {line.cableMark}
              </h2>
              <p className="text-xs text-slate-400">
                {line.panelName} • Порт #{line.portNumber}
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

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Маркировка кабеля (Тэг)</label>
              <input
                type="text"
                required
                value={formData.cableMark}
                onChange={(e) => setFormData({ ...formData, cableMark: e.target.value })}
                placeholder="К-201-1"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Розетка (Socket)</label>
              <input
                type="text"
                required
                value={formData.socket}
                onChange={(e) => setFormData({ ...formData, socket: e.target.value })}
                placeholder="Р-1.1"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Помещение / Рабочее место</label>
            <input
              type="text"
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              placeholder="Каб. 201 (Бухгалтерия) / Стол 3"
              className={`w-full h-9 px-3 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Категория кабеля СКС</label>
              <select
                value={formData.cableCategory}
                onChange={(e) => setFormData({ ...formData, cableCategory: e.target.value })}
                className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              >
                {CABLE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Длина трассы (м)</label>
              <input
                type="text"
                value={formData.cableLength}
                onChange={(e) => setFormData({ ...formData, cableLength: e.target.value })}
                placeholder="25м"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Цвет патч-корда</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formData.patchCordColor}
                  onChange={(e) => setFormData({ ...formData, patchCordColor: e.target.value })}
                  className="w-9 h-9 rounded-xl border cursor-pointer p-0.5 bg-transparent"
                />
                <select
                  value={formData.patchCordColor}
                  onChange={(e) => setFormData({ ...formData, patchCordColor: e.target.value })}
                  className={`flex-1 h-9 px-2 rounded-xl border outline-none text-xs cursor-pointer ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                >
                  {PATCH_CORD_COLORS.map(c => (
                    <option key={c.hex} value={c.hex}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Длина патч-корда</label>
              <input
                type="text"
                value={formData.patchCordLength}
                onChange={(e) => setFormData({ ...formData, patchCordLength: e.target.value })}
                placeholder="1м / 2м"
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Статус линии</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              <option value="connected">В работе (Connected)</option>
              <option value="free">Свободен (Unpatched)</option>
              <option value="reserved">Резерв (Reserved)</option>
              <option value="damaged">Поврежден / Требует тестирования (Fluke Fail)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Назначение / Примечания</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Рабочее место Главный бухгалтер (ПК)"
              className={`w-full h-9 px-3 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div className={`pt-4 border-t flex items-center justify-end gap-2.5 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
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
              className="h-9 px-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              {isSubmitting ? 'Сохранение...' : 'Сохранить линию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
