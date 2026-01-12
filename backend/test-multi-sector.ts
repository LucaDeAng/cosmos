/**
 * Quick test script for multi-sector sources
 * Run with: npx tsx test-multi-sector.ts
 */

import { SectorDetector } from './src/knowledge/sectors/sectorDetector';
import { OpenFoodFactsSource } from './src/knowledge/sources/openFoodFactsSource';
import { OpenBeautyFactsSource } from './src/knowledge/sources/openBeautyFactsSource';

async function testSectorDetector() {
  console.log('\n=== Testing SectorDetector ===\n');

  const detector = new SectorDetector({ enableSemanticFallback: false });

  const testItems = [
    { name: 'Microsoft Office 365', description: 'Cloud productivity SaaS' },
    { name: 'Nutella', description: 'Hazelnut spread food product' },
    { name: "L'Oreal Shampoo", description: 'Hair care beauty product' },
    { name: 'Aspirin 500mg', description: 'Pharmaceutical pain relief drug' },
    { name: 'Tesla Model 3', description: 'Electric vehicle car' },
    { name: 'SAP ERP', description: 'Enterprise software platform' },
    { name: 'Coca-Cola', description: 'Carbonated beverage drink' },
  ];

  for (const item of testItems) {
    const result = await detector.detect(item);
    console.log(`"${item.name}"`);
    console.log(`  Sector: ${result.sector} (${(result.confidence * 100).toFixed(1)}%)`);
    console.log(`  Method: ${result.method}`);
    console.log(`  Reasoning: ${result.reasoning[0]}`);
    console.log('');
  }
}

async function testOpenFoodFacts() {
  console.log('\n=== Testing Open Food Facts ===\n');

  const source = new OpenFoodFactsSource();
  await source.initialize();

  console.log(`Source enabled: ${source.isEnabled()}`);
  console.log(`Supported sectors: ${source.supportedSectors.join(', ')}`);

  // Test barcode lookup (Nutella)
  console.log('\nLooking up Nutella by barcode (3017620422003)...');
  const nutella = await source.getByBarcode('3017620422003', true);
  if (nutella) {
    console.log(`  Found: ${nutella.product_name}`);
    console.log(`  Brand: ${nutella.brands}`);
    console.log(`  Categories: ${nutella.categories_tags?.slice(-2).join(' > ')}`);
    console.log(`  Nutriscore: ${nutella.nutriscore_grade?.toUpperCase() || 'N/A'}`);
  } else {
    console.log('  Not found or API unavailable');
  }

  // Test search
  console.log('\nSearching for "pasta barilla"...');
  const products = await source.searchByName('pasta barilla', undefined, 3, true);
  console.log(`  Found ${products.length} products`);
  for (const p of products.slice(0, 2)) {
    console.log(`  - ${p.product_name} (${p.brands || 'Unknown brand'})`);
  }

  // Test enrichment
  console.log('\nEnriching item "Ferrero Nutella"...');
  const enrichResult = await source.enrich(
    { name: 'Nutella', type: 'product', vendor: 'Ferrero' },
    { skipCache: true }
  );
  console.log(`  Source: ${enrichResult.source}`);
  console.log(`  Confidence: ${(enrichResult.confidence * 100).toFixed(1)}%`);
  console.log(`  Fields enriched: ${enrichResult.fields_enriched.join(', ') || 'none'}`);
  console.log(`  Reasoning: ${enrichResult.reasoning[0]}`);
}

async function testOpenBeautyFacts() {
  console.log('\n=== Testing Open Beauty Facts ===\n');

  const source = new OpenBeautyFactsSource();
  await source.initialize();

  console.log(`Source enabled: ${source.isEnabled()}`);
  console.log(`Supported sectors: ${source.supportedSectors.join(', ')}`);

  // Test search
  console.log('\nSearching for "shampoo"...');
  const products = await source.searchByName('shampoo', undefined, 3, true);
  console.log(`  Found ${products.length} products`);
  for (const p of products.slice(0, 2)) {
    console.log(`  - ${p.product_name} (${p.brands || 'Unknown brand'})`);
  }

  // Test enrichment
  console.log('\nEnriching item "Nivea Cream"...');
  const enrichResult = await source.enrich(
    { name: 'Nivea Cream', type: 'product', vendor: 'Nivea' },
    { skipCache: true }
  );
  console.log(`  Source: ${enrichResult.source}`);
  console.log(`  Confidence: ${(enrichResult.confidence * 100).toFixed(1)}%`);
  console.log(`  Fields enriched: ${enrichResult.fields_enriched.join(', ') || 'none'}`);
  console.log(`  Reasoning: ${enrichResult.reasoning[0]}`);
}

async function main() {
  console.log('========================================');
  console.log('  THEMIS Multi-Sector Sources Test');
  console.log('========================================');

  try {
    await testSectorDetector();
    await testOpenFoodFacts();
    await testOpenBeautyFacts();

    console.log('\n========================================');
    console.log('  All tests completed successfully!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  }
}

main();
