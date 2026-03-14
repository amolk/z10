/**
 * MCP tool definitions and handlers for the Zero-10 MCP server.
 * Implements the read and write tools from PRD Section 2.10.
 */

import { z, type ZodRawShape } from 'zod';
import type {
  Z10Document,
  Z10Command,
  Z10Node,
  NodeId,
  CommandResult,
  ComponentSchema,
} from '../core/types.js';
import {
  getNode,
  getChildren,
  getSubtree,
  getComponent,
  getToken,
  executeCommand,
  serializeStyle,
} from '../core/index.js';
import { exportReact } from '../export/react.js';
import { exportVue } from '../export/vue.js';
import { exportSvelte } from '../export/svelte.js';
import { parseStatements, createExecEnvironment, executeStatement, summarizeStatement } from '../cli/exec.js';
import { serializeZ10Html } from '../format/serializer.js';
import { parseZ10Html } from '../format/parser.js';
// checksum.ts deleted in B8 — stub until MCP tools are overhauled in Phase E
function computeChecksum(_html: string): string { return ''; }

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

export const WRITE_TOOLS: ToolDefinition[] = [
  {
    name: 'z10_page',
    description: 'Create a new page with a root node. Required before adding any other nodes to an empty document.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Page name (e.g. "Page 1")' },
        rootId: { type: 'string', description: 'Root node ID (optional, auto-generated if omitted)' },
        mode: { type: 'string', enum: ['light', 'dark'], description: 'Display mode (default: project default)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'z10_node',
    description: 'Create a container element. Errors if ID exists or parent missing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique node ID' },
        tag: { type: 'string', description: 'HTML tag name (e.g. div, header, section)' },
        parent: { type: 'string', description: 'Parent node ID' },
        style: { type: 'string', description: 'Inline CSS styles' },
        intent: { type: 'string', enum: ['layout', 'design', 'decoration', 'content', 'interaction', 'code-region'] },
      },
      required: ['id', 'tag', 'parent'],
    },
  },
  {
    name: 'z10_text',
    description: 'Create a text element',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique node ID' },
        parent: { type: 'string', description: 'Parent node ID' },
        content: { type: 'string', description: 'Text content' },
        style: { type: 'string', description: 'Inline CSS styles' },
      },
      required: ['id', 'parent', 'content'],
    },
  },
  {
    name: 'z10_instance',
    description: 'Instantiate a component. Component must be defined first.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique instance ID' },
        component: { type: 'string', description: 'Component name' },
        parent: { type: 'string', description: 'Parent node ID' },
        props: { type: 'object', description: 'Component prop values' },
      },
      required: ['id', 'component', 'parent'],
    },
  },
  {
    name: 'z10_repeat',
    description: 'Generate repeated elements with faker data',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Base ID for repeated instances' },
        parent: { type: 'string', description: 'Parent node ID' },
        count: { type: 'number', description: 'Number of instances to create' },
        component: { type: 'string', description: 'Component name' },
        props: { type: 'object', description: 'Props with optional faker directives' },
      },
      required: ['id', 'parent', 'count', 'component'],
    },
  },
  {
    name: 'z10_style',
    description: 'Update CSS properties on a node. Merge semantics: only specified properties change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to style' },
        props: { type: 'object', description: 'CSS properties to set/update' },
      },
      required: ['id', 'props'],
    },
  },
  {
    name: 'z10_move',
    description: 'Move or reorder a node in the tree',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to move' },
        parent: { type: 'string', description: 'New parent node ID' },
        index: { type: 'number', description: 'Position index in parent (optional, appends if omitted)' },
      },
      required: ['id', 'parent'],
    },
  },
  {
    name: 'z10_remove',
    description: 'Remove a node and all its children',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID to remove' },
      },
      required: ['id'],
    },
  },
  {
    name: 'z10_component',
    description: 'Define or update a component schema',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Component name' },
        props: { type: 'array', description: 'Component prop definitions' },
        variants: { type: 'array', description: 'Component variants' },
        styles: { type: 'string', description: 'Component CSS styles' },
        template: { type: 'string', description: 'Component HTML template' },
      },
      required: ['name', 'props', 'variants', 'styles', 'template'],
    },
  },
  {
    name: 'z10_tokens',
    description: 'Add or update design tokens',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: ['primitives', 'semantic'], description: 'Token collection' },
        vars: { type: 'object', description: 'Token name-value pairs (CSS custom properties)' },
      },
      required: ['collection', 'vars'],
    },
  },
  {
    name: 'z10_batch',
    description: 'Execute multiple commands atomically. Default: skip failures. strict: halt on error. upsert: create-or-update.',
    inputSchema: {
      type: 'object',
      properties: {
        commands: { type: 'array', description: 'Array of z10 command objects' },
        mode: { type: 'string', enum: ['strict', 'upsert'], description: 'Batch mode (optional)' },
      },
      required: ['commands'],
    },
  },
  {
    name: 'z10_attr',
    description: 'Set data attributes or HTML attributes on a node',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Node ID' },
        attributes: { type: 'object', description: 'Attribute key-value pairs' },
      },
      required: ['id', 'attributes'],
    },
  },
  {
    name: 'write_html',
    description: 'Raw HTML escape hatch. Stores HTML content on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Target node ID' },
        html: { type: 'string', description: 'Raw HTML content' },
      },
      required: ['id', 'html'],
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
    description: 'Analyze the design document for consistency and report node statistics, orphaned nodes, missing parents, and component usage. Optionally validate against a source directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source directory to compare against (optional, for future reconciliation pipeline)' },
      },
      required: [],
    },
  },
  {
    name: 'z10_exec',
    description: 'Execute JavaScript code against the design document DOM. Batch mode — accepts full JS source, executes all statements, returns results. Use standard DOM APIs (querySelector, createElement, appendChild, etc.) and the z10 global (z10.setTokens). For non-CLI agents that cannot use stdin piping.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute against the document DOM. Use standard DOM APIs.' },
      },
      required: ['code'],
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
    case 'z10_exec':
      return handleZ10Exec(doc, args);
    default:
      return JSON.stringify({ error: `Unknown utility tool: ${name}` });
  }
}

