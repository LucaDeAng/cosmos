/**
 * Self-Improving RAG API Routes
 * 
 * REST API endpoints for the self-improving RAG system.
 */

import { Router, Request, Response } from 'express';
import { 
  getSelfImprovingRAGOrchestrator,
  getFeedbackProcessor,
  getMetricsAggregator,
  getCatalogEnricher,
  getSyntheticGenerator,
  FeedbackType,
  MetricsPeriod
} from '../agents/selfImproving';

const router = Router();

// ============================================================================
// Health & Status
// ============================================================================

/**
 * GET /api/rag/health
 * Get system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    const health = await orchestrator.getHealthStatus();
    
    const statusCode = health.status === 'critical' ? 503 : 
                       health.status === 'degraded' ? 200 : 200;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[RAG API] Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// ============================================================================
// Feedback Management
// ============================================================================

/**
 * POST /api/rag/feedback
 * Submit feedback for an extraction
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const {
      extractionId,
      itemIndex,
      feedbackType,
      originalValue,
      correctedValue,
      fieldName,
      userId
    } = req.body;

    // Validate required fields
    if (!extractionId || !feedbackType || !fieldName) {
      return res.status(400).json({
        error: 'Missing required fields: extractionId, feedbackType, fieldName'
      });
    }

    // Validate feedback type
    const validTypes: FeedbackType[] = [
      'correction', 'rejection', 'approval', 'addition',
      'category_change', 'merge', 'split'
    ];
    if (!validTypes.includes(feedbackType)) {
      return res.status(400).json({
        error: `Invalid feedbackType. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const feedbackProcessor = getFeedbackProcessor();
    await feedbackProcessor.submitFeedback({
      extractionId,
      itemIndex: itemIndex || 0,
      feedbackType,
      originalValue,
      correctedValue,
      fieldName,
      userId: userId || 'anonymous'
    });

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    console.error('[RAG API] Submit feedback error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to submit feedback'
    });
  }
});

/**
 * GET /api/rag/feedback/stats
 * Get feedback statistics
 */
router.get('/feedback/stats', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as MetricsPeriod) || 'daily';
    
    const feedbackProcessor = getFeedbackProcessor();
    const stats = await feedbackProcessor.getFeedbackStats(period);
    
    res.json(stats);
  } catch (error) {
    console.error('[RAG API] Feedback stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get feedback stats'
    });
  }
});

// ============================================================================
// Metrics & Reports
// ============================================================================

/**
 * GET /api/rag/metrics
 * Get aggregated metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as MetricsPeriod) || 'daily';
    const documentType = req.query.documentType as string | undefined;
    const sourceType = req.query.sourceType as string | undefined;

    const metricsAggregator = getMetricsAggregator();
    const metrics = await metricsAggregator.getAggregatedMetrics(period, {
      documentType,
      sourceType
    });

    res.json(metrics);
  } catch (error) {
    console.error('[RAG API] Metrics error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get metrics'
    });
  }
});

/**
 * GET /api/rag/metrics/trend
 * Get accuracy trend
 */
router.get('/metrics/trend', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const groupBy = (req.query.groupBy as 'day' | 'week') || 'day';

    const metricsAggregator = getMetricsAggregator();
    const trend = await metricsAggregator.getAccuracyTrend(days, groupBy);

    res.json(trend);
  } catch (error) {
    console.error('[RAG API] Trend error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get trend'
    });
  }
});

/**
 * GET /api/rag/metrics/anomalies
 * Get detected anomalies
 */
router.get('/metrics/anomalies', async (req: Request, res: Response) => {
  try {
    const metricsAggregator = getMetricsAggregator();
    const anomalies = await metricsAggregator.detectAnomalies();

    res.json(anomalies);
  } catch (error) {
    console.error('[RAG API] Anomalies error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to detect anomalies'
    });
  }
});

/**
 * GET /api/rag/report
 * Generate metrics report
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as MetricsPeriod) || 'weekly';

    const orchestrator = getSelfImprovingRAGOrchestrator();
    const report = await orchestrator.getReport(period);

    res.json(report);
  } catch (error) {
    console.error('[RAG API] Report error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate report'
    });
  }
});

// ============================================================================
// Catalog Enrichment
// ============================================================================

/**
 * GET /api/rag/enrichments
 * Get enrichments with filters
 */
router.get('/enrichments', async (req: Request, res: Response) => {
  try {
    const { status, catalogType, enrichmentType, limit, offset } = req.query;

    const orchestrator = getSelfImprovingRAGOrchestrator();
    const result = await orchestrator.getEnrichments({
      status: status ? (status as string).split(',') : undefined,
      catalogType: catalogType as string,
      enrichmentType: enrichmentType as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0
    });

    res.json(result);
  } catch (error) {
    console.error('[RAG API] Get enrichments error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get enrichments'
    });
  }
});

/**
 * GET /api/rag/enrichments/stats
 * Get enrichment statistics
 */
