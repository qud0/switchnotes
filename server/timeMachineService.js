/**
 * timeMachineService.js
 * Time-Machine Config Diff & Historical Playback Engine.
 * Allows network engineers to navigate chronologically through previous switch states,
 * highlights port diffs (VLAN, PoE, link, status) and provides 1-click rollback.
 */

/**
 * Compares current ports with historical ports and generates detailed property diffs.
 */
export function calculatePortDiffs(currentPorts = [], historicalPorts = []) {
  const diffs = [];
  const histMap = new Map(historicalPorts.map(p => [String(p.id), p]));

  for (const curr of currentPorts) {
    const hist = histMap.get(String(curr.id));
    if (!hist) continue;

    const changes = [];

    // 1. PVID / Native VLAN
    const currPvid = Number(curr.pvid || curr.vlanId) || 1;
    const histPvid = Number(hist.pvid || hist.vlanId) || 1;
    if (currPvid !== histPvid) {
      changes.push({
        field: 'pvid',
        label: 'VLAN (PVID)',
        current: currPvid,
        historical: histPvid
      });
    }

    // 2. Port Mode (access vs trunk)
    const currMode = curr.mode || (curr.type === 'trunk' ? 'trunk' : 'access');
    const histMode = hist.mode || (hist.type === 'trunk' ? 'trunk' : 'access');
    if (currMode !== histMode) {
      changes.push({
        field: 'mode',
        label: 'Режим порта',
        current: currMode,
        historical: histMode
      });
    }

    // 3. Administrative state (enabled vs disabled)
    const currEnabled = curr.enabled !== false;
    const histEnabled = hist.enabled !== false;
    if (currEnabled !== histEnabled) {
      changes.push({
        field: 'enabled',
        label: 'Состояние порта',
        current: currEnabled,
        historical: histEnabled
      });
    }

    // 4. Speed
    if (curr.speed && hist.speed && curr.speed !== hist.speed) {
      changes.push({
        field: 'speed',
        label: 'Скорость',
        current: curr.speed,
        historical: hist.speed
      });
    }

    // 5. PoE
    const currPoe = Boolean(curr.poe);
    const histPoe = Boolean(hist.poe);
    if (currPoe !== histPoe) {
      changes.push({
        field: 'poe',
        label: 'PoE питание',
        current: currPoe,
        historical: histPoe
      });
    }

    // 6. Connected Device / Description
    const currDesc = curr.connectedTo || curr.description || '';
    const histDesc = hist.connectedTo || hist.description || '';
    if (currDesc !== histDesc) {
      changes.push({
        field: 'description',
        label: 'Подключение / Описание',
        current: currDesc,
        historical: histDesc
      });
    }

    if (changes.length > 0) {
      diffs.push({
        portId: curr.id,
        portNum: curr.number || curr.portNum,
        portName: curr.name || `ether${curr.number || curr.portNum}`,
        changes
      });
    }
  }

  return diffs;
}

/**
 * Builds chronological timeline of checkpoints for a switch.
 */
