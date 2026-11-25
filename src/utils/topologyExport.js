/**
 * SwitchBook Topology Export Utility
 * 
 * Supports 3 professional export formats:
 * 1. High-Resolution Vector SVG (.svg) - standalone, styled, ready for documentation & CAD
 * 2. Draw.io / Microsoft Visio XML (.drawio) - mxGraph model for diagrams.net & Visio
 * 3. Executive Network Passport (Printable HTML / PDF) - comprehensive multi-section executive report
 */

/**
 * Escapes characters for XML/SVG safety
 */
export function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculates bounding box of all topology elements with comfortable margins
 */
export function calculateTopologyBounds(nodes = [], padding = 80) {
  if (!nodes || nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800, viewBox: '0 0 1200 800' };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const w = Number(node.width) || 280;
    const h = Number(node.height) || 120;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  const paddedMinX = Math.max(0, minX - padding);
  const paddedMinY = Math.max(0, minY - padding);
  const width = Math.max(1000, (maxX - minX) + padding * 2);
  const height = Math.max(700, (maxY - minY) + padding * 2);

  return {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMinX + width,
    maxY: paddedMinY + height,
    width: Math.round(width),
    height: Math.round(height),
    viewBox: `${Math.round(paddedMinX)} ${Math.round(paddedMinY)} ${Math.round(width)} ${Math.round(height)}`
  };
}

/**
 * Generates standalone, fully-styled vector SVG for the current topology
 */
export function generateTopologySvg({
  switches = [],
  links = [],
  patchPanels = [],
  servers = [],
  workstations = [],
  positions = {},
  options = {}
}) {
  const {
    theme = 'dark',
    includePatchPanels = true,
    includeServers = true,
    includeWorkstations = false,
    includeCableLabels = true,
    includeLegend = true,
    title = 'SwitchBook Network Topology Map'
  } = options;

  const isLight = theme === 'light';
  const bgColor = isLight ? '#f8fafc' : '#090d16';
  const cardBg = isLight ? '#ffffff' : '#111827';
  const cardBorder = isLight ? '#cbd5e1' : '#1f2937';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const textMuted = isLight ? '#64748b' : '#94a3b8';
  const gridDotColor = isLight ? '#e2e8f0' : '#1e293b';

  // Gather node bounds
  const exportNodes = [];
  
  switches.forEach(sw => {
    const pos = positions[sw.id] || { x: 300, y: 300 };
    exportNodes.push({ id: sw.id, x: pos.x, y: pos.y, width: 280, height: 130, raw: sw, type: 'switch' });
  });

  if (includePatchPanels) {
    patchPanels.forEach(pp => {
      const pos = positions[pp.id] || { x: 220, y: 740 };
      exportNodes.push({ id: pp.id, x: pos.x, y: pos.y, width: 300, height: 95, raw: pp, type: 'patch_panel' });
    });
  }

  if (includeServers) {
    servers.forEach(srv => {
      const pos = positions[srv.id] || { x: 980, y: 300 };
      exportNodes.push({ id: srv.id, x: pos.x, y: pos.y, width: 240, height: 85, raw: srv, type: 'server' });
    });
  }

  if (includeWorkstations) {
    workstations.forEach(ws => {
      const pos = positions[ws.id] || { x: 300, y: 860 };
      exportNodes.push({ id: ws.id, x: pos.x, y: pos.y, width: 200, height: 65, raw: ws, type: 'workstation' });
    });
  }

  const bounds = calculateTopologyBounds(exportNodes, 100);
  const nowStr = new Date().toLocaleString('ru-RU');

  // Filter links to only visible nodes
  const nodeIds = new Set(exportNodes.map(n => n.id));
  const activeLinks = (links || []).filter(l => {
    const srcId = l.sourceSwitch?.id || l.switchAId || l.sourceId;
    const dstId = l.targetSwitch?.id || l.switchBId || l.targetId;
    return nodeIds.has(srcId) && nodeIds.has(dstId);
  });

  // Calculate speed colors
  const getLinkStroke = (link) => {
    if (link.isBlocked || link.stpState === 'BLOCKING') return '#ef4444';
    if (link.is40G || link.speed === '40G') return '#c084fc';
    if (link.is10G || link.speed === '10G') return '#2dd4bf';
    if (link.isLag) return '#ec4899';
    if (link.is100M || link.speed === '100M') return '#f59e0b';
    return '#3b82f6'; // 1G default
  };

  // Build SVG content
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.viewBox}" width="${bounds.width}" height="${bounds.height}">
  <defs>
    <!-- Background Grid Pattern -->
    <pattern id="gridPattern" width="30" height="30" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.2" fill="${gridDotColor}" />
    </pattern>

    <!-- Drop Shadows -->
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="${isLight ? '0.08' : '0.45'}"/>
    </filter>

    <style>
      .node-text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
      .bold { font-weight: 700; }
      .medium { font-weight: 500; }
    </style>
  </defs>

  <!-- Canvas Background -->
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${bgColor}" />
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="url(#gridPattern)" />

  <!-- Document Header Banner -->
  <g transform="translate(${bounds.minX + 40}, ${bounds.minY + 45})">
    <rect x="0" y="0" width="12" height="32" rx="3" fill="#3b82f6" />
    <text x="24" y="18" fill="${textColor}" class="node-text bold" font-size="18">${escapeXml(title)}</text>
    <text x="24" y="34" fill="${textMuted}" class="node-text" font-size="11">Экспорт: ${nowStr} • Коммутаторов: ${switches.length} • Линков: ${activeLinks.length} • SwitchBook Engineering Platform</text>
  </g>

  <!-- Connection Links (drawn underneath nodes) -->
  <g id="topology-links">
