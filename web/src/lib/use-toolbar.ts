/**
 * useToolbar — slice hook for toolbar consumers.
 *
 * Documents the contract between the toolbar and the editor state.
 * Creates a seam for future context splitting / re-render optimization.
 */

"use client";

import { useEditor, type ToolType } from "./editor-state";

interface UseToolbarResult {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
}

export function useToolbar(): UseToolbarResult {
  const { activeTool, setActiveTool } = useEditor();
  return { activeTool, setActiveTool };
}
