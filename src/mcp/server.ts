/**
 * Zero-10 MCP Server
 *
 * Streamable HTTP MCP server that exposes read, DOM, and utility tools
 * for AI coding agents to interact with .z10.html documents.
 *
 * E4: Write tools replaced with DOM tools (submit_code, get_subtree,
 * refresh_subtree) backed by LocalProxy for atomic transactions.
 *
 * Default endpoint: http://127.0.0.1:29910/mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import type { Z10Document } from '../core/types.js';
import { createDocument, createDocumentWithPage } from '../core/document.js';
import { parseZ10Html } from '../format/parser.js';
import { serializeZ10Html } from '../format/serializer.js';
import { LocalProxy } from '../dom/proxy.js';
import {
  READ_TOOLS,
  DOM_TOOLS,
  UTILITY_TOOLS,
  handleReadTool,
  handleDomTool,
  handleUtilityTool,
  type ToolArgs,
  jsonSchemaToZodShape,
} from './tools.js';

// ---------------------------------------------------------------------------
// Server State
// ---------------------------------------------------------------------------

export interface Z10ServerOptions {
  port?: number;
  filePath?: string;
}

/** The in-memory document state managed by the server */
let currentDoc: Z10Document = createDocumentWithPage();
let currentFilePath: string | null = null;
/** LocalProxy for DOM-based tools (E4) */
let currentProxy: LocalProxy = new LocalProxy();

/** Get the current document (for testing) */
export function getDocument(): Z10Document {
  return currentDoc;
}

/** Set the document (for testing) */
export function setDocument(doc: Z10Document): void {
  currentDoc = doc;
}

/** Get the current proxy (for testing) */
export function getProxy(): LocalProxy {
  return currentProxy;
}

/** Set the proxy (for testing) */
export function setProxy(proxy: LocalProxy): void {
  currentProxy = proxy;
}

// ---------------------------------------------------------------------------
// Document Persistence
// ---------------------------------------------------------------------------

/** Load a .z10.html file into memory */
export async function loadFile(filePath: string): Promise<Z10Document> {
  const html = await readFile(filePath, 'utf-8');
  currentDoc = parseZ10Html(html);
  currentFilePath = filePath;

  // Initialize proxy with the document HTML
  const docHtml = serializeZ10Html(currentDoc);
  currentProxy.loadDocument(docHtml);

  return currentDoc;
}

/** Save the current document back to disk */
export async function saveFile(filePath?: string): Promise<void> {
  const target = filePath ?? currentFilePath;
  if (!target) {
    throw new Error('No file path specified and no file currently loaded');
  }
  const html = serializeZ10Html(currentDoc);
  await writeFile(target, html, 'utf-8');
  currentFilePath = target;
}

// ---------------------------------------------------------------------------
// MCP Server Setup
// ---------------------------------------------------------------------------

/** Create and configure the MCP server with all Z10 tools */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'zero10',
    version: '0.1.0',
  });

  // Register read tools
  for (const tool of READ_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (args: ToolArgs) => {
        const result = handleReadTool(currentDoc, tool.name, args);
        return { content: [{ type: 'text' as const, text: result }] };
      },
    );
  }

  // Register DOM tools (E4: replaces old write tools)
  for (const tool of DOM_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (args: ToolArgs) => {
        const result = await handleDomTool(currentProxy, tool.name, args);

        // Auto-save after successful submit_code if a file is loaded
        if (tool.name === 'submit_code' && currentFilePath) {
          try {
            // Sync proxy DOM back to Z10Document for read tools
            const proxyHtml = currentProxy.getFullHtml();
            const parsed = JSON.parse(result);
            if (parsed.status === 'committed') {
              currentDoc = parseZ10Html(
                `<!DOCTYPE html><html><head></head><body>${proxyHtml}</body></html>`
              );
              await saveFile();
            }
          } catch {
            // Log but don't fail the tool call
          }
        }

        return { content: [{ type: 'text' as const, text: result }] };
      },
    );
  }

  // Register utility tools
  for (const tool of UTILITY_TOOLS) {
    const zodShape = jsonSchemaToZodShape(tool.inputSchema);
    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (args: ToolArgs) => {
        const rootEl = currentProxy?.getRootElement() as unknown as Element | undefined;
        const result = handleUtilityTool(currentDoc, tool.name, args, rootEl);
        return { content: [{ type: 'text' as const, text: result }] };
      },
    );
  }

  return server;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

/** Start the MCP server on HTTP */
export async function startServer(options: Z10ServerOptions = {}): Promise<void> {
  const port = options.port ?? 29910;

  // Load file if specified
  if (options.filePath) {
    try {
      await loadFile(options.filePath);
      console.log(`Loaded: ${options.filePath} (${currentDoc.nodes.size} nodes, ${currentDoc.components.size} components)`);
    } catch (err) {
      console.log(`Creating new document (file not found: ${options.filePath})`);
      currentDoc = createDocumentWithPage();
      currentFilePath = options.filePath;
      // Initialize proxy with fresh document
      const docHtml = serializeZ10Html(currentDoc);
      currentProxy.loadDocument(docHtml);
    }
  }

  const mcpServer = createMcpServer();

  // Track transports for session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== '/mcp') {
      // Health check / info endpoint
      if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: 'zero10',
          version: '0.1.0',
          status: 'running',
          file: currentFilePath,
          nodes: currentDoc.nodes.size,
          components: currentDoc.components.size,
        }));
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (req.method === 'POST') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (!sessionId) {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport);
          },
        });
        transport.onclose = () => {
          const sid = (transport as unknown as { sessionId?: string }).sessionId;
          if (sid) transports.delete(sid);
        };
        await mcpServer.connect(transport);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session ID' }));
        return;
      }

      await transport.handleRequest(req, res);
    } else if (req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session ID required for GET requests' }));
      }
    } else if (req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        transports.delete(sessionId);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session ID required for DELETE requests' }));
      }
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  });

  httpServer.listen(port, '127.0.0.1', () => {
    console.log(`Zero-10 MCP server running at http://127.0.0.1:${port}/mcp`);
    console.log(`Connect: claude mcp add zero10 --transport http http://127.0.0.1:${port}/mcp --scope user`);
  });
}
