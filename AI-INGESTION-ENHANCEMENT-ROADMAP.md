# 🚀 AI Data Ingestion Enhancement Roadmap
## Strategic Upgrade Plan for THEMIS Portfolio Intelligence

**Date**: 2025-12-16
**Status**: Ready for Implementation
**Priority**: CRITICAL - "Il cervello di tutto"

---

## Executive Summary

This roadmap transforms THEMIS's AI data ingestion from a basic extraction system into a world-class, context-aware portfolio intelligence engine. Based on comprehensive research of 2025 best practices and analysis of the current codebase, we've identified **12 high-impact enhancements** organized into 4 phases.

**Current State Analysis**:
- ✅ **Strengths**: Multi-format support (PDF, Excel, CSV), RAG-based normalization, strategic profile integration, schema inference engine
- ⚠️ **Gaps**: No multi-modal document understanding, limited confidence scoring, basic table extraction, no HITL validation UI, missing incremental learning
- 🎯 **Opportunity**: Transform from extraction tool → intelligent portfolio advisor

**Expected Outcomes**:
- 📈 Extraction accuracy: 70% → **95%+**
- ⚡ Auto-accept rate: ~40% → **60%+** (reduced manual validation)
- 🎯 Strategic alignment: Generic → **Company-specific** via RAG + strategic profile
- 💡 Intelligence: Static rules → **Learning system** that improves with use

---

## Current Architecture Analysis

### 🏗️ Existing Components

#### 1. **Document Parsers** (`backend/src/agents/subagents/ingestion/`)
- **PDF Parser** (`pdfParserAgent.ts`): Uses `pdf-parse` for text extraction + GPT-4o-mini for structured extraction
  - ⚠️ Weakness: Text-only extraction, no table understanding, no layout analysis
  - ⚡ Strength: Fallback to pattern matching when LLM fails

- **Excel Parser** (`excelParserAgent.ts`): XLSX.js + column mapping heuristics
  - ⚡ Strength: Comprehensive column name mapping (IT/EN)
  - ⚠️ Weakness: No multi-sheet intelligence, no schema inference for merged cells

- **Text Parser** (`textParserAgent.ts`): Direct LLM extraction from raw text
  - ⚡ Strength: Flexible, handles unstructured input
  - ⚠️ Weakness: No specialized handling for CSV/TSV formats

#### 2. **Normalizer Agent** (`normalizerAgent.ts`) - **THE BRAIN**
- **Type Detection**: Keyword-based scoring (products vs services) + RAG context
- **RAG Integration**: Semantic search across 7 catalog types (IT services, technologies, taxonomy, products, industries, entities, examples)
- **Schema Inference**: Leverages strategic profile to infer product/service-specific fields
- **Parallel Processing**: Batched RAG lookups with concurrency control (8 concurrent)
- ⚡ **Strengths**:
  - Already has strategic profile integration
  - Schema inference engine (lines 695-784)
  - RAG-based category mapping
- ⚠️ **Gaps**:
  - Confidence scoring is binary (type confidence only)
  - No field-level confidence tracking
  - No user correction learning

#### 3. **Frontend Uploader** (`frontend/components/portfolio/AdvancedIngestionUploader.tsx`)
- **Features**: Drag & drop, multi-file, text input, type preference (product/service/mixed), edit modal
- ⚡ **Strengths**:
  - Clean progressive disclosure UI
  - Pre-selection based on confidence (≥60%)
  - Best practice tips during processing
- ⚠️ **Gaps**:
  - No HITL validation workflow (low-confidence items)
  - No field-level confidence indicators
  - No bulk edit capabilities
  - No learning feedback loop

#### 4. **API Routes** (`backend/src/routes/portfolio.routes.ts`)
- **Endpoints**: `/api/portfolio/ingest`, `/api/portfolio/ingest/text`, `/api/portfolio/ingest/save`
- **Pipeline**: File upload → Parse → Normalize → Preview → Save
- ⚠️ **Gap**: No feedback endpoint for user corrections

---

## Enhancement Phases

### 📦 Phase 1: Foundation Layer Upgrades
**Timeline**: Weeks 1-3
**Goal**: Enhance document extraction quality and confidence tracking

#### 1.1 Multi-Modal Document Understanding
**Problem**: Current PDF parser only extracts text, missing tables, charts, complex layouts.

