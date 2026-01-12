// Mock LangChain modules used by orchestrator during tests
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
        if (typeof content === 'string') return JSON.parse(content);
        return content;
      }
    })
  }
}));

// Also mock the specific imports used by orchestrator code
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

import { getSubAgent } from '../src/agents/subagents';
import { getOrchestratorAgent, handleOrchestratorRequest } from '../src/agents/orchestratorAgent';
// make getAssessmentAgent available for runtime mocking by subagent
jest.mock('../src/agents/assessmentAgent', () => ({ getAssessmentAgent: jest.fn() }));
// mock persistence repository so tests don't touch real DB
jest.mock('../src/repositories/assessmentSnapshotRepository', () => ({ saveAssessmentSnapshot: jest.fn() }));

const { getAssessmentAgent } = require('../src/agents/assessmentAgent');
const { saveAssessmentSnapshot } = require('../src/repositories/assessmentSnapshotRepository');

describe('Sub-agent registry & orchestrator routing (unit tests)', () => {
  it('sub-agent registry returns each stub', () => {
    const names = [
      'CLIENT_ASSESSMENT',
      'PORTFOLIO_ASSESSMENT',
      'GENERATOR',
      'VALIDATOR',
      'EXPLORER',
      'KNOWLEDGE_QA',
    ] as const;

    for (const n of names) {
      const agent = getSubAgent(n as any);
      expect(agent).toBeDefined();
      expect(agent?.name).toBe(n);
    }
  });

  it('orchestrator.handleOrchestratorRequest executes sub-agent when instructed', async () => {
    const orchestrator = getOrchestratorAgent();

    // mock runOrchestratorWithRetry to return a valid call_tool action
    (orchestrator as any).runOrchestratorWithRetry = jest.fn().mockResolvedValue({
      action: 'call_tool',
      tool_name: 'CLIENT_ASSESSMENT',
      tool_args: { user_goal: 'help me start' },
    });

    // mock the assessment agent used by the sub-agent to return a minimal snapshot
    (getAssessmentAgent as jest.Mock).mockReturnValue({
      generateSnapshot: jest.fn().mockResolvedValue({
        snapshotVersion: '1.0',
        createdAt: new Date().toISOString(),
        assessmentId: 'a-1',
        tenantId: 't-1',
        companyName: 'TestCo',
        cluster: 'ppm_defined',
        executiveSummary: 'Auto snapshot generated for test: company shows basic PPM maturity with opportunities around data and prioritization; recommend immediate quick wins to improve conversion and visibility.',
        maturityProfile: { ppmMaturityLevel: 3, governanceScore: 5, visibilityScore: 4, evidence: [] },
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        immediatePriorities: [],
        longerTermInitiatives: [],
        kpis: [],
        riskAssessment: [],
        data_gaps: [],
        confidenceOverall: 'Medium',
      })
    });

    const result = await handleOrchestratorRequest('Start assessment', { some: 'ctx' });
    expect(result).toBeDefined();
    expect(result).toBeDefined();
    expect(result.content).toContain('snapshot');

    // ensure persisted by calling repository
    expect(saveAssessmentSnapshot).toHaveBeenCalled();
  });

  it('continues gracefully if persisting snapshot fails', async () => {
    const orchestrator = getOrchestratorAgent();
    (orchestrator as any).runOrchestratorWithRetry = jest.fn().mockResolvedValue({
      action: 'call_tool',
      tool_name: 'CLIENT_ASSESSMENT',
      tool_args: { user_goal: 'help me start' },
    });

    (getAssessmentAgent as jest.Mock).mockReturnValue({
      generateSnapshot: jest.fn().mockResolvedValue({
        snapshotVersion: '1.0',
        createdAt: new Date().toISOString(),
        assessmentId: 'a-1',
        tenantId: 't-1',
        companyName: 'TestCo',
        cluster: 'ppm_defined',
        executiveSummary: 'Auto snapshot generated because tests demand a longer string to satisfy schema constraints: sample content here',
        maturityProfile: { ppmMaturityLevel: 3, governanceScore: 5, visibilityScore: 4, evidence: [] },
        swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        immediatePriorities: [],
        longerTermInitiatives: [],
        kpis: [],
        riskAssessment: [],
        data_gaps: [],
        confidenceOverall: 'Medium',
      })
    });

    // make repository throw to simulate DB failure
    (saveAssessmentSnapshot as jest.Mock).mockRejectedValue(new Error('DB down'));

    const result = await handleOrchestratorRequest('Start assessment', { some: 'ctx' });

    // still returns snapshot content and does not rethrow
    expect(result).toBeDefined();
    expect(result.content).toContain('snapshot');
    expect(saveAssessmentSnapshot).toHaveBeenCalled();
  });
});
