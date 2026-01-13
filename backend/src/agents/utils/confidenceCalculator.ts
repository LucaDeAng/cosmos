/**
 * Confidence Calculator - Detailed confidence scoring
 *
 * Calculates multi-dimensional confidence scores for portfolio items,
 * providing transparency into data quality and reliability.
 */

import type {
  ConfidenceBreakdown,
  DataQualityIssue
} from '../schemas/explainabilitySchema';

// === TYPES ===

export interface PortfolioItemForConfidence {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  businessValue?: number;
  strategicAlignment?: number;
  riskLevel?: string;
  complexity?: string;
  estimatedCost?: number;
  budget?: number;
  roi?: number;
  timeToValue?: number;
  lifecycle?: string;
  owner?: string;
  category?: string;
  tags?: string[];
  dependencies?: string[];
  [key: string]: unknown;
}

export interface SourceMetadata {
  reliability: number;  // 0-1
  sourceType: string;   // 'manual', 'extracted', 'api', 'imported'
  extractionConfidence?: number;
  lastVerified?: Date;
}

// === CONFIGURATION ===

const REQUIRED_FIELDS = ['name', 'type', 'businessValue', 'strategicAlignment', 'riskLevel'];
const IMPORTANT_FIELDS = ['description', 'complexity', 'owner', 'category'];
const OPTIONAL_FIELDS = ['estimatedCost', 'budget', 'roi', 'timeToValue', 'lifecycle', 'tags', 'dependencies'];

const CONFIDENCE_WEIGHTS = {
  dataCompleteness: 0.30,
  sourceReliability: 0.25,
  patternMatch: 0.25,
  crossValidation: 0.20
};

// === MAIN FUNCTION ===

/**
 * Calculate detailed confidence breakdown for a portfolio item
 */
export function calculateDetailedConfidence(
  item: PortfolioItemForConfidence,
  sourceMetadata?: SourceMetadata,
  patternMatchScore?: number
): ConfidenceBreakdown {
  // 1. Data Completeness
  const dataCompleteness = calculateDataCompleteness(item);

  // 2. Source Reliability
  const sourceReliability = calculateSourceReliability(sourceMetadata);

  // 3. Pattern Match (from learning layer or default)
  const patternMatch = patternMatchScore ?? 0.5;

  // 4. Cross Validation
  const crossValidation = calculateCrossValidation(item);

  // 5. Data Quality Issues
  const dataQualityIssues = identifyDataQualityIssues(item);

  // 6. Overall confidence (weighted)
  const overall =
    dataCompleteness * CONFIDENCE_WEIGHTS.dataCompleteness +
    sourceReliability * CONFIDENCE_WEIGHTS.sourceReliability +
    patternMatch * CONFIDENCE_WEIGHTS.patternMatch +
    crossValidation * CONFIDENCE_WEIGHTS.crossValidation;

  // 7. Improvement suggestions
  const improvementSuggestions = generateImprovementSuggestions(
    item,
    dataCompleteness,
    dataQualityIssues
  );

  return {
    overall: Math.round(overall * 100) / 100,
    breakdown: {
      dataCompleteness: Math.round(dataCompleteness * 100) / 100,
      sourceReliability: Math.round(sourceReliability * 100) / 100,
      patternMatch: Math.round(patternMatch * 100) / 100,
      crossValidation: Math.round(crossValidation * 100) / 100
    },
    dataQualityIssues,
    improvementSuggestions
  };
}

// === COMPONENT CALCULATIONS ===

/**
 * Calculate data completeness score
 */
function calculateDataCompleteness(item: PortfolioItemForConfidence): number {
  let score = 0;
  let maxScore = 0;

  // Required fields (weight: 3)
  for (const field of REQUIRED_FIELDS) {
    maxScore += 3;
    if (hasValue(item[field])) {
      score += 3;
    }
  }

  // Important fields (weight: 2)
  for (const field of IMPORTANT_FIELDS) {
    maxScore += 2;
    if (hasValue(item[field])) {
      score += 2;
    }
  }

  // Optional fields (weight: 1)
  for (const field of OPTIONAL_FIELDS) {
    maxScore += 1;
    if (hasValue(item[field])) {
      score += 1;
    }
  }

  return maxScore > 0 ? score / maxScore : 0.5;
}

