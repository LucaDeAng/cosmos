import { supabase } from '../config/supabase';
import type { AssessmentSnapshot } from '../agents/schemas/assessmentSnapshotSchema';
import type { StrategicAssessmentProfile } from '../agents/schemas/strategicAssessmentSchema';

/**
 * Persist an assessment snapshot in the company_assessment_snapshots table.
 * Non-throwing: logs any errors and returns the inserted data on success.
 */
export async function saveAssessmentSnapshot(snapshot: AssessmentSnapshot) {
  const assessmentId = snapshot.assessmentId;
  const tenantId = snapshot.tenantId ?? null;

  if (!assessmentId) {
    console.warn('saveAssessmentSnapshot: missing assessmentId on snapshot');
    return null;
  }

  try {
    // Use upsert (onConflict by assessment_id) so repeated snapshot generations
    // for the same assessment_id replace the previous row instead of creating duplicates.
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .upsert({ assessment_id: assessmentId, tenant_id: tenantId, snapshot }, { onConflict: 'assessment_id' })
      .select();

    if (error) {
      console.error('Error saving assessment snapshot:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception saving assessment snapshot:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Retrieve the latest strategic profile for a tenant from assessment snapshots.
 * Returns null if no strategic profile is found.
 */
export async function getLatestStrategicProfile(
  tenantId: string
): Promise<StrategicAssessmentProfile | null> {
  if (!tenantId) {
    console.warn('getLatestStrategicProfile: missing tenantId');
    return null;
  }

  try {
    // Query latest snapshot for this tenant, ordered by created_at DESC
    const { data, error } = await supabase
      .from('company_assessment_snapshots')
      .select('snapshot')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // Not an error if no assessment exists yet
      if (error.code === 'PGRST116') {
        console.log(`getLatestStrategicProfile: No assessment snapshot found for tenant ${tenantId}`);
        return null;
      }
      console.error('Error fetching latest strategic profile:', error);
      return null;
    }

    if (!data || !data.snapshot) {
      console.log(`getLatestStrategicProfile: No snapshot data for tenant ${tenantId}`);
      return null;
    }

    // Extract strategic_profile from snapshot
    const snapshot = data.snapshot as AssessmentSnapshot;
    const strategicProfile = (snapshot as any).strategic_profile;

    if (!strategicProfile) {
      console.log(`getLatestStrategicProfile: Snapshot exists but no strategic_profile field found for tenant ${tenantId}`);
      return null;
    }

    console.log(`✅ Retrieved strategic profile for tenant ${tenantId} - Industry: ${strategicProfile.company_identity?.industry || 'unknown'}`);
    return strategicProfile as StrategicAssessmentProfile;

  } catch (err) {
    console.error('Exception fetching latest strategic profile:', err instanceof Error ? err.message : err);
    return null;
  }
}

export default { saveAssessmentSnapshot, getLatestStrategicProfile };
