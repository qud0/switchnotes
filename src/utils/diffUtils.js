/**
 * diffUtils.js
 * Алгоритм построения построчного сравнения (Diff) для конфигураций сетевого оборудования
 * Реализует LCS (Longest Common Subsequence) и форматирование Side-by-Side / Unified
 */

/**
 * Вычисление таблицы LCS для массивов строк
 */
function computeLcsMatrix(linesA, linesB) {
  const m = linesA.length;
  const n = linesB.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (linesA[i] === linesB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  return dp;
}

/**
 * Построчное сравнение двух текстов конфигураций
 * @param {string} textA - Базовый текст (старая версия)
 * @param {string} textB - Новый текст (новая версия)
 * @returns {Object} { rows: Array, stats: Object, isIdentical: boolean }
 */
export function computeConfigDiff(textA = '', textB = '') {
  const linesA = (textA || '').replace(/\r/g, '').split('\n');
  const linesB = (textB || '').replace(/\r/g, '').split('\n');

  if (textA.trim() === textB.trim()) {
    return {
      rows: linesA.map((line, idx) => ({
        type: 'unchanged',
        lineA: idx + 1,
        lineB: idx + 1,
        textA: line,
        textB: line,
        text: line
      })),
      stats: {
        added: 0,
        removed: 0,
        unchanged: linesA.length,
        totalA: linesA.length,
        totalB: linesB.length
      },
      isIdentical: true
    };
  }

  const dp = computeLcsMatrix(linesA, linesB);
  let i = linesA.length;
  let j = linesB.length;
  const rawDiff = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      rawDiff.push({
        type: 'unchanged',
        lineA: i,
        lineB: j,
        textA: linesA[i - 1],
        textB: linesB[j - 1],
        text: linesA[i - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.push({
        type: 'added',
        lineA: null,
        lineB: j,
        textA: '',
        textB: linesB[j - 1],
        text: linesB[j - 1]
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.push({
        type: 'removed',
        lineA: i,
        lineB: null,
        textA: linesA[i - 1],
        textB: '',
        text: linesA[i - 1]
      });
      i--;
    }
  }

  const rows = rawDiff.reverse();

  let added = 0;
  let removed = 0;
  let unchanged = 0;

  rows.forEach(r => {
    if (r.type === 'added') added++;
    else if (r.type === 'removed') removed++;
    else unchanged++;
  });

  return {
    rows,
    stats: {
      added,
      removed,
      unchanged,
      totalA: linesA.length,
      totalB: linesB.length
    },
    isIdentical: added === 0 && removed === 0
  };
}

/**
 * Подсветка синтаксиса для конфигураций (MikroTik RouterOS, Cisco/SNR, Ubiquiti)
 */
export function formatConfigLine(line = '') {
  if (!line) return '';
  const trimmed = line.trim();

  // Comments
  if (trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('//')) {
    return { isComment: true, text: line };
  }

  // RouterOS section headers (/interface, /ip, /system)
  if (trimmed.startsWith('/')) {
    return { isSection: true, text: line };
  }

  // Key commands (set, add, interface, switchport, vlan)
  const isCommand = /^(add|set|interface|switchport|vlan|hostname|ip|sflow|snmp|network|description)\b/i.test(trimmed);

  return { isCommand, text: line };
}
