/**
 * useSelectedElement — slice hook for properties panel consumers.
 *
 * Documents the contract between the properties panel and the editor state.
 * Creates a seam for future context splitting / re-render optimization.
 */

"use client";

import { useEditor } from "./editor-state";
import type { RefObject } from "react";

interface UseSelectedElementResult {
  selectedIds: Set<string>;
  transformRef: RefObject<HTMLDivElement | null>;
  updateElementStyle: (id: string, styles: Record<string, string>) => void;
  styleRevision: number;
}

export function useSelectedElement(): UseSelectedElementResult {
  const editor = useEditor();
  return {
    selectedIds: editor.selectedIds,
    transformRef: editor.transformRef,
    updateElementStyle: editor.updateElementStyle,
    styleRevision: editor.styleRevision,
  };
}
