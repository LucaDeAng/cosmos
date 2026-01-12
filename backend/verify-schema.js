/**
 * Verify Database Schema
 * Checks if all enhanced schema fields are present
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verifySchema() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║              VERIFYING DATABASE SCHEMA                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if enhanced fields exist by trying to insert a test record
  console.log('📦 Checking Products table schema...\n');

  try {
    const testProduct = {
      name: 'Schema Test Product',
      description: 'Testing enhanced schema fields',
      status: 'active',
      owner: 'Test',
      category: 'Test',
      lifecycle_stage: 'concept',

      // Enhanced schema fields
      schema_version: 1,
      item_type: 'product',
      completeness_score: 0.5,
      tipo_offerta: 'saas',
      linea_di_business: 'Test Business',

      // Structured data
      identity_data: {
        product_id: '550e8400-e29b-41d4-a716-446655440000',
        nome_prodotto: 'Test Product',
        categoria_prodotto: 'Software',
      },
      value_proposition_data: {
        segmenti_target: [],
      },
      go_to_market_data: {
        canali: [],
      },

      // Metadata
      missing_fields: ['B.value_proposition'],
      data_sources: ['test'],
      target_market: { company_size: ['enterprise'] },
      technologies: ['React'],
      integrations: ['Salesforce'],
    };

    const { data: insertedProduct, error: insertError } = await supabase
      .from('products')
      .insert(testProduct)
      .select()
      .single();

    if (insertError) {
      console.log('❌ Products table missing enhanced fields:');
      console.log('   Error:', insertError.message);
      console.log('\n   Schema enhancement not yet applied.');
      console.log('   Please apply the migration manually (see MIGRATION_QUICKSTART.md)');
      console.log('');
      return false;
    }

    console.log('✅ Products table has enhanced schema!');
    console.log('   Fields verified:');
    console.log('   ✓ schema_version');
    console.log('   ✓ item_type');
    console.log('   ✓ completeness_score');
    console.log('   ✓ identity_data (JSONB)');
    console.log('   ✓ value_proposition_data (JSONB)');
    console.log('   ✓ go_to_market_data (JSONB)');
    console.log('   ✓ missing_fields (JSONB)');
    console.log('   ✓ tipo_offerta');
    console.log('   ✓ linea_di_business');
    console.log('   ✓ target_market (JSONB)');
    console.log('   ✓ technologies (JSONB)');
    console.log('   ✓ integrations (JSONB)');
    console.log('');

    // Cleanup test record
    await supabase.from('products').delete().eq('id', insertedProduct.id);

  } catch (error) {
    console.log('❌ Error testing products table:', error.message);
    return false;
  }

  console.log('🔧 Checking Services table schema...\n');

  try {
    const testService = {
      name: 'Schema Test Service',
      description: 'Testing enhanced schema fields',
      status: 'active',
      owner: 'Test',
      category: 'Test',

      // Enhanced schema fields
      schema_version: 1,
      item_type: 'service',
      completeness_score: 0.5,
      tipo_servizio: 'managed_service',
      delivery_model: 'fully_managed',
      linea_di_business: 'Test Business',

      // Structured data
      identity_data: {
        service_id: '660e8400-e29b-41d4-a716-446655440001',
        nome_servizio: 'Test Service',
        categoria_servizio: 'Managed Services',
      },
      delivery_data: {
        segmenti_target: [],
      },
      pricing_sla_data: {
        sla: {},
      },

      // Metadata
      missing_fields: ['B.scope'],
      data_sources: ['test'],
      target_market: { company_size: ['enterprise'] },
      availability: { hours: '24x7' },
      sla_data: { availability_target: 99.9 },
      contract_terms: { minimum_term: '12 months' },
      support_channels: [{ channel: 'email', availability: '24x7' }],
    };

    const { data: insertedService, error: insertError } = await supabase
      .from('services')
      .insert(testService)
      .select()
      .single();

    if (insertError) {
      console.log('❌ Services table missing enhanced fields:');
      console.log('   Error:', insertError.message);
      console.log('\n   Schema enhancement not yet applied.');
      console.log('   Please apply the migration manually (see MIGRATION_QUICKSTART.md)');
      console.log('');
      return false;
    }

    console.log('✅ Services table has enhanced schema!');
    console.log('   Fields verified:');
    console.log('   ✓ schema_version');
    console.log('   ✓ item_type');
    console.log('   ✓ completeness_score');
    console.log('   ✓ identity_data (JSONB)');
    console.log('   ✓ delivery_data (JSONB)');
    console.log('   ✓ pricing_sla_data (JSONB)');
    console.log('   ✓ missing_fields (JSONB)');
    console.log('   ✓ tipo_servizio');
    console.log('   ✓ delivery_model');
    console.log('   ✓ linea_di_business');
    console.log('   ✓ target_market (JSONB)');
    console.log('   ✓ availability (JSONB)');
    console.log('   ✓ sla_data (JSONB)');
    console.log('   ✓ support_channels (JSONB)');
    console.log('');

    // Cleanup test record
    await supabase.from('services').delete().eq('id', insertedService.id);

  } catch (error) {
    console.log('❌ Error testing services table:', error.message);
    return false;
  }

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    SCHEMA VERIFICATION                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('   ✅ Products table: FULLY ENHANCED');
  console.log('   ✅ Services table: FULLY ENHANCED');
  console.log('   ✅ All JSONB fields working');
  console.log('   ✅ All metadata fields present');
  console.log('');
  console.log('   🎉 Database schema is complete and ready!\n');

  return true;
}

verifySchema()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
