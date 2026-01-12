import { supabase } from '../config/supabase';
import { StrategyAdvisorResult } from '../agents/schemas/strategySchema';

// ============================================
// STRATEGY REPOSITORY
// ============================================

/**
 * Salva un'analisi strategica
 */
export async function saveStrategyAnalysis(
  strategyId: string,
  tenantId: string,
  companyId: string,
  result: StrategyAdvisorResult
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('strategy_analyses')
      .upsert({
        strategy_id: strategyId,
        tenant_id: tenantId,
        company_id: companyId,
        portfolio_assessment_id: result.portfolioAssessmentId,
        roadmap_id: result.roadmapId,
        budget_optimization_id: result.budgetOptimizationId,
        total_initiatives: result.prioritizedInitiatives.length,
        must_have_count: result.prioritizedInitiatives.filter(p => p.prioritization.moscow === 'must_have').length,
        should_have_count: result.prioritizedInitiatives.filter(p => p.prioritization.moscow === 'should_have').length,
        could_have_count: result.prioritizedInitiatives.filter(p => p.prioritization.moscow === 'could_have').length,
        wont_have_count: result.prioritizedInitiatives.filter(p => p.prioritization.moscow === 'wont_have').length,
        quick_wins_count: result.decisionMatrix.quickWins.length,
        major_projects_count: result.decisionMatrix.majorProjects.length,
        prioritized_initiatives: result.prioritizedInitiatives,
        dependency_map: result.dependencyMap,
        strategic_clusters: result.strategicClusters,
        decision_matrix: result.decisionMatrix,
        recommendations: result.recommendations,
        strategic_kpis: result.strategicKPIs,
        executive_action_plan: result.executiveActionPlan,
        confidence_level: result.confidenceLevel,
        data_quality_score: result.dataQualityScore,
        planning_horizon: result.executiveSummary.timeHorizon,
        result,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'strategy_id',
      });

    if (error) {
      console.error('[StrategyRepository] Error saving:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Recupera un'analisi strategica per ID
 */
export async function getStrategyAnalysis(strategyId: string): Promise<StrategyAdvisorResult | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('result')
      .eq('strategy_id', strategyId)
      .single();

    if (error) {
      console.warn('[StrategyRepository] Error fetching:', error.message);
      return null;
    }

    return data?.result as StrategyAdvisorResult;
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return null;
  }
}

/**
 * Recupera l'ultima analisi strategica per tenant
 */
export async function getLatestStrategyAnalysis(tenantId: string): Promise<StrategyAdvisorResult | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn('[StrategyRepository] Error fetching latest:', error.message);
      return null;
    }

    return data?.result as StrategyAdvisorResult;
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return null;
  }
}

/**
 * Lista tutte le analisi strategiche per tenant
 */
export async function getStrategyAnalysesByTenant(
  tenantId: string,
  limit: number = 10
): Promise<Array<{
  strategyId: string;
  createdAt: string;
  totalInitiatives: number;
  mustHaveCount: number;
  quickWinsCount: number;
  confidenceLevel: number;
}>> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('strategy_id, created_at, total_initiatives, must_have_count, quick_wins_count, confidence_level')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[StrategyRepository] Error listing:', error.message);
      return [];
    }

    return (data || []).map(row => ({
      strategyId: row.strategy_id,
      createdAt: row.created_at,
      totalInitiatives: row.total_initiatives,
      mustHaveCount: row.must_have_count,
      quickWinsCount: row.quick_wins_count,
      confidenceLevel: row.confidence_level,
    }));
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return [];
  }
}

/**
 * Elimina un'analisi strategica
 */
export async function deleteStrategyAnalysis(strategyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('strategy_analyses')
      .delete()
      .eq('strategy_id', strategyId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Recupera le raccomandazioni prioritarie
 */
export async function getPriorityRecommendations(
  strategyId: string,
  priority?: 'critical' | 'high' | 'medium' | 'low'
): Promise<Array<{
  recommendationId: string;
  priority: string;
  category: string;
  title: string;
  description: string;
  affectedInitiatives: string[];
  timeline: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('recommendations')
      .eq('strategy_id', strategyId)
      .single();

    if (error || !data?.recommendations) {
      return [];
    }

    let recommendations = data.recommendations as Array<{
      recommendationId: string;
      priority: string;
      category: string;
      title: string;
      description: string;
      affectedInitiatives: string[];
      timeline: string;
    }>;

    if (priority) {
      recommendations = recommendations.filter(r => r.priority === priority);
    }

    return recommendations;
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return [];
  }
}

/**
 * Recupera la decision matrix
 */
export async function getDecisionMatrix(strategyId: string): Promise<{
  quickWins: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
  majorProjects: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
  fillIns: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
  thankless: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
} | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('decision_matrix')
      .eq('strategy_id', strategyId)
      .single();

    if (error) {
      return null;
    }

    return data?.decision_matrix as {
      quickWins: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
      majorProjects: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
      fillIns: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
      thankless: Array<{ initiativeId: string; name: string; value: number; effort: number; recommendation: string }>;
    };
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return null;
  }
}

/**
 * Recupera i cluster strategici
 */
export async function getStrategicClusters(strategyId: string): Promise<Array<{
  clusterId: string;
  clusterName: string;
  clusterTheme: string;
  initiatives: string[];
  totalBudget: number;
}>> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('strategic_clusters')
      .eq('strategy_id', strategyId)
      .single();

    if (error || !data?.strategic_clusters) {
      return [];
    }

    return data.strategic_clusters as Array<{
      clusterId: string;
      clusterName: string;
      clusterTheme: string;
      initiatives: string[];
      totalBudget: number;
    }>;
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return [];
  }
}

