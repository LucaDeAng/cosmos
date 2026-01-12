-- Migration 016: Multi-Sector Enrichment Support
-- Aggiunge supporto per l'arricchimento multi-settore con tracking delle sorgenti
-- e caching delle risposte API esterne

-- ============================================
-- TABELLA: enrichment_metadata
-- Memorizza metadata di enrichment per-field con provenance
-- ============================================

CREATE TABLE IF NOT EXISTS enrichment_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('product', 'service')),

  -- Sector classification
  detected_sector VARCHAR(50) NOT NULL,
  sector_confidence NUMERIC(5,4) NOT NULL CHECK (sector_confidence >= 0 AND sector_confidence <= 1),
  sector_method VARCHAR(20) NOT NULL CHECK (sector_method IN ('keyword', 'semantic', 'hybrid')),

  -- Per-field enrichment sources
  field_sources JSONB NOT NULL DEFAULT '{}',
  -- Formato: { "category": { "source": "open_food_facts", "confidence": 0.92, "enrichedAt": "..." } }

  -- Enrichment session info
  enrichment_session_id UUID,
  sources_queried TEXT[] DEFAULT '{}',
  sources_matched TEXT[] DEFAULT '{}',
  total_processing_time_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_enrichment_metadata_tenant
  ON enrichment_metadata(tenant_id);

CREATE INDEX IF NOT EXISTS idx_enrichment_metadata_item
  ON enrichment_metadata(item_id, item_type);

CREATE INDEX IF NOT EXISTS idx_enrichment_metadata_sector
  ON enrichment_metadata(detected_sector);

CREATE INDEX IF NOT EXISTS idx_enrichment_metadata_session
  ON enrichment_metadata(enrichment_session_id);

CREATE INDEX IF NOT EXISTS idx_enrichment_metadata_field_sources
  ON enrichment_metadata USING GIN(field_sources);

-- ============================================
-- ALTER: Aggiunge colonne sector ai portfolio tables
-- ============================================

-- Portfolio Products
ALTER TABLE portfolio_products
  ADD COLUMN IF NOT EXISTS detected_sector VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sector_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS enrichment_metadata_id UUID REFERENCES enrichment_metadata(id) ON DELETE SET NULL;

-- Portfolio Services
ALTER TABLE portfolio_services
  ADD COLUMN IF NOT EXISTS detected_sector VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sector_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS enrichment_metadata_id UUID REFERENCES enrichment_metadata(id) ON DELETE SET NULL;

-- Indici per sector queries
CREATE INDEX IF NOT EXISTS idx_portfolio_products_sector
  ON portfolio_products(detected_sector);

CREATE INDEX IF NOT EXISTS idx_portfolio_services_sector
  ON portfolio_services(detected_sector);

-- ============================================
-- TABELLA: enrichment_cache
-- Cache two-tier per risposte API esterne
-- ============================================

CREATE TABLE IF NOT EXISTS enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL,
  cache_key VARCHAR(500) NOT NULL,

  -- Cached response
  response_data JSONB NOT NULL,

  -- Cache metadata
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per source + key
  CONSTRAINT unique_cache_entry UNIQUE (source_name, cache_key)
);

-- Indici per cache lookup

-- Indice senza WHERE per compatibilità Supabase/Postgres
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_lookup
  ON enrichment_cache(source_name, cache_key);

CREATE INDEX IF NOT EXISTS idx_enrichment_cache_expiry
  ON enrichment_cache(expires_at);

-- ============================================
-- TABELLA: api_rate_limits
-- Tracking rate limits per API esterne
-- ============================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL,
  tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Rate limit window
  window_start TIMESTAMPTZ NOT NULL,
  window_duration_seconds INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  max_requests INTEGER NOT NULL,

  -- Last request info
  last_request_at TIMESTAMPTZ,

  -- Unique per source + tenant + window
  CONSTRAINT unique_rate_limit UNIQUE (source_name, tenant_id, window_start)
);

-- Indici per rate limit checks
CREATE INDEX IF NOT EXISTS idx_rate_limits_source
  ON api_rate_limits(source_name, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_tenant
  ON api_rate_limits(tenant_id, source_name);

-- ============================================
-- TABELLA: sector_keywords
-- Keywords configurabili per sector detection
-- ============================================

CREATE TABLE IF NOT EXISTS sector_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_code VARCHAR(50) NOT NULL,
  keyword VARCHAR(100) NOT NULL,
  weight NUMERIC(3,2) DEFAULT 1.0,
  language VARCHAR(10) DEFAULT 'en',
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_sector_keyword UNIQUE (sector_code, keyword, language)
);

-- Indice per keyword lookup

-- Indice senza WHERE per compatibilità Supabase/Postgres
CREATE INDEX IF NOT EXISTS idx_sector_keywords_active
  ON sector_keywords(sector_code, active);

