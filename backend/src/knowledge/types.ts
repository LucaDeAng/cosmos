/**
 * Product Knowledge Layer - Shared Types
 *
 * Types used across all knowledge sources:
 * - Company Catalogs (RAG)
 * - Icecat MCP (Product Database)
 * - GS1 Taxonomy (Classification)
 * - Multi-sector sources (Open Food Facts, Open Beauty Facts, etc.)
 */

// ============================================================================
// SECTOR CODES (Multi-Sector Support)
// ============================================================================

export type SectorCode =
  | 'it_software'
  | 'food_beverage'
  | 'consumer_goods'
  | 'healthcare_pharma'
  | 'industrial'
  | 'financial_services'
  | 'professional_services'
  | 'automotive'
  // NEW SECTORS (Phase 2.3 - Industry-Specific Enrichment)
  | 'hr_payroll'
  | 'retail_ecommerce'
  | 'supply_chain_logistics'
  | 'real_estate'
  | 'banking'
  | 'insurance'
  | 'unknown';

// ============================================================================
// KNOWLEDGE SOURCE TYPES
// ============================================================================

export type KnowledgeSourceType =
  // Existing sources
  | 'company_catalog'
  | 'company_history'
  | 'icecat'
  | 'gs1_taxonomy'
  // Multi-sector sources
  | 'open_food_facts'
  | 'open_beauty_facts'
  | 'openfda'
  | 'rxnorm'
  | 'unspsc'
  | 'gs1_gpc'
  | 'open_corporates'
  // Cross-sector taxonomy sources
  | 'google_taxonomy'
  | 'schema_org'
  // Italian/EU classification sources
  | 'ateco'     // Italian ISTAT economic activity classification
  | 'prodcom'   // EU manufacturing products classification
  | 'cpv'       // EU Common Procurement Vocabulary
  // Sector-specific sources
  | 'nhtsa'     // US vehicle safety (automotive)
  | 'gleif'     // Legal Entity Identifier (financial)
  // NEW INDUSTRY-SPECIFIC SOURCES (Phase 2.3)
  | 'hr_payroll'
  | 'retail_ecommerce'
  | 'supply_chain'
  | 'real_estate'
  | 'banking'
  | 'insurance'
  // Universal fallbacks
  | 'wikidata'
  | 'dbpedia'
  | 'llm_fallback';

export interface KnowledgeSource {
  name: KnowledgeSourceType;
  priority: number; // 1 = highest
  enabled: boolean;
}

// ============================================================================
// CATALOG PRODUCT
// ============================================================================

export interface CatalogProduct {
  id: string;
  name: string;
  vendor: string;
  category: string;
  subcategory?: string;
  description?: string;
  attributes?: Record<string, unknown>;

  // Pricing
  pricing_model?: 'subscription' | 'perpetual' | 'usage_based' | 'freemium' | 'one_time' | 'license' | 'other' | string;
  pricing_details?: {
    amount?: number;
    currency?: string;
    unit?: string;
  };

  // Deployment & Targeting
  deployment?: 'saas' | 'on_premise' | 'hybrid' | 'paas' | 'iaas' | string;
  target_segment?: 'enterprise' | 'smb' | 'consumer' | 'government' | string;

  // Classification
  industry_tags?: string[];
  use_cases?: string[];
  integrations?: string[];

  // Multi-sector support
  segment?: string; // e.g., 'Automotive', 'Consumer Electronics', 'Food & Beverage'
  lifecycle_stage?: 'introduction' | 'growth' | 'maturity' | 'decline' | string;
  specifications?: Record<string, unknown>; // Product-specific specs (e.g., powertrain, range_km)

  // Identifiers
  gtin?: string;
  ean?: string;
  sku?: string;
  mpn?: string;

  // Synthetic catalog fields (aliases for improved matching)
  aliases?: string[];   // Alternative product names (e.g., "M365" for "Microsoft 365")
  keywords?: string[];  // Additional search terms for better matching
}

