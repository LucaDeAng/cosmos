/**
 * PDF Parser Agent
 * 
 * Specialized agent for extracting structured data from PDF documents.
 * Uses pdf-parse for text extraction and GPT for intelligent parsing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import pLimit from 'p-limit';
import { spawnSync } from 'child_process';

// ==================== Model Provider Configuration ====================
type ModelProvider = 'openai' | 'gemini';
const PDF_MODEL_PROVIDER: ModelProvider = (process.env.PDF_MODEL_PROVIDER as ModelProvider) || 'openai';
const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

// ==================== Chunking Configuration ====================
const PDF_CHUNKING_CONFIG = {
  chunkSize: 12000,        // caratteri per chunk (documenti normali)
  chunkSizeTable: 4000,    // 🚀 caratteri per chunk (tabelle - bilanciato)
  overlap: 700,            // overlap tra chunks per non perdere items ai bordi
  maxChunks: 50,           // limite sicurezza
  minTextForChunking: 6000, // usa chunking da 6k chars
  parallelChunks: 5,       // 🚀 numero di chunks da processare in parallelo
  chunkTimeoutMs: 60000,   // ⏱️ timeout per singolo chunk (60 sec) - più tempo per Gemini
};

const PDF_CACHE_DISABLED = process.env.PDF_CACHE_DISABLED === '1';
const PDF_CACHE_DIR = process.env.PDF_CACHE_DIR || path.join(process.cwd(), '.cache', 'pdf');
const PDF_CACHE_MAX_AGE_MS = getEnvNumber('PDF_CACHE_MAX_AGE_MS', 0);
const PDF_PDFPLUMBER_THRESHOLD_BYTES = getEnvNumber('PDF_PDFPLUMBER_THRESHOLD_BYTES', 50 * 1024);
const PDF_TABLE_MIN_ITEMS = getEnvNumber('PDF_TABLE_MIN_ITEMS', 5);

// Raw extracted item schema (before normalization)
// Using nullable() to accept null values from LLM responses
const RawExtractedItemSchema = z.object({
  name: z.string().describe('Nome del progetto/prodotto/servizio'),
  description: z.string().nullable().optional().describe('Descrizione'),
  rawType: z.string().nullable().optional().describe('Tipo come indicato nel documento'),
  rawStatus: z.string().nullable().optional().describe('Stato come indicato nel documento'),
  rawPriority: z.string().nullable().optional().describe('Priorità come indicata nel documento'),
  budget: z.number().nullable().optional().describe('Budget in euro'),
  owner: z.string().nullable().optional().describe('Responsabile/Owner'),
  startDate: z.string().nullable().optional().describe('Data inizio'),
  endDate: z.string().nullable().optional().describe('Data fine'),
  technologies: z.array(z.string()).nullable().optional().describe('Tecnologie menzionate'),
  stakeholders: z.array(z.string()).nullable().optional().describe('Stakeholder coinvolti'),
  dependencies: z.array(z.string()).nullable().optional().describe('Dipendenze'),
  risks: z.array(z.string()).nullable().optional().describe('Rischi identificati'),
  kpis: z.array(z.string()).nullable().optional().describe('KPI menzionati'),
  rawData: z.record(z.string(), z.unknown()).nullable().optional().describe('Altri campi estratti'),
});

const ExtractionResultSchema = z.object({
  items: z.array(RawExtractedItemSchema),
  documentMetadata: z.object({
    title: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    documentType: z.string().nullable().optional(),
    language: z.enum(['it', 'en', 'unknown']).nullable().optional(),
  }).optional(),
  extractionNotes: z.array(z.string()).optional(),
});

export type RawExtractedItem = z.infer<typeof RawExtractedItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export interface PDFParserInput {
  fileBuffer: Buffer;
  fileName: string;
  userContext?: string;
  language?: 'it' | 'en' | 'auto';
  /** 🚀 Fast Mode: Use gpt-4o-mini for all chunks (3x faster, -70% cost, slightly lower accuracy) */
  fastMode?: boolean;
}

export interface PDFParserOutput {
  success: boolean;
  items: RawExtractedItem[];
  rawText: string;
  pageCount: number;
  documentMetadata?: Record<string, unknown>;
  extractionNotes: string[];
  confidence: number;
  processingTime: number;
  chunksProcessed?: number; // numero di chunks processati
  totalChars?: number;      // caratteri totali del documento
}

// ==================== Timeout Helper ====================

/**
 * ⏱️ TIMEOUT WITH FALLBACK
 * Wraps an async operation with a timeout.
 * If the operation times out, returns null so caller can fallback.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label?: string
): Promise<{ result: T; timedOut: false } | { result: null; timedOut: true }> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<{ result: null; timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => {
      if (label) console.log(`   ⏱️  ${label} timed out after ${timeoutMs / 1000}s`);
      resolve({ result: null, timedOut: true });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.then((r) => ({ result: r, timedOut: false as const })),
      timeoutPromise,
    ]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ==================== Smart Model Selection ====================

/**
 * 🚀 SMART MODEL SELECTION
 * Analyzes chunk complexity to choose the optimal model:
 * - gpt-4o: Complex tables, compressed data, nested structures
 * - gpt-4o-mini: Simple content (3x faster, 33x cheaper)
 *
 * Criteria for using gpt-4o:
 * 1. High row count (>40 rows suggests dense tabular data)
 * 2. Compressed/coded data (e.g., SKU codes like "ABC123-XY")
 * 3. Nested table structures (pipes within pipes)
 * 4. Very short lines with many columns (typical of spreadsheets)
 */
function getSmartModelForChunk(text: string, isTableDocument: boolean, fastMode: boolean = false): {
  model: 'gpt-4o' | 'gpt-4o-mini';
  reason: string;
} {
  // 🚀 FAST MODE: Always use gpt-4o-mini (3x faster, -70% cost)
  // Enable via: PDF_FAST_MODE=true or fastMode: true in input
  const useFastMode = fastMode || process.env.PDF_FAST_MODE === 'true';
  if (useFastMode) {
    return { model: 'gpt-4o-mini', reason: '⚡ FAST MODE' };
  }

  // If not a table document at all, always use mini
  if (!isTableDocument) {
    return { model: 'gpt-4o-mini', reason: 'non-table content' };
  }

  if (text.length < 1200) {
    return { model: 'gpt-4o-mini', reason: 'short chunk' };
  }

  // Analyze chunk complexity
  const lines = text.split('\n').filter(l => l.trim());
  const rowCount = lines.length;

  // Check for compressed/coded data patterns (SKUs, product codes, etc.)
  // Matches patterns like: ABC123, XY-456-Z, PROD_001, etc.
  const codedDataPattern = /[A-Z]{2,}[\-_]?\d+[\-_A-Z0-9]*/g;
  const codedMatches = text.match(codedDataPattern) || [];
  const hasCompressedData = codedMatches.length > 30; // More than 30 product codes

  // Check for nested table structures (multiple separators)
  const pipeCount = (text.match(/\|/g) || []).length;
  const tabCount = (text.match(/\t/g) || []).length;
  const hasNestedStructure = pipeCount > rowCount * 3 || tabCount > rowCount * 2;

  // Check for dense spreadsheet-like content (many short lines)
  const avgLineLength = text.length / Math.max(rowCount, 1);
  const isDenseSpreadsheet = rowCount > 40 && avgLineLength < 90;

  // Check for currency/numeric density (many prices/numbers)
  const numericPattern = /[\d€$£¥]\d*[.,]?\d*/g;
  const numericMatches = text.match(numericPattern) || [];
  const numericDensity = numericMatches.length / Math.max(rowCount, 1);
  const isHighlyNumeric = numericDensity > 4; // More than 4 numbers per line on average

  // Decision logic
  if (hasCompressedData) {
    return { model: 'gpt-4o', reason: `compressed/coded data (${codedMatches.length} codes)` };
  }

  if (hasNestedStructure) {
    return { model: 'gpt-4o', reason: 'nested table structure' };
  }

  if (isDenseSpreadsheet && isHighlyNumeric) {
    return { model: 'gpt-4o', reason: `dense numeric spreadsheet (${rowCount} rows)` };
  }

  if (rowCount > 80) {
    return { model: 'gpt-4o', reason: `high row count (${rowCount} rows)` };
  }

  // Default: use faster, cheaper mini model
  return { model: 'gpt-4o-mini', reason: `simple table (${rowCount} rows)` };
}

