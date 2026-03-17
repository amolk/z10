/**
 * POST /api/projects/:id/flush
 *
 * Triggers immediate persistence of the canonical DOM to the database.
 * Used by:
 * - Cmd+S (explicit save)
 * - beforeunload via navigator.sendBeacon (crash safety)
 *
 * No request body needed — the server already holds the authoritative state
 * in the canonical DOM. This just forces an early persist to DB.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { persistCanonicalDOM, hasCanonicalDOM } from "@/lib/canonical-dom";
import { ensureCanonicalConfigured } from "@/lib/ensure-canonical-configured";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  ensureCanonicalConfigured();

  const { projectId } = await params;

  if (!hasCanonicalDOM(projectId)) {
    // No canonical DOM loaded — nothing to flush
    return NextResponse.json({ persisted: false, reason: "no-canonical-dom" });
  }

  try {
    await persistCanonicalDOM(projectId, true);
    return NextResponse.json({ persisted: true });
  } catch (err) {
    console.error(`[flush] Failed to persist project=${projectId}:`, err);
    return NextResponse.json(
      { error: "Persist failed" },
      { status: 500 },
    );
  }
}
