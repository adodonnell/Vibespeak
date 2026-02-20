import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  username: string;
  password: string;
  display_name?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

class UserService {
  async createUser(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    
    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, status)
       VALUES ($1, $2, $3, 'online')
       RETURNING *`,
      [input.username, passwordHash, input.display_name || input.username]
    );
    
    logger.info(`User created: ${input.username}`);
    return result.rows[0] as User;
  }

  // Create a guest user (no password required)
  async createGuestUser(username: string): Promise<User> {
    // Generate a random password hash for guest users
    const passwordHash = await bcrypt.hash(Math.random().toString(36).substring(2), 10);
    
    const result = await query(
      `INSERT INTO users (username, password_hash, display_name, status)
       VALUES ($1, $2, $1, 'online')
       ON CONFLICT (username) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [username, passwordHash]
    );
    
    logger.info(`Guest user: ${username}`);
    return result.rows[0] as User;
  }

  async authenticate(input: LoginInput): Promise<User | null> {
    const user = await queryOne<User>(
      'SELECT * FROM users WHERE username = $1',
      [input.username]
    );
    
    if (!user) {
      return null;
    }
    
    const valid = await bcrypt.compare(input.password, user.password_hash);
    if (!valid) {
      return null;
    }
    
    // Update status to online
    await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      ['online', user.id]
    );
    user.status = 'online';
    
    return user;
  }

  async getUserById(id: number): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE username = $1', [username]);
  }

  async updateStatus(userId: number, status: string): Promise<void> {
    await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, userId]
    );
  }

  async updateProfile(userId: number, data: { display_name?: string; avatar_url?: string }): Promise<User | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    
    if (data.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(data.display_name);
    }
    if (data.avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(data.avatar_url);
    }
    
    if (updates.length === 0) {
      return this.getUserById(userId);
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(userId);
    
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    return result.rows[0] as User;
  }

  async getOnlineUsers(): Promise<User[]> {
    const result = await query(
      "SELECT * FROM users WHERE status = 'online' ORDER BY username"
    );
    return result.rows as User[];
  }

  async searchUsers(searchQuery: string, limit = 20): Promise<User[]> {
    const result = await query(
      `SELECT id, username, display_name, avatar_url, status FROM users
       WHERE username ILIKE $1 OR display_name ILIKE $1
       ORDER BY username LIMIT $2`,
      [`%${searchQuery}%`, limit]
    );
    return result.rows as User[];
  }

  // Alias for updateProfile with optional status
  async updateUser(
    userId: number,
    data: { display_name?: string; avatar_url?: string; status?: string }
  ): Promise<User | null> {
    if (data.status) {
      await this.updateStatus(userId, data.status);
    }
    const { status: _status, ...profileData } = data;
    if (Object.keys(profileData).length > 0) {
      return this.updateProfile(userId, profileData);
    }
    return this.getUserById(userId);
  }
}

export const userService = new UserService();
