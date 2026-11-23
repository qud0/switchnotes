import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Cable,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Trash2,
  Sliders,
  Zap,
  AlertTriangle,
  Play,
  Square,
  PlusCircle,
  Check,
  RefreshCw,
  Eye,
  FileCode,
  Shield,
  HelpCircle
} from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import {
  WebSerialSession,
  isWebSerialSupported,
  isSecureContextCheck
} from '../utils/webSerialManager';
import {
  generateZtpConfig,
  VENDOR_PRESETS,
  cidrToNetmask,
  netmaskToCidr
} from '../utils/ztpTemplates';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function WebSerialModal({
  isOpen,
  onClose,
  initialSwitch = null,
  switches = [],
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';
  const toast = useToast();

  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonRef = useRef(null);
  const sessionRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [portInfo, setPortInfo] = useState(null);

  // Serial Port Settings
  const [baudRate, setBaudRate] = useState(9600);
  const [dataBits, setDataBits] = useState(8);
  const [stopBits, setStopBits] = useState(1);
  const [parity, setParity] = useState('none');
  const [flowControl, setFlowControl] = useState('none');
  const [showSettings, setShowSettings] = useState(false);

  // ZTP Panel State
  const [showZtpPanel, setShowZtpPanel] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(
    initialSwitch?.vendor?.toLowerCase().includes('mikrotik') ? 'mikrotik' : 'snr'
  );
  const [selectedSwitchId, setSelectedSwitchId] = useState(initialSwitch?.id || '');

  const [ztpForm, setZtpForm] = useState({
    hostname: initialSwitch?.name || 'SW-ACCESS-01',
    ip: initialSwitch?.ip || '192.168.1.10',
    mask: '255.255.255.0',
    gateway: initialSwitch?.gateway || '192.168.1.1',
    adminUser: 'admin',
    adminPassword: '',
    vlanId: 1
  });

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState({ current: 0, total: 0, line: '' });
  const [lineDelayMs, setLineDelayMs] = useState(60);
  const [previewConfig, setPreviewConfig] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const webSerialSupported = useMemo(() => isWebSerialSupported(), []);
  const secureContext = useMemo(() => isSecureContextCheck(), []);

  // Handle auto-population when selecting switch from inventory
  const handleSelectSwitch = (e) => {
    const swId = e.target.value;
    setSelectedSwitchId(swId);
    if (!swId) return;

    const sw = switches.find(s => String(s.id) === String(swId));
    if (sw) {
      const isMt = (sw.vendor || '').toLowerCase().includes('mikrotik');
      const vendorKey = isMt ? 'mikrotik' : 'snr';
      setSelectedVendor(vendorKey);
      setBaudRate(VENDOR_PRESETS[vendorKey].defaultBaudRate);

      setZtpForm(prev => ({
        ...prev,
        hostname: sw.name || prev.hostname,
        ip: sw.ip || prev.ip,
        gateway: sw.gateway || prev.gateway || '192.168.1.1',
        vlanId: sw.managementVlan || prev.vlanId || 1
      }));
    }
  };

  // Vendor change updates default baud rate
  const handleVendorChange = (vendorKey) => {
    setSelectedVendor(vendorKey);
    const defBaud = VENDOR_PRESETS[vendorKey]?.defaultBaudRate || 9600;
    setBaudRate(defBaud);
  };

  // Initialize xterm.js instance
  useEffect(() => {
    if (!terminalRef.current) return;

    if (!xtermInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        fontFamily: 'Consolas, "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        lineHeight: 1.25,
        theme: {
          background: '#090d16',
          foreground: '#e2e8f0',
          cursor: '#38bdf8',
          selectionBackground: '#1e3a8a',
          black: '#0f172a',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#f8fafc',
          brightBlack: '#475569',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#a78bfa',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff'
        }
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      xtermInstance.current = term;
      fitAddonRef.current = fitAddon;

      // Welcome banner
      term.writeln('\x1b[1;36m=== SwitchBook WebSerial Console ===\x1b[0m');
      term.writeln('\x1b[90mПрямой доступ к последовательному порту через Web Serial API.\x1b[0m');
      term.writeln('\x1b[90mПодключите USB-консольный кабель (SNR, MikroTik, FTDI, CH340) и нажмите "Подключить".\x1b[0m\r\n');

      // Wire terminal typing to active serial session
      term.onData((data) => {
        if (sessionRef.current?.isConnected) {
          sessionRef.current.write(data).catch((err) => {
            console.error('Serial write error:', err);
          });
        }
      });
    }

    const handleResize = () => {
      fitAddonRef.current?.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Cleanup on modal close or unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
      if (xtermInstance.current) {
        xtermInstance.current.dispose();
        xtermInstance.current = null;
      }
    };
  }, []);

  // Connect to serial port
  const handleConnect = async () => {
    if (!webSerialSupported) {
      toast.show('Web Serial API не поддерживается в данном браузере', 'error');
      return;
    }

    setIsConnecting(true);
    const term = xtermInstance.current;

    try {
      if (!sessionRef.current) {
        sessionRef.current = new WebSerialSession();
        // Wire incoming data to xterm
        sessionRef.current.onData((chunk) => {
          if (xtermInstance.current) {
            xtermInstance.current.write(chunk);
          }
        });
      }

      term?.writeln('\x1b[33m[Запрос выбора последовательного порта...]\x1b[0m');
      await sessionRef.current.requestPort();

      term?.writeln(`\x1b[33m[Открытие порта ${baudRate} 8N1...]\x1b[0m`);
      await sessionRef.current.connect({
        baudRate,
        dataBits,
        stopBits,
        parity,
        flowControl
      });

      setIsConnected(true);
      setPortInfo(`${baudRate} bps, ${dataBits}${parity[0].toUpperCase()}${stopBits}`);
      term?.writeln('\x1b[1;32m[✓ Последовательный порт успешно открыт!]\x1b[0m\r\n');
      toast.show('Порт успешно подключен', 'success');
    } catch (err) {
      console.error('Serial connection error:', err);
      term?.writeln(`\x1b[1;31m[Ошибка подключения: ${err.message || 'Отменено пользователем'}]\x1b[0m\r\n`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
      fitAddonRef.current?.fit();
    }
  };

  // Disconnect serial port
  const handleDisconnect = async () => {
    if (sessionRef.current) {
      await sessionRef.current.disconnect();
    }
    setIsConnected(false);
    setPortInfo(null);
    xtermInstance.current?.writeln('\r\n\x1b[33m[Порт закрыт]\x1b[0m\r\n');
    toast.show('Последовательный порт закрыт', 'info');
  };

  // Send hardware Break signal (250ms)
  const handleSendBreak = async () => {
    if (!sessionRef.current?.isConnected) {
      toast.show('Сначала подключите порт', 'warning');
      return;
    }
    try {
      xtermInstance.current?.writeln('\r\n\x1b[35m[Отправка аппаратного сигнала BREAK (250ms)...]\x1b[0m\r\n');
      await sessionRef.current.sendBreak(250);
      toast.show('Сигнал Break отправлен', 'success');
    } catch (err) {
      toast.show(`Ошибка Send Break: ${err.message}`, 'error');
    }
  };

  // Open Preview Modal
  const handleOpenPreview = () => {
    const generated = generateZtpConfig({
      vendor: selectedVendor,
      hostname: ztpForm.hostname,
      ip: ztpForm.ip,
      mask: ztpForm.mask,
      gateway: ztpForm.gateway,
      adminUser: ztpForm.adminUser,
      adminPassword: ztpForm.adminPassword,
      vlanId: ztpForm.vlanId
    });
    setPreviewConfig(generated);
    setShowPreviewModal(true);
  };

  // Inject Configuration into Switch via Throttled Streamer
  const handleStartStreaming = async () => {
    if (!sessionRef.current?.isConnected) {
      toast.show('Сначала откройте подключение к COM-порту', 'warning');
      return;
    }

    const configToStream = previewConfig || generateZtpConfig({
      vendor: selectedVendor,
      hostname: ztpForm.hostname,
      ip: ztpForm.ip,
      mask: ztpForm.mask,
      gateway: ztpForm.gateway,
      adminUser: ztpForm.adminUser,
      adminPassword: ztpForm.adminPassword,
      vlanId: ztpForm.vlanId
    });

    setShowPreviewModal(false);
    setIsStreaming(true);
    setStreamProgress({ current: 0, total: 0, line: '' });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    xtermInstance.current?.writeln('\r\n\x1b[1;36m[Начало потоковой заливки ZTP конфигурации...]\x1b[0m\r\n');

    try {
      const res = await sessionRef.current.streamConfig({
        commands: configToStream,
        lineDelayMs,
        signal: controller.signal,
        onProgress: (current, total, line) => {
          setStreamProgress({ current, total, line });
        }
      });

      if (res.aborted) {
        xtermInstance.current?.writeln(`\r\n\x1b[1;33m[Заливка прервана пользователем: передано ${res.sent} из ${res.total} строк]\x1b[0m\r\n`);
        toast.show('Заливка конфига остановлена', 'warning');
      } else {
        xtermInstance.current?.writeln(`\r\n\x1b[1;32m[✓ Заливка завершена: передано ${res.sent} строк!]\x1b[0m\r\n`);
        toast.show(`Конфигурация успешно отправлена (${res.sent} строк)`, 'success');
      }
    } catch (err) {
      xtermInstance.current?.writeln(`\r\n\x1b[1;31m[Ошибка заливки: ${err.message}]\x1b[0m\r\n`);
      toast.show(`Ошибка: ${err.message}`, 'error');
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Save configured device into SwitchBook Inventory Database
  const handleSaveToInventory = async () => {
    try {
      const vendorName = selectedVendor === 'mikrotik' ? 'MikroTik' : 'SNR';
      await api.addSwitch({
        name: ztpForm.hostname || 'NEW-SWITCH',
        ip: ztpForm.ip || '192.168.1.10',
        vendor: vendorName,
        model: selectedVendor === 'mikrotik' ? 'RouterOS Device' : 'S2965-24T',
        ports: 24,
        managementVlan: Number(ztpForm.vlanId) || 1,
        gateway: ztpForm.gateway || ''
      });
      toast.show(`Коммутатор "${ztpForm.hostname}" добавлен в базу SwitchBook!`, 'success');
    } catch (err) {
      toast.show(`Ошибка сохранения: ${err.message}`, 'error');
    }
  };

  // Copy Terminal Output
  const handleCopyOutput = () => {
    const log = sessionRef.current?.getSessionLog() || '';
    if (!log) {
      toast.show('Лог пуст', 'info');
      return;
    }
    navigator.clipboard.writeText(log).then(() => {
      setCopied(true);
      toast.show('Вывод скопирован в буфер', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Download Session Log
  const handleDownloadLog = () => {
    const log = sessionRef.current?.getSessionLog() || '';
    if (!log) {
      toast.show('Лог пуст', 'info');
      return;
    }
    const blob = new Blob([log], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `serial-session-${ztpForm.hostname || 'device'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.show('Лог сессии скачан', 'success');
  };

  // Clear Screen
  const handleClearTerminal = () => {
    xtermInstance.current?.clear();
    sessionRef.current?.clearSessionLog();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`flex flex-col bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-6xl h-[88vh]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Cable className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm">
                  Zero-Touch WebConsole
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  USB/COM
                </span>
                {isConnected ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Подключено ({portInfo})
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    Отключено
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center gap-2">
            {/* Baud Rate Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/70 rounded-lg px-2 py-1 text-xs">
              <span className="text-slate-400">Baud:</span>
              <select
                disabled={isConnected}
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                className="bg-transparent text-slate-200 font-mono focus:outline-none cursor-pointer disabled:opacity-50"
              >
                <option value={9600}>9600 (SNR / Cisco)</option>
                <option value={115200}>115200 (MikroTik)</option>
                <option value={57600}>57600</option>
                <option value={38400}>38400</option>
                <option value={19200}>19200</option>
              </select>
            </div>

            {/* Connect / Disconnect Button */}
            {!isConnected ? (
              <button
                onClick={handleConnect}
                disabled={isConnecting || !webSerialSupported}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {isConnecting ? 'Поиск порта...' : 'Подключить'}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                Отключить
              </button>
            )}

            {/* Send Break Signal */}
            <button
              onClick={handleSendBreak}
              disabled={!isConnected}
              title="Аппаратный Break (250ms) для входа в bootloader / сброса паролей"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition-all disabled:opacity-40 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              Break
            </button>

            {/* ZTP Drawer Toggle */}
            <button
              onClick={() => setShowZtpPanel(!showZtpPanel)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                showZtpPanel
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-amber-400" />
              ZTP Макрос
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* Clear Screen */}
            <button
              onClick={handleClearTerminal}
              title="Очистить терминал"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Copy Output */}
            <button
              onClick={handleCopyOutput}
              title="Скопировать лог"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Download Log */}
            <button
              onClick={handleDownloadLog}
              title="Скачать лог (.txt)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => {
                setIsFullscreen(!isFullscreen);
                setTimeout(() => fitAddonRef.current?.fit(), 150);
              }}
              title={isFullscreen ? 'Свернуть' : 'Во весь экран'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              title="Закрыть консоль"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Warning Banners if unsupported or insecure context */}
        {!webSerialSupported && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-rose-950/70 border-b border-rose-800 text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>Web Serial API не поддерживается вашим браузером.</strong> Для прямого доступа к USB-консоли откройте SwitchBook в Chromium-браузере (Google Chrome, Microsoft Edge, Opera, Яндекс.Браузер).
            </span>
          </div>
        )}

        {webSerialSupported && !secureContext && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/70 border-b border-amber-800 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Незащищённый контекст (HTTP).</strong> Браузер разрешает Web Serial API только по <code>https://</code> или <code>http://localhost</code>. Если вы открыли приложение по сетевому IP, перейдите через HTTPS или активируйте флаг Chrome <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>.
            </span>
          </div>
        )}

        {/* Main Body: Terminal + Collapsible ZTP Bar */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Terminal Canvas Area */}
          <div className="flex-1 flex flex-col bg-[#090d16] relative overflow-hidden">
            <div ref={terminalRef} className="flex-1 w-full h-full p-2" />

            {/* Active Streaming Overlay / Bottom Bar */}
            {isStreaming && (
              <div className="absolute bottom-2 left-4 right-4 bg-slate-900/95 border border-sky-500/40 rounded-lg p-3 shadow-xl backdrop-blur-md flex items-center justify-between gap-4 animate-in slide-in-from-bottom duration-200 z-10">
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-sky-300 font-semibold flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                      Заливка конфигурации: строка {streamProgress.current} из {streamProgress.total}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {Math.round((streamProgress.current / (streamProgress.total || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-sky-500 h-2 rounded-full transition-all duration-75"
                      style={{
                        width: `${(streamProgress.current / (streamProgress.total || 1)) * 100}%`
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate mt-1">
                    &gt; {streamProgress.line || '...'}
                  </div>
                </div>
                <button
                  onClick={handleStopStreaming}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shrink-0 cursor-pointer"
                >
                  Остановить
                </button>
              </div>
            )}
          </div>

          {/* Right/Side Collapsible ZTP Drawer */}
          {showZtpPanel && (
            <div className="w-80 sm:w-96 bg-slate-950 border-l border-slate-800 flex flex-col overflow-y-auto p-4 z-20">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Zero-Touch Provisioning
                  </h3>
                </div>
                <button
                  onClick={() => setShowZtpPanel(false)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Vendor Selector */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Вендор оборудования:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleVendorChange('snr')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                      selectedVendor === 'snr'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    SNR (SNR-OS)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVendorChange('mikrotik')}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                      selectedVendor === 'mikrotik'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    MikroTik (RouterOS)
                  </button>
                </div>
              </div>

              {/* Switch Auto-fill dropdown */}
              {switches && switches.length > 0 && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Подставить из базы SwitchBook:
                  </label>
                  <select
                    value={selectedSwitchId}
                    onChange={handleSelectSwitch}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">-- Новый коммутатор (вручную) --</option>
                    {switches.map((sw) => (
                      <option key={sw.id} value={sw.id}>
                        {sw.name} ({sw.ip || 'no ip'}) - {sw.vendor || 'Unknown'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Configuration Inputs */}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Имя хоста (Hostname):
                  </label>
                  <input
                    type="text"
                    value={ztpForm.hostname}
                    onChange={(e) => setZtpForm({ ...ztpForm, hostname: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                    placeholder="SW-CORE-01"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      IP управления:
                    </label>
                    <input
                      type="text"
                      value={ztpForm.ip}
                      onChange={(e) => setZtpForm({ ...ztpForm, ip: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      placeholder="192.168.1.10"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Маска сети:
                    </label>
                    <input
                      type="text"
                      value={ztpForm.mask}
                      onChange={(e) => setZtpForm({ ...ztpForm, mask: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      placeholder="255.255.255.0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Шлюз по умолчанию:
                    </label>
                    <input
                      type="text"
                      value={ztpForm.gateway}
                      onChange={(e) => setZtpForm({ ...ztpForm, gateway: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Management VLAN:
                    </label>
                    <input
                      type="number"
                      value={ztpForm.vlanId}
                      onChange={(e) => setZtpForm({ ...ztpForm, vlanId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Логин админа:
                    </label>
                    <input
                      type="text"
                      value={ztpForm.adminUser}
                      onChange={(e) => setZtpForm({ ...ztpForm, adminUser: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Пароль админа:
                    </label>
                    <input
                      type="password"
                      value={ztpForm.adminPassword}
                      onChange={(e) => setZtpForm({ ...ztpForm, adminPassword: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* Line Delay Slider */}
                <div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                    <span>Задержка между строками:</span>
                    <span className="font-mono text-sky-400">{lineDelayMs} мс</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="200"
                    step="10"
                    value={lineDelayMs}
                    onChange={(e) => setLineDelayMs(Number(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-auto pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  Предпросмотр команд
                </button>

                <button
                  type="button"
                  onClick={handleStartStreaming}
                  disabled={!isConnected || isStreaming}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-900/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Залить в свитч (Inject)
                </button>

                {!selectedSwitchId && (
                  <button
                    type="button"
                    onClick={handleSaveToInventory}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Сохранить в базу SwitchBook
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview and Edit Configuration Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  Предпросмотр ZTP конфигурации ({selectedVendor === 'mikrotik' ? 'MikroTik' : 'SNR'})
                </h3>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <p className="text-xs text-slate-400 mb-2">
                Вы можете проверить или отредактировать команды перед их отправкой в последовательный порт:
              </p>
              <textarea
                value={previewConfig}
                onChange={(e) => setPreviewConfig(e.target.value)}
                className="flex-1 w-full bg-slate-950 text-slate-200 font-mono text-xs p-3 rounded-lg border border-slate-800 focus:outline-none focus:border-sky-500 resize-none h-72"
                spellCheck={false}
              />
            </div>

            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-t border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewConfig);
                  toast.show('Скопировано в буфер', 'success');
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                <Copy className="w-3.5 h-3.5" />
                Скопировать текст
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                >
                  Отмена
                </button>
                <button
                  onClick={handleStartStreaming}
                  disabled={!isConnected}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Отправить в консоль
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
