/**
 * Quality Gates Initializer
 *
 * Configures default quality gates for data ingestion
 * to ensure high-quality portfolio data.
 */

import { supabase } from '../config/supabase';

// ============================================================================
// DEFAULT QUALITY GATES CONFIGURATION
// ============================================================================

interface QualityGateConfig {
  gate_name: string;
  gate_type: 'confidence' | 'completeness' | 'consistency' | 'custom';
  threshold: number;
  operator: '>=' | '<=' | '>' | '<' | '==';
  description: string;
  is_blocking: boolean;
  applies_to: 'ingestion' | 'assessments' | 'portfolio_items' | 'all';
}

const DEFAULT_QUALITY_GATES: QualityGateConfig[] = [
  // Confidence Gates
  {
    gate_name: 'Minimum Overall Confidence',
    gate_type: 'confidence',
    threshold: 0.50,
    operator: '>=',
    description: 'Items must have at least 50% overall confidence to be auto-accepted. Below this threshold, manual review is required.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'High Confidence Threshold',
    gate_type: 'confidence',
    threshold: 0.80,
    operator: '>=',
    description: 'Items with 80%+ confidence are automatically accepted without review.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Critical Field Confidence',
    gate_type: 'confidence',
    threshold: 0.60,
    operator: '>=',
    description: 'Critical fields (name, type) must have at least 60% confidence.',
    is_blocking: true,
    applies_to: 'ingestion',
  },

  // Completeness Gates
  {
    gate_name: 'Required Fields Completeness',
    gate_type: 'completeness',
    threshold: 1.0,
    operator: '==',
    description: 'All required fields (name, type) must be present.',
    is_blocking: true,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Recommended Fields Completeness',
    gate_type: 'completeness',
    threshold: 0.70,
    operator: '>=',
    description: 'At least 70% of recommended fields should be populated for optimal analysis.',
    is_blocking: false,
    applies_to: 'ingestion',
  },

  // Consistency Gates
  {
    gate_name: 'No Duplicate Items',
    gate_type: 'consistency',
    threshold: 0.0,
    operator: '==',
    description: 'Items must not be duplicates of existing portfolio items.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Valid Data Types',
    gate_type: 'consistency',
    threshold: 1.0,
    operator: '==',
    description: 'All fields must have valid data types (e.g., dates as dates, numbers as numbers).',
    is_blocking: true,
    applies_to: 'ingestion',
  },
  {
    gate_name: 'Budget Consistency',
    gate_type: 'consistency',
    threshold: 1.0,
    operator: '==',
    description: 'Budget values must be positive and within reasonable ranges.',
    is_blocking: false,
    applies_to: 'ingestion',
  },

  // Custom Gates
  {
    gate_name: 'Enrichment Success Rate',
    gate_type: 'custom',
    threshold: 0.50,
    operator: '>=',
    description: 'At least 50% of items should be successfully enriched from external sources.',
    is_blocking: false,
    applies_to: 'ingestion',
  },
];

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

/**
 * Initialize default quality gates for a company
 */
export async function initializeQualityGates(companyId: string): Promise<void> {
  console.log(`🎯 Initializing quality gates for company: ${companyId}`);

  try {
    // Check if company already has quality gates
    const { data: existingGates, error: checkError } = await supabase
      .from('quality_gates')
      .select('id')
      .eq('company_id', companyId)
      .limit(1);

    if (checkError) {
      console.error('Error checking existing gates:', checkError);
      throw checkError;
    }

    if (existingGates && existingGates.length > 0) {
      console.log('  ℹ️ Quality gates already exist for this company. Skipping initialization.');
      return;
    }

    // Insert default quality gates
    const gatesToInsert = DEFAULT_QUALITY_GATES.map(gate => ({
      company_id: companyId,
      ...gate,
      is_active: true,
      mcp_enabled: false,
      mcp_config: {},
    }));

    const { data, error } = await supabase
      .from('quality_gates')
      .insert(gatesToInsert)
      .select();

    if (error) {
      console.error('Error inserting quality gates:', error);
      throw error;
    }

    console.log(`  ✅ Successfully initialized ${data?.length || 0} quality gates`);
  } catch (error) {
    console.error('Failed to initialize quality gates:', error);
    throw error;
  }
}