`;

  activeLinks.forEach((lnk, idx) => {
    const srcId = lnk.sourceSwitch?.id || lnk.switchAId || lnk.sourceId;
    const dstId = lnk.targetSwitch?.id || lnk.switchBId || lnk.targetId;
    const srcNode = exportNodes.find(n => n.id === srcId);
    const dstNode = exportNodes.find(n => n.id === dstId);
    if (!srcNode || !dstNode) return;

    const x1 = srcNode.x + srcNode.width / 2;
    const y1 = srcNode.y + srcNode.height / 2;
    const x2 = dstNode.x + dstNode.width / 2;
    const y2 = dstNode.y + dstNode.height / 2;

    const strokeColor = getLinkStroke(lnk);
    const strokeWidth = lnk.is40G ? 4 : (lnk.is10G || lnk.isLag) ? 3 : 2;
    const isDashed = lnk.isLag || lnk.isBlocked || lnk.stpState === 'BLOCKING';
    const dashArray = isDashed ? 'stroke-dasharray="6,4"' : '';

    // Midpoint for cable labels
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const portA = lnk.sourcePort?.number || lnk.sourcePort?.name || lnk.portA || '';
    const portB = lnk.targetPort?.number || lnk.targetPort?.name || lnk.portB || '';
    const speed = lnk.speedLabel || lnk.speed || '1G';
    const vlans = lnk.carriedVlans ? lnk.carriedVlans.slice(0, 3).join(',') + (lnk.carriedVlans.length > 3 ? '...' : '') : '';

    svg += `    <!-- Link ${idx + 1}: ${srcId} -> ${dstId} -->
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashArray} opacity="0.85" />
`;

    if (includeCableLabels) {
      const labelText = `${portA ? portA + ' ↔ ' : ''}${portB}${speed ? ' [' + speed + ']' : ''}${vlans ? ' V:' + vlans : ''}`;
      const labelWidth = Math.max(80, labelText.length * 6.8);
      svg += `    <g transform="translate(${midX}, ${midY})">
      <rect x="${-labelWidth / 2}" y="-10" width="${labelWidth}" height="20" rx="5" fill="${cardBg}" stroke="${strokeColor}" stroke-width="1.2" opacity="0.95" />
      <text x="0" y="3.5" fill="${textColor}" text-anchor="middle" class="node-text bold" font-size="9.5">${escapeXml(labelText)}</text>
    </g>
`;
    }
  });

  svg += `  </g>

  <!-- Hardware Nodes -->
  <g id="topology-nodes">
