// backend/src/services/ingestion/ocrProcessor.ts

import { ChatOpenAI } from '@langchain/openai';
import { OCRResult, OCRBlock, ExtractedItem, ExtractionMethod, ExtractedField } from './types';
import { detectLanguage } from './formatDetector';

const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
});

const visionLLM = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0,
  maxTokens: 4096,
});

/**
 * Process an image or scanned PDF using OCR
 * Uses GPT-4 Vision for image understanding
 */
export async function processOCR(
  imageBuffer: Buffer,
  options?: {
    language?: 'it' | 'en' | 'auto';
    detectTables?: boolean;
    extractItems?: boolean;
  }
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    const mimeType = detectImageMimeType(imageBuffer);

    // Use GPT-4 Vision for OCR
    const ocrResponse = await visionLLM.invoke([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildOCRPrompt(options),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high',
            },
          },
        ],
      },
    ]);

    const result = parseOCRResponse(ocrResponse.content as string);

    // Detect language from extracted text
    const detectedLanguage = options?.language === 'auto' || !options?.language
      ? detectLanguage(result.text)
      : options.language;

    return {
      ...result,
      language: detectedLanguage,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('OCR processing failed:', error);
    return {
      text: '',
      confidence: 0,
      blocks: [],
      language: 'en',
      processingTime: Date.now() - startTime,
    };
  }
}

function buildOCRPrompt(options?: { language?: string; detectTables?: boolean; extractItems?: boolean }): string {
  const detectTables = options?.detectTables ?? true;
  const extractItems = options?.extractItems ?? false;

  let prompt = `Estrai tutto il testo da questa immagine.

Rispondi in formato JSON:
{
  "text": "tutto il testo estratto",
  "confidence": 0.0-1.0,
  "blocks": [
    {
      "text": "testo del blocco",
      "confidence": 0.95,
      "type": "text|table|header|footer",
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 50 }
    }
  ]
}`;

  if (detectTables) {
    prompt += `

Se trovi tabelle:
- Estrai le righe della tabella come array
- Identifica le intestazioni delle colonne
- type = "table" per i blocchi tabella`;
  }

  if (extractItems) {
    prompt += `

Se l'immagine contiene un listino prezzi, catalogo o elenco prodotti:
- Estrai ogni prodotto/servizio come blocco separato
- Includi nome, descrizione, prezzo, codice se presenti`;
  }

  return prompt;
}

function parseOCRResponse(response: string): Omit<OCRResult, 'language' | 'processingTime'> {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : response;

    const parsed = JSON.parse(jsonStr);

    return {
      text: parsed.text || '',
      confidence: parsed.confidence || 0.5,
      blocks: (parsed.blocks || []).map((block: any) => ({
        text: block.text || '',
        confidence: block.confidence || 0.5,
        boundingBox: block.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
        type: block.type || 'text',
      })),
    };
  } catch (error) {
    console.error('Failed to parse OCR response:', error);
    // If JSON parsing fails, treat the entire response as text
    return {
      text: response,
      confidence: 0.3,
      blocks: [{
        text: response,
        confidence: 0.3,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        type: 'text',
      }],
    };
  }
}

function detectImageMimeType(buffer: Buffer): string {
  // Check magic bytes
  const magicBytes = buffer.slice(0, 4).toString('hex').toLowerCase();

  if (magicBytes.startsWith('ffd8ff')) return 'image/jpeg';
  if (magicBytes.startsWith('89504e47')) return 'image/png';
  if (magicBytes.startsWith('47494638')) return 'image/gif';
  if (magicBytes.startsWith('49492a00') || magicBytes.startsWith('4d4d002a')) return 'image/tiff';
  if (magicBytes.startsWith('424d')) return 'image/bmp';

  return 'image/png'; // Default
}

/**
 * Extract structured items from OCR text using LLM
 */
export async function extractItemsFromOCRText(
  ocrResult: OCRResult,
  options?: {
    itemType?: 'product' | 'service' | 'mixed';
    language?: 'it' | 'en';
  }
): Promise<ExtractedItem[]> {
  const itemType = options?.itemType || 'mixed';
  const language = options?.language || ocrResult.language;

  const prompt = buildExtractionPrompt(ocrResult.text, itemType, language);

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const items = parseExtractionResponse(response.content as string, ocrResult);
    return items;
  } catch (error) {
    console.error('Item extraction from OCR failed:', error);
    return [];
  }
}

