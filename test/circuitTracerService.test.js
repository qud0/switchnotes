import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tracePortCircuit } from '../server/circuitTracerService.js';

test('tracePortCircuit traces complete 6-point path for an access port', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-access',
        name: 'sw-access-floor1',
        model: 'SNR-S2985G-24T',
        ip: '192.168.10.20',
        unit: '12',
        location: 'Кроссовая 102',
        ports: [
          {
            id: 'p-5',
            portNum: 5,
            name: 'GigabitEthernet1/0/5',
            status: 'up',
            speed: '1 Gbps',
            vlanId: 20,
            type: 'access',
            device: 'HP-LaserJet-M428',
            deviceType: 'printer'
          },
          {
            id: 'p-25',
            portNum: 25,
            name: 'GigabitEthernet1/0/25',
            status: 'up',
            type: 'trunk',
            isSfp: true,
            taggedVlans: [10, 20, 30]
          }
        ]
      };
    },
    getVlans() {
      return [
        { id: 20, name: 'Office LAN', subnet: '192.168.20.0/24', gateway: '192.168.20.1' }
      ];
    },
    getPatchPanels() {
      return [
        {
          id: 'pp-1',
          name: 'PP-Floor1-Cat6',
          ports: [
            {
              portNum: 5,
              socket: 'Р-102.5',
              room: 'Каб. 102',
              cableLength: 28,
              cableType: 'UTP Cat.6',
              linkTo: { switchId: 'sw-access', portId: 'p-5' }
            }
          ]
        }
      ];
    },
    getIpam() {
      return [
        { switchId: 'sw-access', portId: 'p-5', ip: '192.168.20.45', mac: '00:1e:0b:33:44:55' }
      ];
    },
    getServers() {
      return [];
    },
    getSwitches() {
      return [{ id: 'sw-core', name: 'sw-core-mikrotik', role: 'core' }];
    }
  };

  const result = tracePortCircuit(mockStorage, 'sw-access', 'p-5');

  assert.equal(result.switchId, 'sw-access');
  assert.equal(result.portNum, 5);
  assert.equal(result.linkStatus, 'up');

  // Verify Endpoint
  assert.equal(result.endpoint.name, 'HP-LaserJet-M428');
  assert.equal(result.endpoint.ip, '192.168.20.45');
  assert.equal(result.endpoint.vlanId, 20);

  // Verify Physical Outlet (L1)
  assert.equal(result.socket.id, 'Р-102.5');
  assert.equal(result.socket.cableLengthMeters, 28);

  // Verify Patch Panel
  assert.equal(result.patchPanel.name, 'PP-Floor1-Cat6');
  assert.equal(result.patchPanel.crossConnectStatus, 'verified');

  // Verify Gateway (L3)
  assert.equal(result.gateway.ip, '192.168.20.1');
  assert.equal(result.gateway.subnet, '192.168.20.0/24');

  // Verify No Anomalies when trunk carries VLAN 20
  assert.equal(result.anomalies.length, 0);
});

test('tracePortCircuit detects VLAN pruned anomaly on trunk', () => {
  const mockStorage = {
    getSwitchById(id) {
      return {
        id: 'sw-access',
        name: 'sw-access',
        ports: [
          {
            id: 'p-3',
            portNum: 3,
            status: 'up',
            vlanId: 50, // VLAN 50 CCTV
            type: 'access'
          },
          {
            id: 'p-25',
            portNum: 25,
            status: 'up',
            type: 'trunk',
            taggedVlans: [10, 20] // VLAN 50 missing!
          }
        ]
      };
    },
    getVlans() {
      return [{ id: 50, name: 'CCTV', gateway: '192.168.50.1' }];
    },
    getPatchPanels() { return []; },
    getIpam() { return []; },
    getServers() { return []; },
    getSwitches() { return []; }
  };

  const result = tracePortCircuit(mockStorage, 'sw-access', 'p-3');
  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0].type, 'VLAN_PRUNED_ON_UPLINK');
  assert.equal(result.anomalies[0].severity, 'error');
});
