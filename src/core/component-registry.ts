/**
 * ComponentRegistry — single owner for all component logic.
 *
 * Consolidates registration, validation, prop resolution, instance discovery,
 * propagation, template expansion, predicates, and detachment that were
 * previously scattered across core/document.ts, core/propagation.ts,
 * and runtime/template.ts.
 *
 * Fixes the layer violation where core/propagation.ts imported from
 * runtime/template.ts.
 */

import type {
  Z10Document,
  Z10Node,
  ComponentSchema,
  NodeId,
} from './types.js';
import { toTagName } from './types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Result of resolving a single component instance */
export interface ResolvedInstance {
  node: Z10Node;
  schema: ComponentSchema;
  props: Record<string, string | number | boolean>;
  html: string;
}

/** Result of registering (or re-registering) a component */
export interface RegistrationResult {
  schema: ComponentSchema;
  updatedInstances: NodeId[];
}

/** Error encountered during expandAll */
export interface ExpansionError {
  nodeId: string;
  componentName: string;
  reason: string;
}

/** Substitution function signature injected via constructor */
export type SubstituteFn = (
  template: string,
  props: Record<string, string | number | boolean>,
  nodeId: string,
  index?: number,
) => string;

// ---------------------------------------------------------------------------
// Default (built-in) substitution — simple {{propName}} replacer
// ---------------------------------------------------------------------------

function defaultSubstitute(
  template: string,
  props: Record<string, string | number | boolean>,
  _nodeId: string,
  _index?: number,
): string {
  return template.replace(/\{\{(\w[\w.]*)\}\}/g, (_match, expr: string) => {
    if (expr in props) return String(props[expr]);
    return '';
  });
}

// ---------------------------------------------------------------------------
// ComponentRegistry
// ---------------------------------------------------------------------------

export class ComponentRegistry {
  private readonly doc: Z10Document;
  private readonly substitute: SubstituteFn;

  constructor(doc: Z10Document, options?: { substitute?: SubstituteFn }) {
    this.doc = doc;
    this.substitute = options?.substitute ?? defaultSubstitute;
  }

  // -----------------------------------------------------------------------
  // Star method — most common operation
  // -----------------------------------------------------------------------

