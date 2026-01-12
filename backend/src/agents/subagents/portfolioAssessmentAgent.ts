import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';
import {
  PortfolioAssessmentInput,
  PortfolioAssessmentResult,
  PortfolioAssessmentResultSchema,
  PortfolioItem,
  ItemAssessment,
} from '../schemas/portfolioAssessmentSchema';

// Load system prompt
let systemPrompt: string;
try {
  const promptPath = path.resolve(__dirname, '../prompts/portfolio-assessment-prompt.md');
  systemPrompt = fs.readFileSync(promptPath, { encoding: 'utf8' });
} catch (e) {
  systemPrompt = 'You are THEMIS Portfolio Assessment Agent. Evaluate portfolio items and provide recommendations.';
}

/**
 * Carica gli items dal database Supabase se non forniti direttamente
 */
async function loadItemsFromSupabase(
  tenantId: string | null | undefined,
  portfolioType: string
): Promise<PortfolioItem[]> {
  const items: PortfolioItem[] = [];
  
  // Mappa tipo a tabella (usa tabelle portfolio_* per products/services)
  const tableMap: Record<string, string> = {
    products: 'portfolio_products',
    services: 'portfolio_services',
    mixed: 'portfolio_products', // default to products for mixed
  };

  const tablesToQuery = portfolioType === 'mixed'
    ? ['portfolio_products', 'portfolio_services']
    : [tableMap[portfolioType] || 'portfolio_products'];

  // ⚡ OPTIMIZATION: Parallel queries instead of sequential
  const queryPromises = tablesToQuery.map(async (table) => {
    try {
      let query = supabase.from(table).select('*');

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.warn(`Warning: Could not load from ${table}:`, error.message);
        return [];
      }

      // Determina il tipo dall'nome tabella
      const itemType = table === 'portfolio_products' ? 'product' : 'service';

      if (data) {
        return data.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          name: (row.name || row.title || 'Unnamed') as string,
          type: itemType as 'product' | 'service',
          description: row.description as string | undefined,
          status: (row.status || 'active') as 'active' | 'paused' | 'completed' | 'cancelled' | 'proposed',
          owner: row.owner as string | undefined,
          startDate: row.start_date as string | undefined,
          endDate: row.end_date as string | undefined,
          budget: row.budget as number | undefined,
          actualCost: row.actual_cost as number | undefined,
          strategicAlignment: row.strategic_alignment as number | undefined,
          businessValue: row.business_value as number | undefined,
          riskLevel: row.risk_level as 'low' | 'medium' | 'high' | 'critical' | undefined,
          complexity: row.complexity as 'low' | 'medium' | 'high' | undefined,
          resourceRequirement: row.resource_requirement as number | undefined,
          timeToValue: row.time_to_value as number | undefined,
          roi: row.roi as number | undefined,
          category: row.category as string | undefined,
          tags: (row.tags || []) as string[],
          dependencies: (row.dependencies || []) as string[],
          kpis: (row.kpis || []) as Array<{ name: string; target: string | number; current?: string | number }>,
        }));
      }
      return [];
    } catch (err) {
      console.warn(`Error querying ${table}:`, err);
      return [];
    }
  });

  // Execute all queries in parallel
  const results = await Promise.all(queryPromises);
  results.forEach(tableItems => items.push(...tableItems));
  
  return items;
}

/**
 * Carica il profilo aziendale dall'assessment snapshot
 */
async function loadCompanyProfile(tenantId: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!tenantId) return null;
  
  try {
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('snapshot')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) return null;
    
    const snapshot = data.snapshot as Record<string, unknown>;
    return {
      cluster: snapshot.cluster,
      ppmMaturityLevel: (snapshot.maturityProfile as Record<string, unknown>)?.ppmMaturityLevel,
      primaryFocus: snapshot.executiveSummary,
      strengths: (snapshot.swot as Record<string, unknown>)?.strengths,
      weaknesses: (snapshot.swot as Record<string, unknown>)?.weaknesses,
    };
  } catch (err) {
    console.warn('Could not load company profile:', err);
    return null;
  }
}

/**
 * Calcola assessment locale (fallback senza AI)
 */
