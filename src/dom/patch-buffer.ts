/**
 * A16. Patch ring buffer.
 * Ordered log of committed patches keyed by txId.
 * Configurable capacity (default 1000).
 * Lookup by range: getPatches(afterTxId) → array.
 * §5.1, §7.4
 */

import type { PatchEnvelope } from './patch-serialize.js';

const DEFAULT_CAPACITY = 1000;

export class PatchRingBuffer {
  private buffer: PatchEnvelope[];
  private capacity: number;
  private head = 0; // next write position
  private count = 0; // number of patches stored

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (capacity < 1) throw new Error('Ring buffer capacity must be >= 1');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /** Add a patch to the buffer. Overwrites oldest if full. */
  push(patch: PatchEnvelope): void {
    this.buffer[this.head] = patch;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get all patches with txId > afterTxId, in order.
   * Returns null if the requested range is no longer in the buffer (gap too large).
   */
  getPatches(afterTxId: number): PatchEnvelope[] | null {
    if (this.count === 0) return [];

    // Collect all patches in order
    const ordered = this.getAllOrdered();

    // Check if the requested txId is still in the buffer
    if (afterTxId > 0 && ordered.length > 0 && ordered[0].txId > afterTxId) {
      // The oldest patch in buffer is newer than what was requested — gap
      return null;
    }

    // Filter to patches after the requested txId
    return ordered.filter((p) => p.txId > afterTxId);
  }

  /** Get all patches in order (oldest first). */
  private getAllOrdered(): PatchEnvelope[] {
    if (this.count === 0) return [];

    const result: PatchEnvelope[] = [];
    // Start from oldest entry
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  /** The latest txId in the buffer, or 0 if empty. */
  get latestTxId(): number {
    if (this.count === 0) return 0;
    const lastIdx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIdx].txId;
  }

  /** Number of patches currently stored. */
  get size(): number {
    return this.count;
  }
}
