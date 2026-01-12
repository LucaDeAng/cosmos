/**
 * Document Pre-Processor
 *
 * Orchestrates document pre-processing pipeline:
 * 1. Layout analysis (visual structure)
 * 2. Section detection (TOC, body, appendix)
 * 3. Document relationship detection (multi-doc scenarios)
 * 4. Extraction plan generation
 *
 * This runs BEFORE actual content parsing to optimize extraction strategy.
 */

import { analyzeLayout, DocumentLayout } from './layoutAnalyzer';
import { detectSections, DocumentSection, SectionDetectionResult } from './sectionDetector';
import { detectRelationships, DocumentInfo, RelationshipDetectionResult } from './documentRelationshipDetector';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface PreProcessingInput {
  documents: Array<{
    id: string;
    filename: string;
    buffer: Buffer;
    textContent?: string; // Optional pre-extracted text
  }>;
  tenantId: string;
}

export interface DocumentPreProcessingResult {
  documentId: string;
  filename: string;
  layout: DocumentLayout;
  sections: DocumentSection[];
  extractionPlan: ExtractionPlan;
  preprocessingTime: number;
}

export interface ExtractionPlan {
  strategy: 'full_document' | 'section_targeted' | 'table_focused' | 'skip_document';
  prioritySections: string[]; // Section IDs to prioritize
  skipSections: string[]; // Section IDs to skip
  tableExtractionPages: number[]; // Pages with relevant tables
  estimatedItems: number;
  confidenceEstimate: number;
  reasoning: string;
}

export interface PreProcessingOutput {
  results: DocumentPreProcessingResult[];
  relationships: RelationshipDetectionResult;
  summary: {
    totalDocuments: number;
    documentsWithTables: number;
    documentsWithClearStructure: number;
    totalProcessingTime: number;
  };
}

// ============================================================
// MAIN FUNCTION: preprocessDocuments
// ============================================================

/**
 * Preprocesses multiple documents before extraction
 * @param input PreProcessingInput with document buffers
 * @returns PreProcessingOutput with analysis and extraction plans
 */
