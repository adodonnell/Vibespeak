// TURN Server Credentials API
// Provides time-limited TURN credentials for WebRTC NAT traversal
// Uses TURN REST API specification: https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00

import { createHmac, randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';

// TURN server configuration
interface TurnConfig {
  urls: string[];
  secret: string;
  username: string;
  password: string;
}

// Get TURN configuration from environment
function getTurnConfig(): TurnConfig | null {
  const turnUrl = process.env.TURN_URL;
  const turnSecret = process.env.TURN_SECRET;
  const turnUser = process.env.TURN_USER;
  const turnPass = process.env.TURN_PASS;

  if (!turnUrl) {
    logger.debug('TURN_URL not configured - TURN relay disabled');
    return null;
  }

  const urls: string[] = [];
  
  // Parse TURN URL (can be comma-separated for multiple servers)
  const turnUrls = turnUrl.split(',').map(u => u.trim());
  for (const url of turnUrls) {
    // Add both UDP and TLS variants
    if (url.startsWith('turn:')) {
      urls.push(url);
      // Also add TURN TLS if not already specified
      if (!url.includes('?transport=tls')) {
        const tlsUrl = url.includes('?') 
          ? url.replace('?', '?transport=tls&')
          : `${url}?transport=tls`;
        urls.push(tlsUrl);
      }
    } else if (url.startsWith('turns:')) {
      urls.push(url);
    } else {
      // Assume it's a hostname without scheme
      urls.push(`turn:${url}:3478`);
      urls.push(`turns:${url}:5349`);
    }
  }

  return {
    urls,
    secret: turnSecret || '',
    username: turnUser || 'vibespeak',
    password: turnPass || 'vibespeak',
  };
}

// Generate time-limited TURN credentials using HMAC
// This is the standard TURN REST API approach
function generateTurnCredentials(secret: string, username: string, ttlSeconds: number = 86400): {
  username: string;
  password: string;
  ttl: number;
  uris: string[];
} {
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  
  // Username format: "timestamp:username"
  const turnUsername = `${timestamp}:${username}`;
  
  // Password is HMAC-SHA1 of username with secret
  const hmac = createHmac('sha1', secret);
  hmac.update(turnUsername);
  const password = hmac.digest('base64');

  return {
    username: turnUsername,
    password,
    ttl: ttlSeconds,
    uris: [],
  };
}

// ICE server configuration response
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
  credentialType?: 'password';
}

// Get ICE servers configuration for WebRTC
export function getIceServers(): IceServerConfig[] {
  const config = getTurnConfig();
  const iceServers: IceServerConfig[] = [];

  // Always include STUN servers (Google's public STUN)
  const stunServers = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302',
    'stun:global.stun.twilio.com:3478',
  ];

  iceServers.push({ urls: stunServers });

  // Add TURN servers if configured
  if (config) {
    if (config.secret) {
      // Use time-limited credentials (production mode)
      const creds = generateTurnCredentials(config.secret, config.username);
      iceServers.push({
        urls: config.urls,
        username: creds.username,
        credential: creds.password,
        credentialType: 'password',
      });
      logger.debug('TURN credentials generated with time-limited auth');
    } else {
      // Use static credentials (development mode)
      iceServers.push({
        urls: config.urls,
        username: config.username,
        credential: config.password,
        credentialType: 'password',
      });
      logger.debug('TURN using static credentials (development mode)');
    }
  }

  return iceServers;
}

// Check if TURN is configured
export function isTurnConfigured(): boolean {
  return !!process.env.TURN_URL;
}

// Get TURN stats for monitoring
export function getTurnStats(): {
  configured: boolean;
  serverCount: number;
  usingTimeLimitedCredentials: boolean;
} {
  const config = getTurnConfig();
  return {
    configured: !!config,
    serverCount: config?.urls.length || 0,
    usingTimeLimitedCredentials: !!config?.secret,
  };
}