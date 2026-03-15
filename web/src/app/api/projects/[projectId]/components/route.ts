/**
 * GET  /api/projects/:id/components         — List registered components
 * GET  /api/projects/:id/components?verbose  — Full schemas with instance counts
 * POST /api/projects/:id/components         — Create a new component
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
import { evictCanonicalDOM } from "@/lib/canonical-dom";
import { patchBroadcast } from "@/lib/patch-broadcast";

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

  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  let doc;
  try {
    doc = project.content ? parseZ10Html(project.content) : createDocumentWithPage();
  } catch {
    doc = createDocumentWithPage();
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

  // Serialize and persist
  const html = serializeZ10Html(doc);

  await db
    .update(projects)
    .set({ content: html, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Evict the in-memory canonical DOM so the next exec reloads from DB
  // with the new component definition included.
  await evictCanonicalDOM(projectId);

  // Broadcast a resync so the browser picks up the new content
  // (component definition in head, updated component list in Assets panel).
  patchBroadcast.emitResync(projectId, html, Date.now());

  return NextResponse.json({ tagName, name: body.name }, { status: 201 });
}