export async function preprocessDocuments(
  input: PreProcessingInput
): Promise<PreProcessingOutput> {
  console.log(`🔍 Pre-processing ${input.documents.length} documents for tenant ${input.tenantId}...`);

  const startTime = Date.now();
  const results: DocumentPreProcessingResult[] = [];

  try {
    // Step 1: Process each document individually (in parallel)
    const docResults = await Promise.all(
      input.documents.map(doc => preprocessSingleDocument(doc))
    );

    results.push(...docResults);

    // Step 2: Detect relationships between documents (if multiple)
    let relationships: RelationshipDetectionResult = {
      relationships: [],
      series: [],
      confidence: 1,
    };

    if (input.documents.length > 1) {
      const docInfos: DocumentInfo[] = input.documents.map((doc, index) => ({
        id: doc.id,
        filename: doc.filename,
        content: doc.textContent || '', // Use first 2000 chars for relationship detection
      }));

      relationships = await detectRelationships(docInfos);
    }

    // Step 3: Generate summary
    const totalProcessingTime = Date.now() - startTime;
    const documentsWithTables = results.filter(r => r.layout.visualElements.some(ve => ve.type === 'table')).length;
    const documentsWithClearStructure = results.filter(r => r.sections.length > 1).length;

    console.log(`✅ Pre-processing complete in ${totalProcessingTime}ms`);

    return {
      results,
      relationships,
      summary: {
        totalDocuments: input.documents.length,
        documentsWithTables,
        documentsWithClearStructure,
        totalProcessingTime,
      },
    };
  } catch (error) {
    console.error('❌ Error in document pre-processing:', error);
    throw error;
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Preprocesses a single document
 */
async function preprocessSingleDocument(doc: {
  id: string;
  filename: string;
  buffer: Buffer;
  textContent?: string;
}): Promise<DocumentPreProcessingResult> {
  const startTime = Date.now();

  console.log(`  📄 Pre-processing: ${doc.filename}`);

  try {
    // For PDFs, we might need to convert pages to images for vision analysis
    // For now, we'll use a simplified approach assuming pages are available
    const pages: Buffer[] = [doc.buffer]; // Placeholder - would need actual page extraction

    // Step 1: Layout analysis
    const layout = await analyzeLayout(pages, doc.filename);

    // Step 2: Section detection
    const textContent = doc.textContent || extractTextFromBuffer(doc.buffer);
    const sectionResult = await detectSections(textContent, layout);

    // Step 3: Generate extraction plan
    const extractionPlan = generateExtractionPlan(layout, sectionResult);

    const processingTime = Date.now() - startTime;

    return {
      documentId: doc.id,
      filename: doc.filename,
      layout,
      sections: sectionResult.sections,
      extractionPlan,
      preprocessingTime: processingTime,
    };
  } catch (error) {
    console.error(`  ❌ Error pre-processing ${doc.filename}:`, error);

    // Return fallback result
    return {
      documentId: doc.id,
      filename: doc.filename,
      layout: {
        pageCount: 1,
        orientation: 'portrait',
        hasHeaderFooter: false,
        hasPageNumbers: false,
        hasTableOfContents: false,
        columnLayout: 'single',
        visualElements: [],
        confidence: 0,
      },
      sections: [],
      extractionPlan: {
        strategy: 'full_document',
        prioritySections: [],
        skipSections: [],
        tableExtractionPages: [],
        estimatedItems: 0,
        confidenceEstimate: 0.3,
        reasoning: 'Fallback plan due to pre-processing error',
      },
      preprocessingTime: Date.now() - startTime,
    };
  }
}

/**
 * Generates extraction plan based on layout and sections
 */
function generateExtractionPlan(
  layout: DocumentLayout,
  sectionResult: SectionDetectionResult
): ExtractionPlan {
  let strategy: ExtractionPlan['strategy'] = 'full_document';
  const prioritySections: string[] = [];
  const skipSections: string[] = [];
  let tableExtractionPages: number[] = [];
  let estimatedItems = 0;
  let confidenceEstimate = 0.5;
  let reasoning = '';

  // Strategy 1: Table-focused (if tables detected)
  const relevantTables = layout.visualElements.filter(
    ve => ve.type === 'table' && ve.isRelevant
  );

  if (relevantTables.length > 0) {
    strategy = 'table_focused';
    tableExtractionPages = [...new Set(relevantTables.map(t => t.page))];
    estimatedItems = relevantTables.length * 5; // Estimate 5 items per table
    confidenceEstimate = Math.min(
      0.9,
      relevantTables.reduce((sum, t) => sum + t.confidence, 0) / relevantTables.length
    );
    reasoning = `Document contains ${relevantTables.length} relevant table(s). ` +
                `Focus on extracting structured data from tables on pages: ${tableExtractionPages.join(', ')}`;
  }
  // Strategy 2: Section-targeted (if clear structure)
  else if (sectionResult.hasClearStructure) {
    strategy = 'section_targeted';

    // Prioritize high-relevance sections
    const highRelevanceSections = sectionResult.sections.filter(s => s.relevance >= 0.7);
    prioritySections.push(...highRelevanceSections.map(s => s.id));

    // Skip low-relevance sections
    const lowRelevanceSections = sectionResult.sections.filter(s => s.relevance < 0.3);
    skipSections.push(...lowRelevanceSections.map(s => s.id));

    estimatedItems = highRelevanceSections.length * 3; // Estimate 3 items per section
    confidenceEstimate = sectionResult.confidence;
    reasoning = `Document has clear structure with ${sectionResult.sections.length} sections. ` +
                `Prioritizing ${highRelevanceSections.length} high-relevance sections, ` +
                `skipping ${lowRelevanceSections.length} low-relevance sections.`;
  }
  // Strategy 3: Full document (fallback)
  else {
    strategy = 'full_document';
    estimatedItems = Math.ceil(layout.pageCount / 2); // Rough estimate
    confidenceEstimate = 0.5;
    reasoning = 'Document structure is unclear. Processing full document with generic extraction.';
  }

  // Skip document if no relevant content
  if (relevantTables.length === 0 && sectionResult.sections.length === 0 && layout.pageCount > 50) {
    strategy = 'skip_document';
    estimatedItems = 0;
    confidenceEstimate = 0.1;
    reasoning = 'Large document with no detected tables or clear structure. Consider manual review.';
  }

  return {
    strategy,
    prioritySections,
    skipSections,
    tableExtractionPages,
    estimatedItems,
    confidenceEstimate,
    reasoning,
  };
}

/**
 * Extracts text from buffer (simplified - would use proper PDF/DOCX parsers)
 */
function extractTextFromBuffer(buffer: Buffer): string {
  try {
    // For text-based formats
    return buffer.toString('utf-8', 0, Math.min(10000, buffer.length));
  } catch {
    return '';
  }
}

// ============================================================
// EXPORT
// ============================================================

export default {
  preprocessDocuments,
};
