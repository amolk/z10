/**
 * Per-project MCP endpoint.
 *
 * Exposes the full Z10 MCP tool set (read, write, utility) scoped to a
 * specific project's .z10.html content stored in Postgres.
 *
 * Endpoint: POST/GET/DELETE /api/projects/[projectId]/mcp
 *
 * Agent connection:
 *   claude mcp add zero10 --transport http http://localhost:3000/api/projects/<id>/mcp --scope user
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";


import { incrementMcpCalls, checkMcpLimit } from "@/lib/usage";
import type { PlanId } from "@/lib/plans";

// Import core z10 library (added as file dependency, excluded from bundling via serverExternalPackages)
import {
  READ_TOOLS,
  DOM_TOOLS,
  UTILITY_TOOLS,
  handleReadTool,
  handleDomTool,
  handleUtilityTool,
  jsonSchemaToZodShape,
  parseZ10Html,
  serializeZ10Html,
  createDocument,
  createDocumentWithPage,
} from "z10";
import { LocalProxy } from "z10/dom";

// ---------------------------------------------------------------------------
// Per-project document cache (shared across MCP sessions for same project)
// ---------------------------------------------------------------------------

type ProjectDoc = {
  doc: ReturnType<typeof createDocument>;
  proxy: LocalProxy;
  projectId: string;
  ownerId: string;
  lastAccess: number;
};

const projectDocs = new Map<string, ProjectDoc>();

// MCP transport sessions keyed by mcp-session-id
type McpSessionEntry = {
  transport: WebStandardStreamableHTTPServerTransport;
  mcpServer: McpServer;
  projectId: string;
};
const mcpSessions = new Map<string, McpSessionEntry>();

// Clean up stale docs after 30 minutes of inactivity
const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [key, pd] of projectDocs) {
    if (now - pd.lastAccess > SESSION_TTL_MS) {
      projectDocs.delete(key);
      // Also clean up any MCP sessions for this project
      for (const [sid, entry] of mcpSessions) {
        if (entry.projectId === key) {
          try { entry.transport.close(); } catch { /* ignore */ }
          mcpSessions.delete(sid);
        }
      }
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleSessions, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Load or get project document
// ---------------------------------------------------------------------------

async function getOrCreateDoc(
  projectId: string,
  ownerId: string
): Promise<ProjectDoc> {
  const existing = projectDocs.get(projectId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing;
  }

  const [project] = await db
    .select({ content: projects.content })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)));

  if (!project) {
    throw new Error("Project not found");
  }

  let doc: ReturnType<typeof createDocument>;
  try {
    doc = project.content ? parseZ10Html(project.content) : createDocumentWithPage();
  } catch {
    doc = createDocumentWithPage();
  }

  // Initialize LocalProxy with document HTML for DOM tools
  const proxy = new LocalProxy();
  const docHtml = serializeZ10Html(doc);
  proxy.loadDocument(docHtml);

  const pd: ProjectDoc = { doc, proxy, projectId, ownerId, lastAccess: Date.now() };
  projectDocs.set(projectId, pd);
  return pd;
}

// ---------------------------------------------------------------------------
// Create a new McpServer bound to a project document
// ---------------------------------------------------------------------------

function createMcpServerForDoc(pd: ProjectDoc): McpServer {
  const { doc, projectId } = pd;

  const mcpServer = new McpServer({
    name: "zero10",
    version: "0.1.0",
  });

  const saveToDb = async () => {
    try {
      const html = serializeZ10Html(doc);
      await db
        .update(projects)
        .set({ content: html, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    } catch (err) {
      console.error("[MCP] saveToDb failed:", err);
    }
  };

  // Register read tools
  for (const tool of READ_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const result = handleReadTool(doc, tool.name, args);
        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  // Register DOM tools (E4: replaces old write tools)
  for (const tool of DOM_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const result = await handleDomTool(pd.proxy, tool.name, args);

        // Auto-save after successful submit_code
        if (tool.name === "submit_code") {
          try {
            const parsed = JSON.parse(result);
            if (parsed.status === "committed") {
              // Sync proxy DOM back to Z10Document for read tools
              const proxyHtml = pd.proxy.getFullHtml();
              pd.doc = parseZ10Html(
                `<!DOCTYPE html><html><head></head><body>${proxyHtml}</body></html>`
              );
              await saveToDb();
            }
          } catch { /* ignore sync errors */ }
        }

        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  // Register utility tools
  for (const tool of UTILITY_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const result = handleUtilityTool(doc, tool.name, args);
        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  return mcpServer;
}

// ---------------------------------------------------------------------------
// Shared request handler
// ---------------------------------------------------------------------------

async function handleMcpRequest(
  request: Request,
  projectId: string
): Promise<Response> {
  const authed = await authenticateMcp(request);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Connect tokens are project-scoped — reject if used against wrong project
  if (authed.projectId && authed.projectId !== projectId) {
    return new Response(
      JSON.stringify({ error: "Token is scoped to a different project" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pre-parse body for POST (Next.js may consume the body stream)
  let parsedBody: unknown;
  if (request.method === "POST") {
    try {
      parsedBody = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Enforce MCP rate limit
    const [dbUser] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, authed.userId));
    const planId = (dbUser?.plan ?? "free") as PlanId;
    const { allowed, current, limit } = await checkMcpLimit(authed.userId, planId);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Daily MCP call limit reached (${current}/${limit}). Upgrade your plan for more calls.`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    await incrementMcpCalls(authed.userId);
  }

  // Load project document
  let pd: ProjectDoc;
  try {
    pd = await getOrCreateDoc(projectId, authed.userId);
  } catch {
    return new Response(JSON.stringify({ error: "Project not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Route to existing MCP session or create a new one
  const sessionId = request.headers.get("mcp-session-id") ?? undefined;
  let entry: McpSessionEntry;

  if (sessionId && mcpSessions.has(sessionId)) {
    // Existing session
    entry = mcpSessions.get(sessionId)!;
  } else if (!sessionId) {
    // No session ID → initialize: create new transport + server pair
    const mcpServer = createMcpServerForDoc(pd);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        mcpSessions.set(id, { transport, mcpServer, projectId });
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) mcpSessions.delete(sid);
    };
    await mcpServer.connect(transport);
    entry = { transport, mcpServer, projectId };
  } else {
    // Unknown session ID
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          name: "zero10",
          version: "0.1.0",
          status: "no active session",
          projectId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return await entry.transport.handleRequest(request, { parsedBody });
  } catch (err) {
    console.error("[MCP] Transport error:", err);
    return new Response(JSON.stringify({ error: "MCP transport error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ---------------------------------------------------------------------------
// Next.js Route Handlers
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  return handleMcpRequest(request, projectId);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  return handleMcpRequest(request, projectId);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  return handleMcpRequest(request, projectId);
}
