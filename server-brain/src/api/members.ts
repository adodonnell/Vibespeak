import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';
import * as bcrypt from 'bcryptjs';

// Import Server interface for password checking
interface ServerWithPassword {
  id: number;
  name: string;
  password: string | null;
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
  // Check if server requires a password
  async getServerPasswordRequirement(serverId: number): Promise<{ requiresPassword: boolean; serverName: string }> {
    const result = await queryOne<{ password: string | null; name: string }>(
      'SELECT password, name FROM servers WHERE id = $1',
      [serverId]
    );
    
    return {
      requiresPassword: !!result?.password,
      serverName: result?.name || 'Unknown Server'
    };
  }

  // Verify server password
  async verifyServerPassword(serverId: number, password: string): Promise<boolean> {
    const result = await queryOne<{ password: string | null }>(
      'SELECT password FROM servers WHERE id = $1',
      [serverId]
    );
    
    if (!result || !result.password) {
      // No password required
      return true;
    }
    
    // Compare password (supports both plaintext and bcrypt hashed passwords)
    // For backwards compatibility, check plaintext first
    if (result.password === password) {
      return true;
    }
    
    // Then check bcrypt hash
    try {
      return await bcrypt.compare(password, result.password);
    } catch {
      return false;
    }
  }

  // Join a server (with optional password verification)
  async joinServer(serverId: number, userId: number, nickname?: string, password?: string): Promise<ServerMember> {
    // Check if already a member
    const existing = await this.getMember(serverId, userId);
    if (existing) {
      return existing;
    }

    // Check if server requires password
    const serverInfo = await queryOne<{ password: string | null }>(
      'SELECT password FROM servers WHERE id = $1',
      [serverId]
    );

    if (!serverInfo) {
      throw new Error('Server not found');
    }

    // Verify password if required
    if (serverInfo.password) {
      if (!password) {
        throw new Error('Password required');
      }
      
      // Check plaintext first (backwards compatibility)
      let validPassword = serverInfo.password === password;
      
      // Then check bcrypt hash
      if (!validPassword) {
        try {
          validPassword = await bcrypt.compare(password, serverInfo.password);
        } catch {
          // Not a bcrypt hash, already checked plaintext
        }
      }
      
      if (!validPassword) {
        throw new Error('Invalid password');
      }
    }

    const result = await query(
      `INSERT INTO server_members (server_id, user_id, nickname, roles)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [serverId, userId, nickname || null, JSON.stringify([])]
    );

    logger.info(`User ${userId} joined server ${serverId}`);
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

  // Get member count
  async getMemberCount(serverId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM server_members WHERE server_id = $1',
      [serverId]
    );
    return parseInt(result?.count || '0', 10);
  }

  // Update member nickname
  async updateNickname(serverId: number, userId: number, nickname: string | null): Promise<ServerMember | null> {
    const result = await query(
      `UPDATE server_members 
       SET nickname = $1 
       WHERE server_id = $2 AND user_id = $3 
       RETURNING *`,
      [nickname, serverId, userId]
    );
    
    if (result.rows.length === 0) return null;
    
    logger.debug(`Nickname updated for user ${userId} in server ${serverId}: ${nickname}`);
    return result.rows[0] as ServerMember;
  }

  // Update member roles
  async updateRoles(serverId: number, userId: number, roles: number[]): Promise<ServerMember | null> {
    const result = await query(
      `UPDATE server_members 
       SET roles = $1 
       WHERE server_id = $2 AND user_id = $3 
       RETURNING *`,
      [JSON.stringify(roles), serverId, userId]
    );
    
    if (result.rows.length === 0) return null;
    
    logger.debug(`Roles updated for user ${userId} in server ${serverId}: ${roles.join(', ')}`);
    return result.rows[0] as ServerMember;
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
