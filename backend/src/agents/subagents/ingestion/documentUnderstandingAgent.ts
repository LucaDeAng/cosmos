/**
 * Document Understanding Agent - Phase 2.2
 *
 * Enhances document parsing with:
 * - Document structure analysis (headers, sections, tables)
 * - Visual element detection (charts, diagrams)
 * - Context-aware extraction
 * - Multi-page document handling
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface DocumentStructure {
  documentType: 'spreadsheet' | 'presentation' | 'report' | 'mixed';
  sections: DocumentSection[];
  tables: TableInfo[];
  visualElements: VisualElement[];
  metadata: DocumentMetadata;
}

export interface DocumentSection {
  title: string;
  level: number; // 1 = main, 2 = sub, etc.
  startPage?: number;
  endPage?: number;
  content: string;
  type: 'header' | 'paragraph' | 'list' | 'table' | 'chart';
}

export interface TableInfo {
  id: string;
  page?: number;
  headers: string[];
  rowCount: number;
  columnCount: number;
  tableType: 'simple' | 'merged_headers' | 'pivot' | 'complex';
  confidence: number;
  containsPortfolioData: boolean;
  relevanceScore: number; // 0-1, how relevant to portfolio items
}

export interface VisualElement {
  type: 'chart' | 'diagram' | 'image' | 'logo';
  page?: number;
  description: string;
  extractedData?: Record<string, unknown>;
  relevanceScore: number;
}

export interface DocumentMetadata {
  totalPages: number;
  language: string;
  confidence: number;
  structureComplexity: 'simple' | 'medium' | 'complex';
  hasMultipleEntities: boolean;
}

export interface DocumentUnderstandingInput {
  fileName: string;
  fileBuffer: Buffer;
  fileType: string; // 'pdf', 'xlsx', 'pptx', etc.
  userContext?: string;
  language?: string;
}

export interface DocumentUnderstandingResult {
  structure: DocumentStructure;
  extractionStrategy: ExtractionStrategy;
  confidence: number;
  warnings: string[];
}

export interface ExtractionStrategy {
  approach: 'table_first' | 'section_by_section' | 'visual_guided' | 'hybrid';
  focusAreas: string[]; // Which sections/tables to prioritize
  skipAreas: string[]; // Which sections to ignore
  reasoning: string;
}

// ============================================================
// MAIN FUNCTION: analyzeDocumentStructure
// ============================================================

/**
 * Analyzes document structure to determine the best extraction strategy
 */
export async function analyzeDocumentStructure(
  input: DocumentUnderstandingInput
): Promise<DocumentUnderstandingResult> {
  console.log(`📊 Analyzing document structure: ${input.fileName}`);

  try {
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1,
    });

    // Step 1: Quick analysis to understand document type
    const documentType = await detectDocumentType(input);

    // Step 2: Extract structural elements
    const structure = await extractDocumentStructure(input, documentType, llm);

    // Step 3: Determine extraction strategy
    const extractionStrategy = await planExtractionStrategy(structure, input.userContext);

    // Step 4: Calculate confidence
    const confidence = calculateStructureConfidence(structure);

    const warnings: string[] = [];
    if (structure.metadata.structureComplexity === 'complex') {
      warnings.push('Document has complex structure - may require manual review');
    }
    if (structure.tables.length === 0 && documentType === 'spreadsheet') {
      warnings.push('No tables detected in spreadsheet - may be incorrectly formatted');
    }

    console.log(`✅ Document analysis complete: ${extractionStrategy.approach} strategy`);

    return {
      structure,
      extractionStrategy,
      confidence,
      warnings,
    };
  } catch (error) {
    console.error('❌ Error analyzing document structure:', error);
    throw error;
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Detects document type from filename and content
 */
async function detectDocumentType(
  input: DocumentUnderstandingInput
): Promise<DocumentStructure['documentType']> {
  const ext = input.fileName.split('.').pop()?.toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return 'spreadsheet';
  } else if (ext === 'pptx' || ext === 'ppt') {
    return 'presentation';
  } else if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
    // For PDFs, we'd need to analyze content
    // For now, assume report
    return 'report';
  }

  return 'mixed';
}

/**
 * Extracts structural elements from document
 */
async function extractDocumentStructure(
  input: DocumentUnderstandingInput,
  documentType: DocumentStructure['documentType'],
  llm: ChatOpenAI
): Promise<DocumentStructure> {
  // For spreadsheets, extract sheet structure
  if (documentType === 'spreadsheet') {
    return await extractSpreadsheetStructure(input);
  }

  // For PDFs, extract page-by-page structure
  if (documentType === 'report') {
    return await extractReportStructure(input, llm);
  }

  // Default structure
  return {
    documentType,
    sections: [],
    tables: [],
    visualElements: [],
    metadata: {
      totalPages: 1,
      language: input.language || 'it',
      confidence: 0.5,
      structureComplexity: 'simple',
      hasMultipleEntities: false,
    },
  };
}

