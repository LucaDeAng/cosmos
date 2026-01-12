import { z } from 'zod';

// Schema per un'allocazione budget singola
export const BudgetAllocationSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  itemType: z.enum(['product', 'service']),
  
  // Budget allocation
  allocatedBudget: z.number().min(0),
  originalBudget: z.number().min(0).optional(),
  budgetChange: z.number().optional(), // Positivo = aumento, Negativo = riduzione
  budgetChangePercentage: z.number().optional(),
  
  // Priorità e scoring
  priority: z.number().min(1).max(10),
  strategicScore: z.number().min(0).max(100),
  roiScore: z.number().min(0).max(100),
  riskAdjustedScore: z.number().min(0).max(100),
  
  // Timing
  phase: z.string(), // Fase roadmap di riferimento
  quarter: z.string(), // e.g., "Q1 2025"
  
  // Reasoning
  allocationRationale: z.string(),
  constraints: z.array(z.string()).optional(),
  
  // Flags
  isMandatory: z.boolean().default(false),
  isQuickWin: z.boolean().default(false),
  needsReview: z.boolean().default(false),
});

export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

// Schema per uno scenario budget
export const BudgetScenarioSchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  scenarioType: z.enum(['conservative', 'balanced', 'aggressive', 'custom']),
  description: z.string(),
  
  // Total budget info
  totalBudget: z.number().min(0),
  allocatedBudget: z.number().min(0),
  remainingBudget: z.number(),
  utilizationPercentage: z.number().min(0).max(100),
  
  // Allocazioni per questo scenario
  allocations: z.array(BudgetAllocationSchema),
  
  // Summary per categoria
  categoryBreakdown: z.array(z.object({
    category: z.string(),
    amount: z.number(),
    percentage: z.number(),
    itemCount: z.number(),
  })),
  
  // Summary per fase
  phaseBreakdown: z.array(z.object({
    phase: z.string(),
    amount: z.number(),
    percentage: z.number(),
    itemCount: z.number(),
  })),
  
  // Summary per priorità
  priorityBreakdown: z.array(z.object({
    priorityLevel: z.string(), // "High", "Medium", "Low"
    amount: z.number(),
    percentage: z.number(),
    itemCount: z.number(),
  })),
  
  // KPI scenario
  expectedOutcomes: z.object({
    totalROI: z.number(), // Percentuale ROI atteso
    paybackMonths: z.number(), // Tempo di ritorno investimento
    riskLevel: z.enum(['low', 'medium', 'high']),
    strategicAlignmentScore: z.number().min(0).max(100),
    portfolioBalanceScore: z.number().min(0).max(100),
  }),
  
  // Trade-offs
  tradeOffs: z.array(z.object({
    description: z.string(),
    impact: z.enum(['positive', 'negative', 'neutral']),
    affectedItems: z.array(z.string()),
  })),
  
  // Rischi scenario
  scenarioRisks: z.array(z.object({
    risk: z.string(),
    likelihood: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
  })),
  
  // Raccomandazione
  isRecommended: z.boolean().default(false),
  recommendationReason: z.string().optional(),
});

export type BudgetScenario = z.infer<typeof BudgetScenarioSchema>;

