/**
 * Schema.org Product Types Source
 *
 * Provides product classification using Schema.org vocabulary.
 * Schema.org is the standard for structured data on the web,
 * with 827+ types and 1500+ properties.
 *
 * Features:
 * - Hierarchical type system (Thing > Product > Vehicle > Car)
 * - Rich property definitions
 * - Universal web standard (Google, Bing, Yahoo, Yandex)
 * - SEO-friendly structured data generation
 *
 * Data source: https://schema.org/docs/developers.html
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

// Schema.org type structure
export interface SchemaType {
  id: string;
  label: string;
  comment: string;
  parentTypes: string[];
  properties: string[];
  subTypes: string[];
}

interface SchemaOrgFile {
  version: string;
  lastUpdated: string;
  types: SchemaType[];
}

// Product-related Schema.org types with keywords
const SCHEMA_TYPE_KEYWORDS: Record<string, string[]> = {
  'Product': ['product', 'item', 'goods', 'merchandise'],
  'SoftwareApplication': ['software', 'application', 'app', 'program', 'saas', 'platform'],
  'WebApplication': ['web app', 'webapp', 'online tool', 'web service', 'cloud'],
  'MobileApplication': ['mobile app', 'ios', 'android', 'smartphone'],
  'Vehicle': ['vehicle', 'car', 'truck', 'automobile', 'transport'],
  'Car': ['car', 'sedan', 'suv', 'hatchback', 'automobile'],
  'Motorcycle': ['motorcycle', 'bike', 'scooter'],
  'FoodProduct': ['food', 'edible', 'grocery', 'ingredient'],
  'Drug': ['drug', 'medicine', 'pharmaceutical', 'medication', 'pill'],
  'MedicalDevice': ['medical device', 'diagnostic', 'therapeutic', 'healthcare equipment'],
  'IndividualProduct': ['individual', 'single', 'unique', 'serial'],
  'ProductModel': ['model', 'variant', 'version', 'edition'],
  'Service': ['service', 'consulting', 'support', 'maintenance', 'managed'],
  'FinancialProduct': ['financial', 'banking', 'insurance', 'investment', 'loan'],
  'ComputerHardware': ['hardware', 'computer', 'server', 'workstation', 'device'],
  'ElectronicsProduct': ['electronic', 'gadget', 'device', 'consumer electronics'],
};

// Schema.org property suggestions by type
const TYPE_PROPERTIES: Record<string, string[]> = {
  'Product': ['name', 'description', 'brand', 'manufacturer', 'model', 'sku', 'gtin', 'category'],
  'SoftwareApplication': ['applicationCategory', 'operatingSystem', 'softwareVersion', 'downloadUrl', 'featureList'],
  'Vehicle': ['vehicleConfiguration', 'fuelType', 'numberOfDoors', 'vehicleEngine', 'mileageFromOdometer'],
  'FoodProduct': ['ingredients', 'nutrition', 'servingSize', 'allergens'],
  'Drug': ['activeIngredient', 'dosageForm', 'drugUnit', 'prescriptionStatus'],
  'Service': ['serviceType', 'provider', 'areaServed', 'serviceOutput'],
};

export class SchemaOrgSource implements EnrichmentSource {
  name: KnowledgeSourceType = 'schema_org';
  supportedSectors: SectorCode[] = [
    'it_software',
    'consumer_goods',
    'food_beverage',
    'healthcare_pharma',
    'industrial',
    'automotive',
    'financial_services',
    'professional_services',
    'unknown', // Universal - works for all
  ];
  priority = 5;
  confidenceWeight = 0.75;
  cacheTTLSeconds = 86400;

  private types: Map<string, SchemaType> = new Map();
  private typeIndex: Map<string, SchemaType[]> = new Map();
  private initialized = false;

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🏷️  Initializing Schema.org Source...');

    const dataDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const schemaPath = path.join(dataDir, 'schema_org_types.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(schemaPath)) {
      console.log('   📝 Creating default Schema.org types...');
      await this.createDefaultSchema(schemaPath);
    }

    try {
      const data: SchemaOrgFile = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

      for (const type of data.types) {
        this.types.set(type.id, type);

        // Build keyword index
        const words = type.label.toLowerCase().split(/(?=[A-Z])/).join(' ').split(/\s+/);
        for (const word of words) {
          if (word.length > 2) {
            const existing = this.typeIndex.get(word) || [];
            existing.push(type);
            this.typeIndex.set(word, existing);
          }
        }
      }

      console.log(`   ✅ Loaded ${this.types.size} Schema.org types`);
      this.initialized = true;
    } catch (error) {
      console.warn('   ⚠️  Failed to load Schema.org types:', error);
    }
  }

  async enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];
    const enrichedFields: Record<string, unknown> = {};

    // Build search text
    const searchText = [
      item.name,
      item.description,
      item.category,
      item.vendor,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Find best matching Schema.org type
    const match = this.findBestType(searchText, item.type);

    if (match) {
      enrichedFields.schema_type = match.type.id;
      enrichedFields.schema_type_label = match.type.label;
      enrichedFields.schema_parent_types = match.type.parentTypes;
      fieldsEnriched.push('schema_type', 'schema_type_label', 'schema_parent_types');
      reasoning.push(`Matched Schema.org type: ${match.type.id} (score: ${match.score.toFixed(2)})`);

      // Add suggested properties for this type
      const suggestedProps = TYPE_PROPERTIES[match.type.id] || TYPE_PROPERTIES['Product'];
      if (suggestedProps) {
        enrichedFields.schema_suggested_properties = suggestedProps;
        fieldsEnriched.push('schema_suggested_properties');
        reasoning.push(`Suggested properties: ${suggestedProps.join(', ')}`);
      }

      // Generate JSON-LD snippet for SEO
      enrichedFields.schema_jsonld = this.generateJsonLd(item, match.type);
      fieldsEnriched.push('schema_jsonld');
    }

    return {
      source: this.name,
      confidence: match ? Math.min(match.score, 0.85) : 0.3,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields,
    };
  }

  private findBestType(
    searchText: string,
    itemType: 'product' | 'service'
  ): { type: SchemaType; score: number } | null {
    let bestMatch: { type: SchemaType; score: number } | null = null;

    // First, check keyword mappings
    for (const [typeName, keywords] of Object.entries(SCHEMA_TYPE_KEYWORDS)) {
      const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
      if (matchCount > 0) {
        const score = matchCount / keywords.length;
        const type = this.types.get(typeName);
        if (type && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { type, score };
        }
      }
    }

    // Fall back to index search
    if (!bestMatch) {
      const words = searchText.split(/\s+/).filter(w => w.length > 2);
      for (const word of words) {
        const matches = this.typeIndex.get(word);
        if (matches) {
          for (const type of matches) {
            const score = this.calculateMatchScore(searchText, type);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { type, score };
            }
          }
        }
      }
    }

    // Default to Product or Service based on item type
    if (!bestMatch || bestMatch.score < 0.3) {
      const defaultType = itemType === 'service' ? 'Service' : 'Product';
      const type = this.types.get(defaultType);
      if (type) {
        bestMatch = { type, score: 0.4 };
      }
    }

    return bestMatch;
  }

  private calculateMatchScore(searchText: string, type: SchemaType): number {
    const typeWords = type.label
      .split(/(?=[A-Z])/)
      .join(' ')
      .toLowerCase()
      .split(/\s+/);
    const searchWords = searchText.split(/\s+/);

    let matches = 0;
    for (const typeWord of typeWords) {
      if (searchWords.some(sw => sw.includes(typeWord) || typeWord.includes(sw))) {
        matches++;
      }
    }

    // Bonus for more specific types (deeper in hierarchy)
    const specificityBonus = type.parentTypes.length * 0.05;

    return (matches / Math.max(typeWords.length, 1)) + specificityBonus;
  }

  private generateJsonLd(item: ExtractedItem, type: SchemaType): Record<string, unknown> {
    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': type.id,
      'name': item.name,
    };

    if (item.description) {
      jsonLd['description'] = item.description;
    }

    if (item.vendor) {
      jsonLd['brand'] = {
        '@type': 'Brand',
        'name': item.vendor,
      };
    }

    if (item.gtin) {
      jsonLd['gtin'] = item.gtin;
    }

    if (item.ean) {
      jsonLd['gtin13'] = item.ean;
    }

    if (item.category) {
      jsonLd['category'] = item.category;
    }

    return jsonLd;
  }

  // Get type by ID
  getType(id: string): SchemaType | undefined {
    return this.types.get(id);
  }

  // Get all subtypes of a type
  getSubTypes(typeId: string): SchemaType[] {
    const type = this.types.get(typeId);
    if (!type) return [];

    return type.subTypes
      .map(id => this.types.get(id))
      .filter((t): t is SchemaType => t !== undefined);
  }

  // Search types
  searchTypes(query: string, limit = 10): SchemaType[] {
    const results: { type: SchemaType; score: number }[] = [];
    const queryLower = query.toLowerCase();

    for (const [, type] of this.types) {
      if (
        type.id.toLowerCase().includes(queryLower) ||
        type.label.toLowerCase().includes(queryLower) ||
        type.comment.toLowerCase().includes(queryLower)
      ) {
        const score = this.calculateMatchScore(queryLower, type);
        results.push({ type, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.type);
  }

  private async createDefaultSchema(filePath: string): Promise<void> {
    const defaultSchema: SchemaOrgFile = {
      version: '26.0',
      lastUpdated: new Date().toISOString(),
      types: [
        // Thing hierarchy
        { id: 'Thing', label: 'Thing', comment: 'The most generic type', parentTypes: [], properties: ['name', 'description', 'url'], subTypes: ['Product', 'Service', 'Organization'] },

        // Product types
        { id: 'Product', label: 'Product', comment: 'Any offered product or service', parentTypes: ['Thing'], properties: ['brand', 'manufacturer', 'model', 'sku', 'gtin', 'category', 'color', 'material'], subTypes: ['IndividualProduct', 'ProductModel', 'SomeProducts', 'Vehicle'] },
        { id: 'IndividualProduct', label: 'Individual Product', comment: 'A single product identified by serial number', parentTypes: ['Product'], properties: ['serialNumber'], subTypes: [] },
        { id: 'ProductModel', label: 'Product Model', comment: 'A datasheet or vendor specification of a product', parentTypes: ['Product'], properties: ['isVariantOf', 'predecessorOf', 'successorOf'], subTypes: [] },

        // Software
        { id: 'SoftwareApplication', label: 'Software Application', comment: 'A software application', parentTypes: ['Thing'], properties: ['applicationCategory', 'applicationSubCategory', 'downloadUrl', 'featureList', 'operatingSystem', 'softwareVersion'], subTypes: ['MobileApplication', 'WebApplication', 'VideoGame'] },
        { id: 'WebApplication', label: 'Web Application', comment: 'Web application', parentTypes: ['SoftwareApplication'], properties: ['browserRequirements'], subTypes: [] },
        { id: 'MobileApplication', label: 'Mobile Application', comment: 'A mobile software application', parentTypes: ['SoftwareApplication'], properties: [], subTypes: [] },
        { id: 'VideoGame', label: 'Video Game', comment: 'A video game', parentTypes: ['SoftwareApplication'], properties: ['gamePlatform', 'gameServer'], subTypes: [] },

        // Vehicles
        { id: 'Vehicle', label: 'Vehicle', comment: 'A vehicle is a device designed for transportation', parentTypes: ['Product'], properties: ['vehicleConfiguration', 'vehicleEngine', 'vehicleModelDate', 'vehicleTransmission', 'fuelType', 'numberOfDoors'], subTypes: ['Car', 'Motorcycle', 'BusOrCoach', 'MotorizedBicycle'] },
        { id: 'Car', label: 'Car', comment: 'A car is a wheeled motor vehicle for transportation', parentTypes: ['Vehicle'], properties: ['acrissCode', 'bodyType', 'driveWheelConfiguration'], subTypes: [] },
        { id: 'Motorcycle', label: 'Motorcycle', comment: 'A motorcycle or motorbike', parentTypes: ['Vehicle'], properties: [], subTypes: [] },

        // Food & Health
        { id: 'FoodProduct', label: 'Food Product', comment: 'A food product', parentTypes: ['Product'], properties: ['ingredients', 'nutrition'], subTypes: [] },
        { id: 'Drug', label: 'Drug', comment: 'A chemical or biologic substance used for medical treatment', parentTypes: ['Product'], properties: ['activeIngredient', 'dosageForm', 'drugClass', 'prescriptionStatus'], subTypes: [] },
        { id: 'MedicalDevice', label: 'Medical Device', comment: 'A medical device', parentTypes: ['Product'], properties: ['adverseOutcome', 'contraindication'], subTypes: [] },
        { id: 'DietarySupplement', label: 'Dietary Supplement', comment: 'A product taken orally to supplement the diet', parentTypes: ['Product'], properties: ['activeIngredient', 'isProprietary'], subTypes: [] },

        // Electronics
        { id: 'ComputerHardware', label: 'Computer Hardware', comment: 'Computer hardware product', parentTypes: ['Product'], properties: [], subTypes: [] },
        { id: 'ElectronicsProduct', label: 'Electronics Product', comment: 'An electronics product', parentTypes: ['Product'], properties: [], subTypes: [] },

        // Services
        { id: 'Service', label: 'Service', comment: 'A service provided by an organization', parentTypes: ['Thing'], properties: ['serviceType', 'provider', 'areaServed', 'serviceOutput', 'termsOfService'], subTypes: ['FinancialProduct', 'BroadcastService', 'CableOrSatelliteService'] },
        { id: 'FinancialProduct', label: 'Financial Product', comment: 'A product provided to consumers and businesses by financial institutions', parentTypes: ['Service'], properties: ['annualPercentageRate', 'feesAndCommissionsSpecification', 'interestRate'], subTypes: ['BankAccount', 'CurrencyConversionService', 'InvestmentOrDeposit', 'LoanOrCredit', 'PaymentCard', 'PaymentService'] },

        // Organization
        { id: 'Organization', label: 'Organization', comment: 'An organization', parentTypes: ['Thing'], properties: ['address', 'brand', 'contactPoint', 'email', 'employee', 'founder', 'foundingDate'], subTypes: ['Corporation', 'LocalBusiness', 'NGO'] },
        { id: 'Brand', label: 'Brand', comment: 'A brand', parentTypes: ['Thing'], properties: ['logo', 'slogan'], subTypes: [] },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(defaultSchema, null, 2));
    console.log(`   ✅ Created default Schema.org types with ${defaultSchema.types.length} types`);
  }

  getStats(): { totalTypes: number; productTypes: number; serviceTypes: number } {
    let productTypes = 0;
    let serviceTypes = 0;

    for (const [, type] of this.types) {
      if (type.parentTypes.includes('Product') || type.id === 'Product') {
        productTypes++;
      }
      if (type.parentTypes.includes('Service') || type.id === 'Service') {
        serviceTypes++;
      }
    }

    return {
      totalTypes: this.types.size,
      productTypes,
      serviceTypes,
    };
  }
}

// Singleton
let instance: SchemaOrgSource | null = null;

export function getSchemaOrgSource(): SchemaOrgSource {
  if (!instance) {
    instance = new SchemaOrgSource();
  }
  return instance;
}

export default SchemaOrgSource;
