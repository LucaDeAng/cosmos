/**
 * Data Ingestion Module - Exports
 * 
 * Multi-agent system for extracting and normalizing IT portfolio data
 * from various input formats (PDF, Excel, CSV, text).
 */

// Parser Agents
export { parsePDF, RawExtractedItem, ExtractionResult } from './pdfParserAgent';
export type { PDFParserInput, PDFParserOutput } from './pdfParserAgent';

export { parseExcel } from './excelParserAgent';
export type { ExcelParserInput, ExcelParserOutput, SheetData } from './excelParserAgent';

export { parseText } from './textParserAgent';
export type { TextParserInput, TextParserOutput } from './textParserAgent';

// Normalizer Agent
export { normalizeItems, NormalizedItemSchema } from './normalizerAgent';
export type { NormalizedItem, NormalizerInput, NormalizerOutput } from './normalizerAgent';

// Orchestrator (main entry point)
export {
  ingestData,
  ingestFile,
  ingestText
} from '../dataIngestionOrchestrator';
export type {
  FileInput,
  IngestionInput,
  IngestionOutput,
  ParsingResult
} from '../dataIngestionOrchestrator';

// Accelerator Agent
export {
  ingestionAcceleratorAgent,
  accelerateIngestion,
  IngestionAcceleratorAgent,
} from './ingestionAcceleratorAgent';
export type {
  AcceleratorInput,
  AcceleratorOutput,
  AcceleratorOptions,
  AcceleratorMetrics,
  CacheStats,
  DedupStats,
} from './ingestionAcceleratorAgent';

// Azure Document Intelligence Agent (optional - for enhanced table extraction)
export {
  extractWithAzure,
  tablesToRawItems,
  isAzureConfigured,
  shouldUseAzure,
} from './azureDocIntelligenceAgent';
export type {
  AzureExtractionResult,
  ExtractedTable,
  TableRow,
  TableCell,
  AzureAgentInput,
} from './azureDocIntelligenceAgent';
