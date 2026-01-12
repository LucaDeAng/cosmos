/**
 * Item Validator
 *
 * Robust validation engine for normalized portfolio items.
 * Implements field-level validation, quality gates, and quarantine logic.
 */

import { NormalizedItem } from './normalizerAgent';

// Validation error codes
export enum ValidationErrorCode {
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_VALUE = 'INVALID_VALUE',
  OUT_OF_RANGE = 'OUT_OF_RANGE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_ENUM = 'INVALID_ENUM',
  CONFIDENCE_TOO_LOW = 'CONFIDENCE_TOO_LOW',
  INCONSISTENT_DATA = 'INCONSISTENT_DATA',
}

// Validation severity levels
export enum ValidationSeverity {
  ERROR = 'ERROR',     // Blocking - item goes to quarantine
  WARNING = 'WARNING', // Non-blocking - item accepted with flag
  INFO = 'INFO',       // Informational only
}

// Validation error/warning
export interface ValidationIssue {
  field: string;
  code: ValidationErrorCode;
  severity: ValidationSeverity;
  message: string;
  actualValue?: any;
  expectedValue?: any;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  score: number;  // 0-1 overall quality score
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  quarantine: boolean;
  quarantineReasons: string[];
}

// Field-level validator configuration
interface FieldValidator {
  required: boolean;
  minConfidence?: number;
  validator?: (value: any, item: NormalizedItem) => ValidationIssue[];
  allowedValues?: any[];
  description?: string;
}

// Quality gate thresholds
export const QUALITY_GATES = {
  MIN_OVERALL_CONFIDENCE: 0.4,
  MIN_FIELD_CONFIDENCE: 0.3,
  QUARANTINE_THRESHOLD: 0.3,
  MIN_REQUIRED_FIELDS: ['name', 'type'] as const,
  RECOMMENDED_FIELDS: ['description', 'status', 'category'] as const,
};

/**
 * Date validation
 */
function validateDate(dateStr: string): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;

  // Reasonable date range: 1990-2050
  const year = date.getFullYear();
  return year >= 1990 && year <= 2050;
}

/**
 * Budget validation
 */
function validateBudget(budget: number): boolean {
  // Positive and reasonable (< 1 billion EUR)
  return budget > 0 && budget < 1_000_000_000;
}

/**
 * Date consistency validation (start < end)
 */
function validateDateConsistency(
  startDate?: string,
  endDate?: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!startDate || !endDate) return issues;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    issues.push({
      field: 'dates',
      code: ValidationErrorCode.INCONSISTENT_DATA,
      severity: ValidationSeverity.ERROR,
      message: 'Start date must be before end date',
      actualValue: { startDate, endDate },
    });
  }

  return issues;
}

/**
 * Field validators configuration
 */
const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  // Core required fields
  name: {
    required: true,
    minConfidence: 0.7,
    description: 'Item name/title',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (typeof value !== 'string' || value.trim().length === 0) {
        issues.push({
          field: 'name',
          code: ValidationErrorCode.INVALID_VALUE,
          severity: ValidationSeverity.ERROR,
          message: 'Name must be a non-empty string',
          actualValue: value,
        });
      }
      if (value && value.length < 3) {
        issues.push({
          field: 'name',
          code: ValidationErrorCode.INVALID_VALUE,
          severity: ValidationSeverity.WARNING,
          message: 'Name is very short (< 3 characters)',
          actualValue: value,
        });
      }
      return issues;
    },
  },

  type: {
    required: true,
    minConfidence: 0.5,
    allowedValues: ['initiative', 'product', 'service'],
    description: 'Portfolio item type',
  },

  status: {
    required: true,
    allowedValues: ['active', 'paused', 'completed', 'cancelled', 'proposed'],
    description: 'Current status',
  },

  description: {
    required: false,
    description: 'Detailed description',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (!value || value.trim().length === 0) {
        issues.push({
          field: 'description',
          code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
          severity: ValidationSeverity.WARNING,
          message: 'Description is missing - recommended for better context',
        });
      }
      return issues;
    },
  },

  priority: {
    required: false,
    allowedValues: ['critical', 'high', 'medium', 'low'],
    description: 'Priority level',
  },

  budget: {
    required: false,
    description: 'Budget in EUR',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number') {
          issues.push({
            field: 'budget',
            code: ValidationErrorCode.INVALID_FORMAT,
            severity: ValidationSeverity.ERROR,
            message: 'Budget must be a number',
            actualValue: value,
          });
        } else if (!validateBudget(value)) {
          issues.push({
            field: 'budget',
            code: ValidationErrorCode.OUT_OF_RANGE,
            severity: ValidationSeverity.ERROR,
            message: 'Budget must be positive and less than 1 billion EUR',
            actualValue: value,
          });
        }
      }
      return issues;
    },
  },

  startDate: {
    required: false,
    description: 'Start date (ISO format)',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (value && !validateDate(value)) {
        issues.push({
          field: 'startDate',
          code: ValidationErrorCode.INVALID_FORMAT,
          severity: ValidationSeverity.ERROR,
          message: 'Invalid start date format or unreasonable date',
          actualValue: value,
          expectedValue: 'ISO date string (YYYY-MM-DD)',
        });
      }
      return issues;
    },
  },

  endDate: {
    required: false,
    description: 'End date (ISO format)',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (value && !validateDate(value)) {
        issues.push({
          field: 'endDate',
          code: ValidationErrorCode.INVALID_FORMAT,
          severity: ValidationSeverity.ERROR,
          message: 'Invalid end date format or unreasonable date',
          actualValue: value,
          expectedValue: 'ISO date string (YYYY-MM-DD)',
        });
      }
      return issues;
    },
  },

  riskLevel: {
    required: false,
    allowedValues: ['low', 'medium', 'high', 'critical'],
    description: 'Risk assessment level',
  },

  complexity: {
    required: false,
    allowedValues: ['low', 'medium', 'high'],
    description: 'Complexity level',
  },

  strategicAlignment: {
    required: false,
    description: 'Strategic alignment score (1-10)',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 1 || value > 10) {
          issues.push({
            field: 'strategicAlignment',
            code: ValidationErrorCode.OUT_OF_RANGE,
            severity: ValidationSeverity.ERROR,
            message: 'Strategic alignment must be between 1 and 10',
            actualValue: value,
            expectedValue: '1-10',
          });
        }
      }
      return issues;
    },
  },

  businessValue: {
    required: false,
    description: 'Business value score (1-10)',
    validator: (value) => {
      const issues: ValidationIssue[] = [];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || value < 1 || value > 10) {
          issues.push({
            field: 'businessValue',
            code: ValidationErrorCode.OUT_OF_RANGE,
            severity: ValidationSeverity.ERROR,
            message: 'Business value must be between 1 and 10',
            actualValue: value,
            expectedValue: '1-10',
          });
        }
      }
      return issues;
    },
  },
};

