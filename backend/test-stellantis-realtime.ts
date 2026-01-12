#!/usr/bin/env npx ts-node
/**
 * 🚗 Test Estrazione PDF Stellantis - Tempo Reale
 * Misura precisione in secondi dell'estrazione LLM
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { parsePDF, PDFParserInput, PDFParserOutput } from './src/agents/subagents/ingestion/pdfParserAgent';

const STELLANTIS_PDF = path.resolve(__dirname, '../12 STELLANTIS - Azioni commerciali acquisto dipendenti DICEMBRE 2025.pdf');

interface TimingResult {
  phase: string;
  startTime: number;
  endTime: number;
  duration: number;
}

async function testStellantisExtraction(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🚗 TEST ESTRAZIONE PDF STELLANTIS - TEMPO REALE             ║');
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
  console.log('');

  // Read file
  const fileBuffer = fs.readFileSync(STELLANTIS_PDF);

  // Timing
  const timings: TimingResult[] = [];
  const totalStart = Date.now();

  console.log('⏱️  FASI DI ESTRAZIONE:');
  console.log('─────────────────────────────────────────────────────────────');

  // Phase 1: PDF Parsing
  const parseStart = Date.now();
  console.log(`\n[${formatTime(parseStart - totalStart)}] 📄 Parsing PDF...`);

  const input: PDFParserInput = {
    fileBuffer,
    fileName: path.basename(STELLANTIS_PDF),
    language: 'it',
    userContext: 'Listino prezzi auto Stellantis per dipendenti. Estrai tutti i modelli con prezzi e sconti.',
  };

  let result: PDFParserOutput;
  try {
    result = await parsePDF(input);
  } catch (error) {
    console.error(`❌ Errore parsing: ${error}`);
    process.exit(1);
  }

  const parseEnd = Date.now();
  timings.push({
    phase: 'PDF Parsing + LLM Extraction',
    startTime: parseStart,
    endTime: parseEnd,
    duration: parseEnd - parseStart,
  });

  console.log(`[${formatTime(parseEnd - totalStart)}] ✅ Parsing completato in ${((parseEnd - parseStart) / 1000).toFixed(2)}s`);

  // Results
  const totalEnd = Date.now();
  const totalDuration = totalEnd - totalStart;

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      📊 RISULTATI                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Timing summary
  console.log('⏱️  TEMPI:');
  console.log('─────────────────────────────────────────────────────────────');
  for (const timing of timings) {
    console.log(`   ${timing.phase.padEnd(35)} ${(timing.duration / 1000).toFixed(2)}s`);
  }
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   ${'TOTALE'.padEnd(35)} ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('');

  // Extraction metrics
  console.log('📈 METRICHE ESTRAZIONE:');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`   Items estratti:           ${result.items.length}`);
  console.log(`   Confidence:               ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`   Chunks processati:        ${result.chunksProcessed || 1}`);
  console.log(`   Processing time (agent):  ${result.processingTime}ms`);
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
    const price = item.budget ? `€${item.budget.toLocaleString()}` : 'N/A';
    console.log(`   ${(i + 1).toString().padStart(2)}. ${name.padEnd(50)} ${price}`);
  }

  if (result.items.length > 10) {
    console.log(`   ... e altri ${result.items.length - 10} items`);
  }
  console.log('');

  // Categories breakdown
  const categories = new Map<string, number>();
  for (const item of result.items) {
    const cat = (item.rawData as any)?.category || item.rawType || 'Altro';
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  if (categories.size > 1) {
    console.log('📊 BREAKDOWN PER CATEGORIA:');
    console.log('─────────────────────────────────────────────────────────────');
    for (const [cat, count] of Array.from(categories.entries()).sort((a, b) => b[1] - a[1])) {
      const bar = '█'.repeat(Math.ceil(count / result.items.length * 30));
      console.log(`   ${cat.padEnd(20)} ${count.toString().padStart(3)} ${bar}`);
    }
    console.log('');
  }

  // Extraction notes
  if (result.extractionNotes && result.extractionNotes.length > 0) {
    console.log('📝 NOTE ESTRAZIONE:');
    console.log('─────────────────────────────────────────────────────────────');
    for (const note of result.extractionNotes) {
      console.log(`   • ${note}`);
    }
    console.log('');
  }

  // Final summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  ✅ COMPLETATO: ${result.items.length} items in ${(totalDuration / 1000).toFixed(2)} secondi`.padEnd(61) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  return `${seconds.toString().padStart(3)}s ${millis.toString().padStart(3)}ms`;
}

// Run
testStellantisExtraction().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
