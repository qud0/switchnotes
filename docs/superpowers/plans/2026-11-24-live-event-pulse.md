# Live Event Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real-time reactive event monitoring system with built-in UDP Syslog (514) & SNMP Trap (162) daemon, SNR-OS and MikroTik RouterOS message parsers, link flap detection, and WebSocket live push to SwitchBook UI.

**Architecture:** A background UDP listener service in Node.js capturing incoming Syslog (UDP 514/1514) and SNMP Traps (UDP 162/1162). Messages are parsed by vendor-specific regex engines, correlated with the switch database by IP/hostname, passed through a 60-second sliding-window flap detector and rate limiter, saved into `storage.addAlert()`, and broadcasted to browser clients via `/ws/events` WebSocket stream.

**Tech Stack:** Node.js (`dgram`, `net-snmp`, `ws`), Express, React 19, Lucide React, Tailwind CSS 4, Node.js Test Runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-24-live-event-pulse-design.md](file:///c:/devs/switchnotes/docs/superpowers/specs/2026-11-24-live-event-pulse-design.md)

## Global Constraints

- Target exclusively **SNR NAG** (SNR-OS) and **MikroTik RouterOS** (v6/v7).
- Fail-safe port binding: `EACCES` or `EADDRINUSE` on privileged ports (<1024) must fall back gracefully to 1514 / 1162 without halting the Node.js server.
- All regex parsers must have linear complexity $O(N)$ to completely prevent ReDoS.
- Memory safety: sliding-window flap history must purge events older than 60 seconds.
- Flood suppression: per-switch rate limiter (max 20 events/sec) to avoid freezing UI or blocking SQLite/JSON writes.
- Audio debouncing: audio alerts in browser play at most once every 3 seconds.

## Review Focus

1. **Unformatted MikroTik Syslog (`bsd-syslog=no`):** Messages arrive without `<PRI>` or standard RFC timestamp (e.g. `interface,info ether1 link down`). Parser must handle raw framing without dropping the packet.
2. **SNR Port Slot Notation (`1/0/X`):** SNR switches report `Interface GigabitEthernet1/0/12`. Parser must extract physical port number `12` reliably.
3. **Link Flapping Window:** If a port toggles UP/DOWN 3+ times in 60 seconds, it must trigger `critical_flapping` and clean up expired timestamps.
4. **WebSocket Upgrade Collisions:** Multiple services (`/ws/ssh` and `/ws/events`) share the same HTTP server. A central dispatcher must route upgrades cleanly based on URL pathname.
5. **Bursts / Flood Storms:** 100+ events per second during network loops must be clamped by the rate limiter and aggregated into a single flood alert.

---

### Task 1: Syslog & SNMP Trap Message Parsers & Flap Detector (`server/eventPulseParser.js`)

**Files:**
- Create: `server/eventPulseParser.js`
- Test: `test/eventPulseParser.test.js`

**Interfaces:**
- Consumes: Raw syslog buffer or string, remote IP
- Produces:
  - `parseSyslogMessage(rawMessage: string | Buffer, remoteIp: string) -> ParsedEvent | null`
  - `class LinkFlapDetector`:
    - `recordTransition(switchId: string, portNum: number, state: 'up' | 'down') -> { isFlapping: boolean, count: number }`
    - `clearExpired(maxAgeMs?: number) -> void`
  - `class EventRateLimiter`:
    - `checkLimit(key: string, limitPerSec?: number) -> { allowed: boolean, suppressedCount: number }`

- [ ] **Step 1: Write failing unit tests in `test/eventPulseParser.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSyslogMessage,
  LinkFlapDetector,
  EventRateLimiter
} from '../server/eventPulseParser.js';

test('parseSyslogMessage parses SNR-OS link down event', () => {
  const msg = '<187>2026-11-24T02:00:00: %LINK-3-UPDOWN: Interface GigabitEthernet1/0/5, changed state to down';
  const result = parseSyslogMessage(msg, '192.168.1.10');

  assert.ok(result);
  assert.equal(result.vendor, 'snr');
  assert.equal(result.type, 'link_down');
  assert.equal(result.portNum, 5);
  assert.equal(result.portName, 'GigabitEthernet1/0/5');
  assert.equal(result.severity, 'critical');
});

test('parseSyslogMessage parses SNR-OS link up event', () => {
  const msg = '%LINK-3-UPDOWN: Interface GigabitEthernet1/0/24, changed state to up';
  const result = parseSyslogMessage(msg, '192.168.1.10');

  assert.ok(result);
  assert.equal(result.vendor, 'snr');
  assert.equal(result.type, 'link_up');
  assert.equal(result.portNum, 24);
  assert.equal(result.severity, 'info');
});

test('parseSyslogMessage parses MikroTik raw link down event', () => {
  const msg = 'interface,info ether3 link down';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'link_down');
  assert.equal(result.portNum, 3);
  assert.equal(result.severity, 'critical');
});

test('parseSyslogMessage parses MikroTik STP topology change', () => {
  const msg = 'stp,info ether1 topology change';
  const result = parseSyslogMessage(msg, '192.168.88.1');

  assert.ok(result);
  assert.equal(result.vendor, 'mikrotik');
  assert.equal(result.type, 'stp_change');
  assert.equal(result.portNum, 1);
  assert.equal(result.severity, 'warning');
});

test('LinkFlapDetector detects flapping on 3+ transitions in 60s', () => {
  const detector = new LinkFlapDetector();
  const swId = 'sw-1';
  const port = 5;

  assert.equal(detector.recordTransition(swId, port, 'down').isFlapping, false);
  assert.equal(detector.recordTransition(swId, port, 'up').isFlapping, false);
  const third = detector.recordTransition(swId, port, 'down');
  assert.equal(third.isFlapping, true);
  assert.equal(third.count, 3);
});

test('EventRateLimiter suppresses excess events over limit', () => {
  const limiter = new EventRateLimiter();
  const key = '192.168.1.10';

  for (let i = 0; i < 20; i++) {
    assert.equal(limiter.checkLimit(key, 20).allowed, true);
  }
  const excess = limiter.checkLimit(key, 20);
  assert.equal(excess.allowed, false);
  assert.ok(excess.suppressedCount >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/eventPulseParser.test.js`
Expected: FAIL with "Cannot find module '../server/eventPulseParser.js'"

- [ ] **Step 3: Implement `server/eventPulseParser.js`**

Implement regex matching for SNR and MikroTik patterns, `LinkFlapDetector` with sliding window cleanup, and `EventRateLimiter`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/eventPulseParser.test.js`
Expected: PASS all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/eventPulseParser.js test/eventPulseParser.test.js
git commit -m "feat(events): add Syslog/Trap parsers, link flap detector, and rate limiter"
```

---

### Task 2: Backend Daemon Service (`server/eventPulseDaemon.js`)

**Files:**
- Create: `server/eventPulseDaemon.js`
- Test: `test/eventPulseDaemon.test.js`

**Interfaces:**
- Consumes: `dgram`, `net-snmp`, `storage`, `eventPulseParser`
- Produces:
  - `class EventPulseDaemon`:
    - `init(httpServer, storage, options?: { syslogPort, trapPort }) -> Promise<void>`
    - `stop() -> Promise<void>`
    - `broadcastEvent(event: object) -> void`
    - `simulateEvent({ switchId, portNum, type, message }) -> object`
    - `getStatus() -> object`

- [ ] **Step 1: Write unit tests in `test/eventPulseDaemon.test.js`**

Test simulated event pipeline, switch IP resolution, storage alert creation, and status payload.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/eventPulseDaemon.test.js`
Expected: FAIL with "Cannot find module '../server/eventPulseDaemon.js'"

- [ ] **Step 3: Implement `server/eventPulseDaemon.js`**

Implement:
- UDP Syslog listener on port 514 (with fallback to 1514).
- Trap receiver on port 162 (with fallback to 1162).
- Matching remote IP with `storage.getSwitches()`.
- Alerts logging in `storage.addAlert()`.
- Simulation method `simulateEvent`.
- Status reporting `getStatus`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/eventPulseDaemon.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add server/eventPulseDaemon.js test/eventPulseDaemon.test.js
git commit -m "feat(events): add eventPulseDaemon background UDP service and simulation API"
```

---

### Task 3: Server Integration & Centralized WebSocket Router (`server/index.js`)

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `eventPulseDaemon`
- Produces:
  - Centralized `httpServer.on('upgrade')` dispatching `/ws/ssh` and `/ws/events`.
  - REST endpoints:
    - `GET /api/events/status`
    - `POST /api/events/simulate`

- [ ] **Step 1: Wire `eventPulseDaemon` in `server/index.js`**
  - Import `eventPulseDaemon` from `./eventPulseDaemon.js`.
  - Initialize after server startup: `eventPulseDaemon.init(httpServer, storage)`.
  - Route `/ws/events` in upgrade listener with RBAC token verification.
  - Implement `GET /api/events/status` and `POST /api/events/simulate`.

- [ ] **Step 2: Run backend test suite**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(server): integrate eventPulseDaemon and centralize WebSocket upgrade router"
```

---

### Task 4: Client Real-Time Hook & Alerts Modal UI

**Files:**
- Create: `src/hooks/useEventPulse.js`
- Modify: `src/components/AlertsModal.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `/ws/events`, `api`, `useToast`
- Produces:
  - Real-time alerts synchronization without full page reload.
  - Audio alert debouncing (max once per 3s).
  - Live Syslog / Trap monitor tab with simulation button in `AlertsModal.jsx`.

- [ ] **Step 1: Implement `src/hooks/useEventPulse.js`**
  - WebSocket client connecting to `/ws/events?token=...`.
  - Auto-reconnect with exponential backoff & jitter.
  - Dispatch incoming events to callback and sound debouncer.

- [ ] **Step 2: Integrate `useEventPulse` in `src/App.jsx`**
  - Replace static dummy alerts with live `networkAlerts` fetched from `/api/monitoring/alerts`.
  - Wire live stream: incoming events prepend to `networkAlerts`.

- [ ] **Step 3: Enhance `src/components/AlertsModal.jsx`**
  - Add "Живой Syslog / Trap монитор" view.
  - Show daemon listening status (ports, packets received).
  - Add "⚡ Протестировать событие (Симуляция)" button.

- [ ] **Step 4: Verify test suite and production build**

Run: `node --test test/*.test.js`
Expected: PASS all tests.

Run: `npm run build`
Expected: PASS with 0 build errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEventPulse.js src/components/AlertsModal.jsx src/App.jsx
git commit -m "feat(ui): add useEventPulse real-time hook, live alerts feed, and event simulator"
```
