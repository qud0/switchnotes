import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Power,
  PowerOff,
  Zap,
  Tag,
  Sparkles,
  Sliders,
  X,
  Check,
  CheckSquare,
  AlertTriangle,
  RefreshCw,
  ChevronUp
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { calculateBatchBlastRadius } from '../utils/blastRadius';
import { BlastRadiusModal } from './BlastRadiusModal';

export function BatchPortActionBar({
  switchData,
  selectedPortIds = [],
  ports = [],
  vlans = [],
  allSwitches = [],
  ipAllocations = [],
  servers = [],
  onClearSelection,
  onOpenProfileModal,
  onOpenBatchDrawer,
  onReloadData,
  theme = 'dark'
}) {
  if (!selectedPortIds || selectedPortIds.length === 0 || !switchData) return null;

  const isLight = theme === 'light';
  const toast = useToast();
  const [isActing, setIsActing] = useState(false);
  const [actionType, setActionType] = useState(null); // 'enable' | 'disable' | 'poe_cycle' | 'vlan'
  const [showVlanPicker, setShowVlanPicker] = useState(false);
  const [selectedVlanId, setSelectedVlanId] = useState(vlans[0]?.id || 1);
  const [blastModalOpen, setBlastModalOpen] = useState(false);
  const [blastRadiusData, setBlastRadiusData] = useState(null);
  const vlanPickerRef = useRef(null);

  // Filter selected port objects
  const selectedPorts = useMemo(() => {
    return ports.filter(p => selectedPortIds.includes(p.id));
  }, [ports, selectedPortIds]);

  const sortedPortNumbers = useMemo(() => {
    return [...selectedPorts].map(p => p.number).sort((a, b) => a - b);
  }, [selectedPorts]);

  const portRangeLabel = useMemo(() => {
    if (sortedPortNumbers.length === 0) return '';
    if (sortedPortNumbers.length === 1) return `Порт ${sortedPortNumbers[0]}`;
    const min = sortedPortNumbers[0];
    const max = sortedPortNumbers[sortedPortNumbers.length - 1];
    if (sortedPortNumbers.length === max - min + 1) {
      return `Порты ${min}–${max}`;
    }
    if (sortedPortNumbers.length <= 4) {
      return `Порты: ${sortedPortNumbers.join(', ')}`;
    }
    return `Порты: ${sortedPortNumbers.slice(0, 3).join(', ')}... (+${sortedPortNumbers.length - 3})`;
  }, [sortedPortNumbers]);

  const hasPoePorts = useMemo(() => {
    return switchData.poe || selectedPorts.some(p => p.poe);
  }, [switchData.poe, selectedPorts]);

  // Click outside to close VLAN picker
  useEffect(() => {
    const handleOutside = (e) => {
      if (vlanPickerRef.current && !vlanPickerRef.current.contains(e.target)) {
        setShowVlanPicker(false);
      }
    };
    if (showVlanPicker) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showVlanPicker]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showVlanPicker) setShowVlanPicker(false);
        else onClearSelection?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showVlanPicker, onClearSelection]);

  // Execute raw batch power action
  const executeBatchAction = async (action) => {
    setIsActing(true);
    setActionType(action);
    try {
      const res = await api.batchControlPorts(switchData.id, {
        portIds: selectedPortIds,
        action,
        applyToHardware: Boolean(switchData.ip)
      });

      toast.success(res.message || `Порты успешно ${action === 'enable' ? 'включены' : 'отключены'}`);
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast.error(err.message || 'Ошибка управления портами');
    } finally {
      setIsActing(false);
      setActionType(null);
    }
  };

  // Handle batch power enable / disable with Blast Radius check
  const handlePowerAction = async (action) => {
    if (action === 'disable') {
      const radius = calculateBatchBlastRadius({
        switchData,
        ports: selectedPorts,
        allSwitches,
        ipAllocations,
        servers,
        vlans
      });

      if (radius.riskLevel !== 'low') {
        setBlastRadiusData(radius);
        setBlastModalOpen(true);
        return;
      }
    }

    await executeBatchAction(action);
  };

  // Handle batch PoE reboot
  const handlePoeCycle = async () => {
    setIsActing(true);
    setActionType('poe_cycle');
    try {
      const res = await api.batchControlPorts(switchData.id, {
        portIds: selectedPortIds,
        action: 'poe_cycle',
        applyToHardware: Boolean(switchData.ip)
      });

      toast.success(res.message || `Питание PoE успешно перезагружено на ${selectedPorts.length} портах`);
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast.error(err.message || 'Ошибка сброса PoE');
    } finally {
      setIsActing(false);
      setActionType(null);
    }
  };

  // Handle quick batch VLAN assignment
  const handleApplyQuickVlan = async () => {
    setIsActing(true);
    setActionType('vlan');
    try {
      const targetVlan = vlans.find(v => v.id === selectedVlanId);
      const res = await api.batchControlPorts(switchData.id, {
        portIds: selectedPortIds,
        action: 'apply_profile',
        profileData: {
          profileName: targetVlan ? `VLAN ${targetVlan.id} (${targetVlan.name})` : `VLAN ${selectedVlanId}`,
          mode: 'access',
          pvid: selectedVlanId,
          taggedVlans: [],
          enabled: true
        },
        applyToHardware: Boolean(switchData.ip)
      });

      toast.success(`VLAN ${selectedVlanId} успешно применен к ${selectedPorts.length} портам!`);
      setShowVlanPicker(false);
      if (onReloadData) await onReloadData();
    } catch (err) {
      toast.error(err.message || 'Ошибка смены VLAN');
    } finally {
      setIsActing(false);
      setActionType(null);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[94vw] sm:max-w-2xl w-full animate-in slide-in-from-bottom-5 duration-200">
      <div className={`p-2.5 sm:p-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center justify-between gap-2.5 sm:gap-4 flex-wrap sm:flex-nowrap ${
        isLight
          ? 'bg-white/95 border-slate-300 text-slate-800 shadow-slate-400/30'
          : 'bg-slate-900/95 border-slate-700 text-white shadow-black/60'
      }`}>
        {/* Left: Selected count & chip */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold text-xs font-mono">
            {selectedPortIds.length}
          </div>
          <div>
            <span className="text-xs font-bold block leading-tight text-white">
              {portRangeLabel}
            </span>
            <span className="text-[10px] text-slate-400">
              Выбрано {selectedPortIds.length} из {ports.length}
            </span>
          </div>
        </div>

        {/* Center: Action Buttons Group */}
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap relative">
          {/* 1. Quick Enable */}
          <button
            type="button"
            onClick={() => handlePowerAction('enable')}
            disabled={isActing}
            title="Включить выбранные порты (no shutdown)"
            className="h-8 px-2.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isActing && actionType === 'enable' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden sm:inline">Включить</span>
          </button>

          {/* 2. Quick Disable */}
          <button
            type="button"
            onClick={() => handlePowerAction('disable')}
            disabled={isActing}
            title="Отключить выбранные порты (shutdown)"
            className="h-8 px-2.5 rounded-lg bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isActing && actionType === 'disable' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PowerOff className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="hidden sm:inline">Выключить</span>
          </button>

          {/* 3. PoE Reboot (if PoE capable) */}
          {hasPoePorts && (
            <button
              type="button"
              onClick={handlePoeCycle}
              disabled={isActing}
              title="Перезагрузить питание PoE на выбранных портах"
              className="h-8 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isActing && actionType === 'poe_cycle' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="hidden sm:inline">PoE Reboot</span>
            </button>
          )}

          {/* 4. Quick VLAN Selector Popover */}
          <div className="relative" ref={vlanPickerRef}>
            <button
              type="button"
              onClick={() => setShowVlanPicker(!showVlanPicker)}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>VLAN</span>
              <ChevronUp className="w-3 h-3 text-slate-400" />
            </button>

            {showVlanPicker && (
              <div className="absolute bottom-full mb-2 left-0 w-64 p-3 rounded-xl bg-slate-950 border border-slate-700 shadow-2xl z-50 animate-in fade-in zoom-in-95 space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Сменить VLAN ({selectedPortIds.length} порт.):</span>
                  <button onClick={() => setShowVlanPicker(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <select
                  value={selectedVlanId}
                  onChange={(e) => setSelectedVlanId(parseInt(e.target.value))}
                  className="w-full h-8 px-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs outline-none"
                >
                  {vlans.map(v => (
                    <option key={v.id} value={v.id}>
                      VLAN {v.id} — {v.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleApplyQuickVlan}
                  disabled={isActing}
                  className="w-full h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Применить к {selectedPortIds.length} портам</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Open Profile Modal */}
          <button
            type="button"
            onClick={onOpenProfileModal}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Профиль...</span>
          </button>

          {/* 6. Detailed PortDrawer */}
          <button
            type="button"
            onClick={onOpenBatchDrawer}
            title="Открыть детальные настройки для всех выбранных портов"
            className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Детально</span>
          </button>
        </div>

        {/* Right: Deselect button */}
        <button
          type="button"
          onClick={onClearSelection}
          title="Снять выделение со всех портов (Esc)"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Blast Radius Impact Warning Modal for Batch Actions */}
      <BlastRadiusModal
        isOpen={blastModalOpen}
        onClose={() => {
          setBlastModalOpen(false);
          setBlastRadiusData(null);
        }}
        onConfirm={async () => {
          await executeBatchAction('disable');
        }}
        switchData={switchData}
        ports={selectedPorts}
        blastRadius={blastRadiusData}
        action="disable"
        theme={theme}
      />
    </div>
  );
}
