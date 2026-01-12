// backend/src/services/ingestion/index.ts
// Advanced Multi-Format Ingestion System for THEMIS
// Centralized exports

// Types
export * from './types';

// Format Detection
export {
  detectFormat,
  detectPdfType,
  detectFromContent,
  detectLanguage,
  getFormatFromExtension,
  detectEncoding,
} from './formatDetector';

// Schema Detection
export {
  detectSchema,
  parseSchemaResponse,
  inferTypeFromValues,
  fallbackSchemaDetection,
  detectDelimiter,
  normalizeColumnName,
  parseCSVLine,
} from './schemaDetector';

// Field Mapping
export {
  mapFields,
  batchMapFields,
  getSuggestedMappings,
  determineTransforms,
  FIELD_ALIASES,
  findExactAliasMatch,
  findFuzzyMatch,
} from './fieldMapper';

// Validation Engine
export {
  validateItem,
  validateBatch,
  createRulesFromSchema,
  applyTransform,
  DEFAULT_VALIDATION_RULES,
  normalizeEnumValue,
} from './validationEngine';

// Template Learning
export {
  findMatchingTemplate,
  saveTemplate,
  updateTemplate,
  recordCorrection,
  getTemplates,
  deleteTemplate,
  getCorrections,
  analyzePatterns,
} from './templateLearning';

// Deduplication
export {
  deduplicateItems,
  findPotentialDuplicates,
  checkForDuplicate,
  calculateItemSimilarity,
  calculateItemCompleteness,
  EXACT_DUPLICATE_THRESHOLD,
  HIGH_SIMILARITY_THRESHOLD,
  POTENTIAL_DUPLICATE_THRESHOLD,
} from './deduplicator';

// OCR Processing
export {
  processOCR,
  extractItemsFromOCRText,
  extractTableFromOCR,
  processMultiPageOCR,
  detectImageMimeType,
  buildOCRPrompt,
} from './ocrProcessor';

// String Utilities
export {
  levenshtein,
  similarity,
  jaroWinkler,
  normalizeForComparison,
  extractKeywords,
  escapeRegex,
  generateFilenamePattern,
  findBestMatch,
  cosineSimilarity,
} from './utils/stringUtils';

// Main ingestion orchestrator
import { detectFormat } from './formatDetector';
import { detectSchema } from './schemaDetector';
import { mapFields } from './fieldMapper';
import { validateBatch } from './validationEngine';
import { findMatchingTemplate, recordCorrection } from './templateLearning';
import { deduplicateItems } from './deduplicator';
import { processOCR, extractItemsFromOCRText } from './ocrProcessor';
import {
  ExtractionOptions,
  ExtractionResult,
  ExtractedItem,
  ExtractedField,
  FileFormat,
  ExtractionMethod,
} from './types';

/**
 * Main entry point for the ingestion system
 * Orchestrates the entire extraction pipeline
 */
