-- Migration: Portfolio, Strategy & Budget Tables
-- Created: 2025-12-09
-- Description: Creates missing tables for portfolio items, document extractions,
--              strategy analyses, and budget optimizations

-- ============================================================
-- PORTFOLIO PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
    owner VARCHAR(255),
    start_date DATE,
    end_date DATE,
    budget NUMERIC(15, 2),
    actual_cost NUMERIC(15, 2),
    
    -- Metriche di valutazione
    strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
    business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    complexity VARCHAR(20) CHECK (complexity IN ('low', 'medium', 'high')),
    resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
    time_to_value INTEGER, -- mesi
    roi NUMERIC(10, 2), -- percentuale
    
    -- Metadata
    category VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    dependencies TEXT[] DEFAULT '{}',
    kpis JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PORTFOLIO SERVICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'proposed')),
    owner VARCHAR(255),
    start_date DATE,
    end_date DATE,
    budget NUMERIC(15, 2),
    actual_cost NUMERIC(15, 2),
    
    -- Metriche di valutazione
    strategic_alignment INTEGER CHECK (strategic_alignment >= 1 AND strategic_alignment <= 10),
    business_value INTEGER CHECK (business_value >= 1 AND business_value <= 10),
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    complexity VARCHAR(20) CHECK (complexity IN ('low', 'medium', 'high')),
    resource_requirement INTEGER CHECK (resource_requirement >= 1 AND resource_requirement <= 10),
    time_to_value INTEGER, -- mesi
    roi NUMERIC(10, 2), -- percentuale
    
    -- Metadata
    category VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    dependencies TEXT[] DEFAULT '{}',
    kpis JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PORTFOLIO ASSESSMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Assessment info
    portfolio_type VARCHAR(50) DEFAULT 'mixed' CHECK (portfolio_type IN ('initiatives', 'products', 'services', 'mixed')),
    total_items INTEGER DEFAULT 0,
    assessed_items INTEGER DEFAULT 0,
    
    -- AI Results
    portfolio_health JSONB DEFAULT '{}',
    recommendation_distribution JSONB DEFAULT '{}',
    executive_summary TEXT,
    
    -- Full result stored as JSONB
    result JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENT EXTRACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- File info
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    
    -- Extraction results
    total_extracted INTEGER DEFAULT 0,
    items_by_type JSONB DEFAULT '{"initiatives": 0, "products": 0, "services": 0}',
    confidence VARCHAR(20) DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
    warnings TEXT[] DEFAULT '{}',
    
    -- Processing info
    model_used VARCHAR(100),
    processing_time_ms INTEGER,
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'partial')),
    error_message TEXT,
    
    -- Extracted items (stored for reference)
    extracted_items JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STRATEGY ANALYSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS strategy_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- References to related data
    portfolio_assessment_id VARCHAR(255),
    roadmap_id VARCHAR(255),
    budget_optimization_id VARCHAR(255),
    
    -- Summary counts
    total_initiatives INTEGER DEFAULT 0,
    must_have_count INTEGER DEFAULT 0,
    should_have_count INTEGER DEFAULT 0,
    could_have_count INTEGER DEFAULT 0,
    wont_have_count INTEGER DEFAULT 0,
    quick_wins_count INTEGER DEFAULT 0,
    major_projects_count INTEGER DEFAULT 0,
    
    -- AI Analysis results
    prioritized_initiatives JSONB DEFAULT '[]',
    dependency_map JSONB DEFAULT '{}',
    strategic_clusters JSONB DEFAULT '[]',
    decision_matrix JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    strategic_kpis JSONB DEFAULT '[]',
    executive_action_plan JSONB DEFAULT '{}',
    
    -- Quality metrics
    confidence_level VARCHAR(20) DEFAULT 'medium' CHECK (confidence_level IN ('high', 'medium', 'low')),
    data_quality_score NUMERIC(5, 2),
    planning_horizon VARCHAR(50),
    
    -- Full result stored as JSONB
    result JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BUDGET OPTIMIZATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    optimization_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    roadmap_id VARCHAR(255),
    version INTEGER DEFAULT 1,
    
    -- Budget summary
    total_available_budget NUMERIC(15, 2),
    total_requested_budget NUMERIC(15, 2),
    budget_gap NUMERIC(15, 2),
    portfolio_item_count INTEGER DEFAULT 0,
    horizon_months INTEGER,
    
    -- AI Analysis results
    executive_summary TEXT,
    current_state_analysis JSONB DEFAULT '{}',
    scenarios JSONB DEFAULT '[]',
    recommended_scenario JSONB DEFAULT '{}',
    optimization_recommendations JSONB DEFAULT '[]',
    savings_opportunities JSONB DEFAULT '[]',
    investment_priorities JSONB DEFAULT '[]',
    quarterly_budget_plan JSONB DEFAULT '[]',
    financial_risks JSONB DEFAULT '[]',
    financial_kpis JSONB DEFAULT '[]',
    
    -- Quality metrics
    confidence_level VARCHAR(20) DEFAULT 'medium' CHECK (confidence_level IN ('high', 'medium', 'low')),
    assumptions TEXT[] DEFAULT '{}',
    limitations TEXT[] DEFAULT '{}',
    data_quality_score NUMERIC(5, 2),
    
    -- Full result stored as JSONB
    result JSONB NOT NULL DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ADD tenant_id TO EXISTING initiatives TABLE IF MISSING
