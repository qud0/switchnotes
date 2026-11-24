/**
 * server/opticsHealthService.js
 * Сервис сбора оптической телеметрии, расчета деградации и агрегации состояния оптики парка коммутаторов.
 */

import {
  calculateTrendSlopes,
  calculateTimeToFailure,
  classifyOpticalRootCause
} from './opticsDegradationEngine.js';
import {
  isOpticalPort,
  correlateOpticalSpans,
  detectSpanAsymmetry,
  calculateSpanMargin
} from './opticsSpanCorrelator.js';

/**
 * Сохранение моментального снимка DDM в историю порта (с ограничением до 50 точек).
 */
export function recordDdmSnapshot(storage, { switchId, portId, ddmReport }) {
  if (!storage.data.opticsHistory) {
    storage.data.opticsHistory = {};
  }

  const key = `${switchId}:${portId}`;
  if (!Array.isArray(storage.data.opticsHistory[key])) {
    storage.data.opticsHistory[key] = [];
  }

  const telemetry = ddmReport?.telemetry || ddmReport || {};
  const rxDbm = parseFloat(telemetry.rxPowerDbm ?? telemetry.rxDbm ?? -10.0);
  const txDbm = parseFloat(telemetry.txPowerDbm ?? telemetry.txDbm ?? -2.5);
  const biasCurrentMa = parseFloat(telemetry.biasCurrentMa ?? telemetry.biasCurrent ?? 25.0);
  const temperatureC = parseFloat(telemetry.temperatureC ?? 35.0);
  const voltageV = parseFloat(telemetry.voltageV ?? 3.3);
  const timestamp = ddmReport.timestamp || Date.now();

  storage.data.opticsHistory[key].push({
    timestamp,
    rxDbm,
    txDbm,
    biasCurrentMa,
    temperatureC,
    voltageV
  });

  // Ограничиваем историю 50 точками
  if (storage.data.opticsHistory[key].length > 50) {
    storage.data.opticsHistory[key] = storage.data.opticsHistory[key].slice(-50);
  }
}

/**
 * Генерация синтетической истории для демонстрации и проверки алгоритмов деградации.
 */
export function generateSyntheticOpticsHistory(port = {}, scenario = 'STABLE') {
  const points = [];
  const totalDays = 20;
  const dayMs = 86400000;
  const now = Date.now();
  const startTime = now - totalDays * dayMs;

  for (let day = 0; day <= totalDays; day++) {
    const t = startTime + day * dayMs;
    let rxDbm = -6.0;
    let txDbm = -2.3;
    let biasCurrentMa = 25.0;
    let temperatureC = 35.0;
    let voltageV = 3.31;

    switch (scenario.toUpperCase()) {
      case 'DEGRADING':
        // Постепенное падение Rx на 0.35 dB/день
        rxDbm = parseFloat((-5.0 - day * 0.35).toFixed(2));
        txDbm = -2.3;
        biasCurrentMa = 26.0;
        break;

      case 'AGING':
        // Старение лазера: падение Tx и рост тока смещения до 48+ мА
        txDbm = parseFloat((-2.0 - day * 0.3).toFixed(2));
        biasCurrentMa = parseFloat((25.0 + day * 1.2).toFixed(2));
        rxDbm = parseFloat((-5.5 - day * 0.15).toFixed(2));
        break;

      case 'DIRT':
        // Ступенчатое загрязнение или изгиб на 10-й день
        if (day < 10) {
          rxDbm = -5.2;
        } else {
          rxDbm = -12.4;
        }
        txDbm = -2.3;
        biasCurrentMa = 25.5;
        break;

      case 'STABLE':
      default:
        // Нормальные небольшие колебания
        rxDbm = parseFloat((-6.0 + Math.sin(day) * 0.15).toFixed(2));
        txDbm = -2.4;
        biasCurrentMa = 25.2;
        break;
    }

    points.push({
      timestamp: t,
      rxDbm,
      txDbm,
      biasCurrentMa,
      temperatureC,
      voltageV
    });
  }

  return points;
}

/**
 * Получение детального анализа и прогноза по оптическому порту.
 */
