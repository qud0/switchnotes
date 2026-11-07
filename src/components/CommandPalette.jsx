import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Server,
  Cpu,
  Cable,
  Globe,
  Layers,
  Network,
  Factory,
  MapPin,
  BookMarked,
  Wrench,
  BookOpen,
  History,
  LayoutDashboard,
  Plus,
  Moon,
  Sun,
  ShieldAlert,
  Zap,
  Radio,
  Tag,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export function CommandPalette({
  isOpen,
  onClose,
  switches = [],
  patchPanels = [],
  servers = [],
  vlans = [],
  onNavigateView,
  onSelectSwitch,
  onSelectPatchPanel,
  onOpenNewSwitch,
  onOpenVlanModal,
  onOpenAuditModal,
  onOpenDiscoveryModal,
  onOpenPoeModal,
  onOpenTroubleshoot,
  onToggleTheme,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Views List
  const VIEWS = [
    { id: 'dashboard', label: 'Дашборд сети', icon: LayoutDashboard, category: 'Разделы' },
    { id: 'switches', label: 'Коммутаторы', icon: Server, category: 'Разделы' },
    { id: 'servers', label: 'Серверы & ВМ', icon: Cpu, category: 'Разделы' },
    { id: 'patchPanels', label: 'Патч-панели', icon: Cable, category: 'Разделы' },
    { id: 'cables', label: 'Кабели & Маркировка СКС', icon: Tag, category: 'Разделы' },
    { id: 'ipam', label: 'IPAM подсети', icon: Globe, category: 'Разделы' },
    { id: 'rack', label: 'Стойка 42U (EIA-310)', icon: Layers, category: 'Разделы' },
    { id: 'topology', label: 'Топология сети (L2/L3)', icon: Network, category: 'Разделы' },
    { id: 'campus', label: 'Карта завода', icon: Factory, category: 'Разделы' },
    { id: 'floorPlans', label: 'Планы этажей и Wi-Fi', icon: MapPin, category: 'Разделы' },
    { id: 'cheatSheet', label: 'Шпаргалка CLI', icon: BookMarked, category: 'Разделы' },
    { id: 'tools', label: 'Сетевые утилиты', icon: Wrench, category: 'Разделы' },
    { id: 'notes', label: 'Инженерные заметки', icon: BookOpen, category: 'Разделы' },
    { id: 'history', label: 'История аудита', icon: History, category: 'Разделы' }
  ];

  // Actions List
  const ACTIONS = [
    {
      id: 'act-new-switch',
      label: 'Добавить новый коммутатор',
      category: 'Действия',
      icon: Plus,
      action: () => onOpenNewSwitch?.()
    },
    {
      id: 'act-audit',
      label: 'Запустить полный аудит сети',
      category: 'Действия',
      icon: ShieldAlert,
      action: () => onOpenAuditModal?.()
    },
    {
      id: 'act-discovery',
      label: 'Автодискавери сети (Ping sweep / SNMP)',
      category: 'Действия',
      icon: Radio,
      action: () => onOpenDiscoveryModal?.()
    },
    {
      id: 'act-poe',
      label: 'Менеджер бюджета питания PoE',
      category: 'Действия',
      icon: Zap,
      action: () => onOpenPoeModal?.()
    },
    {
      id: 'act-troubleshoot',
      label: 'Траблшутер сетевых неисправностей (L1-L4)',
      category: 'Действия',
      icon: Wrench,
      action: () => onOpenTroubleshoot?.()
    },
    {
      id: 'act-vlans',
      label: 'Справочник 802.1Q VLAN',
      category: 'Действия',
      icon: Tag,
      action: () => onOpenVlanModal?.()
    },
    {
      id: 'act-theme',
      label: isLight ? 'Включить тёмную тему' : 'Включить светлую тему',
      category: 'Действия',
      icon: isLight ? Moon : Sun,
      action: () => onToggleTheme?.()
    }
  ];

  // Filtered Results
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items = [];

    // 1. Actions & Views
    ACTIONS.forEach((a) => {
      if (!q || a.label.toLowerCase().includes(q)) {
        items.push({ ...a, type: 'action' });
      }
    });

    VIEWS.forEach((v) => {
      if (!q || v.label.toLowerCase().includes(q)) {
        items.push({
          ...v,
          type: 'view',
          action: () => onNavigateView(v.id)
        });
      }
    });

    // 2. Switches
    switches.forEach((sw) => {
      const match =
        !q ||
        sw.name?.toLowerCase().includes(q) ||
        sw.ip?.toLowerCase().includes(q) ||
        sw.model?.toLowerCase().includes(q) ||
        sw.vendor?.toLowerCase().includes(q) ||
        sw.location?.toLowerCase().includes(q);

      if (match) {
        items.push({
          id: `sw-${sw.id}`,
          label: sw.name,
          subtitle: `${sw.vendor} ${sw.model} • ${sw.ip || 'Без IP'} • ${sw.location || 'Стойка'}`,
          category: 'Коммутаторы',
          icon: Server,
          type: 'device',
          badge: sw.badge,
          action: () => {
            onSelectSwitch?.(sw.id);
            onNavigateView('switches');
          }
        });
      }
    });

    // 3. Servers
    servers.forEach((srv) => {
      const match =
        !q ||
        srv.name?.toLowerCase().includes(q) ||
        srv.ip?.toLowerCase().includes(q) ||
        srv.model?.toLowerCase().includes(q);

      if (match) {
        items.push({
          id: `srv-${srv.id}`,
          label: srv.name,
          subtitle: `${srv.type || 'Сервер'} • ${srv.ip || 'Без IP'} • ${srv.vms?.length || 0} ВМ`,
          category: 'Серверы & ВМ',
          icon: Cpu,
          type: 'device',
          action: () => onNavigateView('servers')
        });
      }
    });

    // 4. Patch Panels
    patchPanels.forEach((pp) => {
      const match =
        !q ||
        pp.name?.toLowerCase().includes(q) ||
        pp.location?.toLowerCase().includes(q);

      if (match) {
        items.push({
          id: `pp-${pp.id}`,
          label: pp.name,
          subtitle: `${pp.ports?.length || 24} портов • ${pp.location || 'Стойка'}`,
          category: 'Патч-панели',
          icon: Cable,
          type: 'device',
          action: () => {
            onSelectPatchPanel?.(pp.id);
            onNavigateView('patchPanels');
          }
        });
      }
    });

    // 5. VLANs
    vlans.forEach((v) => {
      const match =
        !q ||
        String(v.id).includes(q) ||
        v.name?.toLowerCase().includes(q) ||
        v.subnet?.toLowerCase().includes(q);

      if (match) {
        items.push({
          id: `vlan-${v.id}`,
          label: `VLAN ${v.id} — ${v.name}`,
          subtitle: v.subnet || 'Подсеть не задана',
          category: 'VLAN',
          icon: Tag,
          type: 'vlan',
          action: () => onOpenVlanModal?.()
        });
      }
    });

    return items.slice(0, 30);
  }, [query, switches, patchPanels, servers, vlans, isLight]);

  // Reset selected index on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % Math.max(1, results.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + results.length) % Math.max(1, results.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[selectedIndex];
        if (item) {
          item.action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-3 bg-black/75 backdrop-blur-xs">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className={`relative w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-pop-in ${
        isLight
          ? 'bg-white border-slate-200 text-slate-800 shadow-slate-400/50'
          : 'bg-slate-900 border-slate-700/90 text-white shadow-black/90'
      }`}>
        {/* Search Input Bar */}
        <div className={`p-3.5 border-b flex items-center gap-3 ${
          isLight ? 'border-slate-200 bg-slate-50/50' : 'border-slate-800 bg-slate-950/50'
        }`}>
          <Search className="w-5 h-5 text-blue-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Быстрый переход к свитчу, VLAN, стойке или команде..."
            className="w-full bg-transparent text-sm outline-none placeholder-slate-400 font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-1 flex-1">
          {results.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Ничего не найдено по запросу «{query}»
            </div>
          ) : (
            results.map((item, index) => {
              const ItemIcon = item.icon || Sparkles;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isLight
                      ? 'hover:bg-slate-100 text-slate-700'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : isLight
                        ? 'bg-slate-100 text-blue-600'
                        : 'bg-slate-800 text-blue-400'
                    }`}>
                      <ItemIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{item.label}</span>
                        {item.badge && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-blue-500/10 text-blue-500'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className={`text-[10px] truncate ${
                          isSelected ? 'text-blue-100' : 'text-slate-400'
                        }`}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : isLight
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className={`p-2.5 border-t px-4 flex items-center justify-between text-[11px] font-mono text-slate-400 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/80'
        }`}>
          <div className="flex items-center gap-3">
            <span>↑↓ Навигация</span>
            <span>↵ Выбрать</span>
          </div>
          <span>SwitchBook Command</span>
        </div>
      </div>
    </div>
  );
}
