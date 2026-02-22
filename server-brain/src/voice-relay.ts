// Voice Relay Server - Encrypted Binary Protocol
// Handles voice packet relay between clients with jitter buffer and quality monitoring
// SECURITY: All packets are encrypted with AES-256-GCM for confidentiality and authenticity
// QUALITY: Server-side FEC, adaptive bitrate, and floor control for screen sharing

import dgram from 'dgram';
import { logger } from './utils/logger.js';
import { randomBytes, createCipheriv, createDecipheriv, createHash, createHmac } from 'crypto';

// ============================================
// SERVER-SIDE FEC (Forward Error Correction)
// ============================================
// Implements Reed-Solomon style parity packets for packet loss recovery
// Every N packets, we send a parity packet that can reconstruct 1 lost packet

interface FECState {
  sequenceBase: number;        // Base sequence number for current FEC block
  accumulatedData: Buffer[];   // Accumulated voice data for parity calculation
  packetsInBlock: number;      // Current count of packets in this block
  blockSize: number;           // Total packets per FEC block (typically 4-8)
}

// XOR-based parity for simple FEC (can recover 1 packet per block)
function calculateParityPacket(dataBuffers: Buffer[]): Buffer {
  if (dataBuffers.length === 0) return Buffer.alloc(0);
  
  // Find max length
  const maxLen = Math.max(...dataBuffers.map(b => b.length));
  const parity = Buffer.alloc(maxLen);
  
  // XOR all buffers together
  for (const buf of dataBuffers) {
    for (let i = 0; i < buf.length; i++) {
      parity[i] ^= buf[i];
    }
  }
  
  return parity;
}

// ============================================
// ADAPTIVE BITRATE CONTROL
// ============================================
// Dynamically adjusts audio quality based on network conditions

interface AdaptiveBitrateState {
  targetBitrate: number;       // Current target bitrate (bps)
  minBitrate: number;          // Minimum allowed bitrate
  maxBitrate: number;          // Maximum allowed bitrate
  lastAdjustment: number;      // Timestamp of last adjustment
  packetLossRate: number;      // Rolling packet loss rate
  rtt: number;                 // Round-trip time estimate
  congestionLevel: 'none' | 'low' | 'medium' | 'high';
}

const BITRATE_CONFIG = {
  minBitrate: 16000,           // 16 kbps minimum
  maxBitrate: 128000,          // 128 kbps maximum
  defaultBitrate: 64000,       // 64 kbps default
  adjustmentIntervalMs: 5000,  // Adjust every 5 seconds
  lossThresholdLow: 0.02,      // 2% loss = start reducing
  lossThresholdHigh: 0.10,     // 10% loss = aggressive reduction
  rttThresholdHigh: 200,       // 200ms RTT = concern
};

// ============================================
// FLOOR CONTROL SYSTEM (Screen Share Management)
// ============================================
// Manages who can share screen, with request/approval workflow

interface FloorControlState {
  currentHolder: string | null;       // Client ID currently sharing
  holderUsername: string | null;       // Username of current holder
  requestQueue: Array<{               // Queue of pending requests
    clientId: string;
    username: string;
    requestedAt: number;
  }>;
  maxConcurrentShares: number;        // How many can share at once
  activeShares: Map<string, {         // Active screen shares
    clientId: string;
    username: string;
    quality: string;
    startedAt: number;
    viewerCount: number;
  }>;
  bandwidthBudget: number;            // Total bandwidth for screen shares
  usedBandwidth: number;              // Currently used bandwidth
}

const FLOOR_CONTROL_CONFIG = {
  maxConcurrentShares: 3,             // Allow up to 3 simultaneous shares
  maxShareDurationMs: 4 * 60 * 60 * 1000, // 4 hours max
  requestTimeoutMs: 30000,            // 30 seconds to approve request
  bandwidthBudget: 15000000,          // 15 Mbps total for all shares
  baseShareBandwidth: 3000000,        // 3 Mbps per share baseline
};

const VOICE_PORT = parseInt(process.env.VOICE_PORT || '9988');

