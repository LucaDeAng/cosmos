/**
 * HITL Ingestion Service
 *
 * Manages Human-in-the-Loop sessions for real-time feedback during ingestion.
 * Handles session lifecycle, immediate learning context, and pattern application.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  HITLSession,
  HITLSessionStatus,
  HITLFeedback,
  HITLBatchFeedback,
  ImmediateLearningContext,
  ConfirmedPattern,
  RejectedPattern,
  ContextPromptOptions,
  createEmptySession,
  createEmptyContext,
  HITLRejectedItem,
} from '../types/hitl';
import { NormalizedItem } from '../agents/subagents/ingestion/normalizerAgent';
import { LearningService } from './learningService';

// In-memory session store (could be replaced with Redis for production)
const sessions = new Map<string, HITLSession>();

// Default configuration
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_SAMPLING_THRESHOLD = 50;
const DEFAULT_SAMPLE_SIZE = 15;
const PATTERN_CONFIDENCE_THRESHOLD = 0.6;

/**
 * HITLIngestionService
 * Singleton service for managing HITL ingestion sessions
 */
export class HITLIngestionService {
  private learningService: LearningService;

  constructor() {
    this.learningService = new LearningService();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new HITL session
   */
  createSession(
    tenantId: string,
    options?: {
      batchSize?: number;
      samplingThreshold?: number;
      sampleSize?: number;
    }
  ): HITLSession {
    const sessionId = uuidv4();
    const session = createEmptySession(tenantId, sessionId, {
      batchSize: options?.batchSize ?? DEFAULT_BATCH_SIZE,
      samplingThreshold: options?.samplingThreshold ?? DEFAULT_SAMPLING_THRESHOLD,
      sampleSize: options?.sampleSize ?? DEFAULT_SAMPLE_SIZE,
    });

    sessions.set(sessionId, session);
    console.log(`🎯 HITL Session created: ${sessionId} for tenant ${tenantId}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): HITLSession | undefined {
    return sessions.get(sessionId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: HITLSessionStatus): HITLSession | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    session.status = status;
    session.updatedAt = new Date();

    if (status === 'completed' || status === 'cancelled') {
      session.completedAt = new Date();
    }

    sessions.set(sessionId, session);
    return session;
  }

  /**
   * Add pending items to session
   */
  addPendingItems(sessionId: string, items: NormalizedItem[]): HITLSession | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    // Store deep copies of original items for batch learning
    session.originalItems.push(...items.map(item => JSON.parse(JSON.stringify(item))));

    session.pendingItems.push(...items);
    session.totalEstimated = session.pendingItems.length + session.confirmedItems.length + session.rejectedItems.length;
    session.updatedAt = new Date();

    // Check if sampling mode should be activated
    if (session.totalEstimated > session.samplingThreshold && !session.samplingMode) {
      session.samplingMode = true;
      console.log(`📊 HITL Session ${sessionId}: Sampling mode activated (${session.totalEstimated} items > ${session.samplingThreshold})`);
    }

    sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get next batch of items for user review
   */
  getNextBatch(sessionId: string): NormalizedItem[] | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    const batchSize = session.batchSize;
    const batch = session.pendingItems.splice(0, batchSize);

    session.currentBatch = batch;
    session.currentIndex += batch.length;
    session.updatedAt = new Date();

    sessions.set(sessionId, session);
    return batch;
  }

  /**
   * Delete/cleanup a session
   */
  deleteSession(sessionId: string): boolean {
    const deleted = sessions.delete(sessionId);
    if (deleted) {
      console.log(`🗑️ HITL Session deleted: ${sessionId}`);
    }
    return deleted;
  }

  // ============================================================================
  // Feedback Processing
  // ============================================================================

  /**
   * Process a batch of feedback (confirmations and rejections)
   */
  async processFeedback(feedback: HITLBatchFeedback): Promise<HITLSession | undefined> {
    const session = sessions.get(feedback.sessionId);
    if (!session) return undefined;

    const startTime = Date.now();

    for (const fb of feedback.feedbacks) {
      if (fb.action === 'confirm' || fb.action === 'modify') {
        await this.processConfirmation(session, fb);
      } else if (fb.action === 'reject') {
        await this.processRejection(session, fb);
      }
      // 'skip' action - item is neither confirmed nor rejected
    }

    // Update metrics
    session.totalFeedbackCount += feedback.feedbacks.length;
    const responseTime = Date.now() - startTime;
    session.avgResponseTimeMs =
      (session.avgResponseTimeMs * (session.totalFeedbackCount - feedback.feedbacks.length) + responseTime) /
      session.totalFeedbackCount;

    // Rebuild context prompt
    session.context.contextPrompt = this.buildContextPrompt(session.context);
    session.context.lastUpdated = new Date();
    session.updatedAt = new Date();

    sessions.set(feedback.sessionId, session);

    // Also record for persistent learning
    for (const fb of feedback.feedbacks) {
      if ((fb.action === 'confirm' || fb.action === 'modify') && fb.modifiedItem) {
        await this.learningService.recordCorrection(
          session.tenantId,
          fb.originalItem as Record<string, unknown>,
          { ...fb.originalItem, ...fb.modifiedItem } as Record<string, unknown>,
          'hitl_feedback',
          { sessionId: session.id }
        );
      }
    }

    return session;
  }

  /**
   * Process a single confirmation
   */
  private async processConfirmation(session: HITLSession, feedback: HITLFeedback): Promise<void> {
    // Merge modifications if any
    const finalItem = feedback.modifiedItem
      ? { ...feedback.originalItem, ...feedback.modifiedItem }
      : feedback.originalItem;

    // Add to confirmed items
    session.confirmedItems.push(finalItem as NormalizedItem);

    // Update type distribution
    if (finalItem.type === 'product') {
      session.context.typeDistribution.products++;
    } else if (finalItem.type === 'service') {
      session.context.typeDistribution.services++;
    }

    // Extract patterns from confirmation
    this.extractConfirmedPatterns(session.context, feedback);

    session.context.totalConfirmed++;
  }

  /**
   * Process a single rejection
   */
  private async processRejection(session: HITLSession, feedback: HITLFeedback): Promise<void> {
    // Add to rejected items
    session.rejectedItems.push({
      item: feedback.originalItem,
      reason: feedback.reason,
      rejectedAt: new Date(),
    });

    // Extract rejection patterns
    this.extractRejectedPatterns(session.context, feedback);

    session.context.totalRejected++;
  }

  /**
   * Extract patterns from a confirmed item
   */
  private extractConfirmedPatterns(context: ImmediateLearningContext, feedback: HITLFeedback): void {
    const original = feedback.originalItem;
    const modified = feedback.modifiedItem;

    // Key fields to track
    const fieldsToTrack = ['type', 'category', 'subcategory', 'status', 'priority'];

    for (const field of fieldsToTrack) {
      const originalValue = String(original[field as keyof NormalizedItem] ?? '');
      const confirmedValue = modified?.[field as keyof typeof modified]
        ? String(modified[field as keyof typeof modified])
        : originalValue;

      if (!originalValue && !confirmedValue) continue;

      // Find existing pattern or create new one
      const existingPattern = context.confirmedPatterns.find(
        (p) => p.field === field && p.originalValue === originalValue
      );

      if (existingPattern) {
        existingPattern.occurrences++;
        // If user modified, update confirmed value
        if (modified?.[field as keyof typeof modified]) {
          existingPattern.confirmedValue = confirmedValue;
        }
        // Recalculate confidence
        existingPattern.confidence = existingPattern.occurrences / context.totalConfirmed;
      } else {
        context.confirmedPatterns.push({
          field,
          originalValue,
          confirmedValue,
          occurrences: 1,
          confidence: 1 / (context.totalConfirmed || 1),
        });
      }
    }

    // Track category patterns
    const category = String(modified?.category ?? original.category ?? '');
    if (category) {
      const currentCount = context.categoryPatterns.get(category) ?? 0;
      context.categoryPatterns.set(category, currentCount + 1);
    }
  }

  /**
   * Extract patterns from a rejected item
   */
  private extractRejectedPatterns(context: ImmediateLearningContext, feedback: HITLFeedback): void {
    const item = feedback.originalItem;

    // Key fields to track for rejections
    const fieldsToTrack = ['type', 'category', 'name'];

    for (const field of fieldsToTrack) {
      const value = String(item[field as keyof NormalizedItem] ?? '');
      if (!value) continue;

      // Find existing pattern or create new one
      const existingPattern = context.rejectedPatterns.find(
        (p) => p.field === field && p.value === value
      );

      if (existingPattern) {
        existingPattern.occurrences++;
        // Update reason if provided
        if (feedback.reason) {
          existingPattern.reason = feedback.reason;
        }
      } else {
        context.rejectedPatterns.push({
          field,
          value,
          reason: feedback.reason,
          occurrences: 1,
        });
      }
    }
  }

  // ============================================================================
  // Context Building
  // ============================================================================

  /**
   * Build the context prompt for LLM injection
   */
  buildContextPrompt(
    context: ImmediateLearningContext,
    options?: Partial<ContextPromptOptions>
  ): string {
    const opts: ContextPromptOptions = {
      maxExamples: options?.maxExamples ?? 10,
      includeRejections: options?.includeRejections ?? true,
      includeTypeDistribution: options?.includeTypeDistribution ?? true,
      language: options?.language ?? 'it',
    };

    const lines: string[] = [];

    // Type distribution guidance
    if (opts.includeTypeDistribution && (context.typeDistribution.products > 0 || context.typeDistribution.services > 0)) {
      const total = context.typeDistribution.products + context.typeDistribution.services;
      const productPercent = Math.round((context.typeDistribution.products / total) * 100);
      const servicePercent = Math.round((context.typeDistribution.services / total) * 100);

      if (opts.language === 'it') {
        lines.push(`\n## Distribuzione Tipo (da feedback utente)`);
        lines.push(`L'utente ha confermato ${context.typeDistribution.products} prodotti (${productPercent}%) e ${context.typeDistribution.services} servizi (${servicePercent}%).`);
        if (productPercent > 70) {
          lines.push(`SUGGERIMENTO: Questo portfolio sembra orientato ai prodotti. In caso di dubbio, classifica come "product".`);
        } else if (servicePercent > 70) {
          lines.push(`SUGGERIMENTO: Questo portfolio sembra orientato ai servizi. In caso di dubbio, classifica come "service".`);
        }
      } else {
        lines.push(`\n## Type Distribution (from user feedback)`);
        lines.push(`User confirmed ${context.typeDistribution.products} products (${productPercent}%) and ${context.typeDistribution.services} services (${servicePercent}%).`);
        if (productPercent > 70) {
          lines.push(`HINT: This portfolio seems product-oriented. When in doubt, classify as "product".`);
        } else if (servicePercent > 70) {
          lines.push(`HINT: This portfolio seems service-oriented. When in doubt, classify as "service".`);
        }
      }
    }

    // Confirmed patterns (positive examples)
    const significantPatterns = context.confirmedPatterns
      .filter((p) => p.confidence >= PATTERN_CONFIDENCE_THRESHOLD)
      .slice(0, opts.maxExamples);

    if (significantPatterns.length > 0) {
      if (opts.language === 'it') {
        lines.push(`\n## Pattern Confermati dall'Utente (usa come esempi positivi)`);
      } else {
        lines.push(`\n## User-Confirmed Patterns (use as positive examples)`);
      }

      for (const pattern of significantPatterns) {
        if (pattern.originalValue !== pattern.confirmedValue) {
          lines.push(`- Campo "${pattern.field}": "${pattern.originalValue}" → "${pattern.confirmedValue}" (${pattern.occurrences}x)`);
        } else {
          lines.push(`- Campo "${pattern.field}": "${pattern.confirmedValue}" confermato (${pattern.occurrences}x)`);
        }
      }
    }

    // Rejected patterns (negative examples)
    if (opts.includeRejections && context.rejectedPatterns.length > 0) {
      const topRejections = context.rejectedPatterns.slice(0, 5);

      if (opts.language === 'it') {
        lines.push(`\n## Pattern Rifiutati (EVITA questi)`);
      } else {
        lines.push(`\n## Rejected Patterns (AVOID these)`);
      }

      for (const pattern of topRejections) {
        const reasonText = pattern.reason ? ` - Motivo: "${pattern.reason}"` : '';
        lines.push(`- Campo "${pattern.field}": "${pattern.value}" (rifiutato ${pattern.occurrences}x)${reasonText}`);
      }
    }

    // Category patterns
    if (context.categoryPatterns.size > 0) {
      const topCategories = Array.from(context.categoryPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (opts.language === 'it') {
        lines.push(`\n## Categorie Comuni`);
        lines.push(`Le categorie più frequenti in questo portfolio sono: ${topCategories.map(([cat, count]) => `"${cat}" (${count}x)`).join(', ')}`);
      } else {
        lines.push(`\n## Common Categories`);
        lines.push(`Most frequent categories in this portfolio: ${topCategories.map(([cat, count]) => `"${cat}" (${count}x)`).join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get the current context for a session
   */
  getSessionContext(sessionId: string): ImmediateLearningContext | undefined {
    return sessions.get(sessionId)?.context;
  }

  // ============================================================================
  // Smart Sampling & Bulk Confirm
  // ============================================================================

  /**
   * Select a representative sample from items for HITL review
   * Uses diversity factors: category, confidence level
   * Prioritizes low-confidence items that need most human review
   */
  selectRepresentativeSample(
    items: NormalizedItem[],
    sampleSize: number = DEFAULT_SAMPLE_SIZE
  ): { sample: NormalizedItem[]; remaining: NormalizedItem[] } {
    if (items.length <= sampleSize) {
      return { sample: [...items], remaining: [] };
    }

    const sample: NormalizedItem[] = [];

    // Group by confidence bands: low (<0.6), medium (0.6-0.8), high (>0.8)
    const lowConfidence = items.filter(i => i.confidence < 0.6);
    const medConfidence = items.filter(i => i.confidence >= 0.6 && i.confidence < 0.8);
    const highConfidence = items.filter(i => i.confidence >= 0.8);

    // Prioritize low confidence items (40%), then medium (35%), then high (25%)
    const lowSampleSize = Math.min(Math.ceil(sampleSize * 0.4), lowConfidence.length);
    const medSampleSize = Math.min(Math.ceil(sampleSize * 0.35), medConfidence.length);
    const highSampleSize = Math.min(sampleSize - lowSampleSize - medSampleSize, highConfidence.length);

    // Select from each band with category diversity
    const selectDiverse = (pool: NormalizedItem[], count: number): NormalizedItem[] => {
      if (pool.length <= count) return [...pool];

      const selected: NormalizedItem[] = [];
      const usedCategories = new Set<string>();

      // First pass: one from each category
      const poolByCategory = new Map<string, NormalizedItem[]>();
      for (const item of pool) {
        const cat = item.category || 'uncategorized';
        if (!poolByCategory.has(cat)) poolByCategory.set(cat, []);
        poolByCategory.get(cat)!.push(item);
      }

      for (const [category, catItems] of poolByCategory) {
        if (selected.length >= count) break;
        if (!usedCategories.has(category) && catItems.length > 0) {
          // Pick item with lowest confidence in this category
          catItems.sort((a, b) => a.confidence - b.confidence);
          selected.push(catItems[0]);
          usedCategories.add(category);
        }
      }

      // Second pass: fill remaining slots with lowest confidence items
      if (selected.length < count) {
        const remaining = pool.filter(i => !selected.includes(i));
        remaining.sort((a, b) => a.confidence - b.confidence);
        for (const item of remaining) {
          if (selected.length >= count) break;
          selected.push(item);
        }
      }

      return selected;
    };

    // Select from each band
    sample.push(...selectDiverse(lowConfidence, lowSampleSize));
    sample.push(...selectDiverse(medConfidence, medSampleSize));
    sample.push(...selectDiverse(highConfidence, highSampleSize));

    // Calculate remaining items
    const sampleIds = new Set(sample.map(i => i.id));
    const remaining = items.filter(i => !sampleIds.has(i.id));

    const categories = new Set(sample.map(i => i.category || 'uncategorized')).size;
    console.log(`📊 Sample selection: ${sample.length} items`);
    console.log(`   Low conf (<60%): ${sample.filter(i => i.confidence < 0.6).length}`);
    console.log(`   Med conf (60-80%): ${sample.filter(i => i.confidence >= 0.6 && i.confidence < 0.8).length}`);
    console.log(`   High conf (>80%): ${sample.filter(i => i.confidence >= 0.8).length}`);
    console.log(`   Categories represented: ${categories}`);

    return { sample, remaining };
  }

  /**
   * Bulk confirm items above a confidence threshold
   * Returns items that were auto-confirmed
   */
  bulkConfirmByConfidence(
    sessionId: string,
    minConfidence: number = 0.8
  ): { confirmed: NormalizedItem[]; remaining: NormalizedItem[] } | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    const toConfirm: NormalizedItem[] = [];
    const remaining: NormalizedItem[] = [];

    for (const item of session.pendingItems) {
      if (item.confidence >= minConfidence) {
        toConfirm.push(item);
        session.confirmedItems.push(item);

        // Update type distribution
        if (item.type === 'product') {
          session.context.typeDistribution.products++;
        } else if (item.type === 'service') {
          session.context.typeDistribution.services++;
        }
        session.context.totalConfirmed++;
      } else {
        remaining.push(item);
      }
    }

    session.pendingItems = remaining;
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    console.log(`✅ Bulk confirmed ${toConfirm.length} items with confidence >= ${(minConfidence * 100).toFixed(0)}%`);
    console.log(`   Remaining for review: ${remaining.length} items`);

    return { confirmed: toConfirm, remaining };
  }

  /**
   * Confirm all remaining items (after sample review)
   * Applies learned patterns to all pending items
   */
  confirmAllRemaining(sessionId: string): NormalizedItem[] | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    const context = session.context;
    const confirmed: NormalizedItem[] = [];

    for (const item of session.pendingItems) {
      const appliedItem = this.applyPatternsToItem(item, context);
      confirmed.push(appliedItem);
      session.confirmedItems.push(appliedItem);

      // Update type distribution
      if (appliedItem.type === 'product') {
        session.context.typeDistribution.products++;
      } else if (appliedItem.type === 'service') {
        session.context.typeDistribution.services++;
      }
      session.context.totalConfirmed++;
    }

    session.pendingItems = [];
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    console.log(`✅ Confirmed all ${confirmed.length} remaining items with learned patterns`);

    return confirmed;
  }

  /**
   * Get confidence distribution for pending items
   */
  getConfidenceDistribution(sessionId: string): {
    low: number;
    medium: number;
    high: number;
    total: number;
  } | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    const items = session.pendingItems;
    return {
      low: items.filter(i => i.confidence < 0.6).length,
      medium: items.filter(i => i.confidence >= 0.6 && i.confidence < 0.8).length,
      high: items.filter(i => i.confidence >= 0.8).length,
      total: items.length,
    };
  }

  // ============================================================================
  // Sampling Mode
  // ============================================================================

  /**
   * Check if session should propose applying patterns to remaining items
   */
  shouldProposeSampling(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session || !session.samplingMode) return false;

    // Propose after sample size items have been reviewed
    const reviewed = session.confirmedItems.length + session.rejectedItems.length;
    return reviewed >= session.sampleSize && session.pendingItems.length > 0;
  }

  /**
   * Apply learned patterns to remaining items
   */
  async applyPatternsToRemaining(sessionId: string): Promise<NormalizedItem[]> {
    const session = sessions.get(sessionId);
    if (!session) return [];

    const context = session.context;
    const appliedItems: NormalizedItem[] = [];

    for (const item of session.pendingItems) {
      const appliedItem = this.applyPatternsToItem(item, context);
      appliedItems.push(appliedItem);
      session.confirmedItems.push(appliedItem);
    }

    // Clear pending items
    session.pendingItems = [];
    session.status = 'completed';
    session.completedAt = new Date();
    session.updatedAt = new Date();

    sessions.set(sessionId, session);

    console.log(`✅ HITL Session ${sessionId}: Applied patterns to ${appliedItems.length} remaining items`);

    return appliedItems;
  }

  /**
   * Apply learned patterns to a single item
   */
  private applyPatternsToItem(item: NormalizedItem, context: ImmediateLearningContext): NormalizedItem {
    const applied = { ...item };

    // Apply type distribution bias
    if (context.typeDistribution.products > 0 || context.typeDistribution.services > 0) {
      const total = context.typeDistribution.products + context.typeDistribution.services;
      const productRatio = context.typeDistribution.products / total;

      // If strong bias (>70%) and low confidence, adjust type
      if (item.confidence < 0.7) {
        if (productRatio > 0.7) {
          applied.type = 'product';
        } else if (productRatio < 0.3) {
          applied.type = 'service';
        }
      }
    }

    // Apply field transformations from confirmed patterns
    for (const pattern of context.confirmedPatterns) {
      if (pattern.confidence >= PATTERN_CONFIDENCE_THRESHOLD && pattern.originalValue !== pattern.confirmedValue) {
        const currentValue = String(applied[pattern.field as keyof NormalizedItem] ?? '');
        if (currentValue === pattern.originalValue) {
          (applied as Record<string, unknown>)[pattern.field] = pattern.confirmedValue;
        }
      }
    }

    // Add metadata about pattern application
    applied.normalizationNotes = applied.normalizationNotes || [];
    applied.normalizationNotes.push(`Applied ${context.confirmedPatterns.length} HITL patterns`);

    return applied;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    confirmed: number;
    rejected: number;
    pending: number;
    total: number;
    avgConfidence: number;
    avgResponseTimeMs: number;
    patternsLearned: number;
  } | undefined {
    const session = sessions.get(sessionId);
    if (!session) return undefined;

    const confirmed = session.confirmedItems.length;
    const rejected = session.rejectedItems.length;
    const pending = session.pendingItems.length;
    const total = confirmed + rejected + pending;

    const avgConfidence =
      confirmed > 0
        ? session.confirmedItems.reduce((sum, item) => sum + item.confidence, 0) / confirmed
        : 0;

    return {
      confirmed,
      rejected,
      pending,
      total,
      avgConfidence,
      avgResponseTimeMs: session.avgResponseTimeMs,
      patternsLearned: session.context.confirmedPatterns.length,
    };
  }

  /**
   * Get all active sessions for a tenant
   */
  getActiveSessions(tenantId: string): HITLSession[] {
    return Array.from(sessions.values()).filter(
      (s) => s.tenantId === tenantId && s.status === 'active'
    );
  }

  /**
   * Cleanup old sessions (call periodically)
   */
  cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of sessions.entries()) {
      const age = now - session.createdAt.getTime();
      if (age > maxAgeMs) {
        sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old HITL sessions`);
    }

    return cleaned;
  }
}

// Singleton instance
let instance: HITLIngestionService | null = null;

export function getHITLIngestionService(): HITLIngestionService {
  if (!instance) {
    instance = new HITLIngestionService();
  }
  return instance;
}
