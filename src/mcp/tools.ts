/**
 * MCP tool definitions and handlers for the Zero-10 MCP server.
 *
 * E4: Replaced 12 write tools + z10_exec with 3 DOM tools
 * (submit_code, get_subtree, refresh_subtree) that proxy to LocalProxy.
 * Read tools and utility tools (export, find_placement, reconcile) remain
 * and still operate on Z10Document until E5 migrates them.
 */

import { z } from 'zod';
import type {
  Z10Document,
  Z10Node,
  ComponentSchema,
} from '../core/types.js';
import {
  getNode,
  getChildren,
  getSubtree,
  getComponent,
  getToken,
  serializeStyle,
} from '../core/index.js';
import { exportReact } from '../export/react.js';
import { exportVue } from '../export/vue.js';
import { exportSvelte } from '../export/svelte.js';
import type { LocalProxy } from '../dom/proxy.js';

// ---------------------------------------------------------------------------
// Tool Schemas (JSON Schema format for MCP)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const READ_TOOLS: ToolDefinition[] = [
  {
    name: 'get_project_summary',
    description: 'Get component inventory, tokens, pages, and project configuration',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_component_props',
    description: 'Get props schema for a named component',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_node_info',
    description: 'Get details for a node by data-z10-id',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID (data-z10-id)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_tree',
    description: 'Get subtree hierarchy as compact text',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Root node ID (optional, defaults to all pages)' },
        depth: { type: 'number', description: 'Max depth (optional, defaults to unlimited)' },
      },
      required: [],
    },
  },
  {
    name: 'get_styles',
    description: 'Get computed CSS styles for a node',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_tokens',
    description: 'Get design token values',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          enum: ['primitives', 'semantic'],
          description: 'Token collection (optional, returns all if omitted)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_guide',
    description: 'Get contextual help for the agent about Zero-10 commands and concepts',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Help topic (optional)' },
      },
      required: [],
    },
  },
];

/** New DOM tools replacing the 12 write tools + z10_exec. */
export const DOM_TOOLS: ToolDefinition[] = [
  {
    name: 'submit_code',
    description: 'Execute JavaScript code atomically against the design DOM. Code runs in a sandboxed document with standard DOM APIs (querySelector, createElement, appendChild, etc.). Returns committed result with updated HTML, or rejection with conflict details and fresh HTML for retry.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute. Use standard DOM APIs.' },
        ticketId: { type: 'string', description: 'Read ticket from a previous get_subtree or submit_code call' },
      },
      required: ['code', 'ticketId'],
    },
  },
  {
    name: 'get_subtree',
    description: 'Get a subtree snapshot with a read ticket for conflict detection. Returns stripped HTML (no internal timestamps) and a ticketId to pass to submit_code.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for subtree root (e.g. "[data-z10-id=\\"nav\\"]")' },
        depth: { type: 'number', description: 'Max depth limit (optional, defaults to unlimited)' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'refresh_subtree',
    description: 'Check if a subtree has changed since the ticket was issued. Returns changed: false if unchanged, or changed: true with fresh HTML and a new ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'Read ticket from a previous get_subtree call' },
      },
      required: ['ticketId'],
    },
  },
];

export const UTILITY_TOOLS: ToolDefinition[] = [
  {
    name: 'export_react',
    description: 'Generate React + Tailwind code from the Z10 document or a subtree',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to export (optional, exports all pages if omitted)' },
        includeTokens: { type: 'boolean', description: 'Include design tokens as CSS (default: true)' },
        typescript: { type: 'boolean', description: 'Generate TypeScript (default: true)' },
      },
      required: [],
    },
  },
  {
    name: 'export_vue',
    description: 'Generate Vue 3 SFC code from the Z10 document or a subtree',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to export (optional, exports all pages if omitted)' },
        includeTokens: { type: 'boolean', description: 'Include design tokens as CSS (default: true)' },
        typescript: { type: 'boolean', description: 'Use TypeScript in script setup (default: true)' },
      },
      required: [],
    },
  },
  {
    name: 'export_svelte',
    description: 'Generate Svelte component code from the Z10 document or a subtree',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to export (optional, exports all pages if omitted)' },
        includeTokens: { type: 'boolean', description: 'Include design tokens as CSS (default: true)' },
        typescript: { type: 'boolean', description: 'Use TypeScript in script tag (default: true)' },
      },
      required: [],
    },
  },
  {
    name: 'find_placement',
    description: 'Suggest a canvas position and parent for placing a new element. Analyzes existing layout to find optimal placement.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'Target parent node ID (optional, defaults to current page root)' },
        size: {
          type: 'object',
          description: 'Desired element size in pixels (optional)',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
        near: { type: 'string', description: 'Place near this node ID (optional)' },
        position: {
          type: 'string',
          enum: ['after', 'before', 'inside', 'auto'],
          description: 'Placement relative to parent or near node (default: auto)',
        },
      },
      required: [],
    },
  },
  {
    name: 'reconcile',
    description: 'Analyze the design document for consistency and report node statistics, orphaned nodes, missing parents, and component usage.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source directory to compare against (optional)' },
      },
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export type ToolArgs = Record<string, unknown>;

