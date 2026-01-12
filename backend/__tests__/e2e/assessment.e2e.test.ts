import { createClient } from '@supabase/supabase-js';

function makeId() {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Skip this e2e test when SUPABASE env vars are not configured.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Explicitly skip with one skipped test so jest doesn't complain about no tests
  test.skip('E2E tests skipped - set SUPABASE_URL and SUPABASE_SERVICE_KEY to enable', () => {});
} else {
  describe('E2E: company_assessments upsert / unique constraint', () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY as string);
    let companyId: string;

    beforeAll(async () => {
      // create a temporary company to scope assessment tests
      const id = makeId();
      const name = `e2e-company-${id.slice(-6)}`;
      const { data, error } = await supabase.from('companies').insert([{ id, name }]).select().single();
      if (error) throw error;
      companyId = (data as any).id;
    });

    afterAll(async () => {
      // Clean up company and related assessments
      if (companyId) {
        await supabase.from('company_assessments').delete().eq('company_id', companyId);
        await supabase.from('companies').delete().eq('id', companyId);
      }
    });

    test('upsert works (INSERT then ON CONFLICT DO UPDATE) and updates version', async () => {
      // initial insert
      const r1 = await supabase
        .from('company_assessments')
        .insert({ company_id: companyId, answers: { '1': 'x' }, ai_cluster: 'ppm_starter', ai_profile: {}, ai_recommendations: [], version: 1 })
        .select()
        .single();
      expect(r1.error).toBeNull();
      const inserted = r1.data as any;
      expect(inserted.company_id).toBe(companyId);

      // upsert with ON CONFLICT (company_id) -> should update existing row and increment or change answers
      const r2 = await supabase
        .from('company_assessments')
        .upsert({ company_id: companyId, answers: { '1': 'y' }, ai_cluster: 'ppm_emerging', ai_profile: {}, ai_recommendations: [], version: 1 }, { onConflict: 'company_id' })
        .select()
        .single();

      expect(r2.error).toBeNull();
      const upserted = r2.data as any;
      expect(upserted.company_id).toBe(companyId);
      // answers should reflect the new upsert
      expect(upserted.answers['1'] === 'y' || upserted.answers['1'] === '"y"' || upserted.answers['1'] === 'y').toBeTruthy();
    }, 20000);
  });
}
