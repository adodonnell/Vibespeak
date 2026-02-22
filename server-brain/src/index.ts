import 'dotenv/config';
import { logger } from './utils/logger.js';
import { signalingServer } from './websocket.js';
import { voiceRelayServer } from './voice-relay.js';
import { initDatabase, closeDatabase, isDbAvailable, query, queryOne } from './db/database.js';
import { memoryStore } from './db/memory-store.js';
import { messageService } from './api/messages.js';
import { verifyToken } from './auth.js';
import http from 'http';
import { randomBytes } from 'crypto';

// ============================================
// RATE LIMITING SYSTEM
// ============================================
// Per-IP and per-user rate limiting to prevent abuse

interface RateLimitEntry {
  count: number;
  resetAt: number;
  blocked: boolean;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000,           // 1 minute window
  maxRequestsPerMinute: 100,      // Max requests per minute per IP
  maxMessagesPerMinute: 30,       // Max messages per minute per user
  maxAuthAttemptsPerMinute: 5,    // Max auth attempts per minute per IP
};

function checkRateLimit(key: string, maxRequests: number): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetAt) {
    // Create new window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_CONFIG.windowMs,
      blocked: false,
    });
    return { allowed: true, remaining: maxRequests - 1, resetIn: RATE_LIMIT_CONFIG.windowMs };
  }
  
  if (entry.count >= maxRequests) {
    entry.blocked = true;
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }
  
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ============================================
// ADMIN TOKEN SYSTEM (TeamSpeak-style)
// ============================================
// Single-use token generated on server startup.
// Share with trusted users to grant admin privileges.
let adminToken: string | null = null;

function generateAdminToken(): string {
  return randomBytes(16).toString('hex'); // 32-char hex string
}

const PORT = parseInt(process.env.PORT || '3001');
const WS_PORT = parseInt(process.env.WS_PORT || '3002');

// CORS configuration - restrict in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];
const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.includes('*');
const isProduction = process.env.NODE_ENV === 'production';

