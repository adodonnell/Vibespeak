// Voice Relay Server - Custom Binary Protocol
// Handles voice packet relay between clients

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
};

// Channel management
interface VoiceClient {
  id: string;
  address: string;
  port: number;
  channelId: string;
  username: string;
  isSpeaking: boolean;
  lastSeen: number;
}

class VoiceRelayServer {
  private server: dgram.Socket | null = null;
  private clients: Map<string, VoiceClient> = new Map();
  private channels: Map<string, Set<string>> = new Map(); // channelId -> Set<clientId>

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
    const flags = msg[1];

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
    const usernameLen = msg[18];
    const username = msg.subarray(19, 19 + usernameLen).toString('utf8');

    // Register or update client
    const client: VoiceClient = {
      id: clientId,
      address: rinfo.address,
      port: rinfo.port,
      channelId: '',
      username,
      isSpeaking: false,
      lastSeen: Date.now(),
    };

    this.clients.set(clientId, client);
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
    const channelIdLen = msg[18];
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
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!client) return;

    const isSpeaking = msg[2] === 0x01;
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

  private findClientByAddress(address: string, port: number): VoiceClient | undefined {
    for (const client of this.clients.values()) {
      if (client.address === address && client.port === port) {
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
        this.clients.delete(clientId);
        logger.info(`[VoiceRelay] Client timed out: ${client.username}`);
      }
    }
  }

  getStats(): { clients: number; channels: number } {
    return {
      clients: this.clients.size,
      channels: this.channels.size,
    };
  }
}

export const voiceRelayServer = new VoiceRelayServer();
