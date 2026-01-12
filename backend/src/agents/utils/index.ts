/**
 * Agent Utilities Index
 * 
 * Centralized exports for all agent utility modules
 */

// Context Loader - Shared data loading for all agents
export {
  loadAgentContext,
  loadAssessmentSnapshot,
  loadPortfolioItems,
  loadPortfolioAssessment,
  loadRoadmap,
  loadBudgetOptimization,
  loadStrategyAnalysis,
  buildContextSummary,
  validateContextForStep,
  type AgentContext,
  type ContextLoadOptions,
  type PortfolioItem,
  type AssessmentSnapshot,
} from './contextLoader';

// Embedding Service - RAG and semantic search
export {
  generateEmbedding,
  generateEmbeddings,
  chunkText,
  storeEmbedding,
  storeEmbeddings,
  semanticSearch,
  deleteEmbeddingsBySource,
  indexDocument,
  indexPortfolioItem,
  indexInitiative,
  indexConversation,
  getEmbeddingStats,
  formatSearchResultsForContext,
  type SourceType,
  type EmbeddingMetadata,
  type KnowledgeChunk,
  type SearchResult,
  type SearchOptions,
} from './embeddingService';

// Conversation Memory - Persistent chat history
export {
  createSession,
  getSession,
  listSessions,
  addMessage,
  getMessages,
  getMemoryWindow,
  formatMemoryForContext,
  deleteSession,
  clearSessionMessages,
  searchConversations,
  type ConversationMessage,
  type ConversationSession,
  type MemoryWindow,
} from './conversationMemory';

// Expert Knowledge Loader - Consulting frameworks and methodologies
export {
  loadExpertKnowledge,
  loadFrameworkByName,
  loadIndustryBenchmarks,
  loadPrioritizationMethodology,
  loadTransformationBestPractices,
  loadPortfolioFrameworks,
  loadStrategicFrameworks,
  createExpertEnhancedPrompt,
  type ExpertKnowledgeCategory,
  type ExpertKnowledgeContext,
  type ExpertKnowledgeOptions,
} from './expertKnowledgeLoader';

export default {
  // Quick reference to main functions
  loadAgentContext: () => import('./contextLoader').then(m => m.loadAgentContext),
  semanticSearch: () => import('./embeddingService').then(m => m.semanticSearch),
  getMemoryWindow: () => import('./conversationMemory').then(m => m.getMemoryWindow),
  loadExpertKnowledge: () => import('./expertKnowledgeLoader').then(m => m.loadExpertKnowledge),
};
