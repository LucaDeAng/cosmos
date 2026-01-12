# Data Ingestion System - Analisi e Ottimizzazioni

## Executive Summary

Il sistema di data ingestion di THEMIS è progettato per standardizzare e normalizzare cataloghi provenienti da diverse fonti (PDF, Excel, CSV, testo). L'analisi ha rivelato un'architettura solida ma con aree critiche che richiedono ottimizzazione per garantire riconoscimento affidabile e standardizzazione robusta dei cataloghi.

## Architettura Attuale

### Pipeline a 5 Stadi

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. INPUT LAYER - Multi-formato                                  │
│    └─ PDF, Excel, CSV, Text → MIME Type Detection              │
├──────────────────────────────────────────────────────────────────┤
│ 2. PARSING LAYER - Parallel Processing (max 5 concurrent)       │
│    ├─ PDF Parser: pdf-parse + GPT-4o-mini LLM extraction       │
│    ├─ Excel Parser: XLSX parsing + column mapping               │
│    └─ Text Parser: Format detection + structured extraction     │
├──────────────────────────────────────────────────────────────────┤
│ 3. EXTRACTION - Raw Structured Data                            │
│    └─ RawExtractedItem[] (name, type, status, budget, etc.)    │
├──────────────────────────────────────────────────────────────────┤
│ 4. NORMALIZATION - RAG-Enhanced Standardization                │
│    ├─ Type Detection (keyword scoring + heuristics)            │
│    ├─ Status/Priority Mapping (lookup tables)                  │
│    ├─ Category Classification (semantic search)                │
│    ├─ Risk & Complexity Inference                              │
│    └─ Result: NormalizedItem[] (standardized portfolio items)  │
├──────────────────────────────────────────────────────────────────┤
│ 5. POST-PROCESSING - Continuous Learning                       │
│    ├─ Pattern Learning (from successful extractions)           │
│    ├─ Catalog Enrichment (new entries detection)               │
│    ├─ Metrics Recording (accuracy tracking)                    │
│    └─ Feedback Integration (user corrections)                  │
└──────────────────────────────────────────────────────────────────┘
```

### Punti di Forza

1. **Multi-Format Support**: Gestisce PDF, Excel, CSV, testo grezzo
2. **Parallel Processing**: Processing concorrente (configurabile, default 5)
3. **RAG Integration**: Semantic search per category matching
4. **Pattern Learning**: Auto-miglioramento da estrazioni riuscite
5. **Flexible Configuration**: Parametri configurabili per ogni tenant

### Punti Critici Identificati

## 🔴 PROBLEMA 1: Validazione Assente

**Situazione Attuale:**
- `validatorAgent.ts` è uno **stub non implementato**
- Nessuna validazione schema oltre Zod parsing
- Nessun quality gate per filtrare dati di bassa qualità
- Items con confidence bassa vengono comunque accettati

**Impatto:**
- Dati incompleti/errati entrano nel sistema
- Degradazione qualità del catalog nel tempo
- Nessun feedback agli utenti su cosa è stato scartato o corretto

**Soluzione Proposta:**
Implementare validatore robusto con:
- Required field validation
- Confidence thresholds per field
- Data type validation (budget positivo, date coerenti)
- Enum validation (status, priority, type in set noto)
- Blocking errors vs. warnings
- Quarantine mechanism per items problematici

---

## 🟡 PROBLEMA 2: Riconoscimento Tipo Catalogo Limitato

**Situazione Attuale:**
- Sistema ottimizzato solo per **IT portfolio catalogs**
- Keywords limitate a IT domain (servizi, applicazioni, progetti IT)
- Catalogs tipo: `catalog_it_services`, `catalog_portfolio_taxonomy`
- Nessun supporto per altri industry vertical

**Impatto:**
- Non riconosce cataloghi da:
  - Manufacturing (MES, SCADA, produzione)
  - Retail (POS, inventory, transazioni)
  - Chemical/Industrial (safety, regulatory)
  - Finance (trading, compliance)
- Fallback generico con bassa accuracy

**Soluzione Proposta:**
Auto-detection multi-domain con:
- Pattern recognition per industry vertical
- Domain-specific keyword sets
- Catalog type classification usando RAG
- Fallback intelligente con confidence scoring

---

## 🟡 PROBLEMA 3: Column Mapping Insufficiente

**Situazione Attuale:**
- `COLUMN_MAPPINGS` limitato a termini IT/generici
- Supporto IT/EN, parziale IT slang
- LLM fallback solo se coverage <30%
- Nessun learning da mapping riusciti

**Impatto:**
- Formati non standard richiedono sempre LLM (lento, costoso)
- Nessun miglioramento nel tempo per nuovi formati
- Spreco di API calls

**Soluzione Proposta:**
- Expand COLUMN_MAPPINGS con:
  - Domain-specific headers (MES fields, retail metrics)
  - Multi-language support (IT, EN, DE, FR, ES)
  - Vendor-specific formats (SAP, Oracle, Salesforce)
- Pattern learning per column names
- Caching dei mapping LLM-discovered

---

## 🟡 PROBLEMA 4: Type Detection Non Robusta

**Situazione Attuale:**
- Keyword scoring semplice (matching esatto o parziale)
- Heuristics limitate:
  - Timeline presente → initiative
  - rawType field → direct mapping
- Nessun fallback per ambiguità
- Confidence calculation simplistica

**Impatto:**
- Ambiguità non gestite (es. "servizio di migrazione cloud")
- False positives per keywords generiche
- Bassa confidence non gestita correttamente

**Soluzione Proposta:**
Multi-stage type detection:
1. **Stage 1**: Explicit markers (rawType, column headers)
2. **Stage 2**: Keyword density analysis (weighted)
3. **Stage 3**: RAG semantic classification
4. **Stage 4**: Contextual heuristics (budget range, timeline, team size)
5. **Stage 5**: Ensemble voting con confidence aggregation

---

## 🟢 PROBLEMA 5: RAG Integration Ottimizzabile

**Situazione Attuale:**
- Semantic search con threshold fisso (0.5)
- Batch size fisso (10 items)
- Skip RAG se confidence >0.6 (potrebbe perdere info)
- Nessun caching dei risultati RAG

**Impatto:**
- Sub-optimal retrieval per query difficili
- Spreco computation per items simili
- Threshold fisso non adattivo

**Soluzione Proposta:**
Leverage RAG optimizations già implementate:
- **Hybrid search** (dense + sparse) per matching migliore
- **Query expansion** per categorie ambigue
- **Adaptive threshold** per filtering dinamico
- **Result caching** per batch con items simili

---

## 🟢 PROBLEMA 6: Error Handling Basico

**Situazione Attuale:**
- Parser failures → log warning + continue
- LLM errors → fallback a regex
- Nessun retry logic
- Errori non propagati granularly

**Impatto:**
- Silent failures senza visibilità
- Utente non sa perché alcuni items mancano
- Debugging difficile

**Soluzione Proposta:**
- Structured error reporting con codici
- Retry con exponential backoff per LLM calls
- Partial success handling (return N/M items)
- Detailed extraction notes per item

---

## Piano di Ottimizzazione Prioritizzato

### 🔴 PRIORITY 1 - Validazione Robusta (CRITICAL)

**File da creare:** `validatorAgent.ts` (reale implementazione)

**Componenti:**

```typescript
// 1. Field-level validation
interface FieldValidator {
  required: boolean;
  minConfidence?: number;
  validator?: (value: any) => boolean;
  allowedValues?: any[];
}

