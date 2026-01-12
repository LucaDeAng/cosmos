/**
 * Test Script for Migration 021: System Alerts & Notifications
 * Tests the new Alert Agent and Notification Service via API
 */

const BASE_URL = 'http://localhost:3000/api';

// Test configuration
const tests = [
  {
    name: 'Test 1: Create System Alert',
    endpoint: '/orchestrator',
    method: 'POST',
    payload: {
      message: 'Create a system alert for accuracy drop on tenant demo-tenant-001',
      context: {
        type: 'alert',
        action: 'create',
        tenantId: 'demo-tenant-001'
      }
    }
  },
  {
    name: 'Test 2: List System Alerts',
    endpoint: '/orchestrator',
    method: 'POST',
    payload: {
      message: 'List all system alerts',
      context: {
        type: 'alert',
        action: 'list'
      }
    }
  },
  {
    name: 'Test 3: Create Notification',
    endpoint: '/orchestrator',
    method: 'POST',
    payload: {
      message: 'Send an in-app notification to user about the accuracy drop alert',
      context: {
        type: 'notification',
        action: 'create',
        channel: 'in_app',
        priority: 'high'
      }
    }
  },
  {
    name: 'Test 4: Query Alert Thresholds',
    endpoint: '/orchestrator',
    method: 'POST',
    payload: {
      message: 'Get the configured alert thresholds',
      context: {
        type: 'alert',
        action: 'get_thresholds'
      }
    }
  },
  {
    name: 'Test 5: Test Database Connection',
    endpoint: '/orchestrator',
    method: 'POST',
    payload: {
      message: 'Check database tables: system_alerts, notifications, alert_thresholds',
      context: {
        type: 'system',
        action: 'check_tables'
      }
    }
  }
];

// Run tests
async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          TESTING MIGRATION 021: System Alerts                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`📋 ${test.name}`);
    console.log(`   Endpoint: ${test.endpoint}`);
    console.log(`   Method: ${test.method}`);

    try {
      const response = await fetch(`${BASE_URL}${test.endpoint}`, {
        method: test.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload),
      });

      if (!response.ok) {
        console.log(`   ❌ Status: ${response.status}`);
        const error = await response.text();
        console.log(`   Error: ${error}`);
        failed++;
      } else {
        const data = await response.json();
        console.log(`   ✅ Status: 200`);
        console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}...`);
        passed++;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }

    console.log('');
  }

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║ Test Results: ${passed} passed, ${failed} failed                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! Migration 021 is working correctly.');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Check the backend logs for details.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Check if backend is running
async function checkBackendHealth() {
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);

    if (response && response.ok) {
      return true;
    }

    // Try orchestrator endpoint with ping
    const pingResponse = await fetch(`${BASE_URL}/orchestrator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping' }),
    });

    return pingResponse.ok;
  } catch {
    return false;
  }
}

// Main
(async () => {
  console.log('🔍 Checking if backend is running...');

  const isRunning = await checkBackendHealth();

  if (!isRunning) {
    console.error(`❌ Backend is not running on ${BASE_URL}`);
    console.error('Start the backend with: npm run dev (in the backend folder)');
    process.exit(1);
  }

  console.log('✅ Backend is running\n');
  await runTests();
})();
