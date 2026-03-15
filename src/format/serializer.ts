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
import { toTagName, isZ10CustomElement } from '../core/types.js';
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
  const tagName = schema.tagName || toTagName(schema.name);

  // 1. Z10 metadata JSON
  const metadata: Record<string, unknown> = {};
  if (schema.description) metadata.description = schema.description;
  if (schema.category) metadata.category = schema.category;
  metadata.props = schema.props;
  metadata.variants = schema.variants;
  if (schema.slots) metadata.slots = schema.slots;

  const metaJson = JSON.stringify(metadata, null, 2).replace(/<\/(script)/gi, '<\\/$1');
  parts.push(
    `<script type="application/z10+json" data-z10-role="component-meta" data-z10-component="${escapeHtml(schema.name)}">\n${metaJson}\n</script>`,
  );

  // 2. Template with embedded styles
  const templateId = `${tagName}-template`;
  const templateParts: string[] = [];
  if (schema.styles) {
    const safeStyles = schema.styles.replace(/<\/(style)/gi, '<\\/$1');
    templateParts.push(`  <style>\n${safeStyles.split('\n').map(l => '    ' + l).join('\n')}\n  </style>`);
  }
  if (schema.template) {
    templateParts.push(`  ${schema.template}`);
  }
  parts.push(`<template id="${templateId}">\n${templateParts.join('\n')}\n</template>`);

  // 3. Script module with class body
  if (schema.classBody) {
    parts.push(
      `<script type="module" data-z10-component="${escapeHtml(schema.name)}">\n${schema.classBody.replace(/<\/(script)/gi, '<\\/$1')}\n</script>`,
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

  const styleStr = serializeStyle(root.styles);
  const styleAttr = styleStr ? ` style="${escapeHtml(styleStr)}"` : '';
  return `<div data-z10-page="${escapeHtml(page.name)}" data-z10-mode="${page.mode}" data-z10-id="${escapeHtml(root.id)}"${styleAttr}>\n${serializeChildren(doc, root.id, 1)}\n</div>`;
}

function serializeChildren(doc: Z10Document, parentId: NodeId, depth: number): string {
  const children = getChildren(doc, parentId);
  if (children.length === 0) return '';

  const indent = '  '.repeat(depth);
  return children.map(child => serializeNode(doc, child, depth)).join('\n');
}

function serializeNode(doc: Z10Document, node: Z10Node, depth: number): string {
  const indent = '  '.repeat(depth);
  const tag = node.tag;
  const attrs = buildNodeAttributes(node);
  const children = getChildren(doc, node.id);

  if (children.length === 0 && !node.textContent) {
    // Self-closing style for empty nodes
    return `${indent}<${tag}${attrs}></${tag}>`;
  }

  const parts: string[] = [];
  parts.push(`${indent}<${tag}${attrs}>`);

  if (node.textContent) {
    parts.push(`${indent}  ${escapeHtml(node.textContent)}`);
  }

  if (children.length > 0) {
    parts.push(serializeChildren(doc, node.id, depth + 1));
  }

  parts.push(`${indent}</${tag}>`);
  return parts.join('\n');
}

function buildNodeAttributes(node: Z10Node): string {
  const attrs: string[] = [];

  // Core z10 attributes
  attrs.push(`data-z10-id="${escapeHtml(node.id)}"`);

  if (node.componentName) {
    attrs.push(`data-z10-component="${escapeHtml(node.componentName)}"`);
  }

  if (node.componentDef) {
    attrs.push(`data-z10-component-def="${escapeHtml(node.componentDef)}"`);
  }

  if (node.componentOverrides) {
    attrs.push(`data-z10-overrides="${escapeHtml(JSON.stringify(node.componentOverrides))}"`);
  }

  if (node.componentVariant) {
    attrs.push(`data-z10-variant="${escapeHtml(node.componentVariant)}"`);
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
    'data-z10-id', 'data-z10-component', 'data-z10-component-def',
    'data-z10-overrides', 'data-z10-variant', 'data-z10-intent',
    'data-z10-editor', 'data-z10-agent-editable',
    'data-z10-page', 'data-z10-mode',
  ]);
  for (const [key, value] of Object.entries(node.attributes)) {
    if (!handledAttrs.has(key)) {
      attrs.push(`${key}="${escapeHtml(value)}"`);
    }
  }

  // For custom element instances, serialize component props as HTML attributes
  if (isZ10CustomElement(node.tag) && node.componentProps) {
    for (const [key, value] of Object.entries(node.componentProps)) {
      if (typeof value === 'boolean') {
        if (value) attrs.push(key);
      } else {
        attrs.push(`${key}="${escapeHtml(String(value))}"`);
      }
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
