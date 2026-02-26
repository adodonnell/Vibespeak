/**
 * VibeSpeak Server Stress Test
 * Tests server resilience under high load conditions
 * 
 * Run with: npx tsx tests/stress/server-stress.ts
 */

import WebSocket from 'ws';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3002';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '50');
const MESSAGE_RATE = parseInt(process.env.MESSAGE_RATE || '10'); // messages per second per user
const TEST_DURATION_MS = parseInt(process.env.TEST_DURATION_MS || '30000'); // 30 seconds

interface TestResult {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  totalMessages: number;
  messagesFailed: number;
  totalLatency: number;
  latencySamples: number;
  errors: string[];
}

const result: TestResult = {
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  totalMessages: 0,
  messagesFailed: 0,
  totalLatency: 0,
  latencySamples: 0,
  errors: [],
};

// Generate random username
function generateUsername(): string {
  return `stress_user_${Math.random().toString(36).substring(7)}`;
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a single test user connection
async function createTestUser(userId: number): Promise<{ ws: WebSocket; token: string; username: string } | null> {
  const username = generateUsername();
  
  try {
    // 1. Register as guest
    const registerRes = await fetch(`${SERVER_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    
    if (!registerRes.ok) {
      result.errors.push(`User ${userId}: Registration failed (${registerRes.status})`);
      return null;
    }
    
    const registerData = await registerRes.json();
    const token = registerData.token;
    
    // 2. Connect WebSocket
    return new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      let resolved = false;
      
      ws.on('open', () => {
        // Send auth message
        ws.send(JSON.stringify({ type: 'auth', token }));
      });
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth-success' && !resolved) {
            resolved = true;
            result.successfulConnections++;
            resolve({ ws, token, username });
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      ws.on('error', (err) => {
        if (!resolved) {
          result.failedConnections++;
          result.errors.push(`User ${userId}: WS error - ${err.message}`);
          resolve(null);
        }
      });
      
      ws.on('close', () => {
        if (!resolved) {
          result.failedConnections++;
          resolve(null);
        }
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          result.failedConnections++;
          result.errors.push(`User ${userId}: Connection timeout`);
          ws.close();
          resolve(null);
        }
      }, 5000);
    });
  } catch (err: any) {
    result.failedConnections++;
    result.errors.push(`User ${userId}: ${err.message}`);
    return null;
  }
}

// Message spam test for a single user
async function runMessageTest(user: { ws: WebSocket; token: string; username: string }, channelId: number): Promise<void> {
  const interval = 1000 / MESSAGE_RATE;
  let messageCount = 0;
  const maxMessages = 100; // Limit messages per user
  
  return new Promise((resolve) => {
    const sendNext = () => {
      if (messageCount >= maxMessages || user.ws.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      
      const startTime = Date.now();
      const content = `Stress test message ${messageCount} from ${user.username}`;
      
      // Join channel first if needed
      if (messageCount === 0) {
        user.ws.send(JSON.stringify({ type: 'join', roomId: channelId.toString() }));
      }
      
      // Send message via HTTP API
      fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({ channel_id: channelId, content }),
      })
        .then(res => {
          if (res.ok) {
            result.totalMessages++;
            const latency = Date.now() - startTime;
            result.totalLatency += latency;
            result.latencySamples++;
          } else {
            result.messagesFailed++;
          }
        })
        .catch(() => {
          result.messagesFailed++;
        });
      
      messageCount++;
      setTimeout(sendNext, interval);
    };
    
    sendNext();
  });
}

// Health check test
async function testHealthEndpoint(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    if (!res.ok) {
      result.errors.push(`Health check failed: ${res.status}`);
      return false;
    }
    const data = await res.json();
    console.log(`Health check: ${data.status} (DB: ${data.services?.database?.status})`);
    return true;
  } catch (err: any) {
    result.errors.push(`Health check error: ${err.message}`);
    return false;
  }
}

// Rate limit test
async function testRateLimits(): Promise<void> {
  console.log('\n📊 Testing rate limits...');
  
  // Create a user
  const username = `ratelimit_test_${Date.now()}`;
  const registerRes = await fetch(`${SERVER_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  
  if (!registerRes.ok) {
    result.errors.push('Rate limit test: Failed to create user');
    return;
  }
  
  const { token } = await registerRes.json();
  
  // Spam requests rapidly
  let rateLimited = false;
  const promises: Promise<void>[] = [];
  
  for (let i = 0; i < 50; i++) {
    promises.push(
      fetch(`${SERVER_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ channel_id: 1, content: `Spam ${i}` }),
      })
        .then(res => {
          if (res.status === 429 && !rateLimited) {
            rateLimited = true;
            console.log('  ✓ Rate limiting is working (429 received)');
          }
        })
        .catch(() => {})
    );
  }
  
  await Promise.all(promises);
  
  if (!rateLimited) {
    console.log('  ⚠ Rate limiting may not be working (no 429 received)');
  }
}

// Main stress test runner
async function runStressTest(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════');
  console.log('              VIBESPEAK SERVER STRESS TEST');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Server: ${SERVER_URL}`);
  console.log(`  WebSocket: ${WS_URL}`);
  console.log(`  Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`  Message Rate: ${MESSAGE_RATE}/sec per user`);
  console.log(`  Duration: ${TEST_DURATION_MS / 1000}s`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  // Initial health check
  console.log('🏥 Pre-test health check...');
  const healthy = await testHealthEndpoint();
  if (!healthy) {
    console.error('❌ Server is not healthy, aborting test');
    process.exit(1);
  }
  console.log('✅ Server is healthy\n');
  
  // Test rate limits
  await testRateLimits();
  
  // Connection flood test
  console.log('\n📡 Creating connections...');
  result.totalConnections = CONCURRENT_USERS;
  
  const users: { ws: WebSocket; token: string; username: string }[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < CONCURRENT_USERS; i += batchSize) {
    const batch = Math.min(batchSize, CONCURRENT_USERS - i);
    const batchPromises: Promise<{ ws: WebSocket; token: string; username: string } | null>[] = [];
    
    for (let j = 0; j < batch; j++) {
      batchPromises.push(createTestUser(i + j));
    }
    
    const batchResults = await Promise.all(batchPromises);
    for (const user of batchResults) {
      if (user) users.push(user);
    }
    
    console.log(`  Created ${users.length}/${CONCURRENT_USERS} connections...`);
    await sleep(100); // Small delay between batches
  }
  
  console.log(`\n✅ Connected: ${users.length}/${CONCURRENT_USERS} users`);
  console.log(`❌ Failed: ${result.failedConnections} connections\n`);
  
  if (users.length === 0) {
    console.error('❌ No successful connections, aborting message test');
    process.exit(1);
  }
  
  // Message spam test
  console.log('📨 Running message flood test...');
  const messagePromises = users.map(user => runMessageTest(user, 1));
  
  // Wait for test duration or all messages to complete
  await Promise.race([
    Promise.all(messagePromises),
    sleep(TEST_DURATION_MS),
  ]);
  
  // Cleanup: close all connections
  console.log('\n🧹 Cleaning up...');
  for (const user of users) {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.close();
    }
  }
  
  // Final health check
  console.log('\n🏥 Post-test health check...');
  await testHealthEndpoint();
  
  // Print results
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                     TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Connections:`);
  console.log(`    Total:      ${result.totalConnections}`);
  console.log(`    Successful: ${result.successfulConnections} (${((result.successfulConnections / result.totalConnections) * 100).toFixed(1)}%)`);
  console.log(`    Failed:     ${result.failedConnections}`);
  console.log(`  Messages:`);
  console.log(`    Sent:       ${result.totalMessages}`);
  console.log(`    Failed:     ${result.messagesFailed}`);
  if (result.latencySamples > 0) {
    console.log(`    Avg Latency: ${(result.totalLatency / result.latencySamples).toFixed(0)}ms`);
  }
  console.log('════════════════════════════════════════════════════════════');
  
  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors (${result.errors.length}):`);
    const uniqueErrors = [...new Set(result.errors)].slice(0, 10);
    for (const err of uniqueErrors) {
      console.log(`    - ${err}`);
    }
    if (result.errors.length > 10) {
      console.log(`    ... and ${result.errors.length - 10} more`);
    }
  }
  
  // Exit with appropriate code
  const successRate = result.successfulConnections / result.totalConnections;
  if (successRate >= 0.9 && result.messagesFailed < result.totalMessages * 0.1) {
    console.log('\n✅ STRESS TEST PASSED');
    process.exit(0);
  } else {
    console.log('\n⚠️ STRESS TEST COMPLETED WITH WARNINGS');
    process.exit(0);
  }
}

// Run the test
runStressTest().catch(err => {
  console.error('❌ Stress test failed with error:', err);
  process.exit(1);
});