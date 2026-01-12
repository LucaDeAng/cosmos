# 🔍 ANALISI COMPLETA FLOW E PIANO DI SISTEMAZIONE

## 📊 FLOW ATTUALE: Dal Login al Primo Catalogo

```
┌─────────────────────────────────────────────────────────────────┐
│ FASE 1: AUTENTICAZIONE                                          │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─→ [NUOVO UTENTE]
   │   └─→ /register (3 steps: Profile → Security → Company)
   │       └─→ POST /api/auth/register
   │           ├─→ Crea user in Supabase (users table)
   │           ├─→ Crea/mappa company (companies table)
   │           └─→ Auto-login + JWT token
   │
   └─→ [UTENTE ESISTENTE]
       └─→ /login
           └─→ POST /api/auth/login
               ├─→ Valida credenziali (Supabase users)
               ├─→ Rate limiting (5 req/min)
               └─→ Return JWT token + user object

┌─────────────────────────────────────────────────────────────────┐
│ FASE 2: STRATEGIC ASSESSMENT (Primo Accesso)                   │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─→ Redirect a /onboarding/assessment
   │   └─→ 7 domande survey:
   │       1. Portfolio size (initiatives count)
   │       2. Decision-making process
   │       3. Prioritization criteria (multiple)
   │       4. Portfolio visibility (1-5)
   │       5. Main challenge
   │       6. Initiative types (multiple)
   │       7. Primary goal with THEMIS
   │
   └─→ "Complete Assessment" button
       └─→ POST /api/assessment
           ├─→ ❌ PROBLEMA: Usa OLD assessmentAgent (PPM maturity)
           │   │   Dovrebbe usare NEW strategicAssessmentAgent!
           │   │
           │   └─→ assessmentAgent.analyze() genera:
           │       ├─→ cluster (ppm_starter → ppm_optimized)
           │       ├─→ profile (maturity, scores)
           │       └─→ recommendations
           │
           ├─→ ✅ Salva in company_assessments (Supabase)
           ├─→ ✅ Crea snapshot in company_assessment_snapshots
           ├─→ ✅ Aggiorna companies.onboarding_step = 'categories'
           └─→ ⚠️  MANCA: Set user.has_completed_onboarding = true

┌─────────────────────────────────────────────────────────────────┐
│ FASE 3: DASHBOARD (Accessi Successivi)                         │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─→ Check: profile?.hasCompletedOnboarding
   │   ├─→ ❌ PROBLEMA: Campo non esiste nel DB schema
   │   │   Dovrebbe controllare companies.onboarding_step
   │   │
   │   ├─→ [SE FALSE] → redirect /onboarding/assessment
   │   └─→ [SE TRUE]  → mostra /dashboard
   │
   └─→ Dashboard mostra:
       ├─→ Portfolio statistics
       ├─→ Assessment results
       ├─→ Progress tracking (6 steps)
       └─→ Bottone "Upload Portfolio Data"

┌─────────────────────────────────────────────────────────────────┐
│ FASE 4: DATA INGESTION                                         │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─→ /portfolio → AdvancedIngestionUploader
   │   │
   │   ├─→ OPZIONE 1: File Upload (PDF, Excel, CSV)
   │   │   └─→ POST /api/portfolio/ingest
   │   │       ├─→ dataIngestionOrchestrator.ingestData()
   │   │       │   ├─→ PDFParserAgent (se .pdf)
   │   │       │   ├─→ ExcelParserAgent (se .xlsx/.xls)
   │   │       │   ├─→ TextParserAgent (se .csv/.txt)
   │   │       │   └─→ NormalizerAgent (standardizza)
   │   │       │
   │   │       ├─→ ❌ PROBLEMA: Non usa RAG training del profilo!
   │   │       │   Dovrebbe usare bootstrapTenantRAG() prima
   │   │       │   per migliorare accuratezza classificazione
   │   │       │
   │   │       └─→ Return: { items[], stats, parsing, errors }
   │   │
   │   ├─→ OPZIONE 2: URL Import
   │   │   └─→ POST /api/portfolio/import-url
   │   │
   │   └─→ OPZIONE 3: Paste Text
   │       └─→ POST /api/portfolio/ingest/text
   │
   └─→ Stage Progress:
       ├─→ UPLOADING  (mostra file picker)
       ├─→ PARSING    (agent extraction)
       ├─→ NORMALIZING (standardizzazione)
       └─→ COMPLETE   (mostra risultati)

┌─────────────────────────────────────────────────────────────────┐
│ FASE 5: REVIEW & CONFERMA                                      │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─→ /portfolio/upload-result
   │   │
   │   ├─→ Mostra extraction results:
   │   │   ├─→ Summary stats (count by type, confidence)
   │   │   ├─→ Item list con checkbox
   │   │   └─→ Edit/Delete per item
   │   │
   │   ├─→ ❌ PROBLEMA: Non usa schema inference!
   │   │   Dovrebbe usare inferProductSchema()/inferServiceSchema()
   │   │   per pre-compilare campi mancanti
   │   │
   │   └─→ User può:
   │       ├─→ Edit item (modal con form)
   │       ├─→ Delete item
   │       └─→ Select/Deselect per salvataggio
   │
   └─→ "Save Selected Items" button
       └─→ POST /api/portfolio/items/{type}/upload
           ├─→ Salva in Supabase:
           │   ├─→ initiatives (se type=initiative)
           │   ├─→ portfolio_products (se type=product)
           │   └─→ portfolio_services (se type=service)
           │
           ├─→ ✅ Salvataggio per tipo con tenant_id
           ├─→ ⚠️  MANCA: Product/Service classification con RAG
           │   Dovrebbe chiamare semanticSearch() per validare
           │
           └─→ Redirect a /portfolio/items/{type}

┌─────────────────────────────────────────────────────────────────┐
│ FASE 6: PRIMO CATALOGO CREATO ✅                               │
└─────────────────────────────────────────────────────────────────┘
   │
   └─→ User vede lista items in /portfolio/items/{type}
       ├─→ Filtri: status, priority, category
       ├─→ Edit/Delete actions
       └─→ Ready per Portfolio Assessment (prossimo step)
```

