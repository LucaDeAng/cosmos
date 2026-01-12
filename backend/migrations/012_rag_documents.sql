-- Migration: 012_rag_documents
-- Description: Create rag_documents and tenant_rag_metadata tables for tenant-specific RAG training
-- Created: 2025-12-18

-- RAG documents table for storing tenant-specific RAG training data
CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant/system reference (tenant_id for multi-tenant isolation)
    system_id UUID NOT NULL,

    -- Content and embedding
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,

    -- Metadata for classification and context
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Source tracking
    source TEXT NOT NULL CHECK (source IN (
        'strategic_assessment',   -- Generated from strategic assessment profile
        'user_provided',          -- Manually added by user
        'document_extraction',    -- Extracted from uploaded documents
        'catalog_import'          -- Imported from external catalog
    )),
    source_id TEXT,               -- Unique identifier for the source item

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_rag_documents_system_id
    ON rag_documents(system_id);

CREATE INDEX IF NOT EXISTS idx_rag_documents_source
    ON rag_documents(source);

CREATE INDEX IF NOT EXISTS idx_rag_documents_source_id
    ON rag_documents(source_id);

CREATE INDEX IF NOT EXISTS idx_rag_documents_metadata
    ON rag_documents USING gin(metadata);

-- IVFFlat index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_rag_documents_vector
    ON rag_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rag_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_rag_documents_updated_at ON rag_documents;
CREATE TRIGGER trigger_rag_documents_updated_at
    BEFORE UPDATE ON rag_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_rag_documents_updated_at();

-- Tenant RAG metadata table for storing training configuration and stats
CREATE TABLE IF NOT EXISTS tenant_rag_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant reference
    tenant_id UUID NOT NULL UNIQUE,

    -- Industry and business info
    industry TEXT NOT NULL,
    business_model TEXT,

    -- Training stats (JSONB for flexibility)
    training_stats JSONB DEFAULT '{}'::jsonb,

    -- RAG configuration from strategic assessment
    rag_config JSONB DEFAULT '{}'::jsonb,

    -- Version tracking
    profile_version TEXT DEFAULT '2.0',

    -- Timestamps
    trained_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant lookup
CREATE INDEX IF NOT EXISTS idx_tenant_rag_metadata_tenant_id
    ON tenant_rag_metadata(tenant_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_rag_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_tenant_rag_metadata_updated_at ON tenant_rag_metadata;
CREATE TRIGGER trigger_tenant_rag_metadata_updated_at
    BEFORE UPDATE ON tenant_rag_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_rag_metadata_updated_at();

-- Helper function for semantic search in RAG documents
CREATE OR REPLACE FUNCTION search_rag_documents(
    p_query_embedding vector(1536),
    p_system_id UUID,
    p_source TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    source TEXT,
    source_id TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rd.id,
        rd.content,
        rd.metadata,
        rd.source,
        rd.source_id,
        1 - (rd.embedding <=> p_query_embedding) AS similarity
    FROM rag_documents rd
    WHERE rd.system_id = p_system_id
      AND (p_source IS NULL OR rd.source = p_source)
      AND 1 - (rd.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY rd.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON rag_documents TO authenticated;
GRANT ALL ON tenant_rag_metadata TO authenticated;
GRANT EXECUTE ON FUNCTION search_rag_documents TO authenticated;

COMMENT ON TABLE rag_documents IS 'Stores tenant-specific RAG training data for product/service classification';
COMMENT ON TABLE tenant_rag_metadata IS 'Stores tenant RAG training configuration and statistics';
COMMENT ON FUNCTION search_rag_documents IS 'Semantic search with cosine similarity for tenant RAG';
