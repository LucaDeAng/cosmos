/**
 * Alert Agent
 *
 * Real-time alerting system that monitors extraction metrics and
 * sends notifications when anomalies or threshold violations occur.
 */

import { v4 as uuidv4 } from 'uuid';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MetricsAnomaly, MetricsPeriod } from './types';
import { getMetricsAggregator } from './metricsAggregator';
import { getNotificationService, NotificationChannel, NotificationPriority } from '../../services/notificationService';

// ============================================================================
// Types
// ============================================================================

export type AlertType =
  | 'accuracy_drop'
  | 'volume_spike'
  | 'error_rate'
  | 'pattern_failure'
  | 'confidence_drop'
  | 'processing_slowdown'
  | 'feedback_surge'
  | 'system_health';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metrics: Record<string, number>;
  threshold: number;
  actualValue: number;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertConfig {
  channels: NotificationChannel[];
  thresholds: AlertThresholds;
  cooldownMinutes: number;
  enabled: boolean;
  tenantId?: string;
}

export interface AlertThresholds {
  accuracyDrop: number;          // default: 0.15 (15%)
  volumeSpike: number;           // default: 3.0 (3x)
  errorRate: number;             // default: 0.30 (30%)
  confidenceDrop: number;        // default: 0.20 (20%)
  processingSlowdown: number;    // default: 2.0 (2x slower)
  feedbackSurge: number;         // default: 5.0 (5x normal)
}

interface DbAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metrics: Record<string, number>;
  threshold: number;
  actual_value: number;
  timestamp: string;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  tenant_id: string | null;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AlertConfig = {
  channels: ['in_app'],
  thresholds: {
    accuracyDrop: 0.15,
    volumeSpike: 3.0,
    errorRate: 0.30,
    confidenceDrop: 0.20,
    processingSlowdown: 2.0,
    feedbackSurge: 5.0
  },
  cooldownMinutes: 60,
  enabled: true
};

// ============================================================================
// Alert Agent Implementation
// ============================================================================

export class AlertAgent {
  private supabase: SupabaseClient;
  private config: AlertConfig;
  private lastAlertTimes: Map<AlertType, Date> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AlertConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Core Alert Methods
  // ==========================================================================

  /**
   * Check for anomalies and create alerts
   */
  async checkAndAlert(): Promise<Alert[]> {
    if (!this.config.enabled) {
      return [];
    }

    console.log('[AlertAgent] Checking for anomalies...');

    const metricsAggregator = getMetricsAggregator();
    const anomalies = await metricsAggregator.detectAnomalies();
    const alerts: Alert[] = [];

    for (const anomaly of anomalies) {
      // Check cooldown
      if (this.isInCooldown(anomaly.type as AlertType)) {
        console.log(`[AlertAgent] Skipping ${anomaly.type} alert (in cooldown)`);
        continue;
      }

      const alert = await this.createAlertFromAnomaly(anomaly);
      alerts.push(alert);

      // Send notifications
      await this.sendAlertNotifications(alert);

      // Update last alert time
      this.lastAlertTimes.set(anomaly.type as AlertType, new Date());
    }

    // Additional custom checks
    const customAlerts = await this.runCustomChecks();
    for (const alert of customAlerts) {
      if (!this.isInCooldown(alert.type)) {
        await this.saveAlert(alert);
        await this.sendAlertNotifications(alert);
        this.lastAlertTimes.set(alert.type, new Date());
        alerts.push(alert);
      }
    }

    console.log(`[AlertAgent] Created ${alerts.length} alerts`);
    return alerts;
  }

  /**
   * Create alert from MetricsAnomaly
   */
  private async createAlertFromAnomaly(anomaly: MetricsAnomaly): Promise<Alert> {
    const alert: Alert = {
      id: uuidv4(),
      type: anomaly.type as AlertType,
      severity: this.mapSeverity(anomaly.severity),
      title: this.generateAlertTitle(anomaly.type as AlertType),
      message: anomaly.description,
      metrics: { [anomaly.affectedMetric]: 0 },
      threshold: this.getThresholdForType(anomaly.type as AlertType),
      actualValue: 0, // Would need actual value from anomaly
      timestamp: anomaly.detectedAt,
      acknowledged: false,
      tenantId: this.config.tenantId,
      metadata: {
        recommendedAction: anomaly.recommendedAction
      }
    };

    await this.saveAlert(alert);
    return alert;
  }

  /**
   * Run custom threshold checks
   */
  private async runCustomChecks(): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const metricsAggregator = getMetricsAggregator();

