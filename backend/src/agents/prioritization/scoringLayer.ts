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
import type {
  ScoreFactor,
  ScoreBreakdown,
  AllScoreBreakdowns,
} from '../schemas/explainabilitySchema';
import {
  createEmptyScoreBreakdown,
  calculateOverallFromFactors,
  generateExplanationFromFactors,
} from '../schemas/explainabilitySchema';

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

// === EXPLAINABILITY GENERATION ===

/**
 * Generate detailed score breakdown for strategic fit dimension
 */
function generateStrategicFitBreakdown(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  retention: RetentionIndex
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const missingData: string[] = [];
  const assumptions: string[] = [];

  // Strategic Alignment Factor
  if (item.strategicAlignment !== undefined) {
    factors.push({
      factor: 'strategic_alignment',
      impact: (item.strategicAlignment - 5) * 4, // -20 to +20
      weight: 0.35,
      explanation: item.strategicAlignment >= 7
        ? `Alto allineamento strategico (${item.strategicAlignment}/10)`
        : item.strategicAlignment >= 4
        ? `Allineamento strategico medio (${item.strategicAlignment}/10)`
        : `Basso allineamento strategico (${item.strategicAlignment}/10)`,
      dataSource: 'portfolio_item',
      confidence: 0.9
    });
  } else {
    missingData.push('strategicAlignment');
    assumptions.push('Allineamento strategico stimato come medio (5/10)');
  }

  // Business Value Factor
  if (item.businessValue !== undefined) {
    factors.push({
      factor: 'business_value',
      impact: (wsjf.businessValue - 5) * 3, // -15 to +15
      weight: 0.30,
      explanation: wsjf.businessValue >= 7
        ? `Alto valore di business (${wsjf.businessValue}/10)`
        : `Valore di business nella media (${wsjf.businessValue}/10)`,
      dataSource: 'wsjf_calculation',
      confidence: 0.85
    });
  } else {
    missingData.push('businessValue');
  }

  // Lifecycle Factor
  if (item.lifecycle) {
    const lifecycleImpact = {
      'growth': 15,
      'mature': 5,
      'introduction': 10,
      'decline': -10,
      'end_of_life': -20
    };
    factors.push({
      factor: 'lifecycle_stage',
      impact: lifecycleImpact[item.lifecycle as keyof typeof lifecycleImpact] || 0,
      weight: 0.20,
      explanation: `Fase del ciclo di vita: ${item.lifecycle}`,
      dataSource: 'portfolio_item',
      confidence: 0.8
    });
  }

  // Competitive Position Factor
  factors.push({
    factor: 'competitive_position',
    impact: (retention.competitivePosition - 0.5) * 30, // -15 to +15
    weight: 0.15,
    explanation: retention.competitivePosition >= 0.7
      ? 'Posizione competitiva forte'
      : retention.competitivePosition >= 0.4
      ? 'Posizione competitiva media'
      : 'Posizione competitiva debole',
    dataSource: 'retention_index',
    confidence: 0.7
  });

  const value = calculateOverallFromFactors(factors, 50);
  const explanation = generateExplanationFromFactors(factors, 'Strategic Fit');

  return {
    value,
    factors,
    explanation,
    missingData,
    assumptions
  };
}

/**
 * Generate detailed score breakdown for value delivery dimension
 */
function generateValueDeliveryBreakdown(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  ice: ICEScore
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const missingData: string[] = [];
  const assumptions: string[] = [];

  // ROI Factor
  if (item.roi !== undefined) {
    factors.push({
      factor: 'roi',
      impact: Math.min(25, Math.max(-25, item.roi / 10)),
      weight: 0.30,
      explanation: item.roi >= 50
        ? `ROI elevato (${item.roi}%)`
        : item.roi >= 0
        ? `ROI positivo (${item.roi}%)`
        : `ROI negativo (${item.roi}%)`,
      dataSource: 'portfolio_item',
      confidence: 0.85
    });
  } else {
    missingData.push('roi');
  }

  // Impact Factor (from ICE)
  factors.push({
    factor: 'impact',
    impact: (ice.impact - 5) * 4,
    weight: 0.35,
    explanation: ice.impact >= 7
      ? `Impatto atteso elevato (${ice.impact}/10)`
      : `Impatto atteso nella media (${ice.impact}/10)`,
    dataSource: 'ice_calculation',
    confidence: 0.8
  });

  // Time to Value Factor
  if (item.timeToValue !== undefined) {
    const ttv = item.timeToValue;
    factors.push({
      factor: 'time_to_value',
      impact: ttv <= 3 ? 15 : ttv <= 6 ? 5 : ttv <= 12 ? -5 : -15,
      weight: 0.20,
      explanation: ttv <= 3
        ? `Valore rapido (${ttv} mesi)`
        : ttv <= 6
        ? `Valore a medio termine (${ttv} mesi)`
        : `Valore a lungo termine (${ttv} mesi)`,
      dataSource: 'portfolio_item',
      confidence: 0.75
    });
  } else {
    missingData.push('timeToValue');
    assumptions.push('Time to value stimato come medio (6-12 mesi)');
  }

  // Financial Impact (from Retention)
  factors.push({
    factor: 'financial_impact',
    impact: (wsjf.businessValue - 5) * 3,
    weight: 0.15,
    explanation: `Impatto finanziario basato sul valore di business`,
    dataSource: 'wsjf_calculation',
    confidence: 0.7
  });

  const value = calculateOverallFromFactors(factors, 50);
  const explanation = generateExplanationFromFactors(factors, 'Value Delivery');

  return {
    value,
    factors,
    explanation,
    missingData,
    assumptions
  };
}

