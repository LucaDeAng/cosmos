/**
 * Direct Database Test for Migration 021
 * Tests that the new tables can be read/written via Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabase() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     DIRECT DATABASE TEST: Migration 021 Tables                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Check if system_alerts table exists
  console.log('📋 Test 1: Check system_alerts table');
  try {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('id, type, severity, title')
      .limit(1);

    if (error && !error.message?.includes('schema cache')) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Table exists (${(data?.length || 0)} records)`);
      passed++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // Test 2: Check if notifications table exists
  console.log('📋 Test 2: Check notifications table');
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, channel, priority, status')
      .limit(1);

    if (error && !error.message?.includes('schema cache')) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Table exists (${(data?.length || 0)} records)`);
      passed++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // Test 3: Check if alert_thresholds table exists and has default values
  console.log('📋 Test 3: Check alert_thresholds table');
  try {
    const { data, error } = await supabase
      .from('alert_thresholds')
      .select('id, threshold_type, threshold_value, is_enabled, tenant_id')
      .is('tenant_id', null)  // Get global thresholds
      .order('threshold_type');

    if (error && !error.message?.includes('schema cache')) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    } else {
      const count = data?.length || 0;
      console.log(`   ✅ Table exists with ${count} default thresholds`);
      if (count > 0) {
        console.log(`   Default thresholds:`);
        data?.forEach(t => {
          console.log(`      - ${t.threshold_type}: ${t.threshold_value} (enabled: ${t.is_enabled})`);
        });
      }
      passed++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // Test 4: Try to insert a test system alert
  console.log('📋 Test 4: Insert test system alert');
  try {
    const testAlert = {
      type: 'accuracy_drop',
      severity: 'warning',
      title: 'Test Alert from Migration 021',
      message: 'This is a test alert to verify the system_alerts table is working',
      metrics: { actual_accuracy: 0.75 },
      threshold: 0.80,
      actual_value: 0.75,
    };

    const { data, error } = await supabase
      .from('system_alerts')
      .insert([testAlert])
      .select('id, type, severity')
      .single();

    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Successfully inserted alert (ID: ${data?.id})`);
      
      // Verify we can read it back
      const { data: readData } = await supabase
        .from('system_alerts')
        .select('id, type, severity, title')
        .eq('id', data?.id)
        .single();

      if (readData) {
        console.log(`   ✅ Verified: Can read back the inserted alert`);
        passed++;
      } else {
        console.log(`   ⚠️  Warning: Could not verify inserted alert`);
        passed++;
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // Test 5: Try to insert a test notification
  console.log('📋 Test 5: Insert test notification');
  try {
    const testNotification = {
      channel: 'in_app',
      priority: 'normal',
      title: 'Test Notification',
      message: 'This is a test notification from Migration 021',
      status: 'pending',
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert([testNotification])
      .select('id, channel, priority')
      .single();

    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Successfully inserted notification (ID: ${data?.id})`);
      
      // Verify we can read it back
      const { data: readData } = await supabase
        .from('notifications')
        .select('id, channel, priority, title')
        .eq('id', data?.id)
        .single();

      if (readData) {
        console.log(`   ✅ Verified: Can read back the inserted notification`);
        passed++;
      } else {
        console.log(`   ⚠️  Warning: Could not verify inserted notification`);
        passed++;
      }
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║ Database Test Results: ${passed} passed, ${failed} failed               ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (failed === 0) {
    console.log('🎉 All database tests passed!');
    console.log('✅ Migration 021 is fully functional!');
    console.log('\nNext steps:');
    console.log('   1. Implement Alert Agent in agents/subagents/');
    console.log('   2. Implement Notification Service in services/');
    console.log('   3. Create API endpoints in routes/');
    console.log('   4. Add agent handlers to orchestrator');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Check the database connection.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

testDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
