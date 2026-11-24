/**
 * packetCaptureService.js
 * High-performance network packet capture service & Libpcap 2.4 binary generator.
 * Supports:
 * - Libpcap 2.4 binary PCAP serialization compatible with desktop Wireshark and tcpdump.
 * - Multi-protocol synthetic packet generator (ARP, DHCP, DNS, TCP, UDP, ICMP, LLDP, STP, 802.1Q).
 * - Ring-buffered capture session manager for multi-client WebSocket streaming.
 */

import crypto from 'crypto';

/**
 * Builds standard 24-byte Libpcap 2.4 global header.
 * Linktype 1 = LINKTYPE_ETHERNET.
 */
export function buildGlobalPcapHeader() {
  const buf = Buffer.alloc(24);
  buf.writeUInt32LE(0xa1b2c3d4, 0); // Magic number (standard microsecond resolution)
  buf.writeUInt16LE(2, 4);          // Major version 2
  buf.writeUInt16LE(4, 6);          // Minor version 4
  buf.writeInt32LE(0, 8);           // Thiszone (GMT to local correction)
  buf.writeUInt32LE(0, 12);         // Sigfigs
  buf.writeUInt32LE(65535, 16);     // Snaplen (max capture length)
  buf.writeUInt32LE(1, 20);         // Network / LinkType: 1 (Ethernet)
  return buf;
}

/**
 * Builds 16-byte Libpcap packet record header + attaches payload.
 */
export function buildPacketRecord(packet) {
  const tsMs = packet.timestamp || Date.now();
  const sec = Math.floor(tsMs / 1000);
  const usec = (tsMs % 1000) * 1000;
  const rawBytes = packet.rawBytes || Buffer.alloc(64);
  const len = rawBytes.length;

  const header = Buffer.alloc(16);
  header.writeUInt32LE(sec, 0);  // ts_sec
  header.writeUInt32LE(usec, 4); // ts_usec
  header.writeUInt32LE(len, 8);  // incl_len
  header.writeUInt32LE(len, 12); // orig_len

  return Buffer.concat([header, rawBytes]);
}

/**
 * Concatenates global Libpcap header and all packet records into a valid .pcap binary.
 */
export function buildFullPcapBuffer(packets = []) {
  const globalHeader = buildGlobalPcapHeader();
  const records = packets.map(p => buildPacketRecord(p));
  return Buffer.concat([globalHeader, ...records]);
}

/**
 * Formats MAC string to 6 bytes Buffer.
 */
function macToBuffer(macStr) {
  if (!macStr) return Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
  const parts = macStr.split(/[:-]/).map(hex => parseInt(hex, 16) || 0);
  while (parts.length < 6) parts.push(0);
  return Buffer.from(parts.slice(0, 6));
}

/**
 * Formats IPv4 string to 4 bytes Buffer.
 */
function ipToBuffer(ipStr) {
  if (!ipStr) return Buffer.from([192, 168, 1, 1]);
  const parts = ipStr.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return Buffer.from(parts.slice(0, 4));
}

/**
 * Synthesizes authentic network frames for a switch port.
 */
