/**
 * Optimization Layer - Portfolio Optimization
 *
 * Ottimizza la selezione del portfolio con vincoli:
 * - Knapsack algorithm per budget constraint
 * - Greedy algorithm per selezione veloce
 * - Scenario generation per what-if analysis
 * - Diversification scoring
 */

import type {
  OptimizationConfig,
  OptimizationLayerResult,
} from './types';
import type {
  PriorityScore,
  OptimizationConstraints,
  OptimizedPortfolio,
  OptimizationScenario,
} from '../schemas/prioritizationSchema';

// === DEFAULT CONFIGURATION ===

export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  enabled: true,
  constraints: undefined,
  generateScenarios: true,
  scenarioCount: 3,
  algorithm: 'knapsack',
};

// === KNAPSACK ALGORITHM ===

interface KnapsackItem {
  index: number;
  value: number;
  cost: number;
  item: PriorityScore;
}

/**
 * 0/1 Knapsack con programmazione dinamica
 * Seleziona items massimizzando valore entro budget
 */
function knapsackDP(
  items: KnapsackItem[],
  budget: number
): KnapsackItem[] {
  const n = items.length;

  // Scala il budget a interi per DP
  const scale = 1000; // Precisione a 1000€
  const scaledBudget = Math.floor(budget / scale);

  if (scaledBudget <= 0 || n === 0) return [];

  // Limita dimensione per performance
  const maxDpSize = 10000;
  const adjustedBudget = Math.min(scaledBudget, maxDpSize);

  // Crea tabella DP
  // dp[i][w] = max value usando i primi 'i' items con budget 'w'
  const dp: number[][] = Array(n + 1).fill(null).map(() =>
    Array(adjustedBudget + 1).fill(0)
  );

  // Scala costi degli items
  const scaledItems = items.map(item => ({
    ...item,
    scaledCost: Math.ceil(item.cost / scale),
  }));

  // Fill DP table
  for (let i = 1; i <= n; i++) {
    const item = scaledItems[i - 1];
    for (let w = 0; w <= adjustedBudget; w++) {
      if (item.scaledCost <= w) {
        dp[i][w] = Math.max(
          dp[i - 1][w],
          dp[i - 1][w - item.scaledCost] + item.value
        );
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // Backtrack per trovare items selezionati
  const selected: KnapsackItem[] = [];
  let w = adjustedBudget;

  for (let i = n; i > 0 && w > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(items[i - 1]);
      w -= scaledItems[i - 1].scaledCost;
    }
  }

  return selected;
}

/**
 * Algoritmo greedy per selezione veloce
 * Ordina per rapporto value/cost e seleziona finché c'è budget
 */
function greedySelection(
  items: KnapsackItem[],
  budget: number
): KnapsackItem[] {
  // Ordina per rapporto value/cost (decrescente)
  const sorted = [...items].sort((a, b) => {
    const ratioA = a.cost > 0 ? a.value / a.cost : a.value;
    const ratioB = b.cost > 0 ? b.value / b.cost : b.value;
    return ratioB - ratioA;
  });

  const selected: KnapsackItem[] = [];
  let remainingBudget = budget;

  for (const item of sorted) {
    if (item.cost <= remainingBudget) {
      selected.push(item);
      remainingBudget -= item.cost;
    }
  }

  return selected;
}

// === CONSTRAINT HANDLING ===

/**
 * Forza inclusione dei MUST items
 */
function enforceMustHaveConstraint(
  items: PriorityScore[],
  selected: PriorityScore[]
): { selected: PriorityScore[]; violations: string[] } {
  const violations: string[] = [];
  const mustHaves = items.filter(i => i.moscow === 'must_have');
  const selectedIds = new Set(selected.map(s => s.itemId));

  for (const must of mustHaves) {
    if (!selectedIds.has(must.itemId)) {
      // Forza inclusione
      selected.push(must);
      selectedIds.add(must.itemId);
      violations.push(`Must-have "${must.itemName}" forzato nella selezione`);
    }
  }

  return { selected, violations };
}

/**
 * Controlla copertura categorie
 */
function checkCategoryCoverage(
  selected: PriorityScore[],
  allItems: PriorityScore[]
): Record<string, number> {
  const coverage: Record<string, number> = {};

  // Raggruppa per recommendation (come proxy per categoria)
  const byRecommendation: Record<string, number> = {};
  const selectedByRecommendation: Record<string, number> = {};

  for (const item of allItems) {
    byRecommendation[item.recommendation] = (byRecommendation[item.recommendation] || 0) + 1;
  }

  for (const item of selected) {
    selectedByRecommendation[item.recommendation] = (selectedByRecommendation[item.recommendation] || 0) + 1;
  }

  for (const rec of Object.keys(byRecommendation)) {
    coverage[rec] = byRecommendation[rec] > 0
      ? (selectedByRecommendation[rec] || 0) / byRecommendation[rec]
      : 0;
  }

  return coverage;
}

// === DIVERSIFICATION ===

/**
 * Calcola indice di diversificazione del portfolio
 * Basato su varietà di categorie, rischi, e moscow levels
 */
function calculateDiversificationIndex(selected: PriorityScore[]): number {
  if (selected.length === 0) return 0;
  if (selected.length === 1) return 0.5;

  // Diversità per moscow
  const moscowCounts: Record<string, number> = {};
  for (const item of selected) {
    moscowCounts[item.moscow] = (moscowCounts[item.moscow] || 0) + 1;
  }
  const moscowDiversity = Object.keys(moscowCounts).length / 4; // Max 4 categorie

  // Diversità per recommendation
  const recCounts: Record<string, number> = {};
  for (const item of selected) {
    recCounts[item.recommendation] = (recCounts[item.recommendation] || 0) + 1;
  }
  const recDiversity = Object.keys(recCounts).length / 4; // Max 4 recommendations

  // Diversità per score range
  const scores = selected.map(s => s.overallScore);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);
  const scoreSpread = scoreMax > scoreMin ? (scoreMax - scoreMin) / 100 : 0;

  // Media pesata
  return Number((
    moscowDiversity * 0.3 +
    recDiversity * 0.3 +
    scoreSpread * 0.2 +
    Math.min(1, selected.length / 10) * 0.2 // Bonus per numerosità
  ).toFixed(3));
}

// === SCENARIO GENERATION ===

/**
 * Genera scenari alternativi per what-if analysis
 */
function generateScenarios(
  items: PriorityScore[],
  selectedItems: PriorityScore[],
  constraints: OptimizationConstraints | undefined,
  count: number
): OptimizationScenario[] {
  const scenarios: OptimizationScenario[] = [];
  const budget = constraints?.totalBudget || 1000000;

  // Scenario 1: Conservative (solo must-have e should-have)
  const conservative = items.filter(i =>
    i.moscow === 'must_have' || i.moscow === 'should_have'
  );
  const conservativeCost = conservative.reduce((sum, i) =>
    sum + (i.breakdown?.estimated_cost || 50000), 0
  );
  const conservativeValue = conservative.reduce((sum, i) =>
    sum + i.overallScore, 0
  );

  scenarios.push({
    name: 'Conservative',
    description: 'Solo items Must-Have e Should-Have. Minimizza rischio.',
    selectedItems: conservative.map(i => i.itemId),
    totalValue: conservativeValue,
    totalCost: conservativeCost,
    riskScore: 0.3,
    coverage: checkCategoryCoverage(conservative, items),
  });

  // Scenario 2: Balanced (selezione corrente)
  const balancedCost = selectedItems.reduce((sum, i) =>
    sum + (i.breakdown?.estimated_cost || 50000), 0
  );
  const balancedValue = selectedItems.reduce((sum, i) =>
    sum + i.overallScore, 0
  );

  scenarios.push({
    name: 'Balanced',
    description: 'Bilanciamento ottimale value/cost. Raccomandato.',
    selectedItems: selectedItems.map(i => i.itemId),
    totalValue: balancedValue,
    totalCost: balancedCost,
    riskScore: 0.5,
    coverage: checkCategoryCoverage(selectedItems, items),
  });

  // Scenario 3: Aggressive (tutto entro budget)
  const sortedByValue = [...items].sort((a, b) => b.overallScore - a.overallScore);
  const aggressive: PriorityScore[] = [];
  let runningCost = 0;

  for (const item of sortedByValue) {
    const itemCost = item.breakdown?.estimated_cost || 50000;
    if (runningCost + itemCost <= budget) {
      aggressive.push(item);
      runningCost += itemCost;
    }
  }

  const aggressiveValue = aggressive.reduce((sum, i) => sum + i.overallScore, 0);

  scenarios.push({
    name: 'Aggressive',
    description: 'Massimizza valore totale. Più rischio.',
    selectedItems: aggressive.map(i => i.itemId),
    totalValue: aggressiveValue,
    totalCost: runningCost,
    riskScore: 0.8,
    coverage: checkCategoryCoverage(aggressive, items),
  });

  return scenarios.slice(0, count);
}

// === MAIN OPTIMIZATION FUNCTION ===

/**
 * Ottimizza selezione portfolio con vincoli
 *
 * @param scoredItems - Items con scores calcolati
 * @param constraints - Vincoli di ottimizzazione
 * @param config - Configurazione
 * @returns Portfolio ottimizzato con scenari
 */
export async function optimizePortfolio(
  scoredItems: PriorityScore[],
  constraints?: OptimizationConstraints,
  config: Partial<OptimizationConfig> = {}
): Promise<OptimizationLayerResult> {
  const startTime = Date.now();
  const mergedConfig: OptimizationConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  if (!mergedConfig.enabled || scoredItems.length === 0) {
    return {
      selectedItems: [],
      deferredItems: [],
      eliminationCandidates: [],
      metrics: {
        totalValue: 0,
        totalCost: 0,
        riskScore: 0,
        strategicCoverage: 0,
        diversificationIndex: 0,
      },
      processingTimeMs: 0,
      constraintsSatisfied: true,
    };
  }

  console.log(`[OptimizationLayer] Starting optimization for ${scoredItems.length} items`);

  const constraintViolations: string[] = [];

  // Prepara items per algoritmo
  const knapsackItems: KnapsackItem[] = scoredItems.map((item, index) => ({
    index,
    value: Math.round(item.overallScore * 100), // Scale per DP
    cost: item.breakdown?.estimated_cost || 50000,
    item,
  }));

  // Estrai vincoli
  const budget = constraints?.totalBudget || Number.MAX_SAFE_INTEGER;
  const maxItems = constraints?.maxItems || scoredItems.length;

  // Esegui algoritmo di selezione
  let selected: KnapsackItem[];

  if (mergedConfig.algorithm === 'greedy' || budget === Number.MAX_SAFE_INTEGER) {
    selected = greedySelection(knapsackItems, budget);
  } else {
    selected = knapsackDP(knapsackItems, budget);
  }

  // Limita a maxItems
  if (selected.length > maxItems) {
    selected = selected
      .sort((a, b) => b.value - a.value)
      .slice(0, maxItems);
  }

  // Converti a PriorityScore
  let selectedItems = selected.map(k => k.item);
  const selectedIds = new Set(selectedItems.map(s => s.itemId));

  // Enforza must-have constraint
  if (constraints?.minCoverage?.mustHave === 1.0) {
    const result = enforceMustHaveConstraint(scoredItems, selectedItems);
    selectedItems = result.selected;
    constraintViolations.push(...result.violations);
  }

  // Categorizza items rimanenti
  const deferredItems: PriorityScore[] = [];
  const eliminationCandidates: PriorityScore[] = [];

  for (const item of scoredItems) {
    if (!selectedIds.has(item.itemId)) {
      if (item.recommendation === 'eliminate' || item.moscow === 'wont_have') {
        eliminationCandidates.push(item);
      } else {
        deferredItems.push(item);
      }
    }
  }

  // Ordina deferred per priorità (per futura selezione)
  deferredItems.sort((a, b) => b.overallScore - a.overallScore);

  // Calcola metriche
  const totalValue = selectedItems.reduce((sum, i) => sum + i.overallScore, 0);
  const totalCost = selectedItems.reduce((sum, i) =>
    sum + (i.breakdown?.estimated_cost || 50000), 0
  );

  // Risk score basato su confidence media e retention
  const avgConfidence = selectedItems.length > 0
    ? selectedItems.reduce((sum, i) => sum + i.confidence, 0) / selectedItems.length
    : 0;
  const avgRetention = selectedItems.length > 0
    ? selectedItems.reduce((sum, i) => sum + i.retentionIndex, 0) / selectedItems.length
    : 0;
  const riskScore = Number((1 - (avgConfidence * 0.5 + avgRetention * 0.5)).toFixed(2));

  // Strategic coverage
  const mustHaveCount = scoredItems.filter(i => i.moscow === 'must_have').length;
  const selectedMustHave = selectedItems.filter(i => i.moscow === 'must_have').length;
  const strategicCoverage = mustHaveCount > 0 ? selectedMustHave / mustHaveCount : 1;

  // Diversification
  const diversificationIndex = calculateDiversificationIndex(selectedItems);

  // Genera scenari
  let scenarios: OptimizationScenario[] | undefined;
  if (mergedConfig.generateScenarios) {
    scenarios = generateScenarios(
      scoredItems,
      selectedItems,
      constraints,
      mergedConfig.scenarioCount
    );
  }

  // Verifica vincoli
  const constraintsSatisfied =
    totalCost <= budget &&
    selectedItems.length <= maxItems &&
    strategicCoverage >= (constraints?.minCoverage?.mustHave || 0);

  if (!constraintsSatisfied) {
    if (totalCost > budget) {
      constraintViolations.push(`Budget superato: ${totalCost} > ${budget}`);
    }
    if (strategicCoverage < (constraints?.minCoverage?.mustHave || 0)) {
      constraintViolations.push(`Copertura must-have insufficiente: ${(strategicCoverage * 100).toFixed(0)}%`);
    }
  }

  const processingTimeMs = Date.now() - startTime;

  console.log(`[OptimizationLayer] Completed in ${processingTimeMs}ms. Selected: ${selectedItems.length}, Deferred: ${deferredItems.length}, Eliminate: ${eliminationCandidates.length}`);

  return {
    selectedItems,
    deferredItems,
    eliminationCandidates,
    metrics: {
      totalValue,
      totalCost,
      riskScore,
      strategicCoverage,
      diversificationIndex,
    },
    scenarios,
    processingTimeMs,
    constraintsSatisfied,
    constraintViolations: constraintViolations.length > 0 ? constraintViolations : undefined,
  };
}

export default { optimizePortfolio };
