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
  ArrowRight,
  Terminal,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cpu,
  Radio
} from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

/**
 * VirtualTdrTester.jsx
 * Аппаратный и виртуальный TDR-рефлектометр кабеля (Time Domain Reflectometry / Cable Diagnostics)
 * Поддерживает:
 * - Реальное аппаратное тестирование по SSH на коммутаторах SNR NAG (S2985G, S2989G) и MikroTik RouterOS (CRS, CSS).
 * - Определение точной длины каждой из 4 витых пар (стандарт T568B).
 * - Локализацию обрывов жил (Open) и коротких замыканий (Short) с точностью до метра.
 * - Инженерный вердикт и рекомендации по устранению неисправностей СКС.
 * - Просмотр исходного вывода CLI консоли коммутатора.
 * - Лабораторный режим стенда неисправностей (эмуляция обрывов и помех).
 */
export function VirtualTdrTester({
  switchData = null,
  port = null,
  portNumber,
  portName = '',
  connectedSocket = '',
  cableLength = '25м',
  speed = '1G',
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();

  const activePortNumber = port?.number || portNumber || 1;
  const activePortName = port?.name || portName || `Порт ${activePortNumber}`;
  const hasHardwareSwitch = Boolean(switchData?.ip);
  const vendorName = switchData?.vendor || 'SNR';

  const [testMode, setTestMode] = useState(hasHardwareSwitch ? 'auto' : 'simulated'); // 'auto' | 'hardware' | 'simulated'
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [injectFault, setInjectFault] = useState('none'); // 'none' | 'open_pair2' | 'short_pair4' | 'crosstalk'
  const [showRawCli, setShowRawCli] = useState(false);
  const [testError, setTestError] = useState(null);

  const estimatedMeters = parseInt(cableLength) || 28;

  const runTdrDiagnostics = async () => {
    setIsTesting(true);
    setTestError(null);

    try {
      if (switchData?.id && (port?.id || activePortNumber)) {
        // Выполняем реальный запрос на бэкенд (аппаратный SSH или виртуальный)
        const portIdentifier = port?.id || `p${activePortNumber}`;
        const res = await api.runCableTest(switchData.id, portIdentifier, {
          mode: testMode,
          faultSimulation: injectFault,
          estimatedLength: cableLength
        });
        setTestResult(res);
        if (res.isHardware) {
          toast?.success?.(`TDR-тест выполнен на ${res.switchName} (${res.interfaceName})`);
        } else if (res.simulationReason) {
          toast?.info?.(res.simulationReason);
        }
      } else {
        // Локальная симуляция при отсутствии контекста свитча
        await new Promise(r => setTimeout(r, 600));
        let pairs = [];
        let status = 'ok';
        let overallMessage = `Все 4 пары в норме. Волновое сопротивление 100 Ом сбалансировано. Расчетная длина: ~${estimatedMeters}м.`;
        let recommendation = 'Кабельная линия полностью исправна (Cat.6).';

        if (injectFault === 'open_pair2') {
          status = 'fault';
          const breakDist = Math.max(2, Math.round(estimatedMeters * 0.65));
          pairs = [
            { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'Open (Обрыв)', length: breakDist, state: 'error' },
            { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' }
          ];
          overallMessage = `ОБРЫВ ПРОВОДНИКА: Обрыв на оранжевой паре (1-2) на отметке ~${breakDist}м.`;
          recommendation = `Проверьте кабельную трассу на удалении ${breakDist}м от коммутатора.`;
        } else if (injectFault === 'short_pair4') {
          status = 'fault';
          const shortDist = Math.max(3, Math.round(estimatedMeters * 0.35));
          pairs = [
            { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'Short (Замыкание)', length: shortDist, state: 'error' }
          ];
          overallMessage = `КРИТИЧЕСКИЙ СБОЙ: Короткое замыкание жил на коричневой паре (7-8) на отметке ~${shortDist}м. Опасно для PoE!`;
          recommendation = 'Срочно проверьте линию перед подачей PoE питания.';
        } else {
          pairs = [
            { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' },
            { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: estimatedMeters, state: 'ok' }
          ];
        }

        setTestResult({
          status,
          isHardware: false,
          vendor: vendorName,
          switchName: switchData?.name || 'Коммутатор',
          portName: activePortName,
          overallLength: estimatedMeters,
          overallMessage,
          recommendation,
          pairs,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    } catch (err) {
      setTestError(err.message || 'Ошибка выполнения TDR-теста');
      toast?.error?.(err.message || 'Ошибка запуска TDR');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className={`p-4 rounded-xl border space-y-4 transition-colors ${
      isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
    }`}>
      {/* Title & Hardware Status Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-2.5">
          <div className={`p-2 rounded-xl border shrink-0 ${
            hasHardwareSwitch
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
          }`}>
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>Аппаратный TDR-тест кабеля (Virtual Cable Tester)</span>
              </h4>
              {hasHardwareSwitch ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {vendorName} ({switchData.ip})
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
                  Виртуальный узел
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Импульсная рефлектометрия витой пары через чипсет {vendorName}: локализация обрывов, замыканий и замер длины до розетки ({connectedSocket || 'СКС'}).
            </p>
          </div>
        </div>

        {/* Start Button */}
        <button
          type="button"
          onClick={runTdrDiagnostics}
          disabled={isTesting}
          className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer shrink-0"
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Подача импульса...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Запустить TDR</span>
            </>
          )}
        </button>
      </div>

      {/* Mode Selector & Simulation Fault Switcher */}
      <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 flex-wrap ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            Режим:
          </span>
          <div className="flex items-center gap-1 bg-slate-800/60 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setTestMode('auto')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                testMode === 'auto'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Авто (SSH / SNR / MikroTik)
            </button>
            <button
              type="button"
              onClick={() => setTestMode('simulated')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                testMode === 'simulated'
                  ? 'bg-purple-600 text-white shadow-2xs font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Лаборатория / Эмуляция
            </button>
          </div>
        </div>

        {/* Fault injection dropdown (active in simulation or training) */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            Сценарий теста:
          </span>
          <select
            value={injectFault}
            onChange={(e) => setInjectFault(e.target.value)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
            }`}
          >
            <option value="none">Штатная линия (Cat.6 OK)</option>
            <option value="open_pair2">Обрыв жилы (Open pair)</option>
            <option value="short_pair4">Короткое замыкание (Short)</option>
            <option value="crosstalk">Наводки / NEXT (Crosstalk)</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {testError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{testError}</span>
        </div>
      )}

      {/* Test Results Display */}
      {testResult && (
        <div className={`p-4 rounded-xl border space-y-4 font-mono text-xs shadow-inner ${
          testResult.status === 'fault'
            ? (isLight ? 'bg-rose-50/80 border-rose-300 text-rose-950' : 'bg-rose-950/25 border-rose-500/40 text-rose-200')
            : testResult.status === 'warning'
            ? (isLight ? 'bg-amber-50/80 border-amber-300 text-amber-950' : 'bg-amber-950/25 border-amber-500/40 text-amber-200')
            : (isLight ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200')
        }`}>
          {/* Header Summary Banner */}
          <div className="flex items-center justify-between gap-2 border-b pb-2.5 border-current/20">
            <div className="flex items-center gap-2 font-bold text-sm">
              {testResult.status === 'fault' ? (
                <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
              ) : testResult.status === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
              <span>
                {testResult.status === 'fault'
                  ? 'ОБНАРУЖЕНО ПОВРЕЖДЕНИЕ КАБЕЛЯ'
                  : testResult.status === 'warning'
                  ? 'ПРЕДУПРЕЖДЕНИЕ: КАЧЕСТВО СИГНАЛА СНИЖЕНО'
                  : 'КАБЕЛЬ ИСПРАВЕН (TDR PASSED)'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold ${
                testResult.isHardware
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
              }`}>
                {testResult.isHardware ? 'Hardware TDR' : 'Simulation TDR'}
              </span>
              <span className="text-[10px] opacity-75">
                {new Date(testResult.timestamp || Date.now()).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Verdict Message and Recommendation */}
          <div className="space-y-1 font-sans">
            <p className="text-xs font-semibold leading-relaxed">
              {testResult.overallMessage}
            </p>
            {testResult.recommendation && (
              <p className="text-[11px] opacity-85 flex items-start gap-1.5 mt-1">
                <span className="font-bold shrink-0">Рекомендация:</span>
                <span>{testResult.recommendation}</span>
              </p>
            )}
          </div>

          {/* 4 Twisted Pairs Pinout and Length Grid */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] font-sans font-bold uppercase tracking-wider opacity-80">
              <span>Состояние 4 витых пар (Стандарт T568B)</span>
              <span>Расчетная длина трассы: ~{testResult.overallLength}м</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {testResult.pairs.map((p, i) => {
                const maxLen = Math.max(testResult.overallLength || 30, 30);
                const percent = Math.min(100, Math.round(((p.length || 0) / maxLen) * 100));

                return (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border flex flex-col justify-between space-y-2 ${
                      p.state === 'error'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : p.state === 'warning'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {/* Twisted pair color dot */}
                        <span
                          className="w-3 h-3 rounded-full border border-black/40 shrink-0 shadow-xs"
                          style={{ backgroundColor: p.wireColor || '#3b82f6' }}
                        />
                        <span className="font-bold text-white">{p.name || `Пара ${p.pairId}`}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        p.state === 'error'
                          ? 'bg-rose-500/20 text-rose-300'
                          : p.state === 'warning'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {p.status}
                      </span>
                    </div>

                    {/* Distance & Length Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] opacity-80 font-mono">
                        <span>Дистанция импульса:</span>
                        <strong className="text-white">{p.length} м</strong>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            p.state === 'error' ? 'bg-rose-500' : p.state === 'warning' ? 'bg-amber-400' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Raw CLI Terminal Output Drawer */}
          {testResult.rawCliOutput && (
            <div className="pt-2 border-t border-current/20 space-y-1.5">
              <button
                type="button"
                onClick={() => setShowRawCli(!showRawCli)}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1.5 font-mono cursor-pointer transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>{showRawCli ? 'Скрыть вывод консоли CLI' : 'Показать консольный вывод команды коммутатора'}</span>
                {showRawCli ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showRawCli && (
                <div className="p-3 rounded-lg bg-black/90 border border-slate-800 text-emerald-400 font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                  {testResult.rawCliOutput}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
