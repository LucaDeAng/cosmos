/**
 * Batch Learner
 *
 * Learns patterns from entire correction sessions:
 * - Analyzes all corrections in a batch
 * - Detects recurring patterns
 * - Auto-updates extraction templates
 * - Adjusts confidence progressively
 */

import { v4 as uuidv4 } from 'uuid';
import type { NormalizedItem } from '../../agents/subagents/ingestion/normalizerAgent';

// ============================================================================
// TYPES
// ============================================================================

export interface BatchLearningSession {
  id: string;
  tenantId: string;
  batchId: string;
  startedAt: Date;
  completedAt?: Date;
  itemCount: number;
  correctionCount: number;
  patterns: LearnedPattern[];
  templateUpdates: TemplateUpdate[];
  confidenceAdjustments: ConfidenceAdjustment[];
}

export interface LearnedPattern {
  patternType: 'field_mapping' | 'value_transform' | 'type_classification' | 'validation_rule';
  pattern: Record<string, unknown>;
  occurrenceCount: number;
  confidence: number;
  applicableContext: string[];
  examples: Array<{ before: unknown; after: unknown }>;
}

export interface TemplateUpdate {
  templateId: string;
  updateType: 'mapping_added' | 'mapping_modified' | 'default_added' | 'accuracy_updated';
  before: unknown;
  after: unknown;
  reasoning: string;
}

export interface ConfidenceAdjustment {
  field: string;
  contextSignature: string;
  previousConfidence: number;
  newConfidence: number;
  adjustmentReason: string;
  wasCorrect: boolean;
}

export interface FieldCorrection {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  itemName: string;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class BatchLearner {
  private readonly MIN_PATTERN_OCCURRENCES = 3;

  /**
   * Processes corrections from a batch and learns patterns
   */
  async processBatchCorrections(
    tenantId: string,
    batchId: string,
    originalItems: NormalizedItem[],
    correctedItems: NormalizedItem[]
  ): Promise<BatchLearningSession> {
    console.log(`📚 Processing batch corrections: ${batchId} for tenant ${tenantId}`);

    const session: BatchLearningSession = {
      id: uuidv4(),
      tenantId,
      batchId,
      startedAt: new Date(),
      itemCount: originalItems.length,
      correctionCount: 0,
      patterns: [],
      templateUpdates: [],
      confidenceAdjustments: [],
    };

    // Step 1: Extract all corrections
    const allCorrections = this.extractAllCorrections(originalItems, correctedItems);
    session.correctionCount = allCorrections.length;

    if (allCorrections.length === 0) {
      console.log('  ℹ️ No corrections found in batch');
      session.completedAt = new Date();
      return session;
    }

    // Step 2: Detect patterns
    const patterns = this.detectPatterns(allCorrections);
    session.patterns = patterns;

    console.log(`  ✅ Detected ${patterns.length} patterns from ${allCorrections.length} corrections`);

    // Step 3: Generate template updates
    const templateUpdates = this.generateTemplateUpdates(patterns, tenantId);
    session.templateUpdates = templateUpdates;

    // Step 4: Calculate confidence adjustments
    const confidenceAdj = this.calculateConfidenceAdjustments(allCorrections, originalItems);
    session.confidenceAdjustments = confidenceAdj;

    session.completedAt = new Date();

    // TODO: Persist session to database
    return session;
  }

  /**
   * Extracts all field-level corrections from batch
   */
  private extractAllCorrections(
    originalItems: NormalizedItem[],
    correctedItems: NormalizedItem[]
  ): FieldCorrection[] {
    const corrections: FieldCorrection[] = [];

    for (let i = 0; i < Math.min(originalItems.length, correctedItems.length); i++) {
      const original = originalItems[i];
      const corrected = correctedItems[i];

      // Compare each field
      const fields = Object.keys(corrected) as Array<keyof NormalizedItem>;

      for (const field of fields) {
        const fieldStr = String(field);
        if (fieldStr.startsWith('_')) continue; // Skip metadata

        const originalValue = original[field];
        const correctedValue = corrected[field];

        // Detect change
        if (JSON.stringify(originalValue) !== JSON.stringify(correctedValue)) {
          corrections.push({
            field: fieldStr,
            originalValue,
            correctedValue,
            itemName: corrected.name,
          });
        }
      }
    }

    return corrections;
  }

  /**
   * Detects recurring patterns in corrections
   */
  private detectPatterns(corrections: FieldCorrection[]): LearnedPattern[] {
    const patterns: LearnedPattern[] = [];

    // Group corrections by field
    const byField = new Map<string, FieldCorrection[]>();

    for (const correction of corrections) {
      const existing = byField.get(correction.field) || [];
      existing.push(correction);
      byField.set(correction.field, existing);
    }

    // Analyze each field
    for (const [field, fieldCorrections] of byField.entries()) {
      // Detect value transformation patterns
      const transformPatterns = this.detectTransformPatterns(field, fieldCorrections);
      patterns.push(...transformPatterns);

      // Detect type classification patterns
      if (field === 'type') {
        const typePatterns = this.detectTypeClassificationPatterns(fieldCorrections);
        patterns.push(...typePatterns);
      }
    }

    // Filter patterns by occurrence count
    return patterns.filter(p => p.occurrenceCount >= this.MIN_PATTERN_OCCURRENCES);
  }

