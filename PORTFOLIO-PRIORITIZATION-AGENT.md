# Portfolio Prioritization & Optimization Agent
## Specifica Tecnica Completa per THEMIS

> **Basato su ricerca accademica**: Survey di 108+ tecniche di prioritizzazione, analisi Bayesiana su 32.139 decisioni reali, Portfolio Theory

---

## 1. Executive Summary

### Problema
La fase post-ingestion di THEMIS richiede un sistema intelligente per:
1. **Prioritizzare** centinaia di prodotti/servizi IT estratti
2. **Ottimizzare** il portfolio considerando vincoli di budget, tempo, risorse
3. **Raccomandare** quali item mantenere, eliminare, investire, dismettere

### Soluzione Proposta
Un **Hybrid Prioritization Agent** che combina:
- **Grouping-Based Methods** (MoSCoW, Numeral Assignment) per triage rapido
- **Weighted Scoring** (WSJF modificato) per ranking preciso
- **Machine Learning** per apprendere dalle correzioni utente
- **Portfolio Theory** per ottimizzazione globale

### Impatto Atteso
| Metrica | Prima | Dopo |
|---------|-------|------|
| Tempo prioritizzazione manuale | 4-8 ore | 5-10 minuti |
| Accuratezza classificazione | 60% | 85%+ |
| Copertura criteri strategici | 3-4 criteri | 12+ criteri |

---

## 2. Fondamenti Teorici (dalla Letteratura)

### 2.1 Tassonomia delle Tecniche di Prioritizzazione

```
┌─────────────────────────────────────────────────────────────────┐
│           TECNICHE DI PRIORITIZZAZIONE                          │
├─────────────────────────────┬───────────────────────────────────┤
│  RELATIVE PRIORITIZATION    │    EXACT PRIORITIZATION           │
├─────────────────────────────┼───────────────────────────────────┤
│  Grouping Based             │    Absolute Evaluation            │
│  ├── MoSCoW                 │    ├── Wiegers Method             │
│  ├── Numeral Assignment     │    ├── Subjective Ranking         │
│  └── Moscow Extended        │    └── Five Whys (FW)             │
│                             │                                   │
│  Search Based               │    Pairwise Comparison            │
│  ├── Binary Search Tree     │    ├── AHP (Analytic Hierarchy)   │
│  ├── B-Tree                 │    ├── ANP (Analytic Network)     │
│  └── Bubble Sort            │    ├── 100-Point/Cumulative Vote  │
│                             │    └── ML-Based (CBRank)          │
└─────────────────────────────┴───────────────────────────────────┘
```

**Fonte**: "Choosing a Suitable Requirement Prioritization Method: A Survey"

### 2.2 I Criteri NON Hanno Uguale Peso

Dalla ricerca "Not All Requirements Prioritization Criteria are Equal at All Times" (32.139 decisioni analizzate):

| Criterio | Impatto Reale | Note |
|----------|---------------|------|
| **Team Priority** | ⭐⭐⭐⭐⭐ | Maggior impatto su tutti gli stati |
| **Criticality** | ⭐⭐⭐⭐⭐ | Forte effetto binario |
| **Business Value** | ⭐⭐⭐⭐ | Impatto variabile per stato |
| **Customer Value** | ⭐⭐⭐ | Significativo in stati 3-4 |
| **Stakeholders** | ⭐⭐ | Counter-intuitivo: più stakeholder = più incertezza |
| **Dependency** | ⭐⭐ | Significativo solo in certi momenti |
| **Key Customers** | ⭐ | Nessun impatto rilevato! |
| **Architects' Involvement** | ⭐⭐⭐ | Solo negli stati finali |

> **Insight chiave**: I criteri cambiano importanza in base alla fase del processo decisionale

### 2.3 Portfolio Theory Approach

Dalla ricerca "A Portfolio Theory Approach to Solve the Product Elimination Problem":

**7 Scale di Valutazione per Decisioni di Portfolio**:
1. Future Market Potential (0-1)
2. Product Modification Gain (0-1)
3. Financial Impact (0-1)
4. Strategic Fit (0-1)
5. Resource Requirements (0-1)
6. Risk Level (0-1)
7. Competitive Position (0-1)

