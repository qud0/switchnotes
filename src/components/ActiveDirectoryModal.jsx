import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Server,
  Globe,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Filter,
  Check,
  Clock,
  Laptop,
  HardDrive,
  Sliders,
  Play,
  ArrowRight,
  Database,
  Layers,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { api } from '../api';

export function ActiveDirectoryModal({
  isOpen,
  onClose,
  vlans = [],
  onSyncComplete,
  theme = 'dark'
}) {
  const [activeTab, setActiveTab] = useState('connection'); // 'connection' | 'preview'
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(null);

  // Form settings state
  const [settings, setSettings] = useState({
    enabled: true,
    server: '',
    port: 389,
    useTls: false,
    baseDn: '',
    searchBase: '',
    bindDn: '',
    password: '',
    dnsServer: '',
    autoSyncEnabled: false,
    syncIntervalHours: 6,
    filterInactiveDays: 90,
    targetVlanId: '',
    lastSync: null,
    lastStatus: null,
    lastCount: 0,
    lastCreated: 0,
    lastUpdated: 0,
    lastError: null
  });

  // Preview data state
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState('all'); // 'all' | 'with_ip' | 'create' | 'update'

  // Load existing settings on mount / open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setTestResult(null);
    setSyncSuccess(null);
    api.getAdSettings()
      .then(data => {
        setSettings(prev => ({
          ...prev,
          ...data,
          targetVlanId: data.targetVlanId || (vlans[0]?.id || '')
        }));
      })
      .catch(err => {
        console.error('Ошибка загрузки настроек AD:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, vlans]);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  // Handle connection test
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testAdConnection(settings);
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: err.message || 'Ошибка подключения' });
    } finally {
      setTestingConnection(false);
    }
  };

  // Handle saving settings
  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const updated = await api.updateAdSettings(settings);
      setSettings(prev => ({ ...prev, ...updated }));
      setTestResult({ ok: true, message: 'Настройки успешно сохранены!' });
    } catch (err) {
      setTestResult({ ok: false, message: `Ошибка сохранения: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Handle previewing computers
  const handleLoadPreview = async () => {
    setPreviewLoading(true);
    setTestResult(null);
    setSyncSuccess(null);
    try {
      const data = await api.previewAdComputers(settings);
      setPreviewData(data);
      setActiveTab('preview');
    } catch (err) {
      setTestResult({ ok: false, message: `Ошибка предпросмотра: ${err.message}` });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle executing synchronization
  const handleExecuteSync = async () => {
    setSyncing(true);
    setSyncSuccess(null);
    try {
      const res = await api.syncAdToIpam(settings);
      setSyncSuccess(res);
      setSettings(prev => ({
        ...prev,
        lastSync: new Date().toISOString(),
        lastStatus: 'success',
        lastCreated: res.created,
        lastUpdated: res.updated
      }));
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setTestResult({ ok: false, message: `Ошибка синхронизации: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  // Filtered preview items
  const filteredPreviewItems = useMemo(() => {
    if (!previewData?.items) return [];
    return previewData.items.filter(item => {
      if (previewFilter === 'with_ip' && !item.ip) return false;
      if (previewFilter === 'create' && item.action !== 'create') return false;
      if (previewFilter === 'update' && !item.action.startsWith('update')) return false;

      if (!previewSearch.trim()) return true;
      const q = previewSearch.toLowerCase().trim();
      return (
        item.hostname?.toLowerCase().includes(q) ||
        item.ip?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.os?.toLowerCase().includes(q) ||
        item.cn?.toLowerCase().includes(q)
      );
    });
  }, [previewData, previewFilter, previewSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Интеграция с Active Directory</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  LDAP + DNS
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Импорт учетных записей компьютеров, сопоставление IP-адресов через DNS и наполнение IPAM
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isLight ? 'hover:bg-slate-200 border-slate-300' : 'hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`px-5 pt-3 flex items-center gap-2 border-b ${
          isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
        }`}>
          <button
            onClick={() => setActiveTab('connection')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 transition-colors cursor-pointer ${
              activeTab === 'connection'
                ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Параметры подключения</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('preview');
              if (!previewData && !previewLoading) handleLoadPreview();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 transition-colors cursor-pointer ${
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-500 bg-blue-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Предпросмотр и Синхронизация</span>
            {previewData && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500 text-white font-mono">
                {previewData.withIpCount}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Status Message / Test Alert */}
          {testResult && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
                testResult.ok
                  ? (isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300')
                  : (isLight ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-rose-950/40 border-rose-800 text-rose-300')
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
              )}
              <div className="text-xs">
                <div className="font-semibold">{testResult.ok ? 'Проверка связи успешна' : 'Ошибка соединения'}</div>
                <div className="mt-0.5 opacity-90">{testResult.message}</div>
              </div>
            </div>
          )}

          {/* Sync Success Alert */}
          {syncSuccess && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              isLight ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-blue-950/40 border-blue-800 text-blue-300'
            }`}>
              <CheckCircle2 className="w-5 h-5 shrink-0 text-blue-500 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold">Синхронизация с Active Directory завершена!</div>
                <div className="mt-1">
                  Добавлено новых IP: <strong>{syncSuccess.created}</strong> • Обновлено существующих: <strong>{syncSuccess.updated}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: CONNECTION SETTINGS */}
          {activeTab === 'connection' && (
            <div className="space-y-6">
              {/* Top summary badge */}
              {settings.lastSync && (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800 text-slate-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span>Последняя синхронизация:</span>
                    <strong className="text-slate-900 dark:text-slate-200 font-mono">
                      {new Date(settings.lastSync).toLocaleString()}
                    </strong>
                  </div>
                  {settings.lastCount !== undefined && (
                    <span className="font-mono text-emerald-500 font-semibold">
                      +{settings.lastCreated || 0} новых / ~{settings.lastUpdated || 0} обновлено
                    </span>
                  )}
                </div>
              )}

              {/* Server & Domain Credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Domain Controller Host */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-blue-500" />
                    <span>Контроллер домена (DC / LDAP Host) *</span>
                  </label>
                  <input
                    type="text"
                    value={settings.server}
                    onChange={e => setSettings({ ...settings, server: e.target.value })}
                    placeholder="dc01.company.local или 192.168.1.10"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">IP или DNS-имя сервера с Active Directory</span>
                </div>

                {/* Port & TLS */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Порт подключения</span>
                    <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer font-normal">
                      <input
                        type="checkbox"
                        checked={settings.useTls}
                        onChange={e => {
                          const checked = e.target.checked;
                          setSettings({
                            ...settings,
                            useTls: checked,
                            port: checked ? 636 : 389
                          });
                        }}
                        className="rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-[11px]">Использовать LDAPS (SSL)</span>
                    </label>
                  </label>
                  <input
                    type="number"
                    value={settings.port}
                    onChange={e => setSettings({ ...settings, port: parseInt(e.target.value) || 389 })}
                    placeholder="389"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">389 для стандартного LDAP, 636 для LDAPS</span>
                </div>

                {/* Base DN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span>Корневой Base DN домена *</span>
                  </label>
                  <input
                    type="text"
                    value={settings.baseDn}
                    onChange={e => setSettings({ ...settings, baseDn: e.target.value })}
                    placeholder="DC=company,DC=local"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">Базовый корень домена Active Directory</span>
                </div>

                {/* Specific OU / Search Base */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>Подразделение поиска (OU / Search Base)</span>
                  </label>
                  <input
                    type="text"
                    value={settings.searchBase}
                    onChange={e => setSettings({ ...settings, searchBase: e.target.value })}
                    placeholder="OU=Computers,DC=company,DC=local (или пусто для всего домена)"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">Оставьте пустым для сканирования всех подразделений</span>
                </div>

                {/* Bind DN / Service Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-500" />
                    <span>Служебная учётная запись (Bind DN)</span>
                  </label>
                  <input
                    type="text"
                    value={settings.bindDn}
                    onChange={e => setSettings({ ...settings, bindDn: e.target.value })}
                    placeholder="switchbook_reader@company.local или DOMAIN\reader"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">Достаточно прав обычного пользователя (Domain Users)</span>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <span>Пароль учетной записи</span>
                  </label>
                  <input
                    type="password"
                    value={settings.password}
                    onChange={e => setSettings({ ...settings, password: e.target.value })}
                    placeholder="••••••••"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">Хранится в зашифрованном виде на сервере</span>
                </div>
              </div>

              {/* DNS & Subnet Matching Settings */}
              <div className={`p-4 rounded-xl border space-y-4 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}>
                <div className="font-semibold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Сопоставление IP-адресов и DNS
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Custom DNS server */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      DNS-сервер домена
                    </label>
                    <input
                      type="text"
                      value={settings.dnsServer}
                      onChange={e => setSettings({ ...settings, dnsServer: e.target.value })}
                      placeholder="По умолчанию (IP контроллера)"
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                      }`}
                    />
                    <span className="text-[10px] text-slate-500">DNS для резолва A-записей компьютеров</span>
                  </div>

                  {/* Filter Inactive Days */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Исключать неактивные хосты
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={settings.filterInactiveDays}
                        onChange={e => setSettings({ ...settings, filterInactiveDays: parseInt(e.target.value) || 0 })}
                        className={`w-24 px-3 py-2 rounded-xl border text-xs font-mono ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                        }`}
                      />
                      <span className="text-xs text-slate-500">дней без входа</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Фильтр по lastLogonTimestamp (0 — без фильтра)</span>
                  </div>

                  {/* Target VLAN fallback */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Резервный VLAN (Fallback)
                    </label>
                    <select
                      value={settings.targetVlanId}
                      onChange={e => setSettings({ ...settings, targetVlanId: parseInt(e.target.value) || '' })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-medium ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                      }`}
                    >
                      {vlans.map(v => (
                        <option key={v.id} value={v.id}>
                          VLAN {v.id}: {v.name} ({v.subnet || 'без подсети'})
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500">Если IP не попал в подсеть существующих VLAN</span>
                  </div>
                </div>
              </div>

              {/* Automatic Sync Schedule */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>Автоматическая фоновая синхронизация</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Периодический опрос AD и актуализация данных в IPAM по расписанию
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoSyncEnabled}
                      onChange={e => setSettings({ ...settings, autoSyncEnabled: e.target.checked })}
                      className="rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Включить</span>
                  </label>

                  {settings.autoSyncEnabled && (
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-slate-500">каждые</span>
                      <select
                        value={settings.syncIntervalHours}
                        onChange={e => setSettings({ ...settings, syncIntervalHours: parseInt(e.target.value) || 6 })}
                        className={`px-2 py-1 rounded-lg border text-xs ${
                          isLight ? 'bg-white border-slate-300' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <option value="1">1 час</option>
                        <option value="3">3 часа</option>
                        <option value="6">6 часов</option>
                        <option value="12">12 часов</option>
                        <option value="24">24 часа</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREVIEW & SYNC */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Top Action & Metrics Bar */}
              {previewData ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Всего в AD</div>
                    <div className="text-xl font-bold font-mono mt-0.5">{previewData.totalFound}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">ПК и серверов</div>
                  </div>

                  <div className={`p-3 rounded-xl border ${isLight ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">С IP-адресом</div>
                    <div className="text-xl font-bold font-mono mt-0.5 text-emerald-500">{previewData.withIpCount}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Отрезолвлено через DNS</div>
                  </div>

                  <div className={`p-3 rounded-xl border ${isLight ? 'bg-blue-50/60 border-blue-200 text-blue-900' : 'bg-blue-950/30 border-blue-800/60 text-blue-300'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Новые для IPAM</div>
                    <div className="text-xl font-bold font-mono mt-0.5 text-blue-500">+{previewData.toCreateCount}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Будут созданы</div>
                  </div>

                  <div className={`p-3 rounded-xl border ${isLight ? 'bg-amber-50/60 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-800/60 text-amber-300'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Обновление</div>
                    <div className="text-xl font-bold font-mono mt-0.5 text-amber-500">~{previewData.toUpdateCount}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Существуют в базе</div>
                  </div>
                </div>
              ) : (
                <div className={`p-8 rounded-2xl border text-center space-y-3 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                }`}>
                  <Database className="w-10 h-10 mx-auto text-blue-500/60" />
                  <div className="text-sm font-semibold">Данные предпросмотра ещё не загружены</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Нажмите «Загрузить предпросмотр», чтобы запросить список компьютеров из Active Directory и отрезолвить их IP-адреса.
                  </p>
                  <button
                    onClick={handleLoadPreview}
                    disabled={previewLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
                    <span>{previewLoading ? 'Опрос Active Directory...' : 'Загрузить предпросмотр'}</span>
                  </button>
                </div>
              )}

              {/* Filters & Search Toolbar */}
              {previewData && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={previewSearch}
                      onChange={e => setPreviewSearch(e.target.value)}
                      placeholder="Поиск по имени, IP, ОС, описанию..."
                      className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    <button
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        previewFilter === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Все ({previewData.items.length})
                    </button>
                    <button
                      onClick={() => setPreviewFilter('create')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        previewFilter === 'create'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-500 hover:text-emerald-500'
                      }`}
                    >
                      Новые (+{previewData.toCreateCount})
                    </button>
                    <button
                      onClick={() => setPreviewFilter('update')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        previewFilter === 'update'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-500 hover:text-amber-500'
                      }`}
                    >
                      Обновление (~{previewData.toUpdateCount})
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewData && (
                <div className={`rounded-xl border overflow-hidden ${
                  isLight ? 'border-slate-200' : 'border-slate-800'
                }`}>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className={`sticky top-0 text-[10px] font-bold uppercase tracking-wider border-b z-10 ${
                        isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-850 border-slate-800 text-slate-400'
                      }`}>
                        <tr>
                          <th className="py-2.5 px-3">Имя компьютера / DNS</th>
                          <th className="py-2.5 px-3">IP-адрес</th>
                          <th className="py-2.5 px-3">VLAN</th>
                          <th className="py-2.5 px-3">Операционная система</th>
                          <th className="py-2.5 px-3">Описание / Пользователь</th>
                          <th className="py-2.5 px-3">Действие</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                        {filteredPreviewItems.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="py-8 text-center text-slate-500 font-sans">
                              Устройства не найдены
                            </td>
                          </tr>
                        ) : (
                          filteredPreviewItems.map((item, idx) => {
                            const isCreate = item.action === 'create';
                            const isUpdate = item.action.startsWith('update');
                            return (
                              <tr
                                key={idx}
                                className={`transition-colors ${
                                  isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-850/50'
                                }`}
                              >
                                <td className="py-2 px-3">
                                  <div className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 font-sans">
                                    <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    <span>{item.hostname || item.cn}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  {item.ip ? (
                                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                      {item.ip}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic font-sans text-[11px]">
                                      Не резолвится
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-sans font-medium">
                                    VLAN {item.vlanId}: {item.vlanName}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400 truncate max-w-[160px]" title={item.os}>
                                  {item.os || '—'}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400 truncate max-w-[180px]" title={item.description}>
                                  {item.description || '—'}
                                </td>
                                <td className="py-2 px-3 font-sans">
                                  {isCreate && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      Новый IP
                                    </span>
                                  )}
                                  {isUpdate && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      Обновить
                                    </span>
                                  )}
                                  {!item.ip && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-500/10">
                                      Пропуск
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 sm:p-5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection || !settings.server}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 h-10 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin text-blue-500' : ''}`} />
              <span>{testingConnection ? 'Тестирование...' : 'Проверить связь'}</span>
            </button>

            <button
              onClick={handleLoadPreview}
              disabled={previewLoading || !settings.server}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 h-10 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin text-indigo-500' : 'text-indigo-400'}`} />
              <span>{previewLoading ? 'Загрузка...' : 'Предпросмотр'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={loading}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Сохранить настройки</span>
            </button>

            <button
              onClick={handleExecuteSync}
              disabled={syncing || !settings.server}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Синхронизация...' : 'Синхронизировать с IPAM'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
