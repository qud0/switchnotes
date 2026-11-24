import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnosePortIncident,
  generateRemediationScript
} from '../server/aiCopilotService.js';

test('diagnosePortIncident identifies optical fiber degradation and CRC errors', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-core',
        name: 'sw-core-mikrotik',
        vendor: 'MikroTik',
        ports: [
          {
            id: 'p25',
            number: 25,
            name: 'sfp-sfpplus1',
            status: 'up',
            isSfp: true,
            pvid: 1,
            mode: 'trunk',
            ddm: {
              rxPowerDbm: -22.5,
              txPowerDbm: -2.1,
              biasCurrentMa: 28.4,
              temperatureC: 45
            },
            metrics: {
              crcErrors: 184,
              dropRatePercent: 4.2
            }
          }
        ]
      };
    },
    getVlans() { return [{ id: 1, name: 'Default' }]; },
    getPatchPanels() { return []; },
    getIpam() { return []; },
    getServers() { return []; },
    getSwitches() { return []; }
  };

  const diagnosis = diagnosePortIncident(mockStorage, 'sw-core', 'p25');
  assert.equal(diagnosis.switchId, 'sw-core');
  assert.equal(diagnosis.portNum, 25);
  assert.equal(diagnosis.severity, 'warning');
  assert.equal(diagnosis.rootCause, 'OPTICAL_FIBER_DEGRADATION');
  assert.ok(diagnosis.confidence >= 85);
  assert.ok(diagnosis.remediationScript.includes('sfp-sfpplus1'));
});

test('diagnosePortIncident identifies speed degradation on copper port', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-dist',
        name: 'sw-dist-snr',
        vendor: 'SNR',
        ports: [
          {
            id: 'p3',
            number: 3,
            name: 'GigabitEthernet1/0/3',
            status: 'up',
            speed: '100M',
            isSfp: false,
            pvid: 20
          }
        ]
      };
    },
    getVlans() { return [{ id: 20, name: 'Office' }]; },
    getPatchPanels() { return []; },
    getIpam() { return []; },
    getServers() { return []; },
    getSwitches() { return []; }
  };

  const diagnosis = diagnosePortIncident(mockStorage, 'sw-dist', 'p3');
  assert.equal(diagnosis.rootCause, 'COPPER_SPEED_DEGRADATION');
  assert.ok(diagnosis.remediationScript.includes('GigabitEthernet1/0/3'));
});

test('generateRemediationScript outputs valid vendor syntax for MikroTik and SNR', () => {
  const mtScript = generateRemediationScript('MikroTik', 'ether5', 'RESET_COUNTERS');
  assert.ok(mtScript.includes('/interface reset-counters ether5'));

  const snrScript = generateRemediationScript('SNR', 'GigabitEthernet1/0/5', 'BOUNCE_PORT');
  assert.ok(snrScript.includes('shutdown'));
  assert.ok(snrScript.includes('no shutdown'));
});
