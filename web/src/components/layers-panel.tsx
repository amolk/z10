"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, type LayerNode } from "@/lib/editor-state";
import { COMPONENT_COLOR } from "@/lib/editor-constants";
import {
  Plus,
  Search,
  Square,
  ChevronRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Frame,
  Type,
  Diamond,
  Box,
} from "lucide-react";

export function LayersPanel() {
  const { layers, activePageId, setActivePageId, addPage, deletePage, duplicatePage, reorderPages } = useEditor();
  const [search, setSearch] = useState("");

  const activePage = layers.find((p) => p.id === activePageId) || layers[0];
  const pageChildren = activePage?.children ?? [];

  const filteredLayers = search
    ? filterNodes(pageChildren, search.toLowerCase())
    : pageChildren;

  return (
    <aside
      className="flex flex-1 flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--ed-panel-bg)",
      }}
    >
      {/* Pages header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: "var(--ed-section-border)" }}
      >
        <span className="text-[12px] font-medium" style={{ color: "var(--ed-text)" }}>
          Pages
        </span>
        <button
          onClick={addPage}
          className="flex h-5 w-5 items-center justify-center rounded transition-colors"
          style={{ color: "var(--ed-icon-color)" }}
          title="Add page"
        >
          <Plus size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Page list */}
      <PageList
        pages={layers}
        activePageId={activePageId ?? layers[0]?.id ?? ""}
        onSelectPage={setActivePageId}
        onDeletePage={deletePage}
        onDuplicatePage={duplicatePage}
        onReorderPages={reorderPages}
      />

      {/* Layers header + search */}
      <div className="flex flex-col">
        <div
          className="flex items-center gap-2 px-3 py-1.5"
        >
          <Search size={14} strokeWidth={1} style={{ color: "var(--ed-icon-color)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search layers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-[12px] placeholder:text-[var(--ed-text-tertiary)] focus:outline-none"
            style={{ color: "var(--ed-text)" }}
          />
        </div>
      </div>

      {/* Separator */}
      <div className="border-b" style={{ borderColor: "var(--ed-section-border)" }} />

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-0.5" style={{ minHeight: 0 }}>
        {filteredLayers.length > 0 ? (
          filteredLayers.map((node) => (
            <LayerRow key={node.id} node={node} />
          ))
        ) : (
          <div className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--ed-text-tertiary)" }}>
            {search ? "No matching layers" : "No layers"}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Page List (Paper-style vertical list) ─────────────────

function PageList({
  pages,
  activePageId,
  onSelectPage,
  onDeletePage,
  onDuplicatePage,
  onReorderPages,
}: {
  pages: LayerNode[];
  activePageId: string;
  onSelectPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onReorderPages: (from: number, to: number) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragFromIndex = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pageId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, pageId });
    },
    []
  );

  const { content, updateContent } = useEditor();

  const commitRename = useCallback(
    (pageId: string, name: string) => {
      setRenamingId(null);
      if (!name.trim()) return;
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const target = doc.querySelector(`[data-z10-id="${pageId}"]`);
      if (target) {
        target.setAttribute("data-z10-page", name);
        updateContent(`<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`);
      }
    },
    [content, updateContent]
  );

  const startRename = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        setRenamingId(pageId);
        setRenameValue(page.name);
      }
      setContextMenu(null);
    },
    [pages]
  );

  return (
    <div className="border-b" style={{ borderColor: "var(--ed-section-border)" }}>
      {pages.map((page, index) => (
        <div
          key={page.id}
          className="relative"
          draggable={renamingId !== page.id}
          onDragStart={(e) => {
            dragFromIndex.current = index;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-z10-page", String(index));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverIndex(index);
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFromIndex.current;
            if (from !== null && from !== index) {
              onReorderPages(from, index);
            }
            dragFromIndex.current = null;
            setDragOverIndex(null);
          }}
          onDragEnd={() => {
            dragFromIndex.current = null;
            setDragOverIndex(null);
          }}
        >
          {/* Drop indicator line */}
          {dragOverIndex === index && dragFromIndex.current !== null && dragFromIndex.current !== index && (
            <div
              className="pointer-events-none absolute left-2 right-2 z-10"
              style={{
                top: dragFromIndex.current < index ? undefined : -1,
                bottom: dragFromIndex.current < index ? -1 : undefined,
                height: 2,
                backgroundColor: "#3b82f6",
                borderRadius: 1,
              }}
            >
              <div
                className="absolute rounded-full"
                style={{ left: -3, top: -2, width: 6, height: 6, backgroundColor: "#3b82f6" }}
              />
            </div>
          )}

          <button
            onClick={() => onSelectPage(page.id)}
            onContextMenu={(e) => handleContextMenu(e, page.id)}
            onDoubleClick={() => startRename(page.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors"
            style={{
              backgroundColor: page.id === activePageId ? "var(--ed-selected-bg)" : "transparent",
              color: page.id === activePageId ? "var(--ed-selected-text)" : "var(--ed-text)",
            }}
          >
            <Square
              size={14}
              strokeWidth={1}
              style={{ color: page.id === activePageId ? "var(--ed-selected-text)" : "var(--ed-icon-color)", flexShrink: 0 }}
            />
            {renamingId === page.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(page.id, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(page.id, renameValue);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                autoFocus
                className="w-full rounded border px-1 py-0 text-[12px] focus:outline-none"
                style={{
                  borderColor: "var(--ed-input-border)",
                  backgroundColor: "var(--ed-input-bg)",
                  color: "var(--ed-text)",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{page.name}</span>
            )}
            {page.id === activePageId && (
              <Check
                size={10}
                strokeWidth={1.5}
                className="ml-auto flex-shrink-0"
                style={{ color: "var(--ed-selected-text)" }}
              />
            )}
          </button>
        </div>
      ))}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded-md border py-1 shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: "var(--ed-panel-bg)",
            borderColor: "var(--ed-panel-border)",
          }}
        >
          <button
            onClick={() => startRename(contextMenu.pageId)}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-text)" }}
          >
            Rename
          </button>
          <button
            onClick={() => { onDuplicatePage(contextMenu.pageId); setContextMenu(null); }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--ed-hover-bg)]"
            style={{ color: "var(--ed-text)" }}
          >
            Duplicate
          </button>
          {pages.length > 1 && (
            <>
              <div className="my-1 border-t" style={{ borderColor: "var(--ed-section-border)" }} />
              <button
                onClick={() => { onDeletePage(contextMenu.pageId); setContextMenu(null); }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-red-500 transition-colors hover:bg-[var(--ed-hover-bg)]"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drag & Drop State ──────────────────────────────────────

type DropPosition = {
  targetId: string;
  position: "before" | "inside" | "after";
};

// ─── Layer Row (recursive tree node with drag & drop) ───────

function LayerRow({ node }: { node: LayerNode }) {
  const {
    selectedIds,
    select,
    hiddenIds,
    toggleVisibility,
    lockedIds,
    toggleLock,
    collapsedIds,
    toggleCollapsed,
    transformRef,
    content,
    updateContent,
    setHoveredLayerId,
  } = useEditor();

  const rowRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedIds.has(node.id);
  const isHidden = hiddenIds.has(node.id);
  const isLocked = lockedIds.has(node.id);
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<"before" | "inside" | "after" | null>(null);

  // Auto-scroll selected element into view
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  // ─── Drag handlers ─────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const isAltClone = e.altKey;
      e.dataTransfer.setData("text/plain", node.id);
      e.dataTransfer.setData("application/x-z10-clone", isAltClone ? "true" : "false");
      e.dataTransfer.effectAllowed = isAltClone ? "copy" : "move";
      setIsDragging(true);
    },
    [node.id]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const h = rect.height;

      if (y < h * 0.25) {
        setDropIndicator("before");
      } else if (y > h * 0.75) {
        setDropIndicator("after");
      } else {
        setDropIndicator("inside");
      }
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropIndicator(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = e.dataTransfer.getData("text/plain");
      const isClone = e.dataTransfer.getData("application/x-z10-clone") === "true" || e.altKey;
      if (!draggedId || draggedId === node.id) {
        setDropIndicator(null);
        return;
      }

      // Perform the move/clone in the content model
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const draggedEl = doc.querySelector(`[data-z10-id="${draggedId}"]`);
      const targetEl = doc.querySelector(`[data-z10-id="${node.id}"]`);

      if (!draggedEl || !targetEl) {
        setDropIndicator(null);
        return;
      }

      // Prevent dropping into own descendants
      if (draggedEl.contains(targetEl)) {
        setDropIndicator(null);
        return;
      }

      // Capture the dragged element's current rendered position (from live DOM)
      // before moving, so we can assign absolute position if needed
      let liveDraggedRect: DOMRect | null = null;
      let livePageRect: DOMRect | null = null;
      const liveDraggedEl = transformRef.current?.querySelector(`[data-z10-id="${draggedId}"]`) as HTMLElement | null;
      if (liveDraggedEl) {
        liveDraggedRect = liveDraggedEl.getBoundingClientRect();
        // Find the enclosing page element for coordinate reference
        const pageEl = liveDraggedEl.closest("[data-z10-page]") as HTMLElement | null;
        if (pageEl) livePageRect = pageEl.getBoundingClientRect();
      }

      // Check if source parent is a flow container
      const sourceParent = draggedEl.parentElement as HTMLElement | null;
      const sourceIsFlow = sourceParent ? isFlowContainer(sourceParent) : false;

      // For clone: duplicate the element with a new ID; for move: remove from current position
      let elementToInsert: Element;
      let newId: string;
      if (isClone) {
        elementToInsert = draggedEl.cloneNode(true) as Element;
        newId = `${draggedId}_clone_${Date.now().toString(36)}`;
        (elementToInsert as HTMLElement).setAttribute("data-z10-id", newId);
      } else {
        draggedEl.parentElement?.removeChild(draggedEl);
        elementToInsert = draggedEl;
        newId = draggedId;
      }

      // Determine the new parent after the move
      let newParent: Element | null = null;
      if (dropIndicator === "inside") {
        newParent = targetEl;
      } else {
        newParent = targetEl.parentElement;
      }

      // Adjust positioning based on source/target container types
      const insertHtmlEl = elementToInsert as HTMLElement;
      const targetIsFlow = newParent instanceof HTMLElement ? isFlowContainer(newParent) : false;
      const targetIsPage = newParent instanceof HTMLElement && newParent.hasAttribute("data-z10-page");

      if (targetIsFlow && !targetIsPage && insertHtmlEl.style.position === "absolute") {
        // Moving INTO a flow container → strip absolute positioning
        insertHtmlEl.style.removeProperty("position");
        insertHtmlEl.style.removeProperty("left");
        insertHtmlEl.style.removeProperty("top");
      } else if ((!targetIsFlow || targetIsPage) && sourceIsFlow && insertHtmlEl.style.position !== "absolute") {
        // Moving OUT of a flow container → make absolute and set coordinates
        insertHtmlEl.style.position = "absolute";
        if (liveDraggedRect && livePageRect) {
          insertHtmlEl.style.left = `${Math.round(liveDraggedRect.left - livePageRect.left)}px`;
          insertHtmlEl.style.top = `${Math.round(liveDraggedRect.top - livePageRect.top)}px`;
        }
      }

      // Insert at new position
      if (dropIndicator === "before") {
        targetEl.parentElement?.insertBefore(elementToInsert, targetEl);
      } else if (dropIndicator === "after") {
        if (targetEl.nextSibling) {
          targetEl.parentElement?.insertBefore(elementToInsert, targetEl.nextSibling);
        } else {
          targetEl.parentElement?.appendChild(elementToInsert);
        }
      } else {
        // "inside" - append as child
        targetEl.appendChild(elementToInsert);
      }

      // Serialize and update
      const result = `<html${doc.documentElement.getAttribute("data-z10-project") ? ` data-z10-project="${doc.documentElement.getAttribute("data-z10-project")}"` : ""}>\n${doc.documentElement.innerHTML}\n</html>`;
      updateContent(result);

      // Also update the live DOM
      const liveDragged = transformRef.current?.querySelector(`[data-z10-id="${draggedId}"]`) as HTMLElement | null;
      const liveTarget = transformRef.current?.querySelector(`[data-z10-id="${node.id}"]`) as HTMLElement | null;
      if (liveDragged && liveTarget) {
        // Capture live source parent flow state before removing
        const liveSourceParent = liveDragged.parentElement;
        const liveSourceIsFlow = liveSourceParent ? isLiveFlowContainer(liveSourceParent) : false;

        let liveElement: HTMLElement;
        if (isClone) {
          liveElement = liveDragged.cloneNode(true) as HTMLElement;
          liveElement.setAttribute("data-z10-id", newId);
        } else {
          liveDragged.parentElement?.removeChild(liveDragged);
          liveElement = liveDragged;
        }

        // Determine the live new parent
        let liveNewParent: HTMLElement | null = null;
        if (dropIndicator === "inside") {
          liveNewParent = liveTarget;
        } else {
          liveNewParent = liveTarget.parentElement;
        }

        // Adjust positioning in live DOM
        if (liveNewParent) {
          const liveTargetIsFlow = isLiveFlowContainer(liveNewParent);
          const liveTargetIsPage = liveNewParent.hasAttribute("data-z10-page");

          if (liveTargetIsFlow && !liveTargetIsPage && liveElement.style.position === "absolute") {
            liveElement.style.removeProperty("position");
            liveElement.style.removeProperty("left");
            liveElement.style.removeProperty("top");
          } else if ((!liveTargetIsFlow || liveTargetIsPage) && liveSourceIsFlow && liveElement.style.position !== "absolute") {
            liveElement.style.position = "absolute";
            if (liveDraggedRect && livePageRect) {
              liveElement.style.left = `${Math.round(liveDraggedRect.left - livePageRect.left)}px`;
              liveElement.style.top = `${Math.round(liveDraggedRect.top - livePageRect.top)}px`;
            }
          }
        }

        if (dropIndicator === "before") {
          liveTarget.parentElement?.insertBefore(liveElement, liveTarget);
        } else if (dropIndicator === "after") {
          if (liveTarget.nextSibling) {
            liveTarget.parentElement?.insertBefore(liveElement, liveTarget.nextSibling);
          } else {
            liveTarget.parentElement?.appendChild(liveElement);
          }
        } else {
          liveTarget.appendChild(liveElement);
        }
      }

      setDropIndicator(null);
    },
    [node.id, dropIndicator, content, updateContent, transformRef]
  );

  return (
    <div className="relative">
      {/* Drop indicator: before */}
      {dropIndicator === "before" && (
        <div
          className="pointer-events-none absolute left-2 right-2 z-10"
          style={{ top: -1, height: 2, backgroundColor: "#3b82f6", borderRadius: 1 }}
        >
          <div
            className="absolute rounded-full"
            style={{ left: -3, top: -2, width: 6, height: 6, backgroundColor: "#3b82f6" }}
          />
        </div>
      )}

      <div
        ref={rowRef}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={() => setHoveredLayerId(node.id)}
        onMouseLeave={() => setHoveredLayerId(null)}
        className="group flex items-center gap-1.5 rounded-sm py-1 text-[12px]"
        style={{
          paddingLeft: (node.depth - 1) * 14 + 12,
          paddingRight: 4,
          backgroundColor: dropIndicator === "inside"
            ? "rgba(59, 130, 246, 0.12)"
            : isSelected
              ? "var(--ed-selected-bg)"
              : "transparent",
          color: isSelected ? "var(--ed-selected-text)" : "var(--ed-text)",
          opacity: isDragging ? 0.4 : isHidden ? 0.4 : 1,
          cursor: "default",
          outline: dropIndicator === "inside" ? "1px dashed #3b82f6" : "none",
          outlineOffset: "-1px",
        }}
        onClick={(e) => select(node.id, e.shiftKey)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed(node.id);
            }}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center"
            style={{ color: isSelected ? "var(--ed-selected-text)" : "var(--ed-icon-color)" }}
          >
            <ChevronRight
              size={10}
              strokeWidth={1.5}
              className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            />
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Type icon */}
        <TypeIcon type={node.type} isSelected={isSelected} />

        {/* Name */}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {/* Hover actions */}
        <div className="flex flex-shrink-0 items-center gap-0 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleVisibility(node.id);
            }}
            className="flex h-4 w-4 items-center justify-center rounded"
            style={{ color: "var(--ed-icon-color)" }}
            title={isHidden ? "Show" : "Hide"}
          >
            {isHidden ? (
              <EyeOff size={12} strokeWidth={1.5} />
            ) : (
              <Eye size={12} strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLock(node.id);
            }}
            className="flex h-4 w-4 items-center justify-center rounded"
            style={{ color: "var(--ed-icon-color)" }}
            title={isLocked ? "Unlock" : "Lock"}
          >
            {isLocked ? (
              <Lock size={12} strokeWidth={1.5} />
            ) : (
              <Unlock size={12} strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {/* Drop indicator: after */}
      {dropIndicator === "after" && (
        <div
          className="pointer-events-none absolute left-2 right-2 z-10"
          style={{ bottom: -1, height: 2, backgroundColor: "#3b82f6", borderRadius: 1 }}
        >
          <div
            className="absolute rounded-full"
            style={{ left: -3, top: -2, width: 6, height: 6, backgroundColor: "#3b82f6" }}
          />
        </div>
      )}

      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <LayerRow key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Type icons (Lucide, Paper-style) ────────────────────────

function TypeIcon({ type, isSelected }: { type: LayerNode["type"]; isSelected: boolean }) {
  const color = isSelected ? "var(--ed-selected-text)" : "var(--ed-icon-color)";
  const props = { size: 14, strokeWidth: 1, style: { color, flexShrink: 0 } as React.CSSProperties };

  switch (type) {
    case "page":
      return <Square {...props} />;
    case "frame":
      return <Frame {...props} />;
    case "text":
      return <Type {...props} />;
    case "component":
      return <Diamond {...props} style={{ ...props.style, color: isSelected ? props.style.color : COMPONENT_COLOR }} />;
    case "element":
      return <Box {...props} />;
  }
}

// ─── Filter nodes by search ─────────────────────────────────

function filterNodes(nodes: LayerNode[], search: string): LayerNode[] {
  const result: LayerNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterNodes(node.children, search);
    if (
      node.name.toLowerCase().includes(search) ||
      node.id.toLowerCase().includes(search) ||
      filteredChildren.length > 0
    ) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

// ─── Flow container detection helpers ────────────────────────

/** Check if an element in the content model (DOMParser) is a flow container */
function isFlowContainer(el: HTMLElement): boolean {
  const display = el.style.display || "";
  return (
    display === "flex" ||
    display === "inline-flex" ||
    display === "grid" ||
    display === "block" ||
    display === "" ||
    display === "inline-block"
  );
}

/** Check if a live DOM element is a flow container using computed styles */
function isLiveFlowContainer(el: HTMLElement): boolean {
  const display = window.getComputedStyle(el).display;
  return (
    display === "flex" ||
    display === "inline-flex" ||
    display === "grid" ||
    display === "block" ||
    display === "inline-block"
  );
}
