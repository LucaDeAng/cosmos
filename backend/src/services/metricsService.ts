/**
 * Metrics Service
 *
 * Tracks and analyzes ingestion accuracy and performance metrics.
 * Provides trend analysis and accuracy calculations for the
 * continuous learning system.
 */

import { supabase } from '../config/supabase';

// Metrics record structure
interface IngestionMetrics {
  id?: string;
  tenant_id: string;
  batch_id?: string;
  items_processed: number;
  extraction_accuracy?: number;
  type_accuracy?: number;
  category_accuracy?: number;
  auto_accept_rate?: number;
  avg_confidence?: number;
  processing_time_ms?: number;
  created_at?: string;
}

// Trend data point
interface TrendPoint {
  date: string;
  extraction_accuracy: number | null;
  type_accuracy: number | null;
  category_accuracy: number | null;
  auto_accept_rate: number | null;
  items_processed: number;
}

// Accuracy calculation result
interface AccuracyResult {
  overall: number;
  byField: Record<string, number>;
  autoAcceptRate: number;
  totalItems: number;
  unchangedItems: number;
}

/**
 * MetricsService class
 * Manages ingestion metrics tracking and analysis
 */
export class MetricsService {

  /**
   * Record metrics for a batch of processed items
   */
  async recordBatchMetrics(
    tenantId: string,
    batchId: string,
    metrics: Omit<IngestionMetrics, 'id' | 'tenant_id' | 'batch_id' | 'created_at'>
  ): Promise<string | null> {
    try {
      console.log(`📊 Recording batch metrics for tenant ${tenantId}, batch ${batchId}...`);

      const { data, error } = await supabase
        .from('ingestion_metrics')
        .insert({
          tenant_id: tenantId,
          batch_id: batchId,
          ...metrics,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`   ❌ Error recording metrics:`, error);
        throw error;
      }

      console.log(`   ✅ Metrics recorded: ${data?.id}`);
      return data?.id || null;

    } catch (error) {
      console.error(`❌ Error in recordBatchMetrics:`, error);
      return null;
    }
  }

  /**
   * Calculate accuracy by comparing original extracted items to final saved items
   */
  calculateAccuracy(
    originalItems: Record<string, unknown>[],
    finalItems: Record<string, unknown>[]
  ): AccuracyResult {
    const fieldsToCompare = [
      'type',
      'category',
      'subcategory',
      'status',
      'priority',
      'owner',
      'pricing_model',
      'lifecycle_stage',
      'target_segment',
      'delivery_model',
    ];

    let totalComparisons = 0;
    let unchangedComparisons = 0;
    let unchangedItems = 0;
    const fieldStats: Record<string, { total: number; unchanged: number }> = {};

    // Initialize field stats
    for (const field of fieldsToCompare) {
      fieldStats[field] = { total: 0, unchanged: 0 };
    }

    // Compare each item
    for (let i = 0; i < Math.min(originalItems.length, finalItems.length); i++) {
      const original = originalItems[i];
      const final = finalItems[i];

      let itemUnchanged = true;

      for (const field of fieldsToCompare) {
        const origValue = this.normalizeValue(original[field]);
        const finalValue = this.normalizeValue(final[field]);

        // Skip if both are null/undefined
        if (origValue === null && finalValue === null) continue;

        fieldStats[field].total++;
        totalComparisons++;

        if (origValue === finalValue) {
          fieldStats[field].unchanged++;
          unchangedComparisons++;
        } else {
          itemUnchanged = false;
        }
      }

      if (itemUnchanged) {
        unchangedItems++;
      }
    }

    // Calculate accuracies
    const overall = totalComparisons > 0 ? unchangedComparisons / totalComparisons : 1;
    const autoAcceptRate = originalItems.length > 0 ? unchangedItems / originalItems.length : 1;

    const byField: Record<string, number> = {};
    for (const [field, stats] of Object.entries(fieldStats)) {
      byField[field] = stats.total > 0 ? stats.unchanged / stats.total : 1;
    }

    return {
      overall,
      byField,
      autoAcceptRate,
      totalItems: originalItems.length,
      unchangedItems,
    };
  }

