/**
 * exportUtils.js - Универсальная утилита экспорта данных в CSV (Excel-совместимый UTF-8 BOM)
 */

/**
 * Экранирование ячейки для безопасного CSV
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Экспорт набора данных в файл CSV с кодировкой UTF-8 BOM
 * @param {string} filename - Имя файла без расширения
 * @param {string[]} headers - Заголовки колонок
 * @param {Array<Array<any>>} rows - Строки данных
 */
export function downloadCsv(filename, headers, rows) {
  const headerLine = headers.map(escapeCsvCell).join(';');
  const rowLines = rows.map(row => row.map(escapeCsvCell).join(';'));
  
  // Добавляем \uFEFF (UTF-8 BOM), чтобы Excel на Windows открывал кириллицу корректно
  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `${filename}_${dateStr}.csv`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
