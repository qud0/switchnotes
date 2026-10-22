/**
 * Утилиты расчёта длин кабельных трасс, запасов ВОЛС и оптического бюджета потерь
 */

// Стандартные коэффициенты затухания оптического волокна (дБ / км)
export const FIBER_STANDARDS = {
  'SMF_1310': { name: 'Одномод SMF (1310 нм)', lossPerKm: 0.35, maxDistKm: 40 },
  'SMF_1550': { name: 'Одномод SMF (1550 нм)', lossPerKm: 0.22, maxDistKm: 80 },
  'MMF_OM3': { name: 'Многомод OM3 (850 нм)', lossPerKm: 3.0, maxDistKm: 0.3 },
  'MMF_OM4': { name: 'Многомод OM4 (850 нм)', lossPerKm: 2.8, maxDistKm: 0.55 }
};

// Нормативы потерь на пассивных элементах (дБ) по ГОСТ Р 53246 / TIA-568
export const PASSIVE_LOSS = {
  FUSION_SPLICE: 0.05, // Потеря на сварном стыке волокна (в среднем 0.03 - 0.05 дБ)
  MECHANICAL_SPLICE: 0.2, // Механический сплайс
  CONNECTOR_PAIR: 0.35, // Разъёмное соединение (пара коннекторов LC/SC)
  SAFETY_MARGIN: 2.0 // Эксплуатационный запас старения кабеля (дБ)
};

/**
 * Расчёт евклидова расстояния на генплане с масштабированием (1 пиксель ~ 0.5 метра)
 */
export function calculateDistanceMeters(p1, p2, scale = 0.5) {
  const dx = (p2.x - p1.x);
  const dy = (p2.y - p1.y);
  const pxDist = Math.hypot(dx, dy);
  return Math.round(pxDist * scale);
}

/**
 * Расчёт оптического бюджета трассы ВОЛС
 * @param {Object} params
 * @param {number} params.lengthMeters Длина кабеля в метрах
 * @param {number} params.splicesCount Количество сварок
 * @param {number} params.connectorsCount Количество пар оптических коннекторов (обычно 2 или 4)
 * @param {string} params.fiberType Тип волокна ('SMF_1310' | 'SMF_1550' | 'MMF_OM3')
 * @param {number} [params.sfpPowerBudgetDb=14] Мощность оптического бюджета трансивера (напр. SFP-10G-LR = 10-14 дБ)
 */
export function calculateOpticalBudget({
  lengthMeters = 100,
  splicesCount = 2,
  connectorsCount = 2,
  fiberType = 'SMF_1310',
  sfpPowerBudgetDb = 14
}) {
  const std = FIBER_STANDARDS[fiberType] || FIBER_STANDARDS['SMF_1310'];
  const lengthKm = lengthMeters / 1000;

  // 1. Потери в самом волокне
  const fiberLoss = lengthKm * std.lossPerKm;

  // 2. Потери на сварных соединениях
  const spliceLoss = splicesCount * PASSIVE_LOSS.FUSION_SPLICE;

  // 3. Потери на разъёмах
  const connectorLoss = connectorsCount * PASSIVE_LOSS.CONNECTOR_PAIR;

  // 4. Эксплуатационный запас
  const safetyMargin = PASSIVE_LOSS.SAFETY_MARGIN;

  // Итоговое расчетное затухание (дБ)
  const totalLossDb = Number((fiberLoss + spliceLoss + connectorLoss + safetyMargin).toFixed(2));

  // Оставшийся запас мощности (дБ)
  const marginDb = Number((sfpPowerBudgetDb - totalLossDb).toFixed(2));
  const isHealthy = marginDb > 0;

  let status = 'excellent'; // > 5 dB запаса
  if (marginDb < 0) status = 'critical'; // сигнал не дойдёт
  else if (marginDb < 2) status = 'warning'; // на грани срыва линка

  return {
    fiberLoss: Number(fiberLoss.toFixed(2)),
    spliceLoss: Number(spliceLoss.toFixed(2)),
    connectorLoss: Number(connectorLoss.toFixed(2)),
    safetyMargin,
    totalLossDb,
    sfpPowerBudgetDb,
    marginDb,
    isHealthy,
    status
  };
}
