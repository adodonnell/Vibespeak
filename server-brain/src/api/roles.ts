import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// ============================================
// PERMISSION SYSTEM (Bitwise - Nerimity-style)
// ============================================

// Role-level permissions
export enum RolePermissions {
  ADMIN = 1 << 0,           // 1 - Full access
  MANAGE_CHANNELS = 1 << 1,    // 2 - Manage channels
  MANAGE_ROLES = 1 << 2,       // 4 - Manage roles
  MANAGE_SERVER = 1 << 3,      // 8 - Manage server settings
  KICK_MEMBERS = 1 << 4,       // 16 - Kick members
  BAN_MEMBERS = 1 << 5,         // 32 - Ban members
  VIEW_AUDIT_LOG = 1 << 6,     // 64 - View audit logs
  MANAGE_MESSAGES = 1 << 7,     // 128 - Manage messages (pin, delete others')
  MENTION_EVERYONE = 1 << 8,    // 256 - Mention @everyone
  MOVE_MEMBERS = 1 << 9,        // 512 - Move members between voice
  MUTE_MEMBERS = 1 << 10,       // 1024 - Mute members (timeout)
}

// Channel-level permissions
export enum ChannelPermissions {
  VIEW_CHANNEL = 1 << 0,        // 1 - View channel
  SEND_MESSAGES = 1 << 1,       // 2 - Send messages
  SEND_TTS = 1 << 2,            // 4 - Send TTS messages
  MANAGE_MESSAGES = 1 << 3,     // 8 - Manage messages
  EMBED_LINKS = 1 << 4,         // 16 - Embed links
  ATTACH_FILES = 1 << 5,        // 32 - Attach files
  READ_HISTORY = 1 << 6,        // 64 - Read message history
  MENTION_ROLES = 1 << 7,       // 128 - Mention roles
  JOIN_VOICE = 1 << 8,          // 256 - Join voice channel
  SPEAK = 1 << 9,               // 512 - Speak in voice
  MUTE_MEMBERS = 1 << 10,        // 1024 - Mute members
  DEAFEN_MEMBERS = 1 << 11,     // 2048 - Deafen members
  MOVE_MEMBERS = 1 << 12,       // 4096 - Move members
}

// ============================================
// TYPES
// ============================================

export interface Role {
  id: number;
  server_id: number;
  name: string;
  color: string;
  position: number;
  permissions: number;
  hoist: boolean;
  mentionable: boolean;
  created_at: Date;
}

export interface RoleInput {
  name: string;
  color?: string;
  permissions?: number;
  hoist?: boolean;
  mentionable?: boolean;
}

export interface ChannelPermission {
  role_id: number;
  channel_id: number;
  permissions: number;
}

// ============================================
// SERVICE
// ============================================

class RoleService {
  // Permission helpers
  hasPermission(permissions: number, permission: RolePermissions): boolean {
    return (permissions & permission) === permission;
  }

  addPermission(permissions: number, permission: RolePermissions): number {
    return permissions | permission;
  }

  removePermission(permissions: number, permission: RolePermissions): number {
    return permissions & ~permission;
  }

