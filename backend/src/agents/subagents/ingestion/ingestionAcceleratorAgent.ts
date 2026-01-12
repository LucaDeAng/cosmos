/**
 * Ingestion Accelerator Agent
 *
 * High-performance agent that accelerates the data ingestion pipeline through:
 * 1. Parallel chunk processing (pLimit concurrency control)
 * 2. Multi-tier caching (L1 memory, L2 Supabase)
 * 3. Batch LLM calls for normalization
 * 4. O(n log n) deduplication using MinHash LSH
 * 5. Adaptive model selection (gpt-4o-mini default, gpt-4o only when needed)
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { SubAgent, SubAgentResult } from '../types';
import type { NormalizedItem } from './normalizerAgent';
import { supabase } from '../../../config/supabase';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ACCELERATOR_CONFIG = {
  // Parallel processing
  maxConcurrentChunks: 5,        // Process 5 chunks simultaneously
  chunkSize: 10000,              // Characters per chunk
  chunkOverlap: 800,             // Overlap between chunks

  // Batching
  batchSize: 10,                 // Items per LLM batch call
  maxBatchTokens: 6000,          // Max tokens per batch

  // Caching
  l1CacheTTL: 300000,            // 5 minutes memory cache
  l2CacheTTL: 86400000,          // 24 hours Supabase cache

  // Model selection
  defaultModel: 'gpt-4o-mini',
  complexModel: 'gpt-4o',
  complexityThreshold: 0.7,      // Use complex model above this threshold

  // Deduplication
  minhashBands: 20,              // LSH bands
  minhashRows: 5,                // Rows per band
  similarityThreshold: 0.75,    // Dedup threshold

  // Performance
  maxItemsPerSecond: 50,         // Rate limiting
};

// ============================================================================
// TYPES
// ============================================================================

export interface AcceleratorInput {
  tenantId: string;
  content: string | Buffer;
  contentType: 'text' | 'pdf' | 'csv' | 'excel';
  fileName?: string;
  options?: AcceleratorOptions;
}

export interface AcceleratorOptions {
  enableParallelProcessing?: boolean;
  enableCaching?: boolean;
  enableBatching?: boolean;
  enableSmartDedup?: boolean;
  maxConcurrency?: number;
  forceModel?: 'gpt-4o-mini' | 'gpt-4o';
}

export interface AcceleratorOutput {
  items: NormalizedItem[];
  metrics: AcceleratorMetrics;
  cacheStats: CacheStats;
  dedupStats: DedupStats;
}

export interface AcceleratorMetrics {
  totalProcessingTime: number;
  chunksProcessed: number;
  parallelSpeedup: number;        // Estimated speedup vs sequential
  tokensUsed: number;
  modelCalls: number;
  itemsPerSecond: number;
}

export interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  hitRate: number;
}

export interface DedupStats {
  totalItems: number;
  uniqueItems: number;
  duplicatesRemoved: number;
  processingTime: number;
  algorithmUsed: 'lsh' | 'bruteforce';
}

// ============================================================================
// MULTI-TIER CACHE
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class MultiTierCache {
  private l1Cache: Map<string, CacheEntry<unknown>> = new Map();
  private l1Hits = 0;
  private l1Misses = 0;
  private l2Hits = 0;
  private l2Misses = 0;
  private l2Enabled: boolean;

  // Supabase cache table name
  private static readonly L2_TABLE = 'ingestion_cache';

  constructor(enableL2 = process.env.USE_L2_CACHE === 'true') {
    this.l2Enabled = enableL2 && !!supabase;
    if (this.l2Enabled) {
      console.log('🗄️ [CACHE] L2 Supabase cache enabled');
    }
  }

  private generateKey(prefix: string, data: string): string {
    return `${prefix}:${createHash('sha256').update(data).digest('hex').slice(0, 16)}`;
  }

  async get<T>(prefix: string, data: string): Promise<T | null> {
    const key = this.generateKey(prefix, data);

    // Check L1 (memory)
    const l1Entry = this.l1Cache.get(key) as CacheEntry<T> | undefined;
    if (l1Entry && Date.now() - l1Entry.timestamp < l1Entry.ttl) {
      this.l1Hits++;
      return l1Entry.value;
    }
    this.l1Misses++;

    // Check L2 (Supabase) if enabled
    if (this.l2Enabled) {
      try {
        const { data: row, error } = await supabase
          .from(MultiTierCache.L2_TABLE)
          .select('value, expires_at')
          .eq('cache_key', key)
          .single();

        if (!error && row && new Date(row.expires_at) > new Date()) {
          this.l2Hits++;
          const parsedValue = JSON.parse(row.value) as T;

          // Promote to L1 cache
          this.l1Cache.set(key, {
            value: parsedValue,
            timestamp: Date.now(),
            ttl: ACCELERATOR_CONFIG.l1CacheTTL,
          });

          return parsedValue;
        }
      } catch (e) {
        // L2 cache miss or error - continue without cache
        console.debug(`[CACHE] L2 get error for ${key}:`, e);
      }
    }
    this.l2Misses++;

    return null;
  }

  async set<T>(prefix: string, data: string, value: T, ttl?: number): Promise<void> {
    const key = this.generateKey(prefix, data);
    const effectiveTTL = ttl || ACCELERATOR_CONFIG.l1CacheTTL;

    // Set in L1
    this.l1Cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: effectiveTTL,
    });

    // Set in L2 (Supabase) if enabled - fire and forget
    if (this.l2Enabled) {
      const expiresAt = new Date(Date.now() + ACCELERATOR_CONFIG.l2CacheTTL);
      supabase
        .from(MultiTierCache.L2_TABLE)
        .upsert({
          cache_key: key,
          value: JSON.stringify(value),
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        }, { onConflict: 'cache_key' })
        .then(({ error }) => {
          if (error) {
            console.debug(`[CACHE] L2 set error for ${key}:`, error);
          }
        });
    }

    // Cleanup old entries periodically
    if (this.l1Cache.size > 1000) {
      this.cleanup();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.l1Cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.l1Cache.delete(key);
      }
    }
  }

  getStats(): CacheStats {
    const total = this.l1Hits + this.l1Misses;
    return {
      l1Hits: this.l1Hits,
      l1Misses: this.l1Misses,
      l2Hits: this.l2Hits,
      l2Misses: this.l2Misses,
      hitRate: total > 0 ? (this.l1Hits + this.l2Hits) / total : 0,
    };
  }

  reset(): void {
    this.l1Hits = 0;
    this.l1Misses = 0;
    this.l2Hits = 0;
    this.l2Misses = 0;
  }
}

// ============================================================================
// MINHASH LSH DEDUPLICATION (O(n log n))
// ============================================================================

class MinHashLSH {
  private numHashes: number;
  private bands: number;
  private rows: number;
  private hashCoefficients: { a: number; b: number }[];
  private buckets: Map<string, Set<number>> = new Map();

  constructor(bands = ACCELERATOR_CONFIG.minhashBands, rows = ACCELERATOR_CONFIG.minhashRows) {
    this.bands = bands;
    this.rows = rows;
    this.numHashes = bands * rows;
    this.hashCoefficients = this.generateHashCoefficients();
  }

  private generateHashCoefficients(): { a: number; b: number }[] {
    const coefficients: { a: number; b: number }[] = [];
    const prime = 2147483647; // Large prime

    for (let i = 0; i < this.numHashes; i++) {
      coefficients.push({
        a: Math.floor(Math.random() * prime),
        b: Math.floor(Math.random() * prime),
      });
    }
    return coefficients;
  }

  private shingle(text: string, k = 3): Set<string> {
    const shingles = new Set<string>();
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

    for (let i = 0; i <= normalized.length - k; i++) {
      shingles.add(normalized.slice(i, i + k));
    }
    return shingles;
  }

  private computeMinHash(shingles: Set<string>): number[] {
    const signature = new Array(this.numHashes).fill(Infinity);
    const prime = 2147483647;

    for (const shingle of shingles) {
      // Simple hash of shingle
      let hash = 0;
      for (let i = 0; i < shingle.length; i++) {
        hash = ((hash << 5) - hash + shingle.charCodeAt(i)) | 0;
      }
      hash = Math.abs(hash);

      // Compute all hash functions
      for (let i = 0; i < this.numHashes; i++) {
        const { a, b } = this.hashCoefficients[i];
        const hashValue = (a * hash + b) % prime;
        signature[i] = Math.min(signature[i], hashValue);
      }
    }

    return signature;
  }

  private getBandHashes(signature: number[]): string[] {
    const bandHashes: string[] = [];

    for (let b = 0; b < this.bands; b++) {
      const start = b * this.rows;
      const bandSlice = signature.slice(start, start + this.rows);
      const bandHash = bandSlice.join(':');
      bandHashes.push(`${b}:${createHash('md5').update(bandHash).digest('hex').slice(0, 12)}`);
    }

    return bandHashes;
  }

  indexItem(itemIndex: number, text: string): void {
    const shingles = this.shingle(text);
    const signature = this.computeMinHash(shingles);
    const bandHashes = this.getBandHashes(signature);

    for (const hash of bandHashes) {
      if (!this.buckets.has(hash)) {
        this.buckets.set(hash, new Set());
      }
      this.buckets.get(hash)!.add(itemIndex);
    }
  }

  findCandidates(itemIndex: number, text: string): Set<number> {
    const shingles = this.shingle(text);
    const signature = this.computeMinHash(shingles);
    const bandHashes = this.getBandHashes(signature);

    const candidates = new Set<number>();

    for (const hash of bandHashes) {
      const bucket = this.buckets.get(hash);
      if (bucket) {
        for (const idx of bucket) {
          if (idx !== itemIndex) {
            candidates.add(idx);
          }
        }
      }
    }

    return candidates;
  }

  estimateSimilarity(text1: string, text2: string): number {
    const shingles1 = this.shingle(text1);
    const shingles2 = this.shingle(text2);

    const sig1 = this.computeMinHash(shingles1);
    const sig2 = this.computeMinHash(shingles2);

    let matches = 0;
    for (let i = 0; i < this.numHashes; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }

    return matches / this.numHashes;
  }

  clear(): void {
    this.buckets.clear();
  }
}

// ============================================================================
// PARALLEL CHUNK PROCESSOR
// ============================================================================

interface ChunkResult {
  chunkIndex: number;
  items: RawExtractedItem[];
  tokens: number;
  processingTime: number;
  model: string;
}

interface RawExtractedItem {
  name: string;
  description?: string;
  type?: string;
  vendor?: string;
  category?: string;
  status?: string;
  budget?: number;
  confidence?: number;
  rawData?: Record<string, unknown>;
}

class ParallelChunkProcessor {
  private model: ChatOpenAI;
  private complexModel: ChatOpenAI;
  private cache: MultiTierCache;
  private activePromises = 0;
  private tokensUsed = 0;
  private modelCalls = 0;

  constructor(cache: MultiTierCache) {
    this.cache = cache;

    this.model = new ChatOpenAI({
      modelName: ACCELERATOR_CONFIG.defaultModel,
      temperature: 0.1,
      maxTokens: 4000,
    });

    this.complexModel = new ChatOpenAI({
      modelName: ACCELERATOR_CONFIG.complexModel,
      temperature: 0.1,
      maxTokens: 4000,
    });
  }

  async processChunksParallel(
    chunks: string[],
    maxConcurrency: number = ACCELERATOR_CONFIG.maxConcurrentChunks
  ): Promise<ChunkResult[]> {
    const results: ChunkResult[] = [];
    const queue = chunks.map((chunk, index) => ({ chunk, index }));

    // Simple parallel processing with concurrency limit
    const processNext = async (): Promise<void> => {
      while (queue.length > 0 && this.activePromises < maxConcurrency) {
        const item = queue.shift();
        if (!item) break;

        this.activePromises++;

        try {
          const result = await this.processChunk(item.chunk, item.index);
          results.push(result);
        } catch (error) {
          console.error(`Error processing chunk ${item.index}:`, error);
          results.push({
            chunkIndex: item.index,
            items: [],
            tokens: 0,
            processingTime: 0,
            model: 'error',
          });
        } finally {
          this.activePromises--;
        }
      }
    };

    // Start initial batch
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(maxConcurrency, chunks.length); i++) {
      workers.push(this.processChunkQueue(queue, results, maxConcurrency));
    }

    await Promise.all(workers);

    return results.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  private async processChunkQueue(
    queue: { chunk: string; index: number }[],
    results: ChunkResult[],
    maxConcurrency: number
  ): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      try {
        const result = await this.processChunk(item.chunk, item.index);
        results.push(result);
      } catch (error) {
        console.error(`Error processing chunk ${item.index}:`, error);
        results.push({
          chunkIndex: item.index,
          items: [],
          tokens: 0,
          processingTime: 0,
          model: 'error',
        });
      }
    }
  }

  private async processChunk(chunk: string, index: number): Promise<ChunkResult> {
    const startTime = Date.now();

    // Check cache first
    const cachedResult = await this.cache.get<RawExtractedItem[]>('chunk', chunk);
    if (cachedResult) {
      return {
        chunkIndex: index,
        items: cachedResult,
        tokens: 0,
        processingTime: Date.now() - startTime,
        model: 'cached',
      };
    }

    // Determine complexity
    const complexity = this.estimateComplexity(chunk);
    const selectedModel = complexity > ACCELERATOR_CONFIG.complexityThreshold
      ? this.complexModel
      : this.model;
    const modelName = complexity > ACCELERATOR_CONFIG.complexityThreshold
      ? ACCELERATOR_CONFIG.complexModel
      : ACCELERATOR_CONFIG.defaultModel;

    try {
      const response = await selectedModel.invoke([
        new SystemMessage(CHUNK_EXTRACTION_PROMPT),
        new HumanMessage(`Extract items from this content:\n\n${chunk}`),
      ]);

      this.modelCalls++;

      const responseText = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      const items = this.parseChunkResponse(responseText);

      // Estimate tokens (rough approximation)
      const tokens = Math.ceil((chunk.length + responseText.length) / 4);
      this.tokensUsed += tokens;

      // Cache the result
      await this.cache.set('chunk', chunk, items);

      return {
        chunkIndex: index,
        items,
        tokens,
        processingTime: Date.now() - startTime,
        model: modelName,
      };
    } catch (error) {
      console.error('Chunk processing error:', error);
      return {
        chunkIndex: index,
        items: [],
        tokens: 0,
        processingTime: Date.now() - startTime,
        model: 'error',
      };
    }
  }

  private estimateComplexity(chunk: string): number {
    let complexity = 0;

    // Table detection
    if (chunk.includes('|') || chunk.includes('\t\t') || /\d+\s+\d+\s+\d+/.test(chunk)) {
      complexity += 0.3;
    }

    // Multiple languages
    if (/[àèìòù]/.test(chunk) && /[a-z]{5,}/i.test(chunk)) {
      complexity += 0.1;
    }

    // Technical content
    if (/API|SDK|SQL|HTTP|JSON|XML/i.test(chunk)) {
      complexity += 0.15;
    }

    // Dense text
    const wordCount = chunk.split(/\s+/).length;
    const sentenceCount = chunk.split(/[.!?]+/).length;
    if (wordCount / sentenceCount > 25) {
      complexity += 0.2;
    }

    // Numeric data heavy
    const numberMatches = chunk.match(/\d+/g) || [];
    if (numberMatches.length > 20) {
      complexity += 0.15;
    }

    return Math.min(complexity, 1);
  }

  private parseChunkResponse(response: string): RawExtractedItem[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.items || [];
      }

      const arrayMatch = response.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }

      return [];
    } catch {
      return [];
    }
  }

  getMetrics(): { tokensUsed: number; modelCalls: number } {
    return {
      tokensUsed: this.tokensUsed,
      modelCalls: this.modelCalls,
    };
  }

  reset(): void {
    this.tokensUsed = 0;
    this.modelCalls = 0;
  }
}

// ============================================================================
// BATCH NORMALIZER
// ============================================================================

class BatchNormalizer {
  private model: ChatOpenAI;
  private cache: MultiTierCache;

  constructor(cache: MultiTierCache) {
    this.cache = cache;
    this.model = new ChatOpenAI({
      modelName: ACCELERATOR_CONFIG.defaultModel,
      temperature: 0,
      maxTokens: 4000,
    });
  }

  async normalizeBatch(items: RawExtractedItem[]): Promise<NormalizedItem[]> {
    if (items.length === 0) return [];

    const normalizedItems: NormalizedItem[] = [];
    const batches = this.createBatches(items);

    for (const batch of batches) {
      // Check if entire batch is cached
      const batchKey = batch.map(i => i.name).join('|');
      const cachedBatch = await this.cache.get<NormalizedItem[]>('norm-batch', batchKey);

      if (cachedBatch) {
        normalizedItems.push(...cachedBatch);
        continue;
      }

      // Process batch with LLM
      const batchResult = await this.processBatch(batch);
      normalizedItems.push(...batchResult);

      // Cache the result
      await this.cache.set('norm-batch', batchKey, batchResult);
    }

    return normalizedItems;
  }

  private createBatches(items: RawExtractedItem[]): RawExtractedItem[][] {
    const batches: RawExtractedItem[][] = [];

    for (let i = 0; i < items.length; i += ACCELERATOR_CONFIG.batchSize) {
      batches.push(items.slice(i, i + ACCELERATOR_CONFIG.batchSize));
    }

    return batches;
  }

  private async processBatch(batch: RawExtractedItem[]): Promise<NormalizedItem[]> {
    const batchJson = JSON.stringify(batch, null, 2);

    try {
      const response = await this.model.invoke([
        new SystemMessage(BATCH_NORMALIZATION_PROMPT),
        new HumanMessage(`Normalize these ${batch.length} items:\n\n${batchJson}`),
      ]);

      const responseText = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      return this.parseNormalizedBatch(responseText, batch);
    } catch (error) {
      console.error('Batch normalization error:', error);
      // Fallback: simple normalization without LLM
      return batch.map(item => this.simplifyNormalize(item));
    }
  }

  private parseNormalizedBatch(response: string, originalBatch: RawExtractedItem[]): NormalizedItem[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((item: Record<string, unknown>, idx: number) =>
          this.ensureNormalizedFields(item, originalBatch[idx])
        );
      }

      // Fallback
      return originalBatch.map(item => this.simplifyNormalize(item));
    } catch {
      return originalBatch.map(item => this.simplifyNormalize(item));
    }
  }

  private ensureNormalizedFields(item: Record<string, unknown>, original: RawExtractedItem): NormalizedItem {
    return {
      id: uuidv4(),
      name: (item.name as string) || original.name || 'Unknown',
      description: (item.description as string) || original.description || '',
      type: this.normalizeType((item.type as string) || original.type),
      vendor: (item.vendor as string) || original.vendor || 'Unknown',
      category: (item.category as string) || original.category || 'General',
      status: this.normalizeStatus((item.status as string) || original.status),
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
      extraction_metadata: {
        source_type: 'text_block' as const,
        original_text: original.name,
      },
    };
  }

  private simplifyNormalize(item: RawExtractedItem): NormalizedItem {
    return {
      id: uuidv4(),
      name: item.name || 'Unknown',
      description: item.description || '',
      type: this.normalizeType(item.type),
      vendor: item.vendor || 'Unknown',
      category: item.category || 'General',
      status: this.normalizeStatus(item.status),
      confidence: item.confidence || 0.7,
      extraction_metadata: {
        source_type: 'text_block' as const,
        original_text: item.name,
      },
    };
  }

  private normalizeType(type?: string): 'product' | 'service' {
    if (!type) return 'product';
    const lower = type.toLowerCase();
    if (lower.includes('service') || lower.includes('servizio')) return 'service';
    return 'product';
  }

  private normalizeStatus(status?: string): 'active' | 'completed' | 'paused' | 'cancelled' | 'proposed' {
    if (!status) return 'active';
    const lower = status.toLowerCase();
    // Map old status values to new schema
    if (lower.includes('deprec') || lower.includes('dismiss')) return 'cancelled';
    if (lower.includes('plan') || lower.includes('futur') || lower.includes('proposed')) return 'proposed';
    if (lower.includes('inactiv') || lower.includes('disabled') || lower.includes('paused')) return 'paused';
    if (lower.includes('complet') || lower.includes('finish')) return 'completed';
    return 'active';
  }
}

// ============================================================================
// SMART DEDUPLICATOR
// ============================================================================

class SmartDeduplicator {
  private lsh: MinHashLSH;
  private threshold: number;

  constructor(threshold = ACCELERATOR_CONFIG.similarityThreshold) {
    this.lsh = new MinHashLSH();
    this.threshold = threshold;
  }

  async deduplicate(items: NormalizedItem[]): Promise<{
    uniqueItems: NormalizedItem[];
    stats: DedupStats;
  }> {
    const startTime = Date.now();

    if (items.length < 100) {
      // For small datasets, use brute force (more accurate)
      return this.bruteForceDedup(items, startTime);
    }

    // For large datasets, use LSH (O(n log n) average case)
    return this.lshDedup(items, startTime);
  }

  private bruteForceDedup(items: NormalizedItem[], startTime: number): {
    uniqueItems: NormalizedItem[];
    stats: DedupStats;
  } {
    const uniqueItems: NormalizedItem[] = [];
    const seen = new Set<number>();

    for (let i = 0; i < items.length; i++) {
      if (seen.has(i)) continue;

      let isDuplicate = false;
      for (let j = 0; j < uniqueItems.length; j++) {
        const similarity = this.calculateSimilarity(items[i], uniqueItems[j]);
        if (similarity >= this.threshold) {
          isDuplicate = true;
          // Keep the one with higher confidence
          if ((items[i].confidence || 0) > (uniqueItems[j].confidence || 0)) {
            uniqueItems[j] = items[i];
          }
          break;
        }
      }

      if (!isDuplicate) {
        uniqueItems.push(items[i]);
      }
      seen.add(i);
    }

    return {
      uniqueItems,
      stats: {
        totalItems: items.length,
        uniqueItems: uniqueItems.length,
        duplicatesRemoved: items.length - uniqueItems.length,
        processingTime: Date.now() - startTime,
        algorithmUsed: 'bruteforce',
      },
    };
  }

  private lshDedup(items: NormalizedItem[], startTime: number): {
    uniqueItems: NormalizedItem[];
    stats: DedupStats;
  } {
    this.lsh.clear();

    // Index all items
    for (let i = 0; i < items.length; i++) {
      const text = this.itemToText(items[i]);
      this.lsh.indexItem(i, text);
    }

    const uniqueIndices = new Set<number>();
    const duplicateOf = new Map<number, number>(); // Maps duplicate index to canonical index

    for (let i = 0; i < items.length; i++) {
      if (duplicateOf.has(i)) continue;

      const text = this.itemToText(items[i]);
      const candidates = this.lsh.findCandidates(i, text);

      // Check candidates for actual similarity
      for (const candidateIdx of candidates) {
        if (candidateIdx <= i || duplicateOf.has(candidateIdx)) continue;

        const candidateText = this.itemToText(items[candidateIdx]);
        const similarity = this.lsh.estimateSimilarity(text, candidateText);

        if (similarity >= this.threshold) {
          // Mark as duplicate
          if ((items[candidateIdx].confidence || 0) > (items[i].confidence || 0)) {
            duplicateOf.set(i, candidateIdx);
          } else {
            duplicateOf.set(candidateIdx, i);
          }
        }
      }

      if (!duplicateOf.has(i)) {
        uniqueIndices.add(i);
      }
    }

    // Handle items that became canonical from duplicates
    for (const [dupIdx, canonicalIdx] of duplicateOf) {
      if (!duplicateOf.has(canonicalIdx)) {
        uniqueIndices.add(canonicalIdx);
      }
    }

    const uniqueItems = Array.from(uniqueIndices).map(idx => items[idx]);

    return {
      uniqueItems,
      stats: {
        totalItems: items.length,
        uniqueItems: uniqueItems.length,
        duplicatesRemoved: items.length - uniqueItems.length,
        processingTime: Date.now() - startTime,
        algorithmUsed: 'lsh',
      },
    };
  }

  private itemToText(item: NormalizedItem): string {
    return `${item.name} ${item.description || ''} ${item.vendor || ''} ${item.category || ''}`.toLowerCase();
  }

  private calculateSimilarity(a: NormalizedItem, b: NormalizedItem): number {
    const textA = this.itemToText(a);
    const textB = this.itemToText(b);

    // Jaccard similarity on word sets
    const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 2));

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

// ============================================================================
// PROMPTS
// ============================================================================

const CHUNK_EXTRACTION_PROMPT = `You are an expert at extracting IT portfolio items from documents.

Extract ALL products, services, applications, systems, or software mentioned.

Return ONLY valid JSON in this format:
{
  "items": [
    {
      "name": "Item name",
      "description": "Brief description",
      "type": "product|service",
      "vendor": "Vendor name if mentioned",
      "category": "Category (e.g., ERP, CRM, Security, Cloud)",
      "status": "active|deprecated|planned"
    }
  ]
}

Rules:
- Extract EVERY item, even partially described
- Preserve original names
- Infer vendor from context if not explicit
- Use "Unknown" for missing vendors
- Default type is "product"
- Default status is "active"`;

const BATCH_NORMALIZATION_PROMPT = `You are a data normalization expert.

Normalize the following IT portfolio items to ensure consistent formatting.

For each item, return normalized values:
- name: Clean, standardized name (remove extra spaces, fix capitalization)
- description: Concise description (max 200 chars)
- type: "product" or "service"
- vendor: Standardized vendor name (e.g., "Microsoft" not "MS", "MSFT")
- category: Standardized category from: ERP, CRM, Security, Cloud, Infrastructure, Database, Analytics, Collaboration, Development, Other
- status: "active", "inactive", "deprecated", or "planned"
- confidence: 0-1 score based on data completeness

Return a JSON array with the normalized items.`;

// ============================================================================
// MAIN AGENT CLASS
// ============================================================================

class IngestionAcceleratorAgent {
  private cache: MultiTierCache;
  private chunkProcessor: ParallelChunkProcessor;
  private batchNormalizer: BatchNormalizer;
  private deduplicator: SmartDeduplicator;

  constructor() {
    this.cache = new MultiTierCache();
    this.chunkProcessor = new ParallelChunkProcessor(this.cache);
    this.batchNormalizer = new BatchNormalizer(this.cache);
    this.deduplicator = new SmartDeduplicator();
  }

  async accelerateIngestion(input: AcceleratorInput): Promise<AcceleratorOutput> {
    const startTime = Date.now();
    console.log('🚀 Ingestion Accelerator starting...');

    // Reset metrics
    this.cache.reset();
    this.chunkProcessor.reset();

    const options = {
      enableParallelProcessing: true,
      enableCaching: true,
      enableBatching: true,
      enableSmartDedup: true,
      ...input.options,
    };

    // Convert content to string
    const content = typeof input.content === 'string'
      ? input.content
      : input.content.toString('utf-8');

    // Split into chunks
    const chunks = this.splitIntoChunks(content);
    console.log(`📄 Split into ${chunks.length} chunks`);

    // Process chunks (parallel or sequential)
    let chunkResults: ChunkResult[];
    if (options.enableParallelProcessing) {
      chunkResults = await this.chunkProcessor.processChunksParallel(
        chunks,
        options.maxConcurrency || ACCELERATOR_CONFIG.maxConcurrentChunks
      );
    } else {
      chunkResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const results = await this.chunkProcessor.processChunksParallel([chunks[i]], 1);
        chunkResults.push(...results);
      }
    }

    // Merge raw items from all chunks
    const rawItems: RawExtractedItem[] = [];
    for (const result of chunkResults) {
      rawItems.push(...result.items);
    }
    console.log(`📦 Extracted ${rawItems.length} raw items`);

    // Batch normalize
    let normalizedItems: NormalizedItem[];
    if (options.enableBatching) {
      normalizedItems = await this.batchNormalizer.normalizeBatch(rawItems);
    } else {
      // Fallback: simple normalization
      normalizedItems = rawItems.map(item => ({
        id: uuidv4(),
        name: item.name || 'Unknown',
        description: item.description || '',
        type: (item.type === 'service' ? 'service' : 'product') as 'product' | 'service',
        vendor: item.vendor || 'Unknown',
        category: item.category || 'General',
        status: 'active' as const,
        confidence: item.confidence || 0.7,
        metadata: { extractedAt: new Date().toISOString() },
      }));
    }
    console.log(`✨ Normalized ${normalizedItems.length} items`);

    // Deduplicate
    let dedupResult: { uniqueItems: NormalizedItem[]; stats: DedupStats };
    if (options.enableSmartDedup) {
      dedupResult = await this.deduplicator.deduplicate(normalizedItems);
    } else {
      dedupResult = {
        uniqueItems: normalizedItems,
        stats: {
          totalItems: normalizedItems.length,
          uniqueItems: normalizedItems.length,
          duplicatesRemoved: 0,
          processingTime: 0,
          algorithmUsed: 'lsh',
        },
      };
    }
    console.log(`🎯 Deduplicated: ${dedupResult.stats.uniqueItems} unique items`);

    const totalTime = Date.now() - startTime;
    const processorMetrics = this.chunkProcessor.getMetrics();

    // Calculate parallel speedup estimate
    const sequentialEstimate = chunks.length * 2000; // 2s average per chunk
    const parallelSpeedup = sequentialEstimate / totalTime;

    const result: AcceleratorOutput = {
      items: dedupResult.uniqueItems,
      metrics: {
        totalProcessingTime: totalTime,
        chunksProcessed: chunks.length,
        parallelSpeedup: Math.round(parallelSpeedup * 100) / 100,
        tokensUsed: processorMetrics.tokensUsed,
        modelCalls: processorMetrics.modelCalls,
        itemsPerSecond: Math.round((dedupResult.uniqueItems.length / (totalTime / 1000)) * 100) / 100,
      },
      cacheStats: this.cache.getStats(),
      dedupStats: dedupResult.stats,
    };

    console.log(`✅ Ingestion completed in ${totalTime}ms (${result.metrics.parallelSpeedup}x speedup)`);

    return result;
  }

  private splitIntoChunks(content: string): string[] {
    const chunks: string[] = [];
    const { chunkSize, chunkOverlap } = ACCELERATOR_CONFIG;
    let start = 0;

    while (start < content.length) {
      let end = start + chunkSize;

      // Find natural break point
      if (end < content.length) {
        const paragraphBreak = content.lastIndexOf('\n\n', end);
        if (paragraphBreak > start + chunkSize * 0.7) {
          end = paragraphBreak + 2;
        } else {
          const sentenceEnd = content.lastIndexOf('. ', end);
          if (sentenceEnd > start + chunkSize * 0.7) {
            end = sentenceEnd + 2;
          }
        }
      }

      chunks.push(content.slice(start, end));
      start = end - chunkOverlap;

      if (start >= content.length - chunkOverlap) break;
    }

    return chunks;
  }
}

// ============================================================================
// SUBAGENT INTERFACE
// ============================================================================

const ingestionAccelerator = new IngestionAcceleratorAgent();

export const ingestionAcceleratorAgent: SubAgent = {
  name: 'INGESTION_ACCELERATOR' as any,
  run: async (args: Record<string, unknown>): Promise<SubAgentResult> => {
    const input: AcceleratorInput = {
      tenantId: (args.tenantId as string) || 'default',
      content: (args.content as string) || '',
      contentType: (args.contentType as 'text' | 'pdf' | 'csv' | 'excel') || 'text',
      fileName: args.fileName as string | undefined,
      options: args.options as AcceleratorOptions | undefined,
    };

    const result = await ingestionAccelerator.accelerateIngestion(input);

    return {
      content: JSON.stringify({
        itemsCount: result.items.length,
        processingTime: `${result.metrics.totalProcessingTime}ms`,
        speedup: `${result.metrics.parallelSpeedup}x`,
        cacheHitRate: `${Math.round(result.cacheStats.hitRate * 100)}%`,
        dedupRemoved: result.dedupStats.duplicatesRemoved,
      }),
      metadata: {
        items: result.items,
        metrics: result.metrics,
        cacheStats: result.cacheStats,
        dedupStats: result.dedupStats,
      },
    };
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export { IngestionAcceleratorAgent, ingestionAccelerator };

export async function accelerateIngestion(input: AcceleratorInput): Promise<AcceleratorOutput> {
  return ingestionAccelerator.accelerateIngestion(input);
}

export default ingestionAcceleratorAgent;
