# 🎯 HITL & CSV: Proposte di Miglioramento UX

## 📋 Problemi Identificati

### 1. **CSV Parser - Troppo "Semplice"**
**Problema**: Il CSV parser attuale è puramente rule-based (auto-detection colonne):
- ✅ **Pro**: Velocissimo (10-19ms), 100% accuracy per dati strutturati
- ❌ **Contro**: Non arricchisce i dati, non normalizza, non categorizza

**User Request**: "come mai non usiamo l'ai nel csv?"

### 2. **HITL - Esperienza Utente Frustrante**
**Problema**: L'utente aspetta 1-3 minuti senza vedere nulla durante l'estrazione
- ❌ Schermata di loading statica
- ❌ Nessuna anteprima progressiva
- ❌ Indicatori di progresso generici
- ❌ Impossibile navigare via durante il processo

**User Feedback**: "l'utente aspetta sempre vari minuti prima di vedere qualcosa"

---

## 🚀 Soluzioni Proposte

### SOLUZIONE 1: CSV Ibrido (Rule-Based + AI Opzionale)

#### Approccio in 2 Fasi

**Fase 1 - Extraction (Immediata, 10-20ms)**
```typescript
// Rule-based extraction - SEMPRE
const extraction = parseCSV(buffer) → {
  items: 100,
  processingTime: 15ms,
  confidence: 95%
}

// Utente vede subito i 100 items (raw data)
```

**Fase 2 - Enrichment (Opzionale, Background, 5-10s)**
```typescript
// AI enrichment - OPZIONALE, in background
const enrichment = await enrichCSVItems(extraction.items) → {
  categorization: {
    "Smart Phone X" → category: "Electronics/Smartphones", confidence: 0.92
  },
  normalization: {
    "Apple Inc." → "Apple",
    "APPLE" → "Apple"
  },
  featureExtraction: {
    "iPhone 15 Pro 256GB" → {
      brand: "Apple",
      model: "iPhone 15 Pro",
      storage: "256GB",
      features: ["5G", "ProCamera"]
    }
  },
  missingDataInference: {
    // Infer category from name/description
    // Infer price range from similar items
  }
}
```

#### Benefici
✅ **User vede risultati immediatamente** (fase 1)
✅ **Dati si arricchiscono progressivamente** (fase 2 in background)
✅ **Costo AI solo se necessario** (opzionale)
✅ **Fallback sempre disponibile** (se AI fallisce, hai i dati raw)

---

### SOLUZIONE 2: HITL Progressive Display (UX Overhaul)

#### 2.1 Streaming Progressivo VERO

**Problema Attuale**: Il codice ha `extractWithChunkingProgressive` ma **NON lo usa** correttamente.

**Soluzione**: Connettere il progressive extraction al frontend SSE

```typescript
// backend/src/agents/subagents/ingestion/pdfParserAgent.ts
async function* extractWithChunkingProgressive(
  text: string,
  userContext: string,
  language: string,
  hitlContext?: { contextPrompt?: string }
): AsyncGenerator<{
  type: 'chunk_start' | 'chunk_complete' | 'all_complete';
  chunkIndex?: number;
  totalChunks?: number;
  items?: RawExtractedItem[];
  notes?: string[];
}> {
  // ✅ IMPLEMENTATO MA MAI USATO!

  const chunks = splitTextIntoChunks(text, chunkSize, overlap);

  for (let i = 0; i < chunks.length; i++) {
    // Emit chunk start
    yield { type: 'chunk_start', chunkIndex: i, totalChunks: chunks.length };

    // Extract items
    const result = await extractWithLLM(chunks[i], ...);

    // Emit chunk complete with items - SEND IMMEDIATELY TO USER
    yield {
      type: 'chunk_complete',
      chunkIndex: i,
      items: result.items,  // ← QUESTI VANNO AL FRONTEND SUBITO
      notes: result.extractionNotes
    };
  }

  yield { type: 'all_complete' };
}
```

