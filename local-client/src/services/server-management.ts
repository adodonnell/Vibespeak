// Server Management Types and Service
// Handles server creation, roles, and permissions

export interface Server {
  id: string;
  name: string;
  region: string;
  ownerId: string;
  createdAt: number;
  iconUrl?: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'category';
  parentId?: string;
  position: number;
  permissions: ChannelPermissions;
}

export interface ChannelPermissions {
  allow: Permission[];
  deny: Permission[];
}

export type Permission = 
  | 'view_channel'
  | 'send_messages'
  | 'manage_messages'
  | 'manage_channels'
  | 'connect' // voice
  | 'speak' // voice
  | 'mute_members'
  | 'deafen_members'
  | 'move_members'
  | 'manage_roles'
  | 'manage_server'
  | 'kick_members'
  | 'ban_members';

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: Permission[];
  isHoisted: boolean;
  isMentionable: boolean;
}

// Default role that all members get
export const DEFAULT_ROLE: Omit<Role, 'id' | 'serverId'> = {
  name: '@everyone',
  color: '#99aab5',
  position: 0,
  permissions: ['view_channel', 'send_messages', 'connect', 'speak'],
  isHoisted: false,
  isMentionable: false,
};

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES: Record<string, Permission[]> = {
  'General': ['manage_server', 'manage_roles', 'manage_channels'],
  'Text': ['view_channel', 'send_messages', 'manage_messages'],
  'Voice': ['connect', 'speak', 'mute_members', 'deafen_members', 'move_members'],
  'Moderation': ['kick_members', 'ban_members'],
};

// Server regions
export const SERVER_REGIONS = [
  { id: 'us-east', name: 'US East', flag: '🇺🇸' },
  { id: 'us-west', name: 'US West', flag: '🇺🇸' },
  { id: 'eu-west', name: 'EU West', flag: '🇪🇺' },
  { id: 'eu-central', name: 'EU Central', flag: '🇪🇺' },
  { id: 'asia-east', name: 'Asia East', flag: '🇯🇵' },
  { id: 'asia-south', name: 'Asia South', flag: '🇸🇬' },
  { id: 'australia', name: 'Australia', flag: '🇦🇺' },
  { id: 'brazil', name: 'Brazil', flag: '🇧🇷' },
] as const;

// Role colors
export const ROLE_COLORS = [
  '#99aab5', // Grey (default)
  '#5865f2', // Blurple
  '#57f287', // Green
  '#fee75c', // Yellow
  '#ed4245', // Red
  '#faa61a', // Orange
  '#eb459e', // Pink
  '#9146ff', // Purple
] as const;

export class ServerManagementService {
  private servers: Map<string, Server> = new Map();
  private roles: Map<string, Role[]> = new Map();
  private channels: Map<string, Channel[]> = new Map();

  // Create a new server
  createServer(name: string, region: string = 'us-east', ownerId: string): Server {
    const server: Server = {
      id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      region,
      ownerId,
      createdAt: Date.now(),
    };
    
    this.servers.set(server.id, server);
    
    // Create default role for the server
    const defaultRole: Role = {
      id: `role_${Date.now()}_default`,
      serverId: server.id,
      ...DEFAULT_ROLE,
    };
    this.roles.set(server.id, [defaultRole]);
    
    // Create default channels
    this.createDefaultChannels(server.id);
    
    return server;
  }

  // Create default channels for new server
  private createDefaultChannels(serverId: string): void {
    const defaultChannels: Omit<Channel, 'id' | 'serverId'>[] = [
      { name: 'general', type: 'text', position: 0, permissions: { allow: [], deny: [] } },
      { name: 'Voice Channels', type: 'category', position: 1, permissions: { allow: [], deny: [] } },
      { name: 'General Voice', type: 'voice', parentId: 'voice-category', position: 2, permissions: { allow: [], deny: [] } },
    ];
    
    const channels: Channel[] = defaultChannels.map((ch, index) => ({
      ...ch,
      id: `ch_${Date.now()}_${index}`,
      serverId,
      parentId: ch.name === 'Voice Channels' ? undefined : (ch.parentId || undefined),
    }));
    
    this.channels.set(serverId, channels);
  }

