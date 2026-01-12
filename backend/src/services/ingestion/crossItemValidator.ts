/**
 * Cross-Item Validator
 *
 * Validates relationships and consistency across multiple items:
 * - Date consistency (dependencies, timelines)
 * - Budget rollups (parent-child aggregations)
 * - Owner capacity (workload distribution)
 * - Cross-document duplicates
 */

import type { NormalizedItem } from '../../agents/subagents/ingestion/normalizerAgent';
import { detectDependencies, type ItemRelationship } from './dependencyDetector';

// ============================================================================
// TYPES
// ============================================================================

export interface CrossItemValidationResult {
  valid: boolean;
  relationships: ItemRelationship[];
  inconsistencies: DataInconsistency[];
  duplicates: CrossDocumentDuplicate[];
  suggestions: ValidationSuggestion[];
}

export interface DataInconsistency {
  type: 'date_overlap' | 'budget_mismatch' | 'owner_conflict' | 'priority_inconsistency' | 'circular_dependency';
  affectedItems: string[];
  description: string;
  severity: 'error' | 'warning' | 'info';
  suggestedFix?: string;
}

export interface CrossDocumentDuplicate {
  newItem: NormalizedItem;
  existingItem: NormalizedItem;
  existingSource: string;
  similarity: number;
  mergeStrategy: 'keep_new' | 'keep_existing' | 'merge' | 'ask_user';
}

export interface ValidationSuggestion {
  type: 'rename' | 'merge' | 'split' | 'adjust_dates' | 'adjust_budget';
  affectedItems: string[];
  suggestion: string;
  confidence: number;
}

export interface ValidationContext {
  tenantId: string;
  existingItems?: NormalizedItem[];
  validationRules?: string[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Validates consistency across multiple items
 */
export async function validateCrossItem(
  items: NormalizedItem[],
  context: ValidationContext
): Promise<CrossItemValidationResult> {
  console.log(`🔍 Cross-item validation for ${items.length} items...`);

  const relationships = await detectDependencies(items);
  const inconsistencies: DataInconsistency[] = [];
  const duplicates: CrossDocumentDuplicate[] = [];
  const suggestions: ValidationSuggestion[] = [];

  // Rule 1: Date consistency
  inconsistencies.push(...validateDateConsistency(items, relationships));

  // Rule 2: Budget rollups
  inconsistencies.push(...validateBudgetRollup(items, relationships));

  // Rule 3: Owner capacity
  inconsistencies.push(...validateOwnerCapacity(items));

  // Rule 4: Circular dependencies
  inconsistencies.push(...detectCircularDependencies(relationships));

  // Rule 5: Cross-document duplicates
  if (context.existingItems) {
    duplicates.push(...detectDuplicates(items, context.existingItems));
  }

  // Generate suggestions
  suggestions.push(...generateSuggestions(inconsistencies, items));

  const valid = inconsistencies.filter(i => i.severity === 'error').length === 0;

  console.log(
    `✅ Validation complete: ${relationships.length} relationships, ` +
    `${inconsistencies.length} inconsistencies, ${duplicates.length} duplicates`
  );

  return {
    valid,
    relationships,
    inconsistencies,
    duplicates,
    suggestions,
  };
}

// ============================================================================
// VALIDATION RULES
// ============================================================================

/**
 * Validates date consistency across dependencies
 */
function validateDateConsistency(
  items: NormalizedItem[],
  relationships: ItemRelationship[]
): DataInconsistency[] {
  const inconsistencies: DataInconsistency[] = [];
  const itemMap = new Map(items.map(item => [item.id, item]));

  for (const rel of relationships) {
    if (rel.relationshipType !== 'depends_on') continue;

    const source = itemMap.get(rel.sourceItemId);
    const target = itemMap.get(rel.targetItemId);

    if (!source || !target) continue;
    if (!source.startDate || !target.endDate) continue;

    const sourceStart = new Date(source.startDate);
    const targetEnd = new Date(target.endDate);

    // Source cannot start before its dependency ends
    if (sourceStart < targetEnd) {
      inconsistencies.push({
        type: 'date_overlap',
        affectedItems: [source.id, target.id],
        description: `"${source.name}" starts before dependency "${target.name}" ends`,
        severity: 'warning',
        suggestedFix: `Adjust start date of "${source.name}" to ${targetEnd.toISOString().split('T')[0]} or later`,
      });
    }
  }

  return inconsistencies;
}

/**
 * Validates budget rollups (child budgets shouldn't exceed parent)
 */
function validateBudgetRollup(
  items: NormalizedItem[],
  relationships: ItemRelationship[]
): DataInconsistency[] {
  const inconsistencies: DataInconsistency[] = [];
  const itemMap = new Map(items.map(item => [item.id, item]));

  // Group items by parent (part_of relationship)
  const parentGroups = new Map<string, NormalizedItem[]>();

  for (const rel of relationships) {
    if (rel.relationshipType !== 'part_of') continue;

    const children = parentGroups.get(rel.targetItemId) || [];
    const child = itemMap.get(rel.sourceItemId);
    if (child) {
      children.push(child);
      parentGroups.set(rel.targetItemId, children);
    }
  }

  // Validate each parent group
  for (const [parentId, children] of parentGroups) {
    const parent = itemMap.get(parentId);
    if (!parent || !parent.budget) continue;

    const childrenBudgetSum = children
      .filter(c => c.budget)
      .reduce((sum, c) => sum + (c.budget || 0), 0);

    if (childrenBudgetSum > parent.budget! * 1.05) { // 5% tolerance
      inconsistencies.push({
        type: 'budget_mismatch',
        affectedItems: [parentId, ...children.map(c => c.id)],
        description: `Children budget sum (${childrenBudgetSum}) exceeds parent budget (${parent.budget})`,
        severity: 'error',
        suggestedFix: `Increase parent budget to ${childrenBudgetSum} or reduce children budgets`,
      });
    }
  }

  return inconsistencies;
}

/**
 * Validates owner capacity (too many high-priority items)
 */
function validateOwnerCapacity(items: NormalizedItem[]): DataInconsistency[] {
  const inconsistencies: DataInconsistency[] = [];

  // Group by owner
  const ownerGroups = new Map<string, NormalizedItem[]>();

  for (const item of items) {
    if (!item.owner) continue;

    const items = ownerGroups.get(item.owner) || [];
    items.push(item);
    ownerGroups.set(item.owner, items);
  }

  // Check capacity
  for (const [owner, ownerItems] of ownerGroups) {
    const highPriorityCount = ownerItems.filter(
      i => i.priority === 'critical' || i.priority === 'high'
    ).length;

    if (highPriorityCount > 5) {
      inconsistencies.push({
        type: 'owner_conflict',
        affectedItems: ownerItems.map(i => i.id),
        description: `Owner "${owner}" has ${highPriorityCount} high-priority items (potential overload)`,
        severity: 'warning',
        suggestedFix: `Consider redistributing some items or adjusting priorities`,
      });
    }
  }

  return inconsistencies;
}

/**
 * Detects circular dependencies
 */
function detectCircularDependencies(
  relationships: ItemRelationship[]
): DataInconsistency[] {
  const inconsistencies: DataInconsistency[] = [];

  // Build adjacency list
  const graph = new Map<string, Set<string>>();

  for (const rel of relationships) {
    if (rel.relationshipType !== 'depends_on') continue;

    const deps = graph.get(rel.sourceItemId) || new Set();
    deps.add(rel.targetItemId);
    graph.set(rel.sourceItemId, deps);
  }

  // DFS to detect cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string, path: string[]): string[] | null {
    if (recStack.has(node)) {
      // Found cycle
      return [...path, node];
    }

    if (visited.has(node)) {
      return null;
    }

    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      const cycle = hasCycle(neighbor, [...path, node]);
      if (cycle) return cycle;
    }

    recStack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cycle = hasCycle(node, []);
      if (cycle) {
        inconsistencies.push({
          type: 'circular_dependency',
          affectedItems: cycle,
          description: `Circular dependency detected: ${cycle.join(' → ')}`,
          severity: 'error',
          suggestedFix: 'Remove one of the dependencies to break the cycle',
        });
      }
    }
  }

  return inconsistencies;
}