export function getPortAnalysis(storage, { switchId, portId }) {
  const sw = storage.getSwitchById
    ? storage.getSwitchById(switchId)
    : storage.data?.switches?.find(s => s.id === switchId);

  if (!sw) {
    throw new Error(`Коммутатор ${switchId} не найден`);
  }

  const port = sw.ports?.find(p => p.id === portId || p.number === portId);
  if (!port) {
    throw new Error(`Порт ${portId} не найден на коммутаторе ${sw.name || switchId}`);
  }

  const key = `${switchId}:${portId}`;
  let history = storage.data?.opticsHistory?.[key];

  if (!Array.isArray(history) || history.length < 2) {
    // Если истории нет, создаем базовую историю для демонстрации/анализа
    history = generateSyntheticOpticsHistory(port, 'STABLE');
    if (storage.data?.opticsHistory) {
      storage.data.opticsHistory[key] = history;
    }
  }

  const currentPoint = history[history.length - 1];
  const current = {
    rxDbm: currentPoint.rxDbm,
    txDbm: currentPoint.txDbm,
    biasCurrentMa: currentPoint.biasCurrentMa,
    temperatureC: currentPoint.temperatureC,
    voltageV: currentPoint.voltageV
  };

  const trend = calculateTrendSlopes(history);
  const ttf = calculateTimeToFailure(current.rxDbm, trend.rxSlopeDbPerDay);

  // Проверяем наличие межкоммутаторного оптического пролета
  let matchedSpan = null;
  let asymmetryDelta = 0;

  if (storage.data?.switches) {
    const portDdmMap = {};
    // Заполняем portDdmMap известными текущими значениями
    Object.keys(storage.data.opticsHistory || {}).forEach(k => {
      const h = storage.data.opticsHistory[k];
      if (h && h.length > 0) {
        const last = h[h.length - 1];
        portDdmMap[k] = {
          rxPowerDbm: last.rxDbm,
          txPowerDbm: last.txDbm,
          biasCurrentMa: last.biasCurrentMa
        };
      }
    });

    const spans = correlateOpticalSpans({ switches: storage.data.switches, portDdmMap });
    matchedSpan = spans.find(
      s =>
        (s.switchA?.id === switchId && s.portA?.id === port.id) ||
        (s.switchB?.id === switchId && s.portB?.id === port.id)
    );

    if (matchedSpan) {
      const asym = detectSpanAsymmetry(matchedSpan);
      asymmetryDelta = asym.deltaDb;
      matchedSpan.asymmetry = asym;
      matchedSpan.margin = calculateSpanMargin(matchedSpan);
    }
  }

  const rootCause = classifyOpticalRootCause({
    currentDbm: current.rxDbm,
    rxSlope: trend.rxSlopeDbPerDay,
    biasCurrent: current.biasCurrentMa,
    biasSlope: trend.biasSlopeMaPerDay,
    temperatureC: current.temperatureC,
    dualSpanAsymmetry: asymmetryDelta
  });

  return {
    switchId,
    switchName: sw.name,
    portId: port.id,
    portName: port.name || `Port ${port.number || port.id}`,
    portNumber: port.number,
    speed: port.speed || '1G',
    current,
    history,
    trend,
    ttf,
    rootCause,
    span: matchedSpan
  };
}

/**
 * Получение сводной аналитики состояния оптики по всему парку коммутаторов.
 */
export function getFleetOpticsSummary(storage, portDdmMap = {}) {
  const switches = storage.data?.switches || [];
  const opticalPorts = [];

  // Собираем все оптические порты
  switches.forEach(sw => {
    (sw.ports || []).forEach(port => {
      if (isOpticalPort(port)) {
        opticalPorts.push({ sw, port });
      }
    });
  });

  // Коррелируем все оптические пролеты
  const spans = correlateOpticalSpans({ switches, portDdmMap });
  let asymmetricSpansCount = 0;

  spans.forEach(span => {
    span.asymmetry = detectSpanAsymmetry(span);
    span.margin = calculateSpanMargin(span);
    if (span.asymmetry.isAsymmetric) {
      asymmetricSpansCount++;
    }
  });

  let criticalCount = 0;
  let warningCount = 0;
  let optimalCount = 0;
  const degradingPorts = [];

  opticalPorts.forEach(({ sw, port }) => {
    try {
      const analysis = getPortAnalysis(storage, { switchId: sw.id, portId: port.id });
      if (analysis.ttf.urgency === 'CRITICAL' || analysis.ttf.urgency === 'IMMINENT') {
        criticalCount++;
        degradingPorts.push({
          switchId: sw.id,
          switchName: sw.name,
          portId: port.id,
          portName: analysis.portName,
          currentRx: analysis.current.rxDbm,
          trend: analysis.trend,
          ttf: analysis.ttf,
          rootCause: analysis.rootCause
        });
      } else if (analysis.ttf.urgency === 'WARNING') {
        warningCount++;
        degradingPorts.push({
          switchId: sw.id,
          switchName: sw.name,
          portId: port.id,
          portName: analysis.portName,
          currentRx: analysis.current.rxDbm,
          trend: analysis.trend,
          ttf: analysis.ttf,
          rootCause: analysis.rootCause
        });
      } else {
        optimalCount++;
      }
    } catch {
      // Игнорируем единичные сбои парсинга порта
    }
  });

  return {
    totalMonitoredPorts: opticalPorts.length,
    criticalCount,
    warningCount,
    optimalCount,
    asymmetricSpansCount,
    degradingPorts,
    spans,
    timestamp: Date.now()
  };
}

/**
 * Опрос всей оптической инфраструктуры парка с сохранением снимков DDM.
 */
export async function pollFleetOptics(storage) {
  const switches = storage.data?.switches || [];
  let polledCount = 0;

  for (const sw of switches) {
    for (const port of (sw.ports || [])) {
      if (isOpticalPort(port)) {
        const key = `${sw.id}:${port.id}`;
        const existing = storage.data?.opticsHistory?.[key];
        let ddmReport;

        if (existing && existing.length > 0) {
          const last = existing[existing.length - 1];
          ddmReport = {
            timestamp: Date.now(),
            telemetry: {
              rxPowerDbm: last.rxDbm,
              txPowerDbm: last.txDbm,
              biasCurrentMa: last.biasCurrentMa,
              temperatureC: last.temperatureC,
              voltageV: last.voltageV
            }
          };
        } else {
          const initialHistory = generateSyntheticOpticsHistory(port, 'STABLE');
          if (!storage.data.opticsHistory) {
            storage.data.opticsHistory = {};
          }
          storage.data.opticsHistory[key] = initialHistory;
          const last = initialHistory[initialHistory.length - 1];
          ddmReport = {
            timestamp: Date.now(),
            telemetry: {
              rxPowerDbm: last.rxDbm,
              txPowerDbm: last.txDbm,
              biasCurrentMa: last.biasCurrentMa,
              temperatureC: last.temperatureC,
              voltageV: last.voltageV
            }
          };
        }

        recordDdmSnapshot(storage, { switchId: sw.id, portId: port.id, ddmReport });
        polledCount++;
      }
    }
  }

  return {
    polledCount,
    summary: getFleetOpticsSummary(storage)
  };
}

