import React, { useRef, useState, useEffect } from 'react';
import {
  Server,
  Cpu,
  Plus,
  Tag,
  Download,
  Upload,
  Search,
  Sun,
  Moon,
  Layers,
  FileCode,
  Network,
  Cable,
  ZoomIn,
  ZoomOut,
  Printer,
  Globe,
  ShieldAlert,
  MapPin,
  Activity,
  Wrench,
  BookOpen,
  LayoutDashboard,
  History,
  Bell,
  Sparkles,
  Factory,
  BookMarked,
  User,
  Users,
  LogOut,
  Shield,
  ChevronDown,
  Zap,
  Code2,
  Radio,
  MoreHorizontal,
  X,
  Database
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function Header({
  searchQuery,
  onSearchChange,
  onOpenNewSwitch,
  onOpenImportModal,
  onOpenVlanModal,
  onOpenReportModal,
  onOpenAuditModal,
  onOpenDeviceTrace,
  onOpenAlertsModal,
  onOpenTemplatesModal,
  onOpenTroubleshoot,
  onOpenPoeModal,
  onOpenDiscoveryModal,
  onOpenConfigTemplatesModal,
  unreadAlertsCount = 0,
  auditIssuesCount = 0,
  auditHealthScore = 100,
  vlansCount = 0,
  switchesCount = 0,
  patchPanelsCount = 0,
  onDatabaseRestored,
  theme = 'dark',
  onToggleTheme,
  currentView = 'switches',
  onViewChange,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpenUsersModal,
  onOpenLoginModal,
  onOpenAdModal
}) {
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const isLight = theme === 'light';

  // Dropdown open states
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const { user, role, isAdmin, canEdit, logout, switchRoleQuickly } = useAuth();
  const toast = useToast();

  // Close all open dropdowns on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false);
        setMobileNavOpen(false);
        setToolsMenuOpen(false);
        setDataMenuOpen(false);
        setMobileMoreOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus mobile search input when expanded
  useEffect(() => {
    if (mobileSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const closeAllMenus = () => {
    setUserMenuOpen(false);
    setMobileNavOpen(false);
    setToolsMenuOpen(false);
    setDataMenuOpen(false);
    setMobileMoreOpen(false);
  };

  const VIEWS = [
    { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
    { id: 'switches', label: 'Коммутаторы', icon: Server },
    { id: 'servers', label: 'Серверы & ВМ', icon: Cpu },
    { id: 'patchPanels', label: 'Патч-панели', icon: Cable },
    { id: 'cables', label: 'Кабели & Маркировка', icon: Tag },
    { id: 'ipam', label: 'IPAM', icon: Globe },
    { id: 'rack', label: 'Стойка 42U', icon: Layers },
    { id: 'topology', label: 'Топология', icon: Network },
    { id: 'campus', label: 'Карта завода', icon: Factory },
    { id: 'floorPlans', label: 'Планы этажей', icon: MapPin },
    { id: 'cheatSheet', label: 'Шпаргалка', icon: BookMarked },
    { id: 'tools', label: 'Утилиты', icon: Wrench },
    { id: 'notes', label: 'Заметки', icon: BookOpen },
    { id: 'history', label: 'История', icon: History }
  ];

  const currentViewObj = VIEWS.find(v => v.id === currentView) || VIEWS[0];
  const CurrentIcon = currentViewObj.icon;

  const handleExport = () => {
    window.location.href = api.exportBackupUrl();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!window.confirm(`Восстановить базу? Это заменит текущие данные (${parsed.switches?.length || 0} коммутаторов).`)) {
        return;
      }
      await api.restoreBackup(parsed);
      toast.success('База данных успешно восстановлена!');
      onDatabaseRestored();
    } catch (err) {
      toast.error(`Ошибка импорта: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${
      isLight
        ? 'bg-white/95 border-slate-200 text-slate-800 shadow-xs'
        : 'bg-slate-950/90 border-slate-800 text-slate-100 shadow-xs'
    }`}>
      <div className="w-full mx-auto px-2 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-2 xl:gap-3">
        {/* 1. Logo & Brand */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Server className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-base font-mono tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                SwitchBook
              </span>
              <span className="hidden xl:inline-flex text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
                DCIM & Network
              </span>
            </div>
            <p className="hidden 2xl:block text-[10px] text-slate-400 whitespace-nowrap">
              Коммутаторы, СКС, VLAN и топология
            </p>
          </div>
        </div>

        {/* Mobile View Selector (Visible only on < md) */}
        <div className="md:hidden relative shrink-0">
          <button
            onClick={() => {
              closeAllMenus();
              setMobileNavOpen(!mobileNavOpen);
            }}
            className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
            }`}
            title="Выбрать раздел"
          >
            <CurrentIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="max-w-[90px] truncate">{currentViewObj.label}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {mobileNavOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className={`absolute left-0 mt-2 w-60 rounded-2xl border shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md max-h-[75vh] overflow-y-auto ${
                isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
              }`}>
                {VIEWS.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer font-medium ${
                        isActive
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 2. Main View Switcher Tabs (Desktop / Tablet >= md) */}
        <div className={`hidden md:flex items-center p-0.5 rounded-xl border shrink-0 h-9 overflow-x-auto max-w-[42vw] lg:max-w-[50vw] xl:max-w-none scrollbar-none ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          {VIEWS.map((item) => {
            const ItemIcon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 3. Search Bar (Desktop inline >= lg) */}
        <div className="hidden lg:block relative shrink-0">
          <div className="relative w-36 xl:w-48 h-9">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск... (Ctrl+K)"
              className={`w-full h-9 border rounded-xl pl-8 pr-14 text-xs outline-none transition-all placeholder-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isLight
                  ? 'bg-slate-100/90 border-slate-200 text-slate-900 focus:bg-white'
                  : 'bg-slate-900/90 border-slate-800 text-white focus:bg-slate-900'
              }`}
            />
            {searchQuery ? (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
                title="Очистить поиск"
              >
                ✕
              </button>
            ) : (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden xl:inline-block text-[9px] font-mono text-slate-400 bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 pointer-events-none select-none">
                Ctrl K
              </span>
            )}
          </div>
        </div>

        {/* 4. Action Buttons Toolbar */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Mobile Search Toggle (< lg) */}
          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className={`lg:hidden w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 ${
              mobileSearchOpen || searchQuery
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : isLight
                ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Поиск устройств и портов"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Live Alerts Bell Button (Always visible on all screens) */}
          <button
            onClick={onOpenAlertsModal}
            className={`h-9 px-2 sm:px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500 relative ${
              unreadAlertsCount > 0
                ? isLight
                  ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
                : isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={unreadAlertsCount > 0 ? `Журнал алертов: ${unreadAlertsCount} неквитированных инцидентов` : 'Журнал алертов и мониторинга сети'}
          >
            <Bell className={`w-3.5 h-3.5 shrink-0 ${unreadAlertsCount > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-400'}`} />
            {unreadAlertsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white">
                {unreadAlertsCount}
              </span>
            ) : (
              <span className="hidden xl:inline text-slate-500 dark:text-slate-400">Алерты</span>
            )}
          </button>

          {/* Quick Search / Trace Button (>= md) */}
          <button
            onClick={onOpenDeviceTrace}
            className={`hidden md:flex h-9 px-2 sm:px-2.5 rounded-xl border text-xs font-medium items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                : 'bg-blue-950/40 border-blue-500/30 text-blue-300 hover:bg-blue-900/50'
            }`}
            title="Live-поиск розетки, MAC, порта и Ping (Ctrl+F)"
          >
            <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden xl:inline">Поиск / Ping</span>
          </button>

          {/* Grouped Menu: Инструменты и аудит (>= md) */}
          <div className="hidden md:block relative shrink-0">
            <button
              onClick={() => {
                closeAllMenus();
                setToolsMenuOpen(!toolsMenuOpen);
              }}
              className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500 ${
                toolsMenuOpen
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Сетевые инструменты, аудит и траблшутер"
            >
              <Wrench className={`w-3.5 h-3.5 shrink-0 ${toolsMenuOpen ? 'text-white' : 'text-amber-500'}`} />
              <span className="hidden xl:inline">Инструменты</span>
              {auditIssuesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  {auditHealthScore}%
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {toolsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setToolsMenuOpen(false)} />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-2 z-50 text-xs backdrop-blur-md ${
                  isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
                }`}>
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Диагностика и анализ
                  </div>

                  {/* Network Audit */}
                  <button
                    onClick={() => { onOpenAuditModal(); setToolsMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className={`w-4 h-4 shrink-0 ${auditIssuesCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                      <div>
                        <div className="font-semibold">Аудит сети</div>
                        <div className="text-[10px] text-slate-400">Проверка петель, VLAN и коллизий</div>
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      auditHealthScore >= 90
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                    }`}>
                      {auditHealthScore}%
                    </span>
                  </button>

                  {/* Troubleshooter */}
                  {onOpenTroubleshoot && (
                    <button
                      onClick={() => { onOpenTroubleshoot(); setToolsMenuOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                      }`}
                    >
                      <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <div className="font-semibold">Траблшутер L1-L4</div>
                        <div className="text-[10px] text-slate-400">Интеллектуальный поиск неисправностей</div>
                      </div>
                    </button>
                  )}

                  {/* Auto-Discovery */}
                  {onOpenDiscoveryModal && (
                    <button
                      onClick={() => { onOpenDiscoveryModal(); setToolsMenuOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                      }`}
                    >
                      <Radio className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <div className="font-semibold">Автодискавери сети</div>
                        <div className="text-[10px] text-slate-400">Ping sweep, SNMP v2/v3, OUI сканер</div>
                      </div>
                    </button>
                  )}

                  {/* PoE Budget */}
                  {onOpenPoeModal && (
                    <button
                      onClick={() => { onOpenPoeModal(); setToolsMenuOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                      }`}
                    >
                      <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-semibold">PoE Бюджет питания</div>
                        <div className="text-[10px] text-slate-400">Расчёт ватт, 802.3af/at/bt стандарты</div>
                      </div>
                    </button>
                  )}

                  {/* CLI Templates */}
                  {onOpenConfigTemplatesModal && (
                    <button
                      onClick={() => { onOpenConfigTemplatesModal(); setToolsMenuOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                      }`}
                    >
                      <Code2 className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <div className="font-semibold">Шаблоны CLI</div>
                        <div className="text-[10px] text-slate-400">Jinja2 генератор для Cisco, MikroTik, SNR</div>
                      </div>
                    </button>
                  )}

                  {/* Report & Passport */}
                  <button
                    onClick={() => { onOpenReportModal(); setToolsMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Printer className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Паспорт узла связи</div>
                      <div className="text-[10px] text-slate-400">Экспорт в PDF и печать спецификации</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Grouped Menu: Справочники и База данных (>= md) */}
          <div className="hidden md:block relative shrink-0">
            <button
              onClick={() => {
                closeAllMenus();
                setDataMenuOpen(!dataMenuOpen);
              }}
              className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500 ${
                dataMenuOpen
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Справочники, шаблоны и резервные копии"
            >
              <Database className={`w-3.5 h-3.5 shrink-0 ${dataMenuOpen ? 'text-white' : 'text-blue-500'}`} />
              <span className="hidden xl:inline">База & VLAN</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {dataMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDataMenuOpen(false)} />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-2 z-50 text-xs backdrop-blur-md ${
                  isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
                }`}>
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Справочники
                  </div>

                  {/* VLAN Catalog */}
                  <button
                    onClick={() => { onOpenVlanModal(); setDataMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <div className="font-semibold">Справочник VLAN</div>
                        <div className="text-[10px] text-slate-400">База 802.1Q тегов и подсетей</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {vlansCount}
                    </span>
                  </button>

                  {/* Switch Templates */}
                  <button
                    onClick={() => { onOpenTemplatesModal(); setDataMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Каталог моделей</div>
                      <div className="text-[10px] text-slate-400">Eltex, Cisco, MikroTik, SNR, Huawei</div>
                    </div>
                  </button>

                  {/* Import CLI Config */}
                  <button
                    onClick={() => { onOpenImportModal(); setDataMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <FileCode className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Импорт из CLI-конфига</div>
                      <div className="text-[10px] text-slate-400">Парсинг running-config коммутатора</div>
                    </div>
                  </button>

                  {/* Active Directory */}
                  {canEdit && onOpenAdModal && (
                    <button
                      onClick={() => { onOpenAdModal(); setDataMenuOpen(false); }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                      }`}
                    >
                      <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <div className="font-semibold">Active Directory</div>
                        <div className="text-[10px] text-slate-400">Синхронизация LDAP и DNS хостов</div>
                      </div>
                    </button>
                  )}

                  <div className="my-1.5 border-t border-slate-200 dark:border-slate-800" />
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Резервное копирование
                  </div>

                  {/* Export Backup */}
                  <button
                    onClick={() => { handleExport(); setDataMenuOpen(false); }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Download className="w-4 h-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Экспорт базы (JSON)</div>
                      <div className="text-[10px] text-slate-400">Скачать полный бэкап системы</div>
                    </div>
                  </button>

                  {/* Restore Backup */}
                  <button
                    onClick={() => {
                      if (!isAdmin) {
                        toast.warning('Восстановление базы доступно только Главному администратору');
                        return;
                      }
                      setDataMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 transition cursor-pointer ${
                      isAdmin
                        ? isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Восстановить базу</div>
                      <div className="text-[10px] text-slate-400">
                        {isAdmin ? 'Загрузить файл .json' : 'Только для администратора'}
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* UI Zoom Controls (>= xl) */}
          <div
            className={`hidden xl:flex items-center border rounded-xl overflow-hidden h-9 shrink-0 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
            title="Масштаб интерфейса (Ctrl + / Ctrl -)"
          >
            <button
              onClick={onZoomOut}
              disabled={zoomLevel <= 70}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Уменьшить (Ctrl -)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onZoomReset}
              className="px-1.5 h-9 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 cursor-pointer select-none flex items-center"
              title="Сбросить (100%)"
            >
              {zoomLevel}%
            </button>
            <button
              onClick={onZoomIn}
              disabled={zoomLevel >= 150}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Увеличить (Ctrl +)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Theme Switcher (Square w-9 h-9) */}
          <button
            onClick={onToggleTheme}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-amber-600 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title={isLight ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
          >
            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Add Switch Button (Primary CTA) */}
          <button
            onClick={() => {
              if (!canEdit) {
                toast.warning('Добавление коммутаторов доступно только для Инженера и Администратора');
                return;
              }
              onOpenNewSwitch();
            }}
            disabled={!canEdit}
            className={`h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500 ${
              canEdit
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            }`}
            title={canEdit ? 'Добавить новый коммутатор' : 'Только для инженера/администратора'}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Коммутатор</span>
          </button>

          {/* User & RBAC Profile Pill */}
          <div className="relative shrink-0">
            <button
              onClick={() => {
                closeAllMenus();
                setUserMenuOpen(!userMenuOpen);
              }}
              className={`h-9 px-2 sm:px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                role === 'admin'
                  ? isLight ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' : 'bg-red-950/40 hover:bg-red-900/50 border-red-800/80 text-red-300'
                  : role === 'engineer'
                  ? isLight ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700' : 'bg-blue-950/40 hover:bg-blue-900/50 border-blue-800/80 text-blue-300'
                  : isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
              title={`Текущий пользователь: ${user ? user.username : 'Гость'}`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline font-semibold max-w-[85px] truncate">
                {user ? (user.name || user.username) : 'Гость'}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                role === 'admin'
                  ? 'bg-red-500/20 text-red-400'
                  : role === 'engineer'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-slate-700/60 text-slate-400'
              }`}>
                {role === 'admin' ? 'Admin' : role === 'engineer' ? 'Eng' : 'View'}
              </span>
            </button>

            {/* User Dropdown Menu */}
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-3 z-50 text-xs backdrop-blur-md ${
                  isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
                }`}>
                  <div className="pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm truncate">{user?.name || user?.username || 'Гость'}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        role === 'admin'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : role === 'engineer'
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : 'bg-slate-700/60 text-slate-400 border-slate-600'
                      }`}>
                        {role === 'admin' ? 'Администратор' : role === 'engineer' ? 'Инженер' : 'Наблюдатель'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {user?.email || (user ? `@${user.username}` : 'Только чтение')}
                    </div>
                  </div>

                  <div className="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Быстрое переключение роли:
                  </div>
                  <div className="space-y-1 mb-3">
                    <button
                      onClick={() => { switchRoleQuickly('admin'); setUserMenuOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition cursor-pointer ${
                        role === 'admin' ? 'bg-red-500/20 text-red-400 font-bold' : isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Администратор</span>
                      <span className="text-[10px] text-slate-400">полный доступ</span>
                    </button>
                    <button
                      onClick={() => { switchRoleQuickly('engineer'); setUserMenuOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition cursor-pointer ${
                        role === 'engineer' ? 'bg-blue-500/20 text-blue-400 font-bold' : isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Инженер</span>
                      <span className="text-[10px] text-slate-400">порты, СКС, SSH</span>
                    </button>
                    <button
                      onClick={() => { switchRoleQuickly('viewer'); setUserMenuOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition cursor-pointer ${
                        role === 'viewer' ? 'bg-slate-700/50 text-slate-300 font-bold' : isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Наблюдатель</span>
                      <span className="text-[10px] text-slate-400">только чтение</span>
                    </button>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => { onOpenUsersModal?.(); setUserMenuOpen(false); }}
                      className="w-full px-2.5 py-2 mb-2 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-600 dark:text-purple-300 border border-purple-500/30 flex items-center gap-2 font-medium transition cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      Управление пользователями (RBAC)
                    </button>
                  )}

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => { onOpenLoginModal?.(); setUserMenuOpen(false); }}
                      className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium cursor-pointer"
                    >
                      Сменить пароль / Логин
                    </button>
                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="text-red-500 hover:text-red-600 dark:hover:text-red-400 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      Выйти
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Mobile "More" Menu Toggle (< md) */}
          <div className="md:hidden relative shrink-0">
            <button
              onClick={() => {
                closeAllMenus();
                setMobileMoreOpen(!mobileMoreOpen);
              }}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                mobileMoreOpen
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Все инструменты и функции"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {mobileMoreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMoreOpen(false)} />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-2.5 z-50 text-xs backdrop-blur-md max-h-[80vh] overflow-y-auto ${
                  isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
                }`}>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Инструменты сети
                  </div>
                  <button
                    onClick={() => { onOpenDeviceTrace(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Поиск розетки / Ping</span>
                  </button>
                  <button
                    onClick={() => { onOpenAuditModal(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Аудит сети</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-amber-500">{auditHealthScore}%</span>
                  </button>
                  {onOpenTroubleshoot && (
                    <button
                      onClick={() => { onOpenTroubleshoot(); setMobileMoreOpen(false); }}
                      className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>Траблшутер L1-L4</span>
                    </button>
                  )}
                  {onOpenDiscoveryModal && (
                    <button
                      onClick={() => { onOpenDiscoveryModal(); setMobileMoreOpen(false); }}
                      className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Radio className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>Автодискавери сети</span>
                    </button>
                  )}
                  {onOpenPoeModal && (
                    <button
                      onClick={() => { onOpenPoeModal(); setMobileMoreOpen(false); }}
                      className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>PoE Бюджет</span>
                    </button>
                  )}
                  {onOpenConfigTemplatesModal && (
                    <button
                      onClick={() => { onOpenConfigTemplatesModal(); setMobileMoreOpen(false); }}
                      className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Code2 className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>Шаблоны CLI</span>
                    </button>
                  )}
                  <button
                    onClick={() => { onOpenReportModal(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Паспорт узла связи</span>
                  </button>

                  <div className="my-1.5 border-t border-slate-200 dark:border-slate-800" />
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Справочники & База
                  </div>
                  <button
                    onClick={() => { onOpenVlanModal(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>Справочник VLAN</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{vlansCount}</span>
                  </button>
                  <button
                    onClick={() => { onOpenTemplatesModal(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Каталог моделей</span>
                  </button>
                  <button
                    onClick={() => { onOpenImportModal(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <FileCode className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Импорт из CLI</span>
                  </button>
                  {canEdit && onOpenAdModal && (
                    <button
                      onClick={() => { onOpenAdModal(); setMobileMoreOpen(false); }}
                      className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Active Directory</span>
                    </button>
                  )}
                  <button
                    onClick={() => { handleExport(); setMobileMoreOpen(false); }}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Экспорт базы (JSON)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Hidden File Input for JSON DB restore */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>

      {/* Expandable Mobile Search Bar (visible on < lg when toggled) */}
      {mobileSearchOpen && (
        <div className={`lg:hidden px-3 py-2 border-t transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск по имени, IP, MAC, VLAN или комментарию..."
              className={`w-full h-10 border rounded-xl pl-9 pr-16 text-xs outline-none transition-all placeholder-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
                title="Закрыть поиск"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
