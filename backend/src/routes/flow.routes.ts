/**
 * Flow Status Routes
 * API endpoints for tracking THEMIS workflow progress
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

interface StepStatus {
  step: number;
  key: string;
  name: string;
  completed: boolean;
  available: boolean;
  data?: {
    id?: string;
    createdAt?: string;
    summary?: string;
  };
}

interface FlowStatusResponse {
  success: boolean;
  companyId?: string;
  companyName?: string;
  steps: StepStatus[];
  currentStep: number;
  completedSteps: number;
  totalSteps: number;
  progressPercentage: number;
  error?: string;
}

/**
 * GET /api/flow/status/:companyId
 * Get the current workflow status for a company
 */
router.get('/status/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Company ID is required'
      });
    }

    // Initialize steps
    const steps: StepStatus[] = [
      { step: 1, key: 'assessment', name: 'Assessment IT', completed: false, available: true },
      { step: 2, key: 'portfolio', name: 'Portfolio', completed: false, available: false },
      { step: 3, key: 'portfolio-assessment', name: 'Assessment Portfolio', completed: false, available: false },
      { step: 4, key: 'roadmap', name: 'Roadmap', completed: false, available: false },
      { step: 5, key: 'budget', name: 'Budget', completed: false, available: false },
      { step: 6, key: 'strategy', name: 'Strategy', completed: false, available: false }
    ];

    // Fetch company info
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', companyId)
      .single();

    if (companyError) {
      console.error('Company fetch error:', companyError);
    }

    // Step 1: Check Assessment (company_assessment_snapshots)
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('company_assessment_snapshots')
      .select('id, created_at, assessment_data')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!assessmentError && assessmentData) {
      steps[0].completed = true;
      steps[0].data = {
        id: assessmentData.id,
        createdAt: assessmentData.created_at,
        summary: 'Assessment completato'
      };
      steps[1].available = true; // Unlock Portfolio
    }

    // Step 2: Check Portfolio (portfolio_assessments with items)
    const { data: portfolioData, error: portfolioError } = await supabase
      .from('portfolio_assessments')
      .select('id, assessment_id, created_at, assessed_items, result')
      .eq('tenant_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Step 2: Check Portfolio items (products + services)
    // Step 2 can only be completed if Step 1 is completed
    const { count: productsCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    const { count: servicesCount } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);

    const totalItems = (productsCount || 0) + (servicesCount || 0);

    if (totalItems > 0 && steps[0].completed) {
      steps[1].completed = true;
      steps[1].data = {
        summary: `${totalItems} elementi nel portfolio (${productsCount || 0} prodotti, ${servicesCount || 0} servizi)`
      };
      steps[2].available = true; // Unlock Portfolio Assessment
    }

    // Step 3: Check Portfolio Assessment
    // Step 3 can only be completed if Step 1 AND Step 2 are completed
    if (portfolioData && portfolioData.result && steps[0].completed && steps[1].completed) {
      const result = portfolioData.result as Record<string, unknown>;
      if (result.itemAssessments && Array.isArray(result.itemAssessments) && result.itemAssessments.length > 0) {
        steps[2].completed = true;
        steps[2].data = {
          id: portfolioData.assessment_id,
          createdAt: portfolioData.created_at,
          summary: `${result.itemAssessments.length} elementi analizzati`
        };
        steps[3].available = true; // Unlock Roadmap
      }
    }

    // Step 4: Check Roadmap
    // Step 4 can only be completed if Steps 1-3 are completed
    const { data: roadmapData, error: roadmapError } = await supabase
      .from('roadmaps')
      .select('id, roadmap_id, created_at, total_phases, total_initiatives')
      .eq('tenant_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!roadmapError && roadmapData && steps[2].completed) {
      steps[3].completed = true;
      steps[3].data = {
        id: roadmapData.roadmap_id,
        createdAt: roadmapData.created_at,
        summary: `${roadmapData.total_phases || 0} fasi, ${roadmapData.total_initiatives || 0} iniziative`
      };
      steps[4].available = true; // Unlock Budget
    }

    // Step 5: Check Budget Optimization
    // Step 5 can only be completed if Steps 1-4 are completed
    const { data: budgetData, error: budgetError } = await supabase
      .from('budget_optimizations')
      .select('id, optimization_id, created_at, total_budget, recommended_scenario')
      .eq('tenant_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!budgetError && budgetData && steps[3].completed) {
      steps[4].completed = true;
      steps[4].data = {
        id: budgetData.optimization_id,
        createdAt: budgetData.created_at,
        summary: `Budget: €${Number(budgetData.total_budget || 0).toLocaleString('it-IT')}`
      };
      steps[5].available = true; // Unlock Strategy
    }

    // Step 6: Check Strategy Analysis
    // Step 6 can only be completed if Steps 1-5 are completed
    const { data: strategyData, error: strategyError } = await supabase
      .from('strategy_analyses')
      .select('id, strategy_id, created_at, total_initiatives, must_have_count, quick_wins_count')
      .eq('tenant_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!strategyError && strategyData && steps[4].completed) {
      steps[5].completed = true;
      steps[5].data = {
        id: strategyData.strategy_id,
        createdAt: strategyData.created_at,
        summary: `${strategyData.total_initiatives || 0} iniziative prioritizzate`
      };
    }

    // Calculate progress
    const completedSteps = steps.filter(s => s.completed).length;
    const currentStep = steps.findIndex(s => !s.completed) + 1 || 6;

    const response: FlowStatusResponse = {
      success: true,
      companyId,
      companyName: company?.name,
      steps,
      currentStep,
      completedSteps,
      totalSteps: 6,
      progressPercentage: Math.round((completedSteps / 6) * 100)
    };

    return res.json(response);
  } catch (error) {
    console.error('Flow status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching flow status'
    });
  }
});

