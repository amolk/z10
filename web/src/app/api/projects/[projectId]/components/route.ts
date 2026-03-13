/**
 * GET /api/projects/:id/components
 *
 * List registered Web Components in the project.
 *
 * Response:
 *   { components: string[] }
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  parseZ10Html,
  createDocumentWithPage,
} from "z10";

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

  let doc;
  try {
    doc = project.content ? parseZ10Html(project.content) : createDocumentWithPage();
  } catch {
    doc = createDocumentWithPage();
  }

  const components = Array.from(doc.components.keys());

  return NextResponse.json({ components });
}
