/**
 * blastRadius.js
 * Сервис анализа зоны поражения (Blast Radius / Impact Analysis) при операциях с портами коммутаторов.
 * Анализирует:
 * - Каскад нижестоящих коммутаторов (Downstream switch graph).
 * - Критические серверы, СУБД, 1С, контроллеры домена из IPAM и реестра серверов.
 * - Устройства на объекте: IP-камеры CCTV, точки доступа Wi-Fi, телефоны.
 * - Затронутые VLAN (Native и Tagged Trunk).
 * Вычисляет уровень риска (Critical / High / Medium / Low) и формирует отчет перед отключением.
 */

export function calculatePortBlastRadius({
  switchData,
  port,
  allSwitches = [],
  ipAllocations = [],
  servers = [],
  vlans = []
}) {
  if (!switchData || !port) {
    return {
      riskLevel: 'low',
      hasDownstreamSwitches: false,
      downstreamSwitches: [],
      connectedDevices: [],
      impactedVlans: [],
      totalAffectedCount: 0,
      summaryMessage: 'Порт не выбран'
    };
  }

  const vlanMap = {};
  vlans.forEach(v => {
    vlanMap[v.id] = v;
  });

  const swMap = {};
  allSwitches.forEach(s => {
    swMap[s.id] = s;
  });

  const isTrunk = port.mode === 'trunk';
  const isSfp = port.type === 'sfp';
  const portDesc = (port.description || '').toLowerCase();
  const portConn = (port.connectedTo || '').toLowerCase();

  // 1. Поиск нижестоящих коммутаторов по графу топологии (BFS обход)
  const downstreamSwitches = [];
  const visitedSwitches = new Set([switchData.id]);
  const queue = [];

  // Если у порта есть прямая привязка к коммутатору через linkedSwitchId
  if (port.linkedSwitchId && swMap[port.linkedSwitchId]) {
    queue.push(swMap[port.linkedSwitchId]);
  } else {
    // Поиск по текстовому совпадению в connectedTo
    const matchedSw = allSwitches.find(s => 
      s.id !== switchData.id && 
      (portConn.includes(s.name.toLowerCase()) || portConn.includes(s.id.toLowerCase()))
    );
    if (matchedSw) queue.push(matchedSw);
  }

  let totalDownstreamActivePorts = 0;
  let totalCctv = 0;
  let totalAp = 0;
  let totalServers = 0;
  let totalUsers = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visitedSwitches.has(current.id)) continue;
    visitedSwitches.add(current.id);

    const ports = current.ports || [];
    const activePorts = ports.filter(p => p.enabled !== false && (p.connectedTo || p.linkedSwitchId));
    totalDownstreamActivePorts += activePorts.length;

    let swCctv = 0;
    let swAp = 0;
    let swServer = 0;
    let swUsers = 0;

    ports.forEach(p => {
      const text = `${p.description || ''} ${p.connectedTo || ''}`.toLowerCase();
      if (/cctv|cam|камер|видео|nvr|dvr|скуд|турникет/.test(text)) {
        swCctv++;
      } else if (/ap|wifi|wi-fi|u6|unifi|точка/.test(text)) {
        swAp++;
      } else if (/srv|server|сервер|1c|1с|db|dc|sql|pve|esxi|nas|synology|хранилищ/.test(text)) {
        swServer++;
      } else if (p.connectedTo) {
        swUsers++;
      }

      // Каскадный поиск следующего уровня коммутаторов
      if (p.linkedSwitchId && !visitedSwitches.has(p.linkedSwitchId) && swMap[p.linkedSwitchId]) {
        queue.push(swMap[p.linkedSwitchId]);
      }
    });

    totalCctv += swCctv;
    totalAp += swAp;
    totalServers += swServer;
    totalUsers += swUsers;

    downstreamSwitches.push({
      id: current.id,
      name: current.name,
      model: current.model || current.vendor,
      ip: current.ip,
      location: current.location || 'Стойка',
      totalPorts: ports.length,
      activePortsCount: activePorts.length,
      cctvCount: swCctv,
      apCount: swAp,
      serverCount: swServer,
      userCount: swUsers
    });
  }

  // 2. Поиск напрямую подключенных серверов и хостов из IPAM
  const connectedDevices = [];
  const switchPortKeys = [
    `${switchData.id}:${port.id}`,
    `${switchData.id}:${port.number}`,
    `${switchData.name}:${port.name}`,
    `${switchData.name}:${port.id}`,
    `${switchData.name} (${port.name})`,
    `${switchData.name} (${port.id})`
  ].map(k => k.toLowerCase());

  // Проверка IPAM записей
  ipAllocations.forEach(ip => {
    const conn = (ip.connectedTo || '').toLowerCase();
    const isDirectMatch = switchPortKeys.some(k => conn.includes(k)) || 
      (conn.includes(switchData.name.toLowerCase()) && conn.includes(String(port.number)));

    if (isDirectMatch) {
      const isCritical = /server|gateway|core|dc|1c|1с|db|sql|nvr/.test(ip.type || '') ||
        /dc|srv|1c|1с|postgres|sql|gateway|шлюз|synology|nas/.test((ip.hostname || '').toLowerCase());

      connectedDevices.push({
        name: ip.hostname || `Узел ${ip.ip}`,
        ip: ip.ip,
        type: ip.type || 'server',
        description: ip.description || ip.location || '',
        isCritical
      });
    }
  });

  // Проверка реестра серверов
  servers.forEach(srv => {
    const conn = (srv.location || '').toLowerCase();
    const isMatch = (srv.connectedSwitchId === switchData.id && srv.connectedPortId === port.id) ||
      (conn.includes(switchData.name.toLowerCase()) && conn.includes(String(port.number)));

    if (isMatch && !connectedDevices.some(d => d.name === srv.name)) {
      connectedDevices.push({
        name: srv.name,
        ip: srv.ip || srv.primaryIp || '',
        type: 'server',
        description: srv.description || srv.role || 'Сервер инфраструктуры',
        isCritical: true
      });
    }
  });

  // Если устройство указано в connectedTo порта текстом, а в IPAM его нет
  if (port.connectedTo && connectedDevices.length === 0 && downstreamSwitches.length === 0) {
    const isCritical = /srv|server|сервер|1c|1с|db|dc|sql|pve|esxi|nas|synology|магистр|ядро/i.test(portConn);
    const isCctv = /cctv|cam|камер|видео|скуд/i.test(portConn);
    const isAp = /ap|wifi|wi-fi|точка/i.test(portConn);

    connectedDevices.push({
      name: port.connectedTo,
      type: isCritical ? 'server' : isCctv ? 'cctv' : isAp ? 'ap' : 'workstation',
      description: port.description || 'Прямое кабельное подключение',
      isCritical
    });
  }

  // 3. Расчёт затронутых VLAN
  const impactedVlanIds = new Set();
  if (isTrunk) {
    impactedVlanIds.add(port.pvid);
    (port.taggedVlans || []).forEach(v => impactedVlanIds.add(v));
    // Если транк, добавляем VLAN нижестоящих свитчей
    downstreamSwitches.forEach(dSw => {
      const swObj = swMap[dSw.id];
      if (swObj?.ports) {
        swObj.ports.forEach(p => {
          if (p.pvid) impactedVlanIds.add(p.pvid);
        });
      }
    });
  } else {
    impactedVlanIds.add(port.pvid || 1);
  }

  const impactedVlans = Array.from(impactedVlanIds).map(id => {
    return vlanMap[id] || { id, name: `VLAN ${id}`, color: '#64748b' };
  }).sort((a, b) => a.id - b.id);

  // 4. Определение уровня риска (Severity)
  let riskLevel = 'low';
  const hasDownstream = downstreamSwitches.length > 0;
  const hasCriticalServer = connectedDevices.some(d => d.isCritical);

  if (hasDownstream && (totalDownstreamActivePorts > 6 || downstreamSwitches.length > 1 || totalServers > 0)) {
    riskLevel = 'critical';
  } else if (hasCriticalServer || /магистр|ядро|core|uplink/i.test(portDesc) || (isTrunk && hasDownstream)) {
    riskLevel = 'critical';
  } else if (hasDownstream || (isTrunk && impactedVlans.length > 2) || totalAp > 0 || totalCctv > 3) {
    riskLevel = 'high';
  } else if (connectedDevices.length > 0 || port.connectedTo || port.mode === 'trunk' || isSfp) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  // Общее количество затронутых устройств
  const totalAffectedCount = downstreamSwitches.reduce((acc, s) => acc + s.activePortsCount, 0) + connectedDevices.length;

  // Формирование итогового сообщения
  let summaryMessage = '';
  if (riskLevel === 'critical') {
    summaryMessage = downstreamSwitches.length > 0
      ? `КРИТИЧЕСКИЙ РИСК: Отключение порта разорвёт связь с ${downstreamSwitches.length} коммутаторами цепочки (${downstreamSwitches.map(s => s.name).join(', ')}), ${totalAffectedCount} активными портами и серверами!`
      : `КРИТИЧЕСКИЙ РИСК: К порту подключен ключевой узел инфраструктуры (${connectedDevices.map(d => d.name).join(', ')})!`;
  } else if (riskLevel === 'high') {
    summaryMessage = `ВЫСОКИЙ РИСК: Порт является магистральным транком (затрагивает ${impactedVlans.length} VLAN, ${totalAp} точек Wi-Fi и ${totalCctv} камер).`;
  } else if (riskLevel === 'medium') {
    summaryMessage = `ВНИМАНИЕ: Порт активен и используется для подключения: «${port.connectedTo || port.description}».`;
  } else {
    summaryMessage = 'БЕЗОПАСНО: Порт свободен или не содержит задокументированных зависимостей.';
  }

  return {
    riskLevel,
    isTrunk,
    isSfp,
    hasDownstreamSwitches: downstreamSwitches.length > 0,
    downstreamSwitches,
    connectedDevices,
    impactedVlans,
    totalCctv,
    totalAp,
    totalServers,
    totalUsers,
    totalAffectedCount,
    summaryMessage
  };
}

