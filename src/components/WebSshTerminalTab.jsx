import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Terminal as TerminalIcon, Copy, Download, RefreshCw, Send, Check, 
  Shield, Zap, AlertTriangle, Radio
} from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getAuthToken } from '../api';

export default function WebSshTerminalTab({
  switchData,
  theme = 'dark'
}) {
  if (!switchData) return null;

  const isLight = theme === 'light';
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const fitAddonRef = useRef(null);
  const socketRef = useRef(null);
  const sessionLogRef = useRef('');

  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'fallback'
  const [statusMessage, setStatusMessage] = useState('Установка соединения...');
  const [copied, setCopied] = useState(false);

  // Default credentials
  const [credentials, setCredentials] = useState({
    username: 'admin',
    password: '',
    port: 22,
    forceSimulation: false
  });

  const vendor = (switchData.vendor || 'MikroTik').toLowerCase();

  // Vendor CLI quick shortcuts
  const vendorShortcuts = useMemo(() => {
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

  const connectTerminal = () => {
    setConnectionStatus('connecting');
    setStatusMessage(`Подключение к ${switchData.name} (${switchData.ip || '192.168.10.1'}:${credentials.port})...`);
    sessionLogRef.current = '';

    if (socketRef.current) {
      try { socketRef.current.close(); } catch {}
      socketRef.current = null;
    }

    if (!xtermInstance.current && terminalRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 12,
        fontFamily: 'Consolas, "JetBrains Mono", "Cascadia Code", Menlo, monospace',
        lineHeight: 1.2,
        theme: {
          background: isLight ? '#0f172a' : '#030712',
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

      term.onData((data) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'data', data }));
        }
      });
    } else if (xtermInstance.current) {
      xtermInstance.current.reset();
    }

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
          sessionLogRef.current += msg.data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        } else if (msg.type === 'status') {
          setConnectionStatus(msg.status);
          if (msg.message) setStatusMessage(msg.message);
        }
      } catch {
        if (xtermInstance.current) {
          xtermInstance.current.write(event.data);
        }
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      setStatusMessage('Ошибка WebSocket соединения.');
    };

    ws.onclose = (event) => {
      if (connectionStatus !== 'fallback') {
        setConnectionStatus('disconnected');
        setStatusMessage(`Соединение закрыто (код: ${event.code || 'Normal'}).`);
      }
    };
  };

  useEffect(() => {
    connectTerminal();

    const handleResize = () => {
      if (fitAddonRef.current && xtermInstance.current) {
        try {
          fitAddonRef.current.fit();
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'resize',
              cols: xtermInstance.current.cols,
              rows: xtermInstance.current.rows
            }));
          }
        } catch {}
      }
    };

    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 150);

    return () => {
      clearTimeout(timer);
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

  const sendQuickCommand = (cmd) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'data', data: cmd }));
    }
  };

  const handleCopyLog = () => {
    if (!sessionLogRef.current) return;
    navigator.clipboard.writeText(sessionLogRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLog = () => {
    if (!sessionLogRef.current) return;
    const blob = new Blob([sessionLogRef.current], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ssh_session_${switchData.name}_${new Date().toISOString().slice(0, 10)}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex flex-col h-full font-mono text-xs ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'}`}>
      {/* Terminal Toolbar */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between flex-wrap gap-2 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-black/20">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
              connectionStatus === 'fallback' ? 'bg-blue-400' :
              connectionStatus === 'connecting' ? 'bg-amber-400 animate-spin' : 'bg-rose-500'
            }`} />
            <span className="text-slate-300">
              {connectionStatus === 'connected' ? 'SSH Live' :
               connectionStatus === 'fallback' ? 'Лаб. эмулятор' :
               connectionStatus === 'connecting' ? 'Подключение...' : 'Отключено'}
            </span>
          </div>

          <span className="text-slate-400 font-sans text-xs">
            {switchData.name} ({switchData.ip || '192.168.10.1'})
          </span>

          <button
            onClick={connectTerminal}
            className={`p-1 rounded-md border text-slate-400 hover:text-white transition-colors ${
              isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-700'
            }`}
            title="Переподключиться"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1.5 font-sans">
          <button
            onClick={handleCopyLog}
            className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 border transition-colors ${
              copied 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700')
            }`}
            title="Скопировать лог сессии"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>

          <button
            onClick={handleDownloadLog}
            className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 border transition-colors ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Скачать лог в файл"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Лог</span>
          </button>
        </div>
      </div>

      {/* Quick Vendor Shortcuts */}
      <div className={`px-3 py-1 flex items-center gap-1.5 border-b overflow-x-auto text-[11px] font-sans ${
        isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
      }`}>
        <span className="text-slate-400 text-[10px] uppercase font-bold shrink-0">Быстрый ввод:</span>
        {vendorShortcuts.map((sc, i) => (
          <button
            key={i}
            onClick={() => sendQuickCommand(sc.cmd)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono whitespace-nowrap transition-colors ${
              isLight 
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {sc.label}
          </button>
        ))}
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 bg-[#030712] p-2 overflow-hidden relative">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
}
