/**
 * Wikidata Source
 *
 * Integrates with Wikidata API as a universal fallback for any product or company.
 * Wikidata contains structured data about millions of entities including:
 * - Products (Q28877)
 * - Companies (Q4830453)
 * - Brands (Q431289)
 * - Software (Q7397)
 *
 * API is free with rate limits: ~50 requests/second
 * https://www.wikidata.org/w/api.php
 */

import type { SectorCode, EnrichmentResult, EnrichmentContext } from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import { getEnrichmentCache } from '../utils/enrichmentCache';
import { getRateLimiter } from '../utils/rateLimiter';
import { SOURCE_CONFIGS } from '../registry/sourceConfig';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

interface WikidataSearchResult {
  id: string;
  label: string;
  description?: string;
  concepturi?: string;
  match?: {
    type: string;
    language: string;
    text: string;
  };
}

interface WikidataSearchResponse {
  searchinfo?: { search: string };
  search?: WikidataSearchResult[];
  success?: number;
}

interface WikidataClaim {
  mainsnak?: {
    datavalue?: {
      value?: unknown;
      type?: string;
    };
  };
}

interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: Record<string, { title: string; url?: string }>;
}

interface WikidataEntitiesResponse {
  entities?: Record<string, WikidataEntity>;
  success?: number;
}

// Common Wikidata property IDs
const WIKIDATA_PROPERTIES = {
  INSTANCE_OF: 'P31',
  SUBCLASS_OF: 'P279',
  MANUFACTURER: 'P176',
  COUNTRY: 'P17',
  OFFICIAL_WEBSITE: 'P856',
  INCEPTION: 'P571',
  INDUSTRY: 'P452',
  HEADQUARTERS: 'P159',
  FOUNDED_BY: 'P112',
  LOGO_IMAGE: 'P154',
  PRODUCT_OR_MATERIAL: 'P186',
  BRAND: 'P1716',
  GTIN: 'P3962',
  EAN: 'P1550',
};

// Wikidata entity IDs for type detection
const WIKIDATA_TYPES = {
  PRODUCT: 'Q2424752', // product
  SOFTWARE: 'Q7397',
  COMPANY: 'Q4830453',
  BRAND: 'Q431289',
  BUSINESS: 'Q4830453',
  ORGANIZATION: 'Q43229',
  GOODS: 'Q28877',
};

export class WikidataSource implements EnrichmentSource {
  name = 'wikidata' as const;
  supportedSectors: SectorCode[] = ['unknown']; // Universal fallback
  priority = 10;
  confidenceWeight = 0.7;
  cacheTTLSeconds = 86400; // 24 hours

