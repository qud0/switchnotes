/**
 * exportGraphics.js
 * Универсальная утилита экспорта схем (SVG, PNG, CSV, PDF/Печать)
 * Поддерживает поэтажные планы СКС, серверные стойки 42U и топологию сети
 */

/**
 * Внедрение вычисленных стилей CSS в клон SVG для автономного рендеринга
 * (чтобы классы Tailwind и темы оставались точными при открытии вне браузера)
 */
function inlineSvgStyles(sourceElement, targetElement) {
  try {
    const srcNodes = [sourceElement, ...sourceElement.querySelectorAll('*')];
    const tgtNodes = [targetElement, ...targetElement.querySelectorAll('*')];
    const count = Math.min(srcNodes.length, tgtNodes.length);

    for (let i = 0; i < count; i++) {
      const src = srcNodes[i];
      const tgt = tgtNodes[i];
      if (src && tgt && src.nodeType === 1) {
        const computed = window.getComputedStyle(src);
        
        // Внедряем ключевые стили векторной графики
        if (computed.fill && computed.fill !== 'none' && !tgt.getAttribute('fill')) {
          tgt.style.fill = computed.fill;
        }
        if (computed.stroke && computed.stroke !== 'none' && !tgt.getAttribute('stroke')) {
          tgt.style.stroke = computed.stroke;
        }
        if (computed.strokeWidth && computed.strokeWidth !== '0px' && !tgt.getAttribute('stroke-width')) {
          tgt.style.strokeWidth = computed.strokeWidth;
        }
        if (computed.strokeDasharray && computed.strokeDasharray !== 'none') {
          tgt.style.strokeDasharray = computed.strokeDasharray;
        }
        if (computed.opacity && computed.opacity !== '1') {
          tgt.style.opacity = computed.opacity;
        }
        if (computed.fontFamily) {
          tgt.style.fontFamily = computed.fontFamily;
        }
        if (computed.fontSize) {
          tgt.style.fontSize = computed.fontSize;
        }
        if (computed.fontWeight) {
          tgt.style.fontWeight = computed.fontWeight;
        }
        if (computed.color) {
          tgt.style.color = computed.color;
        }
      }
    }
  } catch (e) {
    console.warn('inlineSvgStyles warning:', e);
  }
}

/**
 * Скачивание векторного SVG файла
 * @param {SVGElement} svgElement - DOM узел <svg>
 * @param {string} filename - Имя сохраняемого файла без расширения
 */
export function exportSvgToFile(svgElement, filename = 'schema') {
  if (!svgElement) return;

  try {
    const clone = svgElement.cloneNode(true);
    inlineSvgStyles(svgElement, clone);

    const width = svgElement.clientWidth || svgElement.viewBox?.baseVal?.width || 1000;
    const height = svgElement.clientHeight || svgElement.viewBox?.baseVal?.height || 700;

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const styleElem = document.createElement('style');
    styleElem.textContent = `
      text { font-family: 'Ubuntu Sans', system-ui, -apple-system, sans-serif; }
      .font-mono { font-family: 'Ubuntu Mono', monospace; }
    `;
    clone.insertBefore(styleElem, clone.firstChild);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clone);

    if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка экспорта SVG:', err);
    alert(`Не удалось экспортировать SVG: ${err.message}`);
  }
}

/**
 * Конвертация SVG в растровое изображение высокой четкости (PNG)
 * @param {SVGElement} svgElement - DOM узел <svg>
 * @param {string} filename - Имя сохраняемого файла
 * @param {Object} options - Настройки экспорта (scale, backgroundColor)
 */
export async function exportSvgToPng(svgElement, filename = 'schema', options = {}) {
  if (!svgElement) return;

  const {
    scale = 2, // 2x для Retina/HD качества
    backgroundColor = null
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const clone = svgElement.cloneNode(true);
      inlineSvgStyles(svgElement, clone);

      const width = svgElement.clientWidth || svgElement.viewBox?.baseVal?.width || 1000;
      const height = svgElement.clientHeight || svgElement.viewBox?.baseVal?.height || 700;

      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      }

      const styleElem = document.createElement('style');
      styleElem.textContent = `
        text { font-family: 'Ubuntu Sans', system-ui, -apple-system, sans-serif; }
        .font-mono { font-family: 'Ubuntu Mono', monospace; }
      `;
      clone.insertBefore(styleElem, clone.firstChild);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clone);
      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        if (backgroundColor) {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Не удалось сгенерировать PNG blob'));
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, 'image/png');
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Ошибка загрузки SVG изображения в Canvas'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Печать схемы / сохранение в PDF через окно печати браузера
 * @param {string} title
 */