**Frontend riceve items progressivamente**:
```
[t=0s]    → "Inizio estrazione chunk 1/5..."
[t=8s]    → "Chunk 1/5 completato: 71 items" → MOSTRA SUBITO I 71 ITEMS
[t=16s]   → "Chunk 2/5 completato: 62 items" → AGGIUNGI ALTRI 62 ITEMS
[t=24s]   → "Chunk 3/5 completato: 3 items"  → AGGIUNGI ALTRI 3 ITEMS
...
[t=40s]   → "Estrazione completata: 136 items totali"
```

#### 2.2 Immediate Preview (First Batch Priority)

**Concetto**: Mostra SUBITO i primi N items appena estratti, senza aspettare tutti i chunks

```typescript
// backend/src/routes/portfolio-stream.routes.ts

for await (const event of ingestDataStreaming({ ... })) {
  if (event.type === 'chunk_complete' && event.items.length > 0) {
    // ✅ NEW: Send items IMMEDIATELY, not wait for batch to fill

    const normalizedItems = await normalizeItems(event.items);

    // Send preview event
    sendEvent('preview', {
      items: normalizedItems.slice(0, 5), // First 5 items
      totalExtractedSoFar: totalItemsCount,
      estimatedTotal: estimatedTotal,
      message: `Trovati ${normalizedItems.length} items nel chunk ${event.chunkIndex + 1}/${event.totalChunks}`
    });

    // Add to pending batch
    hitlService.addPendingItems(sessionId, normalizedItems);
  }
}
```

**User Experience**:
```
[t=0s]   User uploads PDF
[t=1s]   "Analisi documento... 10 pagine, tabelle rilevate"
[t=8s]   ✨ PREVIEW: Mostra card con primi 5 items
         "Anteprima: 71 items trovati finora (chunk 1/5)"
[t=16s]  ✨ UPDATE: Aggiorna "133 items trovati finora (chunk 2/5)"
[t=40s]  "Estrazione completata: 136 items. Rivedi i primi 5?"
```

#### 2.3 Smart Skeleton Loaders

**Problema**: Loading spinner generico = noia

**Soluzione**: Skeleton cards che si riempiono progressivamente

```tsx
// frontend/components/portfolio/IngestionSkeleton.tsx

export function IngestionSkeleton({ phase, itemsFound, estimatedTotal }) {
  return (
    <div className="space-y-4">
      {/* Progress bar with real data */}
      <ProgressBar
        value={itemsFound}
        max={estimatedTotal}
        label={`${itemsFound}/${estimatedTotal} items estratti`}
      />

      {/* Skeleton cards that fill in as items arrive */}
      <div className="grid grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-4 bg-gray-300 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </Card>
        ))}
      </div>

      {/* Live activity feed */}
      <div className="border-l-2 border-blue-500 pl-4">
        <p className="text-sm text-gray-600">
          📄 Chunk 2/5 in elaborazione...
        </p>
        <p className="text-xs text-gray-400">
          GPT-4o analisi tabella (15 righe rilevate)
        </p>
      </div>
    </div>
  );
}
```

#### 2.4 Background Processing Mode

**Problema**: User è "bloccato" sulla schermata HITL

**Soluzione**: Modalità background con notifiche

```typescript
// frontend/hooks/useBackgroundIngestion.ts

export function useBackgroundIngestion() {
  const [sessions, setSessions] = useState<Map<string, IngestionSession>>();

  function startIngestion(files: File[]) {
    const sessionId = createSession();

    // Start ingestion in background
    fetch('/api/portfolio/ingest/hitl/stream', { ... })
      .then(response => {
        // Process SSE events
        const eventSource = new EventSource(...);

        eventSource.addEventListener('batch', (event) => {
          // Store batch for later review
          updateSession(sessionId, event.data);

          // Show notification
          showNotification({
            title: "Nuovi items pronti per revisione",
            message: `${event.data.items.length} items estratti. Vuoi rivederli ora?`,
            action: () => navigateTo(`/portfolio/review/${sessionId}`)
          });
        });
      });

    // User può navigare via
    return sessionId;
  }

  function resumeSession(sessionId: string) {
    // Resume HITL review from where user left off
    navigateTo(`/portfolio/review/${sessionId}`);
  }
}
```

