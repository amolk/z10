"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "./editor-state";
import type { AgentOperation } from "./use-agent-stream";

/**
 * Applies visual highlights to DOM elements when an MCP agent creates,
 * modifies, or removes them. Uses CSS animations injected via class names.
 *
 * Highlight effects (per PRD 2.9):
 * - add:    Blue pulse outline (1.5s)
 * - modify: Brief property flash (600ms)
 * - remove: Red flash + fade-out (300ms)
 *
 * Elements are found via data-z10-id in the transform layer DOM.
 */
export function useAgentHighlight(lastOperation: AgentOperation | null) {
  const { transformRef } = useEditor();
  const prevOperationRef = useRef<AgentOperation | null>(null);

  useEffect(() => {
    if (!lastOperation || !transformRef.current) return;
    // Skip if we've already processed this exact operation
    if (
      prevOperationRef.current?.timestamp === lastOperation.timestamp &&
      prevOperationRef.current?.tool === lastOperation.tool
    ) {
      return;
    }
    prevOperationRef.current = lastOperation;

    const root = transformRef.current;
    const { operation, affectedIds } = lastOperation;

    if (affectedIds.length === 0) return;

    const className = getHighlightClass(operation);
    const duration = getHighlightDuration(operation);

    for (const id of affectedIds) {
      const el = root.querySelector(
        `[data-z10-id="${CSS.escape(id)}"]`
      ) as HTMLElement | null;
      if (!el) continue;

      // Remove any existing highlight first
      el.classList.remove(
        "z10-highlight-add",
        "z10-highlight-modify",
        "z10-highlight-remove"
      );

      // Force reflow to restart animation if same class
      void el.offsetWidth;

      el.classList.add(className);

      // Auto-remove after animation completes
      setTimeout(() => {
        el.classList.remove(className);
      }, duration);
    }

    // Parent context tint: briefly highlight the parent of added elements
    if (operation === "add" && affectedIds.length > 0) {
      const firstEl = root.querySelector(
        `[data-z10-id="${CSS.escape(affectedIds[0])}"]`
      ) as HTMLElement | null;
      const parent = firstEl?.parentElement;
      if (parent && parent !== root) {
        parent.classList.add("z10-highlight-parent");
        setTimeout(() => {
          parent.classList.remove("z10-highlight-parent");
        }, 1500);
      }
    }
  }, [lastOperation, transformRef]);
}

function getHighlightClass(
  operation: AgentOperation["operation"]
): string {
  switch (operation) {
    case "add":
      return "z10-highlight-add";
    case "modify":
      return "z10-highlight-modify";
    case "remove":
      return "z10-highlight-remove";
    default:
      return "z10-highlight-modify";
  }
}

function getHighlightDuration(
  operation: AgentOperation["operation"]
): number {
  switch (operation) {
    case "add":
      return 1500;
    case "modify":
      return 600;
    case "remove":
      return 300;
    default:
      return 600;
  }
}
