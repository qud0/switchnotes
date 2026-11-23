# Zero-Touch WebConsole Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a client-side in-browser USB/COM serial console with Zero-Touch Provisioning (ZTP) macros for SNR and MikroTik switches using the Web Serial API and xterm.js.

**Architecture:** A pure browser-side Web Serial API integration (`navigator.serial`) piping bidirectional text streams to an interactive `@xterm/xterm` canvas. Includes a throttled line-by-line configuration streamer with visual preview and pre-built ZTP templates for SNR-OS and MikroTik RouterOS v6/v7, integrated with SwitchBook inventory.

**Tech Stack:** React 19, `@xterm/xterm` (v6.0.0), `@xterm/addon-fit` (v0.11.0), Web Serial API (`navigator.serial`), Tailwind CSS 4, Node.js Test Runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-23-zero-touch-webconsole-design.md](file:///c:/devs/switchnotes/docs/superpowers/specs/2026-11-23-zero-touch-webconsole-design.md)

## Global Constraints

- Exclusively target **SNR NAG** (SNR-OS) and **MikroTik RouterOS** (v6/v7) — no Cisco dependencies or templates.
- Pure client-side execution — zero server-side C++ serial dependencies or proxy overhead.
- Safe resource management — port streams must be unlocked via `AbortController` and reader cancellation on modal close.
- Web Serial requires a secure context (`window.isSecureContext` or `localhost`). Unsecured HTTP access must render a clear informative banner rather than failing silently.

## Review Focus

1. **Insecure Context (HTTP on remote IP):** User opens SwitchBook at `http://IP:3050` where `navigator.serial` is undefined. Interface must display a clear, non-blocking warning explaining why and how to access (localhost or HTTPS).
2. **Buffer Overrun on UART:** Committing 100+ lines at once can overflow switch UART FIFO buffers. Throttled streamer must pace output line-by-line with 50-80ms delay.
3. **Port Locking in Windows:** If user closes the modal while the port stream is active, Windows COM port remains locked (`The port is already open`). Component must gracefully close streams and release port locks on unmount.
4. **Line-Ending Differences:** SNR expects `\r\n` or `\r`, while RouterOS accepts `\r\n`. Streamer must normalize line endings to `\r\n`.
5. **Partial / Interrupted Provisioning:** If engineer cancels streaming mid-way, transmission must abort immediately without hanging the terminal.

---

### Task 1: ZTP Template Engine & Presets (`src/utils/ztpTemplates.js`)

**Files:**
- Create: `src/utils/ztpTemplates.js`
- Test: `test/ztpTemplates.test.js`

**Interfaces:**
- Consumes: None (pure utility)
- Produces:
  - `cidrToNetmask(cidr: number | string) -> string`
  - `netmaskToCidr(netmask: string) -> number`
  - `VENDOR_PRESETS: { snr: object, mikrotik: object }`
  - `generateZtpConfig({ vendor, hostname, ip, mask, gateway, adminUser, adminPassword, vlanId }) -> string`

- [ ] **Step 1: Write failing unit tests in `test/ztpTemplates.test.js`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cidrToNetmask,
  netmaskToCidr,
  generateZtpConfig,
  VENDOR_PRESETS
} from '../src/utils/ztpTemplates.js';

test('cidrToNetmask converts prefix length to dotted decimal', () => {
  assert.equal(cidrToNetmask(24), '255.255.255.0');
  assert.equal(cidrToNetmask('16'), '255.255.0.0');
  assert.equal(cidrToNetmask(30), '255.255.255.252');
});

test('netmaskToCidr converts dotted decimal to prefix length', () => {
  assert.equal(netmaskToCidr('255.255.255.0'), 24);
  assert.equal(netmaskToCidr('255.255.0.0'), 16);
  assert.equal(netmaskToCidr('255.255.255.252'), 30);
});

