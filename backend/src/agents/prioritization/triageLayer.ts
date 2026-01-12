/**
 * Triage Layer - MoSCoW Classification
 *
 * Classificazione rapida degli items del portfolio in categorie MoSCoW:
 * - MUST: Critico, non negoziabile (compliance, infrastruttura critica, security)
 * - SHOULD: Importante, alto valore strategico
 * - COULD: Desiderabile se risorse disponibili
 * - WONT: Da rimandare o eliminare (EOL, duplicati, basso utilizzo)
 * - UNKNOWN: Richiede analisi dettagliata
 */

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import type {
  PortfolioItemInput,
  StrategicProfile,
  TriageConfig,
  TriageLayerResult,
  TriageRule,
  RuleCondition,
} from './types';
import type { TriageResult, TriageCategory } from '../schemas/prioritizationSchema';

// === DEFAULT CONFIGURATION ===

export const DEFAULT_TRIAGE_CONFIG: TriageConfig = {
  enabled: true,
  confidenceThreshold: 0.7,
  useAI: true,
  customRules: [],
};

// === BUILT-IN TRIAGE RULES ===

/**
 * Regole predefinite per classificazione MoSCoW
 * Ordinate per priorità (le prime hanno precedenza)
 */
export const BUILTIN_TRIAGE_RULES: TriageRule[] = [
  // === MUST RULES ===
  {
    name: 'compliance_requirement',
    conditions: [
      { field: 'tags', operator: 'includes', value: 'compliance' },
    ],
    resultCategory: 'MUST',
    confidence: 0.95,
    reasoning: 'Requisito di compliance/regulatory - obbligatorio',
  },
  {
    name: 'security_critical',
    conditions: [
      { field: 'tags', operator: 'includes', value: 'security' },
      { field: 'riskLevel', operator: 'eq', value: 'critical' },
    ],
    resultCategory: 'MUST',
    confidence: 0.9,
    reasoning: 'Sistema security-critical con rischio elevato',
  },
  {
    name: 'critical_infrastructure',
    conditions: [
      { field: 'category', operator: 'contains', value: 'infrastructure' },
      { field: 'riskLevel', operator: 'eq', value: 'critical' },
    ],
    resultCategory: 'MUST',
    confidence: 0.9,
    reasoning: 'Infrastruttura critica per operatività',
  },
  {
    name: 'strategic_high_value',
    conditions: [
      { field: 'strategicAlignment', operator: 'gte', value: 8 },
      { field: 'businessValue', operator: 'gte', value: 8 },
    ],
    resultCategory: 'MUST',
    confidence: 0.85,
    reasoning: 'Alto allineamento strategico e valore di business',
  },

  // === WONT RULES ===
  {
    name: 'end_of_life',
    conditions: [
      { field: 'lifecycle', operator: 'eq', value: 'end_of_life' },
    ],
    resultCategory: 'WONT',
    confidence: 0.85,
    reasoning: 'Prodotto/servizio in end-of-life',
  },
  {
    name: 'deprecated',
    conditions: [
      { field: 'lifecycle', operator: 'eq', value: 'deprecated' },
    ],
    resultCategory: 'WONT',
    confidence: 0.8,
    reasoning: 'Sistema deprecato',
  },
  {
    name: 'no_active_users',
    conditions: [
      { field: 'activeUsers', operator: 'eq', value: 0 },
    ],
    resultCategory: 'WONT',
    confidence: 0.75,
    reasoning: 'Nessun utente attivo',
  },
  {
    name: 'duplicate_flagged',
    conditions: [
      { field: 'tags', operator: 'includes', value: 'duplicate' },
    ],
    resultCategory: 'WONT',
    confidence: 0.8,
    reasoning: 'Duplicato di funzionalità esistente',
  },
  {
    name: 'outdated',
    conditions: [
      { field: 'status', operator: 'eq', value: 'outdated' },
    ],
    resultCategory: 'WONT',
    confidence: 0.7,
    reasoning: 'Sistema obsoleto senza aggiornamenti recenti',
  },

  // === SHOULD RULES ===
  {
    name: 'high_strategic_alignment',
    conditions: [
      { field: 'strategicAlignment', operator: 'gte', value: 7 },
    ],
    resultCategory: 'SHOULD',
    confidence: 0.75,
    reasoning: 'Alto allineamento con obiettivi strategici',
  },
  {
    name: 'high_business_value',
    conditions: [
      { field: 'businessValue', operator: 'gte', value: 7 },
    ],
    resultCategory: 'SHOULD',
    confidence: 0.75,
    reasoning: 'Alto valore di business',
  },
  {
    name: 'customer_facing_active',
    conditions: [
      { field: 'category', operator: 'contains', value: 'customer' },
      { field: 'activeUsers', operator: 'gte', value: 100 },
    ],
    resultCategory: 'SHOULD',
    confidence: 0.7,
    reasoning: 'Sistema customer-facing con alto utilizzo',
  },

  // === COULD RULES ===
  {
    name: 'medium_value',
    conditions: [
      { field: 'businessValue', operator: 'gte', value: 4 },
      { field: 'businessValue', operator: 'lt', value: 7 },
    ],
    resultCategory: 'COULD',
    confidence: 0.6,
    reasoning: 'Valore di business medio',
  },
  {
    name: 'technical_debt_reduction',
    conditions: [
      { field: 'tags', operator: 'includes', value: 'tech-debt' },
    ],
    resultCategory: 'COULD',
    confidence: 0.6,
    reasoning: 'Riduzione debito tecnico - desiderabile ma non critico',
  },
];

