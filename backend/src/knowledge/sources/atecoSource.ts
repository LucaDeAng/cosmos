/**
 * ATECO Source - Italian Economic Activity Classification
 *
 * Provides product/service classification using ISTAT's ATECO codes.
 * ATECO (ATtività ECOnomiche) is the Italian version of NACE Rev. 2,
 * used for classifying economic activities in Italy.
 *
 * Features:
 * - Hierarchical 6-digit codes (e.g., 31.01.10 = Office furniture manufacturing)
 * - Aligned with EU NACE classification
 * - Essential for Italian PMI compliance and reporting
 * - Covers all economic sectors including manufacturing, services
 *
 * Data source: ISTAT (https://www.istat.it/it/archivio/17888)
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

// ATECO code structure
export interface ATECOCode {
  code: string;          // e.g., "31.01.10"
  description: string;   // Italian description
  descriptionEn?: string; // English description
  level: number;         // 1=Section, 2=Division, 3=Group, 4=Class, 5=Category, 6=Subcategory
  parentCode?: string;
  naceCode?: string;     // Corresponding EU NACE code
}

interface ATECOFile {
  version: string;
  source: string;
  lastUpdated: string;
  codes: ATECOCode[];
}

// Keywords for Italian product matching
const ATECO_KEYWORDS: Record<string, string[]> = {
  // Manufacturing - Furniture (31)
  '31': ['mobile', 'mobili', 'arredo', 'arredamento', 'furniture', 'sedia', 'tavolo', 'armadio', 'scrivania', 'letto', 'divano', 'poltrona'],
  '31.01': ['ufficio', 'negozio', 'office', 'shop', 'commerciale'],
  '31.02': ['cucina', 'kitchen', 'pensile', 'piano cottura'],
  '31.03': ['materasso', 'mattress', 'rete', 'letto'],
  '31.09': ['soggiorno', 'camera', 'bagno', 'esterno', 'giardino'],

  // Manufacturing - IT/Electronics (26)
  '26': ['computer', 'elettronica', 'electronic', 'componenti', 'hardware', 'semiconduttore'],
  '26.1': ['componente', 'scheda', 'circuito', 'board', 'chip'],
  '26.2': ['computer', 'pc', 'server', 'workstation', 'laptop', 'notebook'],
  '26.3': ['comunicazione', 'telefono', 'router', 'switch', 'network'],

  // Manufacturing - Food (10-11)
  '10': ['alimentare', 'food', 'cibo', 'trasformazione', 'conservazione'],
  '10.1': ['carne', 'meat', 'salume', 'insaccato'],
  '10.2': ['pesce', 'fish', 'ittico'],
  '10.3': ['frutta', 'verdura', 'vegetable', 'fruit', 'conserva'],
  '10.7': ['pane', 'pasta', 'dolce', 'bakery', 'forno', 'pasticceria'],
  '11': ['bevanda', 'beverage', 'drink', 'vino', 'birra', 'acqua'],

  // Manufacturing - Pharma (21)
  '21': ['farmaceutico', 'pharmaceutical', 'medicinale', 'farmaco', 'drug'],
  '21.1': ['principio attivo', 'active ingredient', 'api'],
  '21.2': ['medicinale', 'medicine', 'preparato'],

  // Manufacturing - Automotive (29)
  '29': ['autoveicolo', 'automobile', 'auto', 'veicolo', 'vehicle', 'car'],
  '29.1': ['autoveicolo', 'automobile', 'car', 'truck', 'furgone'],
  '29.2': ['carrozzeria', 'body', 'rimorchio', 'trailer'],
  '29.3': ['componente', 'ricambio', 'part', 'accessorio'],

  // Services - IT (62-63)
  '62': ['software', 'programmazione', 'programming', 'sviluppo', 'development', 'informatica', 'it'],
  '62.01': ['software', 'applicazione', 'application', 'app', 'saas'],
  '62.02': ['consulenza', 'consulting', 'it consulting'],
  '62.03': ['hosting', 'data center', 'cloud', 'infrastruttura'],
  '63': ['servizi informativi', 'information service', 'dati', 'data'],

  // Services - Financial (64-66)
  '64': ['banca', 'bank', 'finanziario', 'financial', 'credito'],
  '65': ['assicurazione', 'insurance'],
  '66': ['servizi finanziari', 'financial services'],

  // Professional Services (69-74)
  '69': ['legale', 'legal', 'contabilità', 'accounting', 'consulenza fiscale'],
  '70': ['management', 'consulenza aziendale', 'business consulting'],
  '71': ['ingegneria', 'engineering', 'architettura', 'architecture'],
  '72': ['ricerca', 'research', 'r&d', 'sviluppo'],
  '73': ['pubblicità', 'advertising', 'marketing', 'comunicazione'],
  '74': ['design', 'fotografia', 'traduzione'],
};

// Sector to ATECO section mapping
const SECTOR_TO_ATECO: Partial<Record<SectorCode, string[]>> = {
  'it_software': ['26', '62', '63'],
  'food_beverage': ['10', '11'],
  'consumer_goods': ['13', '14', '15', '20', '31', '32'],
  'healthcare_pharma': ['21', '32.5', '86'],
  'industrial': ['24', '25', '28', '33'],
  'financial_services': ['64', '65', '66'],
  'professional_services': ['69', '70', '71', '72', '73', '74'],
  'automotive': ['29', '30', '45'],
  'banking': ['64'],
  'insurance': ['65'],
  'hr_payroll': ['78'],
  'retail_ecommerce': ['47'],
  'supply_chain_logistics': ['49', '50', '51', '52', '53'],
  'real_estate': ['68'],
  'unknown': [],
};

export class ATECOSource implements EnrichmentSource {
  name: KnowledgeSourceType = 'ateco';
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
  priority = 3;
  confidenceWeight = 0.85;
  cacheTTLSeconds = 86400; // 24 hours

  private codes: Map<string, ATECOCode> = new Map();
  private keywordIndex: Map<string, ATECOCode[]> = new Map();
  private initialized = false;

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🇮🇹 Initializing ATECO Source...');

    const dataDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const atecoPath = path.join(dataDir, 'ateco_2025.json');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create default ATECO codes if not exists
    if (!fs.existsSync(atecoPath)) {
      console.log('   📝 Creating default ATECO codes...');
      await this.createDefaultATECO(atecoPath);
    }

    try {
      const data: ATECOFile = JSON.parse(fs.readFileSync(atecoPath, 'utf-8'));

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

      console.log(`   ✅ Loaded ${this.codes.size} ATECO codes`);
      this.initialized = true;
    } catch (error) {
      console.warn('   ⚠️  Failed to load ATECO codes:', error);
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

    // Find best matching ATECO code
    const match = this.findBestATECO(searchText, context.sector);

    if (match) {
      enrichedFields.ateco_code = match.code.code;
      enrichedFields.ateco_description = match.code.description;
      if (match.code.descriptionEn) {
        enrichedFields.ateco_description_en = match.code.descriptionEn;
      }
      if (match.code.naceCode) {
        enrichedFields.nace_code = match.code.naceCode;
      }
      fieldsEnriched.push('ateco_code', 'ateco_description');
      reasoning.push(`Matched ATECO code: ${match.code.code} - ${match.code.description} (score: ${match.score.toFixed(2)})`);

      // Extract sector from ATECO section
      const section = match.code.code.substring(0, 2);
      const sectorName = this.getSectorFromATECO(section);
      if (sectorName && !item.category) {
        enrichedFields.italian_sector = sectorName;
        fieldsEnriched.push('italian_sector');
        reasoning.push(`Identified Italian sector: ${sectorName}`);
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

  private findBestATECO(searchText: string, sector?: SectorCode): { code: ATECOCode; score: number } | null {
    let bestMatch: { code: ATECOCode; score: number } | null = null;

    // Get relevant ATECO sections for the sector
    const relevantSections = sector && sector !== 'unknown' ? (SECTOR_TO_ATECO[sector] || []) : [];

    // Search by keywords
    const words = searchText.split(/\s+/).filter(w => w.length > 2);

    for (const word of words) {
      const matches = this.keywordIndex.get(word);
      if (matches) {
        for (const code of matches) {
          const score = this.calculateMatchScore(searchText, code, relevantSections);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { code, score };
          }
        }
      }
    }

    // Also check predefined keyword mappings
    for (const [atecoPrefix, keywords] of Object.entries(ATECO_KEYWORDS)) {
      const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
      if (matchCount > 0) {
        const score = matchCount / keywords.length;
        // Find the most specific code matching this prefix
        for (const [codeKey, code] of this.codes) {
          if (codeKey.startsWith(atecoPrefix)) {
            const adjustedScore = score + (code.level * 0.1); // Prefer more specific codes
            if (!bestMatch || adjustedScore > bestMatch.score) {
              bestMatch = { code, score: adjustedScore };
            }
          }
        }
      }
    }

    return bestMatch && bestMatch.score >= 0.3 ? bestMatch : null;
  }

  private calculateMatchScore(searchText: string, code: ATECOCode, relevantSections: string[]): number {
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
    if (relevantSections.length > 0) {
      const section = code.code.substring(0, 2);
      if (relevantSections.some(s => section.startsWith(s) || s.startsWith(section))) {
        score *= 1.3;
      }
    }

    // Prefer more specific (deeper) codes
    score += code.level * 0.05;

    return score;
  }

  private getSectorFromATECO(section: string): string | null {
    const sectorMap: Record<string, string> = {
      '01': 'Agricoltura',
      '10': 'Industria Alimentare',
      '11': 'Industria delle Bevande',
      '13': 'Tessile',
      '14': 'Abbigliamento',
      '15': 'Pelle e Calzature',
      '20': 'Chimica',
      '21': 'Farmaceutica',
      '24': 'Metallurgia',
      '25': 'Prodotti in Metallo',
      '26': 'Elettronica',
      '27': 'Apparecchiature Elettriche',
      '28': 'Macchinari',
      '29': 'Automotive',
      '30': 'Altri Mezzi di Trasporto',
      '31': 'Mobili e Arredamento',
      '32': 'Altre Industrie Manifatturiere',
      '33': 'Riparazione e Manutenzione',
      '45': 'Commercio Autoveicoli',
      '46': 'Commercio all\'Ingrosso',
      '47': 'Commercio al Dettaglio',
      '62': 'Software e IT',
      '63': 'Servizi Informativi',
      '64': 'Servizi Finanziari',
      '65': 'Assicurazioni',
      '66': 'Servizi Finanziari Ausiliari',
      '69': 'Attività Legali e Contabili',
      '70': 'Consulenza Aziendale',
      '71': 'Ingegneria e Architettura',
      '72': 'Ricerca e Sviluppo',
      '73': 'Pubblicità e Marketing',
      '74': 'Design e Altre Attività',
      '86': 'Sanità',
    };
    return sectorMap[section] || null;
  }

  private async createDefaultATECO(filePath: string): Promise<void> {
    // Create default ATECO codes covering main sectors
    const defaultATECO: ATECOFile = {
      version: 'ATECO 2025',
      source: 'ISTAT',
      lastUpdated: new Date().toISOString(),
      codes: [
        // Section C - Manufacturing (10-33)
        // Food (10-11)
        { code: '10', description: 'Industrie alimentari', descriptionEn: 'Food products manufacturing', level: 2, naceCode: '10' },
        { code: '10.1', description: 'Lavorazione e conservazione di carne', descriptionEn: 'Meat processing and preserving', level: 3, parentCode: '10', naceCode: '10.1' },
        { code: '10.7', description: 'Produzione di prodotti da forno e farinacei', descriptionEn: 'Bakery and farinaceous products', level: 3, parentCode: '10', naceCode: '10.7' },
        { code: '11', description: 'Industria delle bevande', descriptionEn: 'Beverages manufacturing', level: 2, naceCode: '11' },
        { code: '11.01', description: 'Distillazione, rettifica e miscelatura degli alcolici', descriptionEn: 'Distilling and blending of spirits', level: 4, parentCode: '11', naceCode: '11.01' },
        { code: '11.02', description: 'Produzione di vini da uve', descriptionEn: 'Wine production', level: 4, parentCode: '11', naceCode: '11.02' },

        // Pharma (21)
        { code: '21', description: 'Fabbricazione di prodotti farmaceutici di base e preparati', descriptionEn: 'Pharmaceutical products manufacturing', level: 2, naceCode: '21' },
        { code: '21.10', description: 'Fabbricazione di prodotti farmaceutici di base', descriptionEn: 'Basic pharmaceutical products', level: 4, parentCode: '21', naceCode: '21.10' },
        { code: '21.20', description: 'Fabbricazione di medicinali e preparati farmaceutici', descriptionEn: 'Pharmaceutical preparations', level: 4, parentCode: '21', naceCode: '21.20' },

        // Electronics (26)
        { code: '26', description: 'Fabbricazione di computer e prodotti elettronici', descriptionEn: 'Computer and electronic products manufacturing', level: 2, naceCode: '26' },
        { code: '26.1', description: 'Fabbricazione di componenti elettronici', descriptionEn: 'Electronic components', level: 3, parentCode: '26', naceCode: '26.1' },
        { code: '26.2', description: 'Fabbricazione di computer e unità periferiche', descriptionEn: 'Computers and peripherals', level: 3, parentCode: '26', naceCode: '26.2' },
        { code: '26.20', description: 'Fabbricazione di computer e unità periferiche', descriptionEn: 'Computers and peripheral equipment', level: 4, parentCode: '26.2', naceCode: '26.20' },
        { code: '26.3', description: 'Fabbricazione di apparecchiature per le comunicazioni', descriptionEn: 'Communication equipment', level: 3, parentCode: '26', naceCode: '26.3' },

        // Automotive (29)
        { code: '29', description: 'Fabbricazione di autoveicoli, rimorchi e semirimorchi', descriptionEn: 'Motor vehicles manufacturing', level: 2, naceCode: '29' },
        { code: '29.1', description: 'Fabbricazione di autoveicoli', descriptionEn: 'Motor vehicles', level: 3, parentCode: '29', naceCode: '29.1' },
        { code: '29.10', description: 'Fabbricazione di autoveicoli', descriptionEn: 'Motor vehicles manufacturing', level: 4, parentCode: '29.1', naceCode: '29.10' },
        { code: '29.3', description: 'Fabbricazione di parti e accessori per autoveicoli', descriptionEn: 'Parts and accessories for motor vehicles', level: 3, parentCode: '29', naceCode: '29.3' },

        // Furniture (31) - Key for Italian PMI
        { code: '31', description: 'Fabbricazione di mobili', descriptionEn: 'Furniture manufacturing', level: 2, naceCode: '31' },
        { code: '31.0', description: 'Fabbricazione di mobili', descriptionEn: 'Furniture manufacturing', level: 3, parentCode: '31', naceCode: '31.0' },
        { code: '31.01', description: 'Fabbricazione di mobili per ufficio e negozi', descriptionEn: 'Office and shop furniture', level: 4, parentCode: '31.0', naceCode: '31.01' },
        { code: '31.01.1', description: 'Fabbricazione di sedie e sedili per ufficio', descriptionEn: 'Office chairs and seating', level: 5, parentCode: '31.01', naceCode: '31.01' },
        { code: '31.01.2', description: 'Fabbricazione di mobili metallici per ufficio', descriptionEn: 'Metal office furniture', level: 5, parentCode: '31.01', naceCode: '31.01' },
        { code: '31.02', description: 'Fabbricazione di mobili per cucina', descriptionEn: 'Kitchen furniture', level: 4, parentCode: '31.0', naceCode: '31.02' },
        { code: '31.03', description: 'Fabbricazione di materassi', descriptionEn: 'Mattresses manufacturing', level: 4, parentCode: '31.0', naceCode: '31.03' },
        { code: '31.09', description: 'Fabbricazione di altri mobili', descriptionEn: 'Other furniture', level: 4, parentCode: '31.0', naceCode: '31.09' },
        { code: '31.09.1', description: 'Fabbricazione di mobili per arredo domestico', descriptionEn: 'Domestic furniture', level: 5, parentCode: '31.09', naceCode: '31.09' },
        { code: '31.09.2', description: 'Fabbricazione di sedie e sedili (escluso ufficio)', descriptionEn: 'Chairs and seating (non-office)', level: 5, parentCode: '31.09', naceCode: '31.09' },
        { code: '31.09.3', description: 'Fabbricazione di poltrone e divani', descriptionEn: 'Armchairs and sofas', level: 5, parentCode: '31.09', naceCode: '31.09' },
        { code: '31.09.4', description: 'Fabbricazione di mobili per giardino', descriptionEn: 'Garden furniture', level: 5, parentCode: '31.09', naceCode: '31.09' },
        { code: '31.09.5', description: 'Finitura di mobili', descriptionEn: 'Furniture finishing', level: 5, parentCode: '31.09', naceCode: '31.09' },

        // IT Services (62-63)
        { code: '62', description: 'Produzione di software, consulenza informatica', descriptionEn: 'Software publishing and IT consulting', level: 2, naceCode: '62' },
        { code: '62.01', description: 'Produzione di software non connesso all\'edizione', descriptionEn: 'Computer programming activities', level: 4, parentCode: '62', naceCode: '62.01' },
        { code: '62.02', description: 'Consulenza nel settore delle tecnologie dell\'informatica', descriptionEn: 'IT consultancy activities', level: 4, parentCode: '62', naceCode: '62.02' },
        { code: '62.03', description: 'Gestione di strutture informatiche', descriptionEn: 'Computer facilities management', level: 4, parentCode: '62', naceCode: '62.03' },
        { code: '62.09', description: 'Altre attività dei servizi connessi alle tecnologie', descriptionEn: 'Other IT service activities', level: 4, parentCode: '62', naceCode: '62.09' },
        { code: '63', description: 'Attività dei servizi d\'informazione', descriptionEn: 'Information service activities', level: 2, naceCode: '63' },
        { code: '63.1', description: 'Elaborazione dei dati, hosting e attività connesse', descriptionEn: 'Data processing and hosting', level: 3, parentCode: '63', naceCode: '63.1' },
        { code: '63.11', description: 'Elaborazione dei dati, hosting e attività connesse', descriptionEn: 'Data processing and hosting activities', level: 4, parentCode: '63.1', naceCode: '63.11' },

        // Financial Services (64-66)
        { code: '64', description: 'Attività di servizi finanziari', descriptionEn: 'Financial service activities', level: 2, naceCode: '64' },
        { code: '64.1', description: 'Intermediazione monetaria', descriptionEn: 'Monetary intermediation', level: 3, parentCode: '64', naceCode: '64.1' },
        { code: '65', description: 'Assicurazioni, riassicurazioni e fondi pensione', descriptionEn: 'Insurance, reinsurance and pension', level: 2, naceCode: '65' },
        { code: '66', description: 'Attività ausiliarie dei servizi finanziari', descriptionEn: 'Auxiliary financial services', level: 2, naceCode: '66' },

        // Professional Services (69-74)
        { code: '69', description: 'Attività legali e contabilità', descriptionEn: 'Legal and accounting activities', level: 2, naceCode: '69' },
        { code: '69.1', description: 'Attività degli studi legali', descriptionEn: 'Legal activities', level: 3, parentCode: '69', naceCode: '69.1' },
        { code: '69.2', description: 'Contabilità, consulenza societaria, revisione', descriptionEn: 'Accounting and auditing', level: 3, parentCode: '69', naceCode: '69.2' },
        { code: '70', description: 'Attività di direzione aziendale e consulenza gestionale', descriptionEn: 'Management consultancy activities', level: 2, naceCode: '70' },
        { code: '70.2', description: 'Attività di consulenza gestionale', descriptionEn: 'Management consultancy', level: 3, parentCode: '70', naceCode: '70.2' },
        { code: '71', description: 'Attività degli studi di architettura e ingegneria', descriptionEn: 'Architecture and engineering', level: 2, naceCode: '71' },
        { code: '72', description: 'Ricerca scientifica e sviluppo', descriptionEn: 'Scientific research and development', level: 2, naceCode: '72' },
        { code: '73', description: 'Pubblicità e ricerche di mercato', descriptionEn: 'Advertising and market research', level: 2, naceCode: '73' },
        { code: '74', description: 'Altre attività professionali, scientifiche e tecniche', descriptionEn: 'Other professional activities', level: 2, naceCode: '74' },
        { code: '74.1', description: 'Attività di design specializzate', descriptionEn: 'Specialized design activities', level: 3, parentCode: '74', naceCode: '74.1' },
        { code: '74.10', description: 'Attività di design specializzate', descriptionEn: 'Industrial and product design', level: 4, parentCode: '74.1', naceCode: '74.10' },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(defaultATECO, null, 2));
    console.log(`   ✅ Created default ATECO codes with ${defaultATECO.codes.length} entries`);
  }

  // Get code by ATECO code
  getCode(code: string): ATECOCode | undefined {
    return this.codes.get(code);
  }

  // Search codes by text
  searchCodes(query: string, limit = 10): ATECOCode[] {
    const results: { code: ATECOCode; score: number }[] = [];
    const queryLower = query.toLowerCase();

    for (const [, code] of this.codes) {
      if (code.description.toLowerCase().includes(queryLower) ||
          (code.descriptionEn && code.descriptionEn.toLowerCase().includes(queryLower))) {
        const score = this.calculateMatchScore(queryLower, code, []);
        results.push({ code, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.code);
  }

  // Get all codes for a specific sector
  getCodesForSector(sector: SectorCode): ATECOCode[] {
    const sections = SECTOR_TO_ATECO[sector] || [];
    if (sections.length === 0) return [];

    const result: ATECOCode[] = [];
    for (const [codeKey, code] of this.codes) {
      const section = codeKey.substring(0, 2);
      if (sections.some(s => section.startsWith(s) || s.startsWith(section))) {
        result.push(code);
      }
    }
    return result;
  }

  getStats(): { totalCodes: number; maxLevel: number } {
    let maxLevel = 0;
    for (const [, code] of this.codes) {
      if (code.level > maxLevel) maxLevel = code.level;
    }
    return {
      totalCodes: this.codes.size,
      maxLevel,
    };
  }
}

// Singleton
let instance: ATECOSource | null = null;

export function getATECOSource(): ATECOSource {
  if (!instance) {
    instance = new ATECOSource();
  }
  return instance;
}

export default ATECOSource;
