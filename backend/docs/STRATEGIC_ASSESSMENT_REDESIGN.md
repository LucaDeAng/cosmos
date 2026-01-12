# Strategic Assessment Redesign

## Vision Olistica: Assessment come Fondazione del Sistema

### Il Problema Attuale

L'assessment corrente si concentra su **maturità PPM** ma non raccoglie informazioni strategiche necessarie per:

1. **RAG Training** - Manca il contesto settoriale specifico per riconoscere prodotti/servizi
2. **Product/Service Recognition** - Non sappiamo il linguaggio tecnico usato dall'azienda
3. **Schema Validation** - Non conosciamo il business model e le priorità strategiche
4. **Q&A Generation** - Non abbiamo abbastanza contesto per fare domande intelligenti

### La Nuova Vision: Assessment Strategico a 3 Livelli

```
┌─────────────────────────────────────────────────────────────┐
│              LIVELLO 1: IDENTITÀ AZIENDALE                  │
│  Obiettivo: Capire CHI è il cliente e COSA fa              │
│  Output: Context per RAG e classification                   │
├─────────────────────────────────────────────────────────────┤
│  • Settore/Industria (con terminologia specifica)          │
│  • Business Model (B2B, B2C, Platform, etc.)               │
│  • Scala operativa (startup, scaleup, enterprise)          │
│  • Mercato geografico e competitive landscape              │
│  • Value proposition principale                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│           LIVELLO 2: PORTFOLIO COMPOSITION                  │
│  Obiettivo: Capire COSA gestiscono (prodotti vs servizi)   │
│  Output: Training data per RAG recognition                  │
├─────────────────────────────────────────────────────────────┤
│  • Mix Product/Service (% revenue, strategic focus)        │
│  • Esempi concreti di prodotti TOP (naming, category)      │
│  • Esempi concreti di servizi TOP (naming, delivery model) │
│  • Lifecycle stage distribution                             │
│  • Wording e terminologia aziendale specifica              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         LIVELLO 3: STRATEGIA E PRIORITÀ                     │
│  Obiettivo: Capire PERCHÉ fanno certe scelte               │
│  Output: Context per Q&A e recommendations                  │
├─────────────────────────────────────────────────────────────┤
│  • Obiettivi strategici 2025-2027                          │
│  • Criteri di prioritizzazione (ROI, strategic fit, etc.)  │
│  • Pain points operativi attuali                           │
│  • Governance e decision-making model                      │
│  • Metriche di successo (KPI framework)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Nuovo Set di Domande: Strategic Assessment

### SEZIONE A: IDENTITÀ AZIENDALE (Company DNA)

**Obiettivo**: Creare il profilo aziendale per RAG context e classification

#### A1. Settore e Posizionamento

**Domanda**:
> "In quale settore/industria opera principalmente la vostra azienda?"

**Tipo**: Multiple choice + dettaglio

**Opzioni**:
- Technology / Software
- Financial Services / Banking
- Healthcare / Life Sciences
- Manufacturing / Industrial
- Retail / E-commerce
- Energy / Utilities
- Telecommunications
- Professional Services / Consulting
- Media / Entertainment
- Public Sector / Government
- Education
- Altro (specificare)

**+ Campo aperto**: "Descrivi in 2-3 frasi il vostro posizionamento competitivo nel settore"

**Perché è importante**:
- RAG può usare knowledge base settoriale specifico
- Terminologia prodotti/servizi varia drasticamente per settore
- Esempi: "Platform" in tech vs "Platform" in oil&gas hanno significati diversi

---

#### A2. Business Model e Revenue Streams

**Domanda**:
> "Qual è il vostro principale business model?"

**Tipo**: Multiple choice + percentuali

**Opzioni**:
- B2B Enterprise (vendita ad altre aziende, contratti enterprise)
- B2B SMB (vendita a PMI, self-service/low-touch)
- B2C (vendita a consumatori finali)
- B2B2C (vendita attraverso partner/distributori)
- Platform/Marketplace (connette domanda e offerta)
- Freemium/SaaS (software as a service con modello abbonamento)
- Licensing (licenze software/IP)
- Hybrid (combinazione dei precedenti)

**+ Campo numerico**: "% revenue da Prodotti vs Servizi"
- Prodotti (software, hardware, beni): ___%
- Servizi (consulting, managed services, support): ___%

**Perché è importante**:
- Aiuta a capire se aspettarsi più prodotti o servizi nel portfolio
- Il pricing model influenza come classificare gli item (SaaS = product or service?)
- Critical per RAG training con esempi corretti

---

#### A3. Scala e Complessità Operativa

**Domanda**:
> "Quale delle seguenti descrive meglio la vostra fase aziendale?"

**Tipo**: Multiple choice

**Opzioni**:
- Startup (< 50 dipendenti, < 3 anni, product-market fit in corso)
- Scaleup (50-500 dipendenti, crescita rapida, scaling operations)
- Mid-Market (500-5000 dipendenti, processi consolidati)
- Enterprise (> 5000 dipendenti, multinazionale, alta complessità)
- Conglomerate (multiple business units, portfolio di aziende)

**+ Campo**: "In quanti mercati geografici operate?"
- Singolo paese
- 2-5 paesi
- 6-15 paesi
- Globale (> 15 paesi)

**Perché è importante**:
- La complessità influenza il numero di prodotti/servizi da aspettarsi
- Enterprise ha nomenclature più codificate
- Geography influenza naming (prodotto X in IT vs prodotto Y in US)

---

### SEZIONE B: PORTFOLIO COMPOSITION (Cosa Gestite)

**Obiettivo**: Raccogliere esempi concreti per training RAG

#### B1. Product Portfolio Overview

**Domanda**:
> "Quanti **prodotti** distinti gestite attualmente nel vostro portfolio?"

**Tipo**: Numero + classificazione

**Input numerico**: ___ prodotti

**+ Breakdown per lifecycle**:
- In sviluppo/beta: ___
- Growth/in mercato: ___
- Mature/cash cow: ___
- Decline/sunset: ___

**Perché è importante**:
- Stima la dimensione del problema
- Lifecycle distribution indica strategic focus
- Aiuta a calibrare le aspettative di completamento

---

#### B2. TOP Products - Esempi Concreti

**Domanda**:
> "Elenca i 3-5 **prodotti** più importanti del vostro portfolio (per revenue o strategia)"

**Tipo**: Form ripetuto (max 5)

Per ogni prodotto:

```
Nome prodotto: _______________
Categoria/Tipo: _______________
  (es: "CRM Platform", "Analytics Tool", "Mobile App", "Hardware Device")

