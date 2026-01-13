/**
 * RAG Training Service - Continuous RAG Learning
 *
 * Enables continuous learning for the RAG system by:
 * - Processing user corrections
 * - Updating embeddings in real-time
 * - Mining patterns from corrections
 * - Triggering learning cycles when thresholds are met
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/supabase';
import { getPinecone, PINECONE_INDICES, getCompanyNamespace } from '../config/pinecone';
import { getSelfImprovingRAGOrchestrator } from '../agents/selfImproving/ragOrchestrator';

// === TYPES ===

export interface ExtractedItem {
  id: string;
  name: string;
  type: string;
  category?: string;
  description?: string;
  [key: string]: unknown;
}

export interface RAGTrainingTrigger {
  type: 'correction' | 'new_item' | 'feedback' | 'scheduled' | 'manual';
  tenantId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface CorrectionPattern {
  name: string;
  sourcePattern: Record<string, unknown>;
  targetPattern: Record<string, unknown>;
  confidence: number;
  occurrences: number;
}

export interface RAGTrainingStats {
  totalCorrections: number;
  patternsLearned: number;
  embeddingsUpdated: number;
  lastTrainingRun?: Date;
  queueSize: number;
}

// === CONFIGURATION ===

const CONFIG = {
  /** Minimum corrections before triggering training */
  minCorrectionsForTraining: 5,
  /** Maximum queue size before forced processing */
  maxQueueSize: 50,
  /** Embedding model dimension */
  embeddingDimension: 1536,
  /** Batch size for Pinecone operations */
  pineconeeBatchSize: 100
};

// === MAIN SERVICE CLASS ===

export class RAGTrainingService {
  private trainingQueue: RAGTrainingTrigger[] = [];
  private isProcessing = false;
  private orchestrator = getSelfImprovingRAGOrchestrator();

  // === PUBLIC API ===

  /**
   * Trigger training when a user corrects an extracted item
   */
  async onUserCorrection(
    tenantId: string,
    originalItem: ExtractedItem,
    correctedItem: ExtractedItem,
    correctionReason?: string
  ): Promise<void> {
    console.log(`[RAGTraining] Correction received for tenant ${tenantId}, item ${originalItem.id}`);

    // 1. Save correction for pattern mining
    await this.saveCorrectionForLearning(tenantId, originalItem, correctedItem, correctionReason);

    // 2. Update embedding with corrected data
    await this.updateItemEmbedding(tenantId, correctedItem);

    // 3. Add to training queue
    this.trainingQueue.push({
      type: 'correction',
      tenantId,
      data: { originalItem, correctedItem, correctionReason },
      timestamp: new Date()
    });

    // 4. Check if we should trigger training
    const tenantQueueSize = this.trainingQueue.filter(t => t.tenantId === tenantId).length;
    if (tenantQueueSize >= CONFIG.minCorrectionsForTraining) {
      await this.processTrainingQueue(tenantId);
    }

    // 5. Force processing if queue is too large
    if (this.trainingQueue.length >= CONFIG.maxQueueSize) {
      await this.processAllQueues();
    }
  }

  /**
   * Trigger training when an item is validated (user approved or high confidence)
   */
  async onItemValidated(
    tenantId: string,
    item: ExtractedItem,
    validationType: 'user_approved' | 'auto_high_confidence'
  ): Promise<void> {
    console.log(`[RAGTraining] Item validated: ${item.id} (${validationType})`);

    // Update embedding with validated item
    await this.updateItemEmbedding(tenantId, item, 'validated');

    // Add as positive training example
    await this.addPositiveExample(tenantId, item);
  }

  /**
   * Manually trigger a training cycle for a tenant
   */
  async triggerManualTraining(tenantId: string): Promise<void> {
    console.log(`[RAGTraining] Manual training triggered for tenant ${tenantId}`);
    await this.processTrainingQueue(tenantId);
    await this.orchestrator.runLearningCycle('manual');
  }

