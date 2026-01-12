/**
 * Portfolio Prioritization Agent
 *
 * Agente orchestratore per la prioritizzazione del portfolio IT.
 * Usa il PrioritizationFramework per:
 * - Triage MoSCoW
 * - Scoring multi-criterio (WSJF, ICE, Retention)
 * - Ottimizzazione portfolio con vincoli
 * - Apprendimento continuo dai feedback
 */

import { v4 as uuidv4 } from 'uuid';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import {
  PrioritizationFramework,
  PortfolioItemInput,
  StrategicProfile,
} from '../prioritization';
import type {
  PrioritizationInput,
  PrioritizationResult,
  OptimizationConstraints,
} from '../schemas/prioritizationSchema';

// === AGENT INPUT INTERFACE ===

interface PrioritizationAgentInput {
  tenantId: string;
  companyId?: string;

  // Items (opzionale - altrimenti caricati da DB)
  items?: PortfolioItemInput[];

  // Configurazione triage
  triageConfig?: {
    enabled?: boolean;
    confidenceThreshold?: number;
    useAI?: boolean;
  };

  // Configurazione scoring
  scoringConfig?: {
    enabled?: boolean;
    includeWSJF?: boolean;
    includeICE?: boolean;
    includeRetention?: boolean;
  };

  // Configurazione optimization
  optimizationConfig?: {
    enabled?: boolean;
    generateScenarios?: boolean;
    scenarioCount?: number;
  };

  // Vincoli
  constraints?: OptimizationConstraints;

  // Contesto strategico
  strategicContext?: StrategicProfile;

  // Modalità (full = tutto, triage = solo triage rapido)
  mode?: 'full' | 'triage' | 'score' | 'optimize';
}

// === HELPER FUNCTIONS ===

async function loadStrategicContext(tenantId: string): Promise<StrategicProfile> {
  try {
    // Carica assessment snapshot per contesto
    const { data: snapshot } = await supabase
      .from('company_assessment_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (snapshot) {
      return {
        industry: snapshot.industry || snapshot.sector,
        companySize: snapshot.company_size || 'medium',
        maturityLevel: snapshot.overall_maturity,
        budgetLevel: snapshot.budget_level || 'moderate',
        goals: snapshot.strategic_goals || [],
        priorityAreas: snapshot.priority_areas || [],
      };
    }
  } catch (err) {
    console.warn('[PrioritizationAgent] Could not load strategic context:', err);
  }

  return {};
}

// === MAIN AGENT ===

export const portfolioPrioritizationAgent: SubAgent = {
  name: 'PORTFOLIO_PRIORITIZATION',

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const startTime = Date.now();
    console.log('[PrioritizationAgent] Starting portfolio prioritization...');

    try {
      const input = args as unknown as PrioritizationAgentInput;
      const { tenantId, companyId, mode = 'full' } = input;

      if (!tenantId) {
        return {
          content: JSON.stringify({ error: 'tenantId è richiesto' }),
          metadata: { success: false, error: 'tenantId required' },
        };
      }

      // Inizializza framework con configurazione
      const framework = new PrioritizationFramework({
        triage: input.triageConfig,
        scoring: input.scoringConfig,
        optimization: input.optimizationConfig,
      });

      // Carica items
      let items: PortfolioItemInput[];
      if (input.items && input.items.length > 0) {
        items = input.items;
        console.log(`[PrioritizationAgent] Using ${items.length} provided items`);
      } else {
        items = await framework.loadItemsFromDatabase(tenantId);
        console.log(`[PrioritizationAgent] Loaded ${items.length} items from database`);
      }

      if (items.length === 0) {
        return {
          content: JSON.stringify({
            error: 'Nessun item trovato nel portfolio',
            hint: 'Caricare prima items tramite /api/portfolio/ingest',
          }),
          metadata: { success: false, error: 'No items found' },
        };
      }

      // Carica contesto strategico
      const strategicContext: StrategicProfile = {
        ...await loadStrategicContext(tenantId),
        ...input.strategicContext,
      };

      console.log(`[PrioritizationAgent] Mode: ${mode}, Items: ${items.length}`);

      // Esegui in base alla modalità
      let result: PrioritizationResult | null = null;

      switch (mode) {
        case 'triage': {
          // Solo triage rapido
          const triageResult = await framework.triageOnly(items, strategicContext);

          // Costruisci result parziale
          result = {
            prioritizationId: uuidv4(),
            tenantId,
            companyId,
            createdAt: new Date().toISOString(),
            summary: {
              totalItems: items.length,
              processedItems: triageResult.results.length,
              processingTimeMs: Date.now() - startTime,
              modelVersion: 'v1.0-triage-only',
            },
            triage: {
              results: triageResult.results,
              breakdown: triageResult.breakdown,
              averageConfidence: triageResult.averageConfidence,
            },
            scoring: {
              results: [],
              topPerformers: [],
              bottomPerformers: [],
            },
            optimization: {
              selectedItems: [],
              deferredItems: [],
              eliminationCandidates: [],
              metrics: {
                totalValue: 0,
                totalCost: 0,
                riskScore: 0,
                strategicCoverage: 0,
                diversificationIndex: 0,
              },
            },
            config: {
              triageConfig: {},
              scoringConfig: {},
              optimizationConfig: {},
            },
            confidence: triageResult.averageConfidence * 100,
          };
          break;
        }

        case 'score': {
          // Triage + Scoring
          const triageResult = await framework.triageOnly(items, strategicContext);
          const scoringResult = await framework.scoreOnly(items, triageResult.results);

          result = {
            prioritizationId: uuidv4(),
            tenantId,
            companyId,
            createdAt: new Date().toISOString(),
            summary: {
              totalItems: items.length,
              processedItems: scoringResult.results.length,
              processingTimeMs: Date.now() - startTime,
              modelVersion: 'v1.0-score-only',
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
              selectedItems: [],
              deferredItems: [],
              eliminationCandidates: [],
              metrics: {
                totalValue: 0,
                totalCost: 0,
                riskScore: 0,
                strategicCoverage: 0,
                diversificationIndex: 0,
              },
            },
            config: {
              triageConfig: {},
              scoringConfig: {},
              optimizationConfig: {},
            },
            confidence: scoringResult.averageScore,
          };
          break;
        }

        case 'optimize':
        case 'full':
        default: {
          // Pipeline completa
          result = await framework.prioritize(
            items,
            strategicContext,
            tenantId,
            companyId,
            input.constraints
          );
          break;
        }
      }

      if (!result) {
        return {
          content: JSON.stringify({ error: 'Prioritizzazione fallita' }),
          metadata: { success: false, error: 'Prioritization failed' },
        };
      }

      const processingTimeMs = Date.now() - startTime;

      console.log(`[PrioritizationAgent] Completed in ${processingTimeMs}ms`);
      console.log(`  - Triage: MUST=${result.triage.breakdown.MUST}, SHOULD=${result.triage.breakdown.SHOULD}, COULD=${result.triage.breakdown.COULD}, WONT=${result.triage.breakdown.WONT}`);
      console.log(`  - Scoring: avg=${result.scoring.results.length > 0 ? (result.scoring.results.reduce((s, r) => s + r.overallScore, 0) / result.scoring.results.length).toFixed(1) : 0}`);
      console.log(`  - Optimization: selected=${result.optimization.selectedItems.length}, deferred=${result.optimization.deferredItems.length}`);

      // Build response message
      const message = buildResponseMessage(result, mode);

      return {
        content: message,
        metadata: {
          success: true,
          prioritizationId: result.prioritizationId,
          mode,
          totalItems: items.length,
          processingTimeMs,
          triageBreakdown: result.triage.breakdown,
          optimizationMetrics: result.optimization.metrics,
          result, // Full result for API consumers
        },
      };

    } catch (error) {
      console.error('[PrioritizationAgent] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: JSON.stringify({ error: errorMessage }),
        metadata: { success: false, error: errorMessage },
      };
    }
  },
};

