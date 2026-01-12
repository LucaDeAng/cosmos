import { v4 as uuidv4 } from 'uuid';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import {
  CatalogPrioritizationInput,
  CatalogPrioritizationResult,
  PrioritizedCatalogItem,
  SuggestedAction,
  DecisionMatrix,
  PrioritizationSummary,
  WSJFScore,
  ICEScore,
  Quadrant,
  MoSCoW,
  PriorityLevel,
  RiskLevel,
  KanoCategory,
  ActionType,
  ActionPriority,
  ImpactEffortLevel,
} from '../schemas/catalogPrioritizationSchema';
import { PortfolioAssessmentResult, ItemAssessment } from '../schemas/portfolioAssessmentSchema';
import { BudgetOptimizationResult } from '../schemas/budgetSchema';

// ============================================
// WEIGHT CONFIGURATIONS BY MATURITY
// ============================================
const MATURITY_WEIGHTS: Record<number, { wsjf: number; ice: number; retention: number; portfolio: number }> = {
  1: { wsjf: 0.20, ice: 0.40, retention: 0.20, portfolio: 0.20 },
  2: { wsjf: 0.30, ice: 0.30, retention: 0.20, portfolio: 0.20 },
  3: { wsjf: 0.35, ice: 0.25, retention: 0.20, portfolio: 0.20 },
  4: { wsjf: 0.40, ice: 0.20, retention: 0.20, portfolio: 0.20 },
  5: { wsjf: 0.40, ice: 0.15, retention: 0.25, portfolio: 0.20 },
};

// ============================================
// ACTION CONFIGURATION
// ============================================
const ACTION_CONFIG: Record<ActionType, { budgetMultiplier: number; roiExpectation: string; icon: string }> = {
  accelerate: { budgetMultiplier: 1.5, roiExpectation: '2-3x in 12 mesi', icon: '🚀' },
  invest: { budgetMultiplier: 2.5, roiExpectation: '3-5x in 18 mesi', icon: '💰' },
  maintain: { budgetMultiplier: 1.0, roiExpectation: 'Stabile', icon: '✅' },
  optimize: { budgetMultiplier: 0.8, roiExpectation: '20-40% risparmio', icon: '⚡' },
  migrate: { budgetMultiplier: 1.5, roiExpectation: 'Break-even 18-24 mesi', icon: '🔄' },
  sunset: { budgetMultiplier: 0.3, roiExpectation: 'Risparmio costi attuali', icon: '🌅' },
  rationalize: { budgetMultiplier: 0.8, roiExpectation: '30% consolidation savings', icon: '📊' },
  partner: { budgetMultiplier: 0.7, roiExpectation: 'Variabile su SLA', icon: '🤝' },
};

// ============================================
// DATA LOADING FUNCTIONS
// ============================================
async function loadAssessmentSnapshot(tenantId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

async function loadPortfolioItems(tenantId: string, portfolioType: string): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  try {
    if (portfolioType === 'products' || portfolioType === 'mixed') {
      const { data: products } = await supabase.from('portfolio_products').select('*').eq('tenant_id', tenantId);
      if (products) items.push(...products.map(p => ({ ...p, itemType: 'product' })));
    }
    if (portfolioType === 'services' || portfolioType === 'mixed') {
      const { data: services } = await supabase.from('portfolio_services').select('*').eq('tenant_id', tenantId);
      if (services) items.push(...services.map(s => ({ ...s, itemType: 'service' })));
    }
    return items;
  } catch {
    return items;
  }
}

async function loadPortfolioAssessment(tenantId: string): Promise<PortfolioAssessmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !data?.result) return null;
    return data.result as PortfolioAssessmentResult;
  } catch {
    return null;
  }
}

async function loadBudgetOptimization(tenantId: string): Promise<BudgetOptimizationResult | null> {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !data?.result) return null;
    return data.result as BudgetOptimizationResult;
  } catch {
    return null;
  }
}

