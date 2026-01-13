/**
 * Error Schema - Structured error types for agent system
 *
 * Provides typed error classification for robust error handling,
 * recovery strategies, and structured logging.
 */

import { z } from 'zod';

// Error codes for classification
export const AgentErrorCode = z.enum([
  'PARSE_ERROR',        // AI output not parseable
  'TIMEOUT',            // Call timeout
  'RATE_LIMIT',         // OpenAI rate limit
  'AGENT_FAILURE',      // Sub-agent failed
  'VALIDATION_ERROR',   // Input/output validation failed
  'CONTEXT_OVERFLOW',   // Context too long
  'CIRCUIT_OPEN',       // Circuit breaker open
  'NETWORK_ERROR',      // Network connectivity issue
  'AUTH_ERROR',         // Authentication/authorization failed
  'UNKNOWN'             // Unknown error
]);

export type AgentErrorCode = z.infer<typeof AgentErrorCode>;

// Suggested recovery actions
export const RecoveryAction = z.enum([
  'retry',              // Simple retry
  'retry_with_backoff', // Retry with exponential backoff
  'simplify',           // Simplify input/context
  'fallback',           // Use fallback response
  'escalate',           // Escalate to human/admin
  'abort'               // Abort operation
]);

export type RecoveryAction = z.infer<typeof RecoveryAction>;

