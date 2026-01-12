/**
 * Test Migration Script
 *
 * Creates sample product/service data and tests the migration process
 */

require('dotenv').config();

async function testMigration() {
  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              MIGRATION TEST SETUP                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Create test product
  console.log('📦 Creating test product...');
  const { data: testProduct, error: productError } = await supabase
    .from('products')
    .insert({
      name: 'Test CRM Platform',
      description: 'Cloud-based CRM solution for enterprise sales teams',
      status: 'active',
      owner: 'Product Team',
      category: 'CRM',
      lifecycle_stage: 'ga',
      budget: 500000,
      business_value: 9,
      tags: ['crm', 'sales', 'enterprise'],
    })
    .select()
    .single();

  if (productError) {
    console.error('Error creating test product:', productError);
  } else {
    console.log(`   ✅ Created test product: ${testProduct.id}\n`);
  }

  // Create test service
  console.log('🔧 Creating test service...');
  const { data: testService, error: serviceError } = await supabase
    .from('services')
    .insert({
      name: 'Managed Cloud Infrastructure',
      description: '24/7 monitoring and management of cloud infrastructure with SLA guarantees',
      status: 'active',
      owner: 'Cloud Operations',
      category: 'Managed Services',
      budget: 300000,
      business_value: 8,
      sla_compliance: 99.9,
      tags: ['managed-service', 'cloud', 'infrastructure'],
    })
    .select()
    .single();

  if (serviceError) {
    console.error('Error creating test service:', serviceError);
  } else {
    console.log(`   ✅ Created test service: ${testService.id}\n`);
  }

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           RUNNING MIGRATION (DRY RUN)                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Run migration in dry-run mode
  const { migrateProductServiceData } = require('./dist/migrations/migrateProductServiceData');

  try {
    const stats = await migrateProductServiceData({
      dryRun: true,
      batchSize: 10,
    });

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const success = stats.errors.length === 0 && stats.productsProcessed > 0;

    if (success) {
      console.log('   ✅ Migration test PASSED');
      console.log(`   📦 Products processed: ${stats.productsProcessed}`);
      console.log(`   🔧 Services processed: ${stats.servicesProcessed}`);
      console.log('');
      console.log('   Next steps:');
      console.log('   1. Review the migration output above');
      console.log('   2. Run with --live flag to apply changes: node run-migration.js --live');
      console.log('');
    } else {
      console.log('   ❌ Migration test FAILED');
      console.log(`   Errors: ${stats.errors.length}`);
      stats.errors.forEach(err => console.log(`      - ${err.id}: ${err.error}`));
      console.log('');
    }

    // Cleanup test data
    console.log('🧹 Cleaning up test data...');
    if (testProduct) {
      await supabase.from('products').delete().eq('id', testProduct.id);
      console.log('   ✅ Deleted test product');
    }
    if (testService) {
      await supabase.from('services').delete().eq('id', testService.id);
      console.log('   ✅ Deleted test service');
    }
    console.log('');

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Migration test failed with error:', error);

    // Cleanup on error
    if (testProduct) {
      await supabase.from('products').delete().eq('id', testProduct.id);
    }
    if (testService) {
      await supabase.from('services').delete().eq('id', testService.id);
    }

    process.exit(1);
  }
}

testMigration();
