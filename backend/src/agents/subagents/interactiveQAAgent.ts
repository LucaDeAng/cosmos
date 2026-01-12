/**
 * Interactive Q&A Agent
 *
 * Intelligently asks users for missing product/service information.
 * Uses natural language to generate targeted questions based on what data is missing.
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  CompleteProduct,
  identifyMissingFields as identifyMissingProductFields,
  calculateCompletenessScore as calculateProductCompleteness,
} from '../schemas/productSchema';
import {
  CompleteService,
  identifyMissingFields as identifyMissingServiceFields,
  calculateCompletenessScore as calculateServiceCompleteness,
} from '../schemas/serviceSchema';

export interface QASession {
  session_id: string;
  item_type: 'product' | 'service';
  item_name: string;
  current_data: Partial<CompleteProduct | CompleteService>;
  missing_fields: string[];
  completeness_score: number;
  questions_asked: QAQuestion[];
  answers_received: QAAnswer[];
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
  updated_at: string;
}

export interface QAQuestion {
  question_id: string;
  field_name: string;
  section: 'A' | 'B' | 'C'; // Which section this question relates to
  question_text: string;
  question_type: 'open_ended' | 'multiple_choice' | 'yes_no' | 'numeric' | 'list';
  options?: string[]; // For multiple choice
  context?: string; // Additional context to help user answer
  priority: 'critical' | 'high' | 'medium' | 'low';
  asked_at: string;
}

export interface QAAnswer {
  question_id: string;
  answer_text: string;
  confidence: number; // 0-1, how confident the parsing is
  parsed_value: any; // Structured value extracted from answer
  answered_at: string;
}

export interface QAAgentInput {
  item_type: 'product' | 'service';
  item_name: string;
  current_data: Partial<CompleteProduct | CompleteService>;
  max_questions?: number; // Maximum questions to ask in this session (default: 5)
  focus_sections?: Array<'A' | 'B' | 'C'>; // Which sections to focus on (default: all)
  language?: 'it' | 'en';
}

export interface QAAgentOutput {
  session: QASession;
  questions: QAQuestion[];
  suggestions: string[]; // Suggestions for data gathering
  next_steps: string;
}

const DEFAULT_MAX_QUESTIONS = 5;

/**
 * Main Q&A Agent
 * Generates intelligent questions for missing data
 */
