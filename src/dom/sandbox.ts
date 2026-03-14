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

  // Scoped document proxy — only exposes safe DOM methods bound to the clone
  const scopedDocument = {
    querySelector: (selector: string) => clonedRoot.querySelector(selector),
    querySelectorAll: (selector: string) => clonedRoot.querySelectorAll(selector),
    getElementById: (id: string) =>
      clonedRoot.querySelector(`#${cssEscape(id)}`) ??
      clonedRoot.querySelector(`[data-z10-id="${cssEscape(id)}"]`),
    createElement: (tag: string) => ownerDoc.createElement(tag),
    createTextNode: (text: string) => ownerDoc.createTextNode(text),
    createDocumentFragment: () => ownerDoc.createDocumentFragment(),
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
  const freezeScript = `
    (function() {
      var freeze = Object.freeze;
      var getOwnPropertyNames = Object.getOwnPropertyNames;
      var getPrototypeOf = Object.getPrototypeOf;

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
        try { freeze(targets[i]); } catch(e) {}
      }

      // Freeze Object itself and other constructors
      var constructors = [Object, Array, String, Number, Boolean, Function, RegExp, Date, Error];
      if (typeof Map !== 'undefined') constructors.push(Map);
      if (typeof Set !== 'undefined') constructors.push(Set);

      for (var i = 0; i < constructors.length; i++) {
        try { freeze(constructors[i]); } catch(e) {}
      }
    })();
  `;

  try {
    runInContext(freezeScript, context, {
      timeout: 1000,
      filename: 'sandbox-init.js',
    });
  } catch {
    // If freezing fails, context is still usable but less hardened
  }
}

/** Minimal CSS.escape polyfill for Node.js environments. */
function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}
