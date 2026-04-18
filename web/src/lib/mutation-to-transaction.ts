/**
 * Converts DOM MutationRecords into transaction JS code for the canonical DOM.
 *
 * Used by useMutationBridge to send keyboard shortcut edits (delete, duplicate,
 * paste, group, reorder) to the server via POST /transact.
 *
 * Style attribute changes are SKIPPED — the edit bridge handles those via
 * generateStyleCode to avoid double-sending.
 */

/**
 * Convert an array of MutationRecords to a single transaction code string.
 * Returns null if no actionable mutations are found.
 */
export function mutationRecordsToTransaction(records: MutationRecord[]): string | null {
  const statements: string[] = [];

  for (const rec of records) {
    if (rec.type === "childList") {
      // Handle removed nodes
      for (let i = 0; i < rec.removedNodes.length; i++) {
        const node = rec.removedNodes[i] as HTMLElement;
        if (node.nodeType !== 1) continue; // skip text nodes
        const nid = node.getAttribute?.("data-z10-id");
        if (!nid) continue;
        statements.push(
          `{ const el = document.querySelector('[data-z10-id="${escapeStr(nid)}"]'); if (el) el.remove(); }`
        );
      }

      // Handle added nodes
      for (let i = 0; i < rec.addedNodes.length; i++) {
        const node = rec.addedNodes[i] as HTMLElement;
        if (node.nodeType !== 1) continue;
        const nid = node.getAttribute?.("data-z10-id");
        if (!nid) continue;

        const parentNid = getParentNid(rec.target as HTMLElement);
        if (!parentNid) continue;

        // Determine insertion position
        const nextSibling = node.nextElementSibling;
        const nextNid = nextSibling?.getAttribute?.("data-z10-id");

        const html = escapeStr(node.outerHTML);
        if (nextNid) {
          statements.push(
            `{ const ref = document.querySelector('[data-z10-id="${escapeStr(nextNid)}"]'); ` +
            `if (ref && ref.parentElement) ref.insertAdjacentHTML('beforebegin', '${html}'); }`
          );
        } else {
          statements.push(
            `{ const parent = document.querySelector('[data-z10-id="${escapeStr(parentNid)}"]'); ` +
            `if (parent) parent.insertAdjacentHTML('beforeend', '${html}'); }`
          );
        }
      }
    } else if (rec.type === "attributes") {
      const el = rec.target as HTMLElement;
      const nid = el.getAttribute?.("data-z10-id");
      if (!nid) continue;

      const attrName = rec.attributeName!;

      // Skip style changes — edit bridge handles those
      if (attrName === "style") continue;

      const value = el.getAttribute(attrName);
      if (value === null) {
        statements.push(
          `{ const el = document.querySelector('[data-z10-id="${escapeStr(nid)}"]'); ` +
          `if (el) el.removeAttribute('${escapeStr(attrName)}'); }`
        );
      } else {
        statements.push(
          `{ const el = document.querySelector('[data-z10-id="${escapeStr(nid)}"]'); ` +
          `if (el) el.setAttribute('${escapeStr(attrName)}', '${escapeStr(value)}'); }`
        );
      }
    }
  }

  if (statements.length === 0) return null;
  return statements.join("\n");
}

/**
 * Generate a transaction code string that replaces the full page content.
 * Used for undo/redo restores where incremental patching isn't feasible.
 */
export function fullReplaceTransaction(innerHTML: string): string {
  return `document.body.innerHTML = '${escapeStr(innerHTML)}';`;
}

/** Walk up from a target element to find the nearest ancestor with a data-z10-id. */
function getParentNid(el: HTMLElement): string | null {
  let current: HTMLElement | null = el;
  while (current) {
    const nid = current.getAttribute?.("data-z10-id");
    if (nid) return nid;
    current = current.parentElement;
  }
  return null;
}

/** Escape single quotes and backslashes for embedding in JS string literals. */
function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
