import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import { formatSearchResultsForContext, semanticSearch, SourceType, SYSTEM_COMPANY_ID } from '../utils/embeddingService';
import { loadExpertKnowledge } from '../utils/expertKnowledgeLoader';
import { getLatestStrategicProfile } from '../../repositories/assessmentSnapshotRepository';
import { StrategicAssessmentProfile } from '../schemas/strategicAssessmentSchema';

// NOTE: Il framework di prioritizzazione condiviso è disponibile in:
// import { calculateWSJF, calculateICE, calculateRetentionIndex, determineMoSCoW } from '../prioritization';
// L'agente usa ancora le funzioni locali per backward compatibility.
// TODO: Refactoring incrementale per usare il framework condiviso.
import {
  StrategyAdvisorInput,
  StrategyAdvisorResult,
  StrategyAdvisorResultSchema,
  PrioritizedInitiative,
  PrioritizationScore,
  ImplementationStrategy,
  InitiativeDependency,
  StrategicCluster,
  DecisionMatrix,
  StrategicRecommendation,
  StrategicKPI,
} from '../schemas/strategySchema';
import { PortfolioAssessmentResult, ItemAssessment } from '../schemas/portfolioAssessmentSchema';
import { RoadmapResult } from '../schemas/roadmapSchema';
import { BudgetOptimizationResult } from '../schemas/budgetSchema';

// Extended type for internal use - ItemAssessment with additional derived properties
interface ExtendedAssessedItem extends ItemAssessment {
  name: string;
  type: 'product' | 'service';
  category?: string;
  description?: string;
  expectedROI?: number;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedBudget?: number;
  estimatedDuration?: string;
}

type AdvisoryEnhancement = {
  executiveSummary?: StrategyAdvisorResult['executiveSummary'];
  recommendations?: StrategicRecommendation[];
  assumptions?: string[];
  limitations?: string[];
};

const ALLOWED_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
const ALLOWED_CATEGORIES = [
  'immediate_action',
  'strategic_investment',
  'optimization',
  'decommission',
  'defer',
  'partnership',
] as const;

// Helper to convert ItemAssessment to ExtendedAssessedItem
function toExtendedItem(item: ItemAssessment): ExtendedAssessedItem {
  // Derive riskLevel from confidenceLevel and riskAdjustedReturn score
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';
  if (item.confidenceLevel === 'low' || item.scores.riskAdjustedReturn < 40) {
    riskLevel = 'high';
  } else if (item.confidenceLevel === 'high' && item.scores.riskAdjustedReturn > 70) {
    riskLevel = 'low';
  }
  
  return {
    ...item,
    name: item.itemName,
    type: 'product' as const,
    category: undefined,
    description: item.rationale,
    expectedROI: Math.round(item.scores.valueDelivery * 1.5),
    riskLevel,
    estimatedBudget: undefined,
    estimatedDuration: undefined,
  };
}

// Load system prompt
let systemPrompt: string;
try {
  const promptPath = path.resolve(__dirname, '../prompts/strategy-advisor-prompt.md');
  systemPrompt = fs.readFileSync(promptPath, { encoding: 'utf8' });
} catch (e) {
  systemPrompt = 'You are STRATEGOS, a strategic consultant for IT portfolio prioritization.';
}

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
    
    if (error) {
      console.warn('[StrategyAdvisor] Could not load assessment snapshot:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[StrategyAdvisor] Error loading assessment snapshot:', err);
    return null;
  }
}

async function loadPortfolioItems(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  try {
    const { data: products } = await supabase
      .from('portfolio_products')
      .select('*')
      .eq('tenant_id', tenantId);

    if (products) {
      items.push(...products.map(p => ({ ...p, itemType: 'product' })));
    }

    const { data: services } = await supabase
      .from('portfolio_services')
      .select('*')
      .eq('tenant_id', tenantId);

    if (services) {
      items.push(...services.map(s => ({ ...s, itemType: 'service' })));
    }

    console.log(`[StrategyAdvisor] Loaded ${items.length} portfolio items`);
    return items;
  } catch (err) {
    console.warn('[StrategyAdvisor] Error loading portfolio items:', err);
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
    
    if (error || !data?.result) {
      console.warn('[StrategyAdvisor] Could not load portfolio assessment:', error?.message);
      return null;
    }
    return data.result as PortfolioAssessmentResult;
  } catch (err) {
    console.warn('[StrategyAdvisor] Error loading portfolio assessment:', err);
    return null;
  }
}

async function loadRoadmap(tenantId: string): Promise<RoadmapResult | null> {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data?.result) {
      console.warn('[StrategyAdvisor] Could not load roadmap:', error?.message);
      return null;
    }
    return data.result as RoadmapResult;
  } catch (err) {
    console.warn('[StrategyAdvisor] Error loading roadmap:', err);
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
    
    if (error || !data?.result) {
      console.warn('[StrategyAdvisor] Could not load budget optimization:', error?.message);
      return null;
    }
    return data.result as BudgetOptimizationResult;
  } catch (err) {
    console.warn('[StrategyAdvisor] Error loading budget optimization:', err);
    return null;
  }
}

function extractSnapshotPayload(assessmentSnapshot: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!assessmentSnapshot) return null;
  const snapshot = (assessmentSnapshot as { snapshot?: Record<string, unknown> }).snapshot;
  if (snapshot && typeof snapshot === 'object') {
    return snapshot as Record<string, unknown>;
  }
  return assessmentSnapshot;
}

function deriveMaturityLevel(snapshotPayload: Record<string, unknown> | null): number {
  if (!snapshotPayload) return 3;
  const rawScore = Number((snapshotPayload as any)?.maturityProfile?.overallScore ?? (snapshotPayload as any)?.overall_maturity);
  if (!Number.isFinite(rawScore)) return 3;
  if (rawScore <= 5) {
    return Math.min(5, Math.max(1, Math.round(rawScore)));
  }
  if (rawScore <= 20) return 1;
  if (rawScore <= 40) return 2;
  if (rawScore <= 60) return 3;
  if (rawScore <= 80) return 4;
  return 5;
}

function normalizeWeights(weights: { wsjfWeight: number; iceWeight: number; portfolioScoreWeight: number }) {
  const total = weights.wsjfWeight + weights.iceWeight + weights.portfolioScoreWeight;
  if (!Number.isFinite(total) || total <= 0) {
    return { wsjfWeight: 0.4, iceWeight: 0.3, portfolioScoreWeight: 0.3 };
  }
  return {
    wsjfWeight: Number((weights.wsjfWeight / total).toFixed(2)),
    iceWeight: Number((weights.iceWeight / total).toFixed(2)),
    portfolioScoreWeight: Number((weights.portfolioScoreWeight / total).toFixed(2)),
  };
}

