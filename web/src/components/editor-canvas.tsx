"use client";

import {
  useRef,
  useCallback,
  useState,
  useEffect,
  memo,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEditor } from "@/lib/editor-state";
import { isContainer, isTextEditable } from "@/lib/node-inference";
import { SELECTION_COLOR, COMPONENT_COLOR } from "@/lib/editor-constants";
import { tagNameToComponentName } from "z10/core";
import {
  expandComponentTemplates,
  parseComponentTemplates,
} from "@/lib/z10-dom";

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

type Rect = { x: number; y: number; w: number; h: number };

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.8;
const HOVER_COLOR = SELECTION_COLOR;

// ─── Interaction modes ──────────────────────────────────────
type OrigInfo = { left: number; top: number; isAbsolute: boolean; parentId: string | null };

/** Drop target computed during move drag */
type DropTarget =
  | { kind: "absolute"; x: number; y: number }                                          // free position on page
  | { kind: "flow-insert"; containerId: string; index: number; lineRect: Rect; isVertical: boolean } // insert between flow children
  | { kind: "into-container"; containerId: string; containerRect: Rect };                // drop inside empty area of container

type DragMode =
  | { type: "none" }
  | { type: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { type: "move"; startX: number; startY: number; originals: Map<string, OrigInfo>; isClone?: boolean; clonedIds?: Map<string, string> }
  | { type: "resize"; startX: number; startY: number; handleIndex: number; origRect: Rect; elementId: string }
  | { type: "rotate"; centerX: number; centerY: number; startAngle: number; origRotation: number; elementId: string }
  | { type: "marquee"; startX: number; startY: number };

// ─── Per-page view persistence ──────────────────────────────
function viewStorageKey(projectId: string, pageId: string) {
  return `z10-view:${projectId}:${pageId}`;
}

function saveViewForPage(projectId: string, pageId: string, view: ViewTransform) {
  try {
    localStorage.setItem(viewStorageKey(projectId, pageId), JSON.stringify(view));
  } catch {}
}

function loadViewForPage(projectId: string, pageId: string): ViewTransform | null {
  try {
    const raw = localStorage.getItem(viewStorageKey(projectId, pageId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.x === "number" && typeof v.y === "number" && typeof v.scale === "number") return v;
  } catch {}
  return null;
}

export function EditorCanvas({
  projectId,
  initialContent,
  saveState = "saved",
}: {
  projectId: string;
  initialContent: string;
  saveState?: "saved" | "saving" | "unsaved";
}) {
  const { selectedIds, select, clearSelection, transformRef, activeTool, setActiveTool, content, updateElementStyle, updateContent, activePageId, editingTextId, startTextEdit, commitTextEdit, hoveredLayerId, setHoveredLayerId, editingComponentName, exitComponentEditMode } = useEditor();

  // ─── Canvas pan/zoom state ─────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewInitialized = useRef(false);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 0.5 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [hoverChildRects, setHoverChildRects] = useState<Rect[]>([]);
  const [flexParentRect, setFlexParentRect] = useState<Rect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragJustEnded = useRef(false);

  // ─── Parse active page from .z10.html ──────────────────────
  const [activePage, setActivePage] = useState<PageInfo | null>(null);
  const componentTemplatesRef = useRef(new Map<string, { template: string; styles: string }>());
  useEffect(() => {
    const src = content || initialContent;
    const parsed = parsePagesFromContent(src);
    const page = parsed.find((p) => p.id === activePageId) || parsed[0] || null;
    setActivePage(page);
    componentTemplatesRef.current = parseComponentTemplates(src);
  }, [content, initialContent, activePageId]);

  // ─── Selection rects (computed from DOM) ────────────────────
  const [selectionRects, setSelectionRects] = useState<Map<string, Rect>>(new Map());

  const computeElementRect = useCallback(
    (id: string): Rect | null => {
      const transformEl = transformRef.current;
      if (!transformEl) return null;
      const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
      if (!el) return null;
      const elRect = el.getBoundingClientRect();
      const transformRect = transformEl.getBoundingClientRect();
      return {
        x: (elRect.left - transformRect.left) / view.scale,
        y: (elRect.top - transformRect.top) / view.scale,
        w: elRect.width / view.scale,
        h: elRect.height / view.scale,
      };
    },
    [transformRef, view.scale]
  );

  /** Build a flow-insert drop target for a given flow container at cursor position */
  const computeFlowInsert = useCallback(
    (flowContainerId: string, flowContainerEl: HTMLElement, screenX: number, screenY: number, draggedIds: Set<string>): DropTarget | null => {
      const transformEl = transformRef.current;
      if (!transformEl) return null;

      const children: HTMLElement[] = [];
      for (const child of Array.from(flowContainerEl.children)) {
        const childId = (child as HTMLElement).getAttribute("data-z10-id");
        if (childId && !draggedIds.has(childId)) {
          children.push(child as HTMLElement);
        }
      }

      if (children.length === 0) {
        const cRect = computeElementRect(flowContainerId);
        if (cRect) return { kind: "into-container", containerId: flowContainerId, containerRect: cRect };
        return null;
      }

      const computedDir = window.getComputedStyle(flowContainerEl).flexDirection;
      const isVertical = computedDir === "column" || computedDir === "column-reverse";
      const transformRect = transformEl.getBoundingClientRect();

      let bestIndex = children.length;
      for (let i = 0; i < children.length; i++) {
        const cRect = children[i].getBoundingClientRect();
        const mid = isVertical
          ? (cRect.top + cRect.bottom) / 2
          : (cRect.left + cRect.right) / 2;
        const cursorPos = isVertical ? screenY : screenX;
        if (cursorPos < mid) {
          bestIndex = i;
          break;
        }
      }

      let lineRect: Rect;
      const lineThickness = 2 / view.scale;

      if (bestIndex === 0) {
        const firstRect = children[0].getBoundingClientRect();
        if (isVertical) {
          const y = (firstRect.top - transformRect.top) / view.scale;
          const x = (firstRect.left - transformRect.left) / view.scale;
          const w = firstRect.width / view.scale;
          lineRect = { x, y: y - lineThickness / 2, w, h: lineThickness };
        } else {
          const x = (firstRect.left - transformRect.left) / view.scale;
          const y = (firstRect.top - transformRect.top) / view.scale;
          const h = firstRect.height / view.scale;
          lineRect = { x: x - lineThickness / 2, y, w: lineThickness, h };
        }
      } else {
        const prevRect = children[bestIndex - 1].getBoundingClientRect();
        const nextRect = bestIndex < children.length ? children[bestIndex].getBoundingClientRect() : null;
        if (isVertical) {
          const prevBottom = (prevRect.bottom - transformRect.top) / view.scale;
          const nextTop = nextRect ? (nextRect.top - transformRect.top) / view.scale : prevBottom + 4 / view.scale;
          const midY = (prevBottom + nextTop) / 2;
          const x = (prevRect.left - transformRect.left) / view.scale;
          const w = prevRect.width / view.scale;
          lineRect = { x, y: midY - lineThickness / 2, w, h: lineThickness };
        } else {
          const prevRight = (prevRect.right - transformRect.left) / view.scale;
          const nextLeft = nextRect ? (nextRect.left - transformRect.left) / view.scale : prevRight + 4 / view.scale;
          const midX = (prevRight + nextLeft) / 2;
          const y = (prevRect.top - transformRect.top) / view.scale;
          const h = prevRect.height / view.scale;
          lineRect = { x: midX - lineThickness / 2, y, w: lineThickness, h };
        }
      }

      return { kind: "flow-insert", containerId: flowContainerId, index: bestIndex, lineRect, isVertical };
    },
    [transformRef, view.scale, computeElementRect]
  );

  /** Check if an element is a flow container */
  const isFlowDisplay = useCallback((el: HTMLElement): boolean => {
    const d = window.getComputedStyle(el).display;
    return d === "flex" || d === "inline-flex" || d === "grid" || d === "inline-grid";
  }, []);

  /** Compute where the dragged element would land at the given canvas-space cursor */
  const computeDropTarget = useCallback(
    (cursorX: number, cursorY: number, draggedIds: Set<string>, sourceParentId: string | null): DropTarget | null => {
      const transformEl = transformRef.current;
      if (!transformEl) return null;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return null;
      const screenX = cursorX * view.scale + view.x + canvasRect.left;
      const screenY = cursorY * view.scale + view.y + canvasRect.top;

      // ── Priority 1: If dragged from a flow container, prefer reordering within it ──
      if (sourceParentId) {
        const sourceEl = transformEl.querySelector(`[data-z10-id="${sourceParentId}"]`) as HTMLElement | null;
        if (sourceEl && isFlowDisplay(sourceEl)) {
          const sourceRect = sourceEl.getBoundingClientRect();
          // Generous margin (40px) — only leave source when cursor is clearly outside
          const margin = 40;
          if (
            screenX >= sourceRect.left - margin &&
            screenX <= sourceRect.right + margin &&
            screenY >= sourceRect.top - margin &&
            screenY <= sourceRect.bottom + margin
          ) {
            return computeFlowInsert(sourceParentId, sourceEl, screenX, screenY, draggedIds);
          }
        }
      }

      // ── Priority 2: elementFromPoint hit-testing ──
      // Temporarily hide dragged elements so elementFromPoint sees through them
      const draggedEls: HTMLElement[] = [];
      for (const id of draggedIds) {
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
        if (el) {
          draggedEls.push(el);
          el.style.pointerEvents = "none";
        }
      }

      const hitEl = document.elementFromPoint(screenX, screenY);

      for (const el of draggedEls) {
        el.style.pointerEvents = "";
      }

      if (!hitEl) return null;

      // Walk up to find the nearest z10 element
      let target = hitEl as HTMLElement;
      let targetId: string | null = null;
      while (target && target !== canvasRef.current) {
        targetId = target.getAttribute("data-z10-id");
        if (targetId && !draggedIds.has(targetId)) break;
        targetId = null;
        target = target.parentElement!;
      }

      if (!targetId) return null;
      const targetEl = transformEl.querySelector(`[data-z10-id="${targetId}"]`) as HTMLElement | null;
      if (!targetEl) return null;

      // Check target and parent for flow containers
      const isTargetFlow = isFlowDisplay(targetEl);
      const parentEl = targetEl.parentElement;
      const parentId = parentEl?.getAttribute("data-z10-id") || null;
      const isParentFlow = parentEl && parentId && !draggedIds.has(parentId) && isFlowDisplay(parentEl);

      if (isTargetFlow || isParentFlow) {
        const flowContainerId = isTargetFlow ? targetId : parentId!;
        const flowContainerEl = isTargetFlow ? targetEl : parentEl!;
        return computeFlowInsert(flowContainerId, flowContainerEl as HTMLElement, screenX, screenY, draggedIds);
      }

      // Not a flow container — check if it's a page or frame that could accept children
      const isPage = targetEl.hasAttribute("data-z10-page");
      if (isPage || isContainer(targetEl)) {
        const cRect = computeElementRect(targetId);
        if (cRect) return { kind: "into-container", containerId: targetId, containerRect: cRect };
      }

      return null;
    },
    [transformRef, view.scale, view.x, view.y, computeElementRect, computeFlowInsert, isFlowDisplay]
  );

  // Recompute selection rects when selection changes
  useEffect(() => {
    if (selectedIds.size === 0) {
      setSelectionRects(new Map());
      setFlexParentRect(null);
      return;
    }
    const rects = new Map<string, Rect>();
    for (const id of selectedIds) {
      const rect = computeElementRect(id);
      if (rect) rects.set(id, rect);
    }
    setSelectionRects(rects);

    // Check if selected element is inside a flex parent
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      const transformEl = transformRef.current;
      if (transformEl) {
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
        if (el?.parentElement) {
          const parent = el.parentElement;
          const parentId = parent.getAttribute("data-z10-id");
          if (parentId) {
            const parentDisplay = window.getComputedStyle(parent).display;
            if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
              const pr = computeElementRect(parentId);
              setFlexParentRect(pr);
            } else {
              setFlexParentRect(null);
            }
          } else {
            setFlexParentRect(null);
          }
        } else {
          setFlexParentRect(null);
        }
      }
    } else {
      setFlexParentRect(null);
    }
  }, [selectedIds, view.scale, computeElementRect, transformRef]);

  // ─── Hover tracking ──────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Clear any layer-panel hover when the user is mousing over the canvas
      if (hoveredLayerId) setHoveredLayerId(null);

      if (dragMode.type !== "none" || spaceHeld || activeTool === "hand") {
        setHoveredId(null);
        setHoverRect(null);
        setHoverChildRects([]);
        return;
      }

      let target = e.target as HTMLElement;
      let foundId: string | null = null;

      while (target && target !== canvasRef.current) {
        const id = target.getAttribute("data-z10-id");
        if (id) {
          foundId = id;
          break;
        }
        target = target.parentElement!;
      }

      if (foundId && !selectedIds.has(foundId)) {
        setHoveredId(foundId);
        const rect = computeElementRect(foundId);
        setHoverRect(rect);

        // Compute child rects for dashed border highlight
        const transformEl = transformRef.current;
        if (transformEl) {
          const parentEl = transformEl.querySelector(`[data-z10-id="${foundId}"]`);
          if (parentEl) {
            const childRects: Rect[] = [];
            for (const child of Array.from(parentEl.children)) {
              const childId = child.getAttribute("data-z10-id");
              if (childId) {
                const cr = computeElementRect(childId);
                if (cr) childRects.push(cr);
              }
            }
            setHoverChildRects(childRects);
          } else {
            setHoverChildRects([]);
          }
        }
      } else {
        setHoveredId(null);
        setHoverRect(null);
        setHoverChildRects([]);
      }
    },
    [dragMode.type, spaceHeld, activeTool, selectedIds, computeElementRect, transformRef, hoveredLayerId, setHoveredLayerId]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
    setHoverRect(null);
    setHoverChildRects([]);
  }, []);

  // ─── Hover from layers panel ───────────────────────────────
  // When hoveredLayerId is set from the layers panel, compute the rect
  // to show the hover overlay and pan to bring the element into view.
  useEffect(() => {
    if (!hoveredLayerId) {
      setHoveredId(null);
      setHoverRect(null);
      setHoverChildRects([]);
      return;
    }

    // Skip if already selected (selection overlay takes precedence)
    if (selectedIds.has(hoveredLayerId)) return;

    setHoveredId(hoveredLayerId);
    const rect = computeElementRect(hoveredLayerId);
    if (!rect) return;

    setHoverRect(rect);

    // Compute child rects
    const transformEl = transformRef.current;
    if (transformEl) {
      const parentEl = transformEl.querySelector(`[data-z10-id="${hoveredLayerId}"]`);
      if (parentEl) {
        const childRects: Rect[] = [];
        for (const child of Array.from(parentEl.children)) {
          const childId = child.getAttribute("data-z10-id");
          if (childId) {
            const cr = computeElementRect(childId);
            if (cr) childRects.push(cr);
          }
        }
        setHoverChildRects(childRects);
      }
    }

    // Pan to bring element into view if it's off-screen
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const margin = 60; // px margin from edge

    // Element position in screen coordinates
    const elScreenLeft = rect.x * view.scale + view.x;
    const elScreenTop = rect.y * view.scale + view.y;
    const elScreenRight = (rect.x + rect.w) * view.scale + view.x;
    const elScreenBottom = (rect.y + rect.h) * view.scale + view.y;

    let dx = 0;
    let dy = 0;

    if (elScreenRight < margin) {
      dx = margin - elScreenLeft;
    } else if (elScreenLeft > canvasRect.width - margin) {
      dx = canvasRect.width - margin - elScreenRight;
    }

    if (elScreenBottom < margin) {
      dy = margin - elScreenTop;
    } else if (elScreenTop > canvasRect.height - margin) {
      dy = canvasRect.height - margin - elScreenBottom;
    }

    if (dx !== 0 || dy !== 0) {
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }, [hoveredLayerId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only react to hoveredLayerId changes

  // ─── Find z10 element at click ────────────────────────────────
  const findZ10Id = useCallback(
    (target: HTMLElement): string | null => {
      let el = target;
      while (el && el !== canvasRef.current) {
        const id = el.getAttribute("data-z10-id");
        if (id) return id;
        el = el.parentElement!;
      }
      return null;
    },
    []
  );

  // ─── Click to select element / create frame/text ───────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode.type === "pan" || dragMode.type === "move" || dragMode.type === "resize" || dragMode.type === "rotate" || dragMode.type === "marquee") return;
      if (spaceHeld || activeTool === "hand") return;
      // Skip click immediately after a drag ended (resize/rotate/move)
      if (dragJustEnded.current) {
        dragJustEnded.current = false;
        return;
      }

      // If editing text, click outside commits and stops further processing
      if (editingTextId) {
        const editingEl = transformRef.current?.querySelector(
          `[data-z10-id="${editingTextId}"]`
        ) as HTMLElement;
        if (editingEl && !editingEl.contains(e.target as Node)) {
          editingEl.blur();
        }
        return;
      }

      const foundId = findZ10Id(e.target as HTMLElement);

      // Text tool: create new text element
      if (activeTool === "text") {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const cx = Math.round((e.clientX - canvasRect.left - view.x) / view.scale);
        const cy = Math.round((e.clientY - canvasRect.top - view.y) / view.scale);
        const newId = `text_${Date.now()}`;
        const transformEl = transformRef.current;
        if (!transformEl || !activePageId) return;

        // Determine parent: clicked element or page
        let parentId = activePageId;
        let relX = cx;
        let relY = cy;
        if (foundId) {
          parentId = foundId;
          // Calculate position relative to the clicked element
          const parentEl = transformEl.querySelector(`[data-z10-id="${foundId}"]`) as HTMLElement;
          if (parentEl) {
            const parentRect = parentEl.getBoundingClientRect();
            const canvasR = canvasRef.current!.getBoundingClientRect();
            relX = Math.round((e.clientX - parentRect.left) / view.scale);
            relY = Math.round((e.clientY - parentRect.top) / view.scale);
          }
        }

        // Create in live DOM
        const parentEl = transformEl.querySelector(`[data-z10-id="${parentId}"]`);
        if (!parentEl) return;

        const newEl = document.createElement("p");
        newEl.setAttribute("data-z10-id", newId);
        newEl.setAttribute("style", `position: absolute; left: ${relX}px; top: ${relY}px; font-size: 16px; color: #000000;`);
        newEl.textContent = "Text";
        parentEl.appendChild(newEl);

        // Serialize back to content
        const parser = new DOMParser();
        const doc = parser.parseFromString(content || "", "text/html");
        const targetParent = doc.querySelector(`[data-z10-id="${parentId}"]`);
        if (targetParent) {
          const cloned = doc.createElement("p");
          cloned.setAttribute("data-z10-id", newId);
          cloned.setAttribute("style", newEl.getAttribute("style") || "");
          cloned.textContent = "Text";
          targetParent.appendChild(cloned);
          updateContent(`<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`);
        }

        select(newId);
        setActiveTool("select");
        return;
      }

      // Frame tool: create new frame at click position (only on empty canvas)
      if (activeTool === "frame" && !foundId) {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const cx = Math.round((e.clientX - canvasRect.left - view.x) / view.scale);
        const cy = Math.round((e.clientY - canvasRect.top - view.y) / view.scale);
        const newId = `frame_${Date.now()}`;

        const transformEl = transformRef.current;
        if (transformEl && activePageId) {
          const pageEl = transformEl.querySelector(`[data-z10-id="${activePageId}"]`);
          if (pageEl) {
            const newEl = document.createElement("div");
            newEl.setAttribute("data-z10-id", newId);
            newEl.setAttribute("style", `position: absolute; left: ${cx}px; top: ${cy}px; width: 200px; height: 150px; display: flex; background-color: #ffffff; border-radius: 8px;`);
            pageEl.appendChild(newEl);

            const parser = new DOMParser();
            const doc = parser.parseFromString(content || "", "text/html");
            const targetPage = doc.querySelector(`[data-z10-id="${activePageId}"]`);
            if (targetPage) {
              const cloned = doc.createElement("div");
              cloned.setAttribute("data-z10-id", newId);
              cloned.setAttribute("style", newEl.getAttribute("style") || "");
              targetPage.appendChild(cloned);
              updateContent(`<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`);
            }

            select(newId);
            setActiveTool("select");
          }
        }
        return;
      }

      if (foundId) {
        select(foundId, e.shiftKey);
      } else {
        clearSelection();
      }
    },
    [dragMode.type, spaceHeld, activeTool, findZ10Id, select, clearSelection, view, transformRef, content, updateContent, setActiveTool, activePageId, editingTextId]
  );

  // ─── Escape to deselect (or exit text editing) ─────────────
  // ─── Enter to start text editing on selected text element ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (editingTextId) {
          const el = transformRef.current?.querySelector(
            `[data-z10-id="${editingTextId}"]`
          ) as HTMLElement;
          if (el) el.blur();
          return;
        }
        clearSelection();
      }

      // Enter on a selected text element → start editing
      if (e.key === "Enter" && !editingTextId && activeTool === "select") {
        if (selectedIds.size !== 1) return;
        const id = selectedIds.values().next().value as string;
        const transformEl = transformRef.current;
        if (!transformEl) return;
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
        if (!el) return;

        if (isTextEditable(el)) {
          e.preventDefault();
          startTextEdit(id);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, editingTextId, transformRef, activeTool, selectedIds, startTextEdit]);

  // ─── Double-click to edit text inline ─────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== "select") return;
      const foundId = findZ10Id(e.target as HTMLElement);
      if (!foundId) return;

      const transformEl = transformRef.current;
      if (!transformEl) return;
      const el = transformEl.querySelector(`[data-z10-id="${foundId}"]`) as HTMLElement;
      if (!el) return;

      if (isTextEditable(el)) {
        e.stopPropagation();
        e.preventDefault();
        startTextEdit(foundId);
      }
    },
    [activeTool, findZ10Id, transformRef, startTextEdit]
  );

  // ─── Double-click on SelectionOverlay to edit text ─────────
  const handleOverlayDoubleClick = useCallback(
    (e: React.MouseEvent, elementId: string) => {
      if (activeTool !== "select") return;
      const transformEl = transformRef.current;
      if (!transformEl) return;
      const el = transformEl.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement;
      if (!el) return;

      if (isTextEditable(el)) {
        e.stopPropagation();
        e.preventDefault();
        startTextEdit(elementId);
      }
    },
    [activeTool, transformRef, startTextEdit]
  );

  // ─── Manage contentEditable when editingTextId changes ────
  useEffect(() => {
    if (!editingTextId) return;

    const transformEl = transformRef.current;
    if (!transformEl) return;
    const el = transformEl.querySelector(`[data-z10-id="${editingTextId}"]`) as HTMLElement;
    if (!el) return;

    // Make editable
    el.contentEditable = "true";
    el.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    // Visual indicator
    el.style.outline = `2px solid ${SELECTION_COLOR}`;
    el.style.outlineOffset = "2px";
    el.style.cursor = "text";

    const capturedId = editingTextId;

    function handleBlur() {
      el.contentEditable = "false";
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.cursor = "";

      // Persist the edited text to serialized content
      const newText = el.textContent || "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(content || "", "text/html");
      const target = doc.querySelector(`[data-z10-id="${capturedId}"]`) as HTMLElement;
      if (target) {
        target.textContent = newText;
        updateContent(
          `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`
        );
      }

      commitTextEdit();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      }
      // Stop propagation so tool shortcuts / delete / arrow keys don't fire
      e.stopPropagation();
    }

    el.addEventListener("blur", handleBlur);
    el.addEventListener("keydown", handleKeyDown);

    return () => {
      el.removeEventListener("blur", handleBlur);
      el.removeEventListener("keydown", handleKeyDown);
      el.contentEditable = "false";
    };
  }, [editingTextId, transformRef, commitTextEdit, content, updateContent]);

  // ─── Zoom around point ─────────────────────────────────────
  const zoomAtPoint = useCallback(
    (cx: number, cy: number, factor: number) => {
      setView((v) => {
        const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
        const ratio = newScale / v.scale;
        return {
          scale: newScale,
          x: cx - (cx - v.x) * ratio,
          y: cy - (cy - v.y) * ratio,
        };
      });
    },
    []
  );

  // ─── Wheel: scroll to pan, pinch/Cmd+scroll to zoom ───────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.pow(ZOOM_STEP, -e.deltaY / 100);
        const rect = el.getBoundingClientRect();
        zoomAtPoint(e.clientX - rect.left, e.clientY - rect.top, factor);
      } else {
        setView((v) => ({
          ...v,
          x: v.x - e.deltaX,
          y: v.y - e.deltaY,
        }));
      }
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomAtPoint]);

  // ─── Space key for hand tool ───────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (editingTextId) return; // Don't hijack space when editing text
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setDragMode({ type: "none" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [editingTextId]);

  // ─── Arrow keys to nudge selected elements ─────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (editingTextId) return; // Don't hijack arrows when editing text
      if (selectedIds.size === 0) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;

      e.preventDefault();
      const transformEl = transformRef.current;
      if (!transformEl) return;

      for (const id of selectedIds) {
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
        if (!el) continue;
        const computedPos = window.getComputedStyle(el).position;
        const isAbsolute = computedPos === "absolute" || computedPos === "fixed";

        if (isAbsolute) {
          const curLeft = parseFloat(el.style.left) || 0;
          const curTop = parseFloat(el.style.top) || 0;
          updateElementStyle(id, {
            left: `${curLeft + dx}px`,
            top: `${curTop + dy}px`,
          });
        } else {
          // Flow items: nudge via translate
          const cur = el.style.translate || "0px 0px";
          const parts = cur.split(/\s+/);
          const curX = parseFloat(parts[0]) || 0;
          const curY = parseFloat(parts[1]) || 0;
          updateElementStyle(id, {
            translate: `${curX + dx}px ${curY + dy}px`,
          });
        }
      }
      // Recompute rects
      requestAnimationFrame(() => {
        const rects = new Map<string, Rect>();
        for (const id of selectedIds) {
          const rect = computeElementRect(id);
          if (rect) rects.set(id, rect);
        }
        setSelectionRects(rects);
      });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, transformRef, updateElementStyle, computeElementRect, editingTextId]);

  // ─── Pointer interactions: pan, move, resize, marquee ──────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Pan: middle click or space/hand+left click
      if (e.button === 1 || ((spaceHeld || activeTool === "hand") && e.button === 0)) {
        e.preventDefault();
        setDragMode({
          type: "pan",
          startX: e.clientX,
          startY: e.clientY,
          viewX: view.x,
          viewY: view.y,
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // Left click in select mode (skip if editing text inline)
      if (e.button === 0 && activeTool === "select" && !editingTextId) {
        const foundId = findZ10Id(e.target as HTMLElement);

        if (foundId) {
          // Click on an element → select it and immediately start move drag
          if (!e.shiftKey) {
            // Replace selection (unless shift-clicking to add)
            select(foundId, false);
          } else {
            select(foundId, true);
          }

          const transformEl = transformRef.current;
          if (transformEl) {
            const targetIds = e.shiftKey ? new Set([...selectedIds, foundId]) : new Set([foundId]);
            const isAltClone = e.altKey;
            const originals = new Map<string, OrigInfo>();
            const clonedIds = new Map<string, string>();

            for (const id of targetIds) {
              const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
              if (!el) continue;

              if (isAltClone) {
                const clone = el.cloneNode(true) as HTMLElement;
                const newId = `${id}_clone_${Date.now().toString(36)}`;
                clone.setAttribute("data-z10-id", newId);
                el.parentElement?.insertBefore(clone, el.nextSibling);
                clonedIds.set(id, newId);
              }

              const computedPos = window.getComputedStyle(el).position;
              const isAbsolute = computedPos === "absolute" || computedPos === "fixed";
              originals.set(id, {
                left: parseFloat(el.style.left) || 0,
                top: parseFloat(el.style.top) || 0,
                isAbsolute,
                parentId: el.parentElement?.getAttribute("data-z10-id") || null,
              });
            }

            setDragMode({
              type: "move",
              startX: e.clientX,
              startY: e.clientY,
              originals,
              isClone: isAltClone,
              clonedIds: isAltClone ? clonedIds : undefined,
            });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        } else {
          // Click on empty canvas → start marquee selection
          const canvasRect = canvasRef.current?.getBoundingClientRect();
          if (canvasRect) {
            const cx = (e.clientX - canvasRect.left - view.x) / view.scale;
            const cy = (e.clientY - canvasRect.top - view.y) / view.scale;
            setDragMode({ type: "marquee", startX: cx, startY: cy });
            setMarqueeRect({ x1: cx, y1: cy, x2: cx, y2: cy });
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        }
      }
    },
    [spaceHeld, activeTool, view.x, view.y, view.scale, findZ10Id, selectedIds, select, transformRef, editingTextId]
  );

  const handlePointerMove_drag = useCallback(
    (e: ReactPointerEvent) => {
      if (dragMode.type === "none") return;

      if (dragMode.type === "pan") {
        const dx = e.clientX - dragMode.startX;
        const dy = e.clientY - dragMode.startY;
        setView((v) => ({
          ...v,
          x: dragMode.viewX + dx,
          y: dragMode.viewY + dy,
        }));
        return;
      }

      if (dragMode.type === "move") {
        let dx = (e.clientX - dragMode.startX) / view.scale;
        let dy = (e.clientY - dragMode.startY) / view.scale;

        // Shift constrains to horizontal or vertical axis
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }

        const transformEl = transformRef.current;
        if (!transformEl) return;

        for (const id of selectedIds) {
          const orig = dragMode.originals.get(id);
          if (!orig) continue;
          const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
          if (!el) continue;

          if (orig.isAbsolute) {
            el.style.left = `${orig.left + dx}px`;
            el.style.top = `${orig.top + dy}px`;
          } else {
            // Flow items: use translate for visual movement
            el.style.translate = `${dx}px ${dy}px`;
          }
        }

        // Update visual rects
        const rects = new Map<string, Rect>();
        for (const id of selectedIds) {
          const rect = computeElementRect(id);
          if (rect) rects.set(id, rect);
        }
        setSelectionRects(rects);

        // Compute drop target based on cursor position (only after meaningful drag distance)
        const totalDrag = Math.abs(dx) + Math.abs(dy);
        if (totalDrag > 5) {
          const canvasRect = canvasRef.current?.getBoundingClientRect();
          if (canvasRect) {
            const cursorX = (e.clientX - canvasRect.left - view.x) / view.scale;
            const cursorY = (e.clientY - canvasRect.top - view.y) / view.scale;
            // Get source parent from the first dragged element's originals
            const firstOrig = dragMode.originals.values().next().value as OrigInfo | undefined;
            const sourceParentId = firstOrig?.parentId ?? null;
            const dt = computeDropTarget(cursorX, cursorY, selectedIds, sourceParentId);
            setDropTarget(dt);
          }
        } else {
          setDropTarget(null);
        }
        return;
      }

      if (dragMode.type === "resize") {
        const dx = (e.clientX - dragMode.startX) / view.scale;
        const dy = (e.clientY - dragMode.startY) / view.scale;
        const { origRect, handleIndex, elementId } = dragMode;

        let newX = origRect.x, newY = origRect.y;
        let newW = origRect.w, newH = origRect.h;

        // Handle index: 0=NW, 1=NE, 2=SW, 3=SE, 4=N, 5=S, 6=W, 7=E
        switch (handleIndex) {
          case 0: newX += dx; newY += dy; newW -= dx; newH -= dy; break; // NW
          case 1: newY += dy; newW += dx; newH -= dy; break; // NE
          case 2: newX += dx; newW -= dx; newH += dy; break; // SW
          case 3: newW += dx; newH += dy; break; // SE
          case 4: newY += dy; newH -= dy; break; // N
          case 5: newH += dy; break; // S
          case 6: newX += dx; newW -= dx; break; // W
          case 7: newW += dx; break; // E
        }

        // Enforce minimum size
        if (newW < 10) { newW = 10; }
        if (newH < 10) { newH = 10; }

        const transformEl = transformRef.current;
        if (!transformEl) return;
        const el = transformEl.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement;
        if (!el) return;

        el.style.width = `${Math.round(newW)}px`;
        el.style.height = `${Math.round(newH)}px`;
        if (handleIndex <= 2 || handleIndex === 4 || handleIndex === 6) {
          el.style.left = `${Math.round(newX)}px`;
        }
        if (handleIndex <= 1 || handleIndex === 4) {
          el.style.top = `${Math.round(newY)}px`;
        }

        // Update visual rect
        const updatedRect = computeElementRect(elementId);
        if (updatedRect) {
          setSelectionRects(new Map([[elementId, updatedRect]]));
        }
        return;
      }

      if (dragMode.type === "rotate") {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const mx = (e.clientX - canvasRect.left - view.x) / view.scale;
        const my = (e.clientY - canvasRect.top - view.y) / view.scale;
        const angle = Math.atan2(my - dragMode.centerY, mx - dragMode.centerX) * (180 / Math.PI);
        const deltaAngle = angle - dragMode.startAngle;
        let newRotation = dragMode.origRotation + deltaAngle;
        // Snap to 15° increments when shift held
        if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
        // Round to 1 decimal
        newRotation = Math.round(newRotation * 10) / 10;

        const transformEl = transformRef.current;
        if (!transformEl) return;
        const el = transformEl.querySelector(`[data-z10-id="${dragMode.elementId}"]`) as HTMLElement;
        if (el) el.style.rotate = `${newRotation}deg`;
        return;
      }

      if (dragMode.type === "marquee") {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (!canvasRect) return;
        const cx = (e.clientX - canvasRect.left - view.x) / view.scale;
        const cy = (e.clientY - canvasRect.top - view.y) / view.scale;
        setMarqueeRect({ x1: dragMode.startX, y1: dragMode.startY, x2: cx, y2: cy });
        return;
      }
    },
    [dragMode, view.scale, selectedIds, transformRef, computeElementRect, view.x, view.y, computeDropTarget]
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      // Mark that a drag just ended to prevent click from clearing selection
      if (dragMode.type === "move" || dragMode.type === "resize" || dragMode.type === "rotate") {
        dragJustEnded.current = true;
        // Reset after a tick so normal clicks still work
        requestAnimationFrame(() => { setTimeout(() => { dragJustEnded.current = false; }, 0); });
      }

      if (dragMode.type === "move") {
        const dx = (e.clientX - dragMode.startX) / view.scale;
        const dy = (e.clientY - dragMode.startY) / view.scale;
        const transformEl = transformRef.current;

        if (dropTarget && transformEl) {
          // ── Reparent: drop into a new container or reorder in flow ──
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "text/html");

          for (const id of selectedIds) {
            const liveEl = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
            const docEl = doc.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
            if (!liveEl || !docEl) continue;

            // Clear drag translate
            liveEl.style.removeProperty("translate");

            if (dropTarget.kind === "flow-insert") {
              const liveContainer = transformEl.querySelector(`[data-z10-id="${dropTarget.containerId}"]`) as HTMLElement | null;
              const docContainer = doc.querySelector(`[data-z10-id="${dropTarget.containerId}"]`) as HTMLElement | null;
              if (!liveContainer || !docContainer) continue;

              // Remove from old parent
              liveEl.parentElement?.removeChild(liveEl);
              docEl.parentElement?.removeChild(docEl);

              // Strip absolute positioning, translate for flow insertion
              liveEl.style.removeProperty("position");
              liveEl.style.removeProperty("left");
              liveEl.style.removeProperty("top");
              liveEl.style.removeProperty("translate");
              docEl.style.removeProperty("position");
              docEl.style.removeProperty("left");
              docEl.style.removeProperty("top");
              docEl.style.removeProperty("translate");

              // Get flow children (excluding dragged)
              const liveChildren = Array.from(liveContainer.children).filter(c => {
                const cid = c.getAttribute("data-z10-id");
                return cid && !selectedIds.has(cid);
              });
              const docChildren = Array.from(docContainer.children).filter(c => {
                const cid = c.getAttribute("data-z10-id");
                return cid && !selectedIds.has(cid);
              });

              const refLive = liveChildren[dropTarget.index] || null;
              const refDoc = docChildren[dropTarget.index] || null;

              if (refLive) liveContainer.insertBefore(liveEl, refLive);
              else liveContainer.appendChild(liveEl);
              if (refDoc) docContainer.insertBefore(docEl, refDoc);
              else docContainer.appendChild(docEl);

            } else if (dropTarget.kind === "into-container") {
              const liveContainer = transformEl.querySelector(`[data-z10-id="${dropTarget.containerId}"]`) as HTMLElement | null;
              const docContainer = doc.querySelector(`[data-z10-id="${dropTarget.containerId}"]`) as HTMLElement | null;
              if (!liveContainer || !docContainer) continue;

              // Check if target is a flow container
              const targetDisplay = window.getComputedStyle(liveContainer).display;
              const targetIsFlow = targetDisplay === "flex" || targetDisplay === "inline-flex" ||
                                   targetDisplay === "grid" || targetDisplay === "inline-grid";

              // Capture position before removing from DOM
              const elRect = computeElementRect(id);
              const cRect = computeElementRect(dropTarget.containerId);

              liveEl.parentElement?.removeChild(liveEl);
              docEl.parentElement?.removeChild(docEl);

              if (targetIsFlow) {
                // Entering flow: strip absolute
                liveEl.style.removeProperty("position");
                liveEl.style.removeProperty("left");
                liveEl.style.removeProperty("top");
                liveEl.style.removeProperty("translate");
                docEl.style.removeProperty("position");
                docEl.style.removeProperty("left");
                docEl.style.removeProperty("top");
                docEl.style.removeProperty("translate");
              } else {
                // Entering non-flow container: make absolute, set position relative to container
                if (elRect && cRect) {
                  const relX = elRect.x - cRect.x;
                  const relY = elRect.y - cRect.y;
                  liveEl.style.position = "absolute";
                  liveEl.style.left = `${Math.round(relX)}px`;
                  liveEl.style.top = `${Math.round(relY)}px`;
                  liveEl.style.removeProperty("translate");
                  docEl.style.position = "absolute";
                  docEl.style.left = `${Math.round(relX)}px`;
                  docEl.style.top = `${Math.round(relY)}px`;
                  docEl.style.removeProperty("translate");
                }
              }

              liveContainer.appendChild(liveEl);
              docContainer.appendChild(docEl);
            }
          }

          // Serialize updated doc
          const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
          updateContent(result);

        } else {
          // ── No drop target: simple position commit ──
          for (const id of selectedIds) {
            const orig = dragMode.originals.get(id);
            if (!orig) continue;

            if (orig.isAbsolute) {
              updateElementStyle(id, {
                left: `${Math.round(orig.left + dx)}px`,
                top: `${Math.round(orig.top + dy)}px`,
              });
            } else {
              // Flow items: commit the translate
              updateElementStyle(id, {
                translate: `${Math.round(dx)}px ${Math.round(dy)}px`,
              });
            }
          }
        }

        // Alt-drag clone: commit cloned elements to the content model
        if (dragMode.isClone && dragMode.clonedIds) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "text/html");
          for (const [origId, cloneId] of dragMode.clonedIds) {
            const origEl = doc.querySelector(`[data-z10-id="${origId}"]`) as HTMLElement | null;
            if (!origEl || !origEl.parentElement) continue;
            const cloneEl = origEl.cloneNode(true) as HTMLElement;
            cloneEl.setAttribute("data-z10-id", cloneId);
            const orig = dragMode.originals.get(origId);
            if (orig && orig.isAbsolute) {
              cloneEl.style.left = `${Math.round(orig.left)}px`;
              cloneEl.style.top = `${Math.round(orig.top)}px`;
            }
            origEl.parentElement.insertBefore(cloneEl, origEl.nextSibling);
          }
          const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
          updateContent(result);
        }

        setDropTarget(null);
      }

      if (dragMode.type === "resize") {
        // Commit resize to the content model
        const { elementId } = dragMode;
        const transformEl = transformRef.current;
        if (transformEl) {
          const el = transformEl.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement;
          if (el) {
            updateElementStyle(elementId, {
              width: el.style.width,
              height: el.style.height,
              ...(el.style.left ? { left: el.style.left } : {}),
              ...(el.style.top ? { top: el.style.top } : {}),
            });
          }
        }
      }

      if (dragMode.type === "rotate") {
        // Commit rotation to the content model
        const { elementId } = dragMode;
        const transformEl = transformRef.current;
        if (transformEl) {
          const el = transformEl.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement;
          if (el && el.style.rotate) {
            updateElementStyle(elementId, { rotate: el.style.rotate });
          }
        }
      }

      if (dragMode.type === "marquee" && marqueeRect) {
        // Find all elements within the marquee
        const x1 = Math.min(marqueeRect.x1, marqueeRect.x2);
        const y1 = Math.min(marqueeRect.y1, marqueeRect.y2);
        const x2 = Math.max(marqueeRect.x1, marqueeRect.x2);
        const y2 = Math.max(marqueeRect.y1, marqueeRect.y2);

        const transformEl = transformRef.current;
        if (transformEl) {
          const allElements = transformEl.querySelectorAll("[data-z10-id]");
          let firstSelected = false;
          allElements.forEach((el) => {
            const id = el.getAttribute("data-z10-id");
            if (!id) return;
            const rect = computeElementRect(id);
            if (!rect) return;
            // Check if element intersects marquee
            if (rect.x + rect.w > x1 && rect.x < x2 && rect.y + rect.h > y1 && rect.y < y2) {
              select(id, firstSelected); // first without shift, rest with shift
              firstSelected = true;
            }
          });
          if (!firstSelected) {
            clearSelection();
          }
        }
        setMarqueeRect(null);
      }

      setDragMode({ type: "none" });
    },
    [dragMode, view.scale, view.x, view.y, selectedIds, transformRef, updateElementStyle, marqueeRect, computeElementRect, select, clearSelection, content, updateContent, dropTarget]
  );

  // ─── Handle resize handle mousedown ──────────────────────────
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, handleIndex: number, elementId: string, rect: Rect) => {
      e.stopPropagation();
      e.preventDefault();
      setDragMode({
        type: "resize",
        startX: e.clientX,
        startY: e.clientY,
        handleIndex,
        origRect: { ...rect },
        elementId,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  // ─── Handle rotation start ──────────────────────────────────
  const handleRotateStart = useCallback(
    (e: React.PointerEvent, elementId: string, rect: Rect) => {
      e.stopPropagation();
      e.preventDefault();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const centerX = rect.x + rect.w / 2;
      const centerY = rect.y + rect.h / 2;
      const mx = (e.clientX - canvasRect.left - view.x) / view.scale;
      const my = (e.clientY - canvasRect.top - view.y) / view.scale;
      const startAngle = Math.atan2(my - centerY, mx - centerX) * (180 / Math.PI);

      // Get current rotation
      const transformEl = transformRef.current;
      let origRotation = 0;
      if (transformEl) {
        const el = transformEl.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement;
        if (el) {
          origRotation = parseFloat(el.style.rotate) || 0;
        }
      }

      setDragMode({
        type: "rotate",
        centerX,
        centerY,
        startAngle,
        origRotation,
        elementId,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [view.x, view.y, view.scale, transformRef]
  );

  // ─── Handle move start (on selection box) ─────────────────────
  const handleMoveStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const transformEl = transformRef.current;
      if (!transformEl) return;

      const isAltClone = e.altKey;
      const originals = new Map<string, OrigInfo>();
      const clonedIds = new Map<string, string>(); // original → clone

      for (const id of selectedIds) {
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
        if (!el) continue;

        if (isAltClone) {
          // Clone the element in the live DOM
          const clone = el.cloneNode(true) as HTMLElement;
          const newId = `${id}_clone_${Date.now().toString(36)}`;
          clone.setAttribute("data-z10-id", newId);
          el.parentElement?.insertBefore(clone, el.nextSibling);
          clonedIds.set(id, newId);
          // The clone stays at the original position; we move the originals
        }

        const computedPos = window.getComputedStyle(el).position;
        const isAbsolute = computedPos === "absolute" || computedPos === "fixed";
        originals.set(id, {
          left: parseFloat(el.style.left) || 0,
          top: parseFloat(el.style.top) || 0,
          isAbsolute,
          parentId: el.parentElement?.getAttribute("data-z10-id") || null,
        });
      }

      setDragMode({
        type: "move",
        startX: e.clientX,
        startY: e.clientY,
        originals,
        isClone: isAltClone,
        clonedIds: isAltClone ? clonedIds : undefined,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [selectedIds, transformRef]
  );

  // ─── Zoom controls ────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtPoint(rect.width / 2, rect.height / 2, ZOOM_STEP);
  }, [zoomAtPoint]);

  const zoomOut = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtPoint(rect.width / 2, rect.height / 2, 1 / ZOOM_STEP);
  }, [zoomAtPoint]);

  const zoomToFit = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !activePage) return;

    const contentW = activePage.width;
    const contentH = activePage.height;
    const padding = 80;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;
    const scale = Math.min(availW / contentW, availH / contentH, 1);

    setView({
      scale,
      x: (rect.width - contentW * scale) / 2,
      y: (rect.height - contentH * scale) / 2,
    });
  }, [activePage]);

  const zoomTo100 = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((v) => {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const canvasX = (cx - v.x) / v.scale;
      const canvasY = (cy - v.y) / v.scale;
      return { scale: 1, x: cx - canvasX, y: cy - canvasY };
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "!" || (e.shiftKey && e.key === "1")) {
        e.preventDefault();
        zoomToFit();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        zoomTo100();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomToFit, zoomTo100]);

  // Track current view in a ref so page-switch can save without re-triggering
  const viewRef = useRef(view);
  viewRef.current = view;

  // Ref to zoomToFit so the page-switch effect doesn't depend on it
  const zoomToFitRef = useRef(zoomToFit);
  zoomToFitRef.current = zoomToFit;

  // Restore saved view or zoom-to-fit when active page changes
  const prevPageId = useRef<string | null>(null);
  const activePageId_ = activePage?.id ?? null;
  useEffect(() => {
    if (!activePageId_) return;
    if (prevPageId.current === activePageId_) return;
    // Save outgoing page's view before switching
    if (prevPageId.current) {
      saveViewForPage(projectId, prevPageId.current, viewRef.current);
    }
    prevPageId.current = activePageId_;
    const saved = loadViewForPage(projectId, activePageId_);
    if (saved) {
      setView(saved);
      viewInitialized.current = true;
    } else {
      // Use a short delay so canvasRef is measured correctly
      const timer = setTimeout(() => {
        zoomToFitRef.current();
        viewInitialized.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activePageId_, projectId]);

  // Persist view to localStorage (debounced) — skip until first restore/fit
  const viewSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!activePageId_ || !viewInitialized.current) return;
    clearTimeout(viewSaveTimer.current);
    viewSaveTimer.current = setTimeout(() => {
      saveViewForPage(projectId, activePageId_, view);
    }, 300);
    return () => clearTimeout(viewSaveTimer.current);
  }, [view, activePageId_, projectId]);

  const zoomPercent = Math.round(view.scale * 100);
  const isPanning = dragMode.type === "pan";

  // ─── Cursor ────────────────────────────────────────────────
  let cursor = "default";
  if (spaceHeld || isPanning || activeTool === "hand") cursor = isPanning ? "grabbing" : "grab";
  else if (activeTool === "text") cursor = "text";
  else if (activeTool === "frame") cursor = "crosshair";
  else if (dragMode.type === "move") cursor = "move";
  else if (dragMode.type === "rotate") cursor = "grabbing";

  return (
    <main className="relative h-full" style={{ overflow: "clip", backgroundColor: activePage?.bgColor || "var(--ed-canvas-bg)" }}>
      {/* Save indicator */}
      <div className="absolute left-3 top-3 z-10">
        <span
          className="text-[12px]"
          style={{
            color: saveState === "saved"
              ? "var(--ed-text-tertiary)"
              : saveState === "saving"
                ? "#eab308"
                : "#f97316",
          }}
        >
          {saveState === "saved"
            ? "Saved"
            : saveState === "saving"
              ? "Saving..."
              : "Unsaved changes"}
        </span>
      </div>

      {/* Infinite canvas surface */}
      <div
        ref={canvasRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove_drag}
        onPointerUp={handlePointerUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* Transform layer */}
        <div
          ref={transformRef}
          style={{
            transformOrigin: "0 0",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            willChange: "transform",
            width: 0,
            height: 0,
            overflow: "visible",
          }}
        >
          {editingComponentName ? (
            <div
              key={`component-${editingComponentName}`}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              {/* Component label with back button */}
              <div className="flex items-center gap-2 whitespace-nowrap" style={{ fontSize: 13, marginBottom: 8 }}>
                <button
                  onClick={exitComponentEditMode}
                  className="text-[12px] transition-colors hover:opacity-80"
                  style={{ color: COMPONENT_COLOR }}
                >
                  ← Back
                </button>
                <span style={{ color: "var(--ed-text-tertiary)" }}>|</span>
                <span className="font-medium" style={{ color: COMPONENT_COLOR }}>
                  {editingComponentName}
                </span>
              </div>
              {/* Component template preview */}
              <ComponentPreview
                componentName={editingComponentName}
                componentTemplates={componentTemplatesRef.current}
              />
            </div>
          ) : activePage ? (
            <div
              key={activePage.id}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              {/* Page label */}
              <div
                className="whitespace-nowrap text-xs font-medium"
                style={{ fontSize: 13, marginBottom: 8, color: "var(--ed-text-secondary)" }}
              >
                {activePage.name}
              </div>
              {/* Full page HTML — memoized to prevent DOM replacement during interactions */}
              <PageContent html={activePage.outerHTML} componentTemplates={componentTemplatesRef.current} />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-sm"
              style={{ position: "absolute", left: 0, top: 0, width: 1440, height: 900, backgroundColor: "var(--ed-panel-bg)" }}
            >
              <p style={{ color: "var(--ed-text-tertiary)" }}>
                Empty project — connect an agent to start designing
              </p>
            </div>
          )}

          {/* ─── Hover outline ────────────────────────────── */}
          {hoverRect && hoveredId && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: hoverRect.x,
                top: hoverRect.y,
                width: hoverRect.w,
                height: hoverRect.h,
                border: `${1.5 / view.scale}px solid ${HOVER_COLOR}`,
                borderRadius: 1 / view.scale,
                opacity: 0.5,
              }}
            />
          )}

          {/* ─── Hover child outlines (dashed) ──────────────── */}
          {hoverChildRects.map((cr, i) => (
            <div
              key={`hc-${i}`}
              className="pointer-events-none absolute"
              style={{
                left: cr.x,
                top: cr.y,
                width: cr.w,
                height: cr.h,
                border: `${1 / view.scale}px dashed ${HOVER_COLOR}`,
                borderRadius: 1 / view.scale,
                opacity: 0.35,
              }}
            />
          ))}

          {/* ─── Flex parent outline (dotted) ────────────────── */}
          {flexParentRect && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: flexParentRect.x,
                top: flexParentRect.y,
                width: flexParentRect.w,
                height: flexParentRect.h,
                border: `${1.5 / view.scale}px dotted ${SELECTION_COLOR}`,
                borderRadius: 2 / view.scale,
                opacity: 0.4,
              }}
            />
          )}

          {/* ─── Selection overlays ─────────────────────────── */}
          {Array.from(selectionRects.entries()).map(([id, rect]) => {
            if (editingTextId === id) return null;
            // Detect component status from live DOM
            const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
            const isCustomEl = el ? el.tagName.includes("-") && el.tagName.toLowerCase().startsWith("z10-") : false;
            const compDef = el?.getAttribute("data-z10-component-def") ?? undefined;
            const isComp = isCustomEl || !!compDef || !!el?.getAttribute("data-z10-component");
            let compName: string | undefined;
            if (compDef) {
              compName = compDef;
            } else if (isCustomEl && el) {
              compName = tagNameToComponentName(el.tagName.toLowerCase()) ?? undefined;
            } else if (el?.getAttribute("data-z10-component")) {
              compName = el.getAttribute("data-z10-component") ?? undefined;
            }
            return (
              <SelectionOverlay
                key={id}
                elementId={id}
                rect={rect}
                scale={view.scale}
                onResizeStart={handleResizeStart}
                onMoveStart={handleMoveStart}
                onRotateStart={handleRotateStart}
                onDoubleClick={handleOverlayDoubleClick}
                isComponent={isComp}
                isComponentDef={!!compDef}
                componentName={compName}
              />
            );
          })}

          {/* ─── Drop target indicators ─────────────────────── */}
          {dropTarget && dropTarget.kind === "flow-insert" && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: dropTarget.lineRect.x,
                top: dropTarget.lineRect.y,
                width: dropTarget.lineRect.w,
                height: dropTarget.lineRect.h,
                backgroundColor: SELECTION_COLOR,
                borderRadius: 1 / view.scale,
                zIndex: 9999,
              }}
            />
          )}
          {dropTarget && dropTarget.kind === "into-container" && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: dropTarget.containerRect.x,
                top: dropTarget.containerRect.y,
                width: dropTarget.containerRect.w,
                height: dropTarget.containerRect.h,
                border: `${2 / view.scale}px dashed ${SELECTION_COLOR}`,
                borderRadius: 4 / view.scale,
                backgroundColor: `${SELECTION_COLOR}08`,
                zIndex: 9999,
              }}
            />
          )}

          {/* ─── Marquee selection ──────────────────────────── */}
          {marqueeRect && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: Math.min(marqueeRect.x1, marqueeRect.x2),
                top: Math.min(marqueeRect.y1, marqueeRect.y2),
                width: Math.abs(marqueeRect.x2 - marqueeRect.x1),
                height: Math.abs(marqueeRect.y2 - marqueeRect.y1),
                border: `${1 / view.scale}px solid ${SELECTION_COLOR}`,
                backgroundColor: `${SELECTION_COLOR}10`,
              }}
            />
          )}
        </div>
      </div>

      {/* Zoom controls — bottom right */}
      <div
        className="absolute bottom-4 right-4 z-10 flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-sm backdrop-blur"
        style={{
          backgroundColor: "var(--ed-overlay-bg)",
          borderColor: "var(--ed-overlay-border)",
        }}
      >
        <button
          onClick={zoomOut}
          className="rounded px-2 py-1 text-[12px] transition-colors"
          style={{ color: "var(--ed-text-secondary)" }}
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={zoomTo100}
          className="min-w-[3rem] rounded px-2 py-1 text-center text-[12px] transition-colors"
          style={{ color: "var(--ed-text-secondary)" }}
          title="Zoom to 100% (Cmd+0)"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={zoomIn}
          className="rounded px-2 py-1 text-[12px] transition-colors"
          style={{ color: "var(--ed-text-secondary)" }}
          title="Zoom in"
        >
          +
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: "var(--ed-section-border)" }} />
        <button
          onClick={zoomToFit}
          className="rounded px-2 py-1 text-[12px] transition-colors"
          style={{ color: "var(--ed-text-secondary)" }}
          title="Zoom to fit (Shift+1)"
        >
          Fit
        </button>
      </div>
    </main>
  );
}

