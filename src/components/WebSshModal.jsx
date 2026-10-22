import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, Copy, Download, RefreshCw, Send, Check, Shield, Sliders, Zap, AlertTriangle, Monitor } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getAuthToken } from '../api';

export default function WebSshModal({
  isOpen,
  onClose,
  switchData,
  theme = 'dark'
}) {
  if (!isOpen || !switchData) return null;

  const isLight = theme === 'light';
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);
  const sessionLogRef = useRef('');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'fallback'
  const [statusMessage, setStatusMessage] = useState('Установка соединения...');
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // SSH Credentials
  const [credentials, setCredentials] = useState({
    username: 'admin',
    password: '',
    port: 22,
    forceSimulation: false
  });

  const vendor = (switchData.vendor || 'MikroTik').toLowerCase();

  // Быстрые команды вендора
  const vendorShortcuts = React.useMemo(() => {
    if (vendor.includes('mikrotik')) {
      return [
        { label: '/interface print', cmd: '/interface print\r' },
        { label: '/system resource print', cmd: '/system resource print\r' },
        { label: '/ip address print', cmd: '/ip address print\r' },
        { label: '/interface bridge vlan print', cmd: '/interface bridge vlan print\r' },
        { label: '/export compact', cmd: '/export compact\r' }
      ];
    }
    if (vendor.includes('snr')) {
      return [
        { label: 'show version', cmd: 'show version\r' },
        { label: 'show running-config', cmd: 'show running-config\r' },
        { label: 'show mac-address-table', cmd: 'show mac-address-table\r' },
        { label: 'show ip int brief', cmd: 'show ip interface brief\r' },
        { label: 'show vlan', cmd: 'show vlan\r' }
      ];
    }
    if (vendor.includes('ubiquiti') || vendor.includes('unifi')) {
      return [
        { label: 'show version', cmd: 'show version\r' },
        { label: 'show running-config', cmd: 'show running-config\r' },
        { label: 'show vlan', cmd: 'show vlan\r' },
        { label: 'show mac-addr-table', cmd: 'show mac-addr-table\r' }
      ];
    }
    return [
      { label: 'show version', cmd: 'show version\r' },
      { label: 'show running-config', cmd: 'show running-config\r' },
      { label: 'show ip int brief', cmd: 'show ip int brief\r' }
    ];
  }, [vendor]);

  // Инициализация xterm и WebSocket
  const connectTerminal = () => {
    setConnectionStatus('connecting');
    setStatusMessage(`Подключение к ${switchData.name} (${switchData.ip || '192.168.10.1'}:${credentials.port})...`);
    sessionLogRef.current = '';

    // Очистить старый сокет
    if (socketRef.current) {
      try { socketRef.current.close(); } catch {}
      socketRef.current = null;
    }

    // Инициализировать xterm.js если еще не создан
    if (!xtermInstance.current && terminalRef.current) {
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

      // Пересылка ввода с клавиатуры в сокет
      term.onData((data) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'data', data }));
        }
      });
    } else if (xtermInstance.current) {
      xtermInstance.current.reset();
    }

    // Определяем URL WebSocket сервера (поддержка прямого порта 3050, обратных прокси и режима разработки Vite 5173)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.port === '5173'
      ? `${window.location.hostname}:3050`
      : (window.location.host || 'localhost:3050');
    const token = getAuthToken();
    const wsUrl = `${wsProtocol}//${wsHost}/ws/ssh?switchId=${switchData.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      const cols = xtermInstance.current ? xtermInstance.current.cols : 80;
      const rows = xtermInstance.current ? xtermInstance.current.rows : 24;

      // Отправляем первое инициализирующее сообщение
      ws.send(JSON.stringify({
        type: 'init',
        switchId: switchData.id,
        host: switchData.ip || '192.168.10.1',
        port: parseInt(credentials.port) || 22,
        username: credentials.username || 'admin',
        password: credentials.password || '',
        cols,
        rows,
        forceSimulation: credentials.forceSimulation
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          if (xtermInstance.current) {
            xtermInstance.current.write(msg.data);
          }
          // Сохраняем в текстовый лог сессии для скачивания (удаляя ANSI escape последовательности)
          sessionLogRef.current += msg.data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        } else if (msg.type === 'status') {
          setConnectionStatus(msg.status);
          if (msg.message) setStatusMessage(msg.message);
        }
      } catch (err) {
        // Обычные сырые текстовые данные
        if (xtermInstance.current) {
          xtermInstance.current.write(event.data);
        }
        sessionLogRef.current += event.data;
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      setStatusMessage('Соединение разорвано');
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      setStatusMessage('Ошибка подключения к WebSocket серверу');
    };
  };

  useEffect(() => {
    connectTerminal();

    const handleResize = () => {
      if (fitAddonRef.current && xtermInstance.current) {
        fitAddonRef.current.fit();
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'resize',
            cols: xtermInstance.current.cols,
            rows: xtermInstance.current.rows
          }));
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        try { socketRef.current.close(); } catch {}
      }
      if (xtermInstance.current) {
        try { xtermInstance.current.dispose(); } catch {}
        xtermInstance.current = null;
      }
    };
  }, [switchData.id]);

  // Адаптация терминала при переключении Fullscreen
  useEffect(() => {
    setTimeout(() => {
      if (fitAddonRef.current && xtermInstance.current) {
        fitAddonRef.current.fit();
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'resize',
            cols: xtermInstance.current.cols,
            rows: xtermInstance.current.rows
          }));
        }
      }
    }, 150);
  }, [isFullscreen]);

  const sendShortcutCommand = (cmd) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'data', data: cmd }));
      if (xtermInstance.current) xtermInstance.current.focus();
    }
  };

  const handleClearTerminal = () => {
    if (xtermInstance.current) {
      xtermInstance.current.clear();
      sendShortcutCommand('\x0c'); // Ctrl+L
    }
  };

  const handleCopyLog = () => {
    if (!sessionLogRef.current) return;
    navigator.clipboard.writeText(sessionLogRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLog = () => {
    const text = sessionLogRef.current || 'Сессия пуста';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ssh-session-${switchData.name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className={`flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-2 z-50 w-[calc(100vw-16px)] h-[calc(100vh-16px)]'
          : 'w-full max-w-5xl h-[85vh]'
      } ${
        isLight ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800'
      }`}>
        {/* Terminal Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 select-none">
          {/* Left: Device status */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <TerminalIcon className="w-4 h-4" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm font-mono tracking-wide">
                  {switchData.name}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                  {switchData.vendor}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {switchData.ip || '192.168.10.1'}:{credentials.port}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] mt-0.5">
                <span className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                    : connectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-400'
                }`} />
                <span className={`font-mono ${
                  connectionStatus === 'connected'
                    ? 'text-emerald-400 font-semibold'
                    : connectionStatus === 'connecting'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}>
                  {statusMessage}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                showSettings ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title="Параметры подключения SSH"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Параметры</span>
            </button>

            <button
              type="button"
              onClick={handleClearTerminal}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
              title="Очистить терминал (Ctrl+L)"
            >
              Очистить
            </button>

            <button
              type="button"
              onClick={handleCopyLog}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
              title="Копировать текст сессии в буфер"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadLog}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
              title="Скачать лог терминала в файл"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Лог</span>
            </button>

            <button
              type="button"
              onClick={connectTerminal}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
              title="Переподключить сессию SSH"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
              title={isFullscreen ? 'Свернуть' : 'На весь экран'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors ml-1"
              title="Закрыть терминал"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Macros Bar */}
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto text-xs shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 font-semibold text-[11px] mr-1 hidden sm:inline">Макросы:</span>
            {vendorShortcuts.map((sc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => sendShortcutCommand(sc.cmd)}
                className="h-6 px-2.5 rounded-md bg-slate-800/80 hover:bg-blue-600 text-slate-300 hover:text-white font-mono text-[11px] transition-colors cursor-pointer border border-slate-700/60"
              >
                {sc.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono shrink-0">
            <span className="hidden md:inline">Ctrl+C прерывание</span>
            <span>•</span>
            <span className="text-emerald-400">VT100 / xterm-256color</span>
          </div>
        </div>

        {/* Credentials Settings Flyout */}
        {showSettings && (
          <div className="p-4 bg-slate-900 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs shrink-0 animate-in fade-in duration-100">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Пользователь:</label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Пароль SSH:</label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">SSH Порт:</label>
              <input
                type="number"
                value={credentials.port}
                onChange={(e) => setCredentials(prev => ({ ...prev, port: parseInt(e.target.value) || 22 }))}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setShowSettings(false);
                  connectTerminal();
                }}
                className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Переподключиться</span>
              </button>
            </div>
          </div>
        )}

        {/* Main xterm.js Terminal Container */}
        <div className="flex-1 p-2 bg-[#090d16] overflow-hidden relative">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
