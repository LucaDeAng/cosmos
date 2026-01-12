/**
 * OpenFDA Source
 *
 * Integrates with OpenFDA API for pharmaceutical and medical device enrichment.
 * Provides access to:
 * - Drug labels (NDC, brand name, generic name, manufacturer)
 * - Device 510(k) clearances
 * - Adverse event reports
 *
 * API is free with rate limits: 240 requests/minute without API key
 * https://open.fda.gov/apis/
 */

import type { SectorCode, EnrichmentResult, EnrichmentContext } from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import { getEnrichmentCache } from '../utils/enrichmentCache';
import { getRateLimiter } from '../utils/rateLimiter';
import { SOURCE_CONFIGS } from '../registry/sourceConfig';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

export interface OpenFDADrugLabel {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    product_type?: string[];
    route?: string[];
    substance_name?: string[];
    rxcui?: string[];
    spl_id?: string[];
    package_ndc?: string[];
  };
  purpose?: string[];
  indications_and_usage?: string[];
  dosage_and_administration?: string[];
  warnings?: string[];
  active_ingredient?: string[];
  inactive_ingredient?: string[];
}

export interface OpenFDADevice510k {
  k_number: string;
  applicant: string;
  device_name: string;
  product_code: string;
  date_received: string;
  decision_date: string;
  decision_description: string;
  openfda?: {
    device_class?: string;
    device_name?: string;
    medical_specialty_description?: string;
    regulation_number?: string;
  };
}

interface OpenFDASearchResponse<T> {
  meta?: {
    results?: {
      total: number;
      skip: number;
      limit: number;
    };
  };
  results?: T[];
  error?: {
    code: string;
    message: string;
  };
}

export class OpenFDASource implements EnrichmentSource {
  name = 'openfda' as const;
  supportedSectors: SectorCode[] = ['healthcare_pharma'];
  priority = 2;
  confidenceWeight = 0.95;
  cacheTTLSeconds = 86400; // 24 hours

  private baseUrl = 'https://api.fda.gov';
  private cache = getEnrichmentCache();
  private rateLimiter = getRateLimiter();
  private config = SOURCE_CONFIGS.openfda;

  /**
   * Check if source is enabled (always true, no API key required)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Initialize the source (no-op for this source)
   */
  async initialize(): Promise<void> {
    console.log('✅ OpenFDA source initialized');
  }