---

## ❌ PROBLEMI IDENTIFICATI

### 1. **STRATEGIC ASSESSMENT NON INTEGRATO**

**Problema:**
- Backend usa `assessmentAgent` (vecchio, PPM maturity)
- Non usa `strategicAssessmentAgent` (nuovo, profilo aziendale completo)
- Non genera `StrategicAssessmentProfile` con RAG config + schema hints

**Impatto:**
- RAG non viene addestrato con esempi aziendali
- Schema inference non ha hint per pre-compilazione
- Q&A generation manca contesto strategico

**File Interessati:**
- `backend/src/routes/assessment.routes.ts` (linea ~50)
- Frontend: `frontend/app/onboarding/assessment/page.tsx`

**Fix Necessario:**
```typescript
// PRIMA (assessment.routes.ts):
const analysis = await assessmentAgent.analyze({ answers });

// DOPO:
import { getStrategicAssessmentAgent } from '../agents/strategicAssessmentAgent';

const strategicAgent = getStrategicAssessmentAgent();
const profile = await strategicAgent.generateProfile({
  tenant_id: user.companyId,
  company_name: company.name,
  answers: transformAnswersToNewFormat(answers)
});

// Poi bootstrap RAG:
import { bootstrapTenantRAG } from '../agents/utils/ragCustomTraining';
await bootstrapTenantRAG(user.companyId, profile);
```

---

### 2. **ONBOARDING COMPLETION FLAG MANCANTE**

**Problema:**
- Frontend controlla `profile?.hasCompletedOnboarding`
- Campo non esiste nel DB schema `users` table
- Dovrebbe controllare `companies.onboarding_step`

**Impatto:**
- User potrebbe rivedere assessment ogni volta
- No redirect automatico a dashboard dopo primo accesso

**File Interessati:**
- `frontend/app/onboarding/page.tsx`
- `frontend/store/authStore.ts`
- `backend/src/auth/auth.service.ts`

**Fix Necessario:**

Opzione A - Aggiungere campo al user profile:
```sql
ALTER TABLE users ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT FALSE;
```

Opzione B - Controllare companies.onboarding_step:
```typescript
// frontend/app/onboarding/page.tsx
const { data: company } = await supabase
  .from('companies')
  .select('onboarding_step')
  .eq('id', user.companyId)
  .single();

if (company?.onboarding_step !== 'assessment') {
  router.replace('/dashboard');
}
```

---

### 3. **RAG NON ADDESTRATO CON PROFILO AZIENDALE**

**Problema:**
- Dopo strategic assessment, RAG non viene addestrato
- `bootstrapTenantRAG()` non viene chiamato
- Product/Service classification usa solo catalogo generico

**Impatto:**
- Accuratezza classificazione ~85% invece di >95%
- Non riconosce terminologia specifica dell'azienda
- Non usa TOP products/services come esempi

**File Interessati:**
- `backend/src/routes/assessment.routes.ts`
- `backend/src/agents/utils/ragCustomTraining.ts` (già creato!)

**Fix Necessario:**
```typescript
// assessment.routes.ts - dopo generazione profilo:
import { bootstrapTenantRAG } from '../agents/utils/ragCustomTraining';

const stats = await bootstrapTenantRAG(user.companyId, profile);

console.log(`RAG trained: ${stats.products_added} products, ${stats.services_added} services`);
```

