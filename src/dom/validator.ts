/**
 * A6. Per-facet validator.
 * validate(writeSet, manifest, liveDOM) → conflicts array.
 * Check each write-set entry against live DOM timestamps.
 * No data-z10-ts-tree for validation (only for fast pre-check).
 * Returns typed conflict objects per §4.1–4.6.
 * §5.2 Step 9
 */

import type { WriteSetEntry } from './timestamps.js';
import {
  getTimestamp,
  TS_NODE, TS_CHILDREN, TS_TEXT, TS_TREE,
  tsAttrName, tsStylePropName,
} from './timestamps.js';

// ── Manifest: snapshot of timestamps at read time ──

export interface TimestampManifest {
  /** Map of nodeId → { facet timestamps at read time } */
  nodes: Map<string, NodeManifestEntry>;
}

export interface NodeManifestEntry {
  [TS_NODE]?: number;
  [TS_CHILDREN]?: number;
  [TS_TEXT]?: number;
  [TS_TREE]?: number;
  /** Per-attribute timestamps: key = tsAttrName(attrName) */
  attrs: Map<string, number>;
  /** Per-style-property timestamps: key = tsStylePropName(prop) */
  styleProps: Map<string, number>;
}

// ── Conflict types (§4.1–4.6) ──

export interface Conflict {
  type: 'structural' | 'children' | 'text' | 'attribute' | 'style-property';
  nid: string;
  attribute?: string;
  property?: string;
  /** Timestamp in manifest (what the writer saw) */
  manifestTs: number;
  /** Current timestamp in live DOM (what it actually is) */
  liveTs: number;
}

// ── Helpers ──

/** Find element by data-z10-id, including the root element itself. */
function findByNid(root: Element, nid: string): Element | null {
  if (root.getAttribute('data-z10-id') === nid) return root;
  return root.querySelector(`[data-z10-id="${nid}"]`);
}

// ── Fast pre-check using ts-tree ──

/**
 * Fast pre-check: compare data-z10-ts-tree on the subtree root.
 * If unchanged since manifest, no conflicts possible — skip full validation.
 * Returns true if pre-check passes (no changes detected).
 */
export function preCheckTreeTimestamp(
  subtreeRootNid: string,
  manifestTreeTs: number,
  liveDOM: Element,
): boolean {
  const el = findByNid(liveDOM, subtreeRootNid);
  if (!el) return false; // node gone — definitely changed
  const liveTreeTs = getTimestamp(el, 'data-z10-ts-tree');
  return liveTreeTs <= manifestTreeTs;
}

// ── Full validation ──

/**
 * Validate a write set against the live DOM using the manifest.
 * For each entry in the write set, compare the relevant timestamp
 * in the manifest vs the live DOM. If live > manifest, conflict.
 */
export function validate(
  writeSet: WriteSetEntry[],
  manifest: TimestampManifest,
  liveDOM: Element,
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const entry of writeSet) {
    const manifestNode = manifest.nodes.get(entry.nid);
    if (!manifestNode) {
      // Node wasn't in the manifest — it was created by another writer
      // or wasn't in the read subtree. Skip validation for this entry.
      continue;
    }

    const el = findByNid(liveDOM, entry.nid);
    if (!el) {
      // Node was deleted from live DOM since manifest was taken
      conflicts.push({
        type: 'structural',
        nid: entry.nid,
        manifestTs: manifestNode[TS_NODE] ?? 0,
        liveTs: -1, // sentinel: node deleted
      });
      continue;
    }

    switch (entry.facet) {
      case 'structural': {
        const manifestTs = manifestNode[TS_NODE] ?? 0;
        const liveTs = getTimestamp(el, TS_NODE);
        if (liveTs > manifestTs) {
          conflicts.push({ type: 'structural', nid: entry.nid, manifestTs, liveTs });
        }
        break;
      }
      case 'children': {
        const manifestTs = manifestNode[TS_CHILDREN] ?? 0;
        const liveTs = getTimestamp(el, TS_CHILDREN);
        if (liveTs > manifestTs) {
          conflicts.push({ type: 'children', nid: entry.nid, manifestTs, liveTs });
        }
        break;
      }
      case 'text': {
        const manifestTs = manifestNode[TS_TEXT] ?? 0;
        const liveTs = getTimestamp(el, TS_TEXT);
        if (liveTs > manifestTs) {
          conflicts.push({ type: 'text', nid: entry.nid, manifestTs, liveTs });
        }
        break;
      }
      case 'attribute': {
        const attrTsName = tsAttrName(entry.attribute!);
        const manifestTs = manifestNode.attrs.get(attrTsName) ?? 0;
        const liveTs = getTimestamp(el, attrTsName);
        if (liveTs > manifestTs) {
          conflicts.push({
            type: 'attribute', nid: entry.nid,
            attribute: entry.attribute, manifestTs, liveTs,
          });
        }
        break;
      }
      case 'style-property': {
        const styleTsName = tsStylePropName(entry.property!);
        const manifestTs = manifestNode.styleProps.get(styleTsName) ?? 0;
        const liveTs = getTimestamp(el, styleTsName);
        if (liveTs > manifestTs) {
          conflicts.push({
            type: 'style-property', nid: entry.nid,
            property: entry.property, manifestTs, liveTs,
          });
        }
        break;
      }
    }
  }

  return conflicts;
}

