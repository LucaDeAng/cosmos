import { supabase } from '../config/supabase';
import type { BudgetOptimizationResult, BudgetScenario } from '../agents/schemas/budgetSchema';

/**
 * Salva o aggiorna un'ottimizzazione budget
 */
export async function saveBudgetOptimization(optimization: BudgetOptimizationResult) {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .upsert({
        optimization_id: optimization.optimizationId,
        tenant_id: optimization.tenantId,
        company_id: optimization.companyId,
        roadmap_id: optimization.roadmapId,
        version: optimization.version,
        total_available_budget: optimization.inputSummary.totalAvailableBudget,
        total_requested_budget: optimization.inputSummary.totalRequestedBudget,
        budget_gap: optimization.inputSummary.budgetGap,
        portfolio_item_count: optimization.inputSummary.portfolioItemCount,
        horizon_months: optimization.inputSummary.horizonMonths,
        executive_summary: optimization.executiveSummary,
        current_state_analysis: optimization.currentStateAnalysis,
        scenarios: optimization.scenarios,
        recommended_scenario: optimization.recommendedScenario,
        optimization_recommendations: optimization.optimizationRecommendations,
        savings_opportunities: optimization.savingsOpportunities,
        investment_priorities: optimization.investmentPriorities,
        quarterly_budget_plan: optimization.quarterlyBudgetPlan,
        financial_risks: optimization.financialRisks,
        financial_kpis: optimization.financialKPIs,
        confidence_level: optimization.confidenceLevel,
        assumptions: optimization.assumptions,
        limitations: optimization.limitations,
        data_quality_score: optimization.dataQualityScore,
        result: optimization,
        created_at: optimization.createdAt,
      }, { onConflict: 'optimization_id' })
      .select();

    if (error) {
      console.error('Error saving budget optimization:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception saving budget optimization:', err);
    return null;
  }
}

/**
 * Recupera un'ottimizzazione per ID
 */
export async function getBudgetOptimization(optimizationId: string): Promise<BudgetOptimizationResult | null> {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select('result')
      .eq('optimization_id', optimizationId)
      .single();

    if (error) {
      console.error('Error fetching budget optimization:', error);
      return null;
    }

    return data?.result as BudgetOptimizationResult | null;
  } catch (err) {
    console.error('Exception fetching budget optimization:', err);
    return null;
  }
}

/**
 * Recupera l'ultima ottimizzazione per tenant
 */
export async function getLatestBudgetOptimization(tenantId: string): Promise<BudgetOptimizationResult | null> {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching latest budget optimization:', error);
      return null;
    }

    return data?.result as BudgetOptimizationResult | null;
  } catch (err) {
    console.error('Exception fetching latest budget optimization:', err);
    return null;
  }
}

/**
 * Recupera tutte le ottimizzazioni per un tenant
 */
