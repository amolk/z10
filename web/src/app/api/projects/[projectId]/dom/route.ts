/**
 * GET /api/projects/:id/dom
 *
 * Return the current project DOM HTML and checksum.
 *
 * Query params:
 *   ?compact=true  — return compact tree view instead of full HTML
 *   ?page=<pageId> — return specific page (future use)
 *
 * Response:
 *   { html: string, checksum: string }
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function getChecksum() {
  const { computeChecksum } = await import("z10/cli/checksum");
  return computeChecksum;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { userId } = authResult;

  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const html = project.content ?? "";
  const computeChecksum = await getChecksum();
  const checksum = computeChecksum(html);

  const url = new URL(request.url);
  const compact = url.searchParams.get("compact") === "true";

  if (compact) {
    // Return compact tree view
    const { compactTreeView } = await import("z10/cli/dom");
    return NextResponse.json({
      html: compactTreeView(html),
      checksum,
    });
  }

  return NextResponse.json({ html, checksum });
}
