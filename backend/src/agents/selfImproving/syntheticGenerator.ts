/**
 * Synthetic Data Generator Service
 * 
 * Generates synthetic training examples to improve extraction accuracy,
 * handles edge cases, and creates variations for better generalization.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  SyntheticExample,
  SyntheticExampleType,
  SyntheticInput,
  SyntheticOutput,
  SyntheticMetadata,
  ExtractedItemTemplate,
  DocumentInfo,
  ExtractionResult,
  ErrorPattern,
  ValidationResult,
  ISyntheticGenerator,
  DbSyntheticExample
} from './types';

// ============================================================================
// Configuration
// ============================================================================

interface SyntheticGeneratorConfig {
  maxExamplesPerBatch: number;
  validationThreshold: number;
  temperature: number;
  defaultComplexity: 'simple' | 'medium' | 'complex';
}

const DEFAULT_CONFIG: SyntheticGeneratorConfig = {
  maxExamplesPerBatch: 10,
  validationThreshold: 0.7,
  temperature: 0.7,
  defaultComplexity: 'medium'
};

// ============================================================================
// Category Templates
// ============================================================================

const CATEGORY_TEMPLATES: Record<string, { industries: string[]; types: string[] }> = {
  'Industrial Products': {
    industries: ['Manufacturing', 'Construction', 'Energy', 'Mining'],
    types: ['Equipment', 'Machinery', 'Components', 'Materials', 'Tools']
  },
  'Consumer Products': {
    industries: ['Retail', 'E-commerce', 'Consumer Goods'],
    types: ['Electronics', 'Appliances', 'Furniture', 'Personal Care', 'Food & Beverage']
  },
  'Technology Solutions': {
    industries: ['Technology', 'Software', 'Telecommunications'],
    types: ['Software', 'Platform', 'Service', 'Hardware', 'SaaS']
  },
  'Financial Services': {
    industries: ['Banking', 'Insurance', 'Investment', 'Fintech'],
    types: ['Product', 'Service', 'Platform', 'Solution']
  },
  'Healthcare': {
    industries: ['Healthcare', 'Pharmaceuticals', 'Medical Devices'],
    types: ['Device', 'Pharmaceutical', 'Service', 'Solution', 'Platform']
  },
  'Professional Services': {
    industries: ['Consulting', 'Legal', 'Accounting', 'Marketing'],
    types: ['Service', 'Solution', 'Platform', 'Advisory']
  }
};

// ============================================================================
// Synthetic Generator Implementation
// ============================================================================

export class SyntheticGenerator implements ISyntheticGenerator {
  private supabase: SupabaseClient;
  private openai: OpenAI;
  private config: SyntheticGeneratorConfig;

  constructor(config?: Partial<SyntheticGeneratorConfig>) {
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
  // Core Generation Methods
  // ==========================================================================

  /**
   * Generate synthetic examples for a category
   */
  async generateExamples(
    category: string,
    count: number,
    complexity: 'simple' | 'medium' | 'complex' = this.config.defaultComplexity
  ): Promise<SyntheticExample[]> {
    console.log(`[SyntheticGenerator] Generating ${count} ${complexity} examples for ${category}`);

    const examples: SyntheticExample[] = [];
    const template = CATEGORY_TEMPLATES[category] || this.getDefaultTemplate(category);

    const prompt = this.buildGenerationPrompt(category, template, complexity, count);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      if (result.examples && Array.isArray(result.examples)) {
        for (const ex of result.examples) {
          const syntheticExample = await this.createSyntheticExample(
            ex,
            category,
            template.industries[0] || 'General',
            complexity,
            'generated'
          );

          // Validate before adding
          const validation = await this.validateExample(syntheticExample);
          if (validation.valid) {
            examples.push(syntheticExample);
            await this.storeSyntheticExample(syntheticExample);
          }
        }
      }
    } catch (error) {
      console.error('[SyntheticGenerator] Error generating examples:', error);
    }

    console.log(`[SyntheticGenerator] Generated ${examples.length} valid examples`);
    return examples;
  }

  /**
   * Augment examples from a real document
   */
  async augmentFromDocument(
    document: DocumentInfo,
    extraction: ExtractionResult
  ): Promise<SyntheticExample[]> {
    console.log(`[SyntheticGenerator] Augmenting from document ${document.id}`);

    const examples: SyntheticExample[] = [];

    for (const item of extraction.items) {
      // Generate variations of the extracted item
      const variations = await this.generateVariations(item, document.content);

      for (const variation of variations) {
        const syntheticExample = await this.createSyntheticExample(
          {
            text: variation.text,
            items: [variation.item]
          },
          item.category as string || 'General',
          'General',
          'medium',
          'augmented',
          document.id
        );

        const validation = await this.validateExample(syntheticExample);
        if (validation.valid && validation.score >= this.config.validationThreshold) {
          examples.push(syntheticExample);
          await this.storeSyntheticExample(syntheticExample);
        }
      }
    }

    console.log(`[SyntheticGenerator] Created ${examples.length} augmented examples`);
    return examples;
  }

  /**
   * Generate edge cases from error patterns
   */
  async generateEdgeCases(
    errorPatterns: ErrorPattern[]
  ): Promise<SyntheticExample[]> {
    console.log(`[SyntheticGenerator] Generating edge cases from ${errorPatterns.length} error patterns`);

    const examples: SyntheticExample[] = [];

    for (const pattern of errorPatterns) {
      const edgeCases = await this.generateEdgeCaseExamples(pattern);

      for (const edgeCase of edgeCases) {
        const syntheticExample = await this.createSyntheticExample(
          edgeCase,
          'Edge Cases',
          'General',
          'complex',
          'edge_case'
        );

        // Edge cases are more lenient on validation
        const validation = await this.validateExample(syntheticExample);
        if (validation.valid) {
          examples.push(syntheticExample);
          await this.storeSyntheticExample(syntheticExample);
        }
      }
    }

    console.log(`[SyntheticGenerator] Generated ${examples.length} edge case examples`);
    return examples;
  }

  /**
   * Validate a synthetic example
   */
  async validateExample(example: SyntheticExample): Promise<ValidationResult> {
    const issues: string[] = [];
    let score = 1.0;

    // Check input data
    if (!example.inputData.text && !example.inputData.structuredData) {
      issues.push('Missing input data');
      score -= 0.5;
    }

    // Check expected output
    if (!example.expectedOutput.extractedItems || example.expectedOutput.extractedItems.length === 0) {
      issues.push('Missing expected output items');
      score -= 0.3;
    }

    // Validate each expected item
    for (const item of example.expectedOutput.extractedItems) {
      if (!item.name) {
        issues.push('Item missing name');
        score -= 0.2;
      }
    }

    // Check for consistency between input and output
    if (example.inputData.text && example.expectedOutput.extractedItems.length > 0) {
      const textLower = example.inputData.text.toLowerCase();
      let matchCount = 0;

      for (const item of example.expectedOutput.extractedItems) {
        if (item.name && textLower.includes(item.name.toLowerCase())) {
          matchCount++;
        }
      }

      const matchRatio = matchCount / example.expectedOutput.extractedItems.length;
      if (matchRatio < 0.5) {
        issues.push('Low consistency between input and output');
        score -= 0.2;
      }
    }

    // Use LLM for quality assessment if basic checks pass
    if (score > 0.6) {
      const llmValidation = await this.validateWithLLM(example);
      score = (score + llmValidation.score) / 2;
      issues.push(...llmValidation.issues);
    }

    return {
      valid: score >= this.config.validationThreshold,
      score: Math.max(0, Math.min(1, score)),
      issues
    };
  }

  // ==========================================================================
  // Generation Helpers
  // ==========================================================================

  /**
   * Build prompt for generating examples
   */
  private buildGenerationPrompt(
    category: string,
    template: { industries: string[]; types: string[] },
    complexity: 'simple' | 'medium' | 'complex',
    count: number
  ): string {
    const complexityGuide = {
      simple: 'Clear, straightforward descriptions with obvious product/service names',
      medium: 'Realistic business descriptions with some technical terminology',
      complex: 'Complex scenarios with ambiguous boundaries, multiple products, technical jargon'
    };

    return `Generate ${count} synthetic training examples for extracting products/services from text.

Category: ${category}
Related Industries: ${template.industries.join(', ')}
Product/Service Types: ${template.types.join(', ')}
Complexity Level: ${complexity}
Complexity Guide: ${complexityGuide[complexity]}

For each example, generate:
1. A realistic text passage (1-3 paragraphs) that describes products/services
2. The expected extracted items

Return a JSON object:
{
  "examples": [
    {
      "text": "The passage text here...",
      "context": "Brief context about the document type",
      "items": [
        {
          "name": "Product/Service Name",
          "description": "Brief description",
          "category": "${category}",
          "type": "One of: ${template.types.join(', ')}",
          "vendor": "Company name if mentioned",
          "version": "Version if applicable"
        }
      ]
    }
  ]
}

Make the examples diverse and realistic. Include:
- Different writing styles (formal, technical, marketing)
- Various document contexts (catalogs, proposals, reports)
- Mix of explicit and implicit product mentions
- Some examples with multiple products in one text`;
  }

  /**
   * Generate variations of an extracted item
   */
  private async generateVariations(
    item: ExtractedItemTemplate,
    originalContext: string
  ): Promise<Array<{ text: string; item: ExtractedItemTemplate }>> {
    const prompt = `Given this extracted product/service:
${JSON.stringify(item, null, 2)}

From this context:
"${originalContext.substring(0, 500)}..."

Generate 3 variations of how this same product/service might be described differently:

Return JSON:
{
  "variations": [
    {
      "text": "A different way to describe this product...",
      "item": {
        "name": "Possibly a variation of the name",
        "description": "...",
        "category": "${item.category}",
        "type": "${item.type}",
        "vendor": "${item.vendor}"
      }
    }
  ]
}

Make variations realistic:
1. Different writing styles
2. Different levels of detail
3. Different perspectives (technical, marketing, user)`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.variations || [];
    } catch {
      return [];
    }
  }

  /**
   * Generate edge case examples from error patterns
   */
  private async generateEdgeCaseExamples(
    pattern: ErrorPattern
  ): Promise<Array<{ text: string; items: ExtractedItemTemplate[] }>> {
    const prompt = `Generate training examples for this edge case pattern:

Error Type: ${pattern.errorType}
Frequency: ${pattern.frequency} occurrences
Examples of errors: ${pattern.examples.slice(0, 3).join(', ')}
Possible Causes: ${pattern.possibleCauses.join(', ')}

Create 2-3 examples that would help train a model to handle this edge case correctly.

Return JSON:
{
  "examples": [
    {
      "text": "Text that demonstrates the edge case...",
      "items": [
        {
          "name": "Correct extraction",
          "description": "...",
          "category": "...",
          "type": "..."
        }
      ],
      "explanation": "Why this is tricky and how to handle it"
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.examples || [];
    } catch {
      return [];
    }
  }

  /**
   * Validate example using LLM
   */
  private async validateWithLLM(
    example: SyntheticExample
  ): Promise<{ score: number; issues: string[] }> {
    const prompt = `Evaluate this synthetic training example for quality:

Input Text: "${example.inputData.text?.substring(0, 500)}"

Expected Extractions:
${JSON.stringify(example.expectedOutput.extractedItems, null, 2)}

Evaluate:
1. Is the input text realistic and coherent?
2. Are the expected extractions reasonable given the input?
3. Is there consistency between input and expected output?
4. Is this example useful for training?

Return JSON:
{
  "score": 0.0-1.0,
  "issues": ["List any issues found"],
  "feedback": "Brief feedback"
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        score: result.score || 0.5,
        issues: result.issues || []
      };
    } catch {
      return { score: 0.5, issues: ['LLM validation failed'] };
    }
  }

  // ==========================================================================
  // Storage and Retrieval
  // ==========================================================================

  /**
   * Create a synthetic example object
   */
  private async createSyntheticExample(
    data: {
      text?: string;
      items: ExtractedItemTemplate[];
      context?: string;
    },
    category: string,
    industry: string,
    complexity: 'simple' | 'medium' | 'complex',
    exampleType: SyntheticExampleType,
    sourceDocument?: string
  ): Promise<SyntheticExample> {
    return {
      id: uuidv4(),
      exampleType,
      sourceDocument,
      inputData: {
        text: data.text,
        context: data.context
      },
      expectedOutput: {
        extractedItems: data.items
      },
      category,
      industry,
      complexity,
      usedInTraining: 0,
      effectiveness: 0,
      createdAt: new Date(),
      metadata: {
        generationMethod: exampleType,
        qualityScore: 0,
        tags: [category, industry, complexity]
      }
    };
  }

  /**
   * Store synthetic example in database
   */
  private async storeSyntheticExample(example: SyntheticExample): Promise<void> {
    const dbExample: Omit<DbSyntheticExample, 'id'> & { id: string } = {
      id: example.id,
      example_type: example.exampleType,
      source_pattern: example.sourcePattern || null,
      source_document: example.sourceDocument || null,
      input_data: example.inputData,
      expected_output: example.expectedOutput,
      category: example.category,
      industry: example.industry,
      complexity: example.complexity,
      used_in_training: example.usedInTraining,
      effectiveness: example.effectiveness,
      created_at: example.createdAt.toISOString(),
      metadata: example.metadata
    };

    const { error } = await this.supabase
      .from('rag_synthetic_examples')
      .insert(dbExample);

    if (error) {
      console.error('[SyntheticGenerator] Error storing example:', error);
    }
  }

  /**
   * Get examples for training
   */
  async getExamplesForTraining(
    category?: string,
    complexity?: 'simple' | 'medium' | 'complex',
    limit: number = 50
  ): Promise<SyntheticExample[]> {
    let query = this.supabase
      .from('rag_synthetic_examples')
      .select('*')
      .order('effectiveness', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }
    if (complexity) {
      query = query.eq('complexity', complexity);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[SyntheticGenerator] Error fetching examples:', error);
      return [];
    }

    return (data as DbSyntheticExample[]).map(db => this.dbToExample(db));
  }

  /**
   * Update example effectiveness after use
   */
  async updateEffectiveness(
    exampleId: string,
    wasHelpful: boolean
  ): Promise<void> {
    const { data, error: fetchError } = await this.supabase
      .from('rag_synthetic_examples')
      .select('used_in_training, effectiveness')
      .eq('id', exampleId)
      .single();

    if (fetchError || !data) return;

    const usedCount = (data.used_in_training || 0) + 1;
    const currentEffectiveness = data.effectiveness || 0;
    
    // Exponential moving average
    const newEffectiveness = currentEffectiveness * 0.9 + (wasHelpful ? 0.1 : 0);

    await this.supabase
      .from('rag_synthetic_examples')
      .update({
        used_in_training: usedCount,
        effectiveness: newEffectiveness
      })
      .eq('id', exampleId);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get default template for unknown categories
   */
  private getDefaultTemplate(category: string): { industries: string[]; types: string[] } {
    return {
      industries: ['General', 'Business'],
      types: ['Product', 'Service', 'Solution', 'Platform']
    };
  }

  /**
   * Convert DB example to domain model
   */
  private dbToExample(db: DbSyntheticExample): SyntheticExample {
    return {
      id: db.id,
      exampleType: db.example_type,
      sourcePattern: db.source_pattern || undefined,
      sourceDocument: db.source_document || undefined,
      inputData: db.input_data,
      expectedOutput: db.expected_output,
      category: db.category,
      industry: db.industry,
      complexity: db.complexity,
      usedInTraining: db.used_in_training,
      effectiveness: db.effectiveness,
      createdAt: new Date(db.created_at),
      metadata: db.metadata
    };
  }

  /**
   * Get statistics about synthetic examples
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<SyntheticExampleType, number>;
    byCategory: Record<string, number>;
    avgEffectiveness: number;
  }> {
    const { data, error } = await this.supabase
      .from('rag_synthetic_examples')
      .select('example_type, category, effectiveness');

    if (error || !data) {
      return {
        total: 0,
        byType: { generated: 0, augmented: 0, variation: 0, edge_case: 0, user_provided: 0 },
        byCategory: {},
        avgEffectiveness: 0
      };
    }

    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let totalEffectiveness = 0;

    for (const row of data) {
      byType[row.example_type] = (byType[row.example_type] || 0) + 1;
      byCategory[row.category] = (byCategory[row.category] || 0) + 1;
      totalEffectiveness += row.effectiveness || 0;
    }

    return {
      total: data.length,
      byType: byType as Record<SyntheticExampleType, number>,
      byCategory,
      avgEffectiveness: data.length > 0 ? totalEffectiveness / data.length : 0
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let syntheticGeneratorInstance: SyntheticGenerator | null = null;

export function getSyntheticGenerator(
  config?: Partial<SyntheticGeneratorConfig>
): SyntheticGenerator {
  if (!syntheticGeneratorInstance) {
    syntheticGeneratorInstance = new SyntheticGenerator(config);
  }
  return syntheticGeneratorInstance;
}

export default SyntheticGenerator;
