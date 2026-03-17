import type {
  Z10Document,
  Z10Node,
  Z10Page,
  ProjectConfig,
  TokenSet,
  ComponentSchema,
  NodeId,
  DesignToken,
  TokenCollection,
  StyleMap,
  NodeIntent,
  NodeEditor,
  GovernanceLevel,
} from './types.js';
import { createSimpleRegistry } from './component-factory.js';

/** Default project configuration */
function defaultConfig(): ProjectConfig {
  return {
    name: 'Untitled',
    version: '1.0.0',
    governance: 'full-edit',
    defaultMode: 'light',
  };
}

/** Create an empty token set */
function emptyTokenSet(): TokenSet {
  return {
    primitives: new Map(),
    semantic: new Map(),
  };
}

/** Create a new empty Z10 document */
export function createDocument(config?: Partial<ProjectConfig>): Z10Document {
  return {
    config: { ...defaultConfig(), ...config },
    tokens: emptyTokenSet(),
    components: new Map(),
    nodes: new Map(),
    pages: [],
  };
}

/** Create a new Z10 document with a default page ready for use */
export function createDocumentWithPage(config?: Partial<ProjectConfig>): Z10Document {
  const doc = createDocument(config);
  const rootNode = createNode({
    id: 'page_root',
    tag: 'div',
    parent: null,
    intent: 'layout',
    style: 'width: 1440px; min-height: 900px; background: #ffffff; position: relative;',
  });
  addNode(doc, rootNode);
  doc.pages.push({ name: 'Page 1', rootNodeId: 'page_root', mode: doc.config.defaultMode });
  return doc;
}

// ---------------------------------------------------------------------------
// Node Operations
// ---------------------------------------------------------------------------

/** Generate a unique node ID */
let _idCounter = 0;
export function generateNodeId(prefix = 'node'): NodeId {
  return `${prefix}_${++_idCounter}`;
}

/** Reset ID counter (for testing) */
export function resetIdCounter(): void {
  _idCounter = 0;
}

/** Create a new node with defaults */
export function createNode(opts: {
  id: NodeId;
  tag: string;
  parent: NodeId | null;
  style?: string;
  intent?: NodeIntent;
  editor?: NodeEditor;
  agentEditable?: boolean;
  textContent?: string;
  componentName?: string;
  componentProps?: Record<string, string | number | boolean>;
  attributes?: Record<string, string>;
  componentDef?: string;
  componentOverrides?: Record<string, string | number | boolean>;
  componentVariant?: string;
}): Z10Node {
  return {
    id: opts.id,
    tag: opts.tag,
    parent: opts.parent,
    children: [],
    styles: opts.style ? parseInlineStyle(opts.style) : {},
    attributes: opts.attributes ?? {},
    textContent: opts.textContent,
    intent: opts.intent ?? 'content',
    editor: opts.editor ?? 'designer',
    agentEditable: opts.agentEditable ?? true,
    componentName: opts.componentName,
    componentProps: opts.componentProps,
    componentDef: opts.componentDef,
    componentOverrides: opts.componentOverrides,
    componentVariant: opts.componentVariant,
  };
}

/** Parse a CSS inline style string into a key-value map */
export function parseInlineStyle(style: string): StyleMap {
  const result: StyleMap = {};
  if (!style.trim()) return result;

  const declarations = style.split(';');
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) {
      result[prop] = value;
    }
  }
  return result;
}

/** Serialize a StyleMap back to an inline style string */
export function serializeStyle(styles: StyleMap): string {
  return Object.entries(styles)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

// ---------------------------------------------------------------------------
// Document Mutations
// ---------------------------------------------------------------------------

/** Add a node to the document, linking it to its parent */
export function addNode(doc: Z10Document, node: Z10Node): void {
  doc.nodes.set(node.id, node);
  if (node.parent) {
    const parent = doc.nodes.get(node.parent);
    if (parent) {
      parent.children.push(node.id);
    }
  }
}

/** Remove a node and all its descendants from the document.
 *  Throws if the node is a page root — remove the page first. */
export function removeNode(doc: Z10Document, id: NodeId): Z10Node | undefined {
  const node = doc.nodes.get(id);
  if (!node) return undefined;

  // Guard: prevent deletion of page root nodes
  const pageRef = doc.pages.find(p => p.rootNodeId === id);
  if (pageRef) {
    const err = new Error(`Cannot remove node "${id}": it is the root of page "${pageRef.name}". Remove the page first.`);
    err.name = "PageRootRemovalError";
    throw err;
  }

  // Recursively remove children (copy array since we're mutating)
  for (const childId of [...node.children]) {
    removeNode(doc, childId);
  }

  // Remove from parent's children list
  if (node.parent) {
    const parent = doc.nodes.get(node.parent);
    if (parent) {
      const idx = parent.children.indexOf(id);
      if (idx !== -1) parent.children.splice(idx, 1);
    }
  }

  doc.nodes.delete(id);
  return node;
}

/** Move a node to a new parent (or reorder within same parent) */
export function moveNode(doc: Z10Document, id: NodeId, newParent: NodeId, index?: number): boolean {
  const node = doc.nodes.get(id);
  const targetParent = doc.nodes.get(newParent);
  if (!node || !targetParent) return false;

  // Remove from old parent
  if (node.parent) {
    const oldParent = doc.nodes.get(node.parent);
    if (oldParent) {
      const idx = oldParent.children.indexOf(id);
      if (idx !== -1) oldParent.children.splice(idx, 1);
    }
  }

  // Add to new parent
  node.parent = newParent;
  if (index !== undefined && index >= 0 && index <= targetParent.children.length) {
    targetParent.children.splice(index, 0, id);
  } else {
    targetParent.children.push(id);
  }

  return true;
}

/** Update styles on a node (merge semantics — only specified properties change) */
export function updateStyles(doc: Z10Document, id: NodeId, props: StyleMap): boolean {
  const node = doc.nodes.get(id);
  if (!node) return false;
  Object.assign(node.styles, props);
  return true;
}

/** Update attributes on a node */
export function updateAttributes(doc: Z10Document, id: NodeId, attrs: Record<string, string>): boolean {
  const node = doc.nodes.get(id);
  if (!node) return false;
  Object.assign(node.attributes, attrs);
  return true;
}

// ---------------------------------------------------------------------------
// Token Operations
// ---------------------------------------------------------------------------

/** Add or update a design token */
export function setToken(doc: Z10Document, token: DesignToken): void {
  doc.tokens[token.collection].set(token.name, token);
}

/** Set multiple tokens at once */
export function setTokens(doc: Z10Document, collection: TokenCollection, vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    setToken(doc, { name, value, collection });
  }
}

