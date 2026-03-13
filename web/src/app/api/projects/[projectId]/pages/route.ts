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

  const content = project.content ?? "";

  // Extract pages from z10 HTML content using the data-z10-page attribute pattern
  const pages: Array<{ name: string; rootNodeId: string; mode: string }> = [];
  const pageRe = /<div\s+([^>]*data-z10-page="([^"]*)"[^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pageRe.exec(content)) !== null) {
    const attrs = match[1];
    const name = match[2];
    const idMatch = attrs.match(/id="([^"]*)"/);
    const modeMatch = attrs.match(/data-z10-mode="([^"]*)"/);
    pages.push({
      name,
      rootNodeId: idMatch?.[1] ?? "",
      mode: modeMatch?.[1] ?? "light",
    });
  }

  return NextResponse.json({ pages });
}
