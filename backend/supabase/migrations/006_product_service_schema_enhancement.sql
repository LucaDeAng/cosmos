-- Product/Service Schema Enhancement Migration
-- Adds structured schema support for complete Product and Service cards
-- Based on 3-section schema: A (Identity), B (Value), C (GTM/Pricing)

-- ========================================
-- PRODUCTS TABLE ENHANCEMENTS
-- ========================================

-- Add schema version tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;

-- Add item type for clearer classification
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'product' CHECK (item_type = 'product');

-- Add completeness score (0-1 scale)
ALTER TABLE products ADD COLUMN IF NOT EXISTS completeness_score DECIMAL(3,2) DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1);

-- Add structured data columns for 3-section schema
ALTER TABLE products ADD COLUMN IF NOT EXISTS identity_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS value_proposition_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS go_to_market_data JSONB DEFAULT '{}'::jsonb;

-- Add metadata for data quality
ALTER TABLE products ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_reviewed TIMESTAMPTZ;

-- Update lifecycle_stage to match new schema
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_lifecycle_stage_check;
ALTER TABLE products ADD CONSTRAINT products_lifecycle_stage_check
  CHECK (lifecycle_stage IN ('concept', 'development', 'beta', 'ga', 'mature', 'maintenance', 'deprecated', 'eol'));

