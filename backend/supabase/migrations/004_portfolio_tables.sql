-- Portfolio Assessment Tables Migration
-- Run this in Supabase SQL Editor

-- Table for portfolio assessments results
CREATE TABLE IF NOT EXISTS portfolio_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES companies(id),
  company_id UUID REFERENCES companies(id),
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('initiatives', 'products', 'services', 'mixed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  assessed_items INTEGER NOT NULL DEFAULT 0,
  portfolio_health JSONB,
  recommendation_distribution JSONB,
  executive_summary TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for initiatives
CREATE TABLE IF NOT EXISTS initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
  owner TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),
  strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
  business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
  resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
  time_to_value INTEGER, -- months
  roi DECIMAL(10,2), -- percentage
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
  owner TEXT,
  launch_date DATE,
  end_of_life_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),
  strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
  business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
  resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
  time_to_value INTEGER,
  roi DECIMAL(10,2),
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,
  -- Product-specific fields
  lifecycle_stage TEXT CHECK (lifecycle_stage IN ('development', 'introduction', 'growth', 'maturity', 'decline')),
  revenue DECIMAL(15,2),
  market_share DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for services
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
  owner TEXT,
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2),
  actual_cost DECIMAL(15,2),
  strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
  business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
  resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
  time_to_value INTEGER,
  roi DECIMAL(10,2),
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  dependencies JSONB DEFAULT '[]'::jsonb,
  kpis JSONB DEFAULT '[]'::jsonb,
  -- Service-specific fields
  sla_compliance DECIMAL(5,2), -- percentage
  customer_satisfaction DECIMAL(3,2), -- 1-5 scale
  utilization_rate DECIMAL(5,2), -- percentage
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_tenant ON portfolio_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_created ON portfolio_assessments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_initiatives_tenant ON initiatives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_initiatives_status ON initiatives(status);
CREATE INDEX IF NOT EXISTS idx_initiatives_category ON initiatives(category);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_lifecycle ON products(lifecycle_stage);

CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_portfolio_assessments_updated_at ON portfolio_assessments;
CREATE TRIGGER update_portfolio_assessments_updated_at
    BEFORE UPDATE ON portfolio_assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_initiatives_updated_at ON initiatives;
CREATE TRIGGER update_initiatives_updated_at
    BEFORE UPDATE ON initiatives
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE portfolio_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Allow all for now (customize based on your auth setup)
CREATE POLICY "Allow all on portfolio_assessments" ON portfolio_assessments FOR ALL USING (true);
CREATE POLICY "Allow all on initiatives" ON initiatives FOR ALL USING (true);
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true);
CREATE POLICY "Allow all on services" ON services FOR ALL USING (true);

-- Grant permissions
GRANT ALL ON portfolio_assessments TO authenticated;
GRANT ALL ON initiatives TO authenticated;
GRANT ALL ON products TO authenticated;
GRANT ALL ON services TO authenticated;
GRANT ALL ON portfolio_assessments TO anon;
GRANT ALL ON initiatives TO anon;
GRANT ALL ON products TO anon;
GRANT ALL ON services TO anon;
