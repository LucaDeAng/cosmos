/**
 * Centralized Context Loader for THEMIS Agents
 * 
 * Eliminates duplicate data loading code across agents by providing
 * a single source of truth for loading assessment, portfolio, roadmap,
 * budget and strategy data.
 */

import { supabase } from '../../config/supabase';
import { PortfolioAssessmentResult, ItemAssessment } from '../schemas/portfolioAssessmentSchema';
import { RoadmapResult } from '../schemas/roadmapSchema';
import { BudgetOptimizationResult } from '../schemas/budgetSchema';
import { StrategyAdvisorResult } from '../schemas/strategySchema';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface AssessmentSnapshot {
  id: string;
  tenant_id: string;
  overall_maturity: number;
  governance_score: number;
  visibility_score: number;
  ppm_maturity_level: number;
  strengths: string[];
  challenges: string[];
  cluster: string;
  recommendations: Array<{
    title: string;
    description: string;
    priority: string;
  }>;
  created_at: string;
  [key: string]: unknown;
}

export interface PortfolioItem {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: 'initiative' | 'product' | 'service';
  status: string;
  priority?: string;
  budget?: number;
  category?: string;
  owner?: string;
  strategic_alignment?: number;
  business_value?: number;
  risk_level?: string;
  created_at: string;
  [key: string]: unknown;
}

export interface AgentContext {
  tenantId: string;
  assessmentSnapshot: AssessmentSnapshot | null;
  portfolioItems: PortfolioItem[];
  portfolioAssessment: PortfolioAssessmentResult | null;
  roadmap: RoadmapResult | null;
  budgetOptimization: BudgetOptimizationResult | null;
  strategyAnalysis: StrategyAdvisorResult | null;
  // Metadata about what was loaded
  loadedAt: Date;
  loadingErrors: string[];
}

export interface ContextLoadOptions {
  includeAssessment?: boolean;
  includePortfolio?: boolean;
  includePortfolioAssessment?: boolean;
  includeRoadmap?: boolean;
  includeBudget?: boolean;
  includeStrategy?: boolean;
}

// ============================================
// INDIVIDUAL LOADERS
// ============================================

export async function loadAssessmentSnapshot(tenantId: string): Promise<AssessmentSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      // Try company_assessments as fallback
      const { data: fallback, error: fallbackError } = await supabase
        .from('company_assessments')
        .select('*')
        .eq('company_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (fallbackError) {
        console.warn('[ContextLoader] Could not load assessment:', error.message);
        return null;
      }
      
      // Map company_assessments to AssessmentSnapshot format
      return {
        id: fallback.id,
        tenant_id: tenantId,
        overall_maturity: fallback.ai_profile?.ppmMaturityLevel || 3,
        governance_score: fallback.ai_profile?.governanceScore || 50,
        visibility_score: fallback.ai_profile?.visibilityScore || 50,
        ppm_maturity_level: fallback.ai_profile?.ppmMaturityLevel || 3,
        strengths: fallback.ai_profile?.strengths || [],
        challenges: fallback.ai_profile?.challenges || [],
        cluster: fallback.ai_cluster || 'unknown',
        recommendations: fallback.ai_recommendations || [],
        created_at: fallback.created_at,
        raw: fallback,
      };
    }
    
    return data as AssessmentSnapshot;
  } catch (err) {
    console.warn('[ContextLoader] Error loading assessment snapshot:', err);
    return null;
  }
}

export async function loadPortfolioItems(tenantId: string): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
  const errors: string[] = [];
  
  try {
    // Load initiatives
    const { data: initiatives, error: initError } = await supabase
      .from('initiatives')
      .select('*')
      .or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);
    
    if (initError) {
      errors.push(`initiatives: ${initError.message}`);
    } else if (initiatives) {
      items.push(...initiatives.map(i => ({
        ...i,
        name: i.title || i.name,
        type: 'initiative' as const,
      })));
    }

    // Load products
    const { data: products, error: prodError } = await supabase
      .from('portfolio_products')
      .select('*')
      .eq('tenant_id', tenantId);
    
    if (prodError) {
      errors.push(`products: ${prodError.message}`);
    } else if (products) {
      items.push(...products.map(p => ({
        ...p,
        type: 'product' as const,
      })));
    }

    // Load services
    const { data: services, error: servError } = await supabase
      .from('portfolio_services')
      .select('*')
      .eq('tenant_id', tenantId);
    
    if (servError) {
      errors.push(`services: ${servError.message}`);
    } else if (services) {
      items.push(...services.map(s => ({
        ...s,
        type: 'service' as const,
      })));
    }
    
    if (errors.length > 0) {
      console.warn('[ContextLoader] Some portfolio loading errors:', errors);
    }
    
    console.log(`[ContextLoader] Loaded ${items.length} portfolio items for tenant ${tenantId}`);
    return items;
  } catch (err) {
    console.warn('[ContextLoader] Error loading portfolio items:', err);
    return items;
  }
}

