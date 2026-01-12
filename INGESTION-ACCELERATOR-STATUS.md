# Ingestion Accelerator Agent - Status Report

## ✅ Agent Creato e Registrato

**Location:** `backend/src/agents/subagents/ingestion/ingestionAcceleratorAgent.ts`

**Status:** ✅ Implementato e registrato nel sistema

### Componenti Implementati

| Componente | Descrizione | Status |
|-----------|------------|--------|
| **ParallelChunkProcessor** | Elaborazione parallela fino a 5 chunk contemporaneamente | ✅ |
| **MultiTierCache** | Cache L1 (memory, 5min) + L2 (Supabase, 24h) | ✅ |
| **BatchNormalizer** | Normalizzazione in batch (10 items per LLM call) | ✅ |
| **MinHashLSH** | Deduplicazione O(n log n) con LSH | ✅ |
| **Adaptive Model Selection** | gpt-4o-mini default, gpt-4o per contenuti complessi | ✅ |

### Registrazione Sistema

✅ Registrato come: `INGESTION_ACCELERATOR`
- **Location:** `backend/src/agents/subagents/index.ts:41`
- **Type:** `SubAgent`
- **Export:** `accelerateIngestion` function disponibile

### API Disponibile

```typescript
// Public API
export async function accelerateIngestion(input: AcceleratorInput): Promise<AcceleratorOutput>

// Usage
import { accelerateIngestion } from './agents/subagents/ingestion';

const result = await accelerateIngestion({
  tenantId: 'tenant-123',
  content: pdfTextContent,
  contentType: 'pdf',
  fileName: 'catalog.pdf',
  options: {
    enableParallelProcessing: true,
    enableCaching: true,
    enableBatching: true,
    enableSmartDedup: true,
    maxConcurrency: 5,
  }
});
```

---

## ❌ Integrazione nel Flusso - NON IMPLEMENTATA

### Situazione Attuale

L'agent **NON è ancora integrato nel flusso di ingestion principale**:

1. **`POST /api/portfolio/ingest`** (portfolio.routes.ts:1629)
   - Chiama: `ingestData()` dal dataIngestionOrchestrator
   - NON chiama: `accelerateIngestion`

2. **`POST /api/portfolio/ingest/text`** (portfolio.routes.ts:1693)
   - Chiama: `ingestText()` dal dataIngestionOrchestrator
   - NON chiama: `accelerateIngestion`

3. **dataIngestionOrchestrator.ts** (Lines 263-500)
   - Pipeline principale: parsePDF → textParser → excelParser → normalizer
   - NON include: Parallel chunk processing, multi-tier cache, batch normalization, deduplication

### Flusso di Ingestion Attuale

```
Utente Upload File/Text
    ↓
POST /api/portfolio/ingest
    ↓
ingestData() [dataIngestionOrchestrator.ts]
    ├─→ processFile() [Sequential for each file]
    │   ├─→ parsePDF / parseExcel / parseText
    │   └─→ return RawExtractedItem[]
    ├─→ processText() [For text input]
    │   └─→ parseText()
    └─→ normalizeItems() [Single pass normalization]
        └─→ return NormalizedItem[]
    ↓
Response with items
```

### Opportunità di Integrazione

**Opzione 1: Sostituzione della normalizzazione**
```
Posizionare accelerateIngestion DOPO l'estrazione grezza (raw items)
Raw Items → accelerateIngestion() → Optimized Normalized Items
```

**Opzione 2: Sostituzione dell'intero flusso di estrazione**
```
PDF/Excel/Text → accelerateIngestion() → Normalized Items
(Più efficiente ma richiede refactoring di parsers)
```

**Opzione 3: Ottimizzazione parallela dei file**
```
Multiple Files → accelerateIngestion (parallel) → Combined results
```

---

## 📊 Performance Attese vs Reali

### Speedup Teorici (Documento Esterno)
- **PDF 50 pagine:** 40s → 8-12s (3-5x)
- **Dataset 1000+ items:** Dedup 30s → 3s (10x)
- **Caching:** 40-60% hit rate

### Status Ottimizzazione
- ⏳ **ParallelProcessing:** Non utilizzato (files ancora sequenziali)
- ⏳ **Caching:** Non utilizzato
- ⏳ **Batching:** Non utilizzato (normalization ancora una pass singola)
- ⏳ **Deduplication:** Non utilizzato

---

## 🔧 Cosa Fare Ora

### Se vuoi ATTIVARE l'accelerator:

1. **Integrazione nel dataIngestionOrchestrator.ts**
   - Importare: `import { accelerateIngestion } from './ingestion/ingestionAcceleratorAgent'`
   - Modificare `ingestData()` per usare l'accelerator dopo estrazione

2. **Aggiornare le routes**
   - Aggiungere opzione `useAccelerator: true/false` ai req.body
   - Default: `true` per file grandi

3. **Testing**
   - Verificare che l'accelerator estragga lo stesso numero di items
   - Misurare performance improvements
   - Validare che cache funzioni correttamente

### Alternative Minori:

- Aggiungere un **endpoint dedicato** per l'accelerator (es: `/api/portfolio/ingest/fast`)
- Usare solo per file > 5MB (costo/beneficio)
- Abilitare come feature flag sperimentale

---

## 📝 Codice da Consultare

**File Principali:**
- Agent: `backend/src/agents/subagents/ingestion/ingestionAcceleratorAgent.ts` (L1-1120)
- Orchestrator: `backend/src/agents/subagents/dataIngestionOrchestrator.ts` (L260-400)
- Routes: `backend/src/routes/portfolio.routes.ts` (L1629-1740)
- Registration: `backend/src/agents/subagents/index.ts` (L41)

**Exports:**
- `accelerateIngestion()` function ready at: `backend/src/agents/subagents/ingestion/index.ts:38`

---

## ⚠️ Nota Importante

L'agent è **completamente implementato e testabile**, ma **non è parte del flusso di default**. 
È pronto per essere integrato quando decidi che vuoi attivare le ottimizzazioni di performance.

Attualmente, il sistema usa il pipeline di ingestion originale (più semplice ma sequenziale).
