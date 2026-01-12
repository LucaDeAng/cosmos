/**
 * GLEIF Source - Global Legal Entity Identifier Foundation
 *
 * Provides legal entity information using the GLEIF LEI database.
 * LEI (Legal Entity Identifier) is a 20-character, alpha-numeric code
 * that uniquely identifies legal entities participating in financial transactions.
 *
 * Features:
 * - LEI lookup and validation
 * - Entity name and address information
 * - Legal form and jurisdiction
 * - Parent/child relationships
 * - Business category classification
 *
 * API: https://api.gleif.org/api/v1/lei-records
 * Rate limit: No authentication required, but be respectful
 */

import type {
  EnrichmentResult,
  EnrichmentContext,
  SectorCode,
  KnowledgeSourceType,
} from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

// GLEIF API response types
interface GLEIFEntity {
  legalName: { name: string; language: string };
  otherNames?: Array<{ name: string; type: string }>;
  legalAddress: {
    addressLines: string[];
    city: string;
    region?: string;
    country: string;
    postalCode?: string;
  };
  headquartersAddress?: {
    addressLines: string[];
    city: string;
    region?: string;
    country: string;
    postalCode?: string;
  };
  registeredAt?: { id: string; name: string };
  registeredAs?: string;
  jurisdiction?: string;
  category?: string;
  legalForm?: { id: string; name: string };
  status: string;
  creationDate?: string;
  lastUpdateDate?: string;
}

interface GLEIFRecord {
  lei: string;
  entity: GLEIFEntity;
  registration: {
    initialRegistrationDate: string;
    lastUpdateDate: string;
    status: string;
    nextRenewalDate?: string;
    managingLou: string;
  };
}

// Entity category mapping
const ENTITY_CATEGORIES: Record<string, string> = {
  'BRANCH': 'Branch Office',
  'FUND': 'Investment Fund',
  'GENERAL': 'General Legal Entity',
  'INTERNATIONAL_ORGANIZATION': 'International Organization',
  'RESIDENT_GOVERNMENT_ENTITY': 'Government Entity',
  'SOLE_PROPRIETOR': 'Sole Proprietor',
};

// Legal form patterns for Italian entities
const ITALIAN_LEGAL_FORMS: Record<string, string> = {
  'spa': 'Società per Azioni (S.p.A.)',
  's.p.a.': 'Società per Azioni (S.p.A.)',
  'srl': 'Società a Responsabilità Limitata (S.r.l.)',
  's.r.l.': 'Società a Responsabilità Limitata (S.r.l.)',
  'sas': 'Società in Accomandita Semplice (S.a.s.)',
  's.a.s.': 'Società in Accomandita Semplice (S.a.s.)',
  'snc': 'Società in Nome Collettivo (S.n.c.)',
  's.n.c.': 'Società in Nome Collettivo (S.n.c.)',
  'sapa': 'Società in Accomandita per Azioni (S.a.p.a.)',
  'scarl': 'Società Cooperativa a Responsabilità Limitata',
  'scrl': 'Società Cooperativa a Responsabilità Limitata',
};

// Financial services keywords
const FINANCIAL_KEYWORDS = [
  'bank', 'banca', 'banking', 'bancario',
  'insurance', 'assicurazione', 'assicurazioni',
  'investment', 'investimento', 'asset management',
  'fund', 'fondo', 'hedge', 'private equity',
  'broker', 'intermediario', 'finanziario',
  'capital', 'capitale', 'finance', 'finanza',
  'credit', 'credito', 'leasing', 'factoring',
  'payment', 'pagamento', 'fintech',
  'securities', 'titoli', 'borsa', 'exchange',
];

export class GLEIFSource implements EnrichmentSource {
  name: KnowledgeSourceType = 'gleif';
  supportedSectors: SectorCode[] = ['financial_services', 'professional_services'];
  priority = 2;
  confidenceWeight = 0.9;
  cacheTTLSeconds = 86400; // 24 hours

