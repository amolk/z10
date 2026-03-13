import { describe, it, expect, beforeEach } from 'vitest';
import { Window } from 'happy-dom';
import { reconcileChildren } from '../../src/dom/reconcile.js';
import { createIdGenerator } from '../../src/dom/node-ids.js';

let window: InstanceType<typeof Window>;
let document: Document;

beforeEach(() => {
  window = new Window();
  document = window.document as unknown as Document;
});

describe('reconcileChildren', () => {
  it('removes children missing from sandbox', () => {
    document.body.innerHTML = `
      <div id="live"><span data-z10-id="a">A</span><span data-z10-id="b">B</span></div>
      <div id="sandbox"><span data-z10-id="a">A</span></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    const result = reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    expect(result.removed).toContain('b');
    expect(live.children.length).toBe(1);
    expect((live.children[0] as Element).getAttribute('data-z10-id')).toBe('a');
  });

  it('adds new children from sandbox', () => {
    document.body.innerHTML = `
      <div id="live"><span data-z10-id="a">A</span></div>
      <div id="sandbox"><span data-z10-id="a">A</span><span>New</span></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    const result = reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    expect(result.added.length).toBeGreaterThan(0);
    expect(live.children.length).toBe(2);
    expect((live.children[1] as Element).getAttribute('data-z10-id')).toBeTruthy();
  });

  it('reorders existing children', () => {
    document.body.innerHTML = `
      <div id="live"><span data-z10-id="a">A</span><span data-z10-id="b">B</span></div>
      <div id="sandbox"><span data-z10-id="b">B</span><span data-z10-id="a">A</span></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    expect((live.children[0] as Element).getAttribute('data-z10-id')).toBe('b');
    expect((live.children[1] as Element).getAttribute('data-z10-id')).toBe('a');
  });

  it('handles empty sandbox (removes all children)', () => {
    document.body.innerHTML = `
      <div id="live"><span data-z10-id="a">A</span><span data-z10-id="b">B</span></div>
      <div id="sandbox"></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    const result = reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    expect(result.removed).toContain('a');
    expect(result.removed).toContain('b');
    expect(live.children.length).toBe(0);
  });

  it('handles empty live (adds all sandbox children)', () => {
    document.body.innerHTML = `
      <div id="live"></div>
      <div id="sandbox"><span>A</span><span>B</span></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    const result = reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    expect(result.added.length).toBe(2);
    expect(live.children.length).toBe(2);
  });

  it('assigns IDs to nested new elements', () => {
    document.body.innerHTML = `
      <div id="live"></div>
      <div id="sandbox"><div><span>nested</span></div></div>
    `;
    const live = document.getElementById('live') as unknown as Element;
    const sandbox = document.getElementById('sandbox') as unknown as Element;

    const result = reconcileChildren(sandbox, live, 10, createIdGenerator('new-', 1));

    // Both the div and span should get IDs
    expect(result.added.length).toBe(2);
    const addedDiv = live.children[0] as Element;
    expect(addedDiv.getAttribute('data-z10-id')).toBeTruthy();
    const nestedSpan = addedDiv.querySelector('span') as Element;
    expect(nestedSpan.getAttribute('data-z10-id')).toBeTruthy();
  });
});
