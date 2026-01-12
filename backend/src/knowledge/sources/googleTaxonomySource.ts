/**
 * Google Product Taxonomy Source
 *
 * Provides product classification using Google's Product Taxonomy.
 * Google Taxonomy has 6000+ categories used for Google Shopping feeds.
 *
 * Features:
 * - Hierarchical category structure (e.g., "Electronics > Computers > Laptops")
 * - Numeric category IDs for stable references
 * - Multi-language support
 * - Universal e-commerce standard
 *
 * Data source: https://support.google.com/merchants/answer/6324436
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  EnrichmentResult,
  EnrichmentContext,
  SectorCode,
  KnowledgeSourceType,
} from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

// Google Taxonomy category structure
export interface GoogleCategory {
  id: number;
  name: string;
  fullPath: string;
  level: number;
  parentId?: number;
}

interface GoogleTaxonomyFile {
  version: string;
  language: string;
  lastUpdated: string;
  categories: GoogleCategory[];
}

// Keywords for category matching
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Electronics': ['electronic', 'computer', 'laptop', 'phone', 'tablet', 'camera', 'audio', 'video', 'tv', 'monitor', 'printer', 'scanner', 'router', 'modem', 'network'],
  'Software': ['software', 'application', 'app', 'program', 'license', 'subscription', 'saas', 'cloud', 'platform'],
  'Business & Industrial': ['industrial', 'manufacturing', 'machinery', 'equipment', 'b2b', 'enterprise', 'commercial'],
  'Office Supplies': ['office', 'stationery', 'paper', 'desk', 'supplies', 'furniture'],
  'Vehicles & Parts': ['vehicle', 'car', 'auto', 'automotive', 'truck', 'motorcycle', 'parts', 'accessories'],
  'Health & Beauty': ['health', 'beauty', 'cosmetic', 'skincare', 'haircare', 'wellness', 'medical', 'pharmaceutical'],
  'Food & Beverages': ['food', 'beverage', 'drink', 'grocery', 'snack', 'organic', 'natural'],
  'Home & Garden': ['home', 'garden', 'furniture', 'decor', 'appliance', 'kitchen', 'bathroom'],
  'Apparel & Accessories': ['clothing', 'apparel', 'fashion', 'shoes', 'accessories', 'jewelry', 'watch'],
  'Toys & Games': ['toy', 'game', 'puzzle', 'hobby', 'collectible'],
  'Sports & Outdoors': ['sport', 'fitness', 'outdoor', 'camping', 'hiking', 'exercise'],
  'Baby & Toddler': ['baby', 'toddler', 'infant', 'nursery', 'diaper'],
  'Pet Supplies': ['pet', 'dog', 'cat', 'animal', 'veterinary'],
  'Arts & Entertainment': ['art', 'entertainment', 'music', 'movie', 'book', 'media'],
};

export class GoogleTaxonomySource implements EnrichmentSource {
  name: KnowledgeSourceType = 'google_taxonomy';
  supportedSectors: SectorCode[] = [
    'it_software',
    'consumer_goods',
    'food_beverage',
    'healthcare_pharma',
    'industrial',
    'automotive',
    'unknown', // Universal fallback
  ];
  priority = 4;
  confidenceWeight = 0.8;
  cacheTTLSeconds = 86400; // 24 hours

  private taxonomy: Map<number, GoogleCategory> = new Map();
  private categoryIndex: Map<string, GoogleCategory[]> = new Map();
  private initialized = false;

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🏷️  Initializing Google Taxonomy Source...');

    const dataDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const taxonomyPath = path.join(dataDir, 'google_taxonomy.json');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create default taxonomy if not exists
    if (!fs.existsSync(taxonomyPath)) {
      console.log('   📝 Creating default Google taxonomy...');
      await this.createDefaultTaxonomy(taxonomyPath);
    }

    try {
      const data: GoogleTaxonomyFile = JSON.parse(fs.readFileSync(taxonomyPath, 'utf-8'));

      for (const category of data.categories) {
        this.taxonomy.set(category.id, category);

        // Build keyword index
        const keywords = category.fullPath.toLowerCase().split(' > ');
        for (const keyword of keywords) {
          const existing = this.categoryIndex.get(keyword) || [];
          existing.push(category);
          this.categoryIndex.set(keyword, existing);
        }
      }

      console.log(`   ✅ Loaded ${this.taxonomy.size} Google taxonomy categories`);
      this.initialized = true;
    } catch (error) {
      console.warn('   ⚠️  Failed to load Google taxonomy:', error);
    }
  }

  async enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];
    const enrichedFields: Record<string, unknown> = {};

    // Build search text from item
    const searchText = [
      item.name,
      item.description,
      item.category,
      item.vendor,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Find best matching category
    const match = this.findBestCategory(searchText);

    if (match) {
      enrichedFields.google_category_id = match.category.id;
      enrichedFields.google_category_path = match.category.fullPath;
      enrichedFields.google_category_name = match.category.name;
      fieldsEnriched.push('google_category_id', 'google_category_path', 'google_category_name');
      reasoning.push(`Matched Google category: ${match.category.fullPath} (score: ${match.score.toFixed(2)})`);

      // Extract top-level category for general classification
      const topLevel = match.category.fullPath.split(' > ')[0];
      if (topLevel && !item.category) {
        enrichedFields.category = topLevel;
        fieldsEnriched.push('category');
        reasoning.push(`Inferred category from Google taxonomy: ${topLevel}`);
      }
    }

    return {
      source: this.name,
      confidence: match ? Math.min(match.score, 0.9) : 0.3,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields,
    };
  }

  private findBestCategory(searchText: string): { category: GoogleCategory; score: number } | null {
    let bestMatch: { category: GoogleCategory; score: number } | null = null;

    // Search by keywords
    const words = searchText.split(/\s+/).filter(w => w.length > 2);

    for (const word of words) {
      const matches = this.categoryIndex.get(word);
      if (matches) {
        for (const category of matches) {
          const score = this.calculateMatchScore(searchText, category);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { category, score };
          }
        }
      }
    }

    // Also check predefined keyword mappings
    for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
      if (matchCount > 0) {
        const score = matchCount / keywords.length;
        // Find a category matching this name
        for (const [, category] of this.taxonomy) {
          if (category.fullPath.startsWith(categoryName)) {
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { category, score };
            }
            break;
          }
        }
      }
    }

    return bestMatch && bestMatch.score >= 0.3 ? bestMatch : null;
  }

  private calculateMatchScore(searchText: string, category: GoogleCategory): number {
    const categoryWords = category.fullPath.toLowerCase().split(/[\s>]+/);
    const searchWords = searchText.split(/\s+/);

    let matches = 0;
    for (const catWord of categoryWords) {
      if (searchWords.some(sw => sw.includes(catWord) || catWord.includes(sw))) {
        matches++;
      }
    }

    // Prefer more specific (deeper) categories
    const depthBonus = category.level * 0.05;

    return (matches / categoryWords.length) + depthBonus;
  }

  private async createDefaultTaxonomy(filePath: string): Promise<void> {
    // Create a default taxonomy with common IT/Software categories
    const defaultTaxonomy: GoogleTaxonomyFile = {
      version: '1.0',
      language: 'en-US',
      lastUpdated: new Date().toISOString(),
      categories: [
        // Electronics
        { id: 222, name: 'Electronics', fullPath: 'Electronics', level: 1 },
        { id: 298, name: 'Computers', fullPath: 'Electronics > Computers', level: 2, parentId: 222 },
        { id: 328, name: 'Laptops', fullPath: 'Electronics > Computers > Laptops', level: 3, parentId: 298 },
        { id: 325, name: 'Desktop Computers', fullPath: 'Electronics > Computers > Desktop Computers', level: 3, parentId: 298 },
        { id: 331, name: 'Tablets', fullPath: 'Electronics > Computers > Tablets', level: 3, parentId: 298 },
        { id: 342, name: 'Computer Components', fullPath: 'Electronics > Computers > Computer Components', level: 3, parentId: 298 },

        // Software
        { id: 313, name: 'Software', fullPath: 'Software', level: 1 },
        { id: 5032, name: 'Business Software', fullPath: 'Software > Business Software', level: 2, parentId: 313 },
        { id: 5033, name: 'Operating Systems', fullPath: 'Software > Operating Systems', level: 2, parentId: 313 },
        { id: 5034, name: 'Security Software', fullPath: 'Software > Security Software', level: 2, parentId: 313 },
        { id: 5299, name: 'Productivity Software', fullPath: 'Software > Business Software > Productivity Software', level: 3, parentId: 5032 },
        { id: 5300, name: 'CRM Software', fullPath: 'Software > Business Software > CRM Software', level: 3, parentId: 5032 },
        { id: 5301, name: 'ERP Software', fullPath: 'Software > Business Software > ERP Software', level: 3, parentId: 5032 },
        { id: 5302, name: 'Database Software', fullPath: 'Software > Business Software > Database Software', level: 3, parentId: 5032 },

        // Business & Industrial
        { id: 111, name: 'Business & Industrial', fullPath: 'Business & Industrial', level: 1 },
        { id: 1556, name: 'Industrial Equipment', fullPath: 'Business & Industrial > Industrial Equipment', level: 2, parentId: 111 },
        { id: 2047, name: 'Office Supplies', fullPath: 'Business & Industrial > Office Supplies', level: 2, parentId: 111 },
        { id: 2092, name: 'Professional Services', fullPath: 'Business & Industrial > Professional Services', level: 2, parentId: 111 },

        // Vehicles
        { id: 5613, name: 'Vehicles & Parts', fullPath: 'Vehicles & Parts', level: 1 },
        { id: 916, name: 'Motor Vehicles', fullPath: 'Vehicles & Parts > Motor Vehicles', level: 2, parentId: 5613 },
        { id: 913, name: 'Vehicle Parts & Accessories', fullPath: 'Vehicles & Parts > Vehicle Parts & Accessories', level: 2, parentId: 5613 },

        // Health
        { id: 469, name: 'Health & Beauty', fullPath: 'Health & Beauty', level: 1 },
        { id: 491, name: 'Medical Supplies', fullPath: 'Health & Beauty > Medical Supplies', level: 2, parentId: 469 },
        { id: 2958, name: 'Pharmaceuticals', fullPath: 'Health & Beauty > Pharmaceuticals', level: 2, parentId: 469 },

        // Food
        { id: 422, name: 'Food, Beverages & Tobacco', fullPath: 'Food, Beverages & Tobacco', level: 1 },
        { id: 5740, name: 'Food Items', fullPath: 'Food, Beverages & Tobacco > Food Items', level: 2, parentId: 422 },
        { id: 413, name: 'Beverages', fullPath: 'Food, Beverages & Tobacco > Beverages', level: 2, parentId: 422 },

        // Home
        { id: 536, name: 'Home & Garden', fullPath: 'Home & Garden', level: 1 },
        { id: 574, name: 'Furniture', fullPath: 'Home & Garden > Furniture', level: 2, parentId: 536 },
        { id: 623, name: 'Kitchen & Dining', fullPath: 'Home & Garden > Kitchen & Dining', level: 2, parentId: 536 },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(defaultTaxonomy, null, 2));
    console.log(`   ✅ Created default Google taxonomy with ${defaultTaxonomy.categories.length} categories`);
  }

  // Get category by ID
  getCategory(id: number): GoogleCategory | undefined {
    return this.taxonomy.get(id);
  }

  // Search categories by text
  searchCategories(query: string, limit = 10): GoogleCategory[] {
    const results: { category: GoogleCategory; score: number }[] = [];
    const queryLower = query.toLowerCase();

    for (const [, category] of this.taxonomy) {
      if (category.fullPath.toLowerCase().includes(queryLower)) {
        const score = this.calculateMatchScore(queryLower, category);
        results.push({ category, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.category);
  }

  getStats(): { totalCategories: number; maxDepth: number } {
    let maxDepth = 0;
    for (const [, cat] of this.taxonomy) {
      if (cat.level > maxDepth) maxDepth = cat.level;
    }
    return {
      totalCategories: this.taxonomy.size,
      maxDepth,
    };
  }
}

// Singleton
let instance: GoogleTaxonomySource | null = null;

export function getGoogleTaxonomySource(): GoogleTaxonomySource {
  if (!instance) {
    instance = new GoogleTaxonomySource();
  }
  return instance;
}

export default GoogleTaxonomySource;
