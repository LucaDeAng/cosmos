/**
 * Learning Service
 *
 * Implements continuous learning from user corrections to AI extractions.
 * Tracks corrections, detects patterns, and applies learned transformations
 * to improve extraction accuracy over time.
 */

import { supabase } from '../config/supabase';

// Fields that can be learned from corrections
const LEARNABLE_FIELDS = [
  'type',
  'category',
  'subcategory',
  'status',
  'priority',
  'owner',
  'pricing_model',
  'lifecycle_stage',
  'target_segment',
  'delivery_model',
  'riskLevel',
  'complexity',
  'strategic_importance',
] as const;

type LearnableField = typeof LEARNABLE_FIELDS[number];

// Field correction structure
interface FieldCorrection {
  field: string;
  from: string | null;
  to: string | null;
}

// Learned rule structure
interface LearnedRule {
  id: string;
  tenant_id: string;
  field_name: string;
  from_value: string;
  to_value: string;
  confidence: number;
  occurrence_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Correction record structure
interface CorrectionRecord {
  id: string;
  tenant_id: string;
  original_extraction: Record<string, unknown>;
  corrected_item: Record<string, unknown>;
  field_corrections: FieldCorrection[];
  source_type?: string;
  extraction_context?: Record<string, unknown>;
  created_at: string;
}

// Learning threshold - trigger learning after this many corrections
const LEARNING_THRESHOLD = 50;

// Minimum occurrences for a pattern to become a rule
const MIN_PATTERN_OCCURRENCES = 3;

// Confidence thresholds
const AUTO_APPLY_CONFIDENCE = 0.7;
const INITIAL_RULE_CONFIDENCE = 0.5;

/**
 * LearningService class
 * Manages continuous learning from user corrections
 */
export class LearningService {

  /**
   * Record a user correction for learning
   * Saves the correction and checks if learning should be triggered
   */
  async recordCorrection(
    tenantId: string,
    originalItem: Record<string, unknown>,
    correctedItem: Record<string, unknown>,
    sourceType?: string,
    extractionContext?: Record<string, unknown>
  ): Promise<{ correctionId: string; fieldsChanged: number; learningTriggered: boolean }> {
    try {
      console.log(`📝 Recording correction for tenant ${tenantId}...`);

      // Detect field-level corrections
      const fieldCorrections = this.detectCorrections(originalItem, correctedItem);

      // Skip if no corrections detected
      if (fieldCorrections.length === 0) {
        console.log(`   ℹ️  No corrections detected, skipping`);
        return { correctionId: '', fieldsChanged: 0, learningTriggered: false };
      }

      console.log(`   📊 Detected ${fieldCorrections.length} field corrections:`);
      for (const fc of fieldCorrections) {
        console.log(`      - ${fc.field}: "${fc.from}" → "${fc.to}"`);
      }

      // Save correction to database
      const { data, error } = await supabase
        .from('ingestion_corrections')
        .insert({
          tenant_id: tenantId,
          original_extraction: originalItem,
          corrected_item: correctedItem,
          field_corrections: fieldCorrections,
          source_type: sourceType,
          extraction_context: extractionContext,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`   ❌ Error saving correction:`, error);
        throw error;
      }

      const correctionId = data?.id || '';
      console.log(`   ✅ Correction saved: ${correctionId}`);

      // Check if we should trigger learning
      const learningTriggered = await this.checkLearningThreshold(tenantId);

      return {
        correctionId,
        fieldsChanged: fieldCorrections.length,
        learningTriggered,
      };

    } catch (error) {
      console.error(`❌ Error recording correction:`, error);
      // Don't throw - learning failures shouldn't break the main flow
      return { correctionId: '', fieldsChanged: 0, learningTriggered: false };
    }
  }

