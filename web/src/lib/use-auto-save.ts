"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useEditor } from "@/lib/editor-state";
import { serializeWithCollapsedInstances } from "@/lib/z10-dom";

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
      contentRef.current = content;
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
      // Serialize current DOM state back to content, preserving the head
      // (config, tokens, component definitions) from the current content.
      const serialized = serializeTransformLayer(el, contentRef.current);
      if (serialized && serialized !== lastSavedRef.current) {
        debouncedSave(serialized);
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "data-z10-id", "data-z10-page"],
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
 *
 * Strategy: extract body content from the live PageContent div, then splice it
 * into the current saved content to preserve the head (config, tokens,
 * component definitions).
 */
function serializeTransformLayer(transformEl: HTMLElement, currentContent?: string): string | null {
  // The canvas structure is:
  //   transformRef > div[key=page] > [label div, PageContent div.rounded-sm.shadow-2xl]
  // PageContent receives activePage.outerHTML, so its innerHTML IS the complete
  // page div: <div data-z10-page="..." data-z10-id="page_1">...frames...</div>
  const pageContentDiv = transformEl.querySelector(".rounded-sm.shadow-2xl") as HTMLElement | null;
  if (!pageContentDiv) return null;

  // Collapse expanded component instances before serializing so we don't
  // persist template-expanded content (instances should remain empty in storage).
  const liveBody = serializeWithCollapsedInstances(pageContentDiv);
  if (!liveBody.trim()) return null;

  if (!currentContent) return liveBody;

  // Splice: replace everything from the first <div data-z10-page= through
  // </body></html> (or end) with the live body, preserving the head
  // (config, tokens, component definitions).
  const firstPageIdx = currentContent.indexOf("<div data-z10-page=");
  if (firstPageIdx < 0) return liveBody;

  const head = currentContent.slice(0, firstPageIdx);

  // Preserve any closing tags after the page content (</body></html>)
  const bodyCloseIdx = currentContent.indexOf("</body>");
  const tail = bodyCloseIdx >= 0 ? currentContent.slice(bodyCloseIdx) : "";

  return head + liveBody + "\n" + tail;
}
