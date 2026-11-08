import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Check, RotateCcw, ChevronDown, Eye, EyeOff } from 'lucide-react';

/**
 * Reusable dropdown component to customize visible table columns and switch presets.
 */
export function TableColumnSelector({
  columns = [],
  visibleColumns = [],
  onToggleColumn,
  presets = [],
  activePreset = 'custom',
  onSelectPreset,
  onReset,
  theme = 'dark',
  className = '',
  buttonClassName = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const isLight = theme === 'light';

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const visibleCount = visibleColumns.length;
  const totalCount = columns.length;

  const currentPresetObj = presets.find(p => p.id === activePreset);
  const displayLabel = currentPresetObj ? currentPresetObj.label : `Колонки (${visibleCount}/${totalCount})`;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-xs select-none ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : isLight
            ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-700'
            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
        } ${buttonClassName}`}
        title="Настроить отображение колонок и профиль"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
        <span className="font-semibold">{displayLabel}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl z-50 p-3 animate-pop-in backdrop-blur-md transition-all ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800'
              : 'bg-slate-900/95 border-slate-700/80 text-slate-100'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold font-mono">Профили таблицы</span>
            </div>
            {onReset && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                }}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                title="Вернуть стандартный вид"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Сброс</span>
              </button>
            )}
          </div>

          {/* Quick Presets */}
          {presets.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                Быстрый выбор:
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map(p => {
                  const isSelected = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPreset && onSelectPreset(p.id, p.columns)}
                      className={`px-2 py-1.5 rounded-lg text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : isLight
                          ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-750'
                      }`}
                    >
                      <span className="truncate">{p.label}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Columns Checklist */}
          <div>
            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
              <span>Видимые колонки ({visibleCount}/{totalCount})</span>
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {columns.map(col => {
                const isChecked = visibleColumns.includes(col.key);
                const isLocked = col.required === true;

                return (
                  <label
                    key={col.key}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors select-none ${
                      isLocked
                        ? 'opacity-60 cursor-not-allowed'
                        : isLight
                        ? 'hover:bg-slate-100'
                        : 'hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isLocked}
                        onChange={() => {
                          if (!isLocked && onToggleColumn) {
                            onToggleColumn(col.key);
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {col.label}
                      </span>
                    </div>

                    <div className="shrink-0 text-slate-400 ml-2">
                      {isLocked ? (
                        <span className="text-[10px] text-slate-400 italic">Фикс.</span>
                      ) : isChecked ? (
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500 opacity-50" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TableColumnSelector;
