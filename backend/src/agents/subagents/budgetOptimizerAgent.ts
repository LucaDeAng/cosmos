import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import {
  BudgetOptimizerInput,
  BudgetOptimizationResult,
  BudgetOptimizationResultSchema,
  BudgetScenario,
  BudgetAllocation,
  OptimizationRecommendation,
} from '../schemas/budgetSchema';
import { PortfolioAssessmentResult } from '../schemas/portfolioAssessmentSchema';
import { RoadmapResult } from '../schemas/roadmapSchema';

// Load system prompt
let systemPrompt: string;
try {
  const promptPath = path.resolve(__dirname, '../prompts/budget-optimizer-prompt.md');
  systemPrompt = fs.readFileSync(promptPath, { encoding: 'utf8' });
} catch (e) {
  systemPrompt = 'You are THEMIS Budget Optimizer Agent. Optimize budget allocation for IT initiatives.';
}

/**
 * Carica l'assessment snapshot (maturità IT) da Supabase
 */
async function loadAssessmentSnapshot(tenantId: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!tenantId) return null;
  
  try {
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.warn('Could not load assessment snapshot:', error.message);
      return null;
    }
    
    return data;
  } catch (err) {
    console.warn('Error loading assessment snapshot:', err);
    return null;
  }
}

/**
 * Carica l'ultimo portfolio assessment da Supabase
 */
async function loadPortfolioAssessment(tenantId: string | null | undefined): Promise<PortfolioAssessmentResult | null> {
  if (!tenantId) return null;
  
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.warn('Could not load portfolio assessment:', error.message);
      return null;
    }
    
    return data?.result as PortfolioAssessmentResult;
  } catch (err) {
    console.warn('Error loading portfolio assessment:', err);
    return null;
  }
}

/**
 * Carica l'ultima roadmap da Supabase
 */
async function loadRoadmap(tenantId: string | null | undefined, roadmapId?: string): Promise<RoadmapResult | null> {
  if (!tenantId && !roadmapId) return null;
  
  try {
    let query = supabase
      .from('roadmaps')
      .select('result')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (roadmapId) {
      query = query.eq('roadmap_id', roadmapId);
    } else if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    const { data, error } = await query.single();
    
    if (error) {
      console.warn('Could not load roadmap:', error.message);
      return null;
    }
    
    return data?.result as RoadmapResult;
  } catch (err) {
    console.warn('Error loading roadmap:', err);
    return null;
  }
}

/**
 * Carica items del portfolio da Supabase
 */
async function loadPortfolioItems(tenantId: string | null | undefined): Promise<Array<Record<string, unknown>>> {
  if (!tenantId) return [];
  
  try {
    const [initiatives, products, services] = await Promise.all([
      supabase
        .from('initiatives')
        .select('*')
        .eq('tenant_id', tenantId),
      supabase
        .from('portfolio_products')
        .select('*')
        .eq('tenant_id', tenantId),
      supabase
        .from('portfolio_services')
        .select('*')
        .eq('tenant_id', tenantId),
    ]);
    
    const items: Array<Record<string, unknown>> = [];
    
    if (initiatives.data) {
      items.push(...initiatives.data.map(i => ({ ...i, itemType: 'initiative' })));
    }
    if (products.data) {
      items.push(...products.data.map(p => ({ ...p, itemType: 'product' })));
    }
    if (services.data) {
      items.push(...services.data.map(s => ({ ...s, itemType: 'service' })));
    }
    
    return items;
  } catch (err) {
    console.warn('Error loading portfolio items:', err);
    return [];
  }
}

/**
 * Salva l'ottimizzazione budget su Supabase
 */
async function saveBudgetOptimization(optimization: BudgetOptimizationResult): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('budget_optimizations')
      .upsert({
        optimization_id: optimization.optimizationId,
        tenant_id: optimization.tenantId,
        company_id: optimization.companyId,
        roadmap_id: optimization.roadmapId,
        version: optimization.version,
        total_available_budget: optimization.inputSummary.totalAvailableBudget,
        total_requested_budget: optimization.inputSummary.totalRequestedBudget,
        executive_summary: optimization.executiveSummary,
        scenarios: optimization.scenarios,
        recommended_scenario: optimization.recommendedScenario,
        optimization_recommendations: optimization.optimizationRecommendations,
        investment_priorities: optimization.investmentPriorities,
        quarterly_budget_plan: optimization.quarterlyBudgetPlan,
        financial_kpis: optimization.financialKPIs,
        confidence_level: optimization.confidenceLevel,
        result: optimization,
        created_at: optimization.createdAt,
      }, { onConflict: 'optimization_id' });
    
    if (error) {
      console.error('Error saving budget optimization:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Exception saving budget optimization:', err);
    return false;
  }
}

/**
 * Calcola il budget totale richiesto dal portfolio
 */