/**
 * Extracts spreadsheet structure (sheets, tables, ranges)
 */
async function extractSpreadsheetStructure(
  input: DocumentUnderstandingInput
): Promise<DocumentStructure> {
  // This would integrate with Excel parser
  // For now, return a mock structure

  const sections: DocumentSection[] = [
    {
      title: 'Main Data',
      level: 1,
      content: 'Primary data sheet',
      type: 'table',
    },
  ];

  const tables: TableInfo[] = [
    {
      id: 'table-1',
      headers: [], // Would be populated by Excel parser
      rowCount: 0,
      columnCount: 0,
      tableType: 'simple',
      confidence: 0.9,
      containsPortfolioData: true,
      relevanceScore: 0.95,
    },
  ];

  return {
    documentType: 'spreadsheet',
    sections,
    tables,
    visualElements: [],
    metadata: {
      totalPages: 1,
      language: input.language || 'it',
      confidence: 0.9,
      structureComplexity: 'simple',
      hasMultipleEntities: false,
    },
  };
}

/**
 * Extracts report structure (headers, sections, tables)
 */
async function extractReportStructure(
  input: DocumentUnderstandingInput,
  llm: ChatOpenAI
): Promise<DocumentStructure> {
  // This would integrate with PDF parser
  // For now, return a mock structure

  const sections: DocumentSection[] = [
    {
      title: 'Introduction',
      level: 1,
      startPage: 1,
      endPage: 2,
      content: 'Document introduction',
      type: 'paragraph',
    },
    {
      title: 'Portfolio Overview',
      level: 1,
      startPage: 3,
      endPage: 5,
      content: 'Main portfolio data',
      type: 'table',
    },
  ];

  const tables: TableInfo[] = [
    {
      id: 'table-1',
      page: 3,
      headers: [],
      rowCount: 0,
      columnCount: 0,
      tableType: 'simple',
      confidence: 0.8,
      containsPortfolioData: true,
      relevanceScore: 0.9,
    },
  ];

  return {
    documentType: 'report',
    sections,
    tables,
    visualElements: [],
    metadata: {
      totalPages: 10,
      language: input.language || 'it',
      confidence: 0.8,
      structureComplexity: 'medium',
      hasMultipleEntities: true,
    },
  };
}

/**
 * Plans the best extraction strategy based on document structure
 */
async function planExtractionStrategy(
  structure: DocumentStructure,
  userContext?: string
): Promise<ExtractionStrategy> {
  // Rule-based strategy selection
  let approach: ExtractionStrategy['approach'];
  const focusAreas: string[] = [];
  const skipAreas: string[] = [];
  let reasoning: string;

  // If document has clear tables, prioritize table extraction
  if (structure.tables.length > 0 && structure.tables.some(t => t.containsPortfolioData)) {
    approach = 'table_first';
    focusAreas.push(...structure.tables.filter(t => t.containsPortfolioData).map(t => t.id));
    reasoning = 'Document contains structured tables with portfolio data - extracting tables first';
  }
  // If document is a report with sections
  else if (structure.documentType === 'report' && structure.sections.length > 3) {
    approach = 'section_by_section';
    focusAreas.push(...structure.sections.filter(s => s.type === 'table' || s.type === 'list').map(s => s.title));
    reasoning = 'Document is a structured report - processing section by section';
  }
  // If document has visual elements
  else if (structure.visualElements.length > 0) {
    approach = 'visual_guided';
    focusAreas.push(...structure.visualElements.filter(v => v.relevanceScore > 0.7).map(v => v.type));
    reasoning = 'Document contains visual elements - using visual-guided extraction';
  }
  // Default: hybrid approach
  else {
    approach = 'hybrid';
    reasoning = 'Document structure is complex - using hybrid extraction approach';
  }

  return {
    approach,
    focusAreas,
    skipAreas,
    reasoning,
  };
}

/**
 * Calculates confidence in document structure analysis
 */
function calculateStructureConfidence(structure: DocumentStructure): number {
  let confidence = 0.5;

  // High confidence if we detected tables
  if (structure.tables.length > 0) {
    confidence += 0.2;
  }

  // High confidence if we understand document type
  if (structure.documentType !== 'mixed') {
    confidence += 0.15;
  }

  // High confidence if structure is simple
  if (structure.metadata.structureComplexity === 'simple') {
    confidence += 0.15;
  }

  // Penalize if no relevant content found
  if (structure.tables.length === 0 && structure.sections.length === 0) {
    confidence -= 0.3;
  }

  return Math.max(0, Math.min(1, confidence));
}

// ============================================================
// EXPORT
// ============================================================

export default {
  analyzeDocumentStructure,
};
