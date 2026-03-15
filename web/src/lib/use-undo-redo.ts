"use client";

import { useRef, useCallback, useEffect } from "react";
import { useEditor } from "@/lib/editor-state";

const MAX_HISTORY = 100;

/**
 * Snapshot-based undo/redo for the editor.
 *
 * Captures innerHTML snapshots of the **page content container** (the parent
 * of the [data-z10-page] element) after each mutation.  This avoids blowing
 * away React-managed siblings (selection overlays, page labels) that live in
 * the transform layer.
 *
 * After restoring a snapshot, layers are refreshed from the live DOM so the
 * layers panel stays in sync.
 *
 * Recording is suppressed while:
 *  - A restore is in progress (isRestoringRef)
 *  - Patch replay is running (undoSuppressRef from EditorState)
 */
export function useUndoRedo() {
  const { transformRef, refreshLayersFromDOM, undoSuppressRef } = useEditor();

  // History stacks
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Find the page content container — the direct parent of [data-z10-page]. */
  const getPageContentEl = useCallback((): HTMLElement | null => {
    const root = transformRef.current;
    if (!root) return null;
    const pageEl = root.querySelector("[data-z10-page]");
    return (pageEl?.parentElement as HTMLElement) ?? null;
  }, [transformRef]);

  // Capture initial snapshot
  useEffect(() => {
    // Wait for DOM to settle, then capture initial state
    const timer = setTimeout(() => {
      const el = getPageContentEl();
      if (!el) return;
      historyRef.current = [el.innerHTML];
      indexRef.current = 0;
    }, 100);

    return () => clearTimeout(timer);
  }, [getPageContentEl]);

  // Push a snapshot to history
  const pushSnapshot = useCallback(() => {
    const el = getPageContentEl();
    if (!el || isRestoringRef.current || undoSuppressRef.current) return;

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
  }, [getPageContentEl, undoSuppressRef]);

  // MutationObserver to capture snapshots after DOM changes
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      if (isRestoringRef.current || undoSuppressRef.current) return;

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
  }, [transformRef, pushSnapshot, undoSuppressRef]);

  const undo = useCallback(() => {
    const el = getPageContentEl();
    if (!el || indexRef.current <= 0) return;

    // Flush any pending snapshot before undoing
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      pushSnapshot();
    }

    isRestoringRef.current = true;
    indexRef.current--;
    el.innerHTML = historyRef.current[indexRef.current];

    // Sync layers panel from restored DOM
    refreshLayersFromDOM();

    // Allow observer to settle before accepting new mutations
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [getPageContentEl, pushSnapshot, refreshLayersFromDOM]);

  const redo = useCallback(() => {
    const el = getPageContentEl();
    if (!el || indexRef.current >= historyRef.current.length - 1) return;

    isRestoringRef.current = true;
    indexRef.current++;
    el.innerHTML = historyRef.current[indexRef.current];

    // Sync layers panel from restored DOM
    refreshLayersFromDOM();

    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [getPageContentEl, refreshLayersFromDOM]);

  // Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip when in inputs or contentEditable elements (let native undo handle it)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
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
