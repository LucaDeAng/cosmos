/**
 * Pinecone Company History Source
 *
 * Persistent vector storage for company-validated items.
 * Uses Pinecone with per-company namespaces for:
 * - Persistent embeddings that survive server restarts
 * - Scalable semantic search across company history
 * - Isolation between tenants via namespaces
 *
 * Falls back to MemoryVectorStore if Pinecone is not configured.
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { getPinecone, getCompanyNamespace, PINECONE_INDICES } from '../../config/pinecone';
import { supabase } from '../../config/supabase';
import type { CompanyHistoryEntry, CompanyHistoryMatch, EnrichmentResult } from '../types';

interface EnrichmentResultWithFields extends EnrichmentResult {
  enrichedFields: Record<string, unknown>;
}

export interface ValidatedItem {
  item_name: string;
  item_type: 'product' | 'service';
  item_vendor?: string;
  item_category?: string;
  item_description?: string;
  final_classification: {
    type: 'product' | 'service';
    category: string;
    subcategory?: string;
    vendor?: string;
    [key: string]: unknown;
  };
  source_document?: string;
  source_type?: string;
}

type VectorStore = PineconeStore | MemoryVectorStore;

export class PineconeCompanyHistorySource {
  private embeddings: OpenAIEmbeddings;
  private pineconeEnabled: boolean;
  private indexName: string;

  // Cache for company data (metadata from Supabase)
  private companyEntries: Map<string, CompanyHistoryEntry[]> = new Map();

  // Fallback memory stores if Pinecone not available
  private memoryStores: Map<string, MemoryVectorStore> = new Map();

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small'
    });

    const pinecone = getPinecone();
    this.pineconeEnabled = pinecone !== null;
    this.indexName = PINECONE_INDICES.COMPANY_HISTORY;

    if (this.pineconeEnabled) {
      console.log('   ✅ Pinecone enabled for company history persistence');
    } else {
      console.log('   ⚠️  Pinecone not configured - using in-memory vector store');
    }
  }

  /**
   * Initialize Pinecone index if needed
   */
  async initialize(): Promise<void> {
    if (!this.pineconeEnabled) return;

    try {
      const pinecone = getPinecone()!;

      // Check if index exists
      const indexes = await pinecone.listIndexes();
      const indexExists = indexes.indexes?.some(idx => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`   📝 Creating Pinecone index: ${this.indexName}`);
        await pinecone.createIndex({
          name: this.indexName,
          dimension: 1536, // text-embedding-3-small dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: process.env.PINECONE_ENVIRONMENT || 'us-east-1'
            }
          }
        });

        // Wait for index to be ready
        console.log('   ⏳ Waiting for index to be ready...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }

      console.log(`   ✅ Pinecone index ready: ${this.indexName}`);
    } catch (error) {
      console.error('   ❌ Pinecone initialization error:', error);
      this.pineconeEnabled = false;
    }
  }

  /**
   * Get vector store for a company
   */
  private async getVectorStore(companyId: string): Promise<VectorStore | null> {
    if (this.pineconeEnabled) {
      try {
        const pinecone = getPinecone()!;
        const index = pinecone.index(this.indexName);
        const namespace = getCompanyNamespace(companyId);

        return await PineconeStore.fromExistingIndex(this.embeddings, {
          pineconeIndex: index,
          namespace
        });
      } catch (error) {
        console.warn(`   ⚠️  Pinecone store error, falling back to memory: ${error}`);
      }
    }

    // Fallback to memory store
    return this.memoryStores.get(companyId) || null;
  }

  /**
   * Load company history from database and sync to vector store
   */
  async loadCompanyHistory(companyId: string): Promise<void> {
    try {
      // Load entries from Supabase
      const { data: entries, error } = await supabase
        .from('extraction_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('validated_by_user', true)
        .order('created_at', { ascending: false })
        .limit(500); // Increased limit for persistent storage

      if (error) {
        console.warn(`   ⚠️  Failed to load company history: ${error.message}`);
        return;
      }

      if (!entries || entries.length === 0) {
        console.log(`   ℹ️  No history found for company ${companyId}`);
        return;
      }

      // Store metadata locally
      this.companyEntries.set(companyId, entries);

      // If Pinecone is enabled, sync vectors
      if (this.pineconeEnabled) {
        await this.syncToPinecone(companyId, entries);
      } else {
        // Build memory vector store
        await this.buildMemoryStore(companyId, entries);
      }

      console.log(`   ✅ Loaded ${entries.length} history entries for company ${companyId}`);

    } catch (error) {
      console.warn('   ⚠️  Company history load error:', error);
    }
  }

  /**
   * Sync entries to Pinecone
   */
  private async syncToPinecone(companyId: string, entries: CompanyHistoryEntry[]): Promise<void> {
    try {
      const pinecone = getPinecone()!;
      const index = pinecone.index(this.indexName);
      const namespace = getCompanyNamespace(companyId);

      // Check existing vectors in namespace
      const stats = await index.describeIndexStats();
      const namespaceStats = stats.namespaces?.[namespace];
      const existingCount = namespaceStats?.recordCount || 0;

      // If counts match, assume synced (optimization)
      if (existingCount === entries.length) {
        console.log(`   ℹ️  Company ${companyId} already synced (${existingCount} vectors)`);
        return;
      }

      // Prepare documents for upsert
      const documents = entries.map(entry => new Document({
        pageContent: this.entryToSearchText(entry),
        metadata: {
          id: entry.id,
          type: entry.item_type,
          vendor: entry.item_vendor || '',
          category: entry.item_category || '',
          name: entry.item_name
        }
      }));

      // Upsert to Pinecone
      await PineconeStore.fromDocuments(documents, this.embeddings, {
        pineconeIndex: index,
        namespace
      });

      console.log(`   ✅ Synced ${entries.length} vectors to Pinecone for company ${companyId}`);

    } catch (error) {
      console.error(`   ❌ Pinecone sync error: ${error}`);
    }
  }

  /**
   * Build memory vector store (fallback)
   */
  private async buildMemoryStore(companyId: string, entries: CompanyHistoryEntry[]): Promise<void> {
    const documents = entries.map(entry => new Document({
      pageContent: this.entryToSearchText(entry),
      metadata: {
        id: entry.id,
        type: entry.item_type,
        vendor: entry.item_vendor || ''
      }
    }));

    const vectorStore = await MemoryVectorStore.fromDocuments(documents, this.embeddings);
    this.memoryStores.set(companyId, vectorStore);
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
    // Ensure history is loaded
    if (!this.companyEntries.has(companyId)) {
      await this.loadCompanyHistory(companyId);
    }

    const entries = this.companyEntries.get(companyId) || [];
    if (entries.length === 0) {
      return [];
    }

    const searchQuery = `${name} ${description || ''}`;

    try {
      if (this.pineconeEnabled) {
        return await this.searchPinecone(companyId, searchQuery, entries, topK);
      } else {
        return await this.searchMemory(companyId, searchQuery, entries, topK);
      }
    } catch (error) {
      console.warn(`   ⚠️  Search error: ${error}`);
      return [];
    }
  }

  /**
   * Search Pinecone namespace
   */
  private async searchPinecone(
    companyId: string,
    query: string,
    entries: CompanyHistoryEntry[],
    topK: number
  ): Promise<CompanyHistoryMatch[]> {
    const pinecone = getPinecone()!;
    const index = pinecone.index(this.indexName);
    const namespace = getCompanyNamespace(companyId);

    // Generate query embedding
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Query Pinecone
    const results = await index.namespace(namespace).query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true
    });

    return results.matches?.map(match => {
      const entryId = match.metadata?.id as string;
      const entry = entries.find(e => e.id === entryId);

      return {
        entry: entry!,
        similarity: match.score || 0,
        matched_fields: ['name'] // Simplified
      };
    }).filter(m => m.entry !== undefined) || [];
  }

  /**
   * Search memory store (fallback)
   */
  private async searchMemory(
    companyId: string,
    query: string,
    entries: CompanyHistoryEntry[],
    topK: number
  ): Promise<CompanyHistoryMatch[]> {
    const vectorStore = this.memoryStores.get(companyId);
    if (!vectorStore) {
      return [];
    }

    const results = await vectorStore.similaritySearchWithScore(query, topK);

    return results.map(([doc, distance]) => {
      const entry = entries.find(e => e.id === doc.metadata.id);
      return {
        entry: entry!,
        similarity: 1 - distance,
        matched_fields: ['name']
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

    if (matches.length === 0 || matches[0].similarity < 0.75) {
      return {
        source: 'company_history',
        confidence: 0,
        fields_enriched: [],
        reasoning: ['No matching items in company history'],
        enrichedFields: {}
      };
    }

    const bestMatch = matches[0];
    const enrichedFields: Record<string, unknown> = {};
    const fieldsEnriched: string[] = [];

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
      source: 'company_history',
      confidence: bestMatch.similarity,
      matched_entry_id: bestMatch.entry.id,
      fields_enriched: fieldsEnriched,
      reasoning: [
        `Matched with previous extraction: "${bestMatch.entry.item_name}"`,
        `Validated by user on ${new Date(bestMatch.entry.validation_timestamp || bestMatch.entry.created_at).toLocaleDateString()}`,
        `Similarity: ${(bestMatch.similarity * 100).toFixed(1)}%`,
        this.pineconeEnabled ? '(Pinecone persistent store)' : '(In-memory store)'
      ],
      enrichedFields
    };
  }

  /**
   * Save validated item to history AND upsert to Pinecone
   */
  async saveValidatedItem(
    companyId: string,
    tenantId: string,
    item: ValidatedItem
  ): Promise<boolean> {
    try {
      // Generate ID for the new entry
      const entryId = crypto.randomUUID();

      const entry: Partial<CompanyHistoryEntry> = {
        id: entryId,
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

      // Save to Supabase
      const { error } = await supabase
        .from('extraction_history')
        .insert(entry);

      if (error) {
        console.error('Failed to save validated item:', error);
        return false;
      }

      // Upsert to Pinecone immediately
      if (this.pineconeEnabled) {
        await this.upsertToPinecone(companyId, entry as CompanyHistoryEntry);
      }

      // Update local cache
      const entries = this.companyEntries.get(companyId) || [];
      entries.unshift(entry as CompanyHistoryEntry);
      this.companyEntries.set(companyId, entries);

      console.log(`   ✅ Saved validated item "${item.item_name}" to history${this.pineconeEnabled ? ' + Pinecone' : ''}`);
      return true;

    } catch (error) {
      console.error('Save validated item error:', error);
      return false;
    }
  }

  /**
   * Upsert single item to Pinecone
   */
  private async upsertToPinecone(companyId: string, entry: CompanyHistoryEntry): Promise<void> {
    try {
      const pinecone = getPinecone()!;
      const index = pinecone.index(this.indexName);
      const namespace = getCompanyNamespace(companyId);

      // Generate embedding
      const text = this.entryToSearchText(entry);
      const embedding = await this.embeddings.embedQuery(text);

      // Upsert vector
      await index.namespace(namespace).upsert([{
        id: entry.id,
        values: embedding,
        metadata: {
          id: entry.id,
          type: entry.item_type,
          vendor: entry.item_vendor || '',
          category: entry.item_category || '',
          name: entry.item_name
        }
      }]);

    } catch (error) {
      console.error(`   ❌ Pinecone upsert error: ${error}`);
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
   * Delete company history from Pinecone
   */
  async deleteCompanyHistory(companyId: string): Promise<void> {
    if (!this.pineconeEnabled) return;

    try {
      const pinecone = getPinecone()!;
      const index = pinecone.index(this.indexName);
      const namespace = getCompanyNamespace(companyId);

      await index.namespace(namespace).deleteAll();
      console.log(`   🗑️  Deleted Pinecone namespace for company ${companyId}`);

    } catch (error) {
      console.error(`   ❌ Pinecone delete error: ${error}`);
    }

    // Clear local cache
    this.companyEntries.delete(companyId);
    this.memoryStores.delete(companyId);
  }

  /**
   * Get company statistics including Pinecone vector count
   */
  async getCompanyStats(companyId: string): Promise<{
    total_entries: number;
    validated_entries: number;
    products: number;
    services: number;
    top_categories: string[];
    pinecone_vectors: number;
    storage_type: 'pinecone' | 'memory';
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
          top_categories: [],
          pinecone_vectors: 0,
          storage_type: this.pineconeEnabled ? 'pinecone' : 'memory'
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

      // Get Pinecone vector count
      let pineconeVectors = 0;
      if (this.pineconeEnabled) {
        try {
          const pinecone = getPinecone()!;
          const index = pinecone.index(this.indexName);
          const stats = await index.describeIndexStats();
          const namespace = getCompanyNamespace(companyId);
          pineconeVectors = stats.namespaces?.[namespace]?.recordCount || 0;
        } catch {
          // Ignore stats errors
        }
      }

      return {
        total_entries: entries.length,
        validated_entries: validated,
        products,
        services,
        top_categories: topCategories,
        pinecone_vectors: pineconeVectors,
        storage_type: this.pineconeEnabled ? 'pinecone' : 'memory'
      };

    } catch (error) {
      console.error('Get company stats error:', error);
      return {
        total_entries: 0,
        validated_entries: 0,
        products: 0,
        services: 0,
        top_categories: [],
        pinecone_vectors: 0,
        storage_type: this.pineconeEnabled ? 'pinecone' : 'memory'
      };
    }
  }

  /**
   * Check if Pinecone is enabled
   */
  isPineconeEnabled(): boolean {
    return this.pineconeEnabled;
  }

  /**
   * Clear local cache (Pinecone vectors persist)
   */
  clearCache(companyId?: string): void {
    if (companyId) {
      this.companyEntries.delete(companyId);
      this.memoryStores.delete(companyId);
    } else {
      this.companyEntries.clear();
      this.memoryStores.clear();
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
}

// Singleton instance
let instance: PineconeCompanyHistorySource | null = null;

export function getPineconeCompanyHistorySource(): PineconeCompanyHistorySource {
  if (!instance) {
    instance = new PineconeCompanyHistorySource();
  }
  return instance;
}

export default PineconeCompanyHistorySource;
