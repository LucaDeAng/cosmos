// backend/src/services/ingestion/fieldMapper.ts

import { ChatOpenAI } from '@langchain/openai';
import { SchemaColumn, FieldMapping, ExtractionTemplate } from './types';
import { levenshtein, jaroWinkler, normalizeForComparison } from './utils/stringUtils';

const llm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0,
});

// Field aliases dictionary (Italian + English)
const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    'nome', 'name', 'titolo', 'title', 'prodotto', 'product', 'servizio', 'service',
    'denominazione', 'descrizione breve', 'short description', 'articolo', 'item',
    'nome prodotto', 'product name', 'nome servizio', 'service name', 'oggetto',
    'voce', 'elemento', 'riferimento', 'oggetto della fornitura', 'denominazione articolo'
  ],
  description: [
    'descrizione', 'description', 'desc', 'dettaglio', 'detail', 'note', 'notes',
    'descrizione estesa', 'full description', 'long description', 'abstract',
    'specifiche', 'specifications', 'specs', 'caratteristiche', 'features',
    'descrizione tecnica', 'technical description', 'info', 'informazioni',
    'descrizione prodotto', 'product description'
  ],
  price: [
    'prezzo', 'price', 'costo', 'cost', 'importo', 'amount', 'valore', 'value',
    'prezzo unitario', 'unit price', 'listino', 'tariffa', 'rate', 'fee',
    'prezzo €', 'price €', 'eur', 'euro', 'prezzo iva esclusa', 'prezzo netto',
    'net price', 'prezzo lordo', 'gross price', 'totale', 'total', 'subtotale',
    'prezzo vendita', 'selling price', 'prezzo acquisto', 'purchase price'
  ],
  budget: [
    'budget', 'stanziamento', 'allocation', 'investimento', 'investment',
    'budget previsto', 'planned budget', 'budget annuale', 'annual budget',
    'costo progetto', 'project cost', 'valore contratto', 'contract value',
    'importo massimo', 'maximum amount', 'plafond'
  ],
  category: [
    'categoria', 'category', 'tipo', 'type', 'famiglia', 'family', 'gruppo', 'group',
    'classe', 'class', 'linea', 'line', 'settore', 'sector', 'area', 'reparto',
    'department', 'divisione', 'division', 'tipologia', 'macro categoria',
    'categoria merceologica', 'product category'
  ],
  subcategory: [
    'sottocategoria', 'subcategory', 'sub category', 'sottotipo', 'subtype',
    'sub tipo', 'categoria secondaria', 'secondary category', 'dettaglio categoria',
    'sotto categoria', 'micro categoria'
  ],
  sku: [
    'codice', 'code', 'sku', 'cod', 'cod.', 'codice articolo', 'article code',
    'part number', 'pn', 'p/n', 'item code', 'riferimento', 'ref', 'ref.',
    'id', 'identificativo', 'matricola', 'serial', 'barcode', 'ean', 'upc',
    'codice prodotto', 'product code', 'numero articolo', 'article number',
    'codice interno', 'internal code', 'cod articolo', 'codice fornitore'
  ],
  owner: [
    'owner', 'proprietario', 'responsabile', 'responsible', 'referente',
    'contact', 'contatto', 'gestore', 'manager', 'pm', 'project manager',
    'assegnato a', 'assigned to', 'titolare', 'holder', 'account',
    'responsabile progetto', 'project owner'
  ],
  status: [
    'stato', 'status', 'state', 'situazione', 'condition', 'fase', 'phase',
    'avanzamento', 'progress', 'stadio', 'stage', 'stato attuale', 'current status',
    'stato ordine', 'order status'
  ],
  priority: [
    'priorità', 'priority', 'priorita', 'urgenza', 'urgency', 'importanza',
    'importance', 'criticità', 'criticality', 'livello', 'level', 'ranking',
    'livello priorità', 'priority level'
  ],
  vendor: [
    'vendor', 'fornitore', 'supplier', 'produttore', 'manufacturer', 'brand',
    'marca', 'marchio', 'azienda', 'company', 'partner', 'distributore',
    'casa produttrice', 'manufacturer name', 'nome fornitore', 'supplier name'
  ],
  technologies: [
    'tecnologie', 'technologies', 'tech', 'stack', 'tech stack', 'piattaforma',
    'platform', 'framework', 'linguaggio', 'language', 'strumenti', 'tools',
    'software', 'hardware', 'infrastruttura', 'infrastructure', 'tecnologia'
  ],
  startDate: [
    'data inizio', 'start date', 'inizio', 'start', 'data avvio', 'kickoff',
    'data partenza', 'beginning', 'from', 'da', 'dal', 'data apertura'
  ],
  endDate: [
    'data fine', 'end date', 'fine', 'end', 'scadenza', 'deadline', 'due date',
    'data completamento', 'completion date', 'to', 'a', 'al', 'entro',
    'data chiusura', 'closing date'
  ],
  quantity: [
    'quantità', 'quantity', 'qty', 'qta', 'q.tà', 'numero', 'number', 'count',
    'pezzi', 'pieces', 'unità', 'units', 'n.', 'nr', 'nr.', 'quantita'
  ]
};