**Solution**: Integrate advanced document understanding
```typescript
// NEW: backend/src/agents/subagents/ingestion/documentUnderstandingAgent.ts

import vision from '@google-cloud/vision'; // Or Azure Document Intelligence
import { ChatOpenAI } from '@langchain/openai';

interface DocumentUnderstandingInput {
  fileBuffer: Buffer;
  fileName: string;
  fileType: 'pdf' | 'image' | 'excel';
}

interface DocumentLayout {
  pages: Array<{
    pageNumber: number;
    tables: Array<{
      headers: string[];
      rows: string[][];
      confidence: number;
    }>;
    textBlocks: Array<{
      content: string;
      bbox: { x: number; y: number; width: number; height: number };
      confidence: number;
    }>;
    charts?: Array<{
      type: 'bar' | 'line' | 'pie';
      description: string;
    }>;
  }>;
}

export async function understandDocument(
  input: DocumentUnderstandingInput
): Promise<DocumentLayout> {
  // Use vision API for layout detection
  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection(input.fileBuffer);

  // Extract tables with high confidence
  const tables = await extractTablesWithConfidence(result);

  // Use GPT-4o (vision-capable) for complex layouts
  if (tables.some(t => t.confidence < 0.7)) {
    const enhancedTables = await enhanceTablesWithVisionModel(
      input.fileBuffer,
      tables
    );
    return { pages: enhancedTables };
  }

  return { pages: tables };
}
```

**Tools to Integrate**:
- **Option A (Recommended)**: Azure Document Intelligence API (best for tables)
- **Option B**: Google Cloud Vision API (good balance)
- **Option C (Open-source)**: MinerU + PDF-Extract-Kit (no API costs)

**Implementation**:
1. Create `documentUnderstandingAgent.ts`
2. Update `pdfParserAgent.ts` to call document understanding before text extraction
3. Add layout-aware extraction prompts to LLM
4. Store table extraction confidence per cell

**Expected Impact**: Table extraction accuracy 50% → 95%

---

#### 1.2 Multi-Level Confidence Scoring
**Problem**: Current system only tracks type confidence. No field-level or item-level confidence.

**Solution**: Hierarchical confidence tracking
```typescript
// ENHANCE: backend/src/agents/subagents/ingestion/normalizerAgent.ts

export interface ConfidenceBreakdown {
  overall: number;          // Item-level (0-1)
  type: number;             // Product/Service classification
  fields: Record<string, number>; // Per-field confidence
  reasoning: string[];      // Why this confidence?
  quality_indicators: {
    source_clarity: number; // How clear was the source data?
    rag_match: number;      // How well did RAG context match?
    schema_fit: number;     // How well does it fit expected schema?
  };
}

export interface NormalizedItemEnhanced extends NormalizedItem {
  confidence_breakdown: ConfidenceBreakdown;
  extraction_metadata: {
    source_type: 'pdf_table' | 'pdf_text' | 'excel_row' | 'text_block';
    source_page?: number;
    source_row?: number;
    original_text?: string;
  };
}

// Add confidence calculation after normalization
function calculateItemConfidence(
  item: NormalizedItem,
  ragContext: string,
  extractionSource: string
): ConfidenceBreakdown {
  const fieldConfidences: Record<string, number> = {};

  // Type confidence (existing)
  const typeConf = item.confidence;

  // Field-level confidence
  if (item.budget && item.budget > 0) fieldConfidences.budget = 0.9;
  if (item.owner) fieldConfidences.owner = 0.8;
  if (item.category) fieldConfidences.category = ragContext ? 0.85 : 0.5;

  // Calculate overall as weighted average
  const overall = (
    typeConf * 0.4 +
    Object.values(fieldConfidences).reduce((a, b) => a + b, 0) /
      Math.max(Object.keys(fieldConfidences).length, 1) * 0.6
  );

  return {
    overall,
    type: typeConf,
    fields: fieldConfidences,
    reasoning: [
      typeConf > 0.8 ? 'Strong type indicators' : 'Weak type signals',
      Object.keys(fieldConfidences).length > 5 ? 'Rich metadata' : 'Limited metadata',
    ],
    quality_indicators: {
      source_clarity: extractionSource === 'excel_row' ? 0.9 : 0.7,
      rag_match: ragContext.length > 500 ? 0.85 : 0.6,
      schema_fit: item._schema_inference ? 0.9 : 0.7,
    },
  };
}
```

**Implementation**:
1. Enhance `NormalizedItem` schema with `confidence_breakdown`
2. Update normalizer to calculate multi-level confidence
3. Update frontend to display field-level confidence indicators
4. Create confidence thresholds for auto-accept (>90%), review (70-90%), manual (<70%)

**Expected Impact**: Better HITL routing, 30% reduction in manual review time

---

#### 1.3 Enhanced Table Extraction
**Problem**: Current Excel parser doesn't handle merged cells, complex headers, or pivot tables well.

