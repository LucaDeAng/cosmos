/**
 * 🧪 Extraction Tester
 *
 * Tests PDF and CSV extraction using the actual ingestion pipeline.
 * Measures accuracy, completeness, and performance.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import pLimit from 'p-limit';
import {
  TestCase,
  TestResult,
  ExtractedItem,
  CatalogSource,
  DownloadResult,
  DEFAULT_CONFIG,
  BatteryConfig,
  PhaseResult,
} from './types';

// Import extraction functions
import { parseCSV, CSVParserInput, CSVParserOutput } from '../../../src/agents/subagents/ingestion/csvParserAgent';
import { parsePDF, PDFParserInput, PDFParserOutput } from '../../../src/agents/subagents/ingestion/pdfParserAgent';

// ============================================================================
// PDF Result Cache (Persistent)
// ============================================================================

interface CachedPDFResult {
  hash: string;
  timestamp: string;
  items: ExtractedItem[];
  confidence: number;
  processingTime: number;
  extractionNotes?: string[];
}

class PDFResultCache {
  private cacheDir: string;
  private cacheIndex: Map<string, CachedPDFResult> = new Map();
  private indexPath: string;

  constructor(cacheDir: string) {
    this.cacheDir = path.join(cacheDir, 'pdf-cache');
    this.indexPath = path.join(this.cacheDir, 'index.json');
    this.ensureCacheDir();
    this.loadIndex();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
        this.cacheIndex = new Map(Object.entries(data));
      }
    } catch (error) {
      console.log('   ⚠️ Could not load cache index, starting fresh');
      this.cacheIndex = new Map();
    }
  }

  private saveIndex(): void {
    try {
      const data = Object.fromEntries(this.cacheIndex);
      fs.writeFileSync(this.indexPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log('   ⚠️ Could not save cache index');
    }
  }

  /**
   * Generate hash for a file buffer
   */
  hashFile(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /**
   * Get cached result for a file
   */
  get(fileHash: string): CachedPDFResult | null {
    const cached = this.cacheIndex.get(fileHash);
    if (cached) {
      // Check if cache is less than 24 hours old
      const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (cacheAge < maxAge) {
        return cached;
      }
    }
    return null;
  }

  /**
   * Store result in cache
   */
  set(fileHash: string, items: ExtractedItem[], confidence: number, processingTime: number, notes?: string[]): void {
    const cached: CachedPDFResult = {
      hash: fileHash,
      timestamp: new Date().toISOString(),
      items,
      confidence,
      processingTime,
      extractionNotes: notes,
    };
    this.cacheIndex.set(fileHash, cached);
    this.saveIndex();

    // Also save full item data to separate file
    const itemsPath = path.join(this.cacheDir, `${fileHash}.json`);
    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
  }

  /**
   * Get cache statistics
   */
  getStats(): { entries: number; hitRate: number } {
    return {
      entries: this.cacheIndex.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}

// ============================================================================
// Test Case Generator
// ============================================================================

export function generateTestCases(downloadResults: DownloadResult[]): TestCase[] {
  const testCases: TestCase[] = [];

  for (const result of downloadResults) {
    if (!result.success || !result.localPath) continue;

    const source = result.source;
    const testCase: TestCase = {
      id: `${source.type.toUpperCase()}-${source.id}`,
      file: result.localPath,
      source,
      expectedMinItems: Math.floor(source.expectedItems * 0.7), // 70% minimum
      expectedMaxItems: Math.floor(source.expectedItems * 1.5), // 150% max (for noise tolerance)
      maxExtractionTime: source.type === 'pdf' ? 60000 : 10000,
      skipNormalization: true, // For battery tests, we skip heavy normalization
    };

    // Add expected categories based on source
    switch (source.category) {
      case 'automotive':
        testCase.expectedCategories = ['Berlina', 'SUV', 'Crossover', 'City Car', 'product'];
        testCase.expectedFields = ['name', 'vendor', 'category'];
        break;
      case 'tech':
        testCase.expectedCategories = ['Software', 'Cloud', 'Hardware', 'Security', 'product'];
        testCase.expectedFields = ['name', 'vendor', 'category'];
        break;
      case 'services':
        testCase.expectedCategories = ['Consulting', 'Implementation', 'Support', 'service'];
        testCase.expectedFields = ['name', 'vendor'];
        break;
      case 'food':
        testCase.expectedCategories = ['Food', 'Beverages', 'product'];
        testCase.expectedFields = ['name'];
        break;
      default:
        testCase.expectedCategories = ['product', 'service'];
        testCase.expectedFields = ['name'];
    }

    testCases.push(testCase);
  }

  return testCases;
}

// ============================================================================
// Extraction Tester Class
// ============================================================================

export class ExtractionTester {
  private config: BatteryConfig;
  private verbose: boolean;
  private pdfCache: PDFResultCache;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(config: BatteryConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.verbose = config.verbose;
    this.pdfCache = new PDFResultCache(config.cacheDir);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: string } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) : '0.0';
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Run all test cases
   * PDF tests run in parallel (up to 3 concurrent), CSV/JSON run sequentially
   */
  async runAllTests(testCases: TestCase[]): Promise<TestResult[]> {
    // Separate PDF and non-PDF tests
    const pdfTests = testCases.filter((tc) => tc.source.type === 'pdf');
    const otherTests = testCases.filter((tc) => tc.source.type !== 'pdf');

    const results: TestResult[] = [];

    // Run non-PDF tests sequentially (they're fast anyway)
    for (let i = 0; i < otherTests.length; i++) {
      const testCase = otherTests[i];
      console.log(`\n🔬 [${i + 1}/${otherTests.length}] Testing: ${testCase.id}`);

      try {
        const result = await this.runExtractionTest(testCase);
        results.push(result);

        if (result.passed) {
          console.log(`   ✅ PASSED - ${result.itemsExtracted} items in ${result.extractionTime}ms`);
        } else {
          console.log(`   ❌ FAILED - ${result.errors.join(', ')}`);
        }
      } catch (error) {
        console.log(`   ❌ ERROR - ${error instanceof Error ? error.message : error}`);
        results.push({
          testCase,
          passed: false,
          itemsExtracted: 0,
          extractedItems: [],
          extractionTime: 0,
          confidence: { avg: 0, min: 0, max: 0 },
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
        });
      }
    }

    // Run PDF tests in parallel (up to 3 concurrent to avoid rate limits)
    if (pdfTests.length > 0) {
      console.log(`\n📄 Running ${pdfTests.length} PDF tests in parallel (max 3 concurrent)...`);
      const pdfLimit = pLimit(3);

      const pdfPromises = pdfTests.map((testCase, i) =>
        pdfLimit(async () => {
          const testNum = otherTests.length + i + 1;
          console.log(`\n🔬 [${testNum}/${testCases.length}] Testing: ${testCase.id}`);

          try {
            const result = await this.runExtractionTest(testCase);

            if (result.passed) {
              console.log(`   ✅ PASSED - ${result.itemsExtracted} items in ${result.extractionTime}ms`);
            } else {
              console.log(`   ❌ FAILED - ${result.errors.join(', ')}`);
            }

            return result;
          } catch (error) {
            console.log(`   ❌ ERROR - ${error instanceof Error ? error.message : error}`);
            return {
              testCase,
              passed: false,
              itemsExtracted: 0,
              extractedItems: [],
              extractionTime: 0,
              confidence: { avg: 0, min: 0, max: 0 },
              errors: [error instanceof Error ? error.message : String(error)],
              warnings: [],
            } as TestResult;
          }
        })
      );

      const pdfResults = await Promise.all(pdfPromises);
      results.push(...pdfResults);
    }

    return results;
  }

  /**
   * Run single extraction test
   */
  async runExtractionTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const phases: PhaseResult[] = [];

    // Check file exists
    if (!fs.existsSync(testCase.file)) {
      return {
        testCase,
        passed: false,
        itemsExtracted: 0,
        extractedItems: [],
        extractionTime: 0,
        confidence: { avg: 0, min: 0, max: 0 },
        errors: [`File not found: ${testCase.file}`],
        warnings: [],
      };
    }

    const fileBuffer = fs.readFileSync(testCase.file);
    const fileName = path.basename(testCase.file);

    let extractedItems: ExtractedItem[] = [];
    let extractionTime = 0;

    try {
      switch (testCase.source.type) {
        case 'csv':
          const csvResult = await this.testCSVExtraction(fileBuffer, fileName, testCase);
          extractedItems = csvResult.items;
          extractionTime = csvResult.time;
          phases.push(...csvResult.phases);
          warnings.push(...csvResult.warnings);
          break;

        case 'json':
          const jsonResult = await this.testJSONExtraction(fileBuffer, fileName, testCase);
          extractedItems = jsonResult.items;
          extractionTime = jsonResult.time;
          phases.push(...jsonResult.phases);
          break;

        case 'pdf':
          const pdfResult = await this.testPDFExtraction(fileBuffer, fileName, testCase);
          extractedItems = pdfResult.items;
          extractionTime = pdfResult.time;
          phases.push(...pdfResult.phases);
          warnings.push(...pdfResult.warnings);
          break;

        default:
          errors.push(`Unsupported file type: ${testCase.source.type}`);
      }
    } catch (error) {
      errors.push(`Extraction error: ${error instanceof Error ? error.message : error}`);
    }

    // Calculate confidence stats
    const confidences = extractedItems.map((i) => i.confidence || 0).filter((c) => c > 0);
    const confidence = {
      avg: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      min: confidences.length > 0 ? Math.min(...confidences) : 0,
      max: confidences.length > 0 ? Math.max(...confidences) : 0,
    };

    // Validate results
    const totalTime = Date.now() - startTime;

    // Check minimum items
    if (extractedItems.length < testCase.expectedMinItems) {
      errors.push(`Too few items: got ${extractedItems.length}, expected min ${testCase.expectedMinItems}`);
    }

    // Check max items (noise)
    if (testCase.expectedMaxItems && extractedItems.length > testCase.expectedMaxItems) {
      warnings.push(`Too many items (possible noise): got ${extractedItems.length}, expected max ${testCase.expectedMaxItems}`);
    }

    // Check extraction time
    if (totalTime > testCase.maxExtractionTime) {
      errors.push(`Extraction too slow: ${totalTime}ms > ${testCase.maxExtractionTime}ms`);
    }

    // Check required fields
    if (testCase.expectedFields) {
      const missingFields = this.checkRequiredFields(extractedItems, testCase.expectedFields);
      if (missingFields.length > 0) {
        warnings.push(`Missing fields in some items: ${missingFields.join(', ')}`);
      }
    }

    // Determine pass/fail
    const passed = errors.length === 0 && extractedItems.length >= testCase.expectedMinItems;

    return {
      testCase,
      passed,
      itemsExtracted: extractedItems.length,
      extractedItems,
      extractionTime: totalTime,
      confidence,
      errors,
      warnings,
      phases,
    };
  }

  /**
   * Test CSV extraction
   */
  private async testCSVExtraction(
    buffer: Buffer,
    fileName: string,
    testCase: TestCase
  ): Promise<{
    items: ExtractedItem[];
    time: number;
    phases: PhaseResult[];
    warnings: string[];
  }> {
    const startTime = Date.now();
    const warnings: string[] = [];

    const input: CSVParserInput = {
      fileBuffer: buffer,
      fileName,
      language: 'auto',
    };

    const result: CSVParserOutput = await parseCSV(input);

    const items: ExtractedItem[] = result.items.map((item) => ({
      id: item.id || `csv-${Math.random().toString(36).substr(2, 9)}`,
      name: item.name || 'Unknown',
      type: (item.rawType?.toLowerCase().includes('service') ? 'service' : 'product') as 'product' | 'service',
      category: item.rawData?.category as string | undefined,
      description: item.description || undefined,
      confidence: result.confidence,
      vendor: item.owner || (item.rawData?.vendor as string | undefined),
      price: item.budget || (item.rawData?.price as number | undefined),
      metadata: item.rawData || undefined,
    }));

    if (result.extractionNotes) {
      warnings.push(...result.extractionNotes);
    }

    const phases: PhaseResult[] = [
      {
        phase: 'csv-parse',
        duration: result.processingTime,
        itemsCount: result.items.length,
        success: result.success,
      },
    ];

    return {
      items,
      time: Date.now() - startTime,
      phases,
      warnings,
    };
  }

  /**
   * Test PDF extraction using LLM (with persistent caching)
   */
  private async testPDFExtraction(
    buffer: Buffer,
    fileName: string,
    testCase: TestCase
  ): Promise<{
    items: ExtractedItem[];
    time: number;
    phases: PhaseResult[];
    warnings: string[];
  }> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Check cache first
    const fileHash = this.pdfCache.hashFile(buffer);
    const cached = this.pdfCache.get(fileHash);

    if (cached) {
      this.cacheHits++;
      console.log(`   💾 CACHE HIT - Using cached result (${cached.items.length} items)`);

      const phases: PhaseResult[] = [
        {
          phase: 'pdf-cache',
          duration: Date.now() - startTime,
          itemsCount: cached.items.length,
          success: true,
        },
      ];

      warnings.push('Result loaded from cache');

      return {
        items: cached.items,
        time: Date.now() - startTime,
        phases,
        warnings,
      };
    }

    // Cache miss - extract with LLM
    this.cacheMisses++;
    console.log(`   🔄 CACHE MISS - Extracting with LLM...`);

    const input: PDFParserInput = {
      fileBuffer: buffer,
      fileName,
      language: 'auto',
      userContext: 'Catalogo prodotti/servizi con righe tabellari. Estrai ogni riga come item.',
    };

    const result: PDFParserOutput = await parsePDF(input);

    const fallbackType: 'product' | 'service' =
      testCase.source.category === 'services' ? 'service' : 'product';

    const items: ExtractedItem[] = result.items.map((item, idx) => ({
      id: `pdf-${idx + 1}-${Math.random().toString(36).substr(2, 6)}`,
      name: item.name || 'Unknown',
      type: (item.rawType?.toLowerCase().includes('service') ? 'service' : fallbackType) as 'product' | 'service',
      category: (item.rawData as Record<string, unknown> | null | undefined)?.category as string | undefined,
      description: item.description || undefined,
      confidence: result.confidence,
      vendor: item.owner ||
        (item.rawData as Record<string, unknown> | null | undefined)?.vendor as string | undefined ||
        (item.rawData as Record<string, unknown> | null | undefined)?.provider as string | undefined,
      price: item.budget ||
        (item.rawData as Record<string, unknown> | null | undefined)?.price as number | undefined,
      metadata: item.rawData || undefined,
    }));

    // Store in cache for future runs
    this.pdfCache.set(fileHash, items, result.confidence, result.processingTime, result.extractionNotes);

    if (result.extractionNotes) {
      warnings.push(...result.extractionNotes);
    }

    const phases: PhaseResult[] = [
      {
        phase: 'pdf-parse',
        duration: result.processingTime,
        itemsCount: result.items.length,
        success: result.success,
      },
    ];

    if (result.chunksProcessed && result.chunksProcessed > 1) {
      warnings.push(`PDF processed in ${result.chunksProcessed} chunks`);
    }

    return {
      items,
      time: Date.now() - startTime,
      phases,
      warnings,
    };
  }

  /**
   * Test JSON extraction (from local catalogs)
   */
  private async testJSONExtraction(
    buffer: Buffer,
    fileName: string,
    testCase: TestCase
  ): Promise<{
    items: ExtractedItem[];
    time: number;
    phases: PhaseResult[];
  }> {
    const startTime = Date.now();

    try {
      const jsonData = JSON.parse(buffer.toString());

      // Handle different JSON structures
      let rawItems: any[] = [];
      let inferredType: 'product' | 'service' | null = null;

      if (Array.isArray(jsonData)) {
        rawItems = jsonData;
      } else if (jsonData.products) {
        rawItems = jsonData.products;
        inferredType = 'product';
      } else if (jsonData.services) {
        rawItems = jsonData.services;
        inferredType = 'service';
      } else if (jsonData.items) {
        rawItems = jsonData.items;
      } else if (jsonData.catalog) {
        rawItems = jsonData.catalog;
      } else {
        // Try to find array property
        for (const key of Object.keys(jsonData)) {
          if (Array.isArray(jsonData[key])) {
            rawItems = jsonData[key];
            if (key === 'services') inferredType = 'service';
            if (key === 'products') inferredType = 'product';
            break;
          }
        }
      }

      const fallbackType: 'product' | 'service' =
        inferredType || (testCase.source.category === 'services' ? 'service' : 'product');

      const items: ExtractedItem[] = rawItems.map((item, i) => ({
        id: item.id || item.sku || item.code || `json-${i}`,
        name: item.name || item.title || item.productName || item.displayName || `Item ${i + 1}`,
        type: (item.type?.toLowerCase().includes('service') ? 'service' : fallbackType) as 'product' | 'service',
        category: item.category || item.categoryName || item.productCategory,
        description: item.description || item.desc || item.summary,
        confidence: 1.0, // JSON is fully structured
        vendor: item.vendor || item.brand || item.manufacturer || item.company || item.provider,
        price: item.price || item.msrp || item.listPrice,
        metadata: item,
      }));

      const phases: PhaseResult[] = [
        {
          phase: 'json-parse',
          duration: Date.now() - startTime,
          itemsCount: items.length,
          success: true,
        },
      ];

      return {
        items,
        time: Date.now() - startTime,
        phases,
      };
    } catch (error) {
      return {
        items: [],
        time: Date.now() - startTime,
        phases: [
          {
            phase: 'json-parse',
            duration: Date.now() - startTime,
            itemsCount: 0,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Check required fields presence
   */
  private checkRequiredFields(items: ExtractedItem[], requiredFields: string[]): string[] {
    const missing: Set<string> = new Set();

    for (const item of items) {
      for (const field of requiredFields) {
        const value = (item as any)[field];
        if (value === undefined || value === null || value === '') {
          missing.add(field);
        }
      }
    }

    return Array.from(missing);
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  console.log('🔬 Extraction Tester - Run via runBatteryTests.ts');
}
