// backend/src/services/ingestion/deduplicator.ts

import { ChatOpenAI } from '@langchain/openai';
import { ExtractedItem, DeduplicationResult, DuplicateGroup, ExtractedField } from './types';
import { similarity, jaroWinkler, normalizeForComparison, cosineSimilarity } from './utils/stringUtils';

const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});

// Similarity thresholds
const EXACT_DUPLICATE_THRESHOLD = 0.98;
const HIGH_SIMILARITY_THRESHOLD = 0.85;
const POTENTIAL_DUPLICATE_THRESHOLD = 0.7;

// Field weights for similarity calculation
const FIELD_WEIGHTS: Record<string, number> = {
  name: 0.4,
  sku: 0.25,
  description: 0.15,
  vendor: 0.1,
  category: 0.05,
  price: 0.05,
};

export async function deduplicateItems(
  items: ExtractedItem[],
  options?: {
    threshold?: number;
    useLLM?: boolean;
    mergeStrategy?: 'keep_first' | 'keep_best' | 'merge';
  }
): Promise<DeduplicationResult> {
  const threshold = options?.threshold || POTENTIAL_DUPLICATE_THRESHOLD;
  const mergeStrategy = options?.mergeStrategy || 'keep_best';
  const useLLM = options?.useLLM ?? true;

  const duplicateGroups: DuplicateGroup[] = [];
  const uniqueItems: ExtractedItem[] = [];
  const processedIndices = new Set<number>();

  // Calculate similarity matrix
  const similarityMatrix = calculateSimilarityMatrix(items);

  for (let i = 0; i < items.length; i++) {
    if (processedIndices.has(i)) continue;

    const duplicates: ExtractedItem[] = [];
    const duplicateIndices: number[] = [];

    // Find all items similar to item i
    for (let j = i + 1; j < items.length; j++) {
      if (processedIndices.has(j)) continue;

      const similarity = similarityMatrix[i][j];
      if (similarity >= threshold) {
        duplicates.push(items[j]);
        duplicateIndices.push(j);
      }
    }

    if (duplicates.length === 0) {
      // No duplicates found, add to unique items
      uniqueItems.push(items[i]);
    } else {
      // Duplicates found, create a group
      const allCandidates = [items[i], ...duplicates];
      const avgSimilarity = duplicateIndices.reduce((sum, j) => sum + similarityMatrix[i][j], 0) / duplicateIndices.length;

      // Use LLM for ambiguous cases
      let confirmed = avgSimilarity >= HIGH_SIMILARITY_THRESHOLD;
      if (!confirmed && useLLM) {
        confirmed = await confirmDuplicatesWithLLM(items[i], duplicates[0]);
      }

      if (confirmed) {
        // Mark all duplicates as processed
        duplicateIndices.forEach(idx => processedIndices.add(idx));
        processedIndices.add(i);

        // Determine canonical item and create group
        const { canonical, strategy } = selectCanonicalItem(allCandidates, mergeStrategy);

        duplicateGroups.push({
          canonical,
          duplicates: allCandidates.filter(item => item !== canonical),
          similarity: avgSimilarity,
          mergeStrategy: strategy,
        });

        uniqueItems.push(canonical);
      } else {
        // Not confirmed as duplicates, add all to unique items
        uniqueItems.push(items[i]);
      }
    }
  }

  return {
    uniqueItems,
    duplicates: duplicateGroups,
    stats: {
      totalItems: items.length,
      uniqueItems: uniqueItems.length,
      duplicatesFound: duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0),
      mergedItems: duplicateGroups.length,
    },
  };
}

