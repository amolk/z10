/**
 * POST /api/projects/:id/exec
 *
 * Execute JavaScript against a project's DOM.
 *
 * Supports two modes:
 *
 * 1. Script mode (streaming): { script: string, pageRootId?: string }
 *    - Parses script into statements
 *    - Executes each statement with const/let → var rewriting
 *    - Streams NDJSON results per statement
 *    - Emits SSE per statement for real-time canvas updates
 *
 * 2. Single statement mode (legacy): { statement: string, localChecksum: string, pageRootId?: string }
 *    - Executes one statement
 *    - Returns JSON { success, checksum, error? }
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { projectEvents } from "@/lib/project-events";

// Use dynamic import for CLI modules that may use Node.js APIs
async function getExecModules() {
  const {
    parseStatements,
    rewriteDeclarations,
    createExecEnvironment,
    executeStatement,
    summarizeStatement,
  } = await import("z10/cli/exec");
  const { computeChecksum } = await import("z10/cli/checksum");
  return {
    parseStatements,
    rewriteDeclarations,
    createExecEnvironment,
    executeStatement,
    summarizeStatement,
    computeChecksum,
  };
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

  // Script mode: streaming per-statement execution
  if ("script" in body) {
    return handleScriptExec(body, project, projectId, userId);
  }

  // Legacy single-statement mode
  return handleSingleStatement(body, project, projectId, userId);
}

async function handleScriptExec(
  body: { script: string; pageRootId?: string },
  project: { content: string | null },
  projectId: string,
  userId: string
) {
  const { script, pageRootId } = body;

  if (typeof script !== "string" || !script.trim()) {
    return NextResponse.json(
      { error: "Missing script" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const {
          parseStatements,
          rewriteDeclarations,
          createExecEnvironment,
          executeStatement,
          summarizeStatement,
          computeChecksum,
        } = await getExecModules();

        // Parse statements
        let statements: string[];
        try {
          statements = parseStatements(script);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", error: msg, checksum: "" }) + "\n"
            )
          );
          controller.close();
          return;
        }

        // Create execution environment scoped to page
        const currentHtml = project.content ?? "";
        const { context, getHtml } = createExecEnvironment(
          currentHtml,
          pageRootId
        );

        let allSuccess = true;

        for (const stmt of statements) {
          // Rewrite const/let → var for cross-statement variable persistence
          const rewritten = rewriteDeclarations(stmt);
          const result = executeStatement(rewritten, context);
          const html = getHtml();
          const checksum = computeChecksum(html);

          if (!result.success) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "result",
                  statement: summarizeStatement(stmt),
                  success: false,
                  error: result.error,
                  checksum,
                }) + "\n"
              )
            );
            allSuccess = false;
            break;
          }

          // Emit SSE for real-time canvas update
          projectEvents.emit({
            type: "content-updated",
            projectId,
            content: html,
            tool: "cli-exec",
            operation: "modify",
            affectedIds: [],
            toolResult: JSON.stringify({ statement: summarizeStatement(stmt) }),
            timestamp: new Date().toISOString(),
          });

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "result",
                statement: summarizeStatement(stmt),
                success: true,
                checksum,
              }) + "\n"
            )
          );
        }

        // Persist final DOM state if all succeeded
        const finalHtml = getHtml();
        const finalChecksum = computeChecksum(finalHtml);

        if (allSuccess) {
          await db
            .update(projects)
            .set({ content: finalHtml, updatedAt: new Date() })
            .where(
              and(eq(projects.id, projectId), eq(projects.ownerId, userId))
            );
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "done",
              success: allSuccess,
              checksum: finalChecksum,
            }) + "\n"
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", error: msg, checksum: "" }) + "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

async function handleSingleStatement(
  body: { statement: string; localChecksum: string; pageRootId?: string },
  project: { content: string | null },
  projectId: string,
  userId: string
) {
  const { statement, localChecksum, pageRootId } = body;

  if (typeof statement !== "string" || !statement.trim()) {
    return NextResponse.json(
      { success: false, error: "Missing statement", checksum: "" },
      { status: 400 }
    );
  }

  try {
    const { createExecEnvironment, executeStatement, computeChecksum } =
      await getExecModules();

    const currentHtml = project.content ?? "";
    const { context, getHtml } = createExecEnvironment(currentHtml, pageRootId);

    const result = executeStatement(statement, context);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        checksum: computeChecksum(getHtml()),
        error: result.error,
      });
    }

    const newHtml = getHtml();
    const serverChecksum = computeChecksum(newHtml);

    await db
      .update(projects)
      .set({ content: newHtml, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

    projectEvents.emit({
      type: "content-updated",
      projectId,
      content: newHtml,
      tool: "cli-exec",
      operation: "modify",
      affectedIds: [],
      toolResult: JSON.stringify({ statement }),
      timestamp: new Date().toISOString(),
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
