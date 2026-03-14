/**
 * z10 exec — JavaScript execution against the server's canonical DOM.
 *
 * Flow:
 * 1. Read stdin completely (single JS block)
 * 2. POST to /api/projects/:id/transact (server executes against canonical DOM)
 * 3. Print result: updated HTML on commit, error details on reject
 * 4. Fetch fresh DOM to display post-commit state
 */

import { loadSession, resolvePageId, extractFlag, rejectUnknownFlags } from './session.js';
import { transact, fetchDom } from './api.js';

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

// ── CLI exec command ──

/**
 * CLI entry point for `z10 exec [--project <id>] [--page <id>]`.
 * Reads JavaScript from stdin and sends to server for execution.
 */
export async function cmdExec(args: string[]): Promise<void> {
  rejectUnknownFlags(args, ['--project', '--page']);
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

  // Send code to server for execution against canonical DOM
  const subtreeRootNid = pageId ?? undefined;
  const result = await transact(projectId, source, subtreeRootNid);

  if (result.status === 'committed') {
    // Fetch fresh DOM to show the updated state
    const dom = await fetchDom(projectId);
    console.log(`✓ Executed (txId: ${result.txId})`);
    console.log(dom.html);
  } else {
    // Print rejection details
    console.error('✗ Execution rejected');
    if (result.conflicts && (result.conflicts as unknown[]).length > 0) {
      for (const conflict of result.conflicts) {
        console.error(`  Conflict: ${JSON.stringify(conflict)}`);
      }
    }
    if (result.error) {
      console.error(`  Error: ${result.error}`);
    }
    if (result.freshHtml) {
      console.log(result.freshHtml);
    }
    process.exit(1);
  }
}
