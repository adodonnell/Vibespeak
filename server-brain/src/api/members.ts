import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// Server membership configuration
// When LOCAL_ONLY=true, server join is open (TeamSpeak-style, no password required)
// When LOCAL_ONLY=false or unset, password verification is required
const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true';

// Log warning if LOCAL_ONLY is enabled (security-sensitive setting)
if (LOCAL_ONLY) {
  logger.warn('LOCAL_ONLY mode enabled - server joins are open without password. ' +
    'This should ONLY be used for local development or isolated networks.');
}

// Allowed IP ranges for LOCAL_ONLY mode (defaults to localhost only)
const LOCAL_ONLY_ALLOWED_IPS = process.env.LOCAL_ONLY_ALLOWED_IPS?.split(',') || ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

// Check if IP is allowed for LOCAL_ONLY mode
function isIpAllowed(ip: string | undefined): boolean {
  if (!ip) return false;
  
  // Direct match
  if (LOCAL_ONLY_ALLOWED_IPS.includes(ip)) return true;
  
  // IPv4 localhost range (127.0.0.0/8)
  if (ip.startsWith('127.')) return true;
  
  // IPv6 localhost
  if (ip === '::1' || ip.startsWith('::ffff:127.')) return true;
  
  return false;
}

export interface ServerMember {
  id: number;
  server_id: number;
  user_id: number;
  nickname: string | null;
  roles: string; // JSON array
  joined_at: Date;
}

export interface MemberWithUser extends ServerMember {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  status: string;
}

export interface CreateMemberInput {
  server_id: number;
  user_id: number;
  nickname?: string;
  roles?: number[];
}

class MemberService {
  // Get server info (for display purposes)
  async getServerInfo(serverId: number): Promise<{ serverName: string }> {
    const result = await queryOne<{ name: string }>(
      'SELECT name FROM servers WHERE id = $1',
      [serverId]
    );
    
    return {
      serverName: result?.name || 'Unknown Server'
    };
  }

  // Check if server requires a password (for API compatibility)
  // Always returns false unless LOCAL_ONLY is explicitly set to false
  async getServerPasswordRequirement(serverId: number): Promise<{ requiresPassword: boolean; serverName: string }> {
    if (LOCAL_ONLY) {
      return { requiresPassword: false, serverName: 'Server (Local Mode)' };
    }
    
    const result = await queryOne<{ password: string | null; name: string }>(
      'SELECT password, name FROM servers WHERE id = $1',
      [serverId]
    );
    
    return {
      requiresPassword: !!result?.password,
      serverName: result?.name || 'Unknown Server'
    };
  }

