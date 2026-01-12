/**
 * Portfolio Prioritization Framework - Types
 *
 * Interfacce TypeScript per il framework di prioritizzazione riutilizzabile.
 * Usato da: PortfolioPrioritizationAgent, StrategyAdvisorAgent
 */

import type {
  TriageCategory,
  TriageResult,
  WSJFScore,
  ICEScore,
  RetentionIndex,
  ScoringCriteria,
  PriorityScore,
  OptimizationConstraints,
  OptimizedPortfolio,
  FeedbackEvent,
  LearnedPattern,
} from '../schemas/prioritizationSchema';

// Re-export schema types
export type {
  TriageCategory,
  TriageResult,
  WSJFScore,
  ICEScore,
  RetentionIndex,
  ScoringCriteria,
  PriorityScore,
  OptimizationConstraints,
  OptimizedPortfolio,
  FeedbackEvent,
  LearnedPattern,
};

// === PORTFOLIO ITEM (input per prioritizzazione) ===

export interface PortfolioItemInput {
  id: string;
  name: string;
  type?: 'initiative' | 'product' | 'service';
  description?: string;
  status?: string;
  category?: string;
  tags?: string[];

  // Business metrics
  businessValue?: number;
  budget?: number;
  estimatedCost?: number;
  actualCost?: number;
  roi?: number;

  // Risk and complexity
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  complexity?: 'low' | 'medium' | 'high';

  // Strategic alignment
  strategicAlignment?: number;
  teamPriority?: number;

  // Usage and lifecycle
  lifecycle?: string;
  activeUsers?: number;
  lastUpdate?: string;

  // Dependencies
  dependencies?: string[];

  // Additional metadata
  owner?: string;
  startDate?: string;
  endDate?: string;
  kpis?: Array<{ name: string; target: string | number; current?: string | number }>;
}

// === STRATEGIC CONTEXT ===

export interface StrategicProfile {
  goals?: string[];
  budgetLevel?: 'limited' | 'moderate' | 'generous';
  industry?: string;
  companySize?: 'small' | 'medium' | 'large' | 'enterprise';
  maturityLevel?: number;
  riskTolerance?: 'conservative' | 'balanced' | 'aggressive';
  priorityAreas?: string[];
}

// === TRIAGE LAYER ===

export interface TriageConfig {
  enabled: boolean;
  confidenceThreshold: number;
  useAI: boolean;
  customRules?: TriageRule[];
}

export interface TriageRule {
  name: string;
  conditions: RuleCondition[];
  resultCategory: TriageCategory;
  confidence: number;
  reasoning: string;
}

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'includes';
  value: unknown;
}

export interface TriageLayerResult {
  results: TriageResult[];
  breakdown: {
    MUST: number;
    SHOULD: number;
    COULD: number;
    WONT: number;
    UNKNOWN: number;
  };
  averageConfidence: number;
  rulesApplied: number;
  aiUsed: boolean;
  processingTimeMs: number;
}

// === SCORING LAYER ===

export interface ScoringConfig {
  enabled: boolean;
  weights?: Partial<ScoringWeights>;
  includeWSJF: boolean;
  includeICE: boolean;
  includeRetention: boolean;
  phaseAdjustment?: boolean;
}

export interface ScoringWeights {
  teamPriority: number;
  criticality: number;
  businessValue: number;
  strategicAlignment: number;
  customerValue: number;
  riskLevel: number;
  implementationEffort: number;
  dependencies: number;
  technicalDebt: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  teamPriority: 0.20,
  criticality: 0.15,
  businessValue: 0.15,
  strategicAlignment: 0.12,
  customerValue: 0.10,
  riskLevel: 0.08,
  implementationEffort: 0.08,
  dependencies: 0.06,
  technicalDebt: 0.06,
};

export interface ScoringLayerResult {
  results: PriorityScore[];
  topPerformers: Array<{
    itemId: string;
    name: string;
    score: number;
    highlight: string;
  }>;
  bottomPerformers: Array<{
    itemId: string;
    name: string;
    score: number;
    issue: string;
  }>;
  averageScore: number;
  scoreDistribution: {
    excellent: number;  // 80-100
    good: number;       // 60-79
    fair: number;       // 40-59
    poor: number;       // 0-39
  };
  processingTimeMs: number;
}

// === OPTIMIZATION LAYER ===

export interface OptimizationConfig {
  enabled: boolean;
  constraints?: OptimizationConstraints;
  generateScenarios: boolean;
  scenarioCount: number;
  algorithm: 'knapsack' | 'greedy' | 'genetic';
}

export interface OptimizationLayerResult extends OptimizedPortfolio {
  processingTimeMs: number;
  constraintsSatisfied: boolean;
  constraintViolations?: string[];
}

// === LEARNING LAYER ===

export interface LearningConfig {
  enabled: boolean;
  minPatternsForLearning: number;
  confidenceThreshold: number;
  patternDecayDays: number;
}

export interface PatternCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith';
  value: unknown;
}

export interface PatternAdjustment {
  type: 'multiply' | 'add' | 'override';
  target: 'overall' | 'category' | 'criteria';
  value: unknown;
}

export interface LearningStats {
  totalFeedback: number;
  patternsActive: number;
  patternsInactive: number;
  accuracyImprovement: number;
  lastLearningRun?: string;
}

// === PRIORITIZATION FRAMEWORK ===

export interface PrioritizationFramework {
  // Configurazione
  configure(config: PrioritizationConfig): void;

  // Metodi core
  triage(items: PortfolioItemInput[], context: StrategicProfile): Promise<TriageLayerResult>;
  score(items: PortfolioItemInput[], triageResults?: TriageResult[]): Promise<ScoringLayerResult>;
  optimize(scoredItems: PriorityScore[], constraints?: OptimizationConstraints): Promise<OptimizationLayerResult>;

  // Learning
  recordFeedback(event: FeedbackEvent): Promise<void>;
  applyLearnedPatterns(itemId: string, baseScore: PriorityScore, tenantId: string): Promise<PriorityScore>;
  getPatterns(tenantId: string): Promise<LearnedPattern[]>;
}

export interface PrioritizationConfig {
  triage: TriageConfig;
  scoring: ScoringConfig;
  optimization: OptimizationConfig;
  learning: LearningConfig;
}

// Partial version for constructor input (allows partial configs per layer)
export interface PartialPrioritizationConfig {
  triage?: Partial<TriageConfig>;
  scoring?: Partial<ScoringConfig>;
  optimization?: Partial<OptimizationConfig>;
  learning?: Partial<LearningConfig>;
}

// === PROGRESS CALLBACK ===

export interface ProgressInfo {
  phase: 'loading' | 'triage' | 'scoring' | 'optimization' | 'learning' | 'complete';
  message: string;
  progress: number;  // 0-100
  itemsProcessed?: number;
  totalItems?: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

// === EFFORT MAPPING ===

export const EFFORT_TO_NUMERIC: Record<string, number> = {
  'XS': 1,
  'S': 2,
  'M': 5,
  'L': 8,
  'XL': 13,
};

export const CRITICALITY_TO_NUMERIC: Record<string, number> = {
  'critical': 10,
  'important': 7,
  'standard': 4,
  'optional': 1,
};

// === UTILITY FUNCTIONS ===

export function effortToNumeric(effort: string): number {
  return EFFORT_TO_NUMERIC[effort] || 5;
}

export function criticalityToNumeric(criticality: string): number {
  return CRITICALITY_TO_NUMERIC[criticality] || 5;
}

export function normalizeScore(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}