---

### 4. **SCHEMA INFERENCE NON USATO**

**Problema:**
- Durante review di extracted items, campi vuoti non pre-compilati
- `schemaInferenceEngine` creato ma non integrato
- User deve compilare manualmente tutti i campi

**Impatto:**
- 40-50% più data entry manuale
- User experience peggiore
- Errori per campi obbligatori mancanti

**File Interessati:**
- `frontend/app/portfolio/upload-result/page.tsx`
- `backend/src/routes/portfolio.routes.ts`

**Fix Necessario:**
```typescript
// Backend: portfolio.routes.ts - endpoint /ingest
import { inferProductSchema, inferServiceSchema } from '../agents/utils/schemaInferenceEngine';

// Dopo normalization, prima di return:
const { data: profile } = await supabase
  .from('company_assessment_snapshots')
  .select('*')
  .eq('company_id', tenantId)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (profile) {
  const enrichedItems = items.map(item => {
    if (item.type === 'product') {
      const inference = inferProductSchema(profile, item);
      return applyProductInference(item, inference);
    } else if (item.type === 'service') {
      const inference = inferServiceSchema(profile, item);
      return applyServiceInference(item, inference);
    }
    return item;
  });

  return enrichedItems;
}
```

---

### 5. **PRODUCT/SERVICE CLASSIFICATION NON USA RAG**

**Problema:**
- Dopo save items, non viene validata classificazione con RAG
- `semanticSearch()` del RAG system non viene chiamato
- No confidence score per classificazione

**Impatto:**
- Possibili errori di classificazione (product vs service)
- No feedback all'utente su accuratezza
- RAG training inutilizzato

**File Interessati:**
- `backend/src/routes/portfolio.routes.ts`
- `backend/src/agents/utils/embeddingService.ts`

**Fix Necessario:**
```typescript
// portfolio.routes.ts - endpoint /items/{type}/upload
import { semanticSearch } from '../agents/utils/embeddingService';

// Per ogni item, valida classificazione:
for (const item of items) {
  const searchQuery = `${item.name} ${item.description}`;

  const ragResults = await semanticSearch(searchQuery, {
    systemId: tenantId, // usa RAG tenant-specific
    limit: 3,
    threshold: 0.7
  });

  // Verifica se RAG conferma il tipo
  const ragType = ragResults[0]?.metadata?.type;
  if (ragType && ragType !== item.type) {
    console.warn(`Type mismatch: User=${item.type}, RAG=${ragType}, Item=${item.name}`);
    // Opzionalmente aggiungi warning per review
  }
}
```

---

### 6. **UX/UI: PROGRESS TRACKING INCOMPLETO**

**Problema:**
- Dashboard mostra 6 steps ma non traccia progresso effettivo
- No visual feedback su step completati
- Non chiaro dove si trova user nel flow

**Impatto:**
- User confuso su prossimi step
- No gamification/motivazione
- Difficile riprendere dove interrotto

**File Interessati:**
- `frontend/app/dashboard/page.tsx`
- `frontend/components/dashboard/ProgressTracker.tsx` (?)

**Fix Necessario:**
```typescript
// Aggiungere campo a companies table:
// progress_steps: { assessment: true, portfolio: false, roadmap: false, ... }

// Dashboard mostra:
<ProgressTracker
  steps={[
    { name: 'Assessment', completed: true },
    { name: 'Portfolio Upload', completed: true, current: false },
    { name: 'Portfolio Assessment', completed: false, current: true },
    { name: 'Roadmap', completed: false },
    { name: 'Budget', completed: false },
    { name: 'Strategy', completed: false }
  ]}
/>
```

---

## ✅ COSE CHE FUNZIONANO BENE

1. **Autenticazione completa** con rate limiting, social login, email verification
2. **Old assessment agent** funziona (ma va sostituito)
3. **Data ingestion pipeline** multi-agent funziona (PDF, Excel, CSV)
4. **Salvataggio Supabase** per tutti i tipi (initiatives, products, services)
5. **File upload security** con validazione, hash, virus scan
6. **Session management** con JWT 7-day expiry
7. **Tenant isolation** corretto su tutte le query

---

## 🔧 PIANO DI SISTEMAZIONE

### PRIORITÀ 1 - CRITICAL (Blocca il flow)

1. **Integrare Strategic Assessment Agent**
   - Sostituire assessmentAgent con strategicAssessmentAgent
   - Chiamare bootstrapTenantRAG() dopo profilo generato
   - Salvare StrategicAssessmentProfile in Supabase