// Confidence thresholds
const EXACT_MATCH_CONFIDENCE = 0.98;
const FUZZY_MATCH_CONFIDENCE = 0.85;
const LLM_MATCH_CONFIDENCE = 0.75;
const TEMPLATE_MATCH_CONFIDENCE = 0.95;

export async function mapFields(
  columns: SchemaColumn[],
  template?: ExtractionTemplate
): Promise<FieldMapping[]> {
  const mappings: FieldMapping[] = [];
  const usedTargetFields = new Set<string>();

  for (const column of columns) {
    // 1. Try template-based mapping first
    if (template) {
      const templateMapping = findTemplateMapping(column, template);
      if (templateMapping && !usedTargetFields.has(templateMapping.targetField)) {
        mappings.push(templateMapping);
        usedTargetFields.add(templateMapping.targetField);
        continue;
      }
    }

    // 2. Try exact alias match
    const exactMatch = findExactAliasMatch(column.originalName);
    if (exactMatch && !usedTargetFields.has(exactMatch)) {
      mappings.push({
        sourceColumn: column.originalName,
        targetField: exactMatch,
        confidence: EXACT_MATCH_CONFIDENCE,
        method: 'exact',
        transforms: determineTransforms(column, exactMatch),
      });
      usedTargetFields.add(exactMatch);
      continue;
    }

    // 3. Try fuzzy match
    const fuzzyMatch = findFuzzyMatch(column.originalName, usedTargetFields);
    if (fuzzyMatch) {
      mappings.push({
        sourceColumn: column.originalName,
        targetField: fuzzyMatch.field,
        confidence: fuzzyMatch.confidence,
        method: 'fuzzy',
        transforms: determineTransforms(column, fuzzyMatch.field),
      });
      usedTargetFields.add(fuzzyMatch.field);
      continue;
    }

    // 4. Use LLM for ambiguous mappings
    const llmMatch = await findLLMMatch(column, usedTargetFields);
    if (llmMatch) {
      mappings.push(llmMatch);
      usedTargetFields.add(llmMatch.targetField);
    }
  }

  return mappings;
}

function findTemplateMapping(column: SchemaColumn, template: ExtractionTemplate): FieldMapping | null {
  const templateMapping = template.fieldMappings.find(
    m => m.sourceColumn.toLowerCase() === column.originalName.toLowerCase()
  );

  if (templateMapping) {
    return {
      ...templateMapping,
      confidence: TEMPLATE_MATCH_CONFIDENCE,
      method: 'template',
    };
  }

  return null;
}

function findExactAliasMatch(columnName: string): string | null {
  const normalized = normalizeForComparison(columnName);

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === normalizeForComparison(alias)) {
        return field;
      }
    }
  }

  return null;
}

function findFuzzyMatch(
  columnName: string,
  usedTargetFields: Set<string>
): { field: string; confidence: number } | null {
  const normalized = normalizeForComparison(columnName);
  let bestMatch: { field: string; confidence: number } | null = null;

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (usedTargetFields.has(field)) continue;

    for (const alias of aliases) {
      const normalizedAlias = normalizeForComparison(alias);

      // Contains match
      if (normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)) {
        const confidence = Math.min(normalizedAlias.length, normalized.length) /
                          Math.max(normalizedAlias.length, normalized.length) * 0.9;

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field, confidence };
        }
      }

      // Jaro-Winkler similarity
      const jwScore = jaroWinkler(normalized, normalizedAlias);
      if (jwScore >= 0.75) {
        const confidence = jwScore * FUZZY_MATCH_CONFIDENCE;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field, confidence };
        }
      }

      // Levenshtein distance
      const distance = levenshtein(normalized, normalizedAlias);
      const maxLen = Math.max(normalized.length, normalizedAlias.length);
      const similarity = 1 - (distance / maxLen);

      if (similarity >= 0.75) {
        const confidence = similarity * FUZZY_MATCH_CONFIDENCE;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { field, confidence };
        }
      }
    }
  }

  return bestMatch && bestMatch.confidence >= 0.6 ? bestMatch : null;
}

