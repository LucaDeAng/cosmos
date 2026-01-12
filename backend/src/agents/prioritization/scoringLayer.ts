/**
 * Scoring Layer - Multi-Criteria Priority Scoring
 *
 * Calcola score multi-criterio per prioritizzazione:
 * - WSJF (Weighted Shortest Job First) - SAFe framework
 * - ICE Score (Impact, Confidence, Ease)
 * - Retention Index - Portfolio theory based
 * - MoSCoW mapping basato su scores
 * - Composite score finale
 */

import type {
  PortfolioItemInput,
  ScoringConfig,
  ScoringWeights,
  ScoringLayerResult,
  DEFAULT_SCORING_WEIGHTS,
} from './types';
import type {
  WSJFScore,
  ICEScore,
  RetentionIndex,
  PriorityScore,
  TriageResult,
} from '../schemas/prioritizationSchema';

// Re-export defaults
export { DEFAULT_SCORING_WEIGHTS } from './types';

// === DEFAULT CONFIGURATION ===

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  enabled: true,
  weights: undefined, // Uses DEFAULT_SCORING_WEIGHTS
  includeWSJF: true,
  includeICE: true,
  includeRetention: true,
  phaseAdjustment: false,
};

// === UTILITY FUNCTIONS ===

/**
 * Normalizza valore in range 1-10
 */
function normalizeToScale10(value: number | undefined, defaultValue: number = 5): number {
  if (value === undefined || value === null) return defaultValue;
  if (value <= 0) return 1;
  if (value >= 10) return 10;
  return Math.round(value);
}

/**
 * Converte effort label (XS-XL) in numero
 */
function effortToNumeric(effort: string | undefined): number {
  const mapping: Record<string, number> = {
    'XS': 1,
    'S': 2,
    'M': 5,
    'L': 8,
    'XL': 13,
  };
  return mapping[effort?.toUpperCase() || 'M'] || 5;
}

/**
 * Converte criticality label in numero
 */
function criticalityToNumeric(criticality: string | undefined): number {
  const mapping: Record<string, number> = {
    'critical': 10,
    'important': 7,
    'standard': 5,
    'optional': 2,
  };
  return mapping[criticality?.toLowerCase() || 'standard'] || 5;
}

/**
 * Converte risk level in fattore di riduzione (inverso)
 */
function riskLevelToFactor(risk: string | undefined): number {
  const mapping: Record<string, number> = {
    'critical': 2,
    'high': 5,
    'medium': 7,
    'low': 9,
  };
  return mapping[risk?.toLowerCase() || 'medium'] || 7;
}

// === WSJF SCORING ===

/**
 * Calcola WSJF (Weighted Shortest Job First)
 *
 * Formula: (Business Value + Time Criticality + Risk Reduction) / Job Size
 *
 * @param item - Item da valutare
 * @param triageResult - Risultato triage opzionale per boost
 * @param roadmapPhase - Fase roadmap opzionale (1=early boost)
 */
export function calculateWSJF(
  item: PortfolioItemInput,
  triageResult?: TriageResult,
  roadmapPhase?: number
): WSJFScore {
  // Business Value (1-10)
  let businessValue = normalizeToScale10(item.businessValue, 5);

  // Boost per strategic alignment
  if (item.strategicAlignment && item.strategicAlignment >= 8) {
    businessValue = Math.min(10, businessValue + 1);
  }

  // Time Criticality (1-10)
  let timeCriticality = 5;

  // Boost basato su triage category
  if (triageResult) {
    switch (triageResult.category) {
      case 'MUST':
        timeCriticality = 9;
        break;
      case 'SHOULD':
        timeCriticality = 7;
        break;
      case 'COULD':
        timeCriticality = 4;
        break;
      case 'WONT':
        timeCriticality = 2;
        break;
      default:
        timeCriticality = 5;
    }
  }

  // Boost se è in fase iniziale della roadmap
  if (roadmapPhase === 1) {
    timeCriticality = Math.min(10, timeCriticality + 2);
  }

  // Risk Reduction / Opportunity Enablement (1-10)
  const riskReduction = riskLevelToFactor(item.riskLevel);

  // Job Size (1-10) - Inversamente proporzionale allo sforzo
  // Un job size alto significa più lavoro = divisore maggiore = score minore
  let jobSize = 5;

  if (item.estimatedCost && item.budget) {
    // Stima basata su budget relativo
    const costRatio = item.estimatedCost / item.budget;
    jobSize = Math.min(10, Math.max(1, Math.round(costRatio * 5 + 3)));
  } else if (item.complexity) {
    const complexityMapping: Record<string, number> = {
      'low': 3,
      'medium': 5,
      'high': 8,
    };
    jobSize = complexityMapping[item.complexity] || 5;
  }

  // Formula WSJF
  const score = Number(((businessValue + timeCriticality + riskReduction) / Math.max(1, jobSize)).toFixed(2));

  return {
    businessValue,
    timeCriticality,
    riskReduction,
    jobSize,
    score,
  };
}

