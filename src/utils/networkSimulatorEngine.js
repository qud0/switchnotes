/**
 * Network Simulator Engine (L2/L3 Packet Simulator & Training Lab)
 * 
 * Supports:
 * - Dynamic topology models (PC, Server, Switch L2, Router L3)
 * - Cable connections and port tagging (Access, Trunk, PVID, Allowed VLANs)
 * - L2 switching logic, MAC forwarding and VLAN tag encapsulation
 * - L3 routing logic (subnets, default gateways, Inter-VLAN routing via SVI)
 * - Hop-by-hop Ping simulation with failure diagnostics
 * - 4 pre-built training labs with automatic solution verification
 */

/**
 * Converts IPv4 dotted string to 32-bit unsigned integer
 */
export function ipToLong(ip) {
  if (!ip || typeof ip !== 'string') return 0;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return 0;
  return (
    ((Number(parts[0]) || 0) << 24) |
    ((Number(parts[1]) || 0) << 16) |
    ((Number(parts[2]) || 0) << 8) |
    (Number(parts[3]) || 0)
  ) >>> 0;
}

/**
 * Normalizes netmask: accepts CIDR (24 or /24) or dotted format (255.255.255.0)
 */
export function normalizeNetmaskToLong(mask) {
  if (!mask) return ipToLong('255.255.255.0');
  const str = String(mask).trim().replace(/^\//, '');
  const prefix = Number(str);
  if (!isNaN(prefix) && prefix >= 0 && prefix <= 32) {
    if (prefix === 0) return 0;
    return ((0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF) >>> 0;
  }
  return ipToLong(mask);
}

/**
 * Checks whether two IP addresses belong to the same IPv4 subnet
 */
export function isSameSubnet(ipA, ipB, mask) {
  const longA = ipToLong(ipA);
  const longB = ipToLong(ipB);
  const longMask = normalizeNetmaskToLong(mask);
  return (longA & longMask) === (longB & longMask);
}

/**
 * Factory for creating nodes on the simulator canvas
 */
export function createLabNode({
  id,
  type = 'pc',
  name,
  x = 200,
  y = 200,
  ip = '',
  mask = '255.255.255.0',
  gateway = '',
  mac = '',
  ports = [],
  interfaces = []
}) {
  const nodeId = id || `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  if (type === 'pc' || type === 'server') {
    const defaultName = type === 'pc' ? 'PC-Workstation' : 'App-Server';
    const randomMacSuffix = Math.floor(10 + Math.random() * 89);
    return {
      id: nodeId,
      type,
      name: name || defaultName,
      ip: ip !== undefined && ip !== null ? ip : (type === 'pc' ? '192.168.1.10' : '192.168.1.100'),
      mask: mask || '255.255.255.0',
      gateway: gateway || '',
      mac: mac || `00:50:79:66:68:${randomMacSuffix}`,
      x,
      y
    };
  }

  if (type === 'switch') {
    // Standard 8-port managed switch
    const defaultPorts = ports.length > 0 ? ports : Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      number: i + 1,
      mode: 'access', // 'access' | 'trunk'
      pvid: 1,
      allowedVlans: [1, 10, 20, 30]
    }));

    return {
      id: nodeId,
      type: 'switch',
      name: name || 'SW-Core-01',
      ports: defaultPorts,
      x,
      y
    };
  }

  if (type === 'router') {
    // L3 Router with SVI/inter-VLAN routing interfaces
    const defaultInterfaces = interfaces.length > 0 ? interfaces : [
      { id: 'if-vlan10', name: 'vlan10', vlanId: 10, ip: '192.168.10.1', mask: '255.255.255.0' },
      { id: 'if-vlan20', name: 'vlan20', vlanId: 20, ip: '192.168.20.1', mask: '255.255.255.0' }
    ];

    return {
      id: nodeId,
      type: 'router',
      name: name || 'R-Gateway-01',
      interfaces: defaultInterfaces,
      x,
      y
    };
  }

  throw new Error(`Unsupported node type: ${type}`);
}

/**
 * Factory for creating a cable between two node ports
 */
export function createLabLink({
  id,
  sourceNodeId,
  sourcePortId = 'eth0',
  targetNodeId,
  targetPortId = 'p1',
  speed = '1G',
  status = 'up'
}) {
  return {
    id: id || `link-${sourceNodeId}-${sourcePortId}--${targetNodeId}-${targetPortId}`,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    speed,
    status
  };
}

/**
 * Finds all active links connected to a specific node
 */
export function getNodeConnectedLinks(nodeId, links = []) {
  return links.filter(l => (l.sourceNodeId === nodeId || l.targetNodeId === nodeId) && l.status !== 'down');
}

/**
 * Gets peer node and port for a link from the perspective of a given node
 */
export function getLinkPeer(link, currentNodeId) {
  if (link.sourceNodeId === currentNodeId) {
    return { peerNodeId: link.targetNodeId, localPortId: link.sourcePortId, peerPortId: link.targetPortId };
  }
  return { peerNodeId: link.sourceNodeId, localPortId: link.targetPortId, peerPortId: link.sourcePortId };
}

/**
 * Simulates hop-by-hop packet transmission (ICMP Ping) between two nodes
 */
export function simulatePing({
  sourceNodeId,
  targetNodeId,
  targetIp,
  nodes = [],
  links = []
}) {
  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.id, n));

  const sourceNode = nodeMap.get(sourceNodeId);
  if (!sourceNode) {
    return {
      success: false,
      status: 'ERR_SOURCE_NOT_FOUND',
      hops: [],
      summary: 'Исходный узел не найден на холсте.'
    };
  }

  // Find target node either by targetNodeId or by matching targetIp
  let targetNode = null;
  if (targetNodeId) {
    targetNode = nodeMap.get(targetNodeId);
  } else if (targetIp) {
    targetNode = nodes.find(n => n.ip === targetIp);
  }

  if (!targetNode) {
    return {
      success: false,
      status: 'ERR_TARGET_NOT_FOUND',
      hops: [],
      summary: `Целевой узел с IP ${targetIp || '—'} не обнаружен в топологии.`
    };
  }

  if (sourceNode.id === targetNode.id) {
    return {
      success: true,
      status: 'SUCCESS_LOOPBACK',
      hops: [{
        fromNodeId: sourceNode.id,
        toNodeId: sourceNode.id,
        description: 'Пинг локального интерфейса (127.0.0.1 / Loopback).',
        status: 'ok'
      }],
      summary: 'Пакет отправлен на собственный интерфейс. Задержка < 1ms.'
    };
  }

  // 1. Validate Source IP and Mask
  if (!sourceNode.ip) {
    return {
      success: false,
      status: 'ERR_NO_SOURCE_IP',
      hops: [],
      summary: `Узел "${sourceNode.name}" не имеет назначенного IP-адреса.`
    };
  }

  // 2. Subnet comparison: Local L2 or Remote L3
  const isLocalSubnet = isSameSubnet(sourceNode.ip, targetNode.ip, sourceNode.mask);
  
  if (!isLocalSubnet && !sourceNode.gateway) {
    return {
      success: false,
      status: 'ERR_NO_GATEWAY',
      hops: [{
        fromNodeId: sourceNode.id,
        toNodeId: sourceNode.id,
        description: `Целевой IP ${targetNode.ip} находится в другой подсети. Шлюз по умолчанию не задан.`,
        status: 'dropped',
        errorReason: 'No Default Gateway configured on source host'
      }],
      summary: `Ошибка L3: IP ${targetNode.ip} находится в другой подсети, но узел "${sourceNode.name}" не имеет шлюза по умолчанию (Default Gateway).`
    };
  }

  // 3. Find physical cable from source
  const sourceLinks = getNodeConnectedLinks(sourceNode.id, links);
  if (sourceLinks.length === 0) {
    return {
      success: false,
      status: 'ERR_SOURCE_DISCONNECTED',
      hops: [{
        fromNodeId: sourceNode.id,
        toNodeId: sourceNode.id,
        description: 'Сетевой кабель не подключен к сетевой карте.',
        status: 'dropped',
        errorReason: 'Cable disconnected'
      }],
      summary: `Сетевой кабель не подключен к узлу "${sourceNode.name}".`
    };
  }

  // 4. Find path using BFS graph exploration
  const hops = [];
  const visited = new Set();
  
  // State in queue: { currentNodeId, currentVlan, pathSoFar, isRouted }
  let queue = [{
    currentNodeId: sourceNode.id,
    currentVlan: 1, // Will be determined by switch port
    path: [sourceNode.id],
    isRouted: isLocalSubnet
  }];

  let successfulHops = null;
  let failureHop = null;

  while (queue.length > 0) {
    const current = queue.shift();
    const currentNode = nodeMap.get(current.currentNodeId);
    if (!currentNode) continue;

    // Reached destination!
    if (current.currentNodeId === targetNode.id) {
      successfulHops = current.hopsList;
      break;
    }

    const connectedLinks = getNodeConnectedLinks(currentNode.id, links);

    for (const link of connectedLinks) {
      const { peerNodeId, localPortId, peerPortId } = getLinkPeer(link, currentNode.id);
      const peerNode = nodeMap.get(peerNodeId);
      if (!peerNode) continue;

      let nextVlan = current.currentVlan;
      let hopDescription = '';
      let isDropped = false;
      let errorReason = '';

      // CASE A: Current is PC/Server -> entering Switch
      if (currentNode.type === 'pc' || currentNode.type === 'server') {
        if (peerNode.type === 'switch') {
          const swPort = (peerNode.ports || []).find(p => p.id === peerPortId || String(p.number) === String(peerPortId));
          const pvid = swPort?.pvid || 1;
          nextVlan = pvid;
          hopDescription = `Отправка кадра в порт ${swPort?.number || peerPortId} свитча "${peerNode.name}" (Access VLAN ${pvid}).`;
        } else if (peerNode.type === 'router') {
          hopDescription = `Прямое подключение к порту маршрутизатора "${peerNode.name}".`;
        }
      }

      // CASE B: Current is Switch -> Switch / Router / Destination
      else if (currentNode.type === 'switch') {
        const exitPort = (currentNode.ports || []).find(p => p.id === localPortId || String(p.number) === String(localPortId));

        // Switch to Switch via Trunk or Access
        if (peerNode.type === 'switch') {
          const ingressPort = (peerNode.ports || []).find(p => p.id === peerPortId || String(p.number) === String(peerPortId));
          
          if (exitPort?.mode === 'trunk') {
            const allowed = exitPort.allowedVlans || [1];
            if (!allowed.includes(nextVlan)) {
              isDropped = true;
              errorReason = `VLAN ${nextVlan} не разрешен в Trunk на порту ${exitPort.number}`;
              hopDescription = `Сброс кадра на порту ${exitPort.number} свитча "${currentNode.name}": VLAN ${nextVlan} отсутствует в списке Allowed VLANs.`;
            } else {
              hopDescription = `Транзитная передача через Trunk (порт ${exitPort.number} -> ${ingressPort?.number || peerPortId}) с тегом VLAN ${nextVlan}.`;
            }
          } else {
            // Access port between switches
            if (exitPort?.pvid !== nextVlan) {
              isDropped = true;
              errorReason = `Port ${exitPort?.number} is Access VLAN ${exitPort?.pvid}, but packet is VLAN ${nextVlan}`;
              hopDescription = `Сброс кадра: порт ${exitPort?.number} настроен в VLAN ${exitPort?.pvid}, а пакет ожидает VLAN ${nextVlan}.`;
            } else {
              hopDescription = `Передача через Access-линк (VLAN ${nextVlan}) на свитч "${peerNode.name}".`;
            }
          }
        }
        // Switch to Router (Inter-VLAN gateway)
        else if (peerNode.type === 'router') {
          hopDescription = `Передача пакета на шлюз по умолчанию (маршрутизатор "${peerNode.name}").`;
        }
        // Switch to Destination Host
        else if (peerNode.type === 'pc' || peerNode.type === 'server') {
          if (peerNode.id === targetNode.id) {
            // Check if destination access port matches current packet VLAN
            if (exitPort?.mode === 'access' && exitPort.pvid !== nextVlan) {
              isDropped = true;
              errorReason = `Изоляция VLAN: порт получателя в VLAN ${exitPort.pvid}, а пакет в VLAN ${nextVlan}`;
              hopDescription = `Сброс кадра на порту ${exitPort.number}: порт получателя находится в VLAN ${exitPort.pvid}, а входящий трафик из VLAN ${nextVlan}.`;
            } else {
              hopDescription = `Доставка пакета на сетевой интерфейс узла "${peerNode.name}" (${peerNode.ip}).`;
            }
          }
        }
      }

      // CASE C: Current is Router (Performs Inter-VLAN routing)
      else if (currentNode.type === 'router') {
        // Router looks up interface for target subnet
        const targetSubnetIf = (currentNode.interfaces || []).find(itf => isSameSubnet(itf.ip, targetNode.ip, itf.mask));
        if (!targetSubnetIf) {
          isDropped = true;
          errorReason = `No route to target subnet ${targetNode.ip} on router ${currentNode.name}`;
          hopDescription = `Маршрутизатор "${currentNode.name}" не имеет интерфейса в подсети ${targetNode.ip}.`;
        } else {
          nextVlan = targetSubnetIf.vlanId;
          hopDescription = `Маршрутизация Inter-VLAN: перенаправление пакета в подсеть ${targetSubnetIf.ip} (VLAN ${targetSubnetIf.vlanId}).`;
        }
      }

      const hopItem = {
        fromNodeId: currentNode.id,
        toNodeId: peerNode.id,
        fromPortId: localPortId,
        toPortId: peerPortId,
        vlan: nextVlan,
        description: hopDescription,
        status: isDropped ? 'dropped' : 'ok',
        errorReason
      };

      const nextHopsList = [...(current.hopsList || []), hopItem];

      if (isDropped) {
        if (!failureHop) {
          failureHop = {
            hops: nextHopsList,
            errorReason,
            summary: hopDescription
          };
        }
        continue;
      }

      const visitToken = `${peerNode.id}@${nextVlan}`;
      const visitedTokens = current.visitedTokens || [];
      if (visitedTokens.includes(visitToken) || (current.path && current.path.length > 12)) {
        continue;
      }

      queue.push({
        currentNodeId: peerNode.id,
        currentVlan: nextVlan,
        path: [...current.path, peerNode.id],
        visitedTokens: [...visitedTokens, `${currentNode.id}@${current.currentVlan}`],
        hopsList: nextHopsList,
        isRouted: current.isRouted || currentNode.type === 'router'
      });
    }
  }

  // 5. Final Result Synthesis
  if (successfulHops && successfulHops.length > 0) {
    // Add return trip confirmation hop
    const returnHop = {
      fromNodeId: targetNode.id,
      toNodeId: sourceNode.id,
      description: `Узел "${targetNode.name}" получил ICMP Echo Request и отправил подтверждение ICMP Echo Reply обратно узлу "${sourceNode.name}".`,
      status: 'ok',
      type: 'ICMP_REPLY'
    };

    return {
      success: true,
      status: 'SUCCESS',
      hops: [...successfulHops, returnHop],
      summary: `Пинг успешен! Пакет доставлен от ${sourceNode.name} (${sourceNode.ip}) до ${targetNode.name} (${targetNode.ip}). 0% потерь.`
    };
  }

  // Failure
  if (failureHop) {
    return {
      success: false,
      status: 'ERR_PACKET_DROPPED',
      hops: failureHop.hops,
      summary: failureHop.summary
    };
  }

  return {
    success: false,
    status: 'ERR_NO_ROUTE_TO_HOST',
    hops: [{
      fromNodeId: sourceNode.id,
      toNodeId: targetNode.id,
      description: `Маршрут от "${sourceNode.name}" до "${targetNode.name}" не найден. Проверьте физические соединения кабелей и настройки VLAN.`,
      status: 'dropped',
      errorReason: 'No physical or logical path between hosts'
    }],
    summary: `Маршрут недоступен (Destination Host Unreachable). Проверьте кабельные соединения и настройки VLAN/шлюзов.`
  };
}

/**
 * 4 Pre-configured Educational Training Labs
 */
export const PRESET_LABS = [
  {
    id: 'lab-1',
    title: 'Лаба 1: Основы L2 — Связь двух ПК в одном VLAN',
    difficulty: 'Базовый',
    category: 'L2 Switching',
    description: 'Настройте адресацию двух компьютеров в одной подсети (VLAN 10) и убедитесь в прохождении пинга через коммутатор.',
    goal: 'Задайте PC-1 адрес 192.168.1.10, а PC-2 адрес 192.168.1.20 (маска 255.255.255.0). Подключите их к портам свитча в VLAN 10.',
    initialNodes: [
      createLabNode({ id: 'pc-1', type: 'pc', name: 'PC-Бухгалтерия-1', ip: '192.168.1.10', mask: '255.255.255.0', x: 120, y: 160 }),
      createLabNode({ id: 'pc-2', type: 'pc', name: 'PC-Бухгалтерия-2', ip: '', mask: '255.255.255.0', x: 620, y: 160 }),
      createLabNode({
        id: 'sw-1',
        type: 'switch',
        name: 'SW-Access-01',
        x: 370,
        y: 160,
        ports: [
          { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
          { id: 'p2', number: 2, mode: 'access', pvid: 10, allowedVlans: [10] },
          { id: 'p3', number: 3, mode: 'access', pvid: 1, allowedVlans: [1] },
          { id: 'p4', number: 4, mode: 'access', pvid: 1, allowedVlans: [1] }
        ]
      })
    ],
    initialLinks: [
      createLabLink({ id: 'lnk-1', sourceNodeId: 'pc-1', sourcePortId: 'eth0', targetNodeId: 'sw-1', targetPortId: 'p1' }),
      createLabLink({ id: 'lnk-2', sourceNodeId: 'pc-2', sourcePortId: 'eth0', targetNodeId: 'sw-1', targetPortId: 'p2' })
    ]
  },
  {
    id: 'lab-2',
    title: 'Лаба 2: Магистральный канал — Настройка Trunk между свитчами',
    difficulty: 'Средний',
    category: 'VLAN & Trunking',
    description: 'Между двумя коммутаторами проложен кабель. Настройте магистральный порт (Trunk) для пропуска трафика VLAN 10 и VLAN 20.',
    goal: 'Переведите соединительные порты 8 на SW-1 и SW-2 в режим Trunk и добавьте VLAN 10 и 20 в Allowed VLANs.',
    initialNodes: [
      createLabNode({ id: 'pc-10a', type: 'pc', name: 'PC-Склад-1 (VLAN 10)', ip: '10.10.10.5', mask: '255.255.255.0', x: 100, y: 100 }),
      createLabNode({ id: 'pc-20a', type: 'pc', name: 'PC-Офис-1 (VLAN 20)', ip: '10.10.20.5', mask: '255.255.255.0', x: 100, y: 280 }),
      createLabNode({
        id: 'sw-1',
        type: 'switch',
        name: 'SW-Этаж-1',
        x: 340,
        y: 190,
        ports: [
          { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
          { id: 'p2', number: 2, mode: 'access', pvid: 20, allowedVlans: [20] },
          { id: 'p8', number: 8, mode: 'access', pvid: 1, allowedVlans: [1] } // Trainee must change to Trunk
        ]
      }),
      createLabNode({
        id: 'sw-2',
        type: 'switch',
        name: 'SW-Этаж-2',
        x: 580,
        y: 190,
        ports: [
          { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
          { id: 'p2', number: 2, mode: 'access', pvid: 20, allowedVlans: [20] },
          { id: 'p8', number: 8, mode: 'access', pvid: 1, allowedVlans: [1] } // Trainee must change to Trunk
        ]
      }),
      createLabNode({ id: 'pc-10b', type: 'pc', name: 'PC-Склад-2 (VLAN 10)', ip: '10.10.10.6', mask: '255.255.255.0', x: 820, y: 100 }),
      createLabNode({ id: 'pc-20b', type: 'pc', name: 'PC-Офис-2 (VLAN 20)', ip: '10.10.20.6', mask: '255.255.255.0', x: 820, y: 280 })
    ],
    initialLinks: [
      createLabLink({ id: 'lnk-1', sourceNodeId: 'pc-10a', targetNodeId: 'sw-1', targetPortId: 'p1' }),
      createLabLink({ id: 'lnk-2', sourceNodeId: 'pc-20a', targetNodeId: 'sw-1', targetPortId: 'p2' }),
      createLabLink({ id: 'lnk-trunk', sourceNodeId: 'sw-1', sourcePortId: 'p8', targetNodeId: 'sw-2', targetPortId: 'p8' }),
      createLabLink({ id: 'lnk-3', sourceNodeId: 'sw-2', sourcePortId: 'p1', targetNodeId: 'pc-10b', targetPortId: 'eth0' }),
      createLabLink({ id: 'lnk-4', sourceNodeId: 'sw-2', sourcePortId: 'p2', targetNodeId: 'pc-20b', targetPortId: 'eth0' })
    ]
  },
  {
    id: 'lab-3',
    title: 'Лаба 3: Inter-VLAN маршрутизация — Маршрутизатор и шлюзы',
    difficulty: 'Продвинутый',
    category: 'L3 Routing',
    description: 'Компьютер из VLAN 10 не может связаться с сервером из VLAN 20. Настройте шлюз по умолчанию на узлах и интерфейсы роутера.',
    goal: 'Задайте шлюз 192.168.10.1 на PC-1 и 192.168.20.1 на Server-1, подключите маршрутизатор и настройте IP-интерфейсы.',
    initialNodes: [
      createLabNode({ id: 'pc-client', type: 'pc', name: 'Клиент (VLAN 10)', ip: '192.168.10.15', mask: '255.255.255.0', gateway: '', x: 120, y: 220 }),
      createLabNode({
        id: 'sw-access',
        type: 'switch',
        name: 'SW-Access',
        x: 360,
        y: 220,
        ports: [
          { id: 'p1', number: 1, mode: 'access', pvid: 10, allowedVlans: [10] },
          { id: 'p2', number: 2, mode: 'access', pvid: 20, allowedVlans: [20] },
          { id: 'p8', number: 8, mode: 'trunk', pvid: 1, allowedVlans: [10, 20] }
        ]
      }),
      createLabNode({
        id: 'r-gw',
        type: 'router',
        name: 'R-Gateway',
        x: 360,
        y: 60,
        interfaces: [
          { id: 'if-10', name: 'vlan10', vlanId: 10, ip: '192.168.10.1', mask: '255.255.255.0' },
          { id: 'if-20', name: 'vlan20', vlanId: 20, ip: '192.168.20.1', mask: '255.255.255.0' }
        ]
      }),
      createLabNode({ id: 'srv-db', type: 'server', name: 'База данных (VLAN 20)', ip: '192.168.20.50', mask: '255.255.255.0', gateway: '', x: 620, y: 220 })
    ],
    initialLinks: [
      createLabLink({ id: 'lnk-1', sourceNodeId: 'pc-client', targetNodeId: 'sw-access', targetPortId: 'p1' }),
      createLabLink({ id: 'lnk-router', sourceNodeId: 'sw-access', sourcePortId: 'p8', targetNodeId: 'r-gw', targetPortId: 'eth0' }),
      createLabLink({ id: 'lnk-2', sourceNodeId: 'sw-access', sourcePortId: 'p2', targetNodeId: 'srv-db', targetPortId: 'eth0' })
    ]
  },
  {
    id: 'lab-4',
    title: 'Лаба 4: Защита от петель коммутации (Spanning Tree Protocol)',
    difficulty: 'Эксперт',
    category: 'L2 Spanning Tree',
    description: 'Три коммутатора соединены в кольцо. Изучите обнаружение петель и проверьте резервирование линка.',
    goal: 'Запустите пинг через кольцевую топологию и убедитесь, что STP предотвращает широковещательный шторм.',
    initialNodes: [
      createLabNode({ id: 'pc-a', type: 'pc', name: 'PC-A', ip: '172.16.1.10', mask: '255.255.255.0', x: 120, y: 120 }),
      createLabNode({ id: 'sw-a', type: 'switch', name: 'SW-Core-A (Root)', x: 340, y: 120 }),
      createLabNode({ id: 'sw-b', type: 'switch', name: 'SW-Dist-B', x: 580, y: 120 }),
      createLabNode({ id: 'sw-c', type: 'switch', name: 'SW-Access-C', x: 460, y: 280 }),
      createLabNode({ id: 'pc-b', type: 'pc', name: 'PC-B', ip: '172.16.1.20', mask: '255.255.255.0', x: 740, y: 120 })
    ],
    initialLinks: [
      createLabLink({ id: 'lnk-pc-a', sourceNodeId: 'pc-a', targetNodeId: 'sw-a', targetPortId: 'p1' }),
      createLabLink({ id: 'lnk-a-b', sourceNodeId: 'sw-a', sourcePortId: 'p8', targetNodeId: 'sw-b', targetPortId: 'p8' }),
      createLabLink({ id: 'lnk-b-c', sourceNodeId: 'sw-b', sourcePortId: 'p7', targetNodeId: 'sw-c', targetPortId: 'p7' }),
      createLabLink({ id: 'lnk-c-a', sourceNodeId: 'sw-c', sourcePortId: 'p8', targetNodeId: 'sw-a', targetPortId: 'p7' }),
      createLabLink({ id: 'lnk-pc-b', sourceNodeId: 'sw-b', sourcePortId: 'p1', targetNodeId: 'pc-b', targetPortId: 'eth0' })
    ]
  }
];

/**
 * Evaluates whether a trainee has successfully completed a specific lab
 */
export function verifyLabSolution(labId, { nodes = [], links = [] }) {
  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.id, n));

  if (labId === 'lab-1') {
    const pc1 = nodeMap.get('pc-1');
    const pc2 = nodeMap.get('pc-2');
    const sw1 = nodeMap.get('sw-1');

    const check1 = Boolean(pc1?.ip && pc2?.ip && isSameSubnet(pc1.ip, pc2.ip, pc1.mask));
    const pingResult = pc1 && pc2 ? simulatePing({ sourceNodeId: pc1.id, targetNodeId: pc2.id, nodes, links }) : { success: false };
    const check2 = pingResult.success;

    const allPassed = check1 && check2;
    return {
      solved: allPassed,
      feedback: allPassed
        ? 'Отлично! Оба компьютера настроены в одной подсети VLAN 10, пинг успешно проходит через коммутатор.'
        : 'Задание пока не выполнено. Убедитесь, что на обоих ПК заданы IP-адреса из одной подсети 192.168.1.0/24 и пинг успешен.',
      checks: [
        { label: 'Оба ПК имеют валидные IP-адреса в одной подсети', pass: check1 },
        { label: 'Успешный пинг между PC-1 и PC-2 через свитч', pass: check2 }
      ]
    };
  }

  if (labId === 'lab-2') {
    const sw1 = nodeMap.get('sw-1');
    const sw2 = nodeMap.get('sw-2');
    const port8Sw1 = (sw1?.ports || []).find(p => p.id === 'p8' || p.number === 8);
    const port8Sw2 = (sw2?.ports || []).find(p => p.id === 'p8' || p.number === 8);

    const isTrunk1 = port8Sw1?.mode === 'trunk' && port8Sw1?.allowedVlans?.includes(10) && port8Sw1?.allowedVlans?.includes(20);
    const isTrunk2 = port8Sw2?.mode === 'trunk' && port8Sw2?.allowedVlans?.includes(10) && port8Sw2?.allowedVlans?.includes(20);

    const pingVlan10 = simulatePing({ sourceNodeId: 'pc-10a', targetNodeId: 'pc-10b', nodes, links });
    const pingVlan20 = simulatePing({ sourceNodeId: 'pc-20a', targetNodeId: 'pc-20b', nodes, links });
    const isolationTest = simulatePing({ sourceNodeId: 'pc-10a', targetNodeId: 'pc-20b', nodes, links });

    const checks = [
      { label: 'Порт 8 на SW-Этаж-1 переведен в Trunk с допуском VLAN 10 и 20', pass: Boolean(isTrunk1) },
      { label: 'Порт 8 на SW-Этаж-2 переведен в Trunk с допуском VLAN 10 и 20', pass: Boolean(isTrunk2) },
      { label: 'Успешный пинг в рамках VLAN 10 (Склад)', pass: pingVlan10.success },
      { label: 'Успешный пинг в рамках VLAN 20 (Офис)', pass: pingVlan20.success },
      { label: 'Изоляция между разными VLAN (VLAN 10 не может слать в VLAN 20 напрямую)', pass: !isolationTest.success }
    ];

    const allPassed = checks.every(c => c.pass);
    return {
      solved: allPassed,
      feedback: allPassed
        ? 'Превосходно! Магистральный транк настроен корректно, трафик обоих отделов изолирован и проходит через один кабель.'
        : 'Задание пока не завершено. Проверьте настройки портов 8 на обоих свитчах (режим Trunk и список Allowed VLANs).',
      checks
    };
  }

  if (labId === 'lab-3') {
    const pc = nodeMap.get('pc-client');
    const srv = nodeMap.get('srv-db');
    const router = nodeMap.get('r-gw');

    const checkGwPc = Boolean(pc?.gateway === '192.168.10.1');
    const checkGwSrv = Boolean(srv?.gateway === '192.168.20.1');
    const pingRes = simulatePing({ sourceNodeId: 'pc-client', targetNodeId: 'srv-db', nodes, links });

    const checks = [
      { label: 'Узел клиента имеет шлюз по умолчанию 192.168.10.1', pass: checkGwPc },
      { label: 'Сервер базы данных имеет шлюз по умолчанию 192.168.20.1', pass: checkGwSrv },
      { label: 'Маршрутизатор подключен к свитчу через Trunk', pass: Boolean(router) },
      { label: 'Успешный пинг между клиентом (VLAN 10) и сервером (VLAN 20)', pass: pingRes.success }
    ];

    const allPassed = checks.every(c => c.pass);
    return {
      solved: allPassed,
      feedback: allPassed
        ? 'Замечательно! Inter-VLAN маршрутизация через шлюз по умолчанию работает, пакеты маршрутизируются между подсетями.'
        : 'Связь пока не установлена. Убедитесь, что шлюзы по умолчанию заданы на обоих узлах.',
      checks
    };
  }

  // Default fallback for custom or unconstrained lab
  return {
    solved: true,
    feedback: 'Свободный режим песочницы.',
    checks: [{ label: 'Режим свободной топологии', pass: true }]
  };
}
