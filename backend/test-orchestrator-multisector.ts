/**
 * Test Multi-Sector Integration in ProductKnowledgeOrchestrator
 * Run with: npx tsx test-orchestrator-multisector.ts
 */

import 'dotenv/config';
import { getProductKnowledgeOrchestrator, type ExtractedItem } from './src/knowledge/ProductKnowledgeOrchestrator';

async function testOrchestrator() {
  console.log('========================================');
  console.log('  Multi-Sector Orchestrator Test');
  console.log('========================================\n');

  const orchestrator = getProductKnowledgeOrchestrator();

  // Initialize
  console.log('Initializing orchestrator...\n');
  await orchestrator.initialize();

  // Get stats
  const stats = orchestrator.getStats();
  console.log('📊 Orchestrator Stats:');
  console.log(`   Catalog: ${stats.catalogStats.total} items`);
  console.log(`   GS1: ${stats.gs1Stats.totalCategories} categories`);
  console.log(`   Icecat: ${stats.icecatEnabled ? 'enabled' : 'disabled'}`);
  console.log(`   Multi-sector sources: ${stats.multiSectorStats.totalSources} total, ${stats.multiSectorStats.enabledSources} enabled`);
  console.log('   Sources by sector:', stats.multiSectorStats.sourcesBySector);
  console.log('');

  // Test items from different sectors
  const testItems: ExtractedItem[] = [
    {
      name: 'Nutella Hazelnut Spread 750g',
      description: 'Chocolate hazelnut cream spread, delicious on bread',
      type: 'product',
      vendor: 'Ferrero',
      category: 'Food'
    },
    {
      name: 'Aspirin 500mg Tablets',
      description: 'Pain relief medication, acetylsalicylic acid',
      type: 'product',
      vendor: 'Bayer',
      category: 'Pharmaceutical'
    },
    {
      name: 'CNC Milling Machine XYZ-500',
      description: 'Precision 5-axis machining center for metal parts',
      type: 'product',
      vendor: 'Haas',
      category: 'Industrial Machinery'
    },
    {
      name: 'L\'Oreal Shampoo Expert',
      description: 'Professional hair care shampoo for damaged hair',
      type: 'product',
      vendor: 'L\'Oreal',
      category: 'Personal Care'
    },
    {
      name: 'Microsoft Office 365 Business',
      description: 'Cloud productivity suite with Word, Excel, PowerPoint',
      type: 'product',
      vendor: 'Microsoft',
      category: 'Software'
    }
  ];

  console.log('Testing enrichment for different sectors...\n');

  for (const item of testItems) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📦 Testing: ${item.name}`);
    console.log(`   Vendor: ${item.vendor}`);
    console.log(`${'='.repeat(50)}`);

    try {
      const result = await orchestrator.enrichItem(item, {
        minConfidenceThreshold: 0.3
      });

      // Show sector detection
      const sector = (result as any)._sector;
      if (sector) {
        console.log(`\n🎯 Sector Detection:`);
        console.log(`   Sector: ${sector.sector}`);
        console.log(`   Confidence: ${(sector.confidence * 100).toFixed(1)}%`);
        console.log(`   Method: ${sector.method}`);
        console.log(`   Reasoning: ${sector.reasoning.join('; ')}`);
      }

      // Show enrichment provenance
      const provenance = (result as any)._enrichment_provenance;
      if (provenance) {
        console.log(`\n📊 Enrichment Provenance:`);
        console.log(`   Sources Queried: ${provenance.sourcesQueried.length > 0 ? provenance.sourcesQueried.join(', ') : 'none'}`);
        console.log(`   Sources Matched: ${provenance.sourcesMatched.length > 0 ? provenance.sourcesMatched.join(', ') : 'none'}`);
        console.log(`   Processing Time: ${provenance.processingTimeMs}ms`);
        console.log(`   Fields Enriched: ${Object.keys(provenance.fieldSources).length}`);
      }

      // Show enrichment results
      console.log(`\n✅ Enrichment Results:`);
      console.log(`   Overall Confidence: ${(result._confidence_overall * 100).toFixed(1)}%`);
      console.log(`   Sources Used: ${result._enrichment.length}`);

      for (const e of result._enrichment) {
        console.log(`   - ${e.source}: ${e.fields_enriched.length} fields (${(e.confidence * 100).toFixed(0)}%)`);
      }

      // Show key enriched fields
      const enrichedKeys = ['category', 'description', 'detected_sector', 'sector_confidence'];
      console.log(`\n📝 Key Fields:`);
      for (const key of enrichedKeys) {
        if (result[key] !== undefined) {
          const value = result[key];
          const displayValue = typeof value === 'string' && value.length > 50
            ? value.substring(0, 50) + '...'
            : value;
          console.log(`   ${key}: ${displayValue}`);
        }
      }

      // Show metadata persistence result
      const metadataId = (result as any)._enrichment_metadata_id;
      if (metadataId) {
        console.log(`\n💾 Metadata Persisted: ${metadataId}`);
      } else {
        console.log(`\n⚠️  Metadata NOT persisted (no tenantId provided)`);
      }

    } catch (error) {
      console.error(`\n❌ Error enriching ${item.name}:`, error);
    }
  }

  console.log('\n\n========================================');
  console.log('  Test Complete!');
  console.log('========================================\n');
}

testOrchestrator().catch(console.error);
