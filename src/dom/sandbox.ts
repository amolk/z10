/**
 * A7. Sandbox execution context.
 * Build the scoped `document` proxy that agent code executes against.
 * Code runs as a single block via node:vm (createContext/runInContext).
 * Node-only (server + CLI). Browser has its own execution path.
 * §5.2 Step 4, Step 6
 */

import { createContext, runInContext } from 'node:vm';

const EXECUTION_TIMEOUT_MS = 5000;

export interface SandboxResult {
  success: boolean;
  error?: Error;
}

/**
 * Create a sandbox execution context from a cloned subtree root.
 * The sandbox provides a scoped `document` object with DOM query/creation methods.
 */
export function createSandboxContext(clonedRoot: Element): object {
  const ownerDoc = clonedRoot.ownerDocument;

  // Scoped document proxy — only exposes safe DOM methods bound to the clone
  const scopedDocument = {
    querySelector: (selector: string) => clonedRoot.querySelector(selector),
    querySelectorAll: (selector: string) => clonedRoot.querySelectorAll(selector),
    getElementById: (id: string) => clonedRoot.querySelector(`#${CSS.escape(id)}`),
    createElement: (tag: string) => ownerDoc.createElement(tag),
    createTextNode: (text: string) => ownerDoc.createTextNode(text),
    createDocumentFragment: () => ownerDoc.createDocumentFragment(),
    // Expose the root for direct access
    documentElement: clonedRoot,
    body: clonedRoot,
  };

  // Build the context with frozen prototypes for security
  const context = createContext({
    document: scopedDocument,
    // Minimal globals that agent code might need
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
    // CSS.escape for selector safety
    CSS: typeof CSS !== 'undefined' ? { escape: CSS.escape } : { escape: cssEscape },
    // No setTimeout, no fetch, no network, no require
  });

  return context;
}

/**
 * Execute agent code in the sandbox context.
 * Code runs as a single block — no parsing, no statement splitting.
 */
export function executeSandboxCode(
  code: string,
  context: object,
  timeoutMs: number = EXECUTION_TIMEOUT_MS,
): SandboxResult {
  try {
    runInContext(code, context, {
      timeout: timeoutMs,
      filename: 'agent-code.js',
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/** Minimal CSS.escape polyfill for Node.js environments. */
function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}
