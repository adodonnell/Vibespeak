/**
 * Disorder — Message Throughput Stress Test
 * Tests message handling performance under load
 * 
 * Usage: npx ts-node tests/stress/messages.ts
 */

interface TestConfig {
  wsUrl: string;
  apiBaseUrl: string;
  channelId: number;
  numMessages: number;
  concurrentClients: number;
}

interface TestResult {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  throughputPerSecond: number;
  durationMs: number;
}

const config: TestConfig = {
  wsUrl: process.env.WS_URL || 'ws://localhost:3002',
  apiBaseUrl: process.env.API_URL || 'http://localhost:3001',
  channelId: parseInt(process.env.CHANNEL_ID || '1'),
  numMessages: parseInt(process.env.NUM_MESSAGES || '1000'),
  concurrentClients: parseInt(process.env.CONCURRENT_CLIENTS || '10'),
};

async function sendMessage(
  apiBaseUrl: string,
  channelId: number,
  content: string,
  token: string
): Promise<{ success: boolean; latency: number; error?: string }> {
  const start = Date.now();
  
  try {
    const response = await fetch(`${apiBaseUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel_id: channelId,
        content,
      }),
    });
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, latency, error };
    }
    
    return { success: true, latency };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, latency: Date.now() - start, error: errorMessage };
  }
}

async function getGuestToken(apiBaseUrl: string, username: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get guest token: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.token;
}

async function runStressTest(): Promise<TestResult> {
  console.log('🚀 Starting Message Throughput Stress Test');
  console.log('━'.repeat(50));
  console.log(`WebSocket URL: ${config.wsUrl}`);
  console.log(`API URL: ${config.apiBaseUrl}`);
  console.log(`Channel ID: ${config.channelId}`);
  console.log(`Messages per client: ${config.numMessages}`);
  console.log(`Concurrent clients: ${config.concurrentClients}`);
  console.log(`Total messages: ${config.numMessages * config.concurrentClients}`);
  console.log('━'.repeat(50));
  
  const testStart = Date.now();
  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;
  
  // Create test clients
  const clientPromises = Array.from({ length: config.concurrentClients }, async (_, clientIndex) => {
    const username = `stress_test_user_${clientIndex}_${Date.now()}`;
    
    // Get auth token
    let token: string;
    try {
      token = await getGuestToken(config.apiBaseUrl, username);
    } catch (error) {
      console.error(`Client ${clientIndex}: Failed to get token - ${error}`);
      return;
    }
    
    // Send messages
    for (let i = 0; i < config.numMessages; i++) {
      const content = `Stress test message ${i} from client ${clientIndex} at ${Date.now()}`;
      const result = await sendMessage(config.apiBaseUrl, config.channelId, content, token);
      
      if (result.success) {
        successful++;
        latencies.push(result.latency);
      } else {
        failed++;
        if (result.error) {
          console.error(`Client ${clientIndex}, Message ${i}: ${result.error}`);
        }
      }
      
      // Log progress every 100 messages
      if ((clientIndex * config.numMessages + i) % 100 === 0) {
        process.stdout.write(`\r📊 Progress: ${clientIndex * config.numMessages + i + 1} messages sent...`);
      }
    }
  });
  
  // Run all clients concurrently
  await Promise.all(clientPromises);
  
  const testEnd = Date.now();
  const durationMs = testEnd - testStart;
  
  // Calculate results
  const result: TestResult = {
    totalMessages: config.numMessages * config.concurrentClients,
    successfulMessages: successful,
    failedMessages: failed,
    avgLatencyMs: latencies.length > 0 
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    throughputPerSecond: Math.round((successful / durationMs) * 1000),
    durationMs,
  };
  
  console.log('\n');
  console.log('━'.repeat(50));
  console.log('📊 Test Results');
  console.log('━'.repeat(50));
  console.log(`Total messages sent: ${result.totalMessages}`);
  console.log(`Successful: ${result.successfulMessages} (${((result.successfulMessages / result.totalMessages) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${result.failedMessages}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${result.throughputPerSecond} messages/sec`);
  console.log('━'.repeat(50));
  console.log('Latency Statistics:');
  console.log(`  Min: ${result.minLatencyMs}ms`);
  console.log(`  Avg: ${result.avgLatencyMs}ms`);
  console.log(`  Max: ${result.maxLatencyMs}ms`);
  console.log('━'.repeat(50));
  
  // Performance assessment
  if (result.throughputPerSecond >= 100 && result.avgLatencyMs <= 100) {
    console.log('✅ PASSED: Performance is acceptable');
  } else if (result.throughputPerSecond >= 50) {
    console.log('⚠️  WARNING: Performance is marginal');
  } else {
    console.log('❌ FAILED: Performance is below acceptable threshold');
  }
  
  return result;
}

// Run the test
runStressTest()
  .then(() => {
    console.log('\n✅ Stress test completed');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('\n❌ Stress test failed:', error);
    process.exit(1);
  });