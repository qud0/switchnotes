# Live Web-PCAP & Dockable Diagnostics Console: Design Specification

**Feature:** Deep Tech — «Live Web-PCAP (Wireshark-in-Browser) & Dockable Network Diagnostics»  
**Date:** 2026-11-24  
**Target Hardware:** SNR NAG (SNR-OS), MikroTik RouterOS (v6 & v7), Ubiquiti UniFi / EdgeSwitch  
**Status:** Approved / In Progress

---

## 1. Intent & Architectural Vision

In network operations, packet-level diagnosis is the ultimate truth. When a host fails to receive an IP, when STP loops occur, or when an optical uplink drops traffic, engineers need packet capture.
Currently:
1. Setting up packet capture requires configuring SPAN / port mirroring in CLI, connecting a physical laptop, and launching Wireshark.
2. The UI suffers from **Modal Hell** — running any diagnostic tool opens a blocking popup that obstructs the physical chassis view.

**Live Web-PCAP & Dockable Diagnostics Console** introduces:
- A non-blocking **Dockable Workspace Console** directly below `SwitchFaceplate.jsx`.
- **Live Web-PCAP**: Real-time packet streaming for any selected port with Wireshark-like syntax highlighting, protocol dissection (Frame $\to$ Ethernet II $\to$ 802.1Q $\to$ IPv4/ARP $\to$ TCP/UDP/ICMP/DHCP/DNS/LLDP), display filters, and binary `.pcap` download.
- **L1–L3 X-Ray Circuit Tracer Tab**: Visual end-to-end circuit chain from host to gateway.

---

## 2. Binary PCAP Specification (Libpcap 2.4)

All captured packets can be exported into standard Libpcap binary format (`.pcap`), opening directly in Wireshark or `tcpdump` without conversions:

### 2.1 Global Header (24 bytes)
- `magic_number`: `0xa1b2c3d4` (microseconds, standard endianness)
- `version_major`: `2`
- `version_minor`: `4`
- `thiszone`: `0` (GMT)
- `sigfigs`: `0`
- `snaplen`: `65535`
- `network`: `1` (`LINKTYPE_ETHERNET`)

### 2.2 Packet Record Header (16 bytes per packet)
- `ts_sec`: 32-bit uint (Unix epoch seconds)
- `ts_usec`: 32-bit uint (Microseconds)
- `incl_len`: 32-bit uint (Captured frame length)
- `orig_len`: 32-bit uint (Original frame length on wire)
- `data`: Raw Ethernet frame bytes

---

## 3. Dissected Protocols & Color Coding

| Protocol | Identification | Display Color (Wireshark Standard) | Example Details |
|---|---|---|---|
| **ARP** | EtherType `0x0806` | Yellow / Ochre (`#fef08a` / `#ca8a04`) | `Who has 192.168.10.1? Tell 192.168.10.45` |
| **DHCP / BOOTP** | UDP Port 67/68 | Light Amber (`#fde68a` / `#b45309`) | `DHCP Discover / Offer / Request / ACK` |
| **DNS** | UDP/TCP Port 53 | Light Blue (`#bae6fd` / `#0284c7`) | `Standard query 0x1234 A api.internal.lan` |
| **TCP** | IP Proto `6` | Soft Green (`#bbf7d0` / `#16a34a`) | `[SYN] Seq=0 Win=65535 Len=0 MSS=1460` |
| **TCP RST / ERR** | TCP Flag `RST` or `FIN` | Light Red / Pink (`#fecdd3` / `#e11d48`) | `[RST, ACK] Connection reset by peer` |
| **UDP** | IP Proto `17` | Sky Cyan (`#a5f3fc` / `#0891b2`) | `Len=48` |
| **ICMP** | IP Proto `1` | Salmon / Rose (`#fbcfe8` / `#db2777`) | `Echo (ping) request / reply, id=0x0001, seq=1` |
| **LLDP / CDP** | EtherType `0x88CC` / `0x2000` | Violet (`#ddd6fe` / `#7c3aed`) | `Chassis ID: sw-core-mikrotik, Port ID: ether24` |
| **STP BPDU** | LLC `0x424203` | Dark Purple (`#c084fc` / `#9333ea`) | `Conf. Root: 32768/00:0c:42:..., Cost: 4` |

---

## 4. Architecture & Data Flow

```
[Switch Port / Real or Lab Engine]
             │
             ▼
[packetCaptureService.js] (Server)
   ├── Real Mode: SSH tcpdump stream / RouterOS sniffer
   ├── Lab Mode: Synthetic generator (DHCP, ARP, DNS, TCP, LLDP, STP)
   ├── Binary PCAP Session Buffer (Max 2,000 packets / ring buffer)
   └── WebSocket Push (/ws/pcap)
             │
             ▼
[Browser WebSocket Client]
             │
             ▼
[DockableConsole.jsx] (Bottom Drawer under SwitchFaceplate)
   ├── Tab 1: Live Web-PCAP (Wireshark-in-Browser)
   │     ├── Stream Controls (Start / Pause / Clear / Download .pcap)
   │     ├── Filter Bar (protocol, IP, port, VLAN)
   │     ├── Virtual Packet List (Auto-scroll toggle)
   │     └── Packet Inspector (Protocol Tree + Hex/ASCII Dump)
   └── Tab 2: L1–L3 X-Ray Circuit Tracer
         └── Device ──> Socket ──> PatchPanel ──> Switch Port ──> Trunk ──> Gateway
```

---

## 5. REST & WebSocket API Contract

1. `GET /api/pcap/switches/:switchId/ports/:portId/status`
   - Returns capture status: `isCapturing`, `packetCount`, `durationSeconds`, `bufferSize`.
2. `POST /api/pcap/switches/:switchId/ports/:portId/start`
   - Starts capture session (real or lab generator).
   - Body: `{ filter?: string, maxPackets?: number }`.
3. `POST /api/pcap/switches/:switchId/ports/:portId/stop`
   - Stops capture session.
4. `GET /api/pcap/sessions/:sessionId/download`
   - Streams `Content-Type: application/vnd.tcpdump.pcap` with binary Libpcap header and frames.
5. `WebSocket: /ws/pcap?sessionId=...&switchId=...&portId=...`
   - Real-time packet event stream: `{ type: 'packet', packet: { id, ts, len, proto, src, dst, vlan, info, rawHex, layers } }`.
