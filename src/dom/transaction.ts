/**
 * A9. Transaction engine + A10. Commit procedure.
 * Orchestrates the full lifecycle:
 *   acquire subtree lock → fast pre-check ts-tree → clone subtree →
 *   attach MutationObserver → prepare sandbox context (A7) →
 *   execute code → disconnect observer → check illegal mods (A8) →
 *   build write set (A5) → validate (A6) → commit or reject.
 *
 * Commit (A10): increment clock, attach live DOM observer, apply changes
 * from sandbox to live DOM, bump timestamps, bubble ts-tree,
 * disconnect observer, serialize patch, store in ring buffer.
 *
 * §5.1–5.6
 */

import { LamportClock } from './clock.js';
import { SubtreeLockManager } from './locks.js';
import { createSandboxContext, executeSandboxCode } from './sandbox.js';
import { checkIllegalModifications } from './checks.js';
import { buildWriteSet } from './write-set.js';
import { validate, preCheckTreeTimestamp, buildManifest, type TimestampManifest, type Conflict } from './validator.js';
import { bumpTimestamps, bubbleTimestamp, getTimestamp, type WriteSetEntry } from './timestamps.js';
import { reconcileChildren } from './reconcile.js';
import { createIdGenerator } from './node-ids.js';
import { serializeMutationsToOps, createPatchEnvelope, type PatchEnvelope, type PatchOp } from './patch-serialize.js';
import { PatchRingBuffer } from './patch-buffer.js';

// ── Result types ──

export interface TransactionCommitted {
  status: 'committed';
  txId: number;
  timestamp: number;
  patch: PatchEnvelope;
}

export interface TransactionRejected {
  status: 'rejected';
  reason: 'illegal-modification' | 'conflict' | 'execution-error' | 'lock-timeout';
  conflicts?: Conflict[];
  error?: Error;
}

export type TransactionResult = TransactionCommitted | TransactionRejected;

// ── Transaction Engine ──

export interface TransactionEngineOptions {
  ringBufferCapacity?: number;
  lockTimeoutMs?: number;
  executionTimeoutMs?: number;
  idPrefix?: string;
}

export class TransactionEngine {
  readonly clock: LamportClock;
  readonly lockManager: SubtreeLockManager;
  readonly ringBuffer: PatchRingBuffer;
  private rootElement: Element;
  private idCounter: number;
  private idPrefix: string;
  private executionTimeoutMs: number;

  constructor(
    rootElement: Element,
    clock: LamportClock,
    options: TransactionEngineOptions = {},
  ) {
    const {
      ringBufferCapacity = 1000,
      lockTimeoutMs = 5000,
      executionTimeoutMs = 5000,
      idPrefix = 'n',
    } = options;

    this.rootElement = rootElement;
    this.clock = clock;
    this.idPrefix = idPrefix;
    this.idCounter = this.findMaxIdCounter(rootElement, idPrefix) + 1;
    this.executionTimeoutMs = executionTimeoutMs;
    this.lockManager = new SubtreeLockManager(rootElement, lockTimeoutMs);
    this.ringBuffer = new PatchRingBuffer(ringBufferCapacity);
  }

  /**
   * Execute a transaction: run agent code against a subtree,
   * validate changes, and commit or reject.
   */
  async execute(
    code: string,
    subtreeRootNid: string | null,
    manifest: TimestampManifest,
  ): Promise<TransactionResult> {
    // Step 1: Acquire subtree lock
    let release: (() => void) | undefined;
    try {
      release = await this.lockManager.acquire(subtreeRootNid);
    } catch {
      return { status: 'rejected', reason: 'lock-timeout' };
    }

    try {
      return this.executeWithLock(code, subtreeRootNid, manifest);
    } finally {
      release();
    }
  }

  /** Find element by data-z10-id, including the root element itself. */
  private findByNid(nid: string): Element | null {
    if (this.rootElement.getAttribute('data-z10-id') === nid) return this.rootElement;
    return this.rootElement.querySelector(`[data-z10-id="${nid}"]`);
  }

