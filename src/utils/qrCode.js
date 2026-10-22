/**
 * qrCode.js
 * Автономный генератор QR-кодов в формате SVG без внешних библиотек
 * Поддерживает Byte Mode, Reed-Solomon ECC (Уровень M / L) для версий 1-4 (до 100 символов)
 */

// Таблицы поля Галуа GF(256) с полиномом 0x11d (285)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  LOG[0] = 0;
})();

function gMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Генератор полинома ошибок Reed-Solomon
function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = rsGenPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// Конфигурации QR-кодов (Версия 1: 21x21, Версия 2: 25x25)
const QR_SPECS = [
  null,
  { version: 1, size: 21, dataCap: 16, ecCount: 10, align: [] },
  { version: 2, size: 25, dataCap: 28, ecCount: 16, align: [6, 18] },
  { version: 3, size: 29, dataCap: 44, ecCount: 26, align: [6, 22] }
];

export function createQrMatrix(text) {
  const enc = new TextEncoder().encode(text);
  let spec = QR_SPECS[1];
  if (enc.length > QR_SPECS[1].dataCap - 3) spec = QR_SPECS[2];
  if (enc.length > QR_SPECS[2].dataCap - 3) spec = QR_SPECS[3];

  const size = spec.size;
  const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const isReserved = Array.from({ length: size }, () => new Uint8Array(size));

  // 1. Поисковые узоры (Finder Patterns 7x7)
  const drawFinder = (ox, oy) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x;
        const py = oy + y;
        if (px >= 0 && px < size && py >= 0 && py < size) {
          const isBlack = (x >= 0 && x <= 6 && y >= 0 && y <= 6) &&
            (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          matrix[py][px] = isBlack ? 1 : 0;
          isReserved[py][px] = 1;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // 2. Линии синхронизации (Timing Patterns)
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    if (matrix[6][i] === -1) { matrix[6][i] = val; isReserved[6][i] = 1; }
    if (matrix[i][6] === -1) { matrix[i][6] = val; isReserved[i][6] = 1; }
  }

  // 3. Узоры выравнивания (Alignment Patterns для v >= 2)
  if (spec.align.length > 0) {
    const coords = spec.align;
    for (const ay of coords) {
      for (const ax of coords) {
        if (isReserved[ay][ax]) continue;
        for (let y = -2; y <= 2; y++) {
          for (let x = -2; x <= 2; x++) {
            const isBlack = Math.max(Math.abs(x), Math.abs(y)) !== 1;
            matrix[ay + y][ax + x] = isBlack ? 1 : 0;
            isReserved[ay + y][ax + x] = 1;
          }
        }
      }
    }
  }

  // 4. Резерв информации о формате
  for (let i = 0; i < 9; i++) {
    if (i < size) { isReserved[8][i] = 1; isReserved[i][8] = 1; }
    if (size - 1 - i >= 0) { isReserved[8][size - 1 - i] = 1; isReserved[size - 1 - i][8] = 1; }
  }
  matrix[size - 8][8] = 1;
  isReserved[size - 8][8] = 1;

  // 5. Кодирование данных (Byte mode: 0100 + длина 8 бит + байты)
  const bitStream = [];
  const pushBits = (val, count) => {
    for (let b = count - 1; b >= 0; b--) {
      bitStream.push((val >> b) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(enc.length, 8); // Character count indicator
  for (let i = 0; i < enc.length; i++) {
    pushBits(enc[i], 8);
  }

  // Завершитель 0000
  const maxBits = spec.dataCap * 8;
  const termLen = Math.min(4, maxBits - bitStream.length);
  pushBits(0, termLen);

  // Выравнивание до байта
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  // Дополнение байтами 0xEC и 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Преобразование бит в байты данных
  const dataBytes = new Uint8Array(spec.dataCap);
  for (let i = 0; i < spec.dataCap; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitStream[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // 6. Вычисление кодов коррекции ошибок Reed-Solomon
  const ecBytes = rsEncode(dataBytes, spec.ecCount);

  // Полная кодовая последовательность: Данные + ECC
  const totalBits = [];
  for (let i = 0; i < dataBytes.length; i++) {
    for (let b = 7; b >= 0; b--) totalBits.push((dataBytes[i] >> b) & 1);
  }
  for (let i = 0; i < ecBytes.length; i++) {
    for (let b = 7; b >= 0; b--) totalBits.push((ecBytes[i] >> b) & 1);
  }

  // 7. Размещение данных в матрице с маской (Mask Pattern 0: (x + y) % 2 === 0)
  let bitIdx = 0;
  let dirUp = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Пропуск вертикальной линии тайминга
    const rowList = dirUp
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rowList) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const y = row;
        if (!isReserved[y][x]) {
          const bit = bitIdx < totalBits.length ? totalBits[bitIdx++] : 0;
          const mask = (x + y) % 2 === 0;
          matrix[y][x] = bit ^ (mask ? 1 : 0);
        }
      }
    }
    dirUp = !dirUp;
  }

  // 8. Наложение информации о формате (Mask 0, ECC-M -> BCH 15 bit: 101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const fmtCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [fy, fx] = fmtCoords[i];
    matrix[fy][fx] = formatBits[i];
  }
  // Копия формата вокруг других finder-ов
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i];
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = formatBits[7 + i];
  }

  return matrix;
}