**Formula di Retention Index**:
```
RI = Σ(Wi × Ri) / Σ(Wi)

Dove:
- Wi = peso del criterio i
- Ri = rating del prodotto sul criterio i (0-1)
```

---

## 3. Architettura dell'Agente

### 3.1 Overview del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PORTFOLIO PRIORITIZATION AGENT                        │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   TRIAGE LAYER  │───▶│  SCORING LAYER  │───▶│ OPTIMIZATION    │      │
│  │   (Grouping)    │    │  (Multi-Criteria)│    │ LAYER           │      │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘      │
│          │                      │                      │                │
│          ▼                      ▼                      ▼                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      LEARNING LAYER                              │   │
│  │   - Feedback Loop  - Pattern Recognition  - Weight Adjustment    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Layer 1: Triage Rapido (Grouping-Based)

**Scopo**: Classificazione rapida per grandi volumi (>100 items)

```typescript
// Pseudo-codice del Triage Layer
interface TriageResult {
  category: 'MUST' | 'SHOULD' | 'COULD' | 'WONT' | 'UNKNOWN';
  confidence: number; // 0-1
  reasoning: string;
}

async function triageItem(
  item: PortfolioItem,
  strategicProfile: StrategicProfile
): Promise<TriageResult> {
  
  const signals = {
    // Segnali positivi per MUST
    isInStrategicGoals: matchesStrategicGoals(item, strategicProfile),
    hasHighBusinessValue: item.businessValue >= 7,
    isCriticalInfrastructure: item.category?.includes('Infrastructure'),
    hasRegComplianceNeed: item.tags?.includes('compliance'),
    
    // Segnali negativi per WONT
    isEndOfLife: item.lifecycle === 'end_of_life',
    hasNoActiveUsers: item.activeUsers === 0,
    isDuplicate: item.flags?.includes('duplicate'),
    isOutdated: item.lastUpdate && daysSince(item.lastUpdate) > 730,
  };
  
  // MoSCoW Extended Logic
  if (signals.hasRegComplianceNeed || signals.isCriticalInfrastructure) {
    return { category: 'MUST', confidence: 0.9, reasoning: 'Compliance/Critical' };
  }
  
  if (signals.isInStrategicGoals && signals.hasHighBusinessValue) {
    return { category: 'MUST', confidence: 0.85, reasoning: 'Strategic alignment + high value' };
  }
  
  if (signals.isEndOfLife || signals.isDuplicate) {
    return { category: 'WONT', confidence: 0.8, reasoning: 'EOL or duplicate' };
  }
  
  // ... altre regole
  
  return { category: 'UNKNOWN', confidence: 0.3, reasoning: 'Requires detailed scoring' };
}
```

### 3.3 Layer 2: Multi-Criteria Scoring

**Scopo**: Scoring preciso per items che richiedono analisi dettagliata

#### 3.3.1 Criteri Adottati (basati su ricerca empirica)

```typescript
interface ScoringCriteria {
  // === CRITERI AD ALTO IMPATTO ===
  teamPriority: {          // Più impattante secondo ricerca
    weight: 0.20;
    scale: 1-10;
    source: 'strategic_profile' | 'user_input';
  };
  
  criticality: {           // Forte effetto binario
    weight: 0.15;
    scale: 'critical' | 'important' | 'standard' | 'optional';
    source: 'inference' | 'user_input';
  };
  
  businessValue: {         // Impatto variabile per fase
    weight: 0.15;
    scale: 1-10;
    source: 'calculated' | 'user_override';
  };
  
  // === CRITERI A MEDIO IMPATTO ===
  strategicAlignment: {    // Quanto allineato agli obiettivi
    weight: 0.12;
    scale: 1-10;
    source: 'calculated_from_goals';
  };
  
  customerValue: {         // Significativo in stati 3-4
    weight: 0.10;
    scale: 1-10;
    source: 'inference' | 'user_input';
  };
  
  riskLevel: {             // Rischio di NON implementare
    weight: 0.08;
    scale: 1-10;
    source: 'calculated';
  };
  
  // === CRITERI CONTESTUALI ===
  implementationEffort: {  // Cost of Delay component
    weight: 0.08;
    scale: 'XS' | 'S' | 'M' | 'L' | 'XL';
    source: 'inference' | 'user_input';
  };
  
  dependencies: {          // Solo in certi momenti
    weight: 0.06;
    scale: 0-N (count);
    source: 'extracted';
  };
  
  technicalDebt: {         // Debito accumulato
    weight: 0.06;
    scale: 1-10;
    source: 'inference';
  };
}
```

