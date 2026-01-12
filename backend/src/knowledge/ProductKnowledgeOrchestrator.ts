/**
 * Product Knowledge Orchestrator
 *
 * Coordinates enrichment across all knowledge sources:
 * 1. Company Catalogs (RAG with curated examples)
 * 2. Icecat MCP (45M+ tech products)
 * 3. GS1 Taxonomy (Global Product Classification)
 * 4. Company History (Learned from validated extractions)
 * 5. Active Learning (from user corrections)
 * 6. Semantic Deduplication
 *
 * Provides intelligent merging of enrichment data with
 * configurable priority and confidence-based selection.
 */

import { CompanyCatalogSource, getCompanyCatalogSource } from './sources/companyCatalogSource';
import { IcecatMCPSource, getIcecatMCPSource } from './sources/icecatMCPSource';
import { GS1TaxonomySource, getGS1TaxonomySource } from './sources/gs1TaxonomySource';
import { PineconeCompanyHistorySource, getPineconeCompanyHistorySource } from './sources/pineconeCompanyHistorySource';
import { LLMEnrichmentSource, getLLMEnrichmentSource } from './sources/llmEnrichmentSource';
import { SemanticDeduplicator, getSemanticDeduplicator, DeduplicationResult } from './deduplication';
import { CorrectionLearner, getCorrectionLearner, LearnedSuggestion } from './learning';

// Multi-sector sources
import { SectorDetector, getSectorDetector } from './sectors/sectorDetector';
import { SourceRegistry, getSourceRegistry, type EnrichmentSource } from './registry/sourceRegistry';
import { getOpenFoodFactsSource } from './sources/openFoodFactsSource';
import { getOpenBeautyFactsSource } from './sources/openBeautyFactsSource';
import { getOpenFDASource } from './sources/openFdaSource';
import { getWikidataSource } from './sources/wikidataSource';
import { getDBpediaSource } from './sources/dbpediaSource';
import { getUNSPSCSource } from './sources/unspscSource';

// Cross-sector taxonomy sources
import { getGoogleTaxonomySource } from './sources/googleTaxonomySource';
import { getSchemaOrgSource } from './sources/schemaOrgSource';

// Italian/EU classification sources
import { getATECOSource } from './sources/atecoSource';
import { getPRODCOMSource } from './sources/prodcomSource';
import { getCPVSource } from './sources/cpvSource';

// Sector-specific sources
import { getNHTSASource } from './sources/nhtsaSource';
import { getGLEIFSource } from './sources/gleifSource';

// Enrichment metadata persistence
import {
  getEnrichmentMetadataRepository,
  EnrichmentMetadataRepository
} from './utils/enrichmentMetadataRepository';

import type {
  EnrichedProduct,
  EnrichmentResult,
  EnrichmentConfig,
  GS1Category,
  KnowledgeSourceType,
  SectorCode,
  SectorDetectionResult,
  EnrichmentProvenance,
  EnrichmentContext
} from './types';

// Extended enrichment result with fields
interface EnrichmentResultWithData extends EnrichmentResult {
  enrichedFields?: Record<string, unknown>;
  gs1Category?: GS1Category | null;
}

/**
 * Extracted item to be enriched
 */
export interface ExtractedItem {
  name: string;
  description?: string;
  type: 'product' | 'service';
  vendor?: string;
  category?: string;
  gtin?: string;
  ean?: string;
  mpn?: string;
  [key: string]: unknown;
}

/**
 * Enrichment statistics
 */
export interface EnrichmentStats {
  total: number;
  enriched: number;
  bySource: Partial<Record<KnowledgeSourceType, number>>;
  avgConfidence: number;
  processingTimeMs: number;
  deduplication?: DeduplicationResult;
  learnedSuggestions?: number;
}

export class ProductKnowledgeOrchestrator {
  private companyCatalog: CompanyCatalogSource;
  private companyHistory: PineconeCompanyHistorySource;
  private icecat: IcecatMCPSource;
  private gs1: GS1TaxonomySource;
  private llmEnrichment: LLMEnrichmentSource;
  private deduplicator: SemanticDeduplicator;
  private correctionLearner: CorrectionLearner;
  private initialized = false;