function calculateTotalRequestedBudget(
  portfolioItems: Array<Record<string, unknown>>,
  portfolioAssessment: PortfolioAssessmentResult | null,
  roadmap: RoadmapResult | null
): number {
  let total = 0;
  
  // Budget da items portfolio
  for (const item of portfolioItems) {
    const budget = Number(item.budget) || Number(item.estimated_budget) || 0;
    total += budget;
  }
  
  // Se c'è la roadmap, usa il budget stimato
  if (roadmap?.totalBudget?.estimated) {
    return Math.max(total, roadmap.totalBudget.estimated);
  }
  
  return total || 360000; // Default €360k se non ci sono dati
}

/**
 * Calcola lo score ROI per un item
 */
function calculateROIScore(item: Record<string, unknown>, assessment: Record<string, unknown> | null): number {
  const expectedBenefit = Number(item.expected_benefit) || Number(item.value) || 50000;
  const cost = Number(item.budget) || Number(item.estimated_budget) || 30000;
  
  if (cost === 0) return 50;
  
  const roi = ((expectedBenefit - cost) / cost) * 100;
  
  // Normalizza a 0-100
  if (roi > 200) return 100;
  if (roi > 100) return 80 + (roi - 100) / 5;
  if (roi > 50) return 60 + (roi - 50);
  if (roi > 0) return 30 + roi;
  return Math.max(0, 30 + roi / 2);
}

/**
 * Calcola lo score strategico per un item
 */
function calculateStrategicScore(
  item: Record<string, unknown>, 
  assessment: Record<string, unknown> | null,
  portfolioAssessment: PortfolioAssessmentResult | null
): number {
  // Check se c'è un assessment score per questo item
  if (portfolioAssessment?.itemAssessments) {
    const itemAssessment = portfolioAssessment.itemAssessments.find(
      a => a.itemId === item.id || a.itemId === item.item_id
    );
    if (itemAssessment) {
      return itemAssessment.overallScore;
    }
  }
  
  // Score di default basato su priority e status
  const priorityScore: Record<string, number> = {
    'critical': 90,
    'high': 75,
    'medium': 50,
    'low': 25,
  };
  
  const priority = String(item.priority || 'medium').toLowerCase();
  return priorityScore[priority] || 50;
}

/**
 * Genera allocazioni per uno scenario
 */
function generateScenarioAllocations(
  items: Array<Record<string, unknown>>,
  scenarioType: 'conservative' | 'balanced' | 'aggressive',
  totalBudget: number,
  portfolioAssessment: PortfolioAssessmentResult | null,
  roadmap: RoadmapResult | null
): BudgetAllocation[] {
  const allocations: BudgetAllocation[] = [];
  
  // Calcola budget target per scenario
  const budgetMultipliers = {
    conservative: 0.75, // Usa 75% del budget
    balanced: 0.90,     // Usa 90% del budget
    aggressive: 0.98,   // Usa 98% del budget
  };
  
  const targetBudget = totalBudget * budgetMultipliers[scenarioType];
  let allocatedTotal = 0;
  
  // Ordina items per priorità
  const sortedItems = [...items].sort((a, b) => {
    const scoreA = calculateStrategicScore(a, null, portfolioAssessment);
    const scoreB = calculateStrategicScore(b, null, portfolioAssessment);
    return scoreB - scoreA;
  });
  
  // Allocazione progressiva
  for (const item of sortedItems) {
    if (allocatedTotal >= targetBudget) break;
    
    const itemBudget = Number(item.budget) || Number(item.estimated_budget) || 30000;
    const strategicScore = calculateStrategicScore(item, null, portfolioAssessment);
    const roiScore = calculateROIScore(item, null);
    
    // Calcola allocazione basata su scenario
    let allocationRatio = 1.0;
    if (scenarioType === 'conservative') {
      allocationRatio = strategicScore > 70 ? 1.0 : strategicScore > 50 ? 0.7 : 0.3;
    } else if (scenarioType === 'balanced') {
      allocationRatio = strategicScore > 70 ? 1.0 : strategicScore > 50 ? 0.85 : 0.5;
    } else {
      allocationRatio = strategicScore > 50 ? 1.0 : 0.7;
    }
    
    const allocatedBudget = Math.min(
      itemBudget * allocationRatio,
      targetBudget - allocatedTotal
    );
    
    if (allocatedBudget > 0) {
      allocations.push({
        itemId: String(item.id || item.item_id || uuidv4()),
        itemName: String(item.name || item.title || 'Unnamed Item'),
        itemType: (item.itemType as 'product' | 'service') || 'product',
        allocatedBudget: Math.round(allocatedBudget),
        originalBudget: itemBudget,
        budgetChange: Math.round(allocatedBudget - itemBudget),
        budgetChangePercentage: Math.round(((allocatedBudget - itemBudget) / itemBudget) * 100),
        priority: Math.round(strategicScore / 10),
        strategicScore,
        roiScore,
        riskAdjustedScore: Math.round(strategicScore * 0.6 + roiScore * 0.4),
        phase: getPhaseForItem(item, roadmap),
        quarter: getQuarterForItem(item),
        allocationRationale: generateAllocationRationale(item, scenarioType, allocationRatio),
        isMandatory: Boolean(item.is_mandatory),
        isQuickWin: Boolean(item.is_quick_win) || strategicScore > 80 && roiScore > 70,
        needsReview: allocationRatio < 0.7,
      });
      
      allocatedTotal += allocatedBudget;
    }
  }
  
  return allocations;
}

