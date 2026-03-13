/**
 * A18. Cross-context verification test.
 * Confirms replayPatch and core DOM operations work identically
 * across happy-dom and jsdom (the two major server-side DOM implementations).
 * This is a key architectural invariant: one module, three consumers
 * (server/happy-dom, CLI/happy-dom, web UI/browser DOM).
 *
 * Surfaces API divergence in: MutationObserver, cloneNode, style attribute
 * handling, querySelector, insertBefore, removeChild, textContent, etc.
 */

import { describe, it, expect } from 'vitest';
import { Window as HappyWindow } from 'happy-dom';
import { JSDOM } from 'jsdom';
import { replayPatch } from '../../src/dom/patch-replay.js';
import { stripForAgent, stripForExport } from '../../src/dom/strip.js';
import type { PatchOp } from '../../src/dom/patch-serialize.js';

// ── DOM factory helpers ──

interface DOMContext {
  name: string;
  document: Document;
  cleanup?: () => void;
}

function createHappyDomContext(): DOMContext {
  const window = new HappyWindow();
  return {
    name: 'happy-dom',
    document: window.document as unknown as Document,
    cleanup: () => window.close(),
  };
}

function createJsdomContext(): DOMContext {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  return {
    name: 'jsdom',
    document: dom.window.document as unknown as Document,
    cleanup: () => dom.window.close(),
  };
}

const domFactories = [createHappyDomContext, createJsdomContext];

// ── Cross-context test suite ──

