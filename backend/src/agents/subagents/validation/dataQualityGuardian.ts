/**
 * Data Quality Guardian
 *
 * Validates incoming data quality before processing to improve extraction accuracy.
 * Performs 8 types of validation:
 * 1. Completeness - Required fields present
 * 2. Format Validation - Dates, currencies, percentages
 * 3. Range Validation - Budget values, quantities
 * 4. Consistency - Cross-field validation
 * 5. Duplicate Detection - Pre-check against existing items
 * 6. Encoding - UTF-8 validation, special characters
 * 7. Vendor Normalization - Standardize vendor names
 * 8. Category Validation - Against known taxonomy
 */

import { SubAgent, SubAgentResult } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export type IssueSeverity = 'critical' | 'warning' | 'info';
export type IssueType =
  | 'missing_required'
  | 'invalid_format'
  | 'suspicious_value'
  | 'inconsistent'
  | 'duplicate'
  | 'out_of_range'
  | 'encoding_error'
  | 'invalid_category'
  | 'vendor_mismatch';

export type CorrectionType = 'format' | 'trim' | 'case' | 'mapping' | 'default' | 'normalization';

export interface QualityIssue {
  field: string;
  issueType: IssueType;
  severity: IssueSeverity;
  currentValue: unknown;
  expectedPattern?: string;
  suggestedFix?: unknown;
  confidence: number;
  message: string;
}

export interface AutoCorrection {
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  correctionType: CorrectionType;
  confidence: number;
  applied: boolean;
  reason: string;
}

export interface DataQualityResult {
  overallScore: number;  // 0-100
  passedValidation: boolean;
  issues: QualityIssue[];
  autoCorrections: AutoCorrection[];
  requiresHumanReview: boolean;
  suggestedActions: string[];
  fieldScores: Record<string, number>;
  itemId?: string;
  itemName?: string;
}

export interface BatchQualityResult {
  totalItems: number;
  passedCount: number;
  failedCount: number;
  reviewRequiredCount: number;
  avgScore: number;
  itemResults: DataQualityResult[];
  commonIssues: { issue: string; count: number }[];
  recommendations: string[];
}

export interface PortfolioItem {
  id?: string;
  name?: string;
  type?: string;
  category?: string;
  subcategory?: string;
  vendor?: string;
  status?: string;
  priority?: string;
  budget?: number | string;
  description?: string;
  version?: string;
  license_type?: string;
  lifecycle_stage?: string;
  start_date?: string;
  end_date?: string;
  user_count?: number | string;
  pricing_model?: string;
  deployment_type?: string;
  [key: string]: unknown;
}

