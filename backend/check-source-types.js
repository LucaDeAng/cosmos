/**
 * Check Source Types in knowledge_embeddings
 *
 * Identifies source_type values that don't conform to the new constraint
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Valid source types according to migration 011 (updated)
const VALID_SOURCE_TYPES = [
  'document',
  'assessment',
  'portfolio_item',
  'initiative',
  'strategy',
  'roadmap',
  'budget',
  'conversation',
  'external',
  'framework',
  'methodology',
  'benchmark',
  'best_practice',
  // Catalog types
  'catalog_it_services',
  'catalog_technologies',
  'catalog_portfolio_taxonomy',
  'catalog_prioritization',
  'catalog_examples',
  'catalog_entities',
  'catalog_industries',
  'catalog_products'
];

async function checkSourceTypes() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       CHECKING SOURCE TYPES IN knowledge_embeddings          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get distinct source_type values
    console.log('📊 Fetching distinct source_type values...\n');

    const { data: allRecords, error: fetchError } = await supabase
      .from('knowledge_embeddings')
      .select('source_type');

    if (fetchError) {
      console.error('❌ Error fetching data:', fetchError.message);
      process.exit(1);
    }

    if (!allRecords || allRecords.length === 0) {
      console.log('✅ Table is empty - no conflicts possible');
      console.log('   Migration 011 can be applied safely.\n');
      return;
    }

    // Count occurrences of each source_type
    const typeCounts = {};
    allRecords.forEach(record => {
      const type = record.source_type || '(NULL)';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    console.log(`📋 Found ${allRecords.length} total records\n`);
    console.log('Source Type Distribution:');
    console.log('─'.repeat(50));

    const invalidTypes = [];

    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const isValid = VALID_SOURCE_TYPES.includes(type);
        const status = isValid ? '✅' : '❌';
        console.log(`   ${status} ${type}: ${count} records`);

        if (!isValid) {
          invalidTypes.push({ type, count });
        }
      });

    console.log('─'.repeat(50));
    console.log('');

    if (invalidTypes.length === 0) {
      console.log('✅ All source_type values are valid!');
      console.log('   Migration 011 can be applied safely.\n');
    } else {
      console.log('❌ Found invalid source_type values:\n');

      invalidTypes.forEach(({ type, count }) => {
        console.log(`   • "${type}" (${count} records)`);
      });

      console.log('\n📋 Options to fix:\n');
      console.log('   1. Update invalid values to valid types:');

      invalidTypes.forEach(({ type }) => {
        // Suggest a mapping
        let suggestion = 'document'; // default
        if (type.includes('product') || type.includes('service')) {
          suggestion = 'portfolio_item';
        } else if (type.includes('chat') || type.includes('message')) {
          suggestion = 'conversation';
        } else if (type.includes('bench') || type.includes('kpi')) {
          suggestion = 'benchmark';
        }

        console.log(`      UPDATE knowledge_embeddings SET source_type = '${suggestion}' WHERE source_type = '${type}';`);
      });

      console.log('\n   2. Or delete the non-conforming records:');
      invalidTypes.forEach(({ type }) => {
        console.log(`      DELETE FROM knowledge_embeddings WHERE source_type = '${type}';`);
      });

      console.log('\n   3. After fixing, re-apply migration 011:\n');
      console.log('      Run the SQL in: backend/migrations/011_extend_source_types.sql');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSourceTypes();
