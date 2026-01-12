// Avoid importing langchain heavy modules at test runtime by mocking minimal API
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke: jest.Mock<any, any>;
    constructor() {
      this.invoke = jest.fn();
    }
  }
}));

jest.mock('@langchain/core', () => ({
  PromptTemplate: class {
    template: string;
    constructor(opts: any) {
      this.template = opts.template || '';
    }
    async format(_vars: any) {
      return this.template;
    }
  },
  StructuredOutputParser: {
    fromZodSchema: (_: any) => ({
      getFormatInstructions: () => 'JSON_ONLY',
      parse: async (content: any) => {
        // naive JSON parse — tests will mock model.invoke directly
        if (typeof content === 'string') return JSON.parse(content);
        return content;
      }
    })
  }
}));

// Mock subpath modules used in imports: prompts and output_parsers
jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: class {
    template: string;
    constructor(opts: any) {
      this.template = opts.template || '';
    }
    async format(_vars: any) {
      return this.template;
    }
  }
}));

jest.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: (_: any) => ({
      getFormatInstructions: () => 'JSON_ONLY',
      parse: async (content: any) => {
        if (typeof content === 'string') return JSON.parse(content);
        return content;
      }
    })
  }
}));

import { AssessmentAgent } from '../src/agents/assessmentAgent';
import type { AssessmentAnalysis } from '../src/agents/assessmentAgent';

describe('AssessmentAgent.generateSnapshotFromAnalysis', () => {
  it('parses and returns a valid snapshot when model returns JSON matching the schema', async () => {
    const agent = new AssessmentAgent('fake');

    // create a simple analysis sample
    const sample: AssessmentAnalysis = {
      cluster: 'ppm_managed',
      clusterLabel: 'Ppm Managed',
      confidence: 90,
      profile: {
        ppmMaturityLevel: 4,
        governanceScore: 8,
        visibilityScore: 7,
        portfolioComplexity: 'medium',
        primaryFocus: 'gestione risorse',
        strengths: ['decisioni basate su dati'],
        challenges: ['mancanza di automazione'],
        readinessForCensus: 'needs_prep',
      },
      recommendations: [
        { title: 'T1', description: 'd1', priority: 'immediate', category: 'census', actionItems: ['a'] },
        { title: 'T2', description: 'd2', priority: 'short_term', category: 'process', actionItems: ['a'] },
        { title: 'T3', description: 'd3', priority: 'medium_term', category: 'governance', actionItems: ['a'] },
      ],
      censusStrategy: {
        suggestedApproach: 'start small',
        startingPoint: 'team X',
        expectedInitiatives: '5-10',
        priorityCategories: ['internal services'],
      },
      summary: 'A short summary',
    };

    // create an example snapshot that conforms to the new AssessmentSnapshotSchema
    const snapshot = {
      snapshotVersion: '1.0',
      createdAt: new Date().toISOString(),
      assessmentId: 'assessment-abc',
      tenantId: 'tenant-1',
      companyName: 'Acme Test',
      cluster: sample.cluster,
      executiveSummary: 'Acme Test shows a solid early-stage portfolio with some governance gaps and opportunity for quick wins focused on data quality and prioritization. Recommend starting with a CRM data hygiene pilot and a prioritization board to surface wins and measurable KPIs over the next 90 days.',
      maturityProfile: {
        digitalMaturityLabel: 'Gestito',
        digitalMaturityScore: 7,
        ppmMaturityLevel: 4,
        innovationIndex: 7,
        governanceScore: 8,
        visibilityScore: 7,
        evidence: ['governanceScore=8','visibilityScore=7']
      },
      swot: { strengths: ['A'], weaknesses: ['B'], opportunities: ['C'], threats: ['D'] },
      immediatePriorities: [
        { id: 'P1', title: 'Fix X', summary: 'Do X', impact: 8, effort: 'Low', confidence: 'High', rationale: 'Because', owners: ['pm'], estimatedTTR_months: 1 }
      ],
      longerTermInitiatives: [],
      kpis: [{ name: 'KPI1', target: '10%', rationale: 'track impact' }],
      riskAssessment: [{ risk: 'data', likelihood: 'High', impact: 'Medium', mitigation: 'Add tests' }],
      data_gaps: ['missing metrics'],
      confidenceOverall: 'Medium',
      notes: 'Generated in test'
    };

    // mock the model.invoke to return our snapshot JSON as the content
    (agent as any).model.invoke = jest.fn().mockResolvedValue({ content: JSON.stringify(snapshot) });

    const input = {
      assessmentId: 'assessment-abc',
      tenantId: 'tenant-1',
      companyName: 'Acme Test',
      ai_profile: sample.profile,
      ai_cluster: sample.cluster,
      ai_recommendations: sample.recommendations,
      scores: { confidence: sample.confidence },
      meta: { summary: sample.summary },
    };

    const out = await agent.generateSnapshot(input as any);

    expect(out).toBeDefined();
    expect(out.companyName).toBe('Acme Test');
    expect(out.maturityProfile?.digitalMaturityLabel).toBe('Gestito');
    expect(out.immediatePriorities?.length).toBe(1);
  });
});