  private executeWithLock(
    code: string,
    subtreeRootNid: string | null,
    manifest: TimestampManifest,
  ): TransactionResult {
    // Resolve the subtree root element
    const subtreeRoot = subtreeRootNid
      ? this.findByNid(subtreeRootNid)
      : this.rootElement;

    if (!subtreeRoot) {
      return {
        status: 'rejected',
        reason: 'execution-error',
        error: new Error(`Subtree root not found: ${subtreeRootNid}`),
      };
    }

    // Step 2: Fast pre-check using ts-tree
    if (subtreeRootNid) {
      const treeTs = manifest.nodes.get(subtreeRootNid)?.[
        'data-z10-ts-tree' as keyof typeof manifest.nodes extends string ? never : string
      ];
      // Pre-check is optimization only — skip if manifest doesn't have tree ts
    }

    // Step 3: Clone subtree for sandbox execution
    const sandboxClone = subtreeRoot.cloneNode(true) as Element;

    // Step 4-5: Attach MutationObserver to sandbox clone
    const sandboxRecords: MutationRecord[] = [];
    const ownerDoc = sandboxClone.ownerDocument;
    let observer: MutationObserver | undefined;

    if (typeof ownerDoc.defaultView?.MutationObserver !== 'undefined') {
      observer = new ownerDoc.defaultView.MutationObserver((records) => {
        sandboxRecords.push(...records);
      });
      observer.observe(sandboxClone, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        subtree: true,
      });
    }

    // Step 6: Execute code in sandbox
    const context = createSandboxContext(sandboxClone);
    const execResult = executeSandboxCode(code, context, this.executionTimeoutMs);

    // Disconnect observer and flush pending records
    if (observer) {
      sandboxRecords.push(...observer.takeRecords());
      observer.disconnect();
    }

    if (!execResult.success) {
      return {
        status: 'rejected',
        reason: 'execution-error',
        error: execResult.error,
      };
    }

    // Step 7: Check illegal modifications
    const illegalMods = checkIllegalModifications(sandboxRecords);
    if (illegalMods.length > 0) {
      return {
        status: 'rejected',
        reason: 'illegal-modification',
        error: new Error(
          `Illegal modification of system attributes: ${illegalMods.map((m) => m.attributeName).join(', ')}`,
        ),
      };
    }

    // Step 8: Build write set
    const writeSet = buildWriteSet(sandboxRecords);

    if (writeSet.length === 0) {
      // No changes — nothing to commit (not an error)
      return {
        status: 'committed',
        txId: this.clock.value,
        timestamp: this.clock.value,
        patch: createPatchEnvelope(this.clock.value, this.clock.value, []),
      };
    }

    // Step 9: Validate against live DOM
    const conflicts = validate(writeSet, manifest, this.rootElement);
    if (conflicts.length > 0) {
      return {
        status: 'rejected',
        reason: 'conflict',
        conflicts,
      };
    }

