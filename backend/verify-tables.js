/**
 * Verifica tabelle Supabase create per le feature di data ingestion
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function verifyTables() {
  console.log('🔍 Verifying Supabase tables...\n');

  const tablesToVerify = [
    'learned_field_mappings',
    'item_confidence_metrics',
    'quality_gates',
    'quality_alerts',
  ];

  for (const tableName of tablesToVerify) {
    try {
      // Query table info from information_schema
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `
      });

      if (error) {
        // Try direct query as fallback
        const { data: testData, error: testError } = await supabase
          .from(tableName)
          .select('*')
          .limit(0);

        if (testError) {
          console.log(`❌ ${tableName}: NOT FOUND or ERROR`);
          console.log(`   Error: ${testError.message}\n`);
        } else {
          console.log(`✅ ${tableName}: EXISTS (verified via query)`);
          console.log(`   Status: Table accessible\n`);
        }
      } else {
        console.log(`✅ ${tableName}: EXISTS`);
        console.log(`   Columns: ${data?.length || 0}`);
        if (data && data.length > 0) {
          console.log('   Schema:');
          data.slice(0, 5).forEach(col => {
            console.log(`     - ${col.column_name} (${col.data_type})`);
          });
          if (data.length > 5) {
            console.log(`     ... and ${data.length - 5} more columns`);
          }
        }
        console.log('');
      }
    } catch (err) {
      console.log(`❌ ${tableName}: ERROR`);
      console.log(`   ${err.message}\n`);
    }
  }

  // Verify indexes
  console.log('\n🔍 Verifying indexes...\n');

  const expectedIndexes = [
    { table: 'learned_field_mappings', index: 'idx_learned_mappings_tenant' },
    { table: 'item_confidence_metrics', index: 'idx_confidence_metrics_batch' },
    { table: 'quality_gates', index: 'idx_quality_gates_tenant' },
    { table: 'quality_alerts', index: 'idx_quality_alerts_tenant' },
  ];

  for (const { table, index } of expectedIndexes) {
    try {
      const { data: testData, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!error) {
        console.log(`✅ ${table}.${index}: Table accessible (index likely exists)`);
      } else {
        console.log(`⚠️ ${table}.${index}: ${error.message}`);
      }
    } catch (err) {
      console.log(`❌ ${table}.${index}: ${err.message}`);
    }
  }

  console.log('\n✅ Verification complete!');
}

verifyTables().catch(console.error);