export interface ValidationConfig {
  requiredFields: string[];
  minScoreToPass: number;
  autoCorrectThreshold: number;
  checkDuplicates: boolean;
  strictMode: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ValidationConfig = {
  requiredFields: ['name', 'type'],
  minScoreToPass: 60,
  autoCorrectThreshold: 0.85,
  checkDuplicates: true,
  strictMode: false
};

// ============================================================================
// Known Data Patterns
// ============================================================================

// Valid categories taxonomy
const VALID_CATEGORIES = new Set([
  'infrastructure', 'security', 'data_analytics', 'applications', 'integration',
  'collaboration', 'cloud_platform', 'development', 'networking', 'database',
  'storage', 'compute', 'identity', 'monitoring', 'backup', 'erp', 'crm',
  'hr', 'finance', 'marketing', 'sales', 'operations', 'it_service',
  'professional_service', 'managed_service', 'consulting', 'support',
  'saas', 'paas', 'iaas', 'hardware', 'software', 'other'
]);

// Valid status values
const VALID_STATUSES = new Set([
  'active', 'inactive', 'deprecated', 'planned', 'pilot', 'production',
  'development', 'testing', 'retired', 'pending', 'approved', 'rejected'
]);

// Valid priority values
const VALID_PRIORITIES = new Set([
  'critical', 'high', 'medium', 'low', 'none'
]);

// Valid lifecycle stages
const VALID_LIFECYCLE_STAGES = new Set([
  'introduction', 'growth', 'maturity', 'decline', 'end_of_life',
  'planning', 'development', 'pilot', 'production', 'sunset'
]);

// Vendor name normalizations
const VENDOR_NORMALIZATIONS: Record<string, string> = {
  'ms': 'Microsoft',
  'msft': 'Microsoft',
  'microsoft corp': 'Microsoft',
  'microsoft corporation': 'Microsoft',
  'aws': 'Amazon Web Services',
  'amazon': 'Amazon Web Services',
  'gcp': 'Google Cloud Platform',
  'google': 'Google',
  'google cloud': 'Google Cloud Platform',
  'ibm corp': 'IBM',
  'ibm corporation': 'IBM',
  'salesforce.com': 'Salesforce',
  'sfdc': 'Salesforce',
  'sap ag': 'SAP',
  'sap se': 'SAP',
  'oracle corp': 'Oracle',
  'oracle corporation': 'Oracle',
  'vmware inc': 'VMware',
  'servicenow inc': 'ServiceNow',
  'atlassian corp': 'Atlassian',
  'cisco systems': 'Cisco',
  'adobe inc': 'Adobe',
  'adobe systems': 'Adobe',
};

// Suspicious value patterns
const SUSPICIOUS_PATTERNS = {
  testData: /^test|^demo|^sample|^example|^dummy|^fake|^temp|lorem ipsum/i,
  placeholder: /^xxx|^placeholder|^tbd|^n\/a|^\?+$|^-+$/i,
  excessive: /(.)\1{4,}/,  // Same character repeated 5+ times
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate completeness - check required fields
 */
function validateCompleteness(
  item: PortfolioItem,
  requiredFields: string[]
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  for (const field of requiredFields) {
    const value = item[field];

    if (value === undefined || value === null || value === '') {
      issues.push({
        field,
        issueType: 'missing_required',
        severity: 'critical',
        currentValue: value,
        confidence: 1.0,
        message: `Required field '${field}' is missing or empty`
      });
    }
  }

  return issues;
}

/**
 * Validate format - dates, currencies, etc.
 */
function validateFormat(item: PortfolioItem): { issues: QualityIssue[]; corrections: AutoCorrection[] } {
  const issues: QualityIssue[] = [];
  const corrections: AutoCorrection[] = [];

  // Date fields
  const dateFields = ['start_date', 'end_date', 'support_end_date', 'last_updated'];
  for (const field of dateFields) {
    const value = item[field];
    if (value && typeof value === 'string') {
      const dateValue = new Date(value);
      if (isNaN(dateValue.getTime())) {
        issues.push({
          field,
          issueType: 'invalid_format',
          severity: 'warning',
          currentValue: value,
          expectedPattern: 'YYYY-MM-DD or ISO 8601',
          confidence: 0.9,
          message: `Invalid date format in '${field}'`
        });
      }
    }
  }

  // Budget field - should be numeric
  if (item.budget !== undefined && item.budget !== null) {
    let budgetValue = item.budget;

    if (typeof budgetValue === 'string') {
      // Try to extract numeric value
      const cleaned = budgetValue.replace(/[€$£,\s]/g, '').replace(',', '.');
      const numValue = parseFloat(cleaned);

      if (!isNaN(numValue)) {
        corrections.push({
          field: 'budget',
          originalValue: budgetValue,
          correctedValue: numValue,
          correctionType: 'format',
          confidence: 0.95,
          applied: false,
          reason: 'Converted string budget to number'
        });
      } else {
        issues.push({
          field: 'budget',
          issueType: 'invalid_format',
          severity: 'warning',
          currentValue: budgetValue,
          expectedPattern: 'Numeric value',
          confidence: 0.9,
          message: `Budget value '${budgetValue}' is not a valid number`
        });
      }
    }
  }

  // User count - should be numeric
  if (item.user_count !== undefined && item.user_count !== null) {
    let userCount = item.user_count;

    if (typeof userCount === 'string') {
      const numValue = parseInt(userCount.replace(/[,\s]/g, ''), 10);
      if (!isNaN(numValue)) {
        corrections.push({
          field: 'user_count',
          originalValue: userCount,
          correctedValue: numValue,
          correctionType: 'format',
          confidence: 0.95,
          applied: false,
          reason: 'Converted string user_count to number'
        });
      }
    }
  }

  // Type field - should be 'product' or 'service'
  if (item.type && typeof item.type === 'string') {
    const typeNormalized = item.type.toLowerCase().trim();
    if (!['product', 'service'].includes(typeNormalized)) {
      // Try to infer
      if (typeNormalized.includes('product') || typeNormalized.includes('software') || typeNormalized.includes('hardware')) {
        corrections.push({
          field: 'type',
          originalValue: item.type,
          correctedValue: 'product',
          correctionType: 'mapping',
          confidence: 0.8,
          applied: false,
          reason: `Inferred 'product' from '${item.type}'`
        });
      } else if (typeNormalized.includes('service') || typeNormalized.includes('consulting') || typeNormalized.includes('managed')) {
        corrections.push({
          field: 'type',
          originalValue: item.type,
          correctedValue: 'service',
          correctionType: 'mapping',
          confidence: 0.8,
          applied: false,
          reason: `Inferred 'service' from '${item.type}'`
        });
      } else {
        issues.push({
          field: 'type',
          issueType: 'invalid_format',
          severity: 'warning',
          currentValue: item.type,
          expectedPattern: "'product' or 'service'",
          suggestedFix: 'product',
          confidence: 0.7,
          message: `Type '${item.type}' should be 'product' or 'service'`
        });
      }
    }
  }

  return { issues, corrections };
}

/**
 * Validate ranges - budget values, quantities
 */
function validateRanges(item: PortfolioItem): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Budget range check
  if (typeof item.budget === 'number') {
    if (item.budget < 0) {
      issues.push({
        field: 'budget',
        issueType: 'out_of_range',
        severity: 'warning',
        currentValue: item.budget,
        expectedPattern: '>= 0',
        suggestedFix: 0,
        confidence: 0.9,
        message: 'Budget cannot be negative'
      });
    } else if (item.budget > 1000000000) {  // 1 billion
      issues.push({
        field: 'budget',
        issueType: 'suspicious_value',
        severity: 'warning',
        currentValue: item.budget,
        confidence: 0.8,
        message: 'Budget value seems unusually high - please verify'
      });
    }
  }

  // User count range check
  if (typeof item.user_count === 'number') {
    if (item.user_count < 0) {
      issues.push({
        field: 'user_count',
        issueType: 'out_of_range',
        severity: 'warning',
        currentValue: item.user_count,
        expectedPattern: '>= 0',
        suggestedFix: 0,
        confidence: 0.9,
        message: 'User count cannot be negative'
      });
    } else if (item.user_count > 10000000) {  // 10 million
      issues.push({
        field: 'user_count',
        issueType: 'suspicious_value',
        severity: 'info',
        currentValue: item.user_count,
        confidence: 0.7,
        message: 'User count seems unusually high - please verify'
      });
    }
  }

  return issues;
}

/**
 * Validate consistency - cross-field validation
 */
function validateConsistency(item: PortfolioItem): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // End date should be after start date
  if (item.start_date && item.end_date) {
    const startDate = new Date(item.start_date);
    const endDate = new Date(item.end_date);

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      if (endDate < startDate) {
        issues.push({
          field: 'end_date',
          issueType: 'inconsistent',
          severity: 'warning',
          currentValue: item.end_date,
          expectedPattern: `After start_date (${item.start_date})`,
          confidence: 0.95,
          message: 'End date is before start date'
        });
      }
    }
  }

  // Lifecycle stage consistency with status
  if (item.lifecycle_stage === 'end_of_life' && item.status === 'active') {
    issues.push({
      field: 'status',
      issueType: 'inconsistent',
      severity: 'warning',
      currentValue: item.status,
      suggestedFix: 'deprecated',
      confidence: 0.8,
      message: 'Status "active" inconsistent with lifecycle stage "end_of_life"'
    });
  }

  // Priority vs budget consistency
  if (item.priority === 'critical' && typeof item.budget === 'number' && item.budget < 1000) {
    issues.push({
      field: 'budget',
      issueType: 'inconsistent',
      severity: 'info',
      currentValue: item.budget,
      confidence: 0.6,
      message: 'Critical priority item has very low budget - please verify'
    });
  }

  return issues;
}