**Solution**: Integrate specialized table extraction
```typescript
// NEW: backend/src/agents/subagents/ingestion/tableExtractionAgent.ts

import Camelot from 'camelot-py'; // Python library via child_process
import { ChatOpenAI } from '@langchain/openai';

interface TableExtractionResult {
  tables: Array<{
    headers: string[];
    rows: Array<Record<string, unknown>>;
    confidence: number;
    table_type: 'simple' | 'merged_headers' | 'pivot' | 'complex';
    normalization_notes: string[];
  }>;
}

export async function extractComplexTables(
  pdfBuffer: Buffer
): Promise<TableExtractionResult> {
  // Use Camelot for PDF tables (best accuracy)
  const tables = await runCamelot(pdfBuffer);

  // For complex tables, use LLM to understand structure
  const complexTables = tables.filter(t => t.table_type !== 'simple');

  for (const table of complexTables) {
    const normalized = await normalizeCom plexTableWithLLM(table);
    table.headers = normalized.headers;
    table.rows = normalized.rows;
    table.confidence = normalized.confidence;
  }

  return { tables };
}
```

**Tools**:
- **Camelot** (Python): Best for PDF tables
- **Tabula** (Java): Alternative for PDF
- **XLSX.js enhancements**: Better merged cell handling

**Implementation**:
1. Create Python microservice for Camelot table extraction
2. Update `pdfParserAgent.ts` to call table extraction before text extraction
3. Enhance `excelParserAgent.ts` to detect and handle merged cells
4. Add table structure normalization to LLM prompts

**Expected Impact**: Complex table extraction accuracy 40% → 85%

---

### 🧠 Phase 2: RAG Intelligence Layer
**Timeline**: Weeks 4-6
**Goal**: Make ingestion context-aware using strategic profile + company history

#### 2.1 Strategic Profile-Driven Extraction
**Problem**: Extraction doesn't leverage the rich context from strategic assessment.

**Solution**: Use strategic profile to guide extraction and classification
```typescript
// ENHANCE: backend/src/agents/subagents/ingestion/normalizerAgent.ts

async function extractWithStrategicContext(
  items: RawExtractedItem[],
  strategicProfile: StrategicProfile
): Promise<RawExtractedItem[]> {

  const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

  const contextPrompt = `
COMPANY STRATEGIC CONTEXT:
Industry: ${strategicProfile.company_identity.industry}
Value Proposition: ${strategicProfile.company_identity.value_proposition}
Business Model: ${strategicProfile.company_identity.business_model}

STRATEGIC GOALS (2025-2027):
${strategicProfile.strategic_context.goals_2025_2027.map((g, i) =>
  `${i + 1}. ${g.goal.replace(/_/g, ' ')} (Priority: ${g.priority})`
).join('\n')}

PRIORITIZATION CRITERIA:
- Strategic Alignment Weight: ${strategicProfile.strategic_context.prioritization_criteria.strategic_alignment_weight}/5
- ROI Weight: ${strategicProfile.strategic_context.prioritization_criteria.roi_weight}/5
- Innovation Weight: ${strategicProfile.strategic_context.prioritization_criteria.innovation_weight}/5

PORTFOLIO COMPOSITION:
- ${strategicProfile.portfolio_composition.product_portfolio.total_count} Products
- ${strategicProfile.portfolio_composition.service_portfolio.total_count} Services

Based on this context, classify and enrich the following items.
For each item, infer:
1. Strategic alignment (1-10) based on how well it matches strategic goals
2. Likely pricing model based on industry + business model
3. Target segment based on company profile
4. Lifecycle stage based on portfolio maturity

ITEMS TO PROCESS:
${JSON.stringify(items.slice(0, 10), null, 2)}

Return enhanced items with inferred fields and reasoning.
`;

  const response = await llm.invoke([{ role: 'user', content: contextPrompt }]);
  // Parse and merge with original items
  return parseEnhancedItems(response.content, items);
}
```

**Implementation**:
1. Update `normalizeItems()` to call `extractWithStrategicContext()` when profile exists
2. Add strategic goal matching logic (cosine similarity on embeddings)
3. Enhance schema inference with strategic context
4. Store strategic alignment reasoning for transparency

**Expected Impact**: Strategic alignment accuracy 60% → 90%, better prioritization

---

#### 2.2 Company History RAG
**Problem**: System doesn't learn from previously validated items.

