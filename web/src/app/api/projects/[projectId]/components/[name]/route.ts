/**
 * GET    /api/projects/:id/components/:name          — Component detail
 * PUT    /api/projects/:id/components/:name          — Update component
 * DELETE /api/projects/:id/components/:name[?detach] — Remove component
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  parseZ10Html,
  createDocumentWithPage,
  serializeZ10Html,
  toTagName,
  registerComponent,
  unregisterComponent,
  findInstances,
  detachInstance,
  generateClassBody,
  propagateToInstances,
} from "z10";
import type { ComponentSchema, Z10Document } from "z10";
import { evictCanonicalDOM } from "@/lib/canonical-dom";
import { patchBroadcast } from "@/lib/patch-broadcast";

type RouteParams = { params: Promise<{ projectId: string; name: string }> };

/** Load project from DB and parse the document. Returns null tuple on auth/not-found. */
async function loadProject(
  request: Request,
  params: RouteParams["params"]
): Promise<
  | { doc: Z10Document; projectId: string; userId: string; name: string; error?: undefined }
  | { error: NextResponse }
> {
  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { projectId } = await params;
  const { userId } = authResult;

  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  let doc;
  try {
    doc = project.content ? parseZ10Html(project.content) : createDocumentWithPage();
  } catch {
    doc = createDocumentWithPage();
  }

  const { name } = await params;
  return { doc, projectId, userId, name };
}

/** Serialize the document, persist to DB, evict canonical DOM, and notify browser. */
async function persistDoc(doc: Z10Document, projectId: string): Promise<void> {
  const html = serializeZ10Html(doc);
  await db
    .update(projects)
    .set({ content: html, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Evict stale canonical DOM so next exec reloads from DB
  await evictCanonicalDOM(projectId);
  // Notify browser to resync (head changed — component definitions)
  patchBroadcast.emitResync(projectId, html, Date.now());
}

// ---------------------------------------------------------------------------
// GET — full component detail with instance IDs and count
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  const result = await loadProject(request, params);
  if ("error" in result) return result.error;

  const { doc, name } = result;

  const schema = doc.components.get(name);
  if (!schema) {
    return NextResponse.json(
      { error: `Component '${name}' not found` },
      { status: 404 }
    );
  }

  const instances = findInstances(doc, name);

  return NextResponse.json({
    name: schema.name,
    tagName: schema.tagName,
    description: schema.description,
    category: schema.category,
    props: schema.props,
    variants: schema.variants,
    template: schema.template,
    styles: schema.styles,
    classBody: schema.classBody,
    instanceIds: instances.map((n) => n.id),
    instanceCount: instances.length,
  });
}

// ---------------------------------------------------------------------------
// PUT — update component definition, re-register, re-serialize, persist
// ---------------------------------------------------------------------------

export async function PUT(request: Request, { params }: RouteParams) {
  const result = await loadProject(request, params);
  if ("error" in result) return result.error;

  const { doc, projectId, name } = result;

  const existing = doc.components.get(name);
  if (!existing) {
    return NextResponse.json(
      { error: `Component '${name}' not found` },
      { status: 404 }
    );
  }

  let body: {
    description?: string;
    category?: string;
    props?: ComponentSchema["props"];
    variants?: ComponentSchema["variants"];
    template?: string;
    styles?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updated: ComponentSchema = {
    ...existing,
    description: body.description ?? existing.description,
    category: body.category ?? existing.category,
    props: body.props ?? existing.props,
    variants: body.variants ?? existing.variants,
    template: body.template ?? existing.template,
    styles: body.styles ?? existing.styles,
  };

  // Regenerate the class body from the updated schema
  updated.classBody = generateClassBody(updated);

  registerComponent(doc, updated);

  // Propagate changes to all instances (non-overridden attrs reset to new defaults)
  propagateToInstances(doc, name);

  await persistDoc(doc, projectId);

  return NextResponse.json({
    name: updated.name,
    tagName: updated.tagName,
  });
}

// ---------------------------------------------------------------------------
// DELETE — remove component, optionally detaching instances
// ---------------------------------------------------------------------------

export async function DELETE(request: Request, { params }: RouteParams) {
  const result = await loadProject(request, params);
  if ("error" in result) return result.error;

  const { doc, projectId, name } = result;

  const schema = doc.components.get(name);
  if (!schema) {
    return NextResponse.json(
      { error: `Component '${name}' not found` },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const detach = url.searchParams.get("detach") === "true";

  const instances = findInstances(doc, name);

  if (detach) {
    // Convert all instances to plain <div> elements
    for (const instance of instances) {
      detachInstance(doc, instance.id);
    }
  }

  unregisterComponent(doc, name);

  await persistDoc(doc, projectId);

  return NextResponse.json({
    removed: name,
    instancesDetached: detach ? instances.length : 0,
    instancesOrphaned: detach ? 0 : instances.length,
  });
}
