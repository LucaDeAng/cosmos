-- Migration: 009_knowledge_embeddings
-- Description: Enable pgvector extension and create knowledge embeddings table for RAG
-- Created: 2025-01-XX

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge embeddings table for storing document chunks and their vectors
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source document reference
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    
    -- Content
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL, -- SHA256 hash for deduplication
    
    -- Metadata for filtering and context
    source_type TEXT NOT NULL CHECK (source_type IN (
        'document',           -- Uploaded documents
        'assessment',         -- Client assessments
        'portfolio_item',     -- Portfolio items (products/services)
        'initiative',         -- Initiatives
        'strategy',           -- Strategy analyses
        'roadmap',            -- Roadmap items
        'budget',             -- Budget optimizations
        'conversation',       -- Chat history
        'external'            -- External knowledge base
    )),
    source_id UUID,           -- ID of the source entity
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Vector embedding (OpenAI text-embedding-3-small produces 1536 dimensions)
    embedding vector(1536) NOT NULL,
    
    -- Chunking info
    chunk_index INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_company 
    ON knowledge_embeddings(company_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_source_type 
    ON knowledge_embeddings(source_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_source 
    ON knowledge_embeddings(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_content_hash 
    ON knowledge_embeddings(content_hash);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_metadata 
    ON knowledge_embeddings USING gin(metadata);

-- IVFFlat index for fast approximate nearest neighbor search
-- Lists = sqrt(number of vectors), start with 100 for ~10k vectors
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_vector 
    ON knowledge_embeddings 
    USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_knowledge_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trigger_knowledge_embeddings_updated_at ON knowledge_embeddings;
CREATE TRIGGER trigger_knowledge_embeddings_updated_at
    BEFORE UPDATE ON knowledge_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_embeddings_updated_at();

-- Helper function for semantic search with cosine similarity
CREATE OR REPLACE FUNCTION search_knowledge_embeddings(
    p_query_embedding vector(1536),
    p_company_id UUID,
    p_source_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    source_type TEXT,
    source_id UUID,
    metadata JSONB,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ke.id,
        ke.content,
        ke.source_type,
        ke.source_id,
        ke.metadata,
        1 - (ke.embedding <=> p_query_embedding) AS similarity
    FROM knowledge_embeddings ke
    WHERE ke.company_id = p_company_id
      AND (p_source_types IS NULL OR ke.source_type = ANY(p_source_types))
      AND 1 - (ke.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY ke.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert embedding (avoid duplicates)
CREATE OR REPLACE FUNCTION upsert_knowledge_embedding(
    p_company_id UUID,
    p_content TEXT,
    p_source_type TEXT,
    p_embedding vector(1536),
    p_document_id UUID DEFAULT NULL,
    p_source_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_chunk_index INTEGER DEFAULT 0,
    p_total_chunks INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
    v_content_hash TEXT;
    v_embedding_id UUID;
BEGIN
    -- Generate content hash for deduplication
    v_content_hash := encode(sha256(p_content::bytea), 'hex');
    
    -- Try to find existing embedding with same hash
    SELECT id INTO v_embedding_id
    FROM knowledge_embeddings
    WHERE company_id = p_company_id 
      AND content_hash = v_content_hash
      AND source_type = p_source_type;
    
    IF v_embedding_id IS NOT NULL THEN
        -- Update existing embedding
        UPDATE knowledge_embeddings
        SET embedding = p_embedding,
            metadata = p_metadata,
            document_id = COALESCE(p_document_id, document_id),
            source_id = COALESCE(p_source_id, source_id),
            updated_at = NOW()
        WHERE id = v_embedding_id;
    ELSE
        -- Insert new embedding
        INSERT INTO knowledge_embeddings (
            company_id,
            document_id,
            content,
            content_hash,
            source_type,
            source_id,
            metadata,
            embedding,
            chunk_index,
            total_chunks
        ) VALUES (
            p_company_id,
            p_document_id,
            p_content,
            v_content_hash,
            p_source_type,
            p_source_id,
            p_metadata,
            p_embedding,
            p_chunk_index,
            p_total_chunks
        )
        RETURNING id INTO v_embedding_id;
    END IF;
    
    RETURN v_embedding_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access embeddings for their company
CREATE POLICY knowledge_embeddings_company_isolation ON knowledge_embeddings
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Grant permissions
GRANT ALL ON knowledge_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION search_knowledge_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_knowledge_embedding TO authenticated;

COMMENT ON TABLE knowledge_embeddings IS 'Stores vector embeddings for RAG-based knowledge retrieval';
COMMENT ON COLUMN knowledge_embeddings.embedding IS 'OpenAI text-embedding-3-small 1536-dimensional vector';
COMMENT ON FUNCTION search_knowledge_embeddings IS 'Semantic search with cosine similarity and company isolation';
