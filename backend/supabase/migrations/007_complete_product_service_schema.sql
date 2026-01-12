-- Complete Product/Service Schema Migration
-- This migration creates products and services tables with the full 3-section schema
-- Combines base table creation + schema enhancements

-- ========================================
-- PRODUCTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS products (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant reference
  tenant_id UUID REFERENCES companies(id),

  -- Basic fields
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
  owner TEXT,
  launch_date DATE,
  end_of_life_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),

  -- Scoring fields
  strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
  business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
  resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
  time_to_value INTEGER,
  roi DECIMAL(10,2),

  -- Classification
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,

  -- Product-specific fields
  lifecycle_stage TEXT CHECK (lifecycle_stage IN ('concept', 'development', 'beta', 'ga', 'mature', 'maintenance', 'deprecated', 'eol')),
  revenue DECIMAL(15,2),
  market_share DECIMAL(5,2),

  -- SCHEMA ENHANCEMENT FIELDS
  schema_version INTEGER DEFAULT 1,
  item_type TEXT DEFAULT 'product' CHECK (item_type = 'product'),
  completeness_score DECIMAL(3,2) DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1),

  -- 3-Section structured data
  identity_data JSONB DEFAULT '{}'::jsonb,
  value_proposition_data JSONB DEFAULT '{}'::jsonb,
  go_to_market_data JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  missing_fields JSONB DEFAULT '[]'::jsonb,
  data_sources JSONB DEFAULT '[]'::jsonb,
  last_reviewed TIMESTAMPTZ,

  -- Denormalized quick-access fields
  tipo_offerta TEXT CHECK (tipo_offerta IN ('saas', 'on_premise', 'hybrid', 'paas', 'managed_service')),
  linea_di_business TEXT,
  target_market JSONB DEFAULT '{}'::jsonb,
  technologies JSONB DEFAULT '[]'::jsonb,
  integrations JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- SERVICES TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS services (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant reference
  tenant_id UUID REFERENCES companies(id),

  -- Basic fields
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
  owner TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),

  -- Scoring fields
  strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
  business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
  resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
  time_to_value INTEGER,
  roi DECIMAL(10,2),

  -- Classification
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,

  -- Service-specific fields
  sla_compliance DECIMAL(5,2),
  customer_satisfaction DECIMAL(3,2),
  utilization_rate DECIMAL(5,2),

  -- SCHEMA ENHANCEMENT FIELDS
  schema_version INTEGER DEFAULT 1,
  item_type TEXT DEFAULT 'service' CHECK (item_type = 'service'),
  completeness_score DECIMAL(3,2) DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1),

  -- 3-Section structured data
  identity_data JSONB DEFAULT '{}'::jsonb,
  delivery_data JSONB DEFAULT '{}'::jsonb,
  pricing_sla_data JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  missing_fields JSONB DEFAULT '[]'::jsonb,
  data_sources JSONB DEFAULT '[]'::jsonb,
  last_reviewed TIMESTAMPTZ,

  -- Denormalized quick-access fields
  tipo_servizio TEXT CHECK (tipo_servizio IN ('managed_service', 'professional_service', 'support_service', 'consulting', 'training', 'implementation', 'managed_security')),
  delivery_model TEXT CHECK (delivery_model IN ('fully_managed', 'co_managed', 'advisory', 'onsite', 'remote', 'hybrid')),
  linea_di_business TEXT,
  target_market JSONB DEFAULT '{}'::jsonb,
  availability JSONB DEFAULT '{}'::jsonb,
  sla_data JSONB DEFAULT '{}'::jsonb,
  contract_terms JSONB DEFAULT '{}'::jsonb,
  support_channels JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- QA SESSIONS TABLE
-- ========================================

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

