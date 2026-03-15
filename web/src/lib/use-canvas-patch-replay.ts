"use client";

/**
 * D2. Browser patch replay.
 *
 * Applies incoming PatchEnvelope ops to the live browser DOM inside the
 * editor canvas. Uses replayPatch (A15) — the same function used by
 * server (happy-dom) and CLI (happy-dom). This means agent edits appear
 * live as individual element updates, not full re-renders.
 *
 * For resync events (gap too large on reconnect), replaces the active
 * page's DOM directly via innerHTML, then refreshes layers.
 *
 * Suppresses undo recording via undoSuppressRef so agent edits are not
 * added to the user's undo history.
 *
 * §10.1, §10.5
 */

import { useCallback, type RefObject } from "react";
import { replayPatch, type PatchEnvelope } from "@/lib/z10-dom";

/**
 * Creates patch and resync handlers that replay against the canvas DOM.
 *
 * @param transformRef - Ref to the transform layer div containing the live DOM
 * @param updateContent - EditorState callback for full content replacement (fallback)
 * @param refreshLayers - Callback to refresh the layers panel from live DOM after mutations
 * @param validateSelection - D5: Remove selected IDs that no longer exist in live DOM
 * @param undoSuppressRef - Ref flag to suppress undo snapshot recording during patch replay
 */
export function useCanvasPatchReplay(
  transformRef: RefObject<HTMLDivElement | null>,
  updateContent: (html: string) => void,
  refreshLayers?: () => void,
  validateSelection?: () => void,
  undoSuppressRef?: RefObject<boolean>,
) {
  const handlePatch = useCallback(
    (patch: PatchEnvelope) => {
      const root = transformRef.current;
      if (!root) return;

      // Suppress undo recording for agent patches
      if (undoSuppressRef) undoSuppressRef.current = true;

      // Apply ops directly to the live browser DOM
      replayPatch(patch.ops, root);

      // D3: Refresh layers panel from live DOM to reflect changes
      refreshLayers?.();
      // D5: Clear selection for any elements removed by this patch
      validateSelection?.();

      // Re-enable undo recording after observer microtasks settle
      if (undoSuppressRef) {
        requestAnimationFrame(() => {
          undoSuppressRef.current = false;
        });
      }
    },
    [transformRef, refreshLayers, validateSelection, undoSuppressRef],
  );

  const handleResync = useCallback(
    (html: string, _txId: number) => {
      const root = transformRef.current;
      // D3: Try to replace DOM directly (avoids React re-render of PageContent)
      if (root) {
        const pageContainer = root.querySelector("[data-z10-page]")?.parentElement;
        if (pageContainer) {
          // Suppress undo recording for resync
          if (undoSuppressRef) undoSuppressRef.current = true;

          pageContainer.innerHTML = html;
          refreshLayers?.();
          validateSelection?.();

          if (undoSuppressRef) {
            requestAnimationFrame(() => {
              undoSuppressRef.current = false;
            });
          }
          return;
        }
      }
      // Fallback: full React content replacement
      updateContent(html);
    },
    [transformRef, updateContent, refreshLayers, validateSelection, undoSuppressRef],
  );

  return { handlePatch, handleResync };
}

// Re-export for convenience
export { replayPatch };
export type { PatchEnvelope };