Breve descrizione (1 frase):
_______________________________________________

Modello di pricing:
 □ Subscription (SaaS)
 □ Perpetual license
 □ Usage-based
 □ Transaction fee
 □ One-time purchase
 □ Freemium
 □ Other: ___

Target customer:
 □ Enterprise
 □ SMB
 □ Prosumer
 □ Mass market
```

**Perché è CRITICO**:
- **RAG TRAINING**: Questi esempi vengono usati per addestrare il RAG
- **Terminology Learning**: Impariamo il vostro linguaggio specifico
- **Classification Baseline**: Esempi gold standard per product recognition
- **Schema Pre-filling**: Possiamo pre-compilare categorie comuni

**Esempio Output**:
```json
{
  "top_products": [
    {
      "name": "Salesforce Sales Cloud",
      "category": "CRM Platform",
      "description": "Enterprise CRM for sales teams with AI-powered insights",
      "pricing_model": "subscription",
      "target": "enterprise"
    },
    {
      "name": "Einstein AI",
      "category": "AI Analytics Tool",
      "description": "Predictive analytics and automation for CRM data",
      "pricing_model": "usage_based",
      "target": "enterprise"
    }
  ]
}
```

---

#### B3. Service Portfolio Overview

**Domanda**:
> "Quanti **servizi** distinti offrite attualmente?"

**Tipo**: Numero + classificazione

**Input numerico**: ___ servizi

**+ Breakdown per tipo**:
- Managed Services (ongoing, 24/7): ___
- Professional Services (project-based): ___
- Support/Maintenance: ___
- Consulting/Advisory: ___
- Training/Education: ___
- Implementation Services: ___

**Perché è importante**:
- Services hanno struttura diversa da products
- Tipo di servizio influenza schema fields richiesti (SLA per managed, SOW per professional)

---

#### B4. TOP Services - Esempi Concreti

**Domanda**:
> "Elenca i 3-5 **servizi** più importanti (per revenue o strategia)"

**Tipo**: Form ripetuto (max 5)

Per ogni servizio:

```
Nome servizio: _______________
Tipo di servizio:
 □ Managed Service (ongoing, subscription)
 □ Professional Service (project, one-time)
 □ Support/Helpdesk (ticket-based)
 □ Consulting (advisory, time & materials)
 □ Training (education, certification)
 □ Implementation (onboarding, setup)

