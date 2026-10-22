import React, { useState } from 'react';
import { X, Upload, Check, AlertCircle, FileCode, Sparkles } from 'lucide-react';

export function ImportConfigModal({ isOpen, onClose, onImport, theme = 'dark' }) {
  if (!isOpen) return null;

  const [rawText, setRawText] = useState('');
  const [vendor, setVendor] = useState('auto');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [error, setError] = useState('');
  const isLight = theme === 'light';

  const parseConfig = () => {
    setError('');
    if (!rawText.trim()) {
      setError('Вставьте текст конфигурации');
      return;
    }

    try {
      const text = rawText;
      let detectedVendor = vendor;

      if (detectedVendor === 'auto') {
        if (text.includes('/interface') || text.includes('/system') || text.includes('bridge')) {
          detectedVendor = 'MikroTik';
        } else if (text.includes('SNR') || text.includes('switchport')) {
          detectedVendor = 'SNR';
        } else if (text.includes('vlan participation') || text.includes('vlan pvid')) {
          detectedVendor = 'Ubiquiti';
        } else {
          detectedVendor = 'SNR';
        }
      }

      // 1. Hostname detection
      let hostname = 'imported-switch';
      const hostMatch = text.match(/hostname\s+([^\r\n]+)/i) || text.match(/name="?([^"\r\n]+)"?/i);
      if (hostMatch) {
        hostname = hostMatch[1].trim();
      }

      const ports = [];

      // 2. MikroTik Parsing
      if (detectedVendor === 'MikroTik') {
        const portRegex = /add\s+bridge=\S+\s+interface=([^\s]+)(?:.*pvid=(\d+))?(?:.*comment="([^"]*)")?/gi;
        let match;
        let pIndex = 1;

        while ((match = portRegex.exec(text)) !== null) {
          const iface = match[1];
          const pvid = match[2] ? parseInt(match[2]) : 1;
          const comment = match[3] || '';

          ports.push({
            id: `p${pIndex}`,
            number: pIndex,
            name: iface,
            type: iface.includes('sfp') ? 'sfp' : 'rj45',
            mode: 'access',
            pvid: pvid,
            taggedVlans: [],
            description: comment,
            connectedTo: '',
            speed: '1G',
            poe: false,
            enabled: true
          });
          pIndex++;
        }

        // Parse bridge vlan tagged ports
        const vlanRegex = /add\s+bridge=\S+\s+vlan-ids=(\d+)(?:.*tagged="?([^"\r\n]+)"?)?/gi;
        let vMatch;
        while ((vMatch = vlanRegex.exec(text)) !== null) {
          const vId = parseInt(vMatch[1]);
          const taggedStr = vMatch[2] || '';
          const taggedIfaces = taggedStr.split(',').map(s => s.trim());

          ports.forEach(p => {
            if (taggedIfaces.includes(p.name)) {
              p.mode = 'trunk';
              if (!p.taggedVlans.includes(vId)) {
                p.taggedVlans.push(vId);
              }
            }
          });
        }
      } else {
        // 3. SNR / Cisco / Ubiquiti Interface Parsing
        const lines = text.split('\n');
        let currentPort = null;
        let pIndex = 1;

        for (let line of lines) {
          const trimmed = line.trim();
          const ifaceMatch = trimmed.match(/^interface\s+([^\r\n]+)/i);

          if (ifaceMatch) {
            if (currentPort) {
              ports.push(currentPort);
            }
            const ifName = ifaceMatch[1].trim();
            currentPort = {
              id: `p${pIndex}`,
              number: pIndex,
              name: ifName,
              type: ifName.toLowerCase().includes('ten') || ifName.toLowerCase().includes('sfp') ? 'sfp' : 'rj45',
              mode: 'access',
              pvid: 1,
              taggedVlans: [],
              description: '',
              connectedTo: '',
              speed: '1G',
              poe: false,
              enabled: true
            };
            pIndex++;
            continue;
          }

          if (currentPort) {
            const descMatch = trimmed.match(/^description\s+"?([^"\r\n]+)"?/i);
            if (descMatch) {
              currentPort.description = descMatch[1].trim();
            }

            if (trimmed.includes('switchport mode trunk') || trimmed.includes('vlan participation tagged')) {
              currentPort.mode = 'trunk';
            }

            const pvidMatch = trimmed.match(/(?:access vlan|vlan pvid|native vlan)\s+(\d+)/i);
            if (pvidMatch) {
              currentPort.pvid = parseInt(pvidMatch[1]);
            }

            const allowedMatch = trimmed.match(/allowed vlan\s+([0-9,\s-]+)/i);
            if (allowedMatch) {
              currentPort.mode = 'trunk';
              const rawVlans = allowedMatch[1].split(',');
              rawVlans.forEach(part => {
                const range = part.trim().split('-');
                if (range.length === 2) {
                  const start = parseInt(range[0]);
                  const end = parseInt(range[1]);
                  for (let i = start; i <= end; i++) {
                    if (!currentPort.taggedVlans.includes(i)) currentPort.taggedVlans.push(i);
                  }
                } else {
                  const v = parseInt(part.trim());
                  if (!isNaN(v) && !currentPort.taggedVlans.includes(v)) {
                    currentPort.taggedVlans.push(v);
                  }
                }
              });
            }

            if (trimmed.includes('shutdown')) {
              currentPort.enabled = false;
            }
          }
        }

        if (currentPort) {
          ports.push(currentPort);
        }
      }

      if (ports.length === 0) {
        setError('Не удалось распознать интерфейсы. Убедитесь, что текст содержит блоки interface или /interface bridge.');
        return;
      }

      const copper = ports.filter(p => p.type !== 'sfp').length;
      const sfp = ports.filter(p => p.type === 'sfp').length;

      setParsedPreview({
        name: hostname,
        vendor: detectedVendor,
        model: `${detectedVendor} ${ports.length}P Switch`,
        copperPorts: copper || 24,
        sfpPorts: sfp || 0,
        ports: ports,
        location: 'Импортировано из конфига'
      });
    } catch (err) {
      setError(`Ошибка парсинга: ${err.message}`);
    }
  };

  const handleApply = () => {
    if (!parsedPreview) return;
    onImport(parsedPreview);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                Быстрый импорт из CLI-конфига
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Вставьте вывод show running-config (SNR/Ubiquiti) или export (MikroTik)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Текст конфигурации
            </label>
            <textarea
              rows="8"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setParsedPreview(null);
              }}
              placeholder={`Пример для SNR:
hostname sw-dist-01
!
interface GigabitEthernet 1/0/1
 description Workstation-1
 switchport mode access
 switchport access vlan 20
!
interface TenGigabitEthernet 1/0/1
 description Uplink-Core
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30`}
              className={`w-full border rounded-xl p-3 text-xs font-mono focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={parseConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Распознать конфигурацию
            </button>
          </div>

          {/* Preview of parsed data */}
          {parsedPreview && (
            <div className={`p-4 rounded-xl border space-y-2 ${
              isLight ? 'bg-emerald-50/60 border-emerald-200' : 'bg-emerald-950/20 border-emerald-900/40'
            }`}>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <Check className="w-4 h-4" />
                <span>Успешно распознано:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div>Имя: <strong className="font-mono text-slate-900 dark:text-white">{parsedPreview.name}</strong></div>
                <div>Вендор: <strong className="font-mono text-slate-900 dark:text-white">{parsedPreview.vendor}</strong></div>
                <div>Распознано портов: <strong className="font-mono text-slate-900 dark:text-white">{parsedPreview.ports.length}</strong></div>
                <div>Trunk-портов: <strong className="font-mono text-slate-900 dark:text-white">{parsedPreview.ports.filter(p => p.mode === 'trunk').length}</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-end gap-2 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Отмена
          </button>
          <button
            disabled={!parsedPreview}
            onClick={handleApply}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg shadow-sm cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Создать коммутатор
          </button>
        </div>
      </div>
    </div>
  );
}
