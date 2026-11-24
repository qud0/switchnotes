/**
 * Optics Trend & Degradation AI Mathematical Engine
 * Computes rate-of-change trend slopes (dB/day, mA/day), calculates Time-To-Failure (TTF),
 * and classifies root causes of optical link degradation according to SFF-8472 telemetry.
 */

const CRITICAL_RX_THRESHOLD_DBM = -20.0;
const NO_SIGNAL_THRESHOLD_DBM = -32.0;

/**
 * Calculates linear regression slope for series of time-series points
 * @param {Array<number>} x Time in days
 * @param {Array<number>} y Metric value (dBm or mA)
 * @returns {number} Slope per day
 */
function linearRegressionSlope(x, y) {
  const n = x.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denominator += dx * dx;
  }

  if (Math.abs(denominator) < 1e-9) return 0;
  return parseFloat((numerator / denominator).toFixed(4));
}

/**
 * Calculates trend slopes for Rx optical power and laser bias current over historical points
 * @param {Array<{ timestamp: string, rxDbm: number, txDbm?: number, biasCurrentMa?: number, temperatureC?: number }>} historyPoints
 * @returns {{ rxSlopeDbPerDay: number, biasSlopeMaPerDay: number, isDegrading: boolean, pointsCount: number }}
 */
export function calculateTrendSlopes(historyPoints = []) {
  if (!Array.isArray(historyPoints) || historyPoints.length < 2) {
    return {
      rxSlopeDbPerDay: 0,
      biasSlopeMaPerDay: 0,
      isDegrading: false,
      pointsCount: historyPoints ? historyPoints.length : 0
    };
  }

  // Filter valid points with numbers
  const validPoints = historyPoints.filter(p => typeof p.rxDbm === 'number' && !isNaN(p.rxDbm));
  if (validPoints.length < 2) {
    return { rxSlopeDbPerDay: 0, biasSlopeMaPerDay: 0, isDegrading: false, pointsCount: validPoints.length };
  }

  // Normalize timestamps to days relative to first point
  const t0 = new Date(validPoints[0].timestamp).getTime();
  const msInDay = 24 * 60 * 60 * 1000;

  const days = [];
  const rxValues = [];
  const biasValues = [];

  for (const pt of validPoints) {
    const t = (new Date(pt.timestamp).getTime() - t0) / msInDay;
    days.push(t);
    rxValues.push(pt.rxDbm);
    biasValues.push(typeof pt.biasCurrentMa === 'number' ? pt.biasCurrentMa : 25);
  }

  const rxSlopeDbPerDay = linearRegressionSlope(days, rxValues);
  const biasSlopeMaPerDay = linearRegressionSlope(days, biasValues);

  // Link is degrading if Rx power drops >= 0.10 dB/day or bias current increases >= 0.20 mA/day
  const isDegrading = rxSlopeDbPerDay <= -0.10 || biasSlopeMaPerDay >= 0.20;

  return {
    rxSlopeDbPerDay,
    biasSlopeMaPerDay,
    isDegrading,
    pointsCount: validPoints.length
  };
}

/**
 * Calculates Time-To-Failure (TTF) in days until critical receiver threshold
 * @param {number} currentRx
 * @param {number} rxSlopeDbPerDay
 * @param {number} [criticalThreshold=-20.0]
 * @returns {{ ttfDays: number | null, urgency: 'IMMINENT' | 'CRITICAL' | 'WARNING' | 'WATCH' | 'STABLE' | 'NO_LIGHT' }}
 */
export function calculateTimeToFailure(currentRx, rxSlopeDbPerDay, criticalThreshold = CRITICAL_RX_THRESHOLD_DBM) {
  if (currentRx === null || currentRx === undefined || isNaN(currentRx) || currentRx <= NO_SIGNAL_THRESHOLD_DBM) {
    return { ttfDays: null, urgency: 'NO_LIGHT' };
  }

  if (currentRx <= criticalThreshold) {
    return { ttfDays: 0, urgency: 'IMMINENT' };
  }

  // If slope is flat or positive (signal stable or improving)
  if (rxSlopeDbPerDay >= -0.02) {
    return { ttfDays: null, urgency: 'STABLE' };
  }

  const marginDb = currentRx - criticalThreshold;
  const ttfDays = parseFloat((marginDb / Math.abs(rxSlopeDbPerDay)).toFixed(1));

  let urgency = 'WATCH';
  if (ttfDays <= 7) urgency = 'CRITICAL';
  else if (ttfDays <= 30) urgency = 'WARNING';

  return { ttfDays, urgency };
}

