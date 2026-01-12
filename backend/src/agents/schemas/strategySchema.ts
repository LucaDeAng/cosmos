import { z } from 'zod';

// ============================================
// STRATEGY ADVISOR SCHEMA - Step 6
// Prioritizzazione iniziative e strategie
// ============================================

// Scoring multi-criterio per prioritizzazione
export const PrioritizationScoreSchema = z.object({
  // MoSCoW Priority
  moscow: z.enum(['must_have', 'should_have', 'could_have', 'wont_have']),
  moscowRationale: z.string(),
  
  // WSJF (Weighted Shortest Job First)
  wsjf: z.object({
    businessValue: z.number().min(1).max(10),
    timeCriticality: z.number().min(1).max(10),
    riskReduction: z.number().min(1).max(10),
    jobSize: z.number().min(1).max(10),
    score: z.number(), // (BV + TC + RR) / JS
  }),
  
  // ICE Score (Impact, Confidence, Ease)
  ice: z.object({
    impact: z.number().min(1).max(10),
    confidence: z.number().min(1).max(10),
    ease: z.number().min(1).max(10),
    score: z.number(), // I * C * E
  }),
  
  // Score composito finale
  compositeScore: z.number().min(0).max(100),
  priorityRank: z.number().min(1),
});

// Strategia di implementazione per iniziativa
export const ImplementationStrategySchema = z.object({
  // Approccio Make/Buy/Partner
  approach: z.enum(['make', 'buy', 'partner', 'hybrid']),
  approachRationale: z.string(),
  
  // Delivery Model
  deliveryModel: z.enum(['in_house', 'outsource', 'co_source', 'managed_service']),
  deliveryRationale: z.string(),
  
  // Strategia di Rollout
  rolloutStrategy: z.enum(['big_bang', 'phased', 'pilot_then_scale', 'parallel_run']),
  rolloutPhases: z.array(z.object({
    phase: z.number(),
    name: z.string(),
    scope: z.string(),
    duration: z.string(),
    successCriteria: z.array(z.string()),
  })),
  
  // Change Management
  changeManagement: z.object({
    impactLevel: z.enum(['low', 'medium', 'high', 'transformational']),
    stakeholderGroups: z.array(z.string()),
    trainingRequired: z.boolean(),
    communicationPlan: z.string(),
  }),
  
  // Rischi e mitigazioni specifiche
  keyRisks: z.array(z.object({
    risk: z.string(),
    probability: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation: z.string(),
  })),
});

// Dipendenze tra iniziative
export const InitiativeDependencySchema = z.object({
  initiativeId: z.string(),
  initiativeName: z.string(),
  dependencyType: z.enum(['blocks', 'blocked_by', 'enables', 'enabled_by', 'synergy']),
  relatedInitiativeId: z.string(),
  relatedInitiativeName: z.string(),
  dependencyStrength: z.enum(['hard', 'soft']), // hard = bloccante, soft = consigliata
  description: z.string(),
});

// Iniziativa prioritizzata con strategia
export const PrioritizedInitiativeSchema = z.object({
  // Identificazione
  itemId: z.string(),
  itemName: z.string(),
  itemType: z.enum(['product', 'service']),
  category: z.string().optional(),
  
  // Da Portfolio Assessment (Step 3)
  portfolioScore: z.number().optional(),
  portfolioRecommendation: z.enum(['keep', 'accelerate', 'pause', 'stop']).optional(),
  
  // Prioritizzazione multi-criterio
  prioritization: PrioritizationScoreSchema,
  
  // Strategia di implementazione
  strategy: ImplementationStrategySchema,
  
  // Budget e Timeline
  estimatedBudget: z.number(),
  estimatedDuration: z.string(),
  expectedROI: z.number().optional(),
  
  // Executive Summary
  executiveSummary: z.string(),
  keyBenefits: z.array(z.string()),
  criticalSuccessFactors: z.array(z.string()),
});

// Cluster strategico (gruppo di iniziative correlate)
export const StrategicClusterSchema = z.object({
  clusterId: z.string(),
  clusterName: z.string(),
  clusterTheme: z.string(), // es. "Digital Transformation", "Cost Optimization"
  initiatives: z.array(z.string()), // IDs delle iniziative
  totalBudget: z.number(),
  expectedSynergies: z.string(),
  recommendedSequence: z.array(z.object({
    order: z.number(),
    initiativeId: z.string(),
    initiativeName: z.string(),
    rationale: z.string(),
  })),
});

// Decision Matrix per C-Level
export const DecisionMatrixSchema = z.object({
  // Quadranti Value vs Effort
  quickWins: z.array(z.object({
    initiativeId: z.string(),
    name: z.string(),
    value: z.number(),
    effort: z.number(),
    recommendation: z.string(),
  })),
  majorProjects: z.array(z.object({
    initiativeId: z.string(),
    name: z.string(),
    value: z.number(),
    effort: z.number(),
    recommendation: z.string(),
  })),
  fillIns: z.array(z.object({
    initiativeId: z.string(),
    name: z.string(),
    value: z.number(),
    effort: z.number(),
    recommendation: z.string(),
  })),
  thankless: z.array(z.object({
    initiativeId: z.string(),
    name: z.string(),
    value: z.number(),
    effort: z.number(),
    recommendation: z.string(),
  })),
});

