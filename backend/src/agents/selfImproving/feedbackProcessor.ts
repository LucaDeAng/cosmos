/**
 * Feedback Processor Service
 * 
 * Processes user feedback on extractions to learn from corrections
 * and improve future extraction accuracy.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  ExtractionFeedback,
  FeedbackBatch,
  FeedbackProcessingResult,
  FeedbackStats,
  FeedbackType,
  LearnedPattern,
  MetricsPeriod,
  IFeedbackProcessor,
  DbExtractionFeedback
} from './types';
import { getPatternLearner } from './patternLearner';

// ============================================================================
// Configuration
// ============================================================================

interface FeedbackProcessorConfig {
  batchSize: number;
  processingIntervalMs: number;
  minFeedbacksForPattern: number;
  correctionWeight: number;
  approvalWeight: number;
  rejectionWeight: number;
}

const DEFAULT_CONFIG: FeedbackProcessorConfig = {
  batchSize: 50,
  processingIntervalMs: 60000, // 1 minute
  minFeedbacksForPattern: 3,
  correctionWeight: 2.0,
  approvalWeight: 1.0,
  rejectionWeight: -1.5
};

// ============================================================================
// Feedback Processor Implementation
// ============================================================================

export class FeedbackProcessor implements IFeedbackProcessor {
  private supabase: SupabaseClient;
  private config: FeedbackProcessorConfig;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<FeedbackProcessorConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Core Feedback Methods
  // ==========================================================================

  /**
   * Submit new feedback
   */
  async submitFeedback(feedback: Omit<ExtractionFeedback, 'id' | 'timestamp' | 'processed' | 'patternGenerated'>): Promise<void> {
    console.log(`[FeedbackProcessor] Submitting feedback for extraction ${feedback.extractionId}`);

    const dbFeedback: Omit<DbExtractionFeedback, 'id'> = {
      extraction_id: feedback.extractionId,
      item_index: feedback.itemIndex,
      feedback_type: feedback.feedbackType,
      original_value: feedback.originalValue,
      corrected_value: feedback.correctedValue,
      field_name: feedback.fieldName,
      user_id: feedback.userId,
      timestamp: new Date().toISOString(),
      processed: false,
      pattern_generated: false
    };

    const { error } = await this.supabase
      .from('rag_extraction_feedback')
      .insert(dbFeedback);

    if (error) {
      console.error('[FeedbackProcessor] Error submitting feedback:', error);
      throw error;
    }

    // Update extraction metrics
    await this.updateExtractionMetrics(feedback.extractionId, feedback.feedbackType);

    console.log(`[FeedbackProcessor] Feedback submitted successfully`);
  }

  /**
   * Process a batch of feedback
   */
  async processFeedbackBatch(batch: FeedbackBatch): Promise<FeedbackProcessingResult> {
    console.log(`[FeedbackProcessor] Processing batch of ${batch.feedbacks.length} feedbacks`);

    const result: FeedbackProcessingResult = {
      processed: 0,
      patternsGenerated: 0,
      enrichmentsProposed: 0,
      errors: []
    };

    try {
      // Group feedback by field and type
      const groupedFeedback = this.groupFeedbacks(batch.feedbacks);

      // Process corrections to learn patterns
      for (const [key, feedbacks] of Object.entries(groupedFeedback)) {
        if (feedbacks.length >= this.config.minFeedbacksForPattern) {
          const patterns = await this.generatePatternsFromFeedback(feedbacks);
          result.patternsGenerated += patterns.length;
        }
        result.processed += feedbacks.length;
      }

      // Mark feedbacks as processed
      const feedbackIds = batch.feedbacks.map(f => f.id);
      await this.markFeedbacksProcessed(feedbackIds);

      // Record processing
      if (batch.documentId) {
        await this.recordBatchProcessing(batch, result);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(errorMessage);
      console.error('[FeedbackProcessor] Error processing batch:', error);
    }

    console.log(`[FeedbackProcessor] Batch processed: ${result.processed} feedbacks, ${result.patternsGenerated} patterns`);
    return result;
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStats(period: MetricsPeriod): Promise<FeedbackStats> {
    const startDate = this.getStartDateForPeriod(period);

    const { data, error } = await this.supabase
      .from('rag_extraction_feedback')
      .select('*')
      .gte('timestamp', startDate.toISOString());

    if (error) {
      console.error('[FeedbackProcessor] Error fetching stats:', error);
      throw error;
    }

    const feedbacks = data as DbExtractionFeedback[];
    const total = feedbacks.length;
    
    const byType: Record<FeedbackType, number> = {
      correction: 0,
      rejection: 0,
      approval: 0,
      addition: 0,
      category_change: 0,
      merge: 0,
      split: 0
    };

    let processedCount = 0;
    let totalProcessingTime = 0;

    for (const fb of feedbacks) {
      byType[fb.feedback_type as FeedbackType]++;
      if (fb.processed) {
        processedCount++;
      }
    }

    return {
      total,
      byType,
      processingRate: total > 0 ? processedCount / total : 0,
      avgTimeToProcess: processedCount > 0 ? totalProcessingTime / processedCount : 0
    };
  }

  /**
   * Generate patterns from feedback
   */
  async generatePatternsFromFeedback(
    feedbacks: ExtractionFeedback[]
  ): Promise<LearnedPattern[]> {
    console.log(`[FeedbackProcessor] Generating patterns from ${feedbacks.length} feedbacks`);

    const patterns: LearnedPattern[] = [];
    const patternLearner = getPatternLearner();

    // Group by field for correction patterns
    const correctionsByField = new Map<string, ExtractionFeedback[]>();
    
    for (const feedback of feedbacks) {
      if (feedback.feedbackType === 'correction') {
        const existing = correctionsByField.get(feedback.fieldName) || [];
        existing.push(feedback);
        correctionsByField.set(feedback.fieldName, existing);
      }
    }

    // Generate correction patterns
    for (const [fieldName, corrections] of correctionsByField) {
      if (corrections.length >= 2) {
        const pattern = await this.createCorrectionPattern(fieldName, corrections);
        if (pattern) {
          patterns.push(pattern);
          
          // Mark feedbacks as having generated a pattern
          await this.markFeedbacksPatternGenerated(corrections.map(c => c.id));
        }
      }
    }

    // Generate rejection patterns (what NOT to extract)
    const rejections = feedbacks.filter(f => f.feedbackType === 'rejection');
    if (rejections.length >= 3) {
      const rejectionPattern = await this.createRejectionPattern(rejections);
      if (rejectionPattern) {
        patterns.push(rejectionPattern);
      }
    }

    console.log(`[FeedbackProcessor] Generated ${patterns.length} patterns from feedback`);
    return patterns;
  }

  // ==========================================================================
  // Background Processing
  // ==========================================================================

  /**
   * Start background feedback processing
   */
  startBackgroundProcessing(): void {
    if (this.processingInterval) return;

    console.log('[FeedbackProcessor] Starting background processing');
    
    this.processingInterval = setInterval(async () => {
      await this.processUnprocessedFeedback();
    }, this.config.processingIntervalMs);
  }

  /**
   * Stop background processing
   */
  stopBackgroundProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('[FeedbackProcessor] Stopped background processing');
    }
  }

  /**
   * Process all unprocessed feedback
   */
  private async processUnprocessedFeedback(): Promise<void> {
    const { data, error } = await this.supabase
      .from('rag_extraction_feedback')
      .select('*')
      .eq('processed', false)
      .order('timestamp', { ascending: true })
      .limit(this.config.batchSize);

    if (error || !data || data.length === 0) return;

    const feedbacks = (data as DbExtractionFeedback[]).map(db => this.dbToFeedback(db));
    
    // Group by extraction
    const byExtraction = new Map<string, ExtractionFeedback[]>();
    for (const fb of feedbacks) {
      const existing = byExtraction.get(fb.extractionId) || [];
      existing.push(fb);
      byExtraction.set(fb.extractionId, existing);
    }

    // Process each extraction's feedback as a batch
    for (const [extractionId, extractionFeedbacks] of byExtraction) {
      const batch: FeedbackBatch = {
        feedbacks: extractionFeedbacks,
        documentId: extractionId,
        documentType: 'unknown',
        patternsLearned: 0
      };

      await this.processFeedbackBatch(batch);
    }
  }

  // ==========================================================================
  // Pattern Generation Helpers
  // ==========================================================================

  /**
   * Create a correction pattern from multiple corrections
   */
  private async createCorrectionPattern(
    fieldName: string,
    corrections: ExtractionFeedback[]
  ): Promise<LearnedPattern | null> {
    // Analyze the pattern of corrections
    const transformations = corrections.map(c => ({
      original: String(c.originalValue),
      corrected: String(c.correctedValue)
    }));

    // Find common transformation patterns
    const transformationType = this.detectTransformationType(transformations);

    if (!transformationType) return null;

    const pattern: LearnedPattern = {
      id: uuidv4(),
      patternType: 'normalization',
      sourceType: 'feedback',
      inputPattern: this.generateInputPattern(transformations),
      outputMapping: {
        targetField: fieldName,
        transformationType: transformationType.type,
        transformationConfig: transformationType.config
      },
      confidence: 0.6 + (Math.min(corrections.length, 10) * 0.03), // Higher confidence with more examples
      usageCount: 0,
      successCount: 0,
      lastUsed: new Date(),
      createdAt: new Date(),
      metadata: {
        learnedFrom: corrections.map(c => c.extractionId),
        documentTypes: [],
        industries: [],
        categories: [],
        examples: transformations.map(t => ({
          input: t.original,
          output: t.corrected,
          context: 'correction',
          timestamp: new Date()
        }))
      }
    };

    // Store the pattern
    await this.storePattern(pattern);

    return pattern;
  }

  /**
   * Create a pattern for rejected extractions (negative pattern)
   */
  private async createRejectionPattern(
    rejections: ExtractionFeedback[]
  ): Promise<LearnedPattern | null> {
    // Find common characteristics of rejected items
    const rejectedValues = rejections.map(r => String(r.originalValue));
    
    // Find common patterns in rejected values
    const commonPattern = this.findCommonRejectionPattern(rejectedValues);
    
    if (!commonPattern) return null;

    const pattern: LearnedPattern = {
      id: uuidv4(),
      patternType: 'context_detection',
      sourceType: 'feedback',
      inputPattern: commonPattern,
      outputMapping: {
        targetField: '_reject',
        transformationType: 'direct',
        transformationConfig: {
          action: 'reject',
          reason: 'pattern_learned_from_feedback'
        }
      },
      confidence: 0.5 + (Math.min(rejections.length, 10) * 0.04),
      usageCount: 0,
      successCount: 0,
      lastUsed: new Date(),
      createdAt: new Date(),
      metadata: {
        learnedFrom: rejections.map(r => r.extractionId),
        documentTypes: [],
        industries: [],
        categories: [],
        examples: rejectedValues.map(v => ({
          input: v,
          output: 'rejected',
          context: 'rejection_pattern',
          timestamp: new Date()
        }))
      }
    };

    await this.storePattern(pattern);

    return pattern;
  }

  /**
   * Detect the type of transformation from corrections
   */
  private detectTransformationType(
    transformations: Array<{ original: string; corrected: string }>
  ): { type: 'direct' | 'lookup' | 'template'; config: Record<string, unknown> } | null {
    // Check if it's a simple lookup (same corrections repeated)
    const corrections = new Map<string, string>();
    for (const t of transformations) {
      corrections.set(t.original.toLowerCase(), t.corrected);
    }

    if (corrections.size <= transformations.length / 2) {
      // More than half are repeated corrections - use lookup
      return {
        type: 'lookup',
        config: {
          lookupTable: Object.fromEntries(corrections)
        }
      };
    }

    // Check if it's a case transformation
    const caseTransformations = transformations.every(t => 
      t.corrected.toLowerCase() === t.original.toLowerCase()
    );
    if (caseTransformations) {
      const allUpperCase = transformations.every(t => t.corrected === t.original.toUpperCase());
      const allLowerCase = transformations.every(t => t.corrected === t.original.toLowerCase());
      const allTitleCase = transformations.every(t => 
        t.corrected === t.original.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      );

      if (allUpperCase || allLowerCase || allTitleCase) {
        return {
          type: 'template',
          config: {
            transform: allUpperCase ? 'uppercase' : allLowerCase ? 'lowercase' : 'titlecase'
          }
        };
      }
    }

    // Check for trimming patterns
    const trimmingPattern = transformations.every(t => 
      t.corrected.trim() === t.corrected && t.original.trim() !== t.original
    );
    if (trimmingPattern) {
      return {
        type: 'direct',
        config: { trim: true }
      };
    }

    // Default to lookup with the specific corrections
    return {
      type: 'lookup',
      config: {
        lookupTable: Object.fromEntries(corrections)
      }
    };
  }

  /**
   * Generate input pattern from transformations
   */
  private generateInputPattern(
    transformations: Array<{ original: string; corrected: string }>
  ): string {
    // Escape special characters and join with OR
    const escaped = transformations.map(t => 
      t.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return `(?i)(${escaped.join('|')})`;
  }

  /**
   * Find common pattern in rejected values
   */
  private findCommonRejectionPattern(values: string[]): string | null {
    if (values.length < 2) return null;

    // Look for common prefixes/suffixes
    const commonPrefix = this.findCommonPrefix(values);
    const commonSuffix = this.findCommonSuffix(values);

    if (commonPrefix.length > 3) {
      return `^${this.escapeRegex(commonPrefix)}`;
    }

    if (commonSuffix.length > 3) {
      return `${this.escapeRegex(commonSuffix)}$`;
    }

    // Look for common words
    const wordCounts = new Map<string, number>();
    for (const value of values) {
      const words = value.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 2) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    // Find words that appear in most rejected values
    const threshold = values.length * 0.7;
    const commonWords = Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([word]) => word);

    if (commonWords.length > 0) {
      return `(?i)\\b(${commonWords.join('|')})\\b`;
    }

    return null;
  }

  /**
   * Find common prefix among strings
   */
  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (prefix === '') return '';
      }
    }
    return prefix;
  }

  /**
   * Find common suffix among strings
   */
  private findCommonSuffix(strings: string[]): string {
    const reversed = strings.map(s => s.split('').reverse().join(''));
    const prefix = this.findCommonPrefix(reversed);
    return prefix.split('').reverse().join('');
  }

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  /**
   * Update extraction metrics based on feedback
   */
  private async updateExtractionMetrics(
    extractionId: string,
    feedbackType: FeedbackType
  ): Promise<void> {
    const updates: Record<string, number> = {};

    switch (feedbackType) {
      case 'approval':
        updates.items_approved = 1;
        break;
      case 'correction':
        updates.items_corrected = 1;
        break;
      case 'rejection':
        updates.items_rejected = 1;
        break;
    }

    if (Object.keys(updates).length === 0) return;

    // Use RPC or raw SQL for increment
    const { error } = await this.supabase.rpc('increment_metrics', {
      p_extraction_id: extractionId,
      p_field: Object.keys(updates)[0],
      p_amount: 1
    });

    // If RPC doesn't exist, fall back to update
    if (error) {
      const { data: existing } = await this.supabase
        .from('rag_extraction_metrics')
        .select('*')
        .eq('extraction_id', extractionId)
        .single();

      if (existing) {
        const field = Object.keys(updates)[0];
        const currentValue = existing[field] || 0;
        await this.supabase
          .from('rag_extraction_metrics')
          .update({ [field]: currentValue + 1 })
          .eq('extraction_id', extractionId);
      }
    }
  }

  /**
   * Mark feedbacks as processed
   */
  private async markFeedbacksProcessed(feedbackIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('rag_extraction_feedback')
      .update({ processed: true })
      .in('id', feedbackIds);

    if (error) {
      console.error('[FeedbackProcessor] Error marking processed:', error);
    }
  }

  /**
   * Mark feedbacks as having generated a pattern
   */
  private async markFeedbacksPatternGenerated(feedbackIds: string[]): Promise<void> {
    const { error } = await this.supabase
      .from('rag_extraction_feedback')
      .update({ pattern_generated: true })
      .in('id', feedbackIds);

    if (error) {
      console.error('[FeedbackProcessor] Error marking pattern generated:', error);
    }
  }

  /**
   * Store a learned pattern
   */
  private async storePattern(pattern: LearnedPattern): Promise<void> {
    const dbPattern = {
      id: pattern.id,
      pattern_type: pattern.patternType,
      source_type: pattern.sourceType,
      input_pattern: pattern.inputPattern,
      output_mapping: pattern.outputMapping,
      confidence: pattern.confidence,
      usage_count: pattern.usageCount,
      success_count: pattern.successCount,
      last_used: pattern.lastUsed.toISOString(),
      created_at: pattern.createdAt.toISOString(),
      metadata: pattern.metadata
    };

    const { error } = await this.supabase
      .from('rag_learned_patterns')
      .insert(dbPattern);

    if (error) {
      console.error('[FeedbackProcessor] Error storing pattern:', error);
    }
  }

  /**
   * Record batch processing results
   */
  private async recordBatchProcessing(
    batch: FeedbackBatch,
    result: FeedbackProcessingResult
  ): Promise<void> {
    batch.processedAt = new Date();
    batch.patternsLearned = result.patternsGenerated;
    
    // Could store batch results if needed
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Group feedbacks by field and type
   */
  private groupFeedbacks(
    feedbacks: ExtractionFeedback[]
  ): Record<string, ExtractionFeedback[]> {
    const grouped: Record<string, ExtractionFeedback[]> = {};

    for (const fb of feedbacks) {
      const key = `${fb.fieldName}:${fb.feedbackType}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(fb);
    }

    return grouped;
  }

  /**
   * Convert DB feedback to domain model
   */
  private dbToFeedback(db: DbExtractionFeedback): ExtractionFeedback {
    return {
      id: db.id,
      extractionId: db.extraction_id,
      itemIndex: db.item_index,
      feedbackType: db.feedback_type as FeedbackType,
      originalValue: db.original_value,
      correctedValue: db.corrected_value,
      fieldName: db.field_name,
      userId: db.user_id,
      timestamp: new Date(db.timestamp),
      processed: db.processed,
      patternGenerated: db.pattern_generated
    };
  }

  /**
   * Get start date for a metrics period
   */
  private getStartDateForPeriod(period: MetricsPeriod): Date {
    const now = new Date();
    
    switch (period) {
      case 'hourly':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let feedbackProcessorInstance: FeedbackProcessor | null = null;

export function getFeedbackProcessor(
  config?: Partial<FeedbackProcessorConfig>
): FeedbackProcessor {
  if (!feedbackProcessorInstance) {
    feedbackProcessorInstance = new FeedbackProcessor(config);
  }
  return feedbackProcessorInstance;
}

export default FeedbackProcessor;
