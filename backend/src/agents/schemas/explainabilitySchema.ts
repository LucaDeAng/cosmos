/**
 * Explainability Schema - Detailed score explanations
 *
 * Provides structured schemas for explaining AI-generated scores,
 * enabling transparency and user trust in recommendations.
 */

import { z } from 'zod';

// === SCORE FACTORS ===

/**
 * Single factor contributing to a score
 */
export const ScoreFactorSchema = z.object({
  /** Unique identifier for the factor */
  factor: z.string(),
  /** Impact on score (can be positive or negative) */
  impact: z.number(),
  /** Weight of this factor in the calculation (0-1) */
  weight: z.number().min(0).max(1),
  /** Human-readable explanation */
  explanation: z.string(),
  /** Source of the data used for this factor */
  dataSource: z.string(),
  /** Confidence in this factor (0-1) */
  confidence: z.number().min(0).max(1)
});

export type ScoreFactor = z.infer<typeof ScoreFactorSchema>;

// === SCORE BREAKDOWN ===

/**
 * Complete breakdown of how a score was calculated
 */
export const ScoreBreakdownSchema = z.object({
  /** Final calculated value */
  value: z.number(),
  /** All factors that contributed to this score */
  factors: z.array(ScoreFactorSchema),
  /** Human-readable summary explanation */
  explanation: z.string(),
  /** Fields that were missing and impacted calculation */
  missingData: z.array(z.string()),
  /** Assumptions made due to missing data */
  assumptions: z.array(z.string())
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

// === CONFIDENCE BREAKDOWN ===

/**
 * Data quality issue affecting confidence
 */
export const DataQualityIssueSchema = z.object({
  /** Field with the issue */
  field: z.string(),
  /** Description of the issue */
  issue: z.string(),
  /** Impact level on confidence */
  impact: z.enum(['high', 'medium', 'low'])
});

export type DataQualityIssue = z.infer<typeof DataQualityIssueSchema>;

/**
 * Detailed confidence breakdown
 */
export const ConfidenceBreakdownSchema = z.object({
  /** Overall confidence score (0-1) */
  overall: z.number().min(0).max(1),
  /** Breakdown by component */
  breakdown: z.object({
    /** Percentage of required fields present */
    dataCompleteness: z.number().min(0).max(1),
    /** Reliability of data source */
    sourceReliability: z.number().min(0).max(1),
    /** Match with learned patterns */
    patternMatch: z.number().min(0).max(1),
    /** Consistency between related fields */
    crossValidation: z.number().min(0).max(1)
  }),
  /** Specific data quality issues identified */
  dataQualityIssues: z.array(DataQualityIssueSchema),
  /** Suggestions for improving confidence */
  improvementSuggestions: z.array(z.string())
});

export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;

// === LEARNED ADJUSTMENTS ===

/**
 * Adjustment applied from learned patterns
 */
export const LearnedAdjustmentSchema = z.object({
  /** ID of the pattern that was applied */
  patternId: z.string(),
  /** Human-readable pattern name */
  patternName: z.string(),
  /** Score before adjustment */
  originalScore: z.number(),
  /** Score after adjustment */
  adjustedScore: z.number(),
  /** Amount of adjustment */
  adjustment: z.number(),
  /** Confidence in the pattern */
  confidence: z.number().min(0).max(1),
  /** When the adjustment was applied */
  appliedAt: z.string()
});

export type LearnedAdjustment = z.infer<typeof LearnedAdjustmentSchema>;

// === DECISION PATH ===

/**
 * Threshold that was evaluated in making a decision
 */
export const ThresholdCrossedSchema = z.object({
  /** Name of the threshold */
  threshold: z.string(),
  /** Value that was evaluated */
  value: z.number(),
  /** Whether the threshold was crossed */
  crossed: z.boolean()
});

/**
 * Path taken to reach a decision/recommendation
 */
export const DecisionPathSchema = z.object({
  /** Top factors that drove the decision */
  primaryFactors: z.array(z.string()),
  /** Alternative recommendation that was considered */
  alternativeConsidered: z.string().optional(),
  /** Thresholds evaluated */
  thresholdsCrossed: z.array(ThresholdCrossedSchema)
});

export type DecisionPath = z.infer<typeof DecisionPathSchema>;

// === COMPLETE EXPLAINABLE ASSESSMENT ===

/**
 * Score breakdowns for all dimensions
 */
export const AllScoreBreakdownsSchema = z.object({
  strategicFit: ScoreBreakdownSchema,
  valueDelivery: ScoreBreakdownSchema,
  riskAdjustedReturn: ScoreBreakdownSchema,
  resourceEfficiency: ScoreBreakdownSchema,
  marketTiming: ScoreBreakdownSchema
});

export type AllScoreBreakdowns = z.infer<typeof AllScoreBreakdownsSchema>;

/**
 * Complete explainable item assessment
 */
export const ExplainableItemAssessmentSchema = z.object({
  // Core identification
  itemId: z.string(),
  itemName: z.string(),

  // Overall results
  overallScore: z.number().min(0).max(100),
  recommendation: z.enum(['keep', 'accelerate', 'review', 'pause', 'stop', 'merge']),

  // Score breakdowns for each dimension
  scoreBreakdowns: AllScoreBreakdownsSchema,

  // Confidence analysis
  confidenceBreakdown: ConfidenceBreakdownSchema,

  // Learning system impact
  learnedAdjustments: z.array(LearnedAdjustmentSchema),

  // Decision explanation
  decisionPath: DecisionPathSchema,

  // Legacy fields for backward compatibility
  rationale: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()).optional(),
  threats: z.array(z.string()).optional(),
  actionItems: z.array(z.object({
    action: z.string(),
    priority: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
    impact: z.enum(['high', 'medium', 'low'])
  }))
});

export type ExplainableItemAssessment = z.infer<typeof ExplainableItemAssessmentSchema>;

// === HELPER FUNCTIONS ===

/**
 * Create an empty score breakdown
 */
export function createEmptyScoreBreakdown(value: number = 50): ScoreBreakdown {
  return {
    value,
    factors: [],
    explanation: 'Score calcolato con dati insufficienti',
    missingData: [],
    assumptions: ['Usati valori di default']
  };
}

/**
 * Create an empty confidence breakdown
 */
export function createEmptyConfidenceBreakdown(): ConfidenceBreakdown {
  return {
    overall: 0.5,
    breakdown: {
      dataCompleteness: 0.5,
      sourceReliability: 0.5,
      patternMatch: 0.5,
      crossValidation: 0.5
    },
    dataQualityIssues: [],
    improvementSuggestions: ['Aggiungi pi\u00F9 dati per migliorare la confidenza']
  };
}

/**
 * Calculate overall score from breakdown factors
 */
export function calculateOverallFromFactors(factors: ScoreFactor[], baseScore: number = 50): number {
  let score = baseScore;

  for (const factor of factors) {
    score += factor.impact * factor.weight;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate explanation text from factors
 */
export function generateExplanationFromFactors(
  factors: ScoreFactor[],
  dimension: string
): string {
  const positives = factors.filter(f => f.impact > 0);
  const negatives = factors.filter(f => f.impact < 0);

  const parts: string[] = [];

  if (positives.length > 0) {
    const topPositive = positives.sort((a, b) => b.impact - a.impact)[0];
    parts.push(`Punto di forza: ${topPositive.explanation}`);
  }

  if (negatives.length > 0) {
    const topNegative = negatives.sort((a, b) => a.impact - b.impact)[0];
    parts.push(`Area di miglioramento: ${topNegative.explanation}`);
  }

  if (parts.length === 0) {
    return `${dimension}: valutazione nella media`;
  }

  return parts.join('. ') + '.';
}

/**
 * Format confidence as percentage string
 */
export function formatConfidence(confidence: number): string {
  const percent = Math.round(confidence * 100);
  if (percent >= 80) return `Alta (${percent}%)`;
  if (percent >= 60) return `Media (${percent}%)`;
  if (percent >= 40) return `Bassa (${percent}%)`;
  return `Molto bassa (${percent}%)`;
}

export default {
  ScoreFactorSchema,
  ScoreBreakdownSchema,
  ConfidenceBreakdownSchema,
  LearnedAdjustmentSchema,
  DecisionPathSchema,
  ExplainableItemAssessmentSchema,
  createEmptyScoreBreakdown,
  createEmptyConfidenceBreakdown,
  calculateOverallFromFactors,
  generateExplanationFromFactors,
  formatConfidence
};
