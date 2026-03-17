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
import { inferNodeType } from "@/lib/node-inference";
import { tagNameToComponentName } from "z10/core";
import type { ComponentProp, ComponentVariant } from "z10/core";
import { expandComponentTemplates, parseComponentTemplates } from "@/lib/z10-dom";

// ─── Parsed component schema for editor use ─────────────────

export type EditorComponentSchema = {
  name: string;
  props: ComponentProp[];
  variants: ComponentVariant[];
};

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

export type ToolType = "select" | "frame" | "text" | "hand" | "component";

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

  /** Bumped after each updateElementStyle call so canvas can recompute selection rects. */
  styleRevision: number;

  // Layer tree
  layers: LayerNode[];

  // Canvas ref for DOM queries
  transformRef: RefObject<HTMLDivElement | null>;

  // Content management
  content: string;
  updateElementStyle: (id: string, styles: Record<string, string>) => void;
  /** Replace content from an external source (e.g. MCP agent write / resync). Reparses layers. */
  updateContent: (newContent: string) => void;

  /** Re-derive layers from the live DOM in transformRef (active page only). */
  refreshLayersFromDOM: () => void;

  /** D5: Remove selected IDs that no longer exist in the live DOM. */
  validateSelection: () => void;

  /** Ref flag: set true to suppress undo snapshot recording (e.g. during patch replay). */
  undoSuppressRef: RefObject<boolean>;

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

  // Inline text editing
  editingTextId: string | null;
  startTextEdit: (id: string) => void;
  commitTextEdit: () => void;

  // Group selected elements into a frame
  groupIntoFrame: () => void;

  // Left panel tab
  leftTab: "pages" | "assets";
  setLeftTab: (tab: "pages" | "assets") => void;

  // Component editing
  editingComponentName: string | null;
  enterComponentEditMode: (name: string) => void;
  exitComponentEditMode: () => void;
  createComponentFromSelection: () => void;
  componentList: string[];
  componentSchemas: Map<string, EditorComponentSchema>;

  /** Update a component instance's props (writes data-z10-props, re-expands template) */
  updateInstanceProps: (id: string, props: Record<string, unknown>) => void;

  /** Detach a component instance (remove component attrs, keep expanded content) */
  detachInstance: (id: string) => void;

  // Page operations
  addPage: () => void;
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;

  // Hover from layers panel → canvas highlight
  hoveredLayerId: string | null;
  setHoveredLayerId: (id: string | null) => void;
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
  // isExternalUpdate ref removed — no longer needed since all writes go through transact
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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [editingComponentName, setEditingComponentName] = useState<string | null>(null);
  const [componentList, setComponentList] = useState<string[]>([]);
  const [componentSchemas, setComponentSchemas] = useState<Map<string, EditorComponentSchema>>(new Map());
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"pages" | "assets">("pages");
  const [styleRevision, setStyleRevision] = useState(0);

  const enterComponentEditMode = useCallback((name: string) => {
    setEditingComponentName(name);
    setSelectedIds(new Set());
    setLeftTab("assets");
    // Inject data-z10-id into template elements that don't have them,
    // so updateElementStyle can find and persist style changes.
    setContent((prev) => ensureTemplateIds(prev, name));
  }, []);

  const exitComponentEditMode = useCallback(() => {
    setEditingComponentName(null);
    setSelectedIds(new Set());
  }, []);

  const createComponentFromSelection = useCallback(() => {
    console.warn('createComponentFromSelection is not yet implemented. Use `z10 component create` via CLI.');
  }, []);

  // Parse component list and schemas from content — match both new-format (component-meta)
  // and old-format (component) script blocks
  useEffect(() => {
    if (!content) return;
    const schemas = new Map<string, EditorComponentSchema>();

    // New format: <script ... data-z10-role="component-meta" data-z10-component="Name">...json...</script>
    const newRe = /<script\s+type="application\/z10\+json"\s+data-z10-role="component-meta"\s+data-z10-component="([^"]*)"\s*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    while ((m = newRe.exec(content)) !== null) {
      try {
        const raw = JSON.parse(m[2]!.trim()) as Record<string, unknown>;
        schemas.set(m[1]!, {
          name: m[1]!,
          props: Array.isArray(raw["props"]) ? raw["props"] as ComponentProp[] : [],
          variants: Array.isArray(raw["variants"]) ? raw["variants"] as ComponentVariant[] : [],
        });
      } catch {
        schemas.set(m[1]!, { name: m[1]!, props: [], variants: [] });
      }
    }

    // Old format: <script type="application/z10+json" data-z10-role="component"> { "name": "..." } </script>
    const oldRe = /<script\s+type="application\/z10\+json"\s+data-z10-role="component"\s*>([\s\S]*?)<\/script>/g;
    while ((m = oldRe.exec(content)) !== null) {
      try {
        const raw = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
        if (typeof raw["name"] === "string" && raw["name"] && !schemas.has(raw["name"])) {
          schemas.set(raw["name"], {
            name: raw["name"],
            props: Array.isArray(raw["props"]) ? raw["props"] as ComponentProp[] : [],
            variants: Array.isArray(raw["variants"]) ? raw["variants"] as ComponentVariant[] : [],
          });
        }
      } catch {
        // Skip malformed blocks
      }
    }

    setComponentList(Array.from(schemas.keys()));
    setComponentSchemas(schemas);
  }, [content]);

  const updateInstanceProps = useCallback((id: string, props: Record<string, unknown>) => {
    const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.setAttribute("data-z10-props", JSON.stringify(props));
    // Mark as needing re-expansion and re-expand
    el.removeAttribute("data-z10-expanded");
    el.innerHTML = "";
    const root = transformRef.current;
    if (root) {
      const templates = parseComponentTemplates(content || "");
      expandComponentTemplates(root, templates);
    }
  }, [content]);

  const detachInstance = useCallback((id: string) => {
    const el = transformRef.current?.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.removeAttribute("data-z10-component");
    el.removeAttribute("data-z10-props");
    el.removeAttribute("data-z10-expanded");
    // Content stays as-is (the expanded template becomes static content)
  }, []);

  const startTextEdit = useCallback((id: string) => {
    setEditingTextId(id);
  }, []);

  const commitTextEdit = useCallback(() => {
    setEditingTextId(null);
  }, []);

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
  const undoSuppressRef = useRef(false);

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

    // Apply styles to the live DOM element (optimistic, instant)
    for (const [prop, value] of Object.entries(styles)) {
      el.style.setProperty(prop, value);
    }

    // Component instance wrapper: forward style to the template root element
    // so it's visually applied. Store as an override on the instance for persistence.
    if (el.getAttribute("data-z10-component") && el.getAttribute("data-z10-expanded") === "true") {
      const firstChild = el.querySelector("[data-z10-id]") as HTMLElement | null;
      if (firstChild) {
        const childId = firstChild.getAttribute("data-z10-id") || "";
        for (const [prop, value] of Object.entries(styles)) {
          firstChild.style.setProperty(prop, value);
        }
        const sep = childId.indexOf("::cmp-");
        const templateChildId = sep >= 0 ? childId.slice(sep + 2) : childId;
        const existing = el.getAttribute("data-z10-overrides");
        let overrides: Record<string, Record<string, string>> = {};
        if (existing) {
          try { overrides = JSON.parse(existing); } catch { /* ignore */ }
        }
        overrides[templateChildId] = { ...(overrides[templateChildId] || {}), ...styles };
        el.setAttribute("data-z10-overrides", JSON.stringify(overrides));
        // Edit bridge sends the override attribute change to the server via transact
        onStyleEditRef.current?.(id, styles);
        setStyleRevision((r) => r + 1);
        return;
      }
    }

    // Component template elements (IDs like "cmp-<Name>-<n>"): styles are applied
    // to the live DOM above. The edit bridge sends the change to the server which
    // updates the template in the canonical DOM's <head>.
    const cmpMatch = id.match(/^cmp-(\w+)-\d+$/);
    if (cmpMatch) {
      onStyleEditRef.current?.(id, styles);
      setStyleRevision((r) => r + 1);
      return;
    }

    // Instance-scoped element ("instanceId::cmp-Name-n"): store overrides on the
    // instance element in the live DOM so they survive re-expansion.
    const instanceMatch = id.match(/^(.+)::cmp-/);
    if (instanceMatch) {
      const instanceId = instanceMatch[1]!;
      const templateChildId = id.slice(instanceId.length + 2);
      const instanceEl = transformRef.current?.querySelector(
        `[data-z10-id="${instanceId}"]`,
      ) as HTMLElement | null;
      if (instanceEl) {
        const existing = instanceEl.getAttribute("data-z10-overrides");
        let overrides: Record<string, Record<string, string>> = {};
        if (existing) {
          try { overrides = JSON.parse(existing); } catch { /* ignore */ }
        }
        overrides[templateChildId] = { ...(overrides[templateChildId] || {}), ...styles };
        instanceEl.setAttribute("data-z10-overrides", JSON.stringify(overrides));
      }
      // Edit bridge sends the override attribute change to the server via transact
      onStyleEditRef.current?.(id, styles);
      setStyleRevision((r) => r + 1);
      return;
    }

    // Regular page element — live DOM already mutated above.
    // Edit bridge sends style change to the server via transact.
    onStyleEditRef.current?.(id, styles);
    setStyleRevision((r) => r + 1);
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

  const groupIntoFrame = useCallback(() => {
    if (selectedIds.size < 1) return;
    const root = transformRef.current;
    if (!root) return;

    // Find elements in live DOM
    const elements: HTMLElement[] = [];
    for (const id of selectedIds) {
      const el = root.querySelector(`[data-z10-id="${id}"]`) as HTMLElement | null;
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

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

    // Create frame wrapper in live DOM
    const frameId = `frame_${Date.now()}`;
    const frame = document.createElement("div");
    frame.setAttribute("data-z10-id", frameId);
    const padding = 16;
    frame.setAttribute("style", `position: absolute; left: ${Math.round(minX - padding)}px; top: ${Math.round(minY - padding)}px; width: ${Math.round(maxX - minX + padding * 2)}px; height: ${Math.round(maxY - minY + padding * 2)}px; display: flex; border-radius: 8px;`);

    // Insert frame before first element, move all into it
    const parent = elements[0].parentElement;
    if (!parent) return;
    parent.insertBefore(frame, elements[0]);
    for (const el of elements) {
      const left = parseFloat(el.style.left) || 0;
      const top = parseFloat(el.style.top) || 0;
      el.style.left = `${Math.round(left - minX + padding)}px`;
      el.style.top = `${Math.round(top - minY + padding)}px`;
      frame.appendChild(el);
    }

    // MutationObserver catches the DOM changes and sends transaction.
    // Refresh layers from live DOM.
    refreshLayersFromDOM();
    setSelectedIds(new Set([frameId]));
  }, [selectedIds, refreshLayersFromDOM]);

  const updateContent = useCallback((newContent: string) => {
    setContent(newContent);
    setLayers(parseLayerTree(newContent));
    // Clear selection — element IDs may have changed
    setSelectedIds(new Set());
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
    frameEl.setAttribute(
      "style",
      "display: flex; position: absolute; left: 0px; top: 0px; width: 1440px; height: 900px; background-color: #ffffff; overflow: hidden;"
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
        styleRevision,
        layers,
        transformRef,
        content,
        updateElementStyle,
        updateContent,
        refreshLayersFromDOM,
        validateSelection,
        undoSuppressRef,
        setOnStyleEdit,
        activePageId,
        setActivePageId,
        leftPanelVisible,
        rightPanelVisible,
        setLeftPanelVisible,
        setRightPanelVisible,
        isDarkMode,
        toggleDarkMode,
        editingTextId,
        startTextEdit,
        commitTextEdit,
        groupIntoFrame,
        leftTab,
        setLeftTab,
        editingComponentName,
        enterComponentEditMode,
        exitComponentEditMode,
        createComponentFromSelection,
        componentList,
        componentSchemas,
        updateInstanceProps,
        detachInstance,
        addPage,
        deletePage,
        duplicatePage,
        reorderPages,
        hoveredLayerId,
        setHoveredLayerId,
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
    let pages = doc.querySelectorAll("[data-z10-page]");

    // Fallback: wrap orphaned body content in a synthetic page
    if (pages.length === 0 && doc.body.children.length > 0) {
      const wrapper = doc.createElement("div");
      wrapper.setAttribute("data-z10-page", "Page 1");
      wrapper.setAttribute("data-z10-id", "page_1");
      wrapper.setAttribute("style", "position: relative;");
      while (doc.body.firstChild) {
        wrapper.appendChild(doc.body.firstChild);
      }
      doc.body.appendChild(wrapper);
      pages = doc.querySelectorAll("[data-z10-page]");
    }

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
  const isCustomEl = el.tagName.includes("-") && el.tagName.startsWith("Z10-");
  const componentDef = el.getAttribute("data-z10-component-def");

  const z10Id = el.getAttribute("data-z10-id");
  let name = pageName || componentName || formatNodeName(z10Id, el);
  let type: LayerNode["type"] = "element";

  if (pageName) {
    type = "page";
  } else if (componentDef) {
    type = "component";
    name = componentDef;
  } else if (isCustomEl) {
    type = "component";
    name = tagNameToComponentName(el.tagName.toLowerCase()) ?? el.tagName.toLowerCase();
  } else if (componentName) {
    type = "component";
    name = componentName;
  } else {
    type = inferNodeType(el);
    if (type === "text") {
      // Use text content as name if short enough
      const textContent = el.textContent?.trim();
      if (textContent && textContent.length < 40) {
        name = `"${textContent}"`;
      }
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

/**
 * Update a style property on an element inside a component's <template> block.
 * Since DOMParser puts <template> content into a document fragment (not queryable
 * via querySelector on the main doc), we extract the template content via regex,
 * parse it separately, find the element by data-z10-id, apply styles, and splice back.
 */
function updateComponentTemplateElementStyle(
  contentStr: string,
  componentName: string,
  elementId: string,
  styles: Record<string, string>,
): string {
  const slug = componentName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

  const newRe = new RegExp(
    `(<template\\s+id="z10-${slug}-template"\\s*>)([\\s\\S]*?)(</template>)`,
  );
  const oldRe = new RegExp(
    `(<template\\s+data-z10-template="${componentName}"\\s*>)([\\s\\S]*?)(</template>)`,
  );

  const match = contentStr.match(newRe) || contentStr.match(oldRe);
  if (!match) return contentStr;

  const templateContent = match[2]!;

  // Parse template content separately (not inside a <template> tag)
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${templateContent}</div>`, "text/html");
  const wrapper = doc.body.firstElementChild as HTMLElement;
  if (!wrapper) return contentStr;

  const target = wrapper.querySelector(`[data-z10-id="${elementId}"]`) as HTMLElement | null;
  if (!target) return contentStr;

  for (const [prop, value] of Object.entries(styles)) {
    target.style.setProperty(prop, value);
  }

  const newTemplateContent = wrapper.innerHTML;
  return contentStr.replace(match[0]!, match[1]! + newTemplateContent + match[3]!);
}

/**
 * Ensure all elements inside a component's <template> block have data-z10-id
 * attributes. This allows updateElementStyle to find and persist changes to
 * component template elements, just like regular page elements.
 */
function ensureTemplateIds(contentStr: string, componentName: string): string {
  const slug = componentName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

  const newRe = new RegExp(
    `(<template\\s+id="z10-${slug}-template"\\s*>)([\\s\\S]*?)(</template>)`,
  );
  const oldRe = new RegExp(
    `(<template\\s+data-z10-template="${componentName}"\\s*>)([\\s\\S]*?)(</template>)`,
  );

  const match = contentStr.match(newRe) || contentStr.match(oldRe);
  if (!match) return contentStr;

  const fullTemplateContent = match[2]!;

  // Parse and assign IDs
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${fullTemplateContent}</div>`, "text/html");
  const wrapper = doc.body.firstElementChild as HTMLElement;
  if (!wrapper) return contentStr;

  let changed = false;
  let counter = 0;
  const walk = (el: Element) => {
    if (el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
    if (el instanceof HTMLElement && !el.getAttribute("data-z10-id")) {
      el.setAttribute("data-z10-id", `cmp-${componentName}-${++counter}`);
      changed = true;
    }
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  };
  for (const child of Array.from(wrapper.children)) {
    walk(child);
  }

  if (!changed) return contentStr;

  const newTemplateContent = wrapper.innerHTML;
  return contentStr.replace(match[0]!, match[1]! + newTemplateContent + match[3]!);
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
