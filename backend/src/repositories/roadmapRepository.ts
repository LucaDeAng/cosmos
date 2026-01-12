import { supabase } from '../config/supabase';
import type { RoadmapResult } from '../agents/schemas/roadmapSchema';

/**
 * Salva o aggiorna una roadmap
 */
export async function saveRoadmap(roadmap: RoadmapResult) {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .upsert({
        roadmap_id: roadmap.roadmapId,
        tenant_id: roadmap.tenantId,
        company_id: roadmap.companyId,
        roadmap_name: roadmap.roadmapName,
        version: roadmap.version,
        horizon_months: roadmap.horizonMonths,
        executive_summary: roadmap.executiveSummary,
        vision: roadmap.vision,
        current_state: roadmap.currentState,
        phases: roadmap.phases,
        strategic_priorities: roadmap.strategicPriorities,
        quick_wins: roadmap.quickWins,
        total_budget: roadmap.totalBudget,
        resource_plan: roadmap.resourcePlan,
        governance: roadmap.governance,
        success_metrics: roadmap.successMetrics,
        overall_risks: roadmap.overallRisks,
        external_dependencies: roadmap.externalDependencies,
        recommendations: roadmap.recommendations,
        confidence_level: roadmap.confidenceLevel,
        assumptions: roadmap.assumptions,
        notes: roadmap.notes,
        result: roadmap,
        created_at: roadmap.createdAt,
      }, { onConflict: 'roadmap_id' })
      .select();

    if (error) {
      console.error('Error saving roadmap:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception saving roadmap:', err);
    return null;
  }
}

/**
 * Recupera una roadmap per ID
 */
export async function getRoadmap(roadmapId: string): Promise<RoadmapResult | null> {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('result')
      .eq('roadmap_id', roadmapId)
      .single();

    if (error) {
      console.error('Error fetching roadmap:', error);
      return null;
    }

    return data?.result as RoadmapResult | null;
  } catch (err) {
    console.error('Exception fetching roadmap:', err);
    return null;
  }
}

/**
 * Recupera l'ultima roadmap per tenant
 */
export async function getLatestRoadmap(tenantId: string): Promise<RoadmapResult | null> {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('result')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching latest roadmap:', error);
      return null;
    }

    return data?.result as RoadmapResult | null;
  } catch (err) {
    console.error('Exception fetching latest roadmap:', err);
    return null;
  }
}

/**
 * Recupera tutte le roadmap per un tenant
 */
export async function getRoadmapsByTenant(tenantId: string, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('roadmap_id, roadmap_name, version, horizon_months, confidence_level, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching roadmaps:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching roadmaps:', err);
    return [];
  }
}

/**
 * Elimina una roadmap
 */
export async function deleteRoadmap(roadmapId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('roadmaps')
      .delete()
      .eq('roadmap_id', roadmapId);

    if (error) {
      console.error('Error deleting roadmap:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Exception deleting roadmap:', err);
    return false;
  }
}

/**
 * Aggiorna la versione di una roadmap
 */
export async function updateRoadmapVersion(
  roadmapId: string, 
  updates: Partial<RoadmapResult>
): Promise<boolean> {
  try {
    const currentRoadmap = await getRoadmap(roadmapId);
    if (!currentRoadmap) {
      console.error('Roadmap not found:', roadmapId);
      return false;
    }

    // Incrementa la versione
    const currentVersion = parseFloat(currentRoadmap.version || '1.0');
    const newVersion = (currentVersion + 0.1).toFixed(1);

    const updatedRoadmap: RoadmapResult = {
      ...currentRoadmap,
      ...updates,
      version: newVersion,
    };

    const result = await saveRoadmap(updatedRoadmap);
    return !!result;
  } catch (err) {
    console.error('Exception updating roadmap:', err);
    return false;
  }
}

/**
 * Statistiche aggregate delle roadmap per tenant
 */
export async function getRoadmapStats(tenantId: string) {
  try {
    const { data, error } = await supabase
      .from('roadmaps')
      .select('horizon_months, confidence_level, total_budget, phases, created_at')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error fetching roadmap stats:', error);
      return null;
    }

    if (!data || data.length === 0) {
      return {
        totalRoadmaps: 0,
        avgHorizonMonths: 0,
        totalPhasesCount: 0,
        avgBudget: 0,
        confidenceDistribution: { high: 0, medium: 0, low: 0 },
      };
    }

    const stats = data.reduce((acc, roadmap) => {
      acc.totalRoadmaps++;
      acc.totalHorizonMonths += roadmap.horizon_months || 0;
      acc.totalPhases += Array.isArray(roadmap.phases) ? roadmap.phases.length : 0;
      acc.totalBudget += roadmap.total_budget?.estimated || 0;
      
      const confidence = roadmap.confidence_level as 'high' | 'medium' | 'low';
      if (confidence && acc.confidenceDistribution[confidence] !== undefined) {
        acc.confidenceDistribution[confidence]++;
      }
      
      return acc;
    }, {
      totalRoadmaps: 0,
      totalHorizonMonths: 0,
      totalPhases: 0,
      totalBudget: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
    });

    return {
      totalRoadmaps: stats.totalRoadmaps,
      avgHorizonMonths: stats.totalRoadmaps > 0 
        ? Math.round(stats.totalHorizonMonths / stats.totalRoadmaps) 
        : 0,
      totalPhasesCount: stats.totalPhases,
      avgBudget: stats.totalRoadmaps > 0 
        ? Math.round(stats.totalBudget / stats.totalRoadmaps) 
        : 0,
      confidenceDistribution: stats.confidenceDistribution,
    };
  } catch (err) {
    console.error('Exception fetching roadmap stats:', err);
    return null;
  }
}
