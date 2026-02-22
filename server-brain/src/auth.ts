import jwt from 'jsonwebtoken';
import { query } from './db/database.js';
import { logger } from './utils/logger.js';
import { randomBytes, createHash } from 'crypto';

// ============================================
// JWT SECRET ROTATION SYSTEM
// ============================================
// Supports multiple active secrets for graceful rotation:
// 1. New tokens are signed with current secret
// 2. Old tokens remain valid until expiry (verified against all secrets)
// 3. Rotation happens on server restart or manual trigger

interface SecretEntry {
  secret: string;
  createdAt: number;
  id: string; // Short ID for identification
}

// Secret rotation configuration
const SECRET_ROTATION_CONFIG = {
  maxSecrets: 3,                    // Keep up to 3 secrets active
  secretMinLength: 32,              // Minimum secret length
  rotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours (checked on startup)
  maxSecretAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days max age for old secrets
};

// Active secrets array (newest first)
let activeSecrets: SecretEntry[] = [];
let currentSecretId: string = '';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate a cryptographically secure secret
function generateSecureSecret(): string {
  return randomBytes(32).toString('hex'); // 64 char hex string
}

// Generate a short ID for secret identification
function generateSecretId(): string {
  return randomBytes(4).toString('hex');
}

// Get the primary JWT secret (from env or generated)
function getPrimarySecret(): string {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= SECRET_ROTATION_CONFIG.secretMinLength) {
    return envSecret;
  }
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable (min 32 chars) is required in production');
  }
  
  logger.warn('JWT_SECRET not set or too short - using auto-generated secret for development');
  return generateSecureSecret();
}

// Initialize secret rotation system
export function initSecretRotation(): void {
  const primarySecret = getPrimarySecret();
  const primaryId = generateSecretId();
  
  // Initialize with primary secret
  activeSecrets = [{
    secret: primarySecret,
    createdAt: Date.now(),
    id: primaryId,
  }];
  currentSecretId = primaryId;
  
  // Add previous secret from env if provided (for rotation scenarios)
  const previousSecret = process.env.JWT_SECRET_PREVIOUS;
  if (previousSecret && previousSecret.length >= SECRET_ROTATION_CONFIG.secretMinLength) {
    activeSecrets.push({
      secret: previousSecret,
      createdAt: Date.now() - 1000, // Slightly older
      id: generateSecretId(),
    });
    logger.info('[Auth] Previous JWT secret loaded for graceful rotation');
  }
  
  // Log rotation status
  logger.info(`[Auth] JWT secret initialized (id: ${primaryId.substring(0, 4)}...)`);
  logger.info(`[Auth] Active secrets: ${activeSecrets.length}`);
}

// Rotate to a new secret (keeps old secrets valid)
export function rotateSecret(): string {
  const newSecret = generateSecureSecret();
  const newId = generateSecretId();
  
  // Add new secret at the front
  activeSecrets.unshift({
    secret: newSecret,
    createdAt: Date.now(),
    id: newId,
  });
  
  // Trim to max secrets (remove oldest)
  while (activeSecrets.length > SECRET_ROTATION_CONFIG.maxSecrets) {
    const removed = activeSecrets.pop();
    if (removed) {
      logger.info(`[Auth] Removed old JWT secret (id: ${removed.id.substring(0, 4)}...)`);
    }
  }
  
  currentSecretId = newId;
  logger.info(`[Auth] JWT secret rotated to new secret (id: ${newId.substring(0, 4)}...)`);
  
  return newId;
}

// Check if rotation is needed based on age
export function checkRotationNeeded(): boolean {
  if (activeSecrets.length === 0) return true;
  
  const currentSecret = activeSecrets[0];
  const age = Date.now() - currentSecret.createdAt;
  
  if (age > SECRET_ROTATION_CONFIG.rotationIntervalMs) {
    logger.info('[Auth] JWT secret age exceeded rotation interval, rotation recommended');
    return true;
  }
  
  return false;
}

// Clean up expired old secrets
function cleanupOldSecrets(): void {
  const now = Date.now();
  const initialLength = activeSecrets.length;
  
  // Keep at least one secret
  if (activeSecrets.length <= 1) return;
  
  // Remove secrets older than max age (but always keep at least the current one)
  activeSecrets = activeSecrets.filter((entry, index) => {
    if (index === 0) return true; // Always keep current
    const age = now - entry.createdAt;
    return age < SECRET_ROTATION_CONFIG.maxSecretAgeMs;
  });
  
  if (activeSecrets.length < initialLength) {
    logger.info(`[Auth] Cleaned up ${initialLength - activeSecrets.length} expired JWT secrets`);
  }
}

// Get current secret for signing
function getCurrentSecret(): string {
  if (activeSecrets.length === 0) {
    initSecretRotation();
  }
  return activeSecrets[0].secret;
}

// Get all valid secrets for verification
function getAllValidSecrets(): string[] {
  return activeSecrets.map(entry => entry.secret);
}

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
  const secret = getCurrentSecret();
  
  return jwt.sign(
    { ...user, iat: now, exp: now + expiresIn, sid: currentSecretId.substring(0, 4) },
    secret,
    { algorithm: 'HS256' }
  );
}

// Verify JWT token - tries all active secrets
export function verifyToken(token: string): UserPayload | null {
  try {
    const secrets = getAllValidSecrets();
    
    // Try each secret (newest first for better cache hit)
    for (const secret of secrets) {
      try {
        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as UserPayload;
        return decoded;
      } catch (err) {
        // Try next secret
        continue;
      }
    }
    
    // No secret worked
    logger.debug('Token verification failed: no matching secret found');
    return null;
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return null;
  }
}

// Get rotation status for admin/monitoring
export function getSecretRotationStatus(): {
  activeSecrets: number;
  currentSecretAge: number;
  currentSecretId: string;
  rotationNeeded: boolean;
} {
  const current = activeSecrets[0];
  return {
    activeSecrets: activeSecrets.length,
    currentSecretAge: current ? Date.now() - current.createdAt : 0,
    currentSecretId: current ? current.id.substring(0, 8) : 'none',
    rotationNeeded: checkRotationNeeded(),
  };
}

// Clean up expired sessions (optional maintenance)
export async function cleanupExpiredSessions(): Promise<number> {
  // Also clean up old JWT secrets
  cleanupOldSecrets();
  return 0;
}

// Initialize on module load
initSecretRotation();

// Periodic cleanup check
setInterval(() => {
  cleanupOldSecrets();
  checkRotationNeeded();
}, 60 * 60 * 1000); // Every hour