// ============================================
// SCORING FUNCTIONS
// ============================================
function calculateWSJF(item: ItemAssessment, portfolioItem?: Record<string, unknown>): WSJFScore {
  const businessValue = Math.min(10, Math.round((item.scores.strategicFit * 0.5 + item.scores.valueDelivery * 0.5) / 10));
  let timeCriticality = 5;
  if (item.recommendation === 'accelerate') timeCriticality = 9;
  else if (item.recommendation === 'keep') timeCriticality = 6;
  else if (item.recommendation === 'pause') timeCriticality = 3;
  else if (item.recommendation === 'stop') timeCriticality = 1;
  const riskReduction = Math.min(10, Math.round(item.scores.riskAdjustedReturn / 10));
  const jobSize = Math.max(1, 11 - Math.round(item.scores.resourceEfficiency / 10));
  const score = Number(((businessValue + timeCriticality + riskReduction) / jobSize).toFixed(2));
  return { businessValue, timeCriticality, riskReduction, jobSize, score };
}

function calculateICE(item: ItemAssessment): ICEScore {
  const impact = Math.min(10, Math.round((item.scores.valueDelivery + item.scores.strategicFit) / 20));
  const confidence = Math.min(10, item.confidenceLevel === 'high' ? 9 : item.confidenceLevel === 'medium' ? 6 : 3);
  const ease = Math.min(10, Math.round((item.scores.resourceEfficiency + item.scores.marketTiming) / 20));
  const score = impact * confidence * ease;
  return { impact, confidence, ease, score };
}

function calculateRetentionIndex(item: ItemAssessment): number {
  const futureMarketPotential = item.scores.marketTiming / 100 * 0.20;
  const financialImpact = item.scores.valueDelivery / 100 * 0.20;
  const strategicFit = item.scores.strategicFit / 100 * 0.20;
  const resourceReq = (100 - item.scores.resourceEfficiency) / 100 * 0.15;
  const riskLevel = item.scores.riskAdjustedReturn / 100 * 0.15;
  const competitivePos = item.overallScore / 100 * 0.10;
  return Number((futureMarketPotential + financialImpact + strategicFit - resourceReq + riskLevel + competitivePos).toFixed(2));
}

function determineKanoCategory(item: ItemAssessment): KanoCategory {
  const category = (item as unknown as { category?: string }).category?.toLowerCase() || '';
  if (category.includes('security') || category.includes('compliance') || category.includes('core')) return 'must_be';
  if (category.includes('innovation') || category.includes('ai') || category.includes('digital')) return 'attractive';
  if (item.overallScore >= 70) return 'one_dimensional';
  if (item.overallScore < 40) return 'indifferent';
  return 'one_dimensional';
}

function calculateCompositeScore(
  wsjf: number,
  ice: number,
  retention: number,
  portfolioScore: number,
  weights: { wsjf: number; ice: number; retention: number; portfolio: number }
): number {
  const normalizedWSJF = Math.min(100, (wsjf / 5) * 100);
  const normalizedICE = Math.min(100, (ice / 1000) * 100);
  const normalizedRetention = retention * 100;
  return Number((
    normalizedWSJF * weights.wsjf +
    normalizedICE * weights.ice +
    normalizedRetention * weights.retention +
    portfolioScore * weights.portfolio
  ).toFixed(1));
}

// ============================================
// CLASSIFICATION FUNCTIONS
// ============================================
function determineQuadrant(compositeScore: number, ice: ICEScore): Quadrant {
  const value = compositeScore;
  const effort = 100 - ice.ease * 10;
  if (value >= 60 && effort < 50) return 'quick_win';
  if (value >= 60 && effort >= 50) return 'strategic';
  if (value < 60 && effort < 50) return 'fill_in';
  return 'rationalize';
}

function determineMoSCoW(item: ItemAssessment, wsjfScore: number, kano: KanoCategory): MoSCoW {
  if (item.recommendation === 'stop') return 'wont';
  if (kano === 'must_be' || item.recommendation === 'accelerate' || wsjfScore >= 4.0) return 'must';
  if (item.recommendation === 'keep' || wsjfScore >= 2.5) return 'should';
  if (wsjfScore >= 1.5) return 'could';
  return 'wont';
}