function calculateLocalAssessment(items: PortfolioItem[], criteria: Record<string, number>): ItemAssessment[] {
  const weights = {
    strategicFit: criteria.strategicAlignment || 8,
    valueDelivery: criteria.businessValue || 9,
    riskAdjusted: criteria.riskTolerance || 5,
    resourceEfficiency: criteria.resourceConstraint || 7,
    marketTiming: criteria.timeToValue || 6,
  };
  
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  
  const assessments: ItemAssessment[] = items.map((item, index) => {
    // Calculate individual scores
    const strategicFit = (item.strategicAlignment || 5) * 10;
    const valueDelivery = (item.businessValue || 5) * 10;
    const riskAdjusted = item.riskLevel === 'low' ? 80 : item.riskLevel === 'medium' ? 60 : item.riskLevel === 'high' ? 40 : 50;
    const resourceEfficiency = item.budget && item.actualCost
      ? Math.min(100, Math.max(0, 100 - ((item.actualCost - item.budget) / item.budget * 100)))
      : 60;
    const marketTiming = item.timeToValue ? Math.max(0, 100 - item.timeToValue * 5) : 60;
    
    // Weighted overall score
    const overallScore = Math.round(
      (strategicFit * weights.strategicFit +
       valueDelivery * weights.valueDelivery +
       riskAdjusted * weights.riskAdjusted +
       resourceEfficiency * weights.resourceEfficiency +
       marketTiming * weights.marketTiming) / totalWeight
    );
    
    // Determine recommendation
    let recommendation: 'keep' | 'accelerate' | 'review' | 'pause' | 'stop' | 'merge';
    if (overallScore >= 80) recommendation = 'accelerate';
    else if (overallScore >= 60) recommendation = 'keep';
    else if (overallScore >= 40) recommendation = 'review';
    else if (overallScore >= 25) recommendation = 'pause';
    else recommendation = 'stop';
    
    // Generate SWOT
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];
    
    if (strategicFit >= 70) strengths.push('Alto allineamento strategico');
    if (valueDelivery >= 70) strengths.push('Forte valore di business');
    if (riskAdjusted >= 70) strengths.push('Basso profilo di rischio');
    
    if (strategicFit < 50) weaknesses.push('Scarso allineamento strategico');
    if (valueDelivery < 50) weaknesses.push('Valore di business limitato');
    if (riskAdjusted < 50) weaknesses.push('Alto profilo di rischio');
    if (resourceEfficiency < 50) weaknesses.push('Superamento budget');
    
    opportunities.push('Potenziale di ottimizzazione');
    
    if (item.riskLevel === 'high' || item.riskLevel === 'critical') {
      threats.push('Rischio di fallimento');
    }
    threats.push('Cambiamenti di mercato');
    
    // Generate action items
    const actionItems: ItemAssessment['actionItems'] = [];
    if (recommendation === 'review' || recommendation === 'pause') {
      actionItems.push({
        action: 'Condurre analisi approfondita',
        priority: 'immediate',
        impact: 'high',
      });
    }
    if (resourceEfficiency < 60) {
      actionItems.push({
        action: 'Rivedere allocazione budget',
        priority: 'short_term',
        impact: 'medium',
      });
    }
    if (recommendation === 'accelerate') {
      actionItems.push({
        action: 'Allocare risorse aggiuntive',
        priority: 'short_term',
        impact: 'high',
      });
    }
    
    return {
      itemId: item.id,
      itemName: item.name,
      overallScore,
      ranking: 0, // Will be set after sorting
      recommendation,
      confidenceLevel: 'medium' as const,
      scores: {
        strategicFit,
        valueDelivery,
        riskAdjustedReturn: riskAdjusted,
        resourceEfficiency,
        marketTiming,
      },
      strengths,
      weaknesses,
      opportunities,
      threats,
      actionItems,
      rationale: `Score complessivo ${overallScore}/100 basato su valutazione multi-criterio. ${
        recommendation === 'accelerate' ? 'Elemento ad alto potenziale.' :
        recommendation === 'keep' ? 'Elemento performante.' :
        recommendation === 'review' ? 'Richiede revisione.' :
        recommendation === 'pause' ? 'Valutare sospensione.' :
        'Considerare terminazione.'
      }`,
    };
  });
  
  // Sort and assign rankings
  assessments.sort((a, b) => b.overallScore - a.overallScore);
  assessments.forEach((assessment, index) => {
    assessment.ranking = index + 1;
  });
  
  return assessments;
}

/**
 * Genera assessment usando AI con retry logic
 */
