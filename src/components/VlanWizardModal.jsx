import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  ArrowRight,
  Layers,
  Server,
  Network,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Terminal,
  Activity,
  Play,
  Download,
  Plus,
  RefreshCw,
  Sliders,
  ChevronRight,
  Info
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function VlanWizardModal({
  isOpen,
  onClose,
  switches = [],
  vlans = [],
  theme = 'dark',
  onReloadData,
  initialSourceSwitchId = '',
  initialDestinationSwitchId = '',
  initialVlanId = ''
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  // Mode: 'existing' | 'new'
  const [vlanMode, setVlanMode] = useState('existing');
  const [selectedVlanId, setSelectedVlanId] = useState('');
  const [newVlanId, setNewVlanId] = useState('');
  const [newVlanName, setNewVlanName] = useState('');
  const [newVlanDesc, setNewVlanDesc] = useState('');

  // Switch selection
  const [sourceSwitchId, setSourceSwitchId] = useState('');
  const [destinationSwitchId, setDestinationSwitchId] = useState('');
  const [destinationPortId, setDestinationPortId] = useState('');
  const [destinationMode, setDestinationMode] = useState('access'); // 'access' | 'trunk' | 'hybrid'
  const [portDescription, setPortDescription] = useState('');

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1); // 1: Config, 2: Preview & Apply
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);

  // Apply state
  const [isApplyingDb, setIsApplyingDb] = useState(false);
  const [isDbApplied, setIsDbApplied] = useState(false);
  const [isExecutingSsh, setIsExecutingSsh] = useState(false);
  const [sshExecutionResults, setSshExecutionResults] = useState(null);

  // Active script tab in step 2
  const [activeScriptTab, setActiveScriptTab] = useState('');
  const [copiedSwitchId, setCopiedSwitchId] = useState(null);

  // Set initial defaults when modal opens
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setAnalysisResult(null);
      setAnalysisError(null);
      setIsDbApplied(false);
      setSshExecutionResults(null);
      return;
    }

    // Default source switch: look for 'core' or 'mt' or first switch
    if (initialSourceSwitchId) {
      setSourceSwitchId(initialSourceSwitchId);
    } else {
      const coreSw = switches.find(s => s.name?.toLowerCase().includes('core') || s.id?.includes('mt') || s.vendor === 'MikroTik');
      setSourceSwitchId(coreSw ? coreSw.id : (switches[0]?.id || ''));
    }

    // Default destination switch
    if (initialDestinationSwitchId) {
      setDestinationSwitchId(initialDestinationSwitchId);
    } else {
      const distOrAccess = switches.find(s => s.id !== sourceSwitchId) || switches[1] || switches[0];
      setDestinationSwitchId(distOrAccess ? distOrAccess.id : '');
    }

    // Default VLAN
    if (initialVlanId) {
      setSelectedVlanId(String(initialVlanId));
      setVlanMode('existing');
    } else if (vlans.length > 0) {
      setSelectedVlanId(String(vlans[0].id));
    }
  }, [isOpen, switches, vlans]);

  // When destination switch changes, set default destination port
  const destSwitchObj = useMemo(() => {
    return switches.find(s => s.id === destinationSwitchId);
  }, [switches, destinationSwitchId]);

  useEffect(() => {
    if (destSwitchObj && destSwitchObj.ports && destSwitchObj.ports.length > 0) {
      // Pick first free or access port
      const freePort = destSwitchObj.ports.find(p => !p.linkedSwitchId) || destSwitchObj.ports[0];
      setDestinationPortId(freePort ? freePort.id : '');
    } else {
      setDestinationPortId('');
    }
  }, [destSwitchObj]);

  const targetVlanId = vlanMode === 'existing' ? parseInt(selectedVlanId, 10) : parseInt(newVlanId, 10);
  const targetVlanName = vlanMode === 'existing' 
    ? (vlans.find(v => v.id === targetVlanId)?.name || `VLAN_${targetVlanId}`)
    : (newVlanName || `VLAN_${targetVlanId}`);

  // Handle Calculate & Analyze Path
  const handleAnalyzePath = async () => {
    if (!targetVlanId || isNaN(targetVlanId)) {
      toast.error('Пожалуйста, укажите корректный VLAN ID');
      return;
    }
    if (!sourceSwitchId || !destinationSwitchId) {
      toast.error('Выберите исходный и целевой коммутаторы');
      return;
    }
    if (!destinationPortId) {
      toast.error('Выберите порт на целевом коммутаторе');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await api.analyzeVlanProvisioning({
        vlanId: targetVlanId,
        vlanName: targetVlanName,
        sourceSwitchId,
        destinationSwitchId,
        destinationPortIds: [destinationPortId],
        destinationMode,
        portDescription
      });

      if (!res.success) {
        throw new Error(res.error || 'Ошибка расчета цепочки');
      }

      setAnalysisResult(res);
      // Set active script tab to first switch in path
      if (res.analyzedHops && res.analyzedHops.length > 0) {
        setActiveScriptTab(res.analyzedHops[0].switchId);
      }
      setCurrentStep(2);
    } catch (err) {
      setAnalysisError(err.message);
      toast.error(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle 1-Click Database Apply
  const handleApplyToDatabase = async () => {
    if (!analysisResult) return;
    setIsApplyingDb(true);

    try {
      const res = await api.applyVlanProvisioning({
        vlanId: targetVlanId,
        vlanName: targetVlanName,
        vlanDescription: newVlanDesc || `Сквозной проброс VLAN ${targetVlanId}`,
        sourceSwitchId,
        destinationSwitchId,
        destinationPortIds: [destinationPortId],
        destinationMode,
        portDescription
      });

      if (res.success) {
        setIsDbApplied(true);
        toast.success(`VLAN ${targetVlanId} успешно проброшен по цепочке в SwitchBook!`);
        if (onReloadData) {
          await onReloadData();
        }
      }
    } catch (err) {
      toast.error(`Ошибка применения: ${err.message}`);
    } finally {
      setIsApplyingDb(false);
    }
  };

  // Handle SSH Execution
  const handleExecuteSsh = async () => {
    if (!analysisResult || !analysisResult.vendorScripts) return;
    setIsExecutingSsh(true);
    setSshExecutionResults(null);

    try {
      const res = await api.executeVlanProvisioningSsh({
        vendorScripts: analysisResult.vendorScripts
      });
      setSshExecutionResults(res);
      if (res.success) {
        toast.success(`Скрипты успешно применены на ${res.successfulCount} из ${res.totalSwitches} коммутаторах`);
      } else {
        toast.error('Применение по SSH завершилось с ошибками');
      }
    } catch (err) {
      toast.error(`Ошибка выполнения по SSH: ${err.message}`);
    } finally {
      setIsExecutingSsh(false);
    }
  };

  // Copy Script to Clipboard
  const handleCopyScript = (switchId, scriptText) => {
    navigator.clipboard.writeText(scriptText);
    setCopiedSwitchId(switchId);
    toast.success('CLI-скрипт скопирован в буфер обмена');
    setTimeout(() => setCopiedSwitchId(null), 2500);
  };

  // Download all scripts as a file
  const handleDownloadScripts = () => {
    if (!analysisResult?.vendorScripts) return;
    const combined = Object.entries(analysisResult.vendorScripts)
      .map(([sId, script]) => {
        const sw = switches.find(s => s.id === sId);
        return `### Switch: ${sw?.name || sId} (${sw?.vendor || 'Vendor'}) [${sw?.ip || 'No IP'}] ###\n${script}\n\n`;
      })
      .join('\n');

    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vlan-${targetVlanId}-provisioning.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Файл со скриптами скачан');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-500 border border-blue-500/20">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Мастер сквозного проброса VLAN (End-to-End Wizard)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Авто-маршрутизация тегов по цепочке транков между ядром, распределением и доступом
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Tabs */}
        <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs font-semibold">
          <button
            onClick={() => setCurrentStep(1)}
            className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
              currentStep === 1
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-blue-500/10 border border-blue-500/30">
              1
            </span>
            <span>Параметры VLAN и портов</span>
          </button>

          <ChevronRight className="w-4 h-4 text-slate-600 mb-2 shrink-0" />

          <button
            onClick={() => analysisResult && setCurrentStep(2)}
            disabled={!analysisResult}
            className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer border-b-2 disabled:opacity-40 disabled:cursor-not-allowed ${
              currentStep === 2
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-blue-500/10 border border-blue-500/30">
              2
            </span>
            <span>Цепочка проброса и CLI скрипты</span>
            {analysisResult && (
              <span className="ml-1 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
                {analysisResult.hopsCount} хопа
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* STEP 1: CONFIGURATION */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* VLAN Selection Section */}
              <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Выбор VLAN</span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800/80 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setVlanMode('existing')}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        vlanMode === 'existing' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Существующий
                    </button>
                    <button
                      type="button"
                      onClick={() => setVlanMode('new')}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        vlanMode === 'new' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      + Создать новый
                    </button>
                  </div>
                </div>

                {vlanMode === 'existing' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Выберите VLAN из базы:</label>
                      <select
                        value={selectedVlanId}
                        onChange={e => setSelectedVlanId(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                          isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      >
                        {vlans.map(v => (
                          <option key={v.id} value={v.id}>
                            VLAN {v.id}: {v.name} {v.subnet ? `(${v.subnet})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Назначение / Описание:</label>
                      <input
                        type="text"
                        disabled
                        value={vlans.find(v => v.id === parseInt(selectedVlanId, 10))?.description || 'Стандартный VLAN сети'}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-mono opacity-70 ${
                          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/40 border-slate-800'
                        }`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">VLAN ID (1-4094):</label>
                      <input
                        type="number"
                        min="1"
                        max="4094"
                        placeholder="Например: 150"
                        value={newVlanId}
                        onChange={e => setNewVlanId(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden ${
                          isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Имя VLAN:</label>
                      <input
                        type="text"
                        placeholder="Например: CCTV_SURVEILLANCE"
                        value={newVlanName}
                        onChange={e => setNewVlanName(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden ${
                          isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 font-medium">Описание сети:</label>
                      <input
                        type="text"
                        placeholder="Видеонаблюдение / Гостевая"
                        value={newVlanDesc}
                        onChange={e => setNewVlanDesc(e.target.value)}
                        className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden ${
                          isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Path Endpoints Selection */}
              <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Network className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Точки маршрута в топологии</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Source Switch (Root) */}
                  <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-white border-blue-200' : 'bg-blue-950/20 border-blue-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-blue-500">
                      <Server className="w-4 h-4" />
                      <span>Исходный коммутатор (Ядро / Root)</span>
                    </div>
                    <select
                      value={sourceSwitchId}
                      onChange={e => setSourceSwitchId(e.target.value)}
                      className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      {switches.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.vendor} {s.model || ''}) — {s.ip || 'No IP'}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Коммутатор, где VLAN берет начало (L3-шлюз, ядро сети)
                    </p>
                  </div>

                  {/* Destination Switch */}
                  <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-white border-indigo-200' : 'bg-indigo-950/20 border-indigo-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-indigo-400">
                      <Server className="w-4 h-4" />
                      <span>Конечный коммутатор (Доступ / Client)</span>
                    </div>
                    <select
                      value={destinationSwitchId}
                      onChange={e => setDestinationSwitchId(e.target.value)}
                      className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      {switches.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.vendor} {s.model || ''}) — {s.ip || 'No IP'}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Коммутатор, к которому физически подключен абонент/устройство
                    </p>
                  </div>
                </div>
              </div>

              {/* Destination Port Configuration */}
              <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">3. Настройка клиентского порта на конечном коммутаторе</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">Порт подключения:</label>
                    <select
                      value={destinationPortId}
                      onChange={e => setDestinationPortId(e.target.value)}
                      className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      {(destSwitchObj?.ports || []).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || `Порт ${p.number}`} {p.connectedTo ? `(${p.connectedTo})` : '[Свободен]'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">Режим порта:</label>
                    <select
                      value={destinationMode}
                      onChange={e => setDestinationMode(e.target.value)}
                      className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    >
                      <option value="access">Access (Нетегированный, PVID={targetVlanId || '...'})</option>
                      <option value="trunk">Trunk (Тегированный, для AP / Hypervisor)</option>
                      <option value="hybrid">Hybrid (Голосовой телефон + ПК)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1 font-medium">Описание / Метка розетки:</label>
                    <input
                      type="text"
                      placeholder="Например: Камера Вход 1 эт"
                      value={portDescription}
                      onChange={e => setPortDescription(e.target.value)}
                      className={`w-full h-10 px-3 rounded-xl border text-xs font-mono outline-hidden ${
                        isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {analysisError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHAIN VISUALIZATION & CLI SCRIPTS */}
          {currentStep === 2 && analysisResult && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Summary Banner */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isLight ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-950/20 border-blue-500/30'
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      Маршрут проброса VLAN {analysisResult.vlanId} ({analysisResult.vlanName})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400">
                      {analysisResult.hopsCount} {analysisResult.hopsCount === 1 ? 'коммутатор' : 'коммутатора в цепи'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {analysisResult.totalChangesNeeded > 0
                      ? `Требуется внести изменения на ${analysisResult.totalChangesNeeded} интерфейсах`
                      : 'Все порты вдоль маршрута уже содержат необходимые теги!'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadScripts}
                    className="h-8 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать CLI</span>
                  </button>
                </div>
              </div>

              {/* Hop-by-Hop Visual Chain */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Визуализация цепочки и статус портов:
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {analysisResult.analyzedHops.map((hop, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === analysisResult.analyzedHops.length - 1;

                    return (
                      <div
                        key={hop.switchId}
                        className={`p-4 rounded-xl border transition-all ${
                          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/80 border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          {/* Left: Switch Identity */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                                  {hop.switchName}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                  {hop.vendor}
                                </span>
                                {hop.ip && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {hop.ip}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {isFirst ? 'Роль: Исходный коммутатор (Ядро сети)' : isLast ? 'Роль: Конечный коммутатор (Доступ)' : 'Роль: Транзитный узел распределения'}
                              </div>
                            </div>
                          </div>

                          {/* Right: Ports Actions */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Inbound Port */}
                            {hop.portsToTag.filter(p => p.role === 'inbound_uplink').map(p => (
                              <span key={p.portId} className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                <span>Вход: {p.portName} (+Trunk {analysisResult.vlanId})</span>
                              </span>
                            ))}

                            {/* Outbound Port */}
                            {hop.portsToTag.filter(p => p.role === 'outbound_downlink').map(p => (
                              <span key={p.portId} className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-medium flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                <span>Выход: {p.portName} (+Trunk {analysisResult.vlanId})</span>
                              </span>
                            ))}

                            {/* Destination Port */}
                            {hop.portsToUntag.map(p => (
                              <span key={p.portId} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Клиент: {p.portName} (PVID={analysisResult.vlanId})</span>
                              </span>
                            ))}

                            {/* Already configured ports */}
                            {hop.alreadyConfiguredPorts.map(p => (
                              <span key={p.portId} className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[11px] font-mono flex items-center gap-1">
                                <Check className="w-3 h-3 text-slate-400" />
                                <span>{p.portName} (Уже настроен)</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vendor CLI Preview Section */}
              <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Сгенерированные вендорные CLI скрипты:
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopyScript(activeScriptTab, analysisResult.vendorScripts[activeScriptTab])}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {copiedSwitchId === activeScriptTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSwitchId === activeScriptTab ? 'Скопировано!' : 'Копировать скрипт'}</span>
                  </button>
                </div>

                {/* Switch selector tabs */}
                <div className="flex items-center gap-1 border-b border-slate-800 pb-2 mb-3 overflow-x-auto">
                  {analysisResult.analyzedHops.map(hop => (
                    <button
                      key={hop.switchId}
                      onClick={() => setActiveScriptTab(hop.switchId)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer shrink-0 ${
                        activeScriptTab === hop.switchId
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {hop.switchName} ({hop.vendor})
                    </button>
                  ))}
                </div>

                {/* Script Code Block */}
                <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed max-h-56">
                  {analysisResult.vendorScripts[activeScriptTab] || '# Скрипт не требуется (настройки совпадают)'}
                </pre>
              </div>

              {/* SSH Execution Results Report */}
              {sshExecutionResults && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      <span>Отчёт выполнения по SSH:</span>
                    </span>
                    <span className={`text-xs font-mono font-bold ${
                      sshExecutionResults.success ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      Успешно: {sshExecutionResults.successfulCount} из {sshExecutionResults.totalSwitches}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {sshExecutionResults.results?.map(r => (
                      <div key={r.switchId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{r.switchName || r.switchId} ({r.ip || 'No IP'})</span>
                          {r.success ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Выполнено
                            </span>
                          ) : (
                            <span className="text-rose-400 flex items-center gap-1 font-semibold">
                              <AlertCircle className="w-3.5 h-3.5" /> Ошибка: {r.error}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div>
            {currentStep === 2 && (
              <button
                onClick={() => setCurrentStep(1)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                ← Изменить параметры
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
            >
              Закрыть
            </button>

            {currentStep === 1 ? (
              <button
                onClick={handleAnalyzePath}
                disabled={isAnalyzing}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                {isAnalyzing ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                <span>Рассчитать цепочку проброса</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleExecuteSsh}
                  disabled={isExecutingSsh}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                  title="Отправить скрипты по SSH на коммутаторы, у которых настроен IP-адрес"
                >
                  {isExecutingSsh ? <Activity className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
                  <span>Применить по SSH</span>
                </button>

                <button
                  onClick={handleApplyToDatabase}
                  disabled={isApplyingDb || isDbApplied}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer transition-all ${
                    isDbApplied
                      ? 'bg-emerald-600 shadow-emerald-600/20 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 shadow-blue-600/20'
                  }`}
                >
                  {isApplyingDb ? (
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                  ) : isDbApplied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>{isDbApplied ? 'Применено в SwitchBook' : 'Применить в SwitchBook (1 клик)'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
