/**
 * External Knowledge Service
 *
 * Main orchestrator for fetching and caching external knowledge
 * from cloud providers (AWS, Azure, GCP).
 */

import { fetchAWSCatalog } from './awsCatalogFetcher';
import { fetchAzureCatalog } from './azureCatalogFetcher';
import {
  getCachedCatalog,
  saveCatalogToCache,
  clearCache,
  getCacheStats,
  isCacheExpired,
} from './catalogCache';
import {
  ExternalKnowledgeItem,
  ExternalKnowledgeConfig,
  DEFAULT_CONFIG,
  FetchResult,
} from './types';

export * from './types';
export { getCacheStats, clearCache };

/**
 * Get external knowledge items (from cache or fresh fetch)
 */
export async function getExternalKnowledge(
  config: Partial<ExternalKnowledgeConfig> = {}
): Promise<ExternalKnowledgeItem[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  console.log('\n Checking external knowledge cache...');

  // Check cache first
  const cached = await getCachedCatalog();
  if (cached && !isCacheExpired(cached.expires_at)) {
    console.log(`   Using cached catalog: ${cached.items.length} items`);
    console.log(`   Sources: AWS=${cached.source_counts.aws}, Azure=${cached.source_counts.azure}`);
    return cached.items;
  }

  // Fetch fresh data
  console.log('   Cache miss or expired, fetching fresh data...');
  return refreshExternalKnowledge({ force: true, ...mergedConfig });
}

/**
 * Force refresh external knowledge from all sources
 */
export async function refreshExternalKnowledge(
  config: Partial<ExternalKnowledgeConfig> & { force?: boolean } = {}
): Promise<ExternalKnowledgeItem[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const allItems: ExternalKnowledgeItem[] = [];
  const results: FetchResult[] = [];

  console.log('\n Fetching external knowledge from APIs...');

  // Fetch from enabled sources in parallel
  const fetchPromises: Promise<FetchResult>[] = [];

  if (mergedConfig.enableAWS) {
    console.log('   Starting AWS fetch...');
    fetchPromises.push(fetchAWSCatalog());
  }

  if (mergedConfig.enableAzure) {
    console.log('   Starting Azure fetch...');
    fetchPromises.push(fetchAzureCatalog(mergedConfig.maxItemsPerSource));
  }

  // Wait for all fetches
  const fetchResults = await Promise.allSettled(fetchPromises);

  for (const result of fetchResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
      allItems.push(...result.value.items);
      console.log(`   ${result.value.source}: ${result.value.item_count} items (${result.value.duration_ms}ms)`);
    } else {
      console.error(`   Fetch failed:`, result.reason);
    }
  }

  // Deduplicate by ID
  const uniqueItems = new Map<string, ExternalKnowledgeItem>();
  for (const item of allItems) {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  const finalItems = Array.from(uniqueItems.values());

  // Cache the results
  console.log(`   Total unique items: ${finalItems.length}`);
  await saveCatalogToCache(finalItems);

  console.log('\n');
  console.log('   EXTERNAL KNOWLEDGE REFRESH COMPLETE');
  console.log('');
  console.log(`   Total Items: ${finalItems.length}`);
  for (const result of results) {
    console.log(`   ${result.source.toUpperCase()}: ${result.item_count} items`);
  }
  console.log('');
  console.log('\n');

  return finalItems;
}

/**
 * Search external knowledge by query
 */
export function searchExternalKnowledge(
  items: ExternalKnowledgeItem[],
  query: string,
  options: {
    limit?: number;
    source?: string;
    category?: string;
  } = {}
): ExternalKnowledgeItem[] {
  const { limit = 20, source, category } = options;
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

  let filtered = items;

  // Filter by source if specified
  if (source) {
    filtered = filtered.filter(item => item.source === source);
  }

  // Filter by category if specified
  if (category) {
    filtered = filtered.filter(item =>
      item.category.toLowerCase().includes(category.toLowerCase())
    );
  }

  // Score and sort by relevance
  const scored = filtered.map(item => {
    let score = 0;

    // Exact name match
    if (item.name_en.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Keyword matches
    for (const term of queryTerms) {
      if (item.name_en.toLowerCase().includes(term)) score += 3;
      if (item.description_en.toLowerCase().includes(term)) score += 1;
      if (item.keywords.some(k => k.includes(term))) score += 2;
      if (item.category.toLowerCase().includes(term)) score += 2;
    }

    return { item, score };
  });

  // Sort by score and return top results
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

/**
 * Transform external knowledge to RAG document format
 */
export function transformToRAGDocuments(
  items: ExternalKnowledgeItem[]
): Array<{ content: string; metadata: Record<string, unknown> }> {
  return items.map(item => ({
    content: [
      item.name_en,
      item.description_en,
      `Vendor: ${item.vendor}`,
      `Category: ${item.category}`,
      item.subcategory ? `Subcategory: ${item.subcategory}` : '',
      `Keywords: ${item.keywords.join(', ')}`,
    ].filter(Boolean).join('\n'),
    metadata: {
      id: item.id,
      source: item.source,
      type: 'external_knowledge',
      category: item.category,
      vendor: item.vendor,
      pricing_model: item.pricing_model,
    },
  }));
}

/**
 * Get summary statistics
 */
export async function getExternalKnowledgeStats(): Promise<{
  cached: boolean;
  itemCount: number;
  sourceCounts: Record<string, number>;
  lastFetched: Date | null;
  cacheExpires: Date | null;
}> {
  const stats = await getCacheStats();

  return {
    cached: stats.hasCache,
    itemCount: stats.itemCount,
    sourceCounts: stats.sourceCounts,
    lastFetched: stats.fetchedAt,
    cacheExpires: stats.expiresAt,
  };
}

export default {
  getExternalKnowledge,
  refreshExternalKnowledge,
  searchExternalKnowledge,
  transformToRAGDocuments,
  getExternalKnowledgeStats,
  clearCache,
};