  // Multi-sector enrichment
  private sectorDetector: SectorDetector;
  private sourceRegistry: SourceRegistry;
  private multiSectorInitialized = false;

  // Enrichment metadata persistence
  private enrichmentMetadataRepo: EnrichmentMetadataRepository;

  constructor() {
    this.companyCatalog = getCompanyCatalogSource();
    this.companyHistory = getPineconeCompanyHistorySource();
    this.icecat = getIcecatMCPSource();
    this.gs1 = getGS1TaxonomySource();
    this.llmEnrichment = getLLMEnrichmentSource();
    this.deduplicator = getSemanticDeduplicator();
    this.correctionLearner = getCorrectionLearner();

    // Multi-sector components
    this.sectorDetector = getSectorDetector();
    this.sourceRegistry = getSourceRegistry();

    // Enrichment metadata persistence
    this.enrichmentMetadataRepo = getEnrichmentMetadataRepository();
  }

  /**
   * Initialize all knowledge sources
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('\n🧠 Initializing Product Knowledge Orchestrator...');
    const startTime = Date.now();

    await Promise.all([
      this.companyCatalog.initialize(),
      this.companyHistory.initialize(),
      this.gs1.initialize()
      // Icecat doesn't need initialization
    ]);

    // Initialize multi-sector sources
    await this.initializeMultiSectorSources();

    this.initialized = true;
    console.log(`✅ Product Knowledge Orchestrator ready (${Date.now() - startTime}ms)`);
    console.log(`   Company History: ${this.companyHistory.isPineconeEnabled() ? 'Pinecone (persistent)' : 'Memory (volatile)'}`);
    console.log(`   Multi-sector sources: ${this.sourceRegistry.getAllSourceNames().length} registered\n`);
  }

  /**
   * Register and initialize multi-sector enrichment sources
   */
  private async initializeMultiSectorSources(): Promise<void> {
    if (this.multiSectorInitialized) return;

    console.log('   📦 Registering multi-sector sources...');

    try {
      // Food & Beverage
      const openFoodFacts = getOpenFoodFactsSource();
      this.sourceRegistry.register(openFoodFacts);

      // Consumer Goods / Beauty
      const openBeautyFacts = getOpenBeautyFactsSource();
      this.sourceRegistry.register(openBeautyFacts);

      // Healthcare / Pharma
      const openFDA = getOpenFDASource();
      this.sourceRegistry.register(openFDA);

      // Industrial classification
      const unspsc = getUNSPSCSource();
      this.sourceRegistry.register(unspsc);

      // Cross-sector taxonomy sources
      const googleTaxonomy = getGoogleTaxonomySource();
      this.sourceRegistry.register(googleTaxonomy);

      const schemaOrg = getSchemaOrgSource();
      this.sourceRegistry.register(schemaOrg);

      // Italian/EU classification sources
      const ateco = getATECOSource();
      this.sourceRegistry.register(ateco);

      const prodcom = getPRODCOMSource();
      this.sourceRegistry.register(prodcom);

      const cpv = getCPVSource();
      this.sourceRegistry.register(cpv);

      // Sector-specific sources
      const nhtsa = getNHTSASource();
      this.sourceRegistry.register(nhtsa);

      const gleif = getGLEIFSource();
      this.sourceRegistry.register(gleif);

      // Universal fallbacks
      const wikidata = getWikidataSource();
      this.sourceRegistry.register(wikidata);

      const dbpedia = getDBpediaSource();
      this.sourceRegistry.register(dbpedia);

      // Initialize all registered sources
      await this.sourceRegistry.initializeAll();

      this.multiSectorInitialized = true;
      console.log(`   ✅ ${this.sourceRegistry.getAllSourceNames().length} multi-sector sources ready`);
    } catch (error) {
      console.warn('   ⚠️ Multi-sector source initialization partially failed:', error);
    }
  }

