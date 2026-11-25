import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePrometheusMetrics, escapeLabelValue } from '../server/prometheusExporter.js';
import { snmpMonitorDaemon } from '../server/snmpMonitorDaemon.js';

test('escapeLabelValue safely escapes quotes, backslashes, and newlines', () => {
  assert.equal(escapeLabelValue('normal text'), 'normal text');
  assert.equal(escapeLabelValue('text with "quotes"'), 'text with \\"quotes\\"');
  assert.equal(escapeLabelValue('text\\with\\backslash'), 'text\\\\with\\\\backslash');
  assert.equal(escapeLabelValue("line1\nline2"), 'line1\\nline2');
});

test('generatePrometheusMetrics produces valid Prometheus 0.0.4 text output', () => {
  const switches = [
    {
      id: 'sw-core-01',
      name: 'SW-CORE "HQ"',
      ip: '192.168.10.1',
      model: 'SNR-S2995G-24FX',
      poeBudget: 370,
      ports: [
        {
          id: 'p1',
          number: 1,
          name: 'GigabitEthernet1/0/1',
          vlanId: 10,
          speed: '1G'
        }
      ]
    }
  ];

  const telemetryMap = new Map([
    [
      'sw-core-01',
      {
        online: true,
        metrics: {
          poeWattsUsed: 45
        },
        ports: [
          {
            number: 1,
            operStatus: 'up',
            speedMbps: 1000,
            rxMbps: 15.5,
            txMbps: 8.2,
            inErrors: 2,
            outErrors: 0,
            inDiscards: 1,
            outDiscards: 0
          }
        ]
      }
    ]
  ]);

  const output = generatePrometheusMetrics({ switches, telemetryMap });
  assert.ok(typeof output === 'string');

  // Verify HELP and TYPE declarations
  assert.ok(output.includes('# HELP switchbook_switch_online'));
  assert.ok(output.includes('# TYPE switchbook_switch_online gauge'));
  assert.ok(output.includes('# HELP switchbook_port_traffic_bps'));
  assert.ok(output.includes('# TYPE switchbook_port_traffic_bps gauge'));
  assert.ok(output.includes('# HELP switchbook_port_errors_total'));
  assert.ok(output.includes('# TYPE switchbook_port_errors_total counter'));

  // Verify switch_id label uniformity and escaping
  assert.ok(output.includes('switchbook_switch_online{switch_id="sw-core-01",ip="192.168.10.1",name="SW-CORE \\"HQ\\"",model="SNR-S2995G-24FX"} 1'));
  
  // Verify port link status
  assert.ok(output.includes('switchbook_port_link_status{switch_id="sw-core-01",port="1",name="GigabitEthernet1/0/1",vlan="10"} 1'));

  // Verify port traffic bps: 15.5 Mbps = 15500000 bps
  assert.ok(output.includes('switchbook_port_traffic_bps{switch_id="sw-core-01",port="1",direction="rx"} 15500000'));
  assert.ok(output.includes('switchbook_port_traffic_bps{switch_id="sw-core-01",port="1",direction="tx"} 8200000'));

  // Verify port errors total
  assert.ok(output.includes('switchbook_port_errors_total{switch_id="sw-core-01",port="1",direction="rx"} 2'));
  assert.ok(output.includes('switchbook_port_errors_total{switch_id="sw-core-01",port="1",direction="tx"} 0'));

  // Verify PoE
  assert.ok(output.includes('switchbook_poe_power_watts{switch_id="sw-core-01"} 45'));
});

test('snmpMonitorDaemon.getFleetTopTalkers computes bandwidth summary, top talkers and error matrix', () => {
  const daemon = new (snmpMonitorDaemon.constructor)();
  daemon.storage = {
    getSwitches: () => [
      {
        id: 'sw-1',
        name: 'SW-CORE',
        model: 'SNR-S2995G',
        ports: [
          { number: 1, name: 'Eth1/1', speed: '10G', vlanId: 10 },
          { number: 2, name: 'Eth1/2', speed: '1G', vlanId: 20 }
        ]
      }
    ]
  };

  daemon.latestTelemetryMap.set('sw-1', {
    online: true,
    ports: [
      { number: 1, name: 'Eth1/1', operStatus: 'up', speedMbps: 10000, rxMbps: 450, txMbps: 200, inErrors: 5, outErrors: 0, inDiscards: 0, outDiscards: 0 },
      { number: 2, name: 'Eth1/2', operStatus: 'up', speedMbps: 1000, rxMbps: 20, txMbps: 10, inErrors: 0, outErrors: 0, inDiscards: 0, outDiscards: 0 }
    ]
  });

  const report = daemon.getFleetTopTalkers();
  assert.ok(report.timestamp);
  assert.equal(report.summary.totalIngressMbps, 470);
  assert.equal(report.summary.totalEgressMbps, 210);
  assert.equal(report.summary.totalActivePorts, 2);
  assert.equal(report.topTalkers.length, 2);
  assert.equal(report.topTalkers[0].portNumber, 1);
  assert.equal(report.topTalkers[0].peakMbps, 450);
  assert.equal(report.topErrors.length, 1);
  assert.equal(report.topErrors[0].totalErrors, 5);
});
