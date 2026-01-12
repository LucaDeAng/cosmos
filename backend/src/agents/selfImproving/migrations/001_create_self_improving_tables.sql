-- ============================================================================
-- Self-Improving RAG System - Database Migration
-- ============================================================================
-- Run this migration on your Supabase database to create the necessary tables
-- for the self-improving RAG system.
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. Learned Patterns Table
-- ============================================================================
-- Stores patterns learned from extractions and user feedback

CREATE TABLE IF NOT EXISTS rag_learned_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'field_extraction',
    'entity_classification',
    'normalization',
    'relationship',
    'context_detection'
  )),
  source_type TEXT NOT NULL,
  input_pattern TEXT NOT NULL,
  output_mapping JSONB NOT NULL,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Indexes for common queries
  CONSTRAINT valid_success_count CHECK (success_count <= usage_count)
);

CREATE INDEX IF NOT EXISTS idx_patterns_type ON rag_learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_source ON rag_learned_patterns(source_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON rag_learned_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_usage ON rag_learned_patterns(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_last_used ON rag_learned_patterns(last_used DESC);

-- ============================================================================
-- 2. Extraction Feedback Table
-- ============================================================================
-- Stores user feedback on extractions (corrections, approvals, rejections)

CREATE TABLE IF NOT EXISTS rag_extraction_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  extraction_id TEXT NOT NULL,
  item_index INTEGER NOT NULL DEFAULT 0,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'correction',
    'rejection',
    'approval',
    'addition',
    'category_change',
    'merge',
    'split'
  )),
  original_value JSONB,
  corrected_value JSONB,
  field_name TEXT NOT NULL,
  user_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  pattern_generated BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Document context
  document_id TEXT,
  document_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_extraction ON rag_extraction_feedback(extraction_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON rag_extraction_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_processed ON rag_extraction_feedback(processed);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON rag_extraction_feedback(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_field ON rag_extraction_feedback(field_name);

-- ============================================================================
-- 3. Extraction Metrics Table
-- ============================================================================
-- Stores metrics for each extraction to track system performance

CREATE TABLE IF NOT EXISTS rag_extraction_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  extraction_id TEXT NOT NULL UNIQUE,
  document_id TEXT,
  document_type TEXT,
  source_type TEXT,
  
  -- Extraction stats
  items_extracted INTEGER NOT NULL DEFAULT 0,
  items_approved INTEGER NOT NULL DEFAULT 0,
  items_corrected INTEGER NOT NULL DEFAULT 0,
  items_rejected INTEGER NOT NULL DEFAULT 0,
  
  -- Quality metrics
  extraction_accuracy DECIMAL(5,4) CHECK (extraction_accuracy >= 0 AND extraction_accuracy <= 1),
  field_accuracy JSONB DEFAULT '{}'::JSONB,
  avg_confidence DECIMAL(5,4) CHECK (avg_confidence >= 0 AND avg_confidence <= 1),
  
  -- Performance metrics
  processing_time_ms INTEGER,
  tokens_used INTEGER,
  
  -- RAG metrics
  rag_context_used BOOLEAN DEFAULT FALSE,
  rag_match_count INTEGER DEFAULT 0,
  rag_avg_similarity DECIMAL(5,4),
  
  -- Pattern metrics
  patterns_applied INTEGER DEFAULT 0,
  patterns_successful INTEGER DEFAULT 0,
  
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_document ON rag_extraction_metrics(document_id);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON rag_extraction_metrics(document_type);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON rag_extraction_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_accuracy ON rag_extraction_metrics(extraction_accuracy);

-- ============================================================================
-- 4. Synthetic Examples Table
-- ============================================================================
-- Stores synthetic and augmented examples for training

CREATE TABLE IF NOT EXISTS rag_synthetic_examples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  example_type TEXT NOT NULL CHECK (example_type IN (
    'generated',
    'augmented',
    'variation',
    'edge_case',
    'user_provided'
  )),
  source_pattern UUID REFERENCES rag_learned_patterns(id) ON DELETE SET NULL,
  source_document TEXT,
  
  input_data JSONB NOT NULL,
  expected_output JSONB NOT NULL,
  
  category TEXT NOT NULL,
  industry TEXT,
  complexity TEXT CHECK (complexity IN ('simple', 'medium', 'complex')),
  
  used_in_training INTEGER NOT NULL DEFAULT 0,
  effectiveness DECIMAL(5,4) DEFAULT 0 CHECK (effectiveness >= 0 AND effectiveness <= 1),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Full text search on input
  input_text_search TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(input_data->>'text', ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_synthetic_type ON rag_synthetic_examples(example_type);
CREATE INDEX IF NOT EXISTS idx_synthetic_category ON rag_synthetic_examples(category);
CREATE INDEX IF NOT EXISTS idx_synthetic_industry ON rag_synthetic_examples(industry);
CREATE INDEX IF NOT EXISTS idx_synthetic_complexity ON rag_synthetic_examples(complexity);
CREATE INDEX IF NOT EXISTS idx_synthetic_effectiveness ON rag_synthetic_examples(effectiveness DESC);
CREATE INDEX IF NOT EXISTS idx_synthetic_text_search ON rag_synthetic_examples USING GIN(input_text_search);

-- ============================================================================
-- 5. Catalog Enrichments Table
-- ============================================================================
-- Stores proposed and applied enrichments to the knowledge catalogs

CREATE TABLE IF NOT EXISTS rag_catalog_enrichments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_type TEXT NOT NULL CHECK (catalog_type IN (
    'products',
    'industries',
    'entities',
    'examples',
    'vendors',
    'categories'
  )),
  enrichment_type TEXT NOT NULL CHECK (enrichment_type IN (
    'new_entry',
    'synonym',
    'relationship',
    'attribute',
    'example',
    'correction'
  )),
  entry_id TEXT,  -- ID of existing entry if modifying
  
  content JSONB NOT NULL,
  
  source_type TEXT NOT NULL CHECK (source_type IN (
    'pattern',
    'feedback',
    'extraction',
    'manual'
  )),
  source_id TEXT NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'applied',
    'superseded'
  )),
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrichment_catalog ON rag_catalog_enrichments(catalog_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_type ON rag_catalog_enrichments(enrichment_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_status ON rag_catalog_enrichments(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_source ON rag_catalog_enrichments(source_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_created ON rag_catalog_enrichments(created_at DESC);

-- ============================================================================
-- 6. Learning Sessions Table
-- ============================================================================
-- Tracks learning sessions and their outcomes

CREATE TABLE IF NOT EXISTS rag_learning_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  trigger TEXT NOT NULL CHECK (trigger IN (
    'scheduled',
    'threshold',
    'manual',
    'feedback_volume'
  )),
  
  patterns_analyzed INTEGER DEFAULT 0,
  patterns_learned INTEGER DEFAULT 0,
  patterns_updated INTEGER DEFAULT 0,
  patterns_deprecated INTEGER DEFAULT 0,
  
  feedback_processed INTEGER DEFAULT 0,
  synthetic_generated INTEGER DEFAULT 0,
  enrichments_created INTEGER DEFAULT 0,
  
  accuracy_before DECIMAL(5,4),
  accuracy_after DECIMAL(5,4),
  
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'running',
    'completed',
    'failed'
  )),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON rag_learning_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON rag_learning_sessions(started_at DESC);

-- ============================================================================
-- 7. Utility Functions
-- ============================================================================

-- Function to update pattern confidence based on usage
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.usage_count > 0 THEN
    NEW.confidence := (NEW.success_count::DECIMAL / NEW.usage_count::DECIMAL) * 
                      (1 - EXP(-NEW.usage_count::DECIMAL / 10)); -- Bayesian-like update
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update confidence
DROP TRIGGER IF EXISTS trigger_update_pattern_confidence ON rag_learned_patterns;
CREATE TRIGGER trigger_update_pattern_confidence
  BEFORE UPDATE OF usage_count, success_count ON rag_learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_confidence();

-- Function to calculate extraction accuracy after feedback
CREATE OR REPLACE FUNCTION calculate_extraction_accuracy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.items_extracted > 0 THEN
    NEW.extraction_accuracy := 
      (NEW.items_approved::DECIMAL + (NEW.items_corrected::DECIMAL * 0.5)) / 
      NEW.items_extracted::DECIMAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate accuracy
DROP TRIGGER IF EXISTS trigger_calculate_accuracy ON rag_extraction_metrics;
CREATE TRIGGER trigger_calculate_accuracy
  BEFORE UPDATE OF items_approved, items_corrected, items_rejected ON rag_extraction_metrics
  FOR EACH ROW
  EXECUTE FUNCTION calculate_extraction_accuracy();

-- ============================================================================
-- 8. Views for Analytics
-- ============================================================================

-- View: Daily accuracy trends
CREATE OR REPLACE VIEW v_daily_accuracy AS
SELECT 
  DATE_TRUNC('day', timestamp) AS day,
  COUNT(*) AS extractions,
  AVG(extraction_accuracy) AS avg_accuracy,
  AVG(avg_confidence) AS avg_confidence,
  SUM(items_extracted) AS total_items,
  SUM(patterns_applied) AS patterns_used,
  AVG(CASE WHEN patterns_applied > 0 THEN patterns_successful::DECIMAL / patterns_applied END) AS pattern_success_rate
FROM rag_extraction_metrics
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY day DESC;

-- View: Pattern effectiveness
CREATE OR REPLACE VIEW v_pattern_effectiveness AS
SELECT 
  p.id,
  p.pattern_type,
  p.source_type,
  p.confidence,
  p.usage_count,
  p.success_count,
  CASE WHEN p.usage_count > 0 THEN p.success_count::DECIMAL / p.usage_count END AS success_rate,
  p.last_used,
  p.created_at,
  AGE(NOW(), p.last_used) AS age_since_last_use
FROM rag_learned_patterns p
WHERE p.usage_count > 0
ORDER BY p.confidence DESC, p.usage_count DESC;

-- View: Feedback summary
CREATE OR REPLACE VIEW v_feedback_summary AS
SELECT 
  feedback_type,
  field_name,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE processed) AS processed_count,
  COUNT(*) FILTER (WHERE pattern_generated) AS patterns_generated
FROM rag_extraction_feedback
GROUP BY feedback_type, field_name
ORDER BY count DESC;

-- View: Pending enrichments
CREATE OR REPLACE VIEW v_pending_enrichments AS
SELECT 
  e.*,
  CASE 
    WHEN e.confidence >= 0.9 THEN 'high'
    WHEN e.confidence >= 0.7 THEN 'medium'
    ELSE 'low'
  END AS confidence_level
FROM rag_catalog_enrichments e
WHERE e.status = 'pending'
ORDER BY e.confidence DESC, e.created_at;

-- ============================================================================
-- 9. Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE rag_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_extraction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_extraction_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_synthetic_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_catalog_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_learning_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for authenticated" ON rag_learned_patterns FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON rag_extraction_feedback FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON rag_extraction_metrics FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON rag_synthetic_examples FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON rag_catalog_enrichments FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON rag_learning_sessions FOR ALL USING (true);

-- ============================================================================
-- 10. Initial Data (Optional)
-- ============================================================================

-- Insert some initial patterns based on common extraction patterns
INSERT INTO rag_learned_patterns (pattern_type, source_type, input_pattern, output_mapping, confidence, metadata)
VALUES 
  (
    'field_extraction',
    'pdf',
    '(?i)version[:\s]+(\d+\.?\d*\.?\d*)',
    '{"targetField": "version", "transformationType": "direct", "transformationConfig": {"captureGroup": 1}}'::JSONB,
    0.7,
    '{"learnedFrom": ["initial"], "documentTypes": ["pdf"], "industries": [], "categories": [], "examples": []}'::JSONB
  ),
  (
    'field_extraction',
    'pdf',
    '(?i)(?:vendor|manufacturer|made by|by)[:\s]+([A-Za-z0-9\s&]+?)(?:\.|,|$|\n)',
    '{"targetField": "vendor", "transformationType": "direct", "transformationConfig": {"captureGroup": 1, "trim": true}}'::JSONB,
    0.65,
    '{"learnedFrom": ["initial"], "documentTypes": ["pdf"], "industries": [], "categories": [], "examples": []}'::JSONB
  ),
  (
    'entity_classification',
    'text',
    '(?i)(service|platform|solution|tool|software|application|system)',
    '{"targetField": "type", "transformationType": "lookup", "transformationConfig": {"lookupTable": {"service": "service", "platform": "product", "solution": "product", "tool": "product", "software": "product", "application": "product", "system": "product"}}}'::JSONB,
    0.6,
    '{"learnedFrom": ["initial"], "documentTypes": ["text", "pdf"], "industries": [], "categories": [], "examples": []}'::JSONB
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- 
-- Tables created:
-- - rag_learned_patterns: Stores learned extraction patterns
-- - rag_extraction_feedback: Stores user feedback on extractions
-- - rag_extraction_metrics: Stores extraction performance metrics
-- - rag_synthetic_examples: Stores synthetic training examples
-- - rag_catalog_enrichments: Stores catalog enrichment proposals
-- - rag_learning_sessions: Tracks learning session outcomes
--
-- Views created:
-- - v_daily_accuracy: Daily accuracy trends
-- - v_pattern_effectiveness: Pattern performance metrics
-- - v_feedback_summary: Feedback aggregation by type
-- - v_pending_enrichments: Pending enrichment proposals
--
-- Functions created:
-- - update_pattern_confidence(): Auto-updates pattern confidence
-- - calculate_extraction_accuracy(): Auto-calculates extraction accuracy
-- ============================================================================
