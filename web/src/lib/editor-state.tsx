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

  // Active page
  activePageId: string | null;
  setActivePageId: (id: string) => void;
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
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Hydrate layers + activePageId on mount (client-only)
  useEffect(() => {
    const parsed = parseLayerTree(initialContent);
    setLayers(parsed);
    setActivePageId(parsed[0]?.id ?? null);
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
  }, []);

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
  }, []);

  const updateContent = useCallback((newContent: string) => {
    isExternalUpdate.current = true;
    setContent(newContent);
    setLayers(parseLayerTree(newContent));
    // Clear selection — element IDs may have changed
    setSelectedIds(new Set());
  }, []);

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
        isExternalUpdate,
        activePageId,
        setActivePageId,
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
