import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import {
  validate, preCheckTreeTimestamp, buildManifest,
  type TimestampManifest, type NodeManifestEntry,
} from '../../src/dom/validator.js';
import {
  setTimestamp, TS_NODE, TS_CHILDREN, TS_TEXT, TS_TREE,
  tsAttrName, tsStylePropName,
  type WriteSetEntry,
} from '../../src/dom/timestamps.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

function makeManifest(entries: Record<string, Partial<NodeManifestEntry>>): TimestampManifest {
  const nodes = new Map<string, NodeManifestEntry>();
  for (const [nid, partial] of Object.entries(entries)) {
    nodes.set(nid, {
      attrs: new Map(),
      styleProps: new Map(),
      ...partial,
    });
  }
  return { nodes };
}

describe('preCheckTreeTimestamp', () => {
  it('returns true when tree unchanged', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-tree="5"></div>';
    expect(preCheckTreeTimestamp('n1', 5, document.body as unknown as Element)).toBe(true);
  });

  it('returns false when tree changed', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-tree="10"></div>';
    expect(preCheckTreeTimestamp('n1', 5, document.body as unknown as Element)).toBe(false);
  });

  it('returns false when node is missing', () => {
    document.body.innerHTML = '<div data-z10-id="other"></div>';
    expect(preCheckTreeTimestamp('n1', 5, document.body as unknown as Element)).toBe(false);
  });
});

describe('validate', () => {
  it('returns no conflicts when timestamps match', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-text="5"></div>';
    const manifest = makeManifest({ n1: { [TS_TEXT]: 5 } });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'text' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toEqual([]);
  });

  it('detects text conflict when live ts > manifest ts', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-text="10"></div>';
    const manifest = makeManifest({ n1: { [TS_TEXT]: 5 } });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'text' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('text');
    expect(conflicts[0].manifestTs).toBe(5);
    expect(conflicts[0].liveTs).toBe(10);
  });

  it('detects structural conflict', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-node="10"></div>';
    const manifest = makeManifest({ n1: { [TS_NODE]: 5 } });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'structural' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('structural');
  });

  it('detects children conflict', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-children="10"></div>';
    const manifest = makeManifest({ n1: { [TS_CHILDREN]: 5 } });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'children' }];

    expect(validate(writeSet, manifest, document.body as unknown as Element)).toHaveLength(1);
  });

  it('detects attribute conflict', () => {
    const attrTs = tsAttrName('class');
    document.body.innerHTML = `<div data-z10-id="n1" ${attrTs}="10"></div>`;
    const manifest = makeManifest({
      n1: { attrs: new Map([[attrTs, 5]]) },
    });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'attribute', attribute: 'class' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('attribute');
  });

  it('detects style-property conflict', () => {
    const styleTs = tsStylePropName('font-size');
    document.body.innerHTML = `<div data-z10-id="n1" ${styleTs}="10"></div>`;
    const manifest = makeManifest({
      n1: { styleProps: new Map([[styleTs, 5]]) },
    });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'style-property', property: 'font-size' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('style-property');
  });

  it('detects deleted node as structural conflict', () => {
    document.body.innerHTML = '<div data-z10-id="other"></div>';
    const manifest = makeManifest({ n1: { [TS_NODE]: 5 } });
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'text' }];

    const conflicts = validate(writeSet, manifest, document.body as unknown as Element);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('structural');
    expect(conflicts[0].liveTs).toBe(-1);
  });

  it('skips entries for nodes not in manifest', () => {
    document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-text="10"></div>';
    const manifest = makeManifest({}); // empty manifest
    const writeSet: WriteSetEntry[] = [{ nid: 'n1', facet: 'text' }];

    expect(validate(writeSet, manifest, document.body as unknown as Element)).toEqual([]);
  });
});

describe('buildManifest', () => {
  it('captures all timestamps from subtree', () => {
    document.body.innerHTML = `
      <div data-z10-id="n1" data-z10-ts-node="5" data-z10-ts-text="3" data-z10-ts-tree="10"
           data-z10-ts-a-class="4" data-z10-ts-a-style-font-size="6">
        <span data-z10-id="n2" data-z10-ts-node="2" data-z10-ts-tree="7"></span>
      </div>
    `;
    const root = document.querySelector('[data-z10-id="n1"]') as unknown as Element;
    const manifest = buildManifest(root);

    expect(manifest.nodes.size).toBe(2);

    const n1 = manifest.nodes.get('n1')!;
    expect(n1[TS_NODE]).toBe(5);
    expect(n1[TS_TEXT]).toBe(3);
    expect(n1.attrs.get(tsAttrName('class'))).toBe(4);
    expect(n1.styleProps.get(tsStylePropName('font-size'))).toBe(6);

    const n2 = manifest.nodes.get('n2')!;
    expect(n2[TS_NODE]).toBe(2);
  });
});
