/**
 * Template instantiation for Z10 runtime.
 *
 * Expands component instances in a Z10Document by:
 * 1. Finding nodes with componentName set
 * 2. Looking up the component's template
 * 3. Substituting props into the template
 * 4. Storing the expanded HTML on the node
 *
 * The file renders without the runtime (progressive enhancement),
 * but instances don't expand until this runs.
 */

import type { Z10Document, Z10Node, ComponentSchema } from '../core/types.js';
import { resolveFaker } from './faker.js';

// ---------------------------------------------------------------------------
// Template variable substitution
// ---------------------------------------------------------------------------

/**
 * Substitute template variables like {{propName}} with actual values.
 * Also handles {{faker:path}} for inline faker references.
 */
export function substituteTemplate(
  template: string,
  props: Record<string, string | number | boolean>,
  nodeId: string,
  index: number = 0,
): string {
  return template.replace(/\{\{(\w[\w.]*(?::[\w.]+)?)\}\}/g, (_match, expr: string) => {
    // Handle {{faker:path}} syntax
    if (expr.startsWith('faker:')) {
      const fakerPath = expr.slice(6);
      return resolveFaker(fakerPath, nodeId, index);
    }

    // Handle {{propName}} — look up in props
    if (expr in props) {
      return String(props[expr]);
    }

    // Return empty string for unresolved
    return '';
  });
}

// ---------------------------------------------------------------------------
// Instance expansion
// ---------------------------------------------------------------------------

/** Result of expanding a single instance */
export interface ExpandedInstance {
  nodeId: string;
  componentName: string;
  html: string;
}

/**
 * Expand a single component instance node into its template HTML.
 * Returns null if the component has no template or doesn't exist.
 */
export function expandInstance(
  doc: Z10Document,
  node: Z10Node,
  index: number = 0,
): ExpandedInstance | null {
  if (!node.componentName) return null;

  const schema = doc.components.get(node.componentName);
  if (!schema || !schema.template) return null;

  // Merge default props with instance props
  const mergedProps = resolveProps(schema, node.componentProps || {});

  // Substitute into template
  const html = substituteTemplate(schema.template, mergedProps, node.id, index);

  return {
    nodeId: node.id,
    componentName: node.componentName,
    html,
  };
}

/**
 * Merge component schema defaults with instance-provided props.
 */
export function resolveProps(
  schema: ComponentSchema,
  instanceProps: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const merged: Record<string, string | number | boolean> = {};

  // Apply defaults from schema
  for (const prop of schema.props) {
    if (prop.default !== undefined) {
      merged[prop.name] = prop.default;
    }
  }

  // Override with instance props
  for (const [key, value] of Object.entries(instanceProps)) {
    merged[key] = value;
  }

  return merged;
}

/**
 * Resolve effective attributes for a component instance.
 * Priority: schema prop defaults → variant props → overrides
 *
 * Note: explicit instance attributes (componentProps) are intentionally not
 * included here — this function computes the "canonical" values for propagation.
 * During propagation, non-overridden props reset to these canonical values.
 */
export function resolveEffectiveAttributes(
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

// ---------------------------------------------------------------------------
// Document-wide instantiation
// ---------------------------------------------------------------------------

/** Result of instantiating all templates in a document */
export interface InstantiationResult {
  expanded: ExpandedInstance[];
  errors: Array<{ nodeId: string; componentName: string; reason: string }>;
}

/**
 * Expand all component instances in the document.
 * This is the main entry point for template instantiation.
 *
 * Walks all nodes, finds those with componentName, expands their templates,
 * and stores the expanded HTML in the node's attributes as `data-z10-expanded`.
 */
export function instantiateTemplates(doc: Z10Document): InstantiationResult {
  const result: InstantiationResult = {
    expanded: [],
    errors: [],
  };

  for (const [, node] of doc.nodes) {
    if (!node.componentName) continue;

    const schema = doc.components.get(node.componentName);
    if (!schema) {
      result.errors.push({
        nodeId: node.id,
        componentName: node.componentName,
        reason: `Component "${node.componentName}" not found in document`,
      });
      continue;
    }

    if (!schema.template) {
      result.errors.push({
        nodeId: node.id,
        componentName: node.componentName,
        reason: `Component "${node.componentName}" has no template`,
      });
      continue;
    }

    const expanded = expandInstance(doc, node);
    if (expanded) {
      // Store expanded HTML on the node for rendering
      node.attributes['data-z10-expanded'] = expanded.html;
      result.expanded.push(expanded);
    }
  }

  return result;
}
