/**
 * Learning Layer - Continuous Learning from Feedback
 *
 * Funzionalità:
 * - Registrazione correzioni utente
 * - Pattern mining dalle correzioni
 * - Applicazione pattern appresi agli scoring futuri
 * - Decadimento pattern non utilizzati
 */

import { supabase } from '../../config/supabase';
import type {
  LearningConfig,
  PatternCondition,
  PatternAdjustment,
  LearningStats,
} from './types';
import type {
  FeedbackEvent,
  LearnedPattern,
  PriorityScore,
} from '../schemas/prioritizationSchema';

// === DEFAULT CONFIGURATION ===

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  minPatternsForLearning: 5,
  confidenceThreshold: 0.7,
  patternDecayDays: 90,
};

// === FEEDBACK RECORDING ===

/**
 * Registra una correzione utente
 */
export async function recordFeedback(
  feedback: FeedbackEvent
): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
  try {
    console.log(`[LearningLayer] Recording feedback for item ${feedback.itemId}`);

    // Determina tipo di correzione
    let correctionType = 'unknown';
    if (feedback.userCorrection.newCategory && feedback.originalCategory !== feedback.userCorrection.newCategory) {
      correctionType = 'category';
    } else if (feedback.userCorrection.newScore && feedback.originalScore !== feedback.userCorrection.newScore) {
      correctionType = 'score';
    } else if (feedback.userCorrection.newCategory || feedback.userCorrection.newScore) {
      correctionType = 'multiple';
    }

    const { data, error } = await supabase
      .from('prioritization_feedback')
      .insert({
        tenant_id: feedback.tenantId,
        prioritization_id: feedback.prioritizationId,
        item_id: feedback.itemId,
        original_category: feedback.originalCategory,
        original_score: feedback.originalScore,
        user_category: feedback.userCorrection.newCategory,
        user_score: feedback.userCorrection.newScore,
        user_reasoning: feedback.userCorrection.reasoning,
        correction_type: correctionType,
        item_features: feedback.itemFeatures || {},
        user_id: feedback.userId,
        source: 'ui',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[LearningLayer] Error recording feedback:', error);
      return { success: false, error: error.message };
    }

    // Trigger pattern mining se abbiamo abbastanza feedback
    await checkAndTriggerLearning(feedback.tenantId);

    return { success: true, feedbackId: data?.id };
  } catch (err) {
    console.error('[LearningLayer] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Controlla se è il momento di eseguire pattern mining
 */
async function checkAndTriggerLearning(
  tenantId: string,
  config: LearningConfig = DEFAULT_LEARNING_CONFIG
): Promise<void> {
  try {
    // Conta feedback recenti non processati
    const { count } = await supabase
      .from('prioritization_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24h

    if (count && count >= config.minPatternsForLearning) {
      console.log(`[LearningLayer] Triggering pattern mining for tenant ${tenantId}`);
      await minePatterns(tenantId, config);
    }
  } catch (err) {
    console.warn('[LearningLayer] Error checking learning trigger:', err);
  }
}

// === PATTERN MINING ===

/**
 * Estrae pattern comuni dalle correzioni utente
 */
export async function minePatterns(
  tenantId: string,
  config: LearningConfig = DEFAULT_LEARNING_CONFIG
): Promise<{ patternsCreated: number; patternsUpdated: number }> {
  console.log(`[LearningLayer] Mining patterns for tenant ${tenantId}`);

  let patternsCreated = 0;
  let patternsUpdated = 0;

  try {
    // Carica feedback recenti
    const { data: feedback, error } = await supabase
      .from('prioritization_feedback')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !feedback || feedback.length < config.minPatternsForLearning) {
      return { patternsCreated: 0, patternsUpdated: 0 };
    }

    // Raggruppa per tipo di correzione
    const categoryCorrections = feedback.filter(f => f.correction_type === 'category');
    const scoreCorrections = feedback.filter(f => f.correction_type === 'score');

    // Pattern: Correzioni categoria frequenti
    const categoryPatterns = await mineCateggoryCorrectionPatterns(
      categoryCorrections,
      tenantId,
      config
    );
    patternsCreated += categoryPatterns.created;
    patternsUpdated += categoryPatterns.updated;

    // Pattern: Correzioni score basate su features
    const scorePatterns = await mineScoreCorrectionPatterns(
      scoreCorrections,
      tenantId,
      config
    );
    patternsCreated += scorePatterns.created;
    patternsUpdated += scorePatterns.updated;

    console.log(`[LearningLayer] Pattern mining complete: ${patternsCreated} created, ${patternsUpdated} updated`);

    return { patternsCreated, patternsUpdated };
  } catch (err) {
    console.error('[LearningLayer] Error mining patterns:', err);
    return { patternsCreated: 0, patternsUpdated: 0 };
  }
}

/**
 * Mine pattern da correzioni categoria
 */
async function mineCateggoryCorrectionPatterns(
  corrections: Array<{
    original_category: string;
    user_category: string;
    item_features: Record<string, unknown>;
  }>,
  tenantId: string,
  config: LearningConfig
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  // Raggruppa correzioni per (original -> user) transition
  const transitionGroups: Record<string, typeof corrections> = {};

  for (const c of corrections) {
    const key = `${c.original_category}->${c.user_category}`;
    if (!transitionGroups[key]) {
      transitionGroups[key] = [];
    }
    transitionGroups[key].push(c);
  }

  // Per ogni gruppo con abbastanza supporto, cerca pattern comuni
  for (const [transition, group] of Object.entries(transitionGroups)) {
    if (group.length < config.minPatternsForLearning) continue;

    const [originalCat, userCat] = transition.split('->');

    // Cerca feature comuni
    const commonFeatures = findCommonFeatures(group.map(g => g.item_features));

    if (commonFeatures.length > 0) {
      // Crea/aggiorna pattern
      const conditions: PatternCondition[] = commonFeatures.map(f => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
      }));

      const adjustment: PatternAdjustment = {
        type: 'override',
        target: 'category',
        value: userCat,
      };

      const result = await upsertPattern(
        tenantId,
        `category_${originalCat}_to_${userCat}`,
        conditions,
        adjustment,
        group.length / corrections.length,
        group.length
      );

      if (result.created) created++;
      if (result.updated) updated++;
    }
  }

  return { created, updated };
}

/**
 * Mine pattern da correzioni score
 */
async function mineScoreCorrectionPatterns(
  corrections: Array<{
    original_score: number;
    user_score: number;
    item_features: Record<string, unknown>;
  }>,
  tenantId: string,
  config: LearningConfig
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  // Raggruppa per direzione della correzione
  const upCorrections = corrections.filter(c => c.user_score > c.original_score);
  const downCorrections = corrections.filter(c => c.user_score < c.original_score);

  // Pattern per correzioni verso l'alto
  if (upCorrections.length >= config.minPatternsForLearning) {
    const commonFeatures = findCommonFeatures(upCorrections.map(c => c.item_features));

    if (commonFeatures.length > 0) {
      const avgBoost = upCorrections.reduce((sum, c) =>
        sum + (c.user_score - c.original_score), 0
      ) / upCorrections.length;

      const result = await upsertPattern(
        tenantId,
        'score_boost_pattern',
        commonFeatures,
        { type: 'add', target: 'overall', value: Math.round(avgBoost) },
        upCorrections.length / corrections.length,
        upCorrections.length
      );

      if (result.created) created++;
      if (result.updated) updated++;
    }
  }

  // Pattern per correzioni verso il basso
  if (downCorrections.length >= config.minPatternsForLearning) {
    const commonFeatures = findCommonFeatures(downCorrections.map(c => c.item_features));

    if (commonFeatures.length > 0) {
      const avgPenalty = downCorrections.reduce((sum, c) =>
        sum + (c.original_score - c.user_score), 0
      ) / downCorrections.length;

      const result = await upsertPattern(
        tenantId,
        'score_penalty_pattern',
        commonFeatures,
        { type: 'add', target: 'overall', value: -Math.round(avgPenalty) },
        downCorrections.length / corrections.length,
        downCorrections.length
      );

      if (result.created) created++;
      if (result.updated) updated++;
    }
  }

  return { created, updated };
}

/**
 * Trova feature comuni in un set di item features
 */
function findCommonFeatures(
  featureSets: Array<Record<string, unknown>>
): PatternCondition[] {
  if (featureSets.length === 0) return [];

  const result: PatternCondition[] = [];
  const firstSet = featureSets[0];

  // Per ogni feature nel primo set
  for (const [field, value] of Object.entries(firstSet)) {
    if (value === null || value === undefined) continue;

    // Conta quante volte appare lo stesso valore
    let matchCount = 0;
    for (const fs of featureSets) {
      if (JSON.stringify(fs[field]) === JSON.stringify(value)) {
        matchCount++;
      }
    }

    // Se appare in > 70% dei casi, è un pattern
    if (matchCount / featureSets.length >= 0.7) {
      result.push({
        field,
        operator: 'eq',
        value,
      });
    }
  }

  return result;
}

/**
 * Inserisce o aggiorna un pattern
 */
async function upsertPattern(
  tenantId: string,
  patternName: string,
  conditions: PatternCondition[],
  adjustment: PatternAdjustment,
  confidence: number,
  supportCount: number
): Promise<{ created: boolean; updated: boolean }> {
  try {
    // Cerca pattern esistente con stesse condizioni
    const { data: existing } = await supabase
      .from('learned_prioritization_patterns')
      .select('id, support_count')
      .eq('tenant_id', tenantId)
      .eq('pattern_name', patternName)
      .single();

    if (existing) {
      // Aggiorna pattern esistente
      await supabase
        .from('learned_prioritization_patterns')
        .update({
          pattern_conditions: conditions,
          score_adjustment: adjustment,
          confidence: Math.min(1, confidence),
          support_count: existing.support_count + supportCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      return { created: false, updated: true };
    } else {
      // Crea nuovo pattern
      await supabase
        .from('learned_prioritization_patterns')
        .insert({
          tenant_id: tenantId,
          pattern_name: patternName,
          pattern_conditions: conditions,
          score_adjustment: adjustment,
          confidence: Math.min(1, confidence),
          support_count: supportCount,
          active: true,
          auto_generated: true,
        });

      return { created: true, updated: false };
    }
  } catch (err) {
    console.error('[LearningLayer] Error upserting pattern:', err);
    return { created: false, updated: false };
  }
}

// === PATTERN APPLICATION ===

/**
 * Carica pattern attivi per un tenant
 */
export async function getActivePatterns(
  tenantId: string
): Promise<LearnedPattern[]> {
  try {
    const { data, error } = await supabase
      .from('learned_prioritization_patterns')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .gte('confidence', DEFAULT_LEARNING_CONFIG.confidenceThreshold)
      .order('confidence', { ascending: false });

    if (error) {
      console.warn('[LearningLayer] Error loading patterns:', error);
      return [];
    }

    return (data || []).map(p => ({
      id: p.id,
      tenantId: p.tenant_id,
      pattern: {
        conditions: p.pattern_conditions,
        adjustment: p.score_adjustment,
      },
      confidence: p.confidence,
      supportCount: p.support_count,
      active: p.active,
      createdAt: p.created_at,
      lastTriggeredAt: p.last_triggered_at,
    }));
  } catch (err) {
    console.error('[LearningLayer] Error:', err);
    return [];
  }
}

/**
 * Applica pattern appresi a uno score
 */
export async function applyPatterns(
  score: PriorityScore,
  itemFeatures: Record<string, unknown>,
  tenantId: string
): Promise<{ adjustedScore: PriorityScore; patternsApplied: string[] }> {
  const patternsApplied: string[] = [];
  let adjustedScore = { ...score };

  try {
    const patterns = await getActivePatterns(tenantId);

    for (const pattern of patterns) {
      // Verifica se tutte le condizioni matchano
      const matches = pattern.pattern.conditions.every(cond =>
        evaluateCondition(itemFeatures, cond)
      );

      if (matches) {
        // Applica adjustment
        adjustedScore = applyAdjustment(adjustedScore, pattern.pattern.adjustment);
        patternsApplied.push(pattern.id);

        // Aggiorna last_triggered_at
        await supabase
          .from('learned_prioritization_patterns')
          .update({
            last_triggered_at: new Date().toISOString(),
            hit_count: (await supabase
              .from('learned_prioritization_patterns')
              .select('hit_count')
              .eq('id', pattern.id)
              .single()
            ).data?.hit_count || 0 + 1,
          })
          .eq('id', pattern.id);
      }
    }
  } catch (err) {
    console.warn('[LearningLayer] Error applying patterns:', err);
  }

  return { adjustedScore, patternsApplied };
}

/**
 * Valuta una condizione su un set di features
 */
function evaluateCondition(
  features: Record<string, unknown>,
  condition: PatternCondition
): boolean {
  const value = features[condition.field];

  switch (condition.operator) {
    case 'eq':
      return JSON.stringify(value) === JSON.stringify(condition.value);
    case 'ne':
      return JSON.stringify(value) !== JSON.stringify(condition.value);
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
    default:
      return false;
  }
}

/**
 * Applica un adjustment a uno score
 */
function applyAdjustment(
  score: PriorityScore,
  adjustment: PatternAdjustment
): PriorityScore {
  const result = { ...score };

  switch (adjustment.type) {
    case 'multiply':
      if (adjustment.target === 'overall') {
        result.overallScore = Math.min(100, result.overallScore * (adjustment.value as number));
      }
      break;

    case 'add':
      if (adjustment.target === 'overall') {
        result.overallScore = Math.max(0, Math.min(100, result.overallScore + (adjustment.value as number)));
      }
      break;

    case 'override':
      if (adjustment.target === 'category') {
        // Override MoSCoW category
        const newMoscow = adjustment.value as string;
        if (['must_have', 'should_have', 'could_have', 'wont_have'].includes(newMoscow)) {
          result.moscow = newMoscow as typeof result.moscow;
          result.moscowRationale = `Pattern-based override to ${newMoscow}`;
        }
      }
      break;
  }

  return result;
}

// === PATTERN DECAY ===

/**
 * Disattiva pattern non utilizzati da troppo tempo
 */
export async function decayOldPatterns(
  tenantId: string,
  config: LearningConfig = DEFAULT_LEARNING_CONFIG
): Promise<number> {
  try {
    const decayDate = new Date(
      Date.now() - config.patternDecayDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('learned_prioritization_patterns')
      .update({ active: false })
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .lt('last_triggered_at', decayDate)
      .select('id');

    if (error) {
      console.warn('[LearningLayer] Error decaying patterns:', error);
      return 0;
    }

    console.log(`[LearningLayer] Deactivated ${data?.length || 0} old patterns`);
    return data?.length || 0;
  } catch (err) {
    console.error('[LearningLayer] Error:', err);
    return 0;
  }
}

// === STATISTICS ===

/**
 * Ottieni statistiche learning per un tenant
 */
export async function getLearningStats(
  tenantId: string
): Promise<LearningStats> {
  try {
    const [feedbackResult, activeResult, inactiveResult] = await Promise.all([
      supabase
        .from('prioritization_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('learned_prioritization_patterns')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('active', true),
      supabase
        .from('learned_prioritization_patterns')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('active', false),
    ]);

    return {
      totalFeedback: feedbackResult.count || 0,
      patternsActive: activeResult.count || 0,
      patternsInactive: inactiveResult.count || 0,
      accuracyImprovement: 0, // TODO: calculate from hit rate vs corrections
      lastLearningRun: undefined,
    };
  } catch (err) {
    console.error('[LearningLayer] Error getting stats:', err);
    return {
      totalFeedback: 0,
      patternsActive: 0,
      patternsInactive: 0,
      accuracyImprovement: 0,
    };
  }
}

export default {
  recordFeedback,
  minePatterns,
  getActivePatterns,
  applyPatterns,
  decayOldPatterns,
  getLearningStats,
};
