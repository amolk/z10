import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { replayPatch } from '../../src/dom/patch-replay.js';
import { PatchRingBuffer } from '../../src/dom/patch-buffer.js';
import { createPatchEnvelope, type PatchOp, type PatchEnvelope } from '../../src/dom/patch-serialize.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

// ── A15. Patch Replay ──

describe('replayPatch', () => {
  it('replays attr op — set attribute', () => {
    document.body.innerHTML = '<div data-z10-id="n1" class="old"></div>';
    const root = document.body as unknown as Element;

    replayPatch([{ op: 'attr', id: 'n1', name: 'class', value: 'new' }], root);

    expect(root.querySelector('[data-z10-id="n1"]')!.getAttribute('class')).toBe('new');
  });

  it('replays attr op — remove attribute', () => {
    document.body.innerHTML = '<div data-z10-id="n1" class="old"></div>';
    const root = document.body as unknown as Element;

    replayPatch([{ op: 'attr', id: 'n1', name: 'class', value: null }], root);

    expect(root.querySelector('[data-z10-id="n1"]')!.hasAttribute('class')).toBe(false);
  });

  it('replays style op', () => {
    document.body.innerHTML = '<div data-z10-id="n1" style="color: red"></div>';
    const root = document.body as unknown as Element;

    replayPatch([{ op: 'style', id: 'n1', prop: 'font-size', value: '16px' }], root);

    const el = root.querySelector('[data-z10-id="n1"]') as unknown as HTMLElement;
    // Check style was applied (either via style object or attribute)
    const styleAttr = el.getAttribute('style') || '';
    expect(styleAttr).toContain('font-size');
  });

  it('replays text op', () => {
    document.body.innerHTML = '<span data-z10-id="n1">old text</span>';
    const root = document.body as unknown as Element;

    replayPatch([{ op: 'text', id: 'n1', value: 'new text' }], root);

    expect(root.querySelector('[data-z10-id="n1"]')!.textContent).toBe('new text');
  });

  it('replays add op — append', () => {
    document.body.innerHTML = '<div data-z10-id="parent"></div>';
    const root = document.body as unknown as Element;

    replayPatch([{
      op: 'add',
      parentId: 'parent',
      html: '<span data-z10-id="new1">hello</span>',
      before: null,
    }], root);

    const newEl = root.querySelector('[data-z10-id="new1"]');
    expect(newEl).not.toBeNull();
    expect(newEl!.textContent).toBe('hello');
  });

  it('replays add op — insert before', () => {
    document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="b">B</span></div>';
    const root = document.body as unknown as Element;

    replayPatch([{
      op: 'add',
      parentId: 'parent',
      html: '<span data-z10-id="a">A</span>',
      before: 'b',
    }], root);

    const parent = root.querySelector('[data-z10-id="parent"]')!;
    const children = parent.children;
    expect((children[0] as Element).getAttribute('data-z10-id')).toBe('a');
    expect((children[1] as Element).getAttribute('data-z10-id')).toBe('b');
  });

  it('replays remove op', () => {
    document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="child">text</span></div>';
    const root = document.body as unknown as Element;

    replayPatch([{ op: 'remove', id: 'child' }], root);

    expect(root.querySelector('[data-z10-id="child"]')).toBeNull();
  });

  it('handles multiple ops in sequence', () => {
    document.body.innerHTML = `
      <div data-z10-id="container">
        <span data-z10-id="title">Old Title</span>
        <p data-z10-id="body">Body</p>
      </div>
    `;
    const root = document.body as unknown as Element;

    replayPatch([
      { op: 'text', id: 'title', value: 'New Title' },
      { op: 'attr', id: 'body', name: 'class', value: 'highlighted' },
      { op: 'add', parentId: 'container', html: '<footer data-z10-id="footer">Footer</footer>', before: null },
    ], root);

    expect(root.querySelector('[data-z10-id="title"]')!.textContent).toBe('New Title');
    expect(root.querySelector('[data-z10-id="body"]')!.getAttribute('class')).toBe('highlighted');
    expect(root.querySelector('[data-z10-id="footer"]')).not.toBeNull();
  });

  it('silently ignores ops targeting missing nodes', () => {
    document.body.innerHTML = '<div data-z10-id="n1"></div>';
    const root = document.body as unknown as Element;

    // Should not throw
    replayPatch([
      { op: 'attr', id: 'missing', name: 'class', value: 'x' },
      { op: 'remove', id: 'missing' },
      { op: 'text', id: 'missing', value: 'x' },
    ], root);
  });

  // ── Idempotency / anti-doubling tests ──

  it('add op is idempotent — replaying same add does not double the element', () => {
    document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="c1">first</span></div>';
    const root = document.body as unknown as Element;

    const addOp: PatchOp = {
      op: 'add',
      parentId: 'parent',
      html: '<span data-z10-id="c1">updated</span>',
      before: null,
    };

    // Replay the same add twice
    replayPatch([addOp], root);
    replayPatch([addOp], root);

    const matches = root.querySelectorAll('[data-z10-id="c1"]');
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toBe('updated');
  });

  it('add op deduplicates nested elements that exist elsewhere in the tree', () => {
    // n3 exists under "other", but the add op nests it under "parent" > "n5"
    document.body.innerHTML = `
      <div data-z10-id="root">
        <div data-z10-id="parent"></div>
        <div data-z10-id="other"><span data-z10-id="n3">old</span></div>
      </div>
    `;
    const root = document.body.querySelector('[data-z10-id="root"]') as Element;

    replayPatch([{
      op: 'add',
      parentId: 'parent',
      html: '<div data-z10-id="n5"><span data-z10-id="n3">moved</span></div>',
      before: null,
    }], root);

    // n3 should exist only once (under n5, not also under other)
    const matches = root.querySelectorAll('[data-z10-id="n3"]');
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toBe('moved');
    expect(matches[0].parentElement!.getAttribute('data-z10-id')).toBe('n5');
  });

  it('add op removes existing top-level element before inserting', () => {
    document.body.innerHTML = `
      <div data-z10-id="parent">
        <span data-z10-id="c1">old</span>
      </div>
    `;
    const root = document.body as unknown as Element;

    replayPatch([{
      op: 'add',
      parentId: 'parent',
      html: '<span data-z10-id="c1">new</span>',
      before: null,
    }], root);

    const matches = root.querySelectorAll('[data-z10-id="c1"]');
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toBe('new');
  });
});

