"use client";

import { useEffect, useCallback } from "react";
import { useEditor } from "@/lib/editor-state";

/**
 * Centralized keyboard shortcuts for the editor.
 *
 * Shortcuts already handled elsewhere:
 * - V/F/T/H (tool switching) → tools-toolbar.tsx
 * - Escape (clear selection) → editor-canvas.tsx
 * - Cmd+S (save) → editor-canvas.tsx
 * - Space (hand tool) → editor-canvas.tsx
 * - Shift+1 (zoom fit), Cmd+0 (zoom 100%) → editor-canvas.tsx
 *
 * This hook handles:
 * - Delete/Backspace → remove selected elements
 * - Cmd+A → select all elements on active page
 * - Cmd+D → duplicate selected elements
 * - Cmd+G → group selected elements
 * - Cmd+Shift+G → ungroup selected elements
 * - Cmd+C → copy selected elements
 * - Cmd+V → paste copied elements
 * - Cmd+] → bring forward
 * - Cmd+[ → send backward
 * - Cmd+Z → undo (placeholder until undo/redo stack is built)
 * - Cmd+Shift+Z → redo (placeholder until undo/redo stack is built)
 */
export function useKeyboardShortcuts() {
  const {
    selectedIds,
    clearSelection,
    select,
    layers,
    activePageId,
    transformRef,
    updateElementStyle,
    content,
  } = useEditor();

  // Get all selectable element IDs on the active page
  const getPageElementIds = useCallback((): string[] => {
    const page = layers.find((p) => p.id === activePageId) || layers[0];
    if (!page) return [];
    const ids: string[] = [];
    function collect(children: typeof page.children) {
      for (const node of children) {
        ids.push(node.id);
        if (node.children.length > 0) collect(node.children);
      }
    }
    collect(page.children);
    return ids;
  }, [layers, activePageId]);

  useEffect(() => {
    function isInputFocused(): boolean {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Skip when typing in inputs
      if (isInputFocused()) return;

      const cmd = e.metaKey || e.ctrlKey;

      // ─── Delete / Backspace → remove selected elements ────
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !cmd &&
        selectedIds.size > 0
      ) {
        e.preventDefault();
        // Remove selected elements from the DOM
        for (const id of selectedIds) {
          const el = transformRef.current?.querySelector(
            `[data-z10-id="${id}"]`
          );
          if (el) el.remove();
        }
        clearSelection();
        return;
      }

      // ─── Cmd+A → select all on active page ───────────────
      if (cmd && e.key === "a") {
        e.preventDefault();
        const ids = getPageElementIds();
        if (ids.length > 0) {
          // Select first, then add rest with multi
          select(ids[0], false);
          for (let i = 1; i < ids.length; i++) {
            select(ids[i], true);
          }
        }
        return;
      }

      // ─── Cmd+D → duplicate selected ──────────────────────
      if (cmd && e.key === "d" && selectedIds.size > 0) {
        e.preventDefault();
        for (const id of selectedIds) {
          const el = transformRef.current?.querySelector(
            `[data-z10-id="${id}"]`
          ) as HTMLElement | null;
          if (!el) continue;
          const clone = el.cloneNode(true) as HTMLElement;
          const newId = `${id}_copy_${Date.now().toString(36)}`;
          clone.setAttribute("data-z10-id", newId);
          // Offset the duplicate slightly
          const currentLeft = parseInt(clone.style.left || "0") || 0;
          const currentTop = parseInt(clone.style.top || "0") || 0;
          clone.style.left = `${currentLeft + 20}px`;
          clone.style.top = `${currentTop + 20}px`;
          el.parentElement?.appendChild(clone);
        }
        return;
      }

      // ─── Cmd+C → copy ────────────────────────────────────
      if (cmd && e.key === "c" && selectedIds.size > 0) {
        e.preventDefault();
        const fragments: string[] = [];
        for (const id of selectedIds) {
          const el = transformRef.current?.querySelector(
            `[data-z10-id="${id}"]`
          );
          if (el) fragments.push(el.outerHTML);
        }
        if (fragments.length > 0) {
          // Store in a global clipboard variable (sessionStorage)
          sessionStorage.setItem(
            "z10-clipboard",
            JSON.stringify(fragments)
          );
        }
        return;
      }

      // ─── Cmd+V → paste ───────────────────────────────────
      if (cmd && e.key === "v") {
        e.preventDefault();
        const stored = sessionStorage.getItem("z10-clipboard");
        if (!stored) return;
        try {
          const fragments: string[] = JSON.parse(stored);
          const container = transformRef.current;
          if (!container) return;
          // Find the active page element to paste into
          const pageEl =
            container.querySelector(
              `[data-z10-id="${activePageId}"]`
            ) || container.querySelector("[data-z10-page]");
          if (!pageEl) return;

          for (const html of fragments) {
            const temp = document.createElement("div");
            temp.innerHTML = html;
            const el = temp.firstElementChild as HTMLElement;
            if (!el) continue;
            // Give it a new unique ID
            const newId = `paste_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            el.setAttribute("data-z10-id", newId);
            // Offset slightly from original
            const currentLeft = parseInt(el.style.left || "0") || 0;
            const currentTop = parseInt(el.style.top || "0") || 0;
            el.style.left = `${currentLeft + 20}px`;
            el.style.top = `${currentTop + 20}px`;
            pageEl.appendChild(el);
          }
        } catch {
          // Invalid clipboard data
        }
        return;
      }

      // ─── Cmd+G → group ───────────────────────────────────
      if (cmd && !e.shiftKey && e.key === "g" && selectedIds.size > 1) {
        e.preventDefault();
        const container = transformRef.current;
        if (!container) return;

        const groupId = `group_${Date.now().toString(36)}`;
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-z10-id", groupId);
        wrapper.setAttribute("data-z10-node", "Group");
        wrapper.style.position = "relative";

        const elements: HTMLElement[] = [];
        for (const id of selectedIds) {
          const el = container.querySelector(
            `[data-z10-id="${id}"]`
          ) as HTMLElement | null;
          if (el) elements.push(el);
        }

        if (elements.length > 1) {
          const parent = elements[0].parentElement;
          if (parent) {
            parent.insertBefore(wrapper, elements[0]);
            for (const el of elements) {
              wrapper.appendChild(el);
            }
            clearSelection();
            select(groupId, false);
          }
        }
        return;
      }

      // ─── Cmd+Shift+G → ungroup ───────────────────────────
      if (cmd && e.shiftKey && e.key === "g" && selectedIds.size === 1) {
        e.preventDefault();
        const id = Array.from(selectedIds)[0];
        const el = transformRef.current?.querySelector(
          `[data-z10-id="${id}"]`
        ) as HTMLElement | null;
        if (!el || !el.parentElement) return;

        const parent = el.parentElement;
        const children = Array.from(el.children) as HTMLElement[];
        for (const child of children) {
          parent.insertBefore(child, el);
        }
        parent.removeChild(el);
        clearSelection();
        return;
      }

      // ─── Cmd+] → bring forward ───────────────────────────
      if (cmd && e.key === "]" && selectedIds.size === 1) {
        e.preventDefault();
        const id = Array.from(selectedIds)[0];
        const el = transformRef.current?.querySelector(
          `[data-z10-id="${id}"]`
        );
        if (el?.nextElementSibling) {
          el.parentElement?.insertBefore(el.nextElementSibling, el);
        }
        return;
      }

      // ─── Cmd+[ → send backward ───────────────────────────
      if (cmd && e.key === "[" && selectedIds.size === 1) {
        e.preventDefault();
        const id = Array.from(selectedIds)[0];
        const el = transformRef.current?.querySelector(
          `[data-z10-id="${id}"]`
        );
        if (el?.previousElementSibling) {
          el.parentElement?.insertBefore(el, el.previousElementSibling);
        }
        return;
      }

      // Cmd+Z / Cmd+Shift+Z handled by useUndoRedo hook
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedIds,
    clearSelection,
    select,
    getPageElementIds,
    transformRef,
    activePageId,
    updateElementStyle,
    content,
  ]);
}