  /**
   * Get training statistics for a tenant
   */
  async getTrainingStats(tenantId: string): Promise<RAGTrainingStats> {
    const [correctionsResult, patternsResult] = await Promise.all([
      supabase
        .from('ingestion_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('learned_transformation_rules')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('active', true)
    ]);

    return {
      totalCorrections: correctionsResult.count || 0,
      patternsLearned: patternsResult.count || 0,
      embeddingsUpdated: 0, // Would need Pinecone query
      queueSize: this.trainingQueue.filter(t => t.tenantId === tenantId).length
    };
  }

  /**
   * Clear the training queue (for testing)
   */
  clearQueue(): void {
    this.trainingQueue = [];
  }

  // === PRIVATE METHODS ===

  /**
   * Save a correction to the database for pattern mining
   */
  private async saveCorrectionForLearning(
    tenantId: string,
    originalItem: ExtractedItem,
    correctedItem: ExtractedItem,
    reason?: string
  ): Promise<void> {
    try {
      // Identify what changed
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(correctedItem)) {
        if (JSON.stringify(originalItem[key]) !== JSON.stringify(correctedItem[key])) {
          changes[key] = {
            from: originalItem[key],
            to: correctedItem[key]
          };
        }
      }

      await supabase
        .from('ingestion_corrections')
        .insert({
          tenant_id: tenantId,
          item_id: originalItem.id,
          original_value: originalItem,
          corrected_value: correctedItem,
          changes,
          correction_reason: reason,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      console.error('[RAGTraining] Failed to save correction:', err);
    }
  }

  /**
   * Update or create embedding in Pinecone
   */
  private async updateItemEmbedding(
    tenantId: string,
    item: ExtractedItem,
    source: string = 'correction'
  ): Promise<void> {
    const pinecone = getPinecone();
    if (!pinecone) {
      console.warn('[RAGTraining] Pinecone not configured, skipping embedding update');
      return;
    }

    try {
      const index = pinecone.index(PINECONE_INDICES.PRODUCT_CATALOG);
      const namespace = getCompanyNamespace(tenantId);

      // Generate embedding from item text
      const embedding = await this.generateEmbedding(item);

      // Upsert in Pinecone
      await index.namespace(namespace).upsert([{
        id: item.id,
        values: embedding,
        metadata: {
          name: item.name,
          type: item.type,
          category: item.category || '',
          description: item.description?.substring(0, 500) || '',
          lastUpdated: new Date().toISOString(),
          source
        }
      }]);

      console.log(`[RAGTraining] Updated embedding for item ${item.id}`);
    } catch (err) {
      console.error('[RAGTraining] Failed to update embedding:', err);
    }
  }

  /**
   * Generate embedding for an item
   */
  private async generateEmbedding(item: ExtractedItem): Promise<number[]> {
    // Combine relevant text fields
    const text = [
      item.name,
      item.type,
      item.category,
      item.description
    ].filter(Boolean).join(' | ');

    // Use OpenAI embeddings
    try {
      const embeddingModule = await import('../agents/utils/embeddingService');
      // Check for default export or named export
      const embeddingService = embeddingModule.default || embeddingModule;
      if (typeof embeddingService.generateEmbedding === 'function') {
        return await embeddingService.generateEmbedding(text);
      }
      throw new Error('generateEmbedding not found');
    } catch (err) {
      console.warn('[RAGTraining] Embedding service not available, using placeholder');
      // Return zero vector as placeholder
      return new Array(CONFIG.embeddingDimension).fill(0);
    }
  }

  /**
   * Add an item as a positive training example
   */
  private async addPositiveExample(
    tenantId: string,
    item: ExtractedItem
  ): Promise<void> {
    try {
      await supabase
        .from('rag_training_examples')
        .upsert({
          tenant_id: tenantId,
          item_id: item.id,
          item_data: item,
          example_type: 'positive',
          created_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,item_id' });
    } catch (err) {
      // Table might not exist, ignore
      console.warn('[RAGTraining] Could not save positive example:', err);
    }
  }

  /**
   * Process training queue for a specific tenant
   */
  private async processTrainingQueue(tenantId: string): Promise<void> {
    if (this.isProcessing) {
      console.log('[RAGTraining] Already processing, skipping');
      return;
    }

    this.isProcessing = true;

    try {
      const tenantItems = this.trainingQueue.filter(t => t.tenantId === tenantId);

      if (tenantItems.length === 0) {
        return;
      }

      console.log(`[RAGTraining] Processing ${tenantItems.length} items for tenant ${tenantId}`);

      // Extract and save patterns from corrections
      const corrections = tenantItems.filter(t => t.type === 'correction');
      if (corrections.length >= 3) {
        const patterns = this.extractCorrectionPatterns(corrections);
        await this.savePatterns(tenantId, patterns);
      }

      // Trigger learning cycle
      await this.orchestrator.runLearningCycle('feedback_volume');

      // Remove processed items from queue
      this.trainingQueue = this.trainingQueue.filter(t => t.tenantId !== tenantId);

      console.log(`[RAGTraining] Completed processing for tenant ${tenantId}`);
    } catch (err) {
      console.error('[RAGTraining] Error processing queue:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process all queues across tenants
   */
  private async processAllQueues(): Promise<void> {
    const tenants = [...new Set(this.trainingQueue.map(t => t.tenantId))];

    for (const tenantId of tenants) {
      await this.processTrainingQueue(tenantId);
    }
  }

  /**
   * Extract common patterns from corrections
   */
  private extractCorrectionPatterns(corrections: RAGTrainingTrigger[]): CorrectionPattern[] {
    const patterns: CorrectionPattern[] = [];
    const correctionGroups: Map<string, RAGTrainingTrigger[]> = new Map();

    // Group corrections by change type
    for (const correction of corrections) {
      const data = correction.data as { originalItem: ExtractedItem; correctedItem: ExtractedItem };
      const changeKey = this.getChangeKey(data.originalItem, data.correctedItem);

      if (!correctionGroups.has(changeKey)) {
        correctionGroups.set(changeKey, []);
      }
      correctionGroups.get(changeKey)!.push(correction);
    }

    // Create patterns from groups with enough support
    for (const [key, group] of correctionGroups) {
      if (group.length >= 2) {
        const sample = group[0].data as { originalItem: ExtractedItem; correctedItem: ExtractedItem };

        patterns.push({
          name: `correction_pattern_${key}`,
          sourcePattern: this.extractPattern(sample.originalItem),
          targetPattern: this.extractPattern(sample.correctedItem),
          confidence: Math.min(0.9, 0.5 + group.length * 0.1),
          occurrences: group.length
        });
      }
    }

    return patterns;
  }

  /**
   * Get a key representing the type of change
   */
  private getChangeKey(original: ExtractedItem, corrected: ExtractedItem): string {
    const changedFields: string[] = [];

    for (const key of Object.keys(corrected)) {
      if (JSON.stringify(original[key]) !== JSON.stringify(corrected[key])) {
        changedFields.push(key);
      }
    }

    return changedFields.sort().join('_');
  }

  /**
   * Extract pattern from an item
   */
  private extractPattern(item: ExtractedItem): Record<string, unknown> {
    return {
      type: item.type,
      category: item.category,
      hasDescription: Boolean(item.description),
      fieldCount: Object.keys(item).filter(k => item[k] !== undefined).length
    };
  }

  /**
   * Save learned patterns to database
   */
  private async savePatterns(
    tenantId: string,
    patterns: CorrectionPattern[]
  ): Promise<void> {
    for (const pattern of patterns) {
      try {
        await supabase
          .from('learned_transformation_rules')
          .upsert({
            tenant_id: tenantId,
            rule_name: pattern.name,
            source_pattern: pattern.sourcePattern,
            target_pattern: pattern.targetPattern,
            confidence: pattern.confidence,
            occurrences: pattern.occurrences,
            active: true,
            updated_at: new Date().toISOString()
          }, { onConflict: 'tenant_id,rule_name' });
      } catch (err) {
        console.error(`[RAGTraining] Failed to save pattern ${pattern.name}:`, err);
      }
    }
  }
}

// === SINGLETON ===

let ragTrainingService: RAGTrainingService | null = null;

export function getRAGTrainingService(): RAGTrainingService {
  if (!ragTrainingService) {
    ragTrainingService = new RAGTrainingService();
  }
  return ragTrainingService;
}

export default RAGTrainingService;
