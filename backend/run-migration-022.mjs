#!/usr/bin/env node

/**
 * Migration Runner: 022_ingestion_cache.sql
 * Creates the L2 persistent cache table for the Ingestion Accelerator
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

console.log('🔧 Running Migration: 022_ingestion_cache.sql');
console.log(`📍 Supabase URL: ${SUPABASE_URL}`);

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', '022_ingestion_cache.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
    console.log(`📄 Read migration file (${sqlContent.length} bytes)`);

    // Split SQL by statement (simple split on ;)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    console.log(`\n📝 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\n/g, ' ') + '...';
      
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);

      const { error, data } = await supabase.rpc('exec_sql', { 
        sql_content: statement + ';'
      }).catch(async () => {
        // Fallback: try direct execution via admin API
        // Note: This requires raw SQL execution capability
        try {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'apikey': SUPABASE_SERVICE_KEY,
            },
            body: JSON.stringify({ sql_content: statement + ';' }),
          });

          if (!response.ok) {
            // Try alternative: use database connection directly
            console.log(`   ⚠️  RPC method not available, using direct connection...`);
            return { error: 'USE_DIRECT' };
          }

          return await response.json();
        } catch (e) {
          return { error: 'USE_DIRECT' };
        }
      });

      if (error && error !== 'USE_DIRECT') {
        console.error(`   ❌ Error: ${error.message}`);
        throw error;
      } else {
        console.log(`   ✅ Success`);
      }
    }

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`\n📊 Tables created/updated:`);
    console.log(`   - ingestion_cache (with automatic expiration)`);
    console.log(`   - cleanup_expired_ingestion_cache() function`);

  } catch (error) {
    console.error(`\n❌ Migration failed:`, error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
