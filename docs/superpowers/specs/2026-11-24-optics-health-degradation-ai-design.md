# Optics Health & Early Degradation AI: Design Specification

**Feature:** Deep Tech — «Optics Health & Early Degradation AI»  
**Date:** 2026-11-24  
**Target Hardware:** SNR NAG (SNR-OS) & MikroTik RouterOS (v6 & v7)  
**Status:** Approved / In Progress

---

## 1. Intent & The Why

In enterprise optical networks, fiber links rarely fail instantaneously. They experience progressive degradation over days or weeks:
1. **Dust accumulation and micro-contamination** on LC/UPC fiber ferrules.
2. **Micro-bends and pinching** of patch cords in dense cable trays.
3. **Laser diode aging**, where the transmitter draws increasing bias current (mA) to maintain output power before dying.
4. **Thermal stress** in unventilated distribution boxes accelerating optical receiver degradation.

Standard network monitors only alert when the link drops completely (Loss of Light, $\text{Rx} < -30\text{ dBm}$).  
**Optics Health & Early Degradation AI** tracks historical DDM/DOM telemetry, calculates linear degradation trend slopes ($\Delta \text{Rx}$ dB/day, $\Delta \text{Bias}$ mA/day), projects **Time-To-Failure (TTF)** in days, performs **Dual-Ended Optical Span Correlation** across switch pairs, and provides proactive maintenance recommendations before packet loss occurs.

---

## 2. Mathematical Models & AI Diagnostic Rules

### 2.1 Trend Slope & Time-To-Failure (TTF) Calculation
Given a series of DDM snapshots $(t_i, \text{rx}_i, \text{bias}_i)$ over time:
$$\text{Slope}_{\text{Rx}} = \frac{\sum (t_i - \bar{t})(\text{rx}_i - \bar{\text{rx}})}{\sum (t_i - \bar{t})^2} \quad (\text{dB/day})$$
$$\text{Slope}_{\text{Bias}} = \frac{\sum (t_i - \bar{t})(\text{bias}_i - \bar{\text{bias}})}{\sum (t_i - \bar{t})^2} \quad (\text{mA/day})$$

- **Critical Rx Threshold:** $-20.0\text{ dBm}$ (sensitivity floor for 1G/10G SFP+ receivers).
- **Time-To-Failure (TTF):**
  $$\text{TTF}_{\text{days}} = \frac{\text{rx}_{\text{current}} - (-20.0)}{\lvert \text{Slope}_{\text{Rx}} \rvert} \quad \text{if } \text{Slope}_{\text{Rx}} \le -0.15\text{ dB/day}$$
  If $\text{Slope}_{\text{Rx}} > -0.15\text{ dB/day}$ and $\text{rx} \ge -15\text{ dBm}$, TTF is classified as `STABLE` ($> 180\text{ days}$).

### 2.2 Root Cause AI Classification
| AI Classification | Criteria | Actionable Recommendation |
|---|---|---|
| `CONNECTOR_DIRT_OR_BEND` | Sudden or steady $\text{Rx}$ drop ($\ge 1.5\text{ dB}$) while Laser Bias is normal ($\le 35\text{ mA}$). | Очистить коннектор LC изопропиловым очистителем, проверить радиус изгиба волокна. |
| `LASER_AGING` | $\text{Bias Current} \ge 45\text{ mA}$ or $\text{Slope}_{\text{Bias}} \ge +0.25\text{ mA/day}$ with dropping $\text{Tx}$. | Запланировать замену SFP-трансивера (деградация лазерного полупроводника). |
| `ASYMMETRIC_FIBER_FAULT` | Dual-ended span loss difference $\lvert \text{Loss}_{A \rightarrow B} - \text{Loss}_{B \rightarrow A} \rvert \ge 3.5\text{ dB}$. | Проверить целостность одиночной жилы дуплексного кабеля или сварку на ODF. |
| `THERMAL_STRESS` | Temperature $\ge 68^\circ\text{C}$ or voltage fluctuation $> 0.2\text{V}$. | Проверить охлаждение узла, вентиляторы шасси и соседние горячие модули. |
| `OPTIMAL` | Signal in $-2 \dots -14\text{ dBm}$, normal bias ($\le 35\text{ mA}$), low loss. | Тракт в эталонном состоянии. Вмешательство не требуется. |

---

## 3. Dual-Ended Optical Span Correlation

For any connected optical link between Switch A (Port $P_A$) and Switch B (Port $P_B$):
- **Forward Span Loss:** $\text{Loss}_{A \rightarrow B} = \text{Tx}_A - \text{Rx}_B\text{ (dB)}$
- **Reverse Span Loss:** $\text{Loss}_{B \rightarrow A} = \text{Tx}_B - \text{Rx}_A\text{ (dB)}$
- **Span Asymmetry:** $\Delta \text{Loss} = \lvert \text{Loss}_{A \rightarrow B} - \text{Loss}_{B \rightarrow A} \rvert$
- **Total Span Margin:** $\min(\text{Rx}_A - (-20.0), \text{Rx}_B - (-20.0))$

---

## 4. REST API Contract

1. `GET /api/optics/fleet-summary`
   - Returns fleet-wide metrics: total SFP ports, degrading count, critical count, optimal count, and active predictive alerts.
2. `GET /api/optics/switches/:switchId/ports/:portId/analysis`
   - Returns current DDM telemetry, history points (last 30-50 measurements), trend slopes, projected TTF days, and AI root cause diagnosis.
3. `GET /api/optics/spans`
   - Returns all active inter-switch optical spans with dual-ended forward/reverse losses and asymmetry flags.
4. `POST /api/optics/poll-fleet`
   - Triggers on-demand fleet-wide optical polling.

---

## 5. UI / UX Design in `OpticsHealthModal.jsx`

- Accessible from top navigation and `TopologyView.jsx` toolbar.
- **Top Metrics Cards:**
  - `Всего оптических портов (SFP/SFP+)`
  - `Здоровые (Optimal)`
  - `Деградация (Early Warning)`
  - `Критический уровень (Imminent Failure)`
  - `Асимметрия волокна (Dual-Ended)`
- **Degradation Radar & Alert Feed:**
  - Highlights links at risk of dropping within the next 30 days.
- **Port Detail View:**
  - Interactive SVG Sparkline showing Rx Power history and projected threshold line.
  - Laser Bias Current health gauge (mA).
  - Temperature & Voltage gauges.
  - AI Diagnosis Box with root cause classification and specific engineer recommendation.
- **Dual-Ended Span Visualizer:**
  - Visual dual-cable representation showing Forward vs Reverse loss in dB.
