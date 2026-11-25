# Network Lab Exam Mode & Incident Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive "Exam / Troubleshooting Challenge" mode in the Network Lab Simulator where trainees solve realistic L1/L2/L3 network incidents, use live packet tracing, receive tiered hints with penalties, and get evaluated with a 100-point scoring engine.

**Architecture:** Incident catalog and validation engine in `src/utils/networkSimulatorEngine.js`; comprehensive unit test suite in `test/networkSimulatorEngine.test.js`; HUD overlay with timer, hints, live symptoms, and victory dialog in `src/components/NetworkLabView.jsx`.

**Tech Stack:** React 18, Tailwind CSS, Lucide icons, Node native test runner (`node --test`).

**Spec:** [file:///C:/Users/qu/.gemini/antigravity/brain/0ba204b6-41ac-4796-ad9f-7b087f3aedad/network_lab_exam_design.md](file:///C:/Users/qu/.gemini/antigravity/brain/0ba204b6-41ac-4796-ad9f-7b087f3aedad/network_lab_exam_design.md)

## Global Constraints
- Pure client-side simulation logic inside `networkSimulatorEngine.js` ensuring immediate zero-latency feedback during packet animation.
- All incident states must be cloneable so trainees can reset or restart incidents at any time.
- Scoring must clamp between 0 and 100 points.

## Review Focus
1. Incident generation must produce a failing ping initially (proof that the error is present).
2. Applying the exact fix must yield a successful ping and 100% solution verification.
3. Timer countdown must stop when the exam is submitted or completed.
4. Unlocking hints must deduct points according to the penalty tiers (5 / 10 / 25).
5. Canvas interaction (dragging, port editing, IP configuring) must work seamlessly within the Exam mode.

---

### Task 1: Incident Engine & Scoring Functions (`src/utils/networkSimulatorEngine.js`)

**Files:**
- Modify: `src/utils/networkSimulatorEngine.js`
- Modify: `test/networkSimulatorEngine.test.js`

- [ ] **Step 1.1: Write unit tests for incident generation and verification**
  Add tests in `test/networkSimulatorEngine.test.js` covering:
  - Catalog of 4 incidents exists and has valid initial nodes/links.
  - Initial state of incident 1 fails ping due to Access VLAN mismatch.
  - Fixing port PVID makes incident 1 pass `verifyIncidentSolution`.
  - Initial state of incident 2 fails ping due to trunk pruning.
  - Fixing trunk Allowed VLANs makes incident 2 pass.
  - Initial state of incident 3 fails due to wrong gateway on server.
  - Fixing server gateway makes incident 3 pass.
  - Initial state of incident 4 fails due to unlinked cable.
  - Connecting cable makes incident 4 pass.
  - `calculateExamScore` correctly computes penalties for hints and time elapsed.
- [ ] **Step 1.2: Run tests and verify failure**
  Run: `node --test test/networkSimulatorEngine.test.js`
- [ ] **Step 1.3: Implement `EXAM_INCIDENTS`, `generateIncident`, `verifyIncidentSolution`, `calculateExamScore` in `src/utils/networkSimulatorEngine.js`**
  - Export `EXAM_INCIDENTS` array with 4 realistic incidents.
  - Export `generateIncident(incidentId)` returning clone of incident state.
  - Export `verifyIncidentSolution(incidentId, { nodes, links })`.
  - Export `calculateExamScore({ timeSpentSeconds, hintsUsed = [] })`.
- [ ] **Step 1.4: Run tests and verify passing**
  Run: `node --test test/networkSimulatorEngine.test.js`

---

### Task 2: Frontend Exam HUD, Mode Switching & Victory Dialog (`src/components/NetworkLabView.jsx`)

**Files:**
- Modify: `src/components/NetworkLabView.jsx`

- [ ] **Step 2.1: Add "Режим Экзаменатора" mode tab and HUD controls**
  - Add mode pill: "Свободная песочница", "Обучающие лабы", "🏆 Экзаменатор (Траблшутинг)".
  - Add incident selector dropdown or cards: "Инцидент 1: Бухгалтерия (L2 Access)", "Инцидент 2: Транк этажей (L2 Trunk)", "Инцидент 3: Шлюз базы данных (L3)", "Инцидент 4: Обрыв линка (L1)".
  - Add active exam state: `examActive`, `currentIncidentId`, `examTimeSeconds` (10 min timer), `hintsRevealed` array.
- [ ] **Step 2.2: Add Exam HUD banner at the top of the canvas**
  - Live timer countdown (`MM:SS`) with color shift (amber at 3 min, red at 1 min).
  - Current symptom description card (*"Бухгалтер не может открыть 1С..."*).
  - Hint button: "Взять подсказку" (collapsible 3-tier hints with point penalties).
  - Button "Проверить сеть (Сдать экзамен)" with live verification.
- [ ] **Step 2.3: Add Victory / Results Modal dialog**
  - Displays grade badge (🏆 Master / 🥈 Proficient / 🥉 Junior), score out of 100, elapsed time, hints breakdown.
  - Incident post-mortem summary explaining what was broken and how it was fixed.
  - "Следующий инцидент" and "Попробовать снова" buttons.
- [ ] **Step 2.4: Build check**
  Run: `npm run build` to ensure clean bundle compilation.

---

### Task 3: Verification, Browser QA & Final Commit

- [ ] **Step 3.1: Run full test suite**
  Run: `node --test` to ensure all 133+ tests pass.
- [ ] **Step 3.2: Browser subagent visual QA**
  - Launch dev server.
  - Open `http://localhost:5173/` and navigate to Network Lab.
  - Switch to "Экзаменатор" mode.
  - Select Incident 1 ("Бухгалтерия отрезана от сервера 1С").
  - Test ping (fails, packet drops on switch).
  - Reveal Hint 1.
  - Open switch port editor and fix PVID to 10.
  - Test ping (succeeds!).
  - Click "Сдать экзамен" and verify victory screen with score.
  - Take screenshot evidence.
- [ ] **Step 3.3: Commit and push**
  Commit with message `feat(lab): implement Network Lab Exam mode and incident troubleshooting engine` and push to master.
