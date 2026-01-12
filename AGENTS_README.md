# 🤖 THEMIS - Architettura Agenti AI

## Panoramica

THEMIS è un sistema multi-agente per la valutazione della maturità IT e la gestione del portfolio aziendale.
Il flusso è **sequenziale**: prima l'azienda completa l'assessment di maturità, poi carica il portfolio (iniziative/documenti), e infine ottiene una valutazione del portfolio che diventa la knowledge base per gli agenti successivi.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│                                                                      │
│   FLUSSO SEQUENZIALE:                                               │
│   /login → /onboarding → /dashboard → /portfolio → /assessment      │
│       │         │            │            │              │          │
│       │         │            │            │              │          │
│       ▼         ▼            ▼            ▼              ▼          │
│    [Auth]   [Q&A IT]    [Risultati]  [Upload/CRUD]  [Valutazione]   │
│              STEP 1       STEP 2       STEP 3         STEP 4        │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ REST API
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express + TypeScript)                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    🎭 ORCHESTRATOR AGENT                      │   │
│  │         Decide quale sub-agente chiamare in base al          │   │
│  │              messaggio utente e contesto                      │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                        │
│  ═══════════════════════════════════════════════════════════════    │
│                       FLUSSO SEQUENZIALE                             │
│  ═══════════════════════════════════════════════════════════════    │
│                                                                      │
│  STEP 1                STEP 2                    STEP 3              │
│  ┌─────────────┐       ┌─────────────┐          ┌─────────────┐     │
│  │   CLIENT    │  ──▶  │  DOCUMENT   │   ──▶    │  PORTFOLIO  │     │
│  │ ASSESSMENT  │       │ EXTRACTION  │          │ ASSESSMENT  │     │
│  │             │       │ (se upload) │          │             │     │
│  └─────────────┘       └─────────────┘          └─────────────┘     │
│        │                     │                        │              │
│        │ Salva maturità      │ Estrae items           │ Valuta e     │
│        │ IT azienda          │ da documenti           │ classifica   │
│        ▼                     ▼                        ▼              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    KNOWLEDGE BASE (Supabase)                 │    │
│  │   Assessment Maturità + Portfolio Items + Valutazioni        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│        │                                                             │
│        ▼                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │  GENERATOR  │    │  VALIDATOR  │    │  EXPLORER   │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             ▼                                        │
│                    ┌─────────────┐                                   │
│                    │ KNOWLEDGE   │                                   │
│                    │     QA      │                                   │
│                    └─────────────┘                                   │
│                                                                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SUPABASE                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ STEP 1: companies, users, assessments, assessment_snapshots │    │
│  │ STEP 2: initiatives, portfolio_products, portfolio_services │    │
│  │         document_extractions                                 │    │
│  │ STEP 3: portfolio_assessments                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flusso Sequenziale Obbligatorio

### STEP 1: Assessment Maturità IT (Obbligatorio)
```
Utente → /onboarding (questionario 15+ domande)
       → Client Assessment Agent (analisi AI)
       → Supabase: assessments, assessment_snapshots, companies
       → /dashboard (score maturità 1-5, gap analysis)
```
**Dati Salvati:** `assessments`, `company_assessment_snapshots`, `companies`

### STEP 2: Creazione Portfolio (Obbligatorio)
Due modalità:
```
A) UPLOAD DOCUMENTI (attiva Document Extraction Agent)
   Utente → /portfolio (drag & drop PDF/Excel/CSV)
          → Document Extraction Agent (AI parsing)
          → /portfolio/upload-result (review items estratti)
          → Conferma → Supabase
   
B) INSERIMENTO MANUALE
   Utente → /portfolio/items (form CRUD)
          → Supabase diretto (no AI)
```
**Dati Salvati:** `initiatives`, `portfolio_products`, `portfolio_services`, `document_extractions`

### STEP 3: Portfolio Assessment (Richiede STEP 1 + 2)
```
Utente → /portfolio/items (visualizza portfolio)
       → Click "Avvia Assessment"
       → Portfolio Assessment Agent (scoring AI)
       → Supabase: portfolio_assessments
       → /portfolio/assessment (risultati ranking)
```
**Dati Salvati:** `portfolio_assessments`

### STEP 4: Roadmap Generation (Richiede STEP 1 + 2 + 3)
```
Utente → /roadmap (genera roadmap)
       → Roadmap Generator Agent (AI planning)
       → Supabase: roadmaps
       → /roadmap (visualizza fasi, quick wins, KPI)
```
**Dati Salvati:** `roadmaps`

