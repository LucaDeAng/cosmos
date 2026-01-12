import fs from 'fs';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import OrchestratorActionSchema, { OrchestratorAction } from './schemas/orchestratorActionSchema';
import { getSubAgent } from './subagents';
import type { OrchestratorToolName, SubAgentResult } from './subagents/types';
import { saveAssessmentSnapshot } from '../repositories/assessmentSnapshotRepository';

export class OrchestratorAgent {
  private model: ChatOpenAI;
  private parser: StructuredOutputParser<typeof OrchestratorActionSchema>;
  private systemPrompt: string;

  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.0,
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    this.parser = StructuredOutputParser.fromZodSchema(OrchestratorActionSchema as any);

    try {
      const p = path.resolve(__dirname, './prompts/orchestrator-system-prompt.md');
      this.systemPrompt = fs.readFileSync(p, { encoding: 'utf8' });
    } catch (e) {
      this.systemPrompt = 'You are THEMIS Orchestrator. Decide whether to call a subagent or reply.';
    }
  }

  /**
   * Interpret a user message and decide whether to call a subagent or answer directly.
   * Returns a programmatic action conforming to OrchestratorActionSchema.
   */
  async decideAction(userMessage: string, context?: Record<string, any>): Promise<OrchestratorAction> {
    // Build a prompt combining the system prompt, optional context and the user message
    const contextText = context ? `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n` : '';
    const promptStr = `${this.systemPrompt}\n\n${contextText}USER MESSAGE:\n${userMessage}\n\n${this.parser.getFormatInstructions()}`;

    const runPrompt = new PromptTemplate({ template: promptStr, inputVariables: [] });
    const formatted = await runPrompt.format({});

    const response = await this.model.invoke(formatted);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // parse structured output — let parse throw on failure to allow caller to retry
    const parsed = await this.parser.parse(content);
    return parsed as OrchestratorAction;
  }

  // Run the orchestrator once and throw if parsing fails
  private async runOrchestratorOnce(userMessage: string, context?: Record<string, unknown>) {
    const contextText = context ? `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n` : '';
    const promptStr = `${this.systemPrompt}\n\n${contextText}USER MESSAGE:\n${userMessage}\n\n${this.parser.getFormatInstructions()}`;
    const runPrompt = new PromptTemplate({ template: promptStr, inputVariables: [] });
    const formatted = await runPrompt.format({});
    const response = await this.model.invoke(formatted);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Attempt to parse — if parse fails StructuredOutputParser will throw
    const parsed = await this.parser.parse(content);
    return parsed as OrchestratorAction;
  }

  // Run the orchestrator with a single retry attempt if the first parse fails.
  async runOrchestratorWithRetry(userMessage: string, context?: Record<string, unknown>): Promise<OrchestratorAction> {
    try {
      return await this.runOrchestratorOnce(userMessage, context);
    } catch (err) {
      console.error('First orchestrator attempt failed to produce valid action:', err instanceof Error ? err.message : err);

      // Provide a correction hint and retry once
      const hint = `Il precedente output non rispettava lo schema richiesto. Riprova e PRODUCI SOLO un JSON valido che rispetti esattamente lo schema fornito.`;
      const contextWithHint = { ...context, __formatting_hint: hint } as Record<string, unknown>;

      try {
        return await this.runOrchestratorOnce(userMessage, contextWithHint);
      } catch (err2) {
        console.error('Second orchestrator attempt also failed:', err2 instanceof Error ? err2.message : err2);
        throw err2;
      }
    }
  }

  // Public handler that decides action and either runs a sub-agent or returns a final answer
  async handleOrchestratorRequest(userMessage: string, context?: Record<string, unknown>): Promise<SubAgentResult> {
    // get structured orchestrator action (with retry)
    let action: OrchestratorAction;
    try {
      action = await this.runOrchestratorWithRetry(userMessage, context);
    } catch (err) {
      // If we cannot parse or get a valid action, return a friendly fallback
      return { content: 'Errore nell’elaborazione della richiesta: non sono riuscito a produrre un’azione valida. Per favore riprova con maggiori dettagli.' };
    }

    if (action.action === 'call_tool') {
      const toolName = action.tool_name as OrchestratorToolName;
      const tool = getSubAgent(toolName);
      if (!tool) {
        return { content: `Nessun sotto-agente registrato per il tool "${toolName}".` };
      }

      const args = (action.tool_args ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(args);

        // If the client assessment tool returned a validated snapshot, persist it.
        try {
          if (toolName === 'CLIENT_ASSESSMENT' && result.metadata && (result.metadata as any).snapshot) {
            // Save snapshot (defensive, do not throw if DB op fails)
            await saveAssessmentSnapshot((result.metadata as any).snapshot);
          }
        } catch (err) {
          console.error('Failed to persist assessment snapshot:', err instanceof Error ? err.message : err);
        }

        return result;
      } catch (err) {
        console.error('Error running sub-agent', toolName, err);
        return { content: `Errore eseguendo il sotto-agente ${toolName}: ${(err as Error).message ?? String(err)}` };
      }
    }

    if (action.action === 'final_answer') {
      return { content: action.content ?? '' };
    }

    return { content: 'Azione dell’orchestrator non riconosciuta.' };
  }

}

let orch: OrchestratorAgent | null = null;
export function getOrchestratorAgent(apiKey?: string) {
  if (!orch) orch = new OrchestratorAgent(apiKey);
  return orch;
}

export default OrchestratorAgent;

export async function handleOrchestratorRequest(userMessage: string, context?: Record<string, unknown>) {
  const agent = getOrchestratorAgent();
  return agent.handleOrchestratorRequest(userMessage, context);
}
