// Voice Relay Server - Custom Binary Protocol
// Handles voice packet relay between clients with jitter buffer and quality monitoring

import dgram from 'dgram';
import { logger } from './utils/logger.js';

const VOICE_PORT = parseInt(process.env.VOICE_PORT || '9988');

// Packet types
const PACKET_TYPE = {
  HELLO: 0x01,
  WELCOME: 0x02,
  JOIN_CHANNEL: 0x10,
  LEAVE_CHANNEL: 0x11,
  VOICE_PACKET: 0x20,
  VIDEO_PACKET: 0x21,
  SPEAKING_STATE: 0x30,
  KEEPALIVE: 0xFF,
  QUALITY_STATS: 0x40,  // New: quality statistics
};

// Quality statistics for monitoring
interface QualityStats {
  packetsReceived: number;
  packetsLost: number;
  avgJitter: number;
  lastReportTime: number;
}

// Jitter buffer configuration
const JITTER_BUFFER_CONFIG = {
  enabled: true,
  targetDelayMs: 20,      // Target buffer delay (20ms is good for voice)
  maxDelayMs: 100,        // Maximum allowed delay
  minDelayMs: 5,          // Minimum delay
  adaptationRate: 0.1,    // How fast buffer adapts (0-1)
};

// Jitter buffer entry
interface JitterBufferEntry {
  data: Buffer;
  sequenceNumber: number;
  timestamp: number;
  receivedAt: number;
}

// Channel management
interface VoiceClient {
  id: string;
  address: string;
  port: number;
  channelId: string;
  username: string;
  isSpeaking: boolean;
  lastSeen: number;
  sequenceNumber: number;        // For packet ordering
  jitterBuffer: JitterBufferEntry[];  // Per-client jitter buffer
  currentDelay: number;          // Current buffer delay in ms
  qualityStats: QualityStats;    // Quality monitoring
}

class VoiceRelayServer {
  private server: dgram.Socket | null = null;
  private clients: Map<string, VoiceClient> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channelId -> Set<clientId>
  
  // O(1) address lookup: "address:port" -> clientId
  private addressToClientId: Map<string, string> = new Map();
  
  // Global statistics with explicit types
  private globalStats: {
    totalPacketsReceived: number;
    totalPacketsRelayed: number;
    totalBytesTransferred: number;
    startTime: number;
  } = {
    totalPacketsReceived: 0,
    totalPacketsRelayed: 0,
    totalBytesTransferred: 0,
    startTime: Date.now(),
  };