    try {
      // Check confidence drop
      const recentMetrics = await metricsAggregator.getAggregatedMetrics('daily');
      const baselineMetrics = await metricsAggregator.getAggregatedMetrics('weekly');

      // Confidence drop check
      if (recentMetrics.overallAccuracy > 0 && baselineMetrics.overallAccuracy > 0) {
        const confidenceDrop = (baselineMetrics.overallAccuracy - recentMetrics.overallAccuracy) /
                               baselineMetrics.overallAccuracy;

        if (confidenceDrop > this.config.thresholds.confidenceDrop) {
          alerts.push({
            id: uuidv4(),
            type: 'confidence_drop',
            severity: confidenceDrop > 0.30 ? 'critical' : 'warning',
            title: 'Confidence Score Drop Detected',
            message: `Extraction confidence dropped by ${(confidenceDrop * 100).toFixed(1)}% compared to baseline`,
            metrics: {
              current_confidence: recentMetrics.overallAccuracy,
              baseline_confidence: baselineMetrics.overallAccuracy
            },
            threshold: this.config.thresholds.confidenceDrop,
            actualValue: confidenceDrop,
            timestamp: new Date(),
            acknowledged: false,
            tenantId: this.config.tenantId
          });
        }
      }

      // Feedback surge check
      if (recentMetrics.feedbackVolume > 0 && baselineMetrics.feedbackVolume > 0) {
        const avgDailyFeedback = baselineMetrics.feedbackVolume / 7;
        const feedbackRatio = recentMetrics.feedbackVolume / avgDailyFeedback;

        if (feedbackRatio > this.config.thresholds.feedbackSurge) {
          alerts.push({
            id: uuidv4(),
            type: 'feedback_surge',
            severity: feedbackRatio > 10 ? 'critical' : 'warning',
            title: 'Unusual Feedback Volume',
            message: `Feedback volume is ${feedbackRatio.toFixed(1)}x higher than average`,
            metrics: {
              current_feedback: recentMetrics.feedbackVolume,
              avg_daily_feedback: avgDailyFeedback
            },
            threshold: this.config.thresholds.feedbackSurge,
            actualValue: feedbackRatio,
            timestamp: new Date(),
            acknowledged: false,
            tenantId: this.config.tenantId
          });
        }
      }

    } catch (error) {
      console.error('[AlertAgent] Error running custom checks:', error);
    }

