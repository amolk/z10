"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

// ─── Types ──────────────────────────────────────────────────

export type LayerNode = {
  id: string;
  name: string;
  tag: string;
  type: "page" | "frame" | "text" | "component" | "element";
  children: LayerNode[];
  depth: number;
};

/** Parsed CSS properties for the properties panel */
export type ElementStyles = {
  width: string;
  height: string;
  x: string;
  y: string;
  rotation: string;
  borderRadius: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomRightRadius: string;
  borderBottomLeftRadius: string;
  fills: { color: string; opacity: number }[];
  stroke: { color: string; width: string; style: string; position: string };
  effects: { type: "drop-shadow" | "inner-shadow"; enabled: boolean; x: string; y: string; blur: string; spread: string; color: string }[];
  fontFamily: string;
  fontWeight: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  color: string;
  opacity: string;
  mixBlendMode: string;
  visibility: string;
  overflow: string;
  position: string;
  display: string;
  flexDirection: string;
  alignItems: string;
  justifyContent: string;
  gap: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
};

export type ToolType = "select" | "frame" | "text" | "hand";

export type EditorState = {
  // Selection
  selectedIds: Set<string>;
  select: (id: string, multi?: boolean) => void;
  clearSelection: () => void;

  // Active tool
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;

  // Visibility
  hiddenIds: Set<string>;
  toggleVisibility: (id: string) => void;

  // Lock
  lockedIds: Set<string>;
  toggleLock: (id: string) => void;

  // Collapsed (layers tree)
  collapsedIds: Set<string>;
  toggleCollapsed: (id: string) => void;

  // Layer tree
  layers: LayerNode[];

  // Canvas ref for DOM queries
  transformRef: RefObject<HTMLDivElement | null>;

  // Content management
  content: string;
  updateElementStyle: (id: string, styles: Record<string, string>) => void;
  /** Replace content from an external source (e.g. MCP agent write). Reparses layers. */
  updateContent: (newContent: string) => void;
  /** True when the last content update came from an external source (skip auto-save) */
  isExternalUpdate: RefObject<boolean>;

  /** Re-derive layers from the live DOM in transformRef (active page only). */
  refreshLayersFromDOM: () => void;

  /** D5: Remove selected IDs that no longer exist in the live DOM. */
  validateSelection: () => void;

  /** D4: Set a callback invoked after each updateElementStyle call.
   *  Used by useEditBridge to send style edits to the server. */
  setOnStyleEdit: (cb: ((id: string, styles: Record<string, string>) => void) | null) => void;

  // Active page
  activePageId: string | null;
  setActivePageId: (id: string) => void;

  // Panel visibility
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  setLeftPanelVisible: (v: boolean) => void;
  setRightPanelVisible: (v: boolean) => void;

  // Dark mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Group selected elements into a frame
  groupIntoFrame: () => void;

  // Page operations
  addPage: () => void;
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
};

// ─── Context ────────────────────────────────────────────────

const EditorContext = createContext<EditorState | null>(null);

