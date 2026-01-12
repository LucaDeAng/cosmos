/**
 * Product Knowledge Layer - Main Exports
 *
 * This module provides a unified interface for product/service enrichment
 * using multiple knowledge sources:
 *
 * 1. Company Catalogs (RAG) - Curated product/service examples
 * 2. Icecat MCP - 45M+ tech products with structured data
 * 3. GS1 Taxonomy - Global product classification standard
 * 4. Company History - Learned from validated extractions
 * 5. Active Learning - Learning from user corrections
 * 6. Semantic Deduplication - Detecting and merging duplicates
 * 7. Multi-Sector Sources - Open Food Facts, Open Beauty Facts, etc.
 */

// Types
export * from './types';

// Sector Detection
export {
  SectorDetector,
  getSectorDetector,
  SECTOR_KEYWORDS,
  getSectorKeywords,
  getAllKeywords,
  ALL_SECTORS,
} from './sectors';

// Source Registry
export {
  SourceRegistry,
  getSourceRegistry,
  type EnrichmentSource,
  SOURCE_CONFIGS,
  getSourceConfig,
  getSourcesForSector,
  getSectorSpecificSources,
  getUniversalFallbackSources,
} from './registry';

// Utils (Cache & Rate Limiter)
export {
  EnrichmentCache,
  getEnrichmentCache,
  RateLimiter,
  getRateLimiter,
} from './utils';

// Sources - Existing
export {
  CompanyCatalogSource,
  getCompanyCatalogSource
} from './sources/companyCatalogSource';

export {
  IcecatMCPSource,
  getIcecatMCPSource
} from './sources/icecatMCPSource';

export {
  GS1TaxonomySource,
  getGS1TaxonomySource
} from './sources/gs1TaxonomySource';

export {
  CompanyHistorySource,
  getCompanyHistorySource
} from './sources/companyHistorySource';

// Sources - Multi-Sector
export {
  OpenFoodFactsSource,
  getOpenFoodFactsSource
} from './sources/openFoodFactsSource';

export {
  OpenBeautyFactsSource,
  getOpenBeautyFactsSource
} from './sources/openBeautyFactsSource';

export {
  UNSPSCSource,
  getUNSPSCSource,
  type UNSPSCCategory
} from './sources/unspscSource';

// Healthcare/Pharma sources
export {
  OpenFDASource,
  getOpenFDASource
} from './sources/openFdaSource';

// Universal fallback sources
export {
  WikidataSource,
  getWikidataSource
} from './sources/wikidataSource';

export {
  DBpediaSource,
  getDBpediaSource
} from './sources/dbpediaSource';

// Deduplication
export {
  SemanticDeduplicator,
  getSemanticDeduplicator,
  type DuplicateCluster as DeduplicationCluster,
  type DeduplicatableItem
} from './deduplication';

// Active Learning
export {
  CorrectionLearner,
  getCorrectionLearner,
  type CorrectionRecord,
  type SimilarCorrection,
  type LearningStats
} from './learning';

// Main Orchestrator
export {
  ProductKnowledgeOrchestrator,
  getProductKnowledgeOrchestrator,
  type ExtractedItem,
  type EnrichmentStats
} from './ProductKnowledgeOrchestrator';

// Utility function for quick enrichment
import { getProductKnowledgeOrchestrator, ExtractedItem } from './ProductKnowledgeOrchestrator';
import type { EnrichmentConfig, EnrichedProduct } from './types';

/**
 * Quick enrichment of a single item
 */
export async function enrichProduct(
  item: ExtractedItem,
  config?: EnrichmentConfig
): Promise<EnrichedProduct> {
  const orchestrator = getProductKnowledgeOrchestrator();
  return orchestrator.enrichItem(item, config);
}

/**
 * Quick enrichment of multiple items
 */
export async function enrichProducts(
  items: ExtractedItem[],
  config?: EnrichmentConfig
): Promise<EnrichedProduct[]> {
  const orchestrator = getProductKnowledgeOrchestrator();
  const result = await orchestrator.enrichItems(items, config);
  return result.items;
}

/**
 * Initialize all knowledge sources
 */
export async function initializeKnowledgeLayer(): Promise<void> {
  const orchestrator = getProductKnowledgeOrchestrator();
  await orchestrator.initialize();
}

/**
 * Record a user correction for active learning
 */
export async function recordCorrection(
  tenantId: string,
  original: Record<string, unknown>,
  corrected: Record<string, unknown>
): Promise<{ success: boolean; correctedFields: string[] }> {
  const orchestrator = getProductKnowledgeOrchestrator();
  return orchestrator.recordCorrection(tenantId, original, corrected);
}

/**
 * Get canonical name for a product (if known alias)
 */
export function getCanonicalName(productName: string): string | null {
  const orchestrator = getProductKnowledgeOrchestrator();
  return orchestrator.getCanonicalName(productName);
}

export default {
  getProductKnowledgeOrchestrator,
  enrichProduct,
  enrichProducts,
  initializeKnowledgeLayer,
  recordCorrection,
  getCanonicalName
};
