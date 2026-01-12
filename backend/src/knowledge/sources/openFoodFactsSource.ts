/**
 * Open Food Facts Source
 *
 * Integrates with Open Food Facts API for food product enrichment.
 * Contains 3M+ food products with:
 * - Barcode (EAN/GTIN)
 * - Product name and brand
 * - Categories and tags
 * - Ingredients
 * - Nutritional information (Nutriscore)
 * - Allergens
 * - Product images
 *
 * API is free and unlimited: https://world.openfoodfacts.org/api/v2
 */

import type { SectorCode, EnrichmentResult, EnrichmentContext, OpenFoodFactsProduct } from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import { getEnrichmentCache } from '../utils/enrichmentCache';
import { getRateLimiter } from '../utils/rateLimiter';
import { SOURCE_CONFIGS } from '../registry/sourceConfig';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

interface OpenFoodFactsApiResponse {
  status: number;
  status_verbose?: string;
  product?: OpenFoodFactsProduct;
}

interface OpenFoodFactsSearchResponse {
  count: number;
  page: number;
  page_count: number;
  page_size: number;
  products: OpenFoodFactsProduct[];
}

export class OpenFoodFactsSource implements EnrichmentSource {
  name = 'open_food_facts' as const;
  supportedSectors: SectorCode[] = ['food_beverage'];
  priority = 2;
  confidenceWeight = 0.95;
  cacheTTLSeconds = 86400; // 24 hours

  private baseUrl = 'https://world.openfoodfacts.org/api/v2';
  private cache = getEnrichmentCache();
  private rateLimiter = getRateLimiter();
  private config = SOURCE_CONFIGS.open_food_facts;

  /**
   * Check if source is enabled (always true, no API key needed)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Initialize the source (no-op for this source)
   */
  async initialize(): Promise<void> {
    console.log('✅ Open Food Facts source initialized');
  }

  /**
   * Enrich an item with Open Food Facts data
   */
  async enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult> {
    // Check rate limit
    if (this.config.rateLimit) {
      const status = await this.rateLimiter.checkLimit(
        this.name,
        this.config.rateLimit,
        context.tenantId
      );
      if (!status.allowed) {
        return this.emptyResult(`Rate limit exceeded, resets at ${status.resetAt.toISOString()}`);
      }
    }

    // Try to find product by barcode first (most reliable)
    if (item.gtin || item.ean) {
      const barcode = item.gtin || item.ean;
      const product = await this.getByBarcode(barcode!, context.skipCache);

      if (product) {
        // Record the request
        if (this.config.rateLimit) {
          await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
        }
        return this.mapToEnrichmentResult(product, 0.95, 'barcode');
      }
    }

    // Search by name
    const products = await this.searchByName(
      item.name,
      item.vendor,
      5,
      context.skipCache
    );

    if (products.length > 0) {
      // Record the request
      if (this.config.rateLimit) {
        await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
      }

      // Find best match
      const bestMatch = this.findBestMatch(item.name, item.vendor, products);
      if (bestMatch) {
        return this.mapToEnrichmentResult(bestMatch.product, bestMatch.confidence, 'search');
      }
    }

    return this.emptyResult('No matching product found in Open Food Facts');
  }

