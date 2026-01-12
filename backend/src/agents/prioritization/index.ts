/**
 * Portfolio Prioritization Framework
 *
 * Framework riutilizzabile per prioritizzazione portfolio IT.
 * Usato da: PortfolioPrioritizationAgent, StrategyAdvisorAgent
 *
 * @example
 * ```typescript
 * import { PrioritizationFramework } from './prioritization';
 *
 * const framework = new PrioritizationFramework();
 * const result = await framework.prioritize(items, context);
 * ```
 */

// === TYPE EXPORTS ===
export * from './types';

// === LAYER EXPORTS ===
export { triageItems, triageSingleItem, BUILTIN_TRIAGE_RULES, DEFAULT_TRIAGE_CONFIG } from './triageLayer';
export { scoreItems, scoreSingleItem, calculateWSJF, calculateICE, calculateRetentionIndex, determineMoSCoW, calculateCompositeScore, DEFAULT_SCORING_CONFIG } from './scoringLayer';
export { optimizePortfolio, DEFAULT_OPTIMIZATION_CONFIG } from './optimizationLayer';
export { recordFeedback, minePatterns, getActivePatterns, applyPatterns, decayOldPatterns, getLearningStats, DEFAULT_LEARNING_CONFIG } from './learningLayer';

// === MAIN FRAMEWORK CLASS ===

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../config/supabase';

import type {
  PortfolioItemInput,
  StrategicProfile,
  TriageConfig,
  ScoringConfig,
  OptimizationConfig,
  LearningConfig,
  TriageLayerResult,
  ScoringLayerResult,
  OptimizationLayerResult,
  ProgressCallback,
  ProgressInfo,
  PrioritizationConfig,
  PartialPrioritizationConfig,
} from './types';
import type {
  PrioritizationResult,
  TriageResult,
  PriorityScore,
  OptimizationConstraints,
} from '../schemas/prioritizationSchema';

import { triageItems, DEFAULT_TRIAGE_CONFIG } from './triageLayer';
import { scoreItems, DEFAULT_SCORING_CONFIG } from './scoringLayer';
import { optimizePortfolio, DEFAULT_OPTIMIZATION_CONFIG } from './optimizationLayer';
import { applyPatterns, getActivePatterns, DEFAULT_LEARNING_CONFIG } from './learningLayer';

// === DEFAULT CONFIGURATION ===

export const DEFAULT_PRIORITIZATION_CONFIG: PrioritizationConfig = {
  triage: DEFAULT_TRIAGE_CONFIG,
  scoring: DEFAULT_SCORING_CONFIG,
  optimization: DEFAULT_OPTIMIZATION_CONFIG,
  learning: DEFAULT_LEARNING_CONFIG,
};

// === PRIORITIZATION FRAMEWORK ===

export class PrioritizationFramework {
  private config: PrioritizationConfig;
  private onProgress?: ProgressCallback;

  constructor(config: PartialPrioritizationConfig = {}) {
    this.config = {
      triage: { ...DEFAULT_TRIAGE_CONFIG, ...config.triage } as TriageConfig,
      scoring: { ...DEFAULT_SCORING_CONFIG, ...config.scoring } as ScoringConfig,
      optimization: { ...DEFAULT_OPTIMIZATION_CONFIG, ...config.optimization } as OptimizationConfig,
      learning: { ...DEFAULT_LEARNING_CONFIG, ...config.learning } as LearningConfig,
    };
  }

  /**
   * Configura callback per progress updates
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Emetti progress event
   */
  private emitProgress(info: ProgressInfo): void {
    if (this.onProgress) {
      this.onProgress(info);
    }
  }

