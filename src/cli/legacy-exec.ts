/**
 * Legacy statement-by-statement execution functions.
 *
 * @deprecated These functions exist only for MCP tool compatibility.
 * They will be deleted when E4 (MCP tool migration) is implemented.
 * The new exec flow uses single-block execution via the transaction engine.
 */

import * as acorn from 'acorn';
import { Window } from 'happy-dom';
import { createContext, runInContext, type Context } from 'node:vm';

/**
 * Parse JavaScript source into individual top-level statements.
 * Uses acorn to find statement boundaries.
 *
 * @deprecated Will be removed in E4.
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
 * @deprecated Will be removed in E4.
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
 * @deprecated Will be removed in E4.
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
 * @deprecated Will be removed in E4.
 */
export function summarizeStatement(statement: string): string {
  const oneLine = statement.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77) + '...';
}
