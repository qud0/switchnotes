import React from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Reusable EmptyState component for lists, cards, and main view panels.
 */
export function EmptyState({
  icon: Icon = HelpCircle,
  title = 'Нет данных',
  description,
  action,
  secondaryAction,
  compact = false,
  theme = 'dark',
  className = ''
}) {
  const isLight = theme === 'light';

  if (compact) {
    return (
      <div
        className={`p-6 text-center border border-dashed rounded-xl transition-all ${
          isLight
            ? 'border-slate-200 bg-white/70 text-slate-800'
            : 'border-slate-800/80 bg-slate-900/30 text-slate-200'
        } ${className}`}
      >
        <div className="w-10 h-10 rounded-xl mx-auto mb-2.5 flex items-center justify-center bg-blue-500/10 text-blue-500 dark:text-blue-400">
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">
          {title}
        </p>
        {description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            {description}
          </p>
        )}
        {(action || secondaryAction) && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {action && (
              <button
                type="button"
                onClick={action.onClick}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {action.icon && <action.icon className="w-3.5 h-3.5" />}
                <span>{action.label}</span>
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full-size view empty state
  return (
    <div
      className={`min-h-[22rem] flex flex-col items-center justify-center border border-dashed rounded-2xl p-8 text-center transition-all ${
        isLight
          ? 'bg-white border-slate-300 text-slate-800 shadow-xs'
          : 'bg-slate-900/20 border-slate-800 text-slate-200'
      } ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 shadow-sm animate-pop-in">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center gap-3">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              {action.icon && <action.icon className="w-4 h-4" />}
              <span>{action.label}</span>
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