Breve descrizione (1 frase):
_______________________________________________

Delivery model:
 □ Fully managed (we do everything)
 □ Co-managed (shared responsibility)
 □ Advisory only (guidance/consulting)
 □ On-site delivery
 □ Fully remote
 □ Hybrid

SLA committment:
 □ 99.9%+ uptime guarantee
 □ Response time SLA (< 1hr, < 4hr, < 24hr)
 □ No formal SLA
 □ Custom SLA per client
```

**Perché è CRITICO**:
- **RAG TRAINING**: Esempi di servizi per classification
- **SLA Vocabulary**: Impariamo i vostri commitment types
- **Delivery Model**: Critico per schema validation
- **Service vs Product Boundary**: Alcuni hybrid cases (SaaS con managed service component)

---

### SEZIONE C: STRATEGIA E PRIORITÀ (Perché e Come)

**Obiettivo**: Context per Q&A generation e recommendations

#### C1. Obiettivi Strategici 2025-2027

**Domanda**:
> "Quali sono i vostri TOP 3 obiettivi strategici per i prossimi 2-3 anni?"

**Tipo**: Multiple selection + ranking

**Opzioni** (seleziona e ordina per priorità):
- [ ] Growth - Crescita revenue e market share
- [ ] Innovation - Lanciare nuovi prodotti/servizi
- [ ] Operational Excellence - Efficienza e costi
- [ ] Digital Transformation - Modernizzazione tech stack
- [ ] Customer Experience - NPS e retention
- [ ] Market Expansion - Nuovi mercati geografici o verticali
- [ ] M&A - Acquisizioni o consolidamento
- [ ] Sustainability - ESG e impatto sociale
- [ ] Platform Strategy - Da prodotti a platform/ecosystem
- [ ] Altro: _______________

**+ Campo aperto**: "Descrivi brevemente la vostra visione strategica (2-3 frasi)"

**Perché è importante**:
- Strategic focus influenza quali products/services prioritizzare
- Innovation-focused companies hanno più beta products
- Q&A agent può generare domande allineate alla strategia
- Recommendations personalizzate

---

#### C2. Criteri di Prioritizzazione Portfolio

**Domanda**:
> "Come decidete quali prodotti/servizi prioritizzare o sunsettare?"

**Tipo**: Multiple selection + peso

Per ogni criterio, indica il peso (1-5):

```
ROI / Financial Return          [1] [2] [3] [4] [5]
Strategic Alignment             [1] [2] [3] [4] [5]
Market Size / TAM               [1] [2] [3] [4] [5]
Competitive Advantage           [1] [2] [3] [4] [5]
Customer Demand / NPS           [1] [2] [3] [4] [5]
Innovation / Technology Fit     [1] [2] [3] [4] [5]
Resource Availability           [1] [2] [3] [4] [5]
Risk / Compliance               [1] [2] [3] [4] [5]
Time to Market                  [1] [2] [3] [4] [5]
```

**Perché è importante**:
- Completeness scoring può essere pesato sui vostri criteri
- Q&A focus su fields rilevanti per voi
- Portfolio assessment recommendations allineate

---

#### C3. Pain Points Operativi

**Domanda**:
> "Qual è la vostra sfida principale nella gestione del portfolio prodotti/servizi?"

**Tipo**: Multiple choice + dettaglio

**Opzioni**:
- Manca visibilità completa su tutto il portfolio
- Decisioni prese senza dati (gut feeling)
- Troppi prodotti/servizi, portfolio bloat
- Non sappiamo quali sono profittevoli
- Difficoltà a prioritizzare investimenti
- Silos tra team, dati frammentati
- Compliance e audit trail mancanti
- Time-to-market troppo lungo
- Cannibalizzazione tra prodotti
- Sunset decisions difficili (attachment emotivo)
- Altro: _______________

**+ Campo aperto**: "Descrivi il problema in dettaglio"

**Perché è importante**:
- Q&A agent può focalizzarsi su raccogliere dati per risolvere questo pain
- Recommendations mirate
- Feature prioritization in THEMIS

---

#### C4. Governance e Decision Making

**Domanda**:
> "Come vengono prese le decisioni sul portfolio?"

**Tipo**: Multiple choice

**Opzioni**:
- CEO/Founder decide tutto (centralizzato)
- Executive Committee con portfolio reviews trimestrali
- Product Council con stakeholders cross-funzionali
- Business Unit autonome (decentralizzato)
- Data-driven con KPI dashboard e thresholds
- Approval matrix basata su investment size
- Agile/dynamic, continuous reprioritization
- Ad-hoc, caso per caso
- Altro: _______________

**Perché è importante**:
- Influenza granularità dati richiesti
- Processo di approval definisce workflow THEMIS
- Governance model suggerisce RLS policies

---

#### C5. Success Metrics e KPI Framework

**Domanda**:
> "Quali metriche usate per misurare il successo di un prodotto/servizio?"

**Tipo**: Multiple selection

**Opzioni** (seleziona tutte le rilevanti):
- [ ] Revenue / ARR / MRR
- [ ] Profitability / Gross Margin
- [ ] Market Share
- [ ] Customer Acquisition Cost (CAC)
- [ ] Lifetime Value (LTV)
- [ ] Net Promoter Score (NPS)
- [ ] Customer Retention / Churn
- [ ] Time to Market / Velocity
- [ ] Innovation Index / % revenue da new products
- [ ] Strategic Alignment Score
- [ ] Resource Utilization
- [ ] Risk/Compliance Score
- [ ] Altro: _______________

**+ Domanda**: "Avete un dashboard esistente per queste metriche?"
- Sì, dashboard consolidato (tool: ___)
- Parziale, alcuni team hanno dashboard
- No, report manuali
- No, tracking inconsistente

**Perché è importante**:
- KPI framework allineato con schema fields
- Integration con existing dashboards
- Validation rules per dati inseriti

---

### SEZIONE D: THEMIS ONBOARDING (Contexto Specifico)

#### D1. Scope del Censimento Iniziale

**Domanda**:
> "Cosa volete censire inizialmente in THEMIS?"

**Tipo**: Multiple selection + priorità

**Opzioni**:
- [ ] Solo prodotti (software, hardware, beni)
- [ ] Solo servizi (managed, professional, support)
- [ ] Mix prodotti + servizi
- [ ] Anche progetti/iniziative in corso
- [ ] Innovation pipeline (future products)
- [ ] Sunset candidates (prodotti da dismettere)

**+ Stima**: "Quanti item pensate di censire nel primo mese?"
- < 10
- 10-50
- 50-100
- 100-500
- > 500

**Perché è importante**:
- Calibra aspettative sistema
- Influenza onboarding UX
- Priorità feature development

---

#### D2. Data Sources e Integrations

**Domanda**:
> "Da dove arrivano attualmente i dati su prodotti/servizi?"

**Tipo**: Multiple selection

**Opzioni**:
- [ ] Excel/Google Sheets sparsi
- [ ] CRM (Salesforce, HubSpot, etc.)
- [ ] Product Management tool (Jira, Aha, Productboard)
- [ ] Financial system (ERP, accounting)
- [ ] Project Management (Asana, Monday, MS Project)
- [ ] Custom database/application
- [ ] Slide decks e presentazioni
- [ ] Tribal knowledge (nella testa delle persone)
- [ ] Altro: _______________

**Perché è importante**:
- Integration requirements
- Data extraction/migration planning
- API priorities

---

## Come Questi Dati Alimentano il Sistema

### 1. RAG Training Personalizzato

```javascript
// After assessment completion
const assessmentData = {
  industry: "Financial Services",
  topProducts: [
    { name: "Corporate Banking Platform", category: "Core Banking", ... },
    { name: "Mobile Banking App", category: "Digital Banking", ... }
  ],
  topServices: [
    { name: "24/7 Transaction Monitoring", type: "managed_service", ... }
  ]
};

