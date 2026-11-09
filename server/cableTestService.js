/**
 * cableTestService.js
 * Сервис аппаратной диагностики витой пары (TDR - Time Domain Reflectometry / Virtual Cable Tester)
 * на реальных коммутаторах SNR NAG (S2985G, S2989G) и MikroTik RouterOS (CRS, CSS, RB).
 * 
 * Выполняет реальные команды TDR по SSH:
 * - SNR: 'virtual-cable-test interface <ifName>'
 * - MikroTik: '/interface ethernet cable-test [find name="<ifName>"] once'
 * - Cisco / Eltex: 'test cable-diagnostics tdr interface <ifName>'
 * 
 * Анализирует состояние всех 4 витых пар (OK, Open / Обрыв, Short / Замыкание, Crosstalk),
 * вычисляет расстояние до места повреждения кабеля в метрах и выдает инженерные рекомендации.
 */

import { executeSshCommand } from './backupService.js';

/**
 * Определение корректного имени интерфейса под конкретного вендора
 */
function resolveInterfaceName(vendor = '', port) {
  const v = (vendor || '').toLowerCase();
  const pName = (port.name || '').trim();
  const num = port.number || 1;

  if (v.includes('snr')) {
    if (/^(Ethernet|GigabitEthernet|TenGigabitEthernet)\s*\d+\/\d+\/\d+/i.test(pName)) {
      return pName;
    }
    return `GigabitEthernet 1/0/${num}`;
  }

  if (v.includes('mikrotik')) {
    if (pName && !pName.toLowerCase().startsWith('port')) {
      return pName;
    }
    return `ether${num}`;
  }

  if (v.includes('cisco') || v.includes('eltex')) {
    if (pName.toLowerCase().startsWith('gi') || pName.toLowerCase().startsWith('te') || pName.toLowerCase().startsWith('fa')) {
      return pName;
    }
    return `GigabitEthernet 1/0/${num}`;
  }

  return pName || `ether${num}`;
}

/**
 * Парсер вывода команды MikroTik RouterOS:
 * /interface ethernet cable-test ether1 once
 */
function parseMikrotikCableTest(rawOutput, ifName) {
  const pairs = [
    { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'Unknown', length: 0, state: 'unknown' },
    { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'Unknown', length: 0, state: 'unknown' },
    { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'Unknown', length: 0, state: 'unknown' },
    { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'Unknown', length: 0, state: 'unknown' }
  ];

  // Формат RouterOS v7:
  // cable-pairs: 1-2:ok,3-6:ok,4-5:open,7-8:ok
  // cable-lengths: 1-2:25m,3-6:25m,4-5:12m,7-8:25m
  const pairsMatch = rawOutput.match(/cable-pairs:\s*([^\r\n]+)/i);
  const lengthsMatch = rawOutput.match(/cable-lengths:\s*([^\r\n]+)/i);

  if (pairsMatch) {
    const pairEntries = pairsMatch[1].split(',').map(s => s.trim());
    pairEntries.forEach(entry => {
      const [pId, st] = entry.split(':').map(s => s.trim().toLowerCase());
      const p = pairs.find(x => x.pairId === pId);
      if (p) {
        if (st === 'ok' || st === 'link-ok') {
          p.status = 'OK / Terminated';
          p.state = 'ok';
        } else if (st.includes('open')) {
          p.status = 'Open (Обрыв)';
          p.state = 'error';
        } else if (st.includes('short')) {
          p.status = 'Short (Замыкание)';
          p.state = 'error';
        } else if (st.includes('cross')) {
          p.status = 'Crosstalk (Наводки)';
          p.state = 'warning';
        } else {
          p.status = st.toUpperCase();
          p.state = 'warning';
        }
      }
    });
  }

  if (lengthsMatch) {
    const lengthEntries = lengthsMatch[1].split(',').map(s => s.trim());
    lengthEntries.forEach(entry => {
      const [pId, lenStr] = entry.split(':').map(s => s.trim());
      const p = pairs.find(x => x.pairId === pId);
      if (p) {
        const meters = parseInt(lenStr) || 0;
        p.length = meters;
      }
    });
  }

  // Формат RouterOS v6 (key-value):
  // pair-1-2-status: ok
  // pair-1-2-length: 25
  pairs.forEach(p => {
    if (p.state === 'unknown') {
      const stRegex = new RegExp(`pair-${p.pairId}-status:\\s*([\\w-]+)`, 'i');
      const lenRegex = new RegExp(`pair-${p.pairId}-length:\\s*(\\d+)`, 'i');
      const stMatch = rawOutput.match(stRegex);
      const lenMatch = rawOutput.match(lenRegex);

      if (stMatch) {
        const st = stMatch[1].toLowerCase();
        if (st === 'ok') {
          p.status = 'OK / Terminated';
          p.state = 'ok';
        } else if (st.includes('open')) {
          p.status = 'Open (Обрыв)';
          p.state = 'error';
        } else if (st.includes('short')) {
          p.status = 'Short (Замыкание)';
          p.state = 'error';
        } else {
          p.status = st;
          p.state = 'warning';
        }
      }
      if (lenMatch) {
        p.length = parseInt(lenMatch[1]) || 0;
      }
    }
  });

  return finalizeTestResult(pairs, rawOutput, 'MikroTik');
}

