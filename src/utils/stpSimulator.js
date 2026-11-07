/**
 * stpSimulator.js
 * Алгоритм Spanning Tree Protocol (IEEE 802.1D STP / IEEE 802.1w RSTP)
 * Расчёт Root Bridge, стоимости путей (Path Cost), ролей портов (Root Port, Designated, Alternate/Blocked)
 * и симуляция отказоустойчивости при обрыве линков (Failover).
 */

// Стандартные стоимости портов по IEEE 802.1w (RSTP / 802.1D-2004)
export const SPEED_PATH_COSTS = {
  '10M': 100,
  '100M': 19,
  '1G': 4,
  '10G': 2,
  '25G': 1,
  '40G': 1,
  '100G': 1
};

export function getPortPathCost(port) {
  if (!port) return 4;
  const speed = (port.speed || port.type || '1G').toUpperCase();
  if (speed.includes('100G')) return 1;
  if (speed.includes('40G')) return 1;
  if (speed.includes('25G')) return 1;
  if (speed.includes('10G') || speed.includes('SFP+')) return 2;
  if (speed.includes('100M') || speed.includes('FE')) return 19;
  if (speed.includes('10M')) return 100;
  return 4; // 1G default
}

/**
 * Извлекает все межкоммутаторные соединения (L2 линки)
 */
export function extractTopologyLinks(switches = []) {
  const switchMap = new Map();
  switches.forEach(sw => switchMap.set(String(sw.id), sw));

  const links = [];
  const linkKeySet = new Set();

  switches.forEach(swA => {
    (swA.ports || []).forEach(portA => {
      if (!portA.connectedSwitchId) return;
      const swB = switchMap.get(String(portA.connectedSwitchId));
      if (!swB) return;

      const portB = (swB.ports || []).find(p => 
        String(p.connectedSwitchId) === String(swA.id) &&
        (String(p.connectedPortNumber) === String(portA.number) ||
         String(p.connectedPortName) === String(portA.name) ||
         String(p.name) === String(portA.connectedPortName) ||
         String(p.number) === String(portA.connectedPortNumber))
      ) || (swB.ports || []).find(p => String(p.connectedSwitchId) === String(swA.id));

      const swAId = String(swA.id);
      const swBId = String(swB.id);
      const pANum = portA.number || 0;
      const pBNum = portB ? portB.number : 0;

      // Нормализованный уникальный ключ линка
      const key = swAId < swBId ? `${swAId}:${pANum}-${swBId}:${pBNum}` : `${swBId}:${pBNum}-${swAId}:${pANum}`;
      if (linkKeySet.has(key)) return;
      linkKeySet.add(key);

      const cost = Math.min(getPortPathCost(portA), getPortPathCost(portB));

      links.push({
        id: `link-${key}`,
        switchAId: swAId,
        switchBId: swBId,
        switchAName: swA.name,
        switchBName: swB.name,
        portA: portA,
        portB: portB || { number: pBNum, name: `Port ${pBNum}` },
        cost,
        speed: portA.speed || '1G',
        vlan: portA.pvid || 1
      });
    });
  });

  return links;
}

/**
 * Расчёт топологии Spanning Tree
 * @param {Array} switches Список коммутаторов
 * @param {Array} links Список линков (полученный через extractTopologyLinks)
 * @param {string|null} manualRootId Выбранный вручную Root Bridge (или null для автовыбора)
 * @param {Set|Array} disabledLinkIds Набор ID линков, которые сейчас "оборваны" (симуляция)
 * @param {string} protocol 'rstp' | 'stp'
 */