-- ============================================
-- SEED: Keywords iniziali per sector detection
-- ============================================

INSERT INTO sector_keywords (sector_code, keyword, weight, language) VALUES
  -- IT Software
  ('it_software', 'software', 1.5, 'en'),
  ('it_software', 'saas', 1.5, 'en'),
  ('it_software', 'cloud', 1.3, 'en'),
  ('it_software', 'api', 1.3, 'en'),
  ('it_software', 'platform', 1.2, 'en'),
  ('it_software', 'database', 1.2, 'en'),
  ('it_software', 'erp', 1.4, 'en'),
  ('it_software', 'crm', 1.4, 'en'),
  ('it_software', 'microsoft', 1.3, 'en'),
  ('it_software', 'oracle', 1.3, 'en'),
  ('it_software', 'sap', 1.4, 'en'),
  ('it_software', 'aws', 1.3, 'en'),
  ('it_software', 'azure', 1.3, 'en'),

  -- Food & Beverage
  ('food_beverage', 'food', 1.5, 'en'),
  ('food_beverage', 'beverage', 1.5, 'en'),
  ('food_beverage', 'organic', 1.2, 'en'),
  ('food_beverage', 'calories', 1.4, 'en'),
  ('food_beverage', 'nutritional', 1.4, 'en'),
  ('food_beverage', 'ingredient', 1.3, 'en'),
  ('food_beverage', 'dairy', 1.3, 'en'),
  ('food_beverage', 'meat', 1.2, 'en'),
  ('food_beverage', 'vegetable', 1.2, 'en'),
  ('food_beverage', 'wine', 1.3, 'en'),
  ('food_beverage', 'beer', 1.3, 'en'),
  ('food_beverage', 'coffee', 1.3, 'en'),
  ('food_beverage', 'alimentare', 1.5, 'it'),
  ('food_beverage', 'cibo', 1.5, 'it'),
  ('food_beverage', 'bevanda', 1.5, 'it'),

  -- Consumer Goods / Beauty
  ('consumer_goods', 'cosmetic', 1.5, 'en'),
  ('consumer_goods', 'beauty', 1.5, 'en'),
  ('consumer_goods', 'personal care', 1.4, 'en'),
  ('consumer_goods', 'shampoo', 1.4, 'en'),
  ('consumer_goods', 'soap', 1.3, 'en'),
  ('consumer_goods', 'cream', 1.3, 'en'),
  ('consumer_goods', 'skincare', 1.4, 'en'),
  ('consumer_goods', 'makeup', 1.4, 'en'),
  ('consumer_goods', 'household', 1.2, 'en'),
  ('consumer_goods', 'cleaning', 1.2, 'en'),
  ('consumer_goods', 'detergent', 1.3, 'en'),
  ('consumer_goods', 'cosmetico', 1.5, 'it'),
  ('consumer_goods', 'bellezza', 1.5, 'it'),

  -- Healthcare & Pharma
  ('healthcare_pharma', 'pharmaceutical', 1.5, 'en'),
  ('healthcare_pharma', 'drug', 1.5, 'en'),
  ('healthcare_pharma', 'medicine', 1.5, 'en'),
  ('healthcare_pharma', 'medical', 1.4, 'en'),
  ('healthcare_pharma', 'healthcare', 1.4, 'en'),
  ('healthcare_pharma', 'therapy', 1.3, 'en'),
  ('healthcare_pharma', 'diagnostic', 1.3, 'en'),
  ('healthcare_pharma', 'clinical', 1.3, 'en'),
  ('healthcare_pharma', 'patient', 1.2, 'en'),
  ('healthcare_pharma', 'fda', 1.4, 'en'),
  ('healthcare_pharma', 'farmaceutico', 1.5, 'it'),
  ('healthcare_pharma', 'farmaco', 1.5, 'it'),

  -- Industrial
  ('industrial', 'machinery', 1.5, 'en'),
  ('industrial', 'equipment', 1.4, 'en'),
  ('industrial', 'industrial', 1.5, 'en'),
  ('industrial', 'manufacturing', 1.4, 'en'),
  ('industrial', 'raw material', 1.3, 'en'),
  ('industrial', 'component', 1.3, 'en'),
  ('industrial', 'spare part', 1.3, 'en'),
  ('industrial', 'tool', 1.2, 'en'),
  ('industrial', 'macchinario', 1.5, 'it'),
  ('industrial', 'industriale', 1.5, 'it'),

  -- Financial Services
  ('financial_services', 'bank', 1.5, 'en'),
  ('financial_services', 'insurance', 1.5, 'en'),
  ('financial_services', 'investment', 1.4, 'en'),
  ('financial_services', 'loan', 1.4, 'en'),
  ('financial_services', 'credit', 1.3, 'en'),
  ('financial_services', 'payment', 1.3, 'en'),
  ('financial_services', 'fintech', 1.4, 'en'),
  ('financial_services', 'trading', 1.3, 'en'),
  ('financial_services', 'banca', 1.5, 'it'),
  ('financial_services', 'assicurazione', 1.5, 'it'),

  -- Professional Services
  ('professional_services', 'consulting', 1.5, 'en'),
  ('professional_services', 'advisory', 1.4, 'en'),
  ('professional_services', 'audit', 1.4, 'en'),
  ('professional_services', 'legal', 1.3, 'en'),
  ('professional_services', 'accounting', 1.3, 'en'),
  ('professional_services', 'marketing', 1.2, 'en'),
  ('professional_services', 'recruitment', 1.2, 'en'),
  ('professional_services', 'training', 1.2, 'en'),
  ('professional_services', 'consulenza', 1.5, 'it'),

  -- Automotive
  ('automotive', 'vehicle', 1.5, 'en'),
  ('automotive', 'car', 1.4, 'en'),
  ('automotive', 'automotive', 1.5, 'en'),
  ('automotive', 'engine', 1.3, 'en'),
  ('automotive', 'ev', 1.4, 'en'),
  ('automotive', 'electric vehicle', 1.4, 'en'),
  ('automotive', 'powertrain', 1.3, 'en'),
  ('automotive', 'automobile', 1.5, 'it'),
  ('automotive', 'veicolo', 1.5, 'it')
