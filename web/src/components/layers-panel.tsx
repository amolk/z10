"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, type LayerNode } from "@/lib/editor-state";
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
  const { layers, activePageId, setActivePageId } = useEditor();
  const [search, setSearch] = useState("");

  const activePage = layers.find((p) => p.id === activePageId) || layers[0];
  const pageChildren = activePage?.children ?? [];

  const filteredLayers = search
    ? filterNodes(pageChildren, search.toLowerCase())
    : pageChildren;

  return (
    <aside
      className="flex w-[240px] flex-col border-r"
      style={{
        backgroundColor: "var(--ed-panel-bg)",
        borderColor: "var(--ed-panel-border)",
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
      <div className="flex-1 overflow-y-auto py-0.5">
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
}: {
  pages: LayerNode[];
  activePageId: string;
  onSelectPage: (id: string) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
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
      {pages.map((page) => (
        <button
          key={page.id}
          onClick={() => onSelectPage(page.id)}
          onContextMenu={(e) => handleContextMenu(e, page.id)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors"
          style={{
            backgroundColor: page.id === activePageId ? "var(--ed-selected-bg)" : "transparent",
            color: page.id === activePageId ? "var(--ed-selected-text)" : "var(--ed-text)",
          }}
        >
          {/* Page icon */}
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
              onBlur={() => setRenamingId(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setRenamingId(null);
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
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors"
            style={{ color: "var(--ed-text)" }}
          >
            Rename
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors"
            style={{ color: "var(--ed-text)" }}
          >
            Duplicate
          </button>
          <div className="my-1 border-t" style={{ borderColor: "var(--ed-section-border)" }} />
          <button
            onClick={() => setContextMenu(null)}
            className="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-red-500"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Layer Row (recursive tree node) ────────────────────────

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
  } = useEditor();

  const isSelected = selectedIds.has(node.id);
  const isHidden = hiddenIds.has(node.id);
  const isLocked = lockedIds.has(node.id);
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-sm py-1 text-[12px]"
        style={{
          paddingLeft: (node.depth - 1) * 14 + 12,
          paddingRight: 4,
          backgroundColor: isSelected ? "var(--ed-selected-bg)" : "transparent",
          color: isSelected ? "var(--ed-selected-text)" : "var(--ed-text)",
          opacity: isHidden ? 0.4 : 1,
          cursor: "default",
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
      return <Diamond {...props} />;
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
