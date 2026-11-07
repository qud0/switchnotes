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

/**
 * Генерация скрипта отката (Rollback CLI) на основе различий двух конфигураций
 * @param {Array} diffRows - Строки diff, полученные из computeConfigDiff(textA, textB)
 *                           где A = Базовая версия (к которой откатываемся),
 *                               B = Текущая версия (с нежелательными изменениями).
 * @param {string} vendor - Вендор оборудования ('MikroTik', 'SNR', 'Cisco', 'Ubiquiti')
 * @param {Object} options - Дополнительные параметры
 * @returns {Object} { script: string, rollbackCommandsCount: number, summary: string }
 */
export function generateRollbackScript(diffRows = [], vendor = 'MikroTik', options = {}) {
  const v = (vendor || 'mikrotik').toLowerCase();
  const rollbackLines = [];
  let currentContext = null;
  let commandsCount = 0;

  const addedInCurrent = diffRows.filter(r => r.type === 'added');
  const removedInCurrent = diffRows.filter(r => r.type === 'removed');

  const timestamp = new Date().toLocaleString('ru-RU');
  
  if (v.includes('mikrotik')) {
    rollbackLines.push(`# ==============================================================================`);
    rollbackLines.push(`# MIKROTIK ROUTEROS ROLLBACK SCRIPT`);
    rollbackLines.push(`# Автоматически сформировано SwitchBook Config Drift Engine`);
    rollbackLines.push(`# Дата формирования: ${timestamp}`);
    rollbackLines.push(`# Назначение: Откат изменений текущей конфигурации к базовой ревизии`);
    rollbackLines.push(`# ==============================================================================`);
    rollbackLines.push(``);

    // 1. Отмена добавленных команд (удаление добавленных записей)
    if (addedInCurrent.length > 0) {
      rollbackLines.push(`# --- [ЭТАП 1] Удаление новых записей и сброс добавленных параметров ---`);
      
      let currentSection = '';
      addedInCurrent.forEach(row => {
        const line = (row.textB || '').trim();
        if (!line || line.startsWith('#')) return;

        if (line.startsWith('/')) {
          currentSection = line;
          return;
        }

        // Если это команда add
        if (line.startsWith('add ') || (currentSection && line.startsWith('add '))) {
          commandsCount++;
          // Извлекаем ключевой идентификатор (например name=..., comment=..., vlan-ids=...)
          const nameMatch = line.match(/(?:name|interface|vlan-ids|comment|address)=([^\s]+)/);
          const fullSection = line.startsWith('/') ? line.split(' ')[0] : currentSection;
          
          if (nameMatch) {
            rollbackLines.push(`${fullSection} remove [find ${nameMatch[0]}]`);
          } else {
            rollbackLines.push(`# Внимание: требуется ручная проверка для удаления: ${currentSection} ${line}`);
            rollbackLines.push(`${fullSection} remove [find ...]`);
          }
        } else if (line.startsWith('set ') || (currentSection && line.startsWith('set '))) {
          commandsCount++;
          rollbackLines.push(`# Сброс измененного параметра:`);
          rollbackLines.push(`${currentSection || ''} ${line} disabled=yes`);
        } else {
          commandsCount++;
          rollbackLines.push(`# Отмена: ${currentSection ? currentSection + ' ' : ''}${line}`);
        }
      });
      rollbackLines.push(``);
    }

    // 2. Восстановление удаленных команд из базовой версии
    if (removedInCurrent.length > 0) {
      rollbackLines.push(`# --- [ЭТАП 2] Восстановление удаленных настроек из базовой версии ---`);
      let currentSection = '';
      removedInCurrent.forEach(row => {
        const line = (row.textA || '').trim();
        if (!line || line.startsWith('#')) return;

        if (line.startsWith('/')) {
          currentSection = line;
          rollbackLines.push(line);
          return;
        }

        commandsCount++;
        if (currentSection && !line.startsWith('/')) {
          rollbackLines.push(`${currentSection} ${line}`);
        } else {
          rollbackLines.push(line);
        }
      });
      rollbackLines.push(``);
    }

    rollbackLines.push(`# [ЭТАП 3] Фиксация и сохранение конфигурации`);
    rollbackLines.push(`/system logging info message="[SwitchBook] Rollback script successfully executed"`);

  } else if (v.includes('snr') || v.includes('cisco') || v.includes('ubiquiti') || v.includes('unifi')) {
    const isSNR = v.includes('snr');
    const isUbiquiti = v.includes('ubiquiti') || v.includes('unifi');
    const brandName = isSNR ? 'SNR NAG (Comware/CLI)' : isUbiquiti ? 'Ubiquiti EdgeSwitch' : 'Cisco IOS';

    rollbackLines.push(`! ==============================================================================`);
    rollbackLines.push(`! ${brandName.toUpperCase()} ROLLBACK SCRIPT`);
    rollbackLines.push(`! Автоматически сформировано SwitchBook Config Drift Engine`);
    rollbackLines.push(`! Дата формирования: ${timestamp}`);
    rollbackLines.push(`! ==============================================================================`);
    rollbackLines.push(``);
    rollbackLines.push(`configure terminal`);
    rollbackLines.push(``);

    // 1. Отмена добавленных команд через 'no ...'
    if (addedInCurrent.length > 0) {
      rollbackLines.push(`! --- [ШАГ 1] Отмена добавленных команд (no-команды) ---`);
      let inInterface = null;
      let inVlan = null;

      addedInCurrent.forEach(row => {
        const line = (row.textB || '').trim();
        if (!line || line.startsWith('!') || line.startsWith('#')) return;

        if (/^interface\s+/i.test(line)) {
          if (inInterface) rollbackLines.push(` exit`);
          inInterface = line;
          rollbackLines.push(line);
          return;
        }

        if (/^vlan\s+\d+/i.test(line)) {
          if (inVlan) rollbackLines.push(` exit`);
          inVlan = line;
          rollbackLines.push(line);
          return;
        }

        if (/^(exit|end)/i.test(line)) {
          if (inInterface || inVlan) rollbackLines.push(` exit`);
          inInterface = null;
          inVlan = null;
          return;
        }

        commandsCount++;
        // Если это удаление vlan или интерфейса целиком
        if (/^no\s+/i.test(line)) {
          // Если добавили 'no ...', то откат - выполнить саму команду без 'no'
          rollbackLines.push(` ${line.replace(/^no\s+/i, '')}`);
        } else if (/^switchport trunk allowed vlan add\s+(.+)/i.test(line)) {
          const vlans = line.match(/^switchport trunk allowed vlan add\s+(.+)/i)[1];
          rollbackLines.push(` switchport trunk allowed vlan remove ${vlans}`);
        } else {
          // Стандартный no префикс
          rollbackLines.push(` no ${line}`);
        }
      });

      if (inInterface || inVlan) {
        rollbackLines.push(` exit`);
      }
      rollbackLines.push(``);
    }

    // 2. Восстановление удаленных команд
    if (removedInCurrent.length > 0) {
      rollbackLines.push(`! --- [ШАГ 2] Восстановление исходных команд из базовой версии ---`);
      removedInCurrent.forEach(row => {
        const line = (row.textA || '').trim();
        if (!line || line.startsWith('!') || line.startsWith('#')) return;
        commandsCount++;
        rollbackLines.push(line);
      });
      rollbackLines.push(``);
    }

    rollbackLines.push(`! --- [ШАГ 3] Сохранение конфигурации в энергонезависимую память ---`);
    rollbackLines.push(`end`);
    rollbackLines.push(isSNR ? `write` : `write memory`);
  }

  const script = rollbackLines.join('\n');
  const summary = `Команд отката: ${commandsCount} (Отмена: ${addedInCurrent.length}, Восстановление: ${removedInCurrent.length})`;

  return {
    script,
    rollbackCommandsCount: commandsCount,
    addedCount: addedInCurrent.length,
    removedCount: removedInCurrent.length,
    summary
  };
}
