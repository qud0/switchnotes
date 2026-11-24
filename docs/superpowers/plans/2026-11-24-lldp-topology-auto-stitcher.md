# LLDP/CDP Live Topology Auto-Stitcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an enterprise LLDP/CDP auto-stitcher for SNR NAG and MikroTik RouterOS that discovers physical L2/L3 topology, groups LACP/bonding trunks, identifies STP/RSTP root bridges and blocked standby ports, computes topology diffs against SwitchBook, and reconciles the graph with 1-click apply.

**Architecture:** A modular backend pipeline (`topologyStitcherParser.js` $\rightarrow$ `topologyStitcherEngine.js` $\rightarrow$ `topologyStitcherService.js`) with concurrent SSH polling and simulation fallbacks, exposed via clean REST endpoints (`/api/topology/stitch/scan` and `/api/topology/stitch/apply`) and integrated directly into `TopologyView.jsx` with real-time STP/LACP graph rendering and an interactive reconciliation modal.

**Tech Stack:** Node.js (ES modules, `node:test`, `node:assert/strict`), Express, React, Lucide-react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-24-lldp-topology-auto-stitcher-design.md`

## Global Constraints

- Hardware targets are strictly SNR NAG (SNR-OS) and MikroTik RouterOS (v6 & v7).
- No external heavy dependencies; use existing regex parsers, `ssh2` through `executeSshCommand`, and built-in Node test runner.
- Zero data loss: `applyStitchedLinks` must only mutate valid linked switch/port IDs and safely update bidirectional links.
- 100% test pass rate across all test files (`node --test test/*.test.js`).
- Clean Vite build (`npm run build`) without ESLint or syntax errors.

## Review Focus

1. Partial or truncated LLDP neighbor output must not crash the parser or corrupt links.
2. Multiple links between the same switches belonging to a Port-Channel/bonding interface must be cleanly aggregated into one logical trunk with member details.
3. An STP blocked or alternate port on either end of a cable must mark the entire link as `isBlocked: true` (standby path).
4. Switches with identical or empty hostnames must correctly fall back to IP or MAC address matching.
5. Missing links in SwitchBook must not be pruned unless explicitly requested with `pruneMissing: true`.

---

### Task 1: Parser Engine for SNR-OS and MikroTik (LLDP, LACP, STP)

**Files:**
- Create: `server/topologyStitcherParser.js`
- Test: `test/topologyStitcherParser.test.js`

**Interfaces:**
- Produces:
  - `parseSnrLldp(output: string): Array<{ localPort, remoteChassis, remotePort, remoteSysName, remoteMgmtIp }>`
  - `parseSnrLacp(output: string): Map<string, { channelId, members: string[] }>`
  - `parseSnrStp(output: string): { isRootBridge: boolean, rootBridgeId: string, ports: Map<string, { role: string, state: string, isBlocked: boolean }> }`
  - `parseMikrotikNeighbors(output: string): Array<{ localPort, remoteChassis, remotePort, remoteSysName, remoteMgmtIp }>`
  - `parseMikrotikBonding(output: string): Map<string, { name: string, slaves: string[] }>`
  - `parseMikrotikStp(bridgeOutput: string, portOutput: string): { isRootBridge: boolean, ports: Map<string, { role: string, state: string, isBlocked: boolean }> }`

- [ ] **Step 1: Write the failing test for parsers**
Write comprehensive tests in `test/topologyStitcherParser.test.js` using sample outputs from SNR-OS and MikroTik.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/topologyStitcherParser.test.js`
Expected: FAIL with "Cannot find module ... topologyStitcherParser.js"

- [ ] **Step 3: Implement `server/topologyStitcherParser.js`**
Implement robust regex parsing for SNR-OS and MikroTik RouterOS outputs.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/topologyStitcherParser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/topologyStitcherParser.js test/topologyStitcherParser.test.js
git commit -m "feat(topology): add SNR-OS and MikroTik LLDP, LACP and STP parsers"
```

---

### Task 2: Topology Correlation, LACP Bundling & Diff Engine

**Files:**
- Create: `server/topologyStitcherEngine.js`
- Test: `test/topologyStitcherEngine.test.js`

**Interfaces:**
- Consumes: Parsed outputs from `topologyStitcherParser.js`.
- Produces:
  - `normalizePortName(name: string): string`
  - `matchSwitch(switches: Switch[], neighbor: DiscoveredNeighbor): Switch | null`
  - `matchPort(switchObj: Switch, portIdentifier: string): Port | null`
  - `buildStitchedGraph({ switches, rawNeighborData, lagData, stpData }): { links: StitchedLink[], rootBridgeId: string }`
  - `computeTopologyDiff({ switches, discoveredLinks }): { matched: StitchedLink[], newLinks: StitchedLink[], missingLinks: StitchedLink[], mismatches: StitchedLink[] }`

- [ ] **Step 1: Write the failing test for correlation and diff**
Create `test/topologyStitcherEngine.test.js` testing neighbor switch matching, LACP bundling, STP blocked port assignment, and diff detection.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/topologyStitcherEngine.test.js`
Expected: FAIL with "Cannot find module ... topologyStitcherEngine.js"

- [ ] **Step 3: Implement `server/topologyStitcherEngine.js`**
Implement port normalization, neighbor matching by IP/MAC/sysName, LACP trunk aggregation, and diff calculation against existing `linkedSwitchId`/`linkedPortId`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/topologyStitcherEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/topologyStitcherEngine.js test/topologyStitcherEngine.test.js
git commit -m "feat(topology): add correlation, LACP aggregation and diff engine"
```

---

### Task 3: Stitch Service, Live SSH Scan Orchestrator & Storage Apply

**Files:**
- Create: `server/topologyStitcherService.js`
- Test: `test/topologyStitcherService.test.js`

**Interfaces:**
- Consumes: `topologyStitcherParser.js`, `topologyStitcherEngine.js`, `executeSshCommand`.
- Produces:
  - `scanTopology({ storage, mode, credentials }): Promise<StitchScanReport>`
  - `applyStitchedTopology(storage, { linkIds, pruneMissing, scanResult }): { success: boolean, appliedCount: number, prunedCount: number }`

- [ ] **Step 1: Write the failing test for service and apply**
Create `test/topologyStitcherService.test.js` with mock SSH executor and mock storage.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/topologyStitcherService.test.js`
Expected: FAIL with "Cannot find module ... topologyStitcherService.js"

- [ ] **Step 3: Implement `server/topologyStitcherService.js`**
Implement parallel SSH polling with simulation fallback, aggregation, and atomic storage mutation for 1-click apply and pruning.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/topologyStitcherService.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/topologyStitcherService.js test/topologyStitcherService.test.js
git commit -m "feat(topology): add topology stitch service with live SSH scan and storage apply"
```

---

### Task 4: REST API Endpoints in `server/index.js`

**Files:**
- Modify: `server/index.js`
- Test: `test/topologyStitcherApi.test.js`

**Interfaces:**
- `POST /api/topology/stitch/scan`: `{ mode?: 'auto'|'simulation'|'hardware' }` $\rightarrow$ `StitchScanReport`
- `POST /api/topology/stitch/apply`: `{ linkIds?: string[], pruneMissing?: boolean }` $\rightarrow$ `{ success: true, appliedCount, prunedCount }`

- [ ] **Step 1: Write the failing test for API endpoints**
Create `test/topologyStitcherApi.test.js` validating the route responses and error handling.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/topologyStitcherApi.test.js`
Expected: FAIL with 404 Not Found

- [ ] **Step 3: Implement routes in `server/index.js`**
Mount `/api/topology/stitch/scan` and `/api/topology/stitch/apply`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/topologyStitcherApi.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add server/index.js test/topologyStitcherApi.test.js
git commit -m "feat(api): add REST endpoints for topology stitch scan and apply"
```

---

### Task 5: Frontend UI — Modal, Diff View & Auto-Stitch Controls

**Files:**
- Modify: `src/services/api.js`
- Modify: `src/components/TopologyView.jsx`

**Interfaces:**
- `api.scanTopologyStitch(options)`
- `api.applyTopologyStitch(payload)`
- `TopologyView.jsx`: Top action button, `isStitchModalOpen`, scan results view with metrics, diff table, and graph STP/LACP visual enhancements.

- [ ] **Step 1: Add API client methods in `src/services/api.js`**
Export `scanTopologyStitch` and `applyTopologyStitch`.

- [ ] **Step 2: Enhance `TopologyView.jsx` with Auto-Stitch Modal and live visualization**
Add Live Topology Auto-Stitcher modal with:
- Status indicators for Root Bridge, LACP trunks, and STP Blocked links.
- Diff tabs (All / New / Missing / Discrepancies).
- 1-click Auto-Stitch All button.
- Graph rendering with amber dashed lines for STP blocked paths and LACP badges.

- [ ] **Step 3: Run Vite build to verify frontend compilation**
Run: `npm run build`
Expected: Clean compilation with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add src/services/api.js src/components/TopologyView.jsx
git commit -m "feat(ui): add Live Topology Auto-Stitcher modal and STP/LACP visualization"
```

---

### Task 6: Full Verification & Master Push

- [ ] **Step 1: Run all unit tests**
Run: `node --test test/*.test.js`
Expected: All tests pass (0 failures).

- [ ] **Step 2: Run production build**
Run: `npm run build`
Expected: Successful build.

- [ ] **Step 3: Push commits to `origin/master`**
Push to remote repository.