describe('A18: Cross-context verification', () => {

  // Run each test against both DOM implementations
  for (const factory of domFactories) {
    const ctxName = factory === createHappyDomContext ? 'happy-dom' : 'jsdom';

    describe(`[${ctxName}] replayPatch`, () => {
      it('replays attr set', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="n1" class="old"></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{ op: 'attr', id: 'n1', name: 'class', value: 'new' }], root);

        expect(root.querySelector('[data-z10-id="n1"]')!.getAttribute('class')).toBe('new');
        ctx.cleanup?.();
      });

      it('replays attr remove', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="n1" class="old"></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{ op: 'attr', id: 'n1', name: 'class', value: null }], root);

        expect(root.querySelector('[data-z10-id="n1"]')!.hasAttribute('class')).toBe(false);
        ctx.cleanup?.();
      });

      it('replays text op', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<span data-z10-id="n1">old</span>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{ op: 'text', id: 'n1', value: 'new' }], root);

        expect(root.querySelector('[data-z10-id="n1"]')!.textContent).toBe('new');
        ctx.cleanup?.();
      });

      it('replays style op', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="n1"></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{ op: 'style', id: 'n1', prop: 'font-size', value: '16px' }], root);

        const el = root.querySelector('[data-z10-id="n1"]') as unknown as HTMLElement;
        // Both implementations should have the style applied
        const styleAttr = el.getAttribute('style') || '';
        expect(styleAttr).toContain('font-size');
        ctx.cleanup?.();
      });

      it('replays add op (append)', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="parent"></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{
          op: 'add',
          parentId: 'parent',
          html: '<span data-z10-id="child">hello</span>',
          before: null,
        }], root);

        const child = root.querySelector('[data-z10-id="child"]');
        expect(child).not.toBeNull();
        expect(child!.textContent).toBe('hello');
        ctx.cleanup?.();
      });

      it('replays add op (insert before)', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="b">B</span></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{
          op: 'add',
          parentId: 'parent',
          html: '<span data-z10-id="a">A</span>',
          before: 'b',
        }], root);

        const parent = root.querySelector('[data-z10-id="parent"]')!;
        expect((parent.children[0] as Element).getAttribute('data-z10-id')).toBe('a');
        expect((parent.children[1] as Element).getAttribute('data-z10-id')).toBe('b');
        ctx.cleanup?.();
      });

      it('replays remove op', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="child">x</span></div>';
        const root = ctx.document.body as unknown as Element;

        replayPatch([{ op: 'remove', id: 'child' }], root);

        expect(root.querySelector('[data-z10-id="child"]')).toBeNull();
        ctx.cleanup?.();
      });

      it('handles multi-op patch', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = `
          <div data-z10-id="container">
            <span data-z10-id="title">Old</span>
            <p data-z10-id="body">Body</p>
          </div>
        `;
        const root = ctx.document.body as unknown as Element;

        replayPatch([
          { op: 'text', id: 'title', value: 'New' },
          { op: 'attr', id: 'body', name: 'class', value: 'highlight' },
          { op: 'add', parentId: 'container', html: '<footer data-z10-id="ft">Footer</footer>', before: null },
          { op: 'remove', id: 'body' },
        ], root);

        expect(root.querySelector('[data-z10-id="title"]')!.textContent).toBe('New');
        expect(root.querySelector('[data-z10-id="body"]')).toBeNull();
        expect(root.querySelector('[data-z10-id="ft"]')!.textContent).toBe('Footer');
        ctx.cleanup?.();
      });
    });

    describe(`[${ctxName}] stripForAgent / stripForExport`, () => {
      it('stripForAgent removes timestamps, keeps IDs', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = `
          <div data-z10-id="n1" data-z10-ts-node="5" data-z10-ts-tree="10" class="card">
            <span data-z10-id="n2" data-z10-ts-text="3">text</span>
          </div>
        `;
        const root = ctx.document.body.firstElementChild as unknown as Element;
        const stripped = stripForAgent(root);

        expect(stripped.getAttribute('data-z10-id')).toBe('n1');
        expect(stripped.getAttribute('data-z10-ts-node')).toBeNull();
        expect(stripped.getAttribute('data-z10-ts-tree')).toBeNull();
        expect(stripped.getAttribute('class')).toBe('card');

        const span = stripped.querySelector('[data-z10-id="n2"]') as Element;
        expect(span).not.toBeNull();
        expect(span.getAttribute('data-z10-ts-text')).toBeNull();
        ctx.cleanup?.();
      });

      it('stripForExport removes both IDs and timestamps', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = `
          <div data-z10-id="n1" data-z10-ts-node="5" class="card">
            <span data-z10-id="n2">text</span>
          </div>
        `;
        const root = ctx.document.body.firstElementChild as unknown as Element;
        const stripped = stripForExport(root);

        expect(stripped.getAttribute('data-z10-id')).toBeNull();
        expect(stripped.getAttribute('data-z10-ts-node')).toBeNull();
        expect(stripped.getAttribute('class')).toBe('card');
        expect(stripped.querySelector('[data-z10-id]')).toBeNull();
        ctx.cleanup?.();
      });
    });

    describe(`[${ctxName}] DOM API consistency`, () => {
      it('cloneNode(true) preserves all attributes', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="n1" data-z10-ts-node="5" class="x"><span data-z10-id="n2">text</span></div>';
        const original = ctx.document.body.firstElementChild as unknown as Element;
        const clone = original.cloneNode(true) as Element;

        expect(clone.getAttribute('data-z10-id')).toBe('n1');
        expect(clone.getAttribute('data-z10-ts-node')).toBe('5');
        expect(clone.getAttribute('class')).toBe('x');
        expect(clone.querySelector('[data-z10-id="n2"]')).not.toBeNull();
        expect(clone.querySelector('[data-z10-id="n2"]')!.textContent).toBe('text');
        ctx.cleanup?.();
      });

      it('querySelector finds by data-z10-id', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="root"><span data-z10-id="target">found</span></div>';
        const root = ctx.document.body.firstElementChild as unknown as Element;

        const found = root.querySelector('[data-z10-id="target"]');
        expect(found).not.toBeNull();
        expect(found!.textContent).toBe('found');
        ctx.cleanup?.();
      });

      it('insertBefore correctly positions elements', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="b">B</span></div>';
        const parent = ctx.document.querySelector('[data-z10-id="parent"]') as unknown as Element;
        const before = ctx.document.querySelector('[data-z10-id="b"]') as unknown as Element;
        const newEl = ctx.document.createElement('span') as unknown as Element;
        newEl.setAttribute('data-z10-id', 'a');
        newEl.textContent = 'A';

        parent.insertBefore(newEl, before);

        expect(parent.children.length).toBe(2);
        expect((parent.children[0] as Element).getAttribute('data-z10-id')).toBe('a');
        expect((parent.children[1] as Element).getAttribute('data-z10-id')).toBe('b');
        ctx.cleanup?.();
      });

      it('removeChild removes the correct element', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="parent"><span data-z10-id="child">x</span></div>';
        const parent = ctx.document.querySelector('[data-z10-id="parent"]') as unknown as Element;
        const child = ctx.document.querySelector('[data-z10-id="child"]') as unknown as Element;

        parent.removeChild(child);

        expect(parent.children.length).toBe(0);
        expect(ctx.document.querySelector('[data-z10-id="child"]')).toBeNull();
        ctx.cleanup?.();
      });

      it('style attribute handling via setProperty', () => {
        const ctx = factory();
        ctx.document.body.innerHTML = '<div data-z10-id="n1"></div>';
        const el = ctx.document.querySelector('[data-z10-id="n1"]') as unknown as HTMLElement;

        el.style.setProperty('font-size', '16px');
        el.style.setProperty('color', 'red');

        const style = el.getAttribute('style') || '';
        expect(style).toContain('font-size');
        expect(style).toContain('16px');
        expect(style).toContain('color');
        expect(style).toContain('red');
        ctx.cleanup?.();
      });

      it('template.innerHTML parses HTML correctly', () => {
        const ctx = factory();
        const template = ctx.document.createElement('template') as unknown as HTMLTemplateElement;
        template.innerHTML = '<div data-z10-id="new1" class="card">Hello</div>';

        const content = template.content || template;
        const firstChild = content.firstElementChild || content.firstChild;
        expect(firstChild).not.toBeNull();
        expect((firstChild as Element).getAttribute('data-z10-id')).toBe('new1');
        expect((firstChild as Element).textContent).toBe('Hello');
        ctx.cleanup?.();
      });
    });
  }

  // ── Cross-implementation consistency check ──

  describe('cross-implementation consistency', () => {
    it('replayPatch produces identical DOM output across implementations', () => {
      const ops: PatchOp[] = [
        { op: 'attr', id: 'title', name: 'class', value: 'heading' },
        { op: 'text', id: 'title', value: 'Updated Title' },
        { op: 'style', id: 'card', prop: 'background-color', value: 'blue' },
        { op: 'add', parentId: 'card', html: '<p data-z10-id="desc">Description</p>', before: null },
        { op: 'remove', id: 'old' },
      ];

      const html = `
        <div data-z10-id="card" style="padding: 10px">
          <h1 data-z10-id="title">Old Title</h1>
          <span data-z10-id="old">to be removed</span>
        </div>
      `;

      // Run against happy-dom
      const happy = createHappyDomContext();
      happy.document.body.innerHTML = html;
      replayPatch(ops, happy.document.body as unknown as Element);

      // Run against jsdom
      const jsdom = createJsdomContext();
      jsdom.document.body.innerHTML = html;
      replayPatch(ops, jsdom.document.body as unknown as Element);

      // Compare results
      const happyRoot = happy.document.body as unknown as Element;
      const jsdomRoot = jsdom.document.body as unknown as Element;

      // Title text
      expect(happyRoot.querySelector('[data-z10-id="title"]')!.textContent)
        .toBe(jsdomRoot.querySelector('[data-z10-id="title"]')!.textContent);

      // Title class
      expect(happyRoot.querySelector('[data-z10-id="title"]')!.getAttribute('class'))
        .toBe(jsdomRoot.querySelector('[data-z10-id="title"]')!.getAttribute('class'));

      // Old element removed
      expect(happyRoot.querySelector('[data-z10-id="old"]')).toBeNull();
      expect(jsdomRoot.querySelector('[data-z10-id="old"]')).toBeNull();

      // New element added
      expect(happyRoot.querySelector('[data-z10-id="desc"]')!.textContent)
        .toBe(jsdomRoot.querySelector('[data-z10-id="desc"]')!.textContent);

      // Style applied
      const happyCard = happyRoot.querySelector('[data-z10-id="card"]') as unknown as HTMLElement;
      const jsdomCard = jsdomRoot.querySelector('[data-z10-id="card"]') as unknown as HTMLElement;
      expect(happyCard.getAttribute('style')).toContain('background-color');
      expect(jsdomCard.getAttribute('style')).toContain('background-color');

      // Children count matches
      const happyCardEl = happyRoot.querySelector('[data-z10-id="card"]')!;
      const jsdomCardEl = jsdomRoot.querySelector('[data-z10-id="card"]')!;
      expect(happyCardEl.children.length).toBe(jsdomCardEl.children.length);

      happy.cleanup?.();
      jsdom.cleanup?.();
    });
  });
});
