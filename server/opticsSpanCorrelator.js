/**
 * Dual-Ended Optical Span Correlator & Asymmetry Analyzer
 * Matches interconnected SFP/SFP+ ports between switch pairs, calculates bidirectional
 * forward and reverse fiber losses, and detects asymmetric fiber defects.
 */

const CRITICAL_RX_FLOOR_DBM = -20.0;
const ASYMMETRY_THRESHOLD_DB = 3.0;

/**
 * Checks if port is an optical SFP/SFP+ transceiver port
 * @param {object} port
 * @returns {boolean}
 */
export function isOpticalPort(port) {
  if (!port) return false;
  const pType = (port.type || '').toLowerCase();
  const pName = (port.name || '').toLowerCase();
  const pSpeed = (port.speed || '').toLowerCase();

  return (
    pType.includes('sfp') ||
    pType.includes('fiber') ||
    pType.includes('optical') ||
    pName.includes('sfp') ||
    pName.includes('tengigabit') ||
    pName.includes('te1/') ||
    pSpeed.includes('10g') ||
    (port.number && port.number > 24)
  );
}

/**
 * Correlates all inter-switch optical links into bidirectional OpticalSpan entities
 * @param {{ switches: Array<object>, portDdmMap: Map<string, object> }} param0
 * @returns {Array<object>}
 */
export function correlateOpticalSpans({ switches = [], portDdmMap = new Map() }) {
  const ddmMap = portDdmMap instanceof Map ? portDdmMap : new Map(Object.entries(portDdmMap || {}));
  const switchMap = new Map();
  switches.forEach(sw => switchMap.set(sw.id, sw));

  const spansMap = new Map();

  for (const swA of switches) {
    for (const portA of (swA.ports || [])) {
      if (!portA.linkedSwitchId || !portA.linkedPortId) continue;
      if (!isOpticalPort(portA)) continue;

      const swB = switchMap.get(portA.linkedSwitchId);
      if (!swB) continue;

      const portB = (swB.ports || []).find(p => p.id === portA.linkedPortId || String(p.number) === String(portA.linkedPortId));
      if (!portB) continue;

      // Unique canonical span key
      const keyA = `${swA.id}:${portA.id}`;
      const keyB = `${swB.id}:${portB.id}`;
      const spanKey = [keyA, keyB].sort().join('<==>');

      if (spansMap.has(spanKey)) continue;

      // Read DDM telemetry for both endpoints
      const ddmA = ddmMap.get(keyA) || { txPowerDbm: -2.0, rxPowerDbm: -6.0, biasCurrentMa: 25, temperatureC: 38 };
      const ddmB = ddmMap.get(keyB) || { txPowerDbm: -2.0, rxPowerDbm: -6.0, biasCurrentMa: 25, temperatureC: 38 };

      const txA = typeof ddmA.txPowerDbm === 'number' ? ddmA.txPowerDbm : -2.0;
      const rxA = typeof ddmA.rxPowerDbm === 'number' ? ddmA.rxPowerDbm : -6.0;
      const txB = typeof ddmB.txPowerDbm === 'number' ? ddmB.txPowerDbm : -2.0;
      const rxB = typeof ddmB.rxPowerDbm === 'number' ? ddmB.rxPowerDbm : -6.0;

      // Forward Loss: Switch A (Tx) -> Switch B (Rx)
      let forwardLossDb = parseFloat((txA - rxB).toFixed(2));
      if (forwardLossDb < 0) forwardLossDb = 0.2;

      // Reverse Loss: Switch B (Tx) -> Switch A (Rx)
      let reverseLossDb = parseFloat((txB - rxA).toFixed(2));
      if (reverseLossDb < 0) reverseLossDb = 0.2;

      const asymmetryDb = parseFloat(Math.abs(forwardLossDb - reverseLossDb).toFixed(2));
      const isAsymmetric = asymmetryDb >= ASYMMETRY_THRESHOLD_DB;

      const forwardMarginDb = parseFloat((rxB - CRITICAL_RX_FLOOR_DBM).toFixed(2));
      const reverseMarginDb = parseFloat((rxA - CRITICAL_RX_FLOOR_DBM).toFixed(2));
      const minMarginDb = Math.min(forwardMarginDb, reverseMarginDb);

      let status = 'OPTIMAL';
      if (minMarginDb <= 3.0 || rxA <= -20.0 || rxB <= -20.0) {
        status = 'CRITICAL';
      } else if (isAsymmetric) {
        status = 'ASYMMETRIC_FAULT';
      } else if (minMarginDb <= 6.0 || forwardLossDb > 8.0 || reverseLossDb > 8.0) {
        status = 'WARNING';
      }

      const spanObj = {
        id: `span-${spanKey.replace(/[:<>=]/g, '_')}`,
        switchA: {
          id: swA.id,
          name: swA.name,
          vendor: swA.vendor
        },
        portA: {
          id: portA.id,
          name: portA.name || `Port ${portA.number}`,
          number: portA.number,
          txPowerDbm: txA,
          rxPowerDbm: rxA,
          biasCurrentMa: ddmA.biasCurrentMa || 25,
          temperatureC: ddmA.temperatureC || 38
        },
        switchB: {
          id: swB.id,
          name: swB.name,
          vendor: swB.vendor
        },
        portB: {
          id: portB.id,
          name: portB.name || `Port ${portB.number}`,
          number: portB.number,
          txPowerDbm: txB,
          rxPowerDbm: rxB,
          biasCurrentMa: ddmB.biasCurrentMa || 25,
          temperatureC: ddmB.temperatureC || 38
        },
        forwardLossDb,
        reverseLossDb,
        asymmetryDb,
        isAsymmetric,
        forwardMarginDb,
        reverseMarginDb,
        minMarginDb,
        status
      };

      spansMap.set(spanKey, spanObj);
    }
  }

  return Array.from(spansMap.values());
}

