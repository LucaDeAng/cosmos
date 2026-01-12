# THEMIS - Service Blueprint

## Overview

Questa Service Blueprint documenta il funzionamento end-to-end di Themis, distinguendo i flussi per **New Joiner** e **Utente Registrato**.

---

## Legenda

| Simbolo | Significato |
|---------|-------------|
| `[User]` | Azione dell'utente |
| `[FE]` | Frontend (Next.js) |
| `[BE]` | Backend (Express) |
| `[Agent]` | Agente AI |
| `[DB]` | Database (Supabase) |
| `---` | Line of Visibility |
| `===` | Line of Internal Interaction |

---

## 1. FLUSSO NEW JOINER (Nuovo Utente)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CUSTOMER JOURNEY                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [1. DISCOVERY]        [2. REGISTER]         [3. WELCOME]          [4. ASSESSMENT]        [5. DASHBOARD]       │
│                                                                                                                  │
│   Visita Landing   →   Compila Form 3-step  →  Tour Features   →   Questionario IT    →   Accede Dashboard      │
│   Page                 (Profile/Password/      (4 slides)          Maturity               con profilo           │
│                        Company)                                                           strategico            │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           FRONTSTAGE (Visible)                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [FE] /                [FE] /register          [FE] /welcome        [FE] /onboarding/     [FE] /dashboard       │
│   Landing Page          RegistrationForm        WelcomeCarousel      assessment            UnifiedDashboard      │
│   • Hero section        • Step 1: Profile       • Slide 1: Intro     AssessmentForm        • StrategicProfile   │
│   • Features            • Step 2: Password      • Slide 2: Upload    • 10+ domande         • WorkflowProgress   │
│   • Pricing             • Step 3: Company       • Slide 3: AI        • Scelte multiple     • Portfolio Stats    │
│   • CTA Register        • Social Login          • Slide 4: Results   • Cluster preview     • Latest Items       │
│                         (Google/GitHub)                                                     • Quick Actions      │
│                                                                                                                  │
│   Components:           Components:             Components:          Components:            Components:          │
│   • HeroSection         • ProfileStep           • CarouselSlide      • QuestionCard         • DashboardCard     │
│   • FeatureGrid         • PasswordStep          • ProgressDots       • ProgressBar          • StatWidget        │
│   • PricingTable        • CompanyStep           • SkipButton         • ClusterPreview       • InitiativeList    │
│                         • SocialLoginBtn                             • SubmitBtn            • WorkflowTracker   │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ LINE OF VISIBILITY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           BACKSTAGE (Not Visible)                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [BE] Static           [BE] /api/auth/         [BE] -               [BE] /api/assessment   [BE] /api/flow/     │
│   -                     register                 (Client-side only)  POST /                 status/:companyId   │
│                         • Validate email                              • Save answers                             │
│                         • Hash password                               • Route to Agent       [BE] /api/portfolio │
│                         • Create user                                                        /stats/:companyId   │
│                         • Create company                                                                         │
│                         • Generate JWT                                                                           │
│                         • Send verify email                                                                      │
│                                                                                                                  │
│   Services:             Services:               Services:            Services:              Services:            │
│   -                     • AuthService           -                    • AssessmentService    • FlowService       │
│                         • EmailService                               • OrchestatorService   • PortfolioService  │
│                         • CompanyService                                                    • CompanyService    │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═│═ ═ ═ ═ LINE OF INTERNAL INTERACTION ═ ═ ═ ═ ═ ═ ═ ═ ═
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPPORT PROCESSES                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [DB] -                [DB] users              [DB] -               [Agent] CLIENT_        [DB] company_       │
│                         • INSERT user                                ASSESSMENT             assessments          │
│                         [DB] companies                               (GPT-4o-mini)          • ai_cluster        │
│                         • INSERT company                             • Analizza risposte    • ai_profile        │
│                         [DB] user_sessions                           • Determina cluster    • ai_recommendations│
│                         • INSERT session                             • Genera profilo       [DB] snapshots      │
│                                                                      • Suggerimenti         • assessment_data   │
│                                                                                                                  │
│   Clusters Output:                                                                                               │
│   • ppm_starter → ppm_optimized                                                                                  │
│   • innovation_lab                                                                                               │
│   • service_catalog                                                                                              │
│   • product_portfolio                                                                                            │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FLUSSO UTENTE REGISTRATO (Return Visit)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CUSTOMER JOURNEY                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [1. LOGIN]           [2. DASHBOARD]          [3. RESUME WORKFLOW]                                              │
│                                                                                                                  │
│   Email + Password  →  Visualizza progresso  →  Continua dallo step incompleto                                  │
│   o Social Login       e statistiche            (Portfolio/Roadmap/Budget/Strategy)                             │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           FRONTSTAGE (Visible)                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [FE] /login           [FE] /dashboard                              [FE] Next Step Route                       │
│   LoginForm             UnifiedDashboard                             (Determinato dal workflow)                  │
│   • Email field         • Company Profile Card                                                                   │
│   • Password field      • Workflow Progress (6 steps)                                                            │
│   • Remember me         • Portfolio Statistics                                                                   │
│   • Forgot password     • Latest Initiatives                                                                     │
│   • Social buttons      • "Continue" CTA button                                                                  │
│                                                                                                                  │
│   State:                State:                                       State:                                      │
│   • authStore.login()   • authStore.user                             • flowStatus.currentStep                   │
│   • setToken()          • flowStatus                                 • nextAvailableAction                      │
│   • setUser()           • portfolioStats                                                                         │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ LINE OF VISIBILITY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           BACKSTAGE (Not Visible)                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [BE] /api/auth/       [BE] Multiple Endpoints                      [BE] /api/flow/                            │
│   login                                                              next-step/:companyId                       │
│   • Validate creds      GET /api/flow/status/:companyId                                                          │
│   • Check active        GET /api/portfolio/stats/:companyId          Returns:                                   │
│   • Issue JWT           GET /api/company/profile                     • nextStep: string                         │
│   • Log session         GET /api/assessment/:companyId               • route: string                            │
│                                                                      • isComplete: boolean                      │
│   Security:             Aggregation:                                                                             │
│   • bcrypt verify       • Parallel API calls                                                                     │
│   • JWT 7-day expiry    • State composition                                                                      │
│   • Rate limiting                                                                                                │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═│═ ═ ═ ═ LINE OF INTERNAL INTERACTION ═ ═ ═ ═ ═ ═ ═ ═ ═
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPPORT PROCESSES                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [DB] users            [DB] Multiple Tables                         [DB] Workflow State                        │
│   • SELECT user         • company_assessments                        • companies.onboarding_step                │
│   [DB] user_sessions    • initiatives                                • Derived from data presence               │
│   • INSERT session      • products                                                                               │
│   • UPDATE last_login   • services                                                                               │
│                         • portfolio_assessments                                                                  │
│                         • roadmaps                                                                               │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. WORKFLOW COMPLETO (6 Steps)

