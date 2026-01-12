import { z } from 'zod';

// ============================================
// PRIORITIZATION SCHEMA
// Framework riutilizzabile per prioritizzazione portfolio
// ============================================

// === TRIAGE LAYER ===

export const TriageCategorySchema = z.enum([
  'MUST',      // Critico, non negoziabile
  'SHOULD',    // Importante, alto valore
  'COULD',     // Desiderabile se risorse disponibili
  'WONT',      // Da rimandare o eliminare
  'UNKNOWN',   // Richiede analisi dettagliata
]);

export const TriageResultSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  category: TriageCategorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  keySignals: z.array(z.string()).optional(),
});

// === SCORING LAYER ===

// WSJF (Weighted Shortest Job First)
export const WSJFScoreSchema = z.object({
  businessValue: z.number().min(1).max(10),
  timeCriticality: z.number().min(1).max(10),
  riskReduction: z.number().min(1).max(10),
  jobSize: z.number().min(1).max(10),
  score: z.number(), // (BV + TC + RR) / JS
});

// ICE Score (Impact, Confidence, Ease)
export const ICEScoreSchema = z.object({
  impact: z.number().min(1).max(10),
  confidence: z.number().min(1).max(10),
  ease: z.number().min(1).max(10),
  score: z.number(), // I * C * E
});

// Retention Index (Portfolio Theory)
export const RetentionIndexSchema = z.object({
  futureMarketPotential: z.number().min(0).max(1),
  productModificationGain: z.number().min(0).max(1),
  financialImpact: z.number().min(0).max(1),
  strategicFit: z.number().min(0).max(1),
  resourceRequirements: z.number().min(0).max(1),
  riskLevel: z.number().min(0).max(1),
  competitivePosition: z.number().min(0).max(1),
  score: z.number().min(0).max(1), // Weighted average
});

// Criteri di scoring con pesi configurabili
export const ScoringCriteriaSchema = z.object({
  teamPriority: z.object({
    weight: z.number().min(0).max(1).default(0.20),
    value: z.number().min(1).max(10).optional(),
  }),
  criticality: z.object({
    weight: z.number().min(0).max(1).default(0.15),
    value: z.enum(['critical', 'important', 'standard', 'optional']).optional(),
  }),
  businessValue: z.object({
    weight: z.number().min(0).max(1).default(0.15),
    value: z.number().min(1).max(10).optional(),
  }),
  strategicAlignment: z.object({
    weight: z.number().min(0).max(1).default(0.12),
    value: z.number().min(1).max(10).optional(),
  }),
  customerValue: z.object({
    weight: z.number().min(0).max(1).default(0.10),
    value: z.number().min(1).max(10).optional(),
  }),
  riskLevel: z.object({
    weight: z.number().min(0).max(1).default(0.08),
    value: z.number().min(1).max(10).optional(),
  }),
  implementationEffort: z.object({
    weight: z.number().min(0).max(1).default(0.08),
    value: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
  }),
  dependencies: z.object({
    weight: z.number().min(0).max(1).default(0.06),
    value: z.number().min(0).optional(), // count
  }),
  technicalDebt: z.object({
    weight: z.number().min(0).max(1).default(0.06),
    value: z.number().min(1).max(10).optional(),
  }),
});

// Score priorità completo per un item
export const PriorityScoreSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  overallScore: z.number().min(0).max(100),
  wsjfScore: z.number(),
  iceScore: z.number(),
  retentionIndex: z.number().min(0).max(1),
  moscow: z.enum(['must_have', 'should_have', 'could_have', 'wont_have']),
  moscowRationale: z.string(),
  confidence: z.number().min(0).max(1),
  breakdown: z.record(z.string(), z.number()).optional(),
  reasoning: z.array(z.string()),
  recommendation: z.enum(['invest', 'maintain', 'optimize', 'eliminate']),
});

// === OPTIMIZATION LAYER ===

export const OptimizationConstraintsSchema = z.object({
  totalBudget: z.number().optional(),
  maxItems: z.number().optional(),
  minCoverage: z.object({
    mustHave: z.number().min(0).max(1).default(1.0), // 100% di MUST items
    categories: z.array(z.string()).optional(),
  }).optional(),
  riskTolerance: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  timeHorizon: z.enum(['short', 'medium', 'long']).default('medium'),
});

export const OptimizationScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  selectedItems: z.array(z.string()), // item IDs
  totalValue: z.number(),
  totalCost: z.number(),
  riskScore: z.number(),
  coverage: z.record(z.string(), z.number()), // category -> percentage
});

export const OptimizedPortfolioSchema = z.object({
  selectedItems: z.array(PriorityScoreSchema),
  deferredItems: z.array(PriorityScoreSchema),
  eliminationCandidates: z.array(PriorityScoreSchema),
  metrics: z.object({
    totalValue: z.number(),
    totalCost: z.number(),
    riskScore: z.number(),
    strategicCoverage: z.number().min(0).max(1),
    diversificationIndex: z.number().min(0).max(1),
  }),
  scenarios: z.array(OptimizationScenarioSchema).optional(),
});

// === LEARNING LAYER ===