  /**
   * Get product by barcode
   */
  async getByBarcode(barcode: string, skipCache = false): Promise<OpenFoodFactsProduct | null> {
    const cacheKey = `barcode:${barcode}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<OpenFoodFactsProduct>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = `${this.baseUrl}/product/${barcode}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'THEMIS/1.0 (contact@example.com)',
        },
      });

      if (!response.ok) {
        console.warn(`Open Food Facts API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as OpenFoodFactsApiResponse;

      if (data.status !== 1 || !data.product) {
        return null;
      }

      // Cache the result
      await this.cache.set(this.name, cacheKey, data.product, this.cacheTTLSeconds);

      return data.product;
    } catch (error) {
      console.error('Open Food Facts barcode lookup failed:', error);
      return null;
    }
  }

  /**
   * Search products by name
   */
  async searchByName(
    name: string,
    brand?: string,
    limit = 5,
    skipCache = false
  ): Promise<OpenFoodFactsProduct[]> {
    const searchQuery = brand ? `${name} ${brand}` : name;
    const cacheKey = `search:${searchQuery}:${limit}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<OpenFoodFactsProduct[]>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(`${this.baseUrl}/search`);
      url.searchParams.set('search_terms', searchQuery);
      url.searchParams.set('page_size', limit.toString());
      url.searchParams.set('json', 'true');
      url.searchParams.set('fields', 'code,product_name,brands,categories_tags,ingredients_text,nutriscore_grade,allergens_tags,image_front_url,quantity,packaging,origins');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (contact@example.com)',
        },
      });

      if (!response.ok) {
        console.warn(`Open Food Facts search error: ${response.status}`);
        return [];
      }

      const data = await response.json() as OpenFoodFactsSearchResponse;
      const products = data.products || [];

      // Cache the results
      if (products.length > 0) {
        await this.cache.set(this.name, cacheKey, products, this.cacheTTLSeconds);
      }

      return products;
    } catch (error) {
      console.error('Open Food Facts search failed:', error);
      return [];
    }
  }

  /**
   * Find the best matching product from search results
   */
  private findBestMatch(
    name: string,
    brand: string | undefined,
    products: OpenFoodFactsProduct[]
  ): { product: OpenFoodFactsProduct; confidence: number } | null {
    if (products.length === 0) return null;

    const nameLower = name.toLowerCase();
    const brandLower = brand?.toLowerCase();

    let bestMatch: OpenFoodFactsProduct | null = null;
    let bestScore = 0;

    for (const product of products) {
      let score = 0;
      const productName = product.product_name?.toLowerCase() || '';
      const productBrand = product.brands?.toLowerCase() || '';

      // Name similarity
      if (productName.includes(nameLower) || nameLower.includes(productName)) {
        score += 0.5;
      }

      // Exact name match bonus
      if (productName === nameLower) {
        score += 0.3;
      }

      // Brand match
      if (brandLower && productBrand.includes(brandLower)) {
        score += 0.2;
      }

      // Has key data bonus
      if (product.categories_tags?.length) score += 0.05;
      if (product.ingredients_text) score += 0.05;
      if (product.nutriscore_grade) score += 0.05;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    if (!bestMatch) return null;

    // Convert score to confidence (0.5 - 0.9 range)
    const confidence = Math.min(0.5 + bestScore * 0.5, 0.9);

    return { product: bestMatch, confidence };
  }

  /**
   * Map Open Food Facts product to EnrichmentResult
   */
  private mapToEnrichmentResult(
    product: OpenFoodFactsProduct,
    confidence: number,
    matchType: 'barcode' | 'search'
  ): EnrichmentResult {
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];

    // Category from tags
    if (product.categories_tags?.length) {
      // Get the most specific category (last in the list)
      const category = this.formatTag(product.categories_tags[product.categories_tags.length - 1]);
      enrichedFields.category = category;
      fieldsEnriched.push('category');
    }

    // Brand
    if (product.brands) {
      enrichedFields.vendor = product.brands;
      fieldsEnriched.push('vendor');
    }

    // Ingredients
    if (product.ingredients_text) {
      enrichedFields.ingredients = product.ingredients_text;
      fieldsEnriched.push('ingredients');
    }

    // Nutriscore
    if (product.nutriscore_grade) {
      enrichedFields.nutriscore_grade = product.nutriscore_grade.toUpperCase();
      fieldsEnriched.push('nutriscore_grade');
    }

    // Allergens
    if (product.allergens_tags?.length) {
      enrichedFields.allergens = product.allergens_tags.map(this.formatTag);
      fieldsEnriched.push('allergens');
    }

    // Image
    if (product.image_front_url) {
      enrichedFields.image_url = product.image_front_url;
      fieldsEnriched.push('image_url');
    }

    // Quantity/Packaging
    if (product.quantity) {
      enrichedFields.quantity = product.quantity;
      fieldsEnriched.push('quantity');
    }

    // Origins
    if (product.origins) {
      enrichedFields.origins = product.origins;
      fieldsEnriched.push('origins');
    }

    // Barcode
    if (product.code) {
      enrichedFields.gtin = product.code;
      fieldsEnriched.push('gtin');
    }

    return {
      source: this.name,
      confidence,
      matched_entry_id: product.code,
      fields_enriched: fieldsEnriched,
      enrichedFields,
      reasoning: [
        `Matched via ${matchType}: "${product.product_name}"`,
        `Brand: ${product.brands || 'Unknown'}`,
        `Categories: ${product.categories_tags?.slice(-2).map(this.formatTag).join(' > ') || 'None'}`,
        product.nutriscore_grade ? `Nutriscore: ${product.nutriscore_grade.toUpperCase()}` : '',
      ].filter(Boolean),
    };
  }

  /**
   * Format Open Food Facts tag (remove language prefix)
   */
  private formatTag(tag: string): string {
    // Tags are in format "en:category-name"
    const parts = tag.split(':');
    const name = parts.length > 1 ? parts[1] : parts[0];
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Return empty result
   */
  private emptyResult(reason: string): EnrichmentResult {
    return {
      source: this.name,
      confidence: 0,
      fields_enriched: [],
      reasoning: [reason],
    };
  }
}

// Singleton instance
let sourceInstance: OpenFoodFactsSource | null = null;

export function getOpenFoodFactsSource(): OpenFoodFactsSource {
  if (!sourceInstance) {
    sourceInstance = new OpenFoodFactsSource();
  }
  return sourceInstance;
}

export default OpenFoodFactsSource;