  start(): void {
    this.server = dgram.createSocket('udp4');
    
    this.server.on('error', (err) => {
      logger.error('[VoiceRelay] Server error:', err);
      this.server?.close();
    });

    this.server.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo);
    });

    this.server.bind(VOICE_PORT, () => {
      logger.info(`[VoiceRelay] Voice relay server listening on port ${VOICE_PORT}`);
    });

    // Cleanup stale clients every 30 seconds
    setInterval(() => this.cleanupStaleClients(), 30000);
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    logger.info('[VoiceRelay] Voice relay server stopped');
  }

  private handlePacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < 2) return;

    const packetType = msg[0];

    switch (packetType) {
      case PACKET_TYPE.HELLO:
        this.handleHello(msg, rinfo);
        break;
      case PACKET_TYPE.JOIN_CHANNEL:
        this.handleJoinChannel(msg, rinfo);
        break;
      case PACKET_TYPE.LEAVE_CHANNEL:
        this.handleLeaveChannel(msg, rinfo);
        break;
      case PACKET_TYPE.VOICE_PACKET:
        this.handleVoicePacket(msg, rinfo);
        break;
      case PACKET_TYPE.SPEAKING_STATE:
        this.handleSpeakingState(msg, rinfo);
        break;
      case PACKET_TYPE.KEEPALIVE:
        this.handleKeepalive(rinfo);
        break;
    }
  }

  private handleHello(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Format: [TYPE(1)][FLAGS(1)][CLIENT_ID(16)][USERNAME_LEN(1)][USERNAME...]
    if (msg.length < 18) return;

    const clientId = msg.subarray(2, 18).toString('hex');
    const usernameLen = msg[18] ?? 0;
    if (usernameLen === 0 || msg.length < 19 + usernameLen) return;
    const username = msg.subarray(19, 19 + usernameLen).toString('utf8');

    // Register or update client with full initialization
    const client: VoiceClient = {
      id: clientId,
      address: rinfo.address,
      port: rinfo.port,
      channelId: '',
      username,
      isSpeaking: false,
      lastSeen: Date.now(),
      sequenceNumber: 0,
      jitterBuffer: [],
      currentDelay: JITTER_BUFFER_CONFIG.targetDelayMs,
      qualityStats: {
        packetsReceived: 0,
        packetsLost: 0,
        avgJitter: 0,
        lastReportTime: Date.now(),
      },
    };

    this.clients.set(clientId, client);
    
    // O(1) address lookup
    const addressKey = `${rinfo.address}:${rinfo.port}`;
    this.addressToClientId.set(addressKey, clientId);
    
    logger.info(`[VoiceRelay] Client registered: ${username} (${clientId})`);

    // Send welcome packet
    const welcomeMsg = Buffer.alloc(2);
    welcomeMsg[0] = PACKET_TYPE.WELCOME;
    welcomeMsg[1] = 0x00;
    this.server?.send(welcomeMsg, rinfo.port, rinfo.address);
  }

  private handleJoinChannel(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Format: [TYPE(1)][FLAGS(1)][CLIENT_ID(16)][CHANNEL_ID_LEN(1)][CHANNEL_ID...]
    if (msg.length < 20) return;

    const clientId = msg.subarray(2, 18).toString('hex');
    const channelIdLen = msg[18] ?? 0;
    if (channelIdLen === 0 || msg.length < 19 + channelIdLen) return;
    const channelId = msg.subarray(19, 19 + channelIdLen).toString('utf8');

    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from old channel
    if (client.channelId && this.channels.has(client.channelId)) {
      this.channels.get(client.channelId)?.delete(clientId);
    }

    // Add to new channel
    client.channelId = channelId;
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new Set());
    }
    this.channels.get(channelId)?.add(clientId);

    logger.info(`[VoiceRelay] Client ${client.username} joined channel ${channelId}`);

    // Notify others in channel
    this.broadcastToChannel(channelId, Buffer.from([PACKET_TYPE.JOIN_CHANNEL, 0x00]), clientId);
  }

  private handleLeaveChannel(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const clientId = msg.subarray(2, 18).toString('hex');
    const client = this.clients.get(clientId);
    if (!client || !client.channelId) return;

    this.channels.get(client.channelId)?.delete(clientId);
    logger.info(`[VoiceRelay] Client ${client.username} left channel ${client.channelId}`);

    // Notify others
    this.broadcastToChannel(client.channelId, Buffer.from([PACKET_TYPE.LEAVE_CHANNEL, 0x00]), clientId);
    client.channelId = '';
  }

  private handleVoicePacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Find sender by address/port
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!client || !client.channelId) return;

    // Relay to all others in channel
    const relayMsg = Buffer.alloc(msg.length + 18);
    relayMsg[0] = PACKET_TYPE.VOICE_PACKET;
    relayMsg[1] = msg[1]; // flags
    msg.copy(relayMsg, 2, 0); // copy original packet

    this.broadcastToChannel(client.channelId, relayMsg, client.id);
  }

  private handleSpeakingState(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < 3) return;
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!client) return;

    const isSpeaking = (msg[2] ?? 0) === 0x01;
    client.isSpeaking = isSpeaking;

    // Broadcast speaking state to channel
    const stateMsg = Buffer.alloc(19);
    stateMsg[0] = PACKET_TYPE.SPEAKING_STATE;
    stateMsg[1] = 0x00;
    stateMsg[2] = isSpeaking ? 0x01 : 0x00;
    Buffer.from(client.id).copy(stateMsg, 3);

    this.broadcastToChannel(client.channelId, stateMsg, client.id);
  }

  private handleKeepalive(rinfo: dgram.RemoteInfo): void {
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (client) {
      client.lastSeen = Date.now();
    }
  }

  /**
   * O(1) client lookup by address using hash map.
   * Falls back to linear scan if address key not found (legacy clients).
   */
  private findClientByAddress(address: string, port: number): VoiceClient | undefined {
    // O(1) lookup using address-to-clientId map
    const addressKey = `${address}:${port}`;
    const clientId = this.addressToClientId.get(addressKey);
    
    if (clientId) {
      return this.clients.get(clientId);
    }
    
    // Fallback: Linear scan for legacy clients (should be rare after initial registration)
    for (const client of this.clients.values()) {
      if (client.address === address && client.port === port) {
        // Update the lookup map for future O(1) access
        this.addressToClientId.set(addressKey, client.id);
        return client;
      }
    }
    return undefined;
  }

  private broadcastToChannel(channelId: string, msg: Buffer, excludeClientId: string): void {
    const channelClients = this.channels.get(channelId);
    if (!channelClients) return;

    for (const clientId of channelClients) {
      if (clientId === excludeClientId) continue;

      const client = this.clients.get(clientId);
      if (client) {
        this.server?.send(msg, client.port, client.address);
      }
    }
  }

  private cleanupStaleClients(): void {
    const now = Date.now();
    const staleTimeout = 60000; // 1 minute

    for (const [clientId, client] of this.clients) {
      if (now - client.lastSeen > staleTimeout) {
        // Remove from channel
        if (client.channelId) {
          this.channels.get(client.channelId)?.delete(clientId);
        }
        // Remove from address lookup map
        const addressKey = `${client.address}:${client.port}`;
        this.addressToClientId.delete(addressKey);
        
        this.clients.delete(clientId);
        logger.info(`[VoiceRelay] Client timed out: ${client.username}`);
      }
    }
  }

  /**
   * Get comprehensive server statistics for monitoring
   */
  getStats(): { 
    clients: number; 
    channels: number;
    uptime: number;
    totalPacketsReceived: number;
    totalPacketsRelayed: number;
    totalBytesTransferred: number;
  } {
    const now = Date.now();
    const startTime = this.globalStats.startTime || now;
    return {
      clients: this.clients.size,
      channels: this.channels.size,
      uptime: Math.floor((now - startTime) / 1000),
      totalPacketsReceived: this.globalStats.totalPacketsReceived || 0,
      totalPacketsRelayed: this.globalStats.totalPacketsRelayed || 0,
      totalBytesTransferred: this.globalStats.totalBytesTransferred || 0,
    };
  }

  /**
   * Get detailed quality stats for a specific client
   */
  getClientStats(clientId: string): QualityStats | null {
    const client = this.clients.get(clientId);
    return client ? { ...client.qualityStats } : null;
  }

  /**
   * Get all clients in a specific channel with their quality stats
   */
  getChannelQuality(channelId: string): { clientId: string; username: string; stats: QualityStats }[] {
    const channelClients = this.channels.get(channelId);
    if (!channelClients) return [];

    const result: { clientId: string; username: string; stats: QualityStats }[] = [];
    for (const clientId of channelClients) {
      const client = this.clients.get(clientId);
      if (client) {
        result.push({
          clientId: client.id,
          username: client.username,
          stats: { ...client.qualityStats },
        });
      }
    }
    return result;
  }
}

export const voiceRelayServer = new VoiceRelayServer();
