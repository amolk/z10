/**
 * A14. Patch serialization.
 * serializeMutationsToOps(records) → op array.
 * 5 op types: attr, style, text, add, remove.
 * Style attr changes decomposed into per-property style ops using A3 utilities.
 * Structural ops (add, remove) preserve MutationObserver ordering.
 * Patch envelope: {txId, timestamp, ops}.
 * §6.1–6.5
 */

import { parseStyleString, diffStyleProperties } from './styles.js';

// ── Op types ──

export interface AttrOp {
  op: 'attr';
  id: string;
  name: string;
  value: string | null;
}

export interface StyleOp {
  op: 'style';
  id: string;
  prop: string;
  value: string;
}

export interface TextOp {
  op: 'text';
  id: string;
  value: string;
}

export interface AddOp {
  op: 'add';
  parentId: string;
  html: string;
  before: string | null;
}

export interface RemoveOp {
  op: 'remove';
  id: string;
}

export type PatchOp = AttrOp | StyleOp | TextOp | AddOp | RemoveOp;

export interface PatchEnvelope {
  txId: number;
  timestamp: number;
  ops: PatchOp[];
}

// ── Serialization ──

/**
 * Convert MutationRecords (captured during commit on the live DOM) into patch ops.
 * §6.4: Ops ordered by mutation sequence. Timestamp attr changes appear as regular attr ops.
 */
export function serializeMutationsToOps(records: MutationRecord[]): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const record of records) {
    if (record.type === 'attributes') {
      const target = record.target as Element;
      const id = target.getAttribute('data-z10-id');
      if (!id) continue;

      const name = record.attributeName!;
      if (name === 'style') {
        // Decompose into individual style-property ops
        const oldStyle = parseStyleString(record.oldValue || '');
        const newStyle = parseStyleString(target.getAttribute('style') || '');
        for (const prop of diffStyleProperties(oldStyle, newStyle)) {
          ops.push({
            op: 'style',
            id,
            prop,
            value: (target as HTMLElement).style?.getPropertyValue?.(prop)
              || newStyle.get(prop)
              || '',
          });
        }
      } else {
        ops.push({
          op: 'attr',
          id,
          name,
          value: target.getAttribute(name),
        });
      }
    }

    if (record.type === 'childList') {
      const target = record.target as Element;
      const parentId = target.getAttribute?.('data-z10-id');
      if (!parentId) continue;

      // Process removals first (per mutation order)
      for (let i = 0; i < record.removedNodes.length; i++) {
        const removed = record.removedNodes[i] as Element;
        if (removed.nodeType === 1) {
          const removedId = removed.getAttribute('data-z10-id');
          if (removedId) {
            ops.push({ op: 'remove', id: removedId });
          }
        }
      }

      // Process additions
      for (let i = 0; i < record.addedNodes.length; i++) {
        const added = record.addedNodes[i] as Element;
        if (added.nodeType === 1) {
          // Determine the 'before' sibling
          const nextSibling = added.nextElementSibling;
          const before = nextSibling?.getAttribute?.('data-z10-id') || null;

          ops.push({
            op: 'add',
            parentId,
            html: (added as Element).outerHTML,
            before,
          });
        }
      }
    }

    if (record.type === 'characterData') {
      const parentEl = (record.target as Node).parentElement as Element | null;
      const id = parentEl?.getAttribute?.('data-z10-id');
      if (id) {
        ops.push({
          op: 'text',
          id,
          value: record.target.textContent || '',
        });
      }
    }
  }

  return ops;
}

/** Create a patch envelope from ops. */
export function createPatchEnvelope(txId: number, timestamp: number, ops: PatchOp[]): PatchEnvelope {
  return { txId, timestamp, ops };
}