  private baseUrl = 'https://api.gleif.org/api/v1';
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    console.log('🏦 Initializing GLEIF Source...');
    console.log('   ✅ GLEIF LEI API ready');
  }

  async enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult> {
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

    // Check if this looks like a financial entity
    if (!this.isLikelyFinancialEntity(searchText)) {
      return {
        source: this.name,
        confidence: 0.1,
        fields_enriched: [],
        reasoning: ['Item does not appear to be a financial entity'],
        enrichedFields: {},
      };
    }

    // Try to extract LEI if present
    const lei = this.extractLEI(searchText);
    if (lei) {
      try {
        const leiData = await this.lookupLEI(lei);
        if (leiData) {
          enrichedFields.lei = lei;
          enrichedFields.legal_name = leiData.entity.legalName.name;
          enrichedFields.lei_status = leiData.registration.status;
          enrichedFields.jurisdiction = leiData.entity.jurisdiction;

          if (leiData.entity.legalAddress) {
            enrichedFields.registered_country = leiData.entity.legalAddress.country;
            enrichedFields.registered_city = leiData.entity.legalAddress.city;
          }

          if (leiData.entity.category) {
            enrichedFields.entity_category = ENTITY_CATEGORIES[leiData.entity.category] || leiData.entity.category;
          }

          if (leiData.entity.legalForm) {
            enrichedFields.legal_form = leiData.entity.legalForm.name;
          }

          fieldsEnriched.push('lei', 'legal_name', 'lei_status', 'jurisdiction');
          reasoning.push(`Found LEI: ${lei} -> ${leiData.entity.legalName.name}`);

          return {
            source: this.name,
            confidence: 0.95,
            fields_enriched: fieldsEnriched,
            reasoning,
            enrichedFields,
          };
        }
      } catch (error) {
        console.warn('   ⚠️  LEI lookup failed:', error);
      }
    }

    // Try to identify entity type from name
    const entityType = this.identifyEntityType(searchText);
    if (entityType) {
      enrichedFields.entity_type = entityType;
      fieldsEnriched.push('entity_type');
      reasoning.push(`Identified entity type: ${entityType}`);
    }

    // Try to identify Italian legal form
    const legalForm = this.identifyItalianLegalForm(searchText);
    if (legalForm) {
      enrichedFields.legal_form = legalForm;
      fieldsEnriched.push('legal_form');
      reasoning.push(`Identified Italian legal form: ${legalForm}`);
    }

    // Identify financial service category
    const serviceCategory = this.identifyFinancialCategory(searchText);
    if (serviceCategory) {
      enrichedFields.financial_category = serviceCategory;
      fieldsEnriched.push('financial_category');
      reasoning.push(`Identified financial category: ${serviceCategory}`);
    }

    // Try search by name if it looks like a company
    if (item.vendor || this.looksLikeCompanyName(item.name)) {
      try {
        const searchName = item.vendor || item.name;
        const searchResults = await this.searchByName(searchName);
        if (searchResults && searchResults.length > 0) {
          const bestMatch = searchResults[0];
          enrichedFields.lei = bestMatch.lei;
          enrichedFields.legal_name = bestMatch.entity.legalName.name;
          enrichedFields.lei_match_type = 'name_search';
          fieldsEnriched.push('lei', 'legal_name');
          reasoning.push(`Found via name search: ${bestMatch.entity.legalName.name} (LEI: ${bestMatch.lei})`);
        }
      } catch (error) {
        // Name search failed, continue without
      }
    }

    const confidence = fieldsEnriched.length > 0 ?
      Math.min(0.5 + (fieldsEnriched.length * 0.1), 0.85) : 0.2;

    return {
      source: this.name,
      confidence,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields,
    };
  }

  private isLikelyFinancialEntity(text: string): boolean {
    // Check for financial keywords
    if (FINANCIAL_KEYWORDS.some(kw => text.includes(kw))) {
      return true;
    }

    // Check for Italian legal form patterns
    for (const pattern of Object.keys(ITALIAN_LEGAL_FORMS)) {
      if (text.includes(pattern)) {
        return true;
      }
    }

    // Check for other company indicators
    const companyIndicators = ['ltd', 'limited', 'inc', 'corp', 'gmbh', 'ag', 'sa', 'nv', 'bv', 'plc'];
    return companyIndicators.some(ind => text.includes(ind));
  }

  private extractLEI(text: string): string | null {
    // LEI is 20 characters: 4 digits + 2 zeros + 12 alphanumeric + 2 digits
    const leiRegex = /\b[0-9]{4}00[A-Z0-9]{12}[0-9]{2}\b/gi;
    const match = text.match(leiRegex);
    return match ? match[0].toUpperCase() : null;
  }

  private async lookupLEI(lei: string): Promise<GLEIFRecord | null> {
    const cacheKey = `lei:${lei}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLSeconds * 1000) {
      return cached.data as GLEIFRecord;
    }

    try {
      const url = `${this.baseUrl}/lei-records/${lei}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as { data?: { attributes: GLEIFRecord } };
      const result = data.data?.attributes;

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result || null;
    } catch {
      return null;
    }
  }

  private async searchByName(name: string): Promise<GLEIFRecord[] | null> {
    const cacheKey = `name:${name.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLSeconds * 1000) {
      return cached.data as GLEIFRecord[];
    }

    try {
      const encodedName = encodeURIComponent(name);
      const url = `${this.baseUrl}/lei-records?filter[entity.legalName]=${encodedName}&page[size]=5`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as { data?: Array<{ attributes: GLEIFRecord }> };
      const results = data.data?.map((d) => d.attributes) || null;

      this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
      return results;
    } catch {
      return null;
    }
  }

  private identifyEntityType(text: string): string | null {
    const types: Record<string, string[]> = {
      'Bank': ['bank', 'banca', 'banking', 'bancario', 'credit institution'],
      'Insurance Company': ['insurance', 'assicurazione', 'assicurazioni', 'insurer'],
      'Investment Fund': ['fund', 'fondo', 'etf', 'sicav', 'sicaf', 'hedge'],
      'Asset Manager': ['asset management', 'gestione patrimoniale', 'sgr'],
      'Broker/Dealer': ['broker', 'dealer', 'intermediario', 'sim'],
      'Payment Institution': ['payment', 'pagamento', 'fintech', 'imel'],
      'Leasing Company': ['leasing', 'noleggio'],
      'Factoring Company': ['factoring', 'cessione crediti'],
    };

    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(kw => text.includes(kw))) {
        return type;
      }
    }
    return null;
  }

  private identifyItalianLegalForm(text: string): string | null {
    for (const [pattern, form] of Object.entries(ITALIAN_LEGAL_FORMS)) {
      if (text.includes(pattern)) {
        return form;
      }
    }
    return null;
  }

  private identifyFinancialCategory(text: string): string | null {
    const categories: Record<string, string[]> = {
      'Retail Banking': ['retail', 'consumer', 'personal', 'privati'],
      'Corporate Banking': ['corporate', 'business', 'commercial', 'imprese'],
      'Investment Banking': ['investment bank', 'merchant bank', 'm&a', 'capital markets'],
      'Private Banking': ['private bank', 'wealth', 'patrimoni'],
      'Life Insurance': ['life insurance', 'vita', 'previdenza'],
      'Non-Life Insurance': ['property', 'casualty', 'danni', 'auto', 'health'],
      'Reinsurance': ['reinsurance', 'riassicurazione'],
      'Asset Management': ['asset management', 'fund management', 'gestione'],
      'Securities Services': ['custody', 'settlement', 'clearing'],
      'Consumer Finance': ['consumer credit', 'credito al consumo', 'carte'],
      'Fintech': ['fintech', 'neobank', 'challenger bank', 'digital bank'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => text.includes(kw))) {
        return category;
      }
    }
    return null;
  }

  private looksLikeCompanyName(name: string): boolean {
    const text = name.toLowerCase();
    const companyIndicators = [
      'spa', 'srl', 'sas', 'snc', 's.p.a.', 's.r.l.',
      'ltd', 'limited', 'inc', 'corp', 'corporation',
      'gmbh', 'ag', 'sa', 'nv', 'bv', 'plc', 'llc',
      'group', 'holding', 'capital', 'partners',
    ];
    return companyIndicators.some(ind => text.includes(ind));
  }

  getStats(): { enabled: boolean; cachedItems: number } {
    return {
      enabled: true,
      cachedItems: this.cache.size,
    };
  }
}

// Singleton
let instance: GLEIFSource | null = null;

export function getGLEIFSource(): GLEIFSource {
  if (!instance) {
    instance = new GLEIFSource();
  }
  return instance;
}

export default GLEIFSource;
