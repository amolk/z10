"use client";

/**
 * D4. useTransact — hook for sending human edits to the server.
 *
 * Posts JS code to POST /api/projects/:id/transact without a manifest
 * (trusted browser mode). The server builds a fresh manifest from the
 * canonical DOM, executes the code through the transaction engine, and
 * broadcasts the resulting patch to all clients.
 *
 * The human's browser DOM already has the edit applied optimistically;
 * the incoming patch via SSE is skipped (self-dedup via txId tracking).
 *
 * §10.2
 */

import { useCallback, useRef } from "react";

export type TransactResult =
  | { status: "committed"; txId: number }
  | { status: "rejected"; reason: string }
  | { status: "error"; error: string };

/**
 * Hook that returns a `transact` function for sending edits to the server.
 * Tracks all txIds we originated so `usePatchStream` can skip them.
 */
export function useTransact(projectId: string) {
  // Set of txIds originated by this browser tab — shared via ref for dedup
  const ownTxIds = useRef<Set<number>>(new Set());

  const transact = useCallback(
    async (
      code: string,
      subtreeRootNid?: string | null,
    ): Promise<TransactResult> => {
      if (!code.trim()) return { status: "error", error: "Empty code" };

      try {
        const res = await fetch(`/api/projects/${projectId}/transact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            manifest: null, // D4: trusted browser mode — server builds fresh manifest
            subtreeRootNid: subtreeRootNid ?? null,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return { status: "error", error: `HTTP ${res.status}: ${text}` };
        }

        const data = await res.json();

        if (data.status === "committed") {
          // Track our own txId for self-dedup in usePatchStream
          ownTxIds.current.add(data.txId);
          // Prune old txIds to prevent unbounded growth (keep last 100)
          if (ownTxIds.current.size > 100) {
            const arr = Array.from(ownTxIds.current);
            ownTxIds.current = new Set(arr.slice(-50));
          }
          return { status: "committed", txId: data.txId };
        }

        return {
          status: "rejected",
          reason: data.reason || "Transaction rejected",
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [projectId],
  );

  /**
   * Check if a txId was originated by this browser tab.
   * Used by usePatchStream to skip replaying our own patches.
   */
  const isOwnTx = useCallback(
    (txId: number): boolean => ownTxIds.current.has(txId),
    [],
  );

  return { transact, isOwnTx, ownTxIds };
}