ON CONFLICT (sector_code, keyword, language) DO NOTHING;

-- ============================================
-- FUNZIONE: Trigger per updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_enrichment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger per enrichment_metadata
DROP TRIGGER IF EXISTS trg_enrichment_metadata_updated_at ON enrichment_metadata;
CREATE TRIGGER trg_enrichment_metadata_updated_at
  BEFORE UPDATE ON enrichment_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_enrichment_updated_at();

-- ============================================
-- FUNZIONE: Cleanup cache scaduta
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM enrichment_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNZIONE: Increment cache hit count
-- ============================================

CREATE OR REPLACE FUNCTION increment_cache_hit(p_source VARCHAR, p_key VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE enrichment_cache
  SET hit_count = hit_count + 1
  WHERE source_name = p_source AND cache_key = p_key AND expires_at > NOW();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VISTA: Statistiche enrichment per sector
-- ============================================

CREATE OR REPLACE VIEW enrichment_sector_stats AS
SELECT
  em.tenant_id,
  em.detected_sector,
  COUNT(*) as total_items,
  AVG(em.sector_confidence) as avg_sector_confidence,
  (
    SELECT COUNT(DISTINCT s)
    FROM enrichment_metadata em2,
    LATERAL unnest(em2.sources_matched) AS s
    WHERE em2.tenant_id = em.tenant_id
      AND em2.detected_sector = em.detected_sector
  ) as unique_sources_used,
  AVG(em.total_processing_time_ms) as avg_processing_time_ms,
  MAX(em.created_at) as last_enrichment_at
FROM enrichment_metadata em
GROUP BY em.tenant_id, em.detected_sector;

-- ============================================
-- VISTA: Cache statistics
-- ============================================

CREATE OR REPLACE VIEW enrichment_cache_stats AS
SELECT
  source_name,
  COUNT(*) as total_entries,
  SUM(hit_count) as total_hits,
  COUNT(*) FILTER (WHERE expires_at > NOW()) as active_entries,
  AVG(hit_count) as avg_hits_per_entry,
  MIN(created_at) as oldest_entry,
  MAX(expires_at) as latest_expiry
FROM enrichment_cache
GROUP BY source_name;

-- ============================================
-- COMMENTI
-- ============================================

COMMENT ON TABLE enrichment_metadata IS
  'Metadata di enrichment per portfolio items con sector detection e source provenance';

COMMENT ON TABLE enrichment_cache IS
  'Cache two-tier (L2) per risposte API esterne con TTL configurabile';

COMMENT ON TABLE api_rate_limits IS
  'Tracking sliding window rate limits per API esterne';

COMMENT ON TABLE sector_keywords IS
  'Keywords configurabili per il sector detection algorithm';

COMMENT ON COLUMN enrichment_metadata.field_sources IS
  'JSON mapping field_name -> { source, confidence, enrichedAt } per tracciare la provenienza di ogni campo';

COMMENT ON COLUMN enrichment_cache.cache_key IS
  'Hash o stringa univoca che identifica la query (es. SHA256 di name+vendor)';

COMMENT ON COLUMN api_rate_limits.window_duration_seconds IS
  'Durata della finestra di rate limiting in secondi';
