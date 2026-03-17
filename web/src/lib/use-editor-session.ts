/**
 * useEditorSession — thin React binding for EditorSession.
 *
 * Phase 1 (current): Bridges to existing useEditor() context,
 * providing the EditorSession-shaped interface on top of the
 * existing hook system. This lets consumers migrate to the new
 * API incrementally without changing behavior.
 *
 * Phase 2+: Will wrap a real EditorSession instance.
 */

"use client";

import { useMemo } from "react";
import { useEditor } from "./editor-state";
import type {
  EditorSessionState,
  EditorMutator,
  StructuralOp,
} from "./editor-session";

interface UseEditorSessionResult {
  state: EditorSessionState;
  mutate: EditorMutator;
}

/**
 * Returns the editor session interface shaped for the new API.
 * Phase 1: delegates to useEditor() internally.
 */
export function useEditorSession(): UseEditorSessionResult {
  const editor = useEditor();

  const state: EditorSessionState = useMemo(
    () => ({
      content: editor.content,
      syncStatus: "connected" as const, // Phase 1: no real sync tracking yet
      undoDepth: 0, // Phase 1: not exposed by current hooks
      redoDepth: 0,
      isReplayingRemote: editor.undoSuppressRef.current ?? false,
      pendingTxCount: 0,
    }),
    [editor.content, editor.undoSuppressRef],
  );

  const mutate: EditorMutator = useMemo(
    () => ({
      applyStructural(_op: StructuralOp): void {
        // Phase 1: structural ops still go through useKeyboardShortcuts
        // Phase 2+: will route through SyncCoordinator → MutationBridge
        console.warn(
          "EditorSession.mutate.applyStructural: not yet wired (Phase 1). Use keyboard shortcuts.",
        );
      },
      applyStyle(elementId: string, styles: Record<string, string>): void {
        editor.updateElementStyle(elementId, styles);
      },
      undo(): void {
        // Phase 1: undo is triggered by keyboard shortcut → useUndoRedo
        console.warn(
          "EditorSession.mutate.undo: not yet wired (Phase 1). Use Cmd+Z.",
        );
      },
      redo(): void {
        console.warn(
          "EditorSession.mutate.redo: not yet wired (Phase 1). Use Cmd+Shift+Z.",
        );
      },
      setContent(content: string): void {
        editor.updateContent(content);
      },
    }),
    [editor],
  );

  return { state, mutate };
}
