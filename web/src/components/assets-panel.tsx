"use client";

import { useState } from "react";
import { useEditor } from "@/lib/editor-state";
import { COMPONENT_COLOR } from "@/lib/editor-constants";
import { Diamond, Search } from "lucide-react";
import { toTagName } from "z10/core";

/**
 * Component library browser.
 * Shows registered Web Components grouped by category with search.
 */
export function AssetsPanel() {
  const { componentList } = useEditor();
  const [search, setSearch] = useState("");

  const filtered = search
    ? componentList.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : componentList;

  return (
    <div className="flex h-full flex-col" style={{ color: "var(--ed-text)" }}>
      {/* Search */}
      <div className="px-3 py-2">
        <div
          className="flex items-center gap-1.5 rounded px-2 py-1"
          style={{ backgroundColor: "var(--ed-input-bg)" }}
        >
          <Search size={12} style={{ color: "var(--ed-text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components..."
            className="w-full bg-transparent text-[12px] outline-none"
            style={{ color: "var(--ed-text)" }}
          />
        </div>
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <div
            className="px-3 py-6 text-center text-[11px]"
            style={{ color: "var(--ed-text-tertiary)" }}
          >
            {componentList.length === 0
              ? "No components registered. Use z10 component create to add one."
              : "No matching components."}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 py-1">
            {filtered.map((name) => (
              <button
                key={name}
                className="flex items-center gap-2 rounded px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--ed-hover-bg)]"
                title={`Drag to canvas or use: z10 exec to create <${toTagName(name)}>`}
              >
                <Diamond size={14} strokeWidth={1} style={{ color: COMPONENT_COLOR, flexShrink: 0 }} />
                <span>{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
