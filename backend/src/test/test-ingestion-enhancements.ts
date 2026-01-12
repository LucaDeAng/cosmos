/**
 * Test Script for AI Ingestion Enhancements
 *
 * Tests:
 * 1. Multi-level confidence scoring
 * 2. Strategic profile-driven extraction
 * 3. Field-level confidence tracking
 * 4. Strategic alignment calculation
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseExcel } from '../agents/subagents/ingestion/excelParserAgent';
import { normalizeItems } from '../agents/subagents/ingestion/normalizerAgent';

async function testIngestionEnhancements() {
  console.log('\n🧪 Testing AI Ingestion Enhancements\n');
  console.log('=' .repeat(80));

  try {
    // Load test CSV file
    const testFilePath = path.join(__dirname, '../../tmp-test-files/test-portfolio-enhanced.csv');

    if (!fs.existsSync(testFilePath)) {
      console.error('❌ Test file not found:', testFilePath);
      return;
    }

    const fileBuffer = fs.readFileSync(testFilePath);
    console.log('✅ Test file loaded:', path.basename(testFilePath));
    console.log(`   Size: ${fileBuffer.length} bytes\n`);

    // Step 1: Parse Excel/CSV
    console.log('📄 Step 1: Parsing CSV file...');
    const parseResult = await parseExcel({
      fileBuffer,
      fileName: 'test-portfolio-enhanced.csv',
      userContext: 'Test portfolio for tech company focused on digital transformation',
      language: 'it',
    });

    console.log(`   ✅ Extracted ${parseResult.items.length} items`);
    console.log(`   Confidence: ${(parseResult.confidence * 100).toFixed(0)}%\n`);

    // Step 2: Normalize items (with mock strategic profile)
    console.log('🧠 Step 2: Normalizing items with strategic context...');

    // Mock tenant ID (use system fallback)
    const testTenantId = '00000000-0000-0000-0000-000000000000';

    const normalizeResult = await normalizeItems({
      items: parseResult.items,
      tenantId: testTenantId,
      userContext: 'Tech company focused on cloud transformation and digital innovation',
      language: 'it',
    });

    console.log(`   ✅ Normalized ${normalizeResult.items.length} items`);
    console.log(`   Average confidence: ${(normalizeResult.stats.avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Products: ${normalizeResult.stats.byType.products}`);
    console.log(`   Services: ${normalizeResult.stats.byType.services}\n`);

    // Step 3: Analyze results
    console.log('=' .repeat(80));
    console.log('📊 RESULTS ANALYSIS\n');

    normalizeResult.items.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.name}`);
      console.log('   ' + '-'.repeat(70));

      // Basic info
      console.log(`   Type: ${item.type.toUpperCase()}`);
      console.log(`   Status: ${item.status}`);
      if (item.priority) console.log(`   Priority: ${item.priority}`);
      if (item.budget) console.log(`   Budget: €${item.budget.toLocaleString()}`);
      if (item.owner) console.log(`   Owner: ${item.owner}`);
      if (item.category) console.log(`   Category: ${item.category}`);

      // Strategic metrics
      console.log(`\n   📈 Strategic Metrics:`);
      if (item.strategicAlignment) {
        console.log(`      Strategic Alignment: ${item.strategicAlignment}/10`);
      }
      if (item.businessValue) {
        console.log(`      Business Value: ${item.businessValue}/10`);
      }
      if (item.strategic_importance) {
        console.log(`      Importance: ${item.strategic_importance}`);
      }

      // Confidence breakdown
      if (item.confidence_breakdown) {
        const cb = item.confidence_breakdown;
        console.log(`\n   🎯 Confidence Breakdown:`);
        console.log(`      Overall: ${(cb.overall * 100).toFixed(1)}%`);
        console.log(`      Type: ${(cb.type * 100).toFixed(1)}%`);

        console.log(`\n      Field Confidence:`);
        Object.entries(cb.fields).forEach(([field, conf]) => {
          const emoji = conf >= 0.8 ? '✅' : conf >= 0.6 ? '⚠️' : '❌';
          console.log(`         ${emoji} ${field}: ${(conf * 100).toFixed(0)}%`);
        });

        console.log(`\n      Quality Indicators:`);
        console.log(`         Source Clarity: ${(cb.quality_indicators.source_clarity * 100).toFixed(0)}%`);
        console.log(`         RAG Match: ${(cb.quality_indicators.rag_match * 100).toFixed(0)}%`);
        console.log(`         Schema Fit: ${(cb.quality_indicators.schema_fit * 100).toFixed(0)}%`);

        if (cb.reasoning.length > 0) {
          console.log(`\n      AI Reasoning:`);
          cb.reasoning.forEach(reason => {
            console.log(`         • ${reason}`);
          });
        }
      }

      // Normalization notes (strategic context)
      if (item.normalizationNotes && item.normalizationNotes.length > 0) {
        console.log(`\n   💡 Strategic Insights:`);
        item.normalizationNotes.forEach(note => {
          console.log(`      • ${note}`);
        });
      }

      // Extraction metadata
      if (item.extraction_metadata) {
        console.log(`\n   📍 Source: ${item.extraction_metadata.source_type.replace(/_/g, ' ')}`);
      }
    });

    // Step 4: Summary statistics
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY STATISTICS\n');

    const confidenceDistribution = {
      high: normalizeResult.items.filter(i => i.confidence >= 0.9).length,
      good: normalizeResult.items.filter(i => i.confidence >= 0.7 && i.confidence < 0.9).length,
      medium: normalizeResult.items.filter(i => i.confidence >= 0.5 && i.confidence < 0.7).length,
      low: normalizeResult.items.filter(i => i.confidence < 0.5).length,
    };

    console.log('Confidence Distribution:');
    console.log(`   High (≥90%):     ${confidenceDistribution.high} items - AUTO-ACCEPT candidates`);
    console.log(`   Good (70-89%):   ${confidenceDistribution.good} items - QUICK REVIEW`);
    console.log(`   Medium (50-69%): ${confidenceDistribution.medium} items - MANUAL REVIEW`);
    console.log(`   Low (<50%):      ${confidenceDistribution.low} items - FULL EDIT needed`);

    const itemsWithStrategicAlignment = normalizeResult.items.filter(i => i.strategicAlignment).length;
    const itemsWithBusinessValue = normalizeResult.items.filter(i => i.businessValue).length;

    console.log(`\nStrategic Enrichment:`);
    console.log(`   Items with Strategic Alignment: ${itemsWithStrategicAlignment}/${normalizeResult.items.length}`);
    console.log(`   Items with Business Value: ${itemsWithBusinessValue}/${normalizeResult.items.length}`);

    if (itemsWithStrategicAlignment > 0) {
      const avgAlignment = normalizeResult.items
        .filter(i => i.strategicAlignment)
        .reduce((sum, i) => sum + (i.strategicAlignment || 0), 0) / itemsWithStrategicAlignment;
      console.log(`   Average Strategic Alignment: ${avgAlignment.toFixed(1)}/10`);
    }

    console.log(`\nCategory Classification:`);
    const categories = new Set(normalizeResult.items.filter(i => i.category).map(i => i.category));
    console.log(`   Unique categories identified: ${categories.size}`);
    categories.forEach(cat => {
      const count = normalizeResult.items.filter(i => i.category === cat).length;
      console.log(`      • ${cat}: ${count} items`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test completed successfully!\n');

    // Return results for potential API response
    return {
      success: true,
      itemsProcessed: normalizeResult.items.length,
      confidenceDistribution,
      strategicEnrichment: {
        itemsWithAlignment: itemsWithStrategicAlignment,
        itemsWithBusinessValue: itemsWithBusinessValue,
      },
      items: normalizeResult.items,
    };

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Run test if executed directly
if (require.main === module) {
  testIngestionEnhancements()
    .then(() => {
      console.log('Test execution finished.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testIngestionEnhancements };