// Create custom RAG catalog from assessment
await bootstrapCustomRAG(TENANT_ID, {
  industry_context: assessmentData.industry,
  example_products: assessmentData.topProducts,
  example_services: assessmentData.topServices,
  terminology: extractTerminology(assessmentData),
  business_model: assessmentData.businessModel
});

// Now RAG can recognize "Corporate Banking Platform" as product
// and "24/7 Transaction Monitoring" as managed service
```

### 2. Schema Pre-filling Intelligente

```javascript
// When user uploads portfolio data
const extractedItem = {
  name: "Wealth Management Portal"
};

// System can infer based on assessment:
const enriched = await enrichWithAssessmentContext(extractedItem, assessmentData);

// Result:
{
  name: "Wealth Management Portal",
  category_prodotto: "Digital Banking",  // inferred from industry + examples
  tipo_offerta: "saas",  // inferred from business model
  linea_di_business: "Financial Services",  // from assessment
  target: {
    company_size: ["enterprise"],  // from assessment scale
    industries: ["Financial Services"]
  }
}
```

### 3. Q&A Generation Contestuale

```javascript
// Generate questions based on assessment strategy
const qa = await generateQuestions({
  item_type: 'product',
  item_name: 'Wealth Management Portal',
  current_data: partialProduct,

  // Context from assessment:
  strategic_focus: assessmentData.strategicGoals,  // ["Growth", "Innovation"]
  priority_criteria: assessmentData.prioritization,  // { roi: 5, strategic_alignment: 5 }
  pain_points: assessmentData.painPoints,  // "Manca visibilità completa"

  language: 'it'
});

