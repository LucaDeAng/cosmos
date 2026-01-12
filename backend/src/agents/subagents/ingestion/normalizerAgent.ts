/**
 * Normalizer Agent
 * 
 * Uses RAG with IT catalogs to normalize extracted items into
 * standardized PortfolioItem format. Handles type detection,
 * category mapping, priority normalization, and data enrichment.
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

import { RawExtractedItem } from './pdfParserAgent';
import { semanticSearch, SourceType } from '../../utils/embeddingService';
import { inferProductSchema, inferServiceSchema, applyProductInference, applyServiceInference } from '../../utils/schemaInferenceEngine';
import { getLatestStrategicProfile } from '../../../repositories/assessmentSnapshotRepository';

// Continuous Learning
import { LearningService } from '../../../services/learningService';

// Product Knowledge Layer
import { getProductKnowledgeOrchestrator } from '../../../knowledge/ProductKnowledgeOrchestrator';
import type { GS1Category } from '../../../knowledge/types';

// Helper to convert null to undefined
function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

// Standard PortfolioItem schema
export const NormalizedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['product', 'service']), // REMOVED 'initiative' - only products and services
  status: z.enum(['active', 'paused', 'completed', 'cancelled', 'proposed']),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  budget: z.number().optional(),
  owner: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  strategicAlignment: z.number().min(1).max(10).optional(),
  businessValue: z.number().min(1).max(10).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  complexity: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  normalizationNotes: z.array(z.string()).optional(),

  // NEW: Schema inference fields (from strategic profile)
  pricing_model: z.enum(['subscription', 'perpetual', 'usage_based', 'freemium', 'other']).optional(),
  lifecycle_stage: z.enum(['development', 'growth', 'maturity', 'decline', 'sunset']).optional(),
  target_segment: z.enum(['enterprise', 'smb', 'consumer', 'government']).optional(),
  sales_cycle_length: z.enum(['short', 'medium', 'long']).optional(),
  delivery_model: z.enum(['cloud', 'on_premise', 'hybrid', 'saas']).optional(),
  tipo_offerta: z.string().optional(),
  tipo_servizio: z.string().optional(),
  distribution_channel: z.array(z.string()).optional(),
  strategic_importance: z.enum(['core', 'supporting', 'experimental']).optional(),
  resource_intensity: z.enum(['low', 'medium', 'high']).optional(),

  // Inference metadata (to show user what was inferred)
  _schema_inference: z.object({
    fields_inferred: z.array(z.string()),
    confidence: z.number(),
    reasoning: z.array(z.string()),
  }).optional(),

  // NEW: Multi-level confidence breakdown for HITL validation
  confidence_breakdown: z.object({
    overall: z.number().min(0).max(1),
    type: z.number().min(0).max(1),
    fields: z.record(z.string(), z.number()),
    reasoning: z.array(z.string()),
    quality_indicators: z.object({
      source_clarity: z.number().min(0).max(1),
      rag_match: z.number().min(0).max(1),
      schema_fit: z.number().min(0).max(1),
    }),
  }).optional(),

  // Extraction source metadata for transparency
  extraction_metadata: z.object({
    source_type: z.enum(['pdf_table', 'pdf_text', 'excel_row', 'text_block']),
    source_page: z.number().optional(),
    source_row: z.number().optional(),
    original_text: z.string().optional(),
  }).optional(),

  // GS1 Global Product Classification
  gs1_classification: z.object({
    segment_code: z.string(),
    segment_name: z.string(),
    family_code: z.string(),
    family_name: z.string(),
    class_code: z.string(),
    class_name: z.string(),
    brick_code: z.string(),
    brick_name: z.string(),
    full_path: z.string(),
  }).optional(),

  // Product Knowledge Layer enrichment metadata
  _product_knowledge_enrichment: z.array(z.object({
    source: z.enum(['company_catalog', 'icecat', 'gs1_taxonomy']),
    confidence: z.number(),
    fields_enriched: z.array(z.string()),
    reasoning: z.array(z.string()),
  })).optional(),

  // Product identifiers (from Icecat or manual entry)
  gtin: z.string().optional(),
  ean: z.string().optional(),
  mpn: z.string().optional(),
  vendor: z.string().optional(),
});

export type NormalizedItem = z.infer<typeof NormalizedItemSchema>;

export interface NormalizerInput {
  items: RawExtractedItem[];
  tenantId: string;
  userContext?: string;
  language?: 'it' | 'en';
}

export interface NormalizerOutput {
  success: boolean;
  items: NormalizedItem[];
  stats: {
    totalInput: number;
    totalNormalized: number;
    byType: { products: number; services: number }; // REMOVED initiatives
    avgConfidence: number;
  };
  processingTime: number;
}

// Type detection keywords - ONLY PRODUCT AND SERVICE (initiatives removed)
const TYPE_KEYWORDS: Record<string, { keywords: string[]; weight: number }[]> = {
  product: [
    // Strong product indicators
    { keywords: ['prodotto', 'product', 'piattaforma', 'platform'], weight: 1.2 },
    { keywords: ['applicazione', 'application', 'app', 'sistema', 'system'], weight: 1.0 },
    { keywords: ['software', 'soluzione', 'solution', 'tool'], weight: 1.0 },
    { keywords: ['portale', 'portal', 'dashboard'], weight: 0.9 },
    // Product lifecycle indicators
    { keywords: ['licenza', 'license', 'perpetua', 'perpetual'], weight: 0.8 },
    { keywords: ['versione', 'version', 'release', 'modulo', 'module'], weight: 0.7 },
    // Product characteristics
    { keywords: ['funzionalità', 'features', 'capabilities', 'componente', 'component'], weight: 0.6 },
    { keywords: ['integrazione', 'integration', 'api', 'plugin', 'addon'], weight: 0.5 },
  ],
  service: [
    // Strong service indicators
    { keywords: ['servizio', 'service', 'managed service', 'as-a-service'], weight: 1.2 },
    { keywords: ['supporto', 'support', 'helpdesk', 'service desk', 'assistenza'], weight: 1.0 },
    { keywords: ['consulenza', 'consulting', 'advisory', 'professional services'], weight: 1.0 },
    { keywords: ['manutenzione', 'maintenance', 'operation', 'gestione'], weight: 0.9 },
    // Service delivery models
    { keywords: ['hosting', 'saas', 'paas', 'iaas', 'cloud'], weight: 0.9 },
    { keywords: ['outsourcing', 'msp', 'provider', 'fornitore'], weight: 0.8 },
    // Service characteristics
    { keywords: ['24/7', '24x7', 'continuativo', 'continuous', 'ongoing'], weight: 0.8 },
    { keywords: ['sla', 'service level', 'kpi', 'metriche'], weight: 0.7 },
    { keywords: ['abbonamento', 'subscription', 'canone', 'fee'], weight: 0.6 },
  ],
};

// Status mapping
const STATUS_MAP: Record<string, NormalizedItem['status']> = {
  // Italian
  'attivo': 'active',
  'in corso': 'active',
  'running': 'active',
  'live': 'active',
  'operativo': 'active',
  'in pausa': 'paused',
  'sospeso': 'paused',
  'on hold': 'paused',
  'completato': 'completed',
  'done': 'completed',
  'chiuso': 'completed',
  'finito': 'completed',
  'cancellato': 'cancelled',
  'annullato': 'cancelled',
  'dropped': 'cancelled',
  'proposto': 'proposed',
  'pianificato': 'proposed',
  'planned': 'proposed',
  'idea': 'proposed',
  'backlog': 'proposed',
  // English
  'active': 'active',
  'paused': 'paused',
  'completed': 'completed',
  'cancelled': 'cancelled',
  'proposed': 'proposed',
};

// Priority mapping
const PRIORITY_MAP: Record<string, NormalizedItem['priority']> = {
  // Italian
  'critico': 'critical',
  'urgente': 'critical',
  'p0': 'critical',
  'must-have': 'critical',
  'alto': 'high',
  'importante': 'high',
  'p1': 'high',
  'should-have': 'high',
  'medio': 'medium',
  'normale': 'medium',
  'p2': 'medium',
  'could-have': 'medium',
  'basso': 'low',
  'p3': 'low',
  'nice-to-have': 'low',
  // English
  'critical': 'critical',
  'urgent': 'critical',
  'high': 'high',
  'important': 'high',
  'medium': 'medium',
  'normal': 'medium',
  'low': 'low',
};

/**
 * Detect item type using keyword matching and RAG context
 */
