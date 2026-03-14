"use client";

/**
 * D1. WebSocket/SSE connection for real-time patch streaming.
 *
 * Connects to the /patches SSE endpoint to receive PatchEnvelope events
 * as they are committed to the canonical DOM. Replaces the old useAgentStream
 * hook that received full serialized content.
 *
 * Uses EventSource (native browser SSE) with the same protocol as the CLI
 * patch stream (B5). Authentication is via session cookies (handled by
 * authenticateMcp which tries NextAuth session first).
 *
 * Connection lifecycle:
 *   1. Connect to /api/projects/:id/patches?lastSeenTxId=N
 *   2. Receive "connected" event with current txId
 *   3. Receive "patch" events as agent/human edits are committed
 *   4. On disconnect: exponential backoff reconnect with lastSeenTxId
 *   5. On reconnect: server replays missed patches or sends full resync
 *
 * §7.1, §10.1
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  PatchEnvelope,
  PatchOp,
} from "../../../src/dom/patch-serialize.js";

export type PatchConnectionState = "disconnected" | "connecting" | "connected";

/** A parsed SSE event from the /patches endpoint */
export type PatchStreamEvent =
  | { type: "connected"; projectId: string; txId: number }
  | { type: "patch"; patch: PatchEnvelope }
  | { type: "resync"; html: string; txId: number }
  | { type: "heartbeat" };

/**
 * Hook that connects to the patch SSE stream for a project.
 *
 * Returns the connection state, the last txId seen, and callbacks for
 * consumers to handle incoming patches and resyncs.
 *
 * @param projectId - The project to connect to
 * @param onPatch - Called when a patch envelope is received
 * @param onResync - Called when a full resync is needed (gap too large)
 * @param isOwnTx - D4: Optional predicate to skip patches originated by this tab
 */
export function usePatchStream(
  projectId: string,
  onPatch: (patch: PatchEnvelope) => void,
  onResync: (html: string, txId: number) => void,
  isOwnTx?: (txId: number) => boolean,
) {
  const [connectionState, setConnectionState] =
    useState<PatchConnectionState>("disconnected");
  const lastTxIdRef = useRef<number>(0);
  const retryCountRef = useRef(0);
  const maxRetries = 10;

  // Store callbacks in refs to avoid reconnection on callback identity change
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;
  const onResyncRef = useRef(onResync);
  onResyncRef.current = onResync;
  const isOwnTxRef = useRef(isOwnTx);
  isOwnTxRef.current = isOwnTx;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      setConnectionState("connecting");

      const lastTxId = lastTxIdRef.current;
      const url =
        lastTxId > 0
          ? `/api/projects/${projectId}/patches?lastSeenTxId=${lastTxId}`
          : `/api/projects/${projectId}/patches`;

      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        if (disposed) return;
        setConnectionState("connected");
        retryCountRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data) as PatchStreamEvent;

          switch (data.type) {
            case "connected":
              lastTxIdRef.current = data.txId;
              break;

            case "patch":
              lastTxIdRef.current = data.patch.txId;
              // D4: Skip patches originated by this browser tab (already applied optimistically)
              if (isOwnTxRef.current?.(data.patch.txId)) break;
              onPatchRef.current(data.patch);
              break;

            case "resync":
              lastTxIdRef.current = data.txId;
              onResyncRef.current(data.html, data.txId);
              break;

            case "heartbeat":
              // Keep-alive, no action needed
              break;
          }
        } catch {
          // Malformed event — ignore
        }
      };

      eventSource.onerror = () => {
        if (disposed) return;
        setConnectionState("disconnected");
        eventSource?.close();
        eventSource = null;

        // Exponential backoff with jitter
        if (retryCountRef.current < maxRetries) {
          const baseDelay = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            30000,
          );
          const jitter = Math.random() * 1000;
          retryCountRef.current++;
          retryTimeout = setTimeout(connect, baseDelay + jitter);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
      setConnectionState("disconnected");
    };
  }, [projectId]);

  const resetConnection = useCallback(() => {
    retryCountRef.current = 0;
  }, []);

  return {
    connectionState,
    lastTxId: lastTxIdRef.current,
    resetConnection,
  };
}

// Re-export types for consumers
export type { PatchEnvelope, PatchOp };
