/**
 * Text Parser Agent
 * 
 * Specialized agent for extracting structured data from free-form text.
 * Uses LLM for intelligent parsing and pattern matching as fallback.
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

// Import shared types
import { RawExtractedItem } from './pdfParserAgent';

export interface TextParserInput {
  text: string;
  userContext?: string;
  language?: 'it' | 'en' | 'auto';
  format?: 'freeform' | 'list' | 'table' | 'auto';
}

export interface TextParserOutput {
  success: boolean;
  items: RawExtractedItem[];
  detectedFormat: string;
  extractionNotes: string[];
  confidence: number;
  processingTime: number;
}

// Format detection patterns
const FORMAT_PATTERNS = {
  table: /\|.*\|.*\|/m,
  numberedList: /^\s*\d+[.)]\s+/m,
  bulletList: /^\s*[-•*]\s+/m,
  csv: /^[^,\n]+(?:,[^,\n]+)+$/m,
};

/**
 * Detect the format of input text
 */
function detectFormat(text: string): 'table' | 'list' | 'csv' | 'freeform' {
  if (FORMAT_PATTERNS.table.test(text)) return 'table';
  if (FORMAT_PATTERNS.csv.test(text)) return 'csv';
  if (FORMAT_PATTERNS.numberedList.test(text) || FORMAT_PATTERNS.bulletList.test(text)) return 'list';
  return 'freeform';
}

/**
 * Parse markdown table
 */
function parseMarkdownTable(text: string): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const lines = text.split('\n').filter(l => l.includes('|'));
  
  if (lines.length < 2) return items;
  
  // First line is headers
  const headers = lines[0]
    .split('|')
    .map(h => h.trim())
    .filter(h => h && !h.match(/^[-:]+$/));
  
  // Skip separator line (index 1)
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map(c => c.trim())
      .filter(c => c);
    
    if (cells.length === 0) continue;
    
    const item: Partial<RawExtractedItem> = {
      rawData: {},
    };
    
    headers.forEach((header, index) => {
      const value = cells[index] || '';
      const headerLower = header.toLowerCase();
      
      if (headerLower.includes('nome') || headerLower.includes('name') || headerLower.includes('titolo')) {
        item.name = value;
      } else if (headerLower.includes('descrizione') || headerLower.includes('description')) {
        item.description = value;
      } else if (headerLower.includes('tipo') || headerLower.includes('type')) {
        item.rawType = value;
      } else if (headerLower.includes('stato') || headerLower.includes('status')) {
        item.rawStatus = value;
      } else if (headerLower.includes('priorit') || headerLower.includes('priority')) {
        item.rawPriority = value;
      } else if (headerLower.includes('budget') || headerLower.includes('costo')) {
        item.budget = parseBudgetFromText(value);
      } else if (headerLower.includes('owner') || headerLower.includes('responsabile')) {
        item.owner = value;
      } else if (item.rawData) {
        item.rawData[header] = value;
      }
    });
    
    if (item.name) {
      items.push(item as RawExtractedItem);
    }
  }
  
  return items;
}

/**
 * Parse list format (numbered or bullet)
 */
function parseList(text: string): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const lines = text.split('\n');
  
  let currentItem: Partial<RawExtractedItem> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if this is a list item start
    const listMatch = trimmed.match(/^(?:\d+[.)]\s*|[-•*]\s*)(.+)$/);
    
    if (listMatch) {
      // Save previous item if exists
      if (currentItem && currentItem.name) {
        items.push({ ...currentItem, id: uuidv4() } as RawExtractedItem);
      }
      
      // Start new item
      const content = listMatch[1];
      currentItem = parseListItemContent(content);
    } else if (currentItem && trimmed) {
      // Continuation of current item (sub-details)
      if (!currentItem.description) {
        currentItem.description = trimmed;
      } else {
        currentItem.description += ' ' + trimmed;
      }
    }
  }
  
  // Don't forget last item
  if (currentItem && currentItem.name) {
    items.push({ ...currentItem, id: uuidv4() } as RawExtractedItem);
  }
  
  return items;
}

