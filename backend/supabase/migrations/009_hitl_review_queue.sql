-- Migration: HITL (Human-in-the-Loop) Review Queue - Phase 3
-- Created: 2025-12-17
-- Description: Creates tables and functions for confidence-based review workflow

-- ============================================================
-- REVIEW QUEUE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Item reference
  item_id UUID NOT NULL,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('product', 'service')),
  item_name VARCHAR(500) NOT NULL,
  item_data JSONB NOT NULL, -- Full item data

  -- Extraction metadata
  extraction_id UUID, -- Link to document_extractions
  source_file VARCHAR(500),
  source_type VARCHAR(50), -- 'pdf_table', 'excel_row', etc.

  -- Confidence data
  confidence_overall DECIMAL(3,2) NOT NULL CHECK (confidence_overall >= 0 AND confidence_overall <= 1),
  confidence_breakdown JSONB NOT NULL, -- Full breakdown object

  -- Review routing
  review_tier VARCHAR(20) NOT NULL CHECK (review_tier IN ('auto_accept', 'quick_review', 'manual_review', 'full_edit')),
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10), -- Higher = more urgent

  -- Review status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'edited')),
  assigned_to UUID, -- Reference to user (if assignment enabled)

  -- Review actions
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  edit_history JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Auto-expire old items after X days
);

-- ============================================================
-- REVIEW STATISTICS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS review_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Daily counts
  items_submitted INTEGER DEFAULT 0,
  items_auto_accepted INTEGER DEFAULT 0,
  items_quick_reviewed INTEGER DEFAULT 0,
  items_manual_reviewed INTEGER DEFAULT 0,
  items_rejected INTEGER DEFAULT 0,

  -- Average metrics
  avg_confidence DECIMAL(3,2),
  avg_review_time_seconds INTEGER, -- Time spent in review

  -- Quality metrics
  auto_accept_accuracy DECIMAL(3,2), -- % of auto-accepted items that were correct
  review_efficiency DECIMAL(3,2), -- % of items that needed no edits

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Review queue indexes
CREATE INDEX IF NOT EXISTS idx_review_queue_tenant ON review_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_tier ON review_queue(review_tier);
CREATE INDEX IF NOT EXISTS idx_review_queue_confidence ON review_queue(confidence_overall);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_created ON review_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned ON review_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_review_queue_expires ON review_queue(expires_at) WHERE expires_at IS NOT NULL;

-- Composite index for queue ordering (most common query)
CREATE INDEX IF NOT EXISTS idx_review_queue_pending_priority
  ON review_queue(tenant_id, status, priority DESC, created_at)
  WHERE status = 'pending';

-- GIN index for JSONB columns
CREATE INDEX IF NOT EXISTS idx_review_queue_item_data ON review_queue USING GIN (item_data);
CREATE INDEX IF NOT EXISTS idx_review_queue_confidence_breakdown ON review_queue USING GIN (confidence_breakdown);

