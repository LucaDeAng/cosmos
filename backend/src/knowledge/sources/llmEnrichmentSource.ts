/**
 * LLM-based Product Enrichment Source
 *
 * Fallback enrichment using GPT when other sources (Icecat, Catalogs) don't have data.
 * Useful for:
 * - Automotive products (not in Icecat)
 * - Niche/specialized products
 * - New products not yet in catalogs
 */

import { ChatOpenAI } from '@langchain/openai';
import type { EnrichmentResult, KnowledgeSourceType } from '../types';

export interface LLMEnrichmentInput {
  name: string;
  description?: string;
  type: 'product' | 'service';
  vendor?: string;
  category?: string;
  industryContext?: string;
}

export interface LLMEnrichmentOutput extends EnrichmentResult {
  enrichedFields: {
    category?: string;
    subcategory?: string;
    lifecycle_stage?: 'development' | 'growth' | 'maturity' | 'decline';
    pricing_model?: 'subscription' | 'one_time' | 'usage_based' | 'freemium';
    target_segment?: string;
    description?: string;
    tags?: string[];
    specifications?: Record<string, unknown>;
  };
}

export class LLMEnrichmentSource {
  private enabled: boolean;
  private llm: ChatOpenAI | null = null;

  constructor() {
    this.enabled = !!process.env.OPENAI_API_KEY;

    if (this.enabled) {
      this.llm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.2,
        openAIApiKey: process.env.OPENAI_API_KEY,
        maxTokens: 1000,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enrich a single product/service using LLM
   */
  async enrich(input: LLMEnrichmentInput): Promise<LLMEnrichmentOutput> {
    if (!this.enabled || !this.llm) {
      return {
        source: 'company_catalog' as KnowledgeSourceType, // Use existing type as fallback
        confidence: 0,
        fields_enriched: [],
        reasoning: ['LLM enrichment disabled - no API key'],
        enrichedFields: {}
      };
    }

    try {
      const prompt = this.buildPrompt(input);
      const response = await this.llm.invoke([{ role: 'user', content: prompt }]);
      const content = typeof response.content === 'string' ? response.content : '';

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyResult('Could not parse LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const enrichedFields: LLMEnrichmentOutput['enrichedFields'] = {};
      const fieldsEnriched: string[] = [];

      // Extract and validate fields
      if (parsed.category && typeof parsed.category === 'string') {
        enrichedFields.category = parsed.category;
        fieldsEnriched.push('category');
      }
      if (parsed.subcategory && typeof parsed.subcategory === 'string') {
        enrichedFields.subcategory = parsed.subcategory;
        fieldsEnriched.push('subcategory');
      }
      if (parsed.lifecycle_stage && ['development', 'growth', 'maturity', 'decline'].includes(parsed.lifecycle_stage)) {
        enrichedFields.lifecycle_stage = parsed.lifecycle_stage;
        fieldsEnriched.push('lifecycle_stage');
      }
      if (parsed.pricing_model && ['subscription', 'one_time', 'usage_based', 'freemium'].includes(parsed.pricing_model)) {
        enrichedFields.pricing_model = parsed.pricing_model;
        fieldsEnriched.push('pricing_model');
      }
      if (parsed.target_segment && typeof parsed.target_segment === 'string') {
        enrichedFields.target_segment = parsed.target_segment;
        fieldsEnriched.push('target_segment');
      }
      if (parsed.description && typeof parsed.description === 'string' && !input.description) {
        enrichedFields.description = parsed.description;
        fieldsEnriched.push('description');
      }
      if (parsed.tags && Array.isArray(parsed.tags)) {
        const filteredTags = parsed.tags.filter((t: unknown) => typeof t === 'string');
        if (filteredTags.length > 0) {
          enrichedFields.tags = filteredTags;
          fieldsEnriched.push('tags');
        }
      }
      if (parsed.specifications && typeof parsed.specifications === 'object') {
        enrichedFields.specifications = parsed.specifications;
        fieldsEnriched.push('specifications');
      }

      const confidence = fieldsEnriched.length > 0 ? 0.7 : 0;

      return {
        source: 'company_catalog' as KnowledgeSourceType,
        confidence,
        fields_enriched: fieldsEnriched,
        reasoning: [
          `LLM enriched ${fieldsEnriched.length} fields`,
          parsed.reasoning || 'Based on product name and context'
        ],
        enrichedFields
      };

    } catch (error) {
      console.warn('   ⚠️  LLM enrichment failed:', error);
      return this.emptyResult('LLM enrichment error');
    }
  }

  /**
   * Batch enrich multiple items
   */
  async enrichBatch(
    items: LLMEnrichmentInput[],
    maxConcurrency = 3
  ): Promise<Map<string, LLMEnrichmentOutput>> {
    const results = new Map<string, LLMEnrichmentOutput>();

    if (!this.enabled || items.length === 0) {
      return results;
    }

    // Process in batches to respect rate limits
    for (let i = 0; i < items.length; i += maxConcurrency) {
      const batch = items.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(
        batch.map(item => this.enrich(item))
      );

      batch.forEach((item, idx) => {
        results.set(item.name, batchResults[idx]);
      });
    }

    return results;
  }

  private buildPrompt(input: LLMEnrichmentInput): string {
    return `Analizza questo ${input.type === 'product' ? 'prodotto' : 'servizio'} e fornisci informazioni di arricchimento.

NOME: ${input.name}
${input.vendor ? `PRODUTTORE/BRAND: ${input.vendor}` : ''}
${input.description ? `DESCRIZIONE: ${input.description}` : ''}
${input.category ? `CATEGORIA ATTUALE: ${input.category}` : ''}
${input.industryContext ? `CONTESTO SETTORE: ${input.industryContext}` : ''}

Fornisci un JSON con i seguenti campi (solo quelli che puoi inferire con confidenza):

{
  "category": "categoria principale del prodotto",
  "subcategory": "sottocategoria specifica",
  "lifecycle_stage": "development|growth|maturity|decline",
  "pricing_model": "subscription|one_time|usage_based|freemium",
  "target_segment": "segmento di mercato target",
  "description": "breve descrizione se non fornita",
  "tags": ["tag1", "tag2", "tag3"],
  "specifications": { "chiave": "valore" },
  "reasoning": "breve spiegazione delle inferenze"
}

IMPORTANTE:
- Rispondi SOLO con il JSON, senza markdown
- Ometti campi che non puoi inferire con confidenza
- Per prodotti automotive: usa categorie come "Passenger Vehicles", "Electric Vehicles", "Commercial Vehicles"
- Per servizi: usa categorie come "Professional Services", "Managed Services", "Consulting"`;
  }

  private emptyResult(reason: string): LLMEnrichmentOutput {
    return {
      source: 'company_catalog' as KnowledgeSourceType,
      confidence: 0,
      fields_enriched: [],
      reasoning: [reason],
      enrichedFields: {}
    };
  }
}

// Singleton instance
let llmEnrichmentSource: LLMEnrichmentSource | null = null;

export function getLLMEnrichmentSource(): LLMEnrichmentSource {
  if (!llmEnrichmentSource) {
    llmEnrichmentSource = new LLMEnrichmentSource();
  }
  return llmEnrichmentSource;
}