function deriveWeightsFromStrategicProfile(
  profile: StrategicAssessmentProfile | null
): { wsjfWeight: number; iceWeight: number; portfolioScoreWeight: number } | null {
  const criteria = profile?.strategic_context?.prioritization_criteria;
  if (!criteria) return null;

  const wsjfSignal = (criteria.roi_weight + criteria.time_to_market_weight + criteria.risk_weight) / 15;
  const iceSignal = (criteria.innovation_weight + criteria.resource_availability_weight) / 10;
  const portfolioSignal = (
    criteria.strategic_alignment_weight +
    criteria.market_size_weight +
    criteria.competitive_advantage_weight +
    criteria.customer_demand_weight
  ) / 20;

  return normalizeWeights({
    wsjfWeight: Math.max(0.1, wsjfSignal),
    iceWeight: Math.max(0.1, iceSignal),
    portfolioScoreWeight: Math.max(0.1, portfolioSignal),
  });
}

function buildUserObjectives(
  profile: StrategicAssessmentProfile | null,
  snapshotPayload: Record<string, unknown> | null,
  strategicFocus?: string[]
): string {
  const lines: string[] = [];

  if (profile?.company_identity?.industry) {
    lines.push(`Industry: ${profile.company_identity.industry}`);
  }

  if (profile?.company_identity?.business_model) {
    lines.push(`Business model: ${profile.company_identity.business_model}`);
  }

  if (profile?.strategic_context?.goals_2025_2027?.length) {
    lines.push('Strategic goals:');
    profile.strategic_context.goals_2025_2027.forEach(goal => {
      const detail = goal.description ? ` - ${goal.description}` : '';
      lines.push(`- ${goal.goal}${detail}`);
    });
  }

  if (profile?.strategic_context?.primary_pain_point) {
    lines.push(`Primary pain point: ${profile.strategic_context.primary_pain_point}`);
  }

  if (profile?.strategic_context?.prioritization_criteria) {
    const c = profile.strategic_context.prioritization_criteria;
    lines.push(
      `Prioritization weights (1-5): ROI ${c.roi_weight}, strategic alignment ${c.strategic_alignment_weight}, ` +
      `customer demand ${c.customer_demand_weight}, innovation ${c.innovation_weight}, time-to-market ${c.time_to_market_weight}`
    );
  }

  if (strategicFocus && strategicFocus.length > 0) {
    lines.push(`Strategic focus: ${strategicFocus.join(', ')}`);
  }

  const summary = (snapshotPayload as any)?.executiveSummary;
  if (summary) {
    lines.push(`Assessment summary: ${summary}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No explicit objectives provided.';
}

function buildKnowledgeQuery(
  profile: StrategicAssessmentProfile | null,
  strategicFocus?: string[]
): string {
  const queryParts: string[] = [];
  if (profile?.company_identity?.industry) {
    queryParts.push(`${profile.company_identity.industry} market trends`);
  }
  if (profile?.strategic_context?.goals_2025_2027?.length) {
    queryParts.push(profile.strategic_context.goals_2025_2027.map(g => g.goal).join(' '));
  }
  if (strategicFocus && strategicFocus.length > 0) {
    queryParts.push(strategicFocus.join(' '));
  }
  queryParts.push('IT portfolio strategy best practices prioritization');
  return queryParts.filter(Boolean).join(' | ');
}

async function loadAdvisorKnowledge(
  tenantId: string,
  query: string
): Promise<{ knowledgeContext: string; sourcesSummary?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { knowledgeContext: 'Expert knowledge base unavailable (missing OPENAI_API_KEY).' };
  }

  const sourceTypes: SourceType[] = ['document', 'external'];

  const [expertKnowledge, marketResults] = await Promise.all([
    loadExpertKnowledge(SYSTEM_COMPANY_ID, query, 'strategy-advisor', {
      categories: ['framework', 'methodology', 'benchmark', 'best_practice'],
      limit: 2,
      similarityThreshold: 0.6,
    }),
    semanticSearch(tenantId, query, {
      sourceTypes,
      limit: 5,
      similarityThreshold: 0.55,
      useHybridSearch: true,
      useQueryExpansion: true,
    }),
  ]);

  const expertContext = expertKnowledge.formattedContext || 'No expert frameworks found.';
  const marketContext = marketResults.length > 0
    ? formatSearchResultsForContext(marketResults, 2500, {
        includeMetadata: true,
        includeSimilarityScores: false,
        summarize: true,
      })
    : 'No market trend documents found.';

  const sourcesSummaryParts: string[] = [];
  if (expertKnowledge.totalResults > 0) {
    sourcesSummaryParts.push(`expert KB entries: ${expertKnowledge.totalResults}`);
  }
  if (marketResults.length > 0) {
    sourcesSummaryParts.push(`market documents: ${marketResults.length}`);
  }

  return {
    knowledgeContext: `${expertContext}\n\n${marketContext}`,
    sourcesSummary: sourcesSummaryParts.length > 0 ? `Knowledge sources used: ${sourcesSummaryParts.join(', ')}.` : undefined,
  };
}

function extractJsonPayload(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return raw.slice(firstBrace, lastBrace + 1);
}

function sanitizeRecommendations(
  rawRecommendations: unknown,
  knownIds: Set<string>,
  fallbackIds: string[]
): StrategicRecommendation[] {
  if (!Array.isArray(rawRecommendations)) return [];
  const sanitized: StrategicRecommendation[] = [];
  let recCounter = 1;

  for (const rec of rawRecommendations) {
    if (!rec || typeof rec !== 'object') continue;
    const record = rec as Record<string, unknown>;
    const affected = Array.isArray(record.affectedInitiatives)
      ? record.affectedInitiatives.map(String).filter(id => knownIds.has(id))
      : [];
    if (affected.length === 0 && fallbackIds.length > 0) {
      affected.push(fallbackIds[0]);
    }

    const priority = ALLOWED_PRIORITIES.includes(record.priority as typeof ALLOWED_PRIORITIES[number])
      ? (record.priority as typeof ALLOWED_PRIORITIES[number])
      : 'medium';
    const category = ALLOWED_CATEGORIES.includes(record.category as typeof ALLOWED_CATEGORIES[number])
      ? (record.category as typeof ALLOWED_CATEGORIES[number])
      : 'optimization';

    sanitized.push({
      recommendationId: String(record.recommendationId || `REC-${String(recCounter++).padStart(3, '0')}`),
      priority,
      category,
      title: String(record.title || 'Strategic recommendation'),
      description: String(record.description || 'Review initiative for strategic alignment and impact.'),
      affectedInitiatives: affected,
      expectedOutcome: String(record.expectedOutcome || 'Improved alignment and portfolio impact.'),
      timeline: String(record.timeline || 'Q1-Q2'),
      estimatedImpact: typeof record.estimatedImpact === 'object' && record.estimatedImpact !== null
        ? (record.estimatedImpact as StrategicRecommendation['estimatedImpact'])
        : {},
      nextSteps: Array.isArray(record.nextSteps) && record.nextSteps.length > 0
        ? record.nextSteps.map(String).slice(0, 5)
        : ['Define owner', 'Confirm business case', 'Schedule execution'],
    });
  }

  return sanitized;
}

async function generateAdvisorEnhancement(options: {
  systemPrompt: string;
  userObjectives: string;
  knowledgeContext: string;
  strategicFocus?: string[];
  strategicConstraints?: StrategyAdvisorInput['strategicConstraints'];
  planningHorizon: string;
  portfolioSummary: Record<string, unknown>;
  topInitiatives: Array<Record<string, unknown>>;
  decisionMatrix: DecisionMatrix;
  budgetSummary: Record<string, unknown>;
  fallbackSummary: StrategyAdvisorResult['executiveSummary'];
}): Promise<AdvisoryEnhancement | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const model = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.2,
    openAIApiKey: process.env.OPENAI_API_KEY,
    maxTokens: 2000,
  });

  const prompt = new PromptTemplate({
    template: `{systemPrompt}

You are an executive strategy advisor. Use market trends, best methodologies, and the user's data to refine the executive summary
and recommendations. Do NOT change rankings or scores; only improve narrative and priorities based on objectives and context.

USER OBJECTIVES:
{userObjectives}

STRATEGIC FOCUS:
{strategicFocus}

STRATEGIC CONSTRAINTS:
{strategicConstraints}

KNOWLEDGE CONTEXT (market trends, PDFs, methodologies):
{knowledgeContext}

PORTFOLIO SUMMARY:
{portfolioSummary}

TOP INITIATIVES (use ONLY these IDs):
{topInitiatives}

DECISION MATRIX:
{decisionMatrix}

BUDGET SUMMARY:
{budgetSummary}

Return ONLY valid JSON with:
{
  "executiveSummary": {
    "overallAssessment": "...",
    "keyFindings": ["..."],
    "topPriorities": ["..."],
    "criticalDecisions": ["..."],
    "timeHorizon": "{planningHorizon}"
  },
  "recommendations": [
    {
      "recommendationId": "REC-001",
      "priority": "critical|high|medium|low",
      "category": "immediate_action|strategic_investment|optimization|decommission|defer|partnership",
      "title": "...",
      "description": "...",
      "affectedInitiatives": ["id1", "id2"],
      "expectedOutcome": "...",
      "timeline": "...",
      "estimatedImpact": {
        "costSavings": 0,
        "revenueImpact": 0,
        "efficiencyGain": "...",
        "riskReduction": "..."
      },
      "nextSteps": ["...", "..."]
    }
  ],
  "assumptions": ["..."],
  "limitations": ["..."]
}

Rules:
- Use only initiative IDs provided above.
- 3 to 6 recommendations.
- Mention applied frameworks or methodologies in keyFindings if relevant.
`,
    inputVariables: [
      'systemPrompt',
      'userObjectives',
      'strategicFocus',
      'strategicConstraints',
      'knowledgeContext',
      'portfolioSummary',
      'topInitiatives',
      'decisionMatrix',
      'budgetSummary',
      'planningHorizon',
    ],
  });

  const formattedPrompt = await prompt.format({
    systemPrompt: options.systemPrompt,
    userObjectives: options.userObjectives,
    strategicFocus: options.strategicFocus?.join(', ') || 'None',
    strategicConstraints: options.strategicConstraints ? JSON.stringify(options.strategicConstraints, null, 2) : 'None',
    knowledgeContext: options.knowledgeContext,
    portfolioSummary: JSON.stringify(options.portfolioSummary, null, 2),
    topInitiatives: JSON.stringify(options.topInitiatives, null, 2),
    decisionMatrix: JSON.stringify(options.decisionMatrix, null, 2),
    budgetSummary: JSON.stringify(options.budgetSummary, null, 2),
    planningHorizon: options.planningHorizon,
  });

  const response = await model.invoke(formattedPrompt);
  const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const jsonPayload = extractJsonPayload(content);
  if (!jsonPayload) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonPayload);
  } catch {
    return null;
  }

  const exec = parsed.executiveSummary as Record<string, unknown> | undefined;
  const executiveSummary = exec
    ? {
        overallAssessment: String(exec.overallAssessment || options.fallbackSummary.overallAssessment),
        keyFindings: Array.isArray(exec.keyFindings) ? exec.keyFindings.map(String).slice(0, 6) : options.fallbackSummary.keyFindings,
        topPriorities: Array.isArray(exec.topPriorities) ? exec.topPriorities.map(String).slice(0, 6) : options.fallbackSummary.topPriorities,
        criticalDecisions: Array.isArray(exec.criticalDecisions) ? exec.criticalDecisions.map(String).slice(0, 6) : options.fallbackSummary.criticalDecisions,
        timeHorizon: String(exec.timeHorizon || options.fallbackSummary.timeHorizon),
      }
    : options.fallbackSummary;

  return {
    executiveSummary,
    recommendations: parsed.recommendations ? (parsed.recommendations as StrategicRecommendation[]) : undefined,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 6) : undefined,
    limitations: Array.isArray(parsed.limitations) ? parsed.limitations.map(String).slice(0, 6) : undefined,
  };
}

// ============================================
// SCORING FUNCTIONS
// ============================================

function calculateWSJF(item: ExtendedAssessedItem, roadmapPhase?: number): {
  businessValue: number;
  timeCriticality: number;
  riskReduction: number;
  jobSize: number;
  score: number;
} {
  const businessValue = Math.min(10, Math.round(
    (item.scores.strategicFit * 0.4 + 
     item.scores.valueDelivery * 0.4 + 
     (item.expectedROI || 50) / 10) / 2
  ));
  
  let timeCriticality = 5;
  if (item.recommendation === 'accelerate') timeCriticality = 9;
  if (item.recommendation === 'keep') timeCriticality = 6;
  if (item.recommendation === 'pause') timeCriticality = 3;
  if (item.recommendation === 'stop') timeCriticality = 1;
  if (roadmapPhase === 1) timeCriticality = Math.min(10, timeCriticality + 2);
  
  const riskReduction = Math.min(10, Math.round(item.scores.riskAdjustedReturn / 10));
  const jobSize = Math.max(1, 11 - Math.round(item.scores.resourceEfficiency / 10));
  const score = Number(((businessValue + timeCriticality + riskReduction) / jobSize).toFixed(2));
  
  return { businessValue, timeCriticality, riskReduction, jobSize, score };
}

function calculateICE(item: ExtendedAssessedItem): {
  impact: number;
  confidence: number;
  ease: number;
  score: number;
} {
  const impact = Math.min(10, Math.round(
    (item.scores.valueDelivery + item.scores.strategicFit) / 20
  ));
  
  const confidence = Math.min(10, Math.round(
    (100 - (item.riskLevel === 'high' ? 30 : item.riskLevel === 'medium' ? 15 : 0)) / 10
  ));
  
  const ease = Math.min(10, Math.round(
    (item.scores.resourceEfficiency + item.scores.marketTiming) / 20
  ));
  
  const score = impact * confidence * ease;
  return { impact, confidence, ease, score };
}

function determineMoSCoW(item: ExtendedAssessedItem, wsjfScore: number): {
  priority: 'must_have' | 'should_have' | 'could_have' | 'wont_have';
  rationale: string;
} {
  if (item.recommendation === 'stop') {
    return {
      priority: 'wont_have',
      rationale: `Portfolio assessment raccomanda dismissione. Score: ${item.overallScore}`
    };
  }
  
  if (item.recommendation === 'accelerate' || wsjfScore > 3.0) {
    return {
      priority: 'must_have',
      rationale: `Alta priorità strategica con WSJF score ${wsjfScore}. ${item.recommendation === 'accelerate' ? 'Raccomandato accelerare.' : ''}`
    };
  }
  
  if (item.recommendation === 'keep' || wsjfScore >= 2.0) {
    return {
      priority: 'should_have',
      rationale: `Iniziativa importante con WSJF score ${wsjfScore}. Impatto significativo se posticipata.`
    };
  }
  
  if (item.recommendation === 'pause' || wsjfScore >= 1.0) {
    return {
      priority: 'could_have',
      rationale: `Iniziativa desiderabile ma non critica. WSJF score ${wsjfScore}.`
    };
  }
  
  return {
    priority: 'wont_have',
    rationale: `Bassa priorità per questo ciclo. WSJF score ${wsjfScore}.`
  };
}

function calculateCompositeScore(
  wsjfScore: number,
  iceScore: number,
  portfolioScore: number,
  weights: { wsjfWeight: number; iceWeight: number; portfolioScoreWeight: number }
): number {
  const normalizedWSJF = Math.min(100, (wsjfScore / 5) * 100);
  const normalizedICE = Math.min(100, (iceScore / 1000) * 100);
  const normalizedPortfolio = portfolioScore;
  
  return Number((
    normalizedWSJF * weights.wsjfWeight +
    normalizedICE * weights.iceWeight +
    normalizedPortfolio * weights.portfolioScoreWeight
  ).toFixed(1));
}

// ============================================
// STRATEGY GENERATION FUNCTIONS
// ============================================

function determineImplementationStrategy(
  item: ExtendedAssessedItem,
  maturityLevel?: number
): ImplementationStrategy {
  let approach: 'make' | 'buy' | 'partner' | 'hybrid' = 'buy';
  let approachRationale = '';
  
  const itemCategory = item.category?.toLowerCase() || '';
  const isCore = itemCategory.includes('core') || itemCategory.includes('strategic');
  const isInfra = itemCategory.includes('infrastructure') || itemCategory.includes('security');
  
  if (isCore && item.scores.strategicFit > 70) {
    approach = 'make';
    approachRationale = 'Competenza core con alto fit strategico - sviluppo interno consigliato';
  } else if (isInfra || item.scores.resourceEfficiency < 50) {
    approach = 'buy';
    approachRationale = 'Soluzione commodity - acquisto da vendor specializzato';
  } else if (item.riskLevel === 'high') {
    approach = 'partner';
    approachRationale = 'Alto rischio - partnership per condividere rischio e competenze';
  } else {
    approach = 'hybrid';
    approachRationale = 'Mix ottimale: core interno + componenti esterni';
  }
  
  let deliveryModel: 'in_house' | 'outsource' | 'co_source' | 'managed_service' = 'co_source';
  let deliveryRationale = '';
  
  if (approach === 'make' && (maturityLevel || 3) >= 3) {
    deliveryModel = 'in_house';
    deliveryRationale = 'Maturità IT adeguata per gestione interna';
  } else if (approach === 'buy') {
    deliveryModel = 'managed_service';
    deliveryRationale = 'Soluzione gestita come servizio';
  } else {
    deliveryModel = 'co_source';
    deliveryRationale = 'Team misto per trasferimento know-how';
  }
  
  let rolloutStrategy: 'big_bang' | 'phased' | 'pilot_then_scale' | 'parallel_run' = 'phased';
  
  if (item.riskLevel === 'high' || item.overallScore < 60) {
    rolloutStrategy = 'pilot_then_scale';
  } else if (item.riskLevel === 'low' && item.scores.marketTiming > 80) {
    rolloutStrategy = 'big_bang';
  } else if (isInfra) {
    rolloutStrategy = 'parallel_run';
  }
  
  const rolloutPhases = generateRolloutPhases(rolloutStrategy);
  
  const changeManagement = {
    impactLevel: determineChangeImpact(item),
    stakeholderGroups: identifyStakeholders(item),
    trainingRequired: item.overallScore < 70 || isCore,
    communicationPlan: `Piano comunicazione per ${item.name}: ${item.riskLevel === 'high' ? 'comunicazione intensiva' : 'comunicazione standard'}`,
  };
  
  const keyRisks = generateKeyRisks(item);
  
  return {
    approach,
    approachRationale,
    deliveryModel,
    deliveryRationale,
    rolloutStrategy,
    rolloutPhases,
    changeManagement,
    keyRisks,
  };
}

function generateRolloutPhases(strategy: string): Array<{
  phase: number;
  name: string;
  scope: string;
  duration: string;
  successCriteria: string[];
}> {
  switch (strategy) {
    case 'pilot_then_scale':
      return [
        { phase: 1, name: 'Pilot', scope: 'Team pilota', duration: '2-3 mesi', successCriteria: ['Adozione > 70%', 'Bug critici = 0'] },
        { phase: 2, name: 'Validazione', scope: 'Analisi risultati', duration: '1 mese', successCriteria: ['ROI positivo'] },
        { phase: 3, name: 'Scale-out', scope: 'Rollout completo', duration: '3-6 mesi', successCriteria: ['Copertura 100%'] },
      ];
    case 'big_bang':
      return [
        { phase: 1, name: 'Preparazione', scope: 'Setup completo', duration: '1-2 mesi', successCriteria: ['Utenti formati'] },
        { phase: 2, name: 'Go-Live', scope: 'Rilascio', duration: '1 settimana', successCriteria: ['Sistemi operativi'] },
        { phase: 3, name: 'Stabilizzazione', scope: 'Supporto', duration: '1 mese', successCriteria: ['Performance stabili'] },
      ];
    case 'parallel_run':
      return [
        { phase: 1, name: 'Setup parallelo', scope: 'Nuovo sistema', duration: '2 mesi', successCriteria: ['Dati migrati'] },
        { phase: 2, name: 'Run parallelo', scope: 'Entrambi attivi', duration: '1-2 mesi', successCriteria: ['Riconciliazione OK'] },
        { phase: 3, name: 'Cutover', scope: 'Switch', duration: '2 settimane', successCriteria: ['Vecchio spento'] },
      ];
    default:
      return [
        { phase: 1, name: 'Foundation', scope: 'MVP', duration: '2-3 mesi', successCriteria: ['MVP funzionante'] },
        { phase: 2, name: 'Enhancement', scope: 'Feature complete', duration: '2-3 mesi', successCriteria: ['Integrations OK'] },
        { phase: 3, name: 'Optimization', scope: 'Performance', duration: '1-2 mesi', successCriteria: ['Satisfaction > 80%'] },
      ];
  }
}

function determineChangeImpact(item: ExtendedAssessedItem): 'low' | 'medium' | 'high' | 'transformational' {
  if (item.overallScore > 80 && item.recommendation === 'accelerate') return 'transformational';
  if (item.riskLevel === 'high') return 'high';
  if (item.riskLevel === 'medium' || item.overallScore > 60) return 'medium';
  return 'low';
}

function identifyStakeholders(item: ExtendedAssessedItem): string[] {
  const stakeholders = ['IT Management', 'Project Team'];
  if (item.overallScore > 70) stakeholders.push('C-Level', 'Board');
  if (item.category?.includes('customer')) stakeholders.push('Customer Success', 'Sales');
  if (item.category?.includes('operation')) stakeholders.push('Operations', 'Finance');
  return stakeholders;
}

function generateKeyRisks(item: ExtendedAssessedItem): Array<{
  risk: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}> {
  const risks: Array<{ risk: string; probability: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high'; mitigation: string; }> = [];
  
  if (item.riskLevel === 'high') {
    risks.push({
      risk: 'Rischio esecuzione elevato',
      probability: 'high',
      impact: 'high',
      mitigation: 'Governance rafforzata con checkpoint settimanali',
    });
  }
  
  if (item.scores.resourceEfficiency < 50) {
    risks.push({
      risk: 'Carenza risorse/competenze',
      probability: 'medium',
      impact: 'high',
      mitigation: 'Piano assunzioni/formazione o partnership',
    });
  }
  
  if (risks.length === 0) {
    risks.push({
      risk: 'Rischi standard di progetto',
      probability: 'low',
      impact: 'medium',
      mitigation: 'Gestione standard con PM dedicato',
    });
  }
  
  return risks;
}

// ============================================
// DEPENDENCY & CLUSTERING FUNCTIONS
// ============================================

function identifyDependencies(items: ExtendedAssessedItem[]): InitiativeDependency[] {
  const dependencies: InitiativeDependency[] = [];
  
  const infrastructureItems = items.filter(i => 
    i.category?.toLowerCase().includes('infrastructure') || 
    i.category?.toLowerCase().includes('platform')
  );
  
  const applicationItems = items.filter(i => 
    i.category?.toLowerCase().includes('application') || 
    i.category?.toLowerCase().includes('digital')
  );
  
  for (const infra of infrastructureItems) {
    for (const app of applicationItems) {
      if (infra.overallScore > 60 && app.overallScore > 60) {
        dependencies.push({
          initiativeId: infra.itemId,
          initiativeName: infra.name,
          dependencyType: 'enables',
          relatedInitiativeId: app.itemId,
          relatedInitiativeName: app.name,
          dependencyStrength: 'soft',
          description: `${infra.name} fornisce foundation per ${app.name}`,
        });
      }
    }
  }
  
  return dependencies;
}

function createStrategicClusters(items: ExtendedAssessedItem[]): StrategicCluster[] {
  const clusters: StrategicCluster[] = [];
  
  const themes = [
    { theme: 'digital_transformation' as const, keywords: ['digital', 'cloud', 'automation', 'ai'] },
    { theme: 'cost_optimization' as const, keywords: ['cost', 'efficiency', 'consolidation'] },
    { theme: 'customer_experience' as const, keywords: ['customer', 'crm', 'portal'] },
    { theme: 'operational_excellence' as const, keywords: ['operation', 'process', 'erp'] },
    { theme: 'security_compliance' as const, keywords: ['security', 'compliance', 'risk'] },
    { theme: 'innovation' as const, keywords: ['innovation', 'r&d', 'new'] },
  ];
  
  for (const { theme, keywords } of themes) {
    const clusterItems = items.filter(item => {
      const searchText = `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase();
      return keywords.some(kw => searchText.includes(kw));
    });
    
    if (clusterItems.length > 0) {
      const totalBudget = clusterItems.reduce((sum, i) => sum + (i.estimatedBudget || 50000), 0);
      const avgScore = clusterItems.reduce((sum, i) => sum + i.overallScore, 0) / clusterItems.length;
      
      clusters.push({
        clusterId: `cluster-${theme}`,
        clusterName: theme.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        clusterTheme: theme,
        initiatives: clusterItems.map(i => i.itemId),
        totalBudget,
        expectedSynergies: `Sinergie tra ${clusterItems.length} iniziative del cluster ${theme}`,
        recommendedSequence: clusterItems.map((i, idx) => ({ order: idx + 1, initiativeId: i.itemId, initiativeName: i.name, rationale: 'Sequenza basata su score' })),
      });
    }
  }
  
  return clusters;
}

