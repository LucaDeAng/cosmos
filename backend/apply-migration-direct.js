/**
 * Apply Migration Directly via Supabase Management API
 * Uses Supabase REST API to execute SQL migration
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

async function executeSQLDirect() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       APPLYING MIGRATION VIA SUPABASE MANAGEMENT API          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  // Extract project ref from URL (e.g., https://xtfrgfqgjfrnrfqmsbgk.supabase.co)
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
  console.log(`✅ Project ref: ${projectRef}`);
  console.log('');

  // Read migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '007_complete_product_service_schema.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file loaded');
  console.log(`   Size: ${Math.round(migrationSQL.length / 1024)} KB`);
  console.log('');

  // The Supabase client cannot execute raw SQL directly
  // We need to use the SQL REST API endpoint
  console.log('🚀 Executing migration via REST API...\n');

  const apiUrl = `${supabaseUrl}/rest/v1/rpc/query`;

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  };

  // Unfortunately, Supabase doesn't expose a public SQL execution endpoint
  // The recommended approach is to use the Supabase Dashboard SQL Editor

  console.log('⚠️  Direct SQL execution via API is not available in Supabase.');
  console.log('');
  console.log('📋 To apply the migration, please use ONE of these methods:\n');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log('METHOD 1: Supabase Dashboard (Recommended) - 2 minutes');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('1. Open: https://app.supabase.com/project/' + projectRef + '/sql/new');
  console.log('2. Copy the content of:');
  console.log('   ' + migrationPath);
  console.log('3. Paste into SQL Editor');
  console.log('4. Click "Run" button');
  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('METHOD 2: Using psql CLI');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('1. Get your database connection string from Supabase dashboard');
  console.log('2. Run:');
  console.log('   psql "YOUR_CONNECTION_STRING" < ' + migrationPath);
  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('METHOD 3: Supabase CLI (if installed)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('1. Link project: supabase link --project-ref ' + projectRef);
  console.log('2. Apply migration: supabase db push');
  console.log('');
  console.log('═════════════════════════════════════════════════════════════\n');

  console.log('💡 Quick Link: https://app.supabase.com/project/' + projectRef + '/sql/new\n');

  process.exit(0);
}

executeSQLDirect();