**Solution**: Build company-specific embedding index of validated portfolio items
```typescript
// NEW: backend/src/agents/utils/companyHistoryRAG.ts

import { embedText } from './embeddingService';
import { supabase } from '../../lib/supabase';

interface CompanyHistoryContext {
  similar_products: Array<{
    name: string;
    category: string;
    technologies: string[];
    business_value: number;
    similarity: number;
  }>;
  similar_services: Array<{
    name: string;
    delivery_model: string;
    sla_tier: string;
    similarity: number;
  }>;
  category_patterns: Record<string, number>; // Most common categories
  tech_stack_patterns: string[];             // Most common technologies
}

export async function getCompanyHistoryContext(
  tenantId: string,
  itemDescription: string
): Promise<CompanyHistoryContext> {
  // Embed the new item description
  const embedding = await embedText(itemDescription);

  // Search company's existing portfolio items
  const { data: similarProducts } = await supabase.rpc(
    'match_portfolio_items',
    {
      tenant_id: tenantId,
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 5,
      item_type: 'product',
    }
  );

  // Analyze patterns
  const categoryPatterns = await analyzeCategoryPatterns(tenantId);
  const techStackPatterns = await analyzeTechStackPatterns(tenantId);

  return {
    similar_products: similarProducts || [],
    similar_services: [], // Similar query for services
    category_patterns: categoryPatterns,
    tech_stack_patterns: techStackPatterns,
  };
}

// Use in normalizer to suggest categories based on history
async function suggestCategoryFromHistory(
  item: RawExtractedItem,
  tenantId: string
): Promise<{ category: string; confidence: number }> {
  const history = await getCompanyHistoryContext(
    tenantId,
    `${item.name} ${item.description}`
  );

  if (history.similar_products.length > 0) {
    const topMatch = history.similar_products[0];
    return {
      category: topMatch.category,
      confidence: topMatch.similarity,
    };
  }

  // Fallback to most common category
  const mostCommon = Object.entries(history.category_patterns)
    .sort(([, a], [, b]) => b - a)[0];

  return {
    category: mostCommon?.[0] || 'Unknown',
    confidence: 0.6,
  };
}
```

**Implementation**:
1. Create `company_portfolio_embeddings` table in Supabase
2. Generate embeddings when items are saved (via `/ingest/save` endpoint)
3. Add `getCompanyHistoryContext()` to normalizer pipeline
4. Use similar items to suggest categories, technologies, pricing models

**Expected Impact**: Category accuracy 70% → 88%, auto-fill common fields

---

#### 2.3 Domain-Specific Fine-Tuning (Advanced)
**Problem**: Generic LLMs don't understand industry-specific terminology well.

**Solution**: Fine-tune embeddings on IT portfolio domain
```typescript
// NEW: backend/src/agents/utils/domainFineTuning.ts

// Create synthetic training data from catalogs + validated items
async function generateTrainingDataset(tenantId: string) {
  // Fetch all validated portfolio items
  const { data: items } = await supabase
    .from('portfolio_items')
    .select('*')
    .eq('company_id', tenantId);

  // Create text-label pairs for fine-tuning
  const trainingPairs = items.map(item => ({
    text: `${item.name}\n${item.description}`,
    labels: {
      type: item.type,
      category: item.category,
      subcategory: item.subcategory,
      priority: item.priority,
    },
  }));

  // Export for fine-tuning with OpenAI/Cohere
  return trainingPairs;
}

// Fine-tune embeddings (run periodically)
async function fineTuneEmbeddings() {
  const dataset = await generateTrainingDataset('all_tenants');

  // Use Cohere's fine-tuning API (easier than OpenAI for embeddings)
  const cohereApiKey = process.env.COHERE_API_KEY;
  const response = await fetch('https://api.cohere.ai/v1/embed-jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cohereApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'it-portfolio-embeddings',
      dataset: dataset,
      model: 'embed-english-v3.0',
    }),
  });

  return response.json();
}
```

**Implementation** (Optional - Advanced):
1. Collect 1000+ validated portfolio items across tenants
2. Fine-tune embedding model (Cohere or OpenAI)
3. Replace generic embeddings with domain-specific ones
4. Measure classification improvement

**Expected Impact**: Classification accuracy +5-10% (diminishing returns vs cost)

---

### ✅ Phase 3: HITL Validation & UX
**Timeline**: Weeks 7-9
**Goal**: Streamline human validation for low-confidence items

#### 3.1 Smart Validation Workflow
**Problem**: All items go through same review process regardless of confidence.