// ─── Selection Overlay Component ──────────────────────────────

function SelectionOverlay({
  elementId,
  rect,
  scale,
  onResizeStart,
  onMoveStart,
  onRotateStart,
  onDoubleClick,
  isComponent,
  isComponentDef,
  componentName,
}: {
  elementId: string;
  rect: Rect;
  scale: number;
  onResizeStart: (e: React.PointerEvent, handleIndex: number, elementId: string, rect: Rect) => void;
  onMoveStart: (e: React.PointerEvent) => void;
  onRotateStart: (e: React.PointerEvent, elementId: string, rect: Rect) => void;
  onDoubleClick?: (e: React.MouseEvent, elementId: string) => void;
  isComponent?: boolean;
  isComponentDef?: boolean;
  componentName?: string;
}) {
  const color = isComponent || isComponentDef ? COMPONENT_COLOR : SELECTION_COLOR;
  const handleSize = 8 / scale;
  const borderWidth = 1.5 / scale;
  const labelFontSize = 11 / scale;
  const labelPad = 4 / scale;
  const rotateHandleOffset = 24 / scale;
  const rotateHandleSize = 10 / scale;

  const handles = [
    // Corners
    { cx: rect.x, cy: rect.y, cursor: "nwse-resize" },
    { cx: rect.x + rect.w, cy: rect.y, cursor: "nesw-resize" },
    { cx: rect.x, cy: rect.y + rect.h, cursor: "nesw-resize" },
    { cx: rect.x + rect.w, cy: rect.y + rect.h, cursor: "nwse-resize" },
    // Edge midpoints
    { cx: rect.x + rect.w / 2, cy: rect.y, cursor: "ns-resize" },
    { cx: rect.x + rect.w / 2, cy: rect.y + rect.h, cursor: "ns-resize" },
    { cx: rect.x, cy: rect.y + rect.h / 2, cursor: "ew-resize" },
    { cx: rect.x + rect.w, cy: rect.y + rect.h / 2, cursor: "ew-resize" },
  ];

  return (
    <>
      {/* Bounding box — draggable for move */}
      <div
        className="absolute"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          border: `${borderWidth}px ${isComponent && !isComponentDef ? 'dashed' : 'solid'} ${color}`,
          borderRadius: 1 / scale,
          cursor: "move",
        }}
        onPointerDown={onMoveStart}
        onDoubleClick={(e) => onDoubleClick?.(e, elementId)}
      />

      {/* 8 resize handles */}
      {handles.map((h, i) => (
        <div
          key={i}
          className="absolute border bg-white"
          style={{
            left: h.cx - handleSize / 2,
            top: h.cy - handleSize / 2,
            width: handleSize,
            height: handleSize,
            borderColor: color,
            borderWidth: borderWidth,
            cursor: h.cursor,
          }}
          onPointerDown={(e) => onResizeStart(e, i, elementId, rect)}
        />
      ))}

      {/* Rotation handle — circle above top-center with connecting line */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: rect.x + rect.w / 2,
          top: rect.y - rotateHandleOffset,
          width: borderWidth,
          height: rotateHandleOffset,
          backgroundColor: color,
          transformOrigin: "bottom center",
        }}
      />
      <div
        className="absolute rounded-full border bg-white"
        style={{
          left: rect.x + rect.w / 2 - rotateHandleSize / 2,
          top: rect.y - rotateHandleOffset - rotateHandleSize / 2,
          width: rotateHandleSize,
          height: rotateHandleSize,
          borderColor: color,
          borderWidth: borderWidth,
          cursor: "grab",
        }}
        onPointerDown={(e) => onRotateStart(e, elementId, rect)}
      />

      {/* Component name label */}
      {componentName && (
        <div
          className="pointer-events-none absolute whitespace-nowrap text-white"
          style={{
            left: rect.x,
            top: rect.y - labelFontSize - labelPad * 4,
            fontSize: labelFontSize,
            padding: `${labelPad / 2}px ${labelPad}px`,
            background: COMPONENT_COLOR,
            borderRadius: 2 / scale,
          }}
        >
          {isComponentDef ? "◆ " : "◇ "}{componentName}
        </div>
      )}

      {/* Dimensions label */}
      <div
        className="pointer-events-none absolute whitespace-nowrap rounded text-white"
        style={{
          left: rect.x + rect.w + handleSize,
          top: rect.y - labelFontSize - labelPad * 4,
          fontSize: labelFontSize,
          padding: `${labelPad / 2}px ${labelPad}px`,
          background: color,
          borderRadius: 2 / scale,
        }}
      >
        {Math.round(rect.w)} × {Math.round(rect.h)}
      </div>
    </>
  );
}