    return alerts;
  }

  // ==========================================================================
  // Alert Management
  // ==========================================================================

  /**
   * Save alert to database
   */
  private async saveAlert(alert: Alert): Promise<void> {
    const dbAlert: DbAlert = {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      metrics: alert.metrics,
      threshold: alert.threshold,
      actual_value: alert.actualValue,
      timestamp: alert.timestamp.toISOString(),
      acknowledged: alert.acknowledged,
      acknowledged_by: alert.acknowledgedBy || null,
      acknowledged_at: alert.acknowledgedAt?.toISOString() || null,
      tenant_id: alert.tenantId || null,
      metadata: alert.metadata || null
    };

    const { error } = await this.supabase
      .from('system_alerts')
      .upsert(dbAlert);

    if (error) {
      console.error('[AlertAgent] Error saving alert:', error);
      // Don't throw - alerting should be resilient
    }
  }

  /**
   * Get recent alerts
   */
  async getAlerts(options?: {
    acknowledged?: boolean;
    severity?: AlertSeverity;
    type?: AlertType;
    limit?: number;
    since?: Date;
  }): Promise<Alert[]> {
    let query = this.supabase
      .from('system_alerts')
      .select('*')
      .order('timestamp', { ascending: false });

    if (options?.acknowledged !== undefined) {
      query = query.eq('acknowledged', options.acknowledged);
    }
    if (options?.severity) {
      query = query.eq('severity', options.severity);
    }
    if (options?.type) {
      query = query.eq('type', options.type);
    }
    if (options?.since) {
      query = query.gte('timestamp', options.since.toISOString());
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AlertAgent] Error fetching alerts:', error);
      return [];
    }

    return (data as DbAlert[]).map(this.mapDbAlertToAlert);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('system_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', alertId);

    if (error) {
      console.error('[AlertAgent] Error acknowledging alert:', error);
      throw error;
    }

    console.log(`[AlertAgent] Alert ${alertId} acknowledged by ${userId}`);
  }

  /**
   * Get unacknowledged alert count
   */
  async getUnacknowledgedCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('acknowledged', false);

    if (error) {
      console.error('[AlertAgent] Error counting alerts:', error);
      return 0;
    }

    return count || 0;
  }

  // ==========================================================================
  // Notification Methods
  // ==========================================================================

  /**
   * Send alert notifications to configured channels
   */
  private async sendAlertNotifications(alert: Alert): Promise<void> {
    const notificationService = getNotificationService();

    const priority: NotificationPriority =
      alert.severity === 'critical' ? 'urgent' :
      alert.severity === 'warning' ? 'high' : 'normal';

    for (const channel of this.config.channels) {
      try {
        await notificationService.send({
          channel,
          priority,
          title: alert.title,
          message: alert.message,
          data: {
            alertId: alert.id,
            type: alert.type,
            severity: alert.severity,
            metrics: alert.metrics,
            recommendedAction: alert.metadata?.recommendedAction
          },
          tenantId: alert.tenantId
        });
      } catch (error) {
        console.error(`[AlertAgent] Failed to send ${channel} notification:`, error);
      }
    }
  }

  // ==========================================================================
  // Monitoring Control
  // ==========================================================================

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 300000): void { // Default: 5 minutes
    if (this.monitoringInterval) {
      console.log('[AlertAgent] Monitoring already running');
      return;
    }

    console.log(`[AlertAgent] Starting monitoring (interval: ${intervalMs}ms)`);

    // Run immediately
    this.checkAndAlert().catch(console.error);

    // Then schedule
    this.monitoringInterval = setInterval(() => {
      this.checkAndAlert().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[AlertAgent] Monitoring stopped');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[AlertAgent] Configuration updated');
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Check if alert type is in cooldown
   */
  private isInCooldown(type: AlertType): boolean {
    const lastAlert = this.lastAlertTimes.get(type);
    if (!lastAlert) return false;

    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    return Date.now() - lastAlert.getTime() < cooldownMs;
  }

  /**
   * Map severity from anomaly to alert
   */
  private mapSeverity(severity: 'low' | 'medium' | 'high'): AlertSeverity {
    switch (severity) {
      case 'high': return 'critical';
      case 'medium': return 'warning';
      default: return 'info';
    }
  }

  /**
   * Generate alert title based on type
   */
  private generateAlertTitle(type: AlertType): string {
    const titles: Record<AlertType, string> = {
      accuracy_drop: 'Extraction Accuracy Drop',
      volume_spike: 'Unusual Volume Spike',
      error_rate: 'High Error Rate Detected',
      pattern_failure: 'Pattern Performance Degradation',
      confidence_drop: 'Confidence Score Decline',
      processing_slowdown: 'Processing Performance Issue',
      feedback_surge: 'Feedback Volume Surge',
      system_health: 'System Health Alert'
    };
    return titles[type] || 'System Alert';
  }

  /**
   * Get threshold for alert type
   */
  private getThresholdForType(type: AlertType): number {
    const thresholds: Record<AlertType, number> = {
      accuracy_drop: this.config.thresholds.accuracyDrop,
      volume_spike: this.config.thresholds.volumeSpike,
      error_rate: this.config.thresholds.errorRate,
      pattern_failure: 0.5,
      confidence_drop: this.config.thresholds.confidenceDrop,
      processing_slowdown: this.config.thresholds.processingSlowdown,
      feedback_surge: this.config.thresholds.feedbackSurge,
      system_health: 0.5
    };
    return thresholds[type] || 0.5;
  }

  /**
   * Map database alert to Alert type
   */
  private mapDbAlertToAlert(dbAlert: DbAlert): Alert {
    return {
      id: dbAlert.id,
      type: dbAlert.type,
      severity: dbAlert.severity,
      title: dbAlert.title,
      message: dbAlert.message,
      metrics: dbAlert.metrics,
      threshold: dbAlert.threshold,
      actualValue: dbAlert.actual_value,
      timestamp: new Date(dbAlert.timestamp),
      acknowledged: dbAlert.acknowledged,
      acknowledgedBy: dbAlert.acknowledged_by || undefined,
      acknowledgedAt: dbAlert.acknowledged_at ? new Date(dbAlert.acknowledged_at) : undefined,
      tenantId: dbAlert.tenant_id || undefined,
      metadata: dbAlert.metadata || undefined
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let alertAgentInstance: AlertAgent | null = null;

export function getAlertAgent(config?: Partial<AlertConfig>): AlertAgent {
  if (!alertAgentInstance) {
    alertAgentInstance = new AlertAgent(config);
  }
  return alertAgentInstance;
}

export default AlertAgent;
