import React, { useState, useEffect, useMemo } from 'react';
import { 
  Radio, X, RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert,
  Server, Key, Lock, Layers, Eye, Check, ArrowRight, Activity,
  Search, Copy, ExternalLink, HelpCircle, HardDrive
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function MacDiscoveryModal({
  isOpen,
  onClose,
  switchItem,
  onOpenDeviceTrace,
  onReloadSwitch
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all'); // all, matched, new, multiple, vlan_mismatch
  const [searchQuery, setSearchQuery] = useState('');

  // SSH Connection parameters
  const [showSshSettings, setShowSshSettings] = useState(false);
  const [sshHost, setSshHost] = useState(switchItem?.ip || '');
  const [sshUser, setSshUser] = useState('admin');
  const [sshPassword, setSshPassword] = useState('');
  const [simulateMode, setSimulateMode] = useState(true);

  // Sync state
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);

  useEffect(() => {
    if (switchItem) {
      setSshHost(switchItem.ip || '');
      // Auto run discovery when modal opens
      handleRunDiscovery();
    }
  }, [switchItem, isOpen]);

  if (!isOpen || !switchItem) return null;

  const handleRunDiscovery = async () => {
    setLoading(true);
    setError(null);
    setSyncSuccessMessage(null);
    setSelectedItems(new Set());

    try {
      const data = await api.discoverSwitchMacs(switchItem.id, {
        host: sshHost || switchItem.ip,
        username: sshUser,
        password: sshPassword,
        simulate: simulateMode
      });
      setResults(data);
    } catch (err) {
      setError(err.message || 'Ошибка выполнения опроса MAC-таблицы');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSelected = async () => {
    if (!results?.records || selectedItems.size === 0) return;

    setSyncing(true);
    setSyncSuccessMessage(null);

    const itemsToSync = results.records
      .filter((_, idx) => selectedItems.has(idx))
      .map(r => ({
        portNumber: r.portNumber,
        mac: r.mac,
        hostname: r.matchedIpam?.hostname || `${r.vendor} Host`,
        ip: r.matchedIpam?.ip || null,
        vlan: r.vlan
      }));

    try {
      const res = await api.syncSwitchMacs(switchItem.id, itemsToSync);
      setSyncSuccessMessage(`Синхронизировано: ${res.updatedPorts} портов, ${res.updatedIpam} записей в IPAM`);
      if (onReloadSwitch) onReloadSwitch();
      // Deselect all
      setSelectedItems(new Set());
    } catch (err) {
      toast.error(`Ошибка синхронизации: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredRecords.length) {
      setSelectedItems(new Set());
    } else {
      const allIdxs = new Set(filteredRecords.map((_, i) => i));
      setSelectedItems(allIdxs);
    }
  };

  const toggleItem = (idx) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const filteredRecords = useMemo(() => {
    if (!results?.records) return [];
    let list = results.records;

    if (activeFilter === 'matched') list = list.filter(r => r.status === 'matched');
    if (activeFilter === 'new') list = list.filter(r => r.status === 'new_device');
    if (activeFilter === 'multiple') list = list.filter(r => r.status === 'multiple');
    if (activeFilter === 'vlan_mismatch') list = list.filter(r => r.status === 'vlan_mismatch');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => 
        r.mac.toLowerCase().includes(q) ||
        r.interface.toLowerCase().includes(q) ||
        r.vendor?.toLowerCase().includes(q) ||
        r.matchedIpam?.hostname?.toLowerCase().includes(q) ||
        r.matchedIpam?.ip?.toLowerCase().includes(q) ||
        r.matchedOutlet?.socket?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [results, activeFilter, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Live MAC-опрос (FDB Table)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  {switchItem.name} ({switchItem.vendor})
                </span>
                {results?.isSimulated && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Тестовый опрос
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Чтение таблицы физических MAC-адресов портов коммутатора с привязкой к IPAM и розеткам
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSshSettings(!showSshSettings)}
              className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                showSshSettings
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Параметры SSH</span>
            </button>

            <button
              onClick={handleRunDiscovery}
              disabled={loading}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Опросить FDB сейчас</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SSH Settings Drawer (Collapsible) */}
        {showSshSettings && (
          <div className="p-4 bg-slate-950/90 border-b border-slate-800 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">IP хоста:</span>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder="192.168.10.x"
                    className="h-8 px-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs w-36"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">Логин:</span>
                  <input
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    className="h-8 px-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs w-24"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold">Пароль:</span>
                  <input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="••••••"
                    className="h-8 px-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs w-28"
                  />
                </div>

                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={simulateMode}
                    onChange={(e) => setSimulateMode(e.target.checked)}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Тестовый опрос FDB (без реального SSH)</span>
                </label>
              </div>

              <span className="text-[11px] text-slate-500">
                Команда: {switchItem.vendor === 'MikroTik' ? '/interface bridge host print' : 'show mac-address-table'}
              </span>
            </div>
          </div>
        )}

        {/* Sync Success Notification */}
        {syncSuccessMessage && (
          <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between px-6">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{syncSuccessMessage}</span>
            </span>
            <button onClick={() => setSyncSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Summary Metric Counters Bar */}
        {results && (
          <div className="p-4 bg-slate-900/60 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-slate-400 font-semibold uppercase block">Всего в FDB</span>
              <p className="text-lg font-bold text-white font-mono mt-0.5">{results.totalLearned}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-emerald-400 font-semibold uppercase block">В базе IPAM</span>
              <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">{results.matchedCount}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-sky-400 font-semibold uppercase block">Новые хосты</span>
              <p className="text-lg font-bold text-sky-400 font-mono mt-0.5">{results.newDeviceCount}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-amber-400 font-semibold uppercase block">Множественные (Хаб)</span>
              <p className="text-lg font-bold text-amber-400 font-mono mt-0.5">{results.multipleMacCount}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[11px] text-rose-400 font-semibold uppercase block">VLAN расхождения</span>
              <p className="text-lg font-bold text-rose-400 font-mono mt-0.5">{results.vlanMismatchCount}</p>
            </div>
          </div>
        )}

        {/* Filter Pills & Search */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-semibold mr-1">Фильтр:</span>
            {[
              { id: 'all', label: `Все (${results?.records?.length || 0})` },
              { id: 'matched', label: `В базе IPAM (${results?.matchedCount || 0})` },
              { id: 'new', label: `Новые устройства (${results?.newDeviceCount || 0})` },
              { id: 'multiple', label: `Хабы (>1 MAC) (${results?.multipleMacCount || 0})` },
              { id: 'vlan_mismatch', label: `VLAN расхождение (${results?.vlanMismatchCount || 0})` }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                  activeFilter === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по MAC, порту, IP..."
                className="w-full h-8 pl-8 pr-3 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {selectedItems.size > 0 && (
              <button
                onClick={handleSyncSelected}
                disabled={syncing}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                {syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span>Синхронизировать ({selectedItems.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Table */}
        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-sm font-semibold text-slate-200">Опрос коммутатора по SSH/API...</p>
              <p className="text-xs text-slate-500">Чтение таблицы пересылки пакетов (Forwarding Database / FDB)</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Radio className="w-10 h-10 mx-auto mb-2 opacity-30 text-blue-400" />
              <p className="text-sm font-semibold text-slate-300">Записей не найдено</p>
              <p className="text-xs text-slate-500 mt-1">Попробуйте сменить фильтр или повторить опрос FDB</p>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 shadow-inner">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === filteredRecords.length && filteredRecords.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-700 text-blue-600 focus:ring-0"
                      />
                    </th>
                    <th className="px-3 py-3">Порт коммутатора</th>
                    <th className="px-3 py-3">Изученный MAC</th>
                    <th className="px-3 py-3">Вендор (OUI)</th>
                    <th className="px-3 py-3">VLAN (FDB / Port)</th>
                    <th className="px-3 py-3">Сопоставление (IPAM / СКС)</th>
                    <th className="px-3 py-3">Диагностика</th>
                    <th className="px-3 py-3 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredRecords.map((r, idx) => {
                    const isSelected = selectedItems.has(idx);
                    return (
                      <tr 
                        key={`${r.interface}-${r.mac}-${idx}`} 
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isSelected ? 'bg-blue-950/20' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleItem(idx)}
                            className="rounded border-slate-700 text-blue-600 focus:ring-0"
                          />
                        </td>

                        <td className="px-3 py-2.5 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400 font-semibold">{r.interface}</span>
                            <span className="text-[10px] text-slate-500 font-sans uppercase">({r.portMode})</span>
                          </div>
                        </td>

                        <td className="px-3 py-2.5">
                          <span className="text-slate-100 font-bold">{r.mac}</span>
                        </td>

                        <td className="px-3 py-2.5 font-sans">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
                            {r.vendor}
                          </span>
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="text-blue-400 font-bold">VLAN {r.vlan}</span>
                            {r.portMode === 'access' && r.vlan !== r.portPvid && (
                              <span className="text-rose-400 text-[10px]" title={`PVID порта: ${r.portPvid}`}>
                                ≠ PVID {r.portPvid}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 font-sans">
                          {r.matchedIpam ? (
                            <div>
                              <span className="text-slate-200 font-semibold">{r.matchedIpam.hostname || 'Хост'}</span>
                              <span className="text-slate-400 font-mono text-[11px] block">{r.matchedIpam.ip}</span>
                            </div>
                          ) : r.matchedOutlet ? (
                            <div>
                              <span className="text-amber-400 font-medium">Розетка {r.matchedOutlet.socket}</span>
                              <span className="text-slate-500 text-[11px] block">{r.matchedOutlet.room}</span>
                            </div>
                          ) : r.connectedTo ? (
                            <span className="text-slate-300 text-[11px]">{r.connectedTo}</span>
                          ) : (
                            <span className="text-slate-600 text-[11px]">Не указано в базе</span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 font-sans">
                          {r.status === 'matched' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              В базе IPAM
                            </span>
                          ) : r.status === 'multiple' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              Хаб / Мини-свитч
                            </span>
                          ) : r.status === 'vlan_mismatch' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              VLAN Mismatch
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              Новое устройство
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2.5 text-right font-sans">
                          <button
                            onClick={() => {
                              if (onOpenDeviceTrace) {
                                onClose();
                                onOpenDeviceTrace(r.mac);
                              }
                            }}
                            className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] inline-flex items-center gap-1 transition-colors border border-slate-700 cursor-pointer"
                            title="Открыть сквозную трассировку по MAC"
                          >
                            <Activity className="w-3 h-3 text-blue-400" />
                            <span>Трассировка</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
          <span>
            {results?.timestamp ? `Последний опрос: ${new Date(results.timestamp).toLocaleTimeString()}` : ''}
          </span>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
