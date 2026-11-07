import React, { useState, useMemo } from 'react';
import {
  X,
  Scissors,
  Layers,
  Plus,
  Check,
  Copy,
  Download,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Tag,
  ArrowRight,
  Info,
  RefreshCw,
  Sliders,
  FolderPlus
} from 'lucide-react';
import {
  parseSubnet,
  splitSubnet,
  canJoinSubnets,
  joinSubnets,
  calculateWildcardMask,
  ipToLong,
  longToIp
} from '../utils/ipamUtils';
import { api } from '../api';

const PRESET_NETWORKS = [
  { label: 'Корпоративная сеть класса A (10.100.0.0/16)', cidr: '10.100.0.0/16' },
  { label: 'Сегмент филиала /20 (172.16.0.0/20)', cidr: '172.16.0.0/20' },
  { label: 'Офисная площадка /22 (192.168.0.0/22)', cidr: '192.168.0.0/22' },
  { label: 'Классическая подсеть /24 (192.168.10.0/24)', cidr: '192.168.10.0/24' }
];

const BLOCK_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48'  // rose
];

export function VlsmSplitterModal({
  isOpen,
  onClose,
  existingVlans = [],
  onVlanCreated,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  const [baseCidrInput, setBaseCidrInput] = useState('192.168.0.0/22');
  const [activeBaseCidr, setActiveBaseCidr] = useState('192.168.0.0/22');

  // Blocks array of objects: { id, cidr, name, vlanId, color }
  const [blocks, setBlocks] = useState(() => {
    const parsed = parseSubnet('192.168.0.0/22');
    return [
      { id: 'blk-1', cidr: '192.168.0.0/23', name: 'Офисный сегмент (ПК и Wi-Fi)', vlanId: 20, color: '#3b82f6' },
      { id: 'blk-2', cidr: '192.168.2.0/24', name: 'Серверная ферма', vlanId: 100, color: '#10b981' },
      { id: 'blk-3', cidr: '192.168.3.0/25', name: 'Система видеонаблюдения (CCTV)', vlanId: 50, color: '#f43f5e' },
      { id: 'blk-4', cidr: '192.168.3.128/25', name: 'Резерв / Будущее расширение', vlanId: '', color: '#64748b' }
    ];
  });

  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [creatingVlanId, setCreatingVlanId] = useState(null);
  const [batchCreating, setBatchCreating] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const baseParsed = useMemo(() => parseSubnet(activeBaseCidr), [activeBaseCidr]);

  // Handle setting a new base network
  const handleApplyBaseCidr = (cidr) => {
    const parsed = parseSubnet(cidr);
    if (!parsed) {
      setErrorMsg('Некорректный формат CIDR. Пример: 192.168.0.0/22 или 10.100.0.0/16');
      return;
    }
    setErrorMsg(null);
    setActiveBaseCidr(parsed.cidr);
    setBaseCidrInput(parsed.cidr);
    // Initialize with 2 half-blocks
    const split = splitSubnet(parsed.cidr);
    if (split) {
      setBlocks([
        { id: `blk-${Date.now()}-1`, cidr: split[0], name: 'Подсеть A', vlanId: '', color: BLOCK_COLORS[0] },
        { id: `blk-${Date.now()}-2`, cidr: split[1], name: 'Подсеть B', vlanId: '', color: BLOCK_COLORS[1] }
      ]);
    } else {
      setBlocks([
        { id: `blk-${Date.now()}-1`, cidr: parsed.cidr, name: 'Основная подсеть', vlanId: '', color: BLOCK_COLORS[0] }
      ]);
    }
  };

  // Split specific block in half
  const handleSplitBlock = (blockId) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const children = splitSubnet(block.cidr);
    if (!children) return;

    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId);
      const newItems = [
        {
          id: `blk-${Date.now()}-1`,
          cidr: children[0],
          name: `${block.name || 'Подсеть'} (Часть 1)`,
          vlanId: block.vlanId || '',
          color: block.color || BLOCK_COLORS[idx % BLOCK_COLORS.length]
        },
        {
          id: `blk-${Date.now()}-2`,
          cidr: children[1],
          name: `${block.name || 'Подсеть'} (Часть 2)`,
          vlanId: '',
          color: BLOCK_COLORS[(idx + 1) % BLOCK_COLORS.length]
        }
      ];
      const copy = [...prev];
      copy.splice(idx, 1, ...newItems);
      return copy;
    });
  };

  // Merge block with adjacent sibling
  const handleJoinWithNext = (idx) => {
    if (idx < 0 || idx >= blocks.length - 1) return;
    const b1 = blocks[idx];
    const b2 = blocks[idx + 1];

    if (!canJoinSubnets(b1.cidr, b2.cidr)) {
      setErrorMsg(`Подсети ${b1.cidr} и ${b2.cidr} не являются парными смежными блоками и не могут быть объединены.`);
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    const mergedCidr = joinSubnets(b1.cidr, b2.cidr);
    if (!mergedCidr) return;

    setBlocks(prev => {
      const copy = [...prev];
      copy.splice(idx, 2, {
        id: `blk-${Date.now()}`,
        cidr: mergedCidr,
        name: b1.name || b2.name || 'Объединенная подсеть',
        vlanId: b1.vlanId || b2.vlanId || '',
        color: b1.color
      });
      return copy;
    });
  };

  // Update block fields (name, vlanId)
  const handleUpdateBlockField = (blockId, field, value) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, [field]: value } : b));
  };

  // Create single VLAN from block
  const handleCreateVlanFromBlock = async (block) => {
    const parsed = parseSubnet(block.cidr);
    if (!parsed) return;

    const nextVlanId = parseInt(block.vlanId) || Math.max(1, ...existingVlans.map(v => v.id)) + 1;
    const vlanData = {
      id: nextVlanId,
      name: block.name || `VLAN ${nextVlanId}`,
      color: block.color || '#3b82f6',
      subnet: block.cidr,
      gateway: parsed.firstUsable,
      description: `Создано через VLSM Subnet Splitter (${block.cidr})`,
      dns: '192.168.10.1, 77.88.8.8'
    };

    setCreatingVlanId(block.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await api.createVlan(vlanData);
      setSuccessMsg(`VLAN ${nextVlanId} (${block.name}) с подсетью ${block.cidr} успешно создан в базе!`);
      if (onVlanCreated) onVlanCreated();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(`Ошибка создания VLAN: ${err.message}`);
    } finally {
      setCreatingVlanId(null);
    }
  };

  // Batch create all blocks as VLANs
  const handleBatchCreateVlans = async () => {
    if (!window.confirm(`Вы уверены, что хотите создать ${blocks.length} VLAN в базе данных для всех нарезанных подсетей?`)) {
      return;
    }

    setBatchCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let createdCount = 0;
    let nextId = Math.max(1, ...existingVlans.map(v => v.id)) + 1;

    try {
      for (const block of blocks) {
        const parsed = parseSubnet(block.cidr);
        if (!parsed) continue;

        const vId = parseInt(block.vlanId) || nextId++;
        const vlanData = {
          id: vId,
          name: block.name || `VLAN ${vId}`,
          color: block.color || '#3b82f6',
          subnet: block.cidr,
          gateway: parsed.firstUsable,
          description: `Пакетное создание через VLSM Splitter`,
          dns: '192.168.10.1, 77.88.8.8'
        };

        try {
          await api.createVlan(vlanData);
          createdCount++;
        } catch (e) {
          // ignore duplicate id error or continue
        }
      }

      setSuccessMsg(`Успешно создано ${createdCount} VLAN в базе данных и зарегистрировано в IPAM!`);
      if (onVlanCreated) onVlanCreated();
    } catch (err) {
      setErrorMsg(`Ошибка пакетного создания: ${err.message}`);
    } finally {
      setBatchCreating(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Подсеть (CIDR)', 'Маска', 'Wildcard', 'Шлюз (Первый)', 'Последний IP', 'Broadcast', 'Хостов всего', 'Полезных', 'Название сегмента', 'VLAN ID'];
    const rows = blocks.map(b => {
      const p = parseSubnet(b.cidr);
      return [
        b.cidr,
        p?.netmask || '',
        calculateWildcardMask(p?.netmask),
        p?.firstUsable || '',
        p?.lastUsable || '',
        p?.broadcast || '',
        p?.totalIps || '',
        p?.totalUsable || '',
        `"${b.name || ''}"`,
        b.vlanId || ''
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vlsm_plan_${activeBaseCidr.replace('/', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy plain text table
  const handleCopyTextPlan = () => {
    const lines = [
      `ПЛАН НАРЕЗКИ ПОДСЕТЕЙ (VLSM) ДЛЯ ${activeBaseCidr}`,
      `Сформировано в SwitchBook IPAM Engine: ${new Date().toLocaleString('ru-RU')}`,
      `--------------------------------------------------------------------------------`,
      ...blocks.map((b, i) => {
        const p = parseSubnet(b.cidr);
        return `#${i + 1} ${b.cidr.padEnd(18)} | Шлюз: ${(p?.firstUsable || '').padEnd(15)} | Диапазон: ${p?.firstUsable} - ${p?.lastUsable} | Хостов: ${p?.totalUsable} | ${b.name} (VLAN ${b.vlanId || '-'})`;
      })
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className={`w-full max-w-5xl rounded-2xl border shadow-2xl overflow-hidden transition-all my-8 flex flex-col max-h-[90vh] ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Интерактивный калькулятор нарезки подсетей (VLSM)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  Subnet Splitter
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Визуальное пропорциональное деление адресного пространства на подсети с генерацией шлюзов и VLAN
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

        {/* Toolbar: Select or input Base Network */}
        <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
          isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-500">Базовая сеть (Supernet):</span>
            <input
              type="text"
              value={baseCidrInput}
              onChange={(e) => setBaseCidrInput(e.target.value)}
              placeholder="10.0.0.0/16"
              className={`h-8 w-36 px-2.5 rounded-lg border font-mono font-bold text-xs outline-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            />
            <button
              onClick={() => handleApplyBaseCidr(baseCidrInput)}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
            >
              <span>Применить</span>
            </button>

            {/* Presets dropdown */}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[11px] text-slate-400">Пресеты:</span>
              <select
                onChange={(e) => e.target.value && handleApplyBaseCidr(e.target.value)}
                defaultValue=""
                className={`h-8 px-2 rounded-lg border text-xs outline-none cursor-pointer ${
                  isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <option value="" disabled>Выбрать шаблон сети...</option>
                {PRESET_NETWORKS.map(p => (
                  <option key={p.cidr} value={p.cidr}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {baseParsed && (
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>Маска: <strong className="text-slate-200">{baseParsed.netmask}</strong></span>
              <span>Wildcard: <strong className="text-slate-200">{calculateWildcardMask(baseParsed.netmask)}</strong></span>
              <span>Всего IP: <strong className="text-indigo-400">{baseParsed.totalIps.toLocaleString()}</strong></span>
            </div>
          )}
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* VISUAL PARTITION BAR (Disk-Manager style) */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Визуальная шкала адресного пространства ({blocks.length} подсетей)</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              100% покрытия родительской сети {activeBaseCidr}
            </span>
          </div>

          {/* Proportional partition bar */}
          <div className="h-12 w-full rounded-xl overflow-hidden flex border border-slate-700 bg-slate-950 p-1 gap-1 shadow-inner">
            {blocks.map((block) => {
              const p = parseSubnet(block.cidr);
              const fraction = baseParsed ? (p?.totalIps || 1) / baseParsed.totalIps : 1 / blocks.length;
              const percent = Math.max(3, fraction * 100);
              const isSelected = selectedBlockId === block.id;

              return (
                <div
                  key={block.id}
                  onClick={() => setSelectedBlockId(isSelected ? null : block.id)}
                  style={{
                    width: `${percent}%`,
                    backgroundColor: block.color || '#3b82f6'
                  }}
                  className={`h-full rounded-lg transition-all cursor-pointer relative group flex flex-col justify-center px-2 select-none overflow-hidden ${
                    isSelected ? 'ring-2 ring-white shadow-lg scale-[1.02] z-10' : 'opacity-90 hover:opacity-100 hover:scale-[1.01]'
                  }`}
                  title={`${block.cidr} — ${block.name || 'Подсеть'} (${p?.totalUsable || 0} хостов)`}
                >
                  <div className="text-[11px] font-bold font-mono text-white truncate drop-shadow-xs">
                    {block.cidr}
                  </div>
                  <div className="text-[9px] text-white/80 truncate font-mono">
                    {p?.totalUsable} хостов
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SUBNET BLOCKS TABLE */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Структура подсетей и параметры назначения</span>
            <span className="text-[11px] font-mono lowercase text-slate-500">
              Кликните ✂️ чтобы разрезать пополам или 🔗 чтобы объединить
            </span>
          </div>

          <div className="space-y-2">
            {blocks.map((block, idx) => {
              const p = parseSubnet(block.cidr);
              const isSelected = selectedBlockId === block.id;
              const canJoinNext = idx < blocks.length - 1 && canJoinSubnets(block.cidr, blocks[idx + 1]?.cidr);

              return (
                <div
                  key={block.id}
                  className={`p-3 rounded-xl border transition-all text-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/30'
                      : isLight
                      ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Left: Swatch & CIDR Info */}
                  <div className="flex items-center gap-3 shrink-0 min-w-[240px]">
                    <span
                      className="w-3.5 h-3.5 rounded-md shrink-0 shadow-xs"
                      style={{ backgroundColor: block.color || '#3b82f6' }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                          {block.cidr}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          /{p?.prefix}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        Шлюз: <span className="text-indigo-400 font-bold">{p?.firstUsable}</span> • Полезных хостов: <strong className="text-emerald-400">{p?.totalUsable}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Range & Broadcast */}
                  <div className="hidden md:flex flex-col font-mono text-[11px] text-slate-400 shrink-0 min-w-[180px]">
                    <div>Диапазон: {p?.firstUsable} — {p?.lastUsable}</div>
                    <div className="text-slate-500">Маска: {p?.netmask} (Бродкаст: {p?.broadcast})</div>
                  </div>

                  {/* Editable Segment Name and VLAN ID */}
                  <div className="flex items-center gap-2 flex-1 w-full lg:w-auto">
                    <input
                      type="text"
                      value={block.name || ''}
                      onChange={(e) => handleUpdateBlockField(block.id, 'name', e.target.value)}
                      placeholder="Название сегмента (например, Бухгалтерия)"
                      className={`h-8 flex-1 min-w-[140px] px-2.5 rounded-lg border text-xs outline-none ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                    <div className="relative shrink-0">
                      <input
                        type="number"
                        value={block.vlanId || ''}
                        onChange={(e) => handleUpdateBlockField(block.id, 'vlanId', e.target.value)}
                        placeholder="VLAN"
                        className={`h-8 w-16 px-2 rounded-lg border text-xs font-mono outline-none text-center ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                        title="VLAN ID"
                      />
                    </div>
                  </div>

                  {/* Actions: Split, Join, Create VLAN */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end lg:self-center">
                    {/* Split block (/N+1) */}
                    {p && p.prefix < 30 && (
                      <button
                        onClick={() => handleSplitBlock(block.id)}
                        className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-indigo-600 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        title="Разрезать эту подсеть пополам"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>/ {p.prefix + 1}</span>
                      </button>
                    )}

                    {/* Join with next sibling */}
                    {canJoinNext && (
                      <button
                        onClick={() => handleJoinWithNext(idx)}
                        className="h-8 px-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-emerald-600 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        title="Объединить с соседней парной подсетью"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Объединить</span>
                      </button>
                    )}

                    {/* Create single VLAN */}
                    <button
                      onClick={() => handleCreateVlanFromBlock(block)}
                      disabled={creatingVlanId === block.id}
                      className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer transition-all disabled:opacity-50"
                      title="Создать VLAN и добавить шлюз в базу IPAM"
                    >
                      {creatingVlanId === block.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>В VLAN</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTextPlan}
              className="h-9 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Скопировано!' : 'Копировать план'}</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="h-9 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Экспорт в CSV</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
            >
              Закрыть
            </button>
            <button
              onClick={handleBatchCreateVlans}
              disabled={batchCreating}
              className="h-9 px-4 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 cursor-pointer transition-all disabled:opacity-50"
            >
              {batchCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Создание VLAN...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Создать все {blocks.length} VLAN в базе</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}