#### 3.3.2 Formula di Scoring Composito

```typescript
interface PriorityScore {
  overallScore: number;      // 0-100
  wsjfScore: number;         // Weighted Shortest Job First
  retentionIndex: number;    // Portfolio Theory
  confidence: number;        // 0-1
  breakdown: CriteriaBreakdown;
  reasoning: string[];
}

function calculatePriorityScore(
  item: PortfolioItem,
  criteria: ScoringCriteria,
  context: PrioritizationContext
): PriorityScore {
  
  // 1. WSJF Score (per decisioni temporali)
  const costOfDelay = (
    criteria.businessValue.value * 0.4 +
    criteria.riskLevel.value * 0.3 +
    criteria.customerValue.value * 0.3
  );
  const jobSize = effortToNumeric(criteria.implementationEffort.value);
  const wsjfScore = costOfDelay / jobSize;
  
  // 2. Retention Index (Portfolio Theory)
  const retentionIndex = calculateRetentionIndex(item, criteria);
  
  // 3. Weighted Composite Score
  const weightedScore = Object.entries(criteria).reduce((sum, [key, criterion]) => {
    const normalizedValue = normalizeToScale(criterion.value, criterion.scale);
    return sum + (normalizedValue * criterion.weight);
  }, 0);
  
  // 4. Contextual Adjustment (basato su fase)
  const phaseMultiplier = getPhaseMultiplier(context.currentPhase, criteria);
  
  const overallScore = weightedScore * phaseMultiplier * 100;
  
  return {
    overallScore,
    wsjfScore,
    retentionIndex,
    confidence: calculateScoreConfidence(criteria),
    breakdown: generateBreakdown(criteria),
    reasoning: generateReasoning(item, criteria, overallScore)
  };
}

// Retention Index dalla Portfolio Theory
function calculateRetentionIndex(
  item: PortfolioItem,
  criteria: ScoringCriteria
): number {
  const weights = {
    futureMarketPotential: 0.15,
    productModificationGain: 0.10,
    financialImpact: 0.20,
    strategicFit: 0.25,
    resourceRequirements: 0.10,
    riskLevel: 0.10,
    competitivePosition: 0.10
  };
  
  const ratings = inferPortfolioTheoryRatings(item, criteria);
  
  return Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (weight * (ratings[key] || 0.5));
  }, 0);
}
```

### 3.4 Layer 3: Portfolio Optimization

**Scopo**: Ottimizzare l'intero portfolio, non solo i singoli items

```typescript
interface OptimizationConstraints {
  totalBudget: number;
  maxItems: number;
  minCoverage: {
    mustHave: number;       // min % di MUST items
    categories: string[];   // categorie da coprire
  };
  riskTolerance: 'conservative' | 'balanced' | 'aggressive';
}

interface OptimizedPortfolio {
  selectedItems: PrioritizedItem[];
  deferredItems: PrioritizedItem[];
  eliminationCandidates: PrioritizedItem[];
  
  metrics: {
    totalValue: number;
    totalCost: number;
    riskScore: number;
    strategicCoverage: number;
    diversificationIndex: number;
  };
  
  scenarios: OptimizationScenario[];
}

async function optimizePortfolio(
  items: PrioritizedItem[],
  constraints: OptimizationConstraints,
  strategicProfile: StrategicProfile
): Promise<OptimizedPortfolio> {
  
  // 1. Separare MUST items (sempre inclusi)
  const mustItems = items.filter(i => i.triage.category === 'MUST');
  const remainingBudget = constraints.totalBudget - sumCosts(mustItems);
  
  // 2. Ordinare restanti per score
  const candidates = items
    .filter(i => i.triage.category !== 'MUST' && i.triage.category !== 'WONT')
    .sort((a, b) => b.score.overallScore - a.score.overallScore);
  
  // 3. Knapsack ottimizzazione (valore/costo)
  const selected = knapsackOptimize(candidates, remainingBudget, constraints);
  
  // 4. Verifica diversificazione
  const diversified = ensureDiversification(selected, strategicProfile);
  
  // 5. Identifica candidati eliminazione
  const eliminationCandidates = items.filter(i => 
    i.triage.category === 'WONT' || 
    i.score.retentionIndex < 0.3
  );
  
  // 6. Genera scenari alternativi
  const scenarios = generateScenarios(items, constraints, [
    { name: 'conservative', riskMultiplier: 0.7 },
    { name: 'balanced', riskMultiplier: 1.0 },
    { name: 'aggressive', riskMultiplier: 1.3 }
  ]);
  
  return {
    selectedItems: [...mustItems, ...diversified],
    deferredItems: candidates.filter(c => !diversified.includes(c)),
    eliminationCandidates,
    metrics: calculatePortfolioMetrics(diversified, mustItems),
    scenarios
  };
}
```