/** Handle a write tool call */
export function handleWriteTool(doc: Z10Document, name: string, args: ToolArgs): string {
  const cmd = writeToolToCommand(name, args);
  if (!cmd) {
    return JSON.stringify({ error: `Unknown write tool: ${name}` });
  }
  const result = executeCommand(doc, cmd);
  return JSON.stringify(result);
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
    commands: `Zero-10 has 13 write commands:
0. z10_page(name, rootId?, mode?) - Create a page (required first for empty documents)
1. z10_node(id, tag, parent) - Create container
2. z10_text(id, parent, content) - Create text
3. z10_instance(id, component, parent) - Instantiate component
4. z10_repeat(id, parent, count, component) - Repeat with faker
5. z10_style(id, props) - Update CSS (merge semantics)
6. z10_move(id, parent, index?) - Move/reorder
7. z10_remove(id) - Delete node and children
8. z10_component(name, schema) - Define component
9. z10_tokens(collection, vars) - Set design tokens
10. z10_batch(commands, mode?) - Batch execute
11. z10_attr(id, attributes) - Set HTML attributes
12. write_html(id, html) - Raw HTML fallback`,

    styles: `z10_style uses MERGE semantics: only specified properties change.
All visual changes go through z10_style since it's just CSS.
Examples: layout (display, flex-direction), colors (background, color),
spacing (padding, margin, gap), typography (font-size, font-weight).`,

    tokens: `Design tokens are CSS custom properties in two collections:
- primitives: Raw values (--blue-500: #3b82f6)
- semantic: References to primitives (--primary: var(--blue-500))
Use z10_tokens to add/update. Reference in styles with var(--name).`,

    components: `Components have: name, props, variants, styles, template.
Define with z10_component, instantiate with z10_instance.
Use z10_repeat for multiple instances with faker data.`,

    batch: `z10_batch executes multiple commands:
- Default mode: skip failures, continue
- strict: halt on first error
- upsert: create-or-update (recommended for re-running designs)`,
  };

  if (topic && guides[topic]) {
    return guides[topic];
  }

  return `Available topics: ${Object.keys(guides).join(', ')}\n\n${guides['commands']}`;
}

// ---------------------------------------------------------------------------
// Write Tool → Command Conversion
// ---------------------------------------------------------------------------

