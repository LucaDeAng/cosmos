/**
 * Conversation Memory Service
 * 
 * Provides persistent conversation memory for AI agents using Supabase.
 * Implements a sliding window memory with summarization for long conversations.
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { supabase } from '../../config/supabase';

// Types
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agentName?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ConversationSession {
  id: string;
  companyId: string;
  userId?: string;
  title?: string;
  summary?: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface MemoryWindow {
  recentMessages: ConversationMessage[];
  summary: string | null;
  totalMessages: number;
}

// Constants
const DEFAULT_WINDOW_SIZE = 10;
const SUMMARY_THRESHOLD = 20; // Summarize after this many messages
const MAX_SUMMARY_LENGTH = 1000;

// LLM for summarization
const summarizationLlm = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 500,
});

/**
 * Create a new conversation session
 */
export async function createSession(
  companyId: string,
  userId?: string,
  title?: string,
  metadata?: Record<string, unknown>
): Promise<ConversationSession> {
  const session = {
    id: uuidv4(),
    company_id: companyId,
    user_id: userId,
    title: title || 'New Conversation',
    summary: null,
    message_count: 0,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('conversation_sessions')
    .insert(session)
    .select()
    .single();

  if (error) {
    console.error('[ConversationMemory] Error creating session:', error);
    throw error;
  }

  return mapSessionFromDb(data);
}

/**
 * Get an existing session by ID
 */
export async function getSession(sessionId: string): Promise<ConversationSession | null> {
  const { data, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[ConversationMemory] Error getting session:', error);
    throw error;
  }

  return mapSessionFromDb(data);
}

/**
 * List sessions for a company
 */
export async function listSessions(
  companyId: string,
  limit: number = 20
): Promise<ConversationSession[]> {
  const { data, error } = await supabase
    .from('conversation_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ConversationMemory] Error listing sessions:', error);
    throw error;
  }

  return (data || []).map(mapSessionFromDb);
}

/**
 * Add a message to a session
 */
