/**
 * C3 + C5. SSE endpoint for real-time patch streaming with reconnection.
 *
 * Clients connect here to receive PatchEnvelope events as they are committed
 * to the canonical DOM. Used by CLI (B5) for keeping its local replica in sync.
 *
 * Query params:
 *   ?lastSeenTxId=N  — replay missed patches from ring buffer on connect (C5)
 *
 * Events:
 *   data: {"type":"connected","projectId":"...","txId":N}
 *   data: {"type":"patch","patch":{txId,timestamp,ops}}
 *   data: {"type":"resync","html":"...","txId":N}     — gap too large, full resync
 *   data: {"type":"heartbeat"}
 *
 * Reconnection protocol (C5, §7.4):
 *   Client sends ?lastSeenTxId=N. Server replays missed patches from ring buffer.
 *   If gap exceeds buffer capacity, sends "resync" event with full document.
 *
 * GET /api/projects/[projectId]/patches
 *
 * §7.1, §7.2, §7.4
 */

import { authenticateMcp } from "@/lib/mcp-auth";
import { patchBroadcast } from "@/lib/patch-broadcast";
import { getCurrentTxId, getPatches, getCanonicalHTML } from "@/lib/canonical-dom";

export const dynamic = "force-dynamic";

// Per-user SSE connection counter to bound aggregate load
const sseConnectionsPerUser = new Map<string, number>();
const MAX_SSE_PER_USER = 20;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { projectId } = await params;
  const userId = authResult.userId;

  // Enforce per-user SSE connection limit
  const currentConns = sseConnectionsPerUser.get(userId) ?? 0;
  if (currentConns >= MAX_SSE_PER_USER) {
    return new Response(JSON.stringify({ error: "Too many SSE connections" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  sseConnectionsPerUser.set(userId, currentConns + 1);

  // Parse lastSeenTxId from query params for reconnection (C5)
  const url = new URL(request.url);
  const lastSeenParam = url.searchParams.get("lastSeenTxId");
  const lastSeenTxId = lastSeenParam ? parseInt(lastSeenParam, 10) : null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Send initial connection confirmation with current txId
      const txId = getCurrentTxId(projectId) ?? 0;
      send(JSON.stringify({ type: "connected", projectId, txId }));

      // Buffer patches that arrive during replay to avoid lost-patch window
      type PatchMsg = { txId: number; [key: string]: unknown };
      const pendingPatches: PatchMsg[] = [];
      let replayDone = false;

      // Subscribe FIRST to capture any patches committed during replay
      const unsubscribe = patchBroadcast.subscribe(projectId, (patch) => {
        if (!replayDone) {
          pendingPatches.push(patch as unknown as PatchMsg);
        } else {
          send(JSON.stringify({ type: "patch", patch }));
        }
      });

      // Subscribe to resync broadcasts (e.g. after component create/delete)
      const unsubscribeResync = patchBroadcast.subscribeResync(projectId, (html, txId) => {
        send(JSON.stringify({ type: "resync", html, txId }));
      });

      // C5: Replay missed patches on reconnection
      let highestReplayedTxId = lastSeenTxId ?? txId;
      if (lastSeenTxId !== null && !isNaN(lastSeenTxId) && lastSeenTxId < txId) {
        const missed = getPatches(projectId, lastSeenTxId);
        if (missed === null) {
          // Gap too large — send full resync
          const html = getCanonicalHTML(projectId) ?? "";
          send(JSON.stringify({ type: "resync", html, txId }));
          highestReplayedTxId = txId;
        } else {
          for (const patch of missed) {
            send(JSON.stringify({ type: "patch", patch }));
            const patchTxId = (patch as unknown as PatchMsg).txId;
            if (typeof patchTxId === "number" && patchTxId > highestReplayedTxId) {
              highestReplayedTxId = patchTxId;
            }
          }
        }
      }

      // Flush pending patches (skip any already replayed)
      replayDone = true;
      for (const patch of pendingPatches) {
        if (typeof patch.txId !== "number" || patch.txId > highestReplayedTxId) {
          send(JSON.stringify({ type: "patch", patch }));
        }
      }

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "heartbeat" }));
      }, 30_000);

      // Cleanup on client disconnect
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        unsubscribeResync();
        // Decrement per-user SSE connection count
        const count = sseConnectionsPerUser.get(userId) ?? 1;
        if (count <= 1) {
          sseConnectionsPerUser.delete(userId);
        } else {
          sseConnectionsPerUser.set(userId, count - 1);
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
