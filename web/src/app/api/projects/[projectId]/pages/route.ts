/**
 * GET /api/projects/:id/pages
 *
 * Return the list of pages in the project.
 *
 * Response:
 *   { pages: Array<{ name: string, rootNodeId: string, mode: string }> }
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCanonicalDOM, getCanonicalHTML } from "@/lib/canonical-dom";
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

  // Read from canonical DOM (live in-memory state) rather than the DB's
  // content column, which lags behind due to batched persistence.
  const canonical = await getCanonicalDOM(projectId, async () => {
    const [project] = await db
      .select({ content: projects.content, lastTxId: projects.lastTxId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
    if (!project) return null;
    return { html: project.content ?? "", lastTxId: project.lastTxId };
  });

  if (!canonical) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = getCanonicalHTML(projectId) ?? "";

  // Extract pages from z10 HTML content using the data-z10-page attribute pattern
  const pages: Array<{ name: string; rootNodeId: string; mode: string }> = [];
  const pageRe = /<div\s+([^>]*data-z10-page="([^"]*)"[^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pageRe.exec(content)) !== null) {
    const attrs = match[1];
    const name = match[2];
    const idMatch = attrs.match(/data-z10-id="([^"]*)"/);
    const modeMatch = attrs.match(/data-z10-mode="([^"]*)"/);
    pages.push({
      name,
      rootNodeId: idMatch?.[1] ?? "",
      mode: modeMatch?.[1] ?? "light",
    });
  }

  return NextResponse.json({ pages });
}
