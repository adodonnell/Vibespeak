import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface Channel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice';
  position: number;
  parent_id: number | null;
  topic: string | null;
  created_at: Date;
}

export interface CreateChannelInput {
  server_id: number;
  name: string;
  type?: 'text' | 'voice';
  topic?: string;
  parent_id?: number;
}

class ChannelService {
  async createChannel(input: CreateChannelInput): Promise<Channel> {
    // Get the next position
    const maxPos = await queryOne<{ max_pos: number | null }>(
      'SELECT MAX(position) as max_pos FROM channels WHERE server_id = $1',
      [input.server_id]
    );
    const position = (maxPos?.max_pos ?? -1) + 1;
    
    const result = await query(
      `INSERT INTO channels (server_id, name, type, position, parent_id, topic)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.server_id,
        input.name,
        input.type || 'text',
        position,
        input.parent_id || null,
        input.topic || null,
      ]
    );
    
    logger.info(`Channel created: ${input.name} (server: ${input.server_id})`);
    return result.rows[0] as Channel;
  }

  async getChannelById(id: number): Promise<Channel | null> {
    return queryOne<Channel>('SELECT * FROM channels WHERE id = $1', [id]);
  }

  async getChannelsByServer(serverId: number): Promise<Channel[]> {
    const result = await query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY position, name',
      [serverId]
    );
    return result.rows as Channel[];
  }

  async getTextChannels(serverId: number): Promise<Channel[]> {
    const result = await query(
      "SELECT * FROM channels WHERE server_id = $1 AND type = 'text' ORDER BY position, name",
      [serverId]
    );
    return result.rows as Channel[];
  }

  async getVoiceChannels(serverId: number): Promise<Channel[]> {
    const result = await query(
      "SELECT * FROM channels WHERE server_id = $1 AND type = 'voice' ORDER BY position, name",
      [serverId]
    );
    return result.rows as Channel[];
  }

  async updateChannel(id: number, data: { name?: string; topic?: string; position?: number }): Promise<Channel | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.topic !== undefined) {
      updates.push(`topic = $${paramIndex++}`);
      values.push(data.topic);
    }
    if (data.position !== undefined) {
      updates.push(`position = $${paramIndex++}`);
      values.push(data.position);
    }
    
    if (updates.length === 0) {
      return this.getChannelById(id);
    }
    
    values.push(id);
    const result = await query(
      `UPDATE channels SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0] as Channel;
  }

  async deleteChannel(id: number): Promise<void> {
    await query('DELETE FROM channels WHERE id = $1', [id]);
    logger.info(`Channel deleted: ${id}`);
  }

  // Create default channels for a new server
  async createDefaultChannels(serverId: number): Promise<Channel[]> {
    const defaultChannels = [
      { name: 'general', type: 'text' as const },
      { name: 'random', type: 'text' as const },
      { name: 'General Voice', type: 'voice' as const },
    ];
    
    const channels: Channel[] = [];
    for (const channel of defaultChannels) {
      const created = await this.createChannel({
        server_id: serverId,
        name: channel.name,
        type: channel.type,
      });
      channels.push(created);
    }
    
    return channels;
  }
}

export const channelService = new ChannelService();
