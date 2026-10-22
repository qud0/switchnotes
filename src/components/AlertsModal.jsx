import React, { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  Filter,
  Trash2,
  Check,
  Clock,
  Radio,
  ExternalLink,
  ShieldAlert,
  Server,
  Send,
  Settings,
  Bot,
  Webhook,
  Key,
  MessageSquare,
  Loader2,
  Sliders,
  CheckCheck
} from 'lucide-react';
import { api } from '../api';

export function AlertsModal({
  isOpen,
  onClose,
  events = [],
  onAcknowledge,
  onClearAll,
  onSelectSwitch,
  soundEnabled = true,
  onToggleSound,
  theme = 'dark'
}) {
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'channels'
  const [filterSeverity, setFilterSeverity] = useState('all'); // 'all' | 'critical' | 'warning' | 'info'
  const [filterAck, setFilterAck] = useState('all'); // 'all' | 'unack' | 'ack'
  const [searchQuery, setSearchQuery] = useState('');

  // Notification settings state
  const [notifSettings, setNotifSettings] = useState({
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    webhookEnabled: false,
    webhookUrl: '',
    syslogEnabled: false,
    syslogHost: '',
    syslogPort: 514,
    alertOnSwitchDown: true,
    alertOnLinkDown: true,
    alertOnHighCrc: true,
    alertOnHighTraffic: true,
    trafficThresholdMbps: 850
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  const isLight = theme === 'light';

  useEffect(() => {
    if (isOpen && activeTab === 'channels') {
      loadSettings();
    }
  }, [isOpen, activeTab]);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const data = await api.getNotificationSettings();
      if (data) setNotifSettings(data);
    } catch (err) {
      console.error('Ошибка загрузки настроек уведомлений:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSavingSettings(true);
      setStatusMessage(null);
      const updated = await api.updateNotificationSettings(notifSettings);
      setNotifSettings(updated);
      setStatusMessage({ type: 'success', text: 'Настройки оповещений успешно сохранены!' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Ошибка сохранения: ${err.message}` });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      setTestingNotification(true);
      setStatusMessage(null);
      await api.testNotification(notifSettings);
      setStatusMessage({ type: 'success', text: 'Тестовое оповещение успешно отправлено!' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Ошибка отправки: ${err.message}` });
    } finally {
      setTestingNotification(false);
    }
  };

  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (filterSeverity !== 'all' && evt.severity !== filterSeverity && evt.type !== filterSeverity) {
        return false;
      }
      if (filterAck === 'unack' && evt.acknowledged) return false;
      if (filterAck === 'ack' && !evt.acknowledged) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          (evt.title || '').toLowerCase().includes(q) ||
          (evt.message || evt.desc || '').toLowerCase().includes(q) ||
          (evt.source || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [events, filterSeverity, filterAck, searchQuery]);

  const unackCount = useMemo(() => {
    return events.filter(e => !e.acknowledged).length;
  }, [events]);

  const criticalCount = useMemo(() => {
    return events.filter(e => (e.severity === 'critical' || e.type === 'error') && !e.acknowledged).length;
  }, [events]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className={`w-full max-w-4xl rounded-2xl border shadow-2xl flex flex-col max-h-[88vh] overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${
              criticalCount > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 animate-pulse'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
            }`}>
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                  Журнал алертов и мониторинга (SNMP / Syslog)
                </h2>
                {unackCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500 text-white">
                    {unackCount} новых
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Оперативный мониторинг инцидентов: падение линков, превышение PoE, всплески CRC и конфликты адресов
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio alarm toggle */}
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                  : (isLight ? 'bg-slate-100 border-slate-300 text-slate-400' : 'bg-slate-800 border-slate-700 text-slate-400')
              }`}
              title={soundEnabled ? 'Звуковые сигналы включены (кликните для отключения)' : 'Звуковые сигналы отключены'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={`px-6 pt-2 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('events')}
              className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'events'
                  ? 'border-blue-500 text-blue-500'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>События и инциденты</span>
              {unackCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500 text-white font-bold">
                  {unackCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'channels'
                  ? 'border-blue-500 text-blue-500'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Каналы оповещений (Telegram / Webhook)</span>
              {notifSettings.telegramEnabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Telegram активен" />
              )}
            </button>
          </div>

          {activeTab === 'channels' && (
            <div className="text-[11px] text-slate-500 font-mono hidden sm:block">
              SNMP Monitor Daemon
            </div>
          )}
        </div>

        {activeTab === 'events' ? (
          <>
            {/* Filters and Actions Bar */}
            <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
              isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Severity */}
                <div className={`h-8 p-0.5 rounded-lg border flex items-center shrink-0 ${
                  isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
                }`}>
                  <button
                    onClick={() => setFilterSeverity('all')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterSeverity === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Все
                  </button>
                  <button
                    onClick={() => setFilterSeverity('critical')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterSeverity === 'critical'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Критические
                  </button>
                  <button
                    onClick={() => setFilterSeverity('warning')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterSeverity === 'warning'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Предупреждения
                  </button>
                  <button
                    onClick={() => setFilterSeverity('info')}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterSeverity === 'info'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Инфо
                  </button>
                </div>

                {/* Filter Acknowledged */}
                <div className={`h-8 p-0.5 rounded-lg border flex items-center shrink-0 ${
                  isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
                }`}>
                  <button
                    onClick={() => setFilterAck('all')}
                    className={`h-7 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterAck === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Все статусы
                  </button>
                  <button
                    onClick={() => setFilterAck('unack')}
                    className={`h-7 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterAck === 'unack'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Не квитированные
                  </button>
                  <button
                    onClick={() => setFilterAck('ack')}
                    className={`h-7 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      filterAck === 'ack'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Квитированные
                  </button>
                </div>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Поиск по источнику или описанию..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-blue-500 transition-colors w-48 sm:w-60 ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2">
                {events.length > 0 && onClearAll && (
                  <button
                    onClick={onClearAll}
                    className="h-8 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Очистить все</span>
                  </button>
                )}
              </div>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {filteredEvents.length === 0 ? (
                <div className={`p-12 text-center border border-dashed rounded-xl ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/40'
                }`}>
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Нет активных алертов
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Все порты, магистральные линки и параметры коммутаторов работают в пределах установленных норм.
                  </p>
                </div>
              ) : (
                filteredEvents.map((evt) => {
                  const isCrit = evt.severity === 'critical' || evt.type === 'error' || evt.level === 'critical';
                  const isWarn = evt.severity === 'warning' || evt.level === 'warning';
                  const isAck = Boolean(evt.acknowledged);

                  return (
                    <div
                      key={evt.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isAck
                          ? (isLight ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-slate-950/50 border-slate-800 opacity-60')
                          : isCrit
                          ? (isLight ? 'bg-rose-50/70 border-rose-300' : 'bg-rose-950/20 border-rose-500/40')
                          : isWarn
                          ? (isLight ? 'bg-amber-50/70 border-amber-300' : 'bg-amber-950/20 border-amber-500/40')
                          : (isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                          isCrit
                            ? 'bg-rose-500/10 text-rose-500'
                            : isWarn
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {isCrit ? <AlertCircle className="w-4 h-4" /> : isWarn ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">
                              {evt.title}
                            </span>
                            <span className={`text-[10px] font-mono font-semibold px-2 py-0.2 rounded-full border ${
                              isCrit
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                                : isWarn
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                : 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                            }`}>
                              {isCrit ? 'CRITICAL' : isWarn ? 'WARNING' : 'INFO'}
                            </span>
                            {isAck && (
                              <span className="text-[10px] text-emerald-500 font-mono flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Квитирован
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            {evt.desc || evt.message}
                          </p>

                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-mono">
                            {(evt.source || evt.switchName) && (
                              <span className="flex items-center gap-1">
                                <Server className="w-3 h-3 text-slate-500" />
                                {evt.source || `${evt.switchName}${evt.portName ? ` : ${evt.portName}` : ''}`}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {evt.time || (evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'Сейчас')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {evt.switchId && onSelectSwitch && (
                          <button
                            onClick={() => {
                              onSelectSwitch(evt.switchId);
                              onClose();
                            }}
                            className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                            }`}
                            title="Перейти к коммутатору"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Открыть</span>
                          </button>
                        )}

                        {!isAck && onAcknowledge && (
                          <button
                            onClick={() => onAcknowledge(evt.id)}
                            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                            title="Подтвердить ознакомление с инцидентом"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Квитировать</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t flex items-center justify-between text-xs text-slate-400 shrink-0 ${
              isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
            }`}>
              <div>
                Показано алертов: <strong className="text-slate-200">{filteredEvents.length}</strong> из {events.length}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </>
        ) : (
          /* Notification Channels Configuration Tab */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {statusMessage && (
              <div className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {statusMessage.type === 'success' ? <CheckCheck className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Telegram Channel */}
            <div className={`p-5 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Telegram Бот (Push-уведомления)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Мгновенные оповещения в личные сообщения или групповой чат дежурной смены
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.telegramEnabled}
                    onChange={(e) => setNotifSettings({ ...notifSettings, telegramEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Telegram Bot Token
                  </label>
                  <input
                    type="text"
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={notifSettings.telegramBotToken || ''}
                    onChange={(e) => setNotifSettings({ ...notifSettings, telegramBotToken: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Получите у бота @BotFather командой /newbot
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Telegram Chat ID
                  </label>
                  <input
                    type="text"
                    placeholder="-1001234567890 или ID пользователя"
                    value={notifSettings.telegramChatId || ''}
                    onChange={(e) => setNotifSettings({ ...notifSettings, telegramChatId: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-blue-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Узнайте ID через @userinfobot или добавьте бота в группу
                  </span>
                </div>
              </div>
            </div>

            {/* Webhook Channel */}
            <div className={`p-5 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Webhook className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      HTTP Webhook (Discord / Slack / Mattermost / Zabbix)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Отправка JSON POST-запроса в сторонние системы мониторинга и мессенджеры
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.webhookEnabled}
                    onChange={(e) => setNotifSettings({ ...notifSettings, webhookEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  Webhook URL
                </label>
                <input
                  type="text"
                  placeholder="https://discord.com/api/webhooks/... или https://hooks.slack.com/services/..."
                  value={notifSettings.webhookUrl || ''}
                  onChange={(e) => setNotifSettings({ ...notifSettings, webhookUrl: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-purple-500 ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                  }`}
                />
              </div>
            </div>

            {/* Enterprise Syslog UDP Channel */}
            <div className={`p-5 rounded-2xl border transition-all ${
              notifSettings.syslogEnabled
                ? (isLight ? 'bg-cyan-50/50 border-cyan-300' : 'bg-cyan-950/20 border-cyan-500/40')
                : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800')
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    notifSettings.syslogEnabled ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      Enterprise Syslog (UDP 514)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Отправка RFC 3164/5424 логов в SIEM, Graylog, Wazuh или ELK
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.syslogEnabled}
                    onChange={(e) => setNotifSettings({ ...notifSettings, syslogEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Хост / IP-адрес Syslog-сервера
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.10.50 или syslog.company.local"
                    value={notifSettings.syslogHost || ''}
                    onChange={(e) => setNotifSettings({ ...notifSettings, syslogHost: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-cyan-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    UDP Порт
                  </label>
                  <input
                    type="number"
                    placeholder="514"
                    value={notifSettings.syslogPort || 514}
                    onChange={(e) => setNotifSettings({ ...notifSettings, syslogPort: parseInt(e.target.value) || 514 })}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none focus:border-cyan-500 ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* SNMP Polling & Trigger Rules */}
            <div className={`p-5 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Правила срабатывания фонового демона SNMP
                  </h3>
                  <p className="text-xs text-slate-500">
                    Настройка условий отправки оповещений (циклический опрос каждые 8 секунд)
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.alertOnSwitchDown !== false}
                    onChange={(e) => setNotifSettings({ ...notifSettings, alertOnSwitchDown: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs text-slate-300">
                    <strong>Падение коммутатора (Switch Down)</strong> — полная потеря связи с коммутатором (ICMP / SNMP Timeout)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.alertOnLinkDown}
                    onChange={(e) => setNotifSettings({ ...notifSettings, alertOnLinkDown: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs text-slate-300">
                    <strong>Срыв линка (Link Down)</strong> — аварийное отключение активного порта (статус UP ➔ DOWN)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.alertOnHighCrc}
                    onChange={(e) => setNotifSettings({ ...notifSettings, alertOnHighCrc: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs text-slate-300">
                    <strong>Всплеск ошибок FCS / CRC</strong> — рост inErrors на порту (дефект кабеля, затухание SFP)
                  </span>
                </label>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifSettings.alertOnHighTraffic}
                      onChange={(e) => setNotifSettings({ ...notifSettings, alertOnHighTraffic: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs text-slate-300">
                      <strong>Превышение порога нагрузки трафика</strong>
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={notifSettings.trafficThresholdMbps || 850}
                      onChange={(e) => setNotifSettings({ ...notifSettings, trafficThresholdMbps: parseInt(e.target.value) || 0 })}
                      className={`w-24 px-2.5 py-1 rounded-lg border text-xs font-mono outline-none text-right ${
                        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                    <span className="text-xs text-slate-400">Мбит/с</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Form Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testingNotification || (!notifSettings.telegramEnabled && !notifSettings.webhookEnabled && !notifSettings.syslogEnabled)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  testingNotification || (!notifSettings.telegramEnabled && !notifSettings.webhookEnabled && !notifSettings.syslogEnabled)
                    ? 'opacity-50 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-400'
                    : isLight
                    ? 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-white'
                }`}
              >
                {testingNotification ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Тестовое оповещение</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Сохранить настройки</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