/**
 * Check for suspicious/test values
 */
function checkSuspiciousValues(item: PortfolioItem): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const fieldsToCheck = ['name', 'description', 'vendor'];

  for (const field of fieldsToCheck) {
    const value = item[field];
    if (typeof value === 'string') {
      // Check for test data patterns
      if (SUSPICIOUS_PATTERNS.testData.test(value)) {
        issues.push({
          field,
          issueType: 'suspicious_value',
          severity: 'warning',
          currentValue: value,
          confidence: 0.85,
          message: `Field '${field}' appears to contain test data`
        });
      }

      // Check for placeholder patterns
      if (SUSPICIOUS_PATTERNS.placeholder.test(value)) {
        issues.push({
          field,
          issueType: 'suspicious_value',
          severity: 'warning',
          currentValue: value,
          confidence: 0.9,
          message: `Field '${field}' appears to contain placeholder text`
        });
      }

      // Check for excessive repetition
      if (SUSPICIOUS_PATTERNS.excessive.test(value)) {
        issues.push({
          field,
          issueType: 'suspicious_value',
          severity: 'info',
          currentValue: value,
          confidence: 0.7,
          message: `Field '${field}' contains excessive character repetition`
        });
      }
    }
  }

  return issues;
}

/**
 * Validate and normalize vendor names
 */
