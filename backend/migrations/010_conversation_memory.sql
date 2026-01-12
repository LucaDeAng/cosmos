-- Migration: 010_conversation_memory
-- Description: Tables for persistent conversation memory across AI agent sessions
-- Created: 2025-01-XX

-- Conversation sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Session info
    title TEXT DEFAULT 'New Conversation',
    summary TEXT,
    message_count INTEGER DEFAULT 0,
    
    -- Metadata for filtering and context
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    
    -- Message content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    agent_name TEXT, -- Which agent generated this response
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_company 
    ON conversation_sessions(company_id);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user 
    ON conversation_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_updated 
    ON conversation_sessions(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_session 
    ON conversation_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_created 
    ON conversation_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_role 
    ON conversation_messages(role);

-- Full text search index on message content
CREATE INDEX IF NOT EXISTS idx_conversation_messages_content_search 
    ON conversation_messages USING gin(to_tsvector('english', content));

-- Function to automatically update session updated_at and message_count
CREATE OR REPLACE FUNCTION update_conversation_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversation_sessions
    SET updated_at = NOW(),
        message_count = (
            SELECT COUNT(*) FROM conversation_messages WHERE session_id = NEW.session_id
        )
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating session on new message
DROP TRIGGER IF EXISTS trigger_conversation_message_insert ON conversation_messages;
CREATE TRIGGER trigger_conversation_message_insert
    AFTER INSERT ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_session_on_message();

-- Function to get conversation context (recent messages + summary)
CREATE OR REPLACE FUNCTION get_conversation_context(
    p_session_id UUID,
    p_window_size INTEGER DEFAULT 10
)
RETURNS TABLE (
    session_summary TEXT,
    total_messages INTEGER,
    messages JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.summary AS session_summary,
        cs.message_count AS total_messages,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', cm.id,
                        'role', cm.role,
                        'content', cm.content,
                        'agent_name', cm.agent_name,
                        'timestamp', cm.created_at
                    ) ORDER BY cm.created_at DESC
                )
                FROM (
                    SELECT * FROM conversation_messages
                    WHERE session_id = p_session_id
                    ORDER BY created_at DESC
                    LIMIT p_window_size
                ) cm
            ),
            '[]'::jsonb
        ) AS messages
    FROM conversation_sessions cs
    WHERE cs.id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access sessions for their company
CREATE POLICY conversation_sessions_company_isolation ON conversation_sessions
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM users WHERE id = auth.uid()
    ));

-- Policy: Users can only access messages from their company's sessions
CREATE POLICY conversation_messages_company_isolation ON conversation_messages
    FOR ALL
    USING (session_id IN (
        SELECT id FROM conversation_sessions WHERE company_id IN (
            SELECT company_id FROM users WHERE id = auth.uid()
        )
    ));

-- Grant permissions
GRANT ALL ON conversation_sessions TO authenticated;
GRANT ALL ON conversation_messages TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversation_context TO authenticated;

-- Comments
COMMENT ON TABLE conversation_sessions IS 'Stores conversation sessions for AI agent interactions';
COMMENT ON TABLE conversation_messages IS 'Stores individual messages within conversation sessions';
COMMENT ON COLUMN conversation_sessions.summary IS 'Auto-generated summary of older messages for context window management';
COMMENT ON FUNCTION get_conversation_context IS 'Returns recent messages and summary for a conversation session';
