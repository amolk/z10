/**
 * E2. Tests for retry with exponential backoff.
 *
 * Tests the submitWithRetry function which automatically retries
 * on conflict rejection with exponential backoff + jitter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitWithRetry, computeRetryDelay, type RetryOptions } from '../../src/cli/exec.js';
import type { SubmitResult, SubmitSuccess, SubmitRejected } from '../../src/dom/proxy.js';

const FAST_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1,    // 1ms for fast tests
  maxDelayMs: 10,
  jitterMs: 1,
};

function makeCommitted(txId: number = 1): SubmitSuccess {
  return {
    status: 'committed',
    txId,
    timestamp: txId,
    patch: { txId, ts: txId, ops: [], baseTxId: txId - 1 },
    html: '<div>ok</div>',
    newTicketId: `t${txId + 1}`,
  };
}

function makeConflictRejected(newTicketId: string = 't2'): SubmitRejected {
  return {
    status: 'rejected',
    reason: 'conflict',
    conflicts: [{ type: 'style-property', nid: 'n1', property: 'padding', manifestTs: 1, liveTs: 2 }],
    html: '<div>fresh</div>',
    newTicketId,
  };
}

function makeErrorRejected(): SubmitRejected {
  return {
    status: 'rejected',
    reason: 'execution-error',
    error: 'Cannot read properties of null',
    html: '<div>fresh</div>',
    newTicketId: 't2',
  };
}

describe('E2 computeRetryDelay', () => {
  it('should compute exponential backoff', () => {
    const opts: RetryOptions = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 5000, jitterMs: 0 };
    // With jitter=0, result is deterministic
    expect(computeRetryDelay(0, opts)).toBe(100);  // 100 * 2^0 = 100
    expect(computeRetryDelay(1, opts)).toBe(200);  // 100 * 2^1 = 200
    expect(computeRetryDelay(2, opts)).toBe(400);  // 100 * 2^2 = 400
    expect(computeRetryDelay(3, opts)).toBe(800);  // 100 * 2^3 = 800
  });

  it('should cap at maxDelay', () => {
    const opts: RetryOptions = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500, jitterMs: 0 };
    expect(computeRetryDelay(0, opts)).toBe(100);
    expect(computeRetryDelay(3, opts)).toBe(500);  // 800 capped to 500
    expect(computeRetryDelay(10, opts)).toBe(500); // way beyond cap
  });

  it('should add jitter within range', () => {
    const opts: RetryOptions = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 5000, jitterMs: 50 };
    const delay = computeRetryDelay(0, opts);
    expect(delay).toBeGreaterThanOrEqual(100);
    expect(delay).toBeLessThanOrEqual(150); // 100 + 50 jitter max
  });
});

describe('E2 submitWithRetry', () => {
  it('should return immediately on commit', async () => {
    const proxy = { submitCode: vi.fn().mockResolvedValue(makeCommitted(5)) };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('committed');
    expect(proxy.submitCode).toHaveBeenCalledTimes(1);
    expect(proxy.submitCode).toHaveBeenCalledWith('code', 't1');
  });

  it('should not retry on non-conflict rejection (code error)', async () => {
    const proxy = { submitCode: vi.fn().mockResolvedValue(makeErrorRejected()) };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('rejected');
    expect(proxy.submitCode).toHaveBeenCalledTimes(1);
  });

  it('should retry on conflict rejection using fresh ticket', async () => {
    const proxy = {
      submitCode: vi.fn()
        .mockResolvedValueOnce(makeConflictRejected('t2'))
        .mockResolvedValueOnce(makeCommitted(5)),
    };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('committed');
    expect(proxy.submitCode).toHaveBeenCalledTimes(2);
    // First call uses original ticket, second uses fresh ticket from rejection
    expect(proxy.submitCode).toHaveBeenNthCalledWith(1, 'code', 't1');
    expect(proxy.submitCode).toHaveBeenNthCalledWith(2, 'code', 't2');
  });

  it('should chain fresh tickets across multiple retries', async () => {
    const proxy = {
      submitCode: vi.fn()
        .mockResolvedValueOnce(makeConflictRejected('t2'))
        .mockResolvedValueOnce(makeConflictRejected('t3'))
        .mockResolvedValueOnce(makeCommitted(5)),
    };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('committed');
    expect(proxy.submitCode).toHaveBeenCalledTimes(3);
    expect(proxy.submitCode).toHaveBeenNthCalledWith(1, 'code', 't1');
    expect(proxy.submitCode).toHaveBeenNthCalledWith(2, 'code', 't2');
    expect(proxy.submitCode).toHaveBeenNthCalledWith(3, 'code', 't3');
  });

  it('should give up after maxAttempts and return last rejection', async () => {
    const proxy = {
      submitCode: vi.fn()
        .mockResolvedValueOnce(makeConflictRejected('t2'))
        .mockResolvedValueOnce(makeConflictRejected('t3'))
        .mockResolvedValueOnce(makeConflictRejected('t4')),
    };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('rejected');
    expect(proxy.submitCode).toHaveBeenCalledTimes(3); // maxAttempts = 3
  });

  it('should call submitCode multiple times with delays on conflict', async () => {
    // Track call timestamps to verify delays happened
    const callTimestamps: number[] = [];
    const proxy = {
      submitCode: vi.fn().mockImplementation(async () => {
        callTimestamps.push(performance.now());
        if (callTimestamps.length === 1) return makeConflictRejected('t2');
        return makeCommitted(5);
      }),
    };

    await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    // Verify two calls happened (original + 1 retry)
    expect(proxy.submitCode).toHaveBeenCalledTimes(2);
    // Verify there was some delay between calls (even if small due to event loop)
    expect(callTimestamps).toHaveLength(2);
    expect(callTimestamps[1]).toBeGreaterThan(callTimestamps[0]);
  });

  it('should handle rejection with empty conflicts array as non-conflict', async () => {
    const rejection: SubmitRejected = {
      status: 'rejected',
      reason: 'execution-error',
      conflicts: [],
      error: 'Some error',
      html: '<div>fresh</div>',
      newTicketId: 't2',
    };
    const proxy = { submitCode: vi.fn().mockResolvedValue(rejection) };

    const result = await submitWithRetry(proxy, 'code', 't1', FAST_RETRY);

    expect(result.status).toBe('rejected');
    expect(proxy.submitCode).toHaveBeenCalledTimes(1); // no retry
  });
});