**Solution**: Tiered validation based on confidence
```typescript
// NEW: frontend/components/portfolio/SmartValidationWorkflow.tsx

interface ValidationTier {
  tier: 'auto_accept' | 'quick_review' | 'manual_entry';
  confidence_range: [number, number];
  action_required: string;
  estimated_time: string;
}

const VALIDATION_TIERS: ValidationTier[] = [
  {
    tier: 'auto_accept',
    confidence_range: [0.90, 1.0],
    action_required: 'None - Auto-saved',
    estimated_time: '0s',
  },
  {
    tier: 'quick_review',
    confidence_range: [0.70, 0.90],
    action_required: 'Quick validation',
    estimated_time: '10s per item',
  },
  {
    tier: 'manual_entry',
    confidence_range: [0, 0.70],
    action_required: 'Full review + edit',
    estimated_time: '30s per item',
  },
];

export function SmartValidationWorkflow({ items }: { items: IngestedItem[] }) {
  const tierGroups = groupItemsByTier(items);

  return (
    <div>
      {/* Auto-Accept Section */}
      <section>
        <h3>✅ Auto-Accepted ({tierGroups.auto_accept.length})</h3>
        <p>High confidence items - already saved</p>
        <CollapsibleList items={tierGroups.auto_accept} />
      </section>

      {/* Quick Review Section */}
      <section>
        <h3>👀 Quick Review ({tierGroups.quick_review.length})</h3>
        <p>Verify key fields only</p>
        {tierGroups.quick_review.map(item => (
          <QuickReviewCard
            key={item.id}
            item={item}
            fieldsToVerify={getFieldsToVerify(item)}
            onApprove={(corrections) => applyCorrectionsAndSave(item, corrections)}
          />
        ))}
      </section>

      {/* Manual Entry Section */}
      <section>
        <h3>✏️ Manual Review ({tierGroups.manual_entry.length})</h3>
        <p>Low confidence - full form required</p>
        {tierGroups.manual_entry.map(item => (
          <FullEditModal item={item} />
        ))}
      </section>
    </div>
  );
}

// Quick review card - only shows uncertain fields
function QuickReviewCard({ item, fieldsToVerify, onApprove }) {
  const [corrections, setCorrections] = useState({});

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
      <h4>{item.name}</h4>

      {/* Only show fields with confidence < 0.8 */}
      {fieldsToVerify.map(field => (
        <div key={field.name}>
          <label>{field.label}</label>
          <div className="flex gap-2">
            <input
              value={corrections[field.name] || item[field.name]}
              onChange={(e) => setCorrections({ ...corrections, [field.name]: e.target.value })}
              className={field.confidence < 0.6 ? 'border-red-500' : 'border-yellow-500'}
            />
            <ConfidenceBadge confidence={field.confidence} />
          </div>
        </div>
      ))}

      <button onClick={() => onApprove(corrections)}>
        ✅ Approve & Save
      </button>
    </div>
  );
}
```

**Implementation**:
1. Create `SmartValidationWorkflow.tsx` component
2. Update `/ingest` endpoint to return items grouped by tier
3. Add auto-save logic for high-confidence items (>90%)
4. Track time saved from auto-accepts

**Expected Impact**: Validation time reduced by 50%, better UX

---

#### 3.2 Bulk Edit & Actions
**Problem**: Editing similar items one by one is tedious.

**Solution**: Bulk operations for common corrections
```typescript
// ENHANCE: frontend/components/portfolio/AdvancedIngestionUploader.tsx

function BulkEditToolbar({ selectedItems }: { selectedItems: IngestedItem[] }) {
  const [bulkAction, setBulkAction] = useState<'category' | 'owner' | 'priority' | null>(null);

  const applyBulkEdit = (field: string, value: unknown) => {
    selectedItems.forEach(item => {
      updateItem(item.id, { [field]: value });
    });
  };

  return (
    <div className="flex gap-3 mb-4">
      <span>{selectedItems.length} items selected</span>

      <button onClick={() => setBulkAction('category')}>
        Set Category for All
      </button>

      <button onClick={() => setBulkAction('owner')}>
        Assign Owner to All
      </button>

      <button onClick={() => setBulkAction('priority')}>
        Set Priority for All
      </button>

      {bulkAction && (
        <BulkEditModal
          field={bulkAction}
          itemCount={selectedItems.length}
          onApply={(value) => {
            applyBulkEdit(bulkAction, value);
            setBulkAction(null);
          }}
          onCancel={() => setBulkAction(null)}
        />
      )}
    </div>
  );
}
```

**Implementation**:
1. Add `BulkEditToolbar` to uploader component
2. Support bulk category, owner, priority, status changes
3. Add "Apply to similar items" suggestion (based on name similarity)

**Expected Impact**: 40% faster editing for large batches

---

#### 3.3 Visual Confidence Indicators
**Problem**: Users can't see why confidence is low.

