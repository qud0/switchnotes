import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Play,
  RefreshCw,
  Terminal,
  Server,
  Globe,
  Link as LinkIcon,
  RotateCcw,
  Lock,
  ArrowRight,
  Layers,
  Copy,
  Check,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function VlanBlastRadiusModal({
  isOpen,
  onClose,
  switches = [],
  vlans = [],
  theme = 'dark',
  initialSwitchId = '',
  initialPortId = '',
  onDataChanged
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';
  const toast = useToast();

  // Selection states
  const [selectedSwitchId, setSelectedSwitchId] = useState(initialSwitchId || switches[0]?.id || '');
  const [selectedPortId, setSelectedPortId] = useState(initialPortId || '');
  const [action, setAction] = useState('change_access_vlan'); // 'change_access_vlan' | 'remove_trunk_vlan' | 'add_trunk_vlan' | 'set_trunk_vlans'
  const [targetVlanId, setTargetVlanId] = useState(vlans[0]?.id || 10);
  const [targetVlansStr, setTargetVlansStr] = useState('10,20,30');
  const [syncPeerPort, setSyncPeerPort] = useState(true);

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationError, setSimulationError] = useState(null);

  // Execution state
  const [applyToHardware, setApplyToHardware] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'assets' | 'cli'
  const [copiedCli, setCopiedCli] = useState(false);

  // Current switch & port
  const currentSwitch = useMemo(() => {
    return switches.find(s => String(s.id) === String(selectedSwitchId)) || switches[0] || null;
  }, [switches, selectedSwitchId]);

  const ports = useMemo(() => {
    return currentSwitch?.ports || [];
  }, [currentSwitch]);

  const currentPort = useMemo(() => {
    return ports.find(p => String(p.id) === String(selectedPortId) || String(p.number) === String(selectedPortId)) || ports[0] || null;
  }, [ports, selectedPortId]);

  // Set initial port when switch changes
  useEffect(() => {
    if (ports.length > 0 && !ports.some(p => String(p.id) === String(selectedPortId) || String(p.number) === String(selectedPortId))) {
      setSelectedPortId(ports[0].id || ports[0].number || '');
    }
  }, [ports, selectedPortId]);

  // Run simulation whenever parameters change
  useEffect(() => {
    if (!currentSwitch || !currentPort) return;

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSimulating(true);
      setSimulationError(null);
      try {
        const targetVlans = targetVlansStr
          .split(',')
          .map(s => Number.parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));

        const res = await api.simulateVlanChange({
          switchId: currentSwitch.id,
          portId: currentPort.id || currentPort.number,
          action,
          targetVlanId: Number(targetVlanId),
          targetVlans,
          syncPeerPort
        });

        if (isMounted) {
          setSimulationResult(res);
        }
      } catch (err) {
        if (isMounted) {
          setSimulationError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsSimulating(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentSwitch?.id, currentPort?.id, action, targetVlanId, targetVlansStr, syncPeerPort]);

  const handleApply = async (force = false) => {
    if (!currentSwitch || !currentPort) return;

    if (simulationResult?.riskLevel === 'CRITICAL' && !force) {
      if (!window.confirm('ВНИМАНИЕ! Симулятор зафиксировал КРИТИЧЕСКИЙ РИСК изоляции сети или потери управления.\nВы уверены, что хотите принудительно применить это изменение?')) {
        return;
      }
    }

    setIsApplying(true);
    try {
      const targetVlans = targetVlansStr
        .split(',')
        .map(s => Number.parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));

      const res = await api.applyVlanChange({
        switchId: currentSwitch.id,
        portId: currentPort.id || currentPort.number,
        action,
        targetVlanId: Number(targetVlanId),
        targetVlans,
        syncPeerPort,
        applyToHardware,
        force: Boolean(force || simulationResult?.riskLevel === 'CRITICAL')
      });

      toast?.success('Изменение VLAN успешно применено!');
      onDataChanged?.();
      onClose();
    } catch (err) {
      toast?.error(`Ошибка применения: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const hasPeerLink = Boolean(currentPort?.linkedSwitchId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base flex items-center gap-2">
                <span>VLAN Blast Radius Simulator</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 font-normal">
                  Dry-Run Sandbox
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Моделирование зоны поражения и валидация Guardrails перед применением изменений
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className={`p-4 border-b grid grid-cols-1 md:grid-cols-4 gap-3 text-xs shrink-0 ${
          isLight ? 'bg-slate-100/50 border-slate-200' : 'bg-slate-950/30 border-slate-800'
        }`}>
          {/* Switch Select */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Коммутатор</label>
            <select
              value={selectedSwitchId}
              onChange={(e) => setSelectedSwitchId(e.target.value)}
              className={`w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              {switches.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.vendor} {s.ip})</option>
              ))}
            </select>
          </div>

          {/* Port Select */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Порт</label>
            <select
              value={selectedPortId}
              onChange={(e) => setSelectedPortId(e.target.value)}
              className={`w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              {ports.map(p => (
                <option key={p.id || p.number} value={p.id || p.number}>
                  {p.name || `Port ${p.number}`} [{p.mode === 'trunk' ? 'Trunk' : `VLAN ${p.vlan || 1}`}]
                  {p.linkedSwitchId ? ' ⇄ Uplink' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Action Select */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Планируемое действие</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={`w-full h-8 px-2.5 rounded-lg border text-xs font-medium outline-none cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <option value="change_access_vlan">Сменить Access VLAN</option>
              <option value="remove_trunk_vlan">Удалить VLAN из транка</option>
              <option value="add_trunk_vlan">Добавить VLAN в транк</option>
              <option value="set_trunk_vlans">Задать список транка</option>
            </select>
          </div>

          {/* Target VLAN Input */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              {action === 'set_trunk_vlans' ? 'Список VLAN (через запятую)' : 'Целевой VLAN'}
            </label>
            {action === 'set_trunk_vlans' ? (
              <input
                type="text"
                value={targetVlansStr}
                onChange={(e) => setTargetVlansStr(e.target.value)}
                placeholder="10,20,30,50"
                className={`w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              />
            ) : (
              <select
                value={targetVlanId}
                onChange={(e) => setTargetVlanId(Number(e.target.value))}
                className={`w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none cursor-pointer ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.id}>VLAN {v.id} ({v.name})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Dual-Ended Sync Checkbox (if inter-switch link) */}
        {hasPeerLink && (
          <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-xs flex items-center justify-between text-blue-300 shrink-0">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>
                Порт связан с встречным коммутатором <strong>{currentPort.linkedSwitchId}</strong>.
              </span>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                checked={syncPeerPort}
                onChange={(e) => setSyncPeerPort(e.target.checked)}
                className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <span>Синхронизировать встречный порт (Dual-Ended Sync)</span>
            </label>
          </div>
        )}

        {/* Simulation Risk Banner */}
        <div className={`p-4 border-b flex items-center justify-between gap-4 shrink-0 ${
          simulationResult?.riskLevel === 'CRITICAL'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            : simulationResult?.riskLevel === 'WARNING'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}>
          <div className="flex items-start gap-3">
            {simulationResult?.riskLevel === 'CRITICAL' ? (
              <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
            ) : simulationResult?.riskLevel === 'WARNING' ? (
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                  simulationResult?.riskLevel === 'CRITICAL'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : simulationResult?.riskLevel === 'WARNING'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-emerald-500 text-white'
                }`}>
                  {simulationResult?.riskLevel || 'SIMULATING'}
                </span>
                <span className="text-xs font-semibold">
                  Индекс риска: {simulationResult?.riskScore || 0}%
                </span>
              </div>
              <p className="text-xs opacity-90">
                {simulationResult?.summary || (isSimulating ? 'Выполняется графовое моделирование...' : 'Готово к оценке')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSimulating && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
          </div>
        </div>

        {/* Metrics Bar */}
        <div className={`px-4 py-2 border-b grid grid-cols-4 gap-2 text-center text-xs shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Изолировано свитчей</div>
            <div className={`text-base font-bold font-mono ${
              (simulationResult?.isolatedSwitches?.length || 0) > 0 ? 'text-rose-500' : 'text-slate-400'
            }`}>
              {simulationResult?.isolatedSwitches?.length || 0}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Пострадавшие серверы</div>
            <div className={`text-base font-bold font-mono ${
              (simulationResult?.affectedServers?.length || 0) > 0 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {simulationResult?.affectedServers?.length || 0}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Затронуто IPAM хостов</div>
            <div className={`text-base font-bold font-mono ${
              (simulationResult?.affectedIpamHosts?.length || 0) > 0 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {simulationResult?.affectedIpamHosts?.length || 0}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] uppercase font-bold">Отключено портов</div>
            <div className={`text-base font-bold font-mono ${
              (simulationResult?.affectedPortsCount || 0) > 0 ? 'text-rose-400' : 'text-slate-400'
            }`}>
              {simulationResult?.affectedPortsCount || 0}
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className={`px-4 pt-2 border-b flex gap-4 text-xs font-semibold shrink-0 ${
          isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}>
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Обзор и Guardrails
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`pb-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'assets'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Серверы и IPAM ({(simulationResult?.affectedServers?.length || 0) + (simulationResult?.affectedIpamHosts?.length || 0)})
          </button>
          <button
            onClick={() => setActiveTab('cli')}
            className={`pb-2 border-b-2 cursor-pointer transition-colors ${
              activeTab === 'cli'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Сгенерированный CLI и откат
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-3">
              {/* Guardrail Violations */}
              {simulationResult?.guardrailViolations?.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5 text-xs">
                  <div className="font-bold flex items-center gap-1.5 text-rose-400">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Сработали ограничения безопасности (Guardrails):</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {simulationResult.guardrailViolations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transit Partitions */}
              {simulationResult?.transitPartitions?.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1 text-xs">
                  <div className="font-bold flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Обнаружены разрывы транзита (Blackhole):</span>
                  </div>
                  <p>
                    Следующие коммутаторы потеряют транзитный доступ к VLAN {simulationResult.transitPartitions[0]?.vlanId}:
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 font-mono text-[11px]">
                    {simulationResult.transitPartitions.map((p, i) => (
                      <li key={i}>
                        {p.switchName}: {p.disconnectedPorts.length} клиентских портов потеряют линк к шлюзу
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Broken Links */}
              {simulationResult?.brokenLinks?.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-400 uppercase text-[10px]">Разорванные межкоммутаторные связи:</h4>
                  <div className="space-y-1 font-mono text-[11px]">
                    {simulationResult.brokenLinks.map((l, i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <span className="text-rose-400">{l.fromSwitch} ({l.fromPort})</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-slate-400">{l.toSwitch} ({l.toPort})</span>
                        <span className="text-xs text-amber-400 font-bold">VLAN {l.vlanId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clean state banner if SAFE */}
              {simulationResult?.riskLevel === 'SAFE' && (
                <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="font-bold text-sm text-emerald-300">Изменение полностью безопасно</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Графовый анализ подтверждает отсутствие разрывов магистральных транков и потерь связи с шлюзом по умолчанию.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="space-y-4 text-xs">
              {/* Affected Servers */}
              <div>
                <h4 className="font-bold text-slate-400 uppercase text-[10px] mb-2">Затронутые серверы:</h4>
                {(simulationResult?.affectedServers?.length || 0) === 0 ? (
                  <p className="text-slate-500 italic">Серверы не затронуты.</p>
                ) : (
                  <div className="space-y-1 font-mono text-[11px]">
                    {simulationResult.affectedServers.map((s, i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <span className="text-white font-bold">{s.name} ({s.ip})</span>
                        <span className="text-slate-400">Порт {s.port}</span>
                        <span className="text-amber-400">VLAN {s.vlan}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Affected IPAM Hosts */}
              <div>
                <h4 className="font-bold text-slate-400 uppercase text-[10px] mb-2">Затронутые IPAM хосты:</h4>
                {(simulationResult?.affectedIpamHosts?.length || 0) === 0 ? (
                  <p className="text-slate-500 italic">Хосты IPAM не затронуты.</p>
                ) : (
                  <div className="space-y-1 font-mono text-[11px]">
                    {simulationResult.affectedIpamHosts.map((h, i) => (
                      <div key={i} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <span className="text-white">{h.hostname || h.ip}</span>
                        <span className="text-slate-400">{h.ip}</span>
                        <span className="text-amber-400">VLAN {h.vlan}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="space-y-4">
              {/* Target Switch Script */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold font-mono text-slate-300">
                    CLI для {currentSwitch?.name} ({simulationResult?.cliScript?.vendor || currentSwitch?.vendor})
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText((simulationResult?.cliScript?.commands || []).join('\n'));
                      setCopiedCli(true);
                      setTimeout(() => setCopiedCli(false), 2000);
                    }}
                    className="text-xs text-blue-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCli ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCli ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs overflow-x-auto select-text leading-relaxed">
                  {(simulationResult?.cliScript?.commands || []).join('\n') || '# Нет команд'}
                </pre>
              </div>

              {/* Rollback Script */}
              <div>
                <span className="text-xs font-bold font-mono text-amber-400 mb-1.5 block">
                  Скрипт безопасного отката (Rollback):
                </span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-amber-500/20 text-amber-200 font-mono text-xs overflow-x-auto select-text leading-relaxed">
                  {(simulationResult?.cliScript?.rollback || []).join('\n') || '# Нет команд отката'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToHardware}
              onChange={(e) => setApplyToHardware(e.target.checked)}
              className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span className="text-slate-300">Применить также по SSH на физическом коммутаторе</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 cursor-pointer transition-colors"
            >
              Закрыть
            </button>

            <button
              onClick={() => handleApply(simulationResult?.riskLevel === 'CRITICAL')}
              disabled={isApplying || isSimulating}
              className={`h-8 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                simulationResult?.riskLevel === 'CRITICAL'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
              }`}
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Применение...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {simulationResult?.riskLevel === 'CRITICAL' ? 'Применить (с подтверждением)' : 'Применить изменение'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
