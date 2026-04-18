/**
 * A17. Metadata stripping.
 * stripForAgent(root) — clone, remove data-z10-ts-*, retain data-z10-id.
 * stripForExport(root) — clone, remove both data-z10-id and data-z10-ts-*.
 * Both run on clones, never on live DOM.
 * §8.3, §11
 */

/**
 * Strip for agent consumption: remove timestamps, keep node IDs.
 * Returns a deep clone with data-z10-ts-* removed but data-z10-id retained.
 */
export function stripForAgent(root: Element): Element {
  const clone = root.cloneNode(true) as Element;
  stripTimestamps(clone);
  return clone;
}

/**
 * Strip for export/publish: remove all z10 metadata.
 * Returns a deep clone with both data-z10-id and data-z10-ts-* removed.
 */
export function stripForExport(root: Element): Element {
  const clone = root.cloneNode(true) as Element;
  stripTimestamps(clone);
  stripNodeIds(clone);
  return clone;
}

/** Remove all data-z10-ts-* attributes from an element and its descendants. */
function stripTimestamps(el: Element): void {
  removeMatchingAttrs(el, isTimestampAttr);
  const descendants = el.querySelectorAll('*');
  for (let i = 0; i < descendants.length; i++) {
    removeMatchingAttrs(descendants[i] as Element, isTimestampAttr);
  }
}

/** Remove data-z10-id from an element and its descendants. */
function stripNodeIds(el: Element): void {
  el.removeAttribute('data-z10-id');
  const descendants = el.querySelectorAll('[data-z10-id]');
  for (let i = 0; i < descendants.length; i++) {
    (descendants[i] as Element).removeAttribute('data-z10-id');
  }
}

/** Remove attributes matching a predicate from an element. */
function removeMatchingAttrs(el: Element, predicate: (name: string) => boolean): void {
  const toRemove: string[] = [];
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    if (predicate(attrs[i]!.name)) {
      toRemove.push(attrs[i]!.name);
    }
  }
  for (const name of toRemove) {
    el.removeAttribute(name);
  }
}

function isTimestampAttr(name: string): boolean {
  return name.startsWith('data-z10-ts-');
}
