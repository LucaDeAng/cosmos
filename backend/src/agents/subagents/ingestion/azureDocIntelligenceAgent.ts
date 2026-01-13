/**
 * Azure Document Intelligence Agent
 *
 * Uses Azure AI Document Intelligence (formerly Form Recognizer) for
 * high-accuracy table extraction from PDF documents.
 *
 * Free Tier (F0): 500 pages/month, max 4MB per file
 * Pay-as-you-go (S0): $10/1000 pages for Layout model
 *
 * @see https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence
 */

import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { RawExtractedItem } from './pdfParserAgent';

// ============================================================
// CONFIGURATION
// ============================================================

const AZURE_ENDPOINT = process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT;
const AZURE_KEY = process.env.AZURE_DOC_INTELLIGENCE_KEY;

// Free tier limits
const FREE_TIER_MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const FREE_TIER_MAX_PAGES_PER_REQUEST = 2;

// ============================================================
// TYPES
// ============================================================

export interface AzureExtractionResult {
  success: boolean;
  tables: ExtractedTable[];
  text: string;
  pageCount: number;
  confidence: number;
  processingTime: number;
  warnings: string[];
  usedFreeTier: boolean;
}

export interface ExtractedTable {
  pageNumber: number;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: TableRow[];
  confidence: number;
  boundingRegion?: {
    pageNumber: number;
    polygon: number[];
  };
}

export interface TableRow {
  cells: TableCell[];
  rowIndex: number;
}

export interface TableCell {
  content: string;
  columnIndex: number;
  rowIndex: number;
  columnSpan?: number;
  rowSpan?: number;
  confidence: number;
}

export interface AzureAgentInput {
  fileBuffer: Buffer;
  fileName: string;
  extractTables?: boolean;
  extractText?: boolean;
  useFreeTier?: boolean;
}

// ============================================================
// MAIN FUNCTIONS
// ============================================================

/**
 * Check if Azure Document Intelligence is configured
 */
export function isAzureConfigured(): boolean {
  return !!(AZURE_ENDPOINT && AZURE_KEY);
}

/**
 * Get Azure client instance
 */
function getAzureClient(): DocumentAnalysisClient | null {
  if (!isAzureConfigured()) {
    return null;
  }

  return new DocumentAnalysisClient(
    AZURE_ENDPOINT!,
    new AzureKeyCredential(AZURE_KEY!)
  );
}

/**
 * Extract tables and text from PDF using Azure Document Intelligence
 * Uses the "prebuilt-layout" model for table extraction
 */
export async function extractWithAzure(input: AzureAgentInput): Promise<AzureExtractionResult> {
  const startTime = Date.now();
  const warnings: string[] = [];

  console.log(`\n🔷 Azure Document Intelligence: Processing ${input.fileName}...`);

  // Check configuration
  if (!isAzureConfigured()) {
    console.log('   ⚠️  Azure not configured - skipping');
    return {
      success: false,
      tables: [],
      text: '',
      pageCount: 0,
      confidence: 0,
      processingTime: Date.now() - startTime,
      warnings: ['Azure Document Intelligence not configured. Set AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY.'],
      usedFreeTier: false,
    };
  }

  // Check file size for free tier
  const useFreeTier = input.useFreeTier !== false;
  if (useFreeTier && input.fileBuffer.length > FREE_TIER_MAX_FILE_SIZE) {
    warnings.push(`File size (${(input.fileBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds free tier limit (4MB)`);
    console.log(`   ⚠️  ${warnings[warnings.length - 1]}`);
  }

  try {
    const client = getAzureClient();
    if (!client) {
      throw new Error('Failed to create Azure client');
    }

    console.log(`   📄 Analyzing document (${(input.fileBuffer.length / 1024).toFixed(1)}KB)...`);

    // Use prebuilt-layout for table extraction
    // The SDK automatically detects content type from buffer
    const poller = await client.beginAnalyzeDocument(
      'prebuilt-layout',
      input.fileBuffer
    );

    console.log(`   ⏳ Waiting for analysis to complete...`);
    const result = await poller.pollUntilDone();

    const pageCount = result.pages?.length || 0;
    console.log(`   📊 Analysis complete: ${pageCount} pages`);

    // Extract tables
    const tables: ExtractedTable[] = [];

    if (result.tables && result.tables.length > 0) {
      console.log(`   📋 Found ${result.tables.length} tables`);

      for (const table of result.tables) {
        const extractedTable = convertAzureTable(table);
        tables.push(extractedTable);

        console.log(`      - Table: ${extractedTable.rowCount}x${extractedTable.columnCount} (page ${extractedTable.pageNumber}, conf: ${(extractedTable.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      console.log(`   ℹ️  No tables found in document`);
      warnings.push('No tables detected in document');
    }

    // Extract text
    let fullText = '';
    if (input.extractText !== false) {
      fullText = result.content || '';
      console.log(`   📝 Extracted ${fullText.length} characters of text`);
    }

    // Calculate overall confidence
    const tableConfidences = tables.map(t => t.confidence);
    const avgConfidence = tableConfidences.length > 0
      ? tableConfidences.reduce((a, b) => a + b, 0) / tableConfidences.length
      : 0.5;

    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Azure extraction complete in ${processingTime}ms`);

    return {
      success: true,
      tables,
      text: fullText,
      pageCount,
      confidence: avgConfidence,
      processingTime,
      warnings,
      usedFreeTier: useFreeTier && input.fileBuffer.length <= FREE_TIER_MAX_FILE_SIZE,
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`   ❌ Azure extraction failed:`, errorMessage);

    // Check for specific error types
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      warnings.push('Azure authentication failed. Check your API key.');
    } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      warnings.push('Azure endpoint not found. Check your endpoint URL.');
    } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      warnings.push('Azure rate limit exceeded. Free tier allows 500 pages/month.');
    } else {
      warnings.push(`Azure error: ${errorMessage}`);
    }

    return {
      success: false,
      tables: [],
      text: '',
      pageCount: 0,
      confidence: 0,
      processingTime,
      warnings,
      usedFreeTier: false,
    };
  }
}

