import React, { useState, useMemo } from 'react';
import {
  Server,
  Cpu,
  Layers,
  ArrowRight,
  Zap,
  Cable,
  CheckCircle2,
  Gauge,
  Thermometer,
  Weight,
  Activity,
  Sliders,
  ChevronRight,
  Info,
  Download,
  Image,
  FileText,
  Printer,
  FileSpreadsheet
} from 'lucide-react';
import { exportRackSvg, exportRackPng, exportRackCsv, printDiagram } from '../utils/exportGraphics';

export function RackView({
  switches = [],
  patchPanels = [],
  servers = [],
  onSelectSwitch,
  onSelectPatchPanel,
  onSelectServer,
  theme = 'dark'
}) {
  const [showPatchCords, setShowPatchCords] = useState(true);
  const [selectedCable, setSelectedCable] = useState(null); // highlight specific cable trace
  const [hoveredDeviceId, setHoveredDeviceId] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Combine switches, patch panels and servers into devices list with deviceType
  const allDevices = useMemo(() => {
    const sws = (switches || []).map(s => ({ ...s, deviceType: 'switch' }));
    const pps = (patchPanels || []).map(p => ({ ...p, deviceType: 'patchPanel' }));
    const srvs = (servers || []).map(s => ({ ...s, deviceType: 'server' }));
    return [...sws, ...pps, ...srvs];
  }, [switches, patchPanels, servers]);

  // Extract rack names from locations
  const rackGroups = useMemo(() => {
    const groups = {};

    allDevices.forEach(dev => {
      const loc = dev.location || 'Без стойки';
      let rackName = loc;
      const match = loc.match(/(?:стойк[ае]|шкаф)[^,]+/i);
      if (match) {
        rackName = match[0].trim();
      } else {
        const parts = loc.split(',');
        if (parts.length > 0) rackName = parts[0].trim();
      }

      if (!groups[rackName]) {
        groups[rackName] = [];
      }
      groups[rackName].push(dev);
    });

    return groups;
  }, [allDevices]);

  const rackNames = Object.keys(rackGroups);
  const [selectedRack, setSelectedRack] = useState(rackNames[0] || '');

  // Active devices in this rack
  const currentRackDevices = rackGroups[selectedRack] || [];

  // Parse unit numbers for devices
  const unitMap = useMemo(() => {
    const map = {};
    const unplaced = [];

    currentRackDevices.forEach((dev) => {
      let uNum = null;
      if (dev.unit && Number(dev.unit) >= 1 && Number(dev.unit) <= 42) {
        uNum = parseInt(dev.unit);
      } else {
        const match = (dev.location || '').match(/unit\s*(\d+)/i) || (dev.location || '').match(/u\s*(\d+)/i);
        if (match) {
          const parsed = parseInt(match[1]);
          if (parsed >= 1 && parsed <= 42) uNum = parsed;
        }
      }

      if (uNum) {
        const height = Number(dev.unitHeight) || 1;
        for (let h = 0; h < height; h++) {
          const targetU = uNum + h;
          if (targetU <= 42) {
            map[targetU] = {
              ...dev,
              slotHeight: height,
              isMultiUnitTop: h === height - 1,
              isMultiUnitSub: h > 0
            };
          }
        }
        return;
      }
      unplaced.push(dev);
    });

    // Fill unplaced devices from top downwards
    let currentU = 42;
    unplaced.forEach(dev => {
      while (map[currentU] && currentU > 1) {
        currentU--;
      }
      if (currentU >= 1) {
        map[currentU] = dev;
        currentU--;
      }
    });

    return map;
  }, [currentRackDevices]);

  // Lookup map: deviceId -> unitNumber
  const deviceUnitLookup = useMemo(() => {
    const map = {};
    Object.entries(unitMap).forEach(([u, dev]) => {
      if (dev && dev.id) {
        map[dev.id] = parseInt(u);
      }
    });
    return map;
  }, [unitMap]);

  // Calculate DCIM Metrics
  const dcimMetrics = useMemo(() => {
    let totalWatts = 0;
    let totalPoeWatts = 0;
    let totalCopperPorts = 0;
    let totalSfpPorts = 0;
    let totalWeightKg = 0;
    let activePortsCount = 0;

    currentRackDevices.forEach(dev => {
      if (dev.deviceType === 'switch') {
        const pCount = dev.ports?.length || 24;
        // Base switch power consumption ~ 25W-60W + PoE budget
        const basePower = pCount > 24 ? 45 : 25;
        let poePower = 0;
        (dev.ports || []).forEach(p => {
          if (p.poe) poePower += 15.4; // avg 802.3af/at per active PoE port
          if (p.type === 'sfp') totalSfpPorts++;
          else totalCopperPorts++;
          if (p.enabled !== false && p.mode !== 'disabled') activePortsCount++;
        });
        totalWatts += basePower + poePower;
        totalPoeWatts += poePower;
        totalWeightKg += pCount > 24 ? 4.5 : 3.2; // approx switch weight in kg
      } else if (dev.deviceType === 'patchPanel') {
        totalWeightKg += 1.2; // 1U patch panel weight with keystones
        const pCount = dev.ports?.length || 24;
        totalCopperPorts += pCount;
      } else if (dev.deviceType === 'server') {
        const h = Number(dev.unitHeight) || 2;
        totalWatts += h * 220; // avg enterprise server draw
        totalWeightKg += h * 12; // approx server weight
        (dev.nics || []).forEach(n => {
          if (n.type === 'sfp' || n.speed?.includes('10G')) totalSfpPorts++;
          else totalCopperPorts++;
          activePortsCount++;
        });
      }
    });

    // Estimated heat output in BTU/hr (1 Watt ~ 3.41214 BTU/hr)
    const heatBtu = Math.round(totalWatts * 3.412);

    return {
      totalWatts: Math.round(totalWatts),
      totalPoeWatts: Math.round(totalPoeWatts),
      heatBtu,
      totalWeightKg: Math.round(totalWeightKg * 10) / 10,
      totalCopperPorts,
      totalSfpPorts,
      activePortsCount
    };
  }, [currentRackDevices]);

  // Identify Intra-Rack Patch Cords between devices inside this rack
  const intraRackPatchCords = useMemo(() => {
    const cords = [];
    const cordColors = [
      '#3b82f6', // blue
      '#10b981', // emerald
      '#f59e0b', // amber
      '#8b5cf6', // purple
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316'  // orange
    ];
    let colorIdx = 0;

    // 1. Cables from Patch Panels to Switches
    currentRackDevices.forEach(dev => {
      if (dev.deviceType === 'patchPanel') {
        const fromU = deviceUnitLookup[dev.id];
        if (!fromU) return;

        (dev.ports || []).forEach(ppPort => {
          if (ppPort.connectedSwitchId) {
            const toU = deviceUnitLookup[ppPort.connectedSwitchId];
            if (toU) {
              const targetSw = currentRackDevices.find(d => d.id === ppPort.connectedSwitchId);
              const targetPort = targetSw?.ports?.find(p => p.id === ppPort.connectedSwitchPortId || p.number === ppPort.connectedSwitchPortId);
              cords.push({
                id: `cord-pp-${dev.id}-${ppPort.id}`,
                fromId: dev.id,
                fromName: dev.name,
                fromPortNum: ppPort.number,
                fromPortLabel: ppPort.socket || `Порт ${ppPort.number}`,
                fromU,
                toId: ppPort.connectedSwitchId,
                toName: targetSw?.name || 'Коммутатор',
                toPortNum: targetPort?.number || ppPort.connectedSwitchPortId,
                toPortLabel: `Порт ${targetPort?.number || ppPort.connectedSwitchPortId}`,
                toU,
                color: cordColors[colorIdx % cordColors.length],
                type: 'patch-to-switch'
              });
              colorIdx++;
            }
          }
        });
      }

      // 2. Uplink cords between switches in this rack
      if (dev.deviceType === 'switch') {
        const fromU = deviceUnitLookup[dev.id];
        if (!fromU) return;

        (dev.ports || []).forEach(swPort => {
          if (swPort.linkedSwitchId && swPort.linkedSwitchId > dev.id) {
            // avoid duplicate bidirectional drawing
            const toU = deviceUnitLookup[swPort.linkedSwitchId];
            if (toU) {
              const targetSw = currentRackDevices.find(d => d.id === swPort.linkedSwitchId);
              cords.push({
                id: `cord-sw-${dev.id}-${swPort.id}`,
                fromId: dev.id,
                fromName: dev.name,
                fromPortNum: swPort.number,
                fromPortLabel: `Порт ${swPort.number}`,
                fromU,
                toId: swPort.linkedSwitchId,
                toName: targetSw?.name || 'Коммутатор',
                toPortNum: swPort.linkedPortId,
                toPortLabel: `Порт ${swPort.linkedPortId}`,
                toU,
                color: '#ef4444', // Red for switch-to-switch uplinks
                type: 'switch-to-switch'
              });
            }
          }
        });
      }

      // 3. Patch cords from Server NICs to Switches
      if (dev.deviceType === 'server') {
        const fromU = deviceUnitLookup[dev.id];
        if (fromU) {
          (dev.nics || []).forEach(nic => {
            if (nic.connectedSwitchId) {
              const toU = deviceUnitLookup[nic.connectedSwitchId];
              if (toU) {
                const targetSw = currentRackDevices.find(d => d.id === nic.connectedSwitchId);
                const targetPort = targetSw?.ports?.find(p => p.id === nic.connectedPortId || p.number === nic.connectedPortId || p.name === nic.connectedPortId);
                cords.push({
                  id: `cord-srv-${dev.id}-${nic.id}`,
                  fromId: dev.id,
                  fromName: dev.name,
                  fromPortNum: nic.name,
                  fromPortLabel: `${nic.name} (${nic.speed || '1G'}${nic.role ? ` • ${nic.role}` : ''})`,
                  fromU,
                  toId: nic.connectedSwitchId,
                  toName: targetSw?.name || 'Коммутатор',
                  toPortNum: targetPort?.number || nic.connectedPortId,
                  toPortLabel: `Порт ${targetPort?.number || targetPort?.name || nic.connectedPortId}`,
                  toU,
                  color: nic.type === 'sfp' || nic.speed?.includes('10G') ? '#f59e0b' : '#06b6d4',
                  type: 'server-to-switch'
                });
              }
            }
          });
        }
      }
    });

    return cords;
  }, [currentRackDevices, deviceUnitLookup]);

  const isLight = theme === 'light';
  const totalUnits = 42;
  const occupiedCount = currentRackDevices.length;
  const occupancyPercent = Math.round((occupiedCount / totalUnits) * 100);

  // Unit row height in pixels for the SVG cord calculations
  const unitRowHeight = 44; // px per U

  return (
    <div className={`border rounded-2xl p-5 shadow-xl transition-colors space-y-6 ${
      isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
    }`}>
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold font-mono text-slate-900 dark:text-white">
              Серверная 19" стойка (Rack Elevation & DCIM)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Физическое размещение 1U–42U, трассировка патч-кордов и мониторинг мощности стойки
          </p>
        </div>

        {/* Rack Selector & Cable Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rack Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">Стойка:</span>
            {rackNames.map(rName => (
              <button
                key={rName}
                onClick={() => {
                  setSelectedRack(rName);
                  setSelectedCable(null);
                }}
                className={`h-9 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  selectedRack === rName
                    ? 'bg-blue-600 text-white shadow-xs'
                    : (isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                }`}
              >
                <span>{rName}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedRack === rName ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {rackGroups[rName]?.length || 0}
                </span>
              </button>
            ))}
          </div>

          {/* Toggle Patch Cords Button */}
          <button
            onClick={() => setShowPatchCords(!showPatchCords)}
            className={`h-9 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              showPatchCords
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                : (isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-400')
            }`}
            title="Отобразить или скрыть соединительные патч-корды между устройствами в стойке"
          >
            <Cable className="w-3.5 h-3.5" />
            <span>{showPatchCords ? 'Патч-корды: Вкл' : 'Патч-корды: Выкл'}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-500/20 rounded-full font-bold">
              {intraRackPatchCords.length}
            </span>
          </button>

          {/* Export Rack Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                showExportMenu
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
              title="Экспорт спецификации и чертежа стойки"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Экспорт стойки</span>
            </button>

            {showExportMenu && (
              <div className={`absolute right-0 top-full mt-2 w-64 rounded-xl border shadow-2xl p-1.5 z-50 transition-all ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
              }`}>
                {/* 1. CSV Specification */}
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportRackCsv({
                      rackName: selectedRack,
                      unitMap,
                      currentRackDevices,
                      dcimMetrics
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors text-left cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-semibold">Спецификация в CSV (Excel)</div>
                    <div className="text-[10px] text-slate-400">Ведомость 1U-42U, мощность, вес</div>
                  </div>
                </button>

                {/* 2. PNG HD 2x Diagram */}
                <button
                  onClick={async () => {
                    setShowExportMenu(false);
                    setIsExportingPng(true);
                    try {
                      await exportRackPng({
                        rackName: selectedRack,
                        rackDevices: currentRackDevices,
                        unitMap,
                        intraRackPatchCords: showPatchCords ? intraRackPatchCords : [],
                        dcimMetrics,
                        isLight
                      });
                    } finally {
                      setIsExportingPng(false);
                    }
                  }}
                  disabled={isExportingPng}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-left cursor-pointer"
                >
                  <Image className="w-4 h-4 text-blue-500 shrink-0" />
                  <div>
                    <div className="font-semibold">Чертеж стойки в PNG (HD 2x)</div>
                    <div className="text-[10px] text-slate-400">Растровый снимок со шкафом</div>
                  </div>
                </button>

                {/* 3. SVG Vector Diagram */}
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportRackSvg({
                      rackName: selectedRack,
                      rackDevices: currentRackDevices,
                      unitMap,
                      intraRackPatchCords: showPatchCords ? intraRackPatchCords : [],
                      dcimMetrics,
                      isLight
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-500/10 hover:text-purple-500 transition-colors text-left cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                  <div>
                    <div className="font-semibold">Чертеж стойки в SVG (Вектор)</div>
                    <div className="text-[10px] text-slate-400">Для Visio, AutoCAD, документации</div>
                  </div>
                </button>

                <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />

                {/* 4. Print / PDF */}
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    printDiagram(`Паспорт_стойки_${selectedRack}`);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-amber-500/10 hover:text-amber-500 transition-colors text-left cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="font-semibold">Печать паспорта / В PDF</div>
                    <div className="text-[10px] text-slate-400">Паспорт стойки на стандартный лист</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DCIM Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Unit Occupancy */}
        <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Заполненность стойки</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                {occupiedCount} / {totalUnits} U
              </span>
              <span className={`text-[10px] font-mono font-bold ${
                occupancyPercent > 80 ? 'text-rose-500' : occupancyPercent > 50 ? 'text-amber-500' : 'text-emerald-500'
              }`}>
                ({occupancyPercent}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  occupancyPercent > 80 ? 'bg-rose-500' : occupancyPercent > 50 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Estimated Power & PoE */}
        <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Потребляемая мощность</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                ~{dcimMetrics.totalWatts} Вт
              </span>
            </div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 truncate mt-0.5">
              PoE нагрузка: ~{dcimMetrics.totalPoeWatts} Вт
            </div>
          </div>
        </div>

        {/* Heat Dissipation */}
        <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
            <Thermometer className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Тепловыделение</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                {dcimMetrics.heatBtu} BTU/ч
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate mt-0.5">
              ~{(dcimMetrics.totalWatts * 0.001).toFixed(2)} кВт охлаждения
            </div>
          </div>
        </div>

        {/* Weight & Port Density */}
        <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
        }`}>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
            <Weight className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Вес и плотность портов</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                ~{dcimMetrics.totalWeightKg} кг
              </span>
            </div>
            <div className="text-[10px] text-purple-600 dark:text-purple-400 truncate mt-0.5">
              Портов RJ-45: {dcimMetrics.totalCopperPorts} | SFP: {dcimMetrics.totalSfpPorts}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Cable Inspector Banner */}
      {selectedCable && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2">
            <Cable className="w-4 h-4 text-blue-500 shrink-0" />
            <div>
              <span className="font-semibold text-blue-600 dark:text-blue-400">Трасса патч-корда: </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {selectedCable.fromName} ({selectedCable.fromPortLabel}, U{selectedCable.fromU}) ⟷ {selectedCable.toName} ({selectedCable.toPortLabel}, U{selectedCable.toU})
              </span>
            </div>
          </div>
          <button
            onClick={() => setSelectedCable(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white px-2 py-0.5 rounded-sm cursor-pointer"
          >
            ✕ Сброс
          </button>
        </div>
      )}

      {/* 19-Inch Rack Frame with Realistic Rails & Interactive Patch Cords */}
      <div className="max-w-3xl mx-auto py-2">
        <div className={`border-4 rounded-2xl p-3 shadow-2xl relative transition-colors ${
          isLight
            ? 'bg-slate-200 border-slate-400 shadow-slate-300'
            : 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 border-slate-700'
        }`}>
          {/* Top Rack Header & Fan Exhaust Vent */}
          <div className="pb-3 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="font-mono font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {selectedRack} — 42U 19" EIA-310 RACK CABINET
              </span>
            </div>

            {/* Miniature Fan Grill Simulation */}
            <div className="flex items-center gap-1 opacity-70">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-400 dark:border-slate-600 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-slate-500" />
              </div>
              <div className="w-3.5 h-3.5 rounded-full border border-slate-400 dark:border-slate-600 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-slate-500" />
              </div>
              <div className="w-3.5 h-3.5 rounded-full border border-slate-400 dark:border-slate-600 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-slate-500" />
              </div>
            </div>
          </div>

          {/* Unit Rows Container (from 42 down to 1) with Side Cable Routing Channels */}
          <div className="relative my-2">
            {/* SVG Overlay for Patch Cord Beziers */}
            {showPatchCords && intraRackPatchCords.length > 0 && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                {intraRackPatchCords.map((cord, idx) => {
                  const fromRowIndex = totalUnits - cord.fromU; // 0-based from top
                  const toRowIndex = totalUnits - cord.toU;

                  const y1 = fromRowIndex * unitRowHeight + unitRowHeight / 2;
                  const y2 = toRowIndex * unitRowHeight + unitRowHeight / 2;

                  // Right routing gutter x coordinate
                  const xRight = 680;
                  const xOffset = (idx % 6) * 6; // stagger cables in the vertical channel
                  const cableRightX = xRight + xOffset;

                  const isHighlighted = selectedCable?.id === cord.id;
                  const isDimmed = selectedCable && selectedCable.id !== cord.id;

                  // Cubic bezier curve path entering the side wire management channel and returning
                  const pathD = `M 620,${y1} C ${cableRightX},${y1} ${cableRightX},${y2} 620,${y2}`;

                  return (
                    <g key={cord.id} className="cursor-pointer pointer-events-auto">
                      {/* Wider transparent hit-area for clicking */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="14"
                        onClick={() => setSelectedCable(isHighlighted ? null : cord)}
                      />
                      {/* Visible Patch Cord Curve */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={cord.color}
                        strokeWidth={isHighlighted ? '4' : '2.5'}
                        strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.75}
                        strokeLinecap="round"
                        filter={isHighlighted ? 'url(#glow)' : undefined}
                        onClick={() => setSelectedCable(isHighlighted ? null : cord)}
                        className="transition-all hover:stroke-width-4 hover:stroke-opacity-100"
                      />
                      {/* RJ-45 Boot Connector dots */}
                      <circle cx="620" cy={y1} r="3" fill={cord.color} opacity={isDimmed ? 0.2 : 0.9} />
                      <circle cx="620" cy={y2} r="3" fill={cord.color} opacity={isDimmed ? 0.2 : 0.9} />
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Units List */}
            <div className="divide-y divide-slate-300 dark:divide-slate-800/80">
              {Array.from({ length: totalUnits }).map((_, i) => {
                const uNumber = totalUnits - i;
                const mountedDevice = unitMap[uNumber];
                const isDeviceHovered = hoveredDeviceId && mountedDevice?.id === hoveredDeviceId;

                // Check if this unit is involved in selected cable
                const isCableActive = selectedCable && (selectedCable.fromU === uNumber || selectedCable.toU === uNumber);

                return (
                  <div
                    key={uNumber}
                    style={{ height: `${unitRowHeight}px` }}
                    className={`flex items-center transition-colors relative ${
                      isCableActive
                        ? (isLight ? 'bg-blue-100/80 ring-2 ring-blue-500' : 'bg-blue-900/40 ring-2 ring-blue-500')
                        : mountedDevice
                        ? (isLight ? 'bg-slate-100 hover:bg-blue-50' : 'bg-slate-900/90 hover:bg-slate-850')
                        : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    {/* Left 19" Steel Rail: Realistic Square Cage Nut Holes (EIA-310 standard 3-hole per U) */}
                    <div className="w-14 px-2 font-mono text-[10px] text-slate-400 font-bold flex items-center justify-between border-r-2 border-slate-300 dark:border-slate-800 select-none shrink-0 bg-slate-300/40 dark:bg-slate-950/60 h-full">
                      <span className="text-slate-600 dark:text-slate-400">{uNumber}U</span>
                      {/* Realistic EIA-310 3 square holes per 1U */}
                      <div className="flex flex-col justify-around h-full py-1">
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                      </div>
                    </div>

                    {/* Unit Slot Content */}
                    <div className="flex-1 px-3 py-1 min-w-0 flex items-center h-full">
                      {mountedDevice ? (
                        mountedDevice.deviceType === 'patchPanel' ? (
                          /* Patch Panel 1U Faceplate Slot */
                          <div
                            onClick={() => onSelectPatchPanel && onSelectPatchPanel(mountedDevice.id)}
                            onMouseEnter={() => setHoveredDeviceId(mountedDevice.id)}
                            onMouseLeave={() => setHoveredDeviceId(null)}
                            className={`w-full h-full px-2.5 py-1 rounded-md border flex items-center justify-between gap-3 cursor-pointer transition-all shadow-xs ${
                              isLight
                                ? 'bg-linear-to-r from-amber-50 to-orange-50/40 border-amber-300 hover:border-amber-500'
                                : 'bg-linear-to-r from-slate-950 to-slate-925 border-amber-500/40 hover:border-amber-400'
                            }`}
                          >
                            {/* Patch Panel Brand & Label */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] shrink-0" />
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400 truncate">
                                  {mountedDevice.name}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 font-mono hidden sm:inline">
                                  СКС ПАТЧ-ПАНЕЛЬ
                                </span>
                              </div>
                            </div>

                            {/* Mini Keystones Grid Preview */}
                            <div className="hidden md:flex items-center gap-0.5 shrink-0 opacity-80">
                              {Array.from({ length: 12 }).map((_, kIdx) => {
                                const isPortPatched = (mountedDevice.ports || [])[kIdx]?.connectedSwitchId;
                                return (
                                  <div
                                    key={kIdx}
                                    className={`w-2.5 h-3.5 rounded-xs border flex items-center justify-center ${
                                      isPortPatched
                                        ? 'bg-amber-500/30 border-amber-500'
                                        : 'bg-slate-300 dark:bg-slate-800 border-slate-400 dark:border-slate-700'
                                    }`}
                                    title={`Порт ${kIdx + 1}`}
                                  >
                                    <div className="w-1 h-1 bg-black/40 rounded-xs" />
                                  </div>
                                );
                              })}
                            </div>

                            {/* Keystone count & Patched info */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                {mountedDevice.ports?.filter(p => p.connectedSwitchId).length || 0} / {mountedDevice.ports?.length || 24} скоммутировано
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 font-bold">
                                {mountedDevice.ports?.length || 24}P
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 hover:text-amber-500" />
                            </div>
                          </div>
                        ) : mountedDevice.deviceType === 'server' ? (
                          /* Server Faceplate Slot */
                          <div
                            onClick={() => onSelectServer && onSelectServer(mountedDevice.id)}
                            onMouseEnter={() => setHoveredDeviceId(mountedDevice.id)}
                            onMouseLeave={() => setHoveredDeviceId(null)}
                            className={`w-full h-full px-2.5 py-1 rounded-md border flex items-center justify-between gap-3 cursor-pointer transition-all shadow-xs ${
                              isLight
                                ? 'bg-linear-to-r from-indigo-50/80 to-purple-50/40 border-indigo-400 hover:border-indigo-600'
                                : 'bg-linear-to-r from-slate-950 to-indigo-950/30 border-indigo-500/50 hover:border-indigo-400'
                            }`}
                          >
                            {/* Server Brand, Model & Status */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] shrink-0" />
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 truncate">
                                  {mountedDevice.name}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-mono hidden sm:inline">
                                  {mountedDevice.vendor} {mountedDevice.model}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 font-mono hidden md:inline">
                                  {mountedDevice.os || 'Hypervisor'}
                                </span>
                              </div>
                            </div>

                            {/* Drive bays / LEDs animation */}
                            <div className="hidden md:flex items-center gap-1 shrink-0 opacity-80">
                              {Array.from({ length: 8 }).map((_, dIdx) => (
                                <div
                                  key={dIdx}
                                  className="w-2 h-3.5 rounded-xs border border-slate-700 bg-slate-900 flex flex-col justify-between p-0.5"
                                  title={`Дисковая корзина ${dIdx + 1}`}
                                >
                                  <div className="w-1 h-0.5 bg-emerald-400 rounded-full" />
                                  <div className="w-1 h-0.5 bg-blue-400 rounded-full" />
                                </div>
                              ))}
                            </div>

                            {/* VMs & Specs Preview */}
                            <div className="flex items-center gap-2 shrink-0">
                              {(mountedDevice.vms || []).length > 0 && (
                                <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                                  {mountedDevice.vms.length} ВМ
                                </span>
                              )}
                              {mountedDevice.ip && (
                                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                                  {mountedDevice.ip}
                                </span>
                              )}
                              <span className="font-mono text-[10px] text-slate-400 font-bold">
                                {mountedDevice.unitHeight || 2}U
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-500" />
                            </div>
                          </div>
                        ) : (
                          /* Switch 1U Faceplate Slot */
                          <div
                            onClick={() => onSelectSwitch && onSelectSwitch(mountedDevice.id)}
                            onMouseEnter={() => setHoveredDeviceId(mountedDevice.id)}
                            onMouseLeave={() => setHoveredDeviceId(null)}
                            className={`w-full h-full px-2.5 py-1 rounded-md border flex items-center justify-between gap-3 cursor-pointer transition-all shadow-xs ${
                              isLight
                                ? 'bg-linear-to-r from-blue-50/60 to-white border-blue-400 hover:border-blue-600'
                                : 'bg-linear-to-r from-slate-950 to-slate-900 border-blue-500/50 hover:border-blue-400'
                            }`}
                          >
                            {/* Switch Brand, Model & Status */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] shrink-0" />
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 truncate">
                                  {mountedDevice.name}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono hidden sm:inline">
                                  {mountedDevice.vendor} {mountedDevice.model}
                                </span>
                              </div>
                            </div>

                            {/* Mini Port Matrix Preview */}
                            <div className="hidden md:flex items-center gap-0.5 shrink-0 opacity-80">
                              {Array.from({ length: 12 }).map((_, pIdx) => {
                                const p = (mountedDevice.ports || [])[pIdx];
                                const isUp = p?.enabled !== false && p?.mode !== 'disabled';
                                return (
                                  <div
                                    key={pIdx}
                                    className={`w-2.5 h-3.5 rounded-xs border flex items-center justify-center ${
                                      isUp
                                        ? 'bg-emerald-500/20 border-emerald-500'
                                        : 'bg-slate-300 dark:bg-slate-800 border-slate-400 dark:border-slate-700'
                                    }`}
                                    title={`Порт ${pIdx + 1}`}
                                  >
                                    <div className={`w-1 h-1 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                  </div>
                                );
                              })}
                            </div>

                            {/* IP and Ports preview */}
                            <div className="flex items-center gap-2 shrink-0">
                              {mountedDevice.ip && (
                                <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  {mountedDevice.ip}
                                </span>
                              )}
                              <span className="font-mono text-[10px] text-slate-400 font-bold">
                                {mountedDevice.ports?.length || 24}P
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 hover:text-blue-500" />
                            </div>
                          </div>
                        )
                      ) : (
                        /* Empty 1U Slot with Blanking Plate Texture */
                        <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-slate-600 select-none px-2">
                          <span className="opacity-60">-- Свободный юнит (Blank) --</span>
                          <span className="text-[8px] tracking-widest text-slate-400 dark:text-slate-700 opacity-60">· · ·</span>
                        </div>
                      )}
                    </div>

                    {/* Right 19" Steel Rail with Cable Management Organizer Channel */}
                    <div className="w-14 px-2 font-mono text-[8px] text-slate-500 border-l-2 border-slate-300 dark:border-slate-800 select-none shrink-0 bg-slate-300/40 dark:bg-slate-950/60 h-full flex items-center justify-between">
                      <div className="flex flex-col justify-around h-full py-1">
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                        <div className="w-1.5 h-1.5 rounded-xs border border-slate-400 dark:border-slate-700 bg-slate-400/30 dark:bg-slate-800/50" />
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 font-bold">{uNumber}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Rack Ground / Plinth */}
          <div className="pt-2 border-t border-slate-300 dark:border-slate-800 flex items-center justify-between px-2 text-[10px] font-mono text-slate-500">
            <span>GROUND BUSBAR: OK ⏚</span>
            <span>19-INCH RACK ELEVATION</span>
            <span>EIA/ECA-310-E</span>
          </div>
        </div>
      </div>
    </div>
  );
}
