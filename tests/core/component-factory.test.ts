import { describe, it, expect, beforeEach } from 'vitest';
import { createRegistry, createSimpleRegistry, substituteTemplate } from '../../src/core/component-factory.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { createDocument, addPage, addNode, createNode, setComponent } from '../../src/core/document.js';
import type { Z10Document, ComponentSchema } from '../../src/core/types.js';

describe('component-factory', () => {
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

  describe('createRegistry', () => {
    it('returns a ComponentRegistry instance', () => {
      const registry = createRegistry(doc);
      expect(registry).toBeInstanceOf(ComponentRegistry);
    });

    it('resolves faker templates', () => {
      const registry = createRegistry(doc);
      const fakerSchema: ComponentSchema = {
        name: 'Card',
        props: [],
        variants: [],
        styles: '',
        template: '<div>{{faker:person.firstName}}</div>',
      };
      setComponent(doc, fakerSchema);
      const node = createNode({
        id: 'card1', tag: 'z10-card', parent: 'root',
        componentName: 'Card', componentProps: {},
      });
      addNode(doc, node);

      const resolved = registry.resolve(node);
      expect(resolved).not.toBeNull();
      expect(resolved!.html).not.toContain('faker:');
      expect(resolved!.html).toMatch(/<div>\w+<\/div>/);
    });
  });

  describe('createSimpleRegistry', () => {
    it('does not resolve faker templates', () => {
      const registry = createSimpleRegistry(doc);
      const fakerSchema: ComponentSchema = {
        name: 'Card',
        props: [],
        variants: [],
        styles: '',
        template: '<div>{{faker:person.firstName}}</div>',
      };
      setComponent(doc, fakerSchema);
      const node = createNode({
        id: 'card1', tag: 'z10-card', parent: 'root',
        componentName: 'Card', componentProps: {},
      });
      addNode(doc, node);

      const resolved = registry.resolve(node);
      expect(resolved).not.toBeNull();
      // Simple registry can't match {{faker:...}} (colon not in pattern) → template unchanged
      expect(resolved!.html).toBe('<div>{{faker:person.firstName}}</div>');
    });
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

  describe('registry.resolve (was expandInstance)', () => {
    it('expands a component instance with template', () => {
      const registry = createRegistry(doc);
      const node = createNode({
        id: 'btn1', tag: 'div', parent: 'root',
        componentName: 'Button',
        componentProps: { label: 'Submit', variant: 'primary' },
      });
      addNode(doc, node);

      const result = registry.resolve(node);
      expect(result).not.toBeNull();
      expect(result!.node.id).toBe('btn1');
      expect(result!.schema.name).toBe('Button');
      expect(result!.html).toContain('Submit');
      expect(result!.html).toContain('btn-primary');
    });

    it('uses defaults for missing props', () => {
      const registry = createRegistry(doc);
      const node = createNode({
        id: 'btn2', tag: 'div', parent: 'root',
        componentName: 'Button', componentProps: {},
      });
      addNode(doc, node);

      const result = registry.resolve(node);
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Click me');
    });

    it('returns null for non-component nodes', () => {
      const registry = createRegistry(doc);
      const node = createNode({ id: 'div1', tag: 'div', parent: 'root' });
      addNode(doc, node);
      expect(registry.resolve(node)).toBeNull();
    });

    it('returns null for unknown components', () => {
      const registry = createRegistry(doc);
      const node = createNode({
        id: 'unknown1', tag: 'div', parent: 'root',
        componentName: 'Unknown',
      });
      addNode(doc, node);
      expect(registry.resolve(node)).toBeNull();
    });
  });

  describe('registry.expandAll (was instantiateTemplates)', () => {
    it('expands all component instances in document', () => {
      const registry = createRegistry(doc);
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

      const result = registry.expandAll();
      expect(result.expanded).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const n1 = doc.nodes.get('btn1')!;
      expect(n1.attributes['data-z10-expanded']).toContain('Save');
      const n2 = doc.nodes.get('btn2')!;
      expect(n2.attributes['data-z10-expanded']).toContain('Cancel');
    });

    it('reports errors for missing components', () => {
      const registry = createRegistry(doc);
      const node = createNode({
        id: 'card1', tag: 'div', parent: 'root',
        componentName: 'Card',
      });
      addNode(doc, node);

      const result = registry.expandAll();
      expect(result.expanded).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.reason).toContain('Card');
    });

    it('skips non-component nodes', () => {
      const registry = createRegistry(doc);
      const div = createNode({ id: 'div1', tag: 'div', parent: 'root' });
      addNode(doc, div);

      const result = registry.expandAll();
      expect(result.expanded).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
