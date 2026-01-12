/**
 * Section Detector
 *
 * Detects and classifies document sections:
 * - Table of Contents (TOC)
 * - Executive Summary
 * - Body sections
 * - Appendices
 * - References/Bibliography
 * - Glossary
 */

import { DocumentLayout } from './layoutAnalyzer';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface DocumentSection {
  id: string;
  title: string;
  type: 'toc' | 'executive_summary' | 'body' | 'appendix' | 'references' | 'glossary' | 'unknown';
  startPage: number;
  endPage: number;
  relevance: number; // 0-1, how relevant for portfolio extraction
  subsections: DocumentSection[];
  confidence: number;
}

export interface SectionDetectionResult {
  sections: DocumentSection[];
  hasClearStructure: boolean;
  confidence: number;
}

interface SectionPattern {
  type: DocumentSection['type'];
  patterns: RegExp[];
  relevance: number;
}

// ============================================================
// SECTION PATTERNS
// ============================================================

const SECTION_PATTERNS: SectionPattern[] = [
  {
    type: 'toc',
    patterns: [
      /^(table\s+of\s+contents|indice|sommario|index)/i,
      /^\d+\.\s+.+\s+\.\.\.\s+\d+$/m, // "1. Section ... 5" pattern
    ],
    relevance: 0.2,
  },
  {
    type: 'executive_summary',
    patterns: [
      /^(executive\s+summary|sommario\s+esecutivo|sintesi|riassunto)/i,
      /^(abstract|panoramica|overview)/i,
    ],
    relevance: 0.7,
  },
  {
    type: 'appendix',
    patterns: [
      /^(appendix|appendice|allegat[io]|annex)/i,
      /^appendix\s+[a-z0-9]/i,
    ],
    relevance: 0.3,
  },
  {
    type: 'references',
    patterns: [
      /^(references|bibliografia|riferimenti|bibliography)/i,
      /^\[\d+\]\s+[A-Z]/m, // Citation pattern
    ],
    relevance: 0.1,
  },
  {
    type: 'glossary',
    patterns: [
      /^(glossary|glossario|definizioni|terminology)/i,
    ],
    relevance: 0.2,
  },
];

// ============================================================
// MAIN FUNCTION: detectSections
// ============================================================

/**
 * Detects sections in document text based on layout and content patterns
 * @param documentText Full document text
 * @param layout Document layout information
 * @returns SectionDetectionResult with detected sections
 */
export async function detectSections(
  documentText: string,
  layout: DocumentLayout
): Promise<SectionDetectionResult> {
  console.log('📑 Detecting document sections...');

  const sections: DocumentSection[] = [];

  try {
    // Strategy 1: Use TOC if available
    if (layout.hasTableOfContents) {
      const tocSections = await parseTOC(documentText, layout.pageCount);
      if (tocSections.length > 0) {
        sections.push(...tocSections);
      }
    }

    // Strategy 2: Detect sections via heading patterns
    if (sections.length === 0) {
      const headingSections = detectHeadings(documentText, layout.pageCount);
      sections.push(...headingSections);
    }

    // Strategy 3: Pattern-based section detection
    const patternSections = detectPatternSections(documentText, layout.pageCount);

    // Merge pattern sections with existing sections
    for (const patternSection of patternSections) {
      const existing = sections.find(s => s.type === patternSection.type);
      if (!existing) {
        sections.push(patternSection);
      }
    }

    // Calculate relevance scores
    sections.forEach(section => {
      section.relevance = calculateRelevance(section);
    });

    // Sort sections by startPage
    sections.sort((a, b) => a.startPage - b.startPage);

    // Determine if structure is clear
    const hasClearStructure = sections.length >= 2 &&
                              sections.some(s => s.type !== 'unknown');

    const confidence = calculateDetectionConfidence(sections, hasClearStructure);

    console.log(`✅ Detected ${sections.length} sections (confidence: ${confidence.toFixed(2)})`);

    return {
      sections,
      hasClearStructure,
      confidence,
    };
  } catch (error) {
    console.error('❌ Error detecting sections:', error);

    // Return fallback: single body section
    return {
      sections: [{
        id: 'section-1',
        title: 'Document Body',
        type: 'body',
        startPage: 1,
        endPage: layout.pageCount,
        relevance: 0.9,
        subsections: [],
        confidence: 0.5,
      }],
      hasClearStructure: false,
      confidence: 0.5,
    };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Parses Table of Contents to extract section structure
 */
async function parseTOC(
  documentText: string,
  totalPages: number
): Promise<DocumentSection[]> {
  const sections: DocumentSection[] = [];
  const lines = documentText.split('\n');

  let inTOC = false;
  let sectionIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect TOC start
    if (!inTOC && /^(table\s+of\s+contents|indice|sommario)/i.test(line)) {
      inTOC = true;
      continue;
    }

    if (inTOC) {
      // TOC entry pattern: "1. Section Name ... 5" or "Section Name .... 5"
      const tocMatch = line.match(/^(\d+\.?)?\s*(.+?)\s+\.{2,}\s+(\d+)$/);
      if (tocMatch) {
        const [, number, title, pageStr] = tocMatch;
        const pageNum = parseInt(pageStr, 10);

        if (pageNum > 0 && pageNum <= totalPages) {
          sections.push({
            id: `section-${++sectionIndex}`,
            title: title.trim(),
            type: 'body',
            startPage: pageNum,
            endPage: totalPages, // Will be adjusted
            relevance: 0.9,
            subsections: [],
            confidence: 0.9,
          });
        }
      }

      // Stop if we hit a clear section boundary
      if (/^(chapter|section|part)\s+\d/i.test(line)) {
        break;
      }
    }
  }

  // Adjust endPage for each section
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].endPage = sections[i + 1].startPage - 1;
  }

  return sections;
}

