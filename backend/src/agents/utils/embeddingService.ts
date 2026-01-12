/**
 * Embedding Service
 * 
 * Handles vector embeddings generation and semantic search using OpenAI
 * and Supabase pgvector for the THEMIS RAG system.
 */

import { OpenAI } from 'openai';
import { validate as validateUUID } from 'uuid';
import { supabase } from '../../config/supabase';
import crypto from 'crypto';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
export type SourceType = 
  | 'document'
  | 'assessment'
  | 'portfolio_item'
  | 'initiative'
  | 'strategy'
  | 'roadmap'
  | 'budget'
  | 'conversation'
  | 'external'
  // Expert knowledge types for consulting frameworks
  | 'framework'        // McKinsey 7S, BCG Matrix, Gartner frameworks, etc.
  | 'methodology'      // WSJF, SAFe, prioritization methods
  | 'benchmark'        // Industry benchmarks, KPIs, spending ratios
  | 'best_practice'    // Digital transformation, implementation patterns
  // Catalog types for data ingestion normalization
  | 'catalog'          // Generic catalogs
  | 'catalog_it_services'
  | 'catalog_technologies'
  | 'catalog_portfolio_taxonomy'
  | 'catalog_prioritization'
  // Universal catalogs for multi-industry support
  | 'catalog_products'     // Product categories (industrial, consumer, digital)
  | 'catalog_industries'   // Industry verticals
  | 'catalog_entities'     // Business entity types (product, service, initiative)
  | 'catalog_examples';    // Synthetic training examples

export interface EmbeddingMetadata {
  title?: string;
  section?: string;
  tags?: string[];
  priority?: string;
  status?: string;
  author?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface KnowledgeChunk {
  content: string;
  sourceType: SourceType;
  sourceId?: string;
  documentId?: string;
  metadata?: EmbeddingMetadata;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  sourceType: SourceType;
  sourceId: string | null;
  metadata: EmbeddingMetadata;
  similarity: number;
}

export interface SearchOptions {
  sourceTypes?: SourceType[];
  limit?: number;
  similarityThreshold?: number;
  metadata?: Record<string, unknown>;
  // Hybrid search options
  useHybridSearch?: boolean;  // Enable hybrid dense + sparse search
  hybridAlpha?: number;       // Weight for dense vs sparse (0=sparse only, 1=dense only, 0.5=equal)
  rerank?: boolean;           // Enable re-ranking of results
  // Query expansion options
  useQueryExpansion?: boolean; // Enable HyDE (Hypothetical Document Embeddings)
  expandedQueries?: string[];  // Pre-expanded queries (if already generated)
  // Adaptive filtering
  useAdaptiveThreshold?: boolean; // Auto-calculate optimal similarity threshold
}

// Constants
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const DEFAULT_SEARCH_LIMIT = 10;
// Optimized chunking: smaller chunks = better semantic precision
// Research shows 512-1024 chars optimal for most RAG applications
const MAX_CHUNK_SIZE = 1024; // Characters per chunk (reduced from 8000)
const CHUNK_OVERLAP = 128;  // Overlap between chunks (~12.5% overlap)
const MIN_CHUNK_SIZE = 100; // Minimum viable chunk size

// System-wide catalog company id used as fallback when tenant/company id is invalid
export const SYSTEM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

// Hybrid search configuration
const DEFAULT_HYBRID_ALPHA = 0.7; // Favor semantic (0.7) over keyword (0.3)
const BM25_K1 = 1.2; // BM25 term frequency saturation parameter
const BM25_B = 0.75; // BM25 length normalization parameter

export function ensureCompanyId(companyId?: string | null): string {
  if (!companyId) return SYSTEM_COMPANY_ID;
  try {
    return validateUUID(companyId) ? companyId : SYSTEM_COMPANY_ID;
  } catch (e) {
    return SYSTEM_COMPANY_ID;
  }
}

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8191), // Max input length for the model
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[EmbeddingService] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const validTexts = texts.filter(t => t && t.trim().length > 0);
  
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts.map(t => t.slice(0, 8191)),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data.map(d => d.embedding);
  } catch (error) {
    console.error('[EmbeddingService] Error generating batch embeddings:', error);
    throw error;
  }
}

