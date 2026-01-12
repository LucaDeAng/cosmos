/**
 * Expert Knowledge Loader
 * 
 * Retrieves relevant consulting frameworks, methodologies, benchmarks,
 * and best practices from the knowledge base to enhance agent responses
 * with expert-level insights.
 */

import { semanticSearch, SourceType, SearchResult } from './embeddingService';

// Types for expert knowledge
export type ExpertKnowledgeCategory = 
  | 'framework'
  | 'methodology' 
  | 'benchmark'
  | 'best_practice';

export interface ExpertKnowledgeContext {
  frameworks: SearchResult[];
  methodologies: SearchResult[];
  benchmarks: SearchResult[];
  bestPractices: SearchResult[];
  formattedContext: string;
  totalResults: number;
}

export interface ExpertKnowledgeOptions {
  categories?: ExpertKnowledgeCategory[];
  limit?: number;
  similarityThreshold?: number;
  includeMetadata?: boolean;
}

// Agent task type mapping to relevant knowledge categories
const AGENT_KNOWLEDGE_MAP: Record<string, ExpertKnowledgeCategory[]> = {
  'strategy-advisor': ['framework', 'methodology', 'best_practice'],
  'budget-optimizer': ['benchmark', 'methodology', 'framework'],
  'roadmap-generator': ['methodology', 'framework', 'best_practice'],
  'portfolio-analyzer': ['framework', 'benchmark', 'methodology'],
  'document-analyzer': ['framework', 'best_practice'],
  'knowledge-qa': ['framework', 'methodology', 'benchmark', 'best_practice'],
  'orchestrator': ['framework', 'methodology'],
};

// Query enhancement patterns for better semantic matching
const QUERY_ENHANCEMENTS: Record<ExpertKnowledgeCategory, string[]> = {
  framework: [
    'consulting framework',
    'strategic model',
    'analysis framework',
    'McKinsey',
    'BCG',
    'Gartner',
  ],
  methodology: [
    'methodology',
    'prioritization',
    'scoring model',
    'WSJF',
    'SAFe',
    'agile',
  ],
  benchmark: [
    'industry benchmark',
    'KPI',
    'spending ratio',
    'budget allocation',
    'best-in-class',
  ],
  best_practice: [
    'best practice',
    'success factor',
    'implementation pattern',
    'digital transformation',
    'change management',
  ],
};

/**
 * Load expert knowledge relevant to a specific query and agent task
 */
import { normalizeTenantId } from '../../utils/tenant';

export async function loadExpertKnowledge(
  companyId: string,
  query: string,
  agentType?: string,
  options: ExpertKnowledgeOptions = {}
): Promise<ExpertKnowledgeContext> {
  const {
    categories = agentType 
      ? AGENT_KNOWLEDGE_MAP[agentType] || ['framework', 'methodology']
      : ['framework', 'methodology', 'benchmark', 'best_practice'],
    limit = 3,
    similarityThreshold = 0.65,
    includeMetadata = true,
  } = options;

  const context: ExpertKnowledgeContext = {
    frameworks: [],
    methodologies: [],
    benchmarks: [],
    bestPractices: [],
    formattedContext: '',
    totalResults: 0,
  };

  const safeCompanyId = normalizeTenantId(companyId);
  if (safeCompanyId !== companyId) console.warn(`[ExpertKnowledgeLoader] Invalid companyId: "${companyId}" - using system catalog fallback`);

  // Search each category in parallel
  const searchPromises = categories.map(async (category) => {
    const enhancedQuery = enhanceQueryForCategory(query, category);
    const sourceType = category as SourceType;
    
    try {
      const results = await semanticSearch(safeCompanyId, enhancedQuery, {
        sourceTypes: [sourceType],
        limit,
        similarityThreshold,
      });
      
      return { category, results };
    } catch (error) {
      console.error(`[ExpertKnowledgeLoader] Error searching ${category}:`, error);
      return { category, results: [] };
    }
  });

  const searchResults = await Promise.all(searchPromises);

  // Organize results by category
  for (const { category, results } of searchResults) {
    switch (category) {
      case 'framework':
        context.frameworks = results;
        break;
      case 'methodology':
        context.methodologies = results;
        break;
      case 'benchmark':
        context.benchmarks = results;
        break;
      case 'best_practice':
        context.bestPractices = results;
        break;
    }
    context.totalResults += results.length;
  }

  // Format the context for injection into prompts
  context.formattedContext = formatExpertKnowledgeContext(context, includeMetadata);

  return context;
}

/**
 * Enhance query with category-specific terms for better matching
 */
function enhanceQueryForCategory(query: string, category: ExpertKnowledgeCategory): string {
  const enhancements = QUERY_ENHANCEMENTS[category] || [];
  
  // Add 1-2 relevant enhancement terms
  const selectedEnhancements = enhancements
    .filter(e => !query.toLowerCase().includes(e.toLowerCase()))
    .slice(0, 2);
  
  if (selectedEnhancements.length > 0) {
    return `${query} ${selectedEnhancements.join(' ')}`;
  }
  
  return query;
}

/**
 * Format expert knowledge for prompt injection
 */
