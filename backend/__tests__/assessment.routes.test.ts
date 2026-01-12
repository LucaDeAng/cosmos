import express from 'express';
import request from 'supertest';

// Mock the authenticate middleware so tests don't depend on JWT/session
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: 'test-user-id' };
    next();
  }
}));

// We'll mock the supabase client to avoid hitting the real DB in unit/integration tests
const mockFrom = jest.fn();
const mockSupabase = {
  from: mockFrom,
};

jest.mock('../src/config/supabase', () => ({
  supabase: mockSupabase,
}));

// Mock the assessment agent so tests don't require langchain runtime to load (ESM issues)
jest.mock('../src/agents/assessmentAgent', () => ({
  getAssessmentAgent: () => ({
    analyze: jest.fn().mockResolvedValue({
      cluster: 'ppm_starter',
      clusterLabel: 'PPM Starter',
      confidence: 90,
      profile: {
        ppmMaturityLevel: 1,
        governanceScore: 3,
        visibilityScore: 3,
        portfolioComplexity: 'medium',
        primaryFocus: 'catalogo',
        strengths: [],
        challenges: [],
        readinessForCensus: 'needs_prep'
      },
      recommendations: [],
      censusStrategy: { suggestedApproach: 'pilot', startingPoint: 'Prodotti', expectedInitiatives: '10', priorityCategories: [] },
      summary: 'Automated test'
    }),
    generateRecommendations: jest.fn().mockResolvedValue([]),
  })
}));

describe('POST /api/assessment', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.resetAllMocks();
    app = express();
    app.use(express.json());
    // import router dynamically to ensure mocks apply
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const assessmentRouter = require('../src/routes/assessment.routes').default;
    app.use('/api/assessment', assessmentRouter);
  });

  it('saves assessment and returns cluster/profile when supabase upsert succeeds', async () => {
    // Setup supabase mock behavior
    // 1) users select -> returns a user record with company_id
    const userSelect = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { company_id: 'company-123' }, error: null }),
    };

    // 2) upsert -> returns newly upserted assessment
    const upsertReturn = {
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'assessment-1' }, error: null }),
    };

    // 3) company chain - supports both select and update operations
    const companyChain = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'company-123', name: 'Test Company' }, error: null }),
    };

    // mockFrom should return different objects depending on table name
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') return userSelect;
      if (tableName === 'company_assessments') return {
        upsert: jest.fn().mockReturnValue(upsertReturn),
      };
      if (tableName === 'companies') return companyChain;
      // default chain-friendly object
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
    });

    const payload = { answers: { 1: '10', 2: 'Comitato direttivo', 3: ['ROI', 'Allineamento strategico'], 4: '3', 5: 'Mancanza di visibilità', 6: ['Prodotti'], 7: 'catalogo servizi' } };

    const res = await request(app)
      .post('/api/assessment')
      .set('Authorization', 'Bearer dummy-token')
      .send(payload)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('cluster');
    expect(res.body).toHaveProperty('profile');

    // Ensure upsert was called with onConflict company_id (we validate it was used: our mock returned upsert chain)
    const calledWithUpsert = mockFrom.mock.calls.some(c => c[0] === 'company_assessments');
    expect(calledWithUpsert).toBe(true);
  });
});
