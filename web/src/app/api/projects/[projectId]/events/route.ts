/**
 * SSE endpoint for real-time project updates.
 *
 * The editor connects here to receive live updates when an MCP agent
 * modifies the project. Events are pushed via the projectEvents bus.
 *
 * GET /api/projects/[projectId]/events
 */

import { auth } from "@/auth";
import { projectEvents, type ProjectEvent } from "@/lib/project-events";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
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

      // Send initial connection confirmation
      send(JSON.stringify({ type: "connected", projectId }));

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "heartbeat" }));
      }, 30_000);

      // Subscribe to project events
      const unsubscribe = projectEvents.subscribe(
        projectId,
        (event: ProjectEvent) => {
          send(JSON.stringify(event));
        }
      );

      // Cleanup on stream close
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      // AbortSignal from the request tells us when client disconnects
      _request.signal.addEventListener("abort", cleanup);
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
