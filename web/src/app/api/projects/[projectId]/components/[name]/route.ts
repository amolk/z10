/**
 * GET    /api/projects/:id/components/:name          — Component detail
 * PUT    /api/projects/:id/components/:name          — Update component
 * DELETE /api/projects/:id/components/:name[?detach] — Remove component
 *
 * IMPORTANT: These routes read/write through the canonical DOM to avoid
 * overwriting in-flight body mutations from exec/transact. Component
 * definitions live in <head> (canonical.headHTML); body content is untouched.
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
  ComponentRegistry,
  generateClassBody,
} from "z10";
import type { ComponentSchema, Z10Document } from "z10";
import {
  getCanonicalHTML,
  getCanonicalDOMInstance,
  persistCanonicalDOM,
} from "@/lib/canonical-dom";
import { patchBroadcast } from "@/lib/patch-broadcast";
import { ensureCanonicalConfigured } from "@/lib/ensure-canonical-configured";

type RouteParams = { params: Promise<{ projectId: string; name: string }> };

/**
 * Load the current document state from the canonical DOM (preferred)
 * or fall back to DB. Returns a parsed Z10Document that reflects the
 * latest in-memory state including uncommitted exec mutations.
 */
async function loadProject(
  request: Request,
  params: RouteParams["params"]
): Promise<
  | { doc: Z10Document; projectId: string; userId: string; name: string; error?: undefined }
  | { error: NextResponse }
> {
  ensureCanonicalConfigured();

  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { projectId } = await params;
  const { userId } = authResult;

  // Verify project ownership
  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  // Prefer canonical DOM (has latest exec mutations) over DB (may be stale)
  const canonicalHTML = getCanonicalHTML(projectId);
  const html = canonicalHTML ?? project.content;

  let doc;
  try {
    doc = html ? parseZ10Html(html) : createDocumentWithPage();
  } catch {
    doc = createDocumentWithPage();
  }

  const { name } = await params;
  return { doc, projectId, userId, name };
}

/**
 * After modifying component definitions on a Z10Document, extract the
 * updated <head> content and apply it to the canonical DOM's headHTML.
 * Then persist and broadcast.
 */
async function applyHeadUpdate(
  projectId: string,
  doc: Z10Document,
): Promise<void> {
  const fullHtml = serializeZ10Html(doc);

  // Extract the new <head> content
  const headMatch = fullHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const newHeadHTML = headMatch ? headMatch[1].trim() : "";

  // Update the canonical DOM's headHTML if it's loaded
  const canonical = getCanonicalDOMInstance(projectId);
  if (canonical) {
    canonical.headHTML = newHeadHTML;
    canonical.dirty = true;
    // Persist canonical DOM (includes latest body + updated head)
    await persistCanonicalDOM(projectId, true);
    // Broadcast resync with the canonical's full state (body + head)
    const resyncHtml = getCanonicalHTML(projectId) ?? fullHtml;
    patchBroadcast.emitResync(projectId, resyncHtml, Date.now());
    return;
  }

  // No canonical DOM loaded — safe to write directly to DB
  await db
    .update(projects)
    .set({ content: fullHtml, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  patchBroadcast.emitResync(projectId, fullHtml, Date.now());
}

// ---------------------------------------------------------------------------
// GET — full component detail with instance IDs and count
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  const result = await loadProject(request, params);
  if ("error" in result) return result.error;

  const { doc, name } = result;

  const registry = new ComponentRegistry(doc);
  const schema = registry.get(name);
  if (!schema) {
    return NextResponse.json(
      { error: `Component '${name}' not found` },
      { status: 404 }
    );
  }

  const instances = registry.instances(name);

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
// PUT — update component definition, re-register, propagate, persist
// ---------------------------------------------------------------------------

export async function PUT(request: Request, { params }: RouteParams) {
  const result = await loadProject(request, params);
  if ("error" in result) return result.error;

  const { doc, projectId, name } = result;

  const registry = new ComponentRegistry(doc);
  const existing = registry.get(name);
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

  // register() auto-propagates to all instances
  registry.register(updated);

  await applyHeadUpdate(projectId, doc);

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

  const registry = new ComponentRegistry(doc);
  const schema = registry.get(name);
  if (!schema) {
    return NextResponse.json(
      { error: `Component '${name}' not found` },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const detach = url.searchParams.get("detach") === "true";

  const instances = registry.instances(name);

  if (detach) {
    for (const instance of instances) {
      registry.detach(instance.id);
    }
  }

  registry.unregister(name);

  await applyHeadUpdate(projectId, doc);

  return NextResponse.json({
    removed: name,
    instancesDetached: detach ? instances.length : 0,
    instancesOrphaned: detach ? 0 : instances.length,
  });
}