// === ICE SCORING ===

/**
 * Calcola ICE Score (Impact, Confidence, Ease)
 *
 * Formula: Impact * Confidence * Ease
 *
 * @param item - Item da valutare
 * @param triageResult - Risultato triage opzionale
 */
export function calculateICE(
  item: PortfolioItemInput,
  triageResult?: TriageResult
): ICEScore {
  // Impact (1-10) - Impatto sul business
  let impact = normalizeToScale10(item.businessValue, 5);

  // Boost per allineamento strategico
  if (item.strategicAlignment) {
    impact = Math.round((impact + normalizeToScale10(item.strategicAlignment, 5)) / 2);
  }

  // Confidence (1-10) - Quanto siamo sicuri delle stime
  let confidence = 7; // Default medio-alto

  // Riduzione per alto rischio
  if (item.riskLevel === 'critical') {
    confidence = 4;
  } else if (item.riskLevel === 'high') {
    confidence = 5;
  } else if (item.riskLevel === 'low') {
    confidence = 9;
  }

  // Boost se abbiamo triage confidence alta
  if (triageResult && triageResult.confidence >= 0.8) {
    confidence = Math.min(10, confidence + 1);
  }

  // Ease (1-10) - Facilità di implementazione (inverso della complessità)
  let ease = 5;

  if (item.complexity) {
    const complexityMapping: Record<string, number> = {
      'low': 9,
      'medium': 5,
      'high': 2,
    };
    ease = complexityMapping[item.complexity] || 5;
  }

  // Penalizzazione per molte dipendenze
  if (item.dependencies && item.dependencies.length > 3) {
    ease = Math.max(1, ease - 2);
  }

  // Formula ICE
  const score = impact * confidence * ease;

  return {
    impact,
    confidence,
    ease,
    score,
  };
}

// === RETENTION INDEX ===

/**
 * Calcola Retention Index (Portfolio Theory)
 *
 * Valuta se un item dovrebbe essere mantenuto nel portfolio basandosi su:
 * - Future Market Potential
 * - Product Modification Gain
 * - Financial Impact
 * - Strategic Fit
 * - Resource Requirements
 * - Risk Level
 * - Competitive Position
 *
 * @param item - Item da valutare
 */
