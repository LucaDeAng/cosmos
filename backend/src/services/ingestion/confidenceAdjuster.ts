/**
 * Confidence Adjuster
 *
 * Progressively adjusts field confidence based on accuracy:
 * - Learning rate: How fast confidence increases with correct predictions
 * - Decay rate: How fast confidence decreases with errors
 * - Context-aware adjustments
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressiveConfidenceConfig {
  initialConfidence: number;
  learningRate: number;
  decayRate: number;
  minConfidence: number;
  maxConfidence: number;
  contextWeights: Record<string, number>;
}

export interface ConfidenceContext {
  tenantId: string;
  field: string;
  industryContext?: string;
  documentType?: string;
  historicalAccuracy?: number;
}

export interface ConfidenceHistory {
  field: string;
  context: string;
  confidence: number;
  correctPredictions: number;
  totalPredictions: number;
  lastUpdated: Date;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ProgressiveConfidenceConfig = {
  initialConfidence: 0.5,
  learningRate: 0.1,
  decayRate: 0.05,
  minConfidence: 0.3,
  maxConfidence: 0.95,
  contextWeights: {
    same_tenant: 0.3,
    same_industry: 0.2,
    same_format: 0.2,
    same_field: 0.3,
  },
};

// ============================================================================
// MAIN CLASS
// ============================================================================

export class ConfidenceAdjuster {
  private config: ProgressiveConfidenceConfig;
  private history: Map<string, ConfidenceHistory> = new Map();

  constructor(config?: Partial<ProgressiveConfidenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Adjusts confidence based on prediction accuracy
   */
  adjustConfidence(
    currentConfidence: number,
    wasCorrect: boolean,
    context: ConfidenceContext
  ): number {
    // Calculate context weight
    const contextWeight = this.calculateContextWeight(context);

    // Apply adjustment
    let newConfidence: number;

    if (wasCorrect) {
      // Increase confidence with learning rate
      const increase = this.config.learningRate * contextWeight;
      newConfidence = Math.min(
        this.config.maxConfidence,
        currentConfidence + increase
      );
    } else {
      // Decrease confidence with decay rate
      const decrease = this.config.decayRate * (1 + contextWeight);
      newConfidence = Math.max(
        this.config.minConfidence,
        currentConfidence - decrease
      );
    }

    // Update history
    this.updateHistory(context, newConfidence, wasCorrect);

    return newConfidence;
  }

  /**
   * Gets confidence for a field based on historical accuracy
   */
  getFieldConfidence(context: ConfidenceContext): number {
    const historyKey = this.buildHistoryKey(context);
    const history = this.history.get(historyKey);

    if (!history) {
      return this.config.initialConfidence;
    }

    // Calculate confidence from historical accuracy
    const accuracy = history.correctPredictions / Math.max(history.totalPredictions, 1);

    // Blend with current confidence
    return (history.confidence * 0.7) + (accuracy * 0.3);
  }

  /**
   * Calculates context weight based on matching context attributes
   */
  private calculateContextWeight(context: ConfidenceContext): number {
    let totalWeight = 0;

    // Check each context attribute
    const matchedContexts: string[] = [];

    if (context.tenantId) {
      matchedContexts.push('same_tenant');
    }

    if (context.industryContext) {
      matchedContexts.push('same_industry');
    }

    if (context.documentType) {
      matchedContexts.push('same_format');
    }

    if (context.field) {
      matchedContexts.push('same_field');
    }

    // Sum weights
    for (const ctx of matchedContexts) {
      totalWeight += this.config.contextWeights[ctx] || 0;
    }

    return totalWeight;
  }

  /**
   * Updates confidence history
   */
  private updateHistory(
    context: ConfidenceContext,
    newConfidence: number,
    wasCorrect: boolean
  ): void {
    const historyKey = this.buildHistoryKey(context);
    const existing = this.history.get(historyKey);

    if (existing) {
      existing.confidence = newConfidence;
      existing.totalPredictions++;
      if (wasCorrect) {
        existing.correctPredictions++;
      }
      existing.lastUpdated = new Date();
    } else {
      this.history.set(historyKey, {
        field: context.field,
        context: historyKey,
        confidence: newConfidence,
        correctPredictions: wasCorrect ? 1 : 0,
        totalPredictions: 1,
        lastUpdated: new Date(),
      });
    }
  }

  /**
   * Builds a unique key for history tracking
   */
  private buildHistoryKey(context: ConfidenceContext): string {
    return `${context.tenantId}:${context.field}:${context.industryContext || 'any'}:${context.documentType || 'any'}`;
  }

  /**
   * Exports confidence history for persistence
   */
  exportHistory(): ConfidenceHistory[] {
    return Array.from(this.history.values());
  }

  /**
   * Imports confidence history from persistence
   */
  importHistory(histories: ConfidenceHistory[]): void {
    for (const history of histories) {
      this.history.set(history.context, history);
    }
  }

  /**
   * Calculates overall extraction accuracy for a field
   */
  getFieldAccuracy(field: string): number {
    const fieldHistories = Array.from(this.history.values()).filter(h => h.field === field);

    if (fieldHistories.length === 0) {
      return 0.5; // Default
    }

    const totalCorrect = fieldHistories.reduce((sum, h) => sum + h.correctPredictions, 0);
    const totalPredictions = fieldHistories.reduce((sum, h) => sum + h.totalPredictions, 0);

    return totalPredictions > 0 ? totalCorrect / totalPredictions : 0.5;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Blends multiple confidence scores with weights
 */
export function blendConfidences(
  confidences: Array<{ value: number; weight: number }>
): number {
  const totalWeight = confidences.reduce((sum, c) => sum + c.weight, 0);

  if (totalWeight === 0) {
    return 0.5;
  }

  const weightedSum = confidences.reduce((sum, c) => sum + (c.value * c.weight), 0);

  return Math.max(0, Math.min(1, weightedSum / totalWeight));
}

/**
 * Calculates exponential moving average for confidence
 */
export function exponentialMovingAverage(
  current: number,
  newValue: number,
  alpha: number = 0.3
): number {
  return (alpha * newValue) + ((1 - alpha) * current);
}

// ============================================================================
// EXPORT
// ============================================================================

export default ConfidenceAdjuster;