`;

  exportNodes.forEach(node => {
    const { x, y, width, height, type, raw } = node;

    if (type === 'switch') {
      const name = raw.name || 'Switch';
      const ip = raw.ip || '0.0.0.0';
      const model = raw.model || raw.vendor || 'Switch';
      const rack = raw.rackName || raw.rack || raw.location || 'Rack';
      const unit = raw.rackUnit ? ` (U${raw.rackUnit})` : '';
      const portCount = raw.ports?.length || 24;
      const isCore = (raw.name + ' ' + (raw.location || '')).toLowerCase().includes('core') || raw.vendor === 'MikroTik';
      const isDist = (raw.name + ' ' + (raw.location || '')).toLowerCase().includes('dist') || raw.vendor === 'SNR';
      const roleColor = isCore ? '#3b82f6' : isDist ? '#6366f1' : '#64748b';
      const roleBadge = isCore ? 'CORE' : isDist ? 'DIST' : 'ACCESS';

      svg += `    <!-- Switch: ${escapeXml(name)} -->
    <g transform="translate(${x}, ${y})" filter="url(#cardShadow)">
      <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5" />
      <rect x="0" y="0" width="${width}" height="32" rx="10" fill="${cardBg}" />
      <rect x="0" y="24" width="${width}" height="8" fill="${cardBg}" />
      <line x1="0" y1="32" x2="${width}" y2="32" stroke="${cardBorder}" stroke-width="1" />

      <!-- Role Stripe -->
      <rect x="0" y="0" width="5" height="${height}" rx="3" fill="${roleColor}" />

      <!-- Switch Title & Badge -->
      <text x="16" y="21" fill="${textColor}" class="node-text bold" font-size="12">${escapeXml(name)}</text>
      <rect x="${width - 65}" y="9" width="52" height="15" rx="3.5" fill="${roleColor}22" stroke="${roleColor}" stroke-width="1" />
      <text x="${width - 39}" y="20" fill="${roleColor}" text-anchor="middle" class="node-text bold" font-size="8.5">${roleBadge}</text>

      <!-- Details -->
      <text x="16" y="52" fill="${textMuted}" class="node-text" font-size="10.5">IP: <tspan fill="${textColor}" class="bold">${escapeXml(ip)}</tspan></text>
      <text x="16" y="70" fill="${textMuted}" class="node-text" font-size="10.5">Модель: <tspan fill="${textColor}">${escapeXml(model)}</tspan></text>
      <text x="16" y="88" fill="${textMuted}" class="node-text" font-size="10.5">Стойка: <tspan fill="${textColor}">${escapeXml(rack + unit)}</tspan></text>

      <!-- Port Indicator Footprint -->
      <rect x="16" y="102" width="${width - 32}" height="16" rx="4" fill="${isLight ? '#f1f5f9' : '#1f2937'}" />
      <text x="24" y="113.5" fill="${textMuted}" class="node-text" font-size="9">Порты: ${portCount} портов • PoE/LACP ready</text>
      <circle cx="${width - 26}" cy="110" r="3.5" fill="#10b981" />
    </g>
`;
    } else if (type === 'patch_panel') {
      const name = raw.name || 'Patch Panel';
      const ports = raw.portCount || (raw.ports ? raw.ports.length : 24);
      const category = raw.category || 'Cat.6 UTP';
      const rack = raw.rackName || raw.location || 'Rack';

      svg += `    <!-- Patch Panel: ${escapeXml(name)} -->
    <g transform="translate(${x}, ${y})" filter="url(#cardShadow)">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="${cardBg}" stroke="#f59e0b" stroke-width="1.5" />
      <rect x="0" y="0" width="5" height="${height}" rx="3" fill="#f59e0b" />
      <text x="16" y="22" fill="${textColor}" class="node-text bold" font-size="11.5">${escapeXml(name)}</text>
      <rect x="${width - 55}" y="10" width="45" height="15" rx="3.5" fill="#f59e0b22" stroke="#f59e0b" stroke-width="1" />
      <text x="${width - 32}" y="21" fill="#f59e0b" text-anchor="middle" class="node-text bold" font-size="8.5">PP 1U</text>
      <text x="16" y="48" fill="${textMuted}" class="node-text" font-size="10">Категория: <tspan fill="${textColor}">${escapeXml(category)}</tspan></text>
      <text x="16" y="66" fill="${textMuted}" class="node-text" font-size="10">Стойка: <tspan fill="${textColor}">${escapeXml(rack)}</tspan> • ${ports} портов</text>
    </g>