function validateVendor(item: PortfolioItem): { issues: QualityIssue[]; corrections: AutoCorrection[] } {
  const issues: QualityIssue[] = [];
  const corrections: AutoCorrection[] = [];

  if (item.vendor && typeof item.vendor === 'string') {
    const vendorLower = item.vendor.toLowerCase().trim();

    // Check for known normalization
    if (VENDOR_NORMALIZATIONS[vendorLower]) {
      corrections.push({
        field: 'vendor',
        originalValue: item.vendor,
        correctedValue: VENDOR_NORMALIZATIONS[vendorLower],
        correctionType: 'normalization',
        confidence: 0.95,
        applied: false,
        reason: `Normalized vendor name to standard form`
      });
    }

    // Check for very short vendor names (likely abbreviations)
    if (item.vendor.length <= 2 && !['3M', 'HP', 'GE', 'AT', 'BT'].includes(item.vendor.toUpperCase())) {
      issues.push({
        field: 'vendor',
        issueType: 'suspicious_value',
        severity: 'info',
        currentValue: item.vendor,
        confidence: 0.7,
        message: 'Vendor name is very short - may be abbreviated'
      });
    }

    // Trim whitespace
    if (item.vendor !== item.vendor.trim()) {
      corrections.push({
        field: 'vendor',
        originalValue: item.vendor,
        correctedValue: item.vendor.trim(),
        correctionType: 'trim',
        confidence: 1.0,
        applied: false,
        reason: 'Removed leading/trailing whitespace'
      });
    }
  }

  return { issues, corrections };
}

/**
 * Validate category against known taxonomy
 */
