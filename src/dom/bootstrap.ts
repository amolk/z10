/**
 * A4. Document bootstrapping.
 * bootstrapDocument(root, clock): walk all elements in a DOM tree,
 * assign data-z10-id to any element that lacks one, set initial
 * data-z10-ts-* attributes (all to clock value), bubble data-z10-ts-tree.
 * Called once when loading an existing document into the collaborative system.
 * §2.2
 */

import { LamportClock } from './clock.js';
import { assignNodeIds, createIdGenerator } from './node-ids.js';
import { bubbleTimestamp, getTimestamp, TS_TREE } from './timestamps.js';

export interface BootstrapOptions {
  /** Prefix for generated node IDs. Default: 'n' */
  idPrefix?: string;
  /** Starting counter for ID generation. Default: 1 */
  idStartAt?: number;
}

/**
 * Bootstrap an existing DOM tree for collaborative editing.
 * Assigns data-z10-id and initial timestamps to all elements.
 * Returns the number of nodes that were assigned new IDs.
 */
export function bootstrapDocument(
  root: Element,
  clock: LamportClock,
  options: BootstrapOptions = {},
): number {
  const { idPrefix = 'n', idStartAt = 1 } = options;
  const ts = clock.tick();
  const idGen = createIdGenerator(idPrefix, idStartAt);

  const assigned = assignNodeIds(root, idGen, ts);

  // Bubble tree timestamps from leaf nodes up
  // Walk in reverse document order (deepest first) to ensure correct bubble-up
  const allElements = root.querySelectorAll('*');
  for (let i = allElements.length - 1; i >= 0; i--) {
    const el = allElements[i] as Element;
    const treeTs = getTimestamp(el, TS_TREE);
    if (treeTs > 0) {
      bubbleTimestamp(el, treeTs);
    }
  }

  // Bubble from root itself
  const rootTreeTs = getTimestamp(root, TS_TREE);
  if (rootTreeTs > 0) {
    bubbleTimestamp(root, rootTreeTs);
  }

  return assigned;
}