export async function processIngestion(
  buffer: Buffer,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const startTime = Date.now();

  try {
    // 1. Detect format
    const detectedFormat = options.forceFormat
      ? { format: options.forceFormat, confidence: 1, mimeType: 'application/octet-stream', details: {} }
      : await detectFormat(buffer, options.filename);

    if (detectedFormat.format === 'unknown') {
      return {
        success: false,
        items: [],
        stats: { totalRows: 0, extractedItems: 0, skippedRows: 0, avgConfidence: 0, fieldsNeedingReview: [] },
        detectedFormat,
        detectedSchema: { columns: [], rowCount: 0, confidence: 0, suggestedItemType: 'mixed', extractionStrategy: 'llm_extraction' },
        errors: ['Unable to detect file format'],
        warnings: [],
      };
    }

    // 2. Handle OCR for scanned documents and images
    let content: string;
    let extractionMethod: ExtractionMethod = 'column_mapping';

    if (detectedFormat.format === 'pdf_scanned' || detectedFormat.format === 'image') {
      const ocrResult = await processOCR(buffer, {
        language: options.language === 'auto' ? 'auto' : options.language,
        extractItems: true,
      });

      if (ocrResult.confidence < 0.3) {
        warnings.push('Low OCR confidence, results may be inaccurate');
      }

      // For images/scanned PDFs, try direct item extraction
      const ocrItems = await extractItemsFromOCRText(ocrResult);
      if (ocrItems.length > 0) {
        const validationResult = options.validateResults !== false
          ? validateBatch(ocrItems)
          : { validItems: ocrItems, invalidItems: [], stats: { total: ocrItems.length, valid: ocrItems.length, invalid: 0, fixesApplied: 0 } };

        const finalItems = options.deduplicateResults !== false
          ? (await deduplicateItems(validationResult.validItems)).uniqueItems
          : validationResult.validItems;

        return {
          success: true,
          items: finalItems,
          stats: {
            totalRows: ocrItems.length,
            extractedItems: finalItems.length,
            skippedRows: validationResult.stats.invalid,
            avgConfidence: ocrResult.confidence,
            fieldsNeedingReview: finalItems.flatMap(i => i._extraction.fieldsNeedingReview),
          },
          detectedFormat,
          detectedSchema: { columns: [], rowCount: ocrItems.length, confidence: ocrResult.confidence, suggestedItemType: 'mixed', extractionStrategy: 'ocr_vision' },
          errors,
          warnings,
        };
      }

      content = ocrResult.text;
      extractionMethod = 'ocr_vision';
    } else {
      // For text-based formats, convert buffer to string
      content = buffer.toString(detectedFormat.encoding as BufferEncoding || 'utf-8');
    }

    // 3. Detect schema
    const detectedSchema = await detectSchema(content, detectedFormat.format);
    extractionMethod = detectedSchema.extractionStrategy;

    // 4. Find matching template
    const template = options.useTemplate
      ? undefined // TODO: Load specific template
      : await findMatchingTemplate(detectedSchema, options.filename, options.tenantId);

    // 5. Map fields
    const fieldMappings = await mapFields(detectedSchema.columns, template || undefined);

    // 6. Extract items
    const items = await extractItems(content, detectedFormat.format, detectedSchema, fieldMappings, extractionMethod, options);

    // 7. Validate items
    const validationResult = options.validateResults !== false
      ? validateBatch(items)
      : { validItems: items, invalidItems: [], stats: { total: items.length, valid: items.length, invalid: 0, fixesApplied: 0 } };

    if (validationResult.stats.invalid > 0) {
      warnings.push(`${validationResult.stats.invalid} items failed validation`);
    }

    // 8. Deduplicate
    const deduplicationResult = options.deduplicateResults !== false
      ? await deduplicateItems(validationResult.validItems)
      : { uniqueItems: validationResult.validItems, duplicates: [], stats: { totalItems: validationResult.validItems.length, uniqueItems: validationResult.validItems.length, duplicatesFound: 0, mergedItems: 0 } };

    if (deduplicationResult.stats.duplicatesFound > 0) {
      warnings.push(`${deduplicationResult.stats.duplicatesFound} duplicate items found and merged`);
    }

    // Calculate average confidence
    const avgConfidence = deduplicationResult.uniqueItems.length > 0
      ? deduplicationResult.uniqueItems.reduce((sum, item) => sum + (item._extraction.overallConfidence || 0), 0) / deduplicationResult.uniqueItems.length
      : 0;

    // Collect fields needing review
    const fieldsNeedingReview = Array.from(new Set(
      deduplicationResult.uniqueItems.flatMap(item => item._extraction.fieldsNeedingReview)
    ));

    return {
      success: true,
      items: deduplicationResult.uniqueItems,
      stats: {
        totalRows: detectedSchema.rowCount,
        extractedItems: deduplicationResult.uniqueItems.length,
        skippedRows: validationResult.stats.invalid,
        avgConfidence,
        fieldsNeedingReview,
      },
      detectedFormat,
      detectedSchema,
      appliedTemplate: template || undefined,
      errors,
      warnings,
    };
  } catch (error) {
    console.error('Ingestion processing failed:', error);
    return {
      success: false,
      items: [],
      stats: { totalRows: 0, extractedItems: 0, skippedRows: 0, avgConfidence: 0, fieldsNeedingReview: [] },
      detectedFormat: { format: 'unknown', confidence: 0, mimeType: 'application/octet-stream', details: {} },
      detectedSchema: { columns: [], rowCount: 0, confidence: 0, suggestedItemType: 'mixed', extractionStrategy: 'llm_extraction' },
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      warnings: [],
    };
  }
}

/**
 * Extract items from content based on detected schema and mappings
 */
async function extractItems(
  content: string,
  format: FileFormat,
  schema: import('./types').DetectedSchema,
  mappings: import('./types').FieldMapping[],
  method: ExtractionMethod,
  options: ExtractionOptions
): Promise<ExtractedItem[]> {
  const items: ExtractedItem[] = [];

  if (format === 'csv' || format === 'excel') {
    // Parse CSV/tabular data
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return items;

    // Get delimiter
    const delimiter = schema.columns.length > 0
      ? detectDelimiterFromContent(lines[0])
      : ',';

    // Skip header
    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length && (options.maxItems === undefined || items.length < options.maxItems); i++) {
      const row = parseRow(dataLines[i], delimiter);
      const item = createItemFromRow(row, schema.columns, mappings, options.filename, i + 2, method);

      if (item.name.value) {
        items.push(item);
      }
    }
  } else if (format === 'json') {
    try {
      const parsed = JSON.parse(content);
      const dataArray = Array.isArray(parsed) ? parsed : parsed.items || parsed.data || [parsed];

      for (let i = 0; i < dataArray.length && (options.maxItems === undefined || items.length < options.maxItems); i++) {
        const item = createItemFromObject(dataArray[i], mappings, options.filename, i, method);
        if (item.name.value) {
          items.push(item);
        }
      }
    } catch (error) {
      console.error('JSON parsing failed:', error);
    }
  }

  // For other formats or if column mapping didn't work, use LLM extraction
  if (items.length === 0 && method !== 'ocr_vision') {
    // TODO: Implement LLM-based extraction for unstructured text
  }

  return items;
}

