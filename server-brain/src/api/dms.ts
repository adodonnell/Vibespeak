// Direct Messages API
// Private 1-to-1 conversations between users

import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// DM Conversation (a "room" for 2 users)
export interface DMConversation {
  id: number;
  user1_id: number;  // Lower user ID
  user2_id: number;  // Higher user ID
  created_at: Date;
  last_message_at: Date | null;
  last_message_preview: string | null;
}

// DM Message
export interface DMMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  created_at: Date;
  updated_at: Date | null;
  is_edited: boolean;
  read_at: Date | null;  // When the recipient read it
}

// DM Conversation with user info (for listing)
export interface DMConversationWithUser {
  id: number;
  other_user: {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    status: string;
  };
  last_message: {
    content: string;
    created_at: Date;
    sender_id: number;
    is_read: boolean;
  } | null;
  unread_count: number;
}

class DMService {
  /**
   * Get or create a DM conversation between two users
   * Uses consistent ordering (lower ID first) to prevent duplicates
   */
  async getOrCreateConversation(userId1: number, userId2: number): Promise<DMConversation> {
    // Always store with lower user ID first to prevent duplicates
    const [user1Id, user2Id] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    
    // Try to get existing conversation
    let conversation = await queryOne<DMConversation>(
      'SELECT * FROM dm_conversations WHERE user1_id = $1 AND user2_id = $2',
      [user1Id, user2Id]
    );
    
    if (conversation) {
      return conversation;
    }
    
    // Create new conversation
    const result = await query(
      `INSERT INTO dm_conversations (user1_id, user2_id, created_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [user1Id, user2Id]
    );
    
    conversation = result.rows[0] as DMConversation;
    logger.info(`DM conversation created between users ${user1Id} and ${user2Id}`);
    return conversation;
  }

  /**
   * Get all DM conversations for a user (with last message preview)
   */
  async getConversations(userId: number, limit = 50): Promise<DMConversationWithUser[]> {
    const result = await query(
      `SELECT 
        c.id,
        c.user1_id,
        c.user2_id,
        c.last_message_at,
        c.last_message_preview,
        -- Get the OTHER user's info
        CASE 
          WHEN c.user1_id = $1 THEN u2.id
          ELSE u1.id
        END as other_user_id,
        CASE 
          WHEN c.user1_id = $1 THEN u2.username
          ELSE u1.username
        END as other_username,
        CASE 
          WHEN c.user1_id = $1 THEN u2.display_name
          ELSE u1.display_name
        END as other_display_name,
        CASE 
          WHEN c.user1_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as other_avatar_url,
        CASE 
          WHEN c.user1_id = $1 THEN u2.status
          ELSE u1.status
        END as other_status,
        -- Last message info
        lm.content as last_message_content,
        lm.created_at as last_message_created_at,
        lm.sender_id as last_message_sender_id,
        lm.read_at as last_message_read_at,
        -- Unread count (messages where user is recipient and not read)
        (SELECT COUNT(*) FROM dm_messages m 
         WHERE m.conversation_id = c.id 
         AND m.sender_id != $1 
         AND m.read_at IS NULL) as unread_count
      FROM dm_conversations c
      LEFT JOIN users u1 ON c.user1_id = u1.id
      LEFT JOIN users u2 ON c.user2_id = u2.id
      LEFT JOIN dm_messages lm ON lm.id = (
        SELECT id FROM dm_messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC 
        LIMIT 1
      )
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows.map((row: any) => ({
      id: row.id,
      other_user: {
        id: row.other_user_id,
        username: row.other_username,
        display_name: row.other_display_name,
        avatar_url: row.other_avatar_url,
        status: row.other_status || 'offline',
      },
      last_message: row.last_message_content ? {
        content: row.last_message_preview || row.last_message_content.substring(0, 100),
        created_at: row.last_message_created_at,
        sender_id: row.last_message_sender_id,
        is_read: !!row.last_message_read_at || row.last_message_sender_id === userId,
      } : null,
      unread_count: parseInt(row.unread_count, 10),
    }));
  }

  /**
   * Get messages for a DM conversation
   */
  async getMessages(
    conversationId: number, 
    userId: number,
    options: { limit?: number; before?: number } = {}
  ): Promise<DMMessage[]> {
    const { limit = 50, before } = options;
    
    // Verify user is part of this conversation
    const conversation = await queryOne<DMConversation>(
      'SELECT * FROM dm_conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [conversationId, userId]
    );
    
    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }
    
    let queryText = `
      SELECT * FROM dm_messages 
      WHERE conversation_id = $1
    `;
    const params: any[] = [conversationId];
    
    if (before) {
      queryText += ` AND id < $${params.length + 1}`;
      params.push(before);
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await query(queryText, params);
    return result.rows as DMMessage[];
  }

  /**
   * Send a DM
   */
  async sendMessage(
    senderId: number, 
    recipientId: number, 
    content: string
  ): Promise<DMMessage> {
    // Get or create conversation
    const conversation = await this.getOrCreateConversation(senderId, recipientId);
    
    // Insert message
    const result = await query(
      `INSERT INTO dm_messages (conversation_id, sender_id, content, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [conversation.id, senderId, content]
    );
    
    const message = result.rows[0] as DMMessage;
    
    // Update conversation's last message
    await query(
      `UPDATE dm_conversations 
       SET last_message_at = NOW(), 
           last_message_preview = $1
       WHERE id = $2`,
      [content.substring(0, 100), conversation.id]
    );
    
    logger.debug(`DM sent from ${senderId} to ${recipientId}`);
    return message;
  }

  /**
   * Mark messages as read (when recipient opens the conversation)
   */
  async markAsRead(conversationId: number, userId: number): Promise<void> {
    // Verify user is part of this conversation
    const conversation = await queryOne<DMConversation>(
      'SELECT * FROM dm_conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [conversationId, userId]
    );
    
    if (!conversation) {
      return; // Silently ignore
    }
    
    // Mark all unread messages from the OTHER user as read
    await query(
      `UPDATE dm_messages 
       SET read_at = NOW()
       WHERE conversation_id = $1 
         AND sender_id != $2 
         AND read_at IS NULL`,
      [conversationId, userId]
    );
  }

  /**
   * Edit a DM
   */
  async editMessage(messageId: number, userId: number, content: string): Promise<DMMessage | null> {
    const message = await queryOne<DMMessage>(
      'SELECT * FROM dm_messages WHERE id = $1 AND sender_id = $2',
      [messageId, userId]
    );
    
    if (!message) {
      return null;
    }
    
    const result = await query(
      `UPDATE dm_messages 
       SET content = $1, updated_at = NOW(), is_edited = true
       WHERE id = $2
       RETURNING *`,
      [content, messageId]
    );
    
    // Update conversation preview if this is the last message
    await query(
      `UPDATE dm_conversations 
       SET last_message_preview = $1
       WHERE id = $2 AND last_message_at = $3`,
      [content.substring(0, 100), message.conversation_id, message.created_at]
    );
    
    return result.rows[0] as DMMessage;
  }

  /**
   * Delete a DM (soft delete for sender only, or hard delete if both delete)
   */
  async deleteMessage(messageId: number, userId: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM dm_messages WHERE id = $1 AND sender_id = $2',
      [messageId, userId]
    );
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get DM conversation ID between two users (without creating)
   */
  async getConversationId(userId1: number, userId2: number): Promise<number | null> {
    const [user1Id, user2Id] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    
    const conversation = await queryOne<{ id: number }>(
      'SELECT id FROM dm_conversations WHERE user1_id = $1 AND user2_id = $2',
      [user1Id, user2Id]
    );
    
    return conversation?.id ?? null;
  }

  /**
   * Check if user has unread DMs
   */
  async hasUnreadDMs(userId: number): Promise<boolean> {
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dm_messages m
       JOIN dm_conversations c ON m.conversation_id = c.id
       WHERE (c.user1_id = $1 OR c.user2_id = $1)
         AND m.sender_id != $1
         AND m.read_at IS NULL`,
      [userId]
    );
    
    return parseInt(result?.count || '0', 10) > 0;
  }

  /**
   * Get total unread DM count
   */
  async getUnreadCount(userId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM dm_messages m
       JOIN dm_conversations c ON m.conversation_id = c.id
       WHERE (c.user1_id = $1 OR c.user2_id = $1)
         AND m.sender_id != $1
         AND m.read_at IS NULL`,
      [userId]
    );
    
    return parseInt(result?.count || '0', 10);
  }
}

export const dmService = new DMService();