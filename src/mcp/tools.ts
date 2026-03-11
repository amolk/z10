/**
 * MCP tool definitions and handlers for the Zero-10 MCP server.
 * Implements the read and write tools from PRD Section 2.10.
 */

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
    commands: `Zero-10 has 12 write commands:
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
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