// ─── Memoized page content to prevent DOM replacement on hover/selection state changes ───

/**
 * D3: Ref-based page content. Sets innerHTML once on mount, then the live DOM
 * is mutated directly by replayPatch (A15). React does not own this DOM content.
 * On page switch, key={activePage.id} on the parent causes unmount/remount,
 * so innerHTML is re-set from the new page's HTML.
 *
 * Also expands component templates: instances with data-z10-component +
 * data-z10-props get their templates filled in for visual rendering.
 */
const PageContent = memo(function PageContent({
  html,
  componentTemplates,
}: {
  html: string;
  componentTemplates: Map<string, { template: string; styles: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
      expandComponentTemplates(ref.current, componentTemplates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only; patches handle subsequent updates
  }, []);
  return <div ref={ref} className="rounded-sm shadow-2xl" />;
});

/**
 * Component template preview — renders a component's template with default props
 * on a neutral background for editing/inspection.
 */
const ComponentPreview = memo(function ComponentPreview({
  componentName,
  componentTemplates,
}: {
  componentName: string;
  componentTemplates: Map<string, { template: string; styles: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const tmpl = componentTemplates.get(componentName);
    if (!tmpl?.template) {
      ref.current.innerHTML = `<div style="padding: 40px; text-align: center; color: #999; font-size: 14px;">No template defined for ${componentName}</div>`;
      return;
    }
    // Inject styles + expanded template with placeholder values cleared
    let html = tmpl.template.replace(/\{\{[^}]+\}\}/g, "");
    if (tmpl.styles) {
      html = `<style>${tmpl.styles}</style>${html}`;
    }
    ref.current.innerHTML = html;
  }, [componentName, componentTemplates]);
  return (
    <div
      ref={ref}
      className="rounded-sm shadow-2xl"
      style={{
        minWidth: 400,
        minHeight: 200,
        backgroundColor: "#ffffff",
        padding: 24,
        position: "relative",
      }}
    />
  );
});

