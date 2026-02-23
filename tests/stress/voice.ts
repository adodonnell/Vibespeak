/**
 * Vibespeak — Voice Channel Stress Test
 * Tests voice channel performance under load
 * 
 * Usage: npx tsx tests/stress/voice.ts
 */

interface VoiceTestConfig {
  wsUrl: string;
  voiceChannels: string[];
  concurrentUsers: number;
  testDurationSeconds: number;
}

interface VoiceTestResult {
  totalUsers: number;
  successfulConnections: number;
  failedConnections: number;
  avgConnectionTimeMs: number;
  minConnectionTimeMs: number;
  maxConnectionTimeMs: number;
  durationMs: number;
}

interface MockPeerConnection {
  id: string;
  ws: WebSocket | null;
  connected: boolean;
  startTime: number;
}

async function connectToVoiceChannel(
  wsUrl: string,
  channelName: string,
  username: string
): Promise<{ success: boolean; connectionTime: number; error?: string }> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, connectionTime: Date.now() - startTime, error: 'Connection timeout' });
      }, 10000);

      ws.onopen = () => {
        // Send join message
        ws.send(JSON.stringify({
          type: 'join',
          roomId: channelName,
          username,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'room-joined' || message.type === 'user-joined') {
            clearTimeout(timeout);
            resolve({ success: true, connectionTime: Date.now() - startTime });
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve({ success: false, connectionTime: Date.now() - startTime, error: 'WebSocket error' });
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        resolve({ success: false, connectionTime: Date.now() - startTime, error: 'Connection closed' });
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      resolve({ success: false, connectionTime: Date.now() - startTime, error: errorMessage });
    }
  });
}

async function runVoiceStressTest(testConfig: VoiceTestConfig): Promise<VoiceTestResult> {
  console.log('🎙️  Starting Voice Channel Stress Test');
  console.log('━'.repeat(50));
  console.log(`WebSocket URL: ${testConfig.wsUrl}`);
  console.log(`Voice Channels: ${testConfig.voiceChannels.join(', ')}`);
  console.log(`Concurrent Users: ${testConfig.concurrentUsers}`);
  console.log(`Test Duration: ${testConfig.testDurationSeconds}s`);
  console.log('━'.repeat(50));

  const testStart = Date.now();
  const connectionTimes: number[] = [];
  let successful = 0;
  let failed = 0;

  // Distribute users across channels
  const usersPerChannel = Math.ceil(testConfig.concurrentUsers / testConfig.voiceChannels.length);

  // Create test users for each channel
  const channelPromises = testConfig.voiceChannels.map(async (channelName, channelIndex) => {
    const channelStart = channelIndex * usersPerChannel;
    const channelEnd = Math.min(channelStart + usersPerChannel, testConfig.concurrentUsers);

    const userPromises = Array.from({ length: channelEnd - channelStart }, async (_, userIndex) => {
      const username = `voice_test_${channelIndex}_${userIndex}_${Date.now()}`;
      
      const result = await connectToVoiceChannel(testConfig.wsUrl, channelName, username);
      
      if (result.success) {
        successful++;
        connectionTimes.push(result.connectionTime);
      } else {
        failed++;
        console.error(`User ${username} failed to connect to ${channelName}: ${result.error}`);
      }

      return result;
    });

    return Promise.all(userPromises);
  });

  // Wait for initial connections
  await Promise.all(channelPromises);

  // Keep connections alive for test duration
  const remainingTime = testConfig.testDurationSeconds * 1000 - (Date.now() - testStart);
  if (remainingTime > 0) {
    console.log(`\n📊 Maintaining ${successful} voice connections for ${Math.round(remainingTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, remainingTime));
  }

  const testEnd = Date.now();
  const durationMs = testEnd - testStart;

  const result: VoiceTestResult = {
    totalUsers: testConfig.concurrentUsers,
    successfulConnections: successful,
    failedConnections: failed,
    avgConnectionTimeMs: connectionTimes.length > 0
      ? Math.round(connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length)
      : 0,
    minConnectionTimeMs: connectionTimes.length > 0 ? Math.min(...connectionTimes) : 0,
    maxConnectionTimeMs: connectionTimes.length > 0 ? Math.max(...connectionTimes) : 0,
    durationMs,
  };

  console.log('\n');
  console.log('━'.repeat(50));
  console.log('📊 Voice Test Results');
  console.log('━'.repeat(50));
  console.log(`Total users: ${result.totalUsers}`);
  console.log(`Successful: ${result.successfulConnections} (${((result.successfulConnections / result.totalUsers) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${result.failedConnections}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log('━'.repeat(50));
  console.log('Connection Time Statistics:');
  console.log(`  Min: ${result.minConnectionTimeMs}ms`);
  console.log(`  Avg: ${result.avgConnectionTimeMs}ms`);
  console.log(`  Max: ${result.maxConnectionTimeMs}ms`);
  console.log('━'.repeat(50));

  // Performance assessment
  const successRate = result.successfulConnections / result.totalUsers;
  if (successRate >= 0.9 && result.avgConnectionTimeMs <= 1000) {
    console.log('✅ PASSED: Voice channel performance is acceptable');
  } else if (successRate >= 0.7) {
    console.log('⚠️  WARNING: Voice channel performance is marginal');
  } else {
    console.log('❌ FAILED: Voice channel performance is below acceptable threshold');
  }

  return result;
}

// Configuration
const testConfig: VoiceTestConfig = {
  wsUrl: process.env.WS_URL || 'ws://localhost:3002',
  voiceChannels: ['General Voice', 'Lounge', 'Gaming'],
  concurrentUsers: parseInt(process.env.VOICE_USERS || '10', 10),
  testDurationSeconds: parseInt(process.env.VOICE_DURATION || '30', 10),
};

// Run the test
runVoiceStressTest(testConfig)
  .then(() => {
    console.log('\n✅ Voice stress test completed');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error('\n❌ Voice stress test failed:', error);
    process.exit(1);
  });