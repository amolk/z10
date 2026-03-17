/**
 * GET  /api/projects/:id/components         — List registered components
 * GET  /api/projects/:id/components?verbose  — Full schemas with instance counts
 * POST /api/projects/:id/components         — Create a new component
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
  registerComponent,
  findInstances,
  generateClassBody,
} from "z10";
import type { ComponentSchema } from "z10";
import {
  getCanonicalDOM,
  getCanonicalHTML,
  getCanonicalDOMInstance,
  persistCanonicalDOM,
} from "@/lib/canonical-dom";
import { patchBroadcast } from "@/lib/patch-broadcast";
import { ensureCanonicalConfigured } from "@/lib/ensure-canonical-configured";

/**
 * Load the current document state from the canonical DOM (preferred)
 * or fall back to DB. Returns a parsed Z10Document that reflects the
 * latest in-memory state including uncommitted exec mutations.
 */
async function loadCurrentDoc(
  projectId: string,
  userId: string,
): Promise<{ doc: ReturnType<typeof parseZ10Html>; error?: undefined } | { error: NextResponse }> {
  ensureCanonicalConfigured();

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

  return { doc };
}

/**
 * After modifying component definitions on a Z10Document, extract the
 * updated <head> content and apply it to the canonical DOM's headHTML.
 * Then persist and broadcast.
 */
async function applyHeadUpdate(
  projectId: string,
  doc: ReturnType<typeof parseZ10Html>,
): Promise<string> {
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
    return resyncHtml;
  }

  // No canonical DOM loaded — safe to write directly to DB
  await db
    .update(projects)
    .set({ content: fullHtml, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  patchBroadcast.emitResync(projectId, fullHtml, Date.now());
  return fullHtml;
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

  const result = await loadCurrentDoc(projectId, userId);
  if ("error" in result) return result.error;
  const { doc } = result;

  const url = new URL(request.url);
  const verbose = url.searchParams.get("verbose") === "true";

  if (verbose) {
    const components: Array<{
      name: string;
      tagName: string;
      description?: string;
      category?: string;
      props: ComponentSchema["props"];
      variants: ComponentSchema["variants"];
      template: string;
      styles: string;
      instanceCount: number;
    }> = [];

    for (const [, schema] of doc.components) {
      const instances = findInstances(doc, schema.name);
      components.push({
        name: schema.name,
        tagName: schema.tagName,
        description: schema.description,
        category: schema.category,
        props: schema.props,
        variants: schema.variants,
        template: schema.template,
        styles: schema.styles,
        instanceCount: instances.length,
      });
    }

    return NextResponse.json({ components });
  }

  const components = Array.from(doc.components.keys());
  return NextResponse.json({ components });
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

  const result = await loadCurrentDoc(projectId, userId);
  if ("error" in result) return result.error;
  const { doc } = result;

  let body: {
    name: string;
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

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'name' field" },
      { status: 400 }
    );
  }

  // Check for duplicate
  if (doc.components.has(body.name)) {
    return NextResponse.json(
      { error: `Component '${body.name}' already exists` },
      { status: 409 }
    );
  }

  const tagName = toTagName(body.name);

  const schema: ComponentSchema = {
    name: body.name,
    tagName,
    description: body.description,
    category: body.category,
    props: body.props ?? [],
    variants: body.variants ?? [],
    template: body.template ?? "",
    styles: body.styles ?? "",
    classBody: "",
  };

  // Generate the class body from the schema
  schema.classBody = generateClassBody(schema);

  // Register in the document
  registerComponent(doc, schema);

  // Update head through canonical DOM (preserves body state)
  await applyHeadUpdate(projectId, doc);

  return NextResponse.json({ tagName, name: body.name }, { status: 201 });
}
