-- ============================================================================
-- Correction Embeddings for Semantic Similarity Search
-- ============================================================================
-- This migration adds vector embedding support to ingestion_corrections
-- to enable finding similar corrections for active learning.

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. ADD EMBEDDING COLUMN TO INGESTION_CORRECTIONS
-- ============================================================================

-- Add embedding column for semantic similarity search
ALTER TABLE ingestion_corrections
ADD COLUMN IF NOT EXISTS item_name_embedding vector(1536);

-- Add corrected fields array for quick filtering
ALTER TABLE ingestion_corrections
ADD COLUMN IF NOT EXISTS corrected_fields TEXT[] DEFAULT '{}';

-- Add item name for quick access
ALTER TABLE ingestion_corrections
ADD COLUMN IF NOT EXISTS item_name TEXT;

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_corrections_embedding
ON ingestion_corrections
USING ivfflat (item_name_embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for corrected fields
CREATE INDEX IF NOT EXISTS idx_corrections_fields
ON ingestion_corrections USING GIN (corrected_fields);

-- ============================================================================
-- 2. SEMANTIC SIMILARITY SEARCH FUNCTION
-- ============================================================================

-- Function to find similar corrections based on item name embedding
CREATE OR REPLACE FUNCTION match_corrections(
  p_tenant_id UUID,
  p_query_embedding vector(1536),
  p_threshold FLOAT DEFAULT 0.85,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  original_extraction JSONB,
  corrected_item JSONB,
  corrected_fields TEXT[],
  item_name TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ic.id,
    ic.tenant_id,
    ic.original_extraction,
    ic.corrected_item,
    ic.corrected_fields,
    ic.item_name,
    1 - (ic.item_name_embedding <=> p_query_embedding) as similarity
  FROM ingestion_corrections ic
  WHERE ic.tenant_id = p_tenant_id
    AND ic.item_name_embedding IS NOT NULL
    AND (1 - (ic.item_name_embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY ic.item_name_embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 3. DEDUPLICATION TRACKING TABLE
-- ============================================================================

-- Table to track product name aliases and canonical forms
CREATE TABLE IF NOT EXISTS product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Alias mapping
  alias_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,

  -- Confidence and source
  confidence FLOAT NOT NULL DEFAULT 0.95,
  source VARCHAR(50) NOT NULL DEFAULT 'system', -- 'system', 'user', 'semantic'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint per tenant (or global if tenant_id is null)
  UNIQUE(tenant_id, alias_name)
);

-- Index for alias lookup
CREATE INDEX IF NOT EXISTS idx_aliases_lookup
ON product_aliases(LOWER(alias_name));

CREATE INDEX IF NOT EXISTS idx_aliases_canonical
ON product_aliases(canonical_name);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON COLUMN ingestion_corrections.item_name_embedding IS 'Vector embedding of item name for semantic similarity search';
COMMENT ON COLUMN ingestion_corrections.corrected_fields IS 'Array of field names that were corrected';
COMMENT ON FUNCTION match_corrections IS 'Find similar corrections based on item name embedding similarity';
COMMENT ON TABLE product_aliases IS 'Maps product name aliases to canonical names for deduplication';