  /**
   * Esegue pipeline completa di prioritizzazione
   */
  async prioritize(
    items: PortfolioItemInput[],
    context: StrategicProfile = {},
    tenantId: string,
    companyId?: string,
    constraints?: OptimizationConstraints
  ): Promise<PrioritizationResult> {
    const prioritizationId = uuidv4();
    const startTime = Date.now();

    console.log(`[PrioritizationFramework] Starting prioritization ${prioritizationId} for ${items.length} items`);

    this.emitProgress({
      phase: 'loading',
      message: 'Caricamento items...',
      progress: 0,
      totalItems: items.length,
    });

    // === FASE 1: TRIAGE ===
    this.emitProgress({
      phase: 'triage',
      message: 'Classificazione MoSCoW...',
      progress: 10,
    });

    const triageResult: TriageLayerResult = await triageItems(
      items,
      context,
      this.config.triage
    );

    this.emitProgress({
      phase: 'triage',
      message: `Triage completato: ${triageResult.breakdown.MUST} MUST, ${triageResult.breakdown.SHOULD} SHOULD`,
      progress: 30,
      itemsProcessed: triageResult.results.length,
    });

    // === FASE 2: SCORING ===
    this.emitProgress({
      phase: 'scoring',
      message: 'Calcolo scores multi-criterio...',
      progress: 35,
    });

    const scoringResult: ScoringLayerResult = await scoreItems(
      items,
      triageResult.results,
      this.config.scoring
    );

    this.emitProgress({
      phase: 'scoring',
      message: `Scoring completato. Media: ${scoringResult.averageScore.toFixed(1)}`,
      progress: 60,
      itemsProcessed: scoringResult.results.length,
    });

    // === FASE 2.5: APPLY LEARNED PATTERNS ===
    let patternsApplied: string[] = [];

    if (this.config.learning.enabled) {
      this.emitProgress({
        phase: 'learning',
        message: 'Applicazione pattern appresi...',
        progress: 65,
      });

      const adjustedResults: PriorityScore[] = [];

      for (const score of scoringResult.results) {
        const item = items.find(i => i.id === score.itemId);
        const itemFeatures = item ? {
          type: item.type,
          category: item.category,
          tags: item.tags,
          riskLevel: item.riskLevel,
          lifecycle: item.lifecycle,
          businessValue: item.businessValue,
          strategicAlignment: item.strategicAlignment,
        } : {};

        const { adjustedScore, patternsApplied: applied } = await applyPatterns(
          score,
          itemFeatures,
          tenantId
        );

        adjustedResults.push(adjustedScore);
        patternsApplied.push(...applied);
      }

      // Sostituisci risultati con quelli adjusted
      scoringResult.results.splice(0, scoringResult.results.length, ...adjustedResults);
    }

    // === FASE 3: OPTIMIZATION ===
    this.emitProgress({
      phase: 'optimization',
      message: 'Ottimizzazione portfolio...',
      progress: 70,
    });

    const optimizationResult: OptimizationLayerResult = await optimizePortfolio(
      scoringResult.results,
      constraints,
      this.config.optimization
    );

    this.emitProgress({
      phase: 'optimization',
      message: `Ottimizzazione completata. Selezionati: ${optimizationResult.selectedItems.length}`,
      progress: 90,
    });

    // === SALVATAGGIO ===
    const processingTimeMs = Date.now() - startTime;

    // Salva su Supabase
    try {
      await supabase
        .from('portfolio_prioritizations')
        .insert({
          id: prioritizationId,
          tenant_id: tenantId,
          company_id: companyId,
          triage_results: triageResult.results,
          triage_breakdown: triageResult.breakdown,
          scoring_results: scoringResult.results,
          optimization_results: {
            selectedItems: optimizationResult.selectedItems.map(i => i.itemId),
            deferredItems: optimizationResult.deferredItems.map(i => i.itemId),
            eliminationCandidates: optimizationResult.eliminationCandidates.map(i => i.itemId),
            metrics: optimizationResult.metrics,
            scenarios: optimizationResult.scenarios,
          },
          config: this.config,
          strategic_context: context,
          patterns_applied: [...new Set(patternsApplied)],
          items_count: items.length,
          processing_time_ms: processingTimeMs,
          model_version: 'v1.0',
          confidence_score: scoringResult.averageScore,
        });

      console.log(`[PrioritizationFramework] Saved prioritization ${prioritizationId}`);
    } catch (err) {
      console.warn('[PrioritizationFramework] Error saving to Supabase:', err);
    }

    this.emitProgress({
      phase: 'complete',
      message: 'Prioritizzazione completata',
      progress: 100,
      itemsProcessed: items.length,
    });

    // === BUILD RESULT ===
    return {
      prioritizationId,
      tenantId,
      companyId,
      createdAt: new Date().toISOString(),

      summary: {
        totalItems: items.length,
        processedItems: scoringResult.results.length,
        processingTimeMs,
        modelVersion: 'v1.0',
      },

      triage: {
        results: triageResult.results,
        breakdown: triageResult.breakdown,
        averageConfidence: triageResult.averageConfidence,
      },

      scoring: {
        results: scoringResult.results,
        topPerformers: scoringResult.topPerformers,
        bottomPerformers: scoringResult.bottomPerformers,
      },

      optimization: {
        selectedItems: optimizationResult.selectedItems,
        deferredItems: optimizationResult.deferredItems,
        eliminationCandidates: optimizationResult.eliminationCandidates,
        metrics: optimizationResult.metrics,
        scenarios: optimizationResult.scenarios,
      },

      config: {
        triageConfig: this.config.triage as unknown as Record<string, unknown>,
        scoringConfig: this.config.scoring as unknown as Record<string, unknown>,
        optimizationConfig: this.config.optimization as unknown as Record<string, unknown>,
      },

      confidence: scoringResult.averageScore,
      warnings: optimizationResult.constraintViolations,
      patternsApplied: [...new Set(patternsApplied)],
    };
  }

