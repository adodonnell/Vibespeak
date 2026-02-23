// API E2E Tests
// Tests the server API endpoints directly

import { test, expect, request } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3001';

test.describe('API Health', () => {
  test('should return healthy status', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/health`);
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  test('should return server info', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/info`);
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.name).toBe('VibeSpeak Server');
    expect(data.version).toBeDefined();
  });
});

test.describe('Guest Authentication', () => {
  test('should login as guest', async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'E2ETestUser_' + Date.now()
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.user).toBeDefined();
    expect(data.user.username).toContain('E2ETestUser');
    expect(data.token).toBeDefined();
  });

  test('should reject invalid username', async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'invalid@user!'
      }
    });
    
    expect(response.status()).toBe(400);
  });

  test('should reject empty username', async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: ''
      }
    });
    
    expect(response.status()).toBe(400);
  });
});

test.describe('Channels API', () => {
  let authToken: string;

  test.beforeAll(async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'ChannelTestUser_' + Date.now()
      }
    });
    
    const data = await response.json();
    authToken = data.token;
  });

  test('should list channels', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/channels/1`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('should list voice channels', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/voice-channels`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

test.describe('Messages API', () => {
  let authToken: string;
  let userId: number;

  test.beforeAll(async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'MessageTestUser_' + Date.now()
      }
    });
    
    const data = await response.json();
    authToken = data.token;
    userId = data.user.id;
  });

  test('should get messages for channel', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/messages/1`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.messages).toBeDefined();
    expect(Array.isArray(data.messages)).toBe(true);
  });

  test('should send a message', async () => {
    const context = await request.newContext();
    const testMessage = `E2E Test Message ${Date.now()}`;
    
    const response = await context.post(`${API_URL}/api/messages`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      },
      data: {
        channel_id: 1,
        content: testMessage
      }
    });
    
    expect(response.status()).toBe(201);
    
    const data = await response.json();
    expect(data.content).toBe(testMessage);
  });

  test('should reject message without auth', async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/messages`, {
      data: {
        channel_id: 1,
        content: 'This should fail'
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('should search messages', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/search?q=test`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Servers API', () => {
  let authToken: string;

  test.beforeAll(async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'ServerTestUser_' + Date.now()
      }
    });
    
    const data = await response.json();
    authToken = data.token;
  });

  test('should list servers', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/servers`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should get server by id', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/servers/1`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.id).toBe(1);
  });
});

test.describe('Users API', () => {
  let authToken: string;
  let userId: number;

  test.beforeAll(async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'UserTestUser_' + Date.now()
      }
    });
    
    const data = await response.json();
    authToken = data.token;
    userId = data.user.id;
  });

  test('should get current user', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.id).toBe(userId);
  });

  test('should get online users', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/users/online`);
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

test.describe('TURN/ICE API', () => {
  let authToken: string;

  test.beforeAll(async () => {
    const context = await request.newContext();
    const response = await context.post(`${API_URL}/api/auth/guest`, {
      data: {
        username: 'TurnTestUser_' + Date.now()
      }
    });
    
    const data = await response.json();
    authToken = data.token;
  });

  test('should get ICE servers', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/turn/ice-servers`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.iceServers).toBeDefined();
    expect(Array.isArray(data.iceServers)).toBe(true);
    expect(data.iceServers.length).toBeGreaterThan(0);
  });

  test('should reject unauthenticated ICE request', async () => {
    const context = await request.newContext();
    const response = await context.get(`${API_URL}/api/turn/ice-servers`);
    
    expect(response.status()).toBe(401);
  });
});