import jwt from 'jsonwebtoken';
import { query } from './db/database.js';
import { logger } from './utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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
  display_name?: string;
  is_guest?: boolean;
}

// Username validation (TeamSpeak style - simple alphanumeric)
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

// Generate token for guest/local user (TeamSpeak style)
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

// Clean up expired sessions (optional maintenance)
export async function cleanupExpiredSessions(): Promise<number> {
  // For guest-only auth, we don't have refresh tokens to clean up
  // This is here for future extensibility
  return 0;
}