/**
 * Icecat MCP Source
 *
 * Integrates with Icecat product database via their API.
 * Icecat contains 45M+ tech products with structured data including:
 * - GTIN/EAN/UPC codes
 * - Brand information
 * - Technical specifications
 * - Product images
 * - Category classification
 *
 * Note: Requires ICECAT_API_KEY in environment variables.
 * See: https://iceclog.com/how-to-connect-claude-to-icecat-mcp/
 */

import type { IcecatProduct, EnrichmentResult } from '../types';

interface IcecatSearchResult {
  products: IcecatProduct[];
  total: number;
}

interface IcecatApiResponse {
  data?: {
    GeneralInfo?: {
      IcecatId?: string;
      Title?: string;
      Brand?: string;
      BrandLogo?: string;
      ProductName?: string;
      Category?: {
        Name?: string;
        CategoryId?: string;
      };
      Description?: {
        LongDesc?: string;
        ShortDesc?: string;
      };
    };
    FeaturesGroups?: Array<{
      FeatureGroup?: {
        Name?: string;
      };
      Features?: Array<{
        Feature?: {
          Name?: string;
          Value?: string;
        };
      }>;
    }>;
    Gallery?: Array<{
      Pic?: string;
      PicHeight?: number;
      PicWidth?: number;
    }>;
  };
  Code?: number;
  Message?: string;
}

interface EnrichmentResultWithFields extends EnrichmentResult {
  enrichedFields: Record<string, unknown>;
}