/**
 * Convert Azure table format to our ExtractedTable format
 */
function convertAzureTable(azureTable: any): ExtractedTable {
  const cells: TableCell[] = [];
  const headers: string[] = [];
  const rowsMap: Map<number, TableCell[]> = new Map();

  // Process cells
  for (const cell of azureTable.cells || []) {
    const tableCell: TableCell = {
      content: cell.content || '',
      columnIndex: cell.columnIndex || 0,
      rowIndex: cell.rowIndex || 0,
      columnSpan: cell.columnSpan,
      rowSpan: cell.rowSpan,
      confidence: cell.confidence || 0.9,
    };

    cells.push(tableCell);

    // Track rows
    if (!rowsMap.has(tableCell.rowIndex)) {
      rowsMap.set(tableCell.rowIndex, []);
    }
    rowsMap.get(tableCell.rowIndex)!.push(tableCell);

    // First row is typically headers
    if (tableCell.rowIndex === 0) {
      headers[tableCell.columnIndex] = tableCell.content;
    }
  }

  // Convert rows map to array
  const rows: TableRow[] = [];
  const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b);

  for (const rowIndex of sortedRowIndices) {
    const rowCells = rowsMap.get(rowIndex)!;
    rowCells.sort((a, b) => a.columnIndex - b.columnIndex);
    rows.push({ cells: rowCells, rowIndex });
  }

  // Get bounding region
  let boundingRegion;
  if (azureTable.boundingRegions && azureTable.boundingRegions.length > 0) {
    const region = azureTable.boundingRegions[0];
    boundingRegion = {
      pageNumber: region.pageNumber || 1,
      polygon: region.polygon || [],
    };
  }

  return {
    pageNumber: boundingRegion?.pageNumber || 1,
    rowCount: azureTable.rowCount || rows.length,
    columnCount: azureTable.columnCount || headers.length,
    headers,
    rows,
    confidence: cells.length > 0
      ? cells.reduce((sum, c) => sum + c.confidence, 0) / cells.length
      : 0.9,
    boundingRegion,
  };
}

/**
 * Convert Azure extracted tables to RawExtractedItem format
 * for compatibility with existing pipeline
 */
