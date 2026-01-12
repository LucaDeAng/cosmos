/**
 * Notification Service
 *
 * Multi-channel notification delivery service supporting
 * in-app, email, Slack, and webhook notifications.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 'in_app' | 'email' | 'slack' | 'webhook';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface NotificationPayload {
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  tenantId?: string;
  userId?: string;
  recipients?: string[];  // Email addresses or user IDs
}

export interface Notification {
  id: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  status: NotificationStatus;
  sentAt?: Date;
  readAt?: Date;
  tenantId?: string;
  userId?: string;
  createdAt: Date;
  error?: string;
}

export interface NotificationConfig {
  // Email configuration
  email?: {
    enabled: boolean;
    fromAddress: string;
    smtpHost?: string;
    smtpPort?: number;
    apiKey?: string;  // For services like SendGrid
  };
  // Slack configuration
  slack?: {
    enabled: boolean;
    webhookUrl: string;
    defaultChannel?: string;
  };
  // Webhook configuration
  webhook?: {
    enabled: boolean;
    endpoints: WebhookEndpoint[];
  };
  // In-app configuration
  inApp?: {
    enabled: boolean;
    maxRetention: number;  // Days to keep notifications
  };
}

export interface WebhookEndpoint {
  url: string;
  secret?: string;
  events: string[];  // Event types to send
  headers?: Record<string, string>;
}

interface DbNotification {
  id: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  status: NotificationStatus;
  sent_at: string | null;
  read_at: string | null;
  tenant_id: string | null;
  user_id: string | null;
  created_at: string;
  error: string | null;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: NotificationConfig = {
  email: {
    enabled: false,
    fromAddress: 'noreply@themis.local'
  },
  slack: {
    enabled: false,
    webhookUrl: ''
  },
  webhook: {
    enabled: false,
    endpoints: []
  },
  inApp: {
    enabled: true,
    maxRetention: 30
  }
};

// ============================================================================
// Notification Service Implementation
// ============================================================================

export class NotificationService {
  private supabase: SupabaseClient;
  private config: NotificationConfig;

  constructor(config?: Partial<NotificationConfig>) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
  }

  // ==========================================================================
  // Core Send Method
  // ==========================================================================

  /**
   * Send notification to specified channel
   */
  async send(payload: NotificationPayload): Promise<Notification> {
    console.log(`[NotificationService] Sending ${payload.channel} notification: ${payload.title}`);

    const notification: Notification = {
      id: uuidv4(),
      channel: payload.channel,
      priority: payload.priority,
      title: payload.title,
      message: payload.message,
      data: payload.data,
      status: 'pending',
      tenantId: payload.tenantId,
      userId: payload.userId,
      createdAt: new Date()
    };

    try {
      // Route to appropriate channel handler
      switch (payload.channel) {
        case 'in_app':
          await this.sendInApp(notification);
          break;
        case 'email':
          await this.sendEmail(notification, payload.recipients);
          break;
        case 'slack':
          await this.sendSlack(notification);
          break;
        case 'webhook':
          await this.sendWebhook(notification);
          break;
        default:
          throw new Error(`Unknown channel: ${payload.channel}`);
      }

      notification.status = 'sent';
      notification.sentAt = new Date();
    } catch (error) {
      notification.status = 'failed';
      notification.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[NotificationService] Failed to send notification:`, error);
    }

    // Always save in-app notifications
    if (payload.channel === 'in_app' || this.config.inApp?.enabled) {
      await this.saveNotification(notification);
    }

    return notification;
  }

  /**
   * Send multiple notifications
   */
  async sendBatch(payloads: NotificationPayload[]): Promise<Notification[]> {
    const results = await Promise.allSettled(
      payloads.map(payload => this.send(payload))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          id: uuidv4(),
          channel: payloads[index].channel,
          priority: payloads[index].priority,
          title: payloads[index].title,
          message: payloads[index].message,
          status: 'failed' as NotificationStatus,
          createdAt: new Date(),
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
  }

  // ==========================================================================
  // Channel-Specific Handlers
  // ==========================================================================

  /**
   * Send in-app notification (stored in database)
   */
  private async sendInApp(notification: Notification): Promise<void> {
    if (!this.config.inApp?.enabled) {
      throw new Error('In-app notifications are disabled');
    }
    // In-app notifications are saved via saveNotification
    console.log(`[NotificationService] In-app notification queued: ${notification.id}`);
  }

  /**
   * Send email notification
   */
  private async sendEmail(notification: Notification, recipients?: string[]): Promise<void> {
    if (!this.config.email?.enabled) {
      throw new Error('Email notifications are disabled');
    }

    if (!recipients || recipients.length === 0) {
      throw new Error('No email recipients specified');
    }

    // If SendGrid API key is available, use it
    const apiKey = process.env.SENDGRID_API_KEY || this.config.email.apiKey;

    if (apiKey) {
      await this.sendViaSendGrid(notification, recipients, apiKey);
    } else {
      // Log for now - in production would use SMTP
      console.log(`[NotificationService] Email would be sent to: ${recipients.join(', ')}`);
      console.log(`[NotificationService] Subject: ${notification.title}`);
      console.log(`[NotificationService] Body: ${notification.message}`);
    }
  }

  /**
   * Send via SendGrid
   */
  private async sendViaSendGrid(
    notification: Notification,
    recipients: string[],
    apiKey: string
  ): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: recipients.map(email => ({ email }))
        }],
        from: { email: this.config.email?.fromAddress || 'noreply@themis.local' },
        subject: notification.title,
        content: [{
          type: 'text/plain',
          value: notification.message
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`SendGrid API error: ${response.statusText}`);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(notification: Notification): Promise<void> {
    if (!this.config.slack?.enabled || !this.config.slack.webhookUrl) {
      throw new Error('Slack notifications are disabled or webhook URL not configured');
    }

    const payload = this.formatSlackMessage(notification);

    const response = await fetch(this.config.slack.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook error: ${response.statusText}`);
    }

    console.log(`[NotificationService] Slack notification sent: ${notification.id}`);
  }

  /**
   * Format message for Slack
   */
  private formatSlackMessage(notification: Notification): Record<string, unknown> {
    const colorMap: Record<NotificationPriority, string> = {
      urgent: '#dc3545',   // Red
      high: '#fd7e14',     // Orange
      normal: '#0d6efd',   // Blue
      low: '#6c757d'       // Gray
    };

    return {
      channel: this.config.slack?.defaultChannel,
      attachments: [{
        color: colorMap[notification.priority],
        title: notification.title,
        text: notification.message,
        fields: notification.data ? Object.entries(notification.data).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true
        })) : [],
        footer: 'THEMIS Alert System',
        ts: Math.floor(notification.createdAt.getTime() / 1000)
      }]
    };
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(notification: Notification): Promise<void> {
    if (!this.config.webhook?.enabled || !this.config.webhook.endpoints.length) {
      throw new Error('Webhook notifications are disabled or no endpoints configured');
    }

    const payload = {
      id: notification.id,
      type: 'alert',
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      data: notification.data,
      timestamp: notification.createdAt.toISOString()
    };

    const results = await Promise.allSettled(
      this.config.webhook.endpoints.map(async (endpoint) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...endpoint.headers
        };

        // Add signature if secret is provided
        if (endpoint.secret) {
          const crypto = await import('crypto');
          const signature = crypto
            .createHmac('sha256', endpoint.secret)
            .update(JSON.stringify(payload))
            .digest('hex');
          headers['X-Webhook-Signature'] = signature;
        }

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${endpoint.url} - ${response.statusText}`);
        }
      })
    );

    // Check if any webhooks failed
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length === results.length) {
      throw new Error('All webhooks failed');
    }

    console.log(`[NotificationService] Webhook notifications sent: ${results.length - failures.length}/${results.length} succeeded`);
  }

  // ==========================================================================
  // Notification Management
  // ==========================================================================

  /**
   * Save notification to database
   */
  private async saveNotification(notification: Notification): Promise<void> {
    const dbNotification: DbNotification = {
      id: notification.id,
      channel: notification.channel,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      data: notification.data || null,
      status: notification.status,
      sent_at: notification.sentAt?.toISOString() || null,
      read_at: notification.readAt?.toISOString() || null,
      tenant_id: notification.tenantId || null,
      user_id: notification.userId || null,
      created_at: notification.createdAt.toISOString(),
      error: notification.error || null
    };

    const { error } = await this.supabase
      .from('notifications')
      .upsert(dbNotification);

    if (error) {
      console.error('[NotificationService] Error saving notification:', error);
    }
  }

  /**
   * Get notifications for user/tenant
   */
  async getNotifications(options?: {
    userId?: string;
    tenantId?: string;
    status?: NotificationStatus;
    channel?: NotificationChannel;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<Notification[]> {
    let query = this.supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options?.tenantId) {
      query = query.eq('tenant_id', options.tenantId);
    }
    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.channel) {
      query = query.eq('channel', options.channel);
    }
    if (options?.unreadOnly) {
      query = query.is('read_at', null);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[NotificationService] Error fetching notifications:', error);
      return [];
    }

    return (data as DbNotification[]).map(this.mapDbNotificationToNotification);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId);

    if (error) {
      console.error('[NotificationService] Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId?: string, tenantId?: string): Promise<number> {
    let query = this.supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString()
      })
      .is('read_at', null);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('[NotificationService] Error marking notifications as read:', error);
      throw error;
    }

    return data?.length || 0;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId?: string, tenantId?: string): Promise<number> {
    let query = this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { count, error } = await query;

    if (error) {
      console.error('[NotificationService] Error counting unread:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Delete old notifications
   */
  async cleanupOldNotifications(): Promise<number> {
    const retentionDays = this.config.inApp?.maxRetention || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = await this.supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select();

    if (error) {
      console.error('[NotificationService] Error cleaning up notifications:', error);
      return 0;
    }

    return data?.length || 0;
  }

  // ==========================================================================
  // Configuration Management
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = this.mergeConfig(this.config, config);
    console.log('[NotificationService] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  /**
   * Test notification channel
   */
  async testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }> {
    try {
      await this.send({
        channel,
        priority: 'normal',
        title: 'Test Notification',
        message: 'This is a test notification from THEMIS.'
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Merge configuration objects
   */
  private mergeConfig(
    base: NotificationConfig,
    override?: Partial<NotificationConfig>
  ): NotificationConfig {
    if (!override) return base;

    return {
      email: { ...base.email, ...override.email } as NotificationConfig['email'],
      slack: { ...base.slack, ...override.slack } as NotificationConfig['slack'],
      webhook: { ...base.webhook, ...override.webhook } as NotificationConfig['webhook'],
      inApp: { ...base.inApp, ...override.inApp } as NotificationConfig['inApp']
    };
  }

  /**
   * Map database notification to Notification type
   */
  private mapDbNotificationToNotification(db: DbNotification): Notification {
    return {
      id: db.id,
      channel: db.channel,
      priority: db.priority,
      title: db.title,
      message: db.message,
      data: db.data || undefined,
      status: db.status,
      sentAt: db.sent_at ? new Date(db.sent_at) : undefined,
      readAt: db.read_at ? new Date(db.read_at) : undefined,
      tenantId: db.tenant_id || undefined,
      userId: db.user_id || undefined,
      createdAt: new Date(db.created_at),
      error: db.error || undefined
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(
  config?: Partial<NotificationConfig>
): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService(config);
  }
  return notificationServiceInstance;
}

export default NotificationService;
