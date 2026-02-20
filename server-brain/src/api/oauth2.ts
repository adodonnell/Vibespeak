import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface OAuth2Connection {
  id: number;
  user_id: number;
  provider: string; // 'google', 'discord', 'github', etc.
  provider_user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserConnection {
  id: number;
  user_id: number;
  provider: string;
  username: string | null;
  connected_at: Date;
}

class OAuth2Service {
  // Save OAuth2 connection
  async saveConnection(userId: number, provider: string, providerUserId: string, 
    accessToken: string, refreshToken?: string, expiresIn?: number): Promise<OAuth2Connection> {
    
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    const result = await query(
      `INSERT INTO user_connections (user_id, provider, provider_user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, provider) 
       DO UPDATE SET 
         access_token = $4,
         refresh_token = COALESCE($5, user_connections.refresh_token),
         expires_at = $6,
         updated_at = NOW()
       RETURNING *`,
      [userId, provider, providerUserId, accessToken, refreshToken || null, expiresAt]
    );

    logger.info(`OAuth2 connection saved: user ${userId}, provider ${provider}`);
    return result.rows[0] as OAuth2Connection;
  }

  // Get user's connection by provider
  async getConnection(userId: number, provider: string): Promise<OAuth2Connection | null> {
    return queryOne<OAuth2Connection>(
      'SELECT * FROM user_connections WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
  }

  // Get all connections for a user
  async getConnections(userId: number): Promise<UserConnection[]> {
    const result = await query(
      `SELECT id, user_id, provider, username, connected_at
       FROM user_connections
       WHERE user_id = $1
       ORDER BY connected_at DESC`,
      [userId]
    );
    return result.rows as UserConnection[];
  }

  // Check if user has connection
  async hasConnection(userId: number, provider: string): Promise<boolean> {
    const result = await queryOne(
      'SELECT 1 FROM user_connections WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    return !!result;
  }

  // Update access token (refresh)
  async updateAccessToken(userId: number, provider: string, accessToken: string, 
    refreshToken?: string, expiresIn?: number): Promise<void> {
    
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    await query(
      `UPDATE user_connections 
       SET access_token = $1, refresh_token = COALESCE($2, refresh_token), expires_at = $3, updated_at = NOW()
       WHERE user_id = $4 AND provider = $5`,
      [accessToken, refreshToken || null, expiresAt, userId, provider]
    );
  }

  // Delete connection
  async deleteConnection(userId: number, provider: string): Promise<void> {
    await query(
      'DELETE FROM user_connections WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    logger.info(`OAuth2 connection deleted: user ${userId}, provider ${provider}`);
  }

  // Delete all connections for a user
  async deleteAllConnections(userId: number): Promise<void> {
    await query('DELETE FROM user_connections WHERE user_id = $1', [userId]);
    logger.info(`All OAuth2 connections deleted for user ${userId}`);
  }

  // Get connection by provider user ID
  async getConnectionByProviderUser(provider: string, providerUserId: string): Promise<OAuth2Connection | null> {
    return queryOne<OAuth2Connection>(
      'SELECT * FROM user_connections WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId]
    );
  }

  // Link existing account (OAuth to existing user)
  async linkAccount(userId: number, provider: string, providerUserId: string,
    accessToken: string, refreshToken?: string, expiresIn?: number): Promise<OAuth2Connection> {
    
    // Check if already linked
    const existing = await this.getConnection(userId, provider);
    if (existing) {
      throw new Error('Account already linked');
    }

    // Check if provider user ID already linked to another account
    const otherLink = await this.getConnectionByProviderUser(provider, providerUserId);
    if (otherLink) {
      throw new Error('This account is already linked to another user');
    }

    return this.saveConnection(userId, provider, providerUserId, accessToken, refreshToken, expiresIn);
  }

  // Unlink account
  async unlinkAccount(userId: number, provider: string): Promise<void> {
    await this.deleteConnection(userId, provider);
  }

  // Get linked accounts count
  async getConnectionsCount(userId: number): Promise<number> {
    const result = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM user_connections WHERE user_id = $1',
      [userId]
    );
    return parseInt(result?.count || '0', 10);
  }

  // Check if token needs refresh
  async needsRefresh(userId: number, provider: string): Promise<boolean> {
    const connection = await this.getConnection(userId, provider);
    if (!connection || !connection.expires_at) return false;
    
    // Refresh if expires within 5 minutes
    return new Date(connection.expires_at) < new Date(Date.now() + 5 * 60 * 1000);
  }
}

export const oauth2Service = new OAuth2Service();
