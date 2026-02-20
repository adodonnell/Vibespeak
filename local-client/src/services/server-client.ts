// Server Connection Service - Updated with Auth & Chat Integration
// Handles connection to backend server and auth

import { apiClient, User, Message, Channel } from './api-client';

/** Dynamic API base URL — reads localStorage set by ServerSetupScreen. */
function getApiBase(): string {
  try {
    return (
      localStorage.getItem('disorder:api-url') ||
      (import.meta.env.VITE_API_URL as string | undefined) ||
      'http://localhost:3001'
    );
  } catch {
    return 'http://localhost:3001';
  }
}

export interface ServerInfo {
  serverId: string;
  address: string;
  port: number;
  username: string;
  channels: ChannelInfo[];
}

export interface ChannelInfo {
  id: string;
  name: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string | null;
  status: string;
}

class ServerClient {
  private currentServer: ServerInfo | null = null;
  private currentUser: CurrentUser | null = null;

  // Auth methods - Register with email
  async register(username: string, email: string, password: string, displayName?: string): Promise<CurrentUser> {
    const response = await apiClient.register(username, email, password, displayName);
    this.currentUser = {
      id: response.user.id,
      username: response.user.username,
      displayName: response.user.display_name,
      status: response.user.status,
    };
    return this.currentUser;
  }

  async login(username: string, password: string): Promise<CurrentUser> {
    const response = await apiClient.login(username, password);
    this.currentUser = {
      id: response.user.id,
      username: response.user.username,
      displayName: response.user.display_name,
      status: response.user.status,
    };
    return this.currentUser;
  }

  async logout(): Promise<void> {
    await apiClient.logout();
    this.currentUser = null;
    this.currentServer = null;
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUser;
  }

  isAuthenticated(): boolean {
    return apiClient.isAuthenticated();
  }

  // Guest login - no password required
  async guestLogin(username: string): Promise<CurrentUser> {
    const response = await apiClient.guestLogin(username);
    this.currentUser = {
      id: response.user.id,
      username: response.user.username,
      displayName: response.user.display_name,
      status: response.user.status,
    };
    return this.currentUser;
  }

  // Restore session from localStorage — validates stored JWT with /api/auth/me
  async restoreSession(): Promise<CurrentUser | null> {
    const token = apiClient.getAccessToken();
    if (!token) return null;

    try {
      const response = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        // Token is invalid or expired — clear stored credentials
        apiClient.logout().catch(() => {});
        return null;
      }

      const userData = await response.json();
      this.currentUser = {
        id: userData.id,
        username: userData.username,
        displayName: userData.display_name ?? userData.username,
        status: userData.status ?? 'online',
      };
      return this.currentUser;
    } catch (_err) {
      // Network error — don't clear tokens, server may be temporarily down
      return null;
    }
  }

  // Chat methods
  async getMessages(channelId: number, limit = 50): Promise<Message[]> {
    return apiClient.getMessages(channelId, limit);
  }

  async sendMessage(channelId: number, content: string): Promise<Message> {
    return apiClient.sendMessage(channelId, content);
  }

  async getChannels(serverId: number): Promise<Channel[]> {
    return apiClient.getChannels(serverId);
  }

  async createChannel(serverId: number, name: string, type: 'text' | 'voice' = 'text'): Promise<Channel> {
    return apiClient.createChannel(serverId, name, type);
  }

  // Get online users from server
  async getOnlineUsers(): Promise<{ id: number; username: string; status: string }[]> {
    const response = await fetch(`${getApiBase()}/api/users/online`);
    if (!response.ok) {
      return [];
    }
    return response.json();
  }

  // Server connection (TeamSpeak)
  async connect(
    username: string,
    serverAddress: string,
    serverPort?: number,
    serverPassword?: string
  ): Promise<ServerInfo> {
    const response = await fetch(`${getApiBase()}/api/server/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: serverAddress,
        port: serverPort || 9987,
        username,
        password: serverPassword || ''
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to connect to server');
    }

    const data = await response.json();

    this.currentServer = {
      serverId: data.serverId,
      address: data.address,
      port: data.port,
      username: data.username,
      channels: data.channels || []
    };

    return this.currentServer;
  }

  async disconnect(): Promise<void> {
    if (!this.currentServer) {
      return;
    }

    const response = await fetch(`${getApiBase()}/api/server/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serverId: this.currentServer.serverId
      })
    });

    if (response.ok) {
      this.currentServer = null;
    }
  }

  async getStatus(): Promise<ServerInfo | null> {
    if (!this.currentServer) {
      return null;
    }

    const response = await fetch(
      `${getApiBase()}/api/server/status?serverId=${this.currentServer.serverId}`
    );

    if (!response.ok) {
      return null;
    }

    return this.currentServer;
  }

  getCurrentServer(): ServerInfo | null {
    return this.currentServer;
  }

  isConnected(): boolean {
    return this.currentServer !== null;
  }
}

export const serverClient = new ServerClient();
