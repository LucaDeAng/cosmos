/**
 * Test Enrichment Metadata Persistence
 * Run with: npx tsx test-metadata-persistence.ts
 */

import 'dotenv/config';
import { getProductKnowledgeOrchestrator, type ExtractedItem } from './src/knowledge/ProductKnowledgeOrchestrator';

async function testMetadataPersistence() {
  console.log('========================================');
  console.log('  Enrichment Metadata Persistence Test');
  console.log('========================================\n');

  const orchestrator = getProductKnowledgeOrchestrator();

  // Initialize
  console.log('Initializing orchestrator...\n');
  await orchestrator.initialize();

  // Use a test tenant ID (must exist in companies table or use a valid UUID)
  const testTenantId = process.env.TEST_TENANT_ID || 'test-tenant-' + Date.now();
  console.log(`Using tenant ID: ${testTenantId}\n`);

  // Test items
  const testItems: ExtractedItem[] = [
    {
      name: 'Microsoft Office 365',
      description: 'Cloud productivity suite',
      type: 'product',
      vendor: 'Microsoft',
      category: 'Software'
    },
    {
      name: 'Nutella 400g',
      description: 'Hazelnut chocolate spread',
      type: 'product',
      vendor: 'Ferrero',
      category: 'Food'
    }
  ];

  console.log('Testing enrichment with metadata persistence...\n');

  for (const item of testItems) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📦 Testing: ${item.name}`);
    console.log(`${'='.repeat(50)}`);

    try {
      const result = await orchestrator.enrichItem(item, {
        tenantId: testTenantId,
        minConfidenceThreshold: 0.3
      });

      // Show sector detection
      const sector = (result as any)._sector;
      console.log(`\n🎯 Sector: ${sector?.sector || 'unknown'} (${((sector?.confidence || 0) * 100).toFixed(1)}%)`);

      // Show provenance
      const provenance = (result as any)._enrichment_provenance;
      console.log(`\n📊 Provenance:`);
      console.log(`   Session: ${provenance?.sessionId || 'N/A'}`);
      console.log(`   Sources Queried: ${provenance?.sourcesQueried?.join(', ') || 'none'}`);
      console.log(`   Sources Matched: ${provenance?.sourcesMatched?.join(', ') || 'none'}`);
      console.log(`   Processing Time: ${provenance?.processingTimeMs || 0}ms`);

      // Show metadata persistence
      const metadataId = (result as any)._enrichment_metadata_id;
      if (metadataId) {
        console.log(`\n✅ Metadata Persisted Successfully!`);
        console.log(`   ID: ${metadataId}`);

        // Try to retrieve it
        const retrieved = await orchestrator.getEnrichmentMetadata(
          testTenantId,
          item.name,
          item.type
        );

        if (retrieved) {
          console.log(`   Retrieved: Yes`);
          console.log(`   Detected Sector: ${retrieved.detected_sector}`);
          console.log(`   Sector Confidence: ${(retrieved.sector_confidence * 100).toFixed(1)}%`);
        }
      } else {
        console.log(`\n⚠️  Metadata NOT persisted`);
        console.log(`   (Check database connection and tenant ID validity)`);
      }

    } catch (error) {
      console.error(`\n❌ Error:`, error);
    }
  }

  // Get sector stats
  console.log('\n\n========================================');
  console.log('  Sector Statistics');
  console.log('========================================\n');

  try {
    const stats = await orchestrator.getEnrichmentStatsBySector(testTenantId);
    if (stats.length > 0) {
      console.log('Stats by sector:');
      for (const stat of stats) {
        console.log(`  ${stat.detected_sector}: ${stat.total_items} items, avg confidence ${(stat.avg_sector_confidence * 100).toFixed(1)}%`);
      }
    } else {
      console.log('No sector stats available yet.');
    }
  } catch (error) {
    console.log('Could not retrieve sector stats:', error);
  }

  console.log('\n\n========================================');
  console.log('  Test Complete!');
  console.log('========================================\n');
}

testMetadataPersistence().catch(console.error);
