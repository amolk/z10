/**
 * Serializer for the .z10.html file format.
 *
 * Converts a Z10Document in-memory model back to a .z10.html string.
 * Output follows the file structure defined in PRD Section 4.4.
 */

import type {
  Z10Document,
  Z10Node,
  Z10Page,
  ComponentSchema,
  TokenSet,
  NodeId,
} from '../core/types.js';
import { getChildren, serializeStyle } from '../core/document.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Serialize a Z10Document to a .z10.html string */
export function serializeZ10Html(doc: Z10Document): string {
  const parts: string[] = [];

  parts.push(`<html data-z10-project="${escapeHtml(doc.config.name)}">`);
  parts.push('<head>');

  // Config block
  parts.push(serializeConfig(doc));

  // Token blocks
  parts.push(serializeTokens(doc.tokens));

  // Component blocks
  for (const component of doc.components.values()) {
    parts.push(serializeComponent(component));
  }

  // CSS reset for proper rendering
  parts.push('<style data-z10-role="reset">\n*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }\nhtml, body { width: 100%; height: 100%; }\n</style>');

  parts.push('</head>');

  // Body with pages
  parts.push('<body>');
  for (const page of doc.pages) {
    parts.push(serializePage(doc, page));
  }
  parts.push('</body>');

  parts.push('</html>');

  return parts.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Config Serialization
// ---------------------------------------------------------------------------

function serializeConfig(doc: Z10Document): string {
  const config = {
    name: doc.config.name,
    version: doc.config.version,
    governance: doc.config.governance,
    defaultMode: doc.config.defaultMode,
  };
  return `<script type="application/z10+json" data-z10-role="config">\n${JSON.stringify(config, null, 2)}\n</script>`;
}

// ---------------------------------------------------------------------------
// Token Serialization
// ---------------------------------------------------------------------------

function serializeTokens(tokens: TokenSet): string {
  const parts: string[] = [];

  for (const collection of ['primitives', 'semantic'] as const) {
    const tokenMap = tokens[collection];
    if (tokenMap.size === 0) continue;

    const declarations: string[] = [];
    for (const token of tokenMap.values()) {
      declarations.push(`  ${token.name}: ${token.value};`);
    }

    parts.push(
      `<style data-z10-tokens="${collection}">\n:root {\n${declarations.join('\n')}\n}\n</style>`,
    );
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Component Serialization
// ---------------------------------------------------------------------------

function serializeComponent(schema: ComponentSchema): string {
  const parts: string[] = [];

  // Component metadata JSON
  const metadata: Record<string, unknown> = {
    name: schema.name,
    props: schema.props,
    variants: schema.variants,
  };
  if (schema.description) metadata['description'] = schema.description;
  if (schema.slots) metadata['slots'] = schema.slots;

  parts.push(
    `<script type="application/z10+json" data-z10-role="component">\n${JSON.stringify(metadata, null, 2)}\n</script>`,
  );

  // Component styles
  if (schema.styles) {
    parts.push(
      `<style data-z10-component-styles="${escapeHtml(schema.name)}">\n${schema.styles}\n</style>`,
    );
  }

  // Component template
  if (schema.template) {
    parts.push(
      `<template data-z10-template="${escapeHtml(schema.name)}">\n${schema.template}\n</template>`,
    );
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Page & Node Serialization
// ---------------------------------------------------------------------------

function serializePage(doc: Z10Document, page: Z10Page): string {
  const root = doc.nodes.get(page.rootNodeId);
  if (!root) return '';

  return `<div data-z10-page="${escapeHtml(page.name)}" data-z10-mode="${page.mode}" data-z10-id="${escapeHtml(root.id)}">\n${serializeChildren(doc, root.id, 1)}\n</div>`;
}

function serializeChildren(doc: Z10Document, parentId: NodeId, depth: number): string {
  const children = getChildren(doc, parentId);
  if (children.length === 0) return '';

  const indent = '  '.repeat(depth);
  return children.map(child => serializeNode(doc, child, depth)).join('\n');
}

function serializeNode(doc: Z10Document, node: Z10Node, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs = buildNodeAttributes(node);
  const children = getChildren(doc, node.id);

  if (children.length === 0 && !node.textContent) {
    // Self-closing style for empty nodes
    return `${indent}<${node.tag}${attrs}></${node.tag}>`;
  }

  const parts: string[] = [];
  parts.push(`${indent}<${node.tag}${attrs}>`);

  if (node.textContent) {
    parts.push(`${indent}  ${escapeHtml(node.textContent)}`);
  }

  if (children.length > 0) {
    parts.push(serializeChildren(doc, node.id, depth + 1));
  }

  parts.push(`${indent}</${node.tag}>`);
  return parts.join('\n');
}

function buildNodeAttributes(node: Z10Node): string {
  const attrs: string[] = [];

  // Core z10 attributes
  attrs.push(`data-z10-id="${escapeHtml(node.id)}"`);

  if (node.componentName) {
    attrs.push(`data-z10-component="${escapeHtml(node.componentName)}"`);
  }

  if (node.intent !== 'content') {
    attrs.push(`data-z10-intent="${node.intent}"`);
  }

  if (node.editor !== 'designer') {
    attrs.push(`data-z10-editor="${node.editor}"`);
  }

  if (!node.agentEditable) {
    attrs.push('data-z10-agent-editable="false"');
  }

  // Style attribute
  const styleStr = serializeStyle(node.styles);
  if (styleStr) {
    attrs.push(`style="${escapeHtml(styleStr)}"`);
  }

  // Additional data-z10 attributes (skip ones we already handle)
  const handledAttrs = new Set([
    'data-z10-id', 'data-z10-component', 'data-z10-intent',
    'data-z10-editor', 'data-z10-agent-editable', 'data-z10-node',
    'data-z10-page', 'data-z10-mode',
  ]);
  for (const [key, value] of Object.entries(node.attributes)) {
    if (!handledAttrs.has(key)) {
      attrs.push(`${key}="${escapeHtml(value)}"`);
    }
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
