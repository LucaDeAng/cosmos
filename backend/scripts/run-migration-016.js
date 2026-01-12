// Run Migration 016 - Multi-Sector Enrichment
// Executes only the 016 migration file

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use session pooler (more reliable than direct connection)
const connectionString = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Missing SESSION_DATABASE_URL or DATABASE_URL environment variable');
  process.exit(1);
}

async function runMigration016() {
  console.log('='.repeat(60));
  console.log('🔄 Running Migration 016: Multi-Sector Enrichment');
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

    const sqlPath = path.join(__dirname, '../migrations/016_multi_sector_enrichment.sql');

    if (!fs.existsSync(sqlPath)) {
      console.error('❌ Migration file not found:', sqlPath);
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('\n📄 Executing migration...');

    await client.query(sql);

    console.log('\n✅ Migration 016 completed successfully!');
    console.log('='.repeat(60));

    // Verify tables were created
    console.log('\n📊 Verifying created tables...');

    const tables = ['enrichment_metadata', 'enrichment_cache', 'api_rate_limits', 'sector_keywords'];
    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = $1
        )
      `, [table]);
      console.log(`   ${result.rows[0].exists ? '✅' : '❌'} ${table}`);
    }

    // Count sector keywords
    const keywordsResult = await client.query('SELECT COUNT(*) FROM sector_keywords');
    console.log(`\n📝 Sector keywords seeded: ${keywordsResult.rows[0].count}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('\n💡 Tip: Some objects already exist. Migration may have been partially applied.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration016().catch(console.error);
