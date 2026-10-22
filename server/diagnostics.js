import { exec } from 'child_process';
import url from 'url';

/**
 * Ping a single IPv4 host using Windows/Unix ping command
 */
export function pingHost(host, timeoutMs = 1200) {
  return new Promise((resolve) => {
    // Sanitize host input with Cyrillic IDN punycode support
    let cleanHost = String(host).trim();
    try {
      cleanHost = url.domainToASCII(cleanHost);
    } catch {}
    cleanHost = cleanHost.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!cleanHost) {
      return resolve({ host, online: false, rtt: null, error: 'Неверный хост', timestamp: new Date().toISOString() });
    }

    const isWin = process.platform === 'win32';
    const cmd = isWin
      ? `ping -n 1 -w ${timeoutMs} ${cleanHost}`
      : `ping -c 1 -W ${Math.ceil(timeoutMs / 1000)} ${cleanHost}`;

    const startTime = Date.now();

    exec(cmd, { timeout: timeoutMs + 1000 }, (err, stdout) => {
      const duration = Date.now() - startTime;
      const timestamp = new Date().toISOString();

      if (err || !stdout) {
        return resolve({
          host: cleanHost,
          online: false,
          rtt: null,
          timestamp
        });
      }

      // Check if ping was successful
      const hasTtl = stdout.includes('TTL=') || stdout.includes('ttl=');
      const isSuccess = hasTtl && !stdout.includes('Destination host unreachable') && !stdout.includes('Заданный узел недоступен');

      if (!isSuccess) {
        return resolve({
          host: cleanHost,
          online: false,
          rtt: null,
          timestamp
        });
      }

      // Parse RTT from stdout (e.g. time=2ms or время=2мс or time<1ms)
      const rttMatch = stdout.match(/(?:time|время)[=<](\d+(?:\.\d+)?)\s*(?:ms|мс)?/i);
      const rtt = rttMatch ? parseFloat(rttMatch[1]) : Math.max(1, duration);

      resolve({
        host: cleanHost,
        online: true,
        rtt: Math.round(rtt * 10) / 10,
        timestamp
      });
    });
  });
}

/**
 * Ping multiple hosts in parallel with concurrency limit
 */
export async function pingBatch(hosts = [], timeoutMs = 1200) {
  const uniqueHosts = Array.from(new Set(hosts.filter(Boolean)));
  const results = {};

  // Process in chunks of 8
  const chunkSize = 8;
  for (let i = 0; i < uniqueHosts.length; i += chunkSize) {
    const chunk = uniqueHosts.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(h => pingHost(h, timeoutMs)));
    chunkResults.forEach(res => {
      results[res.host] = res;
    });
  }

  return results;
}

/**
 * Comprehensive Device & Cable Tracing Engine
 * Locates any device by IP, MAC, hostname, or outlet socket,
 * and traces the entire physical path:
 * Device ➔ Wall Outlet ➔ Cable Run ➔ Patch Panel ➔ Switch Port ➔ Uplink to Core
 */