// Generated questions are STRATEGIC:
// "Qual è il ROI atteso per Wealth Management Portal nei prossimi 12 mesi?"
// "Come si allinea questo prodotto con l'obiettivo di crescita del 2025?"
```

### 4. Recommendations Personalizzate

```javascript
// Portfolio analysis with assessment context
const recommendations = await analyzePortfolio(portfolioItems, {
  assessment: assessmentData,
  criteria: assessmentData.prioritization,
  goals: assessmentData.strategicGoals
});

// Recommendations are SPECIFIC:
// "Prioritize 'Mobile Banking App' - aligns with Digital Transformation goal and has high ROI score"
// "Consider sunsetting 'Legacy ATM Software' - low strategic alignment, high maintenance cost"
```

---

## Implementation Roadmap

### Phase 1: Enhanced Assessment Agent (Week 1)

- [ ] Update `assessmentAgent.ts` with new questions
- [ ] Create `strateg-assessment-prompt.md`
- [ ] Update schema to include all new fields
- [ ] Add validation for nested objects (top products/services)

### Phase 2: RAG Custom Training (Week 2)

- [ ] Extract terminology from assessment answers
- [ ] Create tenant-specific RAG catalog from examples
- [ ] Bootstrap RAG with industry + company context
- [ ] Test classification accuracy improvement

### Phase 3: Schema Enrichment (Week 2-3)

- [ ] Build inference engine from assessment → schema
- [ ] Auto-fill known fields based on industry/business model
- [ ] Reduce Q&A burden by 40-50%

### Phase 4: Strategic Q&A (Week 3-4)

- [ ] Enhance Q&A agent with strategic context
- [ ] Generate questions aligned with goals/criteria
- [ ] Priority weighting based on assessment

---

## Success Metrics

**Before (Current Assessment)**:
- Classifies company maturity ✓
- Generic recommendations ✓
- No product/service context ✗
- RAG accuracy: ~85% ✗

**After (Strategic Assessment)**:
- Classifies company maturity ✓
- Strategic recommendations aligned with goals ✓
- Rich product/service examples for RAG ✓
- Industry-specific terminology ✓
- RAG accuracy: **>95%** ✓
- Schema pre-filling: **40-50% fields** ✓
- Q&A questions reduced by: **30-40%** ✓

---

## Esempio Completo di Flow

```
USER COMPLETES ASSESSMENT
├─ Industry: Financial Services
├─ Business Model: B2B Enterprise, 70% Products / 30% Services
├─ Top Products:
│   1. "Corporate Banking Platform" (Core Banking, SaaS, Enterprise)
│   2. "Fraud Detection AI" (Security Tool, Usage-based, Enterprise)
│   3. "Mobile Banking App" (Digital Banking, Freemium, Mass market)
├─ Top Services:
│   1. "24/7 SOC Monitoring" (Managed Service, Fully managed, 99.9% SLA)
│   2. "Digital Transformation Consulting" (Professional Service, Advisory, On-site)
├─ Strategic Goals: [Growth, Innovation, Customer Experience]
├─ Prioritization: ROI=5, Strategic Alignment=5, Customer Demand=4
└─ Pain Point: "Manca visibilità completa su portfolio, decisioni gut-feel"