export function useEditor(): EditorState {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────

export function EditorProvider({
  initialContent,
  children,
}: {
  initialContent: string;
  children: ReactNode;
}) {
  // Parse layers only on the client — DOMParser is unavailable during SSR,
  // so initialising with [] avoids a server/client hydration mismatch.
  const [layers, setLayers] = useState<LayerNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isExternalUpdate = useRef(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState(initialContent);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activePageId, setActivePageIdRaw] = useState<string | null>(null);
  const setActivePageId = useCallback((id: string) => {
    setActivePageIdRaw(id);
    setSelectedIds(new Set());
  }, []);
  const [leftPanelVisible, setLeftPanelVisibleRaw] = useState(false);
  const [rightPanelVisible, setRightPanelVisibleRaw] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Hydrate panel visibility from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const left = localStorage.getItem("z10-left-panel");
    const right = localStorage.getItem("z10-right-panel");
    if (left !== null) setLeftPanelVisibleRaw(left === "true");
    if (right !== null) setRightPanelVisibleRaw(right === "true");
  }, []);

  const setLeftPanelVisible = useCallback((v: boolean) => {
    setLeftPanelVisibleRaw(v);
    if (typeof window !== "undefined") localStorage.setItem("z10-left-panel", String(v));
  }, []);

  const setRightPanelVisible = useCallback((v: boolean) => {
    setRightPanelVisibleRaw(v);
    if (typeof window !== "undefined") localStorage.setItem("z10-right-panel", String(v));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return next;
    });
  }, []);

  // Sync dark mode class on mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      const hasDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(hasDark);
    }
  }, []);

  // Hydrate layers + activePageId on mount (client-only)
  useEffect(() => {
    const parsed = parseLayerTree(initialContent);
    setLayers(parsed);
    setActivePageIdRaw(parsed[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const transformRef = useRef<HTMLDivElement>(null);

  const select = useCallback((id: string, multi = false) => {
    setSelectedIds((prev) => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return new Set([id]);
    });
    // Auto-expand ancestors so the selected node is visible in the layers tree
    setCollapsedIds((prev) => {
      const ancestors = findAncestorIds(layers, id);
      if (ancestors.length === 0) return prev;
      const hasCollapsed = ancestors.some((a) => prev.has(a));
      if (!hasCollapsed) return prev;
      const next = new Set(prev);
      for (const a of ancestors) next.delete(a);
      return next;
    });
  }, [layers]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleLock = useCallback((id: string) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // D4: Optional callback for notifying useEditBridge of style edits
  const onStyleEditRef = useRef<((id: string, styles: Record<string, string>) => void) | null>(null);
  const setOnStyleEdit = useCallback(
    (cb: ((id: string, styles: Record<string, string>) => void) | null) => {
      onStyleEditRef.current = cb;
    },
    [],
  );

  const updateElementStyle = useCallback((id: string, styles: Record<string, string>) => {
    const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    for (const [prop, value] of Object.entries(styles)) {
      el.style.setProperty(prop, value);
    }
    // Trigger content serialization from live DOM
    setContent((prev) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(prev, "text/html");
      const target = doc.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
      if (target) {
        for (const [prop, value] of Object.entries(styles)) {
          target.style.setProperty(prop, value);
        }
      }
      return `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
    });
    // D4: Notify edit bridge for server dispatch
    onStyleEditRef.current?.(id, styles);
  }, []);

  const groupIntoFrame = useCallback(() => {
    if (selectedIds.size < 1) return;
    setContent((prev) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(prev, "text/html");
      const elements: HTMLElement[] = [];
      for (const id of selectedIds) {
        const el = doc.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
        if (el) elements.push(el);
      }
      if (elements.length === 0) return prev;

      // Compute bounding box from inline styles
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of elements) {
        const left = parseFloat(el.style.left) || 0;
        const top = parseFloat(el.style.top) || 0;
        const width = parseFloat(el.style.width) || 100;
        const height = parseFloat(el.style.height) || 50;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + width);
        maxY = Math.max(maxY, top + height);
      }

      // Create frame wrapper
      const frameId = `frame_${Date.now()}`;
      const frame = doc.createElement("div");
      frame.setAttribute("data-z10-id", frameId);
      frame.setAttribute("data-z10-node", "Frame");
      const padding = 16;
      frame.setAttribute("style", `position: absolute; left: ${Math.round(minX - padding)}px; top: ${Math.round(minY - padding)}px; width: ${Math.round(maxX - minX + padding * 2)}px; height: ${Math.round(maxY - minY + padding * 2)}px; border-radius: 8px;`);

      // Insert frame before first element, move all into it
      const parent = elements[0].parentElement;
      if (!parent) return prev;
      parent.insertBefore(frame, elements[0]);
      for (const el of elements) {
        // Adjust positions relative to frame
        const left = parseFloat(el.style.left) || 0;
        const top = parseFloat(el.style.top) || 0;
        el.style.left = `${Math.round(left - minX + padding)}px`;
        el.style.top = `${Math.round(top - minY + padding)}px`;
        frame.appendChild(el);
      }

      const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
      // Schedule layer re-parse
      setTimeout(() => {
        setLayers(parseLayerTree(result));
        setSelectedIds(new Set([frameId]));
      }, 0);
      return result;
    });
  }, [selectedIds]);

  const updateContent = useCallback((newContent: string) => {
    isExternalUpdate.current = true;
    setContent(newContent);
    setLayers(parseLayerTree(newContent));
    // Clear selection — element IDs may have changed
    setSelectedIds(new Set());
  }, []);

  // D3: Re-derive layers from the live DOM (active page only).
  // Called after replayPatch mutates the canvas DOM so the layers panel stays in sync.
  const refreshLayersFromDOM = useCallback(() => {
    const root = transformRef.current;
    if (!root) return;
    const pageEl = root.querySelector("[data-z10-page]") as HTMLElement | null;
    if (!pageEl) return;
    _nodeCounter = 0;
    const updatedPage = elementToNode(pageEl, 0);
    setLayers((prev) =>
      prev.map((l) => (l.id === updatedPage.id ? updatedPage : l)),
    );
  }, []);

  // D5: Remove selected IDs that no longer exist in the live DOM.
  // Called after patch replay to handle agent-deleted elements.
  const validateSelection = useCallback(() => {
    const root = transformRef.current;
    if (!root || selectedIds.size === 0) return;
    const surviving = new Set<string>();
    for (const id of selectedIds) {
      if (root.querySelector(`[data-z10-id="${id}"]`)) {
        surviving.add(id);
      }
    }
    if (surviving.size < selectedIds.size) {
      setSelectedIds(surviving);
    }
  }, [selectedIds]);

  const addPage = useCallback(() => {
    const prev = content || initialContent;
    const parser = new DOMParser();
    const doc = parser.parseFromString(prev || "<html><head></head><body></body></html>", "text/html");

    // Determine page number from existing pages
    const existingPages = doc.querySelectorAll("[data-z10-page]");
    const pageNum = existingPages.length + 1;
    const pageName = `Page ${pageNum}`;
    const pageId = `page_${Date.now()}`;

    // Create page element (the canvas)
    const pageEl = doc.createElement("div");
    pageEl.setAttribute("data-z10-page", pageName);
    pageEl.setAttribute("data-z10-id", pageId);
    pageEl.setAttribute("style", "position: relative;");

    // Add a default frame inside the page
    const frameId = `frame_${pageId}`;
    const frameEl = doc.createElement("div");
    frameEl.setAttribute("data-z10-id", frameId);
    frameEl.setAttribute("data-z10-node", "Frame");
    frameEl.setAttribute(
      "style",
      "position: absolute; left: 0px; top: 0px; width: 1440px; height: 900px; background-color: #ffffff; overflow: hidden;"
    );
    pageEl.appendChild(frameEl);

    doc.body.appendChild(pageEl);

    const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;

    // Update all state synchronously so activePageId and content are consistent
    const parsed = parseLayerTree(result);
    setLayers(parsed);
    setContent(result);
    setActivePageIdRaw(pageId);
    setSelectedIds(new Set());
  }, [content, initialContent]);

  const deletePage = useCallback((pageId: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content || initialContent, "text/html");
    const allPages = doc.querySelectorAll("[data-z10-page]");
    if (allPages.length <= 1) return; // Don't delete the last page

    const target = doc.querySelector(`[data-z10-id="${pageId}"]`);
    if (!target) return;
    target.parentElement?.removeChild(target);

    const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
    const parsed = parseLayerTree(result);
    setLayers(parsed);
    setContent(result);
    // Switch to the first remaining page if we deleted the active one
    if (activePageId === pageId) {
      setActivePageIdRaw(parsed[0]?.id ?? null);
    }
    setSelectedIds(new Set());
  }, [content, initialContent, activePageId]);

  const duplicatePage = useCallback((pageId: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content || initialContent, "text/html");
    const source = doc.querySelector(`[data-z10-id="${pageId}"]`);
    if (!source) return;

    const clone = source.cloneNode(true) as HTMLElement;
    const newPageId = `page_${Date.now()}`;
    clone.setAttribute("data-z10-id", newPageId);
    const origName = clone.getAttribute("data-z10-page") || "Page";
    clone.setAttribute("data-z10-page", `${origName} Copy`);
    // Reassign all child data-z10-id to prevent duplicates
    clone.querySelectorAll("[data-z10-id]").forEach((el) => {
      el.setAttribute("data-z10-id", `${el.getAttribute("data-z10-id")}_dup_${Date.now().toString(36)}`);
    });
    source.parentElement?.insertBefore(clone, source.nextSibling);

    const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
    const parsed = parseLayerTree(result);
    setLayers(parsed);
    setContent(result);
    setActivePageIdRaw(newPageId);
    setSelectedIds(new Set());
  }, [content, initialContent]);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content || initialContent, "text/html");
    const pageEls = Array.from(doc.querySelectorAll("[data-z10-page]"));
    if (fromIndex < 0 || fromIndex >= pageEls.length || toIndex < 0 || toIndex >= pageEls.length) return;

    const movedEl = pageEls[fromIndex];
    movedEl.parentElement?.removeChild(movedEl);

    // Re-query after removal
    const remaining = Array.from(doc.querySelectorAll("[data-z10-page]"));
    if (toIndex >= remaining.length) {
      doc.body.appendChild(movedEl);
    } else {
      remaining[toIndex].parentElement?.insertBefore(movedEl, remaining[toIndex]);
    }

    const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
    const parsed = parseLayerTree(result);
    setLayers(parsed);
    setContent(result);
  }, [content, initialContent]);

  return (
    <EditorContext.Provider
      value={{
        selectedIds,
        select,
        clearSelection,
        activeTool,
        setActiveTool,
        hiddenIds,
        toggleVisibility,
        lockedIds,
        toggleLock,
        collapsedIds,
        toggleCollapsed,
        layers,
        transformRef,
        content,
        updateElementStyle,
        updateContent,
        refreshLayersFromDOM,
        validateSelection,
        setOnStyleEdit,
        isExternalUpdate,
        activePageId,
        setActivePageId,
        leftPanelVisible,
        rightPanelVisible,
        setLeftPanelVisible,
        setRightPanelVisible,
        isDarkMode,
        toggleDarkMode,
        groupIntoFrame,
        addPage,
        deletePage,
        duplicatePage,
        reorderPages,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

/** Read computed styles from a DOM element for the properties panel */
export function getElementStyles(el: HTMLElement): ElementStyles {
  const computed = window.getComputedStyle(el);
  const inline = el.style;

  // Parse fills from background/backgroundColor
  const fills: ElementStyles["fills"] = [];
  const bgColor = inline.backgroundColor || computed.backgroundColor;
  if (bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)") {
    fills.push({ color: bgColor, opacity: 1 });
  }

  // Parse box shadow into effects — supports multiple shadows
  const effects: ElementStyles["effects"] = [];
  const shadow = inline.boxShadow || computed.boxShadow;
  if (shadow && shadow !== "none") {
    parseShadows(shadow).forEach((s) => effects.push(s));
  }

  return {
    width: inline.width || computed.width,
    height: inline.height || computed.height,
    x: inline.left || computed.left || "0",
    y: inline.top || computed.top || "0",
    rotation: inline.rotate || "0",
    borderRadius: inline.borderRadius || computed.borderRadius || "0px",
    borderTopLeftRadius: inline.borderTopLeftRadius || computed.borderTopLeftRadius || "0px",
    borderTopRightRadius: inline.borderTopRightRadius || computed.borderTopRightRadius || "0px",
    borderBottomRightRadius: inline.borderBottomRightRadius || computed.borderBottomRightRadius || "0px",
    borderBottomLeftRadius: inline.borderBottomLeftRadius || computed.borderBottomLeftRadius || "0px",
    fills,
    stroke: {
      color: inline.borderColor || computed.borderColor || "transparent",
      width: inline.borderWidth || computed.borderWidth || "0px",
      style: inline.borderStyle || computed.borderStyle || "none",
      position: "inside",
    },
    effects,
    fontFamily: inline.fontFamily || computed.fontFamily || "",
    fontWeight: inline.fontWeight || computed.fontWeight || "400",
    fontSize: inline.fontSize || computed.fontSize || "16px",
    lineHeight: inline.lineHeight || computed.lineHeight || "normal",
    letterSpacing: inline.letterSpacing || computed.letterSpacing || "normal",
    textAlign: inline.textAlign || computed.textAlign || "left",
    color: inline.color || computed.color || "",
    opacity: inline.opacity || computed.opacity || "1",
    mixBlendMode: inline.mixBlendMode || computed.mixBlendMode || "normal",
    visibility: inline.visibility || computed.visibility || "visible",
    overflow: inline.overflow || computed.overflow || "visible",
    position: inline.position || computed.position || "static",
    display: inline.display || computed.display || "block",
    flexDirection: inline.flexDirection || computed.flexDirection || "row",
    alignItems: inline.alignItems || computed.alignItems || "stretch",
    justifyContent: inline.justifyContent || computed.justifyContent || "flex-start",
    gap: inline.gap || computed.gap || "0px",
    paddingTop: inline.paddingTop || computed.paddingTop || "0px",
    paddingRight: inline.paddingRight || computed.paddingRight || "0px",
    paddingBottom: inline.paddingBottom || computed.paddingBottom || "0px",
    paddingLeft: inline.paddingLeft || computed.paddingLeft || "0px",
  };
}

/** Parse CSS box-shadow string into structured effect objects */
function parseShadows(raw: string): ElementStyles["effects"] {
  const results: ElementStyles["effects"] = [];
  if (!raw || raw === "none") return results;

  // Split on commas that are not inside parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const isInset = part.includes("inset");
    const cleaned = part.replace("inset", "").trim();
    // Extract color — either rgb/rgba(...) or hex at start/end
    let color = "rgba(0,0,0,0.25)";
    let nums = cleaned;
    const rgbaMatch = cleaned.match(/rgba?\([^)]+\)/);
    if (rgbaMatch) {
      color = rgbaMatch[0];
      nums = cleaned.replace(rgbaMatch[0], "").trim();
    } else {
      const hexMatch = cleaned.match(/#[0-9a-fA-F]{3,8}/);
      if (hexMatch) {
        color = hexMatch[0];
        nums = cleaned.replace(hexMatch[0], "").trim();
      }
    }
    // Parse numeric values: x y blur spread
    const values = nums.match(/-?[\d.]+/g) || [];
    results.push({
      type: isInset ? "inner-shadow" : "drop-shadow",
      enabled: true,
      x: values[0] || "0",
      y: values[1] || "0",
      blur: values[2] || "0",
      spread: values[3] || "0",
      color,
    });
  }
  return results;
}

// ─── .z10.html → LayerNode tree parser ──────────────────────

function parseLayerTree(content: string): LayerNode[] {
  if (!content) return [];
  _nodeCounter = 0;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const pages = doc.querySelectorAll("[data-z10-page]");

    if (pages.length === 0) return [];

    const result: LayerNode[] = [];
    pages.forEach((page) => {
      result.push(elementToNode(page as HTMLElement, 0));
    });
    return result;
  } catch {
    return [];
  }
}

let _nodeCounter = 0;

const SEMANTIC_TAG_NAMES: Record<string, string> = {
  NAV: "Nav",
  HEADER: "Header",
  MAIN: "Main",
  SECTION: "Section",
  ASIDE: "Aside",
  ARTICLE: "Article",
  FOOTER: "Footer",
  FORM: "Form",
  UL: "List",
  OL: "List",
  BUTTON: "Button",
  INPUT: "Input",
  IMG: "Image",
  SVG: "Vector",
  TABLE: "Table",
};

function formatNodeName(z10Id: string | null, el: HTMLElement): string {
  if (z10Id) {
    // Convert snake_case/camelCase id to Title Case
    return z10Id
      .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → spaced
      .replace(/[_-]/g, " ") // snake_case/kebab → spaced
      .replace(/\b\w/g, (c) => c.toUpperCase()) // Title Case
      .trim();
  }
  // Use semantic tag name if available
  const semantic = SEMANTIC_TAG_NAMES[el.tagName];
  if (semantic) return semantic;
  // Fall back to tag name
  return el.tagName.toLowerCase();
}

function elementToNode(el: HTMLElement, depth: number): LayerNode {
  const id =
    el.getAttribute("data-z10-id") ||
    el.getAttribute("data-z10-page") ||
    `el-${++_nodeCounter}`;

  const pageName = el.getAttribute("data-z10-page");
  const componentName = el.getAttribute("data-z10-component");
  const nodeName = el.getAttribute("data-z10-node");

  const z10Id = el.getAttribute("data-z10-id");
  let name = pageName || componentName || nodeName || formatNodeName(z10Id, el);
  let type: LayerNode["type"] = "element";

  if (pageName) {
    type = "page";
  } else if (componentName) {
    type = "component";
    name = componentName;
  } else if (el.children.length > 0) {
    type = "frame";
  } else if (
    el.tagName === "P" ||
    el.tagName === "SPAN" ||
    el.tagName === "H1" ||
    el.tagName === "H2" ||
    el.tagName === "H3" ||
    el.tagName === "H4" ||
    el.tagName === "H5" ||
    el.tagName === "H6" ||
    el.tagName === "A" ||
    el.tagName === "LABEL"
  ) {
    type = "text";
    // Use text content as name if short enough
    const textContent = el.textContent?.trim();
    if (textContent && textContent.length < 40) {
      name = `"${textContent}"`;
    }
  }

  const children: LayerNode[] = [];
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      // Skip script and style elements
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      children.push(elementToNode(child, depth + 1));
    }
  }

  return { id, name, tag: el.tagName.toLowerCase(), type, children, depth };
}

/** Find all ancestor node IDs for a given node ID in the layer tree */
function findAncestorIds(roots: LayerNode[], targetId: string): string[] {
  const path: string[] = [];
  function walk(nodes: LayerNode[]): boolean {
    for (const node of nodes) {
      if (node.id === targetId) return true;
      if (node.children.length > 0) {
        path.push(node.id);
        if (walk(node.children)) return true;
        path.pop();
      }
    }
    return false;
  }
  walk(roots);
  return path;
}
