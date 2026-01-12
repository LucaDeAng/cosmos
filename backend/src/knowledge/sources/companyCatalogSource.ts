/**
 * Company Catalog Source
 *
 * Provides RAG-based product/service matching against curated catalogs.
 * Uses vector embeddings for semantic search across:
 * - Tech product catalogs (Microsoft, AWS, Google, etc.)
 * - IT service catalogs (Managed Services, Consulting, etc.)
 *
 * Supports both in-memory vector store and Pinecone for production.
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import * as fs from 'fs';
import * as path from 'path';
import type {
  CatalogProduct,
  CatalogService,
  EnrichmentResult,
  ProductCatalogFile,
  ServiceCatalogFile
} from '../types';

interface CatalogMatch {
  entry: CatalogProduct | CatalogService;
  score: number;
  type: 'product' | 'service';
}

interface EnrichmentResultWithFields extends EnrichmentResult {
  enrichedFields: Record<string, unknown>;
}

export class CompanyCatalogSource {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private catalogs: Map<string, CatalogProduct | CatalogService> = new Map();
  private catalogTypes: Map<string, 'product' | 'service'> = new Map();
  private initialized = false;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small'
    });
  }

  /**
   * Check if source is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Load all catalog JSON files and build vector index
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('📚 Initializing Company Catalog Source...');

    // Try multiple paths to find catalogs (handles both ts-node-dev and compiled scenarios)
    const possiblePaths = [
      path.join(__dirname, '../../data/catalogs'),           // From src/knowledge/sources/ -> src/data/catalogs
      path.join(__dirname, '../../../src/data/catalogs'),    // From dist/knowledge/sources/ -> src/data/catalogs
      path.join(process.cwd(), 'src/data/catalogs'),         // From project root
      path.join(process.cwd(), 'data/catalogs'),             // Alternative location
    ];

    let catalogDir = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        catalogDir = p;
        console.log(`   📁 Found catalog directory: ${p}`);
        break;
      }
    }

    if (!catalogDir) {
      catalogDir = path.join(process.cwd(), 'src/data/catalogs');
      console.log(`   ⚠️  Creating catalog directory: ${catalogDir}`);
      fs.mkdirSync(catalogDir, { recursive: true });
    }
    const documents: { pageContent: string; metadata: Record<string, unknown> }[] = [];

    // Directories to load products from
    const productDirs = [
      { name: 'tech_products', segment: 'Information Technology' },
      { name: 'synthetic', segment: 'Information Technology' },  // Synthetic catalogs with aliases
      { name: 'automotive', segment: 'Automotive' },
      { name: 'electronics', segment: 'Consumer Electronics' },
      { name: 'food_beverage', segment: 'Food & Beverage' },
      { name: 'fashion', segment: 'Fashion & Apparel' },
      { name: 'industrial', segment: 'Industrial & Manufacturing' },
      { name: 'healthcare', segment: 'Healthcare & Pharma' },
      { name: 'fintech', segment: 'Financial Services' },
      { name: 'logistics', segment: 'Logistics & Transportation' },
      { name: 'telecom', segment: 'Telecommunications' },
      { name: 'energy', segment: 'Energy & Utilities' },
      { name: 'construction', segment: 'Construction & Building' },
      { name: 'media', segment: 'Media & Entertainment' },
      { name: 'education', segment: 'Education & EdTech' },
      { name: 'hospitality', segment: 'Hospitality & Travel' },
      { name: 'agriculture', segment: 'Agriculture & AgTech' },
    ];

    // Load products from all directories
    for (const { name: dirName, segment } of productDirs) {
      const productDir = path.join(catalogDir, dirName);
      if (fs.existsSync(productDir)) {
        for (const file of fs.readdirSync(productDir)) {
          if (file.endsWith('.json')) {
            try {
              const content = JSON.parse(
                fs.readFileSync(path.join(productDir, file), 'utf-8')
              );

              for (const product of content.products || []) {
                // Generate ID if not present
                const id = product.id || `${dirName}-${product.name?.toLowerCase().replace(/\s+/g, '-')}`;

                // Normalize vendor/brand
                const vendor = product.vendor || product.brand || 'Unknown';

                const normalizedProduct: CatalogProduct = {
                  id,
                  vendor,
                  name: product.name,
                  category: product.category,
                  subcategory: product.subcategory,
                  description: product.description,
                  pricing_model: product.pricing_model,
                  deployment: product.deployment,
                  target_segment: product.target_segment,
                  industry_tags: product.tags || product.industry_tags || [],
                  use_cases: product.use_cases || [],
                  integrations: product.integrations || [],
                  lifecycle_stage: product.lifecycle_stage,
                  segment: product.segment || segment,
                  specifications: product.specifications,
                };

                this.catalogs.set(id, normalizedProduct);
                this.catalogTypes.set(id, 'product');

                documents.push({
                  pageContent: this.productToSearchText(normalizedProduct),
                  metadata: {
                    id,
                    type: 'product',
                    vendor,
                    category: product.category,
                    segment: product.segment || segment,
                  }
                });
              }

              console.log(`   ✅ Loaded ${content.products?.length || 0} products from ${dirName}/${file}`);
            } catch (error) {
              console.warn(`   ⚠️  Failed to load ${dirName}/${file}:`, error);
            }
          }
        }
      }
    }

    // Load IT services
    const servicesDir = path.join(catalogDir, 'it_services');
    if (fs.existsSync(servicesDir)) {
      for (const file of fs.readdirSync(servicesDir)) {
        if (file.endsWith('.json')) {
          try {
            const content: ServiceCatalogFile = JSON.parse(
              fs.readFileSync(path.join(servicesDir, file), 'utf-8')
            );

            for (const service of content.services || []) {
              this.catalogs.set(service.id, service);
              this.catalogTypes.set(service.id, 'service');

              documents.push({
                pageContent: this.serviceToSearchText(service),
                metadata: {
                  id: service.id,
                  type: 'service',
                  vendor: service.vendor,
                  category: service.category
                }
              });
            }

            console.log(`   ✅ Loaded ${content.services?.length || 0} services from ${file}`);
          } catch (error) {
            console.warn(`   ⚠️  Failed to load ${file}:`, error);
          }
        }
      }
    }

    // Build vector store if we have documents
    if (documents.length > 0) {
      this.vectorStore = await MemoryVectorStore.fromDocuments(
        documents,
        this.embeddings
      );
      console.log(`   ✅ Indexed ${this.catalogs.size} catalog entries`);
    } else {
      console.log('   ⚠️  No catalog files found, creating empty vector store');
      this.vectorStore = new MemoryVectorStore(this.embeddings);
    }

    this.initialized = true;
  }

  /**
   * Find similar products/services in catalog
   */
  async findSimilar(
    query: string,
    type?: 'product' | 'service',
    topK = 5
  ): Promise<CatalogMatch[]> {
    if (!this.vectorStore) {
      await this.initialize();
    }

    const results = await this.vectorStore!.similaritySearchWithScore(query, topK * 2);

    return results
      .filter(([doc]) => !type || doc.metadata.type === type)
      .slice(0, topK)
      .map(([doc, distance]) => ({
        entry: this.catalogs.get(doc.metadata.id as string)!,
        score: 1 - distance, // Convert distance to similarity
        type: doc.metadata.type as 'product' | 'service'
      }))
      .filter(match => match.entry !== undefined);
  }

  /**
   * Enrich extracted item with catalog data
   */
  async enrich(
    extracted: { name: string; description?: string; type: 'product' | 'service'; vendor?: string },
    industryContext?: string
  ): Promise<EnrichmentResultWithFields> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Build search query
    const searchParts = [extracted.name];
    if (extracted.description) {
      searchParts.push(extracted.description.slice(0, 200));
    }
    if (extracted.vendor) {
      searchParts.push(extracted.vendor);
    }
    if (industryContext) {
      searchParts.push(industryContext);
    }
    const searchQuery = searchParts.join(' ');

    // Find similar entries
    const matches = await this.findSimilar(searchQuery, extracted.type, 3);

    // No matches or low confidence
    if (matches.length === 0 || matches[0].score < 0.65) {
      return {
        source: 'company_catalog',
        confidence: 0,
        fields_enriched: [],
        reasoning: ['No matching catalog entry found (similarity < 65%)'],
        enrichedFields: {}
      };
    }

    const bestMatch = matches[0];
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];

    // Determine if it's a product or service
    const isProduct = this.catalogTypes.get(bestMatch.entry.id) === 'product';

    if (isProduct) {
      const catalogProduct = bestMatch.entry as CatalogProduct;

      // Enrich with product fields
      if (!extracted.vendor && catalogProduct.vendor) {
        enrichedFields.vendor = catalogProduct.vendor;
        fieldsEnriched.push('vendor');
      }
      if (catalogProduct.category) {
        enrichedFields.category = catalogProduct.category;
        fieldsEnriched.push('category');
      }
      if (catalogProduct.subcategory) {
        enrichedFields.subcategory = catalogProduct.subcategory;
        fieldsEnriched.push('subcategory');
      }
      if (catalogProduct.pricing_model) {
        enrichedFields.pricing_model = catalogProduct.pricing_model;
        fieldsEnriched.push('pricing_model');
      }
      if (catalogProduct.deployment) {
        enrichedFields.deployment = catalogProduct.deployment;
        fieldsEnriched.push('deployment');
      }
      if (catalogProduct.target_segment) {
        enrichedFields.target_segment = catalogProduct.target_segment;
        fieldsEnriched.push('target_segment');
      }
      if (catalogProduct.use_cases) {
        enrichedFields.use_cases = catalogProduct.use_cases;
        fieldsEnriched.push('use_cases');
      }
      if (catalogProduct.integrations) {
        enrichedFields.integrations = catalogProduct.integrations;
        fieldsEnriched.push('integrations');
      }

      reasoning.push(`Matched product: ${catalogProduct.vendor} ${catalogProduct.name}`);
    } else {
      const catalogService = bestMatch.entry as CatalogService;

      // Enrich with service fields
      if (!extracted.vendor && catalogService.vendor) {
        enrichedFields.vendor = catalogService.vendor;
        fieldsEnriched.push('vendor');
      }
      if (catalogService.category) {
        enrichedFields.category = catalogService.category;
        fieldsEnriched.push('category');
      }
      if (catalogService.subcategory) {
        enrichedFields.subcategory = catalogService.subcategory;
        fieldsEnriched.push('subcategory');
      }
      if (catalogService.delivery_model) {
        enrichedFields.delivery_model = catalogService.delivery_model;
        fieldsEnriched.push('delivery_model');
      }
      if (catalogService.service_window) {
        enrichedFields.service_window = catalogService.service_window;
        fieldsEnriched.push('service_window');
      }
      if (catalogService.sla_tier) {
        enrichedFields.sla_tier = catalogService.sla_tier;
        fieldsEnriched.push('sla_tier');
      }
      if (catalogService.target_segment) {
        enrichedFields.target_segment = catalogService.target_segment;
        fieldsEnriched.push('target_segment');
      }

      reasoning.push(`Matched service: ${catalogService.name}`);
    }

    reasoning.push(`Similarity score: ${(bestMatch.score * 100).toFixed(1)}%`);
    reasoning.push(`Enriched ${fieldsEnriched.length} fields from catalog`);

    return {
      source: 'company_catalog',
      confidence: bestMatch.score,
      matched_entry_id: bestMatch.entry.id,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields
    };
  }

  /**
   * Add a new product to the catalog (runtime addition)
   */
  async addProduct(product: CatalogProduct): Promise<void> {
    this.catalogs.set(product.id, product);
    this.catalogTypes.set(product.id, 'product');

    if (this.vectorStore) {
      await this.vectorStore.addDocuments([{
        pageContent: this.productToSearchText(product),
        metadata: {
          id: product.id,
          type: 'product',
          vendor: product.vendor,
          category: product.category
        }
      }]);
    }
  }

  /**
   * Add a new service to the catalog (runtime addition)
   */
  async addService(service: CatalogService): Promise<void> {
    this.catalogs.set(service.id, service);
    this.catalogTypes.set(service.id, 'service');

    if (this.vectorStore) {
      await this.vectorStore.addDocuments([{
        pageContent: this.serviceToSearchText(service),
        metadata: {
          id: service.id,
          type: 'service',
          vendor: service.vendor,
          category: service.category
        }
      }]);
    }
  }

  /**
   * Get catalog statistics
   */
  getStats(): { products: number; services: number; total: number } {
    let products = 0;
    let services = 0;

    for (const type of this.catalogTypes.values()) {
      if (type === 'product') products++;
      else services++;
    }

    return { products, services, total: this.catalogs.size };
  }

  /**
   * Convert product to searchable text
   */
  private productToSearchText(product: CatalogProduct): string {
    const parts = [
      product.vendor,
      product.name,
      product.category,
      product.subcategory,
      product.description,
      product.segment,
      product.lifecycle_stage,
      product.target_segment,
      product.pricing_model,
      product.use_cases?.join(' '),
      product.industry_tags?.join(' '),
      product.integrations?.join(' '),
    ];

    // Add aliases for improved matching (synthetic catalogs)
    if (product.aliases) {
      parts.push(product.aliases.join(' '));
    }

    // Add keywords for improved matching (synthetic catalogs)
    if (product.keywords) {
      parts.push(product.keywords.join(' '));
    }

    // Add specifications if present
    if (product.specifications) {
      for (const [key, value] of Object.entries(product.specifications)) {
        if (typeof value === 'string' || typeof value === 'number') {
          parts.push(`${key}: ${value}`);
        }
      }
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Convert service to searchable text
   */
  private serviceToSearchText(service: CatalogService): string {
    return [
      service.vendor,
      service.name,
      service.category,
      service.subcategory,
      service.description,
      service.delivery_model,
      service.industry_focus?.join(' ')
    ].filter(Boolean).join(' ');
  }
}

// Singleton instance
let instance: CompanyCatalogSource | null = null;

export function getCompanyCatalogSource(): CompanyCatalogSource {
  if (!instance) {
    instance = new CompanyCatalogSource();
  }
  return instance;
}

export default CompanyCatalogSource;
