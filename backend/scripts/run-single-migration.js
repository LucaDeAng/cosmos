// Single Migration Runner Script
// Executes a specific SQL migration file against the database

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use SESSION_DATABASE_URL for migrations (better for DDL statements)
const connectionString = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL;
const migrationFile = process.argv[2];

if (!connectionString) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

if (!migrationFile) {
  console.error('❌ Usage: node run-single-migration.js <migration-file>');
  console.error('   Example: node run-single-migration.js 012_rag_documents.sql');
  process.exit(1);
}

async function runMigration() {
  console.log('='.repeat(60));
  console.log(`🔄 Running Single Migration: ${migrationFile}`);
  console.log('='.repeat(60));

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sqlPath = path.join(__dirname, '../migrations', migrationFile);

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Migration file not found: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`\n📄 Executing: ${migrationFile}`);
    await client.query(sql);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration completed: ${migrationFile}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration().catch(console.error);