function validateCategory(item: PortfolioItem): { issues: QualityIssue[]; corrections: AutoCorrection[] } {
  const issues: QualityIssue[] = [];
  const corrections: AutoCorrection[] = [];

  if (item.category && typeof item.category === 'string') {
    const categoryNormalized = item.category.toLowerCase().replace(/[\s-]/g, '_').trim();

    if (!VALID_CATEGORIES.has(categoryNormalized)) {
      // Try to find similar category
      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const validCat of VALID_CATEGORIES) {
        if (categoryNormalized.includes(validCat) || validCat.includes(categoryNormalized)) {
          const score = Math.min(categoryNormalized.length, validCat.length) /
                        Math.max(categoryNormalized.length, validCat.length);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = validCat;
          }
        }
      }

      if (bestMatch && bestScore > 0.5) {
        corrections.push({
          field: 'category',
          originalValue: item.category,
          correctedValue: bestMatch,
          correctionType: 'mapping',
          confidence: bestScore,
          applied: false,
          reason: `Mapped to closest valid category`
        });
      } else {
        issues.push({
          field: 'category',
          issueType: 'invalid_category',
          severity: 'info',
          currentValue: item.category,
          expectedPattern: `One of: ${Array.from(VALID_CATEGORIES).slice(0, 10).join(', ')}...`,
          suggestedFix: 'other',
          confidence: 0.7,
          message: `Category '${item.category}' not in standard taxonomy`
        });
      }
    }
  }

  // Validate status
  if (item.status && typeof item.status === 'string') {
    const statusNormalized = item.status.toLowerCase().trim();
    if (!VALID_STATUSES.has(statusNormalized)) {
      issues.push({
        field: 'status',
        issueType: 'invalid_format',
        severity: 'info',
        currentValue: item.status,
        expectedPattern: `One of: ${Array.from(VALID_STATUSES).join(', ')}`,
        confidence: 0.8,
        message: `Status '${item.status}' not in standard values`
      });
    }
  }

  // Validate priority
  if (item.priority && typeof item.priority === 'string') {
    const priorityNormalized = item.priority.toLowerCase().trim();
    if (!VALID_PRIORITIES.has(priorityNormalized)) {
      issues.push({
        field: 'priority',
        issueType: 'invalid_format',
        severity: 'info',
        currentValue: item.priority,
        expectedPattern: `One of: ${Array.from(VALID_PRIORITIES).join(', ')}`,
        confidence: 0.8,
        message: `Priority '${item.priority}' not in standard values`
      });
    }
  }

  // Validate lifecycle stage
  if (item.lifecycle_stage && typeof item.lifecycle_stage === 'string') {
    const stageNormalized = item.lifecycle_stage.toLowerCase().replace(/[\s-]/g, '_').trim();
    if (!VALID_LIFECYCLE_STAGES.has(stageNormalized)) {
      issues.push({
        field: 'lifecycle_stage',
        issueType: 'invalid_format',
        severity: 'info',
        currentValue: item.lifecycle_stage,
        expectedPattern: `One of: ${Array.from(VALID_LIFECYCLE_STAGES).join(', ')}`,
        confidence: 0.8,
        message: `Lifecycle stage '${item.lifecycle_stage}' not in standard values`
      });
    }
  }

  return { issues, corrections };
}

/**
 * Check for encoding issues
 */
function checkEncoding(item: PortfolioItem): { issues: QualityIssue[]; corrections: AutoCorrection[] } {
  const issues: QualityIssue[] = [];
  const corrections: AutoCorrection[] = [];

  const stringFields = ['name', 'description', 'vendor', 'category'];

  for (const field of stringFields) {
    const value = item[field];
    if (typeof value === 'string') {
      // Check for common encoding issues
      if (value.includes('�') || value.includes('\ufffd')) {
        issues.push({
          field,
          issueType: 'encoding_error',
          severity: 'warning',
          currentValue: value,
          confidence: 0.95,
          message: `Field '${field}' contains invalid/replacement characters`
        });
      }

      // Check for HTML entities that weren't decoded
      if (/&[a-z]+;|&#\d+;/i.test(value)) {
        const decoded = value
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        if (decoded !== value) {
          corrections.push({
            field,
            originalValue: value,
            correctedValue: decoded,
            correctionType: 'format',
            confidence: 0.9,
            applied: false,
            reason: 'Decoded HTML entities'
          });
        }
      }

      // Check for control characters
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
        const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
        corrections.push({
          field,
          originalValue: value,
          correctedValue: cleaned,
          correctionType: 'format',
          confidence: 0.95,
          applied: false,
          reason: 'Removed control characters'
        });
      }
    }
  }

  return { issues, corrections };
}

/**
 * Calculate field score based on issues
 */
function calculateFieldScore(field: string, issues: QualityIssue[]): number {
  const fieldIssues = issues.filter(i => i.field === field);

  if (fieldIssues.length === 0) return 100;

  let penalty = 0;
  for (const issue of fieldIssues) {
    switch (issue.severity) {
      case 'critical': penalty += 40; break;
      case 'warning': penalty += 20; break;
      case 'info': penalty += 5; break;
    }
  }

  return Math.max(0, 100 - penalty);
}