/**
 * Парсер вывода команды SNR NAG (S2985G, S2989G NOS CLI):
 * virtual-cable-test interface GigabitEthernet 1/0/1
 */
function parseSnrCableTest(rawOutput, ifName) {
  const pairs = [
    { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'OK / Terminated', length: 0, state: 'ok' },
    { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: 0, state: 'ok' },
    { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: 0, state: 'ok' },
    { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: 0, state: 'ok' }
  ];

  const lines = rawOutput.split('\n');
  const pairMapping = {
    '1-2': 0, 'a': 0,
    '3-6': 1, 'b': 1,
    '4-5': 2, 'c': 2,
    '7-8': 3, 'd': 3
  };

  lines.forEach(line => {
    const l = line.trim().toLowerCase();

    // Паттерны:
    // Pair A (1-2): Normal, distance: 25 m
    // Pair 1-2 status: OK, length: 28m
    // Pair 1-2: Normal, Length: 25m
    const match = l.match(/pair\s*([abcd]|1-2|3-6|4-5|7-8)[\s\(\):]+([^,]+),\s*(?:distance|length)?:?\s*(\d+)\s*m?/i);
    if (match) {
      const key = match[1].toLowerCase();
      const statusText = match[2].trim();
      const dist = parseInt(match[3]) || 0;

      const idx = pairMapping[key];
      if (idx !== undefined && pairs[idx]) {
        pairs[idx].length = dist;
        if (/normal|ok|terminated|good/i.test(statusText)) {
          pairs[idx].status = 'OK / Terminated';
          pairs[idx].state = 'ok';
        } else if (/open/i.test(statusText)) {
          pairs[idx].status = 'Open (Обрыв)';
          pairs[idx].state = 'error';
        } else if (/short/i.test(statusText)) {
          pairs[idx].status = 'Short (Замыкание)';
          pairs[idx].state = 'error';
        } else if (/cross/i.test(statusText)) {
          pairs[idx].status = 'Crosstalk (Наводки)';
          pairs[idx].state = 'warning';
        } else {
          pairs[idx].status = statusText;
          pairs[idx].state = 'warning';
        }
      }
    }
  });

  return finalizeTestResult(pairs, rawOutput, 'SNR');
}

/**
 * Итоговая оценка результатов TDR и генерация понятного вердикта
 */
function finalizeTestResult(pairs, rawCliOutput, vendor = 'Generic') {
  // Вычисляем среднюю длину по исправным парам
  const okPairs = pairs.filter(p => p.state === 'ok' && p.length > 0);
  const lengths = okPairs.map(p => p.length);
  const avgLength = lengths.length > 0 
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : Math.max(...pairs.map(p => p.length), 0);

  const errorPairs = pairs.filter(p => p.state === 'error');
  const warningPairs = pairs.filter(p => p.state === 'warning');

  let overallStatus = 'ok';
  let overallMessage = '';
  let recommendation = '';

  if (errorPairs.length > 0) {
    overallStatus = 'fault';
    const firstErr = errorPairs[0];
    const isShort = firstErr.status.toLowerCase().includes('short');
    const isOpen = firstErr.status.toLowerCase().includes('open');

    if (isShort) {
      overallMessage = `КРИТИЧЕСКАЯ НЕИСПРАВНОСТЬ: Замыкание (Short) на ${firstErr.name} на расстоянии ~${firstErr.length}м от коммутатора!`;
      recommendation = 'Срочно отключите PoE на порту во избежание перегрузки блока питания. Проверьте разъем RJ-45 или кабель в месте защемления.';
    } else if (isOpen) {
      if (firstErr.length <= 1) {
        overallMessage = `Кабель не подключен или оборван у самого коммутатора (0–1м).`;
        recommendation = 'Проверьте фиксацию патч-корда в порту коммутатора или патч-панели.';
      } else {
        overallMessage = `ОБРЫВ ПРОВОДНИКА: Обрыв на ${firstErr.name} на расстоянии ~${firstErr.length}м. Скорость ограничена до 100M или линк Down.`;
        recommendation = `Осмотрите кабельную трассу на удалении ~${firstErr.length} метров от стойки (возможен перегиб в лотке, повреждение при ремонте или повреждение розетки).`;
      }
    } else {
      overallMessage = `Неисправность кабельной линии: ошибка на ${errorPairs.map(p => p.pairId).join(', ')}.`;
      recommendation = 'Требуется проверка линии кабельным тестером Fluke / тестером витой пары.';
    }
  } else if (warningPairs.length > 0) {
    overallStatus = 'warning';
    overallMessage = `ПРЕДУПРЕЖДЕНИЕ: Обнаружены помехи или несогласованность на линии (${warningPairs.map(p => p.pairId).join(', ')}).`;
    recommendation = 'Проверьте качество разделки жил на патч-панели и розетке рабочего места (расплетенность жил не должна превышать 13 мм для Cat.6).';
  } else if (avgLength === 0) {
    overallStatus = 'no-cable';
    overallMessage = 'Порт свободен: подключенный кабель не обнаружен (линк Down).';
    recommendation = 'Подключите сетевой кабель к порту для выполнения аппаратного теста.';
  } else {
    overallStatus = 'ok';
    overallMessage = `Все 4 витые пары в норме. Расчетная длина кабельной трассы: ~${avgLength}м. Линк 1G / 2.5G стабилен.`;
    recommendation = 'Кабельная линия полностью исправна и соответствует категории Cat.5e / Cat.6.';
  }

  return {
    status: overallStatus,
    overallLength: avgLength,
    overallMessage,
    recommendation,
    pairs,
    rawCliOutput
  };
}