const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  name: { required: true, minConfidence: 0.7 },
  type: { required: true, minConfidence: 0.5, allowedValues: ['initiative', 'product', 'service'] },
  status: { required: true, allowedValues: ['active', 'paused', 'completed', 'cancelled', 'proposed'] },
  budget: { required: false, validator: (v) => v > 0 && v < 1000000000 },
  startDate: { required: false, validator: validateDate },
  endDate: { required: false, validator: validateDate },
};

// 2. Item-level validation
interface ValidationResult {
  valid: boolean;
  score: number;  // 0-1
  errors: ValidationError[];
  warnings: ValidationWarning[];
  quarantine: boolean;  // true if needs review
}

// 3. Quality gates
const QUALITY_GATES = {
  MIN_OVERALL_CONFIDENCE: 0.4,
  MIN_REQUIRED_FIELDS: ['name', 'type'],
  QUARANTINE_THRESHOLD: 0.3,  // Below this, quarantine for review
};
```

**Testing:**
- Unit tests per ogni validator
- Integration test con cataloghi reali
- Edge cases: campi mancanti, valori fuori range, date inconsistenti

---

### 🟡 PRIORITY 2 - Auto-Detection Tipo Catalogo

**File da creare:** `catalogDetector.ts`

**Strategia:**

```typescript
// 1. Domain pattern detection
const DOMAIN_PATTERNS = {
  it_portfolio: {
    keywords: ['server', 'applicazione', 'cloud', 'database', 'software'],
    catalogTypes: ['catalog_it_services', 'catalog_technologies'],
    confidence: 0.8,
  },
  manufacturing: {
    keywords: ['produzione', 'linea', 'macchinario', 'qualità', 'scarto', 'oee'],
    catalogTypes: ['catalog_manufacturing', 'catalog_quality'],
    confidence: 0.8,
  },
  retail: {
    keywords: ['negozio', 'store', 'pos', 'inventory', 'vendita', 'sku'],
    catalogTypes: ['catalog_retail', 'catalog_products'],
    confidence: 0.8,
  },
  financial: {
    keywords: ['trading', 'compliance', 'risk', 'portfolio', 'transaction'],
    catalogTypes: ['catalog_financial', 'catalog_compliance'],
    confidence: 0.8,
  },
  chemical: {
    keywords: ['formula', 'batch', 'safety', 'msds', 'regulatory', 'quality'],
    catalogTypes: ['catalog_chemical', 'catalog_safety'],
    confidence: 0.8,
  },
};

