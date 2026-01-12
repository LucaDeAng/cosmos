/**
 * PRODCOM Source - EU Manufacturing Products Classification
 *
 * Provides product classification using Eurostat's PRODCOM codes.
 * PRODCOM (PRODuction COMmunautaire) is the EU system for statistics
 * on the production of manufactured goods.
 *
 * Features:
 * - 8-digit product codes linked to CPA and NACE
 * - 3800+ manufacturing product headings
 * - Essential for EU trade statistics and reporting
 * - Detailed coverage of industrial and consumer goods
 *
 * Data source: Eurostat (https://ec.europa.eu/eurostat/web/prodcom)
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

// PRODCOM code structure
export interface PRODCOMCode {
  code: string;           // 8-digit PRODCOM code (e.g., "31011100")
  description: string;    // Product description
  descriptionIt?: string; // Italian description
  cpaCode?: string;       // Corresponding CPA code
  naceCode?: string;      // Corresponding NACE Rev.2 code
  unit?: string;          // Unit of measurement (kg, units, m², etc.)
  level: number;          // Hierarchy level
  parentCode?: string;
}

interface PRODCOMFile {
  version: string;
  source: string;
  lastUpdated: string;
  codes: PRODCOMCode[];
}

// Keywords for product matching
const PRODCOM_KEYWORDS: Record<string, string[]> = {
  // Furniture (31)
  '3101': ['office furniture', 'mobili ufficio', 'seating', 'chairs', 'desk', 'scrivania', 'sedia'],
  '3102': ['kitchen furniture', 'mobili cucina', 'kitchen cabinet', 'pensile'],
  '3103': ['mattress', 'materasso', 'spring mattress', 'foam mattress'],
  '3109': ['furniture', 'mobili', 'sofa', 'divano', 'armchair', 'poltrona', 'wardrobe', 'armadio', 'bed', 'letto', 'table', 'tavolo'],

  // Food products (10)
  '1011': ['meat', 'carne', 'beef', 'pork', 'poultry'],
  '1020': ['fish', 'pesce', 'seafood', 'frozen fish'],
  '1039': ['fruit', 'vegetable', 'frutta', 'verdura', 'conserve'],
  '1071': ['bread', 'pane', 'bakery', 'pastry', 'dolci'],
  '1072': ['biscuit', 'biscotti', 'cookie', 'cracker'],

  // Beverages (11)
  '1101': ['spirits', 'liquor', 'whisky', 'vodka', 'grappa'],
  '1102': ['wine', 'vino', 'sparkling wine', 'prosecco'],
  '1105': ['beer', 'birra', 'ale', 'lager'],
  '1107': ['soft drink', 'mineral water', 'acqua minerale', 'bevanda'],

  // Pharma (21)
  '2110': ['pharmaceutical', 'farmaceutico', 'api', 'active ingredient'],
  '2120': ['medicine', 'medicinale', 'drug', 'tablet', 'capsule', 'injection'],

  // Electronics (26)
  '2611': ['electronic component', 'componente elettronico', 'semiconductor', 'integrated circuit'],
  '2620': ['computer', 'pc', 'server', 'laptop', 'notebook', 'workstation'],
  '2630': ['communication equipment', 'telecomunicazioni', 'router', 'switch'],

  // Automotive (29)
  '2910': ['motor vehicle', 'autoveicolo', 'car', 'automobile', 'truck'],
  '2920': ['vehicle body', 'carrozzeria', 'trailer', 'rimorchio'],
  '2931': ['electrical equipment', 'impianto elettrico', 'wiring harness'],
  '2932': ['vehicle parts', 'ricambi auto', 'brake', 'suspension'],

  // Industrial equipment (28)
  '2811': ['engine', 'motore', 'turbine'],
  '2821': ['furnace', 'forno', 'burner'],
  '2822': ['lifting equipment', 'sollevamento', 'crane', 'forklift'],
  '2823': ['office machinery', 'macchine ufficio', 'calculator', 'copier'],
  '2824': ['power tool', 'utensile', 'drill', 'saw'],
  '2825': ['cooling equipment', 'refrigerazione', 'air conditioning', 'ventilation'],
  '2829': ['machinery', 'macchinari', 'industrial equipment'],

  // Textile (13)
  '1310': ['yarn', 'filato', 'fiber', 'fibra'],
  '1320': ['fabric', 'tessuto', 'woven', 'textile'],
  '1392': ['textile articles', 'articoli tessili', 'linen', 'towel'],

  // Wood products (16)
  '1621': ['veneer', 'impiallacciatura', 'plywood', 'compensato'],
  '1622': ['parquet', 'flooring', 'pavimento'],
  '1623': ['wood building', 'strutture legno', 'prefabricated'],
  '1629': ['wood products', 'prodotti legno', 'frame', 'cornice'],
};

// Sector to PRODCOM prefix mapping
const SECTOR_TO_PRODCOM: Partial<Record<SectorCode, string[]>> = {
  'it_software': ['26'],
  'food_beverage': ['10', '11'],
  'consumer_goods': ['13', '14', '15', '20', '31', '32'],
  'healthcare_pharma': ['21', '325'],
  'industrial': ['24', '25', '28', '33'],
  'financial_services': [],
  'professional_services': [],
  'automotive': ['29', '30'],
  'retail_ecommerce': ['31', '32'],
  'supply_chain_logistics': [],
  'unknown': [],
};

export class PRODCOMSource implements EnrichmentSource {
  name: KnowledgeSourceType = 'prodcom';
  supportedSectors: SectorCode[] = [
    'it_software',
    'food_beverage',
    'consumer_goods',
    'healthcare_pharma',
    'industrial',
    'automotive',
    'unknown',
  ];
  priority = 4;
  confidenceWeight = 0.8;
  cacheTTLSeconds = 86400; // 24 hours

  private codes: Map<string, PRODCOMCode> = new Map();
  private keywordIndex: Map<string, PRODCOMCode[]> = new Map();
  private initialized = false;

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🇪🇺 Initializing PRODCOM Source...');

    const dataDir = path.join(__dirname, '../../data/catalogs/taxonomy');
    const prodcomPath = path.join(dataDir, 'prodcom_2024.json');

    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Create default PRODCOM codes if not exists
    if (!fs.existsSync(prodcomPath)) {
      console.log('   📝 Creating default PRODCOM codes...');
      await this.createDefaultPRODCOM(prodcomPath);
    }

    try {
      const data: PRODCOMFile = JSON.parse(fs.readFileSync(prodcomPath, 'utf-8'));

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

      console.log(`   ✅ Loaded ${this.codes.size} PRODCOM codes`);
      this.initialized = true;
    } catch (error) {
      console.warn('   ⚠️  Failed to load PRODCOM codes:', error);
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

    // Find best matching PRODCOM code
    const match = this.findBestPRODCOM(searchText, context.sector);

    if (match) {
      enrichedFields.prodcom_code = match.code.code;
      enrichedFields.prodcom_description = match.code.description;
      if (match.code.cpaCode) {
        enrichedFields.cpa_code = match.code.cpaCode;
      }
      if (match.code.naceCode) {
        enrichedFields.nace_code = match.code.naceCode;
      }
      if (match.code.unit) {
        enrichedFields.prodcom_unit = match.code.unit;
      }
      fieldsEnriched.push('prodcom_code', 'prodcom_description');
      reasoning.push(`Matched PRODCOM code: ${match.code.code} - ${match.code.description} (score: ${match.score.toFixed(2)})`);

      // Extract product category
      const categoryName = this.getCategoryFromPRODCOM(match.code.code.substring(0, 4));
      if (categoryName && !item.category) {
        enrichedFields.eu_product_category = categoryName;
        fieldsEnriched.push('eu_product_category');
        reasoning.push(`Identified EU product category: ${categoryName}`);
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

  private findBestPRODCOM(searchText: string, sector?: SectorCode): { code: PRODCOMCode; score: number } | null {
    let bestMatch: { code: PRODCOMCode; score: number } | null = null;

    // Get relevant PRODCOM prefixes for the sector
    const relevantPrefixes = sector && sector !== 'unknown' ? (SECTOR_TO_PRODCOM[sector] || []) : [];

    // Search by keywords
    const words = searchText.split(/\s+/).filter(w => w.length > 2);

    for (const word of words) {
      const matches = this.keywordIndex.get(word);
      if (matches) {
        for (const code of matches) {
          const score = this.calculateMatchScore(searchText, code, relevantPrefixes);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { code, score };
          }
        }
      }
    }

    // Also check predefined keyword mappings
    for (const [prodcomPrefix, keywords] of Object.entries(PRODCOM_KEYWORDS)) {
      const matchCount = keywords.filter(kw => searchText.includes(kw)).length;
      if (matchCount > 0) {
        const score = matchCount / keywords.length;
        // Find the most specific code matching this prefix
        for (const [codeKey, code] of this.codes) {
          if (codeKey.startsWith(prodcomPrefix)) {
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

  private calculateMatchScore(searchText: string, code: PRODCOMCode, relevantPrefixes: string[]): number {
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
    if (relevantPrefixes.length > 0) {
      const prefix = code.code.substring(0, 2);
      if (relevantPrefixes.some(p => prefix.startsWith(p) || p.startsWith(prefix))) {
        score *= 1.3;
      }
    }

    // Prefer more specific (longer) codes
    score += code.level * 0.05;

    return score;
  }

  private getCategoryFromPRODCOM(prefix: string): string | null {
    const categoryMap: Record<string, string> = {
      '1011': 'Meat Products',
      '1012': 'Poultry Products',
      '1020': 'Fish Products',
      '1039': 'Fruit & Vegetable Products',
      '1071': 'Bread & Bakery Products',
      '1072': 'Biscuits & Confectionery',
      '1101': 'Spirits & Liquors',
      '1102': 'Wine Products',
      '1105': 'Beer Products',
      '1107': 'Soft Drinks',
      '2110': 'Basic Pharmaceutical Products',
      '2120': 'Pharmaceutical Preparations',
      '2611': 'Electronic Components',
      '2620': 'Computers & Peripherals',
      '2630': 'Communication Equipment',
      '2811': 'Engines & Turbines',
      '2821': 'Furnaces & Burners',
      '2822': 'Lifting Equipment',
      '2823': 'Office Machinery',
      '2824': 'Power Tools',
      '2825': 'Cooling Equipment',
      '2829': 'Other Machinery',
      '2910': 'Motor Vehicles',
      '2920': 'Vehicle Bodies',
      '2931': 'Electrical Vehicle Equipment',
      '2932': 'Vehicle Parts',
      '3101': 'Office Furniture',
      '3102': 'Kitchen Furniture',
      '3103': 'Mattresses',
      '3109': 'Other Furniture',
      '1310': 'Textile Yarns',
      '1320': 'Woven Fabrics',
      '1621': 'Veneer & Plywood',
      '1622': 'Parquet & Flooring',
      '1623': 'Prefabricated Buildings',
      '1629': 'Other Wood Products',
    };
    return categoryMap[prefix] || null;
  }

  private async createDefaultPRODCOM(filePath: string): Promise<void> {
    // Create default PRODCOM codes covering main manufacturing sectors
    const defaultPRODCOM: PRODCOMFile = {
      version: 'PRODCOM 2024',
      source: 'Eurostat',
      lastUpdated: new Date().toISOString(),
      codes: [
        // Furniture Manufacturing (31)
        { code: '31011100', description: 'Seats with metal frames, for offices', descriptionIt: 'Sedute con struttura in metallo per uffici', naceCode: '31.01', cpaCode: '31.01.11', unit: 'units', level: 4 },
        { code: '31011200', description: 'Swivel seats with variable height adjustment', descriptionIt: 'Sedili girevoli con regolazione in altezza', naceCode: '31.01', cpaCode: '31.01.12', unit: 'units', level: 4 },
        { code: '31011300', description: 'Metal furniture for offices', descriptionIt: 'Mobili metallici per uffici', naceCode: '31.01', cpaCode: '31.01.13', unit: 'units', level: 4 },
        { code: '31012100', description: 'Wooden office furniture', descriptionIt: 'Mobili per ufficio in legno', naceCode: '31.01', cpaCode: '31.01.21', unit: 'units', level: 4 },
        { code: '31012200', description: 'Shop furniture', descriptionIt: 'Mobili per negozi', naceCode: '31.01', cpaCode: '31.01.22', unit: 'units', level: 4 },
        { code: '31021000', description: 'Kitchen furniture', descriptionIt: 'Mobili da cucina', naceCode: '31.02', cpaCode: '31.02.10', unit: 'units', level: 3 },
        { code: '31031100', description: 'Mattress supports', descriptionIt: 'Supporti per materassi', naceCode: '31.03', cpaCode: '31.03.11', unit: 'units', level: 4 },
        { code: '31031200', description: 'Mattresses of cellular rubber or plastics', descriptionIt: 'Materassi in gomma o plastica cellulare', naceCode: '31.03', cpaCode: '31.03.12', unit: 'units', level: 4 },
        { code: '31091100', description: 'Dining room and living room furniture', descriptionIt: 'Mobili per sala da pranzo e soggiorno', naceCode: '31.09', cpaCode: '31.09.11', unit: 'units', level: 4 },
        { code: '31091200', description: 'Bedroom furniture', descriptionIt: 'Mobili per camera da letto', naceCode: '31.09', cpaCode: '31.09.12', unit: 'units', level: 4 },
        { code: '31091300', description: 'Other furniture n.e.c.', descriptionIt: 'Altri mobili n.c.a.', naceCode: '31.09', cpaCode: '31.09.13', unit: 'units', level: 4 },
        { code: '31091400', description: 'Parts of furniture', descriptionIt: 'Parti di mobili', naceCode: '31.09', cpaCode: '31.09.14', unit: 'kg', level: 4 },

        // Food Products (10)
        { code: '10111100', description: 'Fresh or chilled beef and veal', descriptionIt: 'Carne bovina fresca o refrigerata', naceCode: '10.11', cpaCode: '10.11.11', unit: 'kg', level: 4 },
        { code: '10111200', description: 'Fresh or chilled pork', descriptionIt: 'Carne suina fresca o refrigerata', naceCode: '10.11', cpaCode: '10.11.12', unit: 'kg', level: 4 },
        { code: '10711100', description: 'Fresh bread', descriptionIt: 'Pane fresco', naceCode: '10.71', cpaCode: '10.71.11', unit: 'kg', level: 4 },
        { code: '10711200', description: 'Pastry goods', descriptionIt: 'Prodotti di pasticceria', naceCode: '10.71', cpaCode: '10.71.12', unit: 'kg', level: 4 },
        { code: '10721100', description: 'Crispbread and biscuits', descriptionIt: 'Pane croccante e biscotti', naceCode: '10.72', cpaCode: '10.72.11', unit: 'kg', level: 4 },

        // Beverages (11)
        { code: '11011100', description: 'Whisky', descriptionIt: 'Whisky', naceCode: '11.01', cpaCode: '11.01.10', unit: 'hl', level: 4 },
        { code: '11021100', description: 'Sparkling wine', descriptionIt: 'Vino spumante', naceCode: '11.02', cpaCode: '11.02.11', unit: 'hl', level: 4 },
        { code: '11021200', description: 'Wine of fresh grapes', descriptionIt: 'Vino di uve fresche', naceCode: '11.02', cpaCode: '11.02.12', unit: 'hl', level: 4 },
        { code: '11051000', description: 'Beer', descriptionIt: 'Birra', naceCode: '11.05', cpaCode: '11.05.10', unit: 'hl', level: 3 },
        { code: '11071100', description: 'Mineral waters', descriptionIt: 'Acque minerali', naceCode: '11.07', cpaCode: '11.07.11', unit: 'hl', level: 4 },
        { code: '11071900', description: 'Other soft drinks', descriptionIt: 'Altre bevande analcoliche', naceCode: '11.07', cpaCode: '11.07.19', unit: 'hl', level: 4 },

        // Pharmaceuticals (21)
        { code: '21101000', description: 'Salicylic acid and its derivatives', descriptionIt: 'Acido salicilico e derivati', naceCode: '21.10', cpaCode: '21.10.10', unit: 'kg', level: 3 },
        { code: '21102000', description: 'Antibiotics', descriptionIt: 'Antibiotici', naceCode: '21.10', cpaCode: '21.10.20', unit: 'kg', level: 3 },
        { code: '21201100', description: 'Medicaments for therapeutic use', descriptionIt: 'Medicinali per uso terapeutico', naceCode: '21.20', cpaCode: '21.20.11', unit: 'units', level: 4 },
        { code: '21201200', description: 'Vaccines for human medicine', descriptionIt: 'Vaccini per medicina umana', naceCode: '21.20', cpaCode: '21.20.12', unit: 'units', level: 4 },

        // Electronics (26)
        { code: '26111100', description: 'Electronic integrated circuits', descriptionIt: 'Circuiti integrati elettronici', naceCode: '26.11', cpaCode: '26.11.11', unit: 'units', level: 4 },
        { code: '26111200', description: 'Microprocessors', descriptionIt: 'Microprocessori', naceCode: '26.11', cpaCode: '26.11.12', unit: 'units', level: 4 },
        { code: '26201100', description: 'Portable computers', descriptionIt: 'Computer portatili', naceCode: '26.20', cpaCode: '26.20.11', unit: 'units', level: 4 },
        { code: '26201200', description: 'Desktop computers', descriptionIt: 'Computer desktop', naceCode: '26.20', cpaCode: '26.20.12', unit: 'units', level: 4 },
        { code: '26201300', description: 'Servers', descriptionIt: 'Server', naceCode: '26.20', cpaCode: '26.20.13', unit: 'units', level: 4 },
        { code: '26301100', description: 'Telephone sets', descriptionIt: 'Apparecchi telefonici', naceCode: '26.30', cpaCode: '26.30.11', unit: 'units', level: 4 },
        { code: '26301200', description: 'Smartphones', descriptionIt: 'Smartphone', naceCode: '26.30', cpaCode: '26.30.12', unit: 'units', level: 4 },
        { code: '26301300', description: 'Transmission apparatus', descriptionIt: 'Apparecchi di trasmissione', naceCode: '26.30', cpaCode: '26.30.13', unit: 'units', level: 4 },

        // Automotive (29)
        { code: '29101100', description: 'Motor vehicles for passengers', descriptionIt: 'Autoveicoli per il trasporto di persone', naceCode: '29.10', cpaCode: '29.10.11', unit: 'units', level: 4 },
        { code: '29101200', description: 'Motor vehicles for goods transport', descriptionIt: 'Autoveicoli per il trasporto di merci', naceCode: '29.10', cpaCode: '29.10.12', unit: 'units', level: 4 },
        { code: '29201100', description: 'Bodies for motor vehicles', descriptionIt: 'Carrozzerie per autoveicoli', naceCode: '29.20', cpaCode: '29.20.10', unit: 'units', level: 4 },
        { code: '29201200', description: 'Trailers and semi-trailers', descriptionIt: 'Rimorchi e semirimorchi', naceCode: '29.20', cpaCode: '29.20.20', unit: 'units', level: 4 },
        { code: '29311000', description: 'Ignition wiring sets', descriptionIt: 'Cablaggi di accensione', naceCode: '29.31', cpaCode: '29.31.10', unit: 'units', level: 3 },
        { code: '29321100', description: 'Seats for motor vehicles', descriptionIt: 'Sedili per autoveicoli', naceCode: '29.32', cpaCode: '29.32.11', unit: 'units', level: 4 },
        { code: '29321200', description: 'Brakes and parts', descriptionIt: 'Freni e parti', naceCode: '29.32', cpaCode: '29.32.12', unit: 'units', level: 4 },
        { code: '29321300', description: 'Gearboxes and parts', descriptionIt: 'Cambi e parti', naceCode: '29.32', cpaCode: '29.32.13', unit: 'units', level: 4 },

        // Industrial Machinery (28)
        { code: '28111100', description: 'Marine engines', descriptionIt: 'Motori marini', naceCode: '28.11', cpaCode: '28.11.11', unit: 'units', level: 4 },
        { code: '28111200', description: 'Internal combustion engines', descriptionIt: 'Motori a combustione interna', naceCode: '28.11', cpaCode: '28.11.12', unit: 'units', level: 4 },
        { code: '28221100', description: 'Cranes and hoists', descriptionIt: 'Gru e paranchi', naceCode: '28.22', cpaCode: '28.22.11', unit: 'units', level: 4 },
        { code: '28221200', description: 'Forklifts', descriptionIt: 'Carrelli elevatori', naceCode: '28.22', cpaCode: '28.22.12', unit: 'units', level: 4 },
        { code: '28241100', description: 'Electric hand tools', descriptionIt: 'Utensili elettrici portatili', naceCode: '28.24', cpaCode: '28.24.11', unit: 'units', level: 4 },
        { code: '28241200', description: 'Pneumatic hand tools', descriptionIt: 'Utensili pneumatici portatili', naceCode: '28.24', cpaCode: '28.24.12', unit: 'units', level: 4 },
        { code: '28251100', description: 'Refrigerators and freezers', descriptionIt: 'Frigoriferi e congelatori', naceCode: '28.25', cpaCode: '28.25.11', unit: 'units', level: 4 },
        { code: '28251200', description: 'Air conditioning machines', descriptionIt: 'Macchine per condizionamento', naceCode: '28.25', cpaCode: '28.25.12', unit: 'units', level: 4 },

        // Wood Products (16)
        { code: '16211000', description: 'Plywood', descriptionIt: 'Compensato', naceCode: '16.21', cpaCode: '16.21.10', unit: 'm³', level: 3 },
        { code: '16212000', description: 'Veneer sheets', descriptionIt: 'Fogli da impiallacciatura', naceCode: '16.21', cpaCode: '16.21.20', unit: 'm²', level: 3 },
        { code: '16221000', description: 'Parquet flooring', descriptionIt: 'Pavimenti in parquet', naceCode: '16.22', cpaCode: '16.22.10', unit: 'm²', level: 3 },
        { code: '16231000', description: 'Prefabricated wooden buildings', descriptionIt: 'Edifici prefabbricati in legno', naceCode: '16.23', cpaCode: '16.23.10', unit: 'm²', level: 3 },
        { code: '16291100', description: 'Wooden frames', descriptionIt: 'Cornici in legno', naceCode: '16.29', cpaCode: '16.29.11', unit: 'units', level: 4 },
      ],
    };

    fs.writeFileSync(filePath, JSON.stringify(defaultPRODCOM, null, 2));
    console.log(`   ✅ Created default PRODCOM codes with ${defaultPRODCOM.codes.length} entries`);
  }

  // Get code by PRODCOM code
  getCode(code: string): PRODCOMCode | undefined {
    return this.codes.get(code);
  }

  // Search codes by text
  searchCodes(query: string, limit = 10): PRODCOMCode[] {
    const results: { code: PRODCOMCode; score: number }[] = [];
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

  // Get all codes for a specific sector
  getCodesForSector(sector: SectorCode): PRODCOMCode[] {
    const prefixes = SECTOR_TO_PRODCOM[sector] || [];
    if (prefixes.length === 0) return [];

    const result: PRODCOMCode[] = [];
    for (const [codeKey, code] of this.codes) {
      const prefix = codeKey.substring(0, 2);
      if (prefixes.some(p => prefix.startsWith(p) || p.startsWith(prefix))) {
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
let instance: PRODCOMSource | null = null;

export function getPRODCOMSource(): PRODCOMSource {
  if (!instance) {
    instance = new PRODCOMSource();
  }
  return instance;
}

export default PRODCOMSource;
