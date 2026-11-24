import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTrendSlopes,
  calculateTimeToFailure,
  classifyOpticalRootCause
} from '../server/opticsDegradationEngine.js';

test('calculateTrendSlopes computes negative dB/day slope on degrading fiber', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Rx drops from -8 dBm to -11 dBm over 6 days (0.5 dB/day degradation)
  const history = [
    { timestamp: new Date(now - 6 * dayMs).toISOString(), rxDbm: -8.0, biasCurrentMa: 25 },
    { timestamp: new Date(now - 4 * dayMs).toISOString(), rxDbm: -9.0, biasCurrentMa: 25 },
    { timestamp: new Date(now - 2 * dayMs).toISOString(), rxDbm: -10.0, biasCurrentMa: 26 },
    { timestamp: new Date(now).toISOString(), rxDbm: -11.0, biasCurrentMa: 26 }
  ];

  const trend = calculateTrendSlopes(history);
  assert.ok(trend.rxSlopeDbPerDay < -0.4 && trend.rxSlopeDbPerDay > -0.6);
  assert.equal(trend.isDegrading, true);
});

test('calculateTimeToFailure projects days until critical sensitivity threshold', () => {
  // Current Rx is -16 dBm, threshold is -20 dBm (4 dB remaining). Slope is -0.5 dB/day -> 8 days TTF.
  const res = calculateTimeToFailure(-16.0, -0.5, -20.0);
  assert.equal(Math.round(res.ttfDays), 8);
  assert.equal(res.urgency, 'WARNING');

  // Imminent failure
  const imm = calculateTimeToFailure(-20.5, -0.2, -20.0);
  assert.equal(imm.ttfDays, 0);
  assert.equal(imm.urgency, 'IMMINENT');

  // Stable link with negligible slope
  const stable = calculateTimeToFailure(-10.0, -0.005, -20.0);
  assert.equal(stable.ttfDays, null);
  assert.equal(stable.urgency, 'STABLE');
});

test('classifyOpticalRootCause correctly identifies dirt/bend vs laser aging', () => {
  // 1. Dirt / Bend: Rx dropped to -17 dBm but laser bias current is completely normal (22 mA)
  const dirt = classifyOpticalRootCause({
    currentRx: -17.5,
    rxSlope: -0.3,
    biasCurrent: 22,
    biasSlope: 0.01,
    temperatureC: 42
  });
  assert.equal(dirt.classification, 'CONNECTOR_DIRT_OR_BEND');
  assert.ok(dirt.recommendation.includes('очистку'));

  // 2. Laser Aging: High bias current (48 mA) to compensate aging semiconductor
  const aging = classifyOpticalRootCause({
    currentRx: -14.0,
    rxSlope: -0.1,
    biasCurrent: 48,
    biasSlope: 0.35,
    temperatureC: 45
  });
  assert.equal(aging.classification, 'LASER_AGING');
  assert.ok(aging.recommendation.includes('замену SFP'));

  // 3. Asymmetric Fiber: Significant loss difference between Tx and Rx cores
  const asym = classifyOpticalRootCause({
    currentRx: -12.0,
    rxSlope: 0,
    biasCurrent: 25,
    biasSlope: 0,
    temperatureC: 40,
    spanAsymmetryDb: 4.8
  });
  assert.equal(asym.classification, 'ASYMMETRIC_FIBER_FAULT');
});