export async function loadPortfolioAssessment(tenantId: string): Promise<PortfolioAssessmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('portfolio_assessments')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data?.result) {
      console.warn('[ContextLoader] Could not load portfolio assessment:', error?.message);
      return null;
    }
    return data.result as PortfolioAssessmentResult;
  } catch (err) {
    console.warn('[ContextLoader] Error loading portfolio assessment:', err);
    return null;
  }
}

export async function loadRoadmap(tenantId: string): Promise<RoadmapResult | null> {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data?.result) {
      console.warn('[ContextLoader] Could not load roadmap:', error?.message);
      return null;
    }
    return data.result as RoadmapResult;
  } catch (err) {
    console.warn('[ContextLoader] Error loading roadmap:', err);
    return null;
  }
}

export async function loadBudgetOptimization(tenantId: string): Promise<BudgetOptimizationResult | null> {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data?.result) {
      console.warn('[ContextLoader] Could not load budget optimization:', error?.message);
      return null;
    }
    return data.result as BudgetOptimizationResult;
  } catch (err) {
    console.warn('[ContextLoader] Error loading budget optimization:', err);
    return null;
  }
}

export async function loadStrategyAnalysis(tenantId: string): Promise<StrategyAdvisorResult | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data?.result) {
      console.warn('[ContextLoader] Could not load strategy analysis:', error?.message);
      return null;
    }
    return data.result as StrategyAdvisorResult;
  } catch (err) {
    console.warn('[ContextLoader] Error loading strategy analysis:', err);
    return null;
  }
}

// ============================================
// MAIN CONTEXT LOADER
// ============================================

/**
 * Load agent context from Supabase
 * 
 * @param tenantId - The tenant/company ID to load data for
 * @param options - Optional flags to specify which data to load (defaults to all)
 * @returns AgentContext with requested data
 * 
 * @example
 * // Load all context
 * const ctx = await loadAgentContext('tenant-123');
 * 
 * @example
 * // Load only assessment and portfolio
 * const ctx = await loadAgentContext('tenant-123', { 
 *   includeAssessment: true, 
 *   includePortfolio: true 
 * });
 */