/**
 * Validate a single field
 */
function validateField(
  fieldName: string,
  value: any,
  item: NormalizedItem
): ValidationIssue[] {
  const validator = FIELD_VALIDATORS[fieldName];
  if (!validator) return [];

  const issues: ValidationIssue[] = [];

  // Check if required field is missing
  if (validator.required && (value === undefined || value === null || value === '')) {
    issues.push({
      field: fieldName,
      code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
      severity: ValidationSeverity.ERROR,
      message: `Required field '${fieldName}' is missing`,
    });
    return issues;
  }

  // Check if value is in allowed values (enum validation)
  if (validator.allowedValues && value !== undefined && value !== null) {
    if (!validator.allowedValues.includes(value)) {
      issues.push({
        field: fieldName,
        code: ValidationErrorCode.INVALID_ENUM,
        severity: ValidationSeverity.ERROR,
        message: `Invalid value for '${fieldName}'`,
        actualValue: value,
        expectedValue: validator.allowedValues.join(', '),
      });
    }
  }

  // Run custom validator if provided
  if (validator.validator && value !== undefined && value !== null) {
    const customIssues = validator.validator(value, item);
    issues.push(...customIssues);
  }

  return issues;
}

/**
 * Validate an entire normalized item
 */
export function validateNormalizedItem(
  item: NormalizedItem,
  options: {
    strictMode?: boolean;
    skipConfidenceCheck?: boolean;
  } = {}
): ValidationResult {
  const { strictMode = false, skipConfidenceCheck = false } = options;

  const issues: ValidationIssue[] = [];

  // Validate all fields
  Object.keys(FIELD_VALIDATORS).forEach((fieldName) => {
    const fieldIssues = validateField(fieldName, item[fieldName as keyof NormalizedItem], item);
    issues.push(...fieldIssues);
  });

  // Cross-field validation: date consistency
  const dateConsistencyIssues = validateDateConsistency(item.startDate, item.endDate);
  issues.push(...dateConsistencyIssues);

  // Confidence validation
  if (!skipConfidenceCheck) {
    if (item.confidence < QUALITY_GATES.MIN_OVERALL_CONFIDENCE) {
      issues.push({
        field: 'confidence',
        code: ValidationErrorCode.CONFIDENCE_TOO_LOW,
        severity: strictMode ? ValidationSeverity.ERROR : ValidationSeverity.WARNING,
        message: `Overall confidence (${item.confidence.toFixed(2)}) below minimum threshold (${QUALITY_GATES.MIN_OVERALL_CONFIDENCE})`,
        actualValue: item.confidence,
        expectedValue: `>= ${QUALITY_GATES.MIN_OVERALL_CONFIDENCE}`,
      });
    }
  }

  // Check for recommended fields
  QUALITY_GATES.RECOMMENDED_FIELDS.forEach((field) => {
    const value = item[field];
    if (!value || (typeof value === 'string' && value.trim().length === 0)) {
      issues.push({
        field,
        code: ValidationErrorCode.REQUIRED_FIELD_MISSING,
        severity: ValidationSeverity.INFO,
        message: `Recommended field '${field}' is missing`,
      });
    }
  });

  // Separate errors and warnings
  const errors = issues.filter((i) => i.severity === ValidationSeverity.ERROR);
  const warnings = issues.filter((i) => i.severity === ValidationSeverity.WARNING);

  // Determine if item should be quarantined
  const quarantine = errors.length > 0 || item.confidence < QUALITY_GATES.QUARANTINE_THRESHOLD;
  const quarantineReasons: string[] = [];

  if (errors.length > 0) {
    quarantineReasons.push(`${errors.length} validation error(s)`);
  }
  if (item.confidence < QUALITY_GATES.QUARANTINE_THRESHOLD) {
    quarantineReasons.push(`Low confidence (${item.confidence.toFixed(2)})`);
  }

  // Calculate quality score
  const errorPenalty = errors.length * 0.1;
  const warningPenalty = warnings.length * 0.05;
  const confidenceScore = item.confidence;
  const qualityScore = Math.max(0, Math.min(1, confidenceScore - errorPenalty - warningPenalty));

  return {
    valid: errors.length === 0,
    score: qualityScore,
    errors,
    warnings,
    quarantine,
    quarantineReasons,
  };
}