export const FeedbackEventSchema = z.object({
  id: z.string().optional(),
  itemId: z.string(),
  prioritizationId: z.string().optional(),
  originalCategory: z.string().optional(),
  originalScore: z.number().optional(),
  userCorrection: z.object({
    newCategory: z.string().optional(),
    newScore: z.number().optional(),
    reasoning: z.string().optional(),
  }),
  itemFeatures: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
  userId: z.string(),
  tenantId: z.string(),
});

export const LearnedPatternSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  pattern: z.object({
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith']),
      value: z.unknown(),
    })),
    adjustment: z.object({
      type: z.enum(['multiply', 'add', 'override']),
      target: z.enum(['overall', 'category', 'criteria']),
      value: z.unknown(),
    }),
  }),
  confidence: z.number().min(0).max(1),
  supportCount: z.number(),
  active: z.boolean().default(true),
  createdAt: z.string(),
  lastTriggeredAt: z.string().optional(),
});

// === MAIN INPUT/OUTPUT SCHEMAS ===

export const PrioritizationInputSchema = z.object({
  tenantId: z.string(),
  companyId: z.string().optional(),

  // Items da prioritizzare (opzionale, altrimenti caricati da DB)
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['initiative', 'product', 'service']).optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    businessValue: z.number().optional(),
    budget: z.number().optional(),
    estimatedCost: z.number().optional(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    strategicAlignment: z.number().optional(),
    lifecycle: z.string().optional(),
    activeUsers: z.number().optional(),
    lastUpdate: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
  })).optional(),

  // Configurazione triage
  triageConfig: z.object({
    enabled: z.boolean().default(true),
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    useAI: z.boolean().default(true),
  }).optional(),

  // Configurazione scoring
  scoringConfig: z.object({
    enabled: z.boolean().default(true),
    weights: ScoringCriteriaSchema.partial().optional(),
    includeWSJF: z.boolean().default(true),
    includeICE: z.boolean().default(true),
    includeRetention: z.boolean().default(true),
  }).optional(),

  // Configurazione ottimizzazione
  optimizationConfig: z.object({
    enabled: z.boolean().default(true),
    constraints: OptimizationConstraintsSchema.optional(),
    generateScenarios: z.boolean().default(true),
    scenarioCount: z.number().min(1).max(5).default(3),
  }).optional(),

  // Contesto strategico
  strategicContext: z.object({
    goals: z.array(z.string()).optional(),
    budgetLevel: z.enum(['limited', 'moderate', 'generous']).optional(),
    industry: z.string().optional(),
    companySize: z.enum(['small', 'medium', 'large', 'enterprise']).optional(),
    maturityLevel: z.number().min(1).max(5).optional(),
  }).optional(),

  // Callback progress (validated as any function at runtime)
  onProgress: z.any().optional(),
});

export const PrioritizationResultSchema = z.object({
  prioritizationId: z.string(),
  tenantId: z.string(),
  companyId: z.string().optional(),
  createdAt: z.string(),

  // Summary
  summary: z.object({
    totalItems: z.number(),
    processedItems: z.number(),
    processingTimeMs: z.number(),
    modelVersion: z.string().optional(),
  }),

  // Risultati triage
  triage: z.object({
    results: z.array(TriageResultSchema),
    breakdown: z.object({
      MUST: z.number(),
      SHOULD: z.number(),
      COULD: z.number(),
      WONT: z.number(),
      UNKNOWN: z.number(),
    }),
    averageConfidence: z.number(),
  }),

  // Risultati scoring
  scoring: z.object({
    results: z.array(PriorityScoreSchema),
    topPerformers: z.array(z.object({
      itemId: z.string(),
      name: z.string(),
      score: z.number(),
      highlight: z.string(),
    })),
    bottomPerformers: z.array(z.object({
      itemId: z.string(),
      name: z.string(),
      score: z.number(),
      issue: z.string(),
    })),
  }),

  // Risultati ottimizzazione
  optimization: OptimizedPortfolioSchema,

  // Configurazione usata
  config: z.object({
    triageConfig: z.record(z.string(), z.unknown()),
    scoringConfig: z.record(z.string(), z.unknown()),
    optimizationConfig: z.record(z.string(), z.unknown()),
  }),

  // Qualità analisi
  confidence: z.number().min(0).max(100),
  warnings: z.array(z.string()).optional(),
  patternsApplied: z.array(z.string()).optional(),
});

// === TYPE EXPORTS ===

export type TriageCategory = z.infer<typeof TriageCategorySchema>;
export type TriageResult = z.infer<typeof TriageResultSchema>;
export type WSJFScore = z.infer<typeof WSJFScoreSchema>;
export type ICEScore = z.infer<typeof ICEScoreSchema>;
export type RetentionIndex = z.infer<typeof RetentionIndexSchema>;
export type ScoringCriteria = z.infer<typeof ScoringCriteriaSchema>;
export type PriorityScore = z.infer<typeof PriorityScoreSchema>;
export type OptimizationConstraints = z.infer<typeof OptimizationConstraintsSchema>;
export type OptimizationScenario = z.infer<typeof OptimizationScenarioSchema>;
export type OptimizedPortfolio = z.infer<typeof OptimizedPortfolioSchema>;
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;
export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;
export type PrioritizationInput = z.infer<typeof PrioritizationInputSchema>;
export type PrioritizationResult = z.infer<typeof PrioritizationResultSchema>;
