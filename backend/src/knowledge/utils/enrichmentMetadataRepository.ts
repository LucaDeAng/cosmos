/**
 * Enrichment Metadata Repository
 *
 * Handles persistence of enrichment metadata to the database.
 * Stores sector detection results and enrichment provenance for each item.
 */

import { supabase } from '../../config/supabase';
import type {
  SectorCode,
  KnowledgeSourceType,
  EnrichmentProvenance,
  FieldEnrichmentSource
} from '../types';

export interface EnrichmentMetadataRecord {
  id?: string;
  tenant_id: string;
  item_id: string;
  item_type: 'product' | 'service';
  detected_sector: SectorCode;
  sector_confidence: number;
  sector_method: 'keyword' | 'semantic' | 'hybrid';
  field_sources: Record<string, FieldEnrichmentSource>;
  enrichment_session_id: string;
  sources_queried: KnowledgeSourceType[];
  sources_matched: KnowledgeSourceType[];
  total_processing_time_ms: number;
  created_at?: string;
  updated_at?: string;
}

export class EnrichmentMetadataRepository {
  /**
   * Save enrichment metadata for an item
   */
  async save(metadata: EnrichmentMetadataRecord): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('enrichment_metadata')
        .insert({
          tenant_id: metadata.tenant_id,
          item_id: metadata.item_id,
          item_type: metadata.item_type,
          detected_sector: metadata.detected_sector,
          sector_confidence: metadata.sector_confidence,
          sector_method: metadata.sector_method,
          field_sources: metadata.field_sources,
          enrichment_session_id: metadata.enrichment_session_id,
          sources_queried: metadata.sources_queried,
          sources_matched: metadata.sources_matched,
          total_processing_time_ms: metadata.total_processing_time_ms
        })
        .select('id')
        .single();

      if (error) {
        console.error('Failed to save enrichment metadata:', error.message);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Error saving enrichment metadata:', error);
      return null;
    }
  }

  /**
   * Update enrichment metadata for an item
   */
  async update(id: string, updates: Partial<EnrichmentMetadataRecord>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('enrichment_metadata')
        .update({
          detected_sector: updates.detected_sector,
          sector_confidence: updates.sector_confidence,
          sector_method: updates.sector_method,
          field_sources: updates.field_sources,
          sources_queried: updates.sources_queried,
          sources_matched: updates.sources_matched,
          total_processing_time_ms: updates.total_processing_time_ms
        })
        .eq('id', id);

      if (error) {
        console.error('Failed to update enrichment metadata:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating enrichment metadata:', error);
      return false;
    }
  }

  /**
   * Get enrichment metadata for an item
   */
  async getByItemId(
    tenantId: string,
    itemId: string,
    itemType: 'product' | 'service'
  ): Promise<EnrichmentMetadataRecord | null> {
    try {
      const { data, error } = await supabase
        .from('enrichment_metadata')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('item_id', itemId)
        .eq('item_type', itemType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('Failed to get enrichment metadata:', error.message);
        return null;
      }

      return data as EnrichmentMetadataRecord;
    } catch (error) {
      console.error('Error getting enrichment metadata:', error);
      return null;
    }
  }

  /**
   * Get enrichment statistics for a tenant by sector
   */
  async getStatsBySector(tenantId: string): Promise<Array<{
    detected_sector: SectorCode;
    total_items: number;
    avg_sector_confidence: number;
    unique_sources_used: number;
    avg_processing_time_ms: number;
    last_enrichment_at: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('enrichment_sector_stats')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Failed to get sector stats:', error.message);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting sector stats:', error);
      return [];
    }
  }

  /**
   * Link enrichment metadata to a portfolio item
   */
  async linkToPortfolioItem(
    itemId: string,
    itemType: 'product' | 'service',
    enrichmentMetadataId: string,
    detectedSector: SectorCode,
    sectorConfidence: number
  ): Promise<boolean> {
    try {
      const tableName = itemType === 'product' ? 'portfolio_products' : 'portfolio_services';

      const { error } = await supabase
        .from(tableName)
        .update({
          detected_sector: detectedSector,
          sector_confidence: sectorConfidence,
          enrichment_metadata_id: enrichmentMetadataId
        })
        .eq('id', itemId);

      if (error) {
        console.error(`Failed to link enrichment metadata to ${tableName}:`, error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error linking enrichment metadata:', error);
      return false;
    }
  }

  /**
   * Create enrichment metadata from provenance object
   */
  static fromProvenance(
    tenantId: string,
    itemId: string,
    itemType: 'product' | 'service',
    provenance: EnrichmentProvenance
  ): EnrichmentMetadataRecord {
    return {
      tenant_id: tenantId,
      item_id: itemId,
      item_type: itemType,
      detected_sector: provenance.detectedSector,
      sector_confidence: provenance.sectorConfidence,
      sector_method: provenance.sectorMethod,
      field_sources: provenance.fieldSources,
      enrichment_session_id: provenance.sessionId,
      sources_queried: provenance.sourcesQueried,
      sources_matched: provenance.sourcesMatched,
      total_processing_time_ms: provenance.processingTimeMs
    };
  }
}

// Singleton instance
let repositoryInstance: EnrichmentMetadataRepository | null = null;

export function getEnrichmentMetadataRepository(): EnrichmentMetadataRepository {
  if (!repositoryInstance) {
    repositoryInstance = new EnrichmentMetadataRepository();
  }
  return repositoryInstance;
}

export default EnrichmentMetadataRepository;
