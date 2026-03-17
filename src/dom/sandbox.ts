/**
 * A7 + F1. Sandbox execution context with hardening.
 *
 * Build the scoped `document` proxy that agent code executes against.
 * Code runs as a single block via node:vm (createContext/runInContext).
 * Node-only (server + CLI). Browser has its own execution path.
 *
 * F1 Hardening (§12.1):
 * - No access to live document/window/globalThis from agent code
 * - Built-in prototypes frozen inside the VM context
 * - No network APIs (fetch, XMLHttpRequest, WebSocket)
 * - No timers (setTimeout, setInterval)
 * - No module loading (require, import)
 * - No process/child_process access
 * - CPU time limited via vm timeout (5s default)
 *
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
 * All built-in prototypes are frozen to prevent prototype pollution.
 */
export function createSandboxContext(clonedRoot: Element): object {
  const ownerDoc = clonedRoot.ownerDocument;

  // Helper: querySelector that also checks the root element itself
  // (native querySelector only searches descendants, not the root)
  const qsInclusive = (selector: string): Element | null => {
    try {
      if (clonedRoot.matches?.(selector)) return clonedRoot;
    } catch { /* invalid selector — let querySelector handle it */ }
    return clonedRoot.querySelector(selector);
  };

  // Scoped document proxy — only exposes safe DOM methods bound to the clone
  const scopedDocument = {
    querySelector: (selector: string) => qsInclusive(selector),
    querySelectorAll: (selector: string) => {
      const descendants = clonedRoot.querySelectorAll(selector);
      try {
        if (clonedRoot.matches?.(selector)) {
          const arr = [clonedRoot];
          for (let i = 0; i < descendants.length; i++) arr.push(descendants[i] as Element);
          return arr;
        }
      } catch { /* invalid selector */ }
      return descendants;
    },
    getElementById: (id: string) =>
      qsInclusive(`#${cssEscape(id)}`) ??
      qsInclusive(`[data-z10-id="${cssEscape(id)}"]`),
    createElement: (tag: string) => ownerDoc.createElement(tag),
    createTextNode: (text: string) => ownerDoc.createTextNode(text),
    createDocumentFragment: () => ownerDoc.createDocumentFragment(),
    // Expose customElements registry for Web Component support
    customElements: ownerDoc.defaultView?.customElements,
    // Expose the root for direct access
    documentElement: clonedRoot,
    body: clonedRoot,
  };

  // Build the VM context with only safe globals
  const context = createContext({
    document: scopedDocument,
    // Minimal console — no-ops to prevent leaking info
    console: Object.freeze({
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
      debug: () => {},
    }),
    // CSS.escape for selector safety
    CSS: Object.freeze(
      typeof CSS !== 'undefined' ? { escape: CSS.escape } : { escape: cssEscape },
    ),
    // Safe built-ins that agent code may need
    // Note: constructors like Object, Array, Error etc. are NOT passed here.
    // node:vm contexts get their own copies of these built-ins automatically.
    // Passing the host's constructors would cause freezeBuiltins() to freeze
    // the host process's prototypes, breaking Next.js and other libraries.
    // HTMLElement base class for custom element definitions (only from happy-dom, never host global)
    HTMLElement: ownerDoc.defaultView?.HTMLElement,
    JSON: Object.freeze({ parse: JSON.parse, stringify: JSON.stringify }),
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    // Explicitly undefined — block dangerous globals
    globalThis: undefined,
    window: undefined,
    self: undefined,
    global: undefined,
    process: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    fetch: undefined,
    XMLHttpRequest: undefined,
    WebSocket: undefined,
    EventSource: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    queueMicrotask: undefined,
    importScripts: undefined,
    Deno: undefined,
    Bun: undefined,
  });

  // Freeze built-in prototypes inside the context to prevent prototype pollution
  freezeBuiltins(context);

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

/**
 * Freeze built-in prototypes inside the VM context to prevent prototype pollution.
 * Runs a script inside the context that freezes Object.prototype, Array.prototype, etc.
 */
function freezeBuiltins(context: object): void {
  // Use a shared object to communicate failures back from the sandbox.
  // We can't use globalThis (it's undefined in the sandbox) so we inject
  // a mutable report object into the context before running the freeze script.
  const report = { failures: [] as string[] };
  (context as Record<string, unknown>).__freezeReport = report;

  const freezeScript = `
    (function() {
      var freeze = Object.freeze;
      var report = __freezeReport;

      // Freeze core prototypes
      var targets = [
        Object.prototype,
        Array.prototype,
        String.prototype,
        Number.prototype,
        Boolean.prototype,
        Function.prototype,
        RegExp.prototype,
        Date.prototype,
        Error.prototype,
        TypeError.prototype,
        RangeError.prototype,
      ];

      // Also freeze Map/Set if available
      if (typeof Map !== 'undefined') targets.push(Map.prototype);
      if (typeof Set !== 'undefined') targets.push(Set.prototype);

      for (var i = 0; i < targets.length; i++) {
        try { freeze(targets[i]); } catch(e) { report.failures.push('proto-' + i); }
      }

      // Freeze Object itself and other constructors
      var constructors = [Object, Array, String, Number, Boolean, Function, RegExp, Date, Error];
      if (typeof Map !== 'undefined') constructors.push(Map);
      if (typeof Set !== 'undefined') constructors.push(Set);

      for (var i = 0; i < constructors.length; i++) {
        try { freeze(constructors[i]); } catch(e) { report.failures.push('ctor-' + i); }
      }

      // Post-freeze verification of critical prototypes
      if (!Object.isFrozen(Object.prototype)) report.failures.push('verify-Object.prototype');
      if (!Object.isFrozen(Array.prototype)) report.failures.push('verify-Array.prototype');
      if (!Object.isFrozen(Function.prototype)) report.failures.push('verify-Function.prototype');

      // Clean up — don't leave report accessible to agent code
      delete __freezeReport;
    })();
  `;

  try {
    runInContext(freezeScript, context, {
      timeout: 1000,
      filename: 'sandbox-init.js',
    });
  } catch (err) {
    throw new Error(`Sandbox hardening failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    // Clean up from host side — must run even if freeze script throws
    delete (context as Record<string, unknown>).__freezeReport;
  }

  const failures = report.failures;
  if (failures.length > 0) {
    // Verification failures (verify-*) are critical — freeze didn't stick
    const verifyFailures = failures.filter(f => f.startsWith('verify-'));
    if (verifyFailures.length > 0) {
      throw new Error(`Sandbox hardening verification failed: ${verifyFailures.join(', ')}`);
    }
    // Individual target failures are warnings
    console.warn(`[z10] Sandbox freeze partial failures: ${failures.join(', ')}`);
  }
}

/**
 * Pre-register component custom elements in the sandbox.
 * Extracts <script type="module" data-z10-component="..."> from head HTML
 * and evaluates them in the sandbox context.
 */
export function registerComponentsInSandbox(
  context: object,
  headHtml: string,
): void {
  // Match script tags with both type="module" and data-z10-component in any attribute order
  const scriptRe = /<script\s+(?=[^>]*type="module")(?=[^>]*data-z10-component="[^"]*")[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(headHtml)) !== null) {
    const code = match[1]!;
    try {
      runInContext(code, context, {
        timeout: 2000,
        filename: 'component-registration.js',
      });
    } catch (err) {
      // Log warning but don't block other components from registering
      const nameMatch = match[0]?.match(/data-z10-component="([^"]*)"/);
      const compName = nameMatch?.[1] ?? 'unknown';
      console.warn(`[z10] Failed to register component "${compName}":`, err instanceof Error ? err.message : err);
    }
  }
}

/** Minimal CSS.escape polyfill for Node.js environments. */
function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}
