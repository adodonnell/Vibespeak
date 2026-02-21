import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface MessagePin {
  id: number;
  message_id: number;
  channel_id: number;
  pinned_by: number;
  pinned_at: Date;
}

export interface PinnedMessage extends MessagePin {
  message_content: string;
  username: string;
  display_name: string | null;
}

class PinService {
  // Pin a message
  async pinMessage(messageId: number, channelId: number, pinnedBy: number): Promise<MessagePin> {
    // Check if message exists
    const message = await queryOne<{ id: number }>('SELECT id FROM messages WHERE id = $1', [messageId]);
    if (!message) {
      throw new Error('Message not found');
    }

    // Check if already pinned
    const existing = await this.getPinByMessageId(messageId);
    if (existing) {
      throw new Error('Message is already pinned');
    }

    const result = await query(
      `INSERT INTO message_pins (message_id, channel_id, pinned_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [messageId, channelId, pinnedBy]
    );

    // Also update the message's is_pinned flag
    await query('UPDATE messages SET is_pinned = true WHERE id = $1', [messageId]);

    logger.info(`Message ${messageId} pinned in channel ${channelId}`);
    return result.rows[0] as MessagePin;
  }

  // Unpin a message
  async unpinMessage(messageId: number): Promise<void> {
    const pin = await this.getPinByMessageId(messageId);
    if (!pin) {
      throw new Error('Message is not pinned');
    }

    await query('DELETE FROM message_pins WHERE message_id = $1', [messageId]);
    await query('UPDATE messages SET is_pinned = false WHERE id = $1', [messageId]);

    logger.info(`Message ${messageId} unpinned`);
  }

  // Get pin by message ID
  async getPinByMessageId(messageId: number): Promise<MessagePin | null> {
    return queryOne<MessagePin>(
      'SELECT * FROM message_pins WHERE message_id = $1',
      [messageId]
    );
  }

  // Get all pinned messages in a channel (excluding deleted messages)
  async getPinnedMessages(channelId: number): Promise<PinnedMessage[]> {
    const result = await query(
      `SELECT mp.id, mp.message_id, mp.channel_id, mp.pinned_by, mp.pinned_at, 
              m.content as message_content, u.username, u.display_name
       FROM message_pins mp
       INNER JOIN messages m ON mp.message_id = m.id
       INNER JOIN users u ON m.user_id = u.id
       WHERE mp.channel_id = $1
       ORDER BY mp.pinned_at DESC`,
      [channelId]
    );
    
    // Clean up any dead pins (messages that no longer exist)
    await this.cleanupDeadPins(channelId);
    
    return result.rows as PinnedMessage[];
  }

  // Remove pins for messages that no longer exist (dead pins)
  async cleanupDeadPins(channelId?: number): Promise<number> {
    const channelFilter = channelId ? `AND mp.channel_id = ${channelId}` : '';
    const result = await query(
      `DELETE FROM message_pins mp
       WHERE NOT EXISTS (
         SELECT 1 FROM messages m WHERE m.id = mp.message_id
       ) ${channelFilter}
       RETURNING mp.id`
    );
    
    const deletedCount = result.rows.length;
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} dead pin(s)`);
    }
    return deletedCount;
  }

  // Check if message is pinned
  async isPinned(messageId: number): Promise<boolean> {
    const result = await queryOne(
      'SELECT 1 FROM message_pins WHERE message_id = $1',
      [messageId]
    );
    return !!result;
  }

  // Get pin count for a channel
  async getPinCount(channelId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM message_pins WHERE channel_id = $1',
      [channelId]
    );
    return parseInt(result?.count || '0', 10);
  }

  // Remove all pins for a channel
  async removeAllPins(channelId: number): Promise<void> {
    // First, unpin all messages in the channel
    await query(
      `UPDATE messages SET is_pinned = false 
       WHERE id IN (SELECT message_id FROM message_pins WHERE channel_id = $1)`,
      [channelId]
    );
    
    await query('DELETE FROM message_pins WHERE channel_id = $1', [channelId]);
    logger.info(`All pins removed from channel ${channelId}`);
  }
}

export const pinService = new PinService();