-- ========================================
-- PORTFOLIO ASSESSMENTS TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS portfolio_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES companies(id),
  company_id UUID REFERENCES companies(id),
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('products', 'services', 'mixed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  assessed_items INTEGER NOT NULL DEFAULT 0,
  portfolio_health JSONB,
  recommendation_distribution JSONB,
  executive_summary TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- INDEXES
-- ========================================

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_lifecycle ON products(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_products_completeness ON products(completeness_score);
CREATE INDEX IF NOT EXISTS idx_products_tipo_offerta ON products(tipo_offerta);
CREATE INDEX IF NOT EXISTS idx_products_linea_business ON products(linea_di_business);
CREATE INDEX IF NOT EXISTS idx_products_schema_version ON products(schema_version);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_products_identity_data ON products USING GIN (identity_data);
CREATE INDEX IF NOT EXISTS idx_products_value_prop_data ON products USING GIN (value_proposition_data);
CREATE INDEX IF NOT EXISTS idx_products_gtm_data ON products USING GIN (go_to_market_data);
CREATE INDEX IF NOT EXISTS idx_products_missing_fields ON products USING GIN (missing_fields);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_completeness ON services(completeness_score);
CREATE INDEX IF NOT EXISTS idx_services_tipo_servizio ON services(tipo_servizio);
CREATE INDEX IF NOT EXISTS idx_services_delivery_model ON services(delivery_model);
CREATE INDEX IF NOT EXISTS idx_services_linea_business ON services(linea_di_business);
CREATE INDEX IF NOT EXISTS idx_services_schema_version ON services(schema_version);
CREATE INDEX IF NOT EXISTS idx_services_created ON services(created_at DESC);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_services_identity_data ON services USING GIN (identity_data);
CREATE INDEX IF NOT EXISTS idx_services_delivery_data ON services USING GIN (delivery_data);
CREATE INDEX IF NOT EXISTS idx_services_pricing_sla_data ON services USING GIN (pricing_sla_data);
CREATE INDEX IF NOT EXISTS idx_services_missing_fields ON services USING GIN (missing_fields);
CREATE INDEX IF NOT EXISTS idx_services_tags ON services USING GIN (tags);

-- QA Sessions indexes
CREATE INDEX IF NOT EXISTS idx_qa_sessions_tenant ON qa_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_item ON qa_sessions(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_status ON qa_sessions(status);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_created ON qa_sessions(created_at DESC);

-- Portfolio assessments indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_tenant ON portfolio_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_created ON portfolio_assessments(created_at DESC);

-- ========================================
-- TRIGGERS
-- ========================================

-- Create update trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Products trigger
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Services trigger
DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- QA Sessions trigger
DROP TRIGGER IF EXISTS update_qa_sessions_updated_at ON qa_sessions;
CREATE TRIGGER update_qa_sessions_updated_at
    BEFORE UPDATE ON qa_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Portfolio assessments trigger
DROP TRIGGER IF EXISTS update_portfolio_assessments_updated_at ON portfolio_assessments;
CREATE TRIGGER update_portfolio_assessments_updated_at
    BEFORE UPDATE ON portfolio_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

-- Function to calculate product completeness
CREATE OR REPLACE FUNCTION calculate_product_completeness(product_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_fields INTEGER := 15;
  filled_fields INTEGER := 0;
  product_record RECORD;
BEGIN
  SELECT * INTO product_record FROM products WHERE id = product_id;
  IF product_record IS NULL THEN RETURN 0; END IF;

  -- Section A (8 fields)
  IF product_record.name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.category IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.tipo_offerta IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.linea_di_business IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.owner IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.lifecycle_stage IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.target_market IS NOT NULL AND product_record.target_market::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.identity_data IS NOT NULL AND product_record.identity_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;

  -- Section B (4 fields)
  IF product_record.description IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.value_proposition_data IS NOT NULL AND product_record.value_proposition_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF jsonb_array_length(COALESCE(product_record.kpis, '[]'::jsonb)) > 0 THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.business_value IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Section C (3 fields)
  IF product_record.go_to_market_data IS NOT NULL AND product_record.go_to_market_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.budget IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF product_record.revenue IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  RETURN LEAST(filled_fields::DECIMAL / total_fields::DECIMAL, 1.00);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate service completeness
CREATE OR REPLACE FUNCTION calculate_service_completeness(service_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  total_fields INTEGER := 15;
  filled_fields INTEGER := 0;
  service_record RECORD;
BEGIN
  SELECT * INTO service_record FROM services WHERE id = service_id;
  IF service_record IS NULL THEN RETURN 0; END IF;

  -- Section A (9 fields)
  IF service_record.name IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.category IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.tipo_servizio IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.delivery_model IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.linea_di_business IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.owner IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.target_market IS NOT NULL AND service_record.target_market::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.availability IS NOT NULL AND service_record.availability::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.identity_data IS NOT NULL AND service_record.identity_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;

  -- Section B (3 fields)
  IF service_record.description IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.delivery_data IS NOT NULL AND service_record.delivery_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.business_value IS NOT NULL THEN filled_fields := filled_fields + 1; END IF;

  -- Section C (3 fields)
  IF service_record.pricing_sla_data IS NOT NULL AND service_record.pricing_sla_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF service_record.sla_data IS NOT NULL AND service_record.sla_data::text != '{}'::text THEN filled_fields := filled_fields + 1; END IF;
  IF jsonb_array_length(COALESCE(service_record.support_channels, '[]'::jsonb)) > 0 THEN filled_fields := filled_fields + 1; END IF;

  RETURN LEAST(filled_fields::DECIMAL / total_fields::DECIMAL, 1.00);
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_assessments ENABLE ROW LEVEL SECURITY;

-- Allow all for now (customize based on your auth setup)
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all on services" ON services FOR ALL USING (true);
CREATE POLICY "Allow all on qa_sessions" ON qa_sessions FOR ALL USING (true);
CREATE POLICY "Allow all on portfolio_assessments" ON portfolio_assessments FOR ALL USING (true);

-- ========================================
-- GRANTS
-- ========================================

GRANT ALL ON products TO authenticated;
GRANT ALL ON services TO authenticated;
GRANT ALL ON qa_sessions TO authenticated;
GRANT ALL ON portfolio_assessments TO authenticated;

GRANT ALL ON products TO anon;
GRANT ALL ON services TO anon;
GRANT ALL ON qa_sessions TO anon;
GRANT ALL ON portfolio_assessments TO anon;

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE products IS 'Product catalog with complete 3-section schema (A: Identity, B: Value Proposition, C: Go-to-market)';
COMMENT ON TABLE services IS 'Service catalog with complete 3-section schema (A: Identity, B: Delivery, C: Pricing & SLA)';
COMMENT ON TABLE qa_sessions IS 'Interactive Q&A sessions for gathering missing product/service data';
COMMENT ON TABLE portfolio_assessments IS 'Portfolio assessment results for products and services';

COMMENT ON COLUMN products.completeness_score IS 'Data completeness score (0-1): measures how complete the product data is';
COMMENT ON COLUMN products.identity_data IS 'Section A: Identity & Classification data (JSON structure from productSchema.ts)';
COMMENT ON COLUMN products.value_proposition_data IS 'Section B: Customer & Value Proposition data (JSON structure from productSchema.ts)';
COMMENT ON COLUMN products.go_to_market_data IS 'Section C: Go-to-market & Pricing data (JSON structure from productSchema.ts)';

COMMENT ON COLUMN services.completeness_score IS 'Data completeness score (0-1): measures how complete the service data is';
COMMENT ON COLUMN services.identity_data IS 'Section A: Identity & Classification data (JSON structure from serviceSchema.ts)';
COMMENT ON COLUMN services.delivery_data IS 'Section B: Service Delivery & Value data (JSON structure from serviceSchema.ts)';
COMMENT ON COLUMN services.pricing_sla_data IS 'Section C: Pricing & SLA data (JSON structure from serviceSchema.ts)';
