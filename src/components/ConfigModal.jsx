import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Terminal,
  Download,
  Settings2,
  Sliders,
  Shield,
  Layers,
  Globe,
  Server,
  Zap,
  Info,
  CheckCircle2,
  Play,
  GitCompare
} from 'lucide-react';
import { generateSwitchConfig } from '../utils/configGenerator';

export function ConfigModal({ isOpen, onClose, switchData, vlans = [], onOpenBackupModal, theme = 'dark' }) {
  if (!isOpen || !switchData) return null;

  const isLight = theme === 'light';

  // Vendor Syntax
  const initialVendor = (switchData.vendor || 'MikroTik');
  const [selectedVendor, setSelectedVendor] = useState(() => {
    if (initialVendor.toLowerCase().includes('mikrotik')) return 'MikroTik';
    if (initialVendor.toLowerCase().includes('cisco')) return 'Cisco';
    if (initialVendor.toLowerCase().includes('snr')) return 'SNR';
    if (initialVendor.toLowerCase().includes('ubiquiti') || initialVendor.toLowerCase().includes('unifi')) return 'Ubiquiti';
    return 'MikroTik';
  });

  // Provisioning Parameters & Toggles
  const [mgmtVlanId, setMgmtVlanId] = useState(10);
  const [mgmtIp, setMgmtIp] = useState(switchData.ip || '192.168.10.10/24');
  const [mgmtGateway, setMgmtGateway] = useState('192.168.10.1');
  const [enableStp, setEnableStp] = useState(true);
  const [enableSnmp, setEnableSnmp] = useState(true);
  const [enableNtp, setEnableNtp] = useState(true);
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [includeComments, setIncludeComments] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  const configText = useMemo(() => {
    return generateSwitchConfig(switchData, vlans, selectedVendor, {
      mgmtVlanId: parseInt(mgmtVlanId) || 10,
      mgmtIp,
      mgmtGateway,
      enableStp,
      enableSnmp,
      enableNtp,
      snmpCommunity,
      includeComments
    });
  }, [switchData, vlans, selectedVendor, mgmtVlanId, mgmtIp, mgmtGateway, enableStp, enableSnmp, enableNtp, snmpCommunity, includeComments]);

  const handleCopy = () => {
    navigator.clipboard.writeText(configText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let ext = 'cfg';
    if (selectedVendor === 'MikroTik') ext = 'rsc';
    else if (selectedVendor === 'Cisco') ext = 'ios.txt';
    else if (selectedVendor === 'SNR') ext = 'snr.cfg';
    else if (selectedVendor === 'Ubiquiti') ext = 'esw.cfg';

    const blob = new Blob([configText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${switchData.name}-${selectedVendor.toLowerCase()}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalLines = configText.split('\n').length;
  const totalChars = configText.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  CLI Auto-Provisioning & Config Generator
                </h2>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Ready-to-Deploy
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Генерация чистого исполняемого конфига для <strong className="font-mono text-slate-800 dark:text-slate-200">{switchData.name}</strong> ({switchData.model})
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

        {/* Toolbar: Syntax selector & Options Toggle */}
        <div className={`px-5 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Вендор:</span>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800">
              {[
                { id: 'MikroTik', label: 'MikroTik ROS v7' },
                { id: 'SNR', label: 'SNR (NAG)' },
                { id: 'Cisco', label: 'Cisco IOS' },
                { id: 'Ubiquiti', label: 'UniFi / Edge' }
              ].map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVendor(v.id)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedVendor === v.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                showOptions
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                  : isLight ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Параметры деплоя</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 mr-1 hidden sm:inline">
              {totalLines} строк • {(totalChars / 1024).toFixed(1)} КБ
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className={`h-9 px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать</span>
            </button>
            {onOpenBackupModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBackupModal(switchData);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isLight ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
                }`}
                title="История ревизий и сравнение конфигураций (Diff)"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Бэкапы & Diff</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Deployment Options Panel */}
        {showOptions && (
          <div className={`p-4 border-b grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/90 border-slate-800'
          }`}>
            <div>
              <label className="block text-slate-500 font-semibold mb-1">VLAN управления:</label>
              <select
                value={mgmtVlanId}
                onChange={(e) => setMgmtVlanId(e.target.value)}
                className={`w-full h-8 px-2 rounded-lg border text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                }`}
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.id}>VLAN {v.id} ({v.name})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-500 font-semibold mb-1">IP адрес устройства:</label>
              <input
                type="text"
                value={mgmtIp}
                onChange={(e) => setMgmtIp(e.target.value)}
                placeholder="192.168.10.10/24"
                className={`w-full h-8 px-2 rounded-lg border font-mono text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-500 font-semibold mb-1">Основной шлюз:</label>
              <input
                type="text"
                value={mgmtGateway}
                onChange={(e) => setMgmtGateway(e.target.value)}
                placeholder="192.168.10.1"
                className={`w-full h-8 px-2 rounded-lg border font-mono text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-500 font-semibold mb-1">SNMP Community (RO):</label>
              <input
                type="text"
                value={snmpCommunity}
                onChange={(e) => setSnmpCommunity(e.target.value)}
                placeholder="public"
                className={`w-full h-8 px-2 rounded-lg border font-mono text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'
                }`}
              />
            </div>

            {/* Checkbox toggles */}
            <div className="sm:col-span-2 md:col-span-4 flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableStp}
                  onChange={(e) => setEnableStp(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="text-slate-600 dark:text-slate-300">RSTP / Spanning Tree</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSnmp}
                  onChange={(e) => setEnableSnmp(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="text-slate-600 dark:text-slate-300">Включить SNMP агент</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableNtp}
                  onChange={(e) => setEnableNtp(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="text-slate-600 dark:text-slate-300">Синхронизация NTP</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeComments}
                  onChange={(e) => setIncludeComments(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="text-slate-600 dark:text-slate-300">Включать описания и комментарии портов</span>
              </label>
            </div>
          </div>
        )}

        {/* Code Content Area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed select-all">
          <pre className="whitespace-pre">
            <code>{configText}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>Конфиг готов для вставки в терминал SSH, Telnet или WinBox Script / Terminal</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`h-9 px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Закрыть
            </button>
            <button
              onClick={handleCopy}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Скопировано!' : 'Копировать всё'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