async function detectType(
  item: RawExtractedItem,
  ragContext: string
): Promise<{ type: NormalizedItem['type']; confidence: number }> {
  const textToAnalyze = `${item.name} ${item.description || ''} ${item.rawType || ''}`.toLowerCase();

  // Score each type - ONLY product and service
  const scores: Record<string, number> = {
    product: 0,
    service: 0,
  };

  for (const [type, keywordGroups] of Object.entries(TYPE_KEYWORDS)) {
    for (const { keywords, weight } of keywordGroups) {
      for (const keyword of keywords) {
        if (textToAnalyze.includes(keyword)) {
          scores[type] += weight;
        }
      }
    }
  }

  // Check RAG context for additional signals
  const ragLower = ragContext.toLowerCase();
  if (ragLower.includes('product') || ragLower.includes('application') || ragLower.includes('platform')) {
    scores.product += 0.8;
  }
  if (ragLower.includes('service') || ragLower.includes('sla') || ragLower.includes('managed') || ragLower.includes('support')) {
    scores.service += 0.8;
  }

  // Additional heuristics
  if (item.rawType) {
    const rawTypeLower = item.rawType.toLowerCase();
    if (rawTypeLower.includes('servizio') || rawTypeLower.includes('service') || rawTypeLower.includes('supporto') || rawTypeLower.includes('manutenzione')) {
      scores.service += 1.2;
    }
    if (rawTypeLower.includes('prodotto') || rawTypeLower.includes('product') || rawTypeLower.includes('piattaforma') || rawTypeLower.includes('platform')) {
      scores.product += 1.2;
    }
  }

  // Service-specific indicators
  if (textToAnalyze.includes('24/7') || textToAnalyze.includes('24x7') || textToAnalyze.includes('abbonamento') || textToAnalyze.includes('subscription')) {
    scores.service += 0.6;
  }

  // Product-specific indicators
  if (textToAnalyze.includes('licenza') || textToAnalyze.includes('license') || textToAnalyze.includes('versione') || textToAnalyze.includes('release')) {
    scores.product += 0.6;
  }

  // Find highest score
  const maxScore = Math.max(...Object.values(scores));
  const bestType = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] || 'product'; // Default to product

  // Calculate confidence with higher threshold
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / (totalScore + 1) : 0.3; // Lower default confidence

  return {
    type: bestType as NormalizedItem['type'],
    confidence: Math.min(confidence, 0.95),
  };
}

/**
 * Normalize status value
 */