export function calculateSpanningTree({
  switches = [],
  links = [],
  manualRootId = null,
  disabledLinkIds = new Set(),
  protocol = 'rstp'
}) {
  if (!switches || switches.length === 0) {
    return {
      rootBridgeId: null,
      rootBridge: null,
      switchStates: {},
      linkStates: {},
      loopsDetected: false,
      loopPaths: [],
      activeLinksCount: 0,
      blockedLinksCount: 0,
      convergenceTime: '0 ms'
    };
  }

  const disabledSet = new Set(Array.from(disabledLinkIds || []));
  const activeLinks = links.filter(l => !disabledSet.has(l.id));

  // 1. Выбор Root Bridge (Приоритет: ручной выбор -> минимальный priority -> минимальный MAC/ID)
  let rootBridge = null;
  if (manualRootId) {
    rootBridge = switches.find(s => String(s.id) === String(manualRootId));
  }

  if (!rootBridge) {
    // Сортировка: наименьший priority (например 4096 < 32768), затем по IP/MAC
    const sorted = [...switches].sort((a, b) => {
      const prioA = Number(a.stpPriority) || 32768;
      const prioB = Number(b.stpPriority) || 32768;
      if (prioA !== prioB) return prioA - prioB;
      const macA = (a.mac || a.ip || a.name || '').toLowerCase();
      const macB = (b.mac || b.ip || b.name || '').toLowerCase();
      return macA.localeCompare(macB);
    });
    rootBridge = sorted[0];
  }

  const rootBridgeId = rootBridge ? String(rootBridge.id) : null;

  // 2. Построение графа смежности
  const adj = new Map();
  switches.forEach(sw => adj.set(String(sw.id), []));

  activeLinks.forEach(link => {
    if (adj.has(link.switchAId) && adj.has(link.switchBId)) {
      adj.get(link.switchAId).push({ neighborId: link.switchBId, link, portMine: link.portA, portPeer: link.portB });
      adj.get(link.switchBId).push({ neighborId: link.switchAId, link, portMine: link.portB, portPeer: link.portA });
    }
  });

  // 3. Алгоритм Дейкстры для поиска кратчайших путей (Root Path Cost) от Root Bridge
  const dist = new Map();
  const prevNode = new Map();
  const rootPortMap = new Map(); // switchId -> link
  const visited = new Set();

  switches.forEach(sw => {
    dist.set(String(sw.id), Infinity);
  });

  if (rootBridgeId && dist.has(rootBridgeId)) {
    dist.set(rootBridgeId, 0);
  }

  // Dijkstra
  while (visited.size < switches.length) {
    let u = null;
    let minD = Infinity;

    for (const sw of switches) {
      const swId = String(sw.id);
      if (!visited.has(swId) && dist.get(swId) < minD) {
        minD = dist.get(swId);
        u = swId;
      }
    }

    if (u === null || minD === Infinity) break;
    visited.add(u);

    const neighbors = adj.get(u) || [];
    for (const edge of neighbors) {
      const v = edge.neighborId;
      if (visited.has(v)) continue;

      const alt = dist.get(u) + edge.link.cost;
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prevNode.set(v, u);
        rootPortMap.set(v, {
          linkId: edge.link.id,
          portNumber: edge.portPeer?.number,
          portName: edge.portPeer?.name
        });
      }
    }
  }

  // 4. Определение ролей портов и статуса линков:
  // - Root Port (RP): Порт на non-root свитче, ведущий к Root с минимальной стоимостью.
  // - Designated Port (DP): Порт сегмента, имеющий лучший путь к Root.
  // - Alternate / Blocked Port (BLK / Discarding): Все остальные порты для разрыва петель.
  const linkStates = {};
  const spanningTreeLinks = new Set();

  // Добавляем все линки, входящие в кратчайшее дерево путей (Shortest Path Tree)
  switches.forEach(sw => {
    const swId = String(sw.id);
    if (swId === rootBridgeId) return;
    const rpInfo = rootPortMap.get(swId);
    if (rpInfo) {
      spanningTreeLinks.add(rpInfo.linkId);
    }
  });

  let activeLinksCount = 0;
  let blockedLinksCount = 0;

  links.forEach(link => {
    const isDisabled = disabledSet.has(link.id);
    if (isDisabled) {
      linkStates[link.id] = {
        status: 'failed', // Разорванный пользователем
        roleA: 'Disabled',
        roleB: 'Disabled',
        isForwarding: false,
        isBlocked: false,
        isFailed: true,
        reason: 'Линк физически оборван (симуляция аварии)'
      };
      return;
    }

    const isTreeLink = spanningTreeLinks.has(link.id);

    if (isTreeLink) {
      // Это активная ветвь STP дерева (Forwarding)
      const costA = dist.get(link.switchAId);
      const costB = dist.get(link.switchBId);

      let roleA = 'DP';
      let roleB = 'RP';
      if (costA > costB) {
        roleA = 'RP';
        roleB = 'DP';
      }

      linkStates[link.id] = {
        status: 'forwarding',
        roleA: link.switchAId === rootBridgeId ? 'DP' : roleA,
        roleB: link.switchBId === rootBridgeId ? 'DP' : roleB,
        isForwarding: true,
        isBlocked: false,
        isFailed: false,
        reason: 'Активный маршрут STP (Forwarding)'
      };
      activeLinksCount++;
    } else {
      // Это избыточный линк, который заблокирован STP для предотвращения петли (Discarding)
      const costA = dist.get(link.switchAId);
      const costB = dist.get(link.switchBId);

      let roleA = 'DP';
      let roleB = 'Alternate (BLK)';
      if (costA > costB) {
        roleA = 'Alternate (BLK)';
        roleB = 'DP';
      }

      linkStates[link.id] = {
        status: 'discarding',
        roleA,
        roleB,
        isForwarding: false,
        isBlocked: true,
        isFailed: false,
        reason: 'Заблокирован STP (Discarding/Blocking) для разрыва L2 петли'
      };
      blockedLinksCount++;
    }
  });

  // 5. Проверка наличия петель (Broadcast Storm Loops)
  // Если бы STP был выключен, были бы циклы?
  const loopsDetected = blockedLinksCount > 0;

  // Оценка времени сходимости (Convergence Time)
  const convergenceTime = protocol === 'rstp' 
    ? (disabledSet.size > 0 ? '~1.2 сек (RSTP Fast Convergence)' : '< 50 мс')
    : (disabledSet.size > 0 ? '30-50 сек (Classic 802.1D Listening/Learning)' : '< 100 мс');

  // Состояние каждого свитча в STP
  const switchStates = {};
  switches.forEach(sw => {
    const swId = String(sw.id);
    const isRoot = swId === rootBridgeId;
    const pathCost = dist.get(swId);
    const rp = rootPortMap.get(swId);

    switchStates[swId] = {
      isRoot,
      pathCost: isRoot ? 0 : (pathCost === Infinity ? 'Unreachable' : pathCost),
      rootPort: rp ? rp.portName : null,
      priority: Number(sw.stpPriority) || (isRoot ? 4096 : 32768),
      bridgeId: `${Number(sw.stpPriority) || (isRoot ? 4096 : 32768)}.${sw.mac || sw.ip || '00:00:00:00'}`
    };
  });

  return {
    rootBridgeId,
    rootBridge,
    switchStates,
    linkStates,
    loopsDetected,
    activeLinksCount,
    blockedLinksCount,
    convergenceTime,
    totalLinksCount: links.length
  };
}
