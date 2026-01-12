/**
 * Apply Migration 011 - Extend Source Types
 * Executes SQL directly via PostgreSQL connection
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          APPLYING MIGRATION 011: EXTEND SOURCE TYPES          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Try session pooler first (more reliable), fallback to direct
  const databaseUrl = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL not found in .env');
    process.exit(1);
  }

  console.log('✅ Database URL found');
  console.log('');

  // Read migration file
  const migrationPath = path.join(__dirname, 'migrations', '011_extend_source_types.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Error: Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log('📄 Migration file loaded');
  console.log(`   Path: ${migrationPath}`);
  console.log('');

  // Connect to PostgreSQL
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log('🚀 Executing migration...\n');

    await client.query(migrationSQL);

    console.log('✅ Migration 011 applied successfully!\n');

    // Verify the constraint
    console.log('🔍 Verifying constraint...');
    const result = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conname = 'knowledge_embeddings_source_type_check'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Constraint verified:\n');
      console.log(`   Name: ${result.rows[0].conname}`);
      console.log(`   Definition: ${result.rows[0].definition.substring(0, 100)}...`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION 011 COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error executing migration:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