### STEP 5: Budget Optimization (Richiede STEP 2 + 3, opzionalmente STEP 4)
```
Utente → /budget (ottimizza budget)
       → Budget Optimizer Agent (AI financial planning)
       → Supabase: budget_optimizations
       → /budget (scenari, raccomandazioni, piano trimestrale)
```
**Dati Salvati:** `budget_optimizations`

### STEP 6: Strategy Advisor (Richiede STEP 2 + 3, opzionalmente STEP 4-5)
```
Utente → /strategy (prioritizza e strategizza)
       → Strategy Advisor Agent (AI strategic planning)
       → Supabase: strategy_analyses
       → /strategy (priorità MoSCoW, decision matrix, action plan)
```
**Dati Salvati:** `strategy_analyses`

### STEP 7+: Agenti Secondari (Usano KB da Step 1-6)
```
Gli agenti successivi (Knowledge QA, Report Generator)
accedono alla Knowledge Base costruita nei passi precedenti per:
- Rispondere a domande sulla KB
- Generare report
```

---

## 🎭 Agenti Implementati

### 1. **Orchestrator Agent** (`orchestratorAgent.ts`) ✅
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Router centrale che decide quale sub-agente chiamare |
| **Modello** | GPT-4o-mini |
| **Input** | Messaggio utente + contesto |
| **Output** | `call_tool` (chiama sub-agente) o `final_answer` (risponde direttamente) |
| **Salva su Supabase** | ❌ (solo routing) |

### 2. **Client Assessment Agent** (`clientAssessmentAgent.ts`) ✅ STEP 1
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Valuta la maturità IT dell'azienda basandosi su framework PPM |
| **Quando si attiva** | Sempre, primo step obbligatorio |
| **Input** | Risposte questionario onboarding, dati aziendali |
| **Output** | Score maturità (1-5), gap analysis, raccomandazioni |
| **Salva su Supabase** | ✅ `assessments`, `company_assessment_snapshots`, `companies` |
| **Frontend** | `/onboarding` → `/dashboard` |

### 3. **Document Extraction Agent** (`documentExtractionAgent.ts`) ✅ STEP 2 (condizionale)
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Estrae iniziative/prodotti/servizi da documenti caricati |
| **Quando si attiva** | Solo se l'utente carica file (PDF, Excel, CSV, JSON) |
| **Input** | File caricato |
| **Output** | Lista strutturata di PortfolioItem |
| **AI** | GPT-4o-mini per comprensione testo non strutturato |
| **Fallback** | Pattern matching se AI fallisce |
| **Salva su Supabase** | ✅ `document_extractions` (cronologia), items in `initiatives`/`portfolio_products`/`portfolio_services` |
| **Frontend** | `/portfolio` (upload) → `/portfolio/upload-result` (review) |

### 4. **Portfolio Assessment Agent** (`portfolioAssessmentAgent.ts`) ✅ STEP 3
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Valuta e classifica iniziative/prodotti/servizi del portfolio |
| **Quando si attiva** | Dopo che il portfolio è stato popolato (Step 2) |
| **Input** | Items portfolio da Supabase, criteri valutazione, obiettivi |
| **Output** | Score per item, ranking, raccomandazioni (keep/accelerate/pause/stop) |
| **Criteri** | Strategic Fit (25%), Value Delivery (25%), Risk-Adjusted Return (20%), Resource Efficiency (15%), Market Timing (15%) |
| **Salva su Supabase** | ✅ `portfolio_assessments` |
| **Frontend** | `/portfolio/items` → `/portfolio/assessment` |

### 5. **Roadmap Generator Agent** (`roadmapGeneratorAgent.ts`) ✅ STEP 4
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Genera roadmap strategiche per la trasformazione IT |
| **Quando si attiva** | Dopo Portfolio Assessment (richiede Step 1-3 completati) |
| **Input** | Assessment snapshot + Portfolio Assessment + vincoli utente |
| **Output** | Roadmap con fasi, quick wins, KPI, budget, rischi |
| **AI** | GPT-4o-mini per pianificazione strategica |
| **Salva su Supabase** | ✅ `roadmaps` |
| **Frontend** | `/roadmap` |

### 6. **Budget Optimizer Agent** (`budgetOptimizerAgent.ts`) ✅ STEP 5
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Ottimizza l'allocazione del budget tra le iniziative del portfolio |
| **Quando si attiva** | Dopo Portfolio Assessment (richiede Step 2-3, opzionalmente Step 4) |
| **Input** | Portfolio items + Portfolio Assessment + Roadmap (opzionale) + Budget totale |
| **Output** | 3 scenari (conservative/balanced/aggressive), raccomandazioni, piano trimestrale, KPI finanziari |
| **Framework** | OPTIMA (Outcome, Priority, Timing, Investment, Maturity, Acceptable risk) |
| **Salva su Supabase** | ✅ `budget_optimizations` |
| **Frontend** | `/budget` |

