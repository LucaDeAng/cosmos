/**
 * External Enrichment Agent
 *
 * Enriches portfolio products with external data from:
 * - Icecat: Product specifications for 45M+ tech products
 * - GS1: Standardized product categorization
 * - Web search fallback: Pricing and availability info
 *
 * NOTE: This agent requires external API keys:
 * - ICECAT_API_KEY for Icecat integration
 * - GS1_API_KEY for GS1 integration
 *
 * Only enriches products (not services) with budget > threshold
 */

// Types
interface EnrichmentResult {
  success: boolean;
  source: 'icecat' | 'gs1' | 'web_search' | 'cache';
  data: ProductEnrichmentData;
  confidence: number;
  cached: boolean;
}

interface ProductEnrichmentData {
  // From Icecat
  specifications?: Record<string, string>;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  category?: string;
  images?: string[];
  documents?: string[];

  // From GS1
  gtin?: string;
  gs1Category?: string;
  gs1Classification?: string;

  // From web search
  estimatedPrice?: {
    min: number;
    max: number;
    currency: string;
    asOf: string;
  };
  alternativeProducts?: Array<{
    name: string;
    vendor: string;
    priceRange?: string;
  }>;
}

interface PortfolioItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  vendor?: string;
  category?: string;
  budget?: number;
  description?: string;
}

interface EnrichmentConfig {
  budgetThreshold: number;  // Minimum budget to trigger enrichment
  enableIcecat: boolean;
  enableGs1: boolean;
  enableWebSearch: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

// Simple in-memory cache
const enrichmentCache = new Map<string, { data: EnrichmentResult; timestamp: number }>();

// Default configuration
const DEFAULT_CONFIG: EnrichmentConfig = {
  budgetThreshold: 50000, // Only enrich products with budget > €50k
  enableIcecat: true,
  enableGs1: true,
  enableWebSearch: false, // Disabled by default (requires additional setup)
  cacheEnabled: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Check if product should be enriched based on config
 */
function shouldEnrich(item: PortfolioItem, config: EnrichmentConfig): boolean {
  // Only enrich products, not services
  if (item.type !== 'product') return false;

  // Check budget threshold
  if (item.budget && item.budget < config.budgetThreshold) return false;

  return true;
}

/**
 * Generate cache key for item
 */
function getCacheKey(item: PortfolioItem): string {
  const vendor = (item.vendor || '').toLowerCase().trim();
  const name = (item.name || '').toLowerCase().trim();
  return `${vendor}:${name}`;
}

/**
 * Get cached enrichment if available
 */
function getCachedEnrichment(item: PortfolioItem, config: EnrichmentConfig): EnrichmentResult | null {
  if (!config.cacheEnabled) return null;

  const cacheKey = getCacheKey(item);
  const cached = enrichmentCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < config.cacheTtlMs) {
    console.log(`   📦 Cache hit for ${item.name}`);
    return { ...cached.data, cached: true };
  }

  return null;
}

/**
 * Store enrichment in cache
 */
function cacheEnrichment(item: PortfolioItem, result: EnrichmentResult): void {
  const cacheKey = getCacheKey(item);
  enrichmentCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });
}

/**
 * Fetch from Icecat API
 * NOTE: Requires ICECAT_API_KEY environment variable
 */
async function fetchFromIcecat(item: PortfolioItem): Promise<ProductEnrichmentData | null> {
  const apiKey = process.env.ICECAT_API_KEY;

  if (!apiKey) {
    console.log(`   ⚠️ Icecat API key not configured`);
    return null;
  }

  try {
    // Icecat requires vendor + product name for lookup
    const vendor = encodeURIComponent(item.vendor || '');
    const productName = encodeURIComponent(item.name || '');

    // NOTE: This is a placeholder URL - actual Icecat API may differ
    const url = `https://live.icecat.biz/api/?UserName=${apiKey}&Language=en&Brand=${vendor}&ProductCode=${productName}`;

    console.log(`   🔍 Querying Icecat for ${item.vendor} ${item.name}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`   ❌ Icecat returned ${response.status}`);
      return null;
    }

    const data = await response.json() as { data?: {
      Brand?: { Name?: string };
      ProductCode?: string;
      Category?: { Name?: string };
      FeaturesGroups?: Array<{ Features?: Array<{ Feature?: { Name?: string }; Value?: string }> }>;
      Images?: Array<{ Url?: string }>;
      PDFs?: Array<{ Url?: string }>;
    }};

    // Parse Icecat response (structure depends on actual API)
    if (data && data.data) {
      return {
        manufacturer: data.data.Brand?.Name,
        manufacturerPartNumber: data.data.ProductCode,
        category: data.data.Category?.Name,
        specifications: data.data.FeaturesGroups?.reduce((acc: Record<string, string>, group) => {
          group.Features?.forEach((f) => {
            acc[f.Feature?.Name || 'Unknown'] = f.Value || '';
          });
          return acc;
        }, {}),
        images: data.data.Images?.map((i) => i.Url).filter((url): url is string => !!url),
        documents: data.data.PDFs?.map((p) => p.Url).filter((url): url is string => !!url),
      };
    }

    return null;
  } catch (error) {
    console.error(`   ❌ Icecat error:`, error);
    return null;
  }
}

/**
 * Fetch from GS1 API
 * NOTE: Requires GS1_API_KEY environment variable
 */
async function fetchFromGs1(item: PortfolioItem): Promise<ProductEnrichmentData | null> {
  const apiKey = process.env.GS1_API_KEY;

  if (!apiKey) {
    console.log(`   ⚠️ GS1 API key not configured`);
    return null;
  }

  try {
    // NOTE: This is a placeholder - actual GS1 API endpoint and format may differ
    const productName = encodeURIComponent(item.name || '');

    console.log(`   🔍 Querying GS1 for ${item.name}`);

    // GS1 lookup by product name (simplified)
    const url = `https://api.gs1.org/products/lookup?name=${productName}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`   ❌ GS1 returned ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      products?: Array<{
        gtin?: string;
        category?: string;
        classification?: string;
      }>;
    };

    if (data && data.products && data.products.length > 0) {
      const product = data.products[0];
      return {
        gtin: product.gtin,
        gs1Category: product.category,
        gs1Classification: product.classification,
      };
    }

    return null;
  } catch (error) {
    console.error(`   ❌ GS1 error:`, error);
    return null;
  }
}

