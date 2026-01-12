-- External Knowledge Cache Table
-- Stores the entire external knowledge catalog as a single cached entry
-- TTL: 7 days (refreshed via admin API or scheduled job)

-- Drop old table if exists (for clean migration)
DROP TABLE IF EXISTS external_knowledge_cache CASCADE;
DROP VIEW IF EXISTS external_knowledge_catalog CASCADE;

CREATE TABLE external_knowledge_cache (
  -- Cache identifier (single row: 'main-cache')
  id TEXT PRIMARY KEY DEFAULT 'main-cache',

  -- All items stored as JSONB array
  items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Counts per source (aws, azure, gcp, etc.)
  source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Total item count
  item_count INTEGER NOT NULL DEFAULT 0,

  -- Cache timestamps
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Index for expiration checks
CREATE INDEX IF NOT EXISTS idx_external_knowledge_expires
  ON external_knowledge_cache(expires_at);

-- GIN index for searching within items array
CREATE INDEX IF NOT EXISTS idx_external_knowledge_items_gin
  ON external_knowledge_cache USING GIN (items);

-- Comment on table
COMMENT ON TABLE external_knowledge_cache IS
  'Cached external knowledge catalog from cloud providers (AWS, Azure, GCP). Single-row design for atomic refresh.';

-- Insert initial empty cache row
INSERT INTO external_knowledge_cache (id, items, source_counts, item_count)
VALUES ('main-cache', '[]'::jsonb, '{}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;

-- Function to get cache stats
CREATE OR REPLACE FUNCTION get_external_knowledge_stats()
RETURNS TABLE (
  has_cache BOOLEAN,
  item_count INTEGER,
  aws_count INTEGER,
  azure_count INTEGER,
  gcp_count INTEGER,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN c.item_count > 0 THEN TRUE ELSE FALSE END,
    c.item_count,
    COALESCE((c.source_counts->>'aws')::INTEGER, 0),
    COALESCE((c.source_counts->>'azure')::INTEGER, 0),
    COALESCE((c.source_counts->>'gcp')::INTEGER, 0),
    c.fetched_at,
    c.expires_at,
    CASE WHEN NOW() > c.expires_at THEN TRUE ELSE FALSE END
  FROM external_knowledge_cache c
  WHERE c.id = 'main-cache';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_external_knowledge_stats() IS
  'Returns statistics about the external knowledge cache';
