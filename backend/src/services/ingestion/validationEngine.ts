// backend/src/services/ingestion/validationEngine.ts

import { ExtractedItem, ValidationRule, ValidationResult, ExtractedField, FieldTransform } from './types';

// Default validation rules
const DEFAULT_VALIDATION_RULES: ValidationRule[] = [
  {
    field: 'name',
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 300,
    antiPatterns: [/^test$/i, /^xxx/i, /^null$/i, /^undefined$/i, /^n\/a$/i, /^\s*$/, /^-+$/, /^\.$/, /^\.+$/],
  },
  {
    field: 'description',
    required: false,
    type: 'string',
    maxLength: 5000,
  },
  {
    field: 'price',
    required: false,
    type: 'number',
    min: 0,
    max: 100000000, // 100M
    transforms: [
      { type: 'currency_parse', params: { removeSymbols: ['€', '$', '£', 'EUR'] } },
    ],
  },
  {
    field: 'budget',
    required: false,
    type: 'number',
    min: 0,
    max: 1000000000, // 1B
    transforms: [
      { type: 'currency_parse', params: { removeSymbols: ['€', '$', '£', 'EUR', 'k', 'K', 'M'] } },
    ],
  },
  {
    field: 'category',
    required: false,
    type: 'string',
    minLength: 2,
    maxLength: 100,
  },
  {
    field: 'subcategory',
    required: false,
    type: 'string',
    minLength: 2,
    maxLength: 100,
  },
  {
    field: 'sku',
    required: false,
    type: 'string',
    minLength: 1,
    maxLength: 100,
    pattern: /^[A-Za-z0-9\-_\.\/]+$/,
  },
  {
    field: 'status',
    required: false,
    type: 'string',
    allowedValues: [
      'active', 'inactive', 'draft', 'pending', 'approved', 'rejected',
      'in_progress', 'completed', 'cancelled', 'on_hold',
      'attivo', 'inattivo', 'bozza', 'in attesa', 'approvato', 'rifiutato',
      'in corso', 'completato', 'annullato', 'sospeso'
    ],
  },
  {
    field: 'priority',
    required: false,
    type: 'string',
    allowedValues: [
      'low', 'medium', 'high', 'critical', 'urgent',
      'bassa', 'media', 'alta', 'critica', 'urgente',
      '1', '2', '3', '4', '5'
    ],
  },
  {
    field: 'owner',
    required: false,
    type: 'string',
    minLength: 2,
    maxLength: 200,
  },
  {
    field: 'vendor',
    required: false,
    type: 'string',
    minLength: 2,
    maxLength: 200,
  },
  {
    field: 'type',
    required: true,
    type: 'string',
    allowedValues: ['product', 'service'],
  },
  {
    field: 'quantity',
    required: false,
    type: 'number',
    min: 0,
    max: 1000000000,
  },
];

