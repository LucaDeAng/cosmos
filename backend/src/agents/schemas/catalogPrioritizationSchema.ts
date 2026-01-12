import { z } from 'zod';

// WSJF Score
export const WSJFScoreSchema = z.object({
  businessValue: z.number().min(1).max(10),
  timeCriticality: z.number().min(1).max(10),
  riskReduction: z.number().min(1).max(10),
  jobSize: z.number().min(1).max(10),
  score: z.number(),
});
export type WSJFScore = z.infer<typeof WSJFScoreSchema>;

// ICE Score
export const ICEScoreSchema = z.object({
  impact: z.number().min(1).max(10),
  confidence: z.number().min(1).max(10),
  ease: z.number().min(1).max(10),
  score: z.number(),
});
export type ICEScore = z.infer<typeof ICEScoreSchema>;

// Enums
export const KanoCategorySchema = z.enum(['must_be', 'one_dimensional', 'attractive', 'indifferent', 'reverse']);
export type KanoCategory = z.infer<typeof KanoCategorySchema>;

export const ActionTypeSchema = z.enum(['accelerate', 'invest', 'maintain', 'optimize', 'migrate', 'sunset', 'rationalize', 'partner']);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const PriorityLevelSchema = z.enum(['critical', 'high', 'medium', 'low']);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

export const ActionPrioritySchema = z.enum(['immediate', 'short_term', 'medium_term', 'long_term']);
export type ActionPriority = z.infer<typeof ActionPrioritySchema>;

export const QuadrantSchema = z.enum(['quick_win', 'strategic', 'fill_in', 'rationalize']);
export type Quadrant = z.infer<typeof QuadrantSchema>;

export const MoSCoWSchema = z.enum(['must', 'should', 'could', 'wont']);
export type MoSCoW = z.infer<typeof MoSCoWSchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ImpactEffortLevelSchema = z.enum(['high', 'medium', 'low']);
export type ImpactEffortLevel = z.infer<typeof ImpactEffortLevelSchema>;

// Suggested Action
export const SuggestedActionSchema = z.object({
  actionId: z.string(),
  type: ActionTypeSchema,
  title: z.string(),
  description: z.string(),
  priority: ActionPrioritySchema,
  impact: ImpactEffortLevelSchema,
  effort: ImpactEffortLevelSchema,
  expectedOutcome: z.string(),
  nextSteps: z.array(z.string()),
  dependencies: z.array(z.string()).optional(),
  estimatedCost: z.number().optional(),
  estimatedROI: z.number().optional(),
  estimatedTimeframe: z.string().optional(),
});
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

// Prioritized Catalog Item
export const PrioritizedCatalogItemSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  type: z.enum(['product', 'service']),
  category: z.string().optional(),
  description: z.string().optional(),
  scores: z.object({
    wsjf: WSJFScoreSchema,
    ice: ICEScoreSchema,
    retentionIndex: z.number().min(0).max(1),
    kanoCategory: KanoCategorySchema,
    compositeScore: z.number().min(0).max(100),
    portfolioScore: z.number().min(0).max(100).optional(),
  }),
  quadrant: QuadrantSchema,
  moscow: MoSCoWSchema,
  priority: PriorityLevelSchema,
  priorityRank: z.number(),
  suggestedActions: z.array(SuggestedActionSchema),
  primaryAction: SuggestedActionSchema.optional(),
  actionSummary: z.string(),
  strategicFit: z.number().min(0).max(100),
  riskLevel: RiskLevelSchema,
  currentBudget: z.number().optional(),
  recommendedBudget: z.number().optional(),
  expectedROI: z.number().optional(),
  portfolioRecommendation: z.enum(['keep', 'accelerate', 'review', 'pause', 'stop', 'merge']).optional(),
  confidence: z.number().min(0).max(100),
  dataQuality: z.number().min(0).max(100),
});
export type PrioritizedCatalogItem = z.infer<typeof PrioritizedCatalogItemSchema>;

// Decision Matrix
export const DecisionMatrixItemSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  value: z.number(),
  effort: z.number(),
  recommendation: z.string(),
});
export type DecisionMatrixItem = z.infer<typeof DecisionMatrixItemSchema>;

export const DecisionMatrixSchema = z.object({
  quickWins: z.array(DecisionMatrixItemSchema),
  strategic: z.array(DecisionMatrixItemSchema),
  fillIns: z.array(DecisionMatrixItemSchema),
  rationalize: z.array(DecisionMatrixItemSchema),
});
export type DecisionMatrix = z.infer<typeof DecisionMatrixSchema>;

// Summary
export const PrioritizationSummarySchema = z.object({
  totalItems: z.number(),
  distribution: z.object({
    quickWins: z.number(),
    strategic: z.number(),
    fillIns: z.number(),
    rationalize: z.number(),
  }),
  moscowDistribution: z.object({
    must: z.number(),
    should: z.number(),
    could: z.number(),
    wont: z.number(),
  }),
  topActions: z.array(SuggestedActionSchema),
  estimatedTotalInvestment: z.number(),
  estimatedTotalSavings: z.number(),
  estimatedOverallROI: z.number(),
});
export type PrioritizationSummary = z.infer<typeof PrioritizationSummarySchema>;

// Main Result
export const CatalogPrioritizationResultSchema = z.object({
  prioritizationId: z.string(),
  tenantId: z.string(),
  companyId: z.string().optional(),
  generatedAt: z.string(),
  items: z.array(PrioritizedCatalogItemSchema),
  summary: PrioritizationSummarySchema,
  decisionMatrix: DecisionMatrixSchema,
  confidence: z.number().min(0).max(100),
  dataQualityScore: z.number().min(0).max(100),
  config: z.object({
    weights: z.object({
      wsjf: z.number(),
      ice: z.number(),
      retention: z.number(),
      portfolio: z.number(),
    }),
    maturityLevel: z.number().min(1).max(5),
  }),
});
export type CatalogPrioritizationResult = z.infer<typeof CatalogPrioritizationResultSchema>;

// Input
export const CatalogPrioritizationInputSchema = z.object({
  tenantId: z.string(),
  companyId: z.string().optional(),
  portfolioType: z.enum(['products', 'services', 'mixed']).default('mixed'),
  customWeights: z.object({
    wsjf: z.number(),
    ice: z.number(),
    retention: z.number(),
    portfolio: z.number(),
  }).optional(),
  strategicFocus: z.array(z.string()).optional(),
});
export type CatalogPrioritizationInput = z.infer<typeof CatalogPrioritizationInputSchema>;
