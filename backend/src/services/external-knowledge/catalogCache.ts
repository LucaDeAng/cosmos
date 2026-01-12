/**
 * Catalog Cache
 *
 * Caches external knowledge in Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.
 */

import { supabase } from '../../config/supabase';
import {
  ExternalKnowledgeItem,
  ExternalKnowledgeSource,
  CachedCatalog,
  DEFAULT_CONFIG,
} from './types';

// In-memory cache for faster reads after first fetch
let memoryCache: CachedCatalog | null = null;

/**
 * Check if cached catalog exists and is valid
 */
export async function getCachedCatalog(): Promise<CachedCatalog | null> {
  try {
    // Try Supabase first
    const { data, error } = await supabase
      .from('external_knowledge_cache')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Fall back to memory cache
      if (memoryCache && !isCacheExpired(memoryCache.expires_at)) {
        console.log('   Using memory cache');
        return memoryCache;
      }
      return null;
    }

    // Check if cache is expired
    if (isCacheExpired(new Date(data.expires_at))) {
      console.log('   Cache expired');
      return null;
    }

    // Parse items from JSON
    const items: ExternalKnowledgeItem[] = data.items || [];
    const sourceCounts = data.source_counts || {};

    const cached = {
      items,
      fetched_at: new Date(data.fetched_at),
      expires_at: new Date(data.expires_at),
      source_counts: sourceCounts,
    };

    // Update memory cache
    memoryCache = cached;

    return cached;

  } catch (error) {
    console.error('   Cache read error:', error);
    // Return memory cache if available
    if (memoryCache && !isCacheExpired(memoryCache.expires_at)) {
      return memoryCache;
    }
    return null;
  }
}

/**
 * Save catalog to cache
 */
export async function saveCatalogToCache(items: ExternalKnowledgeItem[]): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_CONFIG.cacheTTLHours * 60 * 60 * 1000);

  // Calculate source counts
  const sourceCounts: Record<ExternalKnowledgeSource, number> = {
    aws: 0,
    azure: 0,
    gcp: 0,
    wikidata: 0,
  };

  for (const item of items) {
    sourceCounts[item.source]++;
  }

  const cacheEntry: CachedCatalog = {
    items,
    fetched_at: now,
    expires_at: expiresAt,
    source_counts: sourceCounts,
  };

  // Update memory cache first
  memoryCache = cacheEntry;

  try {
    // Try to save to Supabase
    const { error } = await supabase
      .from('external_knowledge_cache')
      .upsert({
        id: 'main-cache',
        items: items,
        fetched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        source_counts: sourceCounts,
        item_count: items.length,
      }, {
        onConflict: 'id',
      });

    if (error) {
      console.warn('   Supabase cache save failed, using memory only:', error.message);
    } else {
      console.log(`   Saved ${items.length} items to Supabase cache`);
    }

  } catch (error) {
    console.warn('   Cache save error, using memory only:', error);
  }
}

/**
 * Check if cache is expired
 */
export function isCacheExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Clear the cache
 */
export async function clearCache(): Promise<void> {
  memoryCache = null;

  try {
    await supabase
      .from('external_knowledge_cache')
      .delete()
      .eq('id', 'main-cache');

    console.log('   Cache cleared');
  } catch (error) {
    console.warn('   Cache clear error:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  hasCache: boolean;
  itemCount: number;
  sourceCounts: Record<string, number>;
  fetchedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
}> {
  const cache = await getCachedCatalog();

  if (!cache) {
    return {
      hasCache: false,
      itemCount: 0,
      sourceCounts: {},
      fetchedAt: null,
      expiresAt: null,
      isExpired: true,
    };
  }

  return {
    hasCache: true,
    itemCount: cache.items.length,
    sourceCounts: cache.source_counts,
    fetchedAt: cache.fetched_at,
    expiresAt: cache.expires_at,
    isExpired: isCacheExpired(cache.expires_at),
  };
}

export default {
  getCachedCatalog,
  saveCatalogToCache,
  clearCache,
  getCacheStats,
  isCacheExpired,
};