  /**
   * Detects value transformation patterns (e.g., "Active" → "active")
   */
  private detectTransformPatterns(
    field: string,
    corrections: FieldCorrection[]
  ): LearnedPattern[] {
    const patterns: LearnedPattern[] = [];

    // Group by transformation
    const transformMap = new Map<string, FieldCorrection[]>();

    for (const correction of corrections) {
      const key = `${correction.originalValue} → ${correction.correctedValue}`;
      const existing = transformMap.get(key) || [];
      existing.push(correction);
      transformMap.set(key, existing);
    }

    // Create patterns for common transformations
    for (const [transformKey, occurrences] of transformMap.entries()) {
      if (occurrences.length >= this.MIN_PATTERN_OCCURRENCES) {
        const [original, corrected] = transformKey.split(' → ');

        patterns.push({
          patternType: 'value_transform',
          pattern: {
            field,
            from: original,
            to: corrected,
          },
          occurrenceCount: occurrences.length,
          confidence: Math.min(0.95, 0.7 + (occurrences.length * 0.05)),
          applicableContext: [field],
          examples: occurrences.slice(0, 3).map(c => ({
            before: c.originalValue,
            after: c.correctedValue,
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Detects type classification patterns
   */
  private detectTypeClassificationPatterns(
    corrections: FieldCorrection[]
  ): LearnedPattern[] {
    const patterns: LearnedPattern[] = [];

    // Count corrections by type
    const typeCounts = new Map<string, number>();

    for (const correction of corrections) {
      const type = String(correction.correctedValue);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    // If strong bias towards one type (>70%), create pattern
    const total = corrections.length;
    for (const [type, count] of typeCounts.entries()) {
      const ratio = count / total;

      if (ratio > 0.7) {
        patterns.push({
          patternType: 'type_classification',
          pattern: {
            preferredType: type,
            ratio,
          },
          occurrenceCount: count,
          confidence: ratio,
          applicableContext: ['type'],
          examples: corrections.filter(c => c.correctedValue === type).slice(0, 3).map(c => ({
            before: c.originalValue,
            after: c.correctedValue,
          })),
        });
      }
    }

    return patterns;
  }

  /**
   * Generates template updates from patterns
   */
  private generateTemplateUpdates(
    patterns: LearnedPattern[],
    tenantId: string
  ): TemplateUpdate[] {
    const updates: TemplateUpdate[] = [];

    for (const pattern of patterns) {
      if (pattern.patternType === 'value_transform' && pattern.confidence >= 0.8) {
        updates.push({
          templateId: `${tenantId}-transform`,
          updateType: 'mapping_modified',
          before: pattern.pattern.from,
          after: pattern.pattern.to,
          reasoning: `Detected recurring transformation (${pattern.occurrenceCount} times) with ${(pattern.confidence * 100).toFixed(0)}% confidence`,
        });
      }
    }

    return updates;
  }

  /**
   * Calculates confidence adjustments based on accuracy
   */
  private calculateConfidenceAdjustments(
    corrections: FieldCorrection[],
    originalItems: NormalizedItem[]
  ): ConfidenceAdjustment[] {
    const adjustments: ConfidenceAdjustment[] = [];

    // Group by field
    const byField = new Map<string, FieldCorrection[]>();

    for (const correction of corrections) {
      const existing = byField.get(correction.field) || [];
      existing.push(correction);
      byField.set(correction.field, existing);
    }

    // Calculate field accuracy
    for (const [field, fieldCorrections] of byField.entries()) {
      const totalItems = originalItems.length;
      const correctionRate = fieldCorrections.length / totalItems;

      // If correction rate is high (>50%), decrease confidence
      if (correctionRate > 0.5) {
        adjustments.push({
          field,
          contextSignature: 'batch',
          previousConfidence: 0.8, // Would come from actual field confidence
          newConfidence: Math.max(0.3, 0.8 - (correctionRate * 0.3)),
          adjustmentReason: `High correction rate: ${(correctionRate * 100).toFixed(0)}% of items corrected`,
          wasCorrect: false,
        });
      }
      // If correction rate is low (<10%), increase confidence
      else if (correctionRate < 0.1) {
        adjustments.push({
          field,
          contextSignature: 'batch',
          previousConfidence: 0.7,
          newConfidence: Math.min(0.95, 0.7 + ((1 - correctionRate) * 0.1)),
          adjustmentReason: `Low correction rate: ${(correctionRate * 100).toFixed(0)}% of items corrected`,
          wasCorrect: true,
        });
      }
    }

    return adjustments;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default BatchLearner;
