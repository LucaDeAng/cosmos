// backend/src/services/ingestion/utils/stringUtils.ts

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of column names to target fields
 */
export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  // Handle empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
export function similarity(a: string, b: string): number {
  const distance = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? 1 - distance / maxLen : 1;
}

/**
 * Jaro-Winkler similarity for better fuzzy matching
 */
export function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);

  // Winkler modification - boost for common prefix
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Normalize string for comparison
 * - Lowercase
 * - Remove accents
 * - Remove extra whitespace
 * - Remove special characters
 */
export function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract keywords from text
 */
export function extractKeywords(texts: string[]): string[] {
  const keywords = new Set<string>();
  const stopWords = new Set([
    'il', 'la', 'le', 'lo', 'i', 'gli', 'un', 'una', 'uno',
    'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'o', 'ma', 'che', 'non', 'del', 'della', 'dei', 'delle',
    'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'with',
    'and', 'or', 'but', 'not', 'is', 'are', 'was', 'were'
  ]);

  for (const text of texts) {
    const words = normalizeForComparison(text).split(' ');
    for (const word of words) {
      if (word.length >= 3 && !stopWords.has(word)) {
        keywords.add(word);
      }
    }
  }

  return Array.from(keywords);
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate filename pattern from example filename
 */
export function generateFilenamePattern(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  // Replace common variable parts with wildcards
  return nameWithoutExt
    .replace(/\d{4}[-/]\d{2}[-/]\d{2}/, '\\d{4}[-/]\\d{2}[-/]\\d{2}') // Dates
    .replace(/\d{2}[-/]\d{2}[-/]\d{4}/, '\\d{2}[-/]\\d{2}[-/]\\d{4}') // Dates EU
    .replace(/v?\d+(\.\d+)*/, 'v?\\d+(\\.\\d+)*') // Version numbers
    .replace(/\d+/, '\\d+'); // Other numbers
}

/**
 * Find best match from a list of candidates
 */
export function findBestMatch(
  query: string,
  candidates: string[],
  threshold: number = 0.6
): { match: string; score: number } | null {
  let bestMatch: { match: string; score: number } | null = null;

  const normalizedQuery = normalizeForComparison(query);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeForComparison(candidate);

    // Try exact match first
    if (normalizedQuery === normalizedCandidate) {
      return { match: candidate, score: 1.0 };
    }

    // Try contains match
    if (normalizedQuery.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedQuery)) {
      const score = Math.min(normalizedQuery.length, normalizedCandidate.length) /
                    Math.max(normalizedQuery.length, normalizedCandidate.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { match: candidate, score: Math.min(score + 0.2, 0.95) };
      }
    }

    // Try Jaro-Winkler similarity
    const jwScore = jaroWinkler(normalizedQuery, normalizedCandidate);
    if (jwScore >= threshold && (!bestMatch || jwScore > bestMatch.score)) {
      bestMatch = { match: candidate, score: jwScore };
    }
  }

  return bestMatch && bestMatch.score >= threshold ? bestMatch : null;
}

/**
 * Calculate cosine similarity between two strings (using character n-grams)
 */
export function cosineSimilarity(s1: string, s2: string, n: number = 2): number {
  const getNgrams = (s: string): Map<string, number> => {
    const ngrams = new Map<string, number>();
    const normalized = normalizeForComparison(s);
    for (let i = 0; i <= normalized.length - n; i++) {
      const ngram = normalized.slice(i, i + n);
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(s1);
  const ngrams2 = getNgrams(s2);

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const [ngram, count] of ngrams1) {
    dotProduct += count * (ngrams2.get(ngram) || 0);
    norm1 += count * count;
  }

  for (const count of ngrams2.values()) {
    norm2 += count * count;
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