// === RULE EVALUATION ===

/**
 * Valuta se una condizione è soddisfatta
 */
function evaluateCondition(
  item: PortfolioItemInput,
  condition: RuleCondition
): boolean {
  const value = (item as unknown as Record<string, unknown>)[condition.field];

  switch (condition.operator) {
    case 'eq':
      return value === condition.value;

    case 'ne':
      return value !== condition.value;

    case 'gt':
      return typeof value === 'number' && value > (condition.value as number);

    case 'lt':
      return typeof value === 'number' && value < (condition.value as number);

    case 'gte':
      return typeof value === 'number' && value >= (condition.value as number);

    case 'lte':
      return typeof value === 'number' && value <= (condition.value as number);

    case 'contains':
      if (typeof value === 'string') {
        return value.toLowerCase().includes((condition.value as string).toLowerCase());
      }
      return false;

    case 'startsWith':
      if (typeof value === 'string') {
        return value.toLowerCase().startsWith((condition.value as string).toLowerCase());
      }
      return false;

    case 'includes':
      if (Array.isArray(value)) {
        return value.some(v =>
          typeof v === 'string' &&
          v.toLowerCase().includes((condition.value as string).toLowerCase())
        );
      }
      return false;

    default:
      return false;
  }
}

/**
 * Valuta tutte le condizioni di una regola (AND logic)
 */
function evaluateRule(item: PortfolioItemInput, rule: TriageRule): boolean {
  return rule.conditions.every(condition => evaluateCondition(item, condition));
}

/**
 * Applica le regole rule-based a un item
 */
function applyRulesTriaging(
  item: PortfolioItemInput,
  rules: TriageRule[]
): TriageResult | null {
  for (const rule of rules) {
    if (evaluateRule(item, rule)) {
      return {
        itemId: item.id,
        itemName: item.name,
        category: rule.resultCategory as TriageCategory,
        confidence: rule.confidence,
        reasoning: rule.reasoning,
        keySignals: [rule.name],
      };
    }
  }
  return null;
}

// === AI TRIAGE ===

