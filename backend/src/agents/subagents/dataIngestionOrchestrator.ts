/**
 * Data Ingestion Orchestrator
 * 
 * Coordinates the multi-agent data ingestion pipeline:
 * 1. Receives files/text from user
 * 2. Dispatches to appropriate parser agents in parallel
 * 3. Collects raw extracted items
 * 4. Sends to normalizer for standardization
 * 5. Returns unified PortfolioItem[] result
 * 
 * Now integrated with Self-Improving RAG for continuous learning.
 */

import { v4 as uuidv4 } from 'uuid';
import { normalizeTenantId } from '../../utils/tenant';

// Import parser agents
import { parsePDF, PDFParserInput, PDFParserOutput, extractWithChunkingProgressive } from './ingestion/pdfParserAgent';
import { parseExcel, ExcelParserInput, ExcelParserOutput } from './ingestion/excelParserAgent';
import { parseText, TextParserInput, TextParserOutput } from './ingestion/textParserAgent';
import { normalizeItems, NormalizedItem, NormalizerOutput } from './ingestion/normalizerAgent';
import { RawExtractedItem } from './ingestion/pdfParserAgent';
import pdfParse from 'pdf-parse';

// Import Self-Improving RAG
import { getSelfImprovingRAGOrchestrator } from '../selfImproving';

// Import HITL types
import { ImmediateLearningContext } from '../../types/hitl';

// Import Document Understanding (Phase 2.2)
import {
  analyzeDocumentStructure,
  DocumentUnderstandingInput,
  DocumentUnderstandingResult
} from './ingestion/documentUnderstandingAgent';

// 🚀 Import Ingestion Accelerator (Option A integration)
import {
  accelerateIngestion,
  AcceleratorInput,
  AcceleratorOutput
} from './ingestion/ingestionAcceleratorAgent';

// Input types
export interface FileInput {
  id: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface IngestionInput {
  files?: FileInput[];
  text?: string;
  tenantId: string;
  userContext?: string;
  language?: 'it' | 'en' | 'auto';
  options?: {
    maxParallelFiles?: number;
    skipNormalization?: boolean;
    targetSheet?: string; // For Excel files
    useAccelerator?: boolean; // 🚀 Use IngestionAcceleratorAgent for faster processing
  };
}

// Output types
export interface ParsingResult {
  fileId?: string;
  fileName?: string;
  source: 'pdf' | 'excel' | 'text';
  success: boolean;
  items: RawExtractedItem[];
  confidence: number;
  processingTime: number;
  notes: string[];
  // Phase 2.2: Document Understanding
  documentAnalysis?: DocumentUnderstandingResult;
}

export interface IngestionOutput {
  success: boolean;
  requestId: string;
  
  // Raw extraction results
  parsing: {
    results: ParsingResult[];
    totalRawItems: number;
    totalProcessingTime: number;
  };
  
  // Normalized results
  normalization: {
    items: NormalizedItem[];
    stats: {
      totalInput: number;
      totalNormalized: number;
      byType: { products: number; services: number }; // REMOVED initiatives
      avgConfidence: number;
    };
    processingTime: number;
  };
  
  // Summary
  summary: {
    filesProcessed: number;
    textProcessed: boolean;
    totalItemsExtracted: number;
    totalItemsNormalized: number;
    overallConfidence: number;
    totalProcessingTime: number;
  };
  
  // Errors and warnings
  errors: string[];
  warnings: string[];
}

// MIME type to parser mapping
const MIME_TO_PARSER: Record<string, 'pdf' | 'excel' | 'text'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel', // xlsx
  'application/vnd.ms-excel': 'excel', // xls
  'text/csv': 'excel', // CSV handled by Excel parser
  'application/json': 'text',
  'text/plain': 'text',
};

/**
 * Detect parser type from MIME type
 */
function getParserType(mimeType: string): 'pdf' | 'excel' | 'text' {
  return MIME_TO_PARSER[mimeType] || 'text';
}

/**
 * Process a single file with appropriate parser
 */