  /**
   * Normalize value for comparison
   */
  private normalizeValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim().toLowerCase() || null;
    if (typeof value === 'number') return String(value);
    return JSON.stringify(value);
  }

  /**
   * Get metrics trend for a tenant over the last N days
   */
  async getMetricsTrend(
    tenantId: string,
    days: number = 30
  ): Promise<TrendPoint[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('ingestion_metrics')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        console.error(`❌ Error fetching metrics trend:`, error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Aggregate by day
      const dailyData: Map<string, {
        extraction_accuracy: number[];
        type_accuracy: number[];
        category_accuracy: number[];
        auto_accept_rate: number[];
        items_processed: number;
      }> = new Map();

      for (const metric of data) {
        const date = new Date(metric.created_at).toISOString().split('T')[0];

        if (!dailyData.has(date)) {
          dailyData.set(date, {
            extraction_accuracy: [],
            type_accuracy: [],
            category_accuracy: [],
            auto_accept_rate: [],
            items_processed: 0,
          });
        }

        const day = dailyData.get(date)!;
        if (metric.extraction_accuracy !== null) day.extraction_accuracy.push(metric.extraction_accuracy);
        if (metric.type_accuracy !== null) day.type_accuracy.push(metric.type_accuracy);
        if (metric.category_accuracy !== null) day.category_accuracy.push(metric.category_accuracy);
        if (metric.auto_accept_rate !== null) day.auto_accept_rate.push(metric.auto_accept_rate);
        day.items_processed += metric.items_processed || 0;
      }

      // Calculate daily averages
      const trend: TrendPoint[] = [];

      for (const [date, day] of dailyData.entries()) {
        trend.push({
          date,
          extraction_accuracy: day.extraction_accuracy.length > 0
            ? day.extraction_accuracy.reduce((a, b) => a + b, 0) / day.extraction_accuracy.length
            : null,
          type_accuracy: day.type_accuracy.length > 0
            ? day.type_accuracy.reduce((a, b) => a + b, 0) / day.type_accuracy.length
            : null,
          category_accuracy: day.category_accuracy.length > 0
            ? day.category_accuracy.reduce((a, b) => a + b, 0) / day.category_accuracy.length
            : null,
          auto_accept_rate: day.auto_accept_rate.length > 0
            ? day.auto_accept_rate.reduce((a, b) => a + b, 0) / day.auto_accept_rate.length
            : null,
          items_processed: day.items_processed,
        });
      }

      return trend;

    } catch (error) {
      console.error(`❌ Error in getMetricsTrend:`, error);
      return [];
    }
  }

  /**
   * Get summary statistics for a tenant
   */
  async getMetricsSummary(tenantId: string): Promise<{
    totalBatches: number;
    totalItemsProcessed: number;
    avgExtractionAccuracy: number;
    avgTypeAccuracy: number;
    avgAutoAcceptRate: number;
    last7DaysImprovement: number;
  }> {
    try {
      // Get all metrics for the tenant
      const { data, error } = await supabase
        .from('ingestion_metrics')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) {
        return {
          totalBatches: 0,
          totalItemsProcessed: 0,
          avgExtractionAccuracy: 0,
          avgTypeAccuracy: 0,
          avgAutoAcceptRate: 0,
          last7DaysImprovement: 0,
        };
      }

      // Calculate totals and averages
      let totalItems = 0;
      let extractionAccSum = 0;
      let extractionAccCount = 0;
      let typeAccSum = 0;
      let typeAccCount = 0;
      let autoAcceptSum = 0;
      let autoAcceptCount = 0;

      for (const metric of data) {
        totalItems += metric.items_processed || 0;
        if (metric.extraction_accuracy !== null) {
          extractionAccSum += metric.extraction_accuracy;
          extractionAccCount++;
        }
        if (metric.type_accuracy !== null) {
          typeAccSum += metric.type_accuracy;
          typeAccCount++;
        }
        if (metric.auto_accept_rate !== null) {
          autoAcceptSum += metric.auto_accept_rate;
          autoAcceptCount++;
        }
      }

      // Calculate 7-day improvement
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentMetrics = data.filter(m => new Date(m.created_at) >= sevenDaysAgo);
      const olderMetrics = data.filter(m => new Date(m.created_at) < sevenDaysAgo);

      let improvement = 0;
      if (recentMetrics.length > 0 && olderMetrics.length > 0) {
        const recentAvg = recentMetrics
          .filter(m => m.extraction_accuracy !== null)
          .reduce((sum, m) => sum + m.extraction_accuracy, 0) /
          recentMetrics.filter(m => m.extraction_accuracy !== null).length || 0;

        const olderAvg = olderMetrics
          .filter(m => m.extraction_accuracy !== null)
          .reduce((sum, m) => sum + m.extraction_accuracy, 0) /
          olderMetrics.filter(m => m.extraction_accuracy !== null).length || 0;

        if (olderAvg > 0) {
          improvement = (recentAvg - olderAvg) / olderAvg;
        }
      }

      return {
        totalBatches: data.length,
        totalItemsProcessed: totalItems,
        avgExtractionAccuracy: extractionAccCount > 0 ? extractionAccSum / extractionAccCount : 0,
        avgTypeAccuracy: typeAccCount > 0 ? typeAccSum / typeAccCount : 0,
        avgAutoAcceptRate: autoAcceptCount > 0 ? autoAcceptSum / autoAcceptCount : 0,
        last7DaysImprovement: improvement,
      };

    } catch (error) {
      console.error(`❌ Error in getMetricsSummary:`, error);
      return {
        totalBatches: 0,
        totalItemsProcessed: 0,
        avgExtractionAccuracy: 0,
        avgTypeAccuracy: 0,
        avgAutoAcceptRate: 0,
        last7DaysImprovement: 0,
      };
    }
  }

  /**
   * Record accuracy metrics after user saves items
   */
  async recordSaveMetrics(
    tenantId: string,
    batchId: string,
    originalItems: Record<string, unknown>[],
    savedItems: Record<string, unknown>[],
    processingTimeMs?: number
  ): Promise<void> {
    try {
      const accuracy = this.calculateAccuracy(originalItems, savedItems);

      await this.recordBatchMetrics(tenantId, batchId, {
        items_processed: originalItems.length,
        extraction_accuracy: accuracy.overall,
        type_accuracy: accuracy.byField['type'],
        category_accuracy: accuracy.byField['category'],
        auto_accept_rate: accuracy.autoAcceptRate,
        avg_confidence: undefined, // Would need to be passed from extraction
        processing_time_ms: processingTimeMs,
      });

      console.log(`📊 Save metrics recorded:`);
      console.log(`   - Overall accuracy: ${(accuracy.overall * 100).toFixed(1)}%`);
      console.log(`   - Auto-accept rate: ${(accuracy.autoAcceptRate * 100).toFixed(1)}%`);
      console.log(`   - Unchanged items: ${accuracy.unchangedItems}/${accuracy.totalItems}`);

    } catch (error) {
      console.error(`❌ Error recording save metrics:`, error);
      // Don't throw - metrics failures shouldn't break the main flow
    }
  }
}

// Singleton instance
export const metricsService = new MetricsService();