// === RESPONSE BUILDER ===

function buildResponseMessage(result: PrioritizationResult, mode: string): string {
  const { triage, scoring, optimization, summary } = result;

  let message = `## Portfolio Prioritization Report\n\n`;
  message += `**ID:** ${result.prioritizationId}\n`;
  message += `**Mode:** ${mode}\n`;
  message += `**Items processati:** ${summary.processedItems}/${summary.totalItems}\n`;
  message += `**Tempo:** ${summary.processingTimeMs}ms\n\n`;

  // Triage summary
  message += `### Triage MoSCoW\n\n`;
  message += `| Categoria | Count |\n|-----------|-------|\n`;
  message += `| MUST | ${triage.breakdown.MUST} |\n`;
  message += `| SHOULD | ${triage.breakdown.SHOULD} |\n`;
  message += `| COULD | ${triage.breakdown.COULD} |\n`;
  message += `| WONT | ${triage.breakdown.WONT} |\n`;
  message += `| UNKNOWN | ${triage.breakdown.UNKNOWN} |\n\n`;
  message += `*Confidence media: ${(triage.averageConfidence * 100).toFixed(0)}%*\n\n`;

  // Top performers
  if (scoring.topPerformers.length > 0) {
    message += `### Top 5 Performers\n\n`;
    for (const top of scoring.topPerformers.slice(0, 5)) {
      message += `- **${top.name}** (score: ${top.score.toFixed(1)}) - ${top.highlight}\n`;
    }
    message += `\n`;
  }

  // Optimization summary
  if (mode === 'full' || mode === 'optimize') {
    message += `### Ottimizzazione Portfolio\n\n`;
    message += `- **Selezionati:** ${optimization.selectedItems.length} items\n`;
    message += `- **Differiti:** ${optimization.deferredItems.length} items\n`;
    message += `- **Da eliminare:** ${optimization.eliminationCandidates.length} items\n\n`;

    if (optimization.metrics) {
      message += `**Metriche:**\n`;
      message += `- Valore totale: ${optimization.metrics.totalValue.toFixed(0)}\n`;
      message += `- Costo totale: €${optimization.metrics.totalCost.toLocaleString()}\n`;
      message += `- Risk score: ${(optimization.metrics.riskScore * 100).toFixed(0)}%\n`;
      message += `- Strategic coverage: ${(optimization.metrics.strategicCoverage * 100).toFixed(0)}%\n`;
      message += `- Diversification: ${(optimization.metrics.diversificationIndex * 100).toFixed(0)}%\n`;
    }
  }

  // Warnings
  if (result.warnings && result.warnings.length > 0) {
    message += `\n### Avvisi\n\n`;
    for (const warn of result.warnings) {
      message += `- ${warn}\n`;
    }
  }

  return message;
}

export default portfolioPrioritizationAgent;
