/**
 * Per-user request rate limiting for API endpoints.
 *
 * Reuses ConnectionRateLimiter from z10/dom for token bucket logic.
 * Keyed by userId with periodic cleanup of stale entries.
 */

import { ConnectionRateLimiter } from "z10/dom";

interface LimiterEntry {
  limiter: ConnectionRateLimiter;
  lastUsed: number;
}

const perUserLimiters = new Map<string, LimiterEntry>();

/** Stale limiter cleanup interval: 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** Remove limiters unused for 10 minutes */
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Get or create a rate limiter for a user.
 * Per-USER limits (tighter than per-connection defaults in ConnectionRateLimiter).
 * ConnectionRateLimiter defaults: 100 reads/s, 20 writes/s (per connection).
 * Per-user limits are halved to bound aggregate load across multiple connections.
 */
export function getUserLimiter(userId: string): ConnectionRateLimiter {
  let entry = perUserLimiters.get(userId);
  if (!entry) {
    entry = {
      limiter: new ConnectionRateLimiter({ readsPerSecond: 50, writesPerSecond: 10 }),
      lastUsed: Date.now(),
    };
    perUserLimiters.set(userId, entry);
  }
  entry.lastUsed = Date.now();
  return entry.limiter;
}

/** Clean up stale limiters. */
function cleanupStaleLimiters() {
  const now = Date.now();
  for (const [userId, entry] of perUserLimiters) {
    if (now - entry.lastUsed > STALE_THRESHOLD_MS) {
      perUserLimiters.delete(userId);
    }
  }
}

if (typeof setInterval !== "undefined") {
  const timer = setInterval(cleanupStaleLimiters, CLEANUP_INTERVAL_MS);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
