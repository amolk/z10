/**
 * Boundary tests for ComponentRegistry.
 * All component logic is tested through the registry interface.
 */

import { describe, it, expect } from 'vitest';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { createDocument, createNode, addNode } from '../../src/core/document.js';
import type { ComponentSchema, Z10Document } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchema(overrides: Partial<ComponentSchema> = {}): ComponentSchema {
  return {
    name: 'TestCard',
    tagName: 'z10-test-card',
    props: [
      { name: 'label', type: 'string', default: 'Default' },
      { name: 'active', type: 'boolean', default: false },
    ],
    variants: [
      { name: 'active', props: { label: 'Active', active: true } },
    ],
    template: '<div class="card"><span>{{label}}</span></div>',
    styles: '.card { padding: 8px; }',
    classBody: '',
    ...overrides,
  };
}

function makeDocWithComponent(): { doc: Z10Document; registry: ComponentRegistry } {
  const doc = createDocument();
  const registry = new ComponentRegistry(doc);
  registry.register(makeSchema());
  return { doc, registry };
}

// ---------------------------------------------------------------------------
// register / unregister
// ---------------------------------------------------------------------------

describe('ComponentRegistry.register', () => {
  it('stores schema in doc.components', () => {
    const { doc } = makeDocWithComponent();
    expect(doc.components.has('TestCard')).toBe(true);
    expect(doc.components.get('TestCard')?.tagName).toBe('z10-test-card');
  });

  it('auto-generates tagName if missing', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    registry.register(makeSchema({ tagName: '' }));
    expect(doc.components.get('TestCard')?.tagName).toBe('z10-test-card');
  });

  it('returns RegistrationResult with schema and updatedInstances', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    addNode(doc, createNode({ id: 'i1', tag: 'z10-test-card', parent: null }));
    const result = registry.register(makeSchema());
    expect(result.schema.name).toBe('TestCard');
    expect(result.updatedInstances).toEqual(['i1']);
  });

  it('throws on invalid name (lowercase start)', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    expect(() => registry.register(makeSchema({ name: 'testCard' }))).toThrow('Invalid component name');
  });

  it('throws on empty name', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    expect(() => registry.register(makeSchema({ name: '' }))).toThrow('Invalid component name');
  });
});