export function calculateRetentionIndex(
  item: PortfolioItemInput
): RetentionIndex {
  // Future Market Potential (0-1)
  let futureMarketPotential = 0.5;
  if (item.lifecycle === 'growth') {
    futureMarketPotential = 0.9;
  } else if (item.lifecycle === 'mature') {
    futureMarketPotential = 0.6;
  } else if (item.lifecycle === 'decline' || item.lifecycle === 'end_of_life') {
    futureMarketPotential = 0.2;
  }
  if (item.strategicAlignment && item.strategicAlignment >= 8) {
    futureMarketPotential = Math.min(1, futureMarketPotential + 0.2);
  }

  // Product Modification Gain (0-1) - Potenziale di miglioramento
  let productModificationGain = 0.5;
  if (item.tags?.includes('modernization') || item.tags?.includes('upgrade')) {
    productModificationGain = 0.8;
  }
  if (item.lifecycle === 'end_of_life') {
    productModificationGain = 0.1;
  }

  // Financial Impact (0-1)
  let financialImpact = 0.5;
  if (item.businessValue) {
    financialImpact = Math.min(1, item.businessValue / 10);
  }
  if (item.roi && item.roi > 0) {
    financialImpact = Math.min(1, financialImpact + 0.2);
  }

  // Strategic Fit (0-1)
  let strategicFit = 0.5;
  if (item.strategicAlignment) {
    strategicFit = Math.min(1, item.strategicAlignment / 10);
  }

  // Resource Requirements (0-1) - Inverso delle risorse necessarie (alto = poche risorse)
  let resourceRequirements = 0.5;
  if (item.complexity === 'low') {
    resourceRequirements = 0.8;
  } else if (item.complexity === 'high') {
    resourceRequirements = 0.2;
  }
  // Penalizzazione per budget alto
  if (item.estimatedCost && item.budget && item.estimatedCost > item.budget) {
    resourceRequirements = Math.max(0, resourceRequirements - 0.3);
  }

  // Risk Level (0-1) - Inverso del rischio (alto = basso rischio)
  let riskLevel = 0.5;
  const riskMapping: Record<string, number> = {
    'low': 0.9,
    'medium': 0.5,
    'high': 0.3,
    'critical': 0.1,
  };
  riskLevel = riskMapping[item.riskLevel || 'medium'] || 0.5;

  // Competitive Position (0-1) - Posizione competitiva
  let competitivePosition = 0.5;
  if (item.tags?.includes('differentiator') || item.tags?.includes('unique')) {
    competitivePosition = 0.9;
  } else if (item.tags?.includes('commodity')) {
    competitivePosition = 0.3;
  }

  // Weighted average (pesi predefiniti)
  const weights = {
    futureMarketPotential: 0.20,
    productModificationGain: 0.10,
    financialImpact: 0.20,
    strategicFit: 0.20,
    resourceRequirements: 0.10,
    riskLevel: 0.10,
    competitivePosition: 0.10,
  };

  const score = Number((
    futureMarketPotential * weights.futureMarketPotential +
    productModificationGain * weights.productModificationGain +
    financialImpact * weights.financialImpact +
    strategicFit * weights.strategicFit +
    resourceRequirements * weights.resourceRequirements +
    riskLevel * weights.riskLevel +
    competitivePosition * weights.competitivePosition
  ).toFixed(3));

  return {
    futureMarketPotential,
    productModificationGain,
    financialImpact,
    strategicFit,
    resourceRequirements,
    riskLevel,
    competitivePosition,
    score,
  };
}

// === MOSCOW MAPPING ===

/**
 * Determina MoSCoW basato su WSJF score e altri fattori
 */
export function determineMoSCoW(
  wsjfScore: number,
  triageCategory?: string
): { moscow: 'must_have' | 'should_have' | 'could_have' | 'wont_have'; rationale: string } {
  // Se abbiamo triage WONT, rispettiamo quella decisione
  if (triageCategory === 'WONT') {
    return {
      moscow: 'wont_have',
      rationale: `Classificato come WONT nel triage. WSJF score: ${wsjfScore.toFixed(2)}`,
    };
  }

  // Se abbiamo triage MUST con WSJF alto, confermiamo
  if (triageCategory === 'MUST' || wsjfScore > 3.0) {
    return {
      moscow: 'must_have',
      rationale: `Alta priorità strategica con WSJF score ${wsjfScore.toFixed(2)}.${triageCategory === 'MUST' ? ' Confermato dal triage.' : ''}`,
    };
  }

  if (triageCategory === 'SHOULD' || wsjfScore >= 2.0) {
    return {
      moscow: 'should_have',
      rationale: `Iniziativa importante con WSJF score ${wsjfScore.toFixed(2)}. Impatto significativo se posticipata.`,
    };
  }

  if (triageCategory === 'COULD' || wsjfScore >= 1.0) {
    return {
      moscow: 'could_have',
      rationale: `Iniziativa desiderabile ma non critica. WSJF score ${wsjfScore.toFixed(2)}.`,
    };
  }

  return {
    moscow: 'wont_have',
    rationale: `Bassa priorità per questo ciclo. WSJF score ${wsjfScore.toFixed(2)}.`,
  };
}

// === COMPOSITE SCORE ===

/**
 * Calcola score composito finale
 */