/**
 * Enrich a single product with external data
 */
export async function enrichProduct(
  item: PortfolioItem,
  config: EnrichmentConfig = DEFAULT_CONFIG
): Promise<EnrichmentResult> {
  console.log(`\n🔎 Enriching product: ${item.name}`);

  // Check cache first
  const cached = getCachedEnrichment(item, config);
  if (cached) {
    return cached;
  }

  let enrichmentData: ProductEnrichmentData = {};
  let primarySource: 'icecat' | 'gs1' | 'web_search' = 'icecat';
  let confidence = 0;

  // Try Icecat first (best for tech products)
  if (config.enableIcecat) {
    const icecatData = await fetchFromIcecat(item);
    if (icecatData) {
      enrichmentData = { ...enrichmentData, ...icecatData };
      primarySource = 'icecat';
      confidence = 0.9;
    }
  }

  // Try GS1 for categorization
  if (config.enableGs1) {
    const gs1Data = await fetchFromGs1(item);
    if (gs1Data) {
      enrichmentData = { ...enrichmentData, ...gs1Data };
      if (!enrichmentData.category) {
        primarySource = 'gs1';
      }
      confidence = Math.max(confidence, 0.7);
    }
  }

  // Web search as fallback (if enabled and no data found)
  if (config.enableWebSearch && Object.keys(enrichmentData).length === 0) {
    // Web search would go here - requires additional implementation
    console.log(`   🌐 Web search fallback not implemented`);
  }

  const result: EnrichmentResult = {
    success: Object.keys(enrichmentData).length > 0,
    source: primarySource,
    data: enrichmentData,
    confidence,
    cached: false,
  };

  // Cache the result
  if (result.success && config.cacheEnabled) {
    cacheEnrichment(item, result);
  }

  console.log(`   ${result.success ? '✅' : '❌'} Enrichment ${result.success ? 'successful' : 'failed'} (${primarySource})`);

  return result;
}

/**
 * Enrich multiple products in batch
 */
export async function enrichProducts(
  items: PortfolioItem[],
  config: EnrichmentConfig = DEFAULT_CONFIG
): Promise<Map<string, EnrichmentResult>> {
  console.log(`\n🔄 Batch enrichment for ${items.length} items...`);

  const results = new Map<string, EnrichmentResult>();

  // Filter to only products that should be enriched
  const toEnrich = items.filter(item => shouldEnrich(item, config));

  console.log(`   📋 ${toEnrich.length} products qualify for enrichment (budget > €${config.budgetThreshold})`);

  for (const item of toEnrich) {
    try {
      const result = await enrichProduct(item, config);
      results.set(item.id, result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`   ❌ Error enriching ${item.name}:`, error);
      results.set(item.id, {
        success: false,
        source: 'icecat',
        data: {},
        confidence: 0,
        cached: false,
      });
    }
  }

  const successCount = Array.from(results.values()).filter(r => r.success).length;
  console.log(`   ✅ Enriched ${successCount}/${toEnrich.length} products`);

  return results;
}

/**
 * Clear enrichment cache
 */
export function clearEnrichmentCache(): void {
  enrichmentCache.clear();
  console.log('🗑️ Enrichment cache cleared');
}

/**
 * Get cache statistics
 */
export function getEnrichmentCacheStats(): {
  size: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  let oldest: number | null = null;
  let newest: number | null = null;

  for (const [, value] of enrichmentCache) {
    if (oldest === null || value.timestamp < oldest) {
      oldest = value.timestamp;
    }
    if (newest === null || value.timestamp > newest) {
      newest = value.timestamp;
    }
  }

  return {
    size: enrichmentCache.size,
    oldestEntry: oldest,
    newestEntry: newest,
  };
}

export default enrichProduct;
