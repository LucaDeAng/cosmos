-- Migration: 011_extend_source_types
-- Description: Add expert knowledge source types to knowledge_embeddings table
-- Created: 2025-12-09

-- Drop and recreate the check constraint to include new source types
ALTER TABLE knowledge_embeddings 
DROP CONSTRAINT IF EXISTS knowledge_embeddings_source_type_check;

ALTER TABLE knowledge_embeddings 
ADD CONSTRAINT knowledge_embeddings_source_type_check 
CHECK (source_type IN (
    'document',           -- Uploaded documents
    'assessment',         -- Client assessments
    'portfolio_item',     -- Portfolio items (products/services)
    'initiative',         -- Initiatives
    'strategy',           -- Strategy analyses
    'roadmap',            -- Roadmap items
    'budget',             -- Budget optimizations
    'conversation',       -- Chat history
    'external',           -- External knowledge base
    -- Expert knowledge types
    'framework',          -- Consulting frameworks (McKinsey, BCG, Gartner)
    'methodology',        -- Prioritization methodologies (WSJF, SAFe)
    'benchmark',          -- Industry benchmarks and KPIs
    'best_practice',      -- Best practices and implementation patterns
    -- Catalog types (existing data)
    'catalog_it_services',       -- IT services catalog
    'catalog_technologies',      -- Technologies catalog
    'catalog_portfolio_taxonomy', -- Portfolio taxonomy catalog
    'catalog_prioritization',    -- Prioritization catalog
    'catalog_examples',          -- Examples catalog
    'catalog_entities',          -- Entities catalog
    'catalog_industries',        -- Industries catalog
    'catalog_products'           -- Products catalog
));

-- Add comment documenting the new types
COMMENT ON COLUMN knowledge_embeddings.source_type IS
'Type of source content. Original types: document, assessment, portfolio_item, initiative, strategy, roadmap, budget, conversation, external. Expert knowledge types: framework (McKinsey 7S, BCG Matrix, etc.), methodology (WSJF, SAFe), benchmark (industry KPIs), best_practice (implementation patterns). Catalog types: catalog_it_services, catalog_technologies, catalog_portfolio_taxonomy, catalog_prioritization, catalog_examples, catalog_entities, catalog_industries, catalog_products.';