  // Get server by ID
  getServer(serverId: string): Server | undefined {
    return this.servers.get(serverId);
  }

  // Get all servers for a user
  getUserServers(userId: string): Server[] {
    return Array.from(this.servers.values()).filter(s => s.ownerId === userId);
  }

  // Get roles for a server
  getServerRoles(serverId: string): Role[] {
    return this.roles.get(serverId) || [];
  }

  // Create a new role
  createRole(serverId: string, name: string, color: string = '#99aab5'): Role {
    const roles = this.roles.get(serverId) || [];
    const newRole: Role = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      serverId,
      name,
      color,
      position: roles.length,
      permissions: [],
      isHoisted: false,
      isMentionable: false,
    };
    
    roles.push(newRole);
    this.roles.set(serverId, roles);
    
    return newRole;
  }

  // Update role
  updateRole(serverId: string, roleId: string, updates: Partial<Role>): Role | null {
    const roles = this.roles.get(serverId);
    if (!roles) return null;
    
    const roleIndex = roles.findIndex(r => r.id === roleId);
    if (roleIndex === -1) return null;
    
    roles[roleIndex] = { ...roles[roleIndex], ...updates };
    this.roles.set(serverId, roles);
    
    return roles[roleIndex];
  }

  // Delete role
  deleteRole(serverId: string, roleId: string): boolean {
    const roles = this.roles.get(serverId);
    if (!roles) return false;
    
    const filteredRoles = roles.filter(r => r.id !== roleId);
    if (filteredRoles.length === roles.length) return false;
    
    this.roles.set(serverId, filteredRoles);
    return true;
  }

  // Get channels for a server
  getServerChannels(serverId: string): Channel[] {
    return this.channels.get(serverId) || [];
  }

  // Create a channel
  createChannel(serverId: string, name: string, type: 'text' | 'voice', parentId?: string): Channel {
    const channels = this.channels.get(serverId) || [];
    
    const channel: Channel = {
      id: `ch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      serverId,
      name,
      type,
      parentId,
      position: channels.length,
      permissions: { allow: [], deny: [] },
    };
    
    channels.push(channel);
    this.channels.set(serverId, channels);
    
    return channel;
  }

  // Update channel
  updateChannel(serverId: string, channelId: string, updates: Partial<Channel>): Channel | null {
    const channels = this.channels.get(serverId);
    if (!channels) return null;
    
    const channelIndex = channels.findIndex(c => c.id === channelId);
    if (channelIndex === -1) return null;
    
    channels[channelIndex] = { ...channels[channelIndex], ...updates };
    this.channels.set(serverId, channels);
    
    return channels[channelIndex];
  }

  // Delete channel
  deleteChannel(serverId: string, channelId: string): boolean {
    const channels = this.channels.get(serverId);
    if (!channels) return false;
    
    const filteredChannels = channels.filter(c => c.id !== channelId);
    if (filteredChannels.length === channels.length) return false;
    
    this.channels.set(serverId, filteredChannels);
    return true;
  }

  // Check if user has permission
  hasPermission(serverId: string, userId: string, permission: Permission): boolean {
    const server = this.servers.get(serverId);
    if (!server) return false;
    
    // Owner always has all permissions
    if (server.ownerId === userId) return true;
    
    const roles = this.roles.get(serverId);
    if (!roles || roles.length === 0) return false;
    
    // Check role permissions
    for (const role of roles) {
      if (role.permissions.includes(permission)) {
        return true;
      }
    }
    
    return false;
  }

  // Delete server
  deleteServer(serverId: string): boolean {
    const deleted = this.servers.delete(serverId);
    if (deleted) {
      this.roles.delete(serverId);
      this.channels.delete(serverId);
    }
    return deleted;
  }

  // Update server settings
  updateServer(serverId: string, updates: Partial<Server>): Server | null {
    const server = this.servers.get(serverId);
    if (!server) return null;
    
    const updated = { ...server, ...updates };
    this.servers.set(serverId, updated);
    
    return updated;
  }
}

export const serverManagement = new ServerManagementService();