/**
 * GET /api/flow/status
 * Get flow status for all companies (admin view)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get all companies with their latest status
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // For each company, get a simplified status
    const companiesWithStatus = await Promise.all(
      (companies || []).map(async (company) => {
        // Count completed steps
        let completedSteps = 0;

        // Check assessment
        const { count: assessmentCount } = await supabase
          .from('company_assessment_snapshots')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id);
        if (assessmentCount && assessmentCount > 0) completedSteps++;

        // Check portfolio items
        const { count: initiativesCount } = await supabase
          .from('initiatives')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id);
        if (initiativesCount && initiativesCount > 0) completedSteps++;

        // Check portfolio assessment
        const { data: portfolio } = await supabase
          .from('portfolio_assessments')
          .select('result')
          .eq('tenant_id', company.id)
          .single();
        if (portfolio?.result) {
          const result = portfolio.result as Record<string, unknown>;
          if (result.itemAssessments && Array.isArray(result.itemAssessments) && result.itemAssessments.length > 0) {
            completedSteps++;
          }
        }

        // Check roadmap
        const { count: roadmapCount } = await supabase
          .from('roadmaps')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', company.id);
        if (roadmapCount && roadmapCount > 0) completedSteps++;

        // Check budget
        const { count: budgetCount } = await supabase
          .from('budget_optimizations')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', company.id);
        if (budgetCount && budgetCount > 0) completedSteps++;

        // Check strategy
        const { count: strategyCount } = await supabase
          .from('strategy_analyses')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', company.id);
        if (strategyCount && strategyCount > 0) completedSteps++;

        return {
          id: company.id,
          name: company.name,
          createdAt: company.created_at,
          completedSteps,
          totalSteps: 6,
          progressPercentage: Math.round((completedSteps / 6) * 100)
        };
      })
    );

    return res.json({
      success: true,
      companies: companiesWithStatus,
      total: companiesWithStatus.length
    });
  } catch (error) {
    console.error('Flow status list error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error fetching flow status list'
    });
  }
});

/**
 * GET /api/flow/next-step/:companyId
 * Get the next available step for a company
 */
router.get('/next-step/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;

    // Use the main status endpoint logic
    const statusResponse = await fetch(`${req.protocol}://${req.get('host')}/api/flow/status/${companyId}`);
    const status = await statusResponse.json() as FlowStatusResponse;

    if (!status.success) {
      return res.status(400).json(status);
    }

    // Find next incomplete step that is available
    const nextStep = status.steps.find(s => !s.completed && s.available);

    if (!nextStep) {
      // All steps completed
      return res.json({
        success: true,
        allCompleted: true,
        message: 'Tutti gli step sono stati completati!',
        currentStep: 6
      });
    }

    // Build URL for the next step
    const stepUrls: Record<string, string> = {
      'assessment': '/assessment',
      'portfolio': '/portfolio',
      'portfolio-assessment': '/portfolio/assessment',
      'roadmap': '/roadmap',
      'budget': '/budget',
      'strategy': '/strategy'
    };

    return res.json({
      success: true,
      allCompleted: false,
      nextStep: {
        step: nextStep.step,
        key: nextStep.key,
        name: nextStep.name,
        url: stepUrls[nextStep.key] || `/${nextStep.key}`
      },
      currentProgress: status.progressPercentage
    });
  } catch (error) {
    console.error('Next step error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error determining next step'
    });
  }
});

export default router;