  /**
   * Detect field-level corrections between original and corrected items
   */
  detectCorrections(
    original: Record<string, unknown>,
    corrected: Record<string, unknown>
  ): FieldCorrection[] {
    const corrections: FieldCorrection[] = [];

    for (const field of LEARNABLE_FIELDS) {
      const originalValue = this.normalizeValue(original[field]);
      const correctedValue = this.normalizeValue(corrected[field]);

      // Skip if both are empty
      if (!originalValue && !correctedValue) continue;

      // Skip if values are the same
      if (originalValue === correctedValue) continue;

      // Record the correction
      corrections.push({
        field,
        from: originalValue,
        to: correctedValue,
      });
    }

    return corrections;
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim().toLowerCase() || null;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  /**
   * Check if learning threshold is reached and trigger learning if needed
   */
  async checkLearningThreshold(tenantId: string): Promise<boolean> {
    try {
      // Count recent corrections (since last learning)
      const { count, error } = await supabase
        .from('ingestion_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      if (error) {
        console.error(`❌ Error checking learning threshold:`, error);
        return false;
      }

      const correctionCount = count || 0;
      console.log(`   🎓 Correction count: ${correctionCount}/${LEARNING_THRESHOLD}`);

      // Check if threshold reached (every 50 corrections)
      if (correctionCount > 0 && correctionCount % LEARNING_THRESHOLD === 0) {
        console.log(`   🚀 Learning threshold reached! Triggering learning...`);
        await this.applyLearnings(tenantId);
        return true;
      }

      return false;

    } catch (error) {
      console.error(`❌ Error in checkLearningThreshold:`, error);
      return false;
    }
  }

  /**
   * Apply learnings from corrections to create/update transformation rules
   */
  async applyLearnings(tenantId: string): Promise<{
    rulesCreated: number;
    rulesUpdated: number;
  }> {
    console.log(`\n🎓 Applying learnings for tenant ${tenantId}...`);

    try {
      // Query all field corrections from recent corrections
      const { data: corrections, error } = await supabase
        .from('ingestion_corrections')
        .select('field_corrections')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500); // Analyze last 500 corrections

      if (error) {
        console.error(`   ❌ Error fetching corrections:`, error);
        throw error;
      }

      if (!corrections || corrections.length === 0) {
        console.log(`   ℹ️  No corrections found to learn from`);
        return { rulesCreated: 0, rulesUpdated: 0 };
      }

      // Count pattern occurrences
      const patternCounts: Map<string, { from: string; to: string; count: number }> = new Map();

      for (const correction of corrections) {
        const fieldCorrections = correction.field_corrections as FieldCorrection[];
        if (!Array.isArray(fieldCorrections)) continue;

        for (const fc of fieldCorrections) {
          if (!fc.field || !fc.from || !fc.to) continue;

          const key = `${fc.field}::${fc.from}`;
          const existing = patternCounts.get(key);

          if (existing) {
            // Only count if same "to" value (consistent correction)
            if (existing.to === fc.to) {
              existing.count++;
            }
          } else {
            patternCounts.set(key, { from: fc.from, to: fc.to, count: 1 });
          }
        }
      }

      console.log(`   📊 Found ${patternCounts.size} unique correction patterns`);

      // Filter patterns with enough occurrences
      const significantPatterns = Array.from(patternCounts.entries())
        .filter(([_, data]) => data.count >= MIN_PATTERN_OCCURRENCES);

      console.log(`   ✨ ${significantPatterns.length} patterns with >= ${MIN_PATTERN_OCCURRENCES} occurrences`);

      let rulesCreated = 0;
      let rulesUpdated = 0;

      // Create/update rules for significant patterns
      for (const [key, data] of significantPatterns) {
        const [fieldName] = key.split('::');

        // Calculate confidence based on occurrence count
        // More occurrences = higher confidence, capped at 0.95
        const confidence = Math.min(0.95, INITIAL_RULE_CONFIDENCE + (data.count * 0.05));

        // Upsert rule
        const { data: existingRule } = await supabase
          .from('learned_transformation_rules')
          .select('id, occurrence_count')
          .eq('tenant_id', tenantId)
          .eq('field_name', fieldName)
          .eq('from_value', data.from)
          .single();

        if (existingRule) {
          // Update existing rule
          await supabase
            .from('learned_transformation_rules')
            .update({
              to_value: data.to,
              confidence,
              occurrence_count: data.count,
              is_active: true,
            })
            .eq('id', existingRule.id);

          rulesUpdated++;
          console.log(`   🔄 Updated rule: ${fieldName} "${data.from}" → "${data.to}" (${data.count}x, conf: ${confidence.toFixed(2)})`);
        } else {
          // Create new rule
          await supabase
            .from('learned_transformation_rules')
            .insert({
              tenant_id: tenantId,
              field_name: fieldName,
              from_value: data.from,
              to_value: data.to,
              confidence,
              occurrence_count: data.count,
              is_active: true,
            });

          rulesCreated++;
          console.log(`   ✅ Created rule: ${fieldName} "${data.from}" → "${data.to}" (${data.count}x, conf: ${confidence.toFixed(2)})`);
        }
      }

      console.log(`\n   🎓 Learning complete: ${rulesCreated} created, ${rulesUpdated} updated`);

      return { rulesCreated, rulesUpdated };

    } catch (error) {
      console.error(`❌ Error applying learnings:`, error);
      return { rulesCreated: 0, rulesUpdated: 0 };
    }
  }

