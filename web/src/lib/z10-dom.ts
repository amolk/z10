/**
 * Bridge module: z10 DOM types and functions for the web app.
 *
 * Inlined from src/dom/ because Turbopack cannot resolve .js→.ts imports
 * in files outside the Next.js project. Keep in sync with the source.
 *
 * Source files: src/dom/patch-serialize.ts (types), src/dom/patch-replay.ts
 */

// ── Op types (from src/dom/patch-serialize.ts) ──

export interface AttrOp {
  op: "attr";
  id: string;
  name: string;
  value: string | null;
}

export interface StyleOp {
  op: "style";
  id: string;
  prop: string;
  value: string;
}

export interface TextOp {
  op: "text";
  id: string;
  value: string;
}

export interface AddOp {
  op: "add";
  parentId: string;
  html: string;
  before: string | null;
}

export interface RemoveOp {
  op: "remove";
  id: string;
}

export type PatchOp = AttrOp | StyleOp | TextOp | AddOp | RemoveOp;

export interface PatchEnvelope {
  txId: number;
  timestamp: number;
  ops: PatchOp[];
}

// ── Patch replay (from src/dom/patch-replay.ts) ──

/**
 * Replay a patch (array of ops) against a DOM tree rooted at rootElement.
 * Each op type is handled idempotently where possible.
 */
export function replayPatch(ops: PatchOp[], rootElement: Element): void {
  for (const op of ops) {
    switch (op.op) {
      case "attr":
        replayAttr(op, rootElement);
        break;
      case "style":
        replayStyle(op, rootElement);
        break;
      case "text":
        replayText(op, rootElement);
        break;
      case "add":
        replayAdd(op, rootElement);
        break;
      case "remove":
        replayRemove(op, rootElement);
        break;
    }
  }
}

function findNode(rootElement: Element, id: string): Element | null {
  return rootElement.querySelector(`[data-z10-id="${id}"]`);
}

function replayAttr(
  op: { id: string; name: string; value: string | null },
  rootElement: Element,
): void {
  const el = findNode(rootElement, op.id);
  if (!el) return;

  if (op.value === null) {
    el.removeAttribute(op.name);
  } else {
    el.setAttribute(op.name, op.value);
  }
}

function replayStyle(
  op: { id: string; prop: string; value: string },
  rootElement: Element,
): void {
  const el = findNode(rootElement, op.id) as HTMLElement | null;
  if (!el) return;

  if (el.style?.setProperty) {
    el.style.setProperty(op.prop, op.value);
  } else {
    const current = parseStyleAttr(el.getAttribute("style") || "");
    current.set(op.prop, op.value);
    el.setAttribute("style", serializeStyleMap(current));
  }
}

function replayText(
  op: { id: string; value: string },
  rootElement: Element,
): void {
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

  const doc = rootElement.ownerDocument;
  const template = doc.createElement("template");
  template.innerHTML = op.html;
  const fragment = template.content || template;

  // Idempotency: remove any pre-existing elements with the same data-z10-id
  // to prevent doubling when the same patch is replayed or when a move
  // generates separate remove+add records that arrive out of order.
  const children = fragment.children || fragment.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Element;
    if (child.nodeType === 1) {
      const childId = child.getAttribute?.("data-z10-id");
      if (childId) {
        const existing = findNode(rootElement, childId);
        if (existing) {
          existing.parentElement?.removeChild(existing);
        }
      }
    }
  }

  if (op.before) {
    const beforeEl = findNode(rootElement, op.before);
    if (beforeEl && beforeEl.parentElement === parent) {
      while (fragment.firstChild) {
        parent.insertBefore(fragment.firstChild, beforeEl);
      }
    } else {
      while (fragment.firstChild) {
        parent.appendChild(fragment.firstChild);
      }
    }
  } else {
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
  for (const decl of str.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
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
  return parts.join("; ");
}