/**
 * Calculate overall quality score
 */
function calculateOverallScore(issues: QualityIssue[]): number {
  if (issues.length === 0) return 100;

  let totalPenalty = 0;
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical': totalPenalty += 25; break;
      case 'warning': totalPenalty += 10; break;
      case 'info': totalPenalty += 2; break;
    }
  }

  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a single portfolio item
 */
export function validateItem(
  item: PortfolioItem,
  config: ValidationConfig = DEFAULT_CONFIG
): DataQualityResult {
  const allIssues: QualityIssue[] = [];
  const allCorrections: AutoCorrection[] = [];

  // 1. Completeness validation
  allIssues.push(...validateCompleteness(item, config.requiredFields));

  // 2. Format validation
  const formatResult = validateFormat(item);
  allIssues.push(...formatResult.issues);
  allCorrections.push(...formatResult.corrections);

  // 3. Range validation
  allIssues.push(...validateRanges(item));

  // 4. Consistency validation
  allIssues.push(...validateConsistency(item));

  // 5. Suspicious value check
  allIssues.push(...checkSuspiciousValues(item));

  // 6. Encoding check
  const encodingResult = checkEncoding(item);
  allIssues.push(...encodingResult.issues);
  allCorrections.push(...encodingResult.corrections);

  // 7. Vendor validation and normalization
  const vendorResult = validateVendor(item);
  allIssues.push(...vendorResult.issues);
  allCorrections.push(...vendorResult.corrections);

  // 8. Category validation
  const categoryResult = validateCategory(item);
  allIssues.push(...categoryResult.issues);
  allCorrections.push(...categoryResult.corrections);

  // Calculate scores
  const overallScore = calculateOverallScore(allIssues);
  const passedValidation = overallScore >= config.minScoreToPass;

  // Determine if human review is needed
  const hasCriticalIssues = allIssues.some(i => i.severity === 'critical');
  const lowConfidenceCorrections = allCorrections.filter(c => c.confidence < config.autoCorrectThreshold);
  const requiresHumanReview = hasCriticalIssues ||
                               lowConfidenceCorrections.length > 2 ||
                               overallScore < 40;

  // Mark high-confidence corrections as applied
  for (const correction of allCorrections) {
    if (correction.confidence >= config.autoCorrectThreshold) {
      correction.applied = true;
    }
  }

  // Calculate field scores
  const fieldScores: Record<string, number> = {};
  const allFields = new Set([
    ...config.requiredFields,
    ...allIssues.map(i => i.field),
    ...allCorrections.map(c => c.field)
  ]);

  for (const field of allFields) {
    fieldScores[field] = calculateFieldScore(field, allIssues);
  }

  // Generate suggested actions
  const suggestedActions: string[] = [];

  if (hasCriticalIssues) {
    suggestedActions.push('Fix critical issues before proceeding');
  }

  const appliedCorrections = allCorrections.filter(c => c.applied);
  if (appliedCorrections.length > 0) {
    suggestedActions.push(`${appliedCorrections.length} auto-corrections applied`);
  }

  const pendingCorrections = allCorrections.filter(c => !c.applied);
  if (pendingCorrections.length > 0) {
    suggestedActions.push(`Review ${pendingCorrections.length} suggested corrections`);
  }

  return {
    overallScore,
    passedValidation,
    issues: allIssues,
    autoCorrections: allCorrections,
    requiresHumanReview,
    suggestedActions,
    fieldScores,
    itemId: item.id,
    itemName: item.name
  };
}

/**
 * Validate a batch of portfolio items
 */
