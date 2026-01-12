import { SubAgent, SubAgentResult } from './types';
import { getAssessmentAgent, AssessmentSnapshotInput } from '../assessmentAgent';
import AssessmentSnapshotSchema from '../schemas/assessmentSnapshotSchema';

// We call getAssessmentAgent() lazily inside run() so tests can mock getAssessmentAgent
// and we avoid binding a potentially unmockable instance at module init time.

function mapArgsToSnapshotInput(args: Record<string, unknown> | null | undefined): AssessmentSnapshotInput {
  const input = (args as Record<string, unknown>) || {};

  return {
    assessmentId: (input.assessmentId as string) ?? null,
    tenantId: (input.tenantId as string) ?? null,
    companyName: (input.companyName as string) ?? null,
    frontendAnswers: (input.frontendAnswers as any) ?? null,
    ai_profile: (input.ai_profile as Record<string, unknown>) ?? null,
    ai_cluster: (input.ai_cluster as string) ?? null,
    ai_recommendations: (input.ai_recommendations as any[]) ?? null,
    scores: (input.scores as Record<string, unknown>) ?? null,
    meta: (input.meta as Record<string, unknown>) ?? null,
  };
}

export const clientAssessmentAgent: SubAgent = {
  name: 'CLIENT_ASSESSMENT',
  async run(args) {
    const input = mapArgsToSnapshotInput(args ?? {});

    // Call the AssessmentAgent to produce a snapshot (resolve instance at runtime so tests can mock it)
    const assessmentAgent = getAssessmentAgent();
    const snapshot = await assessmentAgent.generateSnapshot(input);

    // Extra runtime validation using the Zod schema to be defensive
    const parsed = AssessmentSnapshotSchema.parse(snapshot as any);

    const content = parsed.executiveSummary || 'Snapshot generato con successo.';

    const result: SubAgentResult = {
      content,
      metadata: {
        snapshot: parsed,
      },
    };

    return result;
  },
};

export default clientAssessmentAgent;
