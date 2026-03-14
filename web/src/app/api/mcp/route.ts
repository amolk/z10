/**
 * Global MCP endpoint with dynamic project targeting.
 *
 * Unlike the per-project endpoint (/api/projects/[projectId]/mcp), this
 * endpoint does NOT require a projectId in the URL. Instead, it exposes
 * `list_projects` and `select_project` tools. When the agent calls any z10
 * tool without first selecting a project, the server uses MCP form
 * elicitation to prompt for project selection.
 *
 * Endpoint: POST/GET/DELETE /api/mcp
 *
 * Agent connection:
 *   claude mcp add zero10 --transport http http://localhost:3000/api/mcp --scope user
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/lib/mcp-auth";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { incrementMcpCalls, checkMcpLimit } from "@/lib/usage";
import type { PlanId } from "@/lib/plans";

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
} from "z10";
import { LocalProxy } from "z10/dom";

// ---------------------------------------------------------------------------
// Session state per MCP connection
// ---------------------------------------------------------------------------

type McpSessionState = {
  userId: string;
  selectedProjectId: string | null;
  doc: ReturnType<typeof createDocument> | null;
  proxy: LocalProxy | null;
};

type McpSessionEntry = {
  transport: WebStandardStreamableHTTPServerTransport;
  mcpServer: McpServer;
  state: McpSessionState;
  lastAccess: number;
};

const sessions = new Map<string, McpSessionEntry>();

const SESSION_TTL_MS = 30 * 60 * 1000;

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [key, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL_MS) {
      try { entry.transport.close(); } catch { /* ignore */ }
      sessions.delete(key);
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleSessions, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Load project into session state
// ---------------------------------------------------------------------------

async function loadProject(state: McpSessionState, projectId: string) {
  const [project] = await db
    .select({ id: projects.id, name: projects.name, content: projects.content })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) throw new Error("Project not found");

  let doc: ReturnType<typeof createDocument>;
  try {
    doc = project.content ? parseZ10Html(project.content) : createDocument();
  } catch {
    doc = createDocument();
  }

  state.selectedProjectId = projectId;
  state.doc = doc;

  // Initialize LocalProxy with document HTML for DOM tools
  const proxy = new LocalProxy();
  const docHtml = serializeZ10Html(doc);
  proxy.loadDocument(docHtml);
  state.proxy = proxy;

  return project;
}

// ---------------------------------------------------------------------------
// Save function
// ---------------------------------------------------------------------------

async function saveToDb(state: McpSessionState) {
  if (!state.selectedProjectId || !state.doc) return;
  try {
    const html = serializeZ10Html(state.doc);
    await db
      .update(projects)
      .set({ content: html, updatedAt: new Date() })
      .where(eq(projects.id, state.selectedProjectId));
  } catch {
    // Log but don't fail tool calls
  }
}

// ---------------------------------------------------------------------------
// Create MCP server with project targeting + z10 tools
// ---------------------------------------------------------------------------

