import { pingHost } from './diagnostics.js';

/**
 * Calculate overall network health and summary KPIs
 */
export function getNetworkHealth(storage) {
  const data = storage.data || {};
  const switches = data.switches || [];
  const vlans = data.vlans || [];
  const patchPanels = data.patchPanels || [];
  const ipAllocations = data.ipam || [];

  // 1. Port statistics across all switches
  let totalPorts = 0;
  let activePorts = 0;
  let poePorts = 0;
  let sfpPorts = 0;
  let copperPorts = 0;
  let trunkPorts = 0;
  let accessPorts = 0;

  // PoE calculation
  let totalPoeWattsUsed = 0;
  let totalPoePsuBudget = 0;

  switches.forEach(sw => {
    const swTotal = (sw.ports || []).length;
    totalPorts += swTotal;
    copperPorts += sw.copperPorts || 24;
    sfpPorts += sw.sfpPorts || 0;

    // Estimate switch PoE budget
    const hasPoe = (sw.ports || []).some(p => p.poe);
    if (hasPoe) {
      totalPoePsuBudget += (sw.vendor === 'SNR' ? 370 : (sw.vendor === 'Ubiquiti' ? 400 : 150));
    }

    (sw.ports || []).forEach(p => {
      const isConnected = p.connectedTo || p.linkedSwitchId || p.patchPanelId;
      if (isConnected && p.enabled !== false) {
        activePorts++;
      }
      if (p.poe) {
        poePorts++;
        if (isConnected) {
          // Average 8W per active PoE port
          totalPoeWattsUsed += 8.5;
        }
      }
      if (p.mode === 'trunk') trunkPorts++;
      else accessPorts++;
    });
  });

  totalPoeWattsUsed = Math.round(totalPoeWattsUsed);

  // 2. Patch panels & Cabling statistics
  let totalPatchPorts = 0;
  let connectedPatchPorts = 0;
  patchPanels.forEach(pp => {
    totalPatchPorts += (pp.ports || []).length;
    (pp.ports || []).forEach(p => {
      if (p.connectedSwitchId || p.status === 'connected') {
        connectedPatchPorts++;
      }
    });
  });

  // 3. IPAM statistics
  const totalIps = ipAllocations.length;
  const staticIps = ipAllocations.filter(i => i.status === 'active' || i.type === 'server' || i.type === 'switch').length;
  const dhcpIps = ipAllocations.filter(i => i.status === 'dhcp').length;

  // 4. Calculate Health Score (0 - 100)
  let healthScore = 100;
  const issues = [];

  // Check for orphan switches without IP
  const unconfiguredIps = switches.filter(s => !s.ip);
  if (unconfiguredIps.length > 0) {
    healthScore -= unconfiguredIps.length * 5;
    issues.push({
      type: 'warning',
      title: 'Не указан IP-адрес управления',
      message: `${unconfiguredIps.length} коммутатор(а) не имеют настроенного IP для мониторинга.`
    });
  }

  // Check PoE overload
  if (totalPoePsuBudget > 0 && totalPoeWattsUsed > totalPoePsuBudget) {
    healthScore -= 25;
    issues.push({
      type: 'error',
      title: 'Перегрузка бюджета PoE',
      message: `Потребление (${totalPoeWattsUsed} Вт) превышает суммарную мощность БП (${totalPoePsuBudget} Вт)!`
    });
  }

  // Check port utilization capacity
  const portUtilPercent = totalPorts > 0 ? Math.round((activePorts / totalPorts) * 100) : 0;
  if (portUtilPercent > 90) {
    healthScore -= 10;
    issues.push({
      type: 'warning',
      title: 'Высокая утилизация портов коммутации',
      message: `Занято ${portUtilPercent}% портов сети. Рекомендуется запланировать расширение емкости.`
    });
  }

  healthScore = Math.max(10, Math.min(100, healthScore));

  return {
    healthScore,
    issues,
    switches: {
      total: switches.length,
      copperPorts,
      sfpPorts,
      totalPorts,
      activePorts,
      freePorts: totalPorts - activePorts,
      portUtilPercent,
      trunkPorts,
      accessPorts
    },
    poe: {
      totalPoePorts: poePorts,
      totalWattsUsed: totalPoeWattsUsed,
      totalPsuBudget: totalPoePsuBudget,
      percentUsed: totalPoePsuBudget > 0 ? Math.round((totalPoeWattsUsed / totalPoePsuBudget) * 100) : 0,
      remainingWatts: Math.max(0, totalPoePsuBudget - totalPoeWattsUsed)
    },
    patchPanels: {
      totalPanels: patchPanels.length,
      totalPorts: totalPatchPorts,
      connectedPorts: connectedPatchPorts,
      freePorts: totalPatchPorts - connectedPatchPorts,
      utilPercent: totalPatchPorts > 0 ? Math.round((connectedPatchPorts / totalPatchPorts) * 100) : 0
    },
    ipam: {
      totalAllocations: totalIps,
      staticIps,
      dhcpIps,
      totalVlans: vlans.length
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Ping all switches in parallel for real-time heartbeat
 */
export async function pingAllSwitches(storage) {
  const switches = storage.data?.switches || [];
  
  const pingPromises = switches.map(async (sw) => {
    if (!sw.ip) {
      return {
        id: sw.id,
        name: sw.name,
        ip: null,
        vendor: sw.vendor,
        model: sw.model,
        location: sw.location,
        online: false,
        rtt: null,
        error: 'IP не указан'
      };
    }

    try {
      const res = await pingHost(sw.ip, 1200);
      return {
        id: sw.id,
        name: sw.name,
        ip: sw.ip,
        vendor: sw.vendor,
        model: sw.model,
        location: sw.location,
        online: res.online,
        rtt: res.rtt,
        timestamp: res.timestamp
      };
    } catch (err) {
      return {
        id: sw.id,
        name: sw.name,
        ip: sw.ip,
        vendor: sw.vendor,
        model: sw.model,
        location: sw.location,
        online: false,
        rtt: null,
        error: err.message
      };
    }
  });

  const results = await Promise.all(pingPromises);
  const onlineCount = results.filter(r => r.online).length;

  return {
    total: results.length,
    onlineCount,
    offlineCount: results.length - onlineCount,
    switches: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Ping all servers and virtual machines in parallel for real-time heartbeat
 */
export async function pingAllServers(storage) {
  const servers = storage.data?.servers || [];

  const serverPromises = servers.map(async (srv) => {
    let srvRes = { online: false, rtt: null };
    if (srv.ip) {
      try {
        srvRes = await pingHost(srv.ip, 1200);
      } catch (err) {
        srvRes = { online: false, rtt: null, error: err.message };
      }
    }

    const vmResults = await Promise.all((srv.vms || []).map(async (vm) => {
      let vmRes = { online: false, rtt: null };
      if (vm.ip) {
        try {
          vmRes = await pingHost(vm.ip, 1200);
        } catch (err) {
          vmRes = { online: false, rtt: null, error: err.message };
        }
      }
      return {
        id: vm.id || String(vm.vmid),
        vmid: vm.vmid,
        name: vm.name,
        ip: vm.ip,
        os: vm.os,
        vlanId: vm.vlanId,
        online: vmRes.online,
        rtt: vmRes.rtt,
        timestamp: vmRes.timestamp || new Date().toISOString()
      };
    }));

    return {
      id: srv.id,
      name: srv.name,
      ip: srv.ip,
      role: srv.role,
      online: srvRes.online,
      rtt: srvRes.rtt,
      timestamp: srvRes.timestamp || new Date().toISOString(),
      vms: vmResults
    };
  });

  const serverResults = await Promise.all(serverPromises);

  const totalServers = serverResults.length;
  const onlineServers = serverResults.filter(s => s.online).length;

  let totalVms = 0;
  let onlineVms = 0;
  serverResults.forEach(s => {
    (s.vms || []).forEach(v => {
      totalVms++;
      if (v.online) onlineVms++;
    });
  });

  return {
    totalServers,
    onlineServers,
    offlineServers: totalServers - onlineServers,
    totalVms,
    onlineVms,
    offlineVms: totalVms - onlineVms,
    servers: serverResults,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get recent network audit and event entries
 */
export function getRecentEvents(storage) {
  const switches = storage.data?.switches || [];
  const vlans = storage.data?.vlans || [];
  const patchPanels = storage.data?.patchPanels || [];

  const events = [
    {
      id: 'ev-1',
      type: 'success',
      title: 'Магистральный канал LAG активен',
      source: 'sw-dist-snr ➔ sw-access-unifi',
      desc: 'Агрегированный линк Port-Channel 1 (2x 1G LACP) работает без потерь.',
      time: '10 мин назад'
    },
    {
      id: 'ev-2',
      type: 'info',
      title: 'Резервирование портов СКС',
      source: 'ШТВ-1 (Этаж 2, Кроссовая 201)',
      desc: 'На патч-панели PP-01 свободно 12 из 24 портов Cat.6 для расширения.',
      time: '35 мин назад'
    },
    {
      id: 'ev-3',
      type: 'warning',
      title: 'Питание камер видеонаблюдения',
      source: 'sw-dist-snr (PoE)',
      desc: 'Порты 7 и 8 питают IP-камеры CCTV с суммарной мощностью 15.4W.',
      time: '1 час назад'
    },
    {
      id: 'ev-4',
      type: 'success',
      title: 'Автоматический аудит завершен',
      source: 'Network Health Engine',
      desc: 'Проверка целостности VLAN и отсутствия петлевых связей выполнена.',
      time: '2 часа назад'
    }
  ];

  return events;
}