  // Join a server
  // - LOCAL_ONLY=true: Allow open joins without password (TeamSpeak-style, local deployments only)
  // - LOCAL_ONLY=false/unset: Require authentication/password
  // @param clientIp - The client's IP address for LOCAL_ONLY mode security check
  async joinServer(serverId: number, userId: number, nickname?: string, clientIp?: string): Promise<ServerMember> {
    // Check if already a member
    const existing = await this.getMember(serverId, userId);
    if (existing) {
      return existing;
    }

    // Check if open server join is allowed (TeamSpeak-style local mode)
    if (!LOCAL_ONLY) {
      // Non-local mode: require password verification - block the join
      throw new Error('Server join requires authentication. ' +
        'Set LOCAL_ONLY=true for local deployments only.');
    }

    // Verify client IP is allowed in LOCAL_ONLY mode
    if (!isIpAllowed(clientIp)) {
      logger.warn(`Blocked server join from non-local IP: ${clientIp}`);
      throw new Error('Server join not allowed from this network. ' +
        'LOCAL_ONLY mode is restricted to local connections only.');
    }

    // Log warning about open join in local mode
    logger.warn('[MemberService] OPEN SERVER JOIN: Local-only mode is enabled. ' +
      'This should only be used for private/local deployments.');

    // Verify server exists
    const serverInfo = await queryOne<{ id: number }>(
      'SELECT id FROM servers WHERE id = $1',
      [serverId]
    );

    if (!serverInfo) {
      throw new Error('Server not found');
    }

    const result = await query(
      `INSERT INTO server_members (server_id, user_id, nickname, roles)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [serverId, userId, nickname || null, JSON.stringify([])]
    );

    logger.info(`User ${userId} joined server ${serverId} (local-only mode)`);
    return result.rows[0] as ServerMember;
  }

  // Leave a server
  async leaveServer(serverId: number, userId: number): Promise<void> {
    await query(
      'DELETE FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    logger.info(`User ${userId} left server ${serverId}`);
  }

  // Get a specific member
  async getMember(serverId: number, userId: number): Promise<ServerMember | null> {
    return queryOne<ServerMember>(
      'SELECT * FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
  }

  // Get all members of a server
  async getMembers(serverId: number): Promise<MemberWithUser[]> {
    const result = await query(
      `SELECT sm.*, u.username, u.display_name, u.avatar_url, u.email, u.status
       FROM server_members sm
       JOIN users u ON sm.user_id = u.id
       WHERE sm.server_id = $1
       ORDER BY u.username`,
      [serverId]
    );
    return result.rows as MemberWithUser[];
  }

  // Get members in a voice channel
  async getMembersInVoiceChannel(serverId: number, channelId: number): Promise<MemberWithUser[]> {
    const result = await query(
      `SELECT sm.*, u.username, u.display_name, u.avatar_url, u.email, u.status
       FROM server_members sm
       JOIN users u ON sm.user_id = u.id
       WHERE sm.server_id = $1 AND u.status = $2
       ORDER BY u.username`,
      [serverId, `voice:${channelId}`]
    );
    return result.rows as MemberWithUser[];
  }

  // Update member nickname
  async updateNickname(serverId: number, userId: number, nickname: string | null): Promise<ServerMember | null> {
    const result = await query(
      'UPDATE server_members SET nickname = $1 WHERE server_id = $2 AND user_id = $3 RETURNING *',
      [nickname, serverId, userId]
    );
    
    if (result.rowCount === 0) {
      return null;
    }
    
    logger.debug(`Nickname updated for user ${userId} in server ${serverId}: ${nickname}`);
    return result.rows[0] as ServerMember;
  }

  // Update member roles
  async updateRoles(serverId: number, userId: number, roles: number[]): Promise<ServerMember | null> {
    const result = await query(
      'UPDATE server_members SET roles = $1 WHERE server_id = $2 AND user_id = $3 RETURNING *',
      [JSON.stringify(roles), serverId, userId]
    );
    
    if (result.rowCount === 0) {
      return null;
    }
    
    logger.debug(`Roles updated for user ${userId} in server ${serverId}: ${roles.join(', ')}`);
    return result.rows[0] as ServerMember;
  }

  // Delete member (ban)
  async deleteMember(serverId: number, userId: number): Promise<void> {
    await query(
      'DELETE FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    logger.info(`User ${userId} was removed from server ${serverId}`);
  }

  // Get member's roles
  async getRoles(serverId: number, userId: number): Promise<number[]> {
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

  // Add role to member
  async addRole(serverId: number, userId: number, roleId: number): Promise<boolean> {
    const currentRoles = await this.getRoles(serverId, userId);
    if (currentRoles.includes(roleId)) return true;
    
    const newRoles = [...currentRoles, roleId];
    await this.updateRoles(serverId, userId, newRoles);
    return true;
  }

  // Remove role from member
  async removeRole(serverId: number, userId: number, roleId: number): Promise<boolean> {
    const currentRoles = await this.getRoles(serverId, userId);
    const newRoles = currentRoles.filter(r => r !== roleId);
    await this.updateRoles(serverId, userId, newRoles);
    return true;
  }

  // Check if user is member
  async isMember(serverId: number, userId: number): Promise<boolean> {
    const result = await queryOne(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    return !!result;
  }

  // Get servers a user is member of
  async getUserServers(userId: number): Promise<{ server_id: number }[]> {
    const result = await query(
      'SELECT server_id FROM server_members WHERE user_id = $1',
      [userId]
    );
    return result.rows as { server_id: number }[];
  }

  // Bulk add members (for server creation)
  async addMembers(serverId: number, members: { user_id: number; nickname?: string; roles?: number[] }[]): Promise<void> {
    for (const member of members) {
      await query(
        `INSERT INTO server_members (server_id, user_id, nickname, roles)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (server_id, user_id) DO NOTHING`,
        [serverId, member.user_id, member.nickname || null, JSON.stringify(member.roles || [])]
      );
    }
    logger.debug(`Added ${members.length} members to server ${serverId}`);
  }

  // Remove all members from server (when deleting)
  async removeAllMembers(serverId: number): Promise<void> {
    await query('DELETE FROM server_members WHERE server_id = $1', [serverId]);
    logger.info(`All members removed from server ${serverId}`);
  }
}

export const memberService = new MemberService();
