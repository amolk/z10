"use client";

/**
 * D4. useEditBridge — bridges local DOM edits to the server transaction engine.
 *
 * Registers a callback on EditorState's `setOnStyleEdit` so that every
 * `updateElementStyle` call automatically generates JS code and sends it
 * to the server. Style changes are batched within a microtask to avoid
 * flooding the server during rapid-fire interactions (drag, slider).
 *
 * §10.2
 */

import { useCallback, useRef, useEffect } from "react";
import { generateStyleCode } from "./generate-edit-code";
import type { TransactResult } from "./use-transact";

type TransactFn = (
  code: string,
  subtreeRootNid?: string | null,
) => Promise<TransactResult>;

type SetOnStyleEdit = (
  cb: ((id: string, styles: Record<string, string>) => void) | null,
) => void;

/**
 * Registers a style-edit callback that batches changes and sends them
 * to the server via the transact endpoint. Cleans up on unmount.
 */
export function useEditBridge(
  _updateElementStyle: (id: string, styles: Record<string, string>) => void,
  transact: TransactFn,
  activePageId: string | null,
  setOnStyleEdit: SetOnStyleEdit,
) {
  // Debounce rapid-fire style updates by batching per element ID
  const pendingStyles = useRef<Map<string, Record<string, string>>>(new Map());
  const flushScheduled = useRef(false);
  const transactRef = useRef(transact);
  const pageIdRef = useRef(activePageId);
  transactRef.current = transact;
  pageIdRef.current = activePageId;

  const flushPending = useCallback(() => {
    flushScheduled.current = false;
    const batch = new Map(pendingStyles.current);
    pendingStyles.current.clear();

    for (const [id, styles] of batch) {
      const code = generateStyleCode(id, styles);
      if (code) {
        // Fire-and-forget — optimistic application already done.
        // D5: On rejection, the server's truth arrives via patch replay which
        // updates the canvas DOM. The properties panel MutationObserver picks
        // up the change automatically. We log for debugging.
        transactRef.current(code, pageIdRef.current).then((result) => {
          if (result.status === "rejected") {
            console.warn("[edit-bridge] Transaction rejected:", result.reason);
          } else if (result.status === "error") {
            console.warn("[edit-bridge] Transaction error:", result.error);
          }
        });
      }
    }
  }, []);

  // Register the style-edit callback on EditorState
  useEffect(() => {
    setOnStyleEdit((id: string, styles: Record<string, string>) => {
      const existing = pendingStyles.current.get(id) ?? {};
      pendingStyles.current.set(id, { ...existing, ...styles });
      if (!flushScheduled.current) {
        flushScheduled.current = true;
        queueMicrotask(flushPending);
      }
    });
    return () => setOnStyleEdit(null);
  }, [setOnStyleEdit, flushPending]);
}