/**
 * Analyzes optical span asymmetry and returns localized diagnostics
 * @param {object} span
 * @returns {{ isAsymmetric: boolean, deltaDb: number, faultyDirection: string, recommendation: string }}
 */
export function detectSpanAsymmetry(span) {
  if (!span) {
    return { isAsymmetric: false, deltaDb: 0, faultyDirection: 'None', recommendation: '' };
  }

  const deltaDb = span.asymmetryDb || 0;
  const isAsymmetric = deltaDb >= ASYMMETRY_THRESHOLD_DB;

  if (!isAsymmetric) {
    return {
      isAsymmetric: false,
      deltaDb,
      faultyDirection: 'None',
      recommendation: 'Оптический пролет симметричен, затухание в прямом и обратном направлении сбалансировано.'
    };
  }

  const faultyDirection = (span.forwardLossDb > span.reverseLossDb)
    ? `${span.switchA?.name || 'A'} -> ${span.switchB?.name || 'B'}`
    : `${span.switchB?.name || 'B'} -> ${span.switchA?.name || 'A'}`;

  return {
    isAsymmetric: true,
    deltaDb,
    faultyDirection,
    recommendation: `Высокая асимметрия затухания (${deltaDb} dB) указывает на дефект одиночной жилы оптоволоконного кабеля в направлении ${faultyDirection}. Проверьте патч-корд на микроизгиб и очистите оптические коннекторы LC/UPC.`
  };
}

/**
 * Calculates optical margin before sensitivity threshold
 * @param {object} span
 * @returns {{ minMarginDb: number, forwardMarginDb: number, reverseMarginDb: number }}
 */
export function calculateSpanMargin(span) {
  if (!span) return { minMarginDb: 0, forwardMarginDb: 0, reverseMarginDb: 0 };
  return {
    minMarginDb: span.minMarginDb ?? 0,
    forwardMarginDb: span.forwardMarginDb ?? 0,
    reverseMarginDb: span.reverseMarginDb ?? 0
  };
}

