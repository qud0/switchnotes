import React, { useState } from 'react';
import { 
  Terminal, Activity, ChevronDown, ChevronUp, Maximize2, 
  Minimize2, X, Radio, Layers, Wrench
} from 'lucide-react';
import LiveWebPcap from './LiveWebPcap';
import CircuitXRayTab from './CircuitXRayTab';

export default function DockableConsole({
  isOpen,
  onClose,
  switchId,
  port,
  theme = 'dark'
}) {
  const [activeTab, setActiveTab] = useState('pcap'); // 'pcap' | 'xray'
  const [isMinimized, setIsMinimized] = useState(false);
  const [heightMode, setHeightMode] = useState('medium'); // 'compact' (240px) | 'medium' (380px) | 'expanded' (560px)

  if (!isOpen || !port) return null;

  const isLight = theme === 'light';

  const getHeightClass = () => {
    if (isMinimized) return 'h-10';
    switch (heightMode) {
      case 'compact': return 'h-64';
      case 'expanded': return 'h-[580px]';
      case 'medium':
      default: return 'h-96';
    }
  };

  const cycleHeight = () => {
    if (heightMode === 'compact') setHeightMode('medium');
    else if (heightMode === 'medium') setHeightMode('expanded');
    else setHeightMode('compact');
  };

  return (
    <div 
      className={`w-full transition-all duration-200 border-t shadow-2xl flex flex-col z-30 ${getHeightClass()} ${
        isLight 
          ? 'bg-white border-slate-300 text-slate-800' 
          : 'bg-slate-950 border-slate-800 text-slate-100'
      }`}
    >
      {/* Console Top Header Bar */}
      <div className={`px-4 py-1.5 flex items-center justify-between border-b select-none shrink-0 ${
        isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        {/* Left Tabs */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2 mr-3 font-sans font-bold text-xs text-blue-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Инспектор порта {port.name || `Port ${port.portNum}`}</span>
          </div>

          <button
            onClick={() => { setActiveTab('pcap'); setIsMinimized(false); }}
            className={`px-3 py-1 rounded-lg font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'pcap' && !isMinimized
                ? (isLight ? 'bg-white text-blue-700 shadow-sm' : 'bg-blue-600 text-white shadow-md shadow-blue-500/20')
                : (isLight ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-slate-800')
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Web-PCAP (Wireshark)</span>
          </button>

          <button
            onClick={() => { setActiveTab('xray'); setIsMinimized(false); }}
            className={`px-3 py-1 rounded-lg font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'xray' && !isMinimized
                ? (isLight ? 'bg-white text-blue-700 shadow-sm' : 'bg-blue-600 text-white shadow-md shadow-blue-500/20')
                : (isLight ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-slate-800')
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>L1–L3 X-Ray Тракт</span>
          </button>
        </div>

        {/* Right Window Controls */}
        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={cycleHeight}
            className={`p-1.5 rounded-md hover:text-white transition-colors ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}
            title="Изменить высоту панели"
          >
            {heightMode === 'expanded' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className={`p-1.5 rounded-md hover:text-white transition-colors ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}
            title={isMinimized ? 'Развернуть консоль' : 'Свернуть консоль'}
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-md hover:text-rose-400 transition-colors ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}
            title="Закрыть консоль"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Panel Content (Hidden if minimized) */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'pcap' ? (
            <LiveWebPcap 
              switchId={switchId} 
              port={port} 
              theme={theme} 
            />
          ) : (
            <CircuitXRayTab 
              switchId={switchId} 
              port={port} 
              theme={theme} 
            />
          )}
        </div>
      )}
    </div>
  );
}
