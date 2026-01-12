/**
 * CSV Parser Agent
 *
 * Specialized agent for extracting structured data from CSV/Excel files.
 */

import { v4 as uuidv4 } from 'uuid';
import { parse } from 'csv-parse/sync';

export interface CSVParserInput {
  fileBuffer: Buffer;
  fileName: string;
  userContext?: string;
  language?: 'it' | 'en' | 'auto';
}

export interface RawExtractedItem {
  name: string;
  description?: string | null;
  rawType?: string | null;
  rawStatus?: string | null;
  rawPriority?: string | null;
  budget?: number | null;
  owner?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  technologies?: string[] | null;
  stakeholders?: string[] | null;
  dependencies?: string[] | null;
  risks?: string[] | null;
  kpis?: string[] | null;
  rawData?: Record<string, unknown> | null;
  id?: string;
}

export interface CSVParserOutput {
  success: boolean;
  items: RawExtractedItem[];
  rowCount: number;
  columnCount: number;
  headers: string[];
  extractionNotes: string[];
  confidence: number;
  processingTime: number;
}

/**
 * Parse CSV file and extract items
 * Each row = 1 item
 */
export async function parseCSV(input: CSVParserInput): Promise<CSVParserOutput> {
  const startTime = Date.now();

  try {
    console.log(`📄 Parsing CSV: ${input.fileName}`);

    const parseNotes: string[] = [];
    const sample = input.fileBuffer.toString('utf8', 0, 4096);

    if (looksLikeHtml(sample)) {
      return {
        success: false,
        items: [],
        rowCount: 0,
        columnCount: 0,
        headers: [],
        extractionNotes: ['Input appears to be HTML, not CSV'],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    const delimiter = detectDelimiter(sample);
    let records: Record<string, string>[];

    try {
      records = parse(input.fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true, // Handle UTF-8 BOM
        delimiter,
      }) as Record<string, string>[];
    } catch (error) {
      records = parse(input.fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
        bom: true, // Handle UTF-8 BOM
        delimiter,
      }) as Record<string, string>[];
      parseNotes.push('Relaxed quotes to parse malformed CSV.');
    }

    if (records.length === 0) {
      return {
        success: false,
        items: [],
        rowCount: 0,
        columnCount: 0,
        headers: [],
        extractionNotes: [...parseNotes, 'CSV file is empty or has no valid rows'],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    const headers = Object.keys(records[0]);
    console.log(`   Found ${records.length} rows with ${headers.length} columns`);
    console.log(`   Headers: ${headers.join(', ')}`);

    // Detect name column (most important field)
    const nameColumn = detectNameColumn(headers);
    const descriptionColumn = detectDescriptionColumn(headers);
    const brandColumn = detectBrandColumn(headers);
    const priceColumn = detectPriceColumn(headers);
    const categoryColumn = detectCategoryColumn(headers);

    console.log(`   Detected columns:`);
    if (nameColumn) console.log(`      - Name: "${nameColumn}"`);
    if (descriptionColumn) console.log(`      - Description: "${descriptionColumn}"`);
    if (brandColumn) console.log(`      - Brand: "${brandColumn}"`);
    if (priceColumn) console.log(`      - Price: "${priceColumn}"`);
    if (categoryColumn) console.log(`      - Category: "${categoryColumn}"`);

    const items: RawExtractedItem[] = [];
    const notes: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      // Get name (required field)
      const name = nameColumn ? row[nameColumn]?.trim() : Object.values(row)[0]?.trim();
      if (!name) {
        notes.push(`Row ${i + 1}: Skipped - no name found`);
        continue;
      }

      // Build item
      const item: RawExtractedItem = {
        id: uuidv4(),
        name,
        description: descriptionColumn ? row[descriptionColumn]?.trim() : null,
        rawData: {
          brand: brandColumn ? row[brandColumn]?.trim() : undefined,
          category: categoryColumn ? row[categoryColumn]?.trim() : undefined,
          ...row, // Include all columns in rawData
        },
      };

      // Try to extract price/budget
      if (priceColumn) {
        const priceStr = row[priceColumn]?.trim();
        const price = extractNumber(priceStr);
        if (price !== null) {
          item.budget = price;
        }
      }

      items.push(item);
    }

    console.log(`✅ Extracted ${items.length} items from CSV`);

    return {
      success: true,
      items,
      rowCount: records.length,
      columnCount: headers.length,
      headers,
      extractionNotes: [...parseNotes, ...notes],
      confidence: nameColumn ? 0.95 : 0.7, // Higher confidence if we found a name column
      processingTime: Date.now() - startTime,
    };

  } catch (error) {
    console.error('❌ CSV Parser error:', error);
    return {
      success: false,
      items: [],
      rowCount: 0,
      columnCount: 0,
      headers: [],
      extractionNotes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Detect which column likely contains the item name
 */
function detectNameColumn(headers: string[]): string | null {
  const namePatterns = [
    /^name$/i,
    /^product.*name$/i,
    /^item.*name$/i,
    /^nome$/i,
    /^prodotto$/i,
    /^title$/i,
    /^titolo$/i,
    /^model$/i,
    /^modello$/i,
  ];

  for (const pattern of namePatterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }

  // Fallback: first column that contains "name" or "nome"
  const fuzzyMatch = headers.find(h => /name|nome|product|prodotto/i.test(h));
  return fuzzyMatch || null;
}

function detectDescriptionColumn(headers: string[]): string | null {
  const patterns = [
    /^description$/i,
    /^descrizione$/i,
    /^desc$/i,
    /^details$/i,
    /^dettagli$/i,
    /^notes$/i,
    /^note$/i,
  ];

  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }

  return headers.find(h => /descr|detail/i.test(h)) || null;
}

function detectBrandColumn(headers: string[]): string | null {
  const patterns = [
    /^brand$/i,
    /^marca$/i,
    /^manufacturer$/i,
    /^produttore$/i,
    /^make$/i,
  ];

  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }

  return null;
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] || '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;

  for (const candidate of candidates) {
    const count = countChar(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

function countChar(input: string, target: string): number {
  let count = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === target) count += 1;
  }
  return count;
}

function looksLikeHtml(sample: string): boolean {
  const lower = sample.toLowerCase();
  return (
    lower.includes('<!doctype') ||
    lower.includes('<html') ||
    lower.includes('<head') ||
    lower.includes('<body') ||
    lower.includes('<table') ||
    lower.includes('<div')
  );
}

function detectPriceColumn(headers: string[]): string | null {
  const patterns = [
    /^price$/i,
    /^prezzo$/i,
    /^cost$/i,
    /^costo$/i,
    /^budget$/i,
    /^amount$/i,
    /^importo$/i,
  ];

  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }

  return headers.find(h => /price|prezzo|cost|costo/i.test(h)) || null;
}

function detectCategoryColumn(headers: string[]): string | null {
  const patterns = [
    /^category$/i,
    /^categoria$/i,
    /^type$/i,
    /^tipo$/i,
    /^class$/i,
    /^classe$/i,
  ];

  for (const pattern of patterns) {
    const match = headers.find(h => pattern.test(h));
    if (match) return match;
  }

  return null;
}

/**
 * Extract numeric value from string (handles €, $, commas, etc.)
 */
function extractNumber(str: string | null | undefined): number | null {
  if (!str) return null;

  // Remove currency symbols and spaces
  const cleaned = str.replace(/[€$£¥,\s]/g, '').replace(',', '.');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export default { parseCSV };
