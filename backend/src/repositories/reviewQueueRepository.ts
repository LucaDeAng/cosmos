/**
 * Review Queue Repository - Phase 3 HITL
 *
 * Handles database operations for the Human-in-the-Loop review workflow
 */

import { supabase } from '../config/supabase';

// ============================================================
// TYPES
// ============================================================

export interface ReviewQueueItem {
  id: string;
  tenantId: string;
  itemId: string;
  itemType: 'product' | 'service';
  itemName: string;
  itemData: unknown;
  extractionId?: string;
  sourceFile?: string;
  sourceType?: string;
  confidenceOverall: number;
  confidenceBreakdown: unknown;
  reviewTier: 'auto_accept' | 'quick_review' | 'manual_review' | 'full_edit';
  priority: number;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'edited';
  assignedTo?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  editHistory?: unknown[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface ReviewStats {
  tenantId: string;
  date: string;
  itemsSubmitted: number;
  itemsAutoAccepted: number;
  itemsQuickReviewed: number;
  itemsManualReviewed: number;
  itemsRejected: number;
  avgConfidence: number;
  avgReviewTimeSeconds?: number;
  autoAcceptAccuracy?: number;
  reviewEfficiency?: number;
}

export interface AddToQueueInput {
  tenantId: string;
  itemId: string;
  itemType: 'product' | 'service';
  itemName: string;
  itemData: unknown;
  extractionId?: string;
  sourceFile?: string;
  sourceType?: string;
  confidenceOverall: number;
  confidenceBreakdown: unknown;
  expiresInDays?: number; // Optional auto-expiration
}

// ============================================================
// ADD TO QUEUE
// ============================================================

/**
 * Adds an item to the review queue with automatic tier/priority calculation
 */
export async function addToReviewQueue(
  input: AddToQueueInput
): Promise<ReviewQueueItem | null> {
  try {
    // Calculate review tier based on confidence
    const reviewTier = calculateReviewTier(input.confidenceOverall);

    // Calculate priority (would use business_value and strategic_alignment if available)
    const priority = calculatePriority(
      input.confidenceOverall,
      (input.itemData as any)?.businessValue,
      (input.itemData as any)?.strategicAlignment
    );

    // Calculate expiration date if needed
    let expiresAt: string | undefined;
    if (input.expiresInDays) {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + input.expiresInDays);
      expiresAt = expirationDate.toISOString();
    }

    const { data, error } = await supabase
      .from('review_queue')
      .insert({
        tenant_id: input.tenantId,
        item_id: input.itemId,
        item_type: input.itemType,
        item_name: input.itemName,
        item_data: input.itemData,
        extraction_id: input.extractionId,
        source_file: input.sourceFile,
        source_type: input.sourceType,
        confidence_overall: input.confidenceOverall,
        confidence_breakdown: input.confidenceBreakdown,
        review_tier: reviewTier,
        priority: priority,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error adding to review queue:', error);
      return null;
    }

    return mapFromDatabase(data);
  } catch (error) {
    console.error('❌ Exception adding to review queue:', error);
    return null;
  }
}

// ============================================================
// GET QUEUE ITEMS
// ============================================================

/**
 * Gets pending review items for a tenant, ordered by priority
 */
export async function getReviewQueue(
  tenantId: string,
  filters?: {
    tier?: 'auto_accept' | 'quick_review' | 'manual_review' | 'full_edit';
    status?: string;
    limit?: number;
  }
): Promise<ReviewQueueItem[]> {
  try {
    let query = supabase
      .from('review_queue')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (filters?.tier) {
      query = query.eq('review_tier', filters.tier);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    } else {
      // Default: only pending items
      query = query.eq('status', 'pending');
    }

    const { data, error } = await query.limit(filters?.limit || 50);

    if (error) {
      console.error('❌ Error fetching review queue:', error);
      return [];
    }

    return (data || []).map(mapFromDatabase);
  } catch (error) {
    console.error('❌ Exception fetching review queue:', error);
    return [];
  }
}

/**
 * Gets a single review item by ID
 */
export async function getReviewItem(itemId: string): Promise<ReviewQueueItem | null> {
  try {
    const { data, error } = await supabase
      .from('review_queue')
      .select('*')
      .eq('id', itemId)
      .single();

    if (error) {
      console.error('❌ Error fetching review item:', error);
      return null;
    }

    return mapFromDatabase(data);
  } catch (error) {
    console.error('❌ Exception fetching review item:', error);
    return null;
  }
}

// ============================================================
// REVIEW ACTIONS
// ============================================================

/**
 * Approves a review item
 */
export async function approveReviewItem(
  itemId: string,
  reviewedBy: string,
  notes?: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('review_queue')
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', itemId)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ Error approving review item:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Exception approving review item:', error);
    return false;
  }
}

/**
 * Rejects a review item
 */
