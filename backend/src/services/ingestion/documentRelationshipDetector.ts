/**
 * Document Relationship Detector
 *
 * Detects relationships between multiple uploaded documents:
 * - Versioning (v1, v2, revised, final)
 * - Series/Parts (part1, part2)
 * - Supplements/Appendices
 * - References between documents
 */

import { ChatOpenAI } from '@langchain/openai';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface DocumentInfo {
  id: string;
  filename: string;
  content: string; // First few pages or summary
  uploadDate?: Date;
}

export interface DocumentRelationship {
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: 'supersedes' | 'supplements' | 'references' | 'part_of_series';
  confidence: number;
  evidence: string[];
}

export interface DocumentSeries {
  seriesId: string;
  name: string;
  documents: Array<{
    documentId: string;
    order: number;
    version?: string;
    date?: Date;
  }>;
}

export interface RelationshipDetectionResult {
  relationships: DocumentRelationship[];
  series: DocumentSeries[];
  confidence: number;
}

// ============================================================
// MAIN FUNCTION: detectRelationships
// ============================================================

/**
 * Detects relationships between uploaded documents
 * @param documents Array of document metadata and content
 * @returns RelationshipDetectionResult with detected relationships
 */
export async function detectRelationships(
  documents: DocumentInfo[]
): Promise<RelationshipDetectionResult> {
  console.log(`🔗 Detecting relationships between ${documents.length} documents...`);

  if (documents.length < 2) {
    return {
      relationships: [],
      series: [],
      confidence: 1,
    };
  }

  try {
    const relationships: DocumentRelationship[] = [];

    // Compare each pair of documents
    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const rel = await compareDocuments(documents[i], documents[j]);
        if (rel) {
          relationships.push(rel);
        }
      }
    }

    // Detect document series
    const series = detectSeries(documents, relationships);

    const confidence = relationships.length > 0
      ? relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length
      : 0.5;

    console.log(`✅ Detected ${relationships.length} relationships, ${series.length} series`);

    return {
      relationships,
      series,
      confidence,
    };
  } catch (error) {
    console.error('❌ Error detecting document relationships:', error);
    return {
      relationships: [],
      series: [],
      confidence: 0,
    };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Compares two documents to detect relationships
 */
async function compareDocuments(
  doc1: DocumentInfo,
  doc2: DocumentInfo
): Promise<DocumentRelationship | null> {
  // Strategy 1: Filename pattern matching (fast)
  const filenameRel = checkFilenamePattern(doc1, doc2);
  if (filenameRel) return filenameRel;

  // Strategy 2: Content reference detection
  const contentRel = await checkContentReferences(doc1, doc2);
  if (contentRel) return contentRel;

  return null;
}

/**
 * Checks filename patterns for relationships
 */
function checkFilenamePattern(
  doc1: DocumentInfo,
  doc2: DocumentInfo
): DocumentRelationship | null {
  const name1 = doc1.filename.toLowerCase().replace(/\.[^.]+$/, ''); // Remove extension
  const name2 = doc2.filename.toLowerCase().replace(/\.[^.]+$/, '');

  // Version pattern: file_v1.pdf, file_v2.pdf
  const versionMatch1 = name1.match(/^(.+?)[\s_-]?v(\d+)$/);
  const versionMatch2 = name2.match(/^(.+?)[\s_-]?v(\d+)$/);

  if (versionMatch1 && versionMatch2 && versionMatch1[1] === versionMatch2[1]) {
    const v1 = parseInt(versionMatch1[2], 10);
    const v2 = parseInt(versionMatch2[2], 10);

    return {
      sourceDocumentId: v2 > v1 ? doc2.id : doc1.id,
      targetDocumentId: v2 > v1 ? doc1.id : doc2.id,
      relationshipType: 'supersedes',
      confidence: 0.95,
      evidence: [`Filename version pattern: v${v2} supersedes v${v1}`],
    };
  }

  // Revision pattern: file_final.pdf, file_revised.pdf, file_draft.pdf
  const revisionKeywords = ['final', 'finale', 'revised', 'riveduto', 'draft', 'bozza', 'updated', 'aggiornato'];
  const hasRevision1 = revisionKeywords.some(kw => name1.includes(kw));
  const hasRevision2 = revisionKeywords.some(kw => name2.includes(kw));

  if (hasRevision1 !== hasRevision2) {
    // One has revision keyword, one doesn't
    const base1 = name1.replace(new RegExp(`[_-]?(${revisionKeywords.join('|')})`, 'gi'), '');
    const base2 = name2.replace(new RegExp(`[_-]?(${revisionKeywords.join('|')})`, 'gi'), '');

    if (base1 === base2) {
      const finalDoc = hasRevision1 ? doc1 : doc2;
      const draftDoc = hasRevision1 ? doc2 : doc1;

      return {
        sourceDocumentId: finalDoc.id,
        targetDocumentId: draftDoc.id,
        relationshipType: 'supersedes',
        confidence: 0.85,
        evidence: ['Filename revision pattern detected'],
      };
    }
  }

  // Part/Series pattern: report_part1.pdf, report_part2.pdf
  const partMatch1 = name1.match(/^(.+?)[\s_-]?(?:part|parte|section|sezione)[\s_-]?(\d+)$/i);
  const partMatch2 = name2.match(/^(.+?)[\s_-]?(?:part|parte|section|sezione)[\s_-]?(\d+)$/i);

  if (partMatch1 && partMatch2 && partMatch1[1] === partMatch2[1]) {
    return {
      sourceDocumentId: doc1.id,
      targetDocumentId: doc2.id,
      relationshipType: 'part_of_series',
      confidence: 0.9,
      evidence: [`Part ${partMatch1[2]} and ${partMatch2[2]} of same series`],
    };
  }

  // Appendix/Supplement pattern
  const isAppendix1 = /appendix|appendice|allegato|annex|supplement/i.test(name1);
  const isAppendix2 = /appendix|appendice|allegato|annex|supplement/i.test(name2);

  if (isAppendix1 !== isAppendix2) {
    const mainDoc = isAppendix1 ? doc2 : doc1;
    const appendixDoc = isAppendix1 ? doc1 : doc2;

    // Check if base names are similar
    const similarity = calculateSimilarity(
      mainDoc.filename.toLowerCase(),
      appendixDoc.filename.toLowerCase()
    );

    if (similarity > 0.5) {
      return {
        sourceDocumentId: appendixDoc.id,
        targetDocumentId: mainDoc.id,
        relationshipType: 'supplements',
        confidence: 0.75,
        evidence: ['Appendix/supplement pattern in filename'],
      };
    }
  }

  return null;
}

/**
 * Checks content for references between documents
 */
async function checkContentReferences(
  doc1: DocumentInfo,
  doc2: DocumentInfo
): Promise<DocumentRelationship | null> {
  const content1 = doc1.content.toLowerCase();
  const content2 = doc2.content.toLowerCase();

  const name1Base = doc1.filename.replace(/\.[^.]+$/, '').toLowerCase();
  const name2Base = doc2.filename.replace(/\.[^.]+$/, '').toLowerCase();

  // Check if doc1 mentions doc2
  const doc1MentionsDoc2 = content1.includes(name2Base) ||
                           content1.includes(doc2.filename.toLowerCase());

  // Check if doc2 mentions doc1
  const doc2MentionsDoc1 = content2.includes(name1Base) ||
                           content2.includes(doc1.filename.toLowerCase());

  if (doc1MentionsDoc2 || doc2MentionsDoc1) {
    return {
      sourceDocumentId: doc1MentionsDoc2 ? doc1.id : doc2.id,
      targetDocumentId: doc1MentionsDoc2 ? doc2.id : doc1.id,
      relationshipType: 'references',
      confidence: 0.7,
      evidence: ['Document explicitly references the other'],
    };
  }

  // Check for "see appendix", "see attachment" patterns
  const appendixPattern = /see\s+(appendix|allegato|annex|attachment|supplement)/i;
  if (appendixPattern.test(content1) || appendixPattern.test(content2)) {
    return {
      sourceDocumentId: doc1.id,
      targetDocumentId: doc2.id,
      relationshipType: 'supplements',
      confidence: 0.6,
      evidence: ['Content contains appendix/supplement reference'],
    };
  }

  return null;
}

/**
 * Detects document series from relationships
 */
function detectSeries(
  documents: DocumentInfo[],
  relationships: DocumentRelationship[]
): DocumentSeries[] {
  const series: DocumentSeries[] = [];
  const processedDocs = new Set<string>();

  // Find all part_of_series relationships
  const seriesRels = relationships.filter(r => r.relationshipType === 'part_of_series');

  for (const rel of seriesRels) {
    if (processedDocs.has(rel.sourceDocumentId) || processedDocs.has(rel.targetDocumentId)) {
      continue;
    }

    // Find all related documents
    const relatedDocs = [rel.sourceDocumentId, rel.targetDocumentId];
    const relatedNames = [
      documents.find(d => d.id === rel.sourceDocumentId)?.filename || '',
      documents.find(d => d.id === rel.targetDocumentId)?.filename || '',
    ];

    // Extract series name (common prefix)
    const seriesName = extractSeriesName(relatedNames);

    // Extract part numbers
    const docsWithOrder = relatedDocs.map((docId, index) => {
      const filename = documents.find(d => d.id === docId)?.filename || '';
      const partMatch = filename.match(/(?:part|parte|section)[\s_-]?(\d+)/i);
      const order = partMatch ? parseInt(partMatch[1], 10) : index + 1;

      return {
        documentId: docId,
        order,
        date: documents.find(d => d.id === docId)?.uploadDate,
      };
    });

    // Sort by order
    docsWithOrder.sort((a, b) => a.order - b.order);

    series.push({
      seriesId: `series-${series.length + 1}`,
      name: seriesName,
      documents: docsWithOrder,
    });

    relatedDocs.forEach(docId => processedDocs.add(docId));
  }

  return series;
}

/**
 * Extracts series name from document filenames
 */
function extractSeriesName(filenames: string[]): string {
  if (filenames.length === 0) return 'Unknown Series';

  // Find common prefix
  let prefix = filenames[0];
  for (const name of filenames.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) {
      i++;
    }
    prefix = prefix.slice(0, i);
  }

  // Clean up prefix
  prefix = prefix.replace(/[\s_-]+$/, ''); // Remove trailing separators
  prefix = prefix.replace(/\.[^.]+$/, ''); // Remove extension

  return prefix || 'Document Series';
}

/**
 * Calculates string similarity (simple Levenshtein-based)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculates Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ============================================================
// EXPORT
// ============================================================

export default {
  detectRelationships,
};
