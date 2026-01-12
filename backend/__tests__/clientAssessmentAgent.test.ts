// Mock the AssessmentAgent module so tests don't load langchain
jest.mock('../src/agents/assessmentAgent', () => ({
  getAssessmentAgent: jest.fn(),
}));

const { getAssessmentAgent } = require('../src/agents/assessmentAgent');
// require the sub-agent after we've prepared the mocked getAssessmentAgent in tests
const { clientAssessmentAgent } = require('../src/agents/subagents/clientAssessmentAgent');

describe('clientAssessmentAgent', () => {
  it('maps args, calls generateSnapshot and returns content + metadata.snapshot', async () => {
    const mockSnapshot = {
      snapshotVersion: '1.0',
      createdAt: new Date().toISOString(),
      assessmentId: 'a-1',
      tenantId: 't-1',
      companyName: 'TestCo',
      cluster: 'ppm_defined',
      executiveSummary: 'TestCo shows a moderate PPM profile with baseline governance and visibility. Recommend focused data-quality work and a prioritization board to yield measurable wins within 90 days.',
      maturityProfile: { ppmMaturityLevel: 3, governanceScore: 5, visibilityScore: 4, evidence: [] },
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      immediatePriorities: [],
      longerTermInitiatives: [],
      kpis: [],
      riskAssessment: [],
      data_gaps: [],
      confidenceOverall: 'Medium',
    };

    // make the mocked getAssessmentAgent return an object with generateSnapshot
    (getAssessmentAgent as jest.Mock).mockReturnValue({ generateSnapshot: jest.fn().mockResolvedValue(mockSnapshot) });

    const args = {
      assessmentId: 'a-1',
      tenantId: 't-1',
      companyName: 'TestCo',
      frontendAnswers: { q1: 'answer' },
    };

    const res = await clientAssessmentAgent.run(args as any);

    expect(res).toBeDefined();
    expect(typeof res.content).toBe('string');
    expect(res.content).toBe(mockSnapshot.executiveSummary);
    expect(res.metadata).toBeDefined();
    expect((res.metadata as any).snapshot).toBeDefined();
    expect((res.metadata as any).snapshot.snapshotVersion).toBe('1.0');
    expect((res.metadata as any).snapshot.createdAt).toBe(mockSnapshot.createdAt);
  });
});
