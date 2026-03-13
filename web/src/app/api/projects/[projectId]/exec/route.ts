/**
 * POST /api/projects/:id/exec
 *
 * Execute a JavaScript statement against a project's DOM.
 * Used by the z10 CLI for per-statement server sync.
 *
 * Request body:
 *   { statement: string, localChecksum: string }
 *
 * Response:
 *   { success: true, checksum: string }
 *   { success: false, checksum: string, error: string }
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { projectEvents } from "@/lib/project-events";
import {
  parseZ10Html,
  serializeZ10Html,
  createDocumentWithPage,
} from "z10";

// Use dynamic import for CLI modules that may use Node.js APIs
async function getExecModules() {
  const { parseStatements, createExecEnvironment, executeStatement } = await import("z10/cli/exec");
  const { computeChecksum } = await import("z10/cli/checksum");
  return { parseStatements, createExecEnvironment, executeStatement, computeChecksum };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { userId } = authResult;

  // Load project
  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { statement, localChecksum } = body as {
    statement: string;
    localChecksum: string;
  };

  if (typeof statement !== "string" || !statement.trim()) {
    return NextResponse.json(
      { success: false, error: "Missing statement", checksum: "" },
      { status: 400 }
    );
  }

  try {
    const { createExecEnvironment, executeStatement, computeChecksum } =
      await getExecModules();

    // Parse existing content into DOM
    const currentHtml = project.content ?? "";
    const { context, getHtml } = createExecEnvironment(currentHtml);

    // Execute the statement
    const result = executeStatement(statement, context);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        checksum: computeChecksum(getHtml()),
        error: result.error,
      });
    }

    // Compute server-side checksum
    const newHtml = getHtml();
    const serverChecksum = computeChecksum(newHtml);

    // Persist to database
    await db
      .update(projects)
      .set({ content: newHtml, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

    // Notify SSE subscribers
    projectEvents.emit(projectId, {
      type: "content-update",
      content: newHtml,
      source: "cli-exec",
    });

    return NextResponse.json({
      success: true,
      checksum: serverChecksum,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, checksum: "", error: msg },
      { status: 500 }
    );
  }
}
