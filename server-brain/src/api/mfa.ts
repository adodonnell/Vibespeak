// MFA/2FA Service with TOTP and Backup Codes - Using Node.js crypto
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// TOTP Configuration
const TOTP_ISSUER = 'VibeSpeak';
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

// Generate a secret for TOTP (base32 encoded)
export function generateSecret(): string {
  return crypto.randomBytes(20).toString('hex');
}

// Generate a TOTP URL for QR code generation
export function generateTOTPUrl(secret: string, username: string): string {
  return `otpauth://totp/${TOTP_ISSUER}:${username}?secret=${secret}&issuer=${TOTP_ISSUER}&digits=${TOTP_DIGITS}`;
}

// Verify a TOTP code using Node.js crypto
export function verifyTOTP(secret: string, token: string): boolean {
  // Simple TOTP implementation using HMAC-SHA1
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  
  for (let i = -1; i <= 1; i++) { // Allow for slight time drift
    const testCounter = counter + i;
    const expectedToken = generateHOTP(secret, testCounter);
    if (expectedToken === token) {
      return true;
    }
  }
  
  return false;
}

// Generate HOTP (HMAC-based One-Time Password)
function generateHOTP(secret: string, counter: number): string {
  // Convert counter to buffer (8 bytes, big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);
  
  // Decode base32 secret
  const key = base32Decode(secret);
  
  // Generate HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = 
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  
  // Generate TOTP code
  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

// Base32 decode helper
function base32Decode(base32: string): Buffer {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  
  for (const char of base32.toUpperCase()) {
    bits += base32Chars.indexOf(char).toString(2).padStart(5, '0');
  }
  
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  
  return Buffer.from(bytes);
}

// Generate backup codes (10 codes, 8 characters each)
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}

// Hash a backup code for storage
export async function hashBackupCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

// Verify a backup code
export async function verifyBackupCode(hashedCode: string, code: string): Promise<boolean> {
  return bcrypt.compare(code, hashedCode);
}

// MFA Service class
class MFAService {
  // Setup MFA for a user
  async setupMFA(userId: number): Promise<{
    secret: string;
    backupCodes: string[];
    totpUrl: string;
  }> {
    // Check if MFA is already setup
    const existing = await this.getMFA(userId);
    if (existing && existing.enabled) {
      throw new Error('MFA is already enabled for this user');
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    
    // Hash backup codes
    const hashedCodes = await Promise.all(
      backupCodes.map(code => hashBackupCode(code))
    );

    // Get username for TOTP URL
    const user = await queryOne<{ username: string }>(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );
    
    const totpUrl = generateTOTPUrl(secret, user?.username || 'user');

    // Store or update MFA secret
    await query(
      `INSERT INTO user_mfa (user_id, secret, backup_codes)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET 
         secret = $2, 
         backup_codes = $3,
         enabled = true,
         updated_at = NOW()`,
      [userId, secret, JSON.stringify(hashedCodes)]
    );

    logger.info(`MFA setup for user ${userId}`);

    return {
      secret,
      backupCodes,
      totpUrl,
    };
  }

  // Get MFA status for a user
  async getMFA(userId: number): Promise<{
    enabled: boolean;
    hasBackupCodes: boolean;
  } | null> {
    const result = await queryOne<{
      enabled: boolean;
      backup_codes: string[];
    }>(
      'SELECT enabled, backup_codes FROM user_mfa WHERE user_id = $1',
      [userId]
    );

    if (!result) return null;

    return {
      enabled: result.enabled,
      hasBackupCodes: result.backup_codes && result.backup_codes.length > 0,
    };
  }

  // Verify MFA code (TOTP or backup code)
  async verifyMFA(userId: number, code: string): Promise<boolean> {
    const mfa = await queryOne<{
      secret: string;
      backup_codes: string[];
      enabled: boolean;
    }>(
      'SELECT secret, backup_codes, enabled FROM user_mfa WHERE user_id = $1',
      [userId]
    );

    if (!mfa || !mfa.enabled) {
      throw new Error('MFA is not enabled for this user');
    }

    // First try TOTP
    if (verifyTOTP(mfa.secret, code)) {
      return true;
    }

    // Then try backup codes
    if (mfa.backup_codes && mfa.backup_codes.length > 0) {
      for (const hashedCode of mfa.backup_codes) {
        const isValid = await verifyBackupCode(hashedCode, code.toUpperCase());
        if (isValid) {
          // Remove used backup code
          await this.removeBackupCode(userId, hashedCode);
          return true;
        }
      }
    }

    return false;
  }

  // Remove a used backup code
  private async removeBackupCode(userId: number, hashedCode: string): Promise<void> {
    const mfa = await queryOne<{ backup_codes: string[] }>(
      'SELECT backup_codes FROM user_mfa WHERE user_id = $1',
      [userId]
    );

    if (!mfa || !mfa.backup_codes) return;

    const updatedCodes = mfa.backup_codes.filter(c => c !== hashedCode);

    await query(
      'UPDATE user_mfa SET backup_codes = $1 WHERE user_id = $2',
      [JSON.stringify(updatedCodes), userId]
    );

    logger.info(`Backup code used and removed for user ${userId}`);
  }

  // Disable MFA for a user
  async disableMFA(userId: number): Promise<void> {
    await query(
      'DELETE FROM user_mfa WHERE user_id = $1',
      [userId]
    );
    logger.info(`MFA disabled for user ${userId}`);
  }

  // Check if MFA is required for login
  async isMFARequired(userId: number): Promise<boolean> {
    const mfa = await this.getMFA(userId);
    return mfa?.enabled || false;
  }
}

export const mfaService = new MFAService();

// Password Reset Service
class PasswordResetService {
  // Generate a password reset token
  async generateResetToken(userId: number): Promise<string> {
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    logger.info(`Password reset token generated for user ${userId}`);
    return token;
  }

