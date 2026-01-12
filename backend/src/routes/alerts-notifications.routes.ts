/**
 * Alerts and Notifications Routes
 *
 * API endpoints for managing system alerts and notifications
 */

import express, { Request, Response } from 'express';
import { alertAgent } from '../agents/subagents/alertAgent';
import { NotificationService } from '../services/notificationService';

const router = express.Router();

// Initialize notification service
const notificationService = new NotificationService();

// ============================================================================
// ALERT ENDPOINTS
// ============================================================================

/**
 * POST /alerts/create
 * Create a new system alert
 */
router.post('/alerts/create', async (req: Request, res: Response) => {
  try {
    const { type, severity, title, message, metrics, threshold, actual_value, tenantId } = req.body;

    if (!type || !severity || !title) {
      return res.status(400).json({ error: 'Missing required fields: type, severity, title' });
    }

    const result = await alertAgent.run({
      action: 'create',
      type,
      severity,
      title,
      message,
      metrics,
      threshold,
      actual_value,
      tenantId,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to create alert', details: message });
  }
});

/**
 * GET /alerts
 * List system alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { type, severity, tenantId, limit = '50' } = req.query;

    const result = await alertAgent.run({
      action: 'list',
      type: type as string,
      severity: severity as string,
      tenantId: tenantId as string,
      limit: parseInt(limit as string, 10),
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to list alerts', details: message });
  }
});

/**
 * POST /alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Alert ID required' });
    }

    const result = await alertAgent.run({
      action: 'acknowledge',
      alert_id: id,
      user_id: userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to acknowledge alert', details: message });
  }
});

/**
 * GET /alerts/thresholds
 * Get configured alert thresholds
 */
router.get('/alerts/thresholds', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;

    const result = await alertAgent.run({
      action: 'get_thresholds',
      tenantId: tenantId as string,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to fetch thresholds', details: message });
  }
});

/**
 * PUT /alerts/thresholds/:type
 * Update an alert threshold
 */
router.put('/alerts/thresholds/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { threshold_value, tenantId } = req.body;

    if (!type || threshold_value === undefined) {
      return res.status(400).json({ error: 'Missing required fields: type, threshold_value' });
    }

    const result = await alertAgent.run({
      action: 'update_threshold',
      threshold_type: type,
      threshold_value,
      tenantId,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to update threshold', details: message });
  }
});

// ============================================================================
// NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * POST /notifications
 * Send a notification
 */
router.post('/notifications', async (req: Request, res: Response) => {
  try {
    const { channel, priority, title, message, data, tenantId, userId } = req.body;

    if (!channel || !title || !message) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: channel, title, message' });
    }

    const result = await notificationService.send({
      channel: channel as 'in_app' | 'email' | 'slack' | 'webhook',
      priority: priority as 'low' | 'normal' | 'high' | 'urgent',
      title,
      message,
      data,
      tenantId,
      userId,
    });

    return res.status(200).json({
      success: result.status !== 'failed',
      notification: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to send notification', details: message });
  }
});

/**
 * POST /notifications/batch
 * Send multiple notifications
 */
router.post('/notifications/batch', async (req: Request, res: Response) => {
  try {
    const { payloads } = req.body;

    if (!Array.isArray(payloads)) {
      return res.status(400).json({ error: 'payloads must be an array' });
    }

    const results = await notificationService.sendBatch(payloads);

    return res.status(200).json({
      success: true,
      notifications: results,
      count: results.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to send notifications', details: message });
  }
});

/**
 * GET /notifications/user/:userId
 * Get user's notifications
 */
router.get('/notifications/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status, channel, unreadOnly = false, limit = '50' } = req.query;

    const notifications = await notificationService.getNotifications({
      userId,
      status: status as any,
      channel: channel as any,
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit as string, 10),
    });

    return res.status(200).json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to fetch notifications', details: message });
  }
});

/**
 * GET /notifications/user/:userId/unread
 * Get unread notification count for user
 */
router.get('/notifications/user/:userId/unread', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const count = await notificationService.getUnreadCount(userId);

    return res.status(200).json({
      success: true,
      userId,
      unreadCount: count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to fetch unread count', details: message });
  }
});

/**
 * POST /notifications/:id/read
 * Mark notification as read
 */
router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await notificationService.markAsRead(id);

    return res.status(200).json({
      success: true,
      notificationId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to mark notification as read', details: message });
  }
});

/**
 * POST /notifications/user/:userId/read-all
 * Mark all notifications as read for user
 */
router.post('/notifications/user/:userId/read-all', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const count = await notificationService.markAllAsRead(userId);

    return res.status(200).json({
      success: true,
      userId,
      markedAsRead: count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to mark all as read', details: message });
  }
});

export default router;
