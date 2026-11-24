# Config Drift Radar & 2-Way Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real-time reactive Configuration Drift Radar that detects uncommitted or unauthorized network configuration changes on SNR and MikroTik switches, normalizes dynamic lines to prevent false positives, and provides 1-click 2-way reconciliation (Accept as Baseline / Safe Rollback).

**Architecture:** A backend service `server/configDriftService.js` managing a concurrency-controlled worker queue (`concurrency: 2`) with 10-second debounce and 30-second cooldown per device. Triggered instantly by `eventPulseDaemon` when Syslog reports configuration mode exit (`%SYS-5-CONFIG_I` / `system,info config changed`) or periodically. Uses a dedicated normalization pipeline `server/configNormalizer.js` to strip volatile timestamps and NTP noise before calculating SHA-256 hashes and LCS diffs. Offers safe fail-fast rollbacks with Guardrails protecting Management IPs.

**Tech Stack:** Node.js, Express, React 19, Lucide React, Tailwind CSS 4, Node.js Test Runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-24-config-drift-radar-design.md](file:///c:/devs/switchnotes/docs/superpowers/specs/2026-11-24-config-drift-radar-design.md)

## Global Constraints

- Target exclusively **SNR NAG** (SNR-OS) and **MikroTik RouterOS** (v6/v7).
- Zero false-positives: dynamic lines (export dates, NTP drift, certificate validity) must be stripped during normalization before hashing or diffing.
- Queue concurrency limit: maximum 2 simultaneous SSH connections for drift checks.
- Guardrails: rollback scripts must strictly forbid deleting or altering the switch Management IP, default route, or SSH management port.
- Fail-fast rollback: abort immediately if CLI returns `% Error`, `% Invalid`, or `failure:`, and never run `write` on partial failure.

## Review Focus

1. **False Positives on RouterOS Exports:** RouterOS prepends `# mmm/dd/yyyy hh:mm:ss by RouterOS` to every export. Normalizer must eliminate this line so identical configs generate identical SHA-256 hashes.
2. **False Positives on SNR-OS Exports:** SNR-OS outputs `! Current configuration : ...`, `! Last configuration change at ...`, and `ntp clock-period <number>`. Normalizer must eliminate all volatile comments and NTP phase adjustments.
3. **Queue Throttling during Syslog Storms:** If 10 switches send configuration change Syslog events within seconds, the queue must process at most 2 in parallel with a 10s debounce.
4. **Guardrail Protection:** An unauthorized rollback must never attempt to remove the active Management IP or trunk link connecting the switch.
5. **Fail-Fast Rollback Execution:** If a rollback command encounters a syntax error or rejection, execution must stop immediately without executing `write`.

---

### Task 1: Config Normalization Engine & Tests (`server/configNormalizer.js`)

**Files:**
- Create: `server/configNormalizer.js`
- Test: `test/configNormalizer.test.js`

**Interfaces:**
- Consumes: Raw config string, vendor string
- Produces:
  - `normalizeConfig(content: string, vendor?: string) -> string`
  - `calculateNormalizedHash(content: string, vendor?: string) -> string`

- [ ] **Step 1: Write failing unit tests in `test/configNormalizer.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConfig,
  calculateNormalizedHash
} from '../server/configNormalizer.js';

test('normalizeConfig eliminates MikroTik export timestamps and volatile headers', () => {
  const config1 = `# nov/24/2026 14:00:00 by RouterOS 7.15.2\n# software id = 48R2-M1K9\n/interface bridge add name=bridge1\n/ip address add address=192.168.1.1/24 interface=bridge1`;
  const config2 = `# nov/24/2026 14:45:12 by RouterOS 7.15.2\n# software id = 48R2-M1K9\n/interface bridge add name=bridge1\n/ip address add address=192.168.1.1/24 interface=bridge1`;

  const norm1 = normalizeConfig(config1, 'mikrotik');
  const norm2 = normalizeConfig(config2, 'mikrotik');

  assert.equal(norm1, norm2);
  assert.equal(calculateNormalizedHash(config1, 'mikrotik'), calculateNormalizedHash(config2, 'mikrotik'));
});

test('normalizeConfig eliminates SNR-OS change timestamps and NTP clock-period', () => {
  const config1 = `! Current configuration : 1520 bytes\n! Last configuration change at 12:00:00 UTC Mon Nov 24 2026 by admin\nhostname SW-1\nntp clock-period 1234567\ninterface Vlan1\n ip address 10.0.0.1 255.255.255.0`;
  const config2 = `! Current configuration : 1580 bytes\n! Last configuration change at 15:30:22 UTC Mon Nov 24 2026 by admin\nhostname SW-1\nntp clock-period 9876543\ninterface Vlan1\n ip address 10.0.0.1 255.255.255.0`;

  const norm1 = normalizeConfig(config1, 'snr');
  const norm2 = normalizeConfig(config2, 'snr');

  assert.equal(norm1, norm2);
  assert.equal(calculateNormalizedHash(config1, 'snr'), calculateNormalizedHash(config2, 'snr'));
});

