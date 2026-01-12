/**
 * Semantic Field Mapper
 *
 * Maps source column headers to target fields using:
 * 1. Embedding-based similarity (learned patterns)
 * 2. LLM-assisted interpretation
 * 3. Context-aware mapping
 *
 * Learns from successful mappings to improve over time.
 */

import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { FieldMapping } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface SemanticMappingResult {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  method: 'embedding' | 'llm' | 'learned' | 'exact';
  reasoning: string;
  alternativeMappings?: Array<{ field: string; confidence: number }>;
}

export interface SemanticMappingContext {
  tenantId: string;
  industryContext?: string;
  previousMappings?: FieldMapping[];
  sampleData?: Record<string, unknown>[];
  documentType?: string;
}

export interface LearnedMappingPattern {
  id: string;
  tenantId: string;
  sourcePattern: string;
  sourceEmbedding: number[];
  targetField: string;
  successCount: number;
  confidence: number;
  contextKeywords: string[];
  sampleValues: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class SemanticFieldMapper {
  private embeddings: OpenAIEmbeddings;
  private llm: ChatOpenAI;
  private learnedPatterns: Map<string, LearnedMappingPattern[]> = new Map();

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
      dimensions: 1536,
    });

    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 1000,
    });
  }

  /**
   * Maps a source column to a target field using semantic analysis
   */
  async mapField(
    sourceColumn: string,
    context: SemanticMappingContext
  ): Promise<SemanticMappingResult> {
    console.log(`🔍 Semantic mapping: "${sourceColumn}" for tenant ${context.tenantId}`);

    // Step 1: Try learned patterns (fastest, highest confidence)
    const learnedResult = await this.tryLearnedPatterns(sourceColumn, context);
    if (learnedResult && learnedResult.confidence >= 0.85) {
      console.log(`  ✅ Matched via learned pattern (conf: ${learnedResult.confidence.toFixed(2)})`);
      return learnedResult;
    }

    // Step 2: Try embedding-based similarity
    const embeddingResult = await this.tryEmbeddingSimilarity(sourceColumn, context);
    if (embeddingResult && embeddingResult.confidence >= 0.75) {
      console.log(`  ✅ Matched via embedding (conf: ${embeddingResult.confidence.toFixed(2)})`);
      return embeddingResult;
    }

    // Step 3: Fall back to LLM interpretation
    const llmResult = await this.tryLLMMapping(sourceColumn, context);
    console.log(`  ✅ Mapped via LLM (conf: ${llmResult.confidence.toFixed(2)})`);
    return llmResult;
  }

  /**
   * Tries to match using learned patterns from successful mappings
   */
  private async tryLearnedPatterns(
    sourceColumn: string,
    context: SemanticMappingContext
  ): Promise<SemanticMappingResult | null> {
    // Load patterns for tenant (would normally load from DB)
    const patterns = this.learnedPatterns.get(context.tenantId) || [];

    if (patterns.length === 0) {
      return null;
    }

    // Generate embedding for source column
    const sourceEmbedding = await this.embeddings.embedQuery(sourceColumn.toLowerCase());

    // Find most similar pattern
    let bestMatch: { pattern: LearnedMappingPattern; similarity: number } | null = null;

    for (const pattern of patterns) {
      const similarity = cosineSimilarity(sourceEmbedding, pattern.sourceEmbedding);

      if (similarity > 0.85 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { pattern, similarity };
      }
    }

    if (!bestMatch) {
      return null;
    }

    return {
      sourceColumn,
      targetField: bestMatch.pattern.targetField,
      confidence: bestMatch.similarity * bestMatch.pattern.confidence,
      method: 'learned',
      reasoning: `Matched to learned pattern "${bestMatch.pattern.sourcePattern}" (${bestMatch.pattern.successCount} successes)`,
    };
  }

  /**
   * Tries embedding-based similarity against standard field names
   */
  private async tryEmbeddingSimilarity(
    sourceColumn: string,
    context: SemanticMappingContext
  ): Promise<SemanticMappingResult | null> {
    // Standard field names with descriptions
    const standardFields: Record<string, string> = {
      name: 'Product or service name, title, label',
      description: 'Detailed description, summary, notes, details',
      category: 'Category, type, classification, group',
      subcategory: 'Subcategory, subtype, specific classification',
      vendor: 'Vendor, supplier, manufacturer, provider, company',
      price: 'Price, cost, amount, rate, value in currency',
      budget: 'Budget, investment, allocated funds, financial plan',
      status: 'Status, state, phase, stage, condition',
      priority: 'Priority, importance, urgency, rank',
      owner: 'Owner, responsible person, assignee, manager',
      startDate: 'Start date, begin date, commencement date, launch date',
      endDate: 'End date, finish date, completion date, deadline',
      technologies: 'Technologies, tech stack, tools, platforms used',
    };

    // Generate embedding for source column
    const sourceEmbedding = await this.embeddings.embedQuery(sourceColumn.toLowerCase());

    // Generate embeddings for all standard fields
    const fieldEmbeddings = await Promise.all(
      Object.entries(standardFields).map(async ([field, description]) => {
        const embedding = await this.embeddings.embedQuery(`${field} ${description}`.toLowerCase());
        return { field, embedding };
      })
    );

    // Find best match
    const similarities = fieldEmbeddings.map(({ field, embedding }) => ({
      field,
      similarity: cosineSimilarity(sourceEmbedding, embedding),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    const bestMatch = similarities[0];

    if (bestMatch.similarity < 0.7) {
      return null;
    }

    return {
      sourceColumn,
      targetField: bestMatch.field,
      confidence: bestMatch.similarity,
      method: 'embedding',
      reasoning: `Embedding similarity with "${bestMatch.field}" field`,
      alternativeMappings: similarities
        .slice(1, 4)
        .filter(s => s.similarity >= 0.6)
        .map(s => ({ field: s.field, confidence: s.similarity })),
    };
  }

  /**
   * Uses LLM to interpret column name and suggest mapping
   */
  private async tryLLMMapping(
    sourceColumn: string,
    context: SemanticMappingContext
  ): Promise<SemanticMappingResult> {
    const prompt = `You are a data mapping expert. Map this column header to a standard field.

Source Column: "${sourceColumn}"

${context.industryContext ? `Industry Context: ${context.industryContext}` : ''}

${context.sampleData && context.sampleData.length > 0
  ? `Sample Values:\n${context.sampleData.map(row => `- ${row[sourceColumn]}`).slice(0, 5).join('\n')}`
  : ''}

Standard Fields:
- name: Product/service name
- description: Detailed description
- category: Main category or type
- vendor: Vendor/supplier name
- price: Price or cost
- budget: Budget amount
- status: Current status
- priority: Priority level
- owner: Responsible person
- startDate: Start date
- endDate: End date

Return ONLY JSON:
{
  "targetField": "field_name",
  "confidence": 0.0-1.0,
  "reasoning": "why this mapping makes sense"
}`;

    try {
      const response = await this.llm.invoke([{ role: 'user', content: prompt }]);
      const content = response.content as string;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        sourceColumn,
        targetField: parsed.targetField,
        confidence: Math.max(0.5, Math.min(0.9, parsed.confidence || 0.7)),
        method: 'llm',
        reasoning: parsed.reasoning || 'LLM interpretation',
      };
    } catch (error) {
      console.error('❌ LLM mapping error:', error);

      // Fallback to unknown field
      return {
        sourceColumn,
        targetField: 'unknown',
        confidence: 0.3,
        method: 'llm',
        reasoning: 'Could not map - defaulting to unknown',
      };
    }
  }

  /**
   * Records a successful mapping for learning
   */
  async recordSuccessfulMapping(
    sourceColumn: string,
    targetField: string,
    context: SemanticMappingContext,
    sampleValues?: unknown[]
  ): Promise<void> {
    console.log(`📝 Recording successful mapping: "${sourceColumn}" → ${targetField}`);

    // Generate embedding
    const embedding = await this.embeddings.embedQuery(sourceColumn.toLowerCase());

    // Check if pattern already exists
    const patterns = this.learnedPatterns.get(context.tenantId) || [];
    const existing = patterns.find(
      p => p.sourcePattern.toLowerCase() === sourceColumn.toLowerCase() &&
           p.targetField === targetField
    );

    if (existing) {
      // Update existing pattern
      existing.successCount++;
      existing.confidence = Math.min(0.98, existing.confidence + 0.02);
      existing.updatedAt = new Date();
      if (sampleValues) {
        existing.sampleValues = [...existing.sampleValues, ...sampleValues].slice(-10);
      }
    } else {
      // Create new pattern
      const newPattern: LearnedMappingPattern = {
        id: `${context.tenantId}-${Date.now()}`,
        tenantId: context.tenantId,
        sourcePattern: sourceColumn,
        sourceEmbedding: embedding,
        targetField,
        successCount: 1,
        confidence: 0.85,
        contextKeywords: context.industryContext ? [context.industryContext] : [],
        sampleValues: sampleValues || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      patterns.push(newPattern);
      this.learnedPatterns.set(context.tenantId, patterns);
    }

    // TODO: Persist to database (learned_field_mappings table)
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// ============================================================================
// EXPORT
// ============================================================================

export default SemanticFieldMapper;
