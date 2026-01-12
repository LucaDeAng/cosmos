import { Router, Request, Response } from 'express';
import { roadmapGeneratorAgent } from '../agents/subagents/roadmapGeneratorAgent';
import {
  saveRoadmap,
  getRoadmap,
  getLatestRoadmap,
  getRoadmapsByTenant,
  deleteRoadmap,
  getRoadmapStats,
} from '../repositories/roadmapRepository';
import type { RoadmapInput } from '../agents/schemas/roadmapSchema';

const router = Router();

/**
 * POST /api/roadmap/generate
 * Genera una nuova roadmap strategica
 * STEP 4 nel flusso sequenziale THEMIS
 */
router.post('/generate', async (req: Request, res: Response) => {
  console.log('📥 POST /api/roadmap/generate');
  
  try {
    const {
      tenantId,
      companyId,
      horizonMonths = 24,
      focusAreas,
      constraints,
      goals,
      detailLevel = 'tactical',
      includeQuickWins = true,
      userRequest,
    } = req.body as RoadmapInput;
    
    // Validazione minima
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId è obbligatorio',
        hint: 'Assicurati che l\'utente sia autenticato e abbia un tenant associato',
      });
    }
    
    // Invoca l'agente
    const result = await roadmapGeneratorAgent.run({
      tenantId,
      companyId,
      horizonMonths,
      focusAreas,
      constraints,
      goals,
      detailLevel,
      includeQuickWins,
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
      message: 'Roadmap generata con successo',
      roadmapId: result.metadata?.roadmapId,
      summary: result.content,
      data: result.metadata?.result,
      stats: {
        horizonMonths: result.metadata?.horizonMonths,
        phasesCount: result.metadata?.phasesCount,
        quickWinsCount: result.metadata?.quickWinsCount,
        totalBudget: result.metadata?.totalBudget,
        confidenceLevel: result.metadata?.confidenceLevel,
      },
    });
    
  } catch (error) {
    console.error('❌ Error generating roadmap:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante la generazione della roadmap',
    });
  }
});

/**
 * GET /api/roadmap/:roadmapId
 * Recupera una roadmap specifica per ID
 */
router.get('/:roadmapId', async (req: Request, res: Response) => {
  const { roadmapId } = req.params;
  
  try {
    const roadmap = await getRoadmap(roadmapId);
    
    if (!roadmap) {
      return res.status(404).json({
        success: false,
        error: 'Roadmap non trovata',
      });
    }
    
    return res.json({
      success: true,
      data: roadmap,
    });
    
  } catch (error) {
    console.error('❌ Error fetching roadmap:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero della roadmap',
    });
  }
});

/**
 * GET /api/roadmap/latest/:tenantId
 * Recupera l'ultima roadmap per un tenant
 */
router.get('/latest/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  
  try {
    const roadmap = await getLatestRoadmap(tenantId);
    
    if (!roadmap) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna roadmap trovata per questo tenant',
        hint: 'Genera una roadmap prima usando POST /api/roadmap/generate',
      });
    }
    
    return res.json({
      success: true,
      data: roadmap,
    });
    
  } catch (error) {
    console.error('❌ Error fetching latest roadmap:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero della roadmap',
    });
  }
});

/**
 * GET /api/roadmap/list/:tenantId
 * Lista tutte le roadmap per un tenant
 */
router.get('/list/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;
  
  try {
    const roadmaps = await getRoadmapsByTenant(tenantId, limit);
    
    return res.json({
      success: true,
      count: roadmaps.length,
      data: roadmaps,
    });
    
  } catch (error) {
    console.error('❌ Error listing roadmaps:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero delle roadmap',
    });
  }
});

/**
 * GET /api/roadmap/stats/:tenantId
 * Statistiche aggregate delle roadmap per tenant
 */
router.get('/stats/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  
  try {
    const stats = await getRoadmapStats(tenantId);
    
    return res.json({
      success: true,
      data: stats,
    });
    
  } catch (error) {
    console.error('❌ Error fetching roadmap stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante il recupero delle statistiche',
    });
  }
});

/**
 * DELETE /api/roadmap/:roadmapId
 * Elimina una roadmap
 */
router.delete('/:roadmapId', async (req: Request, res: Response) => {
  const { roadmapId } = req.params;
  
  try {
    const deleted = await deleteRoadmap(roadmapId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Roadmap non trovata o impossibile eliminarla',
      });
    }
    
    return res.json({
      success: true,
      message: 'Roadmap eliminata con successo',
    });
    
  } catch (error) {
    console.error('❌ Error deleting roadmap:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante l\'eliminazione della roadmap',
    });
  }
});

/**
 * POST /api/roadmap/regenerate
 * Rigenera una roadmap esistente con nuovi parametri
 */
router.post('/regenerate', async (req: Request, res: Response) => {
  console.log('📥 POST /api/roadmap/regenerate');
  
  try {
    const { roadmapId, ...newParams } = req.body;
    
    if (!roadmapId) {
      return res.status(400).json({
        success: false,
        error: 'roadmapId è obbligatorio per rigenerare',
      });
    }
    
    // Recupera la roadmap esistente per ottenere tenantId
    const existingRoadmap = await getRoadmap(roadmapId);
    if (!existingRoadmap) {
      return res.status(404).json({
        success: false,
        error: 'Roadmap originale non trovata',
      });
    }
    
    // Genera nuova roadmap con parametri aggiornati
    const result = await roadmapGeneratorAgent.run({
      tenantId: existingRoadmap.tenantId,
      companyId: existingRoadmap.companyId,
      horizonMonths: newParams.horizonMonths || existingRoadmap.horizonMonths,
      focusAreas: newParams.focusAreas,
      constraints: newParams.constraints,
      goals: newParams.goals,
      detailLevel: newParams.detailLevel || 'tactical',
      includeQuickWins: newParams.includeQuickWins ?? true,
      userRequest: newParams.userRequest || 'Rigenera roadmap con parametri aggiornati',
    });
    
    if (result.metadata?.error) {
      return res.status(500).json({
        success: false,
        error: result.content,
      });
    }
    
    return res.json({
      success: true,
      message: 'Roadmap rigenerata con successo',
      previousRoadmapId: roadmapId,
      newRoadmapId: result.metadata?.roadmapId,
      summary: result.content,
      data: result.metadata?.result,
    });
    
  } catch (error) {
    console.error('❌ Error regenerating roadmap:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Errore durante la rigenerazione della roadmap',
    });
  }
});

export default router;
