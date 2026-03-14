/**
 * z10 exec — JavaScript execution against the collaborative DOM.
 *
 * E3 flow (replaces old statement-by-statement approach):
 * 1. Read stdin completely (single JS block, no parsing)
 * 2. Get project connection (initial sync + patch subscription)
 * 3. Get subtree + ticket from local proxy
 * 4. submitCode(code, ticketId) with retry on conflict (E2)
 * 5. Print result: updated HTML on commit, fresh HTML + conflicts on reject
 */

import { loadSession, resolvePageId, extractFlag } from './session.js';
import { getProjectConnection } from './project-connection.js';
import type { SubmitResult } from '../dom/proxy.js';

// ── Retry with backoff (E2) ──

/** Options for retry with exponential backoff + jitter. */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
  jitterMs: 50,
};

/**
 * Compute delay for exponential backoff with jitter.
 * Formula: min(baseDelay * 2^attempt + random(0, jitter), maxDelay)
 */
export function computeRetryDelay(attempt: number, opts: RetryOptions): number {
  const exponential = opts.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * opts.jitterMs;
  return Math.min(exponential + jitter, opts.maxDelayMs);
}

/**
 * Submit code with automatic retry on conflict rejection.
 * On conflict: uses the fresh ticket from the rejection result, waits with
 * exponential backoff + jitter, then retries. Transparent to the agent.
 *
 * Non-conflict rejections (code errors) are NOT retried — the same code
 * would fail again.
 */
export async function submitWithRetry(
  proxy: { submitCode: (code: string, ticketId: string) => Promise<SubmitResult> },
  code: string,
  ticketId: string,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<SubmitResult> {
  let currentTicketId = ticketId;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const result = await proxy.submitCode(code, currentTicketId);

    if (result.status === 'committed') {
      return result;
    }

    // Only retry on conflict rejections — code errors won't resolve with retry
    const isConflict = result.conflicts && result.conflicts.length > 0;
    if (!isConflict) {
      return result;
    }

    // Last attempt — return the rejection, don't wait
    if (attempt === opts.maxAttempts - 1) {
      return result;
    }

    // Use the fresh ticket from the rejection for retry
    currentTicketId = result.newTicketId;

    // Wait with exponential backoff + jitter
    const delay = computeRetryDelay(attempt, opts);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('Retry loop exited unexpectedly');
}

// ── CLI exec command (E3) ──

/**
 * CLI entry point for `z10 exec [--project <id>] [--page <id>]`.
 * Reads JavaScript from stdin and executes via the collaborative DOM.
 *
 * Flow: read stdin → get project connection → getSubtree + ticket
 * → submitCode with retry on conflict → print result with HTML.
 */
export async function cmdExec(args: string[]): Promise<void> {
  const session = await loadSession();

  // Resolve project/page from flags or session
  const projectIdFromFlag = extractFlag(args, '--project');
  const projectId = projectIdFromFlag ?? session.currentProjectId;
  const pageId = resolvePageId(args, session);

  if (!projectId) {
    console.error('No project specified. Use --project <id> or run `z10 project load <id>` first.');
    process.exit(1);
  }

  // Read stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const source = Buffer.concat(chunks).toString('utf-8').trim();

  if (!source) {
    console.error('No input received. Pipe JavaScript via stdin:');
    console.error('  z10 exec <<\'EOF\'');
    console.error('  document.body.innerHTML = "<div>Hello</div>";');
    console.error('  EOF');
    process.exit(1);
  }

  // Get project connection (initial sync + patch subscription)
  const conn = await getProjectConnection(projectId);

  // Get a subtree + ticket. Use page root if specified, otherwise document root.
  const selector = pageId ? `[data-z10-id="${pageId}"]` : '[data-z10-id]';
  const subtree = conn.proxy.getSubtree(selector);

  // Submit code with automatic retry on conflict (E2)
  const result = await submitWithRetry(conn.proxy, source, subtree.ticketId);

  if (result.status === 'committed') {
    // Print success with txId and updated HTML for agent consumption
    console.log(`✓ Executed (txId: ${result.txId})`);
    console.log(result.html);
  } else {
    // Print rejection details
    console.error('✗ Execution rejected');
    if (result.conflicts && result.conflicts.length > 0) {
      for (const conflict of result.conflicts) {
        console.error(`  Conflict: ${JSON.stringify(conflict)}`);
      }
    }
    if (result.error) {
      console.error(`  Error: ${result.error}`);
    }
    // Print fresh HTML so agent can see current state and retry
    console.log(result.html);
    process.exit(1);
  }
}
