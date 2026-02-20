// Redis Service for sessions, caching, and presence
import { Redis } from 'ioredis';
import { logger } from './utils/logger.js';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';

let redis: Redis | null = null;
let isRedisAvailable = false;

// Session types
interface SessionData {
  userId: number;
  username: string;
  createdAt: number;
}

// Presence types
interface PresenceData {
  status: 'online' | 'idle' | 'dnd' | 'offline';
  lastSeen: number;
  game?: string;
}

// Initialize Redis connection
export async function initRedis(): Promise<boolean> {
  if (!REDIS_ENABLED) {
    logger.info('[Redis] Redis disabled via REDIS_ENABLED flag');
    return false;
  }

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('[Redis] Max retries reached, giving up');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      reconnectOnError: (err) => {
        logger.error('[Redis] Reconnect on error:', err);
        return true;
      },
    });

    redis.on('connect', () => {
      logger.info('[Redis] Connected to Redis');
      isRedisAvailable = true;
    });

    redis.on('ready', () => {
      logger.info('[Redis] Redis ready');
      isRedisAvailable = true;
    });

    redis.on('error', (err) => {
      logger.error('[Redis] Redis error:', err);
      isRedisAvailable = false;
    });

    redis.on('close', () => {
      logger.warn('[Redis] Redis connection closed');
      isRedisAvailable = false;
    });

    // Test connection
    await redis.ping();
    logger.info('[Redis] Redis ping successful');
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to connect to Redis:', err);
    isRedisAvailable = false;
    return false;
  }
}

// Check if Redis is available
export function isRedisConnected(): boolean {
  return isRedisAvailable && redis !== null;
}

// Get Redis client (for advanced operations)
export function getRedis(): Redis | null {
  return redis;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Create a new session
export async function createSession(sessionId: string, userId: number, username: string): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    const sessionData: SessionData = {
      userId,
      username,
      createdAt: Date.now(),
    };

    await redis.setex(
      `${SESSION_PREFIX}${sessionId}`,
      SESSION_TTL,
      JSON.stringify(sessionData)
    );
    logger.info(`[Redis] Created session for user ${username}`);
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to create session:', err);
    return false;
  }
}

// Get session data
export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!redis || !isRedisAvailable) {
    return null;
  }

  try {
    const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
    if (data) {
      return JSON.parse(data) as SessionData;
    }
    return null;
  } catch (err) {
    logger.error('[Redis] Failed to get session:', err);
    return null;
  }
}

// Delete a session (logout)
export async function deleteSession(sessionId: string): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    await redis.del(`${SESSION_PREFIX}${sessionId}`);
    logger.info(`[Redis] Deleted session ${sessionId.substring(0, 10)}...`);
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to delete session:', err);
    return false;
  }
}

// Refresh session TTL
export async function refreshSession(sessionId: string): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    await redis.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to refresh session:', err);
    return false;
  }
}

// ============================================
// PRESENCE MANAGEMENT
// ============================================

const PRESENCE_PREFIX = 'presence:';
const PRESENCE_TTL = 300; // 5 minutes

// Set user presence
export async function setPresence(userId: number, status: PresenceData['status'], game?: string): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    const presenceData: PresenceData = {
      status,
      lastSeen: Date.now(),
      game,
    };

    await redis.setex(
      `${PRESENCE_PREFIX}${userId}`,
      PRESENCE_TTL,
      JSON.stringify(presenceData)
    );
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to set presence:', err);
    return false;
  }
}

// Get user presence
export async function getPresence(userId: number): Promise<PresenceData | null> {
  if (!redis || !isRedisAvailable) {
    return null;
  }

  try {
    const data = await redis.get(`${PRESENCE_PREFIX}${userId}`);
    if (data) {
      return JSON.parse(data) as PresenceData;
    }
    return null;
  } catch (err) {
    logger.error('[Redis] Failed to get presence:', err);
    return null;
  }
}

// Get multiple users' presence
export async function getMultiplePresence(userIds: number[]): Promise<Map<number, PresenceData>> {
  const result = new Map<number, PresenceData>();
  
  if (!redis || !isRedisAvailable || userIds.length === 0) {
    return result;
  }

  try {
    const keys = userIds.map(id => `${PRESENCE_PREFIX}${id}`);
    const values = await redis.mget(...keys);
    
    values.forEach((value, index) => {
      if (value) {
        result.set(userIds[index], JSON.parse(value) as PresenceData);
      }
    });
    
    return result;
  } catch (err) {
    logger.error('[Redis] Failed to get multiple presence:', err);
    return result;
  }
}

// Mark user as offline
export async function setOffline(userId: number): Promise<boolean> {
  return setPresence(userId, 'offline');
}

// ============================================
// CACHING
// ============================================

const CACHE_PREFIX = 'cache:';

// Cache data with TTL
export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 3600): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    await redis.setex(
      `${CACHE_PREFIX}${key}`,
      ttlSeconds,
      JSON.stringify(value)
    );
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to cache data:', err);
    return false;
  }
}

// Get cached data
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis || !isRedisAvailable) {
    return null;
  }

  try {
    const data = await redis.get(`${CACHE_PREFIX}${key}`);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (err) {
    logger.error('[Redis] Failed to get cached data:', err);
    return null;
  }
}

// Delete cached data
export async function cacheDelete(key: string): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to delete cached data:', err);
    return false;
  }
}

// Clear all cached data
export async function cacheClear(): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    logger.info('[Redis] Cache cleared');
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to clear cache:', err);
    return false;
  }
}

// ============================================
// RATE LIMITING
// ============================================

const RATE_PREFIX = 'rate:';

// Check rate limit
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  if (!redis || !isRedisAvailable) {
    // If Redis is not available, allow the request
    return { allowed: true, remaining: limit, reset: Date.now() + windowSeconds * 1000 };
  }

  try {
    const current = await redis.incr(`${RATE_PREFIX}${key}`);
    
    if (current === 1) {
      await redis.expire(`${RATE_PREFIX}${key}`, windowSeconds);
    }
    
    const ttl = await redis.ttl(`${RATE_PREFIX}${key}`);
    const reset = Date.now() + ttl * 1000;
    const remaining = Math.max(0, limit - current);
    
    return {
      allowed: current <= limit,
      remaining,
      reset,
    };
  } catch (err) {
    logger.error('[Redis] Rate limit check failed:', err);
    return { allowed: true, remaining: limit, reset: Date.now() + windowSeconds * 1000 };
  }
}

// ============================================
// PUB/SUB FOR REAL-TIME
// ============================================

// Subscribe to a channel
export async function subscribe(channel: string, callback: (message: string) => void): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    redis.subscribe(channel);
    redis.on('message', (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to subscribe:', err);
    return false;
  }
}

// Publish to a channel
export async function publish(channel: string, message: unknown): Promise<boolean> {
  if (!redis || !isRedisAvailable) {
    return false;
  }

  try {
    await redis.publish(channel, JSON.stringify(message));
    return true;
  } catch (err) {
    logger.error('[Redis] Failed to publish:', err);
    return false;
  }
}

// ============================================
// HEALTH CHECK
// ============================================

export async function redisHealthCheck(): Promise<{ connected: boolean; latency?: number }> {
  if (!redis || !isRedisAvailable) {
    return { connected: false };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch (err) {
    return { connected: false };
  }
}

// Close Redis connection
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isRedisAvailable = false;
    logger.info('[Redis] Redis connection closed');
  }
}
