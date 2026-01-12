-- Migration: Create ingestion_cache table for L2 persistent caching
-- This table stores extraction results to avoid re-processing similar documents

-- Create the ingestion_cache table
CREATE TABLE IF NOT EXISTS ingestion_cache (
  cache_key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on expires_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_ingestion_cache_expires_at ON ingestion_cache(expires_at);

-- Create a function to automatically clean up expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_ingestion_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM ingestion_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to run cleanup (requires pg_cron extension)
-- If pg_cron is available, uncomment the following:
-- SELECT cron.schedule('cleanup-ingestion-cache', '0 * * * *', 'SELECT cleanup_expired_ingestion_cache()');

COMMENT ON TABLE ingestion_cache IS 'L2 persistent cache for ingestion extraction results';
COMMENT ON COLUMN ingestion_cache.cache_key IS 'SHA256 hash prefix:content_hash';
COMMENT ON COLUMN ingestion_cache.value IS 'Cached extraction results as JSON';
COMMENT ON COLUMN ingestion_cache.expires_at IS 'Expiration timestamp (default 24 hours)';
