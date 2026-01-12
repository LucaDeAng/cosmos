/**
 * DBpedia Source
 *
 * Integrates with DBpedia as a secondary universal fallback.
 * DBpedia extracts structured data from Wikipedia and provides:
 * - Entity lookup by name
 * - Structured properties (abstract, categories, types)
 * - Links to Wikipedia and other knowledge bases
 *
 * Uses the DBpedia Lookup API for quick entity resolution.
 * Rate limits: ~10 requests/second (be respectful)
 * https://wiki.dbpedia.org/lookup
 */

import type { SectorCode, EnrichmentResult, EnrichmentContext } from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import { getEnrichmentCache } from '../utils/enrichmentCache';
import { getRateLimiter } from '../utils/rateLimiter';
import { SOURCE_CONFIGS } from '../registry/sourceConfig';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

interface DBpediaLookupResult {
  resource: string[];
  label: string[];
  description?: string[];
  typeName?: string[];
  redirectlabel?: string[];
  refCount?: string[];
  category?: string[];
}

interface DBpediaLookupResponse {
  docs?: DBpediaLookupResult[];
}

export class DBpediaSource implements EnrichmentSource {
  name = 'dbpedia' as const;
  supportedSectors: SectorCode[] = ['unknown']; // Universal fallback
  priority = 11; // Lower priority than Wikidata
  confidenceWeight = 0.65;
  cacheTTLSeconds = 86400; // 24 hours

  private lookupUrl = 'https://lookup.dbpedia.org/api/search';
  private cache = getEnrichmentCache();
  private rateLimiter = getRateLimiter();
  private config = SOURCE_CONFIGS.dbpedia;

  /**
   * Check if source is enabled (always true)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Initialize the source
   */
  async initialize(): Promise<void> {
    console.log('✅ DBpedia source initialized');
  }

