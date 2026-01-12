/**
 * Table Structure Parser
 *
 * Parses recognized table structures into extracted items.
 * Handles complex structures like multi-row headers and merged cells.
 */

import type { TableStructure, TableRow, TableCell, TableHeader } from './tableRecognizer';

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedTableItem {
  rowIndex: number;
  fields: Record<string, unknown>;
  confidence: number;
  metadata: {
    sourceTable: string;
    sourcePage: number;
    isSubtotal: boolean;
    isTotal: boolean;
  };
}

export interface TableParsingResult {
  items: ParsedTableItem[];
  headers: string[];
  parsingStrategy: 'row_based' | 'column_based' | 'pivot';
  confidence: number;
}

// ============================================================================
// MAIN FUNCTION: parseTableStructure
// ============================================================================

/**
 * Parses table structure into individual items
 */
export function parseTableStructure(
  table: TableStructure
): TableParsingResult {
  console.log(`📊 Parsing table ${table.id} (${table.tableType})`);

  let items: ParsedTableItem[] = [];
  let parsingStrategy: TableParsingResult['parsingStrategy'] = 'row_based';

  // Choose parsing strategy based on table type
  if (table.tableType === 'pivot') {
    parsingStrategy = 'pivot';
    items = parsePivotTable(table);
  } else if (table.metadata.isTransposed) {
    parsingStrategy = 'column_based';
    items = parseTransposedTable(table);
  } else {
    parsingStrategy = 'row_based';
    items = parseRowBasedTable(table);
  }

  // Filter out subtotal/total rows if configured
  const dataItems = items.filter(item => !item.metadata.isSubtotal && !item.metadata.isTotal);

  const headers = extractHeaderNames(table.headers);
  const avgConfidence = dataItems.length > 0
    ? dataItems.reduce((sum, item) => sum + item.confidence, 0) / dataItems.length
    : table.confidence;

  console.log(`✅ Parsed ${dataItems.length} items from table`);

  return {
    items: dataItems,
    headers,
    parsingStrategy,
    confidence: avgConfidence,
  };
}

// ============================================================================
// PARSING STRATEGIES
// ============================================================================

/**
 * Parses standard row-based table (most common)
 */
function parseRowBasedTable(table: TableStructure): ParsedTableItem[] {
  const items: ParsedTableItem[] = [];

  for (const row of table.rows) {
    if (row.isHeaderRow) continue;

    const fields: Record<string, unknown> = {};
    let totalConfidence = 0;

    for (const cell of row.cells) {
      const fieldName = cell.mappedHeader || `column_${cell.columnIndex}`;
      fields[fieldName] = cell.value;
      totalConfidence += cell.confidence;
    }

    const avgConfidence = row.cells.length > 0
      ? totalConfidence / row.cells.length
      : 0.5;

    items.push({
      rowIndex: row.rowIndex,
      fields,
      confidence: avgConfidence,
      metadata: {
        sourceTable: table.id,
        sourcePage: table.pageNumber,
        isSubtotal: row.isSubtotalRow,
        isTotal: row.isTotalRow,
      },
    });
  }

  return items;
}

/**
 * Parses transposed table (rows and columns swapped)
 */
function parseTransposedTable(table: TableStructure): ParsedTableItem[] {
  const items: ParsedTableItem[] = [];

  // In transposed table, each column is an item
  const columnCount = table.metadata.totalColumns;

  for (let colIndex = 0; colIndex < columnCount; colIndex++) {
    const fields: Record<string, unknown> = {};
    let totalConfidence = 0;
    let cellCount = 0;

    for (const row of table.rows) {
      if (row.isHeaderRow) continue;

      const cell = row.cells.find(c => c.columnIndex === colIndex);
      if (cell) {
        // First column is usually the field name in transposed tables
        const fieldName = row.cells[0]?.text || `field_${row.rowIndex}`;
        fields[fieldName] = cell.value;
        totalConfidence += cell.confidence;
        cellCount++;
      }
    }

    const avgConfidence = cellCount > 0 ? totalConfidence / cellCount : 0.5;

    items.push({
      rowIndex: colIndex,
      fields,
      confidence: avgConfidence,
      metadata: {
        sourceTable: table.id,
        sourcePage: table.pageNumber,
        isSubtotal: false,
        isTotal: false,
      },
    });
  }

  return items;
}

/**
 * Parses pivot table (both row and column headers)
 */
function parsePivotTable(table: TableStructure): ParsedTableItem[] {
  const items: ParsedTableItem[] = [];

  // In pivot tables, we need to extract both dimensions
  for (const row of table.rows) {
    if (row.isHeaderRow) continue;

    // First cell(s) are usually row headers
    const rowHeaderCells = row.cells.filter(c => c.columnIndex === 0);
    const dataCells = row.cells.filter(c => c.columnIndex > 0);

    for (const dataCell of dataCells) {
      const fields: Record<string, unknown> = {};

      // Add row dimension
      if (rowHeaderCells.length > 0) {
        fields['row_category'] = rowHeaderCells[0].value;
      }

      // Add column dimension
      fields['column_category'] = dataCell.mappedHeader;

      // Add value
      fields['value'] = dataCell.value;

      items.push({
        rowIndex: row.rowIndex,
        fields,
        confidence: dataCell.confidence,
        metadata: {
          sourceTable: table.id,
          sourcePage: table.pageNumber,
          isSubtotal: row.isSubtotalRow,
          isTotal: row.isTotalRow,
        },
      });
    }
  }

  return items;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extracts header names from table headers
 */
function extractHeaderNames(headers: TableHeader[]): string[] {
  return headers.map(h => h.normalizedName);
}

/**
 * Resolves header path for multi-level headers
 */
export function resolveHeaderPath(
  headers: TableHeader[],
  columnIndex: number
): string {
  const relevantHeaders = headers.filter(h =>
    columnIndex >= h.columnIndex &&
    columnIndex < h.columnIndex + h.colSpan
  );

  // Sort by level (0 = top)
  relevantHeaders.sort((a, b) => a.level - b.level);

  // Build path
  return relevantHeaders.map(h => h.text).join(' > ');
}

/**
 * Detects if table has multi-row headers
 */
export function hasMultiRowHeaders(table: TableStructure): boolean {
  const levels = new Set(table.headers.map(h => h.level));
  return levels.size > 1;
}

/**
 * Converts parsed items to RawExtractedItem format (for ingestion pipeline)
 */
export function convertToRawExtractedItems(
  parsedItems: ParsedTableItem[]
): Array<Record<string, unknown>> {
  return parsedItems.map(item => ({
    ...item.fields,
    _extraction_metadata: {
      source_type: 'table',
      source_page: item.metadata.sourcePage,
      source_table: item.metadata.sourceTable,
      row_index: item.rowIndex,
      confidence: item.confidence,
    },
  }));
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  parseTableStructure,
  resolveHeaderPath,
  hasMultiRowHeaders,
  convertToRawExtractedItems,
};
