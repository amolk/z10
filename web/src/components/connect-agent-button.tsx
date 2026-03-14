"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import type { PatchConnectionState } from "@/lib/use-patch-stream";

type ClientTab = "claude-code" | "cursor" | "other";

export function ConnectAgentButton({
  projectId,
  connectionState,
  lastTool,
}: {
  projectId: string;
  connectionState: PatchConnectionState;
  lastTool: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ClientTab>("claude-code");

  // Connect token state
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const projectUrl = `${baseUrl}/api/projects/${projectId}/mcp`;
  const globalUrl = `${baseUrl}/api/mcp`;

  const fetchToken = useCallback(async () => {
    setLoadingToken(true);
    setTokenError(null);
    try {
      const res = await fetch("/api/connect-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnectToken(data.token);
      } else {
        const data = await res.json().catch(() => ({}));
        setTokenError(data.error ?? `Failed to generate token (${res.status})`);
      }
    } catch {
      setTokenError("Network error — is the server running?");
    } finally {
      setLoadingToken(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) fetchToken();
  }, [open, fetchToken]);

  async function handleRegenerate() {
    setRegenerating(true);
    setTokenError(null);
    try {
      const res = await fetch("/api/connect-tokens", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnectToken(data.token);
      } else {
        const data = await res.json().catch(() => ({}));
        setTokenError(data.error ?? `Failed to regenerate token (${res.status})`);
      }
    } catch {
      setTokenError("Network error — is the server running?");
    } finally {
      setRegenerating(false);
    }
  }

  const authSnippet = connectToken ?? "loading...";

  function buildCommands(): Record<ClientTab, { label: string; instructions: string; command: string }> {
    const headerFlag = ` --header "Authorization: Bearer ${authSnippet}"`;

    return {
      "claude-code": {
        label: "Claude Code",
        instructions: "Run in your terminal to connect Claude Code:",
        command: `claude mcp add zero10 --transport http ${projectUrl}${headerFlag} --scope user`,
      },
      cursor: {
        label: "Cursor",
        instructions: "Add to your Cursor MCP settings (.cursor/mcp.json):",
        command: JSON.stringify(
          {
            mcpServers: {
              zero10: {
                url: projectUrl,
                headers: {
                  Authorization: `Bearer ${authSnippet}`,
                },
              },
            },
          },
          null,
          2
        ),
      },
      other: {
        label: "Other",
        instructions: "Use these endpoints with any MCP-compatible client:",
        command: [
          `Project endpoint: ${projectUrl}`,
          `Global endpoint:  ${globalUrl}`,
          `\nAuthorization header: Bearer ${authSnippet}`,
          `\nThe project endpoint connects directly to this project.`,
          `The global endpoint lets the agent select a project dynamically.`,
        ].join("\n"),
      },
    };
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const commands = buildCommands();
  const current = commands[activeTab];

  return (
    <>
      {/* Connected state: green dot + status text */}
      {(isConnected || isConnecting) ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ed-text-secondary)" }}>
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
          <span>
            {isConnected
              ? lastTool
                ? `Agent active \u00b7 ${formatToolName(lastTool)}`
                : "Agent connected"
              : "Connecting..."}
          </span>
        </div>
      ) : (
        /* Disconnected state: connect button */
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border px-3 py-1 text-[12px] font-medium transition-colors"
          style={{
            borderColor: "var(--ed-input-border)",
            color: "var(--ed-text)",
            backgroundColor: "var(--ed-panel-bg)",
          }}
        >
          <span className="flex items-center gap-1.5">
            <Plus size={11} strokeWidth={1.5} className="text-blue-500" />
            Connect Agent
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border p-6 shadow-2xl"
            style={{
              backgroundColor: "var(--ed-panel-bg)",
              borderColor: "var(--ed-panel-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold" style={{ color: "var(--ed-text)" }}>
              Connect an AI Agent
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--ed-text-secondary)" }}>
              Connect an MCP-compatible AI agent to edit this project in real-time.
            </p>

            {/* Client tabs */}
            <div
              className="mt-4 flex gap-1 rounded-md p-0.5"
              style={{ backgroundColor: "var(--ed-hover-bg)" }}
            >
              {(Object.keys(commands) as ClientTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === tab ? "var(--ed-tool-active-bg)" : "transparent",
                    color: activeTab === tab ? "var(--ed-text)" : "var(--ed-text-secondary)",
                  }}
                >
                  {commands[tab].label}
                </button>
              ))}
            </div>

            {/* Instructions */}
            <p className="mt-4 text-xs" style={{ color: "var(--ed-text-secondary)" }}>{current.instructions}</p>

            <div className="mt-2 flex items-start gap-2">
              {loadingToken ? (
                <div
                  className="flex-1 rounded-md px-3 py-2.5"
                  style={{ backgroundColor: "var(--ed-hover-bg)" }}
                >
                  <p className="text-xs animate-pulse" style={{ color: "var(--ed-text-tertiary)" }}>Generating connection command...</p>
                </div>
              ) : tokenError ? (
                <div className="flex-1 rounded-md border border-red-800/50 bg-red-950/30 px-3 py-2.5">
                  <p className="text-xs text-red-400">{tokenError}</p>
                  <button
                    onClick={fetchToken}
                    className="mt-1.5 text-xs text-red-300 underline underline-offset-2 transition-colors hover:text-red-200"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <pre
                  className="flex-1 overflow-x-auto rounded-md px-3 py-2.5 text-xs select-all whitespace-pre-wrap break-all font-mono"
                  style={{ backgroundColor: "var(--ed-hover-bg)", color: "var(--ed-text)" }}
                >
                  {current.command}
                </pre>
              )}
              <button
                onClick={() => handleCopy(current.command, activeTab)}
                disabled={loadingToken || !connectToken}
                className="shrink-0 rounded-md border px-2.5 py-2 text-xs transition-colors disabled:opacity-50"
                style={{
                  borderColor: "var(--ed-input-border)",
                  color: "var(--ed-text)",
                }}
              >
                {copied === activeTab ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Token info + regenerate */}
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs" style={{ color: "var(--ed-text-tertiary)" }}>
                This token is scoped to this project and expires in 30 days.
              </p>
              <button
                onClick={handleRegenerate}
                disabled={regenerating || loadingToken}
                className="text-xs transition-colors disabled:opacity-50"
                style={{ color: "var(--ed-text-secondary)" }}
              >
                {regenerating ? "Regenerating..." : "Regenerate"}
              </button>
            </div>

            {/* How it works */}
            <div
              className="mt-4 rounded-md px-3 py-2.5"
              style={{ backgroundColor: "var(--ed-hover-bg)" }}
            >
              <p className="text-xs font-medium" style={{ color: "var(--ed-text)" }}>How it works</p>
              <ul className="mt-1.5 space-y-1 text-xs" style={{ color: "var(--ed-text-secondary)" }}>
                <li>1. Agent connects via MCP and gets read/write access to this project</li>
                <li>2. Changes appear in the editor in real-time as the agent works</li>
                <li>3. A green indicator shows when an agent is actively connected</li>
              </ul>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: "var(--ed-hover-bg)",
                  color: "var(--ed-text)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatToolName(tool: string): string {
  return tool
    .replace(/^z10_/, "")
    .replace(/^write_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
