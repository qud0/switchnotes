# Network Lab Simulator (L2/L3 Training Sandbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive educational Network Sandbox & Simulator (`src/components/NetworkLabView.jsx` and `src/utils/networkSimulatorEngine.js`) inside SwitchBook. Allows junior engineers to build topologies with switches, routers, servers, and PCs, configure L2/L3 parameters (Access/Trunk ports, VLANs, IPs, Subnet masks, Default Gateways), execute an animated visual packet tracer (Ping) with hop-by-hop diagnostics, and solve 4 pre-built training labs with automatic solution verification.

**Architecture:**
- **Core Simulator Engine (`src/utils/networkSimulatorEngine.js`):** Pure ES6 module with node/link models, packet traversal simulation, L2 Access/Trunk VLAN tags validation, L3 inter-VLAN routing and gateway check, Spanning Tree loop check, and 4 pre-configured training labs. 100% testable in `test/networkSimulatorEngine.test.js`.
- **Interactive UI Canvas (`src/components/NetworkLabView.jsx`):** Drag-and-drop workspace with SVG cable rendering, node positioning, device inspector drawer, live packet tracer animation with glowing envelopes/dots, step explanations, and training lab objective HUD with "Проверить решение" button.
- **Application Integration:** Navigation tab in `src/components/Header.jsx` ("Лаборатория сети") and route handling in `src/App.jsx`.

**Tech Stack:** React 19, Lucide React, Tailwind CSS 4, Node.js Test Runner (`node --test`), ES6 Modules.

---

### Task 1: Network Simulator Core Engine & Presets (`src/utils/networkSimulatorEngine.js`)

**Files:**
- Create: `src/utils/networkSimulatorEngine.js`
- Test: `test/networkSimulatorEngine.test.js`

**Interfaces:**
- Functions to export:
  - `isSameSubnet(ipA, ipB, mask) -> boolean`
  - `createLabNode({ type, name, x, y, ...customProps }) -> LabNode`
  - `createLabLink({ sourceNodeId, sourcePortId, targetNodeId, targetPortId, speed }) -> LabLink`
  - `simulatePing({ sourceNodeId, targetIp, nodes, links }) -> PingSimulationResult`
    - Returns:
      - `success: boolean`
      - `status: string` (e.g. `SUCCESS`, `ERR_NO_IP`, `ERR_NO_GATEWAY`, `ERR_VLAN_BLOCKED`, `ERR_NO_INTER_VLAN_ROUTER`, `ERR_HOST_UNREACHABLE`)
      - `hops: Array<{ fromNodeId, toNodeId, fromPort, toPort, vlan, type, description, status, errorReason }>`
      - `summary: string`
  - `PRESET_LABS: Array<LabScenario>` (4 pre-configured training scenarios:
    1. "Основы L2: Связь двух ПК в одном VLAN"
    2. "Магистральный порт: Настройка Trunk между коммутаторами"
    3. "Маршрутизация Inter-VLAN: Связь через L3-маршрутизатор"
    4. "Защита от петель: Spanning Tree Protocol")
  - `verifyLabSolution(labId, { nodes, links }) -> { solved: boolean, feedback: string, checks: Array<{ label, pass }> }`

- [ ] **Step 1: Write unit tests in `test/networkSimulatorEngine.test.js`**
- [ ] **Step 2: Implement `src/utils/networkSimulatorEngine.js`**
- [ ] **Step 3: Run `node --test test/networkSimulatorEngine.test.js` and ensure all tests pass**

---

### Task 2: Interactive Network Lab Component (`src/components/NetworkLabView.jsx`)

**Files:**
- Create: `src/components/NetworkLabView.jsx`

**Key Features:**
- **Top Action Toolbar:**
  - Node Palette: `+ Компьютер (ПК)`, `+ Сервер`, `+ Коммутатор (L2)`, `+ Маршрутизатор (L3)`.
  - Tool Modes: `Перемещение` (Drag), `Кабель` (Click port A -> click port B), `Пинг` (Click source -> click target to test connectivity).
  - Preset Selector dropdown: "Выбрать лабораторную работу" (Лабы 1-4, Чистый холст).
  - Quick Actions: "Сбросить к заданию лабы", "Очистить холст", "Экспорт схемы в JSON / Импорт".
- **Visual Canvas:**
  - Interactive grid with draggable nodes.
  - SVG dynamic cable lines connecting node ports with colored badges (Trunk = purple, Access = blue).
  - Animated packet tracer overlay:
    - Glowing dot traversing cables along the simulation hops.
    - Status badge and step explanation counter.
    - Pulsing red error marker on the exact port where a packet is dropped.
- **Device Inspector Drawer:**
  - Drawer sliding in upon clicking any node:
    - PC / Server: Hostname, IP address, Subnet Mask, Default Gateway, Ping button.
    - Switch: 8-port matrix (Port Mode: Access/Trunk, VLAN ID / PVID, Allowed VLANs, link status).
    - Router: SVI Interfaces list with IP/mask per VLAN.
- **Lab Objective & Evaluation HUD:**
  - Floating card displaying scenario title, goals, checklist, and "Проверить решение" button with confetti / success celebration.

---

### Task 3: Navigation & Application Routing

**Files:**
- Modify: `src/components/Header.jsx` (Add "Лаборатория" tab to primary navigation & mobile drawer)
- Modify: `src/App.jsx` (Add `currentView === 'lab'` state and render `NetworkLabView`)

---

### Task 4: Verification & End-to-End Testing

- Run unit tests: `node --test test/*.test.js`
- Build verification: `npm run build`
- Live UI verification with browser subagent:
  - Open `http://localhost:5173/`, navigate to `Лаборатория`.
  - Load "Лаба 2 (Trunk между коммутаторами)".
  - Perform drag and click on switch port to configure Trunk.
  - Run Ping simulation, observe packet animation and success toast.
  - Commit to `master` and push to GitHub.