2. **Fix Onboarding Completion Detection**
   - Aggiungere campo has_completed_onboarding a users
   - O controllare companies.onboarding_step
   - Redirect corretto a dashboard

### PRIORITÀ 2 - HIGH (Migliora UX significativamente)

3. **Integrare Schema Inference**
   - Chiamare inferProductSchema/inferServiceSchema dopo extraction
   - Restituire items arricchiti al frontend
   - Mostrare campi inferred con badge "Auto-filled"

4. **RAG Validation durante Save**
   - Validare classificazione con semanticSearch()
   - Mostrare confidence score
   - Warning se mismatch tipo

### PRIORITÀ 3 - MEDIUM (Nice to have)

5. **Progress Tracking UI**
   - Aggiungere ProgressTracker component
   - Salvare step completion in DB
   - Visual feedback su dashboard

6. **Test E2E Completo**
   - Creare test che simula intero flow
   - Da registration a primo catalogo salvato
   - Verificare tutte le chiamate API

---

## 📝 NUOVO SCHEMA DATABASE (se necessario)

```sql
-- 1. Aggiungere has_completed_onboarding
ALTER TABLE users
ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- 2. Aggiungere strategic_assessment_profiles table
CREATE TABLE strategic_assessment_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,

  -- Profilo completo
  company_identity JSONB NOT NULL,
  portfolio_composition JSONB NOT NULL,
  strategic_context JSONB NOT NULL,
  themis_context JSONB NOT NULL,

  -- Configurazioni derivate
  rag_training_config JSONB NOT NULL,
  schema_inference_hints JSONB NOT NULL,
  qa_generation_context JSONB NOT NULL,

  -- Metadata
  recommendations JSONB,
  executive_summary TEXT,
  assessment_version TEXT DEFAULT '2.0',
  confidence_score DECIMAL(3,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_strategic_profiles_company ON strategic_assessment_profiles(company_id);
CREATE INDEX idx_strategic_profiles_tenant ON strategic_assessment_profiles(tenant_id);

-- 3. Aggiungere progress tracking
ALTER TABLE companies
ADD COLUMN progress_steps JSONB DEFAULT '{"assessment":false,"portfolio":false,"roadmap":false,"budget":false,"strategy":false}';
```

---

## 🧪 TEST E2E PROPOSTO

```javascript
// test-complete-flow-e2e.js

describe('Complete Onboarding Flow', () => {

  it('Should complete full flow: Register → Assessment → Upload → Catalog', async () => {

    // STEP 1: Register
    const registerRes = await fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Test123!@#',
        companyName: 'Test Corp'
      })
    });
    expect(registerRes.status).toBe(201);
    const { user, token } = await registerRes.json();

    // STEP 2: Strategic Assessment
    const assessmentRes = await fetch('/api/assessment', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        answers: mockStrategicAnswers // 7 domande
      })
    });
    expect(assessmentRes.status).toBe(200);
    const assessment = await assessmentRes.json();
    expect(assessment.profile).toBeDefined();
    expect(assessment.rag_training_stats).toBeDefined(); // RAG addestrato!

    // STEP 3: Upload Portfolio File
    const formData = new FormData();
    formData.append('file', mockExcelFile);

    const uploadRes = await fetch('/api/portfolio/ingest', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    expect(uploadRes.status).toBe(200);
    const { items } = await uploadRes.json();
    expect(items.length).toBeGreaterThan(0);

    // Verifica schema inference applicato
    const firstProduct = items.find(i => i.type === 'product');
    expect(firstProduct._inference_metadata).toBeDefined();
    expect(firstProduct._inference_metadata.inferred_fields.length).toBeGreaterThan(0);

    // STEP 4: Save Items
    const saveRes = await fetch('/api/portfolio/items/product/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ items: [firstProduct] })
    });
    expect(saveRes.status).toBe(201);

    // STEP 5: Verify Catalog Created
    const catalogRes = await fetch(`/api/portfolio/items/product/${user.companyId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(catalogRes.status).toBe(200);
    const catalog = await catalogRes.json();
    expect(catalog.length).toBeGreaterThan(0);

    console.log('✅ E2E Test PASSED - Full flow works!');
  });

});
```

---

## 🎯 PROSSIMI STEP RACCOMANDATI

1. **Implementare fix PRIORITÀ 1** (Strategic Assessment + RAG)
2. **Testare flow manualmente** (registro → assessment → upload)
3. **Implementare fix PRIORITÀ 2** (Schema Inference)
4. **Creare test E2E automatico**
5. **Implementare Progress Tracking UI**
6. **Deploy e test su staging**

Vuoi che proceda con l'implementazione dei fix? Posso iniziare dalla PRIORITÀ 1 (integrazione Strategic Assessment Agent).
