import { describe, it, expect, beforeEach } from 'vitest';
import {
  substituteTemplate,
  expandInstance,
  resolveProps,
  instantiateTemplates,
} from '../../src/runtime/template.js';
import { createDocument, addPage, addNode, createNode, setComponent } from '../../src/core/document.js';
import type { Z10Document, ComponentSchema } from '../../src/core/types.js';

describe('template', () => {
  let doc: Z10Document;

  const buttonSchema: ComponentSchema = {
    name: 'Button',
    props: [
      { name: 'label', type: 'string', default: 'Click me' },
      { name: 'variant', type: 'enum', options: ['primary', 'secondary'], default: 'primary' },
      { name: 'disabled', type: 'boolean', default: false },
    ],
    variants: [],
    styles: '.btn { padding: 8px 16px; }',
    template: '<button class="btn btn-{{variant}}" {{disabled}}>{{label}}</button>',
  };

  beforeEach(() => {
    doc = createDocument({ name: 'Test', version: '1.0', governance: 'full-edit', defaultMode: 'light' });
    addPage(doc, { name: 'Page 1', rootNodeId: 'root', mode: 'light' });
    const root = createNode({ id: 'root', tag: 'div', parent: null });
    addNode(doc, root);
    setComponent(doc, buttonSchema);
  });

  describe('substituteTemplate', () => {
    it('substitutes simple props', () => {
      const result = substituteTemplate(
        '<span>{{name}}</span>',
        { name: 'Hello' },
        'node_1',
      );
      expect(result).toBe('<span>Hello</span>');
    });

    it('substitutes multiple props', () => {
      const result = substituteTemplate(
        '<div class="{{cls}}">{{text}}</div>',
        { cls: 'my-class', text: 'Content' },
        'node_1',
      );
      expect(result).toBe('<div class="my-class">Content</div>');
    });

    it('handles faker: syntax in templates', () => {
      const result = substituteTemplate(
        '<span>{{faker:person.firstName}}</span>',
        {},
        'node_1',
      );
      // Should resolve to an actual name, not the faker path
      expect(result).not.toContain('faker:');
      expect(result).toMatch(/<span>\w+<\/span>/);
    });

    it('returns empty string for unresolved props', () => {
      const result = substituteTemplate(
        '<span>{{missing}}</span>',
        {},
        'node_1',
      );
      expect(result).toBe('<span></span>');
    });

    it('handles numeric and boolean props', () => {
      const result = substituteTemplate(
        '<span data-count="{{count}}" data-active="{{active}}">text</span>',
        { count: 42, active: true },
        'node_1',
      );
      expect(result).toContain('data-count="42"');
      expect(result).toContain('data-active="true"');
    });
  });

  describe('resolveProps', () => {
    it('returns defaults for empty instance props', () => {
      const result = resolveProps(buttonSchema, {});
      expect(result.label).toBe('Click me');
      expect(result.variant).toBe('primary');
      expect(result.disabled).toBe(false);
    });

    it('overrides defaults with instance props', () => {
      const result = resolveProps(buttonSchema, { label: 'Save', variant: 'secondary' });
      expect(result.label).toBe('Save');
      expect(result.variant).toBe('secondary');
      expect(result.disabled).toBe(false); // default preserved
    });
  });

  describe('expandInstance', () => {
    it('expands a component instance with template', () => {
      const node = createNode({
        id: 'btn1',
        tag: 'div',
        parent: 'root',
        componentName: 'Button',
        componentProps: { label: 'Submit', variant: 'primary' },
      });
      addNode(doc, node);

      const result = expandInstance(doc, node);
      expect(result).not.toBeNull();
      expect(result!.nodeId).toBe('btn1');
      expect(result!.componentName).toBe('Button');
      expect(result!.html).toContain('Submit');
      expect(result!.html).toContain('btn-primary');
    });

    it('uses defaults for missing props', () => {
      const node = createNode({
        id: 'btn2',
        tag: 'div',
        parent: 'root',
        componentName: 'Button',
        componentProps: {},
      });
      addNode(doc, node);

      const result = expandInstance(doc, node);
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Click me'); // default label
    });

    it('returns null for non-component nodes', () => {
      const node = createNode({ id: 'div1', tag: 'div', parent: 'root' });
      addNode(doc, node);
      expect(expandInstance(doc, node)).toBeNull();
    });

    it('returns null for unknown components', () => {
      const node = createNode({
        id: 'unknown1',
        tag: 'div',
        parent: 'root',
        componentName: 'Unknown',
      });
      addNode(doc, node);
      expect(expandInstance(doc, node)).toBeNull();
    });
  });

  describe('instantiateTemplates', () => {
    it('expands all component instances in document', () => {
      const btn1 = createNode({
        id: 'btn1', tag: 'div', parent: 'root',
        componentName: 'Button', componentProps: { label: 'Save' },
      });
      const btn2 = createNode({
        id: 'btn2', tag: 'div', parent: 'root',
        componentName: 'Button', componentProps: { label: 'Cancel', variant: 'secondary' },
      });
      addNode(doc, btn1);
      addNode(doc, btn2);

      const result = instantiateTemplates(doc);
      expect(result.expanded).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      // Verify expanded HTML stored on nodes
      const n1 = doc.nodes.get('btn1')!;
      expect(n1.attributes['data-z10-expanded']).toContain('Save');
      const n2 = doc.nodes.get('btn2')!;
      expect(n2.attributes['data-z10-expanded']).toContain('Cancel');
    });

    it('reports errors for missing components', () => {
      const node = createNode({
        id: 'card1', tag: 'div', parent: 'root',
        componentName: 'Card',
      });
      addNode(doc, node);

      const result = instantiateTemplates(doc);
      expect(result.expanded).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.reason).toContain('Card');
    });

    it('skips non-component nodes', () => {
      const div = createNode({ id: 'div1', tag: 'div', parent: 'root' });
      addNode(doc, div);

      const result = instantiateTemplates(doc);
      expect(result.expanded).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