/**
 * Validate a batch of normalized items
 */
export function validateBatch(
  items: NormalizedItem[],
  options: {
    strictMode?: boolean;
    skipConfidenceCheck?: boolean;
  } = {}
): {
  results: Map<string, ValidationResult>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    quarantined: number;
    avgScore: number;
  };
} {
  const results = new Map<string, ValidationResult>();

  let validCount = 0;
  let invalidCount = 0;
  let quarantinedCount = 0;
  let totalScore = 0;

  items.forEach((item) => {
    const validation = validateNormalizedItem(item, options);
    results.set(item.id, validation);

    if (validation.valid) validCount++;
    else invalidCount++;

    if (validation.quarantine) quarantinedCount++;

    totalScore += validation.score;
  });

  return {
    results,
    summary: {
      total: items.length,
      valid: validCount,
      invalid: invalidCount,
      quarantined: quarantinedCount,
      avgScore: items.length > 0 ? totalScore / items.length : 0,
    },
  };
}

/**
 * Filter items based on validation results
 */
export function filterValidatedItems(
  items: NormalizedItem[],
  validationResults: Map<string, ValidationResult>,
  filterMode: 'all' | 'valid_only' | 'non_quarantined' = 'non_quarantined'
): {
  accepted: NormalizedItem[];
  quarantined: NormalizedItem[];
  rejected: NormalizedItem[];
} {
  const accepted: NormalizedItem[] = [];
  const quarantined: NormalizedItem[] = [];
  const rejected: NormalizedItem[] = [];

  items.forEach((item) => {
    const validation = validationResults.get(item.id);
    if (!validation) {
      // No validation result - quarantine by default
      quarantined.push(item);
      return;
    }

    if (filterMode === 'all') {
      accepted.push(item);
    } else if (filterMode === 'valid_only') {
      if (validation.valid) {
        accepted.push(item);
      } else {
        rejected.push(item);
      }
    } else {
      // 'non_quarantined' mode (default)
      if (validation.quarantine) {
        quarantined.push(item);
      } else {
        accepted.push(item);
      }
    }
  });

  return { accepted, quarantined, rejected };
}

/**
 * Generate validation report
 */
export function generateValidationReport(
  items: NormalizedItem[],
  validationResults: Map<string, ValidationResult>
): string {
  const { summary } = validateBatch(items);

  let report = `# Validation Report\n\n`;
  report += `**Total Items**: ${summary.total}\n`;
  report += `**Valid**: ${summary.valid} (${((summary.valid / summary.total) * 100).toFixed(1)}%)\n`;
  report += `**Invalid**: ${summary.invalid} (${((summary.invalid / summary.total) * 100).toFixed(1)}%)\n`;
  report += `**Quarantined**: ${summary.quarantined} (${((summary.quarantined / summary.total) * 100).toFixed(1)}%)\n`;
  report += `**Avg Quality Score**: ${summary.avgScore.toFixed(2)}\n\n`;

  // Error summary
  const allErrors: Map<string, number> = new Map();
  const allWarnings: Map<string, number> = new Map();

  validationResults.forEach((result) => {
    result.errors.forEach((error) => {
      const key = `${error.field}: ${error.message}`;
      allErrors.set(key, (allErrors.get(key) || 0) + 1);
    });
    result.warnings.forEach((warning) => {
      const key = `${warning.field}: ${warning.message}`;
      allWarnings.set(key, (allWarnings.get(key) || 0) + 1);
    });
  });

  if (allErrors.size > 0) {
    report += `## Common Errors\n\n`;
    Array.from(allErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([msg, count]) => {
        report += `- ${msg} (${count}x)\n`;
      });
    report += `\n`;
  }

  if (allWarnings.size > 0) {
    report += `## Common Warnings\n\n`;
    Array.from(allWarnings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([msg, count]) => {
        report += `- ${msg} (${count}x)\n`;
      });
    report += `\n`;
  }

  return report;
}

export default {
  validateNormalizedItem,
  validateBatch,
  filterValidatedItems,
  generateValidationReport,
  QUALITY_GATES,
};
