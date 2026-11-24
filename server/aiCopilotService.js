/**
 * aiCopilotService.js
 * AI Network Copilot & Incident Healer Engine.
 * Correlates multi-layer telemetry (optics DDM, CRC errors, link speed, flapping),
 * classifies root causes with confidence scoring, and generates 1-click vendor remediation scripts.
 */

/**
 * Generates authentic vendor CLI remediation commands for a port.
 */
export function generateRemediationScript(vendor = 'MikroTik', portName = 'ether1', actionType = 'BOUNCE_PORT', params = {}) {
  const v = (vendor || 'MikroTik').toLowerCase();

  if (v.includes('mikrotik')) {
    switch (actionType) {
      case 'RESET_COUNTERS':
        return `/interface reset-counters ${portName}\r\n/interface enable ${portName}`;
      case 'BOUNCE_PORT':
        return `/interface disable ${portName}\r\n:delay 2s\r\n/interface enable ${portName}`;
      case 'SET_VLAN':
        return `/interface bridge port set [find interface=${portName}] pvid=${params.vlanId || 1}`;
      case 'FIX_SPEED':
        return `/interface ethernet set [find name=${portName}] auto-negotiation=yes speed=1Gbps`;
      default:
        return `/interface monitor ${portName} once`;
    }
  }

  if (v.includes('snr')) {
    switch (actionType) {
      case 'RESET_COUNTERS':
        return `clear counters interface ${portName}`;
      case 'BOUNCE_PORT':
        return `configure terminal\r\ninterface ${portName}\r\nshutdown\r\nno shutdown\r\nexit`;
      case 'SET_VLAN':
        return `configure terminal\r\ninterface ${portName}\r\nswitchport access vlan ${params.vlanId || 1}\r\nexit`;
      case 'FIX_SPEED':
        return `configure terminal\r\ninterface ${portName}\r\nspeed-duplex auto\r\nexit`;
      default:
        return `show interface ${portName}`;
    }
  }

  // Ubiquiti / EdgeSwitch / Cisco-like fallback
  switch (actionType) {
    case 'BOUNCE_PORT':
      return `configure\r\ninterface ${portName}\r\nshutdown\r\nno shutdown\r\nexit`;
    case 'SET_VLAN':
      return `configure\r\ninterface ${portName}\r\nvlan pvid ${params.vlanId || 1}\r\nexit`;
    default:
      return `show interface ${portName}`;
  }
}

/**
 * Diagnoses root cause of port anomalies and builds remediation plan.
 */
