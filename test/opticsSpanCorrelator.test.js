import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correlateOpticalSpans,
  detectSpanAsymmetry
} from '../server/opticsSpanCorrelator.js';

test('correlateOpticalSpans correlates endpoints and calculates forward/reverse span losses', () => {
  const switches = [
    {
      id: 'sw-core',
      name: 'CORE-CCR2004',
      ports: [
        { id: 'p25', number: 25, name: 'sfp-sfpplus1', type: 'sfp', linkedSwitchId: 'sw-dist', linkedPortId: 'p25' }
      ]
    },
    {
      id: 'sw-dist',
      name: 'DIST-SNR-S2985G',
      ports: [
        { id: 'p25', number: 25, name: 'Ethernet1/0/25', type: 'sfp', linkedSwitchId: 'sw-core', linkedPortId: 'p25' }
      ]
    }
  ];

  // sw-core Tx = -2 dBm, sw-dist Rx = -5 dBm -> Forward Loss = 3 dB
  // sw-dist Tx = -2.5 dBm, sw-core Rx = -5.5 dBm -> Reverse Loss = 3 dB
  const portDdmMap = new Map([
    ['sw-core:p25', { txPowerDbm: -2.0, rxPowerDbm: -5.5, temperatureC: 40, biasCurrentMa: 26 }],
    ['sw-dist:p25', { txPowerDbm: -2.5, rxPowerDbm: -5.0, temperatureC: 42, biasCurrentMa: 25 }]
  ]);

  const spans = correlateOpticalSpans({ switches, portDdmMap });
  assert.equal(spans.length, 1);
  const span = spans[0];
  assert.equal(span.forwardLossDb, 3.0);
  assert.equal(span.reverseLossDb, 3.0);
  assert.equal(span.asymmetryDb, 0);
  assert.equal(span.isAsymmetric, false);
  assert.ok(span.minMarginDb > 14); // -5 - (-20) = 15 dB margin
});

test('detectSpanAsymmetry flags asymmetric link loss when one fiber core is degraded', () => {
  const asymmetricSpan = {
    id: 'span-1',
    switchA: { id: 'sw1', name: 'SW-1' },
    portA: { id: 'p1', name: 'sfp1' },
    switchB: { id: 'sw2', name: 'SW-2' },
    portB: { id: 'p1', name: 'sfp1' },
    forwardLossDb: 2.1,  // SW1 -> SW2 (normal)
    reverseLossDb: 7.8,  // SW2 -> SW1 (pinched fiber or dirty RX ferrule!)
    asymmetryDb: 5.7,
    isAsymmetric: true
  };

  const diag = detectSpanAsymmetry(asymmetricSpan);
  assert.equal(diag.isAsymmetric, true);
  assert.equal(diag.deltaDb, 5.7);
  assert.equal(diag.faultyDirection, 'SW-2 -> SW-1');
  assert.ok(diag.recommendation.includes('одиночной жилы'));
});