export function validateBatch(
  items: PortfolioItem[],
  config: ValidationConfig = DEFAULT_CONFIG
): BatchQualityResult {
  const itemResults: DataQualityResult[] = items.map(item => validateItem(item, config));

  const passedCount = itemResults.filter(r => r.passedValidation).length;
  const failedCount = itemResults.filter(r => !r.passedValidation).length;
  const reviewRequiredCount = itemResults.filter(r => r.requiresHumanReview).length;
  const avgScore = itemResults.reduce((sum, r) => sum + r.overallScore, 0) / Math.max(items.length, 1);

  // Aggregate common issues
  const issueFrequency: Record<string, number> = {};
  for (const result of itemResults) {
    for (const issue of result.issues) {
      const key = `${issue.issueType}: ${issue.field}`;
      issueFrequency[key] = (issueFrequency[key] || 0) + 1;
    }
  }

  const commonIssues = Object.entries(issueFrequency)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Generate recommendations
  const recommendations: string[] = [];

  if (avgScore < 60) {
    recommendations.push('Consider reviewing data source - average quality is low');
  }

  if (commonIssues.length > 0) {
    const topIssue = commonIssues[0];
    if (topIssue.count > items.length * 0.3) {
      recommendations.push(`Address recurring issue: ${topIssue.issue} (affects ${topIssue.count} items)`);
    }
  }

  if (reviewRequiredCount > items.length * 0.2) {
    recommendations.push('High percentage of items need human review - consider refining extraction');
  }

  return {
    totalItems: items.length,
    passedCount,
    failedCount,
    reviewRequiredCount,
    avgScore: Math.round(avgScore),
    itemResults,
    commonIssues,
    recommendations
  };
}

/**
 * Apply corrections to an item
 */
export function applyCorrections(
  item: PortfolioItem,
  corrections: AutoCorrection[]
): PortfolioItem {
  const correctedItem = { ...item };

  for (const correction of corrections) {
    if (correction.applied) {
      correctedItem[correction.field] = correction.correctedValue;
    }
  }

  return correctedItem;
}

// ============================================================================
// Sub-Agent Implementation
// ============================================================================

export const dataQualityGuardian: SubAgent = {
  name: 'VALIDATOR',

  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    const items = args.items as PortfolioItem[] || [];
    const config = args.config as Partial<ValidationConfig> || {};
    const applyAutoCorrections = args.applyCorrections as boolean ?? true;

    const validationConfig: ValidationConfig = { ...DEFAULT_CONFIG, ...config };

    if (items.length === 0) {
      return {
        content: 'No items provided for validation.',
        metadata: { error: 'No items' }
      };
    }

    try {
      // Validate batch
      const batchResult = validateBatch(items, validationConfig);

      // Optionally apply corrections
      let correctedItems = items;
      if (applyAutoCorrections) {
        correctedItems = items.map((item, index) => {
          const result = batchResult.itemResults[index];
          return applyCorrections(item, result.autoCorrections);
        });
      }

      // Generate summary content
      const contentParts = [
        `## Data Quality Validation Report`,
        ``,
        `**Total Items:** ${batchResult.totalItems}`,
        `**Average Quality Score:** ${batchResult.avgScore}/100`,
        ``,
        `| Status | Count |`,
        `|--------|-------|`,
        `| Passed | ${batchResult.passedCount} |`,
        `| Failed | ${batchResult.failedCount} |`,
        `| Review Required | ${batchResult.reviewRequiredCount} |`,
      ];

      if (batchResult.commonIssues.length > 0) {
        contentParts.push(``, `### Common Issues`);
        for (const { issue, count } of batchResult.commonIssues.slice(0, 5)) {
          contentParts.push(`- ${issue}: ${count} items`);
        }
      }

      if (batchResult.recommendations.length > 0) {
        contentParts.push(``, `### Recommendations`);
        for (const rec of batchResult.recommendations) {
          contentParts.push(`- ${rec}`);
        }
      }

      // Count corrections
      const totalCorrections = batchResult.itemResults
        .reduce((sum, r) => sum + r.autoCorrections.filter(c => c.applied).length, 0);

      if (totalCorrections > 0) {
        contentParts.push(``, `**Auto-corrections Applied:** ${totalCorrections}`);
      }

      return {
        content: contentParts.join('\n'),
        metadata: {
          batchResult,
          correctedItems: applyAutoCorrections ? correctedItems : undefined,
          totalCorrections
        }
      };
    } catch (error) {
      console.error('[DataQualityGuardian] Error:', error);
      return {
        content: `Error validating data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: String(error) }
      };
    }
  }
};

export default dataQualityGuardian;