// Security headers applied to every response
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Validation helpers (manual implementation since we're using native HTTP)
function isValidUsername(username: unknown): boolean {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

// Email validation - used for registration
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password validation - used for registration
export function isValidPassword(password: unknown): boolean {
  return typeof password === 'string' && password.length >= 8;
}

function isValidMessageContent(content: unknown): boolean {
  return typeof content === 'string' && content.length > 0 && content.length <= 4000;
}

function isValidEmoji(emoji: unknown): boolean {
  return typeof emoji === 'string' && emoji.length >= 1 && emoji.length <= 10;
}

interface ServerConnection {
  id: string;
  address: string;
  port: number;
  connected: boolean;
  clients: number;
}

const activeServers: Map<string, ServerConnection> = new Map();
const sessions: Map<string, { userId: number; username: string }> = new Map();

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

async function main() {
  logger.info('=== VibeSpeak Server Starting ===');
  
  try {
    initDatabase();
    logger.info('Database initialized');
  } catch (err) {
    logger.error('Failed to initialize database:', err);
  }
  
  memoryStore.initialize();
  logger.info('Memory store initialized (fallback mode)');
  
  // Generate and log admin token (TeamSpeak-style)
  adminToken = generateAdminToken();
  logger.info('');
  logger.info('╔════════════════════════════════════════════════════════════╗');
  logger.info('║                    ADMIN TOKEN                             ║');
  logger.info('╠════════════════════════════════════════════════════════════╣');
  logger.info(`║  Code: ${adminToken}                                    ║`);
  logger.info('║                                                            ║');
  logger.info('║  Share this code with trusted users to grant them admin    ║');
  logger.info('║  privileges. The code is single-use and will be consumed   ║');
  logger.info('║  after one successful claim.                               ║');
  logger.info('╚════════════════════════════════════════════════════════════╝');
  logger.info('');
  
  signalingServer.start(WS_PORT);
  logger.info(`WebSocket signaling server on port ${WS_PORT}`);
  
  voiceRelayServer.start();
  logger.info('Voice relay server started on UDP');
  
  const getDbStatus = () => {
    try { return isDbAvailable(); } catch { return false; }
  };

  const getJwtUser = (authHeader: string | null) => {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    return verifyToken(token);
  };

  const server = http.createServer(async (req, res) => {
    // CORS: Allow all origins if * is in ALLOWED_ORIGINS
    const origin = req.headers.origin;
    
    // If allowing all origins, use wildcard (but can't use wildcard with credentials)
    if (ALLOW_ALL_ORIGINS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (isProduction && origin && !ALLOWED_ORIGINS.includes(origin)) {
      // In production with specific origins, reject unknown origins
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Forbidden - origin not allowed' }));
      return;
    } else {
      // Echo specific origin - wildcard + credentials is rejected by browsers
      const allowedOrigin = isProduction
        ? (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
        : (origin || ALLOWED_ORIGINS[0]);
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Apply security headers to every response
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    const parseBody = async () => {
      let body = '';
      for await (const chunk of req) { body += chunk; }
      return body ? JSON.parse(body) : {};
    };

    const getSession = (authHeader: string | null) => {
      if (!authHeader?.startsWith('Bearer ')) return null;
      return sessions.get(authHeader.substring(7));
    };

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), database: getDbStatus() ? 'connected' : 'memory', voiceRelay: 'running' }));
      return;
    }

    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'VibeSpeak Server', version: '1.0.0', status: 'running', database: getDbStatus() ? 'connected' : 'memory', services: { websocket: `ws://localhost:${WS_PORT}`, http: `http://localhost:${PORT}`, voiceRelay: 'udp://localhost:9988' }, voiceStats: voiceRelayServer.getStats() }));
      return;
    }

    // GET /api/users/online - Get all online users
    if (url.pathname === '/api/users/online' && req.method === 'GET') {
      const onlineUsers = Array.from(sessions.values()).map(s => ({ id: s.userId, username: s.username, status: 'online' }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(onlineUsers));
      return;
    }

    // GET /api/voice-channels - Get voice channels from DB or memory
    if (url.pathname === '/api/voice-channels' && req.method === 'GET') {
      // First get voice channels from database
      let dbChannels: any[] = [];
      if (getDbStatus()) {
        try {
          const { channelService } = await import('./api/channels.js');
          dbChannels = await channelService.getVoiceChannels(1);
        } catch (err) {
          logger.error('Failed to get voice channels from DB:', err);
        }
      }
      
      // Get active rooms from WebSocket
      const rooms = signalingServer.getAllRooms();
      
      // Default voice channels if no DB
      const defaultVoiceChannels = [
        { name: 'General Voice', type: 'voice' },
        { name: 'Lounge', type: 'voice' },
        { name: 'Gaming', type: 'voice' },
        { name: 'Music', type: 'voice' },
      ];
      
      // Use DB channels or defaults
      const channelList = dbChannels.length > 0 ? dbChannels : defaultVoiceChannels;
      
      // Map channels to response format, merging with active users
      const voiceChannels = channelList.map((ch: any) => {
        const room = rooms.find(r => r.roomId === ch.name);
        const users = room ? room.users.map((user: any) => ({
          clientId: user.clientId,
          username: user.username
        })) : [];
        return { channelId: ch.name, users };
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(voiceChannels));
      return;
    }
    
    // GET /api/auth/me - Validate token and return current user
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      // Try to get fresh user data from DB
      if (getDbStatus()) {
        try {
          const { userService } = await import('./api/users.js');
          const user = await userService.getUserById(jwtUser.id);
          if (user) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              id: user.id, 
              username: user.username, 
              display_name: user.display_name,
              avatar_url: user.avatar_url,
              status: user.status 
            }));
            return;
          }
        } catch (err) {
          logger.error('Failed to get user from DB:', err);
        }
      }
      
      // Fallback: return user data from JWT payload
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        id: jwtUser.id, 
        username: jwtUser.username, 
        display_name: jwtUser.display_name || jwtUser.username,
        status: 'online' 
      }));
      return;
    }

    // POST /api/auth/guest
    if (url.pathname === '/api/auth/guest' && req.method === 'POST') {
      try {
        const { username } = await parseBody();
        // Validate guest username
        if (!isValidUsername(username)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid username: must be 3-32 alphanumeric characters' })); return; }
        
        let userId: number | undefined;
        
        // C1: Block guest from impersonating a registered account (one that has an email set)
        if (getDbStatus()) {
          try {
            const { userService } = await import('./api/users.js');
            const existingCheck = await userService.getUserByUsername(username) as any;
            if (existingCheck && existingCheck.email) {
              res.writeHead(409);
              res.end(JSON.stringify({ error: 'That username belongs to a registered account. Please log in instead.' }));
              return;
            }
          } catch (_) { /* DB error — let normal flow continue */ }
        }
        
        // Try to create/find user in PostgreSQL database
        if (getDbStatus()) {
          try {
            const { userService } = await import('./api/users.js');
            const dbUser = await userService.getUserByUsername(username);
            if (dbUser) {
              userId = dbUser.id;
            } else {
              const newUser = await userService.createGuestUser(username);
              userId = newUser.id;
            }
          } catch (err) {
            logger.error('Failed to create user in DB, using memory store:', err);
          }
        }
        
        // Fallback to memory store if DB didn't work
        if (!userId) {
          let memUser = memoryStore.getUserByUsername(username);
          if (!memUser) {
            const bcrypt = await import('bcryptjs');
            memUser = memoryStore.createUser(username, await bcrypt.default.hash(Math.random().toString(36).substring(2), 10));
          }
          userId = memUser.id;
        }

        // Auto-join user to default server
        if (getDbStatus() && userId) {
          try {
            const { memberService } = await import('./api/members.js');
            await memberService.joinServer(1, userId);
          } catch (_err) {
            // Member might already exist, ignore
          }
        }
        
        // Issue a real JWT for the guest (same format as registered users)
        // This ensures guest users can access all JWT-protected endpoints
        const { generateToken } = await import('./auth.js');
        const jwtToken = generateToken({ id: userId, username, display_name: username });
        
        // Also store in sessions map for backward-compat (session-based paths)
        const sessionId = generateSessionId();
        sessions.set(sessionId, { userId, username });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          user: { id: userId, username, display_name: username, status: 'online' }, 
          token: jwtToken,  // Return JWT so client can use Bearer auth
          tokens: {
            accessToken: jwtToken,
            refreshToken: null,  // Guests don't get refresh tokens
            expiresIn: 7 * 24 * 60 * 60
          }
        }));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Guest login failed' })); }
      return;
    }

    // ============================================
    // PRESENCE API
    // ============================================

    // GET /api/users/:id/presence - Get user presence
    if (url.pathname.match(/^\/api\/users\/\d+\/presence$/) && req.method === 'GET') {
      const userId = parseInt(url.pathname.split('/')[3]);
      
      try {
        const { getPresence } = await import('./redis.js');
        const presence = await getPresence(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(presence || { status: 'offline' }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'offline' }));
      }
      return;
    }

    // POST /api/users/presence - Update presence
    if (url.pathname === '/api/users/presence' && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      try {
        const { status, game } = await parseBody();
        if (!status) { res.writeHead(400); res.end(JSON.stringify({ error: 'Status required' })); return; }
        
        const { setPresence } = await import('./redis.js');
        await setPresence(jwtUser.id, status, game);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // ============================================
    // READ RECEIPTS API
    // ============================================

    // POST /api/channels/:id/read - Mark channel as read
    if (url.pathname.match(/^\/api\/channels\/\d+\/read$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (!getDbStatus()) { 
        // Gracefully handle memory mode - just return success
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, note: 'Memory mode - read state not persisted' }));
        return;
      }
      
      const channelId = parseInt(url.pathname.split('/')[3]);
      
      try {
        const { message_id } = await parseBody();
        
        await query(
          `INSERT INTO read_state (user_id, channel_id, message_id, read_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, channel_id) DO UPDATE SET message_id = $3, read_at = NOW()`,
          [jwtUser.id, channelId, message_id || null]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { 
        logger.error('Failed to mark channel as read:', err);
        // Return success anyway - read state is non-critical
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, note: 'Read state not saved' }));
      }
      return;
    }

    // GET /api/channels/:id/read - Get read state for channel
    if (url.pathname.match(/^\/api\/channels\/\d+\/read$/) && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (!getDbStatus()) { 
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message_id: null, read_at: null }));
        return;
      }
      
      const channelId = parseInt(url.pathname.split('/')[3]);
      
      try {
        const result = await queryOne(
          'SELECT message_id, read_at FROM read_state WHERE user_id = $1 AND channel_id = $2',
          [jwtUser.id, channelId]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result || { message_id: null, read_at: null }));
      } catch (err) { 
        logger.error('Failed to get read state:', err);
        // Return empty state on error - non-critical
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message_id: null, read_at: null }));
      }
      return;
    }

    // ============================================
    // AUDIT LOG API
    // ============================================

    // GET /api/servers/:id/audit-logs - Get audit logs
    if (url.pathname.match(/^\/api\/servers\/\d+\/audit-logs$/) && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (!getDbStatus()) { res.writeHead(200); res.end(JSON.stringify([])); return; }
      
      const serverId = parseInt(url.pathname.split('/')[3]);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      try {
        const result = await query(
          `SELECT al.*, u.username as actor_username
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           WHERE al.server_id = $1
           ORDER BY al.created_at DESC
           LIMIT $2`,
          [serverId, limit]
        );
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // GET /api/messages/:channelId
    if (url.pathname.startsWith('/api/messages/') && req.method === 'GET') {
      // Require auth — guest tokens count. This prevents anonymous scraping of chat history.
      const jwtUserRead = getJwtUser(req.headers.authorization || null);
      if (!jwtUserRead) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const channelId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(channelId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid channel ID' })); return; }

      // Pagination parameters
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100); // Max 100
      const before = url.searchParams.get('before'); // Message ID cursor
      const after = url.searchParams.get('after');   // Message ID cursor
      const beforeTimestamp = url.searchParams.get('beforeTimestamp'); // Timestamp cursor
      
      // Check If-None-Match header for ETag caching
      const ifNoneMatch = req.headers['if-none-match'];
      
      // Use PostgreSQL if available, fallback to memory store
      if (getDbStatus()) {
        try {
          let messages: any[];
          let hasMore = false;
          let nextCursor: string | null = null;
          let prevCursor: string | null = null;
          
          if (before) {
            // Get messages before a specific message ID (older messages)
            messages = await messageService.getMessagesBefore(channelId, parseInt(before), limit + 1);
            hasMore = messages.length > limit;
            if (hasMore) messages = messages.slice(0, limit);
            if (messages.length > 0) {
              nextCursor = messages[messages.length - 1].id.toString();
              prevCursor = messages[0].id.toString();
            }
          } else if (after) {
            // Get messages after a specific message ID (newer messages)
            messages = await messageService.getMessagesAfter(channelId, parseInt(after), limit + 1);
            hasMore = messages.length > limit;
            if (hasMore) messages = messages.slice(0, limit);
            if (messages.length > 0) {
              prevCursor = messages[messages.length - 1].id.toString();
              nextCursor = messages[0].id.toString();
            }
          } else if (beforeTimestamp) {
            // Legacy timestamp-based pagination
            messages = await messageService.getMessagesByChannel(channelId, { 
              before: parseInt(beforeTimestamp), 
              limit: limit + 1 
            });
            hasMore = messages.length > limit;
            if (hasMore) messages = messages.slice(0, limit);
          } else {
            // Initial load - get most recent messages
            messages = await messageService.getRecentMessages(channelId, limit + 1);
            hasMore = messages.length > limit;
            if (hasMore) messages = messages.slice(0, limit);
            if (messages.length > 0) {
              nextCursor = messages[messages.length - 1].id.toString();
            }
          }
          
          // Reverse for chronological order (oldest first)
          const reversed = messages.reverse();
          
          // Generate ETag from message IDs and timestamps (fast hash)
          const etagData = reversed.map((m: any) => `${m.id}:${m.updated_at?.getTime() || m.created_at?.getTime()}`).join(',');
          const { createHash } = await import('crypto');
          const etag = `"${createHash('md5').update(etagData || 'empty').digest('hex').substring(0, 16)}"`;
          
          // Check if client has cached version
          if (ifNoneMatch === etag) {
            res.writeHead(304); // Not Modified
            res.end();
            return;
          }
          
          // Build pagination response
          const response: any = {
            messages: reversed,
            pagination: {
              hasMore,
              limit,
              nextCursor,
              prevCursor,
            }
          };
          
          res.writeHead(200, { 
            'Content-Type': 'application/json',
            'ETag': etag,
            'Cache-Control': 'private, max-age=5' // 5 seconds client cache
          });
          res.end(JSON.stringify(response));
          return;
        } catch (err) {
          logger.error('Failed to get messages from DB:', err);
        }
      }
      
      // Fallback to memory store
      const messages = memoryStore.getMessages(channelId, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: messages.reverse(), pagination: { hasMore: false, limit } }));
      return;
    }

    // POST /api/messages
    if (url.pathname === '/api/messages' && req.method === 'POST') {
      const session = getSession(req.headers.authorization || null);
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!session && !jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const userId = jwtUser ? jwtUser.id : (session ? session.userId : 0);
      const username = jwtUser ? jwtUser.username : (session ? session.username : 'Unknown');
      
      // Rate limiting: max 30 messages per minute per user
      const clientIp = req.socket.remoteAddress || 'unknown';
      const rateLimitKey = `msg:${userId}:${clientIp}`;
      const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG.maxMessagesPerMinute);
      
      if (!rateLimit.allowed) {
        res.writeHead(429, { 
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.maxMessagesPerMinute),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
        });
        res.end(JSON.stringify({ 
          error: 'Too many requests', 
          message: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`,
          retryAfter: rateLimit.resetIn 
        }));
        return;
      }
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.maxMessagesPerMinute));
      res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetIn / 1000)));
      
      try {
        const { channel_id, content, parent_id } = await parseBody();
        
        // Validate inputs
        if (!channel_id) { res.writeHead(400); res.end(JSON.stringify({ error: 'Channel ID required' })); return; }
        if (!isValidMessageContent(content)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message content: must be 1-4000 characters' })); return; }
        
        // Use PostgreSQL if available, fallback to memory store
        if (getDbStatus()) {
          try {
            const message = await messageService.createMessage({
              channel_id: parseInt(channel_id),
              user_id: userId,
              content,
              parent_id: parent_id ? parseInt(parent_id) : undefined
            });
            
            // Broadcast new message to WebSocket clients
            const messageData = {
              id: message.id,
              channel_id: message.channel_id,
              user_id: message.user_id,
              content: message.content,
              created_at: message.created_at,
              username: username
            };
            signalingServer.broadcastToRoom(channel_id.toString(), {
              type: 'new-message',
              data: messageData
            });
            
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(message));
            return;
          } catch (err: any) {
            logger.error('Failed to create message in DB:', err);
            // Check if it's a foreign key error - user doesn't exist in DB
            if (err.code === '23503') {
              logger.info('User not found in DB, falling back to memory store');
            } else {
              // For other errors, try memory store anyway
              logger.info('DB error, falling back to memory store');
            }
          }
        }
        
        // Fallback to memory store
        let memUsername = 'Unknown';
        if (userId && jwtUser) {
          memUsername = jwtUser.username;
        } else if (userId) {
          const userObj = memoryStore.getUserById(userId);
          memUsername = userObj?.username || 'Unknown';
        }
        const message = memoryStore.createMessage(parseInt(channel_id), userId || 0, content, memUsername);
        
        // Broadcast new message to WebSocket clients
        signalingServer.broadcastToRoom(channel_id.toString(), {
          type: 'new-message',
          data: {
            id: message.id,
            channel_id: parseInt(channel_id),
            user_id: userId || 0,
            content: message.content,
            created_at: message.created_at,
            username: memUsername
          }
        });
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(message));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to send' })); }
      return;
    }


    // PATCH /api/messages/:id - Edit message
    if (url.pathname.startsWith('/api/messages/') && req.method === 'PATCH') {
      const session = getSession(req.headers.authorization || null);
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!session && !jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const messageId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(messageId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message ID' })); return; }

      const userId = jwtUser ? jwtUser.id : (session ? session.userId : 0);
      
      if (getDbStatus() && messageId < 2147483647) {
        try {
          const { content, is_pinned } = await parseBody();
          const message = await messageService.getMessageById(messageId);
          
          if (!message) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'Message not found' })); return;
          }
          
          // Check if user owns the message
          if (message.user_id !== userId) {
            res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return;
          }
          
          const updated = await messageService.updateMessage(messageId, { content, is_pinned });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(updated));
          return;
        } catch (err: any) {
          logger.error('Failed to update message in DB:', err);
        }
      }
      
      res.writeHead(404); res.end(JSON.stringify({ error: 'Message not found' }));
      return;
    }

    // DELETE /api/messages/:id - Delete message
    if (url.pathname.startsWith('/api/messages/') && req.method === 'DELETE') {
      const session = getSession(req.headers.authorization || null);
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!session && !jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const messageId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(messageId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message ID' })); return; }

      const userId = jwtUser ? jwtUser.id : (session ? session.userId : 0);
      
      if (getDbStatus()) {
        try {
          const message = await messageService.getMessageById(messageId);
          
          if (!message) {
            res.writeHead(404); res.end(JSON.stringify({ error: 'Message not found' })); return;
          }
          
          // Check if user owns the message
          if (message.user_id !== userId) {
            res.writeHead(403); res.end(JSON.stringify({ error: 'Forbidden' })); return;
          }
          
          await messageService.deleteMessage(messageId);
          res.writeHead(200); res.end(JSON.stringify({ success: true }));
          return;
        } catch (err) {
          logger.error('Failed to delete message:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // POST /api/messages/:id/reactions - Add reaction
    if (url.pathname.match(/^\/api\/messages\/\d+\/reactions$/) && req.method === 'POST') {
      const session = getSession(req.headers.authorization || null);
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!session && !jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const messageId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(messageId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message ID' })); return; }

      const userId = jwtUser ? jwtUser.id : (session ? session.userId : 0);
      
      if (getDbStatus()) {
        try {
        const { emoji } = await parseBody();
          if (!emoji) { res.writeHead(400); res.end(JSON.stringify({ error: 'Emoji required' })); return; }
          if (!isValidEmoji(emoji)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid emoji' })); return; }
          
          await messageService.addReaction(messageId, userId, emoji);
          const reactions = await messageService.getReactions(messageId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reactions));
          return;
        } catch (err) {
          logger.error('Failed to add reaction:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // DELETE /api/messages/:id/reactions/:emoji - Remove reaction
    if (url.pathname.match(/^\/api\/messages\/\d+\/reactions\/[^\/]+$/) && req.method === 'DELETE') {
      const session = getSession(req.headers.authorization || null);
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!session && !jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      const parts = url.pathname.split('/');
      const messageId = parseInt(parts[3]);
      const emoji = decodeURIComponent(parts[5]);
      
      if (isNaN(messageId) || !emoji) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid parameters' })); return; }

      const userId = jwtUser ? jwtUser.id : (session ? session.userId : 0);
      
      if (getDbStatus()) {
        try {
          await messageService.removeReaction(messageId, userId, emoji);
          const reactions = await messageService.getReactions(messageId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reactions));
          return;
        } catch (err) {
          logger.error('Failed to remove reaction:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // GET /api/messages/:id/reactions - Get reactions
    if (url.pathname.match(/^\/api\/messages\/\d+\/reactions$/) && req.method === 'GET') {
      const messageId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(messageId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message ID' })); return; }
      
      if (getDbStatus()) {
        try {
          const reactions = await messageService.getReactions(messageId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reactions));
          return;
        } catch (err) {
          logger.error('Failed to get reactions:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // GET /api/messages/:id/replies - Get message replies
    if (url.pathname.match(/^\/api\/messages\/\d+\/replies$/) && req.method === 'GET') {
      const messageId = parseInt(url.pathname.split('/')[3]);
      if (isNaN(messageId)) { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid message ID' })); return; }
      
      if (getDbStatus()) {
        try {
          const replies = await messageService.getReplies(messageId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(replies));
          return;
        } catch (err) {
          logger.error('Failed to get replies:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // GET /api/search - Global message search
    if (url.pathname === '/api/search' && req.method === 'GET') {
      const searchTerm = url.searchParams.get('q');
      if (!searchTerm) { res.writeHead(400); res.end(JSON.stringify({ error: 'Search query required' })); return; }
      
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      if (getDbStatus()) {
        try {
          const results = await messageService.searchAllMessages(searchTerm, limit);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
          return;
        } catch (err) {
          logger.error('Failed to search messages:', err);
        }
      }
      
      res.writeHead(500); res.end(JSON.stringify({ error: 'Database unavailable' }));
      return;
    }

    // GET /api/channels/:serverId
    if (url.pathname.startsWith('/api/channels/') && req.method === 'GET') {
      // Get channels from database if available, otherwise use memory store
      if (getDbStatus()) {
        try {
          const { channelService } = await import('./api/channels.js');
          const serverId = parseInt(url.pathname.split('/')[3]);
          const channels = await channelService.getChannelsByServer(serverId || 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(channels));
          return;
        } catch (err) {
          logger.error('Failed to get channels from DB:', err);
        }
      }
      res.writeHead(200); res.end(JSON.stringify(memoryStore.getChannels()));
      return;
    }

    // POST /api/channels - Create channel (authenticated users only)
    if (url.pathname === '/api/channels' && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { server_id, name, type, topic } = await parseBody();
        if (!server_id || !name) { res.writeHead(400); res.end(JSON.stringify({ error: 'server_id and name required' })); return; }
        const { channelService } = await import('./api/channels.js');
        const channel = await channelService.createChannel({ server_id: parseInt(server_id), name, type: type || 'text', topic });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(channel));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // Server connect/disconnect endpoints
    if (url.pathname === '/api/server/connect' && req.method === 'POST') {
      try {
        const { address, port, username } = await parseBody();
        if (!address || !username) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing fields' })); return; }
        const serverId = `server_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        activeServers.set(serverId, { id: serverId, address, port: port || 9987, connected: true, clients: 1 });
        logger.info(`User "${username}" connecting to ${address}:${port || 9987}`);
        res.writeHead(200); res.end(JSON.stringify({ success: true, serverId, address, port: port || 9987, username, channels: memoryStore.getChannels() }));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Connection failed' })); }
      return;
    }

    if (url.pathname === '/api/server/status' && req.method === 'GET') {
      const serverId = url.searchParams.get('serverId');
      if (serverId && activeServers.has(serverId)) { res.writeHead(200); res.end(JSON.stringify(activeServers.get(serverId))); return; }
      res.writeHead(200); res.end(JSON.stringify({ servers: Array.from(activeServers.values()) }));
      return;
    }

    if (url.pathname === '/api/server/disconnect' && req.method === 'POST') {
      try {
        const { serverId } = await parseBody();
        if (serverId && activeServers.has(serverId)) { activeServers.delete(serverId); res.writeHead(200); res.end(JSON.stringify({ success: true })); return; }
        res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // ============================================
    // SERVERS API
    // ============================================
    
    // GET /api/servers - List servers the current user is a member of
    if (url.pathname === '/api/servers' && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 1, name: 'Main Server', owner_id: 1 }]));
        return;
      }
      try {
        const { serverService } = await import('./api/servers.js');
        if (jwtUser) {
          let servers = await serverService.getServersByUser(jwtUser.id);
          if (servers.length === 0) {
            const defaultServer = await serverService.getServer(1);
            if (defaultServer) {
              try { const { memberService } = await import('./api/members.js'); await memberService.joinServer(1, jwtUser.id); } catch (_) {}
              servers = [defaultServer];
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(servers));
        } else {
          const defaultServer = await serverService.getServer(1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(defaultServer ? [defaultServer] : [{ id: 1, name: 'Main Server', owner_id: 1 }]));
        }
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers - Create server
    // Set DISABLE_SERVER_CREATION=true in .env to lock this instance to pre-seeded servers
    if (url.pathname === '/api/servers' && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (process.env.DISABLE_SERVER_CREATION === 'true') {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Server creation is disabled on this instance.' }));
        return;
      }
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { name } = await parseBody();
        const { serverService } = await import('./api/servers.js');
        const server = await serverService.createServer({ name, owner_id: jwtUser.id });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(server));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // GET /api/servers/:id - Get server with channels
    if (url.pathname.match(/^\/api\/servers\/\d+$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: serverId, name: 'Main Server', owner_id: 1, channels: memoryStore.getChannels() }));
        return;
      }
      try {
        const { serverService } = await import('./api/servers.js');
        const { channelService } = await import('./api/channels.js');
        const server = await serverService.getServer(serverId);
        const channels = await channelService.getChannelsByServer(serverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...server, channels }));
      } catch (err) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); }
      return;
    }

    // DELETE /api/servers/:id - Delete server
    if (url.pathname.match(/^\/api\/servers\/\d+$/) && req.method === 'DELETE') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { serverService } = await import('./api/servers.js');
        await serverService.deleteServer(serverId, jwtUser.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(403); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // MEMBERS API
    // ============================================

    // GET /api/servers/:id/members - Get server members
    if (url.pathname.match(/^\/api\/servers\/\d+\/members$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        // In memory mode, return all currently-connected users as members
        const onlineMembers = Array.from(sessions.entries()).map(([, s], idx) => ({
          id: idx + 1,
          user_id: s.userId,
          username: s.username,
          nickname: null,
          roles: [],
          status: 'online',
          isAdmin: false,
        }));
        // Also include users from memoryStore (registered via guest login)
        const memUsers = memoryStore.getOnlineUsers();
        const memUserIds = new Set(onlineMembers.map(m => m.user_id));
        for (const u of memUsers) {
          if (!memUserIds.has(u.id)) {
            onlineMembers.push({ id: onlineMembers.length + 1, user_id: u.id, username: u.username, nickname: null, roles: [], status: 'online', isAdmin: false });
          }
        }
        // Add current JWT user if authenticated
        const jwtUser = getJwtUser(req.headers.authorization || null);
        if (jwtUser && !onlineMembers.some(m => m.user_id === jwtUser.id)) {
          onlineMembers.push({ id: onlineMembers.length + 1, user_id: jwtUser.id, username: jwtUser.username, nickname: null, roles: [], status: 'online', isAdmin: false });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(onlineMembers));
        return;
      }
      try {
        const { memberService } = await import('./api/members.js');
        const { roleService, RolePermissions } = await import('./api/roles.js');
        const members = await memberService.getMembers(serverId);
        
        // Check admin status for each member
        const membersWithAdmin = await Promise.all(members.map(async (m: any) => {
          try {
            const permissions = await roleService.getMemberPermissionLevel(serverId, m.user_id);
            return { ...m, isAdmin: roleService.isAdmin(permissions) };
          } catch {
            return { ...m, isAdmin: false };
          }
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(membersWithAdmin));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/join - Join server
    if (url.pathname.match(/^\/api\/servers\/\d+\/join$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { memberService } = await import('./api/members.js');
        await memberService.joinServer(serverId, jwtUser.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/leave - Leave server
    if (url.pathname.match(/^\/api\/servers\/\d+\/leave$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { memberService } = await import('./api/members.js');
        await memberService.leaveServer(serverId, jwtUser.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // ROLES API
    // ============================================

    // GET /api/servers/:id/roles - Get server roles
    if (url.pathname.match(/^\/api\/servers\/\d+\/roles$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 1, name: '@everyone', color: '#99AAB5', permissions: 0 }]));
        return;
      }
      try {
        const { roleService } = await import('./api/roles.js');
        const roles = await roleService.getRoles(serverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(roles));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/roles - Create role
    if (url.pathname.match(/^\/api\/servers\/\d+\/roles$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { name, color, permissions } = await parseBody();
        const { roleService } = await import('./api/roles.js');
        const role = await roleService.createRole(serverId, { name, color, permissions });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(role));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // INVITES API
    // ============================================

    // GET /api/servers/:id/invites - Get server invites
    if (url.pathname.match(/^\/api\/servers\/\d+\/invites$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const { inviteService } = await import('./api/invites.js');
        const invites = await inviteService.getInvitesByServer(serverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(invites));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/invites - Create invite
    if (url.pathname.match(/^\/api\/servers\/\d+\/invites$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { max_uses, expires_in } = await parseBody();
        const { inviteService } = await import('./api/invites.js');
        const invite = await inviteService.createInvite(serverId, jwtUser.id, { maxUses: max_uses, expiresIn: expires_in });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: invite.code }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // POST /api/invites/:code - Join via invite
    if (url.pathname.match(/^\/api\/invites\/[^\/]+$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const code = url.pathname.split('/')[3];
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { inviteService } = await import('./api/invites.js');
        const { memberService } = await import('./api/members.js');
        const result = await inviteService.useInvite(code, jwtUser.id);
        await memberService.joinServer(result.server_id, jwtUser.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ server_id: result.server_id }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // PINS API
    // ============================================

    // GET /api/channels/:id/pins - Get pinned messages
    if (url.pathname.match(/^\/api\/channels\/\d+\/pins$/) && req.method === 'GET') {
      const channelId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const { pinService } = await import('./api/pins.js');
        const pins = await pinService.getPinnedMessages(channelId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(pins));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/channels/:id/pins - Pin message
    if (url.pathname.match(/^\/api\/channels\/\d+\/pins$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const channelId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { message_id } = await parseBody();
        const { pinService } = await import('./api/pins.js');
        await pinService.pinMessage(message_id, channelId, jwtUser.id);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // DELETE /api/channels/:id/pins/:messageId - Unpin message
    if (url.pathname.match(/^\/api\/channels\/\d+\/pins\/\d+$/) && req.method === 'DELETE') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const channelId = parseInt(url.pathname.split('/')[3]);
      const messageId = parseInt(url.pathname.split('/')[5]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { pinService } = await import('./api/pins.js');
        await pinService.unpinMessage(messageId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // MODERATION API
    // ============================================

    // GET /api/servers/:id/bans - Get bans
    if (url.pathname.match(/^\/api\/servers\/\d+\/bans$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const { moderationService } = await import('./api/moderation.js');
        const bans = await moderationService.getBans(serverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(bans));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/bans - Ban user (requires BAN_MEMBERS or ADMIN permission)
    if (url.pathname.match(/^\/api\/servers\/\d+\/bans$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      
      try {
        // Check permission
        const { roleService, RolePermissions } = await import('./api/roles.js');
        const permissions = await roleService.getMemberPermissionLevel(serverId, jwtUser.id);
        if (!roleService.canBanMembers(permissions) && !roleService.isAdmin(permissions)) {
          res.writeHead(403); res.end(JSON.stringify({ error: 'You do not have permission to ban members' })); return;
        }
        
        const { user_id, reason } = await parseBody();
        const { moderationService } = await import('./api/moderation.js');
        await moderationService.banUser(serverId, user_id, jwtUser.id, reason);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // DELETE /api/servers/:id/bans/:userId - Unban user
    if (url.pathname.match(/^\/api\/servers\/\d+\/bans\/\d+$/) && req.method === 'DELETE') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      const userId = parseInt(url.pathname.split('/')[5]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { moderationService } = await import('./api/moderation.js');
        await moderationService.unbanUser(serverId, userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/kick - Kick user (requires KICK_MEMBERS or ADMIN permission)
    if (url.pathname.match(/^\/api\/servers\/\d+\/kick$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      
      try {
        // Check permission
        const { roleService, RolePermissions } = await import('./api/roles.js');
        const permissions = await roleService.getMemberPermissionLevel(serverId, jwtUser.id);
        if (!roleService.canKickMembers(permissions) && !roleService.isAdmin(permissions)) {
          res.writeHead(403); res.end(JSON.stringify({ error: 'You do not have permission to kick members' })); return;
        }
        
        const { user_id, reason } = await parseBody();
        const { moderationService } = await import('./api/moderation.js');
        await moderationService.kickUser(serverId, user_id, jwtUser.id, reason);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // GET /api/servers/:id/mutes - Get mutes
    if (url.pathname.match(/^\/api\/servers\/\d+\/mutes$/) && req.method === 'GET') {
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const { moderationService } = await import('./api/moderation.js');
        const mutes = await moderationService.getMutes(serverId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mutes));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // POST /api/servers/:id/mutes - Mute user (requires MUTE_MEMBERS or ADMIN permission)
    if (url.pathname.match(/^\/api\/servers\/\d+\/mutes$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      
      try {
        // Check permission
        const { roleService } = await import('./api/roles.js');
        const permissions = await roleService.getMemberPermissionLevel(serverId, jwtUser.id);
        if (!roleService.canMuteMembers(permissions) && !roleService.isAdmin(permissions)) {
          res.writeHead(403); res.end(JSON.stringify({ error: 'You do not have permission to mute members' })); return;
        }
        
        const { user_id, reason, duration_minutes } = await parseBody();
        const { moderationService } = await import('./api/moderation.js');
        await moderationService.muteUser(serverId, user_id, jwtUser.id, reason, duration_minutes);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // DELETE /api/servers/:id/mutes/:userId - Unmute user
    if (url.pathname.match(/^\/api\/servers\/\d+\/mutes\/\d+$/) && req.method === 'DELETE') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const serverId = parseInt(url.pathname.split('/')[3]);
      const userId = parseInt(url.pathname.split('/')[5]);
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { moderationService } = await import('./api/moderation.js');
        await moderationService.unmuteUser(serverId, userId, jwtUser.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // USERS API
    // ============================================

    // GET /api/users/:id - Get user
    if (url.pathname.match(/^\/api\/users\/\d+$/) && req.method === 'GET') {
      const userId = parseInt(url.pathname.split('/')[3]);
      if (!getDbStatus()) {
        const user = memoryStore.getUserById(userId);
        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: user.id, username: user.username, display_name: user.display_name, status: user.status }));
        } else {
          res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
        }
        return;
      }
      try {
        const { userService } = await import('./api/users.js');
        const user = await userService.getUserById(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(user));
      } catch (err) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); }
      return;
    }

    // GET /api/users/search - Search users
    if (url.pathname === '/api/users/search' && req.method === 'GET') {
      const query = url.searchParams.get('q');
      if (!query) { res.writeHead(400); res.end(JSON.stringify({ error: 'Query required' })); return; }
      if (!getDbStatus()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      try {
        const { userService } = await import('./api/users.js');
        const users = await userService.searchUsers(query);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(users));
      } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' })); }
      return;
    }

    // PATCH /api/users/me - Update current user
    if (url.pathname === '/api/users/me' && req.method === 'PATCH') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      if (!getDbStatus()) { res.writeHead(503); res.end(JSON.stringify({ error: 'Database unavailable' })); return; }
      try {
        const { display_name, avatar_url, status } = await parseBody();
        const { userService } = await import('./api/users.js');
        await userService.updateUser(jwtUser.id, { display_name, avatar_url, status });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) { res.writeHead(400); res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })); }
      return;
    }

    // ============================================
    // GDPR COMPLIANCE - DATA EXPORT API
    // ============================================

    // GET /api/users/me/export - Export all user data
    if (url.pathname === '/api/users/me/export' && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      try {
        const exportData: {
          user: any;
          messages: any[];
          exportedAt: string;
        } = {
          user: null,
          messages: [],
          exportedAt: new Date().toISOString(),
        };

        // Get user info
        if (getDbStatus()) {
          const { userService } = await import('./api/users.js');
          exportData.user = await userService.getUserById(jwtUser.id);
          
          // Get user's messages using existing method
          const messages = await messageService.getRecentMessages(1, 1000);
          exportData.messages = messages.filter((m: any) => m.user_id === jwtUser.id);
        }

        res.writeHead(200, { 
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="vibespeak-data-export.json"' 
        });
        res.end(JSON.stringify(exportData, null, 4));
      } catch (err) {
        logger.error('Failed to export user data:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to export data' }));
      }
      return;
    }

    // ============================================
    // GDPR COMPLIANCE - ACCOUNT DELETION API
    // ============================================

    // DELETE /api/users/me - Delete current user account (GDPR right to erasure)
    if (url.pathname === '/api/users/me' && req.method === 'DELETE') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }

      try {
        if (getDbStatus()) {
          const { userService } = await import('./api/users.js');
          
          // Log the deletion for audit purposes (without retaining user data)
          logger.info(`Account deletion requested for user ${jwtUser.username} (${jwtUser.id})`);
          
          // Delete user's messages first (cascade should handle this, but explicit is safer)
          await query('DELETE FROM messages WHERE user_id = $1', [jwtUser.id]);
          
          // Delete user's reactions
          await query('DELETE FROM message_reactions WHERE user_id = $1', [jwtUser.id]);
          
          // Delete user's memberships
          await query('DELETE FROM server_members WHERE user_id = $1', [jwtUser.id]);
          
          // Delete user's read states
          await query('DELETE FROM read_state WHERE user_id = $1', [jwtUser.id]);
          
          // Finally delete the user account
          await query('DELETE FROM users WHERE id = $1', [jwtUser.id]);
          
          logger.info(`Account ${jwtUser.id} successfully deleted`);
        }
        
        // Clear any sessions
        for (const [sessionId, session] of sessions.entries()) {
          if (session.userId === jwtUser.id) {
            sessions.delete(sessionId);
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Your account and all associated data have been permanently deleted.' 
        }));
      } catch (err) {
        logger.error('Failed to delete account:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to delete account' }));
      }
      return;
    }

    // ============================================
    // ADMIN - JWT ROTATION ENDPOINT
    // ============================================

    // POST /api/admin/rotate-jwt - Manually rotate JWT secret (admin only)
    if (url.pathname === '/api/admin/rotate-jwt' && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      // Check if user has admin role
      if (getDbStatus()) {
        const { roleService } = await import('./api/roles.js');
        const permissions = await roleService.getMemberPermissionLevel(1, jwtUser.id);
        if (!roleService.isAdmin(permissions)) {
          res.writeHead(403); res.end(JSON.stringify({ error: 'Admin privileges required' })); return;
        }
      } else {
        res.writeHead(503); res.end(JSON.stringify({ error: 'Database required for admin verification' })); return;
      }
      
      try {
        const { rotateSecret } = await import('./auth.js');
        const newSecretId = rotateSecret();
        
        logger.info(`JWT secret rotated by admin user ${jwtUser.username}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'JWT secret rotated successfully',
          newSecretId: newSecretId.substring(0, 8)
        }));
      } catch (err) {
        logger.error('Failed to rotate JWT secret:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to rotate secret' }));
      }
      return;
    }

    // GET /api/admin/jwt-status - Get JWT rotation status (admin only)
    if (url.pathname === '/api/admin/jwt-status' && req.method === 'GET') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      // Check if user has admin role
      if (getDbStatus()) {
        const { roleService } = await import('./api/roles.js');
        const permissions = await roleService.getMemberPermissionLevel(1, jwtUser.id);
        if (!roleService.isAdmin(permissions)) {
          res.writeHead(403); res.end(JSON.stringify({ error: 'Admin privileges required' })); return;
        }
      }
      
      try {
        const { getSecretRotationStatus } = await import('./auth.js');
        const status = getSecretRotationStatus();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to get status' }));
      }
      return;
    }

    // ============================================
    // SCREEN SHARE FLOOR CONTROL API
    // ============================================

    // POST /api/channels/:id/screen-share/request - Request screen share floor
    if (url.pathname.match(/^\/api\/channels\/\d+\/screen-share\/request$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      const channelId = parseInt(url.pathname.split('/')[3]);
      
      try {
        // Check if there's capacity for another screen share
        const activeShares = signalingServer.getActiveScreenShares(channelId);
        const maxShares = 3; // Configurable
        
        if (activeShares.length >= maxShares) {
          // Add to queue
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            queued: true, 
            position: activeShares.length - maxShares + 1,
            message: 'Screen share queue position: ' + (activeShares.length - maxShares + 1)
          }));
        } else {
          // Grant immediate permission
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            granted: true,
            maxBitrate: 5000000, // 5 Mbps budget
            message: 'Screen share granted'
          }));
        }
      } catch (err) {
        logger.error('Failed to process screen share request:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to process request' }));
      }
      return;
    }

    // POST /api/channels/:id/screen-share/stop - Stop screen share
    if (url.pathname.match(/^\/api\/channels\/\d+\/screen-share\/stop$/) && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      
      try {
        // Notify WebSocket clients that screen share stopped
        signalingServer.broadcastToAll({
          type: 'screen-share-stop',
          userId: jwtUser.id,
          username: jwtUser.username
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed' }));
      }
      return;
    }

    // GET /api/channels/:id/screen-shares - Get active screen shares
    if (url.pathname.match(/^\/api\/channels\/\d+\/screen-shares$/) && req.method === 'GET') {
      const channelId = parseInt(url.pathname.split('/')[3]);
      
      try {
        const shares = signalingServer.getActiveScreenShares(channelId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(shares));
      } catch (err) {
        res.writeHead(200); res.end(JSON.stringify([]));
      }
      return;
    }

    // ============================================
    // VOICE QUALITY API
    // ============================================

    // GET /api/voice/quality/:channelId - Get voice quality stats
    if (url.pathname.match(/^\/api\/voice\/quality\/\d+$/) && req.method === 'GET') {
      const channelId = url.pathname.split('/')[4];
      
      try {
        const stats = voiceRelayServer.getChannelQuality(channelId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
      } catch (err) {
        res.writeHead(200); res.end(JSON.stringify([]));
      }
      return;
    }

    // GET /api/voice/stats - Get global voice relay stats
    if (url.pathname === '/api/voice/stats' && req.method === 'GET') {
      try {
        const stats = voiceRelayServer.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to get stats' }));
      }
      return;
    }

    // ============================================
    // ADMIN TOKEN CLAIM API
    // ============================================

    // POST /api/admin/claim - Claim admin privileges using the server token
    if (url.pathname === '/api/admin/claim' && req.method === 'POST') {
      const jwtUser = getJwtUser(req.headers.authorization || null);
      if (!jwtUser) { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized - please log in first' })); return; }
      
      try {
        const { code } = await parseBody();
        if (!code) { res.writeHead(400); res.end(JSON.stringify({ error: 'Admin code required' })); return; }
        
        // Check if the code matches the current admin token
        if (!adminToken || code !== adminToken) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid or already-used admin code' })); 
          return;
        }
        
        // Grant admin role to the user
        if (getDbStatus()) {
          const { roleService, RolePermissions } = await import('./api/roles.js');
          
          // Create or get the Admin role for server 1 (default server)
          let adminRole = await queryOne<{ id: number }>(
            "SELECT id FROM roles WHERE server_id = 1 AND name = 'Admin'"
          );
          
          if (!adminRole) {
            // Create Admin role with full permissions
            const result = await query(
              `INSERT INTO roles (server_id, name, color, position, permissions, hoist, mentionable)
               VALUES (1, 'Admin', '#e74c3c', 100, $1, true, true)
               RETURNING id`,
              [RolePermissions.ADMIN | RolePermissions.BAN_MEMBERS | RolePermissions.KICK_MEMBERS | RolePermissions.MUTE_MEMBERS | RolePermissions.MANAGE_CHANNELS | RolePermissions.MANAGE_ROLES | RolePermissions.MANAGE_MESSAGES]
            );
            adminRole = result.rows[0] as { id: number };
          }
          
          // Assign the admin role to the user (append to roles array)
          await query(
            `UPDATE server_members SET roles = roles || $1::jsonb
             WHERE server_id = 1 AND user_id = $2`,
            [JSON.stringify([adminRole.id]), jwtUser.id]
          );
          
          logger.info(`Admin privileges granted to user ${jwtUser.username} (${jwtUser.id}) via token claim`);
        }
        
        // Consume the token (single-use)
        adminToken = null;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Admin privileges granted! You now have full moderation access.',
          isAdmin: true 
        }));
      } catch (err) { 
        logger.error('Failed to claim admin token:', err);
        res.writeHead(500); res.end(JSON.stringify({ error: 'Failed to grant admin privileges' })); 
      }
      return;
    }

    res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, () => { logger.info(`HTTP server on http://localhost:${PORT}`); });

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    signalingServer.cleanup(); // Clean up memory before stopping
    signalingServer.stop();
    voiceRelayServer.stop();
    await closeDatabase();
    server.close(() => { process.exit(0); });
  });
}

main();
