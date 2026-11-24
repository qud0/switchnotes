# Optics Health & Early Degradation AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an enterprise optical telemetry AI service that tracks historical SFP/SFP+ DDM parameters, computes degradation trend slopes, projects Time-To-Failure (TTF), correlates dual-ended inter-switch optical spans for asymmetric fiber faults, and surfaces actionable proactive maintenance alerts in a rich interactive modal.

**Architecture:** A modular backend pipeline (`opticsDegradationEngine.js` $\rightarrow$ `opticsSpanCorrelator.js` $\rightarrow$ `opticsHealthService.js`) with REST endpoints for fleet summaries, single-port predictive analyses, and dual-ended span diagnostics, coupled with `OpticsHealthModal.jsx` featuring trend sparklines, span loss diagrams, and AI root cause diagnoses.

**Tech Stack:** Node.js (ES modules, `node:test`, `node:assert/strict`), Express, React, Lucide-react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-24-optics-health-degradation-ai-design.md`

## Global Constraints

- SFF-8472 optical standard: Rx sensitivity threshold set to $-20.0\text{ dBm}$, Laser Bias warning threshold set to $45\text{ mA}$, critical at $50\text{ mA}$.
- Backward compatibility: Must seamlessly enrich existing `getSwitchPortDdm` and `getSwitchAllDdm` in `ddmService.js` without breaking existing callers.
- Historical data must be capped to 50 points per optical port to maintain lean JSON storage.
- 100% test pass rate across all test files (`node --test test/*.test.js`).
- Clean Vite build (`npm run build`) without errors.

## Review Focus

1. Flat or noisy historical readings must not produce false-positive TTF predictions; slope threshold $\le -0.15\text{ dB/day}$ required for degradation alerts.
2. Dual-ended span correlation must handle asymmetrical link speeds (e.g. 1G vs 10G) and single-ended unlinked ports gracefully.
3. Sudden step drops in Rx Power with normal Bias Current must be accurately classified as `CONNECTOR_DIRT_OR_BEND`.
4. Creeping increases in Bias Current with deteriorating Tx must be classified as `LASER_AGING`.
5. Ports with no optical signal ($\text{Rx} \le -32\text{ dBm}$) must report `NO_LIGHT` without dividing by zero in TTF calculation.

---

### Task 1: Optics Trend & Degradation AI Mathematical Engine

**Files:**
- Create: `server/opticsDegradationEngine.js`
- Test: `test/opticsDegradationEngine.test.js`

**Interfaces:**
- Produces:
  - `calculateTrendSlopes(historyPoints: Array<{ timestamp, rxDbm, txDbm, biasCurrentMa, temperatureC }>): { rxSlopeDbPerDay: number, biasSlopeMaPerDay: number, isDegrading: boolean }`
  - `calculateTimeToFailure(currentRx: number, rxSlopeDbPerDay: number, criticalThreshold?: number): { ttfDays: number | null, urgency: 'CRITICAL' | 'WARNING' | 'STABLE' | 'IMMINENT' }`
  - `classifyOpticalRootCause({ currentDbm, rxSlope, biasCurrent, biasSlope, temperatureC, dualSpanAsymmetry }): { classification: string, confidence: number, diagnosis: string, recommendation: string }`

- [ ] **Step 1: Write failing test for optics degradation engine**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/opticsDegradationEngine.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Dual-Ended Span Correlation & Fleet Analyzer

**Files:**
- Create: `server/opticsSpanCorrelator.js`
- Test: `test/opticsSpanCorrelator.test.js`

**Interfaces:**
- Produces:
  - `correlateOpticalSpans({ switches, portDdmMap }): Array<OpticalSpan>`
  - `detectSpanAsymmetry(span: OpticalSpan): { isAsymmetric: boolean, deltaDb: number, faultyDirection: string }`
  - `calculateSpanMargin(span: OpticalSpan): { minMarginDb: number, forwardMarginDb: number, reverseMarginDb: number }`

- [ ] **Step 1: Write failing test for span correlator**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/opticsSpanCorrelator.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Optics Degradation Service & History Storage

**Files:**
- Create: `server/opticsHealthService.js`
- Test: `test/opticsHealthService.test.js`

**Interfaces:**
- Consumes: `opticsDegradationEngine.js`, `opticsSpanCorrelator.js`, `ddmService.js`
- Produces:
  - `recordDdmSnapshot(storage, { switchId, portId, ddmReport }): void`
  - `getPortAnalysis(storage, { switchId, portId }): PortOpticsAnalysis`
  - `getFleetOpticsSummary(storage): FleetOpticsSummary`
  - `generateSyntheticOpticsHistory(port: object): Array<object>`

- [ ] **Step 1: Write failing test for optics health service**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/opticsHealthService.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: REST API Endpoints in `server/index.js`

**Files:**
- Modify: `server/index.js`
- Test: `test/opticsHealthApi.test.js`

**Interfaces:**
- `GET /api/optics/fleet-summary`
- `GET /api/optics/switches/:switchId/ports/:portId/analysis`
- `GET /api/optics/spans`
- `POST /api/optics/poll-fleet`

- [ ] **Step 1: Write failing test for optics REST API**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Mount routes in `server/index.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Frontend UI Modal & Integration

**Files:**
- Create: `src/components/OpticsHealthModal.jsx`
- Modify: `src/api.js`
- Modify: `src/components/TopologyView.jsx` (and/or `SfpDdmCard.jsx`)

**Interfaces:**
- `api.getOpticsFleetSummary()`
- `api.getPortOpticsAnalysis(switchId, portId)`
- `api.getOpticsSpans()`
- `api.pollOpticsFleet()`
- `OpticsHealthModal.jsx`: Fleet overview, degradation radar, port sparkline trend, dual-ended span visualizer, and AI recommendations.

- [ ] **Step 1: Add API client methods in `src/api.js`**
- [ ] **Step 2: Implement `src/components/OpticsHealthModal.jsx`**
- [ ] **Step 3: Verify with `npm run build`**
- [ ] **Step 4: Commit**

---

### Task 6: Full Verification & Master Push

- [ ] **Step 1: Run all unit tests (`node --test test/*.test.js`)**
- [ ] **Step 2: Run production build (`npm run build`)**
- [ ] **Step 3: Push commits to `origin/master`**
