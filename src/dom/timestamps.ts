/**
 * A2. Timestamp attribute system.
 * Functions to read/write data-z10-ts-* attributes on DOM elements.
 * bubbleTimestamp(node, ts) with early-stop.
 * bumpTimestamps(writeSet, ts) to update all affected timestamps in one pass.
 * §3.1, §3.3, §3.4
 */

// ── Timestamp attribute names ──

/** Tracks structural identity: node moved, reparented, or deleted */
export const TS_NODE = 'data-z10-ts-node';

/** Tracks direct child list: child added or removed */
export const TS_CHILDREN = 'data-z10-ts-children';

/** Tracks text content changes */
export const TS_TEXT = 'data-z10-ts-text';

/** Tracks subtree high-water mark (max of all ts in subtree) */
export const TS_TREE = 'data-z10-ts-tree';

/** Prefix for per-attribute timestamps: data-z10-ts-a-{name} */
export const TS_ATTR_PREFIX = 'data-z10-ts-a-';

/** Prefix for per-style-property timestamps: data-z10-ts-a-style-{property} */
export const TS_STYLE_PREFIX = 'data-z10-ts-a-style-';

// ── Read/Write helpers ──

/** Read a timestamp value from an element. Returns 0 if not set. */
export function getTimestamp(el: Element, attrName: string): number {
  const val = el.getAttribute(attrName);
  return val ? parseInt(val, 10) || 0 : 0;
}

/** Write a timestamp value to an element. */
export function setTimestamp(el: Element, attrName: string, ts: number): void {
  el.setAttribute(attrName, String(ts));
}

/** Get the attribute timestamp name for a given attribute name. */
export function tsAttrName(attributeName: string): string {
  return `${TS_ATTR_PREFIX}${attributeName}`;
}

/** Get the style-property timestamp name for a given CSS property. */
export function tsStylePropName(cssProperty: string): string {
  return `${TS_STYLE_PREFIX}${cssProperty}`;
}

// ── Initial timestamps ──

/**
 * Set all initial data-z10-ts-* attributes on a newly created element.
 * Called during node ID assignment (A12) and bootstrap (A4).
 */
export function setInitialTimestamps(el: Element, ts: number): void {
  const tsStr = String(ts);
  el.setAttribute(TS_NODE, tsStr);
  el.setAttribute(TS_CHILDREN, tsStr);
  el.setAttribute(TS_TEXT, tsStr);
  el.setAttribute(TS_TREE, tsStr);

  // Set timestamps for existing attributes (excluding data-z10-* system attrs)
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const name = attrs[i].name;
    if (name.startsWith('data-z10-')) continue; // skip system attributes
    if (name === 'style') {
      // For style attribute, set per-property timestamps
      const styleValue = el.getAttribute('style');
      if (styleValue) {
        // Parse style properties and set timestamps for each
        const declarations = styleValue.split(';');
        for (const decl of declarations) {
          const trimmed = decl.trim();
          if (!trimmed) continue;
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx === -1) continue;
          const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
          if (prop) {
            el.setAttribute(tsStylePropName(prop), tsStr);
          }
        }
      }
      el.setAttribute(tsAttrName('style'), tsStr);
    } else {
      el.setAttribute(tsAttrName(name), tsStr);
    }
  }
}

// ── Bubble-up ──

/**
 * Bubble data-z10-ts-tree up the ancestor chain with early-stop.
 * §3.3: If existing ts-tree >= timestamp, stop (nothing in subtree is newer).
 */
export function bubbleTimestamp(node: Element, timestamp: number): void {
  let current: Element | null = node;
  while (current) {
    const existing = getTimestamp(current, TS_TREE);
    if (existing >= timestamp) break; // early stop
    setTimestamp(current, TS_TREE, timestamp);
    current = current.parentElement;
  }
}

// ── Write set types ──

export type Facet = 'structural' | 'children' | 'text' | 'attribute' | 'style-property';

export interface WriteSetEntry {
  nid: string;
  facet: Facet;
  property?: string;  // for style-property facet
  attribute?: string;  // for attribute facet
}

/**
 * Bump all timestamps indicated by the write set, then bubble tree timestamps.
 * Called during commit (A10) to update version metadata.
 */
export function bumpTimestamps(
  writeSet: WriteSetEntry[],
  ts: number,
  root: Element,
): void {
  const nodesToBubble = new Set<Element>();

  for (const entry of writeSet) {
    // Check root element itself, not just descendants (querySelector misses the root)
    const el = root.getAttribute('data-z10-id') === entry.nid
      ? root
      : root.querySelector(`[data-z10-id="${entry.nid}"]`);
    if (!el) continue;

    switch (entry.facet) {
      case 'structural':
        setTimestamp(el, TS_NODE, ts);
        break;
      case 'children':
        setTimestamp(el, TS_CHILDREN, ts);
        break;
      case 'text':
        setTimestamp(el, TS_TEXT, ts);
        break;
      case 'attribute':
        if (entry.attribute) {
          setTimestamp(el, tsAttrName(entry.attribute), ts);
        }
        break;
      case 'style-property':
        if (entry.property) {
          setTimestamp(el, tsStylePropName(entry.property), ts);
        }
        // Also bump the style attribute timestamp
        setTimestamp(el, tsAttrName('style'), ts);
        break;
    }

    nodesToBubble.add(el);
  }

  // Bubble tree timestamp for all affected nodes
  for (const el of nodesToBubble) {
    bubbleTimestamp(el, ts);
  }
}
