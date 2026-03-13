/**
 * A13. Subtree locking.
 * Per-subtree locks with overlap detection (is one root an ancestor of the other?).
 * Non-overlapping = parallel, overlapping = serialized queue.
 * 5s timeout → abort. Document-level lock for administrative ops.
 * §5.7, §14.7
 */

const DEFAULT_LOCK_TIMEOUT_MS = 5000;

interface PendingLock {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveLock {
  rootNid: string | null; // null = document-level lock
  release: () => void;
}

export class SubtreeLockManager {
  private activeLocks: Map<string, ActiveLock> = new Map(); // lockId → lock
  private pendingQueue: Map<string, PendingLock[]> = new Map(); // rootNid → pending
  private lockCounter = 0;
  private timeoutMs: number;
  private rootElement: Element;

  constructor(rootElement: Element, timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS) {
    this.rootElement = rootElement;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Acquire a lock on a subtree rooted at the given node ID.
   * Returns a release function. Throws on timeout.
   * Pass null for document-level lock.
   */
  async acquire(rootNid: string | null): Promise<() => void> {
    // Check for overlap with active locks
    if (!this.hasOverlap(rootNid)) {
      return this.grantLock(rootNid);
    }

    // Queue and wait
    return new Promise<() => void>((resolve, reject) => {
      const key = rootNid ?? '__doc__';
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const queue = this.pendingQueue.get(key);
        if (queue) {
          const idx = queue.findIndex((p) => p.resolve === resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this.pendingQueue.delete(key);
        }
        reject(new Error(`Lock timeout after ${this.timeoutMs}ms for subtree ${rootNid ?? 'document'}`));
      }, this.timeoutMs);

      const pending: PendingLock = { resolve: () => resolve(this.grantLock(rootNid)), reject, timer };

      if (!this.pendingQueue.has(key)) {
        this.pendingQueue.set(key, []);
      }
      this.pendingQueue.get(key)!.push(pending);
    });
  }

  /** Check if a requested lock overlaps with any active lock. */
  private hasOverlap(rootNid: string | null): boolean {
    for (const lock of this.activeLocks.values()) {
      if (this.locksOverlap(lock.rootNid, rootNid)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Two locks overlap if:
   * - Either is a document-level lock (null)
   * - One root is an ancestor of the other
   * - They are the same node
   */
  private locksOverlap(a: string | null, b: string | null): boolean {
    // Document-level locks overlap with everything
    if (a === null || b === null) return true;

    // Same node
    if (a === b) return true;

    // Check ancestor relationship
    const elA = this.rootElement.querySelector(`[data-z10-id="${a}"]`);
    const elB = this.rootElement.querySelector(`[data-z10-id="${b}"]`);
    if (!elA || !elB) return false;

    return elA.contains(elB) || elB.contains(elA);
  }

  /** Grant a lock and return its release function. */
  private grantLock(rootNid: string | null): () => void {
    const lockId = String(++this.lockCounter);
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      this.activeLocks.delete(lockId);
      this.processPendingQueue();
    };

    this.activeLocks.set(lockId, { rootNid, release });
    return release;
  }

  /** Process pending queue after a lock is released. */
  private processPendingQueue(): void {
    for (const [key, queue] of this.pendingQueue) {
      if (queue.length === 0) {
        this.pendingQueue.delete(key);
        continue;
      }

      const rootNid = key === '__doc__' ? null : key;
      if (!this.hasOverlap(rootNid)) {
        const pending = queue.shift()!;
        if (queue.length === 0) this.pendingQueue.delete(key);
        clearTimeout(pending.timer);
        pending.resolve();
      }
    }
  }

  /** Number of currently active locks. */
  get activeCount(): number {
    return this.activeLocks.size;
  }

  /** Number of pending lock requests. */
  get pendingCount(): number {
    let count = 0;
    for (const queue of this.pendingQueue.values()) {
      count += queue.length;
    }
    return count;
  }
}
