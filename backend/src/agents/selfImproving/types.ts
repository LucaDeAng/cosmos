/**
 * Self-Improving RAG System Types
 * 
 * Types and interfaces for the self-improving RAG system that learns
 * from user interactions, feedback, and extraction patterns.
 */

// ============================================================================
// Core Entity Types
// ============================================================================

export interface LearnedPattern {
  id: string;
  patternType: PatternType;
  sourceType: string;
  inputPattern: string;           // Regex or semantic pattern
  outputMapping: OutputMapping;
  confidence: number;             // 0-1, increases with successful uses
  usageCount: number;
  successCount: number;
  lastUsed: Date;
  createdAt: Date;
  metadata: PatternMetadata;
}

export type PatternType = 
  | 'field_extraction'      // Pattern for extracting specific fields
  | 'entity_classification' // Pattern for classifying entity types
  | 'normalization'         // Pattern for normalizing values
  | 'relationship'          // Pattern for detecting relationships
  | 'context_detection';    // Pattern for detecting document context

export interface OutputMapping {
  targetField: string;
  transformationType: 'direct' | 'lookup' | 'template' | 'function';
  transformationConfig: Record<string, unknown>;
}

export interface PatternMetadata {
  learnedFrom: string[];      // Source document IDs
  documentTypes: string[];    // PDF, Excel, Text, etc.
  industries: string[];       // Industry verticals
  categories: string[];       // Product/service categories
  examples: PatternExample[];
}

export interface PatternExample {
  input: string;
  output: string;
  context: string;
  timestamp: Date;
}

// ============================================================================
// Feedback Types
// ============================================================================

export interface ExtractionFeedback {
  id: string;
  extractionId: string;
  itemIndex: number;
  feedbackType: FeedbackType;
  originalValue: unknown;
  correctedValue: unknown;
  fieldName: string;
  userId: string;
  timestamp: Date;
  processed: boolean;
  patternGenerated: boolean;
}

export type FeedbackType = 
  | 'correction'      // User corrected a value
  | 'rejection'       // User rejected an extraction
  | 'approval'        // User approved extraction
  | 'addition'        // User added missing item
  | 'category_change' // User changed category/classification
  | 'merge'           // User merged multiple items
  | 'split';          // User split an item

export interface FeedbackBatch {
  feedbacks: ExtractionFeedback[];
  documentId: string;
  documentType: string;
  processedAt?: Date;
  patternsLearned: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface ExtractionMetrics {
  id: string;
  extractionId: string;
  documentId: string;
  documentType: string;
  sourceType: string;
  
  // Extraction stats
  itemsExtracted: number;
  itemsApproved: number;
  itemsCorrected: number;
  itemsRejected: number;
  
  // Quality metrics
  extractionAccuracy: number;     // 0-1
  fieldAccuracy: Record<string, number>;
  avgConfidence: number;
  
  // Performance metrics
  processingTimeMs: number;
  tokensUsed: number;
  
  // RAG metrics
  ragContextUsed: boolean;
  ragMatchCount: number;
  ragAvgSimilarity: number;
  
  // Patterns metrics
  patternsApplied: number;
  patternsSuccessful: number;
  
  timestamp: Date;
}

export interface AggregatedMetrics {
  period: MetricsPeriod;
  startDate: Date;
  endDate: Date;
  
  // Volume
  totalExtractions: number;
  totalItems: number;
  totalDocuments: number;
  
  // Quality
  overallAccuracy: number;
  accuracyByDocType: Record<string, number>;
  accuracyByField: Record<string, number>;
  accuracyTrend: TrendData[];
  
  // Patterns
  patternsLearned: number;
  patternsActive: number;
  patternEffectiveness: number;
  
  // RAG
  ragUtilization: number;
  ragContribution: number;  // How much RAG improves accuracy
  
  // Feedback
  feedbackVolume: number;
  feedbackProcessed: number;
  improvementFromFeedback: number;
}

export type MetricsPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface TrendData {
  timestamp: Date;
  value: number;
  label?: string;
}

// ============================================================================
// Synthetic Data Types
// ============================================================================

export interface SyntheticExample {
  id: string;
  exampleType: SyntheticExampleType;
  sourcePattern?: string;           // Pattern ID if generated from pattern
  sourceDocument?: string;          // Document ID if augmented from real data
  
  inputData: SyntheticInput;
  expectedOutput: SyntheticOutput;
  
  category: string;
  industry: string;
  complexity: 'simple' | 'medium' | 'complex';
  
  usedInTraining: number;
  effectiveness: number;            // How well it improves extractions
  