function determinePriority(moscow: MoSCoW, quadrant: Quadrant): PriorityLevel {
  if (moscow === 'must' && quadrant === 'quick_win') return 'critical';
  if (moscow === 'must' || quadrant === 'quick_win') return 'high';
  if (moscow === 'should' || quadrant === 'strategic') return 'medium';
  return 'low';
}

function determineRiskLevel(item: ItemAssessment): RiskLevel {
  if (item.confidenceLevel === 'low' && item.scores.riskAdjustedReturn < 40) return 'critical';
  if (item.confidenceLevel === 'low' || item.scores.riskAdjustedReturn < 50) return 'high';
  if (item.scores.riskAdjustedReturn < 70) return 'medium';
  return 'low';
}

// ============================================
// ACTION GENERATION
// ============================================
function generateSuggestedActions(
  item: ItemAssessment,
  quadrant: Quadrant,
  moscow: MoSCoW,
  retentionIndex: number,
  currentBudget: number
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  let primaryType: ActionType;
  let primaryPriority: ActionPriority;

  // Determine primary action based on quadrant and moscow
  if (quadrant === 'quick_win') {
    if (moscow === 'must') {
      primaryType = 'accelerate';
      primaryPriority = 'immediate';
    } else {
      primaryType = 'invest';
      primaryPriority = 'short_term';
    }
  } else if (quadrant === 'strategic') {
    primaryType = 'invest';
    primaryPriority = moscow === 'must' ? 'short_term' : 'medium_term';
  } else if (quadrant === 'fill_in') {
    primaryType = retentionIndex >= 0.5 ? 'maintain' : 'optimize';
    primaryPriority = 'medium_term';
  } else {
    primaryType = item.recommendation === 'stop' ? 'sunset' : 'migrate';
    primaryPriority = 'medium_term';
  }

  const config = ACTION_CONFIG[primaryType];
  const estimatedCost = Math.round(currentBudget * config.budgetMultiplier);

  // Primary action
  actions.push({
    actionId: `action-${uuidv4().slice(0, 8)}`,
    type: primaryType,
    title: getActionTitle(primaryType, item.itemName),
    description: getActionDescription(primaryType, item.itemName, quadrant),
    priority: primaryPriority,
    impact: quadrant === 'quick_win' || quadrant === 'strategic' ? 'high' : 'medium',
    effort: quadrant === 'strategic' || quadrant === 'rationalize' ? 'high' : 'low',
    expectedOutcome: config.roiExpectation,
    nextSteps: getNextSteps(primaryType),
    estimatedCost,
    estimatedROI: getEstimatedROI(primaryType, currentBudget),
    estimatedTimeframe: getTimeframe(primaryPriority),
  });

  // Secondary actions based on context
  if (quadrant === 'strategic' && moscow === 'must') {
    actions.push({
      actionId: `action-${uuidv4().slice(0, 8)}`,
      type: 'partner',
      title: `Valuta partnership per ${item.itemName}`,
      description: 'Considera collaborazione con partner specializzati per accelerare delivery e ridurre rischi',
      priority: 'short_term',
      impact: 'medium',
      effort: 'medium',
      expectedOutcome: 'Riduzione rischi e time-to-market',
      nextSteps: ['Identifica partner potenziali', 'Prepara RFI', 'Valuta costi vs benefici'],
      estimatedTimeframe: '1-2 mesi',
    });
  }

  if (quadrant === 'fill_in' && retentionIndex < 0.4) {
    actions.push({
      actionId: `action-${uuidv4().slice(0, 8)}`,
      type: 'rationalize',
      title: `Razionalizza ${item.itemName}`,
      description: 'Valuta consolidamento con altri sistemi simili',
      priority: 'long_term',
      impact: 'low',
      effort: 'medium',
      expectedOutcome: '20-30% risparmio consolidamento',
      nextSteps: ['Identifica overlap', 'Analizza dipendenze', 'Piano migrazione'],
      estimatedTimeframe: '6-12 mesi',
    });
  }

  return actions;
}