// ── Manifest builder ──

/**
 * Build a timestamp manifest from a DOM subtree.
 * Captures all data-z10-ts-* values for every element with a data-z10-id.
 */
export function buildManifest(subtreeRoot: Element): TimestampManifest {
  const nodes = new Map<string, NodeManifestEntry>();

  const processElement = (el: Element) => {
    const nid = el.getAttribute('data-z10-id');
    if (!nid) return;

    const entry: NodeManifestEntry = {
      attrs: new Map(),
      styleProps: new Map(),
    };

    // Read all attributes looking for timestamps
    const attrs = el.attributes;
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs[i]!.name;
      const value = parseInt(attrs[i]!.value, 10);
      if (isNaN(value)) continue;

      if (name === TS_NODE) entry[TS_NODE] = value;
      else if (name === TS_CHILDREN) entry[TS_CHILDREN] = value;
      else if (name === TS_TEXT) entry[TS_TEXT] = value;
      else if (name === TS_TREE) entry[TS_TREE] = value;
      else if (name.startsWith('data-z10-ts-a-style-')) entry.styleProps.set(name, value);
      else if (name.startsWith('data-z10-ts-a-')) entry.attrs.set(name, value);
    }

    nodes.set(nid, entry);
  };

  processElement(subtreeRoot);
  const descendants = subtreeRoot.querySelectorAll('[data-z10-id]');
  for (let i = 0; i < descendants.length; i++) {
    processElement(descendants[i] as Element);
  }

  return { nodes };
}

// ── Manifest serialization (for network transport) ──

/** JSON-safe representation of a manifest (Maps → objects). */
export interface SerializedManifest {
  nodes: Record<string, {
    [TS_NODE]?: number;
    [TS_CHILDREN]?: number;
    [TS_TEXT]?: number;
    [TS_TREE]?: number;
    attrs: Record<string, number>;
    styleProps: Record<string, number>;
  }>;
}

/** Convert a TimestampManifest to a JSON-safe object. */
export function serializeManifest(manifest: TimestampManifest): SerializedManifest {
  const nodes: SerializedManifest['nodes'] = {};
  for (const [nid, entry] of manifest.nodes) {
    nodes[nid] = {
      ...(entry[TS_NODE] !== undefined ? { [TS_NODE]: entry[TS_NODE] } : {}),
      ...(entry[TS_CHILDREN] !== undefined ? { [TS_CHILDREN]: entry[TS_CHILDREN] } : {}),
      ...(entry[TS_TEXT] !== undefined ? { [TS_TEXT]: entry[TS_TEXT] } : {}),
      ...(entry[TS_TREE] !== undefined ? { [TS_TREE]: entry[TS_TREE] } : {}),
      attrs: Object.fromEntries(entry.attrs),
      styleProps: Object.fromEntries(entry.styleProps),
    };
  }
  return { nodes };
}

/** Reconstruct a TimestampManifest from a JSON-deserialized object. */
export function deserializeManifest(data: SerializedManifest): TimestampManifest {
  const nodes = new Map<string, NodeManifestEntry>();
  for (const [nid, raw] of Object.entries(data.nodes)) {
    const entry: NodeManifestEntry = {
      attrs: new Map(Object.entries(raw.attrs ?? {})),
      styleProps: new Map(Object.entries(raw.styleProps ?? {})),
    };
    if (raw[TS_NODE] !== undefined) entry[TS_NODE] = raw[TS_NODE];
    if (raw[TS_CHILDREN] !== undefined) entry[TS_CHILDREN] = raw[TS_CHILDREN];
    if (raw[TS_TEXT] !== undefined) entry[TS_TEXT] = raw[TS_TEXT];
    if (raw[TS_TREE] !== undefined) entry[TS_TREE] = raw[TS_TREE];
    nodes.set(nid, entry);
  }
  return { nodes };
}
