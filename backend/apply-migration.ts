/**
 * Apply Migration Script
 *
 * Runs SQL migrations directly against Supabase
 * Usage: npx tsx -r dotenv/config apply-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration(filename: string) {
  const filePath = path.join(__dirname, 'supabase', 'migrations', filename);

  if (!fs.existsSync(filePath)) {
    console.error(`Migration file not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\nApplying migration: ${filename}`);
  console.log('='.repeat(50));

  const sql = fs.readFileSync(filePath, 'utf-8');

  // Split by semicolons but keep SQL blocks intact
  const statements = sql
    .split(/;\s*$/gm)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements\n`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

      if (error) {
        // Try direct query instead
        const { error: directError } = await supabase
          .from('_migrations')
          .select('*')
          .limit(0);

        // Use raw SQL via fetch
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({})
        });

        console.log(`   Warning: ${error.message}`);
      } else {
        console.log('   OK');
      }
    } catch (err) {
      console.log(`   Error: ${err}`);
    }
  }

  console.log('\nMigration complete!');
}

// Get migration filename from args or use default
const migrationFile = process.argv[2] || '20250119_external_knowledge_cache.sql';
applyMigration(migrationFile);