**Solution**: Transparent confidence breakdown UI
```typescript
// NEW: frontend/components/portfolio/ConfidenceBreakdown.tsx

function ConfidenceBreakdown({ item }: { item: IngestedItemEnhanced }) {
  const { confidence_breakdown } = item;

  return (
    <div className="bg-slate-800 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold">Overall Confidence</span>
        <span className={getConfidenceColor(confidence_breakdown.overall)}>
          {Math.round(confidence_breakdown.overall * 100)}%
        </span>
      </div>

      {/* Field-Level Breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm text-slate-400">Field Confidence</h4>
        {Object.entries(confidence_breakdown.fields).map(([field, conf]) => (
          <div key={field} className="flex items-center gap-2">
            <span className="text-sm flex-1">{field}</span>
            <ProgressBar value={conf} color={conf > 0.8 ? 'green' : conf > 0.6 ? 'yellow' : 'red'} />
            <span className="text-xs">{Math.round(conf * 100)}%</span>
          </div>
        ))}
      </div>

      {/* Quality Indicators */}
      <div className="mt-4 space-y-2">
        <h4 className="text-sm text-slate-400">Quality Indicators</h4>
        <QualityIndicator
          label="Source Clarity"
          value={confidence_breakdown.quality_indicators.source_clarity}
        />
        <QualityIndicator
          label="RAG Match"
          value={confidence_breakdown.quality_indicators.rag_match}
        />
        <QualityIndicator
          label="Schema Fit"
          value={confidence_breakdown.quality_indicators.schema_fit}
        />
      </div>

      {/* Reasoning */}
      <div className="mt-4">
        <h4 className="text-sm text-slate-400">AI Reasoning</h4>
        <ul className="text-xs text-slate-300 list-disc list-inside">
          {confidence_breakdown.reasoning.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Implementation**:
1. Create `ConfidenceBreakdown.tsx` component
2. Add confidence breakdown to item cards
3. Show reasoning on hover/click
4. Highlight low-confidence fields in edit modal

**Expected Impact**: Better trust in AI, faster identification of issues

---

### 🔄 Phase 4: Learning & Continuous Improvement
**Timeline**: Weeks 10-12
**Goal**: System learns from user corrections and improves over time

#### 4.1 Correction Feedback Loop
**Problem**: User corrections are lost - system makes same mistakes repeatedly.

**Solution**: Capture and learn from corrections
```typescript
// NEW: backend/src/agents/utils/feedbackLearning.ts

interface CorrectionFeedback {
  id: string;
  tenant_id: string;
  original_item: RawExtractedItem;
  corrected_item: NormalizedItem;
  corrections: Array<{
    field: string;
    original_value: unknown;
    corrected_value: unknown;
    confidence: number;
  }>;
  created_at: Date;
}

// Store corrections when user edits items
export async function recordCorrection(
  tenantId: string,
  originalItem: RawExtractedItem,
  correctedItem: NormalizedItem
): Promise<void> {
  const corrections = detectCorrections(originalItem, correctedItem);

  await supabase.from('ingestion_corrections').insert({
    tenant_id: tenantId,
    original_item: originalItem,
    corrected_item: correctedItem,
    corrections: corrections,
  });

  // If enough corrections accumulated, trigger retraining
  const correctionCount = await getCorrectionCount(tenantId);
  if (correctionCount % 50 === 0) {
    await triggerModelRetraining(tenantId);
  }
}

// Analyze correction patterns
async function analyzeCorrectionPatterns(tenantId: string) {
  const { data: corrections } = await supabase
    .from('ingestion_corrections')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);

  const patterns = {
    most_corrected_fields: {},
    common_type_mistakes: [],
    common_category_corrections: {},
  };

  for (const correction of corrections) {
    for (const field of correction.corrections) {
      patterns.most_corrected_fields[field.field] =
        (patterns.most_corrected_fields[field.field] || 0) + 1;
    }
  }

  return patterns;
}

// Use patterns to improve future extractions
export async function applyLearnings(
  item: RawExtractedItem,
  tenantId: string
): Promise<Partial<NormalizedItem>> {
  const patterns = await analyzeCorrectionPatterns(tenantId);
  const improvements: Partial<NormalizedItem> = {};

  // If users always correct "Servizio" → "Service", apply that
  if (patterns.common_category_corrections[item.rawType]) {
    improvements.category = patterns.common_category_corrections[item.rawType];
  }

  return improvements;
}
```

**Implementation**:
1. Create `ingestion_corrections` table in Supabase
2. Hook up `recordCorrection()` to `/ingest/save` endpoint
3. Add `applyLearnings()` to normalizer pipeline
4. Show "Applied learnings from X previous corrections" indicator in UI

**Expected Impact**: Accuracy improvement +2-5% per 100 corrections

---

#### 4.2 Active Learning Queue
**Problem**: System doesn't know which items to ask humans about.

**Solution**: Smart sampling for human review
```typescript
// NEW: backend/src/agents/utils/activeLearning.ts

interface LearningOpportunity {
  item: NormalizedItem;
  uncertainty_score: number;
  learning_value: number; // How much would this correction teach us?
  reason: string;
}