/**
 * Генерация реалистичного TDR-теста для режима симуляции / оффлайн свитчей
 */
function generateSimulatedCableTest(port, faultSimulation = 'none', estimatedLengthStr = '25м') {
  const estMeters = parseInt(estimatedLengthStr) || 28;
  let pairs = [];
  let status = 'ok';
  let overallMessage = '';
  let recommendation = '';

  if (faultSimulation === 'open_pair2') {
    status = 'fault';
    const breakDist = Math.max(2, Math.round(estMeters * 0.65));
    pairs = [
      { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'Open (Обрыв)', length: breakDist, state: 'error' },
      { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: estMeters, state: 'ok' }
    ];
    overallMessage = `ОБРЫВ ПРОВОДНИКА: Обрыв на оранжевой паре (1-2) на отметке ~${breakDist}м. Линк не поднимается на 1G.`;
    recommendation = `Проверьте кабельную трассу на удалении ${breakDist}м от коммутатора (розетка, кабель-канал или перегиб).`;
  } else if (faultSimulation === 'short_pair4') {
    status = 'fault';
    const shortDist = Math.max(3, Math.round(estMeters * 0.35));
    pairs = [
      { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'Short (Замыкание)', length: shortDist, state: 'error' }
    ];
    overallMessage = `КРИТИЧЕСКИЙ СБОЙ: Короткое замыкание жил (Short) на коричневой паре (7-8) на отметке ~${shortDist}м. Опасно для PoE!`;
    recommendation = 'Срочно проверьте линию перед подачей PoE питания. Возможно попадание влаги в розетку или перебитие саморезом.';
  } else if (faultSimulation === 'crosstalk') {
    status = 'warning';
    pairs = [
      { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'High Crosstalk (Наводки)', length: estMeters, state: 'warning' },
      { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'High Crosstalk (Наводки)', length: estMeters, state: 'warning' },
      { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: estMeters, state: 'ok' }
    ];
    overallMessage = `Высокий уровень перекрестных наводок (NEXT/FEXT) между оранжевой и зеленой парами. Возможны потери пакетов (CRC errors).`;
    recommendation = 'Переобжмите разъем RJ-45 или переразведите розетку с минимальным раскрутом витых пар.';
  } else {
    pairs = [
      { pairId: '1-2', name: 'Пара 1-2 (Оранжевая / Pin 1-2)', wireColor: '#f97316', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '3-6', name: 'Пара 3-6 (Зеленая / Pin 3-6)', wireColor: '#22c55e', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '4-5', name: 'Пара 4-5 (Синяя / Pin 4-5)', wireColor: '#3b82f6', status: 'OK / Terminated', length: estMeters, state: 'ok' },
      { pairId: '7-8', name: 'Пара 7-8 (Коричневая / Pin 7-8)', wireColor: '#854d0e', status: 'OK / Terminated', length: estMeters, state: 'ok' }
    ];
    overallMessage = `Все 4 пары витой пары в норме. Волновое сопротивление 100 Ом стабильно. Длина: ~${estMeters}м.`;
    recommendation = 'Кабельный тракт полностью соответствует нормам СКС.';
  }

  const rawCliOutput = `[SIMULATED TDR REPORT]
Interface: ${port.name || `Port ${port.number}`}
Cable Type: 4-pair UTP Cat.6 100-Ohm
Test Mode: Virtual Cable Test (TDR Pulse Reflectometry)
Status: ${status.toUpperCase()}
Pairs status:
${pairs.map(p => `  Pair ${p.pairId}: ${p.status}, length: ${p.length}m`).join('\n')}`;

  return {
    status,
    overallLength: estMeters,
    overallMessage,
    recommendation,
    pairs,
    rawCliOutput
  };
}