// ============================================
// DECISION MATRIX
// ============================================

function createDecisionMatrix(prioritizedItems: PrioritizedInitiative[]): DecisionMatrix {
  const quickWins: DecisionMatrix['quickWins'] = [];
  const majorProjects: DecisionMatrix['majorProjects'] = [];
  const fillIns: DecisionMatrix['fillIns'] = [];
  const thankless: DecisionMatrix['thankless'] = [];
  
  for (const item of prioritizedItems) {
    const effort = 100 - item.prioritization.ice.ease * 10;
    const value = item.prioritization.compositeScore;
    
    const entry = {
      initiativeId: item.itemId,
      name: item.itemName,
      effort,
      value,
      recommendation: '',
    };
    
    if (value >= 60 && effort < 50) {
      entry.recommendation = 'Avviare subito - alto valore, basso sforzo';
      quickWins.push(entry);
    } else if (value >= 60 && effort >= 50) {
      entry.recommendation = 'Pianificare con cura - alto valore, alto sforzo';
      majorProjects.push(entry);
    } else if (value < 60 && effort < 50) {
      entry.recommendation = 'Completare se risorse disponibili';
      fillIns.push(entry);
    } else {
      entry.recommendation = 'Riconsiderare o cancellare';
      thankless.push(entry);
    }
  }
  
  return {
    quickWins: quickWins.sort((a, b) => b.value - a.value),
    majorProjects: majorProjects.sort((a, b) => b.value - a.value),
    fillIns: fillIns.sort((a, b) => a.effort - b.effort),
    thankless: thankless.sort((a, b) => a.effort - b.effort),
  };
}