/**
 * Detects duplicates against existing items
 */
function detectDuplicates(
  newItems: NormalizedItem[],
  existingItems: NormalizedItem[]
): CrossDocumentDuplicate[] {
  const duplicates: CrossDocumentDuplicate[] = [];

  for (const newItem of newItems) {
    for (const existing of existingItems) {
      const similarity = calculateSimilarity(newItem, existing);

      if (similarity > 0.85) {
        duplicates.push({
          newItem,
          existingItem: existing,
          existingSource: 'historical_portfolio',
          similarity,
          mergeStrategy: similarity > 0.95 ? 'keep_existing' : 'ask_user',
        });
      }
    }
  }

  return duplicates;
}

/**
 * Calculates similarity between two items
 */
function calculateSimilarity(item1: NormalizedItem, item2: NormalizedItem): number {
  let score = 0;
  let weights = 0;

  // Name similarity (40% weight)
  if (item1.name && item2.name) {
    const nameSim = stringSimilarity(item1.name, item2.name);
    score += nameSim * 0.4;
    weights += 0.4;
  }

  // Description similarity (20% weight)
  if (item1.description && item2.description) {
    const descSim = stringSimilarity(item1.description, item2.description);
    score += descSim * 0.2;
    weights += 0.2;
  }

  // Category match (15% weight)
  if (item1.category && item2.category && item1.category === item2.category) {
    score += 0.15;
  }
  weights += 0.15;

  // Vendor match (10% weight)
  if (item1.vendor && item2.vendor && item1.vendor === item2.vendor) {
    score += 0.1;
  }
  weights += 0.1;

  return weights > 0 ? score / weights : 0;
}

/**
 * Simple string similarity (Levenshtein-based)
 */
function stringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Generates actionable suggestions
 */
function generateSuggestions(
  inconsistencies: DataInconsistency[],
  items: NormalizedItem[]
): ValidationSuggestion[] {
  const suggestions: ValidationSuggestion[] = [];

  // Suggest merges for high-similarity duplicates
  const nameCounts = new Map<string, NormalizedItem[]>();
  for (const item of items) {
    const existing = nameCounts.get(item.name) || [];
    existing.push(item);
    nameCounts.set(item.name, existing);
  }

  for (const [name, duplicates] of nameCounts) {
    if (duplicates.length > 1) {
      suggestions.push({
        type: 'merge',
        affectedItems: duplicates.map(d => d.id),
        suggestion: `Consider merging ${duplicates.length} items with name "${name}"`,
        confidence: 0.8,
      });
    }
  }

  return suggestions;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  validateCrossItem,
};
