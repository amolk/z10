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
 * §10.1, §10.5
 */

import { useCallback, type RefObject } from "react";
import { replayPatch } from "../../../src/dom/patch-replay.js";
import type { PatchEnvelope } from "../../../src/dom/patch-serialize.js";

/**
 * Creates patch and resync handlers that replay against the canvas DOM.
 *
 * @param transformRef - Ref to the transform layer div containing the live DOM
 * @param updateContent - EditorState callback for full content replacement (fallback)
 * @param refreshLayers - Callback to refresh the layers panel from live DOM after mutations
 */
export function useCanvasPatchReplay(
  transformRef: RefObject<HTMLDivElement | null>,
  updateContent: (html: string) => void,
  refreshLayers?: () => void,
) {
  const handlePatch = useCallback(
    (patch: PatchEnvelope) => {
      const root = transformRef.current;
      if (!root) return;

      // Apply ops directly to the live browser DOM
      replayPatch(patch.ops, root);

      // D3: Refresh layers panel from live DOM to reflect changes
      refreshLayers?.();
    },
    [transformRef, refreshLayers],
  );

  const handleResync = useCallback(
    (html: string, _txId: number) => {
      const root = transformRef.current;
      // D3: Try to replace DOM directly (avoids React re-render of PageContent)
      if (root) {
        const pageContainer = root.querySelector("[data-z10-page]")?.parentElement;
        if (pageContainer) {
          pageContainer.innerHTML = html;
          refreshLayers?.();
          return;
        }
      }
      // Fallback: full React content replacement
      updateContent(html);
    },
    [transformRef, updateContent, refreshLayers],
  );

  return { handlePatch, handleResync };
}

// Re-export for convenience
export { replayPatch };
export type { PatchEnvelope };
