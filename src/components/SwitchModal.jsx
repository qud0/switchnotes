import React, { useState, useEffect } from 'react';
import { X, Server, Check, Tag, LayoutGrid, Palette, Sliders, Layers, Activity, ShieldCheck, Sparkles } from 'lucide-react';
import { SWITCH_TEMPLATES } from '../data/switchTemplates';
import { SwitchTemplatesModal } from './SwitchTemplatesModal';

const VENDOR_OPTIONS = [
  'MikroTik',
  'SNR',
  'Ubiquiti',
  'Eltex',
  'Cisco',
  'D-Link',
  'Huawei',
  'Zyxel',
  'Кастомный'
];

const VENDOR_MODELS = {
  'MikroTik': [
    { name: 'CRS326-24G-2S+RM (24G + 2SFP+)', copper: 24, sfp: 2, model: 'CRS326-24G-2S+RM' },
    { name: 'CRS328-24P-4S+RM (24PoE + 4SFP+)', copper: 24, sfp: 4, model: 'CRS328-24P-4S+RM' },
    { name: 'CRS354-48G-4S+2Q+RM (48G + 4SFP+)', copper: 48, sfp: 4, model: 'CRS354-48G-4S+2Q+RM' },
    { name: 'CRS310-8G+2S+IN (8x 2.5G + 2SFP+)', copper: 8, sfp: 2, model: 'CRS310-8G+2S+IN' }
  ],
  'SNR': [
    { name: 'SNR-S2989G-8TX-POE (8PoE + 2SFP+)', copper: 8, sfp: 2, model: 'SNR-S2989G-8TX-POE', poe: true, poeBudget: 150 },
    { name: 'SNR-S2985G-24T (24G + 4SFP)', copper: 24, sfp: 4, model: 'SNR-S2985G-24T' },
    { name: 'SNR-S2985G-48T (48G + 4SFP)', copper: 48, sfp: 4, model: 'SNR-S2985G-48T' },
    { name: 'SNR-S2995G-24TX (24G + 4SFP+)', copper: 24, sfp: 4, model: 'SNR-S2995G-24TX' },
    { name: 'SNR-S2965-8T (8G + 2SFP)', copper: 8, sfp: 2, model: 'SNR-S2965-8T' }
  ],
  'Ubiquiti': [
    { name: 'UniFi Switch Pro 24 PoE (24G + 2SFP+)', copper: 24, sfp: 2, model: 'UniFi Switch Pro 24 PoE' },
    { name: 'UniFi USW-Enterprise-48-PoE (48G + 4SFP+)', copper: 48, sfp: 4, model: 'UniFi USW-Enterprise-48-PoE' },
    { name: 'EdgeSwitch 24 Lite (24G + 2SFP)', copper: 24, sfp: 2, model: 'EdgeSwitch 24 Lite' },
    { name: 'EdgeSwitch 48 500W (48G + 2SFP + 2SFP+)', copper: 48, sfp: 4, model: 'EdgeSwitch 48 500W' }
  ],
  'Cisco': [
    { name: 'Catalyst 2960-X 24TS-L (24G + 4SFP)', copper: 24, sfp: 4, model: 'Catalyst 2960-X 24TS-L' },
    { name: 'Catalyst 9200L-48P-4G (48PoE + 4SFP)', copper: 48, sfp: 4, model: 'Catalyst 9200L-48P-4G' },
    { name: 'Catalyst 1000-8T-2G-L (8G + 2SFP)', copper: 8, sfp: 2, model: 'Catalyst 1000-8T-2G-L' }
  ],
  'Eltex': [
    { name: 'MES2324 (24G + 4SFP+ combo)', copper: 24, sfp: 4, model: 'MES2324' },
    { name: 'MES2348P (48PoE + 4SFP+)', copper: 48, sfp: 4, model: 'MES2348P' }
  ],
  'Кастомный / Свой': [
    { name: 'Кастомный 24 RJ45 + 4 SFP', copper: 24, sfp: 4, model: 'Custom-L2-24G' },
    { name: 'Кастомный 48 RJ45 + 4 SFP+', copper: 48, sfp: 4, model: 'Custom-L2-48G' },
    { name: 'Компактный 8 RJ45 + 2 SFP', copper: 8, sfp: 2, model: 'Custom-L2-8G' },
    { name: '16 RJ45 + 2 SFP', copper: 16, sfp: 2, model: 'Custom-L2-16G' }
  ]
};

