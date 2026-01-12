/**
 * Sector Detector
 *
 * Detects the sector/industry of a product or service based on its
 * name, description, and other metadata.
 *
 * Uses a two-phase approach:
 * 1. Fast keyword-based classification (synchronous, no API calls)
 * 2. Semantic fallback using embeddings (when keywords are ambiguous)
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import type { SectorCode, SectorDetectionResult } from '../types';
import { SECTOR_KEYWORDS, getAllKeywords, ALL_SECTORS } from './sectorKeywords';

// Minimum confidence to return a sector without semantic fallback
const KEYWORD_CONFIDENCE_THRESHOLD = 0.5;

// Minimum keyword matches to consider a sector
const MIN_KEYWORD_MATCHES = 1;

// Weight for combining keyword and semantic scores
const KEYWORD_WEIGHT = 0.4;
const SEMANTIC_WEIGHT = 0.6;

interface SectorScore {
  sector: SectorCode;
  score: number;
  matchedKeywords: string[];
}

interface DetectorConfig {
  enableSemanticFallback?: boolean;
  openAIApiKey?: string;
  minConfidence?: number;
}

export class SectorDetector {
  private keywordIndex: Map<string, { sector: SectorCode; weight: number }[]>;
  private embeddings: OpenAIEmbeddings | null = null;
  private sectorExemplars: Map<SectorCode, number[]> | null = null;
  private config: DetectorConfig;

  constructor(config: DetectorConfig = {}) {
    this.config = {
      enableSemanticFallback: config.enableSemanticFallback ?? false,
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY,
      minConfidence: config.minConfidence ?? 0.3,
    };

    // Build reverse keyword index for fast lookup
    this.keywordIndex = getAllKeywords();

    // Initialize embeddings if semantic fallback is enabled
    if (this.config.enableSemanticFallback && this.config.openAIApiKey) {
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: this.config.openAIApiKey,
        modelName: 'text-embedding-3-small',
      });
    }
  }

  /**
   * Detect sector from item data
   */
  async detect(item: {
    name: string;
    description?: string;
    category?: string;
    vendor?: string;
    tags?: string[];
  }): Promise<SectorDetectionResult> {
    // Combine all text for analysis
    const text = this.buildSearchText(item);

    // Phase 1: Keyword-based detection
    const keywordScores = this.detectByKeywords(text);

    // Sort by score descending
    keywordScores.sort((a, b) => b.score - a.score);

    const topScore = keywordScores[0];
    const secondScore = keywordScores[1];

    // If top score is high enough and clearly better than second, return it
    if (
      topScore &&
      topScore.score >= KEYWORD_CONFIDENCE_THRESHOLD &&
      (!secondScore || topScore.score - secondScore.score > 0.15)
    ) {
      return {
        sector: topScore.sector,
        confidence: Math.min(topScore.score, 0.95),
        method: 'keyword',
        reasoning: [
          `Matched keywords: ${topScore.matchedKeywords.join(', ')}`,
          `Score: ${(topScore.score * 100).toFixed(1)}%`,
        ],
        alternativeSectors: keywordScores
          .slice(1, 3)
          .filter(s => s.score > 0.2)
          .map(s => ({
            sector: s.sector,
            confidence: s.score,
          })),
      };
    }

    // Phase 2: Semantic fallback (if enabled and keywords are ambiguous)
    if (
      this.config.enableSemanticFallback &&
      this.embeddings &&
      topScore &&
      topScore.score < KEYWORD_CONFIDENCE_THRESHOLD
    ) {
      try {
        const semanticResult = await this.detectBySemantic(text, keywordScores);
        return semanticResult;
      } catch (error) {
        console.warn('Semantic sector detection failed, falling back to keywords:', error);
      }
    }

    // Return best keyword match or unknown
    if (topScore && topScore.score >= this.config.minConfidence!) {
      return {
        sector: topScore.sector,
        confidence: topScore.score,
        method: 'keyword',
        reasoning: [
          `Best keyword match: ${topScore.matchedKeywords.join(', ')}`,
          `Low confidence - consider reviewing`,
        ],
        alternativeSectors: keywordScores
          .slice(1, 3)
          .filter(s => s.score > 0.1)
          .map(s => ({
            sector: s.sector,
            confidence: s.score,
          })),
      };
    }

    return {
      sector: 'unknown',
      confidence: 0.3,
      method: 'keyword',
      reasoning: ['No sector keywords matched', 'Manual classification recommended'],
    };
  }

  /**
   * Detect sector using keyword matching
   */
  private detectByKeywords(text: string): SectorScore[] {
    const lowerText = text.toLowerCase();
    const words = this.tokenize(lowerText);

    // Score each sector
    const sectorScores: Map<SectorCode, SectorScore> = new Map();

    // Initialize all sectors
    for (const sector of ALL_SECTORS) {
      if (sector !== 'unknown') {
        sectorScores.set(sector, {
          sector,
          score: 0,
          matchedKeywords: [],
        });
      }
    }

    // Check each word against keyword index
    for (const word of words) {
      const matches = this.keywordIndex.get(word);
      if (matches) {
        for (const match of matches) {
          const current = sectorScores.get(match.sector)!;
          current.score += match.weight;
          if (!current.matchedKeywords.includes(word)) {
            current.matchedKeywords.push(word);
          }
        }
      }
    }

    // Also check multi-word phrases
    for (const [phrase, matches] of this.keywordIndex.entries()) {
      if (phrase.includes(' ') && lowerText.includes(phrase)) {
        for (const match of matches) {
          const current = sectorScores.get(match.sector)!;
          current.score += match.weight * 1.2; // Bonus for phrase match
          if (!current.matchedKeywords.includes(phrase)) {
            current.matchedKeywords.push(phrase);
          }
        }
      }
    }

    // Normalize scores and filter
    const results: SectorScore[] = [];
    for (const score of sectorScores.values()) {
      if (score.matchedKeywords.length >= 1) {
        // Normalize: max reasonable score would be ~5-8 keywords matched
        // Lower divisor to give better scores with fewer matches
        const normalizedScore = Math.min(score.score / 5, 1);

        // Apply smaller penalty for few matches
        const matchPenalty = score.matchedKeywords.length < MIN_KEYWORD_MATCHES ? 0.85 : 1;

        results.push({
          ...score,
          score: normalizedScore * matchPenalty,
        });
      }
    }

    return results;
  }

  /**
   * Detect sector using semantic similarity
   */
  private async detectBySemantic(
    text: string,
    keywordScores: SectorScore[]
  ): Promise<SectorDetectionResult> {
    if (!this.embeddings) {
      throw new Error('Embeddings not initialized');
    }

    // Initialize exemplars if needed
    if (!this.sectorExemplars) {
      await this.initializeSectorExemplars();
    }

    // Get embedding for input text
    const [textEmbedding] = await this.embeddings.embedDocuments([text]);

    // Calculate similarity with each sector exemplar
    const similarities: Array<{ sector: SectorCode; similarity: number }> = [];

    for (const [sector, exemplar] of this.sectorExemplars!.entries()) {
      const similarity = this.cosineSimilarity(textEmbedding, exemplar);
      similarities.push({ sector, similarity });
    }

    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    const topSemantic = similarities[0];
    const topKeyword = keywordScores[0];

    // Combine keyword and semantic scores
    const combinedScores: Map<SectorCode, number> = new Map();

    for (const kw of keywordScores) {
      const semanticScore = similarities.find(s => s.sector === kw.sector)?.similarity || 0;
      const combined = kw.score * KEYWORD_WEIGHT + semanticScore * SEMANTIC_WEIGHT;
      combinedScores.set(kw.sector, combined);
    }

    // Add any sectors that only have semantic scores
    for (const sem of similarities) {
      if (!combinedScores.has(sem.sector)) {
        combinedScores.set(sem.sector, sem.similarity * SEMANTIC_WEIGHT);
      }
    }

    // Find best combined
    let bestSector: SectorCode = 'unknown';
    let bestScore = 0;
    for (const [sector, score] of combinedScores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestSector = sector;
      }
    }

    const matchedKeywords = keywordScores.find(k => k.sector === bestSector)?.matchedKeywords || [];

    return {
      sector: bestSector,
      confidence: Math.min(bestScore, 0.95),
      method: 'hybrid',
      reasoning: [
        `Keyword score: ${((topKeyword?.score || 0) * 100).toFixed(1)}%`,
        `Semantic similarity: ${(topSemantic.similarity * 100).toFixed(1)}%`,
        `Combined score: ${(bestScore * 100).toFixed(1)}%`,
        matchedKeywords.length > 0 ? `Matched: ${matchedKeywords.join(', ')}` : 'No keyword matches',
      ],
      alternativeSectors: similarities
        .slice(1, 3)
        .filter(s => s.similarity > 0.3)
        .map(s => ({
          sector: s.sector,
          confidence: combinedScores.get(s.sector) || s.similarity * SEMANTIC_WEIGHT,
        })),
    };
  }

  /**
   * Initialize sector exemplar embeddings
   */
  private async initializeSectorExemplars(): Promise<void> {
    if (!this.embeddings) return;

    const exemplarTexts: Map<SectorCode, string> = new Map([
      [
        'it_software',
        'Software application SaaS cloud platform ERP CRM database Microsoft Oracle SAP AWS Azure cybersecurity DevOps',
      ],
      [
        'food_beverage',
        'Food beverage organic nutritional ingredients dairy meat vegetables wine beer coffee snack frozen organic vegan',
      ],
      [
        'consumer_goods',
        'Cosmetic beauty skincare makeup shampoo soap cream lotion perfume household cleaning detergent personal care',
      ],
      [
        'healthcare_pharma',
        'Pharmaceutical drug medicine medical healthcare therapy diagnostic clinical prescription vaccine antibiotic FDA',
      ],
      [
        'industrial',
        'Machinery equipment industrial manufacturing raw material component spare part tool hydraulic pneumatic valve pump',
      ],
      [
        'financial_services',
        'Bank banking insurance investment loan credit mortgage payment fintech trading securities wealth management',
      ],
      [
        'professional_services',
        'Consulting advisory audit legal accounting marketing recruitment staffing training outsourcing professional services',
      ],
      [
        'automotive',
        'Vehicle car automotive automobile engine electric EV powertrain transmission chassis battery hybrid truck fleet',
      ],
    ]);

    this.sectorExemplars = new Map();

    for (const [sector, text] of exemplarTexts.entries()) {
      const [embedding] = await this.embeddings.embedDocuments([text]);
      this.sectorExemplars.set(sector, embedding);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Build search text from item
   */
  private buildSearchText(item: {
    name: string;
    description?: string;
    category?: string;
    vendor?: string;
    tags?: string[];
  }): string {
    const parts: string[] = [item.name];

    if (item.description) parts.push(item.description);
    if (item.category) parts.push(item.category);
    if (item.vendor) parts.push(item.vendor);
    if (item.tags && item.tags.length > 0) parts.push(item.tags.join(' '));

    return parts.join(' ');
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // Also split hyphenated words and add individual parts
    const expanded: string[] = [];
    for (const word of words) {
      expanded.push(word);
      if (word.includes('-')) {
        const parts = word.split('-').filter(p => p.length >= 2);
        expanded.push(...parts);
      }
    }

    return expanded;
  }
}

// Singleton instance
let detectorInstance: SectorDetector | null = null;

export function getSectorDetector(config?: DetectorConfig): SectorDetector {
  if (!detectorInstance) {
    detectorInstance = new SectorDetector(config);
  }
  return detectorInstance;
}

export default SectorDetector;