  /**
   * Resolve a node into its full component instance representation.
   * Returns null if the node is not a component instance or the component
   * doesn't exist / has no template.
   */
  resolve(node: Z10Node, index?: number): ResolvedInstance | null {
    if (!node.componentName) return null;

    const schema = this.doc.components.get(node.componentName);
    if (!schema || !schema.template) return null;

    const props = this.resolveProps(schema, undefined, node.componentProps);
    const html = this.substitute(schema.template, props, node.id, index);

    return { node, schema, props, html };
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Validate and register a ComponentSchema.
   * Auto-generates tagName/classBody if missing.
   * Auto-propagates to existing instances.
   * Throws on invalid PascalCase name.
   */
  register(schema: ComponentSchema): RegistrationResult {
    if (!schema.name || !/^[A-Z][A-Za-z0-9]*$/.test(schema.name)) {
      throw new Error(
        `Invalid component name "${schema.name}". Must be PascalCase starting with an uppercase letter (e.g. "MetricCard").`,
      );
    }

    const resolved: ComponentSchema = {
      ...schema,
      tagName: schema.tagName || toTagName(schema.name),
      classBody: schema.classBody ?? '',
    };

    this.doc.components.set(resolved.name, resolved);
    const updatedInstances = this.propagate(resolved.name);

    return { schema: resolved, updatedInstances };
  }

  /** Remove a component schema by name. Returns true if it existed. */
  unregister(name: string): boolean {
    return this.doc.components.delete(name);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /** Get a component schema by name. */
  get(name: string): ComponentSchema | undefined {
    return this.doc.components.get(name);
  }

  /** Return all registered schemas. */
  schemas(): ComponentSchema[] {
    return Array.from(this.doc.components.values());
  }

  /** Return all instance nodes of a named component. */
  instances(name: string): Z10Node[] {
    const schema = this.doc.components.get(name);
    if (!schema) return [];
    const tag = schema.tagName;
    const result: Z10Node[] = [];
    for (const [, node] of this.doc.nodes) {
      if (node.tag === tag) result.push(node);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Low-level
  // -----------------------------------------------------------------------

  /**
   * Resolve effective props for a component.
   * Priority: schema defaults → variant props → overrides.
   *
   * When called with only schema + variant + overrides, computes canonical
   * values for propagation. When called with instanceProps as overrides,
   * computes the merged props for rendering.
   */
  resolveProps(
    schema: ComponentSchema,
    variant?: string,
    overrides?: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};

    // 1. Schema prop defaults
    for (const prop of schema.props) {
      if (prop.default !== undefined) {
        result[prop.name] = prop.default;
      }
    }

    // 2. Variant props (if variant specified)
    if (variant) {
      const variantDef = schema.variants.find(v => v.name === variant);
      if (variantDef) {
        for (const [key, value] of Object.entries(variantDef.props)) {
          result[key] = value;
        }
      }
    }

    // 3. Overrides (highest priority)
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Propagate component changes to all instances.
   * Non-overridden attributes reset to new schema defaults.
   * Returns list of updated instance node IDs.
   */
  propagate(name: string): NodeId[] {
    const schema = this.doc.components.get(name);
    if (!schema) return [];

    const tagName = schema.tagName || toTagName(name);
    const updated: NodeId[] = [];

    for (const [, node] of this.doc.nodes) {
      if (node.tag !== tagName) continue;

      const overrides = node.componentOverrides ?? {};
      const variant = node.componentVariant;
      const effective = this.resolveProps(schema, variant, overrides);

      if (!node.componentProps) node.componentProps = {};
      for (const prop of schema.props) {
        if (prop.name in overrides) continue;
        const val = effective[prop.name];
        if (val !== undefined) {
          node.componentProps[prop.name] = val;
        }
      }

      updated.push(node.id);
    }

    return updated;
  }

  /**
   * Expand all component instances in the document.
   * Stores expanded HTML in node attributes as `data-z10-expanded`.
   */
  expandAll(): { expanded: ResolvedInstance[]; errors: ExpansionError[] } {
    const expanded: ResolvedInstance[] = [];
    const errors: ExpansionError[] = [];

    for (const [, node] of this.doc.nodes) {
      if (!node.componentName) continue;

      const schema = this.doc.components.get(node.componentName);
      if (!schema) {
        errors.push({
          nodeId: node.id,
          componentName: node.componentName,
          reason: `Component "${node.componentName}" not found in document`,
        });
        continue;
      }

      if (!schema.template) {
        errors.push({
          nodeId: node.id,
          componentName: node.componentName,
          reason: `Component "${node.componentName}" has no template`,
        });
        continue;
      }

      const resolved = this.resolve(node);
      if (resolved) {
        node.attributes['data-z10-expanded'] = resolved.html;
        expanded.push(resolved);
      }
    }

    return { expanded, errors };
  }

  // -----------------------------------------------------------------------
  // Predicates & mutation
  // -----------------------------------------------------------------------

  /** Check if a node is a component instance (custom element tag). */
  isInstance(node: Z10Node): boolean {
    return node.tag.startsWith('z10-');
  }

  /** Check if a node is a main component definition. */
  isDefinition(node: Z10Node): boolean {
    return !!node.componentDef;
  }

  /**
   * Replace a custom element node with a plain <div>, preserving
   * attributes/styles but removing component association.
   */
  detach(nodeId: NodeId): Z10Node | undefined {
    const node = this.doc.nodes.get(nodeId);
    if (!node) return undefined;

    node.tag = 'div';
    node.componentName = undefined;
    node.componentProps = undefined;
    node.componentDef = undefined;
    node.componentOverrides = undefined;
    node.componentVariant = undefined;

    return node;
  }
}

// ---------------------------------------------------------------------------
// Pure string utility — exported standalone for callers who just need
// simple {{propName}} substitution without faker support.
// ---------------------------------------------------------------------------

export function substituteTemplate(
  template: string,
  props: Record<string, string | number | boolean>,
  nodeId: string,
  index?: number,
): string {
  return defaultSubstitute(template, props, nodeId, index);
}

// ---------------------------------------------------------------------------
// Standalone free functions — backward-compatible re-exports
// ---------------------------------------------------------------------------

/**
 * Resolve effective attributes for a component instance.
 * Priority: schema prop defaults → variant props → overrides.
 *
 * Standalone version for callers that don't have a registry instance.
 */
export function resolveEffectiveAttributes(
  schema: ComponentSchema,
  variant?: string,
  overrides?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const prop of schema.props) {
    if (prop.default !== undefined) {
      result[prop.name] = prop.default;
    }
  }

  if (variant) {
    const variantDef = schema.variants.find(v => v.name === variant);
    if (variantDef) {
      for (const [key, value] of Object.entries(variantDef.props)) {
        result[key] = value;
      }
    }
  }

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a node is a component instance (custom element tag).
 */
export function isComponentInstance(node: Z10Node): boolean {
  return node.tag.startsWith('z10-');
}

/**
 * Check if a node is a main component definition.
 */
export function isComponentDefinition(node: Z10Node): boolean {
  return !!node.componentDef;
}

/**
 * Propagate component changes to all instances.
 * Standalone version for callers that don't have a registry instance.
 */
export function propagateToInstances(
  doc: Z10Document,
  componentName: string,
): NodeId[] {
  const registry = new ComponentRegistry(doc);
  return registry.propagate(componentName);
}
