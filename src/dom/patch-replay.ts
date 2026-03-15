/**
 * A15. Patch replay.
 * replayPatch(ops, rootElement) — handles all 5 op types.
 * Nodes addressed by data-z10-id via querySelector.
 * Must work identically in happy-dom and browser DOM.
 * THE critical shared function — server, CLI, and web UI all use this.
 * §7.3
 */

import type { PatchOp } from './patch-serialize.js';

/**
 * Replay a patch (array of ops) against a DOM tree rooted at rootElement.
 * Each op type is handled idempotently where possible.
 */
export function replayPatch(ops: PatchOp[], rootElement: Element): void {
  for (const op of ops) {
    switch (op.op) {
      case 'attr':
        replayAttr(op, rootElement);
        break;
      case 'style':
        replayStyle(op, rootElement);
        break;
      case 'text':
        replayText(op, rootElement);
        break;
      case 'add':
        replayAdd(op, rootElement);
        break;
      case 'remove':
        replayRemove(op, rootElement);
        break;
    }
  }
}

function findNode(rootElement: Element, id: string): Element | null {
  if (rootElement.getAttribute('data-z10-id') === id) return rootElement;
  return rootElement.querySelector(`[data-z10-id="${id}"]`);
}

function replayAttr(op: { id: string; name: string; value: string | null }, rootElement: Element): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;

  if (op.value === null) {
    el.removeAttribute(op.name);
  } else {
    el.setAttribute(op.name, op.value);
  }
}

function replayStyle(op: { id: string; prop: string; value: string }, rootElement: Element): void {
  const el = findNode(rootElement, op.id) as HTMLElement | null;
  if (!el) return;

  // Use style.setProperty for correct CSS property handling
  if (el.style?.setProperty) {
    el.style.setProperty(op.prop, op.value);
  } else {
    // Fallback: modify style attribute directly
    const current = parseStyleAttr(el.getAttribute('style') || '');
    current.set(op.prop, op.value);
    el.setAttribute('style', serializeStyleMap(current));
  }
}

function replayText(op: { id: string; value: string }, rootElement: Element): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;
  el.textContent = op.value;
}

function replayAdd(
  op: { parentId: string; html: string; before: string | null },
  rootElement: Element,
): void {
  const parent = findNode(rootElement, op.parentId);
  if (!parent) return;

  // Parse the HTML into elements
  const doc = rootElement.ownerDocument;
  const template = doc.createElement('template');
  template.innerHTML = op.html;
  const fragment = template.content || template;

  // Idempotency: remove any pre-existing elements with the same data-z10-id
  // to prevent doubling when the same patch is replayed or when a move
  // generates separate remove+add records that arrive out of order.
  // Must check ALL elements in the fragment (including nested), not just
  // top-level children, because nested elements may exist elsewhere in the tree.
  const idedElements = fragment.querySelectorAll
    ? fragment.querySelectorAll('[data-z10-id]')
    : [];
  for (let i = 0; i < idedElements.length; i++) {
    const childId = (idedElements[i] as Element).getAttribute('data-z10-id');
    if (childId) {
      const existing = findNode(rootElement, childId);
      if (existing) {
        existing.parentElement?.removeChild(existing);
      }
    }
  }

  if (op.before) {
    const beforeEl = findNode(rootElement, op.before);
    if (beforeEl && beforeEl.parentElement === parent) {
      // Insert each child of fragment before the target
      while (fragment.firstChild) {
        parent.insertBefore(fragment.firstChild, beforeEl);
      }
    } else {
      // Before target not found, append
      while (fragment.firstChild) {
        parent.appendChild(fragment.firstChild);
      }
    }
  } else {
    // Append
    while (fragment.firstChild) {
      parent.appendChild(fragment.firstChild);
    }
  }
}

function replayRemove(op: { id: string }, rootElement: Element): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;
  el.parentElement?.removeChild(el);
}

// ── Style attribute helpers ──

function parseStyleAttr(str: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!str) return map;
  for (const decl of str.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (prop && value) map.set(prop, value);
  }
  return map;
}

function serializeStyleMap(map: Map<string, string>): string {
  const parts: string[] = [];
  for (const [prop, value] of map) {
    parts.push(`${prop}: ${value}`);
  }
  return parts.join('; ');
}