/**
 * Split text into overlapping chunks for embedding with improved semantic boundaries
 *
 * Strategy:
 * 1. Prefer paragraph breaks (double newline)
 * 2. Fall back to sentence breaks (. ! ?)
 * 3. Fall back to word boundaries
 * 4. Maintain minimum chunk size to avoid fragments
 */
export function chunkText(
  text: string,
  maxChunkSize: number = MAX_CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP
): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  if (text.length <= maxChunkSize) {
    return [text.trim()];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Try to break at a natural boundary if not at the end
    if (end < text.length) {
      // Define search window (last 30% of chunk for better boundary detection)
      const searchWindowSize = Math.floor(maxChunkSize * 0.3);
      const searchStart = Math.max(end - searchWindowSize, start);
      const searchText = text.slice(searchStart, end);

      // Priority 1: Look for paragraph break (strongest semantic boundary)
      const paragraphBreak = searchText.lastIndexOf('\n\n');
      if (paragraphBreak !== -1) {
        end = searchStart + paragraphBreak + 2; // Include the newlines
      } else {
        // Priority 2: Look for sentence break
        const sentenceBreak = Math.max(
          searchText.lastIndexOf('. '),
          searchText.lastIndexOf('! '),
          searchText.lastIndexOf('? ')
        );
        if (sentenceBreak !== -1) {
          end = searchStart + sentenceBreak + 2; // Include punctuation and space
        } else {
          // Priority 3: Look for any newline
          const lineBreak = searchText.lastIndexOf('\n');
          if (lineBreak !== -1) {
            end = searchStart + lineBreak + 1;
          } else {
            // Priority 4: Fall back to word boundary
            const wordBreak = searchText.lastIndexOf(' ');
            if (wordBreak !== -1) {
              end = searchStart + wordBreak + 1;
            }
          }
        }
      }
    }

    const chunk = text.slice(start, end).trim();

    // Only add chunks that meet minimum size requirement (avoid fragments)
    if (chunk.length >= MIN_CHUNK_SIZE || chunks.length === 0) {
      chunks.push(chunk);
    } else if (chunks.length > 0) {
      // If chunk is too small, append to previous chunk
      chunks[chunks.length - 1] += ' ' + chunk;
    }

    // Move start pointer with overlap
    start = end - overlap;

    // Prevent infinite loop if we're not making progress
    if (start >= text.length - MIN_CHUNK_SIZE) {
      break;
    }
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Store a knowledge chunk with its embedding
 */
export async function storeEmbedding(
  companyId: string,
  chunk: KnowledgeChunk
): Promise<string> {
  const embedding = await generateEmbedding(chunk.content);
  const safeCompanyId = ensureCompanyId(companyId);

  const { data, error } = await supabase.rpc('upsert_knowledge_embedding', {
    p_company_id: safeCompanyId,
    p_content: chunk.content,
    p_source_type: chunk.sourceType,
    p_embedding: `[${embedding.join(',')}]`,
    p_document_id: chunk.documentId || null,
    p_source_id: chunk.sourceId || null,
    p_metadata: chunk.metadata || {},
    p_chunk_index: chunk.chunkIndex || 0,
    p_total_chunks: chunk.totalChunks || 1,
  });

  if (error) {
    console.error('[EmbeddingService] Error storing embedding:', error);
    throw error;
  }

  return data as string;
}

/**
 * Store multiple knowledge chunks with their embeddings
 */
export async function storeEmbeddings(
  companyId: string,
  chunks: KnowledgeChunk[]
): Promise<string[]> {
  const ids: string[] = [];
  
  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeddings = await generateEmbeddings(batch.map(c => c.content));
    
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];
      const safeCompanyId = ensureCompanyId(companyId);

      const { data, error } = await supabase.rpc('upsert_knowledge_embedding', {
        p_content: chunk.content,
        p_source_type: chunk.sourceType,
        p_embedding: `[${embedding.join(',')}]`,
        p_document_id: chunk.documentId || null,
        p_source_id: chunk.sourceId || null,
        p_metadata: chunk.metadata || {},
        p_chunk_index: chunk.chunkIndex || 0,
        p_total_chunks: chunk.totalChunks || 1,
      });

      if (error) {
        console.error('[EmbeddingService] Error storing embedding:', error);
      } else {
        ids.push(data as string);
      }
    }
  }

  return ids;
}

