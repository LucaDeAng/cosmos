/**
 * Catalog-Based Source Factory
 *
 * Generic enrichment source that loads products/services from JSON catalogs.
 * Used for industry-specific sources: HR/Payroll, Retail, Supply Chain, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  EnrichmentResult,
  EnrichmentContext,
  SectorCode,
  KnowledgeSourceType,
  CatalogProduct,
} from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

interface CatalogFile {
  category: string;
  subcategory: string;
  products: CatalogProduct[];
}

/**
 * Creates a catalog-based enrichment source
 */
export function createCatalogSource(config: {
  name: KnowledgeSourceType;
  supportedSectors: SectorCode[];
  catalogDir: string; // Relative to backend/src/data/catalogs/
  priority: number;
  confidenceWeight: number;
}): EnrichmentSource {
  return new CatalogBasedSource(config);
}

class CatalogBasedSource implements EnrichmentSource {
  name: KnowledgeSourceType;
  supportedSectors: SectorCode[];
  priority: number;
  confidenceWeight: number;
  cacheTTLSeconds = 86400; // 24 hours

  private catalogDir: string;
  private products: CatalogProduct[] = [];
  private initialized = false;

  constructor(config: {
    name: KnowledgeSourceType;
    supportedSectors: SectorCode[];
    catalogDir: string;
    priority: number;
    confidenceWeight: number;
  }) {
    this.name = config.name;
    this.supportedSectors = config.supportedSectors;
    this.catalogDir = config.catalogDir;
    this.priority = config.priority;
    this.confidenceWeight = config.confidenceWeight;
  }

  isEnabled(): boolean {
    return true; // Local catalogs always available
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(`🏷️  Initializing ${this.name} catalog source...`);

    const dataDir = path.join(__dirname, '../../data/catalogs', this.catalogDir);

    if (!fs.existsSync(dataDir)) {
      console.warn(`   ⚠️ Catalog directory not found: ${dataDir}`);
      this.initialized = true;
      return;
    }

    // Load all JSON files in catalog directory
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const catalog: CatalogFile = JSON.parse(content);

        this.products.push(...catalog.products);
      } catch (error) {
        console.error(`   ❌ Error loading catalog ${file}:`, error);
      }
    }

    console.log(`   ✅ Loaded ${this.products.length} products from ${files.length} catalog(s)`);
    this.initialized = true;
  }

  async enrich(
    item: ExtractedItem,
    context: EnrichmentContext
  ): Promise<EnrichmentResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const itemName = (item.name || '').toLowerCase();
    const itemDescription = (item.description || '').toLowerCase();
    const searchText = `${itemName} ${itemDescription}`;

    const matches: Array<{ product: CatalogProduct; score: number }> = [];

    for (const product of this.products) {
      const score = this.calculateMatchScore(searchText, product);
      if (score > 0.3) {
        matches.push({ product, score });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return {
        source: this.name,
        confidence: 0,
        fields_enriched: [],
        reasoning: [`No matches found in ${this.name} catalog`],
        enrichedFields: {},
      };
    }

    // Use best match
    const bestMatch = matches[0];
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];

    // Enrich category if missing
    if (!item.category && bestMatch.product.category) {
      enrichedFields.category = bestMatch.product.category;
      fieldsEnriched.push('category');
    }

    // Enrich subcategory if missing
    if (!item.subcategory && bestMatch.product.subcategory) {
      enrichedFields.subcategory = bestMatch.product.subcategory;
      fieldsEnriched.push('subcategory');
    }

    // Enrich vendor if missing
    if (!item.vendor && bestMatch.product.vendor) {
      enrichedFields.vendor = bestMatch.product.vendor;
      fieldsEnriched.push('vendor');
    }

    // Enrich pricing model if missing
    if (!item.pricing_model && bestMatch.product.pricing_model) {
      enrichedFields.pricing_model = bestMatch.product.pricing_model;
      fieldsEnriched.push('pricing_model');
    }

    // Enrich deployment if missing
    if (!item.deployment && bestMatch.product.deployment) {
      enrichedFields.deployment = bestMatch.product.deployment;
      fieldsEnriched.push('deployment');
    }

    // Enrich target segment if missing
    if (!item.target_segment && bestMatch.product.target_segment) {
      enrichedFields.target_segment = bestMatch.product.target_segment;
      fieldsEnriched.push('target_segment');
    }

    // Add description if significantly better
    if (
      bestMatch.product.description &&
      (!item.description || item.description.length < 50)
    ) {
      enrichedFields.description = bestMatch.product.description;
      fieldsEnriched.push('description');
    }

    reasoning.push(
      `Matched to "${bestMatch.product.name}" by ${bestMatch.product.vendor} (score: ${bestMatch.score.toFixed(2)})`
    );

    return {
      source: this.name,
      confidence: bestMatch.score,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields,
    };
  }

  /**
   * Calculates match score between search text and catalog product
   */
  private calculateMatchScore(searchText: string, product: CatalogProduct): number {
    let score = 0;

    const productName = product.name.toLowerCase();
    const productVendor = (product.vendor || '').toLowerCase();
    const productKeywords = (product.keywords || []).map(k => k.toLowerCase());

    // Exact name match
    if (searchText.includes(productName)) {
      score += 0.9;
    }
    // Partial name match (words)
    else {
      const nameWords = productName.split(/\s+/);
      const matchingWords = nameWords.filter(word =>
        word.length > 3 && searchText.includes(word)
      );
      score += (matchingWords.length / nameWords.length) * 0.7;
    }

    // Vendor match
    if (productVendor && searchText.includes(productVendor)) {
      score += 0.3;
    }

    // Keyword matches
    const keywordMatches = productKeywords.filter(kw => searchText.includes(kw));
    score += (keywordMatches.length / Math.max(productKeywords.length, 1)) * 0.5;

    // Alias matches
    if (product.aliases) {
      const aliasMatches = product.aliases.filter(alias =>
        searchText.includes(alias.toLowerCase())
      );
      score += (aliasMatches.length / product.aliases.length) * 0.6;
    }

    return Math.min(1, score);
  }
}