/**
 * Calculate source reliability score
 */
function calculateSourceReliability(metadata?: SourceMetadata): number {
  if (!metadata) return 0.5; // Default to medium

  let score = metadata.reliability;

  // Boost for recent verification
  if (metadata.lastVerified) {
    const daysSinceVerification = (Date.now() - metadata.lastVerified.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceVerification < 7) {
      score = Math.min(1, score + 0.1);
    } else if (daysSinceVerification > 90) {
      score = Math.max(0, score - 0.1);
    }
  }

  // Consider extraction confidence
  if (metadata.extractionConfidence !== undefined) {
    score = (score + metadata.extractionConfidence) / 2;
  }

  // Source type adjustments
  const sourceTypeMultipliers: Record<string, number> = {
    'manual': 0.9,      // Manual entry has some human error risk
    'api': 1.0,         // API data is typically reliable
    'extracted': 0.7,   // Extracted data needs verification
    'imported': 0.8     // Imported data may have mapping issues
  };

  const multiplier = sourceTypeMultipliers[metadata.sourceType] ?? 0.8;
  score *= multiplier;

  return Math.min(1, Math.max(0, score));
}

/**
 * Calculate cross-field validation score
 */
function calculateCrossValidation(item: PortfolioItemForConfidence): number {
  let validations = 0;
  let passed = 0;

  // Validation 1: Cost vs Budget consistency
  if (item.estimatedCost !== undefined && item.budget !== undefined) {
    validations++;
    // Cost should be within 200% of budget
    if (item.estimatedCost <= item.budget * 2) {
      passed++;
    }
  }

  // Validation 2: ROI makes sense with cost
  if (item.roi !== undefined && item.estimatedCost !== undefined) {
    validations++;
    // ROI should be between -100% and 1000%
    if (item.roi >= -100 && item.roi <= 1000) {
      passed++;
    }
  }

  // Validation 3: Business value vs risk consistency
  if (item.businessValue !== undefined && item.riskLevel !== undefined) {
    validations++;
    // High risk items shouldn't typically have very low business value
    const riskMap: Record<string, number> = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const riskScore = riskMap[item.riskLevel] || 2;

    // High risk should have high business value justification
    if (riskScore >= 3 && item.businessValue >= 6) {
      passed++;
    } else if (riskScore < 3) {
      passed++; // Lower risk doesn't need high value justification
    }
  }

  // Validation 4: Complexity vs time to value
  if (item.complexity !== undefined && item.timeToValue !== undefined) {
    validations++;
    const complexityTime: Record<string, number> = { 'low': 3, 'medium': 6, 'high': 12 };
    const expectedMinTime = complexityTime[item.complexity] || 6;

    // Time to value should be reasonable for complexity
    if (item.timeToValue >= expectedMinTime * 0.5) {
      passed++;
    }
  }

  // Validation 5: Strategic alignment vs lifecycle
  if (item.strategicAlignment !== undefined && item.lifecycle !== undefined) {
    validations++;
    // Declining products shouldn't have high strategic alignment
    if (item.lifecycle === 'decline' || item.lifecycle === 'end_of_life') {
      if (item.strategicAlignment <= 5) {
        passed++;
      }
    } else {
      passed++; // Other lifecycle stages don't have this constraint
    }
  }

  // Return score or default if no validations possible
  if (validations === 0) return 0.5;
  return passed / validations;
}

// === DATA QUALITY ISSUES ===

/**
 * Identify specific data quality issues
 */
