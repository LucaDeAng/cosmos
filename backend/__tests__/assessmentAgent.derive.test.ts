import { deriveProfileFields } from '../src/agents/assessmentUtils';
import type { AssessmentAnalysis } from '../src/agents/assessmentAgent';

describe('deriveProfileFields', () => {
  it('adds digitalMaturity and innovationIndex when missing', () => {
    const sample: AssessmentAnalysis = {
      cluster: 'ppm_managed',
      clusterLabel: 'Ppm Managed',
      confidence: 92,
      profile: {
        ppmMaturityLevel: 4,
        governanceScore: 8,
        visibilityScore: 6,
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

    const derived = deriveProfileFields(sample);

    expect(derived.profile.digitalMaturity).toBe('Gestito');
    expect(typeof derived.profile.innovationIndex).toBe('number');
    expect(derived.profile.innovationIndex).toBe(Math.round((8 + 6) / 2));
  });
});
