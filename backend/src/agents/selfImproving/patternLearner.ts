/**
 * Pattern Learner Service
 * 
 * Learns extraction patterns from successful extractions and user feedback.
 * Applies learned patterns to improve future extractions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  LearnedPattern,
  PatternType,
  PatternMatch,
  PatternApplicationResult,
  PatternMetadata,
  PatternExample,
  OutputMapping,
  ExtractionResult,
  DocumentInfo,
  MatchedRegion,
  IPatternLearner,
  DbLearnedPattern,
  ExtractedItemTemplate
} from './types';

// ============================================================================
// Configuration
// ============================================================================

interface PatternLearnerConfig {
  minConfidenceThreshold: number;
  maxPatternsPerQuery: number;
  patternDecayDays: number;
  minExamplesForPattern: number;
  similarityThreshold: number;
}

const DEFAULT_CONFIG: PatternLearnerConfig = {
  minConfidenceThreshold: 0.3,
  maxPatternsPerQuery: 10,
  patternDecayDays: 30,
  minExamplesForPattern: 2,
  similarityThreshold: 0.7
};

// ============================================================================
// Pattern Learner Implementation
// ============================================================================

export class PatternLearner implements IPatternLearner {
  private supabase: SupabaseClient;
  private openai: OpenAI;
  private config: PatternLearnerConfig;

  constructor(config?: Partial<PatternLearnerConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Core Learning Methods
  // ==========================================================================

  /**
   * Learn patterns from a successful extraction
   */
  async learnFromExtraction(
    extraction: ExtractionResult,
    document: DocumentInfo
  ): Promise<LearnedPattern[]> {
    console.log(`[PatternLearner] Learning from extraction ${extraction.id}`);
    
    const learnedPatterns: LearnedPattern[] = [];

    try {
      // Analyze each extracted item for potential patterns
      for (const item of extraction.items) {
        // 1. Learn field extraction patterns
        const fieldPatterns = await this.learnFieldExtractionPatterns(
          item,
          document.content,
          document.type
        );
        learnedPatterns.push(...fieldPatterns);

        // 2. Learn entity classification patterns
        const classificationPattern = await this.learnClassificationPattern(
          item,
          document.content,
          document.type
        );
        if (classificationPattern) {
          learnedPatterns.push(classificationPattern);
        }

        // 3. Learn normalization patterns
        const normalizationPatterns = await this.learnNormalizationPatterns(
          item,
          document
        );
        learnedPatterns.push(...normalizationPatterns);
      }

      // Store patterns in database
      for (const pattern of learnedPatterns) {
        await this.storePattern(pattern);
      }

      console.log(`[PatternLearner] Learned ${learnedPatterns.length} patterns`);
      return learnedPatterns;

    } catch (error) {
      console.error('[PatternLearner] Error learning patterns:', error);
      return [];
    }
  }

  /**
   * Find patterns that match the given content
   */
  async findMatchingPatterns(
    content: string,
    documentType: string
  ): Promise<PatternMatch[]> {
    console.log(`[PatternLearner] Finding patterns for ${documentType} document`);

    try {
      // Query patterns from database
      const { data: patterns, error } = await this.supabase
        .from('rag_learned_patterns')
        .select('*')
        .gte('confidence', this.config.minConfidenceThreshold)
        .order('confidence', { ascending: false })
        .limit(this.config.maxPatternsPerQuery);

      if (error) {
        console.error('[PatternLearner] Error fetching patterns:', error);
        return [];
      }

      const matches: PatternMatch[] = [];

      for (const dbPattern of (patterns as DbLearnedPattern[])) {
        const pattern = this.dbToPattern(dbPattern);
        const matchResult = this.matchPattern(pattern, content);

        if (matchResult.matches) {
          matches.push({
            pattern,
            matchScore: matchResult.score,
            matchedRegions: matchResult.regions
          });
        }
      }

      // Sort by match score
      matches.sort((a, b) => b.matchScore - a.matchScore);

      console.log(`[PatternLearner] Found ${matches.length} matching patterns`);
      return matches;

    } catch (error) {
      console.error('[PatternLearner] Error finding patterns:', error);
      return [];
    }
  }

  /**
   * Apply matched patterns to extract values
   */
  async applyPatterns(
    content: string,
    patterns: PatternMatch[]
  ): Promise<PatternApplicationResult> {
    console.log(`[PatternLearner] Applying ${patterns.length} patterns`);

    const extractedValues: Record<string, unknown> = {};
    const patternsUsed: string[] = [];
    let totalConfidence = 0;

    for (const match of patterns) {
      try {
        const result = this.applyPattern(match.pattern, content, match.matchedRegions);
        
        if (result.success) {
          Object.assign(extractedValues, result.values);
          patternsUsed.push(match.pattern.id);
          totalConfidence += match.pattern.confidence;

          // Update pattern usage
          await this.recordPatternUsage(match.pattern.id, true);
        }
      } catch (error) {
        console.error(`[PatternLearner] Error applying pattern ${match.pattern.id}:`, error);
        await this.recordPatternUsage(match.pattern.id, false);
      }
    }

    const avgConfidence = patternsUsed.length > 0 
      ? totalConfidence / patternsUsed.length 
      : 0;

    return {
      applied: patternsUsed.length > 0,
      extractedValues,
      confidence: avgConfidence,
      patternsUsed
    };
  }

  /**
   * Update pattern confidence after use
   */
  async updatePatternConfidence(
    patternId: string,
    success: boolean
  ): Promise<void> {
    await this.recordPatternUsage(patternId, success);
  }

  /**
   * Deprecate a pattern (soft delete)
   */
  async deprecatePattern(patternId: string): Promise<void> {
    console.log(`[PatternLearner] Deprecating pattern ${patternId}`);

    const { error } = await this.supabase
      .from('rag_learned_patterns')
      .update({ 
        confidence: 0,
        metadata: { deprecated: true, deprecatedAt: new Date().toISOString() }
      })
      .eq('id', patternId);

    if (error) {
      console.error('[PatternLearner] Error deprecating pattern:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Learning Helpers
  // ==========================================================================

  /**
   * Learn field extraction patterns from an item
   */
  private async learnFieldExtractionPatterns(
    item: ExtractedItemTemplate,
    content: string,
    documentType: string
  ): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];
    const fieldsToLearn = ['name', 'vendor', 'version', 'description'] as const;

    for (const field of fieldsToLearn) {
      const value = item[field as keyof ExtractedItemTemplate];
      if (!value || typeof value !== 'string') continue;

      // Find where this value appears in the content
      const occurrences = this.findValueInContent(value, content);
      
      if (occurrences.length > 0) {
        // Generate regex pattern for this field
        const regexPattern = await this.generateRegexPattern(
          field,
          value,
          content,
          occurrences[0]
        );

        if (regexPattern) {
          const existingPattern = await this.findSimilarPattern(
            'field_extraction',
            regexPattern.pattern,
            documentType
          );

          if (existingPattern) {
            // Update existing pattern with new example
            await this.addExampleToPattern(existingPattern.id, {
              input: content.substring(
                Math.max(0, occurrences[0].start - 50),
                Math.min(content.length, occurrences[0].end + 50)
              ),
              output: value,
              context: documentType,
              timestamp: new Date()
            });
          } else {
            // Create new pattern
            patterns.push({
              id: uuidv4(),
              patternType: 'field_extraction',
              sourceType: documentType,
              inputPattern: regexPattern.pattern,
              outputMapping: {
                targetField: field,
                transformationType: 'direct',
                transformationConfig: {
                  captureGroup: regexPattern.captureGroup || 1,
                  trim: true
                }
              },
              confidence: 0.5,
              usageCount: 0,
              successCount: 0,
              lastUsed: new Date(),
              createdAt: new Date(),
              metadata: {
                learnedFrom: [item.name as string || 'unknown'],
                documentTypes: [documentType],
                industries: [],
                categories: [],
                examples: [{
                  input: content.substring(
                    Math.max(0, occurrences[0].start - 50),
                    Math.min(content.length, occurrences[0].end + 50)
                  ),
                  output: value,
                  context: documentType,
                  timestamp: new Date()
                }]
              }
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Learn entity classification patterns
   */
  private async learnClassificationPattern(
    item: ExtractedItemTemplate,
    content: string,
    documentType: string
  ): Promise<LearnedPattern | null> {
    const itemType = item.type;
    const category = item.category;

    if (!itemType && !category) return null;

    // Use LLM to identify classification indicators
    const prompt = `Analyze this text and identify keywords or phrases that indicate this is a "${itemType || category}":

Text excerpt: "${content.substring(0, 500)}"

Item classified as: ${itemType ? `Type: ${itemType}` : ''} ${category ? `Category: ${category}` : ''}

Return a JSON object with:
{
  "indicators": ["keyword1", "keyword2"],
  "pattern": "regex pattern to match these indicators",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      if (result.pattern && result.confidence > 0.5) {
        return {
          id: uuidv4(),
          patternType: 'entity_classification',
          sourceType: documentType,
          inputPattern: result.pattern,
          outputMapping: {
            targetField: itemType ? 'type' : 'category',
            transformationType: 'lookup',
            transformationConfig: {
              lookupTable: Object.fromEntries(
                result.indicators.map((ind: string) => [ind.toLowerCase(), itemType || category])
              )
            }
          },
          confidence: result.confidence * 0.5, // Start with lower confidence
          usageCount: 0,
          successCount: 0,
          lastUsed: new Date(),
          createdAt: new Date(),
          metadata: {
            learnedFrom: [item.name || 'unknown'],
            documentTypes: [documentType],
            industries: [],
            categories: [category || ''],
            examples: [{
              input: content.substring(0, 200),
              output: itemType || category || '',
              context: 'classification',
              timestamp: new Date()
            }]
          }
        };
      }
    } catch (error) {
      console.error('[PatternLearner] Error learning classification pattern:', error);
    }

    return null;
  }

  /**
   * Learn normalization patterns (e.g., company name variations)
   */
  private async learnNormalizationPatterns(
    item: ExtractedItemTemplate,
    document: DocumentInfo
  ): Promise<LearnedPattern[]> {
    const patterns: LearnedPattern[] = [];
    const vendor = item.vendor;

    if (vendor) {
      // Check for vendor name variations in the document
      const variations = this.findVendorVariations(vendor, document.content);

      if (variations.length > 1) {
        patterns.push({
          id: uuidv4(),
          patternType: 'normalization',
          sourceType: document.type,
          inputPattern: variations.map(v => this.escapeRegex(v)).join('|'),
          outputMapping: {
            targetField: 'vendor',
            transformationType: 'direct',
            transformationConfig: {
              normalizedValue: vendor,
              variations
            }
          },
          confidence: 0.6,
          usageCount: 0,
          successCount: 0,
          lastUsed: new Date(),
          createdAt: new Date(),
          metadata: {
            learnedFrom: [vendor],
            documentTypes: [document.type],
            industries: [],
            categories: [],
            examples: variations.map(v => ({
              input: v,
              output: vendor,
              context: 'normalization',
              timestamp: new Date()
            }))
          }
        });
      }
    }

    return patterns;
  }

  // ==========================================================================
  // Pattern Matching Helpers
  // ==========================================================================

  /**
   * Match a pattern against content
   */
  private matchPattern(
    pattern: LearnedPattern,
    content: string
  ): { matches: boolean; score: number; regions: MatchedRegion[] } {
    try {
      const regex = new RegExp(pattern.inputPattern, 'gi');
      const regions: MatchedRegion[] = [];
      let match;

      while ((match = regex.exec(content)) !== null) {
        regions.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
      }

      const matches = regions.length > 0;
      const score = matches 
        ? Math.min(1, regions.length * 0.2) * pattern.confidence 
        : 0;

      return { matches, score, regions };

    } catch (error) {
      // Invalid regex
      return { matches: false, score: 0, regions: [] };
    }
  }

  /**
   * Apply a pattern to extract values
   */
  private applyPattern(
    pattern: LearnedPattern,
    content: string,
    regions: MatchedRegion[]
  ): { success: boolean; values: Record<string, unknown> } {
    const values: Record<string, unknown> = {};
    const { outputMapping } = pattern;

    try {
      const regex = new RegExp(pattern.inputPattern, 'gi');
      const match = regex.exec(content);

      if (!match) {
        return { success: false, values };
      }

      switch (outputMapping.transformationType) {
        case 'direct': {
          const captureGroup = (outputMapping.transformationConfig.captureGroup as number) || 1;
          let value = match[captureGroup] || match[0];
          
          if (outputMapping.transformationConfig.trim) {
            value = value.trim();
          }
          
          values[outputMapping.targetField] = value;
          break;
        }

        case 'lookup': {
          const lookupTable = outputMapping.transformationConfig.lookupTable as Record<string, string>;
          const matchedText = match[0].toLowerCase();
          
          for (const [key, value] of Object.entries(lookupTable)) {
            if (matchedText.includes(key.toLowerCase())) {
              values[outputMapping.targetField] = value;
              break;
            }
          }
          break;
        }

        case 'template': {
          const template = outputMapping.transformationConfig.template as string;
          let result = template;
          
          for (let i = 0; i < match.length; i++) {
            result = result.replace(`$${i}`, match[i] || '');
          }
          
          values[outputMapping.targetField] = result;
          break;
        }
      }

      return { success: Object.keys(values).length > 0, values };

    } catch (error) {
      console.error('[PatternLearner] Error applying pattern:', error);
      return { success: false, values };
    }
  }

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  /**
   * Store a pattern in the database
   */
  private async storePattern(pattern: LearnedPattern): Promise<void> {
    const dbPattern: Omit<DbLearnedPattern, 'id'> & { id?: string } = {
      id: pattern.id,
      pattern_type: pattern.patternType,
      source_type: pattern.sourceType,
      input_pattern: pattern.inputPattern,
      output_mapping: pattern.outputMapping,
      confidence: pattern.confidence,
      usage_count: pattern.usageCount,
      success_count: pattern.successCount,
      last_used: pattern.lastUsed.toISOString(),
      created_at: pattern.createdAt.toISOString(),
      metadata: pattern.metadata
    };

    const { error } = await this.supabase
      .from('rag_learned_patterns')
      .upsert(dbPattern, { onConflict: 'id' });

    if (error) {
      console.error('[PatternLearner] Error storing pattern:', error);
      throw error;
    }
  }

  /**
   * Find similar existing pattern
   */
  private async findSimilarPattern(
    patternType: PatternType,
    inputPattern: string,
    sourceType: string
  ): Promise<LearnedPattern | null> {
    const { data, error } = await this.supabase
      .from('rag_learned_patterns')
      .select('*')
      .eq('pattern_type', patternType)
      .eq('source_type', sourceType)
      .limit(100);

    if (error || !data) return null;

    // Simple similarity check based on pattern structure
    for (const dbPattern of (data as DbLearnedPattern[])) {
      if (this.patternsAreSimilar(inputPattern, dbPattern.input_pattern)) {
        return this.dbToPattern(dbPattern);
      }
    }

    return null;
  }

  /**
   * Add example to existing pattern
   */
  private async addExampleToPattern(
    patternId: string,
    example: PatternExample
  ): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from('rag_learned_patterns')
      .select('metadata')
      .eq('id', patternId)
      .single();

    if (fetchError || !data) return;

    const metadata = data.metadata as PatternMetadata;
    metadata.examples = metadata.examples || [];
    metadata.examples.push(example);

    // Keep only last 10 examples
    if (metadata.examples.length > 10) {
      metadata.examples = metadata.examples.slice(-10);
    }

    const { error } = await this.supabase
      .from('rag_learned_patterns')
      .update({ metadata })
      .eq('id', patternId);

    if (error) {
      console.error('[PatternLearner] Error adding example:', error);
    }
  }

  /**
   * Record pattern usage and update confidence
   */
  private async recordPatternUsage(
    patternId: string,
    success: boolean
  ): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from('rag_learned_patterns')
      .select('usage_count, success_count')
      .eq('id', patternId)
      .single();

    if (fetchError || !data) return;

    const updates = {
      usage_count: (data.usage_count || 0) + 1,
      success_count: (data.success_count || 0) + (success ? 1 : 0),
      last_used: new Date().toISOString()
    };

    const { error } = await this.supabase
      .from('rag_learned_patterns')
      .update(updates)
      .eq('id', patternId);

    if (error) {
      console.error('[PatternLearner] Error recording usage:', error);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Convert DB pattern to domain model
   */
  private dbToPattern(db: DbLearnedPattern): LearnedPattern {
    return {
      id: db.id,
      patternType: db.pattern_type,
      sourceType: db.source_type,
      inputPattern: db.input_pattern,
      outputMapping: db.output_mapping,
      confidence: db.confidence,
      usageCount: db.usage_count,
      successCount: db.success_count,
      lastUsed: new Date(db.last_used),
      createdAt: new Date(db.created_at),
      metadata: db.metadata
    };
  }

  /**
   * Find value occurrences in content
   */
  private findValueInContent(
    value: string,
    content: string
  ): Array<{ start: number; end: number }> {
    const occurrences: Array<{ start: number; end: number }> = [];
    const searchValue = value.toLowerCase();
    const searchContent = content.toLowerCase();
    
    let index = 0;
    while ((index = searchContent.indexOf(searchValue, index)) !== -1) {
      occurrences.push({ start: index, end: index + value.length });
      index += value.length;
    }

    return occurrences;
  }

  /**
   * Generate regex pattern for a field value
   */
  private async generateRegexPattern(
    field: string,
    value: string,
    content: string,
    occurrence: { start: number; end: number }
  ): Promise<{ pattern: string; captureGroup?: number } | null> {
    // Get context around the value
    const contextStart = Math.max(0, occurrence.start - 100);
    const contextEnd = Math.min(content.length, occurrence.end + 50);
    const context = content.substring(contextStart, contextEnd);

    const prompt = `Generate a regex pattern to extract "${value}" as the ${field} field from text like this:

"${context}"

The pattern should:
1. Be general enough to match similar patterns
2. Use a capture group for the actual value
3. Be case-insensitive

Return only a JSON object:
{
  "pattern": "your regex pattern here",
  "captureGroup": 1,
  "explanation": "brief explanation"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (result.pattern) {
        // Validate the regex
        try {
          new RegExp(result.pattern);
          return { pattern: result.pattern, captureGroup: result.captureGroup };
        } catch {
          return null;
        }
      }
    } catch (error) {
      console.error('[PatternLearner] Error generating regex:', error);
    }

    return null;
  }

  /**
   * Find vendor name variations
   */
  private findVendorVariations(vendor: string, content: string): string[] {
    const variations = new Set<string>([vendor]);
    
    // Common variations
    const possibleVariations = [
      vendor,
      vendor.toUpperCase(),
      vendor.toLowerCase(),
      vendor.replace(/\s+/g, ''),
      vendor.replace(/\s+/g, '-'),
      vendor.replace(/,?\s*(Inc|LLC|Ltd|Corp|Corporation|Company|Co)\.?$/i, '').trim()
    ];

    for (const variation of possibleVariations) {
      if (content.toLowerCase().includes(variation.toLowerCase())) {
        // Find the actual case used in the document
        const regex = new RegExp(this.escapeRegex(variation), 'gi');
        const match = regex.exec(content);
        if (match) {
          variations.add(match[0]);
        }
      }
    }

    return Array.from(variations);
  }

  /**
   * Check if two patterns are similar
   */
  private patternsAreSimilar(pattern1: string, pattern2: string): boolean {
    // Simple check - could be made more sophisticated
    const normalize = (p: string) => p.toLowerCase().replace(/\s+/g, '');
    return normalize(pattern1) === normalize(pattern2);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let patternLearnerInstance: PatternLearner | null = null;

export function getPatternLearner(config?: Partial<PatternLearnerConfig>): PatternLearner {
  if (!patternLearnerInstance) {
    patternLearnerInstance = new PatternLearner(config);
  }
  return patternLearnerInstance;
}

export default PatternLearner;