export function validateItem(
  item: ExtractedItem,
  customRules?: ValidationRule[]
): ValidationResult {
  const rules = customRules || DEFAULT_VALIDATION_RULES;
  const errors: ValidationResult['errors'] = [];
  const fixes: Record<string, any> = {};
  let totalConfidence = 0;
  let fieldCount = 0;

  for (const rule of rules) {
    const field = item[rule.field as keyof ExtractedItem] as ExtractedField | undefined;
    const value = field?.value;

    // Track confidence
    if (field?.confidence) {
      totalConfidence += field.confidence;
      fieldCount++;
    }

    // Required check
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: rule.field,
        message: `${rule.field} è obbligatorio`,
        severity: 'error',
      });
      continue;
    }

    // Skip validation if value is empty and not required
    if (value === undefined || value === null || value === '') continue;

    // Apply transforms and get fixed value
    let fixedValue = value;
    if (rule.transforms) {
      for (const transform of rule.transforms) {
        fixedValue = applyTransform(fixedValue, transform);
      }
      if (fixedValue !== value) {
        fixes[rule.field] = fixedValue;
      }
    }

    // Type check
    if (rule.type) {
      const typeValid = validateType(fixedValue, rule.type);
      if (!typeValid) {
        errors.push({
          field: rule.field,
          message: `${rule.field} deve essere di tipo ${rule.type}`,
          severity: 'error',
        });
      }
    }

    // String validations
    if (typeof fixedValue === 'string') {
      if (rule.minLength && fixedValue.length < rule.minLength) {
        errors.push({
          field: rule.field,
          message: `${rule.field} deve avere almeno ${rule.minLength} caratteri`,
          severity: 'warning',
        });
      }

      if (rule.maxLength && fixedValue.length > rule.maxLength) {
        fixes[rule.field] = fixedValue.slice(0, rule.maxLength);
        errors.push({
          field: rule.field,
          message: `${rule.field} troncato a ${rule.maxLength} caratteri`,
          severity: 'warning',
        });
      }

      if (rule.pattern && !rule.pattern.test(fixedValue)) {
        errors.push({
          field: rule.field,
          message: `${rule.field} non corrisponde al formato richiesto`,
          severity: 'warning',
        });
      }

      if (rule.antiPatterns) {
        for (const antiPattern of rule.antiPatterns) {
          if (antiPattern.test(fixedValue)) {
            errors.push({
              field: rule.field,
              message: `${rule.field} contiene un valore non valido`,
              severity: 'error',
            });
            break;
          }
        }
      }

      if (rule.allowedValues && !rule.allowedValues.includes(fixedValue.toLowerCase())) {
        // Try to normalize
        const normalized = normalizeEnumValue(fixedValue, rule.allowedValues);
        if (normalized) {
          fixes[rule.field] = normalized;
        } else {
          errors.push({
            field: rule.field,
            message: `${rule.field} deve essere uno di: ${rule.allowedValues.slice(0, 5).join(', ')}...`,
            severity: 'warning',
          });
        }
      }
    }

    // Number validations
    if (typeof fixedValue === 'number') {
      if (rule.min !== undefined && fixedValue < rule.min) {
        errors.push({
          field: rule.field,
          message: `${rule.field} deve essere almeno ${rule.min}`,
          severity: 'warning',
        });
      }

      if (rule.max !== undefined && fixedValue > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} non può superare ${rule.max}`,
          severity: 'warning',
        });
      }
    }

    // Custom validator
    if (rule.customValidator && !rule.customValidator(fixedValue)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} non ha superato la validazione personalizzata`,
        severity: 'warning',
      });
    }
  }

  const avgConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;
  const hasErrors = errors.some(e => e.severity === 'error');

  return {
    valid: !hasErrors,
    errors,
    fixes,
    confidence: avgConfidence,
  };
}

export function applyTransform(value: any, transform: FieldTransform): any {
  switch (transform.type) {
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;

    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;

    case 'currency_parse':
      if (typeof value === 'string') {
        let cleaned = value;

        // Remove currency symbols
        const symbols = transform.params?.removeSymbols || ['€', '$', '£'];
        for (const symbol of symbols) {
          cleaned = cleaned.replace(new RegExp(escapeRegex(symbol), 'gi'), '');
        }

        // Handle thousands separators and decimals
        // Italian: 1.234,56 -> 1234.56
        // English: 1,234.56 -> 1234.56
        cleaned = cleaned.trim();

        // Detect format
        const hasCommaDecimal = /\d,\d{2}$/.test(cleaned);
        const hasDotDecimal = /\d\.\d{2}$/.test(cleaned);

        if (hasCommaDecimal) {
          // Italian format
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (hasDotDecimal) {
          // English format
          cleaned = cleaned.replace(/,/g, '');
        } else {
          // Just remove all non-numeric except decimal
          cleaned = cleaned.replace(/[^\d.-]/g, '');
        }

        // Handle K/M suffixes
        const originalValue = value.toLowerCase();
        if (/k$/i.test(originalValue)) {
          return parseFloat(cleaned) * 1000;
        }
        if (/m$/i.test(originalValue)) {
          return parseFloat(cleaned) * 1000000;
        }

        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      }
      return typeof value === 'number' ? value : 0;

    case 'date_parse':
      if (typeof value === 'string') {
        // Try to parse various date formats
        const formats = transform.params?.formats || ['DD/MM/YYYY', 'YYYY-MM-DD'];

        // Simple date parsing for common formats
        let match = value.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (match) {
          // DD/MM/YYYY or MM/DD/YYYY format
          const [, p1, p2, p3] = match;
          // Assume European format (DD/MM/YYYY) since this is for Italian context
          return new Date(parseInt(p3), parseInt(p2) - 1, parseInt(p1));
        }

        match = value.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
        if (match) {
          // YYYY-MM-DD format
          const [, year, month, day] = match;
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }

        // Fallback to Date.parse
        const parsed = Date.parse(value);
        if (!isNaN(parsed)) {
          return new Date(parsed);
        }
      }
      return value;

    case 'split':
      if (typeof value === 'string') {
        const delimiters = transform.params?.delimiters || [','];
        const escapedDelimiters = delimiters.map((d: string) => escapeRegex(d)).join('|');
        const regex = new RegExp(escapedDelimiters);
        return value.split(regex).map((s: string) => s.trim()).filter((s: string) => s);
      }
      return value;

    case 'regex_extract':
      if (typeof value === 'string' && transform.params?.pattern) {
        const match = value.match(new RegExp(transform.params.pattern));
        return match ? match[1] || match[0] : value;
      }
      return value;

    default:
      return value;
  }
}

function validateType(value: any, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'date':
      return value instanceof Date || !isNaN(Date.parse(value));
    default:
      return true;
  }
}

