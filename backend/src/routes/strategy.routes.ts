import { Router, Request, Response } from 'express';
import { strategyAdvisorAgent } from '../agents/subagents/strategyAdvisorAgent';
import { StrategyAdvisorInputSchema } from '../agents/schemas/strategySchema';
import {
  getStrategyAnalysis,
  getLatestStrategyAnalysis,
  getStrategyAnalysesByTenant,
  deleteStrategyAnalysis,
  getPriorityRecommendations,
  getDecisionMatrix,
  getStrategicClusters,
  getStrategicKPIs,
  getStrategyStats,
  compareStrategyAnalyses,
} from '../repositories/strategyRepository';

const router = Router();

// ============================================
// STRATEGY ROUTES
// ============================================

/**
 * POST /api/strategy/analyze
 * Genera una nuova analisi strategica
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const parseResult = StrategyAdvisorInputSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.issues,
      });
    }

    const input = parseResult.data;
    
    console.log(`[StrategyRoutes] Starting analysis for tenant: ${input.tenantId}`);
    
    const result = await strategyAdvisorAgent.run(input);
    
    // Parse result from content/metadata format
    const metadata = result.metadata as { success?: boolean; error?: string; strategyId?: string } | undefined;
    
    if (metadata && metadata.success === false) {
      return res.status(400).json({
        success: false,
        error: metadata.error || 'Strategy analysis failed',
      });
    }

    // Parse the result from content
    let data;
    try {
      data = JSON.parse(result.content);
    } catch {
      data = result.metadata;
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in analyze:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/:strategyId
 * Recupera un'analisi strategica specifica
 */
router.get('/:strategyId', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    
    const result = await getStrategyAnalysis(strategyId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Strategy analysis not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in get:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/latest/:tenantId
 * Recupera l'ultima analisi strategica per tenant
 */
router.get('/latest/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    
    const result = await getLatestStrategyAnalysis(tenantId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No strategy analysis found for this tenant',
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in getLatest:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/list/:tenantId
 * Lista tutte le analisi strategiche per tenant
 */
router.get('/list/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await getStrategyAnalysesByTenant(tenantId, limit);

    return res.status(200).json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in list:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/stats/:tenantId
 * Statistiche aggregate per tenant
 */
router.get('/stats/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    
    const stats = await getStrategyStats(tenantId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/:strategyId/recommendations
 * Recupera raccomandazioni (opzionalmente filtrate per priorità)
 */
router.get('/:strategyId/recommendations', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    const priority = req.query.priority as 'critical' | 'high' | 'medium' | 'low' | undefined;
    
    const recommendations = await getPriorityRecommendations(strategyId, priority);

    return res.status(200).json({
      success: true,
      data: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in recommendations:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/:strategyId/decision-matrix
 * Recupera la decision matrix (quadranti Value vs Effort)
 */
router.get('/:strategyId/decision-matrix', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    
    const matrix = await getDecisionMatrix(strategyId);
    
    if (!matrix) {
      return res.status(404).json({
        success: false,
        error: 'Decision matrix not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: matrix,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in decision-matrix:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/:strategyId/clusters
 * Recupera i cluster strategici
 */
router.get('/:strategyId/clusters', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    
    const clusters = await getStrategicClusters(strategyId);

    return res.status(200).json({
      success: true,
      data: clusters,
      count: clusters.length,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in clusters:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/strategy/:strategyId/kpis
 * Recupera i KPI strategici
 */
router.get('/:strategyId/kpis', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    
    const kpis = await getStrategicKPIs(strategyId);
    
    if (!kpis) {
      return res.status(404).json({
        success: false,
        error: 'KPIs not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: kpis,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in kpis:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/strategy/compare
 * Confronta due analisi strategiche
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const { strategyId1, strategyId2 } = req.body;
    
    if (!strategyId1 || !strategyId2) {
      return res.status(400).json({
        success: false,
        error: 'Both strategyId1 and strategyId2 are required',
      });
    }

    const comparison = await compareStrategyAnalyses(strategyId1, strategyId2);
    
    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: 'One or both strategy analyses not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in compare:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/strategy/:strategyId
 * Elimina un'analisi strategica
 */
router.delete('/:strategyId', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    
    const result = await deleteStrategyAnalysis(strategyId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Strategy analysis deleted successfully',
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in delete:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/strategy/reanalyze
 * Rigenera analisi con nuovi parametri
 */
router.post('/reanalyze', async (req: Request, res: Response) => {
  try {
    const parseResult = StrategyAdvisorInputSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.issues,
      });
    }

    // Same as /analyze but labeled differently for clarity
    const result = await strategyAdvisorAgent.run(parseResult.data);
    
    // Parse result from content/metadata format
    const metadata = result.metadata as { success?: boolean; error?: string; strategyId?: string } | undefined;
    
    if (metadata && metadata.success === false) {
      return res.status(400).json({
        success: false,
        error: metadata.error || 'Strategy reanalysis failed',
      });
    }

    // Parse the result from content
    let data;
    try {
      data = JSON.parse(result.content);
    } catch {
      data = result.metadata;
    }

    return res.status(200).json({
      success: true,
      data,
      message: 'Strategy reanalyzed successfully',
    });
  } catch (error) {
    console.error('[StrategyRoutes] Error in reanalyze:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
