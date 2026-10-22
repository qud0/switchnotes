import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Server,
  Zap,
  Check,
  Tag,
  Filter,
  Cpu,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  Network
} from 'lucide-react';
import { SWITCH_TEMPLATES } from '../data/switchTemplates';

const BRAND_FILTERS = [
  { id: 'all', label: 'Все бренды' },
  { id: 'mikrotik', label: 'MikroTik' },
  { id: 'snr', label: 'SNR (НАГ)' },
  { id: 'ubiquiti', label: 'Ubiquiti (UniFi)' },
  { id: 'eltex', label: 'Eltex' },
  { id: 'cisco', label: 'Cisco' },
  { id: 'd-link', label: 'D-Link' },
  { id: 'huawei', label: 'Huawei' },
  { id: 'zyxel', label: 'Zyxel' }
];

const TYPE_FILTERS = [
  { id: 'all', label: 'Все конфигурации' },
  { id: 'poe', label: 'С поддержкой PoE' },
  { id: '10g', label: 'Магистрали 10G/40G' },
  { id: '24p', label: '24 порта' },
  { id: '48p', label: '48 портов' },
  { id: 'optic', label: 'Оптические (SFP)' }
];

export function SwitchTemplatesModal({
  isOpen,
  onClose,
  onSelectTemplate,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  const filteredTemplates = useMemo(() => {
    return SWITCH_TEMPLATES.filter((tmpl) => {
      // Brand filter
      if (selectedBrand !== 'all') {
        const b = tmpl.vendor.toLowerCase();
        if (selectedBrand === 'eltex' && !b.includes('eltex')) return false;
        if (selectedBrand === 'cisco' && !b.includes('cisco')) return false;
        if (selectedBrand === 'mikrotik' && !b.includes('mikrotik')) return false;
        if (selectedBrand === 'snr' && !b.includes('snr')) return false;
        if (selectedBrand === 'huawei' && !b.includes('huawei')) return false;
        if (selectedBrand === 'd-link' && !b.includes('d-link') && !b.includes('dlink')) return false;
        if (selectedBrand === 'zyxel' && !b.includes('zyxel')) return false;
        if (selectedBrand === 'ubiquiti' && !b.includes('ubiquiti') && !b.includes('unifi')) return false;
      }

      // Type filter
      if (selectedType === 'poe' && !tmpl.poe) return false;
      if (selectedType === '10g' && (!tmpl.badge.includes('10G') && !tmpl.badge.includes('40G') && !tmpl.badge.includes('25G'))) return false;
      if (selectedType === '24p' && tmpl.copperPorts !== 24 && tmpl.sfpPorts !== 24) return false;
      if (selectedType === '48p' && tmpl.copperPorts !== 48 && tmpl.sfpPorts !== 48) return false;
      if (selectedType === 'optic' && tmpl.copperPorts > 4) return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inModel = (tmpl.model || '').toLowerCase().includes(q);
      const inVendor = (tmpl.vendor || '').toLowerCase().includes(q);
      const inDesc = (tmpl.description || '').toLowerCase().includes(q);
      const inTags = (tmpl.tags || []).some(t => t.toLowerCase().includes(q));

      return inModel || inVendor || inDesc || inTags;
    });
  }, [selectedBrand, selectedType, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Каталог шаблонов сетевого оборудования
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-semibold">
                  {filteredTemplates.length} из {SWITCH_TEMPLATES.length} моделей
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Точные заводские профили оборудования (Eltex, Cisco, MikroTik, SNR, Huawei, D-Link, Zyxel, Ubiquiti) с реальной схемой портов
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

        {/* Toolbar: Search & Brand Filters */}
        <div className={`p-4 border-b space-y-3 shrink-0 ${
          isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по модели, серии, PoE, 10G SFP+, названию..."
                className={`w-full h-9 pl-9 pr-7 text-xs border rounded-xl outline-none transition-all placeholder-slate-400 focus:border-blue-500 ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-900'
                    : 'bg-slate-900 border-slate-800 text-white'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filter Select */}
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className={`h-9 px-3 rounded-xl border text-xs outline-none focus:border-blue-500 cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                }`}
              >
                {TYPE_FILTERS.map(tf => (
                  <option key={tf.id} value={tf.id}>{tf.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Brand Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {BRAND_FILTERS.map(bf => {
              const count = bf.id === 'all'
                ? SWITCH_TEMPLATES.length
                : SWITCH_TEMPLATES.filter(t => t.vendor.toLowerCase().includes(bf.id === 'd-link' ? 'd' : bf.id)).length;

              const isSelected = selectedBrand === bf.id;

              return (
                <button
                  key={bf.id}
                  onClick={() => setSelectedBrand(bf.id)}
                  className={`h-8 px-3 rounded-xl border font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : (isLight
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-white')
                  }`}
                >
                  <span>{bf.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Templates Grid Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {filteredTemplates.length === 0 ? (
            <div className={`p-12 text-center border border-dashed rounded-2xl ${
              isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-800 bg-slate-950/40'
            }`}>
              <Server className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Шаблоны не найдены
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Попробуйте изменить поисковый запрос или выбрать вкладку «Все бренды».
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map(tmpl => {
                return (
                  <div
                    key={tmpl.id}
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all hover:shadow-lg ${
                      isLight
                        ? 'bg-white border-slate-200 hover:border-blue-400 shadow-xs'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Card Top: Vendor & Badge */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tmpl.color || '#3b82f6' }}
                          />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            {tmpl.vendor}
                          </span>
                        </div>

                        {tmpl.badge && (
                          <span
                            className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-white shadow-xs"
                            style={{ backgroundColor: tmpl.color || '#3b82f6' }}
                          >
                            {tmpl.badge}
                          </span>
                        )}
                      </div>

                      {/* Model Title */}
                      <h3 className="font-bold text-base text-slate-900 dark:text-white font-mono leading-tight mb-2">
                        {tmpl.model}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                        {tmpl.description}
                      </p>

                      {/* Mini Switch Faceplate Visual Preview */}
                      <div className={`mb-3 p-1.5 rounded-xl border select-none transition-colors ${
                        isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border border-slate-700/80 rounded-lg shadow-inner">
                          {/* Left Chassis Ear & Status LED */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                              {tmpl.vendor}
                            </span>
                          </div>

                          {/* Port Matrix Preview */}
                          <div className="flex items-center gap-1.5 overflow-hidden mx-2">
                            {/* Copper RJ45 Blocks */}
                            {tmpl.copperPorts > 0 && (
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: Math.min(tmpl.copperPorts, 24) }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={`w-1.5 h-3 rounded-xs border border-slate-700 flex flex-col justify-end p-0.2 ${
                                      tmpl.poe ? 'bg-amber-500/10' : 'bg-blue-500/10'
                                    }`}
                                    title={`RJ-45 Порт ${i + 1}`}
                                  >
                                    <div className={`w-1 h-0.5 rounded-xs ${tmpl.poe ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                  </div>
                                ))}
                                {tmpl.copperPorts > 24 && (
                                  <span className="text-[8px] font-mono text-slate-500 font-bold ml-0.5">+24</span>
                                )}
                              </div>
                            )}

                            {/* SFP+ Cages */}
                            {tmpl.sfpPorts > 0 && (
                              <div className="flex items-center gap-0.5 pl-1 border-l border-slate-700">
                                {Array.from({ length: Math.min(tmpl.sfpPorts, 4) }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-2.5 h-3.5 rounded-xs border border-cyan-500/50 bg-cyan-950/40 flex items-center justify-center"
                                    title={`SFP/SFP+ ${i + 1}`}
                                  >
                                    <div className="w-1 h-1 bg-cyan-400 rounded-xs" />
                                  </div>
                                ))}
                                {tmpl.sfpPorts > 4 && (
                                  <span className="text-[8px] font-mono text-cyan-400 font-bold ml-0.5">+{tmpl.sfpPorts - 4}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Rack Ear */}
                          <div className="text-[8px] font-mono text-slate-500 shrink-0">
                            1U
                          </div>
                        </div>
                      </div>

                      {/* Hardware Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2.5 border-y border-slate-200 dark:border-slate-800 text-[11px] mb-3">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Медные порты</span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {tmpl.copperPorts}x RJ-45
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Uplink порты</span>
                          <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                            {tmpl.sfpPorts ? `${tmpl.sfpPorts}x SFP/SFP+` : '—'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Питание PoE</span>
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {tmpl.poe ? `${tmpl.poeBudget} Вт` : 'Без PoE'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Default IP</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {tmpl.defaultIp || '—'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Размер в стойке</span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {tmpl.unitHeight || 1}U (19")
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">Схема портов</span>
                          <span className="font-mono text-slate-500">
                            {tmpl.portLayout === '2-rows' ? '2 ряда (шахматка)' : tmpl.portLayout}
                          </span>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {(tmpl.tags || []).map(t => (
                          <span
                            key={t}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                              isLight
                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                : 'bg-slate-800/60 border-slate-750 text-slate-400'
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTemplate(tmpl);
                        onClose();
                      }}
                      className="w-full h-9 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                    >
                      <span>Выбрать этот шаблон</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