/**
 * Parse a single list item content
 */
function parseListItemContent(content: string): Partial<RawExtractedItem> {
  const item: Partial<RawExtractedItem> = { rawData: {} };
  
  // Try to extract name and details
  // Pattern: "Name - description" or "Name: description" or "Name (details)"
  const patterns = [
    /^(.+?)\s*[-–]\s*(.+)$/,
    /^(.+?):\s*(.+)$/,
    /^(.+?)\s*\(([^)]+)\)(.*)$/,
  ];
  
  let matched = false;
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      item.name = match[1].trim();
      item.description = (match[2] + (match[3] || '')).trim();
      matched = true;
      break;
    }
  }
  
  if (!matched) {
    item.name = content.trim();
  }
  
  // Extract budget if present
  item.budget = parseBudgetFromText(content);
  
  // Extract type hints
  const typeHints = extractTypeHints(content);
  if (typeHints) {
    item.rawType = typeHints;
  }
  
  return item;
}

/**
 * Parse CSV format
 */
function parseCSV(text: string): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];
  const lines = text.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) return items;
  
  const headers = lines[0].split(',').map(h => h.trim());
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const item: Partial<RawExtractedItem> = {
      rawData: {},
    };
    
    headers.forEach((header, index) => {
      const value = values[index] || '';
      const headerLower = header.toLowerCase();
      
      if (headerLower.includes('nome') || headerLower.includes('name')) {
        item.name = value;
      } else if (headerLower.includes('descrizione') || headerLower.includes('description')) {
        item.description = value;
      } else if (headerLower.includes('tipo') || headerLower.includes('type')) {
        item.rawType = value;
      } else if (item.rawData) {
        item.rawData[header] = value;
      }
    });
    
    if (item.name) {
      items.push(item as RawExtractedItem);
    }
  }
  
  return items;
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  
  return values;
}

/**
 * Extract type hints from text
 */
function extractTypeHints(text: string): string | null {
  const lower = text.toLowerCase();
  
  if (lower.includes('progetto') || lower.includes('project') || 
      lower.includes('iniziativa') || lower.includes('initiative') ||
      lower.includes('migrazione') || lower.includes('implementazione')) {
    return 'initiative';
  }
  
  if (lower.includes('prodotto') || lower.includes('product') ||
      lower.includes('piattaforma') || lower.includes('platform') ||
      lower.includes('applicazione') || lower.includes('sistema')) {
    return 'product';
  }
  
  if (lower.includes('servizio') || lower.includes('service') ||
      lower.includes('supporto') || lower.includes('hosting') ||
      lower.includes('managed')) {
    return 'service';
  }
  
  return null;
}

/**
 * Parse budget from text
 */
function parseBudgetFromText(text: string): number | undefined {
  const patterns = [
    /€\s*([\d.,]+)\s*(?:k|m|mln)?/i,
    /budget[:\s]*([\d.,]+)\s*(?:k|m|mln|€)?/i,
    /([\d.,]+)\s*(?:euro|€|EUR)/i,
    /([\d.,]+)\s*(?:k|K)\s*€?/,
    /([\d.,]+)\s*(?:m|M|mln)\s*€?/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let value = parseFloat(match[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.'));
      
      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes('k')) {
        value *= 1000;
      } else if (fullMatch.includes('m') || fullMatch.includes('mln')) {
        value *= 1000000;
      }
      
      if (!isNaN(value)) {
        return value;
      }
    }
  }
  
  return undefined;
}

/**
 * Use LLM for freeform text extraction
 */