export async function identifyLearningOpportunities(
  items: NormalizedItem[]
): Promise<LearningOpportunity[]> {
  const opportunities: LearningOpportunity[] = [];

  for (const item of items) {
    // High uncertainty = good learning opportunity
    const uncertaintyScore = calculateUncertainty(item);

    // Items near decision boundaries teach us most
    if (uncertaintyScore > 0.4 && uncertaintyScore < 0.6) {
      opportunities.push({
        item,
        uncertainty_score: uncertaintyScore,
        learning_value: 0.9, // High value - boundary case
        reason: 'Near classification boundary - high learning value',
      });
    }

    // Rare categories teach us about edge cases
    const categoryRarity = await getCategoryRarity(item.category);
    if (categoryRarity < 0.05) { // Less than 5% of portfolio
      opportunities.push({
        item,
        uncertainty_score: uncertaintyScore,
        learning_value: 0.7,
        reason: `Rare category: ${item.category} (${Math.round(categoryRarity * 100)}%)`,
      });
    }
  }

  // Sort by learning value
  return opportunities.sort((a, b) => b.learning_value - a.learning_value);
}

// Present top learning opportunities to user
export function createLearningQueue(
  opportunities: LearningOpportunity[]
): LearningOpportunity[] {
  // Take top 5 most valuable, cap at 10% of batch
  const maxQueue = Math.min(5, Math.ceil(opportunities.length * 0.1));
  return opportunities.slice(0, maxQueue);
}
```

**Implementation**:
1. Add active learning analysis after normalization
2. Show "Help improve AI" badge on high-value learning items
3. Prioritize learning queue items in validation workflow
4. Track learning improvements over time

**Expected Impact**: Faster model improvement, better edge case handling

---

#### 4.3 Performance Monitoring Dashboard
**Problem**: No visibility into ingestion performance over time.

**Solution**: Analytics dashboard for ingestion metrics
```typescript
// NEW: frontend/app/portfolio/analytics/ingestion-metrics/page.tsx

