/**
 * HITL (Human-in-the-Loop) Types
 *
 * Types for real-time feedback during ingestion process.
 * Allows users to confirm/reject items one batch at a time,
 * with immediate learning context that influences subsequent extractions.
 */

import { NormalizedItem } from '../agents/subagents/ingestion/normalizerAgent';

// ============================================================================
// Session Types
// ============================================================================

export type HITLSessionStatus =
  | 'active'      // Session in progress, waiting for user feedback
  | 'paused'      // User requested pause
  | 'completed'   // All items processed
  | 'cancelled'   // User cancelled session
  | 'batch_mode'; // User switched to batch mode (skip HITL)

export interface HITLSession {
  id: string;
  tenantId: string;
  status: HITLSessionStatus;

  // Item tracking
  originalItems: NormalizedItem[];  // All items before any user modifications (for batch learning)
  confirmedItems: NormalizedItem[];
  rejectedItems: HITLRejectedItem[];
  pendingItems: NormalizedItem[];
  currentBatch: NormalizedItem[];

  // Progress
  currentIndex: number;
  totalEstimated: number;
  batchSize: number;

  // Learning context (built from user feedback)
  context: ImmediateLearningContext;

  // Sampling mode for large files
  samplingMode: boolean;
  samplingThreshold: number;
  sampleSize: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Metrics
  avgResponseTimeMs: number;
  totalFeedbackCount: number;
}

export interface HITLRejectedItem {
  item: NormalizedItem;
  reason?: string;
  rejectedAt: Date;
}

// ============================================================================
// Immediate Learning Context
// ============================================================================

export interface ImmediateLearningContext {
  // Patterns derived from confirmed items
  confirmedPatterns: ConfirmedPattern[];

  // Patterns to avoid (from rejections)
  rejectedPatterns: RejectedPattern[];

  // Type distribution to guide classification
  typeDistribution: {
    products: number;
    services: number;
  };

  // Category patterns observed
  categoryPatterns: Map<string, number>; // category -> occurrence count

  // Cached prompt for LLM injection
  contextPrompt: string;

  // Stats
  totalConfirmed: number;
  totalRejected: number;
  lastUpdated: Date;
}

export interface ConfirmedPattern {
  field: string;           // e.g., "type", "category", "status"
  originalValue: string;   // Value extracted by AI
  confirmedValue: string;  // Value confirmed by user (may be modified)
  occurrences: number;     // How many times this pattern appeared
  confidence: number;      // Derived confidence (occurrences / total)
}

export interface RejectedPattern {
  field: string;
  value: string;
  reason?: string;
  occurrences: number;
}

// ============================================================================
// Feedback Types
// ============================================================================

export type HITLFeedbackType = 'confirm' | 'reject' | 'modify' | 'skip';

export interface HITLFeedback {
  id: string;
  sessionId: string;
  itemId: string;
  action: HITLFeedbackType;

  // Original item as extracted
  originalItem: NormalizedItem;

  // Modified item (if action is 'confirm' with modifications)
  modifiedItem?: Partial<NormalizedItem>;

  // Rejection reason (if action is 'reject')
  reason?: string;

  // Response time (for UX metrics)
  responseTimeMs: number;

  // Timestamp
  createdAt: Date;
}

export interface HITLBatchFeedback {
  sessionId: string;
  feedbacks: HITLFeedback[];
  continueProcessing: boolean;
}

// ============================================================================
// SSE Event Types
// ============================================================================

export type HITLEventType =
  | 'session_start'
  | 'batch'
  | 'progress'
  | 'waiting_feedback'
  | 'sampling_proposal'
  | 'complete'
  | 'error';

export interface HITLSessionStartEvent {
  sessionId: string;
  totalEstimated: number;
  batchSize: number;
  mode: 'hitl';
  samplingMode: boolean;
}

export interface HITLBatchEvent {
  items: NormalizedItem[];
  batchIndex: number;
  totalBatches: number;
  processed: number;
  total: number;
}

export interface HITLProgressEvent {
  phase: 'parsing' | 'normalizing' | 'waiting_feedback' | 'applying_patterns';
  message: string;
  percent: number;
  currentFile?: string;
}

export interface HITLSamplingProposalEvent {
  sampledItems: number;
  remainingItems: number;
  confirmedPatterns: ConfirmedPattern[];
  question: string; // "Apply these patterns to remaining X items?"
}

export interface HITLCompleteEvent {
  sessionId: string;
  stats: {
    totalProcessed: number;
    confirmed: number;
    rejected: number;
    skipped: number;
    avgConfidence: number;
    avgResponseTimeMs: number;
    processingTimeMs: number;
  };
  confirmedItems: NormalizedItem[];
  appliedPatterns: ConfirmedPattern[];
}

export interface HITLErrorEvent {
  code: string;
  message: string;
  recoverable: boolean;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface HITLStartRequest {
  tenantId: string;
  files?: Express.Multer.File[];
  text?: string;
  userContext?: string;
  preferredType?: 'product' | 'service' | 'mixed';
  batchSize?: number; // Default: 5
  samplingThreshold?: number; // Default: 50
  sampleSize?: number; // Default: 15
}

export interface HITLConfirmRequest {
  itemIds: string[];
  modifications?: Record<string, Partial<NormalizedItem>>; // itemId -> modifications
}

export interface HITLRejectRequest {
  itemIds: string[];
  reasons?: Record<string, string>; // itemId -> reason
}

export interface HITLSkipAllRequest {
  applyLearnedPatterns: boolean;
}

export interface HITLSessionResponse {
  session: HITLSession;
  message: string;
}

// ============================================================================
// Context Builder Types
// ============================================================================

export interface ContextPromptOptions {
  maxExamples: number;
  includeRejections: boolean;
  includeTypeDistribution: boolean;
  language: 'it' | 'en';
}

// ============================================================================
// Utility Functions (inline for type safety)
// ============================================================================

export function createEmptyContext(): ImmediateLearningContext {
  return {
    confirmedPatterns: [],
    rejectedPatterns: [],
    typeDistribution: { products: 0, services: 0 },
    categoryPatterns: new Map(),
    contextPrompt: '',
    totalConfirmed: 0,
    totalRejected: 0,
    lastUpdated: new Date(),
  };
}

export function createEmptySession(
  tenantId: string,
  sessionId: string,
  options?: Partial<Pick<HITLSession, 'batchSize' | 'samplingThreshold' | 'sampleSize'>>
): HITLSession {
  return {
    id: sessionId,
    tenantId,
    status: 'active',
    originalItems: [],
    confirmedItems: [],
    rejectedItems: [],
    pendingItems: [],
    currentBatch: [],
    currentIndex: 0,
    totalEstimated: 0,
    batchSize: options?.batchSize ?? 5,
    context: createEmptyContext(),
    samplingMode: false,
    samplingThreshold: options?.samplingThreshold ?? 50,
    sampleSize: options?.sampleSize ?? 15,
    createdAt: new Date(),
    updatedAt: new Date(),
    avgResponseTimeMs: 0,
    totalFeedbackCount: 0,
  };
}