function detectDelimiterFromContent(line: string): string {
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;

  if (tabs >= Math.max(commas, semicolons)) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function parseRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function createItemFromRow(
  row: string[],
  columns: import('./types').SchemaColumn[],
  mappings: import('./types').FieldMapping[],
  sourceFile: string,
  sourceRow: number,
  method: ExtractionMethod
): ExtractedItem {
  const item: Partial<ExtractedItem> = {
    _extraction: {
      sourceFile,
      sourceRow,
      method,
      overallConfidence: 0,
      fieldsNeedingReview: [],
    },
  };

  let totalConfidence = 0;
  let fieldCount = 0;

  for (const mapping of mappings) {
    const columnIndex = columns.findIndex(c => c.originalName === mapping.sourceColumn);
    if (columnIndex === -1 || columnIndex >= row.length) continue;

    let value: any = row[columnIndex];

    // Apply transforms
    if (mapping.transforms) {
      for (const transform of mapping.transforms) {
        value = applyTransformValue(value, transform);
      }
    }

    const field: ExtractedField = {
      value,
      confidence: mapping.confidence,
      source: 'explicit',
      extractionMethod: method,
      originalValue: row[columnIndex],
      needsReview: mapping.confidence < 0.7,
    };

    (item as any)[mapping.targetField] = field;
    totalConfidence += mapping.confidence;
    fieldCount++;

    if (mapping.confidence < 0.7) {
      item._extraction!.fieldsNeedingReview.push(mapping.targetField);
    }
  }

  // Ensure required fields
  if (!item.name) {
    item.name = {
      value: row[0] || '',
      confidence: 0.5,
      source: 'inferred',
      extractionMethod: method,
      needsReview: true,
    };
    item._extraction!.fieldsNeedingReview.push('name');
  }

  if (!item.type) {
    item.type = {
      value: 'product',
      confidence: 0.5,
      source: 'default',
      extractionMethod: method,
      needsReview: true,
    };
  }

  item._extraction!.overallConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0.5;

  return item as ExtractedItem;
}

function createItemFromObject(
  obj: Record<string, any>,
  mappings: import('./types').FieldMapping[],
  sourceFile: string,
  index: number,
  method: ExtractionMethod
): ExtractedItem {
  const item: Partial<ExtractedItem> = {
    _extraction: {
      sourceFile,
      sourceRow: index,
      method,
      overallConfidence: 0,
      fieldsNeedingReview: [],
    },
  };

  let totalConfidence = 0;
  let fieldCount = 0;

  for (const mapping of mappings) {
    let value = obj[mapping.sourceColumn];
    if (value === undefined) continue;

    // Apply transforms
    if (mapping.transforms) {
      for (const transform of mapping.transforms) {
        value = applyTransformValue(value, transform);
      }
    }

    const field: ExtractedField = {
      value,
      confidence: mapping.confidence,
      source: 'explicit',
      extractionMethod: method,
      originalValue: obj[mapping.sourceColumn],
      needsReview: mapping.confidence < 0.7,
    };

    (item as any)[mapping.targetField] = field;
    totalConfidence += mapping.confidence;
    fieldCount++;

    if (mapping.confidence < 0.7) {
      item._extraction!.fieldsNeedingReview.push(mapping.targetField);
    }
  }

  // Try to infer required fields from common object keys
  if (!item.name) {
    const nameValue = obj.name || obj.nome || obj.title || obj.titolo || obj.product || obj.prodotto || '';
    item.name = {
      value: nameValue,
      confidence: nameValue ? 0.8 : 0.3,
      source: nameValue ? 'inferred' : 'default',
      extractionMethod: method,
      needsReview: !nameValue,
    };
  }

  if (!item.type) {
    item.type = {
      value: 'product',
      confidence: 0.5,
      source: 'default',
      extractionMethod: method,
      needsReview: true,
    };
  }

  item._extraction!.overallConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0.5;

  return item as ExtractedItem;
}

function applyTransformValue(value: any, transform: import('./types').FieldTransform): any {
  // Re-use the applyTransform from validationEngine
  const { applyTransform } = require('./validationEngine');
  return applyTransform(value, transform);
}