### 3.5 Layer 4: Learning & Adaptation

**Scopo**: Apprendere dalle correzioni utente per migliorare nel tempo

```typescript
interface FeedbackEvent {
  itemId: string;
  originalScore: PriorityScore;
  originalCategory: string;
  userCorrection: {
    newCategory?: string;
    newScore?: number;
    reasoning?: string;
  };
  timestamp: Date;
  userId: string;
  tenantId: string;
}

interface LearnedPattern {
  pattern: {
    conditions: PatternCondition[];
    adjustment: ScoreAdjustment;
  };
  confidence: number;
  supportCount: number;
  lastUpdated: Date;
}

class PrioritizationLearner {
  
  async recordFeedback(event: FeedbackEvent): Promise<void> {
    // 1. Salvare feedback
    await this.db.feedbackEvents.insert(event);
    
    // 2. Analizzare pattern
    const patterns = await this.analyzePatterns(event.tenantId);
    
    // 3. Aggiornare pesi se pattern significativi
    if (patterns.some(p => p.supportCount >= 5 && p.confidence >= 0.8)) {
      await this.updateWeights(event.tenantId, patterns);
    }
  }
  
  private async analyzePatterns(tenantId: string): Promise<LearnedPattern[]> {
    const recentFeedback = await this.db.feedbackEvents
      .find({ tenantId, timestamp: { $gte: daysAgo(90) } })
      .toArray();
    
    // Clustering di correzioni simili
    const clusters = this.clusterCorrections(recentFeedback);
    
    return clusters.map(cluster => ({
      pattern: {
        conditions: this.extractConditions(cluster),
        adjustment: this.calculateAdjustment(cluster)
      },
      confidence: cluster.coherence,
      supportCount: cluster.items.length,
      lastUpdated: new Date()
    }));
  }
  
  async applyLearnedPatterns(
    item: PortfolioItem,
    baseScore: PriorityScore,
    tenantId: string
  ): Promise<PriorityScore> {
    
    const patterns = await this.getPatterns(tenantId);
    
    let adjustedScore = baseScore;
    const appliedPatterns: string[] = [];
    
    for (const pattern of patterns) {
      if (this.matchesConditions(item, pattern.pattern.conditions)) {
        adjustedScore = this.applyAdjustment(
          adjustedScore, 
          pattern.pattern.adjustment,
          pattern.confidence
        );
        appliedPatterns.push(pattern.id);
      }
    }
    
    return {
      ...adjustedScore,
      reasoning: [
        ...adjustedScore.reasoning,
        ...(appliedPatterns.length > 0 
          ? [`Adjusted based on ${appliedPatterns.length} learned patterns`]
          : [])
      ]
    };
  }
}
```

---

## 4. Integrazione con Altri Agenti

### 4.1 Framework Riutilizzabile

Il sistema di prioritizzazione è progettato per essere modulare e riutilizzabile:

```typescript
// Core Prioritization Framework
interface PrioritizationFramework {
  // Configurabile per contesto
  configure(config: PrioritizationConfig): void;
  
  // Metodi core riutilizzabili
  triage(items: any[], context: any): TriageResult[];
  score(items: any[], criteria: any): ScoredItem[];
  optimize(items: any[], constraints: any): OptimizedSet;
  learn(feedback: any): void;
}

// Implementazioni specializzate per ogni agente
class PortfolioPrioritizer implements PrioritizationFramework { /* ... */ }
class RoadmapPrioritizer implements PrioritizationFramework { /* ... */ }
class BudgetPrioritizer implements PrioritizationFramework { /* ... */ }
class StrategyPrioritizer implements PrioritizationFramework { /* ... */ }
```