function writeToolToCommand(name: string, args: ToolArgs): Z10Command | null {
  switch (name) {
    case 'z10_page':
      return {
        type: 'page',
        name: args['name'] as string,
        rootId: args['rootId'] as string | undefined,
        mode: args['mode'] as 'light' | 'dark' | undefined,
      };

    case 'z10_node':
      return {
        type: 'node',
        id: args['id'] as string,
        tag: args['tag'] as string,
        parent: args['parent'] as string,
        style: args['style'] as string | undefined,
        intent: args['intent'] as Z10Command extends { intent?: infer I } ? I : never,
      } as Z10Command;

    case 'z10_text':
      return {
        type: 'text',
        id: args['id'] as string,
        parent: args['parent'] as string,
        content: args['content'] as string,
        style: args['style'] as string | undefined,
      };

    case 'z10_instance':
      return {
        type: 'instance',
        id: args['id'] as string,
        component: args['component'] as string,
        parent: args['parent'] as string,
        props: args['props'] as Record<string, string | number | boolean> | undefined,
      };

    case 'z10_repeat':
      return {
        type: 'repeat',
        id: args['id'] as string,
        parent: args['parent'] as string,
        count: args['count'] as number,
        component: args['component'] as string,
        props: args['props'] as Record<string, unknown> | undefined,
      } as Z10Command;

    case 'z10_style':
      return {
        type: 'style',
        id: args['id'] as string,
        props: args['props'] as Record<string, string>,
      };

    case 'z10_move':
      return {
        type: 'move',
        id: args['id'] as string,
        parent: args['parent'] as string,
        index: args['index'] as number | undefined,
      };

    case 'z10_remove':
      return { type: 'remove', id: args['id'] as string };

    case 'z10_component':
      return {
        type: 'component',
        name: args['name'] as string,
        schema: {
          props: (args['props'] ?? []) as ComponentSchema['props'],
          variants: (args['variants'] ?? []) as ComponentSchema['variants'],
          styles: (args['styles'] ?? '') as string,
          template: (args['template'] ?? '') as string,
        },
      };

    case 'z10_tokens':
      return {
        type: 'tokens',
        collection: args['collection'] as 'primitives' | 'semantic',
        vars: args['vars'] as Record<string, string>,
      };

    case 'z10_batch':
      return {
        type: 'batch',
        commands: (args['commands'] ?? []) as Z10Command[],
        mode: args['mode'] as 'strict' | 'upsert' | undefined,
      };

    case 'z10_attr':
      return {
        type: 'attr',
        id: args['id'] as string,
        attributes: args['attributes'] as Record<string, string>,
      };

    case 'write_html':
      return {
        type: 'write_html',
        id: args['id'] as string,
        html: args['html'] as string,
      };

    default:
      return null;
  }
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

/**
 * Analyze existing layout and suggest optimal placement for a new element.
 *
 * PRD Section 2.10: find_placement(size?) — Suggest canvas position
 *
 * Strategy:
 * 1. Find the target parent (explicit or page root)
 * 2. Count existing children to determine insertion index
 * 3. Analyze parent's layout mode (flex, grid, block) to suggest position
 * 4. If "near" is specified, suggest placement adjacent to that node
 */
function handleFindPlacement(doc: Z10Document, args: ToolArgs): string {
  const parentId = args['parent'] as string | undefined;
  const nearId = args['near'] as string | undefined;
  const positionHint = (args['position'] as string) ?? 'auto';
  const size = args['size'] as { width?: number; height?: number } | undefined;

  // Find parent node
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

  // Detect parent layout mode from styles
  const layoutMode = detectLayoutMode(parent);

  // Determine insertion index
  let insertIndex = children.length; // default: append
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
    // Place inside the near node instead
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

  // Suggest styles that work well with the parent's layout
  switch (layout) {
    case 'flex-row':
      // In a flex row, suggest flex shrink/grow
      style['flex-shrink'] = '0';
      break;
    case 'flex-column':
      style['width'] = style['width'] ?? '100%';
      break;
    case 'grid':
      // Grid children usually don't need explicit sizing
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

/**
 * Analyze design document consistency and report issues.
 *
 * PRD Section 2.10: reconcile(source?) — Trigger sync
 * PRD Section 3.3: Reconciliation Pipeline (Steps 1-8)
 *
 * Current implementation performs document-level analysis:
 * - Node tree integrity (orphaned nodes, missing parents)
 * - Component usage validation
 * - Token coverage analysis
 * - Intent classification summary
 *
 * Full code-to-design reconciliation (PRD Section 3.3) requires
 * JSX/TSX parsing and is deferred to the visual editor.
 */
function handleReconcile(doc: Z10Document, args: ToolArgs): string {
  const sourceDir = args['source'] as string | undefined;

  // Node integrity analysis
  const orphanedNodes: string[] = [];
  const missingParents: Array<{ id: string; parent: string }> = [];
  const intentCounts: Record<string, number> = {};
  const editorCounts: Record<string, number> = {};

  for (const node of doc.nodes.values()) {
    // Check for orphaned nodes (have parent but parent doesn't exist)
    if (node.parent && !doc.nodes.has(node.parent)) {
      missingParents.push({ id: node.id, parent: node.parent });
    }

    // Check for nodes not reachable from any page root
    if (!node.parent) {
      const isPageRoot = doc.pages.some(p => p.rootNodeId === node.id);
      if (!isPageRoot) {
        orphanedNodes.push(node.id);
      }
    }

    // Tally intents
    const intent = node.intent ?? 'unspecified';
    intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;

    // Tally editors
    const editor = node.editor ?? 'unspecified';
    editorCounts[editor] = (editorCounts[editor] ?? 0) + 1;
  }

  // Component usage analysis
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

  // Unused components (defined but never instantiated)
  const unusedComponents: string[] = [];
  for (const name of doc.components.keys()) {
    if (!componentUsage[name]) {
      unusedComponents.push(name);
    }
  }

  // Token coverage
  const tokenRefs = new Set<string>();
  for (const node of doc.nodes.values()) {
    for (const value of Object.values(node.styles)) {
      const matches = value.match(/var\(--[^)]+\)/g);
      if (matches) {
        for (const m of matches) {
          tokenRefs.add(m.slice(4, -1)); // extract --token-name
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
        note: 'Full code-to-design reconciliation (PRD Section 3.3) requires the visual editor. This analysis covers document-level consistency only.',
      },
    } : {}),
  };

  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// z10_exec — JavaScript execution via MCP (batch mode)
// ---------------------------------------------------------------------------

/**
 * Execute JavaScript code against the document DOM.
 * This is the MCP fallback for agents that can't use the CLI.
 * Operates in batch mode: all statements execute, results returned at once.
 */
function handleZ10Exec(doc: Z10Document, args: ToolArgs): string {
  const code = args['code'] as string;
  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'Missing required parameter: code' });
  }

  // Parse the code into statements
  let statements: string[];
  try {
    statements = parseStatements(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: msg, statements: 0 });
  }

  if (statements.length === 0) {
    return JSON.stringify({ error: 'No statements to execute', statements: 0 });
  }

  // Serialize current doc to HTML for the exec environment
  const currentHtml = serializeZ10Html(doc);
  const { context, getHtml } = createExecEnvironment(currentHtml);

  const results: Array<{
    statement: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const stmt of statements) {
    const execResult = executeStatement(stmt, context);
    const summary = summarizeStatement(stmt);

    if (!execResult.success) {
      results.push({
        statement: summary,
        success: false,
        error: execResult.error,
      });
      // Stop on first error (fail-fast)
      const finalChecksum = computeChecksum(getHtml());
      return JSON.stringify({
        success: false,
        results,
        statementsExecuted: results.length,
        statementsTotal: statements.length,
        checksum: finalChecksum,
      }, null, 2);
    }

    results.push({ statement: summary, success: true });
  }

  // Apply the final DOM state back to the document
  const finalHtml = getHtml();
  const finalChecksum = computeChecksum(finalHtml);

  // Re-parse the modified HTML back into the document
  try {
    const updatedDoc = parseZ10Html(`<!DOCTYPE html><html><head></head><body>${finalHtml}</body></html>`);
    // Merge updated nodes into the current document
    doc.nodes = updatedDoc.nodes;
  } catch {
    // If re-parse fails, report success but note the sync issue
  }

  return JSON.stringify({
    success: true,
    results,
    statementsExecuted: results.length,
    statementsTotal: statements.length,
    checksum: finalChecksum,
    html: finalHtml,
  }, null, 2);
}
