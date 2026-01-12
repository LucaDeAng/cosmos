/**
 * 🧪 Report Generator
 *
 * Generates JSON and HTML reports from battery test results.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  BatteryReport,
  TestResult,
  QualityMetrics,
  Regression,
  Improvement,
  DEFAULT_CONFIG,
  BatteryConfig,
} from './types';
import { QualityAnalyzer, formatMetricsTable } from './qualityAnalyzer';

// ============================================================================
// Report Generator Class
// ============================================================================

export class ReportGenerator {
  private config: BatteryConfig;
  private analyzer: QualityAnalyzer;

  constructor(config: BatteryConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.analyzer = new QualityAnalyzer(config);
  }

  /**
   * Generate complete battery report
   */
  async generateReport(
    results: TestResult[],
    metrics: QualityMetrics,
    startTime: number
  ): Promise<BatteryReport> {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const skipped = results.filter((r) => r.warnings.some((w) => w.includes('skipped'))).length;

    // Load and compare with baseline
    let regressions: Regression[] = [];
    let improvements: Improvement[] = [];

    if (this.config.compareBaseline) {
      const baseline = this.analyzer.loadBaseline();
      if (baseline) {
        const diff = this.analyzer.compareWithBaseline(metrics, baseline);

        regressions = diff.regressions.map((msg) => ({
          testId: 'overall',
          metric: msg.split(':')[0] || 'unknown',
          previous: 0,
          current: 0,
          severity: msg.includes('dropped') ? 'high' : 'medium' as const,
        }));

        improvements = diff.improvements.map((msg) => ({
          testId: 'overall',
          metric: msg.split(':')[0] || 'unknown',
          previous: 0,
          current: 0,
        }));
      }
    }

    // Find specific regressions in individual tests
    for (const result of results) {
      if (!result.passed) {
        for (const error of result.errors) {
          regressions.push({
            testId: result.testCase.id,
            metric: error,
            previous: result.testCase.expectedMinItems,
            current: result.itemsExtracted,
            severity: error.includes('Too few') ? 'high' : 'medium',
          });
        }
      }
    }

    const report: BatteryReport = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      totalTests: results.length,
      passed,
      failed,
      skipped,
      successRate: results.length > 0 ? passed / results.length : 0,
      metrics,
      regressions,
      improvements,
      detailedResults: results,
      duration: Date.now() - startTime,
    };

    return report;
  }

  /**
   * Save report to files (JSON + HTML)
   */
  async saveReport(report: BatteryReport): Promise<{ jsonPath: string; htmlPath: string }> {
    const reportsDir = path.resolve(this.config.reportsDir);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const jsonPath = path.join(reportsDir, `battery-${timestamp}.json`);
    const htmlPath = path.join(reportsDir, `battery-${timestamp}.html`);
    const latestJsonPath = path.join(reportsDir, 'latest.json');
    const latestHtmlPath = path.join(reportsDir, 'latest.html');

    // Save JSON
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));

    // Generate and save HTML
    const html = this.generateHtmlReport(report);
    fs.writeFileSync(htmlPath, html);
    fs.writeFileSync(latestHtmlPath, html);

    console.log(`\n📄 Reports saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   HTML: ${htmlPath}`);

    return { jsonPath, htmlPath };
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: BatteryReport): string {
    const m = report.metrics;
    const passRate = (report.successRate * 100).toFixed(1);
    const statusClass = report.failed > 0 ? 'failed' : 'passed';
    const statusIcon = report.failed > 0 ? '❌' : '✅';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Battery Test Report - ${report.timestamp.split('T')[0]}</title>
  <style>
    :root {
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
      --blue: #3b82f6;
      --gray: #6b7280;
      --bg: #f9fafb;
      --card: #ffffff;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      margin: 0;
      padding: 20px;
      color: #1f2937;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.875rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--gray);
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card);
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 1rem;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .stat-card {
      background: var(--bg);
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
    }
    .stat-label {
      color: var(--gray);
      font-size: 0.875rem;
    }
    .passed { color: var(--green); }
    .failed { color: var(--red); }
    .warning { color: var(--yellow); }
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
    }
    .metrics-table th,
    .metrics-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .metrics-table th {
      font-weight: 600;
      color: var(--gray);
      font-size: 0.875rem;
      text-transform: uppercase;
    }
    .progress-bar {
      background: #e5e7eb;
      border-radius: 9999px;
      height: 8px;
      overflow: hidden;
      width: 100px;
      display: inline-block;
      vertical-align: middle;
      margin-left: 0.5rem;
    }
    .progress-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s;
    }
    .test-result {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .test-result:last-child {
      border-bottom: none;
    }
    .test-status {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 1rem;
      font-size: 0.75rem;
    }
    .test-status.pass {
      background: #dcfce7;
      color: var(--green);
    }
    .test-status.fail {
      background: #fee2e2;
      color: var(--red);
    }
    .test-info {
      flex: 1;
    }
    .test-name {
      font-weight: 500;
    }
    .test-details {
      font-size: 0.875rem;
      color: var(--gray);
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧪 Ingestion Battery Test Report</h1>
    <p class="subtitle">${report.timestamp} | Duration: ${formatDuration(report.duration)}</p>

    <!-- Summary -->
    <div class="card">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="stat-card">
          <div class="stat-value ${statusClass}">${statusIcon} ${passRate}%</div>
          <div class="stat-label">Success Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${report.totalTests}</div>
          <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value passed">${report.passed}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value failed">${report.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
    </div>

    <!-- Quality Metrics -->
    <div class="card">
      <h2>Quality Metrics</h2>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${this.renderMetricRow('Completeness', m.completenessRate, 0.8, 0.95)}
          ${this.renderMetricRow('Accuracy', m.accuracyRate, 0.85, 0.95)}
          ${this.renderMetricRow('Noise Rate', 1 - m.noiseRate, 0.85, 0.95, true)}
          ${this.renderMetricRow('Avg Confidence', m.avgConfidence, 0.7, 0.85)}
        </tbody>
      </table>
    </div>

    <!-- Performance -->
    <div class="card">
      <h2>Performance</h2>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Average Extraction Time</td>
            <td>${formatDuration(m.avgExtractionTime)}</td>
          </tr>
          <tr>
            <td>Min Extraction Time</td>
            <td>${formatDuration(m.minExtractionTime)}</td>
          </tr>
          <tr>
            <td>Max Extraction Time</td>
            <td>${formatDuration(m.maxExtractionTime)}</td>
          </tr>
          <tr>
            <td>Items Extracted</td>
            <td>${m.itemsExtracted} / ${m.itemsExpected} expected</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- By Type -->
    <div class="card">
      <h2>Results by Type</h2>
      <table class="metrics-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Tests</th>
            <th>Passed</th>
            <th>Avg Time</th>
            <th>Avg Completeness</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge badge-blue">PDF</span></td>
            <td>${m.byType.pdf.testsRun}</td>
            <td>${m.byType.pdf.testsPassed}</td>
            <td>${formatDuration(m.byType.pdf.avgExtractionTime)}</td>
            <td>${(m.byType.pdf.avgCompleteness * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td><span class="badge badge-green">CSV/JSON</span></td>
            <td>${m.byType.csv.testsRun}</td>
            <td>${m.byType.csv.testsPassed}</td>
            <td>${formatDuration(m.byType.csv.avgExtractionTime)}</td>
            <td>${(m.byType.csv.avgCompleteness * 100).toFixed(1)}%</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${report.regressions.length > 0 ? `
    <!-- Regressions -->
    <div class="card">
      <h2>❌ Regressions</h2>
      ${report.regressions.map((r) => `
        <div class="test-result">
          <div class="test-status fail">!</div>
          <div class="test-info">
            <div class="test-name">${r.testId}</div>
            <div class="test-details">${r.metric}</div>
          </div>
          <span class="badge badge-${r.severity === 'high' ? 'red' : 'yellow'}">${r.severity}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${report.improvements.length > 0 ? `
    <!-- Improvements -->
    <div class="card">
      <h2>✅ Improvements</h2>
      ${report.improvements.map((i) => `
        <div class="test-result">
          <div class="test-status pass">✓</div>
          <div class="test-info">
            <div class="test-name">${i.testId}</div>
            <div class="test-details">${i.metric}</div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Detailed Results -->
    <div class="card">
      <h2>Detailed Results</h2>
      ${report.detailedResults.map((r) => `
        <div class="test-result">
          <div class="test-status ${r.passed ? 'pass' : 'fail'}">${r.passed ? '✓' : '✗'}</div>
          <div class="test-info">
            <div class="test-name">${r.testCase.id}</div>
            <div class="test-details">
              ${r.itemsExtracted} items | ${formatDuration(r.extractionTime)} |
              Confidence: ${(r.confidence.avg * 100).toFixed(0)}%
              ${r.errors.length > 0 ? ` | Errors: ${r.errors.join(', ')}` : ''}
            </div>
          </div>
          <span class="badge badge-${r.testCase.source.type === 'pdf' ? 'blue' : 'green'}">
            ${r.testCase.source.type.toUpperCase()}
          </span>
        </div>
      `).join('')}
    </div>

  </div>
</body>
</html>`;
  }

  /**
   * Render metric row for HTML table
   */
  private renderMetricRow(
    name: string,
    value: number,
    threshold: number,
    target: number,
    inverted = false
  ): string {
    const displayValue = inverted ? 1 - value : value;
    const percent = (displayValue * 100).toFixed(1);
    const status = displayValue >= target ? 'passed' : displayValue >= threshold ? 'warning' : 'failed';
    const statusLabel = displayValue >= target ? 'Good' : displayValue >= threshold ? 'OK' : 'Needs Work';
    const fillColor = status === 'passed' ? '#22c55e' : status === 'warning' ? '#eab308' : '#ef4444';

    return `
      <tr>
        <td>${name}</td>
        <td>${percent}%</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${displayValue * 100}%; background: ${fillColor}"></div>
          </div>
        </td>
        <td><span class="badge badge-${status === 'passed' ? 'green' : status === 'warning' ? 'yellow' : 'red'}">${statusLabel}</span></td>
      </tr>
    `;
  }

  /**
   * Print summary to console
   */
  printSummary(report: BatteryReport): void {
    const divider = '═'.repeat(60);

    console.log(`\n${divider}`);
    console.log(`🧪 INGESTION BATTERY TESTS - ${report.timestamp.split('T')[0]}`);
    console.log(divider);

    // Summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Total Tests:     ${report.totalTests}`);
    console.log(`   Passed:          ${report.passed} ✅`);
    console.log(`   Failed:          ${report.failed} ${report.failed > 0 ? '❌' : ''}`);
    console.log(`   Success Rate:    ${(report.successRate * 100).toFixed(1)}%`);
    console.log(`   Duration:        ${formatDuration(report.duration)}`);

    // Quality Metrics
    console.log(`\n📈 QUALITY METRICS`);
    console.log(formatMetricsTable(report.metrics));

    // Threshold check
    const thresholdCheck = this.analyzer.passesThresholds(report.metrics);
    if (!thresholdCheck.passes) {
      console.log(`\n⚠️  THRESHOLD FAILURES:`);
      thresholdCheck.failures.forEach((f) => console.log(`   - ${f}`));
    }

    // Regressions
    if (report.regressions.length > 0) {
      console.log(`\n❌ REGRESSIONS (${report.regressions.length}):`);
      report.regressions.slice(0, 10).forEach((r) => {
        console.log(`   - [${r.testId}] ${r.metric}`);
      });
      if (report.regressions.length > 10) {
        console.log(`   ... and ${report.regressions.length - 10} more`);
      }
    }

    // Improvements
    if (report.improvements.length > 0) {
      console.log(`\n✅ IMPROVEMENTS (${report.improvements.length}):`);
      report.improvements.forEach((i) => {
        console.log(`   - [${i.testId}] ${i.metric}`);
      });
    }

    console.log(`\n${divider}\n`);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  console.log('📄 Report Generator - Run via runBatteryTests.ts');
}
