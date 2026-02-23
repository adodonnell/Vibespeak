// In-memory fallback storage when database is unavailable
// Optimized with O(1) index lookups for all common queries
// Note: password_hash is stored only for DB compatibility - not used for auth (TeamSpeak-style)

interface StoredUser {
  id: number;
  username: string;
  password_hash: string;  // Random value, not used for authentication
  display_name: string | null;
  status: string;
  created_at: Date;
}

interface StoredChannel {
  id: number;
  server_id: number;
  name: string;
  type: string;
  position: number;
}

interface StoredMessage {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  created_at: Date;
  username?: string;
}

class MemoryStore {
  // Primary storage (by ID)
  private users: Map<number, StoredUser> = new Map();
  private channels: Map<number, StoredChannel> = new Map();
  private messages: Map<number, StoredMessage> = new Map();
  
  // O(1) Index lookups
  private usersByUsername: Map<string, StoredUser> = new Map();
  private messagesByChannel: Map<number, StoredMessage[]> = new Map();
  
  private userIdCounter = 1;
  private channelIdCounter = 1;
  private messageIdCounter = 1;

  // Initialize with default data
  initialize(): void {
    // Create default channels if empty
    if (this.channels.size === 0) {
      const defaultChannels = [
        { server_id: 1, name: 'general', type: 'text', position: 0 },
        { server_id: 1, name: 'random', type: 'text', position: 1 },
        { server_id: 1, name: 'music', type: 'text', position: 2 },
        { server_id: 1, name: 'General Voice', type: 'voice', position: 0 },
        { server_id: 1, name: 'Lounge', type: 'voice', position: 1 },
      ];
      
      for (const ch of defaultChannels) {
        const id = this.channelIdCounter++;
        this.channels.set(id, {
          id,
          ...ch,
          position: ch.position
        });
      }
    }
  }

  // User methods - O(1) for all operations
  createUser(username: string, passwordHash: string, displayName?: string): StoredUser {
    const id = this.userIdCounter++;
    const user: StoredUser = {
      id,
      username,
      password_hash: passwordHash,
      display_name: displayName || username,
      status: 'online',
      created_at: new Date()
    };
    this.users.set(id, user);
    // O(1) index by username
    this.usersByUsername.set(username, user);
    return user;
  }

  getUserById(id: number): StoredUser | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): StoredUser | undefined {
    // O(1) lookup via index
    return this.usersByUsername.get(username);
  }

  getOnlineUsers(): StoredUser[] {
    return Array.from(this.users.values()).filter(u => u.status === 'online');
  }

  // Update user status
  updateUserStatus(userId: number, status: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.status = status;
    }
  }

  // Channel methods
  getChannels(): StoredChannel[] {
    return Array.from(this.channels.values()).sort((a, b) => a.position - b.position);
  }

  // Message methods - O(1) for channel retrieval
  createMessage(channelId: number, userId: number, content: string, username?: string): StoredMessage {
    const id = this.messageIdCounter++;
    const message: StoredMessage = {
      id,
      channel_id: channelId,
      user_id: userId,
      content,
      created_at: new Date(),
      username
    };
    this.messages.set(id, message);
    
    // O(1) index by channel
    if (!this.messagesByChannel.has(channelId)) {
      this.messagesByChannel.set(channelId, []);
    }
    this.messagesByChannel.get(channelId)!.push(message);
    
    return message;
  }

  getMessages(channelId: number, limit = 50): StoredMessage[] {
    // O(1) lookup via channel index
    const channelMessages = this.messagesByChannel.get(channelId);
    if (!channelMessages) return [];
    
    // Return last N messages (already in chronological order)
    return channelMessages.slice(-limit);
  }

  // Clear all messages for a channel (useful for cleanup)
  clearChannelMessages(channelId: number): void {
    const messages = this.messagesByChannel.get(channelId);
    if (messages) {
      messages.forEach(m => this.messages.delete(m.id));
      this.messagesByChannel.delete(channelId);
    }
  }

  // Get stats for monitoring
  getStats(): { users: number; channels: number; messages: number } {
    return {
      users: this.users.size,
      channels: this.channels.size,
      messages: this.messages.size,
    };
  }
}

export const memoryStore = new MemoryStore();
