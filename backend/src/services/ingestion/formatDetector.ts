// backend/src/services/ingestion/formatDetector.ts

import { DetectedFormat, FileFormat } from './types';

// Magic bytes for common formats
const MAGIC_BYTES: Record<string, FileFormat> = {
  '504b0304': 'excel',      // XLSX (ZIP-based)
  '504b0506': 'excel',      // XLSX empty
  '504b0708': 'excel',      // XLSX spanned
  'd0cf11e0': 'excel',      // XLS (OLE)
  '25504446': 'pdf_text',   // PDF
  'ffd8ffe0': 'image',      // JPEG
  'ffd8ffe1': 'image',      // JPEG EXIF
  '89504e47': 'image',      // PNG
  '47494638': 'image',      // GIF
};

// Content patterns for format detection
const CONTENT_PATTERNS = {
  csv: /^(?:[^,\n]*,)+[^,\n]*(?:\n(?:[^,\n]*,)+[^,\n]*)*$/,
  csvSemicolon: /^(?:[^;\n]*;)+[^;\n]*(?:\n(?:[^;\n]*;)+[^;\n]*)*$/,
  json: /^\s*[\[{]/,
  xml: /^\s*<\?xml/,
  html: /^\s*<!DOCTYPE html|<html/i,
};

export async function detectFormat(
  buffer: Buffer,
  filename?: string
): Promise<DetectedFormat> {
  const result: DetectedFormat = {
    format: 'unknown',
    confidence: 0,
    mimeType: 'application/octet-stream',
    details: {},
  };

  // 1. Check magic bytes
  const magicHex = buffer.slice(0, 4).toString('hex').toLowerCase();
  if (MAGIC_BYTES[magicHex]) {
    result.format = MAGIC_BYTES[magicHex];
    result.confidence = 0.95;
  }

  // 2. Try to use file-type library for more accurate detection
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileType = require('file-type') as { fileTypeFromBuffer: (buffer: Buffer) => Promise<{ mime: string; ext: string } | undefined> };
    const detected = await fileType.fileTypeFromBuffer(buffer);

    if (detected) {
      result.mimeType = detected.mime;

      if (detected.mime.includes('spreadsheet') || detected.mime.includes('excel')) {
        result.format = 'excel';
        result.confidence = 0.98;
      } else if (detected.mime === 'application/pdf') {
        result.format = await detectPdfType(buffer);
        result.confidence = 0.95;
      } else if (detected.mime.startsWith('image/')) {
        result.format = 'image';
        result.confidence = 0.98;
      } else if (detected.mime.includes('word') || detected.mime.includes('document')) {
        result.format = 'word';
        result.confidence = 0.95;
      }
    }
  } catch (error) {
    // file-type not available, continue with other methods
    console.debug('file-type library not available, using fallback detection');
  }

  // 3. Fallback to content analysis for text-based formats
  if (result.format === 'unknown' || result.confidence < 0.9) {
    const textContent = buffer.toString('utf-8', 0, Math.min(buffer.length, 5000));
    const contentResult = detectFromContent(textContent);

    if (contentResult.confidence > result.confidence) {
      result.format = contentResult.format;
      result.confidence = contentResult.confidence;
      result.details = { ...result.details, ...contentResult.details };
    }
  }

  // 4. Use filename extension as hint
  if (filename && result.confidence < 0.9) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const extFormat = getFormatFromExtension(ext);

    if (extFormat && result.format === 'unknown') {
      result.format = extFormat;
      result.confidence = 0.7; // Lower confidence from extension alone
    }
  }

  // 5. Detect encoding for text formats
  if (['csv', 'text', 'json'].includes(result.format)) {
    result.encoding = detectEncoding(buffer);
  }

  // 6. Detect language
  const textSample = buffer.toString('utf-8', 0, 2000);
  result.details.language = detectLanguage(textSample);

  return result;
}

