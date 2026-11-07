import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  MapPin, Layers, Server, Hash, Activity, RefreshCw, Zap,
  Laptop, Phone, Printer, Video, Wifi, Plus, X, Check,
  CornerDownRight, ArrowRight, Eye, EyeOff, Radio,
  Cable, ShieldCheck, Tag, Info, CheckCircle2,
  Edit2, Save, Trash2, Move, Box, Upload, Sliders,
  HelpCircle, RotateCcw, Link2, Unlink,
  Download, Image, FileText
} from 'lucide-react';
import { api } from '../api';
import { exportSvgToFile, exportSvgToPng, printDiagram } from '../utils/exportGraphics';
import { calculatePointRssi, renderWifiHeatmap } from '../utils/wifiHeatmap';
import { useToast } from '../context/ToastContext';
import { EmptyState } from './EmptyState';

export default function FloorPlanView({ 
  floorPlans = [], 
  patchPanels = [], 
  switches = [], 
  onSelectSwitch,
  onOpenDeviceTrace,
  onReloadFloorPlans,
  theme = 'dark'
}) {
  const isLight = theme === 'light';
  const toast = useToast();
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [selectedFloorId, setSelectedFloorId] = useState(floorPlans[0]?.id || 'floor-2');
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [showCables, setShowCables] = useState(true);
  const [filterType, setFilterType] = useState('all'); // all, pc, voip, printer, camera, wifi
  const [hoveredOutletId, setHoveredOutletId] = useState(null);

  // Wi-Fi Heatmap Simulation state
  const [showWifiHeatmap, setShowWifiHeatmap] = useState(false);
  const [wifiFrequency, setWifiFrequency] = useState('5ghz'); // '5ghz' | '2.4ghz'
  const [wifiTxPower, setWifiTxPower] = useState(20); // 14, 20, 24 dBm
  const [wifiWallMaterial, setWifiWallMaterial] = useState('drywall'); // 'drywall' | 'brick' | 'concrete'
  const [heatmapProbe, setHeatmapProbe] = useState(null); // { x, y, rssi, apName }

  // Editor mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editorTool, setEditorTool] = useState('select'); // 'select' | 'add_outlet' | 'add_room' | 'move_cabinet'
  const [selectedOutletType, setSelectedOutletType] = useState('pc');
  const [draggingEntity, setDraggingEntity] = useState(null); // { type: 'outlet' | 'room' | 'cabinet' | 'room_resize', id, startX, startY, origX, origY, origW, origH }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modal states for creating/editing room or outlet, and socket-port mapping
  const [editingOutlet, setEditingOutlet] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [isBindingModalOpen, setIsBindingModalOpen] = useState(false);
  const [bindingOutlet, setBindingOutlet] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);

  // Active Floor local working state (for smooth drag & drop before save)
  const [currentFloor, setCurrentFloor] = useState(null);

  useEffect(() => {
    const found = floorPlans.find(f => f.id === selectedFloorId) || floorPlans[0] || null;
    if (found) {
      setCurrentFloor(JSON.parse(JSON.stringify(found)));
      setHasUnsavedChanges(false);
    }
  }, [floorPlans, selectedFloorId]);

  const currentPatchPanel = useMemo(() => {
    if (!currentFloor?.patchPanelId) return null;
    return patchPanels.find(p => p.id === currentFloor.patchPanelId);
  }, [patchPanels, currentFloor]);

  const filteredOutlets = useMemo(() => {
    if (!currentFloor?.outlets) return [];
    if (filterType === 'all') return currentFloor.outlets;
    return currentFloor.outlets.filter(o => o.type === filterType);
  }, [currentFloor, filterType]);

  const selectedOutlet = useMemo(() => {
    if (!selectedOutletId || !currentFloor?.outlets) return null;
    return currentFloor.outlets.find(o => o.id === selectedOutletId);
  }, [currentFloor, selectedOutletId]);

  // Derive linked patch panel port and switch port for selected outlet
  const outletWiring = useMemo(() => {
    if (!selectedOutlet) return null;

    // 1. Direct switch port link configured on outlet
    let directSwitch = null;
    let directSwitchPort = null;
    if (selectedOutlet.switchId) {
      directSwitch = switches.find(s => s.id === selectedOutlet.switchId);
      if (directSwitch) {
        directSwitchPort = directSwitch.ports?.find(p => p.id === selectedOutlet.switchPortId || p.number === selectedOutlet.switchPortId);
      }
    }

    // 2. Patch panel port cross link
    const ppPort = currentPatchPanel?.ports?.find(p => p.number === selectedOutlet.portNum || p.socket === selectedOutlet.socket);
    let crossSwitch = null;
    let crossSwitchPort = null;

    if (ppPort?.connectedSwitchId) {
      crossSwitch = switches.find(s => s.id === ppPort.connectedSwitchId);
      if (crossSwitch) {
        crossSwitchPort = crossSwitch.ports?.find(p => p.id === ppPort.connectedSwitchPortId || p.number === ppPort.connectedSwitchPortId);
      }
    }

    // Direct binding takes precedence; otherwise fallback to patch panel cross
    const targetSwitch = directSwitch || crossSwitch;
    const switchPort = directSwitchPort || crossSwitchPort;
    const isDirectBinding = Boolean(directSwitch && directSwitchPort);

    return {
      ppPort,
      switchPort,
      targetSwitch,
      isDirectBinding
    };
  }, [selectedOutlet, currentPatchPanel, switches]);

  // Wi-Fi Access Points list
  const wifiAps = useMemo(() => {
    if (!currentFloor?.outlets) return [];
    return currentFloor.outlets.filter(o => o.type === 'wifi');
  }, [currentFloor]);

  const wallLossDb = wifiWallMaterial === 'concrete' ? 14 : wifiWallMaterial === 'brick' ? 9 : 4;
  const freqMhz = wifiFrequency === '2.4ghz' ? 2412 : 5180;

  // Render Wi-Fi Heatmap to Canvas
  useEffect(() => {
    if (!showWifiHeatmap || !canvasRef.current) return;
    let effectiveAps = wifiAps;
    if (effectiveAps.length === 0 && (currentFloor?.rooms || []).length > 0) {
      effectiveAps = [
        {
          id: 'v-ap-1',
          x: currentFloor.rooms[0].x + currentFloor.rooms[0].w / 2,
          y: currentFloor.rooms[0].y + currentFloor.rooms[0].h / 2,
          name: 'Виртуальная AP (Демо)'
        }
      ];
    }
    if (effectiveAps.length > 0) {
      renderWifiHeatmap({
        canvas: canvasRef.current,
        aps: effectiveAps,
        rooms: currentFloor?.rooms || [],
        txPowerDb: wifiTxPower,
        freqMhz,
        wallLossDb,
        cutoffThreshold: -85,
        width: 960,
        height: 640,
        step: 10
      });
    }
  }, [showWifiHeatmap, wifiAps, currentFloor?.rooms, wifiTxPower, freqMhz, wallLossDb]);

  const handleAddQuickWifiAp = () => {
    const centerRoom = (currentFloor?.rooms || [])[0];
    const newAp = {
      id: `outlet-wifi-${Date.now()}`,
      name: `Точка Wi-Fi (U6-Pro #${wifiAps.length + 1})`,
      type: 'wifi',
      x: centerRoom ? Math.round(centerRoom.x + centerRoom.w / 2) : 480,
      y: centerRoom ? Math.round(centerRoom.y + centerRoom.h / 2) : 320,
      socket: `AP-WIFI-${wifiAps.length + 1}`,
      cableCategory: 'Cat.6 UTP (1-10 Gbps)'
    };
    setCurrentFloor(prev => ({
      ...prev,
      outlets: [...(prev.outlets || []), newAp]
    }));
    setHasUnsavedChanges(true);
  };

  // Convert client mouse event to SVG coordinate space
  const getSvgCoordinates = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorPt = pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
    return {
      x: Math.round(Math.max(10, Math.min(950, cursorPt.x))),
      y: Math.round(Math.max(10, Math.min(630, cursorPt.y)))
    };
  };

  // Find room name by coordinate
  const detectRoomByCoord = (x, y, rooms = []) => {
    const found = rooms.find(r => x >= r.x && x <= (r.x + r.w) && y >= r.y && y <= (r.y + r.h));
    return found ? found.name : 'Коридор / Холл';
  };

  // Calculate cable length based on Euclidean distance + 5m margin (drops, vertical rise)
  const calculateCableLength = (x1, y1, x2, y2) => {
    const scale = 30 / 960; // 30 meters over 960px width (~0.03125m per px)
    const distPx = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const distMeters = Math.round(distPx * scale + 5); // +5m reserve
    return `${distMeters}м`;
  };

  // Canvas Mouse Interaction (Drag & Drop, Add items)
  const handleCanvasClick = (e) => {
    if (!isEditMode) return;
    const coords = getSvgCoordinates(e);

    if (editorTool === 'add_outlet') {
      const serverPos = currentFloor.serverRoomPos || { x: 500, y: 500 };
      const roomName = detectRoomByCoord(coords.x, coords.y, currentFloor.rooms || []);
      const nextNum = (currentFloor.outlets?.length || 0) + 1;
      const socketName = `Р-${nextNum}`;
      const cableLen = calculateCableLength(coords.x, coords.y, serverPos.x, serverPos.y);

      const newOutlet = {
        id: `outlet-${Date.now()}`,
        socket: socketName,
        label: `Рабочее место ${nextNum}`,
        room: roomName,
        x: coords.x,
        y: coords.y,
        type: selectedOutletType,
        portNum: nextNum <= 24 ? nextNum : 1,
        cableLength: cableLen,
        cableCategory: 'Cat.6 UTP (250MHz)'
      };

      setCurrentFloor(prev => ({
        ...prev,
        outlets: [...(prev.outlets || []), newOutlet]
      }));
      setSelectedOutletId(newOutlet.id);
      setHasUnsavedChanges(true);
    } else if (editorTool === 'add_room') {
      const roomNum = (currentFloor.rooms?.length || 0) + 1;
      const newRoom = {
        id: `room-${Date.now()}`,
        name: `Кабинет ${200 + roomNum}`,
        type: 'office',
        x: coords.x,
        y: coords.y,
        w: 160,
        h: 120
      };

      setCurrentFloor(prev => ({
        ...prev,
        rooms: [...(prev.rooms || []), newRoom]
      }));
      setSelectedRoomId(newRoom.id);
      setHasUnsavedChanges(true);
      setEditorTool('select');
    }
  };

  const handleMouseDownOutlet = (e, outlet) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const coords = getSvgCoordinates(e);
    setDraggingEntity({
      type: 'outlet',
      id: outlet.id,
      startX: coords.x,
      startY: coords.y,
      origX: outlet.x,
      origY: outlet.y
    });
    setSelectedOutletId(outlet.id);
  };

  const handleMouseDownCabinet = (e) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const coords = getSvgCoordinates(e);
    const pos = currentFloor.serverRoomPos || { x: 500, y: 500 };
    setDraggingEntity({
      type: 'cabinet',
      id: 'cabinet',
      startX: coords.x,
      startY: coords.y,
      origX: pos.x,
      origY: pos.y
    });
  };

  const handleMouseDownRoom = (e, room) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const coords = getSvgCoordinates(e);
    setDraggingEntity({
      type: 'room',
      id: room.id,
      startX: coords.x,
      startY: coords.y,
      origX: room.x,
      origY: room.y
    });
    setSelectedRoomId(room.id);
  };

  const handleMouseDownRoomResize = (e, room) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const coords = getSvgCoordinates(e);
    setDraggingEntity({
      type: 'room_resize',
      id: room.id,
      startX: coords.x,
      startY: coords.y,
      origW: room.w,
      origH: room.h
    });
  };

  const handleMouseMoveCanvas = (e) => {
    const coords = getSvgCoordinates(e);

    // Live RSSI probe meter calculation
    if (showWifiHeatmap && coords) {
      let maxRssi = -120;
      let closestAp = null;
      let minD = 999999;
      const effectiveAps = wifiAps.length > 0 ? wifiAps : (currentFloor?.rooms?.length > 0 ? [{
        id: 'v-ap-1',
        x: currentFloor.rooms[0].x + currentFloor.rooms[0].w / 2,
        y: currentFloor.rooms[0].y + currentFloor.rooms[0].h / 2,
        name: 'Виртуальная AP (Демо)'
      }] : []);

      for (const ap of effectiveAps) {
        const d = Math.hypot(coords.x - ap.x, coords.y - ap.y);
        if (d < minD) { minD = d; closestAp = ap; }
        const r = calculatePointRssi({
          apX: ap.x,
          apY: ap.y,
          targetX: coords.x,
          targetY: coords.y,
          txPowerDb: wifiTxPower,
          freqMhz,
          wallLossDb,
          rooms: currentFloor?.rooms || []
        });
        if (r > maxRssi) maxRssi = r;
      }

      setHeatmapProbe({
        x: coords.x,
        y: coords.y,
        rssi: maxRssi,
        apName: closestAp?.name || closestAp?.socket || 'Wi-Fi AP'
      });
    }

    if (!draggingEntity || !isEditMode || !coords) return;
    const dx = coords.x - draggingEntity.startX;
    const dy = coords.y - draggingEntity.startY;

    if (draggingEntity.type === 'outlet') {
      const newX = Math.max(15, Math.min(945, draggingEntity.origX + dx));
      const newY = Math.max(15, Math.min(625, draggingEntity.origY + dy));
      const serverPos = currentFloor.serverRoomPos || { x: 500, y: 500 };
      const roomName = detectRoomByCoord(newX, newY, currentFloor.rooms || []);
      const cableLen = calculateCableLength(newX, newY, serverPos.x, serverPos.y);

      setCurrentFloor(prev => ({
        ...prev,
        outlets: prev.outlets.map(o => o.id === draggingEntity.id ? {
          ...o,
          x: newX,
          y: newY,
          room: roomName,
          cableLength: cableLen
        } : o)
      }));
      setHasUnsavedChanges(true);
    } else if (draggingEntity.type === 'cabinet') {
      const newX = Math.max(40, Math.min(920, draggingEntity.origX + dx));
      const newY = Math.max(40, Math.min(600, draggingEntity.origY + dy));

      setCurrentFloor(prev => ({
        ...prev,
        serverRoomPos: { ...prev.serverRoomPos, x: newX, y: newY }
      }));
      setHasUnsavedChanges(true);
    } else if (draggingEntity.type === 'room') {
      const newX = Math.max(10, Math.min(950, draggingEntity.origX + dx));
      const newY = Math.max(10, Math.min(630, draggingEntity.origY + dy));

      setCurrentFloor(prev => ({
        ...prev,
        rooms: prev.rooms.map(r => r.id === draggingEntity.id ? { ...r, x: newX, y: newY } : r)
      }));
      setHasUnsavedChanges(true);
    } else if (draggingEntity.type === 'room_resize') {
      const newW = Math.max(60, Math.min(600, draggingEntity.origW + dx));
      const newH = Math.max(50, Math.min(500, draggingEntity.origH + dy));

      setCurrentFloor(prev => ({
        ...prev,
        rooms: prev.rooms.map(r => r.id === draggingEntity.id ? { ...r, w: newW, h: newH } : r)
      }));
      setHasUnsavedChanges(true);
    }
  };

  const handleMouseUpCanvas = () => {
    setDraggingEntity(null);
  };

  // Save current floor plan to server
  const handleSavePlan = async () => {
    if (!currentFloor) return;
    setSavingPlan(true);
    try {
      await api.updateFloorPlan(currentFloor.id, currentFloor);
      setHasUnsavedChanges(false);
      setSaveSuccess(true);
      toast.success('План помещения сохранен');
      setTimeout(() => setSaveSuccess(false), 3000);
      if (onReloadFloorPlans) onReloadFloorPlans();
    } catch (err) {
      toast.error(`Ошибка сохранения: ${err.message}`);
    } finally {
      setSavingPlan(false);
    }
  };

  // Upload Background Image blueprint (PNG/JPG/SVG)
  const handleBackgroundUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target.result;
      setCurrentFloor(prev => ({
        ...prev,
        backgroundImage: dataUrl
      }));
      setHasUnsavedChanges(true);
    };
    reader.readAsDataURL(file);
  };

  // Delete Outlet
  const handleDeleteOutlet = (outletId) => {
    setCurrentFloor(prev => ({
      ...prev,
      outlets: prev.outlets.filter(o => o.id !== outletId)
    }));
    if (selectedOutletId === outletId) setSelectedOutletId(null);
    setHasUnsavedChanges(true);
  };

  // Delete Room
  const handleDeleteRoom = (roomId) => {
    setCurrentFloor(prev => ({
      ...prev,
      rooms: (prev.rooms || []).filter(r => r.id !== roomId)
    }));
    if (selectedRoomId === roomId) setSelectedRoomId(null);
    setHasUnsavedChanges(true);
  };

  // Save Outlet Port Binding (Link socket directly to switch and port)
  const handleSaveOutletBinding = (outletId, bindingData) => {
    setCurrentFloor(prev => ({
      ...prev,
      outlets: prev.outlets.map(o => {
        if (o.id !== outletId) return o;
        return {
          ...o,
          switchId: bindingData.switchId || null,
          switchPortId: bindingData.switchPortId || null,
          portNum: bindingData.portNum !== undefined ? bindingData.portNum : o.portNum,
          cableCategory: bindingData.cableCategory || o.cableCategory
        };
      })
    }));
    setHasUnsavedChanges(true);
    setIsBindingModalOpen(false);
    setBindingOutlet(null);
  };

  // Unlink Outlet from direct switch/port binding
  const handleUnlinkOutlet = (outletId) => {
    setCurrentFloor(prev => ({
      ...prev,
      outlets: prev.outlets.map(o => {
        if (o.id !== outletId) return o;
        const copy = { ...o };
        delete copy.switchId;
        delete copy.switchPortId;
        return copy;
      })
    }));
    setHasUnsavedChanges(true);
  };

  const getOutletIcon = (type) => {
    switch (type) {
      case 'printer': return <Printer className="w-3.5 h-3.5" />;
      case 'camera': return <Video className="w-3.5 h-3.5" />;
      case 'wifi': return <Wifi className="w-3.5 h-3.5" />;
      case 'voip': return <Phone className="w-3.5 h-3.5" />;
      case 'server': return <Server className="w-3.5 h-3.5" />;
      default: return <Laptop className="w-3.5 h-3.5" />;
    }
  };

  const getOutletColor = (type) => {
    switch (type) {
      case 'printer': return '#10b981'; // emerald
      case 'camera': return '#f43f5e';  // rose
      case 'wifi': return '#eab308';    // amber
      case 'voip': return '#06b6d4';    // cyan
      case 'server': return '#8b5cf6';  // purple
      default: return '#3b82f6';        // blue
    }
  };

  const getRoomBg = (type) => {
    if (isLight) {
      switch (type) {
        case 'server_room': return 'fill-indigo-50 stroke-indigo-300';
        case 'director': return 'fill-purple-50 stroke-purple-300';
        case 'it': return 'fill-sky-50 stroke-sky-300';
        case 'meeting': return 'fill-emerald-50 stroke-emerald-300';
        case 'corridor': return 'fill-slate-100/70 stroke-slate-300 stroke-dashed';
        default: return 'fill-slate-50/90 stroke-slate-300';
      }
    }

    switch (type) {
      case 'server_room': return 'fill-indigo-950/40 stroke-indigo-500/50';
      case 'director': return 'fill-purple-950/20 stroke-purple-500/40';
      case 'it': return 'fill-sky-950/30 stroke-sky-500/40';
      case 'meeting': return 'fill-emerald-950/20 stroke-emerald-500/40';
      case 'corridor': return 'fill-slate-900/40 stroke-slate-700/60 stroke-dashed';
      default: return 'fill-slate-900/60 stroke-slate-700/80';
    }
  };

  if (!currentFloor) {
    return (
      <EmptyState
        theme={theme}
        icon={MapPin}
        title="Планы этажей не найдены"
        description="Создайте план этажа или здания для интерактивной привязки розеток, рабочих мест, точек Wi-Fi и кабельных трасс."
      />
    );
  }

  const serverPos = currentFloor.serverRoomPos || { x: 500, y: 500 };

  return (
    <div className="space-y-4">
      {/* Top Controls Toolbar */}
      <div className={`border rounded-2xl p-4 shadow-sm transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50' : 'bg-slate-900/90 border-slate-800 text-slate-100 backdrop-blur-md shadow-xl'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Floor Tabs */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold uppercase tracking-wider mr-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Этаж:
            </span>
            {floorPlans.map((floor) => (
              <button
                key={floor.id}
                onClick={() => {
                  setSelectedFloorId(floor.id);
                  setSelectedOutletId(null);
                  setSelectedRoomId(null);
                }}
                className={`h-9 px-4 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  selectedFloorId === floor.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{floor.name}</span>
              </button>
            ))}
          </div>

          {/* Quick Filter Badges (in View mode) */}
          {!isEditMode && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs mr-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Розетки:
              </span>
              {[
                { id: 'all', label: 'Все', icon: null },
                { id: 'pc', label: 'ПК', icon: <Laptop className="w-3 h-3" /> },
                { id: 'voip', label: 'VoIP', icon: <Phone className="w-3 h-3" /> },
                { id: 'printer', label: 'МФУ', icon: <Printer className="w-3 h-3" /> },
                { id: 'camera', label: 'CCTV', icon: <Video className="w-3 h-3" /> },
                { id: 'wifi', label: 'Wi-Fi', icon: <Wifi className="w-3 h-3" /> }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`h-9 px-3 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    filterType === f.id
                      ? isLight
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-700 text-white border border-slate-600'
                      : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                      : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  {f.icon}
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Action Buttons: Toggle Edit Mode, Cables, Save */}
          <div className="flex items-center gap-2">
            {/* Cable Paths Toggle */}
            <button
              onClick={() => setShowCables(!showCables)}
              className={`h-9 px-3.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                showCables
                  ? isLight
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  : isLight
                  ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {showCables ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Кабели</span>
            </button>

            {/* Wi-Fi Heatmap Simulator Toggle */}
            <button
              onClick={() => setShowWifiHeatmap(!showWifiHeatmap)}
              className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                showWifiHeatmap
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-400'
                  : isLight
                  ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
              title="Моделирование радиопокрытия точек доступа Wi-Fi (2.4 / 5 ГГц)"
            >
              <Radio className={`w-3.5 h-3.5 ${showWifiHeatmap ? 'animate-pulse text-emerald-200' : 'text-emerald-500'}`} />
              <span>{showWifiHeatmap ? 'Wi-Fi Heatmap: Вкл' : 'Wi-Fi Heatmap'}</span>
            </button>

            {/* Toggle Edit Mode */}
            <button
              onClick={() => {
                setIsEditMode(!isEditMode);
                setEditorTool('select');
              }}
              className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                isEditMode
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{isEditMode ? 'Завершить редактирование' : 'Конструктор плана'}</span>
            </button>

            {/* Save Changes Button */}
            {hasUnsavedChanges && (
              <button
                onClick={handleSavePlan}
                disabled={savingPlan}
                className="h-9 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all cursor-pointer animate-pulse"
              >
                {savingPlan ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Сохранить план</span>
              </button>
            )}

            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Сохранено!
              </span>
            )}

            {/* Export Blueprint Dropdown */}
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
                title="Экспорт плана этажа в PNG, SVG или PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Экспорт</span>
              </button>

              {showExportMenu && (
                <div className={`absolute right-0 top-full mt-2 w-60 rounded-xl border shadow-2xl p-1.5 z-50 transition-all ${
                  isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
                }`}>
                  <button
                    onClick={async () => {
                      setShowExportMenu(false);
                      setIsExportingPng(true);
                      try {
                        await exportSvgToPng(svgRef.current, `floor_${currentFloor.id}_plan`, {
                          scale: 2,
                          backgroundColor: isLight ? '#f8fafc' : '#020617'
                        });
                      } finally {
                        setIsExportingPng(false);
                      }
                    }}
                    disabled={isExportingPng}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-left cursor-pointer"
                  >
                    <Image className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Скачать PNG (HD 2x)</div>
                      <div className="text-[10px] text-slate-400">Четкий растровый снимок</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      exportSvgToFile(svgRef.current, `floor_${currentFloor.id}_plan`);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-left cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Скачать SVG (Вектор)</div>
                      <div className="text-[10px] text-slate-400">Для Visio, AutoCAD, Inkscape</div>
                    </div>
                  </button>

                  <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      printDiagram(`План_этажа_${currentFloor.name}`);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-500/10 hover:text-blue-500 transition-colors text-left cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="font-semibold">Распечатать / В PDF</div>
                      <div className="text-[10px] text-slate-400">Альбомная печать плана</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Editor Toolbar (When Edit Mode is Active) */}
        {isEditMode && (
          <div className={`mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" />
                Инструменты:
              </span>

              {/* Tool: Select & Move */}
              <button
                onClick={() => setEditorTool('select')}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  editorTool === 'select'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Выделение и перемещение розеток, кабинетов и шкафа мышью"
              >
                <Move className="w-3.5 h-3.5" />
                <span>Выбор / Перемещение</span>
              </button>

              {/* Tool: Add Outlet */}
              <button
                onClick={() => setEditorTool('add_outlet')}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  editorTool === 'add_outlet'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Кликните на холсте в месте установки новой розетки СКС"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Добавить розетку</span>
              </button>

              {/* Outlet Type Sub-selector */}
              {editorTool === 'add_outlet' && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs ${
                  isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-800'
                }`}>
                  <span className="text-slate-400 text-[11px]">Тип:</span>
                  {[
                    { id: 'pc', label: 'ПК' },
                    { id: 'voip', label: 'VoIP' },
                    { id: 'printer', label: 'МФУ' },
                    { id: 'camera', label: 'CCTV' },
                    { id: 'wifi', label: 'Wi-Fi' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedOutletType(t.id)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer ${
                        selectedOutletType === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Tool: Add Room */}
              <button
                onClick={() => setEditorTool('add_room')}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  editorTool === 'add_room'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Кликните на плане для создания нового кабинета"
              >
                <Box className="w-3.5 h-3.5" />
                <span>+ Добавить кабинет</span>
              </button>
            </div>

            {/* Upload Background Blueprint File */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.svg"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Загрузить чертёж этажа (PNG, JPG, SVG) в качестве подложки"
              >
                <Upload className="w-3.5 h-3.5 text-blue-500" />
                <span>{currentFloor.backgroundImage ? 'Заменить чертёж (Фон)' : 'Загрузить чертёж'}</span>
              </button>

              {currentFloor.backgroundImage && (
                <button
                  onClick={() => {
                    setCurrentFloor(prev => ({ ...prev, backgroundImage: null }));
                    setHasUnsavedChanges(true);
                  }}
                  className="h-8 px-2 text-rose-500 hover:text-rose-600 text-xs font-medium cursor-pointer"
                  title="Удалить фоновый чертёж"
                >
                  ✕ Убрать фон
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wi-Fi Heatmap Controls Bar */}
      {showWifiHeatmap && (
        <div className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs transition-colors animate-in fade-in duration-200 ${
          isLight ? 'bg-emerald-50/80 border-emerald-200 text-slate-800' : 'bg-slate-900 border-emerald-500/30 text-slate-200'
        }`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Диапазон:</span>
              <div className="flex items-center p-0.5 rounded-lg border border-slate-700 bg-slate-950">
                <button
                  onClick={() => setWifiFrequency('5ghz')}
                  className={`h-6 px-2.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    wifiFrequency === '5ghz' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  5 ГГц (Скорость)
                </button>
                <button
                  onClick={() => setWifiFrequency('2.4ghz')}
                  className={`h-6 px-2.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                    wifiFrequency === '2.4ghz' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2.4 ГГц (Дальность)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Мощность Tx:</span>
              <select
                value={wifiTxPower}
                onChange={(e) => setWifiTxPower(parseInt(e.target.value))}
                className="h-7 px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white outline-none cursor-pointer"
              >
                <option value={14}>14 dBm (25 мВт - Low)</option>
                <option value={20}>20 dBm (100 мВт - Standard)</option>
                <option value={24}>24 dBm (250 мВт - High)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Стены:</span>
              <select
                value={wifiWallMaterial}
                onChange={(e) => setWifiWallMaterial(e.target.value)}
                className="h-7 px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white outline-none cursor-pointer"
              >
                <option value="drywall">Гипсокартон / Стекло (-4 dB)</option>
                <option value="brick">Кирпич / Газобетон (-9 dB)</option>
                <option value="concrete">Железобетон (-14 dB)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Live Probe Output */}
            {heatmapProbe ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-emerald-500/40 text-[11px] font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">Сигнал в точке:</span>
                <strong className={heatmapProbe.rssi >= -65 ? 'text-emerald-400' : heatmapProbe.rssi >= -75 ? 'text-amber-400' : 'text-rose-400'}>
                  {heatmapProbe.rssi} dBm
                </strong>
                <span className="text-slate-500 hidden sm:inline">({heatmapProbe.apName})</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 italic hidden sm:inline">
                Наведите курсор на план для замера сигнала
              </span>
            )}

            {/* Quick add AP button if none */}
            {wifiAps.length === 0 && (
              <button
                onClick={handleAddQuickWifiAp}
                className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Добавить AP на этаж</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Interactive SVG Canvas and Details Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* SVG Floor Map Area (3 cols) */}
        <div className={`lg:col-span-3 border rounded-2xl p-3 relative overflow-hidden transition-all ${
          isLight
            ? 'bg-slate-50 border-slate-200 shadow-slate-200/50'
            : 'bg-slate-950/90 border-slate-800 shadow-xl'
        }`}>
          {/* Wi-Fi Heatmap Canvas Layer */}
          {showWifiHeatmap && (
            <canvas
              ref={canvasRef}
              width={960}
              height={640}
              className="absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity"
              style={{
                mixBlendMode: isLight ? 'multiply' : 'screen',
                opacity: isLight ? 0.72 : 0.85
              }}
            />
          )}

          <svg
            ref={svgRef}
            viewBox="0 0 960 640"
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMoveCanvas}
            onMouseUp={handleMouseUpCanvas}
            className={`w-full h-auto max-h-[640px] select-none ${
              isEditMode
                ? (editorTool === 'add_outlet' || editorTool === 'add_room' ? 'cursor-crosshair' : 'cursor-default')
                : 'cursor-default'
            }`}
            style={{ filter: isLight ? 'drop-shadow(0 10px 20px rgba(0,0,0,0.06))' : 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))' }}
          >
            <defs>
              {/* Pattern for floor grid */}
              <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path 
                  d="M 20 0 L 0 0 0 20" 
                  fill="none" 
                  stroke={isLight ? "rgba(100, 116, 139, 0.12)" : "rgba(255, 255, 255, 0.03)"} 
                  strokeWidth="1" 
                />
              </pattern>
              
              {/* Glow filter for active cables and sockets */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Grid */}
            <rect 
              width="960" 
              height="640" 
              fill={isLight ? '#ffffff' : 'url(#floor-grid)'} 
              rx="16" 
            />
            {isLight && (
              <rect width="960" height="640" fill="url(#floor-grid)" rx="16" />
            )}

            {/* Uploaded Blueprint Image (if any) */}
            {currentFloor.backgroundImage && (
              <image
                href={currentFloor.backgroundImage}
                x="0"
                y="0"
                width="960"
                height="640"
                preserveAspectRatio="xMidYMid slice"
                opacity={isLight ? 0.85 : 0.65}
              />
            )}

            {/* Room Polygons */}
            {currentFloor.rooms?.map((room) => {
              const isSelected = selectedRoomId === room.id;
              return (
                <g 
                  key={room.id}
                  onMouseDown={(e) => handleMouseDownRoom(e, room)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRoomId(isSelected ? null : room.id);
                  }}
                  className={`transition-all duration-200 ${isEditMode ? 'cursor-move' : 'cursor-pointer'}`}
                >
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    rx="8"
                    className={`${getRoomBg(room.type)} transition-colors duration-200 ${
                      isSelected 
                        ? (isLight ? 'stroke-blue-600 stroke-2' : 'stroke-blue-400 stroke-2')
                        : 'stroke-1'
                    }`}
                  />
                  {/* Room Label */}
                  <text
                    x={room.x + 12}
                    y={room.y + 24}
                    fill={isLight ? '#475569' : '#94a3b8'}
                    fontSize="12"
                    fontWeight="600"
                    className="pointer-events-none font-sans"
                  >
                    {room.name}
                  </text>

                  {/* Room Resize Handle in Edit Mode */}
                  {isEditMode && isSelected && (
                    <g
                      transform={`translate(${room.x + room.w - 12}, ${room.y + room.h - 12})`}
                      onMouseDown={(e) => handleMouseDownRoomResize(e, room)}
                      className="cursor-se-resize pointer-events-auto"
                    >
                      <rect width="12" height="12" rx="2" fill="#3b82f6" />
                      <line x1="3" y1="9" x2="9" y2="3" stroke="#ffffff" strokeWidth="1.5" />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Wi-Fi Access Points Wave Pulses */}
            {showWifiHeatmap && wifiAps.map(ap => (
              <g key={`ap-pulse-${ap.id}`} className="pointer-events-none">
                <circle cx={ap.x} cy={ap.y} r="25" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" className="animate-ping origin-center" />
                <circle cx={ap.x} cy={ap.y} r="60" fill="none" stroke="#22c55e" strokeWidth="1" strokeDasharray="5 5" opacity="0.45" />
                <circle cx={ap.x} cy={ap.y} r="120" fill="none" stroke="#eab308" strokeWidth="1" strokeDasharray="6 6" opacity="0.25" />
              </g>
            ))}

            {/* Cable Paths from Outlets to Cross Cabinet */}
            {showCables && filteredOutlets.map((outlet) => {
              const isSelected = selectedOutletId === outlet.id;
              const isHovered = hoveredOutletId === outlet.id;
              const strokeColor = getOutletColor(outlet.type);

              // Orthogonal / Bezier routing towards server cabinet
              const startX = outlet.x;
              const startY = outlet.y;
              const endX = serverPos.x;
              const endY = serverPos.y;

              const midY = (startY + endY) / 2;
              const pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

              return (
                <path
                  key={`cable-${outlet.id}`}
                  d={pathD}
                  fill="none"
                  stroke={isSelected || isHovered ? strokeColor : (isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.18)')}
                  strokeWidth={isSelected || isHovered ? 2.5 : 1.2}
                  strokeDasharray={isSelected || isHovered ? 'none' : '4 4'}
                  filter={isSelected || isHovered ? 'url(#glow)' : 'none'}
                  className="transition-all duration-200 pointer-events-none"
                />
              );
            })}

            {/* Server / Cross Cabinet Landmark (Draggable in Edit Mode) */}
            <g
              transform={`translate(${serverPos.x - 30}, ${serverPos.y - 30})`}
              onMouseDown={handleMouseDownCabinet}
              className={isEditMode ? 'cursor-move' : 'cursor-default'}
            >
              <rect
                x="0"
                y="0"
                width="60"
                height="60"
                rx="10"
                className={isLight ? "fill-indigo-100/90 stroke-indigo-500 stroke-2" : "fill-indigo-950/90 stroke-indigo-400 stroke-2"}
                filter="url(#glow)"
              />
              <text x="30" y="24" fill={isLight ? "#4338ca" : "#a5b4fc"} fontSize="10" fontWeight="bold" textAnchor="middle">
                {currentFloor.crossCabinet || 'ШТВ-1'}
              </text>
              <text x="30" y="38" fill={isLight ? "#3730a3" : "#e0e7ff"} fontSize="9" textAnchor="middle">
                Серверная
              </text>
              <circle cx="30" cy="50" r="3" fill="#10b981" />
            </g>

            {/* Wall Outlets (Sockets) */}
            {filteredOutlets.map((outlet) => {
              const isSelected = selectedOutletId === outlet.id;
              const isHovered = hoveredOutletId === outlet.id;
              const color = getOutletColor(outlet.type);

              return (
                <g
                  key={outlet.id}
                  transform={`translate(${outlet.x}, ${outlet.y})`}
                  onMouseDown={(e) => handleMouseDownOutlet(e, outlet)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOutletId(isSelected ? null : outlet.id);
                  }}
                  onMouseEnter={() => setHoveredOutletId(outlet.id)}
                  onMouseLeave={() => setHoveredOutletId(null)}
                  className={isEditMode ? 'cursor-move' : 'cursor-pointer'}
                >
                  {/* Halo pulse when selected or hovered */}
                  {(isSelected || isHovered) && (
                    <circle
                      r="18"
                      fill={color}
                      opacity={isLight ? "0.35" : "0.25"}
                      className="animate-ping"
                    />
                  )}

                  {/* Outer Socket Ring */}
                  <circle
                    r="12"
                    fill={isLight ? "#ffffff" : "#0f172a"}
                    stroke={isSelected || isHovered ? color : (isLight ? '#94a3b8' : '#334155')}
                    strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                    filter={isSelected ? 'url(#glow)' : 'none'}
                  />

                  {/* Core Icon Indicator */}
                  <circle
                    r="6"
                    fill={color}
                  />

                  {/* Socket Label Tag */}
                  <g transform="translate(0, 22)">
                    <rect
                      x="-22"
                      y="-8"
                      width="44"
                      height="15"
                      rx="4"
                      fill={isLight ? "#ffffff" : "#020617"}
                      stroke={isSelected ? color : (isLight ? '#cbd5e1' : '#1e293b')}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3"
                      fill={isSelected ? (isLight ? '#0f172a' : '#ffffff') : (isLight ? '#334155' : '#94a3b8')}
                      fontSize="9"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {outlet.socket}
                    </text>
                  </g>

                  {/* Connected Switch Link Badge (small indicator at top-right) */}
                  {(outlet.switchId || currentPatchPanel?.ports?.some(p => (p.number === outlet.portNum || p.socket === outlet.socket) && p.connectedSwitchId)) && (
                    <circle
                      cx="10"
                      cy="-10"
                      r="4"
                      fill="#10b981"
                      stroke={isLight ? "#ffffff" : "#0f172a"}
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Canvas Help Overlay */}
          <div className={`absolute bottom-3 left-4 text-[11px] flex items-center gap-3 px-3 py-1.5 rounded-lg border ${
            isLight
              ? 'bg-white/95 text-slate-600 border-slate-200 shadow-xs'
              : 'bg-slate-900/80 text-slate-500 border-slate-800'
          }`}>
            {isEditMode ? (
              <span>🛠️ Перетаскивайте розетки, кабинеты и шкаф мышью. Длина кабелей пересчитывается на лету.</span>
            ) : (
              <span>💡 Кликните на розетку для инспекции СКС и проверки связности</span>
            )}
          </div>
        </div>

        {/* Side Details Inspector Drawer (1 col) */}
        <div className={`border rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
            : 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
        }`}>
          {selectedOutlet ? (
            <div className="space-y-4">
              {/* Header */}
              <div className={`flex items-start justify-between border-b pb-3 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getOutletColor(selectedOutlet.type) }}
                    />
                    <h3 className={`text-base font-bold font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Розетка {selectedOutlet.socket}
                    </h3>
                  </div>
                  <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {selectedOutlet.room}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {isEditMode && (
                    <button
                      onClick={() => handleDeleteOutlet(selectedOutlet.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                      title="Удалить розетку"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedOutletId(null)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Visual End-to-End Circuit Chain */}
              <div className={`p-3 rounded-xl border space-y-2 ${
                isLight ? 'bg-blue-50/60 border-blue-200' : 'bg-blue-950/20 border-blue-900/40'
              }`}>
                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-[11px]">
                  <CornerDownRight className="w-3.5 h-3.5" />
                  <span>Сквозная цепочка трассировки</span>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-mono overflow-x-auto pb-1">
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border font-bold text-slate-800 dark:text-slate-200 shrink-0">
                    {selectedOutlet.socket}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border text-blue-600 dark:text-blue-400 shrink-0">
                    ПП: #{selectedOutlet.portNum}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border text-emerald-600 dark:text-emerald-400 shrink-0">
                    {outletWiring?.switchPort ? `Порт ${outletWiring.switchPort.number}` : 'Нет кросса'}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border text-indigo-600 dark:text-indigo-400 shrink-0">
                    VLAN {outletWiring?.switchPort?.pvid || 10}
                  </span>
                </div>
              </div>

              {/* Cable Specs & Physical Attributes */}
              <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
              }`}>
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold mb-1">
                  <Cable className="w-3.5 h-3.5" />
                  <span>Параметры кабельной линии СКС</span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Маркировка:</span>
                  <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{outletWiring?.ppPort?.cableMark || `К-${selectedOutlet.portNum}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Категория:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">{selectedOutlet.cableCategory || 'Cat.6 UTP (250MHz)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Расчетная длина:</span>
                  <span className={`font-mono font-bold ${isLight ? "text-slate-800" : "text-slate-200"}`}>{selectedOutlet.cableLength || '24 м'}</span>
                </div>
              </div>

              {/* Patch Panel Link */}
              <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
              }`}>
                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold mb-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Патч-панель (Кросс)</span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Панель:</span>
                  <span className={isLight ? "text-slate-800 font-medium" : "text-slate-200"}>{currentPatchPanel?.name || 'PP-01'}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-slate-400"}>Порт кросса:</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">Порт #{selectedOutlet.portNum}</span>
                </div>
              </div>

              {/* Switch Port Link (Direct or via Cross) */}
              <div className={`p-3 rounded-xl border space-y-2.5 text-xs ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                    <Server className="w-3.5 h-3.5" />
                    <span>Коммутатор доступа</span>
                  </div>
                  {outletWiring?.isDirectBinding && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                      Прямая привязка
                    </span>
                  )}
                </div>

                {outletWiring?.targetSwitch && outletWiring?.switchPort ? (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex justify-between items-center">
                      <span className={isLight ? "text-slate-500" : "text-slate-400"}>Коммутатор:</span>
                      <span className={`font-semibold ${isLight ? "text-slate-900" : "text-slate-200"}`}>{outletWiring.targetSwitch.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? "text-slate-500" : "text-slate-400"}>Порт свитча:</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className={`w-2 h-2 rounded-full ${outletWiring.switchPort.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {outletWiring.switchPort.name || `p${outletWiring.switchPort.number}`}
                        </span>
                        <span className="text-[10px] text-slate-400">({outletWiring.switchPort.speed || '1G'})</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? "text-slate-500" : "text-slate-400"}>VLAN / PVID:</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold font-mono">#{outletWiring.switchPort.pvid || 10}</span>
                    </div>
                    {outletWiring.switchPort.poe && (
                      <div className="flex justify-between items-center">
                        <span className={isLight ? "text-slate-500" : "text-slate-400"}>PoE Питание:</span>
                        <span className="text-amber-500 font-semibold flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Включено (802.3at/af)
                        </span>
                      </div>
                    )}
                    {outletWiring.switchPort.description && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800/80">
                        <span className="text-slate-400 text-[11px]">Инфо порта:</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-[150px]">
                          «{outletWiring.switchPort.description}»
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2 space-y-1">
                    <p className="text-slate-500 text-[11px]">Порт коммутатора не привязан</p>
                    <p className="text-[10px] text-slate-400">Свяжите розетку напрямую с физическим портом свитча</p>
                  </div>
                )}

                {/* Edit Binding button */}
                <div className="pt-1 border-t border-slate-200 dark:border-slate-800/80 flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setBindingOutlet(selectedOutlet);
                      setIsBindingModalOpen(true);
                    }}
                    className={`flex-1 h-8 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-700'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{outletWiring?.targetSwitch ? 'Изменить порт свитча' : 'Привязать порт свитча'}</span>
                  </button>
                  {selectedOutlet.switchId && (
                    <button
                      onClick={() => handleUnlinkOutlet(selectedOutlet.id)}
                      className="h-8 px-2 rounded-lg text-rose-500 hover:bg-rose-500/10 text-[11px] font-medium transition-colors cursor-pointer"
                      title="Отвязать прямой порт свитча (вернуть к кросс-панели)"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => onOpenDeviceTrace && onOpenDeviceTrace(selectedOutlet.socket)}
                  className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Трассировка и Live Ping</span>
                </button>

                {outletWiring?.targetSwitch && onSelectSwitch && (
                  <button
                    onClick={() => onSelectSwitch(outletWiring.targetSwitch.id)}
                    className={`w-full h-9 rounded-xl border font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Открыть {outletWiring.targetSwitch.name}</span>
                  </button>
                )}
              </div>
            </div>
          ) : selectedRoomId ? (
            /* Selected Room Info & Delete in Edit Mode */
            <div className="space-y-4">
              {(() => {
                const room = currentFloor.rooms?.find(r => r.id === selectedRoomId);
                if (!room) return null;
                const roomOutlets = (currentFloor.outlets || []).filter(o => o.room === room.name);
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-3">
                      <div>
                        <h3 className="text-base font-bold font-sans text-slate-900 dark:text-white">{room.name}</h3>
                        <p className="text-xs text-slate-500">Помещение этажа</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {isEditMode && (
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title="Удалить кабинет"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedRoomId(null)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
                    }`}>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Розеток в кабинете:</span>
                        <span className="font-bold text-blue-500">{roomOutlets.length} шт.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Габариты:</span>
                        <span className="font-mono text-slate-300">{room.w} x {room.h} px</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="py-16 text-center space-y-3">
              <MapPin className={`w-10 h-10 mx-auto ${isLight ? 'text-blue-500/40' : 'text-blue-400/30'}`} />
              <div>
                <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                  {isEditMode ? 'Режим конструктора активен' : 'Выберите розетку'}
                </p>
                <p className={`text-xs mt-1 max-w-[200px] mx-auto ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                  {isEditMode
                    ? 'Используйте панель инструментов сверху для добавления и перемещения оборудования.'
                    : 'Нажмите на маркер розетки на карте этажа для просмотра кроссировки кабеля и свитча.'}
                </p>
              </div>
            </div>
          )}

          {/* Quick Legend at bottom of drawer */}
          <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
            <span className={`text-[11px] font-semibold uppercase tracking-wider block mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Условные обозначения:
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>ПК / Офис</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                <span>VoIP телефон</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Принтер/МФУ</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>IP-Камера</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Wi-Fi Точка</span>
              </div>
              <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>Серверная</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Socket Port Binding Modal (Live Socket Mapping) */}
      {isBindingModalOpen && bindingOutlet && (
        <SocketBindingModal
          outlet={bindingOutlet}
          switches={switches}
          patchPanels={patchPanels}
          currentFloor={currentFloor}
          onSave={handleSaveOutletBinding}
          onClose={() => {
            setIsBindingModalOpen(false);
            setBindingOutlet(null);
          }}
          theme={theme}
        />
      )}
    </div>
  );
}

// Subcomponent: Socket Port Binding Modal
function SocketBindingModal({
  outlet,
  switches = [],
  patchPanels = [],
  currentFloor,
  onSave,
  onClose,
  theme = 'dark'
}) {
  const isLight = theme === 'light';

  // Find initial switch
  const initialSwitchId = outlet.switchId || switches[0]?.id || '';
  const [selectedSwitchId, setSelectedSwitchId] = useState(initialSwitchId);

  const selectedSwitch = useMemo(() => {
    return switches.find(s => s.id === selectedSwitchId);
  }, [switches, selectedSwitchId]);

  const initialPortId = outlet.switchPortId || selectedSwitch?.ports?.[0]?.id || '';
  const [selectedPortId, setSelectedPortId] = useState(initialPortId);
  const [portNum, setPortNum] = useState(outlet.portNum || 1);
  const [cableCategory, setCableCategory] = useState(outlet.cableCategory || 'Cat.6 UTP (250MHz)');

  // Update selectedPortId if switch changes and current port doesn't belong to it
  const handleSwitchChange = (swId) => {
    setSelectedSwitchId(swId);
    const sw = switches.find(s => s.id === swId);
    if (sw && sw.ports?.length > 0) {
      setSelectedPortId(sw.ports[0].id);
    } else {
      setSelectedPortId('');
    }
  };

  const selectedPort = useMemo(() => {
    if (!selectedSwitch) return null;
    return selectedSwitch.ports?.find(p => p.id === selectedPortId || p.number === selectedPortId);
  }, [selectedSwitch, selectedPortId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(outlet.id, {
      switchId: selectedSwitchId || null,
      switchPortId: selectedPortId || null,
      portNum: parseInt(portNum) || outlet.portNum,
      cableCategory
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden transition-all ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Привязка розетки {outlet.socket}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold">
                  {outlet.room}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Связать розетку этажа напрямую с физическим портом коммутатора
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Target Switch Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Коммутатор доступа
            </label>
            <select
              value={selectedSwitchId}
              onChange={(e) => handleSwitchChange(e.target.value)}
              className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-indigo-500 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              {switches.map(sw => (
                <option key={sw.id} value={sw.id}>
                  {sw.name} ({sw.vendor} {sw.model}) — {sw.ip || 'No IP'}
                </option>
              ))}
            </select>
          </div>

          {/* Switch Port Selector */}
          {selectedSwitch && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Порт коммутатора
              </label>
              <select
                value={selectedPortId}
                onChange={(e) => setSelectedPortId(e.target.value)}
                className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-indigo-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              >
                {(selectedSwitch.ports || []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || `Port ${p.number}`} (VLAN {p.pvid || 1}) {p.description ? `— ${p.description}` : ''} {p.poe ? '⚡PoE' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selected Port Preview Card */}
          {selectedPort && (
            <div className={`p-3 rounded-xl border space-y-1.5 text-xs ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Режим и VLAN:</span>
                <span className="font-mono font-bold text-indigo-500">
                  {selectedPort.mode?.toUpperCase() || 'ACCESS'} (VLAN {selectedPort.pvid || 1})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Скорость линка:</span>
                <span className="font-mono text-emerald-500 font-semibold">{selectedPort.speed || '1G'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">PoE питание:</span>
                <span className={selectedPort.poe ? 'text-amber-500 font-medium' : 'text-slate-400'}>
                  {selectedPort.poe ? 'Включено (PoE)' : 'Выключено'}
                </span>
              </div>
              {selectedPort.connectedTo && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800/80">
                  <span className="text-slate-500">Подключено к:</span>
                  <span className="text-slate-400 truncate max-w-[200px]">«{selectedPort.connectedTo}»</span>
                </div>
              )}
            </div>
          )}

          {/* Secondary Details: Patch Panel Port Num & Cable Category */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Номер порта патч-панели
              </label>
              <input
                type="number"
                min="1"
                max="96"
                value={portNum}
                onChange={(e) => setPortNum(e.target.value)}
                className={`w-full h-9 border rounded-xl px-3 text-xs font-mono outline-none focus:border-indigo-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Категория кабеля СКС
              </label>
              <select
                value={cableCategory}
                onChange={(e) => setCableCategory(e.target.value)}
                className={`w-full h-9 border rounded-xl px-3 text-xs outline-none focus:border-indigo-500 ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                }`}
              >
                <option value="Cat.6 UTP (250MHz)">Cat.6 UTP (250MHz)</option>
                <option value="Cat.6A F/UTP (500MHz)">Cat.6A F/UTP (500MHz)</option>
                <option value="Cat.5e UTP (100MHz)">Cat.5e UTP (100MHz)</option>
                <option value="Cat.7 S/FTP (600MHz)">Cat.7 S/FTP (600MHz)</option>
              </select>
            </div>
          </div>

          {/* Modal Actions */}
          <div className={`pt-3 border-t flex items-center justify-end gap-2.5 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`h-9 px-4 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="h-9 px-5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Сохранить привязку</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