  private apiUrl = 'https://www.wikidata.org/w/api.php';
  private cache = getEnrichmentCache();
  private rateLimiter = getRateLimiter();
  private config = SOURCE_CONFIGS.wikidata;

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
    console.log('✅ Wikidata source initialized');
  }

  /**
   * Enrich an item with Wikidata data
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
    const searchResults = await this.searchEntities(item.name, context.skipCache);

    if (searchResults.length === 0) {
      return this.emptyResult('No matching entity found in Wikidata');
    }

    // Record the request
    if (this.config.rateLimit) {
      await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
    }

    // Find best match considering vendor if available
    const bestMatch = this.findBestMatch(item.name, item.vendor, searchResults);
    if (!bestMatch) {
      return this.emptyResult('No suitable match found in Wikidata');
    }

    // Get detailed entity data
    const entity = await this.getEntity(bestMatch.id, context.skipCache);
    if (!entity) {
      return this.emptyResult('Could not retrieve entity details from Wikidata');
    }

    return this.mapToEnrichmentResult(entity, bestMatch);
  }

  /**
   * Search for entities by name
   */
  async searchEntities(name: string, skipCache = false): Promise<WikidataSearchResult[]> {
    const cacheKey = `search:${name.toLowerCase()}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<WikidataSearchResult[]>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('action', 'wbsearchentities');
      url.searchParams.set('search', name);
      url.searchParams.set('language', 'en');
      url.searchParams.set('uselang', 'en');
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '10');
      url.searchParams.set('origin', '*');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (https://github.com/themis; contact@example.com)',
        },
      });

      if (!response.ok) {
        console.warn(`Wikidata search error: ${response.status}`);
        return [];
      }

      const data = await response.json() as WikidataSearchResponse;
      const results = data.search || [];

      // Cache the results
      if (results.length > 0) {
        await this.cache.set(this.name, cacheKey, results, this.cacheTTLSeconds);
      }

      return results;
    } catch (error) {
      console.error('Wikidata search failed:', error);
      return [];
    }
  }

  /**
   * Get entity details by ID
   */
  async getEntity(entityId: string, skipCache = false): Promise<WikidataEntity | null> {
    const cacheKey = `entity:${entityId}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<WikidataEntity>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(this.apiUrl);
      url.searchParams.set('action', 'wbgetentities');
      url.searchParams.set('ids', entityId);
      url.searchParams.set('languages', 'en|it');
      url.searchParams.set('props', 'labels|descriptions|claims|sitelinks');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (https://github.com/themis; contact@example.com)',
        },
      });

      if (!response.ok) {
        console.warn(`Wikidata entity error: ${response.status}`);
        return null;
      }

      const data = await response.json() as WikidataEntitiesResponse;
      const entity = data.entities?.[entityId];

      if (entity) {
        await this.cache.set(this.name, cacheKey, entity, this.cacheTTLSeconds);
      }

      return entity || null;
    } catch (error) {
      console.error('Wikidata entity fetch failed:', error);
      return null;
    }
  }

  /**
   * Find best matching search result
   */
  private findBestMatch(
    name: string,
    vendor: string | undefined,
    results: WikidataSearchResult[]
  ): WikidataSearchResult | null {
    const nameLower = name.toLowerCase();
    const vendorLower = vendor?.toLowerCase();

    let bestMatch: WikidataSearchResult | null = null;
    let bestScore = 0;

    for (const result of results) {
      let score = 0;
      const labelLower = result.label?.toLowerCase() || '';
      const descLower = result.description?.toLowerCase() || '';

      // Label match
      if (labelLower === nameLower) {
        score += 5; // Exact match
      } else if (labelLower.includes(nameLower) || nameLower.includes(labelLower)) {
        score += 3; // Partial match
      }

      // Vendor in description
      if (vendorLower && descLower.includes(vendorLower)) {
        score += 2;
      }

      // Prefer entities with descriptions (more likely to be notable)
      if (result.description) {
        score += 1;
      }

      // Check if description suggests product/company/software
      const productKeywords = ['product', 'software', 'company', 'brand', 'manufacturer', 'service'];
      for (const kw of productKeywords) {
        if (descLower.includes(kw)) {
          score += 0.5;
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  /**
   * Extract claim value from entity
   */
  private getClaimValue(entity: WikidataEntity, propertyId: string): string | null {
    const claims = entity.claims?.[propertyId];
    if (!claims || claims.length === 0) return null;

    const value = claims[0].mainsnak?.datavalue?.value;
    if (!value) return null;

    // Handle different value types
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value !== null) {
      if ('id' in value) {
        return (value as { id: string }).id; // Entity reference
      } else if ('time' in value) {
        return (value as { time: string }).time; // Time value
      } else if ('text' in value) {
        return (value as { text: string }).text; // Monolingual text
      }
    }

    return null;
  }

  /**
   * Get entity label by ID (simplified - would need another API call for full resolution)
   */
  private getEntityLabel(entityId: string): string {
    // This would ideally resolve the entity, but for performance we just return the ID
    // In a production system, we might batch these lookups
    return entityId;
  }

  /**
   * Map entity to EnrichmentResult
   */
  private mapToEnrichmentResult(
    entity: WikidataEntity,
    searchResult: WikidataSearchResult
  ): EnrichmentResult {
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];

    // Entity ID
    enrichedFields.wikidata_id = entity.id;
    fieldsEnriched.push('wikidata_id');

    // Label
    const label = entity.labels?.en?.value || entity.labels?.it?.value || searchResult.label;
    if (label) {
      enrichedFields.canonical_name = label;
      fieldsEnriched.push('canonical_name');
      reasoning.push(`Matched entity: "${label}" (${entity.id})`);
    }

    // Description
    const description = entity.descriptions?.en?.value || entity.descriptions?.it?.value;
    if (description) {
      enrichedFields.description = description;
      fieldsEnriched.push('description');
      reasoning.push(`Description: ${description}`);
    }

    // Manufacturer
    const manufacturerId = this.getClaimValue(entity, WIKIDATA_PROPERTIES.MANUFACTURER);
    if (manufacturerId) {
      enrichedFields.manufacturer_wikidata_id = manufacturerId;
      fieldsEnriched.push('manufacturer_wikidata_id');
    }

    // Official website
    const website = this.getClaimValue(entity, WIKIDATA_PROPERTIES.OFFICIAL_WEBSITE);
    if (website) {
      enrichedFields.website = website;
      fieldsEnriched.push('website');
      reasoning.push(`Website: ${website}`);
    }

    // Industry
    const industryId = this.getClaimValue(entity, WIKIDATA_PROPERTIES.INDUSTRY);
    if (industryId) {
      enrichedFields.industry_wikidata_id = industryId;
      fieldsEnriched.push('industry_wikidata_id');
    }

    // Country
    const countryId = this.getClaimValue(entity, WIKIDATA_PROPERTIES.COUNTRY);
    if (countryId) {
      enrichedFields.country_wikidata_id = countryId;
      fieldsEnriched.push('country_wikidata_id');
    }

    // Inception date
    const inception = this.getClaimValue(entity, WIKIDATA_PROPERTIES.INCEPTION);
    if (inception) {
      enrichedFields.inception = inception;
      fieldsEnriched.push('inception');
    }

    // GTIN/EAN
    const gtin = this.getClaimValue(entity, WIKIDATA_PROPERTIES.GTIN);
    const ean = this.getClaimValue(entity, WIKIDATA_PROPERTIES.EAN);
    if (gtin || ean) {
      enrichedFields.gtin = gtin || ean;
      fieldsEnriched.push('gtin');
    }

    // Wikipedia link
    const enWiki = entity.sitelinks?.enwiki?.title;
    if (enWiki) {
      enrichedFields.wikipedia_url = `https://en.wikipedia.org/wiki/${encodeURIComponent(enWiki.replace(/ /g, '_'))}`;
      fieldsEnriched.push('wikipedia_url');
    }

    // Determine entity type from claims
    const instanceOf = this.getClaimValue(entity, WIKIDATA_PROPERTIES.INSTANCE_OF);
    if (instanceOf) {
      enrichedFields.entity_type_wikidata_id = instanceOf;
      fieldsEnriched.push('entity_type_wikidata_id');

      // Map to readable type
      let entityType = 'entity';
      if (instanceOf === WIKIDATA_TYPES.SOFTWARE) entityType = 'software';
      else if (instanceOf === WIKIDATA_TYPES.COMPANY || instanceOf === WIKIDATA_TYPES.BUSINESS) entityType = 'company';
      else if (instanceOf === WIKIDATA_TYPES.PRODUCT || instanceOf === WIKIDATA_TYPES.GOODS) entityType = 'product';
      else if (instanceOf === WIKIDATA_TYPES.BRAND) entityType = 'brand';

      enrichedFields.entity_type = entityType;
      reasoning.push(`Type: ${entityType}`);
    }

    // Calculate confidence based on data completeness
    let confidence = 0.6; // Base confidence
    if (entity.descriptions?.en) confidence += 0.1;
    if (entity.sitelinks?.enwiki) confidence += 0.1;
    if (fieldsEnriched.length > 5) confidence += 0.1;
    confidence = Math.min(confidence, 0.85);

    return {
      source: this.name,
      confidence,
      matched_entry_id: entity.id,
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
let sourceInstance: WikidataSource | null = null;

export function getWikidataSource(): WikidataSource {
  if (!sourceInstance) {
    sourceInstance = new WikidataSource();
  }
  return sourceInstance;
}

export default WikidataSource;