-- Add new product-specific fields from schema
ALTER TABLE products ADD COLUMN IF NOT EXISTS tipo_offerta TEXT CHECK (tipo_offerta IN ('saas', 'on_premise', 'hybrid', 'paas', 'managed_service'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS linea_di_business TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_market JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technologies JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT '[]'::jsonb;

-- ========================================
-- SERVICES TABLE ENHANCEMENTS
-- ========================================

-- Add schema version tracking
ALTER TABLE services ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1;

-- Add item type for clearer classification
ALTER TABLE services ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'service' CHECK (item_type = 'service');

-- Add completeness score (0-1 scale)
ALTER TABLE services ADD COLUMN IF NOT EXISTS completeness_score DECIMAL(3,2) DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1);

-- Add structured data columns for 3-section schema
ALTER TABLE services ADD COLUMN IF NOT EXISTS identity_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS delivery_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_sla_data JSONB DEFAULT '{}'::jsonb;

-- Add metadata for data quality
ALTER TABLE services ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS last_reviewed TIMESTAMPTZ;

-- Add new service-specific fields from schema
ALTER TABLE services ADD COLUMN IF NOT EXISTS tipo_servizio TEXT CHECK (tipo_servizio IN ('managed_service', 'professional_service', 'support_service', 'consulting', 'training', 'implementation', 'managed_security'));
ALTER TABLE services ADD COLUMN IF NOT EXISTS delivery_model TEXT CHECK (delivery_model IN ('fully_managed', 'co_managed', 'advisory', 'onsite', 'remote', 'hybrid'));
ALTER TABLE services ADD COLUMN IF NOT EXISTS linea_di_business TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS target_market JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sla_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS contract_terms JSONB DEFAULT '{}'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS support_channels JSONB DEFAULT '[]'::jsonb;

-- ========================================
-- Q&A SESSION TRACKING TABLE
-- ========================================

-- Table to track interactive Q&A sessions for gathering missing data
CREATE TABLE IF NOT EXISTS qa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES companies(id),

  -- Link to product or service
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
  item_id UUID NOT NULL,
  item_name TEXT NOT NULL,

  -- Session data
  current_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness_score DECIMAL(3,2) NOT NULL DEFAULT 0,

  -- Questions and answers
  questions_asked JSONB DEFAULT '[]'::jsonb,
  answers_received JSONB DEFAULT '[]'::jsonb,

  -- Session status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for Q&A sessions
CREATE INDEX IF NOT EXISTS idx_qa_sessions_tenant ON qa_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_item ON qa_sessions(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_status ON qa_sessions(status);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_created ON qa_sessions(created_at DESC);

-- Trigger for updated_at on qa_sessions
DROP TRIGGER IF EXISTS update_qa_sessions_updated_at ON qa_sessions;
CREATE TRIGGER update_qa_sessions_updated_at
    BEFORE UPDATE ON qa_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS for qa_sessions
ALTER TABLE qa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on qa_sessions" ON qa_sessions FOR ALL USING (true);
GRANT ALL ON qa_sessions TO authenticated;
GRANT ALL ON qa_sessions TO anon;

-- ========================================
-- INDEXES FOR NEW COLUMNS
-- ========================================

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_completeness ON products(completeness_score);
CREATE INDEX IF NOT EXISTS idx_products_tipo_offerta ON products(tipo_offerta);
CREATE INDEX IF NOT EXISTS idx_products_linea_business ON products(linea_di_business);
CREATE INDEX IF NOT EXISTS idx_products_schema_version ON products(schema_version);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_completeness ON services(completeness_score);
CREATE INDEX IF NOT EXISTS idx_services_tipo_servizio ON services(tipo_servizio);
CREATE INDEX IF NOT EXISTS idx_services_delivery_model ON services(delivery_model);
CREATE INDEX IF NOT EXISTS idx_services_linea_business ON services(linea_di_business);
CREATE INDEX IF NOT EXISTS idx_services_schema_version ON services(schema_version);

-- GIN indexes for JSONB columns (for efficient JSON queries)
CREATE INDEX IF NOT EXISTS idx_products_identity_data ON products USING GIN (identity_data);
CREATE INDEX IF NOT EXISTS idx_products_value_prop_data ON products USING GIN (value_proposition_data);
CREATE INDEX IF NOT EXISTS idx_products_gtm_data ON products USING GIN (go_to_market_data);
CREATE INDEX IF NOT EXISTS idx_products_missing_fields ON products USING GIN (missing_fields);

CREATE INDEX IF NOT EXISTS idx_services_identity_data ON services USING GIN (identity_data);
CREATE INDEX IF NOT EXISTS idx_services_delivery_data ON services USING GIN (delivery_data);
CREATE INDEX IF NOT EXISTS idx_services_pricing_sla_data ON services USING GIN (pricing_sla_data);
CREATE INDEX IF NOT EXISTS idx_services_missing_fields ON services USING GIN (missing_fields);

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to calculate completeness score for a product
CREATE OR REPLACE FUNCTION calculate_product_completeness(product_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_fields INTEGER := 15; -- Total critical fields across all sections
  filled_fields INTEGER := 0;
  product_record RECORD;
BEGIN
  SELECT * INTO product_record FROM products WHERE id = product_id;

  IF product_record IS NULL THEN
    RETURN 0;
  END IF;

  -- Section A fields (8 fields)
  IF product_record.name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.category IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.tipo_offerta IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.linea_di_business IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.owner IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.lifecycle_stage IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.target_market IS NOT NULL AND product_record.target_market::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.identity_data IS NOT NULL AND product_record.identity_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;

  -- Section B fields (4 fields)
  IF product_record.description IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.value_proposition_data IS NOT NULL AND product_record.value_proposition_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF jsonb_array_length(COALESCE(product_record.kpis, '[]'::jsonb)) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.business_value IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Section C fields (3 fields)
  IF product_record.go_to_market_data IS NOT NULL AND product_record.go_to_market_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.budget IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.revenue IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  RETURN LEAST(filled_fields::DECIMAL / total_fields::DECIMAL, 1.00);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate completeness score for a service
CREATE OR REPLACE FUNCTION calculate_service_completeness(service_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_fields INTEGER := 15; -- Total critical fields across all sections
  filled_fields INTEGER := 0;
  service_record RECORD;
BEGIN
  SELECT * INTO service_record FROM services WHERE id = service_id;

  IF service_record IS NULL THEN
    RETURN 0;
  END IF;

  -- Section A fields (9 fields)
  IF service_record.name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.category IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.tipo_servizio IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.delivery_model IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.linea_di_business IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.owner IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.target_market IS NOT NULL AND service_record.target_market::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.availability IS NOT NULL AND service_record.availability::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.identity_data IS NOT NULL AND service_record.identity_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;

  -- Section B fields (3 fields)
  IF service_record.description IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.delivery_data IS NOT NULL AND service_record.delivery_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.business_value IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Section C fields (3 fields)
  IF service_record.pricing_sla_data IS NOT NULL AND service_record.pricing_sla_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.sla_data IS NOT NULL AND service_record.sla_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF jsonb_array_length(COALESCE(service_record.support_channels, '[]'::jsonb)) > 0 THEN filled_fields := filled_fields + 1; END IF;

  RETURN LEAST(filled_fields::DECIMAL / total_fields::DECIMAL, 1.00);
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- COMMENTS FOR DOCUMENTATION
-- ========================================

COMMENT ON COLUMN products.schema_version IS 'Schema version for migration tracking (current: 1)';
COMMENT ON COLUMN products.completeness_score IS 'Data completeness score (0-1): measures how complete the product data is';
COMMENT ON COLUMN products.identity_data IS 'Section A: Identity & Classification data (JSON structure from productSchema.ts)';
COMMENT ON COLUMN products.value_proposition_data IS 'Section B: Customer & Value Proposition data (JSON structure from productSchema.ts)';
COMMENT ON COLUMN products.go_to_market_data IS 'Section C: Go-to-market & Pricing data (JSON structure from productSchema.ts)';
COMMENT ON COLUMN products.missing_fields IS 'Array of field paths that are missing (e.g., ["A.product_id", "B.value_proposition"])';

COMMENT ON COLUMN services.schema_version IS 'Schema version for migration tracking (current: 1)';
COMMENT ON COLUMN services.completeness_score IS 'Data completeness score (0-1): measures how complete the service data is';
COMMENT ON COLUMN services.identity_data IS 'Section A: Identity & Classification data (JSON structure from serviceSchema.ts)';
COMMENT ON COLUMN services.delivery_data IS 'Section B: Service Delivery & Value data (JSON structure from serviceSchema.ts)';
COMMENT ON COLUMN services.pricing_sla_data IS 'Section C: Pricing & SLA data (JSON structure from serviceSchema.ts)';
COMMENT ON COLUMN services.missing_fields IS 'Array of field paths that are missing (e.g., ["A.service_id", "C.sla"])';

COMMENT ON TABLE qa_sessions IS 'Interactive Q&A sessions for gathering missing product/service data';
COMMENT ON COLUMN qa_sessions.session_id IS 'Unique session identifier (format: qa-{timestamp}-{random})';
COMMENT ON COLUMN qa_sessions.questions_asked IS 'Array of QAQuestion objects generated by interactiveQAAgent';
COMMENT ON COLUMN qa_sessions.answers_received IS 'Array of QAAnswer objects with parsed user responses';