/**
 * Главный метод запуска аппаратного кабельного теста TDR
 */
export async function runSwitchCableTest({
  storage,
  switchId,
  portId,
  credentials = {},
  mode = 'auto', // 'hardware' | 'auto' | 'simulated'
  faultSimulation = 'none',
  estimatedLength = '25м'
}) {
  const sw = storage.getSwitchById(switchId);
  if (!sw) {
    throw new Error('Коммутатор не найден в базе данных');
  }

  const pIdx = sw.ports.findIndex(p => p.id === portId || p.number === portId);
  if (pIdx === -1) {
    throw new Error(`Порт ${portId} не найден на коммутаторе ${sw.name}`);
  }

  const port = sw.ports[pIdx];
  if (port.type === 'sfp') {
    throw new Error('Кабельный тест TDR применим только к медным портам RJ-45 (витая пара). Для оптических портов SFP используется оптический мониторинг DDM.');
  }

  const vendor = sw.vendor || 'SNR';
  const ifName = resolveInterfaceName(vendor, port);

  // 1. Принудительный режим симуляции
  if (mode === 'simulated' || !sw.ip) {
    const simResult = generateSimulatedCableTest(port, faultSimulation, estimatedLength);
    return {
      success: true,
      isHardware: false,
      vendor: sw.vendor || 'Virtual',
      switchName: sw.name,
      switchIp: sw.ip || 'Virtual',
      portId: port.id,
      portNumber: port.number,
      portName: port.name || `Port ${port.number}`,
      interfaceName: ifName,
      source: 'simulated',
      simulationReason: !sw.ip ? 'Коммутатор не имеет IP-адреса (виртуальный узел)' : 'Запущен режим стенда неисправностей',
      timestamp: new Date().toISOString(),
      ...simResult
    };
  }

  // 2. Аппаратный запуск через SSH на реальном коммутаторе
  try {
    const v = vendor.toLowerCase();
    let command = '';

    if (v.includes('snr')) {
      // Для SNR:
      command = `virtual-cable-test interface ${ifName}\n`;
    } else if (v.includes('mikrotik')) {
      // Для MikroTik:
      command = `/interface ethernet cable-test [find name="${ifName}"] once\n`;
    } else if (v.includes('cisco') || v.includes('eltex')) {
      command = `show cable-diagnostics tdr interface ${ifName}\n`;
    } else {
      command = `virtual-cable-test interface ${ifName}\n`;
    }

    const sshResult = await executeSshCommand({
      host: sw.ip,
      port: credentials.port || sw.sshPort || 22,
      username: credentials.username || sw.sshUsername || 'admin',
      password: credentials.password || sw.sshPassword || '',
      command,
      timeout: 6000
    });

    const rawOutput = sshResult.output || sshResult.stdout || '';

    // Парсим результат в зависимости от вендора
    let parsedResult;
    if (v.includes('mikrotik')) {
      parsedResult = parseMikrotikCableTest(rawOutput, ifName);
    } else if (v.includes('snr')) {
      parsedResult = parseSnrCableTest(rawOutput, ifName);
    } else {
      // Общий парсер
      parsedResult = parseSnrCableTest(rawOutput, ifName);
      if (parsedResult.pairs.every(p => p.length === 0)) {
        parsedResult = parseMikrotikCableTest(rawOutput, ifName);
      }
    }

    return {
      success: true,
      isHardware: true,
      vendor: sw.vendor,
      switchName: sw.name,
      switchIp: sw.ip,
      portId: port.id,
      portNumber: port.number,
      portName: port.name || `Port ${port.number}`,
      interfaceName: ifName,
      source: 'hardware_ssh',
      timestamp: new Date().toISOString(),
      ...parsedResult
    };

  } catch (err) {
    // Если аппаратное обращение упало и режим 'auto' - мягко возвращаем результат симуляции с пояснением
    if (mode === 'auto') {
      const simResult = generateSimulatedCableTest(port, faultSimulation, estimatedLength);
      return {
        success: true,
        isHardware: false,
        vendor: sw.vendor,
        switchName: sw.name,
        switchIp: sw.ip,
        portId: port.id,
        portNumber: port.number,
        portName: port.name || `Port ${port.number}`,
        interfaceName: ifName,
        source: 'simulated_fallback',
        simulationReason: `SSH недоступен (${err.message}) — отображен результат виртуального рефлектометра`,
        hardwareError: err.message,
        timestamp: new Date().toISOString(),
        ...simResult
      };
    }

    throw new Error(`Аппаратный TDR-тест на ${sw.ip} не удался: ${err.message}`);
  }
}
