/**
 * A11. reconcileChildren(sandboxParent, liveParent, ts, idGenerator).
 * Match children by data-z10-id.
 * Existing: reorder/update in place.
 * New (no data-z10-id): clone from sandbox, assign fresh data-z10-id, set initial timestamps.
 * Missing (in live but not sandbox): remove.
 * §5.3
 */

import { assignNodeIds } from './node-ids.js';
import { setInitialTimestamps } from './timestamps.js';

/**
 * Reconcile children of liveParent to match sandboxParent.
 * Modifies liveParent's children in place.
 * Returns arrays of added and removed node IDs for write set building.
 */
export function reconcileChildren(
  sandboxParent: Element,
  liveParent: Element,
  ts: number,
  idGenerator: () => string,
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];

  // Build map of live children by data-z10-id
  const liveChildMap = new Map<string, Element>();
  for (let i = 0; i < liveParent.children.length; i++) {
    const child = liveParent.children[i] as Element;
    const nid = child.getAttribute('data-z10-id');
    if (nid) {
      liveChildMap.set(nid, child);
    }
  }

  // Build ordered list of sandbox children
  const sandboxChildren: Element[] = [];
  for (let i = 0; i < sandboxParent.children.length; i++) {
    sandboxChildren.push(sandboxParent.children[i] as Element);
  }

  // Track which live children are still referenced
  const referencedNids = new Set<string>();

  // Process sandbox children in order to build the target child list
  const targetChildren: Element[] = [];
  for (const sandboxChild of sandboxChildren) {
    const nid = sandboxChild.getAttribute('data-z10-id');

    if (nid && liveChildMap.has(nid)) {
      // Existing node — reuse from live DOM (will be reordered)
      referencedNids.add(nid);
      targetChildren.push(liveChildMap.get(nid)!);
    } else {
      // New node — clone from sandbox, assign IDs
      const cloned = sandboxChild.cloneNode(true) as Element;

      // Assign data-z10-id if missing
      if (!cloned.getAttribute('data-z10-id')) {
        const newId = idGenerator();
        cloned.setAttribute('data-z10-id', newId);
        setInitialTimestamps(cloned, ts);
        added.push(newId);
      }

      // Assign IDs to any descendants that lack them
      const descendants = cloned.querySelectorAll('*');
      for (let i = 0; i < descendants.length; i++) {
        const desc = descendants[i] as Element;
        if (!desc.getAttribute('data-z10-id')) {
          const descId = idGenerator();
          desc.setAttribute('data-z10-id', descId);
          setInitialTimestamps(desc, ts);
          added.push(descId);
        }
      }

      targetChildren.push(cloned);
    }
  }

  // Remove children not referenced by sandbox (missing = removed)
  for (const [nid, liveChild] of liveChildMap) {
    if (!referencedNids.has(nid)) {
      removed.push(nid);
      liveParent.removeChild(liveChild);
    }
  }

  // Reorder/insert children to match target order
  for (let i = 0; i < targetChildren.length; i++) {
    const target = targetChildren[i];
    const current = liveParent.children[i] as Element | undefined;

    if (current !== target) {
      // Insert target at position i
      if (current) {
        liveParent.insertBefore(target, current);
      } else {
        liveParent.appendChild(target);
      }
    }
  }

  return { added, removed };
}
