import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface ServerBan {
  id: number;
  server_id: number;
  user_id: number;
  reason: string | null;
  banned_at: Date;
  banned_by: number | null;
}

export interface BanWithUser extends ServerBan {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ServerKick {
  id: number;
  server_id: number;
  user_id: number;
  reason: string | null;
  kicked_at: Date;
  kicked_by: number | null;
}

export interface KickWithUser extends ServerKick {
  username: string;
  display_name: string | null;
  kicked_by_username: string | null;
}

class ModerationService {
  // Ban a user from a server
  async banUser(serverId: number, userId: number, bannedBy: number, reason?: string): Promise<ServerBan> {
    // Check if already banned
    const existing = await this.getBan(serverId, userId);
    if (existing) {
      throw new Error('User is already banned');
    }

    const result = await query(
      `INSERT INTO server_bans (server_id, user_id, banned_by, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [serverId, userId, bannedBy, reason || null]
    );

    // Remove the user from server members
    await query(
      'DELETE FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );

    logger.info(`User ${userId} banned from server ${serverId} by ${bannedBy}`);
    return result.rows[0] as ServerBan;
  }

  // Unban a user
  async unbanUser(serverId: number, userId: number): Promise<void> {
    await query(
      'DELETE FROM server_bans WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    logger.info(`User ${userId} unbanned from server ${serverId}`);
  }

  // Get ban for a specific user
  async getBan(serverId: number, userId: number): Promise<ServerBan | null> {
    return queryOne<ServerBan>(
      'SELECT * FROM server_bans WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
  }

  // Get all bans for a server
  async getBans(serverId: number): Promise<BanWithUser[]> {
    const result = await query(
      `SELECT sb.*, u.username, u.display_name, u.avatar_url
       FROM server_bans sb
       JOIN users u ON sb.user_id = u.id
       WHERE sb.server_id = $1
       ORDER BY sb.banned_at DESC`,
      [serverId]
    );
    return result.rows as BanWithUser[];
  }

  // Check if user is banned
  async isBanned(serverId: number, userId: number): Promise<boolean> {
    const result = await queryOne(
      'SELECT 1 FROM server_bans WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    return !!result;
  }

  // Kick a user from a server
  async kickUser(serverId: number, userId: number, kickedBy: number, reason?: string): Promise<ServerKick> {
    // Check if user is a member
    const isMember = await queryOne(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    if (!isMember) {
      throw new Error('User is not a member of this server');
    }

    const result = await query(
      `INSERT INTO server_kicks (server_id, user_id, kicked_by, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [serverId, userId, kickedBy, reason || null]
    );

    // Remove the user from server members
    await query(
      'DELETE FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );

    logger.info(`User ${userId} kicked from server ${serverId} by ${kickedBy}`);
    return result.rows[0] as ServerKick;
  }

  // Get kick history for a server
  async getKicks(serverId: number, limit: number = 50): Promise<KickWithUser[]> {
    const result = await query(
      `SELECT sk.*, u.username, u.display_name, kb.username as kicked_by_username
       FROM server_kicks sk
       JOIN users u ON sk.user_id = u.id
       LEFT JOIN users kb ON sk.kicked_by = kb.id
       WHERE sk.server_id = $1
       ORDER BY sk.kicked_at DESC
       LIMIT $2`,
      [serverId, limit]
    );
    return result.rows as KickWithUser[];
  }

  // Get user's kick history
  async getUserKicks(userId: number, limit: number = 20): Promise<KickWithUser[]> {
    const result = await query(
      `SELECT sk.*, s.name as server_name, kb.username as kicked_by_username
       FROM server_kicks sk
       JOIN servers s ON sk.server_id = s.id
       LEFT JOIN users kb ON sk.kicked_by = kb.id
       WHERE sk.user_id = $1
       ORDER BY sk.kicked_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows as KickWithUser[];
  }

  // Get ban count for a server
  async getBanCount(serverId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM server_bans WHERE server_id = $1',
      [serverId]
    );
    return parseInt(result?.count || '0', 10);
  }

  // Update ban reason
  async updateBanReason(serverId: number, userId: number, reason: string): Promise<ServerBan | null> {
    const result = await query(
      `UPDATE server_bans 
       SET reason = $1 
       WHERE server_id = $2 AND user_id = $3 
       RETURNING *`,
      [reason, serverId, userId]
    );
    return result.rows[0] as ServerBan | null;
  }

  // Bulk ban users
  async bulkBan(serverId: number, userIds: number[], bannedBy: number, reason?: string): Promise<number> {
    let banned = 0;
    
    for (const userId of userIds) {
      try {
        await this.banUser(serverId, userId, bannedBy, reason);
        banned++;
      } catch (error) {
        // Skip if already banned
        logger.debug(`Failed to ban user ${userId}: ${error}`);
      }
    }
    
    logger.info(`Bulk banned ${banned} users from server ${serverId}`);
    return banned;
  }
}

export const moderationService = new ModerationService();
