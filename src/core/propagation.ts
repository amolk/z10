/**
 * Component propagation engine.
 * When a main component definition changes, propagate updates to all instances.
 * Non-overridden attributes reset to new defaults.
 */

import type { Z10Document, Z10Node, ComponentSchema, NodeId } from './types.js';
import { toTagName } from './types.js';
import { resolveEffectiveAttributes } from '../runtime/template.js';

/**
 * Propagate component changes to all instances.
 * For each instance of the named component:
 * 1. Resolve effective attributes (variant + overrides)
 * 2. Update non-overridden attributes to new schema defaults
 * 3. Overridden attributes are preserved
 * Returns the list of updated instance node IDs.
 */
export function propagateToInstances(
  doc: Z10Document,
  componentName: string,
): NodeId[] {
  const schema = doc.components.get(componentName);
  if (!schema) return [];

  const tagName = schema.tagName || toTagName(componentName);
  const updated: NodeId[] = [];

  for (const [, node] of doc.nodes) {
    // Match instances by tag name
    if (node.tag !== tagName) continue;

    const overrides = node.componentOverrides ?? {};
    const variant = node.componentVariant;
    const effective = resolveEffectiveAttributes(schema, variant, overrides);

    // Update componentProps for non-overridden props
    if (!node.componentProps) node.componentProps = {};
    for (const prop of schema.props) {
      // Skip if this prop is overridden
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