### 7. **Strategy Advisor Agent** (`strategyAdvisorAgent.ts`) ✅ STEP 6
| Aspetto | Dettaglio |
|---------|-----------|
| **Ruolo** | Prioritizza iniziative e fornisce strategie di implementazione |
| **Quando si attiva** | Dopo Portfolio Assessment (richiede Step 2-3, opzionalmente Step 4-5) |
| **Input** | Portfolio Assessment + Roadmap + Budget Optimization + vincoli strategici |
| **Output** | Prioritizzazione MoSCoW/WSJF/ICE, Decision Matrix, strategie make/buy/partner, cluster, action plan |
| **Framework** | PRIORITIZE (Performance, Resource, Innovation, Operational, Risk, Integration, Time, Investment, Zone, Execution) |
| **Salva su Supabase** | ✅ `strategy_analyses` |
| **Frontend** | `/strategy` |

### 8-11. **Agenti Secondari** (usano KB da Step 1-6) ⚠️ Parziali

| Agente | Ruolo | Stato | Salva su Supabase |
|--------|-------|-------|-------------------|
| **Generator** | Genera report, documenti, roadmap | 30% | Da implementare |
| **Validator** | Valida dati e coerenza | 30% | Da implementare |
| **Explorer** | Ricerca e esplora dati | 30% | Da implementare |
| **Knowledge QA** | Risponde a domande sulla KB | 30% | Da implementare |

---

## 🗄️ Dati Salvati su Supabase

### ✅ Confermato - Salvataggio Attivo

| Tabella | Salvato da | Quando |
|---------|------------|--------|
| `companies` | Client Assessment | Step 1 - Onboarding |
| `assessments` | Client Assessment | Step 1 - Fine questionario |
| `company_assessment_snapshots` | Client Assessment | Step 1 - Snapshot strutturato |
| `initiatives` | Document Extraction / Manual | Step 2 - Upload o CRUD |
| `portfolio_products` | Document Extraction / Manual | Step 2 - Upload o CRUD |
| `portfolio_services` | Document Extraction / Manual | Step 2 - Upload o CRUD |
| `document_extractions` | Document Extraction | Step 2 - Solo se upload file |
| `portfolio_assessments` | Portfolio Assessment | Step 3 - Valutazione portfolio |
| `roadmaps` | Roadmap Generator | Step 4 - Generazione roadmap |
| `budget_optimizations` | Budget Optimizer | Step 5 - Ottimizzazione budget |
| `strategy_analyses` | Strategy Advisor | Step 6 - Prioritizzazione e strategie |
| `audit_logs` | Vari servizi | Sempre - Log operazioni |

### Funzioni Repository Attive

```typescript
// portfolioRepository.ts
savePortfolioAssessment()      ✅ Salva valutazione portfolio
savePortfolioItems()           ✅ Salva iniziative/prodotti/servizi
saveDocumentExtraction()       ✅ Salva cronologia estrazione
getPortfolioAssessment()       ✅ Legge valutazione
getPortfolioItems()            ✅ Legge items
getDocumentExtractions()       ✅ Legge cronologia estrazioni

// roadmapRepository.ts
saveRoadmap()                  ✅ Salva roadmap
getRoadmap()                   ✅ Legge roadmap per ID
getLatestRoadmap()             ✅ Legge ultima roadmap per tenant
getRoadmapsByTenant()          ✅ Lista roadmap
deleteRoadmap()                ✅ Elimina roadmap
getRoadmapStats()              ✅ Statistiche aggregate

// budgetRepository.ts
saveBudgetOptimization()       ✅ Salva ottimizzazione budget
getBudgetOptimization()        ✅ Legge ottimizzazione per ID
getLatestBudgetOptimization()  ✅ Legge ultima ottimizzazione
getBudgetOptimizationsByTenant() ✅ Lista ottimizzazioni
deleteBudgetOptimization()     ✅ Elimina ottimizzazione
getScenarioFromOptimization()  ✅ Legge scenario specifico
updateRecommendedScenario()    ✅ Aggiorna scenario raccomandato
getBudgetOptimizationStats()   ✅ Statistiche aggregate
compareBudgetOptimizations()   ✅ Confronta due ottimizzazioni

// strategyRepository.ts
saveStrategyAnalysis()         ✅ Salva analisi strategica
getStrategyAnalysis()          ✅ Legge analisi per ID
getLatestStrategyAnalysis()    ✅ Legge ultima analisi per tenant
getStrategyAnalysesByTenant()  ✅ Lista analisi
deleteStrategyAnalysis()       ✅ Elimina analisi
getPriorityRecommendations()   ✅ Legge raccomandazioni per priorità
getDecisionMatrix()            ✅ Legge decision matrix
getStrategicClusters()         ✅ Legge cluster strategici
getStrategicKPIs()             ✅ Legge KPI strategici
getStrategyStats()             ✅ Statistiche aggregate
compareStrategyAnalyses()      ✅ Confronta due analisi

// assessmentSnapshotRepository.ts
saveAssessmentSnapshot()       ✅ Salva snapshot maturità
```

