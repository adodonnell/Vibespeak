// API Client for VibeSpeak
// Handles authentication and API calls to server-brain

/**
 * Reads the API base URL dynamically on every call.
 * Priority: localStorage (set by ServerSetupScreen) → VITE env var → localhost fallback.
 * This ensures the URL is always current even after the setup screen changes it.
 */
function getApiBase(): string {
  try {
    return (
      localStorage.getItem('disorder:api-url') ||
      (import.meta.env.VITE_API_URL as string | undefined) ||
      'http://localhost:3001'
    );
  } catch {
    return (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';
  }
}

export interface User {
  id: number;
  username: string;
  email?: string;
  display_name: string | null;
  status: string;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  token: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  created_at: string;
  username?: string;
  display_name?: string | null;
}

export interface Channel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice';
  position: number;
  parent_id: number | null;
  topic: string | null;
}

export interface VoiceChannelUser {
  clientId: string;
  username: string;
  displayName?: string;
}

export interface VoiceChannel {
  channelId: string;
  users: VoiceChannelUser[];
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setTokens(accessToken: string | null, refreshToken: string | null = null) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (accessToken) {
      localStorage.setItem('disorder:token', accessToken);
    } else {
      localStorage.removeItem('disorder:token');
    }
    if (refreshToken) {
      localStorage.setItem('disorder:refresh_token', refreshToken);
    } else {
      localStorage.removeItem('disorder:refresh_token');
    }
    // Migrate legacy keys (vibespeak_*) on first run
    localStorage.removeItem('vibespeak_token');
    localStorage.removeItem('vibespeak_refresh_token');
  }

  getAccessToken(): string | null {
    if (!this.accessToken) {
      // Check new key first, fall back to legacy key for smooth migration
      this.accessToken =
        localStorage.getItem('disorder:token') ||
        localStorage.getItem('vibespeak_token');
    }
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    if (!this.refreshToken) {
      this.refreshToken =
        localStorage.getItem('disorder:refresh_token') ||
        localStorage.getItem('vibespeak_refresh_token');
    }
    return this.refreshToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    // Read base URL fresh on every request so setup-screen changes are reflected immediately
    const apiBase = getApiBase();

    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle token refresh on 401
    if (response.status === 401 && this.getRefreshToken()) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        const newToken = this.getAccessToken();
        if (newToken) {
          (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(`${apiBase}${endpoint}`, {
            ...options,
            headers,
          });
          if (!retryResponse.ok) {
            const error = await retryResponse.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
          }
          return retryResponse.json();
        }
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  async register(username: string, email: string, password: string, displayName?: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, display_name: displayName }),
    });
    if (response.tokens) {
      this.setTokens(response.tokens.accessToken, response.tokens.refreshToken);
    } else if (response.token) {
      this.setTokens(response.token);
    }
    return response;
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (response.tokens) {
      this.setTokens(response.tokens.accessToken, response.tokens.refreshToken);
    } else if (response.token) {
      this.setTokens(response.token);
    }
    return response;
  }

  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) { this.logout(); return false; }
      const data = await response.json();
      if (data.tokens) { this.setTokens(data.tokens.accessToken, data.tokens.refreshToken); return true; }
      return false;
    } catch { this.logout(); return false; }
  }

  async logout(): Promise<void> {
    try {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        await this.request('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      }
    } finally { this.setTokens(null, null); }
  }

  isAuthenticated(): boolean { return !!this.getAccessToken(); }

  async guestLogin(username: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    this.setTokens(response.token);
    return response;
  }

  async getMessages(channelId: number, limit = 50, before?: number): Promise<Message[]> {
    let endpoint = `/api/messages/${channelId}?limit=${limit}`;
    if (before) endpoint += `&before=${before}`;
    return this.request<Message[]>(endpoint, { method: 'GET' });
  }

  async sendMessage(channelId: number, content: string, parentId?: number): Promise<Message> {
    return this.request<Message>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ channel_id: channelId, content, parent_id: parentId }),
    });
  }

  async editMessage(messageId: number, content: string): Promise<Message> {
    return this.request<Message>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(messageId: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async addReaction(messageId: number, emoji: string): Promise<{ emoji: string; count: number }[]> {
    return this.request<{ emoji: string; count: number }[]>(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId: number, emoji: string): Promise<{ emoji: string; count: number }[]> {
    return this.request<{ emoji: string; count: number }[]>(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  async getReactions(messageId: number): Promise<{ emoji: string; count: number }[]> {
    return this.request<{ emoji: string; count: number }[]>(`/api/messages/${messageId}/reactions`, {
      method: 'GET',
    });
  }

  async getReplies(messageId: number): Promise<Message[]> {
    return this.request<Message[]>(`/api/messages/${messageId}/replies`, {
      method: 'GET',
    });
  }

  async searchMessages(query: string, limit = 50): Promise<Message[]> {
    return this.request<Message[]>(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      method: 'GET',
    });
  }

  async getChannels(serverId: number): Promise<Channel[]> {
    return this.request<Channel[]>(`/api/channels/${serverId}`, { method: 'GET' });
  }

  async createChannel(serverId: number, name: string, type: 'text' | 'voice' = 'text', topic?: string): Promise<Channel> {
    return this.request<Channel>('/api/channels', {
      method: 'POST',
      body: JSON.stringify({ server_id: serverId, name, type, topic }),
    });
  }

  async getVoiceChannels(): Promise<VoiceChannel[]> {
    return this.request<VoiceChannel[]>('/api/voice-channels', { method: 'GET' });
  }

  // === SERVERS ===
  async getServers(): Promise<{ id: number; name: string; owner_id: number }[]> {
    return this.request('/api/servers', { method: 'GET' });
  }

  async getServer(serverId: number): Promise<{ id: number; name: string; owner_id: number; channels: Channel[] }> {
    return this.request(`/api/servers/${serverId}`, { method: 'GET' });
  }

  async createServer(name: string): Promise<{ id: number; name: string }> {
    return this.request('/api/servers', { method: 'POST', body: JSON.stringify({ name }) });
  }

  async deleteServer(serverId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}`, { method: 'DELETE' });
  }

  async updateServer(serverId: number, data: { name?: string }): Promise<{ id: number; name: string }> {
    return this.request(`/api/servers/${serverId}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // === MEMBERS ===
  async getMembers(serverId: number): Promise<{ id: number; user_id: number; username: string; nickname: string | null; roles: string }[]> {
    return this.request(`/api/servers/${serverId}/members`, { method: 'GET' });
  }

  async joinServer(serverId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/join`, { method: 'POST' });
  }

  async leaveServer(serverId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/leave`, { method: 'POST' });
  }

  async updateMemberNickname(serverId: number, userId: number, nickname: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/members/${userId}/nickname`, {
      method: 'PATCH', body: JSON.stringify({ nickname })
    });
  }

  // === INVITES ===
  async getInvites(serverId: number): Promise<{ id: number; code: string; uses_count: number; max_uses: number | null; expires_at: string | null }[]> {
    return this.request(`/api/servers/${serverId}/invites`, { method: 'GET' });
  }

  async createInvite(serverId: number, options?: { max_uses?: number; expires_in?: number }): Promise<{ code: string }> {
    return this.request(`/api/servers/${serverId}/invites`, { method: 'POST', body: JSON.stringify(options || {}) });
  }

  async deleteInvite(serverId: number, inviteId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/invites/${inviteId}`, { method: 'DELETE' });
  }

  async joinViaInvite(code: string): Promise<{ server_id: number }> {
    return this.request(`/api/invites/${code}`, { method: 'POST' });
  }

  // === ROLES ===
  async getRoles(serverId: number): Promise<{ id: number; name: string; color: string; permissions: number }[]> {
    return this.request(`/api/servers/${serverId}/roles`, { method: 'GET' });
  }

  async createRole(serverId: number, data: { name: string; color?: string; permissions?: number }): Promise<{ id: number; name: string }> {
    return this.request(`/api/servers/${serverId}/roles`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateRole(serverId: number, roleId: number, data: { name?: string; color?: string; permissions?: number }): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteRole(serverId: number, roleId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' });
  }

  // === PINS ===
  async getPinnedMessages(channelId: number): Promise<{ id: number; message_id: number; message_content: string; username: string; display_name: string | null; pinned_at: string }[]> {
    return this.request(`/api/channels/${channelId}/pins`, { method: 'GET' });
  }

  async pinMessage(channelId: number, messageId: number): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/pins`, { method: 'POST', body: JSON.stringify({ message_id: messageId }) });
  }

  async unpinMessage(channelId: number, messageId: number): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' });
  }

  // === MODERATION ===
  async getBans(serverId: number): Promise<{ id: number; user_id: number; username: string; reason: string | null; banned_at: string }[]> {
    return this.request(`/api/servers/${serverId}/bans`, { method: 'GET' });
  }

  async banUser(serverId: number, userId: number, reason?: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/bans`, { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
  }

  async unbanUser(serverId: number, userId: number): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/bans/${userId}`, { method: 'DELETE' });
  }

  async kickUser(serverId: number, userId: number, reason?: string): Promise<{ success: boolean }> {
    return this.request(`/api/servers/${serverId}/kick`, { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) });
  }

  // === SEARCH ===
  async searchGlobal(query: string): Promise<{ messages: Message[]; users: { id: number; username: string }[]; servers: { id: number; name: string }[] }> {
    return this.request(`/api/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
  }

  // === USERS ===
  async getUser(userId: number): Promise<{ id: number; username: string; display_name: string | null; avatar_url: string | null; status: string }> {
    return this.request(`/api/users/${userId}`, { method: 'GET' });
  }

  async updateProfile(data: { display_name?: string; avatar_url?: string; status?: string }): Promise<{ success: boolean }> {
    return this.request('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  }

  async searchUsers(query: string): Promise<{ id: number; username: string; display_name: string | null }[]> {
    return this.request(`/api/users/search?q=${encodeURIComponent(query)}`, { method: 'GET' });
  }

  // === OAUTH2 ===
  async getOAuthProviders(): Promise<{ name: string; displayName: string }[]> {
    return this.request('/api/oauth2/providers', { method: 'GET' });
  }

  async getOAuthConnections(): Promise<{ id: number; user_id: number; provider: string; username: string | null; connected_at: Date }[]> {
    return this.request('/api/oauth2/connections', { method: 'GET' });
  }

  async unlinkOAuthProvider(provider: string): Promise<{ success: boolean }> {
    return this.request(`/api/oauth2/connections/${provider}`, { method: 'DELETE' });
  }

  // OAuth login — redirects to provider, returns token via callback URL
  loginWithOAuth(provider: string): void {
    window.location.href = `${getApiBase()}/api/oauth2/${provider}`;
  }

  // === MFA ===
  async getMFAStatus(): Promise<{ enabled: boolean; hasBackupCodes: boolean }> {
    return this.request('/api/mfa/status', { method: 'GET' });
  }

  async setupMFA(): Promise<{ secret: string; backupCodes: string[]; totpUrl: string }> {
    return this.request('/api/mfa/setup', { method: 'POST' });
  }

  async verifyMFA(code: string): Promise<{ valid: boolean }> {
    return this.request('/api/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) });
  }

  async disableMFA(code: string): Promise<{ success: boolean }> {
    return this.request('/api/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) });
  }

  // === PASSWORD RESET ===
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    return this.request('/api/auth/password-reset-request', { method: 'POST', body: JSON.stringify({ email }) });
  }

  async resetPassword(token: string, password: string): Promise<{ success: boolean }> {
    return this.request('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ token, password }) });
  }

  // === PRESENCE ===
  async getUserPresence(userId: number): Promise<{ status: string; game?: string }> {
    return this.request(`/api/users/${userId}/presence`, { method: 'GET' });
  }

  async updatePresence(status: string, game?: string): Promise<{ success: boolean }> {
    return this.request('/api/users/presence', { method: 'POST', body: JSON.stringify({ status, game }) });
  }

  // === READ RECEIPTS ===
  async markChannelRead(channelId: number, messageId?: number): Promise<{ success: boolean }> {
    return this.request(`/api/channels/${channelId}/read`, { method: 'POST', body: JSON.stringify({ message_id: messageId }) });
  }

  async getChannelReadState(channelId: number): Promise<{ message_id: number | null; read_at: string | null }> {
    return this.request(`/api/channels/${channelId}/read`, { method: 'GET' });
  }

  // === AUDIT LOGS ===
  async getAuditLogs(serverId: number, limit = 50): Promise<{ id: number; server_id: number; user_id: number; action: string; target_user_id: number; reason: string; created_at: string; actor_username: string }[]> {
    return this.request(`/api/servers/${serverId}/audit-logs?limit=${limit}`, { method: 'GET' });
  }

  // === THREADS ===
  async createThread(channelId: number, name: string, messageId: number): Promise<{ id: number; name: string }> {
    return this.request(`/api/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ name, message_id: messageId }),
    });
  }

  async getThreadMessages(threadId: number): Promise<Message[]> {
    return this.request(`/api/threads/${threadId}/messages`, { method: 'GET' });
  }

  async sendThreadMessage(threadId: number, content: string): Promise<Message> {
    return this.request(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }
}

export const apiClient = new ApiClient();
