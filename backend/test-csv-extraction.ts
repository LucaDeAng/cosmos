/**
 * Test script for CSV extraction with real product catalog
 *
 * Tests the CSV parser with a 100-item product catalog downloaded from Datablist
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { parseCSV } from './src/agents/subagents/ingestion/csvParserAgent';

async function testCSVExtraction() {
  console.log('🧪 Testing CSV extraction with real product catalog\n');

  const csvPath = path.join(__dirname, 'test-products-100.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found:', csvPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(csvPath);
  console.log(`✅ Loaded CSV: ${csvPath}`);
  console.log(`   File size: ${(fileBuffer.length / 1024).toFixed(2)} KB\n`);

  const startTime = Date.now();

  const result = await parseCSV({
    fileBuffer,
    fileName: 'test-products-100.csv',
    userContext: 'Extract all products from retail catalog',
    language: 'en',
  });

  const duration = Date.now() - startTime;

  console.log('\n📊 EXTRACTION RESULTS:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`✅ Success: ${result.success}`);
  console.log(`📝 Items extracted: ${result.items.length}`);
  console.log(`📏 Total rows: ${result.rowCount}`);
  console.log(`📊 Columns: ${result.columnCount}`);
  console.log(`⏱️  Processing time: ${duration}ms`);
  console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%\n`);

  console.log('📋 Detected columns:');
  console.log(`   ${result.headers.join(', ')}\n`);

  if (result.extractionNotes && result.extractionNotes.length > 0) {
    console.log('📝 Extraction notes:');
    result.extractionNotes.forEach(note => console.log(`   - ${note}`));
    console.log();
  }

  // Group items by category
  const itemsByCategory: Record<string, any[]> = {};
  for (const item of result.items) {
    const category = (item.rawData as any)?.category || 'Unknown';
    if (!itemsByCategory[category]) {
      itemsByCategory[category] = [];
    }
    itemsByCategory[category].push(item);
  }

  console.log('🔍 Sample items (first 5):');
  for (let i = 0; i < Math.min(5, result.items.length); i++) {
    const item = result.items[i];
    console.log(`\n   Item ${i + 1}:`);
    console.log(`      Name: "${item.name}"`);
    console.log(`      Description: "${(item.description || '').substring(0, 60)}..."`);
    console.log(`      Brand: "${(item.rawData as any)?.brand || 'N/A'}"`);
    console.log(`      Category: "${(item.rawData as any)?.category || 'N/A'}"`);
    console.log(`      Price: ${item.budget ? `$${item.budget}` : 'N/A'}`);
  }

  console.log('\n\n📦 Items by category:');
  const categories = Object.keys(itemsByCategory).sort();
  for (const category of categories) {
    const count = itemsByCategory[category].length;
    console.log(`   ${category}: ${count} items`);
    // Show first 2 examples
    for (let i = 0; i < Math.min(2, count); i++) {
      const item = itemsByCategory[category][i];
      const price = item.budget ? ` ($${item.budget})` : '';
      console.log(`      - ${item.name}${price}`);
    }
    if (count > 2) {
      console.log(`      ... and ${count - 2} more`);
    }
  }

  // Group items by brand
  const itemsByBrand: Record<string, any[]> = {};
  for (const item of result.items) {
    const brand = (item.rawData as any)?.brand || 'Unknown';
    if (!itemsByBrand[brand]) {
      itemsByBrand[brand] = [];
    }
    itemsByBrand[brand].push(item);
  }

  console.log('\n\n🏷️  Items by brand (top 10):');
  const brands = Object.keys(itemsByBrand)
    .sort((a, b) => itemsByBrand[b].length - itemsByBrand[a].length)
    .slice(0, 10);

  for (const brand of brands) {
    const count = itemsByBrand[brand].length;
    console.log(`   ${brand}: ${count} items`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`\n📈 EXTRACTION METRICS:`);
  console.log(`   Expected: 100 items (CSV has 100 rows)`);
  console.log(`   Extracted: ${result.items.length} items`);
  console.log(`   Extraction rate: ${((result.items.length / 100) * 100).toFixed(1)}%`);

  if (result.items.length === 100) {
    console.log(`\n🎉 SUCCESS! Extracted all 100 items from CSV`);
  } else if (result.items.length >= 95) {
    console.log(`\n✅ VERY GOOD! Extracted ${result.items.length}/100 items (${((result.items.length / 100) * 100).toFixed(1)}%)`);
  } else {
    console.log(`\n⚠️  WARNING: Only ${result.items.length}/100 items extracted`);
  }

  // Validate data quality
  let itemsWithPrice = 0;
  let itemsWithBrand = 0;
  let itemsWithCategory = 0;
  let itemsWithDescription = 0;

  for (const item of result.items) {
    if (item.budget) itemsWithPrice++;
    if ((item.rawData as any)?.brand) itemsWithBrand++;
    if ((item.rawData as any)?.category) itemsWithCategory++;
    if (item.description) itemsWithDescription++;
  }

  console.log(`\n📊 DATA QUALITY:`);
  console.log(`   Items with Price: ${itemsWithPrice}/${result.items.length} (${((itemsWithPrice / result.items.length) * 100).toFixed(1)}%)`);
  console.log(`   Items with Brand: ${itemsWithBrand}/${result.items.length} (${((itemsWithBrand / result.items.length) * 100).toFixed(1)}%)`);
  console.log(`   Items with Category: ${itemsWithCategory}/${result.items.length} (${((itemsWithCategory / result.items.length) * 100).toFixed(1)}%)`);
  console.log(`   Items with Description: ${itemsWithDescription}/${result.items.length} (${((itemsWithDescription / result.items.length) * 100).toFixed(1)}%)`);

  console.log('\n✅ Test complete!\n');
}

// Run test
testCSVExtraction().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
