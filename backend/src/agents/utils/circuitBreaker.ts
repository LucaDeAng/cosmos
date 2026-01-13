/**
 * Circuit Breaker - Fault tolerance for agent calls
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when sub-agents or external services are failing.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests are blocked
 * - HALF_OPEN: Testing if service recovered
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time window for counting failures (ms) */
  failureWindow: number;
  /** Time to wait before testing recovery (ms) */
  resetTimeout: number;
  /** Number of successful calls to close circuit from half-open */
  successThreshold: number;
  /** Optional name for logging */
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  lastStateChange: Date;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  failureWindow: 60000,      // 1 minute
  resetTimeout: 30000,       // 30 seconds
  successThreshold: 2,
  name: 'default'
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures: { timestamp: Date }[] = [];
  private successCount = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private lastStateChange: Date = new Date();
  private totalFailures = 0;
  private totalSuccesses = 0;
  private openedAt: Date | null = null;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if the circuit allows requests
   */
  isOpen(): boolean {
    this.cleanOldFailures();
    this.checkHalfOpen();
    return this.state === 'open';
  }

  /**
   * Check if circuit is in half-open state (testing recovery)
   */
  isHalfOpen(): boolean {
    this.checkHalfOpen();
    return this.state === 'half_open';
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.checkHalfOpen();
    return this.state;
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.lastSuccess = new Date();
    this.totalSuccesses++;

    if (this.state === 'half_open') {
      this.successCount++;
      console.log(`[CircuitBreaker:${this.config.name}] Success in half-open state (${this.successCount}/${this.config.successThreshold})`);

      if (this.successCount >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.successCount++;
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    const now = new Date();
    this.failures.push({ timestamp: now });
    this.lastFailure = now;
    this.totalFailures++;
    this.successCount = 0;

    this.cleanOldFailures();

    if (this.state === 'half_open') {
      // Any failure in half-open reopens the circuit
      console.log(`[CircuitBreaker:${this.config.name}] Failure in half-open state, reopening circuit`);
      this.open();
    } else if (this.state === 'closed') {
      // Check if we've exceeded threshold
      if (this.failures.length >= this.config.failureThreshold) {
        console.log(`[CircuitBreaker:${this.config.name}] Failure threshold reached (${this.failures.length}/${this.config.failureThreshold}), opening circuit`);
        this.open();
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures.length,
      successes: this.successCount,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      lastStateChange: this.lastStateChange,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    };
  }

  /**
   * Force circuit to close (manual reset)
   */
  reset(): void {
    this.close();
    this.failures = [];
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    console.log(`[CircuitBreaker:${this.config.name}] Manual reset`);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error(`Circuit breaker is open for ${this.config.name}`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  // Private methods

  private open(): void {
    this.state = 'open';
    this.openedAt = new Date();
    this.lastStateChange = new Date();
    this.successCount = 0;
    console.log(`[CircuitBreaker:${this.config.name}] Circuit OPENED`);
  }

  private close(): void {
    this.state = 'closed';
    this.lastStateChange = new Date();
    this.failures = [];
    this.successCount = 0;
    this.openedAt = null;
    console.log(`[CircuitBreaker:${this.config.name}] Circuit CLOSED`);
  }

  private halfOpen(): void {
    this.state = 'half_open';
    this.lastStateChange = new Date();
    this.successCount = 0;
    console.log(`[CircuitBreaker:${this.config.name}] Circuit HALF-OPEN (testing recovery)`);
  }

  private checkHalfOpen(): void {
    if (this.state === 'open' && this.openedAt) {
      const elapsed = Date.now() - this.openedAt.getTime();
      if (elapsed >= this.config.resetTimeout) {
        this.halfOpen();
      }
    }
  }

  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failures = this.failures.filter(f => f.timestamp.getTime() > cutoff);
  }
}

// Singleton registry for named circuit breakers
const circuitBreakers: Map<string, CircuitBreaker> = new Map();

/**
 * Get or create a named circuit breaker
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ ...config, name }));
  }
  return circuitBreakers.get(name)!;
}

/**
 * Get all circuit breakers stats
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

export default CircuitBreaker;