export function traceDevice(storage, rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { found: false, query: '', message: 'Укажите IP, MAC-адрес, имя хоста или номер розетки' };
  }

  const query = rawQuery.trim().toLowerCase();
  const cleanMac = query.replace(/[:-]/g, '');

  const data = storage.data || {};
  const switches = data.switches || [];
  const patchPanels = data.patchPanels || [];
  const ipAllocations = data.ipam || [];
  const vlans = data.vlans || [];
  const vlanMap = new Map(vlans.map(v => [v.id, v]));

  // 1. Search in IPAM allocations
  let matchedAlloc = ipAllocations.find(a => {
    if (a.ip?.toLowerCase() === query) return true;
    if (a.hostname?.toLowerCase().includes(query)) return true;
    if (a.mac && a.mac.toLowerCase().replace(/[:-]/g, '') === cleanMac) return true;
    return false;
  });

  // 2. Search in Switches
  let matchedSwitch = switches.find(sw => {
    if (sw.ip?.toLowerCase() === query) return true;
    if (sw.name?.toLowerCase().includes(query)) return true;
    if (sw.mac && sw.mac.toLowerCase().replace(/[:-]/g, '') === cleanMac) return true;
    return false;
  });

  // 3. Search in Patch Panels (by socket, room, cableMark)
  let matchedPpPort = null;
  let matchedPatchPanel = null;

  for (const pp of patchPanels) {
    for (const p of (pp.ports || [])) {
      if (
        p.socket?.toLowerCase() === query ||
        p.room?.toLowerCase().includes(query) ||
        p.cableMark?.toLowerCase() === query ||
        p.description?.toLowerCase().includes(query)
      ) {
        matchedPpPort = p;
        matchedPatchPanel = pp;
        break;
      }
    }
    if (matchedPpPort) break;
  }

  // 4. Search in Switch Ports (by connectedTo, description, pvid)
  let matchedSwPort = null;
  let portOwnerSwitch = null;

  for (const sw of switches) {
    for (const p of (sw.ports || [])) {
      if (
        p.connectedTo?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      ) {
        matchedSwPort = p;
        portOwnerSwitch = sw;
        break;
      }
    }
    if (matchedSwPort) break;
  }

  // If no match found anywhere
  if (!matchedAlloc && !matchedSwitch && !matchedPpPort && !matchedSwPort) {
    return {
      found: false,
      query: rawQuery,
      message: `Устройство по запросу "${rawQuery}" не найдено в базе портов, розеток и IPAM.`
    };
  }

  // Assemble cross-links
  // Target Device Details
  const target = {
    ip: matchedAlloc?.ip || matchedSwitch?.ip || null,
    hostname: matchedAlloc?.hostname || matchedSwitch?.name || matchedSwPort?.connectedTo || null,
    mac: matchedAlloc?.mac || matchedSwitch?.mac || null,
    type: matchedAlloc?.type || (matchedSwitch ? 'switch' : 'device'),
    vlanId: matchedAlloc?.vlanId || matchedSwPort?.pvid || null,
    vlanName: null
  };

  if (target.vlanId && vlanMap.has(target.vlanId)) {
    target.vlanName = vlanMap.get(target.vlanId).name;
  }

  // Patch Panel / Wall Outlet Details
  let wallOutlet = null;
  let patchPanelInfo = null;

  // If we found through switch port, find its patch panel link
  if (matchedSwPort?.patchPanelId && !matchedPpPort) {
    const pp = patchPanels.find(p => p.id === matchedSwPort.patchPanelId);
    if (pp) {
      matchedPatchPanel = pp;
      matchedPpPort = pp.ports?.find(prt => prt.id === matchedSwPort.patchPanelPortId || prt.number === matchedSwPort.patchPanelPortId);
    }
  }

  // If we found patch panel port, find its switch port
  if (matchedPpPort?.connectedSwitchId && !matchedSwPort) {
    const sw = switches.find(s => s.id === matchedPpPort.connectedSwitchId);
    if (sw) {
      portOwnerSwitch = sw;
      matchedSwPort = sw.ports?.find(p => p.id === matchedPpPort.connectedSwitchPortId || p.number === matchedPpPort.connectedSwitchPortId);
    }
  }

  // Build Outlet and Patch details
  if (matchedPpPort && matchedPatchPanel) {
    wallOutlet = {
      room: matchedPpPort.room || 'Не указан',
      socket: matchedPpPort.socket || 'б/н',
      cableType: matchedPpPort.cableType || 'UTP Cat.6',
      cableLength: matchedPpPort.cableLength || '20-25м',
      cableMark: matchedPpPort.cableMark || null,
      status: matchedPpPort.status
    };

    patchPanelInfo = {
      id: matchedPatchPanel.id,
      name: matchedPatchPanel.name,
      model: matchedPatchPanel.model,
      location: matchedPatchPanel.location,
      portNumber: matchedPpPort.number,
      portId: matchedPpPort.id,
      patchCordColor: matchedPpPort.patchCordColor || '#3b82f6',
      patchCordLength: matchedPpPort.patchCordLength || '1м'
    };
  }

  // Switch Details
  let switchInfo = null;
  let uplinkInfo = null;

  if (portOwnerSwitch && matchedSwPort) {
    switchInfo = {
      id: portOwnerSwitch.id,
      name: portOwnerSwitch.name,
      model: portOwnerSwitch.model,
      vendor: portOwnerSwitch.vendor,
      location: portOwnerSwitch.location,
      ip: portOwnerSwitch.ip,
      portNumber: matchedSwPort.number,
      portName: matchedSwPort.name || `Port ${matchedSwPort.number}`,
      mode: matchedSwPort.mode,
      pvid: matchedSwPort.pvid,
      taggedVlans: matchedSwPort.taggedVlans || [],
      speed: matchedSwPort.speed || '1G',
      poe: Boolean(matchedSwPort.poe),
      lagId: matchedSwPort.lagId || null
    };

    // Find Uplink to Core from this switch
    const isCore = portOwnerSwitch.name.toLowerCase().includes('core') || portOwnerSwitch.vendor === 'MikroTik';
    if (!isCore) {
      const trunkPort = (portOwnerSwitch.ports || []).find(p => p.mode === 'trunk' && p.linkedSwitchId);
      if (trunkPort) {
        const peerSw = switches.find(s => s.id === trunkPort.linkedSwitchId);
        if (peerSw) {
          uplinkInfo = {
            localPortName: trunkPort.name || `p${trunkPort.number}`,
            peerSwitchName: peerSw.name,
            peerSwitchId: peerSw.id,
            peerPortName: trunkPort.connectedTo || 'Trunk Uplink',
            lagName: trunkPort.lagName || (trunkPort.lagId ? `LAG ${trunkPort.lagId}` : null),
            taggedVlans: trunkPort.taggedVlans || []
          };
        }
      }
    }
  }

  return {
    found: true,
    query: rawQuery,
    target,
    wallOutlet,
    patchPanel: patchPanelInfo,
    switch: switchInfo,
    uplink: uplinkInfo
  };
}