function getPhaseForItem(item: Record<string, unknown>, roadmap: RoadmapResult | null): string {
  if (roadmap?.phases) {
    const phase = roadmap.phases.find(p => 
      p.initiatives.some(i => i.itemId === item.id || i.itemId === item.item_id)
    );
    if (phase) return phase.name;
  }
  return String(item.phase || 'Phase 1');
}

function getQuarterForItem(item: Record<string, unknown>): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${quarter} ${now.getFullYear()}`;
}

function generateAllocationRationale(
  item: Record<string, unknown>, 
  scenarioType: string,
  ratio: number
): string {
  const name = String(item.name || item.title || 'Item');
  
  if (ratio >= 1.0) {
    return `${name}: Full budget allocated - high strategic priority`;
  } else if (ratio >= 0.7) {
    return `${name}: Partial allocation (${Math.round(ratio * 100)}%) - ${scenarioType} approach to moderate risk`;
  } else {
    return `${name}: Reduced allocation (${Math.round(ratio * 100)}%) - lower priority in ${scenarioType} scenario`;
  }
}

/**
 * Genera uno scenario budget completo
 */
function generateScenario(
  scenarioType: 'conservative' | 'balanced' | 'aggressive',
  items: Array<Record<string, unknown>>,
  totalBudget: number,
  portfolioAssessment: PortfolioAssessmentResult | null,
  roadmap: RoadmapResult | null
): BudgetScenario {
  const allocations = generateScenarioAllocations(
    items, scenarioType, totalBudget, portfolioAssessment, roadmap
  );
  
  const allocatedBudget = allocations.reduce((sum, a) => sum + a.allocatedBudget, 0);
  const avgROI = allocations.reduce((sum, a) => sum + a.roiScore, 0) / allocations.length || 0;
  const avgStrategic = allocations.reduce((sum, a) => sum + a.strategicScore, 0) / allocations.length || 0;
  
  const scenarioDescriptions = {
    conservative: 'Approccio prudente: priorità a investimenti sicuri e ROI garantito. Mantiene riserva budget significativa.',
    balanced: 'Approccio bilanciato: mix ottimale tra sicurezza e opportunità di crescita. Budget allocation equilibrata.',
    aggressive: 'Approccio aggressivo: massimizza investimento in iniziative ad alto impatto. Riserva budget minima.',
  };
  
  // Calcola breakdown per categoria
  const categoryMap = new Map<string, { amount: number; count: number }>();
  for (const alloc of allocations) {
    const cat = alloc.itemType;
    const existing = categoryMap.get(cat) || { amount: 0, count: 0 };
    categoryMap.set(cat, { 
      amount: existing.amount + alloc.allocatedBudget, 
      count: existing.count + 1 
    });
  }
  
  const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    amount: data.amount,
    percentage: Math.round((data.amount / allocatedBudget) * 100),
    itemCount: data.count,
  }));
  
  // Calcola breakdown per fase
  const phaseMap = new Map<string, { amount: number; count: number }>();
  for (const alloc of allocations) {
    const phase = alloc.phase;
    const existing = phaseMap.get(phase) || { amount: 0, count: 0 };
    phaseMap.set(phase, { 
      amount: existing.amount + alloc.allocatedBudget, 
      count: existing.count + 1 
    });
  }
  
  const phaseBreakdown = Array.from(phaseMap.entries()).map(([phase, data]) => ({
    phase,
    amount: data.amount,
    percentage: Math.round((data.amount / allocatedBudget) * 100),
    itemCount: data.count,
  }));
  
  // Priority breakdown
  const highPriority = allocations.filter(a => a.priority >= 8);
  const medPriority = allocations.filter(a => a.priority >= 5 && a.priority < 8);
  const lowPriority = allocations.filter(a => a.priority < 5);
  
  const priorityBreakdown = [
    { 
      priorityLevel: 'High', 
      amount: highPriority.reduce((s, a) => s + a.allocatedBudget, 0),
      percentage: Math.round((highPriority.reduce((s, a) => s + a.allocatedBudget, 0) / allocatedBudget) * 100),
      itemCount: highPriority.length,
    },
    { 
      priorityLevel: 'Medium', 
      amount: medPriority.reduce((s, a) => s + a.allocatedBudget, 0),
      percentage: Math.round((medPriority.reduce((s, a) => s + a.allocatedBudget, 0) / allocatedBudget) * 100),
      itemCount: medPriority.length,
    },
    { 
      priorityLevel: 'Low', 
      amount: lowPriority.reduce((s, a) => s + a.allocatedBudget, 0),
      percentage: Math.round((lowPriority.reduce((s, a) => s + a.allocatedBudget, 0) / allocatedBudget) * 100),
      itemCount: lowPriority.length,
    },
  ];
  
  const riskLevel = scenarioType === 'conservative' ? 'low' : scenarioType === 'balanced' ? 'medium' : 'high';
  
  return {
    scenarioId: `scenario-${scenarioType}-${uuidv4().slice(0, 8)}`,
    scenarioName: `Scenario ${scenarioType.charAt(0).toUpperCase() + scenarioType.slice(1)}`,
    scenarioType,
    description: scenarioDescriptions[scenarioType],
    totalBudget,
    allocatedBudget: Math.round(allocatedBudget),
    remainingBudget: Math.round(totalBudget - allocatedBudget),
    utilizationPercentage: Math.round((allocatedBudget / totalBudget) * 100),
    allocations,
    categoryBreakdown,
    phaseBreakdown,
    priorityBreakdown,
    expectedOutcomes: {
      totalROI: Math.round(avgROI * 1.5), // Stima ROI basata su score
      paybackMonths: scenarioType === 'aggressive' ? 12 : scenarioType === 'balanced' ? 18 : 24,
      riskLevel,
      strategicAlignmentScore: Math.round(avgStrategic),
      portfolioBalanceScore: Math.round(70 + (priorityBreakdown[1].percentage * 0.3)), // Bonus per bilanciamento
    },
    tradeOffs: generateTradeOffs(scenarioType, allocations),
    scenarioRisks: generateScenarioRisks(scenarioType),
    isRecommended: scenarioType === 'balanced', // Default: balanced è raccomandato
    recommendationReason: scenarioType === 'balanced' 
      ? 'Scenario bilanciato offre il miglior rapporto rischio/rendimento per la maggior parte delle organizzazioni'
      : undefined,
  };
}

function generateTradeOffs(
  scenarioType: string, 
  allocations: BudgetAllocation[]
): Array<{ description: string; impact: 'positive' | 'negative' | 'neutral'; affectedItems: string[] }> {
  const tradeOffs: Array<{ description: string; impact: 'positive' | 'negative' | 'neutral'; affectedItems: string[] }> = [];
  
  if (scenarioType === 'conservative') {
    const reducedItems = allocations.filter(a => (a.budgetChangePercentage || 0) < -20);
    if (reducedItems.length > 0) {
      tradeOffs.push({
        description: 'Riduzione budget su iniziative a medio-basso impatto strategico',
        impact: 'negative',
        affectedItems: reducedItems.map(a => a.itemId),
      });
    }
    tradeOffs.push({
      description: 'Maggiore riserva budget per imprevisti (25%+)',
      impact: 'positive',
      affectedItems: [],
    });
  }
  
  if (scenarioType === 'aggressive') {
    tradeOffs.push({
      description: 'Riserva budget limitata (<5%) - minore flessibilità',
      impact: 'negative',
      affectedItems: [],
    });
    tradeOffs.push({
      description: 'Massimizzazione investimento su iniziative strategiche',
      impact: 'positive',
      affectedItems: allocations.filter(a => a.strategicScore > 80).map(a => a.itemId),
    });
  }
  
  return tradeOffs;
}

function generateScenarioRisks(
  scenarioType: string
): Array<{ risk: string; likelihood: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high'; mitigation: string }> {
  const baseRisks: Array<{ risk: string; likelihood: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high'; mitigation: string }> = [
    {
      risk: 'Variazioni impreviste nei costi',
      likelihood: 'medium',
      impact: scenarioType === 'aggressive' ? 'high' : 'medium',
      mitigation: scenarioType === 'conservative' 
        ? 'Riserva budget del 25% mitiga questo rischio'
        : 'Monitoraggio mensile e early warning system',
    },
  ];
  
  if (scenarioType === 'aggressive') {
    baseRisks.push({
      risk: 'Budget insufficiente per imprevisti',
      likelihood: 'high',
      impact: 'high',
      mitigation: 'Definire priorità chiare per eventuale de-scoping rapido',
    });
  }
  
  if (scenarioType === 'conservative') {
    baseRisks.push({
      risk: 'Opportunità mancate per eccessiva prudenza',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Review trimestrale per riallocazione budget inutilizzato',
    });
  }
  
  return baseRisks;
}

/**
 * Genera raccomandazioni di ottimizzazione
 */
function generateOptimizationRecommendations(
  items: Array<Record<string, unknown>>,
  portfolioAssessment: PortfolioAssessmentResult | null,
  roadmap: RoadmapResult | null
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  
  // 1. Trova items con ROI basso da riallocare
  const lowROIItems = items.filter(i => calculateROIScore(i, null) < 40);
  const highROIItems = items.filter(i => calculateROIScore(i, null) > 70);
  
  if (lowROIItems.length > 0 && highROIItems.length > 0) {
    const totalLowBudget = lowROIItems.reduce((s, i) => s + (Number(i.budget) || 30000), 0);
    recommendations.push({
      id: 'rec-realloc-1',
      type: 'reallocation',
      title: 'Riallocazione da iniziative low-ROI',
      description: `Riallocare budget da ${lowROIItems.length} iniziative a basso ROI verso quelle ad alto rendimento`,
      savingsAmount: Math.round(totalLowBudget * 0.3),
      roiImprovement: 25,
      affectedItems: [
        ...lowROIItems.slice(0, 3).map(i => ({
          itemId: String(i.id || i.item_id),
          itemName: String(i.name || i.title),
          currentBudget: Number(i.budget) || 30000,
          proposedBudget: Math.round((Number(i.budget) || 30000) * 0.7),
          change: -Math.round((Number(i.budget) || 30000) * 0.3),
        })),
      ],
      implementationSteps: [
        'Identificare le iniziative a basso ROI',
        'Valutare impatto del de-funding',
        'Riallocare budget su iniziative prioritarie',
        'Comunicare ai team interessati',
      ],
      effort: 'medium',
      timeframe: '4-6 settimane',
      priority: 'high',
      confidence: 'high',
    });
  }
  
  // 2. Suggerimento phasing per grandi iniziative
  const largeItems = items.filter(i => (Number(i.budget) || 0) > 100000);
  if (largeItems.length > 0) {
    recommendations.push({
      id: 'rec-phasing-1',
      type: 'phasing',
      title: 'Phasing iniziative ad alto budget',
      description: `Suddividere ${largeItems.length} iniziative >€100k in fasi per ridurre rischio finanziario`,
      riskReduction: 'Riduzione rischio del 40% tramite delivery incrementale',
      affectedItems: largeItems.slice(0, 2).map(i => ({
        itemId: String(i.id || i.item_id),
        itemName: String(i.name || i.title),
        currentBudget: Number(i.budget) || 100000,
        proposedBudget: Math.round((Number(i.budget) || 100000) / 3),
        change: -Math.round((Number(i.budget) || 100000) * 2 / 3),
      })),
      implementationSteps: [
        'Definire milestone intermedie',
        'Creare business case per ogni fase',
        'Approvare budget fase per fase',
        'Implementare gate review tra fasi',
      ],
      effort: 'low',
      timeframe: '2-3 settimane',
      priority: 'medium',
      confidence: 'high',
    });
  }
  
  // 3. Quick wins identification
  if (portfolioAssessment?.itemAssessments) {
    const quickWinCandidates = portfolioAssessment.itemAssessments
      .filter(a => a.overallScore > 70 && a.recommendation === 'accelerate')
      .slice(0, 3);
    
    if (quickWinCandidates.length > 0) {
      recommendations.push({
        id: 'rec-accel-1',
        type: 'acceleration',
        title: 'Accelerare Quick Wins identificati',
        description: `Anticipare ${quickWinCandidates.length} iniziative ad alto score per generare valore rapido`,
        roiImprovement: 35,
        affectedItems: quickWinCandidates.map(a => ({
          itemId: a.itemId,
          itemName: a.itemName,
          currentBudget: 0,
          proposedBudget: 0,
          change: 0,
        })),
        implementationSteps: [
          'Confermare disponibilità risorse',
          'Rimuovere blocchi organizzativi',
          'Allocare budget supplementare se necessario',
          'Avviare immediatamente',
        ],
        effort: 'low',
        timeframe: '1-2 settimane',
        priority: 'critical',
        confidence: 'high',
      });
    }
  }
  
  return recommendations;
}

/**
 * Genera piano budget trimestrale
 */
function generateQuarterlyPlan(
  totalBudget: number,
  horizonMonths: number,
  roadmap: RoadmapResult | null
): Array<{ quarter: string; year: number; plannedSpend: number; cumulativeSpend: number; keyMilestones: string[] }> {
  const now = new Date();
  const startYear = now.getFullYear();
  const startQuarter = Math.ceil((now.getMonth() + 1) / 3);
  const numQuarters = Math.ceil(horizonMonths / 3);
  
  const plan: Array<{ quarter: string; year: number; plannedSpend: number; cumulativeSpend: number; keyMilestones: string[] }> = [];
  let cumulative = 0;
  
  // Distribuzione tipica: più budget nelle fasi iniziali e centrali
  const distributions = [0.15, 0.20, 0.20, 0.18, 0.15, 0.12]; // 6 quarter pattern
  
  for (let i = 0; i < numQuarters; i++) {
    const qNum = ((startQuarter - 1 + i) % 4) + 1;
    const year = startYear + Math.floor((startQuarter - 1 + i) / 4);
    const distribution = distributions[i % distributions.length] || 0.1;
    const plannedSpend = Math.round(totalBudget * distribution);
    cumulative += plannedSpend;
    
    // Milestone dalla roadmap se disponibile
    const milestones: string[] = [];
    if (roadmap?.phases) {
      for (const phase of roadmap.phases) {
        const phaseQuarter = Math.ceil(phase.startMonth / 3);
        if (phaseQuarter === i + 1) {
          milestones.push(`Inizio ${phase.name}`);
        }
        for (const ms of phase.milestones) {
          if (ms.targetDate.includes(`${i + 1}`) || ms.targetDate.includes(`Month ${(i + 1) * 3}`)) {
            milestones.push(ms.name);
          }
        }
      }
    }
    
    if (milestones.length === 0) {
      milestones.push(i === 0 ? 'Kickoff progetto' : `Review Q${qNum}`);
    }
    
    plan.push({
      quarter: `Q${qNum}`,
      year,
      plannedSpend,
      cumulativeSpend: cumulative,
      keyMilestones: milestones.slice(0, 3),
    });
  }
  
  return plan;
}

/**
 * Budget Optimizer Agent
 * STEP 5 nel flusso sequenziale THEMIS
 */
export const budgetOptimizerAgent: SubAgent = {
  name: 'BUDGET_OPTIMIZER',
  
  async run(args): Promise<SubAgentResult> {
    console.log('💰 BUDGET_OPTIMIZER invoked');
    
    try {
      // Parse input
      const input: BudgetOptimizerInput = typeof args === 'string' ? JSON.parse(args) : args;
      const {
        tenantId,
        companyId,
        roadmapId,
        totalBudget,
        constraints,
        priorityWeights,
        options = {},
        optimizationGoals,
        userRequest,
      } = input;
      
      // Load prerequisite data (STEP 1-4)
      console.log('📥 Loading assessment, portfolio, and roadmap data...');
      const [assessmentSnapshot, portfolioAssessment, roadmap, portfolioItems] = await Promise.all([
        loadAssessmentSnapshot(tenantId),
        loadPortfolioAssessment(tenantId),
        loadRoadmap(tenantId, roadmapId),
        loadPortfolioItems(tenantId),
      ]);
      
      // Verifica prerequisiti minimi
      if (!portfolioAssessment && portfolioItems.length === 0) {
        return {
          content: `⚠️ **Dati insufficienti per l'ottimizzazione budget**

