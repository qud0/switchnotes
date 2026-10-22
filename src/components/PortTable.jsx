import React, { useState, useMemo } from 'react';
import { Download, Search, Zap, Link as LinkIcon, AlertTriangle, ArrowUpRight, Filter, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { VlanBadge } from './VlanBadge';
import { checkVlanMismatch } from '../utils/vlanMismatch';

export function PortTable({
  switchData,
  allSwitches = [],
  vlans = [],
  onOpenPortDrawer,
  onJumpToPeer,
  theme = 'dark'
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [sortField, setSortField] = useState('number');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

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

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Экспорт в Excel (CSV)
        </button>
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
      <div className={`overflow-x-auto rounded-xl border ${
        isLight ? 'border-slate-200' : 'border-slate-800'
      }`}>
        <table className="w-full text-left text-xs">
          <thead className={`border-b font-mono font-semibold uppercase tracking-wider text-[11px] ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/70 border-slate-800 text-slate-400'
          }`}>
            <tr>
              <th onClick={() => handleSort('number')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>#</span>
                  {sortField === 'number' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th onClick={() => handleSort('name')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Интерфейс</span>
                  {sortField === 'name' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th onClick={() => handleSort('mode')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Режим</span>
                  {sortField === 'mode' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th onClick={() => handleSort('pvid')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>PVID (Native)</span>
                  {sortField === 'pvid' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th className="py-2.5 px-3">Tagged VLANs</th>
              <th onClick={() => handleSort('description')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Описание (Description)</span>
                  {sortField === 'description' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th onClick={() => handleSort('connectedTo')} className="py-2.5 px-3 cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center gap-1">
                  <span>Куда подключен (Connected To)</span>
                  {sortField === 'connectedTo' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th onClick={() => handleSort('poe')} className="py-2.5 px-3 text-center cursor-pointer hover:text-blue-500 transition-colors select-none">
                <div className="flex items-center justify-center gap-1">
                  <span>PoE</span>
                  {sortField === 'poe' ? (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
                </div>
              </th>
              <th className="py-2.5 px-3 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className={`divide-y font-sans ${
            isLight ? 'divide-slate-200 bg-white' : 'divide-slate-800/80 bg-slate-900/40'
          }`}>
            {sortedPorts.length === 0 ? (
              <tr>
                <td colSpan="9" className="py-8 text-center text-slate-400">
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

                return (
                  <tr
                    key={port.id}
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      hasMismatch ? 'bg-red-500/5' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                      {port.number}
                    </td>

                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{port.name || `port ${port.number}`}</span>
                      {hasMismatch && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" title="Расхождение VLAN" />
                      )}
                      {port.linkedSwitchId && !hasMismatch && (
                        <LinkIcon className="w-3 h-3 text-cyan-500" title="Связанный порт" />
                      )}
                    </td>

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

                    <td className="py-2.5 px-3">
                      <VlanBadge vlan={nativeVlan} size="xs" />
                    </td>

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

                    <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                      {port.description || <span className="text-slate-400 text-xs">—</span>}
                    </td>

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

                    <td className="py-2.5 px-3 text-center">
                      {port.poe ? (
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 mx-auto" />
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onOpenPortDrawer([port])}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                      >
                        Настроить
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
