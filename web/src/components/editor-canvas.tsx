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

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

type Rect = { x: number; y: number; w: number; h: number };

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.8;
const SELECTION_COLOR = "#0D99FF";
const HOVER_COLOR = "#0D99FF";

// ─── Interaction modes ──────────────────────────────────────
type DragMode =
  | { type: "none" }
  | { type: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { type: "move"; startX: number; startY: number; originals: Map<string, { left: number; top: number }> }
  | { type: "resize"; startX: number; startY: number; handleIndex: number; origRect: Rect; elementId: string }
  | { type: "rotate"; centerX: number; centerY: number; startAngle: number; origRotation: number; elementId: string }
  | { type: "marquee"; startX: number; startY: number };

export function EditorCanvas({
  initialContent,
  saveState = "saved",
}: {
  initialContent: string;
  saveState?: "saved" | "saving" | "unsaved";
}) {
  const { selectedIds, select, clearSelection, transformRef, activeTool, content, updateElementStyle } = useEditor();

  // ─── Canvas pan/zoom state ─────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 0.5 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>({ type: "none" });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ─── Parse pages from .z10.html ───────────────────────────
  const [pages, setPages] = useState<PageInfo[]>([]);
  useEffect(() => {
    const src = content || initialContent;
    const parsed = parsePagesFromContent(src);
    setPages(parsed);
  }, [content, initialContent]);

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

  // Recompute selection rects when selection changes
  useEffect(() => {
    if (selectedIds.size === 0) {
      setSelectionRects(new Map());
      return;
    }
    const rects = new Map<string, Rect>();
    for (const id of selectedIds) {
      const rect = computeElementRect(id);
      if (rect) rects.set(id, rect);
    }
    setSelectionRects(rects);
  }, [selectedIds, view.scale, computeElementRect]);

  // ─── Hover tracking ──────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode.type !== "none" || spaceHeld || activeTool === "hand") {
        setHoveredId(null);
        setHoverRect(null);
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
      } else {
        setHoveredId(null);
        setHoverRect(null);
      }
    },
    [dragMode.type, spaceHeld, activeTool, selectedIds, computeElementRect]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
    setHoverRect(null);
  }, []);

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

  // ─── Click to select element ───────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode.type === "pan" || dragMode.type === "move" || dragMode.type === "resize" || dragMode.type === "rotate" || dragMode.type === "marquee") return;
      if (spaceHeld || activeTool === "hand") return;

      const foundId = findZ10Id(e.target as HTMLElement);

      if (foundId) {
        select(foundId, e.shiftKey);
      } else {
        clearSelection();
      }
    },
    [dragMode.type, spaceHeld, activeTool, findZ10Id, select, clearSelection]
  );

  // ─── Escape to deselect ────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearSelection();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

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
  }, []);

  // ─── Arrow keys to nudge selected elements ─────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
        const curLeft = parseFloat(el.style.left) || 0;
        const curTop = parseFloat(el.style.top) || 0;
        updateElementStyle(id, {
          left: `${curLeft + dx}px`,
          top: `${curTop + dy}px`,
        });
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
  }, [selectedIds, transformRef, updateElementStyle, computeElementRect]);

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

      // Check if clicking on empty canvas (for marquee selection)
      if (e.button === 0 && activeTool === "select") {
        const foundId = findZ10Id(e.target as HTMLElement);
        if (!foundId && !selectedIds.has(foundId || "")) {
          // Start marquee selection
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
    [spaceHeld, activeTool, view.x, view.y, view.scale, findZ10Id, selectedIds]
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
        const dx = (e.clientX - dragMode.startX) / view.scale;
        const dy = (e.clientY - dragMode.startY) / view.scale;
        const transformEl = transformRef.current;
        if (!transformEl) return;

        for (const id of selectedIds) {
          const orig = dragMode.originals.get(id);
          if (!orig) continue;
          const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
          if (!el) continue;
          el.style.left = `${orig.left + dx}px`;
          el.style.top = `${orig.top + dy}px`;
        }

        // Update visual rects
        const rects = new Map<string, Rect>();
        for (const id of selectedIds) {
          const rect = computeElementRect(id);
          if (rect) rects.set(id, rect);
        }
        setSelectionRects(rects);
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
    [dragMode, view.scale, selectedIds, transformRef, computeElementRect, view.x, view.y]
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (dragMode.type === "move") {
        // Commit the move to the content model
        const dx = (e.clientX - dragMode.startX) / view.scale;
        const dy = (e.clientY - dragMode.startY) / view.scale;
        for (const id of selectedIds) {
          const orig = dragMode.originals.get(id);
          if (!orig) continue;
          updateElementStyle(id, {
            left: `${Math.round(orig.left + dx)}px`,
            top: `${Math.round(orig.top + dy)}px`,
          });
        }
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
    [dragMode, view.scale, selectedIds, transformRef, updateElementStyle, marqueeRect, computeElementRect, select, clearSelection]
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

      const originals = new Map<string, { left: number; top: number }>();
      for (const id of selectedIds) {
        const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
        if (!el) continue;
        originals.set(id, {
          left: parseFloat(el.style.left) || 0,
          top: parseFloat(el.style.top) || 0,
        });
      }

      setDragMode({
        type: "move",
        startX: e.clientX,
        startY: e.clientY,
        originals,
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
    if (!rect || pages.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const page of pages) {
      minX = Math.min(minX, page.x);
      minY = Math.min(minY, page.y);
      maxX = Math.max(maxX, page.x + page.width);
      maxY = Math.max(maxY, page.y + page.height);
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 80;
    const availW = rect.width - padding * 2;
    const availH = rect.height - padding * 2;
    const scale = Math.min(availW / contentW, availH / contentH, 1);

    setView({
      scale,
      x: (rect.width - contentW * scale) / 2 - minX * scale,
      y: (rect.height - contentH * scale) / 2 - minY * scale,
    });
  }, [pages]);

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

  useEffect(() => {
    const timer = setTimeout(zoomToFit, 50);
    return () => clearTimeout(timer);
  }, [zoomToFit]);

  const zoomPercent = Math.round(view.scale * 100);
  const isPanning = dragMode.type === "pan";

  // ─── Cursor ────────────────────────────────────────────────
  let cursor = "default";
  if (spaceHeld || isPanning || activeTool === "hand") cursor = isPanning ? "grabbing" : "grab";
  else if (activeTool === "text") cursor = "text";
  else if (dragMode.type === "move") cursor = "move";
  else if (dragMode.type === "rotate") cursor = "grabbing";

  return (
    <main className="relative h-full" style={{ overflow: "clip", backgroundColor: "var(--ed-canvas-bg)" }}>
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
          {pages.length > 0 ? (
            pages.map((page, i) => (
              <div
                key={page.id || i}
                style={{
                  position: "absolute",
                  left: page.x,
                  top: page.y,
                }}
              >
                {/* Page label */}
                <div
                  className="whitespace-nowrap text-xs font-medium"
                  style={{ fontSize: 13, marginBottom: 8, color: "var(--ed-text-secondary)" }}
                >
                  {page.name}
                </div>
                {/* Full page HTML — memoized to prevent DOM replacement during interactions */}
                <PageContent html={page.outerHTML} />
              </div>
            ))
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

          {/* ─── Selection overlays ─────────────────────────── */}
          {Array.from(selectionRects.entries()).map(([id, rect]) => (
            <SelectionOverlay
              key={id}
              elementId={id}
              rect={rect}
              scale={view.scale}
              onResizeStart={handleResizeStart}
              onMoveStart={handleMoveStart}
              onRotateStart={handleRotateStart}
            />
          ))}

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
}: {
  elementId: string;
  rect: Rect;
  scale: number;
  onResizeStart: (e: React.PointerEvent, handleIndex: number, elementId: string, rect: Rect) => void;
  onMoveStart: (e: React.PointerEvent) => void;
  onRotateStart: (e: React.PointerEvent, elementId: string, rect: Rect) => void;
}) {
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
          border: `${borderWidth}px solid ${SELECTION_COLOR}`,
          borderRadius: 1 / scale,
          cursor: "move",
        }}
        onPointerDown={onMoveStart}
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
            borderColor: SELECTION_COLOR,
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
          backgroundColor: SELECTION_COLOR,
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
          borderColor: SELECTION_COLOR,
          borderWidth: borderWidth,
          cursor: "grab",
        }}
        onPointerDown={(e) => onRotateStart(e, elementId, rect)}
      />

      {/* Dimensions label */}
      <div
        className="pointer-events-none absolute whitespace-nowrap rounded text-white"
        style={{
          left: rect.x + rect.w + handleSize,
          top: rect.y - labelFontSize - labelPad * 3,
          fontSize: labelFontSize,
          padding: `${labelPad / 2}px ${labelPad}px`,
          background: SELECTION_COLOR,
          borderRadius: 2 / scale,
        }}
      >
        {Math.round(rect.w)} × {Math.round(rect.h)}
      </div>
    </>
  );
}

