"use client";

import {
  useRef,
  useCallback,
  useState,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEditor } from "@/lib/editor-state";

type ViewTransform = {
  x: number;
  y: number;
  scale: number;
};

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.8;
const SELECTION_COLOR = "#0D99FF";

export function EditorCanvas({
  initialContent,
  saveState = "saved",
}: {
  initialContent: string;
  saveState?: "saved" | "saving" | "unsaved";
}) {
  const { selectedIds, select, clearSelection, transformRef, activeTool, content } = useEditor();

  // ─── Canvas pan/zoom state ─────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, scale: 0.5 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, viewX: 0, viewY: 0 });

  // ─── Parse pages from .z10.html (client-only; DOMParser unavailable in SSR) ──
  // Use live content from editor state (updated by MCP agent writes via SSE),
  // falling back to initialContent for the first render.
  const [pages, setPages] = useState<PageInfo[]>([]);
  useEffect(() => {
    const src = content || initialContent;
    const parsed = parsePagesFromContent(src);
    setPages(parsed);
  }, [content, initialContent]);

  // ─── Selection rects (computed from DOM) ────────────────────
  const [selectionRects, setSelectionRects] = useState<
    Map<string, { x: number; y: number; w: number; h: number }>
  >(new Map());

  // Recompute selection rects when selection changes
  useEffect(() => {
    if (selectedIds.size === 0) {
      setSelectionRects(new Map());
      return;
    }

    // Find selected elements in the transform layer
    const transformEl = transformRef.current;
    if (!transformEl) return;

    const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const id of selectedIds) {
      const el = transformEl.querySelector(`[data-z10-id="${id}"]`) as HTMLElement;
      if (!el) continue;

      // Get position relative to transform layer (which is at canvas origin)
      const elRect = el.getBoundingClientRect();
      const transformRect = transformEl.getBoundingClientRect();

      rects.set(id, {
        x: (elRect.left - transformRect.left) / view.scale,
        y: (elRect.top - transformRect.top) / view.scale,
        w: elRect.width / view.scale,
        h: elRect.height / view.scale,
      });
    }
    setSelectionRects(rects);
  }, [selectedIds, view.scale]);

  // ─── Click to select element ───────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || spaceHeld || activeTool === "hand") return;

      // Walk up from click target to find closest data-z10-id
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

      if (foundId) {
        select(foundId, e.shiftKey);
      } else {
        clearSelection();
      }
    },
    [isPanning, spaceHeld, activeTool, select, clearSelection]
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
  // Must use native listener with { passive: false } to prevent browser zoom
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
        setIsPanning(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ─── Middle-click or Space+drag to pan ─────────────────────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button === 1 || ((spaceHeld || activeTool === "hand") && e.button === 0)) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          viewX: view.x,
          viewY: view.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [spaceHeld, activeTool, view.x, view.y]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setView((v) => ({
        ...v,
        x: panStartRef.current.viewX + dx,
        y: panStartRef.current.viewY + dy,
      }));
    },
    [isPanning]
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

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
        style={{ cursor: spaceHeld || isPanning || activeTool === "hand" ? "grab" : activeTool === "text" ? "text" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
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
                {/* Full page HTML — preserves all z10 styles as-is */}
                <div
                  className="rounded-sm shadow-2xl"
                  dangerouslySetInnerHTML={{ __html: page.outerHTML }}
                />
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

          {/* ─── Selection overlays ─────────────────────────── */}
          {Array.from(selectionRects.entries()).map(([id, rect]) => (
            <SelectionOverlay key={id} rect={rect} scale={view.scale} />
          ))}
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
  rect,
  scale,
}: {
  rect: { x: number; y: number; w: number; h: number };
  scale: number;
}) {
  // Handle size stays constant regardless of zoom
  const handleSize = 8 / scale;
  const borderWidth = 1.5 / scale;
  const labelFontSize = 11 / scale;
  const labelPad = 4 / scale;

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
      {/* Bounding box */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          border: `${borderWidth}px solid ${SELECTION_COLOR}`,
          borderRadius: 1 / scale,
        }}
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
        />
      ))}

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

/** Convert a CSS text string to a React style object using the browser's CSS parser */
function cssTextToObject(css: string): React.CSSProperties {
  if (!css) return {};
  const el = document.createElement("div");
  el.style.cssText = css;
  const style: Record<string, string> = {};
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]; // e.g. "flex-direction"
    const val = el.style.getPropertyValue(prop);
    if (!val) continue;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[camel] = val;
  }
  return style as React.CSSProperties;
}

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
      const bgMatch = style.match(/background:\s*([^;]+)/);

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