// ==================== Chunking Utilities ====================

/**
 * Split text into overlapping chunks for processing large documents
 */
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    // Try to find a natural break point (newline, period, space)
    if (endIndex < text.length) {
      // Look for paragraph break first
      const paragraphBreak = text.lastIndexOf('\n\n', endIndex);
      if (paragraphBreak > startIndex + chunkSize * 0.7) {
        endIndex = paragraphBreak + 2;
      } else {
        // Look for sentence end
        const sentenceEnd = text.lastIndexOf('. ', endIndex);
        if (sentenceEnd > startIndex + chunkSize * 0.7) {
          endIndex = sentenceEnd + 2;
        } else {
          // Look for newline
          const newlineBreak = text.lastIndexOf('\n', endIndex);
          if (newlineBreak > startIndex + chunkSize * 0.7) {
            endIndex = newlineBreak + 1;
          }
        }
      }
    }

    chunks.push(text.slice(startIndex, endIndex));

    // Move start index with overlap
    startIndex = endIndex - overlap;

    // Safety: prevent infinite loop
    if (startIndex >= text.length - overlap) {
      break;
    }
  }

  return chunks;
}

function getChunkingConfig(textLength: number, isTableDoc: boolean): { chunkSize: number; overlap: number } {
  const baseChunkSize = isTableDoc ? PDF_CHUNKING_CONFIG.chunkSizeTable : PDF_CHUNKING_CONFIG.chunkSize;
  let chunkSize = baseChunkSize;
  let overlap = PDF_CHUNKING_CONFIG.overlap;

  // 🚀 OTTIMIZZAZIONE: Per tabelle, usa chunks più piccoli per massimizzare parallelismo
  if (isTableDoc) {
    // Tabelle: chunk piccoli (3500 chars) per processare più in parallelo
    chunkSize = baseChunkSize; // già 3500
    overlap = 600;
    console.log(`Table document detected - using chunk size ${chunkSize} chars`);
  } else if (textLength <= 20000) {
    chunkSize = Math.max(baseChunkSize, 14000);
    overlap = Math.min(overlap, 500);
  } else if (textLength <= 40000) {
    chunkSize = Math.max(baseChunkSize, 12000);
    overlap = Math.min(overlap, 800);
  }

  return { chunkSize, overlap };
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const matches1 = new Array(str1.length).fill(false);
  const matches2 = new Array(str2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (matches2[j] || str1[i] !== str2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler modification: boost for common prefix
  let prefix = 0;
  for (let i = 0; i < Math.min(4, str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ==================== Noise Filtering ====================

/**
 * Filter out noise items that are not real products/services
 * Removes: catalog titles, company descriptions, URLs, credits, etc.
 */
const NOISE_PATTERNS = [
  // Catalog/document titles
  /^(catalogo|listino|indice|sommario|contents|index|table of contents|toc)$/i,
  /^(catalogo\s+(prodotti|generale|prezzi|completo))/i,
  /^(listino\s+(prezzi|prodotti|ufficiale))/i,

  // Company descriptions / About sections
  /^(about|chi siamo|company|azienda|la nostra azienda|our company)/i,
  /^(la\s+societ[àa]|the\s+company|mission|vision|storia|history)/i,
  /(anni\s+di\s+esperienza|years\s+of\s+experience)/i,
  /(siamo\s+un'?azienda|we\s+are\s+a\s+company)/i,
  /(specializzat[oia]\s+(nella|nel|in)|specialized\s+in)/i,

  // Editorial/design credits
  /^(design|credits|copyright|progetto\s+grafico|realizzazione)/i,
  /^(stampato|printed|edizione|edition|revisione|revision)/i,
  /(tutti\s+i\s+(diritti|marchi)|all\s+rights\s+reserved)/i,
  /(propriet[àa]\s+dei\s+rispettivi\s+titolari)/i,

  // URLs, emails, contacts
  /^(www\.|http|@|contatti|contacts|tel\.|fax|email)/i,
  /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i,  // Email pattern
  /^(https?:\/\/|www\.)[^\s]+$/i,  // URL pattern

  // Generic headings that aren't products
  /^(cosa\s+offriamo|what\s+we\s+offer|i\s+nostri\s+servizi|our\s+services)$/i,
  /^(come\s+lavoriamo|how\s+we\s+work|metodologia|methodology)$/i,
  /^(globale|professionale|qualit[àa]|quality)$/i,

  // Page elements
  /^(pagina|page)\s*\d+$/i,
  /^\d+\s*\/\s*\d+$/,  // Page numbers like "1/50"
  /^(continua|continued|segue|follows)/i,
];

/**
 * Check if an item name matches noise patterns
 */
function isNoiseItem(name: string): boolean {
  if (!name) return true;

  const trimmedName = name.trim();

  // Length checks
  if (trimmedName.length < 3) return true;  // Too short
  if (trimmedName.length > 300) return true;  // Too long (probably a description)

  // Check against noise patterns
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(trimmedName)) {
      return true;
    }
  }

  // Heuristic: if name has too many words, it's probably a description
  const wordCount = trimmedName.split(/\s+/).length;
  if (wordCount > 25) return true;  // More than 25 words = probably a paragraph

  // Heuristic: if name is all lowercase and very long, likely description
  if (trimmedName === trimmedName.toLowerCase() && trimmedName.length > 100) {
    return true;
  }

  return false;
}

/**
 * Filter noise items from extraction results
 * Returns filtered items and count of removed items
 */
function filterNoiseItems(items: RawExtractedItem[]): { filtered: RawExtractedItem[]; removedCount: number; removedNames: string[] } {
  const filtered: RawExtractedItem[] = [];
  const removedNames: string[] = [];

  for (const item of items) {
    if (isNoiseItem(item.name)) {
      removedNames.push(item.name?.substring(0, 50) || '(empty)');
    } else {
      filtered.push(item);
    }
  }

  if (removedNames.length > 0) {
    console.log(`   🗑️  Filtered ${removedNames.length} noise items: ${removedNames.slice(0, 5).join(', ')}${removedNames.length > 5 ? '...' : ''}`);
  }

  return {
    filtered,
    removedCount: removedNames.length,
    removedNames,
  };
}

// ==================== Deduplication ====================

/**
 * Deduplicate items extracted from multiple chunks
 * Uses Jaro-Winkler similarity on name field
 *
 * @param items - Items to deduplicate
 * @param threshold - Similarity threshold (0.95 = very strict, only near-exact duplicates)
 */
function deduplicateItems(items: RawExtractedItem[], threshold: number = 0.95): RawExtractedItem[] {
  if (items.length <= 1) return items;

  const unique: RawExtractedItem[] = [];
  const seen: Set<string> = new Set();
  let exactDuplicates = 0;
  let similarDuplicates = 0;

  for (const item of items) {
    const normalizedName = item.name.toLowerCase().trim();

    // Check exact match first
    if (seen.has(normalizedName)) {
      exactDuplicates++;
      continue;
    }

    // Check similarity with existing items (very strict threshold to preserve variants)
    let isDuplicate = false;
    for (const existingItem of unique) {
      const similarity = jaroWinklerSimilarity(item.name, existingItem.name);
      if (similarity >= threshold) {
        isDuplicate = true;
        similarDuplicates++;

        // Keep the one with more data (longer description)
        const itemDescLength = (item.description || '').length;
        const existingDescLength = (existingItem.description || '').length;
        if (itemDescLength > existingDescLength) {
          // Replace with more complete item
          const index = unique.indexOf(existingItem);
          unique[index] = item;
        }
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(item);
      seen.add(normalizedName);
    }
  }

  if (exactDuplicates > 0 || similarDuplicates > 0) {
    console.log(`   🔄 Deduplication: ${exactDuplicates} exact, ${similarDuplicates} similar (threshold ${threshold})`);
  }

  return unique;
}

const EXTRACTION_PROMPT = `Sei un esperto analista di prodotti che estrae informazioni strutturate da documenti.

CONTESTO UTENTE (se fornito):
{userContext}

DOCUMENTO DA ANALIZZARE:
{documentText}

ISTRUZIONI:
1. ANALIZZA IL CONTESTO del documento per capire la categoria di prodotti (Automotive, Electronics, Software, Food, Fashion, etc.)
2. Identifica TUTTI i prodotti menzionati nel documento
3. Per ogni prodotto, estrai le informazioni disponibili
4. NON inventare dati - se un campo non è presente, omettilo
5. I prezzi devono essere numeri in euro (converti se necessario)
6. Nel campo "rawType" indica la CATEGORIA REALE del prodotto (es. "automobile", "smartphone", "software", "elettrodomestico")

TIPOLOGIE DI PRODOTTI DA CERCARE:
- Automotive: automobili, veicoli, moto, furgoni
- Electronics: smartphone, computer, TV, elettrodomestici
- Software: applicazioni, piattaforme, SaaS
- Food & Beverage: alimenti, bevande
- Fashion: abbigliamento, accessori
- Industrial: macchinari, attrezzature, detergenti, prodotti per pulizia
- Qualsiasi altro tipo di prodotto fisico o digitale

⚠️ NON ESTRARRE MAI (IMPORTANTE):
- Titoli di sezione o capitolo (es. "CATALOGO PRODOTTI", "LISTINO PREZZI", "INDICE", "SOMMARIO")
- Descrizioni aziendali o "Chi siamo" (es. "La nostra azienda...", "60 anni di esperienza...")
- Crediti editoriali o di design (es. "Progetto grafico: XYZ", "Realizzazione catalogo...")
- URL, email, numeri di telefono, contatti
- Numeri di pagina o footer/header
- Slogan aziendali generici (es. "Globale, Professionale", "Qualità garantita")
- Testo introduttivo o descrittivo che non è un prodotto specifico
- Nomi di aziende da sole (es. "Brescianini&Co") - sono produttori, non prodotti

IMPORTANTE:
- Rispetta SEMPRE il contesto reale del documento
- Se il documento parla di auto → estrai come prodotti automotive
- Se parla di telefoni → estrai come prodotti electronics
- Ogni riga di una tabella = un prodotto separato
- Ogni elemento di un elenco = un prodotto separato
- Estrai solo PRODOTTI REALI con nome specifico (es. "Detergente Pavimenti pH Neutro", non "DETERGENTI")

Rispondi SOLO con JSON valido.`;

const TABLE_EXTRACTION_PROMPT = `Sei un esperto analista che estrae OGNI SINGOLA RIGA da tabelle strutturate.

CONTESTO UTENTE (se fornito):
{userContext}

TABELLA DA ANALIZZARE:
{documentText}

⚠️ REGOLA CRITICA - ESTRAZIONE ESAUSTIVA:
DEVI estrarre OGNI SINGOLA RIGA della tabella come item separato.
NON estrarre solo "esempi" - ESTRAI TUTTO SISTEMATICAMENTE.
Se vedi 100 righe → devi restituire 100 items.
Se vedi 50 righe → devi restituire 50 items.

⚠️ GESTIONE TESTO COMPRESSO (IMPORTANTE):
Il testo può avere colonne SCHIACCIATE senza spazi (PDF mal estratto).
Esempio: "ABARTH500eB2EABARTH202523,0%DA" invece di "ABARTH | 500e | B2E..."
DEVI comunque estrarre OGNI modello anche da testo compresso:
- Cerca pattern di nomi prodotto (es. "500e", "Panda", "Corsa", "Renegade")
- Ogni riga con un nome prodotto = 1 item
- Usa regex mentale per separare i dati compressi

⚠️ GESTIONE BRAND IN TABELLE SEZIONATE:
IMPORTANTE: In tabelle strutturate a sezioni, il BRAND appare solo all'inizio della sezione.
Esempio:
ABARTH500e...
Junior MHEV...
Junior BEV...
FIAT
Panda...
Tipo...

In questo caso:
- "500e", "Junior MHEV", "Junior BEV" = TUTTI brand ABARTH
- "Panda", "Tipo" = TUTTI brand FIAT

REGOLA: Se vedi un modello SENZA brand esplicito, usa il brand dell'ultima riga che conteneva un brand.
NON confondere codici promo (B2E...) con i brand!
Brand comuni: ABARTH, ALFA ROMEO, FIAT, JEEP, LANCIA, CITROEN, OPEL, DS, PEUGEOT, LEAPMOTOR

ISTRUZIONI PER TABELLE:
1. Identifica le COLONNE della tabella (es. Modello, Brand, Prezzo, Sconto, ecc.)
2. Scorri OGNI RIGA della tabella dall'inizio alla fine
3. Per OGNI RIGA, crea un item separato estraendo i valori dalle colonne
4. NON saltare righe - ESTRAI TUTTO
5. Se una riga ha varianti (es. "Corsa Benzina/Hybrid/Electric") → crea UN item per la riga
6. Nel campo "name" metti il nome del prodotto/modello
7. Nel campo "rawData" metti TUTTI i dati della riga - OBBLIGATORIO includere:
   - "brand": il brand corretto (ABARTH, FIAT, etc.) - SEMPRE richiesto!
   - Altri dati: codici, sconti, percentuali, note
8. Nel campo "description" metti eventuali note/dettagli dalla riga
9. IMPORTANTE: Anche se il testo è mal formattato, estrai OGNI prodotto menzionato
10. CRITICO: OGNI item DEVE avere rawData.brand correttamente impostato!

TIPOLOGIE DI TABELLE COMUNI:
- Listini prezzi: ogni riga = 1 prodotto con prezzo
- Cataloghi: ogni riga = 1 modello/variante
- Scontistiche: ogni riga = 1 offerta/promozione
- Inventory: ogni riga = 1 item

ESEMPIO CORRETTO (testo ben formattato):
| Brand | Modello | Sconto |
| FIAT  | Panda   | 16%    |
| FIAT  | 500e    | 12%    |
| JEEP  | Renegade| 25%    |

DEVI restituire 3 items:
1. {"name": "Panda", "rawData": {"brand": "FIAT", "sconto": "16%"}}
2. {"name": "500e", "rawData": {"brand": "FIAT", "sconto": "12%"}}
3. {"name": "Renegade", "rawData": {"brand": "JEEP", "sconto": "25%"}}

ESEMPIO TESTO COMPRESSO (come spesso capita nei PDF):
FIAT500eB2E500E202512,0%DA10,0%DC
Panda16,0%14,0%10,0%
Grande Panda10,0%8,0%8,0%

DEVI comunque estrarre 3 items:
1. {"name": "500e", "rawData": {"brand": "FIAT"}}
2. {"name": "Panda", "rawData": {"brand": "FIAT"}}
3. {"name": "Grande Panda", "rawData": {"brand": "FIAT"}}

⚠️ ERRORE COMUNE DA EVITARE:
❌ {"name": "FIAT - vari modelli", ...}  → SBAGLIATO (troppo generico)
❌ Saltare righe perché il testo è mal formattato → SBAGLIATO
✅ Crea un item per OGNI modello separatamente → CORRETTO
✅ Estrai anche da testo compresso → CORRETTO

⚠️ NON ESTRARRE MAI (righe da ignorare):
- Righe di intestazione tabella (es. "MODELLO | PREZZO | SCONTO")
- Titoli di sezione (es. "CATALOGO PRODOTTI", "LISTINO PREZZI", "INDICE")
- Descrizioni aziendali (es. "La nostra azienda...", "Chi siamo...")
- Crediti editoriali (es. "Progetto grafico: XYZ")
- URL, email, contatti
- Totali o subtotali
- Note a piè pagina
- Slogan generici (es. "Qualità Garantita", "Globale, Professionale")

RICORDA: L'obiettivo è avere UN ITEM PER OGNI RIGA DELLA TABELLA che rappresenta un PRODOTTO REALE.
Rispondi SOLO con JSON valido.`;

/**
 * Detect if text contains structured tables
 * Looks for common table indicators including compressed/malformed tables
 */
function containsTables(text: string): boolean {
  const tableIndicators = [
    // Multiple consecutive lines with pipe separators
    /\|.*\|.*\|.*\n.*\|.*\|.*\|/,
    // Repeated column headers pattern
    /(BRAND|MODELLO|MODEL|NOME|NAME|PREZZO|PRICE|SCONTO|DISCOUNT).*\n.*\n.*\n/i,
    // High density of tabular data (many lines with consistent separators)
    /(\S+\s+\S+\s+\d+[%€$].*\n){5,}/,
    // Table-like spacing (consistent column alignment)
    /(\s{10,}\S+\s{10,}\S+\s{10,}\n){3,}/,
    // COMPRESSED TABLE PATTERNS (PDF text extraction artifacts)
    // Pattern: BrandModelCodePercentages (e.g., "FIAT500eB2E12,0%")
    /([A-Z]{3,}[A-Za-z0-9]+[A-Z0-9]{2,}\d+,\d+%.*\n){3,}/,
    // Pattern: Repeated discount percentages (indicates pricing table)
    /(\d+,\d+%.*\d+,\d+%.*\d+,\d+%.*\n){3,}/,
    // Pattern: Multiple lines with product codes and percentages
    /(B2E[A-Z0-9]+.*\d+,\d+%.*\n){3,}/i,
  ];

  for (const pattern of tableIndicators) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Additional heuristic: count lines that look like table rows
  const lines = text.split('\n');
  let tableRowCount = 0;
  let compressedTableRowCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Traditional table rows (space/tab separated)
    const tokens = trimmed.split(/\s{2,}|\t|\|/);
    if (tokens.length >= 3 && tokens.filter(t => t.length > 0).length >= 3) {
      tableRowCount++;
    }

    // Compressed table rows (indicators: percentages, codes, mixed case)
    if (trimmed.length > 20) {
      const hasPercentages = (trimmed.match(/\d+,\d+%/g) || []).length >= 2;
      const hasPromoCode = /B2E[A-Z0-9]+/i.test(trimmed);
      const hasMixedCase = /[a-z].*[A-Z]|[A-Z].*[a-z]/.test(trimmed);

      if ((hasPercentages && hasPromoCode) || (hasPercentages && hasMixedCase)) {
        compressedTableRowCount++;
      }
    }
  }

  // If > 30% of lines look like table rows, it's probably a table
  const tableRowRatio = tableRowCount / Math.max(lines.length, 1);
  const compressedRatio = compressedTableRowCount / Math.max(lines.length, 1);

  const isTable = tableRowRatio > 0.3 || compressedRatio > 0.15;

  // Log detection details for debugging
  if (isTable) {
    const type = compressedRatio > 0.15 ? 'COMPRESSED' : 'STANDARD';
    console.log(`   📊 Table detected: ${type} (standard: ${(tableRowRatio * 100).toFixed(1)}%, compressed: ${(compressedRatio * 100).toFixed(1)}%)`);
  }

  return isTable;
}

interface PdfPlumberTable {
  headers: string[];
  rows: string[][];
}

interface PdfPlumberResult {
  text: string;
  numPages: number;
  info: Record<string, unknown>;
  tables: PdfPlumberTable[];
}

function getEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getPdfCachePath(buffer: Buffer, cacheKey: string = ''): string {
  const hash = createHash('sha256').update(buffer).update(cacheKey).digest('hex');
  return path.join(PDF_CACHE_DIR, `${hash}.json`);
}

function readPdfCache(buffer: Buffer, cacheKey: string = ''): PDFParserOutput | null {
  if (PDF_CACHE_DISABLED) return null;
  const cachePath = getPdfCachePath(buffer, cacheKey);
  if (!fs.existsSync(cachePath)) return null;
  if (PDF_CACHE_MAX_AGE_MS > 0) {
    const ageMs = Date.now() - fs.statSync(cachePath).mtimeMs;
    if (ageMs > PDF_CACHE_MAX_AGE_MS) return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return parsed?.result || null;
  } catch (error) {
    console.warn('PDF cache read failed:', error);
    return null;
  }
}

function writePdfCache(buffer: Buffer, result: PDFParserOutput, cacheKey: string = ''): void {
  if (PDF_CACHE_DISABLED) return;
  const cachePath = getPdfCachePath(buffer, cacheKey);
  fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });
  const payload = { cachedAt: new Date().toISOString(), result };
  fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findHeaderIndex(headers: string[], patterns: RegExp[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return i;
    }
  }
  return null;
}

function extractNumberFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/\s+/g, '').match(/[\d.,]+/);
  if (!match) return undefined;
  const raw = match[0];
  const normalized = raw.includes('.') && raw.includes(',')
    ? raw.replace(/,/g, '')
    : raw.replace(',', '.');
  const parsed = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildRowData(headers: string[], row: string[]): Record<string, unknown> {
  const rawData: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i] ? headers[i] : `col_${i + 1}`;
    rawData[key] = row[i] ?? '';
  }
  rawData.source = 'pdfplumber-table';
  return rawData;
}

