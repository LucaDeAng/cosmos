/**
 * Alert Agent
 *
 * Handles system alerts and monitoring:
 * - Create system alerts
 * - Query and acknowledge alerts
 * - Manage alert thresholds
 * - Monitor system health metrics
 */

import { SubAgent, SubAgentResult } from './types';
import { supabase } from '../../config/supabase';

interface AlertAction {
  action: 'create' | 'list' | 'acknowledge' | 'get_thresholds' | 'update_threshold';
  [key: string]: any;
}

/**
 * Parse alert request and execute appropriate action
 */
async function executeAlertAction(args: Record<string, unknown>): Promise<SubAgentResult> {
  const action = (args.action as string) || 'list';
  const type = (args.type as string) || 'accuracy_drop';
  const severity = (args.severity as string) || 'warning';
  const tenantId = (args.tenantId as string);

  try {
    switch (action) {
      case 'create':
        return await createAlert({
          type,
          severity,
          title: (args.title as string) || `${type} Alert`,
          message: (args.message as string) || `System detected a ${type} event`,
          metrics: (args.metrics as Record<string, any>) || {},
          threshold: (args.threshold as number) || 0.8,
          actual_value: (args.actual_value as number) || 0.75,
          tenant_id: tenantId,
        });

      case 'list':
        return await listAlerts({
          tenant_id: tenantId,
          type: (args.type as string) || undefined,
          severity: (args.severity as string) || undefined,
          limit: (args.limit as number) || 50,
        });

      case 'acknowledge':
        return await acknowledgeAlert({
          alert_id: (args.alert_id as string),
          user_id: (args.user_id as string),
        });

      case 'get_thresholds':
        return await getAlertThresholds({
          tenant_id: tenantId,
        });

      case 'update_threshold':
        return await updateAlertThreshold({
          tenant_id: tenantId,
          threshold_type: (args.threshold_type as string),
          threshold_value: (args.threshold_value as number),
        });

      default:
        return {
          content: `Unknown alert action: ${action}`,
          metadata: { error: true },
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Alert Agent error:', message);
    return {
      content: `Alert agent error: ${message}`,
      metadata: { error: true },
    };
  }
}

/**
 * Create a new system alert
 */
async function createAlert(alert: {
  type: string;
  severity: string;
  title: string;
  message: string;
  metrics: Record<string, any>;
  threshold: number;
  actual_value: number;
  tenant_id?: string;
}): Promise<SubAgentResult> {
  const { data, error } = await supabase
    .from('system_alerts')
    .insert([
      {
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metrics: alert.metrics,
        threshold: alert.threshold,
        actual_value: alert.actual_value,
        tenant_id: alert.tenant_id,
        timestamp: new Date().toISOString(),
      },
    ])
    .select('id, type, severity, title')
    .single();

  if (error) {
    return {
      content: `Failed to create alert: ${error.message}`,
      metadata: { error: true },
    };
  }

  return {
    content: `✅ Alert created successfully\n\nAlert Details:\n- ID: ${data?.id}\n- Type: ${data?.type}\n- Severity: ${data?.severity}\n- Title: ${data?.title}`,
    metadata: {
      alertId: data?.id,
      alert: data,
    },
  };
}

/**
 * List system alerts
 */
async function listAlerts(options: {
  tenant_id?: string;
  type?: string;
  severity?: string;
  limit: number;
}): Promise<SubAgentResult> {
  let query = supabase
    .from('system_alerts')
    .select(
      'id, type, severity, title, message, timestamp, acknowledged, acknowledged_at',
      { count: 'exact' }
    )
    .order('timestamp', { ascending: false })
    .limit(options.limit);

  if (options.tenant_id) {
    query = query.eq('tenant_id', options.tenant_id);
  }

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.severity) {
    query = query.eq('severity', options.severity);
  }

  const { data, count, error } = await query;

  if (error) {
    return {
      content: `Failed to list alerts: ${error.message}`,
      metadata: { error: true },
    };
  }

  if (!data || data.length === 0) {
    return {
      content: '✅ No system alerts found',
      metadata: { alerts: [], count: 0 },
    };
  }

  const alertSummary = data
    .map((a: any) => `• ${a.type} (${a.severity}): ${a.title}`)
    .join('\n');

  return {
    content: `📊 System Alerts (${count} total):\n\n${alertSummary}`,
    metadata: {
      alerts: data,
      count: count || 0,
    },
  };
}

/**
 * Acknowledge an alert
 */
async function acknowledgeAlert(options: {
  alert_id: string;
  user_id?: string;
}): Promise<SubAgentResult> {
  const { data, error } = await supabase
    .from('system_alerts')
    .update({
      acknowledged: true,
      acknowledged_by: options.user_id,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', options.alert_id)
    .select('id, type, title, acknowledged_at')
    .single();

  if (error) {
    return {
      content: `Failed to acknowledge alert: ${error.message}`,
      metadata: { error: true },
    };
  }

  return {
    content: `✅ Alert acknowledged\n\nAlert: ${data?.title}\nAcknowledged at: ${data?.acknowledged_at}`,
    metadata: {
      alertId: data?.id,
      alert: data,
    },
  };
}

/**
 * Get configured alert thresholds
 */
async function getAlertThresholds(options: {
  tenant_id?: string;
}): Promise<SubAgentResult> {
  let query = supabase
    .from('alert_thresholds')
    .select('threshold_type, threshold_value, cooldown_minutes, is_enabled, channels')
    .eq('is_enabled', true)
    .order('threshold_type');

  if (options.tenant_id) {
    query = query.or(
      `tenant_id.eq.${options.tenant_id},tenant_id.is.null`
    );
  } else {
    query = query.is('tenant_id', null);
  }

  const { data, error } = await query;

  if (error) {
    return {
      content: `Failed to fetch alert thresholds: ${error.message}`,
      metadata: { error: true },
    };
  }

  if (!data || data.length === 0) {
    return {
      content: '✅ No alert thresholds configured',
      metadata: { thresholds: [] },
    };
  }

  const thresholdSummary = data
    .map(
      (t: any) =>
        `• ${t.threshold_type}: ${t.threshold_value} (cooldown: ${t.cooldown_minutes}min)`
    )
    .join('\n');

  return {
    content: `⚙️ Configured Alert Thresholds:\n\n${thresholdSummary}`,
    metadata: {
      thresholds: data,
    },
  };
}

/**
 * Update alert threshold
 */
async function updateAlertThreshold(options: {
  tenant_id?: string;
  threshold_type: string;
  threshold_value: number;
}): Promise<SubAgentResult> {
  const { data, error } = await supabase
    .from('alert_thresholds')
    .update({
      threshold_value: options.threshold_value,
    })
    .eq('threshold_type', options.threshold_type)
    .is('tenant_id', options.tenant_id || null)
    .select('threshold_type, threshold_value')
    .single();

  if (error) {
    return {
      content: `Failed to update threshold: ${error.message}`,
      metadata: { error: true },
    };
  }

  return {
    content: `✅ Threshold updated\n\nType: ${data?.threshold_type}\nNew Value: ${data?.threshold_value}`,
    metadata: {
      threshold: data,
    },
  };
}

export const alertAgent: SubAgent = {
  name: 'ALERT_AGENT',
  async run(args: Record<string, unknown>): Promise<SubAgentResult> {
    return executeAlertAction(args);
  },
};

export default alertAgent;
