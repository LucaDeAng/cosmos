// Migration Runner Script
// Executes SQL migration files against the database

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Missing DATABASE_URL environment variable');
  process.exit(1);
}

async function runMigrations() {
  console.log('='.repeat(60));
  console.log('🔄 Running Database Migrations');
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

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`\n📄 Running migration: ${file}`);
      
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      try {
        await client.query(sql);
        console.log(`✅ Migration completed: ${file}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${file}`);
        console.error(error.message);
        throw error;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All migrations completed successfully');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Migration process failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations().catch(console.error);
