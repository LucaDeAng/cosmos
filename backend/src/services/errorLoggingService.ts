/**
 * Error Logging Service - Structured error persistence and analysis
 *
 * Provides persistent storage for agent errors, enabling:
 * - Error analysis and trending
 * - Pattern detection in failures
 * - Debugging and incident response
 */

import { supabase } from '../config/supabase';
import type { AgentError, ErrorContext } from '../agents/schemas/errorSchema';

export interface ErrorLogEntry {
  id?: string;
  tenantId?: string;
  timestamp: Date;
  errorCode: string;
  agentName?: string;
  userMessage?: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
  resolved: boolean;
  resolution?: string;
}

export interface ErrorStats {
  totalErrors: number;
  byCode: Record<string, number>;
  byAgent: Record<string, number>;
  recentErrors: ErrorLogEntry[];
  errorRate: number; // errors per hour
}

/**
 * Log an agent error to the database
 */
export async function logAgentError(
  error: AgentError,
  additionalContext?: {
    tenantId?: string;
    userMessage?: string;
    requestId?: string;
  }
): Promise<string | null> {
  try {
    const entry: Omit<ErrorLogEntry, 'id'> = {
      tenantId: additionalContext?.tenantId || error.context?.tenantId,
      timestamp: new Date(),
      errorCode: error.code,
      agentName: error.context?.agentName,
      userMessage: additionalContext?.userMessage?.substring(0, 1000),
      context: {
        ...error.context,
        requestId: additionalContext?.requestId,
        recoverable: error.recoverable,
        suggestedAction: error.suggestedAction
      },
      stackTrace: error.context?.stackTrace,
      resolved: false
    };

    const { data, error: dbError } = await supabase
      .from('agent_error_logs')
      .insert({
        tenant_id: entry.tenantId,
        timestamp: entry.timestamp.toISOString(),
        error_code: entry.errorCode,
        agent_name: entry.agentName,
        user_message: entry.userMessage,
        context: entry.context,
        stack_trace: entry.stackTrace,
        resolved: entry.resolved
      })
      .select('id')
      .single();

    if (dbError) {
      // Don't throw - error logging should never break the main flow
      console.error('[ErrorLoggingService] Failed to log error:', dbError.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[ErrorLoggingService] Exception while logging:', err);
    return null;
  }
}

/**
 * Mark an error as resolved
 */
export async function resolveError(
  errorId: string,
  resolution: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('agent_error_logs')
      .update({
        resolved: true,
        resolution
      })
      .eq('id', errorId);

    return !error;
  } catch (err) {
    console.error('[ErrorLoggingService] Failed to resolve error:', err);
    return false;
  }
}

/**
 * Get recent errors for a tenant
 */
export async function getRecentErrors(
  tenantId?: string,
  limit: number = 50
): Promise<ErrorLogEntry[]> {
  try {
    let query = supabase
      .from('agent_error_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ErrorLoggingService] Failed to fetch errors:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      timestamp: new Date(row.timestamp),
      errorCode: row.error_code,
      agentName: row.agent_name,
      userMessage: row.user_message,
      context: row.context,
      stackTrace: row.stack_trace,
      resolved: row.resolved,
      resolution: row.resolution
    }));
  } catch (err) {
    console.error('[ErrorLoggingService] Exception fetching errors:', err);
    return [];
  }
}

/**
 * Get error statistics
 */
export async function getErrorStats(
  tenantId?: string,
  hoursBack: number = 24
): Promise<ErrorStats> {
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    let query = supabase
      .from('agent_error_logs')
      .select('*')
      .gte('timestamp', since.toISOString());

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return {
        totalErrors: 0,
        byCode: {},
        byAgent: {},
        recentErrors: [],
        errorRate: 0
      };
    }

    // Aggregate stats
    const byCode: Record<string, number> = {};
    const byAgent: Record<string, number> = {};

    for (const row of data) {
      byCode[row.error_code] = (byCode[row.error_code] || 0) + 1;
      if (row.agent_name) {
        byAgent[row.agent_name] = (byAgent[row.agent_name] || 0) + 1;
      }
    }

    return {
      totalErrors: data.length,
      byCode,
      byAgent,
      recentErrors: data.slice(0, 10).map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        timestamp: new Date(row.timestamp),
        errorCode: row.error_code,
        agentName: row.agent_name,
        resolved: row.resolved
      })),
      errorRate: data.length / hoursBack
    };
  } catch (err) {
    console.error('[ErrorLoggingService] Exception getting stats:', err);
    return {
      totalErrors: 0,
      byCode: {},
      byAgent: {},
      recentErrors: [],
      errorRate: 0
    };
  }
}

/**
 * Get errors by code for analysis
 */
export async function getErrorsByCode(
  errorCode: string,
  limit: number = 100
): Promise<ErrorLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('agent_error_logs')
      .select('*')
      .eq('error_code', errorCode)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      timestamp: new Date(row.timestamp),
      errorCode: row.error_code,
      agentName: row.agent_name,
      userMessage: row.user_message,
      context: row.context,
      stackTrace: row.stack_trace,
      resolved: row.resolved,
      resolution: row.resolution
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Clean old resolved errors
 */
export async function cleanOldErrors(
  daysToKeep: number = 30
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('agent_error_logs')
      .delete()
      .eq('resolved', true)
      .lt('timestamp', cutoff.toISOString())
      .select('id');

    if (error) {
      console.error('[ErrorLoggingService] Failed to clean old errors:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    return 0;
  }
}

export default {
  logAgentError,
  resolveError,
  getRecentErrors,
  getErrorStats,
  getErrorsByCode,
  cleanOldErrors
};