export function calculateCompositeScore(
  wsjfScore: number,
  iceScore: number,
  retentionIndex: number,
  weights: { wsjf: number; ice: number; retention: number } = { wsjf: 0.4, ice: 0.3, retention: 0.3 }
): number {
  // Normalizza WSJF (tipicamente 0-5) a 0-100
  const normalizedWSJF = Math.min(100, (wsjfScore / 5) * 100);

  // Normalizza ICE (tipicamente 0-1000) a 0-100
  const normalizedICE = Math.min(100, (iceScore / 1000) * 100);

  // Retention Index già in 0-1, converti a 0-100
  const normalizedRetention = retentionIndex * 100;

  return Number((
    normalizedWSJF * weights.wsjf +
    normalizedICE * weights.ice +
    normalizedRetention * weights.retention
  ).toFixed(1));
}

// === RECOMMENDATION ENGINE ===

/**
 * Determina raccomandazione basata su scores
 */
export function determineRecommendation(
  compositeScore: number,
  retentionIndex: number,
  moscow: string
): 'invest' | 'maintain' | 'optimize' | 'eliminate' {
  // Won't have + basso retention = eliminate
  if (moscow === 'wont_have' && retentionIndex < 0.4) {
    return 'eliminate';
  }

  // High score = invest
  if (compositeScore >= 70 || moscow === 'must_have') {
    return 'invest';
  }

  // Medium score with good retention = maintain
  if (compositeScore >= 50 && retentionIndex >= 0.5) {
    return 'maintain';
  }

  // Medium score with ok retention = optimize
  if (compositeScore >= 40 || retentionIndex >= 0.4) {
    return 'optimize';
  }

  return 'eliminate';
}

// === MAIN SCORING FUNCTION ===

/**
 * Esegue scoring multi-criterio sugli items
 *
 * @param items - Items da valutare
 * @param triageResults - Risultati triage opzionali
 * @param config - Configurazione scoring
 * @returns Risultato con scores dettagliati e statistiche
 */
