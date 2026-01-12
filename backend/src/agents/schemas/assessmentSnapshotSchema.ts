import { z } from 'zod';
import { StrategicAssessmentProfileSchema } from './strategicAssessmentSchema';

export const PriorityItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  impact: z.number().min(1).max(10),
  effort: z.enum(['Low', 'Medium', 'High']),
  confidence: z.enum(['High', 'Medium', 'Low']),
  rationale: z.string(),
  owners: z.array(z.string()).default([]),
  estimatedTTR_months: z.number(),
});

export const AssessmentSnapshotSchema = z.object({
  snapshotVersion: z.string().default('1.0'),
  createdAt: z.string().datetime(),

  assessmentId: z.string().nullable().optional(),
  tenantId: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  cluster: z.string().nullable().optional(),

  executiveSummary: z.string().min(60).max(600),

  // Strategic profile for schema inference and RAG
  strategic_profile: StrategicAssessmentProfileSchema.optional(),

  maturityProfile: z.object({
    digitalMaturityLabel: z.string().nullable().optional(),
    digitalMaturityScore: z.number().min(0).max(10).nullable().optional(),
    ppmMaturityLevel: z.number().min(1).max(5).nullable().optional(),
    innovationIndex: z.number().min(0).max(10).nullable().optional(),
    overallScore: z.number().min(0).max(100).nullable().optional(),
    dimensions: z.array(z.object({
      name: z.string(),
      score: z.number().min(0).max(10),
    })).default([]),
    // Legacy fields - deprecated but kept for backwards compatibility
    governanceScore: z.number().min(0).max(10).nullable().optional(),
    visibilityScore: z.number().min(0).max(10).nullable().optional(),
    evidence: z.array(z.string()).default([]),
  }),

  swot: z.object({
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
    opportunities: z.array(z.string()).default([]),
    threats: z.array(z.string()).default([]),
  }),

  immediatePriorities: z.array(PriorityItemSchema).default([]),
  longerTermInitiatives: z.array(PriorityItemSchema).default([]),

  kpis: z.array(z.object({ name: z.string(), target: z.union([z.string(), z.number()]), rationale: z.string() })).default([]),

  riskAssessment: z.array(z.object({ risk: z.string(), likelihood: z.enum(['Low','Medium','High']), impact: z.enum(['Low','Medium','High']), mitigation: z.string() })).default([]),

  data_gaps: z.array(z.string()).default([]),

  confidenceOverall: z.enum(['High','Medium','Low']),
  notes: z.string().optional().default(''),
});

export type AssessmentSnapshot = z.infer<typeof AssessmentSnapshotSchema>;
export default AssessmentSnapshotSchema;