SYSTEM PROCESSES ASSESSMENT
├─ Creates custom RAG catalog with Financial Services terminology
├─ Adds 5 example products + 2 services to reference catalog
├─ Sets tenant preferences: focus on ROI, Strategic Alignment
└─ Generates company profile for schema inference

USER UPLOADS PORTFOLIO DOCUMENT
├─ Document mentions: "Trade Finance Solution"
├─ RAG classifies: PRODUCT (96% confidence)
│   └─ Reasoning: Similar to "Corporate Banking Platform", financial services context
├─ Schema auto-fills:
│   - categoria_prodotto: "Trade Finance" (inferred from industry)
│   - linea_di_business: "Financial Services"
│   - tipo_offerta: "saas" (inferred from business model)
│   - target: { company_size: ["enterprise"] }
└─ Completeness: 45%

Q&A AGENT GENERATES STRATEGIC QUESTIONS
├─ Question 1: "Qual è il ROI previsto per Trade Finance Solution nel 2025?"
│   └─ Context: From assessment - ROI è criterio priorità massima
├─ Question 2: "Come si allinea questo prodotto con l'obiettivo di crescita?"
│   └─ Context: From assessment - Growth è strategic goal #1
└─ Question 3: "Quali metriche Customer Experience traccia Trade Finance Solution?"
    └─ Context: From assessment - CX è strategic goal #3

USER ANSWERS QUESTIONS
└─ System updates schema, completeness → 85%

PORTFOLIO ANALYSIS
└─ Recommendation: "Trade Finance Solution has HIGH strategic priority:
    ✓ ROI above threshold (12% vs 10% target)
    ✓ Strongly aligned with Growth goal
    ✓ Good CX metrics (NPS 45)
    → Suggested action: Increase investment by 20%"
```

---

## Conclusion

Il nuovo **Strategic Assessment** trasforma l'onboarding da un semplice questionario di maturità PPM a un **strategic profiling system** che:

1. **Alimenta il RAG** con esempi concreti del cliente
2. **Riduce il data entry burden** con auto-filling intelligente
3. **Genera Q&A contestuali** allineate con strategia aziendale
4. **Produce recommendations actionable** basate su obiettivi reali

**Risultato**: Sistema che "conosce" il cliente dal giorno 1 e si adatta al suo linguaggio, settore e priorità.
