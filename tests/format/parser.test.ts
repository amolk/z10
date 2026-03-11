import { describe, it, expect } from 'vitest';
import { parseZ10Html } from '../../src/format/parser.js';
import { getNode, getChildren, getToken, getComponent, getPage } from '../../src/core/document.js';

describe('Z10 HTML Parser', () => {
  const MINIMAL_DOC = `<html data-z10-project="Test">
<head>
<script type="application/z10+json" data-z10-role="config">
{
  "name": "Test Project",
  "version": "1.0.0",
  "governance": "full-edit",
  "defaultMode": "light"
}
</script>
</head>
<body>
</body>
</html>`;

  describe('Config Parsing', () => {
    it('parses project config from script block', () => {
      const doc = parseZ10Html(MINIMAL_DOC);
      expect(doc.config.name).toBe('Test Project');
      expect(doc.config.version).toBe('1.0.0');
      expect(doc.config.governance).toBe('full-edit');
      expect(doc.config.defaultMode).toBe('light');
    });

    it('uses defaults for missing config', () => {
      const doc = parseZ10Html('<html><head></head><body></body></html>');
      expect(doc.config.name).toBe('Untitled');
      expect(doc.config.governance).toBe('full-edit');
    });

    it('handles malformed config JSON gracefully', () => {
      const html = `<html><head>
<script type="application/z10+json" data-z10-role="config">{ invalid json }</script>
</head><body></body></html>`;
      const doc = parseZ10Html(html);
      expect(doc.config.name).toBe('Untitled'); // Falls back to default
    });
  });

  describe('Token Parsing', () => {
    const TOKEN_DOC = `<html><head>
<script type="application/z10+json" data-z10-role="config">{"name":"T"}</script>
<style data-z10-tokens="primitives">
:root {
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --spacing-md: 16px;
}
</style>
<style data-z10-tokens="semantic">
:root {
  --primary: var(--blue-500);
  --bg: #ffffff;
}
</style>
</head><body></body></html>`;

    it('parses primitive tokens', () => {
      const doc = parseZ10Html(TOKEN_DOC);
      expect(doc.tokens.primitives.size).toBe(3);
      expect(getToken(doc, '--blue-500')?.value).toBe('#3b82f6');
      expect(getToken(doc, '--spacing-md')?.value).toBe('16px');
    });

    it('parses semantic tokens', () => {
      const doc = parseZ10Html(TOKEN_DOC);
      expect(doc.tokens.semantic.size).toBe(2);
      expect(getToken(doc, '--primary')?.value).toBe('var(--blue-500)');
    });

    it('sets correct collection on tokens', () => {
      const doc = parseZ10Html(TOKEN_DOC);
      expect(getToken(doc, '--blue-500')?.collection).toBe('primitives');
      expect(getToken(doc, '--primary')?.collection).toBe('semantic');
    });
  });

  describe('Component Parsing', () => {
    const COMPONENT_DOC = `<html><head>
<script type="application/z10+json" data-z10-role="config">{"name":"T"}</script>
<script type="application/z10+json" data-z10-role="component">
{
  "name": "Button",
  "props": [
    {"name": "variant", "type": "enum", "options": ["primary", "secondary"], "default": "primary"},
    {"name": "label", "type": "string", "required": true}
  ],
  "variants": [
    {"name": "primary", "props": {"variant": "primary"}, "styles": {"background": "var(--primary)"}}
  ]
}
</script>
<style data-z10-component-styles="Button">
.btn { padding: 8px 16px; border-radius: 4px; }
</style>
<template data-z10-template="Button">
<button class="btn"><slot /></button>
</template>
</head><body></body></html>`;

    it('parses component metadata', () => {
      const doc = parseZ10Html(COMPONENT_DOC);
      const btn = getComponent(doc, 'Button');
      expect(btn).toBeDefined();
      expect(btn!.name).toBe('Button');
      expect(btn!.props.length).toBe(2);
      expect(btn!.props[0]!.name).toBe('variant');
      expect(btn!.props[0]!.type).toBe('enum');
    });

    it('parses component styles', () => {
      const doc = parseZ10Html(COMPONENT_DOC);
      const btn = getComponent(doc, 'Button');
      expect(btn!.styles).toContain('.btn');
      expect(btn!.styles).toContain('padding: 8px 16px');
    });

    it('parses component template', () => {
      const doc = parseZ10Html(COMPONENT_DOC);
      const btn = getComponent(doc, 'Button');
      expect(btn!.template).toContain('<button');
      expect(btn!.template).toContain('<slot />');
    });

    it('parses component variants', () => {
      const doc = parseZ10Html(COMPONENT_DOC);
      const btn = getComponent(doc, 'Button');
      expect(btn!.variants.length).toBe(1);
      expect(btn!.variants[0]!.name).toBe('primary');
    });
  });

  describe('Page & Node Parsing', () => {
    const PAGE_DOC = `<html><head>
<script type="application/z10+json" data-z10-role="config">{"name":"T"}</script>
</head>
<body>
<div data-z10-page="Dashboard" data-z10-mode="light" data-z10-id="dash_root">
  <header data-z10-id="header" data-z10-intent="layout" style="display: flex; padding: 16px">
    <span data-z10-id="logo" data-z10-editor="designer">Zero-10</span>
  </header>
  <main data-z10-id="content" data-z10-agent-editable="false">
    <div data-z10-id="card" data-z10-component="Card" data-z10-intent="content"></div>
  </main>
</div>
</body></html>`;

    it('parses page metadata', () => {
      const doc = parseZ10Html(PAGE_DOC);
      expect(doc.pages.length).toBe(1);
      const page = getPage(doc, 'Dashboard');
      expect(page).toBeDefined();
      expect(page!.mode).toBe('light');
      expect(page!.rootNodeId).toBe('dash_root');
    });

    it('creates root node for page', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const root = getNode(doc, 'dash_root');
      expect(root).toBeDefined();
      expect(root!.tag).toBe('div');
      expect(root!.parent).toBeNull();
    });

    it('parses child nodes with correct hierarchy', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const header = getNode(doc, 'header');
      expect(header).toBeDefined();
      expect(header!.tag).toBe('header');
      expect(header!.intent).toBe('layout');
      expect(header!.styles['display']).toBe('flex');
      expect(header!.styles['padding']).toBe('16px');
    });

    it('parses text content', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const logo = getNode(doc, 'logo');
      expect(logo).toBeDefined();
      expect(logo!.textContent).toBe('Zero-10');
    });

    it('parses editor attribution', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const logo = getNode(doc, 'logo');
      expect(logo!.editor).toBe('designer');
    });

    it('parses agent-editable flag', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const content = getNode(doc, 'content');
      expect(content!.agentEditable).toBe(false);
    });

    it('parses component references', () => {
      const doc = parseZ10Html(PAGE_DOC);
      const card = getNode(doc, 'card');
      expect(card!.componentName).toBe('Card');
    });
  });
});