export function generateSyntheticPacket(portInfo = {}, seq = 1) {
  const now = Date.now();
  const vlanId = portInfo.vlanId || 1;
  const hostIp = portInfo.deviceIp || `192.168.${vlanId}.${(seq % 200) + 10}`;
  const gatewayIp = `192.168.${vlanId}.1`;
  const hostMac = portInfo.deviceMac || 'b4:96:91:a1:b2:c3';
  const switchMac = '00:0c:42:ff:ee:01';
  const bcastMac = 'ff:ff:ff:ff:ff:ff';

  const types = ['DHCP', 'ARP', 'DNS', 'TCP_SYN', 'TCP_DATA', 'ICMP', 'LLDP', 'STP'];
  const type = types[seq % types.length];

  let protocol = 'TCP';
  let src = hostIp;
  let dst = gatewayIp;
  let srcPort = 51234 + (seq % 1000);
  let dstPort = 443;
  let info = '';
  let colorClass = 'tcp';
  let rawBytes = Buffer.alloc(0);
  let layers = [];

  const hostMacBuf = macToBuffer(hostMac);
  const switchMacBuf = macToBuffer(switchMac);
  const bcastMacBuf = macToBuffer(bcastMac);

  // Common Ethernet Header Builder (with optional 802.1Q)
  function makeEthernet(dstMac, srcMac, etherType) {
    if (vlanId && vlanId > 1) {
      // 802.1Q Tagged (18 bytes)
      const eth = Buffer.alloc(18);
      dstMac.copy(eth, 0);
      srcMac.copy(eth, 6);
      eth.writeUInt16BE(0x8100, 12); // TPID 802.1Q
      eth.writeUInt16BE(vlanId & 0x0FFF, 14); // TCI: VLAN ID
      eth.writeUInt16BE(etherType, 16);
      return eth;
    } else {
      // Standard untagged Ethernet II (14 bytes)
      const eth = Buffer.alloc(14);
      dstMac.copy(eth, 0);
      srcMac.copy(eth, 6);
      eth.writeUInt16BE(etherType, 12);
      return eth;
    }
  }

  switch (type) {
    case 'DHCP': {
      protocol = 'DHCP';
      colorClass = 'dhcp';
      src = '0.0.0.0';
      dst = '255.255.255.255';
      srcPort = 68;
      dstPort = 67;
      info = seq % 2 === 0 ? 'DHCP Discover - Transaction ID 0x3d1a44' : 'DHCP Request - Requested IP: ' + hostIp;
      
      const eth = makeEthernet(bcastMacBuf, hostMacBuf, 0x0800);
      const ipHdr = Buffer.alloc(20);
      ipHdr[0] = 0x45; // IPv4, 20 bytes
      ipHdr.writeUInt16BE(300, 2); // Length
      ipHdr[8] = 64; // TTL
      ipHdr[9] = 17; // UDP
      ipToBuffer('0.0.0.0').copy(ipHdr, 12);
      ipToBuffer('255.255.255.255').copy(ipHdr, 16);

      const udpHdr = Buffer.alloc(8);
      udpHdr.writeUInt16BE(68, 0);
      udpHdr.writeUInt16BE(67, 2);
      udpHdr.writeUInt16BE(280, 4);

      const dhcpPayload = Buffer.alloc(272);
      dhcpPayload[0] = 1; // BootRequest
      dhcpPayload[1] = 1; // Ethernet
      dhcpPayload[2] = 6; // HW len
      dhcpPayload.writeUInt32BE(0x3d1a4400 + seq, 4); // XID
      hostMacBuf.copy(dhcpPayload, 28);
      // Magic cookie 99.130.83.99
      dhcpPayload.writeUInt32BE(0x63825363, 236);
      dhcpPayload[240] = 53; // Option DHCP Msg Type
      dhcpPayload[241] = 1;
      dhcpPayload[242] = seq % 2 === 0 ? 1 : 3; // 1 = Discover, 3 = Request

      rawBytes = Buffer.concat([eth, ipHdr, udpHdr, dhcpPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Arrival: ${new Date(now).toISOString()}` },
        { name: `Ethernet II, Src: ${hostMac}, Dst: ${bcastMac}`, details: `Type: IPv4 (0x0800)` },
        ...(vlanId > 1 ? [{ name: `802.1Q Virtual LAN, PRI: 0, DEI: 0, ID: ${vlanId}`, details: `Type: IPv4 (0x0800)` }] : []),
        { name: `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, details: `Prot: UDP (17), TTL: 64` },
        { name: `User Datagram Protocol, Src Port: 68, Dst Port: 67`, details: `Length: 280` },
        { name: `Dynamic Host Configuration Protocol (${info})`, details: `Client MAC: ${hostMac}, XID: 0x3d1a44` }
      ];
      break;
    }

    case 'ARP': {
      protocol = 'ARP';
      colorClass = 'arp';
      src = hostMac;
      dst = 'Broadcast';
      info = `Who has ${gatewayIp}? Tell ${hostIp}`;
      
      const eth = makeEthernet(bcastMacBuf, hostMacBuf, 0x0806);
      const arpPayload = Buffer.alloc(28);
      arpPayload.writeUInt16BE(1, 0); // HW: Ethernet
      arpPayload.writeUInt16BE(0x0800, 2); // Proto: IPv4
      arpPayload[4] = 6; // HW size
      arpPayload[5] = 4; // Proto size
      arpPayload.writeUInt16BE(1, 6); // Opcode 1 (Request)
      hostMacBuf.copy(arpPayload, 8);
      ipToBuffer(hostIp).copy(arpPayload, 14);
      bcastMacBuf.copy(arpPayload, 18);
      ipToBuffer(gatewayIp).copy(arpPayload, 24);

      rawBytes = Buffer.concat([eth, arpPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Length: ${rawBytes.length}` },
        { name: `Ethernet II, Src: ${hostMac}, Dst: Broadcast`, details: `Type: ARP (0x0806)` },
        ...(vlanId > 1 ? [{ name: `802.1Q Virtual LAN, ID: ${vlanId}`, details: `Type: ARP (0x0806)` }] : []),
        { name: `Address Resolution Protocol (request)`, details: `Who has ${gatewayIp}? Tell ${hostIp}` }
      ];
      break;
    }

    case 'DNS': {
      protocol = 'DNS';
      colorClass = 'dns';
      src = hostIp;
      dst = gatewayIp;
      srcPort = 54100 + seq;
      dstPort = 53;
      info = 'Standard query 0x1f4a A switchbook.internal.lan';

      const eth = makeEthernet(switchMacBuf, hostMacBuf, 0x0800);
      const ipHdr = Buffer.alloc(20);
      ipHdr[0] = 0x45;
      ipHdr.writeUInt16BE(68, 2);
      ipHdr[8] = 64;
      ipHdr[9] = 17; // UDP
      ipToBuffer(hostIp).copy(ipHdr, 12);
      ipToBuffer(gatewayIp).copy(ipHdr, 16);

      const udpHdr = Buffer.alloc(8);
      udpHdr.writeUInt16BE(srcPort, 0);
      udpHdr.writeUInt16BE(53, 2);
      udpHdr.writeUInt16BE(48, 4);

      const dnsPayload = Buffer.alloc(40);
      dnsPayload.writeUInt16BE(0x1f4a, 0); // Query ID
      dnsPayload.writeUInt16BE(0x0100, 2); // Standard query
      dnsPayload.writeUInt16BE(1, 4);      // QDCount = 1

      rawBytes = Buffer.concat([eth, ipHdr, udpHdr, dnsPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Port: ${portInfo.portName || 'p' + portInfo.portNum}` },
        { name: `Ethernet II, Src: ${hostMac}, Dst: ${switchMac}`, details: `Type: IPv4` },
        { name: `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, details: `UDP (17)` },
        { name: `User Datagram Protocol, Src Port: ${srcPort}, Dst Port: 53`, details: `DNS` },
        { name: `Domain Name System (query)`, details: info }
      ];
      break;
    }

    case 'ICMP': {
      protocol = 'ICMP';
      colorClass = 'icmp';
      src = hostIp;
      dst = gatewayIp;
      info = `Echo (ping) request id=0x0001, seq=${seq}, ttl=64`;

      const eth = makeEthernet(switchMacBuf, hostMacBuf, 0x0800);
      const ipHdr = Buffer.alloc(20);
      ipHdr[0] = 0x45;
      ipHdr.writeUInt16BE(60, 2);
      ipHdr[8] = 64;
      ipHdr[9] = 1; // ICMP
      ipToBuffer(hostIp).copy(ipHdr, 12);
      ipToBuffer(gatewayIp).copy(ipHdr, 16);

      const icmpPayload = Buffer.alloc(40);
      icmpPayload[0] = 8; // Echo request
      icmpPayload[1] = 0; // Code 0
      icmpPayload.writeUInt16BE(0x0001, 4); // ID
      icmpPayload.writeUInt16BE(seq, 6);   // Seq

      rawBytes = Buffer.concat([eth, ipHdr, icmpPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `ICMP Ping` },
        { name: `Ethernet II, Src: ${hostMac}, Dst: ${switchMac}`, details: `Type: IPv4` },
        { name: `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, details: `Protocol: ICMP (1)` },
        { name: `Internet Control Message Protocol`, details: info }
      ];
      break;
    }

    case 'LLDP': {
      protocol = 'LLDP';
      colorClass = 'lldp';
      src = switchMac;
      dst = '01:80:c2:00:00:0e';
      info = `Chassis ID: sw-core, Port ID: ether${portInfo.portNum || 1}, TTL=120`;

      const lldpDstMac = Buffer.from([0x01, 0x80, 0xc2, 0x00, 0x00, 0x0e]);
      const eth = makeEthernet(lldpDstMac, switchMacBuf, 0x88cc); // EtherType 0x88CC

      const lldpPayload = Buffer.alloc(64);
      // Chassis Subtype
      lldpPayload.writeUInt16BE(0x0207, 0);
      lldpPayload[2] = 4; // MAC subtype
      switchMacBuf.copy(lldpPayload, 3);
      // Port Subtype
      lldpPayload.writeUInt16BE(0x0406, 9);
      lldpPayload[11] = 5; // Interface name
      lldpPayload.write(`eth${portInfo.portNum || 1}`, 12);
      // TTL
      lldpPayload.writeUInt16BE(0x0602, 18);
      lldpPayload.writeUInt16BE(120, 20);

      rawBytes = Buffer.concat([eth, lldpPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Discovery Protocol` },
        { name: `Ethernet II, Src: ${switchMac}, Dst: 01:80:c2:00:00:0e`, details: `Type: LLDP (0x88cc)` },
        { name: `Link Layer Discovery Protocol`, details: info }
      ];
      break;
    }

    case 'STP': {
      protocol = 'STP';
      colorClass = 'stp';
      src = switchMac;
      dst = '01:80:c2:00:00:00';
      info = `Conf. Root: 32768/${switchMac}, Cost: 4, Port: 0x800${portInfo.portNum || 1}`;

      const stpDstMac = Buffer.from([0x01, 0x80, 0xc2, 0x00, 0x00, 0x00]);
      const eth = makeEthernet(stpDstMac, switchMacBuf, 0x0026); // 802.3 length

      const stpPayload = Buffer.alloc(38);
      stpPayload[0] = 0x42; // LLC DSAP
      stpPayload[1] = 0x42; // LLC SSAP
      stpPayload[2] = 0x03; // LLC Control
      stpPayload.writeUInt16BE(0x0000, 3); // Protocol ID: STP
      stpPayload[5] = 0; // Version 0
      stpPayload[6] = 0; // BPDU Type: Config
      stpPayload.writeUInt16BE(32768, 8); // Root priority
      switchMacBuf.copy(stpPayload, 10); // Root Bridge ID
      stpPayload.writeUInt32BE(4, 16); // Root Path Cost

      rawBytes = Buffer.concat([eth, stpPayload]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Spanning Tree Protocol` },
        { name: `IEEE 802.3 Ethernet, Dst: 01:80:c2:00:00:00`, details: `LLC BPDU` },
        { name: `Spanning Tree Protocol (Config BPDU)`, details: info }
      ];
      break;
    }

    default: { // TCP SYN / DATA
      protocol = 'TCP';
      colorClass = 'tcp';
      src = hostIp;
      dst = '142.250.180.46'; // Google IP example
      srcPort = 49152 + (seq % 1000);
      dstPort = 443;
      info = `${srcPort} → 443 [ACK] Seq=${seq * 1460} Ack=${seq * 536} Win=65535 Len=0`;

      const eth = makeEthernet(switchMacBuf, hostMacBuf, 0x0800);
      const ipHdr = Buffer.alloc(20);
      ipHdr[0] = 0x45;
      ipHdr.writeUInt16BE(52, 2);
      ipHdr[8] = 64;
      ipHdr[9] = 6; // TCP
      ipToBuffer(hostIp).copy(ipHdr, 12);
      ipToBuffer('142.250.180.46').copy(ipHdr, 16);

      const tcpHdr = Buffer.alloc(32);
      tcpHdr.writeUInt16BE(srcPort, 0);
      tcpHdr.writeUInt16BE(443, 2);
      tcpHdr.writeUInt32BE(seq * 1460, 4); // Seq
      tcpHdr.writeUInt32BE(seq * 536, 8);  // Ack
      tcpHdr[12] = 0x80; // 32-byte header
      tcpHdr[13] = 0x10; // ACK flag
      tcpHdr.writeUInt16BE(65535, 14); // Window

      rawBytes = Buffer.concat([eth, ipHdr, tcpHdr]);

      layers = [
        { name: `Frame ${seq}: ${rawBytes.length} bytes on wire`, details: `Interface: ether${portInfo.portNum || 1}` },
        { name: `Ethernet II, Src: ${hostMac}, Dst: ${switchMac}`, details: `Type: IPv4 (0x0800)` },
        ...(vlanId > 1 ? [{ name: `802.1Q Virtual LAN, ID: ${vlanId}`, details: `Tagged` }] : []),
        { name: `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, details: `TCP (6), TTL: 64` },
        { name: `Transmission Control Protocol, Src Port: ${srcPort}, Dst Port: 443`, details: info }
      ];
      break;
    }
  }

  // Generate Hex & ASCII string representation for the UI Hex viewer
  const rawHex = rawBytes.toString('hex').match(/.{1,2}/g)?.join(' ') || '';

  return {
    id: `pkt-${seq}-${now}`,
    seq,
    timestamp: now,
    timeFormatted: new Date(now).toLocaleTimeString() + '.' + String(now % 1000).padStart(3, '0'),
    length: rawBytes.length,
    protocol,
    colorClass,
    src,
    dst,
    srcPort,
    dstPort,
    vlanId,
    info,
    rawBytes,
    rawHex,
    layers
  };
}

/**
 * Class managing active packet capture sessions.
 */
export class PacketCaptureManager {
  constructor(maxRingBufferSize = 2000) {
    this.sessions = new Map();
    this.maxRingBufferSize = maxRingBufferSize;
    this.wsClients = new Map(); // sessionId -> Set of WebSockets
  }

  /**
   * Starts a capture session for a specific switch port.
   */
  startSession(switchId, portId, options = {}) {
    const sessionId = `pcap-${switchId}-${portId}-${Date.now()}`;
    const session = {
      id: sessionId,
      switchId,
      portId,
      portInfo: options.portInfo || { portNum: 1, vlanId: 1 },
      status: 'capturing',
      startTime: Date.now(),
      packetCount: 0,
      packets: [],
      filter: options.filter || '',
      generatorTimer: null
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Stops a capture session.
   */
  stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.generatorTimer) {
      clearInterval(session.generatorTimer);
      session.generatorTimer = null;
    }
    session.status = 'stopped';
    session.stoppedTime = Date.now();
    return true;
  }

  /**
   * Retrieves an existing session.
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Appends a packet to the session's ring buffer and notifies subscribed WebSockets.
   */
  addPacket(sessionId, packet) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'capturing') return null;

    session.packetCount++;
    session.packets.push(packet);

    // Keep ring buffer within memory limits
    if (session.packets.length > this.maxRingBufferSize) {
      session.packets.shift();
    }

    // Broadcast to WebSocket clients
    const clients = this.wsClients.get(sessionId);
    if (clients && clients.size > 0) {
      // Create lightweight serializable payload without Buffer
      const { rawBytes, ...serializablePacket } = packet;
      const msg = JSON.stringify({ type: 'packet', sessionId, packet: serializablePacket });
      for (const ws of clients) {
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(msg);
        }
      }
    }

    return packet;
  }

  /**
   * Injects a synthetic packet for testing or simulation.
   */
  injectSyntheticPacket(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const seq = session.packetCount + 1;
    const packet = generateSyntheticPacket(session.portInfo, seq);
    return this.addPacket(sessionId, packet);
  }

  /**
   * Starts background synthetic packet generation loop for demo/simulation ports.
   */
  startSyntheticStream(sessionId, intervalMs = 600) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.generatorTimer) clearInterval(session.generatorTimer);

    // Inject initial burst of 3 packets
    for (let i = 0; i < 3; i++) {
      this.injectSyntheticPacket(sessionId);
    }

    session.generatorTimer = setInterval(() => {
      if (session.status !== 'capturing') {
        clearInterval(session.generatorTimer);
        return;
      }
      this.injectSyntheticPacket(sessionId);
    }, intervalMs);

    if (session.generatorTimer.unref) {
      session.generatorTimer.unref();
    }
  }

  /**
   * Registers a WebSocket connection for live packet updates.
   */
  addClient(sessionId, ws) {
    if (!this.wsClients.has(sessionId)) {
      this.wsClients.set(sessionId, new Set());
    }
    this.wsClients.get(sessionId).add(ws);

    // Send catch-up buffer (last 50 packets)
    const session = this.sessions.get(sessionId);
    if (session) {
      const recent = session.packets.slice(-50).map(({ rawBytes, ...p }) => p);
      ws.send(JSON.stringify({
        type: 'initial_history',
        sessionId,
        status: session.status,
        packetCount: session.packetCount,
        packets: recent
      }));
    }

    ws.on('close', () => {
      this.removeClient(sessionId, ws);
    });
  }

  /**
   * Unregisters a WebSocket connection.
   */
  removeClient(sessionId, ws) {
    const clients = this.wsClients.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.wsClients.delete(sessionId);
      }
    }
  }

  /**
   * Generates a binary Libpcap 2.4 buffer for download.
   */
  getPcapDownloadBuffer(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return buildFullPcapBuffer([]);
    return buildFullPcapBuffer(session.packets);
  }
}

export const packetCaptureManager = new PacketCaptureManager();