---

## 📱 Frontend - Pagine e Flusso

| Route | Step | Descrizione | Agenti | Salva su Supabase |
|-------|------|-------------|--------|-------------------|
| `/login` | - | Login utente | - | `users` (auth) |
| `/register` | - | Registrazione | - | `users`, `companies` |
| `/onboarding` | 1 | Questionario maturità IT | Client Assessment | ✅ `assessments`, `snapshots` |
| `/dashboard` | 1 | Risultati assessment | - (legge) | ❌ (solo lettura) |
| `/portfolio` | 2 | Landing + upload documenti | Document Extraction | ✅ `document_extractions`, items |
| `/portfolio/upload-result` | 2 | Review items estratti | - | ✅ items (conferma) |
| `/portfolio/items` | 2 | Gestione CRUD manuale | - | ✅ items |
| `/portfolio/assessment` | 3 | Risultati valutazione | Portfolio Assessment | ✅ `portfolio_assessments` |
| `/roadmap` | 4 | Generazione roadmap strategica | Roadmap Generator | ✅ `roadmaps` |
| `/budget` | 5 | Ottimizzazione budget | Budget Optimizer | ✅ `budget_optimizations` |
| `/strategy` | 6 | Prioritizzazione e strategie | Strategy Advisor | ✅ `strategy_analyses` |

---

## ❌ Agenti Mancanti / Da Completare

### Alta Priorità 🔴

1. **KNOWLEDGE_QA** (estensione)
   - Risponde a domande sulla Knowledge Base completa
   - Usa KB: tutto (Step 1-6)
   - Output: risposte contestuali
   - Salva: log conversazioni

### Media Priorità 🟡

2. **BENCHMARK_COMPARATOR**
   - Confronta maturità con benchmark settore
   - Usa KB: assessment + dati settore
   - Output: posizionamento, gap vs best practice
   - Salva: campo `benchmark` in `assessments`

5. **REPORT_GENERATOR** (estensione Generator)
   - Genera report PDF professionali
   - Usa KB: tutto
   - Output: PDF formattato
   - Salva: `generated_reports` (file storage)

---

## 📊 Stato Completamento

| Componente | Stato | Salva Supabase | % |
|------------|-------|----------------|---|
| Orchestrator | ✅ Completo | ❌ | 100% |
| Client Assessment | ✅ Completo | ✅ | 100% |
| Document Extraction | ✅ Completo | ✅ | 100% |
| Portfolio Assessment | ✅ Completo | ✅ | 100% |
| Roadmap Generator | ✅ Completo | ✅ | 100% |
| Budget Optimizer | ✅ Completo | ✅ | 100% |
| Strategy Advisor | ✅ Completo | ✅ | 100% |
| Generator | ⚠️ Struttura | ❌ | 30% |
| Validator | ⚠️ Struttura | ❌ | 30% |
| Explorer | ⚠️ Struttura | ❌ | 30% |
| Knowledge QA | ⚠️ Struttura | ❌ | 30% |

**Agenti Core Completi: 7/7 (100%)**
**Agenti Secondari: 0/4 (0%)**
**Completamento Globale: ~85%**

---

## 🚀 Prossimi Passi Suggeriti

1. ✅ **Verificare flusso E2E** - Testare Step 1 → 2 → 3 → 4 → 5 → 6 completo
2. ✅ **Implementare Budget Optimizer** - Per ottimizzazione allocazione budget
3. ✅ **Implementare Strategy Advisor** - Per prioritizzazione e strategie
4. **Implementare Knowledge QA** - Per rispondere a domande sulla KB
5. **Aggiungere Dashboard Analytics** - Grafici portfolio e trend
6. **Test automatizzati** - Per tutti i flussi principali
