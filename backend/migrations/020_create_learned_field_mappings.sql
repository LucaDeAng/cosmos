-- Migration: Create learned_field_mappings table
-- Description: Stores learned field mapping patterns for semantic mapping

CREATE TABLE IF NOT EXISTS learned_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Mapping pattern
  source_pattern TEXT NOT NULL,
  source_embedding vector(1536), -- OpenAI text-embedding-3-small
  target_field VARCHAR(50) NOT NULL,

  -- Success tracking
  success_count INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,
  confidence DECIMAL(3,2) DEFAULT 0.85 CHECK (confidence >= 0 AND confidence <= 1),

  -- Context
  context_keywords TEXT[] DEFAULT '{}',
  industry_context VARCHAR(100),
  document_type VARCHAR(50),
  sample_values JSONB DEFAULT '[]',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_tenant_pattern UNIQUE (tenant_id, source_pattern, target_field)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learned_mappings_tenant
  ON learned_field_mappings(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_learned_mappings_target_field
  ON learned_field_mappings(target_field);

-- Vector similarity search index (if pgvector is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE INDEX IF NOT EXISTS idx_learned_mappings_embedding
      ON learned_field_mappings USING ivfflat (source_embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_learned_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trigger_update_learned_mappings_updated_at ON learned_field_mappings;
CREATE TRIGGER trigger_update_learned_mappings_updated_at
  BEFORE UPDATE ON learned_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_learned_mappings_updated_at();

-- Comments
COMMENT ON TABLE learned_field_mappings IS 'Stores learned field mapping patterns with embeddings for semantic similarity matching';
COMMENT ON COLUMN learned_field_mappings.source_embedding IS 'OpenAI text-embedding-3-small (1536 dimensions) for similarity search';
COMMENT ON COLUMN learned_field_mappings.confidence IS 'Mapping confidence based on success rate (0-1)';
