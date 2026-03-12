"use client";

import { useEffect } from "react";
import { useEditor, type ToolType } from "@/lib/editor-state";
import { MousePointer2, Hand, Frame, Type } from "lucide-react";

const TOOLS: { id: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    id: "select",
    label: "Move / Select",
    shortcut: "V",
    icon: <MousePointer2 size={20} strokeWidth={1} />,
  },
  {
    id: "hand",
    label: "Hand",
    shortcut: "H",
    icon: <Hand size={20} strokeWidth={1} />,
  },
  {
    id: "frame",
    label: "Frame",
    shortcut: "F",
    icon: <Frame size={20} strokeWidth={1} />,
  },
  {
    id: "text",
    label: "Text",
    shortcut: "T",
    icon: <Type size={20} strokeWidth={1} />,
  },
];

export function ToolsToolbar() {
  const { activeTool, setActiveTool } = useEditor();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === key);
      if (tool) {
        e.preventDefault();
        setActiveTool(tool.id);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool]);

  return (
    <div className="flex flex-col items-center py-1">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className="flex h-9 w-10 items-center justify-center rounded-sm transition-colors"
            style={{
              color: "var(--ed-text)",
              opacity: isActive ? 1 : 0.55,
              backgroundColor: isActive ? "var(--ed-tool-active-bg)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.opacity = "0.8";
                e.currentTarget.style.backgroundColor = "var(--ed-hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.opacity = "0.55";
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {tool.icon}
          </button>
        );
      })}
    </div>
  );
}