/**
 * Simple BM25 scoring for keyword-based relevance
 * BM25 is a probabilistic retrieval function that ranks documents based on query terms
 */
function calculateBM25Score(
  queryTerms: string[],
  documentText: string,
  avgDocLength: number = 500
): number {
  const docTerms = documentText.toLowerCase().split(/\s+/);
  const docLength = docTerms.length;
  const termFrequency: Record<string, number> = {};

  // Count term frequencies in document
  docTerms.forEach(term => {
    termFrequency[term] = (termFrequency[term] || 0) + 1;
  });

  let score = 0;

  queryTerms.forEach(queryTerm => {
    const term = queryTerm.toLowerCase();
    const tf = termFrequency[term] || 0;

    if (tf > 0) {
      // BM25 formula: (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)))
      const numerator = tf * (BM25_K1 + 1);
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
      score += numerator / denominator;
    }
  });

  return score;
}

/**
 * Normalize scores to 0-1 range using min-max normalization
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) return scores.map(() => 0.5);

  return scores.map(score => (score - min) / range);
}

/**
 * Extract meaningful query terms (remove stop words)
 */
function extractQueryTerms(query: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'il', 'lo', 'la', 'i', 'gli', 'le',
    'un', 'uno', 'una', 'di', 'da', 'a', 'in', 'con', 'su', 'per', 'tra', 'fra'
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2 && !stopWords.has(term));
}

/**
 * Generate hypothetical document for HyDE (Hypothetical Document Embeddings)
 * This improves retrieval by creating a document that would answer the query,
 * then searching for similar documents to that hypothetical answer.
 */
async function generateHypotheticalDocument(query: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast and cost-effective for this task
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates concise, factual passages that would answer the given question. Write 2-3 sentences that directly address the query with relevant technical details.',
        },
        {
          role: 'user',
          content: `Generate a concise passage (2-3 sentences) that would answer this question:\n\n${query}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content?.trim() || query;
  } catch (error) {
    console.error('[EmbeddingService] Error generating hypothetical document:', error);
    // Fallback to original query
    return query;
  }
}

/**
 * Expand query with multiple search variations for better recall
 */
async function expandQuery(query: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a search query expert. Generate 2-3 alternative phrasings of the given query that capture different aspects or perspectives. Return only the alternative queries, one per line.',
        },
        {
          role: 'user',
          content: `Generate 2-3 alternative phrasings for this search query:\n\n${query}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    const alternatives = response.choices[0]?.message?.content
      ?.trim()
      .split('\n')
      .map(q => q.replace(/^\d+\.\s*/, '').trim())
      .filter(q => q.length > 0) || [];

    return [query, ...alternatives];
  } catch (error) {
    console.error('[EmbeddingService] Error expanding query:', error);
    return [query];
  }
}

/**
 * Multi-query search: executes multiple queries and aggregates results
 * Useful for query expansion and HyDE techniques
 */
async function multiQuerySearch(
  companyId: string,
  queries: string[],
  options: SearchOptions
): Promise<SearchResult[]> {
  if (queries.length === 0) return [];
  if (queries.length === 1) {
    return semanticSearch(companyId, queries[0], options);
  }

  // Execute all queries in parallel
  const allResults = await Promise.all(
    queries.map(q => semanticSearch(companyId, q, options))
  );

  // Aggregate results by ID and average similarity scores
  const resultMap = new Map<string, SearchResult>();

  allResults.forEach(results => {
    results.forEach(result => {
      const existing = resultMap.get(result.id);
      if (existing) {
        // Average the similarity scores
        existing.similarity = (existing.similarity + result.similarity) / 2;
      } else {
        resultMap.set(result.id, { ...result });
      }
    });
  });

  // Sort by aggregated similarity and return top results
  return Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit || DEFAULT_SEARCH_LIMIT);
}