function formatExpertKnowledgeContext(
  context: ExpertKnowledgeContext,
  includeMetadata: boolean
): string {
  const sections: string[] = [];

  // Format frameworks
  if (context.frameworks.length > 0) {
    sections.push(formatSection(
      '📊 CONSULTING FRAMEWORKS',
      context.frameworks,
      includeMetadata,
      'Use these strategic frameworks to structure your analysis:'
    ));
  }

  // Format methodologies
  if (context.methodologies.length > 0) {
    sections.push(formatSection(
      '🎯 METHODOLOGIES',
      context.methodologies,
      includeMetadata,
      'Apply these methodologies for prioritization and decision-making:'
    ));
  }

  // Format benchmarks
  if (context.benchmarks.length > 0) {
    sections.push(formatSection(
      '📈 INDUSTRY BENCHMARKS',
      context.benchmarks,
      includeMetadata,
      'Reference these benchmarks for data-driven recommendations:'
    ));
  }

  // Format best practices
  if (context.bestPractices.length > 0) {
    sections.push(formatSection(
      '✅ BEST PRACTICES',
      context.bestPractices,
      includeMetadata,
      'Consider these proven best practices:'
    ));
  }

  if (sections.length === 0) {
    return '';
  }

  return `
═══════════════════════════════════════════════════════════════
EXPERT KNOWLEDGE BASE
═══════════════════════════════════════════════════════════════

${sections.join('\n\n')}

───────────────────────────────────────────────────────────────
NOTE: Apply these frameworks and insights contextually. Adapt 
recommendations to the specific organizational context.
───────────────────────────────────────────────────────────────
`;
}

/**
 * Format a section of expert knowledge
 */
function formatSection(
  title: string,
  results: SearchResult[],
  includeMetadata: boolean,
  description: string
): string {
  const items = results.map((result, index) => {
    const metaInfo = includeMetadata && result.metadata?.title
      ? `[${result.metadata.title}] `
      : '';
    const confidence = Math.round(result.similarity * 100);
    
    return `${index + 1}. ${metaInfo}(${confidence}% relevance)
${result.content.slice(0, 1500)}${result.content.length > 1500 ? '...' : ''}`;
  });

  return `${title}
${description}

${items.join('\n\n')}`;
}

/**
 * Load specific framework by name
 */
export async function loadFrameworkByName(
  companyId: string,
  frameworkName: string
): Promise<SearchResult | null> {
  const results = await semanticSearch(companyId, frameworkName, {
    sourceTypes: ['framework'],
    limit: 1,
    similarityThreshold: 0.7,
  });

  return results.length > 0 ? results[0] : null;
}

/**
 * Load benchmarks for specific industry/sector
 */
export async function loadIndustryBenchmarks(
  companyId: string,
  industry: string
): Promise<SearchResult[]> {
  const query = `${industry} IT budget spending benchmark allocation KPI`;
  
  return semanticSearch(companyId, query, {
    sourceTypes: ['benchmark'],
    limit: 5,
    similarityThreshold: 0.6,
  });
}

/**
 * Load prioritization methodology
 */
export async function loadPrioritizationMethodology(
  companyId: string,
  methodologyType: string = 'WSJF'
): Promise<SearchResult[]> {
  const query = `${methodologyType} prioritization scoring methodology`;
  
  return semanticSearch(companyId, query, {
    sourceTypes: ['methodology'],
    limit: 3,
    similarityThreshold: 0.65,
  });
}

/**
 * Load digital transformation best practices
 */
export async function loadTransformationBestPractices(
  companyId: string,
  transformationType?: string
): Promise<SearchResult[]> {
  const query = transformationType 
    ? `${transformationType} digital transformation best practice success factor`
    : 'digital transformation best practice implementation success';
  
  return semanticSearch(companyId, query, {
    sourceTypes: ['best_practice'],
    limit: 5,
    similarityThreshold: 0.6,
  });
}

/**
 * Get relevant frameworks for portfolio analysis
 */
export async function loadPortfolioFrameworks(
  companyId: string
): Promise<SearchResult[]> {
  const queries = [
    'BCG growth share matrix portfolio classification',
    'Gartner pace layered application strategy',
    'McKinsey three horizons innovation portfolio',
  ];

  const results = await Promise.all(
    queries.map(q => semanticSearch(companyId, q, {
      sourceTypes: ['framework'],
      limit: 1,
      similarityThreshold: 0.6,
    }))
  );

  return results.flat();
}

/**
 * Get strategic analysis frameworks
 */
export async function loadStrategicFrameworks(
  companyId: string
): Promise<SearchResult[]> {
  const queries = [
    'McKinsey 7S model organizational alignment',
    'Gartner hype cycle technology maturity',
  ];

  const results = await Promise.all(
    queries.map(q => semanticSearch(companyId, q, {
      sourceTypes: ['framework'],
      limit: 1,
      similarityThreshold: 0.6,
    }))
  );

  return results.flat();
}

/**
 * Create a prompt enhancement with expert knowledge
 */
export async function createExpertEnhancedPrompt(
  companyId: string,
  basePrompt: string,
  userQuery: string,
  agentType: string
): Promise<string> {
  // Load relevant expert knowledge
  const expertKnowledge = await loadExpertKnowledge(
    companyId,
    userQuery,
    agentType,
    { limit: 2, similarityThreshold: 0.6 }
  );

  if (!expertKnowledge.formattedContext) {
    return basePrompt;
  }

  // Find the best injection point (look for {EXPERT_KNOWLEDGE} placeholder)
  if (basePrompt.includes('{EXPERT_KNOWLEDGE}')) {
    return basePrompt.replace('{EXPERT_KNOWLEDGE}', expertKnowledge.formattedContext);
  }

  // If no placeholder, append to the context section
  return `${basePrompt}

${expertKnowledge.formattedContext}`;
}

export default {
  loadExpertKnowledge,
  loadFrameworkByName,
  loadIndustryBenchmarks,
  loadPrioritizationMethodology,
  loadTransformationBestPractices,
  loadPortfolioFrameworks,
  loadStrategicFrameworks,
  createExpertEnhancedPrompt,
};