/** Handle a read tool call */
export function handleReadTool(doc: Z10Document, name: string, args: ToolArgs): string {
  switch (name) {
    case 'get_project_summary': return handleGetProjectSummary(doc);
    case 'get_component_props': return handleGetComponentProps(doc, args['name'] as string);
    case 'get_node_info': return handleGetNodeInfo(doc, args['id'] as string);
    case 'get_tree': return handleGetTree(doc, args['id'] as string | undefined, args['depth'] as number | undefined);
    case 'get_styles': return handleGetStyles(doc, args['id'] as string);
    case 'get_tokens': return handleGetTokens(doc, args['collection'] as string | undefined);
    case 'get_guide': return handleGetGuide(args['topic'] as string | undefined);
    default: return JSON.stringify({ error: `Unknown read tool: ${name}` });
  }
}

/** Handle a DOM tool call (submit_code, get_subtree, refresh_subtree) */
export async function handleDomTool(proxy: LocalProxy, name: string, args: ToolArgs): Promise<string> {
  switch (name) {
    case 'submit_code': {
      const code = args['code'] as string;
      const ticketId = args['ticketId'] as string;
      if (!code || !ticketId) {
        return JSON.stringify({ error: 'Missing required parameters: code and ticketId' });
      }
      try {
        const result = await proxy.submitCode(code, ticketId);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: msg });
      }
    }

    case 'get_subtree': {
      const selector = args['selector'] as string;
      const depth = args['depth'] as number | undefined;
      if (!selector) {
        return JSON.stringify({ error: 'Missing required parameter: selector' });
      }
      try {
        const result = proxy.getSubtree(selector, depth);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: msg });
      }
    }

    case 'refresh_subtree': {
      const ticketId = args['ticketId'] as string;
      if (!ticketId) {
        return JSON.stringify({ error: 'Missing required parameter: ticketId' });
      }
      try {
        const result = proxy.refreshSubtree(ticketId);
        return JSON.stringify(result, null, 2);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: msg });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown DOM tool: ${name}` });
  }
}

/** Handle a utility tool call */
export function handleUtilityTool(doc: Z10Document, name: string, args: ToolArgs): string {
  switch (name) {
    case 'export_react': {
      const result = exportReact(doc, {
        id: args['id'] as string | undefined,
        includeTokens: args['includeTokens'] as boolean | undefined,
        typescript: args['typescript'] as boolean | undefined,
      });
      return JSON.stringify(result, null, 2);
    }
    case 'export_vue': {
      const result = exportVue(doc, {
        id: args['id'] as string | undefined,
        includeTokens: args['includeTokens'] as boolean | undefined,
        typescript: args['typescript'] as boolean | undefined,
      });
      return JSON.stringify(result, null, 2);
    }
    case 'export_svelte': {
      const result = exportSvelte(doc, {
        id: args['id'] as string | undefined,
        includeTokens: args['includeTokens'] as boolean | undefined,
        typescript: args['typescript'] as boolean | undefined,
      });
      return JSON.stringify(result, null, 2);
    }
    case 'find_placement':
      return handleFindPlacement(doc, args);
    case 'reconcile':
      return handleReconcile(doc, args);
    default:
      return JSON.stringify({ error: `Unknown utility tool: ${name}` });
  }
}

// ---------------------------------------------------------------------------
// Read Tool Implementations
// ---------------------------------------------------------------------------

function handleGetProjectSummary(doc: Z10Document): string {
  const summary = {
    config: doc.config,
    components: Array.from(doc.components.keys()),
    componentCount: doc.components.size,
    tokens: {
      primitives: doc.tokens.primitives.size,
      semantic: doc.tokens.semantic.size,
    },
    pages: doc.pages.map(p => ({ name: p.name, mode: p.mode })),
    nodeCount: doc.nodes.size,
  };
  return JSON.stringify(summary, null, 2);
}

function handleGetComponentProps(doc: Z10Document, name: string): string {
  const component = getComponent(doc, name);
  if (!component) {
    return JSON.stringify({ error: `Component not found: ${name}` });
  }
  return JSON.stringify({
    name: component.name,
    description: component.description,
    props: component.props,
    variants: component.variants.map(v => v.name),
    slots: component.slots,
  }, null, 2);
}

function handleGetNodeInfo(doc: Z10Document, id: string): string {
  const node = getNode(doc, id);
  if (!node) {
    return JSON.stringify({ error: `Node not found: ${id}` });
  }
  return JSON.stringify({
    id: node.id,
    tag: node.tag,
    parent: node.parent,
    children: node.children,
    styles: node.styles,
    textContent: node.textContent,
    intent: node.intent,
    editor: node.editor,
    agentEditable: node.agentEditable,
    componentName: node.componentName,
    componentProps: node.componentProps,
    attributes: node.attributes,
  }, null, 2);
}

function handleGetTree(doc: Z10Document, id?: string, depth?: number): string {
  if (id) {
    const nodes = getSubtree(doc, id, depth);
    return formatTree(nodes);
  }

  // All pages
  const lines: string[] = [];
  for (const page of doc.pages) {
    lines.push(`📄 ${page.name} (${page.mode})`);
    const nodes = getSubtree(doc, page.rootNodeId, depth);
    lines.push(formatTree(nodes));
  }
  return lines.join('\n');
}

function formatTree(nodes: Z10Node[]): string {
  if (nodes.length === 0) return '(empty)';

  const lines: string[] = [];
  const depthMap = new Map<string, number>();

  for (const node of nodes) {
    const parentDepth = node.parent ? (depthMap.get(node.parent) ?? -1) : -1;
    const depth = parentDepth + 1;
    depthMap.set(node.id, depth);

    const indent = '  '.repeat(depth);
    const component = node.componentName ? ` [${node.componentName}]` : '';
    const text = node.textContent ? ` "${truncate(node.textContent, 30)}"` : '';
    const intent = node.intent !== 'content' ? ` (${node.intent})` : '';

    lines.push(`${indent}<${node.tag}> #${node.id}${component}${text}${intent}`);
  }
  return lines.join('\n');
}

