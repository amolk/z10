/**
 * F2. Rate limiting.
 *
 * Token bucket rate limiter for per-connection request throttling.
 * Used by CLI (MCP) connections and WebSocket connections.
 *
 * Defaults: 100 reads/s, 20 writes/s (configurable).
 * §12.3
 */

export interface RateLimiterConfig {
  /** Maximum tokens (burst capacity) */
  maxTokens: number;
  /** Tokens refilled per second */
  refillRate: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until a token is available (0 if allowed) */
  retryAfterMs: number;
}

/**
 * Token bucket rate limiter.
 * Tokens are consumed on each request and refilled at a constant rate.
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefillTime: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.tokens = config.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /** Try to consume one token. Returns whether the request is allowed. */
  tryConsume(): RateLimitResult {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }

    // Calculate how long until 1 token is available
    const retryAfterMs = Math.ceil((1 / this.refillRate) * 1000);
    return { allowed: false, retryAfterMs };
  }

  /** Current available tokens (for monitoring). */
  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /** Reset the limiter to full capacity. */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    if (elapsedMs <= 0) return;

    const tokensToAdd = (elapsedMs / 1000) * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }
}

/**
 * Per-connection rate limiter that enforces separate read and write limits.
 */
export class ConnectionRateLimiter {
  readonly reads: RateLimiter;
  readonly writes: RateLimiter;

  constructor(config?: { readsPerSecond?: number; writesPerSecond?: number }) {
    const readsPerSecond = config?.readsPerSecond ?? 100;
    const writesPerSecond = config?.writesPerSecond ?? 20;

    this.reads = new RateLimiter({
      maxTokens: readsPerSecond,
      refillRate: readsPerSecond,
    });
    this.writes = new RateLimiter({
      maxTokens: writesPerSecond,
      refillRate: writesPerSecond,
    });
  }

  /** Check if a read operation is allowed. */
  tryRead(): RateLimitResult {
    return this.reads.tryConsume();
  }

  /** Check if a write operation is allowed. */
  tryWrite(): RateLimitResult {
    return this.writes.tryConsume();
  }

  /** Reset both limiters. */
  reset(): void {
    this.reads.reset();
    this.writes.reset();
  }
}
