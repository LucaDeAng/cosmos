# 🎯 THEMIS Differentiation Features - Claude Code TODO

**Obiettivo**: Implementare feature che differenziano THEMIS dai competitor (Planview, ServiceNow, Informatica, Collibra)

**Principio guida**: THEMIS è l'unica piattaforma che combina IT Portfolio Management + AI Data Extraction + Continuous Learning

---

## 📋 Task Overview

| Priority | Feature | Effort | Files | Status |
|----------|---------|--------|-------|--------|
| P0 | Smart HITL Validation Workflow | 3 days | Frontend | ✅ DONE |
| P1 | Continuous Learning Engine | 5 days | Backend + DB | ✅ DONE |
| P2 | Portfolio Health Score | 4 days | Backend + Frontend | ✅ DONE |
| P3 | Product Dependency Graph | 3 days | Backend + Frontend | ✅ DONE |
| P4 | External Enrichment (MCP) | 3 days | Backend | ✅ DONE |

---

## P0: Smart HITL Validation Workflow

### Obiettivo
Trasformare la validazione da "lista piatta" a "workflow guidato intelligente" che riduce il tempo di validazione del 50%.

### Task

#### P0.1: Categorize items by confidence
**File**: `frontend/components/portfolio/AdvancedIngestionUploader.tsx`

```typescript
// TODO: Add after line ~100 (after interfaces)

interface ValidationQueue {
  highPriority: NormalizedItem[];    // confidence < 60% - require manual review
  mediumPriority: NormalizedItem[];  // 60% ≤ confidence < 80% - quick review
  autoAccepted: NormalizedItem[];    // confidence ≥ 80% - auto-accept with undo
}

function categorizeByConfidence(items: NormalizedItem[]): ValidationQueue {
  return {
    highPriority: items.filter(i => {
      const conf = i.confidence_breakdown?.overall ?? i.confidence ?? 0;
      return conf < 0.6;
    }),
    mediumPriority: items.filter(i => {
      const conf = i.confidence_breakdown?.overall ?? i.confidence ?? 0;
      return conf >= 0.6 && conf < 0.8;
    }),
    autoAccepted: items.filter(i => {
      const conf = i.confidence_breakdown?.overall ?? i.confidence ?? 0;
      return conf >= 0.8;
    })
  };
}
```

#### P0.2: Create SmartValidationWorkflow component
**File**: `frontend/components/portfolio/SmartValidationWorkflow.tsx` (NEW)

```typescript
// TODO: Create new file with this structure

'use client';

import React, { useState, useCallback } from 'react';
import { NormalizedItem } from '@/types/portfolio';

interface SmartValidationWorkflowProps {
  queue: ValidationQueue;
  onValidate: (item: NormalizedItem) => void;
  onReject: (item: NormalizedItem) => void;
  onAutoAcceptAll: (items: NormalizedItem[]) => void;
  onFieldUpdate: (itemId: string, field: string, value: any, originalValue: any) => void;
}

export function SmartValidationWorkflow({ 
  queue, 
  onValidate, 
  onReject, 
  onAutoAcceptAll,
  onFieldUpdate 
}: SmartValidationWorkflowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  
  const currentItem = queue.highPriority[currentIndex];
  const totalHighPriority = queue.highPriority.length;
  
  const handleValidate = useCallback(() => {
    onValidate(currentItem);
    setValidatedCount(prev => prev + 1);
    if (currentIndex < totalHighPriority - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentItem, currentIndex, totalHighPriority, onValidate]);
  
  const handleSkip = useCallback(() => {
    if (currentIndex < totalHighPriority - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, totalHighPriority]);

  // TODO: Implement full UI with:
  // 1. Progress bar showing validated/total
  // 2. Focus card for current item with yellow border
  // 3. AI reasoning display (from confidence_breakdown.reasoning)
  // 4. Quick edit fields for low-confidence fields only
  // 5. Action buttons: Confirm, Skip, Reject
  // 6. Queue preview thumbnails at bottom
  // 7. Auto-accept banner for high-confidence items
  
  return (
    <div className="space-y-6">
      {/* Implementation here */}
    </div>
  );
}
```

#### P0.3: Create QuickEditField component
**File**: `frontend/components/portfolio/QuickEditField.tsx` (NEW)

