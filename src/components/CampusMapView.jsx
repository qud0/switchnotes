import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Factory,
  Building,
  Plus,
  Trash2,
  Edit2,
  Move,
  Cable,
  Server,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Check,
  X,
  MapPin,
  Activity,
  ArrowRight,
  ArrowUpRight,
  Shield,
  Radio,
  Eye,
  Sliders,
  Sparkles,
  Wifi,
  Compass,
  AlertTriangle,
  ShieldCheck,
  Gauge,
  Calculator,
  Disc,
  Flame,
  Info
} from 'lucide-react';
import { api } from '../api';
import { calculateDistanceMeters, calculateOpticalBudget, FIBER_STANDARDS } from '../utils/opticalBudget';

const BUILDING_TYPES = [
  { id: 'office', label: 'Администрация / Офис', color: '#3b82f6', icon: '🏢' },
  { id: 'production', label: 'Цех / Производство', color: '#f59e0b', icon: '🏭' },
  { id: 'warehouse', label: 'Склад / Логистика', color: '#10b981', icon: '📦' },
  { id: 'security', label: 'КПП / Охрана / СКУД', color: '#f43f5e', icon: '🛡️' },
  { id: 'utility', label: 'Котельная / Энергоблок', color: '#8b5cf6', icon: '⚡' },
  { id: 'other', label: 'Другое сооружение', color: '#64748b', icon: '🏠' }
];

const CABLE_TYPES = [
  'Оптика ВОЛС 10G (В броне)',
  'Оптика ВОЛС 1G (Многомод)',
  'Оптика SMF 10G (Подвесной)',
  'Оптика SMF 1G',
  'Витая пара Уличная FTP Cat.5e',
  'Беспроводной мост (Wi-Fi 5GHz/60GHz)'
];