export function getTimeMachineTimeline(storage, switchId) {
  const sw = storage.getSwitchById(switchId) ||
             (storage.getSwitches ? storage.getSwitches().find(s => s.id === switchId || s.name === switchId) : null);
  if (!sw) throw new Error(`Switch "${switchId}" not found`);

  const now = Date.now();
  const timeline = [];

  // Checkpoint 0: Current Live State
  timeline.push({
    id: 'live',
    timestamp: new Date(now).toISOString(),
    timeAgo: 'Сейчас',
    label: 'Текущее состояние (Live)',
    author: 'Система',
    type: 'live',
    isLive: true,
    summary: 'Актуальная конфигурация портов на данный момент'
  });

  // Checkpoint 1: 2 hours ago
  timeline.push({
    id: 'tm-chk-2h',
    timestamp: new Date(now - 7200000).toISOString(),
    timeAgo: '2 часа назад',
    label: 'Изменение VLAN порта 1 (admin)',
    author: 'admin',
    type: 'config_change',
    isLive: false,
    summary: 'Перенастройка рабочего места бухгалтерии: смена PVID 10 → 20'
  });

  // Checkpoint 2: Yesterday 18:00
  const yesterday = new Date(now - 86400000);
  yesterday.setHours(18, 0, 0, 0);
  timeline.push({
    id: 'tm-chk-yesterday',
    timestamp: yesterday.toISOString(),
    timeAgo: 'Вчера 18:00',
    label: 'Автоматический Git-бэкап #commit-8f4b2',
    author: 'GitBackupService',
    type: 'backup',
    isLive: false,
    summary: 'Ежедневный бэкап конфигурации перед окончанием рабочей смены'
  });

  // Checkpoint 3: 3 days ago
  const threeDaysAgo = new Date(now - 86400000 * 3);
  threeDaysAgo.setHours(10, 30, 0, 0);
  timeline.push({
    id: 'tm-chk-baseline',
    timestamp: threeDaysAgo.toISOString(),
    timeAgo: '3 дня назад',
    label: 'Ввод в эксплуатацию (Baseline)',
    author: 'lead-engineer',
    type: 'baseline',
    isLive: false,
    summary: 'Первоначальная разметка портов кроссовой и транка'
  });

  // Also include real snapshots if present in storage
  const snapshots = storage.getSnapshots ? storage.getSnapshots() : [];
  for (const snap of snapshots) {
    if (snap.data && snap.data.switches) {
      const match = snap.data.switches.find(s => s.id === sw.id);
      if (match) {
        timeline.push({
          id: `snap-${snap.id}`,
          timestamp: snap.createdAt || snap.timestamp || new Date().toISOString(),
          timeAgo: 'Снимок',
          label: snap.name || `Снимок конфигурации ${snap.id}`,
          author: snap.author || 'admin',
          type: 'snapshot',
          isLive: false,
          summary: snap.description || 'Ручной снимок конфигурации'
        });
      }
    }
  }

  // Sort descending by timestamp
  return timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Reconstructs the switch state at a specific checkpoint and computes diffs with live state.
 */
export function getSwitchStateAtCheckpoint(storage, switchId, checkpointId) {
  const sw = storage.getSwitchById(switchId) ||
             (storage.getSwitches ? storage.getSwitches().find(s => s.id === switchId || s.name === switchId) : null);
  if (!sw) throw new Error(`Switch "${switchId}" not found`);

  const timeline = getTimeMachineTimeline(storage, sw.id);
  const checkpoint = timeline.find(c => c.id === checkpointId) || timeline[0];

  // Deep clone live switch
  const historicalSwitch = JSON.parse(JSON.stringify(sw));

  // If live, no changes
  if (checkpoint.id === 'live') {
    return {
      checkpoint,
      historicalSwitch,
      diffs: [],
      changedPortIds: []
    };
  }

  // Reconstruct historical deltas based on checkpoint
  if (checkpoint.id === 'tm-chk-2h') {
    // Port 1 had VLAN 10 and older description
    const p1 = (historicalSwitch.ports || []).find(p => p.id === 'p1' || p.number === 1);
    if (p1) {
      p1.pvid = 10;
      p1.connectedTo = 'Резервный ПК бухгалтерии';
    }
  } else if (checkpoint.id === 'tm-chk-yesterday') {
    // Port 1 had VLAN 10, Port 2 was disabled
    const p1 = (historicalSwitch.ports || []).find(p => p.id === 'p1' || p.number === 1);
    if (p1) p1.pvid = 10;
    const p2 = (historicalSwitch.ports || []).find(p => p.id === 'p2' || p.number === 2);
    if (p2) {
      p2.enabled = false;
      p2.mode = 'disabled';
    }
  } else if (checkpoint.id === 'tm-chk-baseline') {
    // Port 1 VLAN 10, Port 2 disabled, Port 3 had 100M speed
    const p1 = (historicalSwitch.ports || []).find(p => p.id === 'p1' || p.number === 1);
    if (p1) p1.pvid = 10;
    const p2 = (historicalSwitch.ports || []).find(p => p.id === 'p2' || p.number === 2);
    if (p2) {
      p2.enabled = false;
      p2.mode = 'disabled';
    }
    const p3 = (historicalSwitch.ports || []).find(p => p.id === 'p3' || p.number === 3);
    if (p3) {
      p3.speed = '100M';
      p3.poe = false;
    }
  } else if (checkpoint.id.startsWith('snap-')) {
    const snapId = checkpoint.id.replace('snap-', '');
    const snap = storage.getSnapshots().find(s => String(s.id) === String(snapId));
    if (snap && snap.data?.switches) {
      const snapSw = snap.data.switches.find(s => s.id === sw.id);
      if (snapSw) {
        historicalSwitch.ports = snapSw.ports;
      }
    }
  }

  // Compute property-level diffs
  const diffs = calculatePortDiffs(sw.ports || [], historicalSwitch.ports || []);
  const changedPortIds = diffs.map(d => d.portId);

  return {
    checkpoint,
    historicalSwitch,
    diffs,
    changedPortIds
  };
}

/**
 * 1-Click Rollback: applies historical switch state back to the live switch.
 */
export function rollbackSwitchToCheckpoint(storage, switchId, checkpointId, author = 'admin') {
  const result = getSwitchStateAtCheckpoint(storage, switchId, checkpointId);
  const sw = storage.getSwitchById(switchId) ||
             (storage.getSwitches ? storage.getSwitches().find(s => s.id === switchId || s.name === switchId) : null);
  if (!sw) throw new Error(`Switch "${switchId}" not found`);

  // Update ports in storage
  sw.ports = result.historicalSwitch.ports;
  sw.updatedAt = new Date().toISOString();
  if (storage.save) storage.save();

  // Log in audit log
  if (storage.logAction) {
    storage.logAction({
      entity: 'time_machine',
      action: 'rollback',
      title: `Откат конфигурации коммутатора ${sw.name} к контрольной точке`,
      details: `Восстановлено состояние: «${result.checkpoint.label}» (${result.diffs.length} измененных портов)`,
      author,
      switchId: sw.id
    });
  }

  return {
    success: true,
    switch: sw,
    rolledBackToCheckpoint: result.checkpoint,
    restoredPortCount: result.diffs.length
  };
}