/**
 * Semantic search for relevant knowledge
 */
export async function semanticSearch(
  companyId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    sourceTypes,
    limit = DEFAULT_SEARCH_LIMIT,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    useHybridSearch = false,
    hybridAlpha = DEFAULT_HYBRID_ALPHA,
    useQueryExpansion = false,
    expandedQueries,
  } = options;

  // Ensure companyId is a valid UUID; fall back to system catalog if invalid
  const safeCompanyId = ensureCompanyId(companyId);

  // Query expansion: generate multiple query variations for better recall
  let searchQueries: string[];
  if (useQueryExpansion) {
    if (expandedQueries && expandedQueries.length > 0) {
      // Use pre-expanded queries if provided
      searchQueries = expandedQueries;
    } else {
      // Generate hypothetical document (HyDE) for better semantic matching
      const hydeDoc = await generateHypotheticalDocument(query);
      // Also get alternative phrasings
      const alternatives = await expandQuery(query);
      searchQueries = [hydeDoc, ...alternatives];
    }
  } else {
    searchQueries = [query];
  }

  // If using multiple queries, aggregate results
  if (searchQueries.length > 1) {
    return await multiQuerySearch(
      safeCompanyId,
      searchQueries,
      { ...options, useQueryExpansion: false } // Prevent recursion
    );
  }

  // Single query search (original logic)
  const queryEmbedding = await generateEmbedding(query);

  try {
    // Fetch more results for hybrid search to allow for re-ranking
    const fetchLimit = useHybridSearch ? limit * 3 : limit;

    // Search using the pgvector function
    const { data, error } = await supabase.rpc('search_knowledge_embeddings', {
      p_query_embedding: `[${queryEmbedding.join(',')}]`,
      p_company_id: safeCompanyId,
      p_source_types: sourceTypes || null,
      p_limit: fetchLimit,
      p_similarity_threshold: useHybridSearch ? similarityThreshold * 0.5 : similarityThreshold, // Lower threshold for hybrid
    });

    if (error) {
      // If invalid UUID error (22P02), try again with system company id
      if ((error as any)?.code === '22P02' && safeCompanyId !== SYSTEM_COMPANY_ID) {
        console.warn('[EmbeddingService] Invalid companyId UUID, retrying with system catalog');
        const { data: sysData, error: sysError } = await supabase.rpc('search_knowledge_embeddings', {
          p_query_embedding: `[${queryEmbedding.join(',')}]`,
          p_company_id: SYSTEM_COMPANY_ID,
          p_source_types: sourceTypes || null,
          p_limit: fetchLimit,
          p_similarity_threshold: useHybridSearch ? similarityThreshold * 0.5 : similarityThreshold,
        });

        if (sysError) {
          console.error('[EmbeddingService] Error in semantic search (system fallback):', sysError);
          return [];
        }

        const fallbackResults = (sysData || []).map((row: any) => ({
          id: row.id,
          content: row.content,
          sourceType: row.source_type as SourceType,
          sourceId: row.source_id,
          metadata: row.metadata || {},
          similarity: row.similarity,
        }));

        return useHybridSearch
          ? applyHybridRanking(fallbackResults, query, hybridAlpha, limit)
          : fallbackResults.slice(0, limit);
      }

      console.error('[EmbeddingService] Error in semantic search:', error);
      return [];
    }

    let results: SearchResult[] = (data || []).map((row: any) => ({
      id: row.id,
      content: row.content,
      sourceType: row.source_type as SourceType,
      sourceId: row.source_id,
      metadata: row.metadata || {},
      similarity: row.similarity,
    }));

    // Apply hybrid ranking if enabled
    if (useHybridSearch && results.length > 0) {
      results = applyHybridRanking(results, query, hybridAlpha, limit);
    }

    // Apply adaptive threshold filtering if enabled
    if (options.useAdaptiveThreshold && results.length > 0) {
      results = applyAdaptiveFiltering(results);
    }

    return results.slice(0, limit);
  } catch (err) {
    console.error('[EmbeddingService] Exception in semanticSearch:', err);
    return [];
  }
}

