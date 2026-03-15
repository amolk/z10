/**
 * C3. Patch Broadcast — pub/sub for committed patch envelopes.
 *
 * On each commit, the canonical DOM manager calls `broadcastPatch`.
 * SSE subscribers (CLI) and WebSocket subscribers (WebUI) receive the
 * same PatchEnvelope. Replaces the old ProjectEventBus that sent full
 * serialized content.
 *
 * Same process — simple in-memory pub/sub (like the old ProjectEventBus).
 *
 * §7.1, §7.2
 */

import type { PatchEnvelope } from "@/lib/z10-dom";

export type PatchListener = (patch: PatchEnvelope) => void;
export type ResyncListener = (html: string, txId: number) => void;

class PatchBroadcast {
  private listeners = new Map<string, Set<PatchListener>>();
  private resyncListeners = new Map<string, Set<ResyncListener>>();

  /**
   * Subscribe to patch events for a specific project.
   * Returns an unsubscribe function.
   */
  subscribe(projectId: string, listener: PatchListener): () => void {
    if (!this.listeners.has(projectId)) {
      this.listeners.set(projectId, new Set());
    }
    this.listeners.get(projectId)!.add(listener);

    return () => {
      const set = this.listeners.get(projectId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(projectId);
      }
    };
  }

  /**
   * Subscribe to resync events (full content reload) for a project.
   * Returns an unsubscribe function.
   */
  subscribeResync(projectId: string, listener: ResyncListener): () => void {
    if (!this.resyncListeners.has(projectId)) {
      this.resyncListeners.set(projectId, new Set());
    }
    this.resyncListeners.get(projectId)!.add(listener);

    return () => {
      const set = this.resyncListeners.get(projectId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.resyncListeners.delete(projectId);
      }
    };
  }

  /**
   * Broadcast a committed patch to all subscribers for a project.
   */
  emit(projectId: string, patch: PatchEnvelope): void {
    const set = this.listeners.get(projectId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(patch);
      } catch {
        // Don't let one bad listener break others
      }
    }
  }

  /**
   * Broadcast a full resync (e.g. after component creation/deletion
   * that modifies the head, which isn't covered by patch ops).
   */
  emitResync(projectId: string, html: string, txId: number): void {
    const set = this.resyncListeners.get(projectId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(html, txId);
      } catch {
        // Don't let one bad listener break others
      }
    }
  }

  /** Number of active listeners for a project (for diagnostics). */
  listenerCount(projectId: string): number {
    return this.listeners.get(projectId)?.size ?? 0;
  }

  /** Total number of projects with active listeners. */
  activeProjectCount(): number {
    return this.listeners.size;
  }
}

// Singleton — shared across all route handlers in the same process
export const patchBroadcast = new PatchBroadcast();