```typescript
// TODO: Create component for inline field editing

interface QuickEditFieldProps {
  field: string;
  value: any;
  confidence: number;
  suggestions?: string[];  // From RAG context
  onUpdate: (newValue: any) => void;
}

// Show field with:
// - Current value
// - Confidence indicator (red/yellow/green)
// - Dropdown with suggestions if available
// - Free text input as fallback
```

#### P0.4: Integrate into AdvancedIngestionUploader
**File**: `frontend/components/portfolio/AdvancedIngestionUploader.tsx`

```typescript
// TODO: Replace current preview step with SmartValidationWorkflow

// In the preview step (around line 400-500), replace flat list with:
// 1. Show summary: "X items auto-accepted, Y need review"
// 2. Render SmartValidationWorkflow for items needing review
// 3. Add "Review auto-accepted" expandable section
```

### Acceptance Criteria
- [x] Items categorized into 3 confidence buckets
- [x] Focus mode for low-confidence items
- [x] AI reasoning visible for each item
- [x] Quick edit only shows low-confidence fields
- [x] Auto-accept banner with undo option
- [x] Progress tracking during validation

---

## P1: Continuous Learning Engine

### Obiettivo
THEMIS impara dalle correzioni utente e migliora nel tempo. Nessun competitor lo fa.

### Task

#### P1.1: Create database tables
**File**: `backend/src/migrations/YYYYMMDD_add_learning_tables.sql` (NEW)

```sql
-- TODO: Create migration file

-- User corrections table
CREATE TABLE user_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID,
  item_type VARCHAR(20) NOT NULL, -- 'product' or 'service'
  field VARCHAR(100) NOT NULL,
  original_value JSONB,
  corrected_value JSONB NOT NULL,
  context JSONB, -- { documentType, sourceText, category, vendor }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Learned patterns table
CREATE TABLE learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field VARCHAR(100) NOT NULL,
  pattern_type VARCHAR(50) NOT NULL, -- 'value_mapping', 'category_inference', 'vendor_normalization'
  pattern_rule JSONB NOT NULL, -- { condition: {...}, result: {...} }
  confidence FLOAT DEFAULT 0.5,
  occurrences INTEGER DEFAULT 1,
  last_applied TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_corrections_tenant_field ON user_corrections(tenant_id, field);
CREATE INDEX idx_corrections_context ON user_corrections USING GIN (context);
CREATE INDEX idx_patterns_tenant_confidence ON learned_patterns(tenant_id, confidence DESC);
CREATE INDEX idx_patterns_field ON learned_patterns(tenant_id, field);

-- Pattern effectiveness tracking
CREATE TABLE pattern_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES learned_patterns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  was_correct BOOLEAN, -- NULL until user confirms/rejects
  confirmed_at TIMESTAMPTZ
);
```

#### P1.2: Create FeedbackLearningAgent
**File**: `backend/src/agents/subagents/learning/feedbackLearningAgent.ts` (NEW)

```typescript
// TODO: Create new file

import { supabase } from '../../../lib/supabase';

interface UserCorrection {
  tenantId: string;
  itemId: string;
  itemType: 'product' | 'service';
  field: string;
  originalValue: any;
  correctedValue: any;
  context: {
    documentType?: string;
    sourceText?: string;
    category?: string;
    vendor?: string;
  };
  userId: string;
}

interface LearnedPattern {
  id: string;
  tenantId: string;
  field: string;
  patternType: 'value_mapping' | 'category_inference' | 'vendor_normalization';
  patternRule: {
    condition: Record<string, any>;
    result: any;
  };
  confidence: number;
  occurrences: number;
}

/**
 * Record a user correction and potentially create/update patterns
 */
export async function recordCorrection(correction: UserCorrection): Promise<{
  saved: boolean;
  patternCreated: boolean;
  patternId?: string;
}> {
  // TODO: Implement
  // 1. Save correction to user_corrections table
  // 2. Find similar corrections (same tenant, field, similar context)
  // 3. If ≥3 similar corrections exist, create or update pattern
  // 4. Return result
}

/**
 * Find similar corrections for pattern detection
 */
async function findSimilarCorrections(
  tenantId: string,
  field: string,
  context: Record<string, any>,
  limit: number = 10
): Promise<UserCorrection[]> {
  // TODO: Implement
  // Query user_corrections with:
  // - Same tenant_id
  // - Same field
  // - Similar context (use JSONB containment or similarity)
}

/**
 * Create or update a learned pattern
 */
async function createOrUpdatePattern(
  tenantId: string,
  field: string,
  corrections: UserCorrection[]
): Promise<LearnedPattern> {
  // TODO: Implement
  // 1. Analyze corrections to find common pattern
  // 2. Generate pattern rule (condition -> result)
  // 3. Calculate initial confidence based on consistency
  // 4. Upsert to learned_patterns table
}

/**
 * Apply learned patterns to a new item during normalization
 */
export async function applyLearnedPatterns(
  item: NormalizedItem,
  tenantId: string
): Promise<{
  item: NormalizedItem;
  patternsApplied: string[];
}> {
  // TODO: Implement
  // 1. Fetch applicable patterns for this tenant (confidence > 0.7)
  // 2. For each pattern, check if condition matches item
  // 3. If match, apply result to item
  // 4. Track application in pattern_applications table
  // 5. Add to normalizationNotes
}

/**
 * Update pattern confidence based on user feedback
 */
export async function updatePatternConfidence(
  patternId: string,
  wasCorrect: boolean
): Promise<void> {
  // TODO: Implement
  // Update confidence using exponential moving average:
  // new_confidence = old_confidence * 0.9 + (wasCorrect ? 0.1 : 0)
}

/**
 * Get learning statistics for a tenant
 */
export async function getLearningStats(tenantId: string): Promise<{
  totalCorrections: number;
  patternsLearned: number;
  accuracyRate: number;
  topPatterns: LearnedPattern[];
}> {
  // TODO: Implement
}
```

