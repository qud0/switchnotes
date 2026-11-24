# LLDP/CDP Live Topology Auto-Stitcher: Design Specification

**Feature:** Game Changer №2 — «LLDP/CDP Live Topology Auto-Stitcher»  
**Date:** 2026-11-24  
**Target Hardware:** SNR NAG (SNR-OS) & MikroTik RouterOS (v6 / v7)  
**Status:** Approved / In Progress

---

## 1. Intent & The Why

In enterprise campus and data center networks with dozens of switches, manual port-to-port link documentation is notoriously error-prone and time-consuming. When engineers re-patch cables, configure LACP trunks (Port-Channels/bonding), or Spanning Tree transitions redundant links to alternate/discarding states, static topology maps drift from physical reality.

**LLDP/CDP Live Topology Auto-Stitcher** solves this by:
1. Querying live hardware via parallel SSH to fetch LLDP/CDP neighbor tables, LACP trunk memberships, and STP/RSTP bridge/port states.
2. Grouping parallel links into aggregated LACP trunks with member health and combined bandwidth.
3. Identifying STP Root Bridges and blocked/alternate standby ports to clearly display active forwarding trees vs redundant loop-prevention links.
4. Diffing live physical reality against SwitchBook's current database (`NEW_LINK`, `MISSING_LINK`, `MISMATCH_LINK`, `VLAN_MISMATCH`).
5. Providing 1-click **Auto-Stitch** to synchronize SwitchBook links with zero manual dragging.

---

## 2. Hardware Protocols & CLI Syntax (Strict Scope)

### 2.1 SNR NAG (SNR-OS)
- **LLDP Neighbors:**
  ```text
  show lldp info remote-device
  ```
  Parses: `Chassis ID`, `Port ID`, `System Name`, `Port Description`, `Management Address`.
- **CDP Fallback:**
  ```text
  show cdp neighbor detail
  ```
  Parses: `Device ID`, `Interface`, `Port ID`, `IP address`.
- **LACP / Trunk Aggregation:**
  ```text
  show link-aggregation
  show lacp 1 internal
  ```
  Parses: Port-Channel ID, Aggregator type, member interfaces (e.g. `Ethernet1/0/1`, `Ethernet1/0/2`), status (`Active`, `Attached`).
- **Spanning Tree (STP / RSTP / MSTP):**
  ```text
  show spanning-tree
  ```
  Parses: Root Bridge MAC/Priority, Port Role (`Root`, `Designated`, `Alternate`), Port State (`Forwarding`, `Discarding`, `Blocking`, `Learning`).

### 2.2 MikroTik RouterOS (v6 & v7)
- **Neighbors (LLDP / CDP / MNDP):**
  ```text
  /ip neighbor print detail without-paging
  ```
  Parses: `interface`, `mac-address`, `identity` (system name), `address` (IP), `port-identifier` (remote port), `platform`.
- **Bonding (LACP / 802.3ad):**
  ```text
  /interface bonding print detail
  ```
  Parses: bonding name, `slaves` list (e.g. `sfp-sfpplus1,sfp-sfpplus2`), `mode=802.3ad`.
- **Spanning Tree / Bridge:**
  ```text
  /interface bridge print detail
  /interface bridge port print detail without-paging
  ```
  Parses: `root-bridge` (true/false), port `role` (`root`, `designated`, `alternate`, `backup`), port `edge`, `status` / `inactive` / `forwarding` / `discarding`.

---

## 3. Architecture & Data Structures

### 3.1 Discovered Link Schema (`StitchedLink`)
```javascript
{
  id: "stitch-swA-portA-swB-portB",
  status: "MATCHED" | "NEW_LINK" | "MISSING_LINK" | "MISMATCH_LINK",
  protocol: "LLDP" | "CDP" | "MNDP",
  sourceSwitch: { id, name, ip, vendor, isRootBridge },
  sourcePort: { id, name, number, speed, role, state, isBlocked },
  remoteSwitch: { id, name, ip, vendor, isExternal, sysName },
  remotePort: { id, name, number, speed, role, state, isBlocked },
  isLag: boolean,
  lagInfo: {
    lagId: "Port-Channel 1" | "bonding1",
    memberCount: 2,
    members: ["Ethernet1/0/1", "Ethernet1/0/2"],
    totalCapacityMbps: 20000
  },
  stp: {
    isRootPath: boolean,
    isBlocked: boolean, // true if either endpoint is discarding/alternate
    blockingPort: "Ethernet1/0/2"
  },
  discrepancies: [
    // e.g. "VLAN mismatch: Port A (VLAN 10,20) != Port B (VLAN 10)"
  ]
}
```

### 3.2 Stitch Report Summary (`StitchScanReport`)
```javascript
{
  timestamp: "2026-11-24T12:00:00.000Z",
  totalPolled: 8,
  successfulPolls: 8,
  totalLinks: 14,
  matchedCount: 10,
  newDiscoveredCount: 3,
  missingCount: 1,
  mismatchCount: 0,
  lagCount: 2,
  stpBlockedCount: 1,
  rootBridgeId: "sw-core-01",
  links: [...],
  simulation: false
}
```

---

## 4. REST API Contract

1. `POST /api/topology/stitch/scan`
   - Body: `{ mode: 'auto' | 'simulation' | 'hardware' }`
   - Response: `StitchScanReport`
2. `POST /api/topology/stitch/apply`
   - Body: `{ linkIds: string[], pruneMissing: boolean }`
   - Logic: Mutates `storage.updatePort` to establish bidirectional links between matched ports. If `pruneMissing: true`, removes `linkedSwitchId`/`linkedPortId` from confirmed missing links.
   - Response: `{ success: true, appliedCount: number, prunedCount: number }`

---

## 5. UI / UX Integration in `TopologyView.jsx`

1. **Header Action Button:**
   - Button with live radar icon and badge: `LLDP Auto-Stitcher`.
2. **Interactive Auto-Stitcher Modal:**
   - Summary statistics tiles: `Всего линков`, `Новые (не сшиты)`, `LACP транки`, `STP Standby (Block)`.
   - Banner displaying detected Spanning Tree Root Bridge.
   - Tabbed / filtered diff table:
     - All / New / Missing / Discrepancies.
     - Checkbox selection per link.
     - Visual badge tags for `LACP 2x10G`, `STP Alternate (Blocked)`, `VLAN Mismatch`.
   - Action buttons:
     - `Сшить все новые (N)`
     - `Синхронизировать выбранные`
     - Checkbox: `Удалить старые отсутствующие линки (Prune Missing)`
3. **Graph Rendering Enhancements:**
   - Active forwarding trunks rendered as solid cables.
   - STP blocked/alternate links rendered with amber dashed stroke `6 6` and `STP BLK` indicator.
   - LACP bundles rendered with double stroke or aggregated badge.

---

## 6. Testing Strategy
- Unit tests with realistic CLI outputs for:
  - SNR-OS LLDP remote-device tables.
  - SNR-OS LACP / Port-Channel status tables.
  - SNR-OS `show spanning-tree` states (Root, Desg, Altn, Discarding, Forwarding).
  - MikroTik `/ip neighbor print detail` tables.
  - MikroTik `/interface bonding print detail` tables.
  - MikroTik `/interface bridge port print detail` states.
  - Correlation logic: matching by IP, MAC, sysName.
  - Diff detector (`NEW_LINK`, `MISSING_LINK`, `MISMATCH_LINK`).
  - `applyStitchedTopology` persistence with rollback safety.