function normalizeEnumValue(value: string, allowedValues: string[]): string | null {
  const lowerValue = value.toLowerCase().trim();

  // Status normalization map
  const statusMap: Record<string, string> = {
    'attivo': 'active',
    'inattivo': 'inactive',
    'bozza': 'draft',
    'in attesa': 'pending',
    'approvato': 'approved',
    'rifiutato': 'rejected',
    'in corso': 'in_progress',
    'completato': 'completed',
    'annullato': 'cancelled',
    'sospeso': 'on_hold',
    'active': 'active',
    'inactive': 'inactive',
    'draft': 'draft',
    'pending': 'pending',
    'approved': 'approved',
    'rejected': 'rejected',
    'in_progress': 'in_progress',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'on_hold': 'on_hold',
  };

  // Priority normalization map
  const priorityMap: Record<string, string> = {
    'bassa': 'low',
    'media': 'medium',
    'alta': 'high',
    'critica': 'critical',
    'urgente': 'urgent',
    'low': 'low',
    'medium': 'medium',
    'high': 'high',
    'critical': 'critical',
    'urgent': 'urgent',
    '1': 'low',
    '2': 'medium',
    '3': 'high',
    '4': 'critical',
    '5': 'critical',
  };

  // Type normalization
  const typeMap: Record<string, string> = {
    'prodotto': 'product',
    'product': 'product',
    'servizio': 'service',
    'service': 'service',
  };

  // Check direct match
  if (allowedValues.includes(lowerValue)) {
    return lowerValue;
  }

  // Check maps
  const allMaps = { ...statusMap, ...priorityMap, ...typeMap };
  if (allMaps[lowerValue] && allowedValues.includes(allMaps[lowerValue])) {
    return allMaps[lowerValue];
  }

  // Fuzzy match
  for (const allowed of allowedValues) {
    if (allowed.includes(lowerValue) || lowerValue.includes(allowed)) {
      return allowed;
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateBatch(items: ExtractedItem[], customRules?: ValidationRule[]): {
  validItems: ExtractedItem[];
  invalidItems: { item: ExtractedItem; errors: ValidationResult['errors'] }[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    fixesApplied: number;
  };
} {
  const validItems: ExtractedItem[] = [];
  const invalidItems: { item: ExtractedItem; errors: ValidationResult['errors'] }[] = [];
  let fixesApplied = 0;

  for (const item of items) {
    const result = validateItem(item, customRules);

    // Apply fixes
    if (Object.keys(result.fixes).length > 0) {
      for (const [field, fixedValue] of Object.entries(result.fixes)) {
        const fieldObj = item[field as keyof ExtractedItem] as ExtractedField;
        if (fieldObj) {
          fieldObj.value = fixedValue;
          fieldObj.source = 'inferred';
        }
        fixesApplied++;
      }
    }

    if (result.valid) {
      validItems.push(item);
    } else {
      invalidItems.push({ item, errors: result.errors });
    }
  }

  return {
    validItems,
    invalidItems,
    stats: {
      total: items.length,
      valid: validItems.length,
      invalid: invalidItems.length,
      fixesApplied,
    },
  };
}

/**
 * Create custom validation rules from a schema
 */
export function createRulesFromSchema(schema: Record<string, any>): ValidationRule[] {
  const rules: ValidationRule[] = [];

  for (const [field, config] of Object.entries(schema)) {
    const rule: ValidationRule = {
      field,
      required: config.required ?? false,
      type: config.type,
    };

    if (config.minLength) rule.minLength = config.minLength;
    if (config.maxLength) rule.maxLength = config.maxLength;
    if (config.min) rule.min = config.min;
    if (config.max) rule.max = config.max;
    if (config.pattern) rule.pattern = new RegExp(config.pattern);
    if (config.allowedValues) rule.allowedValues = config.allowedValues;

    rules.push(rule);
  }

  return rules;
}

export { DEFAULT_VALIDATION_RULES, normalizeEnumValue };