**User Flow**:
```
1. User carica PDF → Session creata
2. User naviga su Dashboard (ingestion continua in background)
3. [Dopo 1 minuto] Notifica: "87 items estratti. Rivedi ora?"
4. User clicca → Apre pagina HITL review con tutti gli items pronti
```

#### 2.5 Better Progress Indicators

**Invece di**: "Loading... 45%"

**Mostrare**:
```
📄 Estrazione in corso

Chunk 2/5 - Tabella prodotti automotive
├─ 62 items estratti da questa sezione
├─ Brand rilevati: FIAT (15), JEEP (11), ALFA (8)
├─ Tempo stimato rimanente: ~30 secondi
└─ Totale finora: 133 items

✅ Chunk 1/5 completato (71 items)
🔄 Chunk 2/5 in corso... (GPT-4o analisi)
⏳ Chunk 3/5 in attesa
⏳ Chunk 4/5 in attesa
⏳ Chunk 5/5 in attesa
```

---

## 📊 Confronto Prima/Dopo

### CSV Extraction

| Aspetto | Prima (Rule-Based) | Dopo (Ibrido) |
|---------|-------------------|---------------|
| **Tempo risposta iniziale** | 10-19ms | 10-19ms (identico) |
| **Dati visibili** | Raw data, 100% accuracy | Raw data + AI enrichment |
| **Categorizzazione** | ❌ Nessuna | ✅ AI auto-categorization |
| **Brand normalization** | ❌ No | ✅ "Apple Inc." → "Apple" |
| **Feature extraction** | ❌ No | ✅ "iPhone 15 Pro 256GB" → parsed features |
| **Costo** | $0 | $0 (phase 1) + ~$0.01-0.02 (phase 2, optional) |
| **UX** | Immediata | Immediata + progressive enhancement |

### HITL Ingestion UX

| Aspetto | Prima | Dopo |
|---------|-------|------|
| **Time to first item** | 1-3 minuti | **8-15 secondi** |
| **Visual feedback** | Spinner statico | ✅ Live progress + skeleton loaders |
| **Items visibility** | Batch completo alla fine | ✅ **Progressive display** (chunk by chunk) |
| **Background mode** | ❌ No | ✅ Può navigare via, notifiche |
| **Progress detail** | "Loading 45%" | ✅ "Chunk 2/5, 133 items, 30s rimanenti" |
| **Perceived performance** | 😫 Lento, noioso | 😊 **Veloce, engaging** |

---

## 🎯 Implementazione Prioritaria

### QUICK WIN 1: Progressive Display (2-3 giorni)
**Impatto**: ⭐⭐⭐⭐⭐ (massimo)
**Effort**: 🔧🔧 (medio)

1. Connettere `extractWithChunkingProgressive` al `/ingest/hitl/stream` endpoint
2. Emettere eventi `preview` con primi items appena chunk 1 completa
3. Frontend mostra skeleton → riempie progressivamente

**Risultato**: User vede items in 8-15s invece di 1-3 minuti

---

### QUICK WIN 2: Better Progress Indicators (1 giorno)
**Impatto**: ⭐⭐⭐⭐ (alto)
**Effort**: 🔧 (basso)

1. Inviare progress dettagliato: chunk index, items count, brands detected
2. Mostrare timeline visiva dei chunks
3. Skeleton loaders invece di spinner

**Risultato**: User capisce cosa sta succedendo, riduce frustrazione

---

### MEDIUM TERM: CSV Hybrid (3-5 giorni)
**Impatto**: ⭐⭐⭐ (medio)
**Effort**: 🔧🔧🔧 (medio-alto)

1. Fase 1: Extract (rule-based, 10ms) → show immediately
2. Fase 2: Enrich (AI optional, background) → progressive enhancement
3. Frontend mostra "enrichment in progress" badge

**Risultato**: CSV diventa "smart" mantenendo velocità

---

### ADVANCED: Background Mode (5-7 giorni)
**Impatto**: ⭐⭐⭐⭐ (alto)
**Effort**: 🔧🔧🔧🔧 (alto)

1. Session persistence (Redis/DB instead of in-memory)
2. WebSocket/SSE per notifiche real-time
3. UI per resuming sessions