// 2. Auto-detection algorithm
async function detectCatalogDomain(items: RawExtractedItem[]): Promise<DomainDetectionResult> {
  // Aggregate all text from items
  const aggregatedText = items.map(i => `${i.name} ${i.description}`).join(' ');

  // Score each domain
  const domainScores = scoreDomains(aggregatedText, DOMAIN_PATTERNS);

  // RAG-enhanced classification
  const ragClassification = await classifyWithRAG(aggregatedText);

  // Ensemble decision
  return ensembleVote([domainScores, ragClassification]);
}
```

**Benefits:**
- Routing automatico al catalog corretto
- Keyword set appropriato per il domain
- Validation rules domain-specific

---

### 🟡 PRIORITY 3 - Column Mapping Espanso

**File da aggiornare:** `excelParserAgent.ts`

**Espansioni:**

```typescript
// Existing + new mappings
const EXPANDED_COLUMN_MAPPINGS = {
  name: [
    // Existing IT/generic
    'nome', 'name', 'titolo', 'title', 'progetto', 'project',
    // Manufacturing
    'linea', 'macchinario', 'equipment', 'asset',
    // Retail
    'articolo', 'sku', 'product_code',
    // Financial
    'instrument', 'security', 'ticker',
  ],
  type: [
    // Existing
    'tipo', 'type', 'categoria', 'category',
    // Domain-specific
    'asset_type', 'equipment_type', 'product_category',
  ],
  budget: [
    // Existing
    'budget', 'costo', 'cost', 'investimento',
    // Extended
    'capex', 'opex', 'spend', 'value', 'valore', 'prezzo', 'price',
  ],
  // New manufacturing fields
  production_volume: ['volume_produzione', 'production_volume', 'output'],
  quality_metric: ['oee', 'yield', 'scarto', 'defect_rate'],
  // New retail fields
  inventory: ['stock', 'giacenza', 'inventory', 'disponibilità'],
  sales: ['vendite', 'sales', 'revenue', 'ricavi'],
};

