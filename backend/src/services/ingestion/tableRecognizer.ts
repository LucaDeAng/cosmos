/**
 * Advanced Table Recognizer
 *
 * Recognizes and extracts complex table structures from documents:
 * - Multi-row headers
 * - Merged cells (colspan/rowspan)
 * - Nested tables
 * - Pivot tables
 *
 * Uses GPT-4 Vision for structure detection and parsing.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TableStructure {
  id: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  headers: TableHeader[];
  rows: TableRow[];
  mergedCells: MergedCell[];
  tableType: 'simple' | 'multi_header' | 'pivot' | 'nested';
  confidence: number;
  metadata: {
    totalRows: number;
    totalColumns: number;
    hasSubtotals: boolean;
    isTransposed: boolean;
  };
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableHeader {
  text: string;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
  level: number; // 0 = top level, 1 = second level, etc.
  parentHeader?: string;
  normalizedName: string; // Cleaned version for field mapping
}

export interface MergedCell {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  text: string;
  value: unknown;
}

export interface TableRow {
  rowIndex: number;
  cells: TableCell[];
  isHeaderRow: boolean;
  isSubtotalRow: boolean;
  isTotalRow: boolean;
}

export interface TableCell {
  text: string;
  columnIndex: number;
  mappedHeader: string; // Resolved header accounting for merges
  dataType: 'string' | 'number' | 'date' | 'currency' | 'boolean' | 'empty';
  value: unknown;
  confidence: number;
  rowSpan?: number;
  colSpan?: number;
}

// ============================================================================
// MAIN FUNCTION: recognizeTable
// ============================================================================

/**
 * Recognizes table structure from image buffer using GPT-4 Vision
 */
export async function recognizeTable(
  imageBuffer: Buffer,
  pageNumber: number,
  tableId: string
): Promise<TableStructure | null> {
  console.log(`🔍 Recognizing table structure: ${tableId} on page ${pageNumber}`);

  try {
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0,
      maxTokens: 4000,
    });

    const structuredPrompt = buildTableRecognitionPrompt();

    const base64Image = imageBuffer.toString('base64');

    const message = new HumanMessage({
      content: [
        { type: 'text', text: structuredPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
          },
        },
      ],
    });

    const response = await llm.invoke([message]);
    const content = response.content as string;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`⚠️ No valid JSON in table recognition response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Build TableStructure from parsed response
    const tableStructure = buildTableStructure(parsed, pageNumber, tableId);

    console.log(
      `✅ Table recognized: ${tableStructure.tableType}, ` +
      `${tableStructure.metadata.totalRows}x${tableStructure.metadata.totalColumns}`
    );

    return tableStructure;
  } catch (error) {
    console.error(`❌ Error recognizing table:`, error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Builds the structured prompt for table recognition
 */
function buildTableRecognitionPrompt(): string {
  return `Analyze this table image and extract its complete structure.

Return ONLY valid JSON with this exact structure:

{
  "tableType": "simple" | "multi_header" | "pivot" | "nested",
  "boundingBox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1},
  "headerRows": [
    {
      "level": 0,
      "cells": [
        {
          "text": "Header Text",
          "colSpan": 1,
          "rowSpan": 1,
          "columnIndex": 0
        }
      ]
    }
  ],
  "dataRows": [
    {
      "rowIndex": 0,
      "cells": [
        {
          "text": "Cell Value",
          "columnIndex": 0,
          "dataType": "string" | "number" | "date" | "currency" | "boolean" | "empty",
          "mappedToHeaders": ["Header1", "Parent > Child"],
          "rowSpan": 1,
          "colSpan": 1
        }
      ],
      "isSubtotal": false,
      "isTotal": false
    }
  ],
  "mergedCells": [
    {
      "startRow": 0,
      "endRow": 1,
      "startCol": 0,
      "endCol": 2,
      "text": "Merged Cell Text"
    }
  ],
  "metadata": {
    "totalRows": 10,
    "totalColumns": 5,
    "hasSubtotals": false,
    "isTransposed": false
  },
  "confidence": 0.0-1.0
}

CRITICAL RULES:
1. For multi-row headers, track parent-child relationships:
   - Level 0 = top header row
   - Level 1 = second header row, etc.
   - Map each data cell to its full header path (e.g., "Q1 > January")

2. For merged cells:
   - Identify all colspan/rowspan cells
   - Track exact start/end positions
   - Propagate merged cell value to all covered cells

3. For data types:
   - "number": Pure numeric values (123, 45.67)
   - "currency": Money values ($100, €50, 1.234,56)
   - "date": Date values (2024-01-15, 15/01/2024)
   - "boolean": Yes/No, True/False, checkmarks
   - "empty": Empty cells or "-" or "N/A"
   - "string": Everything else

