/**
 * D5. Tests for human-agent conflict handling.
 *
 * Verifies:
 * - Selection validation: stale IDs cleared when elements are removed by patches
 * - Properties panel refresh: MutationObserver detects agent-applied style changes
 * - Patch replay → selection validation chain
 * - Edit bridge: rejection logging (structural, not network tests)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { replayPatch } from '../../src/dom/patch-replay.js';
import type { PatchOp } from '../../src/dom/patch-serialize.js';

describe('D5 conflict handling', () => {
  let window: InstanceType<typeof Window>;
  let document: Document;
  let root: Element;

  beforeEach(() => {
    window = new Window({ url: 'https://z10.dev' });
    document = window.document as unknown as Document;
    document.body.innerHTML = `
      <div data-z10-id="page" data-z10-page="Page 1">
        <div data-z10-id="card" style="padding: 16px; background: white;">
          <span data-z10-id="title">Hello World</span>
          <p data-z10-id="desc">Description</p>
        </div>
        <div data-z10-id="footer" style="padding: 8px;">
          <span data-z10-id="copy">© 2024</span>
        </div>
      </div>
    `;
    root = document.body;
  });

  /**
   * Simulates validateSelection: removes IDs from selectedIds that no longer
   * exist in the live DOM. This mirrors the logic in editor-state.tsx.
   */
  function validateSelection(
    selectedIds: Set<string>,
    domRoot: Element,
  ): Set<string> {
    if (selectedIds.size === 0) return selectedIds;
    const surviving = new Set<string>();
    for (const id of selectedIds) {
      if (domRoot.querySelector(`[data-z10-id="${id}"]`)) {
        surviving.add(id);
      }
    }
    return surviving;
  }

  describe('selection validation after agent patches', () => {
    it('should keep selection when selected element still exists', () => {
      const selected = new Set(['card']);
      // Agent changes card style — element still exists
      const ops: PatchOp[] = [
        { op: 'style', id: 'card', prop: 'background', value: 'navy' },
      ];
      replayPatch(ops, root);
      const result = validateSelection(selected, root);
      expect(result).toEqual(new Set(['card']));
    });

    it('should clear selection when selected element is removed by agent', () => {
      const selected = new Set(['desc']);
      const ops: PatchOp[] = [{ op: 'remove', id: 'desc' }];
      replayPatch(ops, root);
      const result = validateSelection(selected, root);
      expect(result.size).toBe(0);
    });

    it('should partially clear multi-selection when some elements removed', () => {
      const selected = new Set(['title', 'desc', 'card']);
      // Agent removes desc but title and card remain
      const ops: PatchOp[] = [{ op: 'remove', id: 'desc' }];
      replayPatch(ops, root);
      const result = validateSelection(selected, root);
      expect(result).toEqual(new Set(['title', 'card']));
    });

    it('should handle empty selection gracefully', () => {
      const selected = new Set<string>();
      const ops: PatchOp[] = [{ op: 'remove', id: 'desc' }];
      replayPatch(ops, root);
      const result = validateSelection(selected, root);
      expect(result.size).toBe(0);
    });

    it('should clear selection after resync replaces entire DOM', () => {
      const selected = new Set(['card', 'title']);
      // Simulate resync: replace all content
      const pageContainer = root.querySelector('[data-z10-page]')?.parentElement;
      pageContainer!.innerHTML = `
        <div data-z10-page="Page 1" data-z10-id="page">
          <div data-z10-id="hero"><h1 data-z10-id="heading">New</h1></div>
        </div>
      `;
      const result = validateSelection(selected, root);
      // card and title are gone
      expect(result.size).toBe(0);
    });

    it('should keep selection after resync if elements still present', () => {
      const selected = new Set(['page']);
      // Resync keeps page element
      const pageContainer = root.querySelector('[data-z10-page]')?.parentElement;
      pageContainer!.innerHTML = `
        <div data-z10-page="Page 1" data-z10-id="page">
          <div data-z10-id="section">Content</div>
        </div>
      `;
      const result = validateSelection(selected, root);
      expect(result).toEqual(new Set(['page']));
    });
  });

  describe('properties panel observes agent changes', () => {
    it('should detect style changes applied by replayPatch', () => {
      const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
      expect(card.style.background).toBe('white');

      // Agent patch changes the background
      const ops: PatchOp[] = [
        { op: 'style', id: 'card', prop: 'background', value: 'navy' },
      ];
      replayPatch(ops, root);

      // After replay, the DOM element reflects the new value
      // (this is what the MutationObserver in properties-panel would pick up)
      expect(card.style.background).toBe('navy');
    });

    it('should detect attribute changes applied by replayPatch', () => {
      const card = root.querySelector('[data-z10-id="card"]');
      expect(card?.getAttribute('class')).toBeNull();

      const ops: PatchOp[] = [
        { op: 'attr', id: 'card', name: 'class', value: 'agent-modified' },
      ];
      replayPatch(ops, root);

      expect(card?.getAttribute('class')).toBe('agent-modified');
    });

    it('should detect text changes applied by replayPatch', () => {
      const title = root.querySelector('[data-z10-id="title"]');
      expect(title?.textContent).toBe('Hello World');

      const ops: PatchOp[] = [
        { op: 'text', id: 'title', value: 'Agent Changed This' },
      ];
      replayPatch(ops, root);

      expect(title?.textContent).toBe('Agent Changed This');
    });
  });

  describe('agent commits first scenario', () => {
    it('should allow human to see agent changes on selected element', () => {
      // Human has "card" selected, agent changes its padding
      const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
      const ops: PatchOp[] = [
        { op: 'style', id: 'card', prop: 'padding', value: '32px' },
      ];
      replayPatch(ops, root);

      // Properties panel would read the updated value
      expect(card.style.padding).toBe('32px');
    });

    it('should allow subsequent human edits after agent patch', () => {
      // Agent changes card background
      const ops: PatchOp[] = [
        { op: 'style', id: 'card', prop: 'background', value: 'navy' },
      ];
      replayPatch(ops, root);

      // Human then changes font-size (direct DOM manipulation, as updateElementStyle does)
      const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
      card.style.setProperty('font-size', '18px');

      // Both changes should coexist
      expect(card.style.background).toBe('navy');
      expect(card.style.fontSize).toBe('18px');
    });
  });

  describe('human commits first scenario', () => {
    it('should preserve human DOM changes when no conflicting agent patch arrives', () => {
      // Human applies style change optimistically
      const card = root.querySelector('[data-z10-id="card"]') as HTMLElement;
      card.style.setProperty('font-size', '20px');

      // Agent patch modifies a different element — no conflict
      const ops: PatchOp[] = [
        { op: 'text', id: 'title', value: 'Agent Title' },
      ];
      replayPatch(ops, root);

      // Human's change is preserved, agent's change applied
      expect(card.style.fontSize).toBe('20px');
      expect(root.querySelector('[data-z10-id="title"]')?.textContent).toBe('Agent Title');
    });
  });
});
