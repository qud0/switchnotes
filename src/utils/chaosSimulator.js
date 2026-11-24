import { calculateSpanningTree } from './stpSimulator.js';

/**
 * chaosSimulator.js
 * Движок симуляции сетевых аварий (Chaos Monkey), расчёта Blast Radius (зоны поражения),
 * динамической сходимости RSTP/STP и перегрузки резервных каналов.
 */

export function normalizeChaosLink(l) {
  const swAId = String(l.switchAId || l.sourceSwitch?.id || l.source?.id || l.source || '');
  const swBId = String(l.switchBId || l.targetSwitch?.id || l.target?.id || l.target || '');
  const speed = String(l.speed || '1G');
  const cost = Number(l.cost) || (speed.includes('100G') || speed.includes('40G') || speed.includes('25G') ? 1 : speed.includes('10G') ? 2 : speed.includes('100M') ? 19 : 4);
  return {
    ...l,
    id: String(l.id),
    switchAId: swAId,
    switchBId: swBId,
    cost,
    speed,
    portA: l.portA || l.sourcePort || { number: 1, name: 'Port 1' },
    portB: l.portB || l.targetPort || { number: 1, name: 'Port 1' }
  };
}

export function simulateChaosNetwork({
  switches = [],
  links = [],
  servers = [],
  ipAllocations = [],
  failedLinkIds = [],
  failedSwitchIds = [],
  manualRootId = null,
  protocol = 'rstp'
}) {
  const failedLinkSet = new Set(Array.from(failedLinkIds || []).map(String));
  const failedSwitchSet = new Set(Array.from(failedSwitchIds || []).map(String));

  const normalizedLinks = (links || []).map(normalizeChaosLink);

  // 1. Расчёт эталонного состояния Spanning Tree (до аварии)
  const baselineStp = calculateSpanningTree({
    switches,
    links: normalizedLinks,
    manualRootId,
    disabledLinkIds: new Set(),
    protocol
  });

  // 2. Расчёт состояния Spanning Tree после сбоя линков и коммутаторов
  const activeSwitches = switches.filter(s => !failedSwitchSet.has(String(s.id)));
  const failureStp = calculateSpanningTree({
    switches: activeSwitches,
    links: normalizedLinks,
    manualRootId: failedSwitchSet.has(String(manualRootId)) ? null : manualRootId,
    disabledLinkIds: failedLinkSet,
    protocol
  });

  // 3. Определение корневого шлюза / ядра сети
  const rootSwitch = (manualRootId && !failedSwitchSet.has(String(manualRootId)))
    ? switches.find(s => String(s.id) === String(manualRootId))
    : switches.find(s => (s.role === 'core' || String(s.id).includes('core')) && !failedSwitchSet.has(String(s.id))) ||
      switches.find(s => !failedSwitchSet.has(String(s.id))) ||
      null;

  const rootId = rootSwitch ? String(rootSwitch.id) : null;

  // 4. Построение графа доступности (только не блокированные и исправные линки)
  const adj = new Map();
  switches.forEach(s => adj.set(String(s.id), []));

  normalizedLinks.forEach(l => {
    if (failedLinkSet.has(l.id)) return;
    const swAId = l.switchAId;
    const swBId = l.switchBId;
    if (failedSwitchSet.has(swAId) || failedSwitchSet.has(swBId)) return;

    const stpState = failureStp.linkStates[l.id];
    // Линк передаёт трафик, если он не заблокирован STP
    if (stpState && stpState.isBlocked) return;

    if (adj.has(swAId)) adj.get(swAId).push({ targetId: swBId, link: l });
    if (adj.has(swBId)) adj.get(swBId).push({ targetId: swAId, link: l });
  });

  // 5. Поиск в ширину (BFS) от ядра для определения доступности
  const reachableSwitchIds = new Set();
  if (rootId && !failedSwitchSet.has(rootId)) {
    const queue = [rootId];
    reachableSwitchIds.add(rootId);

    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = adj.get(curr) || [];
      for (const edge of neighbors) {
        if (!reachableSwitchIds.has(edge.targetId)) {
          reachableSwitchIds.add(edge.targetId);
          queue.push(edge.targetId);
        }
      }
    }
  }

  // 6. Определение изолированных коммутаторов
  const isolatedSwitches = [];
  switches.forEach(sw => {
    const swId = String(sw.id);
    if (!reachableSwitchIds.has(swId)) {
      isolatedSwitches.push({
        id: sw.id,
        name: sw.name,
        ip: sw.ip,
        model: sw.model,
        vendor: sw.vendor,
        location: sw.location,
        isCrashed: failedSwitchSet.has(swId),
        portsCount: (sw.ports || []).length
      });
    }
  });

  const isolatedSwitchIdSet = new Set(isolatedSwitches.map(s => String(s.id)));

  // 7. Определение затронутых серверов (Blast Radius)
  const isolatedServers = (servers || []).filter(srv => {
    const swId = String(srv.switchId);
    return isolatedSwitchIdSet.has(swId);
  }).map(srv => ({
    id: srv.id,
    name: srv.name || srv.hostname,
    ip: srv.ip,
    role: srv.role || srv.os,
    switchId: srv.switchId
  }));

  // 8. Определение затронутых рабочих мест и IPAM записей
  const isolatedEndpoints = (ipAllocations || []).filter(item => {
    const swId = String(item.switchId || item.connectedSwitchId);
    return isolatedSwitchIdSet.has(swId);
  }).map(item => ({
    id: item.id,
    name: item.hostname || item.ip || item.description,
    ip: item.ip,
    vlanId: item.vlanId,
    type: item.type
  }));

  // 9. Определение затронутых VLAN
  const affectedVlanIds = new Set();
  isolatedSwitches.forEach(sw => {
    const origin = switches.find(s => String(s.id) === String(sw.id));
    (origin?.ports || []).forEach(p => {
      if (p.pvid) affectedVlanIds.add(p.pvid);
      if (Array.isArray(p.taggedVlans)) p.taggedVlans.forEach(v => affectedVlanIds.add(v));
    });
  });
  isolatedServers.forEach(srv => {
    if (srv.vlanId) affectedVlanIds.add(srv.vlanId);
  });
  isolatedEndpoints.forEach(ep => {
    if (ep.vlanId) affectedVlanIds.add(ep.vlanId);
  });

  // 10. Определение перенаправленных линков (RSTP Failover Re-route)
  const reroutedLinks = [];
  normalizedLinks.forEach(l => {
    if (failedLinkSet.has(l.id)) return;
    const baseState = baselineStp.linkStates[l.id];
    const failState = failureStp.linkStates[l.id];

    // Линк был заблокирован STP, но теперь перешёл в Forwarding для спасения сети!
    if (baseState && baseState.isBlocked && failState && failState.isForwarding) {
      const speedStr = String(l.speed || '1G').toUpperCase();
      const capacityMbps = speedStr.includes('10G') ? 10000 : speedStr.includes('40G') ? 40000 : 1000;
      const reroutedTraffic = Number(l.totalMbps || 0) + 450; // Расчётная нагрузка
      const isOverloaded = reroutedTraffic > capacityMbps;

      reroutedLinks.push({
        id: l.id,
        sourceSwitchName: l.sourceSwitch?.name || l.switchAName,
        targetSwitchName: l.targetSwitch?.name || l.switchBName,
        capacityMbps,
        estimatedLoadMbps: reroutedTraffic,
        isOverloaded,
        saturationPercent: Math.round((reroutedTraffic / capacityMbps) * 100)
      });
    }
  });

  // 11. Общий статус инцидента
  let incidentStatus = 'nominal';
  if (failedLinkSet.size > 0 || failedSwitchSet.size > 0) {
    if (isolatedSwitches.length === 0) {
      incidentStatus = 'healed'; // Сеть автоматически перестроилась благодаря RSTP
    } else if (isolatedSwitches.some(s => s.isCrashed && String(s.id) === rootId)) {
      incidentStatus = 'critical'; // Падение ядра сети
    } else {
      incidentStatus = 'partitioned'; // Изоляция сегмента
    }
  }

  const convergenceTime = protocol === 'rstp' ? '0.8–1.2 сек' : '30–50 сек';

  return {
    incidentStatus,
    rootSwitchId: rootId,
    rootSwitchName: rootSwitch?.name || 'Не определен',
    failedLinksCount: failedLinkSet.size,
    failedSwitchesCount: failedSwitchSet.size,
    isolatedSwitches,
    isolatedServers,
    isolatedEndpoints,
    affectedVlanIds: Array.from(affectedVlanIds).sort((a, b) => a - b),
    reroutedLinks,
    convergenceTime,
    hasRstpProtection: reroutedLinks.length > 0,
    totalImpactAssets: isolatedSwitches.length + isolatedServers.length + isolatedEndpoints.length
  };
}