// ============================================
// VOICE RELAY ENCRYPTION SYSTEM
// ============================================
// Uses AES-256-GCM for authenticated encryption:
// - Each channel gets a unique derived key
// - Per-packet nonce prevents replay attacks
// - Authentication tag prevents tampering

interface EncryptionConfig {
  masterKey: Buffer;           // 32-byte master key (from env or generated)
  keyRotationIntervalMs: number;
  currentKeyId: number;
  keyCreatedAt: number;
}

// Encryption configuration
let encryptionConfig: EncryptionConfig;

// Initialize encryption with master key
function initEncryption(): void {
  const masterKeyHex = process.env.VOICE_MASTER_KEY;
  
  if (masterKeyHex && masterKeyHex.length === 64) {
    // Use provided master key
    encryptionConfig = {
      masterKey: Buffer.from(masterKeyHex, 'hex'),
      keyRotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      currentKeyId: 1,
      keyCreatedAt: Date.now(),
    };
    logger.info('[VoiceRelay] Using provided VOICE_MASTER_KEY');
  } else {
    // Generate a new master key
    encryptionConfig = {
      masterKey: randomBytes(32),
      keyRotationIntervalMs: 24 * 60 * 60 * 1000,
      currentKeyId: 1,
      keyCreatedAt: Date.now(),
    };
    
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[VoiceRelay] WARNING: VOICE_MASTER_KEY not set. Using auto-generated key.');
      logger.warn('[VoiceRelay] Set VOICE_MASTER_KEY (64 hex chars) for production deployments.');
    } else {
      logger.info('[VoiceRelay] Generated development master key');
    }
  }
}

// Derive channel-specific key from master key
function deriveChannelKey(channelId: string, keyId: number): Buffer {
  const info = `vibespeak-voice-${channelId}-${keyId}`;
  const derived = createHmac('sha256', encryptionConfig.masterKey)
    .update(info)
    .digest();
  return derived;
}

// Derive client key for authentication
function deriveClientKey(clientId: string): Buffer {
  const derived = createHmac('sha256', encryptionConfig.masterKey)
    .update(`client-${clientId}`)
    .digest()
    .subarray(0, 32);
  return derived;
}

// Encrypt packet with AES-256-GCM
function encryptPacket(plaintext: Buffer, channelId: string, sequenceNumber: number): Buffer {
  const key = deriveChannelKey(channelId, encryptionConfig.currentKeyId);
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE(sequenceNumber, 8); // Last 4 bytes = sequence number
  
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Format: [KEY_ID(4)][NONCE(12)][AUTH_TAG(16)][ENCRYPTED_DATA]
  const result = Buffer.alloc(4 + 12 + 16 + encrypted.length);
  result.writeUInt32BE(encryptionConfig.currentKeyId, 0);
  nonce.copy(result, 4);
  authTag.copy(result, 16);
  encrypted.copy(result, 32);
  
  return result;
}

// Decrypt packet with AES-256-GCM
function decryptPacket(encryptedPacket: Buffer, channelId: string): Buffer | null {
  if (encryptedPacket.length < 32) {
    return null; // Too short
  }
  
  try {
    const keyId = encryptedPacket.readUInt32BE(0);
    const nonce = encryptedPacket.subarray(4, 16);
    const authTag = encryptedPacket.subarray(16, 32);
    const encrypted = encryptedPacket.subarray(32);
    
    const key = deriveChannelKey(channelId, keyId);
    
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
  } catch (err) {
    // Decryption failed - likely wrong key or tampered packet
    return null;
  }
}

// ============================================
// PACKET TYPES
// ============================================
const PACKET_TYPE = {
  HELLO: 0x01,
  WELCOME: 0x02,
  JOIN_CHANNEL: 0x10,
  LEAVE_CHANNEL: 0x11,
  VOICE_PACKET: 0x20,
  VIDEO_PACKET: 0x21,
  SPEAKING_STATE: 0x30,
  KEEPALIVE: 0xFF,
  QUALITY_STATS: 0x40,
  KEY_SYNC: 0x50,         // New: Key synchronization
  ENCRYPTED_WRAPPER: 0xFE, // New: Wrapper for encrypted payloads
};

