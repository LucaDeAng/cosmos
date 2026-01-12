-- Migration 018: Item Confidence Metrics for Dashboard
-- Creates tables for tracking item confidence metrics and quality indicators

CREATE TABLE IF NOT EXISTS item_confidence_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID REFERENCES portfolio_items(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  confidence_score DECIMAL(3,2) NOT NULL, -- 0-1 range
  data_quality_score DECIMAL(3,2) DEFAULT 0.0,
  completeness_score DECIMAL(3,2) DEFAULT 0.0,
  consistency_score DECIMAL(3,2) DEFAULT 0.0,
  validation_issues_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_validated_at TIMESTAMP WITH TIME ZONE,
  source_reliability DECIMAL(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}',
  dashboard_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_item_confidence_metrics_company_id ON item_confidence_metrics(company_id);
CREATE INDEX idx_item_confidence_metrics_item_id ON item_confidence_metrics(item_id);
CREATE INDEX idx_item_confidence_metrics_assessment_id ON item_confidence_metrics(assessment_id);
CREATE INDEX idx_item_confidence_metrics_confidence_score ON item_confidence_metrics(confidence_score);
CREATE INDEX idx_item_confidence_metrics_dashboard_visible ON item_confidence_metrics(dashboard_visible);

COMMENT ON TABLE item_confidence_metrics IS 'Stores confidence and quality metrics for items displayed in dashboards';
COMMENT ON COLUMN item_confidence_metrics.confidence_score IS 'Overall confidence score (0-1)';
COMMENT ON COLUMN item_confidence_metrics.data_quality_score IS 'Score based on data validation (0-1)';
COMMENT ON COLUMN item_confidence_metrics.completeness_score IS 'Score based on required fields (0-1)';
