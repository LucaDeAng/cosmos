// User Management Service
// Handles user CRUD operations and company management

import { supabase } from '../config/supabase';

export class UserService {
  /**
   * Get user profile
   */
  static async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role,
        is_active,
        is_email_verified,
        last_login,
        created_at,
        companies (
          id,
          name,
          subscription_plan,
          subscription_valid_until
        )
      `)
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(userId: string, updates: any) {
    const allowedFields = ['full_name'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    const { data, error } = await supabase
      .from('users')
      .update(filteredUpdates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    await this.logAudit(userId, 'USER_UPDATED', 'users', userId, filteredUpdates);
    return data;
  }

  /**
   * Get company users (admin only)
   */
  static async getCompanyUsers(companyId: string, requestingUserId: string) {
    // Verify requester has access
    const { data: requester } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', requestingUserId)
      .single();

    if (!requester || (requester.company_id !== companyId && requester.role !== 'super_admin')) {
      throw new Error('Access denied');
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, last_login, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Check company user limit
   */
  static async checkUserLimit(companyId: string): Promise<boolean> {
    const { data: company } = await supabase
      .from('companies')
      .select('max_users')
      .eq('id', companyId)
      .single();

    if (!company) return false;

    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true);

    return (count || 0) < company.max_users;
  }

  /**
   * Deactivate user (admin only)
   */
  static async deactivateUser(userId: string, requestingUserId: string) {
    // Get target user
    const { data: targetUser } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', userId)
      .single();

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Get requesting user
    const { data: requester } = await supabase
      .from('users')
      .select('company_id, role')
      .eq('id', requestingUserId)
      .single();

    // Check permissions
    if (
      requester?.role !== 'super_admin' &&
      (requester?.company_id !== targetUser.company_id || requester?.role !== 'admin')
    ) {
      throw new Error('Access denied');
    }

    // Can't deactivate super_admin
    if (targetUser.role === 'super_admin') {
      throw new Error('Cannot deactivate super admin');
    }

    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) throw error;

    await this.logAudit(requestingUserId, 'USER_DEACTIVATED', 'users', userId);
    return { success: true, message: 'User deactivated successfully' };
  }

  /**
   * Get user statistics
   */
  static async getUserStats(userId: string) {
    // Get initiative count
    const { count: initiativeCount } = await supabase
      .from('initiatives')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId);

    // Get uploaded files count
    const { count: filesCount } = await supabase
      .from('uploaded_files')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', userId);

    return {
      initiativeCount: initiativeCount || 0,
      filesCount: filesCount || 0,
    };
  }

  /**
   * Log audit trail
   */
  private static async logAudit(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: any
  ) {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    });
  }
}
