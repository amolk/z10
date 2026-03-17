/**
 * C4. GET /api/projects/:id/sync
 *
 * Initial sync endpoint. Returns the full serialized document (with all
 * data-z10-id + data-z10-ts-* metadata) plus the current transaction ID.
 *
 * New clients bootstrap from this, then subscribe to the patch stream.
 * Replaces the old /api/projects/:id/dom endpoint (which returned stripped
 * HTML + checksum).
 *
 * Response: { html: string, txId: number }
 *
 * §7.5
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCanonicalDOM,
  getCanonicalHTML,
  getCurrentTxId,
} from "@/lib/canonical-dom";
import { ensureCanonicalConfigured } from "@/lib/ensure-canonical-configured";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  ensureCanonicalConfigured();

  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { userId } = authResult;

  // Get or load canonical DOM for this project
  const canonical = await getCanonicalDOM(projectId, async () => {
    const [project] = await db
      .select({ content: projects.content, lastTxId: projects.lastTxId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

    if (!project) return null;
    return { html: project.content ?? "", lastTxId: project.lastTxId };
  });

  if (!canonical) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const html = getCanonicalHTML(projectId) ?? "";
  const txId = getCurrentTxId(projectId) ?? 0;

  return NextResponse.json({ html, txId });
}