function buildItemsFromTables(tables: PdfPlumberTable[]): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const namePatterns = [/^name$/, /product/, /service/, /software/, /item/, /model/, /prodotto/, /servizio/];
  const categoryPatterns = [/^category$/, /categoria/, /type/, /class/];
  const vendorPatterns = [/vendor/, /provider/, /brand/, /marca/, /fornitore/];
  const pricePatterns = [/price/, /cost/, /prezzo/, /tariffa/, /fee/, /pricing/];
  const descPatterns = [/description/, /descrizione/, /spec/, /feature/, /use case/, /details/, /note/];

  for (const table of tables) {
    const headers = table.headers.map((h) => h || '');
    const nameIndex = findHeaderIndex(headers, namePatterns);
    const categoryIndex = findHeaderIndex(headers, categoryPatterns);
    const vendorIndex = findHeaderIndex(headers, vendorPatterns);
    const priceIndex = findHeaderIndex(headers, pricePatterns);
    const descIndex = findHeaderIndex(headers, descPatterns);
    const headerName = nameIndex !== null ? normalizeHeader(headers[nameIndex]) : '';
    const headerCategory = categoryIndex !== null ? normalizeHeader(headers[categoryIndex]) : '';

    for (const row of table.rows) {
      const name = nameIndex !== null ? row[nameIndex] : row.find((cell) => cell && cell.trim()) || '';
      if (!name || !name.trim()) continue;
      const category = categoryIndex !== null ? row[categoryIndex] : undefined;
      const vendor = vendorIndex !== null ? row[vendorIndex] : undefined;
      const description = descIndex !== null ? row[descIndex] : undefined;
      const priceValue = priceIndex !== null ? extractNumberFromText(row[priceIndex]) : undefined;
      const isService = headerName.includes('service') || headerCategory.includes('service') || (category || '').toLowerCase().includes('service');

      items.push({
        name: name.trim(),
        description: description ? description.trim() : undefined,
        rawType: isService ? 'service' : 'product',
        budget: priceValue,
        owner: vendor ? vendor.trim() : undefined,
        rawData: buildRowData(headers, row),
      });
    }
  }

  return items;
}

