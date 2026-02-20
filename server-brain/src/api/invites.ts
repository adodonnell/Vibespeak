import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { randomBytes } from 'crypto';

export interface ServerInvite {
  id: number;
  server_id: number;
  code: string;
  created_by: number | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: Date | null;
  created_at: Date;
}

export interface InviteWithServer extends ServerInvite {
  server_name: string;
  inviter_username: string | null;
}

class InviteService {
  // Generate a unique invite code
  private generateCode(length: number = 8): string {
    return randomBytes(length).toString('hex').slice(0, length);
  }

  // Create an invite
  async createInvite(serverId: number, createdBy: number, options?: {
    maxUses?: number;
    expiresIn?: number; // hours
  }): Promise<ServerInvite> {
    // Generate unique code
    let code = this.generateCode();
    let attempts = 0;
    
    while (attempts < 5) {
      const existing = await this.getInviteByCode(code);
      if (!existing) break;
      code = this.generateCode();
      attempts++;
    }

    const expiresAt = options?.expiresIn 
      ? new Date(Date.now() + options.expiresIn * 60 * 60 * 1000)
      : null;

    const result = await query(
      `INSERT INTO server_invites (server_id, code, created_by, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [serverId, code, createdBy, options?.maxUses || null, expiresAt]
    );

    logger.info(`Invite created: ${code} for server ${serverId}`);
    return result.rows[0] as ServerInvite;
  }

  // Get invite by code
  async getInviteByCode(code: string): Promise<ServerInvite | null> {
    return queryOne<ServerInvite>(
      'SELECT * FROM server_invites WHERE code = $1',
      [code]
    );
  }

  // Get invite by ID
  async getInviteById(id: number): Promise<ServerInvite | null> {
    return queryOne<ServerInvite>('SELECT * FROM server_invites WHERE id = $1', [id]);
  }

  // Get all invites for a server
  async getInvitesByServer(serverId: number): Promise<InviteWithServer[]> {
    const result = await query(
      `SELECT si.*, s.name as server_name, u.username as inviter_username
       FROM server_invites si
       JOIN servers s ON si.server_id = s.id
       LEFT JOIN users u ON si.created_by = u.id
       WHERE si.server_id = $1
       ORDER BY si.created_at DESC`,
      [serverId]
    );
    return result.rows as InviteWithServer[];
  }

  // Use an invite (join server)
  async useInvite(code: string, userId: number): Promise<{ success: boolean; server_id: number }> {
    const invite = await this.getInviteByCode(code);
    
    if (!invite) {
      throw new Error('Invalid invite code');
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error('Invite has expired');
    }

    // Check max uses
    if (invite.max_uses && invite.uses_count >= invite.max_uses) {
      throw new Error('Invite has reached maximum uses');
    }

    // Increment uses
    await query(
      'UPDATE server_invites SET uses_count = uses_count + 1 WHERE id = $1',
      [invite.id]
    );

    logger.info(`Invite ${code} used by user ${userId}`);
    return { success: true, server_id: invite.server_id };
  }

  // Delete an invite
  async deleteInvite(id: number): Promise<void> {
    await query('DELETE FROM server_invites WHERE id = $1', [id]);
    logger.info(`Invite deleted: ${id}`);
  }

  // Delete invite by code
  async deleteInviteByCode(code: string): Promise<void> {
    await query('DELETE FROM server_invites WHERE code = $1', [code]);
    logger.info(`Invite deleted: ${code}`);
  }

  // Delete all invites for a server
  async deleteAllInvites(serverId: number): Promise<void> {
    await query('DELETE FROM server_invites WHERE server_id = $1', [serverId]);
    logger.info(`All invites deleted for server ${serverId}`);
  }

  // Clean up expired invites
  async cleanupExpiredInvites(): Promise<number> {
    const result = await query(
      `DELETE FROM server_invites 
       WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );
    // PostgreSQL doesn't return count in DELETE directly, so we query instead
    const expired = await query(
      `SELECT COUNT(*) as count FROM server_invites 
       WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );
    const count = parseInt(expired.rows[0]?.count || '0', 10);
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired invites`);
    }
    return count;
  }

  // Validate invite (check if valid without using)
  async validateInvite(code: string): Promise<{ valid: boolean; server_id?: number; error?: string }> {
    const invite = await this.getInviteByCode(code);
    
    if (!invite) {
      return { valid: false, error: 'Invalid invite code' };
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { valid: false, error: 'Invite has expired' };
    }

    if (invite.max_uses && invite.uses_count >= invite.max_uses) {
      return { valid: false, error: 'Invite has reached maximum uses' };
    }

    return { valid: true, server_id: invite.server_id };
  }

  // Get invite count for a server
  async getInviteCount(serverId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM server_invites WHERE server_id = $1',
      [serverId]
    );
    return parseInt(result?.count || '0', 10);
  }
}

export const inviteService = new InviteService();
