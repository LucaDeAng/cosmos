#!/usr/bin/env npx ts-node

/**
 * 🧪 Ingestion Battery Test Suite
 *
 * Automated test suite for PDF and CSV extraction.
 * Downloads catalogs from public sources and tests extraction quality.
 *
 * Usage:
 *   npm run test:battery              # Run all tests
 *   npm run test:battery -- --quick   # Skip slow tests
 *   npm run test:battery -- --verbose # Verbose output
 */

// Load environment variables from .env
import * as dotenv from 'dotenv';
dotenv.config();

import * as path from 'path';
import { CatalogDownloader, PUBLIC_SOURCES } from './catalogDownloader';
import { ExtractionTester, generateTestCases } from './extractionTester';
import { QualityAnalyzer } from './qualityAnalyzer';
import { ReportGenerator } from './reportGenerator';
import { BatteryConfig, DEFAULT_CONFIG, CatalogSource } from './types';

// ============================================================================
// CLI Arguments
// ============================================================================

interface CLIArgs {
  quick: boolean;
  verbose: boolean;
  downloadOnly: boolean;
  saveBaseline: boolean;
  compareBaseline: boolean;
  filter?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    quick: args.includes('--quick') || args.includes('-q'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    downloadOnly: args.includes('--download-only'),
    saveBaseline: args.includes('--save-baseline'),
    compareBaseline: args.includes('--compare-baseline'),
    filter: args.find((a) => a.startsWith('--filter='))?.split('=')[1],
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  const args = parseArgs();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        🧪 INGESTION BATTERY TEST SUITE                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Build config
  const config: BatteryConfig = {
    ...DEFAULT_CONFIG,
    verbose: args.verbose,
    skipSlowTests: args.quick,
    compareBaseline: args.compareBaseline,
    fixturesDir: path.resolve(__dirname, '../fixtures'),
    reportsDir: path.resolve(__dirname, '../reports'),
    cacheDir: path.resolve(__dirname, '../cache'),
  };

  // Filter sources if specified
  let sources: CatalogSource[] = PUBLIC_SOURCES;
  if (args.filter) {
    const filterLower = args.filter.toLowerCase();
    sources = sources.filter(
      (s) =>
        s.id.toLowerCase().includes(filterLower) ||
        s.category.toLowerCase().includes(filterLower) ||
        s.type.toLowerCase().includes(filterLower)
    );
    console.log(`📌 Filter: "${args.filter}" - ${sources.length} sources matched\n`);
  }

  if (args.quick) {
    // Quick mode: only synthetic catalogs
    sources = sources.filter((s) => s.url.startsWith('local://'));
    console.log('⚡ Quick mode: only synthetic/local catalogs\n');
  }

  try {
    // ========================================================================
    // Step 1: Download Catalogs
    // ========================================================================
    console.log('📥 Step 1: Downloading catalogs...');

    const downloader = new CatalogDownloader(config);
    const downloadResults = await downloader.downloadAll(sources);

    const successfulDownloads = downloadResults.filter((r) => r.success);
    const failedDownloads = downloadResults.filter((r) => !r.success);

    console.log(`   ✓ Downloaded: ${successfulDownloads.length}/${downloadResults.length}`);
    if (failedDownloads.length > 0) {
      console.log(`   ✗ Failed: ${failedDownloads.length}`);
      if (args.verbose) {
        failedDownloads.forEach((r) => {
          console.log(`      - ${r.source.name}: ${r.error}`);
        });
      }
    }

    if (args.downloadOnly) {
      console.log('\n✓ Download complete (--download-only mode)\n');
      process.exit(0);
    }

    if (successfulDownloads.length === 0) {
      console.error('\n❌ No catalogs downloaded successfully. Exiting.\n');
      process.exit(1);
    }

    // ========================================================================
    // Step 2: Generate Test Cases
    // ========================================================================
    console.log('\n📝 Step 2: Generating test cases...');

    const testCases = generateTestCases(successfulDownloads);
    console.log(`   ✓ Generated ${testCases.length} test cases`);

    if (args.verbose) {
      testCases.forEach((tc) => {
        console.log(`      - ${tc.id} (${tc.source.type.toUpperCase()}): expect ${tc.expectedMinItems}+ items`);
      });
    }

    // ========================================================================
    // Step 3: Run Extraction Tests
    // ========================================================================
    console.log('\n🔬 Step 3: Running extraction tests...');

    const tester = new ExtractionTester(config);
    const results = await tester.runAllTests(testCases);

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log(`\n   ✓ Completed: ${passed} passed, ${failed} failed`);

    // ========================================================================
    // Step 4: Analyze Quality
    // ========================================================================
    console.log('\n📊 Step 4: Analyzing quality...');

    const analyzer = new QualityAnalyzer(config);
    const metrics = analyzer.analyzeQuality(results);

    console.log(`   ✓ Extracted ${metrics.itemsExtracted} items total`);
    console.log(`   ✓ Completeness: ${(metrics.completenessRate * 100).toFixed(1)}%`);
    console.log(`   ✓ Accuracy: ${(metrics.accuracyRate * 100).toFixed(1)}%`);
    console.log(`   ✓ Noise rate: ${(metrics.noiseRate * 100).toFixed(1)}%`);

    // ========================================================================
    // Step 5: Generate Report
    // ========================================================================
    console.log('\n📄 Step 5: Generating report...');

    const reportGenerator = new ReportGenerator(config);
    const report = await reportGenerator.generateReport(results, metrics, startTime);

    if (config.saveReport) {
      await reportGenerator.saveReport(report);
    }

    // ========================================================================
    // Step 6: Print Summary
    // ========================================================================
    reportGenerator.printSummary(report);

    // ========================================================================
    // Step 7: Save Baseline (if requested)
    // ========================================================================
    if (args.saveBaseline) {
      analyzer.saveBaseline(metrics);
      console.log('✓ Baseline saved\n');
    }

    // ========================================================================
    // Exit
    // ========================================================================
    const exitCode = failed > 0 ? 1 : 0;
    process.exit(exitCode);

  } catch (error) {
    console.error('\n❌ Battery test suite failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// Run
// ============================================================================

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