const TRIAGE_PROMPT_TEMPLATE = `You are an IT Portfolio Triage Expert. Classify the following portfolio items into MoSCoW categories.

## Context
Company Industry: {industry}
Strategic Goals: {goals}
Budget Level: {budgetLevel}
Company Size: {companySize}

## Classification Rules

### MUST (Critical - non-negotiable)
- Compliance/regulatory requirements (GDPR, SOX, PCI-DSS, etc.)
- Critical infrastructure dependencies
- Security-critical systems
- Items explicitly marked as strategic priorities
- Systems with critical risk level

### SHOULD (Important - high value)
- Strong strategic alignment (score >=7/10)
- High business value (score >=7/10)
- Customer-facing systems with high usage
- Innovation enablers aligned with goals

### COULD (Nice to have - if resources allow)
- Medium strategic alignment (4-6/10)
- Operational improvements
- Technical debt reduction
- Quality-of-life enhancements

### WONT (Not now - defer or eliminate)
- End-of-life products
- Duplicates of existing capabilities
- Low usage (<5% of target users)
- Misaligned with current strategy
- Outdated (no updates in 2+ years)
- Deprecated systems

## Items to Classify
{items}

## Output Format
Return ONLY a valid JSON array with no additional text. Each object must have:
- itemId: string (exact ID from input)
- category: "MUST" | "SHOULD" | "COULD" | "WONT" | "UNKNOWN"
- confidence: number between 0 and 1
- reasoning: brief explanation (max 100 chars)
- keySignals: array of 1-3 key factors

Example:
[
  {{"itemId": "abc-123", "category": "MUST", "confidence": 0.9, "reasoning": "GDPR compliance requirement", "keySignals": ["compliance", "regulatory"]}}
]`;

/**
 * Esegue triage tramite AI per items che non hanno match rule-based
 */
async function aiTriageItems(
  items: PortfolioItemInput[],
  context: StrategicProfile
): Promise<TriageResult[]> {
  if (items.length === 0) return [];

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[TriageLayer] OPENAI_API_KEY not set, skipping AI triage');
    return items.map(item => ({
      itemId: item.id,
      itemName: item.name,
      category: 'UNKNOWN' as TriageCategory,
      confidence: 0.3,
      reasoning: 'AI non disponibile, richiede analisi manuale',
      keySignals: [],
    }));
  }

  try {
    const model = new ChatOpenAI({
      modelName: 'gpt-4o-mini', // Faster model for triage
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 4096,
    });

    const prompt = new PromptTemplate({
      template: TRIAGE_PROMPT_TEMPLATE,
      inputVariables: ['industry', 'goals', 'budgetLevel', 'companySize', 'items'],
    });

    const formattedPrompt = await prompt.format({
      industry: context.industry || 'Technology',
      goals: context.goals?.join(', ') || 'Digital transformation, cost optimization',
      budgetLevel: context.budgetLevel || 'moderate',
      companySize: context.companySize || 'medium',
      items: JSON.stringify(items.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        description: i.description,
        category: i.category,
        tags: i.tags,
        businessValue: i.businessValue,
        riskLevel: i.riskLevel,
        strategicAlignment: i.strategicAlignment,
        lifecycle: i.lifecycle,
        activeUsers: i.activeUsers,
        status: i.status,
      })), null, 2),
    });

    const response = await model.invoke(formattedPrompt);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Extract JSON from response
    let jsonContent = content.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1].trim();
    }

    // Find JSON array
    const firstBracket = jsonContent.indexOf('[');
    const lastBracket = jsonContent.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1) {
      throw new Error('No valid JSON array in response');
    }

    jsonContent = jsonContent.substring(firstBracket, lastBracket + 1);
    const parsed = JSON.parse(jsonContent) as Array<{
      itemId: string;
      category: string;
      confidence: number;
      reasoning: string;
      keySignals?: string[];
    }>;

    // Validate and normalize
    return parsed.map(r => {
      const item = items.find(i => i.id === r.itemId);
      const validCategories = ['MUST', 'SHOULD', 'COULD', 'WONT', 'UNKNOWN'];
      const category = validCategories.includes(r.category?.toUpperCase())
        ? r.category.toUpperCase() as TriageCategory
        : 'UNKNOWN';

      return {
        itemId: r.itemId,
        itemName: item?.name || 'Unknown',
        category,
        confidence: Math.max(0, Math.min(1, r.confidence || 0.5)),
        reasoning: r.reasoning || 'Classificazione AI',
        keySignals: r.keySignals || [],
      };
    });
  } catch (error) {
    console.error('[TriageLayer] AI triage error:', error);

    // Fallback: mark all as UNKNOWN
    return items.map(item => ({
      itemId: item.id,
      itemName: item.name,
      category: 'UNKNOWN' as TriageCategory,
      confidence: 0.3,
      reasoning: 'Errore AI, richiede analisi manuale',
      keySignals: [],
    }));
  }
}

