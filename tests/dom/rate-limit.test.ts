/**
 * Tests for rate limiting (F2).
 *
 * Validates token bucket rate limiter for per-connection throttling.
 * Default limits: 100 reads/s, 20 writes/s.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, ConnectionRateLimiter } from '../../src/dom/rate-limit.js';

describe('RateLimiter', () => {
  it('allows requests within capacity', () => {
    const limiter = new RateLimiter({ maxTokens: 5, refillRate: 5 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume().allowed).toBe(true);
    }
  });

  it('rejects requests when tokens exhausted', () => {
    const limiter = new RateLimiter({ maxTokens: 2, refillRate: 2 });
    limiter.tryConsume();
    limiter.tryConsume();
    const result = limiter.tryConsume();
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills tokens over time', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxTokens: 5, refillRate: 5 });

    // Exhaust all tokens
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    expect(limiter.tryConsume().allowed).toBe(false);

    // Advance 1 second — should refill 5 tokens
    vi.advanceTimersByTime(1000);
    expect(limiter.availableTokens).toBe(5);
    expect(limiter.tryConsume().allowed).toBe(true);

    vi.useRealTimers();
  });

  it('does not exceed maxTokens on refill', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxTokens: 10, refillRate: 100 });

    // Advance 10 seconds — would add 1000 tokens but capped at 10
    vi.advanceTimersByTime(10000);
    expect(limiter.availableTokens).toBe(10);

    vi.useRealTimers();
  });

  it('provides correct retryAfterMs', () => {
    const limiter = new RateLimiter({ maxTokens: 1, refillRate: 10 });
    limiter.tryConsume(); // exhaust
    const result = limiter.tryConsume();
    expect(result.allowed).toBe(false);
    // 10 tokens/s → 100ms per token
    expect(result.retryAfterMs).toBe(100);
  });

  it('reset restores full capacity', () => {
    const limiter = new RateLimiter({ maxTokens: 5, refillRate: 5 });
    for (let i = 0; i < 5; i++) limiter.tryConsume();
    expect(limiter.tryConsume().allowed).toBe(false);

    limiter.reset();
    expect(limiter.availableTokens).toBe(5);
    expect(limiter.tryConsume().allowed).toBe(true);
  });

  it('partially refills tokens', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ maxTokens: 10, refillRate: 10 });

    // Exhaust all
    for (let i = 0; i < 10; i++) limiter.tryConsume();

    // Advance 500ms → should add 5 tokens
    vi.advanceTimersByTime(500);
    expect(limiter.availableTokens).toBe(5);

    vi.useRealTimers();
  });
});

describe('ConnectionRateLimiter', () => {
  it('uses default limits (100 reads/s, 20 writes/s)', () => {
    const conn = new ConnectionRateLimiter();
    // Should allow 100 reads
    for (let i = 0; i < 100; i++) {
      expect(conn.tryRead().allowed).toBe(true);
    }
    expect(conn.tryRead().allowed).toBe(false);

    // Should allow 20 writes
    for (let i = 0; i < 20; i++) {
      expect(conn.tryWrite().allowed).toBe(true);
    }
    expect(conn.tryWrite().allowed).toBe(false);
  });

  it('accepts custom limits', () => {
    const conn = new ConnectionRateLimiter({
      readsPerSecond: 5,
      writesPerSecond: 2,
    });

    for (let i = 0; i < 5; i++) {
      expect(conn.tryRead().allowed).toBe(true);
    }
    expect(conn.tryRead().allowed).toBe(false);

    for (let i = 0; i < 2; i++) {
      expect(conn.tryWrite().allowed).toBe(true);
    }
    expect(conn.tryWrite().allowed).toBe(false);
  });

  it('tracks reads and writes independently', () => {
    const conn = new ConnectionRateLimiter({
      readsPerSecond: 3,
      writesPerSecond: 3,
    });

    // Exhaust reads
    for (let i = 0; i < 3; i++) conn.tryRead();
    expect(conn.tryRead().allowed).toBe(false);

    // Writes still available
    expect(conn.tryWrite().allowed).toBe(true);
  });

  it('reset restores both limiters', () => {
    const conn = new ConnectionRateLimiter({
      readsPerSecond: 2,
      writesPerSecond: 2,
    });

    conn.tryRead();
    conn.tryRead();
    conn.tryWrite();
    conn.tryWrite();
    expect(conn.tryRead().allowed).toBe(false);
    expect(conn.tryWrite().allowed).toBe(false);

    conn.reset();
    expect(conn.tryRead().allowed).toBe(true);
    expect(conn.tryWrite().allowed).toBe(true);
  });
});