  /**
   * Enrich an item with OpenFDA data
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

    // Try drug label search first
    const drugResult = await this.searchDrugLabel(item.name, item.vendor, context.skipCache);
    if (drugResult) {
      if (this.config.rateLimit) {
        await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
      }
      return this.mapDrugToEnrichmentResult(drugResult, item.name);
    }

    // Try device 510k search
    const deviceResult = await this.searchDevice510k(item.name, item.vendor, context.skipCache);
    if (deviceResult) {
      if (this.config.rateLimit) {
        await this.rateLimiter.recordRequest(this.name, this.config.rateLimit, context.tenantId);
      }
      return this.mapDeviceToEnrichmentResult(deviceResult, item.name);
    }

    return this.emptyResult('No matching product found in OpenFDA');
  }

  /**
   * Search drug labels by name
   */
  async searchDrugLabel(
    name: string,
    manufacturer?: string,
    skipCache = false
  ): Promise<OpenFDADrugLabel | null> {
    const searchQuery = this.buildDrugSearchQuery(name, manufacturer);
    const cacheKey = `drug:${searchQuery}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<OpenFDADrugLabel>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(`${this.baseUrl}/drug/label.json`);
      url.searchParams.set('search', searchQuery);
      url.searchParams.set('limit', '5');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (contact@example.com)',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null; // No results
        console.warn(`OpenFDA drug API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as OpenFDASearchResponse<OpenFDADrugLabel>;

      if (data.error || !data.results || data.results.length === 0) {
        return null;
      }

      // Find best match
      const bestMatch = this.findBestDrugMatch(name, manufacturer, data.results);
      if (bestMatch) {
        await this.cache.set(this.name, cacheKey, bestMatch, this.cacheTTLSeconds);
        return bestMatch;
      }

      return null;
    } catch (error) {
      console.error('OpenFDA drug search failed:', error);
      return null;
    }
  }

  /**
   * Search device 510k clearances by name
   */
  async searchDevice510k(
    name: string,
    applicant?: string,
    skipCache = false
  ): Promise<OpenFDADevice510k | null> {
    const searchQuery = this.buildDeviceSearchQuery(name, applicant);
    const cacheKey = `device:${searchQuery}`;

    // Check cache first
    if (!skipCache) {
      const cached = await this.cache.get<OpenFDADevice510k>(this.name, cacheKey);
      if (cached) return cached;
    }

    try {
      const url = new URL(`${this.baseUrl}/device/510k.json`);
      url.searchParams.set('search', searchQuery);
      url.searchParams.set('limit', '5');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'THEMIS/1.0 (contact@example.com)',
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        console.warn(`OpenFDA device API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as OpenFDASearchResponse<OpenFDADevice510k>;

      if (data.error || !data.results || data.results.length === 0) {
        return null;
      }

      // Find best match
      const bestMatch = this.findBestDeviceMatch(name, applicant, data.results);
      if (bestMatch) {
        await this.cache.set(this.name, cacheKey, bestMatch, this.cacheTTLSeconds);
        return bestMatch;
      }

      return null;
    } catch (error) {
      console.error('OpenFDA device search failed:', error);
      return null;
    }
  }

  /**
   * Build drug search query
   */
  private buildDrugSearchQuery(name: string, manufacturer?: string): string {
    // Clean and escape the search term
    const cleanName = name.replace(/[^\w\s]/g, '').trim();
    const terms: string[] = [];

    // Search in brand name and generic name
    terms.push(`(openfda.brand_name:"${cleanName}" OR openfda.generic_name:"${cleanName}")`);

    if (manufacturer) {
      const cleanMfr = manufacturer.replace(/[^\w\s]/g, '').trim();
      terms.push(`openfda.manufacturer_name:"${cleanMfr}"`);
    }

    return terms.join(' AND ');
  }

  /**
   * Build device search query
   */
  private buildDeviceSearchQuery(name: string, applicant?: string): string {
    const cleanName = name.replace(/[^\w\s]/g, '').trim();
    const terms: string[] = [];

    terms.push(`device_name:"${cleanName}"`);

    if (applicant) {
      const cleanApplicant = applicant.replace(/[^\w\s]/g, '').trim();
      terms.push(`applicant:"${cleanApplicant}"`);
    }

    return terms.join(' AND ');
  }

  /**
   * Find best matching drug from results
   */
  private findBestDrugMatch(
    name: string,
    manufacturer: string | undefined,
    results: OpenFDADrugLabel[]
  ): OpenFDADrugLabel | null {
    const nameLower = name.toLowerCase();
    const mfrLower = manufacturer?.toLowerCase();

    let bestMatch: OpenFDADrugLabel | null = null;
    let bestScore = 0;

    for (const result of results) {
      let score = 0;
      const brandNames = result.openfda?.brand_name?.map(n => n.toLowerCase()) || [];
      const genericNames = result.openfda?.generic_name?.map(n => n.toLowerCase()) || [];
      const mfrNames = result.openfda?.manufacturer_name?.map(n => n.toLowerCase()) || [];

      // Check brand name match
      for (const bn of brandNames) {
        if (bn.includes(nameLower) || nameLower.includes(bn)) {
          score += 3;
          break;
        }
      }

      // Check generic name match
      for (const gn of genericNames) {
        if (gn.includes(nameLower) || nameLower.includes(gn)) {
          score += 2;
          break;
        }
      }

      // Check manufacturer match
      if (mfrLower) {
        for (const mfr of mfrNames) {
          if (mfr.includes(mfrLower) || mfrLower.includes(mfr)) {
            score += 1;
            break;
          }
        }
      }

      // Bonus for having complete data
      if (result.openfda?.product_ndc?.length) score += 0.5;
      if (result.purpose?.length) score += 0.5;
      if (result.indications_and_usage?.length) score += 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  /**
   * Find best matching device from results
   */
  private findBestDeviceMatch(
    name: string,
    applicant: string | undefined,
    results: OpenFDADevice510k[]
  ): OpenFDADevice510k | null {
    const nameLower = name.toLowerCase();
    const applicantLower = applicant?.toLowerCase();

    let bestMatch: OpenFDADevice510k | null = null;
    let bestScore = 0;

    for (const result of results) {
      let score = 0;
      const deviceName = result.device_name?.toLowerCase() || '';
      const resultApplicant = result.applicant?.toLowerCase() || '';

      // Check device name match
      if (deviceName.includes(nameLower) || nameLower.includes(deviceName)) {
        score += 3;
      }

      // Check applicant match
      if (applicantLower && (resultApplicant.includes(applicantLower) || applicantLower.includes(resultApplicant))) {
        score += 2;
      }

      // Bonus for approved devices
      if (result.decision_description?.toLowerCase().includes('substantially equivalent')) {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    return bestScore >= 2 ? bestMatch : null;
  }

  /**
   * Map drug label to EnrichmentResult
   */
  private mapDrugToEnrichmentResult(drug: OpenFDADrugLabel, searchName: string): EnrichmentResult {
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];

    // Brand name
    if (drug.openfda?.brand_name?.length) {
      enrichedFields.brand_name = drug.openfda.brand_name[0];
      fieldsEnriched.push('brand_name');
    }

    // Generic name
    if (drug.openfda?.generic_name?.length) {
      enrichedFields.generic_name = drug.openfda.generic_name[0];
      fieldsEnriched.push('generic_name');
    }

    // Manufacturer
    if (drug.openfda?.manufacturer_name?.length) {
      enrichedFields.vendor = drug.openfda.manufacturer_name[0];
      fieldsEnriched.push('vendor');
    }

    // NDC (National Drug Code)
    if (drug.openfda?.product_ndc?.length) {
      enrichedFields.ndc = drug.openfda.product_ndc[0];
      fieldsEnriched.push('ndc');
    }

    // RxCUI (RxNorm identifier)
    if (drug.openfda?.rxcui?.length) {
      enrichedFields.rxcui = drug.openfda.rxcui[0];
      fieldsEnriched.push('rxcui');
    }

    // Product type
    if (drug.openfda?.product_type?.length) {
      enrichedFields.product_type = drug.openfda.product_type[0];
      fieldsEnriched.push('product_type');
    }

    // Route of administration
    if (drug.openfda?.route?.length) {
      enrichedFields.route = drug.openfda.route;
      fieldsEnriched.push('route');
    }

    // Active ingredients
    if (drug.openfda?.substance_name?.length) {
      enrichedFields.active_ingredients = drug.openfda.substance_name;
      fieldsEnriched.push('active_ingredients');
    }

    // Purpose/Indications
    if (drug.purpose?.length) {
      enrichedFields.purpose = drug.purpose[0];
      fieldsEnriched.push('purpose');
    }

    if (drug.indications_and_usage?.length) {
      enrichedFields.indications = drug.indications_and_usage[0].substring(0, 500);
      fieldsEnriched.push('indications');
    }

    const brandName = drug.openfda?.brand_name?.[0] || searchName;
    const genericName = drug.openfda?.generic_name?.[0] || '';
    const manufacturer = drug.openfda?.manufacturer_name?.[0] || 'Unknown';

    return {
      source: this.name,
      confidence: 0.9,
      matched_entry_id: drug.openfda?.spl_id?.[0] || drug.openfda?.product_ndc?.[0],
      fields_enriched: fieldsEnriched,
      enrichedFields,
      reasoning: [
        `Matched drug: "${brandName}"${genericName ? ` (${genericName})` : ''}`,
        `Manufacturer: ${manufacturer}`,
        drug.openfda?.product_type?.[0] ? `Type: ${drug.openfda.product_type[0]}` : '',
        drug.openfda?.route?.length ? `Route: ${drug.openfda.route.join(', ')}` : '',
      ].filter(Boolean),
    };
  }

  /**
   * Map device 510k to EnrichmentResult
   */
  private mapDeviceToEnrichmentResult(device: OpenFDADevice510k, searchName: string): EnrichmentResult {
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];

    // Device name
    enrichedFields.device_name = device.device_name;
    fieldsEnriched.push('device_name');

    // Manufacturer/Applicant
    if (device.applicant) {
      enrichedFields.vendor = device.applicant;
      fieldsEnriched.push('vendor');
    }

    // 510k number
    enrichedFields.k_number = device.k_number;
    fieldsEnriched.push('k_number');

    // Product code
    if (device.product_code) {
      enrichedFields.product_code = device.product_code;
      fieldsEnriched.push('product_code');
    }

    // Device class
    if (device.openfda?.device_class) {
      enrichedFields.device_class = device.openfda.device_class;
      fieldsEnriched.push('device_class');
    }

    // Medical specialty
    if (device.openfda?.medical_specialty_description) {
      enrichedFields.medical_specialty = device.openfda.medical_specialty_description;
      fieldsEnriched.push('medical_specialty');
    }

    // Clearance decision
    enrichedFields.clearance_status = device.decision_description;
    fieldsEnriched.push('clearance_status');

    // Clearance date
    if (device.decision_date) {
      enrichedFields.clearance_date = device.decision_date;
      fieldsEnriched.push('clearance_date');
    }

    return {
      source: this.name,
      confidence: 0.85,
      matched_entry_id: device.k_number,
      fields_enriched: fieldsEnriched,
      enrichedFields,
      reasoning: [
        `Matched device: "${device.device_name}"`,
        `Applicant: ${device.applicant}`,
        `510(k) Number: ${device.k_number}`,
        `Status: ${device.decision_description}`,
        device.openfda?.medical_specialty_description
          ? `Specialty: ${device.openfda.medical_specialty_description}`
          : '',
      ].filter(Boolean),
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
let sourceInstance: OpenFDASource | null = null;

export function getOpenFDASource(): OpenFDASource {
  if (!sourceInstance) {
    sourceInstance = new OpenFDASource();
  }
  return sourceInstance;
}

export default OpenFDASource;