// Raccomandazioni strategiche per il management
export const StrategicRecommendationSchema = z.object({
  recommendationId: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum([
    'immediate_action',
    'strategic_investment',
    'optimization',
    'decommission',
    'defer',
    'partnership'
  ]),
  title: z.string(),
  description: z.string(),
  affectedInitiatives: z.array(z.string()),
  expectedOutcome: z.string(),
  timeline: z.string(),
  estimatedImpact: z.object({
    costSavings: z.number().optional(),
    revenueImpact: z.number().optional(),
    efficiencyGain: z.string().optional(),
    riskReduction: z.string().optional(),
  }),
  nextSteps: z.array(z.string()),
});

// KPI strategici
export const StrategicKPISchema = z.object({
  portfolioHealth: z.object({
    score: z.number().min(0).max(100),
    trend: z.enum(['improving', 'stable', 'declining']),
    assessment: z.string(),
  }),
  alignmentScore: z.object({
    businessAlignment: z.number().min(0).max(100),
    technologyAlignment: z.number().min(0).max(100),
    resourceAlignment: z.number().min(0).max(100),
    overall: z.number().min(0).max(100),
  }),
  executionReadiness: z.object({
    score: z.number().min(0).max(100),
    blockers: z.array(z.string()),
    enablers: z.array(z.string()),
  }),
  investmentEfficiency: z.object({
    totalInvestment: z.number(),
    expectedReturn: z.number(),
    roi: z.number(),
    paybackPeriod: z.string(),
  }),
});

// Risultato completo Strategy Advisor
export const StrategyAdvisorResultSchema = z.object({
  // Metadata
  strategyId: z.string(),
  tenantId: z.string(),
  companyId: z.string(),
  generatedAt: z.string(),
  
  // Input references
  portfolioAssessmentId: z.string().optional(),
  roadmapId: z.string().optional(),
  budgetOptimizationId: z.string().optional(),
  
  // Executive Summary
  executiveSummary: z.object({
    overallAssessment: z.string(),
    keyFindings: z.array(z.string()),
    topPriorities: z.array(z.string()),
    criticalDecisions: z.array(z.string()),
    timeHorizon: z.string(),
  }),
  
  // Iniziative prioritizzate
  prioritizedInitiatives: z.array(PrioritizedInitiativeSchema),
  
  // Mappa dipendenze
  dependencyMap: z.array(InitiativeDependencySchema),
  
  // Cluster strategici
  strategicClusters: z.array(StrategicClusterSchema),
  
  // Decision Matrix
  decisionMatrix: DecisionMatrixSchema,
  
  // Raccomandazioni strategiche
  recommendations: z.array(StrategicRecommendationSchema),
  
  // KPI strategici
  strategicKPIs: StrategicKPISchema,
  
  // Piano d'azione executive
  executiveActionPlan: z.array(z.object({
    quarter: z.string(),
    focus: z.string(),
    initiatives: z.array(z.object({
      id: z.string(),
      name: z.string(),
      milestone: z.string(),
      budget: z.number(),
      owner: z.string().optional(),
    })),
    keyDeliverables: z.array(z.string()),
    decisionPoints: z.array(z.string()),
  })),
  
  // Qualità analisi
  confidenceLevel: z.number().min(0).max(100),
  dataQualityScore: z.number().min(0).max(100),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
});

// Input per Strategy Advisor
export const StrategyAdvisorInputSchema = z.object({
  tenantId: z.string(),
  companyId: z.string(),
  
  // Parametri prioritizzazione
  prioritizationWeights: z.object({
    wsjfWeight: z.number().min(0).max(1).default(0.4),
    iceWeight: z.number().min(0).max(1).default(0.3),
    portfolioScoreWeight: z.number().min(0).max(1).default(0.3),
  }).optional(),
  
  // Vincoli strategici
  strategicConstraints: z.object({
    maxConcurrentInitiatives: z.number().optional(),
    budgetCeiling: z.number().optional(),
    mustHaveInitiatives: z.array(z.string()).optional(),
    excludeInitiatives: z.array(z.string()).optional(),
  }).optional(),
  
  // Focus strategico
  strategicFocus: z.array(z.enum([
    'growth',
    'cost_optimization',
    'digital_transformation',
    'risk_reduction',
    'customer_experience',
    'operational_excellence',
    'innovation',
    'compliance'
  ])).optional(),
  
  // Time horizon
  planningHorizon: z.enum(['1_year', '2_years', '3_years', '5_years']).default('2_years'),
});

// Types export
export type PrioritizationScore = z.infer<typeof PrioritizationScoreSchema>;
export type ImplementationStrategy = z.infer<typeof ImplementationStrategySchema>;
export type InitiativeDependency = z.infer<typeof InitiativeDependencySchema>;
export type PrioritizedInitiative = z.infer<typeof PrioritizedInitiativeSchema>;
export type StrategicCluster = z.infer<typeof StrategicClusterSchema>;
export type DecisionMatrix = z.infer<typeof DecisionMatrixSchema>;
export type StrategicRecommendation = z.infer<typeof StrategicRecommendationSchema>;
export type StrategicKPI = z.infer<typeof StrategicKPISchema>;
export type StrategyAdvisorResult = z.infer<typeof StrategyAdvisorResultSchema>;
export type StrategyAdvisorInput = z.infer<typeof StrategyAdvisorInputSchema>;