function normalizeStatus(rawStatus?: string): NormalizedItem['status'] {
  if (!rawStatus) return 'proposed';
  
  const normalized = rawStatus.toLowerCase().trim();
  
  // Check direct mapping
  if (STATUS_MAP[normalized]) {
    return STATUS_MAP[normalized];
  }
  
  // Check partial matches
  for (const [key, value] of Object.entries(STATUS_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return 'proposed';
}

/**
 * Normalize priority value
 */
function normalizePriority(rawPriority?: string): NormalizedItem['priority'] | undefined {
  if (!rawPriority) return undefined;
  
  const normalized = rawPriority.toLowerCase().trim();
  
  // Check direct mapping
  if (PRIORITY_MAP[normalized]) {
    return PRIORITY_MAP[normalized];
  }
  
  // Check partial matches
  for (const [key, value] of Object.entries(PRIORITY_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  return 'medium';
}

/**
 * Get category from RAG catalog search
 */
async function getCategoryFromRAG(
  item: RawExtractedItem,
  tenantId: string
): Promise<{ category?: string; subcategory?: string; tags: string[] }> {
  // Simple in-memory cache to avoid repeated semanticSearch calls for similar queries
  const key = `${tenantId}::${(item.name || '').toLowerCase().slice(0, 200)}::${(item.description || '').toLowerCase().slice(0,200)}`;
  try {
    if ((getCategoryFromRAG as any)._cache && (getCategoryFromRAG as any)._cache.has(key)) {
      return (getCategoryFromRAG as any)._cache.get(key);
    }
  } catch (e) {
    // ignore cache issues
  }
  try {
    // Search all catalogs (IT + universal)
    const searchQuery = `${item.name} ${item.description || ''} ${(item.technologies || []).join(' ')}`;
    
    // All available catalog types for comprehensive search
    const catalogTypes: SourceType[] = [
      'catalog_it_services', 
      'catalog_technologies', 
      'catalog_portfolio_taxonomy',
      'catalog_products',      // Universal product categories
      'catalog_industries',    // Industry verticals
      'catalog_entities',      // Business entity types
      'catalog_examples',      // Synthetic examples
    ];
    
    const results = await semanticSearch(
      tenantId,
      searchQuery,
      {
        sourceTypes: catalogTypes,
        limit: 5,
        similarityThreshold: 0.5, // Lower threshold for better coverage
      }
    );
    
    if (results.length === 0) {
      // Fallback to system-wide catalogs
      const systemResults = await semanticSearch(
        '00000000-0000-0000-0000-000000000000', // System company ID
        searchQuery,
        {
          sourceTypes: catalogTypes,
          limit: 5,
          similarityThreshold: 0.5,
        }
      );
      
      if (systemResults.length > 0) {
        const out = extractCategoryFromRAGResults(systemResults);
        try { (getCategoryFromRAG as any)._cache = (getCategoryFromRAG as any)._cache || new Map(); (getCategoryFromRAG as any)._cache.set(key, out); } catch (e) {}
        return out;
      }
    } else {
      const out = extractCategoryFromRAGResults(results);
      try { (getCategoryFromRAG as any)._cache = (getCategoryFromRAG as any)._cache || new Map(); (getCategoryFromRAG as any)._cache.set(key, out); } catch (e) {}
      return out;
    }
  } catch (error) {
    console.warn('RAG category search failed:', error);
  }
  
  return { tags: [] };
}

/**
 * Extract category info from RAG search results
 */
function extractCategoryFromRAGResults(
  results: { content: string; metadata?: Record<string, unknown> }[]
): { category?: string; subcategory?: string; tags: string[] } {
  const tags: string[] = [];
  let category: string | undefined;
  let subcategory: string | undefined;
  
  for (const result of results) {
    const content = result.content.toLowerCase();
    
    // Extract category from content
    const categoryPatterns = [
      /application services/i,
      /infrastructure services/i,
      /platform services/i,
      /managed services/i,
      /digital.*innovation/i,
      /security/i,
      /data.*analytics/i,
    ];
    
    for (const pattern of categoryPatterns) {
      if (pattern.test(content)) {
        category = pattern.source.replace(/[\\.*]/g, ' ').trim();
        break;
      }
    }
    
    // Extract subcategory
    const subcategoryPatterns = [
      /enterprise applications/i,
      /compute services/i,
      /devops/i,
      /observability/i,
      /itsm/i,
      /ai.*machine learning/i,
      /automation.*rpa/i,
    ];
    
    for (const pattern of subcategoryPatterns) {
      if (pattern.test(content)) {
        subcategory = pattern.source.replace(/[\\.*]/g, ' ').trim();
        break;
      }
    }
    
    // Extract tags from metadata
    if (result.metadata?.tags && Array.isArray(result.metadata.tags)) {
      tags.push(...result.metadata.tags);
    }
  }
  
  return {
    category,
    subcategory,
    tags: [...new Set(tags)], // Dedupe
  };
}

/**
 * Use LLM for complex normalization cases
 */
async function normalizeWithLLM(
  items: RawExtractedItem[],
  ragContext: string
): Promise<Partial<NormalizedItem>[]> {
  if (items.length === 0) return [];
  
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  const prompt = `Normalizza questi item di portfolio usando il contesto dai cataloghi.
Il portfolio contiene SOLO prodotti e servizi (NO progetti/iniziative).

IMPORTANTE: Distingui accuratamente tra:
- PRODUCT: Beni tangibili, software, piattaforme, applicazioni vendibili o licensabili
- SERVICE: Servizi continuativi, managed services, supporto, consulenza, SaaS

CATALOGO DI RIFERIMENTO:
${ragContext.slice(0, 4000)}

ITEMS DA NORMALIZZARE:
${JSON.stringify(items.slice(0, 10), null, 2)}

Per ogni item, restituisci un JSON array con:
- type: "product" | "service" (SOLO questi due tipi, NO "initiative")
- status: "active" | "paused" | "completed" | "cancelled" | "proposed"
- priority: "critical" | "high" | "medium" | "low"
- category: categoria appropriata (es. "Software Platform", "IT Services", "Managed Services", "Security Products")
- subcategory: sottocategoria specifica
- riskLevel: "low" | "medium" | "high" | "critical"
- complexity: "low" | "medium" | "high"
- businessValue: 1-10
- strategicAlignment: 1-10

Basa le tue scelte sul contesto fornito. Rispondi SOLO con JSON array.`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = typeof response.content === 'string' ? response.content : '';
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('LLM normalization failed:', error);
  }
  
  return [];
}

/**
 * Enrich items with strategic profile context for better classification
 */
async function enrichWithStrategicContext(
  item: Partial<NormalizedItem>,
  strategicProfile: any
): Promise<{
  strategicAlignment?: number;
  businessValue?: number;
  strategic_importance?: 'core' | 'supporting' | 'experimental';
  category?: string;
  inferenceNotes: string[];
}> {
  const notes: string[] = [];
  const result: any = {};

  try {
    const companyIdentity = strategicProfile.company_identity;
    const strategicContext = strategicProfile.strategic_context;
    const portfolioComp = strategicProfile.portfolio_composition;

    // Calculate strategic alignment based on goals match
    const itemText = `${item.name} ${item.description || ''}`.toLowerCase();
    const goals = strategicContext?.goals_2025_2027 || [];

    let maxGoalMatch = 0;
    let matchedGoal: string | null = null;

    for (const goal of goals) {
      const goalText = goal.goal.replace(/_/g, ' ').toLowerCase();
      const goalKeywords = goalText.split(' ').filter((w: string) => w.length > 4);

      let matchScore = 0;
      for (const keyword of goalKeywords) {
        if (itemText.includes(keyword)) {
          matchScore += 1;
        }
      }

      if (matchScore > maxGoalMatch) {
        maxGoalMatch = matchScore;
        matchedGoal = goal.goal.replace(/_/g, ' ');
      }
    }

    // Strategic alignment score (1-10) - only set if keyword match found
    if (maxGoalMatch >= 3) {
      result.strategicAlignment = 9;
      result.strategic_importance = 'core';
      notes.push(`Strongly aligned with goal: ${matchedGoal}`);
    } else if (maxGoalMatch >= 2) {
      result.strategicAlignment = 7;
      result.strategic_importance = 'core';
      notes.push(`Aligned with goal: ${matchedGoal}`);
    } else if (maxGoalMatch === 1) {
      result.strategicAlignment = 5;
      result.strategic_importance = 'supporting';
      notes.push(`Partially aligned with goal: ${matchedGoal}`);
    }
    // NOTE: If no keyword match (maxGoalMatch === 0), leave strategicAlignment undefined
    // The LLM evaluation will be called separately to provide intelligent scoring

    // Business value inference - only if we have strategic alignment from keyword match
    const criteria = strategicContext?.prioritization_criteria;
    if (criteria && result.strategicAlignment !== undefined) {
      // Weighted business value based on company's priorities
      const weights = {
        strategic: criteria.strategic_alignment_weight || 3,
        roi: criteria.roi_weight || 3,
        innovation: criteria.innovation_weight || 3,
        customer: criteria.customer_demand_weight || 3,
      };

      // Start from strategic alignment score
      let businessValue = result.strategicAlignment;

      if (item.budget && item.budget > 100000) {
        businessValue = Math.min(10, businessValue + 2);
        notes.push('High budget indicates high business value');
      }

      // Adjust based on type and company priorities
      if (item.type === 'product' && weights.innovation >= 4) {
        businessValue = Math.min(10, businessValue + 1);
        notes.push('Product aligns with innovation priority');
      }

      if (item.type === 'service' && weights.customer >= 4) {
        businessValue = Math.min(10, businessValue + 1);
        notes.push('Service aligns with customer focus');
      }

      result.businessValue = Math.max(1, Math.min(10, Math.round(businessValue)));
    }
    // NOTE: If no strategicAlignment, businessValue also stays undefined
    // LLM evaluation will provide both values together

    // Industry-specific category inference
    if (!item.category && companyIdentity?.industry) {
      const industry = companyIdentity.industry.toLowerCase();

      if (industry.includes('tech') || industry.includes('software')) {
        if (item.type === 'product') {
          result.category = 'Software Platform';
          notes.push('Category inferred from tech industry context');
        } else {
          result.category = 'IT Services';
          notes.push('Category inferred from tech industry context');
        }
      } else if (industry.includes('finance') || industry.includes('bank')) {
        if (item.type === 'product') {
          result.category = 'Financial Platform';
        } else {
          result.category = 'Financial Services';
        }
        notes.push('Category inferred from finance industry context');
      } else if (industry.includes('health') || industry.includes('medical')) {
        if (item.type === 'product') {
          result.category = 'Healthcare Platform';
        } else {
          result.category = 'Healthcare Services';
        }
        notes.push('Category inferred from healthcare industry context');
      }
    }

    return {
      ...result,
      inferenceNotes: notes,
    };

  } catch (error) {
    console.warn('Strategic context enrichment failed:', error);
    return { inferenceNotes: [] };
  }
}

/**
 * LLM-based strategic fit evaluation for items without keyword match
 * Uses GPT-4o-mini for intelligent assessment of strategic alignment and business value
 */
async function evaluateStrategicFitWithLLM(
  items: Array<{
    name: string;
    description?: string;
    type: 'product' | 'service';
    category?: string;
  }>,
  strategicProfile: any
): Promise<Map<string, { strategicAlignment?: number; businessValue?: number; reasoning?: string }>> {
  const results = new Map<string, { strategicAlignment?: number; businessValue?: number; reasoning?: string }>();

  // Return empty results if no API key or no items
  if (!process.env.OPENAI_API_KEY || items.length === 0) {
    console.log('   ℹ️  LLM evaluation skipped: no API key or no items');
    return results;
  }

  try {
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 2000,
    });

    // Extract strategic context for the prompt
    const companyIdentity = strategicProfile?.company_identity || {};
    const strategicContext = strategicProfile?.strategic_context || {};
    const goals = strategicContext.goals_2025_2027 || [];

    const goalsDescription = goals.map((g: any) =>
      `- ${g.goal.replace(/_/g, ' ')}: ${g.description || 'No description'}`
    ).join('\n');

    const criteriaDescription = strategicContext.prioritization_criteria
      ? `ROI weight: ${strategicContext.prioritization_criteria.roi_weight}/5, ` +
        `Strategic alignment: ${strategicContext.prioritization_criteria.strategic_alignment_weight}/5, ` +
        `Innovation: ${strategicContext.prioritization_criteria.innovation_weight}/5`
      : 'No prioritization criteria defined';

    // Prepare items for batch evaluation
    const itemsDescription = items.map((item, idx) =>
      `${idx + 1}. "${item.name}" (${item.type})${item.description ? `: ${item.description.substring(0, 100)}` : ''}${item.category ? ` [${item.category}]` : ''}`
    ).join('\n');

    const prompt = `Sei un esperto di portfolio management. Valuta l'allineamento strategico e il valore business dei seguenti item rispetto al contesto aziendale.

CONTESTO AZIENDALE:
- Settore: ${companyIdentity.industry || 'Non specificato'}
- Modello business: ${companyIdentity.business_model || 'Non specificato'}
- Proposta di valore: ${companyIdentity.value_proposition || 'Non specificato'}

GOAL STRATEGICI:
${goalsDescription || 'Nessun goal definito'}

CRITERI DI PRIORITIZZAZIONE:
${criteriaDescription}

ITEM DA VALUTARE:
${itemsDescription}

Per ogni item, fornisci una valutazione considerando:
- Strategic Alignment (1-10): quanto l'item supporta i goal strategici aziendali
- Business Value (1-10): valore potenziale per il business (ROI, revenue, efficienza)

Rispondi SOLO con un JSON array, senza markdown:
[
  {"index": 1, "strategicAlignment": X, "businessValue": Y, "reasoning": "breve motivazione"},
  ...
]

Se non hai abbastanza informazioni per valutare, usa null per i valori.`;

    console.log(`   🤖 Calling LLM to evaluate ${items.length} items...`);

    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = typeof response.content === 'string' ? response.content : '';

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const evaluations = JSON.parse(jsonMatch[0]);

      for (const evaluation of evaluations) {
        const idx = evaluation.index - 1;
        if (idx >= 0 && idx < items.length) {
          const itemName = items[idx].name;
          results.set(itemName, {
            strategicAlignment: typeof evaluation.strategicAlignment === 'number' ?
              Math.max(1, Math.min(10, evaluation.strategicAlignment)) : undefined,
            businessValue: typeof evaluation.businessValue === 'number' ?
              Math.max(1, Math.min(10, evaluation.businessValue)) : undefined,
            reasoning: evaluation.reasoning,
          });
        }
      }

      console.log(`   ✅ LLM evaluated ${results.size}/${items.length} items`);
    }

  } catch (error) {
    console.warn('   ⚠️  LLM strategic evaluation failed:', error);
    // Return empty results - items will have undefined scores
  }

  return results;
}