### Step Sequence Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                                 │
│     STEP 1              STEP 2               STEP 3              STEP 4             STEP 5            STEP 6   │
│  ┌──────────┐        ┌──────────┐         ┌──────────┐        ┌──────────┐       ┌──────────┐      ┌──────────┐│
│  │ IT       │   →    │Portfolio │    →    │Portfolio │   →    │Roadmap   │  →    │Budget    │  →   │Strategy  ││
│  │Assessment│        │Creation  │         │Assessment│        │Generator │       │Optimizer │      │Advisor   ││
│  └──────────┘        └──────────┘         └──────────┘        └──────────┘       └──────────┘      └──────────┘│
│       │                   │                    │                   │                  │                 │      │
│       ▼                   ▼                    ▼                   ▼                  ▼                 ▼      │
│  ┌──────────┐        ┌──────────┐         ┌──────────┐        ┌──────────┐       ┌──────────┐      ┌──────────┐│
│  │CLIENT_   │        │DOCUMENT_ │         │PORTFOLIO_│        │ROADMAP_  │       │BUDGET_   │      │STRATEGY_ ││
│  │ASSESSMENT│        │EXTRACTION│         │ASSESSMENT│        │GENERATOR │       │OPTIMIZER │      │ADVISOR   ││
│  │Agent     │        │Agent     │         │Agent     │        │Agent     │       │Agent     │      │Agent     ││
│  └──────────┘        └──────────┘         └──────────┘        └──────────┘       └──────────┘      └──────────┘│
│       │                   │                    │                   │                  │                 │      │
│       ▼                   ▼                    ▼                   ▼                  ▼                 ▼      │
│  ┌──────────┐        ┌──────────┐         ┌──────────┐        ┌──────────┐       ┌──────────┐      ┌──────────┐│
│  │company_  │        │initiatives│        │portfolio_│        │roadmaps  │       │budget_   │      │strategy_ ││
│  │assessments│       │products  │         │assessments│       │          │       │optimizat.│      │analyses  ││
│  │          │        │services  │         │          │        │          │       │          │      │          ││
│  └──────────┘        └──────────┘         └──────────┘        └──────────┘       └──────────┘      └──────────┘│
│                                                                                                                 │
│  Prerequisiti:       Prerequisiti:        Prerequisiti:        Prerequisiti:      Prerequisiti:    Prerequisiti│
│  - Nessuno           - Step 1             - Step 1, 2          - Step 1, 2, 3     - Step 2, 3      - Step 2, 3 │
│                                                                                                                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. DETTAGLIO STEP 2: Portfolio Ingestion

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CUSTOMER ACTIONS                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [A] Upload File      [B] Review Items        [C] Validate          [D] Confirm                                │
│                                                                                                                  │
│   Drag & drop o        Visualizza items       Corregge errori       Salva portfolio                            │
│   seleziona file       estratti dall'AI       o dati mancanti       definitivo                                  │
│   (PDF/Excel/CSV)                                                                                               │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           FRONTSTAGE                                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [FE] /portfolio/ingestion                                                                                      │
│                                                                                                                  │
│   AdvancedIngestionUploader                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐       │
│   │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │       │
│   │  │  Drop Zone      │ →  │  Parsing        │ →  │  Review Table   │ →  │  Confirmation   │          │       │
│   │  │                 │    │  Progress       │    │                 │    │                 │          │       │
│   │  │  PDF, XLSX,     │    │  [====    ] 60% │    │  ☑ Init 1       │    │  ✓ 12 items    │          │       │
│   │  │  CSV, JSON      │    │                 │    │  ☑ Init 2       │    │  saved          │          │       │
│   │  │                 │    │  Extracting...  │    │  ☐ Init 3 ⚠     │    │                 │          │       │
│   │  └─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘          │       │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ LINE OF VISIBILITY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           BACKSTAGE                                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [BE] /api/files/upload                      [BE] /api/portfolio/items                                         │
│   • Multer middleware                         • CRUD operations                                                  │
│   • File validation                           • Batch insert                                                     │
│   • Temp storage                              • Validation rules                                                 │
│                                                                                                                  │
│   [BE] /api/orchestrator                                                                                         │
│   • Route to DOCUMENT_EXTRACTION                                                                                 │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═│═ ═ ═ ═ LINE OF INTERNAL INTERACTION ═ ═ ═ ═ ═ ═ ═ ═ ═
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPPORT PROCESSES                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   DATA INGESTION ORCHESTRATOR                                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐       │
│   │                                                                                                      │       │
│   │   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────────┐              │       │
│   │   │ File Parser   │  →  │ DOCUMENT_     │  →  │ Item          │  →  │ Normalizer    │              │       │
│   │   │               │     │ EXTRACTION    │     │ Validator     │     │ Agent         │              │       │
│   │   │ • excelParser │     │ Agent         │     │               │     │               │              │       │
│   │   │ • pdfParser   │     │ (GPT-4o-mini) │     │ • Schema      │     │ • Standardize │              │       │
│   │   │ • textParser  │     │               │     │ • Required    │     │ • Enrich      │              │       │
│   │   │               │     │ • NLP extract │     │ • Format      │     │ • Categorize  │              │       │
│   │   └───────────────┘     └───────────────┘     └───────────────┘     └───────────────┘              │       │
│   │                                                                                                      │       │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                                                  │
│   [DB] document_extractions    [DB] initiatives / products / services                                           │
│   • extraction_history         • Normalized items                                                                │
│   • validation_results         • All metadata fields                                                             │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. DETTAGLIO STEP 3: Portfolio Assessment

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CUSTOMER ACTIONS                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [A] Launch Assessment    [B] View Results        [C] Apply Filters      [D] Export/Continue                   │
│                                                                                                                  │
│   Click "Assess           Visualizza ranking      Filtra per tipo,       Esporta report o                       │
│   Portfolio"              e raccomandazioni       status, score          procedi a Roadmap                      │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           FRONTSTAGE                                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [FE] /portfolio/assessment                                                                                     │
│                                                                                                                  │
│   ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐      │
│   │  Portfolio Health Score: 7.2/10                                                                       │      │
│   │  ┌────────────────────────────────────────────────────────────────────────────────────────────────┐  │      │
│   │  │  RANKINGS                                                                                       │  │      │
│   │  │  ┌─────┬─────────────────────┬───────────┬─────────────┬──────────────────────────────────────┐ │  │      │
│   │  │  │ #   │ Item                │ Score     │ Action      │ Rationale                            │ │  │      │
│   │  │  ├─────┼─────────────────────┼───────────┼─────────────┼──────────────────────────────────────┤ │  │      │
│   │  │  │ 1   │ Cloud Migration     │ 9.2       │ ACCELERATE  │ High strategic fit, low risk         │ │  │      │
│   │  │  │ 2   │ CRM Upgrade         │ 8.5       │ KEEP        │ Good ROI, moderate complexity        │ │  │      │
│   │  │  │ 3   │ Legacy System       │ 4.1       │ STOP        │ High cost, low value                 │ │  │      │
│   │  │  └─────┴─────────────────────┴───────────┴─────────────┴──────────────────────────────────────┘ │  │      │
│   │  └────────────────────────────────────────────────────────────────────────────────────────────────┘  │      │
│   └──────────────────────────────────────────────────────────────────────────────────────────────────────┘      │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ LINE OF VISIBILITY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           BACKSTAGE                                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [BE] /api/portfolio/assess (POST)                [BE] /api/portfolio/stream (SSE)                             │
│   • Fetch all portfolio items                       • Real-time assessment progress                              │
│   • Prepare assessment context                      • Streaming results                                          │
│   • Route to Orchestrator                                                                                        │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                          │
═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═ ═│═ ═ ═ ═ LINE OF INTERNAL INTERACTION ═ ═ ═ ═ ═ ═ ═ ═ ═
                                                          │
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPPORT PROCESSES                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   [Agent] PORTFOLIO_ASSESSMENT (GPT-4o-mini)                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐       │
│   │                                                                                                      │       │
│   │   SCORING CRITERIA (Weighted)                                                                        │       │
│   │   ├── Strategic Fit ─────────────────────── 25%                                                      │       │
│   │   ├── Value Delivery ────────────────────── 25%                                                      │       │
│   │   ├── Risk-Adjusted Return ──────────────── 20%                                                      │       │
│   │   ├── Resource Efficiency ───────────────── 15%                                                      │       │
│   │   └── Market Timing ─────────────────────── 15%                                                      │       │
│   │                                                                                                      │       │
│   │   OUTPUT:                                                                                            │       │
│   │   • Item rankings (1 to N)                                                                           │       │
│   │   • Score per item (1-10)                                                                            │       │
│   │   • Action: KEEP | ACCELERATE | PAUSE | STOP                                                         │       │
│   │   • Rationale per item                                                                               │       │
│   │   • Portfolio health metrics                                                                         │       │
│   │                                                                                                      │       │
│   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                                                  │
│   [DB] portfolio_assessments                                                                                     │
│   • assessment_id, tenant_id, company_id                                                                         │
│   • portfolio_type, total_items, assessed_items                                                                  │
│   • portfolio_health (JSONB), result (JSONB)                                                                     │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. AGENT ORCHESTRATION PATTERN

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           ORCHESTRATOR AGENT                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│                                    ┌─────────────────────────┐                                                   │
│                                    │   User Request          │                                                   │
│                                    │   + Context             │                                                   │
│                                    └───────────┬─────────────┘                                                   │
│                                                │                                                                 │
│                                                ▼                                                                 │
│                                    ┌─────────────────────────┐                                                   │
│                                    │   ORCHESTRATOR AGENT    │                                                   │
│                                    │   (GPT-4o-mini)         │                                                   │
│                                    │                         │                                                   │
│                                    │   Decision:             │                                                   │
│                                    │   • call_tool           │                                                   │
│                                    │   • final_answer        │                                                   │
│                                    └───────────┬─────────────┘                                                   │
│                                                │                                                                 │
│                    ┌───────────────────────────┼───────────────────────────┐                                     │
│                    │                           │                           │                                     │
│                    ▼                           ▼                           ▼                                     │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐                          │
│   │  CLIENT_ASSESSMENT     │   │  DOCUMENT_EXTRACTION   │   │  PORTFOLIO_ASSESSMENT  │                          │
│   │  - IT Maturity         │   │  - Parse documents     │   │  - Score & rank        │                          │
│   │  - Cluster assignment  │   │  - Extract items       │   │  - Recommendations     │                          │
│   └────────────────────────┘   └────────────────────────┘   └────────────────────────┘                          │
│                                                                                                                  │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐                          │
│   │  ROADMAP_GENERATOR     │   │  BUDGET_OPTIMIZER      │   │  STRATEGY_ADVISOR      │                          │
│   │  - Phases & timelines  │   │  - Allocation          │   │  - MoSCoW priority     │                          │
│   │  - Dependencies        │   │  - Scenarios           │   │  - Decision matrix     │                          │
│   └────────────────────────┘   └────────────────────────┘   └────────────────────────┘                          │
│                                                                                                                  │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐                          │
│   │  KNOWLEDGE_QA          │   │  INTERACTIVE_QA        │   │  EXPLORER              │                          │
│   │  - RAG queries         │   │  - Multi-turn Q&A      │   │  - Analytics           │                          │
│   └────────────────────────┘   └────────────────────────┘   └────────────────────────┘                          │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. DATABASE SCHEMA OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPABASE POSTGRESQL                                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   AUTHENTICATION & USERS                     PORTFOLIO ITEMS                      AI OUTPUTS                    │
│   ┌─────────────────────┐                    ┌─────────────────────┐              ┌─────────────────────┐       │
│   │ users               │                    │ initiatives         │              │ company_assessments │       │
│   │ ├── id              │                    │ ├── id              │              │ ├── id              │       │
│   │ ├── email           │                    │ ├── tenant_id (FK)  │              │ ├── company_id (FK) │       │
│   │ ├── password_hash   │                    │ ├── name            │              │ ├── answers (JSONB) │       │
│   │ ├── full_name       │                    │ ├── description     │              │ ├── ai_cluster      │       │
│   │ ├── role            │────┐               │ ├── status          │              │ ├── ai_profile      │       │
│   │ ├── company_id (FK) │    │               │ ├── strategic_align │              │ └── ai_recommend    │       │
│   │ └── is_active       │    │               │ ├── business_value  │              └─────────────────────┘       │
│   └─────────────────────┘    │               │ ├── risk_level      │                                            │
│            │                 │               │ └── ...             │              ┌─────────────────────┐       │
│            │                 │               └─────────────────────┘              │ portfolio_assessments│      │
│            ▼                 │                                                    │ ├── id              │       │
│   ┌─────────────────────┐    │               ┌─────────────────────┐              │ ├── tenant_id (FK)  │       │
│   │ user_sessions       │    │               │ products            │              │ ├── portfolio_health│       │
│   │ ├── id              │    │               │ ├── id              │              │ └── result (JSONB)  │       │
│   │ ├── user_id (FK)    │    │               │ ├── tenant_id (FK)  │              └─────────────────────┘       │
│   │ ├── token           │    │               │ ├── lifecycle_stage │                                            │
│   │ ├── expires_at      │    │               │ ├── revenue         │              ┌─────────────────────┐       │
│   │ └── ip_address      │    │               │ └── market_share    │              │ roadmaps            │       │
│   └─────────────────────┘    │               └─────────────────────┘              │ ├── id              │       │
│                              │                                                    │ ├── tenant_id (FK)  │       │
│                              │               ┌─────────────────────┐              │ ├── phases (JSONB)  │       │
│                              │               │ services            │              │ └── total_phases    │       │
│                              │               │ ├── id              │              └─────────────────────┘       │
│                              │               │ ├── tenant_id (FK)  │                                            │
│                              │               │ ├── sla_compliance  │              ┌─────────────────────┐       │
│                              ▼               │ └── utilization_rate│              │ budget_optimizations│       │
│   ┌─────────────────────┐                    └─────────────────────┘              │ ├── id              │       │
│   │ companies           │                                                         │ ├── tenant_id (FK)  │       │
│   │ ├── id              │◄────────────────────────────────────────────────────────│ ├── total_budget    │       │
│   │ ├── name            │                                                         │ └── scenarios       │       │
│   │ ├── domain          │                    ┌─────────────────────┐              └─────────────────────┘       │
│   │ ├── onboarding_step │                    │ document_extractions│                                            │
│   │ └── created_at      │                    │ ├── id              │              ┌─────────────────────┐       │
│   └─────────────────────┘                    │ ├── company_id (FK) │              │ strategy_analyses   │       │
│                                              │ ├── document_name   │              │ ├── id              │       │
│                                              │ ├── extracted_items │              │ ├── tenant_id (FK)  │       │
│                                              │ └── validation_res  │              │ ├── prioritization  │       │
│                                              └─────────────────────┘              │ └── action_items    │       │
│                                                                                   └─────────────────────┘       │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. CONFRONTO: NEW JOINER vs UTENTE REGISTRATO

