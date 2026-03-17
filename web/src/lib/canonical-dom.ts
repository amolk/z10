/**
 * C1. Server Canonical DOM — one happy-dom instance per active project.
 *
 * On project open, loads content from DB into a happy-dom instance.
 * Runs bootstrapDocument() if the document lacks data-z10-id/data-z10-ts-*.
 * Manages lifecycle: load, access, persist, evict.
 *
 * This is the authoritative DOM state for the collaborative engine.
 * All transactions (C2) run against this canonical DOM.
 * Patches are broadcast (C3) from mutations to this DOM.
 *
 * §5.1 — Server holds one happy-dom instance per active project.
 */

import { Window } from "happy-dom";
import {
  LamportClock,
  TransactionEngine,
  bootstrapDocument,
  type TransactionResult,
  type TimestampManifest,
  type PatchEnvelope,
} from "z10/dom";
import { patchBroadcast } from "./patch-broadcast";

// ── Types ──

export interface CanonicalDOM {
  /** The project ID this DOM belongs to. */
  projectId: string;
  /** The happy-dom Window instance. */
  window: InstanceType<typeof Window>;
  /** The root element (document.body or its first child). */
  rootElement: Element;
  /** Lamport clock for this project's transactions. */
  clock: LamportClock;
  /** Transaction engine for executing code against this DOM. */
  engine: TransactionEngine;
  /** Current transaction ID (monotonically increasing). */
  currentTxId: number;
  /** Timestamp of last access (for TTL eviction). */
  lastAccess: number;
  /** Whether the DOM has unsaved changes since last persist. */
  dirty: boolean;
  /** Number of commits since last persist. */
  commitsSincePersist: number;
  /** Original <head> content preserved across persist cycles. */
  headHTML: string;
  /** data-z10-project attribute from the original <html> element, if any. */
  projectAttr: string;
}

export interface CanonicalDOMOptions {
  /** TTL in ms before an idle DOM is evicted. Default: 30 minutes. */
  ttlMs?: number;
  /** Cleanup interval in ms. Default: 5 minutes. */
  cleanupIntervalMs?: number;
  /** Ring buffer capacity per project. Default: 1000 patches. */
  ringBufferCapacity?: number;
  /** Persist callback: called when canonical DOM should be saved to DB (full HTML + txId). */
  onPersist?: (projectId: string, html: string, txId: number) => Promise<void>;
  /** Lightweight persist callback: updates only the txId in DB (no full HTML write). */
  onPersistTxId?: (projectId: string, txId: number) => Promise<void>;
  /** Number of commits before auto-persist. Default: 10. */
  persistEveryNCommits?: number;
  /** Interval in ms for periodic persistence of all dirty instances. Default: 60s. 0 to disable. */
  persistIntervalMs?: number;
}

// ── Singleton Manager ──

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_CLEANUP_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RING_CAPACITY = 1000;
const DEFAULT_PERSIST_EVERY = 10;
const DEFAULT_PERSIST_INTERVAL_MS = 60 * 1000; // 60 seconds

/** Map of projectId → CanonicalDOM */
const instances = new Map<string, CanonicalDOM>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let persistTimer: ReturnType<typeof setInterval> | null = null;
let managerOptions: CanonicalDOMOptions = {};

/**
 * Configure the canonical DOM manager.
 * Call once at server startup.
 */
export function configureCanonicalDOM(options: CanonicalDOMOptions): void {
  managerOptions = options;

  // Start cleanup timer (TTL eviction)
  if (cleanupTimer) clearInterval(cleanupTimer);
  const cleanupInterval = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_MS;
  cleanupTimer = setInterval(() => evictStale(), cleanupInterval);

  // C6: Start periodic persist timer
  if (persistTimer) clearInterval(persistTimer);
  const persistInterval = options.persistIntervalMs ?? DEFAULT_PERSIST_INTERVAL_MS;
  if (persistInterval > 0 && options.onPersist) {
    persistTimer = setInterval(() => persistAllDirty(), persistInterval);
  }
}

/**
 * Get or create the canonical DOM for a project.
 * Loads from DB on first access, subsequent calls return cached instance.
 */
