-- Migration 019: Quality Gates and Quality Alerts with MCP
-- Creates tables for quality gates and alerts with Model Context Protocol support

CREATE TABLE IF NOT EXISTS quality_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gate_name VARCHAR(255) NOT NULL,
  gate_type VARCHAR(50) NOT NULL, -- 'confidence', 'completeness', 'consistency', 'custom'
  threshold DECIMAL(5,2) NOT NULL, -- Threshold value for the gate
  operator VARCHAR(10) NOT NULL, -- '>=', '<=', '>', '<', '=='
  description TEXT,
  is_blocking BOOLEAN DEFAULT false, -- If true, gate must pass to proceed
  applies_to VARCHAR(50) DEFAULT 'all', -- 'assessments', 'portfolio_items', 'ingestion', 'all'
  mcp_enabled BOOLEAN DEFAULT false,
  mcp_config JSONB DEFAULT '{}', -- MCP configuration for remote execution
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  gate_id UUID NOT NULL REFERENCES quality_gates(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'warning', 'error', 'critical'
  item_id UUID, -- Can reference portfolio_items, assessments, etc.
  item_type VARCHAR(50), -- 'assessment', 'portfolio_item', 'ingestion'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  mcp_triggered BOOLEAN DEFAULT false, -- Whether alert was triggered by MCP check
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quality_gates_company_id ON quality_gates(company_id);
CREATE INDEX idx_quality_gates_active ON quality_gates(is_active);
CREATE INDEX idx_quality_gates_blocking ON quality_gates(is_blocking);
CREATE INDEX idx_quality_gates_mcp_enabled ON quality_gates(mcp_enabled);

CREATE INDEX idx_quality_alerts_company_id ON quality_alerts(company_id);
CREATE INDEX idx_quality_alerts_gate_id ON quality_alerts(gate_id);
CREATE INDEX idx_quality_alerts_resolved ON quality_alerts(is_resolved);
CREATE INDEX idx_quality_alerts_alert_type ON quality_alerts(alert_type);
CREATE INDEX idx_quality_alerts_mcp_triggered ON quality_alerts(mcp_triggered);
CREATE INDEX idx_quality_alerts_created_at ON quality_alerts(created_at DESC);

COMMENT ON TABLE quality_gates IS 'Defines quality gates and thresholds for assessment and portfolio items';
COMMENT ON TABLE quality_alerts IS 'Records quality alerts triggered by gate violations, with MCP support';
COMMENT ON COLUMN quality_gates.mcp_enabled IS 'If true, this gate uses Model Context Protocol for remote validation';
COMMENT ON COLUMN quality_alerts.mcp_triggered IS 'Indicates if the alert was triggered by MCP-based remote check';