describe('ComponentRegistry.unregister', () => {
  it('removes a registered component', () => {
    const { doc, registry } = makeDocWithComponent();
    expect(registry.unregister('TestCard')).toBe(true);
    expect(doc.components.has('TestCard')).toBe(false);
  });

  it('returns false for non-existent component', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    expect(registry.unregister('Nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get / schemas
// ---------------------------------------------------------------------------

describe('ComponentRegistry.get', () => {
  it('returns schema by name', () => {
    const { registry } = makeDocWithComponent();
    expect(registry.get('TestCard')?.name).toBe('TestCard');
  });

  it('returns undefined for unknown name', () => {
    const { registry } = makeDocWithComponent();
    expect(registry.get('Unknown')).toBeUndefined();
  });
});

describe('ComponentRegistry.schemas', () => {
  it('returns all registered schemas', () => {
    const { registry } = makeDocWithComponent();
    registry.register(makeSchema({ name: 'Another', tagName: 'z10-another' }));
    const schemas = registry.schemas();
    expect(schemas).toHaveLength(2);
    expect(schemas.map(s => s.name).sort()).toEqual(['Another', 'TestCard']);
  });
});

// ---------------------------------------------------------------------------
// instances
// ---------------------------------------------------------------------------

describe('ComponentRegistry.instances', () => {
  it('finds nodes matching the component tag', () => {
    const { doc, registry } = makeDocWithComponent();
    addNode(doc, createNode({ id: 'i1', tag: 'z10-test-card', parent: null }));
    addNode(doc, createNode({ id: 'i2', tag: 'z10-test-card', parent: null }));
    addNode(doc, createNode({ id: 'n1', tag: 'div', parent: null }));

    const found = registry.instances('TestCard');
    expect(found).toHaveLength(2);
    expect(found.map(n => n.id).sort()).toEqual(['i1', 'i2']);
  });

  it('returns empty for unknown component', () => {
    const { registry } = makeDocWithComponent();
    expect(registry.instances('Unknown')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveProps
// ---------------------------------------------------------------------------

describe('ComponentRegistry.resolveProps', () => {
  it('returns defaults when no variant or overrides', () => {
    const { registry } = makeDocWithComponent();
    const schema = registry.get('TestCard')!;
    const result = registry.resolveProps(schema);
    expect(result).toEqual({ label: 'Default', active: false });
  });

  it('applies variant props over defaults', () => {
    const { registry } = makeDocWithComponent();
    const schema = registry.get('TestCard')!;
    const result = registry.resolveProps(schema, 'active');
    expect(result).toEqual({ label: 'Active', active: true });
  });

  it('applies overrides over variant', () => {
    const { registry } = makeDocWithComponent();
    const schema = registry.get('TestCard')!;
    const result = registry.resolveProps(schema, 'active', { label: 'Custom' });
    expect(result).toEqual({ label: 'Custom', active: true });
  });

  it('ignores unknown variant names', () => {
    const { registry } = makeDocWithComponent();
    const schema = registry.get('TestCard')!;
    const result = registry.resolveProps(schema, 'nonexistent');
    expect(result).toEqual({ label: 'Default', active: false });
  });
});

// ---------------------------------------------------------------------------
// propagate
// ---------------------------------------------------------------------------

describe('ComponentRegistry.propagate', () => {
  it('updates non-overridden props on instances', () => {
    const { doc, registry } = makeDocWithComponent();
    addNode(doc, createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentOverrides: { label: 'MyOverride' },
    }));

    const updated = registry.propagate('TestCard');
    expect(updated).toEqual(['i1']);

    const node = doc.nodes.get('i1')!;
    expect(node.componentProps?.active).toBe(false);
    expect(node.componentProps?.label).toBeUndefined();
  });

  it('applies variant + non-overridden props', () => {
    const { doc, registry } = makeDocWithComponent();
    addNode(doc, createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentVariant: 'active',
      componentOverrides: { label: 'Kept' },
    }));

    registry.propagate('TestCard');
    const node = doc.nodes.get('i1')!;
    expect(node.componentProps?.active).toBe(true);
    expect(node.componentProps?.label).toBeUndefined();
  });

  it('returns empty for unknown component', () => {
    const { registry } = makeDocWithComponent();
    expect(registry.propagate('Unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolve (star method)
// ---------------------------------------------------------------------------

describe('ComponentRegistry.resolve', () => {
  it('resolves a component instance to full representation', () => {
    const { doc, registry } = makeDocWithComponent();
    const node = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentName: 'TestCard',
      componentProps: { label: 'Hello' },
    });
    addNode(doc, node);

    const resolved = registry.resolve(node);
    expect(resolved).not.toBeNull();
    expect(resolved!.html).toContain('Hello');
    expect(resolved!.schema.name).toBe('TestCard');
    expect(resolved!.props.label).toBe('Hello');
  });

  it('returns null for non-component node', () => {
    const { doc, registry } = makeDocWithComponent();
    const node = createNode({ id: 'n1', tag: 'div', parent: null });
    addNode(doc, node);
    expect(registry.resolve(node)).toBeNull();
  });

  it('returns null when component has no template', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    registry.register(makeSchema({ template: '' }));
    const node = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentName: 'TestCard',
    });
    addNode(doc, node);
    expect(registry.resolve(node)).toBeNull();
  });

  it('uses custom substitute function when provided', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc, {
      substitute: (template, _props, _nodeId) => template.replace(/\{\{.*?\}\}/g, 'CUSTOM'),
    });
    registry.register(makeSchema());
    const node = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentName: 'TestCard',
    });
    addNode(doc, node);

    const resolved = registry.resolve(node);
    expect(resolved!.html).toContain('CUSTOM');
  });
});

// ---------------------------------------------------------------------------
// expandAll
// ---------------------------------------------------------------------------

describe('ComponentRegistry.expandAll', () => {
  it('expands all instances and stores data-z10-expanded', () => {
    const { doc, registry } = makeDocWithComponent();
    addNode(doc, createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentName: 'TestCard',
      componentProps: { label: 'A' },
    }));
    addNode(doc, createNode({
      id: 'i2',
      tag: 'z10-test-card',
      parent: null,
      componentName: 'TestCard',
      componentProps: { label: 'B' },
    }));

    const { expanded, errors } = registry.expandAll();
    expect(expanded).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(doc.nodes.get('i1')!.attributes['data-z10-expanded']).toContain('A');
    expect(doc.nodes.get('i2')!.attributes['data-z10-expanded']).toContain('B');
  });

  it('reports errors for missing components', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    addNode(doc, createNode({
      id: 'i1',
      tag: 'z10-missing',
      parent: null,
      componentName: 'Missing',
    }));

    const { expanded, errors } = registry.expandAll();
    expect(expanded).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// isInstance / isDefinition
// ---------------------------------------------------------------------------

describe('ComponentRegistry.isInstance', () => {
  it('returns true for z10-* tags', () => {
    const { registry } = makeDocWithComponent();
    const node = createNode({ id: 'i1', tag: 'z10-test-card', parent: null });
    expect(registry.isInstance(node)).toBe(true);
  });

  it('returns false for non-z10 tags', () => {
    const { registry } = makeDocWithComponent();
    const node = createNode({ id: 'n1', tag: 'div', parent: null });
    expect(registry.isInstance(node)).toBe(false);
  });
});

describe('ComponentRegistry.isDefinition', () => {
  it('returns true when componentDef is set', () => {
    const { registry } = makeDocWithComponent();
    const node = createNode({ id: 'n1', tag: 'z10-test-card', parent: null, componentDef: 'TestCard' });
    expect(registry.isDefinition(node)).toBe(true);
  });

  it('returns false when componentDef is not set', () => {
    const { registry } = makeDocWithComponent();
    const node = createNode({ id: 'n1', tag: 'z10-test-card', parent: null });
    expect(registry.isDefinition(node)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detach
// ---------------------------------------------------------------------------

describe('ComponentRegistry.detach', () => {
  it('converts custom element to div', () => {
    const { doc, registry } = makeDocWithComponent();
    addNode(doc, createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentDef: 'TestCard',
      componentOverrides: { label: 'Custom' },
      componentVariant: 'active',
    }));

    const detached = registry.detach('i1');
    expect(detached?.tag).toBe('div');
    expect(detached?.componentDef).toBeUndefined();
    expect(detached?.componentOverrides).toBeUndefined();
    expect(detached?.componentVariant).toBeUndefined();
  });

  it('returns undefined for non-existent node', () => {
    const { registry } = makeDocWithComponent();
    expect(registry.detach('nope')).toBeUndefined();
  });
});
