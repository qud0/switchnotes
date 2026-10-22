import React, { useState } from 'react';
import { Cable, X, Check, Info, Layers, Zap, Shield, FileText } from 'lucide-react';

const T568B_PINS = [
  { pin: 1, name: 'Бело-оранжевый', stripe: true, baseColor: '#f97316', bg: '#ffedd5', pair: 2, signal: 'Tx+ (100M/1G)', poe: 'PoE 4P' },
  { pin: 2, name: 'Оранжевый', stripe: false, baseColor: '#ea580c', bg: '#ea580c', pair: 2, signal: 'Tx- (100M/1G)', poe: 'PoE 4P' },
  { pin: 3, name: 'Бело-зеленый', stripe: true, baseColor: '#22c55e', bg: '#dcfce7', pair: 3, signal: 'Rx+ (100M/1G)', poe: 'PoE 4P' },
  { pin: 4, name: 'Синий', stripe: false, baseColor: '#2563eb', bg: '#2563eb', pair: 1, signal: 'Data+ (1G/10G)', poe: 'PoE+ V+' },
  { pin: 5, name: 'Бело-синий', stripe: true, baseColor: '#3b82f6', bg: '#dbeafe', pair: 1, signal: 'Data- (1G/10G)', poe: 'PoE+ V+' },
  { pin: 6, name: 'Зеленый', stripe: false, baseColor: '#16a34a', bg: '#16a34a', pair: 3, signal: 'Rx- (100M/1G)', poe: 'PoE 4P' },
  { pin: 7, name: 'Бело-коричневый', stripe: true, baseColor: '#92400e', bg: '#fef3c7', pair: 4, signal: 'Data+ (1G/10G)', poe: 'PoE+ V-' },
  { pin: 8, name: 'Коричневый', stripe: false, baseColor: '#78350f', bg: '#78350f', pair: 4, signal: 'Data- (1G/10G)', poe: 'PoE+ V-' }
];

const T568A_PINS = [
  { pin: 1, name: 'Бело-зеленый', stripe: true, baseColor: '#22c55e', bg: '#dcfce7', pair: 3, signal: 'Rx+ (100M/1G)', poe: 'PoE 4P' },
  { pin: 2, name: 'Зеленый', stripe: false, baseColor: '#16a34a', bg: '#16a34a', pair: 3, signal: 'Rx- (100M/1G)', poe: 'PoE 4P' },
  { pin: 3, name: 'Бело-оранжевый', stripe: true, baseColor: '#f97316', bg: '#ffedd5', pair: 2, signal: 'Tx+ (100M/1G)', poe: 'PoE 4P' },
  { pin: 4, name: 'Синий', stripe: false, baseColor: '#2563eb', bg: '#2563eb', pair: 1, signal: 'Data+ (1G/10G)', poe: 'PoE+ V+' },
  { pin: 5, name: 'Бело-синий', stripe: true, baseColor: '#3b82f6', bg: '#dbeafe', pair: 1, signal: 'Data- (1G/10G)', poe: 'PoE+ V+' },
  { pin: 6, name: 'Оранжевый', stripe: false, baseColor: '#ea580c', bg: '#ea580c', pair: 2, signal: 'Tx- (100M/1G)', poe: 'PoE 4P' },
  { pin: 7, name: 'Бело-коричневый', stripe: true, baseColor: '#92400e', bg: '#fef3c7', pair: 4, signal: 'Data+ (1G/10G)', poe: 'PoE+ V-' },
  { pin: 8, name: 'Коричневый', stripe: false, baseColor: '#78350f', bg: '#78350f', pair: 4, signal: 'Data- (1G/10G)', poe: 'PoE+ V-' }
];

