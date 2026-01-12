/**
 * Catalog Enricher Service
 * 
 * Proposes and applies enrichments to the knowledge catalogs based on
 * learned patterns, user feedback, and successful extractions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  CatalogEnrichment,
  CatalogType,
  EnrichmentType,
  EnrichmentContent,
  EnrichmentStatus,
  ExtractionResult,
  ICatalogEnricher,
  DbCatalogEnrichment,
  ExtractedItemTemplate
} from './types';
import * as embeddingService from '../utils/embeddingService';
import { SourceType, SearchResult } from '../utils/embeddingService';

// System company ID for catalog operations
const SYSTEM_COMPANY_ID = 'system';

// ============================================================================
// Configuration
// ============================================================================

interface CatalogEnricherConfig {
  minConfidenceForAutoApply: number;
  requireReviewForNewEntries: boolean;
  maxEnrichmentsPerBatch: number;
  catalogBasePath: string;
  embeddingUpdateEnabled: boolean;
}

const DEFAULT_CONFIG: CatalogEnricherConfig = {
  minConfidenceForAutoApply: 0.9,
  requireReviewForNewEntries: true,
  maxEnrichmentsPerBatch: 20,
  catalogBasePath: path.join(__dirname, '..', 'knowledge', 'catalogs'),
  embeddingUpdateEnabled: true
};

// ============================================================================
// Catalog Type Mapping
// ============================================================================

const CATALOG_FILE_MAP: Record<CatalogType, { filename: string; sourceType: SourceType }> = {
  products: { filename: 'product-categories.md', sourceType: 'catalog_products' },
  industries: { filename: 'industry-verticals.md', sourceType: 'catalog_industries' },
  entities: { filename: 'business-entities.md', sourceType: 'catalog_entities' },
  examples: { filename: 'synthetic-examples.md', sourceType: 'catalog_examples' },
  vendors: { filename: 'vendors.md', sourceType: 'catalog_products' }, // Shared with products
  categories: { filename: 'product-categories.md', sourceType: 'catalog_products' }
};

// ============================================================================
// Catalog Enricher Implementation
// ============================================================================

export class CatalogEnricher implements ICatalogEnricher {
  private supabase: SupabaseClient;
  private openai: OpenAI;
  private config: CatalogEnricherConfig;

  constructor(config?: Partial<CatalogEnricherConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Helper: Semantic Search Wrapper
  // ==========================================================================

  /**
   * Search catalog embeddings using semantic similarity
   */
  private async searchCatalog(
    query: string,
    sourceTypes: SourceType[],
    limit: number = 3
  ): Promise<SearchResult[]> {
    try {
      return await embeddingService.semanticSearch(SYSTEM_COMPANY_ID, query, {
        sourceTypes,
        limit,
        similarityThreshold: 0.5
      });
    } catch (error) {
      console.error('[CatalogEnricher] Search error:', error);
      return [];
    }
  }

  // ==========================================================================
  // Core Enrichment Methods
  // ==========================================================================

  /**
   * Propose a new catalog enrichment
   */
  async proposeEnrichment(
    enrichment: Omit<CatalogEnrichment, 'id' | 'createdAt' | 'status'>
  ): Promise<CatalogEnrichment> {
    console.log(`[CatalogEnricher] Proposing ${enrichment.enrichmentType} enrichment for ${enrichment.catalogType}`);

    // Check for duplicates
    const isDuplicate = await this.checkDuplicate(enrichment);
    if (isDuplicate) {
      console.log('[CatalogEnricher] Duplicate enrichment found, skipping');
      throw new Error('Duplicate enrichment');
    }

    // Determine initial status
    let status: EnrichmentStatus = 'pending';
    
    // Auto-approve high-confidence enrichments if configured
    if (
      enrichment.confidence >= this.config.minConfidenceForAutoApply &&
      !this.config.requireReviewForNewEntries
    ) {
      status = 'approved';
    }

    // For synonyms and attributes, lower threshold for auto-approve
    if (
      ['synonym', 'attribute', 'example'].includes(enrichment.enrichmentType) &&
      enrichment.confidence >= 0.8
    ) {
      status = 'approved';
    }

    const fullEnrichment: CatalogEnrichment = {
      id: uuidv4(),
      ...enrichment,
      status,
      createdAt: new Date()
    };

    // Store in database
    const dbEnrichment: Omit<DbCatalogEnrichment, 'id'> & { id: string } = {
      id: fullEnrichment.id,
      catalog_type: fullEnrichment.catalogType,
      enrichment_type: fullEnrichment.enrichmentType,
      entry_id: fullEnrichment.entryId || null,
      content: fullEnrichment.content,
      source_type: fullEnrichment.sourceType,
      source_id: fullEnrichment.sourceId,
      status: fullEnrichment.status,
      confidence: fullEnrichment.confidence,
      reviewed_by: null,
      reviewed_at: null,
      created_at: fullEnrichment.createdAt.toISOString(),
      applied_at: null
    };

    const { error } = await this.supabase
      .from('rag_catalog_enrichments')
      .insert(dbEnrichment);

    if (error) {
      console.error('[CatalogEnricher] Error proposing enrichment:', error);
      throw error;
    }

    // Auto-apply if approved
    if (status === 'approved') {
      await this.applyEnrichment(fullEnrichment.id);
    }

    return fullEnrichment;
  }

  /**
   * Review an enrichment (approve or reject)
   */
  async reviewEnrichment(
    enrichmentId: string,
    approved: boolean,
    reviewerId: string
  ): Promise<void> {
    console.log(`[CatalogEnricher] Reviewing enrichment ${enrichmentId}: ${approved ? 'approved' : 'rejected'}`);

    const newStatus: EnrichmentStatus = approved ? 'approved' : 'rejected';

    const { error } = await this.supabase
      .from('rag_catalog_enrichments')
      .update({
        status: newStatus,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', enrichmentId);

    if (error) {
      console.error('[CatalogEnricher] Error reviewing enrichment:', error);
      throw error;
    }

    // Apply if approved
    if (approved) {
      await this.applyEnrichment(enrichmentId);
    }
  }

  /**
   * Apply an approved enrichment to the catalog
   */
  async applyEnrichment(enrichmentId: string): Promise<void> {
    console.log(`[CatalogEnricher] Applying enrichment ${enrichmentId}`);

    // Fetch enrichment
    const { data, error: fetchError } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('*')
      .eq('id', enrichmentId)
      .single();

    if (fetchError || !data) {
      throw new Error(`Enrichment ${enrichmentId} not found`);
    }

    const enrichment = data as DbCatalogEnrichment;

    // Apply based on type
    try {
      switch (enrichment.enrichment_type) {
        case 'new_entry':
          await this.applyNewEntry(enrichment);
          break;
        case 'synonym':
          await this.applySynonym(enrichment);
          break;
        case 'example':
          await this.applyExample(enrichment);
          break;
        case 'attribute':
          await this.applyAttribute(enrichment);
          break;
        case 'relationship':
          await this.applyRelationship(enrichment);
          break;
        case 'correction':
          await this.applyCorrection(enrichment);
          break;
      }

      // Update embeddings if enabled
      if (this.config.embeddingUpdateEnabled) {
        await this.updateCatalogEmbeddings(enrichment.catalog_type as CatalogType);
      }

      // Mark as applied
      await this.supabase
        .from('rag_catalog_enrichments')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString()
        })
        .eq('id', enrichmentId);

      console.log(`[CatalogEnricher] Enrichment ${enrichmentId} applied successfully`);

    } catch (error) {
      console.error('[CatalogEnricher] Error applying enrichment:', error);
      throw error;
    }
  }

  /**
   * Find potential enrichments from extractions
   */
  async findPotentialEnrichments(
    extractions: ExtractionResult[]
  ): Promise<CatalogEnrichment[]> {
    console.log(`[CatalogEnricher] Finding enrichments from ${extractions.length} extractions`);

    const potentialEnrichments: CatalogEnrichment[] = [];

    for (const extraction of extractions) {
      // Analyze each item for potential enrichments
      for (const item of extraction.items) {
        // Check for new vendors
        if (item.vendor) {
          const vendorEnrichment = await this.checkVendorEnrichment(item.vendor as string);
          if (vendorEnrichment) {
            potentialEnrichments.push(vendorEnrichment);
          }
        }

        // Check for new categories
        if (item.category) {
          const categoryEnrichment = await this.checkCategoryEnrichment(item.category as string);
          if (categoryEnrichment) {
            potentialEnrichments.push(categoryEnrichment);
          }
        }

        // Check for new product types
        if (item.type) {
          const typeEnrichment = await this.checkTypeEnrichment(
            item.type as string,
            item.category as string
          );
          if (typeEnrichment) {
            potentialEnrichments.push(typeEnrichment);
          }
        }

        // Generate example enrichment
        const exampleEnrichment = await this.createExampleEnrichment(item, extraction.id);
        if (exampleEnrichment) {
          potentialEnrichments.push(exampleEnrichment);
        }
      }
    }

    // Deduplicate
    const uniqueEnrichments = this.deduplicateEnrichments(potentialEnrichments);

    console.log(`[CatalogEnricher] Found ${uniqueEnrichments.length} potential enrichments`);
    return uniqueEnrichments;
  }

  // ==========================================================================
  // Enrichment Type Handlers
  // ==========================================================================

  /**
   * Apply a new entry enrichment
   */
  private async applyNewEntry(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    const catalogInfo = CATALOG_FILE_MAP[enrichment.catalog_type as CatalogType];
    
    if (!catalogInfo) {
      throw new Error(`Unknown catalog type: ${enrichment.catalog_type}`);
    }

    const filePath = path.join(this.config.catalogBasePath, catalogInfo.filename);
    
    // Generate markdown entry
    const entry = this.generateMarkdownEntry(content, enrichment.catalog_type as CatalogType);
    
    // Append to file
    let existingContent = '';
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf-8');
    }

    // Find appropriate section and append
    const updatedContent = this.insertIntoSection(existingContent, entry, content.parentCategory);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
  }

  /**
   * Apply a synonym enrichment
   */
  private async applySynonym(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    
    // For synonyms, we add to the embedding service directly
    // This allows the RAG to find items by alternative names
    if (content.synonyms && content.synonyms.length > 0) {
      const catalogInfo = CATALOG_FILE_MAP[enrichment.catalog_type as CatalogType];
      
      for (const synonym of content.synonyms) {
        const synonymDoc = `Synonym: "${synonym}" refers to "${content.name}"\n` +
          `Category: ${enrichment.catalog_type}\n` +
          `${content.description ? `Description: ${content.description}` : ''}`;

        await embeddingService.indexDocument(
          SYSTEM_COMPANY_ID,
          `synonym-${synonym}-${content.name}`,
          synonymDoc,
          { sourceType: catalogInfo.sourceType, synonym, originalName: content.name }
        );
      }
    }
  }

  /**
   * Apply an example enrichment
   */
  private async applyExample(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    
    if (content.examples && content.examples.length > 0) {
      // Add examples to the synthetic examples catalog
      const examplesFile = path.join(this.config.catalogBasePath, 'synthetic-examples.md');
      
      let existingContent = '';
      if (fs.existsSync(examplesFile)) {
        existingContent = fs.readFileSync(examplesFile, 'utf-8');
      }

      const newExamples = content.examples.map(ex => 
        `### Example: ${content.name}\n\n${ex}\n`
      ).join('\n');

      const updatedContent = existingContent + '\n\n' + newExamples;
      fs.writeFileSync(examplesFile, updatedContent, 'utf-8');
    }
  }

  /**
   * Apply an attribute enrichment
   */
  private async applyAttribute(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    
    // Attributes are stored in embeddings for RAG retrieval
    if (content.attributes && Object.keys(content.attributes).length > 0) {
      const attributeDoc = `Attributes for "${content.name}":\n` +
        Object.entries(content.attributes)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n');

      const catalogInfo = CATALOG_FILE_MAP[enrichment.catalog_type as CatalogType];
      
      await embeddingService.indexDocument(
        SYSTEM_COMPANY_ID,
        `attributes-${content.name}`,
        attributeDoc,
        { sourceType: catalogInfo.sourceType, name: content.name }
      );
    }
  }

  /**
   * Apply a relationship enrichment
   */
  private async applyRelationship(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    
    if (content.relatedTo && content.relatedTo.length > 0) {
      const relationshipDoc = `Relationships for "${content.name}":\n` +
        `Related to: ${content.relatedTo.join(', ')}`;

      const catalogInfo = CATALOG_FILE_MAP[enrichment.catalog_type as CatalogType];
      
      await embeddingService.indexDocument(
        SYSTEM_COMPANY_ID,
        `relationships-${content.name}`,
        relationshipDoc,
        { sourceType: catalogInfo.sourceType, name: content.name }
      );
    }
  }

  /**
   * Apply a correction enrichment
   */
  private async applyCorrection(enrichment: DbCatalogEnrichment): Promise<void> {
    const content = enrichment.content as EnrichmentContent;
    const catalogInfo = CATALOG_FILE_MAP[enrichment.catalog_type as CatalogType];
    
    if (!catalogInfo || !enrichment.entry_id) {
      throw new Error('Correction requires entry_id');
    }

    const filePath = path.join(this.config.catalogBasePath, catalogInfo.filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Catalog file not found: ${filePath}`);
    }

    let fileContent = fs.readFileSync(filePath, 'utf-8');

    // Find and replace the entry
    // This is simplified - in production would need more sophisticated matching
    if (content.name) {
      const oldName = enrichment.entry_id;
      const newName = content.name;
      fileContent = fileContent.replace(new RegExp(oldName, 'g'), newName);
    }

    fs.writeFileSync(filePath, fileContent, 'utf-8');
  }

  // ==========================================================================
  // Enrichment Detection Helpers
  // ==========================================================================

  /**
   * Check if a vendor should be added to the catalog
   */
  private async checkVendorEnrichment(vendor: string): Promise<CatalogEnrichment | null> {
    // Search existing vendors
    const results = await this.searchCatalog(vendor, ['catalog_products'], 3);
    
    // Check if vendor already exists
    const exists = results.some((r: SearchResult) => 
      r.content.toLowerCase().includes(vendor.toLowerCase()) &&
      r.similarity > 0.8
    );

    if (!exists) {
      return {
        id: uuidv4(),
        catalogType: 'vendors',
        enrichmentType: 'new_entry',
        content: {
          name: vendor,
          description: `Vendor: ${vendor}`
        },
        sourceType: 'extraction',
        sourceId: 'auto-detected',
        status: 'pending',
        confidence: 0.7,
        createdAt: new Date()
      };
    }

    return null;
  }

  /**
   * Check if a category should be added to the catalog
   */
  private async checkCategoryEnrichment(category: string): Promise<CatalogEnrichment | null> {
    const results = await this.searchCatalog(category, ['catalog_products'], 3);
    
    const exists = results.some((r: SearchResult) => 
      r.content.toLowerCase().includes(category.toLowerCase()) &&
      r.similarity > 0.75
    );

    if (!exists) {
      // Use LLM to determine parent category
      const parentCategory = await this.determineParentCategory(category);

      return {
        id: uuidv4(),
        catalogType: 'categories',
        enrichmentType: 'new_entry',
        content: {
          name: category,
          parentCategory,
          description: `Category: ${category}`
        },
        sourceType: 'extraction',
        sourceId: 'auto-detected',
        status: 'pending',
        confidence: 0.6,
        createdAt: new Date()
      };
    }

    return null;
  }

  /**
   * Check if a product type should be added
   */
  private async checkTypeEnrichment(
    type: string,
    category?: string
  ): Promise<CatalogEnrichment | null> {
    const searchQuery = category ? `${type} ${category}` : type;
    const results = await this.searchCatalog(searchQuery, ['catalog_entities'], 3);
    
    const exists = results.some((r: SearchResult) => 
      r.content.toLowerCase().includes(type.toLowerCase()) &&
      r.similarity > 0.75
    );

    if (!exists) {
      return {
        id: uuidv4(),
        catalogType: 'entities',
        enrichmentType: 'new_entry',
        content: {
          name: type,
          parentCategory: category,
          description: `Entity type: ${type}`
        },
        sourceType: 'extraction',
        sourceId: 'auto-detected',
        status: 'pending',
        confidence: 0.5,
        createdAt: new Date()
      };
    }

    return null;
  }

  /**
   * Create an example enrichment from an extraction
   */
  private async createExampleEnrichment(
    item: ExtractedItemTemplate,
    extractionId: string
  ): Promise<CatalogEnrichment | null> {
    // Only create examples for well-structured items
    if (!item.name || !item.description) return null;

    const example = JSON.stringify(item, null, 2);

    return {
      id: uuidv4(),
      catalogType: 'examples',
      enrichmentType: 'example',
      content: {
        name: item.name,
        examples: [example]
      },
      sourceType: 'extraction',
      sourceId: extractionId,
      status: 'pending',
      confidence: 0.8,
      createdAt: new Date()
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Check for duplicate enrichments
   */
  private async checkDuplicate(
    enrichment: Omit<CatalogEnrichment, 'id' | 'createdAt' | 'status'>
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('id')
      .eq('catalog_type', enrichment.catalogType)
      .eq('enrichment_type', enrichment.enrichmentType)
      .in('status', ['pending', 'approved', 'applied'])
      .limit(10);

    if (!data || data.length === 0) return false;

    // Check content similarity
    const { data: fullData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('content')
      .eq('catalog_type', enrichment.catalogType)
      .eq('enrichment_type', enrichment.enrichmentType)
      .in('status', ['pending', 'approved', 'applied']);

    if (!fullData) return false;

    return fullData.some(d => {
      const existingContent = d.content as EnrichmentContent;
      const newContent = enrichment.content;
      return existingContent.name?.toLowerCase() === newContent.name?.toLowerCase();
    });
  }

  /**
   * Determine parent category using LLM
   */
  private async determineParentCategory(category: string): Promise<string> {
    const prompt = `Given the category "${category}", determine the most appropriate parent category from this list:
- Industrial Products
- Consumer Products
- Technology Solutions
- Financial Services
- Professional Services
- Healthcare
- Manufacturing
- Retail
- Other

Return only the parent category name, nothing else.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 50
      });

      return response.choices[0].message.content?.trim() || 'Other';
    } catch {
      return 'Other';
    }
  }

  /**
   * Generate markdown entry for a new catalog item
   */
  private generateMarkdownEntry(content: EnrichmentContent, catalogType: CatalogType): string {
    const parts: string[] = [];

    parts.push(`### ${content.name}`);
    
    if (content.description) {
      parts.push(content.description);
    }

    if (content.synonyms && content.synonyms.length > 0) {
      parts.push(`**Synonyms:** ${content.synonyms.join(', ')}`);
    }

    if (content.attributes && Object.keys(content.attributes).length > 0) {
      parts.push('\n**Attributes:**');
      for (const [key, value] of Object.entries(content.attributes)) {
        parts.push(`- ${key}: ${value}`);
      }
    }

    if (content.examples && content.examples.length > 0) {
      parts.push('\n**Examples:**');
      for (const example of content.examples) {
        parts.push(`- ${example}`);
      }
    }

    return parts.join('\n') + '\n';
  }

  /**
   * Insert content into the appropriate section of a markdown file
   */
  private insertIntoSection(
    content: string,
    newEntry: string,
    section?: string
  ): string {
    if (!section) {
      // Append to end
      return content + '\n' + newEntry;
    }

    // Find section header
    const sectionRegex = new RegExp(`(## ${section}[^\n]*\n)`, 'i');
    const match = content.match(sectionRegex);

    if (match && match.index !== undefined) {
      // Find end of section (next ## or end of file)
      const sectionStart = match.index + match[0].length;
      const nextSectionMatch = content.substring(sectionStart).match(/\n## /);
      
      if (nextSectionMatch && nextSectionMatch.index !== undefined) {
        const insertPoint = sectionStart + nextSectionMatch.index;
        return content.substring(0, insertPoint) + '\n' + newEntry + content.substring(insertPoint);
      } else {
        return content + '\n' + newEntry;
      }
    }

    // Section not found, append to end
    return content + '\n' + newEntry;
  }

  /**
   * Update catalog embeddings after enrichment
   */
  private async updateCatalogEmbeddings(catalogType: CatalogType): Promise<void> {
    const catalogInfo = CATALOG_FILE_MAP[catalogType];
    if (!catalogInfo) return;

    const filePath = path.join(this.config.catalogBasePath, catalogInfo.filename);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      await embeddingService.indexDocument(
        SYSTEM_COMPANY_ID,
        `catalog-${catalogType}`,
        content,
        { sourceType: catalogInfo.sourceType, catalogType }
      );
    }
  }

  /**
   * Deduplicate enrichments by content
   */
  private deduplicateEnrichments(enrichments: CatalogEnrichment[]): CatalogEnrichment[] {
    const seen = new Set<string>();
    return enrichments.filter(e => {
      const key = `${e.catalogType}:${e.enrichmentType}:${e.content.name?.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ==========================================================================
  // Public Utility Methods
  // ==========================================================================

  /**
   * Get pending enrichments for review
   */
  async getPendingEnrichments(): Promise<CatalogEnrichment[]> {
    const { data, error } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('*')
      .eq('status', 'pending')
      .order('confidence', { ascending: false })
      .limit(this.config.maxEnrichmentsPerBatch);

    if (error) {
      console.error('[CatalogEnricher] Error fetching pending:', error);
      return [];
    }

    return (data as DbCatalogEnrichment[]).map(db => this.dbToEnrichment(db));
  }

  /**
   * Get enrichments with filters
   */
  async getEnrichments(filters: {
    status?: EnrichmentStatus | EnrichmentStatus[];
    catalogType?: CatalogType;
    enrichmentType?: EnrichmentType;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ enrichments: CatalogEnrichment[]; total: number }> {
    let query = this.supabase
      .from('rag_catalog_enrichments')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }
    if (filters.catalogType) {
      query = query.eq('catalog_type', filters.catalogType);
    }
    if (filters.enrichmentType) {
      query = query.eq('enrichment_type', filters.enrichmentType);
    }

    // Order and pagination
    query = query
      .order('created_at', { ascending: false })
      .range(
        filters.offset || 0,
        (filters.offset || 0) + (filters.limit || 50) - 1
      );

    const { data, error, count } = await query;

    if (error) {
      console.error('[CatalogEnricher] Error fetching enrichments:', error);
      return { enrichments: [], total: 0 };
    }

    return {
      enrichments: (data as DbCatalogEnrichment[]).map(db => this.dbToEnrichment(db)),
      total: count || 0
    };
  }

  /**
   * Get enrichment statistics
   */
  async getEnrichmentStats(): Promise<{
    total: number;
    byStatus: Record<EnrichmentStatus, number>;
    byCatalogType: Record<string, number>;
    byEnrichmentType: Record<string, number>;
    recentActivity: { date: string; count: number }[];
    avgConfidence: number;
  }> {
    // Get counts by status
    const { data: statusData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('status');

    const byStatus: Record<EnrichmentStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
      superseded: 0
    };

    let total = 0;
    (statusData || []).forEach((row: { status: EnrichmentStatus }) => {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      total++;
    });

    // Get counts by catalog type
    const { data: catalogData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('catalog_type');

    const byCatalogType: Record<string, number> = {};
    (catalogData || []).forEach((row: { catalog_type: string }) => {
      byCatalogType[row.catalog_type] = (byCatalogType[row.catalog_type] || 0) + 1;
    });

    // Get counts by enrichment type
    const { data: typeData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('enrichment_type');

    const byEnrichmentType: Record<string, number> = {};
    (typeData || []).forEach((row: { enrichment_type: string }) => {
      byEnrichmentType[row.enrichment_type] = (byEnrichmentType[row.enrichment_type] || 0) + 1;
    });

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const activityMap: Record<string, number> = {};
    (recentData || []).forEach((row: { created_at: string }) => {
      const date = row.created_at.split('T')[0];
      activityMap[date] = (activityMap[date] || 0) + 1;
    });

    const recentActivity = Object.entries(activityMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get average confidence
    const { data: confData } = await this.supabase
      .from('rag_catalog_enrichments')
      .select('confidence');

    let avgConfidence = 0;
    if (confData && confData.length > 0) {
      const sum = confData.reduce((acc: number, row: { confidence: number }) => acc + row.confidence, 0);
      avgConfidence = sum / confData.length;
    }

    return {
      total,
      byStatus,
      byCatalogType,
      byEnrichmentType,
      recentActivity,
      avgConfidence
    };
  }

  /**
   * Bulk review enrichments
   */
  async bulkReview(
    enrichmentIds: string[],
    approved: boolean,
    reviewerId: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of enrichmentIds) {
      try {
        await this.reviewEnrichment(id, approved, reviewerId);
        success++;
      } catch (error) {
        console.error(`[CatalogEnricher] Failed to review ${id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Convert DB enrichment to domain model
   */
  private dbToEnrichment(db: DbCatalogEnrichment): CatalogEnrichment {
    return {
      id: db.id,
      catalogType: db.catalog_type as CatalogType,
      enrichmentType: db.enrichment_type as EnrichmentType,
      entryId: db.entry_id || undefined,
      content: db.content,
      sourceType: db.source_type as 'pattern' | 'feedback' | 'extraction' | 'manual',
      sourceId: db.source_id,
      status: db.status as EnrichmentStatus,
      confidence: db.confidence,
      reviewedBy: db.reviewed_by || undefined,
      reviewedAt: db.reviewed_at ? new Date(db.reviewed_at) : undefined,
      createdAt: new Date(db.created_at),
      appliedAt: db.applied_at ? new Date(db.applied_at) : undefined
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let catalogEnricherInstance: CatalogEnricher | null = null;

export function getCatalogEnricher(
  config?: Partial<CatalogEnricherConfig>
): CatalogEnricher {
  if (!catalogEnricherInstance) {
    catalogEnricherInstance = new CatalogEnricher(config);
  }
  return catalogEnricherInstance;
}

export default CatalogEnricher;
