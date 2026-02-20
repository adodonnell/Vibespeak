import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface Server {
  id: number;
  name: string;
  address: string;
  port: number;
  password: string | null;
  owner_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface ServerWithChannels extends Server {
  channels: Channel[];
}

export interface Channel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice' | 'category';
  position: number;
  parent_id: number | null;
  topic: string | null;
  description: string | null;
  icon: string | null;
  is_category: boolean;
  created_at: Date;
}

export interface CreateServerInput {
  name: string;
  owner_id: number;
  address?: string;
  port?: number;
  password?: string;
}

export interface UpdateServerInput {
  name?: string;
  address?: string;
  port?: number;
  password?: string | null;
}

class ServerService {
  async createServer(input: CreateServerInput): Promise<Server> {
    const result = await query(
      `INSERT INTO servers (name, address, port, password, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.name,
        input.address || 'localhost',
        input.port || 9987,
        input.password || null,
        input.owner_id
      ]
    );
    
    const server = result.rows[0] as Server;
    logger.info(`Server created: ${server.name} (id: ${server.id})`);
    
    // Create default channels for the server
    await this.createDefaultChannels(server.id);
    
    // Add owner as a member
    await query(
      `INSERT INTO server_members (server_id, user_id, nickname)
       VALUES ($1, $2, $3)
       ON CONFLICT (server_id, user_id) DO NOTHING`,
      [server.id, input.owner_id, null]
    );
    
    return server;
  }

  async createDefaultChannels(serverId: number): Promise<void> {
    // Create default text channels
    const textChannels = [
      { name: 'general', type: 'text' },
      { name: 'random', type: 'text' },
    ];
    
    for (let i = 0; i < textChannels.length; i++) {
      const ch = textChannels[i];
      await query(
        `INSERT INTO channels (server_id, name, type, position, is_category)
         VALUES ($1, $2, $3, $4, false)`,
        [serverId, ch.name, ch.type, i]
      );
    }
    
    // Create default voice channels
    const voiceChannels = [
      { name: 'General Voice', type: 'voice' },
      { name: 'Lounge', type: 'voice' },
    ];
    
    for (let i = 0; i < voiceChannels.length; i++) {
      const ch = voiceChannels[i];
      await query(
        `INSERT INTO channels (server_id, name, type, position, is_category)
         VALUES ($1, $2, $3, $4, false)`,
        [serverId, ch.name, ch.type, 100 + i]
      );
    }
    
    logger.debug(`Default channels created for server ${serverId}`);
  }

  async getServerById(id: number): Promise<Server | null> {
    return queryOne<Server>('SELECT * FROM servers WHERE id = $1', [id]);
  }

  async getServersByUser(userId: number): Promise<Server[]> {
    const result = await query(
      `SELECT s.* FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = $1
       ORDER BY s.name`,
      [userId]
    );
    return result.rows as Server[];
  }

  async getServerWithChannels(serverId: number): Promise<ServerWithChannels | null> {
    const server = await this.getServerById(serverId);
    if (!server) return null;
    
    const channels = await this.getChannelsByServer(serverId);
    
    return {
      ...server,
      channels
    };
  }

  async getChannelsByServer(serverId: number): Promise<Channel[]> {
    const result = await query(
      `SELECT * FROM channels 
       WHERE server_id = $1 
       ORDER BY is_category DESC, position, name`,
      [serverId]
    );
    return result.rows as Channel[];
  }

  async getTextChannels(serverId: number): Promise<Channel[]> {
    const result = await query(
      `SELECT * FROM channels 
       WHERE server_id = $1 AND type = 'text' AND is_category = false
       ORDER BY position, name`,
      [serverId]
    );
    return result.rows as Channel[];
  }

  async getVoiceChannels(serverId: number): Promise<Channel[]> {
    const result = await query(
      `SELECT * FROM channels 
       WHERE server_id = $1 AND type = 'voice' AND is_category = false
       ORDER BY position, name`,
      [serverId]
    );
    return result.rows as Channel[];
  }

  async getCategories(serverId: number): Promise<Channel[]> {
    const result = await query(
      `SELECT * FROM channels 
       WHERE server_id = $1 AND is_category = true
       ORDER BY position, name`,
      [serverId]
    );
    return result.rows as Channel[];
  }

  async updateServer(id: number, data: UpdateServerInput): Promise<Server | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(data.address);
    }
    if (data.port !== undefined) {
      updates.push(`port = $${paramIndex++}`);
      values.push(data.port);
    }
    if (data.password !== undefined) {
      updates.push(`password = $${paramIndex++}`);
      values.push(data.password);
    }
    
    if (updates.length === 0) {
      return this.getServerById(id);
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await query(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    logger.info(`Server updated: ${id}`);
    return result.rows[0] as Server | null;
  }

  async deleteServer(id: number, _requesterId?: number): Promise<void> {
    await query('DELETE FROM servers WHERE id = $1', [id]);
    logger.info(`Server deleted: ${id}`);
  }

  async isMember(serverId: number, userId: number): Promise<boolean> {
    const result = await queryOne(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    return !!result;
  }

  // Alias for getServerById
  async getServer(id: number): Promise<Server | null> {
    return this.getServerById(id);
  }

  async getMemberCount(serverId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM server_members WHERE server_id = $1',
      [serverId]
    );
    return parseInt(result?.count || '0', 10);
  }
}

export const serverService = new ServerService();