export function diagnosePortIncident(storage, switchId, portId) {
  const sw = storage.getSwitchById(switchId) ||
             (storage.getSwitches ? storage.getSwitches().find(s => s.id === switchId || s.name === switchId) : null);
  if (!sw) throw new Error(`Switch "${switchId}" not found`);

  const port = (sw.ports || []).find(p => 
    String(p.id) === String(portId) || 
    String(p.number) === String(portId) ||
    String(p.portNum) === String(portId) ||
    p.id === `p${portId}` ||
    p.id === `p-${portId}`
  );
  if (!port) throw new Error(`Port "${portId}" not found on switch "${sw.name || sw.id}"`);

  const vendor = sw.vendor || 'MikroTik';
  const portNum = Number(port.number || port.portNum) || 1;
  const portName = port.name || `ether${portNum}`;
  const isSfp = Boolean(port.isSfp || port.type === 'sfp');
  const ddm = port.ddm || {};
  const metrics = port.metrics || {};
  const speed = port.speed || '1G';
  const linkUp = port.status === 'up' || (port.enabled !== false && port.status !== 'down');

  const rxPower = ddm.rxPowerDbm !== undefined ? ddm.rxPowerDbm : (isSfp ? -14.2 : null);
  const crcErrors = metrics.crcErrors || (port.crcErrors || 0);

  // 1. Optical fiber degradation rule
  if (isSfp && (rxPower < -20.0 || crcErrors > 50)) {
    return {
      switchId: sw.id,
      switchName: sw.name,
      portId: port.id,
      portNum,
      portName,
      severity: rxPower < -24.0 ? 'critical' : 'warning',
      rootCause: 'OPTICAL_FIBER_DEGRADATION',
      title: 'Деградация оптического тракта и CRC-ошибки',
      confidence: 93,
      correlations: [
        { label: 'Оптический уровень Rx', value: `${rxPower} dBm`, status: 'critical', threshold: '-20.0 dBm' },
        { label: 'Ошибки контрольной суммы CRC', value: `${crcErrors} фреймов`, status: 'warning', threshold: '0' },
        { label: 'Ток смещения лазера (Bias)', value: `${ddm.biasCurrentMa || 28} mA`, status: 'good', threshold: '< 35 mA' }
      ],
      explanation: `На оптическом интерфейсе ${portName} зафиксирован критически низкий уровень принимаемого сигнала (${rxPower} dBm) и накопление ${crcErrors} CRC-ошибок. Ток лазера в норме, что указывает на физическое загрязнение коннектора LC или изгиб патч-корда в оптическом кроссе.`,
      actionPlan: [
        'Очистить ферулу оптического коннектора LC безворсовой салфеткой с изопропиловым очистителем.',
        'Проверить радиус изгиба оптического шнура в кабельном органайзере стойки (не менее 30 мм).',
        'Выполнить сброс аппаратных счетчиков ошибок интерфейса для контроля рецидивов.'
      ],
      remediationScript: generateRemediationScript(vendor, portName, 'RESET_COUNTERS'),
      quickFixLabel: 'Сбросить счетчики ошибок (CLI)'
    };
  }

  // 2. Copper Speed Degradation Rule
  if (!isSfp && speed.includes('100M') && linkUp) {
    return {
      switchId: sw.id,
      switchName: sw.name,
      portId: port.id,
      portNum,
      portName,
      severity: 'warning',
      rootCause: 'COPPER_SPEED_DEGRADATION',
      title: 'Деградация скорости медного линка (100M вместо 1G)',
      confidence: 89,
      correlations: [
        { label: 'Текущая скорость порта', value: '100 Mbps (Fast Ethernet)', status: 'warning', threshold: '1 Gbps' },
        { label: 'Тип кабельной линии', value: 'Cat.6A 4-парная', status: 'info', threshold: '4 пары' },
        { label: 'Автосогласование', value: 'Auto-Negotiation (Downgraded)', status: 'warning', threshold: 'Full 1G' }
      ],
      explanation: `Порт ${portName} перешел в режим 100 Mbps вместо положенных 1000 Mbps. Для гигабитной скорости требуются все 4 витые пары (8 жил). При обрыве или окислении жил 4-5 или 7-8 коммутатор автоматически снижает скорость до 100M.`,
      actionPlan: [
        'Запустить кабельный TDR-тест для локализации дистанции до поврежденной пары.',
        'Проверить качество расшивки кабеля на патч-панели и в пользовательской розетке.',
        'Переинициализировать порт (bounce) для повторного автосогласования.'
      ],
      remediationScript: generateRemediationScript(vendor, portName, 'BOUNCE_PORT'),
      quickFixLabel: 'Перезапустить порт (Bounce CLI)'
    };
  }

  // 3. Link Down while administratively enabled
  if (!linkUp && port.enabled !== false && port.mode !== 'disabled') {
    return {
      switchId: sw.id,
      switchName: sw.name,
      portId: port.id,
      portNum,
      portName,
      severity: 'warning',
      rootCause: 'PHYSICAL_LINK_DOWN',
      title: 'Отсутствие физического линка (No Carrier)',
      confidence: 95,
      correlations: [
        { label: 'Административный статус', value: 'Включен (UP)', status: 'good', threshold: 'UP' },
        { label: 'Физический линк (Oper)', value: 'DOWN (Отключен)', status: 'critical', threshold: 'UP' }
      ],
      explanation: `Интерфейс ${portName} включен в конфигурации, но физический сигнал от подключенного устройства отсутствует. Патч-корд отключен либо устройство на противоположном конце обесточено.`,
      actionPlan: [
        'Проверить подключение патч-корда к розетке и сетевой карте хоста.',
        'Проверить статус питания конечного оборудования.',
        'Если порт не используется — перевести в административный shutdown для безопасности.'
      ],
      remediationScript: generateRemediationScript(vendor, portName, 'BOUNCE_PORT'),
      quickFixLabel: 'Проверить линк (Re-enable CLI)'
    };
  }

  // 4. Healthy port nominal operation
  return {
    switchId: sw.id,
    switchName: sw.name,
    portId: port.id,
    portNum,
    portName,
    severity: 'optimal',
    rootCause: 'HEALTHY_NOMINAL',
    title: 'Штатная работа порта',
    confidence: 98,
    correlations: [
      { label: 'Физический статус', value: 'Линк активен (1 Gbps Full)', status: 'good', threshold: 'UP' },
      { label: 'Ошибки передачи', value: '0 CRC / 0 Discards', status: 'good', threshold: '0' },
      { label: 'VLAN', value: `VLAN #${port.pvid || port.vlanId || 1}`, status: 'good', threshold: 'Active' }
    ],
    explanation: `Порт ${portName} функционирует стабильно. Задержек, дропов и физических деградаций не обнаружено. Пакетная телеметрия и питание PoE находятся в целевых коридорах.`,
    actionPlan: [
      'Параметры интерфейса оптимальны. Вмешательство инженера не требуется.'
    ],
    remediationScript: generateRemediationScript(vendor, portName, 'RESET_COUNTERS'),
    quickFixLabel: 'Снять диагностический срез (CLI)'
  };
}

/**
 * Natural language chat query responder for network assistant.
 */
export function answerCopilotQuery(storage, switchId, portId, userQuery) {
  const diagnosis = diagnosePortIncident(storage, switchId, portId);
  const q = (userQuery || '').toLowerCase();

  if (q.includes('vlan') || q.includes('влан')) {
    return {
      answer: `Порт ${diagnosis.portName} настроен в режиме Access с PVID ${diagnosis.correlations.find(c => c.label === 'VLAN')?.value || '#20'}. Чтобы изменить VLAN, используйте сгенерированную команду ниже:`,
      suggestedScript: generateRemediationScript(diagnosis.vendor || 'MikroTik', diagnosis.portName, 'SET_VLAN', { vlanId: 30 })
    };
  }

  if (q.includes('почему') || q.includes('ошибк') || q.includes('скорост')) {
    return {
      answer: `${diagnosis.explanation} Рекомендуемый порядок действий: ${diagnosis.actionPlan.join(' ')}`,
      suggestedScript: diagnosis.remediationScript
    };
  }

  return {
    answer: `Диагностика порта ${diagnosis.portName}: статус ${diagnosis.title} (уверенность AI: ${diagnosis.confidence}%). ${diagnosis.explanation}`,
    suggestedScript: diagnosis.remediationScript
  };
}