  createdAt: Date;
  metadata: SyntheticMetadata;
}

export type SyntheticExampleType = 
  | 'generated'       // Fully AI-generated
  | 'augmented'       // Based on real data, augmented
  | 'variation'       // Variation of existing example
  | 'edge_case'       // Edge case generated from errors
  | 'user_provided';  // User-submitted example

export interface SyntheticInput {
  text?: string;
  structuredData?: Record<string, unknown>;
  context?: string;
}

export interface SyntheticOutput {
  extractedItems: ExtractedItemTemplate[];
  classifications?: string[];
  relationships?: RelationshipTemplate[];
}

export interface ExtractedItemTemplate {
  name: string;
  description?: string;
  category?: string;
  type?: string;
  vendor?: string;
  version?: string;
  attributes?: Record<string, string>;
}

export interface RelationshipTemplate {
  source: string;
  target: string;
  type: string;
}

export interface SyntheticMetadata {
  generationMethod: string;
  qualityScore: number;
  validatedBy?: string;
  tags: string[];
}

// ============================================================================
// Catalog Enrichment Types
// ============================================================================

export interface CatalogEnrichment {
  id: string;
  catalogType: CatalogType;
  enrichmentType: EnrichmentType;
  
  // What was added/modified
  entryId?: string;           // If modifying existing
  content: EnrichmentContent;
  
  // Origin
  sourceType: 'pattern' | 'feedback' | 'extraction' | 'manual';
  sourceId: string;
  
  // Status
  status: EnrichmentStatus;
  confidence: number;
  reviewedBy?: string;
  reviewedAt?: Date;
  
  createdAt: Date;
  appliedAt?: Date;
}

export type CatalogType = 
  | 'products'
  | 'industries'
  | 'entities'
  | 'examples'
  | 'vendors'
  | 'categories';

export type EnrichmentType = 
  | 'new_entry'
  | 'synonym'
  | 'relationship'
  | 'attribute'
  | 'example'
  | 'correction';

export interface EnrichmentContent {
  name?: string;
  description?: string;
  synonyms?: string[];
  parentCategory?: string;
  attributes?: Record<string, unknown>;
  examples?: string[];
  relatedTo?: string[];
}

export type EnrichmentStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'superseded';

// ============================================================================
// Learning Pipeline Types
// ============================================================================

export interface LearningPipelineConfig {
  // Pattern learning
  minConfidenceForPattern: number;      // Min confidence to create pattern
  minOccurrencesForPattern: number;     // Min times seen before learning
  patternDecayRate: number;             // How fast unused patterns decay
  maxPatternsPerType: number;           // Limit patterns per type
  
  // Feedback processing
  feedbackBatchSize: number;            // Process feedback in batches
  feedbackProcessingInterval: number;   // Minutes between processing
  minFeedbacksForLearning: number;      // Min feedbacks to trigger learning
  
  // Synthetic generation
  syntheticGenerationEnabled: boolean;
  syntheticBatchSize: number;
  minExamplesPerCategory: number;
  
  // Catalog enrichment
  autoEnrichmentEnabled: boolean;
  enrichmentReviewRequired: boolean;
  minConfidenceForAutoEnrich: number;
  
  // Quality gates
  minAccuracyThreshold: number;         // Below this triggers retraining
  maxPatternAge: number;                // Days before pattern review
}

export interface LearningSession {
  id: string;
  startedAt: Date;
  completedAt?: Date;
  
  trigger: 'scheduled' | 'threshold' | 'manual' | 'feedback_volume';
  
  patternsAnalyzed: number;
  patternsLearned: number;
  patternsUpdated: number;
  patternsDeprecated: number;
  
  feedbackProcessed: number;
  syntheticGenerated: number;
  enrichmentsCreated: number;
  
  accuracyBefore: number;
  accuracyAfter?: number;
  
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface IPatternLearner {
  learnFromExtraction(
    extraction: ExtractionResult,
    document: DocumentInfo
  ): Promise<LearnedPattern[]>;
  
  findMatchingPatterns(
    content: string,
    documentType: string
  ): Promise<PatternMatch[]>;
  
  applyPatterns(
    content: string,
    patterns: PatternMatch[]
  ): Promise<PatternApplicationResult>;
  
  updatePatternConfidence(
    patternId: string,
    success: boolean
  ): Promise<void>;
  
  deprecatePattern(patternId: string): Promise<void>;
}

export interface IFeedbackProcessor {
  submitFeedback(feedback: ExtractionFeedback): Promise<void>;
  
  processFeedbackBatch(batch: FeedbackBatch): Promise<FeedbackProcessingResult>;
  
  getFeedbackStats(period: MetricsPeriod): Promise<FeedbackStats>;
  
  generatePatternsFromFeedback(
    feedbacks: ExtractionFeedback[]
  ): Promise<LearnedPattern[]>;
}

export interface ISyntheticGenerator {
  generateExamples(
    category: string,
    count: number,
    complexity?: 'simple' | 'medium' | 'complex'
  ): Promise<SyntheticExample[]>;
  
  augmentFromDocument(
    document: DocumentInfo,
    extraction: ExtractionResult
  ): Promise<SyntheticExample[]>;
  
  generateEdgeCases(
    errorPatterns: ErrorPattern[]
  ): Promise<SyntheticExample[]>;
  