async function detectPdfType(buffer: Buffer): Promise<FileFormat> {
  const text = buffer.toString('utf-8', 0, 10000);

  // Check for text content
  const hasText = /\/Type\s*\/Page[\s\S]*?BT[\s\S]*?ET/.test(text);

  // Check for images (potential scanned document)
  const hasImages = /\/XObject[\s\S]*?\/Image/.test(text);
  const imageCount = (text.match(/\/Image/g) || []).length;

  // Check for tables
  const hasTables = /\/Table|<table|TR\s*>|<td/i.test(text);

  if (!hasText && imageCount > 0) {
    return 'pdf_scanned';
  } else if (hasTables) {
    return 'pdf_table';
  }

  return 'pdf_text';
}

function detectFromContent(content: string): { format: FileFormat; confidence: number; details: Record<string, any> } {
  const trimmed = content.trim();

  // JSON detection
  if (CONTENT_PATTERNS.json.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return { format: 'json', confidence: 0.95, details: {} };
    } catch {
      // Not valid JSON, might be partial
      if (trimmed.length > 100) {
        return { format: 'json', confidence: 0.6, details: {} };
      }
    }
  }

  // CSV with comma
  if (CONTENT_PATTERNS.csv.test(trimmed)) {
    const lines = trimmed.split('\n');
    const commaCount = (lines[0].match(/,/g) || []).length;
    if (commaCount >= 2 && lines.length > 1) {
      return {
        format: 'csv',
        confidence: 0.85,
        details: { delimiter: ',', hasHeaders: true }
      };
    }
  }

  // CSV with semicolon (Italian/European)
  if (CONTENT_PATTERNS.csvSemicolon.test(trimmed)) {
    const lines = trimmed.split('\n');
    const semicolonCount = (lines[0].match(/;/g) || []).length;
    if (semicolonCount >= 2 && lines.length > 1) {
      return {
        format: 'csv',
        confidence: 0.85,
        details: { delimiter: ';', hasHeaders: true }
      };
    }
  }

  // Tab-separated
  if (trimmed.includes('\t')) {
    const lines = trimmed.split('\n');
    const tabCount = (lines[0].match(/\t/g) || []).length;
    if (tabCount >= 2) {
      return {
        format: 'csv',
        confidence: 0.80,
        details: { delimiter: '\t', hasHeaders: true }
      };
    }
  }

  // Plain text (default)
  return { format: 'text', confidence: 0.5, details: {} };
}

function getFormatFromExtension(ext?: string): FileFormat | null {
  const mapping: Record<string, FileFormat> = {
    xlsx: 'excel',
    xls: 'excel',
    xlsm: 'excel',
    csv: 'csv',
    tsv: 'csv',
    pdf: 'pdf_text',
    doc: 'word',
    docx: 'word',
    txt: 'text',
    json: 'json',
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    tiff: 'image',
    tif: 'image',
    bmp: 'image',
    webp: 'image',
  };

  return ext ? mapping[ext] || null : null;
}

function detectEncoding(buffer: Buffer): string {
  // Simple BOM detection
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8-bom';
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }

  // Check for valid UTF-8
  try {
    const text = buffer.toString('utf-8');
    // If no replacement characters, likely UTF-8
    if (!text.includes('\uFFFD')) {
      return 'utf-8';
    }
  } catch { /* ignore */ }

  return 'iso-8859-1'; // Default fallback
}

function detectLanguage(text: string): 'it' | 'en' | 'mixed' {
  const italianWords = [
    'prodotto', 'servizio', 'prezzo', 'descrizione', 'categoria',
    'nome', 'codice', 'listino', 'articolo', 'importo', 'fornitore',
    'quantità', 'totale', 'fattura', 'ordine', 'cliente', 'data'
  ];
  const englishWords = [
    'product', 'service', 'price', 'description', 'category',
    'name', 'code', 'item', 'amount', 'total', 'vendor',
    'quantity', 'invoice', 'order', 'customer', 'date'
  ];

  const lowerText = text.toLowerCase();

  let italianCount = 0;
  let englishCount = 0;

  for (const word of italianWords) {
    if (lowerText.includes(word)) italianCount++;
  }

  for (const word of englishWords) {
    if (lowerText.includes(word)) englishCount++;
  }

  if (italianCount > englishCount * 2) return 'it';
  if (englishCount > italianCount * 2) return 'en';
  if (italianCount > 0 && englishCount > 0) return 'mixed';

  return 'en'; // Default
}

export { detectPdfType, detectFromContent, detectLanguage, getFormatFromExtension, detectEncoding };
