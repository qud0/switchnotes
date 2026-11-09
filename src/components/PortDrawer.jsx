import React, { useState, useEffect } from 'react';
import { X, Check, Layers, Zap, Info, Link as LinkIcon, Unlink, AlertTriangle, Power, PowerOff, RefreshCw } from 'lucide-react';
import { checkVlanMismatch } from '../utils/vlanMismatch';
import { VirtualTdrTester } from './VirtualTdrTester';
import { PortTrafficHistory } from './PortTrafficHistory';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { calculatePortBlastRadius, calculateBatchBlastRadius } from '../utils/blastRadius';
import { BlastRadiusModal } from './BlastRadiusModal';

export function PortDrawer({
  isOpen,
  onClose,
  targetPorts = [],
  vlans = [],
  allSwitches = [],
  patchPanels = [],
  ipAllocations = [],
  servers = [],
  currentSwitchId = null,
  onSave,
  theme = 'dark'
}) {
  if (!isOpen || targetPorts.length === 0) return null;

  const isBatch = targetPorts.length > 1;
  const singlePort = !isBatch ? targetPorts[0] : null;

  // Form state
  const [mode, setMode] = useState(singlePort?.mode || 'access');
  const [pvid, setPvid] = useState(singlePort?.pvid || 1);
  const [taggedVlans, setTaggedVlans] = useState(singlePort?.taggedVlans || []);
  const [description, setDescription] = useState(singlePort?.description || '');
  const [connectedTo, setConnectedTo] = useState(singlePort?.connectedTo || '');
  const [speed, setSpeed] = useState(singlePort?.speed || '1G');
  const [poe, setPoe] = useState(singlePort?.poe || false);
  const [enabled, setEnabled] = useState(singlePort?.enabled !== false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [poeCycling, setPoeCycling] = useState(false);
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  const [blastRadiusData, setBlastRadiusData] = useState(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState(null);

  // Link state
  const [isPeerLinkActive, setIsPeerLinkActive] = useState(Boolean(singlePort?.linkedSwitchId));
  const [linkedSwitchId, setLinkedSwitchId] = useState(singlePort?.linkedSwitchId || '');
  const [linkedPortId, setLinkedPortId] = useState(singlePort?.linkedPortId || '');

  // Patch panel state
  const [isPatchPanelActive, setIsPatchPanelActive] = useState(Boolean(singlePort?.patchPanelId));
  const [patchPanelId, setPatchPanelId] = useState(singlePort?.patchPanelId || '');
  const [patchPanelPortId, setPatchPanelPortId] = useState(singlePort?.patchPanelPortId || '');

  // LAG / LACP state
  const [isLagActive, setIsLagActive] = useState(Boolean(singlePort?.lagId));
  const [lagId, setLagId] = useState(singlePort?.lagId || '');
  const [lagName, setLagName] = useState(singlePort?.lagName || '');

  useEffect(() => {
    if (singlePort) {
      setMode(singlePort.mode || 'access');
      setPvid(singlePort.pvid || 1);
      setTaggedVlans(singlePort.taggedVlans || []);
      setDescription(singlePort.description || '');
      setConnectedTo(singlePort.connectedTo || '');
      setSpeed(singlePort.speed || '1G');
      setPoe(singlePort.poe || false);
      setEnabled(singlePort.enabled !== false);
      setIsPeerLinkActive(Boolean(singlePort.linkedSwitchId));
      setLinkedSwitchId(singlePort.linkedSwitchId || '');
      setLinkedPortId(singlePort.linkedPortId || '');
      setIsPatchPanelActive(Boolean(singlePort.patchPanelId));
      setPatchPanelId(singlePort.patchPanelId || '');
      setPatchPanelPortId(singlePort.patchPanelPortId || '');
      setIsLagActive(Boolean(singlePort.lagId));
      setLagId(singlePort.lagId || '');
      setLagName(singlePort.lagName || '');
    } else {
      setMode('access');
      setPvid(1);
      setTaggedVlans([]);
      setDescription('');
      setConnectedTo('');
      setSpeed('1G');
      setPoe(false);
      setEnabled(true);
      setIsPeerLinkActive(false);
      setLinkedSwitchId('');
      setLinkedPortId('');
      setIsPatchPanelActive(false);
      setPatchPanelId('');
      setPatchPanelPortId('');
      setIsLagActive(false);
      setLagId('');
      setLagName('');
    }
  }, [targetPorts, singlePort]);

  const handleSafeClose = () => {
    if (singlePort) {
      const isDirty =
        mode !== (singlePort.mode || 'access') ||
        pvid !== (singlePort.pvid || 1) ||
        description !== (singlePort.description || '') ||
        connectedTo !== (singlePort.connectedTo || '') ||
        speed !== (singlePort.speed || '1G') ||
        poe !== Boolean(singlePort.poe);
      if (isDirty) {
        if (!window.confirm('В настройках порта есть несохраненные изменения. Закрыть без сохранения?')) return;
      }
    }
    onClose();
  };

  // Peer switch list excluding current switch
  const availablePeerSwitches = allSwitches.filter(s => s.id !== currentSwitchId);
  const selectedPeerSwitch = availablePeerSwitches.find(s => s.id === linkedSwitchId);
  const selectedPeerPort = selectedPeerSwitch?.ports?.find(p => p.id === linkedPortId || p.number === linkedPortId);

  // Patch panel selection
  const selectedPatchPanel = patchPanels.find(pp => pp.id === patchPanelId);
  const selectedPatchPanelPort = selectedPatchPanel?.ports?.find(p => p.id === patchPanelPortId || p.number === patchPanelPortId);

  // Realtime mismatch preview inside drawer
  const mismatchPreview = selectedPeerPort ? checkVlanMismatch(
    { mode, pvid: parseInt(pvid), taggedVlans, enabled },
    selectedPeerPort
  ) : null;

  const toggleTaggedVlan = (vlanId) => {
    if (taggedVlans.includes(vlanId)) {
      setTaggedVlans(taggedVlans.filter(id => id !== vlanId));
    } else {
      setTaggedVlans([...taggedVlans, vlanId].sort((a, b) => a - b));
    }
  };

  const handleSelectPeerSwitch = (swId) => {
    setLinkedSwitchId(swId);
    const sw = availablePeerSwitches.find(s => s.id === swId);
    if (sw && sw.ports?.length > 0) {
      const firstPort = sw.ports[0];
      setLinkedPortId(firstPort.id);
      setConnectedTo(`${sw.name} (${firstPort.name || 'Порт ' + firstPort.number})`);
    } else {
      setLinkedPortId('');
    }
  };

  const handleSelectPeerPort = (pId) => {
    setLinkedPortId(pId);
    if (selectedPeerSwitch) {
      const p = selectedPeerSwitch.ports?.find(prt => prt.id === pId || prt.number === pId);
      if (p) {
        setConnectedTo(`${selectedPeerSwitch.name} (${p.name || 'Порт ' + p.number})`);
      }
    }
  };

  const handleClearLink = () => {
    setIsPeerLinkActive(false);
    setLinkedSwitchId('');
    setLinkedPortId('');
    setConnectedTo('');
  };

  const handleSelectPatchPanel = (ppId) => {
    setPatchPanelId(ppId);
    const pp = patchPanels.find(p => p.id === ppId);
    if (pp && pp.ports?.length > 0) {
      const firstPort = pp.ports[0];
      setPatchPanelPortId(firstPort.id);
      const roomStr = firstPort.room ? ` → ${firstPort.room} (${firstPort.socket})` : '';
      setConnectedTo(`${pp.name}:П${firstPort.number}${roomStr}`);
    } else {
      setPatchPanelPortId('');
    }
  };

  const handleSelectPatchPanelPort = (pId) => {
    setPatchPanelPortId(pId);
    if (selectedPatchPanel) {
      const p = selectedPatchPanel.ports?.find(prt => prt.id === pId || prt.number === pId);
      if (p) {
        const roomStr = p.room ? ` → ${p.room} (${p.socket})` : '';
        setConnectedTo(`${selectedPatchPanel.name}:П${p.number}${roomStr}`);
      }
    }
  };

  const handleClearPatchPanel = () => {
    setIsPatchPanelActive(false);
    setPatchPanelId('');
    setPatchPanelPortId('');
  };

  const executePortAction = async (action) => {
    if (!currentSwitchId) return;
    try {
      setActionLoading(true);
      if (action === 'poe_cycle') setPoeCycling(true);

      const portIdentifier = singlePort?.id || singlePort?.number;
      const res = await api.controlPort(currentSwitchId, portIdentifier, { action });

      if (action === 'enable' || action === 'disable') {
        const nextEnabled = res.enabled;
        setEnabled(nextEnabled);
        if (!nextEnabled) {
          setMode('disabled');
        } else if (mode === 'disabled') {
          setMode('access');
        }
      }

      toast?.success?.(res.message || 'Действие успешно выполнено');

      if (onSave) {
        await onSave({
          enabled: res.enabled !== undefined ? res.enabled : enabled,
          mode: res.enabled === false ? 'disabled' : (mode === 'disabled' ? 'access' : mode)
        });
      }
    } catch (err) {
      toast?.error?.(err.message || 'Ошибка управления портом');
    } finally {
      setActionLoading(false);
      setPoeCycling(false);
    }
  };

  const handlePortAction = async (action) => {
    if (action === 'disable') {
      const currentSwitch = allSwitches.find(s => s.id === currentSwitchId);
      if (currentSwitch && singlePort) {
        const radius = calculatePortBlastRadius({
          switchData: currentSwitch,
          port: singlePort,
          allSwitches,
          ipAllocations,
          servers,
          vlans
        });

        if (radius.riskLevel !== 'low') {
          setBlastRadiusData(radius);
          setPendingConfirmAction({ type: 'control', action: 'disable' });
          setBlastModalOpen(true);
          return;
        }
      }
    }

    await executePortAction(action);
  };

  const executeSubmit = async (updateData) => {
    try {
      await onSave(updateData);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const updateData = {
      mode,
      pvid: parseInt(pvid),
      taggedVlans: mode === 'trunk' ? taggedVlans : [],
      speed,
      poe,
      enabled: mode !== 'disabled' && enabled,
      lagId: isLagActive && lagId ? parseInt(lagId) : null,
      lagName: isLagActive && lagName ? lagName.trim() : ''
    };

    if (!isBatch) {
      updateData.description = description.trim();
      updateData.connectedTo = connectedTo.trim();
      updateData.linkedSwitchId = isPeerLinkActive && linkedSwitchId ? linkedSwitchId : null;
      updateData.linkedPortId = isPeerLinkActive && linkedPortId ? linkedPortId : null;
      updateData.patchPanelId = isPatchPanelActive && patchPanelId ? patchPanelId : null;
      updateData.patchPanelPortId = isPatchPanelActive && patchPanelPortId ? patchPanelPortId : null;
    } else {
      if (description.trim()) updateData.description = description.trim();
      if (connectedTo.trim()) updateData.connectedTo = connectedTo.trim();
    }

    // Проверка риска отключения через форму настроек
    const currentSwitch = allSwitches.find(s => s.id === currentSwitchId);
    if (currentSwitch) {
      if (!isBatch && singlePort && singlePort.enabled !== false && singlePort.mode !== 'disabled') {
        const isDisabling = !updateData.enabled || updateData.mode === 'disabled';
        if (isDisabling) {
          const radius = calculatePortBlastRadius({
            switchData: currentSwitch,
            port: singlePort,
            allSwitches,
            ipAllocations,
            servers,
            vlans
          });
          if (radius.riskLevel !== 'low') {
            setBlastRadiusData(radius);
            setPendingConfirmAction({ type: 'save', updateData });
            setBlastModalOpen(true);
            setLoading(false);
            return;
          }
        }
      } else if (isBatch && (!updateData.enabled || updateData.mode === 'disabled')) {
        const radius = calculateBatchBlastRadius({
          switchData: currentSwitch,
          ports: targetPorts,
          allSwitches,
          ipAllocations,
          servers,
          vlans
        });
        if (radius.riskLevel !== 'low') {
          setBlastRadiusData(radius);
          setPendingConfirmAction({ type: 'save', updateData });
          setBlastModalOpen(true);
          setLoading(false);
          return;
        }
      }
    }

    await executeSubmit(updateData);
  };

  const isLight = theme === 'light';

  return (
    <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-120 shadow-2xl flex flex-col transition-colors border-l ${
      isLight
        ? 'bg-white border-slate-200 text-slate-800'
        : 'bg-slate-900/98 border-slate-800 text-slate-100'
    }`}>
      {/* Drawer Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
              {isBatch ? `Групповая настройка портов` : (singlePort?.name || `Порт ${singlePort?.number}`)}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {isBatch ? `${targetPorts.length} шт.` : singlePort?.type?.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isBatch
              ? `Изменение параметров для портов: ${targetPorts.map(p => p.number).join(', ')}`
              : `Физический порт #${singlePort?.number}`}
          </p>
        </div>
        <button
          onClick={handleSafeClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Body */}
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
        {/* Live Hardware & Admin State Port Control (Single Port) */}
        {!isBatch && singlePort && (
          <div className={`p-4 rounded-2xl border space-y-3 transition-all ${
            isLight
              ? 'bg-gradient-to-br from-slate-50 to-slate-100/70 border-slate-200'
              : 'bg-gradient-to-br from-slate-900/90 to-slate-950 border-slate-800 shadow-md'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Power className={`w-4 h-4 ${enabled ? 'text-emerald-500' : 'text-rose-500'}`} />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Управление на коммутаторе
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide border flex items-center gap-1.5 ${
                enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {enabled ? 'Включен (no shutdown)' : 'Отключен (shutdown)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {enabled ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handlePortAction('disable')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Отключить порт на физическом коммутаторе (shutdown)"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>{actionLoading ? 'Выключение...' : 'Отключить порт'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handlePortAction('enable')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Включить порт на физическом коммутаторе (no shutdown)"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{actionLoading ? 'Включение...' : 'Включить порт'}</span>
                </button>
              )}

              {poe ? (
                <button
                  type="button"
                  disabled={actionLoading || poeCycling}
                  onClick={() => handlePortAction('poe_cycle')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Обесточить порт на 4 секунды для перезагрузки камеры или точки доступа"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${poeCycling ? 'animate-spin' : ''}`} />
                  <span>{poeCycling ? 'Сброс питания...' : 'Сброс PoE'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handlePortAction(enabled ? 'disable' : 'enable')}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  title="Инвертировать состояние порта"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Переключить</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Команда отправляется на коммутатор по SNMP / SSH и меняет состояние порта в реальном времени.</span>
            </p>
          </div>
        )}

        {/* Port Mode Switcher */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Режим работы порта
          </label>
          <div className={`grid grid-cols-3 gap-2 p-1 rounded-xl border ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              type="button"
              onClick={() => setMode('access')}
              className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                mode === 'access'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Access (Доступ)
            </button>
            <button
              type="button"
              onClick={() => setMode('trunk')}
              className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                mode === 'trunk'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Trunk (Магистраль)
            </button>
            <button
              type="button"
              onClick={() => setMode('disabled')}
              className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
                mode === 'disabled'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Отключен
            </button>
          </div>
        </div>

        {/* ACCESS Mode Config */}
        {mode === 'access' && (
          <div className={`space-y-3 p-4 rounded-xl border ${
            isLight ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Назначенный VLAN (PVID / Untagged)
            </label>
            <select
              value={pvid}
              onChange={(e) => setPvid(Number(e.target.value))}
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            >
              {vlans.map((v) => (
                <option key={v.id} value={v.id}>
                  VLAN {v.id} — {v.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>Весь трафик без тега попадает в этот VLAN.</span>
            </div>
          </div>
        )}

        {/* TRUNK Mode Config */}
        {mode === 'trunk' && (
          <div className={`space-y-4 p-4 rounded-xl border ${
            isLight ? 'bg-purple-50/60 border-purple-200' : 'bg-purple-950/20 border-purple-900/40'
          }`}>
            <div>
              <label className="block text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">
                Native / Untagged VLAN (PVID)
              </label>
              <select
                value={pvid}
                onChange={(e) => setPvid(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-hidden ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              >
                {vlans.map((v) => (
                  <option key={v.id} value={v.id}>
                    VLAN {v.id} — {v.name} (Native)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                  Пропускаемые VLAN (Tagged / Allowed):
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTaggedVlans(vlans.map(v => v.id))}
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    Все
                  </button>
                  <span className="text-slate-400">|</span>
                  <button
                    type="button"
                    onClick={() => setTaggedVlans([])}
                    className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                  >
                    Сбросить
                  </button>
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-800'
              }`}>
                {vlans.map((vlan) => {
                  const isChecked = taggedVlans.includes(vlan.id);
                  return (
                    <label
                      key={vlan.id}
                      className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer border transition-all text-xs ${
                        isChecked
                          ? (isLight ? 'bg-purple-50 border-purple-400 text-purple-900' : 'bg-slate-900 border-purple-500/50 text-white')
                          : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTaggedVlan(vlan.id)}
                        className="rounded-xs text-purple-600 focus:ring-0"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: vlan.color }}
                      />
                      <span className="font-mono font-medium">V{vlan.id}</span>
                      <span className="truncate text-slate-500 text-[11px]">{vlan.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Inter-Switch Link Section (Only for single port edit) */}
        {!isBatch && (
          <div className={`p-4 rounded-xl border space-y-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Связь с другим коммутатором</span>
              </label>

              {isPeerLinkActive ? (
                <button
                  type="button"
                  onClick={handleClearLink}
                  className="text-xs text-red-500 hover:underline flex items-center gap-1"
                >
                  <Unlink className="w-3 h-3" />
                  Отвязать
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPeerLinkActive(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  + Связать с портом
                </button>
              )}
            </div>

            {isPeerLinkActive ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Удаленный коммутатор</label>
                  <select
                    value={linkedSwitchId}
                    onChange={(e) => handleSelectPeerSwitch(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  >
                    <option value="">-- Выберите коммутатор --</option>
                    {availablePeerSwitches.map(sw => (
                      <option key={sw.id} value={sw.id}>
                        {sw.name} ({sw.model}) - {sw.ip}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPeerSwitch && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Порт удаленного коммутатора</label>
                    <select
                      value={linkedPortId}
                      onChange={(e) => handleSelectPeerPort(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    >
                      <option value="">-- Выберите порт --</option>
                      {selectedPeerSwitch.ports?.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || `Порт ${p.number}`} ({p.mode.toUpperCase()}, PVID: {p.pvid}) {p.description ? `- ${p.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Instant Mismatch Warning Box inside drawer */}
                {mismatchPreview?.hasMismatch && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 dark:text-red-400 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                      <span>Внимание! Конфигурации портов различаются:</span>
                    </div>
                    {mismatchPreview.issues.map((iss, idx) => (
                      <div key={idx} className="pl-4 list-disc text-[11px]">
                        • {iss.title}: <span className="font-mono">{iss.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Порт можно напрямую привязать к порту другого свитча. Приложение автоматически синхронизирует обратный линк и будет отслеживать коллизии VLAN.
              </p>
            )}
          </div>
        )}

        {/* Patch Panel (СКС) Section */}
        {!isBatch && (
          <div className={`p-4 rounded-xl border space-y-3 ${
            isLight ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Подключение к патч-панели (СКС)
                </span>
              </div>
              {isPatchPanelActive ? (
                <button
                  type="button"
                  onClick={handleClearPatchPanel}
                  className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Unlink className="w-3 h-3" />
                  Отвязать
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsPatchPanelActive(true);
                    if (patchPanels.length > 0) handleSelectPatchPanel(patchPanels[0].id);
                  }}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium cursor-pointer"
                >
                  Привязать к кроссу
                </button>
              )}
            </div>

            {isPatchPanelActive ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Патч-панель</label>
                  <select
                    value={patchPanelId}
                    onChange={(e) => handleSelectPatchPanel(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  >
                    <option value="">-- Выберите патч-панель --</option>
                    {patchPanels.map(pp => (
                      <option key={pp.id} value={pp.id}>
                        {pp.name} ({pp.location || '19"'})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPatchPanel && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Порт патч-панели</label>
                    <select
                      value={patchPanelPortId}
                      onChange={(e) => handleSelectPatchPanelPort(e.target.value)}
                      className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-amber-500 focus:outline-hidden ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    >
                      <option value="">-- Выберите порт --</option>
                      {selectedPatchPanel.ports?.map(p => (
                        <option key={p.id} value={p.id}>
                          #{p.number} — {p.room || 'Без кабинета'} ({p.socket || 'Розетка'}) {p.cableLength ? `[${p.cableLength}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedPatchPanelPort && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs space-y-1">
                    <div className="font-bold text-amber-700 dark:text-amber-300">
                      Линия СКС: {selectedPatchPanelPort.room || 'Кабинет не указан'}
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                      Розетка: <strong>{selectedPatchPanelPort.socket}</strong> • Кабель: {selectedPatchPanelPort.cableType || 'Cat.6'} ({selectedPatchPanelPort.cableLength || '25м'})
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Привязка порта к физической розетке в кабинете через патч-панель структурированной кабельной системы.
              </p>
            )}
          </div>
        )}

        {/* LACP / LAG Aggregation Section */}
        <div className={`p-4 rounded-xl border space-y-3 ${
          isLight ? 'bg-indigo-50/50 border-indigo-200' : 'bg-indigo-950/20 border-indigo-900/40'
        }`}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Агрегация каналов (LACP / LAG)</span>
            </label>
            <input
              type="checkbox"
              checked={isLagActive}
              onChange={(e) => setIsLagActive(e.target.checked)}
              className="rounded-xs text-indigo-600 focus:ring-0 cursor-pointer"
            />
          </div>

          {isLagActive ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Номер LAG (1–8)</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={lagId}
                  onChange={(e) => setLagId(e.target.value)}
                  placeholder="1"
                  className={`w-full border rounded-lg px-3 py-1.5 text-xs font-mono focus:border-indigo-500 focus:outline-hidden ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Имя группы</label>
                <input
                  type="text"
                  value={lagName}
                  onChange={(e) => setLagName(e.target.value)}
                  placeholder="bond1 или Port-Channel 1"
                  className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-hidden ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Объединение нескольких физических портов в один высокоскоростной логический канал (Bonding / LACP).
            </p>
          )}
        </div>

        {/* Documentation Info */}
        <div className="space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Документация и коммутация
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Назначение / Описание (Description)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Например: Бухгалтерия, рабочее место 2"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Куда подключен кабель (Connected To)
            </label>
            <input
              type="text"
              value={connectedTo}
              onChange={(e) => setConnectedTo(e.target.value)}
              placeholder="Например: Розетка 2.14 или Патч-панель PP1-04"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Скорость порта</label>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              >
                <option value="Auto">Auto-Negotiate</option>
                <option value="100M">100 Mbps</option>
                <option value="1G">1 Gbps</option>
                <option value="2.5G">2.5 Gbps</option>
                <option value="10G">10 Gbps</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Питание PoE</label>
              <button
                type="button"
                onClick={() => setPoe(!poe)}
                className={`w-full py-2 px-3 rounded-lg border flex items-center justify-center gap-1.5 text-sm font-medium transition-all ${
                  poe
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-500'
                    : (isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-950 border-slate-800 text-slate-400')
                }`}
              >
                <Zap className={`w-4 h-4 ${poe ? 'fill-amber-500' : ''}`} />
                {poe ? 'PoE Включено' : 'PoE Выкл'}
              </button>
            </div>
          </div>
        </div>

        {/* Real-Time SNMP Traffic Telemetry & History (Single Port only) */}
        {!isBatch && singlePort && (
          <PortTrafficHistory
            switchId={currentSwitchId}
            portNumber={singlePort.number}
            portName={singlePort.name || `Порт ${singlePort.number}`}
            theme={theme}
          />
        )}

        {/* Virtual TDR Cable Tester Tool (Single Port only) */}
        {!isBatch && singlePort && singlePort.type !== 'sfp' && (
          <VirtualTdrTester
            portNumber={singlePort.number}
            portName={singlePort.name || `Порт ${singlePort.number}`}
            connectedSocket={selectedPatchPanelPort?.socket || connectedTo || `Р-${singlePort.number}`}
            cableLength={selectedPatchPanelPort?.cableLength || '25м'}
            speed={speed}
            theme={theme}
          />
        )}

        {/* Drawer Action buttons */}
        <div className={`pt-4 border-t flex items-center justify-end gap-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <button
            type="button"
            onClick={handleSafeClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Сохранение...' : 'Применить'}
          </button>
        </div>
      </form>

      {/* Blast Radius Protection Modal */}
      <BlastRadiusModal
        isOpen={blastModalOpen}
        onClose={() => {
          setBlastModalOpen(false);
          setPendingConfirmAction(null);
          setBlastRadiusData(null);
        }}
        onConfirm={async () => {
          if (pendingConfirmAction?.type === 'control') {
            await executePortAction(pendingConfirmAction.action);
          } else if (pendingConfirmAction?.type === 'save') {
            await executeSubmit(pendingConfirmAction.updateData);
          }
        }}
        switchData={allSwitches.find(s => s.id === currentSwitchId) || { name: 'Коммутатор' }}
        port={!isBatch ? singlePort : null}
        ports={isBatch ? targetPorts : []}
        blastRadius={blastRadiusData}
        action="disable"
        theme={theme}
      />
    </div>
  );
}