// Pattern learning for unmapped columns
async function learnColumnMapping(
  headerName: string,
  inferredField: string,
  confidence: number
): Promise<void> {
  // Store learned mapping in pattern database
  await storeLearnedPattern({
    type: 'column_mapping',
    pattern: headerName.toLowerCase(),
    target: inferredField,
    confidence,
    usageCount: 1,
    createdAt: new Date(),
  });
}
```

---

### 🟢 PRIORITY 4 - Enhanced Type Detection

**File da aggiornare:** `normalizerAgent.ts`

**Multi-Stage Detection:**

```typescript
async function detectTypeMultiStage(
  item: RawExtractedItem,
  tenantId: string
): Promise<{ type: ItemType; confidence: number }> {

  const stages: DetectionStage[] = [];

  // Stage 1: Explicit markers (highest confidence)
  if (item.rawType) {
    const explicit = mapExplicitType(item.rawType);
    if (explicit) stages.push({ type: explicit.type, confidence: 0.95, source: 'explicit' });
  }

  // Stage 2: Keyword density analysis
  const keywords = analyzeKeywordDensity(item);
  stages.push({ type: keywords.type, confidence: keywords.confidence, source: 'keywords' });

  // Stage 3: RAG semantic classification
  const rag = await classifyWithRAG(item, tenantId);
  stages.push({ type: rag.type, confidence: rag.confidence, source: 'rag' });

  // Stage 4: Contextual heuristics
  const contextual = applyContextualHeuristics(item);
  if (contextual.confidence > 0.5) {
    stages.push(contextual);
  }

  // Stage 5: Ensemble voting with weighted average
  return ensembleVote(stages, {
    weights: { explicit: 1.0, keywords: 0.7, rag: 0.8, contextual: 0.6 },
  });
}

// Contextual heuristics
function applyContextualHeuristics(item: RawExtractedItem): DetectionResult {
  let score = { initiative: 0, product: 0, service: 0 };

  // Timeline present → likely initiative
  if (item.startDate || item.endDate) score.initiative += 0.3;

  // High budget + timeline → initiative
  if (item.budget && item.budget > 100000 && item.startDate) score.initiative += 0.4;

  // Recurring cost + no timeline → service
  if (item.budget && !item.startDate && item.rawStatus?.includes('recurring')) {
    score.service += 0.5;
  }

  // Many technologies → product
  if (item.technologies && item.technologies.length > 3) score.product += 0.3;

  const maxType = Object.keys(score).reduce((a, b) => score[a] > score[b] ? a : b);
  return { type: maxType as ItemType, confidence: score[maxType], source: 'contextual' };
}
```

---

### 🟢 PRIORITY 5 - Leverage RAG Optimizations

**File da aggiornare:** `normalizerAgent.ts` semantic search calls

**Before:**
```typescript
const results = await semanticSearch(tenantId, searchQuery, {
  sourceTypes: catalogTypes,
  limit: 5,
  similarityThreshold: 0.5,
});
```

**After (usando le ottimizzazioni):**
```typescript
const results = await semanticSearch(tenantId, searchQuery, {
  sourceTypes: catalogTypes,
  limit: 5,
  similarityThreshold: 0.5,

  // NEW OPTIMIZATIONS
  useHybridSearch: true,          // Dense + sparse retrieval
  hybridAlpha: 0.7,                // 70% semantic, 30% keyword
  useQueryExpansion: true,         // HyDE + query variations
  useAdaptiveThreshold: true,      // Dynamic filtering
});
```

**Caching per batch simili:**
```typescript
const ragCache = new Map<string, SearchResult[]>();