export function printDiagram(title = 'Схема') {
  const originalTitle = document.title;
  document.title = `${title}_${new Date().toISOString().slice(0, 10)}`;
  window.print();
  document.title = originalTitle;
}

/**
 * Генерация векторного SVG чертежа стойки 42U со всем оборудованием и трассами
 */
export function generateRackSvgString({
  rackName = 'Rack',
  rackDevices = [],
  unitMap = {},
  intraRackPatchCords = [],
  dcimMetrics = {},
  isLight = false
}) {
  const totalUnits = 42;
  const unitRowHeight = 44;
  const headerHeight = 120;
  const footerHeight = 60;
  const rackInnerHeight = totalUnits * unitRowHeight;
  const totalHeight = headerHeight + rackInnerHeight + footerHeight;
  const totalWidth = 920;

  // Цветовая палитра
  const colors = isLight
    ? {
        bg: '#f8fafc',
        frame: '#e2e8f0',
        frameBorder: '#94a3b8',
        rail: '#cbd5e1',
        railBorder: '#94a3b8',
        text: '#0f172a',
        textDim: '#64748b',
        blankBg: '#f1f5f9',
        blankBorder: '#e2e8f0',
        switchBg: '#e2e8f0',
        switchBorder: '#3b82f6',
        ppBg: '#f1f5f9',
        ppBorder: '#64748b',
        serverBg: '#e2e8f0',
        serverBorder: '#8b5cf6'
      }
    : {
        bg: '#020617',
        frame: '#0f172a',
        frameBorder: '#334155',
        rail: '#090d16',
        railBorder: '#1e293b',
        text: '#f8fafc',
        textDim: '#94a3b8',
        blankBg: '#090d16',
        blankBorder: '#1e293b',
        switchBg: '#1e293b',
        switchBorder: '#3b82f6',
        ppBg: '#111827',
        ppBorder: '#64748b',
        serverBg: '#18181b',
        serverBorder: '#a855f7'
      };

  const occupiedUnits = Object.keys(unitMap).length;
  const percent = Math.round((occupiedUnits / totalUnits) * 100);

  // SVG Header & Definitions
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <defs>
    <style>
      text { font-family: 'Ubuntu Sans', system-ui, -apple-system, sans-serif; }
      .mono { font-family: 'Ubuntu Mono', monospace; }
    </style>
    <filter id="cord-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${totalWidth}" height="${totalHeight}" fill="${colors.bg}" />

  <!-- Top Title & DCIM Specification Banner -->
  <g transform="translate(40, 25)">
    <circle cx="10" cy="15" r="5" fill="#10b981" />
    <text x="24" y="20" fill="${colors.text}" font-size="18" font-weight="bold" class="mono">
      ${rackName.toUpperCase()} — 42U 19" EIA-310-E SERVER CABINET
    </text>
    <text x="24" y="42" fill="${colors.textDim}" font-size="12">
      Электронный паспорт и чертеж серверного шкафа • Дата выгрузки: ${new Date().toLocaleDateString('ru-RU')}
    </text>

    <!-- DCIM Metrics Block -->
    <rect x="0" y="55" width="840" height="42" rx="8" fill="${colors.frame}" stroke="${colors.frameBorder}" />
    <text x="16" y="81" fill="${colors.text}" font-size="12" class="mono">
      Занято: <tspan font-weight="bold" fill="#3b82f6">${occupiedUnits}/${totalUnits}U (${percent}%)</tspan> |
      Мощность: <tspan font-weight="bold" fill="#10b981">~${dcimMetrics.totalWatts || 0} Вт</tspan> |
      Тепловыделение: <tspan font-weight="bold" fill="#f59e0b">${dcimMetrics.heatBtu || 0} BTU/hr</tspan> |
      Вес: <tspan font-weight="bold" fill="#8b5cf6">~${dcimMetrics.totalWeightKg || 0} кг</tspan> |
      Порты: <tspan font-weight="bold">${dcimMetrics.totalCopperPorts || 0}x RJ-45, ${dcimMetrics.totalSfpPorts || 0}x SFP</tspan>
    </text>
  </g>

  <!-- 19" Cabinet Frame -->
  <g transform="translate(40, ${headerHeight})">
    <!-- Outer Cabinet Walls -->
    <rect x="0" y="0" width="840" height="${rackInnerHeight + 30}" rx="12" fill="${colors.frame}" stroke="${colors.frameBorder}" stroke-width="2" />

    <!-- Left EIA 19" Steel Rail (x: 10, width: 60) -->
    <rect x="10" y="10" width="60" height="${rackInnerHeight}" fill="${colors.rail}" stroke="${colors.railBorder}" />

    <!-- Right EIA 19" Steel Rail (x: 710, width: 60) -->
    <rect x="710" y="10" width="60" height="${rackInnerHeight}" fill="${colors.rail}" stroke="${colors.railBorder}" />

    <!-- Side Cable Management Gutter (x: 775, width: 55) -->
    <rect x="775" y="10" width="55" height="${rackInnerHeight}" fill="${colors.bg}" stroke="${colors.railBorder}" stroke-dasharray="4 4" opacity="0.6" />
    <text x="802" y="30" fill="${colors.textDim}" font-size="9" text-anchor="middle" class="mono" transform="rotate(90 802 30)">КАБЕЛЬНЫЙ ОРГАНИЗАТОР</text>
`;

  // Render Units from 42 down to 1
  for (let u = 42; u >= 1; u--) {
    const rowIdx = totalUnits - u;
    const y = 10 + rowIdx * unitRowHeight;
    const dev = unitMap[u];

    // Left Rail Unit Label & Screw Holes
    svg += `
    <!-- Unit U${u} Rails -->
    <text x="25" y="${y + 26}" fill="${colors.textDim}" font-size="11" font-weight="bold" class="mono">${u}</text>
    <circle cx="55" cy="${y + 12}" r="2.5" fill="${colors.textDim}" opacity="0.4" />
    <circle cx="55" cy="${y + 22}" r="2.5" fill="${colors.textDim}" opacity="0.4" />
    <circle cx="55" cy="${y + 32}" r="2.5" fill="${colors.textDim}" opacity="0.4" />

    <!-- Right Rail Unit Label & Screw Holes -->
    <text x="755" y="${y + 26}" fill="${colors.textDim}" font-size="11" font-weight="bold" class="mono">${u}</text>
    <circle cx="725" cy="${y + 12}" r="2.5" fill="${colors.textDim}" opacity="0.4" />
    <circle cx="725" cy="${y + 22}" r="2.5" fill="${colors.textDim}" opacity="0.4" />
    <circle cx="725" cy="${y + 32}" r="2.5" fill="${colors.textDim}" opacity="0.4" />
`;

    // Mounting Bay (x: 70, width: 640, height: 42)
    if (dev) {
      let devColor = colors.switchBg;
      let borderColor = colors.switchBorder;
      let badge = 'SW';
      let badgeColor = '#3b82f6';

      if (dev.deviceType === 'patchPanel') {
        devColor = colors.ppBg;
        borderColor = colors.ppBorder;
        badge = 'PP';
        badgeColor = '#10b981';
      } else if (dev.deviceType === 'server') {
        devColor = colors.serverBg;
        borderColor = colors.serverBorder;
        badge = 'SRV';
        badgeColor = '#8b5cf6';
      }

      svg += `
    <!-- Equipment U${u}: ${dev.name} -->
    <g>
      <rect x="72" y="${y + 1}" width="636" height="42" rx="4" fill="${devColor}" stroke="${borderColor}" stroke-width="1.5" />
      
      <!-- LED Indicator -->
      <circle cx="86" cy="${y + 22}" r="3.5" fill="#10b981" />
      
      <!-- Type Badge -->
      <rect x="98" y="${y + 12}" width="34" height="20" rx="3" fill="${badgeColor}" opacity="0.2" />
      <text x="115" y="${y + 26}" fill="${badgeColor}" font-size="9" font-weight="bold" text-anchor="middle" class="mono">[${badge}]</text>

      <!-- Device Name & Model -->
      <text x="142" y="${y + 21}" fill="${colors.text}" font-size="12" font-weight="bold">${dev.name || 'Оборудование'}</text>
      <text x="142" y="${y + 34}" fill="${colors.textDim}" font-size="10">${dev.vendor || ''} ${dev.model || ''}</text>

      <!-- Right IP and Ports Tags -->
      ${dev.ip ? `
      <rect x="520" y="${y + 12}" width="105" height="20" rx="4" fill="#10b981" opacity="0.15" />
      <text x="572" y="${y + 26}" fill="#10b981" font-size="10" font-weight="bold" text-anchor="middle" class="mono">${dev.ip}</text>
      ` : ''}

      <rect x="635" y="${y + 12}" width="65" height="20" rx="4" fill="${colors.frame}" stroke="${colors.frameBorder}" />
      <text x="667" y="${y + 26}" fill="${colors.textDim}" font-size="10" font-weight="bold" text-anchor="middle" class="mono">
        ${dev.ports?.length || (dev.nics?.length ? `${dev.nics.length} NIC` : '1U')}
      </text>
    </g>
`;
    } else {
      // Empty Blank Plate
      svg += `
    <!-- Blank Slot U${u} -->
    <g>
      <rect x="72" y="${y + 1}" width="636" height="42" rx="4" fill="${colors.blankBg}" stroke="${colors.blankBorder}" stroke-width="0.75" />
      <text x="390" y="${y + 26}" fill="${colors.textDim}" opacity="0.4" font-size="10" text-anchor="middle" class="mono">-- Свободный слот 1U (Blanking Panel) --</text>
    </g>
`;
    }
  }

  // Draw Intra-Rack Patch Cords (Bezier Curves into the vertical cable organizer)
  if (intraRackPatchCords && intraRackPatchCords.length > 0) {
    svg += `
    <!-- Intra-Rack Patch Cords -->
    <g id="patch-cords">
`;
    intraRackPatchCords.forEach((cord, idx) => {
      const fromRowIndex = totalUnits - cord.fromU;
      const toRowIndex = totalUnits - cord.toU;
      const y1 = 10 + fromRowIndex * unitRowHeight + unitRowHeight / 2;
      const y2 = 10 + toRowIndex * unitRowHeight + unitRowHeight / 2;
      const rightX = 785 + (idx % 6) * 5;

      const pathD = `M 700,${y1} C ${rightX},${y1} ${rightX},${y2} 700,${y2}`;
      const cordColor = cord.color || '#3b82f6';

      svg += `
      <g>
        <path d="${pathD}" fill="none" stroke="${cordColor}" stroke-width="2.5" stroke-linecap="round" filter="url(#cord-glow)" />
        <circle cx="700" cy="${y1}" r="3" fill="${cordColor}" />
        <circle cx="700" cy="${y2}" r="3" fill="${cordColor}" />
      </g>
`;
    });
    svg += `    </g>\n`;
  }

  // Bottom Rack Ground Bar
  svg += `
    <!-- Bottom Ground Busbar -->
    <g transform="translate(10, ${rackInnerHeight + 12})">
      <text x="20" y="12" fill="${colors.textDim}" font-size="10" class="mono">GROUND BUSBAR: OK ⏚</text>
      <text x="410" y="12" fill="${colors.textDim}" font-size="10" text-anchor="middle" class="mono">19-INCH RACK ELEVATION (EIA/ECA-310-E)</text>
      <text x="800" y="12" fill="${colors.textDim}" font-size="10" text-anchor="end" class="mono">42U HEIGHT: 1867 MM</text>
    </g>
  </g>
</svg>`;

  return svg;
}

/**
 * Экспорт векторной схемы стойки 42U в SVG файл
 */
export function exportRackSvg(params) {
  const { rackName = 'Rack' } = params;
  try {
    const svgString = generateRackSvgString(params);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rack_${rackName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка экспорта SVG стойки:', err);
    alert(`Не удалось экспортировать SVG стойки: ${err.message}`);
  }
}

/**
 * Экспорт растровой схемы стойки 42U в PNG (HD 2x)
 */
export async function exportRackPng(params) {
  const { rackName = 'Rack', isLight = false } = params;
  return new Promise((resolve, reject) => {
    try {
      const svgString = generateRackSvgString(params);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const scale = 2; // HD 2x
        const canvas = document.createElement('canvas');
        canvas.width = 920 * scale;
        canvas.height = 2060 * scale;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = isLight ? '#f8fafc' : '#020617';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Не удалось сгенерировать PNG blob стойки'));
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `Rack_${rackName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, 'image/png');
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Ошибка загрузки SVG стойки в Canvas'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Экспорт спецификации стойки (BOM / Паспорт 1U-42U) в CSV файл с UTF-8 BOM
 */
export function exportRackCsv({ rackName = 'Rack', unitMap = {}, currentRackDevices = [], dcimMetrics = {} }) {
  try {
    const headers = [
      'Юнит (U)',
      'Тип оборудования',
      'Наименование',
      'Вендор',
      'Модель',
      'IP-адрес',
      'Кол-во портов/NIC',
      'Высота (U)',
      'Мощность (Вт)',
      'Вес (кг)',
      'Статус'
    ];

    const rows = [];

    // Перебор юнитов от 42 вниз до 1
    for (let u = 42; u >= 1; u--) {
      const dev = unitMap[u];
      if (dev) {
        let typeLabel = 'Коммутатор L2/L3';
        if (dev.deviceType === 'patchPanel') typeLabel = 'Патч-панель СКС RJ-45';
        else if (dev.deviceType === 'server') typeLabel = 'Сервер / Гипервизор';

        const portsCount = dev.ports?.length || (dev.nics?.length ? `${dev.nics.length} NIC` : '-');
        const heightU = dev.slotHeight || dev.unitHeight || 1;
        
        // Оценка мощности и веса
        let watts = 25;
        let weightKg = 3.5;
        if (dev.deviceType === 'switch') {
          watts = (dev.ports?.length || 24) > 24 ? 45 : 25;
          weightKg = (dev.ports?.length || 24) > 24 ? 4.5 : 3.2;
        } else if (dev.deviceType === 'server') {
          watts = heightU * 220;
          weightKg = heightU * 12;
        } else if (dev.deviceType === 'patchPanel') {
          watts = 0;
          weightKg = 1.2;
        }

        rows.push([
          `U${u}`,
          typeLabel,
          dev.name || 'Оборудование',
          dev.vendor || '-',
          dev.model || '-',
          dev.ip || '-',
          portsCount,
          `${heightU}U`,
          `${watts}W`,
          `${weightKg} кг`,
          'Смонтирован в стойке'
        ]);
      } else {
        rows.push([
          `U${u}`,
          'Свободный слот (Blank panel)',
          '-',
          '-',
          '-',
          '-',
          '-',
          '1U',
          '0W',
          '0 кг',
          'Свободен'
        ]);
      }
    }

    // Итоговая строка
    const summaryRows = [
      [],
      ['--- СВОДНЫЕ ПОКАЗАТЕЛИ СТОЙКИ (DCIM) ---'],
      ['Стойка / Шкаф', rackName],
      ['Всего юнитов', '42U'],
      ['Смонтировано устройств', currentRackDevices.length],
      ['Занято слотов', `${Object.keys(unitMap).length} из 42 (${Math.round((Object.keys(unitMap).length / 42) * 100)}%)`],
      ['Суммарная потребляемая мощность', `~${dcimMetrics.totalWatts || 0} Вт (~${Math.round((dcimMetrics.totalWatts || 0) / 1000 * 10) / 10} кВт)`],
      ['Тепловыделение стойки', `${dcimMetrics.heatBtu || 0} BTU/hr`],
      ['Суммарный расчетный вес', `~${dcimMetrics.totalWeightKg || 0} кг`],
      ['Всего медных портов RJ-45', dcimMetrics.totalCopperPorts || 0],
      ['Всего оптических портов SFP/SFP+', dcimMetrics.totalSfpPorts || 0],
      ['Дата выгрузки спецификации', new Date().toLocaleString('ru-RU')]
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines = [
      headers.map(escapeCsv).join(';'),
      ...rows.map(r => r.map(escapeCsv).join(';')),
      ...summaryRows.map(r => r.map(escapeCsv).join(';'))
    ];

    // UTF-8 BOM для корректного открытия в Excel на русском языке
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Specification_${rackName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Ошибка экспорта спецификации стойки в CSV:', err);
    alert(`Не удалось экспортировать CSV: ${err.message}`);
  }
}