function getActionTitle(type: ActionType, itemName: string): string {
  const titles: Record<ActionType, string> = {
    accelerate: `Accelera ${itemName}`,
    invest: `Investi in ${itemName}`,
    maintain: `Mantieni ${itemName}`,
    optimize: `Ottimizza ${itemName}`,
    migrate: `Migra ${itemName}`,
    sunset: `Dismetti ${itemName}`,
    rationalize: `Razionalizza ${itemName}`,
    partner: `Partnership per ${itemName}`,
  };
  return titles[type];
}

function getActionDescription(type: ActionType, itemName: string, quadrant: Quadrant): string {
  if (type === 'accelerate') return `Quick win identificato. Accelerare investimenti e risorse per ${itemName} per massimizzare ROI rapido.`;
  if (type === 'invest') return `Investimento strategico in ${itemName}. Pianificare risorse adeguate per realizzare valore a lungo termine.`;
  if (type === 'maintain') return `${itemName} performa adeguatamente. Mantenere investimento attuale con focus su stabilità.`;
  if (type === 'optimize') return `Opportunità di ottimizzazione per ${itemName}. Ridurre costi operativi mantenendo funzionalità.`;
  if (type === 'migrate') return `Pianificare migrazione di ${itemName} verso soluzione più efficiente o moderna.`;
  if (type === 'sunset') return `${itemName} non fornisce valore adeguato. Pianificare dismissione controllata.`;
  if (type === 'rationalize') return `Consolidare ${itemName} con altri sistemi per eliminare ridondanze.`;
  return `Valutare partnership strategica per ${itemName}.`;
}

function getNextSteps(type: ActionType): string[] {
  const steps: Record<ActionType, string[]> = {
    accelerate: ['Assegnare team dedicato', 'Definire quick wins a 30 giorni', 'Setup KPI e monitoraggio'],
    invest: ['Preparare business case', 'Richiedere approvazione budget', 'Pianificare fasi implementazione'],
    maintain: ['Review trimestrale performance', 'Automatizzare dove possibile', 'Documentare best practices'],
    optimize: ['Analizzare costi attuali', 'Identificare inefficienze', 'Implementare automazione'],
    migrate: ['Assessment tecnico', 'Selezionare target platform', 'Piano migrazione dati'],
    sunset: ['Comunicare timeline', 'Identificare alternative', 'Piano transizione utenti'],
    rationalize: ['Mappare funzionalità', 'Identificare sistema target', 'Piano consolidamento'],
    partner: ['Ricerca partner', 'Due diligence', 'Negoziazione contratto'],
  };
  return steps[type];
}

function getEstimatedROI(type: ActionType, currentBudget: number): number {
  const roiMultipliers: Record<ActionType, number> = {
    accelerate: 2.5,
    invest: 3.0,
    maintain: 1.0,
    optimize: 1.3,
    migrate: 1.5,
    sunset: 0,
    rationalize: 1.3,
    partner: 1.8,
  };
  return Math.round(currentBudget * roiMultipliers[type]);
}

function getTimeframe(priority: ActionPriority): string {
  const timeframes: Record<ActionPriority, string> = {
    immediate: '0-30 giorni',
    short_term: '1-3 mesi',
    medium_term: '3-6 mesi',
    long_term: '6-12 mesi',
  };
  return timeframes[priority];
}

// ============================================
// DECISION MATRIX BUILDER
// ============================================
function buildDecisionMatrix(items: PrioritizedCatalogItem[]): DecisionMatrix {
  const matrix: DecisionMatrix = { quickWins: [], strategic: [], fillIns: [], rationalize: [] };

  for (const item of items) {
    const entry = {
      itemId: item.itemId,
      name: item.name,
      value: item.scores.compositeScore,
      effort: 100 - item.scores.ice.ease * 10,
      recommendation: item.primaryAction?.title || item.actionSummary,
    };

    if (item.quadrant === 'quick_win') matrix.quickWins.push(entry);
    else if (item.quadrant === 'strategic') matrix.strategic.push(entry);
    else if (item.quadrant === 'fill_in') matrix.fillIns.push(entry);
    else matrix.rationalize.push(entry);
  }

  // Sort each quadrant by value descending
  matrix.quickWins.sort((a, b) => b.value - a.value);
  matrix.strategic.sort((a, b) => b.value - a.value);
  matrix.fillIns.sort((a, b) => b.value - a.value);
  matrix.rationalize.sort((a, b) => a.effort - b.effort);

  return matrix;
}

