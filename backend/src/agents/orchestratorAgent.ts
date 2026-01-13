import fs from 'fs';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import OrchestratorActionSchema, { OrchestratorAction } from './schemas/orchestratorActionSchema';
import { getSubAgent } from './subagents';
import type { OrchestratorToolName, SubAgentResult } from './subagents/types';
import { saveAssessmentSnapshot } from '../repositories/assessmentSnapshotRepository';
import { CircuitBreaker, getCircuitBreaker } from './utils/circuitBreaker';
import {
  classifyError,
  getUserFriendlyMessage,
  AgentError,
  AgentErrorCode
} from './schemas/errorSchema';

export interface OrchestratorOptions {
  maxRetries?: number;
  timeout?: number;
  locale?: 'it' | 'en';
}

export class OrchestratorAgent {
  private model: ChatOpenAI;
  private parser: StructuredOutputParser<typeof OrchestratorActionSchema>;
  private systemPrompt: string;
  private circuitBreaker: CircuitBreaker;
  private subAgentBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.0,
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    this.parser = StructuredOutputParser.fromZodSchema(OrchestratorActionSchema as any);

    // Initialize circuit breaker for orchestrator
    this.circuitBreaker = getCircuitBreaker('orchestrator', {
      failureThreshold: 5,
      failureWindow: 60000,
      resetTimeout: 30000,
      successThreshold: 2
    });