// ─── Memoized page content to prevent DOM replacement on hover/selection state changes ───

const PageContent = memo(function PageContent({ html }: { html: string }) {
  return (
    <div
      className="rounded-sm shadow-2xl"
      dangerouslySetInnerHTML={{ __html: html }}
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
};

function parsePagesFromContent(content: string): PageInfo[] {
  if (!content) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const pageElements = doc.querySelectorAll("[data-z10-page]");

    if (pageElements.length === 0) return [];

    const pages: PageInfo[] = [];
    let offsetX = 0;

    pageElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const style = htmlEl.getAttribute("style") || "";

      const widthMatch = style.match(/width:\s*(\d+)px/);
      const heightMatch = style.match(/(?:min-)?height:\s*(\d+)px/);

      const width = widthMatch ? parseInt(widthMatch[1]) : 1440;
      const height = heightMatch ? parseInt(heightMatch[1]) : 900;

      pages.push({
        id:
          htmlEl.getAttribute("data-z10-id") ||
          htmlEl.getAttribute("data-z10-page") ||
          "",
        name: htmlEl.getAttribute("data-z10-page") || "Untitled",
        x: offsetX,
        y: 0,
        width,
        height,
        outerHTML: htmlEl.outerHTML,
      });

      offsetX += width + 100;
    });

    return pages;
  } catch {
    return [];
  }
}
