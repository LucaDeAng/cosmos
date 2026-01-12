/**
 * Excel Parser Agent
 * 
 * Specialized agent for extracting structured data from Excel/CSV files.
 * Handles multiple sheets, auto-detects structure, and normalizes data.
 */

import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// Import shared types from PDF parser
import { RawExtractedItem, ExtractionResult } from './pdfParserAgent';

export interface ExcelParserInput {
  fileBuffer: Buffer;
  fileName: string;
  userContext?: string;
  targetSheet?: string; // Optional: specific sheet name
  language?: 'it' | 'en' | 'auto';
}

export interface SheetData {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface ExcelParserOutput {
  success: boolean;
  items: RawExtractedItem[];
  sheets: SheetData[];
  extractionNotes: string[];
  confidence: number;
  processingTime: number;
}

// Column name mappings (IT/EN) for auto-detection
const COLUMN_MAPPINGS: Record<string, string[]> = {
  name: ['nome', 'name', 'titolo', 'title', 'progetto', 'project', 'iniziativa', 'initiative', 'descrizione breve'],
  description: ['descrizione', 'description', 'desc', 'note', 'notes', 'dettagli', 'details'],
  type: ['tipo', 'type', 'categoria', 'category', 'tipologia'],
  status: ['stato', 'status', 'fase', 'phase', 'situazione'],
  priority: ['priorità', 'priority', 'urgenza', 'importanza', 'importance'],
  budget: ['budget', 'costo', 'cost', 'investimento', 'investment', 'importo', 'amount', 'valore'],
  owner: ['owner', 'responsabile', 'pm', 'project manager', 'referente', 'sponsor'],
  startDate: ['data inizio', 'start date', 'inizio', 'start', 'avvio', 'dal'],
  endDate: ['data fine', 'end date', 'fine', 'end', 'scadenza', 'deadline', 'al'],
  department: ['dipartimento', 'department', 'area', 'divisione', 'bu', 'business unit'],
  technologies: ['tecnologie', 'technologies', 'tech', 'stack', 'piattaforma', 'platform'],
  risk: ['rischio', 'risk', 'livello rischio', 'risk level'],
  roi: ['roi', 'ritorno', 'return'],
};

/**
 * Normalize column name to standard field
 */
function normalizeColumnName(colName: string): string | null {
  const normalized = colName.toLowerCase().trim();
  
  for (const [standardName, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    if (aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
      return standardName;
    }
  }
  
  return null;
}

/**
 * Parse Excel file and extract sheet data
 */
function parseExcelFile(buffer: Buffer): SheetData[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: SheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to 2D array with raw data
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    }) as unknown[][];

    if (!rawData || rawData.length < 2) {
      continue; // Skip empty or header-only sheets
    }

    // First row as headers
    const headers = (rawData[0] as unknown[])
      .map((h, i) => (h ? String(h).trim() : `Column_${i}`))
      .filter(h => h);

    // Convert rows to objects
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as unknown[];
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
        continue; // Skip empty rows
      }

      const rowObj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (row[index] !== null && row[index] !== undefined) {
          rowObj[header] = row[index];
        }
      });

      if (Object.keys(rowObj).length > 0) {
        rows.push(rowObj);
      }
    }

    sheets.push({
      name: sheetName,
      headers,
      rows,
      rowCount: rows.length,
    });
  }

  return sheets;
}

/**
 * Auto-detect and map columns to standard fields
 */
function mapColumnsToFields(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  for (const header of headers) {
    const standardField = normalizeColumnName(header);
    if (standardField) {
      mapping[header] = standardField;
    }
  }
  
  return mapping;
}

/**
 * Convert a row to RawExtractedItem using column mapping
 */