router.get('/enrichments/stats', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    const stats = await orchestrator.getEnrichmentStats();

    res.json(stats);
  } catch (error) {
    console.error('[RAG API] Enrichment stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get enrichment stats'
    });
  }
});

/**
 * GET /api/rag/enrichments/pending
 * Get pending enrichments for review
 */
router.get('/enrichments/pending', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    const enrichments = await orchestrator.getPendingEnrichments();

    res.json(enrichments);
  } catch (error) {
    console.error('[RAG API] Pending enrichments error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get pending enrichments'
    });
  }
});

/**
 * POST /api/rag/enrichments/:id/review
 * Review an enrichment
 */
router.post('/enrichments/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, reviewerId } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required field: approved (boolean)'
      });
    }

    const orchestrator = getSelfImprovingRAGOrchestrator();
    await orchestrator.reviewEnrichment(id, approved, reviewerId || 'anonymous');

    res.json({
      success: true,
      message: `Enrichment ${approved ? 'approved' : 'rejected'}`
    });
  } catch (error) {
    console.error('[RAG API] Review enrichment error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to review enrichment'
    });
  }
});

/**
 * POST /api/rag/enrichments/bulk-review
 * Bulk review multiple enrichments
 */
router.post('/enrichments/bulk-review', async (req: Request, res: Response) => {
  try {
    const { enrichmentIds, approved, reviewerId } = req.body;

    if (!Array.isArray(enrichmentIds) || enrichmentIds.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: enrichmentIds (array)'
      });
    }

    if (typeof approved !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required field: approved (boolean)'
      });
    }

    const orchestrator = getSelfImprovingRAGOrchestrator();
    const result = await orchestrator.bulkReviewEnrichments(
      enrichmentIds,
      approved,
      reviewerId || 'anonymous'
    );

    res.json({
      ok: true,
      processed: result.success,
      failed: result.failed,
      message: `Bulk review completed: ${result.success} ${approved ? 'approved' : 'rejected'}, ${result.failed} failed`
    });
  } catch (error) {
    console.error('[RAG API] Bulk review error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to bulk review enrichments'
    });
  }
});

// ============================================================================
// Learning Control
// ============================================================================

/**
 * POST /api/rag/learning/trigger
 * Manually trigger a learning cycle
 */
router.post('/learning/trigger', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    const session = await orchestrator.triggerLearning();

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('[RAG API] Trigger learning error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to trigger learning'
    });
  }
});

/**
 * POST /api/rag/learning/start
 * Start the continuous learning pipeline
 */
router.post('/learning/start', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    orchestrator.startLearningPipeline();

    res.json({
      success: true,
      message: 'Learning pipeline started'
    });
  } catch (error) {
    console.error('[RAG API] Start learning error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start learning'
    });
  }
});

/**
 * POST /api/rag/learning/stop
 * Stop the continuous learning pipeline
 */
router.post('/learning/stop', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    orchestrator.stopLearningPipeline();

    res.json({
      success: true,
      message: 'Learning pipeline stopped'
    });
  } catch (error) {
    console.error('[RAG API] Stop learning error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to stop learning'
    });
  }
});

// ============================================================================
// Synthetic Data
// ============================================================================

/**
 * POST /api/rag/synthetic/generate
 * Generate synthetic examples
 */
router.post('/synthetic/generate', async (req: Request, res: Response) => {
  try {
    const { category, count, complexity } = req.body;

    if (!category) {
      return res.status(400).json({
        error: 'Missing required field: category'
      });
    }

    const syntheticGenerator = getSyntheticGenerator();
    const examples = await syntheticGenerator.generateExamples(
      category,
      count || 5,
      complexity || 'medium'
    );

    res.json({
      success: true,
      count: examples.length,
      examples
    });
  } catch (error) {
    console.error('[RAG API] Generate synthetic error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate examples'
    });
  }
});

/**
 * GET /api/rag/synthetic/stats
 * Get synthetic example statistics
 */
router.get('/synthetic/stats', async (req: Request, res: Response) => {
  try {
    const syntheticGenerator = getSyntheticGenerator();
    const stats = await syntheticGenerator.getStatistics();

    res.json(stats);
  } catch (error) {
    console.error('[RAG API] Synthetic stats error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get stats'
    });
  }
});

// ============================================================================
// Configuration
// ============================================================================

/**
 * GET /api/rag/config
 * Get current configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const orchestrator = getSelfImprovingRAGOrchestrator();
    const config = orchestrator.getConfig();

    res.json(config);
  } catch (error) {
    console.error('[RAG API] Get config error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get config'
    });
  }
});

/**
 * PATCH /api/rag/config
 * Update configuration
 */
router.patch('/config', async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    const orchestrator = getSelfImprovingRAGOrchestrator();
    orchestrator.updateConfig(updates);

    res.json({
      success: true,
      message: 'Configuration updated',
      config: orchestrator.getConfig()
    });
  } catch (error) {
    console.error('[RAG API] Update config error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update config'
    });
  }
});

export default router;
