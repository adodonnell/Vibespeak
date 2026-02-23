import { WebSocketServer, WebSocket } from 'ws';
import { logger } from './utils/logger.js';
import { userService } from './api/users.js';
import { verifyToken } from './auth.js';
import { createSecureContext } from 'tls';
import { readFileSync, existsSync } from 'fs';

interface SignalingMessage {
  type: 'auth' | 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'user-joined' | 'user-left' | 'ping' | 'pong' | 'new-message' | 'message-updated' | 'message-deleted' | 'typing-start' | 'typing-stop' | 'screen-share-start' | 'screen-share-stop';
  token?: string;  // JWT token for authentication
  from?: string;
  to?: string;
  roomId?: string;
  data?: unknown;
  username?: string;
  messageId?: number;
  content?: string;
  quality?: string;
}

// Event handlers for real-time message updates
type MessageEventHandler = (data: { messageId: number; channelId: number; content: string; userId: number; username: string }) => void;
type TypingHandler = (data: { channelId: number; userId: number; username: string; isTyping: boolean }) => void;

interface Room {
  clients: Map<string, WebSocket>;
  usernames: Map<string, string>; // clientId -> username
}

// Generate unique ID using crypto
function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `user_${timestamp}_${randomPart}`;
}

export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private rooms: Map<string, Room> = new Map();
  private clientRooms: Map<WebSocket, string> = new Map();
  private clientIds: Map<WebSocket, string> = new Map();
  private clientUsernames: Map<WebSocket, string> = new Map(); // Track usernames
  private clientUserIds: Map<WebSocket, number> = new Map(); // Track database user IDs for presence
  private clientAuthenticated: Map<WebSocket, boolean> = new Map(); // Track auth status
  private pingIntervals: Map<WebSocket, NodeJS.Timeout> = new Map();
  private pingTimeouts: Map<WebSocket, NodeJS.Timeout> = new Map();
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 5000; // 5 seconds
  private readonly AUTH_TIMEOUT = 10000; // 10 seconds to authenticate after connection

  start(port: number = 3002): void {
    this.wss = new WebSocketServer({ port });
    
    logger.info(`WebSocket signaling server running on port ${port}`);
    
    // Reset all users to offline on startup (they'll reconnect and go online)
    // Only do this if database is available
    (async () => {
      try {
        const { isDbAvailable, query } = await import('./db/database.js');
        if (isDbAvailable()) {
          await query("UPDATE users SET status = 'offline'");
          logger.info('Reset all user statuses to offline');
        } else {
          logger.info('Database not available - skipping user status reset');
        }
      } catch (err) {
        logger.warn('Could not reset user statuses (database may not be available)');
      }
    })();

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = generateClientId();
      this.clientIds.set(ws, clientId);
      this.clientAuthenticated.set(ws, false); // Start as unauthenticated
      logger.info(`Client connected: ${clientId}`);

      // Set auth timeout - disconnect if not authenticated within timeout period
      const authTimeout = setTimeout(() => {
        if (!this.clientAuthenticated.get(ws)) {
          logger.warn(`Client ${clientId} failed to authenticate within ${this.AUTH_TIMEOUT}ms, disconnecting`);
          ws.send(JSON.stringify({ type: 'auth-required', error: 'Authentication required' }));
          ws.close(4001, 'Authentication timeout');
        }
      }, this.AUTH_TIMEOUT);

      // Store timeout so we can clear it on auth success
      ws.once('close', () => clearTimeout(authTimeout));

      // Start heartbeat for this connection
      this.startHeartbeat(ws);

      ws.on('message', (data: Buffer) => {
        try {
          const message: SignalingMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (err) {
          logger.error('Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        logger.error('WebSocket error:', err);
        this.handleDisconnect(ws);
      });

      // Handle pong response
      ws.on('pong', () => {
        // Clear the ping timeout since we received a response
        this.clearPingTimeout(ws);
      });
    });

    this.wss.on('error', (err) => {
      logger.error('WebSocket server error:', err);
    });
  }

  private startHeartbeat(ws: WebSocket): void {
    // Clear any existing interval
    this.stopHeartbeat(ws);

    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
          // Set timeout to disconnect if pong is not received
          this.setPingTimeout(ws);
        } catch (err) {
          logger.error('Failed to send ping:', err);
          this.handleDisconnect(ws);
        }
      } else {
        this.stopHeartbeat(ws);
      }
    }, this.PING_INTERVAL);

    this.pingIntervals.set(ws, interval);
  }

  private setPingTimeout(ws: WebSocket): void {
    // Clear any existing timeout
    this.clearPingTimeout(ws);

    const timeout = setTimeout(() => {
      logger.warn(`Client ${this.clientIds.get(ws)} did not respond to ping, disconnecting`);
      this.handleDisconnect(ws);
    }, this.PING_TIMEOUT);

    this.pingTimeouts.set(ws, timeout);
  }

  private clearPingTimeout(ws: WebSocket): void {
    const timeout = this.pingTimeouts.get(ws);
    if (timeout) {
      clearTimeout(timeout);
      this.pingTimeouts.delete(ws);
    }
  }

  private stopHeartbeat(ws: WebSocket): void {
    const interval = this.pingIntervals.get(ws);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(ws);
    }
    this.clearPingTimeout(ws);
  }

  /**
   * Handle authentication message - validates JWT token and marks client as authenticated.
   * This is the ONLY message type allowed before authentication is complete.
   */
  private handleAuth(ws: WebSocket, message: SignalingMessage): void {
    const clientId = this.clientIds.get(ws);

    // Check if token is provided
    if (!message.token) {
      logger.warn(`Client ${clientId} attempted auth without token`);
      ws.send(JSON.stringify({ type: 'auth-failed', error: 'Token required' }));
      ws.close(4002, 'Token required');
      return;
    }

    // Verify the JWT token
    const user = verifyToken(message.token);
    if (!user) {
      logger.warn(`Client ${clientId} provided invalid token`);
      ws.send(JSON.stringify({ type: 'auth-failed', error: 'Invalid or expired token' }));
      ws.close(4003, 'Invalid token');
      return;
    }

    // Mark as authenticated and store user info
    this.clientAuthenticated.set(ws, true);
    this.clientUsernames.set(ws, user.username);
    if (user.id) {
      this.clientUserIds.set(ws, user.id);
    }

    logger.info(`Client ${clientId} authenticated as user ${user.username} (id: ${user.id})`);

    // Send success response
    ws.send(JSON.stringify({
      type: 'auth-success',
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name
      }
    }));

    // Update user status to online in database
    (async () => {
      try {
        const { isDbAvailable } = await import('./db/database.js');
        if (isDbAvailable()) {
          await userService.updateStatus(user.id, 'online');
          logger.debug(`User ${user.id} (${user.username}) set to online`);
        }
      } catch (err) {
        logger.warn('Could not update user online status');
      }
    })();
  }

  private handleMessage(ws: WebSocket, message: SignalingMessage): void {
    const clientId = this.clientIds.get(ws);

    // Handle authentication first (allowed before authenticated)
    if (message.type === 'auth') {
      this.handleAuth(ws, message);
      return;
    }

    // Check authentication for all other message types
    if (!this.clientAuthenticated.get(ws)) {
      logger.warn(`Unauthenticated client ${clientId} attempted ${message.type}`);
      ws.send(JSON.stringify({ type: 'auth-required', error: 'Authentication required' }));
      return;
    }

    // Input validation for message types that require specific fields
    switch (message.type) {
      case 'join':
        // Validate roomId - must be a safe string
        if (message.roomId && typeof message.roomId !== 'string') {
          logger.warn('Invalid roomId type received');
          return;
        }
        // Sanitize roomId - allow alphanumeric, dash, underscore, and spaces (for room names like "raid party")
        // Also allow length up to 128 characters
        if (message.roomId && !/^[a-zA-Z0-9_ -]{1,128}$/.test(message.roomId)) {
          logger.warn('Invalid roomId format received:', message.roomId);
          return;
        }
        // Validate username if provided - safe characters only
        if (message.username && typeof message.username !== 'string') {
          logger.warn('Invalid username type received');
          return;
        }
        if (message.username && !/^[a-zA-Z0-9_]{1,32}$/.test(message.username)) {
          logger.warn('Invalid username format received');
          return;
        }
        // Store username if provided and set user online
        if (message.username) {
          this.clientUsernames.set(ws, message.username);
          logger.info(`User "${message.username}" connecting as ${clientId}`);
          
          // Look up user in database and set online (only if DB is available)
          (async () => {
            try {
              const { isDbAvailable } = await import('./db/database.js');
              if (!isDbAvailable()) {
                logger.debug('Database not available - skipping user online status update');
                return;
              }
              const user = await userService.getUserByUsername(message.username!);
              if (user) {
                this.clientUserIds.set(ws, user.id);
                await userService.updateStatus(user.id, 'online');
                logger.debug(`User ${user.id} (${message.username}) set to online`);
              }
            } catch (err) {
              logger.warn('Could not update user online status (database may not be available)');
            }
          })();
        }
        this.handleJoin(ws, message.roomId || 'default', clientId!);
        break;
      case 'leave':
        this.handleLeave(ws);
        break;
      case 'offer':
      case 'answer':
        // Validate signaling data exists
        if (!message.data) {
          logger.warn(`Invalid ${message.type} - no data provided`);
          return;
        }
        this.handleSignaling(ws, message);
        break;
      case 'ice-candidate':
        // Validate target client ID
        if (!message.to || typeof message.to !== 'string') {
          logger.warn('Invalid ice-candidate - no valid target');
          return;
        }
        this.handleSignaling(ws, message);
        break;

      case 'screen-share-start':
        // Handle screen share start - broadcast to room
        this.broadcastScreenShare(ws, message, true);
        break;

      case 'screen-share-stop':
        // Handle screen share stop - broadcast to room
        this.broadcastScreenShare(ws, message, false);
        break;

      default:
        logger.warn(`Unknown message type received: ${message.type}`);
    }
  }

  private broadcastScreenShare(ws: WebSocket, message: SignalingMessage, isStarting: boolean): void {
    const roomId = this.clientRooms.get(ws);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const fromId = this.clientIds.get(ws);
    const fromUsername = this.clientUsernames.get(ws);

    // Broadcast to all other users in the room
    room.clients.forEach((client, id) => {
      if (id !== fromId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: isStarting ? 'screen-share-start' : 'screen-share-stop',
          from: fromId,
          username: fromUsername,
          roomId,
          quality: message.quality,
        }));
      }
    });
  }

  private handleJoin(ws: WebSocket, roomId: string, clientId: string): void {
    // Leave current room if in one
    const currentRoomId = this.clientRooms.get(ws);
    if (currentRoomId) {
      this.handleLeave(ws);
    }

    // Create room if doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { clients: new Map(), usernames: new Map() });
    }

    const room = this.rooms.get(roomId)!;
    room.clients.set(clientId, ws);
    
    // Store username
    const username = this.clientUsernames.get(ws) || clientId;
    room.usernames.set(clientId, username);
    
    this.clientRooms.set(ws, roomId);

    logger.info(`Client ${clientId} joined room ${roomId}`);

    // Notify others in room — send the NEW joiner's username (not the existing user's)
    const joinerUsername = room.usernames.get(clientId) || clientId;
    room.clients.forEach((client, id) => {
      if (id !== clientId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'user-joined',
          from: clientId,
          username: joinerUsername,
          roomId
        }));
      }
    });

    // Send room info to joiner — include usernames for existing users
    ws.send(JSON.stringify({
      type: 'room-joined',
      roomId,
      users: Array.from(room.clients.keys())
        .filter(id => id !== clientId)
        .map(id => ({ id, username: room.usernames.get(id) || id })),
    }));

    // Broadcast updated voice channel state to all 'global' observers
    // so the channel list updates in real-time for everyone, not just room members
    if (roomId !== 'global') {
      this.broadcastVoiceState();
    }
  }

  private handleLeave(ws: WebSocket): void {
    const roomId = this.clientRooms.get(ws);
    const clientId = this.clientIds.get(ws);

    if (!roomId || !clientId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.clients.delete(clientId);
      room.usernames.delete(clientId);
      
      // Notify others
      room.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'user-left',
            from: clientId,
            username: this.clientUsernames.get(ws),
            roomId
          }));
        }
      });

      // Clean up empty rooms
      if (room.clients.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    this.clientRooms.delete(ws);
    logger.info(`Client ${clientId} left room ${roomId}`);

    // Broadcast updated voice channel state to global observers when someone leaves
    if (roomId !== 'global') {
      this.broadcastVoiceState();
    }
  }

  private handleSignaling(ws: WebSocket, message: SignalingMessage): void {
    const roomId = this.clientRooms.get(ws);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const fromId = this.clientIds.get(ws);
    const targetId = message.to;

    if (targetId) {
      // Send to specific client
      const targetClient = room.clients.get(targetId);
      if (targetClient && targetClient.readyState === WebSocket.OPEN) {
        targetClient.send(JSON.stringify({
          ...message,
          from: fromId
        }));
      }
    } else {
      // Broadcast to all in room
      room.clients.forEach((client, id) => {
        if (id !== fromId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            ...message,
            from: fromId
          }));
        }
      });
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    // Stop heartbeat for this connection
    this.stopHeartbeat(ws);
    
    // Set user offline in database before cleanup (only if DB is available)
    const userId = this.clientUserIds.get(ws);
    const username = this.clientUsernames.get(ws);
    if (userId) {
      (async () => {
        try {
          const { isDbAvailable } = await import('./db/database.js');
          if (!isDbAvailable()) {
            logger.debug('Database not available - skipping user offline status update');
            return;
          }
          await userService.updateStatus(userId, 'offline');
          logger.debug(`User ${userId} (${username}) set to offline`);
        } catch (err) {
          logger.warn('Could not update user offline status (database may not be available)');
        }
      })();
    }
    
    this.handleLeave(ws);
    const clientId = this.clientIds.get(ws);
    if (clientId) {
      logger.info(`Client disconnected: ${clientId}`);
      this.clientIds.delete(ws);
    }
    this.clientUsernames.delete(ws);
    this.clientUserIds.delete(ws);
    
    // Clean up all maps to prevent memory leaks
    this.pingIntervals.delete(ws);
    this.pingTimeouts.delete(ws);
    this.clientRooms.delete(ws);
  }

  // Cleanup method for graceful shutdown - clears all memory
  cleanup(): void {
    // Stop all heartbeats
    this.pingIntervals.forEach((interval, ws) => {
      clearInterval(interval);
    });
    this.pingIntervals.clear();
    
    this.pingTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.pingTimeouts.clear();
    
    // Clear all client tracking maps
    this.clientIds.clear();
    this.clientUsernames.clear();
    this.clientUserIds.clear();
    this.clientRooms.clear();
    
    // Clear all rooms
    this.rooms.clear();
    
    logger.info('WebSocket server memory cleaned up');
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      logger.info('WebSocket server stopped');
    }
  }

  // Get users in a specific voice channel room
  getRoomUsers(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.clients.keys());
  }

  // Get all rooms and their users with usernames
  getAllRooms(): { roomId: string; users: { clientId: string; username: string }[] }[] {
    const result: { roomId: string; users: { clientId: string; username: string }[] }[] = [];
    this.rooms.forEach((room, roomId) => {
      const users: { clientId: string; username: string }[] = [];
      room.clients.forEach((_, clientId) => {
        users.push({
          clientId,
          username: room.usernames.get(clientId) || clientId
        });
      });
      result.push({ roomId, users });
    });
    return result;
  }

  // Broadcast a message to all clients in a specific room (for real-time chat)
  broadcastToRoom(roomId: string, message: object): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Broadcast current voice channel state to ALL connected clients.
  // We cannot restrict this to the 'global' room because joinChannelRoom()
  // moves clients out of 'global' into their current text-channel room.
  private broadcastVoiceState(): void {
    // Collect named (voice) rooms only — skip 'global' and numeric text-channel rooms
    const voiceChannels: { channelId: string; users: { clientId: string; username: string }[] }[] = [];
    this.rooms.forEach((room, roomId) => {
      if (roomId === 'global') return;
      // Text-channel rooms use their numeric DB id as the roomId — skip them
      if (/^\d+$/.test(roomId)) return;
      const users: { clientId: string; username: string }[] = [];
      room.clients.forEach((_, clientId) => {
        users.push({ clientId, username: room.usernames.get(clientId) || clientId });
      });
      voiceChannels.push({ channelId: roomId, users });
    });

    const payload = JSON.stringify({ type: 'voice-channel-update', channels: voiceChannels });
    // Broadcast to every connected WebSocket regardless of which room it's in
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // Broadcast to all connected clients (global notifications)
  broadcastToAll(message: object): void {
    const messageStr = JSON.stringify(message);
    this.wss?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Send a message to a specific user by their user ID (for DMs)
  broadcastToUser(userId: number, message: object): boolean {
    const messageStr = JSON.stringify(message);
    let sent = false;
    
    // Find all WebSocket connections for this user ID
    this.clientUserIds.forEach((id, ws) => {
      if (id === userId && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sent = true;
      }
    });
    
    return sent;
  }

  // ============================================
  // SCREEN SHARE MANAGEMENT WITH BANDWIDTH BUDGET
  // ============================================
  // Enforces bandwidth limits per channel to prevent network saturation

  // Bandwidth configuration
  private readonly SCREEN_SHARE_CONFIG = {
    maxConcurrentShares: 3,
    bandwidthBudget: 15000000,          // 15 Mbps total budget per channel
    qualityBitrates: {
      '1080p60': 5000000,               // 5 Mbps
      '1080p30': 3500000,               // 3.5 Mbps
      '720p60': 2500000,                // 2.5 Mbps
      '720p30': 1500000,                // 1.5 Mbps
      '480p30': 800000,                 // 0.8 Mbps
    },
    maxShareDurationMs: 4 * 60 * 60 * 1000, // 4 hours
  };

  // Track active screen shares per channel with bandwidth tracking
  private activeScreenShares: Map<string, Map<string, { 
    clientId: string; 
    username: string; 
    startedAt: number;
    quality: string;
    estimatedBandwidth: number;
  }>> = new Map();

  /**
   * Get active screen shares for a channel
   */
  getActiveScreenShares(channelId: number): Array<{
    clientId: string;
    username: string;
    startedAt: number;
    quality: string;
    estimatedBandwidth: number;
  }> {
    const channelShares = this.activeScreenShares.get(channelId.toString());
    if (!channelShares) return [];
    
    // Filter out expired shares (over 4 hours)
    const now = Date.now();
    const validShares = Array.from(channelShares.values()).filter(share => 
      now - share.startedAt < this.SCREEN_SHARE_CONFIG.maxShareDurationMs
    );
    
    return validShares;
  }

  /**
   * Calculate total bandwidth used by screen shares in a channel
   */
  private getChannelBandwidthUsage(channelId: string): number {
    const channelShares = this.activeScreenShares.get(channelId);
    if (!channelShares) return 0;
    
    let totalBandwidth = 0;
    const now = Date.now();
    
    channelShares.forEach((share) => {
      // Only count shares that haven't expired
      if (now - share.startedAt < this.SCREEN_SHARE_CONFIG.maxShareDurationMs) {
        totalBandwidth += share.estimatedBandwidth;
      }
    });
    
    return totalBandwidth;
  }

  /**
   * Get estimated bandwidth for a quality level
   */
  private getQualityBandwidth(quality: string): number {
    return this.SCREEN_SHARE_CONFIG.qualityBitrates[quality as keyof typeof this.SCREEN_SHARE_CONFIG.qualityBitrates] 
      || this.SCREEN_SHARE_CONFIG.qualityBitrates['720p30'];
  }

  /**
   * Find the best quality that fits within remaining bandwidth budget
   */
  private getBestQualityForBudget(remainingBudget: number): string {
    const qualities = ['1080p60', '1080p30', '720p60', '720p30', '480p30'] as const;
    
    for (const quality of qualities) {
      const bitrate = this.SCREEN_SHARE_CONFIG.qualityBitrates[quality];
      if (bitrate <= remainingBudget) {
        return quality;
      }
    }
    
    return '480p30'; // Minimum quality
  }

  /**
   * Register a screen share start
   */
  registerScreenShareStart(channelId: string, clientId: string, username: string, quality: string = '1080p60'): {
    success: boolean;
    assignedQuality: string;
    maxBitrate: number;
    message: string;
  } {
    if (!this.activeScreenShares.has(channelId)) {
      this.activeScreenShares.set(channelId, new Map());
    }
    
    const channelShares = this.activeScreenShares.get(channelId)!;
    const currentBandwidth = this.getChannelBandwidthUsage(channelId);
    const requestedBitrate = this.getQualityBandwidth(quality);
    const remainingBudget = this.SCREEN_SHARE_CONFIG.bandwidthBudget - currentBandwidth;
    
    // Check if we have any budget left
    if (remainingBudget <= this.SCREEN_SHARE_CONFIG.qualityBitrates['480p30']) {
      logger.warn(`[Signaling] Screen share rejected - bandwidth budget exhausted in channel ${channelId}`);
      return {
        success: false,
        assignedQuality: quality,
        maxBitrate: 0,
        message: 'Channel bandwidth budget exhausted. Please wait for a screen share to stop.'
      };
    }
    
    // Find best quality that fits budget
    const assignedQuality = requestedBitrate <= remainingBudget 
      ? quality 
      : this.getBestQualityForBudget(remainingBudget);
    const assignedBitrate = this.getQualityBandwidth(assignedQuality);
    
    channelShares.set(clientId, {
      clientId,
      username,
      startedAt: Date.now(),
      quality: assignedQuality,
      estimatedBandwidth: assignedBitrate
    });
    
    logger.info(`[Signaling] Screen share started by ${username} in channel ${channelId} at ${assignedQuality} (${(assignedBitrate / 1000000).toFixed(2)} Mbps)`);
    
    return {
      success: true,
      assignedQuality,
      maxBitrate: assignedBitrate,
      message: `Screen share started at ${assignedQuality}`
    };
  }

  /**
   * Register a screen share stop
   */
  registerScreenShareStop(channelId: string, clientId: string): void {
    const channelShares = this.activeScreenShares.get(channelId);
    if (channelShares) {
      const share = channelShares.get(clientId);
      if (share) {
        logger.info(`[Signaling] Screen share stopped for ${share.username} in channel ${channelId} (freed ${(share.estimatedBandwidth / 1000000).toFixed(2)} Mbps)`);
      }
      channelShares.delete(clientId);
      if (channelShares.size === 0) {
        this.activeScreenShares.delete(channelId);
      }
    }
  }

  /**
   * Request floor for screen sharing (returns whether granted with bandwidth info)
   */
  requestScreenShareFloor(channelId: string, clientId: string, username: string, desiredQuality: string = '1080p60'): {
    granted: boolean;
    position?: number;
    assignedQuality?: string;
    maxBitrate?: number;
    message: string;
  } {
    const channelShares = this.activeScreenShares.get(channelId);
    const currentCount = channelShares ? channelShares.size : 0;
    
    // Check max concurrent shares
    if (currentCount >= this.SCREEN_SHARE_CONFIG.maxConcurrentShares) {
      return {
        granted: false,
        position: 1, // Would implement queue in production
        message: `Maximum screen shares (${this.SCREEN_SHARE_CONFIG.maxConcurrentShares}) reached. Please wait.`
      };
    }
    
    // Check bandwidth budget
    const currentBandwidth = this.getChannelBandwidthUsage(channelId);
    const remainingBudget = this.SCREEN_SHARE_CONFIG.bandwidthBudget - currentBandwidth;
    
    if (remainingBudget <= this.SCREEN_SHARE_CONFIG.qualityBitrates['480p30']) {
      return {
        granted: false,
        message: `Channel bandwidth budget exhausted (${(currentBandwidth / 1000000).toFixed(2)}/${(this.SCREEN_SHARE_CONFIG.bandwidthBudget / 1000000).toFixed(2)} Mbps used)`
      };
    }
    
    // Grant with best available quality
    const assignedQuality = this.getQualityBandwidth(desiredQuality) <= remainingBudget
      ? desiredQuality
      : this.getBestQualityForBudget(remainingBudget);
    const assignedBitrate = this.getQualityBandwidth(assignedQuality);
    
    return {
      granted: true,
      assignedQuality,
      maxBitrate: assignedBitrate,
      message: `Screen share granted at ${assignedQuality}`
    };
  }

  /**
   * Get bandwidth stats for a channel (for monitoring)
   */
  getChannelBandwidthStats(channelId: string): {
    used: number;
    budget: number;
    remaining: number;
    shareCount: number;
    shares: Array<{ username: string; quality: string; bandwidth: number }>;
  } {
    const channelShares = this.activeScreenShares.get(channelId);
    const used = this.getChannelBandwidthUsage(channelId);
    
    const shares: Array<{ username: string; quality: string; bandwidth: number }> = [];
    if (channelShares) {
      channelShares.forEach((share) => {
        shares.push({
          username: share.username,
          quality: share.quality,
          bandwidth: share.estimatedBandwidth
        });
      });
    }
    
    return {
      used,
      budget: this.SCREEN_SHARE_CONFIG.bandwidthBudget,
      remaining: this.SCREEN_SHARE_CONFIG.bandwidthBudget - used,
      shareCount: channelShares ? channelShares.size : 0,
      shares
    };
  }
}

export const signalingServer = new SignalingServer();
