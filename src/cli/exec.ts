/**
 * z10 exec — Statement-level JavaScript execution
 *
 * Reads JavaScript from stdin, sends to the server for per-statement
 * execution with streaming results. Each statement is executed in order,
 * with const/let rewritten to var so variables persist across statements.
 *
 * Online flow:
 * 1. Read stdin completely
 * 2. POST script to server
 * 3. Server parses into statements, executes each, streams NDJSON results
 * 4. CLI prints ✓ or ✗ per statement as results stream back
 *
 * Offline flow:
 * 1. Read stdin, parse into statements
 * 2. Execute each locally in happy-dom with var rewriting
 * 3. Print ✓ or ✗ per statement
 */

import * as acorn from 'acorn';
import { Window } from 'happy-dom';
import { createContext, runInContext, type Context } from 'node:vm';
import { loadSession, resolvePageId, extractFlag } from './session.js';
import { computeChecksum } from './checksum.js';
import { execScriptStream } from './api.js';

export interface ExecOptions {
  /** Skip server sync (local-only mode) */
  offline?: boolean;
  /** Server URL override */
  serverUrl?: string;
  /** Project ID override */
  projectId?: string;
  /** Initial HTML to seed the DOM */
  initialHtml?: string;
  /** Scope document queries to this page root node ID */
  pageRootId?: string;
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
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Parse error: ${msg}`);
  }

  return statements;
}

/**
 * Rewrite top-level const/let declarations to var so that variables
 * persist across separate runInContext calls on the same context.
 */
export function rewriteDeclarations(statement: string): string {
  try {
    const ast = acorn.parse(statement, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    });

    let result = statement;
    let offset = 0;

    for (const node of (ast as acorn.Program).body) {
      if (node.type === 'VariableDeclaration' && node.kind !== 'var') {
        const keywordLen = node.kind.length; // 'const' = 5, 'let' = 3
        const start = node.start + offset;
        result = result.slice(0, start) + 'var' + result.slice(start + keywordLen);
        offset += 3 - keywordLen;
      }
    }

    return result;
  } catch {
    return statement;
  }
}

/**
 * Create a happy-dom execution environment with a z10 global.
 *
 * When `pageRootId` is provided, the `document` exposed to scripts is scoped
 * to the page's root element so queries like `getElementById` only find
 * elements within the current page.
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
 * Run exec locally (offline mode).
 *
 * Parses source into statements, executes each with const/let → var
 * rewriting so variables persist across statements.
 */
export function runExecOffline(source: string, options: ExecOptions = {}): {
  results: StatementResult[];
  finalHtml: string;
  success: boolean;
} {
  const statements = parseStatements(source);
  const results: StatementResult[] = [];

  const { context, getHtml } = createExecEnvironment(options.initialHtml, options.pageRootId);

  for (const stmt of statements) {
    const rewritten = rewriteDeclarations(stmt);
    const localExec = executeStatement(rewritten, context);
    const html = getHtml();
    const localChecksum = computeChecksum(html);

    if (!localExec.success) {
      const result: StatementResult = {
        statement: summarizeStatement(stmt),
        success: false,
        error: localExec.error,
        checksum: localChecksum,
      };
      results.push(result);
      console.log(`✗ ${result.statement}`);
      console.error(`  ERROR: ${localExec.error}`);
      return { results, finalHtml: html, success: false };
    }

    const result: StatementResult = {
      statement: summarizeStatement(stmt),
      success: true,
      checksum: localChecksum,
    };
    results.push(result);
    console.log(`✓ ${result.statement}`);
  }

  return { results, finalHtml: getHtml(), success: true };
}

/**
 * CLI entry point for `z10 exec [--project <id>] [--page <id>] [--offline]`.
 * Reads JavaScript from stdin and executes it.
 *
 * Online: sends script to server, reads streaming per-statement results.
 * Offline: executes locally with happy-dom.
 */
export async function cmdExec(args: string[]): Promise<void> {
  const session = await loadSession();
  const offline = args.includes('--offline');

  // Resolve project/page from flags or session
  const projectIdFromFlag = extractFlag(args, '--project');
  const projectId = projectIdFromFlag ?? session.currentProjectId;
  const pageId = resolvePageId(args, session);

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

  const online = !offline && !!projectId;

  if (online) {
    // Stream to server — server parses, executes per-statement, streams results
    try {
      let totalStatements = 0;
      let allSuccess = true;
      let finalChecksum = '';

      for await (const event of execScriptStream(
        projectId!,
        source,
        pageId,
      )) {
        if (event.type === 'result') {
          totalStatements++;
          if (event.success) {
            console.log(`✓ ${event.statement}`);
          } else {
            console.log(`✗ ${event.statement}`);
            console.error(`  ERROR: ${event.error}`);
            allSuccess = false;
          }
          finalChecksum = event.checksum;
        } else if (event.type === 'done') {
          finalChecksum = event.checksum;
          allSuccess = event.success ?? false;
        } else if (event.type === 'error') {
          console.error(`Server error: ${event.error}`);
          allSuccess = false;
        }
      }

      // Update local cache with server's final state
      if (allSuccess && finalChecksum) {
        const { saveDomCache, updateSession } = await import('./session.js');
        const { fetchDom } = await import('./api.js');
        try {
          const dom = await fetchDom(projectId!);
          await saveDomCache(dom.html);
          await updateSession({ domChecksum: dom.checksum });
        } catch {
          // Cache refresh failed, not critical
        }
      }

      console.log(`\n${totalStatements} statement${totalStatements === 1 ? '' : 's'}, ${allSuccess ? 'all passed' : 'failed'}`);
      if (!allSuccess) process.exit(1);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Server unavailable (${msg}), falling back to offline mode`);
    }
  }

  // Offline: execute locally
  let initialHtml: string | undefined;
  try {
    const { loadDomCache } = await import('./session.js');
    const cached = await loadDomCache();
    if (cached) initialHtml = cached;
  } catch {
    // No cached DOM, start fresh
  }

  const { results, finalHtml, success } = runExecOffline(source, {
    offline: true,
    initialHtml,
    pageRootId: pageId,
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
