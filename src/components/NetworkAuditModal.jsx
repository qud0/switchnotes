import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  RefreshCw,
  Download,
  ArrowRight,
  Wrench,
  Search,
  Check,
  Filter
} from 'lucide-react';
import { runNetworkAudit } from '../utils/networkAudit';
import { useToast } from '../context/ToastContext';

export function NetworkAuditModal({
  isOpen,
  onClose,
  switches = [],
  vlans = [],
  patchPanels = [],
  ipAllocations = [],
  onNavigateToSwitch,
  onNavigateToPatchPanel,
  onNavigateToIpam,
  onNavigateToVlan,
  onQuickFix,
  theme
}) {
  const toast = useToast();
  const [selectedSeverity, setSelectedSeverity] = useState('all'); // 'all', 'error', 'warning', 'info'
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all', 'links', 'ipam', 'vlans', 'patchPanels', 'security'
  const [searchFilter, setSearchFilter] = useState('');
  const [fixedIssueIds, setFixedIssueIds] = useState(new Set());
  const [fixingId, setFixingId] = useState(null);

  const isLight = theme === 'light';

  // Run audit engine
  const auditResult = useMemo(() => {
    return runNetworkAudit({ switches, vlans, patchPanels, ipAllocations });
  }, [switches, vlans, patchPanels, ipAllocations]);

  // Filter issues
  const filteredIssues = useMemo(() => {
    return auditResult.issues.filter(issue => {
      if (fixedIssueIds.has(issue.id)) return false;
      if (selectedSeverity !== 'all' && issue.severity !== selectedSeverity) return false;
      if (selectedCategory !== 'all' && issue.category !== selectedCategory) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matches =
          issue.title.toLowerCase().includes(q) ||
          issue.message.toLowerCase().includes(q) ||
          issue.category.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [auditResult, selectedSeverity, selectedCategory, searchFilter, fixedIssueIds]);

  if (!isOpen) return null;

  const { healthScore, counts } = auditResult;

  // Health Score badge styling
  const scoreBadgeColor =
    healthScore >= 90
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : healthScore >= 70
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

  const scoreDescription =
    healthScore >= 90
      ? 'Отличное состояние сети. Конфигурации согласованы, коллизий не обнаружено.'
      : healthScore >= 70
      ? 'Удовлетворительно. Найдены несовпадения VLAN или предупреждения в адресации.'
      : 'Внимание! Обнаружены критические ошибки связей или дубликаты адресов.';

  // Handle Quick Fix
  const handleApplyQuickFix = async (issue) => {
    if (!issue.quickFix || !onQuickFix) return;
    try {
      setFixingId(issue.id);
      await onQuickFix(issue.quickFix);
      setFixedIssueIds(prev => new Set([...prev, issue.id]));
      toast.success('Исправление успешно применилось');
    } catch (err) {
      toast.error(`Ошибка применения исправления: ${err.message}`);
    } finally {
      setFixingId(null);
    }
  };

  // Export audit report to text
  const handleExportReport = () => {
    const lines = [
      '=================================================================',
      '          ОТЧЕТ АУДИТА СЕТЕВОЙ ИНФРАСТРУКТУРЫ (SWITCHBOOK)       ',
      '=================================================================',
      `Дата аудита:     ${new Date().toLocaleString('ru-RU')}`,
      `Индекс здоровья: ${healthScore} / 100`,
      `Статус:          ${scoreDescription}`,
      `Ошибок:          ${counts.errors}`,
      `Предупреждений:  ${counts.warnings}`,
      `Рекомендаций:    ${counts.infos}`,
      '-----------------------------------------------------------------',
      '',
      'ДЕТАЛИЗАЦИЯ НАЙДЕННЫХ ПРОБЛЕМ:',
      ''
    ];

    auditResult.issues.forEach((iss, idx) => {
      lines.push(`[#${idx + 1}] [${iss.severity.toUpperCase()}] [${iss.category.toUpperCase()}]`);
      lines.push(`Тема:     ${iss.title}`);
      lines.push(`Описание: ${iss.message}`);
      lines.push('-----------------------------------------------------------------');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `network-audit-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Category labels
  const categoryLabels = {
    all: 'Все категории',
    links: 'Линк-стыки',
    ipam: 'IPAM и MAC',
    vlans: 'Каталог VLAN',
    patchPanels: 'СКС / Панели',
    security: '🛡 Безопасность & Hardening'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        className={`w-full max-w-5xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold">Аудит безопасности и лучших практик</h2>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${scoreBadgeColor}`}>
                  {healthScore} / 100
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Комплексный анализ Network Hardening: защита Native VLAN, аудит открытых портов, изоляция MGMT, слабые SNMP community и коллизии L2/L3
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportReport}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-700'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Скачать текстовый отчет"
            >
              <Download className="w-3.5 h-3.5" />
              Отчет
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Health Score & Stats Strip */}
        <div className={`p-6 border-b shrink-0 ${isLight ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Score Card */}
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shrink-0 text-xl font-black ${scoreBadgeColor}`}>
                {healthScore}
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">Индекс сети</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">
                  {healthScore >= 90 ? 'Здорова' : healthScore >= 70 ? 'Требует внимания' : 'Критично'}
                </span>
                <span className="text-[11px] text-slate-400 block line-clamp-1">{scoreDescription}</span>
              </div>
            </div>

            {/* Errors Card */}
            <button
              onClick={() => setSelectedSeverity(selectedSeverity === 'error' ? 'all' : 'error')}
              className={`p-4 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                selectedSeverity === 'error'
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/10'
                  : isLight ? 'bg-white border-slate-200 hover:border-rose-300' : 'bg-slate-900 border-slate-800 hover:border-rose-500/40'
              }`}
            >
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">Ошибки</span>
                <span className="text-2xl font-black text-rose-500 mt-0.5 block">{counts.errors}</span>
                <span className="text-[11px] text-slate-400">Нарушения работы</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500">
                <AlertCircle className="w-5 h-5" />
              </div>
            </button>

            {/* Warnings Card */}
            <button
              onClick={() => setSelectedSeverity(selectedSeverity === 'warning' ? 'all' : 'warning')}
              className={`p-4 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                selectedSeverity === 'warning'
                  ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/10'
                  : isLight ? 'bg-white border-slate-200 hover:border-amber-300' : 'bg-slate-900 border-slate-800 hover:border-amber-500/40'
              }`}
            >
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">Предупреждения</span>
                <span className="text-2xl font-black text-amber-500 mt-0.5 block">{counts.warnings}</span>
                <span className="text-[11px] text-slate-400">Потенциальные сбои</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </button>

            {/* Infos Card */}
            <button
              onClick={() => setSelectedSeverity(selectedSeverity === 'info' ? 'all' : 'info')}
              className={`p-4 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                selectedSeverity === 'info'
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/10'
                  : isLight ? 'bg-white border-slate-200 hover:border-blue-300' : 'bg-slate-900 border-slate-800 hover:border-blue-500/40'
              }`}
            >
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">Рекомендации</span>
                <span className="text-2xl font-black text-blue-500 mt-0.5 block">{counts.infos}</span>
                <span className="text-[11px] text-slate-400">Оптимизация и гигиена</span>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                <Info className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className={`px-6 py-3 border-b shrink-0 flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          {/* Categories Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['all', 'links', 'ipam', 'vlans', 'patchPanels', 'security'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Поиск по проблемам..."
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none transition-colors ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                  : 'bg-slate-800/80 border-slate-700 text-slate-100 focus:border-blue-500'
              }`}
            />
          </div>
        </div>

        {/* Issue List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {filteredIssues.length === 0 ? (
            <div className={`p-12 text-center rounded-2xl border border-dashed ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/20 border-slate-800'
            }`}>
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                {searchFilter || selectedCategory !== 'all' || selectedSeverity !== 'all'
                  ? 'В данной выборке проблем не обнаружено'
                  : 'Замечательно! Проблем и коллизий в сети нет'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Все линки, VLAN, PVID и IPAM адреса полностью согласованы между коммутаторами и патч-панелями.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isError = issue.severity === 'error';
              const isWarning = issue.severity === 'warning';
              const isFixing = fixingId === issue.id;

              const cardBorder = isError
                ? 'border-rose-500/40 bg-rose-500/5'
                : isWarning
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-blue-500/40 bg-blue-500/5';

              const icon = isError ? (
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              ) : isWarning ? (
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              );

              return (
                <div
                  key={issue.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start justify-between gap-4 ${cardBorder}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {icon}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {issue.title}
                        </span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          isError
                            ? 'bg-rose-500/20 text-rose-400'
                            : isWarning
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {categoryLabels[issue.category] || issue.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {issue.message}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Quick Fix Button (if available) */}
                    {issue.quickFix && (
                      <button
                        onClick={() => handleApplyQuickFix(issue)}
                        disabled={isFixing}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Автоматически применить исправление"
                      >
                        {isFixing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wrench className="w-3.5 h-3.5" />
                        )}
                        {issue.actionText || 'Исправить'}
                      </button>
                    )}

                    {/* Navigation Jump Button */}
                    {issue.target && (
                      <button
                        onClick={() => {
                          onClose();
                          if (issue.target.type === 'switch') {
                            onNavigateToSwitch(issue.target.id, issue.target.portId);
                          } else if (issue.target.type === 'patchPanel') {
                            onNavigateToPatchPanel(issue.target.id, issue.target.portId);
                          } else if (issue.target.type === 'ipam') {
                            onNavigateToIpam(issue.target.ip || issue.target.id);
                          } else if (issue.target.type === 'vlan') {
                            onNavigateToVlan(issue.target.id);
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1 transition-colors cursor-pointer ${
                          isLight
                            ? 'border-slate-300 hover:bg-slate-200 text-slate-700'
                            : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span>Перейти</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-3 border-t shrink-0 text-xs text-slate-500 ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/50'
          }`}
        >
          <span>
            Показано {filteredIssues.length} из {auditResult.issues.length} замечаний
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
