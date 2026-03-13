/**
 * A5. Write set builder.
 * buildWriteSet(mutationRecords) → array of WriteSetEntry.
 * Facets: structural, children, text, attribute, style-property.
 * Uses A3 style utilities for style attr decomposition. Deduplication.
 * §5.2 Step 8
 */

import { parseStyleString, diffStyleProperties } from './styles.js';
import type { WriteSetEntry } from './timestamps.js';

/**
 * Build a write set from MutationRecords captured during sandbox execution.
 * Each entry identifies a node + facet that was modified.
 */
export function buildWriteSet(records: MutationRecord[]): WriteSetEntry[] {
  const entries: WriteSetEntry[] = [];

  for (const record of records) {
    const target = record.target as Element;

    if (record.type === 'attributes') {
      const nid = target.getAttribute?.('data-z10-id');
      if (!nid) continue;

      const attr = record.attributeName!;
      if (attr === 'style') {
        // Decompose style changes into per-property entries
        const oldStyle = parseStyleString(record.oldValue || '');
        const newStyle = parseStyleString(target.getAttribute('style') || '');
        for (const prop of diffStyleProperties(oldStyle, newStyle)) {
          entries.push({ nid, facet: 'style-property', property: prop });
        }
      } else {
        entries.push({ nid, facet: 'attribute', attribute: attr });
      }
    }

    if (record.type === 'childList') {
      const nid = target.getAttribute?.('data-z10-id');
      if (nid) {
        entries.push({ nid, facet: 'children' });
      }

      // Removed element nodes get a structural facet entry
      for (let i = 0; i < record.removedNodes.length; i++) {
        const removed = record.removedNodes[i] as Element;
        if (removed.nodeType === 1) {
          const removedNid = removed.getAttribute?.('data-z10-id');
          if (removedNid) {
            entries.push({ nid: removedNid, facet: 'structural' });
          }
        }
      }
    }

    if (record.type === 'characterData') {
      const parentEl = (record.target as Node).parentElement as Element | null;
      const parentNid = parentEl?.getAttribute?.('data-z10-id');
      if (parentNid) {
        entries.push({ nid: parentNid, facet: 'text' });
      }
    }
  }

  return deduplicateWriteSet(entries);
}

/**
 * Remove duplicate write set entries.
 * Two entries are duplicates if they have the same nid + facet + property/attribute.
 */
function deduplicateWriteSet(entries: WriteSetEntry[]): WriteSetEntry[] {
  const seen = new Set<string>();
  const result: WriteSetEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.nid}:${entry.facet}:${entry.property || ''}:${entry.attribute || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  }

  return result;
}
