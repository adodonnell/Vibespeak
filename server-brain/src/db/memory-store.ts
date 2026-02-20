// In-memory fallback storage when database is unavailable

interface StoredUser {
  id: number;
  username: string;
  password_hash: string;
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
  private users: Map<number, StoredUser> = new Map();
  private channels: Map<number, StoredChannel> = new Map();
  private messages: Map<number, StoredMessage> = new Map();
  
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

  // User methods
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
    return user;
  }

  getUserById(id: number): StoredUser | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): StoredUser | undefined {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return undefined;
  }

  getOnlineUsers(): StoredUser[] {
    return Array.from(this.users.values()).filter(u => u.status === 'online');
  }

  // Channel methods
  getChannels(): StoredChannel[] {
    return Array.from(this.channels.values()).sort((a, b) => a.position - b.position);
  }

  // Message methods
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
    return message;
  }

  getMessages(channelId: number, limit = 50): StoredMessage[] {
    const channelMessages = Array.from(this.messages.values())
      .filter(m => m.channel_id === channelId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .slice(-limit);
    return channelMessages;
  }
}

export const memoryStore = new MemoryStore();