export class IcecatMCPSource {
  private apiKey: string;
  private appKey: string;
  private baseUrl = 'https://live.icecat.biz/api';
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.ICECAT_API_KEY || '';
    this.appKey = process.env.ICECAT_APP_KEY || '';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      console.log('⚠️  Icecat MCP: API key not configured, source disabled');
      console.log('   Set ICECAT_API_KEY environment variable to enable');
    }
  }

  /**
   * Check if Icecat source is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Search Icecat by product name/brand
   */
  async search(query: string, limit = 5): Promise<IcecatProduct[]> {
    if (!this.enabled) return [];

    try {
      const url = new URL(`${this.baseUrl}/?`);
      url.searchParams.set('UserName', this.apiKey);
      url.searchParams.set('Language', 'EN');
      url.searchParams.set('Search', query);
      url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Don't spam logs for 400 errors on automotive/non-electronics products
        // Icecat is primarily for electronics - 400/404 on automotive is expected
        if (response.status !== 400 && response.status !== 404) {
          console.error(`Icecat API error: ${response.status} ${response.statusText}`);
        }
        return [];
      }

      const data = await response.json() as { data?: { products?: unknown[] } };

      // Parse Icecat response format
      if (data.data?.products) {
        return (data.data.products as Record<string, unknown>[]).map((p) => this.parseIcecatProduct(p));
      }

      return [];
    } catch (error) {
      console.error('Icecat search error:', error);
      return [];
    }
  }

  /**
   * Get product by GTIN/EAN/UPC
   */
  async getByGtin(gtin: string): Promise<IcecatProduct | null> {
    if (!this.enabled) return null;

    try {
      // Clean GTIN
      const cleanGtin = gtin.replace(/[^0-9]/g, '');

      const url = new URL(`${this.baseUrl}/?`);
      url.searchParams.set('UserName', this.apiKey);
      url.searchParams.set('Language', 'EN');
      url.searchParams.set('GTIN', cleanGtin);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          return null; // Product not found or bad request (common for non-electronics)
        }
        console.error(`Icecat GTIN lookup error: ${response.status}`);
        return null;
      }

      const data = await response.json() as IcecatApiResponse;

      if (data.Code && data.Code !== 1) {
        return null; // Error response
      }

      return this.parseIcecatApiResponse(data, cleanGtin);
    } catch (error) {
      console.error('Icecat GTIN lookup error:', error);
      return null;
    }
  }

  /**
   * Get product by Brand + MPN (Manufacturer Part Number)
   */
  async getByBrandMpn(brand: string, mpn: string): Promise<IcecatProduct | null> {
    if (!this.enabled) return null;

    try {
      const url = new URL(`${this.baseUrl}/?`);
      url.searchParams.set('UserName', this.apiKey);
      url.searchParams.set('Language', 'EN');
      url.searchParams.set('Brand', brand);
      url.searchParams.set('ProductCode', mpn);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return null;

      const data = await response.json() as IcecatApiResponse;

      if (data.Code && data.Code !== 1) {
        return null;
      }

      return this.parseIcecatApiResponse(data);
    } catch (error) {
      console.error('Icecat Brand+MPN lookup error:', error);
      return null;
    }
  }

  /**
   * Enrich extracted product with Icecat data
   */
  async enrich(
    extracted: {
      name: string;
      vendor?: string;
      gtin?: string;
      ean?: string;
      mpn?: string;
    }
  ): Promise<EnrichmentResultWithFields> {
    if (!this.enabled) {
      return {
        source: 'icecat',
        confidence: 0,
        fields_enriched: [],
        reasoning: ['Icecat source not enabled (API key not configured)'],
        enrichedFields: {}
      };
    }

    let icecatProduct: IcecatProduct | null = null;
    let matchMethod = '';

    // Priority 1: Try GTIN/EAN (most accurate)
    if (extracted.gtin) {
      icecatProduct = await this.getByGtin(extracted.gtin);
      if (icecatProduct) matchMethod = 'GTIN';
    } else if (extracted.ean) {
      icecatProduct = await this.getByGtin(extracted.ean);
      if (icecatProduct) matchMethod = 'EAN';
    }

    // Priority 2: Try Brand + MPN
    if (!icecatProduct && extracted.vendor && extracted.mpn) {
      icecatProduct = await this.getByBrandMpn(extracted.vendor, extracted.mpn);
      if (icecatProduct) matchMethod = 'Brand+MPN';
    }

    // Priority 3: Fallback to search
    if (!icecatProduct) {
      const searchQuery = `${extracted.vendor || ''} ${extracted.name}`.trim();
      const results = await this.search(searchQuery, 3);

      if (results.length > 0) {
        // Find best match using simple string similarity
        icecatProduct = this.findBestMatch(extracted.name, results);
        if (icecatProduct) matchMethod = 'Search';
      }
    }

    if (!icecatProduct) {
      return {
        source: 'icecat',
        confidence: 0,
        fields_enriched: [],
        reasoning: ['No matching product found in Icecat database'],
        enrichedFields: {}
      };
    }

    // Build enriched fields
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];

    if (icecatProduct.brand) {
      enrichedFields.vendor = icecatProduct.brand;
      fieldsEnriched.push('vendor');
    }

    if (icecatProduct.category) {
      enrichedFields.category = icecatProduct.category;
      fieldsEnriched.push('category');
    }

    if (icecatProduct.gtin) {
      enrichedFields.gtin = icecatProduct.gtin;
      fieldsEnriched.push('gtin');
    }

    if (icecatProduct.ean) {
      enrichedFields.ean = icecatProduct.ean;
      fieldsEnriched.push('ean');
    }

    if (icecatProduct.mpn) {
      enrichedFields.mpn = icecatProduct.mpn;
      fieldsEnriched.push('mpn');
    }

    if (icecatProduct.description) {
      enrichedFields.description = icecatProduct.description;
      fieldsEnriched.push('description');
    }

    if (icecatProduct.specs && Object.keys(icecatProduct.specs).length > 0) {
      enrichedFields.specifications = icecatProduct.specs;
      fieldsEnriched.push('specifications');
    }

    if (icecatProduct.images && icecatProduct.images.length > 0) {
      enrichedFields.images = icecatProduct.images;
      fieldsEnriched.push('images');
    }

    // Calculate confidence based on match method
    const confidenceByMethod: Record<string, number> = {
      'GTIN': 0.98,
      'EAN': 0.97,
      'Brand+MPN': 0.95,
      'Search': 0.80
    };

    reasoning.push(`Matched Icecat product: ${icecatProduct.brand} ${icecatProduct.name}`);
    reasoning.push(`Match method: ${matchMethod}`);
    reasoning.push(`Icecat ID: ${icecatProduct.icecat_id}`);
    reasoning.push(`Enriched ${fieldsEnriched.length} fields from Icecat`);

    return {
      source: 'icecat',
      confidence: confidenceByMethod[matchMethod] || 0.75,
      matched_entry_id: icecatProduct.icecat_id,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields
    };
  }

  /**
   * Parse Icecat API response to IcecatProduct
   */
  private parseIcecatApiResponse(
    response: IcecatApiResponse,
    gtin?: string
  ): IcecatProduct | null {
    const info = response.data?.GeneralInfo;
    if (!info) return null;

    // Extract specs from features
    const specs: Record<string, string | number> = {};
    for (const group of response.data?.FeaturesGroups || []) {
      for (const feature of group.Features || []) {
        if (feature.Feature?.Name && feature.Feature?.Value) {
          specs[feature.Feature.Name] = feature.Feature.Value;
        }
      }
    }

    // Extract images
    const images = (response.data?.Gallery || [])
      .map(img => img.Pic)
      .filter((url): url is string => !!url);

    return {
      icecat_id: info.IcecatId || '',
      gtin: gtin || '',
      brand: info.Brand || '',
      name: info.ProductName || info.Title || '',
      category: info.Category?.Name || '',
      specs,
      images,
      description: info.Description?.LongDesc || info.Description?.ShortDesc
    };
  }

  /**
   * Parse search result product
   */
  private parseIcecatProduct(raw: Record<string, unknown>): IcecatProduct {
    return {
      icecat_id: String(raw.IcecatId || raw.icecat_id || ''),
      gtin: String(raw.GTIN || raw.gtin || ''),
      brand: String(raw.Brand || raw.brand || ''),
      name: String(raw.Title || raw.ProductName || raw.name || ''),
      category: String(raw.Category || raw.category || ''),
      specs: (raw.specs as Record<string, string | number>) || {},
      images: (raw.images as string[]) || [],
      ean: String(raw.EAN || raw.ean || ''),
      mpn: String(raw.MPN || raw.ProductCode || raw.mpn || '')
    };
  }

  /**
   * Find best match from search results
   */
  private findBestMatch(
    searchName: string,
    results: IcecatProduct[]
  ): IcecatProduct | null {
    if (results.length === 0) return null;

    const normalizedSearch = searchName.toLowerCase();
    let bestMatch: IcecatProduct | null = null;
    let bestScore = 0;

    for (const product of results) {
      const normalizedProduct = `${product.brand} ${product.name}`.toLowerCase();

      // Simple word overlap scoring
      const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
      const productWords = normalizedProduct.split(/\s+/).filter(w => w.length > 2);

      let matchCount = 0;
      for (const word of searchWords) {
        if (productWords.some(pw => pw.includes(word) || word.includes(pw))) {
          matchCount++;
        }
      }

      const score = searchWords.length > 0 ? matchCount / searchWords.length : 0;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    // Return match only if score is reasonable
    return bestScore >= 0.5 ? bestMatch : null;
  }
}

// Singleton instance
let instance: IcecatMCPSource | null = null;

export function getIcecatMCPSource(): IcecatMCPSource {
  if (!instance) {
    instance = new IcecatMCPSource();
  }
  return instance;
}

export default IcecatMCPSource;
