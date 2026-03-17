/**
 * useLayerTree — slice hook for layers panel consumers.
 *
 * Documents the contract between the layers panel and the editor state.
 * Creates a seam for future context splitting / re-render optimization.
 */

"use client";

import { useEditor, type LayerNode } from "./editor-state";

interface UseLayerTreeResult {
  layers: LayerNode[];
  activePageId: string | null;
  setActivePageId: (id: string) => void;
  selectedIds: Set<string>;
  select: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  hiddenIds: Set<string>;
  toggleVisibility: (id: string) => void;
  lockedIds: Set<string>;
  toggleLock: (id: string) => void;
  collapsedIds: Set<string>;
  toggleCollapsed: (id: string) => void;
  hoveredLayerId: string | null;
  setHoveredLayerId: (id: string | null) => void;
}

export function useLayerTree(): UseLayerTreeResult {
  const editor = useEditor();
  return {
    layers: editor.layers,
    activePageId: editor.activePageId,
    setActivePageId: editor.setActivePageId,
    selectedIds: editor.selectedIds,
    select: editor.select,
    clearSelection: editor.clearSelection,
    hiddenIds: editor.hiddenIds,
    toggleVisibility: editor.toggleVisibility,
    lockedIds: editor.lockedIds,
    toggleLock: editor.toggleLock,
    collapsedIds: editor.collapsedIds,
    toggleCollapsed: editor.toggleCollapsed,
    hoveredLayerId: editor.hoveredLayerId,
    setHoveredLayerId: editor.setHoveredLayerId,
  };
}