-- ============================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'initiatives' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE initiatives ADD COLUMN tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE;
        -- Backfill tenant_id from company_id for existing records
        UPDATE initiatives SET tenant_id = company_id WHERE tenant_id IS NULL;
    END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================

-- Portfolio Products indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_products_tenant ON portfolio_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_products_status ON portfolio_products(status);
CREATE INDEX IF NOT EXISTS idx_portfolio_products_category ON portfolio_products(category);

-- Portfolio Services indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_services_tenant ON portfolio_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_services_status ON portfolio_services(status);
CREATE INDEX IF NOT EXISTS idx_portfolio_services_category ON portfolio_services(category);

-- Portfolio Assessments indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_tenant ON portfolio_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_type ON portfolio_assessments(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_portfolio_assessments_created ON portfolio_assessments(created_at DESC);

-- Document Extractions indexes
CREATE INDEX IF NOT EXISTS idx_document_extractions_tenant ON document_extractions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_status ON document_extractions(status);
CREATE INDEX IF NOT EXISTS idx_document_extractions_created ON document_extractions(created_at DESC);

-- Strategy Analyses indexes
CREATE INDEX IF NOT EXISTS idx_strategy_analyses_tenant ON strategy_analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_strategy_analyses_created ON strategy_analyses(created_at DESC);

-- Budget Optimizations indexes
CREATE INDEX IF NOT EXISTS idx_budget_optimizations_tenant ON budget_optimizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_optimizations_created ON budget_optimizations(created_at DESC);

-- ============================================================
-- TRIGGERS FOR updated_at
-- ============================================================

-- Ensure the function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Portfolio Products trigger
DROP TRIGGER IF EXISTS update_portfolio_products_updated_at ON portfolio_products;
CREATE TRIGGER update_portfolio_products_updated_at
    BEFORE UPDATE ON portfolio_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Portfolio Services trigger
DROP TRIGGER IF EXISTS update_portfolio_services_updated_at ON portfolio_services;
CREATE TRIGGER update_portfolio_services_updated_at
    BEFORE UPDATE ON portfolio_services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Portfolio Assessments trigger
DROP TRIGGER IF EXISTS update_portfolio_assessments_updated_at ON portfolio_assessments;
CREATE TRIGGER update_portfolio_assessments_updated_at
    BEFORE UPDATE ON portfolio_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Strategy Analyses trigger
DROP TRIGGER IF EXISTS update_strategy_analyses_updated_at ON strategy_analyses;
CREATE TRIGGER update_strategy_analyses_updated_at
    BEFORE UPDATE ON strategy_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Budget Optimizations trigger
DROP TRIGGER IF EXISTS update_budget_optimizations_updated_at ON budget_optimizations;
CREATE TRIGGER update_budget_optimizations_updated_at
    BEFORE UPDATE ON budget_optimizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE portfolio_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_optimizations ENABLE ROW LEVEL SECURITY;

-- Create policies for tenant isolation (assuming service role bypasses RLS)
-- These policies allow users to see only their company's data

-- Portfolio Products policies
DROP POLICY IF EXISTS portfolio_products_tenant_isolation ON portfolio_products;
CREATE POLICY portfolio_products_tenant_isolation ON portfolio_products
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Portfolio Services policies
DROP POLICY IF EXISTS portfolio_services_tenant_isolation ON portfolio_services;
CREATE POLICY portfolio_services_tenant_isolation ON portfolio_services
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Portfolio Assessments policies
DROP POLICY IF EXISTS portfolio_assessments_tenant_isolation ON portfolio_assessments;
CREATE POLICY portfolio_assessments_tenant_isolation ON portfolio_assessments
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Document Extractions policies
DROP POLICY IF EXISTS document_extractions_tenant_isolation ON document_extractions;
CREATE POLICY document_extractions_tenant_isolation ON document_extractions
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Strategy Analyses policies
DROP POLICY IF EXISTS strategy_analyses_tenant_isolation ON strategy_analyses;
CREATE POLICY strategy_analyses_tenant_isolation ON strategy_analyses
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Budget Optimizations policies
DROP POLICY IF EXISTS budget_optimizations_tenant_isolation ON budget_optimizations;
CREATE POLICY budget_optimizations_tenant_isolation ON budget_optimizations
    FOR ALL
    USING (tenant_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- ============================================================
-- GRANT PERMISSIONS (for service role)
-- ============================================================

-- Grant all permissions to authenticated users (through service role)
GRANT ALL ON portfolio_products TO authenticated;
GRANT ALL ON portfolio_services TO authenticated;
GRANT ALL ON portfolio_assessments TO authenticated;
GRANT ALL ON document_extractions TO authenticated;
GRANT ALL ON strategy_analyses TO authenticated;
GRANT ALL ON budget_optimizations TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE portfolio_products IS 'Stores IT products in the portfolio (applications, platforms, tools)';
COMMENT ON TABLE portfolio_services IS 'Stores IT services in the portfolio (support, maintenance, consulting)';
COMMENT ON TABLE portfolio_assessments IS 'Stores AI-generated portfolio assessment results';
COMMENT ON TABLE document_extractions IS 'Tracks document uploads and AI extraction results';
COMMENT ON TABLE strategy_analyses IS 'Stores AI-generated strategic analysis and prioritization results';
COMMENT ON TABLE budget_optimizations IS 'Stores AI-generated budget optimization scenarios and recommendations';
