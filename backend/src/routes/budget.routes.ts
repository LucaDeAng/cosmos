import { Router, Request, Response } from 'express';
import { budgetOptimizerAgent } from '../agents/subagents/budgetOptimizerAgent';
import {
  saveBudgetOptimization,
  getBudgetOptimization,
  getLatestBudgetOptimization,
  getBudgetOptimizationsByTenant,
  deleteBudgetOptimization,
  getScenarioFromOptimization,
  updateRecommendedScenario,
  getBudgetOptimizationStats,
  compareBudgetOptimizations,
} from '../repositories/budgetRepository';
import type { BudgetOptimizerInput } from '../agents/schemas/budgetSchema';

const router = Router();

/**
 * POST /api/budget/optimize
 * Genera una nuova ottimizzazione budget
 * STEP 5 nel flusso sequenziale THEMIS
 */
router.post('/optimize', async (req: Request, res: Response) => {
  console.log('📥 POST /api/budget/optimize');
  
  try {
    const {
      tenantId,
      companyId,
      roadmapId,
      totalBudget,
      constraints,
      priorityWeights,
      options,
      optimizationGoals,
      userRequest,
    } = req.body as BudgetOptimizerInput;
    
    // Validazione minima
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId è obbligatorio',
        hint: 'Assicurati che l\'utente sia autenticato e abbia un tenant associato',
      });
    }
    
    if (!totalBudget || totalBudget <= 0) {
      return res.status(400).json({
        success: false,
        error: 'totalBudget è obbligatorio e deve essere maggiore di zero',
        hint: 'Specifica il budget totale disponibile per l\'ottimizzazione',
      });
    }
    
    // Invoca l'agente
    const result = await budgetOptimizerAgent.run({
      tenantId,
      companyId,
      roadmapId,
      totalBudget,
      constraints,
      priorityWeights,
      options,
      optimizationGoals,
      userRequest,
    });
    
    // Check per errore di prerequisiti
    if (result.metadata?.error === 'missing_prerequisites') {
      return res.status(400).json({
        success: false,
        error: 'Prerequisiti mancanti',
        message: result.content,
        hasAssessment: result.metadata.hasAssessment,
        hasPortfolio: result.metadata.hasPortfolio,
        hasPortfolioAssessment: result.metadata.hasPortfolioAssessment,
        hasRoadmap: result.metadata.hasRoadmap,
      });
    }
    
    // Check per altri errori
    if (result.metadata?.error) {
      return res.status(500).json({
        success: false,
        error: result.content,
      });
    }
    
    return res.json({
      success: true,
      message: 'Budget optimization completata con successo',
      optimizationId: result.metadata?.optimizationId,
      summary: result.content,
      data: result.metadata?.result,
      stats: {
        totalBudget: result.metadata?.totalBudget,
        scenariosCount: result.metadata?.scenariosCount,
        recommendationsCount: result.metadata?.recommendationsCount,
        confidenceLevel: result.metadata?.confidenceLevel,
      },
    });
    
  } catch (error) {
    console.error('❌ Error optimizing budget:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante l\'ottimizzazione del budget',
    });
  }
});

/**
 * GET /api/budget/:optimizationId
 * Recupera un'ottimizzazione specifica per ID
 */
router.get('/:optimizationId', async (req: Request, res: Response) => {
  const { optimizationId } = req.params;
  
  try {
    const optimization = await getBudgetOptimization(optimizationId);
    
    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: 'Ottimizzazione budget non trovata',
      });
    }
    
    return res.json({
      success: true,
      data: optimization,
    });
    
  } catch (error) {
    console.error('❌ Error fetching budget optimization:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero dell\'ottimizzazione',
    });
  }
});

/**
 * GET /api/budget/latest/:tenantId
 * Recupera l'ultima ottimizzazione per un tenant
 */
router.get('/latest/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  
  try {
    const optimization = await getLatestBudgetOptimization(tenantId);
    
    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna ottimizzazione budget trovata per questo tenant',
        hint: 'Genera un\'ottimizzazione prima usando POST /api/budget/optimize',
      });
    }
    
    return res.json({
      success: true,
      data: optimization,
    });
    
  } catch (error) {
    console.error('❌ Error fetching latest budget optimization:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero dell\'ottimizzazione',
    });
  }
});

/**
 * GET /api/budget/list/:tenantId
 * Lista tutte le ottimizzazioni per un tenant
 */
router.get('/list/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;
  
  try {
    const optimizations = await getBudgetOptimizationsByTenant(tenantId, limit);
    
    return res.json({
      success: true,
      count: optimizations.length,
      data: optimizations,
    });
    
  } catch (error) {
    console.error('❌ Error listing budget optimizations:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero delle ottimizzazioni',
    });
  }
});

/**
 * GET /api/budget/stats/:tenantId
 * Statistiche aggregate delle ottimizzazioni per tenant
 */
router.get('/stats/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  
  try {
    const stats = await getBudgetOptimizationStats(tenantId);
    
    return res.json({
      success: true,
      data: stats,
    });
    
  } catch (error) {
    console.error('❌ Error fetching budget optimization stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero delle statistiche',
    });
  }
});