export async function getBudgetOptimizationsByTenant(tenantId: string, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select(`
        optimization_id, 
        roadmap_id,
        version, 
        total_available_budget,
        total_requested_budget,
        budget_gap,
        recommended_scenario,
        confidence_level, 
        data_quality_score,
        created_at
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching budget optimizations:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching budget optimizations:', err);
    return [];
  }
}

/**
 * Elimina un'ottimizzazione budget
 */
export async function deleteBudgetOptimization(optimizationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('budget_optimizations')
      .delete()
      .eq('optimization_id', optimizationId);

    if (error) {
      console.error('Error deleting budget optimization:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception deleting budget optimization:', err);
    return false;
  }
}

/**
 * Recupera uno scenario specifico da un'ottimizzazione
 */
export async function getScenarioFromOptimization(
  optimizationId: string, 
  scenarioType: 'conservative' | 'balanced' | 'aggressive'
): Promise<BudgetScenario | null> {
  try {
    const optimization = await getBudgetOptimization(optimizationId);
    if (!optimization) return null;

    return optimization.scenarios.find(s => s.scenarioType === scenarioType) || null;
  } catch (err) {
    console.error('Exception fetching scenario:', err);
    return null;
  }
}

/**
 * Aggiorna lo scenario raccomandato
 */
export async function updateRecommendedScenario(
  optimizationId: string,
  newRecommendedScenarioId: string,
  reason: string
): Promise<boolean> {
  try {
    const optimization = await getBudgetOptimization(optimizationId);
    if (!optimization) return false;

    // Aggiorna i flag isRecommended negli scenari
    const updatedScenarios = optimization.scenarios.map(s => ({
      ...s,
      isRecommended: s.scenarioId === newRecommendedScenarioId,
      recommendationReason: s.scenarioId === newRecommendedScenarioId ? reason : undefined,
    }));

    const { error } = await supabase
      .from('budget_optimizations')
      .update({
        recommended_scenario: newRecommendedScenarioId,
        scenarios: updatedScenarios,
        result: {
          ...optimization,
          recommendedScenario: newRecommendedScenarioId,
          scenarios: updatedScenarios,
        },
      })
      .eq('optimization_id', optimizationId);

    if (error) {
      console.error('Error updating recommended scenario:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception updating recommended scenario:', err);
    return false;
  }
}

/**
 * Statistiche aggregate delle ottimizzazioni per tenant
 */
export async function getBudgetOptimizationStats(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('budget_optimizations')
      .select(`
        total_available_budget,
        total_requested_budget,
        budget_gap,
        confidence_level,
        data_quality_score,
        financial_kpis,
        created_at
      `)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error fetching budget optimization stats:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        totalOptimizations: 0,
        avgAvailableBudget: 0,
        avgRequestedBudget: 0,
        avgBudgetGap: 0,
        avgDataQuality: 0,
        avgROI: 0,
        confidenceDistribution: { high: 0, medium: 0, low: 0 },
      };
    }

    const stats = data.reduce((acc, opt) => {
      acc.totalOptimizations++;
      acc.totalAvailableBudget += opt.total_available_budget || 0;
      acc.totalRequestedBudget += opt.total_requested_budget || 0;
      acc.totalBudgetGap += opt.budget_gap || 0;
      acc.totalDataQuality += opt.data_quality_score || 0;
      acc.totalROI += (opt.financial_kpis as Record<string, unknown>)?.totalROI as number || 0;
      
      const confidence = opt.confidence_level as 'high' | 'medium' | 'low';
      if (confidence && acc.confidenceDistribution[confidence] !== undefined) {
        acc.confidenceDistribution[confidence]++;
      }
      
      return acc;
    }, {
      totalOptimizations: 0,
      totalAvailableBudget: 0,
      totalRequestedBudget: 0,
      totalBudgetGap: 0,
      totalDataQuality: 0,
      totalROI: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
    });

    const count = stats.totalOptimizations;
    return {
      totalOptimizations: count,
      avgAvailableBudget: count > 0 ? Math.round(stats.totalAvailableBudget / count) : 0,
      avgRequestedBudget: count > 0 ? Math.round(stats.totalRequestedBudget / count) : 0,
      avgBudgetGap: count > 0 ? Math.round(stats.totalBudgetGap / count) : 0,
      avgDataQuality: count > 0 ? Math.round(stats.totalDataQuality / count) : 0,
      avgROI: count > 0 ? Math.round(stats.totalROI / count) : 0,
      confidenceDistribution: stats.confidenceDistribution,
    };
  } catch (err) {
    console.error('Exception fetching budget optimization stats:', err);
    return null;
  }
}

/**
 * Compara due ottimizzazioni
 */
export async function compareBudgetOptimizations(
  optimizationId1: string,
  optimizationId2: string
) {
  try {
    const [opt1, opt2] = await Promise.all([
      getBudgetOptimization(optimizationId1),
      getBudgetOptimization(optimizationId2),
    ]);

    if (!opt1 || !opt2) {
      return null;
    }

    return {
      optimization1: {
        id: optimizationId1,
        createdAt: opt1.createdAt,
        totalBudget: opt1.inputSummary.totalAvailableBudget,
        recommendedScenario: opt1.scenarios.find(s => s.scenarioId === opt1.recommendedScenario),
        roi: opt1.financialKPIs.totalROI,
        paybackMonths: opt1.financialKPIs.paybackPeriodMonths,
      },
      optimization2: {
        id: optimizationId2,
        createdAt: opt2.createdAt,
        totalBudget: opt2.inputSummary.totalAvailableBudget,
        recommendedScenario: opt2.scenarios.find(s => s.scenarioId === opt2.recommendedScenario),
        roi: opt2.financialKPIs.totalROI,
        paybackMonths: opt2.financialKPIs.paybackPeriodMonths,
      },
      differences: {
        budgetChange: opt2.inputSummary.totalAvailableBudget - opt1.inputSummary.totalAvailableBudget,
        roiChange: opt2.financialKPIs.totalROI - opt1.financialKPIs.totalROI,
        paybackChange: opt2.financialKPIs.paybackPeriodMonths - opt1.financialKPIs.paybackPeriodMonths,
      },
    };
  } catch (err) {
    console.error('Exception comparing optimizations:', err);
    return null;
  }
}