  validateExample(example: SyntheticExample): Promise<ValidationResult>;
}

export interface ICatalogEnricher {
  proposeEnrichment(
    enrichment: Omit<CatalogEnrichment, 'id' | 'createdAt' | 'status'>
  ): Promise<CatalogEnrichment>;
  
  reviewEnrichment(
    enrichmentId: string,
    approved: boolean,
    reviewerId: string
  ): Promise<void>;
  
  applyEnrichment(enrichmentId: string): Promise<void>;
  
  findPotentialEnrichments(
    extractions: ExtractionResult[]
  ): Promise<CatalogEnrichment[]>;
}

export interface IMetricsAggregator {
  recordMetrics(metrics: ExtractionMetrics): Promise<void>;
  
  getAggregatedMetrics(
    period: MetricsPeriod,
    filters?: MetricsFilters
  ): Promise<AggregatedMetrics>;
  
  getAccuracyTrend(
    days: number,
    groupBy?: 'day' | 'week'
  ): Promise<TrendData[]>;
  
  detectAnomalies(): Promise<MetricsAnomaly[]>;
  
  generateReport(period: MetricsPeriod): Promise<MetricsReport>;
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface ExtractionResult {
  id: string;
  items: ExtractedItemTemplate[];
  documentId: string;
  timestamp: Date;
  confidence: number;
}

export interface DocumentInfo {
  id: string;
  name: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface PatternMatch {
  pattern: LearnedPattern;
  matchScore: number;
  matchedRegions: MatchedRegion[];
}

export interface MatchedRegion {
  start: number;
  end: number;
  text: string;
}

export interface PatternApplicationResult {
  applied: boolean;
  extractedValues: Record<string, unknown>;
  confidence: number;
  patternsUsed: string[];
}

export interface FeedbackProcessingResult {
  processed: number;
  patternsGenerated: number;
  enrichmentsProposed: number;
  errors: string[];
}

export interface FeedbackStats {
  total: number;
  byType: Record<FeedbackType, number>;
  processingRate: number;
  avgTimeToProcess: number;
}

export interface ErrorPattern {
  errorType: string;
  frequency: number;
  examples: string[];
  possibleCauses: string[];
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  issues: string[];
}

export interface MetricsFilters {
  documentType?: string;
  sourceType?: string;
  dateRange?: { start: Date; end: Date };
  minAccuracy?: number;
}

export interface MetricsAnomaly {
  type: 'accuracy_drop' | 'volume_spike' | 'error_rate' | 'pattern_failure';
  severity: 'low' | 'medium' | 'high';
  description: string;
  detectedAt: Date;
  affectedMetric: string;
  recommendedAction: string;
}

export interface MetricsReport {
  period: MetricsPeriod;
  generatedAt: Date;
  summary: string;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  data: AggregatedMetrics;
}

// ============================================================================
// Database Schema Types (for Supabase)
// ============================================================================

export interface DbLearnedPattern {
  id: string;
  pattern_type: PatternType;
  source_type: string;
  input_pattern: string;
  output_mapping: OutputMapping;
  confidence: number;
  usage_count: number;
  success_count: number;
  last_used: string;
  created_at: string;
  metadata: PatternMetadata;
}

export interface DbExtractionFeedback {
  id: string;
  extraction_id: string;
  item_index: number;
  feedback_type: FeedbackType;
  original_value: unknown;
  corrected_value: unknown;
  field_name: string;
  user_id: string;
  timestamp: string;
  processed: boolean;
  pattern_generated: boolean;
}

export interface DbExtractionMetrics {
  id: string;
  extraction_id: string;
  document_id: string;
  document_type: string;
  source_type: string;
  items_extracted: number;
  items_approved: number;
  items_corrected: number;
  items_rejected: number;
  extraction_accuracy: number;
  field_accuracy: Record<string, number>;
  avg_confidence: number;
  processing_time_ms: number;
  tokens_used: number;
  rag_context_used: boolean;
  rag_match_count: number;
  rag_avg_similarity: number;
  patterns_applied: number;
  patterns_successful: number;
  timestamp: string;
}

export interface DbSyntheticExample {
  id: string;
  example_type: SyntheticExampleType;
  source_pattern: string | null;
  source_document: string | null;
  input_data: SyntheticInput;
  expected_output: SyntheticOutput;
  category: string;
  industry: string;
  complexity: 'simple' | 'medium' | 'complex';
  used_in_training: number;
  effectiveness: number;
  created_at: string;
  metadata: SyntheticMetadata;
}

export interface DbCatalogEnrichment {
  id: string;
  catalog_type: CatalogType;
  enrichment_type: EnrichmentType;
  entry_id: string | null;
  content: EnrichmentContent;
  source_type: 'pattern' | 'feedback' | 'extraction' | 'manual';
  source_id: string;
  status: EnrichmentStatus;
  confidence: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  applied_at: string | null;
}