// Schema per le raccomandazioni di ottimizzazione
export const OptimizationRecommendationSchema = z.object({
  id: z.string(),
  type: z.enum([
    'reallocation',      // Suggerisce riallocazione tra items
    'deferral',          // Suggerisce posticipo
    'acceleration',      // Suggerisce anticipazione
    'consolidation',     // Suggerisce fusione iniziative
    'elimination',       // Suggerisce eliminazione
    'phasing',           // Suggerisce suddivisione in fasi
    'outsourcing',       // Suggerisce esternalizzazione
    'cost_reduction',    // Suggerisce riduzione costi
  ]),
  title: z.string(),
  description: z.string(),
  
  // Impatto
  savingsAmount: z.number().optional(),
  roiImprovement: z.number().optional(), // Percentuale
  riskReduction: z.string().optional(),
  
  // Items coinvolti
  affectedItems: z.array(z.object({
    itemId: z.string(),
    itemName: z.string(),
    currentBudget: z.number(),
    proposedBudget: z.number(),
    change: z.number(),
  })),
  
  // Implementation
  implementationSteps: z.array(z.string()),
  effort: z.enum(['low', 'medium', 'high']),
  timeframe: z.string(), // e.g., "2-4 settimane"
  
  // Priority
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type OptimizationRecommendation = z.infer<typeof OptimizationRecommendationSchema>;

// Schema per il What-If Analysis
export const WhatIfAnalysisSchema = z.object({
  analysisId: z.string(),
  analysisType: z.enum([
    'budget_increase',
    'budget_decrease',
    'priority_change',
    'timeline_change',
    'resource_constraint',
    'risk_scenario',
  ]),
  description: z.string(),
  
  // Parametri dell'analisi
  parameters: z.object({
    budgetChange: z.number().optional(), // Percentuale o valore assoluto
    affectedPhases: z.array(z.string()).optional(),
    affectedCategories: z.array(z.string()).optional(),
    timelineShift: z.number().optional(), // Mesi
  }),
  
  // Risultati
  impact: z.object({
    budgetImpact: z.number(),
    roiImpact: z.number(),
    timelineImpact: z.number(), // Mesi
    riskImpact: z.enum(['increase', 'decrease', 'neutral']),
    strategicImpact: z.string(),
  }),
  
  // Items affected
  itemsAffected: z.array(z.object({
    itemId: z.string(),
    itemName: z.string(),
    originalValue: z.number(),
    newValue: z.number(),
    changeDescription: z.string(),
  })),
  
  // Conclusioni
  conclusion: z.string(),
  recommendation: z.string(),
});

export type WhatIfAnalysis = z.infer<typeof WhatIfAnalysisSchema>;

// Schema completo per Budget Optimization Result
export const BudgetOptimizationResultSchema = z.object({
  optimizationId: z.string(),
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  roadmapId: z.string().optional(), // Roadmap di riferimento
  createdAt: z.string().datetime(),
  version: z.string().default('1.0'),
  
  // Input summary
  inputSummary: z.object({
    totalAvailableBudget: z.number(),
    totalRequestedBudget: z.number(),
    budgetGap: z.number(), // Differenza (positivo = surplus, negativo = deficit)
    portfolioItemCount: z.number(),
    horizonMonths: z.number(),
  }),
  
  // Executive Summary
  executiveSummary: z.string(),
  
  // Current state analysis
  currentStateAnalysis: z.object({
    budgetDistribution: z.array(z.object({
      category: z.string(),
      currentAmount: z.number(),
      percentage: z.number(),
      isOptimal: z.boolean(),
    })),
    inefficiencies: z.array(z.string()),
    opportunities: z.array(z.string()),
    criticalConstraints: z.array(z.string()),
  }),
  
  // Scenari generati
  scenarios: z.array(BudgetScenarioSchema),
  
  // Scenario raccomandato
  recommendedScenario: z.string(), // scenarioId
  
  // Raccomandazioni di ottimizzazione
  optimizationRecommendations: z.array(OptimizationRecommendationSchema),
  
  // What-If analyses
  whatIfAnalyses: z.array(WhatIfAnalysisSchema).optional(),
  
  // Savings opportunities
  savingsOpportunities: z.array(z.object({
    area: z.string(),
    potentialSavings: z.number(),
    effort: z.enum(['low', 'medium', 'high']),
    risk: z.enum(['low', 'medium', 'high']),
    description: z.string(),
  })),
  
  // Investment priorities
  investmentPriorities: z.array(z.object({
    rank: z.number(),
    itemId: z.string(),
    itemName: z.string(),
    category: z.string(),
    recommendedBudget: z.number(),
    rationale: z.string(),
    expectedROI: z.number(),
    strategicImportance: z.enum(['critical', 'high', 'medium', 'low']),
  })),
  
  // Timeline budget allocation
  quarterlyBudgetPlan: z.array(z.object({
    quarter: z.string(),
    year: z.number(),
    plannedSpend: z.number(),
    cumulativeSpend: z.number(),
    keyMilestones: z.array(z.string()),
  })),
  
  // Risk assessment
  financialRisks: z.array(z.object({
    risk: z.string(),
    financialImpact: z.number(),
    likelihood: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
    contingencyBudget: z.number().optional(),
  })),
  
  // KPIs finanziari
  financialKPIs: z.object({
    totalROI: z.number(),
    paybackPeriodMonths: z.number(),
    npv: z.number().optional(), // Net Present Value
    irr: z.number().optional(), // Internal Rate of Return
    costPerMaturityPoint: z.number().optional(),
  }),
  
  // Confidence e metadata
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  dataQualityScore: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export type BudgetOptimizationResult = z.infer<typeof BudgetOptimizationResultSchema>;

// Schema per l'input dell'agente
export const BudgetOptimizerInputSchema = z.object({
  tenantId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  roadmapId: z.string().optional(),
  
  // Budget disponibile
  totalBudget: z.number().min(0),
  
  // Vincoli
  constraints: z.object({
    mandatoryItems: z.array(z.string()).optional(), // IDs items obbligatori
    excludedItems: z.array(z.string()).optional(),  // IDs items da escludere
    maxPerCategory: z.record(z.string(), z.number()).optional(), // Limiti per categoria
    minPerCategory: z.record(z.string(), z.number()).optional(),
    quarterlyLimits: z.array(z.object({
      quarter: z.string(),
      maxBudget: z.number(),
    })).optional(),
  }).optional(),
  
  // Priorità
  priorityWeights: z.object({
    strategicAlignment: z.number().min(0).max(1).default(0.3),
    roi: z.number().min(0).max(1).default(0.25),
    riskMitigation: z.number().min(0).max(1).default(0.2),
    quickWins: z.number().min(0).max(1).default(0.15),
    resourceEfficiency: z.number().min(0).max(1).default(0.1),
  }).optional(),
  
  // Opzioni analisi
  options: z.object({
    generateScenarios: z.boolean().default(true),
    scenarioTypes: z.array(z.enum(['conservative', 'balanced', 'aggressive'])).default(['conservative', 'balanced', 'aggressive']),
    includeWhatIfAnalysis: z.boolean().default(true),
    detailLevel: z.enum(['executive', 'tactical', 'detailed']).default('tactical'),
  }).optional(),
  
  // Obiettivi specifici
  optimizationGoals: z.array(z.enum([
    'maximize_roi',
    'minimize_risk',
    'maximize_coverage',
    'balance_portfolio',
    'accelerate_maturity',
    'reduce_costs',
  ])).optional(),
  
  // Richiesta utente
  userRequest: z.string().optional(),
});

export type BudgetOptimizerInput = z.infer<typeof BudgetOptimizerInputSchema>;

export default BudgetOptimizationResultSchema;
