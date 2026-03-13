import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { buildWriteSet } from '../../src/dom/write-set.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

// Helper to create a minimal MutationRecord-like object
function makeMutationRecord(overrides: Partial<MutationRecord>): MutationRecord {
  return {
    type: 'attributes',
    target: document.createElement('div') as unknown as Node,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
    addedNodes: [] as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    previousSibling: null,
    nextSibling: null,
    ...overrides,
  } as MutationRecord;
}

describe('buildWriteSet', () => {
  it('returns empty array for no records', () => {
    expect(buildWriteSet([])).toEqual([]);
  });

  it('detects attribute changes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');
    el.setAttribute('class', 'new-class');

    const record = makeMutationRecord({
      type: 'attributes',
      target: el as unknown as Node,
      attributeName: 'class',
      oldValue: 'old-class',
    });

    const ws = buildWriteSet([record]);
    expect(ws).toContainEqual({ nid: 'n1', facet: 'attribute', attribute: 'class' });
  });

  it('decomposes style changes into per-property entries', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');
    el.setAttribute('style', 'font-size: 16px; color: blue');

    const record = makeMutationRecord({
      type: 'attributes',
      target: el as unknown as Node,
      attributeName: 'style',
      oldValue: 'font-size: 14px; color: blue',
    });

    const ws = buildWriteSet([record]);
    expect(ws).toContainEqual({ nid: 'n1', facet: 'style-property', property: 'font-size' });
    expect(ws.filter((e) => e.facet === 'style-property')).toHaveLength(1);
  });

  it('detects children changes', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-z10-id', 'p1');

    const record = makeMutationRecord({
      type: 'childList',
      target: parent as unknown as Node,
      addedNodes: [] as unknown as NodeList,
      removedNodes: [] as unknown as NodeList,
    });

    const ws = buildWriteSet([record]);
    expect(ws).toContainEqual({ nid: 'p1', facet: 'children' });
  });

  it('detects removed nodes as structural changes', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-z10-id', 'p1');
    const child = document.createElement('span');
    child.setAttribute('data-z10-id', 'c1');

    const record = makeMutationRecord({
      type: 'childList',
      target: parent as unknown as Node,
      removedNodes: [child] as unknown as NodeList,
    });

    const ws = buildWriteSet([record]);
    expect(ws).toContainEqual({ nid: 'c1', facet: 'structural' });
  });

  it('detects text content changes', () => {
    const parent = document.createElement('span');
    parent.setAttribute('data-z10-id', 't1');
    const textNode = document.createTextNode('old text');
    parent.appendChild(textNode);

    const record = makeMutationRecord({
      type: 'characterData',
      target: textNode as unknown as Node,
    });

    const ws = buildWriteSet([record]);
    expect(ws).toContainEqual({ nid: 't1', facet: 'text' });
  });

  it('deduplicates entries', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');
    el.setAttribute('class', 'v2');

    const record1 = makeMutationRecord({
      type: 'attributes',
      target: el as unknown as Node,
      attributeName: 'class',
      oldValue: 'v1',
    });
    const record2 = makeMutationRecord({
      type: 'attributes',
      target: el as unknown as Node,
      attributeName: 'class',
      oldValue: 'v2',
    });

    const ws = buildWriteSet([record1, record2]);
    const classEntries = ws.filter((e) => e.attribute === 'class');
    expect(classEntries).toHaveLength(1);
  });
});
