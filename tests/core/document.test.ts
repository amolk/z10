import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDocument,
  createNode,
  addNode,
  removeNode,
  moveNode,
  updateStyles,
  updateAttributes,
  setToken,
  setTokens,
  getToken,
  setComponent,
  getComponent,
  addPage,
  getPage,
  getNode,
  getChildren,
  getSubtree,
  canAgentEdit,
  parseInlineStyle,
  serializeStyle,
  resetIdCounter,
  generateNodeId,
} from '../../src/core/document.js';
import type { Z10Document, Z10Node, ComponentSchema } from '../../src/core/types.js';

describe('Document Model', () => {
  let doc: Z10Document;

  beforeEach(() => {
    doc = createDocument({ name: 'Test Project' });
    resetIdCounter();
  });

  describe('createDocument', () => {
    it('creates a document with default config', () => {
      const d = createDocument();
      expect(d.config.name).toBe('Untitled');
      expect(d.config.governance).toBe('full-edit');
      expect(d.config.defaultMode).toBe('light');
      expect(d.nodes.size).toBe(0);
      expect(d.pages.length).toBe(0);
    });

    it('applies partial config overrides', () => {
      expect(doc.config.name).toBe('Test Project');
      expect(doc.config.governance).toBe('full-edit');
    });
  });

  describe('Node Operations', () => {
    it('creates and adds a node', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null, intent: 'layout' });
      addNode(doc, root);
      expect(doc.nodes.size).toBe(1);
      expect(getNode(doc, 'root')).toBe(root);
    });

    it('links children to parent', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const child = createNode({ id: 'child', tag: 'span', parent: 'root' });
      addNode(doc, child);

      expect(root.children).toEqual(['child']);
      expect(child.parent).toBe('root');
    });

    it('removes a node and its descendants', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const child = createNode({ id: 'child', tag: 'div', parent: 'root' });
      addNode(doc, child);
      const grandchild = createNode({ id: 'grandchild', tag: 'span', parent: 'child' });
      addNode(doc, grandchild);

      const removed = removeNode(doc, 'child');
      expect(removed?.id).toBe('child');
      expect(doc.nodes.has('child')).toBe(false);
      expect(doc.nodes.has('grandchild')).toBe(false);
      expect(root.children).toEqual([]);
    });

    it('returns undefined when removing non-existent node', () => {
      expect(removeNode(doc, 'nope')).toBeUndefined();
    });

    it('moves a node to a new parent', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const a = createNode({ id: 'a', tag: 'div', parent: 'root' });
      addNode(doc, a);
      const b = createNode({ id: 'b', tag: 'div', parent: 'root' });
      addNode(doc, b);
      const child = createNode({ id: 'child', tag: 'span', parent: 'a' });
      addNode(doc, child);

      expect(moveNode(doc, 'child', 'b')).toBe(true);
      expect(a.children).toEqual([]);
      expect(b.children).toEqual(['child']);
      expect(child.parent).toBe('b');
    });

    it('moves a node to a specific index', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const a = createNode({ id: 'a', tag: 'div', parent: 'root' });
      addNode(doc, a);
      const b = createNode({ id: 'b', tag: 'div', parent: 'root' });
      addNode(doc, b);
      const c = createNode({ id: 'c', tag: 'div', parent: 'root' });
      addNode(doc, c);

      // Move 'c' to index 0 (before 'a' and 'b') — but 'c' is already in root,
      // so first it's removed, then inserted at index 0
      moveNode(doc, 'c', 'root', 0);
      expect(root.children).toEqual(['c', 'a', 'b']);
    });

    it('returns false when moving non-existent node', () => {
      expect(moveNode(doc, 'nope', 'also-nope')).toBe(false);
    });

    it('updates styles with merge semantics', () => {
      const node = createNode({ id: 'n', tag: 'div', parent: null, style: 'color: red; padding: 8px' });
      addNode(doc, node);

      updateStyles(doc, 'n', { color: 'blue', margin: '4px' });
      expect(node.styles['color']).toBe('blue');
      expect(node.styles['padding']).toBe('8px');
      expect(node.styles['margin']).toBe('4px');
    });

    it('returns false when updating styles on non-existent node', () => {
      expect(updateStyles(doc, 'nope', { color: 'red' })).toBe(false);
    });

    it('updates attributes', () => {
      const node = createNode({ id: 'n', tag: 'div', parent: null });
      addNode(doc, node);
      updateAttributes(doc, 'n', { 'data-role': 'banner', 'aria-label': 'Header' });
      expect(node.attributes['data-role']).toBe('banner');
      expect(node.attributes['aria-label']).toBe('Header');
    });
  });

  describe('Style Parsing', () => {
    it('parses inline style string', () => {
      const result = parseInlineStyle('color: red; padding: 8px; display: flex');
      expect(result).toEqual({ color: 'red', padding: '8px', display: 'flex' });
    });

    it('handles empty string', () => {
      expect(parseInlineStyle('')).toEqual({});
      expect(parseInlineStyle('   ')).toEqual({});
    });

    it('handles trailing semicolons', () => {
      expect(parseInlineStyle('color: red;')).toEqual({ color: 'red' });
    });

    it('serializes style map', () => {
      const result = serializeStyle({ color: 'red', padding: '8px' });
      expect(result).toBe('color: red; padding: 8px');
    });
  });

  describe('Token Operations', () => {
    it('sets and gets tokens', () => {
      setToken(doc, { name: '--blue-500', value: '#3b82f6', collection: 'primitives' });
      const token = getToken(doc, '--blue-500');
      expect(token?.value).toBe('#3b82f6');
    });

    it('sets multiple tokens at once', () => {
      setTokens(doc, 'semantic', { '--primary': 'var(--blue-500)', '--bg': '#fff' });
      expect(doc.tokens.semantic.size).toBe(2);
      expect(getToken(doc, '--primary')?.value).toBe('var(--blue-500)');
    });

    it('returns undefined for unknown token', () => {
      expect(getToken(doc, '--nope')).toBeUndefined();
    });
  });

  describe('Component Operations', () => {
    it('registers and retrieves a component', () => {
      const schema: ComponentSchema = {
        name: 'Button',
        props: [{ name: 'variant', type: 'enum', options: ['primary', 'secondary'], default: 'primary' }],
        variants: [{ name: 'primary', props: { variant: 'primary' } }],
        styles: '.btn { padding: 8px 16px; }',
        template: '<button class="btn"><slot /></button>',
      };
      setComponent(doc, schema);
      expect(getComponent(doc, 'Button')).toBe(schema);
      expect(getComponent(doc, 'Unknown')).toBeUndefined();
    });
  });

  describe('Page Operations', () => {
    it('adds and retrieves a page', () => {
      const root = createNode({ id: 'page-root', tag: 'div', parent: null });
      addNode(doc, root);
      addPage(doc, { name: 'Dashboard', rootNodeId: 'page-root', mode: 'light' });

      const page = getPage(doc, 'Dashboard');
      expect(page?.name).toBe('Dashboard');
      expect(page?.rootNodeId).toBe('page-root');
      expect(getPage(doc, 'Unknown')).toBeUndefined();
    });
  });

  describe('Query Operations', () => {
    it('gets children of a node', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const a = createNode({ id: 'a', tag: 'div', parent: 'root' });
      addNode(doc, a);
      const b = createNode({ id: 'b', tag: 'div', parent: 'root' });
      addNode(doc, b);

      const children = getChildren(doc, 'root');
      expect(children.length).toBe(2);
      expect(children.map(c => c.id)).toEqual(['a', 'b']);
    });

    it('returns empty array for non-existent node children', () => {
      expect(getChildren(doc, 'nope')).toEqual([]);
    });

    it('gets subtree depth-first', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const a = createNode({ id: 'a', tag: 'div', parent: 'root' });
      addNode(doc, a);
      const b = createNode({ id: 'b', tag: 'div', parent: 'a' });
      addNode(doc, b);

      const tree = getSubtree(doc, 'root');
      expect(tree.map(n => n.id)).toEqual(['root', 'a', 'b']);
    });

    it('respects maxDepth in subtree', () => {
      const root = createNode({ id: 'root', tag: 'div', parent: null });
      addNode(doc, root);
      const a = createNode({ id: 'a', tag: 'div', parent: 'root' });
      addNode(doc, a);
      const b = createNode({ id: 'b', tag: 'div', parent: 'a' });
      addNode(doc, b);

      const tree = getSubtree(doc, 'root', 1);
      expect(tree.map(n => n.id)).toEqual(['root', 'a']);
    });
  });

  describe('Agent Governance', () => {
    it('allows all edits in full-edit mode', () => {
      const node = createNode({ id: 'n', tag: 'div', parent: null, agentEditable: false });
      addNode(doc, node);
      expect(canAgentEdit(doc, 'n')).toBe(true);
    });

    it('respects agentEditable in scoped-edit mode', () => {
      doc.config.governance = 'scoped-edit';
      const editable = createNode({ id: 'e', tag: 'div', parent: null, agentEditable: true });
      const locked = createNode({ id: 'l', tag: 'div', parent: null, agentEditable: false });
      addNode(doc, editable);
      addNode(doc, locked);

      expect(canAgentEdit(doc, 'e')).toBe(true);
      expect(canAgentEdit(doc, 'l')).toBe(false);
    });
  });

  describe('ID Generation', () => {
    it('generates sequential IDs', () => {
      expect(generateNodeId('btn')).toBe('btn_1');
      expect(generateNodeId('btn')).toBe('btn_2');
    });
  });
});