#### P1.3: Create API endpoint for feedback
**File**: `backend/src/routes/portfolio.routes.ts`

```typescript
// TODO: Add new endpoint after existing routes

/**
 * POST /api/portfolio/feedback
 * Record user corrections for learning
 */
router.post('/feedback', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, itemType, corrections } = req.body;
    const tenantId = req.user?.company_id;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const results = [];
    for (const correction of corrections) {
      const result = await feedbackLearningAgent.recordCorrection({
        tenantId,
        itemId,
        itemType,
        field: correction.field,
        originalValue: correction.original,
        correctedValue: correction.corrected,
        context: correction.context || {},
        userId
      });
      results.push(result);
    }
    
    const patternsCreated = results.filter(r => r.patternCreated).length;
    
    res.json({
      success: true,
      correctionsRecorded: results.length,
      patternsCreated,
      message: patternsCreated > 0 
        ? `Learned ${patternsCreated} new pattern(s) from your corrections!`
        : 'Corrections recorded for future learning.'
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * GET /api/portfolio/learning-stats
 * Get learning statistics for current tenant
 */
router.get('/learning-stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.company_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const stats = await feedbackLearningAgent.getLearningStats(tenantId);
    res.json(stats);
  } catch (error) {
    console.error('Learning stats error:', error);
    res.status(500).json({ error: 'Failed to get learning stats' });
  }
});
```

#### P1.4: Integrate learning into normalization pipeline
**File**: `backend/src/agents/subagents/ingestion/normalizerAgent.ts`

```typescript
// TODO: Add import at top
import { applyLearnedPatterns } from '../learning/feedbackLearningAgent';

// TODO: Add in normalizeItems function, after RAG enrichment (around line 960)
// Before returning normalized item:

// Apply learned patterns from user corrections
const { item: learnedItem, patternsApplied } = await applyLearnedPatterns(
  normalizedItem,
  tenantId
);

if (patternsApplied.length > 0) {
  learnedItem.normalizationNotes = [
    ...(learnedItem.normalizationNotes || []),
    `Applied ${patternsApplied.length} learned pattern(s) from your previous corrections`
  ];
  
  // Boost confidence slightly when patterns are applied
  if (learnedItem.confidence_breakdown) {
    learnedItem.confidence_breakdown.overall = Math.min(
      1.0,
      learnedItem.confidence_breakdown.overall + 0.05 * patternsApplied.length
    );
  }
}

return learnedItem;
```

#### P1.5: Frontend feedback capture
**File**: `frontend/components/portfolio/SmartValidationWorkflow.tsx`