export function PinoutGuideModal({ isOpen, onClose, theme = 'dark' }) {
  const [standard, setStandard] = useState('t568b'); // 't568b' or 't568a'
  const isLight = theme === 'light';

  if (!isOpen) return null;

  const pins = standard === 't568b' ? T568B_PINS : T568A_PINS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden transition-all my-8 ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Cable className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Шпаргалка монтажника: Распиновка RJ-45 & Цветовые схемы СКС
              </h2>
              <p className="text-xs text-slate-500">
                Стандарты ANSI/TIA-568.2-D, ГОСТ Р 53246-2008 и распределение питания PoE IEEE 802.3
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

        {/* Standard Selector */}
        <div className={`px-6 py-3 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-100/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Схема обжима:</span>
            <div className="inline-flex rounded-lg border p-0.5 bg-slate-950 border-slate-800">
              <button
                onClick={() => setStandard('t568b')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  standard === 't568b' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                T-568B (Основной в РФ / СНГ)
              </button>
              <button
                onClick={() => setStandard('t568a')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  standard === 't568a' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                T-568A (Кроссовер / США)
              </button>
            </div>
          </div>

          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
            Прямой кабель: оба конца B-B | Кросс: один A, второй B
          </span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Visual RJ-45 Connector Preview */}
          <div className={`p-4 rounded-xl border flex flex-col items-center ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-3">
              Вид разъема 8P8C (RJ-45) со стороны контактов (язычок-фиксатор снизу)
            </span>

            {/* RJ45 Wire Bars */}
            <div className="flex items-end gap-1.5 sm:gap-2.5 p-3 rounded-lg border border-slate-700 bg-slate-900/90 shadow-inner">
              {pins.map((p) => (
                <div key={p.pin} className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    {p.pin}
                  </span>
                  {/* Wire segment */}
                  <div
                    className="w-5 sm:w-6 h-20 rounded-xs border border-black/30 shadow-xs relative overflow-hidden flex flex-col justify-center"
                    style={{ backgroundColor: p.baseColor }}
                  >
                    {p.stripe && (
                      <div className="w-full h-full bg-white opacity-60 flex flex-col justify-between py-1">
                        <div className="h-1 bg-transparent" />
                        <div className="h-2 w-full" style={{ backgroundColor: p.baseColor }} />
                        <div className="h-2 w-full" style={{ backgroundColor: p.baseColor }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono font-semibold text-slate-300 max-w-[48px] text-center leading-tight truncate">
                    {p.name.split('-')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Pin Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className={`border-b text-[11px] font-mono uppercase text-slate-400 ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-slate-800'
              }`}>
                <tr>
                  <th className="py-2.5 px-3">Контакт #</th>
                  <th className="py-2.5 px-3">Цвет проводника</th>
                  <th className="py-2.5 px-3">Пара</th>
                  <th className="py-2.5 px-3">Сигнал (100M / 1G / 10G)</th>
                  <th className="py-2.5 px-3">Питание PoE (802.3af/at/bt)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {pins.map(p => (
                  <tr key={p.pin} className="hover:bg-slate-800/20">
                    <td className="py-2 px-3 font-bold text-blue-400">PIN {p.pin}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/30 shrink-0"
                          style={{ backgroundColor: p.baseColor }}
                        />
                        <span className="font-semibold text-slate-200">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-400">Пара {p.pair}</td>
                    <td className="py-2 px-3 text-emerald-400 font-semibold">{p.signal}</td>
                    <td className="py-2 px-3 text-amber-400 font-semibold">{p.poe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick Rules for Installers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Питание PoE (Alt A vs Alt B)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                В 10/100M сетях Mode B питает по парам 4-5 (+) и 7-8 (-). В Gigabit и 802.3bt (до 90W) питание подается фантомно по всем 4 парам.
              </p>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span>Длина расплета пар</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Для сохранения категории Cat.6/6A длина расплета витой пары при разделке в модуль Keystone не должна превышать 13 мм (0.5 дюйма).
              </p>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1 text-xs">
                <FileText className="w-3.5 h-3.5 text-purple-500" />
                <span>ГОСТ Р 53246-2008</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Максимальная длина горизонтального кабеля — 90 метров (Permanent Link) + 10 метров суммарно на патч-корды рабочего места и кроссовой.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex justify-end ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/60'
        }`}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer shadow-md shadow-blue-500/20"
          >
            Закрыть шпаргалку
          </button>
        </div>
      </div>
    </div>
  );
}
