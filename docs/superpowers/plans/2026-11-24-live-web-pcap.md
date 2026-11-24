# Live Web-PCAP & Dockable Diagnostics Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an in-browser live packet analyzer (Wireshark-in-Browser) with a dockable bottom workspace console beneath the switch faceplate, real-time packet stream, Wireshark color coding, protocol dissection tree, Hex/ASCII dump, binary `.pcap` export, and an L1–L3 X-Ray Tracer tab.

**Architecture:** A backend `packetCaptureService.js` that captures packets via SSH/RouterOS or generates realistic traffic for lab ports, stores a circular packet buffer, encodes standard Libpcap 2.4 binary streams, and broadcasts live packets via WebSocket (`/ws/pcap`). A frontend `DockableConsole.jsx` component embedded under `SwitchFaceplate.jsx` providing Live PCAP and L1-L3 X-Ray Circuit tracing.

**Tech Stack:** Node.js, Express, WebSocket (`ws`), React 19, Lucide React, Tailwind CSS 4, Node.js Test Runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-24-live-web-pcap-design.md](file:///c:/devs/switchnotes/docs/superpowers/specs/2026-11-24-live-web-pcap-design.md)

## Global Constraints

- Target SNR NAG, MikroTik RouterOS, and Ubiquiti UniFi.
- Binary PCAP format must strictly follow Libpcap 2.4 specification (magic `0xa1b2c3d4`, snaplen 65535, linktype 1 `LINKTYPE_ETHERNET`) so standard desktop Wireshark opens generated files with zero errors.
- Ring buffer in memory capped at 2,000 packets per session to guarantee $O(1)$ memory usage.
- Dockable console must be collapsible, resizable, and non-modal to solve the "Modal Hell" problem.
- Filter syntax must support case-insensitive protocol matching (`arp`, `dhcp`, `dns`, `tcp`, `udp`, `icmp`), IP address filtering, and VLAN filtering.

## Review Focus

1. **PCAP Binary Alignment:** Proper little-endian 32-bit integer serialization of timestamp seconds, microseconds, captured length, and original wire length.
2. **WebSocket Upgrade Safety:** Clean dispatching of `/ws/pcap` alongside existing `/ws/ssh` and `/ws/events` on the same HTTP server.
3. **High-Frequency Packet Flooding:** Client-side batching/throttling to keep UI smooth at 60 FPS even when 50+ packets/sec arrive.
4. **VLAN Tag Dissection:** Parsing 802.1Q tagged Ethernet frames (TPID `0x8100`) with correct extraction of VLAN ID and inner EtherType.
5. **Circuit X-Ray Fallback:** Graceful handling when patch panel or server records have missing cross-connect data.

---

### Task 1: Libpcap 2.4 Binary Generator & Synthetic Packet Engine (`server/packetCaptureService.js`)

**Files:**
- Create: `server/packetCaptureService.js`
- Test: `test/packetCaptureService.test.js`

**Interfaces:**
- `buildGlobalPcapHeader() -> Buffer` (24 bytes)
- `buildPacketRecord(packet: Object) -> Buffer` (16 bytes header + raw payload)
- `buildFullPcapBuffer(packets: Array<Object>) -> Buffer`
- `generateSyntheticPacket(portInfo: Object, seq: number) -> Object`
- `class PacketCaptureManager`:
  - `startSession(switchId: string, portId: string, options: Object) -> Session`
  - `stopSession(sessionId: string) -> boolean`
  - `getSession(sessionId: string) -> Session | null`
  - `getPcapDownloadBuffer(sessionId: string) -> Buffer`

- [ ] **Step 1: Write failing unit tests in `test/packetCaptureService.test.js`**
- [ ] **Step 2: Implement Libpcap binary generator and synthetic frame builder in `server/packetCaptureService.js`**
- [ ] **Step 3: Run `node --test test/packetCaptureService.test.js` to ensure tests pass**
- [ ] **Step 4: Commit changes**

---

### Task 2: REST & WebSocket Endpoints for PCAP (`server/index.js`)

**Files:**
- Modify: `server/index.js`
- Test: `test/pcapApi.test.js`

**Interfaces:**
- `GET /api/pcap/sessions/:sessionId/status`
- `POST /api/pcap/switches/:switchId/ports/:portId/start`
- `POST /api/pcap/sessions/:sessionId/stop`
- `GET /api/pcap/sessions/:sessionId/download` (Streams binary `.pcap`)
- WebSocket endpoint: `/ws/pcap?sessionId=...`

- [ ] **Step 1: Write failing integration tests in `test/pcapApi.test.js`**
- [ ] **Step 2: Register PCAP routes and WebSocket upgrade handling in `server/index.js`**
- [ ] **Step 3: Run `node --test test/pcapApi.test.js` and verify binary download headers**
- [ ] **Step 4: Commit changes**

---

### Task 3: Circuit X-Ray Tracer Backend Service (`server/circuitTracerService.js`)

**Files:**
- Create: `server/circuitTracerService.js`
- Modify: `server/index.js`
- Test: `test/circuitTracerService.test.js`

**Interfaces:**
- `tracePortCircuit(storage: Object, switchId: string, portId: string) -> CircuitTraceResult`:
  - `device`: `{ type, name, ip, mac, vlan }`
  - `socket`: `{ id, room, cableLength, cableType }`
  - `patchPanel`: `{ panelId, panelName, portNum, linkTo }`
  - `accessSwitch`: `{ switchId, name, portNum, portName, mode, vlan, linkStatus, speed }`
  - `uplink`: `{ trunkPort, vlans, remoteSwitchId, remotePort }`
  - `gateway`: `{ ip, vlanId, reachable }`
  - `anomalies`: `Array<{ type: string, severity: 'warning' | 'error', message: string, fixAction?: string }>`

- [ ] **Step 1: Write failing tests in `test/circuitTracerService.test.js`**
- [ ] **Step 2: Implement `circuitTracerService.js` and endpoint `GET /api/circuit-trace/switches/:switchId/ports/:portId`**
- [ ] **Step 3: Verify tests pass**
- [ ] **Step 4: Commit changes**

---

### Task 4: Frontend Dockable Console & Live Web-PCAP Component (`src/components/DockableConsole.jsx`)

**Files:**
- Create: `src/components/DockableConsole.jsx`
- Create: `src/components/LiveWebPcap.jsx`
- Create: `src/components/CircuitXRayTab.jsx`
- Modify: `src/components/SwitchFaceplate.jsx`
- Modify: `src/api.js`

**Features:**
- Collapsible bottom workspace console with tabs:
  - `[Live Web-PCAP]`
  - `[L1–L3 X-Ray Трассировщик]`
- In Live Web-PCAP:
  - Start / Pause / Clear buttons
  - Filter input (`arp`, `dhcp`, `dns`, `tcp`, `vlan==...`)
  - Real-time packet table with Wireshark standard colors
  - Packet details tree (Frame -> Ethernet II -> IPv4 -> TCP/UDP -> Info)
  - Raw Hex / ASCII byte viewer
  - "Скачать .PCAP" button triggering direct binary download
- In Circuit X-Ray Tab:
  - Visual 5-point breadcrumb chain with status badges and instant anomaly callouts.

- [ ] **Step 1: Implement API methods in `src/api.js`**
- [ ] **Step 2: Build `LiveWebPcap.jsx` with filters, virtual table, dissection tree, and hex dump**
- [ ] **Step 3: Build `CircuitXRayTab.jsx` for L1-L3 path diagnostics**
- [ ] **Step 4: Build `DockableConsole.jsx` and integrate directly beneath `SwitchFaceplate.jsx`**
- [ ] **Step 5: Verify in browser and test suite**

---

### Task 5: End-to-End Verification, Test Suite & Production Build

- [ ] **Step 1: Run complete test suite (`node --test test/*.test.js`)**
- [ ] **Step 2: Run production build (`npm run build`)**
- [ ] **Step 3: Verify dev server and user workflows**
