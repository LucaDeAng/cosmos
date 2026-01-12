/**
 * Metrics Aggregator Service
 * 
 * Collects, aggregates, and analyzes extraction metrics to track
 * system performance and identify improvement opportunities.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  ExtractionMetrics,
  AggregatedMetrics,
  MetricsPeriod,
  MetricsFilters,
  MetricsAnomaly,
  MetricsReport,
  TrendData,
  IMetricsAggregator,
  DbExtractionMetrics
} from './types';

// ============================================================================
// Configuration
// ============================================================================

interface MetricsAggregatorConfig {
  anomalyThresholds: {
    accuracyDropPercent: number;
    volumeSpikeMultiplier: number;
    errorRateThreshold: number;
    patternFailureThreshold: number;
  };
  retentionDays: number;
  aggregationIntervalMs: number;
}

const DEFAULT_CONFIG: MetricsAggregatorConfig = {
  anomalyThresholds: {
    accuracyDropPercent: 15,
    volumeSpikeMultiplier: 3,
    errorRateThreshold: 0.3,
    patternFailureThreshold: 0.5
  },
  retentionDays: 90,
  aggregationIntervalMs: 300000 // 5 minutes
};

// ============================================================================
// Metrics Aggregator Implementation
// ============================================================================

export class MetricsAggregator implements IMetricsAggregator {
  private supabase: SupabaseClient;
  private config: MetricsAggregatorConfig;
  private aggregationInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MetricsAggregatorConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Core Metrics Methods
  // ==========================================================================

  /**
   * Record metrics for an extraction
   */
  async recordMetrics(metrics: Omit<ExtractionMetrics, 'id'>): Promise<void> {
    console.log(`[MetricsAggregator] Recording metrics for extraction ${metrics.extractionId}`);

    const dbMetrics: Omit<DbExtractionMetrics, 'id'> & { id: string } = {
      id: uuidv4(),
      extraction_id: metrics.extractionId,
      document_id: metrics.documentId,
      document_type: metrics.documentType,
      source_type: metrics.sourceType,
      items_extracted: metrics.itemsExtracted,
      items_approved: metrics.itemsApproved,
      items_corrected: metrics.itemsCorrected,
      items_rejected: metrics.itemsRejected,
      extraction_accuracy: metrics.extractionAccuracy,
      field_accuracy: metrics.fieldAccuracy,
      avg_confidence: metrics.avgConfidence,
      processing_time_ms: metrics.processingTimeMs,
      tokens_used: metrics.tokensUsed,
      rag_context_used: metrics.ragContextUsed,
      rag_match_count: metrics.ragMatchCount,
      rag_avg_similarity: metrics.ragAvgSimilarity,
      patterns_applied: metrics.patternsApplied,
      patterns_successful: metrics.patternsSuccessful,
      timestamp: new Date().toISOString()
    };

    const { error } = await this.supabase
      .from('rag_extraction_metrics')
      .upsert(dbMetrics, { onConflict: 'extraction_id' });

    if (error) {
      console.error('[MetricsAggregator] Error recording metrics:', error);
      throw error;
    }
  }

  /**
   * Get aggregated metrics for a period
   */
  async getAggregatedMetrics(
    period: MetricsPeriod,
    filters?: MetricsFilters
  ): Promise<AggregatedMetrics> {
    console.log(`[MetricsAggregator] Aggregating metrics for ${period}`);

    const { startDate, endDate } = this.getDateRangeForPeriod(period, filters?.dateRange);

    let query = this.supabase
      .from('rag_extraction_metrics')
      .select('*')
      .gte('timestamp', startDate.toISOString())
      .lte('timestamp', endDate.toISOString());

    if (filters?.documentType) {
      query = query.eq('document_type', filters.documentType);
    }
    if (filters?.sourceType) {
      query = query.eq('source_type', filters.sourceType);
    }
    if (filters?.minAccuracy !== undefined) {
      query = query.gte('extraction_accuracy', filters.minAccuracy);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MetricsAggregator] Error fetching metrics:', error);
      throw error;
    }

    const metrics = data as DbExtractionMetrics[];
    return this.aggregateMetrics(metrics, period, startDate, endDate);
  }

  /**
   * Get accuracy trend over time
   */
  async getAccuracyTrend(
    days: number,
    groupBy: 'day' | 'week' = 'day'
  ): Promise<TrendData[]> {
    console.log(`[MetricsAggregator] Getting accuracy trend for ${days} days`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('rag_extraction_metrics')
      .select('timestamp, extraction_accuracy')
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('[MetricsAggregator] Error fetching trend:', error);
      throw error;
    }

    // Group by day or week
    const grouped = new Map<string, number[]>();
    
    for (const row of data) {
      const date = new Date(row.timestamp);
      let key: string;
      
      if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = date.toISOString().split('T')[0];
      }

      const existing = grouped.get(key) || [];
      if (row.extraction_accuracy !== null) {
        existing.push(row.extraction_accuracy);
      }
      grouped.set(key, existing);
    }

    // Calculate averages
    const trend: TrendData[] = [];
    for (const [dateStr, accuracies] of grouped) {
      if (accuracies.length > 0) {
        const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
        trend.push({
          timestamp: new Date(dateStr),
          value: avgAccuracy,
          label: dateStr
        });
      }
    }

    return trend.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Detect anomalies in recent metrics
   */
  async detectAnomalies(): Promise<MetricsAnomaly[]> {
    console.log('[MetricsAggregator] Detecting anomalies');

    const anomalies: MetricsAnomaly[] = [];

    // Get recent and baseline metrics
    const recentMetrics = await this.getAggregatedMetrics('daily');
    const baselineMetrics = await this.getAggregatedMetrics('weekly');

    // Check for accuracy drop
    if (baselineMetrics.overallAccuracy > 0) {
      const accuracyDrop = 
        (baselineMetrics.overallAccuracy - recentMetrics.overallAccuracy) / 
        baselineMetrics.overallAccuracy * 100;

      if (accuracyDrop > this.config.anomalyThresholds.accuracyDropPercent) {
        anomalies.push({
          type: 'accuracy_drop',
          severity: accuracyDrop > 25 ? 'high' : accuracyDrop > 15 ? 'medium' : 'low',
          description: `Extraction accuracy dropped by ${accuracyDrop.toFixed(1)}% compared to weekly baseline`,
          detectedAt: new Date(),
          affectedMetric: 'extraction_accuracy',
          recommendedAction: 'Review recent extractions and feedback for issues. Consider retraining patterns.'
        });
      }
    }

    // Check for volume spike
    if (baselineMetrics.totalExtractions > 0) {
      const volumeRatio = recentMetrics.totalExtractions / (baselineMetrics.totalExtractions / 7);
      
      if (volumeRatio > this.config.anomalyThresholds.volumeSpikeMultiplier) {
        anomalies.push({
          type: 'volume_spike',
          severity: volumeRatio > 5 ? 'high' : 'medium',
          description: `Extraction volume is ${volumeRatio.toFixed(1)}x the daily average`,
          detectedAt: new Date(),
          affectedMetric: 'total_extractions',
          recommendedAction: 'Monitor system performance and consider scaling if trend continues.'
        });
      }
    }

    // Check for pattern failure rate
    if (recentMetrics.patternsActive > 0) {
      if (recentMetrics.patternEffectiveness < (1 - this.config.anomalyThresholds.patternFailureThreshold)) {
        anomalies.push({
          type: 'pattern_failure',
          severity: 'medium',
          description: `Pattern success rate is ${(recentMetrics.patternEffectiveness * 100).toFixed(1)}%`,
          detectedAt: new Date(),
          affectedMetric: 'pattern_effectiveness',
          recommendedAction: 'Review and potentially deprecate low-performing patterns.'
        });
      }
    }

    // Check for high rejection rate (error rate)
    const totalFeedback = recentMetrics.feedbackVolume;
    if (totalFeedback > 10) {
      const rejectionRate = await this.calculateRejectionRate('daily');
      
      if (rejectionRate > this.config.anomalyThresholds.errorRateThreshold) {
        anomalies.push({
          type: 'error_rate',
          severity: rejectionRate > 0.5 ? 'high' : 'medium',
          description: `Rejection rate is ${(rejectionRate * 100).toFixed(1)}% of extractions`,
          detectedAt: new Date(),
          affectedMetric: 'rejection_rate',
          recommendedAction: 'Analyze rejected extractions for common issues.'
        });
      }
    }

    console.log(`[MetricsAggregator] Detected ${anomalies.length} anomalies`);
    return anomalies;
  }

  /**
   * Generate a metrics report
   */
  async generateReport(period: MetricsPeriod): Promise<MetricsReport> {
    console.log(`[MetricsAggregator] Generating ${period} report`);

    const metrics = await this.getAggregatedMetrics(period);
    const anomalies = await this.detectAnomalies();
    const trend = await this.getAccuracyTrend(period === 'weekly' ? 7 : period === 'monthly' ? 30 : 1);

    const highlights: string[] = [];
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Generate highlights
    if (metrics.overallAccuracy >= 0.9) {
      highlights.push(`Excellent extraction accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
    } else if (metrics.overallAccuracy >= 0.7) {
      highlights.push(`Good extraction accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
    }

    if (metrics.patternsLearned > 0) {
      highlights.push(`Learned ${metrics.patternsLearned} new patterns this period`);
    }

    if (metrics.ragContribution > 0.1) {
      highlights.push(`RAG context improved accuracy by ${(metrics.ragContribution * 100).toFixed(1)}%`);
    }

    // Generate concerns from anomalies
    for (const anomaly of anomalies) {
      concerns.push(anomaly.description);
      recommendations.push(anomaly.recommendedAction);
    }

    // Add general recommendations
    if (metrics.feedbackVolume < 10) {
      recommendations.push('Consider encouraging more user feedback to improve learning.');
    }

    if (metrics.patternEffectiveness < 0.7 && metrics.patternsActive > 5) {
      recommendations.push('Review and prune low-performing patterns.');
    }

    // Generate summary
    const summary = this.generateSummary(metrics, anomalies);

    return {
      period,
      generatedAt: new Date(),
      summary,
      highlights,
      concerns,
      recommendations,
      data: metrics
    };
  }

  // ==========================================================================
  // Background Aggregation
  // ==========================================================================

  /**
   * Start background aggregation
   */
  startBackgroundAggregation(): void {
    if (this.aggregationInterval) return;

    console.log('[MetricsAggregator] Starting background aggregation');
    
    this.aggregationInterval = setInterval(async () => {
      await this.performAggregation();
    }, this.config.aggregationIntervalMs);
  }

  /**
   * Stop background aggregation
   */
  stopBackgroundAggregation(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
      console.log('[MetricsAggregator] Stopped background aggregation');
    }
  }

  /**
   * Perform aggregation tasks
   */
  private async performAggregation(): Promise<void> {
    // Clean up old metrics based on retention policy
    await this.cleanupOldMetrics();

    // Detect and log anomalies
    const anomalies = await this.detectAnomalies();
    if (anomalies.length > 0) {
      console.log(`[MetricsAggregator] Alert: ${anomalies.length} anomalies detected`);
    }
  }

  /**
   * Clean up metrics older than retention period
   */
  private async cleanupOldMetrics(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const { error } = await this.supabase
      .from('rag_extraction_metrics')
      .delete()
      .lt('timestamp', cutoffDate.toISOString());

    if (error) {
      console.error('[MetricsAggregator] Error cleaning up metrics:', error);
    }
  }

  // ==========================================================================
  // Aggregation Helpers
  // ==========================================================================

  /**
   * Aggregate metrics from raw data
   */
  private aggregateMetrics(
    metrics: DbExtractionMetrics[],
    period: MetricsPeriod,
    startDate: Date,
    endDate: Date
  ): AggregatedMetrics {
    const documentIds = new Set<string>();
    let totalItems = 0;
    let totalAccuracy = 0;
    let accuracyCount = 0;
    const accuracyByDocType: Record<string, { sum: number; count: number }> = {};
    const fieldAccuracies: Record<string, { sum: number; count: number }> = {};
    let ragUsageCount = 0;
    let totalRagContribution = 0;

    for (const m of metrics) {
      if (m.document_id) documentIds.add(m.document_id);
      totalItems += m.items_extracted || 0;

      if (m.extraction_accuracy !== null) {
        totalAccuracy += m.extraction_accuracy;
        accuracyCount++;

        if (m.document_type) {
          if (!accuracyByDocType[m.document_type]) {
            accuracyByDocType[m.document_type] = { sum: 0, count: 0 };
          }
          accuracyByDocType[m.document_type].sum += m.extraction_accuracy;
          accuracyByDocType[m.document_type].count++;
        }
      }

      // Aggregate field accuracies
      if (m.field_accuracy) {
        for (const [field, accuracy] of Object.entries(m.field_accuracy)) {
          if (!fieldAccuracies[field]) {
            fieldAccuracies[field] = { sum: 0, count: 0 };
          }
          fieldAccuracies[field].sum += accuracy as number;
          fieldAccuracies[field].count++;
        }
      }

      // RAG metrics
      if (m.rag_context_used) {
        ragUsageCount++;
        // Estimate RAG contribution based on match count and similarity
        if (m.rag_match_count > 0 && m.rag_avg_similarity) {
          totalRagContribution += m.rag_avg_similarity * 0.1; // Weight factor
        }
      }
    }

    // Calculate averages
    const overallAccuracy = accuracyCount > 0 ? totalAccuracy / accuracyCount : 0;
    
    const accuracyByDocTypeResult: Record<string, number> = {};
    for (const [docType, data] of Object.entries(accuracyByDocType)) {
      accuracyByDocTypeResult[docType] = data.sum / data.count;
    }

    const accuracyByFieldResult: Record<string, number> = {};
    for (const [field, data] of Object.entries(fieldAccuracies)) {
      accuracyByFieldResult[field] = data.sum / data.count;
    }

    // Get pattern metrics from patterns table
    const patternMetrics = this.getPatternMetricsSync(metrics);

    // Get feedback metrics
    const feedbackMetrics = this.getFeedbackMetricsSync(metrics);

    return {
      period,
      startDate,
      endDate,
      totalExtractions: metrics.length,
      totalItems,
      totalDocuments: documentIds.size,
      overallAccuracy,
      accuracyByDocType: accuracyByDocTypeResult,
      accuracyByField: accuracyByFieldResult,
      accuracyTrend: [], // Would need separate query for trend
      patternsLearned: patternMetrics.learned,
      patternsActive: patternMetrics.active,
      patternEffectiveness: patternMetrics.effectiveness,
      ragUtilization: metrics.length > 0 ? ragUsageCount / metrics.length : 0,
      ragContribution: ragUsageCount > 0 ? totalRagContribution / ragUsageCount : 0,
      feedbackVolume: feedbackMetrics.volume,
      feedbackProcessed: feedbackMetrics.processed,
      improvementFromFeedback: feedbackMetrics.improvement
    };
  }

  /**
   * Get pattern metrics (synchronous helper)
   */
  private getPatternMetricsSync(
    metrics: DbExtractionMetrics[]
  ): { learned: number; active: number; effectiveness: number } {
    let patternsApplied = 0;
    let patternsSuccessful = 0;

    for (const m of metrics) {
      patternsApplied += m.patterns_applied || 0;
      patternsSuccessful += m.patterns_successful || 0;
    }

    return {
      learned: 0, // Would need patterns table query
      active: 0,  // Would need patterns table query
      effectiveness: patternsApplied > 0 ? patternsSuccessful / patternsApplied : 0
    };
  }

  /**
   * Get feedback metrics (synchronous helper)
   */
  private getFeedbackMetricsSync(
    metrics: DbExtractionMetrics[]
  ): { volume: number; processed: number; improvement: number } {
    let totalApproved = 0;
    let totalCorrected = 0;
    let totalRejected = 0;

    for (const m of metrics) {
      totalApproved += m.items_approved || 0;
      totalCorrected += m.items_corrected || 0;
      totalRejected += m.items_rejected || 0;
    }

    const volume = totalApproved + totalCorrected + totalRejected;
    
    return {
      volume,
      processed: volume, // All metrics feedback is processed
      improvement: 0 // Would need before/after comparison
    };
  }

  /**
   * Calculate rejection rate for a period
   */
  private async calculateRejectionRate(period: MetricsPeriod): Promise<number> {
    const { startDate } = this.getDateRangeForPeriod(period);

    const { data, error } = await this.supabase
      .from('rag_extraction_feedback')
      .select('feedback_type')
      .gte('timestamp', startDate.toISOString());

    if (error || !data) return 0;

    const rejections = data.filter(d => d.feedback_type === 'rejection').length;
    return data.length > 0 ? rejections / data.length : 0;
  }

  /**
   * Generate report summary
   */
  private generateSummary(
    metrics: AggregatedMetrics,
    anomalies: MetricsAnomaly[]
  ): string {
    const parts: string[] = [];

    parts.push(`Processed ${metrics.totalExtractions} extractions from ${metrics.totalDocuments} documents.`);
    parts.push(`Overall accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%.`);

    if (metrics.patternsActive > 0) {
      parts.push(`${metrics.patternsActive} patterns active with ${(metrics.patternEffectiveness * 100).toFixed(1)}% effectiveness.`);
    }

    if (metrics.ragUtilization > 0) {
      parts.push(`RAG context used in ${(metrics.ragUtilization * 100).toFixed(1)}% of extractions.`);
    }

    if (anomalies.length > 0) {
      const highSeverity = anomalies.filter(a => a.severity === 'high').length;
      if (highSeverity > 0) {
        parts.push(`⚠️ ${highSeverity} high-severity anomalies detected.`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Get date range for a period
   */
  private getDateRangeForPeriod(
    period: MetricsPeriod,
    customRange?: { start: Date; end: Date }
  ): { startDate: Date; endDate: Date } {
    if (customRange) {
      return { startDate: customRange.start, endDate: customRange.end };
    }

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'hourly':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return { startDate, endDate };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let metricsAggregatorInstance: MetricsAggregator | null = null;

export function getMetricsAggregator(
  config?: Partial<MetricsAggregatorConfig>
): MetricsAggregator {
  if (!metricsAggregatorInstance) {
    metricsAggregatorInstance = new MetricsAggregator(config);
  }
  return metricsAggregatorInstance;
}

export default MetricsAggregator;
