"use client";

import { useRef, useCallback, useEffect } from "react";
import { useEditor } from "@/lib/editor-state";

const MAX_HISTORY = 100;

/**
 * Snapshot-based undo/redo for the editor.
 *
 * Captures innerHTML snapshots of the transform layer after each mutation.
 * Uses MutationObserver to detect changes and debounces snapshot capture
 * to group rapid mutations into single undo steps.
 *
 * Undo/redo restores the transform layer innerHTML from the history stack.
 */
export function useUndoRedo() {
  const { transformRef } = useEditor();

  // History stacks
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Capture initial snapshot
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    // Wait for DOM to settle, then capture initial state
    const timer = setTimeout(() => {
      const snapshot = el.innerHTML;
      historyRef.current = [snapshot];
      indexRef.current = 0;
    }, 100);

    return () => clearTimeout(timer);
  }, [transformRef]);

  // Push a snapshot to history
  const pushSnapshot = useCallback(() => {
    const el = transformRef.current;
    if (!el || isRestoringRef.current) return;

    const snapshot = el.innerHTML;
    const current = historyRef.current[indexRef.current];

    // Skip if nothing changed
    if (snapshot === current) return;

    // Truncate any redo history beyond current index
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);

    // Push new snapshot
    historyRef.current.push(snapshot);

    // Enforce max history
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      indexRef.current++;
    }
  }, [transformRef]);

  // MutationObserver to capture snapshots after DOM changes
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (isRestoringRef.current) return;

      // Debounce: group rapid mutations into one snapshot
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(pushSnapshot, 300);
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [transformRef, pushSnapshot]);

  const undo = useCallback(() => {
    const el = transformRef.current;
    if (!el || indexRef.current <= 0) return;

    // Flush any pending snapshot before undoing
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      pushSnapshot();
    }

    isRestoringRef.current = true;
    indexRef.current--;
    el.innerHTML = historyRef.current[indexRef.current];

    // Allow observer to settle before accepting new mutations
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [transformRef, pushSnapshot]);

  const redo = useCallback(() => {
    const el = transformRef.current;
    if (!el || indexRef.current >= historyRef.current.length - 1) return;

    isRestoringRef.current = true;
    indexRef.current++;
    el.innerHTML = historyRef.current[indexRef.current];

    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [transformRef]);

  // Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.key !== "z") return;

      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return { undo, redo };
}