/**
 * Generate detailed score breakdown for risk-adjusted return dimension
 */
function generateRiskAdjustedBreakdown(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  ice: ICEScore,
  retention: RetentionIndex
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const missingData: string[] = [];
  const assumptions: string[] = [];

  // Risk Level Factor
  const riskImpact: Record<string, number> = {
    'low': 20,
    'medium': 0,
    'high': -15,
    'critical': -30
  };
  factors.push({
    factor: 'risk_level',
    impact: riskImpact[item.riskLevel || 'medium'] || 0,
    weight: 0.40,
    explanation: item.riskLevel === 'low'
      ? 'Basso rischio di implementazione'
      : item.riskLevel === 'critical'
      ? 'Rischio critico - richiede mitigazione'
      : `Livello di rischio: ${item.riskLevel || 'medium'}`,
    dataSource: 'portfolio_item',
    confidence: item.riskLevel ? 0.85 : 0.5
  });

  if (!item.riskLevel) {
    missingData.push('riskLevel');
    assumptions.push('Livello di rischio stimato come medio');
  }

  // Confidence Factor (from ICE)
  factors.push({
    factor: 'estimate_confidence',
    impact: (ice.confidence - 5) * 3,
    weight: 0.25,
    explanation: ice.confidence >= 7
      ? `Alta confidenza nelle stime (${ice.confidence}/10)`
      : `Confidenza nelle stime nella media (${ice.confidence}/10)`,
    dataSource: 'ice_calculation',
    confidence: 0.75
  });

  // Risk Reduction/Opportunity Factor (from WSJF)
  factors.push({
    factor: 'risk_reduction_opportunity',
    impact: (wsjf.riskReduction - 5) * 2.5,
    weight: 0.20,
    explanation: wsjf.riskReduction >= 7
      ? 'Alto potenziale di riduzione rischi'
      : 'Potenziale di riduzione rischi nella media',
    dataSource: 'wsjf_calculation',
    confidence: 0.7
  });

  // Dependencies Factor
  const depCount = item.dependencies?.length || 0;
  factors.push({
    factor: 'dependencies',
    impact: depCount === 0 ? 10 : depCount <= 2 ? 0 : depCount <= 4 ? -10 : -20,
    weight: 0.15,
    explanation: depCount === 0
      ? 'Nessuna dipendenza - implementazione indipendente'
      : `${depCount} dipendenze identificate`,
    dataSource: 'portfolio_item',
    confidence: 0.8
  });

  const value = calculateOverallFromFactors(factors, 50);
  const explanation = generateExplanationFromFactors(factors, 'Risk-Adjusted Return');

  return {
    value,
    factors,
    explanation,
    missingData,
    assumptions
  };
}

/**
 * Generate detailed score breakdown for resource efficiency dimension
 */
