import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, queryOne } from './db/database.js';
import { logger } from './utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60 * 1000; // 30 days

// Validate JWT_SECRET at startup - must be set in production
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production');
  }
  logger.warn('JWT_SECRET not set - using insecure default for development only');
}

const getJwtSecret = (): string => {
  if (!JWT_SECRET) {
    return 'vibespeak-dev-secret-do-not-use-in-production';
  }
  if (JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for secure operation');
  }
  return JWT_SECRET;
};

export interface UserPayload {
  id: number;
  username: string;
  email?: string;
  display_name?: string;
  is_guest?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: UserPayload;
  tokens: TokenPair;
}

// Password validation
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
}

// Username validation
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 32) {
    return { valid: false, error: 'Username must be at most 32 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  return { valid: true };
}

// Email validation
export function validateEmail(email: string): { valid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true };
}

// Generate a single access token (for guest sessions and external use)
export function generateToken(user: UserPayload): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseInt((JWT_EXPIRES_IN || '7d').split('d')[0]) * 24 * 60 * 60;
  const secret = getJwtSecret();
  return jwt.sign(
    { ...user, iat: now, exp: now + expiresIn },
    secret,
    { algorithm: 'HS256' }
  );
}

// Generate tokens
function generateTokens(user: UserPayload): TokenPair {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = parseInt(JWT_EXPIRES_IN.split('d')[0]) * 24 * 60 * 60; // Convert to seconds
  const secret = getJwtSecret();
  
  const accessToken = jwt.sign(
    { ...user, iat: now, exp: now + expiresIn },
    secret,
    { algorithm: 'HS256' }
  );
  
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh', iat: now },
    secret,
    { algorithm: 'HS256', expiresIn: '30d' }
  );
  
  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

// Verify JWT token
export function verifyToken(token: string): UserPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as UserPayload;
    return decoded;
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return null;
  }
}


// Register new user
export async function registerUser(
  username: string,
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResult> {
  // Validate inputs
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    throw new Error(usernameValidation.error);
  }
  
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    throw new Error(emailValidation.error);
  }
  
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }
  
  // Check if user exists
  const existingUser = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  
  if (existingUser) {
    throw new Error('Username or email already exists');
  }
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);
  
  // Create user
  const result = await query(
    `INSERT INTO users (username, email, password_hash, display_name, status)
     VALUES ($1, $2, $3, $4, 'online')
     RETURNING id, username, email, display_name`,
    [username, email, passwordHash, displayName || username]
  );
  
  const user = result.rows[0];
  const tokens = generateTokens({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
  });
  
  // Store refresh token
  await storeRefreshToken(user.id, tokens.refreshToken);
  
  logger.info(`User registered: ${username}`);
  
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
    },
    tokens,
  };
}

// Login user
export async function loginUser(
  usernameOrEmail: string,
  password: string
): Promise<AuthResult> {
  // Find user by username or email
  const user = await queryOne<{
    id: number;
    username: string;
    email: string;
    password_hash: string;
    display_name: string;
  }>(
    'SELECT * FROM users WHERE username = $1 OR email = $1',
    [usernameOrEmail]
  );
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }
  
  // Update status
  await query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
    ['online', user.id]
  );
  
  const tokens = generateTokens({
    id: user.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name,
  });
  
  // Store refresh token
  await storeRefreshToken(user.id, tokens.refreshToken);
  
  logger.info(`User logged in: ${user.username}`);
  
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
    },
    tokens,
  };
}

// Refresh token
export async function refreshToken(refreshToken: string): Promise<TokenPair | null> {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(refreshToken, secret, { algorithms: ['HS256'] }) as {
      userId: number;
      type: string;
    };
    
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    // Verify token exists in database
    const storedToken = await queryOne<{ id: number }>(
      'SELECT id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [refreshToken]
    );
    
    if (!storedToken) {
      return null;
    }
    
    // Get user
    const user = await queryOne<UserPayload>(
      'SELECT id, username, email, display_name FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (!user) {
      return null;
    }
    
    // Generate new tokens
    const tokens = generateTokens(user);
    
    // Rotate refresh token
    await rotateRefreshToken(decoded.userId, refreshToken, tokens.refreshToken);
    
    return tokens;
  } catch (error) {
    logger.debug('Token refresh failed:', error);
    return null;
  }
}

// Logout user
export async function logoutUser(userId: number, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    await query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND token_hash = $2',
      [userId, refreshToken]
    );
  } else {
    await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
  }
  logger.info(`User logged out: ${userId}`);
}

// Helper functions
async function storeRefreshToken(userId: number, token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN);
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );
}

async function rotateRefreshToken(
  userId: number,
  oldToken: string,
  newToken: string
): Promise<void> {
  // Delete old token
  await query(
    'DELETE FROM user_sessions WHERE user_id = $1 AND token_hash = $2',
    [userId, oldToken]
  );
  
  // Store new token
  await storeRefreshToken(userId, newToken);
}

// Clean up expired tokens
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await query(
    'DELETE FROM user_sessions WHERE expires_at < NOW()'
  );
  return result.rowCount || 0;
}
