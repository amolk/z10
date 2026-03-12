"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor } from "./editor-state";
import type { OperationType } from "./project-events";

export type AgentConnectionState = "disconnected" | "connecting" | "connected";

/** A single agent operation event received from the SSE stream */
export type AgentOperation = {
  tool: string;
  operation: OperationType;
  affectedIds: string[];
  toolResult: string;
  timestamp: string;
};

/**
 * Connects to the SSE event stream for a project and applies
 * content updates from MCP agent writes to the editor state.
 *
 * Each MCP tool call triggers an immediate event (progressive streaming
 * per PRD 2.7), so the user sees elements appear/change in real-time.
 */
export function useAgentStream(projectId: string) {
  const { updateContent } = useEditor();
  const [connectionState, setConnectionState] =
    useState<AgentConnectionState>("disconnected");
  const [lastOperation, setLastOperation] = useState<AgentOperation | null>(
    null
  );
  const [operations, setOperations] = useState<AgentOperation[]>([]);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  const clearOperations = useCallback(() => setOperations([]), []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setConnectionState("connecting");
      eventSource = new EventSource(
        `/api/projects/${projectId}/events`
      );

      eventSource.onopen = () => {
        setConnectionState("connected");
        retryCountRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "content-updated") {
            // Apply content update immediately (progressive streaming)
            updateContent(data.content);

            // Track operation for highlighting and activity panel
            const op: AgentOperation = {
              tool: data.tool,
              operation: data.operation ?? "modify",
              affectedIds: data.affectedIds ?? [],
              toolResult: data.toolResult ?? "",
              timestamp: data.timestamp,
            };
            setLastOperation(op);
            setOperations((prev) => [...prev.slice(-99), op]); // Keep last 100
          }
          // heartbeat and connected events are handled implicitly (keep-alive)
        } catch {
          // Malformed event — ignore
        }
      };

      eventSource.onerror = () => {
        setConnectionState("disconnected");
        eventSource?.close();
        eventSource = null;

        // Exponential backoff retry
        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            30000
          );
          retryCountRef.current++;
          retryTimeout = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
      setConnectionState("disconnected");
    };
  }, [projectId, updateContent]);

  return { connectionState, lastOperation, operations, clearOperations };
}