test('generateZtpConfig produces valid SNR-OS configuration', () => {
  const config = generateZtpConfig({
    vendor: 'snr',
    hostname: 'SW-CORE-01',
    ip: '192.168.1.10',
    mask: '255.255.255.0',
    gateway: '192.168.1.1',
    adminUser: 'admin',
    adminPassword: 'SecretPassword123',
    vlanId: 1
  });

  assert.match(config, /hostname SW-CORE-01/);
  assert.match(config, /interface Vlan1/);
  assert.match(config, /ip address 192\.168\.1\.10 255\.255\.255\.0/);
  assert.match(config, /ip default-gateway 192\.168\.1\.1/);
  assert.match(config, /username admin/);
  assert.match(config, /ssh server enable/);
});

test('generateZtpConfig produces valid MikroTik RouterOS configuration', () => {
  const config = generateZtpConfig({
    vendor: 'mikrotik',
    hostname: 'MT-CORE-01',
    ip: '192.168.88.2',
    mask: '255.255.255.0',
    gateway: '192.168.88.1',
    adminUser: 'admin',
    adminPassword: 'SecretPassword123'
  });

  assert.match(config, /\/system identity set name="MT-CORE-01"/);
  assert.match(config, /\/ip address add address=192\.168\.88\.2\/24/);
  assert.match(config, /\/ip route add dst-address=0\.0\.0\.0\/0 gateway=192\.168\.88\.1/);
  assert.match(config, /\/ip service enable numbers=ssh/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ztpTemplates.test.js`
Expected: FAIL with "Cannot find module '../src/utils/ztpTemplates.js'"

- [ ] **Step 3: Implement `src/utils/ztpTemplates.js`**

Implement `cidrToNetmask`, `netmaskToCidr`, `VENDOR_PRESETS` (defaults for baud rates and options: SNR=9600, MikroTik=115200), and `generateZtpConfig` formatting commands cleanly.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ztpTemplates.test.js`
Expected: PASS all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/ztpTemplates.js test/ztpTemplates.test.js
git commit -m "feat(ztp): add configuration template engine and vendor presets for SNR and MikroTik"
```

---

### Task 2: WebSerial Stream Controller & Manager (`src/utils/webSerialManager.js`)

**Files:**
- Create: `src/utils/webSerialManager.js`
- Test: `test/webSerialManager.test.js`

**Interfaces:**
- Consumes: Web Serial API (`navigator.serial`)
- Produces:
  - `isWebSerialSupported() -> boolean`
  - `isSecureContextCheck() -> boolean`
  - `class WebSerialSession`:
    - `connect(options: { baudRate, dataBits, stopBits, parity, flowControl }) -> Promise<void>`
    - `disconnect() -> Promise<void>`
    - `write(data: string) -> Promise<void>`
    - `sendBreak(durationMs?: number) -> Promise<void>`
    - `streamConfig({ commands, lineDelayMs, onProgress, onStatus, signal }) -> Promise<{ total: number, sent: number, aborted: boolean }>`
    - `onData(callback: (data: string) => void) -> () => void`
    - `getSessionLog() -> string`
    - `clearSessionLog() -> void`

- [ ] **Step 1: Write unit tests in `test/webSerialManager.test.js` with WebSerial mock**

Test `isWebSerialSupported`, `isSecureContextCheck`, buffer logging, and `streamConfig` line pacing and cancellation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/webSerialManager.test.js`
Expected: FAIL with "Cannot find module '../src/utils/webSerialManager.js'"

- [ ] **Step 3: Implement `src/utils/webSerialManager.js`**

Implement `WebSerialSession` handling:
- Text streaming with `TextDecoderStream` / `TextEncoderStream`.
- Cancellation safe cleanup: cancel reader, close streams, close port.
- Send Break (250ms) using `port.setSignals({ break: true })` then `setSignals({ break: false })`.
- Throttled line streamer respecting `AbortSignal`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/webSerialManager.test.js`
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/webSerialManager.js test/webSerialManager.test.js
git commit -m "feat(webserial): add WebSerialSession stream manager and throttled streamer"
```

---

### Task 3: Interactive `WebSerialModal.jsx` Component

**Files:**
- Create: `src/components/WebSerialModal.jsx`

**Interfaces:**
- Consumes:
  - `WebSerialSession`, `isWebSerialSupported`, `isSecureContextCheck` from `../utils/webSerialManager`
  - `generateZtpConfig`, `VENDOR_PRESETS`, `cidrToNetmask`, `netmaskToCidr` from `../utils/ztpTemplates`
  - `@xterm/xterm`, `@xterm/addon-fit`
  - `api` from `../api`
  - `useToast` from `../context/ToastContext`
- Produces:
  - `<WebSerialModal isOpen={boolean} onClose={function} initialSwitch={object} switches={array} />`

- [ ] **Step 1: Implement modal layout & terminal mount**
  - Full-screen or large centered modal dialog with dark header and toolbar.
  - Initialize `Terminal` from `@xterm/xterm` and `FitAddon` inside `useRef(null)`.
  - Wire terminal keystrokes to `session.write()` and incoming data to `term.write()`.
  - Handle window resize events calling `fitAddon.fit()`.

- [ ] **Step 2: Implement serial connection control bar**
  - Baud rate selector: 9600 (SNR default), 115200 (MikroTik default), 57600, 38400, 19200.
  - Connect / Disconnect button with active state indicator (Green dot when connected, Red when disconnected).
  - "Send Break" button (triggers 250ms hardware break signal for bootloader access).
  - Action buttons: Clear Terminal, Copy All Text, Download Log (`.txt`).

- [ ] **Step 3: Implement ZTP Provisioning Drawer & Config Generator**
  - Toggle button: "⚡ Быстрая настройка (ZTP)".
  - Vendor toggle: **SNR NAG (SNR-OS)** | **MikroTik RouterOS**.
  - Dropdown to select existing switch from inventory (auto-fills IP, hostname, netmask, gateway).
  - Form fields: Hostname, Management IP, Subnet / Mask, Default Gateway, Admin Username, Password.
  - "Предпросмотр" button: opens a preview textarea allowing the engineer to inspect or adjust commands before injection.

- [ ] **Step 4: Implement Throttled Injection & Progress Bar**
  - "Залить конфигурацию" button sends commands line by line with configurable delay (default 60ms).
  - Visual progress bar showing `Sent X of Y lines`.
  - "Остановить" (Cancel) button to abort transmission immediately if needed.
  - "Добавить в SwitchBook" button to register newly configured switch in inventory database.

- [ ] **Step 5: Add Browser Compatibility & Security Warning**
  - If `!isWebSerialSupported()` or insecure context, display prominent banner with clear instructions (use Chrome/Edge, access via localhost, or setup HTTPS).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build finishes with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/WebSerialModal.jsx
git commit -m "feat(ui): add WebSerialModal with xterm.js terminal and SNR/MikroTik ZTP bar"
```

---

### Task 4: UI Integration in Header, Tools, and Switch Cards

**Files:**
- Modify: `src/components/Header.jsx`
- Modify: `src/components/NetworkToolsView.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `WebSerialModal`
- Produces: Launch points across the application.

- [ ] **Step 1: Wire global state in `src/App.jsx`**
  - Add `const [isWebSerialOpen, setIsWebSerialOpen] = useState(false);`
  - Add `const [webSerialSwitch, setWebSerialSwitch] = useState(null);`
  - Add lazy import: `const WebSerialModal = lazy(() => import('./components/WebSerialModal'));`
  - Render `<WebSerialModal isOpen={isWebSerialOpen} onClose={() => setIsWebSerialOpen(false)} initialSwitch={webSerialSwitch} switches={switches} />`.
  - Pass `onOpenWebSerial={(sw) => { setWebSerialSwitch(sw); setIsWebSerialOpen(true); }}` to `Header` and `NetworkToolsView`.

- [ ] **Step 2: Add launch button in `src/components/Header.jsx`**
  - Add "🔌 Консоль USB" action button in Tools menu and header quick actions.

- [ ] **Step 3: Add WebSerial card in `src/components/NetworkToolsView.jsx`**
  - Add dedicated tool card "WebSerial Консоль (USB/COM)" in the Network Tools dashboard with "Открыть консоль" button.

- [ ] **Step 4: Verify test suite and production build**

Run: `node --test`
Expected: PASS all tests.

Run: `npm run build`
Expected: PASS with clean bundle output.

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.jsx src/components/NetworkToolsView.jsx src/App.jsx
git commit -m "feat(ui): integrate WebSerial console launcher in Header and Network Tools"
```
