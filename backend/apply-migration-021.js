/**
 * Apply Migration 021: System Alerts and Notifications
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       APPLYING MIGRATION 021: System Alerts & Notifications    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase credentials');
    console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file');
    process.exit(1);
  }

  console.log('✅ Supabase credentials found');
  console.log(`   URL: ${supabaseUrl}`);
  console.log('');

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read migration file
  const migrationPath = path.join(__dirname, 'migrations', '021_system_alerts_notifications.sql');
  console.log('📄 Reading migration file...');

  try {
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log(`   File size: ${(migrationSQL.length / 1024).toFixed(1)} KB`);
    console.log('');

    console.log('🚀 Applying migration...');
    console.log('   This may take 30-60 seconds...\n');

    const data = null;
    const error = null;

    if (error) {
      console.error('❌ Error applying migration:');
      console.error('   ', error.message || error);
      process.exit(1);
    }

    console.log('\n⚠️  Note: Supabase JS client cannot execute DDL statements directly.');
    console.log('\n📋 Please apply the migration manually using SQL Editor:\n');
    console.log('   1. Open Supabase Dashboard: https://app.supabase.com');
    console.log('   2. Navigate to: SQL Editor');
    console.log('   3. Create a new query');
    console.log('   4. Copy the entire contents of:');
    console.log(`      ${migrationPath}`);
    console.log('   5. Paste into the SQL Editor');
    console.log('   6. Click "Run"');
    console.log('');
    console.log('   The migration will create:');
    console.log('   ✓ system_alerts table (alert monitoring)');
    console.log('   ✓ notifications table (multi-channel notifications)');
    console.log('   ✓ alert_thresholds table (configurable thresholds)');
    console.log('   ✓ 15+ indexes for performance');
    console.log('   ✓ Triggers for updated_at columns');
    console.log('   ✓ Default alert thresholds');
    console.log('');

    // Verify tables
    console.log('🔍 Checking if tables were created...\n');

    const tables = ['system_alerts', 'notifications', 'alert_thresholds'];
    let allCreated = true;

    for (const table of tables) {
      const { data: tableData, error: tableError } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!tableError || tableError.code === 'PGRST116') {
        // Either table exists or it's empty
        console.log(`   ✅ ${table} table exists`);
      } else {
        console.log(`   ❌ ${table} table NOT found (${tableError.message})`);
        allCreated = false;
      }
    }

    if (allCreated) {
      console.log('\n🎉 Migration 021 appears to be successfully applied!');
      console.log('\nNext steps:');
      console.log('   1. Run: npm run build');
      console.log('   2. Restart backend and frontend servers');
      console.log('   3. Test the new Alert Agent and Notification Service');
    } else {
      console.log('\n⚠️  Some tables were not found. Please apply the migration manually.');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error reading migration file:');
    console.error('   ', error.message);
    process.exit(1);
  }
}

applyMigration().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
