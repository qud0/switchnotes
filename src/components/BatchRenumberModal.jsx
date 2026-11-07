import React, { useState } from 'react';
import { Tag, X, Check, RefreshCw, Hash, Sliders, Layers } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export function BatchRenumberModal({
  isOpen,
  onClose,
  patchPanels = [],
  onSuccess,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  const [selectedPanelId, setSelectedPanelId] = useState(patchPanels[0]?.id || '');
  const [template, setTemplate] = useState('PP-{PANEL_NUM}:{PORT:2}');
  const [socketTemplate, setSocketTemplate] = useState('Р-{PORT}');
  const [startPort, setStartPort] = useState(1);
  const [endPort, setEndPort] = useState(24);
  const [roomPrefix, setRoomPrefix] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const currentPanel = patchPanels.find(p => p.id === selectedPanelId) || patchPanels[0];
  const maxPorts = currentPanel?.ports?.length || 24;

  // Generate preview of marks
  const previewItems = [];
  const panelIndex = patchPanels.findIndex(p => p.id === selectedPanelId) + 1;
  const panelNum = String(panelIndex).padStart(2, '0');

  const sPort = Math.max(1, parseInt(startPort) || 1);
  const ePort = Math.min(maxPorts, parseInt(endPort) || maxPorts);

  for (let p = sPort; p <= Math.min(sPort + 5, ePort); p++) {
    const port2 = String(p).padStart(2, '0');
    const port3 = String(p).padStart(3, '0');
    const mark = template
      .replace(/{PORT}/g, p)
      .replace(/{PORT:2}/g, port2)
      .replace(/{PORT:3}/g, port3)
      .replace(/{PANEL}/g, currentPanel?.name || 'PP')
      .replace(/{PANEL_NUM}/g, panelNum);

    const socket = socketTemplate
      .replace(/{PORT}/g, p)
      .replace(/{PORT:2}/g, port2)
      .replace(/{PORT:3}/g, port3)
      .replace(/{PANEL}/g, currentPanel?.name || 'PP');

    previewItems.push({ port: p, mark, socket });
  }

  const handleApply = async () => {
    if (!currentPanel) return;
    try {
      setIsSaving(true);
      const updates = [];

      for (let p = sPort; p <= ePort; p++) {
        const portObj = currentPanel.ports?.find(port => port.number === p);
        if (!portObj) continue;

        const port2 = String(p).padStart(2, '0');
        const port3 = String(p).padStart(3, '0');

        const newMark = template
          .replace(/{PORT}/g, p)
          .replace(/{PORT:2}/g, port2)
          .replace(/{PORT:3}/g, port3)
          .replace(/{PANEL}/g, currentPanel.name || 'PP')
          .replace(/{PANEL_NUM}/g, panelNum);

        const newSocket = socketTemplate
          .replace(/{PORT}/g, p)
          .replace(/{PORT:2}/g, port2)
          .replace(/{PORT:3}/g, port3)
          .replace(/{PANEL}/g, currentPanel.name || 'PP');

        const updateData = {
          cableMark: newMark,
          socket: newSocket
        };
        if (roomPrefix.trim()) {
          updateData.room = roomPrefix.trim();
        }

        updates.push(api.updatePatchPanelPort(currentPanel.id, portObj.id || `p${p}`, updateData));
      }

      await Promise.all(updates);
      toast.success('Маркировка портов успешно обновлена');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(`Ошибка применения маркировки: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Пакетная маркировка кабелей (TIA-606-C / ГОСТ)
              </h2>
              <p className="text-xs text-slate-500">
                Автоматическая нумерация портов и розеток по единому стандарту
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Patch Panel Select */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">Патч-панель</label>
            <select
              value={selectedPanelId}
              onChange={(e) => {
                setSelectedPanelId(e.target.value);
                const p = patchPanels.find(x => x.id === e.target.value);
                if (p) setEndPort(p.ports?.length || 24);
              }}
              className={`w-full h-9 px-3 rounded-xl border outline-none cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            >
              {patchPanels.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.ports?.length || 24} портов)</option>
              ))}
            </select>
          </div>

          {/* Port range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">С порта #</label>
              <input
                type="number"
                min="1"
                max={maxPorts}
                value={startPort}
                onChange={(e) => setStartPort(e.target.value)}
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1.5">По порт #</label>
              <input
                type="number"
                min="1"
                max={maxPorts}
                value={endPort}
                onChange={(e) => setEndPort(e.target.value)}
                className={`w-full h-9 px-3 rounded-xl border outline-none font-mono ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>
          </div>

          {/* Marking Template */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">
              Шаблон бирки кабеля (Маркер)
            </label>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="PP-{PANEL_NUM}:{PORT:2}"
              className={`w-full h-9 px-3 rounded-xl border outline-none font-mono font-bold ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] text-slate-400">
              <span className="cursor-pointer hover:text-blue-400 underline" onClick={() => setTemplate('PP-{PANEL_NUM}:{PORT:2}')}>
                PP-01:01
              </span>
              <span>•</span>
              <span className="cursor-pointer hover:text-blue-400 underline" onClick={() => setTemplate('К-{PORT}')}>
                К-1
              </span>
              <span>•</span>
              <span className="cursor-pointer hover:text-blue-400 underline" onClick={() => setTemplate('CABLE-{PANEL}-{PORT:2}')}>
                CABLE-PP1-01
              </span>
            </div>
          </div>

          {/* Socket Template */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">
              Шаблон настенной розетки (Socket)
            </label>
            <input
              type="text"
              value={socketTemplate}
              onChange={(e) => setSocketTemplate(e.target.value)}
              placeholder="Р-{PORT}"
              className={`w-full h-9 px-3 rounded-xl border outline-none font-mono font-bold ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          {/* Room Prefix (Optional) */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">
              Помещение / Кабинет (опционально для всех линий)
            </label>
            <input
              type="text"
              value={roomPrefix}
              onChange={(e) => setRoomPrefix(e.target.value)}
              placeholder="Офис 301 / Серверная"
              className={`w-full h-9 px-3 rounded-xl border outline-none ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
              }`}
            />
          </div>

          {/* Live Preview Strip */}
          <div className={`p-3 rounded-xl border ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Пример генерации (первые линии):
            </span>
            <div className="space-y-1 font-mono text-xs">
              {previewItems.map(item => (
                <div key={item.port} className="flex items-center justify-between">
                  <span className="text-slate-500">Порт #{item.port}:</span>
                  <span className="font-bold text-purple-400">{item.mark}</span>
                  <span className="text-slate-400">➔ Розетка {item.socket}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-end gap-2.5 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isSaving}
            className="h-9 px-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-500/20"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Применение...' : 'Применить к портам'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