```typescript
// TODO: Add to SmartValidationWorkflow

// Track field edits
const [fieldEdits, setFieldEdits] = useState<Map<string, { original: any; corrected: any }>>(new Map());

const handleFieldUpdate = (field: string, newValue: any) => {
  const originalValue = currentItem[field];
  setFieldEdits(prev => new Map(prev).set(field, { 
    original: originalValue, 
    corrected: newValue 
  }));
  // Update local item state
};

const handleValidate = async () => {
  // Send corrections to backend if any edits were made
  if (fieldEdits.size > 0) {
    const corrections = Array.from(fieldEdits.entries()).map(([field, values]) => ({
      field,
      original: values.original,
      corrected: values.corrected,
      context: {
        documentType: currentItem.extraction_metadata?.source_type,
        category: currentItem.category,
        vendor: currentItem.vendor
      }
    }));
    
    await fetch('/api/portfolio/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: currentItem.id,
        itemType: currentItem.type,
        corrections
      })
    });
  }
  
  onValidate(currentItem);
  setFieldEdits(new Map()); // Reset for next item
  // ... continue with next item
};
```

### Acceptance Criteria
- [x] Corrections saved to database with context
- [x] Patterns created after 3+ similar corrections
- [x] Patterns applied during normalization
- [x] Confidence updated based on pattern effectiveness
- [x] Learning stats API endpoint working
- [x] Frontend captures and sends corrections

---

## P2: Portfolio Health Score

### Obiettivo
Mostrare un "health score" del portfolio con raccomandazioni actionable. I CIO lo adorano.

### Task

#### P2.1: Create PortfolioHealthAgent
**File**: `backend/src/agents/subagents/analysis/portfolioHealthAgent.ts` (NEW)

```typescript
// TODO: Create new file

import { PortfolioItem, MaturityProfile } from '../../../types';

interface HealthDimension {
  name: string;
  score: number;        // 0-100
  status: 'critical' | 'warning' | 'good' | 'excellent';
  weight: number;       // For overall calculation
  findings: string[];
  recommendations: Recommendation[];
}

interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  relatedItems?: string[]; // Item IDs
}

interface PortfolioHealthReport {
  overallScore: number;
  overallStatus: 'critical' | 'warning' | 'good' | 'excellent';
  dimensions: {
    coverage: HealthDimension;      // Gap analysis vs maturity goals
    balance: HealthDimension;       // Core vs support, build vs buy
    risk: HealthDimension;          // Vendor concentration, EOL, security
    alignment: HealthDimension;     // Strategic fit
    efficiency: HealthDimension;    // Redundancy, cost optimization
  };
  topRecommendations: Recommendation[];
  trends?: {
    scoreChange: number;  // vs last assessment
    newRisks: number;
    resolvedRisks: number;
  };
}

export async function analyzePortfolioHealth(
  tenantId: string,
  items: PortfolioItem[],
  maturityProfile?: MaturityProfile
): Promise<PortfolioHealthReport> {
  // TODO: Implement each dimension analyzer
  
  const coverage = analyzeCoverage(items, maturityProfile);
  const balance = analyzeBalance(items);
  const risk = analyzeRisk(items);
  const alignment = analyzeAlignment(items, maturityProfile?.strategicGoals);
  const efficiency = analyzeEfficiency(items);
  
  // Calculate weighted overall score
  const dimensions = { coverage, balance, risk, alignment, efficiency };
  const overallScore = calculateWeightedScore(dimensions);
  
  // Collect and prioritize recommendations
  const allRecommendations = [
    ...coverage.recommendations,
    ...balance.recommendations,
    ...risk.recommendations,
    ...alignment.recommendations,
    ...efficiency.recommendations
  ];
  const topRecommendations = prioritizeRecommendations(allRecommendations).slice(0, 5);
  
  return {
    overallScore,
    overallStatus: getStatusFromScore(overallScore),
    dimensions,
    topRecommendations
  };
}

// TODO: Implement each analyzer function:

function analyzeCoverage(items: PortfolioItem[], profile?: MaturityProfile): HealthDimension {
  // Check if portfolio covers key IT domains based on maturity level
  // - Infrastructure, Security, Data, Applications, Integration
  // - Compare against industry benchmarks for company size/maturity
}

function analyzeBalance(items: PortfolioItem[]): HealthDimension {
  // Check balance ratios:
  // - Core vs Support (ideally 60/40 for core)
  // - Build vs Buy (depends on maturity)
  // - Products vs Services ratio
  // - Budget distribution across categories
}

function analyzeRisk(items: PortfolioItem[]): HealthDimension {
  // Risk factors:
  // - Vendor concentration (>40% from single vendor = high risk)
  // - EOL products count
  // - Products not updated in 12+ months
  // - Missing security-critical products
  // - Single points of failure (critical items without alternatives)
}

function analyzeAlignment(items: PortfolioItem[], goals?: StrategicGoal[]): HealthDimension {
  // Strategic alignment:
  // - % items with high strategic alignment (≥7)
  // - Coverage of each strategic goal
  // - Orphan items (low alignment, no clear purpose)
  // - Budget alignment with priorities
}

function analyzeEfficiency(items: PortfolioItem[]): HealthDimension {
  // Efficiency issues:
  // - Potential duplicates (similar names/functions)
  // - Underutilized items (if usage data available)
  // - Cost outliers
  // - Items with overlapping functionality
}

function calculateWeightedScore(dimensions: Record<string, HealthDimension>): number {
  const weights = {
    coverage: 0.20,
    balance: 0.15,
    risk: 0.30,    // Risk weighted highest
    alignment: 0.25,
    efficiency: 0.10
  };
  
  let total = 0;
  for (const [key, dim] of Object.entries(dimensions)) {
    total += dim.score * (weights[key as keyof typeof weights] || 0.2);
  }
  return Math.round(total);
}

function prioritizeRecommendations(recs: Recommendation[]): Recommendation[] {
  // Sort by: priority (high first), then impact/effort ratio
  return recs.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const effortValue = { low: 3, medium: 2, high: 1 };
    
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return effortValue[b.effort] - effortValue[a.effort];
  });
}
```