/**
 * Apply hybrid ranking combining dense (semantic) and sparse (keyword) scores
 */
function applyHybridRanking(
  results: SearchResult[],
  query: string,
  alpha: number,
  limit: number
): SearchResult[] {
  if (results.length === 0) return [];

  // Extract query terms for BM25
  const queryTerms = extractQueryTerms(query);

  if (queryTerms.length === 0) {
    // No meaningful terms, fall back to semantic only
    return results.slice(0, limit);
  }

  // Calculate average document length for BM25
  const avgDocLength = results.reduce((sum, r) => sum + r.content.length, 0) / results.length;

  // Calculate BM25 scores for all results
  const bm25Scores = results.map(result =>
    calculateBM25Score(queryTerms, result.content, avgDocLength)
  );

  // Normalize both score types to 0-1 range
  const normalizedSemanticScores = normalizeScores(results.map(r => r.similarity));
  const normalizedBM25Scores = normalizeScores(bm25Scores);

  // Combine scores using alpha weighting
  const hybridResults = results.map((result, index) => ({
    ...result,
    similarity: alpha * normalizedSemanticScores[index] + (1 - alpha) * normalizedBM25Scores[index],
  }));

  // Sort by hybrid score and return top results
  return hybridResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Calculate adaptive similarity threshold using statistical analysis
 * Uses the "elbow method" to find natural cutoff point in similarity scores
 */
function calculateAdaptiveThreshold(similarities: number[]): number {
  if (similarities.length === 0) return DEFAULT_SIMILARITY_THRESHOLD;
  if (similarities.length === 1) return Math.max(similarities[0] * 0.9, 0.5);

  // Sort similarities in descending order
  const sorted = [...similarities].sort((a, b) => b - a);

  // Calculate gaps between consecutive similarities
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i] - sorted[i + 1]);
  }

  if (gaps.length === 0) return DEFAULT_SIMILARITY_THRESHOLD;

  // Find the largest gap (elbow point)
  let maxGapIndex = 0;
  let maxGap = gaps[0];
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i] > maxGap) {
      maxGap = gaps[i];
      maxGapIndex = i;
    }
  }

  // Threshold is just below the elbow point
  const adaptiveThreshold = sorted[maxGapIndex + 1];

  // Ensure threshold is reasonable (between 0.5 and 0.9)
  return Math.min(Math.max(adaptiveThreshold, 0.5), 0.9);
}

/**
 * Filter results using adaptive threshold based on score distribution
 */
function applyAdaptiveFiltering(results: SearchResult[]): SearchResult[] {
  if (results.length <= 2) return results;

  const similarities = results.map(r => r.similarity);
  const threshold = calculateAdaptiveThreshold(similarities);

  return results.filter(r => r.similarity >= threshold);
}

/**
 * Delete embeddings by source
 */
