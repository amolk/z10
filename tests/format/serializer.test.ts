import { describe, it, expect, beforeEach } from 'vitest';
import { serializeZ10Html } from '../../src/format/serializer.js';
import { parseZ10Html } from '../../src/format/parser.js';
import {
  createDocument,
  createNode,
  addNode,
  addPage,
  setTokens,
  setComponent,
  resetIdCounter,
} from '../../src/core/document.js';
import type { Z10Document, ComponentSchema } from '../../src/core/types.js';

describe('Z10 HTML Serializer', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test Project', version: '1.0.0' });
    resetIdCounter();
  });

  describe('Config Serialization', () => {
    it('includes config in script block', () => {
      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-role="config"');
      expect(html).toContain('"name": "Test Project"');
      expect(html).toContain('"governance": "full-edit"');
    });

    it('includes project name in html tag', () => {
      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-project="Test Project"');
    });
  });

  describe('Token Serialization', () => {
    it('serializes primitive tokens as CSS custom properties', () => {
      setTokens(doc, 'primitives', {
        '--blue-500': '#3b82f6',
        '--spacing-md': '16px',
      });
      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-tokens="primitives"');
      expect(html).toContain('--blue-500: #3b82f6;');
      expect(html).toContain('--spacing-md: 16px;');
    });

    it('serializes semantic tokens separately', () => {
      setTokens(doc, 'semantic', { '--primary': 'var(--blue-500)' });
      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-tokens="semantic"');
      expect(html).toContain('--primary: var(--blue-500);');
    });

    it('omits empty token collections', () => {
      const html = serializeZ10Html(doc);
      expect(html).not.toContain('data-z10-tokens');
    });
  });

  describe('Component Serialization', () => {
    it('serializes component metadata, styles, and template', () => {
      const schema: ComponentSchema = {
        name: 'Button',
        tagName: 'z10-button',
        props: [{ name: 'variant', type: 'enum', options: ['primary'], default: 'primary' }],
        variants: [{ name: 'primary', props: { variant: 'primary' } }],
        styles: '.btn { padding: 8px; }',
        template: '<button class="btn"><slot /></button>',
        classBody: '',
      };
      setComponent(doc, schema);
      const html = serializeZ10Html(doc);

      // New Web Components format: 3 head blocks
      expect(html).toContain('data-z10-role="component-meta"');
      expect(html).toContain('data-z10-component="Button"');
      expect(html).toContain('.btn { padding: 8px; }');
      expect(html).toContain('id="z10-button-template"');
      expect(html).toContain('<button class="btn">');
    });
  });

  describe('Page & Node Serialization', () => {
    it('serializes page with root node', () => {
      const root = createNode({ id: 'dash_root', tag: 'div', parent: null, intent: 'layout' });
      addNode(doc, root);
      addPage(doc, { name: 'Dashboard', rootNodeId: 'dash_root', mode: 'light' });

      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-page="Dashboard"');
      expect(html).toContain('data-z10-mode="light"');
      expect(html).toContain('data-z10-id="dash_root"');
    });

    it('serializes nested nodes with styles', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const header = createNode({
        id: 'header', tag: 'header', parent: 'root',
        style: 'display: flex; padding: 16px',
        intent: 'layout',
      });
      addNode(doc, header);
      addPage(doc, { name: 'Page', rootNodeId: 'root', mode: 'light' });

      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-id="header"');
      expect(html).toContain('data-z10-intent="layout"');
      expect(html).toContain('display: flex');
    });

    it('serializes text content', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const text = createNode({
        id: 'title', tag: 'h1', parent: 'root', textContent: 'Hello World',
      });
      addNode(doc, text);
      addPage(doc, { name: 'Page', rootNodeId: 'root', mode: 'light' });

      const html = serializeZ10Html(doc);
      expect(html).toContain('Hello World');
    });

    it('serializes agent-editable=false', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const locked = createNode({
        id: 'locked', tag: 'div', parent: 'root', agentEditable: false,
      });
      addNode(doc, locked);
      addPage(doc, { name: 'Page', rootNodeId: 'root', mode: 'light' });

      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-agent-editable="false"');
    });

    it('serializes editor attribution', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const agentNode = createNode({
        id: 'agent-made', tag: 'div', parent: 'root', editor: 'agent',
      });
      addNode(doc, agentNode);
      addPage(doc, { name: 'Page', rootNodeId: 'root', mode: 'light' });

      const html = serializeZ10Html(doc);
      expect(html).toContain('data-z10-editor="agent"');
    });
  });

  describe('Round-trip: Parse → Serialize → Parse', () => {
    it('preserves config through round-trip', () => {
      const input = `<html data-z10-project="MyApp">
<head>
<script type="application/z10+json" data-z10-role="config">
{"name": "MyApp", "version": "2.0.0", "governance": "scoped-edit", "defaultMode": "dark"}
</script>
</head>
<body>
</body>
</html>`;

      const doc1 = parseZ10Html(input);
      const serialized = serializeZ10Html(doc1);
      const doc2 = parseZ10Html(serialized);

      expect(doc2.config.name).toBe('MyApp');
      expect(doc2.config.version).toBe('2.0.0');
      expect(doc2.config.governance).toBe('scoped-edit');
      expect(doc2.config.defaultMode).toBe('dark');
    });

    it('preserves tokens through round-trip', () => {
      setTokens(doc, 'primitives', { '--blue': '#3b82f6', '--red': '#ef4444' });
      setTokens(doc, 'semantic', { '--primary': 'var(--blue)' });

      const html = serializeZ10Html(doc);
      const doc2 = parseZ10Html(html);

      expect(doc2.tokens.primitives.size).toBe(2);
      expect(doc2.tokens.semantic.size).toBe(1);
      expect(doc2.tokens.primitives.get('--blue')?.value).toBe('#3b82f6');
      expect(doc2.tokens.semantic.get('--primary')?.value).toBe('var(--blue)');
    });
  });
});