  /**
   * Check if orchestrator is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Enrich a single extracted item using all available sources
   */
  async enrichItem(
    item: ExtractedItem,
    config: EnrichmentConfig = {}
  ): Promise<EnrichedProduct> {
    await this.initialize();

    const {
      enableCompanyCatalog = true,
      enableCompanyHistory = true,
      enableIcecat = true,
      enableGS1 = true,
      enableActiveLearning = true,
      enableLLMFallback = true, // Enabled by default - uses LLM when other sources fail
      tenantId,
      companyId,
      industryContext,
      minConfidenceThreshold = 0.5
    } = config;

    const enrichments: EnrichmentResult[] = [];
    let enrichedFields: Record<string, unknown> = { ...item };
    let gs1Classification: GS1Category | null = null;
    let learnedSuggestions: LearnedSuggestion[] = [];
    const startTime = Date.now();
    const sourcesQueried: KnowledgeSourceType[] = [];
    const sourcesMatched: KnowledgeSourceType[] = [];

    // =========================================
    // SECTOR DETECTION: Detect item sector for source selection
    // =========================================
    let sectorResult: SectorDetectionResult = {
      sector: 'unknown',
      confidence: 0.3,
      method: 'keyword',
      reasoning: ['Default sector']
    };

    try {
      sectorResult = await this.sectorDetector.detect({
        name: item.name,
        description: item.description,
        category: item.category,
        vendor: item.vendor
      });
      // Store sector in enriched fields
      enrichedFields.detected_sector = sectorResult.sector;
      enrichedFields.sector_confidence = sectorResult.confidence;
    } catch (error) {
      console.warn('   ⚠️  Sector detection failed:', error);
    }

    // =========================================
    // SOURCE 0: Active Learning (Priority: Highest)
    // Apply learned corrections from user feedback
    // =========================================
    if (enableActiveLearning && tenantId && this.correctionLearner.isEnabled()) {
      try {
        const { suggestions, appliedFields } = await this.correctionLearner.applyLearnedCorrections(
          tenantId,
          item
        );

        learnedSuggestions = suggestions;

        // Apply auto-applied fields
        for (const [key, value] of Object.entries(appliedFields)) {
          enrichedFields[key] = value;
        }

        if (Object.keys(appliedFields).length > 0) {
          enrichments.push({
            source: 'company_catalog' as KnowledgeSourceType, // Use existing type
            confidence: 0.9,
            fields_enriched: Object.keys(appliedFields),
            reasoning: ['Applied learned corrections from user feedback']
          });
        }
      } catch (error) {
        console.warn('   Active Learning enrichment failed:', error);
      }
    }

    // =========================================
    // SOURCE 0.5: Company History (Priority: Very High)
    // Matches against validated items from this company
    // =========================================
    if (enableCompanyHistory && companyId) {
      try {
        const historyResult = await this.companyHistory.enrich(
          companyId,
          {
            name: item.name,
            description: item.description,
            type: item.type
          }
        );

        if (historyResult.confidence >= minConfidenceThreshold) {
          enrichments.push({
            source: 'company_catalog' as KnowledgeSourceType, // Company history uses same type
            confidence: historyResult.confidence,
            fields_enriched: historyResult.fields_enriched,
            reasoning: historyResult.reasoning
          });

          // Apply enriched fields from company history (high priority)
          for (const [key, value] of Object.entries(historyResult.enrichedFields || {})) {
            if (!item[key] || item[key] === undefined || item[key] === null) {
              enrichedFields[key] = value;
            }
          }
        }
      } catch (error) {
        console.warn('   ⚠️  Company History enrichment failed:', error);
      }
    }

    // =========================================
    // SOURCE 1: Company Catalogs (Priority: High)
    // =========================================
    if (enableCompanyCatalog) {
      try {
        const catalogResult = await this.companyCatalog.enrich(
          {
            name: item.name,
            description: item.description,
            type: item.type,
            vendor: item.vendor
          },
          industryContext
        );

        if (catalogResult.confidence >= minConfidenceThreshold) {
          enrichments.push(catalogResult);

          // Apply enriched fields (don't overwrite user-provided)
          for (const [key, value] of Object.entries(catalogResult.enrichedFields || {})) {
            if (!item[key] || item[key] === undefined || item[key] === null) {
              enrichedFields[key] = value;
            }
          }
        }
      } catch (error) {
        console.warn('   ⚠️  Company Catalog enrichment failed:', error);
      }
    }

    // =========================================
    // SOURCE 2: Icecat (Priority: Very High for tech products)
    // =========================================
    if (enableIcecat && item.type === 'product' && this.icecat.isEnabled()) {
      try {
        const icecatResult = await this.icecat.enrich({
          name: item.name,
          vendor: item.vendor,
          gtin: item.gtin,
          ean: item.ean,
          mpn: item.mpn
        });

        if (icecatResult.confidence >= minConfidenceThreshold) {
          enrichments.push(icecatResult);

          // Icecat data is highly reliable - overwrites catalog data for verified products
          for (const [key, value] of Object.entries(icecatResult.enrichedFields || {})) {
            // Don't overwrite user-provided values, but overwrite inferred values
            if (!item[key] || item[key] === undefined || item[key] === null) {
              enrichedFields[key] = value;
            }
          }
        }
      } catch (error) {
        console.warn('   ⚠️  Icecat enrichment failed:', error);
      }
    }

    // =========================================
    // MULTI-SECTOR SOURCES: Query sector-specific sources
    // =========================================
    if (item.type === 'product' && sectorResult.sector !== 'unknown') {
      const sectorSources = this.sourceRegistry.getSourcesForSector(sectorResult.sector);

      for (const source of sectorSources) {
        // Skip if we already have good enrichment
        const currentGoodEnrichment = enrichments.some(e => e.confidence >= 0.7 && e.fields_enriched.length >= 3);
        if (currentGoodEnrichment) break;

        sourcesQueried.push(source.name);

        try {
          const context: EnrichmentContext = {
            tenantId,
            companyId,
            industryContext,
            language: 'auto'
          };

          const sourceResult = await source.enrich(item, context);

          if (sourceResult.confidence >= minConfidenceThreshold && sourceResult.fields_enriched.length > 0) {
            enrichments.push(sourceResult);
            sourcesMatched.push(source.name);

            // Apply enriched fields
            for (const [key, value] of Object.entries(sourceResult.enrichedFields || {})) {
              if (!item[key] || item[key] === undefined || item[key] === null) {
                enrichedFields[key] = value;
              }
            }
          }
        } catch (error) {
          console.warn(`   ⚠️  ${source.name} enrichment failed:`, error);
        }
      }
    }

    // =========================================
    // SOURCE 2.5: LLM Fallback (When other sources have no data)
    // Only triggered when catalog and Icecat didn't provide good enrichment
    // =========================================
    const hasGoodEnrichment = enrichments.some(e => e.confidence >= 0.6 && e.fields_enriched.length >= 2);
    if (enableLLMFallback && !hasGoodEnrichment && this.llmEnrichment.isEnabled()) {
      try {
        console.log(`   🤖 LLM fallback for "${item.name}" (no catalog/Icecat match)...`);
        const llmResult = await this.llmEnrichment.enrich({
          name: item.name,
          description: item.description,
          type: item.type,
          vendor: item.vendor,
          category: item.category,
          industryContext
        });

        if (llmResult.confidence >= minConfidenceThreshold && llmResult.fields_enriched.length > 0) {
          console.log(`   ✅ LLM enriched ${llmResult.fields_enriched.length} fields for "${item.name}"`);
          enrichments.push(llmResult);

          // Apply LLM enriched fields (don't overwrite existing)
          for (const [key, value] of Object.entries(llmResult.enrichedFields || {})) {
            if (!enrichedFields[key] || enrichedFields[key] === undefined || enrichedFields[key] === null) {
              enrichedFields[key] = value;
            }
          }
        }
      } catch (error) {
        console.warn('   ⚠️  LLM enrichment failed:', error);
      }
    }

    // =========================================
    // SOURCE 3: GS1 Taxonomy (Always classify)
    // =========================================
    if (enableGS1) {
      try {
        const gs1Result = await this.gs1.enrich({
          name: item.name,
          description: item.description,
          category: (enrichedFields.category as string) || item.category
        });

        if (gs1Result.confidence >= 0.5) {
          enrichments.push(gs1Result);
          gs1Classification = gs1Result.gs1Category || null;
        }
      } catch (error) {
        console.warn('   ⚠️  GS1 classification failed:', error);
      }
    }

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(enrichments);

    // Build enrichment provenance
    const provenance: EnrichmentProvenance = {
      sessionId: `enrich-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      detectedSector: sectorResult.sector,
      sectorConfidence: sectorResult.confidence,
      sectorMethod: sectorResult.method,
      fieldSources: {},
      sourcesQueried,
      sourcesMatched,
      processingTimeMs: Date.now() - startTime
    };

    // Track field sources
    for (const enrichment of enrichments) {
      for (const field of enrichment.fields_enriched) {
        if (!provenance.fieldSources[field] || enrichment.confidence > provenance.fieldSources[field].confidence) {
          provenance.fieldSources[field] = {
            source: enrichment.source,
            confidence: enrichment.confidence,
            enrichedAt: new Date()
          };
        }
      }
    }

    // =========================================
    // PERSIST ENRICHMENT METADATA (if tenantId provided)
    // =========================================
    let enrichmentMetadataId: string | null = null;
    if (tenantId && item.name) {
      try {
        // Create metadata record from provenance
        const metadataRecord = EnrichmentMetadataRepository.fromProvenance(
          tenantId,
          item.name, // Use name as item_id since we may not have a UUID yet
          item.type,
          provenance
        );

        // Save to database
        enrichmentMetadataId = await this.enrichmentMetadataRepo.save(metadataRecord);

        if (enrichmentMetadataId) {
          // Add metadata ID to enriched fields for downstream use
          enrichedFields._enrichment_metadata_id = enrichmentMetadataId;
        }
      } catch (error) {
        console.warn('   ⚠️  Failed to persist enrichment metadata:', error);
        // Non-blocking - enrichment continues even if metadata save fails
      }
    }

    return {
      ...item,
      ...enrichedFields,
      gs1_classification: gs1Classification || undefined,
      _enrichment: enrichments,
      _confidence_overall: overallConfidence,
      _learned_suggestions: learnedSuggestions.length > 0 ? learnedSuggestions : undefined,
      _sector: sectorResult,
      _enrichment_provenance: provenance,
      _enrichment_metadata_id: enrichmentMetadataId || undefined
    } as EnrichedProduct;
  }

  /**
   * Batch enrich multiple items
   */
  async enrichItems(
    items: ExtractedItem[],
    config: EnrichmentConfig & { enableDeduplication?: boolean } = {}
  ): Promise<{ items: EnrichedProduct[]; stats: EnrichmentStats }> {
    await this.initialize();

    const startTime = Date.now();
    const { enableDeduplication = true } = config;

    console.log(`\n   Enriching ${items.length} items with knowledge sources...`);

    // =========================================
    // STEP 1: Semantic Deduplication (before enrichment)
    // =========================================
    let deduplicationResult: DeduplicationResult | undefined;
    let processItems = items;

    if (enableDeduplication && items.length > 1) {
      const { items: dedupedItems, result } = await this.deduplicator.deduplicate(
        items as any[]
      );
      processItems = dedupedItems as ExtractedItem[];
      deduplicationResult = result;
    }

    // =========================================
    // STEP 2: Enrich items
    // =========================================
    const results: EnrichedProduct[] = [];
    const sourceCount: Partial<Record<KnowledgeSourceType, number>> = {
      'company_catalog': 0,
      'company_history': 0,
      'icecat': 0,
      'gs1_taxonomy': 0
    };
    let learnedSuggestionsCount = 0;

    // Process items in parallel batches
    const batchSize = 5;
    for (let i = 0; i < processItems.length; i += batchSize) {
      const batch = processItems.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => this.enrichItem(item, config))
      );

      for (const result of batchResults) {
        results.push(result);

        // Count sources used
        for (const e of result._enrichment) {
          if (e.fields_enriched.length > 0) {
            sourceCount[e.source] = (sourceCount[e.source] || 0) + 1;
          }
        }

        // Count learned suggestions
        if ((result as any)._learned_suggestions?.length > 0) {
          learnedSuggestionsCount += (result as any)._learned_suggestions.length;
        }
      }
    }

    // Calculate stats
    const enrichedCount = results.filter(r => r._enrichment.length > 0).length;
    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r._confidence_overall, 0) / results.length
      : 0;

    const stats: EnrichmentStats = {
      total: items.length,
      enriched: enrichedCount,
      bySource: sourceCount,
      avgConfidence,
      processingTimeMs: Date.now() - startTime,
      deduplication: deduplicationResult,
      learnedSuggestions: learnedSuggestionsCount
    };

    console.log(`   Enriched ${enrichedCount}/${items.length} items`);
    console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Sources used: Catalog=${sourceCount.company_catalog}, Icecat=${sourceCount.icecat}, GS1=${sourceCount.gs1_taxonomy}`);
    if (deduplicationResult && deduplicationResult.merged_count > 0) {
      console.log(`   Deduplication: merged ${deduplicationResult.merged_count} duplicates`);
    }
    if (learnedSuggestionsCount > 0) {
      console.log(`   Active Learning: ${learnedSuggestionsCount} suggestions applied`);
    }
    console.log(`   Processing time: ${stats.processingTimeMs}ms\n`);

    return { items: results, stats };
  }