export async function getCanonicalDOM(
  projectId: string,
  loadContent: () => Promise<string | { html: string; lastTxId: number } | null>,
): Promise<CanonicalDOM> {
  const existing = instances.get(projectId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }

  // Load content from DB
  const loaded = await loadContent();
  if (loaded === null || loaded === undefined) {
    return loadCanonicalDOM(projectId, "", 0);
  }
  if (typeof loaded === "string") {
    return loadCanonicalDOM(projectId, loaded, 0);
  }
  return loadCanonicalDOM(projectId, loaded.html, loaded.lastTxId);
}

/**
 * Load HTML into a canonical DOM instance.
 * Bootstraps timestamps if the document lacks them.
 */
export function loadCanonicalDOM(
  projectId: string,
  html: string,
  dbTxId: number = 0,
): CanonicalDOM {
  const window = new Window({ url: "https://z10.dev" });
  const document = window.document;

  // Extract and preserve <head> content and project attr before loading body.
  // Content may be a full <html> document or just body innerHTML.
  let headHTML = "";
  let projectAttr = "";
  let bodyHTML = html;

  if (html) {
    // Extract data-z10-project from <html> element
    const projectMatch = html.match(/<html\s+[^>]*data-z10-project="([^"]*)"/);
    if (projectMatch) projectAttr = projectMatch[1];

    // Extract <head>...</head> content
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) headHTML = headMatch[1].trim();

    // Extract body content — either from <body> tag or use as-is
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bodyHTML = bodyMatch[1];
    } else if (html.includes("<html")) {
      // Full document but no body tag — shouldn't happen, but handle gracefully
      bodyHTML = html;
    }
    // else: html is already just body innerHTML

    document.body.innerHTML = bodyHTML;
  }

  console.log(`[canonical-dom] load project=${projectId} headLen=${headHTML.length} bodyLen=${bodyHTML.length} hasPages=${bodyHTML.includes("data-z10-page")} hasProjectAttr=${!!projectAttr}`);

  const rootElement = document.body as unknown as Element;
  const clock = new LamportClock();

  // Bootstrap if the document lacks z10 metadata (first-time migration)
  const firstChild = rootElement.firstElementChild;
  const needsBootstrap =
    firstChild && !firstChild.getAttribute("data-z10-id");

  if (needsBootstrap) {
    bootstrapDocument(rootElement, clock);
  } else {
    // Scan for max timestamp to initialize clock
    const maxTs = scanMaxTimestamp(rootElement);
    if (maxTs > 0) {
      clock.receive(maxTs);
    }
    // Ensure clock is at least as high as the persisted txId from DB
    if (dbTxId > 0) {
      clock.receive(dbTxId);
    }

    // Ensure the root element (body) always has a data-z10-id.
    // When loading from DB, innerHTML sets children (which have IDs) but the
    // body itself loses its ID. Without it, serializeMutationsToOps skips
    // body-level childList mutations, causing patches to miss top-level
    // add/remove ops. The browser then either goes stale or goes blank.
    if (!rootElement.getAttribute("data-z10-id")) {
      // Find max existing ID counter to avoid collisions
      let maxCounter = 0;
      const allElements = rootElement.querySelectorAll("[data-z10-id]");
      for (let i = 0; i < allElements.length; i++) {
        const nid = (allElements[i] as Element).getAttribute("data-z10-id");
        if (nid && nid.startsWith("n")) {
          const num = parseInt(nid.slice(1), 10);
          if (!isNaN(num) && num > maxCounter) maxCounter = num;
        }
      }
      rootElement.setAttribute("data-z10-id", `n${maxCounter + 1}`);
      // Set timestamps so the body participates in conflict detection
      const ts = clock.value;
      rootElement.setAttribute("data-z10-ts-node", String(ts));
      rootElement.setAttribute("data-z10-ts-children", String(ts));
      rootElement.setAttribute("data-z10-ts-text", String(ts));
      rootElement.setAttribute("data-z10-ts-tree", String(ts));
    }
  }

  const capacity =
    managerOptions.ringBufferCapacity ?? DEFAULT_RING_CAPACITY;
  const engine = new TransactionEngine(rootElement, clock, {
    ringBufferCapacity: capacity,
  });

  const canonical: CanonicalDOM = {
    projectId,
    window,
    rootElement,
    clock,
    engine,
    currentTxId: clock.value,
    lastAccess: Date.now(),
    dirty: needsBootstrap ?? false,
    commitsSincePersist: 0,
    headHTML,
    projectAttr,
  };

  instances.set(projectId, canonical);
  return canonical;
}

