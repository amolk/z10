"use client";

/**
 * Mutation bridge — replaces use-auto-save.ts.
 *
 * Watches the editor transform layer DOM for mutations from keyboard shortcuts
 * (delete, duplicate, paste, group, reorder) and sends them to the server as
 * transactions. This ensures ALL edits flow through the canonical DOM — no
 * more silent PUT failures.
 *
 * Style edits are handled by useEditBridge (separate path), so style attribute
 * mutations are skipped here.
 *
 * Also provides:
 * - Cmd+S → POST /flush (persist canonical DOM to DB)
 * - beforeunload → navigator.sendBeacon /flush (crash safety)
 */

import { useCallback, useRef, useEffect } from "react";
import { useEditor } from "@/lib/editor-state";
import { mutationRecordsToTransaction } from "@/lib/mutation-to-transaction";
import type { TransactResult } from "@/lib/use-transact";

type TransactFn = (
  code: string,
  subtreeRootNid?: string | null,
) => Promise<TransactResult>;

export type SyncState = "synced" | "syncing" | "offline";

export function useMutationBridge(
  projectId: string,
  transact: TransactFn,
) {
  const {
    transformRef,
    undoSuppressRef,
    editingComponentName,
    activePageId,
  } = useEditor();

  const editingComponentRef = useRef(editingComponentName);
  editingComponentRef.current = editingComponentName;
  const pageIdRef = useRef(activePageId);
  pageIdRef.current = activePageId;
  const transactRef = useRef(transact);
  transactRef.current = transact;

  // Track in-flight transactions for sync state
  const inflightRef = useRef(0);
  const syncStateRef = useRef<SyncState>("synced");
  // We expose syncState via a simple callback rather than React state
  // to avoid re-renders on every transaction ack.

  // Batch mutations within a microtask, same pattern as edit bridge
  const pendingRecords = useRef<MutationRecord[]>([]);
  const flushScheduled = useRef(false);

  const flushPending = useCallback(() => {
    flushScheduled.current = false;
    const records = pendingRecords.current.slice();
    pendingRecords.current = [];

    const code = mutationRecordsToTransaction(records);
    if (!code) return;

    inflightRef.current++;
    syncStateRef.current = "syncing";

    transactRef.current(code, pageIdRef.current).then((result) => {
      inflightRef.current--;
      if (inflightRef.current === 0) {
        syncStateRef.current = "synced";
      }
      if (result.status === "rejected") {
        console.warn("[mutation-bridge] Transaction rejected:", result.reason);
      } else if (result.status === "error") {
        console.warn("[mutation-bridge] Transaction error:", result.error);
        syncStateRef.current = "offline";
      }
    });
  }, []);

  // MutationObserver on transform layer
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    const observer = new MutationObserver((records) => {
      // Skip during patch replay / undo restore / external updates
      if (undoSuppressRef.current) return;

      // Skip in component edit mode — transform layer shows component preview,
      // not page content. Template edits are handled via edit bridge.
      if (editingComponentRef.current) return;

      pendingRecords.current.push(...records);
      if (!flushScheduled.current) {
        flushScheduled.current = true;
        queueMicrotask(flushPending);
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-z10-id", "data-z10-page", "data-z10-overrides"],
    });

    return () => observer.disconnect();
  }, [transformRef, flushPending, undoSuppressRef]);

  // Cmd+S → flush canonical DOM to disk
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        fetch(`/api/projects/${projectId}/flush`, { method: "POST" }).catch(
          () => console.warn("[mutation-bridge] Flush failed"),
        );
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectId]);

  // beforeunload → sendBeacon to flush
  useEffect(() => {
    function handleBeforeUnload() {
      navigator.sendBeacon(`/api/projects/${projectId}/flush`);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [projectId]);
}
