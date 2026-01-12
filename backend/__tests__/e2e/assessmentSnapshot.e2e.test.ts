import { createClient } from '@supabase/supabase-js';

function makeId() {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Skip this e2e test when SUPABASE env vars are not configured.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  test.skip('E2E tests skipped - set SUPABASE_URL and SUPABASE_SERVICE_KEY to enable', () => {});
} else {
  describe('E2E: company_assessment_snapshots upsert / unique constraint', () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY as string);
    const assessmentId = makeId();

    afterAll(async () => {
      // Clean-up any snapshots we created
      await supabase.from('company_assessment_snapshots').delete().eq('assessment_id', assessmentId);
    });

    test('upsert works (INSERT then ON CONFLICT DO UPDATE) and updates snapshot payload', async () => {
      // initial insert
      const r1 = await supabase
        .from('company_assessment_snapshots')
        .insert({ assessment_id: assessmentId, tenant_id: 'e2e-tenant', snapshot: { a: 1 } })
        .select()
        .single();

      expect(r1.error).toBeNull();
      const inserted = r1.data as any;
      expect(inserted.assessment_id).toBe(assessmentId);

      // upsert with ON CONFLICT (assessment_id) -> should update existing row
      const r2 = await supabase
        .from('company_assessment_snapshots')
        .upsert({ assessment_id: assessmentId, tenant_id: 'e2e-tenant', snapshot: { a: 2, note: 'updated' } }, { onConflict: 'assessment_id' })
        .select()
        .single();

      expect(r2.error).toBeNull();
      const upserted = r2.data as any;
      expect(upserted.assessment_id).toBe(assessmentId);
      // Validate snapshot field reflects new content
      expect(upserted.snapshot).toBeDefined();
      expect(upserted.snapshot.a === 2 || upserted.snapshot.a === '2').toBeTruthy();
      // only one row should exist for the assessment_id
      const all = await supabase.from('company_assessment_snapshots').select('*').eq('assessment_id', assessmentId);
      expect(all.error).toBeNull();
      expect((all.data as any[]).length).toBe(1);
    }, 20000);
  });
}