`;
    } else if (type === 'server') {
      const name = raw.name || 'Server';
      const ip = raw.ip || 'DHCP';
      const role = raw.role || 'Compute';

      svg += `    <!-- Server: ${escapeXml(name)} -->
    <g transform="translate(${x}, ${y})" filter="url(#cardShadow)">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="${cardBg}" stroke="#10b981" stroke-width="1.5" />
      <rect x="0" y="0" width="5" height="${height}" rx="3" fill="#10b981" />
      <text x="16" y="22" fill="${textColor}" class="node-text bold" font-size="11">${escapeXml(name)}</text>
      <rect x="${width - 55}" y="10" width="45" height="15" rx="3.5" fill="#10b98122" stroke="#10b981" stroke-width="1" />
      <text x="${width - 32}" y="21" fill="#10b981" text-anchor="middle" class="node-text bold" font-size="8.5">SRV</text>
      <text x="16" y="46" fill="${textMuted}" class="node-text" font-size="9.5">IP: <tspan fill="${textColor}" class="bold">${escapeXml(ip)}</tspan></text>
      <text x="16" y="63" fill="${textMuted}" class="node-text" font-size="9.5">Роль: <tspan fill="${textColor}">${escapeXml(role)}</tspan></text>
    </g>
`;
    } else if (type === 'workstation') {
      const name = raw.hostname || raw.name || 'Workstation';
      const ip = raw.ip || 'DHCP';

      svg += `    <!-- Workstation: ${escapeXml(name)} -->
    <g transform="translate(${x}, ${y})" filter="url(#cardShadow)">
      <rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="${cardBg}" stroke="#818cf8" stroke-width="1.2" />
      <text x="12" y="20" fill="${textColor}" class="node-text bold" font-size="10">${escapeXml(name)}</text>
      <text x="12" y="40" fill="${textMuted}" class="node-text" font-size="9">IP: ${escapeXml(ip)}</text>
    </g>
`;
    }
  });

  svg += `  </g>
`;

  // Optional Legend Box
  if (includeLegend) {
    const legX = bounds.minX + 40;
    const legY = bounds.maxY - 90;
    svg += `  <!-- Legend Box -->
  <g transform="translate(${legX}, ${legY})">
    <rect x="0" y="0" width="620" height="60" rx="8" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.2" opacity="0.95" />
    <text x="15" y="20" fill="${textColor}" class="node-text bold" font-size="10.5">Условные обозначения каналов:</text>

    <!-- 40G -->
    <line x1="15" y1="40" x2="45" y2="40" stroke="#c084fc" stroke-width="3" />
    <text x="52" y="43" fill="${textMuted}" class="node-text" font-size="9.5">40G QSFP+</text>

    <!-- 10G -->
    <line x1="140" y1="40" x2="170" y2="40" stroke="#2dd4bf" stroke-width="3" />
    <text x="177" y="43" fill="${textMuted}" class="node-text" font-size="9.5">10G SFP+</text>

    <!-- 1G -->
    <line x1="260" y1="40" x2="290" y2="40" stroke="#3b82f6" stroke-width="2" />
    <text x="297" y="43" fill="${textMuted}" class="node-text" font-size="9.5">1G Copper/SFP</text>

    <!-- LAG -->
    <line x1="395" y1="40" x2="425" y2="40" stroke="#ec4899" stroke-width="2.5" stroke-dasharray="4,2" />
    <text x="432" y="43" fill="${textMuted}" class="node-text" font-size="9.5">LACP/LAG Trunk</text>

    <!-- Blocked -->
    <line x1="535" y1="40" x2="560" y2="40" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2" />
    <text x="567" y="43" fill="${textMuted}" class="node-text" font-size="9.5">STP Blocked</text>
  </g>
