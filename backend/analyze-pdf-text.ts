/**
 * Analyze raw text extraction from Stellantis PDF
 * to understand why some brands are missing
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

async function analyzePDFText() {
  console.log('🔍 Analyzing Stellantis PDF text extraction\n');

  const pdfPath = path.join(__dirname, '..', '12 STELLANTIS - Azioni commerciali acquisto dipendenti DICEMBRE 2025.pdf');
  const fileBuffer = fs.readFileSync(pdfPath);

  const data = await pdfParse(fileBuffer);
  const text = data.text;

  console.log(`📊 PDF Statistics:`);
  console.log(`   Pages: ${data.numpages}`);
  console.log(`   Total chars: ${text.length}`);
  console.log(`   Total lines: ${text.split('\n').length}\n`);

  // Check for brand mentions
  const brands = [
    'ABARTH',
    'ALFA ROMEO',
    'FIAT',
    'JEEP',
    'LANCIA',
    'CITROEN',
    'CITROËN',
    'OPEL',
    'DS',
    'PEUGEOT',
    'LEAPMOTOR',
  ];

  console.log(`🏷️  Brand mentions in extracted text:`);
  for (const brand of brands) {
    const regex = new RegExp(brand, 'gi');
    const matches = text.match(regex);
    const count = matches ? matches.length : 0;
    const status = count > 0 ? '✅' : '❌';
    console.log(`   ${status} ${brand}: ${count} occurrences`);
  }

  // Check for specific models that were missing
  console.log(`\n🚗 Checking for specific missing models:`);
  const missingModels = [
    'Panda',
    'Grande Panda',
    'Tipo',
    '500e',
    '500 Hybrid',
    'Doblò',
    'Compass',
    'Wrangler',
    'Cherokee',
    'Ypsilon',
    'T03',
    'B10',
    'C10',
  ];

  for (const model of missingModels) {
    const regex = new RegExp(model, 'gi');
    const matches = text.match(regex);
    const count = matches ? matches.length : 0;
    const status = count > 0 ? '✅' : '❌';
    console.log(`   ${status} ${model}: ${count} occurrences`);
  }

  // Sample some text to see the structure
  console.log(`\n📄 First 2000 characters of extracted text:`);
  console.log('═'.repeat(80));
  console.log(text.substring(0, 2000));
  console.log('═'.repeat(80));

  console.log(`\n📄 Characters 5000-7000 (middle section):`);
  console.log('═'.repeat(80));
  console.log(text.substring(5000, 7000));
  console.log('═'.repeat(80));

  console.log(`\n📄 Last 2000 characters:`);
  console.log('═'.repeat(80));
  console.log(text.substring(Math.max(0, text.length - 2000)));
  console.log('═'.repeat(80));

  // Look for table structures
  console.log(`\n📊 Analyzing table structure:`);
  const lines = text.split('\n');
  let tableRowCount = 0;
  const sampleRows: string[] = [];

  for (const line of lines) {
    const tokens = line.trim().split(/\s{2,}|\t|\|/);
    if (tokens.length >= 3 && tokens.filter(t => t.length > 0).length >= 3) {
      tableRowCount++;
      if (sampleRows.length < 10) {
        sampleRows.push(line);
      }
    }
  }

  console.log(`   Total table-like rows: ${tableRowCount}`);
  console.log(`   Table row ratio: ${((tableRowCount / lines.length) * 100).toFixed(1)}%`);
  console.log(`\n   Sample table rows:`);
  sampleRows.forEach((row, i) => {
    console.log(`   ${i + 1}. ${row.substring(0, 100)}${row.length > 100 ? '...' : ''}`);
  });

  // Save full text to file for manual inspection
  const outputPath = path.join(__dirname, 'stellantis-extracted-text.txt');
  fs.writeFileSync(outputPath, text);
  console.log(`\n💾 Full extracted text saved to: ${outputPath}`);
}

analyzePDFText().catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
