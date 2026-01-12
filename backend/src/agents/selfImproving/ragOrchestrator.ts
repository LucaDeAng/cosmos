/**
 * Self-Improving RAG Orchestrator
 * 
 * Central coordinator for the self-improving RAG system. Orchestrates
 * pattern learning, feedback processing, synthetic generation, and
 * catalog enrichment to continuously improve extraction quality.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LearningSession,
  LearningPipelineConfig,
  ExtractionResult,
  DocumentInfo,
  ExtractionMetrics,
  MetricsPeriod,
  MetricsReport,
  AggregatedMetrics,
  LearnedPattern,
  SyntheticExample,
  CatalogEnrichment,
  PatternMatch,
  PatternApplicationResult
} from './types';
import { PatternLearner, getPatternLearner } from './patternLearner';
import { FeedbackProcessor, getFeedbackProcessor } from './feedbackProcessor';
import { MetricsAggregator, getMetricsAggregator } from './metricsAggregator';
import { CatalogEnricher, getCatalogEnricher } from './catalogEnricher';
import { SyntheticGenerator, getSyntheticGenerator } from './syntheticGenerator';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_PIPELINE_CONFIG: LearningPipelineConfig = {
  // Pattern learning
  minConfidenceForPattern: 0.5,
  minOccurrencesForPattern: 2,
  patternDecayRate: 0.95,
  maxPatternsPerType: 100,

  // Feedback processing
  feedbackBatchSize: 50,
  feedbackProcessingInterval: 5, // minutes
  minFeedbacksForLearning: 3,

  // Synthetic generation
  syntheticGenerationEnabled: true,
  syntheticBatchSize: 10,
  minExamplesPerCategory: 20,

  // Catalog enrichment
  autoEnrichmentEnabled: true,
  enrichmentReviewRequired: false, // Auto-apply high-confidence
  minConfidenceForAutoEnrich: 0.85,

  // Quality gates
  minAccuracyThreshold: 0.7,
  maxPatternAge: 30 // days
};

// ============================================================================
// Self-Improving RAG Orchestrator
// ============================================================================

export class SelfImprovingRAGOrchestrator {
  private config: LearningPipelineConfig;
  private patternLearner: PatternLearner;
  private feedbackProcessor: FeedbackProcessor;
  private metricsAggregator: MetricsAggregator;
  private catalogEnricher: CatalogEnricher;
  private syntheticGenerator: SyntheticGenerator;

  private learningInterval: NodeJS.Timeout | null = null;
  private isLearning: boolean = false;
  private currentSession: LearningSession | null = null;

  constructor(config?: Partial<LearningPipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    // Initialize all services
    this.patternLearner = getPatternLearner({
      minConfidenceThreshold: this.config.minConfidenceForPattern
    });
    this.feedbackProcessor = getFeedbackProcessor({
      batchSize: this.config.feedbackBatchSize,
      minFeedbacksForPattern: this.config.minFeedbacksForLearning
    });
    this.metricsAggregator = getMetricsAggregator();
    this.catalogEnricher = getCatalogEnricher({
      minConfidenceForAutoApply: this.config.minConfidenceForAutoEnrich,
      requireReviewForNewEntries: this.config.enrichmentReviewRequired
    });
    this.syntheticGenerator = getSyntheticGenerator();
  }

  // ==========================================================================
  // Extraction Integration
  // ==========================================================================

  /**
   * Pre-process: Apply learned patterns before extraction
   */
  async preProcessExtraction(
    content: string,
    documentType: string
  ): Promise<{
    patterns: PatternMatch[];
    preExtractedValues: Record<string, unknown>;
    confidence: number;
  }> {
    console.log('[RAGOrchestrator] Pre-processing extraction');

    // Find matching patterns
    const patterns = await this.patternLearner.findMatchingPatterns(content, documentType);

    // Apply patterns to pre-extract values
    let preExtractedValues: Record<string, unknown> = {};
    let confidence = 0;

    if (patterns.length > 0) {
      const result = await this.patternLearner.applyPatterns(content, patterns);
      preExtractedValues = result.extractedValues;
      confidence = result.confidence;
    }

    // Get synthetic examples for context
    const examples = await this.syntheticGenerator.getExamplesForTraining(
      undefined, // all categories
      undefined, // all complexities
      5 // limit
    );

    return {
      patterns,
      preExtractedValues,
      confidence
    };
  }

  /**
   * Post-process: Learn from extraction and record metrics
   */
  async postProcessExtraction(
    extraction: ExtractionResult,
    document: DocumentInfo,
    patternsUsed: string[],
    processingTimeMs: number,
    tokensUsed: number
  ): Promise<void> {
    console.log('[RAGOrchestrator] Post-processing extraction');

    // 1. Learn patterns from successful extraction
    if (extraction.confidence > this.config.minConfidenceForPattern) {
      await this.patternLearner.learnFromExtraction(extraction, document);
    }

    // 2. Record metrics
    const metrics: Omit<ExtractionMetrics, 'id'> = {
      extractionId: extraction.id,
      documentId: document.id,
      documentType: document.type,
      sourceType: document.type,
      itemsExtracted: extraction.items.length,
      itemsApproved: 0, // Will be updated by feedback
      itemsCorrected: 0,
      itemsRejected: 0,
      extractionAccuracy: extraction.confidence,
      fieldAccuracy: {},
      avgConfidence: extraction.confidence,
      processingTimeMs,
      tokensUsed,
      ragContextUsed: true,
      ragMatchCount: patternsUsed.length,
      ragAvgSimilarity: extraction.confidence,
      patternsApplied: patternsUsed.length,
      patternsSuccessful: patternsUsed.length, // Assumed successful initially
      timestamp: new Date()
    };

    await this.metricsAggregator.recordMetrics(metrics);

    // 3. Find potential catalog enrichments
    if (this.config.autoEnrichmentEnabled) {
      const enrichments = await this.catalogEnricher.findPotentialEnrichments([extraction]);
      
      for (const enrichment of enrichments) {
        if (enrichment.confidence >= this.config.minConfidenceForAutoEnrich) {
          try {
            await this.catalogEnricher.proposeEnrichment(enrichment);
          } catch (error) {
            // Ignore duplicates
          }
        }
      }
    }
  }

  // ==========================================================================
  // Learning Pipeline
  // ==========================================================================

  /**
   * Start the continuous learning pipeline
   */
  startLearningPipeline(): void {
    if (this.learningInterval) {
      console.log('[RAGOrchestrator] Learning pipeline already running');
      return;
    }

    console.log('[RAGOrchestrator] Starting learning pipeline');

    // Start background processing in components
    this.feedbackProcessor.startBackgroundProcessing();
    this.metricsAggregator.startBackgroundAggregation();

    // Run learning loop
    const intervalMs = this.config.feedbackProcessingInterval * 60 * 1000;
    this.learningInterval = setInterval(async () => {
      await this.runLearningCycle('scheduled');
    }, intervalMs);

    // Initial run
    this.runLearningCycle('manual');
  }

  /**
   * Stop the learning pipeline
   */
  stopLearningPipeline(): void {
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }

    this.feedbackProcessor.stopBackgroundProcessing();
    this.metricsAggregator.stopBackgroundAggregation();

    console.log('[RAGOrchestrator] Learning pipeline stopped');
  }

  /**
   * Run a single learning cycle
   */
  async runLearningCycle(
    trigger: 'scheduled' | 'threshold' | 'manual' | 'feedback_volume'
  ): Promise<LearningSession> {
    if (this.isLearning) {
      console.log('[RAGOrchestrator] Learning cycle already in progress');
      return this.currentSession!;
    }

    console.log(`[RAGOrchestrator] Starting learning cycle (trigger: ${trigger})`);
    this.isLearning = true;

    // Initialize session
    this.currentSession = {
      id: uuidv4(),
      startedAt: new Date(),
      trigger,
      patternsAnalyzed: 0,
      patternsLearned: 0,
      patternsUpdated: 0,
      patternsDeprecated: 0,
      feedbackProcessed: 0,
      syntheticGenerated: 0,
      enrichmentsCreated: 0,
      accuracyBefore: 0,
      status: 'running'
    };

    try {
      // 1. Get current accuracy baseline
      const baselineMetrics = await this.metricsAggregator.getAggregatedMetrics('daily');
      this.currentSession.accuracyBefore = baselineMetrics.overallAccuracy;

      // 2. Process feedback to learn patterns
      const feedbackStats = await this.feedbackProcessor.getFeedbackStats('daily');
      this.currentSession.feedbackProcessed = feedbackStats.total;

      // 3. Deprecate old/ineffective patterns
      const deprecatedCount = await this.deprecateOldPatterns();
      this.currentSession.patternsDeprecated = deprecatedCount;

      // 4. Generate synthetic examples if needed
      if (this.config.syntheticGenerationEnabled) {
        const generated = await this.generateSyntheticData(baselineMetrics);
        this.currentSession.syntheticGenerated = generated;
      }

      // 5. Check for accuracy improvement
      const newMetrics = await this.metricsAggregator.getAggregatedMetrics('hourly');
      this.currentSession.accuracyAfter = newMetrics.overallAccuracy;

      // 6. Detect anomalies and trigger actions
      const anomalies = await this.metricsAggregator.detectAnomalies();
      if (anomalies.some(a => a.severity === 'high')) {
        console.log('[RAGOrchestrator] High severity anomalies detected');
        // Could trigger additional actions
      }

      this.currentSession.completedAt = new Date();
      this.currentSession.status = 'completed';

      console.log(`[RAGOrchestrator] Learning cycle completed. Accuracy: ${(this.currentSession.accuracyBefore * 100).toFixed(1)}% -> ${(this.currentSession.accuracyAfter * 100).toFixed(1)}%`);

    } catch (error) {
      console.error('[RAGOrchestrator] Learning cycle failed:', error);
      this.currentSession.status = 'failed';
      this.currentSession.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.isLearning = false;
    }

    return this.currentSession;
  }

  // ==========================================================================
  // Pattern Management
  // ==========================================================================

  /**
   * Deprecate old or ineffective patterns
   */
  private async deprecateOldPatterns(): Promise<number> {
    // This would query patterns and deprecate based on age/effectiveness
    // For now, return 0 as this requires pattern table query
    return 0;
  }

  // ==========================================================================
  // Synthetic Data Management
  // ==========================================================================

  /**
   * Generate synthetic data based on metrics analysis
   */
  private async generateSyntheticData(metrics: AggregatedMetrics): Promise<number> {
    let generatedCount = 0;

    // Find categories with low accuracy
    for (const [category, accuracy] of Object.entries(metrics.accuracyByDocType)) {
      if (accuracy < this.config.minAccuracyThreshold) {
        console.log(`[RAGOrchestrator] Generating synthetic data for low-accuracy category: ${category}`);
        
        const examples = await this.syntheticGenerator.generateExamples(
          category,
          this.config.syntheticBatchSize,
          'medium'
        );
        
        generatedCount += examples.length;
      }
    }

    // Generate edge cases if overall accuracy is below threshold
    if (metrics.overallAccuracy < this.config.minAccuracyThreshold) {
      // Would need error patterns from feedback
      // For now, generate general examples
      const examples = await this.syntheticGenerator.generateExamples(
        'General',
        this.config.syntheticBatchSize,
        'complex'
      );
      generatedCount += examples.length;
    }

    return generatedCount;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    accuracy: number;
    patternsActive: number;
    feedbackPending: number;
    anomalies: number;
    lastLearning: Date | null;
  }> {
    const metrics = await this.metricsAggregator.getAggregatedMetrics('daily');
    const anomalies = await this.metricsAggregator.detectAnomalies();
    const feedbackStats = await this.feedbackProcessor.getFeedbackStats('daily');

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (metrics.overallAccuracy < 0.5 || anomalies.some(a => a.severity === 'high')) {
      status = 'critical';
    } else if (metrics.overallAccuracy < 0.7 || anomalies.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      accuracy: metrics.overallAccuracy,
      patternsActive: metrics.patternsActive,
      feedbackPending: feedbackStats.total - feedbackStats.processingRate * feedbackStats.total,
      anomalies: anomalies.length,
      lastLearning: this.currentSession?.completedAt || null
    };
  }

  /**
   * Get metrics report
   */
  async getReport(period: MetricsPeriod): Promise<MetricsReport> {
    return this.metricsAggregator.generateReport(period);
  }

  /**
   * Manually trigger learning cycle
   */
  async triggerLearning(): Promise<LearningSession> {
    return this.runLearningCycle('manual');
  }

  /**
   * Get pending enrichments for review
   */
  async getPendingEnrichments(): Promise<CatalogEnrichment[]> {
    return this.catalogEnricher.getPendingEnrichments();
  }

  /**
   * Review an enrichment
   */
  async reviewEnrichment(
    enrichmentId: string,
    approved: boolean,
    reviewerId: string
  ): Promise<void> {
    await this.catalogEnricher.reviewEnrichment(enrichmentId, approved, reviewerId);
  }

  /**
   * Get enrichments with filters
   */
  async getEnrichments(filters: {
    status?: string | string[];
    catalogType?: string;
    enrichmentType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ enrichments: CatalogEnrichment[]; total: number }> {
    return this.catalogEnricher.getEnrichments(filters as Parameters<typeof this.catalogEnricher.getEnrichments>[0]);
  }

  /**
   * Get enrichment statistics
   */
  async getEnrichmentStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCatalogType: Record<string, number>;
    byEnrichmentType: Record<string, number>;
    recentActivity: { date: string; count: number }[];
    avgConfidence: number;
  }> {
    return this.catalogEnricher.getEnrichmentStats();
  }

  /**
   * Bulk review enrichments
   */
  async bulkReviewEnrichments(
    enrichmentIds: string[],
    approved: boolean,
    reviewerId: string
  ): Promise<{ success: number; failed: number }> {
    return this.catalogEnricher.bulkReview(enrichmentIds, approved, reviewerId);
  }

  /**
   * Get current configuration
   */
  getConfig(): LearningPipelineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LearningPipelineConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let orchestratorInstance: SelfImprovingRAGOrchestrator | null = null;

export function getSelfImprovingRAGOrchestrator(
  config?: Partial<LearningPipelineConfig>
): SelfImprovingRAGOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SelfImprovingRAGOrchestrator(config);
  }
  return orchestratorInstance;
}

export default SelfImprovingRAGOrchestrator;
