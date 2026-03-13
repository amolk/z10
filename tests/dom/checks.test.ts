import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { checkIllegalModifications } from '../../src/dom/checks.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

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

describe('checkIllegalModifications', () => {
  it('returns empty array for no violations', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');

    const record = makeMutationRecord({
      target: el as unknown as Node,
      attributeName: 'class',
    });

    expect(checkIllegalModifications([record])).toEqual([]);
  });

  it('detects data-z10-id modification', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');

    const record = makeMutationRecord({
      target: el as unknown as Node,
      attributeName: 'data-z10-id',
    });

    const violations = checkIllegalModifications([record]);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe('id-modified');
  });

  it('detects data-z10-ts-* modification', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');

    const record = makeMutationRecord({
      target: el as unknown as Node,
      attributeName: 'data-z10-ts-node',
    });

    const violations = checkIllegalModifications([record]);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe('timestamp-modified');
    expect(violations[0].attributeName).toBe('data-z10-ts-node');
  });

  it('ignores non-attribute mutations', () => {
    const record = makeMutationRecord({
      type: 'childList',
      attributeName: undefined,
    });

    expect(checkIllegalModifications([record])).toEqual([]);
  });

  it('detects multiple violations', () => {
    const el = document.createElement('div');
    el.setAttribute('data-z10-id', 'n1');

    const records = [
      makeMutationRecord({ target: el as unknown as Node, attributeName: 'data-z10-id' }),
      makeMutationRecord({ target: el as unknown as Node, attributeName: 'data-z10-ts-tree' }),
    ];

    expect(checkIllegalModifications(records)).toHaveLength(2);
  });
});