    try {
      const p = path.resolve(__dirname, './prompts/orchestrator-system-prompt.md');
      this.systemPrompt = fs.readFileSync(p, { encoding: 'utf8' });
    } catch (e) {
      this.systemPrompt = 'You are THEMIS Orchestrator. Decide whether to call a subagent or reply.';
    }
  }

  /**
   * Get or create circuit breaker for a sub-agent
   */
  private getSubAgentBreaker(agentName: string): CircuitBreaker {
    if (!this.subAgentBreakers.has(agentName)) {
      this.subAgentBreakers.set(
        agentName,
        getCircuitBreaker(`subagent:${agentName}`, {
          failureThreshold: 3,
          failureWindow: 60000,
          resetTimeout: 60000,
          successThreshold: 1
        })
      );
    }
    return this.subAgentBreakers.get(agentName)!;
  }

  /**
   * Delay helper for backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simplify context to reduce token count
   */
  private simplifyContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

    // Remove large arrays and truncate strings
    const simplified: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (key.startsWith('__')) continue; // Skip internal hints

      if (Array.isArray(value)) {
        // Keep only first 3 items
        simplified[key] = value.slice(0, 3);
      } else if (typeof value === 'string' && value.length > 500) {
        // Truncate long strings
        simplified[key] = value.substring(0, 500) + '... [truncated]';
      } else if (typeof value === 'object' && value !== null) {
        // Shallow copy objects
        simplified[key] = JSON.stringify(value).substring(0, 200);
      } else {
        simplified[key] = value;
      }
    }
    return simplified;
  }

  /**
   * Log error in structured format
   */
  private logError(error: AgentError, attempt: number, userMessage: string): void {
    console.error('[OrchestratorAgent] Error:', {
      code: error.code,
      message: error.message,
      attempt,
      recoverable: error.recoverable,
      suggestedAction: error.suggestedAction,
      userMessagePreview: userMessage.substring(0, 100)
    });
  }

  /**
   * Get fallback response based on error type
   */
  private getFallbackResponse(
    error: AgentError,
    locale: 'it' | 'en' = 'it'
  ): SubAgentResult {
    return {
      content: getUserFriendlyMessage(error, locale),
      metadata: {
        fallback: true,
        errorCode: error.code,
        recoverable: error.recoverable
      }
    };
  }

  /**
   * Escape curly braces for LangChain PromptTemplate.
   * Single { becomes {{ and single } becomes }} to prevent template variable interpretation.
   */
  private escapeTemplateChars(str: string): string {
    return str.replace(/\{/g, '{{').replace(/\}/g, '}}');
  }

  /**
   * Interpret a user message and decide whether to call a subagent or answer directly.
   * Returns a programmatic action conforming to OrchestratorActionSchema.
   */
  async decideAction(userMessage: string, context?: Record<string, any>): Promise<OrchestratorAction> {
    // Build a prompt combining the system prompt, optional context and the user message
    const contextText = context ? `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n` : '';
    const promptStr = `${this.systemPrompt}\n\n${contextText}USER MESSAGE:\n${userMessage}\n\n${this.parser.getFormatInstructions()}`;

    // Escape curly braces to prevent LangChain template variable interpretation
    const escapedPrompt = this.escapeTemplateChars(promptStr);
    const runPrompt = new PromptTemplate({ template: escapedPrompt, inputVariables: [] });
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
    // Escape curly braces to prevent LangChain template variable interpretation
    const escapedPrompt = this.escapeTemplateChars(promptStr);
    const runPrompt = new PromptTemplate({ template: escapedPrompt, inputVariables: [] });
    const formatted = await runPrompt.format({});
    const response = await this.model.invoke(formatted);
    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Attempt to parse — if parse fails StructuredOutputParser will throw
    const parsed = await this.parser.parse(content);
    return parsed as OrchestratorAction;
  }

  /**
   * Run the orchestrator with enhanced retry logic, circuit breaker, and backoff
   */
  async runOrchestratorWithRetry(
    userMessage: string,
    context?: Record<string, unknown>,
    options?: OrchestratorOptions
  ): Promise<OrchestratorAction> {
    const maxRetries = options?.maxRetries ?? 3;
    let lastError: AgentError | null = null;
    let currentContext = context;

    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      lastError = classifyError(new Error('Circuit breaker open'), {
        agentName: 'orchestrator',
        attemptNumber: 0
      });
      lastError.code = 'CIRCUIT_OPEN';
      throw lastError;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add hint on retry attempts
        if (attempt > 1 && lastError?.code === 'PARSE_ERROR') {
          currentContext = {
            ...currentContext,
            __formatting_hint: `Il precedente output non rispettava lo schema richiesto. Riprova e PRODUCI SOLO un JSON valido che rispetti esattamente lo schema fornito.`
          };
        }

        const result = await this.runOrchestratorOnce(userMessage, currentContext);
        this.circuitBreaker.recordSuccess();
        return result;

      } catch (err) {
        lastError = classifyError(err, {
          agentName: 'orchestrator',
          attemptNumber: attempt,
          maxAttempts: maxRetries,
          inputSize: userMessage.length
        });

        this.logError(lastError, attempt, userMessage);

        // Check if we should retry
        if (!lastError.recoverable || attempt === maxRetries) {
          this.circuitBreaker.recordFailure();
          break;
        }

        // Handle specific error types
        switch (lastError.code) {
          case 'CONTEXT_OVERFLOW':
            currentContext = this.simplifyContext(currentContext);
            console.log(`[OrchestratorAgent] Simplified context for retry ${attempt + 1}`);
            break;

          case 'RATE_LIMIT':
            const waitTime = lastError.retryAfterMs ?? 30000;
            console.log(`[OrchestratorAgent] Rate limited, waiting ${waitTime}ms`);
            await this.delay(waitTime);
            break;

          case 'TIMEOUT':
          case 'NETWORK_ERROR':
            // Exponential backoff: 1s, 2s, 4s
            const backoff = Math.pow(2, attempt - 1) * 1000;
            console.log(`[OrchestratorAgent] Backing off ${backoff}ms before retry ${attempt + 1}`);
            await this.delay(backoff);
            break;

          case 'PARSE_ERROR':
            // Small delay before retry with hint
            await this.delay(500);
            break;

          default:
            // Default backoff
            await this.delay(1000);
        }
      }
    }

    // All retries failed
    this.circuitBreaker.recordFailure();
    throw lastError;
  }

  /**
   * Public handler that decides action and either runs a sub-agent or returns a final answer.
   * Includes circuit breaker protection for sub-agents and enhanced error handling.
   */
  async handleOrchestratorRequest(
    userMessage: string,
    context?: Record<string, unknown>,
    options?: OrchestratorOptions
  ): Promise<SubAgentResult> {
    const locale = options?.locale ?? 'it';

    // Get structured orchestrator action (with retry)
    let action: OrchestratorAction;
    try {
      action = await this.runOrchestratorWithRetry(userMessage, context, options);
    } catch (err) {
      // Classify the error and return appropriate fallback
      const error = err instanceof Error
        ? classifyError(err, { agentName: 'orchestrator' })
        : err as AgentError;

      return this.getFallbackResponse(error, locale);
    }

    if (action.action === 'call_tool') {
      const toolName = action.tool_name as OrchestratorToolName;

      // Check circuit breaker for this sub-agent
      const agentBreaker = this.getSubAgentBreaker(toolName);
      if (agentBreaker.isOpen()) {
        console.warn(`[OrchestratorAgent] Circuit breaker open for sub-agent ${toolName}`);
        return {
          content: locale === 'it'
            ? `Il servizio ${toolName} è temporaneamente non disponibile. Sto provando un approccio alternativo.`
            : `The ${toolName} service is temporarily unavailable. Trying an alternative approach.`,
          metadata: { fallback: true, errorCode: 'CIRCUIT_OPEN', agent: toolName }
        };
      }

      const tool = getSubAgent(toolName);
      if (!tool) {
        return {
          content: locale === 'it'
            ? `Nessun sotto-agente registrato per il tool "${toolName}".`
            : `No sub-agent registered for tool "${toolName}".`,
          metadata: { errorCode: 'AGENT_FAILURE' }
        };
      }

      const args = (action.tool_args ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(args);
        agentBreaker.recordSuccess();

        // If the client assessment tool returned a validated snapshot, persist it.
        try {
          if (toolName === 'CLIENT_ASSESSMENT' && result.metadata && (result.metadata as any).snapshot) {
            await saveAssessmentSnapshot((result.metadata as any).snapshot);
          }
        } catch (snapshotErr) {
          console.error('Failed to persist assessment snapshot:', snapshotErr instanceof Error ? snapshotErr.message : snapshotErr);
        }

        return result;
      } catch (err) {
        agentBreaker.recordFailure();

        const error = classifyError(err, {
          agentName: toolName,
          toolName
        });

        console.error('[OrchestratorAgent] Sub-agent error:', {
          agent: toolName,
          code: error.code,
          message: error.message
        });

        // If circuit just opened, try alternative if available
        if (agentBreaker.isOpen()) {
          console.warn(`[OrchestratorAgent] Circuit opened for ${toolName}, returning fallback`);
        }

        return {
          content: locale === 'it'
            ? `Errore eseguendo ${toolName}: ${error.message}. ${error.recoverable ? 'Riprova tra poco.' : ''}`
            : `Error running ${toolName}: ${error.message}. ${error.recoverable ? 'Please try again shortly.' : ''}`,
          metadata: {
            fallback: true,
            errorCode: error.code,
            agent: toolName,
            recoverable: error.recoverable
          }
        };
      }
    }

    if (action.action === 'final_answer') {
      return { content: action.content ?? '' };
    }

    return {
      content: locale === 'it'
        ? 'Azione dell\'orchestrator non riconosciuta.'
        : 'Unrecognized orchestrator action.',
      metadata: { errorCode: 'UNKNOWN' }
    };
  }

  /**
   * Get circuit breaker stats for monitoring
   */
  getCircuitBreakerStats(): {
    orchestrator: { state: string; failures: number };
    subAgents: Record<string, { state: string; failures: number }>;
  } {
    const subAgents: Record<string, { state: string; failures: number }> = {};
    for (const [name, breaker] of this.subAgentBreakers) {
      const stats = breaker.getStats();
      subAgents[name] = { state: stats.state, failures: stats.failures };
    }
    return {
      orchestrator: {
        state: this.circuitBreaker.getState(),
        failures: this.circuitBreaker.getStats().failures
      },
      subAgents
    };
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
