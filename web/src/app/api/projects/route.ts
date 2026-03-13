import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createDefaultContent } from "@/lib/default-project";

export async function GET(request: Request) {
  // Try NextAuth session first, then fall back to MCP auth (API key / connect token)
  const session = await auth();
  let userId = session?.user?.id;

  if (!userId) {
    const mcpAuth = await authenticateMcp(request);
    if (mcpAuth) {
      userId = mcpAuth.userId;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      thumbnail: projects.thumbnail,
      updatedAt: projects.updatedAt,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.updatedAt));

  return NextResponse.json({ projects: result });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body as { name: string };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();
  const slug = trimmedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "project";

  const [project] = await db
    .insert(projects)
    .values({
      name: trimmedName,
      slug,
      ownerId: session.user.id,
      content: createDefaultContent(trimmedName),
    })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
