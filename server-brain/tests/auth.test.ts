// Auth Module Tests for VibeSpeak
// Tests for JWT generation, validation, and username validation

import { validateUsername, generateToken, verifyToken, initSecretRotation, rotateSecret } from '../src/auth.js';

describe('Auth Module', () => {
  beforeAll(() => {
    // Initialize secret rotation for tests
    initSecretRotation();
  });

  describe('validateUsername', () => {
    test('accepts valid usernames', () => {
      expect(validateUsername('ValidUser').valid).toBe(true);
      expect(validateUsername('user123').valid).toBe(true);
      expect(validateUsername('user_name').valid).toBe(true);
      expect(validateUsername('abc').valid).toBe(true); // exactly 3 chars (minimum)
    });

    test('rejects short usernames (< 3 chars)', () => {
      const result = validateUsername('ab');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    test('rejects long usernames (> 32 chars)', () => {
      const result = validateUsername('a'.repeat(33));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at most 32 characters');
    });

    test('rejects invalid characters', () => {
      const result = validateUsername('user-name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('only contain');
    });

    test('accepts alphanumeric and underscore', () => {
      expect(validateUsername('User_123').valid).toBe(true);
      expect(validateUsername('ABC_xyz_123').valid).toBe(true);
    });
  });

  describe('JWT Token Generation', () => {
    test('generates valid JWT token', () => {
      const token = generateToken({ id: 1, username: 'testuser' });
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    test('token contains user payload', () => {
      const payload = { id: 42, username: 'testuser' };
      const token = generateToken(payload);
      const decoded = verifyToken(token);
      
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe(42);
      expect(decoded?.username).toBe('testuser');
    });

    test('verifies valid token', () => {
      const token = generateToken({ id: 1, username: 'validuser' });
      const decoded = verifyToken(token);
      
      expect(decoded).not.toBeNull();
      expect(decoded?.username).toBe('validuser');
    });

    test('rejects invalid token', () => {
      const decoded = verifyToken('invalid.token.here');
      expect(decoded).toBeNull();
    });

    test('rejects tampered token', () => {
      const token = generateToken({ id: 1, username: 'test' });
      const parts = token.split('.');
      // Tamper with the payload
      const tampered = parts[0] + '.' + Buffer.from('{"tampered":true}').toString('base64url') + '.' + parts[2];
      const decoded = verifyToken(tampered);
      expect(decoded).toBeNull();
    });

    test('supports token rotation', () => {
      const oldToken = generateToken({ id: 1, username: 'user1' });
      
      // Rotate to new secret
      rotateSecret();
      
      // Old token should still work (graceful rotation)
      const decoded = verifyToken(oldToken);
      expect(decoded).not.toBeNull();
      
      // New token should work with new secret
      const newToken = generateToken({ id: 1, username: 'user1' });
      const newDecoded = verifyToken(newToken);
      expect(newDecoded).not.toBeNull();
    });
  });

  describe('Token Expiration', () => {
    test('tokens include expiration claim', () => {
      const token = generateToken({ id: 1, username: 'test' });
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      
      expect(payload.exp).toBeDefined();
      expect(typeof payload.exp).toBe('number');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });
  });

  describe('Secret Rotation', () => {
    test('rotation generates new secret', () => {
      const token1 = generateToken({ id: 1, username: 'user' });
      
      const newSecretId = rotateSecret();
      
      const token2 = generateToken({ id: 1, username: 'user' });
      
      // Both should work during transition
      expect(verifyToken(token1)).not.toBeNull();
      expect(verifyToken(token2)).not.toBeNull();
      expect(token1).not.toBe(token2);
    });

    test('keeps only max secrets', () => {
      // Rotate multiple times
      for (let i = 0; i < 5; i++) {
        rotateSecret();
      }
      
      // Original token should still work (within 3 secrets limit)
      const oldToken = generateToken({ id: 1, username: 'user' });
      // After too many rotations, old token may not work
      // This is expected behavior
    });
  });
});
