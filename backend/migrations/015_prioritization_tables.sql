-- Migration 015: Portfolio Prioritization Tables
-- Tabelle per il Portfolio Prioritization Agent

-- ============================================
-- TABELLA PRINCIPALE: portfolio_prioritizations
-- Memorizza i risultati delle prioritizzazioni
-- ============================================

CREATE TABLE IF NOT EXISTS portfolio_prioritizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  company_id UUID,

  -- Risultati triage (MoSCoW classification)
  triage_results JSONB NOT NULL DEFAULT '[]',
  -- Formato: [{ itemId, category, confidence, reasoning, keySignals }]

  triage_breakdown JSONB DEFAULT '{"MUST": 0, "SHOULD": 0, "COULD": 0, "WONT": 0, "UNKNOWN": 0}',

  -- Scores dettagliati per ogni item
  scoring_results JSONB NOT NULL DEFAULT '[]',
  -- Formato: [{ itemId, overallScore, wsjfScore, iceScore, retentionIndex, moscow, recommendation }]

  -- Portfolio ottimizzato
  optimization_results JSONB DEFAULT '{}',
  -- Formato: { selectedItems, deferredItems, eliminationCandidates, metrics, scenarios }

  -- Configurazione usata per questa prioritizzazione
  config JSONB NOT NULL DEFAULT '{}',
  -- Formato: { triageConfig, scoringConfig, optimizationConfig }

  -- Contesto strategico usato
  strategic_context JSONB DEFAULT '{}',
  -- Formato: { goals, budgetLevel, industry, maturityLevel }

  -- Pattern appresi applicati
  patterns_applied JSONB DEFAULT '[]',
  -- Array di pattern IDs applicati

  -- Statistiche
  items_count INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER,
  model_version VARCHAR(50),
  confidence_score DECIMAL(5,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_prioritizations_tenant
  ON portfolio_prioritizations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_prioritizations_company
  ON portfolio_prioritizations(company_id);

CREATE INDEX IF NOT EXISTS idx_prioritizations_created
  ON portfolio_prioritizations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prioritizations_tenant_created
  ON portfolio_prioritizations(tenant_id, created_at DESC);

-- ============================================
-- TABELLA FEEDBACK: prioritization_feedback
-- Registra le correzioni degli utenti per il learning
-- ============================================

CREATE TABLE IF NOT EXISTS prioritization_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  prioritization_id UUID REFERENCES portfolio_prioritizations(id) ON DELETE SET NULL,

  -- Item corretto
  item_id UUID NOT NULL,
  item_name VARCHAR(255),

  -- Valori originali (pre-correzione)
  original_category VARCHAR(20),  -- MUST, SHOULD, COULD, WONT
  original_score DECIMAL(5,2),
  original_moscow VARCHAR(20),    -- must_have, should_have, etc.
  original_recommendation VARCHAR(20),  -- invest, maintain, optimize, eliminate

  -- Correzioni utente
  user_category VARCHAR(20),
  user_score DECIMAL(5,2),
  user_moscow VARCHAR(20),
  user_recommendation VARCHAR(20),
  user_reasoning TEXT,

  -- Tipo di correzione
  correction_type VARCHAR(20) NOT NULL,  -- category, score, moscow, recommendation, multiple

  -- Features dell'item al momento della correzione (per pattern learning)
  item_features JSONB DEFAULT '{}',
  -- Formato: { type, category, tags, businessValue, riskLevel, etc. }

  -- Metadati
  user_id UUID NOT NULL,
  source VARCHAR(50) DEFAULT 'ui',  -- ui, api, batch

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per pattern analysis
CREATE INDEX IF NOT EXISTS idx_feedback_tenant
  ON prioritization_feedback(tenant_id);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_created
  ON prioritization_feedback(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_correction_type
  ON prioritization_feedback(tenant_id, correction_type);

CREATE INDEX IF NOT EXISTS idx_feedback_item_features
  ON prioritization_feedback USING GIN(item_features);

-- ============================================
-- TABELLA PATTERNS: learned_prioritization_patterns
-- Pattern appresi dalle correzioni per migliorare le predizioni
-- ============================================

CREATE TABLE IF NOT EXISTS learned_prioritization_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Nome descrittivo del pattern
  pattern_name VARCHAR(255),

  -- Condizioni che attivano il pattern
  pattern_conditions JSONB NOT NULL,
  -- Formato: [{ field, operator, value }]
  -- Esempio: [{ "field": "lifecycle", "operator": "eq", "value": "end_of_life" }]

  -- Aggiustamento da applicare quando il pattern matcha
  score_adjustment JSONB NOT NULL,
  -- Formato: { type: "multiply"|"add"|"override", target: "overall"|"category", value: ... }
  -- Esempio: { "type": "override", "target": "category", "value": "COULD" }

  -- Metriche del pattern
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,  -- 0.00 - 1.00
  support_count INTEGER NOT NULL DEFAULT 0,       -- Quante volte è stato confermato
  hit_count INTEGER NOT NULL DEFAULT 0,           -- Quante volte è stato applicato
  accuracy DECIMAL(3,2),                          -- Accuratezza delle predizioni

  -- Stato
  active BOOLEAN DEFAULT true,
  auto_generated BOOLEAN DEFAULT true,  -- true = generato automaticamente, false = creato manualmente

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ  -- Pattern può scadere se non usato
);

-- Indici per pattern matching
CREATE INDEX IF NOT EXISTS idx_patterns_tenant_active
  ON learned_prioritization_patterns(tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_patterns_confidence
  ON learned_prioritization_patterns(tenant_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_patterns_conditions
  ON learned_prioritization_patterns USING GIN(pattern_conditions);

-- ============================================
-- FUNZIONE: Trigger per updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_prioritization_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger per portfolio_prioritizations
DROP TRIGGER IF EXISTS trg_prioritizations_updated_at ON portfolio_prioritizations;
CREATE TRIGGER trg_prioritizations_updated_at
  BEFORE UPDATE ON portfolio_prioritizations
  FOR EACH ROW
  EXECUTE FUNCTION update_prioritization_updated_at();

-- Trigger per learned_prioritization_patterns
DROP TRIGGER IF EXISTS trg_patterns_updated_at ON learned_prioritization_patterns;
CREATE TRIGGER trg_patterns_updated_at
  BEFORE UPDATE ON learned_prioritization_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_prioritization_updated_at();

-- ============================================
-- VISTA: Statistiche prioritizzazioni per tenant
-- ============================================

CREATE OR REPLACE VIEW prioritization_stats AS
SELECT
  p.tenant_id,
  COUNT(DISTINCT p.id) as total_prioritizations,
  AVG(p.items_count) as avg_items_per_run,
  AVG(p.processing_time_ms) as avg_processing_time_ms,
  AVG(p.confidence_score) as avg_confidence,
  COUNT(DISTINCT f.id) as total_feedback,
  COUNT(DISTINCT lp.id) FILTER (WHERE lp.active = true) as active_patterns,
  MAX(p.created_at) as last_prioritization_at
FROM portfolio_prioritizations p
LEFT JOIN prioritization_feedback f ON f.tenant_id = p.tenant_id
LEFT JOIN learned_prioritization_patterns lp ON lp.tenant_id = p.tenant_id
GROUP BY p.tenant_id;

-- ============================================
-- COMMENTI
-- ============================================

COMMENT ON TABLE portfolio_prioritizations IS
  'Risultati delle prioritizzazioni portfolio - MoSCoW, WSJF, ICE scores';

COMMENT ON TABLE prioritization_feedback IS
  'Correzioni utente alle prioritizzazioni per continuous learning';

COMMENT ON TABLE learned_prioritization_patterns IS
  'Pattern appresi automaticamente dalle correzioni utente';

COMMENT ON COLUMN portfolio_prioritizations.triage_results IS
  'Array JSON con risultati MoSCoW per ogni item';

COMMENT ON COLUMN portfolio_prioritizations.scoring_results IS
  'Array JSON con scores multi-criterio (WSJF, ICE, Retention) per ogni item';

COMMENT ON COLUMN learned_prioritization_patterns.pattern_conditions IS
  'Condizioni JSON che devono essere tutte vere per attivare il pattern';

COMMENT ON COLUMN learned_prioritization_patterns.score_adjustment IS
  'Modifica da applicare quando il pattern matcha (multiply, add, override)';