/**
 * Execute a transaction against the canonical DOM.
 * Returns the transaction result and optionally auto-persists.
 */
export async function executeTransaction(
  projectId: string,
  code: string,
  subtreeRootNid: string | null,
  manifest: TimestampManifest,
): Promise<TransactionResult> {
  const canonical = instances.get(projectId);
  if (!canonical) {
    throw new Error(`No canonical DOM for project ${projectId}. Call getCanonicalDOM first.`);
  }

  canonical.lastAccess = Date.now();
  const hadPages = canonical.rootElement.innerHTML.includes("data-z10-page");
  const result = await canonical.engine.execute(code, subtreeRootNid, manifest);

  if (result.status === "committed") {
    canonical.currentTxId = result.txId;
    canonical.dirty = true;
    canonical.commitsSincePersist++;

    // Detect if transaction removed page structure
    const hasPages = canonical.rootElement.innerHTML.includes("data-z10-page");
    if (hadPages && !hasPages) {
      console.error(`[canonical-dom] CRITICAL: Transaction txId=${result.txId} removed all data-z10-page elements for project=${projectId}. Code: ${code.slice(0, 300)}`);
    }
    console.log(`[canonical-dom] committed txId=${result.txId} project=${projectId} ops=${result.patch.ops.length} hasPages=${hasPages}`);

    // C3: Broadcast patch to all connected clients
    patchBroadcast.emit(projectId, result.patch);

    // Auto-persist after N commits
    const threshold =
      managerOptions.persistEveryNCommits ?? DEFAULT_PERSIST_EVERY;
    if (
      canonical.commitsSincePersist >= threshold &&
      managerOptions.onPersist
    ) {
      await persistCanonicalDOM(projectId);
    }
  }

  return result;
}

/**
 * Get the serialized HTML of the canonical DOM.
 * Reconstructs the full <html> document including preserved <head> content.
 */
export function getCanonicalHTML(projectId: string): string | null {
  const canonical = instances.get(projectId);
  if (!canonical) return null;
  canonical.lastAccess = Date.now();

  const bodyHTML = canonical.rootElement.innerHTML;

  // If we have head content, reconstruct the full document
  if (canonical.headHTML || canonical.projectAttr) {
    const projectAttrStr = canonical.projectAttr
      ? ` data-z10-project="${canonical.projectAttr}"`
      : "";
    const headStr = canonical.headHTML ? `<head>\n${canonical.headHTML}\n</head>\n` : "";
    return `<html${projectAttrStr}>\n${headStr}<body>\n${bodyHTML}\n</body>\n</html>`;
  }

  // Legacy: content without head/html wrapper — return body innerHTML as-is
  return bodyHTML;
}

/**
 * Get the current transaction ID for a project.
 */
export function getCurrentTxId(projectId: string): number | null {
  const canonical = instances.get(projectId);
  if (!canonical) return null;
  return canonical.currentTxId;
}

/**
 * Get patches from the ring buffer after a given txId.
 */
export function getPatches(
  projectId: string,
  afterTxId: number,
): PatchEnvelope[] | null {
  const canonical = instances.get(projectId);
  if (!canonical) return null;
  return canonical.engine.ringBuffer.getPatches(afterTxId);
}

/**
 * Persist canonical DOM to DB via the configured callback.
 */
export async function persistCanonicalDOM(projectId: string, force = false): Promise<void> {
  const canonical = instances.get(projectId);
  if (!canonical || !managerOptions.onPersist) return;
  if (!force && !canonical.dirty) return;

  const html = getCanonicalHTML(projectId) ?? canonical.rootElement.innerHTML;
  const hasPages = html.includes("data-z10-page");
  const hasHead = html.includes("<head>");

  console.log(`[canonical-dom] persist project=${projectId} txId=${canonical.currentTxId} htmlLen=${html.length} hasPages=${hasPages} hasHead=${hasHead}`);

  if (!hasPages) {
    console.warn(`[canonical-dom] WARNING: persisting content WITHOUT data-z10-page for project=${projectId}. Body preview: ${canonical.rootElement.innerHTML.slice(0, 200)}`);
  }

  await managerOptions.onPersist(projectId, html, canonical.currentTxId);
  canonical.dirty = false;
  canonical.commitsSincePersist = 0;
}