| Aspetto | New Joiner | Utente Registrato |
|---------|------------|-------------------|
| **Entry Point** | Landing Page `/` | Login `/login` |
| **Prima Azione** | Registrazione 3-step | Inserimento credenziali |
| **Welcome Tour** | Obbligatorio (4 slides) | Skippato |
| **Assessment IT** | Obbligatorio | Gia completato |
| **Dashboard** | Vuoto, solo profilo | Popolato con dati e statistiche |
| **Workflow Progress** | 0% - Step 1 | Varia (0-100%) |
| **Portfolio** | Vuoto | Esistente con items |
| **Agents Attivati** | Solo CLIENT_ASSESSMENT | Tutti quelli necessari |
| **Stato Sessione** | Nuova, JWT appena creato | Esistente o refresh |
| **Company Data** | Appena creata | Esistente con storico |
| **DB Records** | Minimal (user, company, session) | Completo (assessments, items, etc.) |

---

## 9. TECNOLOGIE STACK

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           TECHNOLOGY STACK                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                  │
│   FRONTEND                          BACKEND                           AI & DATA                                 │
│   ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐                   │
│   │ Next.js 14+         │           │ Node.js + Express   │           │ OpenAI GPT-4o-mini  │                   │
│   │ TypeScript          │           │ TypeScript          │           │ Multi-Agent System  │                   │
│   │ Zustand (State)     │   ◄───►   │ Multer (Files)      │   ◄───►   │ RAG Knowledge Base  │                   │
│   │ Tailwind CSS        │           │ JWT + bcrypt        │           │ Self-Improving Loop │                   │
│   │ Framer Motion       │           │ CORS + Helmet       │           │                     │                   │
│   │ Lucide Icons        │           │                     │           │                     │                   │
│   └─────────────────────┘           └─────────────────────┘           └─────────────────────┘                   │
│            │                                   │                                 │                               │
│            └───────────────────────────────────┼─────────────────────────────────┘                               │
│                                                │                                                                 │
│                                                ▼                                                                 │
│                                    ┌─────────────────────┐                                                       │
│                                    │ Supabase            │                                                       │
│                                    │ ├── PostgreSQL      │                                                       │
│                                    │ ├── Row Level Sec.  │                                                       │
│                                    │ └── Realtime        │                                                       │
│                                    └─────────────────────┘                                                       │
│                                                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. METRICHE E MONITORAGGIO

### KPI Tracciati

| Metrica | Descrizione | Fonte |
|---------|-------------|-------|
| User Registrations | Nuove registrazioni | `users` table |
| Assessment Completion Rate | % utenti che completano assessment | `company_assessments` |
| Portfolio Items Count | Numero medio items per company | `initiatives/products/services` |
| Workflow Completion Rate | % utenti che completano tutti i 6 step | `flow/status` API |
| Agent Response Time | Tempo medio risposta agenti | Logs |
| Confidence Score Avg | Score medio confidenza AI | `portfolio_assessments` |

### Self-Improving Agents

```
catalogEnricher     → Arricchisce automaticamente il catalogo
feedbackProcessor   → Impara dal feedback utente
metricsAggregator   → Aggrega metriche performance agenti
patternLearner      → Identifica pattern nei dati
ragOrchestrator     → Gestisce training RAG
syntheticGenerator  → Genera dati sintetici per training
```

---

*Documento generato automaticamente dall'analisi del codebase Themis*
*Ultimo aggiornamento: Dicembre 2024*
