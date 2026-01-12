/**
 * CPV Source - Common Procurement Vocabulary
 *
 * Provides product/service classification using EU's CPV codes.
 * CPV (Common Procurement Vocabulary) is the EU standard for classifying
 * goods and services in public procurement.
 *
 * Features:
 * - 8-digit codes with check digit (e.g., 48000000-8 = Software packages)
 * - Hierarchical structure (Divisions > Groups > Classes > Categories)
 * - Essential for EU public tenders and B2G sales
 * - Covers both products and services
 *
 * Data source: EU Publications Office (https://simap.ted.europa.eu/cpv)
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

// CPV code structure
export interface CPVCode {
  code: string;           // 8-digit CPV code (e.g., "48000000")
  checkDigit: string;     // Check digit (e.g., "8")
  fullCode: string;       // Full code with check digit (e.g., "48000000-8")
  description: string;    // English description
  descriptionIt?: string; // Italian description
  level: number;          // 1=Division, 2=Group, 3=Class, 4=Category, 5=Subcategory
  parentCode?: string;
  isService: boolean;     // True if this is a service code
}

interface CPVFile {
  version: string;
  source: string;
  lastUpdated: string;
  codes: CPVCode[];
}

// Keywords for CPV matching
const CPV_KEYWORDS: Record<string, string[]> = {
  // IT Software & Services (48-72)
  '48': ['software', 'package', 'sistema', 'application', 'programma', 'licenza'],
  '48100000': ['erp', 'enterprise', 'gestionale', 'business'],
  '48200000': ['network', 'rete', 'internet', 'web'],
  '48300000': ['document', 'documento', 'publishing', 'office'],
  '48400000': ['transaction', 'transazione', 'business', 'commerce'],
  '48600000': ['database', 'banca dati', 'dbms'],
  '48700000': ['utility', 'utilità', 'tool'],
  '48800000': ['information system', 'sistema informativo'],
  '72': ['it service', 'servizio informatico', 'consulenza it', 'sviluppo software'],
  '72200000': ['programming', 'programmazione', 'sviluppo', 'development'],
  '72300000': ['data service', 'elaborazione dati'],
  '72400000': ['internet service', 'web service', 'hosting'],
  '72500000': ['computer service', 'manutenzione', 'supporto'],
  '72600000': ['support', 'assistenza', 'help desk'],

  // Professional Services
  '79': ['business service', 'servizio aziendale', 'consulenza'],
  '79100000': ['legal', 'legale', 'giuridico', 'avvocato'],
  '79200000': ['accounting', 'contabilità', 'revisione', 'audit'],
  '79300000': ['market research', 'ricerca mercato', 'sondaggio'],
  '79400000': ['management consulting', 'consulenza gestionale', 'strategia'],
  '79500000': ['secretarial', 'segreteria', 'traduzione'],
  '79600000': ['recruitment', 'selezione', 'personale', 'hr'],
  '79700000': ['investigation', 'security', 'sicurezza', 'vigilanza'],
  '79800000': ['printing', 'stampa', 'tipografia'],
  '79900000': ['misc business', 'altri servizi'],

  // Financial Services
  '66': ['financial', 'finanziario', 'banca', 'assicurazione'],
  '66100000': ['banking', 'bancario', 'credito'],
  '66500000': ['insurance', 'assicurazione', 'polizza'],
  '66600000': ['treasury', 'tesoreria'],
  '66700000': ['reinsurance', 'riassicurazione'],

  // Healthcare/Medical
  '33': ['medical', 'medico', 'sanitario', 'ospedaliero'],
  '33100000': ['medical equipment', 'apparecchiatura medica'],
  '33600000': ['pharmaceutical', 'farmaceutico', 'medicinale'],
  '33700000': ['personal care', 'igiene personale'],
  '85': ['health service', 'servizio sanitario'],
  '85100000': ['health', 'salute', 'sanità'],

  // Food & Beverages
  '15': ['food', 'alimentare', 'cibo', 'bevanda'],
  '15100000': ['meat', 'carne', 'salume'],
  '15200000': ['fish', 'pesce', 'ittico'],
  '15300000': ['fruit', 'vegetable', 'frutta', 'verdura'],
  '15400000': ['oils', 'fats', 'olio', 'grasso'],
  '15500000': ['dairy', 'latticini', 'latte'],
  '15600000': ['grain', 'cereali', 'farina'],
  '15800000': ['misc food', 'altri alimentari'],
  '15900000': ['beverages', 'bevande'],

  // Furniture
  '39': ['furniture', 'mobili', 'arredo', 'arredamento'],
  '39100000': ['furniture', 'mobili', 'ufficio'],
  '39110000': ['seating', 'sedute', 'sedia'],
  '39120000': ['table', 'tavolo', 'desk', 'scrivania'],
  '39130000': ['office furniture', 'mobili ufficio'],
  '39140000': ['kitchen furniture', 'mobili cucina'],
  '39150000': ['misc furniture', 'altri mobili'],

  // Industrial Equipment
  '42': ['industrial machinery', 'macchinari industriali'],
  '43': ['mining machinery', 'macchinari estrazione'],
  '44': ['construction', 'costruzione', 'edilizia'],

  // Automotive
  '34': ['transport', 'trasporto', 'veicolo', 'automobile'],
  '34100000': ['motor vehicle', 'autoveicolo', 'auto'],
  '34300000': ['parts', 'ricambi', 'componenti'],
  '34400000': ['motorcycle', 'moto', 'ciclomotore'],
  '50100000': ['vehicle repair', 'riparazione veicoli', 'officina'],
};

// Sector to CPV division mapping
const SECTOR_TO_CPV: Partial<Record<SectorCode, string[]>> = {
  'it_software': ['48', '72', '30'],
  'food_beverage': ['15', '55'],
  'consumer_goods': ['18', '19', '37', '39'],
  'healthcare_pharma': ['33', '85'],
  'industrial': ['42', '43', '44', '45'],
  'financial_services': ['66'],
  'professional_services': ['79', '71', '73', '74', '75', '80'],
  'automotive': ['34', '50'],
  'banking': ['66'],
  'insurance': ['66'],
  'hr_payroll': ['79'],
  'retail_ecommerce': ['39', '55'],
  'supply_chain_logistics': ['60', '63'],
  'real_estate': ['70'],
  'unknown': [],
};

export class CPVSource implements EnrichmentSource {
  name: KnowledgeSourceType = 'cpv';
  supportedSectors: SectorCode[] = [
    'it_software',
    'food_beverage',
    'consumer_goods',
    'healthcare_pharma',
    'industrial',
    'financial_services',
    'professional_services',
    'automotive',
    'unknown',
  ];
  priority = 4;
  confidenceWeight = 0.8;
  cacheTTLSeconds = 86400; // 24 hours

  private codes: Map<string, CPVCode> = new Map();
  private keywordIndex: Map<string, CPVCode[]> = new Map();
  private initialized = false;

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🇪🇺 Initializing CPV Source...');

    const dataDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const cpvPath = path.join(dataDir, 'cpv_2024.json');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create default CPV codes if not exists
    if (!fs.existsSync(cpvPath)) {
      console.log('   📝 Creating default CPV codes...');
      await this.createDefaultCPV(cpvPath);
    }

    try {
      const data: CPVFile = JSON.parse(fs.readFileSync(cpvPath, 'utf-8'));

      for (const code of data.codes) {
        this.codes.set(code.code, code);

        // Build keyword index from description
        const keywords = code.description.toLowerCase().split(/[\s,;()/-]+/).filter(w => w.length > 2);
        for (const keyword of keywords) {
          const existing = this.keywordIndex.get(keyword) || [];
          existing.push(code);
          this.keywordIndex.set(keyword, existing);
        }
      }

      console.log(`   ✅ Loaded ${this.codes.size} CPV codes`);
      this.initialized = true;
    } catch (error) {
      console.warn('   ⚠️  Failed to load CPV codes:', error);
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

    // Determine if this is likely a service
    const isService = item.type === 'service' ||
      searchText.includes('service') ||
      searchText.includes('servizio') ||
      searchText.includes('consulting') ||
      searchText.includes('consulenza');

    // Find best matching CPV code
    const match = this.findBestCPV(searchText, context.sector, isService);

    if (match) {
      enrichedFields.cpv_code = match.code.fullCode;
      enrichedFields.cpv_description = match.code.description;
      if (match.code.descriptionIt) {
        enrichedFields.cpv_description_it = match.code.descriptionIt;
      }
      enrichedFields.cpv_is_service = match.code.isService;
      fieldsEnriched.push('cpv_code', 'cpv_description');
      reasoning.push(`Matched CPV code: ${match.code.fullCode} - ${match.code.description} (score: ${match.score.toFixed(2)})`);

      // Extract division name for general classification
      const divisionName = this.getDivisionName(match.code.code.substring(0, 2));
      if (divisionName) {
        enrichedFields.cpv_division = divisionName;
        fieldsEnriched.push('cpv_division');
        reasoning.push(`CPV Division: ${divisionName}`);
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

  private findBestCPV(searchText: string, sector?: SectorCode, isService?: boolean): { code: CPVCode; score: number } | null {
    let bestMatch: { code: CPVCode; score: number } | null = null;

    // Get relevant CPV divisions for the sector
    const relevantDivisions = sector && sector !== 'unknown' ? (SECTOR_TO_CPV[sector] || []) : [];

    // Search by keywords
    const words = searchText.split(/\s+/).filter(w => w.length > 2);

    for (const word of words) {
      const matches = this.keywordIndex.get(word);
      if (matches) {
        for (const code of matches) {
          // Skip if looking for service but code is product (or vice versa)
          if (isService !== undefined && code.isService !== isService) {
            continue;
          }
          const score = this.calculateMatchScore(searchText, code, relevantDivisions);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { code, score };
          }
        }
      }
    }

    // Also check predefined keyword mappings
    for (const [cpvPrefix, keywords] of Object.entries(CPV_KEYWORDS)) {
      const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
      if (matchCount > 0) {
        const score = matchCount / keywords.length;
        // Find the most specific code matching this prefix
        for (const [codeKey, code] of this.codes) {
          if (codeKey.startsWith(cpvPrefix)) {
            if (isService !== undefined && code.isService !== isService) {
              continue;
            }
            const adjustedScore = score + (code.level * 0.05);
            if (!bestMatch || adjustedScore > bestMatch.score) {
              bestMatch = { code, score: adjustedScore };
            }
          }
        }
      }
    }

    return bestMatch && bestMatch.score >= 0.3 ? bestMatch : null;
  }

  private calculateMatchScore(searchText: string, code: CPVCode, relevantDivisions: string[]): number {
    const descWords = code.description.toLowerCase().split(/[\s,;()/-]+/);
    const searchWords = searchText.split(/\s+/);

    let matches = 0;
    for (const descWord of descWords) {
      if (searchWords.some(sw => sw.includes(descWord) || descWord.includes(sw))) {
        matches++;
      }
    }

    let score = descWords.length > 0 ? matches / descWords.length : 0;

    // Boost score if code is in relevant sector
    if (relevantDivisions.length > 0) {
      const division = code.code.substring(0, 2);
      if (relevantDivisions.includes(division)) {
        score *= 1.3;
      }
    }

    // Prefer more specific (deeper) codes
    score += code.level * 0.05;

    return score;
  }

  private getDivisionName(division: string): string | null {
    const divisionMap: Record<string, string> = {
      '03': 'Agricultural products',
      '09': 'Petroleum products',
      '14': 'Mining products',
      '15': 'Food and beverages',
      '16': 'Agricultural machinery',
      '18': 'Clothing and footwear',
      '19': 'Leather products',
      '22': 'Printed matter',
      '24': 'Chemical products',
      '30': 'Office machinery',
      '31': 'Electrical machinery',
      '32': 'Radio and television',
      '33': 'Medical equipment',
      '34': 'Transport equipment',
      '35': 'Security equipment',
      '37': 'Musical instruments',
      '38': 'Laboratory equipment',
      '39': 'Furniture',
      '42': 'Industrial machinery',
      '43': 'Mining machinery',
      '44': 'Construction structures',
      '45': 'Construction work',
      '48': 'Software packages',
      '50': 'Repair services',
      '51': 'Installation services',
      '55': 'Hotel services',
      '60': 'Transport services',
      '63': 'Ancillary transport',
      '64': 'Postal services',
      '65': 'Public utilities',
      '66': 'Financial services',
      '70': 'Real estate services',
      '71': 'Engineering services',
      '72': 'IT services',
      '73': 'R&D services',
      '75': 'Administration services',
      '76': 'Oil and gas services',
      '77': 'Agricultural services',
      '79': 'Business services',
      '80': 'Education services',
      '85': 'Health services',
      '90': 'Sewage services',
      '92': 'Recreation services',
      '98': 'Other community services',
    };
    return divisionMap[division] || null;
  }

  private async createDefaultCPV(filePath: string): Promise<void> {
    // Create default CPV codes covering main sectors
    const defaultCPV: CPVFile = {
      version: 'CPV 2024',
      source: 'EU Publications Office',
      lastUpdated: new Date().toISOString(),
      codes: [
        // Software (48)
        { code: '48000000', checkDigit: '8', fullCode: '48000000-8', description: 'Software package and information systems', descriptionIt: 'Pacchetti software e sistemi informativi', level: 1, isService: false },
        { code: '48100000', checkDigit: '5', fullCode: '48100000-5', description: 'Industry specific software package', descriptionIt: 'Pacchetti software per industria', level: 2, parentCode: '48000000', isService: false },
        { code: '48200000', checkDigit: '0', fullCode: '48200000-0', description: 'Networking, Internet and intranet software', descriptionIt: 'Software di rete e internet', level: 2, parentCode: '48000000', isService: false },
        { code: '48300000', checkDigit: '1', fullCode: '48300000-1', description: 'Document creation software', descriptionIt: 'Software per creazione documenti', level: 2, parentCode: '48000000', isService: false },
        { code: '48400000', checkDigit: '2', fullCode: '48400000-2', description: 'Business transaction software', descriptionIt: 'Software per transazioni commerciali', level: 2, parentCode: '48000000', isService: false },
        { code: '48600000', checkDigit: '4', fullCode: '48600000-4', description: 'Database and operating software', descriptionIt: 'Software per database e sistemi operativi', level: 2, parentCode: '48000000', isService: false },
        { code: '48700000', checkDigit: '5', fullCode: '48700000-5', description: 'Software package utilities', descriptionIt: 'Utility software', level: 2, parentCode: '48000000', isService: false },
        { code: '48800000', checkDigit: '6', fullCode: '48800000-6', description: 'Information systems and servers', descriptionIt: 'Sistemi informativi e server', level: 2, parentCode: '48000000', isService: false },
        { code: '48900000', checkDigit: '7', fullCode: '48900000-7', description: 'Miscellaneous software packages', descriptionIt: 'Altri pacchetti software', level: 2, parentCode: '48000000', isService: false },

        // IT Services (72)
        { code: '72000000', checkDigit: '5', fullCode: '72000000-5', description: 'IT services: consulting, software development', descriptionIt: 'Servizi IT: consulenza, sviluppo software', level: 1, isService: true },
        { code: '72100000', checkDigit: '6', fullCode: '72100000-6', description: 'Hardware consultancy services', descriptionIt: 'Consulenza hardware', level: 2, parentCode: '72000000', isService: true },
        { code: '72200000', checkDigit: '7', fullCode: '72200000-7', description: 'Software programming and consultancy', descriptionIt: 'Programmazione e consulenza software', level: 2, parentCode: '72000000', isService: true },
        { code: '72210000', checkDigit: '0', fullCode: '72210000-0', description: 'Programming services of packaged software', descriptionIt: 'Servizi di programmazione', level: 3, parentCode: '72200000', isService: true },
        { code: '72220000', checkDigit: '3', fullCode: '72220000-3', description: 'Systems and technical consultancy', descriptionIt: 'Consulenza tecnica e di sistemi', level: 3, parentCode: '72200000', isService: true },
        { code: '72300000', checkDigit: '8', fullCode: '72300000-8', description: 'Data services', descriptionIt: 'Servizi dati', level: 2, parentCode: '72000000', isService: true },
        { code: '72400000', checkDigit: '4', fullCode: '72400000-4', description: 'Internet services', descriptionIt: 'Servizi internet', level: 2, parentCode: '72000000', isService: true },
        { code: '72500000', checkDigit: '0', fullCode: '72500000-0', description: 'Computer-related services', descriptionIt: 'Servizi informatici', level: 2, parentCode: '72000000', isService: true },
        { code: '72600000', checkDigit: '6', fullCode: '72600000-6', description: 'Computer support and consultancy', descriptionIt: 'Supporto e consulenza informatica', level: 2, parentCode: '72000000', isService: true },

        // Business Services (79)
        { code: '79000000', checkDigit: '4', fullCode: '79000000-4', description: 'Business services: law, marketing, consulting', descriptionIt: 'Servizi alle imprese', level: 1, isService: true },
        { code: '79100000', checkDigit: '5', fullCode: '79100000-5', description: 'Legal services', descriptionIt: 'Servizi legali', level: 2, parentCode: '79000000', isService: true },
        { code: '79200000', checkDigit: '6', fullCode: '79200000-6', description: 'Accounting, auditing and fiscal services', descriptionIt: 'Contabilità, revisione e servizi fiscali', level: 2, parentCode: '79000000', isService: true },
        { code: '79300000', checkDigit: '7', fullCode: '79300000-7', description: 'Market and economic research', descriptionIt: 'Ricerche di mercato ed economiche', level: 2, parentCode: '79000000', isService: true },
        { code: '79400000', checkDigit: '8', fullCode: '79400000-8', description: 'Business and management consultancy', descriptionIt: 'Consulenza aziendale e gestionale', level: 2, parentCode: '79000000', isService: true },
        { code: '79410000', checkDigit: '1', fullCode: '79410000-1', description: 'Business and management consultancy', descriptionIt: 'Consulenza aziendale', level: 3, parentCode: '79400000', isService: true },
        { code: '79420000', checkDigit: '4', fullCode: '79420000-4', description: 'Management-related services', descriptionIt: 'Servizi di gestione', level: 3, parentCode: '79400000', isService: true },
        { code: '79500000', checkDigit: '9', fullCode: '79500000-9', description: 'Office-support services', descriptionIt: 'Servizi di supporto ufficio', level: 2, parentCode: '79000000', isService: true },
        { code: '79600000', checkDigit: '0', fullCode: '79600000-0', description: 'Recruitment services', descriptionIt: 'Servizi di selezione del personale', level: 2, parentCode: '79000000', isService: true },
        { code: '79700000', checkDigit: '1', fullCode: '79700000-1', description: 'Investigation and security services', descriptionIt: 'Servizi investigativi e di sicurezza', level: 2, parentCode: '79000000', isService: true },
        { code: '79800000', checkDigit: '2', fullCode: '79800000-2', description: 'Printing and related services', descriptionIt: 'Servizi di stampa', level: 2, parentCode: '79000000', isService: true },

        // Financial Services (66)
        { code: '66000000', checkDigit: '0', fullCode: '66000000-0', description: 'Financial and insurance services', descriptionIt: 'Servizi finanziari e assicurativi', level: 1, isService: true },
        { code: '66100000', checkDigit: '1', fullCode: '66100000-1', description: 'Banking and investment services', descriptionIt: 'Servizi bancari e di investimento', level: 2, parentCode: '66000000', isService: true },
        { code: '66110000', checkDigit: '4', fullCode: '66110000-4', description: 'Banking services', descriptionIt: 'Servizi bancari', level: 3, parentCode: '66100000', isService: true },
        { code: '66120000', checkDigit: '7', fullCode: '66120000-7', description: 'Investment banking services', descriptionIt: 'Servizi di investment banking', level: 3, parentCode: '66100000', isService: true },
        { code: '66500000', checkDigit: '5', fullCode: '66500000-5', description: 'Insurance services', descriptionIt: 'Servizi assicurativi', level: 2, parentCode: '66000000', isService: true },
        { code: '66600000', checkDigit: '6', fullCode: '66600000-6', description: 'Treasury services', descriptionIt: 'Servizi di tesoreria', level: 2, parentCode: '66000000', isService: true },

        // Furniture (39)
        { code: '39000000', checkDigit: '2', fullCode: '39000000-2', description: 'Furniture, furnishings and supplies', descriptionIt: 'Mobili, arredamento e forniture', level: 1, isService: false },
        { code: '39100000', checkDigit: '3', fullCode: '39100000-3', description: 'Furniture', descriptionIt: 'Mobili', level: 2, parentCode: '39000000', isService: false },
        { code: '39110000', checkDigit: '6', fullCode: '39110000-6', description: 'Seats, chairs and accessories', descriptionIt: 'Sedute, sedie e accessori', level: 3, parentCode: '39100000', isService: false },
        { code: '39112000', checkDigit: '0', fullCode: '39112000-0', description: 'Chairs', descriptionIt: 'Sedie', level: 4, parentCode: '39110000', isService: false },
        { code: '39113000', checkDigit: '7', fullCode: '39113000-7', description: 'Miscellaneous seats and chairs', descriptionIt: 'Sedute varie', level: 4, parentCode: '39110000', isService: false },
        { code: '39120000', checkDigit: '9', fullCode: '39120000-9', description: 'Tables, cupboards, desks and bookcases', descriptionIt: 'Tavoli, armadi, scrivanie e librerie', level: 3, parentCode: '39100000', isService: false },
        { code: '39121000', checkDigit: '6', fullCode: '39121000-6', description: 'Desks and tables', descriptionIt: 'Scrivanie e tavoli', level: 4, parentCode: '39120000', isService: false },
        { code: '39122000', checkDigit: '3', fullCode: '39122000-3', description: 'Cupboards and bookcases', descriptionIt: 'Armadi e librerie', level: 4, parentCode: '39120000', isService: false },
        { code: '39130000', checkDigit: '2', fullCode: '39130000-2', description: 'Office furniture', descriptionIt: 'Mobili per ufficio', level: 3, parentCode: '39100000', isService: false },
        { code: '39140000', checkDigit: '5', fullCode: '39140000-5', description: 'Domestic furniture', descriptionIt: 'Mobili domestici', level: 3, parentCode: '39100000', isService: false },
        { code: '39141000', checkDigit: '2', fullCode: '39141000-2', description: 'Kitchen furniture', descriptionIt: 'Mobili da cucina', level: 4, parentCode: '39140000', isService: false },
        { code: '39143000', checkDigit: '6', fullCode: '39143000-6', description: 'Bedroom furniture', descriptionIt: 'Mobili per camera', level: 4, parentCode: '39140000', isService: false },

        // Automotive (34)
        { code: '34000000', checkDigit: '7', fullCode: '34000000-7', description: 'Transport equipment and auxiliary products', descriptionIt: 'Mezzi di trasporto e prodotti ausiliari', level: 1, isService: false },
        { code: '34100000', checkDigit: '8', fullCode: '34100000-8', description: 'Motor vehicles', descriptionIt: 'Autoveicoli', level: 2, parentCode: '34000000', isService: false },
        { code: '34110000', checkDigit: '1', fullCode: '34110000-1', description: 'Passenger cars', descriptionIt: 'Autovetture', level: 3, parentCode: '34100000', isService: false },
        { code: '34130000', checkDigit: '7', fullCode: '34130000-7', description: 'Motor vehicles for goods transport', descriptionIt: 'Veicoli per trasporto merci', level: 3, parentCode: '34100000', isService: false },
        { code: '34300000', checkDigit: '0', fullCode: '34300000-0', description: 'Parts and accessories for vehicles', descriptionIt: 'Parti e accessori per veicoli', level: 2, parentCode: '34000000', isService: false },
        { code: '34310000', checkDigit: '3', fullCode: '34310000-3', description: 'Engines and engine parts', descriptionIt: 'Motori e parti di motori', level: 3, parentCode: '34300000', isService: false },
        { code: '34320000', checkDigit: '6', fullCode: '34320000-6', description: 'Mechanical spare parts', descriptionIt: 'Ricambi meccanici', level: 3, parentCode: '34300000', isService: false },

        // Food (15)
        { code: '15000000', checkDigit: '8', fullCode: '15000000-8', description: 'Food, beverages, tobacco and related products', descriptionIt: 'Prodotti alimentari, bevande, tabacco', level: 1, isService: false },
        { code: '15100000', checkDigit: '9', fullCode: '15100000-9', description: 'Animal products, meat and meat products', descriptionIt: 'Prodotti animali, carne', level: 2, parentCode: '15000000', isService: false },
        { code: '15500000', checkDigit: '3', fullCode: '15500000-3', description: 'Dairy products', descriptionIt: 'Prodotti lattiero-caseari', level: 2, parentCode: '15000000', isService: false },
        { code: '15800000', checkDigit: '6', fullCode: '15800000-6', description: 'Miscellaneous food products', descriptionIt: 'Prodotti alimentari vari', level: 2, parentCode: '15000000', isService: false },
        { code: '15900000', checkDigit: '7', fullCode: '15900000-7', description: 'Beverages, tobacco and related products', descriptionIt: 'Bevande, tabacco e prodotti correlati', level: 2, parentCode: '15000000', isService: false },

        // Medical/Healthcare (33)
        { code: '33000000', checkDigit: '0', fullCode: '33000000-0', description: 'Medical equipments, pharmaceuticals', descriptionIt: 'Apparecchiature mediche, farmaceutici', level: 1, isService: false },
        { code: '33100000', checkDigit: '1', fullCode: '33100000-1', description: 'Medical equipments', descriptionIt: 'Apparecchiature mediche', level: 2, parentCode: '33000000', isService: false },
        { code: '33600000', checkDigit: '6', fullCode: '33600000-6', description: 'Pharmaceutical products', descriptionIt: 'Prodotti farmaceutici', level: 2, parentCode: '33000000', isService: false },
        { code: '33690000', checkDigit: '3', fullCode: '33690000-3', description: 'Various medicinal products', descriptionIt: 'Medicinali vari', level: 3, parentCode: '33600000', isService: false },

        // Health Services (85)
        { code: '85000000', checkDigit: '9', fullCode: '85000000-9', description: 'Health and social work services', descriptionIt: 'Servizi sanitari e sociali', level: 1, isService: true },
        { code: '85100000', checkDigit: '0', fullCode: '85100000-0', description: 'Health services', descriptionIt: 'Servizi sanitari', level: 2, parentCode: '85000000', isService: true },
        { code: '85110000', checkDigit: '3', fullCode: '85110000-3', description: 'Hospital and related services', descriptionIt: 'Servizi ospedalieri', level: 3, parentCode: '85100000', isService: true },

        // Engineering Services (71)
        { code: '71000000', checkDigit: '8', fullCode: '71000000-8', description: 'Architectural, construction, engineering', descriptionIt: 'Architettura, costruzione, ingegneria', level: 1, isService: true },
        { code: '71200000', checkDigit: '0', fullCode: '71200000-0', description: 'Architectural and related services', descriptionIt: 'Servizi di architettura', level: 2, parentCode: '71000000', isService: true },
        { code: '71300000', checkDigit: '1', fullCode: '71300000-1', description: 'Engineering services', descriptionIt: 'Servizi di ingegneria', level: 2, parentCode: '71000000', isService: true },
        { code: '71310000', checkDigit: '4', fullCode: '71310000-4', description: 'Consultative engineering', descriptionIt: 'Consulenza ingegneristica', level: 3, parentCode: '71300000', isService: true },
        { code: '71320000', checkDigit: '7', fullCode: '71320000-7', description: 'Engineering design services', descriptionIt: 'Progettazione ingegneristica', level: 3, parentCode: '71300000', isService: true },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(defaultCPV, null, 2));
    console.log(`   ✅ Created default CPV codes with ${defaultCPV.codes.length} entries`);
  }

  // Get code by CPV code
  getCode(code: string): CPVCode | undefined {
    return this.codes.get(code.replace(/-\d$/, '')); // Remove check digit if present
  }

  // Search codes by text
  searchCodes(query: string, limit = 10): CPVCode[] {
    const results: { code: CPVCode; score: number }[] = [];
    const queryLower = query.toLowerCase();

    for (const [, code] of this.codes) {
      if (code.description.toLowerCase().includes(queryLower) ||
          (code.descriptionIt && code.descriptionIt.toLowerCase().includes(queryLower))) {
        const score = this.calculateMatchScore(queryLower, code, []);
        results.push({ code, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.code);
  }

  getStats(): { totalCodes: number; maxLevel: number; serviceCount: number; productCount: number } {
    let maxLevel = 0;
    let serviceCount = 0;
    let productCount = 0;
    for (const [, code] of this.codes) {
      if (code.level > maxLevel) maxLevel = code.level;
      if (code.isService) serviceCount++;
      else productCount++;
    }
    return {
      totalCodes: this.codes.size,
      maxLevel,
      serviceCount,
      productCount,
    };
  }
}

// Singleton
let instance: CPVSource | null = null;

export function getCPVSource(): CPVSource {
  if (!instance) {
    instance = new CPVSource();
  }
  return instance;
}

export default CPVSource;
