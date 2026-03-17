/**
 * z10 exec — JavaScript execution against the server's canonical DOM.
 *
 * Flow:
 * 1. Read stdin completely (single JS block)
 * 2. POST to /api/projects/:id/transact (server executes against canonical DOM)
 * 3. Print result: updated HTML on commit, error details on reject
 * 4. Fetch fresh DOM to display post-commit state
 */

import { loadSession } from './session.js';
import { extractFlag, rejectUnknownFlags, resolvePageId } from './flags.js';
import { Z10Client } from './z10-client.js';

// ── Retry with backoff (E2) ──

/** Options for retry with exponential backoff + jitter. */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export const DEFAULT_RETRY: RetryOptions = {
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

/** Minimal interface for the proxy object used by submitWithRetry. */
interface SubmitProxy {
  submitCode(code: string, ticketId: string): Promise<import('../dom/proxy.js').SubmitResult>;
}

/**
 * Submit code with exponential backoff retry on conflict rejections.
 * Non-conflict rejections and commits return immediately.
 */
export async function submitWithRetry(
  proxy: SubmitProxy,
  code: string,
  ticketId: string,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<import('../dom/proxy.js').SubmitResult> {
  let currentTicket = ticketId;
  let lastResult: import('../dom/proxy.js').SubmitResult | undefined;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    const result = await proxy.submitCode(code, currentTicket);
    if (result.status === 'committed') return result;
    // Only retry on conflict with actual conflicts
    if (result.reason !== 'conflict' || !result.conflicts?.length) return result;
    lastResult = result;
    // Use fresh ticket from rejection for next attempt
    currentTicket = result.newTicketId;
    if (attempt < opts.maxAttempts - 1) {
      await new Promise(r => setTimeout(r, computeRetryDelay(attempt, opts)));
    }
  }
  return lastResult!;
}

// ── CLI exec command ──

/**
 * CLI entry point for `z10 exec [--project <id>] [--page <id>]`.
 * Reads JavaScript from stdin and sends to server for execution.
 */
export async function cmdExec(args: string[]): Promise<void> {
  rejectUnknownFlags(args, ['--project', '--page']);
  const session = await loadSession();
  const client = await Z10Client.create();

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
  const result = await client.transact(projectId, source, subtreeRootNid);

  if (result.status === 'committed') {
    // Fetch fresh DOM to show the updated state
    const dom = await client.fetchDom(projectId);
    console.log(`✓ Executed (txId: ${result.txId})`);
    console.log(dom.html);
  } else {
    // Print structured rejection details with actionable guidance
    const reason = result.reason ?? 'unknown';
    console.error(`✗ Execution rejected [${reason}]`);
    console.error('');

    switch (reason) {
      case 'execution-error':
        console.error('  Your JavaScript threw an error or timed out during execution.');
        if (result.error) {
          console.error(`  Error: ${result.error}`);
        }
        console.error('');
        console.error('  Hints:');
        console.error('    - Check for syntax errors in your code');
        console.error('    - Ensure you are querying elements that exist in the DOM');
        console.error('    - Use document.querySelector() / document.querySelectorAll() to find elements');
        console.error('    - Run `z10 dom` to inspect the current DOM state');
        break;

      case 'illegal-modification':
        console.error('  Your code modified protected system attributes (data-z10-id or data-z10-ts-*).');
        if (result.error) {
          console.error(`  Detail: ${result.error}`);
        }
        console.error('');
        console.error('  Hints:');
        console.error('    - Do NOT set or remove data-z10-id or data-z10-ts-* attributes');
        console.error('    - These are managed internally by the z10 transaction engine');
        break;

      case 'conflict':
        console.error('  The DOM was modified by another transaction since your last read.');
        if (result.conflicts && (result.conflicts as unknown[]).length > 0) {
          for (const conflict of result.conflicts) {
            console.error(`  Conflict: ${JSON.stringify(conflict)}`);
          }
        }
        console.error('');
        console.error('  Hints:');
        console.error('    - Re-fetch the DOM with `z10 dom` and retry your operation');
        console.error('    - This is usually transient — retrying should succeed');
        break;

      case 'lock-timeout':
        console.error('  Could not acquire a lock on the target subtree (another transaction is in progress).');
        console.error('');
        console.error('  Hints:');
        console.error('    - Wait a moment and retry');
        console.error('    - Ensure no other z10 exec calls are running concurrently on the same subtree');
        break;

      default:
        if (result.error) {
          console.error(`  Error: ${result.error}`);
        }
        break;
    }

    if (result.freshHtml) {
      console.error('');
      console.error('  Current DOM state:');
      console.log(result.freshHtml);
    }
    process.exit(1);
  }
}
