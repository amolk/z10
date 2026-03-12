/**
 * Connect token endpoint — one-click agent connection.
 *
 * POST   /api/connect-tokens  — Get or create a connect token for a project
 * DELETE /api/connect-tokens  — Regenerate (revoke old + create new)
 *
 * Connect tokens are project-scoped, stored in plain text (re-displayable),
 * and auto-refresh their 30-day expiry on each use.
 */

import { auth } from "@/auth";
import { db } from "@/db";
import { connectTokens, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateConnectToken, CONNECT_TOKEN_TTL_MS } from "@/lib/mcp-auth";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST — Get existing token or create a new one for the given project.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const projectId = (body as { projectId?: string }).projectId;
  if (!projectId) {
    return json({ error: "projectId is required" }, 400);
  }

  // Verify user owns this project
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return json({ error: "Project not found" }, 404);
  }

  // Check for existing non-expired token
  const [existing] = await db
    .select({
      token: connectTokens.token,
      expiresAt: connectTokens.expiresAt,
    })
    .from(connectTokens)
    .where(
      and(
        eq(connectTokens.userId, userId),
        eq(connectTokens.projectId, projectId)
      )
    );

  if (existing && existing.expiresAt > new Date()) {
    return json({
      token: existing.token,
      expiresAt: existing.expiresAt.toISOString(),
      projectId,
    });
  }

  // Delete expired token if it exists
  if (existing) {
    await db
      .delete(connectTokens)
      .where(
        and(
          eq(connectTokens.userId, userId),
          eq(connectTokens.projectId, projectId)
        )
      );
  }

  // Create new token
  const token = generateConnectToken();
  const expiresAt = new Date(Date.now() + CONNECT_TOKEN_TTL_MS);

  await db.insert(connectTokens).values({
    userId,
    projectId,
    token,
    expiresAt,
  });

  return json({ token, expiresAt: expiresAt.toISOString(), projectId }, 201);
}

/**
 * DELETE — Regenerate: revoke the old token and create a new one.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const projectId = (body as { projectId?: string }).projectId;
  if (!projectId) {
    return json({ error: "projectId is required" }, 400);
  }

  // Verify user owns this project
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return json({ error: "Project not found" }, 404);
  }

  // Delete existing token
  await db
    .delete(connectTokens)
    .where(
      and(
        eq(connectTokens.userId, userId),
        eq(connectTokens.projectId, projectId)
      )
    );

  // Create new token
  const token = generateConnectToken();
  const expiresAt = new Date(Date.now() + CONNECT_TOKEN_TTL_MS);

  await db.insert(connectTokens).values({
    userId,
    projectId,
    token,
    expiresAt,
  });

  return json({ token, expiresAt: expiresAt.toISOString(), projectId }, 201);
}