/**
 * Calculate multi-level confidence breakdown for an item
 */
function calculateConfidenceBreakdown(
  item: Partial<NormalizedItem>,
  typeConfidence: number,
  ragContextLength: number,
  extractionSource: string
): NonNullable<NormalizedItem['confidence_breakdown']> {
  const fieldConfidences: Record<string, number> = {};
  const reasoning: string[] = [];

  // Field-level confidence scoring
  if (item.budget && item.budget > 0) {
    fieldConfidences.budget = 0.9;
    reasoning.push('Budget explicitly provided');
  }

  if (item.owner && item.owner.length > 2) {
    fieldConfidences.owner = 0.85;
  }

  if (item.category) {
    // Higher confidence if category came from RAG match
    fieldConfidences.category = ragContextLength > 500 ? 0.85 : 0.6;
  }

  if (item.description && item.description.length > 50) {
    fieldConfidences.description = 0.8;
    reasoning.push('Detailed description available');
  }

  if (item.status) {
    fieldConfidences.status = 0.75;
  }

  if (item.priority) {
    fieldConfidences.priority = 0.7;
  }

  if (item.technologies && item.technologies.length > 0) {
    fieldConfidences.technologies = 0.8;
    reasoning.push(`${item.technologies.length} technologies identified`);
  }

  // Quality indicators
  const quality_indicators = {
    // Source clarity: Excel/CSV rows are clearest, text is least clear
    source_clarity: extractionSource === 'excel_row' ? 0.95 :
                   extractionSource === 'pdf_table' ? 0.85 :
                   extractionSource === 'pdf_text' ? 0.7 : 0.6,

    // RAG match quality based on context length
    rag_match: ragContextLength > 1000 ? 0.9 :
               ragContextLength > 500 ? 0.75 :
               ragContextLength > 100 ? 0.6 : 0.4,

    // Schema fit based on schema inference presence
    schema_fit: item._schema_inference ? 0.9 : 0.7,
  };

  // Calculate overall confidence as weighted average
  const fieldCount = Object.keys(fieldConfidences).length;
  const avgFieldConfidence = fieldCount > 0
    ? Object.values(fieldConfidences).reduce((a, b) => a + b, 0) / fieldCount
    : 0.5;

  const overall = (
    typeConfidence * 0.35 +                    // Type classification (35%)
    avgFieldConfidence * 0.40 +                // Field completeness (40%)
    quality_indicators.source_clarity * 0.15 + // Source quality (15%)
    quality_indicators.rag_match * 0.10        // RAG context (10%)
  );

  // Add reasoning based on confidence level
  if (overall >= 0.9) {
    reasoning.push('High confidence - all key fields present with strong signals');
  } else if (overall >= 0.7) {
    reasoning.push('Good confidence - most fields identified correctly');
  } else if (overall >= 0.5) {
    reasoning.push('Medium confidence - some fields missing or uncertain');
  } else {
    reasoning.push('Low confidence - manual review recommended');
  }

  // Type-specific reasoning
  if (typeConfidence >= 0.8) {
    reasoning.push(`Strong ${item.type} indicators in text`);
  } else if (typeConfidence >= 0.6) {
    reasoning.push(`Moderate ${item.type} classification confidence`);
  } else {
    reasoning.push(`Weak ${item.type} signals - verify type`);
  }

  // Field completeness reasoning
  if (fieldCount >= 6) {
    reasoning.push('Rich metadata extracted');
  } else if (fieldCount >= 3) {
    reasoning.push('Basic metadata present');
  } else {
    reasoning.push('Limited metadata - consider enriching manually');
  }

  return {
    overall: Math.min(overall, 0.99), // Cap at 99% to indicate AI uncertainty
    type: typeConfidence,
    fields: fieldConfidences,
    reasoning,
    quality_indicators,
  };
}