/**
 * Fallback extraction using pdfplumber (Python) for text and tables.
 */
function extractPdfWithPdfPlumber(buffer: Buffer, includeTables: boolean): PdfPlumberResult | null {
  const tableBlock = includeTables
    ? [
        '        page_tables = page.extract_tables() or []',
        '        for table in page_tables:',
        '            if not table or len(table) < 2:',
        '                continue',
        '            headers = [(str(cell).strip() if cell is not None else "") for cell in table[0]]',
        '            rows = []',
        '            for row in table[1:]:',
        '                if row is None:',
        '                    continue',
        '                rows.append([(str(cell).strip() if cell is not None else "") for cell in row])',
        '            tables.append({"headers": headers, "rows": rows})',
      ]
    : [];
  const script = [
    'import sys, io, json',
    'try:',
    '    import pdfplumber',
    'except Exception as e:',
    "    sys.stderr.write(f'pdfplumber unavailable: {e}')",
    '    sys.exit(2)',
    'data = sys.stdin.buffer.read()',
    'with pdfplumber.open(io.BytesIO(data)) as pdf:',
    '    pages = len(pdf.pages)',
    '    texts = []',
    '    tables = []',
    '    for page in pdf.pages:',
    '        texts.append(page.extract_text() or "")',
    ...tableBlock,
    '    text = "\\n\\n".join(texts)',
    'print(json.dumps({"pages": pages, "text": text, "tables": tables}))',
  ].join('\n');

  const result = spawnSync('python', ['-c', script], {
    input: buffer,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  if (result.status !== 0 || !result.stdout) {
    if (result.stderr) {
      console.error('pdfplumber fallback error:', result.stderr.toString().trim());
    }
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return {
      text: parsed.text || '',
      numPages: parsed.pages || 0,
      info: { extractedWith: 'pdfplumber' },
      tables: parsed.tables || [],
    };
  } catch (error) {
    console.error('pdfplumber fallback parse error:', error);
    return null;
  }
}

/**
 * Fallback text extraction using pdfplumber (Python) when pdf-parse fails.
 */
function extractTextWithPdfPlumber(buffer: Buffer): { text: string; numPages: number; info: Record<string, unknown> } | null {
  const result = extractPdfWithPdfPlumber(buffer, false);
  if (!result) return null;
  return {
    text: result.text,
    numPages: result.numPages,
    info: result.info,
  };
}

/**
 * Extract text from PDF using pdf-parse (v1.x)
 */
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numPages: number; info: Record<string, unknown> }> {
  // pdf-parse v1.x is a simple function that takes a buffer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  
  try {
    console.log(`📄 Parsing PDF buffer (${buffer.length} bytes)...`);
    
    const data = await pdfParse(buffer);
    
    console.log(`📄 PDF parsed: ${data.numpages} pages, ${data.text.length} chars`);
    
    return {
      text: data.text,
      numPages: data.numpages,
      info: { ...(data.info || {}), extractedWith: 'pdf-parse' },
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    const fallback = extractTextWithPdfPlumber(buffer);
    if (fallback) {
      console.log('Fallback: extracted PDF text with pdfplumber');
      return fallback;
    }
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Use LLM to extract structured data from text (single chunk)
 * @param text - Text chunk to process (should already be sized appropriately)
 * @param userContext - User context for extraction
 * @param language - Language hint
 * @param chunkInfo - Optional chunk info for logging (e.g., "chunk 1/5")
 * @param isTableDoc - Hint that document contains tables (from document-level detection)
 * @param fastMode - Force gpt-4o-mini for all chunks (faster, cheaper)
 */
async function extractWithLLM(
  text: string,
  userContext: string,
  language: string,
  chunkInfo?: string,
  isTableDoc?: boolean,
  fastMode?: boolean
): Promise<ExtractionResult> {
  // Detect if this specific chunk contains tables
  const chunkHasTables = containsTables(text);
  const isTableDocument = isTableDoc || chunkHasTables;

  // 🚀 SMART MODEL SELECTION: Analyze chunk complexity (respects fastMode)
  const { model: modelName, reason: modelReason } = getSmartModelForChunk(text, isTableDocument, fastMode || false);

  const parser = StructuredOutputParser.fromZodSchema(ExtractionResultSchema);

  // Select appropriate prompt based on table detection
  const promptTemplate = isTableDocument ? TABLE_EXTRACTION_PROMPT : EXTRACTION_PROMPT;

  if (chunkInfo) {
    const modeInfo = isTableDocument ? '📊 table mode' : '📄 text mode';
    console.log(`   🤖 ${chunkInfo}: ${modelName} (${modelReason}) - ${modeInfo}`);
  }

  const prompt = promptTemplate
    .replace('{userContext}', userContext || 'Nessun contesto aggiuntivo')
    .replace('{documentText}', text); // No more slicing - text is pre-chunked

  const messages = [
    { role: 'system' as const, content: 'Rispondi sempre in JSON valido secondo lo schema richiesto. NON includere commenti o testo extra, solo JSON puro.' },
    { role: 'user' as const, content: prompt + '\n\nFormato output:\n' + parser.getFormatInstructions() },
  ];

  const timeoutMs = PDF_CHUNKING_CONFIG.chunkTimeoutMs;
  let lastError: Error | null = null;
  let usedModel = modelName;

  // ⏱️ TIMEOUT-BASED EXTRACTION: First try with smart model, fallback to faster model on timeout
  const createLLM = (model: string) => {
    // Read at runtime (after dotenv.config())
    const provider = process.env.PDF_MODEL_PROVIDER || 'openai';
    const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    // 🚀 TURBO MODE: Use Gemini Flash for maximum speed
    if (provider === 'gemini' && geminiKey) {
      const geminiModel = 'gemini-2.0-flash-exp'; // Fastest Gemini model
      console.log(`   🌐 Using Gemini Flash: ${geminiModel}`);
      return new ChatGoogleGenerativeAI({
        model: geminiModel,
        apiKey: geminiKey,
        temperature: 0,
      });
    }
    // Default: OpenAI
    return new ChatOpenAI({ modelName: model, temperature: 0 });
  };

  const attemptExtraction = async (model: string, timeoutLabel?: string): Promise<string | null> => {
    const llm = createLLM(model);
    const invokePromise = llm.invoke(messages);

    if (timeoutLabel) {
      const result = await withTimeout(invokePromise, timeoutMs, timeoutLabel);
      if (result.timedOut) return null;
      const content = typeof result.result.content === 'string'
        ? result.result.content
        : JSON.stringify(result.result.content);
      return content;
    } else {
      const response = await invokePromise;
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }
  };

  // First attempt with smart model + timeout
  let content: string | null = null;
  const providerInfo = PDF_MODEL_PROVIDER === 'gemini' ? ' [Gemini]' : '';
  try {
    content = await attemptExtraction(modelName, chunkInfo);

    // If timeout, fallback to faster model
    if (content === null && modelName === 'gpt-4o') {
      const fallbackModel = PDF_MODEL_PROVIDER === 'gemini' ? 'gemini-flash' : 'gpt-4o-mini';
      console.log(`   ⚡ ${chunkInfo}: Fallback to ${fallbackModel} after timeout...`);
      usedModel = fallbackModel as any;
      content = await attemptExtraction('gpt-4o-mini'); // No timeout for fallback
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  // Retry logic if first attempts failed
  if (!content && !lastError) {
    lastError = new Error('Extraction timed out and fallback failed');
  }

  const maxRetries = 2;
  for (let attempt = 1; attempt <= maxRetries && !content; attempt++) {
    try {
      console.log(`   🔄 Retry ${attempt}/${maxRetries} with gpt-4o...`);
      content = await attemptExtraction('gpt-4o');
      usedModel = 'gpt-4o';
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        console.log(`   ⚠️  Attempt ${attempt} failed, will retry...`);
      }
    }
  }

  if (!content) {
    console.error(`LLM extraction error${chunkInfo ? ` (${chunkInfo})` : ''}:`, lastError);
    return {
      items: [],
      extractionNotes: [`LLM extraction failed: ${lastError?.message || 'Unknown error'}`],
    };
  }

  // Try to parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const result = ExtractionResultSchema.parse(parsed);

      // Apply noise filtering to remove catalog titles, company descriptions, URLs, etc.
      const { filtered, removedCount } = filterNoiseItems(result.items);

      if (chunkInfo) {
        const noiseInfo = removedCount > 0 ? ` (${removedCount} noise filtered)` : '';
        const modelInfo = usedModel !== modelName ? ` [fallback: ${usedModel}]` : '';
        console.log(`   ✓ ${chunkInfo}: ${filtered.length} items extracted${noiseInfo}${modelInfo}`);
      }

      return {
        ...result,
        items: filtered,
        extractionNotes: [
          ...(result.extractionNotes || []),
          ...(removedCount > 0 ? [`Filtered ${removedCount} noise items (titles, descriptions, URLs)`] : []),
          ...(usedModel !== modelName ? [`Used fallback model: ${usedModel}`] : []),
        ],
      };
    } catch (parseError) {
      // Try to recover partial items from malformed JSON
      console.log(`   ⚠️  JSON parse error, attempting recovery...`);
      const recoveredItems = tryRecoverItemsFromMalformedJSON(jsonMatch[0]);
      if (recoveredItems.length > 0) {
        // Also filter recovered items
        const { filtered } = filterNoiseItems(recoveredItems);
        console.log(`   ✓ ${chunkInfo}: Recovered ${filtered.length} items from malformed JSON`);
        return {
          items: filtered,
          extractionNotes: [`Partial extraction from malformed JSON: ${filtered.length} items recovered`],
        };
      }
      return {
        items: [],
        extractionNotes: [`JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`],
      };
    }
  }

  return {
    items: [],
    extractionNotes: ['No valid JSON found in LLM response'],
  };
}

/**
 * Try to recover items from malformed JSON by extracting individual item objects
 * Uses multiple strategies for robust recovery
 */
function tryRecoverItemsFromMalformedJSON(jsonStr: string): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const seenNames = new Set<string>();

  // Strategy 1: Try to fix common JSON errors first
  let fixedJson = jsonStr
    .replace(/,\s*}/g, '}')           // Remove trailing commas before }
    .replace(/,\s*]/g, ']')           // Remove trailing commas before ]
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double
    .replace(/\n/g, ' ')              // Remove newlines
    .replace(/\t/g, ' ');             // Remove tabs

  try {
    const parsed = JSON.parse(fixedJson);
    const itemsArray = parsed.items || parsed;
    if (Array.isArray(itemsArray)) {
      for (const item of itemsArray) {
        if (item.name && !seenNames.has(item.name)) {
          seenNames.add(item.name);
          items.push(item as RawExtractedItem);
        }
      }
      if (items.length > 0) return items;
    }
  } catch {
    // Strategy 1 failed, continue to next
  }

  // Strategy 2: Extract individual item objects with balanced braces
  try {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let itemStart = -1;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        if (depth === 0 || (depth === 1 && itemStart === -1)) {
          itemStart = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 1 && itemStart !== -1) {
          const itemJson = jsonStr.substring(itemStart, i + 1);
          try {
            const item = JSON.parse(itemJson);
            if (item.name && !seenNames.has(item.name)) {
              seenNames.add(item.name);
              items.push(item as RawExtractedItem);
            }
          } catch {
            // Try fixing this individual item
            const fixedItem = itemJson
              .replace(/,\s*}/g, '}')
              .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
            try {
              const item = JSON.parse(fixedItem);
              if (item.name && !seenNames.has(item.name)) {
                seenNames.add(item.name);
                items.push(item as RawExtractedItem);
              }
            } catch {
              // Skip this item
            }
          }
          itemStart = -1;
        }
      }
    }
  } catch {
    // Strategy 2 failed
  }

  // Strategy 3: Line-by-line name extraction as last resort
  if (items.length === 0) {
    const nameRegex = /"name"\s*:\s*"([^"]+)"/g;
    let match;
    while ((match = nameRegex.exec(jsonStr)) !== null) {
      const name = match[1];
      if (name && !seenNames.has(name) && name.length > 2 && name.length < 200) {
        seenNames.add(name);
        items.push({ name } as RawExtractedItem);
      }
    }
  }

  return items;
}