function handleGetStyles(doc: Z10Document, id: string): string {
  const node = getNode(doc, id);
  if (!node) {
    return JSON.stringify({ error: `Node not found: ${id}` });
  }
  return JSON.stringify({
    id: node.id,
    styles: node.styles,
    styleString: serializeStyle(node.styles),
  }, null, 2);
}

function handleGetTokens(doc: Z10Document, collection?: string): string {
  const result: Record<string, Record<string, string>> = {};

  if (!collection || collection === 'primitives') {
    const primitives: Record<string, string> = {};
    for (const [name, token] of doc.tokens.primitives) {
      primitives[name] = token.value;
    }
    result['primitives'] = primitives;
  }

  if (!collection || collection === 'semantic') {
    const semantic: Record<string, string> = {};
    for (const [name, token] of doc.tokens.semantic) {
      semantic[name] = token.value;
    }
    result['semantic'] = semantic;
  }

  return JSON.stringify(result, null, 2);
}

function handleGetGuide(topic?: string): string {
  const guides: Record<string, string> = {
    commands: `Zero-10 uses 3 DOM tools for design edits:
1. get_subtree(selector, depth?) - Get subtree HTML + read ticket
2. submit_code(code, ticketId) - Execute JS atomically against the DOM
3. refresh_subtree(ticketId) - Check if subtree changed since read

Workflow: get_subtree → write JS code → submit_code → use newTicketId for next edit.
Code runs in a sandboxed document with standard DOM APIs.`,

    styles: `Use standard DOM style APIs in submit_code:
element.style.display = 'flex';
element.style.padding = '8px';
element.style.setProperty('--custom-var', 'value');

All style changes are atomic — either all commit or none do.`,

    tokens: `Design tokens are set via the z10 global in submit_code:
z10.setTokens('primitives', { '--blue-500': '#3b82f6' });
z10.setTokens('semantic', { '--primary': 'var(--blue-500)' });

Reference in styles: element.style.color = 'var(--primary)';`,

    components: `Define components using standard Web Components:
class MyBtn extends HTMLElement { ... }
customElements.define('my-btn', MyBtn);

Instantiate: document.createElement('my-btn');
Use static z10Props for design tool property panel.`,

    dom: `Standard DOM APIs available in submit_code:
- document.querySelector/querySelectorAll/getElementById
- document.createElement/createTextNode
- element.appendChild/insertBefore/removeChild/remove
- element.setAttribute/getAttribute
- element.textContent/innerHTML
- element.style.* / element.classList.*

Do NOT modify data-z10-id or data-z10-ts-* attributes.`,
  };

  if (topic && guides[topic]) {
    return guides[topic];
  }

  return `Available topics: ${Object.keys(guides).join(', ')}\n\n${guides['commands']}`;
}