test('normalizeConfig detects genuine changes like new VLAN or port change', () => {
  const config1 = `hostname SW-1\nvlan 10\n name Users`;
  const config2 = `hostname SW-1\nvlan 10\n name Users\nvlan 20\n name Servers`;

  assert.notEqual(
    calculateNormalizedHash(config1, 'snr'),
    calculateNormalizedHash(config2, 'snr')
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/configNormalizer.test.js`
Expected: FAIL with "Cannot find module '../server/configNormalizer.js'"

- [ ] **Step 3: Implement `server/configNormalizer.js`**

Implement regex cleaning rules for MikroTik RouterOS and SNR-OS, and SHA-256 calculation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/configNormalizer.test.js`
Expected: PASS all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/configNormalizer.js test/configNormalizer.test.js
git commit -m "feat(drift): add configNormalizer engine and zero-false-positive hash calculator"
```

---

### Task 2: MikroTik Config Change Syslog Parser (`server/eventPulseParser.js`)

**Files:**
- Modify: `server/eventPulseParser.js`
- Test: `test/eventPulseParser.test.js`

**Interfaces:**
- Consumes: Syslog messages from MikroTik
- Produces: `type: 'config_change'` event when configuration changes

- [ ] **Step 1: Add unit test in `test/eventPulseParser.test.js`**

```javascript
test('parseSyslogMessage parses MikroTik configuration change event', () => {
  const msg = 'system,info device configuration changed by admin via winbox';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'config_change');
  assert.equal(result.severity, 'warning');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test test/eventPulseParser.test.js`
Expected: FAIL (type was 'syslog' generic fallback, not 'config_change')

- [ ] **Step 3: Implement pattern matching in `server/eventPulseParser.js`**

Add regex `system,info(?:,account)?.*?(?:configuration changed|logged in and changed)` producing `config_change` event.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/eventPulseParser.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/eventPulseParser.js test/eventPulseParser.test.js
git commit -m "feat(events): add MikroTik configuration change Syslog parser pattern"
```

---

### Task 3: Drift Detection Service with Worker Queue & Guardrails (`server/configDriftService.js`)

**Files:**
- Create: `server/configDriftService.js`
- Test: `test/configDriftService.test.js`

**Interfaces:**
- Consumes: `storage`, `backupService`, `configNormalizer`
- Produces:
  - `class ConfigDriftService`:
    - `resolveCredentials(switchItem) -> { port, username, password, privateKey }`
    - `enqueueDriftCheck(switchId: string, delayMs?: number) -> Promise<void>`
    - `checkSwitchDrift(switchId: string) -> Promise<DriftResult>`
    - `reconcileAccept(switchId: string) -> Promise<object>`
    - `reconcileRollback(switchId: string) -> Promise<object>`
    - `validateRollbackSafety(commands: string[], switchItem: object) -> { safe: boolean, reason?: string }`

- [ ] **Step 1: Write unit tests in `test/configDriftService.test.js`**

Test credential hierarchy, Guardrail blocking of Management IP deletion, and Golden baseline reconciliation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/configDriftService.test.js`
Expected: FAIL with "Cannot find module '../server/configDriftService.js'"

- [ ] **Step 3: Implement `server/configDriftService.js`**

Implement `ConfigDriftService` with:
- Concurrency-limited queue (`concurrency: 2`).
- Debounce and cooldown per switch.
- Golden baseline retrieval from `storage.getBackups()`.
- LCS diff generation.
- Guardrail validation in `validateRollbackSafety`.
- Fail-fast line execution in `reconcileRollback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/configDriftService.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/configDriftService.js test/configDriftService.test.js
git commit -m "feat(drift): add ConfigDriftService worker queue, guardrails, and 2-way sync"
```

---

### Task 4: Backend REST API & Event Trigger Wiring (`server/index.js`, `server/eventPulseDaemon.js`)

**Files:**
- Modify: `server/eventPulseDaemon.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `configDriftService`
- Produces:
  - Automatic `enqueueDriftCheck` on Syslog `config_change`
  - REST endpoints:
    - `GET /api/drift/status`
    - `POST /api/drift/:switchId/check`
    - `POST /api/drift/:switchId/reconcile-accept`
    - `POST /api/drift/:switchId/reconcile-rollback`

- [ ] **Step 1: Connect `eventPulseDaemon` to `configDriftService`**
  - When `parsed.type === 'config_change'` and `switchId` is matched, call `configDriftService.enqueueDriftCheck(switchId)`.

- [ ] **Step 2: Add REST endpoints in `server/index.js`**
  - Wire status, check, accept, and rollback endpoints with error handling.

- [ ] **Step 3: Run backend test suite**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

- [ ] **Step 4: Commit**

```bash
git add server/eventPulseDaemon.js server/index.js
git commit -m "feat(server): wire config change Syslog trigger and drift reconciliation REST API"
```

---

### Task 5: Frontend Drift Radar UI in Switch Card & Backup Modal

**Files:**
- Modify: `src/api.js`
- Modify: `src/components/SwitchCard.jsx`
- Modify: `src/components/ConfigBackupModal.jsx`

**Interfaces:**
- Consumes: Drift API endpoints, `diffUtils`
- Produces:
  - Drift badge on switch cards
  - "Радар расхождений (Drift)" tab in `ConfigBackupModal` with Side-by-Side Diff and 2-way sync actions.

- [ ] **Step 1: Add drift methods in `src/api.js`**
  - `api.getDriftStatus()`, `api.triggerDriftCheck(switchId)`, `api.reconcileAccept(switchId)`, `api.reconcileRollback(switchId)`.

- [ ] **Step 2: Add Drift badge in `src/components/SwitchCard.jsx`**
  - Show `⚠️ Drift (+X/-Y)` or `✓ Синхронизирован` badge on the switch card.

- [ ] **Step 3: Add Drift Radar view in `src/components/ConfigBackupModal.jsx`**
  - Add "Дрифт" tab showing Side-by-Side Diff against Golden baseline.
  - Add [Принять в базу] and [Откатить на свитче] buttons with safety confirmation.

- [ ] **Step 4: Verify test suite and production build**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

Run: `npm run build`
Expected: PASS with clean bundle output.

- [ ] **Step 5: Commit**

```bash
git add src/api.js src/components/SwitchCard.jsx src/components/ConfigBackupModal.jsx
git commit -m "feat(ui): add Drift Radar status badge, side-by-side diff view, and 2-way sync actions"
```
