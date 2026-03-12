"use client";

import type { AgentConnectionState } from "@/lib/use-agent-stream";

export function AgentStatusIndicator({
  connectionState,
  lastTool,
}: {
  connectionState: AgentConnectionState;
  lastTool: string | null;
}) {
  if (connectionState === "disconnected") return null;

  const isConnected = connectionState === "connected";

  return (
    <div
      className="pointer-events-auto flex items-center gap-2 rounded-md border px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
      style={{
        backgroundColor: "var(--ed-overlay-bg)",
        borderColor: "var(--ed-overlay-border)",
      }}
    >
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isConnected ? "bg-green-500" : "bg-yellow-500"
          }`}
        />
      </span>

      <span className="text-[12px]" style={{ color: "var(--ed-text-secondary)" }}>
        {isConnected
          ? lastTool
            ? `Agent active · ${formatToolName(lastTool)}`
            : "Agent connected"
          : "Connecting..."}
      </span>
    </div>
  );
}

function formatToolName(tool: string): string {
  return tool
    .replace(/^z10_/, "")
    .replace(/^write_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
