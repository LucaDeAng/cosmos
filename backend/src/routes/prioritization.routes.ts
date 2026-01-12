/**
 * Prioritization Routes
 *
 * API endpoints per la prioritizzazione portfolio IT.
 *
 * Endpoints:
 * - POST /api/prioritization/run - Esegue prioritizzazione completa
 * - POST /api/prioritization/triage - Solo triage rapido
 * - POST /api/prioritization/feedback - Registra feedback utente
 * - GET /api/prioritization/:id - Recupera risultato prioritizzazione
 * - GET /api/prioritization/latest/:tenantId - Ultimo risultato per tenant
 * - GET /api/prioritization/patterns/:tenantId - Pattern appresi
 * - GET /api/prioritization/stats/:tenantId - Statistiche learning
 */

import { Router, Request, Response } from 'express';
import { portfolioPrioritizationAgent } from '../agents/subagents/portfolioPrioritizationAgent';
import { recordFeedback, getActivePatterns, getLearningStats, decayOldPatterns } from '../agents/prioritization';
import { supabase } from '../config/supabase';

const router = Router();

/**
 * POST /api/prioritization/run
 * Esegue prioritizzazione completa del portfolio
 */
router.post('/run', async (req: Request, res: Response) => {
  console.log('🎯 POST /api/prioritization/run');

  try {
    const {
      tenantId,
      companyId,
      items,
      constraints,
      strategicContext,
      triageConfig,
      scoringConfig,
      optimizationConfig,
      mode = 'full',
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    console.log(`🔍 Running prioritization for tenant ${tenantId}, mode: ${mode}`);

    const result = await portfolioPrioritizationAgent.run({
      tenantId,
      companyId,
      items,
      constraints,
      strategicContext,
      triageConfig,
      scoringConfig,
      optimizationConfig,
      mode,
    });

    if (!result.metadata?.success) {
      return res.status(400).json({
        error: result.content,
        details: result.metadata,
      });
    }

    res.json({
      success: true,
      prioritizationId: result.metadata.prioritizationId,
      mode: result.metadata.mode,
      totalItems: result.metadata.totalItems,
      processingTimeMs: result.metadata.processingTimeMs,
      triageBreakdown: result.metadata.triageBreakdown,
      optimizationMetrics: result.metadata.optimizationMetrics,
      result: result.metadata.result,
      message: result.content,
    });

  } catch (error) {
    console.error('❌ Error in prioritization:', error);
    res.status(500).json({
      error: 'Errore durante la prioritizzazione',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prioritization/triage
 * Esegue solo triage rapido (MoSCoW classification)
 */
router.post('/triage', async (req: Request, res: Response) => {
  console.log('🏷️ POST /api/prioritization/triage');

  try {
    const { tenantId, companyId, items, strategicContext } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId è richiesto' });
    }

    const result = await portfolioPrioritizationAgent.run({
      tenantId,
      companyId,
      items,
      strategicContext,
      mode: 'triage',
    });

    if (!result.metadata?.success) {
      return res.status(400).json({ error: result.content });
    }

    const triageResult = (result.metadata.result as { triage: unknown })?.triage;

    res.json({
      success: true,
      prioritizationId: result.metadata.prioritizationId,
      triage: triageResult,
    });

  } catch (error) {
    console.error('❌ Error in triage:', error);
    res.status(500).json({
      error: 'Errore durante il triage',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/prioritization/feedback
 * Registra correzione utente per continuous learning
 */
router.post('/feedback', async (req: Request, res: Response) => {
  console.log('📝 POST /api/prioritization/feedback');

  try {
    const {
      tenantId,
      prioritizationId,
      itemId,
      originalCategory,
      originalScore,
      userCategory,
      userScore,
      userReasoning,
      userId,
      itemFeatures,
    } = req.body;

    if (!tenantId || !itemId || !userId) {
      return res.status(400).json({
        error: 'tenantId, itemId e userId sono richiesti',
      });
    }

    const feedbackResult = await recordFeedback({
      tenantId,
      prioritizationId,
      itemId,
      originalCategory,
      originalScore,
      userCorrection: {
        newCategory: userCategory,
        newScore: userScore,
        reasoning: userReasoning,
      },
      itemFeatures,
      userId,
    });

    if (!feedbackResult.success) {
      return res.status(500).json({
        error: 'Errore nel salvataggio del feedback',
        details: feedbackResult.error,
      });
    }

    res.json({
      success: true,
      feedbackId: feedbackResult.feedbackId,
      message: 'Feedback registrato per continuous learning',
    });

  } catch (error) {
    console.error('❌ Error recording feedback:', error);
    res.status(500).json({
      error: 'Errore nel salvataggio del feedback',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/prioritization/:prioritizationId
 * Recupera risultato di una prioritizzazione specifica
 */
router.get('/:prioritizationId', async (req: Request, res: Response) => {
  const { prioritizationId } = req.params;

  try {
    const { data, error } = await supabase
      .from('portfolio_prioritizations')
      .select('*')
      .eq('id', prioritizationId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Prioritizzazione non trovata' });
    }

    res.json({
      success: true,
      prioritization: {
        id: data.id,
        tenantId: data.tenant_id,
        companyId: data.company_id,
        createdAt: data.created_at,
        itemsCount: data.items_count,
        processingTimeMs: data.processing_time_ms,
        confidenceScore: data.confidence_score,
        triageBreakdown: data.triage_breakdown,
        triageResults: data.triage_results,
        scoringResults: data.scoring_results,
        optimizationResults: data.optimization_results,
        strategicContext: data.strategic_context,
        patternsApplied: data.patterns_applied,
        config: data.config,
      },
    });

  } catch (error) {
    console.error('❌ Error fetching prioritization:', error);
    res.status(500).json({ error: 'Errore nel recupero della prioritizzazione' });
  }
});

/**
 * GET /api/prioritization/latest/:tenantId
 * Recupera l'ultima prioritizzazione per un tenant
 */
router.get('/latest/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;

  try {
    const { data, error } = await supabase
      .from('portfolio_prioritizations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Nessuna prioritizzazione trovata' });
    }

    res.json({
      success: true,
      prioritization: {
        id: data.id,
        tenantId: data.tenant_id,
        companyId: data.company_id,
        createdAt: data.created_at,
        itemsCount: data.items_count,
        triageBreakdown: data.triage_breakdown,
        optimizationResults: data.optimization_results,
        confidenceScore: data.confidence_score,
      },
    });

  } catch (error) {
    console.error('❌ Error fetching latest prioritization:', error);
    res.status(500).json({ error: 'Errore nel recupero della prioritizzazione' });
  }
});

/**
 * GET /api/prioritization/patterns/:tenantId
 * Recupera i pattern appresi per un tenant
 */
router.get('/patterns/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;

  try {
    const patterns = await getActivePatterns(tenantId);

    res.json({
      success: true,
      patterns,
      count: patterns.length,
    });

  } catch (error) {
    console.error('❌ Error fetching patterns:', error);
    res.status(500).json({ error: 'Errore nel recupero dei pattern' });
  }
});

/**
 * GET /api/prioritization/stats/:tenantId
 * Recupera statistiche learning per un tenant
 */
router.get('/stats/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;

  try {
    const stats = await getLearningStats(tenantId);

    // Count prioritizations
    const { count: prioritizationCount } = await supabase
      .from('portfolio_prioritizations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    res.json({
      success: true,
      stats: {
        ...stats,
        totalPrioritizations: prioritizationCount || 0,
      },
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
  }
});

/**
 * POST /api/prioritization/maintenance/decay
 * Disattiva pattern obsoleti (chiamata di manutenzione)
 */
router.post('/maintenance/decay', async (req: Request, res: Response) => {
  const { tenantId } = req.body;

  try {
    if (tenantId) {
      // Decay per singolo tenant
      const deactivated = await decayOldPatterns(tenantId);
      res.json({ success: true, deactivated, tenantId });
    } else {
      // Decay per tutti i tenant
      const { data: tenants } = await supabase
        .from('portfolio_prioritizations')
        .select('tenant_id')
        .limit(100);

      const uniqueTenants = [...new Set((tenants || []).map(t => t.tenant_id))];
      let totalDeactivated = 0;

      for (const tid of uniqueTenants) {
        totalDeactivated += await decayOldPatterns(tid);
      }

      res.json({ success: true, deactivated: totalDeactivated, tenantsProcessed: uniqueTenants.length });
    }

  } catch (error) {
    console.error('❌ Error in pattern decay:', error);
    res.status(500).json({ error: 'Errore nella manutenzione pattern' });
  }
});

/**
 * GET /api/prioritization/history/:tenantId
 * Cronologia prioritizzazioni per un tenant
 */
router.get('/history/:tenantId', async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;

  try {
    const { data, error } = await supabase
      .from('portfolio_prioritizations')
      .select('id, created_at, items_count, confidence_score, triage_breakdown, processing_time_ms')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Errore nel recupero della cronologia' });
    }

    res.json({
      success: true,
      history: data || [],
      count: data?.length || 0,
    });

  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({ error: 'Errore nel recupero della cronologia' });
  }
});

export default router;
