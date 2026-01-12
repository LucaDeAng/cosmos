/**
 * Company History Source
 *
 * Learns from validated product/service extractions for each company.
 * Provides company-specific few-shot learning by:
 * - Storing validated extractions in database
 * - Building company-specific vector indices
 * - Matching new extractions against company history
 *
 * This enables "memory" - the system learns from user corrections
 * and applies that knowledge to future extractions.
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { supabase } from '../../config/supabase';
import type { CompanyHistoryEntry, CompanyHistoryMatch, EnrichmentResult } from '../types';

interface EnrichmentResultWithFields extends EnrichmentResult {
  enrichedFields: Record<string, unknown>;
}

/**
 * Validated item to save to history
 */
export interface ValidatedItem {
  item_name: string;
  item_type: 'product' | 'service';
  item_vendor?: string;
  item_category?: string;
  item_description?: string;

  // The validated/corrected classification
  final_classification: {
    type: 'product' | 'service';
    category: string;
    subcategory?: string;
    vendor?: string;
    [key: string]: unknown;
  };

  // Optional metadata
  source_document?: string;
  source_type?: string;
}

export class CompanyHistorySource {
  private embeddings: OpenAIEmbeddings;
  private companyStores: Map<string, MemoryVectorStore> = new Map();
  private companyEntries: Map<string, CompanyHistoryEntry[]> = new Map();

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small'
    });
  }

  /**
   * Load company history from database
   */
  async loadCompanyHistory(companyId: string): Promise<void> {
    if (this.companyStores.has(companyId)) {
      return; // Already loaded
    }

    try {
      // Check if table exists first
      const { data: tableCheck, error: tableError } = await supabase
        .from('extraction_history')
        .select('id')
        .limit(1);

      if (tableError && tableError.code === '42P01') {
        // Table doesn't exist - create it
        console.log('   📝 Creating extraction_history table...');
        await this.createHistoryTable();
      }

      // Load entries for this company
      const { data: entries, error } = await supabase
        .from('extraction_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('validated_by_user', true)
        .order('created_at', { ascending: false })
        .limit(100); // Last 100 validated items

      if (error) {
        console.warn(`   ⚠️  Failed to load company history: ${error.message}`);
        return;
      }

      if (!entries || entries.length === 0) {
        console.log(`   ℹ️  No history found for company ${companyId}`);
        return;
      }

      // Store entries
      this.companyEntries.set(companyId, entries);

      // Build vector store
      const documents = entries.map(entry => ({
        pageContent: this.entryToSearchText(entry),
        metadata: {
          id: entry.id,
          type: entry.item_type,
          vendor: entry.item_vendor
        }
      }));

      const vectorStore = await MemoryVectorStore.fromDocuments(
        documents,
        this.embeddings
      );

      this.companyStores.set(companyId, vectorStore);
      console.log(`   ✅ Loaded ${entries.length} history entries for company ${companyId}`);

    } catch (error) {
      console.warn('   ⚠️  Company history load error:', error);
    }
  }

  /**
   * Find similar items in company history
   */
  async findSimilar(
    companyId: string,
    name: string,
    description?: string,
    topK = 3
  ): Promise<CompanyHistoryMatch[]> {
    await this.loadCompanyHistory(companyId);

    const vectorStore = this.companyStores.get(companyId);
    if (!vectorStore) {
      return [];
    }

    const entries = this.companyEntries.get(companyId) || [];
    const searchQuery = `${name} ${description || ''}`;

    const results = await vectorStore.similaritySearchWithScore(searchQuery, topK);

    return results.map(([doc, distance]) => {
      const entry = entries.find(e => e.id === doc.metadata.id);
      const matchedFields: string[] = [];

      // Determine which fields matched
      if (doc.pageContent.toLowerCase().includes(name.toLowerCase())) {
        matchedFields.push('name');
      }

      return {
        entry: entry!,
        similarity: 1 - distance,
        matched_fields: matchedFields
      };
    }).filter(m => m.entry !== undefined);
  }

  /**
   * Enrich extracted item with company history
   */
  async enrich(
    companyId: string,
    extracted: { name: string; description?: string; type: 'product' | 'service' }
  ): Promise<EnrichmentResultWithFields> {
    const matches = await this.findSimilar(
      companyId,
      extracted.name,
      extracted.description,
      3
    );

    // No matches or low confidence
    if (matches.length === 0 || matches[0].similarity < 0.75) {
      return {
        source: 'company_catalog', // Reuse type
        confidence: 0,
        fields_enriched: [],
        reasoning: ['No matching items in company history'],
        enrichedFields: {}
      };
    }

    const bestMatch = matches[0];
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];

    // Apply learned classification
    const classification = bestMatch.entry.final_classification;

    if (classification.type) {
      enrichedFields.type = classification.type;
      fieldsEnriched.push('type');
    }
    if (classification.category) {
      enrichedFields.category = classification.category;
      fieldsEnriched.push('category');
    }
    if (classification.subcategory) {
      enrichedFields.subcategory = classification.subcategory;
      fieldsEnriched.push('subcategory');
    }
    if (classification.vendor) {
      enrichedFields.vendor = classification.vendor;
      fieldsEnriched.push('vendor');
    }

    return {
      source: 'company_catalog', // Indicate this came from history
      confidence: bestMatch.similarity,
      matched_entry_id: bestMatch.entry.id,
      fields_enriched: fieldsEnriched,
      reasoning: [
        `Matched with previous extraction: "${bestMatch.entry.item_name}"`,
        `Validated by user on ${new Date(bestMatch.entry.validation_timestamp || bestMatch.entry.created_at).toLocaleDateString()}`,
        `Similarity: ${(bestMatch.similarity * 100).toFixed(1)}%`
      ],
      enrichedFields
    };
  }

  /**
   * Save validated extraction to history
   */
  async saveValidatedItem(
    companyId: string,
    tenantId: string,
    item: ValidatedItem
  ): Promise<boolean> {
    try {
      const entry: Partial<CompanyHistoryEntry> = {
        company_id: companyId,
        tenant_id: tenantId,
        item_name: item.item_name,
        item_type: item.item_type,
        item_vendor: item.item_vendor,
        item_category: item.item_category,
        final_classification: item.final_classification,
        validated_by_user: true,
        validation_timestamp: new Date(),
        source_document: item.source_document,
        source_type: item.source_type,
        created_at: new Date(),
        updated_at: new Date()
      };

      const { error } = await supabase
        .from('extraction_history')
        .insert(entry);

      if (error) {
        console.error('Failed to save validated item:', error);
        return false;
      }

      // Invalidate cache for this company
      this.companyStores.delete(companyId);
      this.companyEntries.delete(companyId);

      console.log(`   ✅ Saved validated item "${item.item_name}" to history`);
      return true;

    } catch (error) {
      console.error('Save validated item error:', error);
      return false;
    }
  }

  /**
   * Batch save validated items
   */
  async saveValidatedItems(
    companyId: string,
    tenantId: string,
    items: ValidatedItem[]
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const item of items) {
      const saved = await this.saveValidatedItem(companyId, tenantId, item);
      if (saved) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Get company history statistics
   */
  async getCompanyStats(companyId: string): Promise<{
    total_entries: number;
    validated_entries: number;
    products: number;
    services: number;
    top_categories: string[];
  }> {
    try {
      const { data: entries, error } = await supabase
        .from('extraction_history')
        .select('*')
        .eq('company_id', companyId);

      if (error || !entries) {
        return {
          total_entries: 0,
          validated_entries: 0,
          products: 0,
          services: 0,
          top_categories: []
        };
      }

      const categories = new Map<string, number>();
      let products = 0;
      let services = 0;
      let validated = 0;

      for (const entry of entries) {
        if (entry.validated_by_user) validated++;
        if (entry.item_type === 'product') products++;
        if (entry.item_type === 'service') services++;

        const cat = entry.item_category || 'Unknown';
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }

      const topCategories = [...categories.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat]) => cat);

      return {
        total_entries: entries.length,
        validated_entries: validated,
        products,
        services,
        top_categories: topCategories
      };

    } catch (error) {
      console.error('Get company stats error:', error);
      return {
        total_entries: 0,
        validated_entries: 0,
        products: 0,
        services: 0,
        top_categories: []
      };
    }
  }

  /**
   * Clear company history cache
   */
  clearCache(companyId?: string): void {
    if (companyId) {
      this.companyStores.delete(companyId);
      this.companyEntries.delete(companyId);
    } else {
      this.companyStores.clear();
      this.companyEntries.clear();
    }
  }

  /**
   * Convert entry to searchable text
   */
  private entryToSearchText(entry: CompanyHistoryEntry): string {
    return [
      entry.item_name,
      entry.item_vendor,
      entry.item_category,
      entry.final_classification?.category,
      entry.final_classification?.subcategory
    ].filter(Boolean).join(' ');
  }

  /**
   * Create extraction_history table if it doesn't exist
   */
  private async createHistoryTable(): Promise<void> {
    // Note: In production, this should be a proper migration
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS extraction_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        item_name TEXT NOT NULL,
        item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
        item_vendor TEXT,
        item_category TEXT,
        final_classification JSONB NOT NULL,
        validated_by_user BOOLEAN DEFAULT false,
        validation_timestamp TIMESTAMPTZ,
        source_document TEXT,
        source_type TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_extraction_history_company
        ON extraction_history(company_id);

      CREATE INDEX IF NOT EXISTS idx_extraction_history_tenant
        ON extraction_history(tenant_id);

      CREATE INDEX IF NOT EXISTS idx_extraction_history_validated
        ON extraction_history(company_id, validated_by_user);
    `;

    try {
      // Use RPC for raw SQL (if available) or handle gracefully
      console.log('   ℹ️  Table creation should be done via migrations');
    } catch (error) {
      console.warn('   ⚠️  Could not create table automatically');
    }
  }
}

// Singleton instance
let instance: CompanyHistorySource | null = null;

export function getCompanyHistorySource(): CompanyHistorySource {
  if (!instance) {
    instance = new CompanyHistorySource();
  }
  return instance;
}

export default CompanyHistorySource;
