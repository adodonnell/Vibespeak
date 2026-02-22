import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// Input sanitization utilities
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SEARCH_LENGTH = 100;
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // Script tags
  /javascript:/gi,                                         // JavaScript URLs
  /on\w+\s*=/gi,                                          // Event handlers
  /data:\s*text\/html/gi,                                 // Data URLs with HTML
];

function sanitizeContent(content: string): string {
  if (typeof content !== 'string') return '';
  
  // Trim whitespace
  let sanitized = content.trim();
  
  // Limit length
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH);
  }
  
  // Remove dangerous patterns (basic XSS prevention)
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Escape HTML entities for safe storage/display
  sanitized = sanitized
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#x27;');
  
  return sanitized;
}

function sanitizeSearchTerm(term: string): string {
  if (typeof term !== 'string') return '';
  
  // Remove SQL-like pattern characters
  let sanitized = term.replace(/[%_\\]/g, '\\$&');
  
  // Limit length
  if (sanitized.length > MAX_SEARCH_LENGTH) {
    sanitized = sanitized.substring(0, MAX_SEARCH_LENGTH);
  }
  
  // Remove any null bytes or control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  return sanitized.trim();
}

export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  parent_id: number | null;
  edited_at: Date | null;
  is_pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MessageWithUser extends Message {
  username: string;
  display_name: string | null;
}

export interface MessageWithReactions extends MessageWithUser {
  reactions: ReactionCount[];
}

export interface ReactionCount {
  emoji: string;
  count: number;
  users: number[];
}

export interface CreateMessageInput {
  channel_id: number;
  user_id: number;
  content: string;
  parent_id?: number | undefined;
}

export interface UpdateMessageInput {
  content?: string;
  is_pinned?: boolean;
}

export interface GetMessagesOptions {
  before?: number; // timestamp
  limit?: number;
  include_reactions?: boolean;
}

class MessageService {
  async createMessage(input: CreateMessageInput): Promise<Message> {
    // Sanitize content before storage
    const sanitizedContent = sanitizeContent(input.content);
    
    const result = await query(
      `INSERT INTO messages (channel_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.channel_id, input.user_id, sanitizedContent, input.parent_id || null]
    );
    
    logger.debug(`Message created: channel ${input.channel_id}, user ${input.user_id}`);
    return result.rows[0] as Message;
  }

  async getMessageById(id: number): Promise<Message | null> {
    return queryOne<Message>('SELECT * FROM messages WHERE id = $1', [id]);
  }

  async updateMessage(id: number, input: UpdateMessageInput): Promise<Message | null> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(sanitizeContent(input.content)); // Sanitize on update too
      updates.push(`edited_at = NOW()`);
    }

    if (input.is_pinned !== undefined) {
      updates.push(`is_pinned = $${paramIndex++}`);
      params.push(input.is_pinned);
    }

    if (updates.length === 0) {
      return this.getMessageById(id);
    }

    params.push(id);
    const result = await query(
      `UPDATE messages SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    
    logger.debug(`Message updated: ${id}`);
    return result.rows[0] as Message | null;
  }

  async getMessagesByChannel(
    channelId: number,
    options: GetMessagesOptions = {}
  ): Promise<MessageWithUser[]> {
    const limit = options.limit || 50;
    let sql = `
      SELECT m.*, u.username, u.display_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = $1 AND m.parent_id IS NULL
    `;
    const params: unknown[] = [channelId];
    
    if (options.before) {
      sql += ` AND m.created_at < to_timestamp($2/1000.0)`;
      params.push(options.before);
    }
    
    sql += ` ORDER BY m.is_pinned DESC, m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await query(sql, params);
    return result.rows as MessageWithUser[];
  }

  async getRecentMessages(channelId: number, limit: number = 50): Promise<MessageWithUser[]> {
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1 AND m.parent_id IS NULL
       ORDER BY m.is_pinned DESC, m.created_at DESC
       LIMIT $2`,
      [channelId, limit]
    );
    return result.rows as MessageWithUser[];
  }

