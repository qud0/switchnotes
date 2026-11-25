/**
 * prometheusExporter.js
 * Formats SwitchBook network telemetry into standard Prometheus 0.0.4 text exposition format.
 * Compatible with Prometheus, VictoriaMetrics, Grafana Alloy and Datadog Agent scrapers.
 */

export function escapeLabelValue(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Generate complete Prometheus exposition format output
 * @param {Object} options
 * @param {Array} options.switches - Switch inventory from storage
 * @param {Map} options.telemetryMap - switchId -> latest telemetry snapshot
 * @returns {string} Text formatted Prometheus metrics
 */
export function generatePrometheusMetrics({ switches = [], telemetryMap = new Map() }) {
  const lines = [];

  // 1. switchbook_switch_online
  lines.push('# HELP switchbook_switch_online Online status of the switch (1 = online, 0 = offline)');
  lines.push('# TYPE switchbook_switch_online gauge');
  for (const sw of switches) {
    const t = telemetryMap.get(sw.id);
    const isOnline = t ? (t.online !== false ? 1 : 0) : 1;
    const switchId = escapeLabelValue(sw.id);
    const ip = escapeLabelValue(sw.ip || '');
    const name = escapeLabelValue(sw.name || '');
    const model = escapeLabelValue(sw.model || '');
    lines.push(`switchbook_switch_online{switch_id="${switchId}",ip="${ip}",name="${name}",model="${model}"} ${isOnline}`);
  }
  lines.push('');

  // 2. switchbook_port_link_status
  lines.push('# HELP switchbook_port_link_status Operational link state of the interface (1 = up, 0 = down)');
  lines.push('# TYPE switchbook_port_link_status gauge');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const telemetryPorts = t?.ports || [];
    const portMap = new Map(telemetryPorts.map(p => [p.number, p]));

    for (const p of (sw.ports || [])) {
      const pNum = p.number;
      const tPort = portMap.get(pNum);
      const isUp = tPort ? (tPort.operStatus === 'up' ? 1 : 0) : (p.enabled !== false ? 1 : 0);
      const pName = escapeLabelValue(p.name || `port${pNum}`);
      const vlan = escapeLabelValue(p.vlanId || p.pvid || '1');
      lines.push(`switchbook_port_link_status{switch_id="${switchId}",port="${pNum}",name="${pName}",vlan="${vlan}"} ${isUp}`);
    }
  }
  lines.push('');

  // 3. switchbook_port_speed_bps
  lines.push('# HELP switchbook_port_speed_bps Configured speed of the interface in bits per second');
  lines.push('# TYPE switchbook_port_speed_bps gauge');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const portMap = new Map((t?.ports || []).map(p => [p.number, p]));

    for (const p of (sw.ports || [])) {
      const pNum = p.number;
      const tPort = portMap.get(pNum);
      const speedMbps = tPort?.speedMbps || (p.speed === '10G' ? 10000 : 1000);
      const speedBps = BigInt(speedMbps) * 1000000n;
      lines.push(`switchbook_port_speed_bps{switch_id="${switchId}",port="${pNum}"} ${speedBps.toString()}`);
    }
  }
  lines.push('');

  // 4. switchbook_port_traffic_bps
  lines.push('# HELP switchbook_port_traffic_bps Current interface traffic rate in bits per second');
  lines.push('# TYPE switchbook_port_traffic_bps gauge');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const portMap = new Map((t?.ports || []).map(p => [p.number, p]));

    for (const p of (sw.ports || [])) {
      const pNum = p.number;
      const tPort = portMap.get(pNum);
      const rxBps = Math.round((tPort?.rxMbps || 0) * 1000000);
      const txBps = Math.round((tPort?.txMbps || 0) * 1000000);
      lines.push(`switchbook_port_traffic_bps{switch_id="${switchId}",port="${pNum}",direction="rx"} ${rxBps}`);
      lines.push(`switchbook_port_traffic_bps{switch_id="${switchId}",port="${pNum}",direction="tx"} ${txBps}`);
    }
  }
  lines.push('');

  // 5. switchbook_port_errors_total
  lines.push('# HELP switchbook_port_errors_total Total input and output CRC/alignment errors');
  lines.push('# TYPE switchbook_port_errors_total counter');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const portMap = new Map((t?.ports || []).map(p => [p.number, p]));

    for (const p of (sw.ports || [])) {
      const pNum = p.number;
      const tPort = portMap.get(pNum);
      const inErrors = tPort?.inErrors || 0;
      const outErrors = tPort?.outErrors || 0;
      lines.push(`switchbook_port_errors_total{switch_id="${switchId}",port="${pNum}",direction="rx"} ${inErrors}`);
      lines.push(`switchbook_port_errors_total{switch_id="${switchId}",port="${pNum}",direction="tx"} ${outErrors}`);
    }
  }
  lines.push('');

  // 6. switchbook_port_discards_total
  lines.push('# HELP switchbook_port_discards_total Total discarded packets due to buffer exhaustion');
  lines.push('# TYPE switchbook_port_discards_total counter');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const portMap = new Map((t?.ports || []).map(p => [p.number, p]));

    for (const p of (sw.ports || [])) {
      const pNum = p.number;
      const tPort = portMap.get(pNum);
      const inDiscards = tPort?.inDiscards || 0;
      const outDiscards = tPort?.outDiscards || 0;
      lines.push(`switchbook_port_discards_total{switch_id="${switchId}",port="${pNum}",direction="rx"} ${inDiscards}`);
      lines.push(`switchbook_port_discards_total{switch_id="${switchId}",port="${pNum}",direction="tx"} ${outDiscards}`);
    }
  }
  lines.push('');

  // 7. switchbook_poe_power_watts
  lines.push('# HELP switchbook_poe_power_watts Current PoE consumption in Watts');
  lines.push('# TYPE switchbook_poe_power_watts gauge');
  for (const sw of switches) {
    const switchId = escapeLabelValue(sw.id);
    const t = telemetryMap.get(sw.id);
    const poeWatts = t?.metrics?.poeWattsUsed || 0;
    lines.push(`switchbook_poe_power_watts{switch_id="${switchId}"} ${poeWatts}`);
  }
  lines.push('');

  return lines.join('\n');
}