// ============================================================================
// CATALOG SERVICE
// ============================================================================

export interface CatalogService {
  id: string;
  name: string;
  vendor?: string;
  category: string;
  subcategory?: string;
  description: string;

  // Service characteristics
  delivery_model: 'managed' | 'professional' | 'consulting' | 'support' | 'training';
  service_window?: '24/7' | 'business_hours' | 'on_demand' | 'custom';
  sla_tier?: 'basic' | 'standard' | 'premium' | 'enterprise';

  // Duration & Resources
  typical_duration?: string;
  resource_requirements?: string[];

  // Targeting
  target_segment?: 'enterprise' | 'smb' | 'consumer' | 'government';
  industry_focus?: string[];
}

// ============================================================================
// GS1 TAXONOMY
// ============================================================================

export interface GS1Category {
  segment_code: string;
  segment_name: string;
  family_code: string;
  family_name: string;
  class_code: string;
  class_name: string;
  brick_code: string;
  brick_name: string;
  full_path: string;
}

export interface GS1Entry {
  segment: { code: string; name: string };
  family: { code: string; name: string };
  class: { code: string; name: string };
  brick: { code: string; name: string };
  keywords?: string[];
}

// ============================================================================
// ICECAT PRODUCT
// ============================================================================

export interface IcecatProduct {
  icecat_id: string;
  gtin: string;
  brand: string;
  name: string;
  category: string;
  specs: Record<string, string | number>;
  images?: string[];
  ean?: string;
  mpn?: string;
  description?: string;
}

// ============================================================================
// ENRICHMENT TYPES
// ============================================================================

export interface EnrichmentResult {
  source: KnowledgeSourceType;
  confidence: number;
  matched_entry_id?: string;
  fields_enriched: string[];
  gs1_category?: GS1Category | null;
  reasoning: string[];
  enrichedFields?: Record<string, unknown>;
}

export interface EnrichedProduct {
  // Original extracted fields
  name: string;
  description?: string;
  type: 'product' | 'service';

  // Enriched fields (from knowledge sources)
  vendor?: string;
  category?: string;
  subcategory?: string;
  pricing_model?: string;
  deployment?: string;
  target_segment?: string;

  // Product identifiers
  gtin?: string;
  ean?: string;
  sku?: string;

  // GS1 Classification
  gs1_classification?: GS1Category;

  // Enrichment metadata
  _enrichment: EnrichmentResult[];
  _confidence_overall: number;

  // Allow additional fields
  [key: string]: unknown;
}

// ============================================================================
// COMPANY HISTORY (Learning from validated extractions)
// ============================================================================

export interface CompanyHistoryEntry {
  id: string;
  company_id: string;
  tenant_id: string;

  // The extracted item
  item_name: string;
  item_type: 'product' | 'service';
  item_vendor?: string;
  item_category?: string;

  // How it was classified/enriched
  final_classification: {
    type: 'product' | 'service';
    category: string;
    subcategory?: string;
    vendor?: string;
  };

  // Validation status
  validated_by_user: boolean;
  validation_timestamp?: Date;

