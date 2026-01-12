/**
 * Enhanced Ingestion Orchestrator
 *
 * Extends the base ingestion orchestrator with advanced features:
 * - Document pre-processing
 * - Advanced table recognition
 * - Semantic field mapping
 * - Cross-item validation
 * - Batch learning
 * - Confidence tracking
 */

import { ingestData, type IngestionInput, type IngestionOutput } from './dataIngestionOrchestrator';
import { preprocessDocuments, type PreProcessingOutput } from '../../services/ingestion/documentPreProcessor';
import { validateCrossItem } from '../../services/ingestion/crossItemValidator';
import { BatchLearner } from '../../services/ingestion/batchLearner';
import { ConfidenceMetricsService } from '../../services/confidenceMetricsService';
import type { NormalizedItem } from './ingestion/normalizerAgent';

// ============================================================================
// ENHANCED INPUT/OUTPUT
// ============================================================================

export interface EnhancedIngestionInput extends IngestionInput {
  enablePreProcessing?: boolean;
  enableCrossItemValidation?: boolean;
  enableConfidenceTracking?: boolean;
  existingItems?: NormalizedItem[]; // For duplicate detection
}

export interface EnhancedIngestionOutput extends IngestionOutput {
  preProcessing?: PreProcessingOutput;
  crossItemValidation?: {
    valid: boolean;
    relationshipsDetected: number;
    inconsistenciesFound: number;
    duplicatesFound: number;
  };
  confidenceMetrics?: {
    avgOverallConfidence: number;
    lowConfidenceItems: number;
    qualityGateViolations: number;
  };
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Enhanced ingestion with all advanced features
 */
export async function ingestDataEnhanced(
  input: EnhancedIngestionInput
): Promise<EnhancedIngestionOutput> {
  console.log('🚀 Starting enhanced data ingestion...');

  const result: EnhancedIngestionOutput = {
    success: false,
    requestId: `enhanced-${Date.now()}`,
    parsing: { results: [], totalRawItems: 0, totalProcessingTime: 0 },
    normalization: {
      items: [],
      stats: {
        totalInput: 0,
        totalNormalized: 0,
        byType: { products: 0, services: 0 },
        avgConfidence: 0,
      },
      processingTime: 0,
    },
    summary: {
      filesProcessed: 0,
      textProcessed: false,
      totalItemsExtracted: 0,
      totalItemsNormalized: 0,
      overallConfidence: 0,
      totalProcessingTime: 0,
    },
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Document Pre-Processing (if enabled and files provided)
    if (input.enablePreProcessing !== false && input.files && input.files.length > 0) {
      console.log('📋 Step 1: Document pre-processing...');

      const preProcessingInput = {
        documents: input.files.map(file => ({
          id: file.id,
          filename: file.fileName,
          buffer: file.buffer,
        })),
        tenantId: input.tenantId,
      };

      const preProcessing = await preprocessDocuments(preProcessingInput);
      result.preProcessing = preProcessing;

      // Log pre-processing insights
      console.log(
        `  ✅ Pre-processing complete: ${preProcessing.summary.documentsWithTables} docs with tables, ` +
        `${preProcessing.summary.documentsWithClearStructure} with clear structure`
      );

      // Add warnings based on extraction plans
      for (const docResult of preProcessing.results) {
        if (docResult.extractionPlan.strategy === 'skip_document') {
          result.warnings.push(
            `Document "${docResult.filename}" marked for skip: ${docResult.extractionPlan.reasoning}`
          );
        }
      }
    }

    // Step 2: Standard ingestion (parsing + normalization)
    console.log('📊 Step 2: Standard ingestion...');
    const baseResult = await ingestData(input);

    // Merge base result
    result.parsing = baseResult.parsing;
    result.normalization = baseResult.normalization;
    result.summary = baseResult.summary;
    result.errors = baseResult.errors;
    result.warnings = [...result.warnings, ...baseResult.warnings];
    result.success = baseResult.success;

    if (!baseResult.success || result.normalization.items.length === 0) {
      console.log('⚠️ Base ingestion failed or no items extracted');
      return result;
    }

    // Step 3: Cross-Item Validation (if enabled)
    if (input.enableCrossItemValidation !== false) {
      console.log('🔍 Step 3: Cross-item validation...');

      const validationResult = await validateCrossItem(
        result.normalization.items,
        {
          tenantId: input.tenantId,
          existingItems: input.existingItems,
        }
      );

      result.crossItemValidation = {
        valid: validationResult.valid,
        relationshipsDetected: validationResult.relationships.length,
        inconsistenciesFound: validationResult.inconsistencies.length,
        duplicatesFound: validationResult.duplicates.length,
      };

      console.log(
        `  ✅ Validation complete: ${validationResult.relationships.length} relationships, ` +
        `${validationResult.inconsistencies.length} inconsistencies, ` +
        `${validationResult.duplicates.length} duplicates`
      );

      // Add validation warnings
      for (const inconsistency of validationResult.inconsistencies.filter(i => i.severity === 'error')) {
        result.errors.push(inconsistency.description);
      }

      for (const inconsistency of validationResult.inconsistencies.filter(i => i.severity === 'warning')) {
        result.warnings.push(inconsistency.description);
      }
    }

    // Step 4: Confidence Tracking (if enabled)
    if (input.enableConfidenceTracking !== false) {
      console.log('📈 Step 4: Confidence tracking...');

      const metricsService = new ConfidenceMetricsService();
      const batchId = result.requestId;

      let lowConfidenceCount = 0;
      let qualityGateViolations = 0;

      for (const item of result.normalization.items) {
        const itemMetrics = {
          itemId: item.id,
          batchId,
          overallConfidence: item.confidence,
          fieldConfidences: extractFieldConfidences(item),
          enrichmentSources: [],
          qualityIndicators: {
            sourceClarity: 0.8,
            ragMatch: 0.75,
            schemaFit: 0.85,
            validationScore: 0.9,
            duplicateRisk: 0.1,
          },
        };

        if (item.confidence < 0.6) {
          lowConfidenceCount++;
        }

        if (item.confidence < 0.5) {
          qualityGateViolations++;
        }

        await metricsService.recordItemConfidence(
          input.tenantId,
          batchId,
          itemMetrics
        );
      }

      result.confidenceMetrics = {
        avgOverallConfidence: result.normalization.stats.avgConfidence,
        lowConfidenceItems: lowConfidenceCount,
        qualityGateViolations,
      };

      console.log(
        `  ✅ Confidence tracking complete: ${lowConfidenceCount} low-confidence items, ` +
        `${qualityGateViolations} quality gate violations`
      );
    }

    console.log('✅ Enhanced ingestion complete!');

    return result;
  } catch (error) {
    console.error('❌ Enhanced ingestion error:', error);
    result.success = false;
    result.errors.push(`Enhanced ingestion failed: ${error}`);
    return result;
  }
}

// ============================================================================
// BATCH LEARNING FUNCTION
// ============================================================================

/**
 * Processes corrections from a batch and learns patterns
 */
export async function processBatchLearning(
  tenantId: string,
  batchId: string,
  originalItems: NormalizedItem[],
  correctedItems: NormalizedItem[]
): Promise<void> {
  console.log('📚 Processing batch learning...');

  const learner = new BatchLearner();
  const session = await learner.processBatchCorrections(
    tenantId,
    batchId,
    originalItems,
    correctedItems
  );

  console.log(
    `✅ Batch learning complete: ${session.patterns.length} patterns detected, ` +
    `${session.templateUpdates.length} template updates, ` +
    `${session.confidenceAdjustments.length} confidence adjustments`
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extracts field-level confidence from item
 */
function extractFieldConfidences(item: NormalizedItem): Record<string, any> {
  const confidences: Record<string, any> = {};

  const fields = ['name', 'type', 'category', 'vendor', 'status', 'priority'];

  for (const field of fields) {
    if (item[field as keyof NormalizedItem]) {
      confidences[field] = {
        field,
        confidence: item.confidence, // Would be field-specific in real impl
        source: 'extracted',
        needsReview: item.confidence < 0.6,
      };
    }
  }

  return confidences;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  ingestDataEnhanced,
  processBatchLearning,
};