  async getReplies(parentId: number): Promise<MessageWithUser[]> {
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.parent_id = $1
       ORDER BY m.created_at ASC`,
      [parentId]
    );
    return result.rows as MessageWithUser[];
  }

  async deleteMessage(id: number): Promise<void> {
    await query('DELETE FROM messages WHERE id = $1', [id]);
    logger.info(`Message deleted: ${id}`);
  }

  async deleteChannelMessages(channelId: number): Promise<void> {
    await query('DELETE FROM messages WHERE channel_id = $1', [channelId]);
    logger.info(`All messages deleted for channel: ${channelId}`);
  }

  async searchMessages(channelId: number, searchTerm: string): Promise<MessageWithUser[]> {
    const sanitizedTerm = sanitizeSearchTerm(searchTerm);
    if (!sanitizedTerm) return [];
    
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1 AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [channelId, `%${sanitizedTerm}%`]
    );
    return result.rows as MessageWithUser[];
  }

  async searchAllMessages(searchTerm: string, limit: number = 50): Promise<MessageWithUser[]> {
    const sanitizedTerm = sanitizeSearchTerm(searchTerm);
    if (!sanitizedTerm) return [];
    
    const result = await query(
      `SELECT m.*, u.username, u.display_name, c.name as channel_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       JOIN channels c ON m.channel_id = c.id
       WHERE m.content ILIKE $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [`%${sanitizedTerm}%`, limit]
    );
    return result.rows as MessageWithUser[];
  }

  // Reaction methods
  async addReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    await query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji]
    );
    logger.debug(`Reaction added: message ${messageId}, user ${userId}, emoji ${emoji}`);
  }

  async removeReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    await query(
      `DELETE FROM message_reactions 
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
    logger.debug(`Reaction removed: message ${messageId}, user ${userId}, emoji ${emoji}`);
  }

  async getReactions(messageId: number): Promise<ReactionCount[]> {
    const result = await query(
      `SELECT emoji, COUNT(*) as count, ARRAY_AGG(user_id) as users
       FROM message_reactions
       WHERE message_id = $1
       GROUP BY emoji`,
      [messageId]
    );
    
    return result.rows.map((row: { emoji: string; count: string; users: number[] }) => ({
      emoji: row.emoji,
      count: parseInt(row.count, 10),
      users: row.users || []
    }));
  }

  async getMessageCount(channelId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM messages WHERE channel_id = $1',
      [channelId]
    );
    return parseInt(result?.count || '0', 10);
  }

  // Cursor-based pagination: get messages before a specific message ID
  async getMessagesBefore(channelId: number, beforeMessageId: number, limit: number = 50): Promise<MessageWithUser[]> {
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1 AND m.parent_id IS NULL AND m.id < $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [channelId, beforeMessageId, limit]
    );
    return result.rows as MessageWithUser[];
  }

  // Cursor-based pagination: get messages after a specific message ID
  async getMessagesAfter(channelId: number, afterMessageId: number, limit: number = 50): Promise<MessageWithUser[]> {
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1 AND m.parent_id IS NULL AND m.id > $2
       ORDER BY m.created_at ASC
       LIMIT $3`,
      [channelId, afterMessageId, limit]
    );
    // Reverse to maintain chronological order
    return (result.rows as MessageWithUser[]).reverse();
  }

  // Batch operations for performance optimization
  async createMessagesBatch(inputs: CreateMessageInput[]): Promise<Message[]> {
    if (inputs.length === 0) return [];
    
    // Build a single INSERT with multiple VALUES
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const input of inputs) {
      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
      values.push(input.channel_id, input.user_id, input.content, input.parent_id || null);
      paramIndex += 4;
    }

    const result = await query(
      `INSERT INTO messages (channel_id, user_id, content, parent_id)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );
    
    logger.debug(`Batch created ${result.rows.length} messages`);
    return result.rows as Message[];
  }

  async updateMessagesBatch(updates: { id: number; content?: string; is_pinned?: boolean }[]): Promise<Message[]> {
    if (updates.length === 0) return [];
    
    // Use a transaction-like approach with individual updates
    // For better performance with many updates, we could use UNNEST but this is simpler
    const results: Message[] = [];
    
    for (const update of updates) {
      const result = await this.updateMessage(update.id, update);
      if (result) results.push(result);
    }
    
    logger.debug(`Batch updated ${results.length} messages`);
    return results;
  }

  async deleteMessagesBatch(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `DELETE FROM messages WHERE id IN (${placeholders})`,
      ids
    );
    
    const deleted = result.rowCount || 0;
    logger.info(`Batch deleted ${deleted} messages`);
    return deleted;
  }

  // Get multiple messages by IDs in a single query
  async getMessagesByIds(ids: number[]): Promise<MessageWithUser[]> {
    if (ids.length === 0) return [];
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `SELECT m.*, u.username, u.display_name
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.id IN (${placeholders})`,
      ids
    );
    
    return result.rows as MessageWithUser[];
  }

  // Bulk pin/unpin messages
  async setPinnedBatch(ids: number[], pinned: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(
      `UPDATE messages SET is_pinned = $${ids.length + 1} WHERE id IN (${placeholders})`,
      [...ids, pinned]
    );
    
    const updated = result.rowCount || 0;
    logger.debug(`Batch ${pinned ? 'pinned' : 'unpinned'} ${updated} messages`);
    return updated;
  }
}

export const messageService = new MessageService();