// ─── Parse .z10.html into page artboards ─────────────────────

type PageInfo = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outerHTML: string;
  bgColor: string;
};

function parsePagesFromContent(content: string): PageInfo[] {
  if (!content) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const pageElements = doc.querySelectorAll("[data-z10-page]");

    if (pageElements.length === 0) {
      // Fallback: wrap body content in a synthetic page so orphaned content is visible
      if (doc.body.children.length > 0) {
        console.warn("[editor-canvas] Content has no data-z10-page wrappers — creating synthetic page");
        const wrapper = doc.createElement("div");
        wrapper.setAttribute("data-z10-page", "Page 1");
        wrapper.setAttribute("data-z10-id", "page_1");
        wrapper.setAttribute("style", "position: relative;");
        while (doc.body.firstChild) {
          wrapper.appendChild(doc.body.firstChild);
        }
        doc.body.appendChild(wrapper);
        return parsePagesFromContent(doc.documentElement.outerHTML);
      }
      return [];
    }

    const pages: PageInfo[] = [];

    pageElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const style = htmlEl.getAttribute("style") || "";

      // Try page element's own dimensions first, then check first child
      let widthMatch = style.match(/width:\s*(\d+)px/);
      let heightMatch = style.match(/(?:min-)?height:\s*(\d+)px/);

      if (!widthMatch || !heightMatch) {
        const firstChild = htmlEl.querySelector("[data-z10-id]") as HTMLElement | null;
        if (firstChild) {
          const childStyle = firstChild.getAttribute("style") || "";
          if (!widthMatch) widthMatch = childStyle.match(/width:\s*(\d+)px/);
          if (!heightMatch) heightMatch = childStyle.match(/(?:min-)?height:\s*(\d+)px/);
        }
      }

      const width = widthMatch ? parseInt(widthMatch[1]) : 1440;
      const height = heightMatch ? parseInt(heightMatch[1]) : 900;

      const bgColor = htmlEl.getAttribute("data-z10-canvas-bg") || "";

      pages.push({
        id:
          htmlEl.getAttribute("data-z10-id") ||
          htmlEl.getAttribute("data-z10-page") ||
          "",
        name: htmlEl.getAttribute("data-z10-page") || "Untitled",
        x: 0,
        y: 0,
        width,
        height,
        outerHTML: htmlEl.outerHTML,
        bgColor,
      });
    });

    return pages;
  } catch {
    return [];
  }
}