-- Review statistics indexes
CREATE INDEX IF NOT EXISTS idx_review_stats_tenant_date ON review_statistics(tenant_id, date DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update trigger for review_queue
DROP TRIGGER IF EXISTS update_review_queue_updated_at ON review_queue;
CREATE TRIGGER update_review_queue_updated_at
  BEFORE UPDATE ON review_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

/**
 * Function to route items to review queue based on confidence
 * Returns the review tier for an item
 */
CREATE OR REPLACE FUNCTION calculate_review_tier(confidence DECIMAL)
RETURNS VARCHAR(20) AS $$
BEGIN
  IF confidence >= 0.9 THEN
    RETURN 'auto_accept';
  ELSIF confidence >= 0.7 THEN
    RETURN 'quick_review';
  ELSIF confidence >= 0.5 THEN
    RETURN 'manual_review';
  ELSE
    RETURN 'full_edit';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Function to calculate priority based on confidence and business value
 */
CREATE OR REPLACE FUNCTION calculate_review_priority(
  confidence DECIMAL,
  business_value INTEGER,
  strategic_alignment INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  priority INTEGER := 5; -- Default medium priority
BEGIN
  -- Lower confidence = higher priority (needs attention)
  IF confidence < 0.5 THEN
    priority := priority + 3;
  ELSIF confidence < 0.7 THEN
    priority := priority + 1;
  END IF;

  -- Higher business value = higher priority
  IF business_value IS NOT NULL AND business_value >= 8 THEN
    priority := priority + 2;
  ELSIF business_value IS NOT NULL AND business_value >= 6 THEN
    priority := priority + 1;
  END IF;

  -- Higher strategic alignment = higher priority
  IF strategic_alignment IS NOT NULL AND strategic_alignment >= 8 THEN
    priority := priority + 1;
  END IF;

  -- Clamp to 1-10 range
  RETURN GREATEST(1, LEAST(10, priority));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Function to get pending review items for a tenant
 */
CREATE OR REPLACE FUNCTION get_review_queue(
  p_tenant_id UUID,
  p_tier VARCHAR(20) DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  item_name VARCHAR,
  item_type VARCHAR,
  confidence_overall DECIMAL,
  review_tier VARCHAR,
  priority INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rq.id,
    rq.item_name,
    rq.item_type,
    rq.confidence_overall,
    rq.review_tier,
    rq.priority,
    rq.created_at
  FROM review_queue rq
  WHERE rq.tenant_id = p_tenant_id
    AND rq.status = 'pending'
    AND (p_tier IS NULL OR rq.review_tier = p_tier)
  ORDER BY rq.priority DESC, rq.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to approve a review item
 */
CREATE OR REPLACE FUNCTION approve_review_item(
  p_item_id UUID,
  p_reviewed_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE review_queue
  SET
    status = 'approved',
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW(),
    review_notes = p_notes
  WHERE id = p_item_id AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to reject a review item
 */
CREATE OR REPLACE FUNCTION reject_review_item(
  p_item_id UUID,
  p_reviewed_by UUID,
  p_notes TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE review_queue
  SET
    status = 'rejected',
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW(),
    review_notes = p_notes
  WHERE id = p_item_id AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to bulk approve items
 */
CREATE OR REPLACE FUNCTION bulk_approve_items(
  p_item_ids UUID[],
  p_reviewed_by UUID
)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE review_queue
  SET
    status = 'approved',
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW(),
    review_notes = 'Bulk approved'
  WHERE id = ANY(p_item_ids) AND status = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

/**
 * Function to update daily review statistics
 */
CREATE OR REPLACE FUNCTION update_review_statistics(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO review_statistics (
    tenant_id,
    date,
    items_submitted,
    items_auto_accepted,
    items_quick_reviewed,
    items_manual_reviewed,
    items_rejected,
    avg_confidence
  )
  SELECT
    p_tenant_id,
    CURRENT_DATE,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE),
    COUNT(*) FILTER (WHERE review_tier = 'auto_accept' AND status = 'approved'),
    COUNT(*) FILTER (WHERE review_tier = 'quick_review' AND status = 'approved'),
    COUNT(*) FILTER (WHERE review_tier = 'manual_review' AND status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    AVG(confidence_overall)
  FROM review_queue
  WHERE tenant_id = p_tenant_id
    AND created_at >= CURRENT_DATE
  ON CONFLICT (tenant_id, date) DO UPDATE
  SET
    items_submitted = EXCLUDED.items_submitted,
    items_auto_accepted = EXCLUDED.items_auto_accepted,
    items_quick_reviewed = EXCLUDED.items_quick_reviewed,
    items_manual_reviewed = EXCLUDED.items_manual_reviewed,
    items_rejected = EXCLUDED.items_rejected,
    avg_confidence = EXCLUDED.avg_confidence;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_statistics ENABLE ROW LEVEL SECURITY;

-- Policies for review_queue
DROP POLICY IF EXISTS review_queue_tenant_isolation ON review_queue;
CREATE POLICY review_queue_tenant_isolation ON review_queue
  FOR ALL
  USING (tenant_id IN (
    SELECT company_id FROM users WHERE id = auth.uid()
  ));

-- Policies for review_statistics
DROP POLICY IF EXISTS review_stats_tenant_isolation ON review_statistics;
CREATE POLICY review_stats_tenant_isolation ON review_statistics
  FOR ALL
  USING (tenant_id IN (
    SELECT company_id FROM users WHERE id = auth.uid()
  ));

-- ============================================================
-- GRANTS
-- ============================================================

GRANT ALL ON review_queue TO authenticated;
GRANT ALL ON review_statistics TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE review_queue IS 'Human-in-the-Loop review queue for AI-extracted portfolio items (Phase 3)';
COMMENT ON TABLE review_statistics IS 'Daily statistics for review queue performance and quality metrics';

COMMENT ON COLUMN review_queue.review_tier IS 'Confidence-based tier: auto_accept (≥90%), quick_review (70-89%), manual_review (50-69%), full_edit (<50%)';
COMMENT ON COLUMN review_queue.priority IS 'Review priority (1-10, higher = more urgent) calculated from confidence, business value, and strategic alignment';
COMMENT ON COLUMN review_queue.expires_at IS 'Optional expiration date for auto-cleanup of old pending items';

COMMENT ON FUNCTION calculate_review_tier IS 'Maps confidence score to review tier';
COMMENT ON FUNCTION calculate_review_priority IS 'Calculates review priority from confidence and business metrics';
COMMENT ON FUNCTION get_review_queue IS 'Returns pending review items ordered by priority';
COMMENT ON FUNCTION bulk_approve_items IS 'Approves multiple items at once for bulk workflows';