export async function generateQuestions(input: QAAgentInput): Promise<QAAgentOutput> {
  const {
    item_type,
    item_name,
    current_data,
    max_questions = DEFAULT_MAX_QUESTIONS,
    focus_sections = ['A', 'B', 'C'],
    language = 'it',
  } = input;

  // Identify missing fields
  const missingFields = item_type === 'product'
    ? identifyMissingProductFields(current_data as Partial<CompleteProduct>)
    : identifyMissingServiceFields(current_data as Partial<CompleteService>);

  // Calculate completeness
  const completenessScore = item_type === 'product'
    ? calculateProductCompleteness(current_data as Partial<CompleteProduct>)
    : calculateServiceCompleteness(current_data as Partial<CompleteService>);

  // Create session
  const session: QASession = {
    session_id: generateSessionId(),
    item_type,
    item_name,
    current_data,
    missing_fields: missingFields,
    completeness_score: completenessScore,
    questions_asked: [],
    answers_received: [],
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Prioritize missing fields
  const prioritizedFields = prioritizeMissingFields(missingFields, focus_sections);

  // Generate questions using LLM
  const questions = await generateIntelligentQuestions(
    item_type,
    item_name,
    current_data,
    prioritizedFields.slice(0, max_questions),
    language
  );

  // Generate suggestions
  const suggestions = generateDataGatheringSuggestions(item_type, missingFields, language);

  // Determine next steps
  const next_steps = generateNextSteps(completenessScore, missingFields.length, language);

  return {
    session,
    questions,
    suggestions,
    next_steps,
  };
}

/**
 * Process user answers and update data
 */
export async function processAnswers(
  session: QASession,
  answers: Array<{ question_id: string; answer_text: string }>
): Promise<{
  updated_data: Partial<CompleteProduct | CompleteService>;
  parsed_answers: QAAnswer[];
  new_completeness_score: number;
  remaining_questions: number;
}> {
  const parsed_answers: QAAnswer[] = [];

  // Use LLM to parse answers into structured data
  for (const answer of answers) {
    const question = session.questions_asked.find(q => q.question_id === answer.question_id);
    if (!question) continue;

    const parsed = await parseAnswerToStructuredData(
      question,
      answer.answer_text,
      session.item_type
    );

    parsed_answers.push({
      question_id: answer.question_id,
      answer_text: answer.answer_text,
      confidence: parsed.confidence,
      parsed_value: parsed.value,
      answered_at: new Date().toISOString(),
    });
  }

  // Merge parsed data with current data
  const updated_data = mergeParsedData(
    session.current_data,
    parsed_answers,
    session.questions_asked
  );

  // Recalculate completeness
  const new_completeness_score = session.item_type === 'product'
    ? calculateProductCompleteness(updated_data as Partial<CompleteProduct>)
    : calculateServiceCompleteness(updated_data as Partial<CompleteService>);

  // Identify remaining missing fields
  const remaining_fields = session.item_type === 'product'
    ? identifyMissingProductFields(updated_data as Partial<CompleteProduct>)
    : identifyMissingServiceFields(updated_data as Partial<CompleteService>);

  return {
    updated_data,
    parsed_answers,
    new_completeness_score,
    remaining_questions: remaining_fields.length,
  };
}

/**
 * Helper: Generate session ID
 */
function generateSessionId(): string {
  return `qa-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Helper: Prioritize missing fields based on importance
 */
function prioritizeMissingFields(
  missingFields: string[],
  focusSections: Array<'A' | 'B' | 'C'>
): string[] {
  // Section A (Identity) fields are most critical
  const sectionAPriority = ['product_id', 'service_id', 'nome_prodotto', 'nome_servizio', 'categoria_prodotto', 'categoria_servizio', 'tipo_offerta', 'tipo_servizio', 'owner', 'target'];

  // Section B (Value) fields are second priority
  const sectionBPriority = ['segmenti_target', 'problema_principale', 'value_proposition', 'use_case_chiave', 'scope'];

  // Section C (GTM/Pricing) fields are third priority
  const sectionCPriority = ['modello_prezzo', 'canali', 'sla', 'contract_terms'];

  const prioritized: string[] = [];

  // Add section A fields if in focus
  if (focusSections.includes('A')) {
    sectionAPriority.forEach(field => {
      if (missingFields.some(mf => mf.includes(field))) {
        prioritized.push(...missingFields.filter(mf => mf.includes(field)));
      }
    });
  }

  // Add section B fields if in focus
  if (focusSections.includes('B')) {
    sectionBPriority.forEach(field => {
      if (missingFields.some(mf => mf.includes(field))) {
        const fields = missingFields.filter(mf => mf.includes(field) && !prioritized.includes(mf));
        prioritized.push(...fields);
      }
    });
  }

  // Add section C fields if in focus
  if (focusSections.includes('C')) {
    sectionCPriority.forEach(field => {
      if (missingFields.some(mf => mf.includes(field))) {
        const fields = missingFields.filter(mf => mf.includes(field) && !prioritized.includes(mf));
        prioritized.push(...fields);
      }
    });
  }

  // Add any remaining fields
  missingFields.forEach(field => {
    if (!prioritized.includes(field)) {
      prioritized.push(field);
    }
  });

  return prioritized;
}

/**
 * Helper: Generate intelligent questions using LLM
 */
async function generateIntelligentQuestions(
  itemType: 'product' | 'service',
  itemName: string,
  currentData: any,
  missingFields: string[],
  language: 'it' | 'en'
): Promise<QAQuestion[]> {
  if (missingFields.length === 0) return [];

  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.3,
  });

  const lang = language === 'it' ? 'Italian' : 'English';

  const prompt = `You are an expert business analyst helping gather information about a ${itemType} called "${itemName}".

MISSING FIELDS:
${missingFields.join('\n')}

CURRENT DATA:
${JSON.stringify(currentData, null, 2)}

Generate ${missingFields.length} intelligent, natural questions in ${lang} to gather the missing information.
For each question:
1. Make it conversational and easy to understand
2. Provide context about why this information is needed
3. Suggest examples if helpful
4. Determine the best question type (open_ended, multiple_choice, yes_no, numeric, list)

Return a JSON array of questions with this structure:
[{
  "question_id": "unique_id",
  "field_name": "field being asked about",
  "section": "A" | "B" | "C",
  "question_text": "the natural language question",
  "question_type": "open_ended" | "multiple_choice" | "yes_no" | "numeric" | "list",
  "options": ["option1", "option2"] (only for multiple_choice),
  "context": "why this information is important",
  "priority": "critical" | "high" | "medium" | "low"
}]

IMPORTANT: Respond ONLY with valid JSON array.`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = typeof response.content === 'string' ? response.content : '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const questions = JSON.parse(jsonMatch[0]);
      return questions.map((q: any) => ({
        ...q,
        asked_at: new Date().toISOString(),
      }));
    }
  } catch (error) {
    console.warn('LLM question generation failed:', error);
  }

  // Fallback: generate basic questions
  return generateFallbackQuestions(missingFields, language);
}

/**
 * Helper: Fallback question generation
 */
function generateFallbackQuestions(
  missingFields: string[],
  language: 'it' | 'en'
): QAQuestion[] {
  const templates = language === 'it' ? {
    default: (field: string) => `Può fornire informazioni per: ${field}?`,
  } : {
    default: (field: string) => `Can you provide information for: ${field}?`,
  };

  return missingFields.map((field, index) => ({
    question_id: `q-${index + 1}`,
    field_name: field,
    section: field.startsWith('A.') ? 'A' : field.startsWith('B.') ? 'B' : 'C',
    question_text: templates.default(field),
    question_type: 'open_ended' as const,
    context: '',
    priority: field.startsWith('A.') ? 'critical' : field.startsWith('B.') ? 'high' : 'medium',
    asked_at: new Date().toISOString(),
  }));
}

/**
 * Helper: Parse answer to structured data
 */
async function parseAnswerToStructuredData(
  question: QAQuestion,
  answer: string,
  itemType: 'product' | 'service'
): Promise<{ value: any; confidence: number }> {
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  const prompt = `Extract structured data from this answer.

QUESTION: ${question.question_text}
FIELD: ${question.field_name}
ANSWER: ${answer}

Parse the answer into appropriate structured format for field "${question.field_name}".
Return JSON: { "value": <parsed_value>, "confidence": <0-1> }

Examples:
- For list fields: { "value": ["item1", "item2"], "confidence": 0.9 }
- For text fields: { "value": "text value", "confidence": 0.95 }
- For numeric: { "value": 100000, "confidence": 1.0 }
- For enum: { "value": "option_name", "confidence": 0.9 }

IMPORTANT: Return ONLY valid JSON.`;

  try {
    const response = await llm.invoke([{ role: 'user', content: prompt }]);
    const content = typeof response.content === 'string' ? response.content : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('Answer parsing failed:', error);
  }

  // Fallback
  return { value: answer, confidence: 0.5 };
}

/**
 * Helper: Merge parsed data with current data
 */
function mergeParsedData(
  currentData: any,
  parsedAnswers: QAAnswer[],
  questions: QAQuestion[]
): any {
  const updated = JSON.parse(JSON.stringify(currentData)); // Deep clone

  for (const answer of parsedAnswers) {
    const question = questions.find(q => q.question_id === answer.question_id);
    if (!question || answer.confidence < 0.5) continue;

    const fieldPath = question.field_name.split('.');

    // Navigate to the correct nested location
    let target = updated;
    for (let i = 0; i < fieldPath.length - 1; i++) {
      const key = fieldPath[i];
      if (!target[key]) target[key] = {};
      target = target[key];
    }

    // Set the value
    const finalKey = fieldPath[fieldPath.length - 1];
    target[finalKey] = answer.parsed_value;
  }

  return updated;
}

/**
 * Helper: Generate data gathering suggestions
 */
function generateDataGatheringSuggestions(
  itemType: 'product' | 'service',
  missingFields: string[],
  language: 'it' | 'en'
): string[] {
  const suggestions: string[] = [];

  if (language === 'it') {
    if (missingFields.some(f => f.includes('target') || f.includes('segmenti'))) {
      suggestions.push('Intervista il team di vendita per comprendere i segmenti target');
    }
    if (missingFields.some(f => f.includes('value_proposition') || f.includes('problema'))) {
      suggestions.push('Organizza workshop con product manager e clienti per definire la value proposition');
    }
    if (missingFields.some(f => f.includes('prezzo') || f.includes('pricing'))) {
      suggestions.push('Consulta il team finance per dettagli sui modelli di prezzo');
    }
    if (missingFields.some(f => f.includes('sla') || f.includes('support'))) {
      suggestions.push('Rivedi contratti esistenti con clienti per SLA e termini di supporto');
    }
  } else {
    if (missingFields.some(f => f.includes('target') || f.includes('segmenti'))) {
      suggestions.push('Interview sales team to understand target segments');
    }
    if (missingFields.some(f => f.includes('value_proposition') || f.includes('problema'))) {
      suggestions.push('Organize workshops with product managers and customers to define value proposition');
    }
    if (missingFields.some(f => f.includes('prezzo') || f.includes('pricing'))) {
      suggestions.push('Consult finance team for pricing model details');
    }
    if (missingFields.some(f => f.includes('sla') || f.includes('support'))) {
      suggestions.push('Review existing customer contracts for SLA and support terms');
    }
  }

  return suggestions;
}

/**
 * Helper: Generate next steps
 */
function generateNextSteps(
  completenessScore: number,
  missingFieldsCount: number,
  language: 'it' | 'en'
): string {
  const it = language === 'it';

  if (completenessScore >= 0.9) {
    return it
      ? 'Eccellente! La scheda è quasi completa. Completa gli ultimi campi mancanti.'
      : 'Excellent! The card is almost complete. Fill in the remaining fields.';
  }

  if (completenessScore >= 0.7) {
    return it
      ? `Buon progresso! Mancano ancora ${missingFieldsCount} campi. Continua con le domande.`
      : `Good progress! ${missingFieldsCount} fields still missing. Continue with questions.`;
  }

  if (completenessScore >= 0.5) {
    return it
      ? `A metà strada. Concentrati prima sui campi critici della Sezione A e B.`
      : `Halfway there. Focus on critical Section A and B fields first.`;
  }

  return it
    ? `Inizia con i campi fondamentali: identità, target, e value proposition.`
    : `Start with fundamental fields: identity, target, and value proposition.`;
}

export default {
  generateQuestions,
  processAnswers,
};