export default function IngestionMetricsPage() {
  const metrics = useIngestionMetrics();

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Auto-Accept Rate"
          value={`${metrics.autoAcceptRate}%`}
          trend={metrics.autoAcceptRateTrend}
          target={60}
          icon="✅"
        />
        <MetricCard
          title="Avg Extraction Accuracy"
          value={`${metrics.avgAccuracy}%`}
          trend={metrics.accuracyTrend}
          target={95}
          icon="🎯"
        />
        <MetricCard
          title="Avg Confidence"
          value={`${metrics.avgConfidence}%`}
          trend={metrics.confidenceTrend}
          target={85}
          icon="📊"
        />
        <MetricCard
          title="Time Saved"
          value={`${metrics.timeSavedHours}h`}
          trend={metrics.timeSavedTrend}
          icon="⏱️"
        />
      </div>

      {/* Accuracy Over Time Chart */}
      <ChartCard title="Extraction Accuracy Trend">
        <LineChart
          data={metrics.accuracyHistory}
          xAxis="date"
          yAxis="accuracy"
          target={95}
        />
      </ChartCard>

      {/* Most Corrected Fields */}
      <ChartCard title="Most Corrected Fields (Improvement Opportunities)">
        <BarChart
          data={metrics.correctionsByField}
          xAxis="field"
          yAxis="correction_count"
        />
      </ChartCard>

      {/* Learning Progress */}
      <ChartCard title="Learning Progress">
        <LineChart
          data={metrics.learningProgress}
          xAxis="batch_number"
          yAxis="accuracy"
          annotation="Each point = 50 corrections"
        />
      </ChartCard>
    </div>
  );
}
```

**Implementation**:
1. Create `ingestion_metrics` table for time-series data
2. Track metrics on every ingestion batch
3. Build analytics dashboard
4. Add weekly email reports to admins

**Expected Impact**: Data-driven improvements, visibility into ROI

---

## Implementation Priorities

### 🚨 Must-Have (Weeks 1-6)
1. **Multi-Modal Document Understanding** (Phase 1.1) - Biggest accuracy impact
2. **Multi-Level Confidence Scoring** (Phase 1.2) - Enables smart validation
3. **Strategic Profile-Driven Extraction** (Phase 2.1) - Leverage existing work
4. **Smart Validation Workflow** (Phase 3.1) - Immediate UX improvement

### 💡 Should-Have (Weeks 7-9)
5. **Enhanced Table Extraction** (Phase 1.3) - Improves complex documents
6. **Company History RAG** (Phase 2.2) - Company-specific intelligence
7. **Visual Confidence Indicators** (Phase 3.3) - Transparency & trust
8. **Correction Feedback Loop** (Phase 4.1) - Continuous learning foundation

### 🎯 Nice-to-Have (Weeks 10-12)
9. **Bulk Edit & Actions** (Phase 3.2) - Power user feature
10. **Active Learning Queue** (Phase 4.2) - Advanced optimization
11. **Performance Monitoring** (Phase 4.3) - Analytics & insights
12. **Domain Fine-Tuning** (Phase 2.3) - Advanced (evaluate ROI first)

---

## Success Metrics

### Quantitative KPIs
- **Extraction Accuracy**: 70% → **95%** (target)
- **Auto-Accept Rate**: 40% → **60%** (confidence >90%)
- **Manual Review Time**: 30s/item → **15s/item**
- **Category Classification**: 70% → **88%**
- **Strategic Alignment Accuracy**: 60% → **90%**
- **Table Extraction Accuracy**: 50% → **95%**

### Qualitative Goals
- ✅ Users trust AI suggestions (transparent confidence)
- ✅ System learns from corrections (feedback loop working)
- ✅ Strategic profile actively used (not just stored)
- ✅ Complex documents handled (tables, charts, multi-page)
- ✅ Company-specific intelligence (RAG from history)

---

## Technical Stack Additions

### New Dependencies
```json
{
  "dependencies": {
    "@google-cloud/vision": "^4.0.0",           // Document understanding (OR Azure)
    "cohere-ai": "^7.0.0",                       // Optional: Fine-tuned embeddings
    "pdf-table-extract": "^1.0.0",              // Table extraction helper
    "chart.js": "^4.4.0",                        // Analytics charts
    "react-chartjs-2": "^5.2.0"                  // Chart components
  },
  "devDependencies": {
    "camelot-py": "^0.11.0"                      // Python microservice (separate)
  }
}
```

### Infrastructure Additions
- **Python Microservice**: Camelot table extraction (Docker container)
- **Supabase Tables**: `ingestion_corrections`, `ingestion_metrics`, `company_portfolio_embeddings`
- **API Keys**: Google Cloud Vision OR Azure Document Intelligence

---

## Risk Mitigation

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Vision API costs too high | High | Start with open-source (MinerU), measure ROI before scaling |
| Fine-tuning doesn't improve enough | Medium | Make it Phase 4 (optional), validate with A/B test |
| Complex table extraction fails | Medium | Keep fallback to current XLSX.js approach |
| Learning loop introduces bias | Medium | Human review of applied learnings, confidence thresholds |

### Business Risks
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Users don't trust AI | High | Transparent confidence, reasoning, allow overrides |
| Performance degrades with scale | Medium | Monitor metrics, optimize RAG queries, cache embeddings |
| GDPR concerns with correction storage | Low | Anonymize correction data, add retention policies |

---

## Next Steps

### Immediate (This Week)
1. ✅ **Review and approve this roadmap** with stakeholders
2. **Phase 1.1**: Set up Azure Document Intelligence OR Google Cloud Vision account
3. **Phase 1.2**: Implement confidence breakdown schema changes
4. **Phase 2.1**: Enhance normalizer to use strategic profile context

### Week 2-3
5. **Phase 1.1**: Integrate document understanding into PDF parser
6. **Phase 1.2**: Update frontend to display field-level confidence
7. **Phase 3.1**: Build smart validation workflow UI

### Week 4-6
8. **Phase 2.1**: Add strategic goal matching and alignment scoring
9. **Phase 2.2**: Create company history RAG (embeddings table + search)
10. **Phase 3.3**: Add confidence breakdown visualization

### Week 7-9
11. **Phase 1.3**: Integrate Camelot for complex table extraction
12. **Phase 4.1**: Create correction feedback system
13. **Testing**: A/B test new pipeline vs old on real documents

### Week 10-12
14. **Phase 4.2**: Implement active learning queue
15. **Phase 4.3**: Build analytics dashboard
16. **Launch**: Roll out to production with monitoring

---

## Conclusion

This roadmap transforms THEMIS's AI ingestion from a **basic extraction tool** into a **strategic portfolio intelligence engine**. By leveraging the existing strategic profile work, adding multi-modal understanding, and creating a learning feedback loop, we'll achieve:

- **95%+ extraction accuracy** (from 70%)
- **60%+ auto-accept rate** (less manual work)
- **Company-specific intelligence** (learns from each tenant)
- **Transparent AI** (users understand why confidence is low/high)
- **Continuous improvement** (gets smarter with every correction)

The phased approach allows us to deliver value incrementally while managing risk. Start with Phase 1 (foundation) for immediate impact, then build intelligence (Phase 2) and UX (Phase 3), finishing with learning (Phase 4) for long-term improvement.

**Il cervello di tutto è pronto per l'upgrade. 🚀**
