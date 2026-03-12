"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor } from "@/lib/editor-state";

const SAVE_DEBOUNCE_MS = 1500;

/**
 * Auto-save hook. Watches editor content state and persists to server.
 *
 * Triggers:
 * - EditorState.content changes (from updateElementStyle, keyboard shortcuts, etc.)
 * - MutationObserver on the transform layer DOM (catches direct DOM edits)
 * - Cmd+S for immediate save
 *
 * Debounces at 1.5s like Figma.
 */
export function useAutoSave(projectId: string, initialContent: string) {
  const { content, transformRef, isExternalUpdate } = useEditor();
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const contentRef = useRef(initialContent);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedRef = useRef(initialContent);

  const save = useCallback(
    async (toSave: string) => {
      if (toSave === lastSavedRef.current) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: toSave }),
        });
        if (res.ok) {
          lastSavedRef.current = toSave;
          setSaveState("saved");
        } else {
          setSaveState("unsaved");
        }
      } catch {
        setSaveState("unsaved");
      }
    },
    [projectId]
  );

  const debouncedSave = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setSaveState("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(newContent), SAVE_DEBOUNCE_MS);
    },
    [save]
  );

  // Watch EditorState content for changes (from properties panel, etc.)
  // Skip saving when the update came from an external source (MCP agent)
  // since the server already has the latest content.
  useEffect(() => {
    if (isExternalUpdate.current) {
      // Mark as saved (server already has this content) and reset flag
      lastSavedRef.current = content;
      isExternalUpdate.current = false;
      setSaveState("saved");
      return;
    }
    if (content && content !== lastSavedRef.current) {
      debouncedSave(content);
    }
  }, [content, debouncedSave, isExternalUpdate]);

  // MutationObserver on transform layer to catch direct DOM edits
  // (keyboard shortcuts: delete, duplicate, group, paste, reorder)
  useEffect(() => {
    const el = transformRef.current;
    if (!el) return;

    const observer = new MutationObserver(() => {
      // Serialize current DOM state back to content
      const serialized = serializeTransformLayer(el);
      if (serialized && serialized !== lastSavedRef.current) {
        debouncedSave(serialized);
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "data-z10-id", "data-z10-node", "data-z10-page"],
    });

    return () => observer.disconnect();
  }, [transformRef, debouncedSave]);

  // Cmd+S for immediate save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        save(contentRef.current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  return { saveState };
}

/**
 * Serialize the transform layer's page elements back to .z10.html format.
 * This captures the live DOM state including any mutations from keyboard shortcuts.
 */
function serializeTransformLayer(transformEl: HTMLElement): string | null {
  // Find page containers (they have data-z10-id and are direct artboard wrappers)
  const pageWrappers = transformEl.querySelectorAll("[data-z10-id]");
  if (pageWrappers.length === 0) return null;

  // We need to reconstruct the pages from the rendered DOM.
  // Each page wrapper in the canvas has data-z10-id and contains the rendered innerHTML.
  // We need to build back the page divs with their original attributes.
  const pages: string[] = [];

  pageWrappers.forEach((wrapper) => {
    const el = wrapper as HTMLElement;
    // Only process top-level page elements (children of transform layer)
    if (el.parentElement !== transformEl) return;

    const pageId = el.getAttribute("data-z10-id") || "";
    // Find page name from the label sibling or the original data
    const labelEl = el.querySelector(":scope > div[class*='-top-']");
    const pageName = labelEl?.textContent?.trim() || "Page 1";

    // Get the actual content div (the one with dangerouslySetInnerHTML content)
    const contentDivs = el.querySelectorAll(":scope > div:not([class*='-top-'])");
    let innerHTML = "";
    contentDivs.forEach((div) => {
      innerHTML += div.innerHTML;
    });

    // Get dimensions from style
    const style = el.getAttribute("style") || "";
    const widthMatch = style.match(/width:\s*(\d+)/);
    const heightMatch = style.match(/(?:min-)?height:\s*(\d+)/);
    const bgMatch = style.match(/background:\s*([^;]+)/);

    const width = widthMatch ? widthMatch[1] : "1440";
    const height = heightMatch ? heightMatch[1] : "900";
    const bg = bgMatch ? bgMatch[1].trim() : "#ffffff";

    pages.push(
      `  <div data-z10-page="${pageName}" data-z10-id="${pageId}" style="width: ${width}px; min-height: ${height}px; background: ${bg}; position: relative;">\n${innerHTML}\n  </div>`
    );
  });

  if (pages.length === 0) return null;

  // Reconstruct minimal .z10.html
  // Note: we preserve just the page content since config/tokens are not in the canvas DOM
  return pages.join("\n");
}