/**
 * Classifies optical link root cause using SFF-8472 optical telemetry
 * @param {{
 *   currentRx: number,
 *   rxSlope?: number,
 *   biasCurrent?: number,
 *   biasSlope?: number,
 *   temperatureC?: number,
 *   spanAsymmetryDb?: number
 * }} param0
 * @returns {{ classification: string, title: string, confidence: number, diagnosis: string, recommendation: string }}
 */
export function classifyOpticalRootCause({
  currentRx = -10,
  rxSlope = 0,
  biasCurrent = 25,
  biasSlope = 0,
  temperatureC = 38,
  spanAsymmetryDb = 0
}) {
  // 1. Asymmetric Fiber Fault
  if (spanAsymmetryDb >= 3.5) {
    return {
      classification: 'ASYMMETRIC_FIBER_FAULT',
      title: 'Асимметрия оптического пролета',
      confidence: 0.95,
      diagnosis: `Разница затухания между прямым и обратным волокном составляет ${spanAsymmetryDb.toFixed(1)} dB (допустимо до 1.5 dB).`,
      recommendation: 'Проверьте целостность волокна одиночной жилы дуплексного кабеля, качество сварки на оптическом кроссе ODF или состояние коннектора LC на встречной стороне.'
    };
  }

  // 2. Transceiver Thermal Stress
  if (temperatureC >= 68) {
    return {
      classification: 'THERMAL_STRESS',
      title: 'Термический перегрев SFP',
      confidence: 0.90,
      diagnosis: `Температура оптического модуля достигла +${temperatureC}°C (критический предел +70°C). Перегрев вызывает лавинообразную деградацию лазера.`,
      recommendation: 'Проверьте вентиляцию телекоммуникационного шкафа, работоспособность кулеров коммутатора и наличие теплового экранирования от соседних модулей.'
    };
  }

  // 3. Laser Diode Semiconductor Aging
  if (biasCurrent >= 45 || biasSlope >= 0.25) {
    return {
      classification: 'LASER_AGING',
      title: 'Деградация лазерного полупроводника',
      confidence: 0.92,
      diagnosis: `Ток смещения лазера повышен до ${biasCurrent} mA (норма 15-35 mA, тренд: +${biasSlope.toFixed(2)} mA/день). Внутренняя схема авторегулировки мощности исчерпывает запас ресурса.`,
      recommendation: 'Запланируйте превентивную замену SFP-трансивера. Ресурс лазерного диода близок к исчерпанию.'
    };
  }

  // 4. Connector Dirt / Micro-Bend
  if (currentRx < -15.0 && biasCurrent <= 35) {
    return {
      classification: 'CONNECTOR_DIRT_OR_BEND',
      title: 'Загрязнение коннектора или изгиб кабеля',
      confidence: 0.88,
      diagnosis: `Принимаемая мощность снизилась до ${currentRx.toFixed(1)} dBm при нормальном токе лазера (${biasCurrent} mA). Это свидетельствует о внешнем затухании в кабельном тракте.`,
      recommendation: 'Произведите очистку ферулы оптического коннектора LC/UPC безворсовой салфеткой с изопропиловым очистителем и проверьте радиус изгиба патч-корда в лотке (не менее 30 мм).'
    };
  }

  // 5. Optimal
  if (currentRx >= -14.5 && currentRx <= -2.0) {
    return {
      classification: 'OPTIMAL',
      title: 'Оптический тракт в норме',
      confidence: 1.0,
      diagnosis: `Уровень оптического сигнала (${currentRx.toFixed(1)} dBm) и ток смещения (${biasCurrent} mA) находятся в идеальном диапазоне.`,
      recommendation: 'Тракт работает стабильно, вмешательство инженера не требуется.'
    };
  }

  // 6. Generic attenuation warning
  return {
    classification: 'ATTENUATION_WARNING',
    title: 'Повышенное затухание в линии',
    confidence: 0.75,
    diagnosis: `Оптический уровень составляет ${currentRx.toFixed(1)} dBm. Запас оптического бюджета снижен.`,
    recommendation: 'Проконтролируйте уровни сигнала в динамике и проверьте промежуточные коммутационные панели.'
  };
}