/**
 * Recupera KPI strategici
 */
export async function getStrategicKPIs(strategyId: string): Promise<{
  portfolioHealth: { score: number; trend: string; assessment: string };
  alignmentScore: { businessAlignment: number; technologyAlignment: number; resourceAlignment: number; overall: number };
  executionReadiness: { score: number; blockers: string[]; enablers: string[] };
  investmentEfficiency: { totalInvestment: number; expectedReturn: number; roi: number; paybackPeriod: string };
} | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('strategic_kpis')
      .eq('strategy_id', strategyId)
      .single();

    if (error) {
      return null;
    }

    return data?.strategic_kpis as {
      portfolioHealth: { score: number; trend: string; assessment: string };
      alignmentScore: { businessAlignment: number; technologyAlignment: number; resourceAlignment: number; overall: number };
      executionReadiness: { score: number; blockers: string[]; enablers: string[] };
      investmentEfficiency: { totalInvestment: number; expectedReturn: number; roi: number; paybackPeriod: string };
    };
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return null;
  }
}

/**
 * Statistiche aggregate per tenant
 */
export async function getStrategyStats(tenantId: string): Promise<{
  totalAnalyses: number;
  avgConfidence: number;
  avgMustHaveRatio: number;
  avgQuickWinsRatio: number;
  latestAnalysisDate: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('confidence_level, total_initiatives, must_have_count, quick_wins_count, created_at')
      .eq('tenant_id', tenantId);

    if (error || !data || data.length === 0) {
      return {
        totalAnalyses: 0,
        avgConfidence: 0,
        avgMustHaveRatio: 0,
        avgQuickWinsRatio: 0,
        latestAnalysisDate: null,
      };
    }

    const totalAnalyses = data.length;
    const avgConfidence = data.reduce((sum, r) => sum + (r.confidence_level || 0), 0) / totalAnalyses;
    const avgMustHaveRatio = data.reduce((sum, r) => {
      const ratio = r.total_initiatives > 0 ? (r.must_have_count / r.total_initiatives) * 100 : 0;
      return sum + ratio;
    }, 0) / totalAnalyses;
    const avgQuickWinsRatio = data.reduce((sum, r) => {
      const ratio = r.total_initiatives > 0 ? (r.quick_wins_count / r.total_initiatives) * 100 : 0;
      return sum + ratio;
    }, 0) / totalAnalyses;
    
    const sorted = [...data].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      totalAnalyses,
      avgConfidence: Math.round(avgConfidence),
      avgMustHaveRatio: Math.round(avgMustHaveRatio),
      avgQuickWinsRatio: Math.round(avgQuickWinsRatio),
      latestAnalysisDate: sorted[0]?.created_at || null,
    };
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return {
      totalAnalyses: 0,
      avgConfidence: 0,
      avgMustHaveRatio: 0,
      avgQuickWinsRatio: 0,
      latestAnalysisDate: null,
    };
  }
}

/**
 * Confronta due analisi strategiche
 */
export async function compareStrategyAnalyses(
  strategyId1: string,
  strategyId2: string
): Promise<{
  comparison: {
    initiatives: { id1: number; id2: number; diff: number };
    mustHaves: { id1: number; id2: number; diff: number };
    quickWins: { id1: number; id2: number; diff: number };
    confidence: { id1: number; id2: number; diff: number };
    portfolioHealth: { id1: number; id2: number; diff: number };
  };
} | null> {
  try {
    const { data, error } = await supabase
      .from('strategy_analyses')
      .select('strategy_id, total_initiatives, must_have_count, quick_wins_count, confidence_level, strategic_kpis')
      .in('strategy_id', [strategyId1, strategyId2]);

    if (error || !data || data.length !== 2) {
      return null;
    }

    const s1 = data.find(d => d.strategy_id === strategyId1)!;
    const s2 = data.find(d => d.strategy_id === strategyId2)!;
    
    const kpi1 = s1.strategic_kpis as { portfolioHealth?: { score?: number } } | null;
    const kpi2 = s2.strategic_kpis as { portfolioHealth?: { score?: number } } | null;

    return {
      comparison: {
        initiatives: {
          id1: s1.total_initiatives,
          id2: s2.total_initiatives,
          diff: s2.total_initiatives - s1.total_initiatives,
        },
        mustHaves: {
          id1: s1.must_have_count,
          id2: s2.must_have_count,
          diff: s2.must_have_count - s1.must_have_count,
        },
        quickWins: {
          id1: s1.quick_wins_count,
          id2: s2.quick_wins_count,
          diff: s2.quick_wins_count - s1.quick_wins_count,
        },
        confidence: {
          id1: s1.confidence_level,
          id2: s2.confidence_level,
          diff: s2.confidence_level - s1.confidence_level,
        },
        portfolioHealth: {
          id1: kpi1?.portfolioHealth?.score || 0,
          id2: kpi2?.portfolioHealth?.score || 0,
          diff: (kpi2?.portfolioHealth?.score || 0) - (kpi1?.portfolioHealth?.score || 0),
        },
      },
    };
  } catch (err) {
    console.error('[StrategyRepository] Exception:', err);
    return null;
  }
}
