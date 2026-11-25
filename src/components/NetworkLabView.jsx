import React, { useState, useEffect, useRef } from 'react';
import {
  GraduationCap,
  Play,
  RotateCcw,
  Trash2,
  Plus,
  Cable,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Monitor,
  Server,
  Layers,
  Radio,
  Move,
  Settings2,
  X,
  Sparkles,
  ChevronRight,
  Info,
  Check,
  Award,
  ArrowRight,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import {
  createLabNode,
  createLabLink,
  simulatePing,
  verifyLabSolution,
  PRESET_LABS
} from '../utils/networkSimulatorEngine';
import { useToast } from '../context/ToastContext';

export function NetworkLabView({ theme = 'dark' }) {
  const toast = useToast();
  const isLight = theme === 'light';

  // Active Lab
  const [activeLabId, setActiveLabId] = useState('lab-1');
  const [nodes, setNodes] = useState(() => PRESET_LABS[0].initialNodes);
  const [links, setLinks] = useState(() => PRESET_LABS[0].initialLinks);

  // Interaction Mode: 'drag' | 'connect' | 'ping'
  const [toolMode, setToolMode] = useState('drag');

  // Cable Connection State
  const [connectSource, setConnectSource] = useState(null); // { nodeId, portId }

  // Ping Testing State
  const [pingSourceId, setPingSourceId] = useState(null);
  const [pingTargetId, setPingTargetId] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [activeHopIndex, setActiveHopIndex] = useState(0);
  const [isAnimatingPing, setIsAnimatingPing] = useState(false);

  // Node Selection for Inspector
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Lab Evaluation
  const [labEvaluation, setLabEvaluation] = useState(null);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);

  // Dragging State
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const activeLab = PRESET_LABS.find(l => l.id === activeLabId);

  // Load a Lab
  const handleSelectLab = (labId) => {
    setActiveLabId(labId);
    setSelectedNodeId(null);
    setPingResult(null);
    setLabEvaluation(null);
    setConnectSource(null);

    if (labId === 'custom') {
      setNodes([]);
      setLinks([]);
      return;
    }

    const lab = PRESET_LABS.find(l => l.id === labId);
    if (lab) {
      // Deep clone initial nodes and links
      setNodes(JSON.parse(JSON.stringify(lab.initialNodes)));
      setLinks(JSON.parse(JSON.stringify(lab.initialLinks)));
      toast?.info?.(`Загружена: ${lab.title}`);
    }
  };

  // Reset current lab to default state
  const handleResetLab = () => {
    handleSelectLab(activeLabId);
  };

  // Add a new node
  const handleAddNode = (type) => {
    const defaultPositions = {
      pc: { x: 120 + Math.random() * 80, y: 300 + Math.random() * 50 },
      server: { x: 700 + Math.random() * 80, y: 300 + Math.random() * 50 },
      switch: { x: 400 + Math.random() * 60, y: 220 + Math.random() * 50 },
      router: { x: 400 + Math.random() * 60, y: 80 + Math.random() * 40 }
    };

    const pos = defaultPositions[type] || { x: 300, y: 200 };
    const newNode = createLabNode({ type, x: pos.x, y: pos.y });
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    toast?.success?.(`Добавлено устройство: ${newNode.name}`);
  };

  // Drag & Drop handlers
  const handleMouseDownNode = (e, nodeId) => {
    if (toolMode !== 'drag') return;
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    setDraggingNodeId(nodeId);
    dragOffsetRef.current = {
      x: e.clientX - node.x,
      y: e.clientY - node.y
    };
  };

  const handleMouseMoveCanvas = (e) => {
    if (!draggingNodeId || toolMode !== 'drag') return;
    const newX = Math.max(20, Math.min(1300, e.clientX - dragOffsetRef.current.x));
    const newY = Math.max(20, Math.min(800, e.clientY - dragOffsetRef.current.y));

    setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n));
  };

  const handleMouseUpCanvas = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
  };

  // Handle clicking on a node or port
  const handleNodeClick = (nodeId) => {
    if (toolMode === 'drag') {
      setSelectedNodeId(nodeId);
    } else if (toolMode === 'ping') {
      if (!pingSourceId) {
        setPingSourceId(nodeId);
        toast?.info?.('Отправитель выбран. Теперь кликните на узел назначения для запуска теста!');
      } else if (pingSourceId !== nodeId) {
        setPingTargetId(nodeId);
        executePingTest(pingSourceId, nodeId);
      }
    }
  };

  // Connect port click
  const handlePortClick = (e, nodeId, portId) => {
    e.stopPropagation();
    if (toolMode !== 'connect') {
      setSelectedNodeId(nodeId);
      return;
    }

    if (!connectSource) {
      setConnectSource({ nodeId, portId });
      toast?.info?.(`Выбран порт источника (${portId}). Кликните на порт другого узла для соединения!`);
    } else {
      if (connectSource.nodeId === nodeId) {
        toast?.warning?.('Нельзя соединить кабель с тем же самым устройством');
        setConnectSource(null);
        return;
      }

      // Check if connection already exists on either port
      const alreadyConnected = links.some(
        l => (l.sourceNodeId === connectSource.nodeId && l.sourcePortId === connectSource.portId) ||
             (l.targetNodeId === connectSource.nodeId && l.targetPortId === connectSource.portId) ||
             (l.sourceNodeId === nodeId && l.sourcePortId === portId) ||
             (l.targetNodeId === nodeId && l.targetPortId === portId)
      );

      if (alreadyConnected) {
        toast?.warning?.('Один из выбранных портов уже занят кабелем');
        setConnectSource(null);
        return;
      }

      const newLink = createLabLink({
        sourceNodeId: connectSource.nodeId,
        sourcePortId: connectSource.portId,
        targetNodeId: nodeId,
        targetPortId: portId
      });

      setLinks(prev => [...prev, newLink]);
      setConnectSource(null);
      toast?.success?.('Кабель успешно проложен!');
    }
  };

  // Run ping test
  const executePingTest = (srcId, dstId) => {
    const res = simulatePing({
      sourceNodeId: srcId,
      targetNodeId: dstId,
      nodes,
      links
    });

    setPingResult(res);
    setActiveHopIndex(0);
    setIsAnimatingPing(true);

    if (res.success) {
      toast?.success?.(res.summary);
    } else {
      toast?.error?.(res.summary);
    }
  };

  // Step through ping animation
  useEffect(() => {
    if (!isAnimatingPing || !pingResult || !pingResult.hops.length) return;
    if (activeHopIndex < pingResult.hops.length - 1) {
      const timer = setTimeout(() => {
        setActiveHopIndex(prev => prev + 1);
      }, 1400);
      return () => clearTimeout(timer);
    } else {
      setIsAnimatingPing(false);
    }
  }, [isAnimatingPing, activeHopIndex, pingResult]);

  // Verify Lab Solution
  const handleVerifySolution = () => {
    const result = verifyLabSolution(activeLabId, { nodes, links });
    setLabEvaluation(result);
    setShowEvaluationModal(true);
    if (result.solved) {
      toast?.success?.('Поздравляем! Лабораторная работа успешно выполнена!');
    } else {
      toast?.warning?.('Задание пока не выполнено. Проверьте условия.');
    }
  };

  // Delete node
  const handleDeleteNode = (nodeId) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setLinks(prev => prev.filter(l => l.sourceNodeId !== nodeId && l.targetNodeId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (pingSourceId === nodeId) setPingSourceId(null);
    if (pingTargetId === nodeId) setPingTargetId(null);
    toast?.info?.('Узел удален');
  };

  // Delete link
  const handleDeleteLink = (linkId) => {
    setLinks(prev => prev.filter(l => l.id !== linkId));
    toast?.info?.('Кабель отключен');
  };

  // Selected node object
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      className={`h-[calc(100vh-5.5rem)] flex flex-col overflow-hidden select-none ${
        isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#090d16] text-slate-100'
      }`}
    >
      {/* Top Toolbar */}
      <div className={`p-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/90 border-slate-800'
      }`}>
        {/* Left: Brand & Lab Selector */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-white">
                Лаборатория сети (L2/L3)
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Interactive Sandbox
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Обучающий симулятор для стажеров: Access, Trunk, VLAN и маршрутизация
            </p>
          </div>

          {/* Lab Selector Dropdown */}
          <div className="ml-2">
            <select
              value={activeLabId}
              onChange={e => handleSelectLab(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-100'
              }`}
            >
              {PRESET_LABS.map(lab => (
                <option key={lab.id} value={lab.id}>
                  {lab.title} ({lab.difficulty})
                </option>
              ))}
              <option value="custom">Свободный холст (Песочница)</option>
            </select>
          </div>
        </div>

        {/* Center: Tool Modes */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/60">
          <button
            onClick={() => { setToolMode('drag'); setConnectSource(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              toolMode === 'drag'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Перемещение узлов по холсту"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Перемещение</span>
          </button>

          <button
            onClick={() => { setToolMode('connect'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              toolMode === 'connect'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Прокладка кабелей между портами"
          >
            <Cable className="w-3.5 h-3.5" />
            <span>Кабель</span>
          </button>

          <button
            onClick={() => { setToolMode('ping'); setPingSourceId(null); setPingTargetId(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              toolMode === 'ping'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Тестирование пинга между узлами"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Тест Ping</span>
          </button>
        </div>

        {/* Right: Add Device Palette & Verify Button */}
        <div className="flex items-center gap-2">
          {/* Add Device Buttons */}
          <div className="flex items-center gap-1 border-r border-slate-700/60 pr-2">
            <button
              onClick={() => handleAddNode('pc')}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Добавить компьютер"
            >
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden xl:inline">+ПК</span>
            </button>

            <button
              onClick={() => handleAddNode('server')}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Добавить сервер"
            >
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline">+Сервер</span>
            </button>

            <button
              onClick={() => handleAddNode('switch')}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Добавить коммутатор L2"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden xl:inline">+Свитч</span>
            </button>

            <button
              onClick={() => handleAddNode('router')}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                isLight ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
              title="Добавить маршрутизатор L3"
            >
              <Radio className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden xl:inline">+Роутер</span>
            </button>
          </div>

          {/* Reset button */}
          <button
            onClick={handleResetLab}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Сбросить к условию задачи"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Verify Solution Button */}
          {activeLab && (
            <button
              onClick={handleVerifySolution}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-500/20 cursor-pointer"
            >
              <Award className="w-4 h-4" />
              <span>Проверить решение</span>
            </button>
          )}
        </div>
      </div>

      {/* Lab Objective Sub-bar */}
      {activeLab && (
        <div className={`px-4 py-2.5 border-b text-xs flex items-center justify-between shrink-0 ${
          isLight ? 'bg-purple-50/70 border-purple-200 text-purple-900' : 'bg-purple-950/20 border-purple-800/40 text-purple-200'
        }`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-purple-500/20 text-purple-400 text-[10px] uppercase shrink-0">
              Цель лабы:
            </span>
            <span className="truncate">{activeLab.goal}</span>
          </div>
          <button
            onClick={() => setShowEvaluationModal(true)}
            className="text-[11px] font-semibold underline text-purple-400 hover:text-purple-300 shrink-0 ml-3 cursor-pointer"
          >
            Условия проверки
          </button>
        </div>
      )}

      {/* Active Ping Instruction HUD */}
      {toolMode === 'ping' && (
        <div className={`px-4 py-2 border-b text-xs flex items-center justify-between shrink-0 ${
          isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-800/40 text-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
            <span>
              {!pingSourceId
                ? 'Кликните на узел-ОТПРАВИТЕЛЬ (ПК или Сервер)'
                : !pingTargetId
                ? `Отправитель: ${nodes.find(n => n.id === pingSourceId)?.name}. Теперь кликните на узел-ПОЛУЧАТЕЛЬ.`
                : `Тест связи: ${nodes.find(n => n.id === pingSourceId)?.name} ➔ ${nodes.find(n => n.id === pingTargetId)?.name}`}
            </span>
          </div>
          {pingResult && (
            <button
              onClick={() => { setPingSourceId(null); setPingTargetId(null); setPingResult(null); }}
              className="text-[11px] underline text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              Сбросить пинг
            </button>
          )}
        </div>
      )}

      {/* Main Sandbox Canvas & Inspector */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Canvas Area */}
        <div className="flex-1 relative overflow-auto">
          {/* Background Grid Pattern SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 1400, minHeight: 900 }}>
            <defs>
              <pattern id="labGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.2" fill={isLight ? '#cbd5e1' : '#1e293b'} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#labGrid)" />

            {/* Render Cables */}
            {links.map((link) => {
              const srcNode = nodes.find(n => n.id === link.sourceNodeId);
              const dstNode = nodes.find(n => n.id === link.targetNodeId);
              if (!srcNode || !dstNode) return null;

              const x1 = srcNode.x + 90;
              const y1 = srcNode.y + 40;
              const x2 = dstNode.x + 90;
              const y2 = dstNode.y + 40;

              // Check if link is part of active ping animation
              const isPingActiveLink = pingResult?.hops[activeHopIndex] && (
                (pingResult.hops[activeHopIndex].fromNodeId === srcNode.id && pingResult.hops[activeHopIndex].toNodeId === dstNode.id) ||
                (pingResult.hops[activeHopIndex].fromNodeId === dstNode.id && pingResult.hops[activeHopIndex].toNodeId === srcNode.id)
              );

              // Detect Trunk link
              const isTrunkLink = (srcNode.type === 'switch' && dstNode.type === 'switch') ||
                                  (srcNode.type === 'switch' && dstNode.type === 'router') ||
                                  (dstNode.type === 'switch' && srcNode.type === 'router');

              const cableStroke = isPingActiveLink
                ? (pingResult?.hops[activeHopIndex]?.status === 'dropped' ? '#ef4444' : '#22c55e')
                : (isTrunkLink ? '#a855f7' : '#3b82f6');

              const strokeWidth = isPingActiveLink ? 4 : (isTrunkLink ? 3 : 2);
              const isDashed = isTrunkLink;

              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              return (
                <g key={link.id} className="cursor-pointer" onClick={() => handleDeleteLink(link.id)}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={cableStroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isDashed ? '6,3' : undefined}
                    opacity={isPingActiveLink ? 1 : 0.8}
                  />

                  {/* Midpoint Cable Badge */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-35"
                      y="-10"
                      width="70"
                      height="20"
                      rx="4"
                      fill={isLight ? '#ffffff' : '#111827'}
                      stroke={cableStroke}
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="4"
                      fill={isLight ? '#0f172a' : '#f8fafc'}
                      textAnchor="middle"
                      className="font-mono font-bold text-[9px]"
                    >
                      {isTrunkLink ? 'TRUNK' : 'ACCESS'}
                    </text>
                  </g>

                  {/* Animated Glowing Packet Indicator */}
                  {isPingActiveLink && (
                    <circle
                      cx={x1 + (x2 - x1) * 0.5}
                      cy={y1 + (y2 - y1) * 0.5}
                      r="6"
                      fill={pingResult?.hops[activeHopIndex]?.status === 'dropped' ? '#ef4444' : '#22c55e'}
                      className="animate-ping"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Render Nodes on Canvas */}
          {nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isPingSource = pingSourceId === node.id;
            const isPingTarget = pingTargetId === node.id;

            return (
              <div
                key={node.id}
                onMouseDown={e => handleMouseDownNode(e, node.id)}
                onClick={() => handleNodeClick(node.id)}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
                className={`absolute w-44 rounded-xl border-2 transition-shadow cursor-pointer select-none p-3 shadow-lg ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : isPingSource
                    ? 'border-amber-500 ring-2 ring-amber-500/30'
                    : isPingTarget
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : isLight
                    ? 'bg-white border-slate-300 hover:border-slate-400'
                    : 'bg-slate-900/95 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                {/* Node Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 truncate">
                    {node.type === 'pc' && <Monitor className="w-4 h-4 text-blue-400 shrink-0" />}
                    {node.type === 'server' && <Server className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {node.type === 'switch' && <Layers className="w-4 h-4 text-indigo-400 shrink-0" />}
                    {node.type === 'router' && <Radio className="w-4 h-4 text-purple-400 shrink-0" />}
                    <span className="font-bold font-mono text-xs truncate">{node.name}</span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                    {node.type}
                  </span>
                </div>

                {/* Node Details */}
                {node.type === 'pc' || node.type === 'server' ? (
                  <div className="space-y-1 text-[10px] font-mono">
                    <div className="text-slate-400">
                      IP: <span className="font-bold text-slate-200">{node.ip || '—'}</span>
                    </div>
                    {node.gateway && (
                      <div className="text-slate-400">
                        GW: <span className="text-slate-300">{node.gateway}</span>
                      </div>
                    )}
                    {/* Default Port */}
                    <div className="pt-2 flex justify-center">
                      <button
                        onClick={e => handlePortClick(e, node.id, 'eth0')}
                        className={`px-2 py-0.5 rounded text-[9px] font-mono border flex items-center gap-1 transition-colors ${
                          connectSource?.nodeId === node.id && connectSource?.portId === 'eth0'
                            ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>eth0 (RJ-45)</span>
                      </button>
                    </div>
                  </div>
                ) : node.type === 'switch' ? (
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono mb-1.5">
                      8-Port Fast/Gigabit Switch
                    </div>
                    {/* 8 Ports Matrix */}
                    <div className="grid grid-cols-4 gap-1">
                      {(node.ports || []).map(port => {
                        const isPortConnected = links.some(
                          l => (l.sourceNodeId === node.id && l.sourcePortId === port.id) ||
                               (l.targetNodeId === node.id && l.targetPortId === port.id)
                        );
                        const isPortSelected = connectSource?.nodeId === node.id && connectSource?.portId === port.id;

                        return (
                          <button
                            key={port.id}
                            onClick={e => handlePortClick(e, node.id, port.id)}
                            className={`p-1 rounded text-center text-[9px] font-mono border transition-all cursor-pointer ${
                              isPortSelected
                                ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse'
                                : isPortConnected
                                ? (port.mode === 'trunk' ? 'bg-purple-950/80 border-purple-500 text-purple-300' : 'bg-blue-950/80 border-blue-500 text-blue-300')
                                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                            title={`Port ${port.number} [${port.mode.toUpperCase()}] ${port.mode === 'access' ? 'VLAN ' + port.pvid : 'Trunk'}`}
                          >
                            <div className="font-bold">p{port.number}</div>
                            <div className="text-[7.5px] opacity-75">{port.mode === 'trunk' ? 'TRK' : `V:${port.pvid}`}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Router */
                  <div>
                    <div className="text-[10px] text-slate-400 font-mono mb-1">
                      L3 Gateway Router
                    </div>
                    <div className="space-y-0.5 text-[9px] font-mono text-purple-300">
                      {(node.interfaces || []).slice(0, 2).map(itf => (
                        <div key={itf.id} className="truncate">
                          • {itf.name} ({itf.ip})
                        </div>
                      ))}
                    </div>
                    {/* Router Port */}
                    <div className="pt-2 flex justify-center">
                      <button
                        onClick={e => handlePortClick(e, node.id, 'eth0')}
                        className={`px-2 py-0.5 rounded text-[9px] font-mono border flex items-center gap-1 transition-colors ${
                          connectSource?.nodeId === node.id && connectSource?.portId === 'eth0'
                            ? 'bg-purple-600 text-white border-purple-400 animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        <span>Gi0/0 (Trunk/SVI)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Device Inspector Drawer (Sliding from Right) */}
        {selectedNode && (
          <div className={`w-80 border-l p-4 overflow-y-auto flex flex-col shrink-0 ${
            isLight ? 'bg-white border-slate-200 shadow-xl' : 'bg-slate-900 border-slate-800 shadow-2xl'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold font-mono">Настройки устройства</h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Common Name Input */}
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Имя узла</label>
              <input
                type="text"
                value={selectedNode.name}
                onChange={e => {
                  const val = e.target.value;
                  setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, name: val } : n));
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono bg-slate-800/80 border-slate-700 text-slate-100"
              />
            </div>

            {/* PC / Server Inspector */}
            {(selectedNode.type === 'pc' || selectedNode.type === 'server') && (
              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">IP адрес</label>
                  <input
                    type="text"
                    value={selectedNode.ip || ''}
                    placeholder="192.168.1.10"
                    onChange={e => {
                      const val = e.target.value;
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, ip: val } : n));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono bg-slate-800/80 border-slate-700 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Маска подсети</label>
                  <input
                    type="text"
                    value={selectedNode.mask || '255.255.255.0'}
                    onChange={e => {
                      const val = e.target.value;
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, mask: val } : n));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono bg-slate-800/80 border-slate-700 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Шлюз по умолчанию (Gateway)</label>
                  <input
                    type="text"
                    value={selectedNode.gateway || ''}
                    placeholder="192.168.1.1"
                    onChange={e => {
                      const val = e.target.value;
                      setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, gateway: val } : n));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono bg-slate-800/80 border-slate-700 text-slate-100"
                  />
                </div>

                {/* Quick Ping Trigger */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setToolMode('ping');
                      setPingSourceId(selectedNode.id);
                      toast?.info?.(`Отправитель: ${selectedNode.name}. Кликните на второй узел для пинга.`);
                    }}
                    className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Запустить Ping с этого узла</span>
                  </button>
                </div>
              </div>
            )}

            {/* Switch Inspector (Port Configuration) */}
            {selectedNode.type === 'switch' && (
              <div className="mb-6">
                <div className="text-xs font-semibold text-slate-400 mb-2">Настройка портов коммутатора</div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {(selectedNode.ports || []).map((port, pIdx) => (
                    <div key={port.id} className="p-2.5 rounded-lg border border-slate-700/80 bg-slate-800/40 text-xs">
                      <div className="flex items-center justify-between mb-1.5 font-mono">
                        <span className="font-bold text-slate-200">Порт {port.number}</span>
                        <select
                          value={port.mode}
                          onChange={e => {
                            const newMode = e.target.value;
                            setNodes(prev => prev.map(n => {
                              if (n.id !== selectedNode.id) return n;
                              const updatedPorts = n.ports.map(p => p.id === port.id ? { ...p, mode: newMode } : p);
                              return { ...n, ports: updatedPorts };
                            }));
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-600 text-slate-200 cursor-pointer"
                        >
                          <option value="access">Access</option>
                          <option value="trunk">Trunk</option>
                        </select>
                      </div>

                      {port.mode === 'access' ? (
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-slate-400">VLAN ID:</span>
                          <input
                            type="number"
                            min="1"
                            max="4094"
                            value={port.pvid || 1}
                            onChange={e => {
                              const val = Number(e.target.value) || 1;
                              setNodes(prev => prev.map(n => {
                                if (n.id !== selectedNode.id) return n;
                                const updatedPorts = n.ports.map(p => p.id === port.id ? { ...p, pvid: val } : p);
                                return { ...n, ports: updatedPorts };
                              }));
                            }}
                            className="w-16 px-1.5 py-0.5 rounded border text-[11px] font-mono bg-slate-800 border-slate-700 text-slate-100"
                          />
                        </div>
                      ) : (
                        <div className="text-[11px] space-y-1">
                          <span className="text-slate-400">Allowed VLANs (через запятую):</span>
                          <input
                            type="text"
                            value={(port.allowedVlans || []).join(', ')}
                            placeholder="10, 20, 30"
                            onChange={e => {
                              const arr = e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
                              setNodes(prev => prev.map(n => {
                                if (n.id !== selectedNode.id) return n;
                                const updatedPorts = n.ports.map(p => p.id === port.id ? { ...p, allowedVlans: arr } : p);
                                return { ...n, ports: updatedPorts };
                              }));
                            }}
                            className="w-full px-2 py-0.5 rounded border text-[11px] font-mono bg-slate-800 border-slate-700 text-purple-300"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Router Inspector (SVI Interfaces) */}
            {selectedNode.type === 'router' && (
              <div className="mb-6">
                <div className="text-xs font-semibold text-slate-400 mb-2">Интерфейсы шлюзов (Inter-VLAN SVI)</div>
                <div className="space-y-2">
                  {(selectedNode.interfaces || []).map((itf, idx) => (
                    <div key={itf.id} className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-950/20 text-xs font-mono">
                      <div className="font-bold text-purple-300 mb-1">{itf.name} (VLAN {itf.vlanId})</div>
                      <div className="text-[11px] text-slate-400">
                        IP: <input
                          type="text"
                          value={itf.ip}
                          onChange={e => {
                            const val = e.target.value;
                            setNodes(prev => prev.map(n => {
                              if (n.id !== selectedNode.id) return n;
                              const updated = n.interfaces.map(i => i.id === itf.id ? { ...i, ip: val } : i);
                              return { ...n, interfaces: updated };
                            }));
                          }}
                          className="w-28 px-1.5 py-0.5 rounded border bg-slate-800 border-slate-700 text-slate-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delete Node Action */}
            <div className="mt-auto pt-4 border-t border-slate-800">
              <button
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="w-full py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить устройство</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Ping Hop-by-Hop Animation Tracer HUD */}
      {pingResult && (
        <div className={`p-4 border-t flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 ${
          pingResult.success
            ? (isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-100')
            : (isLight ? 'bg-red-50 border-red-200 text-red-950' : 'bg-red-950/40 border-red-800/60 text-red-100')
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${pingResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {pingResult.success ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs font-mono uppercase">
                  {pingResult.success ? 'Пакет доставлен (200 OK)' : 'Пакет отброшен (Drop)'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/20">
                  Шаг {activeHopIndex + 1} из {pingResult.hops.length}
                </span>
              </div>
              <p className="text-xs mt-0.5">
                {pingResult.hops[activeHopIndex]?.description || pingResult.summary}
              </p>
            </div>
          </div>

          {/* Hop Nav Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveHopIndex(prev => Math.max(0, prev - 1))}
              disabled={activeHopIndex === 0}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              Назад
            </button>
            <button
              onClick={() => setActiveHopIndex(prev => Math.min(pingResult.hops.length - 1, prev + 1))}
              disabled={activeHopIndex >= pingResult.hops.length - 1}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              Вперед
            </button>
            <button
              onClick={() => {
                setActiveHopIndex(0);
                setIsAnimatingPing(true);
              }}
              className="p-1.5 rounded-lg border text-xs cursor-pointer"
              title="Повторить анимацию"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lab Evaluation Modal */}
      {showEvaluationModal && activeLab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl border p-5 ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold font-mono">{activeLab.title}</h3>
              </div>
              <button
                onClick={() => setShowEvaluationModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6 text-xs">
              <div>
                <span className="font-semibold text-slate-400 block mb-1">Цель задания:</span>
                <p className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 leading-relaxed font-mono">
                  {activeLab.goal}
                </p>
              </div>

              {labEvaluation && (
                <div>
                  <span className="font-semibold text-slate-400 block mb-2">Критерии проверки:</span>
                  <div className="space-y-2">
                    {labEvaluation.checks.map((chk, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                          chk.pass
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                        }`}
                      >
                        {chk.pass ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>{chk.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className={`mt-4 p-3 rounded-xl border font-mono text-xs ${
                    labEvaluation.solved
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  }`}>
                    {labEvaluation.feedback}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowEvaluationModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Закрыть
              </button>
              <button
                onClick={handleVerifySolution}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-500/20 cursor-pointer"
              >
                Проверить снова
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