    // Step 10: Commit
    return this.commit(sandboxClone, subtreeRoot, writeSet);
  }

  /**
   * A10. Commit procedure.
   * Apply changes from sandbox to live DOM, bump timestamps, serialize patch.
   */
  private commit(
    sandboxRoot: Element,
    liveRoot: Element,
    writeSet: WriteSetEntry[],
  ): TransactionCommitted {
    // Increment clock
    const ts = this.clock.tick();
    const txId = ts;

    // Attach MutationObserver to live DOM to capture commit changes for patch
    const commitRecords: MutationRecord[] = [];
    const ownerDoc = liveRoot.ownerDocument;
    let commitObserver: MutationObserver | undefined;

    if (typeof ownerDoc.defaultView?.MutationObserver !== 'undefined') {
      commitObserver = new ownerDoc.defaultView.MutationObserver((records) => {
        commitRecords.push(...records);
      });
      commitObserver.observe(liveRoot, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        subtree: true,
      });
    }

    // Apply changes: attributes, text, children
    const idGenerator = this.createIdGenerator();
    this.applyChanges(sandboxRoot, liveRoot, ts, idGenerator);

    // Bump timestamps for write set entries
    bumpTimestamps(writeSet, ts, this.rootElement);

    // Bubble tree timestamp
    bubbleTimestamp(liveRoot, ts);

    // Disconnect commit observer and flush
    if (commitObserver) {
      commitRecords.push(...commitObserver.takeRecords());
      commitObserver.disconnect();
    }

    // Serialize patch from commit records
    const ops = serializeMutationsToOps(commitRecords);
    const patch = createPatchEnvelope(txId, ts, ops);

    // Store in ring buffer
    this.ringBuffer.push(patch);

    return { status: 'committed', txId, timestamp: ts, patch };
  }

  /**
   * Apply changes from sandbox DOM to live DOM.
   * Handles attributes, text content, and children reconciliation.
   */
  private applyChanges(
    sandboxRoot: Element,
    liveRoot: Element,
    ts: number,
    idGenerator: () => string,
  ): void {
    // Apply attribute changes
    this.syncAttributes(sandboxRoot, liveRoot);

    // Apply text content if it's a leaf node
    if (sandboxRoot.children.length === 0 && liveRoot.children.length === 0) {
      if (sandboxRoot.textContent !== liveRoot.textContent) {
        liveRoot.textContent = sandboxRoot.textContent;
      }
      return;
    }

    // Reconcile children
    reconcileChildren(sandboxRoot, liveRoot, ts, idGenerator);

    // Recursively apply changes to matched children
    for (let i = 0; i < liveRoot.children.length; i++) {
      const liveChild = liveRoot.children[i] as Element;
      const liveNid = liveChild.getAttribute('data-z10-id');
      if (!liveNid) continue;

      // Find matching sandbox child (direct children only to avoid cross-level matches)
      let sandboxChild: Element | null = null;
      for (let j = 0; j < sandboxRoot.children.length; j++) {
        const candidate = sandboxRoot.children[j] as Element;
        if (candidate.getAttribute('data-z10-id') === liveNid) {
          sandboxChild = candidate;
          break;
        }
      }
      if (sandboxChild) {
        this.applyChanges(sandboxChild, liveChild, ts, idGenerator);
      }
    }
  }

  /** Sync non-system attributes from sandbox element to live element. */
  private syncAttributes(sandbox: Element, live: Element): void {
    // Copy attributes from sandbox to live
    const sandboxAttrs = sandbox.attributes;
    for (let i = 0; i < sandboxAttrs.length; i++) {
      const name = sandboxAttrs[i].name;
      if (name.startsWith('data-z10-')) continue; // skip system attributes
      const sandboxVal = sandboxAttrs[i].value;
      if (live.getAttribute(name) !== sandboxVal) {
        live.setAttribute(name, sandboxVal);
      }
    }

    // Remove attributes that exist on live but not sandbox
    const liveAttrs = live.attributes;
    const toRemove: string[] = [];
    for (let i = 0; i < liveAttrs.length; i++) {
      const name = liveAttrs[i].name;
      if (name.startsWith('data-z10-')) continue; // keep system attributes
      if (!sandbox.hasAttribute(name)) {
        toRemove.push(name);
      }
    }
    for (const name of toRemove) {
      live.removeAttribute(name);
    }
  }

  /** Create an ID generator with the current counter state. */
  private createIdGenerator(): () => string {
    return () => `${this.idPrefix}${this.idCounter++}`;
  }

  /** Find the highest existing numeric ID counter in the DOM. */
  private findMaxIdCounter(root: Element, prefix: string): number {
    let max = 0;
    const elements = root.querySelectorAll('[data-z10-id]');
    for (let i = 0; i < elements.length; i++) {
      const nid = (elements[i] as Element).getAttribute('data-z10-id');
      if (nid && nid.startsWith(prefix)) {
        const num = parseInt(nid.slice(prefix.length), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    return max;
  }
}
