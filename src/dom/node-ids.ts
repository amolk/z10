/**
 * A12. Node ID assignment.
 * assignNodeIds(root, idGenerator): walk a subtree, assign data-z10-id to
 * elements that lack one, set initial data-z10-ts-* timestamps.
 * Called during commit for newly created nodes (A11) and during bootstrap (A4).
 * §2.2, §14.1
 */

import { setInitialTimestamps } from './timestamps.js';

/** Default ID generator using a monotonic counter with prefix. */
export function createIdGenerator(prefix: string = 'n', startAt: number = 1): () => string {
  let counter = startAt;
  return () => `${prefix}${counter++}`;
}

/**
 * Walk a subtree and assign data-z10-id to any element that lacks one.
 * Also sets initial data-z10-ts-* timestamps on newly assigned elements.
 * Returns the count of nodes that were assigned IDs.
 */
export function assignNodeIds(
  root: Element,
  idGenerator: () => string,
  clockValue: number,
): number {
  let assigned = 0;

  // Process root element itself
  if (!root.getAttribute('data-z10-id')) {
    root.setAttribute('data-z10-id', idGenerator());
    setInitialTimestamps(root, clockValue);
    assigned++;
  }

  // Walk all descendant elements
  const walker = root.querySelectorAll('*');
  for (let i = 0; i < walker.length; i++) {
    const el = walker[i] as Element;
    if (!el.getAttribute('data-z10-id')) {
      el.setAttribute('data-z10-id', idGenerator());
      setInitialTimestamps(el, clockValue);
      assigned++;
    }
  }

  return assigned;
}