/**
 * GET /api/budget/:optimizationId/scenario/:scenarioType
 * Recupera uno scenario specifico da un'ottimizzazione
 */
router.get('/:optimizationId/scenario/:scenarioType', async (req: Request, res: Response) => {
  const { optimizationId, scenarioType } = req.params;
  
  if (!['conservative', 'balanced', 'aggressive'].includes(scenarioType)) {
    return res.status(400).json({
      success: false,
      error: 'Tipo scenario non valido',
      hint: 'Usa conservative, balanced o aggressive',
    });
  }
  
  try {
    const scenario = await getScenarioFromOptimization(
      optimizationId, 
      scenarioType as 'conservative' | 'balanced' | 'aggressive'
    );
    
    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: 'Scenario non trovato',
      });
    }
    
    return res.json({
      success: true,
      data: scenario,
    });
    
  } catch (error) {
    console.error('❌ Error fetching scenario:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero dello scenario',
    });
  }
});

/**
 * PUT /api/budget/:optimizationId/recommend
 * Aggiorna lo scenario raccomandato
 */
router.put('/:optimizationId/recommend', async (req: Request, res: Response) => {
  const { optimizationId } = req.params;
  const { scenarioId, reason } = req.body;
  
  if (!scenarioId) {
    return res.status(400).json({
      success: false,
      error: 'scenarioId è obbligatorio',
    });
  }
  
  try {
    const updated = await updateRecommendedScenario(
      optimizationId,
      scenarioId,
      reason || 'Selezionato manualmente dall\'utente'
    );
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Ottimizzazione non trovata o impossibile aggiornare',
      });
    }
    
    return res.json({
      success: true,
      message: 'Scenario raccomandato aggiornato con successo',
    });
    
  } catch (error) {
    console.error('❌ Error updating recommended scenario:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante l\'aggiornamento',
    });
  }
});

/**
 * DELETE /api/budget/:optimizationId
 * Elimina un'ottimizzazione budget
 */
router.delete('/:optimizationId', async (req: Request, res: Response) => {
  const { optimizationId } = req.params;
  
  try {
    const deleted = await deleteBudgetOptimization(optimizationId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Ottimizzazione non trovata o impossibile eliminarla',
      });
    }
    
    return res.json({
      success: true,
      message: 'Ottimizzazione budget eliminata con successo',
    });
    
  } catch (error) {
    console.error('❌ Error deleting budget optimization:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante l\'eliminazione',
    });
  }
});

/**
 * POST /api/budget/compare
 * Compara due ottimizzazioni
 */
router.post('/compare', async (req: Request, res: Response) => {
  const { optimizationId1, optimizationId2 } = req.body;
  
  if (!optimizationId1 || !optimizationId2) {
    return res.status(400).json({
      success: false,
      error: 'Sono necessari due optimizationId per il confronto',
    });
  }
  
  try {
    const comparison = await compareBudgetOptimizations(optimizationId1, optimizationId2);
    
    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: 'Una o entrambe le ottimizzazioni non sono state trovate',
      });
    }
    
    return res.json({
      success: true,
      data: comparison,
    });
    
  } catch (error) {
    console.error('❌ Error comparing optimizations:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il confronto',
    });
  }
});

/**
 * POST /api/budget/reoptimize
 * Rigenera un'ottimizzazione con nuovi parametri
 */
router.post('/reoptimize', async (req: Request, res: Response) => {
  console.log('📥 POST /api/budget/reoptimize');
  
  try {
    const { optimizationId, ...newParams } = req.body;
    
    if (!optimizationId) {
      return res.status(400).json({
        success: false,
        error: 'optimizationId è obbligatorio per riottimizzare',
      });
    }
    
    // Recupera l'ottimizzazione esistente
    const existingOptimization = await getBudgetOptimization(optimizationId);
    if (!existingOptimization) {
      return res.status(404).json({
        success: false,
        error: 'Ottimizzazione originale non trovata',
      });
    }
    
    // Genera nuova ottimizzazione con parametri aggiornati
    const result = await budgetOptimizerAgent.run({
      tenantId: existingOptimization.tenantId,
      companyId: existingOptimization.companyId,
      roadmapId: existingOptimization.roadmapId,
      totalBudget: newParams.totalBudget || existingOptimization.inputSummary.totalAvailableBudget,
      constraints: newParams.constraints,
      priorityWeights: newParams.priorityWeights,
      options: newParams.options,
      optimizationGoals: newParams.optimizationGoals,
      userRequest: newParams.userRequest || 'Riottimizza con parametri aggiornati',
    });
    
    if (result.metadata?.error) {
      return res.status(500).json({
        success: false,
        error: result.content,
      });
    }
    
    return res.json({
      success: true,
      message: 'Budget riottimizzato con successo',
      previousOptimizationId: optimizationId,
      newOptimizationId: result.metadata?.optimizationId,
      summary: result.content,
      data: result.metadata?.result,
    });
    
  } catch (error) {
    console.error('❌ Error reoptimizing budget:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante la riottimizzazione',
    });
  }
});

export default router;
