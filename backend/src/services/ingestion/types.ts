// backend/src/services/ingestion/types.ts

export type FileFormat =
  | 'excel'
  | 'csv'
  | 'pdf_text'
  | 'pdf_scanned'
  | 'pdf_table'
  | 'word'
  | 'image'
  | 'text'
  | 'json'
  | 'unknown';

export type ExtractionMethod =
  | 'column_mapping'
  | 'llm_extraction'
  | 'regex_pattern'
  | 'ocr_vision'
  | 'template_based';

export type FieldSource = 'explicit' | 'inferred' | 'default' | 'rag_enriched';

export interface DetectedFormat {
  format: FileFormat;
  confidence: number;
  mimeType: string;
  encoding?: string;
  details: {
    hasHeaders?: boolean;
    delimiter?: string;
    sheetCount?: number;
    pageCount?: number;
    isScanned?: boolean;
    language?: 'it' | 'en' | 'mixed';
  };
}

export interface DetectedSchema {
  columns: SchemaColumn[];
  rowCount: number;
  confidence: number;
  suggestedItemType: 'product' | 'service' | 'mixed';
  extractionStrategy: ExtractionMethod;
}

export interface SchemaColumn {
  originalName: string;
  normalizedName: string;
  inferredType: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'array';
  sampleValues: any[];
  nullPercentage: number;
  mappedTo?: string; // Target field name
  mappingConfidence?: number;
}

export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'llm' | 'template';
  transforms?: FieldTransform[];
}

export interface FieldTransform {
  type: 'currency_parse' | 'date_parse' | 'trim' | 'lowercase' | 'regex_extract' | 'split';
  params?: Record<string, any>;
}

export interface ExtractedField<T = any> {
  value: T;
  confidence: number;
  source: FieldSource;
  extractionMethod: ExtractionMethod;
  originalValue?: any;
  needsReview: boolean;
  validationErrors?: string[];
}

export interface ExtractedItem {
  // Core fields
  name: ExtractedField<string>;
  description?: ExtractedField<string>;
  type: ExtractedField<'product' | 'service'>;

  // Business fields
  price?: ExtractedField<number>;
  budget?: ExtractedField<number>;
  category?: ExtractedField<string>;
  subcategory?: ExtractedField<string>;
  sku?: ExtractedField<string>;
  owner?: ExtractedField<string>;
  status?: ExtractedField<string>;
  priority?: ExtractedField<string>;

  // Technical fields
  technologies?: ExtractedField<string[]>;
  vendor?: ExtractedField<string>;

  // Metadata
  _extraction: {
    sourceRow?: number;
    sourcePage?: number;
    sourceFile: string;
    method: ExtractionMethod;
    templateId?: string;
    overallConfidence: number;
    fieldsNeedingReview: string[];
  };
}

export interface ExtractionTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;

  // Signatures for matching
  signatures: {
    columnPatterns: string[];      // Regex patterns for column names
    headerKeywords: string[];      // Keywords in first rows
    fileNamePattern?: string;      // Regex for filename
    contentFingerprint?: string;   // Hash of structure
  };

  // Mapping configuration
  fieldMappings: FieldMapping[];
  defaultValues?: Record<string, any>;

  // Stats
  timesUsed: number;
  avgAccuracy: number;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractionCorrection {
  id: string;
  tenantId: string;

  originalItem: Record<string, any>;
  correctedItem: Record<string, any>;
  fieldsCorrected: string[];

  context: {
    sourceFormat: FileFormat;
    sourceFilename: string;
    extractionMethod: ExtractionMethod;
    templateId?: string;
  };

  createdAt: Date;
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'date' | 'array';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  antiPatterns?: RegExp[];
  allowedValues?: string[];
  transforms?: FieldTransform[];
  customValidator?: (value: any) => boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: { field: string; message: string; severity: 'error' | 'warning' }[];
  fixes: Record<string, any>;
  confidence: number;
}

export interface ExtractionResult {
  success: boolean;
  items: ExtractedItem[];
  stats: {
    totalRows: number;
    extractedItems: number;
    skippedRows: number;
    avgConfidence: number;
    fieldsNeedingReview: string[];
  };
  detectedFormat: DetectedFormat;
  detectedSchema: DetectedSchema;
  appliedTemplate?: ExtractionTemplate;
  errors: string[];
  warnings: string[];
}

// Deduplication types
export interface DeduplicationResult {
  uniqueItems: ExtractedItem[];
  duplicates: DuplicateGroup[];
  stats: {
    totalItems: number;
    uniqueItems: number;
    duplicatesFound: number;
    mergedItems: number;
  };
}

export interface DuplicateGroup {
  canonical: ExtractedItem;
  duplicates: ExtractedItem[];
  similarity: number;
  mergeStrategy: 'keep_first' | 'keep_best' | 'merge';
}

// OCR types
export interface OCRResult {
  text: string;
  confidence: number;
  blocks: OCRBlock[];
  language: 'it' | 'en' | 'mixed';
  processingTime: number;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  type: 'text' | 'table' | 'image' | 'header' | 'footer';
}

// Processing options
export interface ExtractionOptions {
  tenantId: string;
  filename: string;
  autoDetectFormat?: boolean;
  forceFormat?: FileFormat;
  useTemplate?: string;
  autoLearn?: boolean;
  validateResults?: boolean;
  deduplicateResults?: boolean;
  confidenceThreshold?: number;
  maxItems?: number;
  language?: 'it' | 'en' | 'auto';
}
