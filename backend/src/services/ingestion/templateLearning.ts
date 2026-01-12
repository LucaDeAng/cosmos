// backend/src/services/ingestion/templateLearning.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ExtractionTemplate, ExtractionCorrection, FieldMapping, DetectedSchema } from './types';
import { v4 as uuid } from 'uuid';
import { escapeRegex, extractKeywords, generateFilenamePattern } from './utils/stringUtils';

// Lazy initialization of Supabase client
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase environment variables not configured');
    }
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabaseClient;
}

// Minimum corrections needed to create/update a template pattern
const MIN_CORRECTIONS_FOR_PATTERN = 3;

// Template matching threshold
const TEMPLATE_MATCH_THRESHOLD = 0.7;

export async function findMatchingTemplate(
  schema: DetectedSchema,
  filename: string,
  tenantId: string
): Promise<ExtractionTemplate | null> {
  try {
    const supabase = getSupabaseClient();

    // Get all templates for this tenant
    const { data: templates, error } = await supabase
      .from('extraction_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('times_used', { ascending: false })
      .limit(50);

    if (error || !templates?.length) {
      return null;
    }

    // Score each template
    let bestMatch: { template: ExtractionTemplate; score: number } | null = null;

    for (const templateData of templates) {
      const template = mapDbToTemplate(templateData);
      const score = calculateTemplateMatchScore(template, schema, filename);

      if (score >= TEMPLATE_MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { template, score };
      }
    }

    if (bestMatch) {
      // Update usage stats
      await supabase
        .from('extraction_templates')
        .update({
          times_used: bestMatch.template.timesUsed + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', bestMatch.template.id);

      return bestMatch.template;
    }

    return null;
  } catch (error) {
    console.error('Error finding matching template:', error);
    return null;
  }
}

function calculateTemplateMatchScore(
  template: ExtractionTemplate,
  schema: DetectedSchema,
  filename: string
): number {
  let score = 0;
  let weights = 0;

  const signatures = template.signatures;
  const schemaColumns = schema.columns.map(c => c.originalName.toLowerCase());

  // 1. Column pattern matching (weight: 50%)
  if (signatures.columnPatterns?.length) {
    let matchedPatterns = 0;

    for (const pattern of signatures.columnPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (schemaColumns.some(col => regex.test(col))) {
          matchedPatterns++;
        }
      } catch (e) {
        // Invalid regex pattern, skip
      }
    }

    const patternScore = matchedPatterns / signatures.columnPatterns.length;
    score += patternScore * 0.5;
    weights += 0.5;
  }

  // 2. Header keyword matching (weight: 30%)
  if (signatures.headerKeywords?.length) {
    const allText = schemaColumns.join(' ').toLowerCase();
    let matchedKeywords = 0;

    for (const keyword of signatures.headerKeywords) {
      if (allText.includes(keyword.toLowerCase())) {
        matchedKeywords++;
      }
    }

    const keywordScore = matchedKeywords / signatures.headerKeywords.length;
    score += keywordScore * 0.3;
    weights += 0.3;
  }

  // 3. Filename pattern matching (weight: 20%)
  if (signatures.fileNamePattern) {
    try {
      const regex = new RegExp(signatures.fileNamePattern, 'i');
      if (regex.test(filename)) {
        score += 0.2;
      }
    } catch (e) {
      // Invalid regex pattern, skip
    }
    weights += 0.2;
  }

  return weights > 0 ? score / weights : 0;
}

export async function saveTemplate(
  tenantId: string,
  name: string,
  schema: DetectedSchema,
  fieldMappings: FieldMapping[],
  filename?: string,
  description?: string
): Promise<ExtractionTemplate> {
  const supabase = getSupabaseClient();

  const template: ExtractionTemplate = {
    id: uuid(),
    tenantId,
    name,
    description,
    signatures: {
      columnPatterns: schema.columns.map(c => escapeRegex(c.originalName)),
      headerKeywords: extractKeywords(schema.columns.map(c => c.originalName)),
      fileNamePattern: filename ? generateFilenamePattern(filename) : undefined,
    },
    fieldMappings,
    timesUsed: 1,
    avgAccuracy: 0.8, // Initial estimate
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const { error } = await supabase
    .from('extraction_templates')
    .insert({
      id: template.id,
      tenant_id: template.tenantId,
      name: template.name,
      description: template.description,
      signatures: template.signatures,
      field_mappings: template.fieldMappings,
      default_values: template.defaultValues,
      times_used: template.timesUsed,
      avg_accuracy: template.avgAccuracy,
      last_used_at: template.lastUsedAt.toISOString(),
      created_at: template.createdAt.toISOString(),
      updated_at: template.updatedAt.toISOString(),
    });

  if (error) {
    console.error('Failed to save template:', error);
    throw error;
  }

  return template;
}

export async function updateTemplate(
  templateId: string,
  updates: Partial<Pick<ExtractionTemplate, 'name' | 'description' | 'fieldMappings' | 'defaultValues' | 'signatures'>>
): Promise<ExtractionTemplate | null> {
  const supabase = getSupabaseClient();

  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name) updateData.name = updates.name;
  if (updates.description) updateData.description = updates.description;
  if (updates.fieldMappings) updateData.field_mappings = updates.fieldMappings;
  if (updates.defaultValues) updateData.default_values = updates.defaultValues;
  if (updates.signatures) updateData.signatures = updates.signatures;

  const { data, error } = await supabase
    .from('extraction_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update template:', error);
    return null;
  }

  return mapDbToTemplate(data);
}

export async function recordCorrection(
  tenantId: string,
  originalItem: Record<string, any>,
  correctedItem: Record<string, any>,
  context: ExtractionCorrection['context']
): Promise<void> {
  const fieldsCorrected = findCorrectedFields(originalItem, correctedItem);

  if (fieldsCorrected.length === 0) return; // No actual corrections

  try {
    const supabase = getSupabaseClient();

    const correction: Omit<ExtractionCorrection, 'id'> = {
      tenantId,
      originalItem,
      correctedItem,
      fieldsCorrected,
      context,
      createdAt: new Date(),
    };

    const { error } = await supabase
      .from('extraction_corrections')
      .insert({
        id: uuid(),
        tenant_id: correction.tenantId,
        original_item: correction.originalItem,
        corrected_item: correction.correctedItem,
        fields_corrected: correction.fieldsCorrected,
        context: correction.context,
        created_at: correction.createdAt.toISOString(),
      });

    if (error) {
      console.error('Failed to record correction:', error);
      return;
    }

    // Check if we should update patterns
    await checkAndUpdatePatterns(tenantId, context);
  } catch (error) {
    console.error('Error recording correction:', error);
  }
}

function findCorrectedFields(original: Record<string, any>, corrected: Record<string, any>): string[] {
  const fields: string[] = [];

  for (const key of Object.keys(corrected)) {
    const origValue = original[key]?.value ?? original[key];
    const corrValue = corrected[key]?.value ?? corrected[key];

    if (JSON.stringify(origValue) !== JSON.stringify(corrValue)) {
      fields.push(key);
    }
  }

  return fields;
}

async function checkAndUpdatePatterns(tenantId: string, context: ExtractionCorrection['context']): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Get recent corrections for this format
    const { data: corrections, error } = await supabase
      .from('extraction_corrections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('context->>sourceFormat', context.sourceFormat)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !corrections?.length) return;

    // Analyze patterns
    const fieldCorrections: Record<string, { from: any; to: any; count: number }[]> = {};

    for (const correction of corrections) {
      for (const field of correction.fields_corrected) {
        if (!fieldCorrections[field]) {
          fieldCorrections[field] = [];
        }

        const pattern = {
          from: correction.original_item[field],
          to: correction.corrected_item[field],
          count: 1,
        };

        // Find existing pattern or add new one
        const existing = fieldCorrections[field].find(
          p => JSON.stringify(p.from) === JSON.stringify(pattern.from) &&
               JSON.stringify(p.to) === JSON.stringify(pattern.to)
        );

        if (existing) {
          existing.count++;
        } else {
          fieldCorrections[field].push(pattern);
        }
      }
    }

    // Update template if we have a templateId and enough corrections
    if (context.templateId) {
      const significantPatterns = Object.entries(fieldCorrections)
        .filter(([, patterns]) => patterns.some(p => p.count >= MIN_CORRECTIONS_FOR_PATTERN));

      if (significantPatterns.length > 0) {
        // Get the template and update it
        const { data: template } = await supabase
          .from('extraction_templates')
          .select('*')
          .eq('id', context.templateId)
          .single();

        if (template) {
          // Update field mappings based on corrections
          const updatedMappings = [...(template.field_mappings || [])];

          for (const [field, patterns] of significantPatterns) {
            const mostCommonCorrection = patterns.reduce((a, b) => a.count > b.count ? a : b);

            // Find and update the mapping for this field
            const mappingIndex = updatedMappings.findIndex(m => m.targetField === field);
            if (mappingIndex >= 0) {
              // Add a transform based on the correction pattern
              if (!updatedMappings[mappingIndex].transforms) {
                updatedMappings[mappingIndex].transforms = [];
              }
              // Log the pattern for review
              console.log(`Pattern detected for field ${field}: ${JSON.stringify(mostCommonCorrection)}`);
            }
          }

          // Recalculate accuracy based on corrections
          const totalCorrections = corrections.length;
          const successfulExtractions = template.times_used - totalCorrections;
          const newAccuracy = successfulExtractions / template.times_used;

          await supabase
            .from('extraction_templates')
            .update({
              field_mappings: updatedMappings,
              avg_accuracy: Math.max(0.5, newAccuracy), // Floor at 50%
              updated_at: new Date().toISOString(),
            })
            .eq('id', context.templateId);
        }
      }
    }
  } catch (error) {
    console.error('Error updating patterns:', error);
  }
}

