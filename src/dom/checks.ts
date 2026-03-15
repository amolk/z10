/**
 * A8. Illegal modification check.
 * Scan MutationRecords for any change to data-z10-id or data-z10-ts-* attributes.
 * Also checks structural integrity (page wrappers must not be destroyed).
 * Reject transaction if found.
 * §5.2 Step 7
 */

export interface IllegalModification {
  type: 'id-modified' | 'timestamp-modified' | 'page-structure-destroyed';
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
    } else if (attr === 'data-z10-page') {
      violations.push({
        type: 'page-structure-destroyed',
        nodeId: nid,
        attributeName: attr,
      });
    }
  }

  return violations;
}

/**
 * Check that page structure is preserved after sandbox execution.
 * If the original subtree had data-z10-page elements, the sandbox result must too.
 * Prevents agents from wiping out page wrappers via body.innerHTML or similar.
 */
export function checkPageStructureIntegrity(
  originalRoot: Element,
  sandboxRoot: Element,
): IllegalModification[] {
  const violations: IllegalModification[] = [];

  const originalPages = originalRoot.querySelectorAll('[data-z10-page]');
  if (originalPages.length === 0) return violations; // no pages to protect

  const sandboxPages = sandboxRoot.querySelectorAll('[data-z10-page]');
  if (sandboxPages.length === 0) {
    violations.push({
      type: 'page-structure-destroyed',
      nodeId: null,
      attributeName: 'data-z10-page',
    });
  }

  return violations;
}