// ============================================
// RECOMMENDATIONS
// ============================================

function generateStrategicRecommendations(
  prioritizedItems: PrioritizedInitiative[],
  decisionMatrix: DecisionMatrix,
  budgetData: BudgetOptimizationResult | null
): StrategicRecommendation[] {
  const recommendations: StrategicRecommendation[] = [];
  let recCounter = 1;
  
  // Quick Wins
  if (decisionMatrix.quickWins.length > 0) {
    const topQuickWin = decisionMatrix.quickWins[0];
    recommendations.push({
      recommendationId: `REC-${String(recCounter++).padStart(3, '0')}`,
      priority: 'critical',
      category: 'immediate_action',
      title: `Avviare immediatamente ${topQuickWin.name}`,
      description: `Quick win con valore ${topQuickWin.value} e sforzo ${topQuickWin.effort}. Opportunità per generare momentum.`,
      affectedInitiatives: [topQuickWin.initiativeId],
      expectedOutcome: topQuickWin.recommendation,
      timeline: 'Immediato',
      estimatedImpact: {
        efficiencyGain: 'Visibilità immediata del programma di trasformazione',
      },
      nextSteps: ['Assegnare PM dedicato', 'Kick-off entro 2 settimane'],
    });
  }
  
  // Major Projects
  if (decisionMatrix.majorProjects.length > 0) {
    const topMajor = decisionMatrix.majorProjects[0];
    recommendations.push({
      recommendationId: `REC-${String(recCounter++).padStart(3, '0')}`,
      priority: 'high',
      category: 'strategic_investment',
      title: `Investimento strategico in ${topMajor.name}`,
      description: `Iniziativa con valore ${topMajor.value} richiede commitment significativo.`,
      affectedInitiatives: [topMajor.initiativeId],
      expectedOutcome: topMajor.recommendation,
      timeline: 'Q1-Q2',
      estimatedImpact: {
        revenueImpact: budgetData?.financialKPIs?.totalROI ? budgetData.financialKPIs.totalROI * 0.3 : undefined,
      },
      nextSteps: ['Business case dettagliato', 'Approvazione steering committee'],
    });
  }
  
  // Thankless - Decommission
  if (decisionMatrix.thankless.length > 0) {
    recommendations.push({
      recommendationId: `REC-${String(recCounter++).padStart(3, '0')}`,
      priority: 'medium',
      category: 'decommission',
      title: 'Razionalizzare iniziative a basso valore',
      description: `${decisionMatrix.thankless.length} iniziative con rapporto valore/sforzo sfavorevole.`,
      affectedInitiatives: decisionMatrix.thankless.map(t => t.initiativeId),
      expectedOutcome: 'Liberazione risorse per iniziative ad alto valore',
      timeline: 'Q1-Q2',
      estimatedImpact: {
        costSavings: decisionMatrix.thankless.reduce((sum, t) => {
          const item = prioritizedItems.find(p => p.itemId === t.initiativeId);
          return sum + (item?.estimatedBudget || 0) * 0.5;
        }, 0),
      },
      nextSteps: ['Review individuale', 'Piano transizione'],
    });
  }
  
  return recommendations;
}