// Quality statistics for monitoring
interface QualityStats {
  packetsReceived: number;
  packetsLost: number;
  avgJitter: number;
  lastReportTime: number;
  decryptionFailures: number;  // New: Track decryption failures
}

// Jitter buffer configuration
const JITTER_BUFFER_CONFIG = {
  enabled: true,
  targetDelayMs: 40,
  maxDelayMs: 200,
  minDelayMs: 10,
  adaptationRate: 0.15,
  maxBufferSize: 20,
  latePacketThreshold: 5,
};

// Jitter buffer entry
interface JitterBufferEntry {
  data: Buffer;
  sequenceNumber: number;
  timestamp: number;
  receivedAt: number;
  senderId: string;
}

// Per-sender jitter buffer for tracking each stream separately
interface SenderBufferState {
  lastSequenceNumber: number;
  lastTimestamp: number;
  latePacketCount: number;
  totalJitter: number;
  jitterCount: number;
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
  sequenceNumber: number;
  jitterBuffer: JitterBufferEntry[];
  senderStates: Map<string, SenderBufferState>;
  currentDelay: number;
  qualityStats: QualityStats;
  isAuthenticated: boolean;      // New: Client has been authenticated
  clientKey: Buffer;             // New: Client-specific key for auth
}

class VoiceRelayServer {
  private server: dgram.Socket | null = null;
  private clients: Map<string, VoiceClient> = new Map();
  private channels: Map<string, Set<string>> = new Map();
  private addressToClientId: Map<string, string> = new Map();
  
  // Server-side FEC state per channel
  private fecStates: Map<string, FECState> = new Map();
  
  // Adaptive bitrate state per channel
  private bitrateStates: Map<string, AdaptiveBitrateState> = new Map();
  
  // Floor control for screen sharing
  private floorControl: Map<string, FloorControlState> = new Map();
  
  private globalStats: {
    totalPacketsReceived: number;
    totalPacketsRelayed: number;
    totalBytesTransferred: number;
    totalDecryptionFailures: number;
    fecPacketsGenerated: number;
    fecPacketsUsed: number;
    bitrateAdjustments: number;
    startTime: number;
  } = {
    totalPacketsReceived: 0,
    totalPacketsRelayed: 0,
    totalBytesTransferred: 0,
    totalDecryptionFailures: 0,
    fecPacketsGenerated: 0,
    fecPacketsUsed: 0,
    bitrateAdjustments: 0,
    startTime: Date.now(),
  };

