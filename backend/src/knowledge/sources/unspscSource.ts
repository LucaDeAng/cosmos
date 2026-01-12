/**
 * UNSPSC Taxonomy Source
 *
 * Provides product/service classification using UNSPSC (United Nations Standard
 * Products and Services Code). UNSPSC is a global standard with 85,000+ categories
 * organized in a 4-level hierarchy:
 *
 * Segment (2-digit) → Family (4-digit) → Class (6-digit) → Commodity (8-digit)
 *
 * This source is optimized for industrial and B2B products/services.
 * It provides local matching without requiring external API calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SectorCode, EnrichmentResult, EnrichmentContext } from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

export interface UNSPSCEntry {
  segment: { code: string; name: string };
  family: { code: string; name: string };
  class: { code: string; name: string };
  commodity: { code: string; name: string };
  keywords: string[];
}

export interface UNSPSCTaxonomyFile {
  version: string;
  source: string;
  description?: string;
  last_updated: string;
  hierarchy?: {
    levels: string[];
    code_lengths: number[];
  };
  entries: UNSPSCEntry[];
}

export interface UNSPSCCategory {
  segment_code: string;
  segment_name: string;
  family_code: string;
  family_name: string;
  class_code: string;
  class_name: string;
  commodity_code: string;
  commodity_name: string;
  full_path: string;
}

export class UNSPSCSource implements EnrichmentSource {
  name = 'unspsc' as const;
  supportedSectors: SectorCode[] = ['industrial', 'it_software', 'healthcare_pharma', 'professional_services'];
  priority = 3; // Lower priority than sector-specific sources
  confidenceWeight = 0.85;
  cacheTTLSeconds = 0; // Local source, no caching needed

  private taxonomy: Map<string, UNSPSCEntry> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map(); // keyword → commodity codes
  private initialized = false;

  /**
   * Check if source is enabled (always true, local source)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Initialize the source by loading taxonomy
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🏷️  Initializing UNSPSC Taxonomy Source...');

    const taxonomyPath = path.join(__dirname, '../../data/taxonomies/unspsc_taxonomy.json');

    if (!fs.existsSync(taxonomyPath)) {
      console.warn('   ⚠️  UNSPSC taxonomy file not found:', taxonomyPath);
      this.initialized = true;
      return;
    }

    try {
      const taxonomyData: UNSPSCTaxonomyFile = JSON.parse(
        fs.readFileSync(taxonomyPath, 'utf-8')
      );

      for (const entry of taxonomyData.entries || []) {
        const id = entry.commodity.code;
        this.taxonomy.set(id, entry);

        // Build keyword index
        for (const keyword of entry.keywords) {
          const lowerKeyword = keyword.toLowerCase();
          if (!this.keywordIndex.has(lowerKeyword)) {
            this.keywordIndex.set(lowerKeyword, new Set());
          }
          this.keywordIndex.get(lowerKeyword)!.add(id);
        }

        // Also index the names
        const nameParts = [
          entry.commodity.name,
          entry.class.name,
          entry.family.name,
          entry.segment.name
        ].join(' ').toLowerCase().split(/\s+/);

        for (const part of nameParts) {
          if (part.length >= 3) {
            if (!this.keywordIndex.has(part)) {
              this.keywordIndex.set(part, new Set());
            }
            this.keywordIndex.get(part)!.add(id);
          }
        }
      }

      console.log(`   ✅ Loaded ${this.taxonomy.size} UNSPSC categories`);
      console.log(`   ✅ Indexed ${this.keywordIndex.size} keywords`);
    } catch (error) {
      console.error('   ❌ Failed to load UNSPSC taxonomy:', error);
    }

    this.initialized = true;
  }

  /**
   * Enrich an item with UNSPSC classification
   */
  async enrich(item: ExtractedItem, _context: EnrichmentContext): Promise<EnrichmentResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.taxonomy.size === 0) {
      return this.emptyResult('UNSPSC taxonomy not loaded');
    }

    // Build search text
    const searchText = [
      item.name,
      item.description,
      item.category,
      item.vendor
    ].filter(Boolean).join(' ').toLowerCase();

    // Find matching categories using keyword scoring
    const scores = new Map<string, number>();

    // Split into tokens
    const tokens = searchText.split(/[\s,.\-_/]+/).filter(t => t.length >= 3);

    // Score each token against keyword index
    for (const token of tokens) {
      // Exact match
      if (this.keywordIndex.has(token)) {
        for (const id of this.keywordIndex.get(token)!) {
          scores.set(id, (scores.get(id) || 0) + 2);
        }
      }

      // Partial match (starts with)
      for (const [keyword, ids] of this.keywordIndex.entries()) {
        if (keyword.startsWith(token) || token.startsWith(keyword)) {
          for (const id of ids) {
            scores.set(id, (scores.get(id) || 0) + 1);
          }
        }
      }
    }

    if (scores.size === 0) {
      return this.emptyResult('No matching UNSPSC category found');
    }

    // Find best match
    let bestId = '';
    let bestScore = 0;
    for (const [id, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    const entry = this.taxonomy.get(bestId);
    if (!entry) {
      return this.emptyResult('No matching UNSPSC category found');
    }

    // Calculate confidence based on score
    const maxPossibleScore = tokens.length * 2;
    const confidence = Math.min(0.5 + (bestScore / maxPossibleScore) * 0.4, 0.9);

    if (confidence < 0.5) {
      return this.emptyResult('Match confidence too low');
    }

    return this.mapToEnrichmentResult(entry, confidence);
  }

  /**
   * Classify an item into UNSPSC category
   */
  async classify(
    name: string,
    description?: string,
    category?: string,
    minConfidence = 0.5
  ): Promise<UNSPSCCategory | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.enrich(
      { name, description, category, type: 'product' },
      { tenantId: '', skipCache: false }
    );

    if (result.confidence < minConfidence || !result.enrichedFields?.unspsc_category) {
      return null;
    }

    return result.enrichedFields.unspsc_category as UNSPSCCategory;
  }

  /**
   * Get multiple classification suggestions
   */
  async getSuggestions(
    name: string,
    description?: string,
    topK = 3
  ): Promise<Array<{ category: UNSPSCCategory; confidence: number }>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const searchText = [name, description].filter(Boolean).join(' ').toLowerCase();
    const tokens = searchText.split(/[\s,.\-_/]+/).filter(t => t.length >= 3);

    const scores = new Map<string, number>();

    for (const token of tokens) {
      if (this.keywordIndex.has(token)) {
        for (const id of this.keywordIndex.get(token)!) {
          scores.set(id, (scores.get(id) || 0) + 2);
        }
      }
      for (const [keyword, ids] of this.keywordIndex.entries()) {
        if (keyword.startsWith(token) || token.startsWith(keyword)) {
          for (const id of ids) {
            scores.set(id, (scores.get(id) || 0) + 1);
          }
        }
      }
    }

    // Sort by score and take top K
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);

    const maxPossibleScore = tokens.length * 2;

    return sorted
      .map(([id, score]) => {
        const entry = this.taxonomy.get(id);
        if (!entry) return null;

        const confidence = Math.min(0.5 + (score / maxPossibleScore) * 0.4, 0.9);
        const fullPath = `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.commodity.name}`;

        return {
          category: {
            segment_code: entry.segment.code,
            segment_name: entry.segment.name,
            family_code: entry.family.code,
            family_name: entry.family.name,
            class_code: entry.class.code,
            class_name: entry.class.name,
            commodity_code: entry.commodity.code,
            commodity_name: entry.commodity.name,
            full_path: fullPath
          },
          confidence
        };
      })
      .filter((r): r is { category: UNSPSCCategory; confidence: number } => r !== null);
  }

  /**
   * Get category by commodity code
   */
  getByCommodityCode(commodityCode: string): UNSPSCCategory | null {
    const entry = this.taxonomy.get(commodityCode);
    if (!entry) return null;

    const fullPath = `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.commodity.name}`;

    return {
      segment_code: entry.segment.code,
      segment_name: entry.segment.name,
      family_code: entry.family.code,
      family_name: entry.family.name,
      class_code: entry.class.code,
      class_name: entry.class.name,
      commodity_code: entry.commodity.code,
      commodity_name: entry.commodity.name,
      full_path: fullPath
    };
  }

  /**
   * Get taxonomy statistics
   */
  getStats(): {
    totalCategories: number;
    segments: number;
    families: number;
    classes: number;
    commodities: number;
    keywords: number;
  } {
    const segments = new Set<string>();
    const families = new Set<string>();
    const classes = new Set<string>();

    for (const entry of this.taxonomy.values()) {
      segments.add(entry.segment.code);
      families.add(entry.family.code);
      classes.add(entry.class.code);
    }

    return {
      totalCategories: this.taxonomy.size,
      segments: segments.size,
      families: families.size,
      classes: classes.size,
      commodities: this.taxonomy.size,
      keywords: this.keywordIndex.size
    };
  }

  /**
   * Map UNSPSC entry to EnrichmentResult
   */
  private mapToEnrichmentResult(entry: UNSPSCEntry, confidence: number): EnrichmentResult {
    const fullPath = `${entry.segment.name} > ${entry.family.name} > ${entry.class.name} > ${entry.commodity.name}`;

    const unspscCategory: UNSPSCCategory = {
      segment_code: entry.segment.code,
      segment_name: entry.segment.name,
      family_code: entry.family.code,
      family_name: entry.family.name,
      class_code: entry.class.code,
      class_name: entry.class.name,
      commodity_code: entry.commodity.code,
      commodity_name: entry.commodity.name,
      full_path: fullPath
    };

    return {
      source: this.name,
      confidence,
      matched_entry_id: entry.commodity.code,
      fields_enriched: ['unspsc_classification', 'unspsc_category'],
      enrichedFields: {
        unspsc_code: entry.commodity.code,
        unspsc_category: unspscCategory,
        unspsc_classification: fullPath
      },
      reasoning: [
        `UNSPSC Classification: ${fullPath}`,
        `Segment: ${entry.segment.name} (${entry.segment.code})`,
        `Family: ${entry.family.name} (${entry.family.code})`,
        `Class: ${entry.class.name} (${entry.class.code})`,
        `Commodity: ${entry.commodity.name} (${entry.commodity.code})`
      ]
    };
  }

  /**
   * Return empty result
   */
  private emptyResult(reason: string): EnrichmentResult {
    return {
      source: this.name,
      confidence: 0,
      fields_enriched: [],
      reasoning: [reason]
    };
  }
}

// Singleton instance
let sourceInstance: UNSPSCSource | null = null;

export function getUNSPSCSource(): UNSPSCSource {
  if (!sourceInstance) {
    sourceInstance = new UNSPSCSource();
  }
  return sourceInstance;
}

export default UNSPSCSource;
