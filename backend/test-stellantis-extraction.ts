/**
 * Test script for improved PDF extraction with Stellantis document
 *
 * Tests the new table-aware extraction to see if it extracts all 100+ items
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { parsePDF } from './src/agents/subagents/ingestion/pdfParserAgent';

async function testStellantisExtraction() {
  console.log('🧪 Testing improved PDF extraction with Stellantis document\n');

  const pdfPath = path.join(__dirname, '..', '12 STELLANTIS - Azioni commerciali acquisto dipendenti DICEMBRE 2025.pdf');

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF file not found:', pdfPath);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(pdfPath);
  console.log(`✅ Loaded PDF: ${pdfPath}`);
  console.log(`   File size: ${(fileBuffer.length / 1024).toFixed(2)} KB\n`);

  const startTime = Date.now();

  const result = await parsePDF({
    fileBuffer,
    fileName: '12 STELLANTIS - Azioni commerciali acquisto dipendenti DICEMBRE 2025.pdf',
    userContext: 'Estrai TUTTI i modelli di automobili e programmi dal listino scontistiche Stellantis dipendenti',
    language: 'it',
  });

  const duration = Date.now() - startTime;

  console.log('\n📊 EXTRACTION RESULTS:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`✅ Success: ${result.success}`);
  console.log(`📄 Pages: ${result.pageCount}`);
  console.log(`📝 Items extracted: ${result.items.length}`);
  console.log(`⏱️  Processing time: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
  console.log(`🔢 Chunks processed: ${result.chunksProcessed || 1}`);
  console.log(`📏 Total chars: ${result.totalChars || 0}`);
  console.log(`🎯 Confidence: ${(result.confidence * 100).toFixed(0)}%\n`);

  if (result.extractionNotes && result.extractionNotes.length > 0) {
    console.log('📝 Extraction notes:');
    result.extractionNotes.forEach(note => console.log(`   - ${note}`));
    console.log();
  }

  // Group items by brand (check multiple fields)
  const itemsByBrand: Record<string, any[]> = {};
  for (const item of result.items) {
    // Try to extract brand from rawData, rawType, or name
    let brand = (item.rawData as any)?.brand || 'Unknown';

    // If Unknown, try to infer from item name or description
    if (brand === 'Unknown') {
      const text = `${item.name} ${item.description || ''} ${item.rawType || ''}`.toUpperCase();
      if (text.includes('ABARTH')) brand = 'ABARTH';
      else if (text.includes('ALFA')) brand = 'ALFA ROMEO';
      else if (text.includes('FIAT')) brand = 'FIAT';
      else if (text.includes('JEEP')) brand = 'JEEP';
      else if (text.includes('LANCIA')) brand = 'LANCIA';
      else if (text.includes('CITROEN') || text.includes('CITROËN')) brand = 'CITROEN';
      else if (text.includes('OPEL')) brand = 'OPEL';
      else if (text.includes('DS ') || text.includes('DS3') || text.includes('DS4') || text.includes('DS7')) brand = 'DS';
      else if (text.includes('PEUGEOT')) brand = 'PEUGEOT';
      else if (text.includes('LEAPMOTOR') || text.includes('T03') || text.includes('B10') || text.includes('C10')) brand = 'LEAPMOTOR';
    }

    if (!itemsByBrand[brand]) {
      itemsByBrand[brand] = [];
    }
    itemsByBrand[brand].push(item);
  }

  console.log('\n🔍 Sample items for debugging:');
  for (let i = 0; i < Math.min(5, result.items.length); i++) {
    const item = result.items[i];
    console.log(`\n   Item ${i + 1}:`);
    console.log(`      name: "${item.name}"`);
    console.log(`      description: "${(item.description || '').substring(0, 100)}..."`);
    console.log(`      rawType: "${item.rawType || 'N/A'}"`);
    console.log(`      rawData:`, JSON.stringify(item.rawData || {}).substring(0, 150));
  }

  console.log('🏷️  Items by brand:');
  const brands = Object.keys(itemsByBrand).sort();
  for (const brand of brands) {
    const count = itemsByBrand[brand].length;
    console.log(`   ${brand}: ${count} items`);
    // Show first 3 examples
    for (let i = 0; i < Math.min(3, count); i++) {
      console.log(`      - ${itemsByBrand[brand][i].name}`);
    }
    if (count > 3) {
      console.log(`      ... and ${count - 3} more`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`\n📈 IMPROVEMENT METRICS:`);
  console.log(`   Previous extraction: 12 items (10-12%)`);
  console.log(`   Current extraction: ${result.items.length} items`);

  if (result.items.length > 12) {
    const improvement = ((result.items.length - 12) / 12 * 100).toFixed(0);
    console.log(`   ✅ Improvement: +${improvement}% more items extracted!`);
  } else {
    console.log(`   ⚠️  No improvement detected`);
  }

  // Expected: ~100+ items (Abarth, Alfa, Fiat, Jeep, Lancia, Citroën, Opel, DS, Peugeot, Leapmotor)
  const expectedMin = 80;
  if (result.items.length >= expectedMin) {
    console.log(`\n🎉 SUCCESS! Extracted ${result.items.length}/${expectedMin}+ expected items`);
  } else {
    console.log(`\n⚠️  WARNING: Only ${result.items.length}/${expectedMin}+ expected items extracted`);
  }

  console.log('\n✅ Test complete!\n');
}

// Run test
testStellantisExtraction().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
