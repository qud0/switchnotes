import React, { useState, useMemo, useEffect } from 'react';
import { Download, Search, Zap, Link as LinkIcon, AlertTriangle, ArrowUpRight, Filter, ChevronUp, ChevronDown, ArrowUpDown, Power, PowerOff, RefreshCw } from 'lucide-react';
import { VlanBadge } from './VlanBadge';
import { checkVlanMismatch } from '../utils/vlanMismatch';
import { TableColumnSelector } from './TableColumnSelector';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { calculatePortBlastRadius } from '../utils/blastRadius';
import { BlastRadiusModal } from './BlastRadiusModal';

const PORT_TABLE_COLUMNS = [
  { key: 'number', label: '#', required: true },
  { key: 'name', label: 'Интерфейс', required: true },
  { key: 'mode', label: 'Режим' },
  { key: 'pvid', label: 'PVID (Native)' },
  { key: 'tagged', label: 'Tagged VLANs' },
  { key: 'description', label: 'Описание' },
  { key: 'connectedTo', label: 'Куда подключен' },
  { key: 'poe', label: 'PoE' },
  { key: 'actions', label: 'Действие' }
];

const DEFAULT_PORT_COLUMNS = PORT_TABLE_COLUMNS.map(c => c.key);

const PORT_TABLE_PRESETS = [
  { id: 'all', label: 'Все колонки', columns: DEFAULT_PORT_COLUMNS },
  { id: 'network', label: 'Сетевик / VLAN', columns: ['number', 'name', 'mode', 'pvid', 'tagged', 'description', 'actions'] },
  { id: 'cabling', label: 'Монтажник СКС', columns: ['number', 'name', 'description', 'connectedTo', 'poe', 'actions'] },
  { id: 'compact', label: 'Компактный', columns: ['number', 'name', 'pvid', 'connectedTo', 'actions'] }
];