Per ottimizzare l'allocazione del budget, è necessario avere:

1. **Step 2 - Portfolio**: Carica le tue iniziative/prodotti/servizi in /portfolio
2. **Step 3 - Portfolio Assessment**: Avvia la valutazione del portfolio
3. **Step 4 - Roadmap** (opzionale): Genera una roadmap strategica

Una volta completati questi step, torna qui per ottimizzare il budget.`,
          metadata: {
            routedTo: 'BUDGET_OPTIMIZER',
            error: 'missing_prerequisites',
            hasAssessment: !!assessmentSnapshot,
            hasPortfolio: portfolioItems.length > 0,
            hasPortfolioAssessment: !!portfolioAssessment,
            hasRoadmap: !!roadmap,
          },
        };
      }
      
      // Calcola budget richiesto
      const totalRequestedBudget = calculateTotalRequestedBudget(portfolioItems, portfolioAssessment, roadmap);
      const availableBudget = totalBudget || totalRequestedBudget;
      const horizonMonths = roadmap?.horizonMonths || 24;
      
      console.log(`📊 Budget analysis: Available €${availableBudget}, Requested €${totalRequestedBudget}`);
      
      // Genera scenari
      const scenarios: BudgetScenario[] = [];
      const typedOptions = options as { scenarioTypes?: string[] };
      const scenarioTypes = typedOptions.scenarioTypes || ['conservative', 'balanced', 'aggressive'];
      
      for (const type of scenarioTypes) {
        scenarios.push(generateScenario(
          type as 'conservative' | 'balanced' | 'aggressive',
          portfolioItems,
          availableBudget,
          portfolioAssessment,
          roadmap
        ));
      }
      
      // Genera raccomandazioni
      const optimizationRecommendations = generateOptimizationRecommendations(
        portfolioItems,
        portfolioAssessment,
        roadmap
      );
      
      // Genera piano trimestrale
      const quarterlyBudgetPlan = generateQuarterlyPlan(availableBudget, horizonMonths, roadmap);
      
      // Trova scenario raccomandato
      const recommendedScenario = scenarios.find(s => s.isRecommended)?.scenarioId || scenarios[1]?.scenarioId || scenarios[0]?.scenarioId;
      
      // Investment priorities (dal portfolio assessment o generato)
      const investmentPriorities = portfolioItems
        .map((item, idx) => {
          const strategicScore = calculateStrategicScore(item, assessmentSnapshot, portfolioAssessment);
          const roiScore = calculateROIScore(item, assessmentSnapshot);
          return {
            rank: 0, // Sarà calcolato dopo
            itemId: String(item.id || item.item_id),
            itemName: String(item.name || item.title),
            category: String(item.category || item.itemType || 'initiative'),
            recommendedBudget: Number(item.budget) || 30000,
            rationale: `Strategic score: ${strategicScore}, ROI score: ${roiScore}`,
            expectedROI: Math.round(roiScore * 1.5),
            strategicImportance: strategicScore > 80 ? 'critical' as const : 
                                 strategicScore > 60 ? 'high' as const : 
                                 strategicScore > 40 ? 'medium' as const : 'low' as const,
            _sortScore: strategicScore * 0.6 + roiScore * 0.4,
          };
        })
        .sort((a, b) => (b._sortScore || 0) - (a._sortScore || 0))
        .map((p, idx) => ({ ...p, rank: idx + 1, _sortScore: undefined }))
        .slice(0, 15);
      
      // Financial KPIs
      const balancedScenario = scenarios.find(s => s.scenarioType === 'balanced');
      const financialKPIs = {
        totalROI: balancedScenario?.expectedOutcomes.totalROI || 75,
        paybackPeriodMonths: balancedScenario?.expectedOutcomes.paybackMonths || 18,
        npv: Math.round(availableBudget * 0.3), // Stima semplificata
        irr: 25, // Stima
        costPerMaturityPoint: Math.round(availableBudget / 2), // Costo per punto maturità
      };
      
      // Build complete result
      const optimizationId = uuidv4();
      const now = new Date().toISOString();
      
      const result: BudgetOptimizationResult = {
        optimizationId,
        tenantId: tenantId || null,
        companyId: companyId || null,
        roadmapId: roadmap?.roadmapId,
        createdAt: now,
        version: '1.0',
        
        inputSummary: {
          totalAvailableBudget: availableBudget,
          totalRequestedBudget,
          budgetGap: availableBudget - totalRequestedBudget,
          portfolioItemCount: portfolioItems.length,
          horizonMonths,
        },
        
        executiveSummary: generateExecutiveSummary(availableBudget, totalRequestedBudget, scenarios, optimizationRecommendations),
        
        currentStateAnalysis: {
          budgetDistribution: generateBudgetDistribution(portfolioItems),
          inefficiencies: [
            portfolioItems.filter(i => calculateROIScore(i, null) < 40).length > 0 
              ? `${portfolioItems.filter(i => calculateROIScore(i, null) < 40).length} iniziative con ROI sotto la media`
              : null,
            availableBudget < totalRequestedBudget 
              ? `Gap budget: €${(totalRequestedBudget - availableBudget).toLocaleString()} da coprire`
              : null,
          ].filter(Boolean) as string[],
          opportunities: [
            'Riallocazione budget da iniziative low-ROI',
            'Consolidamento iniziative simili',
            'Phasing per ridurre rischio finanziario',
          ],
          criticalConstraints: constraints?.mandatoryItems?.length 
            ? [`${constraints.mandatoryItems.length} iniziative mandatory`]
            : [],
        },
        
        scenarios,
        recommendedScenario,
        optimizationRecommendations,
        
        savingsOpportunities: [
          {
            area: 'Riallocazione budget',
            potentialSavings: Math.round(availableBudget * 0.1),
            effort: 'medium',
            risk: 'low',
            description: 'Spostare budget da iniziative a basso ROI verso quelle strategiche',
          },
          {
            area: 'Consolidamento iniziative',
            potentialSavings: Math.round(availableBudget * 0.05),
            effort: 'high',
            risk: 'medium',
            description: 'Unire iniziative con scope simile per ridurre overhead',
          },
        ],
        
        investmentPriorities: investmentPriorities.map(({ _sortScore, ...rest }) => rest) as typeof investmentPriorities,
        quarterlyBudgetPlan,
        
        financialRisks: [
          {
            risk: 'Sforamento budget',
            financialImpact: Math.round(availableBudget * 0.15),
            likelihood: 'medium',
            mitigation: 'Buffer 10% incluso nel piano',
            contingencyBudget: Math.round(availableBudget * 0.1),
          },
          {
            risk: 'Ritardi che aumentano i costi',
            financialImpact: Math.round(availableBudget * 0.1),
            likelihood: 'medium',
            mitigation: 'Milestone mensili con early warning',
          },
        ],
        
        financialKPIs,
        
        confidenceLevel: portfolioAssessment && roadmap ? 'high' : portfolioAssessment ? 'medium' : 'low',
        assumptions: [
          'Budget disponibile confermato',
          'Risorse interne disponibili come pianificato',
          'Nessun cambiamento significativo di scope',
          'Costi fornitori stabili',
        ],
        limitations: [
          'Stime ROI basate su dati disponibili',
          'Piano soggetto a variazioni di mercato',
        ],
        dataQualityScore: portfolioAssessment && roadmap ? 85 : portfolioAssessment ? 70 : 50,
      };
      
      // Validate with Zod
      try {
        BudgetOptimizationResultSchema.parse(result);
      } catch (validationError) {
        console.warn('Validation warning:', validationError);
      }
      
      // Save to Supabase
      const saved = await saveBudgetOptimization(result);
      if (saved) {
        console.log('💾 Budget optimization saved to Supabase');
      } else {
        console.warn('⚠️ Could not save budget optimization to Supabase');
      }
      
      // Build response
      const summaryLines = [
        `## 💰 Ottimizzazione Budget Completata`,
        ``,
        `### Executive Summary`,
        result.executiveSummary,
        ``,
        `### Panoramica Budget`,
        `| Metrica | Valore |`,
        `|---------|--------|`,
        `| Budget Disponibile | €${availableBudget.toLocaleString()} |`,
        `| Budget Richiesto | €${totalRequestedBudget.toLocaleString()} |`,
        `| Gap | €${(availableBudget - totalRequestedBudget).toLocaleString()} |`,
        `| Iniziative Analizzate | ${portfolioItems.length} |`,
        ``,
        `### 📊 Scenari Generati`,
        ``,
      ];
      
      for (const scenario of scenarios) {
        const recommended = scenario.isRecommended ? ' ⭐ RACCOMANDATO' : '';
        summaryLines.push(
          `#### ${scenario.scenarioName}${recommended}`,
          `- Budget allocato: €${scenario.allocatedBudget.toLocaleString()} (${scenario.utilizationPercentage}%)`,
          `- ROI atteso: ${scenario.expectedOutcomes.totalROI}%`,
          `- Rischio: ${scenario.expectedOutcomes.riskLevel}`,
          `- Payback: ${scenario.expectedOutcomes.paybackMonths} mesi`,
          ``
        );
      }
      
      summaryLines.push(
        `### 💡 Raccomandazioni Principali`,
        ...optimizationRecommendations.slice(0, 3).map((r, i) => 
          `${i + 1}. **${r.title}** (${r.priority})
   ${r.description}
   _Effort: ${r.effort} | Timeline: ${r.timeframe}_`
        ),
        ``,
        `### 📅 Piano Budget Trimestrale`,
        `| Quarter | Spesa Pianificata | Cumulativo |`,
        `|---------|-------------------|------------|`,
        ...quarterlyBudgetPlan.slice(0, 4).map(q => 
          `| ${q.quarter} ${q.year} | €${q.plannedSpend.toLocaleString()} | €${q.cumulativeSpend.toLocaleString()} |`
        ),
        ``,
        `### 📈 KPI Finanziari Attesi`,
        `- **ROI Totale**: ${financialKPIs.totalROI}%`,
        `- **Payback Period**: ${financialKPIs.paybackPeriodMonths} mesi`,
        `- **NPV Stimato**: €${financialKPIs.npv?.toLocaleString() || 'N/A'}`,
        ``,
        `---`,
        `Optimization ID: \`${result.optimizationId}\``,
        `Confidence: **${result.confidenceLevel}** | Data Quality: ${result.dataQualityScore}%`
      );
      
      return {
        content: summaryLines.join('\n'),
        metadata: {
          routedTo: 'BUDGET_OPTIMIZER',
          optimizationId: result.optimizationId,
          totalBudget: availableBudget,
          scenariosCount: scenarios.length,
          recommendationsCount: optimizationRecommendations.length,
          confidenceLevel: result.confidenceLevel,
          result,
        },
      };
      
    } catch (error) {
      console.error('❌ BUDGET_OPTIMIZER error:', error);
      return {
        content: `Errore durante l'ottimizzazione budget: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        metadata: { error: true, routedTo: 'BUDGET_OPTIMIZER' },
      };
    }
  },
};

function generateExecutiveSummary(
  availableBudget: number,
  requestedBudget: number,
  scenarios: BudgetScenario[],
  recommendations: OptimizationRecommendation[]
): string {
  const gap = availableBudget - requestedBudget;
  const recommended = scenarios.find(s => s.isRecommended);
  
  let summary = `Analisi completa del budget per ${scenarios[0]?.allocations.length || 0} iniziative del portfolio. `;
  
  if (gap >= 0) {
    summary += `Budget disponibile (€${availableBudget.toLocaleString()}) sufficiente a coprire le necessità. `;
  } else {
    summary += `Gap di €${Math.abs(gap).toLocaleString()} tra budget disponibile e richiesto - necessaria prioritizzazione. `;
  }
  
  if (recommended) {
    summary += `Lo scenario "${recommended.scenarioName}" è raccomandato con utilizzo del ${recommended.utilizationPercentage}% del budget e ROI atteso del ${recommended.expectedOutcomes.totalROI}%. `;
  }
  
  if (recommendations.length > 0) {
    summary += `Identificate ${recommendations.length} opportunità di ottimizzazione.`;
  }
  
  return summary;
}

function generateBudgetDistribution(
  items: Array<Record<string, unknown>>
): Array<{ category: string; currentAmount: number; percentage: number; isOptimal: boolean }> {
  const categoryMap = new Map<string, number>();
  let total = 0;
  
  for (const item of items) {
    const category = String(item.category || item.itemType || 'other');
    const budget = Number(item.budget) || Number(item.estimated_budget) || 30000;
    categoryMap.set(category, (categoryMap.get(category) || 0) + budget);
    total += budget;
  }
  
  return Array.from(categoryMap.entries()).map(([category, amount]) => ({
    category,
    currentAmount: amount,
    percentage: Math.round((amount / total) * 100),
    isOptimal: (amount / total) <= 0.4, // Non più del 40% in una categoria
  }));
}

export default budgetOptimizerAgent;