function generateResourceEfficiencyBreakdown(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  ice: ICEScore,
  retention: RetentionIndex
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const missingData: string[] = [];
  const assumptions: string[] = [];

  // Job Size Factor (from WSJF - inverse)
  factors.push({
    factor: 'job_size',
    impact: (5 - wsjf.jobSize) * 3, // Smaller is better
    weight: 0.30,
    explanation: wsjf.jobSize <= 3
      ? 'Effort contenuto - rapida implementazione'
      : wsjf.jobSize <= 6
      ? 'Effort medio'
      : 'Effort elevato - richiede risorse significative',
    dataSource: 'wsjf_calculation',
    confidence: 0.8
  });

  // Ease of Implementation Factor (from ICE)
  factors.push({
    factor: 'ease_of_implementation',
    impact: (ice.ease - 5) * 3,
    weight: 0.25,
    explanation: ice.ease >= 7
      ? `Implementazione facilitata (${ice.ease}/10)`
      : `Complessità di implementazione media (${ice.ease}/10)`,
    dataSource: 'ice_calculation',
    confidence: 0.75
  });

  // Complexity Factor
  const complexityImpact: Record<string, number> = {
    'low': 15,
    'medium': 0,
    'high': -20
  };
  factors.push({
    factor: 'complexity',
    impact: complexityImpact[item.complexity || 'medium'] || 0,
    weight: 0.25,
    explanation: `Complessità: ${item.complexity || 'medium'}`,
    dataSource: 'portfolio_item',
    confidence: item.complexity ? 0.85 : 0.5
  });

  if (!item.complexity) {
    missingData.push('complexity');
    assumptions.push('Complessità stimata come media');
  }

  // Resource Requirements Factor (from Retention)
  factors.push({
    factor: 'resource_requirements',
    impact: (retention.resourceRequirements - 0.5) * 30,
    weight: 0.20,
    explanation: retention.resourceRequirements >= 0.7
      ? 'Basso fabbisogno di risorse'
      : 'Fabbisogno di risorse nella media',
    dataSource: 'retention_index',
    confidence: 0.7
  });

  const value = calculateOverallFromFactors(factors, 50);
  const explanation = generateExplanationFromFactors(factors, 'Resource Efficiency');

  return {
    value,
    factors,
    explanation,
    missingData,
    assumptions
  };
}

/**
 * Generate detailed score breakdown for market timing dimension
 */
function generateMarketTimingBreakdown(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  triageResult?: TriageResult
): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  const missingData: string[] = [];
  const assumptions: string[] = [];

  // Time Criticality Factor (from WSJF)
  factors.push({
    factor: 'time_criticality',
    impact: (wsjf.timeCriticality - 5) * 4,
    weight: 0.40,
    explanation: wsjf.timeCriticality >= 8
      ? 'Timing critico - finestra di opportunità limitata'
      : wsjf.timeCriticality >= 5
      ? 'Timing importante ma flessibile'
      : 'Bassa urgenza temporale',
    dataSource: 'wsjf_calculation',
    confidence: 0.8
  });

  // Triage Category Factor
  if (triageResult) {
    const triageImpact: Record<string, number> = {
      'MUST': 25,
      'SHOULD': 10,
      'COULD': -5,
      'WONT': -25
    };
    factors.push({
      factor: 'triage_priority',
      impact: triageImpact[triageResult.category] || 0,
      weight: 0.30,
      explanation: `Triage: ${triageResult.category} (confidenza ${Math.round(triageResult.confidence * 100)}%)`,
      dataSource: 'triage_result',
      confidence: triageResult.confidence
    });
  } else {
    assumptions.push('Nessun risultato di triage disponibile');
  }

  // Market Potential Factor
  if (item.lifecycle) {
    const marketPotential: Record<string, number> = {
      'introduction': 15,
      'growth': 20,
      'mature': 0,
      'decline': -15,
      'end_of_life': -25
    };
    factors.push({
      factor: 'market_potential',
      impact: marketPotential[item.lifecycle] || 0,
      weight: 0.30,
      explanation: `Potenziale di mercato basato sulla fase: ${item.lifecycle}`,
      dataSource: 'portfolio_item',
      confidence: 0.75
    });
  } else {
    missingData.push('lifecycle');
    assumptions.push('Fase di mercato non specificata');
  }

  const value = calculateOverallFromFactors(factors, 50);
  const explanation = generateExplanationFromFactors(factors, 'Market Timing');

  return {
    value,
    factors,
    explanation,
    missingData,
    assumptions
  };
}

/**
 * Generate complete score breakdowns for all dimensions
 */
export function generateAllScoreBreakdowns(
  item: PortfolioItemInput,
  wsjf: WSJFScore,
  ice: ICEScore,
  retention: RetentionIndex,
  triageResult?: TriageResult
): AllScoreBreakdowns {
  return {
    strategicFit: generateStrategicFitBreakdown(item, wsjf, retention),
    valueDelivery: generateValueDeliveryBreakdown(item, wsjf, ice),
    riskAdjustedReturn: generateRiskAdjustedBreakdown(item, wsjf, ice, retention),
    resourceEfficiency: generateResourceEfficiencyBreakdown(item, wsjf, ice, retention),
    marketTiming: generateMarketTimingBreakdown(item, wsjf, triageResult)
  };
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

    // Generate detailed score breakdowns for explainability
    const scoreBreakdowns = generateAllScoreBreakdowns(item, wsjf, ice, retention, triageResult);

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
      scoreBreakdowns, // Detailed explainability breakdowns
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

export default { scoreItems, scoreSingleItem, generateAllScoreBreakdowns };