// === MAIN TRIAGE FUNCTION ===

/**
 * Esegue il triage MoSCoW sugli items del portfolio
 *
 * @param items - Items da classificare
 * @param context - Profilo strategico dell'azienda
 * @param config - Configurazione triage
 * @returns Risultato del triage con breakdown e statistiche
 */
export async function triageItems(
  items: PortfolioItemInput[],
  context: StrategicProfile = {},
  config: Partial<TriageConfig> = {}
): Promise<TriageLayerResult> {
  const startTime = Date.now();
  const mergedConfig: TriageConfig = { ...DEFAULT_TRIAGE_CONFIG, ...config };

  if (!mergedConfig.enabled || items.length === 0) {
    return {
      results: [],
      breakdown: { MUST: 0, SHOULD: 0, COULD: 0, WONT: 0, UNKNOWN: 0 },
      averageConfidence: 0,
      rulesApplied: 0,
      aiUsed: false,
      processingTimeMs: 0,
    };
  }

  console.log(`[TriageLayer] Starting triage for ${items.length} items`);

  // Combina regole built-in con custom rules
  const allRules = [...BUILTIN_TRIAGE_RULES, ...(mergedConfig.customRules || [])];

  const results: TriageResult[] = [];
  const itemsNeedingAI: PortfolioItemInput[] = [];
  let rulesApplied = 0;

  // Prima passa: rule-based triage
  for (const item of items) {
    const ruleResult = applyRulesTriaging(item, allRules);

    if (ruleResult && ruleResult.confidence >= mergedConfig.confidenceThreshold) {
      results.push(ruleResult);
      rulesApplied++;
    } else {
      itemsNeedingAI.push(item);
    }
  }

  console.log(`[TriageLayer] Rule-based: ${rulesApplied} items classified, ${itemsNeedingAI.length} need AI`);

  // Seconda passa: AI triage per items rimanenti
  let aiUsed = false;
  if (mergedConfig.useAI && itemsNeedingAI.length > 0) {
    aiUsed = true;
    const aiResults = await aiTriageItems(itemsNeedingAI, context);
    results.push(...aiResults);
  } else if (itemsNeedingAI.length > 0) {
    // Fallback senza AI: classifica come UNKNOWN
    for (const item of itemsNeedingAI) {
      results.push({
        itemId: item.id,
        itemName: item.name,
        category: 'UNKNOWN',
        confidence: 0.3,
        reasoning: 'Nessuna regola applicabile, richiede analisi manuale',
        keySignals: [],
      });
    }
  }

  // Calcola breakdown
  const breakdown = {
    MUST: 0,
    SHOULD: 0,
    COULD: 0,
    WONT: 0,
    UNKNOWN: 0,
  };

  for (const result of results) {
    breakdown[result.category]++;
  }

  // Calcola confidence media
  const averageConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    : 0;

  const processingTimeMs = Date.now() - startTime;

  console.log(`[TriageLayer] Completed in ${processingTimeMs}ms. Breakdown: MUST=${breakdown.MUST}, SHOULD=${breakdown.SHOULD}, COULD=${breakdown.COULD}, WONT=${breakdown.WONT}, UNKNOWN=${breakdown.UNKNOWN}`);

  return {
    results,
    breakdown,
    averageConfidence,
    rulesApplied,
    aiUsed,
    processingTimeMs,
  };
}

/**
 * Triage singolo item (per uso in UI o API)
 */
export async function triageSingleItem(
  item: PortfolioItemInput,
  context: StrategicProfile = {},
  config: Partial<TriageConfig> = {}
): Promise<TriageResult> {
  const result = await triageItems([item], context, config);
  return result.results[0] || {
    itemId: item.id,
    itemName: item.name,
    category: 'UNKNOWN',
    confidence: 0,
    reasoning: 'Triage non riuscito',
    keySignals: [],
  };
}

export default { triageItems, triageSingleItem };