/**
 * Пакетный расчёт зоны поражения для массива портов
 */
export function calculateBatchBlastRadius({
  switchData,
  ports = [],
  allSwitches = [],
  ipAllocations = [],
  servers = [],
  vlans = []
}) {
  if (!ports || ports.length === 0) {
    return {
      riskLevel: 'low',
      hasDownstreamSwitches: false,
      downstreamSwitches: [],
      connectedDevices: [],
      impactedVlans: [],
      totalAffectedCount: 0,
      summaryMessage: 'Порты не выбраны'
    };
  }

  const individualResults = ports.map(port => 
    calculatePortBlastRadius({ switchData, port, allSwitches, ipAllocations, servers, vlans })
  );

  const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  let maxRisk = 'low';
  individualResults.forEach(r => {
    if (riskOrder[r.riskLevel] > riskOrder[maxRisk]) {
      maxRisk = r.riskLevel;
    }
  });

  // Объединяем списки затронутых свитчей, устройств и VLAN
  const uniqueDownstream = new Map();
  const uniqueDevices = new Map();
  const uniqueVlans = new Map();

  individualResults.forEach(r => {
    r.downstreamSwitches.forEach(s => uniqueDownstream.set(s.id, s));
    r.connectedDevices.forEach(d => uniqueDevices.set(d.name + (d.ip || ''), d));
    r.impactedVlans.forEach(v => uniqueVlans.set(v.id, v));
  });

  const allDownstream = Array.from(uniqueDownstream.values());
  const allDevices = Array.from(uniqueDevices.values());
  const allVlans = Array.from(uniqueVlans.values()).sort((a, b) => a.id - b.id);

  const totalAffected = allDownstream.reduce((acc, s) => acc + s.activePortsCount, 0) + allDevices.length;

  let summaryMessage = '';
  if (maxRisk === 'critical') {
    summaryMessage = `КРИТИЧЕСКИЙ РИСК: Пакетное отключение ${ports.length} портов затронет ${allDownstream.length} удаленных коммутаторов и ${allDevices.length} серверов!`;
  } else if (maxRisk === 'high') {
    summaryMessage = `ВЫСОКИЙ РИСК: Отключение ${ports.length} портов приведёт к остановке магистралей и сетевых сервисов.`;
  } else if (maxRisk === 'medium') {
    summaryMessage = `ВНИМАНИЕ: Среди выбранных портов есть активные подключения пользователей и оборудования.`;
  } else {
    summaryMessage = `БЕЗОПАСНО: Выбранные ${ports.length} портов свободны от критических магистралей.`;
  }

  return {
    riskLevel: maxRisk,
    hasDownstreamSwitches: allDownstream.length > 0,
    downstreamSwitches: allDownstream,
    connectedDevices: allDevices,
    impactedVlans: allVlans,
    totalAffectedCount: totalAffected,
    summaryMessage,
    portsCount: ports.length
  };
}
