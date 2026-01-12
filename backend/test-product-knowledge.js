/**
 * Test script for Product Knowledge Layer
 *
 * Tests the three knowledge sources:
 * 1. Company Catalogs (RAG)
 * 2. Icecat MCP (if API key configured)
 * 3. GS1 Taxonomy
 *
 * Run with: node test-product-knowledge.js
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 Product Knowledge Layer Test Suite');
  console.log('========================================\n');

  try {
    // Import the orchestrator
    const { getProductKnowledgeOrchestrator } = require('./dist/knowledge/ProductKnowledgeOrchestrator');

    const orchestrator = getProductKnowledgeOrchestrator();

    // Initialize
    console.log('⏳ Initializing orchestrator...\n');
    await orchestrator.initialize();

    // Get stats
    const stats = orchestrator.getStats();
    console.log('📊 Knowledge Layer Stats:');
    console.log(`   Catalog: ${stats.catalogStats.total} entries (${stats.catalogStats.products} products, ${stats.catalogStats.services} services)`);
    console.log(`   GS1: ${stats.gs1Stats.totalCategories} categories in ${stats.gs1Stats.segments} segments`);
    console.log(`   Icecat: ${stats.icecatEnabled ? 'Enabled' : 'Disabled (no API key)'}\n`);

    // Test items
    const testItems = [
      {
        name: 'Microsoft 365 Business Premium',
        description: 'Productivity suite with security features',
        type: 'product'
      },
      {
        name: 'AWS EC2 Instances',
        description: 'Cloud compute virtual machines',
        type: 'product'
      },
      {
        name: 'Managed SOC Service',
        description: '24/7 security operations center monitoring',
        type: 'service'
      },
      {
        name: 'Google Workspace Enterprise',
        description: 'Cloud collaboration and productivity platform',
        type: 'product'
      },
      {
        name: 'SAP Basis Administration',
        description: 'Managed SAP system administration and support',
        type: 'service'
      }
    ];

    console.log(`🔄 Testing enrichment with ${testItems.length} items...\n`);

    // Enrich items
    const result = await orchestrator.enrichItems(testItems, {
      enableCompanyCatalog: true,
      enableIcecat: stats.icecatEnabled,
      enableGS1: true,
      industryContext: 'Technology'
    });

    // Display results
    console.log('\n📋 Enrichment Results:\n');
    console.log('-'.repeat(60));

    for (const item of result.items) {
      console.log(`\n✅ ${item.name}`);
      console.log(`   Type: ${item.type}`);

      if (item.vendor) {
        console.log(`   Vendor: ${item.vendor}`);
      }
      if (item.category) {
        console.log(`   Category: ${item.category}`);
      }
      if (item.subcategory) {
        console.log(`   Subcategory: ${item.subcategory}`);
      }
      if (item.gs1_classification) {
        console.log(`   GS1: ${item.gs1_classification.full_path}`);
      }

      console.log(`   Confidence: ${(item._confidence_overall * 100).toFixed(1)}%`);

      if (item._enrichment && item._enrichment.length > 0) {
        console.log(`   Sources: ${item._enrichment.map(e => e.source).join(', ')}`);
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log('\n📈 Summary:');
    console.log(`   Total items: ${result.stats.total}`);
    console.log(`   Enriched: ${result.stats.enriched}`);
    console.log(`   Avg Confidence: ${(result.stats.avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Processing Time: ${result.stats.processingTimeMs}ms`);

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().then(() => {
  console.log('========================================\n');
  process.exit(0);
});