// ---------------------------------------------------------------------------
// JSON Schema → Zod Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a JSON Schema inputSchema to a Zod raw shape for McpServer.tool().
 * The MCP SDK expects Zod schemas, not raw JSON Schema objects.
 */
export function jsonSchemaToZodShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema['required'] ?? []) as string[];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const isRequired = required.includes(key);
    let zodType: z.ZodTypeAny;

    if (propSchema['enum']) {
      const values = propSchema['enum'] as [string, ...string[]];
      zodType = z.enum(values);
    } else {
      switch (propSchema['type']) {
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'array':
          zodType = z.array(z.any());
          break;
        case 'object':
          zodType = z.record(z.string(), z.any());
          break;
        case 'string':
        default:
          zodType = z.string();
          break;
      }
    }

    shape[key] = isRequired ? zodType : zodType.optional();
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ---------------------------------------------------------------------------
// find_placement Implementation
// ---------------------------------------------------------------------------

function handleFindPlacement(doc: Z10Document, args: ToolArgs): string {
  const parentId = args['parent'] as string | undefined;
  const nearId = args['near'] as string | undefined;
  const positionHint = (args['position'] as string) ?? 'auto';
  const size = args['size'] as { width?: number; height?: number } | undefined;

  let parent: Z10Node | undefined;
  if (parentId) {
    parent = getNode(doc, parentId);
    if (!parent) {
      return JSON.stringify({ error: `PARENT_NOT_FOUND: ${parentId}` });
    }
  } else if (doc.pages.length > 0) {
    parent = doc.nodes.get(doc.pages[0]!.rootNodeId);
  }

  if (!parent) {
    return JSON.stringify({ error: 'No parent found. Create a page first.' });
  }

  const children = getChildren(doc, parent.id);

  const layoutMode = detectLayoutMode(parent);

  let insertIndex = children.length;
  let nearNode: Z10Node | undefined;

  if (nearId) {
    nearNode = getNode(doc, nearId);
    if (nearNode) {
      const nearIndex = children.findIndex(c => c.id === nearId);
      if (nearIndex !== -1) {
        if (positionHint === 'before') {
          insertIndex = nearIndex;
        } else if (positionHint === 'after' || positionHint === 'auto') {
          insertIndex = nearIndex + 1;
        }
      }
    }
  }

  if (positionHint === 'inside' && nearNode) {
    return JSON.stringify({
      parent: nearId,
      insertIndex: getChildren(doc, nearId!).length,
      layout: detectLayoutMode(nearNode),
      suggestion: `Place inside "${nearId}" as last child`,
      recommendedStyle: suggestStyle(detectLayoutMode(nearNode), size),
    });
  }

  return JSON.stringify({
    parent: parent.id,
    insertIndex,
    siblingCount: children.length,
    layout: layoutMode,
    suggestion: buildSuggestion(parent.id, insertIndex, children.length, nearId),
    recommendedStyle: suggestStyle(layoutMode, size),
  });
}

function detectLayoutMode(node: Z10Node): string {
  const display = node.styles['display'];
  const flexDir = node.styles['flex-direction'];
  const gridCols = node.styles['grid-template-columns'];

  if (display === 'grid' || gridCols) return 'grid';
  if (display === 'flex' || display === 'inline-flex') {
    return flexDir === 'column' ? 'flex-column' : 'flex-row';
  }
  return 'block';
}

function buildSuggestion(parentId: string, index: number, total: number, nearId?: string): string {
  if (nearId) {
    return `Place after "${nearId}" in "${parentId}" at index ${index}`;
  }
  if (total === 0) {
    return `Place as first child of "${parentId}"`;
  }
  return `Append to "${parentId}" at index ${index} (${total} existing children)`;
}

