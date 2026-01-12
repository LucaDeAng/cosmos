#!/usr/bin/env npx ts-node
/**
 * 🚗 Test Estrazione PDF Stellantis - FAST MODE
 * Confronta tempi: Normal vs Fast Mode (gpt-4o-mini)
 */

import * as dotenv from 'dotenv';
dotenv.config();

// Enable FAST MODE via environment variable
process.env.PDF_FAST_MODE = 'true';

import * as fs from 'fs';
import * as path from 'path';
import { parsePDF, PDFParserInput, PDFParserOutput } from './src/agents/subagents/ingestion/pdfParserAgent';

const STELLANTIS_PDF = path.resolve(__dirname, '../12 STELLANTIS - Azioni commerciali acquisto dipendenti DICEMBRE 2025.pdf');

async function testFastMode(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🚗 TEST STELLANTIS - ⚡ FAST MODE (gpt-4o-mini)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Check file exists
  if (!fs.existsSync(STELLANTIS_PDF)) {
    console.error(`❌ File non trovato: ${STELLANTIS_PDF}`);
    process.exit(1);
  }

  const fileStats = fs.statSync(STELLANTIS_PDF);
  console.log(`📄 File: ${path.basename(STELLANTIS_PDF)}`);
  console.log(`📦 Dimensione: ${(fileStats.size / 1024).toFixed(1)} KB`);
  console.log(`⚡ FAST MODE: ATTIVO (gpt-4o-mini per tutti i chunks)`);
  console.log('');

  const fileBuffer = fs.readFileSync(STELLANTIS_PDF);
  const totalStart = Date.now();

  console.log('⏱️  ESTRAZIONE IN CORSO...');
  console.log('─────────────────────────────────────────────────────────────');

  const input: PDFParserInput = {
    fileBuffer,
    fileName: path.basename(STELLANTIS_PDF),
    language: 'it',
    userContext: 'Listino prezzi auto Stellantis per dipendenti. Estrai tutti i modelli con prezzi e sconti.',
    fastMode: true,
  };

  let result: PDFParserOutput;
  try {
    result = await parsePDF(input);
  } catch (error) {
    console.error(`❌ Errore parsing: ${error}`);
    process.exit(1);
  }

  const totalDuration = Date.now() - totalStart;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      📊 RISULTATI FAST MODE                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('⏱️  TEMPI:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   Tempo totale:             ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`   Tempo atteso (normal):    ~82s`);
  console.log(`   Speedup:                  ${(82000 / totalDuration).toFixed(1)}x`);
  console.log('');

  console.log('📈 METRICHE:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   Items estratti:           ${result.items.length}`);
  console.log(`   Confidence:               ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Chunks processati:        ${result.chunksProcessed || 1}`);
  console.log('');

  // Throughput
  const throughput = result.items.length / (totalDuration / 1000);
  console.log('🚀 PERFORMANCE:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   Throughput:               ${throughput.toFixed(2)} items/sec`);
  console.log(`   Tempo per item:           ${(totalDuration / result.items.length).toFixed(0)}ms`);
  console.log('');

  // Sample items
  console.log('📋 PRIMI 10 ITEMS ESTRATTI:');
  console.log('─────────────────────────────────────────────────────────────');
  const sampleItems = result.items.slice(0, 10);
  for (let i = 0; i < sampleItems.length; i++) {
    const item = sampleItems[i];
    const name = (item.name || 'N/A').substring(0, 50);
    console.log(`   ${(i + 1).toString().padStart(2)}. ${name}`);
  }
  if (result.items.length > 10) {
    console.log(`   ... e altri ${result.items.length - 10} items`);
  }
  console.log('');

  // Final summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  ⚡ FAST MODE: ${result.items.length} items in ${(totalDuration / 1000).toFixed(2)}s (${(82000 / totalDuration).toFixed(1)}x faster)`.padEnd(61) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

// Run
testFastMode().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