/**
 * Lightweight txId-only persist — updates the durable clock in DB without
 * writing the full HTML. Falls back to full persist if onPersistTxId is not configured.
 */
export async function persistTxId(projectId: string): Promise<void> {
  const canonical = instances.get(projectId);
  if (!canonical) return;

  if (managerOptions.onPersistTxId) {
    await managerOptions.onPersistTxId(projectId, canonical.currentTxId);
  } else if (managerOptions.onPersist) {
    // Fallback: full persist if lightweight callback not configured
    await persistCanonicalDOM(projectId, true);
  }
}

/**
 * Evict a specific project's canonical DOM (e.g., on project close).
 * Persists before evicting if dirty.
 */
export async function evictCanonicalDOM(projectId: string): Promise<void> {
  const canonical = instances.get(projectId);
  if (!canonical) return;

  if (canonical.dirty && managerOptions.onPersist) {
    await persistCanonicalDOM(projectId);
  }

  canonical.window.close();
  instances.delete(projectId);
}

/**
 * Get the raw canonical DOM instance (if loaded).
 * Used by component routes to update headHTML without evicting.
 */
export function getCanonicalDOMInstance(projectId: string): CanonicalDOM | undefined {
  return instances.get(projectId);
}

/**
 * Check if a canonical DOM exists for a project.
 */
export function hasCanonicalDOM(projectId: string): boolean {
  return instances.has(projectId);
}

// safeContentWrite removed — all writes now go through transact/canonical DOM.
// The PUT auto-save path has been eliminated.

/**
 * Get the number of active canonical DOM instances.
 */
export function activeInstanceCount(): number {
  return instances.size;
}

// ── Internal helpers ──

/**
 * C6: Persist all dirty instances without evicting them.
 * Called periodically by the persist timer.
 */
export async function persistAllDirty(): Promise<void> {
  if (!managerOptions.onPersist) return;
  const promises: Promise<void>[] = [];
  for (const projectId of instances.keys()) {
    const canonical = instances.get(projectId);
    if (canonical?.dirty) {
      promises.push(persistCanonicalDOM(projectId));
    }
  }
  await Promise.allSettled(promises);
}

/** Evict stale instances that haven't been accessed within TTL. */
async function evictStale(): Promise<void> {
  const ttl = managerOptions.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  const evictions: Promise<void>[] = [];
  for (const [projectId, canonical] of instances) {
    if (now - canonical.lastAccess > ttl) {
      evictions.push(
        (async () => {
          // Await persist before evicting — fire-and-forget risks data loss
          if (canonical.dirty && managerOptions.onPersist) {
            try {
              await persistCanonicalDOM(projectId);
            } catch (err) {
              console.error(`[canonical-dom] eviction persist failed for project=${projectId}:`, err);
            }
          }
          canonical.window.close();
          instances.delete(projectId);
        })(),
      );
    }
  }
  await Promise.allSettled(evictions);
}

/** Scan a DOM subtree for the maximum timestamp value. */
function scanMaxTimestamp(root: Element): number {
  let max = 0;
  const walker = (el: Element) => {
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      if (attrs[i].name.startsWith("data-z10-ts-")) {
        const val = parseInt(attrs[i].value, 10);
        if (!isNaN(val) && val > max) max = val;
      }
    }
    for (let i = 0; i < el.children.length; i++) {
      walker(el.children[i] as Element);
    }
  };
  walker(root);
  return max;
}

/**
 * Shutdown: persist all dirty instances and clear timers.
 * Call on server shutdown for clean exit.
 */
export async function shutdownCanonicalDOM(): Promise<void> {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }

  // Persist all dirty instances
  const promises: Promise<void>[] = [];
  for (const projectId of instances.keys()) {
    promises.push(evictCanonicalDOM(projectId));
  }
  await Promise.allSettled(promises);
}
