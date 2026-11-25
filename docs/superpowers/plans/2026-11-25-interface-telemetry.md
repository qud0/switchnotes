# Live Interface Telemetry & Prometheus Metrics Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time interface telemetry with 64-bit HC counters, discards/drops tracking, Prometheus `/metrics` exporter (0.0.4 text format), in-memory daemon caching, faceplate real-time traffic overlay, and Top Talkers & Error Matrix modal.

**Architecture:**
- **Backend SNMP Engine:** Refactor `server/snmpPoller.js` to query `ifTable` & `ifXTable`, decode `Counter64` Buffers via `BigInt`, handle 32-bit wrap vs 64-bit reset, guard division by zero, and provide monotonic simulated counters.
- **Prometheus Exporter:** `server/prometheusExporter.js` formats metrics from cached switch telemetry in OpenMetrics / Prometheus 0.0.4 text format.
- **Daemon Caching & WebSockets:** `server/snmpMonitorDaemon.js` implements bounded concurrency polling, in-memory telemetry snapshot cache, and emits WebSocket telemetry push.
- **API Endpoints:** `server/index.js` exposes public `GET /metrics` and `GET /api/telemetry/top-talkers`.
- **Frontend UI:** `SwitchFaceplate.jsx` and `PortItem.jsx` display traffic utilization bars and CRC badges in `heatmapMode === 'traffic'`; `FleetTelemetryModal.jsx` displays Top Talkers, Error Matrix, and Prometheus scrape configuration.

**Tech Stack:** Node.js, Express, `net-snmp`, React 18, Tailwind CSS, Lucide icons, Node test runner (`node --test`).

---

## Proposed Changes

### Backend

#### [snmpPoller.js](file:///c:/devs/switchnotes/server/snmpPoller.js)
- Add `parseCounter64(val)` helper using `Buffer.isBuffer(val) ? val.readBigUInt64BE(0) : BigInt(val || 0)`.
- Query `ifTable` (`ifDescr`, `ifSpeed`, `ifOperStatus`, `ifInOctets`, `ifInErrors`, `ifOutOctets`, `ifOutErrors`, `ifInDiscards`, `ifOutDiscards`) and `ifXTable` (`ifHighSpeed`, `ifHCInOctets`, `ifHCOutOctets`, `ifHCInUcastPkts`, `ifHCOutUcastPkts`, `ifAlias`).
- Implement 32-bit rollover math: `curr < prev` for 32-bit counter computes `(2n ** 32n - prev) + curr`.
- Guard division by zero: `utilizationPct = speedMbps > 0 ? Math.min(100, (Math.max(rxMbps, txMbps) / speedMbps) * 100) : 0`.
- Maintain monotonic persistent simulator counter state in `simulatedCountersMap`.
- Mark `online: false` in `auto` mode when device is unreachable.

#### [prometheusExporter.js](file:///c:/devs/switchnotes/server/prometheusExporter.js) (NEW)
- Format Prometheus exposition format (version 0.0.4).
- Export: `switchbook_switch_online`, `switchbook_port_link_status`, `switchbook_port_speed_bps`, `switchbook_port_traffic_bps` (rx/tx), `switchbook_port_errors_total` (rx/tx), `switchbook_port_discards_total` (rx/tx), `switchbook_poe_power_watts`.
- Standardize on `switch_id` label and escape special characters.

#### [snmpMonitorDaemon.js](file:///c:/devs/switchnotes/server/snmpMonitorDaemon.js)
- Implement bounded concurrency polling pool (concurrency = 6-8).
- Maintain `latestTelemetrySnapshot` in memory for O(1) reads.
- Provide `getFleetTopTalkers()` and `getFleetErrorRadar()`.
- Broadcast telemetry deltas over WebSocket bus.

#### [server/index.js](file:///c:/devs/switchnotes/server/index.js)
- Register `GET /metrics` returning `text/plain; version=0.0.4; charset=utf-8` without authentication requirement.
- Register `GET /api/telemetry/top-talkers` returning aggregated fleet bandwidth, top 5 talkers, and top 5 error ports.