/**
 * Detects sections via heading patterns (markdown-style or numbered)
 */
function detectHeadings(
  documentText: string,
  totalPages: number
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = documentText.split('\n');

  let sectionIndex = 0;
  let currentPage = 1;
  const avgLinesPerPage = Math.ceil(lines.length / totalPages);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Update current page estimate
    currentPage = Math.floor(i / avgLinesPerPage) + 1;

    // Heading patterns
    const isNumberedHeading = /^(\d+\.)+\s+[A-Z]/.test(line); // "1.2.3 Title"
    const isMarkdownHeading = /^#{1,3}\s+/.test(line); // "## Title"
    const isAllCapsHeading = /^[A-Z\s]{5,50}$/.test(line) && line.length > 5;

    if (isNumberedHeading || isMarkdownHeading || isAllCapsHeading) {
      const title = line.replace(/^#+\s+/, '').replace(/^\d+\.\s+/, '').trim();

      // Determine section type from title
      const type = classifySectionType(title);

      sections.push({
        id: `section-${++sectionIndex}`,
        title,
        type,
        startPage: currentPage,
        endPage: currentPage, // Will be adjusted
        relevance: 0.9,
        subsections: [],
        confidence: 0.7,
      });
    }
  }

  // Adjust endPage
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].endPage = sections[i + 1].startPage - 1;
  }
  if (sections.length > 0) {
    sections[sections.length - 1].endPage = totalPages;
  }

  return sections;
}

/**
 * Detects special sections via pattern matching
 */
function detectPatternSections(
  documentText: string,
  totalPages: number
): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let sectionIndex = 0;

  for (const pattern of SECTION_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = documentText.match(regex);
      if (match) {
        sections.push({
          id: `section-${++sectionIndex}`,
          title: match[0].trim(),
          type: pattern.type,
          startPage: 1, // Rough estimate
          endPage: totalPages,
          relevance: pattern.relevance,
          subsections: [],
          confidence: 0.8,
        });
        break; // Only one match per type
      }
    }
  }

  return sections;
}

/**
 * Classifies section type based on title
 */
function classifySectionType(title: string): DocumentSection['type'] {
  const lower = title.toLowerCase();

  for (const pattern of SECTION_PATTERNS) {
    if (pattern.patterns.some(p => p.test(title))) {
      return pattern.type;
    }
  }

  // Heuristics
  if (/^(introduzione|introduction|overview|panoramica)/i.test(lower)) {
    return 'executive_summary';
  }
  if (/^(conclusione|conclusion|summary|riassunto)/i.test(lower)) {
    return 'executive_summary';
  }

  return 'body';
}

/**
 * Calculates relevance score for a section
 */
function calculateRelevance(section: DocumentSection): number {
  // Override with type-specific relevance
  const typeRelevance: Record<DocumentSection['type'], number> = {
    toc: 0.2,
    executive_summary: 0.7,
    body: 0.9,
    appendix: 0.3,
    references: 0.1,
    glossary: 0.2,
    unknown: 0.6,
  };

  return typeRelevance[section.type] || 0.6;
}

/**
 * Calculates overall confidence in section detection
 */
function calculateDetectionConfidence(
  sections: DocumentSection[],
  hasClearStructure: boolean
): number {
  if (sections.length === 0) return 0.3;

  const avgSectionConfidence = sections.reduce((sum, s) => sum + s.confidence, 0) / sections.length;
  const structureBonus = hasClearStructure ? 0.2 : 0;

  return Math.min(1, avgSectionConfidence + structureBonus);
}

// ============================================================
// EXPORT
// ============================================================

export default {
  detectSections,
};