// ============================================
// KPI CALCULATION
// ============================================

function calculateStrategicKPIs(
  prioritizedItems: PrioritizedInitiative[],
  assessmentSnapshot: Record<string, unknown> | null,
  budgetData: BudgetOptimizationResult | null
): StrategicKPI {
  const avgScore = prioritizedItems.reduce((sum, p) => sum + p.prioritization.compositeScore, 0) / 
                   (prioritizedItems.length || 1);
  const mustHaves = prioritizedItems.filter(p => p.prioritization.moscow === 'must_have').length;
  const stops = prioritizedItems.filter(p => p.portfolioRecommendation === 'stop').length;
  
  let portfolioTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (mustHaves > stops * 2) portfolioTrend = 'improving';
  if (stops > mustHaves) portfolioTrend = 'declining';
  
  const businessAlignment = prioritizedItems.reduce((sum, p) => {
    return sum + (p.prioritization.wsjf.businessValue * 10);
  }, 0) / (prioritizedItems.length || 1);
  
  const technologyAlignment = avgScore * 0.9;
  const resourceAlignment = prioritizedItems.reduce((sum, p) => {
    return sum + (p.strategy.deliveryModel === 'in_house' ? 80 : 60);
  }, 0) / (prioritizedItems.length || 1);
  
  const blockers = prioritizedItems
    .filter(p => p.portfolioRecommendation === 'pause')
    .map(p => `${p.itemName}: in pausa`);
  
  const enablers = prioritizedItems
    .filter(p => p.prioritization.moscow === 'must_have' && p.portfolioRecommendation === 'accelerate')
    .map(p => `${p.itemName}: pronto per accelerazione`);
  
  const totalInvestment = prioritizedItems.reduce((sum, p) => sum + (p.estimatedBudget || 0), 0);
  const expectedReturn = budgetData?.financialKPIs?.totalROI || totalInvestment * 1.5;
  
  return {
    portfolioHealth: {
      score: Math.round(avgScore),
      trend: portfolioTrend,
      assessment: `Portfolio con ${prioritizedItems.length} iniziative, ${mustHaves} must-have`,
    },
    alignmentScore: {
      businessAlignment: Math.round(businessAlignment),
      technologyAlignment: Math.round(technologyAlignment),
      resourceAlignment: Math.round(resourceAlignment),
      overall: Math.round((businessAlignment + technologyAlignment + resourceAlignment) / 3),
    },
    executionReadiness: {
      score: Math.round(100 - (blockers.length * 10)),
      blockers: blockers.slice(0, 5),
      enablers: enablers.slice(0, 5),
    },
    investmentEfficiency: {
      totalInvestment,
      expectedReturn,
      roi: Number(((expectedReturn - totalInvestment) / (totalInvestment || 1) * 100).toFixed(1)),
      paybackPeriod: budgetData?.financialKPIs?.paybackPeriodMonths 
        ? `${budgetData.financialKPIs.paybackPeriodMonths} mesi` 
        : '18-24 mesi',
    },
  };
}

