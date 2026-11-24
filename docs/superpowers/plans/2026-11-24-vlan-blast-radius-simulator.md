# VLAN Blast Radius Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive Dry-Run Sandbox and graph-analysis engine (`server/vlanBlastRadiusEngine.js`) that simulates hypothetical VLAN changes on access ports and trunks, computes the exact blast radius (impacted switches, subnets, servers, and IPAM records), enforces Guardrails protecting Management IPs and transit trunks, and generates safe vendor CLI scripts for SNR NAG and MikroTik RouterOS with rollback support.

**Architecture:** A standalone graph-analysis service `server/vlanBlastRadiusEngine.js` performs in-memory cloning of the topology graph, applies proposed VLAN reconfigurations, and executes multi-layer graph reachability algorithms (BFS/connected components). It computes risk levels (`CRITICAL`, `WARNING`, `SAFE`), detects management isolation and transit trunk partitioning, and generates vendor-specific CLI and rollback commands. Exposed via REST API in `server/index.js` and rendered in an interactive React modal `src/components/VlanBlastRadiusModal.jsx`.

**Tech Stack:** Node.js, Express, React 19, Lucide React, Tailwind CSS 4, Node.js Test Runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-24-vlan-blast-radius-simulator-design.md](file:///c:/devs/switchnotes/docs/superpowers/specs/2026-11-24-vlan-blast-radius-simulator-design.md)

## Global Constraints

- Target exclusively **SNR NAG** (SNR-OS) and **MikroTik RouterOS** (v6 Bridge / v7 Bridge VLAN Filtering).
- Performance: graph simulation across up to 200 switches must execute in under **50ms**.
- Guardrail: any change severing switch Management IP or Default Gateway reachability must be flagged as `CRITICAL` and rejected unless explicitly forced.
- Topology cycle resilience: graph traversal must track visited nodes to safely handle rings, loops, and meshed links.
- Scoped Asset Blast Radius: affected IPAM hosts and servers must strictly reflect severed ports and partitioned switch components, never falsely reporting the entire enterprise network.

## Review Focus

1. **Management Isolation on Uplink Pruning:** When an operator prunes a VLAN that carries switch Management IPs from an uplink trunk, the engine must flag `CRITICAL` risk with explicit Guardrail violation warnings.
2. **Transit Trunk Partitioning:** Pruning a VLAN from an intermediate transit trunk must detect when downstream switches with active access ports on that VLAN are cut off from upstream gateway/core.
3. **CIDR Subnet Resolution:** When switches have no explicit `managementVlan` field, the engine must accurately resolve management VLAN by matching `switch.ip` against `vlan.subnet` CIDRs.
4. **Dual-Ended Trunk Execution Ordering:** When modifying an inter-switch trunk, commands must apply to the downstream switch *first*, then the upstream switch, preventing SSH session lockouts.
5. **Fail-Fast & Rollback Generation:** Generated rollback scripts must accurately restore previous PVIDs and `trunk allowed vlan` lists for both SNR and MikroTik syntax.

---

### Task 1: Graph Adjacency, Subnet CIDR Resolution & Management Reachability Engine (`server/vlanBlastRadiusEngine.js`)

**Files:**
- Create: `server/vlanBlastRadiusEngine.js`
- Test: `test/vlanBlastRadiusEngine.test.js`

**Interfaces:**
- Consumes: `storage.getSwitches()`, `storage.getVlans()`
- Produces:
  - `class VlanBlastRadiusEngine`:
    - `resolveSwitchManagementVlan(switchItem, vlans) -> number|null`
    - `buildTopologyAdjacency(switches, vlanId) -> Map<switchId, Array<{ neighborId, port, neighborPort }>>`
    - `verifyManagementReachability(clonedSwitches, affectedVlanIds) -> { safe: boolean, isolatedSwitchIds: string[], violations: string[] }`

- [ ] **Step 1: Write failing unit tests in `test/vlanBlastRadiusEngine.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VlanBlastRadiusEngine } from '../server/vlanBlastRadiusEngine.js';

test('resolveSwitchManagementVlan matches switch IP against VLAN CIDR subnets', () => {
  const engine = new VlanBlastRadiusEngine();
  const vlans = [
    { id: 10, name: 'Management', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
    { id: 20, name: 'Users', subnet: '10.0.0.0/24', gateway: '10.0.0.1' }
  ];

  const sw1 = { id: 'sw-1', ip: '192.168.10.15' };
  const sw2 = { id: 'sw-2', ip: '10.0.0.50' };
  const sw3 = { id: 'sw-3', ip: '172.16.0.1' }; // No matching subnet

  assert.equal(engine.resolveSwitchManagementVlan(sw1, vlans), 10);
  assert.equal(engine.resolveSwitchManagementVlan(sw2, vlans), 20);
  assert.equal(engine.resolveSwitchManagementVlan(sw3, vlans), null);
});

test('verifyManagementReachability flags CRITICAL when uplink trunk pruning cuts off management path', () => {
  const engine = new VlanBlastRadiusEngine();
  const coreSw = {
    id: 'sw-core',
    name: 'CORE-01',
    role: 'core',
    ip: '192.168.10.1',
    ports: [
      { id: 'p-core-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-acc', linkedPortId: 'p-acc-1' }
    ]
  };

  const accSw = {
    id: 'sw-acc',
    name: 'ACC-01',
    role: 'access',
    ip: '192.168.10.10',
    ports: [
      { id: 'p-acc-1', number: 1, mode: 'trunk', taggedVlans: [10, 20], linkedSwitchId: 'sw-core', linkedPortId: 'p-core-1' }
    ]
  };

  engine.storage = {
    getSwitches: () => [coreSw, accSw],
    getVlans: () => [{ id: 10, subnet: '192.168.10.0/24', gateway: '192.168.10.1' }]
  };

  // Sever VLAN 10 on uplink trunk
  const clonedSwitches = JSON.parse(JSON.stringify([coreSw, accSw]));
  clonedSwitches[0].ports[0].taggedVlans = [20]; // VLAN 10 removed

  const res = engine.verifyManagementReachability(clonedSwitches, [10]);
  assert.equal(res.safe, false);
  assert.ok(res.isolatedSwitchIds.includes('sw-acc'));
  assert.match(res.violations[0], /ACC-01 потеряет доступ/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: FAIL with "Cannot find module '../server/vlanBlastRadiusEngine.js'"

- [ ] **Step 3: Implement `server/vlanBlastRadiusEngine.js`**

Implement CIDR subnet matching, L2 adjacency builder, and BFS management reachability check from Core/Gateway anchor.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/vlanBlastRadiusEngine.js test/vlanBlastRadiusEngine.test.js
git commit -m "feat(simulator): add VlanBlastRadiusEngine topology adjacency and management reachability guardrails"
```

---

### Task 2: Transit Partition Detection & Asset Blast Radius Calculator (`server/vlanBlastRadiusEngine.js`)

**Files:**
- Modify: `server/vlanBlastRadiusEngine.js`
- Test: `test/vlanBlastRadiusEngine.test.js`

**Interfaces:**
- Consumes: `storage.getServers()`, `storage.getIpamRecords()`, `storage.getPatchPanels()`
- Produces:
  - `detectTransitPartitions(clonedSwitches, affectedVlanIds) -> Array<{ switchId, vlanId, disconnectedPorts: [] }>`
  - `calculateBlastRadiusAssets(clonedSwitches, isolatedSwitchIds, disconnectedPortIds, affectedVlanIds) -> { affectedServers, affectedIpamHosts, affectedSubnets, affectedPortsCount }`

- [ ] **Step 1: Add unit tests in `test/vlanBlastRadiusEngine.test.js`**

Test that pruning a transit VLAN isolates downstream access ports on that VLAN, and correctly enumerates connected servers and IPAM records while ignoring unaffected subnets.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: FAIL (methods not implemented yet).

- [ ] **Step 3: Implement `detectTransitPartitions` and `calculateBlastRadiusAssets`**

Implement connected components analysis for each affected VLAN and correlate isolated ports to servers, IPAM hosts, and patch panel connections.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/vlanBlastRadiusEngine.js test/vlanBlastRadiusEngine.test.js
git commit -m "feat(simulator): add transit partition detection and asset blast radius calculator"
```

---

### Task 3: Vendor CLI Script & Rollback Generator with Dual-Ended Sync (`server/vlanBlastRadiusEngine.js`)

**Files:**
- Modify: `server/vlanBlastRadiusEngine.js`
- Test: `test/vlanBlastRadiusEngine.test.js`

**Interfaces:**
- Consumes: `switchItem`, `portItem`, `proposal`
- Produces:
  - `generateVendorScripts(switchItem, portItem, proposal, peerSwitchItem?, peerPortItem?) -> { vendor, commands, rollback, peerCommands, peerRollback }`
  - `simulate(proposal) -> BlastRadiusResult`

- [ ] **Step 1: Add unit tests in `test/vlanBlastRadiusEngine.test.js`**

Test script generation for SNR NAG (`switchport trunk allowed vlan...` / `switchport access vlan...`), MikroTik (`/interface bridge port set...` / `/interface bridge vlan set...`), and dual-ended trunk sync with rollback scripts.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement vendor CLI and rollback generators in `server/vlanBlastRadiusEngine.js`**

Generate exact, vendor-native syntax for SNR-OS and MikroTik RouterOS and assemble full `simulate(proposal)` pipeline returning `BlastRadiusResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/vlanBlastRadiusEngine.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/vlanBlastRadiusEngine.js test/vlanBlastRadiusEngine.test.js
git commit -m "feat(simulator): add vendor CLI generation and dual-ended trunk synchronization"
```

---

### Task 4: REST API Endpoints & Guardrail Enforcement (`server/index.js`)

**Files:**
- Modify: `server/index.js`
- Test: `test/vlanBlastRadiusApi.test.js`

**Interfaces:**
- Consumes: `vlanBlastRadiusEngine`, `storage`, `backupService.executeSshCommand`
- Produces:
  - `POST /api/vlan-simulator/simulate`
  - `POST /api/vlan-simulator/apply`

- [ ] **Step 1: Write integration tests in `test/vlanBlastRadiusApi.test.js`**

Test simulation endpoint returns `riskLevel`, `guardrailViolations`, and `apply` endpoint blocks `CRITICAL` changes unless `force: true` is passed.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/vlanBlastRadiusApi.test.js`
Expected: FAIL with route 404.

- [ ] **Step 3: Wire REST endpoints in `server/index.js`**

Add `/api/vlan-simulator/simulate` and `/api/vlan-simulator/apply` with role protection (`requireRole('engineer')`), Guardrail verification, and database + SSH updates.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/vlanBlastRadiusApi.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/index.js test/vlanBlastRadiusApi.test.js
git commit -m "feat(server): wire VLAN Blast Radius Simulator REST API endpoints and guardrails"
```

---

### Task 5: Interactive Sandbox UI Modal (`src/components/VlanBlastRadiusModal.jsx`, `src/api.js`)

**Files:**
- Create: `src/components/VlanBlastRadiusModal.jsx`
- Modify: `src/api.js`
- Modify: `src/components/SwitchCard.jsx`

**Interfaces:**
- Consumes: `/api/vlan-simulator/simulate`, `/api/vlan-simulator/apply`
- Produces:
  - `api.simulateVlanChange(payload)`, `api.applyVlanChange(payload)`
  - Interactive modal dialog with:
    - Target switch & port picker
    - Action type selector (Access VLAN change, Trunk add/remove/set)
    - "Синхронизировать встречный порт (Dual-Ended)" toggle
    - Live Risk badge (CRITICAL / WARNING / SAFE) with score meter
    - Collapsible blast radius asset tables (Switches, Servers, IPAM, Ports)
    - Generated CLI script and Rollback script preview
    - Safe Execution button with confirmation modal

- [ ] **Step 1: Add API client methods in `src/api.js`**

- [ ] **Step 2: Implement `src/components/VlanBlastRadiusModal.jsx`**

- [ ] **Step 3: Add trigger button on `src/components/SwitchCard.jsx`**

- [ ] **Step 4: Verify test suite and production build**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

Run: `npm run build`
Expected: PASS with clean bundle.

- [ ] **Step 5: Commit**

```bash
git add src/api.js src/components/VlanBlastRadiusModal.jsx src/components/SwitchCard.jsx
git commit -m "feat(ui): add interactive VLAN Blast Radius Simulator modal and switch card launcher"
```

---

### Task 6: Final Verification & Integration

- [ ] **Step 1: Run full unit & integration test suite**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

- [ ] **Step 2: Run production build verification**

Run: `npm run build`
Expected: PASS with exit code 0.

- [ ] **Step 3: Check git status and commit history**

Run: `git status`
Expected: clean working tree.