function identifyDataQualityIssues(item: PortfolioItemForConfidence): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!hasValue(item[field])) {
      issues.push({
        field,
        issue: 'Campo obbligatorio mancante',
        impact: 'high'
      });
    }
  }

  // Check value ranges
  if (item.businessValue !== undefined && (item.businessValue < 1 || item.businessValue > 10)) {
    issues.push({
      field: 'businessValue',
      issue: `Valore fuori range (${item.businessValue}), atteso 1-10`,
      impact: 'medium'
    });
  }

  if (item.strategicAlignment !== undefined && (item.strategicAlignment < 1 || item.strategicAlignment > 10)) {
    issues.push({
      field: 'strategicAlignment',
      issue: `Valore fuori range (${item.strategicAlignment}), atteso 1-10`,
      impact: 'medium'
    });
  }

  // Check cost consistency
  if (item.estimatedCost !== undefined && item.budget !== undefined) {
    if (item.estimatedCost > item.budget * 2) {
      issues.push({
        field: 'estimatedCost',
        issue: `Costo stimato (${item.estimatedCost}) molto superiore al budget (${item.budget})`,
        impact: 'medium'
      });
    }
  }

  // Check ROI reasonableness
  if (item.roi !== undefined) {
    if (item.roi < -100 || item.roi > 1000) {
      issues.push({
        field: 'roi',
        issue: `ROI (${item.roi}%) sembra non realistico`,
        impact: 'medium'
      });
    }
  }

  // Check lifecycle vs strategic alignment mismatch
  if (item.lifecycle && item.strategicAlignment) {
    if ((item.lifecycle === 'decline' || item.lifecycle === 'end_of_life') && item.strategicAlignment > 7) {
      issues.push({
        field: 'strategicAlignment',
        issue: 'Alto allineamento strategico per un prodotto in fase di declino',
        impact: 'low'
      });
    }
  }

  // Check for suspiciously short/long descriptions
  if (item.description) {
    if (item.description.length < 20) {
      issues.push({
        field: 'description',
        issue: 'Descrizione troppo breve per una valutazione accurata',
        impact: 'low'
      });
    }
  }

  return issues;
}

// === IMPROVEMENT SUGGESTIONS ===

/**
 * Generate suggestions for improving data quality
 */
function generateImprovementSuggestions(
  item: PortfolioItemForConfidence,
  completeness: number,
  issues: DataQualityIssue[]
): string[] {
  const suggestions: string[] = [];

  // Low completeness suggestions
  if (completeness < 0.7) {
    const missingRequired = REQUIRED_FIELDS.filter(f => !hasValue(item[f]));
    if (missingRequired.length > 0) {
      suggestions.push(`Aggiungi i campi obbligatori mancanti: ${missingRequired.join(', ')}`);
    }
  }

  // High impact issues
  const highImpactIssues = issues.filter(i => i.impact === 'high');
  if (highImpactIssues.length > 0) {
    suggestions.push(`Risolvi i problemi critici: ${highImpactIssues.map(i => i.field).join(', ')}`);
  }

  // Missing important context
  if (!hasValue(item.description)) {
    suggestions.push('Aggiungi una descrizione dettagliata per migliorare l\'accuratezza');
  }

  if (!hasValue(item.owner)) {
    suggestions.push('Specifica il responsabile per tracciabilit\u00E0');
  }

  // Cost-related suggestions
  if (hasValue(item.businessValue) && (item.businessValue ?? 0) >= 7 && !hasValue(item.estimatedCost)) {
    suggestions.push('Aggiungi il costo stimato per elementi ad alto valore business');
  }

  // ROI suggestion
  if (hasValue(item.estimatedCost) && !hasValue(item.roi)) {
    suggestions.push('Calcola e inserisci il ROI previsto');
  }

  // Limit suggestions
  return suggestions.slice(0, 5);
}

// === HELPERS ===

/**
 * Check if a value is present and valid
 */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Quick confidence score (simplified)
 */
export function quickConfidenceScore(item: PortfolioItemForConfidence): number {
  const breakdown = calculateDetailedConfidence(item);
  return breakdown.overall;
}

/**
 * Get confidence level label
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

export default {
  calculateDetailedConfidence,
  quickConfidenceScore,
  getConfidenceLevel
};