/**
 * Extract items from large documents using chunking
 * Processes text in chunks and deduplicates results
 */
async function extractWithChunking(
  text: string,
  userContext: string,
  language: string,
  fastMode?: boolean
): Promise<{ items: RawExtractedItem[]; chunksProcessed: number; notes: string[] }> {
  // Detect if document contains tables to use appropriate chunk size
  const isTableDoc = containsTables(text);
  const { chunkSize, overlap } = getChunkingConfig(text.length, isTableDoc);
  const { maxChunks } = PDF_CHUNKING_CONFIG;

  if (isTableDoc) {
    console.log(`Table document detected - using chunk size ${chunkSize} chars`);
  }

  // Split text into chunks
  let chunks = splitTextIntoChunks(text, chunkSize, overlap);

  // Apply max chunks limit
  if (chunks.length > maxChunks) {
    console.log(`⚠️  Document has ${chunks.length} chunks, limiting to ${maxChunks}`);
    chunks = chunks.slice(0, maxChunks);
  }

  console.log(`📑 Processing ${chunks.length} chunks (${text.length} chars total)...`);
  console.log(`🚀 PARALLEL MODE: Processing up to ${PDF_CHUNKING_CONFIG.parallelChunks} chunks simultaneously`);

  const allItems: RawExtractedItem[] = [];
  const notes: string[] = [];

  // 🚀 PARALLEL PROCESSING with p-limit for concurrency control
  const limit = pLimit(PDF_CHUNKING_CONFIG.parallelChunks);

  const chunkPromises = chunks.map((chunk, i) =>
    limit(async () => {
      const chunkInfo = `Chunk ${i + 1}/${chunks.length}`;
      const startTime = Date.now();
      const result = await extractWithLLM(chunk, userContext, language, chunkInfo, isTableDoc, fastMode);
      console.log(`   ✓ ${chunkInfo} completed in ${Date.now() - startTime}ms (${result.items.length} items)`);
      return { index: i, result, chunkInfo };
    })
  );

  const results = await Promise.all(chunkPromises);

  // Collect results (maintain order for consistency)
  for (const { result, chunkInfo } of results.sort((a, b) => a.index - b.index)) {
    allItems.push(...result.items);
    if (result.extractionNotes) {
      notes.push(...result.extractionNotes.map(n => `[${chunkInfo}] ${n}`));
    }
  }

  // Deduplicate items from all chunks
  const beforeDedup = allItems.length;
  const deduplicatedItems = deduplicateItems(allItems);
  const afterDedup = deduplicatedItems.length;

  if (beforeDedup > afterDedup) {
    console.log(`🔄 Deduplicated: ${beforeDedup} → ${afterDedup} items (removed ${beforeDedup - afterDedup} duplicates)`);
    notes.push(`Deduplicated ${beforeDedup - afterDedup} items across chunks`);
  }

  return {
    items: deduplicatedItems,
    chunksProcessed: chunks.length,
    notes,
  };
}

