/**
 * Self-Improving RAG System - Module Exports
 * 
 * Central export point for all self-improving RAG components.
 */

// Types
export * from './types';

// Services
export { PatternLearner, getPatternLearner } from './patternLearner';
export { FeedbackProcessor, getFeedbackProcessor } from './feedbackProcessor';
export { MetricsAggregator, getMetricsAggregator } from './metricsAggregator';
export { CatalogEnricher, getCatalogEnricher } from './catalogEnricher';
export { SyntheticGenerator, getSyntheticGenerator } from './syntheticGenerator';

// Orchestrator
export { 
  SelfImprovingRAGOrchestrator, 
  getSelfImprovingRAGOrchestrator 
} from './ragOrchestrator';

// Re-export default orchestrator
export { default } from './ragOrchestrator';
