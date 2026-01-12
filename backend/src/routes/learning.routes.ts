/**
 * Learning Routes
 *
 * API endpoints for the Continuous Learning System.
 * Provides access to learning statistics, rules, and manual controls.
 */

import { Router, Request, Response } from 'express';
import { LearningService } from '../services/learningService';
import { MetricsService } from '../services/metricsService';

const router = Router();

// Service instances
const learningService = new LearningService();
const metricsService = new MetricsService();

/**
 * GET /api/learning/stats/:tenantId
 * Get learning statistics and accuracy trend for a tenant
 *
 * Response:
 * - learning_stats: { totalCorrections, activeRules, rulesByField, avgConfidence, lastLearningDate }
 * - accuracy_trend: Array of daily accuracy data points
 * - metrics_summary: { totalBatches, totalItemsProcessed, avgExtractionAccuracy, ... }
 */
router.get('/stats/:tenantId', async (req: Request, res: Response) => {
  console.log('📊 GET /api/learning/stats/:tenantId');

  try {
    const { tenantId } = req.params;
    const trendDays = parseInt(req.query.days as string) || 30;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    // Fetch all stats in parallel
    const [learningStats, accuracyTrend, metricsSummary] = await Promise.all([
      learningService.getLearningStats(tenantId),
      metricsService.getMetricsTrend(tenantId, trendDays),
      metricsService.getMetricsSummary(tenantId),
    ]);

    res.json({
      success: true,
      learning_stats: learningStats,
      accuracy_trend: accuracyTrend,
      metrics_summary: metricsSummary,
    });

  } catch (error) {
    console.error('❌ Error fetching learning stats:', error);
    res.status(500).json({
      error: 'Errore nel recupero delle statistiche di learning',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/learning/rules/:tenantId
 * Get all active learned transformation rules for a tenant
 *
 * Response:
 * - rules: Array of learned rules with confidence and occurrence counts
 * - count: Total number of active rules
 */
router.get('/rules/:tenantId', async (req: Request, res: Response) => {
  console.log('📋 GET /api/learning/rules/:tenantId');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const rules = await learningService.getLearnedRules(tenantId);

    res.json({
      success: true,
      rules,
      count: rules.length,
    });

  } catch (error) {
    console.error('❌ Error fetching learning rules:', error);
    res.status(500).json({
      error: 'Errore nel recupero delle regole apprese',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/learning/trigger/:tenantId
 * Manually trigger learning process for a tenant
 * Analyzes all corrections and creates/updates transformation rules
 *
 * Response:
 * - rulesCreated: Number of new rules created
 * - rulesUpdated: Number of existing rules updated
 */
router.post('/trigger/:tenantId', async (req: Request, res: Response) => {
  console.log('🎓 POST /api/learning/trigger/:tenantId');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    console.log(`\n🎓 Manually triggering learning for tenant ${tenantId}...`);

    const result = await learningService.triggerLearning(tenantId);

    res.json({
      success: true,
      message: `Learning completato: ${result.rulesCreated} regole create, ${result.rulesUpdated} regole aggiornate`,
      rulesCreated: result.rulesCreated,
      rulesUpdated: result.rulesUpdated,
    });

  } catch (error) {
    console.error('❌ Error triggering learning:', error);
    res.status(500).json({
      error: 'Errore durante il trigger del learning',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/learning/rules/:ruleId
 * Deactivate a learned rule
 *
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  console.log('🗑️ DELETE /api/learning/rules/:ruleId');

  try {
    const { ruleId } = req.params;

    if (!ruleId) {
      return res.status(400).json({ error: 'ruleId è richiesto' });
    }

    const success = await learningService.deactivateRule(ruleId);

    if (success) {
      res.json({
        success: true,
        message: 'Regola disattivata con successo',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Errore nella disattivazione della regola',
      });
    }

  } catch (error) {
    console.error('❌ Error deactivating rule:', error);
    res.status(500).json({
      error: 'Errore nella disattivazione della regola',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/learning/metrics/:tenantId
 * Get detailed metrics for a tenant
 *
 * Query params:
 * - days: Number of days to include in trend (default: 30)
 *
 * Response:
 * - summary: Aggregated metrics summary
 * - trend: Daily data points
 */
router.get('/metrics/:tenantId', async (req: Request, res: Response) => {
  console.log('📈 GET /api/learning/metrics/:tenantId');

  try {
    const { tenantId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const [summary, trend] = await Promise.all([
      metricsService.getMetricsSummary(tenantId),
      metricsService.getMetricsTrend(tenantId, days),
    ]);

    res.json({
      success: true,
      summary,
      trend,
    });

  } catch (error) {
    console.error('❌ Error fetching metrics:', error);
    res.status(500).json({
      error: 'Errore nel recupero delle metriche',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/learning/health/:tenantId
 * Health check for the learning system
 * Returns current status and key indicators
 */
router.get('/health/:tenantId', async (req: Request, res: Response) => {
  console.log('💚 GET /api/learning/health/:tenantId');

  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const stats = await learningService.getLearningStats(tenantId);
    const summary = await metricsService.getMetricsSummary(tenantId);

    // Determine health status
    let healthStatus: 'healthy' | 'learning' | 'needs_data' = 'needs_data';
    let healthMessage = 'Nessun dato di correzione disponibile';

    if (stats.totalCorrections >= 50 && stats.activeRules > 0) {
      healthStatus = 'healthy';
      healthMessage = `Sistema attivo con ${stats.activeRules} regole apprese`;
    } else if (stats.totalCorrections > 0) {
      healthStatus = 'learning';
      healthMessage = `Raccolta dati in corso: ${stats.totalCorrections}/50 correzioni`;
    }

    res.json({
      success: true,
      status: healthStatus,
      message: healthMessage,
      indicators: {
        totalCorrections: stats.totalCorrections,
        activeRules: stats.activeRules,
        avgRuleConfidence: stats.avgConfidence,
        avgExtractionAccuracy: summary.avgExtractionAccuracy,
        autoAcceptRate: summary.avgAutoAcceptRate,
        improvementTrend: summary.last7DaysImprovement,
      },
    });

  } catch (error) {
    console.error('❌ Error checking learning health:', error);
    res.status(500).json({
      error: 'Errore nel controllo dello stato del learning',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