  /**
   * Get all active learned rules for a tenant
   */
  async getLearnedRules(tenantId: string): Promise<LearnedRule[]> {
    try {
      const { data, error } = await supabase
        .from('learned_transformation_rules')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('confidence', { ascending: false });

      if (error) {
        console.error(`❌ Error fetching learned rules:`, error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error(`❌ Error in getLearnedRules:`, error);
      return [];
    }
  }

  /**
   * Apply learned transformation rules to items
   * Only applies rules with confidence > AUTO_APPLY_CONFIDENCE
   */
  async applyLearnedRules<T extends Record<string, unknown>>(
    tenantId: string,
    items: T[]
  ): Promise<{ items: T[]; rulesApplied: number; transformations: string[] }> {
    const transformations: string[] = [];
    let rulesApplied = 0;

    try {
      // Get active rules with high confidence
      const rules = await this.getLearnedRules(tenantId);
      const applicableRules = rules.filter(r => r.confidence > AUTO_APPLY_CONFIDENCE);

      if (applicableRules.length === 0) {
        return { items, rulesApplied: 0, transformations: [] };
      }

      console.log(`\n🎓 Applying ${applicableRules.length} learned rules to ${items.length} items...`);

      // Apply rules to each item
      for (const item of items) {
        for (const rule of applicableRules) {
          const fieldValue = this.normalizeValue(item[rule.field_name]);

          if (fieldValue === rule.from_value.toLowerCase()) {
            // Apply transformation
            const originalValue = item[rule.field_name];
            (item as Record<string, unknown>)[rule.field_name] = rule.to_value;

            // Add note about applied rule
            const notes = (item as Record<string, unknown>).normalizationNotes as string[] || [];
            notes.push(`🎓 Applied learned rule: ${rule.field_name} "${originalValue}" → "${rule.to_value}"`);
            (item as Record<string, unknown>).normalizationNotes = notes;

            rulesApplied++;
            transformations.push(`${rule.field_name}: "${originalValue}" → "${rule.to_value}"`);

            console.log(`   ✓ Applied: ${rule.field_name} "${originalValue}" → "${rule.to_value}" (conf: ${rule.confidence.toFixed(2)})`);
          }
        }
      }

      console.log(`   ✅ Applied ${rulesApplied} transformations`);

      return { items, rulesApplied, transformations };

    } catch (error) {
      console.error(`❌ Error applying learned rules:`, error);
      return { items, rulesApplied: 0, transformations: [] };
    }
  }

  /**
   * Get learning statistics for a tenant
   */
  async getLearningStats(tenantId: string): Promise<{
    totalCorrections: number;
    activeRules: number;
    rulesByField: Record<string, number>;
    avgConfidence: number;
    lastLearningDate: string | null;
  }> {
    try {
      // Get correction count
      const { count: totalCorrections } = await supabase
        .from('ingestion_corrections')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Get rules
      const { data: rules } = await supabase
        .from('learned_transformation_rules')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      const activeRules = rules?.length || 0;

      // Count rules by field
      const rulesByField: Record<string, number> = {};
      let totalConfidence = 0;
      let lastUpdate: string | null = null;

      for (const rule of rules || []) {
        rulesByField[rule.field_name] = (rulesByField[rule.field_name] || 0) + 1;
        totalConfidence += rule.confidence;
        if (!lastUpdate || rule.updated_at > lastUpdate) {
          lastUpdate = rule.updated_at;
        }
      }

      return {
        totalCorrections: totalCorrections || 0,
        activeRules,
        rulesByField,
        avgConfidence: activeRules > 0 ? totalConfidence / activeRules : 0,
        lastLearningDate: lastUpdate,
      };

    } catch (error) {
      console.error(`❌ Error getting learning stats:`, error);
      return {
        totalCorrections: 0,
        activeRules: 0,
        rulesByField: {},
        avgConfidence: 0,
        lastLearningDate: null,
      };
    }
  }

  /**
   * Deactivate a learned rule
   */
  async deactivateRule(ruleId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('learned_transformation_rules')
        .update({ is_active: false })
        .eq('id', ruleId);

      if (error) {
        console.error(`❌ Error deactivating rule:`, error);
        return false;
      }

      console.log(`✅ Rule ${ruleId} deactivated`);
      return true;

    } catch (error) {
      console.error(`❌ Error in deactivateRule:`, error);
      return false;
    }
  }

  /**
   * Force trigger learning (for manual/API use)
   */
  async triggerLearning(tenantId: string): Promise<{
    rulesCreated: number;
    rulesUpdated: number;
  }> {
    console.log(`\n🎓 Manually triggering learning for tenant ${tenantId}`);
    return this.applyLearnings(tenantId);
  }
}

// Singleton instance
export const learningService = new LearningService();