// ============================================
// EXECUTIVE ACTION PLAN
// ============================================

function generateExecutiveActionPlan(
  prioritizedItems: PrioritizedInitiative[],
  planningHorizon: string
): Array<{
  quarter: string;
  focus: string;
  initiatives: Array<{ id: string; name: string; milestone: string; budget: number; owner?: string; }>;
  keyDeliverables: string[];
  decisionPoints: string[];
}> {
  const plan: Array<{
    quarter: string;
    focus: string;
    initiatives: Array<{ id: string; name: string; milestone: string; budget: number; owner?: string; }>;
    keyDeliverables: string[];
    decisionPoints: string[];
  }> = [];
  
  const mustHaves = prioritizedItems.filter(p => p.prioritization.moscow === 'must_have');
  const shouldHaves = prioritizedItems.filter(p => p.prioritization.moscow === 'should_have');
  
  // Q1
  plan.push({
    quarter: 'Q1',
    focus: 'Quick Wins e Foundation',
    initiatives: mustHaves.slice(0, 3).map(p => ({
      id: p.itemId,
      name: p.itemName,
      milestone: 'Kick-off & Setup',
      budget: p.estimatedBudget || 50000,
    })),
    keyDeliverables: ['Project charters approvati', 'Team assegnati', 'Primi quick wins completati'],
    decisionPoints: ['Go/No-Go per major projects', 'Budget confirmation'],
  });
  
  // Q2
  plan.push({
    quarter: 'Q2',
    focus: 'Execution & Scale',
    initiatives: [...mustHaves.slice(3, 5), ...shouldHaves.slice(0, 2)].map(p => ({
      id: p.itemId,
      name: p.itemName,
      milestone: 'MVP / Phase 1 Complete',
      budget: p.estimatedBudget || 50000,
    })),
    keyDeliverables: ['MVP rilasciati', 'Pilot validati', 'ROI iniziale misurato'],
    decisionPoints: ['Scale-up decisions', 'Resource reallocation'],
  });
  
  // Q3-Q4
  plan.push({
    quarter: 'Q3-Q4',
    focus: 'Optimization & Value Realization',
    initiatives: shouldHaves.slice(2, 5).map(p => ({
      id: p.itemId,
      name: p.itemName,
      milestone: 'Full Rollout',
      budget: p.estimatedBudget || 50000,
    })),
    keyDeliverables: ['Full deployment', 'Business value realized', 'Lessons learned'],
    decisionPoints: ['Year review', 'Next year planning'],
  });
  
  return plan;
}