async function extractWithLLM(text: string, userContext: string): Promise<RawExtractedItem[]> {
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  const prompt = `Sei un analista IT. Estrai tutti i progetti, prodotti e servizi IT dal seguente testo.

CONTESTO: ${userContext || 'Nessun contesto aggiuntivo'}

TESTO:
${text.slice(0, 12000)}

Per ogni elemento trovato, restituisci un JSON array con oggetti contenenti:
- name: nome dell'elemento (obbligatorio)
- description: descrizione (se presente)
- rawType: "initiative", "product", o "service" (se identificabile)
- rawStatus: stato (se menzionato)
- rawPriority: priorità (se menzionata)
- budget: budget in euro come numero (se menzionato)
- owner: responsabile (se menzionato)
- technologies: array di tecnologie menzionate
- startDate: data inizio in formato YYYY-MM-DD (se presente)
- endDate: data fine in formato YYYY-MM-DD (se presente)

NON inventare dati. Se un campo non è presente nel testo, omettilo.
Rispondi SOLO con il JSON array, senza testo aggiuntivo.`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = typeof response.content === 'string' ? response.content : '';
    
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: Partial<RawExtractedItem>) => ({
        ...item,
        id: uuidv4(),
      }));
    }
  } catch (error) {
    console.error('LLM extraction error:', error);
  }
  
  return [];
}

/**
 * Main Text Parser Agent
 */
export async function parseText(input: TextParserInput): Promise<TextParserOutput> {
  const startTime = Date.now();
  
  try {
    const text = input.text.trim();
    
    if (!text || text.length < 10) {
      return {
        success: false,
        items: [],
        detectedFormat: 'empty',
        extractionNotes: ['Input text is empty or too short'],
        confidence: 0,
        processingTime: Date.now() - startTime,
      };
    }

    console.log(`📝 Parsing text (${text.length} chars)...`);
    
    // Step 1: Detect format
    const format = input.format === 'auto' || !input.format
      ? detectFormat(text)
      : input.format;
    
    console.log(`   Format detected: ${format}`);
    
    let items: RawExtractedItem[] = [];
    const notes: string[] = [`Detected format: ${format}`];
    let confidence = 0.7;
    
    // Step 2: Parse based on format
    switch (format) {
      case 'table':
        items = parseMarkdownTable(text);
        notes.push('Parsed as markdown table');
        confidence = 0.85;
        break;
        
      case 'csv':
        items = parseCSV(text);
        notes.push('Parsed as CSV');
        confidence = 0.85;
        break;
        
      case 'list':
        items = parseList(text);
        notes.push('Parsed as list');
        confidence = 0.75;
        break;
        
      case 'freeform':
      default:
        // Use LLM for freeform text
        items = await extractWithLLM(text, input.userContext || '');
        notes.push('Used LLM extraction for freeform text');
        confidence = 0.7;
    }
    
    // Step 3: If structured parsing found nothing, try LLM
    if (items.length === 0 && format !== 'freeform') {
      console.log('   Structured parsing found nothing, trying LLM...');
      items = await extractWithLLM(text, input.userContext || '');
      notes.push('Fallback to LLM after structured parsing failed');
      confidence = 0.6;
    }
    
    // Step 4: Validate and deduplicate
    const uniqueItems = deduplicateItems(items);
    if (uniqueItems.length < items.length) {
      notes.push(`Removed ${items.length - uniqueItems.length} duplicate items`);
    }

    console.log(`✅ Extracted ${uniqueItems.length} items from text`);

    return {
      success: uniqueItems.length > 0,
      items: uniqueItems,
      detectedFormat: format,
      extractionNotes: notes,
      confidence: uniqueItems.length > 0 ? confidence : 0,
      processingTime: Date.now() - startTime,
    };

  } catch (error) {
    console.error('❌ Text Parser error:', error);
    return {
      success: false,
      items: [],
      detectedFormat: 'error',
      extractionNotes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Remove duplicate items based on name similarity
 */
function deduplicateItems(items: RawExtractedItem[]): RawExtractedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.name?.toLowerCase().trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default { parseText };