export async function getTemplates(tenantId: string): Promise<ExtractionTemplate[]> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('extraction_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('times_used', { ascending: false });

    if (error) {
      console.error('Failed to get templates:', error);
      return [];
    }

    return (data || []).map(mapDbToTemplate);
  } catch (error) {
    console.error('Error getting templates:', error);
    return [];
  }
}

export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('extraction_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Failed to delete template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting template:', error);
    return false;
  }
}

export async function getCorrections(
  tenantId: string,
  options?: {
    limit?: number;
    sourceFormat?: string;
    field?: string;
  }
): Promise<ExtractionCorrection[]> {
  try {
    const supabase = getSupabaseClient();

    let query = supabase
      .from('extraction_corrections')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(options?.limit || 100);

    if (options?.sourceFormat) {
      query = query.eq('context->>sourceFormat', options.sourceFormat);
    }

    if (options?.field) {
      query = query.contains('fields_corrected', [options.field]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to get corrections:', error);
      return [];
    }

    return (data || []).map(mapDbToCorrection);
  } catch (error) {
    console.error('Error getting corrections:', error);
    return [];
  }
}

// Helper function to map database row to ExtractionTemplate
function mapDbToTemplate(data: any): ExtractionTemplate {
  return {
    id: data.id,
    tenantId: data.tenant_id,
    name: data.name,
    description: data.description,
    signatures: data.signatures,
    fieldMappings: data.field_mappings,
    defaultValues: data.default_values,
    timesUsed: data.times_used,
    avgAccuracy: data.avg_accuracy,
    lastUsedAt: new Date(data.last_used_at),
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

// Helper function to map database row to ExtractionCorrection
function mapDbToCorrection(data: any): ExtractionCorrection {
  return {
    id: data.id,
    tenantId: data.tenant_id,
    originalItem: data.original_item,
    correctedItem: data.corrected_item,
    fieldsCorrected: data.fields_corrected,
    context: data.context,
    createdAt: new Date(data.created_at),
  };
}

/**
 * Analyze correction patterns to suggest improvements
 */
export async function analyzePatterns(tenantId: string): Promise<{
  commonCorrections: { field: string; pattern: string; count: number }[];
  suggestedImprovements: { field: string; suggestion: string }[];
}> {
  const corrections = await getCorrections(tenantId, { limit: 500 });

  const fieldStats: Record<string, { corrections: number; patterns: Map<string, number> }> = {};

  for (const correction of corrections) {
    for (const field of correction.fieldsCorrected) {
      if (!fieldStats[field]) {
        fieldStats[field] = { corrections: 0, patterns: new Map() };
      }
      fieldStats[field].corrections++;

      const patternKey = `${JSON.stringify(correction.originalItem[field])} -> ${JSON.stringify(correction.correctedItem[field])}`;
      fieldStats[field].patterns.set(
        patternKey,
        (fieldStats[field].patterns.get(patternKey) || 0) + 1
      );
    }
  }

  const commonCorrections: { field: string; pattern: string; count: number }[] = [];
  const suggestedImprovements: { field: string; suggestion: string }[] = [];

  for (const [field, stats] of Object.entries(fieldStats)) {
    // Get top patterns for this field
    const sortedPatterns = Array.from(stats.patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [pattern, count] of sortedPatterns) {
      commonCorrections.push({ field, pattern, count });

      if (count >= MIN_CORRECTIONS_FOR_PATTERN) {
        suggestedImprovements.push({
          field,
          suggestion: `Consider adding automatic transform for pattern: ${pattern} (${count} occurrences)`,
        });
      }
    }
  }

  return { commonCorrections, suggestedImprovements };
}