function createMcpServerForSession(state: McpSessionState): McpServer {
  const mcpServer = new McpServer({
    name: "zero10",
    version: "0.1.0",
  });

  // --- Project management tools ---

  mcpServer.tool(
    "list_projects",
    "List all projects available to the current user",
    {},
    async () => {
      const userProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          slug: projects.slug,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.ownerId, state.userId));

      const list = userProjects.map(
        (p) => `${p.name} (id: ${p.id}, slug: ${p.slug})`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: userProjects.length === 0
              ? "No projects found. Create one in the Zero-10 dashboard first."
              : `Projects:\n${list.join("\n")}\n\nUse select_project to choose one, or I can elicit the selection.`,
          },
        ],
      };
    }
  );

  mcpServer.tool(
    "select_project",
    "Select a project to work on. If no projectId provided, shows an interactive picker via elicitation.",
    { projectId: z.string().optional().describe("Project ID to select. Omit to use interactive picker.") },
    async ({ projectId }) => {
      if (projectId) {
        try {
          const project = await loadProject(state, projectId);
          return {
            content: [
              {
                type: "text" as const,
                text: `Selected project: ${project.name} (${project.id}). All z10 tools are now active for this project.`,
              },
            ],
          };
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project not found: ${projectId}. Use list_projects to see available projects.`,
              },
            ],
            isError: true,
          };
        }
      }

      // No projectId — use elicitation to prompt user
      const userProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.ownerId, state.userId));

      if (userProjects.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No projects found. Create one in the Zero-10 dashboard first.",
            },
          ],
        };
      }

      try {
        const result = await mcpServer.server.elicitInput({
          mode: "form",
          message: "Select a Zero-10 project to work on:",
          requestedSchema: {
            type: "object",
            properties: {
              projectId: {
                type: "string",
                title: "Project",
                description: "Choose the project to edit",
                oneOf: userProjects.map((p) => ({
                  const: p.id,
                  title: p.name,
                })),
              },
            },
            required: ["projectId"],
          },
        });

        if (result.action === "accept" && result.content?.projectId) {
          const selectedId = result.content.projectId as string;
          const project = await loadProject(state, selectedId);
          return {
            content: [
              {
                type: "text" as const,
                text: `Selected project: ${project.name} (${project.id}). All z10 tools are now active.`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text" as const, text: "Project selection cancelled." }],
        };
      } catch {
        const list = userProjects.map(
          (p) => `  - ${p.name}: select_project({ projectId: "${p.id}" })`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Your client doesn't support interactive selection. Call select_project with one of these project IDs:\n${list.join("\n")}`,
            },
          ],
        };
      }
    }
  );

  // --- Z10 design tools (require project selection) ---

  const requireProject = () => {
    if (!state.doc || !state.selectedProjectId) {
      throw new Error(
        "No project selected. Call select_project first, or use list_projects to see available projects."
      );
    }
  };

  for (const tool of READ_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try { requireProject(); } catch (e) {
          return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true };
        }
        const result = handleReadTool(state.doc!, tool.name, args);
        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  for (const tool of DOM_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try { requireProject(); } catch (e) {
          return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true };
        }
        const result = await handleDomTool(state.proxy!, tool.name, args);

        // Auto-save after successful submit_code
        if (tool.name === "submit_code") {
          try {
            const parsed = JSON.parse(result);
            if (parsed.status === "committed") {
              // Sync proxy DOM back to Z10Document for read tools
              const proxyHtml = state.proxy!.getFullHtml();
              state.doc = parseZ10Html(
                `<!DOCTYPE html><html><head></head><body>${proxyHtml}</body></html>`
              );
              await saveToDb(state);
            }
          } catch { /* ignore sync errors */ }
        }

        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  for (const tool of UTILITY_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    mcpServer.tool(
      tool.name,
      tool.description,
      zodShape,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try { requireProject(); } catch (e) {
          return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true };
        }
        const result = handleUtilityTool(state.doc!, tool.name, args);
        return { content: [{ type: "text" as const, text: result }] };
      }
    );
  }

  return mcpServer;
}

// ---------------------------------------------------------------------------
// Shared request handler
// ---------------------------------------------------------------------------

async function handleMcpRequest(request: Request): Promise<Response> {
  const authed = await authenticateMcp(request);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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

  const sessionId = request.headers.get("mcp-session-id") ?? undefined;
  let entry: McpSessionEntry;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
  } else if (!sessionId || request.method === "POST") {
    // New MCP session
    const state: McpSessionState = {
      userId: authed.userId,
      selectedProjectId: null,
      doc: null,
      proxy: null,
    };
    const mcpServer = createMcpServerForSession(state);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, mcpServer, state, lastAccess: Date.now() });
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };
    await mcpServer.connect(transport);
    entry = { transport, mcpServer, state, lastAccess: Date.now() };
  } else {
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          name: "zero10",
          version: "0.1.0",
          description: "Global MCP endpoint with project targeting. Connect and use select_project to pick a project.",
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

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}
