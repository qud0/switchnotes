import React, { useState } from 'react';
import {
  X,
  Download,
  FileCode,
  Network,
  Printer,
  FileText,
  Check,
  Layers,
  Server,
  Cable,
  Tag,
  Palette,
  ExternalLink,
  ShieldCheck,
  Building2,
  Sparkles
} from 'lucide-react';
import {
  generateTopologySvg,
  generateDrawioXml,
  generateNetworkPassportHtml,
  downloadFile,
  openPrintWindow
} from '../utils/topologyExport';
import { useToast } from '../context/ToastContext';

export function TopologyExportModal({
  isOpen,
  onClose,
  switches = [],
  links = [],
  patchPanels = [],
  servers = [],
  workstations = [],
  vlans = [],
  positions = {},
  theme = 'dark'
}) {
  const toast = useToast();
  const isLight = theme === 'light';

  // State
  const [selectedFormat, setSelectedFormat] = useState('svg'); // 'svg' | 'drawio' | 'passport'
  const [exportTheme, setExportTheme] = useState(theme === 'light' ? 'light' : 'dark');
  const [includePatchPanels, setIncludePatchPanels] = useState(true);
  const [includeServers, setIncludeServers] = useState(true);
  const [includeWorkstations, setIncludeWorkstations] = useState(false);
  const [includeCableLabels, setIncludeCableLabels] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [docTitle, setDocTitle] = useState('Топология корпоративной сети SwitchBook');
  const [companyName, setCompanyName] = useState('Корпоративная Сеть Предприятия');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const dateSlug = new Date().toISOString().slice(0, 10);

  const handleExport = () => {
    setIsExporting(true);
    try {
      if (selectedFormat === 'svg') {
        const svgContent = generateTopologySvg({
          switches,
          links,
          patchPanels,
          servers,
          workstations,
          positions,
          options: {
            theme: exportTheme,
            includePatchPanels,
            includeServers,
            includeWorkstations,
            includeCableLabels,
            includeLegend,
            title: docTitle
          }
        });
        const filename = `switchbook-topology-${dateSlug}.svg`;
        downloadFile(svgContent, filename, 'image/svg+xml;charset=utf-8');
        toast?.success?.(`Векторная схема сохранена: ${filename}`);
      } else if (selectedFormat === 'drawio') {
        const xmlContent = generateDrawioXml({
          switches,
          links,
          patchPanels,
          servers,
          workstations,
          positions,
          options: {
            includePatchPanels,
            includeServers,
            includeWorkstations,
            title: docTitle
          }
        });
        const filename = `switchbook-topology-${dateSlug}.drawio`;
        downloadFile(xmlContent, filename, 'application/xml;charset=utf-8');
        toast?.success?.(`Файл Visio / Draw.io сохранен: ${filename}`);
      } else if (selectedFormat === 'passport') {
        const htmlContent = generateNetworkPassportHtml({
          switches,
          links,
          patchPanels,
          servers,
          vlans,
          positions,
          options: {
            companyName,
            title: docTitle
          }
        });
        
        // Open print window directly for instant Save-As-PDF or Print
        const printWin = openPrintWindow(htmlContent);
        if (!printWin) {
          // If popup was blocked, fallback to downloading HTML file
          const filename = `switchbook-network-passport-${dateSlug}.html`;
          downloadFile(htmlContent, filename, 'text/html;charset=utf-8');
          toast?.info?.(`Паспорт сохранен как файл: ${filename}`);
        } else {
          toast?.success?.('Окно печати и экспорта PDF открыто');
        }
      }
      onClose();
    } catch (err) {
      console.error('[TopologyExport] Ошибка экспорта:', err);
      toast?.error?.('Ошибка генерации файла экспорта: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPassportHtml = () => {
    try {
      const htmlContent = generateNetworkPassportHtml({
        switches,
        links,
        patchPanels,
        servers,
        vlans,
        positions,
        options: {
          companyName,
          title: docTitle
        }
      });
      const filename = `switchbook-network-passport-${dateSlug}.html`;
      downloadFile(htmlContent, filename, 'text/html;charset=utf-8');
      toast?.success?.(`Паспорт сохранен в HTML: ${filename}`);
    } catch (err) {
      toast?.error?.('Ошибка сохранения HTML: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-3xl rounded-2xl shadow-2xl border flex flex-col overflow-hidden max-h-[92vh] ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  Экспорт и паспортизация топологии
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  L2/L3 Architecture
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Генерация векторных схем SVG, моделей Visio/Draw.io и исполнительной документации (PDF)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Format Selector Cards */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
              1. Выберите формат экспорта
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Option 1: SVG */}
              <div
                onClick={() => setSelectedFormat('svg')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  selectedFormat === 'svg'
                    ? 'border-blue-500 bg-blue-500/5 shadow-md shadow-blue-500/10'
                    : isLight
                    ? 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                      <FileCode className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">
                      .SVG
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Векторный чертеж (SVG)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Масштабируемый вектор со стилями, индикаторами портов и легендой скоростей.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Для Confluence &amp; CAD</span>
                  {selectedFormat === 'svg' && <Check className="w-4 h-4 text-blue-500" />}
                </div>
              </div>

              {/* Option 2: Draw.io / Visio */}
              <div
                onClick={() => setSelectedFormat('drawio')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  selectedFormat === 'drawio'
                    ? 'border-emerald-500 bg-emerald-500/5 shadow-md shadow-emerald-500/10'
                    : isLight
                    ? 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Network className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                      .DRAWIO / .XML
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Visio / Draw.io Model
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Редактируемые узлы и магнитные коннекторы для diagrams.net, Visio и Lucidchart.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Полный CAD импорт</span>
                  {selectedFormat === 'drawio' && <Check className="w-4 h-4 text-emerald-500" />}
                </div>
              </div>

              {/* Option 3: Executive Passport */}
              <div
                onClick={() => setSelectedFormat('passport')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  selectedFormat === 'passport'
                    ? 'border-purple-500 bg-purple-500/5 shadow-md shadow-purple-500/10'
                    : isLight
                    ? 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                      <Printer className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">
                      A4 LANDSCAPE PDF
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Паспорт сети (PDF / Печать)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Схема, спецификация по стойкам, кабельный журнал (Trunk Matrix) и реестр VLAN.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Исполнительная документация</span>
                  {selectedFormat === 'passport' && <Check className="w-4 h-4 text-purple-500" />}
                </div>
              </div>
            </div>
          </div>

          {/* Document Metadata Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Заголовок документа / схемы
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-none focus:border-blue-500 ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
                placeholder="Заголовок топологии"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Организация / Подразделение
              </label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors focus:outline-none focus:border-blue-500 ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                }`}
                placeholder="Наименование компании"
              />
            </div>
          </div>

          {/* Layer and Options Checkboxes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
              2. Настройки слоев и детализации
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={includePatchPanels}
                  onChange={e => setIncludePatchPanels(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Включать патч-панели СКС</div>
                  <div className="text-[11px] text-slate-500">Отображать пассивные кроссы и порты</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={includeServers}
                  onChange={e => setIncludeServers(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Включать серверы</div>
                  <div className="text-[11px] text-slate-500">Серверная ферма и хосты виртуализации</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={includeCableLabels}
                  onChange={e => setIncludeCableLabels(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Подписывать порты и VLAN</div>
                  <div className="text-[11px] text-slate-500">Номера портов на концах кабелей и теги</div>
                </div>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={includeLegend}
                  onChange={e => setIncludeLegend(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">Легенда скоростей</div>
                  <div className="text-[11px] text-slate-500">Цветовая шкала 40G, 10G, 1G, LAG, STP</div>
                </div>
              </label>
            </div>
          </div>

          {/* Color Scheme for SVG */}
          {selectedFormat === 'svg' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                3. Цветовое оформление чертежа
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setExportTheme('dark')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                    exportTheme === 'dark'
                      ? 'bg-slate-800 text-white border-blue-500 shadow-sm'
                      : 'bg-transparent text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-600"></span>
                  Темная тема (NOC Dashboard)
                </button>
                <button
                  type="button"
                  onClick={() => setExportTheme('light')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                    exportTheme === 'light'
                      ? 'bg-white text-slate-900 border-blue-500 shadow-sm'
                      : 'bg-transparent text-slate-400 border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-400"></span>
                  Светлая тема (Печатный чертеж)
                </button>
              </div>
            </div>
          )}

          {/* Summary Box */}
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                Готово к генерации: <strong>{switches.length}</strong> коммутаторов, <strong>{links.length}</strong> линков, <strong>{vlans.length}</strong> VLAN.
              </span>
            </div>
            {selectedFormat === 'passport' && (
              <button
                type="button"
                onClick={handleDownloadPassportHtml}
                className="text-[11px] underline text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <span>Скачать .HTML файл</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Отмена
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer disabled:opacity-50"
          >
            {selectedFormat === 'passport' ? (
              <>
                <Printer className="w-4 h-4" />
                <span>Открыть паспорт и распечатать в PDF</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Скачать {selectedFormat === 'svg' ? 'векторный SVG' : 'модель Draw.io (.drawio)'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