  /**
   * Esegue solo triage (per preview rapida)
   */
  async triageOnly(
    items: PortfolioItemInput[],
    context: StrategicProfile = {}
  ): Promise<TriageLayerResult> {
    return triageItems(items, context, this.config.triage);
  }

  /**
   * Esegue solo scoring (senza optimization)
   */
  async scoreOnly(
    items: PortfolioItemInput[],
    triageResults?: TriageResult[]
  ): Promise<ScoringLayerResult> {
    return scoreItems(items, triageResults, this.config.scoring);
  }

  /**
   * Esegue solo optimization su items già scored
   */
  async optimizeOnly(
    scoredItems: PriorityScore[],
    constraints?: OptimizationConstraints
  ): Promise<OptimizationLayerResult> {
    return optimizePortfolio(scoredItems, constraints, this.config.optimization);
  }

  /**
   * Carica items dal database per un tenant
   */
  async loadItemsFromDatabase(tenantId: string): Promise<PortfolioItemInput[]> {
    const items: PortfolioItemInput[] = [];

    try {
      // Carica initiatives
      const { data: initiatives } = await supabase
        .from('initiatives')
        .select('*')
        .eq('tenant_id', tenantId);

      if (initiatives) {
        for (const init of initiatives) {
          items.push({
            id: init.id,
            name: init.name || init.title,
            type: 'initiative',
            description: init.description,
            status: init.status,
            category: init.category,
            tags: init.tags || [],
            businessValue: init.business_value,
            budget: init.budget,
            estimatedCost: init.estimated_cost,
            riskLevel: init.risk_level,
            strategicAlignment: init.strategic_alignment,
            owner: init.owner,
            startDate: init.start_date,
            endDate: init.end_date,
            dependencies: init.dependencies || [],
          });
        }
      }

      // Carica products
      const { data: products } = await supabase
        .from('portfolio_products')
        .select('*')
        .eq('tenant_id', tenantId);

      if (products) {
        for (const prod of products) {
          items.push({
            id: prod.id,
            name: prod.name,
            type: 'product',
            description: prod.description,
            status: prod.status,
            category: prod.category,
            tags: prod.tags || [],
            businessValue: prod.business_value,
            budget: prod.budget,
            lifecycle: prod.lifecycle,
            activeUsers: prod.active_users,
          });
        }
      }

      // Carica services
      const { data: services } = await supabase
        .from('portfolio_services')
        .select('*')
        .eq('tenant_id', tenantId);

      if (services) {
        for (const svc of services) {
          items.push({
            id: svc.id,
            name: svc.name,
            type: 'service',
            description: svc.description,
            status: svc.status,
            category: svc.category,
            tags: svc.tags || [],
            businessValue: svc.business_value,
            budget: svc.budget,
          });
        }
      }

      console.log(`[PrioritizationFramework] Loaded ${items.length} items from database`);
    } catch (err) {
      console.error('[PrioritizationFramework] Error loading items:', err);
    }

    return items;
  }
}

// === SINGLETON INSTANCE ===

let defaultInstance: PrioritizationFramework | null = null;

export function getDefaultFramework(): PrioritizationFramework {
  if (!defaultInstance) {
    defaultInstance = new PrioritizationFramework();
  }
  return defaultInstance;
}

export default PrioritizationFramework;