async function generateAIAssessment(
  items: PortfolioItem[],
  input: PortfolioAssessmentInput,
  companyProfile: Record<string, unknown> | null,
  retryCount = 0
): Promise<PortfolioAssessmentResult | null> {
  const MAX_RETRIES = 2;

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not configured');
    return null;
  }

  try {
    console.log(`🤖 Attempting AI assessment (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);

    const model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.1,
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 16384, // Reasonable limit for GPT-4o max_completion_tokens
    });

    const contextData = {
      items: items, // Process all items
      evaluationCriteria: input.evaluationCriteria,
      companyProfile,
      userGoal: input.userGoal,
      focusArea: input.focusArea,
    };

    // Enhanced prompt with strict JSON requirements
    const promptTemplate = new PromptTemplate({
      template: `${systemPrompt}

PORTFOLIO DATA:
{portfolioData}

CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. You MUST return ONLY valid, complete JSON - no markdown, no code blocks, no text before or after
2. The "itemAssessments" array is MANDATORY and MUST contain exactly {itemCount} assessment objects - one for EACH item
3. DO NOT TRUNCATE OR ABBREVIATE - Complete every single item assessment
4. Each item assessment MUST include ALL fields: itemId, itemName, overallScore, ranking, recommendation, confidenceLevel, scores (all 5 sub-scores), strengths (array), weaknesses (array), opportunities (array), threats (array), actionItems (array), rationale
5. All enum values MUST be lowercase: "high", "medium", "low", "accelerate", "keep", "review", "pause", "stop", "merge"
6. All number scores MUST be between 0 and 100
7. portfolioType MUST be one of: "initiatives", "products", "services", "mixed"
8. If you cannot fit all items in the response, prioritize completing the JSON structure properly rather than truncating mid-object

VERIFY BEFORE RETURNING:
- Count the items in itemAssessments array = {itemCount}? ✓
- Every item has all required fields? ✓
- JSON is valid and complete (ends with closing braces)? ✓

Generate a COMPLETE assessment in JSON format for ALL {itemCount} items.`,
      inputVariables: ['portfolioData', 'itemCount'],
    });

    const formatted = await promptTemplate.format({
      portfolioData: JSON.stringify(contextData, null, 2),
      itemCount: String(items.length),
    });

    const response = await model.invoke(formatted);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    console.log(`📝 AI response length: ${content.length} chars`);

    // Extract JSON from response (handle markdown code blocks and truncation)
    let jsonContent = content.trim();

    // Remove markdown code block if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1].trim();
    }

    // Extract JSON object - find first { and last }
    const firstBrace = jsonContent.indexOf('{');
    const lastBrace = jsonContent.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      console.error('❌ No valid JSON braces found in AI response');
      console.error('Response preview:', content.substring(0, 500));
      if (retryCount < MAX_RETRIES) {
        console.log('🔄 Retrying AI assessment...');
        return generateAIAssessment(items, input, companyProfile, retryCount + 1);
      }
      return null;
    }

    jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError instanceof Error ? parseError.message : parseError);
      console.error('Attempted to parse:', jsonContent.substring(0, 500) + '...');

      // Try to fix common JSON issues
      try {
        // Remove trailing commas and fix incomplete arrays/objects
        let fixed = jsonContent
          .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
          .replace(/,\s*$/, '');           // Remove final trailing comma

        // Find the last complete item in the itemAssessments array if truncated
        const itemAssessmentsMatch = fixed.match(/"itemAssessments"\s*:\s*\[/);
        if (itemAssessmentsMatch) {
          const startIndex = itemAssessmentsMatch.index! + itemAssessmentsMatch[0].length;
          const afterArray = fixed.substring(startIndex);

          // Find the last complete object in the array
          let lastCompleteIndex = -1;
          let braceCount = 0;
          let inString = false;
          let escapeNext = false;

          for (let i = 0; i < afterArray.length; i++) {
            const char = afterArray[i];

            if (escapeNext) {
              escapeNext = false;
              continue;
            }

            if (char === '\\') {
              escapeNext = true;
              continue;
            }

            if (char === '"') {
              inString = !inString;
              continue;
            }

            if (!inString) {
              if (char === '{') braceCount++;
              else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  lastCompleteIndex = startIndex + i + 1;
                }
              }
            }
          }

          // If we found incomplete items, truncate to last complete item
          if (lastCompleteIndex > 0 && braceCount !== 0) {
            const beforeArray = fixed.substring(0, startIndex);
            const completeItems = fixed.substring(startIndex, lastCompleteIndex);
            fixed = beforeArray + completeItems + ']';
            console.log('🔧 Truncated to last complete item in itemAssessments');
          }
        }

        // If the JSON is incomplete, try to close it properly
        let fixedJson = fixed;
        const openBraces = (fixedJson.match(/\{/g) || []).length;
        const closeBraces = (fixedJson.match(/\}/g) || []).length;
        const openBrackets = (fixedJson.match(/\[/g) || []).length;
        const closeBrackets = (fixedJson.match(/\]/g) || []).length;

        // Close unclosed arrays
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          fixedJson += ']';
        }

        // Close unclosed objects
        for (let i = 0; i < openBraces - closeBraces; i++) {
          fixedJson += '}';
        }

        parsed = JSON.parse(fixedJson);
        console.log('✅ Successfully repaired JSON');
      } catch (repairError) {
        console.error('❌ Could not repair JSON:', repairError instanceof Error ? repairError.message : repairError);
        if (retryCount < MAX_RETRIES) {
          console.log('🔄 Retrying AI assessment...');
          return generateAIAssessment(items, input, companyProfile, retryCount + 1);
        }
        return null;
      }
    }

    // Normalize common issues before validation
    const normalized = normalizeAIResult(parsed, items, input);

    console.log('✅ AI assessment generated successfully with', normalized.itemAssessments?.length || 0, 'items');
    return normalized;
  } catch (err) {
    console.error('❌ AI assessment failed:', err instanceof Error ? err.message : err);
    if (retryCount < MAX_RETRIES) {
      console.log('🔄 Retrying AI assessment...');
      return generateAIAssessment(items, input, companyProfile, retryCount + 1);
    }
    return null;
  }
}

/**
 * Normalizza il risultato AI per allinearlo allo schema Zod
 */
function normalizeAIResult(
  result: Record<string, unknown>,
  items: PortfolioItem[],
  input: PortfolioAssessmentInput
): PortfolioAssessmentResult {
  // Ensure required fields
  const normalized: Record<string, unknown> = {
    ...result,
    assessmentId: result.assessmentId || uuidv4(),
    tenantId: result.tenantId || input.tenantId || null,
    companyId: result.companyId || input.companyId || null,
    createdAt: result.createdAt || new Date().toISOString(),
    portfolioType: normalizeEnum(result.portfolioType, ['initiatives', 'products', 'services', 'mixed'], input.portfolioType || 'mixed'),
    totalItems: result.totalItems || items.length,
    assessedItems: result.assessedItems || (result.itemAssessments as unknown[])?.length || items.length,
    executiveSummary: result.executiveSummary || 'Assessment completato.',
    confidenceOverall: normalizeEnum(result.confidenceOverall, ['high', 'medium', 'low'], 'medium'),
  };

  // Normalize portfolioHealth
  if (result.portfolioHealth && typeof result.portfolioHealth === 'object') {
    const health = result.portfolioHealth as Record<string, unknown>;
    normalized.portfolioHealth = {
      overallScore: clampScore(health.overallScore),
      balanceScore: clampScore(health.balanceScore),
      alignmentScore: clampScore(health.alignmentScore),
      riskScore: clampScore(health.riskScore),
      performanceScore: clampScore(health.performanceScore),
    };
  } else {
    normalized.portfolioHealth = {
      overallScore: 60, balanceScore: 60, alignmentScore: 60, riskScore: 60, performanceScore: 60
    };
  }

  // Normalize recommendationDistribution
  if (result.recommendationDistribution && typeof result.recommendationDistribution === 'object') {
    const dist = result.recommendationDistribution as Record<string, unknown>;
    normalized.recommendationDistribution = {
      keep: Number(dist.keep) || 0,
      accelerate: Number(dist.accelerate) || 0,
      review: Number(dist.review) || 0,
      pause: Number(dist.pause) || 0,
      stop: Number(dist.stop) || 0,
      merge: Number(dist.merge) || 0,
    };
  } else {
    normalized.recommendationDistribution = { keep: 0, accelerate: 0, review: 0, pause: 0, stop: 0, merge: 0 };
  }

  // Normalize dataQuality
  if (result.dataQuality && typeof result.dataQuality === 'object') {
    const dq = result.dataQuality as Record<string, unknown>;
    normalized.dataQuality = {
      completeness: clampScore(dq.completeness),
      accuracy: normalizeEnum(dq.accuracy, ['high', 'medium', 'low', 'unknown'], 'medium'),
      dataGaps: Array.isArray(dq.dataGaps) ? dq.dataGaps : [],
    };
  } else {
    normalized.dataQuality = { completeness: 50, accuracy: 'medium' as const, dataGaps: [] };
  }

  // Normalize itemAssessments (handle both 'itemAssessments' and 'items' keys from AI)
  const aiItemAssessments = result.itemAssessments || result.items || [];
  if (Array.isArray(aiItemAssessments) && aiItemAssessments.length > 0) {
    normalized.itemAssessments = (aiItemAssessments as Record<string, unknown>[]).map((item, index) => ({
      itemId: item.itemId || `item-${index}`,
      itemName: item.itemName || `Item ${index + 1}`,
      overallScore: clampScore(item.overallScore),
      ranking: Number(item.ranking) || index + 1,
      recommendation: normalizeEnum(item.recommendation, ['keep', 'accelerate', 'review', 'pause', 'stop', 'merge'], 'review'),
      confidenceLevel: normalizeEnum(item.confidenceLevel, ['high', 'medium', 'low'], 'medium'),
      scores: normalizeScores(item.scores),
      strengths: Array.isArray(item.strengths) ? item.strengths : [],
      weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses : [],
      opportunities: Array.isArray(item.opportunities) ? item.opportunities : [],
      threats: Array.isArray(item.threats) ? item.threats : [],
      actionItems: normalizeActionItems(item.actionItems),
      rationale: String(item.rationale || 'Valutazione basata su criteri standard.'),
    }));
  } else {
    normalized.itemAssessments = [];
  }

  // Get itemAssessments for deriving other fields
  const itemAssessments = normalized.itemAssessments as Array<{
    itemId: string;
    itemName: string;
    overallScore: number;
    recommendation: string;
    strengths: string[];
    weaknesses: string[];
  }>;

  // Calculate recommendationDistribution from itemAssessments
  if (!result.recommendationDistribution || Object.values(result.recommendationDistribution as Record<string, unknown>).every(v => v === 0)) {
    const dist = { keep: 0, accelerate: 0, review: 0, pause: 0, stop: 0, merge: 0 };
    itemAssessments.forEach(a => {
      const rec = a.recommendation as keyof typeof dist;
      if (rec in dist) dist[rec]++;
    });
    normalized.recommendationDistribution = dist;
  }

  // Normalize topPerformers - derive from itemAssessments if not provided
  if (Array.isArray(result.topPerformers) && result.topPerformers.length > 0) {
    normalized.topPerformers = result.topPerformers.map((p: unknown) => {
      if (!p || typeof p !== 'object') return { itemId: 'unknown', name: 'Unknown', score: 0, highlight: '' };
      const perf = p as Record<string, unknown>;
      const strengths = Array.isArray(perf.strengths) ? perf.strengths : [];
      return {
        itemId: String(perf.itemId || perf.id || 'unknown'),
        name: String(perf.name || perf.itemName || 'Unknown'),
        score: clampScore(perf.score || perf.overallScore),
        highlight: String(perf.highlight || perf.reason || strengths[0] || ''),
      };
    });
  } else {
    // Derive from itemAssessments - top 3 by score
    const sorted = [...itemAssessments].sort((a, b) => b.overallScore - a.overallScore);
    normalized.topPerformers = sorted.slice(0, 3).map(a => ({
      itemId: a.itemId,
      name: a.itemName,
      score: a.overallScore,
      highlight: a.strengths[0] || 'High performance',
    }));
  }

  // Normalize bottomPerformers - derive from itemAssessments if not provided
  if (Array.isArray(result.bottomPerformers) && result.bottomPerformers.length > 0) {
    normalized.bottomPerformers = result.bottomPerformers.map((p: unknown) => {
      if (!p || typeof p !== 'object') return { itemId: 'unknown', name: 'Unknown', score: 0, issue: '' };
      const perf = p as Record<string, unknown>;
      const weaknesses = Array.isArray(perf.weaknesses) ? perf.weaknesses : [];
      return {
        itemId: String(perf.itemId || perf.id || 'unknown'),
        name: String(perf.name || perf.itemName || 'Unknown'),
        score: clampScore(perf.score || perf.overallScore),
        issue: String(perf.issue || perf.reason || weaknesses[0] || ''),
      };
    });
  } else {
    // Derive from itemAssessments - bottom 3 by score
    const sorted = [...itemAssessments].sort((a, b) => a.overallScore - b.overallScore);
    normalized.bottomPerformers = sorted.slice(0, 3).map(a => ({
      itemId: a.itemId,
      name: a.itemName,
      score: a.overallScore,
      issue: a.weaknesses[0] || 'Needs improvement',
    }));
  }

  // Calculate portfolioHealth from itemAssessments if not provided or incomplete
  if (!result.portfolioHealth || (result.portfolioHealth as Record<string, unknown>).overallScore === undefined) {
    const avgScore = itemAssessments.length > 0
      ? itemAssessments.reduce((sum, a) => sum + a.overallScore, 0) / itemAssessments.length
      : 50;
    normalized.portfolioHealth = {
      overallScore: Math.round(avgScore),
      balanceScore: Math.round(60 + Math.random() * 20),
      alignmentScore: Math.round(avgScore),
      riskScore: Math.round(60 + Math.random() * 20),
      performanceScore: Math.round(avgScore),
    };
  }

  // Normalize portfolioRecommendations
  if (Array.isArray(result.portfolioRecommendations)) {
    normalized.portfolioRecommendations = result.portfolioRecommendations.map((r: unknown) => {
      if (!r || typeof r !== 'object') {
        return { category: 'optimization', title: '', description: '', impact: 'medium', effort: 'medium', priority: 3 };
      }
      const rec = r as Record<string, unknown>;
      return {
        category: normalizeEnum(rec.category, ['rebalancing', 'resource_allocation', 'risk_mitigation', 'strategic_alignment', 'optimization'], 'optimization'),
        title: String(rec.title || ''),
        description: String(rec.description || ''),
        impact: normalizeEnum(rec.impact, ['high', 'medium', 'low'], 'medium'),
        effort: normalizeEnum(rec.effort, ['high', 'medium', 'low'], 'medium'),
        priority: Math.max(1, Math.min(5, Number(rec.priority) || 3)),
      };
    });
  } else {
    normalized.portfolioRecommendations = [];
  }

  // Normalize portfolioRisks
  if (Array.isArray(result.portfolioRisks)) {
    normalized.portfolioRisks = result.portfolioRisks.map((r: unknown) => {
      if (!r || typeof r !== 'object') {
        return { risk: '', likelihood: 'medium', impact: 'medium', affectedItems: [], mitigation: '' };
      }
      const risk = r as Record<string, unknown>;
      return {
        risk: String(risk.risk || ''),
        likelihood: normalizeEnum(risk.likelihood, ['low', 'medium', 'high'], 'medium'),
        impact: normalizeEnum(risk.impact, ['low', 'medium', 'high'], 'medium'),
        affectedItems: Array.isArray(risk.affectedItems) ? risk.affectedItems.map(String) : [],
        mitigation: String(risk.mitigation || ''),
      };
    });
  } else {
    normalized.portfolioRisks = [];
  }

  // Normalize gapAnalysis
  if (result.gapAnalysis && typeof result.gapAnalysis === 'object') {
    const gap = result.gapAnalysis as Record<string, unknown>;
    normalized.gapAnalysis = {
      missingCapabilities: Array.isArray(gap.missingCapabilities) ? gap.missingCapabilities : [],
      overInvestedAreas: Array.isArray(gap.overInvestedAreas) ? gap.overInvestedAreas : [],
      underInvestedAreas: Array.isArray(gap.underInvestedAreas) ? gap.underInvestedAreas : [],
      redundancies: Array.isArray(gap.redundancies) ? gap.redundancies : [],
    };
  } else {
    normalized.gapAnalysis = { missingCapabilities: [], overInvestedAreas: [], underInvestedAreas: [], redundancies: [] };
  }

  return normalized as unknown as PortfolioAssessmentResult;
}

function normalizeEnum<T extends string>(value: unknown, validValues: T[], defaultValue: T): T {
  if (typeof value === 'string') {
    const lower = value.toLowerCase() as T;
    if (validValues.includes(lower)) return lower;
  }
  return defaultValue;
}

function clampScore(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeScores(scores: unknown): Record<string, number> {
  if (!scores || typeof scores !== 'object') {
    return { strategicFit: 50, valueDelivery: 50, riskAdjustedReturn: 50, resourceEfficiency: 50, marketTiming: 50 };
  }
  const s = scores as Record<string, unknown>;
  return {
    strategicFit: clampScore(s.strategicFit),
    valueDelivery: clampScore(s.valueDelivery),
    riskAdjustedReturn: clampScore(s.riskAdjustedReturn),
    resourceEfficiency: clampScore(s.resourceEfficiency),
    marketTiming: clampScore(s.marketTiming),
  };
}

function normalizeActionItems(items: unknown): Array<{ action: string; priority: string; impact: string; owner?: string }> {
  if (!Array.isArray(items)) return [];
  return items.map((item: unknown) => {
    if (!item || typeof item !== 'object') {
      return { action: 'Azione da definire', priority: 'medium_term', impact: 'medium' };
    }
    const i = item as Record<string, unknown>;
    return {
      action: String(i.action || 'Azione da definire'),
      priority: normalizeEnum(i.priority, ['immediate', 'short_term', 'medium_term', 'long_term'], 'medium_term'),
      impact: normalizeEnum(i.impact, ['high', 'medium', 'low'], 'medium'),
      owner: i.owner ? String(i.owner) : undefined,
    };
  });
}

/**
 * Salva il risultato su Supabase
 */
async function savePortfolioAssessment(result: PortfolioAssessmentResult): Promise<boolean> {
  try {
    // Ensure assessmentId is present
    if (!result.assessmentId) {
      console.error('Cannot save portfolio assessment: assessmentId is missing');
      return false;
    }

    const { error } = await supabase
      .from('portfolio_assessments')
      .upsert({
        assessment_id: result.assessmentId,
        tenant_id: result.tenantId,
        company_id: result.companyId,
        portfolio_type: result.portfolioType,
        total_items: result.totalItems,
        assessed_items: result.assessedItems,
        portfolio_health: result.portfolioHealth,
        recommendation_distribution: result.recommendationDistribution,
        executive_summary: result.executiveSummary,
        result: result,
        created_at: result.createdAt,
      }, { onConflict: 'assessment_id' });
    
    if (error) {
      console.error('Error saving portfolio assessment:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Exception saving portfolio assessment:', err);
    return false;
  }
}

export const portfolioAssessmentAgent: SubAgent = {
  name: 'PORTFOLIO_ASSESSMENT',
  
  async run(args): Promise<SubAgentResult> {
    console.log('🔍 PORTFOLIO_ASSESSMENT agent started');

    try {
      // Parse input
      const input = args as unknown as PortfolioAssessmentInput;
      const tenantId = input.tenantId;
      const companyId = input.companyId;
      const portfolioType = input.portfolioType || 'mixed';
      const onProgress = input.onProgress || (() => {});

      // Report loading phase
      onProgress({
        phase: 'loading',
        message: 'Caricamento portfolio...',
        progress: 10,
      });

      // Load items
      let items: PortfolioItem[] = input.items || [];

      if (items.length === 0 && input.dataSource !== 'manual') {
        console.log('📦 Loading items from Supabase...');
        items = await loadItemsFromSupabase(tenantId, portfolioType);
      }

      onProgress({
        phase: 'loading',
        message: `${items.length} elementi caricati`,
        progress: 20,
        totalItems: items.length,
      });
      
      if (items.length === 0) {
        return {
          content: 'Non ho trovato elementi da valutare. Per favore carica una lista di iniziative, prodotti o servizi.',
          metadata: { error: 'no_items', routedTo: 'PORTFOLIO_ASSESSMENT' },
        };
      }
      
      console.log(`📊 Evaluating ${items.length} items...`);

      // Load company profile for context
      onProgress({
        phase: 'analyzing',
        message: 'Caricamento profilo aziendale...',
        progress: 25,
      });

      const companyProfile = await loadCompanyProfile(tenantId);

      // Try AI assessment first
      onProgress({
        phase: 'analyzing',
        message: 'Analisi AI in corso...',
        progress: 30,
        itemsProcessed: 0,
        totalItems: items.length,
      });

      let result = await generateAIAssessment(items, input, companyProfile);

      onProgress({
        phase: 'analyzing',
        message: 'Elaborazione risultati...',
        progress: 80,
      });

      // Validate AI result with safeParse
      if (result) {
        const validationResult = PortfolioAssessmentResultSchema.safeParse(result);
        if (!validationResult.success) {
          console.warn('⚠️ AI result failed validation, using local assessment:', validationResult.error.issues);
          result = null;
        }
      }

      // Fallback to local assessment
      if (!result) {
        console.log('🔧 Using local assessment (AI unavailable or invalid)');
        
        const criteria = input.evaluationCriteria || {
          strategicAlignment: 8,
          businessValue: 9,
          riskTolerance: 5,
          resourceConstraint: 7,
          timeToValue: 6,
        };
        
        const itemAssessments = calculateLocalAssessment(items, criteria);
        
        // Calculate portfolio health
        const avgScore = itemAssessments.reduce((sum, a) => sum + a.overallScore, 0) / itemAssessments.length;
        const avgStrategic = itemAssessments.reduce((sum, a) => sum + a.scores.strategicFit, 0) / itemAssessments.length;
        const avgRisk = itemAssessments.reduce((sum, a) => sum + a.scores.riskAdjustedReturn, 0) / itemAssessments.length;
        
        // Count recommendations
        const recDist = {
          keep: 0, accelerate: 0, review: 0, pause: 0, stop: 0, merge: 0
        };
        itemAssessments.forEach(a => recDist[a.recommendation]++);
        
        result = {
          assessmentId: uuidv4(),
          tenantId: tenantId || null,
          companyId: companyId || null,
          createdAt: new Date().toISOString(),
          portfolioType: portfolioType as 'initiatives' | 'products' | 'services' | 'mixed',
          totalItems: items.length,
          assessedItems: itemAssessments.length,
          executiveSummary: `Portfolio di ${items.length} elementi analizzato. Score medio: ${Math.round(avgScore)}/100. ${recDist.accelerate} elementi da accelerare, ${recDist.keep} da mantenere, ${recDist.review + recDist.pause + recDist.stop} richiedono attenzione.`,
          portfolioHealth: {
            overallScore: Math.round(avgScore),
            balanceScore: Math.round(60 + Math.random() * 20), // Simplified
            alignmentScore: Math.round(avgStrategic),
            riskScore: Math.round(avgRisk),
            performanceScore: Math.round(avgScore),
          },
          recommendationDistribution: recDist,
          topPerformers: itemAssessments.slice(0, 3).map(a => ({
            itemId: a.itemId,
            name: a.itemName,
            score: a.overallScore,
            highlight: a.strengths[0] || 'Performance elevata',
          })),
          bottomPerformers: itemAssessments.slice(-3).reverse().map(a => ({
            itemId: a.itemId,
            name: a.itemName,
            score: a.overallScore,
            issue: a.weaknesses[0] || 'Performance sotto le attese',
          })),
          itemAssessments,
          portfolioRecommendations: [
            {
              category: 'optimization' as const,
              title: 'Ottimizzazione Portfolio',
              description: `Focalizzare risorse sui ${recDist.accelerate} elementi ad alto potenziale`,
              impact: 'high' as const,
              effort: 'medium' as const,
              priority: 1,
            },
            {
              category: 'risk_mitigation' as const,
              title: 'Gestione Rischi',
              description: `Rivedere i ${recDist.review + recDist.pause} elementi problematici`,
              impact: 'medium' as const,
              effort: 'low' as const,
              priority: 2,
            },
          ],
          gapAnalysis: {
            missingCapabilities: [],
            overInvestedAreas: [],
            underInvestedAreas: [],
            redundancies: [],
          },
          portfolioRisks: [
            {
              risk: 'Concentrazione risorse',
              likelihood: 'medium' as const,
              impact: 'medium' as const,
              affectedItems: itemAssessments.filter(a => a.recommendation === 'accelerate').map(a => a.itemId),
              mitigation: 'Diversificare investimenti',
            },
          ],
          dataQuality: {
            completeness: Math.round((items.filter(i => i.description && i.businessValue).length / items.length) * 100),
            accuracy: 'medium' as const,
            dataGaps: items.filter(i => !i.businessValue).length > 0 ? ['Mancano metriche di business value per alcuni elementi'] : [],
          },
          confidenceOverall: 'medium' as const,
        };
      }
      
      // Ensure all required fields are present
      if (!result.assessmentId) {
        result.assessmentId = uuidv4();
      }
      if (!result.createdAt) {
        result.createdAt = new Date().toISOString();
      }
      if (!result.portfolioType) {
        result.portfolioType = portfolioType as 'initiatives' | 'products' | 'services' | 'mixed';
      }
      if (!result.totalItems) {
        result.totalItems = items.length;
      }
      if (!result.assessedItems) {
        result.assessedItems = result.itemAssessments?.length || items.length;
      }
      if (!result.portfolioHealth) {
        result.portfolioHealth = {
          overallScore: 60,
          balanceScore: 60,
          alignmentScore: 60,
          riskScore: 60,
          performanceScore: 60,
        };
      }
      if (!result.recommendationDistribution) {
        result.recommendationDistribution = { keep: 0, accelerate: 0, review: 0, pause: 0, stop: 0, merge: 0 };
      }

      // Validate with Zod
      try {
        PortfolioAssessmentResultSchema.parse(result);
      } catch (validationError) {
        console.warn('Validation warning:', validationError);
        // Continue anyway with best-effort result
      }

      // Save to Supabase
      onProgress({
        phase: 'saving',
        message: 'Salvataggio assessment...',
        progress: 90,
      });

      const saveSuccess = await savePortfolioAssessment(result);
      if (saveSuccess) {
        console.log('💾 Portfolio assessment saved');
      } else {
        console.error('❌ Failed to save portfolio assessment');
      }

      onProgress({
        phase: 'complete',
        message: 'Assessment completato!',
        progress: 100,
      });

      // Build response
      const summaryLines = [
        `## 📊 Portfolio Assessment Completato`,
        ``,
        `**${result.totalItems} elementi analizzati** | Score medio: **${result.portfolioHealth?.overallScore || 0}/100**`,
        ``,
        `### Distribuzione Raccomandazioni:`,
        `- 🚀 Accelerare: ${result.recommendationDistribution?.accelerate || 0}`,
        `- ✅ Mantenere: ${result.recommendationDistribution?.keep || 0}`,
        `- 🔍 Rivedere: ${result.recommendationDistribution?.review || 0}`,
        `- ⏸️ Sospendere: ${result.recommendationDistribution?.pause || 0}`,
        `- 🛑 Terminare: ${result.recommendationDistribution?.stop || 0}`,
        ``,
        `### Top Performers:`,
        ...(result.topPerformers || []).map(p => `- **${p.name}** (${p.score}/100): ${p.highlight}`),
        ``,
        `### Richiedono Attenzione:`,
        ...(result.bottomPerformers || []).map(p => `- **${p.name}** (${p.score}/100): ${p.issue}`),
      ];
      
      return {
        content: summaryLines.join('\n'),
        metadata: {
          routedTo: 'PORTFOLIO_ASSESSMENT',
          assessmentId: result.assessmentId,
          portfolioHealth: result.portfolioHealth,
          recommendationDistribution: result.recommendationDistribution,
          result,
        },
      };
      
    } catch (error) {
      console.error('❌ PORTFOLIO_ASSESSMENT error:', error);
      return {
        content: `Errore durante l'assessment del portfolio: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        metadata: { error: true, routedTo: 'PORTFOLIO_ASSESSMENT' },
      };
    }
  },
};

export default portfolioAssessmentAgent;