async function processFile(
  file: FileInput,
  userContext: string,
  language: string,
  targetSheet?: string
): Promise<ParsingResult> {
  const parserType = getParserType(file.mimeType);
  
  console.log(`📁 Processing file: ${file.fileName} (${parserType})`);
  
  try {
    switch (parserType) {
      case 'pdf': {
        const input: PDFParserInput = {
          fileBuffer: file.buffer,
          fileName: file.fileName,
          userContext,
          language: language as 'it' | 'en',
        };
        const result = await parsePDF(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'pdf',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }
      
      case 'excel': {
        const input: ExcelParserInput = {
          fileBuffer: file.buffer,
          fileName: file.fileName,
          userContext,
          targetSheet,
          language: language as 'it' | 'en',
        };
        const result = await parseExcel(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'excel',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }
      
      case 'text':
      default: {
        // For text files, read content
        const textContent = file.buffer.toString('utf-8');
        const input: TextParserInput = {
          text: textContent,
          userContext,
          language: language as 'it' | 'en',
        };
        const result = await parseText(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'text',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }
    }
  } catch (error) {
    return {
      fileId: file.id,
      fileName: file.fileName,
      source: parserType,
      success: false,
      items: [],
      confidence: 0,
      processingTime: 0,
      notes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Process text input
 */
async function processText(
  text: string,
  userContext: string,
  language: string
): Promise<ParsingResult> {
  console.log(`📝 Processing text input (${text.length} chars)`);
  
  try {
    const input: TextParserInput = {
      text,
      userContext,
      language: language as 'it' | 'en',
    };
    const result = await parseText(input);
    
    return {
      source: 'text',
      success: result.success,
      items: result.items,
      confidence: result.confidence,
      processingTime: result.processingTime,
      notes: [`Detected format: ${result.detectedFormat}`, ...result.extractionNotes],
    };
  } catch (error) {
    return {
      source: 'text',
      success: false,
      items: [],
      confidence: 0,
      processingTime: 0,
      notes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Main Ingestion Orchestrator
 */
export async function ingestData(input: IngestionInput): Promise<IngestionOutput> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting Data Ingestion - Request: ${requestId}`);
  const safeTenantId = normalizeTenantId(input.tenantId);
  if (safeTenantId !== input.tenantId) console.warn(`[Ingest] Invalid tenantId provided: "${input.tenantId}" - using system catalog fallback`);
  console.log(`   Tenant: ${safeTenantId}`);
  console.log(`   Files: ${input.files?.length || 0}`);
  console.log(`   Text: ${input.text ? `${input.text.length} chars` : 'none'}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsingResults: ParsingResult[] = [];
  
  const userContext = input.userContext || '';
  const language = input.language || 'auto';
  const maxParallel = input.options?.maxParallelFiles || 5;
  
  // Step 1: Process files in parallel (with concurrency limit)
  if (input.files && input.files.length > 0) {
    console.log(`📂 Processing ${input.files.length} files (max parallel: ${maxParallel})...`);
    
    // Batch files for parallel processing
    const batches: FileInput[][] = [];
    for (let i = 0; i < input.files.length; i += maxParallel) {
      batches.push(input.files.slice(i, i + maxParallel));
    }
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(file => processFile(
          file,
          userContext,
          language,
          input.options?.targetSheet
        ))
      );
      parsingResults.push(...batchResults);
    }
  }
  
  // Step 2: Process text input if provided
  if (input.text && input.text.trim()) {
    const textResult = await processText(input.text, userContext, language);
    parsingResults.push(textResult);
  }
  
  // Collect all raw items
  const allRawItems: RawExtractedItem[] = [];
  let parsingProcessingTime = 0;
  
  for (const result of parsingResults) {
    if (result.success) {
      allRawItems.push(...result.items);
    } else {
      errors.push(`Failed to parse ${result.fileName || result.source}: ${result.notes.join(', ')}`);
    }
    parsingProcessingTime += result.processingTime;
  }
  
  console.log(`\n📊 Parsing complete: ${allRawItems.length} raw items extracted`);
  
  // Step 3: Normalize items (unless skipped)
  let normalizationResult: NormalizerOutput;
  
  if (input.options?.skipNormalization) {
    console.log('⏭️  Skipping normalization (as requested)');
    normalizationResult = {
      success: true,
      items: allRawItems.map(item => ({
        id: uuidv4(),
        name: item.name,
        description: item.description || '',
        type: (item.rawType as 'initiative' | 'product' | 'service') || 'initiative',
        status: 'proposed' as const,
        priority: item.rawPriority || undefined,
        budget: item.budget,
        owner: item.owner,
        startDate: item.startDate,
        endDate: item.endDate,
        technologies: item.technologies,
        stakeholders: item.stakeholders,
        dependencies: item.dependencies,
        risks: item.risks,
        kpis: item.kpis,
        confidence: 0.5,
        normalizationNotes: ['Skipped normalization'],
      })) as NormalizedItem[],
      stats: {
        totalInput: allRawItems.length,
        totalNormalized: allRawItems.length,
        byType: {
          products: allRawItems.filter(i => i.rawType === 'product').length,
          services: allRawItems.filter(i => i.rawType === 'service').length,
        },
        avgConfidence: 0.5,
      },
      processingTime: 0,
    };
  } else if (allRawItems.length > 0) {
    console.log(`🔄 Normalizing ${allRawItems.length} items...`);
    normalizationResult = await normalizeItems({
      items: allRawItems,
      tenantId: safeTenantId,
      userContext,
      language: language === 'auto' ? 'it' : language,
    });
    
    if (!normalizationResult.success) {
      warnings.push('Normalization completed with errors');
    }
  } else {
    normalizationResult = {
      success: false,
      items: [],
      stats: {
        totalInput: 0,
        totalNormalized: 0,
        byType: { products: 0, services: 0 },
        avgConfidence: 0,
      },
      processingTime: 0,
    };
    warnings.push('No items extracted from inputs');
  }
  
  // Step 4: Calculate summary
  const totalProcessingTime = Date.now() - startTime;
  const filesProcessed = input.files?.length || 0;
  const textProcessed = !!(input.text && input.text.trim());
  
  const avgParsingConfidence = parsingResults.length > 0
    ? parsingResults.reduce((sum, r) => sum + r.confidence, 0) / parsingResults.length
    : 0;
  
  const overallConfidence = normalizationResult.items.length > 0
    ? (avgParsingConfidence + normalizationResult.stats.avgConfidence) / 2
    : 0;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Ingestion Complete - Request: ${requestId}`);
  console.log(`   Files processed: ${filesProcessed}`);
  console.log(`   Text processed: ${textProcessed}`);
  console.log(`   Raw items: ${allRawItems.length}`);
  console.log(`   Normalized items: ${normalizationResult.items.length}`);
  console.log(`   Confidence: ${(overallConfidence * 100).toFixed(1)}%`);
  console.log(`   Total time: ${totalProcessingTime}ms`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Step 5: Self-Improving RAG Integration
  // Post-process extraction for learning
  try {
    const ragOrchestrator = getSelfImprovingRAGOrchestrator();
    
    // Create extraction result for RAG learning
    const extractionResult = {
      id: requestId,
      items: normalizationResult.items.map(item => {
        // Build attributes object, filtering out undefined values
        const attributes: Record<string, string> = { status: item.status };
        if (item.priority) attributes.priority = item.priority;
        if (item.budget) attributes.budget = item.budget.toString();
        
        return {
          name: item.name,
          description: item.description,
          category: item.type,
          type: item.type,
          vendor: item.owner,
          attributes
        };
      }),
      documentId: requestId,
      timestamp: new Date(),
      confidence: overallConfidence
    };
    
    // Document info for learning
    const documentInfo = {
      id: requestId,
      name: input.files?.[0]?.fileName || 'text-input',
      type: input.files?.[0]?.mimeType || 'text/plain',
      content: input.text || '',
      metadata: {
        tenantId: safeTenantId,
        filesCount: filesProcessed,
        textProcessed
      }
    };
    
    // Post-process for learning (non-blocking)
    ragOrchestrator.postProcessExtraction(
      extractionResult,
      documentInfo,
      [], // patterns used (would come from pre-processing)
      totalProcessingTime,
      0 // tokens used
    ).catch(err => {
      console.warn('[RAG Learning] Post-processing failed:', err.message);
    });
    
    console.log('🧠 Queued for RAG learning');
  } catch (ragError) {
    console.warn('[RAG] Self-improving integration skipped:', ragError);
  }
  
  return {
    success: normalizationResult.items.length > 0 || allRawItems.length > 0,
    requestId,
    
    parsing: {
      results: parsingResults,
      totalRawItems: allRawItems.length,
      totalProcessingTime: parsingProcessingTime,
    },
    
    normalization: {
      items: normalizationResult.items,
      stats: normalizationResult.stats,
      processingTime: normalizationResult.processingTime,
    },
    
    summary: {
      filesProcessed,
      textProcessed,
      totalItemsExtracted: allRawItems.length,
      totalItemsNormalized: normalizationResult.items.length,
      overallConfidence,
      totalProcessingTime,
    },
    
    errors,
    warnings,
  };
}

/**
 * Convenience function for single file ingestion
 */
export async function ingestFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  tenantId: string,
  userContext?: string
): Promise<IngestionOutput> {
  return ingestData({
    files: [{
      id: uuidv4(),
      buffer,
      fileName,
      mimeType,
      size: buffer.length,
    }],
    tenantId,
    userContext,
  });
}

/**
 * Convenience function for text-only ingestion
 */
export async function ingestText(
  text: string,
  tenantId: string,
  userContext?: string
): Promise<IngestionOutput> {
  return ingestData({
    text,
    tenantId,
    userContext,
  });
}

// ============================================================================
// HITL Streaming Ingestion
// ============================================================================

/**
 * Extended input for HITL streaming
 */
export interface StreamingIngestionInput extends IngestionInput {
  hitlContext?: ImmediateLearningContext;
  batchSize?: number;
}

/**
 * Streaming event types
 */
export type StreamingEvent =
  | { type: 'progress'; data: { phase: string; message: string; percent: number; currentFile?: string } }
  | {
      type: 'preview';
      data: {
        items: NormalizedItem[];
        chunkIndex: number;
        totalChunks: number;
        itemsExtractedSoFar: number;
        itemsInThisChunk: number;
        categoriesDetected: string[];
        message: string;
        notes?: string[];
        autoConfirmedCount?: number; // Items auto-confirmed via patterns
        patternsApplied?: string[]; // Which patterns were applied
        isRaw?: boolean; // NEW: Flag for raw items (not yet enriched)
        useAccelerator?: boolean; // NEW: Flag if accelerator mode is enabled
      }
    }
  | {
      type: 'pattern_learned';
      data: {
        message: string;
        confirmedPatterns: number;
        rejectedPatterns: number;
        willInfluenceChunks: number[]; // Which remaining chunks will be affected
      }
    }
  | { type: 'batch'; data: { items: NormalizedItem[]; batchIndex: number } }
  | { type: 'complete'; data: { totalItems: number; processingTimeMs: number } }
  | { type: 'error'; data: { message: string; recoverable: boolean } };

/**
 * Process a single file with HITL context injection
 */
async function processFileWithContext(
  file: FileInput,
  userContext: string,
  language: string,
  hitlContext?: ImmediateLearningContext,
  targetSheet?: string
): Promise<ParsingResult> {
  const parserType = getParserType(file.mimeType);

  // Build enhanced user context with HITL learning
  let enhancedContext = userContext;
  if (hitlContext && hitlContext.contextPrompt) {
    enhancedContext = `${userContext}\n\n${hitlContext.contextPrompt}`;
  }

  console.log(`📁 [HITL] Processing file: ${file.fileName} (${parserType})`);
  if (hitlContext?.totalConfirmed) {
    console.log(`   🎯 With HITL context: ${hitlContext.totalConfirmed} confirmed, ${hitlContext.totalRejected} rejected`);
  }

  try {
    switch (parserType) {
      case 'pdf': {
        const input: PDFParserInput = {
          fileBuffer: file.buffer,
          fileName: file.fileName,
          userContext: enhancedContext,
          language: language as 'it' | 'en',
        };
        const result = await parsePDF(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'pdf',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }

      case 'excel': {
        const input: ExcelParserInput = {
          fileBuffer: file.buffer,
          fileName: file.fileName,
          userContext: enhancedContext,
          language: language as 'it' | 'en',
          targetSheet,
        };
        const result = await parseExcel(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'excel',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }

      case 'text':
      default: {
        const input: TextParserInput = {
          text: file.buffer.toString('utf-8'),
          userContext: enhancedContext,
          language: language as 'it' | 'en',
        };
        const result = await parseText(input);
        return {
          fileId: file.id,
          fileName: file.fileName,
          source: 'text',
          success: result.success,
          items: result.items,
          confidence: result.confidence,
          processingTime: result.processingTime,
          notes: result.extractionNotes,
        };
      }
    }
  } catch (error) {
    return {
      fileId: file.id,
      fileName: file.fileName,
      source: parserType,
      success: false,
      items: [],
      confidence: 0,
      processingTime: 0,
      notes: [`Error: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Streaming Ingestion Orchestrator with HITL support
 *
 * Yields items in batches as they are extracted and normalized,
 * allowing real-time feedback from the user.
 */
export async function* ingestDataStreaming(
  input: StreamingIngestionInput
): AsyncGenerator<StreamingEvent> {
  const startTime = Date.now();
  const batchSize = input.batchSize || 5;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 Starting HITL Streaming Ingestion`);
  console.log(`   Tenant: ${input.tenantId}`);
  console.log(`   Files: ${input.files?.length || 0}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`${'='.repeat(60)}\n`);

  const userContext = input.userContext || '';
  const language = input.language || 'it';

  // Accumulator for items to batch
  let itemBuffer: NormalizedItem[] = [];
  let batchIndex = 0;
  let totalItems = 0;

  // Process files sequentially (not parallel) to enable streaming
  if (input.files && input.files.length > 0) {
    for (let fileIndex = 0; fileIndex < input.files.length; fileIndex++) {
      const file = input.files[fileIndex];
      const isPDF = file.mimeType === 'application/pdf';

      // Progress event
      yield {
        type: 'progress',
        data: {
          phase: 'parsing',
          message: `📄 Elaborazione file ${fileIndex + 1}/${input.files.length}: ${file.fileName}`,
          percent: Math.round((fileIndex / input.files.length) * 50),
          currentFile: file.fileName,
        },
      };

      // ========================================================================
      // PROGRESSIVE PDF EXTRACTION (chunk-by-chunk)
      // ========================================================================
      if (isPDF) {
        try {
          // Extract text from PDF first
          console.log(`📄 [HITL] Parsing PDF: ${file.fileName}`);
          const pdfData = await pdfParse(file.buffer);
          const text = pdfData.text;

          if (!text || text.trim().length < 50) {
            yield {
              type: 'error',
              data: {
                message: `PDF ${file.fileName} contiene poco testo`,
                recoverable: true,
              },
            };
            continue;
          }

          console.log(`📄 [HITL] PDF parsed: ${pdfData.numpages} pages, ${text.length} chars`);

          // 🚀 ACCELERATOR MODE: Use optimized accelerator agent if enabled
          const useAccelerator = input.options?.useAccelerator === true || process.env.USE_ACCELERATOR === 'true';

          if (useAccelerator) {
            console.log(`🚀🚀🚀 [ACCELERATOR] Using IngestionAcceleratorAgent for ${file.fileName}`);

            try {
              const acceleratorStartTime = Date.now();

              // Yield progress while accelerator works
              yield {
                type: 'progress',
                data: {
                  phase: 'parsing',
                  message: `🚀 Acceleratore attivo - Elaborazione parallela avanzata...`,
                  percent: Math.round((fileIndex / input.files.length) * 50 + 10),
                  currentFile: file.fileName,
                },
              };

              // Call accelerator with PDF text
              const acceleratorResult = await accelerateIngestion({
                tenantId: input.tenantId,
                content: text,
                contentType: 'text', // Already extracted text from PDF
                fileName: file.fileName,
                options: {
                  enableParallelProcessing: true,
                  enableCaching: true,
                  enableBatching: true,
                  enableSmartDedup: true,
                },
              });

              const acceleratorTime = Date.now() - acceleratorStartTime;
              console.log(`🚀 [ACCELERATOR] Completed in ${acceleratorTime}ms - ${acceleratorResult.items.length} items`);
              console.log(`   ⚡ Speedup: ${acceleratorResult.metrics.parallelSpeedup}x`);
              console.log(`   📊 Cache hit rate: ${Math.round(acceleratorResult.cacheStats.hitRate * 100)}%`);
              console.log(`   🔄 Dedup removed: ${acceleratorResult.dedupStats.duplicatesRemoved} items`);

              // Convert accelerator items to streaming events
              const chunkSize = 10; // Simulate chunk-based streaming for UI
              const chunks = [];
              for (let i = 0; i < acceleratorResult.items.length; i += chunkSize) {
                chunks.push(acceleratorResult.items.slice(i, i + chunkSize));
              }

              // Yield items in simulated chunks for UI compatibility
              for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
                const chunkItems = chunks[chunkIdx];

                // Convert NormalizedItem to format expected by frontend
                const previewItems = chunkItems.map(item => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  type: item.type,
                  status: item.status || 'active',
                  category: item.category,
                  subcategory: undefined,
                  confidence: item.confidence,
                  budget: undefined,
                  extraction_metadata: item.extraction_metadata || {
                    source_type: 'pdf_text' as const,
                    chunk_index: chunkIdx,
                    raw: false, // Already normalized by accelerator
                  },
                }));

                yield {
                  type: 'preview',
                  data: {
                    items: previewItems,
                    chunkIndex: chunkIdx,
                    totalChunks: chunks.length,
                    itemsExtractedSoFar: (chunkIdx + 1) * chunkSize,
                    itemsInThisChunk: previewItems.length,
                    categoriesDetected: [...new Set(previewItems.map(i => i.category).filter((c): c is string => Boolean(c)))].slice(0, 5),
                    message: `🚀 Acceleratore: ${previewItems.length} items (batch ${chunkIdx + 1}/${chunks.length})`,
                    notes: [`Processed by IngestionAccelerator in ${acceleratorTime}ms`],
                    isRaw: false, // Already normalized
                    useAccelerator: true, // Flag for accelerator mode
                  },
                };

                // Add to buffer for final batch event
                itemBuffer.push(...previewItems);
                totalItems += previewItems.length;
              }

              // Skip the regular extraction path
              continue;

            } catch (acceleratorError) {
              console.error(`❌ [ACCELERATOR] Error, falling back to standard pipeline:`, acceleratorError);
              // Fall through to standard pipeline
            }
          }

          // Use progressive chunking for large PDFs
          const useProgressive = text.length > 15000;

          if (useProgressive) {
            console.log(`🚀 [HITL] Using PROGRESSIVE extraction for ${file.fileName}`);

            // Progressive extraction: yield items chunk-by-chunk
            for await (const chunkEvent of extractWithChunkingProgressive(
              text,
              userContext,
              language as 'it' | 'en',
              input.hitlContext
            )) {
              if (chunkEvent.type === 'batch_start') {
                // 🚀 PARALLEL BATCH: Notify frontend that a batch is starting
                const batchIdx = ((chunkEvent as { batchIndex?: number }).batchIndex || 0) + 1;
                const totalBatches = (chunkEvent as { totalBatches?: number }).totalBatches || 1;
                const chunkIdx = (chunkEvent.chunkIndex || 0) + 1;
                const totalChunks = chunkEvent.totalChunks || 1;
                const percent = Math.round((fileIndex / input.files.length + ((chunkEvent.chunkIndex || 0) / (chunkEvent.totalChunks || 1)) / input.files.length) * 50);

                yield {
                  type: 'progress',
                  data: {
                    phase: 'parsing',
                    message: `🚀 Batch ${batchIdx}/${totalBatches} - Elaborazione parallela di ${Math.min(4, totalChunks - chunkIdx + 1)} sezioni...`,
                    percent,
                    currentFile: file.fileName,
                  },
                };
              } else if (chunkEvent.type === 'chunk_start') {
                // ✨ BETTER: More detailed progress message
                const chunkIdx = (chunkEvent.chunkIndex || 0) + 1;
                const totalChunks = chunkEvent.totalChunks || 1;
                const percent = Math.round((fileIndex / input.files.length + ((chunkEvent.chunkIndex || 0) / (chunkEvent.totalChunks || 1)) / input.files.length) * 50);

                yield {
                  type: 'progress',
                  data: {
                    phase: 'parsing',
                    message: `📊 Analisi sezione ${chunkIdx}/${totalChunks} - Estrazione in corso con GPT-4o...`,
                    percent,
                    currentFile: file.fileName,
                  },
                };
              } else if (chunkEvent.type === 'chunk_complete' && chunkEvent.items && chunkEvent.items.length > 0) {
                // ⚡ SPEED OPTIMIZATION: Emit preview with RAW items IMMEDIATELY
                // This shows items to user WITHOUT waiting for slow normalization
                const rawItems = chunkEvent.items;
                const chunkIndex = chunkEvent.chunkIndex || 0;

                // Quick type assignment (no LLM, no RAG) - just basic inference
                const { v4: uuidv4 } = require('uuid');
                const quickItems = rawItems.map(item => ({
                  id: uuidv4(),
                  name: item.name || 'Unknown',
                  description: item.description || undefined,
                  type: (item.rawType?.toLowerCase().includes('service') || item.rawType?.toLowerCase().includes('servizio')) ? 'service' as const : 'product' as const,
                  status: 'active' as const,
                  category: item.rawType || 'General',
                  subcategory: undefined,
                  confidence: 0.7, // Base confidence for raw items
                  budget: item.budget || undefined,
                  extraction_metadata: {
                    source_type: 'pdf_text' as const,
                    chunk_index: chunkIndex,
                    raw: true, // Flag that this is raw, not normalized
                  },
                }));

                // Extract categories for feedback
                const categoriesInChunk = new Set(
                  rawItems
                    .map(item => item.rawType)
                    .filter((cat): cat is string => Boolean(cat))
                );

                console.log(`   ⚡ [FAST PREVIEW] Chunk ${chunkIndex + 1}/${chunkEvent.totalChunks}: ${quickItems.length} items (RAW, no normalization delay)`);

                // EMIT PREVIEW IMMEDIATELY (before slow normalization)
                yield {
                  type: 'preview',
                  data: {
                    items: quickItems,
                    chunkIndex: chunkIndex,
                    totalChunks: chunkEvent.totalChunks || 1,
                    itemsExtractedSoFar: totalItems + quickItems.length,
                    itemsInThisChunk: quickItems.length,
                    categoriesDetected: Array.from(categoriesInChunk).slice(0, 5),
                    message: `Chunk ${chunkIndex + 1}/${chunkEvent.totalChunks}: ${quickItems.length} items trovati`,
                    notes: chunkEvent.notes,
                    isRaw: true, // Flag that these are raw items, enrichment coming later
                    useAccelerator: false, // Standard pipeline
                  },
                };

                // NOW run normalization in background (for final items)
                // This doesn't block the preview
                const normalizationResult = await normalizeItems({
                  items: chunkEvent.items,
                  tenantId: input.tenantId,
                  userContext: input.hitlContext?.contextPrompt
                    ? `${userContext}\n\n${input.hitlContext.contextPrompt}`
                    : userContext,
                  language: language === 'auto' ? 'it' : language,
                });

                // Use normalized items for final processing
                const chunkItems = normalizationResult.items;

                // ⚡ EARLY FEEDBACK: Apply learned patterns to chunks 2-5 (on normalized items)
                let autoConfirmedCount = 0;
                const patternsApplied: string[] = [];

                if (chunkIndex > 0 && input.hitlContext) {
                  const { confirmedPatterns, rejectedPatterns } = input.hitlContext;

                  // Apply confirmed patterns (e.g., "if category=Automotive, auto-confirm")
                  for (const item of chunkItems) {
                    let shouldAutoConfirm = false;

                    // Check if item matches any confirmed patterns
                    for (const pattern of confirmedPatterns) {
                      if (pattern.field === 'category' && item.category === pattern.confirmedValue) {
                        shouldAutoConfirm = true;
                        if (!patternsApplied.includes(`category=${pattern.confirmedValue}`)) {
                          patternsApplied.push(`category=${pattern.confirmedValue}`);
                        }
                      } else if (pattern.field === 'type' && item.type === pattern.confirmedValue) {
                        shouldAutoConfirm = true;
                        if (!patternsApplied.includes(`type=${pattern.confirmedValue}`)) {
                          patternsApplied.push(`type=${pattern.confirmedValue}`);
                        }
                      }
                    }

                    // Check if item matches rejected patterns (skip if so)
                    for (const pattern of rejectedPatterns) {
                      if (pattern.field === 'category' && item.category === pattern.value) {
                        shouldAutoConfirm = false; // Override confirmation
                        break;
                      }
                    }

                    if (shouldAutoConfirm) {
                      autoConfirmedCount++;
                      // Mark item as auto-confirmed
                      (item as any).__autoConfirmed = true;
                    }
                  }

                  if (autoConfirmedCount > 0) {
                    console.log(`   ⚡ [PATTERN] Auto-confirmed ${autoConfirmedCount}/${chunkItems.length} items via patterns: ${patternsApplied.join(', ')}`);
                  }
                }

                console.log(`   ✅ [NORMALIZED] Chunk ${chunkIndex + 1}/${chunkEvent.totalChunks}: ${chunkItems.length} items enriched`);

                // Add normalized items to buffer (for batch processing)
                for (const item of normalizationResult.items) {
                  itemBuffer.push(item);
                  totalItems++;

                  // Yield batch IMMEDIATELY when buffer is full
                  if (itemBuffer.length >= batchSize) {
                    console.log(`   📦 [HITL] Yielding batch ${batchIndex + 1} (${itemBuffer.length} items)`);
                    yield {
                      type: 'batch',
                      data: {
                        items: [...itemBuffer],
                        batchIndex,
                      },
                    };
                    itemBuffer = [];
                    batchIndex++;
                  }
                }
              }
            }
          } else {
            // Small PDF: use non-progressive extraction (backward compatible)
            const parsingResult = await processFileWithContext(
              file,
              userContext,
              language,
              input.hitlContext,
              input.options?.targetSheet
            );

            if (parsingResult.success && parsingResult.items.length > 0) {
              const normalizationResult = await normalizeItems({
                items: parsingResult.items,
                tenantId: input.tenantId,
                userContext: input.hitlContext?.contextPrompt
                  ? `${userContext}\n\n${input.hitlContext.contextPrompt}`
                  : userContext,
                language: language === 'auto' ? 'it' : language,
              });

              for (const item of normalizationResult.items) {
                itemBuffer.push(item);
                totalItems++;

                if (itemBuffer.length >= batchSize) {
                  yield {
                    type: 'batch',
                    data: {
                      items: [...itemBuffer],
                      batchIndex,
                    },
                  };
                  itemBuffer = [];
                  batchIndex++;
                }
              }
            }
          }
        } catch (pdfError) {
          console.error(`❌ [HITL] PDF processing error:`, pdfError);
          yield {
            type: 'error',
            data: {
              message: `Errore PDF ${file.fileName}: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`,
              recoverable: true,
            },
          };
        }
      } else {
        // ========================================================================
        // NON-PDF FILES: use existing logic (Excel, JSON, etc.)
        // ========================================================================
        const parsingResult = await processFileWithContext(
          file,
          userContext,
          language,
          input.hitlContext,
          input.options?.targetSheet
        );

        if (!parsingResult.success || parsingResult.items.length === 0) {
          yield {
            type: 'error',
            data: {
              message: `Errore parsing ${file.fileName}: ${parsingResult.notes.join(', ')}`,
              recoverable: true,
            },
          };
          continue;
        }

        const normalizationResult = await normalizeItems({
          items: parsingResult.items,
          tenantId: input.tenantId,
          userContext: input.hitlContext?.contextPrompt
            ? `${userContext}\n\n${input.hitlContext.contextPrompt}`
            : userContext,
          language: language === 'auto' ? 'it' : language,
        });

        for (const item of normalizationResult.items) {
          itemBuffer.push(item);
          totalItems++;

          if (itemBuffer.length >= batchSize) {
            yield {
              type: 'batch',
              data: {
                items: [...itemBuffer],
                batchIndex,
              },
            };
            itemBuffer = [];
            batchIndex++;
          }
        }
      }
    }
  }

  // Process text input if provided
  if (input.text && input.text.trim()) {
    yield {
      type: 'progress',
      data: {
        phase: 'parsing',
        message: 'Elaborazione testo...',
        percent: 90,
      },
    };

    const enhancedContext = input.hitlContext?.contextPrompt
      ? `${userContext}\n\n${input.hitlContext.contextPrompt}`
      : userContext;

    const textResult = await parseText({
      text: input.text,
      userContext: enhancedContext,
      language: language as 'it' | 'en',
    });

    if (textResult.success && textResult.items.length > 0) {
      const normalizationResult = await normalizeItems({
        items: textResult.items,
        tenantId: input.tenantId,
        userContext: enhancedContext,
        language: language === 'auto' ? 'it' : language,
      });

      for (const item of normalizationResult.items) {
        itemBuffer.push(item);
        totalItems++;

        if (itemBuffer.length >= batchSize) {
          yield {
            type: 'batch',
            data: {
              items: [...itemBuffer],
              batchIndex,
            },
          };
          itemBuffer = [];
          batchIndex++;
        }
      }
    }
  }

  // Yield remaining items in buffer
  if (itemBuffer.length > 0) {
    yield {
      type: 'batch',
      data: {
        items: [...itemBuffer],
        batchIndex,
      },
    };
  }

  // Complete event
  const processingTimeMs = Date.now() - startTime;
  console.log(`\n✅ HITL Streaming complete: ${totalItems} items in ${processingTimeMs}ms\n`);

  yield {
    type: 'complete',
    data: {
      totalItems,
      processingTimeMs,
    },
  };
}

export default {
  ingestData,
  ingestFile,
  ingestText,
  ingestDataStreaming,
};