### 4.2 Integrazione per Agente

| Agente | Uso del Framework | Criteri Specifici |
|--------|-------------------|-------------------|
| **Portfolio Assessment** | Scoring + Optimization | Business Value, Strategic Fit |
| **Roadmap Generator** | Triage + Dependency Analysis | Dependencies, Implementation Effort |
| **Budget Optimizer** | Optimization + Scenarios | ROI, Cost, Resource Requirements |
| **Strategy Advisor** | Full Pipeline | MoSCoW, WSJF, ICE |

### 4.3 Flusso Dati tra Agenti

```
┌─────────────────────┐
│  Document Extraction │
│  (Items estratti)    │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  PRIORITIZATION     │◄────── Strategic Profile
│  AGENT              │◄────── Company History
│  - Triage           │◄────── Learned Patterns
│  - Scoring          │
│  - Optimization     │
└──────────┬──────────┘
           │
     ┌─────┼─────┬─────────┐
     ▼     ▼     ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Portfolio│ │Roadmap │ │ Budget │ │Strategy│
│  Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
└─────────┘ └────────┘ └────────┘ └────────┘
```

---

## 5. Schema Database

```sql
-- Tabella principale prioritizzazioni
CREATE TABLE portfolio_prioritizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  
  -- Risultati triage
  triage_results JSONB NOT NULL,
  -- { itemId: { category, confidence, reasoning } }
  
  -- Scores dettagliati
  scoring_results JSONB NOT NULL,
  -- { itemId: { overallScore, wsjfScore, retentionIndex, breakdown } }
  
  -- Portfolio ottimizzato
  optimization_results JSONB NOT NULL,
  -- { selectedItems, deferredItems, eliminationCandidates, metrics, scenarios }
  
  -- Configurazione usata
  config JSONB NOT NULL,
  -- { weights, thresholds, constraints }
  
  -- Metadati
  items_count INTEGER NOT NULL,
  processing_time_ms INTEGER,
  model_version VARCHAR(50),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella feedback per learning
CREATE TABLE prioritization_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  prioritization_id UUID REFERENCES portfolio_prioritizations(id),
  
  item_id UUID NOT NULL,
  original_category VARCHAR(20),
  original_score DECIMAL(5,2),
  
  user_category VARCHAR(20),
  user_score DECIMAL(5,2),
  user_reasoning TEXT,
  
  correction_type VARCHAR(20), -- 'category', 'score', 'both'
  
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella pattern appresi
CREATE TABLE learned_prioritization_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  pattern_conditions JSONB NOT NULL,
  -- [{ field, operator, value }]
  
  score_adjustment JSONB NOT NULL,
  -- { type: 'multiply' | 'add', value, target: 'overall' | 'criteria' }
  
  confidence DECIMAL(3,2) NOT NULL,
  support_count INTEGER NOT NULL,
  
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ
);

-- Indici per performance
CREATE INDEX idx_prioritizations_tenant ON portfolio_prioritizations(tenant_id);
CREATE INDEX idx_prioritizations_company ON portfolio_prioritizations(company_id);
CREATE INDEX idx_feedback_tenant ON prioritization_feedback(tenant_id);
CREATE INDEX idx_patterns_tenant ON learned_prioritization_patterns(tenant_id, active);
```

---

## 6. API Endpoints

```typescript
// POST /api/v1/portfolio/:portfolioId/prioritize
interface PrioritizeRequest {
  config?: {
    weights?: Partial<CriteriaWeights>;
    constraints?: OptimizationConstraints;
    includeScenarios?: boolean;
  };
  filters?: {
    categories?: string[];
    minConfidence?: number;
  };
}

interface PrioritizeResponse {
  success: boolean;
  data: {
    summary: {
      totalItems: number;
      triageBreakdown: Record<string, number>;
      processingTimeMs: number;
    };
    triage: TriageResult[];
    scores: PriorityScore[];
    optimization: OptimizedPortfolio;
  };
}

// POST /api/v1/portfolio/:portfolioId/prioritize/feedback
interface FeedbackRequest {
  itemId: string;
  correction: {
    category?: string;
    score?: number;
    reasoning?: string;
  };
}

// GET /api/v1/portfolio/:portfolioId/prioritize/patterns
interface PatternsResponse {
  patterns: LearnedPattern[];
  stats: {
    totalFeedback: number;
    patternsActive: number;
    accuracyImprovement: number;
  };
}
```