/** Get a token by name across all collections */
export function getToken(doc: Z10Document, name: string): DesignToken | undefined {
  return doc.tokens.primitives.get(name) ?? doc.tokens.semantic.get(name);
}

// ---------------------------------------------------------------------------
// Component Operations — forwarding shims to ComponentRegistry
// ---------------------------------------------------------------------------

/** Register a component schema (low-level, no validation) */
export function setComponent(doc: Z10Document, schema: ComponentSchema): void {
  doc.components.set(schema.name, schema);
}

/** Get a component schema by name */
export function getComponent(doc: Z10Document, name: string): ComponentSchema | undefined {
  return doc.components.get(name);
}

/** Validate and register a ComponentSchema, auto-generating tagName/classBody if missing.
 *  Throws if the component name is not valid PascalCase (e.g. "MetricCard"). */
export function registerComponent(doc: Z10Document, schema: ComponentSchema): void {
  const registry = createSimpleRegistry(doc);
  registry.register(schema);
}

/** Remove a component schema by name. Returns true if it existed. */
export function unregisterComponent(doc: Z10Document, name: string): boolean {
  const registry = createSimpleRegistry(doc);
  return registry.unregister(name);
}

/** Return all nodes whose tag matches the component's tagName (starts with z10-) */
export function findInstances(doc: Z10Document, componentName: string): Z10Node[] {
  const registry = createSimpleRegistry(doc);
  return registry.instances(componentName);
}

/** Replace a custom element node with a plain <div>, preserving attributes/styles but removing component association */
export function detachInstance(doc: Z10Document, instanceId: NodeId): Z10Node | undefined {
  const registry = createSimpleRegistry(doc);
  return registry.detach(instanceId);
}

// ---------------------------------------------------------------------------
// Page Operations
// ---------------------------------------------------------------------------

/** Add a page to the document */
export function addPage(doc: Z10Document, page: Z10Page): void {
  doc.pages.push(page);
}

/** Remove a page by name. Optionally removes the root node tree as well. */
export function removePage(doc: Z10Document, name: string, opts?: { removeRootNode?: boolean }): boolean {
  const idx = doc.pages.findIndex(p => p.name === name);
  if (idx === -1) return false;
  const rootNodeId = doc.pages[idx]!.rootNodeId;
  doc.pages.splice(idx, 1);
  if (opts?.removeRootNode) {
    removeNode(doc, rootNodeId);
  }
  return true;
}

/** Get a page by name */
export function getPage(doc: Z10Document, name: string): Z10Page | undefined {
  return doc.pages.find(p => p.name === name);
}

// ---------------------------------------------------------------------------
// Query Operations
// ---------------------------------------------------------------------------

/** Get a node by ID */
export function getNode(doc: Z10Document, id: NodeId): Z10Node | undefined {
  return doc.nodes.get(id);
}

/** Get all children of a node */
export function getChildren(doc: Z10Document, id: NodeId): Z10Node[] {
  const node = doc.nodes.get(id);
  if (!node) return [];
  return node.children
    .map(cid => doc.nodes.get(cid))
    .filter((n): n is Z10Node => n !== undefined);
}

/** Get the subtree rooted at a node (depth-first) */
export function getSubtree(doc: Z10Document, id: NodeId, maxDepth = Infinity): Z10Node[] {
  const result: Z10Node[] = [];
  const visit = (nodeId: NodeId, depth: number) => {
    if (depth > maxDepth) return;
    const node = doc.nodes.get(nodeId);
    if (!node) return;
    result.push(node);
    for (const childId of node.children) {
      visit(childId, depth + 1);
    }
  };
  visit(id, 0);
  return result;
}

/** Check if an agent is allowed to edit a node given the governance model */
export function canAgentEdit(doc: Z10Document, id: NodeId): boolean {
  if (doc.config.governance === 'full-edit') return true;
  if (doc.config.governance === 'scoped-edit') {
    const node = doc.nodes.get(id);
    return node?.agentEditable ?? false;
  }
  // propose-approve: agent can write to staging, which is handled at a higher level
  return true;
}