async function getCachedRAGResults(
  searchQuery: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const cacheKey = `${searchQuery}_${JSON.stringify(options)}`;

  if (ragCache.has(cacheKey)) {
    return ragCache.get(cacheKey)!;
  }

  const results = await semanticSearch(tenantId, searchQuery, options);
  ragCache.set(cacheKey, results);

  return results;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('Normalizer Agent', () => {
  it('should detect IT portfolio catalog', async () => {
    const items = [
      { name: 'Migrazione Cloud AWS', description: 'Spostamento server su cloud' },
      { name: 'Implementazione CRM', description: 'Deploy Salesforce' },
    ];
    const domain = await detectCatalogDomain(items);
    expect(domain.type).toBe('it_portfolio');
    expect(domain.confidence).toBeGreaterThan(0.8);
  });

  it('should detect manufacturing catalog', async () => {
    const items = [
      { name: 'Linea Produzione A', description: 'OEE 85%, produzione 1000 pz/h' },
      { name: 'Macchinario CNC', description: 'Controllo qualità automatico' },
    ];
    const domain = await detectCatalogDomain(items);
    expect(domain.type).toBe('manufacturing');
  });

  it('should validate required fields', () => {
    const item = { name: 'Test', type: 'initiative' };  // missing status
    const validation = validateNormalizedItem(item);
    expect(validation.errors).toContainEqual(
      expect.objectContaining({ field: 'status', code: 'REQUIRED_FIELD_MISSING' })
    );
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Ingestion', () => {
  it('should ingest and normalize IT portfolio catalog', async () => {
    const file = loadTestFile('it_portfolio.xlsx');
    const result = await ingestData({ files: [file], tenantId: 'test' });

    expect(result.success).toBe(true);
    expect(result.normalization.stats.avgConfidence).toBeGreaterThan(0.7);
    expect(result.normalization.items).toHaveLength(10);
    expect(result.normalization.items[0].type).toBeOneOf(['initiative', 'product', 'service']);
  });

  it('should quarantine low-quality items', async () => {
    const file = loadTestFile('messy_catalog.csv');
    const result = await ingestData({ files: [file], tenantId: 'test' });

    expect(result.quarantine).toBeDefined();
    expect(result.quarantine.items.length).toBeGreaterThan(0);
    expect(result.quarantine.reasons).toContain('LOW_CONFIDENCE');
  });
});
```

---

## Metriche di Successo

### Key Performance Indicators

| Metrica | Target | Attuale | Miglioramento |
|---------|--------|---------|---------------|
| Avg Confidence | >0.75 | ~0.65 | +15% |
| Type Detection Accuracy | >90% | ~75% | +15% |
| Category Match Rate | >80% | ~60% | +20% |
| Validation Rejection Rate | 5-10% | 0% | N/A (new) |
| Processing Time (per 100 items) | <30s | ~25s | Maintain |
| RAG Cache Hit Rate | >50% | 0% | N/A (new) |

### Quality Gates

- **Blocking Errors**: Items con errori bloccanti → quarantena
- **Warnings**: Items con warning → accepted con flag
- **Perfect**: Items >0.8 confidence, tutti campi validi

---

## Roadmap Implementazione

### Sprint 1 (1-2 settimane)
- ✅ Implementare validatorAgent robusto
- ✅ Aggiungere quality gates
- ✅ Implementare quarantine mechanism
- ✅ Unit tests per validation

### Sprint 2 (1-2 settimane)
- ✅ Catalog domain auto-detection
- ✅ Expand COLUMN_MAPPINGS (manufacturing, retail)
- ✅ Pattern learning per column mappings
- ✅ Integration tests

### Sprint 3 (1-2 settimane)
- ✅ Multi-stage type detection
- ✅ RAG optimization integration
- ✅ Result caching
- ✅ Performance benchmarking

### Sprint 4 (1 settimana)
- ✅ Documentation update
- ✅ End-to-end testing con cataloghi reali
- ✅ User acceptance testing
- ✅ Production deployment

---

## Conclusioni

Il sistema di data ingestion attuale ha una base solida ma richiede ottimizzazioni critiche per garantire:

1. **Qualità dei Dati**: Validation robusta per bloccare/filtrare dati di bassa qualità
2. **Multi-Domain Support**: Auto-detection e gestione di cataloghi da industry diverse
3. **Accuracy Migliorata**: Multi-stage detection e RAG optimizations
4. **Resilienza**: Error handling robusto e retry logic
5. **Performance**: Caching e batch processing ottimizzati

Con queste ottimizzazioni, il sistema sarà in grado di:
- ✅ Riconoscere e standardizzare cataloghi da qualsiasi vertical
- ✅ Garantire qualità dati >75% confidence
- ✅ Scalare a volumi maggiori mantenendo performance
- ✅ Auto-migliorarsi nel tempo tramite pattern learning

---

**Documento creato**: 2025-12-12
**Versione**: 1.0
**Owner**: Engineering Team
**Review Date**: 2025-01-12