**Risultato**: User non è "bloccato", può multitask

---

## 💡 Raccomandazioni

### Per risolvere SUBITO il problema HITL:
1. **✅ PRIORITÀ 1**: Implementare progressive display (Quick Win 1)
2. **✅ PRIORITÀ 2**: Better progress indicators (Quick Win 2)

Questi 2 interventi risolvono il 90% del problema percepito con ~3-4 giorni di lavoro.

### Per CSV + AI:
1. Tenere CSV rule-based come primary path (velocissimo, affidabile)
2. Aggiungere AI enrichment come **optional enhancement** in background
3. Mostrare UI che gli items si "arricchiscono" progressivamente (badge "enriching...")

---

## 📝 Codice di Esempio

### Backend: Progressive Streaming (connessione mancante)

```typescript
// File: backend/src/routes/portfolio-stream.routes.ts
// Line: 176 (da modificare)

// ❌ ATTUALE (non usa progressive extraction)
for await (const event of ingestDataStreaming({ ... })) {
  // Processa solo eventi 'batch' completi
}

// ✅ NUOVO (progressive extraction)
for await (const event of ingestDataStreaming({ ... })) {
  if (event.type === 'chunk_complete') {
    // Items estratti da questo chunk - INVIA SUBITO
    const normalizedItems = await normalizeChunkItems(event.items);

    // Preview event - mostra subito al frontend
    sendEvent('preview', {
      items: normalizedItems,
      chunkIndex: event.chunkIndex,
      totalChunks: event.totalChunks,
      itemsExtractedSoFar: totalExtracted,
      message: `Chunk ${event.chunkIndex + 1}/${event.totalChunks}: ${normalizedItems.length} items trovati`
    });

    // Aggiungi a pending per HITL review
    hitlService.addPendingItems(sessionId, normalizedItems);
  }
}
```

### Frontend: Preview Display

```tsx
// File: frontend/components/portfolio/HITLPreview.tsx

export function HITLPreview({ sessionId }: { sessionId: string }) {
  const [preview, setPreview] = useState<Item[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const eventSource = new EventSource(`/api/portfolio/ingest/hitl/stream`);

    eventSource.addEventListener('preview', (event) => {
      const data = JSON.parse(event.data);

      // ✅ MOSTRA ITEMS SUBITO (non aspettare batch completo)
      setPreview(prev => [...prev, ...data.items]);
      setProgress({ current: data.itemsExtractedSoFar, total: data.estimatedTotal });

      // Show toast notification
      toast.info(`${data.items.length} nuovi items trovati`);
    });

    return () => eventSource.close();
  }, [sessionId]);

  return (
    <div className="space-y-6">
      {/* Progress bar with real data */}
      <ProgressBar
        value={progress.current}
        max={progress.total}
        label={`${progress.current}/${progress.total} items estratti`}
      />

      {/* Live preview of items (updates as chunks complete) */}
      <div className="grid grid-cols-3 gap-4">
        {preview.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            className="animate-fadeIn"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>

      {/* Activity feed */}
      <ActivityFeed events={events} />
    </div>
  );
}
```

---

## 🎯 Conclusioni

Il sistema HITL **esiste già** e ha le basi giuste (SSE streaming), ma:

### Problemi Attuali:
1. ❌ Non usa la `extractWithChunkingProgressive` disponibile
2. ❌ Aspetta batch completi invece di mostrare items progressivamente
3. ❌ UI statica senza feedback dettagliato
4. ❌ User bloccato sulla schermata

### Soluzioni Rapide (3-4 giorni):
1. ✅ Connettere progressive extraction a streaming endpoint
2. ✅ Emettere eventi `preview` con items non appena chunk completa
3. ✅ UI con skeleton loaders + progress dettagliato

### Risultato Atteso:
- **Time to first item**: da 1-3 min → **8-15 sec** (-85%)
- **Perceived performance**: da "lento e noioso" → "veloce e engaging"
- **User satisfaction**: ⭐⭐ → ⭐⭐⭐⭐⭐

Il problema è risolvibile rapidamente perché **il codice backend esiste già**, serve solo connettere i pezzi e migliorare il frontend!
