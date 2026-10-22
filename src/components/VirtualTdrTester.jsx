import React, { useState } from 'react';
import {
  Wrench,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Play,
  RotateCcw,
  Zap,
  Info,
  Sliders,
  Layers,
  ArrowRight
} from 'lucide-react';

/**
 * Virtual TDR (Time Domain Reflectometry) Cable Diagnostic Tool
 * Simulates enterprise switch cable diagnostics (MikroTik / Cisco / SNR Virtual Cable Tester)
 */
export function VirtualTdrTester({
  portNumber,
  portName = '',
  connectedSocket = '',
  cableLength = '25м',
  speed = '1G',
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [injectFault, setInjectFault] = useState('none'); // 'none' | 'open_pair2' | 'short_pair4' | 'crosstalk'

  const estimatedMeters = parseInt(cableLength) || 28;

  const runTdrDiagnostics = () => {
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      let pairs = [];
      let status = 'ok';
      let overallMessage = 'Все 4 витые пары кабеля Cat.6 в норме. Волновое сопротивление 100 Ом сбалансировано.';

      if (injectFault === 'open_pair2') {
        status = 'fault';
        const breakDist = Math.max(2, Math.round(estimatedMeters * 0.65));
        pairs = [
          { pair: 'Пара 1-2 (Оранжевая / Rx+)', status: 'Open', dist: `${breakDist}м`, impedance: '> 300 Ом', state: 'error' },
          { pair: 'Пара 3-6 (Зеленая / Tx+)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '102 Ом', state: 'ok' },
          { pair: 'Пара 4-5 (Синяя)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '101 Ом', state: 'ok' },
          { pair: 'Пара 7-8 (Коричневая)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '104 Ом', state: 'ok' }
        ];
        overallMessage = `Обрыв проводника (Open) на оранжевой паре на расстоянии ~${breakDist}м от коммутатора. Скорость ограничена до 100M или линк Down.`;
      } else if (injectFault === 'short_pair4') {
        status = 'fault';
        const shortDist = Math.max(3, Math.round(estimatedMeters * 0.4));
        pairs = [
          { pair: 'Пара 1-2 (Оранжевая / Rx+)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '100 Ом', state: 'ok' },
          { pair: 'Пара 3-6 (Зеленая / Tx+)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '99 Ом', state: 'ok' },
          { pair: 'Пара 4-5 (Синяя)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '101 Ом', state: 'ok' },
          { pair: 'Пара 7-8 (Коричневая)', status: 'Short', dist: `${shortDist}м`, impedance: '< 15 Ом', state: 'error' },
        ];
        overallMessage = `Короткое замыкание (Short) на коричневой паре на отметке ~${shortDist}м. Опасность для подачи PoE!`;
      } else if (injectFault === 'crosstalk') {
        status = 'warning';
        pairs = [
          { pair: 'Пара 1-2 (Оранжевая / Rx+)', status: 'High Crosstalk', dist: `${estimatedMeters}м`, impedance: '88 Ом', state: 'warning' },
          { pair: 'Пара 3-6 (Зеленая / Tx+)', status: 'High Crosstalk', dist: `${estimatedMeters}м`, impedance: '89 Ом', state: 'warning' },
          { pair: 'Пара 4-5 (Синяя)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '100 Ом', state: 'ok' },
          { pair: 'Пара 7-8 (Коричневая)', status: 'OK', dist: `${estimatedMeters}м`, impedance: '102 Ом', state: 'ok' }
        ];
        overallMessage = `Высокие перекрестные наводки (NEXT / FEXT). Возможно некачественная разделка жил на розетке или перегиб кабеля.`;
      } else {
        pairs = [
          { pair: 'Пара 1-2 (Оранжевая / Pin 1-2)', status: 'OK / Terminated', dist: `${estimatedMeters}м`, impedance: '100.4 Ом', state: 'ok' },
          { pair: 'Пара 3-6 (Зеленая / Pin 3-6)', status: 'OK / Terminated', dist: `${estimatedMeters}м`, impedance: '99.8 Ом', state: 'ok' },
          { pair: 'Пара 4-5 (Синяя / Pin 4-5)', status: 'OK / Terminated', dist: `${estimatedMeters}м`, impedance: '101.2 Ом', state: 'ok' },
          { pair: 'Пара 7-8 (Коричневая / Pin 7-8)', status: 'OK / Terminated', dist: `${estimatedMeters}м`, impedance: '100.9 Ом', state: 'ok' }
        ];
      }

      setTestResult({
        status,
        overallMessage,
        length: estimatedMeters,
        skew: '1.2 нс (Skew OK)',
        reflectionLoss: status === 'ok' ? '-24.8 dB (Отлично)' : '-11.2 dB (Высокое отражение)',
        pairs,
        timestamp: new Date().toLocaleTimeString()
      });
      setIsTesting(false);
    }, 900);
  };

  return (
    <div className={`p-4 rounded-xl border space-y-3.5 transition-colors ${
      isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
    }`}>
      {/* Title & Diagnostic launch button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Виртуальный TDR-рефлектометр (Cable Diagnostics)
            </h4>
            <p className="text-[11px] text-slate-500">
              Импульсная рефлектометрия витой пары, проверка целостности жил и замер расстояния
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={runTdrDiagnostics}
          disabled={isTesting}
          className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Сканирование...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Запустить TDR</span>
            </>
          )}
        </button>
      </div>

      {/* Simulation Fault Injection selector for Engineers */}
      <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 flex-wrap ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
          <Sliders className="w-3 h-3 text-slate-400" />
          Сценарий физической линии:
        </span>
        <div className="flex items-center gap-1">
          <select
            value={injectFault}
            onChange={(e) => setInjectFault(e.target.value)}
            className={`px-2 py-1 rounded-md border text-[11px] font-mono outline-none cursor-pointer ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
            }`}
          >
            <option value="none">Штатная линия (Cat.6 OK)</option>
            <option value="open_pair2">Обрыв жилы (Open pair)</option>
            <option value="short_pair4">Короткое замыкание (Short)</option>
            <option value="crosstalk">Перекрестные наводки (Crosstalk)</option>
          </select>
        </div>
      </div>

      {/* Results Display */}
      {testResult && (
        <div className={`p-3.5 rounded-xl border space-y-3 font-mono text-xs ${
          testResult.status === 'fault'
            ? (isLight ? 'bg-rose-50 border-rose-300 text-rose-900' : 'bg-rose-950/20 border-rose-500/40 text-rose-200')
            : testResult.status === 'warning'
            ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-950/20 border-amber-500/40 text-amber-200')
            : (isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200')
        }`}>
          {/* Header Summary */}
          <div className="flex items-center justify-between gap-2 border-b pb-2 border-current/20">
            <div className="flex items-center gap-1.5 font-bold">
              {testResult.status === 'fault' ? (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              ) : testResult.status === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              <span>
                {testResult.status === 'fault' ? 'НЕИСПРАВНОСТЬ КАБЕЛЯ' : testResult.status === 'warning' ? 'ПРЕДУПРЕЖДЕНИЕ ЛИНИИ' : 'КАБЕЛЬ ИСПРАВЕН (PASSED)'}
              </span>
            </div>
            <span className="text-[10px] opacity-75">Проверено в {testResult.timestamp}</span>
          </div>

          <p className="text-[11px] leading-relaxed font-sans">
            {testResult.overallMessage}
          </p>

          {/* 4 Twisted Pairs Status Grid */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-75 block">
              Состояние проводников (Pinout & Length by TDR)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {testResult.pairs.map((p, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg border text-[11px] flex items-center justify-between ${
                    p.state === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 font-bold text-rose-400'
                      : p.state === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  <span className="truncate pr-1">{p.pair}</span>
                  <div className="text-right shrink-0">
                    <span className="font-bold">{p.status}</span>
                    <span className="block text-[10px] opacity-80">{p.dist} • {p.impedance}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics bar */}
          <div className="pt-2 border-t border-current/20 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
            <div>
              <span className="opacity-70 block">Длина трассы:</span>
              <strong className="text-xs">{testResult.length} метров</strong>
            </div>
            <div>
              <span className="opacity-70 block">Возвратные потери:</span>
              <strong>{testResult.reflectionLoss}</strong>
            </div>
            <div>
              <span className="opacity-70 block">Задержка пар (Skew):</span>
              <strong>{testResult.skew}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
