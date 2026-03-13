/**
 * A8. Illegal modification check.
 * Scan MutationRecords for any change to data-z10-id or data-z10-ts-* attributes.
 * Reject transaction if found.
 * §5.2 Step 7
 */

export interface IllegalModification {
  type: 'id-modified' | 'timestamp-modified';
  nodeId: string | null;
  attributeName: string;
}

/**
 * Check MutationRecords for illegal modifications to system attributes.
 * Returns array of violations. Empty array = no violations.
 */
export function checkIllegalModifications(records: MutationRecord[]): IllegalModification[] {
  const violations: IllegalModification[] = [];

  for (const record of records) {
    if (record.type !== 'attributes') continue;

    const attr = record.attributeName!;
    const target = record.target as Element;
    const nid = target.getAttribute?.('data-z10-id') || null;

    if (attr === 'data-z10-id') {
      violations.push({
        type: 'id-modified',
        nodeId: nid,
        attributeName: attr,
      });
    } else if (attr.startsWith('data-z10-ts-')) {
      violations.push({
        type: 'timestamp-modified',
        nodeId: nid,
        attributeName: attr,
      });
    }
  }

  return violations;
}