  // Role CRUD
  async createRole(serverId: number, input: RoleInput): Promise<Role> {
    // Get max position
    const maxPos = await queryOne<{ max_pos: number | null }>(
      'SELECT MAX(position) as max_pos FROM roles WHERE server_id = $1',
      [serverId]
    );
    const position = (maxPos?.max_pos ?? -1) + 1;

    const result = await query(
      `INSERT INTO roles (server_id, name, color, position, permissions, hoist, mentionable)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        serverId,
        input.name,
        input.color || '#99AAB5',
        position,
        input.permissions || 0,
        input.hoist ?? false,
        input.mentionable ?? false
      ]
    );

    logger.info(`Role created: ${input.name} (server: ${serverId})`);
    return result.rows[0] as Role;
  }

  async getRoleById(id: number): Promise<Role | null> {
    return queryOne<Role>('SELECT * FROM roles WHERE id = $1', [id]);
  }

  async getRolesByServer(serverId: number): Promise<Role[]> {
    const result = await query(
      'SELECT * FROM roles WHERE server_id = $1 ORDER BY position DESC, name',
      [serverId]
    );
    return result.rows as Role[];
  }

  async updateRole(id: number, data: Partial<RoleInput>): Promise<Role | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(data.color);
    }
    if (data.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(data.permissions);
    }
    if (data.hoist !== undefined) {
      updates.push(`hoist = $${paramIndex++}`);
      values.push(data.hoist);
    }
    if (data.mentionable !== undefined) {
      updates.push(`mentionable = $${paramIndex++}`);
      values.push(data.mentionable);
    }

    if (updates.length === 0) {
      return this.getRoleById(id);
    }

    values.push(id);
    const result = await query(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info(`Role updated: ${id}`);
    return result.rows[0] as Role | null;
  }

  async deleteRole(id: number): Promise<void> {
    await query('DELETE FROM roles WHERE id = $1', [id]);
    logger.info(`Role deleted: ${id}`);
  }

  // Update member's roles
  async setMemberRoles(serverId: number, userId: number, roleIds: number[]): Promise<void> {
    await query(
      `UPDATE server_members SET roles = $1 WHERE server_id = $2 AND user_id = $3`,
      [JSON.stringify(roleIds), serverId, userId]
    );
    logger.debug(`Member roles updated: user ${userId}, roles ${roleIds.join(', ')}`);
  }

  async getMemberRoles(serverId: number, userId: number): Promise<number[]> {
    const result = await queryOne<{ roles: string }>(
      'SELECT roles FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    if (!result?.roles) return [];
    try {
      return JSON.parse(result.roles);
    } catch {
      return [];
    }
  }

  // Channel permissions
  async setChannelPermission(
    channelId: number,
    roleId: number,
    serverId: number,
    permissions: number
  ): Promise<void> {
    await query(
      `INSERT INTO channel_permissions (channel_id, role_id, server_id, permissions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (channel_id, role_id) 
       DO UPDATE SET permissions = $4`,
      [channelId, roleId, serverId, permissions]
    );
  }

  async getChannelPermissions(channelId: number): Promise<ChannelPermission[]> {
    const result = await query(
      'SELECT * FROM channel_permissions WHERE channel_id = $1',
      [channelId]
    );
    return result.rows as ChannelPermission[];
  }

  // Permission check helpers
  async getMemberPermissionLevel(serverId: number, userId: number): Promise<number> {
    const result = await query(
      `SELECT r.permissions FROM server_members sm
       JOIN roles r ON r.id = ANY(sm.roles::int[])
       WHERE sm.server_id = $1 AND sm.user_id = $2
       ORDER BY r.permissions DESC
       LIMIT 1`,
      [serverId, userId]
    );
    
    if (result.rows.length === 0) return 0;
    return (result.rows[0] as { permissions: number }).permissions;
  }

  canManageChannels(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.MANAGE_CHANNELS);
  }

  canManageRoles(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.MANAGE_ROLES);
  }

  canKickMembers(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.KICK_MEMBERS);
  }

  canBanMembers(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.BAN_MEMBERS);
  }

  canMuteMembers(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.MUTE_MEMBERS);
  }

  canManageMessages(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.MANAGE_MESSAGES);
  }

  isAdmin(permissions: number): boolean {
    return this.hasPermission(permissions, RolePermissions.ADMIN);
  }

  // Alias for getRolesByServer
  async getRoles(serverId: number): Promise<Role[]> {
    return this.getRolesByServer(serverId);
  }

  // Overload: accept (serverId, nameOrInput, ...) or (serverId, input)
  async createRoleFlexible(
    serverId: number,
    nameOrInput: string | RoleInput,
    _userId?: number,
    color?: string,
    permissions?: number
  ): Promise<Role> {
    if (typeof nameOrInput === 'string') {
      return this.createRole(serverId, { name: nameOrInput, color, permissions });
    }
    return this.createRole(serverId, nameOrInput);
  }
}

export const roleService = new RoleService();
