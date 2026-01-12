/**
 * Confidence Metrics Service
 *
 * Tracks detailed confidence metrics per item and field:
 * - Overall item confidence
 * - Field-level confidence breakdown
 * - Enrichment source performance
 * - Quality indicators
 * - Alerting for low-confidence batches
 */

import { v4 as uuidv4 } from 'uuid';
import type { KnowledgeSourceType } from '../knowledge/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ItemConfidenceMetrics {
  itemId: string;
  batchId: string;
  overallConfidence: number;
  fieldConfidences: Record<string, FieldConfidenceDetail>;
  enrichmentSources: EnrichmentSourceMetric[];
  qualityIndicators: QualityIndicators;
  extractionTimestamp: Date;
}

export interface FieldConfidenceDetail {
  field: string;
  confidence: number;
  source: 'extracted' | 'enriched' | 'inferred' | 'default';
  enrichmentSource?: KnowledgeSourceType;
  needsReview: boolean;
  historicalAccuracy?: number;
}

export interface EnrichmentSourceMetric {
  source: KnowledgeSourceType;
  fieldsEnriched: string[];
  confidence: number;
  responseTimeMs: number;
  wasUsed: boolean;
}

export interface QualityIndicators {
  sourceClarity: number; // How clear was the source data
  ragMatch: number; // RAG matching score
  schemaFit: number; // How well item fits expected schema
  validationScore: number; // Validation pass rate
  duplicateRisk: number; // Likelihood of being a duplicate
}

export interface QualityGate {
  id: string;
  name: string;
  threshold: number;
  field: 'overall_confidence' | 'field_confidence' | 'enrichment_rate' | 'validation_score';
  action: 'block' | 'warn' | 'flag_for_review';
  isActive: boolean;
}

export interface QualityAlert {
  id: string;
  type: 'low_confidence_batch' | 'quality_gate_violation' | 'source_degradation' | 'high_correction_rate';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  affectedItems?: number;
  timestamp: Date;
  acknowledged: boolean;
}

export interface ConfidenceTrendData {
  date: string;
  avgOverallConfidence: number;
  avgFieldConfidences: Record<string, number>;
  itemCount: number;
  lowConfidenceCount: number;
  enrichmentRate: number;
}

export interface ConfidenceDashboardData {
  summary: {
    avgConfidence: number;
    confidenceDistribution: Array<{ range: string; count: number }>;
    lowConfidenceItems: number;
    qualityGateViolations: number;
  };
  trends: ConfidenceTrendData[];
  fieldBreakdown: Array<{
    field: string;
    avgConfidence: number;
    correctionRate: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  sourcePerformance: Array<{
    source: KnowledgeSourceType;
    usageCount: number;
    avgConfidence: number;
    avgResponseTime: number;
    successRate: number;
  }>;
  activeAlerts: QualityAlert[];
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class ConfidenceMetricsService {
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.6;
  private readonly QUALITY_GATE_THRESHOLD = 0.5;

  /**
   * Records confidence metrics for an item
   */
  async recordItemConfidence(
    tenantId: string,
    batchId: string,
    itemMetrics: Omit<ItemConfidenceMetrics, 'extractionTimestamp'>
  ): Promise<void> {
    const metrics: ItemConfidenceMetrics = {
      ...itemMetrics,
      extractionTimestamp: new Date(),
    };

    // Check quality gates
    await this.checkQualityGates(tenantId, metrics);

    // TODO: Persist to database (item_confidence_metrics table)
    console.log(`📊 Recorded confidence metrics for item ${metrics.itemId} (conf: ${metrics.overallConfidence.toFixed(2)})`);
  }

  /**
   * Gets confidence dashboard data
   */
  async getConfidenceDashboard(
    tenantId: string,
    days: number = 30
  ): Promise<ConfidenceDashboardData> {
    // TODO: Load from database
    // Mock data for now

    const mockData: ConfidenceDashboardData = {
      summary: {
        avgConfidence: 0.78,
        confidenceDistribution: [
          { range: '0.9-1.0', count: 45 },
          { range: '0.8-0.9', count: 120 },
          { range: '0.7-0.8', count: 80 },
          { range: '0.6-0.7', count: 35 },
          { range: '0.0-0.6', count: 20 },
        ],
        lowConfidenceItems: 20,
        qualityGateViolations: 5,
      },
      trends: [],
      fieldBreakdown: [
        { field: 'name', avgConfidence: 0.95, correctionRate: 0.05, trend: 'stable' },
        { field: 'type', avgConfidence: 0.82, correctionRate: 0.15, trend: 'improving' },
        { field: 'category', avgConfidence: 0.75, correctionRate: 0.22, trend: 'stable' },
        { field: 'vendor', avgConfidence: 0.68, correctionRate: 0.30, trend: 'declining' },
      ],
      sourcePerformance: [
        { source: 'company_catalog', usageCount: 250, avgConfidence: 0.92, avgResponseTime: 120, successRate: 0.95 },
        { source: 'icecat', usageCount: 180, avgConfidence: 0.88, avgResponseTime: 450, successRate: 0.85 },
        { source: 'google_taxonomy', usageCount: 200, avgConfidence: 0.75, avgResponseTime: 80, successRate: 0.90 },
      ],
      activeAlerts: [],
    };

    return mockData;
  }

  /**
   * Checks quality gates and generates alerts
   */
  private async checkQualityGates(
    tenantId: string,
    metrics: ItemConfidenceMetrics
  ): Promise<QualityAlert[]> {
    const alerts: QualityAlert[] = [];

    // Gate 1: Overall confidence
    if (metrics.overallConfidence < this.QUALITY_GATE_THRESHOLD) {
      alerts.push({
        id: uuidv4(),
        type: 'quality_gate_violation',
        severity: 'warning',
        message: `Item confidence (${metrics.overallConfidence.toFixed(2)}) below threshold (${this.QUALITY_GATE_THRESHOLD})`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // Gate 2: Field confidence
    const lowConfidenceFields = Object.entries(metrics.fieldConfidences)
      .filter(([, detail]) => detail.confidence < this.LOW_CONFIDENCE_THRESHOLD)
      .map(([field]) => field);

    if (lowConfidenceFields.length > 3) {
      alerts.push({
        id: uuidv4(),
        type: 'low_confidence_batch',
        severity: 'info',
        message: `${lowConfidenceFields.length} fields have low confidence: ${lowConfidenceFields.join(', ')}`,
        timestamp: new Date(),
        acknowledged: false,
      });
    }

    // TODO: Persist alerts
    return alerts;
  }

  /**
   * Calculates confidence trends
   */
  async getConfidenceTrends(
    tenantId: string,
    days: number = 30
  ): Promise<ConfidenceTrendData[]> {
    // TODO: Query database and aggregate
    return [];
  }

  /**
   * Gets enrichment source performance
   */
  async getSourcePerformance(tenantId: string): Promise<Array<{
    source: KnowledgeSourceType;
    usageCount: number;
    avgConfidence: number;
    avgResponseTime: number;
    successRate: number;
  }>> {
    // TODO: Query database and aggregate
    return [];
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default ConfidenceMetricsService;
