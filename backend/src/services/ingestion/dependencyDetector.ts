/**
 * Dependency Detector
 *
 * Detects relationships between items:
 * - depends_on: Item A requires Item B to be completed first
 * - blocks: Item A prevents Item B from starting
 * - related_to: Items are related but not dependent
 * - supersedes: Item A replaces Item B
 * - part_of: Item A is a component of Item B
 */

import type { NormalizedItem } from '../../agents/subagents/ingestion/normalizerAgent';

// ============================================================================
// TYPES
// ============================================================================

export interface ItemRelationship {
  sourceItemId: string;
  targetItemId: string;
  relationshipType: 'depends_on' | 'blocks' | 'related_to' | 'supersedes' | 'part_of';
  confidence: number;
  evidence: string[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Detects dependencies and relationships between items
 */
export async function detectDependencies(
  items: NormalizedItem[]
): Promise<ItemRelationship[]> {
  console.log(`🔗 Detecting dependencies among ${items.length} items...`);

  const relationships: ItemRelationship[] = [];

  // Strategy 1: Keyword-based detection
  relationships.push(...detectKeywordBasedDependencies(items));

  // Strategy 2: Name reference detection
  relationships.push(...detectNameReferences(items));

  // Strategy 3: Hierarchical relationships
  relationships.push(...detectHierarchicalRelationships(items));

  console.log(`✅ Detected ${relationships.length} relationships`);

  return relationships;
}

// ============================================================================
// DETECTION STRATEGIES
// ============================================================================

/**
 * Detects dependencies via keywords in description
 */
function detectKeywordBasedDependencies(items: NormalizedItem[]): ItemRelationship[] {
  const relationships: ItemRelationship[] = [];

  const dependencyKeywords = [
    'requires',
    'depends on',
    'prerequisite',
    'after',
    'following',
    'richiede',
    'dipende da',
    'dopo',
  ];

  const blockingKeywords = [
    'blocks',
    'prevents',
    'blocca',
    'impedisce',
  ];

  for (const item of items) {
    const description = (item.description || '').toLowerCase();

    for (const other of items) {
      if (item.id === other.id) continue;

      const otherName = other.name.toLowerCase();

      // Check for dependency keywords
      for (const keyword of dependencyKeywords) {
        if (description.includes(keyword) && description.includes(otherName)) {
          relationships.push({
            sourceItemId: item.id,
            targetItemId: other.id,
            relationshipType: 'depends_on',
            confidence: 0.7,
            evidence: [`Description contains "${keyword}" and mentions "${other.name}"`],
          });
          break;
        }
      }

      // Check for blocking keywords
      for (const keyword of blockingKeywords) {
        if (description.includes(keyword) && description.includes(otherName)) {
          relationships.push({
            sourceItemId: item.id,
            targetItemId: other.id,
            relationshipType: 'blocks',
            confidence: 0.7,
            evidence: [`Description contains "${keyword}" and mentions "${other.name}"`],
          });
          break;
        }
      }
    }
  }

  return relationships;
}

/**
 * Detects relationships via name references
 */
function detectNameReferences(items: NormalizedItem[]): ItemRelationship[] {
  const relationships: ItemRelationship[] = [];

  for (const item of items) {
    const text = `${item.name} ${item.description || ''}`.toLowerCase();

    for (const other of items) {
      if (item.id === other.id) continue;

      const otherName = other.name.toLowerCase();

      // Check if item mentions other item's name
      if (text.includes(otherName) && otherName.length > 5) {
        relationships.push({
          sourceItemId: item.id,
          targetItemId: other.id,
          relationshipType: 'related_to',
          confidence: 0.6,
          evidence: [`Item mentions "${other.name}"`],
        });
      }
    }
  }

  return relationships;
}

/**
 * Detects hierarchical relationships (parent-child)
 */
function detectHierarchicalRelationships(items: NormalizedItem[]): ItemRelationship[] {
  const relationships: ItemRelationship[] = [];

  // Group items by category
  const categoryGroups = new Map<string, NormalizedItem[]>();

  for (const item of items) {
    if (!item.category) continue;

    const group = categoryGroups.get(item.category) || [];
    group.push(item);
    categoryGroups.set(item.category, group);
  }

  // Within each category, look for parent-child patterns
  for (const group of categoryGroups.values()) {
    for (const item of group) {
      // Check if item name suggests it's a sub-component
      const isSubComponent = /phase|step|part|module|component|fase|step|parte|modulo/i.test(item.name);

      if (!isSubComponent) continue;

      // Find potential parent
      for (const other of group) {
        if (item.id === other.id) continue;

        // Parent is usually broader/more general
        if (other.name.length < item.name.length &&
            item.name.toLowerCase().includes(other.name.toLowerCase())) {
          relationships.push({
            sourceItemId: item.id,
            targetItemId: other.id,
            relationshipType: 'part_of',
            confidence: 0.75,
            evidence: [`"${item.name}" appears to be a component of "${other.name}"`],
          });
        }
      }
    }
  }

  return relationships;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  detectDependencies,
};