// ============================================
// MAIN AGENT FUNCTION
// ============================================

export const strategyAdvisorAgent: SubAgent = {
  name: 'STRATEGY_ADVISOR',
  
  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    console.log('[StrategyAdvisor] Starting strategy analysis...');
    
    try {
      const input = args as unknown as StrategyAdvisorInput;
      const { tenantId, companyId } = input;
      
      const strategicProfile = await getLatestStrategicProfile(tenantId);
      const derivedWeights = deriveWeightsFromStrategicProfile(strategicProfile);
      const weights = normalizeWeights(input.prioritizationWeights || derivedWeights || {
        wsjfWeight: 0.4,
        iceWeight: 0.3,
        portfolioScoreWeight: 0.3,
      });
      
      const planningHorizon = input.planningHorizon || '2_years';
      
      // Load data
      console.log('[StrategyAdvisor] Loading data from previous steps...');
      
      const [assessmentSnapshot, portfolioItems, portfolioAssessment, roadmap, budgetOptimization] = await Promise.all([
        loadAssessmentSnapshot(tenantId),
        loadPortfolioItems(tenantId),
        loadPortfolioAssessment(tenantId),
        loadRoadmap(tenantId),
        loadBudgetOptimization(tenantId),
      ]);
      const snapshotPayload = extractSnapshotPayload(assessmentSnapshot);
      const maturityLevel = deriveMaturityLevel(snapshotPayload);
      
      // Validation
      if (!portfolioAssessment || !portfolioAssessment.itemAssessments || portfolioAssessment.itemAssessments.length === 0) {
        return {
          content: JSON.stringify({ error: 'Portfolio Assessment (Step 3) è richiesto. Completare prima la valutazione del portfolio.' }),
          metadata: { success: false, error: 'Portfolio Assessment (Step 3) è richiesto.' },
        };
      }
      
      console.log(`[StrategyAdvisor] Loaded: ${portfolioAssessment.itemAssessments.length} assessed items`);
      
      // Convert to extended items
      const extendedItems = portfolioAssessment.itemAssessments.map(toExtendedItem);
      
      // Enrich with portfolio item data
      for (const item of extendedItems) {
        const portfolioItem = portfolioItems.find(pi => 
          String(pi.id) === item.itemId || String(pi.item_id) === item.itemId
        );
        if (portfolioItem) {
          item.category = String(portfolioItem.category || '');
          item.type = (portfolioItem.itemType as 'product' | 'service') || 'product';
          item.estimatedBudget = Number(portfolioItem.budget) || undefined;
        }
      }
      
      // Create roadmap phase map
      const roadmapPhaseMap = new Map<string, number>();
      if (roadmap?.phases) {
        roadmap.phases.forEach((phase, idx) => {
          phase.initiatives?.forEach((init: { itemId?: string }) => {
            if (init.itemId) {
              roadmapPhaseMap.set(init.itemId, idx + 1);
            }
          });
        });
      }
      
      // Prioritize items
      console.log('[StrategyAdvisor] Calculating prioritization scores...');
      
      const prioritizedItems: PrioritizedInitiative[] = extendedItems.map((item) => {
        const roadmapPhase = roadmapPhaseMap.get(item.itemId);
        
        const wsjf = calculateWSJF(item, roadmapPhase);
        const ice = calculateICE(item);
        const moscow = determineMoSCoW(item, wsjf.score);
        const compositeScore = calculateCompositeScore(wsjf.score, ice.score, item.overallScore, weights);
        
        const strategy = determineImplementationStrategy(item, maturityLevel);
        
        // Map recommendation to allowed values
        let portfolioRec: 'keep' | 'accelerate' | 'pause' | 'stop' | undefined;
        if (['keep', 'accelerate', 'pause', 'stop'].includes(item.recommendation)) {
          portfolioRec = item.recommendation as 'keep' | 'accelerate' | 'pause' | 'stop';
        } else if (item.recommendation === 'review') {
          portfolioRec = 'keep';
        } else if (item.recommendation === 'merge') {
          portfolioRec = 'pause';
        }
        
        return {
          itemId: item.itemId,
          itemName: item.name,
          itemType: item.type,
          category: item.category,
          portfolioScore: item.overallScore,
          portfolioRecommendation: portfolioRec,
          prioritization: {
            moscow: moscow.priority,
            moscowRationale: moscow.rationale,
            wsjf,
            ice,
            compositeScore,
            priorityRank: 0,
          },
          strategy,
          estimatedBudget: item.estimatedBudget || 0,
          estimatedDuration: item.estimatedDuration || '6 mesi',
          expectedROI: item.expectedROI,
          executiveSummary: `${item.name}: ${moscow.priority.replace('_', ' ')} - ${item.recommendation}. Score: ${compositeScore}`,
          keyBenefits: item.strengths?.slice(0, 3) || [],
          criticalSuccessFactors: item.weaknesses?.slice(0, 3).map((w: string) => `Mitigare: ${w}`) || [],
        };
      });
      
      // Sort and rank
      prioritizedItems.sort((a, b) => b.prioritization.compositeScore - a.prioritization.compositeScore);
      prioritizedItems.forEach((item, idx) => {
        item.prioritization.priorityRank = idx + 1;
      });
      
      // Dependencies & Clusters
      console.log('[StrategyAdvisor] Identifying dependencies and clusters...');
      const dependencyMap = identifyDependencies(extendedItems);
      const strategicClusters = createStrategicClusters(extendedItems);
      
      // Decision Matrix
      console.log('[StrategyAdvisor] Creating decision matrix...');
      const decisionMatrix = createDecisionMatrix(prioritizedItems);
      
      // Recommendations
      console.log('[StrategyAdvisor] Generating strategic recommendations...');
      const recommendations = generateStrategicRecommendations(prioritizedItems, decisionMatrix, budgetOptimization);
      
      // KPIs
      console.log('[StrategyAdvisor] Calculating strategic KPIs...');
      const strategicKPIs = calculateStrategicKPIs(prioritizedItems, assessmentSnapshot, budgetOptimization);
      
      // Executive Action Plan
      console.log('[StrategyAdvisor] Generating executive action plan...');
      const executiveActionPlan = generateExecutiveActionPlan(prioritizedItems, planningHorizon);
      
      // Build result
      const strategyId = uuidv4();
      const now = new Date().toISOString();
      
      const result: StrategyAdvisorResult = {
        strategyId,
        tenantId,
        companyId,
        generatedAt: now,
        portfolioAssessmentId: portfolioAssessment.assessmentId,
        roadmapId: roadmap?.roadmapId,
        budgetOptimizationId: budgetOptimization?.optimizationId,
        executiveSummary: {
          overallAssessment: `Portfolio analizzato: ${prioritizedItems.length} iniziative. ${prioritizedItems.filter(p => p.prioritization.moscow === 'must_have').length} must-have.`,
          keyFindings: [
            `${decisionMatrix.quickWins.length} quick wins identificati`,
            `${decisionMatrix.majorProjects.length} progetti strategici`,
            `${decisionMatrix.thankless.length} da razionalizzare`,
            `${strategicClusters.length} cluster tematici`,
          ],
          topPriorities: prioritizedItems.slice(0, 5).map(p => `${p.prioritization.priorityRank}. ${p.itemName} (${p.prioritization.moscow})`),
          criticalDecisions: recommendations.filter(r => r.priority === 'critical').map(r => r.title),
          timeHorizon: planningHorizon.replace('_', ' '),
        },
        prioritizedInitiatives: prioritizedItems,
        dependencyMap,
        strategicClusters,
        decisionMatrix,
        recommendations,
        strategicKPIs,
        executiveActionPlan,
        confidenceLevel: Math.min(95, 60 + (portfolioAssessment.itemAssessments.length * 2)),
        dataQualityScore: roadmap && budgetOptimization ? 90 : roadmap || budgetOptimization ? 75 : 60,
        assumptions: [
          'Budget e risorse come da ultimo assessment',
          'Timeline basata su maturità IT attuale',
          'Dipendenze identificate su base euristica',
        ],
        limitations: [
          roadmap ? null : 'Roadmap non disponibile - sequencing approssimato',
          budgetOptimization ? null : 'Budget optimization non disponibile - stime preliminari',
        ].filter(Boolean) as string[],
      };

      const userObjectives = buildUserObjectives(strategicProfile, snapshotPayload, input.strategicFocus);
      const knowledgeQuery = buildKnowledgeQuery(strategicProfile, input.strategicFocus);
      const advisorKnowledge = await loadAdvisorKnowledge(tenantId, knowledgeQuery);
      if (advisorKnowledge.sourcesSummary) {
        result.assumptions.push(advisorKnowledge.sourcesSummary);
      }

      const topInitiativesForAdvisory = prioritizedItems.slice(0, 12).map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        category: item.category,
        moscow: item.prioritization.moscow,
        compositeScore: item.prioritization.compositeScore,
        portfolioRecommendation: item.portfolioRecommendation,
        estimatedBudget: item.estimatedBudget,
        expectedROI: item.expectedROI,
      }));

      const portfolioSummary = {
        totalInitiatives: prioritizedItems.length,
        mustHaveCount: prioritizedItems.filter(p => p.prioritization.moscow === 'must_have').length,
        quickWinsCount: decisionMatrix.quickWins.length,
        majorProjectsCount: decisionMatrix.majorProjects.length,
        portfolioHealth: portfolioAssessment?.portfolioHealth || null,
        recommendationDistribution: portfolioAssessment?.recommendationDistribution || null,
        primaryRisks: portfolioAssessment?.portfolioRisks?.slice(0, 5) || [],
      };

      const budgetSummary = budgetOptimization
        ? {
            totalBudget: budgetOptimization.inputSummary?.totalAvailableBudget,
            budgetGap: budgetOptimization.inputSummary?.budgetGap,
            recommendedScenario: budgetOptimization.recommendedScenario,
            financialKPIs: budgetOptimization.financialKPIs,
          }
        : { note: 'No budget optimization data available' };

      const advisoryEnhancement = await generateAdvisorEnhancement({
        systemPrompt,
        userObjectives,
        knowledgeContext: advisorKnowledge.knowledgeContext,
        strategicFocus: input.strategicFocus,
        strategicConstraints: input.strategicConstraints,
        planningHorizon,
        portfolioSummary,
        topInitiatives: topInitiativesForAdvisory,
        decisionMatrix,
        budgetSummary,
        fallbackSummary: result.executiveSummary,
      });

      if (advisoryEnhancement) {
        result.executiveSummary = advisoryEnhancement.executiveSummary || result.executiveSummary;

        const knownIds = new Set(prioritizedItems.map(p => p.itemId));
        const fallbackIds = prioritizedItems.slice(0, 3).map(p => p.itemId);
        const sanitizedRecommendations = sanitizeRecommendations(
          advisoryEnhancement.recommendations || [],
          knownIds,
          fallbackIds
        );

        if (sanitizedRecommendations.length > 0) {
          result.recommendations = sanitizedRecommendations;
        }

        if (advisoryEnhancement.assumptions?.length) {
          result.assumptions.push(...advisoryEnhancement.assumptions);
        }

        if (advisoryEnhancement.limitations?.length) {
          result.limitations.push(...advisoryEnhancement.limitations);
        }
      }
      
      // Save to Supabase
      console.log('[StrategyAdvisor] Saving to Supabase...');
      
      const { error: saveError } = await supabase
        .from('strategy_analyses')
        .insert({
          strategy_id: strategyId,
          tenant_id: tenantId,
          company_id: companyId,
          portfolio_assessment_id: portfolioAssessment.assessmentId,
          roadmap_id: roadmap?.roadmapId,
          budget_optimization_id: budgetOptimization?.optimizationId,
          total_initiatives: prioritizedItems.length,
          must_have_count: prioritizedItems.filter(p => p.prioritization.moscow === 'must_have').length,
          should_have_count: prioritizedItems.filter(p => p.prioritization.moscow === 'should_have').length,
          could_have_count: prioritizedItems.filter(p => p.prioritization.moscow === 'could_have').length,
          wont_have_count: prioritizedItems.filter(p => p.prioritization.moscow === 'wont_have').length,
          quick_wins_count: decisionMatrix.quickWins.length,
          major_projects_count: decisionMatrix.majorProjects.length,
          prioritized_initiatives: prioritizedItems,
          dependency_map: dependencyMap,
          strategic_clusters: strategicClusters,
          decision_matrix: decisionMatrix,
          recommendations,
          strategic_kpis: strategicKPIs,
          executive_action_plan: executiveActionPlan,
          confidence_level: result.confidenceLevel,
          data_quality_score: result.dataQualityScore,
          planning_horizon: planningHorizon,
          result,
          created_at: now,
          updated_at: now,
        });
      
      if (saveError) {
        console.error('[StrategyAdvisor] Error saving to Supabase:', saveError);
      } else {
        console.log(`[StrategyAdvisor] Saved strategy analysis: ${strategyId}`);
      }
      
      return {
        content: JSON.stringify(result),
        metadata: { success: true, strategyId },
      };
      
    } catch (error) {
      console.error('[StrategyAdvisor] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error in Strategy Advisor';
      return {
        content: JSON.stringify({ error: errorMessage }),
        metadata: { success: false, error: errorMessage },
      };
    }
  },
};

export default strategyAdvisorAgent;
