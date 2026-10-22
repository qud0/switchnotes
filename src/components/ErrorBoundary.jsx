import React from 'react';
import { AlertOctagon, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SwitchBook ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      localStorage.removeItem('switchbook_zoom');
      localStorage.removeItem('switchbook_theme');
      localStorage.removeItem('switchbook_alert_sound');
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const isDark = document.documentElement.classList.contains('dark') ||
        (!document.documentElement.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches);

      return (
        <div className={`min-h-screen flex items-center justify-center p-6 ${
          isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
        }`}>
          <div className={`max-w-xl w-full p-6 md:p-8 rounded-2xl border shadow-2xl ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight">
                  Произошла ошибка интерфейса
                </h1>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
                  SwitchBook перехватил сбой отображения компонентов
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border mb-6 text-xs font-mono break-all ${
              isDark ? 'bg-slate-950/80 border-slate-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              {this.state.error?.toString() || 'Неизвестная ошибка выполнения'}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                onClick={this.handleReload}
                className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Перезагрузить страницу
              </button>

              <button
                onClick={this.handleResetStorage}
                className={`h-9 px-4 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                  isDark
                    ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                    : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                Сбросить кэш и перезагрузить
              </button>
            </div>

            <button
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 cursor-pointer transition-colors"
            >
              {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {this.state.showDetails ? 'Скрыть технические подробности' : 'Показать технические подробности (Stack Trace)'}
            </button>

            {this.state.showDetails && (
              <pre className={`mt-3 p-3 rounded-lg border text-[11px] overflow-x-auto max-h-48 font-mono ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                {this.state.errorInfo?.componentStack || 'Стек вызовов недоступен'}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
