/**
 * 🧪 Battery Test Types
 *
 * Shared types for the ingestion battery test suite.
 */

// ============================================================================
// Catalog Sources
// ============================================================================

export interface CatalogSource {
  id: string;
  name: string;
  url: string;
  type: 'pdf' | 'csv' | 'xlsx' | 'json';
  expectedItems: number;
  category: string;
  description?: string;
  isPublic: boolean;
  requiresAuth?: boolean;
}

export interface DownloadResult {
  source: CatalogSource;
  success: boolean;
  localPath?: string;
  error?: string;
  downloadedAt?: Date;
  fileSize?: number;
}

// ============================================================================
// Test Cases
// ============================================================================

export interface TestCase {
  id: string;
  file: string;
  source: CatalogSource;
  expectedMinItems: number;
  expectedMaxItems?: number;
  expectedCategories?: string[];
  maxExtractionTime: number; // ms
  expectedFields?: string[];
  skipNormalization?: boolean;
}

export interface ExtractedItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  category?: string;
  description?: string;
  confidence?: number;
  vendor?: string;
  price?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Test Results
// ============================================================================

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  itemsExtracted: number;
  extractedItems: ExtractedItem[];
  extractionTime: number; // ms
  confidence: {
    avg: number;
    min: number;
    max: number;
  };
  errors: string[];
  warnings: string[];
  phases?: PhaseResult[];
}

export interface PhaseResult {
  phase: string;
  duration: number;
  itemsCount: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Quality Metrics
// ============================================================================

export interface QualityMetrics {
  // Completeness
  itemsExpected: number;
  itemsExtracted: number;
  completenessRate: number; // 0-1

  // Accuracy
  validNames: number;
  validCategories: number;
  validDescriptions: number;
  accuracyRate: number;

  // Performance
  avgExtractionTime: number;
  maxExtractionTime: number;
  minExtractionTime: number;
  avgConfidence: number;

  // Noise
  noiseItems: number;
  duplicates: number;
  noiseRate: number;

  // By type
  byType: {
    pdf: TypeMetrics;
    csv: TypeMetrics;
  };
}

export interface TypeMetrics {
  testsRun: number;
  testsPassed: number;
  avgExtractionTime: number;
  avgCompleteness: number;
  avgConfidence: number;
  totalItems: number;
  totalTime: number;
  throughput: number; // items/second
}

export interface QualityDiff {
  completenessChange: number;
  accuracyChange: number;
  performanceChange: number;
  regressions: string[];
  improvements: string[];
}

// ============================================================================
// Report
// ============================================================================

export interface BatteryReport {
  timestamp: string;
  version: string;
  environment: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  successRate: number;
  metrics: QualityMetrics;
  regressions: Regression[];
  improvements: Improvement[];
  detailedResults: TestResult[];
  duration: number; // total ms
}

export interface Regression {
  testId: string;
  metric: string;
  previous: number;
  current: number;
  severity: 'low' | 'medium' | 'high';
}

export interface Improvement {
  testId: string;
  metric: string;
  previous: number;
  current: number;
}

// ============================================================================
// Config
// ============================================================================

export interface BatteryConfig {
  // Directories
  fixturesDir: string;
  reportsDir: string;
  cacheDir: string;

  // Thresholds
  minCompleteness: number;
  minAccuracy: number;
  maxNoiseRate: number;
  minConfidence: number;
  maxPdfTime: number; // ms
  maxCsvTime: number; // ms

  // Options
  downloadIfMissing: boolean;
  skipSlowTests: boolean;
  parallelTests: number;
  verbose: boolean;
  saveReport: boolean;
  compareBaseline: boolean;
  tenantId?: string;
}

export const DEFAULT_CONFIG: BatteryConfig = {
  fixturesDir: './__tests__/ingestion/fixtures',
  reportsDir: './__tests__/ingestion/reports',
  cacheDir: './__tests__/ingestion/cache',
  minCompleteness: 0.8,
  minAccuracy: 0.85,
  maxNoiseRate: 0.15,
  minConfidence: 0.7,
  maxPdfTime: 60000, // 60s
  maxCsvTime: 10000, // 10s
  downloadIfMissing: true,
  skipSlowTests: false,
  parallelTests: 1,
  verbose: true,
  saveReport: true,
  compareBaseline: false,
  tenantId: 'battery-test-tenant',
};
