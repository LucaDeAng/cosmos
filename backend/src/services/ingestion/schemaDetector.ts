// backend/src/services/ingestion/schemaDetector.ts

import { ChatOpenAI } from '@langchain/openai';
import { DetectedSchema, SchemaColumn, FileFormat, ExtractionMethod } from './types';

const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});

const SCHEMA_DETECTION_SYSTEM_PROMPT = `Sei un esperto analista di dati. Analizza il contenuto fornito e identifica la struttura dei dati (schema).

NON estrarre i dati, solo la STRUTTURA.

Rispondi SEMPRE in questo formato JSON esatto:
{
  "columns": [
    {
      "originalName": "Nome colonna originale",
      "normalizedName": "nome_normalizzato_snake_case",
      "inferredType": "string|number|date|boolean|currency|array",
      "sampleValues": ["valore1", "valore2", "valore3"],
      "nullPercentage": 0.0
    }
  ],
  "rowCount": 50,
  "confidence": 0.85,
  "suggestedItemType": "product|service|mixed",
  "extractionStrategy": "column_mapping|llm_extraction|regex_pattern"
}

Regole:
1. inferredType "currency" per valori monetari (€, $, EUR, prezzo, costo, importo)
2. inferredType "date" per date in qualsiasi formato
3. suggestedItemType basato su keyword (prodotto/product → product, servizio/service → service)
4. extractionStrategy:
   - "column_mapping" se dati tabulari con header chiari
   - "llm_extraction" se testo narrativo
   - "regex_pattern" se struttura ripetitiva semplice`;

export async function detectSchema(
  content: string,
  format: FileFormat,
  options?: { maxSampleRows?: number }
): Promise<DetectedSchema> {
  const maxRows = options?.maxSampleRows || 20;

  // Get sample content (first N rows or first 3000 chars)
  const sampleContent = getSampleContent(content, format, maxRows);

  // Use LLM to detect schema
  const schemaPrompt = buildSchemaDetectionPrompt(sampleContent, format);

  try {
    const response = await llm.invoke([
      { role: 'system', content: SCHEMA_DETECTION_SYSTEM_PROMPT },
      { role: 'user', content: schemaPrompt }
    ]);

    const result = parseSchemaResponse(response.content as string);

    // Enhance with statistical analysis
    const enhancedColumns = await analyzeColumnStatistics(result.columns, content, format);

    return {
      ...result,
      columns: enhancedColumns,
    };
  } catch (error) {
    console.error('Schema detection failed, using fallback:', error);
    return fallbackSchemaDetection(content, format);
  }
}

function buildSchemaDetectionPrompt(content: string, format: FileFormat): string {
  return `Analizza questo contenuto (formato: ${format}) e identifica lo schema:

---CONTENUTO---
${content}
---FINE CONTENUTO---

Identifica tutte le colonne/campi presenti, i loro tipi, e suggerisci la migliore strategia di estrazione.`;
}

function parseSchemaResponse(response: string): DetectedSchema {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
    const jsonStr = jsonMatch[1] || response;

    const parsed = JSON.parse(jsonStr.trim());

    return {
      columns: parsed.columns || [],
      rowCount: parsed.rowCount || 0,
      confidence: parsed.confidence || 0.5,
      suggestedItemType: parsed.suggestedItemType || 'mixed',
      extractionStrategy: parsed.extractionStrategy || 'llm_extraction',
    };
  } catch (error) {
    console.error('Failed to parse schema response:', error);
    return {
      columns: [],
      rowCount: 0,
      confidence: 0,
      suggestedItemType: 'mixed',
      extractionStrategy: 'llm_extraction',
    };
  }
}

function getSampleContent(content: string, format: FileFormat, maxRows: number): string {
  if (format === 'csv' || format === 'text') {
    const lines = content.split('\n');
    return lines.slice(0, maxRows + 1).join('\n'); // +1 for header
  }

  // For other formats, limit by character count
  return content.slice(0, 4000);
}