export default function CampusMapView({
  buildings = [],
  switches = [],
  patchPanels = [],
  floorPlans = [],
  onReloadBuildings,
  onSelectSwitch,
  onNavigateToFloorPlan,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const containerRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Dragging building on canvas
  const [draggingBuildingId, setDraggingBuildingId] = useState(null);

  // Local state for smooth drag before persisting
  const [localBuildings, setLocalBuildings] = useState([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);

  // Link creation mode
  const [linkingSourceId, setLinkingSourceId] = useState(null);

  // Modal create/edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState('production');
  const [formDescription, setFormDescription] = useState('');
  const [formFloorsCount, setFormFloorsCount] = useState(1);
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formAddress, setFormAddress] = useState('');
  const [formNetworkRole, setFormNetworkRole] = useState('');
  const [formCableType, setFormCableType] = useState('Оптика ВОЛС 10G (В броне)');
  const [formUplinkTo, setFormUplinkTo] = useState('');
  const [formSwitches, setFormSwitches] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reliable drag and pan refs
  const dragInfoRef = useRef(null); // { bldId, startX, startY, origX, origY, hasMoved }
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const justFinishedDragRef = useRef(false);

  useEffect(() => {
    setLocalBuildings(buildings || []);
  }, [buildings]);

  // Campus Infrastructure State (Колодцы, эстакады, трассы ВОЛС, Wi-Fi зоны)
  const [infraPoints, setInfraPoints] = useState([]);
  const [infraRoutes, setInfraRoutes] = useState([]);
  const [infraWifiAps, setInfraWifiAps] = useState([]);
  const [selectedInfraPoint, setSelectedInfraPoint] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedWifiAp, setSelectedWifiAp] = useState(null);

  // Layer visibility toggles
  const [showManholes, setShowManholes] = useState(true);
  const [showWifiZones, setShowWifiZones] = useState(true);
  const [showOpticalBudget, setShowOpticalBudget] = useState(true);

  // Optical Budget Modal inspection
  const [inspectedLinkBudget, setInspectedLinkBudget] = useState(null);

  // Add Item Modal states
  const [isAddPointModalOpen, setIsAddPointModalOpen] = useState(false);
  const [isAddApModalOpen, setIsAddApModalOpen] = useState(false);

  // Load infrastructure from backend
  const loadInfrastructure = async () => {
    try {
      const data = await api.getCampusInfrastructure();
      if (data) {
        setInfraPoints(data.points || []);
        setInfraRoutes(data.routes || []);
        setInfraWifiAps(data.wifiAps || []);
      }
    } catch (e) {
      console.warn('Campus infrastructure fallback to defaults:', e.message);
    }
  };

  useEffect(() => {
    loadInfrastructure();
  }, []);

  const selectedBuilding = useMemo(() => {
    return localBuildings.find(b => b.id === selectedBuildingId) || null;
  }, [localBuildings, selectedBuildingId]);

  // Window-level mouse listeners for rock-solid drag and drop
  useEffect(() => {
    const handleWindowMouseMove = (e) => {
      const drag = dragInfoRef.current;
      if (drag && drag.bldId) {
        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;
        if (Math.hypot(dx, dy) > 4) {
          drag.hasMoved = true;
        }

        const newX = Math.round(drag.origX + dx);
        const newY = Math.round(drag.origY + dy);

        setLocalBuildings(prev =>
          prev.map(b => b.id === drag.bldId ? { ...b, x: newX, y: newY } : b)
        );
      } else if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        });
      }
    };

    const handleWindowMouseUp = () => {
      const drag = dragInfoRef.current;
      if (drag && drag.bldId) {
        const activeId = drag.bldId;
        const moved = drag.hasMoved;
        dragInfoRef.current = null;
        setDraggingBuildingId(null);

        if (moved) {
          justFinishedDragRef.current = true;
          setTimeout(() => {
            justFinishedDragRef.current = false;
          }, 80);

          // Persist new coordinates without resetting view or switching tabs
          setLocalBuildings(currentList => {
            const bld = currentList.find(b => b.id === activeId);
            if (bld) {
              api.updateBuilding(bld.id, { x: bld.x, y: bld.y })
                .then(() => {
                  if (onReloadBuildings) onReloadBuildings();
                })
                .catch(err => console.error('Failed to save building coordinates:', err));
            }
            return currentList;
          });
        } else {
          // Pure click without movement selects building
          setSelectedBuildingId(activeId);
        }
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    const handleWindowKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (linkingSourceId) {
          setLinkingSourceId(null);
        }
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [zoom, linkingSourceId, onReloadBuildings]);

  // Handle Mouse Canvas Pan
  const handleMouseDownCanvas = (e) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  const handleMouseDownBuilding = (e, bldId) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // If currently in linking mode, finish link
    if (linkingSourceId) {
      handleConnectBuildings(linkingSourceId, bldId);
      return;
    }

    const bld = localBuildings.find(b => b.id === bldId);
    if (!bld) return;

    dragInfoRef.current = {
      bldId,
      startX: e.clientX,
      startY: e.clientY,
      origX: bld.x ?? 200,
      origY: bld.y ?? 200,
      hasMoved: false
    };
    setDraggingBuildingId(bldId);
  };

  const handleConnectBuildings = async (srcId, targetId) => {
    if (srcId === targetId) {
      setLinkingSourceId(null);
      return;
    }
    try {
      await api.updateBuilding(targetId, { uplinkTo: srcId });
      setLinkingSourceId(null);
      if (onReloadBuildings) await onReloadBuildings();
    } catch (err) {
      alert(`Ошибка соединения: ${err.message}`);
    }
  };

  // Open Modal
  const handleOpenAddModal = () => {
    setEditingBuilding(null);
    setFormName('');
    setFormCode('');
    setFormType('production');
    setFormDescription('');
    setFormFloorsCount(1);
    setFormColor('#f59e0b');
    setFormAddress('');
    setFormNetworkRole('Цеховой узел связи');
    setFormCableType('Оптика ВОЛС 10G (В броне)');
    setFormUplinkTo(localBuildings[0]?.id || '');
    setFormSwitches([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bld) => {
    setEditingBuilding(bld);
    setFormName(bld.name || '');
    setFormCode(bld.code || '');
    setFormType(bld.type || 'production');
    setFormDescription(bld.description || '');
    setFormFloorsCount(bld.floorsCount || 1);
    setFormColor(bld.color || '#3b82f6');
    setFormAddress(bld.address || '');
    setFormNetworkRole(bld.networkRole || '');
    setFormCableType(bld.cableType || 'Оптика ВОЛС 10G (В броне)');
    setFormUplinkTo(bld.uplinkTo || '');
    setFormSwitches(bld.switches || []);
    setIsModalOpen(true);
  };

  const handleDeleteBuilding = async (id) => {
    if (!window.confirm('Удалить здание с карты завода?')) return;
    try {
      await api.deleteBuilding(id);
      setSelectedBuildingId(null);
      if (onReloadBuildings) await onReloadBuildings();
    } catch (err) {
      alert(`Ошибка удаления: ${err.message}`);
    }
  };

  const handleSubmitBuilding = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Укажите наименование здания');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: formName.trim(),
        code: formCode.trim(),
        type: formType,
        description: formDescription.trim(),
        floorsCount: parseInt(formFloorsCount, 10) || 1,
        color: formColor,
        address: formAddress.trim(),
        networkRole: formNetworkRole.trim(),
        cableType: formCableType,
        uplinkTo: formUplinkTo || null,
        switches: formSwitches || []
      };

      if (editingBuilding) {
        await api.updateBuilding(editingBuilding.id, payload);
      } else {
        await api.createBuilding(payload);
      }

      setIsModalOpen(false);
      if (onReloadBuildings) await onReloadBuildings();
    } catch (err) {
      alert(`Ошибка сохранения: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Derive optical and campus cable links between buildings with routing & optical budget
  const campusLinks = useMemo(() => {
    const bldMap = {};
    localBuildings.forEach(b => { bldMap[b.id] = b; });

    const ptMap = {};
    infraPoints.forEach(p => { ptMap[p.id] = p; });

    const links = [];
    localBuildings.forEach(b => {
      if (b.uplinkTo && bldMap[b.uplinkTo]) {
        const parent = bldMap[b.uplinkTo];

        // Center coordinates of buildings
        const srcPt = {
          x: (parent.x || 200) + (parent.width || 240) / 2,
          y: (parent.y || 200) + (parent.height || 160) / 2
        };
        const dstPt = {
          x: (b.x || 400) + (b.width || 240) / 2,
          y: (b.y || 400) + (b.height || 160) / 2
        };

        // Check if there is an explicit defined route with intermediate waypoints (колодцы, эстакады)
        const matchedRoute = infraRoutes.find(r =>
          (r.fromId === parent.id && r.toId === b.id) ||
          (r.fromId === b.id && r.toId === parent.id)
        );

        let waypointsPts = [];
        if (matchedRoute?.waypoints && Array.isArray(matchedRoute.waypoints)) {
          waypointsPts = matchedRoute.waypoints
            .map(wpId => ptMap[wpId])
            .filter(Boolean);
        }

        // Build path points: Source -> WP1 -> WP2 -> Target
        const fullPath = [srcPt, ...waypointsPts, dstPt];

        // Calculate total cable distance along path
        let straightDistMeters = 0;
        for (let i = 0; i < fullPath.length - 1; i++) {
          straightDistMeters += calculateDistanceMeters(fullPath[i], fullPath[i + 1], 0.6); // 1px ~ 0.6m
        }

        const extraReserveM = matchedRoute?.extraReserveM ?? 30; // 15м на каждом конце на ввод и разделку
        const totalCableLengthM = straightDistMeters + extraReserveM;

        // Optical budget calculation
        const fiberType = matchedRoute?.fiberType?.includes('OM') ? 'MMF_OM3' : 'SMF_1310';
        const splicesCount = matchedRoute?.spliceCount ?? (waypointsPts.length > 0 ? waypointsPts.length * 2 : 2);
        const connectorsCount = matchedRoute?.connectorCount ?? 4; // по 2 разъема LC на концах кроссов

        const budget = calculateOpticalBudget({
          lengthMeters: totalCableLengthM,
          splicesCount,
          connectorsCount,
          fiberType,
          sfpPowerBudgetDb: b.cableType?.includes('10G') ? 11 : 14
        });

        links.push({
          id: `link-${parent.id}-${b.id}`,
          source: parent,
          target: b,
          cableType: b.cableType || 'Оптика ВОЛС',
          pathPoints: fullPath,
          waypoints: waypointsPts,
          distanceM: straightDistMeters,
          totalCableLengthM,
          extraReserveM,
          budget,
          routeMeta: matchedRoute
        });
      }
    });
    return links;
  }, [localBuildings, infraPoints, infraRoutes]);

  // Selected building switches
  const selectedBldSwitches = useMemo(() => {
    if (!selectedBuilding) return [];
    return switches.filter(s =>
      (selectedBuilding.switches && selectedBuilding.switches.includes(s.id)) ||
      (s.location || '').toLowerCase().includes(selectedBuilding.name.toLowerCase())
    );
  }, [selectedBuilding, switches]);

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className={`p-4 rounded-2xl border transition-colors shadow-sm flex flex-wrap items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-amber-600 to-red-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Генплан завода & Межкорпусная сеть
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Кампус ({localBuildings.length} зданий)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Карта территории предприятия, корпуса цехов, ВОЛС магистрали и распределение коммутаторов
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {linkingSourceId ? (
            <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-mono text-amber-500 shadow-sm animate-pulse">
              <span>Кликните на целевое здание для протяжки ВОЛС...</span>
              <button
                onClick={() => setLinkingSourceId(null)}
                className="hover:underline text-rose-400 ml-1 cursor-pointer font-bold"
                title="Отменить режим протяжки (Esc)"
              >
                [Esc] Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (selectedBuildingId) {
                  setLinkingSourceId(selectedBuildingId);
                } else if (localBuildings[0]) {
                  setLinkingSourceId(localBuildings[0].id);
                }
              }}
              className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Протянуть оптоволоконный линк между двумя корпусами"
            >
              <Cable className="w-3.5 h-3.5 text-blue-500" />
              <span>Протянуть ВОЛС</span>
            </button>
          )}

          {/* Layer toggles */}
          <div className={`h-9 flex items-center p-0.5 border rounded-xl gap-0.5 shrink-0 ${
            isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-800 bg-slate-950'
          }`}>
            <button
              onClick={() => setShowManholes(!showManholes)}
              className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                showManholes ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Колодцы, эстакады и муфты"
            >
              <Disc className="w-3 h-3" />
              <span>Колодцы ({infraPoints.length})</span>
            </button>
            <button
              onClick={() => setShowWifiZones(!showWifiZones)}
              className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                showWifiZones ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Зоны покрытия Wi-Fi на территории"
            >
              <Wifi className="w-3 h-3" />
              <span>Wi-Fi ({infraWifiAps.length})</span>
            </button>
            <button
              onClick={() => setShowOpticalBudget(!showOpticalBudget)}
              className={`h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                showOpticalBudget ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Метраж трасс и затухание оптического бюджета"
            >
              <Gauge className="w-3 h-3" />
              <span>Бюджет ВОЛС</span>
            </button>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="h-9 px-3.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/20 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить корпус</span>
          </button>

          {/* Zoom controls */}
          <div className={`h-9 flex items-center border rounded-xl overflow-hidden shrink-0 ${
            isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-800 bg-slate-950'
          }`}>
            <button
              onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Уменьшить"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-500 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Увеличить"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Сбросить масштаб и положение"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Area with Interactive Map and Overlay Inspector */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownCanvas}
        className={`relative w-full h-[740px] rounded-2xl border overflow-hidden select-none ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        } ${
          isLight ? 'bg-slate-100/80 border-slate-300' : 'bg-slate-950 border-slate-800'
        }`}
      >
        {/* Territory Grid Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle, ${isLight ? '#64748b' : '#38bdf8'} 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            transform: `translate(${pan.x % 32}px, ${pan.y % 32}px)`
          }}
        />

        {/* Optical Linking Active Mode Notice */}
        {linkingSourceId && (
          <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 backdrop-blur-md text-xs font-mono shadow-lg flex items-center gap-2">
            <Cable className="w-4 h-4 text-amber-400 animate-spin" />
            <span>Режим протяжки ВОЛС от: <strong>{localBuildings.find(b => b.id === linkingSourceId)?.name || 'Корпуса'}</strong>. Нажмите целевой корпус.</span>
            <button
              onClick={() => setLinkingSourceId(null)}
              className="ml-2 px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 text-[10px] cursor-pointer"
            >
              Отмена
            </button>
          </div>
        )}

        {/* SVG Optical Cable Lines between Buildings */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <defs>
            <filter id="glow-optic" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Wi-Fi Radio Coverage Circles Layer */}
          {showWifiZones && infraWifiAps.map(ap => {
            const radiusPx = (ap.radiusM || 60) / 0.6; // scale 1px ~ 0.6m
            const is5G = ap.freq?.includes('5G');
            const circleColor = is5G ? '#3b82f6' : '#10b981';

            return (
              <g key={`wifi-zone-${ap.id}`} className="pointer-events-none">
                {/* Coverage Wave Animation */}
                <circle
                  cx={ap.x}
                  cy={ap.y}
                  r={radiusPx}
                  fill={circleColor}
                  fillOpacity="0.08"
                  stroke={circleColor}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  className="animate-pulse"
                />
                <circle
                  cx={ap.x}
                  cy={ap.y}
                  r={radiusPx * 0.45}
                  fill={circleColor}
                  fillOpacity="0.12"
                />
              </g>
            );
          })}

          {/* Optical Cable Lines along Waypoints (Колодцы, эстакады) */}
          {campusLinks.map(link => {
            const pts = link.pathPoints;
            const is10G = link.cableType.includes('10G');
            const strokeColor = is10G ? '#38bdf8' : '#f59e0b';

            // Generate SVG path string "M x1 y1 L x2 y2 L x3 y3"
            const pathD = pts.reduce((acc, p, idx) => {
              return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
            }, '');

            // Midpoint of entire route for badge placement
            const midIdx = Math.floor(pts.length / 2);
            const midPt = pts[midIdx] || pts[0];

            const budgetStatus = link.budget?.status || 'excellent';
            const badgeBorderColor = budgetStatus === 'critical' ? '#ef4444' : budgetStatus === 'warning' ? '#f59e0b' : strokeColor;

            return (
              <g key={link.id} className="pointer-events-auto cursor-pointer" onClick={() => setInspectedLinkBudget(link)}>
                {/* Thick invisible click helper line */}
                <path d={pathD} stroke="transparent" strokeWidth="24" fill="none" />

                {/* Cable Trench Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={is10G ? 4 : 2.5}
                  strokeDasharray={is10G ? 'none' : '6 6'}
                  filter="url(#glow-optic)"
                  opacity={0.85}
                />

                {/* Animated light pulses for active data flow */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeDasharray="4 14"
                  className="flow-animation"
                  opacity={0.9}
                />

                {/* Cable Anchors on path points */}
                {pts.map((p, pIdx) => (
                  <circle
                    key={`pt-${link.id}-${pIdx}`}
                    cx={p.x}
                    cy={p.y}
                    r={pIdx === 0 || pIdx === pts.length - 1 ? 5 : 3.5}
                    fill={strokeColor}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                ))}

                {/* Interactive Optical Budget & Distance Badge */}
                <g transform={`translate(${midPt.x}, ${midPt.y - 14})`}>
                  <rect
                    x="-85"
                    y="-12"
                    width="170"
                    height="24"
                    rx="8"
                    fill={isLight ? '#ffffff' : '#090d16'}
                    stroke={badgeBorderColor}
                    strokeWidth="1.5"
                    className="shadow-md"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={isLight ? '#0f172a' : '#f8fafc'}
                    fontSize="9.5"
                    fontFamily="Ubuntu Mono, monospace"
                    fontWeight="bold"
                  >
                    ⚡ {link.totalCableLengthM}м • -{link.budget?.totalLossDb}дБ ({link.budget?.marginDb > 0 ? `+${link.budget.marginDb}дБ` : '0дБ'})
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Draggable Buildings HTML Nodes */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {localBuildings.map(bld => {
            const isSelected = selectedBuildingId === bld.id;
            const isLinkingSource = linkingSourceId === bld.id;
            const isBeingDragged = draggingBuildingId === bld.id;
            const typeInfo = BUILDING_TYPES.find(t => t.id === bld.type) || BUILDING_TYPES[0];

            // Associated switches and patch panels
            const bldSwitches = switches.filter(s =>
              (bld.switches && bld.switches.includes(s.id)) ||
              (s.location || '').toLowerCase().includes(bld.name.toLowerCase())
            );

            return (
              <div
                key={bld.id}
                onMouseDown={(e) => handleMouseDownBuilding(e, bld.id)}
                onClickCapture={(e) => {
                  if (justFinishedDragRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{
                  left: `${bld.x}px`,
                  top: `${bld.y}px`,
                  width: `${bld.width || 250}px`,
                  minHeight: `${bld.height || 170}px`
                }}
                className={`absolute pointer-events-auto rounded-2xl border-2 select-none shadow-xl ${
                  isBeingDragged
                    ? 'transition-none cursor-grabbing ring-4 ring-amber-400 z-30 shadow-2xl scale-[1.02]'
                    : 'transition-all cursor-grab'
                } ${
                  isLight
                    ? 'bg-white/95 border-slate-300 hover:border-amber-500'
                    : 'bg-slate-900/95 border-slate-700/80 hover:border-amber-400 backdrop-blur-md'
                } ${
                  isSelected && !isBeingDragged ? 'ring-4 ring-amber-400 shadow-amber-500/30' : ''
                } ${
                  isLinkingSource ? 'ring-4 ring-blue-500 animate-pulse' : ''
                }`}
              >
                {/* Building Header */}
                <div
                  className="p-3 border-b flex items-center justify-between gap-2 rounded-t-xl"
                  style={{
                    backgroundColor: (bld.color || typeInfo.color) + '15',
                    borderColor: (bld.color || typeInfo.color) + '30'
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none shrink-0">{typeInfo.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-xs truncate text-slate-900 dark:text-white" title={bld.name}>
                          {bld.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                        {bld.code && (
                          <span className="font-bold px-1 rounded-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {bld.code}
                          </span>
                        )}
                        <span>{bld.floorsCount} эт.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justFinishedDragRef.current) return;
                        handleOpenEditModal(bld);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Редактировать корпус"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justFinishedDragRef.current) return;
                        handleDeleteBuilding(bld.id);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Удалить корпус"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Building Content */}
                <div className="p-3 space-y-2 text-xs">
                  {bld.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {bld.description}
                    </p>
                  )}

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/60 space-y-1 font-mono text-[10px]">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Сетевой узел:</span>
                      <span className="text-amber-500 font-bold truncate max-w-[120px]">{bld.networkRole || 'Узел связи'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>ВОЛС Аплинк:</span>
                      <span className="text-blue-500 font-semibold truncate max-w-[120px]">
                        {bld.uplinkTo ? (localBuildings.find(p => p.id === bld.uplinkTo)?.name || 'Ядро') : 'Опорный узел ядра'}
                      </span>
                    </div>
                  </div>

                  {/* Switch list inside building with clickable badges */}
                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-semibold flex items-center gap-1">
                        <Server className="w-3 h-3 text-blue-500" />
                        <span>Свитчи ({bldSwitches.length}):</span>
                      </span>
                      {onNavigateToFloorPlan && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (justFinishedDragRef.current) return;
                            onNavigateToFloorPlan();
                          }}
                          className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                          title="Перейти к поэтажным планам СКС"
                        >
                          <span>Планы этажей</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    {bldSwitches.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-0.5">
                        {bldSwitches.map(sw => (
                          <button
                            key={sw.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (justFinishedDragRef.current) return;
                              if (onSelectSwitch) onSelectSwitch(sw.id);
                            }}
                            className={`px-1.5 py-0.5 rounded-md border text-[9px] font-mono flex items-center gap-1 transition-all cursor-pointer ${
                              isLight
                                ? 'bg-slate-100 hover:bg-blue-50 border-slate-200 hover:border-blue-400 text-slate-800 hover:text-blue-600'
                                : 'bg-slate-950/80 hover:bg-blue-950/50 border-slate-800 hover:border-blue-500/60 text-slate-300 hover:text-blue-300'
                            }`}
                            title={`Открыть коммутатор ${sw.name} (${sw.ip || 'no IP'})\nМодель: ${sw.model || 'Switch'}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="truncate max-w-[110px] font-bold">{sw.name}</span>
                            <ArrowUpRight className="w-2.5 h-2.5 opacity-60 shrink-0" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">
                        Коммутаторы не привязаны
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Infrastructure Points HTML Markers (Колодцы, эстакады, муфты) */}
          {showManholes && infraPoints.map(pt => {
            const isSelected = selectedInfraPoint?.id === pt.id;
            const isFosc = pt.type === 'fosc';
            const isTray = pt.type === 'tray';
            const isPole = pt.type === 'pole';

            const bgClass = isFosc
              ? 'bg-rose-500 text-white'
              : isTray
                ? 'bg-purple-600 text-white'
                : isPole
                  ? 'bg-sky-600 text-white'
                  : 'bg-amber-600 text-white';

            return (
              <div
                key={pt.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedInfraPoint(pt);
                  setSelectedBuildingId(null);
                  setSelectedWifiAp(null);
                }}
                style={{
                  left: `${pt.x}px`,
                  top: `${pt.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
                className={`absolute pointer-events-auto cursor-pointer p-1.5 rounded-xl border-2 flex items-center gap-1.5 shadow-lg transition-transform hover:scale-110 ${
                  isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                } ${isSelected ? 'ring-3 ring-amber-400 scale-110 z-20' : 'z-10'}`}
                title={`${pt.name}\n${pt.notes || ''}`}
              >
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${bgClass}`}>
                  <Disc className="w-3 h-3" />
                </div>
                <div className="font-mono text-[9px] font-bold pr-1 whitespace-nowrap">
                  <span>{pt.name}</span>
                </div>
              </div>
            );
          })}

          {/* Wi-Fi AP Access Points HTML Markers */}
          {showWifiZones && infraWifiAps.map(ap => {
            const isSelected = selectedWifiAp?.id === ap.id;

            return (
              <div
                key={ap.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedWifiAp(ap);
                  setSelectedBuildingId(null);
                  setSelectedInfraPoint(null);
                }}
                style={{
                  left: `${ap.x}px`,
                  top: `${ap.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
                className={`absolute pointer-events-auto cursor-pointer p-1.5 rounded-xl border-2 flex items-center gap-1.5 shadow-lg transition-transform hover:scale-110 z-10 ${
                  isLight ? 'bg-white border-blue-300' : 'bg-slate-900 border-blue-600/60'
                } ${isSelected ? 'ring-3 ring-blue-400 scale-110 z-20' : ''}`}
                title={`${ap.name} (${ap.model})\nIP: ${ap.ip}\nКлиентов: ${ap.clientsCount || 0}`}
              >
                <div className="w-5 h-5 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Wifi className="w-3 h-3 animate-pulse" />
                </div>
                <div className="font-mono text-[9px] font-bold pr-1 whitespace-nowrap">
                  <span className="text-blue-500 dark:text-blue-400">{ap.name}</span>
                  <span className="text-slate-400 ml-1">({ap.clientsCount} кл.)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Building Details Sidebar */}
        {selectedBuilding && (
          <div className={`absolute top-4 right-4 z-20 w-88 rounded-2xl border p-4 shadow-2xl backdrop-blur-md text-xs space-y-3.5 ${
            isLight ? 'bg-white/95 border-slate-300 text-slate-800' : 'bg-slate-900/95 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-sm truncate max-w-[210px]">{selectedBuilding.name}</span>
              </div>
              <button
                onClick={() => setSelectedBuildingId(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Код / Номер:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{selectedBuilding.code || '—'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Этажность:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">{selectedBuilding.floorsCount} этажа(ей)</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Адрес на площадке:</span>
                <span className="text-slate-700 dark:text-slate-200 truncate max-w-[150px]">{selectedBuilding.address || 'Территория завода'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Тип связи:</span>
                <span className="text-blue-500 font-mono text-[10px]">{selectedBuilding.cableType}</span>
              </div>
            </div>

            {/* Equipment in Building Sidebar */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-blue-500" />
                <span>Оборудование в корпусе ({selectedBldSwitches.length})</span>
              </span>

              {selectedBldSwitches.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedBldSwitches.map(sw => (
                    <div
                      key={sw.id}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-xs truncate flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">{sw.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {sw.ip || 'IP не задан'} • {sw.vendor} {sw.model}
                        </div>
                      </div>

                      {onSelectSwitch && (
                        <button
                          onClick={() => onSelectSwitch(sw.id)}
                          className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                          title="Перейти к коммутатору"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">В этом корпусе пока нет коммутаторов. Нажмите «Редактировать», чтобы привязать оборудование.</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                onClick={() => handleOpenEditModal(selectedBuilding)}
                className="flex-1 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-center font-medium cursor-pointer"
              >
                Редактировать
              </button>
              <button
                onClick={() => setLinkingSourceId(selectedBuilding.id)}
                className="flex-1 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-center font-medium shadow-xs cursor-pointer"
              >
                Протянуть ВОЛС
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Добавление / Редактирование корпуса завода */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className={`px-5 py-4 border-b flex items-center justify-between ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Factory className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingBuilding ? 'Редактировать корпус завода' : 'Добавить корпус / цех завода'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Привязка здания к генеральному плану территории и ВОЛС магистралям
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitBuilding} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Название здания / цеха *</label>
                  <input
                    type="text"
                    required
                    placeholder="Цех №3 (Литейный), Склад ГП"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-950 border-slate-800 text-white focus:border-amber-400'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Код / Номер корпуса</label>
                  <input
                    type="text"
                    placeholder="ЦЕХ-3, АБК-2"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-950 border-slate-800 text-white focus:border-amber-400'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Тип объекта</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  >
                    {BUILDING_TYPES.map(t => (
                      <option key={t.id} value={t.id} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                        {t.icon} {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Количество этажей</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formFloorsCount}
                    onChange={(e) => setFormFloorsCount(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Назначение / Описание</label>
                <textarea
                  rows="2"
                  placeholder="Производственный участок, робототехника, компрессорная станция..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden resize-none ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500' : 'bg-slate-950 border-slate-800 text-white focus:border-amber-400'
                  }`}
                />
              </div>

              {/* Switches in Building Checkboxes */}
              {switches.length > 0 && (
                <div className={`p-3 rounded-xl border space-y-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5" />
                      Коммутаторы в здании ({formSwitches.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Отметьте свитчи</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {switches.map(sw => {
                      const isChecked = formSwitches.includes(sw.id);
                      return (
                        <label
                          key={sw.id}
                          className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all text-[11px] ${
                            isChecked
                              ? (isLight ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-semibold' : 'bg-blue-950/40 border-blue-500/50 text-blue-200 font-semibold')
                              : (isLight ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60')
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormSwitches(prev => [...prev, sw.id]);
                              } else {
                                setFormSwitches(prev => prev.filter(id => id !== sw.id));
                              }
                            }}
                            className="rounded-xs text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-mono">{sw.name}</div>
                            <div className="text-[9px] text-slate-400 truncate">{sw.vendor} {sw.model} ({sw.ip || 'no IP'})</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optical Uplink and Cable */}
              <div className={`p-3 rounded-xl border space-y-2.5 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                  <Cable className="w-3.5 h-3.5" />
                  Межкорпусная магистральная линия (ВОЛС)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1 text-[11px]">К какому корпусу подключен (Uplink)</label>
                    <select
                      value={formUplinkTo}
                      onChange={(e) => setFormUplinkTo(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-hidden cursor-pointer ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    >
                      <option value="">-- Автономный / Корневой узел --</option>
                      {localBuildings.filter(b => !editingBuilding || b.id !== editingBuilding.id).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code || 'Корпус'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1 text-[11px]">Тип оптического кабеля / среды</label>
                    <select
                      value={formCableType}
                      onChange={(e) => setFormCableType(e.target.value)}
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    >
                      {CABLE_TYPES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium cursor-pointer text-xs flex items-center gap-1.5 shadow-md shadow-amber-600/20"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Сохранение...' : (editingBuilding ? 'Сохранить изменения' : 'Добавить на карту')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        {/* Selected Infrastructure Point Inspector Sidebar (Колодец / Муфта / Эстакада) */}
        {selectedInfraPoint && (
          <div className={`absolute top-4 right-4 z-20 w-88 rounded-2xl border p-4 shadow-2xl backdrop-blur-md text-xs space-y-3.5 ${
            isLight ? 'bg-white/95 border-slate-300 text-slate-800' : 'bg-slate-900/95 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Disc className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-sm truncate max-w-[210px]">{selectedInfraPoint.name}</span>
              </div>
              <button
                onClick={() => setSelectedInfraPoint(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Тип узла:</span>
                <span className="font-mono font-bold text-amber-500 uppercase">{selectedInfraPoint.type}</span>
              </div>
              {selectedInfraPoint.depthM !== undefined && (
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Глубина заложения:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-200">{selectedInfraPoint.depthM} м</span>
                </div>
              )}
              {selectedInfraPoint.splicesCount !== undefined && (
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Оптических сварок (FOSC):</span>
                  <span className="font-mono text-rose-500 font-bold">{selectedInfraPoint.splicesCount} волокон</span>
                </div>
              )}
              {selectedInfraPoint.notes && (
                <p className="text-[11px] text-slate-400 italic bg-slate-50 dark:bg-slate-950/70 p-2 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  {selectedInfraPoint.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Selected Wi-Fi Access Point Inspector Sidebar */}
        {selectedWifiAp && (
          <div className={`absolute top-4 right-4 z-20 w-88 rounded-2xl border p-4 shadow-2xl backdrop-blur-md text-xs space-y-3.5 ${
            isLight ? 'bg-white/95 border-blue-300 text-slate-800' : 'bg-slate-900/95 border-blue-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-blue-500 animate-pulse" />
                <span className="font-bold text-sm truncate max-w-[210px]">{selectedWifiAp.name}</span>
              </div>
              <button
                onClick={() => setSelectedWifiAp(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Модель AP:</span>
                <span className="font-mono font-bold text-blue-500">{selectedWifiAp.model}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>IP-адрес:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">{selectedWifiAp.ip}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>SSID сети:</span>
                <span className="font-mono text-emerald-500 font-bold">{selectedWifiAp.ssid}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Радиус уверенного приёма:</span>
                <span className="font-mono text-slate-700 dark:text-slate-200">{selectedWifiAp.radiusM} метров</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Активных клиентов:</span>
                <span className="font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                  {selectedWifiAp.clientsCount || 0} клиентов
                </span>
              </div>
            </div>
          </div>
        )}

      {/* Optical Link Budget & Attenuation Modal */}
      {inspectedLinkBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    Паспорт оптической трассы (ВОЛС)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {inspectedLinkBudget.source.name} ➔ {inspectedLinkBudget.target.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectedLinkBudget(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Длина трассы</span>
                <p className="text-base font-bold font-mono text-blue-500">
                  {inspectedLinkBudget.totalCableLengthM} м
                </p>
                <span className="text-[10px] text-slate-400">
                  (включая +{inspectedLinkBudget.extraReserveM}м запас на ввод)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Итоговое затухание</span>
                <p className="text-base font-bold font-mono text-emerald-400">
                  -{inspectedLinkBudget.budget?.totalLossDb} дБ
                </p>
                <span className="text-[10px] text-slate-400">
                  Оптический бюджет SFP: {inspectedLinkBudget.budget?.sfpPowerBudgetDb} дБ
                </span>
              </div>
            </div>

            {/* Losses breakdown table */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Потери в волокне (SMF 1310):</span>
                <span className="text-slate-200">-{inspectedLinkBudget.budget?.fiberLoss} дБ</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Потери на сварных стыках:</span>
                <span className="text-slate-200">-{inspectedLinkBudget.budget?.spliceLoss} дБ</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Потери на разъёмах кроссов:</span>
                <span className="text-slate-200">-{inspectedLinkBudget.budget?.connectorLoss} дБ</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Эксплуатационный запас старения:</span>
                <span className="text-slate-200">-{inspectedLinkBudget.budget?.safetyMargin} дБ</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between font-bold text-xs">
                <span>Остаточный оптический запас:</span>
                <span className={inspectedLinkBudget.budget?.marginDb > 0 ? 'text-emerald-400' : 'text-rose-500'}>
                  +{inspectedLinkBudget.budget?.marginDb} дБ ({inspectedLinkBudget.budget?.isHealthy ? 'Норма ГОСТ' : 'Критично'})
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectedLinkBudget(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