export async function deleteEmbeddingsBySource(
  companyId: string,
  sourceType: SourceType,
  sourceId: string
): Promise<number> {
  const safeCompanyId = ensureCompanyId(companyId);
  const { data, error } = await supabase
    .from('knowledge_embeddings')
    .delete()
    .eq('company_id', safeCompanyId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .select('id');

  if (error) {
    console.error('[EmbeddingService] Error deleting embeddings:', error);
    throw error;
  }

  return data?.length || 0;
}

/**
 * Index a document by splitting it into chunks and storing embeddings
 */
export async function indexDocument(
  companyId: string,
  documentId: string,
  content: string,
  metadata: EmbeddingMetadata = {}
): Promise<string[]> {
  const chunks = chunkText(content);
  
  const knowledgeChunks: KnowledgeChunk[] = chunks.map((chunk, index) => ({
    content: chunk,
    sourceType: 'document' as SourceType,
    sourceId: documentId,
    documentId: documentId,
    metadata: {
      ...metadata,
      chunkIndex: index,
    },
    chunkIndex: index,
    totalChunks: chunks.length,
  }));

  return storeEmbeddings(companyId, knowledgeChunks);
}

/**
 * Index a portfolio item (product/service)
 */
export async function indexPortfolioItem(
  companyId: string,
  item: {
    id: string;
    type: 'product' | 'service';
    name: string;
    description?: string;
    category?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const content = `
Portfolio ${item.type}: ${item.name}
Category: ${item.category || 'N/A'}
Status: ${item.status || 'N/A'}
Description: ${item.description || 'No description'}
  `.trim();

  return storeEmbedding(companyId, {
    content,
    sourceType: 'portfolio_item',
    sourceId: item.id,
    metadata: {
      title: item.name,
      type: item.type,
      category: item.category,
      status: item.status,
      ...item.metadata,
    },
  });
}

/**
 * Index an initiative
 */
export async function indexInitiative(
  companyId: string,
  initiative: {
    id: string;
    name: string;
    description?: string;
    objectives?: string;
    status?: string;
    priority?: string;
    category?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const content = `
Initiative: ${initiative.name}
Status: ${initiative.status || 'N/A'}
Priority: ${initiative.priority || 'N/A'}
Category: ${initiative.category || 'N/A'}
Description: ${initiative.description || 'No description'}
Objectives: ${initiative.objectives || 'No objectives defined'}
  `.trim();

  return storeEmbedding(companyId, {
    content,
    sourceType: 'initiative',
    sourceId: initiative.id,
    metadata: {
      title: initiative.name,
      status: initiative.status,
      priority: initiative.priority,
      ...initiative.metadata,
    },
  });
}

/**
 * Index a conversation message for retrieval
 */
export async function indexConversation(
  companyId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  metadata: EmbeddingMetadata = {}
): Promise<string> {
  const content = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  return storeEmbedding(companyId, {
    content,
    sourceType: 'conversation',
    sourceId: conversationId,
    metadata: {
      messageCount: messages.length,
      ...metadata,
    },
  });
}

/**
 * Get embedding statistics for a company
 */
export async function getEmbeddingStats(companyId: string): Promise<{
  total: number;
  bySourceType: Record<SourceType, number>;
}> {
  const { data, error } = await supabase
    .from('knowledge_embeddings')
    .select('source_type')
    .eq('company_id', companyId);

  if (error) {
    console.error('[EmbeddingService] Error getting stats:', error);
    throw error;
  }

  const bySourceType: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    bySourceType[row.source_type] = (bySourceType[row.source_type] || 0) + 1;
  });

  return {
    total: data?.length || 0,
    bySourceType: bySourceType as Record<SourceType, number>,
  };
}

/**
 * Format search results for LLM context with improved structure and metadata
 */
export function formatSearchResultsForContext(
  results: SearchResult[],
  maxLength: number = 6000, // Increased from 4000 for better context
  options: {
    includeMetadata?: boolean;
    includeSimilarityScores?: boolean;
    groupBySource?: boolean;
    summarize?: boolean;
  } = {}
): string {
  const {
    includeMetadata = true,
    includeSimilarityScores = true,
    groupBySource = false,
    summarize = false,
  } = options;

  if (results.length === 0) {
    return 'No relevant knowledge found in the knowledge base.';
  }

  // Group by source type if requested
  if (groupBySource) {
    return formatGroupedResults(results, maxLength, includeMetadata, includeSimilarityScores);
  }

  let context = '# Retrieved Knowledge\n\n';
  context += `Found ${results.length} relevant ${results.length === 1 ? 'source' : 'sources'}.\n\n`;
  let currentLength = context.length;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const rank = i + 1;

    // Build entry with structured formatting
    let entry = `## Source ${rank}`;

    if (includeSimilarityScores) {
      const relevancePercent = Math.round(result.similarity * 100);
      const relevanceLabel = getRelevanceLabel(result.similarity);
      entry += ` - ${relevancePercent}% match (${relevanceLabel})`;
    }

    entry += '\n\n';

    // Add metadata if available and requested
    if (includeMetadata && result.metadata) {
      const metadataLines: string[] = [];

      if (result.metadata.title) {
        metadataLines.push(`**Title:** ${result.metadata.title}`);
      }

      metadataLines.push(`**Type:** ${formatSourceType(result.sourceType)}`);

      if (result.metadata.category) {
        metadataLines.push(`**Category:** ${result.metadata.category}`);
      }

      if (result.metadata.status) {
        metadataLines.push(`**Status:** ${result.metadata.status}`);
      }

      if (result.metadata.priority) {
        metadataLines.push(`**Priority:** ${result.metadata.priority}`);
      }

      if (result.metadata.tags && Array.isArray(result.metadata.tags) && result.metadata.tags.length > 0) {
        metadataLines.push(`**Tags:** ${result.metadata.tags.join(', ')}`);
      }

      if (metadataLines.length > 0) {
        entry += metadataLines.join('  \n') + '\n\n';
      }
    }

    // Add content
    entry += '**Content:**\n\n';

    // Truncate very long content if needed
    let content = result.content.trim();
    if (summarize && content.length > 500) {
      content = content.slice(0, 497) + '...';
    }

    entry += content + '\n\n';
    entry += '---\n\n';

    // Check if adding this entry would exceed max length
    if (currentLength + entry.length > maxLength) {
      context += `\n*Note: ${results.length - i} additional ${results.length - i === 1 ? 'result' : 'results'} omitted due to length constraints.*\n`;
      break;
    }

    context += entry;
    currentLength += entry.length;
  }

  return context;
}