---

## 7. Prompt Engineering

### 7.1 Prompt per Triage (GPT-4o-mini)

```markdown
You are an IT Portfolio Triage Expert. Your task is to quickly classify portfolio items into MoSCoW categories.

## Context
Company: {{company_name}}
Industry: {{industry}}
Strategic Goals: {{strategic_goals}}
Budget Constraints: {{budget_level}}

## Classification Rules

### MUST (Critical - non-negotiable)
- Compliance/regulatory requirements
- Critical infrastructure dependencies
- Security-critical systems
- Items explicitly marked as strategic priorities

### SHOULD (Important - high value)
- Strong strategic alignment (>7/10)
- High business value (>7/10)
- Customer-facing systems with high usage
- Innovation enablers aligned with goals

### COULD (Nice to have - if resources allow)
- Medium strategic alignment (4-6/10)
- Operational improvements
- Technical debt reduction
- Quality-of-life enhancements

### WONT (Not now - defer or eliminate)
- End-of-life products
- Duplicates of existing capabilities
- Low usage (<5% of target users)
- Misaligned with current strategy
- Outdated (no updates in 2+ years)

## Items to Classify
{{items_json}}

## Output Format
Return a JSON array with:
{
  "itemId": "...",
  "category": "MUST|SHOULD|COULD|WONT|UNKNOWN",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "keySignals": ["signal1", "signal2"]
}
```

### 7.2 Prompt per Scoring Dettagliato

```markdown
You are an IT Portfolio Scoring Expert using a multi-criteria decision framework.

## Scoring Criteria (weights provided)
1. Team Priority ({{weight_team_priority}}): How important is this to the team?
2. Criticality ({{weight_criticality}}): Is this critical for operations?
3. Business Value ({{weight_business_value}}): What value does it deliver?
4. Strategic Alignment ({{weight_strategic}}): How well does it fit strategy?
5. Customer Value ({{weight_customer}}): Impact on customer experience?
6. Risk Level ({{weight_risk}}): Risk of NOT implementing?
7. Implementation Effort ({{weight_effort}}): Size of work required?
8. Dependencies ({{weight_deps}}): How many dependencies?
9. Technical Debt ({{weight_debt}}): Current technical debt level?

## Context
{{strategic_profile}}
{{company_history}}

## Items to Score
{{items_with_triage}}

## Output Format
For each item:
{
  "itemId": "...",
  "scores": {
    "teamPriority": { "value": 1-10, "reasoning": "..." },
    "criticality": { "value": "critical|important|standard|optional", "reasoning": "..." },
    "businessValue": { "value": 1-10, "reasoning": "..." },
    // ... other criteria
  },
  "overallScore": 0-100,
  "wsjfScore": number,
  "retentionIndex": 0-1,
  "recommendation": "invest|maintain|optimize|eliminate",
  "confidence": 0-1
}
```

---

## 8. Testing & Validation

### 8.1 Test Cases

