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
