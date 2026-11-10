import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Server,
  Cpu,
  Layers,
  Network,
  Activity,
  Sparkles,
  Maximize2,
  Minimize2,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Cable,
  Zap,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Link as LinkIcon,
  Globe,
  Radio,
  CheckCircle2,
  LayoutGrid,
  Check,
  ShieldAlert,
  Gauge,
  Compass,
  Sliders,
  Monitor,
  Laptop,
  Plus,
  User,
  Search,
  X,
  ShieldCheck,
  Award,
  Lock,
  Unlock,
  Shield,
  Info
} from 'lucide-react';
import { VlanBadge } from './VlanBadge';
import { checkVlanMismatch } from '../utils/vlanMismatch';
import { calculateSpanningTree } from '../utils/stpSimulator';
import { api, getAuthToken } from '../api';
import { useToast } from '../context/ToastContext';
import VlanWizardModal from './VlanWizardModal';

export function TopologyView({
  switches = [],
  vlans = [],
  patchPanels = [],
  ipAllocations = [],
  servers = [],
  onSelectSwitch,
  onSelectPatchPanel,
  onSelectServer,
  onOpenPortDrawer,
  onOpenPatchPortDrawer,
  onReloadData,
  onNavigateToIpam,
  theme = 'dark'
}) {
  const toast = useToast();
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragNodeInfoRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const justDraggedNodeRef = useRef(false);

  // Mode toggles
  const [topoLayer, setTopoLayer] = useState('l2'); // 'l2' (Data Link) or 'l3' (IP Routing)
  const [nodeViewMode, setNodeViewMode] = useState('ports'); // 'ports' (detailed 1U chassis with ports) or 'compact' (summary cards)
  const [showPatchPanels, setShowPatchPanels] = useState(false);
  const [showServers, setShowServers] = useState(true);
  const [showWorkstations, setShowWorkstations] = useState(true);
  const [trafficAnimation, setTrafficAnimation] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBottlenecks, setShowBottlenecks] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);

  // Add Workstation Modal State
  const [isAddWorkstationOpen, setIsAddWorkstationOpen] = useState(false);
  const [newWsHostname, setNewWsHostname] = useState('');
  const [newWsIp, setNewWsIp] = useState('');
  const [newWsMac, setNewWsMac] = useState('');
  const [newWsVlanId, setNewWsVlanId] = useState(20);
  const [newWsSwitchId, setNewWsSwitchId] = useState('');
  const [newWsPortNumber, setNewWsPortNumber] = useState('');
  const [newWsPatchPanelId, setNewWsPatchPanelId] = useState('');
  const [newWsPatchPortNumber, setNewWsPatchPortNumber] = useState('');
  const [newWsUser, setNewWsUser] = useState('');
  const [newWsLocation, setNewWsLocation] = useState('');
  const [isSubmittingWs, setIsSubmittingWs] = useState(false);

  // Filters & Tracing
  const [traceVlanId, setTraceVlanId] = useState(null);
  const [pathFindStart, setPathFindStart] = useState('');
  const [pathFindEnd, setPathFindEnd] = useState('');
  const [selectedLink, setSelectedLink] = useState(null);
  const [hoveredPortInfo, setHoveredPortInfo] = useState(null); // { switchId, portNumber, peerSwitchName, peerPortName }
  const [telemetryBySwitch, setTelemetryBySwitch] = useState({});
  const [isAutoPoll, setIsAutoPoll] = useState(true);

  // STP Simulator State
  const [stpSimulationActive, setStpSimulationActive] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [stpManualRootId, setStpManualRootId] = useState(null);
  const [stpProtocol, setStpProtocol] = useState('rstp'); // 'rstp' | 'stp'
  const [stpDisabledLinks, setStpDisabledLinks] = useState(new Set());

  // LLDP Auto-link discovery state
  const [isLldpModalOpen, setIsLldpModalOpen] = useState(false);
  const [lldpLoading, setLldpLoading] = useState(false);
  const [lldpData, setLldpData] = useState(null);
  const [lldpError, setLldpError] = useState(null);
  const [applyingLinkId, setApplyingLinkId] = useState(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  // End-to-End VLAN Wizard state
  const [isVlanWizardOpen, setIsVlanWizardOpen] = useState(false);

  const handleOpenLldpModal = async () => {
    setIsLldpModalOpen(true);
    setLldpLoading(true);
    setLldpError(null);
    try {
      const data = await api.getLldpTopology({ mode: 'auto' });
      setLldpData(data);
    } catch (err) {
      setLldpError(err.message || 'Ошибка опроса LLDP топологии');
    } finally {
      setLldpLoading(false);
    }
  };

  const handleApplySingleLldpLink = async (link) => {
    setApplyingLinkId(link.id);
    try {
      await api.applyLldpLink(link);
      toast.success('LLDP линк успешно применен');
      if (onReloadData) await onReloadData();
      const updated = await api.getLldpTopology({ mode: 'auto' });
      setLldpData(updated);
    } catch (err) {
      toast.error(`Ошибка применения линка: ${err.message}`);
    } finally {
      setApplyingLinkId(null);
    }
  };

  const handleApplyAllLldpLinks = async () => {
    if (!lldpData?.links) return;
    const newLinks = lldpData.links.filter(l => l.status === 'new_discovered');
    if (newLinks.length === 0) return;
    setIsApplyingAll(true);
    try {
      await api.applyAllLldpLinks(newLinks);
      toast.success(`Применено новых LLDP связей: ${newLinks.length}`);
      if (onReloadData) await onReloadData();
      const updated = await api.getLldpTopology({ mode: 'auto' });
      setLldpData(updated);
    } catch (err) {
      toast.error(`Ошибка пакетного связывания: ${err.message}`);
    } finally {
      setIsApplyingAll(false);
    }
  };

  // Poll telemetry periodically for all switches to drive live link flows and load metrics
  useEffect(() => {
    let isMounted = true;
    let abortController = new AbortController();

    const fetchTelemetry = async () => {
      try {
        const token = getAuthToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const results = {};
        await Promise.all(
          switches.map(async (sw) => {
            try {
              const res = await fetch(`/api/switches/${sw.id}/telemetry?community=public`, {
                headers,
                signal: abortController.signal
              });
              if (res.ok) {
                const data = await res.json();
                results[sw.id] = data;
              }
            } catch (e) {
              // Ignore aborted fetch errors
            }
          })
        );
        if (isMounted) {
          setTelemetryBySwitch(results);
        }
      } catch (e) {}
    };

    if (isAutoPoll && switches.length > 0) {
      fetchTelemetry();
      const timer = setInterval(() => {
        abortController.abort();
        abortController = new AbortController();
        fetchTelemetry();
      }, 5000);

      return () => {
        isMounted = false;
        abortController.abort();
        clearInterval(timer);
      };
    }
  }, [isAutoPoll, switches]);

  const isLight = theme === 'light';

  // Map VLAN by ID
  const vlanMap = useMemo(() => {
    const map = {};
    vlans.forEach(v => { map[v.id] = v; });
    return map;
  }, [vlans]);

  // Load saved positions or calculate default hierarchical layout
  const [positions, setPositions] = useState(() => {
    const saved = localStorage.getItem('switchbook_topology_pos');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {};
  });

  // Calculate default layout if positions not set
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;

      // Group switches by layer (core, dist, access)
      const coreSwitches = [];
      const distSwitches = [];
      const accessSwitches = [];

      switches.forEach(sw => {
        if (next[sw.id]) return;
        changed = true;

        const name = (sw.name + ' ' + (sw.location || '')).toLowerCase();
        if (name.includes('core') || name.includes('ядро') || sw.vendor === 'MikroTik') {
          coreSwitches.push(sw);
        } else if (name.includes('dist') || name.includes('распред') || sw.vendor === 'SNR') {
          distSwitches.push(sw);
        } else {
          accessSwitches.push(sw);
        }
      });

      // Place patch panels if not positioned
      patchPanels.forEach((pp, i) => {
        if (!next[pp.id]) {
          changed = true;
          next[pp.id] = {
            x: 220 + i * 460,
            y: 740
          };
        }
      });

      if (!changed) return prev;

      // Place core at top
      coreSwitches.forEach((sw, i) => {
        next[sw.id] = {
          x: 480 + (i - (coreSwitches.length - 1) / 2) * 460,
          y: 90
        };
      });

      // Place dist in middle
      distSwitches.forEach((sw, i) => {
        next[sw.id] = {
          x: 480 + (i - (distSwitches.length - 1) / 2) * 460,
          y: 330
        };
      });

      // Place access at bottom
      accessSwitches.forEach((sw, i) => {
        next[sw.id] = {
          x: 480 + (i - (accessSwitches.length - 1) / 2) * 460,
          y: 570
        };
      });

      // Place servers on the right column (Compute Cluster)
      servers.forEach((srv, i) => {
        if (!next[srv.id]) {
          changed = true;
          next[srv.id] = {
            x: 980 + (i % 2) * 420,
            y: 100 + Math.floor(i / 2) * 320
          };
        }
      });

      localStorage.setItem('switchbook_topology_pos', JSON.stringify(next));
      return next;
    });
  }, [switches, patchPanels, servers]);

  // Extract individual port-to-port physical links between switches
  const physicalLinks = useMemo(() => {
    const swMap = {};
    switches.forEach(s => { swMap[s.id] = s; });

    const linkList = [];
    const processedPairs = new Set();

    switches.forEach(swA => {
      (swA.ports || []).forEach(portA => {
        if (!portA.linkedSwitchId || !portA.linkedPortId) return;

        const swB = swMap[portA.linkedSwitchId];
        if (!swB) return;

        const portB = swB.ports?.find(p => p.id === portA.linkedPortId || p.number === portA.linkedPortId);
        if (!portB) return;

        const pairKey = [swA.id, portA.id, swB.id, portB.id].sort().join('--');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        const mismatchResult = checkVlanMismatch(portA, portB);
        const is40G = portA.speed === '40G' || portB.speed === '40G';
        const is10G = !is40G && (portA.speed === '10G' || portB.speed === '10G' || portA.type === 'sfp' || portB.type === 'sfp');
        const is100M = portA.speed === '100M' || portB.speed === '100M';
        const is1G = !is40G && !is10G && !is100M;
        const isLag = Boolean(portA.lagId && portB.lagId && portA.lagId === portB.lagId);

        const carriedVlans = new Set();
        if (portA.pvid) carriedVlans.add(portA.pvid);
        if (portB.pvid) carriedVlans.add(portB.pvid);
        (portA.taggedVlans || []).forEach(v => carriedVlans.add(v));
        (portB.taggedVlans || []).forEach(v => carriedVlans.add(v));

        // Calculate live telemetry traffic on this link
        const telemA = (telemetryBySwitch[swA.id]?.ports || []).find(p => p.number === portA.number);
        const telemB = (telemetryBySwitch[swB.id]?.ports || []).find(p => p.number === portB.number);

        const rxMbps = Math.max(telemA?.rxMbps || 0, telemB?.txMbps || 0);
        const txMbps = Math.max(telemA?.txMbps || 0, telemB?.rxMbps || 0);
        const totalMbps = Math.round((rxMbps + txMbps) * 10) / 10;
        const inErrors = (telemA?.inErrors || 0) + (telemB?.inErrors || 0);

        // Theoretical capacity in Mbps
        const capacityMbps = is40G ? 40000 : is10G ? 10000 : is100M ? 100 : 1000;
        const effectiveCapacity = isLag ? capacityMbps * 2 : capacityMbps;
        const utilizationPct = Math.min(100, Math.round((Math.max(rxMbps, txMbps) / effectiveCapacity) * 100));

        linkList.push({
          id: pairKey,
          type: 'switch-link',
          sourceSwitch: swA,
          sourcePort: portA,
          targetSwitch: swB,
          targetPort: portB,
          is40G,
          is10G,
          is1G,
          is100M,
          speedLabel: is40G ? '40G' : is10G ? '10G' : is100M ? '100M' : '1G',
          isLag,
          lagId: portA.lagId,
          lagName: portA.lagName || portB.lagName || `LAG ${portA.lagId}`,
          hasMismatch: mismatchResult?.hasMismatch,
          mismatchIssues: mismatchResult?.issues || [],
          carriedVlans: Array.from(carriedVlans).sort((a, b) => a - b),
          rxMbps,
          txMbps,
          totalMbps,
          inErrors,
          capacityMbps: effectiveCapacity,
          utilizationPct
        });
      });
    });

    return linkList;
  }, [switches, telemetryBySwitch]);

  // STP Spanning Tree Topology Calculation
  const stpCalculation = useMemo(() => {
    if (!stpSimulationActive) return null;

    const stpLinks = physicalLinks.map(lnk => {
      const swAId = String(lnk.sourceSwitch.id);
      const swBId = String(lnk.targetSwitch.id);
      const pANum = lnk.sourcePort.number || 0;
      const pBNum = lnk.targetPort.number || 0;
      const key = swAId < swBId ? `${swAId}:${pANum}-${swBId}:${pBNum}` : `${swBId}:${pBNum}-${swAId}:${pANum}`;
      return {
        id: lnk.id,
        stpKey: key,
        switchAId: swAId,
        switchBId: swBId,
        switchAName: lnk.sourceSwitch.name,
        switchBName: lnk.targetSwitch.name,
        portA: lnk.sourcePort,
        portB: lnk.targetPort,
        cost: lnk.is40G ? 1 : lnk.is10G ? 2 : lnk.is100M ? 19 : 4
      };
    });

    return calculateSpanningTree({
      switches,
      links: stpLinks,
      manualRootId: stpManualRootId,
      disabledLinkIds: stpDisabledLinks,
      protocol: stpProtocol
    });
  }, [stpSimulationActive, switches, physicalLinks, stpManualRootId, stpDisabledLinks, stpProtocol]);

  // Bottleneck & Single Point of Failure (SPOF) Analysis
  const bottleneckAnalysis = useMemo(() => {
    const spofNodes = []; // Switches with only 1 uplink
    const bandwidthBottlenecks = []; // Links carrying >5 VLANs on 100M/1G without LAG
    const isolatedSwitches = [];

    // Adjacency count
    const adjCount = {};
    switches.forEach(sw => { adjCount[sw.id] = 0; });

    physicalLinks.forEach(lnk => {
      adjCount[lnk.sourceSwitch.id] = (adjCount[lnk.sourceSwitch.id] || 0) + 1;
      adjCount[lnk.targetSwitch.id] = (adjCount[lnk.targetSwitch.id] || 0) + 1;

      // Bandwidth bottleneck check: trunk carrying > 4 VLANs on 100M or 1G without LAG
      if (lnk.carriedVlans.length >= 4 && (lnk.is100M || (!lnk.is10G && !lnk.is40G && !lnk.isLag))) {
        bandwidthBottlenecks.push({
          linkId: lnk.id,
          sourceName: lnk.sourceSwitch.name,
          targetName: lnk.targetSwitch.name,
          speed: lnk.speedLabel,
          vlanCount: lnk.carriedVlans.length,
          reason: `Канал ${lnk.speedLabel} обслуживает ${lnk.carriedVlans.length} VLAN без агрегации (LACP). Риск перегрузки магистрали.`
        });
      }
    });

    switches.forEach(sw => {
      const links = adjCount[sw.id] || 0;
      if (links === 0 && switches.length > 1) {
        isolatedSwitches.push({
          switchId: sw.id,
          name: sw.name,
          reason: 'Коммутатор не имеет активных магистральных линков к сети.'
        });
      } else if (links === 1 && switches.length > 2) {
        spofNodes.push({
          switchId: sw.id,
          name: sw.name,
          reason: 'Единственная точка отказа (SPOF): коммутатор имеет только 1 аплинк без резервирования (RSTP/LAG).'
        });
      }
    });

    return {
      spofNodes,
      bandwidthBottlenecks,
      isolatedSwitches,
      totalIssues: spofNodes.length + bandwidthBottlenecks.length + isolatedSwitches.length
    };
  }, [switches, physicalLinks]);

  // Aggregated links (for compact mode)
  const aggregatedLinks = useMemo(() => {
    const agg = [];
    const lagMap = {};

    physicalLinks.forEach(lnk => {
      if (lnk.isLag) {
        const swPair = [lnk.sourceSwitch.id, lnk.targetSwitch.id].sort().join('::') + `::lag${lnk.lagId}`;
        if (!lagMap[swPair]) {
          lagMap[swPair] = {
            ...lnk,
            memberLinks: [lnk],
            memberCount: 1
          };
          agg.push(lagMap[swPair]);
        } else {
          lagMap[swPair].memberLinks.push(lnk);
          lagMap[swPair].memberCount++;
          lnk.carriedVlans.forEach(v => {
            if (!lagMap[swPair].carriedVlans.includes(v)) {
              lagMap[swPair].carriedVlans.push(v);
            }
          });
          lagMap[swPair].carriedVlans.sort((a, b) => a - b);
          if (lnk.hasMismatch) lagMap[swPair].hasMismatch = true;
        }
      } else {
        agg.push(lnk);
      }
    });

    return agg;
  }, [physicalLinks]);

  // Patch Panel Cross-Connects to Switches (for L2 when showPatchPanels is ON)
  const patchPanelLinks = useMemo(() => {
    if (!showPatchPanels) return [];
    const swMap = {};
    switches.forEach(s => { swMap[s.id] = s; });

    const pLinks = [];
    const seen = new Set();

    patchPanels.forEach(pp => {
      (pp.ports || []).forEach(ppPort => {
        if (!ppPort.connectedSwitchId) return;
        const sw = swMap[ppPort.connectedSwitchId];
        if (!sw) return;

        const swPort = (sw.ports || []).find(p => p.id === ppPort.connectedSwitchPortId || p.number === ppPort.connectedSwitchPortId);
        if (!swPort) return;

        const linkKey = `${pp.id}-${ppPort.id}-${sw.id}-${swPort.id}`;
        if (seen.has(linkKey)) return;
        seen.add(linkKey);

        pLinks.push({
          id: linkKey,
          type: 'patch-link',
          patchPanel: pp,
          patchPort: ppPort,
          targetSwitch: sw,
          targetPort: swPort,
          carriedVlans: swPort.pvid ? [swPort.pvid] : []
        });
      });
    });

    return pLinks;
  }, [patchPanels, switches, showPatchPanels]);

  // Server Uplinks to Switches (for compute nodes & hypervisors)
  const serverLinks = useMemo(() => {
    if (!showServers) return [];
    const swMap = {};
    switches.forEach(s => { swMap[s.id] = s; });

    const sLinks = [];
    const seen = new Set();

    servers.forEach(srv => {
      (srv.nics || []).forEach(nic => {
        if (!nic.connectedSwitchId) return;
        const sw = swMap[nic.connectedSwitchId];
        if (!sw) return;

        const swPort = (sw.ports || []).find(p => p.id === nic.connectedPortId || String(p.number) === String(nic.connectedPortId));

        const linkKey = `srv-${srv.id}-${nic.id || nic.name}-${sw.id}-${nic.connectedPortId}`;
        if (seen.has(linkKey)) return;
        seen.add(linkKey);

        const is10G = nic.type === 'sfp' || nic.speed?.includes('10G');
        const isBond = Boolean(nic.role?.includes('bond') || nic.role?.includes('lag') || nic.role?.includes('slave'));

        sLinks.push({
          id: linkKey,
          type: 'server-link',
          server: srv,
          nic: nic,
          targetSwitch: sw,
          targetPort: swPort || { id: nic.connectedPortId, name: nic.connectedPortId, number: nic.connectedPortId },
          is10G,
          isBond,
          speedLabel: nic.speed || (is10G ? '10G SFP+' : '1G'),
          role: nic.role || 'trunk',
          carriedVlans: nic.pvid ? [nic.pvid] : []
        });
      });
    });

    return sLinks;
  }, [servers, switches, showServers]);

  // Extract workstations & client PCs from ipAllocations and switch ports
  const workstationData = useMemo(() => {
    const list = [];
    const seenIds = new Set();
    const seenHostnames = new Set();

    // 1. From ipAllocations (type: workstation, pc, laptop, printer, phone, etc., or hostname/desc contains ПК/АРМ/PC)
    (ipAllocations || []).forEach(alloc => {
      const type = (alloc.type || '').toLowerCase();
      const hostname = alloc.hostname || '';
      const desc = alloc.description || '';
      const conn = alloc.connectedTo || '';

      const isClientDevice = type === 'workstation' || type === 'printer' || type === 'phone' ||
        hostname.toLowerCase().startsWith('pc-') || hostname.toLowerCase().startsWith('arm-') ||
        hostname.toLowerCase().includes('ноутбук') || desc.toLowerCase().includes('пк') ||
        desc.toLowerCase().includes('рабочее место') || desc.toLowerCase().includes('компьютер') ||
        desc.toLowerCase().includes('бухгалтер') || desc.toLowerCase().includes('директор') ||
        desc.toLowerCase().includes('кадров') || desc.toLowerCase().includes('администратор');

      if (isClientDevice) {
        const id = `ws-ip-${alloc.id}`;
        seenIds.add(id);
        if (hostname) seenHostnames.add(hostname.toLowerCase());

        list.push({
          id,
          rawId: alloc.id,
          sourceType: 'ipam',
          name: hostname || alloc.ip,
          hostname: hostname,
          ip: alloc.ip,
          mac: alloc.mac || '',
          vlanId: alloc.vlanId || 20,
          location: alloc.location || '',
          connectedTo: conn,
          description: desc,
          type: type || 'workstation',
          status: alloc.status || 'active'
        });
      }
    });

    // 2. From switches ports where connectedTo contains PC/АРМ/Компьютер and not already captured
    switches.forEach(sw => {
      (sw.ports || []).forEach(p => {
        if (!p.connectedTo) return;
        const cLower = p.connectedTo.toLowerCase();
        const isPcPort = cLower.includes('пк') || cLower.includes('компьютер') ||
          cLower.includes('арм') || cLower.includes('рабочее место') || cLower.includes('ноутбук') ||
          cLower.startsWith('pc-') || cLower.startsWith('workstation');

        if (isPcPort && !seenHostnames.has(cLower)) {
          const id = `ws-sw-${sw.id}-p${p.number}`;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            list.push({
              id,
              rawId: id,
              sourceType: 'switch-port',
              name: p.connectedTo,
              hostname: p.connectedTo,
              ip: '',
              mac: '',
              vlanId: p.pvid || 20,
              location: sw.location || '',
              connectedTo: `${sw.name}:${p.name || p.number}`,
              targetSwitchId: sw.id,
              targetPortNumber: p.number,
              description: `Подключен к ${sw.name} (порт ${p.number})`,
              type: 'workstation',
              status: p.enabled ? 'active' : 'disabled'
            });
          }
        }
      });
    });

    return list;
  }, [ipAllocations, switches]);

  // Place workstations automatically on the canvas layout
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev };
      let changed = false;

      workstationData.forEach((ws, i) => {
        if (!next[ws.id]) {
          changed = true;
          // Place workstations in bottom grid under switches (y: 840..)
          const col = i % 4;
          const row = Math.floor(i / 4);
          next[ws.id] = {
            x: 120 + col * 320,
            y: 860 + row * 190
          };
        }
      });

      if (!changed) return prev;
      localStorage.setItem('switchbook_topology_pos', JSON.stringify(next));
      return next;
    });
  }, [workstationData]);

  // Compute physical links between Workstations and Switches / Patch Panels
  const workstationLinks = useMemo(() => {
    if (!showWorkstations) return [];

    const swMap = {};
    switches.forEach(s => {
      swMap[s.id] = s;
      swMap[s.name?.toLowerCase()] = s;
    });

    const ppMap = {};
    patchPanels.forEach(p => {
      ppMap[p.id] = p;
      ppMap[p.name?.toLowerCase()] = p;
    });

    const links = [];
    const seen = new Set();

    workstationData.forEach(ws => {
      let targetSwitch = null;
      let targetPort = null;
      let targetPatchPanel = null;
      let targetPatchPort = null;
      let linkLabel = '';

      // Direct switch/port if from switch-port
      if (ws.targetSwitchId && ws.targetPortNumber) {
        targetSwitch = swMap[ws.targetSwitchId];
        if (targetSwitch) {
          targetPort = (targetSwitch.ports || []).find(p => p.number === ws.targetPortNumber || p.id === ws.targetPortNumber);
        }
      }

      // Or parse connectedTo string (e.g. "sw-dist-snr:p17", "sw-core-mikrotik (ether2)", "PP-01:П1 → Каб. 201")
      if ((!targetSwitch && !targetPatchPanel) && ws.connectedTo) {
        const conn = ws.connectedTo;

        // Check if refers to a Patch Panel: "PP-01:П1" or "ПП-1:3"
        const ppMatch = conn.match(/(PP[-_0-9]+|ПП[-_0-9]+|Панель\s*\d+)[:\s]+[ПpP]?(\d+)/i);
        if (ppMatch) {
          const ppNamePrefix = ppMatch[1].toLowerCase().replace(/[-_]/g, '');
          const pNum = parseInt(ppMatch[2], 10);
          const foundPP = patchPanels.find(pp => {
            const clean = pp.name.toLowerCase().replace(/[-_]/g, '');
            return clean.includes(ppNamePrefix) || ppNamePrefix.includes(clean);
          }) || patchPanels[0];

          if (foundPP) {
            targetPatchPanel = foundPP;
            targetPatchPort = (foundPP.ports || []).find(p => p.number === pNum) || { number: pNum, id: `pp-p${pNum}` };
            linkLabel = `${foundPP.name}: порт ${pNum}`;
          }
        }

        // Check if refers directly to a switch: "sw-dist-snr:p17" or "sw-core-mikrotik (ether2)"
        if (!targetPatchPanel) {
          for (const sw of switches) {
            const swNameLower = sw.name.toLowerCase();
            if (conn.toLowerCase().includes(swNameLower) || conn.toLowerCase().includes(sw.id.toLowerCase())) {
              targetSwitch = sw;
              // Extract port
              const portMatch = conn.match(/(?:ether|порт|port|p|eth)\s*(\d+)/i) || conn.match(/:p?(\d+)/i);
              if (portMatch) {
                const pNum = parseInt(portMatch[1], 10);
                targetPort = (sw.ports || []).find(p => p.number === pNum) || { number: pNum, id: `p${pNum}`, name: `ether${pNum}` };
              } else {
                targetPort = (sw.ports || [])[0];
              }
              linkLabel = `${sw.name}:${targetPort?.name || targetPort?.number || 1}`;
              break;
            }
          }
        }
      }

      // If no explicit connection found, associate workstation with first access switch or default port by VLAN
      if (!targetSwitch && !targetPatchPanel) {
        // Try to match a switch that has a port with this VLAN
        for (const sw of switches) {
          const matchingPort = (sw.ports || []).find(p => p.pvid === ws.vlanId && p.mode === 'access');
          if (matchingPort) {
            targetSwitch = sw;
            targetPort = matchingPort;
            linkLabel = `${sw.name}:${matchingPort.name || matchingPort.number}`;
            break;
          }
        }
        if (!targetSwitch) {
          targetSwitch = switches[switches.length - 1] || switches[0];
          targetPort = targetSwitch?.ports?.[0];
          linkLabel = `${targetSwitch?.name}:${targetPort?.name || 1}`;
        }
      }

      if (targetSwitch || targetPatchPanel) {
        const linkKey = `link-ws-${ws.id}-${targetSwitch?.id || targetPatchPanel?.id}`;
        if (!seen.has(linkKey)) {
          seen.add(linkKey);
          links.push({
            id: linkKey,
            workstation: ws,
            targetSwitch,
            targetPort,
            targetPatchPanel,
            targetPatchPort,
            linkLabel: linkLabel || ws.connectedTo || 'Подключение',
            vlanId: ws.vlanId
          });
        }
      }
    });

    return links;
  }, [workstationData, switches, patchPanels, showWorkstations]);

  // Handler to save new workstation
  const handleSaveNewWorkstation = async (e) => {
    e.preventDefault();
    if (!newWsHostname.trim() && !newWsIp.trim()) {
      toast.warning('Укажите имя компьютера или IP-адрес');
      return;
    }

    try {
      setIsSubmittingWs(true);

      // Construct connectedTo string
      let connString = '';
      if (newWsSwitchId && newWsPortNumber) {
        const targetSw = switches.find(s => s.id === newWsSwitchId);
        connString = `${targetSw?.name || newWsSwitchId}:${newWsPortNumber}`;
      } else if (newWsPatchPanelId && newWsPatchPortNumber) {
        const targetPP = patchPanels.find(p => p.id === newWsPatchPanelId);
        connString = `${targetPP?.name || newWsPatchPanelId}:П${newWsPatchPortNumber}`;
      }

      const desc = [
        newWsUser ? `Пользователь: ${newWsUser}` : '',
        newWsLocation ? `Локация: ${newWsLocation}` : ''
      ].filter(Boolean).join(' • ');

      const payload = {
        ip: newWsIp.trim() || '192.168.20.50',
        vlanId: parseInt(newWsVlanId, 10) || 20,
        hostname: newWsHostname.trim(),
        mac: newWsMac.trim(),
        type: 'workstation',
        status: 'active',
        location: newWsLocation.trim(),
        connectedTo: connString,
        description: desc || 'Рабочая станция'
      };

      const res = await fetch('/api/ipam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(`Рабочая станция «${payload.hostname || payload.ip}» добавлена`);
        setIsAddWorkstationOpen(false);
        setNewWsHostname('');
        setNewWsIp('');
        setNewWsMac('');
        setNewWsUser('');
        setNewWsLocation('');
        if (onReloadData) {
          await onReloadData();
        }
      } else {
        const err = await res.json();
        toast.error(`Ошибка создания ПК: ${err.error || 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      toast.error(`Ошибка сети: ${err.message}`);
    } finally {
      setIsSubmittingWs(false);
    }
  };

  // Path Finding BFS
  const tracedPathLinkIds = useMemo(() => {
    if (!pathFindStart || !pathFindEnd || pathFindStart === pathFindEnd) return new Set();

    const adj = {};
    switches.forEach(sw => { adj[sw.id] = []; });

    physicalLinks.forEach(lnk => {
      adj[lnk.sourceSwitch.id]?.push({ neighborId: lnk.targetSwitch.id, linkId: lnk.id });
      adj[lnk.targetSwitch.id]?.push({ neighborId: lnk.sourceSwitch.id, linkId: lnk.id });
    });

    const queue = [[pathFindStart, []]];
    const visited = new Set([pathFindStart]);

    while (queue.length > 0) {
      const [current, pathLinks] = queue.shift();
      if (current === pathFindEnd) {
        return new Set(pathLinks);
      }

      for (const edge of (adj[current] || [])) {
        if (!visited.has(edge.neighborId)) {
          visited.add(edge.neighborId);
          queue.push([edge.neighborId, [...pathLinks, edge.linkId]]);
        }
      }
    }

    return new Set();
  }, [pathFindStart, pathFindEnd, switches, physicalLinks]);

  // L3 Subnets Stats (for L3 layer view)
  const l3Subnets = useMemo(() => {
    return vlans.filter(v => v.subnet).map(v => {
      const hostsInVlan = ipAllocations.filter(a => a.vlanId === v.id);
      return {
        vlan: v,
        hostCount: hostsInVlan.length,
        hosts: hostsInVlan
      };
    });
  }, [vlans, ipAllocations]);

  // Core Switch
  const coreSwitch = useMemo(() => {
    return switches.find(s =>
      s.name.toLowerCase().includes('core') ||
      s.vendor === 'MikroTik'
    ) || switches[0];
  }, [switches]);

  // Helper to calculate exact port coordinate on canvas
  const getPortCoordinate = (deviceId, portNumber, isPatchPanel = false) => {
    const nodePos = positions[deviceId] || { x: 300, y: 300 };

    if (nodeViewMode === 'compact') {
      // In compact mode, line connects to center of card
      return {
        x: nodePos.x + 130,
        y: nodePos.y + 60
      };
    }

    if (isPatchPanel) {
      // Patch Panel 24 ports geometry (width 420px, height 120px)
      // 4 blocks of 6 ports
      const pNum = Number(portNumber) || 1;
      const blockIdx = Math.floor((pNum - 1) / 6);
      const portInBlock = (pNum - 1) % 6;
      const xOffset = 26 + blockIdx * 92 + portInBlock * 14 + 7;
      const yOffset = 76;
      return {
        x: nodePos.x + xOffset,
        y: nodePos.y + yOffset
      };
    } else {
      // Switch 24+ ports geometry (width 420px, height 142px)
      const pNum = Number(portNumber) || 1;
      if (pNum <= 24) {
        const col = Math.floor((pNum - 1) / 2); // 0 to 11
        const isOdd = pNum % 2 === 1; // Top row = odd, Bottom row = even
        const colSpacing = 23;
        const blockGap = col >= 6 ? 10 : 0;
        const xOffset = 22 + col * colSpacing + blockGap + 10;
        const yOffset = isOdd ? 72 : 98;
        return {
          x: nodePos.x + xOffset,
          y: nodePos.y + yOffset
        };
      } else {
        // SFP+ Ports 25..28
        const sfpIdx = pNum - 25;
        const sfpCol = Math.floor(sfpIdx / 2); // 0 or 1
        const sfpRow = sfpIdx % 2; // 0 (top) or 1 (bottom)
        const xOffset = 330 + sfpCol * 24 + 10;
        const yOffset = sfpRow === 0 ? 72 : 98;
        return {
          x: nodePos.x + xOffset,
          y: nodePos.y + yOffset
        };
      }
    }
  };

  // Mouse handlers for dragging nodes & canvas panning
  const handleMouseDownNode = (e, nodeId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = positions[nodeId] || { x: 400, y: 300 };
    dragNodeInfoRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      hasMoved: false
    };
    setDraggingNodeId(nodeId);
  };

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

  useEffect(() => {
    const onWindowMouseMove = (e) => {
      const drag = dragNodeInfoRef.current;
      if (drag && drag.nodeId) {
        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;
        if (Math.hypot(dx, dy) > 4) {
          drag.hasMoved = true;
        }

        const newX = Math.round(drag.origX + dx);
        const newY = Math.round(drag.origY + dy);

        setPositions(prev => ({
          ...prev,
          [drag.nodeId]: { x: newX, y: newY }
        }));
      } else if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        });
      }
    };

    const onWindowMouseUp = () => {
      const drag = dragNodeInfoRef.current;
      if (drag && drag.nodeId) {
        if (drag.hasMoved) {
          justDraggedNodeRef.current = true;
          setTimeout(() => {
            justDraggedNodeRef.current = false;
          }, 80);

          setPositions(latestPositions => {
            try {
              localStorage.setItem('switchbook_topology_pos', JSON.stringify(latestPositions));
            } catch (err) {}
            return latestPositions;
          });
        }
        dragNodeInfoRef.current = null;
        setDraggingNodeId(null);
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [zoom]);

  const handleResetLayout = () => {
    localStorage.removeItem('switchbook_topology_pos');
    setPositions({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPathFindStart('');
    setPathFindEnd('');
  };

  // Export Topology to SVG file
  const handleExportSvg = () => {
    if (!containerRef.current) return;
    const svgElem = containerRef.current.querySelector('svg');
    if (!svgElem) return;

    const serializer = new XMLSerializer();
    const svgContent = serializer.serializeToString(svgElem);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `switchbook-topology-${new Date().toISOString().slice(0, 10)}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Active links list based on nodeViewMode
  const activeLinks = nodeViewMode === 'ports' ? physicalLinks : aggregatedLinks;

  return (
    <div
      className={`border rounded-2xl shadow-xl transition-all flex flex-col ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none h-screen w-screen p-4'
          : 'h-[calc(100vh-5.5rem)] p-3 sm:p-4'
      } ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/95 border-slate-800 text-slate-100'
      }`}
    >
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-white">
                Интерактивная топология сети
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {nodeViewMode === 'ports' ? 'Порт-в-Порт (1U)' : 'Обзор'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {nodeViewMode === 'ports'
                ? 'Прямая трассировка кабелей между физическими портами коммутаторов и патч-панелей'
                : `${switches.length} коммутаторов • ${physicalLinks.length} линков`}
            </p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap overflow-x-auto max-w-full pb-1 scrollbar-none">
          {/* L2 / L3 Layer Toggle */}
          <div className={`h-9 p-0.5 rounded-xl border flex items-center shrink-0 ${
            isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => setTopoLayer('l2')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                topoLayer === 'l2'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>L2 Коммутация</span>
            </button>
            <button
              onClick={() => setTopoLayer('l3')}
              className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                topoLayer === 'l3'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>L3 Маршрутизация</span>
            </button>
          </div>

          {/* Node Display Mode Toggle: Compact vs Ports 1U */}
          {topoLayer === 'l2' && (
            <div className={`h-9 p-0.5 rounded-xl border flex items-center shrink-0 ${
              isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                onClick={() => setNodeViewMode('ports')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                  nodeViewMode === 'ports'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Отобразить лицевую панель с портами и трассировку от порта к порту"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Панели портов 1U</span>
              </button>
              <button
                onClick={() => setNodeViewMode('compact')}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                  nodeViewMode === 'compact'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Компактный блочный вид карточек"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Компактно</span>
              </button>
            </div>
          )}

          {/* Toggle Patch Panels in L2 */}
          {topoLayer === 'l2' && (
            <button
              onClick={() => setShowPatchPanels(!showPatchPanels)}
              className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                showPatchPanels
                  ? 'bg-purple-600 text-white border-purple-500'
                  : isLight
                  ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Показать патч-панели и кросс-коннекты розеток на схеме"
            >
              <Cable className="w-3.5 h-3.5" />
              <span>Патч-панели</span>
            </button>
          )}

          {/* Toggle Servers & VMs */}
          <button
            onClick={() => setShowServers(!showServers)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              showServers
                ? 'bg-indigo-600 text-white border-indigo-500'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Отобразить серверные узлы (Proxmox, ESXi, NAS) и виртуальные машины на графе"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Серверы & ВМ</span>
            {servers.length > 0 && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                showServers ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {servers.length}
              </span>
            )}
          </button>

          {/* Toggle Workstations / PCs */}
          <button
            onClick={() => setShowWorkstations(!showWorkstations)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              showWorkstations
                ? 'bg-cyan-600 text-white border-cyan-500 shadow-xs'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Отобразить рабочие станции (ПК сотрудников, АРМ, ноутбуки) на графе сети"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Компьютеры / ПК</span>
            {workstationData.length > 0 && (
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                showWorkstations ? 'bg-cyan-700 text-cyan-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}>
                {workstationData.length}
              </span>
            )}
          </button>

          {/* Add Workstation Quick Button */}
          <button
            onClick={() => {
              setNewWsSwitchId(switches[0]?.id || '');
              setNewWsPortNumber('1');
              setNewWsVlanId(20);
              setIsAddWorkstationOpen(true);
            }}
            className={`h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-cyan-50 border-cyan-300 text-cyan-700 hover:bg-cyan-100'
                : 'bg-cyan-950/40 border-cyan-800 text-cyan-300 hover:bg-cyan-900/50'
            }`}
            title="Быстро добавить компьютер/рабочую станцию на схему"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Добавить ПК</span>
          </button>

          {/* Traffic Animation Toggle */}
          <button
            onClick={() => setTrafficAnimation(!trafficAnimation)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              trafficAnimation
                ? 'bg-emerald-600 text-white border-emerald-500'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Включить/выключить анимацию световых импульсов трафика"
          >
            <Activity className={`w-3.5 h-3.5 ${trafficAnimation ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Трафик</span>
          </button>

          {/* LLDP / CDP Auto-Link Discovery Button */}
          <button
            onClick={handleOpenLldpModal}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                : 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border-purple-500/30'
            }`}
            title="Автопоиск связей между свитчами по протоколам LLDP / CDP"
          >
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span>LLDP Автолинк</span>
          </button>

          {/* End-to-End VLAN Wizard Button */}
          <button
            onClick={() => setIsVlanWizardOpen(true)}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              isLight
                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border-blue-500/30'
            }`}
            title="Сквозной проброс VLAN по цепочке коммутаторов (End-to-End VLAN Wizard)"
          >
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>Сквозной VLAN</span>
          </button>

          {/* STP / Loop Simulator Toggle */}
          <button
            onClick={() => setStpSimulationActive(!stpSimulationActive)}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              stpSimulationActive
                ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30 ring-2 ring-amber-400/50'
                : isLight
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300'
                : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/30'
            }`}
            title="Симулятор протокола Spanning Tree (RSTP / 802.1w), блокировки петель и аварийного пересчёта линков"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>STP Симулятор</span>
            {stpCalculation && stpCalculation.blockedLinksCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                {stpCalculation.blockedLinksCount} BLK
              </span>
            )}
          </button>

          {/* Bottleneck & SPOF Analysis Button */}
          <button
            onClick={() => setShowBottlenecks(!showBottlenecks)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              showBottlenecks
                ? 'bg-rose-600 text-white border-rose-500 shadow-xs'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Анализ узких мест (Bottlenecks) и единых точек отказа (SPOF)"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Узкие места</span>
            {bottleneckAnalysis.totalIssues > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white">
                {bottleneckAnalysis.totalIssues}
              </span>
            )}
          </button>

          {/* Minimap Toggle */}
          <button
            onClick={() => setShowMinimap(!showMinimap)}
            className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
              showMinimap
                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                : isLight
                ? 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
            title="Показать или скрыть миникарту топологии"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Миникарта</span>
          </button>

          {/* VLAN Filter Select */}
          <div className={`h-9 flex items-center gap-1 border rounded-xl px-2.5 text-xs shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-800'
          }`}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <select
              value={traceVlanId === null ? '' : traceVlanId}
              onChange={(e) => setTraceVlanId(e.target.value === '' ? null : Number(e.target.value))}
              className="bg-transparent text-slate-900 dark:text-white font-mono text-xs focus:outline-hidden cursor-pointer"
            >
              <option value="" className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-300'}>
                -- Все VLAN --
              </option>
              {vlans.map(v => (
                <option key={v.id} value={v.id} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                  VLAN {v.id} ({v.name})
                </option>
              ))}
            </select>
            {traceVlanId !== null && (
              <button
                onClick={() => setTraceVlanId(null)}
                className="text-slate-400 hover:text-slate-200 text-xs ml-0.5 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Zoom & Reset */}
          <div className={`h-9 flex items-center border rounded-xl overflow-hidden shrink-0 ${
            isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-800 bg-slate-950'
          }`}>
            <button
              onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Уменьшить"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-500 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.0, z + 0.15))}
              className="w-7 h-9 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              title="Увеличить"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Reset button */}
          <button
            onClick={handleResetLayout}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Сбросить расположение узлов"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* SVG Export */}
          <button
            onClick={handleExportSvg}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title="Экспортировать схему в векторный SVG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              isLight ? 'border-slate-300 text-slate-600 hover:bg-slate-100' : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Path Finding Sub-bar */}
      {topoLayer === 'l2' && (
        <div className={`flex items-center gap-2 py-2 px-3 border-b text-xs shrink-0 overflow-x-auto ${
          isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/40 border-slate-800'
        }`}>
          <div className="flex items-center gap-1.5 text-slate-500 font-semibold shrink-0">
            <Radio className="w-3.5 h-3.5 text-blue-500" />
            <span>Трассировка пути:</span>
          </div>

          <select
            value={pathFindStart}
            onChange={e => setPathFindStart(e.target.value)}
            className={`px-2 py-1 rounded-md border text-xs font-mono outline-none cursor-pointer ${
              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <option value="">-- Откуда (Свитч А) --</option>
            {switches.map(sw => (
              <option key={sw.id} value={sw.id}>{sw.name} ({sw.model})</option>
            ))}
          </select>

          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

          <select
            value={pathFindEnd}
            onChange={e => setPathFindEnd(e.target.value)}
            className={`px-2 py-1 rounded-md border text-xs font-mono outline-none cursor-pointer ${
              isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <option value="">-- Куда (Свитч Б) --</option>
            {switches.map(sw => (
              <option key={sw.id} value={sw.id}>{sw.name} ({sw.model})</option>
            ))}
          </select>

          {tracedPathLinkIds.size > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/30 font-mono text-[11px] shrink-0 font-bold">
              <CheckCircle2 className="w-3 h-3" />
              <span>Путь найден: {tracedPathLinkIds.size} хоп(а)</span>
            </div>
          )}

          {(pathFindStart || pathFindEnd) && (
            <button
              onClick={() => { setPathFindStart(''); setPathFindEnd(''); }}
              className="text-slate-400 hover:text-slate-200 text-xs ml-1 cursor-pointer shrink-0"
            >
              Сбросить путь
            </button>
          )}
        </div>
      )}

      {/* STP Simulation Interactive Control Sub-bar */}
      {stpSimulationActive && (
        <div className={`flex flex-wrap items-center justify-between gap-3 py-2 px-3 border-b text-xs shrink-0 ${
          isLight ? 'bg-amber-50/90 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-bold flex items-center gap-1.5 text-amber-500">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>STP Топология:</span>
            </span>

            {/* Root Bridge Selector */}
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-[11px] text-slate-400">Root Bridge:</span>
              <select
                value={stpManualRootId || ''}
                onChange={(e) => setStpManualRootId(e.target.value || null)}
                className={`h-7 px-2 rounded-md border text-[11px] font-mono outline-none cursor-pointer ${
                  isLight ? 'bg-white border-amber-300 text-slate-800' : 'bg-slate-900 border-amber-500/40 text-amber-300'
                }`}
              >
                <option value="">Автовыбор (Lowest Priority / MAC)</option>
                {switches.map(sw => (
                  <option key={sw.id} value={sw.id}>
                    {sw.name} ({sw.ip || 'no ip'})
                  </option>
                ))}
              </select>
            </div>

            {/* Protocol */}
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="text-slate-400">Протокол:</span>
              <div className="flex rounded-md border border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setStpProtocol('rstp')}
                  className={`px-2 py-0.5 ${stpProtocol === 'rstp' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  802.1w RSTP
                </button>
                <button
                  type="button"
                  onClick={() => setStpProtocol('stp')}
                  className={`px-2 py-0.5 ${stpProtocol === 'stp' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-900 text-slate-400'}`}
                >
                  802.1D STP
                </button>
              </div>
            </div>

            {/* Convergence & Stats */}
            {stpCalculation && (
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  FWD: {stpCalculation.activeLinksCount}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  BLK: {stpCalculation.blockedLinksCount}
                </span>
                <span className="text-slate-400">
                  Сходимость: <strong className="text-white">{stpCalculation.convergenceTime}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {stpDisabledLinks.size > 0 && (
              <button
                type="button"
                onClick={() => setStpDisabledLinks(new Set())}
                className="h-7 px-2.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Восстановить обрывы ({stpDisabledLinks.size})</span>
              </button>
            )}
            <span className="text-[11px] text-amber-400/90 font-medium">
              💡 Кликните по зелёному линку, чтобы смоделировать обрыв
            </span>
          </div>
        </div>
      )}

      {/* SVG Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownCanvas}
        className={`flex-1 relative overflow-hidden rounded-xl border select-none cursor-grab active:cursor-grabbing transition-colors ${
          isLight
            ? 'bg-slate-50 border-slate-200'
            : 'bg-radial from-slate-900 via-slate-950 to-black border-slate-800'
        }`}
        style={{
          backgroundImage: isLight
            ? 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)'
            : 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      >
        <svg
          className="w-full h-full absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <defs>
            <filter id="glow-healthy" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-error" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-path" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <style>
              {`
                @keyframes pulseDash {
                  from { stroke-dashoffset: 48; }
                  to { stroke-dashoffset: 0; }
                }
                .flow-animation {
                  animation: pulseDash 1.4s linear infinite;
                }
                .flow-fast {
                  animation: pulseDash 0.8s linear infinite;
                }
              `}
            </style>
          </defs>

          {/* --- L2 MODE: SWITCH-TO-SWITCH LINKS (PORT-TO-PORT OR COMPACT) --- */}
          {topoLayer === 'l2' && activeLinks.map((link) => {
            // Calculate exact start & end coordinates
            const pCoordA = getPortCoordinate(link.sourceSwitch.id, link.sourcePort.number, false);
            const pCoordB = getPortCoordinate(link.targetSwitch.id, link.targetPort.number, false);

            const x1 = pCoordA.x;
            const y1 = pCoordA.y;
            const x2 = pCoordB.x;
            const y2 = pCoordB.y;

            // Curved drape cable path
            const dy = y2 - y1;
            const curveOffset = Math.max(30, Math.min(100, Math.abs(dy) * 0.45));
            const pathD = `M ${x1} ${y1} C ${x1} ${y1 + curveOffset}, ${x2} ${y2 - curveOffset}, ${x2} ${y2}`;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const carriesTracedVlan = traceVlanId === null || link.carriedVlans.includes(traceVlanId);
            const isDimmed = traceVlanId !== null && !carriesTracedVlan;
            const isTracedPath = tracedPathLinkIds.has(link.id);
            const isHovered = hoveredPortInfo &&
              ((hoveredPortInfo.switchId === link.sourceSwitch.id && hoveredPortInfo.portNumber === link.sourcePort.number) ||
               (hoveredPortInfo.switchId === link.targetSwitch.id && hoveredPortInfo.portNumber === link.targetPort.number));

            const isBottleneck = showBottlenecks && bottleneckAnalysis.bandwidthBottlenecks.some(b => b.linkId === link.id);

            // STP Link Simulation State
            const stpLinkState = stpSimulationActive && stpCalculation ? stpCalculation.linkStates[link.id] : null;
            const isStpBlocked = Boolean(stpLinkState?.isBlocked);
            const isStpFailed = Boolean(stpLinkState?.isFailed);
            const isStpForwarding = Boolean(stpLinkState?.isForwarding);

            const baseStrokeColor = link.hasMismatch
              ? '#ef4444'
              : isBottleneck
              ? '#f43f5e'
              : isHovered
              ? '#fbbf24'
              : isTracedPath
              ? '#f59e0b'
              : carriesTracedVlan && traceVlanId !== null
              ? '#f59e0b'
              : link.isLag
              ? '#6366f1' // Indigo LAG
              : link.is40G
              ? '#3b82f6' // Royal Blue 40G
              : link.is10G
              ? '#a855f7' // Purple 10G
              : link.is100M
              ? '#f59e0b' // Amber 100M
              : (isLight ? '#10b981' : '#34d399'); // Emerald 1G

            const strokeColor = isStpFailed
              ? '#ef4444'
              : isStpBlocked
              ? '#f59e0b'
              : isStpForwarding
              ? '#10b981'
              : baseStrokeColor;

            const strokeWidth = isHovered
              ? 5.5
              : isTracedPath
              ? 4.5
              : link.isLag
              ? 4
              : link.is40G
              ? 4.5
              : link.is10G
              ? 3.5
              : link.is100M
              ? 2
              : 2.5;

            return (
              <g
                key={link.id}
                className={`transition-opacity duration-200 pointer-events-auto cursor-pointer ${
                  isDimmed ? 'opacity-15' : 'opacity-100'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (stpSimulationActive) {
                    setStpDisabledLinks(prev => {
                      const next = new Set(prev);
                      if (next.has(link.id)) next.delete(link.id);
                      else next.add(link.id);
                      return next;
                    });
                    return;
                  }
                  setSelectedLink(link);
                }}
              >
                {/* Thick hit area */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="24" />

                {/* Main Cable Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isStpBlocked ? 3 : strokeWidth}
                  strokeDasharray={isStpBlocked ? '6 6' : isStpFailed ? '4 4' : undefined}
                  strokeLinecap="round"
                  filter={link.hasMismatch || isBottleneck || isStpFailed ? 'url(#glow-error)' : isStpBlocked ? 'url(#glow-path)' : (isTracedPath || isHovered) ? 'url(#glow-path)' : 'url(#glow-healthy)'}
                />

                {/* Animated Flow with traffic-proportional pulse particles and dynamic speed */}
                {trafficAnimation && !link.hasMismatch && !isStpBlocked && !isStpFailed && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={link.utilizationPct > 80 ? '#fb7185' : '#ffffff'}
                    strokeWidth={Math.max(1.2, strokeWidth * 0.45)}
                    strokeDasharray={link.totalMbps > 300 ? '6 8' : link.totalMbps > 50 ? '5 12' : '4 16'}
                    strokeLinecap="round"
                    className={link.totalMbps > 400 || link.is40G ? 'flow-fast' : 'flow-animation'}
                    opacity={isLight ? 0.75 : 0.95}
                  />
                )}

                {/* Port anchors circles */}
                <circle cx={x1} cy={y1} r={isHovered ? 4.5 : 3} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />
                <circle cx={x2} cy={y2} r={isHovered ? 4.5 : 3} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />

                {/* Link Badge in compact mode, or if hovered, or if traffic is active, or if STP simulation is on */}
                {(stpSimulationActive || nodeViewMode === 'compact' || isHovered || isTracedPath || link.hasMismatch || (trafficAnimation && link.totalMbps > 0)) && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={stpSimulationActive ? "-80" : "-65"}
                      y="-12"
                      width={stpSimulationActive ? "160" : "130"}
                      height="24"
                      rx="7"
                      fill={isLight ? '#ffffff' : '#0f172a'}
                      stroke={isStpFailed ? '#ef4444' : isStpBlocked ? '#f59e0b' : isStpForwarding ? '#10b981' : (link.hasMismatch ? '#ef4444' : link.utilizationPct > 80 ? '#f43f5e' : strokeColor)}
                      strokeWidth={isStpBlocked ? "2" : "1.5"}
                      strokeDasharray={isStpBlocked ? "4 3" : undefined}
                      className="shadow-md"
                    />
                    {stpSimulationActive && stpLinkState ? (
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fill={isStpFailed ? '#ef4444' : isStpBlocked ? '#f59e0b' : '#10b981'}
                        fontSize="9"
                        fontFamily="Ubuntu Mono, monospace"
                        fontWeight="bold"
                      >
                        {isStpFailed
                          ? '❌ Оборван (Клик=Вкл)'
                          : isStpBlocked
                          ? `🔒 STP BLK (${stpLinkState.roleA || 'BLK'})`
                          : `✅ [${stpLinkState.roleA}]⇄[${stpLinkState.roleB}] FWD`}
                      </text>
                    ) : link.hasMismatch ? (
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill="#ef4444"
                        fontSize="9"
                        fontFamily="Ubuntu Mono, monospace"
                        fontWeight="bold"
                      >
                        ⚠️ Mismatch
                      </text>
                    ) : (
                      <>
                        <text
                          x="0"
                          y="-1"
                          textAnchor="middle"
                          fill={isLight ? '#1e293b' : '#f8fafc'}
                          fontSize="9"
                          fontFamily="Ubuntu Mono, monospace"
                          fontWeight="bold"
                        >
                          {link.sourcePort.name || link.sourcePort.number} ⟷ {link.targetPort.name || link.targetPort.number}
                        </text>
                        <text
                          x="0"
                          y="8.5"
                          textAnchor="middle"
                          fill={link.utilizationPct > 80 ? '#f43f5e' : (isLight ? '#059669' : '#34d399')}
                          fontSize="7.5"
                          fontFamily="Ubuntu Mono, monospace"
                          fontWeight="bold"
                        >
                          {link.totalMbps > 0 ? `${link.totalMbps} Мбит/с (${link.utilizationPct}%)` : link.speedLabel}
                        </text>
                      </>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* --- L2 MODE: PATCH PANEL TO SWITCH CABLES --- */}
          {topoLayer === 'l2' && showPatchPanels && patchPanelLinks.map((pl) => {
            const pCoordPP = getPortCoordinate(pl.patchPanel.id, pl.patchPort.number, true);
            const pCoordSW = getPortCoordinate(pl.targetSwitch.id, pl.targetPort.number, false);

            const x1 = pCoordPP.x;
            const y1 = pCoordPP.y;
            const x2 = pCoordSW.x;
            const y2 = pCoordSW.y;

            const pathD = `M ${x1} ${y1} C ${x1} ${y1 - 60}, ${x2} ${y2 + 60}, ${x2} ${y2}`;
            const cableColor = pl.patchPort.patchCordColor || '#a855f7';

            return (
              <g key={pl.id} className="pointer-events-auto">
                <path
                  d={pathD}
                  fill="none"
                  stroke={cableColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity={0.85}
                />
                <circle cx={x1} cy={y1} r="3" fill={cableColor} stroke="#ffffff" strokeWidth="1" />
                <circle cx={x2} cy={y2} r="3" fill={cableColor} stroke="#ffffff" strokeWidth="1" />
              </g>
            );
          })}

          {/* --- L3 MODE: ROUTING PIPES --- */}
          {topoLayer === 'l3' && coreSwitch && l3Subnets.map((sub, idx) => {
            const corePos = positions[coreSwitch.id] || { x: 480, y: 100 };
            const coreX = corePos.x + 130;
            const coreY = corePos.y + 110;

            const subX = 180 + (idx * 280);
            const subY = 400;

            return (
              <g key={sub.vlan.id}>
                <path
                  d={`M ${coreX} ${coreY} C ${coreX} ${coreY + 120}, ${subX + 110} ${subY - 100}, ${subX + 110} ${subY}`}
                  fill="none"
                  stroke={sub.vlan.color || '#3b82f6'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  filter="url(#glow-healthy)"
                />
                {trafficAnimation && (
                  <path
                    d={`M ${coreX} ${coreY} C ${coreX} ${coreY + 120}, ${subX + 110} ${subY - 100}, ${subX + 110} ${subY}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeDasharray="5 10"
                    strokeLinecap="round"
                    className="flow-animation"
                    opacity={0.8}
                  />
                )}
              </g>
            );
          })}

          {/* --- SERVER UPLINKS & BOND TRUNKS TO SWITCHES --- */}
          {showServers && serverLinks.map((sl) => {
            const sPos = positions[sl.server.id] || { x: 980, y: 300 };
            const swPos = positions[sl.targetSwitch.id] || { x: 480, y: 300 };

            const nicIdx = (sl.server.nics || []).findIndex(n => n.id === sl.nic.id || n.name === sl.nic.name);
            const x1 = sPos.x;
            const y1 = sPos.y + 70 + (nicIdx >= 0 ? nicIdx * 20 : 0);

            let x2 = swPos.x + 420;
            let y2 = swPos.y + 40;
            if (nodeViewMode === 'ports') {
              const pCoord = getPortCoordinate(sl.targetSwitch.id, sl.targetPort.number, false);
              if (pCoord && pCoord.x) {
                x2 = pCoord.x;
                y2 = pCoord.y;
              }
            }

            const dx = Math.abs(x1 - x2);
            const pathD = `M ${x1} ${y1} C ${x1 - dx * 0.4} ${y1}, ${x2 + dx * 0.4} ${y2}, ${x2} ${y2}`;
            const strokeColor = sl.isBond ? '#6366f1' : sl.is10G ? '#a855f7' : (isLight ? '#059669' : '#10b981');
            const strokeWidth = sl.isBond ? 4 : sl.is10G ? 3 : 2;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g key={sl.id} className="pointer-events-auto">
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="18" />
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  filter="url(#glow-healthy)"
                />
                {trafficAnimation && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={Math.max(1, strokeWidth * 0.5)}
                    strokeDasharray={sl.is10G ? '5 8' : '4 12'}
                    strokeLinecap="round"
                    className="flow-animation"
                    opacity={0.85}
                  />
                )}
                <circle cx={x1} cy={y1} r={3.5} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />
                <circle cx={x2} cy={y2} r={3.5} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />

                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x="-65"
                    y="-10"
                    width="130"
                    height="20"
                    rx="6"
                    fill={isLight ? '#ffffff' : '#0f172a'}
                    stroke={strokeColor}
                    strokeWidth="1.2"
                    className="shadow-xs"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={isLight ? '#1e293b' : '#f8fafc'}
                    fontSize="8"
                    fontFamily="Ubuntu Mono, monospace"
                    fontWeight="bold"
                  >
                    {sl.nic.name} ➔ {sl.targetPort.name || sl.targetPort.number} ({sl.speedLabel})
                  </text>
                </g>
              </g>
            );
          })}

          {/* --- WORKSTATIONS & CLIENT PC LINKS TO SWITCHES OR PATCH PANELS --- */}
          {showWorkstations && workstationLinks.map((wl) => {
            const wsPos = positions[wl.workstation.id] || { x: 300, y: 860 };
            const x1 = wsPos.x + 130; // Center top of workstation card
            const y1 = wsPos.y;

            let x2 = wsPos.x + 130;
            let y2 = wsPos.y - 120;

            if (wl.targetPatchPanel) {
              const pCoord = getPortCoordinate(wl.targetPatchPanel.id, wl.targetPatchPort?.number || 1, true);
              if (pCoord && pCoord.x) {
                x2 = pCoord.x;
                y2 = pCoord.y;
              }
            } else if (wl.targetSwitch) {
              if (nodeViewMode === 'ports') {
                const pCoord = getPortCoordinate(wl.targetSwitch.id, wl.targetPort?.number || 1, false);
                if (pCoord && pCoord.x) {
                  x2 = pCoord.x;
                  y2 = pCoord.y;
                }
              } else {
                const swPos = positions[wl.targetSwitch.id] || { x: 480, y: 570 };
                x2 = swPos.x + 130;
                y2 = swPos.y + 110;
              }
            }

            const dy = Math.abs(y1 - y2);
            const pathD = `M ${x1} ${y1} C ${x1} ${y1 - dy * 0.4}, ${x2} ${y2 + dy * 0.4}, ${x2} ${y2}`;
            const vlanObj = vlanMap[wl.vlanId];
            const strokeColor = vlanObj?.color || (wl.targetPatchPanel ? '#a855f7' : '#06b6d4');
            const strokeWidth = 2;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g key={wl.id} className="pointer-events-auto">
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="16" />
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray="4 4"
                  opacity={isLight ? 0.8 : 0.9}
                  filter="url(#glow-healthy)"
                />
                {trafficAnimation && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    strokeDasharray="3 9"
                    strokeLinecap="round"
                    className="flow-animation"
                    opacity={0.7}
                  />
                )}
                <circle cx={x1} cy={y1} r={3} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />
                <circle cx={x2} cy={y2} r={3} fill={strokeColor} stroke="#ffffff" strokeWidth="1" />

                {/* Cable badge */}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x="-55"
                    y="-9"
                    width="110"
                    height="18"
                    rx="5"
                    fill={isLight ? '#ffffff' : '#090d16'}
                    stroke={strokeColor}
                    strokeWidth="1"
                    className="shadow-xs"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={isLight ? '#0f172a' : '#f1f5f9'}
                    fontSize="7.5"
                    fontFamily="Ubuntu Mono, monospace"
                    fontWeight="bold"
                  >
                    VLAN {wl.vlanId} • {wl.linkLabel.slice(0, 16)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* HTML Draggable Nodes Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {/* --- L2 SWITCH NODES --- */}
          {topoLayer === 'l2' && switches.map((sw) => {
            const pos = positions[sw.id] || { x: 300, y: 300 };
            const isDetailed = nodeViewMode === 'ports';
            const nodeWidth = isDetailed ? 420 : 260;

            const carriesTracedVlan = traceVlanId === null || (sw.ports || []).some(
              p => p.pvid === traceVlanId || (p.taggedVlans && p.taggedVlans.includes(traceVlanId))
            );
            const isTracedNode = sw.id === pathFindStart || sw.id === pathFindEnd;
            const isDimmed = traceVlanId !== null && !carriesTracedVlan;

            // Vendor badge color
            const vendor = (sw.vendor || '').toLowerCase();
            const vendorTheme = vendor.includes('mikrotik')
              ? { text: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30', label: 'MikroTik' }
              : vendor.includes('snr')
              ? { text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'SNR (NAG)' }
              : vendor.includes('ubiquiti') || vendor.includes('unifi')
              ? { text: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', label: 'UniFi' }
              : { text: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', label: sw.vendor };

            const ports = sw.ports || [];
            const rj45Ports = ports.filter(p => (p.number || 0) <= 24);
            const sfpPorts = ports.filter(p => (p.number || 0) > 24);

            return (
              <div
                key={sw.id}
                onMouseDown={(e) => handleMouseDownNode(e, sw.id)}
                onClickCapture={(e) => {
                  if (justDraggedNodeRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: `${nodeWidth}px`
                }}
                className={`absolute pointer-events-auto select-none rounded-2xl border-2 ${
                  draggingNodeId === sw.id
                    ? 'transition-none cursor-grabbing ring-4 ring-blue-400 z-30 shadow-2xl scale-[1.01]'
                    : 'transition-all cursor-grab'
                } ${
                  isLight
                    ? 'bg-white/95 border-slate-300 hover:border-blue-500 shadow-lg'
                    : 'bg-slate-900/95 border-slate-700/80 hover:border-blue-400 shadow-2xl backdrop-blur-md'
                } ${
                  isTracedNode ? 'ring-4 ring-amber-400 shadow-amber-500/30' : ''
                } ${
                  traceVlanId !== null && carriesTracedVlan ? 'ring-2 ring-amber-400 shadow-amber-500/20' : ''
                } ${
                  isDimmed ? 'opacity-20 grayscale' : 'opacity-100'
                }`}
              >
                {/* STP Root Bridge / Path Cost Badge */}
                {stpSimulationActive && stpCalculation?.switchStates[String(sw.id)] && (
                  <div className="absolute -top-3.5 left-4 z-40 pointer-events-none">
                    {stpCalculation.switchStates[String(sw.id)].isRoot ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow-lg shadow-amber-500/50 ring-2 ring-white/50 animate-pulse">
                        👑 ROOT BRIDGE (Prio {stpCalculation.switchStates[String(sw.id)].priority})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-950/90 text-amber-300 border border-amber-500/40 text-[9px] font-mono flex items-center gap-1 shadow-md">
                        Cost: {stpCalculation.switchStates[String(sw.id)].pathCost} {stpCalculation.switchStates[String(sw.id)].rootPort && `• RP: ${stpCalculation.switchStates[String(sw.id)].rootPort}`}
                      </span>
                    )}
                  </div>
                )}

                {/* Node Header */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                      <Server className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-mono font-bold text-xs truncate text-slate-900 dark:text-white">
                        {sw.name}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-semibold px-1 py-0.2 rounded-xs border font-mono ${vendorTheme.bg} ${vendorTheme.text}`}>
                          {vendorTheme.label}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          {sw.model}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {sw.ip && (
                      <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 font-semibold">
                        {sw.ip}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justDraggedNodeRef.current) return;
                        onSelectSwitch(sw.id);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Открыть коммутатор"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* DETAILED 1U FACEPLATE PORT MATRIX */}
                {isDetailed ? (
                  <div className="p-3">
                    <div className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                      isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      {/* RJ45 Ports Grid: 12 Columns, 2 Rows (Odd top, Even bottom) */}
                      <div className="flex items-center gap-1.5">
                        {/* Block 1: Ports 1..12 (cols 0..5) */}
                        <div className="grid grid-flow-col grid-rows-2 gap-1">
                          {[...Array(6)].map((_, colIdx) => {
                            const oddNum = colIdx * 2 + 1;
                            const evenNum = colIdx * 2 + 2;
                            const pOdd = rj45Ports.find(p => p.number === oddNum);
                            const pEven = rj45Ports.find(p => p.number === evenNum);

                            return (
                              <React.Fragment key={colIdx}>
                                {/* Top Port (Odd) */}
                                <MiniPortCell
                                  port={pOdd}
                                  number={oddNum}
                                  switchId={sw.id}
                                  onHover={setHoveredPortInfo}
                                  onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                  isLight={isLight}
                                />
                                {/* Bottom Port (Even) */}
                                <MiniPortCell
                                  port={pEven}
                                  number={evenNum}
                                  switchId={sw.id}
                                  onHover={setHoveredPortInfo}
                                  onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                  isLight={isLight}
                                />
                              </React.Fragment>
                            );
                          })}
                        </div>

                        {/* Divider */}
                        <div className="w-px h-10 bg-slate-300 dark:bg-slate-800" />

                        {/* Block 2: Ports 13..24 (cols 6..11) */}
                        <div className="grid grid-flow-col grid-rows-2 gap-1">
                          {[...Array(6)].map((_, colIdx) => {
                            const oddNum = (colIdx + 6) * 2 + 1;
                            const evenNum = (colIdx + 6) * 2 + 2;
                            const pOdd = rj45Ports.find(p => p.number === oddNum);
                            const pEven = rj45Ports.find(p => p.number === evenNum);

                            return (
                              <React.Fragment key={colIdx + 6}>
                                <MiniPortCell
                                  port={pOdd}
                                  number={oddNum}
                                  switchId={sw.id}
                                  onHover={setHoveredPortInfo}
                                  onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                  isLight={isLight}
                                />
                                <MiniPortCell
                                  port={pEven}
                                  number={evenNum}
                                  switchId={sw.id}
                                  onHover={setHoveredPortInfo}
                                  onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                  isLight={isLight}
                                />
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>

                      {/* SFP+ Block (Ports 25..28) */}
                      {sfpPorts.length > 0 && (
                        <div className="pl-2 border-l border-slate-300 dark:border-slate-800 flex flex-col justify-center">
                          <span className="text-[8px] font-mono font-bold text-purple-400 mb-0.5">SFP+</span>
                          <div className="grid grid-flow-col grid-rows-2 gap-1">
                            {[0, 1].map(col => {
                              const pTop = sfpPorts[col * 2];
                              const pBottom = sfpPorts[col * 2 + 1];
                              return (
                                <React.Fragment key={col}>
                                  <MiniPortCell
                                    port={pTop}
                                    number={25 + col * 2}
                                    switchId={sw.id}
                                    isSfp={true}
                                    onHover={setHoveredPortInfo}
                                    onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                    isLight={isLight}
                                  />
                                  <MiniPortCell
                                    port={pBottom}
                                    number={26 + col * 2}
                                    switchId={sw.id}
                                    isSfp={true}
                                    onHover={setHoveredPortInfo}
                                    onClick={(port) => onOpenPortDrawer && onOpenPortDrawer([port], sw.id)}
                                    isLight={isLight}
                                  />
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Compact View */
                  <div className="p-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1 font-mono">
                      <span>Портов: {ports.length}</span>
                      <span>{sw.location}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* --- L2 PATCH PANEL NODES (WITH 24 PORTS) --- */}
          {topoLayer === 'l2' && showPatchPanels && patchPanels.map((pp) => {
            const pos = positions[pp.id] || { x: 200, y: 700 };
            const ports = pp.ports || [];

            return (
              <div
                key={pp.id}
                onMouseDown={(e) => handleMouseDownNode(e, pp.id)}
                onClickCapture={(e) => {
                  if (justDraggedNodeRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: '420px'
                }}
                className={`absolute pointer-events-auto select-none rounded-2xl border-2 ${
                  draggingNodeId === pp.id
                    ? 'transition-none cursor-grabbing ring-4 ring-purple-400 z-30 shadow-2xl scale-[1.01]'
                    : 'transition-all cursor-grab'
                } ${
                  isLight
                    ? 'bg-purple-50/95 border-purple-300 shadow-md'
                    : 'bg-purple-950/40 border-purple-500/40 shadow-xl backdrop-blur-md'
                }`}
              >
                <div className="p-2.5 border-b border-purple-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-500/20 text-purple-400">
                      <Cable className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-mono font-bold text-xs text-purple-300">{pp.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({pp.location})</span>
                  </div>
                  <button
                    onClick={() => onSelectPatchPanel && onSelectPatchPanel(pp.id)}
                    className="text-[11px] text-purple-400 hover:underline font-semibold cursor-pointer"
                  >
                    Журнал розеток →
                  </button>
                </div>

                {/* 24 Patch Ports Row */}
                <div className="p-2.5">
                  <div className={`p-1.5 rounded-xl border grid grid-cols-4 gap-2 ${
                    isLight ? 'bg-white border-purple-200' : 'bg-slate-950 border-purple-900/50'
                  }`}>
                    {[0, 1, 2, 3].map(block => (
                      <div key={block} className="grid grid-cols-6 gap-1">
                        {ports.slice(block * 6, block * 6 + 6).map(p => {
                          const isConnected = Boolean(p.connectedSwitchId);
                          return (
                            <button
                              key={p.id}
                              onClick={() => onOpenPatchPortDrawer && onOpenPatchPortDrawer(p)}
                              title={`Порт #${p.number} • Розетка: ${p.socket || '—'} (${p.room || 'комната'})\n${isConnected ? 'Скоммутирован в свитч' : 'Свободен'}`}
                              className={`h-5 w-4.5 rounded-sm border text-[8px] font-mono flex items-center justify-center transition-all cursor-pointer ${
                                isConnected
                                  ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                                  : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
                              }`}
                            >
                              {p.number}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* --- SERVER & HYPERVISOR NODES --- */}
          {showServers && servers.map((srv) => {
            const pos = positions[srv.id] || { x: 980, y: 300 };
            const vms = srv.vms || [];
            const nics = srv.nics || [];
            const bridges = srv.bridges || [];

            return (
              <div
                key={srv.id}
                onMouseDown={(e) => handleMouseDownNode(e, srv.id)}
                onClickCapture={(e) => {
                  if (justDraggedNodeRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: '380px'
                }}
                className={`absolute pointer-events-auto select-none rounded-2xl border-2 ${
                  draggingNodeId === srv.id
                    ? 'transition-none cursor-grabbing ring-4 ring-indigo-400 z-30 shadow-2xl scale-[1.01]'
                    : 'transition-all cursor-grab'
                } shadow-xl ${
                  isLight
                    ? 'bg-linear-to-b from-indigo-50/95 to-white border-indigo-400 shadow-md'
                    : 'bg-linear-to-b from-slate-900/95 to-slate-950/95 border-indigo-500/50 shadow-indigo-500/10 backdrop-blur-md'
                }`}
              >
                {/* Server Node Header */}
                <div className={`p-3 border-b flex items-center justify-between ${
                  isLight ? 'border-indigo-100 bg-indigo-50/60' : 'border-indigo-500/20 bg-indigo-950/30'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Cpu className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                          {srv.name}
                        </span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] shrink-0" />
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {srv.hostname || srv.ip} • {srv.vendor} {srv.model}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectServer && onSelectServer(srv.id)}
                    className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 hover:underline cursor-pointer shrink-0"
                  >
                    Открыть →
                  </button>
                </div>

                {/* Server Specs & Bridges */}
                <div className="p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-slate-800/40 pb-1.5">
                    <span className="text-indigo-400 font-semibold">{srv.os}</span>
                    <span className="text-slate-500">{srv.cpu?.split('(')[0]?.trim() || 'Multi-core'}</span>
                  </div>

                  {/* Physical NICs & Link targets */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center justify-between">
                      <span>Сетевые интерфейсы ({nics.length}):</span>
                      {bridges.length > 0 && <span className="text-indigo-400 font-mono">{bridges.map(b => b.name).join(', ')}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                      {nics.map(nic => {
                        const is10G = nic.type === 'sfp' || nic.speed?.includes('10G');
                        return (
                          <div
                            key={nic.id || nic.name}
                            className={`p-1.5 rounded-lg border flex items-center justify-between ${
                              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <span className="font-bold text-slate-700 dark:text-slate-300">{nic.name}</span>
                            <span className={`px-1 py-0.2 rounded-xs text-[9px] ${
                              is10G ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
                            }`}>
                              {nic.speed || '1G'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Virtual Machines Pool */}
                  {vms.length > 0 && (
                    <div className="pt-1 border-t border-slate-800/40">
                      <div className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center justify-between">
                        <span>Виртуальные машины ({vms.length}):</span>
                        <span className="text-emerald-500 font-mono">{vms.filter(v => v.status === 'running').length} running</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                        {vms.map(vm => (
                          <div
                            key={vm.vmid}
                            className={`px-2 py-1 rounded-lg border flex items-center justify-between text-[11px] font-mono ${
                              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/60'
                            }`}
                          >
                            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]" title={vm.role || vm.name}>
                              {vm.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              VLAN {vm.vlan}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* --- WORKSTATION / PC NODES --- */}
          {showWorkstations && workstationData.map((ws) => {
            const pos = positions[ws.id] || { x: 300, y: 860 };
            const vlanObj = vlanMap[ws.vlanId];
            const isTracedNode = ws.id === pathFindStart || ws.id === pathFindEnd;
            const carriesTracedVlan = traceVlanId === null || ws.vlanId === traceVlanId;
            const isDimmed = traceVlanId !== null && !carriesTracedVlan;

            const isLaptop = ws.hostname?.toLowerCase().includes('laptop') || ws.hostname?.toLowerCase().includes('ноут') || ws.description?.toLowerCase().includes('ноутбук');
            const isDirector = ws.hostname?.toLowerCase().includes('director') || ws.description?.toLowerCase().includes('директор');

            return (
              <div
                key={ws.id}
                onMouseDown={(e) => handleMouseDownNode(e, ws.id)}
                onClickCapture={(e) => {
                  if (justDraggedNodeRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  width: '260px'
                }}
                className={`absolute pointer-events-auto select-none rounded-2xl border-2 ${
                  draggingNodeId === ws.id
                    ? 'transition-none cursor-grabbing ring-4 ring-cyan-400 z-30 shadow-2xl scale-[1.01]'
                    : 'transition-all cursor-grab'
                } shadow-lg backdrop-blur-md ${
                  isLight
                    ? 'bg-cyan-50/90 border-cyan-300 hover:border-cyan-500 hover:shadow-xl'
                    : 'bg-slate-900/90 border-cyan-800/80 hover:border-cyan-400 hover:shadow-cyan-900/30'
                } ${
                  isTracedNode ? 'ring-4 ring-amber-400' : ''
                } ${
                  isDimmed ? 'opacity-25 grayscale' : 'opacity-100'
                }`}
              >
                {/* Workstation Header */}
                <div className={`p-2.5 border-b flex items-center justify-between ${
                  isLight ? 'border-cyan-200/80 bg-cyan-100/50' : 'border-cyan-900/50 bg-cyan-950/40'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isDirector
                        ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                        : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    }`}>
                      {isLaptop ? <Laptop className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs truncate text-slate-900 dark:text-white" title={ws.name}>
                          {ws.name}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {ws.ip || 'DHCP'}
                      </div>
                    </div>
                  </div>

                  <span
                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border shrink-0"
                    style={{
                      borderColor: (vlanObj?.color || '#06b6d4') + '55',
                      color: vlanObj?.color || '#06b6d4',
                      backgroundColor: (vlanObj?.color || '#06b6d4') + '15'
                    }}
                  >
                    V{ws.vlanId}
                  </span>
                </div>

                {/* Workstation Details Body */}
                <div className="p-2.5 space-y-1.5 text-xs font-mono">
                  {ws.description && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={ws.description}>
                      {ws.description}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                    <span className="truncate max-w-[140px]" title={ws.location || 'Локация'}>
                      📍 {ws.location || 'Офис'}
                    </span>
                    {ws.mac && (
                      <span className="text-[9px] text-slate-400 truncate max-w-[95px]" title={ws.mac}>
                        {ws.mac}
                      </span>
                    )}
                  </div>

                  {ws.connectedTo && (
                    <div className={`p-1 rounded-md text-[9px] flex items-center justify-between border ${
                      isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-800 text-slate-400'
                    }`}>
                      <span className="text-slate-500">Порт/Розетка:</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold truncate max-w-[130px]" title={ws.connectedTo}>
                        {ws.connectedTo}
                      </span>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[9px] text-slate-500">
                      {ws.sourceType === 'ipam' ? 'База IPAM' : 'Линк свитча'}
                    </span>
                    {onNavigateToIpam && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToIpam();
                        }}
                        className="text-[10px] text-cyan-500 hover:text-cyan-400 hover:underline cursor-pointer font-sans font-medium"
                      >
                        IPAM →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* --- L3 MODE: ROUTING HUBS & SUBNET CARDS --- */}
          {topoLayer === 'l3' && coreSwitch && (
            <>
              {/* Core Router Node */}
              <div
                style={{
                  left: `${(positions[coreSwitch.id]?.x || 480)}px`,
                  top: `${(positions[coreSwitch.id]?.y || 100)}px`,
                  width: '280px'
                }}
                className={`absolute pointer-events-auto rounded-2xl border-2 p-4 shadow-2xl ${
                  isLight ? 'bg-white border-blue-500' : 'bg-slate-900 border-blue-500'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500 text-white shadow-md shadow-blue-500/30">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      Шлюз ядра (L3 Router)
                    </h3>
                    <span className="text-xs text-blue-500 font-mono font-bold">{coreSwitch.name}</span>
                  </div>
                </div>
                <div className="mt-2.5 text-xs text-slate-400 font-mono">
                  IP: {coreSwitch.ip || '192.168.10.1'} • Inter-VLAN Routing
                </div>
              </div>

              {/* Subnet Hubs */}
              {l3Subnets.map((sub, idx) => {
                const subX = 180 + (idx * 280);
                const subY = 400;

                return (
                  <div
                    key={sub.vlan.id}
                    style={{
                      left: `${subX}px`,
                      top: `${subY}px`,
                      width: '240px'
                    }}
                    className={`absolute pointer-events-auto rounded-2xl border-2 p-3.5 shadow-xl transition-all ${
                      isLight ? 'bg-white/95 border-slate-300' : 'bg-slate-900/95 border-slate-700 backdrop-blur-md'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: sub.vlan.color || '#3b82f6' }}
                        />
                        <h4 className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                          VLAN {sub.vlan.id} ({sub.vlan.name})
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-bold border border-blue-500/20">
                        {sub.hostCount} хостов
                      </span>
                    </div>

                    <div className="mt-2.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Подсеть:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{sub.vlan.subnet}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Шлюз:</span>
                        <span className="text-emerald-500">{sub.vlan.gateway || '-'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Selected Link Inspector Sidebar */}
        {selectedLink && (
          <div className={`absolute top-4 right-4 z-30 w-80 rounded-2xl border p-4 shadow-2xl backdrop-blur-md text-xs space-y-3 ${
            isLight ? 'bg-white/95 border-slate-300 text-slate-800' : 'bg-slate-900/95 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold flex items-center gap-1.5 font-mono">
                <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                <span>Трассировка порта</span>
              </span>
              <button
                onClick={() => setSelectedLink(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px]">Сторона A:</div>
                <div className="font-bold text-blue-500">{selectedLink.sourceSwitch.name}</div>
                <div className="text-slate-300">Порт: {selectedLink.sourcePort.name || selectedLink.sourcePort.number} (PVID {selectedLink.sourcePort.pvid})</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px]">Сторона B:</div>
                <div className="font-bold text-blue-500">{selectedLink.targetSwitch.name}</div>
                <div className="text-slate-300">Порт: {selectedLink.targetPort.name || selectedLink.targetPort.number} (PVID {selectedLink.targetPort.pvid})</div>
              </div>
            </div>

            {/* Live Traffic & Bandwidth Card */}
            <div className={`p-2.5 rounded-xl border font-mono text-[11px] space-y-1.5 ${
              selectedLink.utilizationPct > 80
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : (isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800')
            }`}>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                <span className="flex items-center gap-1 font-semibold text-emerald-500">
                  <Activity className="w-3 h-3 animate-pulse" />
                  Живая нагрузка канала
                </span>
                <span className="font-bold">{selectedLink.speedLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div>
                  <div className="text-[10px] text-slate-400">Входящий (Rx):</div>
                  <div className="font-bold text-emerald-500">{selectedLink.rxMbps || 0} Мбит/с</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Исходящий (Tx):</div>
                  <div className="font-bold text-blue-500">{selectedLink.txMbps || 0} Мбит/с</div>
                </div>
              </div>
              <div className="pt-1 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-400">Утилизация полосы:</span>
                <span className={`font-bold ${selectedLink.utilizationPct > 80 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}`}>
                  {selectedLink.utilizationPct || 0}%
                </span>
              </div>
              {selectedLink.inErrors > 0 && (
                <div className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                  <span>Ошибок (CRC): {selectedLink.inErrors}</span>
                </div>
              )}
            </div>

            {selectedLink.isLag && (
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 font-mono text-[11px]">
                Агрегация: <strong>{selectedLink.lagName}</strong> ({selectedLink.memberCount || 2} канала)
              </div>
            )}

            {selectedLink.hasMismatch && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Коллизия линка:</span>
                </div>
                {selectedLink.mismatchIssues.map((iss, i) => (
                  <div key={i} className="text-[10px]">
                    • {iss.title}: {iss.message}
                  </div>
                ))}
              </div>
            )}

            <div>
              <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                Пропускаемые VLAN ({selectedLink.carriedVlans.length}):
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {selectedLink.carriedVlans.map(vId => (
                  <VlanBadge key={vId} vlan={vlanMap[vId] || { id: vId }} size="xs" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Speed & Link Legend (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-1">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className={`xl:hidden h-8 px-2.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 shadow-md backdrop-blur-md cursor-pointer ${
              isLight ? 'bg-white/95 border-slate-300 text-slate-700' : 'bg-slate-900/95 border-slate-800 text-slate-300'
            }`}
            title="Показать легенду скоростей линков"
          >
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <span>Легенда</span>
          </button>
          <div className={`${showLegend ? 'flex' : 'hidden xl:flex'} p-2.5 rounded-xl border shadow-lg backdrop-blur-md text-[11px] font-mono items-center gap-3.5 flex-wrap ${
            isLight ? 'bg-white/90 border-slate-300 text-slate-700' : 'bg-slate-900/90 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-blue-500 rounded-full" />
              <span>40G Uplink</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-purple-500 rounded-full" />
              <span>10G SFP+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-emerald-500 rounded-full" />
              <span>1G Медь</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-amber-500 rounded-full" />
              <span>100M</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-indigo-500 rounded-full" />
              <span>LAG (LACP)</span>
            </div>
          </div>
        </div>

        {/* Bottleneck & SPOF Inspector Drawer (Slide-in from Top) */}
        {showBottlenecks && (
          <div className={`absolute top-4 left-4 z-30 w-96 rounded-2xl border p-4 shadow-2xl backdrop-blur-md text-xs space-y-3 max-h-[80vh] overflow-y-auto ${
            isLight ? 'bg-white/95 border-rose-300 text-slate-800' : 'bg-slate-900/95 border-rose-500/40 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-rose-200 dark:border-rose-900/40">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span className="font-bold font-mono text-rose-600 dark:text-rose-400">
                  Анализ узких мест сети (SPOF)
                </span>
              </div>
              <button
                onClick={() => setShowBottlenecks(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {bottleneckAnalysis.totalIssues === 0 ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Узких мест и единых точек отказа не обнаружено! Архитектура резервирована.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* SPOF nodes */}
                {bottleneckAnalysis.spofNodes.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Единые точки отказа (SPOF): {bottleneckAnalysis.spofNodes.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bottleneckAnalysis.spofNodes.map(node => (
                        <div key={node.switchId} className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 font-mono text-[11px]">
                          <div className="font-bold text-amber-600 dark:text-amber-400">{node.name}</div>
                          <div className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">{node.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bandwidth bottlenecks */}
                {bottleneckAnalysis.bandwidthBottlenecks.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Перегруженные магистрали: {bottleneckAnalysis.bandwidthBottlenecks.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bottleneckAnalysis.bandwidthBottlenecks.map(b => (
                        <div key={b.linkId} className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 font-mono text-[11px]">
                          <div className="font-bold text-rose-600 dark:text-rose-400">
                            {b.sourceName} ⟷ {b.targetName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">{b.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Isolated switches */}
                {bottleneckAnalysis.isolatedSwitches.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Server className="w-3.5 h-3.5" />
                      <span>Изолированные устройства: {bottleneckAnalysis.isolatedSwitches.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {bottleneckAnalysis.isolatedSwitches.map(sw => (
                        <div key={sw.switchId} className="p-2 rounded-lg bg-slate-500/10 border border-slate-500/20 font-mono text-[11px]">
                          <div className="font-bold text-slate-300">{sw.name}</div>
                          <div className="text-slate-400 text-[10px] mt-0.5">{sw.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Interactive Minimap (Bottom Right) */}
        {showMinimap && (
          <div className={`absolute bottom-4 right-4 z-20 w-44 h-32 rounded-xl border shadow-2xl p-1.5 flex flex-col justify-between overflow-hidden select-none transition-all backdrop-blur-md ${
            isLight ? 'bg-white/80 border-slate-300' : 'bg-slate-950/80 border-slate-800'
          }`}>
            <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 px-1">
              <span>МИНИКАРТА</span>
              <button
                onClick={() => setShowMinimap(false)}
                className="hover:text-slate-200 cursor-pointer text-[10px]"
                title="Скрыть миникарту"
              >
                ✕
              </button>
            </div>

            {/* Canvas representation in miniature */}
            <div className="w-full h-full relative overflow-hidden my-1 bg-black/10 dark:bg-black/30 rounded-lg">
              {/* Miniature Node Dots */}
              {switches.map(sw => {
                const pos = positions[sw.id] || { x: 300, y: 300 };
                // Scale 0..1200 x 0..900 into mini canvas ~ 160 x 85
                const miniX = Math.min(150, Math.max(5, (pos.x / 1400) * 160));
                const miniY = Math.min(80, Math.max(5, (pos.y / 1000) * 85));

                return (
                  <div
                    key={sw.id}
                    style={{ left: `${miniX}px`, top: `${miniY}px` }}
                    className="absolute w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_4px_#3b82f6] -translate-x-1 -translate-y-1"
                    title={sw.name}
                  />
                );
              })}

              {/* Workstation Dots on Minimap */}
              {showWorkstations && workstationData.map(ws => {
                const pos = positions[ws.id] || { x: 300, y: 860 };
                const miniX = Math.min(150, Math.max(5, (pos.x / 1400) * 160));
                const miniY = Math.min(80, Math.max(5, (pos.y / 1000) * 85));
                return (
                  <div
                    key={ws.id}
                    style={{ left: `${miniX}px`, top: `${miniY}px` }}
                    className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400 -translate-x-0.5 -translate-y-0.5 opacity-80"
                    title={ws.name}
                  />
                );
              })}

              {/* Viewport Box Indicator */}
              <div
                style={{
                  left: `${Math.min(130, Math.max(0, (-pan.x / (1400 * zoom)) * 160))}px`,
                  top: `${Math.min(65, Math.max(0, (-pan.y / (1000 * zoom)) * 85))}px`,
                  width: `${Math.min(120, Math.max(20, (1 / zoom) * 45))}px`,
                  height: `${Math.min(60, Math.max(15, (1 / zoom) * 30))}px`
                }}
                className="absolute border border-amber-400/80 bg-amber-400/10 rounded-xs pointer-events-none"
              />
            </div>
          </div>
        )}

        {/* Modal: Добавление нового компьютера / рабочей станции */}
        {isAddWorkstationOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}>
              {/* Header */}
              <div className={`px-5 py-4 border-b flex items-center justify-between ${
                isLight ? 'bg-cyan-50/60 border-slate-200' : 'bg-slate-950/70 border-slate-800'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-500 flex items-center justify-center">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Подключить компьютер / ПК на схему
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Создание рабочей станции и привязка к порту свитча или розетке
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddWorkstationOpen(false)}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveNewWorkstation} className="p-5 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Имя хоста (Hostname) *</label>
                    <input
                      type="text"
                      required
                      placeholder="pc-accountant-03, arm-102"
                      value={newWsHostname}
                      onChange={(e) => setNewWsHostname(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-slate-950 border-slate-800 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">IP-адрес</label>
                    <input
                      type="text"
                      placeholder="192.168.20.75 (или пусто для DHCP)"
                      value={newWsIp}
                      onChange={(e) => setNewWsIp(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-slate-950 border-slate-800 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">MAC-адрес</label>
                    <input
                      type="text"
                      placeholder="00:1A:2B:3C:4D:5E"
                      value={newWsMac}
                      onChange={(e) => setNewWsMac(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-slate-950 border-slate-800 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">VLAN</label>
                    <select
                      value={newWsVlanId}
                      onChange={(e) => setNewWsVlanId(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden cursor-pointer ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                      }`}
                    >
                      {vlans.map(v => (
                        <option key={v.id} value={v.id} className={isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}>
                          VLAN {v.id} ({v.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Сотрудник / Должность</label>
                    <input
                      type="text"
                      placeholder="Иванов И.И. (Бухгалтер)"
                      value={newWsUser}
                      onChange={(e) => setNewWsUser(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-slate-950 border-slate-800 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Кабинет / Локация</label>
                    <input
                      type="text"
                      placeholder="Каб. 201, 2 этаж"
                      value={newWsLocation}
                      onChange={(e) => setNewWsLocation(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-slate-950 border-slate-800 text-white focus:border-cyan-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Connection Target: Switch or Patch Panel */}
                <div className={`p-3 rounded-xl border space-y-2.5 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
                    <Cable className="w-3.5 h-3.5" />
                    Точка подключения кабеля
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 mb-1 text-[11px]">Коммутатор</label>
                      <select
                        value={newWsSwitchId}
                        onChange={(e) => {
                          setNewWsSwitchId(e.target.value);
                          if (e.target.value) {
                            setNewWsPatchPanelId('');
                            setNewWsPatchPortNumber('');
                          }
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-hidden cursor-pointer ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      >
                        <option value="">-- Выбрать свитч --</option>
                        {switches.map(sw => (
                          <option key={sw.id} value={sw.id}>
                            {sw.name} ({sw.model})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-500 mb-1 text-[11px]">Номер порта коммутатора</label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        placeholder="Например: 5"
                        value={newWsPortNumber}
                        onChange={(e) => setNewWsPortNumber(e.target.value)}
                        disabled={!newWsSwitchId}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-hidden ${
                          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                        }`}
                      />
                    </div>
                  </div>

                  {patchPanels.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div>
                        <label className="block text-slate-500 mb-1 text-[11px]">Или Патч-панель</label>
                        <select
                          value={newWsPatchPanelId}
                          onChange={(e) => {
                            setNewWsPatchPanelId(e.target.value);
                            if (e.target.value) {
                              setNewWsSwitchId('');
                              setNewWsPortNumber('');
                            }
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-hidden cursor-pointer ${
                            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        >
                          <option value="">-- Розетка на патч-панели --</option>
                          {patchPanels.map(pp => (
                            <option key={pp.id} value={pp.id}>
                              {pp.name} ({pp.location})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 mb-1 text-[11px]">Порт панели (1-24)</label>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          placeholder="Например: 12"
                          value={newWsPatchPortNumber}
                          onChange={(e) => setNewWsPatchPortNumber(e.target.value)}
                          disabled={!newWsPatchPanelId}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono outline-hidden ${
                            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddWorkstationOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingWs}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium cursor-pointer text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSubmittingWs ? 'Сохранение...' : 'Добавить на схему'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: LLDP / CDP Auto-Link Discovery */}
        {isLldpModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}>
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      Автопоиск связей LLDP / CDP
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Автоматическое обнаружение соседей и соединение портов коммутаторов
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsLldpModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {lldpLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
                    <Radio className="w-8 h-8 text-purple-500 animate-pulse" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Сканирование соседей по LLDP / CDP...
                    </div>
                    <div className="text-xs max-w-xs text-slate-500">
                      Опрос MIB-таблиц оборудования, поиск линков между коммутаторами ядра и доступа
                    </div>
                  </div>
                ) : lldpError ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center justify-between">
                    <span>{lldpError}</span>
                    <button
                      onClick={handleOpenLldpModal}
                      className="px-2.5 py-1 rounded bg-rose-500 text-white font-medium hover:bg-rose-600"
                    >
                      Повторить
                    </button>
                  </div>
                ) : lldpData ? (
                  <>
                    {/* Live Hardware vs Simulation Banner */}
                    {lldpData.isHardware ? (
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                        <Zap className="w-4 h-4 shrink-0 text-emerald-500" />
                        <div className="min-w-0">
                          <div className="font-semibold">Аппаратный опрос оборудования (Live SSH)</div>
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 opacity-90">
                            Связи получены в реальном времени с MikroTik RouterOS (/ip neighbor) и SNR NAG (LLDP/CDP)
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs">
                        <Radio className="w-4 h-4 shrink-0 text-purple-500" />
                        <div className="min-w-0">
                          <div className="font-semibold">Сетевая авто-топология LLDP / CDP</div>
                          <div className="text-[11px] text-purple-700 dark:text-purple-300 opacity-90">
                            Обнаружены межкоммутаторные соединения оптических и медных портов ядра и распределения
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats summary bar */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'}`}>
                        <div className="text-[11px] text-slate-500">Всего найдено</div>
                        <div className="text-base font-bold font-mono text-slate-900 dark:text-white">{lldpData.totalDiscovered || 0}</div>
                      </div>
                      <div className={`p-3 rounded-xl border ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Уже соединены</div>
                        <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">{lldpData.alreadyConnectedCount || 0}</div>
                      </div>
                      <div className={`p-3 rounded-xl border ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-500/10 border-purple-500/20'}`}>
                        <div className="text-[11px] text-purple-600 dark:text-purple-400">Новые для линковки</div>
                        <div className="text-base font-bold font-mono text-purple-600 dark:text-purple-400">{lldpData.newDiscoveredCount || 0}</div>
                      </div>
                    </div>

                    {/* Discovered links list */}
                    {lldpData.links && lldpData.links.length > 0 ? (
                      <div className="space-y-2.5">
                        {lldpData.links.map(link => {
                          const isConnected = link.status === 'connected';
                          const isApplying = applyingLinkId === link.id;

                          return (
                            <div
                              key={link.id}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isConnected
                                  ? (isLight ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-slate-900/40 border-slate-800 opacity-80')
                                  : (isLight ? 'bg-purple-50/40 border-purple-200 shadow-xs' : 'bg-purple-950/20 border-purple-500/30 shadow-xs')
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                {/* Left: Source Switch & Port */}
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                                    <Server className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs font-mono truncate text-slate-900 dark:text-white">
                                      {link.sourceSwitch?.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                      {link.sourcePort?.name || `Порт ${link.sourcePort?.number}`}
                                    </div>
                                  </div>
                                </div>

                                {/* Center: Protocol & Speed */}
                                <div className="flex flex-col items-center justify-center shrink-0">
                                  <div className="flex items-center gap-1.5 text-xs text-purple-500 font-semibold font-mono">
                                    <span>{link.speed || '1G'}</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {link.protocol}
                                    </span>
                                    {link.bidirectional && (
                                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 font-mono font-medium" title="Двустороннее подтверждение линка (Full Mesh)">
                                        ✓✓ Mesh
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Right: Remote Switch & Port */}
                                <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0 sm:order-2">
                                    <Server className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 sm:text-right">
                                    <div className="font-bold text-xs font-mono truncate text-slate-900 dark:text-white">
                                      {link.remoteSwitch?.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                      {link.remotePort?.name || `Порт ${link.remotePort?.number}`}
                                    </div>
                                  </div>
                                </div>

                                {/* Action */}
                                <div className="sm:pl-3 shrink-0 self-end sm:self-center">
                                  {isConnected ? (
                                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Соединен</span>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleApplySingleLldpLink(link)}
                                      disabled={isApplying || isApplyingAll}
                                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                                    >
                                      {isApplying ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                                      <span>Связать</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        Соседей по протоколу LLDP не обнаружено.
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  onClick={handleOpenLldpModal}
                  disabled={lldpLoading}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-purple-400" />
                  <span>Повторить опрос</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsLldpModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                  >
                    Закрыть
                  </button>

                  {lldpData?.newDiscoveredCount > 0 && (
                    <button
                      onClick={handleApplyAllLldpLinks}
                      disabled={isApplyingAll || lldpLoading}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer"
                    >
                      {isApplyingAll ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      <span>Связать все ({lldpData.newDiscoveredCount})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* End-to-End VLAN Wizard Modal */}
        <VlanWizardModal
          isOpen={isVlanWizardOpen}
          onClose={() => setIsVlanWizardOpen(false)}
          switches={switches}
          vlans={vlans}
          theme={theme}
          onReloadData={onReloadData}
          initialSourceSwitchId={pathFindStart}
          initialDestinationSwitchId={pathFindEnd}
          initialVlanId={traceVlanId}
        />
      </div>
    </div>
  );
}

// Mini Port Cell component inside 1U faceplate on topology node
function MiniPortCell({ port, number, switchId, isSfp = false, onHover, onClick, isLight }) {
  if (!port) {
    return (
      <div className={`w-5 h-5 rounded-xs border text-[8px] font-mono flex items-center justify-center opacity-30 ${
        isLight ? 'bg-slate-200 border-slate-300 text-slate-500' : 'bg-slate-800 border-slate-700 text-slate-500'
      }`}>
        {number}
      </div>
    );
  }

  const isLinked = Boolean(port.linkedSwitchId || port.patchPanelId || port.connectedTo);
  const isTrunk = port.mode === 'trunk';
  const isLag = Boolean(port.lagId);

  // Status color
  const cellColor = !port.enabled
    ? 'bg-slate-800/40 border-slate-700/40 text-slate-500'
    : isLag
    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
    : isTrunk
    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
    : isLinked
    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
    : isLight
    ? 'bg-slate-200/60 border-slate-300 text-slate-600 hover:border-blue-400'
    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-blue-400';

  const ledColor = !port.enabled
    ? 'bg-slate-600'
    : isLag
    ? 'bg-indigo-400 shadow-indigo-400/50'
    : isTrunk
    ? 'bg-purple-400 shadow-purple-400/50'
    : isLinked
    ? 'bg-emerald-400 shadow-emerald-400/50'
    : 'bg-slate-600';

  const tooltipText = `Порт #${number} (${port.name || 'порт'})\nРежим: ${port.mode?.toUpperCase()} (PVID ${port.pvid})\n${
    port.connectedTo ? `Подключен: ${port.connectedTo}` : 'Свободен'
  }`;

  return (
    <button
      type="button"
      title={tooltipText}
      onMouseEnter={() => onHover && onHover({ switchId, portNumber: number })}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={() => onClick && onClick(port)}
      className={`w-5 h-5 rounded-xs border text-[8px] font-mono flex flex-col items-center justify-between p-0.5 transition-all cursor-pointer relative group ${cellColor}`}
    >
      {/* LED Dot */}
      <span className={`w-1 h-1 rounded-full ${ledColor} shrink-0`} />

      {/* Port Number */}
      <span className="leading-none text-[8px] font-bold">{number}</span>
    </button>
  );
}