/**
 * Get active quality gates for a company
 */
export async function getActiveQualityGates(
  companyId: string,
  appliesTo?: 'ingestion' | 'assessments' | 'portfolio_items' | 'all'
): Promise<any[]> {
  try {
    let query = supabase
      .from('quality_gates')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (appliesTo) {
      query = query.or(`applies_to.eq.${appliesTo},applies_to.eq.all`);
    }

    const { data, error } = await query.order('gate_name');

    if (error) {
      console.error('Error fetching quality gates:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Failed to fetch quality gates:', error);
    throw error;
  }
}

/**
 * Update quality gate configuration
 */
export async function updateQualityGate(
  gateId: string,
  updates: Partial<QualityGateConfig>
): Promise<void> {
  try {
    const { error } = await supabase
      .from('quality_gates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gateId);

    if (error) {
      console.error('Error updating quality gate:', error);
      throw error;
    }

    console.log(`✅ Quality gate ${gateId} updated successfully`);
  } catch (error) {
    console.error('Failed to update quality gate:', error);
    throw error;
  }
}

/**
 * Check if an item passes quality gates
 */
export async function checkQualityGates(
  companyId: string,
  item: any,
  appliesTo: 'ingestion' | 'assessments' | 'portfolio_items'
): Promise<{
  passed: boolean;
  blockedBy: any[];
  warnings: any[];
  violations: any[];
}> {
  try {
    const gates = await getActiveQualityGates(companyId, appliesTo);

    const blockedBy: any[] = [];
    const warnings: any[] = [];
    const violations: any[] = [];

    for (const gate of gates) {
      const passed = evaluateGate(gate, item);

      if (!passed) {
        violations.push(gate);

        if (gate.is_blocking) {
          blockedBy.push(gate);
        } else {
          warnings.push(gate);
        }
      }
    }

    return {
      passed: blockedBy.length === 0,
      blockedBy,
      warnings,
      violations,
    };
  } catch (error) {
    console.error('Failed to check quality gates:', error);
    throw error;
  }
}

/**
 * Evaluate a single gate against an item
 */
function evaluateGate(gate: any, item: any): boolean {
  const { gate_type, threshold, operator } = gate;

  // Get the value to check based on gate type
  let value: number;

  switch (gate_type) {
    case 'confidence':
      value = item.confidence_breakdown?.overall ?? item.confidence ?? 0;
      break;

    case 'completeness':
      value = calculateCompleteness(item);
      break;

    case 'consistency':
      value = item.consistency_score ?? 1.0; // Assume consistent unless proven otherwise
      break;

    case 'custom':
      value = item.enrichment_success_rate ?? 0;
      break;

    default:
      return true; // Unknown gate type, pass by default
  }

  // Evaluate based on operator
  switch (operator) {
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '==':
      return Math.abs(value - threshold) < 0.01; // Floating point comparison
    default:
      return true;
  }
}

/**
 * Calculate completeness score for an item
 */
function calculateCompleteness(item: any): number {
  const requiredFields = ['name', 'type'];
  const recommendedFields = ['description', 'status', 'priority', 'category', 'owner'];

  const requiredFilled = requiredFields.filter(field => item[field]).length;
  const requiredScore = requiredFilled / requiredFields.length;

  const recommendedFilled = recommendedFields.filter(field => item[field]).length;
  const recommendedScore = recommendedFilled / recommendedFields.length;

  // Weight: 70% required, 30% recommended
  return requiredScore * 0.7 + recommendedScore * 0.3;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  initializeQualityGates,
  getActiveQualityGates,
  updateQualityGate,
  checkQualityGates,
};
