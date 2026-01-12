/**
 * Correction Learner - Active Learning from User Corrections
 *
 * This module learns from user corrections to extracted items and applies
 * learned patterns to future extractions. It provides:
 *
 * 1. Recording corrections when users edit extracted items
 * 2. Finding similar corrections using semantic similarity
 * 3. Applying learned corrections to new extractions
 * 4. Tracking correction patterns and confidence
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';

// ============================================================================
// TYPES
// ============================================================================

export interface CorrectionRecord {
  id?: string;
  tenant_id: string;
  original_extraction: Record<string, unknown>;
  corrected_item: Record<string, unknown>;
  corrected_fields: string[];
  item_name: string;
  item_name_embedding?: number[];
  source_type?: string;
  extraction_context?: Record<string, unknown>;
  created_at?: Date;
}

export interface FieldCorrection {
  field: string;
  from: unknown;
  to: unknown;
}

export interface SimilarCorrection {
  id: string;
  original_extraction: Record<string, unknown>;
  corrected_item: Record<string, unknown>;
  corrected_fields: string[];
  item_name: string;
  similarity: number;
}

export interface LearnedSuggestion {
  field: string;
  suggested_value: unknown;
  confidence: number;
  learned_from: string[];
  pattern_count: number;
}

export interface LearningStats {
  total_corrections: number;
  unique_fields_corrected: string[];
  most_corrected_fields: Array<{ field: string; count: number }>;
  avg_corrections_per_item: number;
}

// ============================================================================
// CORRECTION LEARNER CLASS
// ============================================================================

export class CorrectionLearner {
  private supabase: SupabaseClient;
  private embeddings: OpenAIEmbeddings | null = null;
  private initialized = false;

  constructor(
    private options: {
      supabaseUrl?: string;
      supabaseKey?: string;
      similarityThreshold?: number;
      minPatternOccurrences?: number;
    } = {}
  ) {
    this.options.similarityThreshold ??= 0.85;
    this.options.minPatternOccurrences ??= 2;

    // Initialize Supabase client
    const url = options.supabaseUrl || process.env.SUPABASE_URL;
    const key = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn('CorrectionLearner: Supabase credentials not configured');
      this.supabase = null as any;
    } else {
      this.supabase = createClient(url, key);
    }

    // Initialize embeddings
    if (process.env.OPENAI_API_KEY) {
      this.embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small'
      });
    }
  }

  /**
   * Check if the learner is properly configured
   */
  isEnabled(): boolean {
    return this.supabase !== null && this.embeddings !== null;
  }

  /**
   * Record a user correction for learning
   */
  async recordCorrection(
    tenantId: string,
    original: Record<string, unknown>,
    corrected: Record<string, unknown>,
    context?: {
      sourceType?: string;
      extractionContext?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; correctedFields: string[] }> {
    if (!this.supabase) {
      return { success: false, correctedFields: [] };
    }

    // Detect which fields were changed
    const correctedFields = this.detectChanges(original, corrected);

    if (correctedFields.length === 0) {
      return { success: true, correctedFields: [] };
    }

    const itemName = (corrected.name as string) || '';

    // Generate embedding for similarity search
    let embedding: number[] | null = null;
    if (this.embeddings && itemName) {
      try {
        [embedding] = await this.embeddings.embedDocuments([itemName]);
      } catch (error) {
        console.warn('Failed to generate embedding for correction:', error);
      }
    }

    // Build field corrections array
    const fieldCorrections: FieldCorrection[] = correctedFields.map(field => ({
      field,
      from: original[field],
      to: corrected[field]
    }));

    // Insert into database
    try {
      const { error } = await this.supabase.from('ingestion_corrections').insert({
        tenant_id: tenantId,
        original_extraction: original,
        corrected_item: corrected,
        corrected_fields: correctedFields,
        field_corrections: fieldCorrections,
        item_name: itemName,
        item_name_embedding: embedding,
        source_type: context?.sourceType,
        extraction_context: context?.extractionContext
      });

      if (error) {
        console.error('Failed to record correction:', error);
        return { success: false, correctedFields };
      }

      console.log(`   Learned ${correctedFields.length} corrections for "${itemName}"`);

      // Update learned transformation rules
      await this.updateTransformationRules(tenantId, fieldCorrections);

      return { success: true, correctedFields };
    } catch (error) {
      console.error('Failed to record correction:', error);
      return { success: false, correctedFields };
    }
  }

  /**
   * Find similar corrections using semantic similarity
   */
  async findSimilarCorrections(
    tenantId: string,
    itemName: string,
    limit: number = 5
  ): Promise<SimilarCorrection[]> {
    if (!this.supabase || !this.embeddings || !itemName) {
      return [];
    }

    try {
      // Generate embedding for the item
      const [queryEmbedding] = await this.embeddings.embedDocuments([itemName]);

      // Use the match_corrections RPC function
      const { data, error } = await this.supabase.rpc('match_corrections', {
        p_tenant_id: tenantId,
        p_query_embedding: queryEmbedding,
        p_threshold: this.options.similarityThreshold,
        p_limit: limit
      });

      if (error) {
        console.warn('Failed to find similar corrections:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        original_extraction: row.original_extraction,
        corrected_item: row.corrected_item,
        corrected_fields: row.corrected_fields,
        item_name: row.item_name,
        similarity: row.similarity
      }));
    } catch (error) {
      console.warn('Failed to find similar corrections:', error);
      return [];
    }
  }

  /**
   * Apply learned corrections to an item
   */
  async applyLearnedCorrections(
    tenantId: string,
    item: Record<string, unknown>
  ): Promise<{
    suggestions: LearnedSuggestion[];
    appliedFields: Record<string, unknown>;
  }> {
    const suggestions: LearnedSuggestion[] = [];
    const appliedFields: Record<string, unknown> = {};

    const itemName = (item.name as string) || '';

    // Strategy 1: Find similar items that were corrected
    const similarCorrections = await this.findSimilarCorrections(tenantId, itemName);

    if (similarCorrections.length > 0) {
      const patterns = this.analyzePatterns(similarCorrections);

      for (const pattern of patterns) {
        // Only suggest if we have enough occurrences and high confidence
        if (
          pattern.occurrence_count >= this.options.minPatternOccurrences! &&
          pattern.confidence >= 0.7
        ) {
          suggestions.push({
            field: pattern.field,
            suggested_value: pattern.most_common_value,
            confidence: pattern.confidence,
            learned_from: pattern.source_items,
            pattern_count: pattern.occurrence_count
          });

          // Auto-apply if very high confidence and field is empty
          if (pattern.confidence >= 0.9 && !item[pattern.field]) {
            appliedFields[pattern.field] = pattern.most_common_value;
          }
        }
      }
    }

    // Strategy 2: Apply learned transformation rules
    const rules = await this.getActiveRules(tenantId);

    for (const rule of rules) {
      const currentValue = item[rule.field_name];

      // Check if the current value matches the rule's from_value
      if (
        this.valuesMatch(currentValue, rule.from_value) &&
        rule.confidence >= 0.7
      ) {
        const existingSuggestion = suggestions.find(s => s.field === rule.field_name);

        if (!existingSuggestion) {
          suggestions.push({
            field: rule.field_name,
            suggested_value: rule.to_value,
            confidence: rule.confidence,
            learned_from: [`rule:${rule.id}`],
            pattern_count: rule.occurrence_count
          });

          // Auto-apply high-confidence rules
          if (rule.confidence >= 0.9) {
            appliedFields[rule.field_name] = rule.to_value;
          }
        }
      }
    }

    return { suggestions, appliedFields };
  }

  /**
   * Get learning statistics for a tenant
   */
  async getStats(tenantId: string): Promise<LearningStats> {
    if (!this.supabase) {
      return {
        total_corrections: 0,
        unique_fields_corrected: [],
        most_corrected_fields: [],
        avg_corrections_per_item: 0
      };
    }

    try {
      const { data, error } = await this.supabase
        .from('ingestion_corrections')
        .select('corrected_fields')
        .eq('tenant_id', tenantId);

      if (error || !data) {
        return {
          total_corrections: 0,
          unique_fields_corrected: [],
          most_corrected_fields: [],
          avg_corrections_per_item: 0
        };
      }

      // Count field occurrences
      const fieldCounts: Record<string, number> = {};
      let totalFields = 0;

      for (const row of data) {
        const fields = row.corrected_fields || [];
        for (const field of fields) {
          fieldCounts[field] = (fieldCounts[field] || 0) + 1;
          totalFields++;
        }
      }

      const sortedFields = Object.entries(fieldCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([field, count]) => ({ field, count }));

      return {
        total_corrections: data.length,
        unique_fields_corrected: Object.keys(fieldCounts),
        most_corrected_fields: sortedFields.slice(0, 10),
        avg_corrections_per_item: data.length > 0 ? totalFields / data.length : 0
      };
    } catch (error) {
      console.error('Failed to get correction stats:', error);
      return {
        total_corrections: 0,
        unique_fields_corrected: [],
        most_corrected_fields: [],
        avg_corrections_per_item: 0
      };
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Detect which fields were changed between original and corrected
   */
  private detectChanges(
    original: Record<string, unknown>,
    corrected: Record<string, unknown>
  ): string[] {
    const changedFields: string[] = [];
    const allKeys = new Set([...Object.keys(original), ...Object.keys(corrected)]);

    // Fields to ignore when tracking changes
    const ignoreFields = new Set([
      'id',
      'created_at',
      'updated_at',
      '_enrichment',
      '_confidence_overall',
      'normalizationNotes',
      'extraction_context'
    ]);

    for (const key of allKeys) {
      if (ignoreFields.has(key)) continue;

      const originalValue = original[key];
      const correctedValue = corrected[key];

      // Check if values are different (handle null/undefined equality)
      if (!this.valuesEqual(originalValue, correctedValue)) {
        // Only track if there's a meaningful change
        if (correctedValue !== null && correctedValue !== undefined && correctedValue !== '') {
          changedFields.push(key);
        }
      }
    }

    return changedFields;
  }

  /**
   * Check if two values are equal (handling null/undefined)
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    // Both null/undefined/empty
    if ((a === null || a === undefined || a === '') &&
        (b === null || b === undefined || b === '')) {
      return true;
    }

    // Arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      return JSON.stringify(a.sort()) === JSON.stringify(b.sort());
    }

    // Objects
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    // Primitives
    return a === b;
  }

  /**
   * Check if a value matches a rule pattern
   */
  private valuesMatch(value: unknown, pattern: string): boolean {
    if (value === null || value === undefined) {
      return pattern === '' || pattern === 'null' || pattern === 'undefined';
    }

    const strValue = String(value).toLowerCase().trim();
    const strPattern = pattern.toLowerCase().trim();

    return strValue === strPattern || strValue.includes(strPattern);
  }

  /**
   * Analyze correction patterns to find common corrections
   */
  private analyzePatterns(corrections: SimilarCorrection[]): Array<{
    field: string;
    most_common_value: unknown;
    confidence: number;
    occurrence_count: number;
    source_items: string[];
  }> {
    const fieldPatterns: Record<string, {
      values: Array<{ value: unknown; item: string; similarity: number }>;
    }> = {};

    // Group corrections by field
    for (const correction of corrections) {
      for (const field of correction.corrected_fields) {
        if (!fieldPatterns[field]) {
          fieldPatterns[field] = { values: [] };
        }

        const correctedValue = correction.corrected_item[field];
        fieldPatterns[field].values.push({
          value: correctedValue,
          item: correction.item_name,
          similarity: correction.similarity
        });
      }
    }

    // Analyze each field's patterns
    const patterns: Array<{
      field: string;
      most_common_value: unknown;
      confidence: number;
      occurrence_count: number;
      source_items: string[];
    }> = [];

    for (const [field, data] of Object.entries(fieldPatterns)) {
      // Count value occurrences
      const valueCounts = new Map<string, {
        value: unknown;
        count: number;
        totalSimilarity: number;
        items: string[];
      }>();

      for (const entry of data.values) {
        const key = JSON.stringify(entry.value);
        const existing = valueCounts.get(key);

        if (existing) {
          existing.count++;
          existing.totalSimilarity += entry.similarity;
          existing.items.push(entry.item);
        } else {
          valueCounts.set(key, {
            value: entry.value,
            count: 1,
            totalSimilarity: entry.similarity,
            items: [entry.item]
          });
        }
      }

      // Find most common value
      let mostCommon = { value: null as unknown, count: 0, avgSimilarity: 0, items: [] as string[] };

      for (const [, countData] of valueCounts) {
        if (countData.count > mostCommon.count) {
          mostCommon = {
            value: countData.value,
            count: countData.count,
            avgSimilarity: countData.totalSimilarity / countData.count,
            items: countData.items
          };
        }
      }

      if (mostCommon.count > 0) {
        // Calculate confidence based on occurrence rate and similarity
        const occurrenceRate = mostCommon.count / data.values.length;
        const confidence = occurrenceRate * mostCommon.avgSimilarity;

        patterns.push({
          field,
          most_common_value: mostCommon.value,
          confidence,
          occurrence_count: mostCommon.count,
          source_items: mostCommon.items
        });
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Update learned transformation rules based on new corrections
   */
  private async updateTransformationRules(
    tenantId: string,
    fieldCorrections: FieldCorrection[]
  ): Promise<void> {
    if (!this.supabase) return;

    for (const correction of fieldCorrections) {
      const fromValue = String(correction.from ?? '').trim();
      const toValue = String(correction.to ?? '').trim();

      if (!fromValue || !toValue || fromValue === toValue) continue;

      try {
        // Try to update existing rule
        const { data: existing } = await this.supabase
          .from('learned_transformation_rules')
          .select('id, occurrence_count, confidence')
          .eq('tenant_id', tenantId)
          .eq('field_name', correction.field)
          .eq('from_value', fromValue)
          .single();

        if (existing) {
          // Update existing rule
          const newCount = existing.occurrence_count + 1;
          const newConfidence = Math.min(0.95, existing.confidence + 0.05);

          await this.supabase
            .from('learned_transformation_rules')
            .update({
              to_value: toValue,
              occurrence_count: newCount,
              confidence: newConfidence
            })
            .eq('id', existing.id);
        } else {
          // Insert new rule
          await this.supabase.from('learned_transformation_rules').insert({
            tenant_id: tenantId,
            field_name: correction.field,
            from_value: fromValue,
            to_value: toValue,
            occurrence_count: 1,
            confidence: 0.5
          });
        }
      } catch (error) {
        // Ignore unique constraint violations (race condition)
        if (!String(error).includes('unique constraint')) {
          console.warn('Failed to update transformation rule:', error);
        }
      }
    }
  }

  /**
   * Get active transformation rules for a tenant
   */
  private async getActiveRules(tenantId: string): Promise<Array<{
    id: string;
    field_name: string;
    from_value: string;
    to_value: string;
    confidence: number;
    occurrence_count: number;
  }>> {
    if (!this.supabase) return [];

    try {
      const { data, error } = await this.supabase
        .from('learned_transformation_rules')
        .select('id, field_name, from_value, to_value, confidence, occurrence_count')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(100);

      if (error) {
        console.warn('Failed to get transformation rules:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn('Failed to get transformation rules:', error);
      return [];
    }
  }
}

// Singleton instance
let learnerInstance: CorrectionLearner | null = null;

export function getCorrectionLearner(
  options?: ConstructorParameters<typeof CorrectionLearner>[0]
): CorrectionLearner {
  if (!learnerInstance) {
    learnerInstance = new CorrectionLearner(options);
  }
  return learnerInstance;
}

export default CorrectionLearner;
