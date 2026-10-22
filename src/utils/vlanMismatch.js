/**
 * Helper to analyze and detect VLAN mismatches between two connected switch ports
 */
export function checkVlanMismatch(localPort, peerPort) {
  if (!localPort || !peerPort) return null;

  const issues = [];

  // 1. Mode mismatch
  if (localPort.mode !== peerPort.mode) {
    issues.push({
      type: 'mode',
      title: 'Несовпадение режима порта',
      message: `Локальный: ${localPort.mode.toUpperCase()}, Удаленный: ${peerPort.mode.toUpperCase()}`
    });
    return { hasMismatch: true, issues };
  }

  // 2. Disabled mismatch
  if (localPort.enabled && !peerPort.enabled) {
    issues.push({
      type: 'disabled',
      title: 'Удаленный порт выключен',
      message: 'Удаленный порт отключен (Disabled)'
    });
  }

  // 3. Native VLAN / PVID mismatch
  if (localPort.pvid !== peerPort.pvid) {
    issues.push({
      type: 'pvid',
      title: 'Несовпадение Native VLAN (PVID)',
      message: `Локальный PVID: ${localPort.pvid}, Удаленный PVID: ${peerPort.pvid}`
    });
  }

  // 4. Tagged VLANs comparison (for Trunk ports)
  if (localPort.mode === 'trunk') {
    const localTagged = new Set(localPort.taggedVlans || []);
    const peerTagged = new Set(peerPort.taggedVlans || []);

    const missingOnPeer = [...localTagged].filter(v => !peerTagged.has(v));
    const missingOnLocal = [...peerTagged].filter(v => !localTagged.has(v));

    if (missingOnPeer.length > 0) {
      issues.push({
        type: 'missing_on_peer',
        title: 'VLAN не пропущены на удаленном конце',
        message: `На удаленном порту не хватает: ${missingOnPeer.join(', ')}`
      });
    }

    if (missingOnLocal.length > 0) {
      issues.push({
        type: 'missing_on_local',
        title: 'VLAN не пропущены локально',
        message: `На локальном порту не хватает: ${missingOnLocal.join(', ')}`
      });
    }
  }

  return {
    hasMismatch: issues.length > 0,
    issues
  };
}