function rowToExtractedItem(
  row: Record<string, unknown>,
  columnMapping: Record<string, string>
): RawExtractedItem | null {
  const item: Partial<RawExtractedItem> = {
    rawData: {},
  };

  let hasNameOrDescription = false;

  for (const [originalCol, value] of Object.entries(row)) {
    const standardField = columnMapping[originalCol];
    
    if (!standardField) {
      // Store unmapped columns in rawData
      if (item.rawData) {
        item.rawData[originalCol] = value;
      }
      continue;
    }

    switch (standardField) {
      case 'name':
        item.name = String(value);
        hasNameOrDescription = true;
        break;
      case 'description':
        item.description = String(value);
        hasNameOrDescription = true;
        break;
      case 'type':
        item.rawType = String(value);
        break;
      case 'status':
        item.rawStatus = String(value);
        break;
      case 'priority':
        item.rawPriority = String(value);
        break;
      case 'budget':
        item.budget = parseBudget(value);
        break;
      case 'owner':
        item.owner = String(value);
        break;
      case 'startDate':
        item.startDate = parseDate(value);
        break;
      case 'endDate':
        item.endDate = parseDate(value);
        break;
      case 'technologies':
        item.technologies = parseTechnologies(value);
        break;
      case 'risk':
        item.risks = [String(value)];
        break;
      default:
        if (item.rawData) {
          item.rawData[standardField] = value;
        }
    }
  }

  // Only return if we have at least a name or description
  if (!hasNameOrDescription || !item.name) {
    // Try to construct name from other fields
    const possibleName = Object.values(row).find(v => 
      typeof v === 'string' && v.length > 3 && v.length < 200
    );
    if (possibleName) {
      item.name = String(possibleName);
    } else {
      return null;
    }
  }

  return item as RawExtractedItem;
}

/**
 * Parse budget value from various formats
 */
function parseBudget(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    // Remove currency symbols and normalize
    const cleaned = value
      .replace(/[€$£]/g, '')
      .replace(/[.,](?=\d{3})/g, '') // Remove thousand separators
      .replace(',', '.') // Normalize decimal separator
      .trim();
    
    let num = parseFloat(cleaned);
    
    // Handle K/M suffixes
    if (cleaned.toLowerCase().includes('k')) {
      num *= 1000;
    } else if (cleaned.toLowerCase().includes('m')) {
      num *= 1000000;
    }
    
    return isNaN(num) ? undefined : num;
  }
  
  return undefined;
}

/**
 * Parse date value to ISO string
 */