  /**
   * Enrich an item with DBpedia data
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

    // Search for the entity
    const results = await this.lookupEntity(item.name, context.skipCache);

    if (results.length === 0) {
      return this.emptyResult('No matching entity found in DBpedia');
    }

    // Record the request
    if (this.config.rateLimit) {
      await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
    }

    // Find best match
    const bestMatch = this.findBestMatch(item.name, item.vendor, results);
    if (!bestMatch) {
      return this.emptyResult('No suitable match found in DBpedia');
    }

    return this.mapToEnrichmentResult(bestMatch, item.name);
  }

  /**
   * Lookup entity by name
   */
  async lookupEntity(name: string, skipCache = false): Promise<DBpediaLookupResult[]> {
    const cacheKey = `lookup:${name.toLowerCase()}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<DBpediaLookupResult[]>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(this.lookupUrl);
      url.searchParams.set('query', name);
      url.searchParams.set('format', 'json');
      url.searchParams.set('maxResults', '10');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (https://github.com/themis; contact@example.com)',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`DBpedia lookup error: ${response.status}`);
        return [];
      }

      const data = await response.json() as DBpediaLookupResponse;
      const results = data.docs || [];

      // Cache the results
      if (results.length > 0) {
        await this.cache.set(this.name, cacheKey, results, this.cacheTTLSeconds);
      }

      return results;
    } catch (error) {
      console.error('DBpedia lookup failed:', error);
      return [];
    }
  }

  /**
   * Find best matching result
   */
  private findBestMatch(
    name: string,
    vendor: string | undefined,
    results: DBpediaLookupResult[]
  ): DBpediaLookupResult | null {
    const nameLower = name.toLowerCase();
    const vendorLower = vendor?.toLowerCase();

    let bestMatch: DBpediaLookupResult | null = null;
    let bestScore = 0;

    for (const result of results) {
      let score = 0;
      const label = result.label?.[0]?.toLowerCase() || '';
      const description = result.description?.[0]?.toLowerCase() || '';
      const typeNames = result.typeName?.map(t => t.toLowerCase()) || [];
      const categories = result.category?.map(c => c.toLowerCase()) || [];

      // Label match
      if (label === nameLower) {
        score += 5; // Exact match
      } else if (label.includes(nameLower) || nameLower.includes(label)) {
        score += 3; // Partial match
      }

      // Vendor in description
      if (vendorLower && description.includes(vendorLower)) {
        score += 2;
      }

      // Check for relevant types
      const relevantTypes = ['company', 'software', 'product', 'organisation', 'brand', 'work'];
      for (const typeName of typeNames) {
        for (const rt of relevantTypes) {
          if (typeName.includes(rt)) {
            score += 1;
            break;
          }
        }
      }

      // Check categories for relevance
      const relevantCategories = ['companies', 'software', 'products', 'brands', 'technology'];
      for (const cat of categories) {
        for (const rc of relevantCategories) {
          if (cat.includes(rc)) {
            score += 0.5;
            break;
          }
        }
      }

      // Prefer entities with descriptions
      if (result.description?.length) {
        score += 1;
      }

      // Prefer entities with higher reference count (more notable)
      const refCount = parseInt(result.refCount?.[0] || '0', 10);
      if (refCount > 100) score += 1;
      if (refCount > 1000) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  /**
   * Extract DBpedia resource ID from URI
   */
  private extractResourceId(resourceUri: string): string {
    // DBpedia URIs are like http://dbpedia.org/resource/Microsoft
    const match = resourceUri.match(/\/resource\/(.+)$/);
    return match ? decodeURIComponent(match[1].replace(/_/g, ' ')) : resourceUri;
  }

  /**
   * Map result to EnrichmentResult
   */
  private mapToEnrichmentResult(
    result: DBpediaLookupResult,
    searchName: string
  ): EnrichmentResult {
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];

    // DBpedia resource URI
    const resourceUri = result.resource?.[0];
    if (resourceUri) {
      enrichedFields.dbpedia_uri = resourceUri;
      fieldsEnriched.push('dbpedia_uri');

      // Extract resource ID for canonical name
      const resourceId = this.extractResourceId(resourceUri);
      enrichedFields.dbpedia_id = resourceId;
      fieldsEnriched.push('dbpedia_id');
    }

    // Label
    const label = result.label?.[0];
    if (label) {
      enrichedFields.canonical_name = label;
      fieldsEnriched.push('canonical_name');
      reasoning.push(`Matched entity: "${label}"`);
    }

    // Description (abstract)
    const description = result.description?.[0];
    if (description) {
      // Truncate long descriptions
      enrichedFields.description = description.length > 500
        ? description.substring(0, 500) + '...'
        : description;
      fieldsEnriched.push('description');
      reasoning.push(`Description: ${description.substring(0, 100)}...`);
    }

    // Type names
    if (result.typeName?.length) {
      enrichedFields.dbpedia_types = result.typeName;
      fieldsEnriched.push('dbpedia_types');

      // Determine primary type
      const types = result.typeName.map(t => t.toLowerCase());
      let primaryType = 'entity';
      if (types.some(t => t.includes('company') || t.includes('organisation'))) {
        primaryType = 'company';
      } else if (types.some(t => t.includes('software'))) {
        primaryType = 'software';
      } else if (types.some(t => t.includes('product') || t.includes('device'))) {
        primaryType = 'product';
      } else if (types.some(t => t.includes('brand'))) {
        primaryType = 'brand';
      }
      enrichedFields.entity_type = primaryType;
      reasoning.push(`Type: ${primaryType}`);
    }

    // Categories
    if (result.category?.length) {
      // Take top 5 categories
      enrichedFields.dbpedia_categories = result.category.slice(0, 5);
      fieldsEnriched.push('dbpedia_categories');
    }

    // Wikipedia link (derive from DBpedia URI)
    if (resourceUri) {
      const wikiUri = resourceUri.replace('dbpedia.org/resource', 'en.wikipedia.org/wiki');
      enrichedFields.wikipedia_url = wikiUri;
      fieldsEnriched.push('wikipedia_url');
    }

    // Redirect label (aliases)
    if (result.redirectlabel?.length) {
      enrichedFields.aliases = result.redirectlabel.slice(0, 5);
      fieldsEnriched.push('aliases');
    }

    // Reference count (popularity indicator)
    const refCount = parseInt(result.refCount?.[0] || '0', 10);
    if (refCount > 0) {
      enrichedFields.reference_count = refCount;
      fieldsEnriched.push('reference_count');
    }

    // Calculate confidence based on data completeness and reference count
    let confidence = 0.5; // Base confidence
    if (description) confidence += 0.1;
    if (result.typeName?.length) confidence += 0.1;
    if (refCount > 100) confidence += 0.05;
    if (refCount > 1000) confidence += 0.05;
    if (result.category?.length) confidence += 0.05;
    confidence = Math.min(confidence, 0.8);

    return {
      source: this.name,
      confidence,
      matched_entry_id: resourceUri,
      fields_enriched: fieldsEnriched,
      enrichedFields,
      reasoning,
    };
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
let sourceInstance: DBpediaSource | null = null;

export function getDBpediaSource(): DBpediaSource {
  if (!sourceInstance) {
    sourceInstance = new DBpediaSource();
  }
  return sourceInstance;
}

export default DBpediaSource;
