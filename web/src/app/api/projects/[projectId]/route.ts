import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id))
    );

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const body = await request.json();
  const { content } = body as { content: string };

  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "Content must be a string" },
      { status: 400 }
    );
  }

  // NOTE: The browser editor no longer uses PUT for saving — all edits flow
  // through POST /transact. This endpoint is kept for backward compatibility
  // (e.g., external tools that write content directly).
  const [updated] = await db
    .update(projects)
    .set({ content, updatedAt: new Date() })
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id))
    )
    .returning({ id: projects.id, updatedAt: projects.updatedAt });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ saved: true, updatedAt: updated.updatedAt });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  await db
    .delete(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id))
    );

  return NextResponse.json({ deleted: true });
}