function suggestStyle(layout: string, size?: { width?: number; height?: number }): Record<string, string> {
  const style: Record<string, string> = {};

  if (size?.width) style['width'] = `${size.width}px`;
  if (size?.height) style['height'] = `${size.height}px`;

  switch (layout) {
    case 'flex-row':
      style['flex-shrink'] = '0';
      break;
    case 'flex-column':
      style['width'] = style['width'] ?? '100%';
      break;
    case 'grid':
      break;
    case 'block':
    default:
      style['width'] = style['width'] ?? '100%';
      break;
  }

  return style;
}

// ---------------------------------------------------------------------------
// reconcile Implementation
// ---------------------------------------------------------------------------

function handleReconcile(doc: Z10Document, args: ToolArgs): string {
  const sourceDir = args['source'] as string | undefined;

  const orphanedNodes: string[] = [];
  const missingParents: Array<{ id: string; parent: string }> = [];
  const intentCounts: Record<string, number> = {};
  const editorCounts: Record<string, number> = {};

  for (const node of doc.nodes.values()) {
    if (node.parent && !doc.nodes.has(node.parent)) {
      missingParents.push({ id: node.id, parent: node.parent });
    }

    if (!node.parent) {
      const isPageRoot = doc.pages.some(p => p.rootNodeId === node.id);
      if (!isPageRoot) {
        orphanedNodes.push(node.id);
      }
    }

    const intent = node.intent ?? 'unspecified';
    intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;

    const editor = node.editor ?? 'unspecified';
    editorCounts[editor] = (editorCounts[editor] ?? 0) + 1;
  }

  const componentUsage: Record<string, number> = {};
  const unknownComponents: Array<{ id: string; component: string }> = [];

  for (const node of doc.nodes.values()) {
    if (node.componentName) {
      componentUsage[node.componentName] = (componentUsage[node.componentName] ?? 0) + 1;
      if (!doc.components.has(node.componentName)) {
        unknownComponents.push({ id: node.id, component: node.componentName });
      }
    }
  }

  const unusedComponents: string[] = [];
  for (const name of doc.components.keys()) {
    if (!componentUsage[name]) {
      unusedComponents.push(name);
    }
  }

  const tokenRefs = new Set<string>();
  for (const node of doc.nodes.values()) {
    for (const value of Object.values(node.styles)) {
      const matches = value.match(/var\(--[^)]+\)/g);
      if (matches) {
        for (const m of matches) {
          tokenRefs.add(m.slice(4, -1));
        }
      }
    }
  }

  const definedTokens = new Set<string>();
  for (const t of doc.tokens.primitives.values()) definedTokens.add(t.name);
  for (const t of doc.tokens.semantic.values()) definedTokens.add(t.name);

  const undefinedTokenRefs = [...tokenRefs].filter(t => !definedTokens.has(t));
  const unusedTokens = [...definedTokens].filter(t => !tokenRefs.has(t));

  const issues: string[] = [];
  if (missingParents.length > 0) issues.push(`${missingParents.length} nodes reference missing parents`);
  if (orphanedNodes.length > 0) issues.push(`${orphanedNodes.length} orphaned root nodes`);
  if (unknownComponents.length > 0) issues.push(`${unknownComponents.length} nodes reference undefined components`);
  if (undefinedTokenRefs.length > 0) issues.push(`${undefinedTokenRefs.length} undefined token references`);

  const result = {
    status: issues.length === 0 ? 'healthy' : 'issues_found',
    summary: {
      totalNodes: doc.nodes.size,
      totalComponents: doc.components.size,
      totalPages: doc.pages.length,
      totalTokens: definedTokens.size,
    },
    integrity: {
      orphanedNodes,
      missingParents,
    },
    components: {
      usage: componentUsage,
      unknownReferences: unknownComponents,
      unusedDefinitions: unusedComponents,
    },
    tokens: {
      undefinedReferences: undefinedTokenRefs,
      unusedDefinitions: unusedTokens,
    },
    classification: {
      byIntent: intentCounts,
      byEditor: editorCounts,
    },
    issues,
    ...(sourceDir ? {
      reconciliation: {
        sourceDir,
        note: 'Full code-to-design reconciliation requires the visual editor. This analysis covers document-level consistency only.',
      },
    } : {}),
  };

  return JSON.stringify(result, null, 2);
}