/**
 * PROGRESSIVE STREAMING: Extract items chunk-by-chunk
 * 🚀 Now with PARALLEL BATCH processing for 4x faster extraction!
 * Yields items immediately after each batch completes
 * Enables real-time HITL feedback during extraction
 */
export async function* extractWithChunkingProgressive(
  text: string,
  userContext: string,
  language: string,
  hitlContext?: { contextPrompt?: string }
): AsyncGenerator<{
  type: 'chunk_start' | 'chunk_complete' | 'all_complete' | 'batch_start';
  chunkIndex?: number;
  totalChunks?: number;
  items?: RawExtractedItem[];
  notes?: string[];
  batchIndex?: number;
  totalBatches?: number;
}> {
  // Detect if document contains tables to use appropriate chunk size
  const isTableDoc = containsTables(text);
  const { chunkSize, overlap } = getChunkingConfig(text.length, isTableDoc);
  const { maxChunks, parallelChunks } = PDF_CHUNKING_CONFIG;

  if (isTableDoc) {
    console.log(`Table document detected - using chunk size ${chunkSize} chars`);
  }

  // Split text into chunks
  let chunks = splitTextIntoChunks(text, chunkSize, overlap);

  // Apply max chunks limit
  if (chunks.length > maxChunks) {
    console.log(`⚠️  Document has ${chunks.length} chunks, limiting to ${maxChunks}`);
    chunks = chunks.slice(0, maxChunks);
  }

  // Calculate batches for parallel processing
  const totalBatches = Math.ceil(chunks.length / parallelChunks);
  console.log(`📑 Progressive processing: ${chunks.length} chunks in ${totalBatches} batches (${parallelChunks} parallel)...`);
  console.log(`🚀 PARALLEL MODE: ~${Math.round(chunks.length / parallelChunks)}x faster than sequential`);

  const allItemsForDedup: RawExtractedItem[] = [];
  const seenNames = new Set<string>();
  const extractionStartTime = Date.now();

  // 🚀 Process chunks in parallel batches, yielding after each batch
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * parallelChunks;
    const batchEnd = Math.min(batchStart + parallelChunks, chunks.length);
    const batchChunks = chunks.slice(batchStart, batchEnd);

    // Notify batch start
    yield {
      type: 'batch_start',
      batchIndex: batchIdx,
      totalBatches,
      chunkIndex: batchStart,
      totalChunks: chunks.length,
    };

    console.log(`\n📦 Batch ${batchIdx + 1}/${totalBatches}: Processing chunks ${batchStart + 1}-${batchEnd} in parallel...`);
    const batchStartTime = Date.now();

    // Build enhanced context with HITL feedback
    const enhancedContext = hitlContext?.contextPrompt
      ? `${userContext}\n\n${hitlContext.contextPrompt}`
      : userContext;

    // 🚀 Process all chunks in this batch in parallel
    const batchPromises = batchChunks.map(async (chunk, localIdx) => {
      const globalIdx = batchStart + localIdx;
      const chunkInfo = `Chunk ${globalIdx + 1}/${chunks.length}`;
      const chunkStartTime = Date.now();

      const result = await extractWithLLM(chunk, enhancedContext, language, chunkInfo, isTableDoc);

      console.log(`   ✓ ${chunkInfo} done in ${Date.now() - chunkStartTime}ms (${result.items.length} items)`);
      return { globalIdx, chunkInfo, result };
    });

    // Wait for all chunks in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    console.log(`   📦 Batch ${batchIdx + 1} completed in ${Date.now() - batchStartTime}ms`);

    // Process results in order and yield immediately
    for (const { globalIdx, chunkInfo, result } of batchResults.sort((a, b) => a.globalIdx - b.globalIdx)) {
      // Progressive deduplication: only keep items not seen in previous chunks
      const newItems = result.items.filter(item => {
        const itemKey = `${item.name?.toLowerCase() || ''}`.trim();
        if (!itemKey || seenNames.has(itemKey)) {
          return false;
        }
        seenNames.add(itemKey);
        return true;
      });

      allItemsForDedup.push(...result.items);

      const dupCount = result.items.length - newItems.length;
      if (dupCount > 0) {
        console.log(`   🔄 ${chunkInfo}: ${newItems.length} new, ${dupCount} duplicates filtered`);
      }

      // Yield items immediately for each chunk
      yield {
        type: 'chunk_complete',
        chunkIndex: globalIdx,
        totalChunks: chunks.length,
        items: newItems,
        notes: result.extractionNotes?.map(n => `[${chunkInfo}] ${n}`),
      };
    }
  }

  // Final deduplication check across all chunks
  const finalDedup = deduplicateItems(allItemsForDedup);
  const totalTime = Date.now() - extractionStartTime;
  const avgPerChunk = Math.round(totalTime / chunks.length);
  console.log(`✅ Progressive extraction complete: ${finalDedup.length} unique items from ${chunks.length} chunks`);
  console.log(`⏱️  Total: ${totalTime}ms (avg ${avgPerChunk}ms/chunk with parallelism)`);

  yield {
    type: 'all_complete',
    totalChunks: chunks.length,
  };
}