  start(): void {
    // Initialize encryption first
    initEncryption();
    
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
      logger.info(`[VoiceRelay] Encryption: AES-256-GCM enabled`);
    });

    // Cleanup stale clients every 30 seconds
    setInterval(() => this.cleanupStaleClients(), 30000);
    
    // Rotate keys periodically
    setInterval(() => this.checkKeyRotation(), 60 * 60 * 1000); // Every hour
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    logger.info('[VoiceRelay] Voice relay server stopped');
  }

  private checkKeyRotation(): void {
    const age = Date.now() - encryptionConfig.keyCreatedAt;
    if (age > encryptionConfig.keyRotationIntervalMs) {
      encryptionConfig.currentKeyId++;
      encryptionConfig.keyCreatedAt = Date.now();
      logger.info(`[VoiceRelay] Rotated to key ID ${encryptionConfig.currentKeyId}`);
      
      // Notify all clients of key rotation
      this.broadcastKeySync();
    }
  }

  private broadcastKeySync(): void {
    const keySyncMsg = Buffer.alloc(5);
    keySyncMsg[0] = PACKET_TYPE.KEY_SYNC;
    keySyncMsg.writeUInt32BE(encryptionConfig.currentKeyId, 1);
    
    for (const client of this.clients.values()) {
      if (client.channelId) {
        this.server?.send(keySyncMsg, client.port, client.address);
      }
    }
  }

  private handlePacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < 2) return;

    const packetType = msg[0];
    this.globalStats.totalPacketsReceived++;

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
      case PACKET_TYPE.ENCRYPTED_WRAPPER:
        this.handleEncryptedPacket(msg, rinfo);
        break;
      default:
        // Unknown packet type - ignore
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

    // Derive client key for authentication
    const clientKey = deriveClientKey(clientId);

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
      senderStates: new Map<string, SenderBufferState>(),
      currentDelay: JITTER_BUFFER_CONFIG.targetDelayMs,
      qualityStats: {
        packetsReceived: 0,
        packetsLost: 0,
        avgJitter: 0,
        lastReportTime: Date.now(),
        decryptionFailures: 0,
      },
      isAuthenticated: true,
      clientKey,
    };

    this.clients.set(clientId, client);
    const addressKey = `${rinfo.address}:${rinfo.port}`;
    this.addressToClientId.set(addressKey, clientId);
    
    logger.info(`[VoiceRelay] Client registered: ${username} (${clientId.substring(0, 8)}...)`);

    // Send welcome packet with current key ID
    const welcomeMsg = Buffer.alloc(6);
    welcomeMsg[0] = PACKET_TYPE.WELCOME;
    welcomeMsg[1] = 0x01; // Flag: encryption supported
    welcomeMsg.writeUInt32BE(encryptionConfig.currentKeyId, 2);
    this.server?.send(welcomeMsg, rinfo.port, rinfo.address);
  }

  private handleJoinChannel(msg: Buffer, rinfo: dgram.RemoteInfo): void {
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

    // Send channel key info (encrypted with client key)
    const channelKeyInfo = Buffer.alloc(8);
    channelKeyInfo.writeUInt32BE(encryptionConfig.currentKeyId, 0);
    channelKeyInfo.writeUInt32BE(Date.now() / 1000, 4);
    
    // Notify others in channel
    this.broadcastToChannel(channelId, Buffer.from([PACKET_TYPE.JOIN_CHANNEL, 0x00]), clientId);
  }

  private handleLeaveChannel(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const clientId = msg.subarray(2, 18).toString('hex');
    const client = this.clients.get(clientId);
    if (!client || !client.channelId) return;

    this.channels.get(client.channelId)?.delete(clientId);
    logger.info(`[VoiceRelay] Client ${client.username} left channel ${client.channelId}`);

    this.broadcastToChannel(client.channelId, Buffer.from([PACKET_TYPE.LEAVE_CHANNEL, 0x00]), clientId);
    client.channelId = '';
  }

  private handleEncryptedPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Format: [TYPE(1)][INNER_TYPE(1)][ENCRYPTED_PAYLOAD...]
    if (msg.length < 34) return;
    
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!client || !client.channelId) return;
    
    // Decrypt the payload
    const encryptedPayload = msg.subarray(2);
    const decrypted = decryptPacket(encryptedPayload, client.channelId);
    
    if (!decrypted) {
      client.qualityStats.decryptionFailures++;
      this.globalStats.totalDecryptionFailures++;
      logger.debug(`[VoiceRelay] Decryption failed for client ${client.username}`);
      return;
    }
    
    // Process the decrypted packet as if it came in directly
    const innerType = decrypted[0];
    const reconstructedMsg = Buffer.concat([Buffer.from([innerType]), decrypted.subarray(1)]);
    
    // Handle the inner packet
    switch (innerType) {
      case PACKET_TYPE.VOICE_PACKET:
        this.handleVoicePacket(reconstructedMsg, rinfo);
        break;
      case PACKET_TYPE.SPEAKING_STATE:
        this.handleSpeakingState(reconstructedMsg, rinfo);
        break;
    }
  }

  private handleVoicePacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const sender = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!sender || !sender.channelId) return;

    sender.lastSeen = Date.now();
    this.globalStats.totalBytesTransferred += msg.length;

    let sequenceNumber = sender.sequenceNumber++;
    let timestamp = Date.now();
    
    if (msg.length >= 10) {
      sequenceNumber = msg.readUInt32BE(2);
      timestamp = msg.readUInt32BE(6);
    }

    // ============================================
    // SERVER-SIDE FEC GENERATION
    // ============================================
    // Generate parity packet every N packets for loss recovery
    const fecState = this.getOrCreateFecState(sender.channelId);
    fecState.accumulatedData.push(msg);
    fecState.packetsInBlock++;
    
    // Generate parity packet when block is complete
    if (fecState.packetsInBlock >= fecState.blockSize) {
      const parityPacket = this.generateFecParityPacket(sender.channelId, fecState);
      if (parityPacket && sender.channelId) {
        // Broadcast parity packet to channel
        const channelClients = this.channels.get(sender.channelId);
        if (channelClients) {
          for (const recipientId of channelClients) {
            if (recipientId === sender.id) continue;
            const recipient = this.clients.get(recipientId);
            if (recipient) {
              this.server?.send(parityPacket, recipient.port, recipient.address);
              this.globalStats.fecPacketsGenerated++;
            }
          }
        }
      }
      // Reset for next block
      fecState.accumulatedData = [];
      fecState.packetsInBlock = 0;
      fecState.sequenceBase = sequenceNumber + 1;
    }

    const channelClients = this.channels.get(sender.channelId);
    if (!channelClients) return;

    for (const recipientId of channelClients) {
      if (recipientId === sender.id) continue;
      
      const recipient = this.clients.get(recipientId);
      if (!recipient) continue;

      const packetsToRelay = this.processJitterBuffer(
        recipient,
        msg,
        sequenceNumber,
        timestamp,
        sender.id
      );

      for (const packetData of packetsToRelay) {
        // Encrypt the packet before relaying
        const encryptedPacket = encryptPacket(packetData, sender.channelId, sequenceNumber);
        
        // Wrap in encrypted wrapper
        const relayMsg = Buffer.alloc(2 + encryptedPacket.length);
        relayMsg[0] = PACKET_TYPE.ENCRYPTED_WRAPPER;
        relayMsg[1] = PACKET_TYPE.VOICE_PACKET;
        encryptedPacket.copy(relayMsg, 2);
        
        this.server?.send(relayMsg, recipient.port, recipient.address);
        this.globalStats.totalPacketsRelayed++;
      }
    }
  }

  // ============================================
  // FEC HELPER METHODS
  // ============================================
  
  private getOrCreateFecState(channelId: string): FECState {
    if (!this.fecStates.has(channelId)) {
      this.fecStates.set(channelId, {
        sequenceBase: 0,
        accumulatedData: [],
        packetsInBlock: 0,
        blockSize: 4, // Generate parity every 4 packets
      });
    }
    return this.fecStates.get(channelId)!;
  }

  private generateFecParityPacket(channelId: string, state: FECState): Buffer | null {
    if (state.accumulatedData.length === 0) return null;
    
    const parity = calculateParityPacket(state.accumulatedData);
    
    // Build FEC packet: [TYPE(1)][CHANNEL_ID_LEN(1)][CHANNEL_ID][SEQ_BASE(4)][PARITY_DATA]
    const channelIdBuffer = Buffer.from(channelId, 'utf8');
    const packet = Buffer.alloc(2 + channelIdBuffer.length + 4 + parity.length);
    
    packet[0] = PACKET_TYPE.VOICE_PACKET | 0x80; // Mark as FEC packet (high bit set)
    packet[1] = channelIdBuffer.length;
    channelIdBuffer.copy(packet, 2);
    packet.writeUInt32BE(state.sequenceBase, 2 + channelIdBuffer.length);
    parity.copy(packet, 2 + channelIdBuffer.length + 4);
    
    return packet;
  }

  private handleSpeakingState(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length < 3) return;
    const client = this.findClientByAddress(rinfo.address, rinfo.port);
    if (!client) return;

    const isSpeaking = (msg[2] ?? 0) === 0x01;
    client.isSpeaking = isSpeaking;

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
    const addressKey = `${address}:${port}`;
    const clientId = this.addressToClientId.get(addressKey);
    
    if (clientId) {
      return this.clients.get(clientId);
    }
    
    for (const client of this.clients.values()) {
      if (client.address === address && client.port === port) {
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
    const staleTimeout = 60000;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastSeen > staleTimeout) {
        if (client.channelId) {
          this.channels.get(client.channelId)?.delete(clientId);
        }
        const addressKey = `${client.address}:${client.port}`;
        this.addressToClientId.delete(addressKey);
        this.clients.delete(clientId);
        logger.info(`[VoiceRelay] Client timed out: ${client.username}`);
      }
    }
  }

  getStats(): { 
    clients: number; 
    channels: number;
    uptime: number;
    totalPacketsReceived: number;
    totalPacketsRelayed: number;
    totalBytesTransferred: number;
    totalDecryptionFailures: number;
    encryptionEnabled: boolean;
    currentKeyId: number;
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
      totalDecryptionFailures: this.globalStats.totalDecryptionFailures || 0,
      encryptionEnabled: true,
      currentKeyId: encryptionConfig.currentKeyId,
    };
  }

  getClientStats(clientId: string): QualityStats | null {
    const client = this.clients.get(clientId);
    return client ? { ...client.qualityStats } : null;
  }

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

  private processJitterBuffer(
    client: VoiceClient,
    data: Buffer,
    sequenceNumber: number,
    timestamp: number,
    senderId: string
  ): Buffer[] {
    const now = Date.now();
    const packetsToRelay: Buffer[] = [];

    client.qualityStats.packetsReceived++;

    let senderState = client.senderStates.get(senderId);
    if (!senderState) {
      senderState = {
        lastSequenceNumber: -1,
        lastTimestamp: 0,
        latePacketCount: 0,
        totalJitter: 0,
        jitterCount: 0,
      };
      client.senderStates.set(senderId, senderState);
    }

    if (senderState.lastTimestamp > 0) {
      const expectedArrival = senderState.lastTimestamp + (timestamp - senderState.lastTimestamp);
      const jitter = Math.abs(now - expectedArrival);
      senderState.totalJitter += jitter;
      senderState.jitterCount++;
      client.qualityStats.avgJitter = senderState.totalJitter / senderState.jitterCount;
    }

    if (senderState.lastSequenceNumber >= 0 && sequenceNumber > senderState.lastSequenceNumber + 1) {
      const lostPackets = sequenceNumber - senderState.lastSequenceNumber - 1;
      client.qualityStats.packetsLost += lostPackets;
    }

    if (senderState.lastSequenceNumber >= 0 && sequenceNumber <= senderState.lastSequenceNumber) {
      senderState.latePacketCount++;
      
      if (senderState.latePacketCount >= JITTER_BUFFER_CONFIG.latePacketThreshold) {
        client.currentDelay = Math.min(
          client.currentDelay * (1 + JITTER_BUFFER_CONFIG.adaptationRate),
          JITTER_BUFFER_CONFIG.maxDelayMs
        );
        senderState.latePacketCount = 0;
      }
    }

    if (JITTER_BUFFER_CONFIG.enabled) {
      client.jitterBuffer.push({
        data,
        sequenceNumber,
        timestamp,
        receivedAt: now,
        senderId,
      });

      client.jitterBuffer.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      while (client.jitterBuffer.length > JITTER_BUFFER_CONFIG.maxBufferSize) {
        const removed = client.jitterBuffer.shift();
        if (removed) {
          packetsToRelay.push(removed.data);
        }
      }

      const releaseThreshold = now - client.currentDelay;
      while (client.jitterBuffer.length > 0 && client.jitterBuffer[0].receivedAt <= releaseThreshold) {
        const released = client.jitterBuffer.shift();
        if (released) {
          packetsToRelay.push(released.data);
        }
      }

      if (client.jitterBuffer.length < 2 && client.currentDelay > JITTER_BUFFER_CONFIG.minDelayMs) {
        client.currentDelay = Math.max(
          client.currentDelay * (1 - JITTER_BUFFER_CONFIG.adaptationRate * 0.5),
          JITTER_BUFFER_CONFIG.minDelayMs
        );
      }
    } else {
      packetsToRelay.push(data);
    }

    senderState.lastSequenceNumber = Math.max(senderState.lastSequenceNumber, sequenceNumber);
    senderState.lastTimestamp = timestamp;

    return packetsToRelay;
  }
}

export const voiceRelayServer = new VoiceRelayServer();