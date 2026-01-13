-- Migration 023: Agent Error Logs
-- Structured error logging for agent system fault tolerance

CREATE TABLE IF NOT EXISTS agent_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  error_code VARCHAR(50) NOT NULL,
  agent_name VARCHAR(100),
  user_message TEXT,
  context JSONB DEFAULT '{}',
  stack_trace TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant-based queries
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant
  ON agent_error_logs(tenant_id);

-- Index for error code analysis
CREATE INDEX IF NOT EXISTS idx_error_logs_code
  ON agent_error_logs(error_code);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp
  ON agent_error_logs(timestamp DESC);

-- Index for unresolved errors
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved
  ON agent_error_logs(resolved)
  WHERE resolved = FALSE;

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_time
  ON agent_error_logs(tenant_id, timestamp DESC);

-- Enable RLS
ALTER TABLE agent_error_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their company's errors
CREATE POLICY "Users can view their company errors"
  ON agent_error_logs
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Service role can insert
CREATE POLICY "Service can insert errors"
  ON agent_error_logs
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update
CREATE POLICY "Service can update errors"
  ON agent_error_logs
  FOR UPDATE
  USING (true);

-- Comment
COMMENT ON TABLE agent_error_logs IS 'Structured logging of agent errors for monitoring and debugging';
