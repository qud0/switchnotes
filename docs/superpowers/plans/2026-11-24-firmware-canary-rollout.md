# Firmware Multi-Stage Canary Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an enterprise firmware rollout orchestrator for SNR NAG and MikroTik RouterOS that verifies flash space, captures pre-upgrade golden config snapshots, executes pilot canary updates with health checks, and safely rolls out updates in batches with automated abort and rollback.

**Architecture:** A modular backend pipeline (`firmwareParser.js` $\rightarrow$ `firmwareGuardrails.js` $\rightarrow$ `firmwareRolloutService.js`) exposing REST endpoints for pre-flight audits, catalog management, and staged rollout execution, coupled with a rich interactive UI modal `FirmwareRolloutModal.jsx` featuring real-time stage progression and 1-click abort.

**Tech Stack:** Node.js (ES modules, `node:test`, `node:assert/strict`), Express, React, Lucide-react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-24-firmware-canary-rollout-design.md`

## Global Constraints

- Hardware targets are strictly SNR NAG (SNR-OS) and MikroTik RouterOS (v6 & v7).
- Core switches must never be assigned as Canary devices; they are always deferred to the final batch.
- Pre-flight backup must be completed and stored before staging any firmware.
- 100% test pass rate across all test files (`node --test test/*.test.js`).
- Clean Vite build (`npm run build`) without errors.

## Review Focus

1. Flash memory overflow prevention: switches with insufficient disk space must be rejected at pre-flight stage with clear byte deficit reporting.
2. If Canary switch fails ICMP or SSH health check within timeout window, the pipeline must immediately abort and never touch the remaining switches.
3. SNR-OS boot configuration must preserve secondary backup image for recovery.
4. Firmware catalog must validate SHA256 integrity before staging.
5. Emergency Abort must stop subsequent batches cleanly even if mid-flight.

---

### Task 1: Hardware Pre-Flight & Health Parser

**Files:**
- Create: `server/firmwareParser.js`
- Test: `test/firmwareParser.test.js`

**Interfaces:**
- Produces:
  - `parseSnrFlashSpace(output: string): { freeBytes: number, totalBytes: number }`
  - `parseSnrVersion(output: string): { version: string, model: string }`
  - `parseMikrotikResource(output: string): { version: string, freeHddBytes: number, totalHddBytes: number, architecture: string }`
  - `parseHealthCheckOutput(output: string, vendor: string): { isHealthy: boolean, issues: string[] }`

- [ ] **Step 1: Write the failing test for firmware parsers**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/firmwareParser.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Pre-Flight Audit & Guardrail Engine

**Files:**
- Create: `server/firmwareGuardrails.js`
- Test: `test/firmwareGuardrails.test.js`

**Interfaces:**
- Consumes: `firmwareParser.js`
- Produces:
  - `validatePreflight({ switchObj, firmwareInfo, flashStatus, role }): { canUpgrade: boolean, violations: string[], warnings: string[] }`
  - `generatePreUpgradeBackupCommand(vendor: string): string`
  - `generateBootImageCommands(vendor: string, filename: string, backupFilename?: string): string[]`

- [ ] **Step 1: Write the failing test for guardrail engine**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/firmwareGuardrails.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Multi-Stage Canary Rollout Orchestrator Service

**Files:**
- Create: `server/firmwareRolloutService.js`
- Test: `test/firmwareRolloutService.test.js`

**Interfaces:**
- Consumes: `firmwareParser.js`, `firmwareGuardrails.js`, `executeSshCommand`
- Produces:
  - `runPreflightAudit({ storage, switchIds, firmwareId }): Promise<PreflightAuditReport>`
  - `startRollout({ storage, switchIds, canaryIds, firmwareId, batchSize, options }): Promise<{ rolloutId: string }>`
  - `getRolloutStatus(rolloutId: string): RolloutState`
  - `abortRollout(rolloutId: string): { success: boolean }`

- [ ] **Step 1: Write the failing test for rollout orchestrator**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `server/firmwareRolloutService.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: REST API Endpoints in `server/index.js`

**Files:**
- Modify: `server/index.js`
- Test: `test/firmwareRolloutApi.test.js`

**Interfaces:**
- `GET /api/firmware/catalog`
- `POST /api/firmware/preflight`
- `POST /api/firmware/rollout/start`
- `GET /api/firmware/rollout/status`
- `POST /api/firmware/rollout/abort`

- [ ] **Step 1: Write failing test for firmware REST API**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Mount routes in `server/index.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Frontend UI Modal & Integration

**Files:**
- Create: `src/components/FirmwareRolloutModal.jsx`
- Modify: `src/api.js`
- Modify: `src/components/TopologyView.jsx` (or top navigation)

**Interfaces:**
- `api.getFirmwareCatalog()`
- `api.runFirmwarePreflight(payload)`
- `api.startFirmwareRollout(payload)`
- `api.getFirmwareRolloutStatus(rolloutId)`
- `api.abortFirmwareRollout(rolloutId)`
- `FirmwareRolloutModal.jsx`: 4-step wizard with pre-flight gauges, canary selection, stage timeline, live console logs, and abort button.

- [ ] **Step 1: Add API client methods in `src/api.js`**
- [ ] **Step 2: Implement `src/components/FirmwareRolloutModal.jsx`**
- [ ] **Step 3: Verify with `npm run build`**
- [ ] **Step 4: Commit**

---

### Task 6: Full Verification & Master Push

- [ ] **Step 1: Run all unit tests (`node --test test/*.test.js`)**
- [ ] **Step 2: Run production build (`npm run build`)**
- [ ] **Step 3: Push commits to `origin/master`**