#### P2.2: Create API endpoint
**File**: `backend/src/routes/portfolio.routes.ts`

```typescript
// TODO: Add endpoint

/**
 * GET /api/portfolio/health
 * Get portfolio health score and recommendations
 */
router.get('/health', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.company_id;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Get portfolio items
    const items = await getPortfolioItems(tenantId);
    
    // Get maturity profile if available
    const maturityProfile = await getLatestMaturityProfile(tenantId);
    
    // Analyze health
    const healthReport = await analyzePortfolioHealth(tenantId, items, maturityProfile);
    
    res.json(healthReport);
  } catch (error) {
    console.error('Portfolio health error:', error);
    res.status(500).json({ error: 'Failed to analyze portfolio health' });
  }
});
```

#### P2.3: Create PortfolioHealthDashboard component
**File**: `frontend/components/portfolio/PortfolioHealthDashboard.tsx` (NEW)

```typescript
// TODO: Create dashboard component with:
// 1. Overall score circle/gauge (0-100)
// 2. 5 dimension cards with individual scores
// 3. Top 5 recommendations list
// 4. Trend indicators (if historical data available)
// 5. Drill-down capability for each dimension
```

### Acceptance Criteria
- [x] All 5 health dimensions implemented
- [x] Realistic scoring algorithm
- [x] At least 3 recommendations per dimension
- [x] API endpoint returns full report
- [x] Dashboard displays all data
- [x] Recommendations are actionable

---

## P3: Product Dependency Graph

### Obiettivo
Visualizzare relazioni tra prodotti/servizi. Nessun competitor IT PPM lo fa.

### Task

#### P3.1: Create DependencyGraphAgent
**File**: `backend/src/agents/subagents/analysis/dependencyGraphAgent.ts` (NEW)

```typescript
// TODO: Create new file

interface ProductDependency {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  type: 'requires' | 'integrates_with' | 'replaces' | 'extends' | 'conflicts_with';
  confidence: number;
  reason: string;
  detected_by: 'text_analysis' | 'category_inference' | 'llm_analysis';
}

interface DependencyGraph {
  nodes: Array<{
    id: string;
    name: string;
    type: 'product' | 'service';
    category: string;
    strategic_importance: string;
  }>;
  edges: ProductDependency[];
  clusters: Array<{
    name: string;
    nodeIds: string[];
  }>;
}

export async function analyzeDependencies(
  items: PortfolioItem[]
): Promise<DependencyGraph> {
  // TODO: Implement
  // 1. Text-based detection (mentions in descriptions)
  // 2. Category-based inference (common integration patterns)
  // 3. LLM analysis for complex items (budget > 100k)
  // 4. Deduplicate and merge confidence scores
}

export function generateMermaidDiagram(graph: DependencyGraph): string {
  // TODO: Generate Mermaid flowchart syntax
  // - Nodes styled by strategic_importance
  // - Edges styled by dependency type
  // - Clusters for related items
}

export function detectConflicts(graph: DependencyGraph): ProductDependency[] {
  // TODO: Return only 'conflicts_with' edges for warnings
}
```

