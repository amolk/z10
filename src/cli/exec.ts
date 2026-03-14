/**
 * z10 exec — JavaScript execution against the collaborative DOM.
 *
 * New flow (replaces old statement-by-statement approach):
 * 1. Read stdin completely
 * 2. Get project connection (initial sync + patch subscription)
 * 3. Get subtree + ticket from local proxy
 * 4. submitCode(code, ticketId) — validates locally, forwards to server
 * 5. Print result
 *
 * Legacy functions (parseStatements, createExecEnvironment, executeStatement,
 * summarizeStatement) are kept temporarily for MCP tool compatibility (Phase E).
 */

import * as acorn from 'acorn';
import { Window } from 'happy-dom';
import { createContext, runInContext, type Context } from 'node:vm';
import { loadSession, resolvePageId, extractFlag } from './session.js';
import { getProjectConnection } from './project-connection.js';

// ── Legacy functions kept for MCP tools (until Phase E) ──

/**
 * Parse JavaScript source into individual top-level statements.
 * Uses acorn to find statement boundaries.
 *
 * @deprecated Used by MCP tools only. Will be removed in Phase E.
 */
export function parseStatements(source: string): string[] {
  const statements: string[] = [];

  try {
    const ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    });

    for (const node of (ast as acorn.Program).body) {
      statements.push(source.slice(node.start, node.end));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Parse error: ${msg}`);
  }

  return statements;
}

/**
 * Create a happy-dom execution environment with a z10 global.
 *
 * When `pageRootId` is provided, the `document` exposed to scripts is scoped
 * to the page's root element so queries like `getElementById` only find
 * elements within the current page.
 *
 * @deprecated Used by MCP tools only. Will be removed in Phase E.
 */
export function createExecEnvironment(initialHtml?: string, pageRootId?: string): {
  window: InstanceType<typeof Window>;
  context: Context;
  getHtml: () => string;
} {
  const window = new Window({
    url: 'https://z10.dev',
  });
  const document = window.document;

  if (initialHtml) {
    document.body.innerHTML = initialHtml;
  }

  // When a page is active, scope document queries to the page root element
  const pageRoot = pageRootId
    ? document.querySelector(`[data-z10-id="${pageRootId}"]`) ?? document.getElementById(pageRootId)
    : null;

  const scopedDocument = pageRoot
    ? new Proxy(document, {
        get(target, prop, receiver) {
          if (prop === 'body') {
            return pageRoot;
          }
          if (prop === 'getElementById') {
            return (id: string) => pageRoot.querySelector(`#${id}`) ?? pageRoot.querySelector(`[data-z10-id="${id}"]`);
          }
          if (prop === 'querySelector') {
            return (sel: string) => pageRoot.querySelector(sel);
          }
          if (prop === 'querySelectorAll') {
            return (sel: string) => pageRoot.querySelectorAll(sel);
          }
          if (prop === 'getElementsByClassName') {
            return (cls: string) => pageRoot.getElementsByClassName(cls);
          }
          if (prop === 'getElementsByTagName') {
            return (tag: string) => pageRoot.getElementsByTagName(tag);
          }
          return Reflect.get(target, prop, receiver);
        },
      })
    : document;

  // z10 global for token management
  const z10Global = {
    setTokens(collection: string, tokens: Record<string, string>) {
      const root = document.documentElement;
      for (const [key, value] of Object.entries(tokens)) {
        root.style.setProperty(key, value);
      }
      // Store token metadata as data attribute for serialization
      const existing = root.getAttribute(`data-z10-tokens-${collection}`);
      const merged = existing ? { ...JSON.parse(existing), ...tokens } : tokens;
      root.setAttribute(`data-z10-tokens-${collection}`, JSON.stringify(merged));
    },
  };

  // Build the VM context with window globals exposed
  const contextObj: Record<string, unknown> = {
    window,
    document: scopedDocument,
    z10: z10Global,
    console: {
      log: (...args: unknown[]) => console.log('[z10]', ...args),
      warn: (...args: unknown[]) => console.warn('[z10]', ...args),
      error: (...args: unknown[]) => console.error('[z10]', ...args),
    },
    // Expose common DOM constructors
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };

  const context = createContext(contextObj);

  const getHtml = () => document.body.innerHTML;

  return { window, context, getHtml };
}

/**
 * Execute a single JS statement in the given context.
 *
 * @deprecated Used by MCP tools only. Will be removed in Phase E.
 */
export function executeStatement(
  statement: string,
  context: Context
): { success: boolean; error?: string; result?: unknown } {
  try {
    const result = runInContext(statement, context, {
      filename: 'z10-exec',
      timeout: 5000,
    });
    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Summarize a statement for stdout display.
 * Truncates long statements to keep output readable.
 *
 * @deprecated Used by MCP tools only. Will be removed in Phase E.
 */
export function summarizeStatement(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77) + '...';
}

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
  proxy: { submitCode: (code: string, ticketId: string) => Promise<import('../dom/proxy.js').SubmitResult> },
  code: string,
  ticketId: string,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<import('../dom/proxy.js').SubmitResult> {
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

// ── New exec flow (B8 + E2) ──

/**
 * CLI entry point for `z10 exec [--project <id>] [--page <id>]`.
 * Reads JavaScript from stdin and executes via the collaborative DOM.
 *
 * Flow: read stdin → get project connection → getSubtree + ticket
 * → submitCode with retry on conflict → print result.
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
    console.log(`✓ Executed (txId: ${result.txId})`);
  } else {
    console.error('✗ Execution rejected');
    if (result.conflicts && result.conflicts.length > 0) {
      for (const conflict of result.conflicts) {
        console.error(`  Conflict: ${JSON.stringify(conflict)}`);
      }
    }
    if (result.html) {
      console.error('  Fresh HTML available — subtree was modified concurrently.');
    }
    process.exit(1);
  }
}