function parseDate(value: unknown): string | undefined {
  if (!value) return undefined;
  
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  
  if (typeof value === 'string') {
    // Try various date formats
    const datePatterns = [
      /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
      /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
    ];
    
    for (const pattern of datePatterns) {
      const match = value.match(pattern);
      if (match) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch {
          // Continue to next pattern
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Parse technologies from string or array
 */
function parseTechnologies(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  
  if (typeof value === 'string') {
    // Split by common separators
    return value
      .split(/[,;|\/]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  
  return undefined;
}

/**
 * Use LLM to help with ambiguous column mapping
 */
async function enhanceExtractionWithLLM(
  sheets: SheetData[],
  userContext: string
): Promise<{ enhancedItems: RawExtractedItem[]; notes: string[] }> {
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  const items: RawExtractedItem[] = [];
  const notes: string[] = [];

  for (const sheet of sheets) {
    if (sheet.rows.length === 0) continue;

    // Check if we have good column mapping
    const columnMapping = mapColumnsToFields(sheet.headers);
    const mappedCount = Object.keys(columnMapping).length;
    const totalColumns = sheet.headers.length;
    
    if (mappedCount >= totalColumns * 0.3) {
      // Good mapping, use direct extraction
      for (const row of sheet.rows) {
        const item = rowToExtractedItem(row, columnMapping);
        if (item) {
          items.push({ ...item, id: uuidv4() } as RawExtractedItem);
        }
      }
      notes.push(`Sheet "${sheet.name}": Direct extraction (${mappedCount}/${totalColumns} columns mapped)`);
    } else {
      // Poor mapping, ask LLM for help
      notes.push(`Sheet "${sheet.name}": Using LLM assistance (only ${mappedCount}/${totalColumns} columns mapped)`);
      
      // Send sample rows to LLM
      const sampleRows = sheet.rows.slice(0, 5);
      const prompt = `Analizza questa tabella Excel e identifica quali colonne contengono informazioni su progetti IT.

Headers: ${JSON.stringify(sheet.headers)}
Sample rows: ${JSON.stringify(sampleRows, null, 2)}

Contesto utente: ${userContext || 'Nessuno'}

Restituisci un JSON con:
{
  "columnMapping": { "original_column": "standard_field" },
  "itemType": "initiative|product|service",
  "notes": ["note about the data"]
}

Standard fields: name, description, type, status, priority, budget, owner, startDate, endDate, technologies, risk`;

      try {
        const response = await llm.invoke([{ role: 'user', content: prompt }]);
        const content = typeof response.content === 'string' ? response.content : '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const llmMapping = JSON.parse(jsonMatch[0]);
          const enhancedColumnMapping = { ...columnMapping, ...llmMapping.columnMapping };
          
          for (const row of sheet.rows) {
            const item = rowToExtractedItem(row, enhancedColumnMapping);
            if (item) {
              if (llmMapping.itemType) {
                item.rawType = llmMapping.itemType;
              }
              items.push({ ...item, id: uuidv4() } as RawExtractedItem);
            }
          }
          
          if (llmMapping.notes) {
            notes.push(...llmMapping.notes);
          }
        }
      } catch (error) {
        notes.push(`LLM enhancement failed for sheet "${sheet.name}": ${error}`);
        // Fallback to basic extraction
        for (const row of sheet.rows) {
          const item = rowToExtractedItem(row, columnMapping);
          if (item) {
            items.push({ ...item, id: uuidv4() } as RawExtractedItem);
          }
        }
      }
    }
  }

  return { enhancedItems: items, notes };
}

/**
 * Main Excel Parser Agent
 */
export async function parseExcel(input: ExcelParserInput): Promise<ExcelParserOutput> {
  const startTime = Date.now();
  
  try {
    console.log(`📊 Parsing Excel: ${input.fileName}`);
    
    // Step 1: Parse Excel file
    const sheets = parseExcelFile(input.fileBuffer);
    
    if (sheets.length === 0) {
      return {
        success: false,
        items: [],
        sheets: [],
        extractionNotes: ['No valid sheets found in Excel file'],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Step 2: Filter to specific sheet if requested
    const targetSheets = input.targetSheet
      ? sheets.filter(s => s.name.toLowerCase() === input.targetSheet!.toLowerCase())
      : sheets;

    if (targetSheets.length === 0) {
      return {
        success: false,
        items: [],
        sheets,
        extractionNotes: [`Sheet "${input.targetSheet}" not found. Available: ${sheets.map(s => s.name).join(', ')}`],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    // Step 3: Extract items with LLM enhancement
    const { enhancedItems, notes } = await enhanceExtractionWithLLM(
      targetSheets,
      input.userContext || ''
    );

    // Step 4: Calculate confidence
    const totalRows = targetSheets.reduce((sum, s) => sum + s.rowCount, 0);
    const extractedRatio = totalRows > 0 ? enhancedItems.length / totalRows : 0;
    const confidence = Math.min(0.9, 0.5 + extractedRatio * 0.4);

    console.log(`✅ Extracted ${enhancedItems.length} items from ${sheets.length} sheets`);

    return {
      success: true,
      items: enhancedItems,
      sheets,
      extractionNotes: notes,
      confidence,
      processingTime: Date.now() - startTime,
    };

  } catch (error) {
    console.error('❌ Excel Parser error:', error);
    return {
      success: false,
      items: [],
      sheets: [],
      extractionNotes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      processingTime: Date.now() - startTime,
    };
  }
}

export default { parseExcel };