  // Source document info
  source_document?: string;
  source_type?: string;

  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface CompanyHistoryMatch {
  entry: CompanyHistoryEntry;
  similarity: number;
  matched_fields: string[];
}

// ============================================================================
// ENRICHMENT CONFIGURATION
// ============================================================================

export interface EnrichmentConfig {
  enableCompanyCatalog?: boolean;
  enableIcecat?: boolean;
  enableGS1?: boolean;
  enableCompanyHistory?: boolean;
  enableActiveLearning?: boolean;
  enableDeduplication?: boolean;
  enableLLMFallback?: boolean; // Use LLM when other sources don't have data
  tenantId?: string;
  companyId?: string;
  industryContext?: string;
  preferredSource?: KnowledgeSourceType;
  minConfidenceThreshold?: number;
}

// ============================================================================
// DEDUPLICATION TYPES
// ============================================================================

export interface DuplicateCluster {
  canonical_name: string;
  canonical_id?: string;
  variants: Array<{
    name: string;
    id?: string;
    similarity: number;
    match_type: 'alias' | 'semantic' | 'fuzzy';
  }>;
  confidence: number;
}

export interface DeduplicationResult {
  clusters: DuplicateCluster[];
  merged_count: number;
  unique_count: number;
  processing_time_ms: number;
}

// ============================================================================
// ACTIVE LEARNING TYPES
// ============================================================================

export interface FieldCorrection {
  field: string;
  from: unknown;
  to: unknown;
}

export interface LearnedSuggestion {
  field: string;
  suggested_value: unknown;
  confidence: number;
  learned_from: string[];
  pattern_count: number;
}

// ============================================================================
// CATALOG FILE STRUCTURES
// ============================================================================

export interface ProductCatalogFile {
  vendor: string;
  last_updated: string;
  version?: string;
  products: CatalogProduct[];
}

export interface ServiceCatalogFile {
  category?: string;
  vendor?: string;
  last_updated: string;
  version?: string;
  services: CatalogService[];
}

export interface GS1TaxonomyFile {
  version: string;
  source: string;
  last_updated?: string;
  entries: GS1Entry[];
}

// ============================================================================
// MULTI-SECTOR DETECTION TYPES
// ============================================================================

export interface SectorDetectionResult {
  sector: SectorCode;
  confidence: number;
  method: 'keyword' | 'semantic' | 'hybrid';
  reasoning: string[];
  alternativeSectors?: Array<{ sector: SectorCode; confidence: number }>;
}

// ============================================================================
// ENRICHMENT PROVENANCE TYPES
// ============================================================================

export interface FieldEnrichmentSource {
  source: KnowledgeSourceType;
  confidence: number;
  enrichedAt: Date;
  originalValue?: unknown;
}

export interface EnrichmentProvenance {
  sessionId: string;
  detectedSector: SectorCode;
  sectorConfidence: number;
  sectorMethod: 'keyword' | 'semantic' | 'hybrid';
  fieldSources: Record<string, FieldEnrichmentSource>;
  sourcesQueried: KnowledgeSourceType[];
  sourcesMatched: KnowledgeSourceType[];
  processingTimeMs: number;
}

// ============================================================================
// RATE LIMITING TYPES
// ============================================================================

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  scope: 'global' | 'per_tenant';
}

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  source: KnowledgeSourceType;
}

// ============================================================================
// ENRICHMENT SOURCE INTERFACE
// ============================================================================

export interface EnrichmentSourceConfig {
  name: KnowledgeSourceType;
  supportedSectors: SectorCode[];
  priority: number;
  confidenceWeight: number;
  rateLimit?: RateLimitConfig;
  cacheTTLSeconds?: number;
  requiresApiKey?: boolean;
  apiKeyEnvVar?: string;
}

export interface EnrichmentContext {
  tenantId?: string;
  companyId?: string;
  industryContext?: string;
  language?: 'en' | 'it' | 'auto';
  skipCache?: boolean;
  sector?: SectorCode;  // Detected sector for source selection
}

// ============================================================================
// EXTERNAL API RESPONSE TYPES
// ============================================================================

export interface OpenFoodFactsProduct {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  ingredients_text?: string;
  nutriscore_grade?: string;
  allergens_tags?: string[];
  image_front_url?: string;
  quantity?: string;
  packaging?: string;
  origins?: string;
}

export interface OpenBeautyFactsProduct {
  code: string;
  product_name: string;
  brands?: string;
  categories_tags?: string[];
  ingredients_text?: string;
  certifications_tags?: string[];
  image_front_url?: string;
}

export default {
  // Type guards
  isProduct: (item: CatalogProduct | CatalogService): item is CatalogProduct => {
    return 'pricing_model' in item || 'deployment' in item;
  },
  isService: (item: CatalogProduct | CatalogService): item is CatalogService => {
    return 'delivery_model' in item;
  }
};
