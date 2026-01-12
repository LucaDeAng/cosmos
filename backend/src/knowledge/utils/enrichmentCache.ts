/**
 * Enrichment Cache
 *
 * Two-tier caching system for API responses:
 * - L1: In-memory cache (fast, volatile)
 * - L2: Supabase cache (persistent, slower)
 *
 * Provides automatic promotion from L2 to L1 on read.
 */

import { createHash } from 'crypto';
import { supabase } from '../../config/supabase';
import type { KnowledgeSourceType } from '../types';

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: Date;
  hitCount: number;
}

// L1 cache configuration
const L1_TTL_MS = 5 * 60 * 1000; // 5 minutes
const L1_MAX_ENTRIES = 10000;

/**
 * Two-tier cache for enrichment data
 */
export class EnrichmentCache {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private hitStats: Map<string, { hits: number; misses: number }> = new Map();

  constructor() {
    // Periodic cleanup of expired L1 entries
    setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
  }

  /**
   * Get cached data
   * First checks L1 (memory), then L2 (Supabase)
   */
  async get<T>(source: KnowledgeSourceType, key: string): Promise<T | null> {
    const cacheKey = this.buildCacheKey(source, key);

    // Check L1 (memory)
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > new Date()) {
      memEntry.hitCount++;
      this.recordHit(source, true);
      return memEntry.data as T;
    }

    // Check L2 (Supabase)
    try {
      const { data, error } = await supabase
        .from('enrichment_cache')
        .select('response_data, expires_at')
        .eq('source_name', source)
        .eq('cache_key', this.hashKey(key))
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        this.recordHit(source, false);
        return null;
      }

      // Promote to L1
      this.setMemory(cacheKey, data.response_data, L1_TTL_MS);

      // Update hit count in L2
      this.incrementL2HitCount(source, this.hashKey(key)).catch(() => {
        // Ignore hit count update errors
      });

      this.recordHit(source, true);
      return data.response_data as T;
    } catch (error) {
      console.warn('Cache L2 read error:', error);
      this.recordHit(source, false);
      return null;
    }
  }

  /**
   * Set cached data in both tiers
   */
  async set<T>(
    source: KnowledgeSourceType,
    key: string,
    data: T,
    ttlSeconds: number
  ): Promise<void> {
    const cacheKey = this.buildCacheKey(source, key);
    const hashedKey = this.hashKey(key);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Set in L1 (with shorter TTL for memory efficiency)
    const l1TtlMs = Math.min(ttlSeconds * 1000, L1_TTL_MS);
    this.setMemory(cacheKey, data, l1TtlMs);

    // Set in L2 (Supabase)
    try {
      await supabase.from('enrichment_cache').upsert(
        {
          source_name: source,
          cache_key: hashedKey,
          response_data: data,
          expires_at: expiresAt.toISOString(),
          hit_count: 0,
        },
        { onConflict: 'source_name,cache_key' }
      );
    } catch (error) {
      console.warn('Cache L2 write error:', error);
      // L1 cache still works even if L2 fails
    }
  }

  /**
   * Delete cached entry
   */
  async delete(source: KnowledgeSourceType, key: string): Promise<void> {
    const cacheKey = this.buildCacheKey(source, key);

    // Delete from L1
    this.memoryCache.delete(cacheKey);

    // Delete from L2
    try {
      await supabase
        .from('enrichment_cache')
        .delete()
        .eq('source_name', source)
        .eq('cache_key', this.hashKey(key));
    } catch (error) {
      console.warn('Cache L2 delete error:', error);
    }
  }

  /**
   * Clear all cache for a source
   */
  async clearSource(source: KnowledgeSourceType): Promise<number> {
    let cleared = 0;

    // Clear L1 entries for this source
    for (const [key] of this.memoryCache.entries()) {
      if (key.startsWith(`${source}:`)) {
        this.memoryCache.delete(key);
        cleared++;
      }
    }

    // Clear L2 entries
    try {
      const { count } = await supabase
        .from('enrichment_cache')
        .delete({ count: 'exact' })
        .eq('source_name', source);

      cleared += count || 0;
    } catch (error) {
      console.warn('Cache L2 clear error:', error);
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    l1Entries: number;
    l1HitRate: Record<string, { hits: number; misses: number; rate: number }>;
  } {
    const hitRates: Record<string, { hits: number; misses: number; rate: number }> = {};

    for (const [source, stats] of this.hitStats.entries()) {
      const total = stats.hits + stats.misses;
      hitRates[source] = {
        ...stats,
        rate: total > 0 ? stats.hits / total : 0,
      };
    }

    return {
      l1Entries: this.memoryCache.size,
      l1HitRate: hitRates,
    };
  }

  /**
   * Set entry in memory cache
   */
  private setMemory<T>(cacheKey: string, data: T, ttlMs: number): void {
    // Evict oldest entries if at capacity
    if (this.memoryCache.size >= L1_MAX_ENTRIES) {
      this.evictOldest(L1_MAX_ENTRIES / 10); // Evict 10%
    }

    this.memoryCache.set(cacheKey, {
      data,
      expiresAt: new Date(Date.now() + ttlMs),
      hitCount: 0,
    });
  }

  /**
   * Build cache key from source and lookup key
   */
  private buildCacheKey(source: KnowledgeSourceType, key: string): string {
    return `${source}:${key}`;
  }

  /**
   * Hash a key for storage (consistent, shorter)
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 64);
  }

  /**
   * Record hit/miss for statistics
   */
  private recordHit(source: KnowledgeSourceType, hit: boolean): void {
    if (!this.hitStats.has(source)) {
      this.hitStats.set(source, { hits: 0, misses: 0 });
    }
    const stats = this.hitStats.get(source)!;
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
  }

  /**
   * Increment L2 hit count
   */
  private async incrementL2HitCount(
    source: KnowledgeSourceType,
    hashedKey: string
  ): Promise<void> {
    await supabase.rpc('increment_cache_hit', {
      p_source: source,
      p_key: hashedKey,
    });
  }

  /**
   * Cleanup expired entries from memory cache
   */
  private cleanupMemoryCache(): void {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.memoryCache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cache cleanup: removed ${removed} expired L1 entries`);
    }
  }

  /**
   * Evict oldest entries from memory cache
   */
  private evictOldest(count: number): void {
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].expiresAt.getTime() - b[1].expiresAt.getTime())
      .slice(0, count);

    for (const [key] of entries) {
      this.memoryCache.delete(key);
    }

    console.log(`🧹 Cache eviction: removed ${entries.length} oldest L1 entries`);
  }
}

// Singleton instance
let cacheInstance: EnrichmentCache | null = null;

export function getEnrichmentCache(): EnrichmentCache {
  if (!cacheInstance) {
    cacheInstance = new EnrichmentCache();
  }
  return cacheInstance;
}

export default EnrichmentCache;
