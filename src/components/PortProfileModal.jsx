import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Camera,
  Monitor,
  Wifi,
  Server,
  Network,
  PowerOff,
  Check,
  Zap,
  Sliders,
  Terminal,
  Shield,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import { PORT_PROFILES, matchVlanForProfile } from '../data/portProfiles';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

const PROFILE_ICONS = {
  cctv: Camera,
  workplace: Monitor,
  wifi_ap: Wifi,
  server: Server,
  uplink: Network,
  shutdown: PowerOff
};

export function PortProfileModal({
  isOpen,
  onClose,
  switchData,
  selectedPorts = [],
  vlans = [],
  onSuccess,
  theme = 'dark'
}) {
  if (!isOpen || selectedPorts.length === 0 || !switchData) return null;

  const isLight = theme === 'light';
  const toast = useToast();

  const [selectedProfileId, setSelectedProfileId] = useState('cctv');
  const currentProfile = useMemo(() => {
    return PORT_PROFILES.find(p => p.id === selectedProfileId) || PORT_PROFILES[0];
  }, [selectedProfileId]);

  // Form overrides
  const [mode, setMode] = useState('access');
  const [pvid, setPvid] = useState(50);
  const [taggedVlans, setTaggedVlans] = useState([]);
  const [poe, setPoe] = useState(true);
  const [speed, setSpeed] = useState('1G');
  const [description, setDescription] = useState('IP-Камера CCTV');
  const [connectedTo, setConnectedTo] = useState('Камера');
  const [applyToHardware, setApplyToHardware] = useState(Boolean(switchData.ip));
  const [showCliPreview, setShowCliPreview] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // When profile selection changes, recalculate default parameters
  React.useEffect(() => {
    if (!currentProfile) return;
    const initialPvid = matchVlanForProfile(currentProfile, vlans);
    setMode(currentProfile.mode === 'disabled' ? 'disabled' : currentProfile.mode);
    setPvid(initialPvid);
    setTaggedVlans(currentProfile.fallbackTaggedVlans || (currentProfile.mode === 'trunk' ? [20, 30, 40] : []));
    setPoe(Boolean(currentProfile.poe));
    setSpeed(currentProfile.speed || '1G');
    setDescription(currentProfile.descriptionTemplate || '');
    setConnectedTo(currentProfile.connectedToTemplate || '');
  }, [selectedProfileId, currentProfile, vlans]);

  const sortedPortNumbers = useMemo(() => {
    return [...selectedPorts].map(p => p.number).sort((a, b) => a - b);
  }, [selectedPorts]);

  const portRangeSummary = useMemo(() => {
    if (sortedPortNumbers.length === 0) return '';
    if (sortedPortNumbers.length === 1) return `Порт ${sortedPortNumbers[0]}`;
    const min = sortedPortNumbers[0];
    const max = sortedPortNumbers[sortedPortNumbers.length - 1];
    if (sortedPortNumbers.length === max - min + 1) {
      return `Порты ${min} - ${max} (${sortedPortNumbers.length} шт.)`;
    }
    return `Порты: ${sortedPortNumbers.join(', ')} (${sortedPortNumbers.length} шт.)`;
  }, [sortedPortNumbers]);

  // Generate real CLI preview for SNR / MikroTik
  const cliPreview = useMemo(() => {
    const v = (switchData.vendor || 'SNR').toLowerCase();
    const ifList = sortedPortNumbers.map(n => `GigabitEthernet 1/0/${n}`).join(', ');

    if (v.includes('snr')) {
      let script = `! SNR-S2989G / S2985G CLI Batch Provisioning\n`;
      script += `configure terminal\n`;
      script += `interface range ${ifList}\n`;
      if (description) script += ` description ${description}\n`;
      if (mode === 'access') {
        script += ` switchport mode access\n switchport access vlan ${pvid}\n spanning-tree portfast\n`;
      } else if (mode === 'trunk') {
        script += ` switchport mode trunk\n switchport trunk native vlan ${pvid}\n`;
        if (taggedVlans.length > 0) script += ` switchport trunk allowed vlan ${taggedVlans.join(',')}\n`;
      }
      script += poe ? ` poe enable\n` : ` poe disable\n`;
      script += mode === 'disabled' ? ` shutdown\n` : ` no shutdown\n`;
      script += `exit\nwrite\n`;
      return script;
    }

    if (v.includes('mikrotik')) {
      let script = `# MikroTik RouterOS v7 Batch Provisioning\n`;
      const ifFind = sortedPortNumbers.map(n => `name=ether${n}`).join(' or ');
      script += `/interface set [find ${ifFind}] disabled=${mode === 'disabled' ? 'yes' : 'no'} comment="${description}"\n`;
      if (mode === 'access') {
        script += `/interface bridge port set [find ${ifFind}] pvid=${pvid}\n`;
      }
      return script;
    }

    return `# CLI конфигурация для ${switchData.vendor}\ninterface range ...\nvlan ${pvid}\n`;
  }, [switchData.vendor, sortedPortNumbers, mode, pvid, taggedVlans, poe, description]);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const portIds = selectedPorts.map(p => p.id);
      const profileData = {
        profileId: currentProfile.id,
        profileName: currentProfile.name,
        mode: mode === 'disabled' ? 'disabled' : mode,
        pvid: parseInt(pvid) || 1,
        taggedVlans: mode === 'trunk' ? taggedVlans : [],
        poe: Boolean(poe),
        speed: speed || '1G',
        enabled: mode !== 'disabled',
        description: description.trim(),
        connectedTo: connectedTo.trim()
      };

      const res = await api.batchControlPorts(switchData.id, {
        portIds,
        action: 'apply_profile',
        profileData,
        applyToHardware: Boolean(applyToHardware && switchData.ip)
      });

      toast.success(res.message || `Профиль «${currentProfile.name}» успешно применен к ${selectedPorts.length} портам!`);
      if (onSuccess) await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Ошибка применения профиля');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Пакетный профиль портов
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {portRangeSummary}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Применение типовой конфигурации VLAN, PoE, скорости и описания к выбранным портам коммутатора {switchData.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Step 1: Select Profile Cards */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-3">
              1. Выберите готовый профиль назначения
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PORT_PROFILES.map(prof => {
                const IconComponent = PROFILE_ICONS[prof.id] || Sparkles;
                const isSelected = prof.id === selectedProfileId;

                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setSelectedProfileId(prof.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 shadow-md'
                        : isLight
                          ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
                          : 'border-slate-800 bg-slate-950/40 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${prof.color}20`, color: prof.color }}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span
                          className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border"
                          style={{ borderColor: `${prof.color}40`, color: prof.color }}
                        >
                          {prof.badge}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white mb-1">{prof.name}</h4>
                      <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 mb-2">
                        {prof.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60 text-[10px]">
                      {prof.poe && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> PoE
                        </span>
                      )}
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                        {prof.mode.toUpperCase()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Customization of Parameters */}
          <div className={`p-4 rounded-xl border space-y-4 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <span>2. Параметры для выбранных портов ({selectedPorts.length} шт.)</span>
              </label>

              <button
                type="button"
                onClick={() => setShowCliPreview(!showCliPreview)}
                className="text-[11px] font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{showCliPreview ? 'Скрыть CLI команды' : 'Показать CLI команды'}</span>
              </button>
            </div>

            {/* CLI Preview block */}
            {showCliPreview && (
              <div className="p-3 rounded-lg bg-black/80 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre">
                {cliPreview}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Mode */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Режим порта:</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-medium outline-none"
                >
                  <option value="access">Access (Нетегированный)</option>
                  <option value="trunk">Trunk (Магистральный)</option>
                  <option value="disabled">Disabled (Отключен / Shutdown)</option>
                </select>
              </div>

              {/* VLAN Picker */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">
                  {mode === 'trunk' ? 'Native PVID:' : 'VLAN (PVID):'}
                </label>
                <select
                  value={pvid}
                  onChange={(e) => setPvid(parseInt(e.target.value))}
                  disabled={mode === 'disabled'}
                  className="w-full h-9 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono outline-none disabled:opacity-40"
                >
                  {vlans.map(v => (
                    <option key={v.id} value={v.id}>
                      VLAN {v.id} — {v.name}
                    </option>
                  ))}
                  {!vlans.some(v => v.id === pvid) && (
                    <option value={pvid}>VLAN {pvid} (Текущий)</option>
                  )}
                </select>
              </div>

              {/* PoE Power */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Питание PoE:</label>
                <div className="flex items-center h-9">
                  <button
                    type="button"
                    onClick={() => setPoe(!poe)}
                    disabled={mode === 'disabled'}
                    className={`w-full h-full px-3 rounded-lg border flex items-center justify-center gap-1.5 font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                      poe
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <Zap className={`w-3.5 h-3.5 ${poe ? 'fill-amber-400' : ''}`} />
                    <span>{poe ? 'PoE Включено' : 'PoE Выключено'}</span>
                  </button>
                </div>
              </div>

              {/* Port Speed */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">Скорость линка:</label>
                <select
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  disabled={mode === 'disabled'}
                  className="w-full h-9 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono outline-none disabled:opacity-40"
                >
                  <option value="1G">1 Gbps (1000Base-T)</option>
                  <option value="100M">100 Mbps (CCTV / Phone)</option>
                  <option value="2.5G">2.5 Gbps (Multi-Gig AP)</option>
                  <option value="10G">10 Gbps (SFP+ 10GBASE)</option>
                  <option value="Auto">Auto-Negotiate</option>
                </select>
              </div>
            </div>

            {/* Description & ConnectedTo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Описание (Description):</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Например: IP-Камера Склад-1"
                  className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Куда подключено (Connected To):</label>
                <input
                  type="text"
                  value={connectedTo}
                  onChange={(e) => setConnectedTo(e.target.value)}
                  placeholder="Например: Камера или Розетка 2.14"
                  className="w-full h-9 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Hardware deployment sync toggle */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={applyToHardware}
                  onChange={(e) => setApplyToHardware(e.target.checked)}
                  disabled={!switchData.ip}
                  className="accent-blue-600 rounded"
                />
                <span>
                  Отправить команды на физическое оборудование ({switchData.vendor} {switchData.ip || 'без IP'})
                </span>
              </label>

              <span className="text-[11px] text-slate-500">
                {switchData.ip ? 'SSH / SNMP активен' : 'Только в базу (свитч офлайн)'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="text-xs text-slate-400">
            Будут настроены порты: <span className="text-white font-mono font-bold">{sortedPortNumbers.join(', ')}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-50"
            >
              {isApplying ? (
                <span>Применение...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Применить профиль ({selectedPorts.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
