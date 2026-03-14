/**
 * C2 + D4. POST /api/projects/:id/transact
 *
 * Server transaction endpoint. Accepts code + manifest, runs the transaction
 * engine against the canonical DOM, returns committed patch or rejection.
 *
 * Request: { code: string, manifest?: SerializedManifest | null, subtreeRootNid?: string | null }
 *   - When manifest is provided: validates against client-provided timestamps (CLI/agent path)
 *   - When manifest is null/omitted: builds fresh manifest from canonical DOM (browser trusted path, D4)
 * Response (committed): { status: 'committed', txId: number, timestamp: number, patch: PatchEnvelope }
 * Response (rejected):  { status: 'rejected', reason: string, conflicts?: Conflict[], freshHtml?: string }
 *
 * §5.2, §5.4, §10.2
 */

import { NextResponse } from "next/server";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getCanonicalDOM,
  executeTransaction,
  getCanonicalHTML,
  persistCanonicalDOM,
  configureCanonicalDOM,
} from "@/lib/canonical-dom";
import {
  deserializeManifest,
  stripForAgent,
  buildManifest,
  serializeManifest,
  type SerializedManifest,
} from "z10/dom";

// Ensure canonical DOM manager is configured with DB persistence
let configured = false;
function ensureConfigured() {
  if (configured) return;
  configured = true;
  configureCanonicalDOM({
    onPersist: async (projectId, html) => {
      await db
        .update(projects)
        .set({ content: html, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  ensureConfigured();

  const authResult = await authenticateMcp(request);
  if (!authResult) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const { userId } = authResult;

  // Validate request body
  let body: {
    code: string;
    manifest?: SerializedManifest | null;
    subtreeRootNid?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (typeof body.code !== "string" || !body.code.trim()) {
    return NextResponse.json(
      { error: "Missing or empty 'code' field" },
      { status: 400 }
    );
  }

  // Get or load canonical DOM for this project
  const canonical = await getCanonicalDOM(projectId, async () => {
    const [project] = await db
      .select({ content: projects.content })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));

    if (!project) return null;
    return project.content;
  });

  if (!canonical) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // D4: When manifest is omitted (browser trusted path), build a fresh one
  // from the canonical DOM. This avoids conflict checking since the manifest
  // reflects the current server state — human edits are trusted.
  let manifest;
  if (body.manifest && typeof body.manifest.nodes === "object") {
    manifest = deserializeManifest(body.manifest);
  } else {
    // Trusted mode: build manifest from canonical DOM subtree
    const subtreeRoot = body.subtreeRootNid
      ? canonical.rootElement?.querySelector(
          `[data-z10-id="${body.subtreeRootNid}"]`
        ) ?? canonical.rootElement
      : canonical.rootElement;
    manifest = subtreeRoot ? buildManifest(subtreeRoot) : deserializeManifest({ nodes: {} });
  }

  // Execute transaction against canonical DOM
  try {
    const result = await executeTransaction(
      projectId,
      body.code,
      body.subtreeRootNid ?? null,
      manifest,
    );

    if (result.status === "committed") {
      // Persist to DB (eventual — auto-persist handles batching)
      // For now, persist on every commit to match current behavior
      await persistCanonicalDOM(projectId);

      return NextResponse.json({
        status: "committed",
        txId: result.txId,
        timestamp: result.timestamp,
        patch: result.patch,
      });
    }

    // Transaction rejected
    const freshHtml = getCanonicalHTML(projectId);

    // Build a fresh manifest for the subtree so the client can retry
    let freshManifest: SerializedManifest | undefined;
    if (body.subtreeRootNid && canonical.rootElement) {
      const subtreeRoot =
        canonical.rootElement.querySelector(
          `[data-z10-id="${body.subtreeRootNid}"]`
        ) ?? canonical.rootElement;
      freshManifest = serializeManifest(buildManifest(subtreeRoot));
    }

    return NextResponse.json({
      status: "rejected",
      reason: result.reason,
      conflicts: result.conflicts,
      freshHtml: freshHtml,
      freshManifest,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Transaction error: ${msg}` },
      { status: 500 }
    );
  }
}
