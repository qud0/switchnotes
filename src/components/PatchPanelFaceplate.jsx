import React, { useState, useMemo } from 'react';
import {
  Layers,
  Edit2,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Cable,
  Link as LinkIcon,
  MapPin,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';

export function PatchPanelFaceplate({
  panelData,
  allSwitches = [],
  onOpenPortDrawer,
  onEditPanel,
  onDeletePanel,
  onJumpToSwitch,
  theme = 'dark'
}) {
  const [activeTab, setActiveTab] = useState('faceplate'); // 'faceplate' or 'journal'
  const [selectedPortId, setSelectedPortId] = useState(panelData.ports?.[0]?.id || null);
  const [searchFilter, setSearchFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');

  const ports = panelData.ports || [];
  const selectedPort = ports.find(p => p.id === selectedPortId) || ports[0];

  // Calculate stats
  const connectedCount = ports.filter(p => p.connectedSwitchId).length;
  const freeCount = ports.filter(p => !p.connectedSwitchId && p.status !== 'damaged').length;
  const damagedCount = ports.filter(p => p.status === 'damaged').length;

  // Selected port switch details
  const connectedSwitch = allSwitches.find(s => s.id === selectedPort?.connectedSwitchId);
  const connectedSwitchPort = connectedSwitch?.ports?.find(
    p => p.id === selectedPort?.connectedSwitchPortId || p.number === selectedPort?.connectedSwitchPortId
  );

  // Unique rooms for filtering in journal
  const uniqueRooms = useMemo(() => {
    const set = new Set();
    ports.forEach(p => {
      if (p.room) set.add(p.room);
    });
    return Array.from(set).sort();
  }, [ports]);

  // Filtered ports for journal
  const filteredPorts = useMemo(() => {
    return ports.filter(p => {
      if (roomFilter !== 'all' && p.room !== roomFilter) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase().trim();
      return (
        p.room?.toLowerCase().includes(q) ||
        p.socket?.toLowerCase().includes(q) ||
        p.cableMark?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        String(p.number).includes(q)
      );
    });
  }, [ports, roomFilter, searchFilter]);

  // Export CSV for Excel (UTF-8 BOM)
  const exportCsv = () => {
    const headers = [
      'Порт ПП',
      'Кабинет / Помещение',
      'Номер розетки',
      'Маркировка кабеля',
      'Тип кабеля',
      'Длина трассы',
      'Статус',
      'Коммутатор',
      'Порт коммутатора',
      'VLAN',
      'Цвет патч-корда',
      'Длина патч-корда',
      'Примечание'
    ];

    const rows = ports.map(p => {
      const sw = allSwitches.find(s => s.id === p.connectedSwitchId);
      const swPort = sw?.ports?.find(sp => sp.id === p.connectedSwitchPortId || sp.number === p.connectedSwitchPortId);
      return [
        p.number,
        `"${p.room || ''}"`,
        `"${p.socket || ''}"`,
        `"${p.cableMark || ''}"`,
        `"${p.cableType || 'UTP Cat.6'}"`,
        `"${p.cableLength || ''}"`,
        `"${p.status === 'connected' ? 'Скоммутирован' : p.status === 'damaged' ? 'Поврежден' : 'Свободен'}"`,
        `"${sw?.name || ''}"`,
        `"${swPort?.name || (swPort ? 'Порт ' + swPort.number : '')}"`,
        `"${swPort?.pvid ? 'VLAN ' + swPort.pvid : ''}"`,
        `"${p.patchCordColor || ''}"`,
        `"${p.patchCordLength || ''}"`,
        `"${p.description || ''}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `СКС_${panelData.name.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLight = theme === 'light';

  return (
    <div className={`border rounded-2xl p-5 shadow-xl transition-colors space-y-6 ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
    }`}>
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                {panelData.name}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {panelData.model || '19" 24xRJ45 Cat.6 1U'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>{panelData.location || 'Без локации'}</span>
              {panelData.notes && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span>{panelData.notes}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => onEditPanel(panelData)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
            }`}
            title="Редактировать патч-панель"
          >
            <Edit2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <button
            onClick={() => onDeletePanel(panelData.id)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer text-rose-500 shrink-0 ${
              isLight ? 'bg-rose-50 hover:bg-rose-100 border-rose-200' : 'bg-rose-950/30 hover:bg-rose-900/50 border-rose-900/40'
            }`}
            title="Удалить патч-панель"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats and Mode Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Badges */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="font-mono text-slate-500">
            Всего: <strong className="text-slate-900 dark:text-white">{ports.length} портов</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Скоммутировано: <strong>{connectedCount}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="font-mono text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
            Свободно: <strong>{freeCount}</strong>
          </span>
          {damagedCount > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="font-mono text-rose-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Обрыв: <strong>{damagedCount}</strong>
              </span>
            </>
          )}
        </div>

        {/* View switcher & CSV Export */}
        <div className="flex items-center gap-2">
          <div className={`h-9 p-0.5 rounded-xl border flex items-center shrink-0 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => setActiveTab('faceplate')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'faceplate'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Лицевая панель 1U
            </button>
            <button
              onClick={() => setActiveTab('journal')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'journal'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Журнал СКС (Розетки)
            </button>
          </div>

          <button
            onClick={exportCsv}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
              isLight
                ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
            title="Экспорт кабельного журнала СКС в Excel CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {activeTab === 'faceplate' ? (
        <div className="space-y-6">
          {/* Active Port Trace Card */}
          {selectedPort && (
            <div className={`p-4 rounded-xl border shadow-sm transition-all ${
              isLight ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-950/20 border-blue-900/40'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-blue-200/60 dark:border-blue-900/40">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                    Порт #{selectedPort.number}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    selectedPort.connectedSwitchId
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : selectedPort.status === 'damaged'
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                  }`}>
                    {selectedPort.connectedSwitchId ? 'Скоммутирован' : selectedPort.status === 'damaged' ? 'Поврежден' : 'Свободен'}
                  </span>
                  {selectedPort.description && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                      • {selectedPort.description}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onOpenPortDrawer(selectedPort)}
                  className="h-9 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start md:self-auto transition-colors shadow-xs whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Настроить порт #{selectedPort.number}</span>
                </button>
              </div>

              {/* End-to-end interactive trace steps */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 text-xs">
                {/* 1. Wall Outlet */}
                <div className={`p-2.5 rounded-lg border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] uppercase font-bold text-amber-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    1. Розетка в кабинете
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white mt-1 truncate">
                    {selectedPort.room || 'Не назначен'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Розетка: <strong>{selectedPort.socket || '—'}</strong>
                  </div>
                </div>

                {/* 2. Horizontal Twisted Pair */}
                <div className={`p-2.5 rounded-lg border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] uppercase font-bold text-blue-500 flex items-center gap-1">
                    <Cable className="w-3 h-3" />
                    2. Кабельная трасса
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white mt-1">
                    {selectedPort.cableType || 'UTP Cat.6'}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Длина: {selectedPort.cableLength || '25м'} {selectedPort.cableMark ? `(№${selectedPort.cableMark})` : ''}
                  </div>
                </div>

                {/* 3. Patch Cord */}
                <div className={`p-2.5 rounded-lg border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] uppercase font-bold text-indigo-500 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" />
                    3. Патч-корд кросса
                  </div>
                  {selectedPort.connectedSwitchId ? (
                    <>
                      <div className="flex items-center gap-1.5 mt-1 font-bold text-slate-900 dark:text-white">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: selectedPort.patchCordColor || '#3b82f6' }}
                        />
                        <span>{selectedPort.patchCordLength || '1м'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ПП #{selectedPort.number} ➔ Коммутатор
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 mt-2">
                      Патчкорд не подключен
                    </div>
                  )}
                </div>

                {/* 4. Switch & VLAN */}
                <div className={`p-2.5 rounded-lg border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}>
                  <div className="text-[10px] uppercase font-bold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    4. Коммутатор и VLAN
                  </div>
                  {connectedSwitch && connectedSwitchPort ? (
                    <>
                      <div
                        onClick={() => onJumpToSwitch(connectedSwitch.id, connectedSwitchPort.id)}
                        className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 cursor-pointer hover:underline flex items-center gap-1 truncate"
                        title="Перейти к коммутатору"
                      >
                        <span>{connectedSwitch.name} ({connectedSwitchPort.name || 'P' + connectedSwitchPort.number})</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {connectedSwitchPort.mode === 'trunk'
                          ? `Trunk (PVID ${connectedSwitchPort.pvid})`
                          : `Access (VLAN ${connectedSwitchPort.pvid})`}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 mt-2">
                      Порт свободен
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 19-INCH 1U PATCH PANEL HARDWARE CHASSIS */}
          <div className="w-full overflow-x-auto pb-4">
            <div className={`min-w-[920px] rounded-xl p-3 border-2 shadow-2xl relative select-none ${
              isLight
                ? 'bg-linear-to-b from-slate-200 via-slate-100 to-slate-200 border-slate-400 text-slate-800'
                : 'bg-linear-to-b from-slate-900 via-slate-850 to-slate-950 border-slate-700 text-slate-100'
            }`}>
              {/* Left & Right Rack Mount Ears */}
              <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-around text-slate-400/60 pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-slate-300 dark:bg-slate-800" />
                <div className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-slate-300 dark:bg-slate-800" />
              </div>
              <div className="absolute right-1.5 top-0 bottom-0 flex flex-col justify-around text-slate-400/60 pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-slate-300 dark:bg-slate-800" />
                <div className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-slate-300 dark:bg-slate-800" />
              </div>

              {/* Panel Branding / Header Strip */}
              <div className="px-6 pb-2.5 flex items-center justify-between border-b border-slate-300 dark:border-slate-800 text-[11px] font-mono">
                <div className="flex items-center gap-3">
                  <span className="font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                    {panelData.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    CATEGORY 6 UTP 24-PORT 1U PATCH PANEL
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono tracking-widest">
                  TIA/EIA 568-B • 100 OHM
                </div>
              </div>

              {/* 24 Ports Grid: 4 blocks of 6 ports */}
              <div className="px-6 py-4 grid grid-cols-4 gap-4">
                {[0, 1, 2, 3].map(blockIdx => {
                  const blockPorts = ports.slice(blockIdx * 6, blockIdx * 6 + 6);

                  return (
                    <div
                      key={blockIdx}
                      className={`p-2 rounded-lg border grid grid-cols-6 gap-2 ${
                        isLight
                          ? 'bg-slate-300/60 border-slate-400/80 shadow-inner'
                          : 'bg-slate-950/80 border-slate-800 shadow-inner'
                      }`}
                    >
                      {blockPorts.map(p => {
                        const isSelected = selectedPort?.id === p.id;
                        const isConnected = Boolean(p.connectedSwitchId);

                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedPortId(p.id)}
                            onDoubleClick={() => onOpenPortDrawer(p)}
                            title={`Порт #${p.number}: ${p.room || 'Без кабинета'} (${p.socket || 'Розетка'})`}
                            className={`flex flex-col items-center cursor-pointer transition-all p-1 rounded-md relative ${
                              isSelected
                                ? 'ring-2 ring-blue-500 scale-105 bg-blue-500/10'
                                : 'hover:scale-102 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                          >
                            {/* Port Number */}
                            <span className="font-mono text-[9px] font-bold text-slate-500 mb-1">
                              {p.number}
                            </span>

                            {/* Keystone RJ45 Socket */}
                            <div className={`w-8 h-8 rounded-sm border flex flex-col items-center justify-center relative shadow-sm ${
                              isConnected
                                ? (isLight ? 'bg-slate-800 border-slate-900' : 'bg-black border-slate-700')
                                : (isLight ? 'bg-slate-200 border-slate-400' : 'bg-slate-900 border-slate-800')
                            }`}>
                              {/* RJ45 socket cutout shape */}
                              <div className="w-5 h-4.5 bg-slate-950 rounded-xs flex flex-col justify-between p-0.5 border border-slate-700">
                                {/* 8 Gold Contact Pins */}
                                <div className="flex justify-between px-0.5">
                                  {Array.from({ length: 8 }).map((_, pi) => (
                                    <span key={pi} className="w-[1px] h-1.5 bg-amber-400/90 rounded-xs" />
                                  ))}
                                </div>
                                <div className="w-2.5 h-1 bg-slate-800 mx-auto rounded-xs" />
                              </div>

                              {/* Patch Cord Plug indicator if patched */}
                              {isConnected && (
                                <div
                                  className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-white dark:border-black flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: p.patchCordColor || '#3b82f6' }}
                                  title={`Патчкорд: ${p.patchCordLength || '1м'}`}
                                >
                                  <span className="text-[7px] text-white font-bold leading-none">✓</span>
                                </div>
                              )}
                            </div>

                            {/* Paper Label Strip under socket */}
                            <div className={`w-full text-center mt-1.5 px-0.5 py-0.5 rounded-xs border text-[8px] font-mono leading-tight truncate ${
                              isLight
                                ? 'bg-white border-slate-300 text-slate-700'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}>
                              {p.socket || `Р-${p.number}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Grounding / Safety info */}
              <div className="px-6 pt-1 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                <span>⚡ GROUND TERMINAL CONNECTED</span>
                <span>PORTS 1–24 T568B</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Journal Table View (Таблица СКС розеток) */
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Поиск по кабинету, розетке, маркировке..."
                  className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className={`text-xs px-2.5 py-1.5 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <option value="all">Все кабинеты ({uniqueRooms.length})</option>
                {uniqueRooms.map(rm => (
                  <option key={rm} value={rm}>{rm}</option>
                ))}
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
                  <th className="py-2.5 px-3">Порт</th>
                  <th className="py-2.5 px-3">Кабинет / Помещение</th>
                  <th className="py-2.5 px-3">Розетка</th>
                  <th className="py-2.5 px-3">Маркировка</th>
                  <th className="py-2.5 px-3">Трасса</th>
                  <th className="py-2.5 px-3">Статус</th>
                  <th className="py-2.5 px-3">Коммутатор и порт</th>
                  <th className="py-2.5 px-3">Патчкорд</th>
                  <th className="py-2.5 px-3">Примечание</th>
                  <th className="py-2.5 px-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredPorts.map(p => {
                  const sw = allSwitches.find(s => s.id === p.connectedSwitchId);
                  const swPort = sw?.ports?.find(sp => sp.id === p.connectedSwitchPortId || sp.number === p.connectedSwitchPortId);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                        selectedPort?.id === p.id ? (isLight ? 'bg-blue-50/80' : 'bg-blue-950/20') : ''
                      }`}
                    >
                      {/* Port # */}
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        #{p.number}
                      </td>

                      {/* Room */}
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                        {p.room || '—'}
                      </td>

                      {/* Socket */}
                      <td className="py-2.5 px-3 font-mono">
                        <span className="px-1.5 py-0.5 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {p.socket || `Р-${p.number}`}
                        </span>
                      </td>

                      {/* Cable Mark */}
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {p.cableMark || '—'}
                      </td>

                      {/* Cable Specs */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {p.cableType || 'Cat.6'} ({p.cableLength || '25м'})
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          p.connectedSwitchId
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : p.status === 'damaged'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                        }`}>
                          {p.connectedSwitchId ? 'Скоммутирован' : p.status === 'damaged' ? 'Поврежден' : 'Свободен'}
                        </span>
                      </td>

                      {/* Switch and Port */}
                      <td className="py-2.5 px-3">
                        {sw && swPort ? (
                          <div
                            onClick={() => onJumpToSwitch(sw.id, swPort.id)}
                            className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline flex items-center gap-1"
                          >
                            <span>{sw.name} ({swPort.name || 'P' + swPort.number})</span>
                            {swPort.pvid && (
                              <span className="text-[9px] px-1 bg-slate-200 dark:bg-slate-800 rounded-xs text-slate-600 dark:text-slate-300">
                                V{swPort.pvid}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Patch Cord */}
                      <td className="py-2.5 px-3">
                        {p.connectedSwitchId ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: p.patchCordColor || '#3b82f6' }}
                            />
                            <span>{p.patchCordLength || '1м'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="py-2.5 px-3 text-slate-500 text-xs max-w-xs truncate">
                        {p.description || '—'}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onOpenPortDrawer(p)}
                          className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors"
                        >
                          Изменить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