export async function rejectReviewItem(
  itemId: string,
  reviewedBy: string,
  notes: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('review_queue')
      .update({
        status: 'rejected',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', itemId)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ Error rejecting review item:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Exception rejecting review item:', error);
    return false;
  }
}

/**
 * Edits and approves a review item
 */
export async function editAndApproveReviewItem(
  itemId: string,
  reviewedBy: string,
  editedData: unknown,
  notes?: string
): Promise<boolean> {
  try {
    // Get current item for edit history
    const current = await getReviewItem(itemId);
    if (!current) return false;

    const editHistory = [
      ...(current.editHistory || []),
      {
        timestamp: new Date().toISOString(),
        reviewedBy,
        originalData: current.itemData,
        editedData,
      },
    ];

    const { error } = await supabase
      .from('review_queue')
      .update({
        item_data: editedData,
        status: 'edited',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
        edit_history: editHistory,
      })
      .eq('id', itemId)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ Error editing review item:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Exception editing review item:', error);
    return false;
  }
}

/**
 * Bulk approves multiple items
 */
export async function bulkApproveItems(
  itemIds: string[],
  reviewedBy: string
): Promise<number> {
  try {
    const { error, count } = await supabase
      .from('review_queue')
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: 'Bulk approved',
      })
      .in('id', itemIds)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ Error bulk approving items:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('❌ Exception bulk approving items:', error);
    return 0;
  }
}

// ============================================================
// STATISTICS
// ============================================================

/**
 * Gets review statistics for a tenant
 */
export async function getReviewStats(
  tenantId: string,
  days: number = 30
): Promise<ReviewStats[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('review_statistics')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.error('❌ Error fetching review stats:', error);
      return [];
    }

    return (data || []).map((row) => ({
      tenantId: row.tenant_id,
      date: row.date,
      itemsSubmitted: row.items_submitted,
      itemsAutoAccepted: row.items_auto_accepted,
      itemsQuickReviewed: row.items_quick_reviewed,
      itemsManualReviewed: row.items_manual_reviewed,
      itemsRejected: row.items_rejected,
      avgConfidence: row.avg_confidence,
      avgReviewTimeSeconds: row.avg_review_time_seconds,
      autoAcceptAccuracy: row.auto_accept_accuracy,
      reviewEfficiency: row.review_efficiency,
    }));
  } catch (error) {
    console.error('❌ Exception fetching review stats:', error);
    return [];
  }
}

/**
 * Gets review queue summary for a tenant
 */
export async function getReviewQueueSummary(tenantId: string): Promise<{
  total: number;
  byTier: Record<string, number>;
  byStatus: Record<string, number>;
  avgConfidence: number;
}> {
  try {
    const { data, error } = await supabase
      .from('review_queue')
      .select('review_tier, status, confidence_overall')
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Error fetching queue summary:', error);
      return { total: 0, byTier: {}, byStatus: {}, avgConfidence: 0 };
    }

    const items = data || [];
    const byTier: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalConfidence = 0;

    items.forEach((item) => {
      byTier[item.review_tier] = (byTier[item.review_tier] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      totalConfidence += item.confidence_overall;
    });

    return {
      total: items.length,
      byTier,
      byStatus,
      avgConfidence: items.length > 0 ? totalConfidence / items.length : 0,
    };
  } catch (error) {
    console.error('❌ Exception fetching queue summary:', error);
    return { total: 0, byTier: {}, byStatus: {}, avgConfidence: 0 };
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Calculates review tier from confidence score
 */
function calculateReviewTier(
  confidence: number
): 'auto_accept' | 'quick_review' | 'manual_review' | 'full_edit' {
  if (confidence >= 0.9) return 'auto_accept';
  if (confidence >= 0.7) return 'quick_review';
  if (confidence >= 0.5) return 'manual_review';
  return 'full_edit';
}

/**
 * Calculates priority (1-10) from confidence and business metrics
 */
function calculatePriority(
  confidence: number,
  businessValue?: number,
  strategicAlignment?: number
): number {
  let priority = 5; // Default medium

  // Lower confidence = higher priority
  if (confidence < 0.5) priority += 3;
  else if (confidence < 0.7) priority += 1;

  // Higher business value = higher priority
  if (businessValue && businessValue >= 8) priority += 2;
  else if (businessValue && businessValue >= 6) priority += 1;

  // Higher strategic alignment = higher priority
  if (strategicAlignment && strategicAlignment >= 8) priority += 1;

  // Clamp to 1-10
  return Math.max(1, Math.min(10, priority));
}

/**
 * Maps database row to ReviewQueueItem
 */
function mapFromDatabase(row: any): ReviewQueueItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    itemId: row.item_id,
    itemType: row.item_type,
    itemName: row.item_name,
    itemData: row.item_data,
    extractionId: row.extraction_id,
    sourceFile: row.source_file,
    sourceType: row.source_type,
    confidenceOverall: row.confidence_overall,
    confidenceBreakdown: row.confidence_breakdown,
    reviewTier: row.review_tier,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    editHistory: row.edit_history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