4. For pivot tables:
   - Identify row headers (left column(s))
   - Identify column headers (top row(s))
   - Map data cells to both row and column headers

5. Preserve numerical formatting:
   - Keep thousands separators (1,234 or 1.234)
   - Keep decimal separators (, or .)
   - Detect Italian vs. English number format`;
}

/**
 * Builds TableStructure from parsed JSON response
 */
function buildTableStructure(
  parsed: any,
  pageNumber: number,
  tableId: string
): TableStructure {
  const headers: TableHeader[] = [];
  const headerMap = new Map<string, string>(); // Maps column index to full header path

  // Process header rows
  if (parsed.headerRows) {
    for (const headerRow of parsed.headerRows) {
      const level = headerRow.level || 0;

      for (const cell of headerRow.cells || []) {
        const normalizedName = normalizeHeaderName(cell.text);

        headers.push({
          text: cell.text,
          columnIndex: cell.columnIndex,
          rowSpan: cell.rowSpan || 1,
          colSpan: cell.colSpan || 1,
          level,
          parentHeader: cell.parentHeader,
          normalizedName,
        });

        // Build full header path
        const fullPath = cell.parentHeader
          ? `${cell.parentHeader} > ${cell.text}`
          : cell.text;

        // Map to all covered columns
        for (let c = 0; c < (cell.colSpan || 1); c++) {
          headerMap.set(String(cell.columnIndex + c), fullPath);
        }
      }
    }
  }

  // Process data rows
  const rows: TableRow[] = [];

  if (parsed.dataRows) {
    for (const dataRow of parsed.dataRows) {
      const cells: TableCell[] = [];

      for (const cell of dataRow.cells || []) {
        const mappedHeader = headerMap.get(String(cell.columnIndex)) || '';

        cells.push({
          text: cell.text,
          columnIndex: cell.columnIndex,
          mappedHeader,
          dataType: cell.dataType || 'string',
          value: parseValue(cell.text, cell.dataType),
          confidence: 0.9,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        });
      }

      rows.push({
        rowIndex: dataRow.rowIndex,
        cells,
        isHeaderRow: false,
        isSubtotalRow: dataRow.isSubtotal || false,
        isTotalRow: dataRow.isTotal || false,
      });
    }
  }

  // Process merged cells
  const mergedCells: MergedCell[] = (parsed.mergedCells || []).map((mc: any) => ({
    startRow: mc.startRow,
    endRow: mc.endRow,
    startCol: mc.startCol,
    endCol: mc.endCol,
    text: mc.text,
    value: mc.text,
  }));

  return {
    id: tableId,
    pageNumber,
    boundingBox: parsed.boundingBox || { x: 0, y: 0, width: 1, height: 1 },
    headers,
    rows,
    mergedCells,
    tableType: parsed.tableType || 'simple',
    confidence: parsed.confidence || 0.8,
    metadata: {
      totalRows: parsed.metadata?.totalRows || rows.length,
      totalColumns: parsed.metadata?.totalColumns || headers.length,
      hasSubtotals: parsed.metadata?.hasSubtotals || false,
      isTransposed: parsed.metadata?.isTransposed || false,
    },
  };
}

/**
 * Normalizes header name for field mapping
 */
function normalizeHeaderName(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_'); // Replace spaces with underscores
}

/**
 * Parses cell value based on data type
 */
function parseValue(text: string, dataType: string): unknown {
  const trimmed = text.trim();

  if (dataType === 'empty' || !trimmed || trimmed === '-' || /^n\/?a$/i.test(trimmed)) {
    return null;
  }

  if (dataType === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (['yes', 'true', 'si', 'sì', '✓', '✔'].includes(lower)) return true;
    if (['no', 'false', '✗', '✘'].includes(lower)) return false;
    return null;
  }

  if (dataType === 'number' || dataType === 'currency') {
    // Remove currency symbols
    let cleaned = trimmed.replace(/[$€£¥₹]/g, '');

    // Detect format: Italian (1.234,56) vs English (1,234.56)
    const hasCommaDecimal = /\d,\d{2}$/.test(cleaned);
    const hasDotDecimal = /\d\.\d{2}$/.test(cleaned);

    if (hasCommaDecimal) {
      // Italian format
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (hasDotDecimal) {
      // English format
      cleaned = cleaned.replace(/,/g, '');
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  if (dataType === 'date') {
    // Try to parse date (simplified - would need better date parsing)
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? trimmed : parsed.toISOString().split('T')[0];
  }

  return trimmed;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  recognizeTable,
};
