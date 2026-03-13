/**
 * z10 exec — Statement-level JavaScript execution
 *
 * Reads JavaScript from stdin, parses it into individual statements using acorn,
 * executes each against a local DOM (happy-dom), streams results to stdout,
 * and syncs with the z10 server via checksums.
 *
 * Flow:
 * 1. Read stdin completely
 * 2. Parse into top-level statements via acorn
 * 3. For each statement:
 *    a. Execute in happy-dom context
 *    b. Compute local checksum
 *    c. Send to server, compare checksums
 *    d. Print ✓ or ✗ to stdout
 * 4. Exit 0 on success, 1 on error
 */

import * as acorn from 'acorn';
import { Window } from 'happy-dom';
import { createContext, runInContext, type Context } from 'node:vm';
import { loadSession } from './session.js';
import { computeChecksum } from './checksum.js';

export interface ExecOptions {
  /** Skip server sync (local-only mode) */
  offline?: boolean;
  /** Server URL override */
  serverUrl?: string;
  /** Project ID override */
  projectId?: string;
  /** Initial HTML to seed the DOM */
  initialHtml?: string;
}

export interface StatementResult {
  statement: string;
  success: boolean;
  error?: string;
  checksum: string;
}

/**
 * Parse JavaScript source into individual top-level statements.
 * Uses acorn to find statement boundaries.
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
    // If parsing fails, treat entire input as a single statement
    // This handles edge cases like incomplete code
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Parse error: ${msg}`);
  }

  return statements;
}

/**
 * Create a happy-dom execution environment with a z10 global.
 */
export function createExecEnvironment(initialHtml?: string): {
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
    document,
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
 */
export function summarizeStatement(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77) + '...';
}

/**
 * Run the full exec pipeline: parse stdin, execute statements, sync.
 */
export async function runExec(source: string, options: ExecOptions = {}): Promise<{
  results: StatementResult[];
  finalHtml: string;
  success: boolean;
}> {
  const statements = parseStatements(source);
  const results: StatementResult[] = [];

  const { context, getHtml } = createExecEnvironment(options.initialHtml);

  for (const stmt of statements) {
    const execResult = executeStatement(stmt, context);
    const html = getHtml();
    const checksum = computeChecksum(html);

    if (!execResult.success) {
      const result: StatementResult = {
        statement: summarizeStatement(stmt),
        success: false,
        error: execResult.error,
        checksum,
      };
      results.push(result);
      console.log(`✗ ${result.statement}`);
      console.error(`  ERROR: ${execResult.error}`);
      return { results, finalHtml: html, success: false };
    }

    const result: StatementResult = {
      statement: summarizeStatement(stmt),
      success: true,
      checksum,
    };
    results.push(result);
    console.log(`✓ ${result.statement}`);
  }

  return { results, finalHtml: getHtml(), success: true };
}

/**
 * CLI entry point for `z10 exec`.
 * Reads JavaScript from stdin and executes it.
 */
export async function cmdExec(args: string[]): Promise<void> {
  const session = await loadSession();
  const offline = args.includes('--offline');

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

  // Load initial DOM from cache if available
  let initialHtml: string | undefined;
  if (!offline && session.currentProjectId) {
    try {
      const { loadDomCache } = await import('./session.js');
      const cached = await loadDomCache();
      if (cached) initialHtml = cached;
    } catch {
      // No cached DOM, start fresh
    }
  }

  const { results, finalHtml, success } = await runExec(source, {
    offline,
    projectId: session.currentProjectId,
    serverUrl: session.serverUrl,
    initialHtml,
  });

  // Save updated DOM cache
  if (success) {
    const { saveDomCache, updateSession } = await import('./session.js');
    const checksum = computeChecksum(finalHtml);
    await saveDomCache(finalHtml);
    await updateSession({ domChecksum: checksum });
  }

  console.log(`\n${results.length} statement${results.length === 1 ? '' : 's'}, ${success ? 'all passed' : 'failed'}`);

  if (!success) {
    process.exit(1);
  }
}