const COLOR_PRESETS = [
  { label: 'Синий', value: '#3b82f6' },
  { label: 'Индиго', value: '#6366f1' },
  { label: 'Фиолетовый', value: '#8b5cf6' },
  { label: 'Изумруд', value: '#10b981' },
  { label: 'Янтарь', value: '#f59e0b' },
  { label: 'Розовый', value: '#f43f5e' },
  { label: 'Графит', value: '#64748b' }
];

const LAYOUT_OPTIONS = [
  { id: '2-rows', label: '2 ряда (шахматка)', desc: 'Классика 19": нечетные сверху, четные снизу' },
  { id: '1-row', label: '1 ряд (горизонтально)', desc: 'Все порты в одну горизонтальную линию' },
  { id: 'blocks-4', label: 'Блоки по 4 порта', desc: 'Группировка портов секциями 2x2' },
  { id: 'blocks-8', label: 'Блоки по 8 портов', desc: 'Группировка секциями 2x4' }
];

export function SwitchModal({ isOpen, onClose, switchData, onSave, theme = 'dark' }) {
  if (!isOpen) return null;

  const isEditing = Boolean(switchData?.id);
  const isLight = theme === 'light';

  const [formData, setFormData] = useState({
    name: '',
    vendor: 'MikroTik',
    model: 'CRS326-24G-2S+RM',
    badge: '',
    color: '#3b82f6',
    portLayout: '2-rows',
    portsPerGroup: 8,
    sfpPosition: 'right',
    ip: '',
    mac: '',
    location: '',
    notes: '',
    copperPorts: 24,
    sfpPorts: 2,
    poe: false,
    poeBudget: 0,
    snmpEnabled: true,
    snmpCommunity: 'public',
    snmpPort: 161,
    snmpVersion: '2c',
    snmpV3User: 'admin',
    snmpV3SecurityLevel: 'authPriv',
    snmpV3AuthProtocol: 'sha',
    snmpV3AuthKey: '',
    snmpV3PrivProtocol: 'aes',
    snmpV3PrivKey: ''
  });

  const [loading, setLoading] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  useEffect(() => {
    if (switchData) {
      setFormData({
        name: switchData.name || '',
        vendor: switchData.vendor || 'MikroTik',
        model: switchData.model || '',
        badge: switchData.badge || '',
        color: switchData.color || '#3b82f6',
        portLayout: switchData.portLayout || '2-rows',
        portsPerGroup: switchData.portsPerGroup || 8,
        sfpPosition: switchData.sfpPosition || 'right',
        ip: switchData.ip || '',
        mac: switchData.mac || '',
        location: switchData.location || '',
        notes: switchData.notes || '',
        copperPorts: switchData.copperPorts || 24,
        sfpPorts: switchData.sfpPorts || 2,
        poe: switchData.poe !== undefined ? Boolean(switchData.poe) : false,
        poeBudget: switchData.poeBudget || 0,
        snmpEnabled: switchData.snmpEnabled !== undefined ? Boolean(switchData.snmpEnabled) : true,
        snmpMode: switchData.snmpMode || 'auto',
        snmpCommunity: switchData.snmpCommunity || 'public',
        snmpPort: switchData.snmpPort || 161,
        snmpVersion: switchData.snmpVersion || '2c',
        snmpV3User: switchData.snmpV3User || 'admin',
        snmpV3SecurityLevel: switchData.snmpV3SecurityLevel || 'authPriv',
        snmpV3AuthProtocol: switchData.snmpV3AuthProtocol || 'sha',
        snmpV3AuthKey: switchData.snmpV3AuthKey || '',
        snmpV3PrivProtocol: switchData.snmpV3PrivProtocol || 'aes',
        snmpV3PrivKey: switchData.snmpV3PrivKey || ''
      });
    } else {
      setFormData({
        name: 'sw-mikrotik-01',
        vendor: 'MikroTik',
        model: 'CRS326-24G-2S+RM',
        badge: 'CORE',
        color: '#334155',
        portLayout: '2-rows',
        portsPerGroup: 8,
        sfpPosition: 'right',
        ip: '192.168.88.1',
        mac: '',
        location: 'Серверная 1, Стойка 1',
        notes: '',
        copperPorts: 24,
        sfpPorts: 2,
        poe: false,
        poeBudget: 0,
        snmpEnabled: true,
        snmpMode: 'auto',
        snmpCommunity: 'public',
        snmpPort: 161,
        snmpVersion: '2c',
        snmpV3User: 'admin',
        snmpV3SecurityLevel: 'authPriv',
        snmpV3AuthProtocol: 'sha',
        snmpV3AuthKey: '',
        snmpV3PrivProtocol: 'aes',
        snmpV3PrivKey: ''
      });
    }
  }, [switchData]);

  const handleModelPresetSelect = (preset) => {
    setFormData(prev => ({
      ...prev,
      vendor: preset.vendor || prev.vendor,
      model: preset.model || prev.model,
      copperPorts: preset.copperPorts !== undefined ? preset.copperPorts : (preset.copper !== undefined ? preset.copper : 24),
      sfpPorts: preset.sfpPorts !== undefined ? preset.sfpPorts : (preset.sfp !== undefined ? preset.sfp : 0),
      poe: preset.poe !== undefined ? preset.poe : prev.poe,
      poeBudget: preset.poeBudget !== undefined ? preset.poeBudget : prev.poeBudget,
      badge: preset.badge || prev.badge,
      color: preset.color || prev.color,
      portLayout: preset.portLayout || prev.portLayout,
      portsPerGroup: preset.portsPerGroup || prev.portsPerGroup,
      sfpPosition: preset.sfpPosition || prev.sfpPosition,
      ip: (!prev.ip || prev.ip === '192.168.10.1' || prev.ip === '192.168.88.1' || prev.ip === '192.168.1.1' || prev.ip === '192.168.1.254' || prev.ip === '192.168.1.239' || prev.ip === '10.90.90.90' || prev.ip === '192.168.1.253' || prev.ip === '192.168.1.20') && preset.defaultIp ? preset.defaultIp : prev.ip,
      notes: preset.description ? (prev.notes ? `${prev.notes}\n${preset.description}` : preset.description) : prev.notes
    }));
  };

  const handleVendorSelect = (v) => {
    const tmpls = SWITCH_TEMPLATES.filter(t => t.vendor.toLowerCase() === v.toLowerCase());
    if (tmpls.length > 0) {
      handleModelPresetSelect(tmpls[0]);
    } else {
      const defaultModel = VENDOR_MODELS[v]?.[0];
      setFormData(prev => ({
        ...prev,
        vendor: v,
        model: defaultModel ? defaultModel.model : prev.model,
        copperPorts: defaultModel ? defaultModel.copper : prev.copperPorts,
        sfpPorts: defaultModel ? defaultModel.sfp : prev.sfpPorts,
        poe: defaultModel?.poe !== undefined ? defaultModel.poe : false,
        poeBudget: defaultModel?.poeBudget || 0
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({
        ...formData,
        copperPorts: parseInt(formData.copperPorts) || 0,
        sfpPorts: parseInt(formData.sfpPorts) || 0,
        portsPerGroup: parseInt(formData.portsPerGroup) || 8,
        snmpPort: parseInt(formData.snmpPort) || 161,
        snmpEnabled: Boolean(formData.snmpEnabled),
        poe: Boolean(formData.poe),
        poeBudget: Number(formData.poeBudget) || 0
      });
      onClose();
    } catch (err) {
      console.error('Failed to save switch:', err);
      // Keep modal open so the user can inspect or retry
    } finally {
      setLoading(false);
    }
  };

  const currentVendorModels = SWITCH_TEMPLATES.filter(t => t.vendor.toLowerCase() === formData.vendor.toLowerCase()).length > 0
    ? SWITCH_TEMPLATES.filter(t => t.vendor.toLowerCase() === formData.vendor.toLowerCase())
    : (VENDOR_MODELS[formData.vendor] || []);

  const handleSafeClose = () => {
    const isDirty = formData.name !== (switchData?.name || '') || formData.ip !== (switchData?.ip || '');
    if (isDirty) {
      if (!window.confirm('В форме есть несохраненные данные. Закрыть окно без сохранения?')) return;
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleSafeClose();
        }
      }}
    >
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEditing ? 'Параметры и кастомизация коммутатора' : 'Добавить кастомный коммутатор'}
                </h2>
                {formData.badge && (
                  <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-white shadow-xs"
                    style={{ backgroundColor: formData.color || '#3b82f6' }}
                  >
                    {formData.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Настройка шильдика, цветового акцента, сетки портов и параметров шасси
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Vendor Quick Buttons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Производитель / Бренд
              </label>
              <button
                type="button"
                onClick={() => setIsCatalogOpen(true)}
                className="h-7 px-2.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Открыть полный интерактивный каталог оборудования с поиском и фильтрами"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Все шаблоны ({SWITCH_TEMPLATES.length})</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {VENDOR_OPTIONS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleVendorSelect(v)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    formData.vendor === v
                      ? 'bg-blue-600 text-white shadow-xs'
                      : (isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Model Presets for this vendor */}
          {!isEditing && currentVendorModels.length > 0 && (
            <div className={`p-3 rounded-xl border space-y-2 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
            }`}>
              <span className="text-[11px] font-semibold text-slate-500 block">
                Готовые профили {formData.vendor}:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentVendorModels.map(m => (
                  <button
                    key={m.id || m.model}
                    type="button"
                    onClick={() => handleModelPresetSelect(m)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      formData.model === m.model
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-white font-medium ring-1 ring-blue-500/40'
                        : (isLight ? 'border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:border-slate-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700')
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px] truncate">
                        {m.model}
                      </span>
                      {m.badge && (
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-xs bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">
                      {m.description || `${m.copperPorts !== undefined ? m.copperPorts : (m.copper || 0)} RJ45 + ${m.sfpPorts !== undefined ? m.sfpPorts : (m.sfp || 0)} SFP`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Identity & Custom Badge (Шильдик и Цветовой акцент) */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Tag className="w-3.5 h-3.5 text-blue-500" />
              <span>Пользовательский шильдик и цветовое кодирование</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Текст шильдика (Бейдж на панели)
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={formData.badge}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="Например: CORE-01, СВЯЗЬ, ACCESS-L2"
                  className={`w-full h-9 border rounded-xl px-3 text-xs font-mono font-bold outline-none focus:border-blue-500 ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Цвет шильдика и акцента
                </label>
                <div className="flex items-center gap-1.5 h-9">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer border ${
                        formData.color === c.value ? 'scale-125 ring-2 ring-blue-500 ring-offset-2' : 'hover:scale-110 border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer ml-1 p-0 bg-transparent"
                    title="Выбрать свой цвет"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Port Layout Options (Расположение портов на лицевой панели) */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />
              <span>Расположение и группировка портов на панели</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {LAYOUT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, portLayout: opt.id })}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    formData.portLayout === opt.id
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                      : isLight ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-900 dark:text-white flex items-center justify-between">
                    <span>{opt.label}</span>
                    {formData.portLayout === opt.id && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Портов в одной секции / группе
                </label>
                <select
                  value={formData.portsPerGroup}
                  onChange={(e) => setFormData({ ...formData, portsPerGroup: parseInt(e.target.value) || 8 })}
                  className={`w-full h-9 border rounded-xl px-3 text-xs outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                >
                  <option value={4}>По 4 порта (секциями 2x2)</option>
                  <option value={8}>По 8 портов (секциями 2x4 — стандарт)</option>
                  <option value={12}>По 12 портов (секциями 2x6)</option>
                  <option value={24}>Сплошной блок 24 порта</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Размещение SFP / Uplink портов
                </label>
                <select
                  value={formData.sfpPosition}
                  onChange={(e) => setFormData({ ...formData, sfpPosition: e.target.value })}
                  className={`w-full h-9 border rounded-xl px-3 text-xs outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                >
                  <option value="right">Справа от медных портов (стандарт)</option>
                  <option value="separate">Отдельный изолированный блок справа</option>
                </select>
              </div>
            </div>
          </div>

          {/* Standard Fields: Hostname & Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Имя коммутатора (Hostname) *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="sw-core-01"
                className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-blue-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Модель
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="CRS326-24G-2S+RM"
                className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-blue-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>
          </div>

          {/* IP & MAC */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Управляющий IP-адрес
              </label>
              <input
                type="text"
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                placeholder="192.168.10.1"
                className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-blue-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                MAC-адрес
              </label>
              <input
                type="text"
                value={formData.mac}
                onChange={(e) => setFormData({ ...formData, mac: e.target.value })}
                placeholder="B8:69:F4:01:22:33"
                className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-blue-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>
          </div>

          {/* SNMP Monitoring Settings */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            isLight
              ? 'bg-slate-50/80 border-slate-200'
              : 'bg-slate-950/70 border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${formData.snmpEnabled ? 'text-emerald-500' : 'text-slate-400'}`} />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    SNMP-мониторинг портов
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Опрос IF-MIB (статус линков, трафик Rx/Tx, ошибки и индикация)
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.snmpEnabled}
                  onChange={(e) => setFormData({ ...formData, snmpEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {formData.snmpEnabled && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Версия SNMP
                    </label>
                    <select
                      value={formData.snmpVersion || '2c'}
                      onChange={(e) => setFormData({ ...formData, snmpVersion: e.target.value })}
                      className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-emerald-500 ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    >
                      <option value="2c">SNMP v2c (стандарт)</option>
                      <option value="3">SNMP v3 (USM / Auth & Priv)</option>
                      <option value="1">SNMP v1</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      UDP Порт
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={formData.snmpPort}
                      onChange={(e) => setFormData({ ...formData, snmpPort: e.target.value })}
                      placeholder="161"
                      className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-emerald-500 ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  {formData.snmpVersion !== '3' ? (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Community (строка)
                      </label>
                      <input
                        type="text"
                        value={formData.snmpCommunity}
                        onChange={(e) => setFormData({ ...formData, snmpCommunity: e.target.value })}
                        placeholder="public"
                        className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-emerald-500 ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Пользователь (Security Name)
                      </label>
                      <input
                        type="text"
                        value={formData.snmpV3User || ''}
                        onChange={(e) => setFormData({ ...formData, snmpV3User: e.target.value })}
                        placeholder="admin"
                        className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-emerald-500 ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* SNMP v3 Detailed Security Settings */}
                {formData.snmpVersion === '3' && (
                  <div className={`p-3 rounded-xl border space-y-2.5 ${isLight ? 'bg-slate-100/70 border-slate-300' : 'bg-slate-900/90 border-slate-700'}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Уровень безопасности (Security Level)
                        </label>
                        <select
                          value={formData.snmpV3SecurityLevel || 'authPriv'}
                          onChange={(e) => setFormData({ ...formData, snmpV3SecurityLevel: e.target.value })}
                          className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-emerald-500 ${
                            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        >
                          <option value="authPriv">authPriv (Аутентификация + Шифрование AES/DES)</option>
                          <option value="authNoPriv">authNoPriv (Только аутентификация SHA/MD5)</option>
                          <option value="noAuthNoPriv">noAuthNoPriv (Без аутентификации и шифрования)</option>
                        </select>
                      </div>

                      {(formData.snmpV3SecurityLevel === 'authPriv' || formData.snmpV3SecurityLevel === 'authNoPriv') && (
                        <>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Аутентификация (Протокол)
                            </label>
                            <select
                              value={formData.snmpV3AuthProtocol || 'sha'}
                              onChange={(e) => setFormData({ ...formData, snmpV3AuthProtocol: e.target.value })}
                              className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-emerald-500 ${
                                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                              }`}
                            >
                              <option value="sha">SHA (SHA-1)</option>
                              <option value="sha256">SHA-256</option>
                              <option value="md5">MD5</option>
                            </select>
                          </div>

                          <div className={formData.snmpV3SecurityLevel === 'authNoPriv' ? 'sm:col-span-2' : ''}>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Пароль аутентификации (Auth Key)
                            </label>
                            <input
                              type="password"
                              value={formData.snmpV3AuthKey || ''}
                              onChange={(e) => setFormData({ ...formData, snmpV3AuthKey: e.target.value })}
                              placeholder="Минимум 8 символов"
                              className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-emerald-500 ${
                                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                              }`}
                            />
                          </div>
                        </>
                      )}

                      {formData.snmpV3SecurityLevel === 'authPriv' && (
                        <>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Шифрование (Privacy Protocol)
                            </label>
                            <select
                              value={formData.snmpV3PrivProtocol || 'aes'}
                              onChange={(e) => setFormData({ ...formData, snmpV3PrivProtocol: e.target.value })}
                              className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-emerald-500 ${
                                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                              }`}
                            >
                              <option value="aes">AES (AES-128)</option>
                              <option value="des">DES</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Ключ шифрования (Priv Key)
                            </label>
                            <input
                              type="password"
                              value={formData.snmpV3PrivKey || ''}
                              onChange={(e) => setFormData({ ...formData, snmpV3PrivKey: e.target.value })}
                              placeholder="Минимум 8 символов"
                              className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-emerald-500 ${
                                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                              }`}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Режим сбора данных
                  </label>
                  <select
                    value={formData.snmpMode || 'auto'}
                    onChange={(e) => setFormData({ ...formData, snmpMode: e.target.value })}
                    className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-emerald-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  >
                    <option value="live">🔴 Реальное время (строгий сетевой опрос по IP/UDP 161)</option>
                    <option value="simulation">🟢 Симуляция (демо-трафик, нагрузка, индикация портов)</option>
                    <option value="auto">⚡ Авто-выбор (реальный опрос, при таймауте — демо)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {formData.snmpMode === 'live'
                      ? 'Опрос физического устройства по протоколу SNMP (IF-MIB). Если коммутатор недоступен — покажет ошибку связи.'
                      : formData.snmpMode === 'simulation'
                      ? 'Генерация реалистичного трафика и статусов для стендов, разработки и презентаций без физического коммутатора.'
                      : 'Пытается опросить физический коммутатор, а при отсутствии ответа переключается на демонстрационные счетчики.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Расположение (Стойка / Этаж / Шкаф / Юнит)
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Серверная 1, Стойка 1, Unit 24"
              className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-blue-500 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          {/* Port Count configuration */}
          {!isEditing && (
            <div className={`p-3.5 rounded-xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
            }`}>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Количество портов коммутатора
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Медные порты (RJ-45)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="96"
                    value={formData.copperPorts}
                    onChange={(e) => setFormData({ ...formData, copperPorts: e.target.value })}
                    className={`w-full h-9 border rounded-xl px-3 text-xs font-mono ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Оптические слоты (SFP / SFP+)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="16"
                    value={formData.sfpPorts}
                    onChange={(e) => setFormData({ ...formData, sfpPorts: e.target.value })}
                    className={`w-full h-9 border rounded-xl px-3 text-xs font-mono ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Заметки инженера (логин, прошивка, назначение)
            </label>
            <textarea
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="RouterOS v7.14, доступ по Winbox..."
              className={`w-full p-2.5 border rounded-xl text-xs outline-none focus:border-blue-500 resize-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          {/* Footer buttons (Uniform h-9 height) */}
          <div className={`pt-4 border-t flex items-center justify-end gap-2 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`h-9 px-4 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isEditing ? 'Сохранить изменения' : 'Создать коммутатор'}</span>
            </button>
          </div>
        </form>
      </div>

      <SwitchTemplatesModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        onSelectTemplate={handleModelPresetSelect}
        theme={theme}
      />
    </div>
  );
}