async function findLLMMatch(
  column: SchemaColumn,
  usedTargetFields: Set<string>
): Promise<FieldMapping | null> {
  const availableFields = Object.keys(FIELD_ALIASES).filter(f => !usedTargetFields.has(f));

  if (availableFields.length === 0) return null;

  const prompt = `Mappa questa colonna al campo target più appropriato.

Colonna sorgente: "${column.originalName}"
Tipo rilevato: ${column.inferredType}
Valori esempio: ${column.sampleValues.slice(0, 3).join(', ')}

Campi target disponibili:
${availableFields.map(f => `- ${f}`).join('\n')}

Rispondi SOLO con il JSON:
{
  "targetField": "nome_campo_o_null",
  "confidence": 0.0-1.0,
  "reasoning": "breve spiegazione"
}

Se nessun campo è appropriato, usa "targetField": null`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const result = JSON.parse(extractJSON(response.content as string));

    if (result.targetField && availableFields.includes(result.targetField)) {
      return {
        sourceColumn: column.originalName,
        targetField: result.targetField,
        confidence: Math.min(result.confidence, LLM_MATCH_CONFIDENCE),
        method: 'llm',
        transforms: determineTransforms(column, result.targetField),
      };
    }
  } catch (error) {
    console.error('LLM mapping failed for column:', column.originalName, error);
  }

  return null;
}

// Utility to determine needed transforms based on column type and target field
export function determineTransforms(
  column: SchemaColumn,
  targetField: string
): FieldMapping['transforms'] {
  const transforms: FieldMapping['transforms'] = [];

  // Always trim strings
  if (column.inferredType === 'string') {
    transforms.push({ type: 'trim' });
  }

  // Currency parsing for price/budget fields
  if (['price', 'budget'].includes(targetField) && column.inferredType === 'currency') {
    transforms.push({
      type: 'currency_parse',
      params: {
        removeSymbols: ['€', '$', '£', 'EUR', 'USD'],
        decimalSeparator: 'auto' // Will detect , vs .
      }
    });
  }

  // Number parsing for price/budget fields even if detected as string
  if (['price', 'budget', 'quantity'].includes(targetField) && column.inferredType === 'string') {
    transforms.push({
      type: 'currency_parse',
      params: {
        removeSymbols: ['€', '$', '£', 'EUR', 'USD'],
        decimalSeparator: 'auto'
      }
    });
  }

  // Date parsing
  if (['startDate', 'endDate'].includes(targetField) && column.inferredType === 'date') {
    transforms.push({
      type: 'date_parse',
      params: { formats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD.MM.YYYY'] }
    });
  }

  // Array splitting for technologies
  if (targetField === 'technologies' && column.inferredType === 'string') {
    transforms.push({
      type: 'split',
      params: { delimiters: [',', ';', '|', '\n'] }
    });
  }

  return transforms.length > 0 ? transforms : undefined;
}

function extractJSON(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    text.match(/\{[\s\S]*\}/);
  return jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text;
}

/**
 * Batch map fields for multiple schemas (useful for learning patterns)
 */
export async function batchMapFields(
  schemas: { columns: SchemaColumn[]; filename: string }[],
  template?: ExtractionTemplate
): Promise<Map<string, FieldMapping[]>> {
  const results = new Map<string, FieldMapping[]>();

  for (const schema of schemas) {
    const mappings = await mapFields(schema.columns, template);
    results.set(schema.filename, mappings);
  }

  return results;
}

/**
 * Get suggested mappings with confidence scores for user review
 */
export function getSuggestedMappings(
  columns: SchemaColumn[],
  mappings: FieldMapping[]
): {
  confident: FieldMapping[];
  needsReview: FieldMapping[];
  unmapped: SchemaColumn[];
} {
  const confident: FieldMapping[] = [];
  const needsReview: FieldMapping[] = [];
  const mappedColumns = new Set(mappings.map(m => m.sourceColumn));

  for (const mapping of mappings) {
    if (mapping.confidence >= 0.85) {
      confident.push(mapping);
    } else {
      needsReview.push(mapping);
    }
  }

  const unmapped = columns.filter(c => !mappedColumns.has(c.originalName));

  return { confident, needsReview, unmapped };
}

export { FIELD_ALIASES, findExactAliasMatch, findFuzzyMatch };
