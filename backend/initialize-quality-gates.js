/**
 * Initialize Quality Gates for Companies
 *
 * This script initializes default quality gates for companies.
 * Can be run for a specific company or all companies.
 *
 * Usage:
 *   node initialize-quality-gates.js                    # Initialize for all companies
 *   node initialize-quality-gates.js <company-id>       # Initialize for specific company
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Default Quality Gates Configuration
const DEFAULT_QUALITY_GATES = [
  // Confidence Gates
  {
    gate_name: 'Minimum Overall Confidence',
    gate_type: 'confidence',
    threshold: 0.50,
    operator: '>=',
    description: 'Items must have at least 50% overall confidence to be auto-accepted. Below this threshold, manual review is required.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'High Confidence Threshold',
    gate_type: 'confidence',
    threshold: 0.80,
    operator: '>=',
    description: 'Items with 80%+ confidence are automatically accepted without review.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Critical Field Confidence',
    gate_type: 'confidence',
    threshold: 0.60,
    operator: '>=',
    description: 'Critical fields (name, type) must have at least 60% confidence.',
    is_blocking: true,
    applies_to: 'ingestion',
  },

  // Completeness Gates
  {
    gate_name: 'Required Fields Completeness',
    gate_type: 'completeness',
    threshold: 1.0,
    operator: '==',
    description: 'All required fields (name, type) must be present.',
    is_blocking: true,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Recommended Fields Completeness',
    gate_type: 'completeness',
    threshold: 0.70,
    operator: '>=',
    description: 'At least 70% of recommended fields should be populated for optimal analysis.',
    is_blocking: false,
    applies_to: 'ingestion',
  },

  // Consistency Gates
  {
    gate_name: 'No Duplicate Items',
    gate_type: 'consistency',
    threshold: 0.0,
    operator: '==',
    description: 'Items must not be duplicates of existing portfolio items.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Valid Data Types',
    gate_type: 'consistency',
    threshold: 1.0,
    operator: '==',
    description: 'All fields must have valid data types (e.g., dates as dates, numbers as numbers).',
    is_blocking: true,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Budget Consistency',
    gate_type: 'consistency',
    threshold: 1.0,
    operator: '==',
    description: 'Budget values must be positive and within reasonable ranges.',
    is_blocking: false,
    applies_to: 'ingestion',
  },

  // Custom Gates
  {
    gate_name: 'Enrichment Success Rate',
    gate_type: 'custom',
    threshold: 0.50,
    operator: '>=',
    description: 'At least 50% of items should be successfully enriched from external sources.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
];

async function initializeQualityGatesForCompany(companyId, companyName) {
  console.log(`\n🎯 Initializing quality gates for: ${companyName} (${companyId})`);

  try {
    // Check if company already has quality gates
    const { data: existingGates, error: checkError } = await supabase
      .from('quality_gates')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    if (checkError) {
      console.error('  ❌ Error checking existing gates:', checkError.message);
      return false;
    }

    if (existingGates && existingGates.length > 0) {
      console.log('  ℹ️ Quality gates already exist. Skipping.');
      return true;
    }

    // Insert default quality gates
    const gatesToInsert = DEFAULT_QUALITY_GATES.map(gate => ({
      company_id: companyId,
      ...gate,
      is_active: true,
      mcp_enabled: false,
      mcp_config: {},
    }));

    const { data, error } = await supabase
      .from('quality_gates')
      .insert(gatesToInsert)
      .select();

    if (error) {
      console.error('  ❌ Error inserting quality gates:', error.message);
      return false;
    }

    console.log(`  ✅ Successfully initialized ${data?.length || 0} quality gates`);
    return true;
  } catch (error) {
    console.error('  ❌ Failed to initialize quality gates:', error.message);
    return false;
  }
}

async function main() {
  const companyId = process.argv[2];

  console.log('🚀 Quality Gates Initialization Script');
  console.log('=' .repeat(60));

  try {
    if (companyId) {
      // Initialize for specific company
      const { data: company, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .single();

      if (error || !company) {
        console.error('❌ Company not found:', companyId);
        process.exit(1);
      }

      const success = await initializeQualityGatesForCompany(company.id, company.name);
      console.log('\n' + '='.repeat(60));
      console.log(success ? '✅ Initialization complete!' : '❌ Initialization failed');
    } else {
      // Initialize for all companies
      const { data: companies, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');

      if (error) {
        console.error('❌ Error fetching companies:', error.message);
        process.exit(1);
      }

      if (!companies || companies.length === 0) {
        console.log('ℹ️ No companies found.');
        process.exit(0);
      }

      console.log(`\nFound ${companies.length} companies\n`);

      let successCount = 0;
      for (const company of companies) {
        const success = await initializeQualityGatesForCompany(company.id, company.name);
        if (success) successCount++;
      }

      console.log('\n' + '='.repeat(60));
      console.log(`✅ Initialized quality gates for ${successCount}/${companies.length} companies`);
    }
  } catch (error) {
    console.error('❌ Script error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