export function PortTable({
  switchData,
  allSwitches = [],
  vlans = [],
  ipAllocations = [],
  servers = [],
  selectedPortIds = [],
  onToggleSelectPort,
  onSelectAllPorts,
  onClearSelection,
  onOpenPortDrawer,
  onJumpToPeer,
  onReloadData,
  theme = 'dark'
}) {
  const toast = useToast();
  const [togglingPortId, setTogglingPortId] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  const [blastPort, setBlastPort] = useState(null);
  const [blastRadiusData, setBlastRadiusData] = useState(null);

  const executePortToggle = async (port) => {
    try {
      const portId = port.id || port.number;
      setTogglingPortId(portId);
      const res = await api.controlPort(switchData.id, portId, { action: 'toggle' });
      toast?.success?.(res.message || 'Состояние порта изменено');
      if (onReloadData) {
        await onReloadData();
      }
    } catch (err) {
      toast?.error?.(err.message || 'Ошибка управления портом');
    } finally {
      setTogglingPortId(null);
    }
  };

  const handleQuickToggle = async (port) => {
    // If the port is currently enabled, toggling it means disabling (shutdown) it!
    const isCurrentlyActive = port.enabled !== false && port.mode !== 'disabled';
    if (isCurrentlyActive) {
      const radius = calculatePortBlastRadius({
        switchData,
        port,
        allSwitches,
        ipAllocations,
        servers,
        vlans
      });

      if (radius.riskLevel !== 'low') {
        setBlastPort(port);
        setBlastRadiusData(radius);
        setBlastModalOpen(true);
        return;
      }
    }

    await executePortToggle(port);
  };

  const [modeFilter, setModeFilter] = useState(() => {
    try {
      return localStorage.getItem('switchbook_port_mode_filter') || 'all';
    } catch {
      return 'all';
    }
  });

  const [sortField, setSortField] = useState(() => {
    try {
      return localStorage.getItem('switchbook_port_sort_field') || 'number';
    } catch {
      return 'number';
    }
  });

  const [sortOrder, setSortOrder] = useState(() => {
    try {
      return localStorage.getItem('switchbook_port_sort_order') || 'asc';
    } catch {
      return 'asc';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_port_mode_filter', modeFilter);
    } catch (e) {
      console.warn('Failed to save modeFilter to localStorage', e);
    }
  }, [modeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_port_sort_field', sortField);
      localStorage.setItem('switchbook_port_sort_order', sortOrder);
    } catch (e) {
      console.warn('Failed to save sort state to localStorage', e);
    }
  }, [sortField, sortOrder]);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('switchbook_port_table_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to read visible columns from localStorage', e);
    }
    return DEFAULT_PORT_COLUMNS;
  });

  const [activePreset, setActivePreset] = useState(() => {
    try {
      return localStorage.getItem('switchbook_port_table_preset') || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('switchbook_port_table_columns', JSON.stringify(visibleColumns));
      localStorage.setItem('switchbook_port_table_preset', activePreset);
    } catch (e) {
      console.warn('Failed to save columns state to localStorage', e);
    }
  }, [visibleColumns, activePreset]);

  const handleToggleColumn = (colKey) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colKey)
        ? prev.filter(k => k !== colKey)
        : [...prev, colKey];

      const matched = PORT_TABLE_PRESETS.find(p =>
        p.columns.length === next.length && p.columns.every(c => next.includes(c))
      );
      setActivePreset(matched ? matched.id : 'custom');
      return next;
    });
  };

  const handleSelectPreset = (presetId, cols) => {
    setActivePreset(presetId);
    setVisibleColumns(cols);
  };

  const handleResetColumns = () => {
    setActivePreset('all');
    setVisibleColumns(DEFAULT_PORT_COLUMNS);
  };

  const vlanMap = useMemo(() => {
    const map = {};
    vlans.forEach(v => { map[v.id] = v; });
    return map;
  }, [vlans]);

  const switchesMap = useMemo(() => {
    const map = {};
    allSwitches.forEach(s => { map[s.id] = s; });
    return map;
  }, [allSwitches]);

  const ports = switchData.ports || [];

  // Filtered ports
  const filteredPorts = useMemo(() => {
    return ports.filter(p => {
      // Mode filter
      if (modeFilter === 'access' && p.mode !== 'access') return false;
      if (modeFilter === 'trunk' && p.mode !== 'trunk') return false;
      if (modeFilter === 'poe' && !p.poe) return false;
      if (modeFilter === 'linked' && !p.linkedSwitchId) return false;
      if (modeFilter === 'disabled' && (p.enabled && p.mode !== 'disabled')) return false;

      // Text query
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase().trim();
      const vlanNum = parseInt(q);

      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.connectedTo?.toLowerCase().includes(q) ||
        p.number.toString() === q ||
        (!isNaN(vlanNum) && (p.pvid === vlanNum || (p.taggedVlans && p.taggedVlans.includes(vlanNum))))
      );
    });
  }, [ports, modeFilter, filterQuery]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedPorts = useMemo(() => {
    const list = [...filteredPorts];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredPorts, sortField, sortOrder]);

  // Export to CSV for Excel
  const handleExportCSV = () => {
    const headers = [
      'Порт',
      'Имя интерфейса',
      'Тип',
      'Режим',
      'Native VLAN (PVID)',
      'Tagged VLANs',
      'Назначение (Description)',
      'Куда подключен (Connected To)',
      'Связанный свитч',
      'Скорость',
      'PoE',
      'Статус'
    ];

    const rows = ports.map(p => {
      const peerSw = p.linkedSwitchId ? switchesMap[p.linkedSwitchId] : null;
      return [
        p.number,
        `"${p.name || ''}"`,
        p.type?.toUpperCase() || 'RJ45',
        p.mode?.toUpperCase() || 'ACCESS',
        p.pvid || 1,
        `"${(p.taggedVlans || []).join(', ')}"`,
        `"${p.description ? p.description.replace(/"/g, '""') : ''}"`,
        `"${p.connectedTo ? p.connectedTo.replace(/"/g, '""') : ''}"`,
        `"${peerSw ? peerSw.name : ''}"`,
        p.speed || '1G',
        p.poe ? 'ДА' : 'НЕТ',
        (!p.enabled || p.mode === 'disabled') ? 'ОТКЛЮЧЕН' : 'АКТИВЕН'
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Кабельный_журнал_${switchData.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isLight = theme === 'light';

  return (
    <div className={`border rounded-2xl p-5 shadow-xl transition-colors space-y-4 ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
    }`}>
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold font-mono text-slate-900 dark:text-white">
            Кабельный журнал и таблица портов
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Сводная таблица коммутации портов {switchData.name} ({ports.length} портов)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <TableColumnSelector
            columns={PORT_TABLE_COLUMNS}
            visibleColumns={visibleColumns}
            onToggleColumn={handleToggleColumn}
            presets={PORT_TABLE_PRESETS}
            activePreset={activePreset}
            onSelectPreset={handleSelectPreset}
            onReset={handleResetColumns}
            theme={theme}
          />

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт в Excel (CSV)
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Поиск по порту, VLAN, розетке или описанию..."
            className={`w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-hidden ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
            }`}
          />
        </div>

        {/* Mode filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400">Фильтр:</span>
          {[
            { id: 'all', label: 'Все' },
            { id: 'access', label: 'Access' },
            { id: 'trunk', label: 'Trunk' },
            { id: 'linked', label: 'Линки' },
            { id: 'poe', label: 'PoE' },
            { id: 'disabled', label: 'Откл.' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setModeFilter(f.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                modeFilter === f.id
                  ? 'bg-blue-600 text-white'
                  : (isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`overflow-x-auto max-h-[75vh] overflow-y-auto rounded-xl border ${
        isLight ? 'border-slate-200' : 'border-slate-800'
      }`}>
        <table className="w-full text-left text-xs">
          <thead className={`sticky top-0 z-10 border-b font-mono font-semibold uppercase tracking-wider text-[11px] shadow-xs ${
            isLight ? 'bg-slate-50/95 border-slate-200 text-slate-700 backdrop-blur-md' : 'bg-slate-950/95 border-slate-800 text-slate-300 backdrop-blur-md'
          }`}>
            <tr>
              <th className="py-2.5 px-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={sortedPorts.length > 0 && sortedPorts.every(p => selectedPortIds.includes(p.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onSelectAllPorts?.(sortedPorts.map(p => p.id));
                    } else {
                      onClearSelection?.();
                    }
                  }}
                  className="accent-blue-600 rounded cursor-pointer"
                  title="Выбрать все отфильтрованные порты"
                />
              </th>
              {visibleColumns.includes('number') && (
                <th onClick={() => handleSort('number')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>#</span>
                    {sortField === 'number' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('name') && (
                <th onClick={() => handleSort('name')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>Интерфейс</span>
                    {sortField === 'name' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('mode') && (
                <th onClick={() => handleSort('mode')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>Режим</span>
                    {sortField === 'mode' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('pvid') && (
                <th onClick={() => handleSort('pvid')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>PVID (Native)</span>
                    {sortField === 'pvid' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('tagged') && (
                <th className="py-2.5 px-3">Tagged VLANs</th>
              )}
              {visibleColumns.includes('description') && (
                <th onClick={() => handleSort('description')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>Описание (Description)</span>
                    {sortField === 'description' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('connectedTo') && (
                <th onClick={() => handleSort('connectedTo')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center gap-1">
                    <span>Куда подключен (Connected To)</span>
                    {sortField === 'connectedTo' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('poe') && (
                <th onClick={() => handleSort('poe')} className="py-2.5 px-3 text-center cursor-pointer hover:text-blue-500 transition-colors select-none">
                  <div className="flex items-center justify-center gap-1">
                    <span>PoE</span>
                    {sortField === 'poe' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                  </div>
                </th>
              )}
              {visibleColumns.includes('actions') && (
                <th className="py-2.5 px-3 text-right">Действие</th>
              )}
            </tr>
          </thead>
          <tbody className={`divide-y font-sans ${
            isLight ? 'divide-slate-200 bg-white' : 'divide-slate-800/80 bg-slate-900/40'
          }`}>
            {sortedPorts.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-8 text-center text-slate-400">
                  По заданному фильтру порты не найдены
                </td>
              </tr>
            ) : (
              sortedPorts.map(port => {
                const nativeVlan = vlanMap[port.pvid] || { id: port.pvid, name: `VLAN ${port.pvid}`, color: '#64748b' };
                const peerSw = port.linkedSwitchId ? switchesMap[port.linkedSwitchId] : null;
                const peerPort = peerSw?.ports?.find(p => p.id === port.linkedPortId || p.number === port.linkedPortId);
                const mismatch = peerPort ? checkVlanMismatch(port, peerPort) : null;
                const hasMismatch = mismatch?.hasMismatch;
                const isSelected = selectedPortIds.includes(port.id);

                return (
                  <tr
                    key={port.id}
                    onClick={() => onToggleSelectPort?.(port.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? (isLight ? 'bg-blue-50 hover:bg-blue-100/70' : 'bg-blue-950/35 hover:bg-blue-900/40')
                        : hasMismatch
                          ? 'bg-red-500/5 hover:bg-red-500/10'
                          : (isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50')
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectPort?.(port.id)}
                        className="accent-blue-600 rounded cursor-pointer"
                      />
                    </td>
                    {visibleColumns.includes('number') && (
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                        {port.number}
                      </td>
                    )}

                    {visibleColumns.includes('name') && (
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{port.name || `port ${port.number}`}</span>
                        {hasMismatch && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" title="Расхождение VLAN" />
                        )}
                        {port.linkedSwitchId && !hasMismatch && (
                          <LinkIcon className="w-3 h-3 text-cyan-500" title="Связанный порт" />
                        )}
                      </td>
                    )}

                    {visibleColumns.includes('mode') && (
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase ${
                          !port.enabled || port.mode === 'disabled'
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            : port.mode === 'trunk'
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-800'
                              : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-800'
                        }`}>
                          {port.mode}
                        </span>
                      </td>
                    )}

                    {visibleColumns.includes('pvid') && (
                      <td className="py-2.5 px-3">
                        <VlanBadge vlan={nativeVlan} size="xs" />
                      </td>
                    )}

                    {visibleColumns.includes('tagged') && (
                      <td className="py-2.5 px-3">
                        {port.mode === 'trunk' && port.taggedVlans && port.taggedVlans.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {port.taggedVlans.map(vId => {
                              const vl = vlanMap[vId] || { id: vId, color: '#64748b' };
                              return (
                                <span
                                  key={vId}
                                  className="font-mono text-[10px] px-1 py-0.2 rounded-xs border"
                                  style={{
                                    backgroundColor: `${vl.color}25`,
                                    borderColor: `${vl.color}55`,
                                    color: vl.color
                                  }}
                                >
                                  {vId}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.includes('description') && (
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                        {port.description || <span className="text-slate-400 text-xs">—</span>}
                      </td>
                    )}

                    {visibleColumns.includes('connectedTo') && (
                      <td className="py-2.5 px-3">
                        {port.connectedTo ? (
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <span className="font-mono text-xs">{port.connectedTo}</span>
                            {port.linkedSwitchId && (
                              <button
                                type="button"
                                onClick={() => onJumpToPeer(port.linkedSwitchId, port.linkedPortId)}
                                className="text-blue-600 hover:text-blue-500 cursor-pointer"
                                title="Перейти к коммутатору"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.includes('poe') && (
                      <td className="py-2.5 px-3 text-center">
                        {port.poe ? (
                          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 mx-auto" />
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.includes('actions') && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={togglingPortId === (port.id || port.number)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickToggle(port);
                            }}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
                              port.enabled === false || port.mode === 'disabled'
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-emerald-500 hover:border-emerald-500/50'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500'
                            }`}
                            title={port.enabled === false || port.mode === 'disabled'
                              ? 'Включить порт на коммутаторе (no shutdown)'
                              : 'Отключить порт на коммутаторе (shutdown)'}
                          >
                            {togglingPortId === (port.id || port.number) ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : port.enabled === false || port.mode === 'disabled' ? (
                              <PowerOff className="w-3.5 h-3.5 text-rose-500" />
                            ) : (
                              <Power className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => onOpenPortDrawer([port])}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                          >
                            Настроить
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

      {/* Blast Radius Warning Modal for Single Port Quick Toggle */}
      <BlastRadiusModal
        isOpen={blastModalOpen}
        onClose={() => {
          setBlastModalOpen(false);
          setBlastPort(null);
          setBlastRadiusData(null);
        }}
        onConfirm={async () => {
          if (blastPort) {
            await executePortToggle(blastPort);
          }
        }}
        switchData={switchData}
        port={blastPort}
        blastRadius={blastRadiusData}
        action="disable"
        theme={theme}
      />
    </div>
  );
}
