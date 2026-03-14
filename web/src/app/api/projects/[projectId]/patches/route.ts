/**
 * C3. SSE endpoint for real-time patch streaming.
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
 *   data: {"type":"heartbeat"}
 *
 * GET /api/projects/[projectId]/patches
 *
 * §7.1, §7.2
 */

import { authenticateMcp } from "@/lib/mcp-auth";
import { patchBroadcast } from "@/lib/patch-broadcast";
import { getCurrentTxId } from "@/lib/canonical-dom";

export const dynamic = "force-dynamic";

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

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "heartbeat" }));
      }, 30_000);

      // Subscribe to patch broadcasts
      const unsubscribe = patchBroadcast.subscribe(projectId, (patch) => {
        send(JSON.stringify({ type: "patch", patch }));
      });

      // Cleanup on client disconnect
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
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
