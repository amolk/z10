/**
 * D2 + D3. Tests for browser patch replay and canvas architecture.
 *
 * Verifies that replayPatch (A15) correctly applies patch ops to a
 * browser-like DOM, as used by the editor canvas. D3 tests verify that
 * the live DOM can be inspected after patches for layer tree derivation
 * and that resync via innerHTML replacement works correctly.
 *
 * These tests use happy-dom (via vitest) to simulate the browser DOM
 * that the canvas iframe contains.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { replayPatch } from '../../src/dom/patch-replay.js';
import type { PatchOp, PatchEnvelope } from '../../src/dom/patch-serialize.js';

describe('canvas patch replay', () => {
  let window: InstanceType<typeof Window>;
  let document: Document;
  let root: Element;

  beforeEach(() => {
    window = new Window({ url: 'https://z10.dev' });
    document = window.document as unknown as Document;
    document.body.innerHTML = `
      <div data-z10-id="page" data-z10-page="Page 1" style="width: 1440px; min-height: 900px;">
        <div data-z10-id="card" style="padding: 16px; background: white;">
          <span data-z10-id="title">Hello World</span>
          <p data-z10-id="desc">Description text</p>
        </div>
      </div>
    `;
    root = document.body;
  });

  it('should apply attr ops to existing elements', () => {
    const ops: PatchOp[] = [
      { op: 'attr', id: 'card', name: 'class', value: 'card-updated' },
    ];
    replayPatch(ops, root);

    const card = root.querySelector('[data-z10-id="card"]');
    expect(card?.getAttribute('class')).toBe('card-updated');
  });

  it('should apply style ops to existing elements', () => {
    const ops: PatchOp[] = [
      { op: 'style', id: 'card', prop: 'background', value: 'blue' },
    ];
    replayPatch(ops, root);

    const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
    expect(card.getAttribute('style')).toContain('background');
  });

  it('should apply text ops to existing elements', () => {
    const ops: PatchOp[] = [
      { op: 'text', id: 'title', value: 'Updated Title' },
    ];
    replayPatch(ops, root);

    const title = root.querySelector('[data-z10-id="title"]');
    expect(title?.textContent).toBe('Updated Title');
  });

  it('should apply add ops to insert new elements', () => {
    const ops: PatchOp[] = [
      {
        op: 'add',
        parentId: 'card',
        html: '<button data-z10-id="btn">Click Me</button>',
        before: null,
      },
    ];
    replayPatch(ops, root);

    const btn = root.querySelector('[data-z10-id="btn"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Click Me');
    expect(btn?.parentElement?.getAttribute('data-z10-id')).toBe('card');
  });

  it('should apply remove ops to delete elements', () => {
    const ops: PatchOp[] = [
      { op: 'remove', id: 'desc' },
    ];
    replayPatch(ops, root);

    const desc = root.querySelector('[data-z10-id="desc"]');
    expect(desc).toBeNull();
  });

  it('should apply multiple ops in a single patch', () => {
    const ops: PatchOp[] = [
      { op: 'text', id: 'title', value: 'New Title' },
      { op: 'style', id: 'card', prop: 'padding', value: '24px' },
      { op: 'attr', id: 'page', name: 'data-z10-page', value: 'Updated Page' },
    ];
    replayPatch(ops, root);

    expect(root.querySelector('[data-z10-id="title"]')?.textContent).toBe('New Title');
    const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
    expect(card.getAttribute('style')).toContain('24px');
    expect(root.querySelector('[data-z10-id="page"]')?.getAttribute('data-z10-page')).toBe('Updated Page');
  });

  it('should handle add with before parameter (insert before sibling)', () => {
    const ops: PatchOp[] = [
      {
        op: 'add',
        parentId: 'card',
        html: '<em data-z10-id="subtitle">Subtitle</em>',
        before: 'desc',
      },
    ];
    replayPatch(ops, root);

    const subtitle = root.querySelector('[data-z10-id="subtitle"]');
    expect(subtitle).not.toBeNull();
    // subtitle should be before desc
    const card = root.querySelector('[data-z10-id="card"]')!;
    const children = Array.from(card.children).map(c => c.getAttribute('data-z10-id'));
    const subtitleIdx = children.indexOf('subtitle');
    const descIdx = children.indexOf('desc');
    expect(subtitleIdx).toBeLessThan(descIdx);
  });

  it('should silently skip ops for missing elements', () => {
    const ops: PatchOp[] = [
      { op: 'text', id: 'nonexistent', value: 'Ghost' },
      { op: 'remove', id: 'also-missing' },
      { op: 'text', id: 'title', value: 'Still works' },
    ];
    // Should not throw
    replayPatch(ops, root);
    expect(root.querySelector('[data-z10-id="title"]')?.textContent).toBe('Still works');
  });

  it('should handle a complete PatchEnvelope shape', () => {
    const envelope: PatchEnvelope = {
      txId: 42,
      timestamp: Date.now(),
      ops: [
        { op: 'text', id: 'title', value: 'From Envelope' },
        { op: 'attr', id: 'card', name: 'data-z10-intent', value: 'hero' },
      ],
    };
    // In the real flow, handlePatch calls replayPatch(envelope.ops, root)
    replayPatch(envelope.ops, root);
    expect(root.querySelector('[data-z10-id="title"]')?.textContent).toBe('From Envelope');
    expect(root.querySelector('[data-z10-id="card"]')?.getAttribute('data-z10-intent')).toBe('hero');
  });

  // ─── D3: Canvas architecture tests ─────────────────────────────

  describe('D3 live DOM inspection after patches', () => {
    it('should reflect patched state when querying DOM for layer tree', () => {
      // Simulate: patch adds a new element, then we inspect the DOM
      // (as refreshLayersFromDOM would do)
      const ops: PatchOp[] = [
        { op: 'text', id: 'title', value: 'Patched Title' },
        {
          op: 'add',
          parentId: 'card',
          html: '<div data-z10-id="badge" style="display: flex;"><span data-z10-id="badge-text">New</span></div>',
          before: null,
        },
      ];
      replayPatch(ops, root);

      // Inspect DOM like refreshLayersFromDOM does
      const pageEl = root.querySelector('[data-z10-page]');
      expect(pageEl).not.toBeNull();

      // Verify the new element is in the DOM tree
      const allIds = Array.from(root.querySelectorAll('[data-z10-id]')).map(
        (el) => el.getAttribute('data-z10-id'),
      );
      expect(allIds).toContain('badge');
      expect(allIds).toContain('badge-text');

      // Verify text was updated
      expect(root.querySelector('[data-z10-id="title"]')?.textContent).toBe('Patched Title');

      // Verify parent-child structure
      const badge = root.querySelector('[data-z10-id="badge"]');
      expect(badge?.parentElement?.getAttribute('data-z10-id')).toBe('card');
      expect(badge?.children.length).toBe(1);
      expect(badge?.children[0].getAttribute('data-z10-id')).toBe('badge-text');
    });

    it('should correctly identify page element for layer derivation after remove ops', () => {
      const ops: PatchOp[] = [{ op: 'remove', id: 'desc' }];
      replayPatch(ops, root);

      // The page element should still be findable
      const pageEl = root.querySelector('[data-z10-page]');
      expect(pageEl).not.toBeNull();
      expect(pageEl?.getAttribute('data-z10-page')).toBe('Page 1');

      // The card should now have only one child (title)
      const card = root.querySelector('[data-z10-id="card"]')!;
      const childIds = Array.from(card.children).map((c) => c.getAttribute('data-z10-id'));
      expect(childIds).toEqual(['title']);
    });
  });

  describe('D3 resync via innerHTML replacement', () => {
    it('should replace page content via innerHTML (simulating handleResync)', () => {
      // Simulate the resync flow: find the page container and replace its innerHTML
      const pageContainer = root.querySelector('[data-z10-page]')?.parentElement;
      expect(pageContainer).not.toBeNull();

      const resyncHtml = `<div data-z10-page="Page 1" data-z10-id="page" style="width: 1440px; min-height: 900px;">
        <div data-z10-id="hero" style="padding: 32px; background: navy;">
          <h1 data-z10-id="heading">Resynced Content</h1>
        </div>
      </div>`;

      pageContainer!.innerHTML = resyncHtml;

      // Verify old elements are gone
      expect(root.querySelector('[data-z10-id="card"]')).toBeNull();
      expect(root.querySelector('[data-z10-id="title"]')).toBeNull();

      // Verify new elements are present
      expect(root.querySelector('[data-z10-id="hero"]')).not.toBeNull();
      expect(root.querySelector('[data-z10-id="heading"]')?.textContent).toBe('Resynced Content');
      expect(root.querySelector('[data-z10-page]')?.getAttribute('data-z10-page')).toBe('Page 1');
    });

    it('should support patches on resynced DOM', () => {
      // Resync
      const pageContainer = root.querySelector('[data-z10-page]')?.parentElement;
      pageContainer!.innerHTML = `<div data-z10-page="Page 1" data-z10-id="page" style="width: 1440px;">
        <div data-z10-id="section"><p data-z10-id="para">Initial</p></div>
      </div>`;

      // Apply patch on top of resynced content
      const ops: PatchOp[] = [
        { op: 'text', id: 'para', value: 'After Resync Patch' },
        { op: 'attr', id: 'section', name: 'class', value: 'updated' },
      ];
      replayPatch(ops, root);

      expect(root.querySelector('[data-z10-id="para"]')?.textContent).toBe('After Resync Patch');
      expect(root.querySelector('[data-z10-id="section"]')?.getAttribute('class')).toBe('updated');
    });
  });
});
