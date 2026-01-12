/**
 * Layout Analyzer
 *
 * Analyzes visual layout of documents using GPT-4 Vision:
 * - Page orientation and column layout
 * - Headers, footers, page numbers
 * - Visual elements (tables, charts, images)
 * - Document structure patterns
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentLayout {
  pageCount: number;
  orientation: 'portrait' | 'landscape' | 'mixed';
  hasHeaderFooter: boolean;
  hasPageNumbers: boolean;
  hasTableOfContents: boolean;
  columnLayout: 'single' | 'double' | 'multi' | 'mixed';
  visualElements: VisualElement[];
  confidence: number;
}

export interface VisualElement {
  type: 'table' | 'chart' | 'image' | 'diagram' | 'text_block';
  page: number;
  boundingBox: BoundingBox;
  description: string;
  confidence: number;
  isRelevant: boolean;
}

export interface PageLayout {
  pageNumber: number;
  orientation: 'portrait' | 'landscape';
  hasHeader: boolean;
  hasFooter: boolean;
  hasPageNumber: boolean;
  columnCount: 1 | 2 | 3;
  visualElements: VisualElement[];
  isTOC: boolean;
  isAppendix: boolean;
}

// ============================================================
// MAIN FUNCTION: analyzeLayout
// ============================================================

/**
 * Analyzes document layout using vision model
 * @param pages Array of page image buffers
 * @param filename Document filename for context
 * @returns DocumentLayout with structural information
 */
export async function analyzeLayout(
  pages: Buffer[],
  filename: string
): Promise<DocumentLayout> {
  console.log(`📐 Analyzing document layout: ${filename} (${pages.length} pages)`);

  if (pages.length === 0) {
    return getEmptyLayout();
  }

  try {
    // Analyze sample pages (first 5 for performance)
    const sampleCount = Math.min(5, pages.length);
    const samplePages = pages.slice(0, sampleCount);

    const pageLayouts = await Promise.all(
      samplePages.map((page, index) => analyzePageLayout(page, index + 1))
    );

    // Aggregate page-level analysis into document-level layout
    const layout = aggregateLayout(pageLayouts, pages.length);

    console.log(
      `✅ Layout analysis complete: ${layout.orientation}, ${layout.columnLayout} columns, ` +
      `${layout.visualElements.length} visual elements`
    );

    return layout;
  } catch (error) {
    console.error('❌ Error analyzing layout:', error);
    return getEmptyLayout();
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Analyzes a single page layout using GPT-4 Vision
 */
async function analyzePageLayout(
  pageBuffer: Buffer,
  pageNumber: number
): Promise<PageLayout> {
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0,
    maxTokens: 2000,
  });

  const layoutPrompt = `Analyze this document page layout and return ONLY valid JSON:

{
  "orientation": "portrait" or "landscape",
  "hasHeader": true/false,
  "hasFooter": true/false,
  "hasPageNumber": true/false,
  "columnCount": 1 or 2 or 3,
  "visualElements": [
    {
      "type": "table" | "chart" | "image" | "diagram" | "text_block",
      "boundingBox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1},
      "description": "brief description",
      "confidence": 0.0-1.0,
      "isRelevant": true/false (relevant for portfolio data extraction)
    }
  ],
  "isTOC": true/false (is this a table of contents page),
  "isAppendix": true/false (is this an appendix page)
}

Rules:
- Bounding boxes use normalized coordinates (0-1)
- Only include visual elements clearly visible in the page
- Mark tables and charts as relevant if they contain business/portfolio data
- Detect TOC by typical patterns: numbered sections, page references, indentation`;

  try {
    const base64Image = pageBuffer.toString('base64');

    const message = new HumanMessage({
      content: [
        { type: 'text', text: layoutPrompt },
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
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      pageNumber,
      orientation: parsed.orientation || 'portrait',
      hasHeader: parsed.hasHeader || false,
      hasFooter: parsed.hasFooter || false,
      hasPageNumber: parsed.hasPageNumber || false,
      columnCount: parsed.columnCount || 1,
      visualElements: (parsed.visualElements || []).map((ve: any, index: number) => ({
        type: ve.type || 'text_block',
        page: pageNumber,
        boundingBox: ve.boundingBox || { x: 0, y: 0, width: 1, height: 1 },
        description: ve.description || '',
        confidence: ve.confidence || 0.5,
        isRelevant: ve.isRelevant !== false,
      })),
      isTOC: parsed.isTOC || false,
      isAppendix: parsed.isAppendix || false,
    };
  } catch (error) {
    console.warn(`⚠️ Error analyzing page ${pageNumber}:`, error);

    // Return fallback layout
    return {
      pageNumber,
      orientation: 'portrait',
      hasHeader: false,
      hasFooter: false,
      hasPageNumber: false,
      columnCount: 1,
      visualElements: [],
      isTOC: false,
      isAppendix: false,
    };
  }
}

/**
 * Aggregates page-level layouts into document-level layout
 */
function aggregateLayout(
  pageLayouts: PageLayout[],
  totalPages: number
): DocumentLayout {
  if (pageLayouts.length === 0) {
    return getEmptyLayout();
  }

  // Aggregate orientation
  const orientations = pageLayouts.map(p => p.orientation);
  const portraitCount = orientations.filter(o => o === 'portrait').length;
  const orientation =
    portraitCount === pageLayouts.length ? 'portrait' :
    portraitCount === 0 ? 'landscape' : 'mixed';

  // Aggregate headers/footers
  const hasHeaderFooter = pageLayouts.some(p => p.hasHeader || p.hasFooter);
  const hasPageNumbers = pageLayouts.some(p => p.hasPageNumber);

  // Detect TOC
  const hasTableOfContents = pageLayouts.some(p => p.isTOC);

  // Aggregate column layout
  const columnCounts = pageLayouts.map(p => p.columnCount);
  const singleColCount = columnCounts.filter(c => c === 1).length;
  const columnLayout =
    singleColCount === columnCounts.length ? 'single' :
    singleColCount === 0 && columnCounts.every(c => c === 2) ? 'double' :
    columnCounts.some(c => c >= 3) ? 'multi' : 'mixed';

  // Aggregate visual elements
  const visualElements: VisualElement[] = pageLayouts.flatMap(p => p.visualElements);

  // Calculate confidence
  const avgConfidence = visualElements.length > 0
    ? visualElements.reduce((sum, ve) => sum + ve.confidence, 0) / visualElements.length
    : 0.7;

  return {
    pageCount: totalPages,
    orientation,
    hasHeaderFooter,
    hasPageNumbers,
    hasTableOfContents,
    columnLayout,
    visualElements,
    confidence: avgConfidence,
  };
}

/**
 * Returns empty layout for error cases
 */
function getEmptyLayout(): DocumentLayout {
  return {
    pageCount: 0,
    orientation: 'portrait',
    hasHeaderFooter: false,
    hasPageNumbers: false,
    hasTableOfContents: false,
    columnLayout: 'single',
    visualElements: [],
    confidence: 0,
  };
}

// ============================================================
// EXPORT
// ============================================================

export default {
  analyzeLayout,
};