```typescript
describe('PortfolioPrioritizationAgent', () => {
  
  describe('Triage Layer', () => {
    it('should classify compliance items as MUST', async () => {
      const item = createItem({ tags: ['compliance', 'gdpr'] });
      const result = await agent.triage([item], context);
      expect(result[0].category).toBe('MUST');
      expect(result[0].confidence).toBeGreaterThan(0.8);
    });
    
    it('should classify EOL items as WONT', async () => {
      const item = createItem({ lifecycle: 'end_of_life' });
      const result = await agent.triage([item], context);
      expect(result[0].category).toBe('WONT');
    });
    
    it('should handle 500+ items under 30 seconds', async () => {
      const items = generateItems(500);
      const start = Date.now();
      await agent.triage(items, context);
      expect(Date.now() - start).toBeLessThan(30000);
    });
  });
  
  describe('Scoring Layer', () => {
    it('should weight team priority highest', async () => {
      const itemHighTeamPriority = createItem({ teamPriority: 10 });
      const itemHighBusinessValue = createItem({ businessValue: 10 });
      
      const [score1] = await agent.score([itemHighTeamPriority], criteria);
      const [score2] = await agent.score([itemHighBusinessValue], criteria);
      
      expect(score1.overallScore).toBeGreaterThan(score2.overallScore);
    });
    
    it('should calculate WSJF correctly', async () => {
      const item = createItem({
        businessValue: 8,
        riskLevel: 6,
        customerValue: 7,
        implementationEffort: 'M'
      });
      
      const [score] = await agent.score([item], criteria);
      
      // CoD = 8*0.4 + 6*0.3 + 7*0.3 = 7.1
      // JobSize = 5 (M = 5)
      // WSJF = 7.1 / 5 = 1.42
      expect(score.wsjfScore).toBeCloseTo(1.42, 1);
    });
  });
  
  describe('Learning Layer', () => {
    it('should detect patterns after 5+ consistent corrections', async () => {
      // Simulate 5 corrections: EOL items always bumped to COULD
      for (let i = 0; i < 5; i++) {
        await agent.recordFeedback({
          itemId: `item-${i}`,
          originalCategory: 'WONT',
          userCorrection: { newCategory: 'COULD' },
          itemFeatures: { lifecycle: 'end_of_life', hasActiveIntegrations: true }
        });
      }
      
      const patterns = await agent.getLearnedPatterns(tenantId);
      expect(patterns).toContainEqual(
        expect.objectContaining({
          conditions: expect.arrayContaining([
            { field: 'lifecycle', operator: 'eq', value: 'end_of_life' },
            { field: 'hasActiveIntegrations', operator: 'eq', value: true }
          ]),
          adjustment: { categoryOverride: 'COULD' }
        })
      );
    });
  });
});
```

---

## 9. Metriche di Successo

| Metrica | Target | Misurazione |
|---------|--------|-------------|
| Accuracy Triage | >85% | % items classificati correttamente vs validazione utente |
| Accuracy Scoring | >80% | Correlazione score vs decisioni finali |
| Tempo Processing | <30s per 500 items | Latency P95 |
| Learning Improvement | +5% accuracy/mese | Trend accuracy con feedback |
| User Override Rate | <20% | % items che richiedono correzione manuale |

---

## 10. Roadmap Implementazione

### Fase 1: Core Triage (Settimana 1-2)
- [ ] Implementare TriageLayer con regole MoSCoW
- [ ] Integrare con strategic profile
- [ ] API endpoint `/prioritize` base
- [ ] UI per visualizzare triage results

### Fase 2: Multi-Criteria Scoring (Settimana 3-4)
- [ ] Implementare ScoringLayer con tutti i criteri
- [ ] Calcolo WSJF e Retention Index
- [ ] Configurazione pesi dinamica
- [ ] UI per score breakdown

### Fase 3: Portfolio Optimization (Settimana 5-6)
- [ ] Implementare OptimizationLayer
- [ ] Knapsack algorithm per selezione
- [ ] Generazione scenari
- [ ] UI per confronto scenari

### Fase 4: Learning & Adaptation (Settimana 7-8)
- [ ] Feedback collection infrastructure
- [ ] Pattern detection algorithm
- [ ] Weight adjustment system
- [ ] Dashboard metriche apprendimento

---

## 11. Riferimenti Accademici

1. **"Choosing a Suitable Requirement Prioritization Method: A Survey"** - Alhenawi et al.
   - 15+ tecniche analizzate
   - Classificazione relativa vs esatta

2. **"Not All Requirements Prioritization Criteria are Equal at All Times"** - Berntsson Svensson & Torkar
   - 32.139 decisioni analizzate
   - Analisi Bayesiana impatto criteri

3. **"A Portfolio Theory Approach to Solve the Product Elimination Problem"** - Friedman & Krausz
   - Framework 7 scale di valutazione
   - Retention Index formula

4. **"Zooming In or Zooming Out: Entrants' Product Portfolios in Nascent Industry"** - Studio portfolios
   - Decision-making under uncertainty
   - Pre-entry experience impact

5. **"All Experience is Not Created Equal: Learning Adapting and Focusing in Product Portfolio Management"**
   - Portfolio management as dynamic capability
   - Experience breadth vs depth

---

*Documento generato per THEMIS - Multi-Agent IT Portfolio Management System*
*Versione: 1.0 | Data: Dicembre 2024*
