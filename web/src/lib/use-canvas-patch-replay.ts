"use client";

/**
 * D2. Browser patch replay.
 *
 * Applies incoming PatchEnvelope ops to the live browser DOM inside the
 * editor canvas. Uses replayPatch (A15) — the same function used by
 * server (happy-dom) and CLI (happy-dom). This means agent edits appear
 * live as individual element updates, not full re-renders.
 *
 * For resync events (gap too large on reconnect), falls back to full
 * content replacement via updateContent.
 *
 * §10.1
 */

import { useCallback, type RefObject } from "react";
import { replayPatch } from "../../../src/dom/patch-replay.js";
import type { PatchEnvelope } from "../../../src/dom/patch-serialize.js";

/**
 * Creates patch and resync handlers that replay against the canvas DOM.
 *
 * @param transformRef - Ref to the transform layer div containing the live DOM
 * @param updateContent - EditorState callback for full content replacement (resync)
 * @param refreshLayers - Optional callback to refresh the layers panel after patches
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

      // Refresh layers panel to reflect DOM changes
      refreshLayers?.();
    },
    [transformRef, refreshLayers],
  );

  const handleResync = useCallback(
    (html: string, _txId: number) => {
      // Full content replacement — React re-renders the canvas
      updateContent(html);
    },
    [updateContent],
  );

  return { handlePatch, handleResync };
}

// Re-export for convenience
export { replayPatch };
export type { PatchEnvelope };