export async function scoreItems(
  items: PortfolioItemInput[],
  triageResults?: TriageResult[],
  config: Partial<ScoringConfig> = {}
): Promise<ScoringLayerResult> {
  const startTime = Date.now();
  const mergedConfig: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, ...config };

  if (!mergedConfig.enabled || items.length === 0) {
    return {
      results: [],
      topPerformers: [],
      bottomPerformers: [],
      averageScore: 0,
      scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      processingTimeMs: 0,
    };
  }

  console.log(`[ScoringLayer] Starting scoring for ${items.length} items`);

  // Crea mappa triage per lookup veloce
  const triageMap = new Map<string, TriageResult>();
  if (triageResults) {
    for (const tr of triageResults) {
      triageMap.set(tr.itemId, tr);
    }
  }

  const results: PriorityScore[] = [];

  for (const item of items) {
    const triageResult = triageMap.get(item.id);

    // Calcola sub-scores
    const wsjf = mergedConfig.includeWSJF
      ? calculateWSJF(item, triageResult)
      : { businessValue: 5, timeCriticality: 5, riskReduction: 5, jobSize: 5, score: 3 };

    const ice = mergedConfig.includeICE
      ? calculateICE(item, triageResult)
      : { impact: 5, confidence: 5, ease: 5, score: 125 };

    const retention = mergedConfig.includeRetention
      ? calculateRetentionIndex(item)
      : { futureMarketPotential: 0.5, productModificationGain: 0.5, financialImpact: 0.5, strategicFit: 0.5, resourceRequirements: 0.5, riskLevel: 0.5, competitivePosition: 0.5, score: 0.5 };

    // MoSCoW
    const { moscow, rationale: moscowRationale } = determineMoSCoW(
      wsjf.score,
      triageResult?.category
    );

    // Composite Score
    const compositeScore = calculateCompositeScore(
      wsjf.score,
      ice.score,
      retention.score
    );

    // Recommendation
    const recommendation = determineRecommendation(
      compositeScore,
      retention.score,
      moscow
    );

    // Build reasoning array
    const reasoning: string[] = [];
    if (wsjf.score > 3) {
      reasoning.push(`Alto WSJF (${wsjf.score.toFixed(2)}) indica priorità elevata`);
    }
    if (ice.score > 500) {
      reasoning.push(`Alto ICE (${ice.score}) indica buon rapporto impatto/sforzo`);
    }
    if (retention.score > 0.7) {
      reasoning.push(`Alto Retention Index (${(retention.score * 100).toFixed(0)}%) suggerisce mantenimento`);
    }
    if (retention.score < 0.3) {
      reasoning.push(`Basso Retention Index (${(retention.score * 100).toFixed(0)}%) suggerisce dismissione`);
    }
    if (triageResult?.category === 'MUST') {
      reasoning.push('Classificato MUST nel triage iniziale');
    }

    // Confidence basata sulla disponibilità dati
    let confidence = 0.6;
    if (item.businessValue !== undefined) confidence += 0.1;
    if (item.strategicAlignment !== undefined) confidence += 0.1;
    if (item.riskLevel !== undefined) confidence += 0.05;
    if (triageResult && triageResult.confidence > 0.7) confidence += 0.1;
    confidence = Math.min(1, confidence);

    results.push({
      itemId: item.id,
      itemName: item.name,
      overallScore: compositeScore,
      wsjfScore: wsjf.score,
      iceScore: ice.score,
      retentionIndex: retention.score,
      moscow,
      moscowRationale,
      confidence,
      breakdown: {
        wsjf_businessValue: wsjf.businessValue,
        wsjf_timeCriticality: wsjf.timeCriticality,
        wsjf_riskReduction: wsjf.riskReduction,
        wsjf_jobSize: wsjf.jobSize,
        ice_impact: ice.impact,
        ice_confidence: ice.confidence,
        ice_ease: ice.ease,
        retention_futureMarket: retention.futureMarketPotential,
        retention_financial: retention.financialImpact,
        retention_strategic: retention.strategicFit,
        retention_risk: retention.riskLevel,
      },
      reasoning,
      recommendation,
    });
  }

  // Sort by overall score
  results.sort((a, b) => b.overallScore - a.overallScore);

  // Top performers
  const topPerformers = results.slice(0, 5).map(r => ({
    itemId: r.itemId,
    name: r.itemName,
    score: r.overallScore,
    highlight: r.moscow === 'must_have' ? 'Must-have strategico' :
               r.wsjfScore > 3 ? 'Alto valore WSJF' :
               r.retentionIndex > 0.7 ? 'Forte retention' :
               'Alta priorità',
  }));

  // Bottom performers
  const bottomPerformers = results.slice(-5).reverse().map(r => ({
    itemId: r.itemId,
    name: r.itemName,
    score: r.overallScore,
    issue: r.moscow === 'wont_have' ? 'Candidato dismissione' :
           r.retentionIndex < 0.3 ? 'Bassa retention' :
           r.wsjfScore < 1 ? 'Basso valore WSJF' :
           'Bassa priorità',
  }));

  // Score distribution
  const scoreDistribution = {
    excellent: results.filter(r => r.overallScore >= 80).length,
    good: results.filter(r => r.overallScore >= 60 && r.overallScore < 80).length,
    fair: results.filter(r => r.overallScore >= 40 && r.overallScore < 60).length,
    poor: results.filter(r => r.overallScore < 40).length,
  };

  // Average score
  const averageScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length
    : 0;

  const processingTimeMs = Date.now() - startTime;

  console.log(`[ScoringLayer] Completed in ${processingTimeMs}ms. Average score: ${averageScore.toFixed(1)}`);

  return {
    results,
    topPerformers,
    bottomPerformers,
    averageScore,
    scoreDistribution,
    processingTimeMs,
  };
}

/**
 * Score singolo item
 */
export async function scoreSingleItem(
  item: PortfolioItemInput,
  triageResult?: TriageResult,
  config: Partial<ScoringConfig> = {}
): Promise<PriorityScore> {
  const result = await scoreItems([item], triageResult ? [triageResult] : undefined, config);
  return result.results[0] || {
    itemId: item.id,
    itemName: item.name,
    overallScore: 0,
    wsjfScore: 0,
    iceScore: 0,
    retentionIndex: 0,
    moscow: 'could_have',
    moscowRationale: 'Scoring non riuscito',
    confidence: 0,
    reasoning: [],
    recommendation: 'optimize',
  };
}

export default { scoreItems, scoreSingleItem };