// ============================================
// SUMMARY BUILDER
// ============================================
function buildSummary(items: PrioritizedCatalogItem[]): PrioritizationSummary {
  const distribution = {
    quickWins: items.filter(i => i.quadrant === 'quick_win').length,
    strategic: items.filter(i => i.quadrant === 'strategic').length,
    fillIns: items.filter(i => i.quadrant === 'fill_in').length,
    rationalize: items.filter(i => i.quadrant === 'rationalize').length,
  };

  const moscowDistribution = {
    must: items.filter(i => i.moscow === 'must').length,
    should: items.filter(i => i.moscow === 'should').length,
    could: items.filter(i => i.moscow === 'could').length,
    wont: items.filter(i => i.moscow === 'wont').length,
  };

  // Get top 5 actions from highest priority items
  const topActions = items
    .filter(i => i.primaryAction)
    .sort((a, b) => b.scores.compositeScore - a.scores.compositeScore)
    .slice(0, 5)
    .map(i => i.primaryAction!);

  const estimatedTotalInvestment = items.reduce((sum, i) => sum + (i.recommendedBudget || 0), 0);
  const estimatedTotalSavings = items
    .filter(i => i.quadrant === 'rationalize' || i.primaryAction?.type === 'optimize')
    .reduce((sum, i) => sum + (i.currentBudget || 0) * 0.3, 0);

  const estimatedOverallROI = items.reduce((sum, i) => sum + (i.expectedROI || 0), 0);

  return {
    totalItems: items.length,
    distribution,
    moscowDistribution,
    topActions,
    estimatedTotalInvestment,
    estimatedTotalSavings,
    estimatedOverallROI,
  };
}

