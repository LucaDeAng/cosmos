-- ============================================================================
-- Continuous Learning System for AI Data Ingestion
-- ============================================================================
-- This migration creates tables to support learning from user corrections:
-- 1. ingestion_corrections - Stores user corrections to extracted items
-- 2. learned_transformation_rules - Stores learned patterns for auto-application
-- 3. ingestion_metrics - Tracks accuracy and performance metrics over time

-- ============================================================================
-- 1. INGESTION CORRECTIONS
-- Stores user corrections to extracted items for learning purposes
-- ============================================================================

CREATE TABLE IF NOT EXISTS ingestion_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Original extraction data
  original_extraction JSONB NOT NULL,

  -- Corrected item data
  corrected_item JSONB NOT NULL,

  -- Detailed field-level corrections
  -- Format: [{ field: "type", from: "service", to: "product" }, ...]
  field_corrections JSONB NOT NULL DEFAULT '[]',

  -- Source context
  source_type VARCHAR(50), -- 'pdf_table', 'pdf_text', 'excel_row', 'text_block'
  extraction_context JSONB, -- Additional context like file name, page number, etc.

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_corrections_tenant ON ingestion_corrections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_corrections_date ON ingestion_corrections(created_at);
CREATE INDEX IF NOT EXISTS idx_corrections_source_type ON ingestion_corrections(source_type);

-- GIN index for JSONB field_corrections queries
CREATE INDEX IF NOT EXISTS idx_corrections_field_corrections ON ingestion_corrections USING GIN (field_corrections);

-- ============================================================================
-- 2. LEARNED TRANSFORMATION RULES
-- Stores learned patterns that can be automatically applied to new extractions
-- ============================================================================

CREATE TABLE IF NOT EXISTS learned_transformation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Rule definition
  field_name VARCHAR(100) NOT NULL, -- e.g., 'type', 'category', 'status'
  from_value TEXT NOT NULL, -- Original value pattern
  to_value TEXT NOT NULL, -- Target value

  -- Rule confidence and usage
  confidence FLOAT NOT NULL DEFAULT 0.5, -- 0.0 to 1.0
  occurrence_count INTEGER NOT NULL DEFAULT 1, -- Number of times this correction was seen

  -- Rule status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one rule per tenant/field/from_value combination
  UNIQUE(tenant_id, field_name, from_value)
);

-- Indexes for efficient rule lookup
CREATE INDEX IF NOT EXISTS idx_rules_tenant ON learned_transformation_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_active ON learned_transformation_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rules_confidence ON learned_transformation_rules(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_rules_field_name ON learned_transformation_rules(field_name);

-- ============================================================================
-- 3. INGESTION METRICS
-- Tracks accuracy and performance metrics over time for analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS ingestion_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Batch identification
  batch_id VARCHAR(100), -- Links to a specific ingestion batch/request

  -- Processing stats
  items_processed INTEGER NOT NULL,

  -- Accuracy metrics (0.0 to 1.0)
  extraction_accuracy FLOAT, -- Overall extraction accuracy
  type_accuracy FLOAT, -- Product/Service type detection accuracy
  category_accuracy FLOAT, -- Category assignment accuracy

  -- Performance metrics
  auto_accept_rate FLOAT -- % of items accepted without changes
  avg_confidence FLOAT, -- Average confidence score

  -- Timing
  processing_time_ms INTEGER, -- Total processing time in milliseconds

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for metrics queries
CREATE INDEX IF NOT EXISTS idx_metrics_tenant ON ingestion_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON ingestion_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_batch ON ingestion_metrics(batch_id);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Function to update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_learned_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on learned_transformation_rules
DROP TRIGGER IF EXISTS trigger_update_learned_rules_timestamp ON learned_transformation_rules;
CREATE TRIGGER trigger_update_learned_rules_timestamp
  BEFORE UPDATE ON learned_transformation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_learned_rules_updated_at();

-- ============================================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ingestion_corrections IS 'Stores user corrections to AI-extracted portfolio items for continuous learning';
COMMENT ON TABLE learned_transformation_rules IS 'Stores transformation rules learned from user corrections, applied to new extractions';
COMMENT ON TABLE ingestion_metrics IS 'Tracks ingestion accuracy and performance metrics over time';

COMMENT ON COLUMN ingestion_corrections.field_corrections IS 'JSON array of field-level corrections: [{ field, from, to }]';
COMMENT ON COLUMN learned_transformation_rules.confidence IS 'Confidence score 0.0-1.0, rules with confidence > 0.7 are auto-applied';
COMMENT ON COLUMN learned_transformation_rules.occurrence_count IS 'Number of times this correction pattern was observed';
COMMENT ON COLUMN ingestion_metrics.auto_accept_rate IS 'Percentage of items accepted without user modifications';