// ============================================================================
// EXPORTS: Pre-configured sources for each industry
// ============================================================================

export const hrPayrollSource = (): EnrichmentSource => createCatalogSource({
  name: 'hr_payroll',
  supportedSectors: ['hr_payroll', 'professional_services'],
  catalogDir: 'hr_payroll',
  priority: 10,
  confidenceWeight: 0.85,
});

export const retailEcommerceSource = (): EnrichmentSource => createCatalogSource({
  name: 'retail_ecommerce',
  supportedSectors: ['retail_ecommerce', 'consumer_goods'],
  catalogDir: 'retail_ecommerce',
  priority: 10,
  confidenceWeight: 0.85,
});

export const supplyChainSource = (): EnrichmentSource => createCatalogSource({
  name: 'supply_chain',
  supportedSectors: ['supply_chain_logistics', 'industrial'],
  catalogDir: 'supply_chain',
  priority: 10,
  confidenceWeight: 0.85,
});

export const realEstateSource = (): EnrichmentSource => createCatalogSource({
  name: 'real_estate',
  supportedSectors: ['real_estate', 'professional_services'],
  catalogDir: 'real_estate',
  priority: 10,
  confidenceWeight: 0.85,
});

export const bankingSource = (): EnrichmentSource => createCatalogSource({
  name: 'banking',
  supportedSectors: ['banking', 'financial_services'],
  catalogDir: 'banking',
  priority: 10,
  confidenceWeight: 0.85,
});

export const insuranceSource = (): EnrichmentSource => createCatalogSource({
  name: 'insurance',
  supportedSectors: ['insurance', 'financial_services'],
  catalogDir: 'insurance',
  priority: 10,
  confidenceWeight: 0.85,
});
