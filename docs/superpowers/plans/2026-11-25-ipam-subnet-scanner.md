# IPAM Subnet Live Scanner & Drift Audit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real-time subnet scanner and drift audit hub in SwitchBook that performs fast parallel ICMP ping sweeps, resolves MAC via ARP, reverse DNS and OUI vendors, detects IPAM drift (MATCHED, NEW_ROGUE, ZOMBIE, CONFLICT), and provides 1-click batch import and zombie cleanup.

**Architecture:** Node.js backend scanner service using sliding worker pools and `child_process.execFile('ping')` with `AbortSignal` cancellation; cross-platform ARP cache parsing (`/proc/net/arp` and `arp -a`); reverse DNS; safe simulation mode for testing; atomic batch methods in `server/storage.js` with `crypto.randomUUID()`; REST API in `server/index.js`; interactive React modal `IpamScannerModal.jsx` integrated into `IpamView.jsx` and `CommandPalette.jsx`.

**Tech Stack:** Node.js (Express, `child_process`, `dns.promises`, `crypto`), React 18, Tailwind CSS, Lucide icons, Node native test runner (`node --test`).

**Spec:** [file:///C:/Users/qu/.gemini/antigravity/brain/0ba204b6-41ac-4796-ad9f-7b087f3aedad/ipam_subnet_scanner_design.md](file:///C:/Users/qu/.gemini/antigravity/brain/0ba204b6-41ac-4796-ad9f-7b087f3aedad/ipam_subnet_scanner_design.md)

## Global Constraints
- Maximum subnet size allowed: `/23` (up to 510 usable hosts). Ranges `/16`, `/8` or invalid CIDRs must be rejected with HTTP 400.
- Cross-platform ping: Use `execFile('ping', ...)` without a shell. Windows `-n 1 -w <ms>`, Linux `-c 1 -W <sec>`.
- AbortSignal support: Server must abort all active pings and queues when client disconnects or clicks stop.
- Primary key safety: Use `crypto.randomUUID()` in `server/storage.js` to eliminate timestamp collisions.
- Zero external npm dependencies: use standard Node.js APIs and existing packages.

## Review Focus
1. CIDR calculation with non-zero host bits (e.g. `192.168.10.128/25` correctly scans `.129`–`.254`).
2. Russian Windows OEM CP866 ping output and sub-millisecond `<1мс` parsing.
3. False conflict prevention when IPAM record has no MAC (e.g. AD-synced host classified as `MATCHED` with `canEnrichMac`).
4. Windows ARP freeze mitigation using a hard process timeout on `execFile`.
5. Safe deletion in `batchReleaseIpAllocations` so that IPAM grid and utilization stats immediately reflect freed IPs.

---

### Task 1: OUI Database Expansion & Storage Atomic Batch Operations

**Files:**
- Modify: `server/constants/oui.js`
- Modify: `server/storage.js`
- Test: `test/ipamScanner.test.js`

- [ ] **Step 1.1: Write unit tests for OUI lookup and storage batch operations**
  Create `test/ipamScanner.test.js` covering:
  - OUI lookup for Cisco, MikroTik, Ubiquiti, Realtek, Apple, Supermicro, Proxmox.
  - `storage.batchImportIpAllocations` with unique UUIDs, MAC normalization, and duplicate skipping/updating.
  - `storage.batchReleaseIpAllocations` properly removing allocations and logging audit event.
- [ ] **Step 1.2: Run tests and verify failure**
  Run: `node --test test/ipamScanner.test.js`
- [ ] **Step 1.3: Expand `server/constants/oui.js`**
  Add OUI prefixes for Realtek (`52:54:00`, `00:E0:4C`), Apple (`AC:DE:48`, `F0:18:98`), Supermicro (`00:25:90`, `00:30:48`), Proxmox/QEMU (`BC:24:11`).
- [ ] **Step 1.4: Implement batch methods and UUID in `server/storage.js`**
  - Replace `Date.now()` random string in `createIpAllocation` with `crypto.randomUUID()`.
  - Add `batchImportIpAllocations(items, options)`: validates IPs, normalizes MACs (`AA:BB:CC:DD:EE:FF`), assigns `crypto.randomUUID()`, logs audit action, calls `this.save()`.
  - Add `batchReleaseIpAllocations(ids, options)`: filters out IDs, logs audit action, calls `this.save()`.
- [ ] **Step 1.5: Run tests and verify passing**
  Run: `node --test test/ipamScanner.test.js`

---

### Task 2: Core Subnet Scanner & Drift Audit Engine (`server/ipamScannerService.js`)

**Files:**
- Create: `server/ipamScannerService.js`
- Test: `test/ipamScanner.test.js`

- [ ] **Step 2.1: Write unit tests for `ipamScannerService`**
  Add tests in `test/ipamScanner.test.js` for:
  - `parseSubnetRange(cidr)` with boundary checks, bitwise math, and /23 to /30 limits.
  - Parsing ping output (English, Russian CP866 `время=2мс`, `<1мс`, and timeouts).
  - ARP table parsing and MAC normalization.
  - 4-way drift classification: `MATCHED`, `NEW_ROGUE`, `ZOMBIE`, `CONFLICT`.
  - Safe simulation mode generating deterministic mock results.
- [ ] **Step 2.2: Run tests and verify failure**
  Run: `node --test test/ipamScanner.test.js`
- [ ] **Step 2.3: Implement `server/ipamScannerService.js`**
  - Export class `IpamScannerService` accepting `(storage)` via constructor.
  - Implement `parseSubnetRange(cidr)` returning `{ network, firstUsable, lastUsable, totalUsable, ipList }`.
  - Implement `pingHost(ip, options, signal)` using `execFile('ping', ...)`, Windows/Linux args, CP866/UTF-8 parsing, and hard timeout.
  - Implement `getArpTable()` (Linux `/proc/net/arp` / `arp -n`, Windows `arp -a`).
  - Implement `resolveReverseDns(ip, signal)` with 600ms timeout.
  - Implement `scanSubnet({ subnet, vlanId, simulate, concurrency, timeoutMs }, signal)`.
  - Implement 4-way drift classifier comparing live results with `storage.getIpAllocations()`.
- [ ] **Step 2.4: Run tests and verify passing**
  Run: `node --test test/ipamScanner.test.js`

---

### Task 3: Backend REST API Endpoints & Abort Wiring (`server/index.js`)

**Files:**
- Modify: `server/index.js`
- Test: `test/ipamScanner.test.js`

- [ ] **Step 3.1: Write integration tests for API endpoints**
  Add tests for `POST /api/ipam/scan`, `POST /api/ipam/scan/batch-import`, and `POST /api/ipam/scan/batch-release`.
- [ ] **Step 3.2: Run tests and verify failure**
  Run: `node --test test/ipamScanner.test.js`
- [ ] **Step 3.3: Implement endpoints in `server/index.js`**
  - Wire `ipamScannerService` instance.
  - `POST /api/ipam/scan` (`requireRole('engineer')`): validate CIDR, hook `req.on('close')` to `AbortController`, call `scanSubnet`, return results.
  - `POST /api/ipam/scan/batch-import` (`requireRole('engineer')`): call `storage.batchImportIpAllocations(req.body.items, req.body.options)`.
  - `POST /api/ipam/scan/batch-release` (`requireRole('admin')`): call `storage.batchReleaseIpAllocations(req.body.ids, req.body.options)`.
- [ ] **Step 3.4: Run full test suite and verify passing**
  Run: `node --test test/ipamScanner.test.js`

---

### Task 4: Frontend API Client & `IpamScannerModal.jsx`

**Files:**
- Modify: `src/api.js`
- Create: `src/components/IpamScannerModal.jsx`

- [ ] **Step 4.1: Add API client methods in `src/api.js`**
  Add `scanSubnet(params, signal)`, `batchImportDiscoveredHosts(items, options)`, `batchReleaseZombieIps(ids, options)`.
- [ ] **Step 4.2: Implement `src/components/IpamScannerModal.jsx`**
  - Subnet selector, concurrency, timeout settings, and simulation toggle.
  - Start / Stop button with live animated scanning spinner.
  - 5 KPI summary badges: Всего хостов, Онлайн, Новые (Rogue), Зомби в IPAM, Конфликты.
  - Interactive table:
    - Multiselect checkboxes for batch operations.
    - Badges for drift status (`MATCHED`, `NEW_ROGUE`, `ZOMBIE`, `CONFLICT`).
    - Columns: IP, RTT, MAC, Вендор OUI, DNS Hostname, IPAM статус.
    - Filter pills (Все, Новые, Зомби, Конфликты).
  - Batch action bar:
    - Button: "Импортировать выбранные в IPAM" (with device type dropdown: Workstation, Server, IoT, Switch, etc.).
    - Button: "Освободить выбранные зомби".
    - Button: "Экспорт в CSV".
  - Clean Dark and Light mode Tailwind styling.

---

### Task 5: View Integration (`IpamView.jsx`, `CommandPalette.jsx`, `App.jsx`)

**Files:**
- Modify: `src/components/IpamView.jsx`
- Modify: `src/components/CommandPalette.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 5.1: Add "Сканер подсети" button to `src/components/IpamView.jsx`**
  - Add button in toolbar with `Radar` or `Scan` icon.
  - Wire `onOpenSubnetScanner(currentSubnet, currentVlanId)`.
- [ ] **Step 5.2: Add command to `src/components/CommandPalette.jsx`**
  - Add item: "Сетевой сканер подсетей IPAM (ICMP & ARP опрос)" triggering the scanner.
- [ ] **Step 5.3: Wire state and lazy modal in `src/App.jsx`**
  - Lazy load `IpamScannerModal`.
  - Add state `isIpamScannerModalOpen` and `scannerSubnetContext`.
  - Render `IpamScannerModal` with reload trigger `fetchIpAllocations` on successful batch import/release.
- [ ] **Step 5.4: Test production build**
  Run: `npm run build` to verify clean bundle compilation.

---

### Task 6: Verification, Browser QA & Final Commit

- [ ] **Step 6.1: Run all unit and integration tests**
  Run: `node --test` across the entire codebase.
- [ ] **Step 6.2: Launch dev server and run browser subagent QA**
  - Open `http://localhost:5173/`
  - Navigate to IPAM view.
  - Click "Сканер подсети".
  - Run scan in simulation mode and verify table rendering, KPI cards, and batch actions.
  - Take screenshot evidence.
- [ ] **Step 6.3: Commit and push changes**
  Commit with message `feat(ipam): implement IPAM Subnet Live Scanner and Drift Audit Hub` and push to master.
