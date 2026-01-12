/**
 * 🧪 Quality Analyzer
 *
 * Analyzes extraction results and calculates quality metrics.
 * Compares with baseline to detect regressions.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TestResult,
  QualityMetrics,
  QualityDiff,
  TypeMetrics,
  ExtractedItem,
  DEFAULT_CONFIG,
  BatteryConfig,
} from './types';

// ============================================================================
// Quality Analyzer Class
// ============================================================================

export class QualityAnalyzer {
  private config: BatteryConfig;

  constructor(config: BatteryConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Analyze quality metrics from test results
   */
  analyzeQuality(results: TestResult[]): QualityMetrics {
    // Separate by type
    const pdfResults = results.filter((r) => r.testCase.source.type === 'pdf');
    const csvResults = results.filter((r) => r.testCase.source.type === 'csv' || r.testCase.source.type === 'json');

    // Calculate overall metrics
    const allItems = results.flatMap((r) => r.extractedItems);
    const totalExpected = results.reduce((sum, r) => sum + r.testCase.source.expectedItems, 0);
    const totalExtracted = results.reduce((sum, r) => sum + r.itemsExtracted, 0);

    // Completeness
    const completenessRate = totalExpected > 0 ? Math.min(1, totalExtracted / totalExpected) : 0;

    // Accuracy (items with valid names and categories)
    const validNames = allItems.filter((i) => this.isValidName(i.name)).length;
    const validCategories = allItems.filter((i) => this.isValidCategory(i.category)).length;
    const validDescriptions = allItems.filter((i) => this.isValidDescription(i.description)).length;
    const accuracyRate = allItems.length > 0
      ? (validNames + validCategories) / (allItems.length * 2)
      : 0;

    // Performance
    const extractionTimes = results.map((r) => r.extractionTime).filter((t) => t > 0);
    const avgExtractionTime = extractionTimes.length > 0
      ? extractionTimes.reduce((a, b) => a + b, 0) / extractionTimes.length
      : 0;
    const maxExtractionTime = extractionTimes.length > 0 ? Math.max(...extractionTimes) : 0;
    const minExtractionTime = extractionTimes.length > 0 ? Math.min(...extractionTimes) : 0;

    // Confidence
    const confidences = results.map((r) => r.confidence.avg).filter((c) => c > 0);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // Noise detection (within each catalog, not across catalogs)
    const { noiseItems, duplicates } = this.detectNoiseInResults(results);
    const noiseRate = allItems.length > 0 ? (noiseItems + duplicates) / allItems.length : 0;

    return {
      itemsExpected: totalExpected,
      itemsExtracted: totalExtracted,
      completenessRate,
      validNames,
      validCategories,
      validDescriptions,
      accuracyRate,
      avgExtractionTime,
      maxExtractionTime,
      minExtractionTime,
      avgConfidence,
      noiseItems,
      duplicates,
      noiseRate,
      byType: {
        pdf: this.calculateTypeMetrics(pdfResults),
        csv: this.calculateTypeMetrics(csvResults),
      },
    };
  }

  /**
   * Calculate metrics for a specific file type
   */
  private calculateTypeMetrics(results: TestResult[]): TypeMetrics {
    if (results.length === 0) {
      return {
        testsRun: 0,
        testsPassed: 0,
        avgExtractionTime: 0,
        avgCompleteness: 0,
        avgConfidence: 0,
        totalItems: 0,
        totalTime: 0,
        throughput: 0,
      };
    }

    const passed = results.filter((r) => r.passed).length;
    const times = results.map((r) => r.extractionTime).filter((t) => t > 0);
    const completeness = results.map((r) => {
      const expected = r.testCase.source.expectedItems;
      return expected > 0 ? Math.min(1, r.itemsExtracted / expected) : 0;
    });
    const confidence = results.map((r) => r.confidence.avg).filter((c) => c > 0);

    // Calculate throughput metrics
    const totalItems = results.reduce((sum, r) => sum + r.itemsExtracted, 0);
    const totalTime = times.reduce((a, b) => a + b, 0);
    const throughput = totalTime > 0 ? (totalItems / totalTime) * 1000 : 0; // items per second

    return {
      testsRun: results.length,
      testsPassed: passed,
      avgExtractionTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      avgCompleteness: completeness.length > 0 ? completeness.reduce((a, b) => a + b, 0) / completeness.length : 0,
      avgConfidence: confidence.length > 0 ? confidence.reduce((a, b) => a + b, 0) / confidence.length : 0,
      totalItems,
      totalTime,
      throughput,
    };
  }

  /**
   * Detect noise and duplicates within each result set
   * Note: We check duplicates WITHIN each catalog, not across catalogs
   * (same product appearing in multiple catalogs is expected)
   */
  private detectNoiseInResults(results: TestResult[]): { noiseItems: number; duplicates: number } {
    let totalNoise = 0;
    let totalDuplicates = 0;

    for (const result of results) {
      const seenNames = new Set<string>();

      for (const item of result.extractedItems) {
        // Check for noise patterns
        if (this.isNoiseItem(item)) {
          totalNoise++;
          continue;
        }

        // Check for duplicates WITHIN this catalog only
        const normalizedName = this.normalizeName(item.name);
        if (seenNames.has(normalizedName)) {
          totalDuplicates++;
        } else {
          seenNames.add(normalizedName);
        }
      }
    }

    return { noiseItems: totalNoise, duplicates: totalDuplicates };
  }

  /**
   * Check if item name is valid
   */
  private isValidName(name: string | undefined): boolean {
    if (!name) return false;
    if (name.length < 2) return false;
    if (name.length > 500) return false;

    // Check for garbage patterns
    if (/^[0-9]+$/.test(name)) return false;
    if (/^[^a-zA-Z0-9]+$/.test(name)) return false;
    if (/^(unknown|null|undefined|n\/a|na|-)$/i.test(name)) return false;

    return true;
  }

  /**
   * Check if category is valid
   */
  private isValidCategory(category: string | undefined): boolean {
    if (!category) return false;
    if (category.length < 2) return false;
    if (category.length > 100) return false;
    if (/^[0-9]+$/.test(category)) return false;

    return true;
  }

  /**
   * Check if description is valid
   */
  private isValidDescription(description: string | undefined): boolean {
    if (!description) return false;
    if (description.length < 10) return false;

    return true;
  }

  /**
   * Check if item is likely noise
   */
  private isNoiseItem(item: ExtractedItem): boolean {
    // Empty or very short name
    if (!item.name || item.name.length < 2) return true;

    // Only numbers or special characters
    if (/^[0-9\s\-_\.]+$/.test(item.name)) return true;

    // Repetitive patterns (like "===", "---", "...")
    if (/^(.)\1{3,}$/.test(item.name)) return true;

    // Header-like content
    const headerPatterns = [
      /^(name|description|category|price|vendor|type|id|sku|code)$/i,
      /^(prodotto|servizio|nome|descrizione|categoria|prezzo)$/i,
      /^column\s*\d+$/i,
      /^field\s*\d+$/i,
    ];
    for (const pattern of headerPatterns) {
      if (pattern.test(item.name)) return true;
    }

    // Very low confidence (if available)
    if (item.confidence !== undefined && item.confidence < 0.1) return true;

    return false;
  }

  /**
   * Normalize name for duplicate detection
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 50);
  }

  /**
   * Compare with baseline metrics
   */
  compareWithBaseline(current: QualityMetrics, baseline: QualityMetrics): QualityDiff {
    const regressions: string[] = [];
    const improvements: string[] = [];

    // Completeness
    const completenessChange = current.completenessRate - baseline.completenessRate;
    if (completenessChange < -0.05) {
      regressions.push(`Completeness dropped: ${(baseline.completenessRate * 100).toFixed(1)}% → ${(current.completenessRate * 100).toFixed(1)}%`);
    } else if (completenessChange > 0.05) {
      improvements.push(`Completeness improved: ${(baseline.completenessRate * 100).toFixed(1)}% → ${(current.completenessRate * 100).toFixed(1)}%`);
    }

    // Accuracy
    const accuracyChange = current.accuracyRate - baseline.accuracyRate;
    if (accuracyChange < -0.05) {
      regressions.push(`Accuracy dropped: ${(baseline.accuracyRate * 100).toFixed(1)}% → ${(current.accuracyRate * 100).toFixed(1)}%`);
    } else if (accuracyChange > 0.05) {
      improvements.push(`Accuracy improved: ${(baseline.accuracyRate * 100).toFixed(1)}% → ${(current.accuracyRate * 100).toFixed(1)}%`);
    }

    // Performance (lower is better)
    const performanceChange = current.avgExtractionTime - baseline.avgExtractionTime;
    if (performanceChange > 5000) { // 5s slower
      regressions.push(`Performance degraded: ${baseline.avgExtractionTime.toFixed(0)}ms → ${current.avgExtractionTime.toFixed(0)}ms`);
    } else if (performanceChange < -5000) { // 5s faster
      improvements.push(`Performance improved: ${baseline.avgExtractionTime.toFixed(0)}ms → ${current.avgExtractionTime.toFixed(0)}ms`);
    }

    // Noise (lower is better)
    const noiseChange = current.noiseRate - baseline.noiseRate;
    if (noiseChange > 0.05) {
      regressions.push(`Noise increased: ${(baseline.noiseRate * 100).toFixed(1)}% → ${(current.noiseRate * 100).toFixed(1)}%`);
    } else if (noiseChange < -0.05) {
      improvements.push(`Noise decreased: ${(baseline.noiseRate * 100).toFixed(1)}% → ${(current.noiseRate * 100).toFixed(1)}%`);
    }

    return {
      completenessChange,
      accuracyChange,
      performanceChange,
      regressions,
      improvements,
    };
  }

  /**
   * Load baseline from file
   */
  loadBaseline(baselinePath?: string): QualityMetrics | null {
    const filePath = baselinePath || path.join(this.config.reportsDir, 'baseline.json');

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data.metrics;
    } catch {
      return null;
    }
  }

  /**
   * Save current metrics as baseline
   */
  saveBaseline(metrics: QualityMetrics, baselinePath?: string): void {
    const filePath = baselinePath || path.join(this.config.reportsDir, 'baseline.json');
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      timestamp: new Date().toISOString(),
      metrics,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Check if metrics pass thresholds
   */
  passesThresholds(metrics: QualityMetrics): { passes: boolean; failures: string[] } {
    const failures: string[] = [];

    if (metrics.completenessRate < this.config.minCompleteness) {
      failures.push(`Completeness ${(metrics.completenessRate * 100).toFixed(1)}% < ${(this.config.minCompleteness * 100).toFixed(1)}%`);
    }

    if (metrics.accuracyRate < this.config.minAccuracy) {
      failures.push(`Accuracy ${(metrics.accuracyRate * 100).toFixed(1)}% < ${(this.config.minAccuracy * 100).toFixed(1)}%`);
    }

    if (metrics.noiseRate > this.config.maxNoiseRate) {
      failures.push(`Noise ${(metrics.noiseRate * 100).toFixed(1)}% > ${(this.config.maxNoiseRate * 100).toFixed(1)}%`);
    }

    if (metrics.avgConfidence < this.config.minConfidence) {
      failures.push(`Confidence ${(metrics.avgConfidence * 100).toFixed(1)}% < ${(this.config.minConfidence * 100).toFixed(1)}%`);
    }

    return {
      passes: failures.length === 0,
      failures,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function formatMetricsTable(metrics: QualityMetrics): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║                     QUALITY METRICS                          ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');

  // Completeness
  lines.push(`║ Completeness:    ${formatPercent(metrics.completenessRate).padEnd(8)} (${metrics.itemsExtracted}/${metrics.itemsExpected} items)`);

  // Accuracy
  lines.push(`║ Accuracy:        ${formatPercent(metrics.accuracyRate).padEnd(8)} (${metrics.validNames} valid names, ${metrics.validCategories} categories)`);

  // Noise
  lines.push(`║ Noise Rate:      ${formatPercent(metrics.noiseRate).padEnd(8)} (${metrics.noiseItems} noise, ${metrics.duplicates} dupes)`);

  // Confidence
  lines.push(`║ Avg Confidence:  ${formatPercent(metrics.avgConfidence)}`);

  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push('║                     PERFORMANCE                              ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');

  // Performance
  lines.push(`║ Avg Time:        ${formatMs(metrics.avgExtractionTime)}`);
  lines.push(`║ Min Time:        ${formatMs(metrics.minExtractionTime)}`);
  lines.push(`║ Max Time:        ${formatMs(metrics.maxExtractionTime)}`);

  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push('║                     BY TYPE                                  ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');

  // PDF
  const pdf = metrics.byType.pdf;
  lines.push(`║ PDF:  ${pdf.testsPassed}/${pdf.testsRun} passed | ${formatMs(pdf.avgExtractionTime)} avg | ${formatPercent(pdf.avgCompleteness)} complete`);
  if (pdf.totalItems > 0) {
    lines.push(`║       ${pdf.totalItems} items in ${formatMs(pdf.totalTime)} | ${pdf.throughput.toFixed(1)} items/sec`);
  }

  // CSV
  const csv = metrics.byType.csv;
  lines.push(`║ CSV:  ${csv.testsPassed}/${csv.testsRun} passed | ${formatMs(csv.avgExtractionTime)} avg | ${formatPercent(csv.avgCompleteness)} complete`);
  if (csv.totalItems > 0) {
    lines.push(`║       ${csv.totalItems} items in ${formatMs(csv.totalTime)} | ${csv.throughput.toFixed(1)} items/sec`);
  }

  lines.push('╚══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${value.toFixed(0)}ms`;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  console.log('📊 Quality Analyzer - Run via runBatteryTests.ts');
}