// ── A16. Patch Ring Buffer ──

describe('PatchRingBuffer', () => {
  function makePatch(txId: number): PatchEnvelope {
    return createPatchEnvelope(txId, txId, []);
  }

  it('stores and retrieves patches', () => {
    const buf = new PatchRingBuffer(10);
    buf.push(makePatch(1));
    buf.push(makePatch(2));
    buf.push(makePatch(3));

    const patches = buf.getPatches(0);
    expect(patches).not.toBeNull();
    expect(patches!.map((p) => p.txId)).toEqual([1, 2, 3]);
  });

  it('filters by afterTxId', () => {
    const buf = new PatchRingBuffer(10);
    buf.push(makePatch(1));
    buf.push(makePatch(2));
    buf.push(makePatch(3));

    const patches = buf.getPatches(2);
    expect(patches!.map((p) => p.txId)).toEqual([3]);
  });

  it('returns empty array when all patches are before afterTxId', () => {
    const buf = new PatchRingBuffer(10);
    buf.push(makePatch(1));
    buf.push(makePatch(2));

    expect(buf.getPatches(5)).toEqual([]);
  });

  it('returns null on gap (oldest > afterTxId)', () => {
    const buf = new PatchRingBuffer(3);
    buf.push(makePatch(10));
    buf.push(makePatch(11));
    buf.push(makePatch(12));
    buf.push(makePatch(13)); // evicts 10

    // Asking for patches after txId 9 — but oldest is 11, so gap
    expect(buf.getPatches(9)).toBeNull();
  });

  it('wraps around correctly', () => {
    const buf = new PatchRingBuffer(3);
    buf.push(makePatch(1));
    buf.push(makePatch(2));
    buf.push(makePatch(3));
    buf.push(makePatch(4)); // evicts 1
    buf.push(makePatch(5)); // evicts 2

    expect(buf.size).toBe(3);
    expect(buf.latestTxId).toBe(5);
    const patches = buf.getPatches(3);
    expect(patches!.map((p) => p.txId)).toEqual([4, 5]);
  });

  it('returns empty array for empty buffer', () => {
    const buf = new PatchRingBuffer(10);
    expect(buf.getPatches(0)).toEqual([]);
    expect(buf.size).toBe(0);
    expect(buf.latestTxId).toBe(0);
  });

  it('rejects capacity < 1', () => {
    expect(() => new PatchRingBuffer(0)).toThrow();
  });
});