/**
 * Main Normalizer Agent
 */
export async function normalizeItems(input: NormalizerInput): Promise<NormalizerOutput> {
  const startTime = Date.now();
  
  try {
    console.log(`🔄 Normalizing ${input.items.length} items...`);
    
    const normalizedItems: NormalizedItem[] = [];
    const notes: string[] = [];
    
    // Step 1: Get RAG context for all items (batch)
    const searchQuery = input.items
      .slice(0, 5)
      .map(i => i.name)
      .join(' ');
    
    let ragContext = '';
    try {
      const ragResults = await semanticSearch(
        '00000000-0000-0000-0000-000000000000', // System catalog
        searchQuery,
        {
          sourceTypes: [
            'catalog_it_services', 
            'catalog_portfolio_taxonomy', 
            'catalog_prioritization',
            'catalog_products',
            'catalog_industries',
            'catalog_entities',
            'catalog_examples',
          ] as SourceType[],
          limit: 8,
          similarityThreshold: 0.4, // Lower threshold for better coverage
        }
      );
      ragContext = ragResults.map(r => r.content).join('\n\n');
    } catch (e) {
      console.warn('RAG search failed, proceeding without catalog context');
      notes.push('RAG catalog search unavailable');
    }
    
    // Step 2: Normalize each item
    // Optimize by parallelizing expensive RAG lookups while keeping order
    const concurrency = 8; // Limit concurrent RAG calls to protect rate limits

    // Helper to perform concurrency-limited map
    async function mapWithConcurrency<T, R>(arr: T[], limit: number, fn: (t: T, idx: number) => Promise<R>): Promise<R[]> {
      const results: R[] = [] as any;
      let i = 0;
      const workers: Promise<void>[] = [];

      async function worker() {
        while (i < arr.length) {
          const idx = i++;
          try {
            results[idx] = await fn(arr[idx], idx);
          } catch (err) {
            results[idx] = undefined as any;
          }
        }
      }

      for (let w = 0; w < Math.min(limit, arr.length); w++) {
        workers.push(worker());
      }

      await Promise.all(workers);
      return results;
    }

    // First, detect type for each item (fast CPU-bound)
    const typeDetections = await Promise.all(input.items.map(item => detectType(item, ragContext)));

    // Perform RAG category lookups in batches to reduce number of semanticSearch calls
    const batchSize = 10; // tuneable: number of items per batch query
    const categories: any[] = new Array(input.items.length);

    for (let i = 0; i < input.items.length; i += batchSize) {
      const batch = input.items.slice(i, i + batchSize);
      const batchIdxStart = i;

      // Skip RAG lookup for items with strong type confidence
      const needLookup = batch.map((item, idx) => {
        const typeConf = (typeDetections[batchIdxStart + idx] || { confidence: 0 }).confidence;
        return typeConf < 0.6;
      });

      const itemsToQuery = batch.filter((_, idx) => needLookup[idx]);
      if (itemsToQuery.length === 0) {
        // nothing to query in this batch
        for (let j = 0; j < batch.length; j++) categories[batchIdxStart + j] = { tags: [] };
        continue;
      }

      const searchQuery = itemsToQuery.map(it => `${it.name} ${it.description || ''}`).join(' || ');

      try {
        let results = await semanticSearch(
          input.tenantId,
          searchQuery,
          {
            sourceTypes: [
              'catalog_it_services',
              'catalog_portfolio_taxonomy',
              'catalog_prioritization',
              'catalog_products',
              'catalog_industries',
              'catalog_entities',
              'catalog_examples',
            ] as SourceType[],
            limit: 8,
            similarityThreshold: 0.45,
          }
        );

        if (!results || results.length === 0) {
          results = await semanticSearch(
            '00000000-0000-0000-0000-000000000000',
            searchQuery,
            {
              sourceTypes: [
                'catalog_it_services',
                'catalog_portfolio_taxonomy',
                'catalog_prioritization',
                'catalog_products',
                'catalog_industries',
                'catalog_entities',
                'catalog_examples',
              ] as SourceType[],
              limit: 8,
              similarityThreshold: 0.45,
            }
          );
        }

        // Assign results to items in the batch. For simplicity, use same results for all queried items in the batch.
        for (let j = 0; j < batch.length; j++) {
          if (needLookup[j]) {
            categories[batchIdxStart + j] = results && results.length > 0
              ? extractCategoryFromRAGResults(results)
              : { tags: [] };
          } else {
            categories[batchIdxStart + j] = { tags: [] };
          }
        }

      } catch (err) {
        // on error, fallback per item
        for (let j = 0; j < batch.length; j++) categories[batchIdxStart + j] = { tags: [] };
      }
    }

    for (let idx = 0; idx < input.items.length; idx++) {
      const item = input.items[idx];
      try {
        const { type, confidence: typeConfidence } = typeDetections[idx];

        // Get category from pre-computed categories array
        const { category, subcategory, tags } = categories[idx] || { tags: [] };
        
        // Normalize status and priority (convert null to undefined)
        const status = normalizeStatus(nullToUndefined(item.rawStatus));
        const priority = normalizePriority(nullToUndefined(item.rawPriority));
        
        // Build normalized item (convert nulls to undefined)
        const normalized: NormalizedItem = {
          id: uuidv4(),
          name: item.name,
          description: nullToUndefined(item.description),
          type,
          status,
          priority,
          budget: nullToUndefined(item.budget),
          owner: nullToUndefined(item.owner),
          startDate: nullToUndefined(item.startDate),
          endDate: nullToUndefined(item.endDate),
          category,
          subcategory,
          technologies: nullToUndefined(item.technologies),
          tags: [...(tags || []), ...(item.technologies || [])],
          dependencies: nullToUndefined(item.dependencies),
          confidence: typeConfidence,
          normalizationNotes: [],
        };
        
        // Add risk level based on complexity indicators
        if (item.risks && item.risks.length > 2) {
          normalized.riskLevel = 'high';
        } else if (item.risks && item.risks.length > 0) {
          normalized.riskLevel = 'medium';
        } else {
          normalized.riskLevel = 'low';
        }
        
        // Add complexity based on budget
        if (normalized.budget) {
          if (normalized.budget > 500000) {
            normalized.complexity = 'high';
          } else if (normalized.budget > 100000) {
            normalized.complexity = 'medium';
          } else {
            normalized.complexity = 'low';
          }
        }

        // NEW: Calculate multi-level confidence breakdown
        const confidence_breakdown = calculateConfidenceBreakdown(
          normalized,
          typeConfidence,
          ragContext.length,
          'pdf_text' // Default, will be enhanced when we add document understanding
        );
        normalized.confidence_breakdown = confidence_breakdown;

        // Update overall confidence to match breakdown
        normalized.confidence = confidence_breakdown.overall;

        // NEW: Add extraction metadata for transparency
        normalized.extraction_metadata = {
          source_type: 'pdf_text', // Will be enhanced when we add document understanding
          original_text: `${item.name}${item.description ? ' - ' + item.description.substring(0, 100) : ''}`,
        };

        normalizedItems.push(normalized);
        
      } catch (error) {
        console.warn(`Failed to normalize item "${item.name}":`, error);
        notes.push(`Failed to normalize: ${item.name}`);
      }
    }

    // Step 3: SCHEMA INFERENCE - Enrich items with strategic profile context
    console.log(`\n🧠 Attempting to retrieve strategic profile for tenant: ${input.tenantId}`);
    let strategicProfile = null;
    let inferenceApplied = 0;

    try {
      strategicProfile = await getLatestStrategicProfile(input.tenantId);
    } catch (error) {
      console.warn('   ⚠️  Failed to retrieve strategic profile:', error);
    }

    if (strategicProfile) {
      console.log(`   ✅ Strategic profile found - Industry: ${strategicProfile.company_identity.industry}`);
      console.log(`   🎯 Applying schema inference to ${normalizedItems.length} items...\n`);

      for (const item of normalizedItems) {
        try {
          if (item.type === 'product') {
            // Infer product schema
            const inference = inferProductSchema(strategicProfile, {
              name: item.name,
              description: item.description || '',
              category: item.category,
              // Preserve any existing fields
              pricing_model: item.pricing_model,
              lifecycle_stage: item.lifecycle_stage,
              target_segment: item.target_segment,
              sales_cycle_length: item.sales_cycle_length,
              delivery_model: item.delivery_model,
              tipo_offerta: item.tipo_offerta,
              distribution_channel: item.distribution_channel,
              strategic_importance: item.strategic_importance,
            } as any);

            // Apply inferred fields (will not overwrite existing values)
            const enriched = applyProductInference(item as any, inference);

            // Merge enriched fields back into item
            Object.assign(item, enriched);

            // Add inference metadata
            if (inference.inferred_fields.length > 0) {
              (item as any)._schema_inference = {
                fields_inferred: inference.inferred_fields,
                confidence: inference.confidence_score,
                reasoning: inference.inference_reasoning,
              };
              inferenceApplied++;
              console.log(`   ✓ Product "${item.name}": inferred ${inference.inferred_fields.length} fields`);
            }

          } else if (item.type === 'service') {
            // Infer service schema
            const inference = inferServiceSchema(strategicProfile, {
              name: item.name,
              description: item.description || '',
              category: item.category,
              // Preserve any existing fields
              target_segment: item.target_segment,
              sales_cycle_length: item.sales_cycle_length,
              delivery_model: item.delivery_model,
              tipo_servizio: item.tipo_servizio,
            } as any);

            // Apply inferred fields
            const enriched = applyServiceInference(item as any, inference);

            // Merge enriched fields back into item
            Object.assign(item, enriched);

            // Add inference metadata
            if (inference.inferred_fields.length > 0) {
              (item as any)._schema_inference = {
                fields_inferred: inference.inferred_fields,
                confidence: inference.confidence_score,
                reasoning: inference.inference_reasoning,
              };
              inferenceApplied++;
              console.log(`   ✓ Service "${item.name}": inferred ${inference.inferred_fields.length} fields`);
            }
          }

          // NEW: Apply strategic context enrichment (Phase 2.1)
          const strategicEnrichment = await enrichWithStrategicContext(item, strategicProfile);

          // Apply strategic alignment and business value
          if (strategicEnrichment.strategicAlignment) {
            item.strategicAlignment = strategicEnrichment.strategicAlignment;
          }
          if (strategicEnrichment.businessValue) {
            item.businessValue = strategicEnrichment.businessValue;
          }
          if (strategicEnrichment.strategic_importance) {
            item.strategic_importance = strategicEnrichment.strategic_importance;
          }
          if (!item.category && strategicEnrichment.category) {
            (item as any).category = strategicEnrichment.category;
          }

          // Add strategic inference notes to normalization notes
          if (strategicEnrichment.inferenceNotes.length > 0) {
            item.normalizationNotes = [
              ...(item.normalizationNotes || []),
              ...strategicEnrichment.inferenceNotes,
            ];
          }

        } catch (inferenceError) {
          console.warn(`   ⚠️  Schema inference failed for "${item.name}":`, inferenceError);
        }
      }

      console.log(`\n   ✅ Schema inference applied to ${inferenceApplied}/${normalizedItems.length} items`);

      // Step 3b: LLM EVALUATION - For items without strategic scores after keyword matching
      const itemsWithoutScores = normalizedItems.filter(
        item => item.strategicAlignment === undefined || item.businessValue === undefined
      );

      if (itemsWithoutScores.length > 0) {
        console.log(`\n🤖 LLM Strategic Evaluation for ${itemsWithoutScores.length} items without scores...`);

        const llmEvaluations = await evaluateStrategicFitWithLLM(
          itemsWithoutScores.map(item => ({
            name: item.name,
            description: item.description,
            type: item.type,
            category: item.category,
          })),
          strategicProfile
        );

        // Apply LLM evaluations to items
        let llmScoresApplied = 0;
        for (const item of normalizedItems) {
          if (item.strategicAlignment === undefined || item.businessValue === undefined) {
            const evaluation = llmEvaluations.get(item.name);
            if (evaluation) {
              if (evaluation.strategicAlignment !== undefined && item.strategicAlignment === undefined) {
                item.strategicAlignment = evaluation.strategicAlignment;
              }
              if (evaluation.businessValue !== undefined && item.businessValue === undefined) {
                item.businessValue = evaluation.businessValue;
              }
              if (evaluation.reasoning) {
                item.normalizationNotes = [
                  ...(item.normalizationNotes || []),
                  `LLM evaluation: ${evaluation.reasoning}`,
                ];
              }
              llmScoresApplied++;
            }
          }
        }

        console.log(`   ✅ LLM scores applied to ${llmScoresApplied}/${itemsWithoutScores.length} items`);
      }
    } else {
      console.log(`   ℹ️  No strategic profile available - skipping schema inference`);
    }

    // Step 4: PRODUCT KNOWLEDGE LAYER - Enrich with external knowledge sources
    console.log('\n📚 Enriching items with Product Knowledge Layer...');
    let knowledgeEnriched = 0;

    try {
      const orchestrator = getProductKnowledgeOrchestrator();

      // Get industry context from strategic profile
      const industryContext = strategicProfile?.company_identity?.industry;

      // Enrich all normalized items
      const enrichmentResult = await orchestrator.enrichItems(
        normalizedItems.map(item => ({
          name: item.name,
          description: item.description,
          type: item.type,
          vendor: (item as any).vendor,
          category: item.category,
          gtin: (item as any).gtin,
          ean: (item as any).ean,
          mpn: (item as any).mpn
        })),
        {
          enableCompanyCatalog: true,
          enableIcecat: true,
          enableGS1: true,
          industryContext,
          minConfidenceThreshold: 0.6
        }
      );

      // Merge enrichments back into normalized items
      for (let i = 0; i < normalizedItems.length; i++) {
        const enriched = enrichmentResult.items[i];
        if (!enriched) continue;

        // Apply enriched fields (don't overwrite user-provided values)
        if (!normalizedItems[i].vendor && enriched.vendor) {
          (normalizedItems[i] as any).vendor = enriched.vendor;
        }
        if (!normalizedItems[i].category && enriched.category) {
          normalizedItems[i].category = enriched.category as string;
        }
        if (!normalizedItems[i].subcategory && enriched.subcategory) {
          normalizedItems[i].subcategory = enriched.subcategory as string;
        }
        if (!(normalizedItems[i] as any).gtin && enriched.gtin) {
          (normalizedItems[i] as any).gtin = enriched.gtin;
        }
        if (!(normalizedItems[i] as any).ean && enriched.ean) {
          (normalizedItems[i] as any).ean = enriched.ean;
        }

        // Apply GS1 classification
        if (enriched.gs1_classification) {
          (normalizedItems[i] as any).gs1_classification = enriched.gs1_classification;
        }

        // Store enrichment metadata
        if (enriched._enrichment && enriched._enrichment.length > 0) {
          (normalizedItems[i] as any)._product_knowledge_enrichment = enriched._enrichment.map(e => ({
            source: e.source,
            confidence: e.confidence,
            fields_enriched: e.fields_enriched,
            reasoning: e.reasoning
          }));
          knowledgeEnriched++;

          // Add enrichment notes to normalization notes
          for (const e of enriched._enrichment) {
            normalizedItems[i].normalizationNotes = [
              ...(normalizedItems[i].normalizationNotes || []),
              ...e.reasoning
            ];
          }
        }

        // Update confidence with enrichment data
        if (enriched._confidence_overall > normalizedItems[i].confidence) {
          normalizedItems[i].confidence = Math.min(enriched._confidence_overall, 0.99);
        }
      }

      console.log(`   ✅ Knowledge enrichment: ${knowledgeEnriched}/${normalizedItems.length} items enriched`);
      console.log(`   📊 Sources used: Catalog=${enrichmentResult.stats.bySource.company_catalog}, Icecat=${enrichmentResult.stats.bySource.icecat}, GS1=${enrichmentResult.stats.bySource.gs1_taxonomy}`);

    } catch (knowledgeError) {
      console.warn(`   ⚠️  Product Knowledge Layer enrichment failed:`, knowledgeError);
    }

    // Step 5: CONTINUOUS LEARNING - Apply learned transformation rules
    console.log('\n🎓 Applying learned transformation rules...');
    let learningApplied = 0;

    try {
      const learningService = new LearningService();
      const { items: transformedItems, rulesApplied, transformations } = await learningService.applyLearnedRules(
        input.tenantId,
        normalizedItems
      );

      if (rulesApplied > 0) {
        learningApplied = rulesApplied;
        console.log(`   ✅ Applied ${rulesApplied} learned transformations:`);
        for (const t of transformations.slice(0, 5)) {
          console.log(`      - ${t}`);
        }
        if (transformations.length > 5) {
          console.log(`      ... and ${transformations.length - 5} more`);
        }
      } else {
        console.log(`   ℹ️  No applicable learned rules found`);
      }
    } catch (learningError) {
      console.warn(`   ⚠️  Continuous learning failed:`, learningError);
      // Continue without learning - extraction should still work
    }

    // Step 6: Calculate stats
    const stats = {
      totalInput: input.items.length,
      totalNormalized: normalizedItems.length,
      byType: {
        products: normalizedItems.filter(i => i.type === 'product').length,
        services: normalizedItems.filter(i => i.type === 'service').length,
      },
      avgConfidence: normalizedItems.length > 0
        ? normalizedItems.reduce((sum, i) => sum + i.confidence, 0) / normalizedItems.length
        : 0,
    };

    console.log(`\n✅ Normalized ${stats.totalNormalized}/${stats.totalInput} items`);
    console.log(`   Types: ${stats.byType.products} products, ${stats.byType.services} services`);
    console.log(`   Avg confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`);
    if (inferenceApplied > 0) {
      console.log(`   Schema inference: ${inferenceApplied} items enriched`);
    }
    if (knowledgeEnriched > 0) {
      console.log(`   Knowledge enrichment: ${knowledgeEnriched} items enriched`);
    }
    if (learningApplied > 0) {
      console.log(`   🎓 Learned rules applied: ${learningApplied} transformations`);
    }

    return {
      success: normalizedItems.length > 0,
      items: normalizedItems,
      stats,
      processingTime: Date.now() - startTime,
    };

  } catch (error) {
    console.error('❌ Normalizer error:', error);
    return {
      success: false,
      items: [],
      stats: {
        totalInput: input.items.length,
        totalNormalized: 0,
        byType: { products: 0, services: 0 },
        avgConfidence: 0,
      },
      processingTime: Date.now() - startTime,
    };
  }
}

export default { normalizeItems };