function buildExtractionPrompt(text: string, itemType: string, language: string): string {
  const langInstructions = language === 'it'
    ? 'Il testo è in italiano. Estrai i campi in italiano se presenti.'
    : 'The text is in English. Extract fields in English if present.';

  return `Estrai tutti i ${itemType === 'mixed' ? 'prodotti e servizi' : itemType === 'product' ? 'prodotti' : 'servizi'} dal seguente testo OCR.

${langInstructions}

---TESTO OCR---
${text}
---FINE TESTO---

Per ogni item estratto, includi tutti i campi che riesci a identificare:
- name: nome del prodotto/servizio (OBBLIGATORIO)
- description: descrizione
- type: "product" o "service"
- price: prezzo (numero)
- sku: codice articolo
- category: categoria
- vendor: fornitore/marca
- quantity: quantità

Rispondi SOLO con JSON:
{
  "items": [
    {
      "name": "...",
      "description": "...",
      "type": "product",
      "price": 99.99,
      "sku": "ABC123",
      "category": "...",
      "vendor": "...",
      "confidence": 0.85
    }
  ]
}

Se non riesci a estrarre nessun item, rispondi con {"items": []}`;
}

function parseExtractionResponse(response: string, ocrResult: OCRResult): ExtractedItem[] {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      response.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : response;

    const parsed = JSON.parse(jsonStr);

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items.map((item: any, index: number) => {
      const extractionMethod: ExtractionMethod = 'ocr_vision';
      const confidence = item.confidence || ocrResult.confidence * 0.9;

      const createField = <T>(value: T | undefined, fieldConfidence?: number): ExtractedField<T> | undefined => {
        if (value === undefined || value === null || value === '') return undefined;
        return {
          value,
          confidence: fieldConfidence || confidence,
          source: 'explicit',
          extractionMethod,
          needsReview: confidence < 0.7,
        };
      };

      const extractedItem: ExtractedItem = {
        name: {
          value: item.name || `Item ${index + 1}`,
          confidence,
          source: 'explicit',
          extractionMethod,
          needsReview: !item.name || confidence < 0.7,
        },
        type: {
          value: item.type || 'product',
          confidence,
          source: item.type ? 'explicit' : 'inferred',
          extractionMethod,
          needsReview: !item.type,
        },
        description: createField(item.description),
        price: createField(item.price ? parseFloat(item.price) : undefined),
        sku: createField(item.sku),
        category: createField(item.category),
        vendor: createField(item.vendor),
        _extraction: {
          sourceFile: 'ocr_image',
          sourcePage: 1,
          method: extractionMethod,
          overallConfidence: confidence,
          fieldsNeedingReview: confidence < 0.7 ? ['name', 'price', 'description'] : [],
        },
      };

      return extractedItem;
    });
  } catch (error) {
    console.error('Failed to parse extraction response:', error);
    return [];
  }
}

/**
 * Process a table from OCR results
 */
export function extractTableFromOCR(blocks: OCRBlock[]): {
  headers: string[];
  rows: string[][];
  confidence: number;
} {
  // Find table blocks
  const tableBlocks = blocks.filter(b => b.type === 'table');

  if (tableBlocks.length === 0) {
    return { headers: [], rows: [], confidence: 0 };
  }

  // Combine table text
  const tableText = tableBlocks.map(b => b.text).join('\n');

  // Try to parse as structured table
  const lines = tableText.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    return { headers: [], rows: [], confidence: tableBlocks[0]?.confidence || 0.5 };
  }

  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = '\t';
  if (firstLine.includes('|')) delimiter = '|';
  else if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes(',') && !firstLine.match(/\d,\d/)) delimiter = ',';

  const parseRow = (line: string): string[] => {
    return line.split(delimiter).map(cell =>
      cell.trim().replace(/^[\s|]+|[\s|]+$/g, '')
    ).filter(cell => cell);
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow).filter(row => row.length > 0);

  const avgConfidence = tableBlocks.reduce((sum, b) => sum + b.confidence, 0) / tableBlocks.length;

  return { headers, rows, confidence: avgConfidence };
}

/**
 * Process multiple pages (for multi-page PDFs)
 */
export async function processMultiPageOCR(
  pages: Buffer[],
  options?: {
    language?: 'it' | 'en' | 'auto';
    extractItems?: boolean;
  }
): Promise<{
  results: OCRResult[];
  combinedText: string;
  items?: ExtractedItem[];
}> {
  const results: OCRResult[] = [];

  for (const page of pages) {
    const result = await processOCR(page, options);
    results.push(result);
  }

  const combinedText = results.map(r => r.text).join('\n\n--- PAGE BREAK ---\n\n');

  let items: ExtractedItem[] | undefined;
  if (options?.extractItems) {
    const combinedResult: OCRResult = {
      text: combinedText,
      confidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      blocks: results.flatMap(r => r.blocks),
      language: results[0]?.language || 'en',
      processingTime: results.reduce((sum, r) => sum + r.processingTime, 0),
    };
    items = await extractItemsFromOCRText(combinedResult);
  }

  return { results, combinedText, items };
}

export { detectImageMimeType, buildOCRPrompt };