export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agentName?: string,
  metadata?: Record<string, unknown>
): Promise<ConversationMessage> {
  const message = {
    id: uuidv4(),
    session_id: sessionId,
    role,
    content,
    agent_name: agentName,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('conversation_messages')
    .insert(message)
    .select()
    .single();

  if (error) {
    console.error('[ConversationMemory] Error adding message:', error);
    throw error;
  }

  // Update session message count and timestamp
  await supabase
    .from('conversation_sessions')
    .update({
      message_count: supabase.rpc('increment', { x: 1 }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  // Check if we need to summarize
  const session = await getSession(sessionId);
  if (session && session.messageCount >= SUMMARY_THRESHOLD && session.messageCount % 10 === 0) {
    await updateSessionSummary(sessionId);
  }

  return mapMessageFromDb(data);
}

/**
 * Get messages from a session
 */
export async function getMessages(
  sessionId: string,
  limit?: number,
  offset: number = 0
): Promise<ConversationMessage[]> {
  let query = supabase
    .from('conversation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (limit) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[ConversationMemory] Error getting messages:', error);
    throw error;
  }

  return (data || []).map(mapMessageFromDb);
}

/**
 * Get a memory window with recent messages and summary
 */
export async function getMemoryWindow(
  sessionId: string,
  windowSize: number = DEFAULT_WINDOW_SIZE
): Promise<MemoryWindow> {
  // Get session for summary
  const session = await getSession(sessionId);
  if (!session) {
    return {
      recentMessages: [],
      summary: null,
      totalMessages: 0,
    };
  }

  // Get recent messages
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(windowSize);

  if (error) {
    console.error('[ConversationMemory] Error getting memory window:', error);
    throw error;
  }

  const recentMessages = (data || [])
    .map(mapMessageFromDb)
    .reverse(); // Restore chronological order

  return {
    recentMessages,
    summary: session.summary || null,
    totalMessages: session.messageCount,
  };
}

/**
 * Format memory window for LLM context
 */
export function formatMemoryForContext(memory: MemoryWindow): string {
  const parts: string[] = [];

  // Add summary if available
  if (memory.summary) {
    parts.push(`## Previous Conversation Summary\n${memory.summary}\n`);
  }

  // Add recent messages
  if (memory.recentMessages.length > 0) {
    parts.push('## Recent Messages');
    for (const msg of memory.recentMessages) {
      const agentLabel = msg.agentName ? ` [${msg.agentName}]` : '';
      parts.push(`**${msg.role.toUpperCase()}${agentLabel}**: ${msg.content}`);
    }
  }

  if (parts.length === 0) {
    return 'No conversation history.';
  }

  return parts.join('\n\n');
}

/**
 * Update session summary by summarizing older messages
 */
async function updateSessionSummary(sessionId: string): Promise<void> {
  console.log('[ConversationMemory] Updating session summary for:', sessionId);

  // Get all messages except the most recent window
  const { data: allMessages, error } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error || !allMessages || allMessages.length <= DEFAULT_WINDOW_SIZE) {
    return;
  }

  // Get messages to summarize (excluding recent window)
  const messagesToSummarize = allMessages
    .slice(0, -DEFAULT_WINDOW_SIZE)
    .map(mapMessageFromDb);

  if (messagesToSummarize.length === 0) {
    return;
  }

  // Format messages for summarization
  const messagesText = messagesToSummarize
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  // Generate summary using LLM
  try {
    const summaryPrompt = `Summarize the following conversation, focusing on:
1. Key topics discussed
2. Important decisions or conclusions
3. Outstanding questions or action items
4. Any specific data or numbers mentioned

Keep the summary concise (max 500 words) and factual.

CONVERSATION:
${messagesText}

SUMMARY:`;

    const response = await summarizationLlm.invoke(summaryPrompt);
    const summary = typeof response.content === 'string' 
      ? response.content.slice(0, MAX_SUMMARY_LENGTH)
      : '';

    // Update session with summary
    await supabase
      .from('conversation_sessions')
      .update({ summary })
      .eq('id', sessionId);

    console.log('[ConversationMemory] Summary updated successfully');
  } catch (err) {
    console.error('[ConversationMemory] Error generating summary:', err);
  }
}

/**
 * Delete a session and its messages
 */
export async function deleteSession(sessionId: string): Promise<void> {
  // Delete messages first (cascade should handle this, but being explicit)
  await supabase
    .from('conversation_messages')
    .delete()
    .eq('session_id', sessionId);

  const { error } = await supabase
    .from('conversation_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('[ConversationMemory] Error deleting session:', error);
    throw error;
  }
}

/**
 * Clear all messages from a session but keep the session
 */
export async function clearSessionMessages(sessionId: string): Promise<void> {
  await supabase
    .from('conversation_messages')
    .delete()
    .eq('session_id', sessionId);

  await supabase
    .from('conversation_sessions')
    .update({
      message_count: 0,
      summary: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Search conversation history
 */
export async function searchConversations(
  companyId: string,
  query: string,
  limit: number = 20
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select(`
      *,
      conversation_sessions!inner(company_id)
    `)
    .eq('conversation_sessions.company_id', companyId)
    .textSearch('content', query)
    .limit(limit);

  if (error) {
    console.error('[ConversationMemory] Error searching conversations:', error);
    throw error;
  }

  return (data || []).map(mapMessageFromDb);
}

// Helper functions to map database records to types
function mapSessionFromDb(data: any): ConversationSession {
  return {
    id: data.id,
    companyId: data.company_id,
    userId: data.user_id,
    title: data.title,
    summary: data.summary,
    messageCount: data.message_count || 0,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
    metadata: data.metadata,
  };
}

function mapMessageFromDb(data: any): ConversationMessage {
  return {
    id: data.id,
    role: data.role,
    content: data.content,
    agentName: data.agent_name,
    timestamp: new Date(data.created_at),
    metadata: data.metadata,
  };
}

// Export default object with all functions
export default {
  createSession,
  getSession,
  listSessions,
  addMessage,
  getMessages,
  getMemoryWindow,
  formatMemoryForContext,
  deleteSession,
  clearSessionMessages,
  searchConversations,
};
