/**
 * Tests for component operations: registerComponent, unregisterComponent,
 * findInstances, detachInstance, propagateToInstances, resolveEffectiveAttributes,
 * generateClassBody, and naming helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  createDocument,
  createNode,
  addNode,
  registerComponent,
  unregisterComponent,
  findInstances,
  detachInstance,
} from '../../src/core/document.js';
import { ComponentRegistry } from '../../src/core/component-registry.js';
import { generateClassBody } from '../../src/runtime/web-components.js';
import {
  toTagName,
  toClassName,
  tagNameToComponentName,
  isZ10CustomElement,
} from '../../src/core/types.js';
import type { ComponentSchema } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Naming Helpers
// ---------------------------------------------------------------------------

describe('toTagName', () => {
  it('converts PascalCase to z10-kebab-case', () => {
    expect(toTagName('MetricCard')).toBe('z10-metric-card');
  });

  it('handles single word', () => {
    expect(toTagName('Button')).toBe('z10-button');
  });

  it('handles consecutive uppercase (acronyms)', () => {
    expect(toTagName('HTTPClient')).toBe('z10-http-client');
  });

  it('handles numbers', () => {
    expect(toTagName('Card2x')).toBe('z10-card2x');
  });
});

describe('toClassName', () => {
  it('prefixes with Z10', () => {
    expect(toClassName('MetricCard')).toBe('Z10MetricCard');
  });
});

describe('tagNameToComponentName', () => {
  it('converts z10-kebab to PascalCase', () => {
    expect(tagNameToComponentName('z10-metric-card')).toBe('MetricCard');
  });

  it('returns null for non-z10 tags', () => {
    expect(tagNameToComponentName('div')).toBe(null);
    expect(tagNameToComponentName('my-element')).toBe(null);
  });

  it('handles single segment after prefix', () => {
    expect(tagNameToComponentName('z10-button')).toBe('Button');
  });
});

describe('isZ10CustomElement', () => {
  it('returns true for z10- prefixed tags', () => {
    expect(isZ10CustomElement('z10-metric-card')).toBe(true);
    expect(isZ10CustomElement('z10-button')).toBe(true);
  });

  it('returns false for non-z10 tags', () => {
    expect(isZ10CustomElement('div')).toBe(false);
    expect(isZ10CustomElement('my-element')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerComponent / unregisterComponent
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
    template: '<div class="card"><span class="label"></span></div>',
    styles: '.card { padding: 8px; }',
    classBody: '',
    ...overrides,
  };
}

describe('registerComponent', () => {
  it('stores schema in doc.components', () => {
    const doc = createDocument();
    const schema = makeSchema();
    registerComponent(doc, schema);
    expect(doc.components.has('TestCard')).toBe(true);
    expect(doc.components.get('TestCard')?.tagName).toBe('z10-test-card');
  });

  it('auto-generates tagName if missing', () => {
    const doc = createDocument();
    const schema = makeSchema({ tagName: '' });
    registerComponent(doc, schema);
    expect(doc.components.get('TestCard')?.tagName).toBe('z10-test-card');
  });

  it('throws on invalid name (lowercase start)', () => {
    const doc = createDocument();
    expect(() => registerComponent(doc, makeSchema({ name: 'testCard' }))).toThrow('Invalid component name');
  });

  it('throws on empty name', () => {
    const doc = createDocument();
    expect(() => registerComponent(doc, makeSchema({ name: '' }))).toThrow('Invalid component name');
  });

  it('throws on name with spaces', () => {
    const doc = createDocument();
    expect(() => registerComponent(doc, makeSchema({ name: 'Test Card' }))).toThrow('Invalid component name');
  });
});

describe('unregisterComponent', () => {
  it('removes a registered component', () => {
    const doc = createDocument();
    registerComponent(doc, makeSchema());
    expect(unregisterComponent(doc, 'TestCard')).toBe(true);
    expect(doc.components.has('TestCard')).toBe(false);
  });

  it('returns false for non-existent component', () => {
    const doc = createDocument();
    expect(unregisterComponent(doc, 'Nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findInstances / detachInstance
// ---------------------------------------------------------------------------

describe('findInstances', () => {
  it('finds nodes matching the component tag', () => {
    const doc = createDocument();
    registerComponent(doc, makeSchema());

    const instance = createNode({ id: 'i1', tag: 'z10-test-card', parent: null });
    addNode(doc, instance);
    const instance2 = createNode({ id: 'i2', tag: 'z10-test-card', parent: null });
    addNode(doc, instance2);
    const nonInstance = createNode({ id: 'n1', tag: 'div', parent: null });
    addNode(doc, nonInstance);

    const found = findInstances(doc, 'TestCard');
    expect(found).toHaveLength(2);
    expect(found.map(n => n.id).sort()).toEqual(['i1', 'i2']);
  });

  it('returns empty for unknown component', () => {
    const doc = createDocument();
    expect(findInstances(doc, 'Unknown')).toHaveLength(0);
  });
});

describe('detachInstance', () => {
  it('converts custom element to div', () => {
    const doc = createDocument();
    const node = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentDef: 'TestCard',
      componentOverrides: { label: 'Custom' },
      componentVariant: 'active',
    });
    addNode(doc, node);

    const detached = detachInstance(doc, 'i1');
    expect(detached?.tag).toBe('div');
    expect(detached?.componentDef).toBeUndefined();
    expect(detached?.componentOverrides).toBeUndefined();
    expect(detached?.componentVariant).toBeUndefined();
  });

  it('returns undefined for non-existent node', () => {
    const doc = createDocument();
    expect(detachInstance(doc, 'nope')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ComponentRegistry.resolveProps (was resolveEffectiveAttributes)
// ---------------------------------------------------------------------------

describe('ComponentRegistry.resolveProps', () => {
  const schema = makeSchema();

  it('returns defaults when no variant or overrides', () => {
    const doc = createDocument();
    registerComponent(doc, schema);
    const registry = new ComponentRegistry(doc);
    const result = registry.resolveProps(schema);
    expect(result).toEqual({ label: 'Default', active: false });
  });

  it('applies variant props over defaults', () => {
    const doc = createDocument();
    registerComponent(doc, schema);
    const registry = new ComponentRegistry(doc);
    const result = registry.resolveProps(schema, 'active');
    expect(result).toEqual({ label: 'Active', active: true });
  });

  it('applies overrides over variant', () => {
    const doc = createDocument();
    registerComponent(doc, schema);
    const registry = new ComponentRegistry(doc);
    const result = registry.resolveProps(schema, 'active', { label: 'Custom' });
    expect(result).toEqual({ label: 'Custom', active: true });
  });

  it('applies overrides over defaults (no variant)', () => {
    const doc = createDocument();
    registerComponent(doc, schema);
    const registry = new ComponentRegistry(doc);
    const result = registry.resolveProps(schema, undefined, { active: true });
    expect(result).toEqual({ label: 'Default', active: true });
  });

  it('ignores unknown variant names', () => {
    const doc = createDocument();
    registerComponent(doc, schema);
    const registry = new ComponentRegistry(doc);
    const result = registry.resolveProps(schema, 'nonexistent');
    expect(result).toEqual({ label: 'Default', active: false });
  });
});

// ---------------------------------------------------------------------------
// ComponentRegistry.propagate (was propagateToInstances)
// ---------------------------------------------------------------------------

describe('ComponentRegistry.propagate', () => {
  it('updates non-overridden props on instances', () => {
    const doc = createDocument();
    registerComponent(doc, makeSchema());
    const registry = new ComponentRegistry(doc);

    const instance = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentOverrides: { label: 'MyOverride' },
    });
    addNode(doc, instance);

    const updated = registry.propagate('TestCard');
    expect(updated).toEqual(['i1']);

    // 'label' is overridden — should not be changed
    // 'active' is not overridden — should get the default
    const node = doc.nodes.get('i1')!;
    expect(node.componentProps?.active).toBe(false);
    // label should not have been written to componentProps since it's overridden
    expect(node.componentProps?.label).toBeUndefined();
  });

  it('applies variant + non-overridden props', () => {
    const doc = createDocument();
    registerComponent(doc, makeSchema());
    const registry = new ComponentRegistry(doc);

    const instance = createNode({
      id: 'i1',
      tag: 'z10-test-card',
      parent: null,
      componentVariant: 'active',
      componentOverrides: { label: 'Kept' },
    });
    addNode(doc, instance);

    registry.propagate('TestCard');
    const node = doc.nodes.get('i1')!;
    // active is from variant (true), not overridden → should be set
    expect(node.componentProps?.active).toBe(true);
    // label is overridden → should not be touched
    expect(node.componentProps?.label).toBeUndefined();
  });

  it('returns empty for unknown component', () => {
    const doc = createDocument();
    const registry = new ComponentRegistry(doc);
    expect(registry.propagate('Unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateClassBody
// ---------------------------------------------------------------------------

describe('generateClassBody', () => {
  it('generates valid class with observedAttributes', () => {
    const schema = makeSchema();
    const body = generateClassBody(schema);
    expect(body).toContain("class Z10TestCard extends HTMLElement");
    expect(body).toContain("static observedAttributes = ['label', 'active']");
    expect(body).toContain("customElements.define('z10-test-card', Z10TestCard)");
  });

  it('uses hasAttribute for boolean props', () => {
    const schema = makeSchema();
    const body = generateClassBody(schema);
    expect(body).toContain("this.hasAttribute('active')");
  });

  it('uses getAttribute for string props', () => {
    const schema = makeSchema();
    const body = generateClassBody(schema);
    expect(body).toContain("this.getAttribute('label')");
  });

  it('includes attachShadow and template cloning', () => {
    const schema = makeSchema();
    const body = generateClassBody(schema);
    expect(body).toContain("this.attachShadow({ mode: 'open' })");
    expect(body).toContain("document.getElementById('z10-test-card-template')");
  });
});
