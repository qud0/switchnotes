import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
  Check,
  Settings2,
  Eye,
  FileSpreadsheet,
  Globe,
  Layers,
  Server,
  Cable,
  Shield,
  Zap,
  Cpu
} from 'lucide-react';

export function ReportModal({
  isOpen,
  onClose,
  switches = [],
  patchPanels = [],
  vlans = [],
  ipAllocations = [],
  servers = [],
  activeSwitch = null,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const [companyName, setCompanyName] = useState('ООО «ТехноСеть» — Сетевая инфраструктура');
  const [engineerName, setEngineerName] = useState('Сетевой инженер / Системный администратор');
  const [facilityAddress, setFacilityAddress] = useState('г. Москва, ул. Центральная, д. 10, Серверная 1');
  const [reportScope, setReportScope] = useState('all'); // 'all' or 'active'
  const [includeSwitches, setIncludeSwitches] = useState(true);
  const [includePortsTable, setIncludePortsTable] = useState(true);
  const [includePatchPanels, setIncludePatchPanels] = useState(true);
  const [includeVlans, setIncludeVlans] = useState(true);
  const [includeIpam, setIncludeIpam] = useState(true);
  const [includeServers, setIncludeServers] = useState(true);
  const [includeRack, setIncludeRack] = useState(true);

  const printAreaRef = useRef(null);

  const targetSwitches = reportScope === 'active' && activeSwitch
    ? [activeSwitch]
    : switches;

  // Statistics
  const stats = useMemo(() => {
    let totalPorts = 0;
    let accessPorts = 0;
    let trunkPorts = 0;
    let poePorts = 0;
    let linkedPorts = 0;

    targetSwitches.forEach(sw => {
      (sw.ports || []).forEach(p => {
        totalPorts++;
        if (p.mode === 'access') accessPorts++;
        if (p.mode === 'trunk') trunkPorts++;
        if (p.poe) poePorts++;
        if (p.linkedSwitchId) linkedPorts++;
      });
    });

    let totalPatchPorts = 0;
    let connectedPatchPorts = 0;
    patchPanels.forEach(pp => {
      (pp.ports || []).forEach(p => {
        totalPatchPorts++;
        if (p.connectedSwitchId) connectedPatchPorts++;
      });
    });

    let totalVms = 0;
    servers.forEach(s => {
      totalVms += (s.vms || []).length;
    });

    return {
      totalSwitches: targetSwitches.length,
      totalPorts,
      accessPorts,
      trunkPorts,
      poePorts,
      linkedPorts,
      totalPatchPanels: patchPanels.length,
      totalPatchPorts,
      connectedPatchPorts,
      totalVlans: vlans.length,
      totalIpAllocations: ipAllocations.length,
      totalServers: servers.length,
      totalVms
    };
  }, [targetSwitches, patchPanels, vlans, ipAllocations, servers]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    if (!printAreaRef.current) return;
    const content = printAreaRef.current.innerHTML;
    const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Паспорт узла связи — ${companyName}</title>
  <style>
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 24px; color: #1e293b; background: #fff; font-size: 11px; line-height: 1.4; }
    h1 { font-size: 18px; margin-bottom: 4px; color: #0f172a; text-transform: uppercase; font-weight: bold; }
    h2 { font-size: 13px; margin-top: 22px; margin-bottom: 6px; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; color: #1e293b; font-weight: bold; text-transform: uppercase; }
    h3 { font-size: 12px; margin-top: 14px; margin-bottom: 4px; color: #2563eb; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 9px; color: #475569; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-family: monospace; font-weight: bold; color: #fff; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; }
    .stats-box { display: flex; gap: 12px; margin-bottom: 16px; border: 1px solid #cbd5e1; padding: 8px 12px; background: #f8fafc; border-radius: 4px; font-size: 10px; }
    .stats-item { flex: 1; text-align: center; }
    .stats-item strong { display: block; font-size: 14px; color: #0f172a; }
    @media print {
      body { margin: 0; padding: 10mm; }
      .page-break { page-break-after: always; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Паспорт_сети_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate CSV / Excel XML file
  const handleExportCsv = () => {
    const csvSections = [];

    // Header
    csvSections.push(`"ТЕХНИЧЕСКИЙ ПАСПОРТ СЕТЕВОГО УЗЛА СВЯЗИ"`);
    csvSections.push(`"Объект:";"${companyName}";"Адрес:";"${facilityAddress}"`);
    csvSections.push(`"Инженер:";"${engineerName}";"Дата составления:";"${new Date().toLocaleDateString('ru-RU')}"`);
    csvSections.push(``);

    // Section 1: Switches
    if (includeSwitches) {
      csvSections.push(`"1. РЕЕСТР КОММУТАТОРОВ"`);
      csvSections.push(`"Имя устройства";"Вендор";"Модель";"IP-адрес";"MAC-адрес";"Локация / Юнит";"Портов"`);
      targetSwitches.forEach(sw => {
        csvSections.push(`"${sw.name}";"${sw.vendor}";"${sw.model}";"${sw.ip || ''}";"${sw.mac || ''}";"${sw.location || ''}";"${sw.ports?.length || 24}"`);
      });
      csvSections.push(``);
    }

    // Section 2: Switch Ports
    if (includePortsTable) {
      csvSections.push(`"2. КАБЕЛЬНЫЙ ЖУРНАЛ ПОРТОВ КОММУТАТОРОВ"`);
      csvSections.push(`"Коммутатор";"Порт #";"Имя порта";"Режим";"PVID / Нативный VLAN";"Тегированные VLAN";"Подключение (Куда ведет)";"Описание"`);
      targetSwitches.forEach(sw => {
        (sw.ports || []).forEach(p => {
          const v = vlans.find(vlan => vlan.id === p.pvid);
          const vlanLabel = v ? `VLAN ${v.id} (${v.name})` : `VLAN ${p.pvid || 1}`;
          const taggedStr = (p.taggedVlans || []).join(', ');
          csvSections.push(`"${sw.name}";"${p.number}";"${p.name || ''}";"${p.mode}";"${vlanLabel}";"${taggedStr}";"${p.connectedTo || ''}";"${p.description || ''}"`);
        });
      });
      csvSections.push(``);
    }

    // Section 3: Patch Panels
    if (includePatchPanels && patchPanels.length > 0) {
      csvSections.push(`"3. СКС И ПАТЧ-ПАНЕЛИ"`);
      csvSections.push(`"Патч-панель";"Порт #";"Кабинет";"Розетка";"Маркировка кабеля";"Тип кабеля";"Подключенный коммутатор и порт"`);
      patchPanels.forEach(pp => {
        (pp.ports || []).forEach(port => {
          const sw = switches.find(s => s.id === port.connectedSwitchId);
          const swPort = sw?.ports?.find(sp => sp.id === port.connectedSwitchPortId || sp.number === port.connectedSwitchPortId);
          const connStr = sw ? `${sw.name}:${swPort?.name || swPort?.number || port.connectedSwitchPortId}` : 'Свободен';
          csvSections.push(`"${pp.name}";"${port.number}";"${port.room || ''}";"${port.socket || ''}";"${port.cableLabel || ''}";"${port.cableType || 'Cat.6 UTP'}";"${connStr}"`);
        });
      });
      csvSections.push(``);
    }

    // Section 4: VLAN Plan
    if (includeVlans && vlans.length > 0) {
      csvSections.push(`"4. ПЛАН СЕТЕЙ VLAN"`);
      csvSections.push(`"VLAN ID";"Имя сегмента";"IP Подсеть";"Шлюз";"DHCP Диапазон";"DNS";"Назначение"`);
      vlans.forEach(v => {
        csvSections.push(`"${v.id}";"${v.name}";"${v.subnet || ''}";"${v.gateway || ''}";"${v.dhcpRange || ''}";"${v.dns || ''}";"${v.description || ''}"`);
      });
      csvSections.push(``);
    }

    // Section 5: IPAM
    if (includeIpam && ipAllocations.length > 0) {
      csvSections.push(`"5. ТАБЛИЦА IPAM (ВЫДЕЛЕННЫЕ IP-АДРЕСА)"`);
      csvSections.push(`"IP-адрес";"Имя хоста / FQDN";"VLAN";"MAC-адрес";"Тип устройства";"Статус";"Локация";"Описание"`);
      ipAllocations.forEach(ip => {
        csvSections.push(`"${ip.ip}";"${ip.hostname || ''}";"${ip.vlanId}";"${ip.mac || ''}";"${ip.type || ''}";"${ip.status || ''}";"${ip.location || ''}";"${ip.description || ''}"`);
      });
      csvSections.push(``);
    }

    // Section 6: Servers & Virtual Machines
    if (includeServers && servers.length > 0) {
      csvSections.push(`"6. СЕРВЕРЫ И ВИРТУАЛЬНЫЕ МАШИНЫ"`);
      csvSections.push(`"Хост / Узел";"Вендор / Модель";"IP управления";"MAC-адрес";"CPU";"RAM";"VMID";"Имя ВМ";"IP ВМ";"VLAN ВМ";"vCPU";"RAM ВМ";"Статус ВМ"`);
      servers.forEach(srv => {
        if (!srv.vms || srv.vms.length === 0) {
          csvSections.push(`"${srv.name}";"${srv.vendor} ${srv.model}";"${srv.ip || ''}";"${srv.mac || ''}";"${srv.cpu || ''}";"${srv.ram || ''}";"—";"—";"—";"—";"—";"—";"—"`);
        } else {
          srv.vms.forEach(vm => {
            csvSections.push(`"${srv.name}";"${srv.vendor} ${srv.model}";"${srv.ip || ''}";"${srv.mac || ''}";"${srv.cpu || ''}";"${srv.ram || ''}";"${vm.vmid || ''}";"${vm.name || ''}";"${vm.ip || ''}";"VLAN ${vm.vlan || 1}";"${vm.cores || 2}";"${vm.ram || ''}";"${vm.status || ''}"`);
          });
        }
      });
      csvSections.push(``);
    }

    // Section 7: Rack Units
    if (includeRack) {
      csvSections.push(`"7. РАЗМЕЩЕНИЕ ОБОРУДОВАНИЯ В СТОЙКЕ 42U"`);
      csvSections.push(`"Юнит";"Устройство / Панель";"Тип";"Модель";"Локация";"Емкость"`);
      const allRackItems = [...switches, ...patchPanels, ...servers].map(dev => {
        const match = (dev.location || '').match(/unit\s*(\d+)/i) || (dev.location || '').match(/u\s*(\d+)/i);
        const unit = dev.unit || (match ? parseInt(match[1]) : 1);
        return { ...dev, unit };
      }).sort((a, b) => b.unit - a.unit);

      allRackItems.forEach(item => {
        const isPP = !item.vendor && !item.cpu;
        const isServer = Boolean(item.cpu || item.vms || item.role === 'hypervisor' || item.type === 'hypervisor');
        const typeStr = isPP ? 'Патч-панель СКС' : isServer ? 'Сервер' : 'Коммутатор L2/L3';
        csvSections.push(`"Unit ${item.unit}";"${item.name}";"${typeStr}";"${item.model || ''}";"${item.location || ''}";"${item.ports?.length || 24} портов"`);
      });
      csvSections.push(``);
    }

    const csvContent = '\uFEFF' + csvSections.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Паспорт_сети_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Specialized Cabling Journal (ГОСТ Р 53246-2008 / ANSI/TIA-606-B)
  const handleExportGostJournal = () => {
    const lines = [];
    lines.push(`"КАБЕЛЬНЫЙ ЖУРНАЛ СКС ПО ГОСТ Р 53246-2008 / ANSI/TIA-606-B"`);
    lines.push(`"Объект:";"${companyName}";"Адрес:";"${facilityAddress}"`);
    lines.push(`"Дата формирования:";"${new Date().toLocaleDateString('ru-RU')}";"Ответственный:";"${engineerName}"`);
    lines.push(``);
    lines.push(`"Индекс линии (Кабель)";"Откуда (Кросс / Панель)";"Порт ПП";"Куда (Рабочее место)";"Розетка на стене";"Тип кабеля";"Категория";"Длина трассы, м";"Коммутатор L2";"Порт свитча";"VLAN (PVID)";"Статус линии"`);

    let lineIndex = 1;
    patchPanels.forEach(pp => {
      (pp.ports || []).forEach(port => {
        const sw = switches.find(s => s.id === port.connectedSwitchId);
        const swPort = sw?.ports?.find(sp => sp.id === port.connectedSwitchPortId || sp.number === port.connectedSwitchPortId);
        const cableId = port.cableLabel || `К-${String(lineIndex).padStart(3, '0')}`;
        const room = port.room || 'Не указан';
        const socket = port.socket || `Р-${port.number}`;
        const cableType = port.cableType || 'UTP Cat.6';
        const cat = cableType.includes('6A') ? 'Cat.6A' : cableType.includes('6') ? 'Cat.6' : 'Cat.5e';
        const length = (parseInt(port.cableLength) || 25);
        const swName = sw ? sw.name : '—';
        const portName = swPort ? (swPort.name || `Port ${swPort.number}`) : '—';
        const pvid = swPort?.pvid ? `VLAN ${swPort.pvid}` : '—';
        const st = port.status === 'connected' ? 'В эксплуатации' : port.status === 'reserved' ? 'В резерве' : 'Свободен';

        lines.push(`"${cableId}";"${pp.name}";"${port.number}";"${room}";"${socket}";"${cableType}";"${cat}";"${length}";"${swName}";"${portName}";"${pvid}";"${st}"`);
        lineIndex++;
      });
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Кабельный_журнал_ГОСТ_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export 42U Rack Elevation as Vector SVG Schema
  const handleExportRackSvg = () => {
    const rackItems = [...switches, ...patchPanels, ...servers].map(dev => {
      const match = (dev.location || '').match(/unit\s*(\d+)/i) || (dev.location || '').match(/u\s*(\d+)/i);
      const unit = dev.unit || (match ? parseInt(match[1]) : 1);
      const height = dev.unitHeight || 1;
      return { ...dev, unit, height };
    }).sort((a, b) => b.unit - a.unit);

    const svgHeight = 42 * 24 + 140;
    const svgWidth = 640;

    let unitsSvg = '';
    for (let u = 42; u >= 1; u--) {
      const y = 80 + (42 - u) * 24;
      const item = rackItems.find(it => it.unit === u);
      const isPP = item && !item.vendor && !item.cpu;
      const isServer = item && (item.cpu || item.vms || item.role === 'hypervisor' || item.type === 'hypervisor');
      const isSwitch = item && !isPP && !isServer;

      unitsSvg += `
        <!-- Unit ${u} -->
        <rect x="60" y="${y}" width="510" height="23" rx="2" fill="${
          item
            ? isPP
              ? '#1e1b4b'
              : isServer
              ? '#0f766e'
              : '#0f172a'
            : '#f8fafc'
        }" stroke="#cbd5e1" stroke-width="1"/>
        <text x="35" y="${y + 16}" fill="#64748b" font-size="11" font-family="monospace" font-weight="bold">${u}U</text>
        <text x="585" y="${y + 16}" fill="#64748b" font-size="11" font-family="monospace" font-weight="bold">${u}U</text>
        ${item ? `
          <rect x="65" y="${y + 2}" width="8" height="19" rx="1" fill="#475569"/>
          <rect x="557" y="${y + 2}" width="8" height="19" rx="1" fill="#475569"/>
          <text x="85" y="${y + 16}" fill="#ffffff" font-size="11" font-family="sans-serif" font-weight="bold">
            ${item.name} (${item.model || (isPP ? 'Patch Panel' : isServer ? 'Server' : 'Switch')})
          </text>
          <text x="440" y="${y + 16}" fill="#cbd5e1" font-size="10" font-family="monospace">
            ${isServer ? `${item.vms?.length || 0} ВМ • ${item.ram || ''}` : `${item.ports?.length || 24} портов`}
          </text>
        ` : `
          <text x="280" y="${y + 15}" fill="#94a3b8" font-size="10" font-family="sans-serif">Свободный Unit</text>
        `}
      `;
    }

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="60" y="35" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0f172a">СХЕМА СЕРВЕРНОЙ СТОЙКИ 42U — ${companyName}</text>
  <text x="60" y="55" font-family="sans-serif" font-size="11" fill="#64748b">Локация: ${facilityAddress} | Дата: ${new Date().toLocaleDateString('ru-RU')}</text>
  
  <!-- Rack Frame 19" -->
  <rect x="55" y="75" width="520" height="${42 * 24 + 10}" rx="4" fill="none" stroke="#334155" stroke-width="3"/>
  ${unitsSvg}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Схема_стойки_42U_${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className={`w-full max-w-6xl h-[94vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Top Control Bar (Strict h-9 buttons) */}
        <div className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Паспорт объекта и кабельный журнал
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  PDF • Excel • HTML
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Полный технический паспорт узла связи со спецификацией портов, СКС, VLAN и IPAM
              </p>
            </div>
          </div>

          {/* Action buttons (Uniform h-9 height) */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="Экспорт всех таблиц паспорта в Excel / CSV с кодировкой UTF-8 BOM"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Паспорт (Excel)</span>
            </button>

            <button
              onClick={handleExportGostJournal}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="Экспорт специализированного кабельного журнала СКС по ГОСТ Р 53246-2008 / ANSI/TIA-606-B"
            >
              <Cable className="w-3.5 h-3.5 text-amber-500" />
              <span>Журнал ГОСТ</span>
            </button>

            <button
              onClick={handleExportRackSvg}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="Экспорт векторного чертежа схемы размещения оборудования в 42U стойке (SVG)"
            >
              <Server className="w-3.5 h-3.5 text-purple-400" />
              <span>Стойка 42U (SVG)</span>
            </button>

            <button
              onClick={handleDownloadHtml}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="Скачать автономный HTML файл для офлайн просмотра"
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>HTML</span>
            </button>

            <button
              onClick={handlePrint}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              title="Открыть системный диалог печати (сохранить как PDF на А4)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Печать / Сохранить в PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Report Customization Toolbar */}
        <div className={`px-5 py-3 border-b text-xs flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          {/* Metadata Inputs */}
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Объект:</span>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={`text-xs px-2.5 h-8 rounded-lg border w-56 outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Адрес:</span>
              <input
                type="text"
                value={facilityAddress}
                onChange={(e) => setFacilityAddress(e.target.value)}
                className={`text-xs px-2.5 h-8 rounded-lg border w-60 outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Инженер:</span>
              <input
                type="text"
                value={engineerName}
                onChange={(e) => setEngineerName(e.target.value)}
                className={`text-xs px-2.5 h-8 rounded-lg border w-44 outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
                }`}
              />
            </div>
          </div>

          {/* Scope & Checkboxes */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={reportScope}
              onChange={(e) => setReportScope(e.target.value)}
              className={`text-xs px-2.5 h-8 rounded-lg border outline-none ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            >
              <option value="all">Все коммутаторы ({switches.length})</option>
              {activeSwitch && (
                <option value="active">Только {activeSwitch.name}</option>
              )}
            </select>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includePortsTable}
                onChange={(e) => setIncludePortsTable(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>Порты</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includePatchPanels}
                onChange={(e) => setIncludePatchPanels(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>СКС</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVlans}
                onChange={(e) => setIncludeVlans(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>VLAN</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeIpam}
                onChange={(e) => setIncludeIpam(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>IPAM</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeServers}
                onChange={(e) => setIncludeServers(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>Серверы ({servers.length})</span>
            </label>

            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeRack}
                onChange={(e) => setIncludeRack(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>Стойка</span>
            </label>
          </div>
        </div>

        {/* Live Printable Preview Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/50 dark:bg-slate-950/60 flex justify-center">
          {/* Printable White Sheet Document */}
          <div
            id="print-document"
            ref={printAreaRef}
            className="w-full max-w-4xl bg-white text-slate-900 shadow-2xl rounded-sm p-8 sm:p-12 font-sans space-y-7 select-text"
          >
            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-semibold">
                  ТЕХНИЧЕСКИЙ ПАСПОРТ СЕТЕВОГО УЗЛА СВЯЗИ
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1">
                  {companyName}
                </h1>
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  <p>Адрес объекта: <strong>{facilityAddress}</strong></p>
                  <p>Ответственный инженер: <strong>{engineerName}</strong> • Дата: <strong>{new Date().toLocaleDateString('ru-RU')}</strong></p>
                </div>
              </div>
              <div className="text-right font-mono text-[10px] text-slate-400">
                <div className="font-bold text-slate-700">ДОКУМЕНТ: ПС-СКС-01</div>
                <div>СТАТУС: ДЕЙСТВУЕТ</div>
                <div>РЕВИЗИЯ: {new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>

            {/* Network Statistics Overview Box */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 p-3 bg-slate-50 border border-slate-300 rounded-sm text-center text-[10px]">
              <div>
                <span className="text-slate-500 block">Коммутаторы</span>
                <strong className="text-xs font-mono font-bold text-slate-900">{stats.totalSwitches} шт.</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Всего портов</span>
                <strong className="text-xs font-mono font-bold text-slate-900">{stats.totalPorts}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Access / Trunk</span>
                <strong className="text-xs font-mono font-bold text-blue-700">{stats.accessPorts} / {stats.trunkPorts}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">PoE порты</span>
                <strong className="text-xs font-mono font-bold text-amber-600">{stats.poePorts}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Розетки СКС</span>
                <strong className="text-xs font-mono font-bold text-slate-900">{stats.connectedPatchPorts} из {stats.totalPatchPorts}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">VLAN / IPAM</span>
                <strong className="text-xs font-mono font-bold text-indigo-700">{stats.totalVlans} / {stats.totalIpAllocations}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Серверы / ВМ</span>
                <strong className="text-xs font-mono font-bold text-purple-700">{stats.totalServers} / {stats.totalVms}</strong>
              </div>
            </div>

            {/* SECTION 1: Summary of Network Switches */}
            {includeSwitches && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-900 border-b border-blue-200 pb-1 mb-2.5">
                  1. Сводный реестр активного оборудования (Коммутаторы)
                </h2>
                <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-mono">
                      <th className="p-2 border border-slate-300">Имя устройства</th>
                      <th className="p-2 border border-slate-300">Вендор / Модель</th>
                      <th className="p-2 border border-slate-300">IP-адрес</th>
                      <th className="p-2 border border-slate-300">MAC-адрес</th>
                      <th className="p-2 border border-slate-300">Локация / Юнит</th>
                      <th className="p-2 border border-slate-300 text-center">Порты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetSwitches.map((sw) => (
                      <tr key={sw.id} className="border-b border-slate-200">
                        <td className="p-2 border border-slate-300 font-mono font-bold text-blue-700">
                          {sw.name}
                        </td>
                        <td className="p-2 border border-slate-300">
                          {sw.vendor} {sw.model}
                        </td>
                        <td className="p-2 border border-slate-300 font-mono text-emerald-700 font-semibold">
                          {sw.ip || '—'}
                        </td>
                        <td className="p-2 border border-slate-300 font-mono text-[11px]">
                          {sw.mac || '—'}
                        </td>
                        <td className="p-2 border border-slate-300 text-[11px]">
                          {sw.location || '—'}
                        </td>
                        <td className="p-2 border border-slate-300 font-mono text-center">
                          {sw.copperPorts || 24}P RJ45 {sw.sfpPorts ? `+ ${sw.sfpPorts} SFP` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SECTION 2: Detailed Port-by-Port Table */}
            {includePortsTable && targetSwitches.map((sw) => (
              <div key={`ports-${sw.id}`} className="page-break pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-blue-900 border-b border-blue-200 pb-1 mb-2">
                  2. Кабельный журнал портов: {sw.name} ({sw.model})
                </h2>
                <div className="text-[10px] text-slate-500 font-mono mb-2 flex justify-between">
                  <span>IP: {sw.ip || 'Не назначен'} • Размещение: {sw.location || 'Серверная'}</span>
                  <span>Всего портов: {sw.ports?.length || 0}</span>
                </div>

                <table className="w-full text-left text-[10px] border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[9px] uppercase font-mono">
                      <th className="p-1 border border-slate-300 w-7 text-center">#</th>
                      <th className="p-1 border border-slate-300 w-16">Порт</th>
                      <th className="p-1 border border-slate-300 w-14">Режим</th>
                      <th className="p-1 border border-slate-300 w-24">PVID (Untag)</th>
                      <th className="p-1 border border-slate-300">Tagged VLAN</th>
                      <th className="p-1 border border-slate-300">Подключение (Линк)</th>
                      <th className="p-1 border border-slate-300">Назначение / Описание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sw.ports || []).map((p) => {
                      const vlan = vlans.find(v => v.id === p.pvid);
                      return (
                        <tr key={p.id} className="border-b border-slate-200">
                          <td className="p-1 border border-slate-300 font-mono text-center font-bold text-slate-600">
                            {p.number}
                          </td>
                          <td className="p-1 border border-slate-300 font-mono font-medium">
                            {p.name || `Port ${p.number}`}
                          </td>
                          <td className="p-1 border border-slate-300 font-mono uppercase text-[9px]">
                            <span className={p.mode === 'trunk' ? 'font-bold text-purple-700' : 'text-slate-700'}>
                              {p.mode}
                            </span>
                          </td>
                          <td className="p-1 border border-slate-300 font-mono">
                            <span
                              className="px-1 py-0.2 rounded-xs text-[9px] font-bold text-white"
                              style={{ backgroundColor: vlan?.color || '#64748b' }}
                            >
                              {p.pvid} {vlan?.name ? `(${vlan.name})` : ''}
                            </span>
                          </td>
                          <td className="p-1 border border-slate-300 font-mono text-[9px] text-slate-500">
                            {p.taggedVlans?.length > 0 ? p.taggedVlans.join(', ') : '—'}
                          </td>
                          <td className="p-1 border border-slate-300 font-medium text-slate-800">
                            {p.connectedTo || '—'}
                          </td>
                          <td className="p-1 border border-slate-300 text-slate-600">
                            {p.description || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {/* SECTION 3: Structured Cabling & Patch Panels */}
            {includePatchPanels && patchPanels.length > 0 && (
              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1 mb-2.5">
                  3. Структурированная кабельная система (Патч-панели и Розетки СКС)
                </h2>

                {patchPanels.map((pp) => (
                  <div key={pp.id} className="mb-4">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 font-mono mb-1.5">
                      <span>{pp.name} ({pp.model})</span>
                      <span className="text-[10px] text-slate-500">{pp.location || ''}</span>
                    </div>

                    <table className="w-full text-left text-[10px] border border-slate-300 border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-[9px] uppercase font-mono">
                          <th className="p-1 border border-slate-300 w-8 text-center">ПП#</th>
                          <th className="p-1 border border-slate-300">Кабинет</th>
                          <th className="p-1 border border-slate-300">Розетка</th>
                          <th className="p-1 border border-slate-300">Маркировка</th>
                          <th className="p-1 border border-slate-300">Кабель</th>
                          <th className="p-1 border border-slate-300">Коммутатор и порт</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pp.ports || []).map((port) => {
                          const sw = switches.find(s => s.id === port.connectedSwitchId);
                          const swPort = sw?.ports?.find(sp => sp.id === port.connectedSwitchPortId || sp.number === port.connectedSwitchPortId);

                          return (
                            <tr key={port.id} className="border-b border-slate-200">
                              <td className="p-1 border border-slate-300 font-mono text-center font-bold text-slate-600">
                                {port.number}
                              </td>
                              <td className="p-1 border border-slate-300 font-medium">
                                {port.room || '—'}
                              </td>
                              <td className="p-1 border border-slate-300 font-mono text-slate-700">
                                {port.socket || '—'}
                              </td>
                              <td className="p-1 border border-slate-300 font-mono text-blue-700 font-semibold">
                                {port.cableLabel || '—'}
                              </td>
                              <td className="p-1 border border-slate-300 text-slate-500 text-[9px]">
                                {port.cableType || 'UTP Cat.6'}
                              </td>
                              <td className="p-1 border border-slate-300 font-mono text-emerald-700">
                                {sw ? `${sw.name}:${swPort?.name || swPort?.number || port.connectedSwitchPortId}` : '— Свободен'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION 4: VLAN Plan */}
            {includeVlans && vlans.length > 0 && (
              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-200 pb-1 mb-2.5">
                  4. План виртуальных сетей (VLAN Directory)
                </h2>
                <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-mono">
                      <th className="p-1.5 border border-slate-300 w-16 text-center">VLAN ID</th>
                      <th className="p-1.5 border border-slate-300">Имя сегмента</th>
                      <th className="p-1.5 border border-slate-300">IP-подсеть</th>
                      <th className="p-1.5 border border-slate-300">Шлюз</th>
                      <th className="p-1.5 border border-slate-300">DHCP / DNS</th>
                      <th className="p-1.5 border border-slate-300">Назначение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vlans.map((v) => (
                      <tr key={v.id} className="border-b border-slate-200 text-[11px]">
                        <td className="p-1.5 border border-slate-300 font-mono text-center font-bold">
                          <span
                            className="px-1.5 py-0.5 rounded-xs text-white"
                            style={{ backgroundColor: v.color || '#64748b' }}
                          >
                            {v.id}
                          </span>
                        </td>
                        <td className="p-1.5 border border-slate-300 font-bold text-slate-900">
                          {v.name}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono text-blue-700 font-semibold">
                          {v.subnet || '—'}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono text-slate-700">
                          {v.gateway || '—'}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono text-[10px] text-slate-500">
                          {v.dhcpRange ? `${v.dhcpRange}` : 'Static'} {v.dns ? `| DNS: ${v.dns}` : ''}
                        </td>
                        <td className="p-1.5 border border-slate-300 text-slate-600">
                          {v.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SECTION 5: IPAM Allocations */}
            {includeIpam && ipAllocations.length > 0 && (
              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-900 border-b border-emerald-200 pb-1 mb-2.5">
                  5. Реестр сетевых адресов IPAM (Выделенные IP)
                </h2>
                <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-mono">
                      <th className="p-1.5 border border-slate-300">IP-адрес</th>
                      <th className="p-1.5 border border-slate-300">Хост / FQDN</th>
                      <th className="p-1.5 border border-slate-300">VLAN</th>
                      <th className="p-1.5 border border-slate-300">MAC-адрес</th>
                      <th className="p-1.5 border border-slate-300">Тип</th>
                      <th className="p-1.5 border border-slate-300">Локация / Назначение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipAllocations.slice(0, 30).map((item) => (
                      <tr key={item.id} className="border-b border-slate-200 text-[11px]">
                        <td className="p-1.5 border border-slate-300 font-mono font-bold text-emerald-700">
                          {item.ip}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono font-semibold text-slate-900">
                          {item.hostname || '—'}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono">
                          VLAN {item.vlanId}
                        </td>
                        <td className="p-1.5 border border-slate-300 font-mono text-[10px] text-slate-600">
                          {item.mac || '—'}
                        </td>
                        <td className="p-1.5 border border-slate-300 capitalize text-slate-700">
                          {item.type || 'device'}
                        </td>
                        <td className="p-1.5 border border-slate-300 text-slate-600 text-[10px]">
                          {item.location ? `${item.location} • ` : ''}{item.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SECTION 6: Servers and Virtual Machines */}
            {includeServers && servers.length > 0 && (
              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 border-b border-indigo-200 pb-1 mb-2.5">
                  6. Вычислительная инфраструктура и виртуализация (Серверы & ВМ)
                </h2>
                <div className="space-y-3">
                  {servers.map((srv) => (
                    <div key={srv.id} className="border border-slate-300 rounded-sm p-3 bg-slate-50/50">
                      <div className="flex justify-between items-center text-xs mb-2 pb-1 border-b border-slate-200">
                        <div className="font-bold text-slate-900">
                          {srv.name} <span className="font-normal text-slate-500 font-sans">({srv.vendor} {srv.model})</span>
                        </div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          IP: {srv.ip || '—'} {srv.mac ? `• MAC: ${srv.mac}` : ''}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-600 mb-2">
                        <div><strong className="text-slate-700">ОС / Платформа:</strong> {srv.os || 'Linux'} ({srv.role || srv.type})</div>
                        <div><strong className="text-slate-700">CPU / RAM:</strong> {srv.cpu || '—'} / {srv.ram || '—'}</div>
                        <div><strong className="text-slate-700">Локация / Юнит:</strong> {srv.location || '—'}{srv.unit ? ` (Unit ${srv.unit})` : ''}</div>
                      </div>

                      {/* VMs Table */}
                      {(srv.vms || []).length > 0 ? (
                        <table className="w-full text-left text-[10px] border border-slate-300 border-collapse bg-white">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 uppercase font-mono">
                              <th className="p-1 border border-slate-300">VMID</th>
                              <th className="p-1 border border-slate-300">Имя ВМ</th>
                              <th className="p-1 border border-slate-300">Назначение</th>
                              <th className="p-1 border border-slate-300">IP-адрес</th>
                              <th className="p-1 border border-slate-300">VLAN</th>
                              <th className="p-1 border border-slate-300">Ресурсы</th>
                              <th className="p-1 border border-slate-300">Статус</th>
                            </tr>
                          </thead>
                          <tbody>
                            {srv.vms.map(vm => (
                              <tr key={vm.vmid} className="border-b border-slate-200">
                                <td className="p-1 border border-slate-300 font-mono font-bold">#{vm.vmid}</td>
                                <td className="p-1 border border-slate-300 font-semibold text-slate-900">{vm.name}</td>
                                <td className="p-1 border border-slate-300 text-slate-600">{vm.role || '—'}</td>
                                <td className="p-1 border border-slate-300 font-mono text-emerald-700 font-semibold">{vm.ip || '—'}</td>
                                <td className="p-1 border border-slate-300 font-mono">VLAN {vm.vlan || 1}</td>
                                <td className="p-1 border border-slate-300 font-mono">{vm.cores || 2} vCPU / {vm.ram || '4G'}</td>
                                <td className="p-1 border border-slate-300">
                                  <span className={`px-1 rounded-xs font-semibold ${vm.status === 'running' ? 'text-emerald-700' : 'text-slate-500'}`}>
                                    {vm.status === 'running' ? 'Active' : 'Stopped'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">Виртуальные машины не настроены</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 7: 42U Rack Layout Scheme */}
            {includeRack && (
              <div className="pt-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 mb-2.5">
                  7. Физическое размещение в серверных стойках 42U
                </h2>
                <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-mono">
                      <th className="p-1.5 border border-slate-300 w-16 text-center">Юнит</th>
                      <th className="p-1.5 border border-slate-300">Устройство / Панель</th>
                      <th className="p-1.5 border border-slate-300">Тип оборудования</th>
                      <th className="p-1.5 border border-slate-300">Локация / Стойка</th>
                      <th className="p-1.5 border border-slate-300 text-center">Емкость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...switches, ...patchPanels].map((dev) => {
                      const isPP = !dev.vendor;
                      const match = (dev.location || '').match(/unit\s*(\d+)/i) || (dev.location || '').match(/u\s*(\d+)/i);
                      const unitStr = match ? `Unit ${match[1]}` : '—';

                      return (
                        <tr key={dev.id} className="border-b border-slate-200 text-[11px]">
                          <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-700">
                            {unitStr}
                          </td>
                          <td className="p-1.5 border border-slate-300 font-bold">
                            {dev.name} {dev.model ? `(${dev.model})` : ''}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-[11px]">
                            {isPP ? 'Патч-панель СКС' : 'Сетевой коммутатор L2/L3'}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-[11px] text-slate-600">
                            {dev.location || '—'}
                          </td>
                          <td className="p-1.5 border border-slate-300 font-mono text-center">
                            {dev.ports?.length || 24}P
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Document Signatures Footer */}
            <div className="pt-8 border-t-2 border-slate-400 flex justify-between items-center text-xs text-slate-600">
              <div>
                <div>Составил: __________________ / {engineerName} /</div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">Подпись и расшифровка инженера</div>
              </div>
              <div className="text-right">
                <div>Утвердил: __________________ / Руководитель ИТ /</div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">Подпись и печать организации</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