export async function loadAgentContext(
  tenantId: string,
  options?: ContextLoadOptions
): Promise<AgentContext> {
  const loadAll = !options || Object.keys(options).length === 0;
  const errors: string[] = [];
  
  // Build promises array based on options
  const promises: Promise<unknown>[] = [];
  const promiseMap: Record<number, string> = {};
  let idx = 0;
  
  if (loadAll || options?.includeAssessment) {
    promiseMap[idx++] = 'assessment';
    promises.push(loadAssessmentSnapshot(tenantId).catch(e => {
      errors.push(`assessment: ${e.message}`);
      return null;
    }));
  }
  
  if (loadAll || options?.includePortfolio) {
    promiseMap[idx++] = 'portfolioItems';
    promises.push(loadPortfolioItems(tenantId).catch(e => {
      errors.push(`portfolioItems: ${e.message}`);
      return [];
    }));
  }
  
  if (loadAll || options?.includePortfolioAssessment) {
    promiseMap[idx++] = 'portfolioAssessment';
    promises.push(loadPortfolioAssessment(tenantId).catch(e => {
      errors.push(`portfolioAssessment: ${e.message}`);
      return null;
    }));
  }
  
  if (loadAll || options?.includeRoadmap) {
    promiseMap[idx++] = 'roadmap';
    promises.push(loadRoadmap(tenantId).catch(e => {
      errors.push(`roadmap: ${e.message}`);
      return null;
    }));
  }
  
  if (loadAll || options?.includeBudget) {
    promiseMap[idx++] = 'budget';
    promises.push(loadBudgetOptimization(tenantId).catch(e => {
      errors.push(`budget: ${e.message}`);
      return null;
    }));
  }
  
  if (loadAll || options?.includeStrategy) {
    promiseMap[idx++] = 'strategy';
    promises.push(loadStrategyAnalysis(tenantId).catch(e => {
      errors.push(`strategy: ${e.message}`);
      return null;
    }));
  }
  
  // Execute all in parallel
  const results = await Promise.all(promises);
  
  // Map results back
  const resultMap: Record<string, unknown> = {};
  results.forEach((result, i) => {
    resultMap[promiseMap[i]] = result;
  });
  
  return {
    tenantId,
    assessmentSnapshot: (resultMap['assessment'] as AssessmentSnapshot) || null,
    portfolioItems: (resultMap['portfolioItems'] as PortfolioItem[]) || [],
    portfolioAssessment: (resultMap['portfolioAssessment'] as PortfolioAssessmentResult) || null,
    roadmap: (resultMap['roadmap'] as RoadmapResult) || null,
    budgetOptimization: (resultMap['budget'] as BudgetOptimizationResult) || null,
    strategyAnalysis: (resultMap['strategy'] as StrategyAdvisorResult) || null,
    loadedAt: new Date(),
    loadingErrors: errors,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if required context exists for a specific agent step
 */
export function validateContextForStep(
  context: AgentContext,
  step: 'portfolio_assessment' | 'roadmap' | 'budget' | 'strategy'
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // All steps require assessment
  if (!context.assessmentSnapshot) {
    missing.push('Client Assessment (Step 1)');
  }
  
  // All steps require portfolio
  if (context.portfolioItems.length === 0) {
    missing.push('Portfolio Items (Step 2)');
  }
  
  // Roadmap requires portfolio assessment
  if (step === 'roadmap' || step === 'budget' || step === 'strategy') {
    if (!context.portfolioAssessment) {
      missing.push('Portfolio Assessment (Step 3)');
    }
  }
  
  // Budget requires roadmap
  if (step === 'budget' || step === 'strategy') {
    if (!context.roadmap) {
      missing.push('Roadmap (Step 4)');
    }
  }
  
  // Strategy requires budget (optional but recommended)
  if (step === 'strategy') {
    if (!context.budgetOptimization) {
      // This is a warning, not a blocker
      console.warn('[ContextLoader] Budget optimization not found - strategy will work but may be less optimal');
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Build a context summary string for LLM prompts
 */
export function buildContextSummary(context: AgentContext): string {
  const parts: string[] = [];
  
  if (context.assessmentSnapshot) {
    parts.push(`## IT Maturity Assessment
- Overall Maturity: ${context.assessmentSnapshot.overall_maturity}/5
- Governance Score: ${context.assessmentSnapshot.governance_score}/100
- Visibility Score: ${context.assessmentSnapshot.visibility_score}/100
- Cluster: ${context.assessmentSnapshot.cluster}
- Key Strengths: ${context.assessmentSnapshot.strengths?.slice(0, 3).join(', ') || 'N/A'}
- Key Challenges: ${context.assessmentSnapshot.challenges?.slice(0, 3).join(', ') || 'N/A'}`);
  }
  
  if (context.portfolioItems.length > 0) {
    const byType = {
      initiative: context.portfolioItems.filter(i => i.type === 'initiative').length,
      product: context.portfolioItems.filter(i => i.type === 'product').length,
      service: context.portfolioItems.filter(i => i.type === 'service').length,
    };
    parts.push(`## Portfolio
- Total Items: ${context.portfolioItems.length}
- Initiatives: ${byType.initiative}
- Products: ${byType.product}
- Services: ${byType.service}`);
  }
  
  if (context.portfolioAssessment) {
    parts.push(`## Portfolio Assessment
- Overall Health: ${context.portfolioAssessment.portfolioHealth?.overallScore || 'N/A'}/100
- Items Assessed: ${context.portfolioAssessment.assessedItems || 0}`);
  }
  
  if (context.roadmap) {
    parts.push(`## Roadmap
- Phases: ${context.roadmap.phases?.length || 0}
- Horizon: ${context.roadmap.horizonMonths || 'N/A'} months`);
  }
  
  if (context.budgetOptimization) {
    parts.push(`## Budget Optimization
- Total Budget: €${context.budgetOptimization.inputSummary?.totalAvailableBudget?.toLocaleString() || 'N/A'}
- Scenarios: ${(context.budgetOptimization as any).scenarios?.length || 0}`);
  }
  
  return parts.join('\n\n');
}

export default {
  loadAgentContext,
  loadAssessmentSnapshot,
  loadPortfolioItems,
  loadPortfolioAssessment,
  loadRoadmap,
  loadBudgetOptimization,
  loadStrategyAnalysis,
  validateContextForStep,
  buildContextSummary,
};