/**
 * Format grouped results by source type
 */
function formatGroupedResults(
  results: SearchResult[],
  maxLength: number,
  includeMetadata: boolean,
  includeSimilarity: boolean
): string {
  const grouped = new Map<SourceType, SearchResult[]>();

  results.forEach(result => {
    const existing = grouped.get(result.sourceType) || [];
    existing.push(result);
    grouped.set(result.sourceType, existing);
  });

  let context = '# Retrieved Knowledge (Grouped by Type)\n\n';
  let currentLength = context.length;

  for (const [sourceType, sourceResults] of grouped.entries()) {
    let section = `## ${formatSourceType(sourceType)} (${sourceResults.length})\n\n`;

    for (let i = 0; i < sourceResults.length; i++) {
      const result = sourceResults[i];
      let entry = `${i + 1}. `;

      if (includeMetadata && result.metadata.title) {
        entry += `**${result.metadata.title}**`;
      } else {
        entry += `${result.sourceType}`;
      }

      if (includeSimilarity) {
        entry += ` (${Math.round(result.similarity * 100)}%)`;
      }

      entry += `\n   ${result.content.slice(0, 200)}${result.content.length > 200 ? '...' : ''}\n\n`;

      if (currentLength + section.length + entry.length > maxLength) {
        context += `\n*Note: Additional results omitted due to length constraints.*\n`;
        return context;
      }

      section += entry;
    }

    context += section;
    currentLength += section.length;
  }

  return context;
}

/**
 * Get human-readable label for similarity score
 */
function getRelevanceLabel(similarity: number): string {
  if (similarity >= 0.9) return 'Excellent';
  if (similarity >= 0.8) return 'Very Good';
  if (similarity >= 0.7) return 'Good';
  if (similarity >= 0.6) return 'Moderate';
  return 'Fair';
}

/**
 * Format source type for display
 */
function formatSourceType(sourceType: SourceType): string {
  const typeMap: Record<SourceType, string> = {
    document: 'Documents',
    assessment: 'Assessments',
    portfolio_item: 'Portfolio Items',
    initiative: 'Initiatives',
    strategy: 'Strategy Docs',
    roadmap: 'Roadmaps',
    budget: 'Budget Data',
    conversation: 'Past Conversations',
    external: 'External Sources',
    framework: 'Frameworks',
    methodology: 'Methodologies',
    benchmark: 'Benchmarks',
    best_practice: 'Best Practices',
    catalog: 'Catalogs',
    catalog_it_services: 'IT Services',
    catalog_technologies: 'Technologies',
    catalog_portfolio_taxonomy: 'Portfolio Taxonomy',
    catalog_prioritization: 'Prioritization',
    catalog_products: 'Products',
    catalog_industries: 'Industries',
    catalog_entities: 'Business Entities',
    catalog_examples: 'Examples',
  };

  return typeMap[sourceType] || sourceType;
}

export default {
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
};