async function analyzeColumnStatistics(
  columns: SchemaColumn[],
  content: string,
  format: FileFormat
): Promise<SchemaColumn[]> {
  // Parse content into rows based on format
  const rows = parseContentToRows(content, format);

  if (rows.length === 0) return columns;

  return columns.map((col, index) => {
    const values = rows.map(row => row[index]).filter(v => v !== undefined && v !== null && v !== '');
    const nullCount = rows.length - values.length;

    return {
      ...col,
      sampleValues: values.slice(0, 5),
      nullPercentage: nullCount / rows.length,
      inferredType: inferTypeFromValues(values) || col.inferredType,
    };
  });
}

function parseContentToRows(content: string, format: FileFormat): any[][] {
  if (format === 'csv') {
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Detect delimiter
        const commaCount = (line.match(/,/g) || []).length;
        const semicolonCount = (line.match(/;/g) || []).length;
        const tabCount = (line.match(/\t/g) || []).length;

        let delimiter = ',';
        if (semicolonCount > commaCount) delimiter = ';';
        if (tabCount > Math.max(commaCount, semicolonCount)) delimiter = '\t';

        return parseCSVLine(line, delimiter);
      });
  }

  return [];
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function inferTypeFromValues(values: any[]): SchemaColumn['inferredType'] | null {
  if (values.length === 0) return null;

  const sample = values.slice(0, 10);

  // Check for currency
  const currencyPattern = /^[€$£]?\s*[\d.,]+\s*[€$£]?$|^\d+[.,]\d{2}$/;
  if (sample.every(v => currencyPattern.test(String(v)))) {
    return 'currency';
  }

  // Check for numbers
  if (sample.every(v => !isNaN(parseFloat(String(v).replace(',', '.'))))) {
    return 'number';
  }

  // Check for dates
  const datePatterns = [
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,
    /^\d{1,2}\s+\w+\s+\d{4}$/,
  ];
  if (sample.every(v => datePatterns.some(p => p.test(String(v))))) {
    return 'date';
  }

  // Check for boolean
  const boolValues = ['true', 'false', 'yes', 'no', 'si', 'sì', '1', '0', 'x', ''];
  if (sample.every(v => boolValues.includes(String(v).toLowerCase()))) {
    return 'boolean';
  }

  return 'string';
}

function fallbackSchemaDetection(content: string, format: FileFormat): DetectedSchema {
  // Simple heuristic-based detection
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return {
      columns: [],
      rowCount: 0,
      confidence: 0,
      suggestedItemType: 'mixed',
      extractionStrategy: 'llm_extraction',
    };
  }

  // Assume first line is header
  const headerLine = lines[0];
  const delimiter = detectDelimiter(headerLine);
  const headers = parseCSVLine(headerLine, delimiter);

  const columns: SchemaColumn[] = headers.map(h => ({
    originalName: h,
    normalizedName: normalizeColumnName(h),
    inferredType: 'string',
    sampleValues: [],
    nullPercentage: 0,
  }));

  // Analyze data rows for type inference
  const dataRows = lines.slice(1).map(line => parseCSVLine(line, delimiter));

  for (let i = 0; i < columns.length; i++) {
    const columnValues = dataRows.map(row => row[i]).filter(v => v !== undefined && v !== '');
    const inferredType = inferTypeFromValues(columnValues);
    if (inferredType) {
      columns[i].inferredType = inferredType;
    }
    columns[i].sampleValues = columnValues.slice(0, 5);
    columns[i].nullPercentage = (dataRows.length - columnValues.length) / Math.max(dataRows.length, 1);
  }

  // Determine item type based on column names
  const allColumnNames = columns.map(c => c.originalName.toLowerCase()).join(' ');
  let suggestedItemType: 'product' | 'service' | 'mixed' = 'mixed';

  if (/prodott|product|articol|item|sku|barcode|ean/i.test(allColumnNames)) {
    suggestedItemType = 'product';
  } else if (/servizi|service|consulenz|support|manuten/i.test(allColumnNames)) {
    suggestedItemType = 'service';
  }

  return {
    columns,
    rowCount: lines.length - 1,
    confidence: 0.6,
    suggestedItemType,
    extractionStrategy: 'column_mapping',
  };
}

function detectDelimiter(line: string): string {
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;
  const tabs = (line.match(/\t/g) || []).length;

  if (tabs >= Math.max(commas, semicolons)) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\u00C0-\u017F]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export {
  parseSchemaResponse,
  inferTypeFromValues,
  fallbackSchemaDetection,
  detectDelimiter,
  normalizeColumnName,
  parseCSVLine
};
