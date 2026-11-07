/**
 * wifiHeatmap.js
 * Алгоритм моделирования радиопокрытия Wi-Fi (2.4 GHz, 5 GHz, 6 GHz)
 * Реализует ITU-R P.1238 / Log-Distance Path Loss Model с расчетом затухания в перегородках
 */

/**
 * Проверка пересечения двух отрезков (A-B и C-D)
 */
function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return false;

  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = -((x1 - x2) * (y3 - y1) - (y1 - y2) * (x3 - x1)) / d;

  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

/**
 * Подсчет числа стен между точкой AP и целевой точкой
 */
export function countIntersectingWalls(x1, y1, x2, y2, rooms = []) {
  let wallsCount = 0;

  for (const r of rooms) {
    const rx = r.x;
    const ry = r.y;
    const rw = r.w;
    const rh = r.h;

    // 4 edges of the room
    if (lineSegmentsIntersect(x1, y1, x2, y2, rx, ry, rx + rw, ry)) wallsCount++;
    if (lineSegmentsIntersect(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh)) wallsCount++;
    if (lineSegmentsIntersect(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh)) wallsCount++;
    if (lineSegmentsIntersect(x1, y1, x2, y2, rx, ry + rh, rx, ry)) wallsCount++;

    if (wallsCount >= 8) break; // clamp max walls to avoid extreme degradation
  }

  return wallsCount;
}

/**
 * Расчет RSSI в точке от конкретной AP
 * @param {Object} params
 * @param {number} params.apX
 * @param {number} params.apY
 * @param {number} params.targetX
 * @param {number} params.targetY
 * @param {number} [params.txPowerDb=20] Мощность передатчика в dBm
 * @param {number} [params.freqMhz=5180] Частота в МГц (2412 для 2.4G, 5180 для 5G)
 * @param {number} [params.wallLossDb=6] Затухание на каждой стене
 * @param {Array}  [params.rooms=[]] Помещения со стенами
 * @param {number} [params.scale=0.05] Масштаб (метров в 1 пикселе)
 * @returns {number} RSSI в dBm
 */
export function calculatePointRssi({
  apX,
  apY,
  targetX,
  targetY,
  txPowerDb = 20,
  freqMhz = 5180,
  wallLossDb = 6,
  rooms = [],
  scale = 0.05
}) {
  const dxMeters = (targetX - apX) * scale;
  const dyMeters = (targetY - apY) * scale;
  const distMeters = Math.max(0.6, Math.hypot(dxMeters, dyMeters));

  // Free-Space Path Loss (FSPL) in dB: 20*log10(d) + 20*log10(f) - 27.55
  const fspl = 20 * Math.log10(distMeters) + 20 * Math.log10(freqMhz) - 27.55;

  // Obstacle / Wall loss
  const walls = countIntersectingWalls(apX, apY, targetX, targetY, rooms);
  const wallAbsorption = walls * wallLossDb;

  return Math.round((txPowerDb - fspl - wallAbsorption) * 10) / 10;
}

/**
 * Преобразование значения RSSI в цвет тепловой карты
 */
export function rssiToRgba(rssi, cutoff = -85) {
  if (rssi < cutoff) return [0, 0, 0, 0];

  // Colors:
  // >= -50 dBm: Emerald green
  // -60 dBm: Light green
  // -70 dBm: Amber/Yellow
  // -78 dBm: Orange
  // -85 dBm: Dark red / Rose
  if (rssi >= -50) {
    return [16, 185, 129, 215]; // #10b981
  } else if (rssi >= -65) {
    const t = (rssi - (-65)) / 15;
    return [
      Math.round(34 + (16 - 34) * t),
      Math.round(197 + (185 - 197) * t),
      Math.round(94 + (129 - 94) * t),
      Math.round(175 + (215 - 175) * t)
    ];
  } else if (rssi >= -75) {
    const t = (rssi - (-75)) / 10;
    return [
      Math.round(234 + (34 - 234) * t),
      Math.round(179 + (197 - 179) * t),
      Math.round(8 + (94 - 8) * t),
      Math.round(145 + (175 - 145) * t)
    ];
  } else if (rssi >= -82) {
    const t = (rssi - (-82)) / 7;
    return [
      Math.round(249 + (234 - 249) * t),
      Math.round(115 + (179 - 115) * t),
      Math.round(22 + (8 - 22) * t),
      Math.round(115 + (145 - 115) * t)
    ];
  } else {
    const t = (rssi - cutoff) / ((-82) - cutoff);
    return [225, 29, 72, Math.round(40 + (115 - 40) * t)];
  }
}

/**
 * Отрисовка сетки тепловой карты Wi-Fi на Canvas
 */
export function renderWifiHeatmap({
  canvas,
  aps = [],
  rooms = [],
  txPowerDb = 20,
  freqMhz = 5180,
  wallLossDb = 6,
  cutoffThreshold = -85,
  width = 960,
  height = 640,
  step = 10
}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);

  // Offscreen buffer for fast rendering
  const offscreen = document.createElement('canvas');
  offscreen.width = cols;
  offscreen.height = rows;
  const offCtx = offscreen.getContext('2d');
  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const targetY = r * step;
    for (let c = 0; c < cols; c++) {
      const targetX = c * step;

      let maxRssi = -120;
      for (const ap of aps) {
        const apRssi = calculatePointRssi({
          apX: ap.x,
          apY: ap.y,
          targetX,
          targetY,
          txPowerDb,
          freqMhz,
          wallLossDb,
          rooms
        });
        if (apRssi > maxRssi) maxRssi = apRssi;
      }

      const pixelIdx = (r * cols + c) * 4;
      const [red, green, blue, alpha] = rssiToRgba(maxRssi, cutoffThreshold);
      data[pixelIdx] = red;
      data[pixelIdx + 1] = green;
      data[pixelIdx + 2] = blue;
      data[pixelIdx + 3] = alpha;
    }
  }

  offCtx.putImageData(imgData, 0, 0);

  // Clear main canvas and draw scaled smoothed image
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, width, height);
}
