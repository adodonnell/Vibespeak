// Real-time WebSocket Client for Disorder
// Handles channel messages, typing indicators, voice channel presence, and screen share

export interface WsMessage {
  type: string;
  from?: string;
  to?: string;
  roomId?: string;
  data?: unknown;
  username?: string;
  messageId?: number;
  content?: string;
}

export interface NewMessageEvent {
  type: 'new-message';
  message: {
    id: number;
    channel_id: number;
    user_id: number;
    content: string;
    created_at: string;
    username: string;
  };
}

export interface MessageUpdatedEvent {
  type: 'message-updated';
  messageId: number;
  content: string;
  edited_at: string;
}

export interface MessageDeletedEvent {
  type: 'message-deleted';
  messageId: number;
}

export interface TypingStartEvent {
  type: 'typing-start';
  channelId: number;
  userId: number;
  username: string;
}

export interface TypingStopEvent {
  type: 'typing-stop';
  channelId: number;
  userId: number;
  username: string;
}

export interface UserPresenceEvent {
  type: 'user-joined' | 'user-left';
  from: string;
  username: string;
  roomId: string;
}

type MessageHandler = (data: NewMessageEvent['message']) => void;
type MessageUpdateHandler = (data: { messageId: number; content: string; edited_at: string }) => void;
type MessageDeleteHandler = (data: { messageId: number }) => void;
type TypingHandler = (data: { channelId: number; userId: number; username: string }) => void;
type PresenceHandler = (data: { userId: string; username: string; roomId: string; type: 'joined' | 'left' }) => void;
type VoiceChannelUpdateHandler = (channels: { channelId: string; users: { clientId: string; username: string }[] }[]) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  /** Set to true before calling ws.close() to suppress auto-reconnect */
  private intentionalDisconnect = false;
  private messageHandlers: Set<MessageHandler> = new Set();
  private messageUpdateHandlers: Set<MessageUpdateHandler> = new Set();
  private messageDeleteHandlers: Set<MessageDeleteHandler> = new Set();
  private typingStartHandlers: Set<TypingHandler> = new Set();
  private typingStopHandlers: Set<TypingHandler> = new Set();
  private presenceHandlers: Set<PresenceHandler> = new Set();
  private voiceChannelUpdateHandlers: Set<VoiceChannelUpdateHandler> = new Set();
  private currentRoom: string | null = null;
  private username: string | null = null;
  private clientId: string | null = null;
  /** Rooms queued while the socket is still CONNECTING — flushed on open */
  private pendingRoomJoins: string[] = [];

  constructor() {
    // URL is computed fresh on each connect() call from localStorage / env
    this.url = 'ws://localhost:3002';
  }

  /**
   * Connect to the WebSocket server.
   * Returns immediately if already open or connecting (prevents storm on React StrictMode).
   */
  connect(username: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Guard: already open or mid-handshake — no second socket
      if (
        this.ws?.readyState === WebSocket.OPEN ||
        this.ws?.readyState === WebSocket.CONNECTING
      ) {
        resolve(this.clientId ?? '');
        return;
      }

      this.intentionalDisconnect = false;
      this.username = username;

      // Recompute WS URL fresh on each connect (picks up ServerSetupScreen changes)
      try {
        this.url =
          localStorage.getItem('disorder:ws-url') ||
          (import.meta.env.VITE_WS_URL as string | undefined) ||
          'ws://localhost:3002';
      } catch { /* localStorage unavailable — keep default */ }

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Always join the global room so we receive voice updates + broadcasts
        this.joinRoom('global', username);

        // Flush any rooms that were requested while we were still connecting
        const pending = this.pendingRoomJoins.splice(0);
        for (const roomId of pending) {
          this.joinRoom(roomId);
        }

        resolve(this.clientId ?? '');
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnected = false;
        if (!this.intentionalDisconnect) {
          this.attemptReconnect();
        }
        this.intentionalDisconnect = false;
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        reject(err);
      };
    });
  }

  /**
   * Disconnect intentionally — suppresses auto-reconnect.
   * Call this in React useEffect cleanup to avoid connection storms.
   */
  disconnect(): void {
    if (this.ws) {
      this.intentionalDisconnect = true;
      this.reconnectAttempts = 0;
      
      // Only close if OPEN — closing CONNECTING sockets causes browser warnings
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      // For CONNECTING sockets, just null them out - they'll garbage collect
      // when the connection fails or succeeds
      this.ws = null;
      this.isConnected = false;
      this.pendingRoomJoins = []; // Clear any pending joins
    }
  }

  /**
   * Join a named room (channel ID or 'global').
   * If the socket is still opening, the join is queued and flushed once connected.
   * Sends the server a join message so it can route broadcasts to this socket.
   */
  joinRoom(roomId: string, username?: string): void {
    if (!this.ws) {
      console.warn('[WebSocket] Cannot join room - no socket');
      return;
    }

    if (this.ws.readyState === WebSocket.CONNECTING) {
      // Socket is mid-handshake — defer until onopen fires
      if (!this.pendingRoomJoins.includes(roomId)) {
        this.pendingRoomJoins.push(roomId);
      }
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot join room - socket closed');
      return;
    }

    this.currentRoom = roomId;
    this.ws.send(JSON.stringify({
      type: 'join',
      roomId,
      username: username || this.username,
    }));
  }

  /**
   * Leave the current room.
   */
  leaveRoom(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'leave' }));
    this.currentRoom = null;
  }

  /**
   * Switch to a text channel room so broadcastToRoom() reaches this client.
   * Called whenever selectedChannelId changes in the UI.
   */
  joinChannelRoom(channelId: number): void {
    this.joinRoom(channelId.toString());
  }

  /**
   * Send typing-start indicator to the current channel room.
   */
  sendTypingStart(channelId: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'typing-start',
      channelId,
      username: this.username,
    }));
  }

  /**
   * Send typing-stop indicator.
   */
  sendTypingStop(channelId: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'typing-stop',
      channelId,
      username: this.username,
    }));
  }

  /** Subscribe to new messages (returns unsubscribe fn). */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Subscribe to message edits. */
  onMessageUpdated(handler: MessageUpdateHandler): () => void {
    this.messageUpdateHandlers.add(handler);
    return () => this.messageUpdateHandlers.delete(handler);
  }

  /** Subscribe to message deletions. */
  onMessageDeleted(handler: MessageDeleteHandler): () => void {
    this.messageDeleteHandlers.add(handler);
    return () => this.messageDeleteHandlers.delete(handler);
  }

  /** Subscribe to typing-start events. */
  onTypingStart(handler: TypingHandler): () => void {
    this.typingStartHandlers.add(handler);
    return () => this.typingStartHandlers.delete(handler);
  }

  /** Subscribe to typing-stop events. */
  onTypingStop(handler: TypingHandler): () => void {
    this.typingStopHandlers.add(handler);
    return () => this.typingStopHandlers.delete(handler);
  }

  /** Subscribe to user presence events. */
  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  /**
   * Subscribe to voice channel occupancy updates.
   * Fired by the server whenever anyone joins or leaves a voice channel.
   */
  onVoiceChannelUpdate(handler: VoiceChannelUpdateHandler): () => void {
    this.voiceChannelUpdateHandlers.add(handler);
    return () => this.voiceChannelUpdateHandlers.delete(handler);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private handleMessage(message: WsMessage): void {
    switch (message.type) {
      case 'new-message':
        if (message.data) {
          const msg = message.data as NewMessageEvent['message'];
          this.messageHandlers.forEach(h => h(msg));
        }
        break;

      case 'message-updated':
        this.messageUpdateHandlers.forEach(h => h({
          messageId: message.messageId!,
          content: message.content!,
          edited_at: new Date().toISOString(),
        }));
        break;

      case 'message-deleted':
        this.messageDeleteHandlers.forEach(h => h({ messageId: message.messageId! }));
        break;

      case 'typing-start':
        this.typingStartHandlers.forEach(h => h({
          channelId: parseInt(message.roomId || '0'),
          userId: parseInt(message.from?.replace('user_', '') || '0'),
          username: message.username || 'Unknown',
        }));
        break;

      case 'typing-stop':
        this.typingStopHandlers.forEach(h => h({
          channelId: parseInt(message.roomId || '0'),
          userId: parseInt(message.from?.replace('user_', '') || '0'),
          username: message.username || 'Unknown',
        }));
        break;

      case 'user-joined':
        this.presenceHandlers.forEach(h => h({
          userId: message.from!,
          username: message.username || 'Unknown',
          roomId: message.roomId || '',
          type: 'joined',
        }));
        break;

      case 'user-left':
        this.presenceHandlers.forEach(h => h({
          userId: message.from!,
          username: message.username || 'Unknown',
          roomId: message.roomId || '',
          type: 'left',
        }));
        break;

      case 'room-joined':
        if (message.data && typeof message.data === 'object' && 'users' in message.data) {
          console.log('[WebSocket] Joined room, current users:', message.data);
        }
        break;

      case 'voice-channel-update': {
        // Server may wrap the channels array in `data` or send at top level
        if (message.data && Array.isArray(message.data)) {
          this.voiceChannelUpdateHandlers.forEach(h =>
            h(message.data as { channelId: string; users: { clientId: string; username: string }[] }[])
          );
        } else {
          const raw = message as unknown as {
            channels: { channelId: string; users: { clientId: string; username: string }[] }[];
          };
          if (raw.channels) {
            this.voiceChannelUpdateHandlers.forEach(h => h(raw.channels));
          }
        }
        break;
      }

      case 'pong':
        // Heartbeat response — no action needed
        break;

      default:
        // Suppress noisy unknown-type logs in production
        if (import.meta.env.DEV) {
          console.log('[WebSocket] Unknown message type:', message.type, message);
        }
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (!this.isConnected && !this.intentionalDisconnect && this.username) {
        this.connect(this.username).catch(err => {
          console.error('[WebSocket] Reconnection failed:', err);
        });
      }
    }, delay);
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get room(): string | null {
    return this.currentRoom;
  }
}

// Singleton — shared across the entire app lifetime
export const realtimeClient = new RealtimeClient();