/**
 * Fallback: extract items using pattern matching
 */
function extractWithPatterns(text: string): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  // Pattern for project-like lines
  const projectPatterns = [
    /(?:progetto|project|iniziativa|initiative)\s*[:\-]?\s*(.+)/gi,
    /(?:migrazione|migration)\s+(?:a|to|verso)?\s*(.+)/gi,
    /(?:implementazione|implementation)\s+(?:di|of)?\s*(.+)/gi,
  ];

  // Pattern for budget
  const budgetPattern = /(?:budget|costo|cost)[:\s]*€?\s*([\d.,]+)\s*(?:k|m|mln|€)?/gi;
  
  // Pattern for dates
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;

  for (const line of lines) {
    for (const pattern of projectPatterns) {
      const match = pattern.exec(line);
      if (match) {
        const name = match[1].trim();
        if (name.length > 3 && name.length < 200) {
          // Check for budget in same or nearby lines
          const budgetMatch = budgetPattern.exec(line);
          const budget = budgetMatch ? parseFloat(budgetMatch[1].replace(/[.,]/g, '')) : undefined;
          
          items.push({
            name,
            budget,
            rawData: { sourceLine: line },
          });
        }
      }
      pattern.lastIndex = 0; // Reset regex
    }
  }

  return items;
}