`;
  }

  svg += `</svg>`;
  return svg;
}

/**
 * Generates valid mxGraph XML (.drawio) for Microsoft Visio & diagrams.net
 */
export function generateDrawioXml({
  switches = [],
  links = [],
  patchPanels = [],
  servers = [],
  workstations = [],
  positions = {},
  options = {}
}) {
  const {
    includePatchPanels = true,
    includeServers = true,
    includeWorkstations = false,
    title = 'SwitchBook Topology'
  } = options;

  let cellIdCounter = 2;
  const idMap = new Map();

  const getCellId = (key) => {
    if (!idMap.has(key)) {
      idMap.set(key, `node_${cellIdCounter++}`);
    }
    return idMap.get(key);
  };

  const xmlCells = [];

  // 1. Export Switches
  switches.forEach(sw => {
    const cid = getCellId(sw.id);
    const pos = positions[sw.id] || { x: 300, y: 200 };
    const name = sw.name || 'Switch';
    const ip = sw.ip || '0.0.0.0';
    const model = sw.model || sw.vendor || 'Switch';
    const rack = sw.rackName || sw.rack || sw.location || 'Rack';
    const unit = sw.rackUnit ? ` (U${sw.rackUnit})` : '';
    const isCore = (sw.name + ' ' + (sw.location || '')).toLowerCase().includes('core') || sw.vendor === 'MikroTik';
    const isDist = (sw.name + ' ' + (sw.location || '')).toLowerCase().includes('dist') || sw.vendor === 'SNR';

    const strokeColor = isCore ? '#2563eb' : isDist ? '#4f46e5' : '#475569';
    const fillColor = isCore ? '#dbeafe' : isDist ? '#e0e7ff' : '#f1f5f9';
    const fontColor = '#0f172a';

    const label = `${escapeXml(name)}&#xa;${escapeXml(ip)}&#xa;${escapeXml(model)}&#xa;[${escapeXml(rack + unit)}]`;

    xmlCells.push(`        <mxCell id="${cid}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=2;fontColor=${fontColor};fontSize=11;fontFamily=monospace;align=center;verticalAlign=middle;shadow=1;" vertex="1" parent="1">
          <mxGeometry x="${Math.round(pos.x)}" y="${Math.round(pos.y)}" width="220" height="90" as="geometry"/>
        </mxCell>`);
  });

  // 2. Export Patch Panels
  if (includePatchPanels) {
    patchPanels.forEach(pp => {
      const cid = getCellId(pp.id);
      const pos = positions[pp.id] || { x: 220, y: 740 };
      const name = pp.name || 'Patch Panel';
      const rack = pp.rackName || pp.location || 'Rack';
      const ports = pp.portCount || (pp.ports ? pp.ports.length : 24);
      const label = `[PP] ${escapeXml(name)}&#xa;${ports} Ports • ${escapeXml(rack)}`;

      xmlCells.push(`        <mxCell id="${cid}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#d97706;strokeWidth=2;fontColor=#78350f;fontSize=10;fontFamily=monospace;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${Math.round(pos.x)}" y="${Math.round(pos.y)}" width="200" height="60" as="geometry"/>
        </mxCell>`);
    });
  }

  // 3. Export Servers
  if (includeServers) {
    servers.forEach(srv => {
      const cid = getCellId(srv.id);
      const pos = positions[srv.id] || { x: 980, y: 300 };
      const name = srv.name || 'Server';
      const ip = srv.ip || 'DHCP';
      const role = srv.role || 'Host';
      const label = `[SRV] ${escapeXml(name)}&#xa;${escapeXml(ip)}&#xa;Role: ${escapeXml(role)}`;

      xmlCells.push(`        <mxCell id="${cid}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d1fae5;strokeColor=#059669;strokeWidth=2;fontColor=#064e3b;fontSize=10;fontFamily=monospace;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${Math.round(pos.x)}" y="${Math.round(pos.y)}" width="180" height="65" as="geometry"/>
        </mxCell>`);
    });
  }

  // 4. Export Workstations
  if (includeWorkstations) {
    workstations.forEach(ws => {
      const cid = getCellId(ws.id);
      const pos = positions[ws.id] || { x: 300, y: 860 };
      const name = ws.hostname || ws.name || 'PC';
      const ip = ws.ip || 'DHCP';
      const label = `[PC] ${escapeXml(name)}&#xa;${escapeXml(ip)}`;

      xmlCells.push(`        <mxCell id="${cid}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ede9fe;strokeColor=#7c3aed;strokeWidth=1.5;fontColor=#4c1d95;fontSize=9.5;fontFamily=monospace;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${Math.round(pos.x)}" y="${Math.round(pos.y)}" width="150" height="50" as="geometry"/>
        </mxCell>`);
    });
  }

  // 5. Export Links / Edges
  (links || []).forEach(lnk => {
    const srcId = lnk.sourceSwitch?.id || lnk.switchAId || lnk.sourceId;
    const dstId = lnk.targetSwitch?.id || lnk.switchBId || lnk.targetId;
    if (!idMap.has(srcId) || !idMap.has(dstId)) return;

    const sourceCellId = idMap.get(srcId);
    const targetCellId = idMap.get(dstId);
    const edgeId = `edge_${cellIdCounter++}`;

    const portA = lnk.sourcePort?.number || lnk.sourcePort?.name || lnk.portA || '';
    const portB = lnk.targetPort?.number || lnk.targetPort?.name || lnk.portB || '';
    const speed = lnk.speedLabel || lnk.speed || '1G';
    const vlans = lnk.carriedVlans ? ' [V:' + lnk.carriedVlans.slice(0, 3).join(',') + ']' : '';
    const edgeLabel = `${portA} ↔ ${portB} (${speed}${vlans})`;

    const is40G = lnk.is40G || lnk.speed === '40G';
    const is10G = lnk.is10G || lnk.speed === '10G';
    const isLag = lnk.isLag;
    const isBlocked = lnk.isBlocked || lnk.stpState === 'BLOCKING';

    const strokeColor = isBlocked ? '#ef4444' : is40G ? '#9333ea' : is10G ? '#0d9488' : isLag ? '#db2777' : '#2563eb';
    const strokeWidth = is40G ? '3' : (is10G || isLag) ? '2.5' : '1.5';
    const dashed = (isLag || isBlocked) ? ';dashed=1' : '';

    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${strokeColor};strokeWidth=${strokeWidth}${dashed};fontColor=${strokeColor};fontSize=9;fontFamily=monospace;`;

    xmlCells.push(`        <mxCell id="${edgeId}" value="${escapeXml(edgeLabel)}" style="${edgeStyle}" edge="1" parent="1" source="${sourceCellId}" target="${targetCellId}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`);
  });

  const nowIso = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="SwitchBook" modified="${nowIso}" agent="SwitchBook Topology Exporter" version="21.0.0" type="device">
  <diagram id="switchbook-diagram" name="${escapeXml(title)}">
    <mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${xmlCells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

/**
 * Generates Executive Network Passport - Multi-Section Printable Report (A4 Landscape PDF ready)
 */
export function generateNetworkPassportHtml({
  switches = [],
  links = [],
  patchPanels = [],
  servers = [],
  vlans = [],
  positions = {},
  options = {}
}) {
  const {
    companyName = 'Корпоративная Сеть SwitchBook',
    preparedBy = 'Сетевой инженер SwitchBook',
    approvedBy = 'Главный системный архитектор',
    title = 'Паспорт сетевой инфраструктуры и кабельный журнал'
  } = options;

  const nowStr = new Date().toLocaleString('ru-RU');

  // Generate lightweight printable SVG embedded in report
  const diagramSvg = generateTopologySvg({
    switches,
    links,
    patchPanels,
    servers,
    positions,
    options: {
      theme: 'light',
      includeLegend: true,
      includeCableLabels: true,
      title: 'Схема физических и логических связей'
    }
  });

  // Calculate fleet stats
  const totalSwitches = switches.length;
  const coreCount = switches.filter(s => (s.name + ' ' + (s.location || '')).toLowerCase().includes('core') || s.vendor === 'MikroTik').length;
  const distCount = switches.filter(s => (s.name + ' ' + (s.location || '')).toLowerCase().includes('dist') || s.vendor === 'SNR').length;
  const accessCount = Math.max(0, totalSwitches - coreCount - distCount);
  const totalTrunks = links.length;
  const totalVlans = vlans.length;

  // Render switch inventory rows
  const switchRows = switches.map((sw, idx) => {
    const rack = sw.rackName || sw.rack || sw.location || '—';
    const unit = sw.rackUnit ? ` (U${sw.rackUnit})` : '';
    const portCount = sw.ports?.length || 24;
    const isCore = (sw.name + ' ' + (sw.location || '')).toLowerCase().includes('core') || sw.vendor === 'MikroTik';
    const isDist = (sw.name + ' ' + (sw.location || '')).toLowerCase().includes('dist') || sw.vendor === 'SNR';
    const roleBadge = isCore ? 'CORE' : isDist ? 'DIST' : 'ACCESS';

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
        <td><strong>${escapeXml(sw.name)}</strong></td>
        <td><code>${escapeXml(sw.ip || '0.0.0.0')}</code></td>
        <td>${escapeXml(sw.vendor || '—')} / ${escapeXml(sw.model || '—')}</td>
        <td>${escapeXml(rack + unit)}</td>
        <td style="text-align: center;"><span class="badge ${roleBadge.toLowerCase()}">${roleBadge}</span></td>
        <td style="text-align: center;">${portCount}</td>
        <td><code>${escapeXml(sw.macAddress || sw.mac || '—')}</code></td>
      </tr>
    `;
  }).join('');

  // Render cable schedule rows
  const linkRows = (links || []).map((lnk, idx) => {
    const swA = lnk.sourceSwitch?.name || lnk.switchAId || 'Switch A';
    const portA = lnk.sourcePort?.number || lnk.sourcePort?.name || lnk.portA || '—';
    const swB = lnk.targetSwitch?.name || lnk.switchBId || 'Switch B';
    const portB = lnk.targetPort?.number || lnk.targetPort?.name || lnk.portB || '—';
    const speed = lnk.speedLabel || lnk.speed || '1G';
    const vlanStr = lnk.carriedVlans?.length > 0 ? lnk.carriedVlans.join(', ') : 'All / Trunk';
    const isLag = lnk.isLag ? `LAG ${lnk.lagId || ''}` : 'Direct';
    const stpState = lnk.isBlocked || lnk.stpState === 'BLOCKING' ? 'BLOCKING (STP)' : 'FORWARDING';

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">L-${idx + 1}</td>
        <td><strong>${escapeXml(swA)}</strong> [Port ${escapeXml(portA)}]</td>
        <td><strong>${escapeXml(swB)}</strong> [Port ${escapeXml(portB)}]</td>
        <td style="text-align: center;"><span class="badge speed">${escapeXml(speed)}</span></td>
        <td style="text-align: center;">${escapeXml(isLag)}</td>
        <td><small>${escapeXml(vlanStr)}</small></td>
        <td style="text-align: center;"><span class="badge ${stpState.includes('BLOCKING') ? 'blocked' : 'forwarding'}">${stpState}</span></td>
      </tr>
    `;
  }).join('');

  // Render VLAN table rows
  const vlanRows = (vlans || []).map(v => {
    return `
      <tr>
        <td style="text-align: center; font-weight: bold;"><code>VLAN ${v.id}</code></td>
        <td><strong>${escapeXml(v.name || '—')}</strong></td>
        <td><code>${escapeXml(v.subnet || v.network || '—')}</code></td>
        <td>${escapeXml(v.description || '—')}</td>
        <td><code>${escapeXml(v.gateway || '—')}</code></td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(title)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.4;
    }
    .no-print-bar {
      background: #1e293b;
      color: #f8fafc;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .btn-print {
      background: #3b82f6;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-print:hover { background: #2563eb; }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
      .page-break { page-break-before: always; }
    }
    .header-box {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-title h1 {
      margin: 0 0 4px 0;
      font-size: 22px;
      color: #0f172a;
    }
    .header-title p {
      margin: 0;
      font-size: 12px;
      color: #475569;
    }
    .header-meta {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .metric-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      background: #f8fafc;
      text-align: center;
    }
    .metric-val {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      font-family: monospace;
    }
    .metric-lbl {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-top: 2px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-left: 4px solid #3b82f6;
      padding-left: 8px;
      margin: 20px 0 10px 0;
      color: #0f172a;
    }
    .table-custom {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 24px;
    }
    .table-custom th {
      background: #f1f5f9;
      color: #334155;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      font-weight: 600;
    }
    .table-custom td {
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
    }
    .table-custom tr:nth-child(even) { background: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
      font-family: monospace;
    }
    .badge.core { background: #dbeafe; color: #1e40af; }
    .badge.dist { background: #e0e7ff; color: #3730a3; }
    .badge.access { background: #f1f5f9; color: #475569; }
    .badge.speed { background: #ccfbf1; color: #0f766e; }
    .badge.forwarding { background: #dcfce7; color: #166534; }
    .badge.blocked { background: #fee2e2; color: #991b1b; }
    code { font-family: monospace; font-size: 10.5px; color: #0f172a; }
    .diagram-container {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
      background: #f8fafc;
      padding: 8px;
      text-align: center;
    }
    .diagram-container svg {
      max-width: 100%;
      height: auto;
      max-height: 480px;
    }
    .signature-box {
      margin-top: 32px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      padding-top: 16px;
      border-top: 1px solid #cbd5e1;
      font-size: 11px;
    }
    .sig-line {
      border-bottom: 1px solid #94a3b8;
      margin-top: 30px;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>

  <!-- Screen Top Bar with Print Button -->
  <div class="no-print-bar">
    <div>
      <strong>SwitchBook Network Passport</strong> — Готов к печати и экспорту в PDF
      <span style="opacity: 0.7; margin-left: 12px; font-size: 12px;">(Рекомендуется альбомная ориентация A4)</span>
    </div>
    <button class="btn-print" onclick="window.print()">Распечатать / Сохранить в PDF</button>
  </div>

  <!-- Document Header -->
  <div class="header-box">
    <div class="header-title">
      <h1>${escapeXml(title)}</h1>
      <p>Организация: <strong>${escapeXml(companyName)}</strong> • Платформа сетевого управления SwitchBook</p>
    </div>
    <div class="header-meta">
      Дата составления: <strong>${nowStr}</strong><br>
      Идентификатор отчета: <strong>SB-NET-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}</strong>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-val">${totalSwitches}</div>
      <div class="metric-lbl">Коммутаторов (Core: ${coreCount}, Dist: ${distCount})</div>
    </div>
    <div class="metric-card">
      <div class="metric-val">${totalTrunks}</div>
      <div class="metric-lbl">Физических линков &amp; LAG</div>
    </div>
    <div class="metric-card">
      <div class="metric-val">${totalVlans}</div>
      <div class="metric-lbl">Активных VLAN сетей</div>
    </div>
    <div class="metric-card">
      <div class="metric-val">${patchPanels.length}</div>
      <div class="metric-lbl">Патч-панелей (СКС)</div>
    </div>
    <div class="metric-card">
      <div class="metric-val">${servers.length}</div>
      <div class="metric-lbl">Серверных узлов</div>
    </div>
  </div>

  <!-- Section 1: Visual Topology -->
  <div class="section-title">Раздел 1: Графическая схема сетевой топологии</div>
  <div class="diagram-container">
    ${diagramSvg}
  </div>

  <div class="page-break"></div>

  <!-- Section 2: Switch Inventory -->
  <div class="section-title">Раздел 2: Спецификация оборудования (Свитчи и маршрутизаторы)</div>
  <table class="table-custom">
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">№</th>
        <th>Имя узла</th>
        <th>IP адрес (Management)</th>
        <th>Вендор / Модель</th>
        <th>Стойка / Юнит</th>
        <th style="text-align: center;">Уровень</th>
        <th style="text-align: center;">Порты</th>
        <th>MAC адрес</th>
      </tr>
    </thead>
    <tbody>
      ${switchRows || '<tr><td colspan="8" style="text-align:center;">Нет данных</td></tr>'}
    </tbody>
  </table>

  <!-- Section 3: Cable Schedule / Interconnect Matrix -->
  <div class="section-title">Раздел 3: Кабельный журнал магистральных соединений (Trunk Matrix)</div>
  <table class="table-custom">
    <thead>
      <tr>
        <th style="width: 45px; text-align: center;">Линк</th>
        <th>Узел A (Порт источника)</th>
        <th>Узел B (Порт назначения)</th>
        <th style="text-align: center;">Скорость</th>
        <th style="text-align: center;">Тип</th>
        <th>Пропускаемые VLANs</th>
        <th style="text-align: center;">Статус STP</th>
      </tr>
    </thead>
    <tbody>
      ${linkRows || '<tr><td colspan="7" style="text-align:center;">Нет магистральных соединений</td></tr>'}
    </tbody>
  </table>

  <!-- Section 4: VLAN Directory -->
  <div class="section-title">Раздел 4: Реестр виртуальных сетей (VLAN Directory)</div>
  <table class="table-custom">
    <thead>
      <tr>
        <th style="width: 70px; text-align: center;">VLAN ID</th>
        <th>Наименование сети</th>
        <th>CIDR Подсеть</th>
        <th>Назначение / Описание</th>
        <th>Шлюз по умолчанию</th>
      </tr>
    </thead>
    <tbody>
      ${vlanRows || '<tr><td colspan="5" style="text-align:center;">Нет настроенных VLAN</td></tr>'}
    </tbody>
  </table>

  <!-- Section 5: Signatures -->
  <div class="signature-box">
    <div>
      <strong>Составил отчет:</strong><br>
      ${escapeXml(preparedBy)}<br>
      <div class="sig-line"></div>
      <small style="color: #64748b;">(Подпись / Дата)</small>
    </div>
    <div>
      <strong>Утвердил отчет:</strong><br>
      ${escapeXml(approvedBy)}<br>
      <div class="sig-line"></div>
      <small style="color: #64748b;">(Подпись / Дата)</small>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Triggers a file download in browser environment
 */
export function downloadFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined' || !window.document) return false;
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('[TopologyExport] Ошибка скачивания файла:', err);
    return false;
  }
}

/**
 * Opens content in a new printable browser window/tab
 */
export function openPrintWindow(htmlContent) {
  if (typeof window === 'undefined') return null;
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      return printWindow;
    }
  } catch (err) {
    console.error('[TopologyExport] Ошибка открытия окна печати:', err);
  }
  return null;
}