  /**
   * Get suggestions for an item without fully enriching
   */
  async getSuggestions(
    name: string,
    description?: string
  ): Promise<{
    catalogMatches: Array<{ name: string; vendor: string; category: string; score: number }>;
    gs1Suggestions: Array<{ category: GS1Category; confidence: number }>;
  }> {
    await this.initialize();

    // Get catalog matches
    const catalogMatches = await this.companyCatalog.findSimilar(
      `${name} ${description || ''}`,
      undefined,
      5
    );

    // Get GS1 suggestions
    const gs1Suggestions = await this.gs1.getSuggestions(name, description, 3);

    return {
      catalogMatches: catalogMatches.map(m => ({
        name: m.entry.name,
        vendor: ('vendor' in m.entry ? m.entry.vendor : '') || '',
        category: m.entry.category,
        score: m.score
      })),
      gs1Suggestions
    };
  }

  /**
   * Calculate overall confidence from multiple enrichment results
   */
  private calculateOverallConfidence(enrichments: EnrichmentResult[]): number {
    if (enrichments.length === 0) return 0.3; // Base confidence

    // Weighted average based on source priority
    const weights: Partial<Record<KnowledgeSourceType, number>> = {
      // Existing sources
      'icecat': 1.0,              // Verified product data (highest)
      'company_history': 0.95,   // Validated by user (very high)
      'company_catalog': 0.9,    // Curated examples
      'gs1_taxonomy': 0.7,       // Classification only (lower weight)
      // Multi-sector sources
      'open_food_facts': 0.95,   // Verified food product data
      'open_beauty_facts': 0.95, // Verified cosmetic data
      'openfda': 0.9,            // FDA verified pharmaceutical data
      'unspsc': 0.85,            // UNSPSC classification
      'gs1_gpc': 0.8,            // GS1 GPC classification
      // Cross-sector taxonomy sources
      'google_taxonomy': 0.8,    // Google Product Taxonomy
      'schema_org': 0.75,        // Schema.org product types
      // Italian/EU classification sources
      'ateco': 0.85,             // Italian ISTAT classification
      'prodcom': 0.8,            // EU manufacturing classification
      'cpv': 0.8,                // EU public procurement
      // Sector-specific sources
      'nhtsa': 0.9,              // US vehicle safety
      'gleif': 0.9,              // Legal Entity Identifier
      // Universal fallbacks
      'wikidata': 0.7,           // Wikidata entity data
      'dbpedia': 0.65,           // DBpedia Wikipedia data
      'llm_fallback': 0.6,       // LLM inference (fallback)
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const e of enrichments) {
      // Only count enrichments that actually added data
      if (e.fields_enriched.length > 0 || e.gs1_category) {
        const weight = weights[e.source] || 0.5;
        weightedSum += e.confidence * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return 0.3;

    return Math.min(weightedSum / totalWeight, 0.99); // Cap at 99%
  }

  /**
   * Record a user correction for active learning
   */
  async recordCorrection(
    tenantId: string,
    original: Record<string, unknown>,
    corrected: Record<string, unknown>,
    context?: { sourceType?: string; extractionContext?: Record<string, unknown> }
  ): Promise<{ success: boolean; correctedFields: string[] }> {
    return this.correctionLearner.recordCorrection(tenantId, original, corrected, context);
  }

  /**
   * Get learning statistics for a tenant
   */
  async getLearningStats(tenantId: string) {
    return this.correctionLearner.getStats(tenantId);
  }

  /**
   * Check if a product name has a known canonical form
   */
  getCanonicalName(productName: string): string | null {
    return this.deduplicator.getCanonicalName(productName);
  }

  /**
   * Get all known aliases for a canonical product name
   */
  getProductAliases(canonicalName: string): string[] {
    return this.deduplicator.getAliases(canonicalName);
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    catalogStats: { products: number; services: number; total: number };
    gs1Stats: { totalCategories: number; segments: number };
    icecatEnabled: boolean;
    activeLearningEnabled: boolean;
    deduplicationEnabled: boolean;
    multiSectorStats: {
      totalSources: number;
      enabledSources: number;
      sourcesBySector: Record<string, number>;
    };
  } {
    const registryStats = this.sourceRegistry.getStats();

    return {
      catalogStats: this.companyCatalog.getStats(),
      gs1Stats: {
        totalCategories: this.gs1.getStats().totalCategories,
        segments: this.gs1.getStats().segments
      },
      icecatEnabled: this.icecat.isEnabled(),
      activeLearningEnabled: this.correctionLearner.isEnabled(),
      deduplicationEnabled: true,
      multiSectorStats: {
        totalSources: registryStats.totalSources,
        enabledSources: registryStats.enabledSources,
        sourcesBySector: registryStats.sourcesBySector
      }
    };
  }

  /**
   * Get sector detector instance for direct access
   */
  getSectorDetector(): SectorDetector {
    return this.sectorDetector;
  }

  /**
   * Get source registry instance for direct access
   */
  getSourceRegistry(): SourceRegistry {
    return this.sourceRegistry;
  }

  /**
   * Link enrichment metadata to a portfolio item after it's saved
   * Call this after saving a portfolio item to update sector/metadata references
   */
  async linkEnrichmentToPortfolioItem(
    portfolioItemId: string,
    itemType: 'product' | 'service',
    enrichmentMetadataId: string,
    detectedSector: SectorCode,
    sectorConfidence: number
  ): Promise<boolean> {
    return this.enrichmentMetadataRepo.linkToPortfolioItem(
      portfolioItemId,
      itemType,
      enrichmentMetadataId,
      detectedSector,
      sectorConfidence
    );
  }

  /**
   * Get enrichment metadata for a portfolio item
   */
  async getEnrichmentMetadata(
    tenantId: string,
    itemId: string,
    itemType: 'product' | 'service'
  ) {
    return this.enrichmentMetadataRepo.getByItemId(tenantId, itemId, itemType);
  }

  /**
   * Get enrichment statistics by sector for a tenant
   */
  async getEnrichmentStatsBySector(tenantId: string) {
    return this.enrichmentMetadataRepo.getStatsBySector(tenantId);
  }
}

// Singleton instance
let orchestratorInstance: ProductKnowledgeOrchestrator | null = null;

export function getProductKnowledgeOrchestrator(): ProductKnowledgeOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ProductKnowledgeOrchestrator();
  }
  return orchestratorInstance;
}

export default ProductKnowledgeOrchestrator;