export function tablesToRawItems(tables: ExtractedTable[]): RawExtractedItem[] {
  const items: RawExtractedItem[] = [];

  for (const table of tables) {
    // Skip tables with no data rows (only headers)
    if (table.rows.length <= 1) continue;

    // Detect column indices for common fields
    const headerLower = table.headers.map(h => h.toLowerCase().trim());

    const nameIndex = findColumnIndex(headerLower, ['name', 'nome', 'product', 'prodotto', 'item', 'model', 'modello', 'description', 'descrizione']);
    const typeIndex = findColumnIndex(headerLower, ['type', 'tipo', 'category', 'categoria', 'kind']);
    const statusIndex = findColumnIndex(headerLower, ['status', 'stato', 'state']);
    const priceIndex = findColumnIndex(headerLower, ['price', 'prezzo', 'cost', 'costo', 'budget', 'value', 'valore']);
    const ownerIndex = findColumnIndex(headerLower, ['owner', 'responsabile', 'vendor', 'fornitore', 'brand', 'marca']);
    const descIndex = findColumnIndex(headerLower, ['description', 'descrizione', 'note', 'notes', 'details', 'dettagli']);

    // Process each row (skip header row)
    for (let i = 1; i < table.rows.length; i++) {
      const row = table.rows[i];
      const cellsMap: Map<number, string> = new Map();

      for (const cell of row.cells) {
        cellsMap.set(cell.columnIndex, cell.content);
      }

      // Get name - required field
      let name = '';
      if (nameIndex !== -1 && cellsMap.has(nameIndex)) {
        name = cellsMap.get(nameIndex)!.trim();
      } else {
        // Fallback: use first non-empty cell
        for (let col = 0; col < table.columnCount; col++) {
          const content = cellsMap.get(col)?.trim();
          if (content && content.length > 2) {
            name = content;
            break;
          }
        }
      }

      // Skip rows without a valid name
      if (!name || name.length < 2) continue;

      // Build raw data from all columns
      const rawData: Record<string, unknown> = {
        source: 'azure-doc-intelligence',
        page: table.pageNumber,
        rowIndex: i,
      };

      for (let col = 0; col < table.columnCount; col++) {
        const header = table.headers[col] || `col_${col}`;
        const value = cellsMap.get(col);
        if (value) {
          rawData[header] = value;
        }
      }

      // Extract price/budget
      let budget: number | undefined;
      if (priceIndex !== -1 && cellsMap.has(priceIndex)) {
        const priceStr = cellsMap.get(priceIndex)!;
        const priceMatch = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = parseFloat(priceMatch);
        if (!isNaN(parsed)) {
          budget = parsed;
        }
      }

      const item: RawExtractedItem = {
        name,
        description: descIndex !== -1 ? cellsMap.get(descIndex)?.trim() : undefined,
        rawType: typeIndex !== -1 ? cellsMap.get(typeIndex)?.trim() : undefined,
        rawStatus: statusIndex !== -1 ? cellsMap.get(statusIndex)?.trim() : undefined,
        owner: ownerIndex !== -1 ? cellsMap.get(ownerIndex)?.trim() : undefined,
        budget,
        rawData,
      };

      items.push(item);
    }
  }

  console.log(`   🔄 Converted ${tables.length} tables to ${items.length} raw items`);
  return items;
}

/**
 * Find column index by matching against multiple possible header names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    for (const name of possibleNames) {
      if (header.includes(name)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Quick check if a PDF would benefit from Azure extraction
 * (has potential tables based on text analysis)
 */
export function shouldUseAzure(pdfText: string, confidence: number): boolean {
  // If current extraction confidence is already high, skip Azure
  if (confidence > 0.85) {
    return false;
  }

  // Check for table indicators
  const tableIndicators = [
    /\|.*\|.*\|/,                    // Pipe-separated content
    /\t.*\t.*\t/,                    // Tab-separated content
    /(\d+[.,]\d+%.*){3,}/,           // Multiple percentages
    /([A-Z]{3,}\s+[A-Z]{3,}.*\n){5,}/, // Multiple uppercase rows
  ];

  for (const pattern of tableIndicators) {
    if (pattern.test(pdfText)) {
      return true;
    }
  }

  // Check line structure
  const lines = pdfText.split('\n').filter(l => l.trim());
  const avgLineLength = pdfText.length / Math.max(lines.length, 1);

  // Short, consistent lines suggest tabular data
  if (lines.length > 20 && avgLineLength < 80) {
    return true;
  }

  return false;
}

// ============================================================
// EXPORT
// ============================================================

export default {
  extractWithAzure,
  tablesToRawItems,
  isAzureConfigured,
  shouldUseAzure,
};