  // Verify password reset token
  async verifyResetToken(token: string): Promise<number | null> {
    const result = await queryOne<{
      id: number;
      user_id: number;
      expires_at: Date;
      used_at: Date;
    }>(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
      [token]
    );

    if (!result) return null;
    if (result.used_at) return null;
    if (new Date() > result.expires_at) return null;

    return result.user_id;
  }

  // Use password reset token (mark as used)
  async useResetToken(token: string): Promise<void> {
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1',
      [token]
    );
  }

  // Get user by email for password reset
  async getUserByEmail(email: string): Promise<{ id: number; email: string } | null> {
    return queryOne<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
  }
}

export const passwordResetService = new PasswordResetService();

// Email Verification Service
class EmailVerificationService {
  // Generate email verification token
  async generateVerificationToken(userId: number, email: string): Promise<string> {
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const tokenHash = await bcrypt.hash(token, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing unverified tokens for this email
    await query(
      'DELETE FROM email_verification WHERE email = $1 AND verified = false',
      [email]
    );

    await query(
      `INSERT INTO email_verification (user_id, token_hash, email, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tokenHash, email, expiresAt]
    );

    logger.info(`Email verification token generated for ${email}`);
    return token;
  }

  // Verify email
  async verifyEmail(token: string): Promise<{ userId: number; email: string } | null> {
    const result = await queryOne<{
      id: number;
      user_id: number;
      email: string;
      expires_at: Date;
      verified: boolean;
    }>(
      'SELECT id, user_id, email, expires_at, verified FROM email_verification WHERE token_hash = $1',
      [token]
    );

    if (!result) return null;
    if (result.verified) return null;
    if (new Date() > result.expires_at) return null;

    // Mark as verified
    await query(
      'UPDATE email_verification SET verified = true, verified_at = NOW() WHERE id = $1',
      [result.id]
    );

    // Update user email as verified
    await query(
      'UPDATE users SET email = $1 WHERE id = $2',
      [result.email, result.user_id]
    );

    logger.info(`Email verified: ${result.email}`);

    return {
      userId: result.user_id,
      email: result.email,
    };
  }

  // Check if email is verified
  async isEmailVerified(userId: number): Promise<boolean> {
    const result = await queryOne<{ verified: boolean }>(
      'SELECT verified FROM email_verification WHERE user_id = $1 AND verified = true ORDER BY verified_at DESC LIMIT 1',
      [userId]
    );
    return !!result;
  }
}

export const emailVerificationService = new EmailVerificationService();
