import { z } from 'zod';

export const ToolArgsSchema = z.object({
  user_goal: z.string().optional(),
  business_context: z.record(z.string(), z.unknown()).optional(),
  portfolio_data_ref: z.union([z.string(), z.null()]).optional(),
  criteria: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  optional: z.record(z.string(), z.unknown()).optional(),
});

export const OrchestratorActionSchema = z.union([
  z.object({
    action: z.literal('call_tool'),
    tool_name: z.enum(['CLIENT_ASSESSMENT', 'PORTFOLIO_ASSESSMENT', 'GENERATOR', 'VALIDATOR', 'EXPLORER', 'KNOWLEDGE_QA']),
    tool_args: ToolArgsSchema,
  }),
  z.object({
    action: z.literal('final_answer'),
    content: z.string(),
  }),
]);

export type OrchestratorAction = z.infer<typeof OrchestratorActionSchema>;

export default OrchestratorActionSchema;