// ============================================
// MAIN AGENT
// ============================================
export const catalogPrioritizationAgent: SubAgent = {
  name: 'CATALOG_PRIORITIZATION',

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    console.log('[CatalogPrioritization] Starting catalog prioritization...');

    try {
      const input = args as unknown as CatalogPrioritizationInput;
      const { tenantId, companyId, portfolioType = 'mixed' } = input;

      // Load data
      console.log('[CatalogPrioritization] Loading data...');
      const [assessmentSnapshot, portfolioItems, portfolioAssessment, budgetOptimization] = await Promise.all([
        loadAssessmentSnapshot(tenantId),
        loadPortfolioItems(tenantId, portfolioType),
        loadPortfolioAssessment(tenantId),
        loadBudgetOptimization(tenantId),
      ]);

      if (!portfolioAssessment?.itemAssessments?.length) {
        return {
          content: JSON.stringify({ error: 'Portfolio Assessment richiesto. Completare prima Step 3.' }),
          metadata: { success: false, error: 'Portfolio Assessment richiesto' },
        };
      }

      console.log(`[CatalogPrioritization] Loaded ${portfolioAssessment.itemAssessments.length} assessed items`);

      // Get maturity level and weights
      const maturityLevel = (assessmentSnapshot as { overall_maturity?: number } | null)?.overall_maturity || 3;
      const weights = input.customWeights || MATURITY_WEIGHTS[maturityLevel] || MATURITY_WEIGHTS[3];

      // Process items
      const prioritizedItems: PrioritizedCatalogItem[] = [];

      for (const item of portfolioAssessment.itemAssessments) {
        // Find portfolio item for additional data
        const portfolioItem = portfolioItems.find(pi =>
          String(pi.id) === item.itemId || String(pi.item_id) === item.itemId
        );
        const currentBudget = Number(portfolioItem?.budget) || 50000;
        const itemType = (portfolioItem?.itemType as 'product' | 'service') || 'product';

        // Calculate scores
        const wsjf = calculateWSJF(item, portfolioItem);
        const ice = calculateICE(item);
        const retentionIndex = calculateRetentionIndex(item);
        const kanoCategory = determineKanoCategory(item);
        const compositeScore = calculateCompositeScore(wsjf.score, ice.score, retentionIndex, item.overallScore, weights);

        // Classifications
        const quadrant = determineQuadrant(compositeScore, ice);
        const moscow = determineMoSCoW(item, wsjf.score, kanoCategory);
        const priority = determinePriority(moscow, quadrant);
        const riskLevel = determineRiskLevel(item);

        // Generate actions
        const suggestedActions = generateSuggestedActions(item, quadrant, moscow, retentionIndex, currentBudget);
        const primaryAction = suggestedActions[0];

        // Calculate recommended budget
        const actionConfig = ACTION_CONFIG[primaryAction?.type || 'maintain'];
        const recommendedBudget = Math.round(currentBudget * actionConfig.budgetMultiplier);

        prioritizedItems.push({
          itemId: item.itemId,
          name: item.itemName,
          type: itemType,
          category: String(portfolioItem?.category || ''),
          description: item.rationale,
          scores: {
            wsjf,
            ice,
            retentionIndex,
            kanoCategory,
            compositeScore,
            portfolioScore: item.overallScore,
          },
          quadrant,
          moscow,
          priority,
          priorityRank: 0,
          suggestedActions,
          primaryAction,
          actionSummary: `${ACTION_CONFIG[primaryAction?.type || 'maintain'].icon} ${primaryAction?.title || 'Valutare'}`,
          strategicFit: item.scores.strategicFit,
          riskLevel,
          currentBudget,
          recommendedBudget,
          expectedROI: getEstimatedROI(primaryAction?.type || 'maintain', currentBudget),
          portfolioRecommendation: item.recommendation,
          confidence: item.confidenceLevel === 'high' ? 90 : item.confidenceLevel === 'medium' ? 70 : 50,
          dataQuality: portfolioItem ? 85 : 60,
        });
      }

      // Sort by composite score and assign ranks
      prioritizedItems.sort((a, b) => b.scores.compositeScore - a.scores.compositeScore);
      prioritizedItems.forEach((item, idx) => { item.priorityRank = idx + 1; });

      // Build decision matrix and summary
      const decisionMatrix = buildDecisionMatrix(prioritizedItems);
      const summary = buildSummary(prioritizedItems);

      // Build result
      const prioritizationId = uuidv4();
      const result: CatalogPrioritizationResult = {
        prioritizationId,
        tenantId,
        companyId,
        generatedAt: new Date().toISOString(),
        items: prioritizedItems,
        summary,
        decisionMatrix,
        confidence: Math.round(prioritizedItems.reduce((sum, i) => sum + i.confidence, 0) / prioritizedItems.length),
        dataQualityScore: Math.round(prioritizedItems.reduce((sum, i) => sum + i.dataQuality, 0) / prioritizedItems.length),
        config: { weights, maturityLevel },
      };

      // Save to Supabase
      console.log('[CatalogPrioritization] Saving to database...');
      const { error: saveError } = await supabase.from('catalog_prioritizations').insert({
        prioritization_id: prioritizationId,
        tenant_id: tenantId,
        company_id: companyId,
        total_items: prioritizedItems.length,
        quick_wins_count: summary.distribution.quickWins,
        strategic_count: summary.distribution.strategic,
        fill_ins_count: summary.distribution.fillIns,
        rationalize_count: summary.distribution.rationalize,
        result,
        created_at: new Date().toISOString(),
      });

      if (saveError) {
        console.warn('[CatalogPrioritization] Save warning:', saveError.message);
      }

      console.log(`[CatalogPrioritization] Completed. ID: ${prioritizationId}`);

      return {
        content: JSON.stringify(result),
        metadata: { success: true, prioritizationId },
      };

    } catch (error) {
      console.error('[CatalogPrioritization] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: JSON.stringify({ error: errorMessage }),
        metadata: { success: false, error: errorMessage },
      };
    }
  },
};

export default catalogPrioritizationAgent;
