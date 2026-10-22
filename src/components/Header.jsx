import React, { useRef, useState } from 'react';
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
  LogIn,
  LogOut,
  Shield,
  ChevronDown,
  Menu
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

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
  const isLight = theme === 'light';
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, role, isAdmin, canEdit, logout, switchRoleQuickly } = useAuth();

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
      alert('База данных успешно восстановлена!');
      onDatabaseRestored();
    } catch (err) {
      alert(`Ошибка импорта: ${err.message}`);
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
      <div className="w-full mx-auto px-3 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-2 xl:gap-3">
        {/* 1. Logo & Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Server className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-base font-mono tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                SwitchBook
              </span>
              <span className="hidden sm:inline-flex text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
                MikroTik • SNR • Ubiquiti • Eltex • Cisco
              </span>
            </div>
            <p className="hidden 2xl:block text-[10px] text-slate-400 whitespace-nowrap">
              Записная книжка коммутаторов, СКС и VLAN
            </p>
          </div>
        </div>

        {/* Mobile View Selector (Visible only on < md) */}
        <div className="md:hidden relative shrink-0">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-100'
            }`}
            title="Выбрать раздел"
          >
            <CurrentIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="max-w-[100px] truncate">{currentViewObj.label}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {mobileNavOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className={`absolute left-0 mt-2 w-56 rounded-2xl border shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md max-h-[75vh] overflow-y-auto ${
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

        {/* 2. Main View Switcher Tabs (Consistent height h-9, smooth horizontal scroll on narrow screens) */}
        <div className={`hidden md:flex items-center p-0.5 rounded-xl border shrink-0 h-9 overflow-x-auto max-w-[55vw] lg:max-w-none scrollbar-none ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <button
            onClick={() => onViewChange('dashboard')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'dashboard'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span>Дашборд</span>
          </button>

          <button
            onClick={() => onViewChange('switches')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'switches'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5 shrink-0" />
            <span>Коммутаторы</span>
          </button>

          <button
            onClick={() => onViewChange('servers')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'servers'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span>Серверы & ВМ</span>
          </button>

          <button
            onClick={() => onViewChange('patchPanels')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'patchPanels'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Cable className="w-3.5 h-3.5 shrink-0" />
            <span>Патч-панели</span>
          </button>

          <button
            onClick={() => onViewChange('cables')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'cables'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5 shrink-0" />
            <span>Кабели & Маркировка</span>
          </button>

          <button
            onClick={() => onViewChange('ipam')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'ipam'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span>IPAM</span>
          </button>

          <button
            onClick={() => onViewChange('rack')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'rack'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>Стойка 42U</span>
          </button>

          <button
            onClick={() => onViewChange('topology')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'topology'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Network className="w-3.5 h-3.5 shrink-0" />
            <span>Топология</span>
          </button>

          <button
            onClick={() => onViewChange('campus')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'campus'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Factory className="w-3.5 h-3.5 shrink-0" />
            <span>Карта завода</span>
          </button>

          <button
            onClick={() => onViewChange('floorPlans')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'floorPlans'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>Планы этажей</span>
          </button>

          <button
            onClick={() => onViewChange('cheatSheet')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'cheatSheet'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5 shrink-0" />
            <span>Шпаргалка</span>
          </button>

          <button
            onClick={() => onViewChange('tools')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'tools'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span>Утилиты</span>
          </button>

          <button
            onClick={() => onViewChange('notes')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'notes'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Заметки</span>
          </button>

          <button
            onClick={() => onViewChange('history')}
            className={`h-8 px-2.5 lg:px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
              currentView === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span>История</span>
          </button>
        </div>

        {/* 3. Search Bar (Height h-9, controlled width) */}
        <div className="hidden lg:block relative shrink-0">
          <div className="relative w-36 xl:w-52 h-9">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Поиск..."
              className={`w-full h-9 border rounded-xl pl-8 pr-7 text-xs outline-none transition-all placeholder-slate-400 focus:border-blue-500 ${
                isLight
                  ? 'bg-slate-100/90 border-slate-200 text-slate-900 focus:bg-white'
                  : 'bg-slate-900/90 border-slate-800 text-white focus:bg-slate-900'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 4. Action Buttons Toolbar - All buttons strictly uniform h-9 height */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* UI Zoom Controls (Uniform h-9 height) */}
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
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-amber-600 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title={isLight ? 'Включить темную тему' : 'Включить светлую тему'}
          >
            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {/* Live Alerts Bell Button (h-9) */}
          <button
            onClick={onOpenAlertsModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap relative ${
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
            <span className="hidden sm:inline">Алерты</span>
            {unreadAlertsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white">
                {unreadAlertsCount}
              </span>
            )}
          </button>

          {/* Live Diagnostics & Trace Button (h-9) */}
          <button
            onClick={onOpenDeviceTrace}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                : 'bg-blue-950/40 border-blue-500/30 text-blue-300 hover:bg-blue-900/50'
            }`}
            title="Live-диагностика, поиск розетки/порта и Ping (Ctrl+F)"
          >
            <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Поиск / Ping</span>
          </button>

          {/* Report & Passport Button (h-9) */}
          <button
            onClick={onOpenReportModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Паспорт узла связи и кабельный журнал (Печать / PDF)"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden sm:inline">Паспорт</span>
          </button>

          {/* Network Audit Button (h-9) */}
          <button
            onClick={onOpenAuditModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              auditIssuesCount > 0
                ? isLight
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-amber-950/30 border-amber-500/40 text-amber-300 hover:bg-amber-900/40'
                : isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title={`Аудит сети: индекс здоровья ${auditHealthScore}/100, замечаний: ${auditIssuesCount}`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${auditIssuesCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
            <span className="hidden sm:inline">Аудит</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border ${
              auditHealthScore >= 90
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                : auditHealthScore >= 70
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
            }`}>
              {auditHealthScore}
            </span>
          </button>

          {/* Network Troubleshooter Button (h-9) */}
          {onOpenTroubleshoot && (
            <button
              onClick={() => onOpenTroubleshoot()}
              className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                  : 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-500/40 text-amber-300'
              }`}
              title="Интеллектуальный «Траблшутер» сетевых неполадок (L1-L4)"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Траблшутер</span>
            </button>
          )}

          {/* VLANs Catalog Button (h-9) */}
          <button
            onClick={onOpenVlanModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Открыть справочник VLAN"
          >
            <Tag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden sm:inline">VLANs</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono border ${
              isLight
                ? 'bg-white text-slate-600 border-slate-300'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {vlansCount}
            </span>
          </button>

          {/* Templates Catalog Button (h-9) */}
          <button
            onClick={onOpenTemplatesModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                : 'bg-blue-950/40 hover:bg-blue-900/60 border-blue-800 text-blue-300'
            }`}
            title="Каталог заводских моделей коммутаторов (Eltex, Cisco, MikroTik, SNR, Huawei, D-Link, Zyxel, Ubiquiti)"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="hidden sm:inline">Шаблоны</span>
          </button>

          {/* Users RBAC Button (Admin only, h-9) */}
          {isAdmin && (
            <button
              onClick={onOpenUsersModal}
              className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                isLight
                  ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
                  : 'bg-purple-950/40 hover:bg-purple-900/60 border-purple-800 text-purple-300'
              }`}
              title="Управление пользователями и правами (RBAC)"
            >
              <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="hidden sm:inline">Пользователи</span>
            </button>
          )}

          {/* Active Directory Sync Button (Admin/Engineer, h-9) */}
          {canEdit && onOpenAdModal && (
            <button
              onClick={onOpenAdModal}
              className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                isLight
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                  : 'bg-blue-950/40 hover:bg-blue-900/60 border-blue-800 text-blue-300'
              }`}
              title="Интеграция с Active Directory (LDAP + DNS)"
            >
              <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="hidden sm:inline">Active Directory</span>
            </button>
          )}

          {/* Import Config Button (h-9) */}
          <button
            onClick={onOpenImportModal}
            className={`h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Импортировать коммутатор из CLI-конфига"
          >
            <FileCode className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="hidden sm:inline">Импорт</span>
          </button>

          {/* Backup Group (h-9) */}
          <div className={`flex items-center border rounded-xl overflow-hidden h-9 shrink-0 ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <button
              onClick={handleExport}
              className="w-8 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
              title="Экспорт базы в JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <div className={`w-px h-4.5 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
            <button
              onClick={() => {
                if (!isAdmin) {
                  alert('Восстановление базы данных доступно только Главному администратору (роль: admin)');
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="w-8 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
              title={isAdmin ? "Восстановить базу из JSON" : "Восстановление базы доступно только администратору"}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
          </div>

          {/* Add Switch Button (Primary blue button, h-9) */}
          <button
            onClick={() => {
              if (!canEdit) {
                alert('Добавление коммутаторов доступно только для Инженера и Администратора');
                return;
              }
              onOpenNewSwitch();
            }}
            disabled={!canEdit}
            className={`h-9 px-3 sm:px-3.5 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
              canEdit
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            }`}
            title={canEdit ? "Добавить новый коммутатор" : "Только для инженера/администратора"}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Коммутатор</span>
          </button>

          {/* User & RBAC Profile Pill */}
          <div className="relative shrink-0">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`h-9 px-2 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                role === 'admin'
                  ? isLight ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' : 'bg-red-950/40 hover:bg-red-900/50 border-red-800/80 text-red-300'
                  : role === 'engineer'
                  ? isLight ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700' : 'bg-blue-950/40 hover:bg-blue-900/50 border-blue-800/80 text-blue-300'
                  : isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
              title={`Текущий пользователь: ${user ? user.username : 'Гость'}`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline font-semibold max-w-[90px] truncate">
                {user ? (user.name || user.username) : 'Гость'}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                role === 'admin'
                  ? 'bg-red-500/20 text-red-300'
                  : role === 'engineer'
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-slate-700/60 text-slate-400'
              }`}>
                {role === 'admin' ? 'Admin' : role === 'engineer' ? 'Eng' : 'View'}
              </span>
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl p-3 z-50 text-xs backdrop-blur-md ${
                  isLight ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-300/60' : 'bg-slate-900/98 border-slate-700 text-white shadow-black/80'
                }`}>
                  <div className="pb-2.5 mb-2.5 border-b border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm truncate">{user?.name || user?.username || 'Гость'}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        role === 'admin'
                          ? 'bg-red-500/20 text-red-300 border-red-500/30'
                          : role === 'engineer'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-slate-700/60 text-slate-300 border-slate-600'
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
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition ${
                        role === 'admin' ? 'bg-red-500/20 text-red-300 font-bold' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Администратор</span>
                      <span className="text-[10px] text-slate-500">полный доступ</span>
                    </button>
                    <button
                      onClick={() => { switchRoleQuickly('engineer'); setUserMenuOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition ${
                        role === 'engineer' ? 'bg-blue-500/20 text-blue-300 font-bold' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Инженер</span>
                      <span className="text-[10px] text-slate-500">порты, СКС, SSH</span>
                    </button>
                    <button
                      onClick={() => { switchRoleQuickly('viewer'); setUserMenuOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between transition ${
                        role === 'viewer' ? 'bg-slate-700/50 text-slate-300 font-bold' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <span>Наблюдатель</span>
                      <span className="text-[10px] text-slate-500">только чтение</span>
                    </button>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => { onOpenUsersModal?.(); setUserMenuOpen(false); }}
                      className="w-full px-2.5 py-2 mb-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center gap-2 font-medium transition cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      Управление пользователями (RBAC)
                    </button>
                  )}

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => { onOpenLoginModal?.(); setUserMenuOpen(false); }}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium cursor-pointer"
                    >
                      Сменить пароль / Логин
                    </button>
                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      Выйти
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