/**
 * Main PDF Parser Agent
 * Automatically uses chunking for large documents (> 15k chars)
 */
export async function parsePDF(input: PDFParserInput): Promise<PDFParserOutput> {
  const startTime = Date.now();

  try {
    const cacheKey = [
      input.language || 'auto',
      input.userContext || '',
      input.fastMode ? '1' : '0',
      process.env.PDF_FAST_MODE === 'true' ? '1' : '0',
    ].join('|');
    const cached = readPdfCache(input.fileBuffer, cacheKey);
    if (cached && cached.success) {
      const cachedNotes = cached.extractionNotes ? [...cached.extractionNotes] : [];
      cachedNotes.push('Cache hit');
      return {
        ...cached,
        processingTime: Date.now() - startTime,
        documentMetadata: { ...(cached.documentMetadata || {}), cacheHit: true },
        extractionNotes: cachedNotes,
      };
    }
    // Step 1: Extract raw text from PDF
    console.log(`📄 Parsing PDF: ${input.fileName}`);
    const preferPdfPlumber = input.fileBuffer.length <= PDF_PDFPLUMBER_THRESHOLD_BYTES;
    let extracted: { text: string; numPages: number; info: Record<string, unknown> } | null = null;
    const tableNotes: string[] = [];

    if (preferPdfPlumber) {
      const pdfPlumberResult = extractPdfWithPdfPlumber(input.fileBuffer, true);
      if (pdfPlumberResult) {
        const tableItemsRaw = buildItemsFromTables(pdfPlumberResult.tables || []);
        if (tableItemsRaw.length > 0) {
          const { filtered, removedCount } = filterNoiseItems(tableItemsRaw);
          const deduped = deduplicateItems(filtered);
          if (removedCount > 0) {
            tableNotes.push(`Filtered ${removedCount} noise items from pdfplumber tables`);
          }
          if (deduped.length >= PDF_TABLE_MIN_ITEMS) {
            const itemsWithIds = deduped.map(item => ({
              ...item,
              id: uuidv4(),
            })) as RawExtractedItem[];
            const extractionNotes = ['Used pdfplumber table extraction'];
            if (removedCount > 0) {
              extractionNotes.push(`Filtered ${removedCount} noise items from pdfplumber tables`);
            }
            const result: PDFParserOutput = {
              success: true,
              items: itemsWithIds,
              rawText: pdfPlumberResult.text || '',
              pageCount: pdfPlumberResult.numPages,
              documentMetadata: {
                ...pdfPlumberResult.info,
                extractedWith: 'pdfplumber-table',
                tableExtraction: true,
              },
              extractionNotes,
              confidence: 0.75,
              processingTime: Date.now() - startTime,
              chunksProcessed: 1,
              totalChars: (pdfPlumberResult.text || '').length,
            };
            writePdfCache(input.fileBuffer, result, cacheKey);
            return result;
          }
          if (deduped.length > 0) {
            tableNotes.push(`pdfplumber table extraction returned ${deduped.length} items (below threshold)`);
          }
        }
        const hasText = pdfPlumberResult.text && pdfPlumberResult.text.trim().length > 0;
        if (hasText || (pdfPlumberResult.tables || []).length > 0) {
          extracted = {
            text: pdfPlumberResult.text,
            numPages: pdfPlumberResult.numPages,
            info: pdfPlumberResult.info,
          };
        }
      }
    }

    const { text, numPages, info } = extracted || await extractTextFromPDF(input.fileBuffer);

    if (!text || text.trim().length < 50) {
      return {
        success: false,
        items: [],
        rawText: text,
        pageCount: numPages,
        extractionNotes: ['PDF contains insufficient text content'],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    let items: RawExtractedItem[] = [];
    let confidence = 0.85;
    const notes: string[] = [];
    if (tableNotes.length > 0) {
      notes.push(...tableNotes);
    }
    let chunksProcessed = 1;
    let documentMetadata: Record<string, unknown> = { ...info };

    // Step 2: Decide extraction strategy based on document size
    const useChunking = text.length > PDF_CHUNKING_CONFIG.minTextForChunking;

    if (useChunking) {
      // Large document: use chunking
      console.log(`🤖 Large document detected (${text.length} chars) - using chunking strategy...`);

      const chunkResult = await extractWithChunking(
        text,
        input.userContext || '',
        input.language || 'auto',
        input.fastMode
      );

      items = chunkResult.items;
      chunksProcessed = chunkResult.chunksProcessed;
      notes.push(...chunkResult.notes);
      notes.push(`Used chunking: ${chunksProcessed} chunks processed`);

    } else {
      // Small document: single extraction (backward compatible)
      console.log(`🤖 Extracting with LLM (${text.length} chars)...`);

      const llmResult = await extractWithLLM(
        text,
        input.userContext || '',
        input.language || 'auto',
        undefined,
        undefined,
        input.fastMode
      );

      items = llmResult.items;
      if (llmResult.extractionNotes) {
        notes.push(...llmResult.extractionNotes);
      }
      if (llmResult.documentMetadata) {
        documentMetadata = { ...documentMetadata, ...llmResult.documentMetadata };
      }
    }

    // Step 3: Fallback to pattern matching if LLM found nothing
    if (items.length === 0) {
      console.log('⚠️ LLM found no items, trying pattern matching...');
      items = extractWithPatterns(text);
      confidence = 0.5;
      notes.push('Used pattern matching fallback');
    }

    // Step 4: Add unique IDs
    items = items.map(item => ({
      ...item,
      id: uuidv4(),
    })) as RawExtractedItem[];

    console.log(`✅ Extracted ${items.length} items from PDF (${chunksProcessed} chunk${chunksProcessed > 1 ? 's' : ''})`);

    const result: PDFParserOutput = {
      success: true,
      items,
      rawText: text,
      pageCount: numPages,
      documentMetadata,
      extractionNotes: notes,
      confidence,
      processingTime: Date.now() - startTime,
      chunksProcessed,
      totalChars: text.length,
    };

    writePdfCache(input.fileBuffer, result, cacheKey);
    return result;

  } catch (error) {
    console.error('❌ PDF Parser error:', error);
    return {
      success: false,
      items: [],
      rawText: '',
      pageCount: 0,
      extractionNotes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      processingTime: Date.now() - startTime,
    };
  }
}

export default { parsePDF };