#### P3.2: Create API endpoint
**File**: `backend/src/routes/portfolio.routes.ts`

```typescript
// TODO: Add endpoint

/**
 * GET /api/portfolio/dependencies
 * Get dependency graph for portfolio
 */
router.get('/dependencies', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.company_id;
    const items = await getPortfolioItems(tenantId);
    
    const graph = await analyzeDependencies(items);
    const mermaid = generateMermaidDiagram(graph);
    const conflicts = detectConflicts(graph);
    
    res.json({
      graph,
      mermaidCode: mermaid,
      conflictCount: conflicts.length,
      conflicts
    });
  } catch (error) {
    console.error('Dependency analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze dependencies' });
  }
});
```

#### P3.3: Create DependencyGraph component
**File**: `frontend/components/portfolio/DependencyGraph.tsx` (NEW)

```typescript
// TODO: Create using react-mermaid2 or similar
// - Interactive graph visualization
// - Click nodes to see details
// - Highlight conflicts in red
// - Filter by dependency type
// - Zoom/pan controls
```

### Acceptance Criteria
- [x] Text-based dependency detection works
- [x] Category inference finds common patterns
- [x] Mermaid diagram generates correctly
- [x] Conflicts highlighted
- [x] Interactive frontend component

---

## P4: External Enrichment (MCP)

### Obiettivo
Arricchire prodotti con dati da Icecat (45M+ prodotti tech) e GS1.

### Task

#### P4.1: Create ExternalEnrichmentAgent
**File**: `backend/src/agents/subagents/enrichment/externalEnrichmentAgent.ts` (NEW)

```typescript
// TODO: Create new file with MCP integration
// - Icecat MCP for product specifications
// - GS1 for standardized categorization
// - Web search fallback for pricing

// Note: Requires MCP SDK setup and API keys
// Only for products, not services
```

#### P4.2: Add enrichment to normalization pipeline
**File**: `backend/src/agents/subagents/ingestion/normalizerAgent.ts`

```typescript
// TODO: Add optional enrichment step
// Only call for high-value products (budget > 50k)
// Cache results to avoid repeated API calls
```

### Acceptance Criteria
- [x] Icecat integration working (placeholder - requires API key)
- [x] GS1 categorization working (placeholder - requires API key)
- [x] Caching implemented
- [x] Graceful fallback on API errors

---

## 📁 File Structure Summary

```
backend/src/
├── agents/subagents/
│   ├── learning/
│   │   └── feedbackLearningAgent.ts      # P1 (NEW)
│   ├── analysis/
│   │   ├── portfolioHealthAgent.ts       # P2 (NEW)
│   │   └── dependencyGraphAgent.ts       # P3 (NEW)
│   ├── enrichment/
│   │   └── externalEnrichmentAgent.ts    # P4 (NEW)
│   └── ingestion/
│       └── normalizerAgent.ts            # P1 (MODIFY)
├── routes/
│   └── portfolio.routes.ts               # P1, P2, P3 (MODIFY)
└── migrations/
    └── YYYYMMDD_add_learning_tables.sql  # P1 (NEW)

frontend/components/portfolio/
├── SmartValidationWorkflow.tsx           # P0 (NEW)
├── QuickEditField.tsx                    # P0 (NEW)
├── PortfolioHealthDashboard.tsx          # P2 (NEW)
├── DependencyGraph.tsx                   # P3 (NEW)
└── AdvancedIngestionUploader.tsx         # P0 (MODIFY)
```

---

## 🧪 Testing Checklist

### P0: Smart HITL

- [x] Items correctly categorized by confidence
- [x] Focus mode navigates through queue
- [x] Auto-accept works with undo
- [x] Field edits save correctly

### P1: Continuous Learning

- [x] Corrections saved to DB
- [x] Pattern created after 3 corrections
- [x] Pattern applied during normalization
- [x] Confidence updates work

### P2: Portfolio Health

- [x] All 5 dimensions calculate correctly
- [x] Recommendations make sense
- [x] Score reflects actual portfolio state

### P3: Dependency Graph

- [x] Dependencies detected from text
- [x] Mermaid renders correctly
- [x] Conflicts highlighted

---

## 🚀 Definition of Done

Each feature is complete when:
1. ✅ All code implemented and TypeScript compiles
2. ✅ API endpoints documented and tested
3. ✅ Frontend components render correctly
4. ✅ Integration tested end-to-end
5. ✅ No regressions in existing functionality
