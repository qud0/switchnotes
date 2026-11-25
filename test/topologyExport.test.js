import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeXml,
  calculateTopologyBounds,
  generateTopologySvg,
  generateDrawioXml,
  generateNetworkPassportHtml
} from '../src/utils/topologyExport.js';

test('escapeXml safely escapes special XML/SVG characters', () => {
  assert.equal(escapeXml('Core & Dist <Switch> "Main" \'Rack\''), 'Core &amp; Dist &lt;Switch&gt; &quot;Main&quot; &apos;Rack&apos;');
  assert.equal(escapeXml(null), '');
  assert.equal(escapeXml(undefined), '');
  assert.equal(escapeXml(12345), '12345');
});

test('calculateTopologyBounds computes accurate bounding box and viewBox', () => {
  const nodes = [
    { x: 100, y: 150, width: 280, height: 130 },
    { x: 600, y: 500, width: 280, height: 130 }
  ];

  const bounds = calculateTopologyBounds(nodes, 80);
  assert.ok(bounds.minX <= 100);
  assert.ok(bounds.minY <= 150);
  assert.ok(bounds.maxX >= 600 + 280);
  assert.ok(bounds.maxY >= 500 + 130);
  assert.ok(bounds.viewBox.includes(String(bounds.width)));
});

test('calculateTopologyBounds handles empty nodes with fallback defaults', () => {
  const bounds = calculateTopologyBounds([]);
  assert.equal(bounds.width, 1200);
  assert.equal(bounds.height, 800);
  assert.equal(bounds.viewBox, '0 0 1200 800');
});

test('generateTopologySvg produces valid, standalone vector SVG with nodes and links', () => {
  const switches = [
    {
      id: 'sw-core-01',
      name: 'SW-CORE-01',
      ip: '10.10.0.1',
      model: 'SNR-S2995G-24FX',
      vendor: 'SNR',
      rackName: 'Rack A1',
      rackUnit: 42,
      ports: [{ number: '1', speed: '10G' }, { number: '2', speed: '10G' }]
    },
    {
      id: 'sw-dist-01',
      name: 'SW-DIST-01',
      ip: '10.10.0.2',
      model: 'CRS326-24G-2S+',
      vendor: 'MikroTik',
      rackName: 'Rack B2',
      ports: [{ number: '24', speed: '10G' }]
    }
  ];

  const links = [
    {
      id: 'lnk-core-dist',
      sourceSwitch: switches[0],
      sourcePort: { number: '1' },
      targetSwitch: switches[1],
      targetPort: { number: '24' },
      speedLabel: '10G',
      carriedVlans: [10, 20, 30]
    }
  ];

  const positions = {
    'sw-core-01': { x: 400, y: 100 },
    'sw-dist-01': { x: 400, y: 400 }
  };

  const svg = generateTopologySvg({
    switches,
    links,
    positions,
    options: {
      theme: 'dark',
      includeCableLabels: true,
      includeLegend: true,
      title: 'Test Core-to-Dist Topology'
    }
  });

  assert.ok(svg.startsWith('<?xml version="1.0"'));
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('SW-CORE-01'));
  assert.ok(svg.includes('SW-DIST-01'));
  assert.ok(svg.includes('10.10.0.1'));
  assert.ok(svg.includes('Test Core-to-Dist Topology'));
  assert.ok(svg.includes('10G SFP+'));
  assert.ok(svg.includes('</svg>'));
});

test('generateDrawioXml produces valid mxGraph model importable into Visio & diagrams.net', () => {
  const switches = [
    {
      id: 'sw-core',
      name: 'SW-CORE',
      ip: '192.168.1.1',
      model: 'SNR-S2995G',
      rackName: 'R-01',
      ports: []
    },
    {
      id: 'sw-access',
      name: 'SW-ACC-01',
      ip: '192.168.1.10',
      model: 'SNR-S2985G',
      rackName: 'R-02',
      ports: []
    }
  ];

  const patchPanels = [
    {
      id: 'pp-01',
      name: 'PP-CAT6-01',
      portCount: 24,
      rackName: 'R-01'
    }
  ];

  const links = [
    {
      id: 'lnk-1',
      sourceSwitch: switches[0],
      targetSwitch: switches[1],
      sourcePort: { number: 'ge1' },
      targetPort: { number: 'ge24' },
      speedLabel: '1G',
      carriedVlans: [100]
    }
  ];

  const xml = generateDrawioXml({
    switches,
    patchPanels,
    links,
    positions: {
      'sw-core': { x: 200, y: 100 },
      'sw-access': { x: 200, y: 350 },
      'pp-01': { x: 500, y: 350 }
    },
    options: {
      includePatchPanels: true,
      title: 'Production Data Center Map'
    }
  });

  assert.ok(xml.includes('<mxfile host="SwitchBook"'));
  assert.ok(xml.includes('<diagram id="switchbook-diagram" name="Production Data Center Map">'));
  assert.ok(xml.includes('<mxCell id="0"/>'));
  assert.ok(xml.includes('<mxCell id="1" parent="0"/>'));
  assert.ok(xml.includes('SW-CORE'));
  assert.ok(xml.includes('PP-CAT6-01'));
  assert.ok(xml.includes('edge="1"'));
  assert.ok(xml.includes('ge1 ↔ ge24 (1G [V:100])'));
  assert.ok(xml.endsWith('</mxfile>'));
});

test('generateNetworkPassportHtml produces multi-section printable executive passport', () => {
  const switches = [
    {
      id: 'sw-1',
      name: 'SW-CORE-01',
      ip: '10.0.0.1',
      vendor: 'SNR',
      model: 'S2995G-24FX',
      rackName: 'A1',
      rackUnit: 40,
      ports: [{ number: 1 }]
    }
  ];

  const vlans = [
    { id: 10, name: 'MANAGEMENT', subnet: '10.0.0.0/24', description: 'Switch In-band Mgmt', gateway: '10.0.0.1' },
    { id: 20, name: 'SERVERS', subnet: '10.0.20.0/24', description: 'Compute Cluster', gateway: '10.0.20.1' }
  ];

  const links = [
    {
      id: 'lnk-1',
      sourceSwitch: switches[0],
      sourcePort: { number: '1' },
      targetSwitch: { id: 'sw-2', name: 'SW-DIST-01' },
      targetPort: { number: '24' },
      speedLabel: '10G',
      carriedVlans: [10, 20]
    }
  ];

  const html = generateNetworkPassportHtml({
    switches,
    links,
    vlans,
    options: {
      companyName: 'ACME Corp Infrastructure',
      title: 'Паспорт сетевой инфраструктуры ЦОД'
    }
  });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('ACME Corp Infrastructure'));
  assert.ok(html.includes('Раздел 1: Графическая схема сетевой топологии'));
  assert.ok(html.includes('Раздел 2: Спецификация оборудования'));
  assert.ok(html.includes('Раздел 3: Кабельный журнал'));
  assert.ok(html.includes('Раздел 4: Реестр виртуальных сетей'));
  assert.ok(html.includes('VLAN 10'));
  assert.ok(html.includes('MANAGEMENT'));
  assert.ok(html.includes('SW-CORE-01'));
  assert.ok(html.includes('window.print()'));
});
