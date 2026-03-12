"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentOperation } from "@/lib/use-agent-stream";
import type { AgentConnectionState } from "@/lib/use-agent-stream";
import { Table2, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Agent Activity Panel — real-time log of MCP agent operations.
 *
 * Shows as a collapsible panel at the bottom of the canvas area.
 * Each entry shows the tool name, operation type, affected elements,
 * and timestamp. Scrolls to newest entry automatically.
 */
export function AgentActivityPanel({
  operations,
  connectionState,
  onClear,
}: {
  operations: AgentOperation[];
  connectionState: AgentConnectionState;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-expand when first operation arrives
  useEffect(() => {
    if (operations.length === 1 && !expanded) {
      setExpanded(true);
    }
  }, [operations.length, expanded]);

  // Auto-scroll to bottom on new operations
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [operations.length, expanded]);

  const isActive = connectionState === "connected" && operations.length > 0;
  if (!isActive && !expanded) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 border-t backdrop-blur-sm"
      style={{
        borderColor: "var(--ed-panel-border)",
        backgroundColor: "var(--ed-overlay-bg)",
      }}
    >
      {/* Header / toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs"
      >
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-medium" style={{ color: "var(--ed-text)" }}>
            <Table2 size={12} strokeWidth={1.5} style={{ color: "var(--ed-icon-color)" }} />
            Agent Activity
          </span>
          <span
            className="rounded px-1.5 py-0.5"
            style={{ backgroundColor: "var(--ed-badge-bg)", color: "var(--ed-badge-text)" }}
          >
            {operations.length}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {operations.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              style={{ color: "var(--ed-text-tertiary)" }}
            >
              Clear
            </span>
          )}
          <ChevronDown
            size={10}
            strokeWidth={1.5}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            style={{ color: "var(--ed-text-tertiary)" }}
          />
        </span>
      </button>

      {/* Operation log */}
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto px-1 pb-1"
        >
          {operations.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs" style={{ color: "var(--ed-text-tertiary)" }}>
              No agent operations yet. Connect an agent to see activity here.
            </p>
          ) : (
            <div className="space-y-px">
              {operations.map((op, i) => (
                <OperationEntry key={`${op.timestamp}-${i}`} op={op} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OperationEntry({ op, index }: { op: AgentOperation; index: number }) {
  const [showResult, setShowResult] = useState(false);

  return (
    <div className="group rounded px-2 py-1" style={{ cursor: "default" }}>
      <div className="flex items-center gap-2">
        {/* Operation icon */}
        <span className="shrink-0">{getOperationIcon(op.operation)}</span>

        {/* Tool name */}
        <span className="text-xs font-medium" style={{ color: "var(--ed-text)" }}>
          {formatToolName(op.tool)}
        </span>

        {/* Affected IDs */}
        {op.affectedIds.length > 0 && (
          <span className="truncate text-xs" style={{ color: "var(--ed-text-tertiary)" }}>
            {op.affectedIds.length === 1
              ? op.affectedIds[0]
              : `${op.affectedIds.length} elements`}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Timestamp */}
        <span className="shrink-0 text-xs" style={{ color: "var(--ed-text-tertiary)" }}>
          {formatTime(op.timestamp)}
        </span>

        {/* Expand result */}
        <button
          onClick={() => setShowResult(!showResult)}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "var(--ed-icon-color)" }}
          title="Show result"
        >
          {showResult ? (
            <ChevronUp size={10} strokeWidth={1.5} />
          ) : (
            <ChevronDown size={10} strokeWidth={1.5} />
          )}
        </button>

        {/* Index (for per-operation undo reference) */}
        <span className="shrink-0 text-xs" style={{ color: "var(--ed-text-tertiary)" }}>#{index + 1}</span>
      </div>

      {/* Expandable result */}
      {showResult && op.toolResult && (
        <pre
          className="mt-1 max-h-24 overflow-auto rounded px-2 py-1 text-xs"
          style={{ backgroundColor: "var(--ed-hover-bg)", color: "var(--ed-text-secondary)" }}
        >
          {formatResult(op.toolResult)}
        </pre>
      )}
    </div>
  );
}

function getOperationIcon(operation: AgentOperation["operation"]): string {
  switch (operation) {
    case "add":
      return "🟢";
    case "modify":
      return "🟡";
    case "remove":
      return "🔴";
    case "define":
      return "🔵";
    case "batch":
      return "📦";
    default:
      return "⚪";
  }
}

function formatToolName(tool: string): string {
  return tool
    .replace(/^z10_/, "")
    .replace(/^write_/, "")
    .replace(/_/g, " ");
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
}
