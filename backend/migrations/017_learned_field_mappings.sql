-- Migration 017: Learned Field Mappings for Semantic Mapping
-- Creates table to store learned field mappings for semantic analysis

CREATE TABLE IF NOT EXISTS learned_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_field TEXT NOT NULL,
  target_field TEXT NOT NULL,
  mapping_type VARCHAR(50) NOT NULL, -- 'direct', 'transform', 'computed'
  confidence_score DECIMAL(3,2) DEFAULT 0.0,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  learned_from_examples INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learned_field_mappings_company_id ON learned_field_mappings(company_id);
CREATE INDEX idx_learned_field_mappings_source_field ON learned_field_mappings(source_field);
CREATE INDEX idx_learned_field_mappings_target_field ON learned_field_mappings(target_field);
CREATE INDEX idx_learned_field_mappings_active ON learned_field_mappings(is_active);

COMMENT ON TABLE learned_field_mappings IS 'Stores learned semantic field mappings for automated data integration';
COMMENT ON COLUMN learned_field_mappings.confidence_score IS 'ML confidence score for the mapping (0-1)';
COMMENT ON COLUMN learned_field_mappings.usage_count IS 'How many times this mapping has been applied';
COMMENT ON COLUMN learned_field_mappings.mapping_type IS 'Type of mapping: direct (1:1), transform (function-based), computed (derived)';
