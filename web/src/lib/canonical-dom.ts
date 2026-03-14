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
// Import from source when available (dev/test), from built package in production
import {
  LamportClock,
  TransactionEngine,
  bootstrapDocument,
  type TransactionResult,
  type TimestampManifest,
  type PatchEnvelope,
} from "../../../src/dom/index.js";
import { patchBroadcast } from "./patch-broadcast.js";

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
}

export interface CanonicalDOMOptions {
  /** TTL in ms before an idle DOM is evicted. Default: 30 minutes. */
  ttlMs?: number;
  /** Cleanup interval in ms. Default: 5 minutes. */
  cleanupIntervalMs?: number;
  /** Ring buffer capacity per project. Default: 1000 patches. */
  ringBufferCapacity?: number;
  /** Persist callback: called when canonical DOM should be saved to DB. */
  onPersist?: (projectId: string, html: string, txId: number) => Promise<void>;
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
  loadContent: () => Promise<string | null>,
): Promise<CanonicalDOM> {
  const existing = instances.get(projectId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }

  // Load content from DB
  const html = await loadContent();
  return loadCanonicalDOM(projectId, html ?? "");
}

/**
 * Load HTML into a canonical DOM instance.
 * Bootstraps timestamps if the document lacks them.
 */
export function loadCanonicalDOM(
  projectId: string,
  html: string,
): CanonicalDOM {
  const window = new Window({ url: "https://z10.dev" });
  const document = window.document;

  if (html) {
    document.body.innerHTML = html;
  }

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
  const result = await canonical.engine.execute(code, subtreeRootNid, manifest);

  if (result.status === "committed") {
    canonical.currentTxId = result.txId;
    canonical.dirty = true;
    canonical.commitsSincePersist++;

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
 */
export function getCanonicalHTML(projectId: string): string | null {
  const canonical = instances.get(projectId);
  if (!canonical) return null;
  canonical.lastAccess = Date.now();
  return canonical.rootElement.innerHTML;
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
export async function persistCanonicalDOM(projectId: string): Promise<void> {
  const canonical = instances.get(projectId);
  if (!canonical || !canonical.dirty || !managerOptions.onPersist) return;

  const html = canonical.rootElement.innerHTML;
  await managerOptions.onPersist(projectId, html, canonical.currentTxId);
  canonical.dirty = false;
  canonical.commitsSincePersist = 0;
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
 * Check if a canonical DOM exists for a project.
 */
export function hasCanonicalDOM(projectId: string): boolean {
  return instances.has(projectId);
}

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
function evictStale(): void {
  const ttl = managerOptions.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  for (const [projectId, canonical] of instances) {
    if (now - canonical.lastAccess > ttl) {
      // Persist dirty state before eviction
      if (canonical.dirty && managerOptions.onPersist) {
        persistCanonicalDOM(projectId).catch(() => {
          // Best effort — log in production
        });
      }
      canonical.window.close();
      instances.delete(projectId);
    }
  }
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