// Error context for debugging
export const ErrorContextSchema = z.object({
  agentName: z.string().optional(),
  toolName: z.string().optional(),
  attemptNumber: z.number().optional(),
  maxAttempts: z.number().optional(),
  inputSize: z.number().optional(),
  inputPreview: z.string().optional(),
  outputPreview: z.string().optional(),
  lastError: z.string().optional(),
  stackTrace: z.string().optional(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  requestId: z.string().optional(),
  durationMs: z.number().optional()
});

export type ErrorContext = z.infer<typeof ErrorContextSchema>;

// Main error schema
export const AgentErrorSchema = z.object({
  code: AgentErrorCode,
  message: z.string(),
  recoverable: z.boolean(),
  suggestedAction: RecoveryAction,
  retryAfterMs: z.number().optional(),
  context: ErrorContextSchema.optional()
});

export type AgentError = z.infer<typeof AgentErrorSchema>;

// Error classification rules
export interface ErrorClassificationRule {
  pattern: RegExp | string;
  code: AgentErrorCode;
  recoverable: boolean;
  suggestedAction: RecoveryAction;
  retryAfterMs?: number;
}

export const ERROR_CLASSIFICATION_RULES: ErrorClassificationRule[] = [
  // OpenAI errors
  {
    pattern: /rate.?limit/i,
    code: 'RATE_LIMIT',
    recoverable: true,
    suggestedAction: 'retry_with_backoff',
    retryAfterMs: 30000
  },
  {
    pattern: /timeout|timed out/i,
    code: 'TIMEOUT',
    recoverable: true,
    suggestedAction: 'retry_with_backoff',
    retryAfterMs: 5000
  },
  {
    pattern: /context.*(length|limit|overflow)|maximum context/i,
    code: 'CONTEXT_OVERFLOW',
    recoverable: true,
    suggestedAction: 'simplify'
  },
  // Parse errors
  {
    pattern: /parse|json|invalid.*output|unexpected token/i,
    code: 'PARSE_ERROR',
    recoverable: true,
    suggestedAction: 'retry'
  },
  // Validation errors
  {
    pattern: /validation|invalid.*input|schema|required/i,
    code: 'VALIDATION_ERROR',
    recoverable: false,
    suggestedAction: 'abort'
  },
  // Network errors
  {
    pattern: /network|ECONNREFUSED|ENOTFOUND|socket/i,
    code: 'NETWORK_ERROR',
    recoverable: true,
    suggestedAction: 'retry_with_backoff',
    retryAfterMs: 2000
  },
  // Auth errors
  {
    pattern: /unauthorized|forbidden|401|403|api.?key/i,
    code: 'AUTH_ERROR',
    recoverable: false,
    suggestedAction: 'abort'
  }
];

/**
 * Classify an error into a structured AgentError
 */
export function classifyError(
  error: unknown,
  context?: Partial<ErrorContext>
): AgentError {
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);

  // Try to match against rules
  for (const rule of ERROR_CLASSIFICATION_RULES) {
    const matches = typeof rule.pattern === 'string'
      ? errorMessage.toLowerCase().includes(rule.pattern.toLowerCase())
      : rule.pattern.test(errorMessage);

    if (matches) {
      return {
        code: rule.code,
        message: errorMessage,
        recoverable: rule.recoverable,
        suggestedAction: rule.suggestedAction,
        retryAfterMs: rule.retryAfterMs,
        context: {
          ...context,
          lastError: errorMessage,
          stackTrace: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  // Default: unknown error
  return {
    code: 'UNKNOWN',
    message: errorMessage,
    recoverable: false,
    suggestedAction: 'fallback',
    context: {
      ...context,
      lastError: errorMessage,
      stackTrace: error instanceof Error ? error.stack : undefined
    }
  };
}

/**
 * Create a structured error from code and message
 */
export function createAgentError(
  code: AgentErrorCode,
  message: string,
  context?: Partial<ErrorContext>
): AgentError {
  const rule = ERROR_CLASSIFICATION_RULES.find(r => {
    if (typeof r.pattern === 'string') return false;
    return r.code === code;
  });

  return {
    code,
    message,
    recoverable: rule?.recoverable ?? false,
    suggestedAction: rule?.suggestedAction ?? 'fallback',
    retryAfterMs: rule?.retryAfterMs,
    context
  };
}

/**
 * Check if error is recoverable with specific action
 */
export function canRecoverWith(error: AgentError, action: RecoveryAction): boolean {
  if (!error.recoverable) return false;

  switch (action) {
    case 'retry':
      return ['PARSE_ERROR', 'TIMEOUT'].includes(error.code);
    case 'retry_with_backoff':
      return ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR'].includes(error.code);
    case 'simplify':
      return error.code === 'CONTEXT_OVERFLOW';
    case 'fallback':
      return true;
    default:
      return false;
  }
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: AgentError, locale: 'it' | 'en' = 'it'): string {
  const messages: Record<AgentErrorCode, { it: string; en: string }> = {
    PARSE_ERROR: {
      it: 'Ho avuto difficoltà a elaborare la richiesta. Puoi riformularla in modo più specifico?',
      en: 'I had trouble processing the request. Could you rephrase it more specifically?'
    },
    TIMEOUT: {
      it: 'L\'elaborazione sta richiedendo più tempo del previsto. Sto riprovando...',
      en: 'Processing is taking longer than expected. Retrying...'
    },
    RATE_LIMIT: {
      it: 'Sistema temporaneamente sovraccarico. Riprova tra qualche secondo.',
      en: 'System temporarily overloaded. Please try again in a few seconds.'
    },
    AGENT_FAILURE: {
      it: 'Si è verificato un problema nell\'elaborazione. Sto provando un approccio alternativo.',
      en: 'A processing error occurred. Trying an alternative approach.'
    },
    VALIDATION_ERROR: {
      it: 'I dati forniti non sono validi. Verifica i campi obbligatori.',
      en: 'The provided data is not valid. Please check required fields.'
    },
    CONTEXT_OVERFLOW: {
      it: 'La richiesta è troppo complessa. Sto semplificando l\'elaborazione.',
      en: 'The request is too complex. Simplifying the processing.'
    },
    CIRCUIT_OPEN: {
      it: 'Il sistema sta recuperando da un problema. Riprova tra un minuto.',
      en: 'The system is recovering from an issue. Please try again in a minute.'
    },
    NETWORK_ERROR: {
      it: 'Problema di connessione. Verifico e riprovo...',
      en: 'Connection issue. Checking and retrying...'
    },
    AUTH_ERROR: {
      it: 'Errore di autenticazione. Verifica le credenziali.',
      en: 'Authentication error. Please verify credentials.'
    },
    UNKNOWN: {
      it: 'Si è verificato un errore imprevisto. Il team è stato notificato.',
      en: 'An unexpected error occurred. The team has been notified.'
    }
  };

  return messages[error.code][locale];
}

export default {
  AgentErrorSchema,
  ErrorContextSchema,
  classifyError,
  createAgentError,
  canRecoverWith,
  getUserFriendlyMessage
};