---

### Frontend

#### [src/api.js](file:///c:/devs/switchnotes/src/api.js)
- Add `api.getFleetTopTalkers()`.

#### [src/components/PortItem.jsx](file:///c:/devs/switchnotes/src/components/PortItem.jsx)
- In traffic heatmap mode, render a sleek vertical utilization gauge (3px bar on edge) color-coded:
  - Green (< 50%)
  - Yellow / Amber (50% - 85%)
  - Red / Pulse (> 85%)
- Render compact `!CRC` indicator when port has input/output errors.
- Ensure high contrast on both dark (`noc`, `neon`) and light (`vendor`) chassis themes.

#### [src/components/SwitchFaceplate.jsx](file:///c:/devs/switchnotes/src/components/SwitchFaceplate.jsx)
- Enhance `heatmapMode === 'traffic'` toggle with real-time utilization stats and live sparklines.

#### [src/components/FleetTelemetryModal.jsx](file:///c:/devs/switchnotes/src/components/FleetTelemetryModal.jsx) (NEW)
- Real-time fleet metrics (Total Ingress / Egress Gbps, active links, total CRC/Discards).
- Top-5 Most Loaded Interfaces with progress bars and port specs.
- Top-5 Error & Discard interfaces with quick diagnostic link.
- Prometheus configuration tab (`scrape_configs`) with 1-click copy button.

#### [src/components/Header.jsx](file:///c:/devs/switchnotes/src/components/Header.jsx)
- Add quick-access button or status icon to open the Fleet Telemetry & Top Talkers modal.

---

## Tasks

### Task 1: SNMP Poller Refactoring & Math Fixes
- [ ] Create `test/snmpTelemetry.test.js` covering Counter64 decoding, 32-bit rollover, division by zero guards, and monotonic simulated counters.
- [ ] Run test to verify failure.
- [ ] Refactor `server/snmpPoller.js` to implement `parseCounter64`, column querying, rollover handling, zero division guards, and persistent simulator state.
- [ ] Run `node --test test/snmpTelemetry.test.js` to verify all tests pass.

### Task 2: Prometheus Metrics Exporter
- [ ] Create `test/prometheusExporter.test.js` testing Prometheus text format output, metric naming, label escaping, and counter types.
- [ ] Run test to verify failure.
- [ ] Implement `server/prometheusExporter.js` with `generatePrometheusMetrics(storage, daemonCache)`.
- [ ] Run `node --test test/prometheusExporter.test.js` to verify all tests pass.

### Task 3: Daemon Caching, Bounded Concurrency & Top Talkers API
- [ ] Enhance `server/snmpMonitorDaemon.js` with concurrency pool, in-memory snapshot cache, and Top Talkers computation.
- [ ] Add `GET /metrics` and `GET /api/telemetry/top-talkers` in `server/index.js`.
- [ ] Add API integration tests in `test/prometheusExporter.test.js`.

### Task 4: Frontend Live Telemetry Visualization
- [ ] Update `src/api.js` to expose `getFleetTopTalkers()`.
- [ ] Enhance `src/components/PortItem.jsx` with vertical utilization micro-meters and CRC error badges.
- [ ] Enhance `src/components/SwitchFaceplate.jsx` traffic mode.
- [ ] Create `src/components/FleetTelemetryModal.jsx` (Fleet summary, Top Talkers, Error Matrix, Prometheus config snippet).
- [ ] Add launcher button in `src/components/Header.jsx`.

### Task 5: Verification & End-to-End QA
- [ ] Run `npm run build` to verify production build passes.
- [ ] Run full test suite `node --test` to verify 100% test pass.
- [ ] Launch Browser Subagent to perform live browser QA: inspect faceplate traffic mode, open Fleet Telemetry modal, verify Top Talkers charts and Prometheus snippet.
- [ ] Commit and push to `master`.
