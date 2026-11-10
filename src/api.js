const API_BASE = '/api';

let authToken = typeof window !== 'undefined' ? localStorage.getItem('switchbook_auth_token') : null;

export function setAuthToken(token) {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('switchbook_auth_token', token);
    } else {
      localStorage.removeItem('switchbook_auth_token');
    }
  }
}

export function getAuthToken() {
  if (!authToken && typeof window !== 'undefined') {
    authToken = localStorage.getItem('switchbook_auth_token');
  }
  return authToken;
}

const originalFetch = window.fetch.bind(window);
const customFetch = async (url, options = {}) => {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await originalFetch(url, { ...options, headers });
  if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/api/auth/login')) {
    window.dispatchEvent(new CustomEvent('switchbook:unauthorized'));
  }
  return res;
};
const fetch = customFetch;

export const api = {
  // Switches
  getSwitches: async () => {
    const res = await fetch(`${API_BASE}/switches`);
    if (!res.ok) throw new Error('Не удалось загрузить коммутаторы');
    return res.json();
  },

  getSwitch: async (id) => {
    const res = await fetch(`${API_BASE}/switches/${id}`);
    if (!res.ok) throw new Error('Не удалось загрузить коммутатор');
    return res.json();
  },

  createSwitch: async (data) => {
    const res = await fetch(`${API_BASE}/switches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      let msg = 'Не удалось создать коммутатор';
      try {
        const errJson = await res.json();
        if (errJson?.error) msg = errJson.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  },

  updateSwitch: async (id, data) => {
    const res = await fetch(`${API_BASE}/switches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      let msg = 'Не удалось обновить коммутатор';
      try {
        const errJson = await res.json();
        if (errJson?.error) msg = errJson.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  },

  deleteSwitch: async (id) => {
    const res = await fetch(`${API_BASE}/switches/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить коммутатор');
    return res.json();
  },

  pollSwitchTelemetry: async (id) => {
    const res = await fetch(`${API_BASE}/switches/${id}/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка SNMP опроса');
    }
    return res.json();
  },

  updatePort: async (switchId, portId, portData) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/${portId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portData)
    });
    if (!res.ok) throw new Error('Не удалось обновить порт');
    return res.json();
  },

  controlPort: async (switchId, portId, { action = 'toggle', credentials = {} } = {}) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/${portId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, credentials })
    });
    if (!res.ok) {
      let msg = 'Не удалось изменить состояние порта';
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  runCableTest: async (switchId, portId, { mode = 'auto', faultSimulation = 'none', estimatedLength = '25м', credentials = {} } = {}) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/${portId}/cable-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, faultSimulation, estimatedLength, credentials })
    });
    if (!res.ok) {
      let msg = 'Ошибка выполнения теста кабеля';
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  getPortDdm: async (switchId, portId, { mode = 'auto', faultSimulation = 'none' } = {}) => {
    const query = new URLSearchParams({ mode, faultSimulation }).toString();
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/${portId}/ddm?${query}`);
    if (!res.ok) {
      let msg = 'Ошибка получения оптической телеметрии DDM';
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  getSwitchDdm: async (switchId, { mode = 'auto' } = {}) => {
    const query = new URLSearchParams({ mode }).toString();
    const res = await fetch(`${API_BASE}/switches/${switchId}/ddm?${query}`);
    if (!res.ok) {
      let msg = 'Ошибка получения оптической телеметрии DDM для коммутатора';
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  batchControlPorts: async (switchId, { portIds, action, profileData, applyToHardware = true, credentials = {} }) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/batch-control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portIds, action, profileData, applyToHardware, credentials })
    });
    if (!res.ok) {
      let msg = 'Ошибка пакетного управления портами';
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  batchUpdatePorts: async (switchId, portIds, portUpdate) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portIds, portUpdate })
    });
    if (!res.ok) throw new Error('Не удалось обновить группу портов');
    return res.json();
  },

  discoverSwitchMacs: async (switchId, options = {}) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/mac-discovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка live-опроса MAC-таблицы');
    }
    return res.json();
  },

  syncSwitchMacs: async (switchId, items = []) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/mac-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка синхронизации MAC-адресов');
    }
    return res.json();
  },

  // VLANs
  getVlans: async () => {
    const res = await fetch(`${API_BASE}/vlans`);
    if (!res.ok) throw new Error('Не удалось загрузить VLAN');
    return res.json();
  },

  createVlan: async (vlan) => {
    const res = await fetch(`${API_BASE}/vlans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vlan)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать VLAN');
    }
    return res.json();
  },

  updateVlan: async (id, vlan) => {
    const res = await fetch(`${API_BASE}/vlans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vlan)
    });
    if (!res.ok) throw new Error('Не удалось обновить VLAN');
    return res.json();
  },

  deleteVlan: async (id) => {
    const res = await fetch(`${API_BASE}/vlans/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить VLAN');
    return res.json();
  },

  // Patch Panels
  getPatchPanels: async () => {
    const res = await fetch(`${API_BASE}/patch-panels`);
    if (!res.ok) throw new Error('Не удалось загрузить патч-панели');
    return res.json();
  },

  getPatchPanel: async (id) => {
    const res = await fetch(`${API_BASE}/patch-panels/${id}`);
    if (!res.ok) throw new Error('Не удалось загрузить патч-панель');
    return res.json();
  },

  createPatchPanel: async (data) => {
    const res = await fetch(`${API_BASE}/patch-panels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось создать патч-панель');
    return res.json();
  },

  updatePatchPanel: async (id, data) => {
    const res = await fetch(`${API_BASE}/patch-panels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить патч-панель');
    return res.json();
  },

  deletePatchPanel: async (id) => {
    const res = await fetch(`${API_BASE}/patch-panels/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить патч-панель');
    return res.json();
  },

  updatePatchPanelPort: async (panelId, portId, data) => {
    const res = await fetch(`${API_BASE}/patch-panels/${panelId}/ports/${portId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить порт патч-панели');
    return res.json();
  },

  // IPAM (IP Address Management)
  getIpAllocations: async () => {
    const res = await fetch(`${API_BASE}/ipam`);
    if (!res.ok) throw new Error('Не удалось загрузить IP-адреса');
    return res.json();
  },

  createIpAllocation: async (data) => {
    const res = await fetch(`${API_BASE}/ipam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать IP-запись');
    }
    return res.json();
  },

  updateIpAllocation: async (id, data) => {
    const res = await fetch(`${API_BASE}/ipam/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось обновить IP-запись');
    }
    return res.json();
  },

  deleteIpAllocation: async (id) => {
    const res = await fetch(`${API_BASE}/ipam/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить IP-запись');
    return res.json();
  },

  syncServersToIpam: async () => {
    const res = await fetch(`${API_BASE}/ipam/sync-servers`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось синхронизировать серверы с IPAM');
    return res.json();
  },

  // Floor Plans
  getFloorPlans: async () => {
    const res = await fetch(`${API_BASE}/floor-plans`);
    if (!res.ok) throw new Error('Не удалось загрузить планы этажей');
    return res.json();
  },

  getFloorPlan: async (id) => {
    const res = await fetch(`${API_BASE}/floor-plans/${id}`);
    if (!res.ok) throw new Error('Не удалось загрузить план этажа');
    return res.json();
  },

  createFloorPlan: async (data) => {
    const res = await fetch(`${API_BASE}/floor-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать план этажа');
    }
    return res.json();
  },

  updateFloorPlan: async (id, data) => {
    const res = await fetch(`${API_BASE}/floor-plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить план этажа');
    return res.json();
  },

  deleteFloorPlan: async (id) => {
    const res = await fetch(`${API_BASE}/floor-plans/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить план этажа');
    return res.json();
  },

  // Factory Buildings & Campus Map
  getBuildings: async () => {
    const res = await fetch(`${API_BASE}/buildings`);
    if (!res.ok) throw new Error('Не удалось загрузить здания завода');
    return res.json();
  },

  getBuilding: async (id) => {
    const res = await fetch(`${API_BASE}/buildings/${id}`);
    if (!res.ok) throw new Error('Не удалось загрузить данные здания');
    return res.json();
  },

  createBuilding: async (data) => {
    const res = await fetch(`${API_BASE}/buildings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать здание');
    }
    return res.json();
  },

  updateBuilding: async (id, data) => {
    const res = await fetch(`${API_BASE}/buildings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить здание');
    return res.json();
  },

  deleteBuilding: async (id) => {
    const res = await fetch(`${API_BASE}/buildings/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить здание');
    return res.json();
  },

  // Campus Infrastructure (Колодцы, эстакады, трассы ВОЛС, Wi-Fi зоны)
  getCampusInfrastructure: async () => {
    const res = await fetch(`${API_BASE}/campus-infrastructure`);
    if (!res.ok) throw new Error('Не удалось загрузить инфраструктуру кампуса');
    return res.json();
  },

  updateCampusInfrastructure: async (data) => {
    const res = await fetch(`${API_BASE}/campus-infrastructure`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось обновить инфраструктуру кампуса');
    }
    return res.json();
  },

  // Diagnostics & Tracing
  pingHost: async (host, timeoutMs = 1200) => {
    const res = await fetch(`${API_BASE}/diagnostics/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, timeoutMs })
    });
    if (!res.ok) throw new Error('Ошибка ping запроса');
    return res.json();
  },

  pingBatch: async (hosts, timeoutMs = 1200) => {
    const res = await fetch(`${API_BASE}/diagnostics/ping-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hosts, timeoutMs })
    });
    if (!res.ok) throw new Error('Ошибка пакетного ping');
    return res.json();
  },

  traceDevice: async (query) => {
    const res = await fetch(`${API_BASE}/diagnostics/trace?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Ошибка поиска устройства');
    return res.json();
  },

  troubleshootNetwork: async (params = {}) => {
    const res = await fetch(`${API_BASE}/diagnostics/troubleshoot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка диагностики сети');
    }
    return res.json();
  },

  applyTroubleshootFix: async (fix) => {
    const res = await fetch(`${API_BASE}/diagnostics/troubleshoot/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка применения исправления');
    }
    return res.json();
  },

  // Network Tools
  scanSubnet: async (data) => {
    const res = await fetch(`${API_BASE}/tools/scan-subnet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сканирования подсети');
    }
    return res.json();
  },

  scanPorts: async (data) => {
    const res = await fetch(`${API_BASE}/tools/scan-ports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сканирования портов');
    }
    return res.json();
  },

  runTraceroute: async (data) => {
    const res = await fetch(`${API_BASE}/tools/traceroute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка трассировки маршрута');
    }
    return res.json();
  },

  // Notes (Инженерный блокнот)
  getNotes: async () => {
    const res = await fetch(`${API_BASE}/notes`);
    if (!res.ok) throw new Error('Не удалось загрузить заметки');
    return res.json();
  },

  createNote: async (data) => {
    const res = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось создать заметку');
    return res.json();
  },

  updateNote: async (id, data) => {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить заметку');
    return res.json();
  },

  deleteNote: async (id) => {
    const res = await fetch(`${API_BASE}/notes/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить заметку');
    return res.json();
  },

  // Monitoring & Health Dashboard
  getNetworkHealth: async () => {
    const res = await fetch(`${API_BASE}/monitoring/health`);
    if (!res.ok) throw new Error('Не удалось загрузить показатели здоровья сети');
    return res.json();
  },

  pingAllSwitches: async () => {
    const res = await fetch(`${API_BASE}/monitoring/ping-all`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось выполнить опрос коммутаторов');
    return res.json();
  },

  pingAllServers: async () => {
    const res = await fetch(`${API_BASE}/monitoring/ping-servers`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось выполнить опрос серверов');
    return res.json();
  },

  getNetworkEvents: async () => {
    const res = await fetch(`${API_BASE}/monitoring/events`);
    if (!res.ok) throw new Error('Не удалось загрузить события сети');
    return res.json();
  },

  getNetworkAlerts: async (limit = 100) => {
    const res = await fetch(`${API_BASE}/monitoring/alerts?limit=${limit}`);
    if (!res.ok) throw new Error('Не удалось загрузить сетевые алерты');
    return res.json();
  },

  acknowledgeAlert: async (id) => {
    const res = await fetch(`${API_BASE}/monitoring/alerts/${id}/ack`, { method: 'POST' });
    if (!res.ok) throw new Error('Не удалось подтвердить алерт');
    return res.json();
  },

  clearAlerts: async () => {
    const res = await fetch(`${API_BASE}/monitoring/alerts`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Не удалось очистить алерты');
    return res.json();
  },

  getPortTelemetryHistory: async (switchId, portNumber) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/${portNumber}/history`);
    if (!res.ok) throw new Error('Не удалось загрузить историю телеметрии порта');
    return res.json();
  },

  getNotificationSettings: async () => {
    const res = await fetch(`${API_BASE}/monitoring/notifications`);
    if (!res.ok) throw new Error('Не удалось загрузить настройки уведомлений');
    return res.json();
  },

  updateNotificationSettings: async (data) => {
    const res = await fetch(`${API_BASE}/monitoring/notifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось сохранить настройки уведомлений');
    return res.json();
  },

  testNotification: async (settings) => {
    const res = await fetch(`${API_BASE}/monitoring/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка отправки тестового уведомления');
    }
    return res.json();
  },

  // Audit Log & Config History
  getAuditLog: async (limit = 200) => {
    const res = await fetch(`${API_BASE}/audit-log?limit=${limit}`);
    if (!res.ok) throw new Error('Не удалось загрузить журнал аудита');
    return res.json();
  },

  clearAuditLog: async () => {
    const res = await fetch(`${API_BASE}/audit-log`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось очистить журнал аудита');
    return res.json();
  },

  getSnapshots: async () => {
    const res = await fetch(`${API_BASE}/snapshots`);
    if (!res.ok) throw new Error('Не удалось загрузить список снимков');
    return res.json();
  },

  createSnapshot: async (data) => {
    const res = await fetch(`${API_BASE}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось создать снимок конфигурации');
    return res.json();
  },

  deleteSnapshot: async (id) => {
    const res = await fetch(`${API_BASE}/snapshots/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить снимок');
    return res.json();
  },

  restoreSnapshot: async (id) => {
    const res = await fetch(`${API_BASE}/snapshots/${id}/restore`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось откатить конфигурацию к снимку');
    return res.json();
  },

  compareSnapshot: async (id) => {
    const res = await fetch(`${API_BASE}/snapshots/${id}/diff`);
    if (!res.ok) throw new Error('Не удалось сравнить конфигурацию со снимком');
    return res.json();
  },

  // Servers & Hypervisors (Серверы и ВМ)
  getServers: async () => {
    const res = await fetch(`${API_BASE}/servers`);
    if (!res.ok) throw new Error('Не удалось загрузить серверы');
    return res.json();
  },

  getServer: async (id) => {
    const res = await fetch(`${API_BASE}/servers/${id}`);
    if (!res.ok) throw new Error('Не удалось загрузить сервер');
    return res.json();
  },

  createServer: async (data) => {
    const res = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось создать сервер');
    }
    return res.json();
  },

  updateServer: async (id, data) => {
    const res = await fetch(`${API_BASE}/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось обновить сервер');
    }
    return res.json();
  },

  deleteServer: async (id) => {
    const res = await fetch(`${API_BASE}/servers/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить сервер');
    return res.json();
  },

  addVm: async (serverId, vmData) => {
    const res = await fetch(`${API_BASE}/servers/${serverId}/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vmData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось добавить ВМ');
    }
    return res.json();
  },

  updateVm: async (serverId, vmid, vmData) => {
    const res = await fetch(`${API_BASE}/servers/${serverId}/vms/${vmid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vmData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось обновить ВМ');
    }
    return res.json();
  },

  deleteVm: async (serverId, vmid) => {
    const res = await fetch(`${API_BASE}/servers/${serverId}/vms/${vmid}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить ВМ');
    return res.json();
  },

  // Config Backups & SSH
  getSwitchBackups: async (switchId) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/backups`);
    if (!res.ok) throw new Error('Не удалось загрузить историю бэкапов');
    return res.json();
  },

  getBackup: async (backupId) => {
    const res = await fetch(`${API_BASE}/backups/${backupId}`);
    if (!res.ok) throw new Error('Не удалось загрузить конфигурацию');
    return res.json();
  },

  fetchBackupOverSsh: async (switchId, sshParams) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/backups/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sshParams)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сбора конфигурации по SSH');
    }
    return res.json();
  },

  uploadBackup: async (switchId, uploadData) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/backups/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки конфигурации');
    }
    return res.json();
  },

  deleteBackup: async (backupId) => {
    const res = await fetch(`${API_BASE}/backups/${backupId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Не удалось удалить бэкап');
    return res.json();
  },

  getBackupSchedule: async () => {
    const res = await fetch(`${API_BASE}/backups/schedule`);
    if (!res.ok) throw new Error('Не удалось получить настройки расписания');
    return res.json();
  },

  updateBackupSchedule: async (data) => {
    const res = await fetch(`${API_BASE}/backups/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Не удалось обновить настройки расписания');
    return res.json();
  },

  triggerAllBackups: async () => {
    const res = await fetch(`${API_BASE}/backups/trigger-all`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось запустить сбор бэкапов');
    return res.json();
  },

  executeSwitchCli: async (switchId, cliParams) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/execute-cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cliParams)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка выполнения CLI команды');
    }
    return res.json();
  },

  // Git-backed backups
  getGitStatus: async () => {
    const res = await fetch(`${API_BASE}/backups/git/status`);
    if (!res.ok) throw new Error('Не удалось получить статус Git-репозитория');
    return res.json();
  },

  syncAllToGit: async (author) => {
    const res = await fetch(`${API_BASE}/backups/git/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author })
    });
    if (!res.ok) throw new Error('Не удалось синхронизировать конфигурации в Git');
    return res.json();
  },

  commitSwitchToGit: async (switchId, params = {}) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/backups/git-commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка коммита в Git');
    }
    return res.json();
  },

  setGitRemote: async (remoteUrl) => {
    const res = await fetch(`${API_BASE}/backups/git/remote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteUrl })
    });
    if (!res.ok) throw new Error('Не удалось обновить URL удаленного репозитория');
    return res.json();
  },

  pushGitRemote: async () => {
    const res = await fetch(`${API_BASE}/backups/git/push`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Не удалось выполнить Git push');
    return res.json();
  },

  // Network Auto-Discovery & LLDP Topology
  discoverNetwork: async (params = {}) => {
    const res = await fetch(`${API_BASE}/discovery/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сетевого автодискавери');
    }
    return res.json();
  },

  addDiscoveredSwitch: async (switchData) => {
    const res = await fetch(`${API_BASE}/discovery/add-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(switchData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка добавления коммутатора');
    }
    return res.json();
  },

  getLldpTopology: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/discovery/lldp${query ? `?${query}` : ''}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка опроса LLDP топологии');
    }
    return res.json();
  },

  applyLldpLink: async (link) => {
    const res = await fetch(`${API_BASE}/discovery/lldp/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка применения LLDP линка');
    }
    return res.json();
  },

  applyAllLldpLinks: async (links) => {
    const res = await fetch(`${API_BASE}/discovery/lldp/apply-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка пакетного применения линков LLDP');
    }
    return res.json();
  },

  generateBatchPortScript: async (switchId, params) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/provision-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка генерации скрипта');
    }
    return res.json();
  },

  applyBatchProvisioning: async (switchId, params) => {
    const res = await fetch(`${API_BASE}/switches/${switchId}/ports/provision-apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка применения настроек портов');
    }
    return res.json();
  },

  // End-to-End VLAN Wizard
  analyzeVlanProvisioning: async (params) => {
    const res = await fetch(`${API_BASE}/vlan-wizard/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка анализа сквозного проброса VLAN');
    }
    return res.json();
  },

  applyVlanProvisioning: async (params) => {
    const res = await fetch(`${API_BASE}/vlan-wizard/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка применения сквозного проброса VLAN');
    }
    return res.json();
  },

  executeVlanProvisioningSsh: async (params) => {
    const res = await fetch(`${API_BASE}/vlan-wizard/execute-ssh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка выполнения по SSH');
    }
    return res.json();
  },

  // Backup & Restore
  exportBackupUrl: () => {
    const token = getAuthToken();
    return token ? `${API_BASE}/backup?token=${encodeURIComponent(token)}` : `${API_BASE}/backup`;
  },

  restoreBackup: async (backupData) => {
    const res = await fetch(`${API_BASE}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backupData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка при восстановлении базы');
    }
    return res.json();
  },

  // Auth API
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка авторизации');
    }
    const data = await res.json();
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  getMe: async () => {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (!res.ok) return { authenticated: false, user: null };
    return res.json();
  },

  logout: async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
    return { success: true };
  },

  updateProfile: async (profileData) => {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка обновления профиля');
    }
    return res.json();
  },

  // Users Management API (Admin only)
  getUsers: async () => {
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки пользователей');
    }
    return res.json();
  },

  createUser: async (userData) => {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка создания пользователя');
    }
    return res.json();
  },

  updateUser: async (id, userData) => {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка изменения пользователя');
    }
    return res.json();
  },

  deleteUser: async (id) => {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка удаления пользователя');
    }
    return res.json();
  },

  // Active Directory (LDAP + DNS) Integration
  getAdSettings: async () => {
    const res = await fetch(`${API_BASE}/ad/settings`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки настроек Active Directory');
    }
    return res.json();
  },

  updateAdSettings: async (settings) => {
    const res = await fetch(`${API_BASE}/ad/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения настроек Active Directory');
    }
    return res.json();
  },

  testAdConnection: async (settings) => {
    const res = await fetch(`${API_BASE}/ad/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка тестирования подключения к контроллеру домена');
    }
    return res.json();
  },

  previewAdComputers: async (settings) => {
    const res = await fetch(`${API_BASE}/ad/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка предпросмотра компьютеров из Active Directory');
    }
    return res.json();
  },

  syncAdToIpam: async (settings) => {
    const res = await fetch(`${API_BASE}/ad/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка синхронизации с Active Directory');
    }
    return res.json();
  }
};
