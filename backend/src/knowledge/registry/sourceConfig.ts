/**
 * Source Configuration
 *
 * Default configurations for all enrichment sources.
 * These can be overridden when registering sources.
 */

import type { SectorCode, KnowledgeSourceType, EnrichmentSourceConfig } from '../types';

/**
 * Default source configurations
 */
export const SOURCE_CONFIGS: Record<string, EnrichmentSourceConfig> = {
  // ===== Existing Sources =====

  company_catalog: {
    name: 'company_catalog',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'financial_services',
      'professional_services',
      'automotive',
    ],
    priority: 1,
    confidenceWeight: 0.9,
    cacheTTLSeconds: 3600, // 1 hour
  },

  company_history: {
    name: 'company_history',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'financial_services',
      'professional_services',
      'automotive',
    ],
    priority: 0, // Highest priority - learned from user
    confidenceWeight: 0.95,
  },

  icecat: {
    name: 'icecat',
    supportedSectors: ['it_software'],
    priority: 2,
    confidenceWeight: 1.0, // Verified product data
    requiresApiKey: true,
    apiKeyEnvVar: 'ICECAT_API_KEY',
    cacheTTLSeconds: 86400, // 24 hours
  },

  gs1_taxonomy: {
    name: 'gs1_taxonomy',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'automotive',
    ],
    priority: 5,
    confidenceWeight: 0.7, // Classification only
  },

  // ===== New Multi-Sector Sources =====

  open_food_facts: {
    name: 'open_food_facts',
    supportedSectors: ['food_beverage'],
    priority: 2,
    confidenceWeight: 0.95,
    rateLimit: {
      maxRequests: 100,
      windowSeconds: 60, // 100 per minute
      scope: 'global',
    },
    cacheTTLSeconds: 86400, // 24 hours
  },

  open_beauty_facts: {
    name: 'open_beauty_facts',
    supportedSectors: ['consumer_goods'],
    priority: 2,
    confidenceWeight: 0.95,
    rateLimit: {
      maxRequests: 100,
      windowSeconds: 60,
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  openfda: {
    name: 'openfda',
    supportedSectors: ['healthcare_pharma'],
    priority: 2,
    confidenceWeight: 0.95,
    rateLimit: {
      maxRequests: 240,
      windowSeconds: 60, // 240 per minute (4 per second)
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  rxnorm: {
    name: 'rxnorm',
    supportedSectors: ['healthcare_pharma'],
    priority: 3,
    confidenceWeight: 0.9,
    rateLimit: {
      maxRequests: 20,
      windowSeconds: 1, // 20 per second
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  unspsc: {
    name: 'unspsc',
    supportedSectors: [
      'industrial',
      'it_software',
      'healthcare_pharma',
      'professional_services',
      'financial_services',
      'automotive',
    ],
    priority: 3,
    confidenceWeight: 0.85,
    // No rate limit - local file
  },

  gs1_gpc: {
    name: 'gs1_gpc',
    supportedSectors: ['food_beverage', 'consumer_goods'],
    priority: 4,
    confidenceWeight: 0.75,
    // No rate limit - local file
  },

  open_corporates: {
    name: 'open_corporates',
    supportedSectors: [
      'financial_services',
      'professional_services',
    ],
    priority: 3,
    confidenceWeight: 0.85,
    rateLimit: {
      maxRequests: 50,
      windowSeconds: 2592000, // 50 per month
      scope: 'global',
    },
    cacheTTLSeconds: 2592000, // 30 days
  },

  // ===== Universal Fallbacks =====

  wikidata: {
    name: 'wikidata',
    supportedSectors: ['unknown'], // Universal fallback
    priority: 10,
    confidenceWeight: 0.7,
    rateLimit: {
      maxRequests: 50,
      windowSeconds: 1, // 50 per second
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  dbpedia: {
    name: 'dbpedia',
    supportedSectors: ['unknown'], // Universal fallback
    priority: 11,
    confidenceWeight: 0.65,
    rateLimit: {
      maxRequests: 10,
      windowSeconds: 1,
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  // ===== Cross-Sector Taxonomy Sources =====

  google_taxonomy: {
    name: 'google_taxonomy',
    supportedSectors: [
      'it_software',
      'consumer_goods',
      'food_beverage',
      'healthcare_pharma',
      'industrial',
      'automotive',
      'unknown', // Universal e-commerce classification
    ],
    priority: 4,
    confidenceWeight: 0.8,
    cacheTTLSeconds: 86400, // 24 hours
  },

  schema_org: {
    name: 'schema_org',
    supportedSectors: [
      'it_software',
      'consumer_goods',
      'food_beverage',
      'healthcare_pharma',
      'industrial',
      'automotive',
      'financial_services',
      'professional_services',
      'unknown', // Universal - works for all
    ],
    priority: 5,
    confidenceWeight: 0.75,
    cacheTTLSeconds: 86400,
  },

  // ===== Italian/EU Classification Sources =====

  ateco: {
    name: 'ateco',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'financial_services',
      'professional_services',
      'automotive',
      'unknown', // Works for Italian businesses
    ],
    priority: 3,
    confidenceWeight: 0.85,
    cacheTTLSeconds: 86400, // 24 hours
    // No rate limit - local file
  },

  prodcom: {
    name: 'prodcom',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'automotive',
      'unknown', // Works for EU manufacturing
    ],
    priority: 4,
    confidenceWeight: 0.8,
    cacheTTLSeconds: 86400, // 24 hours
    // No rate limit - local file
  },

  cpv: {
    name: 'cpv',
    supportedSectors: [
      'it_software',
      'food_beverage',
      'consumer_goods',
      'healthcare_pharma',
      'industrial',
      'financial_services',
      'professional_services',
      'automotive',
      'unknown', // EU public procurement
    ],
    priority: 4,
    confidenceWeight: 0.8,
    cacheTTLSeconds: 86400,
    // No rate limit - local file
  },

  // ===== Sector-Specific Sources =====

  nhtsa: {
    name: 'nhtsa',
    supportedSectors: ['automotive'],
    priority: 2,
    confidenceWeight: 0.9,
    rateLimit: {
      maxRequests: 10,
      windowSeconds: 1, // 10 per second
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  gleif: {
    name: 'gleif',
    supportedSectors: ['financial_services', 'professional_services'],
    priority: 2,
    confidenceWeight: 0.9,
    rateLimit: {
      maxRequests: 10,
      windowSeconds: 1, // 10 per second
      scope: 'global',
    },
    cacheTTLSeconds: 86400,
  },

  llm_fallback: {
    name: 'llm_fallback',
    supportedSectors: ['unknown'], // Universal fallback
    priority: 100, // Lowest priority - only when nothing else works
    confidenceWeight: 0.7,
    requiresApiKey: true,
    apiKeyEnvVar: 'OPENAI_API_KEY',
  },
};

/**
 * Get configuration for a specific source
 */
export function getSourceConfig(name: KnowledgeSourceType): EnrichmentSourceConfig | undefined {
  return SOURCE_CONFIGS[name];
}

/**
 * Get all sources for a specific sector
 */
export function getSourcesForSector(sector: SectorCode): EnrichmentSourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter(config =>
    config.supportedSectors.includes(sector) || config.supportedSectors.includes('unknown')
  );
}

/**
 * Get all sector-specific sources (excluding universal fallbacks)
 */
export function getSectorSpecificSources(): EnrichmentSourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter(
    config => !config.supportedSectors.includes('unknown')
  );
}

/**
 * Get all universal fallback sources
 */
export function getUniversalFallbackSources(): EnrichmentSourceConfig[] {
  return Object.values(SOURCE_CONFIGS).filter(config =>
    config.supportedSectors.includes('unknown')
  );
}
