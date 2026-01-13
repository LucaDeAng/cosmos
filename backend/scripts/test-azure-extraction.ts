/**
 * Test script for Azure Document Intelligence integration
 *
 * Usage:
 *   npx ts-node scripts/test-azure-extraction.ts <path-to-pdf>
 *
 * Requires:
 *   AZURE_DOC_INTELLIGENCE_ENABLED=true
 *   AZURE_DOC_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
 *   AZURE_DOC_INTELLIGENCE_KEY=your-api-key
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import {
  extractWithAzure,
  tablesToRawItems,
  isAzureConfigured,
} from '../src/agents/subagents/ingestion/azureDocIntelligenceAgent';

async function main() {
  console.log('='.repeat(60));
  console.log('Azure Document Intelligence - Test Script');
  console.log('='.repeat(60));

  // Check Azure configuration
  console.log('\n📋 Configuration Check:');
  console.log(`   AZURE_DOC_INTELLIGENCE_ENABLED: ${process.env.AZURE_DOC_INTELLIGENCE_ENABLED}`);
  console.log(`   AZURE_DOC_INTELLIGENCE_ENDPOINT: ${process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT ? '✓ Set' : '❌ Missing'}`);
  console.log(`   AZURE_DOC_INTELLIGENCE_KEY: ${process.env.AZURE_DOC_INTELLIGENCE_KEY ? '✓ Set' : '❌ Missing'}`);
  console.log(`   isAzureConfigured(): ${isAzureConfigured()}`);

  if (!isAzureConfigured()) {
    console.log('\n❌ Azure Document Intelligence is not configured.');
    console.log('   Please set the following environment variables in your .env file:');
    console.log('   - AZURE_DOC_INTELLIGENCE_ENDPOINT');
    console.log('   - AZURE_DOC_INTELLIGENCE_KEY');
    console.log('\n   Get free tier (500 pages/month) at: https://portal.azure.com');
    console.log('   Create a "Document Intelligence" resource, then copy endpoint and key.\n');
    process.exit(1);
  }

  // Get PDF path from command line
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.log('\n❌ No PDF file specified.');
    console.log('   Usage: npx ts-node scripts/test-azure-extraction.ts <path-to-pdf>');
    console.log('\n   Example: npx ts-node scripts/test-azure-extraction.ts ./test-data/catalog.pdf\n');
    process.exit(1);
  }

  // Check if file exists
  const fullPath = path.resolve(pdfPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`\n❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  // Read PDF file
  console.log(`\n📄 Reading PDF: ${fullPath}`);
  const fileBuffer = fs.readFileSync(fullPath);
  const fileSizeKB = (fileBuffer.length / 1024).toFixed(1);
  const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`   Size: ${fileSizeKB} KB (${fileSizeMB} MB)`);

  // Check free tier limit
  if (fileBuffer.length > 4 * 1024 * 1024) {
    console.log('\n⚠️  Warning: File exceeds free tier limit (4MB).');
    console.log('   Azure may reject this file or charge for it.\n');
  }

  // Extract with Azure
  console.log('\n🔷 Starting Azure Document Intelligence extraction...\n');
  const startTime = Date.now();

  try {
    const result = await extractWithAzure({
      fileBuffer,
      fileName: path.basename(fullPath),
      extractTables: true,
      extractText: true,
      useFreeTier: true,
    });

    const elapsed = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('Results:');
    console.log('='.repeat(60));

    console.log(`\n   Success: ${result.success ? '✓' : '❌'}`);
    console.log(`   Processing Time: ${elapsed}ms`);
    console.log(`   Pages: ${result.pageCount}`);
    console.log(`   Tables Found: ${result.tables.length}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Used Free Tier: ${result.usedFreeTier ? '✓' : '❌'}`);

    if (result.warnings.length > 0) {
      console.log(`\n   ⚠️  Warnings:`);
      for (const warning of result.warnings) {
        console.log(`      - ${warning}`);
      }
    }

    if (result.tables.length > 0) {
      console.log('\n📋 Tables:');
      for (let i = 0; i < result.tables.length; i++) {
        const table = result.tables[i];
        console.log(`\n   Table ${i + 1}:`);
        console.log(`      Page: ${table.pageNumber}`);
        console.log(`      Dimensions: ${table.rowCount} rows × ${table.columnCount} columns`);
        console.log(`      Confidence: ${(table.confidence * 100).toFixed(1)}%`);
        console.log(`      Headers: ${table.headers.slice(0, 5).join(', ')}${table.headers.length > 5 ? '...' : ''}`);

        // Show first few rows
        if (table.rows.length > 1) {
          console.log(`      Sample data (first 3 rows):`);
          for (let r = 1; r < Math.min(4, table.rows.length); r++) {
            const row = table.rows[r];
            const cellValues = row.cells.map(c => c.content.substring(0, 20)).join(' | ');
            console.log(`         ${r}. ${cellValues}`);
          }
        }
      }

      // Convert to raw items
      console.log('\n🔄 Converting to RawExtractedItems...');
      const rawItems = tablesToRawItems(result.tables);
      console.log(`   Converted: ${rawItems.length} items`);

      if (rawItems.length > 0) {
        console.log('\n   Sample items (first 5):');
        for (let i = 0; i < Math.min(5, rawItems.length); i++) {
          const item = rawItems[i];
          console.log(`      ${i + 1}. ${item.name}`);
          if (item.description) console.log(`         Desc: ${item.description.substring(0, 50)}...`);
          if (item.rawType) console.log(`         Type: ${item.rawType}`);
          if (item.budget) console.log(`         Budget: €${item.budget}`);
          if (item.owner) console.log(`         Owner: ${item.owner}`);
        }
      }
    }

    if (result.text && result.text.length > 0) {
      console.log(`\n📝 Extracted Text: ${result.text.length} characters`);
      console.log(`   First 200 chars: ${result.text.substring(0, 200).replace(/\n/g, ' ')}...`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Test completed successfully!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error during extraction:', error);
    process.exit(1);
  }
}

main().catch(console.error);
