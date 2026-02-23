// Auth Routes for VibeSpeak
// Handles guest authentication and JWT token management

import http from 'http';
import { Router, json, error, parseBody } from './index.js';
import { verifyToken, generateToken, validateUsername } from '../auth.js';
import { memoryStore } from '../db/memory-store.js';
import { isDbAvailable, query, queryOne } from '../db/database.js';
import { logger } from '../utils/logger.js';

// Rate limiting store
const authRateLimits = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_LIMIT = 5; // Max attempts per minute
const RATE_LIMIT_WINDOW = 60000;

export const authRouter = new Router();

// ============================================
// Helper Functions
// ============================================

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    authRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= AUTH_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

function getJwtUser(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7);
  return verifyToken(token);
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// ============================================
// Routes
// ============================================

// GET /api/auth/me - Validate token and return current user
authRouter.get('/api/auth/me', async (req, res) => {
  const jwtUser = getJwtUser(req.headers.authorization || null);
  if (!jwtUser) {
    error(res, 'Unauthorized', 401);
    return;
  }

  // Try to get fresh user data from DB
  if (isDbAvailable()) {
    try {
      const { userService } = await import('../api/users.js');
      const user = await userService.getUserById(jwtUser.id);
      if (user) {
        json(res, {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          status: user.status
        });
        return;
      }
    } catch (err) {
      logger.error('Failed to get user from DB:', err);
    }
  }

  // Fallback: return user data from JWT payload
  json(res, {
    id: jwtUser.id,
    username: jwtUser.username,
    display_name: jwtUser.display_name || jwtUser.username,
    status: 'online'
  });
});

// POST /api/auth/guest - Guest login
authRouter.post('/api/auth/guest', async (req, res) => {
  // Rate limiting
  const clientIp = req.socket.remoteAddress || 'unknown';
  if (!checkAuthRateLimit(clientIp)) {
    error(res, 'Too many authentication attempts. Please try again later.', 429);
    return;
  }

  try {
    const body = await parseBody(req) as { username?: unknown };
    const { username } = body;

    // Validate guest username
    const validation = validateUsername(username as string);
    if (!validation.valid) {
      error(res, validation.error || 'Invalid username', 400);
      return;
    }

    let userId: number | undefined;

    // Try to create/find user in PostgreSQL database
    if (isDbAvailable()) {
      try {
        const { userService } = await import('../api/users.js');
        const dbUser = await userService.getUserByUsername(username as string);
        if (dbUser) {
          userId = dbUser.id;
        } else {
          const newUser = await userService.createGuestUser(username as string);
          userId = newUser.id;
        }
      } catch (err) {
        logger.error('Failed to create user in DB, using memory store:', err);
      }
    }

    // Fallback to memory store if DB didn't work
    if (!userId) {
      let memUser = memoryStore.getUserByUsername(username as string);
      if (!memUser) {
        const bcrypt = await import('bcryptjs');
        memUser = memoryStore.createUser(
          username as string,
          await bcrypt.default.hash(Math.random().toString(36).substring(2), 10)
        );
      }
      userId = memUser.id;
    }

    // Auto-join user to default server
    if (isDbAvailable() && userId) {
      try {
        const { memberService } = await import('../api/members.js');
        await memberService.joinServer(1, userId);
      } catch (_err) {
        // Member might already exist, ignore
      }
    }

    // Issue a JWT for the guest
    const jwtToken = generateToken({ id: userId, username: username as string, display_name: username as string });

    // Also store in sessions map for backward-compat
    const sessionId = generateSessionId();

    json(res, {
      success: true,
      user: { id: userId, username: username as string, display_name: username as string, status: 'online' },
      token: jwtToken,
      tokens: {
        accessToken: jwtToken,
        refreshToken: null,
        expiresIn: 7 * 24 * 60 * 60
      }
    });
  } catch (err) {
    logger.error('Guest login failed:', err);
    error(res, 'Guest login failed', 500);
  }
});

// POST /api/auth/logout - Logout (client-side token invalidation hint)
authRouter.post('/api/auth/logout', async (req, res) => {
  // For guest accounts, logout is client-side only (no server state to clear)
  // The client simply discards the JWT
  json(res, { success: true, message: 'Logged out successfully' });
});