function calculateSimilarityMatrix(items: ExtractedItem[]): number[][] {
  const n = items.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1; // Self-similarity
    for (let j = i + 1; j < n; j++) {
      const sim = calculateItemSimilarity(items[i], items[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

function calculateItemSimilarity(item1: ExtractedItem, item2: ExtractedItem): number {
  let totalWeight = 0;
  let weightedSimilarity = 0;

  // Compare each field
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const value1 = getFieldValue(item1, field);
    const value2 = getFieldValue(item2, field);

    if (value1 !== null && value2 !== null) {
      const fieldSim = calculateFieldSimilarity(value1, value2, field);
      weightedSimilarity += fieldSim * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSimilarity / totalWeight : 0;
}

function getFieldValue(item: ExtractedItem, field: string): any {
  const extractedField = item[field as keyof ExtractedItem] as ExtractedField | undefined;
  return extractedField?.value ?? null;
}

function calculateFieldSimilarity(value1: any, value2: any, field: string): number {
  // Handle null/undefined
  if (value1 === null || value2 === null) return 0;
  if (value1 === undefined || value2 === undefined) return 0;

  // Exact match
  if (value1 === value2) return 1;
  if (JSON.stringify(value1) === JSON.stringify(value2)) return 1;

  // String comparison
  if (typeof value1 === 'string' && typeof value2 === 'string') {
    const normalized1 = normalizeForComparison(value1);
    const normalized2 = normalizeForComparison(value2);

    // For SKU, use exact or very high similarity
    if (field === 'sku') {
      return normalized1 === normalized2 ? 1 : similarity(normalized1, normalized2);
    }

    // For name and description, use multiple similarity metrics
    if (field === 'name' || field === 'description') {
      const jaroWinklerSim = jaroWinkler(normalized1, normalized2);
      const cosineSim = cosineSimilarity(normalized1, normalized2);
      const levenshteinSim = similarity(normalized1, normalized2);

      // Use the maximum of the three metrics
      return Math.max(jaroWinklerSim, cosineSim, levenshteinSim);
    }

    // Default string comparison
    return similarity(normalized1, normalized2);
  }

  // Number comparison (for price)
  if (typeof value1 === 'number' && typeof value2 === 'number') {
    if (value1 === 0 && value2 === 0) return 1;
    const diff = Math.abs(value1 - value2);
    const max = Math.max(Math.abs(value1), Math.abs(value2));
    return max > 0 ? 1 - (diff / max) : 1;
  }

  // Array comparison
  if (Array.isArray(value1) && Array.isArray(value2)) {
    const set1 = new Set(value1.map(v => normalizeForComparison(String(v))));
    const set2 = new Set(value2.map(v => normalizeForComparison(String(v))));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  return 0;
}

async function confirmDuplicatesWithLLM(item1: ExtractedItem, item2: ExtractedItem): Promise<boolean> {
  const prompt = `Determina se questi due elementi sono duplicati (lo stesso prodotto/servizio):

Elemento 1:
- Nome: ${item1.name?.value || 'N/A'}
- SKU: ${item1.sku?.value || 'N/A'}
- Descrizione: ${(item1.description?.value || '').slice(0, 200)}
- Categoria: ${item1.category?.value || 'N/A'}
- Prezzo: ${item1.price?.value || 'N/A'}
- Vendor: ${item1.vendor?.value || 'N/A'}

Elemento 2:
- Nome: ${item2.name?.value || 'N/A'}
- SKU: ${item2.sku?.value || 'N/A'}
- Descrizione: ${(item2.description?.value || '').slice(0, 200)}
- Categoria: ${item2.category?.value || 'N/A'}
- Prezzo: ${item2.price?.value || 'N/A'}
- Vendor: ${item2.vendor?.value || 'N/A'}

Rispondi SOLO con JSON:
{
  "isDuplicate": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "breve spiegazione"
}`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const result = JSON.parse(extractJSON(response.content as string));
    return result.isDuplicate && result.confidence >= 0.7;
  } catch (error) {
    console.error('LLM duplicate confirmation failed:', error);
    return false;
  }
}

function selectCanonicalItem(
  items: ExtractedItem[],
  strategy: 'keep_first' | 'keep_best' | 'merge'
): { canonical: ExtractedItem; strategy: 'keep_first' | 'keep_best' | 'merge' } {
  if (strategy === 'keep_first') {
    return { canonical: items[0], strategy };
  }

  if (strategy === 'keep_best') {
    // Select item with highest overall confidence
    let best = items[0];
    let bestScore = calculateItemCompleteness(items[0]);

    for (let i = 1; i < items.length; i++) {
      const score = calculateItemCompleteness(items[i]);
      if (score > bestScore) {
        best = items[i];
        bestScore = score;
      }
    }

    return { canonical: best, strategy };
  }

  // Merge strategy: combine best values from all items
  if (strategy === 'merge') {
    const merged = mergeItems(items);
    return { canonical: merged, strategy };
  }

  return { canonical: items[0], strategy: 'keep_first' };
}

function calculateItemCompleteness(item: ExtractedItem): number {
  let score = 0;
  let maxScore = 0;

  const fields = ['name', 'description', 'price', 'sku', 'category', 'vendor', 'status'];

  for (const field of fields) {
    maxScore += 1;
    const extractedField = item[field as keyof ExtractedItem] as ExtractedField | undefined;
    if (extractedField?.value) {
      score += 0.5; // Has value
      score += (extractedField.confidence || 0) * 0.5; // Weighted by confidence
    }
  }

  // Bonus for extraction confidence
  score += (item._extraction?.overallConfidence || 0) * 0.2;

  return score / maxScore;
}

function mergeItems(items: ExtractedItem[]): ExtractedItem {
  // Start with the most complete item as base
  const sortedItems = [...items].sort((a, b) =>
    calculateItemCompleteness(b) - calculateItemCompleteness(a)
  );

  const merged = { ...sortedItems[0] };

  // Merge each field, taking the best value
  const fields = ['name', 'description', 'price', 'sku', 'category', 'subcategory', 'vendor', 'owner', 'status', 'priority', 'technologies'];

  for (const field of fields) {
    let bestField: ExtractedField | undefined;
    let bestConfidence = 0;

    for (const item of items) {
      const extractedField = item[field as keyof ExtractedItem] as ExtractedField | undefined;
      if (extractedField?.value && (extractedField.confidence || 0) > bestConfidence) {
        bestField = extractedField;
        bestConfidence = extractedField.confidence || 0;
      }
    }

    if (bestField) {
      (merged as any)[field] = bestField;
    }
  }

  // Update metadata
  merged._extraction = {
    ...merged._extraction,
    method: 'column_mapping',
    overallConfidence: Math.max(...items.map(i => i._extraction?.overallConfidence || 0)),
    fieldsNeedingReview: Array.from(new Set(
      items.flatMap(i => i._extraction?.fieldsNeedingReview || [])
    )),
  };

  return merged;
}

function extractJSON(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    text.match(/\{[\s\S]*\}/);
  return jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text;
}

/**
 * Find potential duplicates without deduplicating (for preview)
 */
export function findPotentialDuplicates(
  items: ExtractedItem[],
  threshold: number = POTENTIAL_DUPLICATE_THRESHOLD
): { item1Index: number; item2Index: number; similarity: number }[] {
  const duplicates: { item1Index: number; item2Index: number; similarity: number }[] = [];
  const similarityMatrix = calculateSimilarityMatrix(items);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (similarityMatrix[i][j] >= threshold) {
        duplicates.push({
          item1Index: i,
          item2Index: j,
          similarity: similarityMatrix[i][j],
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Check if a single item is a duplicate of any existing items
 */
export function checkForDuplicate(
  newItem: ExtractedItem,
  existingItems: ExtractedItem[],
  threshold: number = POTENTIAL_DUPLICATE_THRESHOLD
): { isDuplicate: boolean; matchIndex?: number; similarity?: number } {
  for (let i = 0; i < existingItems.length; i++) {
    const sim = calculateItemSimilarity(newItem, existingItems[i]);
    if (sim >= threshold) {
      return { isDuplicate: true, matchIndex: i, similarity: sim };
    }
  }
  return { isDuplicate: false };
}

export {
  calculateItemSimilarity,
  calculateItemCompleteness,
  EXACT_DUPLICATE_THRESHOLD,
  HIGH_SIMILARITY_THRESHOLD,
  POTENTIAL_DUPLICATE_THRESHOLD,
};
