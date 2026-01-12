/**
 * Applies migration 020 - learned_field_mappings table
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying migration 020: learned_field_mappings\n');

  const migrationPath = path.join(__dirname, 'migrations', '020_create_learned_field_mappings.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  try {
    // Execute SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sql
    });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.log('\n📋 Execute this SQL manually in Supabase SQL Editor:\n');
      console.log(sql);
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!');

    // Verify table was created
    const { data: testData, error: testError } = await supabase
      .from('learned_field_mappings')
      .select('*')
      .limit(0);

    if (testError) {
      console.log('⚠️ Table verification failed:', testError.message);
      console.log('\nTable may not be created. Execute SQL manually.');
    } else {
      console.log('✅ Table learned_field_mappings verified!');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('\n📋 Execute this SQL manually in Supabase SQL Editor:\n');
    console.log(sql);
    process.exit(1);
  }
}

applyMigration();
