import React from 'react';
import { X, Activity, HardDrive, Network } from 'lucide-react';
import { VirtualTdrTester } from './VirtualTdrTester';

/**
 * CableTestModal.jsx
 * Быстрое модальное окно запуска TDR-теста кабеля для любого медного порта
 */
export function CableTestModal({
  isOpen,
  onClose,
  switchData,
  port,
  theme = 'dark'
}) {
  if (!isOpen || !port || !switchData) return null;

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className={`w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Modal Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Аппаратный тест кабеля (TDR)
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {port.name || `Порт ${port.number}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>{switchData.name}</span>
                <span>•</span>
                <span>{switchData.model || switchData.vendor}</span>
                {switchData.ip && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-slate-400">{switchData.ip}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <VirtualTdrTester
            switchData={switchData}
            port={port}
            portNumber={port.number}
            portName={port.name || `Порт ${port.number}`}
            connectedSocket={port.connectedTo || `Р-${port.number}`}
            cableLength="25м"
            speed={port.speed || '1G'}
            theme={theme}
          />
        </div>

        {/* Modal Footer */}
        <div className={`p-3.5 border-t flex items-center justify-end shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
